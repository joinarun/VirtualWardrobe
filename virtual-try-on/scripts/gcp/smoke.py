#!/usr/bin/env python3
"""Read-only deployed checks. Does not create users, jobs, or enquiries."""
import argparse
import json
from pathlib import Path
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]


def get(url):
    try:
        with urlopen(Request(url, headers={"User-Agent": "VirtualWardrobe-Deployment-Smoke/1"}), timeout=60) as response:
            return response.status, dict(response.headers), response.read(128_000)
    except HTTPError as error:
        return error.code, dict(error.headers), error.read(16_000)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", type=Path, default=ROOT / "work/gcp/deployment.json")
    args = parser.parse_args()
    inventory = json.loads(args.inventory.read_text())
    web, api, worker = (inventory[key].rstrip("/") for key in ("web_url", "api_url", "worker_url"))
    checks = [
        ("web shell", web + "/", {200}, False),
        ("same-origin API rewrite", web + "/api/v1/health", {200}, True),
        ("direct API health", api + "/api/v1/health", {200}, True),
        ("worker IAM rejects public traffic", worker + "/api/v1/health", {401, 403}, False),
        ("public API has no callable worker handler", api + "/internal/maintenance", {401, 403, 404, 405}, False),
        ("public API has no callable job handler", api + "/internal/jobs/not-a-job/run", {401, 403, 404, 405}, False),
    ]
    results = []
    for name, url, expected, expect_json in checks:
        try:
            status, headers, body = get(url)
            passed = status in expected
            if expect_json and passed:
                passed = isinstance(json.loads(body), dict)
            results.append({"check": name, "status": status, "passed": passed})
        except (URLError, ValueError, TimeoutError) as error:
            results.append({"check": name, "passed": False, "error": str(error)})
    out = ROOT / "work/gcp/smoke-report.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(results, indent=2) + "\n")
    print(json.dumps(results, indent=2))
    return 0 if all(item["passed"] for item in results) else 1


if __name__ == "__main__":
    sys.exit(main())
