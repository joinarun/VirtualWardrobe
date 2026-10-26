#!/usr/bin/env python3
"""Bounded public-read load check. Default prints a plan; --run sends traffic."""
import argparse
import concurrent.futures
import datetime
import json
import math
from pathlib import Path
import platform
import statistics
import subprocess
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from smoke import origins

ROOT = Path(__file__).resolve().parents[2]
PROJECT = "virtualtryon-511016"


def percentile(values, fraction):
    return sorted(values)[max(0, math.ceil(len(values) * fraction) - 1)] if values else None


def fetch(base, path):
    started = time.perf_counter()
    try:
        with urlopen(Request(base + path, headers={"Accept": "application/json", "Cache-Control": "no-cache",
                     "User-Agent": "VirtualWardrobe-Release-Performance/1"}), timeout=60) as response:
            payload = response.read(2_000_000)
            return {"status": response.status, "ms": (time.perf_counter() - started) * 1000}, json.loads(payload)
    except HTTPError as error:
        status = error.code
        error.close()
        return {"status": status, "ms": (time.perf_counter() - started) * 1000}, None
    except (URLError, TimeoutError, ValueError):
        return {"status": 0, "ms": (time.perf_counter() - started) * 1000}, None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true")
    parser.add_argument("--inventory", type=Path, default=ROOT / "work/gcp/deployment.json")
    parser.add_argument("--requests-per-user", type=int, default=20)
    parser.add_argument("--client-location", default="Operator workstation; network location must be recorded in release evidence")
    parser.add_argument("--read-startup-logs", action="store_true", help="Read only app startup system-log timestamps for the first request")
    args = parser.parse_args()
    if not 10 <= args.requests_per_user <= 25:
        parser.error("Use 10–25 requests per user; concurrency is fixed at 20")
    plan = {"concurrent_users": 20, "measured_requests": 20 * args.requests_per_user,
            "minimum_catalog_rows": 1000, "warm_api_p95_limit_ms": 750,
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
    # Warm class loading, connection pools and each endpoint under the actual
    # concurrency. These 60 requests never enter the measured sample.
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
        warmup = list(pool.map(lambda i: fetch(base, endpoints[i % len(endpoints)][1])[0], range(60)))
    if any(sample["status"] != 200 for sample in warmup):
        parser.error("Warm-up returned an error; inspect the deployment before running the load sample")
    barrier = threading.Barrier(20)

    def user(index):
        barrier.wait(timeout=30)
        samples = []
        for offset in range(args.requests_per_user):
            name, path = endpoints[(index + offset) % len(endpoints)]
            sample, _ = fetch(base, path)
            samples.append(dict(sample, endpoint=name))
        return samples

    started = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
        samples = [sample for group in pool.map(user, range(20)) for sample in group]
    duration = time.perf_counter() - started
    summaries = {}
    for name in ["all"] + [name for name, _ in endpoints]:
        selected = [s for s in samples if name == "all" or s["endpoint"] == name]
        values = [s["ms"] for s in selected]
        summaries[name] = {"count": len(selected), "errors": sum(s["status"] != 200 for s in selected),
                           "p50_ms": round(statistics.median(values), 2), "p95_ms": round(percentile(values, .95), 2),
                           "max_ms": round(max(values), 2)}
    startup = {"status": "not_checked", "note": "First-observed latency alone does not establish a cold start"}
    if args.read_startup_logs:
        lower = (first_started - datetime.timedelta(seconds=5)).isoformat()
        upper = (first_ended + datetime.timedelta(seconds=5)).isoformat()
        query = ('resource.type="cloud_run_revision" AND resource.labels.service_name="virtualwardrobe-demo-api" '
                 'AND logName="projects/' + PROJECT + '/logs/run.googleapis.com%2Fvarlog%2Fsystem" '
                 'AND textPayload:"Starting new instance" AND timestamp>="' + lower + '" AND timestamp<="' + upper + '"')
        result = subprocess.run(["gcloud", "logging", "read", query, "--project", PROJECT, "--limit=20",
                                 "--format=json(timestamp,resource.labels.revision_name)"], capture_output=True, text=True)
        if result.returncode == 0:
            events = json.loads(result.stdout)
            startup = {"status": "startup_in_first_request_window" if events else "no_startup_observed",
                       "events": events, "note": "Use a quiet API window and verify this first request followed scale-to-zero; do not mix this latency into warmed samples"}
        else:
            startup = {"status": "lookup_unavailable", "note": "No cold-start claim made; raw CLI output withheld"}
    report = dict(plan, project_id=PROJECT, measured_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  source_revision=inventory.get("source_revision"), client={"platform": platform.platform(), "location": args.client_location},
                  catalog_rows=catalog["total"], first_observation=first, startup_evidence=startup,
                  warmup_requests=len(warmup), duration_seconds=round(duration, 2), summaries=summaries,
                  passed=all(s["errors"] == 0 and s["p95_ms"] <= 750 for s in summaries.values()),
                  limitation="API result excludes image/AI calls. Mobile usable-time and independently evidenced cold starts are separate acceptance evidence.")
    path = ROOT / "work/gcp/performance-api.json"
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"passed": report["passed"], "catalog_rows": catalog["total"], "summaries": summaries, "report": str(path)}, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
