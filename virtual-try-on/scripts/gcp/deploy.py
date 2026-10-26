#!/usr/bin/env python3
"""Plan or deploy the isolated VirtualWardrobe demo without service-account keys.

Default operation is read-only planning. --apply performs the described cloud
mutations. Every gcloud resource command carries an explicit --project flag.
Secrets are passed through stdin or HTTPS JSON bodies, never command arguments.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import secrets
import shlex
import subprocess
import sys
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
EXPECTED_PROJECT = "virtualtryon-511016"
EXPECTED_PREFIX = "virtualwardrobe"
EXPECTED_HOSTING_SITE = "virtualwardrobe-511016"
REQUIRED_APIS = [
    "run.googleapis.com", "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com", "sqladmin.googleapis.com",
    "storage.googleapis.com", "cloudtasks.googleapis.com",
    "cloudscheduler.googleapis.com", "secretmanager.googleapis.com",
    "iam.googleapis.com", "iamcredentials.googleapis.com",
    "cloudresourcemanager.googleapis.com", "aiplatform.googleapis.com",
    "recaptchaenterprise.googleapis.com", "firebase.googleapis.com",
    "firebasehosting.googleapis.com",
]


def command(args: list[str], *, data: bytes | None = None,
            capture: bool = False, check: bool = True,
            env: dict[str, str] | None = None) -> subprocess.CompletedProcess:
    if not capture:
        print("+ " + shlex.join(args), flush=True)
    return subprocess.run(args, cwd=ROOT, input=data,
                          stdout=subprocess.PIPE if capture else None,
                          stderr=subprocess.PIPE if capture else None,
                          check=check, env=env)


class Deployment:
    def __init__(self, config: dict):
        self.cfg = config
        self.project = config["project_id"]
        self.region = config["region"]
        self.base = f'{config["prefix"]}-{config["environment"]}'
        self.api = f"{self.base}-api"
        self.worker = f"{self.base}-worker"
        self.db = f"{self.base}-db"
        self.dbname = "virtualwardrobe"
        self.dbuser = "virtualwardrobe"
        self.queue = f"{self.base}-generations"
        self.scheduler = f"{self.base}-maintenance"
        self.repo = config["prefix"]
        self.private_bucket = f"{self.project}-{self.base}-private"
        self.build_bucket = f"{self.project}-{self.base}-build"
        self.database_secret = f"{self.base}-db-password"
        self.bootstrap_secret = f"{self.base}-bootstrap-password"
        self.accounts = {
            role: f"{self.base}-{role}@{self.project}.iam.gserviceaccount.com"
            for role in ("api", "worker", "dispatch", "build")
        }
        self.work = ROOT / "work" / "gcp"
        self.work.mkdir(parents=True, exist_ok=True)

    def gc(self, *args: str, capture: bool = False,
           check: bool = True, data: bytes | None = None):
        return command(["gcloud", *args, "--project", self.project,
                        "--quiet"], capture=capture, check=check, data=data)

    def exists(self, *args: str) -> bool:
        result = self.gc(*args, capture=True, check=False)
        if result.returncode == 0:
            return True
        # Never treat a permission/auth/network error as permission to create.
        error = result.stderr.decode(errors="replace")
        if any(marker in error for marker in
               ("NOT_FOUND", "not found", "does not exist", "404")):
            return False
        raise RuntimeError("Resource lookup failed: " + error.strip())

    def value(self, *args: str) -> str:
        return self.gc(*args, capture=True).stdout.decode().strip()

    def api_request(self, method: str, url: str,
                    payload: dict | None = None) -> dict:
        # Token stays in process memory; no request headers are logged.
        token = self.value("auth", "print-access-token")
        data = None if payload is None else json.dumps(payload).encode()
        req = Request(url, data=data, method=method, headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "x-goog-user-project": self.project,
        })
        try:
            with urlopen(req, timeout=60) as response:
                body = response.read()
                return json.loads(body) if body else {}
        except HTTPError as error:
            detail = error.read().decode(errors="replace")
            # Do not assume a provider error will avoid echoing input fields.
            # Passwords submitted through an HTTPS body must stay out of logs.
            if payload:
                for key, value in payload.items():
                    if any(part in key.lower() for part in ("password", "secret", "token")):
                        if isinstance(value, str) and value:
                            detail = detail.replace(value, "[REDACTED]")
            raise RuntimeError(f"Cloud API {method} failed ({error.code}): {detail}") from None

    def plan(self) -> dict:
        return {
            "project_id": self.project, "region": self.region,
            "environment": self.cfg["environment"],
            "preserves_existing_resources": "All stylereel-* resources and default Hosting site",
            "resources": {
                "cloud_run_api": self.api, "cloud_run_worker": self.worker,
                "cloud_sql_instance": self.db, "database": self.dbname,
                "private_bucket": self.private_bucket,
                "build_staging_bucket": self.build_bucket,
                "task_queue": self.queue, "maintenance_job": self.scheduler,
                "artifact_repository": self.repo,
                "firebase_hosting_site": self.cfg["firebase_site"],
                "service_accounts": self.accounts,
                "secret_names": [self.database_secret, self.bootstrap_secret],
            },
            "limits": {
                "database_tier": self.cfg["database_tier"],
                "database_storage_gb": self.cfg["database_storage_gb"],
                "api_max_instances": self.cfg["api_max_instances"],
                "worker_max_instances": self.cfg["worker_max_instances"],
                "cloud_run_min_instances": 0,
                "daily_customer_limit": self.cfg["daily_customer_limit"],
                "daily_global_limit": self.cfg["daily_global_limit"],
                "daily_provider_budget_usd": self.cfg["daily_provider_budget_usd"],
            },
            "ai": {"provider": self.cfg["image_provider"],
                   "model": self.cfg["google_image_model"],
                   "location": self.cfg["google_image_location"],
                   "quality_gate": "40-pair human saree evaluation remains separate"},
            "cost": "Cloud SQL/storage accrue charges while idle. Cloud Run minimum=0 permits cold starts. Review current regional pricing; no fixed total is guaranteed.",
        }

    def ensure_account(self, role: str):
        account = self.accounts[role]
        if not self.exists("iam", "service-accounts", "describe", account):
            self.gc("iam", "service-accounts", "create", account.split("@")[0],
                    "--display-name", f"VirtualWardrobe demo {role}")

    def project_role(self, role: str, member: str):
        self.gc("projects", "add-iam-policy-binding", self.project,
                "--member", member, "--role", role, "--condition=None",
                capture=True)

    def ensure_secret(self, name: str) -> str:
        if not self.exists("secrets", "describe", name):
            self.gc("secrets", "create", name, "--replication-policy", "automatic")
        enabled = self.value("secrets", "versions", "list", name,
                             "--filter=state=ENABLED", "--format=value(name)")
        if not enabled:
            value = secrets.token_urlsafe(36)
            self.gc("secrets", "versions", "add", name,
                    "--data-file=-", data=value.encode(), capture=True)
            return value
        return self.value("secrets", "versions", "access", "latest",
                          "--secret", name)

    def secret_access(self, name: str, role: str):
        self.gc("secrets", "add-iam-policy-binding", name,
                "--member", f"serviceAccount:{self.accounts[role]}",
                "--role", "roles/secretmanager.secretAccessor", capture=True)

    def ensure_bucket(self, bucket: str, *, private: bool):
        if not self.exists("storage", "buckets", "describe", f"gs://{bucket}"):
            self.gc("storage", "buckets", "create", f"gs://{bucket}",
                    "--location", self.region, "--uniform-bucket-level-access",
                    "--public-access-prevention")
        lifecycle = ROOT / "infra" / ("private-media-lifecycle.json" if private else "build-lifecycle.json")
        self.gc("storage", "buckets", "update", f"gs://{bucket}",
                "--lifecycle-file", str(lifecycle))
        # Keep the default 7-day soft-delete recovery window. The privacy notice
        # distinguishes application access removal from physical backup erasure.

    def bucket_role(self, bucket: str, role: str, account: str):
        self.gc("storage", "buckets", "add-iam-policy-binding", f"gs://{bucket}",
                "--member", f"serviceAccount:{account}", "--role", role,
                capture=True)

    def provision(self):
        self.gc("services", "enable", *REQUIRED_APIS)
        for role in self.accounts:
            self.ensure_account(role)
        db_password = self.ensure_secret(self.database_secret)
        self.ensure_secret(self.bootstrap_secret)
        self.ensure_bucket(self.private_bucket, private=True)
        self.ensure_bucket(self.build_bucket, private=False)
        if not self.exists("artifacts", "repositories", "describe", self.repo,
                           "--location", self.region):
            self.gc("artifacts", "repositories", "create", self.repo,
                    "--repository-format", "docker", "--location", self.region,
                    "--description", "VirtualWardrobe demo backend images")

        for role in ("api", "worker"):
            member = f"serviceAccount:{self.accounts[role]}"
            self.project_role("roles/cloudsql.client", member)
            self.secret_access(self.database_secret, role)
            self.bucket_role(self.private_bucket, "roles/storage.objectUser",
                             self.accounts[role])
        self.secret_access(self.bootstrap_secret, "api")
        self.project_role("roles/cloudtasks.enqueuer",
                          f'serviceAccount:{self.accounts["api"]}')
        self.project_role("roles/recaptchaenterprise.agent",
                          f'serviceAccount:{self.accounts["api"]}')
        self.project_role("roles/aiplatform.user",
                          f'serviceAccount:{self.accounts["worker"]}')
        self.gc("iam", "service-accounts", "add-iam-policy-binding",
                self.accounts["dispatch"], "--member",
                f'serviceAccount:{self.accounts["api"]}',
                "--role", "roles/iam.serviceAccountUser", capture=True)

        signer_role = "virtualWardrobeUrlSigner"
        if not self.exists("iam", "roles", "describe", signer_role):
            self.gc("iam", "roles", "create", signer_role,
                    "--title", "VirtualWardrobe URL signer",
                    "--permissions", "iam.serviceAccounts.signBlob", "--stage", "GA")
        self.gc("iam", "service-accounts", "add-iam-policy-binding",
                self.accounts["api"], "--member", f'serviceAccount:{self.accounts["api"]}',
                "--role", f"projects/{self.project}/roles/{signer_role}", capture=True)
        self.project_role("roles/logging.logWriter",
                          f'serviceAccount:{self.accounts["build"]}')
        self.bucket_role(self.build_bucket, "roles/storage.objectViewer",
                         self.accounts["build"])
        self.gc("artifacts", "repositories", "add-iam-policy-binding", self.repo,
                "--location", self.region, "--member",
                f'serviceAccount:{self.accounts["build"]}',
                "--role", "roles/artifactregistry.writer", capture=True)

        if not self.exists("sql", "instances", "describe", self.db):
            self.gc("sql", "instances", "create", self.db,
                    "--region", self.region, "--edition", "enterprise",
                    "--database-version", self.cfg["database_version"],
                    "--tier", self.cfg["database_tier"],
                    "--availability-type", "zonal", "--storage-type", "SSD",
                    "--storage-size", str(self.cfg["database_storage_gb"]),
                    "--storage-auto-increase",
                    "--storage-auto-increase-limit", str(self.cfg["database_storage_max_gb"]),
                    "--backup-start-time", "19:00", "--retained-backups-count", "3",
                    "--ssl-mode", "ENCRYPTED_ONLY", "--assign-ip",
                    "--deletion-protection", "--labels", "app=virtualwardrobe,environment=demo")
        if not self.exists("sql", "databases", "describe", self.dbname,
                           "--instance", self.db):
            self.gc("sql", "databases", "create", self.dbname, "--instance", self.db)
        users = json.loads(self.value("sql", "users", "list", "--instance", self.db,
                                      "--format=json"))
        if not any(user.get("name") == self.dbuser for user in users):
            operation = self.api_request("POST",
                f"https://sqladmin.googleapis.com/sql/v1beta4/projects/{self.project}/instances/{self.db}/users",
                {"name": self.dbuser, "password": db_password})
            self.gc("sql", "operations", "wait", operation["name"], "--timeout", "300")

        if not self.exists("tasks", "queues", "describe", self.queue,
                           "--location", self.region):
            self.gc("tasks", "queues", "create", self.queue,
                    "--location", self.region, "--max-concurrent-dispatches", "2",
                    "--max-dispatches-per-second", "1", "--max-attempts", "2",
                    "--min-backoff", "10s", "--max-backoff", "60s")

    def build(self, image: str):
        build_config = {
            "steps": [{"name": "gcr.io/cloud-builders/docker",
                       "args": ["build", "-t", image, "."]}],
            "images": [image], "options": {"logging": "CLOUD_LOGGING_ONLY"},
        }
        config_path = self.work / "cloudbuild.json"
        config_path.write_text(json.dumps(build_config, indent=2) + "\n")
        self.gc("builds", "submit", "services/backend", "--config", str(config_path),
                "--region", self.region, "--service-account",
                f'projects/{self.project}/serviceAccounts/{self.accounts["build"]}',
                "--gcs-source-staging-dir", f"gs://{self.build_bucket}/source")

    def environment(self, mode: str, captcha_key: str, worker_url: str) -> dict[str, str]:
        return {
            "APP_ENVIRONMENT": "demo", "APP_MODE": mode,
            "APP_ADAPTER_MODE": "gcp", "APP_IMAGE_PROVIDER": self.cfg["image_provider"],
            "GOOGLE_CLOUD_PROJECT": self.project, "APP_GCP_PROJECT": self.project,
            "APP_STORAGE_BUCKET": self.private_bucket,
            "APP_TASKS_LOCATION": self.region, "APP_TASKS_QUEUE": self.queue,
            "APP_TASKS_SERVICE_ACCOUNT": self.accounts["dispatch"],
            "APP_WORKER_URL": worker_url,
            "APP_GOOGLE_IMAGE_MODEL": self.cfg["google_image_model"],
            "APP_GOOGLE_IMAGE_LOCATION": self.cfg["google_image_location"],
            "APP_RECAPTCHA_SITE_KEY": captcha_key,
            "APP_RECAPTCHA_EXPECTED_ACTION": "signup",
            "APP_RECAPTCHA_ALLOWED_HOSTNAMES": f'{self.cfg["firebase_site"]}.web.app,{self.cfg["firebase_site"]}.firebaseapp.com',
            "APP_RECAPTCHA_MIN_SCORE": "0.5", "APP_CAPTCHA_MODE": "google",
            "APP_GENERATION_CUSTOMER_DAILY_LIMIT": str(self.cfg["daily_customer_limit"]),
            "APP_GENERATION_GLOBAL_DAILY_LIMIT": str(self.cfg["daily_global_limit"]),
            "APP_GENERATION_DAILY_BUDGET_USD": self.cfg["daily_provider_budget_usd"],
            "SPRING_DATASOURCE_URL":
                f"jdbc:postgresql:///{self.dbname}?cloudSqlInstance={self.project}:{self.region}:{self.db}"
                "&socketFactory=com.google.cloud.sql.postgres.SocketFactory&cloudSqlRefreshStrategy=lazy",
            "SPRING_DATASOURCE_USERNAME": self.dbuser,
            "SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE": "5" if mode == "api" else "3",
            "SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE": "0",
            "SERVER_SERVLET_SESSION_COOKIE_SECURE": "true",
            "APP_BOOTSTRAP_SUPERADMIN_EMAIL": self.cfg["bootstrap_email"],
        }

    def deploy_service(self, mode: str, image: str, captcha_key: str, worker_url: str):
        service = self.api if mode == "api" else self.worker
        env_path = self.work / f"{mode}.env.yaml"
        env = self.environment(mode, captcha_key, worker_url)
        # JSON is a YAML subset; values remain strings and cannot inject YAML.
        env_path.write_text(json.dumps(env, indent=2) + "\n")
        bindings = f"SPRING_DATASOURCE_PASSWORD={self.database_secret}:latest"
        if mode == "api":
            bindings += f",APP_BOOTSTRAP_SUPERADMIN_PASSWORD={self.bootstrap_secret}:latest"
        self.gc("run", "deploy", service, "--image", image, "--region", self.region,
                "--service-account", self.accounts[mode], "--port", "8080",
                "--cpu", "1", "--memory", "1Gi", "--min", "0",
                "--max", str(self.cfg[f"{mode}_max_instances"]),
                "--concurrency", "20" if mode == "api" else "2",
                "--timeout", "60" if mode == "api" else "180",
                "--env-vars-file", str(env_path), "--set-secrets", bindings,
                "--startup-probe", "tcpSocket.port=8080,timeoutSeconds=5,periodSeconds=5,failureThreshold=36",
                "--allow-unauthenticated" if mode == "api" else "--no-allow-unauthenticated",
                "--labels", "app=virtualwardrobe,environment=demo")
        return self.value("run", "services", "describe", service,
                          "--region", self.region, "--format=value(status.url)")

    def ensure_captcha(self) -> str:
        listing = json.loads(self.value("recaptcha", "keys", "list", "--format=json"))
        display = f"{self.base}-signup"
        existing = next((key for key in listing if key.get("displayName") == display), None)
        if existing:
            return existing["name"].split("/")[-1]
        key = json.loads(self.value("recaptcha", "keys", "create", "--display-name", display,
            "--web", "--domains", f'{self.cfg["firebase_site"]}.web.app,{self.cfg["firebase_site"]}.firebaseapp.com',
            "--integration-type", "score", "--format=json"))
        return key["name"].split("/")[-1]

    def schedule(self, worker_url: str):
        self.gc("run", "services", "add-iam-policy-binding", self.worker,
                "--region", self.region, "--member",
                f'serviceAccount:{self.accounts["dispatch"]}',
                "--role", "roles/run.invoker", capture=True)
        exists = self.exists("scheduler", "jobs", "describe", self.scheduler,
                             "--location", self.region)
        self.gc("scheduler", "jobs", "update" if exists else "create", "http",
                self.scheduler, "--location", self.region,
                "--schedule", "*/15 * * * *", "--time-zone", "UTC",
                "--uri", worker_url + "/internal/maintenance", "--http-method", "POST",
                "--headers", "Content-Type=application/json", "--message-body", "{}",
                "--oidc-service-account-email", self.accounts["dispatch"],
                "--oidc-token-audience", worker_url, "--attempt-deadline", "180s")

    def hosting(self, captcha_key: str):
        # Avoid the existing default Hosting site and StyleReel's URLs.
        sites = self.api_request("GET",
            f"https://firebasehosting.googleapis.com/v1beta1/projects/{self.project}/sites")
        site = self.cfg["firebase_site"]
        if not any(item["name"].endswith("/" + site) for item in sites.get("sites", [])):
            self.api_request("POST",
                f"https://firebasehosting.googleapis.com/v1beta1/projects/{self.project}/sites?siteId={site}", {})
        web_env = dict(os.environ, VITE_RECAPTCHA_SITE_KEY=captcha_key,
                       VITE_APP_ENVIRONMENT="demo")
        command(["npm", "ci", "--prefix", "apps/web"])
        command(["npm", "run", "build", "--prefix", "apps/web"], env=web_env)
        hosting_config = {"hosting": {
            "site": site, "public": str(ROOT / "apps/web/dist"),
            "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
            "rewrites": [
                {"source": "/api/**", "run": {"serviceId": self.api, "region": self.region}},
                {"source": "**", "destination": "/index.html"},
            ],
            "headers": [
                {"source": "**", "headers": [
                    {"key": "X-Content-Type-Options", "value": "nosniff"},
                    {"key": "Referrer-Policy", "value": "strict-origin-when-cross-origin"},
                    {"key": "Permissions-Policy", "value": "camera=(self), microphone=()"},
                ]},
                {"source": "/assets/**", "headers": [
                    {"key": "Cache-Control", "value": "public,max-age=31536000,immutable"}]},
                {"source": "/index.html", "headers": [
                    {"key": "Cache-Control", "value": "no-cache"}]},
            ],
        }}
        config_path = self.work / "firebase.json"
        config_path.write_text(json.dumps(hosting_config, indent=2) + "\n")
        command(["npx", "--yes", f'firebase-tools@{self.cfg["firebase_tools_version"]}',
                 "deploy", "--only", "hosting", "--project", self.project,
                 "--config", str(config_path), "--non-interactive"])

    def apply(self, image: str | None):
        if not (ROOT / "services/backend/Dockerfile").is_file():
            raise RuntimeError("Backend Dockerfile is missing; finish application implementation first.")
        if not (ROOT / "apps/web/package-lock.json").is_file():
            raise RuntimeError("Web lockfile is missing; finish application implementation first.")
        self.provision()
        captcha_key = self.ensure_captcha()
        if image is None:
            revision = command(["git", "rev-parse", "--short=12", "HEAD"], capture=True).stdout.decode().strip()
            image = f"{self.region}-docker.pkg.dev/{self.project}/{self.repo}/backend:{revision}"
            self.build(image)
        worker_url = self.deploy_service("worker", image, captcha_key, "")
        # Give maintenance/dispatch code its canonical URL after first creation.
        self.deploy_service("worker", image, captcha_key, worker_url)
        api_url = self.deploy_service("api", image, captcha_key, worker_url)
        self.schedule(worker_url)
        self.hosting(captcha_key)
        inventory = dict(self.plan(), image=image, api_url=api_url,
                         worker_url=worker_url,
                         web_url=f'https://{self.cfg["firebase_site"]}.web.app',
                         captcha_site_key=captcha_key,
                         deployed_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
        path = self.work / "deployment.json"
        path.write_text(json.dumps(inventory, indent=2) + "\n")
        print(json.dumps({"web_url": inventory["web_url"], "api_url": api_url,
                          "inventory": str(path), "image_provider": self.cfg["image_provider"]}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=ROOT / "infra/gcp-demo.json")
    parser.add_argument("--project", required=True,
                        help="Explicit intended project; must match the config")
    parser.add_argument("--region", help="Override application region")
    parser.add_argument("--apply", action="store_true", help="Provision and deploy billable resources")
    parser.add_argument("--image", help="Use a previously built image rather than building")
    args = parser.parse_args()
    cfg = json.loads(args.config.read_text())
    if args.project != EXPECTED_PROJECT or cfg.get("project_id") != EXPECTED_PROJECT:
        parser.error(f"This reviewed deployment is restricted to {EXPECTED_PROJECT}; no other project is allowed")
    if args.project != cfg["project_id"]:
        parser.error("--project must match the reviewed configuration; no implicit project switching")
    if cfg.get("prefix") != EXPECTED_PREFIX or cfg.get("firebase_site") != EXPECTED_HOSTING_SITE:
        parser.error("Resource prefix and Hosting site must remain the reviewed VirtualWardrobe names")
    if cfg["environment"] != "demo":
        parser.error("This script is restricted to the demo environment")
    if not re.fullmatch(r"[a-z][a-z0-9-]{4,28}[a-z0-9]", args.project):
        parser.error("Invalid GCP project ID")
    if args.region:
        cfg["region"] = args.region
    if not re.fullmatch(r"[a-z]+-[a-z]+[0-9]", cfg["region"]):
        parser.error("Invalid application region")
    if args.image:
        expected_image = f'{cfg["region"]}-docker.pkg.dev/{EXPECTED_PROJECT}/{EXPECTED_PREFIX}/backend'
        if not (args.image.startswith(expected_image + ":") or
                args.image.startswith(expected_image + "@sha256:")):
            parser.error("--image must be an image from this project's VirtualWardrobe backend repository")
    deploy = Deployment(cfg)
    if args.apply:
        deploy.apply(args.image)
    else:
        print(json.dumps(deploy.plan(), indent=2))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(f"Deployment stopped: {error}", file=sys.stderr)
        sys.exit(1)
