#!/usr/bin/env python3
"""Read-only deployed checks. Does not create users, jobs, or enquiries."""
import argparse
import json
from pathlib import Path
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
PROJECT = "virtualtryon-511016"


def get(url, method="GET"):
    try:
        with urlopen(Request(url, method=method, data=b"{}" if method == "POST" else None,
                            headers={"User-Agent": "VirtualWardrobe-Deployment-Smoke/1",
                                     "Content-Type": "application/json"}), timeout=60) as response:
            return response.status, dict(response.headers), response.read(128_000)
    except HTTPError as error:
        try:
            return error.code, dict(error.headers), error.read(16_000)
        finally:
            error.close()


def origins(inventory):
    if (inventory.get("project_id") != PROJECT or inventory.get("environment") != "demo" or
            inventory.get("region") != "asia-south1"):
        raise ValueError("The exact reviewed VirtualWardrobe demo inventory is required")
    values = []
    for key, name in (("web_url", None), ("api_url", "virtualwardrobe-demo-api"),
                      ("worker_url", "virtualwardrobe-demo-worker")):
        value = urlsplit(inventory.get(key, ""))
        if (value.scheme != "https" or value.username or value.password or value.port or
                value.path not in ("", "/") or value.query or value.fragment or
                (name is None and value.hostname != "virtualwardrobe-511016.web.app") or
                (name is not None and not re.fullmatch(re.escape(name) + r"-[a-z0-9.-]+\.run\.app", value.hostname or ""))):
            raise ValueError("Only the dedicated Hosting site and owned Cloud Run origins are allowed")
        values.append(f"https://{value.hostname}")
    return values


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", type=Path, default=ROOT / "work/gcp/deployment.json")
    args = parser.parse_args()
    inventory = json.loads(args.inventory.read_text())
    try:
        web, api, worker = origins(inventory)
    except ValueError as error:
        parser.error(str(error))
    checks = [
        ("web shell", web + "/", {200}, False, "GET"),
        ("same-origin API rewrite", web + "/api/v1/health", {200}, True, "GET"),
        ("direct API health", api + "/api/v1/health", {200}, True, "GET"),
        ("worker IAM rejects public traffic", worker + "/api/v1/health", {401, 403}, False, "GET"),
        ("public API hides internal root", api + "/internal", {404}, False, "GET"),
        ("public API has no callable worker handler", api + "/internal/maintenance", {404}, False, "POST"),
        ("public API has no callable job handler", api + "/internal/jobs/not-a-job/run", {404}, False, "POST"),
    ]
    results = []
    for name, url, expected, expect_json, method in checks:
        try:
            status, headers, body = get(url, method)
            passed = status in expected
            if expect_json and passed:
                passed = isinstance(json.loads(body), dict)
            results.append({"check": name, "status": status, "passed": passed})
        except (URLError, ValueError, TimeoutError) as error:
            results.append({"check": name, "passed": False, "error_type": type(error).__name__})
    out = ROOT / "work/gcp/smoke-report.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(results, indent=2) + "\n")
    print(json.dumps(results, indent=2))
    return 0 if all(item["passed"] for item in results) else 1


if __name__ == "__main__":
    sys.exit(main())
