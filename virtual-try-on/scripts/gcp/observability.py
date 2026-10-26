#!/usr/bin/env python3
"""Prepare scoped failure monitoring. Default is a plan; --apply creates it."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlencode

from deploy import Deployment, EXPECTED_PROJECT, ROOT

METRIC = "virtualwardrobe-demo-failures"
DISPLAY = "VirtualWardrobe demo application failures"
LOG_FILTER = ('resource.type="cloud_run_revision" '
              'AND resource.labels.service_name=("virtualwardrobe-demo-api" OR "virtualwardrobe-demo-worker") '
              'AND (severity>=ERROR OR jsonPayload.vw_failure=true)')
METRIC_FILTER = f'metric.type="logging.googleapis.com/user/{METRIC}" AND resource.type="cloud_run_revision"'


def policy():
    return {"displayName": DISPLAY, "combiner": "OR", "enabled": True,
            "notificationChannels": [], "userLabels": {"app": "virtualwardrobe", "environment": "demo"},
            "alertStrategy": {"autoClose": "3600s"},
            "conditions": [{"displayName": "At least one application failure in a minute",
                "conditionThreshold": {"filter": METRIC_FILTER, "comparison": "COMPARISON_GT",
                    "thresholdValue": 0, "duration": "0s", "trigger": {"count": 1},
                    "aggregations": [{"alignmentPeriod": "60s", "perSeriesAligner": "ALIGN_DELTA", "crossSeriesReducer": "REDUCE_SUM"}]}}]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.project != EXPECTED_PROJECT:
        parser.error("Only the explicitly reviewed VirtualTryOn project is allowed")
    planned = {"project": EXPECTED_PROJECT, "metric": METRIC, "log_filter": LOG_FILTER,
               "alert_policy": policy(), "notifications": "Console incidents only; no channels or recipients are added",
               "event_contract": "Application failure events use stable codes and vw_failure=true; no raw exception, photo, signed URL, contact or credential fields"}
    if not args.apply:
        print(json.dumps(planned, indent=2)); return 0
    deployment = Deployment(json.loads((ROOT / "infra/gcp-demo.json").read_text()))
    deployment.gc("services", "enable", "logging.googleapis.com", "monitoring.googleapis.com")
    if deployment.exists("logging", "metrics", "describe", METRIC):
        metric = json.loads(deployment.value("logging", "metrics", "describe", METRIC, "--format=json"))
        if metric.get("filter") != LOG_FILTER:
            raise RuntimeError("Existing app failure metric differs; preserved for review")
    else:
        deployment.gc("logging", "metrics", "create", METRIC, "--log-filter", LOG_FILTER,
                      "--description", "VirtualWardrobe application failures; no payload-derived labels")
    matches = []
    page_token = ""
    while True:
        query = urlencode(dict(pageSize=100, **({"pageToken": page_token} if page_token else {})))
        page = deployment.api_request("GET", f"https://monitoring.googleapis.com/v3/projects/{EXPECTED_PROJECT}/alertPolicies?{query}")
        matches.extend(item for item in page.get("alertPolicies", []) if item.get("displayName") == DISPLAY)
        page_token = page.get("nextPageToken", "")
        if not page_token: break
    if matches:
        if (len(matches) != 1 or matches[0].get("notificationChannels") or
                len(matches[0].get("conditions", [])) != 1 or
                matches[0]["conditions"][0].get("conditionThreshold", {}).get("filter") != METRIC_FILTER):
            raise RuntimeError("Existing app alert policy differs; preserved for review")
        alert = matches[0]
    else:
        alert = deployment.api_request("POST", f"https://monitoring.googleapis.com/v3/projects/{EXPECTED_PROJECT}/alertPolicies", policy())
    report = dict(planned, status="configured", policy_name=alert.get("name"),
                  verification="Requires a safe failure event and actual metric/incident inspection after deployment")
    path = ROOT / "work/gcp/observability.json"
    path.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"status": report["status"], "metric": METRIC, "policy_name": alert.get("name"), "report": str(path)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
