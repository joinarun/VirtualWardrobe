#!/usr/bin/env python3
"""Plan a fixed synthetic logging probe; --probe writes, --verify reads evidence.

No app fault endpoint or notification recipient is created. Existing user ADC
authenticates the Logging/Monitoring API calls; tokens never leave memory.
"""
import argparse
import datetime as dt
import json
from pathlib import Path
import re
import tempfile
import uuid
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from deploy import Deployment, EXPECTED_PROJECT, ROOT
from observability import DISPLAY, METRIC

API = "virtualwardrobe-demo-api"
REGION = "asia-south1"
LOG_NAME = f"projects/{EXPECTED_PROJECT}/logs/virtualwardrobe-release-probe"
PAYLOAD = {"code": "RELEASE_PROBE", "vw_failure": True, "synthetic_probe": True}


class ProbeFailure(RuntimeError):
    pass


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def adc_request(deployment, method, url, payload=None):
    token = deployment.value("auth", "application-default", "print-access-token")
    data = None if payload is None else json.dumps(payload).encode()
    request = Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {token}", "Content-Type": "application/json",
        "x-goog-user-project": EXPECTED_PROJECT})
    try:
        with urlopen(request, timeout=45) as response:
            value = response.read(2_000_000)
            return json.loads(value) if value else {}
    except HTTPError as error:
        status = error.code
        error.close()
        raise ProbeFailure(f"Monitoring API returned HTTP{status}; response withheld") from None


def write_report(path, value):
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                     prefix=".monitoring-probe-", delete=False) as stream:
        temporary = Path(stream.name)
        json.dump(value, stream, indent=2); stream.write("\n")
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def deployed_revision(deployment, inventory):
    if (inventory.get("project_id") != EXPECTED_PROJECT or inventory.get("region") != REGION or
            inventory.get("environment") != "demo" or
            inventory.get("resources", {}).get("cloud_run_api") != API or
            not re.fullmatch(r"[0-9a-f]{40}", inventory.get("source_revision", ""))):
        raise ProbeFailure("A valid committed VirtualWardrobe demo deployment inventory is required")
    service = json.loads(deployment.value("run", "services", "describe", API, "--region", REGION, "--format=json"))
    revision = service.get("status", {}).get("latestReadyRevisionName", "")
    traffic = service.get("status", {}).get("traffic", [])
    image = service.get("spec", {}).get("template", {}).get("spec", {}).get("containers", [{}])[0].get("image")
    recorded = inventory.get("runtime", {}).get("api", {})
    if (service.get("metadata", {}).get("name") != API or
            not re.fullmatch(re.escape(API) + r"-[a-z0-9-]{1,40}", revision) or
            recorded.get("ready_revision") != revision or
            image not in (inventory.get("image"), recorded.get("image_digest")) or
            sum(item.get("percent", 0) for item in traffic if item.get("revisionName") == revision) != 100):
        raise ProbeFailure("The exact inventory image must be ready with100 percent traffic on its API revision")
    actual = json.loads(deployment.value("run", "revisions", "describe", revision, "--region", REGION, "--format=json"))
    if actual.get("status", {}).get("imageDigest") != recorded.get("image_digest") or not re.search(
            r"(?:^|@)sha256:[0-9a-f]{64}$", recorded.get("image_digest", "")):
        raise ProbeFailure("The deployed API revision's immutable digest must match its inventory")
    return revision


def resource(revision):
    return {"type": "cloud_run_revision", "labels": {"project_id": EXPECTED_PROJECT,
        "location": REGION, "service_name": API, "configuration_name": API, "revision_name": revision}}


def emit(deployment, inventory, path):
    revision = deployed_revision(deployment, inventory)
    if path.exists():
        previous = json.loads(path.read_text())
        if (previous.get("project_id") == EXPECTED_PROJECT and previous.get("revision") == revision and
                previous.get("status") in ("SENDING", "SENT", "UNKNOWN_OUTCOME")):
            raise ProbeFailure("This revision already has a sent or unknown probe; use --verify instead of duplicating it")
    receipt = {"project_id": EXPECTED_PROJECT, "revision": revision,
        "source_revision": inventory["source_revision"], "insert_id": "vw-release-probe-" + uuid.uuid4().hex,
        "timestamp": now(), "status": "SENDING", "synthetic_probe": True}
    write_report(path, receipt)
    try:
        adc_request(deployment, "POST", "https://logging.googleapis.com/v2/entries:write", {
            "logName": LOG_NAME, "resource": resource(revision), "partialSuccess": False,
            "entries": [{"insertId": receipt["insert_id"], "timestamp": receipt["timestamp"],
                         "severity": "ERROR", "jsonPayload": PAYLOAD}]})
    except Exception:
        receipt["status"] = "UNKNOWN_OUTCOME"; write_report(path, receipt)
        raise
    receipt["status"] = "SENT"; write_report(path, receipt)
    return dict(receipt, verification="Probe submitted; log/metric/incident ingestion is not yet proven")


def verify(deployment, inventory, path):
    revision = deployed_revision(deployment, inventory)
    receipt = json.loads(path.read_text())
    if (receipt.get("project_id") != EXPECTED_PROJECT or receipt.get("revision") != revision or
            receipt.get("source_revision") != inventory["source_revision"] or
            not re.fullmatch(r"vw-release-probe-[0-9a-f]{32}", receipt.get("insert_id", ""))):
        raise ProbeFailure("Probe receipt must match the current exact deployed revision")
    started = dt.datetime.fromisoformat(receipt["timestamp"].replace("Z", "+00:00"))
    if started.tzinfo is None or started > dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=1):
        raise ProbeFailure("Probe receipt timestamp is invalid")
    start = (started - dt.timedelta(seconds=60)).isoformat().replace("+00:00", "Z")
    entries = adc_request(deployment, "POST", "https://logging.googleapis.com/v2/entries:list", {
        "resourceNames": [f"projects/{EXPECTED_PROJECT}"], "pageSize": 10,
        "filter": f'logName="{LOG_NAME}" AND insertId="{receipt["insert_id"]}" '
                  f'AND resource.labels.revision_name="{revision}" AND timestamp>="{start}"'})
    found = any(entry.get("jsonPayload") == PAYLOAD and entry.get("resource") == resource(revision)
                for entry in entries.get("entries", []))
    query = urlencode({"filter": f'metric.type="logging.googleapis.com/user/{METRIC}" AND resource.type="cloud_run_revision" '
                      f'AND resource.labels.service_name="{API}" AND resource.labels.revision_name="{revision}"',
                      "interval.startTime": start, "interval.endTime": now(), "view": "FULL", "pageSize": 100})
    series = adc_request(deployment, "GET", f"https://monitoring.googleapis.com/v3/projects/{EXPECTED_PROJECT}/timeSeries?{query}")
    points = sum(int(point.get("value", {}).get("int64Value", 0))
                 for item in series.get("timeSeries", []) for point in item.get("points", []))
    configured = json.loads((deployment.work / "observability.json").read_text())
    name = configured.get("policy_name", "")
    if not re.fullmatch(rf"projects/{EXPECTED_PROJECT}/alertPolicies/[0-9]+", name):
        raise ProbeFailure("The scoped observability policy receipt is required")
    policy = adc_request(deployment, "GET", "https://monitoring.googleapis.com/v3/" + name)
    policy_ready = policy.get("displayName") == DISPLAY and policy.get("enabled") is True and not policy.get("notificationChannels")
    report = {"project_id": EXPECTED_PROJECT, "revision": revision, "checked_at": now(),
              "synthetic_probe": True, "log_entry_observed": found, "failure_metric_points": points,
              "scoped_policy_enabled_without_recipients": policy_ready,
              "automated_checks_passed": found and points > 0 and policy_ready,
              "incident_status": "REQUIRES_CONSOLE_INSPECTION",
              "console": f"https://console.cloud.google.com/monitoring/alerting?project={EXPECTED_PROJECT}"}
    write_report(deployment.work / "monitoring-probe-verification.json", report)
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--inventory", type=Path, default=ROOT / "work/gcp/deployment.json")
    execution = parser.add_mutually_exclusive_group()
    execution.add_argument("--probe", action="store_true", help="Write the one fixed synthetic event explicitly")
    execution.add_argument("--verify", action="store_true", help="Read the submitted probe's log/metric/policy evidence")
    args = parser.parse_args(argv)
    if args.project != EXPECTED_PROJECT:
        parser.error("Only the exact reviewed VirtualWardrobe project is allowed")
    if not (args.probe or args.verify):
        print(json.dumps({"project_id": EXPECTED_PROJECT, "executes": False, "payload": PAYLOAD,
            "write": "Explicit --probe; existing user ADC, actual inventory image/API revision with100 percent traffic",
            "verify": "--verify reads log/metric/policy; inspect actual incidents separately in Console",
            "new_endpoint_or_recipients": False}, indent=2)); return 0
    try:
        deployment = Deployment(json.loads((ROOT / "infra/gcp-demo.json").read_text()))
        inventory = json.loads(args.inventory.read_text())
        path = deployment.work / "monitoring-probe.json"
        report = emit(deployment, inventory, path) if args.probe else verify(deployment, inventory, path)
        print(json.dumps(report, indent=2))
        return 0 if args.probe or report["automated_checks_passed"] else 1
    except Exception as error:
        print(json.dumps({"status": "FAILED", "detail": str(error) if isinstance(error, ProbeFailure)
                          else "Probe operation failed; raw cloud/token/response output withheld",
                          "failure_type": type(error).__name__}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
