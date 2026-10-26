#!/usr/bin/env python3
"""Back up only the demo DB, restore to a new isolated copy, verify, delete copy."""
import argparse
import datetime
import json
from pathlib import Path
import subprocess
import sys
import uuid

from deploy import Deployment, EXPECTED_PROJECT, ROOT


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--run", action="store_true")
    parser.add_argument("--jar", type=Path, default=ROOT / "services/backend/target/backend-0.0.1-SNAPSHOT.jar")
    args = parser.parse_args()
    if args.project != EXPECTED_PROJECT:
        parser.error("Only the reviewed project is allowed")
    if not args.run:
        print(json.dumps({"source_instance": "virtualwardrobe-demo-db",
            "actions": ["Read aggregate baseline and validate migrations", "Create one named on-demand backup", "Create a new small isolated PostgreSQL17 instance", "Restore only into that new instance", "Validate checksums, migrations and core row counts", "Delete the temporary instance even if verification fails"],
            "cost": "Temporary db-f1-micro/10GB SSD and retained on-demand backup incur normal charges",
            "restores_over_live_database": False, "starts_app_or_provider": False}, indent=2)); return 0
    deployment = Deployment(json.loads((ROOT / "infra/gcp-demo.json").read_text()))
    suffix = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]
    target = "virtualwardrobe-restore-" + suffix
    description = "VirtualWardrobe release restore rehearsal " + suffix
    path = ROOT / "work/gcp/backup-rehearsal.json"
    if path.exists():
        previous = json.loads(path.read_text())
        if previous.get("cleanup_status") not in ("deleted", "not_created"):
            raise RuntimeError("The previous rehearsal has pending cleanup; review its recorded target before creating another copy")
    report = {"project_id": EXPECTED_PROJECT, "source_instance": deployment.db, "restore_instance": target,
              "backup_description": description, "status": "started", "cleanup_status": "not_created",
              "cleanup_command": f"gcloud sql instances delete {target} --project {EXPECTED_PROJECT}"}

    def save():
        path.write_text(json.dumps(report, indent=2) + "\n")

    def check(instance, migrate=False):
        cmd = [sys.executable, str(ROOT / "scripts/gcp/db-check.py"), "--project", EXPECTED_PROJECT,
               "--instance", instance, "--jar", str(args.jar), "--run"]
        if migrate: cmd.append("--migrate-restore")
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError("The aggregate JDBC/Flyway check failed; raw subprocess output withheld")
        name = "db-check-restore.json" if migrate else "db-check-source.json"
        return json.loads((ROOT / "work/gcp" / name).read_text())

    save()
    creation_started = False
    try:
        baseline = check(deployment.db)
        report["baseline"] = baseline
        deployment.gc("sql", "backups", "create", "--instance", deployment.db, "--description", description, capture=True)
        backups = json.loads(deployment.value("sql", "backups", "list", "--instance", deployment.db, "--format=json"))
        matching = [b for b in backups if b.get("description") == description and b.get("status") == "SUCCESSFUL"]
        if len(matching) != 1: raise RuntimeError("The named successful backup could not be identified uniquely")
        report["backup_id"] = str(matching[0]["id"])
        report["status"] = "backup_created"
        save()
        # A fresh random name is never a live or pre-existing database. Record
        # it before creation so cleanup is recoverable after an interruption.
        if deployment.exists("sql", "instances", "describe", target):
            raise RuntimeError("Unexpected restore-instance name collision; existing instance preserved")
        report["cleanup_status"] = "pending_creation"
        save()
        creation_started = True
        deployment.gc("sql", "instances", "create", target, "--region", "asia-south1",
            "--edition", "enterprise", "--database-version", "POSTGRES_17", "--tier", "db-f1-micro",
            "--availability-type", "zonal", "--storage-type", "SSD", "--storage-size", "10",
            "--storage-auto-increase", "--storage-auto-increase-limit", "20", "--no-backup",
            "--ssl-mode", "ENCRYPTED_ONLY", "--assign-ip", "--no-deletion-protection", capture=True)
        report["cleanup_status"] = "pending"
        save()
        deployment.gc("sql", "backups", "restore", report["backup_id"], "--backup-instance", deployment.db,
                      "--backup-project", EXPECTED_PROJECT, "--restore-instance", target, capture=True)
        restored = check(target, True)
        report["restored"] = restored
        equivalent = all(restored[key] == baseline[key] for key in ("counts", "migrationVersions", "jar_sha256")) and restored["pendingMigrations"] == 0
        report["status"] = "verified" if equivalent else "verification_failed"
        if not equivalent: raise RuntimeError("Restored aggregate counts or migration checks did not match the quiescent baseline")
    except Exception as failure:
        report["status"] = "failed"
        report["error_type"] = type(failure).__name__
        raise
    finally:
        if creation_started:
            try:
                if deployment.exists("sql", "instances", "describe", target):
                    settings = json.loads(deployment.value("sql", "instances", "describe", target, "--format=json")).get("settings", {})
                    if settings.get("deletionProtectionEnabled"):
                        deployment.gc("sql", "instances", "patch", target, "--no-deletion-protection", capture=True)
                    deployment.gc("sql", "instances", "delete", target, capture=True)
                    report["cleanup_status"] = "deleted"
                else:
                    report["cleanup_status"] = "not_created"
            except Exception:
                report["cleanup_status"] = "manual_cleanup_required"
                report["cleanup_command"] = f"gcloud sql instances delete {target} --project {EXPECTED_PROJECT}"
        save()
    print(json.dumps({"status": report["status"], "cleanup_status": report["cleanup_status"], "report": str(path)}, indent=2))
    return 0 if report["status"] == "verified" and report["cleanup_status"] == "deleted" else 1


if __name__ == "__main__":
    raise SystemExit(main())
