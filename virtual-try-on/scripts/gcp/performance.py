#!/usr/bin/env python3
"""Bounded public-read load check. Default prints a plan; --run sends traffic."""
import argparse
import concurrent.futures
import datetime
import json
import http.client
import math
from pathlib import Path
import platform
import re
import statistics
import ssl
import subprocess
import threading
import time
from urllib.parse import urlsplit
from smoke import origins

ROOT = Path(__file__).resolve().parents[2]
PROJECT = "virtualtryon-511016"


def percentile(values, fraction):
    return sorted(values)[max(0, math.ceil(len(values) * fraction) - 1)] if values else None


class PersistentReadClient:
    """One user's HTTP/1.1 client. Requests are never retried; later reads may reconnect."""
    def __init__(self, base, tls_context=None):
        target = urlsplit(base)
        if target.scheme not in ("http", "https") or not target.hostname or target.username or target.password or target.query or target.fragment or target.path not in ("", "/"):
            raise ValueError("A plain HTTP(S) origin is required")
        if target.scheme == "https":
            self.connection = http.client.HTTPSConnection(target.hostname, target.port, timeout=60,
                                                          context=tls_context or ssl.create_default_context())
        else:
            self.connection = http.client.HTTPConnection(target.hostname, target.port, timeout=60)

    def fetch(self, path):
        started = time.perf_counter()
        try:
            self.connection.request("GET", path, headers={"Accept": "application/json", "Cache-Control": "no-cache",
                                    "User-Agent": "VirtualWardrobe-Release-Performance/1", "Connection": "keep-alive"})
            response = self.connection.getresponse()
            payload = response.read(2_000_001)
            if len(payload) > 2_000_000:
                raise ValueError("Response exceeds the measurement byte limit")
            status = response.status
            value = json.loads(payload) if status == 200 else None
            return {"status": status, "ms": (time.perf_counter() - started) * 1000}, value
        except (OSError, http.client.HTTPException, ValueError):
            # Never repeat this request. A later scheduled read may establish a
            # new socket, just as a browser does after an expired connection.
            self.close()
            return {"status": 0, "ms": (time.perf_counter() - started) * 1000}, None

    def close(self):
        self.connection.close()


def fetch(base, path):
    """Independent first observation; its connection is not one of the warm user sessions."""
    started = time.perf_counter()
    client = PersistentReadClient(base)
    try:
        sample, payload = client.fetch(path)
        sample["ms"] = (time.perf_counter() - started) * 1000
        return sample, payload
    finally:
        client.close()


def run_load(base, endpoints, requests_per_user, users=20):
    # SSLContext is configured once and never mutated while shared. Each worker
    # owns its separate connection/client for its warm-up and measured reads.
    tls_context = ssl.create_default_context()
    warm_by_user = [None] * users
    warm_failed = threading.Event()
    measurement_started = [None]
    barrier = threading.Barrier(users, action=lambda: measurement_started.__setitem__(0, time.perf_counter()))

    def user(index):
        client = PersistentReadClient(base, tls_context)
        try:
            warm = []
            for offset in range(3):
                sample, _ = client.fetch(endpoints[(index + offset) % len(endpoints)][1])
                warm.append(sample)
                if sample["status"] != 200:
                    warm_failed.set()
            warm_by_user[index] = warm
            try:
                barrier.wait(timeout=30)
            except threading.BrokenBarrierError:
                warm_failed.set()
                return []
            if warm_failed.is_set():
                return []
            samples = []
            for offset in range(requests_per_user):
                name, path = endpoints[(index + offset) % len(endpoints)]
                sample, _ = client.fetch(path)
                samples.append(dict(sample, endpoint=name))
            return samples
        finally:
            client.close()

    with concurrent.futures.ThreadPoolExecutor(max_workers=users) as pool:
        samples = [sample for group in pool.map(user, range(users)) for sample in group]
    duration = time.perf_counter() - measurement_started[0] if measurement_started[0] is not None else 0
    warmup = [sample for group in warm_by_user if group is not None for sample in group]
    if warm_failed.is_set() or len(warmup) != users * 3:
        return warmup, [], duration
    return warmup, samples, duration


def summarize(selected):
    values = [sample["ms"] for sample in selected]
    raw_p95 = percentile(values, .95)
    return {"count": len(selected), "errors": sum(sample["status"] != 200 for sample in selected),
            "p50_ms": round(statistics.median(values), 2), "p95_ms": round(raw_p95, 2),
            "p95_raw_ms": raw_p95, "max_ms": round(max(values), 2)}


def measurement_passes(summary):
    value = summary.get("p95_raw_ms")
    return (summary.get("errors") == 0 and isinstance(value, (int, float))
            and not isinstance(value, bool) and math.isfinite(value) and 0 <= value <= 750)


def startup_query(inventory, started, ended):
    revision = inventory.get("runtime", {}).get("api", {}).get("ready_revision")
    if revision is not None and not re.fullmatch(r"virtualwardrobe-demo-api-[a-z0-9-]+", revision):
        raise ValueError("The inventory API revision is invalid")
    query = ('resource.type="cloud_run_revision" AND resource.labels.service_name="virtualwardrobe-demo-api" '
             'AND logName="projects/' + PROJECT + '/logs/run.googleapis.com%2Fvarlog%2Fsystem" '
             'AND textPayload:"Starting new instance" AND timestamp>="' + started.isoformat() +
             '" AND timestamp<="' + ended.isoformat() + '"')
    if revision:
        query += ' AND resource.labels.revision_name="' + revision + '"'
    return query, revision


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true")
    parser.add_argument("--inventory", type=Path, default=ROOT / "work/gcp/deployment.json")
    parser.add_argument("--requests-per-user", type=int, default=20)
    parser.add_argument("--client-location", default="Operator workstation; network location must be recorded in release evidence")
    parser.add_argument("--read-startup-logs", action="store_true", help="Read only app startup system-log timestamps for the first request")
    args = parser.parse_args(argv)
    if not 10 <= args.requests_per_user <= 25:
        parser.error("Use 10–25 requests per user; concurrency is fixed at 20")
    plan = {"concurrent_users": 20, "measured_requests": 20 * args.requests_per_user,
            "minimum_catalog_rows": 1000, "warm_api_p95_limit_ms": 750,
            "transport": {"protocol": "HTTP/1.1", "persistent_clients": 20, "connection_ownership": "one independent client per user",
                          "shared_ssl_context": True, "automatic_request_retries": 0, "redirects_followed": False,
                          "reconnect": "only a later scheduled read may reconnect after peer close or a counted failure"},
            "warmup": {"per_user": 3, "total": 60, "same_connection_as_measured": True,
                       "measured_start": "barrier after all users complete warm-up"},
            "excluded": ["media transfer", "AI generation"],
            "first_observation": "Recorded separately; a cold start is claimed only with matching server startup evidence",
            "mutations": False}
    if not args.run:
        print(json.dumps(plan, indent=2)); return 0
    inventory = json.loads(args.inventory.read_text())
    try:
        _, base, _ = origins(inventory)
    except ValueError:
        parser.error("The intended project's exact deployed VirtualWardrobe origins are required")
    first_started = datetime.datetime.now(datetime.timezone.utc)
    first, catalog = fetch(base, "/api/v1/products?size=1")
    first_ended = datetime.datetime.now(datetime.timezone.utc)
    if first["status"] != 200 or not isinstance(catalog, dict) or catalog.get("total", 0) < 1000 or not catalog.get("items"):
        parser.error("A successful published catalog with at least 1,000 rows is required; seed the separate performance dataset first")
    product_id = catalog["items"][0]["id"]
    endpoints = [("browse", "/api/v1/products?page=0&size=24"),
                 ("search", "/api/v1/products?q=saree&page=0&size=24"),
                 ("product", "/api/v1/products/" + product_id),
                 ("categories", "/api/v1/categories"), ("brands", "/api/v1/brands")]
    # Three warm-up reads per user retain that same user's connection for the
    # measured phase. All 20 users meet at a barrier before measurements begin.
    warmup, samples, duration = run_load(base, endpoints, args.requests_per_user)
    if len(warmup) != 60 or any(sample["status"] != 200 for sample in warmup) or not samples:
        parser.error("Warm-up returned an error; inspect the deployment before running the load sample")
    summaries = {}
    for name in ["all"] + [name for name, _ in endpoints]:
        selected = [s for s in samples if name == "all" or s["endpoint"] == name]
        summaries[name] = summarize(selected)
    startup = {"status": "not_checked", "note": "First-observed latency alone does not establish a cold start"}
    if args.read_startup_logs:
        query, revision = startup_query(inventory, first_started, first_ended)
        result = subprocess.run(["gcloud", "logging", "read", query, "--project", PROJECT, "--limit=20",
                                 "--format=json(timestamp,resource.labels.revision_name,labels.instanceId)"], capture_output=True, text=True)
        if result.returncode == 0:
            events = json.loads(result.stdout)
            startup = {"status": "startup_candidates_in_first_request_window" if events else "no_startup_observed",
                       "events": events, "queried_api_revision": revision, "cold_start_claimed": False,
                       "note": "Exact request UTC window/revision candidates only. A quiet scale-to-zero window and request-to-instance correlation are still required; do not mix this latency into warmed samples"}
        else:
            startup = {"status": "lookup_unavailable", "note": "No cold-start claim made; raw CLI output withheld"}
    report = dict(plan, project_id=PROJECT, measured_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  source_revision=inventory.get("source_revision"), client={"platform": platform.platform(), "location": args.client_location},
                  catalog_rows=catalog["total"], first_observation=dict(first, started_at_utc=first_started.isoformat(),
                      completed_at_utc=first_ended.isoformat(), api_revision=inventory.get("runtime", {}).get("api", {}).get("ready_revision"),
                      cold_start_claimed=False), startup_evidence=startup,
                  warmup_requests=len(warmup), duration_seconds=round(duration, 2), summaries=summaries,
                  passed=all(measurement_passes(s) for s in summaries.values()),
                  limitation="API result excludes image/AI calls. Mobile usable-time and independently evidenced cold starts are separate acceptance evidence.")
    path = ROOT / "work/gcp/performance-api.json"
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"passed": report["passed"], "catalog_rows": catalog["total"], "summaries": summaries, "report": str(path)}, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
