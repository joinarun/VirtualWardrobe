#!/usr/bin/env python3
"""Operator JDBC/Flyway check through existing ADC. Default is a plan only."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import zipfile

from deploy import Deployment, EXPECTED_PROJECT, ROOT


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--run", action="store_true")
    parser.add_argument("--instance", default="virtualwardrobe-demo-db")
    parser.add_argument("--jar", type=Path, default=ROOT / "services/backend/target/backend-0.0.1-SNAPSHOT.jar")
    parser.add_argument("--java-home", type=Path, default=Path("/Users/arunman/Library/Java/JavaVirtualMachines/ms-21.0.7/Contents/Home"))
    parser.add_argument("--migrate-restore", action="store_true", help="Only for the isolated rehearsal copy")
    args = parser.parse_args()
    if args.project != EXPECTED_PROJECT:
        parser.error("Only the reviewed project is allowed")
    restore = bool(re.fullmatch(r"virtualwardrobe-restore-[a-z0-9-]{1,40}", args.instance))
    if args.instance != "virtualwardrobe-demo-db" and not restore:
        parser.error("Only the app database or its explicitly named restore rehearsal copy is allowed")
    if args.migrate_restore and not restore:
        parser.error("Migration execution is allowed only on an isolated restore rehearsal copy")
    if not args.run:
        print(json.dumps({"project": args.project, "instance": args.instance,
            "actions": ["Validate Flyway checksums", "Read aggregate row counts", "Execute migrations on restore copy only" if args.migrate_restore else "No migrations executed"],
            "authentication": "Existing user ADC; Secret Manager password stays in child process environment",
            "starts_app_or_provider": False}, indent=2)); return 0
    java = args.java_home / "bin/java"
    if not java.is_file() or not args.jar.is_file():
        parser.error("The explicit Java21 installation and final tested Boot JAR are required")
    deployment = Deployment(json.loads((ROOT / "infra/gcp-demo.json").read_text()))
    instance = json.loads(deployment.value("sql", "instances", "describe", args.instance, "--format=json"))
    if instance.get("state") != "RUNNABLE" or instance.get("databaseVersion") != "POSTGRES_17":
        parser.error("The expected running PostgreSQL17 instance is required")
    fingerprint = hashlib.sha256(args.jar.read_bytes()).hexdigest()
    runtime = ROOT / "work/gcp/db-check-runtime" / fingerprint[:16]
    runtime.mkdir(parents=True, exist_ok=True, mode=0o700)
    libraries = []
    with zipfile.ZipFile(args.jar) as archive:
        for name in archive.namelist():
            if name.startswith("BOOT-INF/lib/") and name.endswith(".jar"):
                destination = runtime / Path(name).name
                destination.write_bytes(archive.read(name)); libraries.append(str(destination))
            elif name.startswith("BOOT-INF/classes/db/migration/") and name.endswith(".sql"):
                destination = runtime / "classes/db/migration" / Path(name).name
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(archive.read(name))
    if not libraries:
        parser.error("A packaged Spring Boot JAR with its tested dependencies is required")
    password = deployment.value("secrets", "versions", "access", "latest", "--secret", deployment.database_secret)
    environment = dict(os.environ,
        GOOGLE_CLOUD_PROJECT=EXPECTED_PROJECT, GOOGLE_CLOUD_QUOTA_PROJECT=EXPECTED_PROJECT,
        VW_DB_CHECK_INSTANCE=args.instance,
        VW_DB_CHECK_URL=(f"jdbc:postgresql:///virtualwardrobe?cloudSqlInstance={EXPECTED_PROJECT}:asia-south1:{args.instance}"
                         "&socketFactory=com.google.cloud.sql.postgres.SocketFactory&cloudSqlRefreshStrategy=lazy&connectTimeout=15&socketTimeout=15"),
        VW_DB_CHECK_PASSWORD=password, VW_DB_CHECK_MIGRATE_RESTORE=str(args.migrate_restore).lower())
    result = subprocess.run([str(java), "--class-path", os.pathsep.join(libraries + [str(runtime / "classes")]),
                             str(ROOT / "infra/DatabaseCheck.java")], env=environment, capture_output=True, text=True, timeout=180)
    environment.pop("VW_DB_CHECK_PASSWORD", None)
    password = None
    values = [line.removeprefix("VW_DB_CHECK_JSON=") for line in result.stdout.splitlines() if line.startswith("VW_DB_CHECK_JSON=")]
    if result.returncode or len(values) != 1:
        errors = [json.loads(line.removeprefix("VW_DB_CHECK_ERROR=")) for line in result.stdout.splitlines() if line.startswith("VW_DB_CHECK_ERROR=")]
        raise RuntimeError("JDBC/Flyway verification failed: " + json.dumps(errors) + "; raw driver output withheld")
    report = dict(json.loads(values[0]), project_id=EXPECTED_PROJECT, instance=args.instance,
                  jar_sha256=fingerprint, verified_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  migrated_restore_copy=args.migrate_restore)
    path = ROOT / "work/gcp" / ("db-check-restore.json" if restore else "db-check-source.json")
    path.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return 0 if report["pendingMigrations"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
