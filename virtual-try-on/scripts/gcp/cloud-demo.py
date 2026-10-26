#!/usr/bin/env python3
"""Plan or run the private demo-data CLI against the isolated GCP demo.

Planning is the default. --run executes a standalone Java entry point, never a
web server, worker or image provider. Cleanup stays a dry run unless the separate
--execute-cleanup flag is supplied as well.
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import zipfile

from deploy import Deployment, EXPECTED_PROJECT, ROOT

PROFILES = {
    "demo": {"profile": "standard"},
    "load": {"profile": "load", "catalog_size": 1000},
}
DEFAULT_JAVA_HOME = Path("/Users/arunman/Library/Java/JavaVirtualMachines/ms-21.0.7/Contents/Home")
ENTRYPOINT = "com.virtualwardrobe.demo.DemoMain"
RESULT_PREFIX = "DEMO_RESULT_JSON="


class OperatorFailure(RuntimeError):
    """An intentionally safe operator message, containing no external output."""


def dataset_profile(dataset: str) -> dict:
    match = re.fullmatch(r"virtualwardrobe-(demo|load)-v[1-9][0-9]{0,3}", dataset)
    if not match:
        raise OperatorFailure("Only versioned VirtualWardrobe demo/load dataset IDs from v1 through v9999 are allowed")
    return dict(PROFILES[match.group(1)])


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("seed", "status", "cleanup"))
    parser.add_argument("--project", required=True)
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--run", action="store_true")
    parser.add_argument("--execute-cleanup", action="store_true",
                        help="Actually remove this dataset; requires cleanup --run")
    parser.add_argument("--jar", type=Path, default=ROOT / "services/backend/target/backend-0.0.1-SNAPSHOT.jar")
    parser.add_argument("--java-home", type=Path, default=DEFAULT_JAVA_HOME)
    parser.add_argument("--assets", type=Path, default=ROOT / "apps/web/public/demo")
    args = parser.parse_args(argv)
    if args.project != EXPECTED_PROJECT:
        parser.error("Only the reviewed VirtualWardrobe project is allowed")
    try:
        dataset_profile(args.dataset)
    except OperatorFailure as error:
        parser.error(str(error))
    if args.execute_cleanup and (args.command != "cleanup" or not args.run):
        parser.error("--execute-cleanup requires cleanup --run")
    if os.environ.get("APP_ENVIRONMENT", "demo") not in ("", "local", "demo"):
        parser.error("Production or unknown environments are refused")
    return args


def credential_path(dataset: str, work: Path) -> Path:
    """The paired credential files always remain under the ignored operator dir."""
    dataset_profile(dataset)
    directory = work.absolute()
    # Reject symlinks before resolving, including work/ itself. A caller must
    # never redirect credential creation into a shared or tracked directory.
    for candidate in (directory, *directory.parents):
        if candidate.is_symlink():
            raise OperatorFailure("Credential directories must not be symlinks")
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    directory.chmod(0o700)
    destination = directory / f"demo-credentials-{dataset}.json"
    for path in (destination, destination.with_suffix(".txt")):
        if path.is_symlink():
            raise OperatorFailure("Credential files must not be symlinks")
        if path.exists():
            metadata = path.stat()
            if (not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1 or
                    metadata.st_uid != os.getuid() or stat.S_IMODE(metadata.st_mode) != 0o600):
                raise OperatorFailure("Existing credential files must be owner-only regular files")
    return destination


def existing_user_adc(environment: dict[str, str]) -> Path:
    configured = environment.get("GOOGLE_APPLICATION_CREDENTIALS")
    config_dir = Path(environment.get("CLOUDSDK_CONFIG", str(Path.home() / ".config/gcloud")))
    path = Path(configured) if configured else config_dir / "application_default_credentials.json"
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        raise OperatorFailure("Existing user application-default credentials are required; no login or key is created") from None
    if data.get("type") != "authorized_user":
        raise OperatorFailure("Only existing keyless user ADC is allowed by this operator wrapper")
    return path.resolve()


def java_command(args, credentials: Path) -> list[str]:
    profile = dataset_profile(args.dataset)
    result = [str(args.java_home.resolve() / "bin/java"), "-Xmx768m", "-Djava.awt.headless=true",
              f"-Dloader.main={ENTRYPOINT}", "-cp", str(args.jar.resolve()),
              "org.springframework.boot.loader.launch.PropertiesLauncher", args.command,
              "--dataset", args.dataset, "--project", EXPECTED_PROJECT]
    if args.command == "seed":
        result += ["--assets", str(args.assets.resolve()), "--credentials", str(credentials),
                   "--profile", profile["profile"]]
        if "catalog_size" in profile:
            result += ["--catalog-size", str(profile["catalog_size"])]
    elif args.command == "cleanup":
        result += ["--execute" if args.execute_cleanup else "--dry-run"]
    return result


def child_environment(deployment: Deployment, adc: Path, password: str) -> dict[str, str]:
    # Do not let shell configuration change Spring settings, the loader main,
    # Java agents or any other cloud target. Keep ordinary OS/transport settings.
    excluded = ("APP_", "SPRING_", "GOOGLE_", "GCLOUD_", "LOADER_")
    environment = {key: value for key, value in os.environ.items()
                   if not key.startswith(excluded) and key not in
                   {"JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS", "JDK_JAVA_OPTIONS", "CLASSPATH"}}
    environment.update({
        "JAVA_HOME": str(DEFAULT_JAVA_HOME),
        "APP_ENVIRONMENT": "demo", "APP_ADAPTER_MODE": "gcp",
        "APP_GCP_PROJECT": EXPECTED_PROJECT,
        "GOOGLE_CLOUD_PROJECT": EXPECTED_PROJECT,
        "GOOGLE_CLOUD_QUOTA_PROJECT": EXPECTED_PROJECT,
        "GOOGLE_APPLICATION_CREDENTIALS": str(adc),
        "APP_STORAGE_BUCKET": deployment.private_bucket,
        "APP_STORAGE_SIGNER_SERVICE_ACCOUNT": deployment.accounts["api"],
        "SPRING_DATASOURCE_URL": (
            f"jdbc:postgresql:///{deployment.dbname}?cloudSqlInstance={EXPECTED_PROJECT}:{deployment.region}:{deployment.db}"
            "&socketFactory=com.google.cloud.sql.postgres.SocketFactory&cloudSqlRefreshStrategy=lazy"
            "&connectTimeout=15&socketTimeout=30"),
        "SPRING_DATASOURCE_USERNAME": deployment.dbuser,
        "SPRING_DATASOURCE_PASSWORD": password,
    })
    return environment


def safe_result(output: str, dataset: str, command: str) -> dict:
    """Validate the result marker and expose counts/enums only, never raw logs."""
    values = [line[len(RESULT_PREFIX):] for line in output.splitlines() if line.startswith(RESULT_PREFIX)]
    if len(values) != 1 or len(values[0]) > 65536:
        raise OperatorFailure("The standalone CLI did not emit exactly one bounded result marker")
    try:
        result = json.loads(values[0])
    except ValueError:
        raise OperatorFailure("The standalone CLI result marker was invalid") from None
    if (not isinstance(result, dict) or type(result.get("schemaVersion")) is not int or result.get("schemaVersion") != 1 or
            result.get("datasetId") != dataset or result.get("command") != command):
        raise OperatorFailure("The standalone CLI returned an unexpected schema, dataset or command")
    state = result.get("state")
    profile = result.get("profile")
    if state not in ("PREPARING", "ACTIVE", "DELETING", "DELETED", "ABSENT") or profile not in (None, dataset_profile(dataset)["profile"]):
        raise OperatorFailure("The standalone CLI returned an unexpected state or profile")
    summary = {"schemaVersion": 1, "state": state, "profile": profile}
    counts = result.get("counts")
    if not isinstance(counts, dict) or not all(
            isinstance(key, str) and re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,49}", key)
            and type(value) is int and 0 <= value <= 10_000_000 for key, value in counts.items()):
        raise OperatorFailure("The standalone CLI returned invalid aggregate counts")
    summary["counts"] = counts
    objects = result.get("objects")
    if type(objects) is not int or not 0 <= objects <= 10_000_000:
        raise OperatorFailure("The standalone CLI returned an invalid object count")
    summary["objects"] = objects
    for key in ("dryRun", "changed"):
        if type(result.get(key)) is not bool:
            raise OperatorFailure("The standalone CLI returned invalid operation flags")
        summary[key] = result[key]
    return summary


def run(args, deployment: Deployment) -> dict:
    java = args.java_home.resolve() / "bin/java"
    if not java.is_file() or not args.jar.is_file():
        raise OperatorFailure("The explicit Java21 installation and final tested Boot JAR are required")
    version = subprocess.run([str(java), "-version"], capture_output=True, text=True, timeout=15, check=False)
    if version.returncode or not re.search(r'version "21(?:\.|["+])', version.stdout + version.stderr):
        raise OperatorFailure("The operator CLI requires Java21")
    with zipfile.ZipFile(args.jar) as archive:
        if f"BOOT-INF/classes/{ENTRYPOINT.replace('.', '/')}.class" not in archive.namelist():
            raise OperatorFailure("The final tested feature007 Boot JAR is required")
    if args.command == "seed" and (not args.assets.is_dir() or not (args.assets / "provenance.json").is_file()):
        raise OperatorFailure("The owned demo assets and provenance manifest are required")
    adc = existing_user_adc(dict(os.environ))
    credentials = credential_path(args.dataset, deployment.work)
    instance = json.loads(deployment.value("sql", "instances", "describe", deployment.db, "--format=json"))
    expected_connection = f"{EXPECTED_PROJECT}:{deployment.region}:{deployment.db}"
    if (instance.get("state") != "RUNNABLE" or instance.get("databaseVersion") != "POSTGRES_17" or
            instance.get("connectionName") != expected_connection):
        raise OperatorFailure("The exact running VirtualWardrobe PostgreSQL17 instance is required")
    password = deployment.value("secrets", "versions", "access", "latest", "--secret", deployment.database_secret)
    if not password:
        raise OperatorFailure("The database secret is empty")
    environment = child_environment(deployment, adc, password)
    environment["JAVA_HOME"] = str(args.java_home.resolve())
    try:
        result = subprocess.run(java_command(args, credentials), cwd=ROOT, env=environment,
                                stdin=subprocess.DEVNULL, capture_output=True, text=True,
                                timeout=600, check=False)
    finally:
        environment.pop("SPRING_DATASOURCE_PASSWORD", None)
        password = None
    if result.returncode:
        raise OperatorFailure("The standalone CLI failed; raw Java/driver output was withheld")
    summary = safe_result(result.stdout, args.dataset, args.command)
    credential_path(args.dataset, deployment.work)  # Verify final permissions.
    report = {
        "project_id": EXPECTED_PROJECT, "dataset": args.dataset, "command": args.command,
        "cleanup_executed": args.command == "cleanup" and args.execute_cleanup,
        "verified_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "jar_sha256": hashlib.sha256(args.jar.read_bytes()).hexdigest(),
        "standalone_no_listener_or_provider": True, "result": summary,
    }
    path = deployment.work / f"demo-operator-{args.dataset}-{args.command}.json"
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=deployment.work,
                                     prefix=".demo-report-", delete=False) as stream:
        temporary = Path(stream.name)
        json.dump(report, stream, indent=2); stream.write("\n")
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)
    return report


def main(argv=None):
    args = parse_args(argv)
    deployment = Deployment(json.loads((ROOT / "infra/gcp-demo.json").read_text()))
    if not args.run:
        print(json.dumps({
            "project_id": EXPECTED_PROJECT, "environment": "demo", "dataset": args.dataset,
            "profile": dataset_profile(args.dataset), "command": args.command,
            "executes": False, "cleanup_default": "dry-run",
            "instance": deployment.db, "bucket": deployment.private_bucket,
            "authentication": "Existing user ADC; database secret stays in child environment",
            "credential_files": "Ignored work/gcp/demo-credentials-<dataset>.json and sibling .txt, mode0600",
            "entrypoint": ENTRYPOINT, "starts_web_worker_provider": False,
        }, indent=2)); return 0
    try:
        print(json.dumps(run(args, deployment), indent=2))
        return 0
    except Exception as error:
        # Even a timeout/Google SDK failure can contain captured output or a
        # credential-bearing request. The operator report must never echo it.
        print(json.dumps({"status": "FAILED", "project_id": EXPECTED_PROJECT,
                          "dataset": args.dataset, "command": args.command,
                          "failure_type": type(error).__name__,
                          "detail": str(error) if isinstance(error, OperatorFailure) else
                              "Execution failed; raw subprocess and cloud error output withheld. Inspect dataset status before retrying."}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
