"""Controlled release tools checks; never authenticate, deploy or call cloud APIs."""
import contextlib
import datetime
import importlib.util
import io
import http.server
import json
import subprocess
import socket
import threading
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError


def module(filename, name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value)
    return value


PROBE = module("monitoring-probe.py", "vw_monitoring_probe")
SMOKE = module("smoke.py", "vw_release_smoke")
PERFORMANCE = module("performance.py", "vw_release_performance")


@contextlib.contextmanager
def local_keepalive_server():
    class Server(http.server.ThreadingHTTPServer):
        request_queue_size = 64
        daemon_threads = True

    class Handler(http.server.BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def setup(self):
            super().setup()
            self.connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)

        def log_message(self, *args):
            pass

        def do_GET(self):
            with self.server.records_lock:
                port = self.client_address[1]
                self.server.records.append((port, self.path))
                counts = self.server.counts
                counts[port] = counts.get(port, 0) + 1
                if counts[port] == 4:
                    self.server.measured_start_counts.append(dict(counts))
            if self.path == "/disconnect":
                self.close_connection = True
                self.connection.shutdown(socket.SHUT_RDWR)
                return
            payload = b"not-json" if self.path == "/invalid-json" else b'{"ok":true}'
            self.send_response(503 if self.path == "/unavailable" else 200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    server = Server(("127.0.0.1", 0), Handler)
    server.records = []; server.counts = {}; server.measured_start_counts = []
    server.records_lock = threading.Lock()
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server, "http://127.0.0.1:" + str(server.server_address[1])
    finally:
        server.shutdown(); server.server_close(); thread.join(timeout=2)


class ReleaseToolsTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="vw-release-test-")
        self.addCleanup(temporary.cleanup)
        self.work = Path(temporary.name)
        self.revision = "virtualwardrobe-demo-api-00001-test"
        self.inventory = {"project_id": "virtualtryon-511016", "region": "asia-south1", "environment": "demo",
            "source_revision": "a" * 40, "image": "asia-south1-docker.pkg.dev/virtualtryon-511016/virtualwardrobe/backend:aaaa",
            "resources": {"cloud_run_api": "virtualwardrobe-demo-api"},
            "web_url": "https://virtualwardrobe-511016.web.app",
            "api_url": "https://virtualwardrobe-demo-api-321689154843.asia-south1.run.app",
            "worker_url": "https://virtualwardrobe-demo-worker-321689154843.asia-south1.run.app"}
        self.inventory["runtime"] = {"api": {"ready_revision": self.revision,
                                            "image_digest": "repo/backend@sha256:" + "b" * 64}}
        service = {"metadata": {"name": "virtualwardrobe-demo-api"},
            "spec": {"template": {"spec": {"containers": [{"image": self.inventory["image"]}]}}},
            "status": {"latestReadyRevisionName": self.revision,
                       "traffic": [{"revisionName": self.revision, "percent": 100}]}}
        def value(*args):
            if args[:2] == ("run", "revisions"):
                return json.dumps({"status": {"imageDigest": self.inventory["runtime"]["api"]["image_digest"]}})
            return json.dumps(service)
        self.deployment = SimpleNamespace(work=self.work, value=Mock(side_effect=value))

    def test_probe_is_plan_only_and_wrong_project_is_rejected_before_any_access(self):
        output = io.StringIO()
        with patch.object(PROBE, "Deployment") as deployment, contextlib.redirect_stdout(output):
            self.assertEqual(PROBE.main(["--project", "virtualtryon-511016"]), 0)
        self.assertFalse(json.loads(output.getvalue())["executes"])
        deployment.assert_not_called()
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            PROBE.main(["--project", "proofroom-506314", "--probe"])

    def test_exact_deployed_revision_and_image_are_required(self):
        self.assertEqual(PROBE.deployed_revision(self.deployment, self.inventory), self.revision)
        for key, value in (("project_id", "other-project"), ("region", "us-central1"),
                           ("image", "foreign"), ("source_revision", "dirty")):
            with self.assertRaises(PROBE.ProbeFailure):
                PROBE.deployed_revision(self.deployment, dict(self.inventory, **{key: value}))

    def test_fixed_probe_is_journaled_before_write_and_not_duplicated(self):
        path = self.work / "probe.json"
        def submitted(deployment, method, url, payload):
            self.assertEqual(json.loads(path.read_text())["status"], "SENDING")
            self.assertEqual(url, "https://logging.googleapis.com/v2/entries:write")
            self.assertEqual(payload["entries"][0]["jsonPayload"], PROBE.PAYLOAD)
            self.assertEqual(payload["resource"], PROBE.resource(self.revision))
            return {}
        with patch.object(PROBE, "adc_request", side_effect=submitted) as api:
            receipt = PROBE.emit(self.deployment, self.inventory, path)
            self.assertEqual(receipt["status"], "SENT")
            with self.assertRaises(PROBE.ProbeFailure):
                PROBE.emit(self.deployment, self.inventory, path)
        self.assertEqual(api.call_count, 1)
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_ambiguous_probe_failure_is_journaled_and_cannot_be_blindly_repeated(self):
        path = self.work / "probe.json"
        with patch.object(PROBE, "adc_request", side_effect=TimeoutError("private-cloud-output")):
            with self.assertRaises(TimeoutError):
                PROBE.emit(self.deployment, self.inventory, path)
        self.assertEqual(json.loads(path.read_text())["status"], "UNKNOWN_OUTCOME")
        self.assertNotIn("private-cloud-output", path.read_text())
        with patch.object(PROBE, "adc_request") as api, self.assertRaises(PROBE.ProbeFailure):
            PROBE.emit(self.deployment, self.inventory, path)
        api.assert_not_called()

    def test_verification_observes_log_metric_policy_but_does_not_claim_incident(self):
        path = self.work / "probe.json"
        with patch.object(PROBE, "adc_request", return_value={}):
            PROBE.emit(self.deployment, self.inventory, path)
        (self.work / "observability.json").write_text(json.dumps({"policy_name": "projects/virtualtryon-511016/alertPolicies/123"}))
        responses = [{"entries": [{"jsonPayload": PROBE.PAYLOAD, "resource": PROBE.resource(self.revision)}]},
            {"timeSeries": [{"points": [{"value": {"int64Value": "1"}}]}]},
            {"displayName": PROBE.DISPLAY, "enabled": True, "notificationChannels": []}]
        with patch.object(PROBE, "adc_request", side_effect=responses):
            report = PROBE.verify(self.deployment, self.inventory, path)
        self.assertTrue(report["automated_checks_passed"])
        self.assertEqual(report["incident_status"], "REQUIRES_CONSOLE_INSPECTION")

    def test_http_error_never_exposes_token_or_response_body(self):
        deployment = SimpleNamespace(value=Mock(return_value="private-token-value"))
        error = HTTPError("https://logging.googleapis.com/v2/entries:write", 403, "secret-raw-reason", None, io.BytesIO(b"private-body"))
        with patch.object(PROBE, "urlopen", side_effect=error):
            with self.assertRaises(PROBE.ProbeFailure) as raised:
                PROBE.adc_request(deployment, "POST", "https://logging.googleapis.com/v2/entries:write", {})
        self.assertEqual(str(raised.exception), "Monitoring API returned HTTP403; response withheld")
        self.assertEqual(deployment.value.call_args.args, ("auth", "application-default", "print-access-token"))

    def test_smoke_allows_only_exact_project_and_owned_https_origins(self):
        self.assertEqual(SMOKE.origins(self.inventory)[0], "https://virtualwardrobe-511016.web.app")
        for key, value in (("project_id", "proofroom-506314"), ("web_url", "https://virtualtryon-511016.web.app"),
                           ("api_url", "https://stylereel.example.run.app"),
                           ("worker_url", "https://virtualwardrobe-demo-worker-test.run.app/private?token=secret"),
                           ("api_url", "https://user:secret@virtualwardrobe-demo-api-test.run.app")):
            with self.assertRaises(ValueError):
                SMOKE.origins(dict(self.inventory, **{key: value}))


class PerformanceToolsTest(unittest.TestCase):
    def test_api_threshold_uses_raw_percentile_and_fails_on_any_error(self):
        sample = PERFORMANCE.summarize([{"status": 200, "ms": 750.004}] * 20)
        self.assertEqual(sample["p95_ms"], 750.0)
        self.assertEqual(sample["p95_raw_ms"], 750.004)
        self.assertFalse(PERFORMANCE.measurement_passes(sample))
        self.assertTrue(PERFORMANCE.measurement_passes({"p95_raw_ms": 750, "errors": 0}))
        for value in [750.000001, float("nan"), float("inf"), None, True]:
            self.assertFalse(PERFORMANCE.measurement_passes({"p95_raw_ms": value, "errors": 0}))
        self.assertFalse(PERFORMANCE.measurement_passes({"p95_raw_ms": 1, "errors": 1}))

    def test_startup_query_uses_exact_utc_window_and_inventory_revision(self):
        start = datetime.datetime(2026, 10, 27, 1, 2, 3, 456000, datetime.timezone.utc)
        end = start + datetime.timedelta(milliseconds=1234)
        revision = "virtualwardrobe-demo-api-00001-test"
        query, actual = PERFORMANCE.startup_query({"runtime": {"api": {"ready_revision": revision}}}, start, end)
        self.assertEqual(actual, revision)
        self.assertIn('resource.labels.revision_name="' + revision + '"', query)
        self.assertIn('timestamp>="' + start.isoformat() + '"', query)
        self.assertIn('timestamp<="' + end.isoformat() + '"', query)
        self.assertNotIn((start - datetime.timedelta(seconds=5)).isoformat(), query)
        self.assertIsNone(PERFORMANCE.startup_query({}, start, end)[1])
        with self.assertRaises(ValueError):
            PERFORMANCE.startup_query({"runtime": {"api": {"ready_revision": 'foreign" OR true'}}}, start, end)

    def test_api_default_plan_does_not_read_inventory_or_send_traffic(self):
        output = io.StringIO()
        with patch.object(PERFORMANCE, "fetch") as fetch, patch.object(PERFORMANCE.Path, "read_text", side_effect=AssertionError("plan read inventory")), contextlib.redirect_stdout(output):
            self.assertEqual(PERFORMANCE.main(["--inventory", "/absent-inventory.json"]), 0)
        fetch.assert_not_called()
        plan = json.loads(output.getvalue())
        self.assertEqual((plan["concurrent_users"], plan["measured_requests"], plan["warm_api_p95_limit_ms"]), (20, 400, 750))
        self.assertFalse(plan["mutations"])
        self.assertEqual(plan["transport"]["persistent_clients"], 20)
        self.assertEqual(plan["transport"]["automatic_request_retries"], 0)
        self.assertEqual(plan["warmup"], {"per_user": 3, "total": 60, "same_connection_as_measured": True,
                                         "measured_start": "barrier after all users complete warm-up"})

    def test_twenty_users_reuse_independent_connections_across_sixty_warmup_and_four_hundred_reads(self):
        with local_keepalive_server() as (server, base):
            warmup, measured, duration = PERFORMANCE.run_load(base, [("browse", "/catalog"), ("search", "/search")], 20)
            self.assertEqual((len(warmup), len(measured), len(server.records)), (60, 400, 460))
            self.assertTrue(all(sample["status"] == 200 for sample in warmup + measured))
            self.assertEqual(len(server.counts), 20)
            self.assertEqual(set(server.counts.values()), {23})
            self.assertEqual(len(server.measured_start_counts), 20)
            self.assertTrue(all(len(counts) == 20 and min(counts.values()) >= 3 for counts in server.measured_start_counts))
            self.assertGreater(duration, 0)

    def test_transport_failure_is_counted_once_and_only_later_scheduled_read_reconnects(self):
        with local_keepalive_server() as (server, base):
            client = PERFORMANCE.PersistentReadClient(base)
            try:
                failed, payload = client.fetch("/disconnect")
                self.assertEqual(failed["status"], 0); self.assertIsNone(payload)
                successful, _ = client.fetch("/ok")
                self.assertEqual(successful["status"], 200)
                self.assertEqual([path for _, path in server.records], ["/disconnect", "/ok"])
                unavailable, _ = client.fetch("/unavailable")
                self.assertEqual(unavailable["status"], 503)
                invalid, _ = client.fetch("/invalid-json")
                self.assertEqual(invalid["status"], 0)
                recovered, _ = client.fetch("/ok")
                self.assertEqual(recovered["status"], 200)
                self.assertEqual(len(server.records), 5)
            finally:
                client.close()

    def test_failed_warmup_never_starts_measured_requests(self):
        with local_keepalive_server() as (server, base):
            warmup, measured, _ = PERFORMANCE.run_load(base, [("browse", "/unavailable")], 20)
            self.assertEqual(len(warmup), 60)
            self.assertTrue(all(sample["status"] == 503 for sample in warmup))
            self.assertEqual(measured, [])
            self.assertEqual(len(server.records), 60)

    def test_mobile_threshold_total_and_default_profile_are_controlled_without_browser(self):
        script = Path(__file__).with_name("performance-mobile.mjs").resolve()
        # Importing this module must not load inventory, browser dependencies or fetch.
        command = """globalThis.fetch = () => { throw Error('NETWORK_REFUSED'); };
const m = await import(process.argv[1]);
const output = {
 valid: [1000, 1001].map(m.validCatalogTotal),
 invalid: [undefined, null, '1000', true, 999, 1000.5, NaN, Infinity].map(m.validCatalogTotal),
 boundary: m.mobileMeasurementPasses(3000, 0),
 over: m.mobileMeasurementPasses(3000.001, 0),
 nan: m.mobileMeasurementPasses(NaN, 0),
 error: m.mobileMeasurementPasses(1, 1), plan: m.mobilePlan()
}; console.log(JSON.stringify(output));"""
        result = subprocess.run(["node", "--input-type=module", "-e", command, script.as_uri()], capture_output=True, text=True, check=True)
        value = json.loads(result.stdout)
        self.assertEqual(value["valid"], [True, True]); self.assertFalse(any(value["invalid"]))
        self.assertTrue(value["boundary"]); self.assertFalse(value["over"] or value["nan"] or value["error"])
        plan = value["plan"]; self.assertEqual(plan["runs"], 5); self.assertFalse(plan["mutations"])
        profile = plan["profile"]
        self.assertEqual(profile["viewport"], {"width": 390, "height": 844})
        self.assertEqual((profile["deviceScaleFactor"], profile["cpuSlowdown"], profile["downloadMbps"], profile["uploadMbps"], profile["latencyMs"], profile["usableLimitMs"]), (2, 4, 9, 1.6, 150, 3000))
        self.assertEqual(profile["backend"], "five ordinary API reads before browser timing")
        planned = subprocess.run(["node", str(script), "--inventory", "/absent-inventory.json"], capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(planned.stdout)["runs"], 5)


if __name__ == "__main__":
    unittest.main()
