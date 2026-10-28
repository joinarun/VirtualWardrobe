#!/usr/bin/env python3
"""Plan or deploy the isolated VirtualWardrobe demo without service-account keys.

Default operation is read-only planning. --apply performs the described cloud
mutations. Every gcloud resource command carries an explicit --project flag.
Secrets are passed through stdin or HTTPS JSON bodies, never command arguments.
"""
from __future__ import annotations

import argparse
from decimal import Decimal, InvalidOperation
import json
import os
from pathlib import Path
import re
import secrets
import shlex
import stat
import subprocess
import sys
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from urllib.parse import urlencode, urlsplit

ROOT = Path(__file__).resolve().parents[2]
EXPECTED_PROJECT = "virtualtryon-511016"
EXPECTED_PREFIX = "virtualwardrobe"
EXPECTED_HOSTING_SITE = "virtualwardrobe-511016"
EXPECTED_REGION = "asia-south1"
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


def reviewed_limits(config: dict) -> bool:
    integer_bounds = {"api_max_instances": 2, "worker_max_instances": 1,
                      "daily_customer_limit": 5, "daily_global_limit": 100,
                      "saved_preview_limit": 100}
    session_bounds = {"session_customer_seconds": 2592000,
                      "session_workforce_seconds": 28800,
                      "session_anonymous_seconds": 1800}
    try:
        return (config.get("database_version") == "POSTGRES_17" and
                config.get("database_tier") == "db-f1-micro" and
                config.get("database_storage_gb") == 10 and config.get("database_storage_max_gb") == 20 and
                all(type(config.get(key)) is int and 1 <= config[key] <= bound for key, bound in integer_bounds.items()) and
                all(type(config.get(key)) is int and 60 <= config[key] <= bound for key, bound in session_bounds.items()) and
                Decimal("0") < Decimal(config.get("daily_provider_budget_usd", "0")) <= Decimal("5.00") and
                Decimal("0.25") <= Decimal(config.get("attempt_reservation_usd", "0")) <= Decimal("5.00") and
                isinstance(config.get("generation_enabled"), bool))
    except (TypeError, ValueError, InvalidOperation):
        return False


class Deployment:
    def __init__(self, config: dict):
        # Operator helpers import this class without passing through main().
        # Keep their project/resource/cost boundary identical to the CLI.
        if (config.get("project_id") != EXPECTED_PROJECT or config.get("prefix") != EXPECTED_PREFIX or
                config.get("firebase_site") != EXPECTED_HOSTING_SITE or config.get("region") != EXPECTED_REGION or
                config.get("environment") != "demo" or not reviewed_limits(config)):
            raise RuntimeError("Deployment helpers require the reviewed VirtualWardrobe project, names, region and cost bounds")
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
        self.work.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.work.chmod(0o700)

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
        if (len(args) >= 4 and args[:3] == ("run", "services", "describe") and
                args[3] in (self.api, self.worker) and error.strip() ==
                f"ERROR: (gcloud.run.services.describe) Cannot find service [{args[3]}]"):
            return False
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
            error.close()
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
            "sessions": {
                "customer_idle_seconds": self.cfg["session_customer_seconds"],
                "workforce_idle_seconds": self.cfg["session_workforce_seconds"],
                "anonymous_idle_seconds": self.cfg["session_anonymous_seconds"],
                "cookie_max_age_seconds": max(self.cfg["session_customer_seconds"], self.cfg["session_workforce_seconds"]),
                "legacy_sessions": "Existing browser-session cookies require a new sign-in for persistence",
            },
            "ai": {"provider": self.cfg["image_provider"],
                   "model": self.cfg["google_image_model"],
                   "location": self.cfg["google_image_location"],
                   "release_mode": "evaluation demo using fictional stores and owned synthetic fixtures; not production promotion",
                   "quality_gate": "40-pair human saree evaluation remains separate"},
            "cost": "Cloud SQL/storage accrue charges while idle. Cloud Run minimum=0 permits cold starts. Review current regional pricing; no fixed total is guaranteed.",
            "monthly_alert_budget": {
                **self.cfg["monthly_alert_budget"],
                "type": "alerts-only, not a hard cap or currency-conversion guarantee",
                "scope": "All virtualtryon-511016 project charges, including existing StyleReel usage",
                "recipients": "Existing default billing-account IAM recipients only",
                "thresholds": "50%, 90%, 100% actual spend and 100% forecast spend",
            },
        }

    def ensure_budget(self) -> dict:
        """Create only this new project-filtered alert budget; never edit one.

        Budget permission/API/currency failures are reported separately so they
        do not hide otherwise useful application-build or deployment evidence.
        No recipient/channel/IAM changes or manual messages are performed.
        """
        amount = self.cfg["monthly_alert_budget"]["amount"]
        currency = self.cfg["monthly_alert_budget"]["currency"]
        display = "VirtualWardrobe project monthly demo alerts"
        result = {
            "status": "not-configured", "amount": amount, "currency": currency,
            "scope": f"All {self.project} charges, including existing StyleReel",
            "alerts_only": True, "hard_cap": False,
            "recipients": "Default billing-account IAM recipients only",
            "existing_budgets_modified": False,
        }
        try:
            billing = json.loads(self.value("billing", "projects", "describe", self.project,
                                            "--format=json"))
            account = billing.get("billingAccountName", "")
            if not billing.get("billingEnabled") or not account:
                raise RuntimeError("The intended project has no enabled billing account")
            info = json.loads(self.value("billing", "accounts", "describe", account,
                                        "--format=json"))
            project_number = self.value("projects", "describe", self.project,
                                        "--format=value(projectNumber)")
            filters = f"projects/{project_number}"
            create = ["gcloud", "billing", "budgets", "create", "--billing-account", account,
                      "--display-name", display, "--budget-amount", amount + currency,
                      "--calendar-period", "month", "--filter-projects", filters,
                      "--credit-types-treatment", "exclude-all-credits",
                      "--threshold-rule", "percent=0.50",
                      "--threshold-rule", "percent=0.90",
                      "--threshold-rule", "percent=1.00",
                      "--threshold-rule", "percent=1.00,basis=forecasted-spend",
                      "--project", self.project, "--quiet", "--format=json"]
            result["remaining_commands"] = [
                f"gcloud services enable billingbudgets.googleapis.com --project {self.project}",
                shlex.join(create),
            ]
            if info.get("currencyCode") != currency:
                result.update(status="currency-mismatch", reason=(
                    f'Billing account currency is {info.get("currencyCode", "unknown")}; '
                    f'reviewed budget currency is {currency}. No conversion or creation attempted.'))
                result["remaining_commands"] = result["remaining_commands"][:1]
                result["remaining_configuration"] = "Review an alert amount in the account's current native currency before creating a budget."
                return result
            enabled = self.gc("services", "enable", "billingbudgets.googleapis.com",
                              capture=True, check=False)
            if enabled.returncode:
                result.update(status="api-enable-unavailable",
                              reason=enabled.stderr.decode(errors="replace")[-4000:])
                return result
            listing = self.gc("billing", "budgets", "list", "--billing-account", account,
                              "--format=json", capture=True, check=False)
            if listing.returncode:
                result.update(status="permission-unavailable",
                              reason=listing.stderr.decode(errors="replace")[-4000:])
                return result
            budgets = json.loads(listing.stdout)
            matches = [budget for budget in budgets if budget.get("displayName") == display]
            if matches:
                if len(matches) != 1:
                    result.update(status="existing-name-conflict",
                                  reason="Several budgets have the intended display name; none were changed")
                    return result
                budget = matches[0]
                money = budget.get("amount", {}).get("specifiedAmount", {})
                existing_amount = Decimal(str(money.get("units", "0"))) + Decimal(
                    str(money.get("nanos", 0))) / Decimal("1000000000")
                rules = budget.get("allUpdatesRule") or {}
                budget_filter = budget.get("budgetFilter", {})
                exact_scope = (budget_filter.get("projects", []) == [filters] and
                               not any(budget_filter.get(key) for key in
                                       ("services", "labels", "subaccounts", "resourceAncestors", "creditTypes")))
                thresholds = {
                    (Decimal(str(rule.get("thresholdPercent", "0"))),
                     rule.get("spendBasis", "CURRENT_SPEND"))
                    for rule in budget.get("thresholdRules", [])
                }
                required_thresholds = {
                    (Decimal("0.50"), "CURRENT_SPEND"),
                    (Decimal("0.90"), "CURRENT_SPEND"),
                    (Decimal("1.00"), "CURRENT_SPEND"),
                    (Decimal("1.00"), "FORECASTED_SPEND"),
                }
                expected = (exact_scope and money.get("currencyCode") == currency and
                            existing_amount == Decimal(amount) and
                            budget_filter.get("calendarPeriod", "MONTH") == "MONTH" and
                            budget_filter.get("creditTypesTreatment") == "EXCLUDE_ALL_CREDITS" and
                            required_thresholds.issubset(thresholds) and
                            not rules.get("disableDefaultIamRecipients", False) and
                            not rules.get("monitoringNotificationChannels") and
                            not rules.get("pubsubTopic"))
                result.update(status="already-present" if expected else "existing-config-mismatch",
                              name=budget.get("name"),
                              reason="Existing budget preserved without modification")
                if expected:
                    result.pop("remaining_commands", None)
                return result
            created = command(create, capture=True, check=False)
            if created.returncode:
                result.update(status="creation-unavailable",
                              reason=created.stderr.decode(errors="replace")[-4000:])
                return result
            budget = json.loads(created.stdout)
            result.update(status="created", name=budget.get("name"))
            result.pop("remaining_commands", None)
            return result
        except (RuntimeError, subprocess.CalledProcessError, ValueError) as error:
            result["reason"] = str(error)
            return result

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
                "--uniform-bucket-level-access", "--public-access-prevention",
                "--lifecycle-file", str(lifecycle))
        if private:
            cors = [{
                "origin": [f'https://{self.cfg["firebase_site"]}.web.app',
                           f'https://{self.cfg["firebase_site"]}.firebaseapp.com'],
                "method": ["GET", "HEAD", "PUT"],
                "responseHeader": ["Content-Type", "Cache-Control", "Content-Length", "ETag", "x-goog-generation", "x-goog-if-generation-match"],
                "maxAgeSeconds": 300,
            }]
            cors_path = self.work / "private-media-cors.json"
            cors_path.write_text(json.dumps(cors, indent=2) + "\n")
            self.gc("storage", "buckets", "update", f"gs://{bucket}",
                    "--cors-file", str(cors_path))
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
        for role in ("api", "worker"):
            self.project_role("roles/cloudtasks.enqueuer",
                              f'serviceAccount:{self.accounts[role]}')
        self.project_role("roles/recaptchaenterprise.agent",
                          f'serviceAccount:{self.accounts["api"]}')
        self.project_role("roles/aiplatform.user",
                          f'serviceAccount:{self.accounts["worker"]}')
        for role in ("api", "worker"):
            self.gc("iam", "service-accounts", "add-iam-policy-binding",
                    self.accounts["dispatch"], "--member",
                    f'serviceAccount:{self.accounts[role]}',
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
                    "--deletion-protection")
        # The installed GA gcloud SQL track does not expose label flags.
        # Patch only this owned instance through the supported SQL Admin API,
        # retaining unrelated labels and using settingsVersion for concurrency.
        instance = json.loads(self.value("sql", "instances", "describe", self.db, "--format=json"))
        settings = instance["settings"]
        labels = dict(settings.get("userLabels", {}))
        desired_labels = dict(labels, app="virtualwardrobe", environment="demo")
        if labels != desired_labels:
            operation = self.api_request("PATCH",
                f"https://sqladmin.googleapis.com/sql/v1beta4/projects/{self.project}/instances/{self.db}",
                {"settings": {"settingsVersion": settings["settingsVersion"], "userLabels": desired_labels}})
            self.gc("sql", "operations", "wait", operation["name"], "--timeout", "300")
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

        queue_exists = self.exists("tasks", "queues", "describe", self.queue,
                                   "--location", self.region)
        self.gc("tasks", "queues", "update" if queue_exists else "create", self.queue,
                "--location", self.region, "--max-concurrent-dispatches", "2",
                "--max-dispatches-per-second", "1", "--max-attempts", "2",
                "--min-backoff", "10s", "--max-backoff", "60s")

    def build(self, image: str):
        build_config = {
            "steps": [{"name": "gcr.io/cloud-builders/docker",
                       "args": ["build", "--platform", "linux/amd64", "--target", "runtime", "-t", image, "."]}],
            "images": [image], "options": {"logging": "CLOUD_LOGGING_ONLY"},
            "timeout": "1200s",
        }
        config_path = self.work / "cloudbuild.json"
        config_path.write_text(json.dumps(build_config, indent=2) + "\n")
        self.gc("builds", "submit", "services/backend", "--config", str(config_path),
                "--ignore-file", str(ROOT / "infra/backend.gcloudignore"),
                "--region", self.region, "--service-account",
                f'projects/{self.project}/serviceAccounts/{self.accounts["build"]}',
                "--gcs-source-staging-dir", f"gs://{self.build_bucket}/source")

    def environment(self, mode: str, captcha_key: str, worker_url: str) -> dict[str, str]:
        return {
            "APP_ENVIRONMENT": "demo", "APP_MODE": mode,
            "JAVA_TOOL_OPTIONS": "-XX:MaxRAMPercentage=70",
            "LOGGING_STRUCTURED_FORMAT_CONSOLE": "logstash",
            "LOGGING_STRUCTURED_JSON_RENAME_LEVEL": "severity",
            "LOGGING_STRUCTURED_JSON_EXCLUDE": "stack_trace",
            "APP_ADAPTER_MODE": "gcp", "APP_IMAGE_PROVIDER": self.cfg["image_provider"],
            "GOOGLE_CLOUD_PROJECT": self.project, "APP_GCP_PROJECT": self.project,
            "APP_STORAGE_BUCKET": self.private_bucket,
            "APP_STORAGE_SIGNER_SERVICE_ACCOUNT": self.accounts["api"],
            "APP_TASKS_LOCATION": self.region, "APP_TASKS_QUEUE": self.queue,
            "APP_TASKS_SERVICE_ACCOUNT": self.accounts["dispatch"],
            "APP_WORKER_URL": worker_url,
            "APP_AI_PROJECT": self.project,
            "APP_AI_MODEL": self.cfg["google_image_model"],
            "APP_AI_LOCATION": self.cfg["google_image_location"],
            "APP_AI_TIMEOUT_SECONDS": "120",
            "APP_RECAPTCHA_SITE_KEY": captcha_key,
            "APP_RECAPTCHA_EXPECTED_ACTION": "signup",
            "APP_RECAPTCHA_ALLOWED_HOSTNAMES": f'{self.cfg["firebase_site"]}.web.app,{self.cfg["firebase_site"]}.firebaseapp.com',
            "APP_RECAPTCHA_MIN_SCORE": "0.5", "APP_CAPTCHA_MODE": "google",
            "APP_GENERATION_CUSTOMER_DAILY_LIMIT": str(self.cfg["daily_customer_limit"]),
            "APP_GENERATION_GLOBAL_DAILY_LIMIT": str(self.cfg["daily_global_limit"]),
            "APP_GENERATION_DAILY_BUDGET_USD": self.cfg["daily_provider_budget_usd"],
            "APP_GENERATION_ENABLED": str(self.cfg["generation_enabled"]).lower(),
            "APP_GENERATION_ATTEMPT_RESERVATION_USD": self.cfg["attempt_reservation_usd"],
            "APP_GENERATION_SAVED_LIMIT": str(self.cfg["saved_preview_limit"]),
            "SPRING_DATASOURCE_URL":
                f"jdbc:postgresql:///{self.dbname}?cloudSqlInstance={self.project}:{self.region}:{self.db}"
                "&socketFactory=com.google.cloud.sql.postgres.SocketFactory&cloudSqlRefreshStrategy=lazy",
            "SPRING_DATASOURCE_USERNAME": self.dbuser,
            "SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE": "5" if mode == "api" else "3",
            "SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE": "0",
            "SESSION_COOKIE_SECURE": "true",
            "APP_SESSION_CUSTOMER_SECONDS": str(self.cfg["session_customer_seconds"]),
            "APP_SESSION_WORKFORCE_SECONDS": str(self.cfg["session_workforce_seconds"]),
            "APP_SESSION_ANONYMOUS_SECONDS": str(self.cfg["session_anonymous_seconds"]),
            "APP_BOOTSTRAP_SUPERADMIN_EMAIL": self.cfg["bootstrap_email"],
        }

    def canonical_worker_url(self, value: object) -> str:
        """Accept only the canonical HTTPS origin returned for this owned worker."""
        if not isinstance(value, str):
            raise RuntimeError("The owned worker's canonical URL is unavailable")
        try:
            parsed = urlsplit(value)
        except ValueError:
            raise RuntimeError("The owned worker's canonical URL is invalid") from None
        if (parsed.scheme != "https" or parsed.netloc != parsed.hostname or parsed.path or
                parsed.query or parsed.fragment or not re.fullmatch(
                    re.escape(self.worker) + r"-[a-z0-9-]+(?:\.[a-z0-9-]+)*\.run\.app", parsed.hostname or "")):
            raise RuntimeError("The owned worker's canonical URL is invalid")
        return value

    def previous_worker_url(self, previous: dict) -> str:
        if (previous.get("project_id") != self.project or previous.get("region") != self.region or
                not isinstance(previous.get("services"), dict) or "worker" not in previous["services"]):
            raise RuntimeError("The previous release must identify the reviewed project and worker")
        worker = previous["services"]["worker"]
        if worker is None:
            return ""
        if not isinstance(worker, dict) or worker.get("service") != self.worker:
            raise RuntimeError("The previous release must identify the owned worker")
        return self.canonical_worker_url(worker.get("url"))

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
                "--startup-probe", "httpGet.path=/actuator/health/readiness,httpGet.port=8080,timeoutSeconds=5,periodSeconds=5,failureThreshold=36",
                "--allow-unauthenticated" if mode == "api" else "--no-allow-unauthenticated",
                "--labels", "app=virtualwardrobe,environment=demo")
        return self.value("run", "services", "describe", service,
                          "--region", self.region, "--format=value(status.url)")

    def ensure_captcha(self, *, required: bool = False) -> str:
        listing = json.loads(self.value("recaptcha", "keys", "list", "--format=json"))
        display = f"{self.base}-signup"
        existing = [key for key in listing if key.get("displayName") == display]
        if existing:
            settings = existing[0].get("webSettings", {})
            expected_domains = {f'{self.cfg["firebase_site"]}.web.app', f'{self.cfg["firebase_site"]}.firebaseapp.com'}
            if (len(existing) != 1 or settings.get("integrationType") != "SCORE" or
                    settings.get("allowAllDomains", False) or set(settings.get("allowedDomains", [])) != expected_domains):
                raise RuntimeError("Existing VirtualWardrobe CAPTCHA configuration conflicts with the reviewed site domains")
            return existing[0]["name"].split("/")[-1]
        if required:
            raise RuntimeError("Web-only release requires the existing reviewed CAPTCHA key")
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
                "--schedule", "* * * * *", "--time-zone", "UTC",
                "--uri", worker_url + "/internal/maintenance", "--http-method", "POST",
                "--update-headers" if exists else "--headers", "Content-Type=application/json", "--message-body", "{}",
                "--oidc-service-account-email", self.accounts["dispatch"],
                "--oidc-token-audience", worker_url, "--attempt-deadline", "180s")

    def hosting(self, captcha_key: str, *, require_existing: bool = False, before_publish=None):
        # Avoid the existing default Hosting site and StyleReel's URLs.
        site = self.cfg["firebase_site"]
        page_token = ""
        found = False
        while True:
            query = urlencode(dict(pageSize=100, **({"pageToken": page_token} if page_token else {})))
            sites = self.api_request("GET",
                f"https://firebasehosting.googleapis.com/v1beta1/projects/{self.project}/sites?{query}")
            if any(item.get("name") == f"projects/{self.project}/sites/{site}" for item in sites.get("sites", [])):
                found = True
                break
            page_token = sites.get("nextPageToken", "")
            if not page_token:
                break
        if not found:
            if require_existing:
                raise RuntimeError("Web-only release requires the existing dedicated Hosting site")
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
                {"source": "/api/**", "run": {"serviceId": self.api, "region": self.region, "pinTag": True}},
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
                {"source": "/fonts/*.woff2", "headers": [
                    {"key": "Cache-Control", "value": "public,max-age=31536000,immutable"}]},
                {"source": "/index.html", "headers": [
                    {"key": "Cache-Control", "value": "no-cache"}]},
            ],
        }}
        config_path = self.work / "firebase.json"
        config_path.write_text(json.dumps(hosting_config, indent=2) + "\n")
        if before_publish is not None:
            before_publish()
        command(["npx", "--yes", f'firebase-tools@{self.cfg["firebase_tools_version"]}',
                 "deploy", "--only", "hosting", "--project", self.project,
                 "--config", str(config_path), "--non-interactive"])

    def release_state(self, *, required: bool = False) -> dict:
        """Read only nonsecret revision/release fields for this app's rollback."""
        services = {}
        for mode, name in (("api", self.api), ("worker", self.worker)):
            if not self.exists("run", "services", "describe", name, "--region", self.region):
                if required:
                    raise RuntimeError("A deployed application service was not found")
                services[mode] = None
                continue
            service = json.loads(self.value("run", "services", "describe", name,
                                             "--region", self.region, "--format=json"))
            ready = service.get("status", {}).get("latestReadyRevisionName", "")
            if not re.fullmatch(re.escape(name) + r"-[a-z0-9-]{1,40}", ready):
                raise RuntimeError("The owned service has no valid ready revision")
            revision = json.loads(self.value("run", "revisions", "describe", ready,
                                              "--region", self.region, "--format=json"))
            digest = revision.get("status", {}).get("imageDigest", "")
            if not re.search(r"(?:^|@)sha256:[0-9a-f]{64}$", digest):
                raise RuntimeError("The deployed revision's immutable image digest is unavailable")
            services[mode] = {"service": name, "ready_revision": ready, "image_digest": digest,
                "url": service.get("status", {}).get("url"),
                "traffic": [{key: item[key] for key in ("revisionName", "percent", "tag") if key in item}
                            for item in service.get("status", {}).get("traffic", [])]}
        # Query only the dedicated site's live channel. Do not assume release
        # ordering or include user/email fields from the Hosting response.
        releases, token, found = [], "", False
        while True:
            query = urlencode(dict(pageSize=100, **({"pageToken": token} if token else {})))
            page = self.api_request("GET", f"https://firebasehosting.googleapis.com/v1beta1/projects/{self.project}/sites?{query}")
            found = found or any(item.get("name") == f'projects/{self.project}/sites/{self.cfg["firebase_site"]}' for item in page.get("sites", []))
            token = page.get("nextPageToken", "")
            if not token:
                break
        hosting = None
        if found:
            token = ""
            while True:
                query = urlencode(dict(pageSize=100, **({"pageToken": token} if token else {})))
                page = self.api_request("GET", f'https://firebasehosting.googleapis.com/v1beta1/sites/{self.cfg["firebase_site"]}/channels/live/releases?{query}')
                for item in page.get("releases", []):
                    version = item.get("version", {}).get("name", "")
                    if re.fullmatch(r"sites/" + re.escape(self.cfg["firebase_site"]) + r"/versions/[A-Za-z0-9_-]+", version):
                        releases.append({"name": item.get("name"), "version": version, "release_time": item.get("releaseTime", "")})
                token = page.get("nextPageToken", "")
                if not token:
                    break
            if releases:
                hosting = max(releases, key=lambda item: item["release_time"])
        if required and (hosting is None or services["api"]["image_digest"] != services["worker"]["image_digest"]):
            raise RuntimeError("Hosting release and equal API/worker immutable images must be verified")
        return {"project_id": self.project, "region": self.region, "services": services,
                "hosting_site": self.cfg["firebase_site"], "hosting_release": hosting,
                "observed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}

    def prepare(self):
        """Prepare the reviewed cloud base without publishing application code."""
        budget = self.ensure_budget()
        (self.work / "budget-result.json").write_text(json.dumps(budget, indent=2) + "\n")
        print(f'Billing alert budget: {budget["status"]} (alerts only, no hard cap).', flush=True)
        self.provision()
        captcha_key = self.ensure_captcha()
        inventory = dict(self.plan(), captcha_site_key=captcha_key,
                         billing_alert_budget=budget, status="PROVISIONED_NOT_DEPLOYED",
                         provisioned_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
        path = self.work / "provisioning.json"
        path.write_text(json.dumps(inventory, indent=2) + "\n")
        print(f"Cloud base prepared; application not published. Inventory: {path}", flush=True)
        return budget, captcha_key

    @staticmethod
    def private_json(path: Path, value: dict):
        """Keep release metadata compatible with protected operator inputs."""
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, "w") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(json.dumps(value, indent=2) + "\n")

    def web_inventory(self) -> dict:
        path = self.work / "deployment.json"
        try:
            metadata = path.lstat()
            if (not stat.S_ISREG(metadata.st_mode) or stat.S_IMODE(metadata.st_mode) != 0o600 or
                    metadata.st_uid != os.getuid() or metadata.st_nlink != 1):
                raise RuntimeError("Web-only release requires an owner-only regular release inventory")
            inventory = json.loads(path.read_text())
        except (OSError, ValueError):
            raise RuntimeError("Web-only release requires a valid protected deployment inventory") from None
        resources = inventory.get("resources", {})
        if (inventory.get("project_id") != self.project or inventory.get("region") != self.region or
                inventory.get("environment") != "demo" or
                resources.get("firebase_hosting_site") != self.cfg["firebase_site"] or
                resources.get("cloud_run_api") != self.api or resources.get("cloud_run_worker") != self.worker):
            raise RuntimeError("Web-only inventory must identify the reviewed project and owned resources")
        source = inventory.get("source_revision")
        backend = inventory.get("backend_source_revision", source)
        if not all(isinstance(value, str) and re.fullmatch(r"[0-9a-f]{40}", value) for value in (source, backend)):
            raise RuntimeError("Web-only inventory requires full recorded source revisions")
        expected_image = f"{self.region}-docker.pkg.dev/{self.project}/{self.repo}/backend:{backend[:12]}"
        if inventory.get("image") != expected_image:
            raise RuntimeError("Web-only inventory image must identify the recorded backend source")
        if not isinstance(inventory.get("captcha_site_key"), str) or not inventory["captcha_site_key"]:
            raise RuntimeError("Web-only inventory requires the existing CAPTCHA key")
        return inventory

    def check_web_target(self, inventory: dict, observed: dict, *, hosting_unchanged: bool = True):
        if (observed.get("project_id") != self.project or observed.get("region") != self.region or
                observed.get("hosting_site") != self.cfg["firebase_site"]):
            raise RuntimeError("Web-only live target must identify the reviewed project and site")
        expected_digest = None
        for mode, name in (("api", self.api), ("worker", self.worker)):
            expected = inventory.get("runtime", {}).get(mode, {})
            actual = observed.get("services", {}).get(mode, {})
            digest = expected.get("image_digest", "")
            if (expected.get("service") != name or not re.fullmatch(re.escape(name) + r"-[a-z0-9-]{1,40}", expected.get("ready_revision", "")) or
                    not re.fullmatch(re.escape(f"{self.region}-docker.pkg.dev/{self.project}/{self.repo}/backend@sha256:") + r"[0-9a-f]{64}", digest)):
                raise RuntimeError("Web-only inventory requires owned ready revisions and immutable backend images")
            if expected_digest is not None and digest != expected_digest:
                raise RuntimeError("Web-only API and worker must share the recorded immutable image")
            expected_digest = digest
            if mode == "worker":
                self.canonical_worker_url(expected.get("url"))
            elif not re.fullmatch(r"https://" + re.escape(name) + r"-[a-z0-9-]+(?:\.[a-z0-9-]+)*\.run\.app", expected.get("url", "")):
                raise RuntimeError("Web-only inventory requires the owned API canonical URL")
            if any(actual.get(key) != expected.get(key) for key in ("service", "ready_revision", "image_digest", "url")):
                raise RuntimeError("Web-only live backend differs from the recorded release")
            # Hosting pinTag may add a metadata tag on the same API revision.
            # It must never move traffic or publish a different backend revision.
            for runtime in (expected, actual):
                active = [item for item in runtime.get("traffic", []) if item.get("percent", 0)]
                if (len(active) != 1 or active[0].get("revisionName") != expected["ready_revision"] or
                        type(active[0].get("percent")) is not int or active[0]["percent"] != 100):
                    raise RuntimeError("Web-only release requires 100 percent traffic on the recorded ready revision")
        release = observed.get("hosting_release")
        if (not isinstance(release, dict) or not re.fullmatch(r"sites/" + re.escape(self.cfg["firebase_site"]) + r"/versions/[A-Za-z0-9_-]+", release.get("version", "")) or
                (hosting_unchanged and release != inventory.get("hosting_release"))):
            raise RuntimeError("Web-only live Hosting release differs from the recorded inventory")

    def web_source(self, expected: str | None = None) -> str:
        dirty = command(["git", "status", "--porcelain=v1", "--untracked-files=all"], capture=True).stdout.decode().strip()
        if dirty:
            raise RuntimeError("Commit tracked and non-ignored source changes before building or publishing this release")
        source = command(["git", "rev-parse", "HEAD"], capture=True).stdout.decode().strip()
        if not re.fullmatch(r"[0-9a-f]{40}", source):
            raise RuntimeError("Web-only release requires an exact full HEAD revision")
        if expected is not None and source != expected:
            raise RuntimeError("Web-only source HEAD changed during the build; nothing was published")
        return source

    def apply_web_only(self):
        if not (ROOT / "apps/web/package-lock.json").is_file():
            raise RuntimeError("Web lockfile is missing")
        source = self.web_source()
        inventory = self.web_inventory()
        backend = inventory.get("backend_source_revision", inventory["source_revision"])
        ancestor = command(["git", "merge-base", "--is-ancestor", backend, "HEAD"], capture=True, check=False)
        unchanged = command(["git", "diff", "--quiet", backend, "HEAD", "--", "services/backend", "infra/backend.gcloudignore", "infra/gcp-demo.json"], capture=True, check=False)
        if ancestor.returncode != 0 or unchanged.returncode != 0:
            raise RuntimeError("Web-only release requires the recorded backend/config tree unchanged from its source ancestor")
        previous = self.release_state(required=True)
        self.check_web_target(inventory, previous)
        captcha = self.ensure_captcha(required=True)
        if captcha != inventory["captcha_site_key"]:
            raise RuntimeError("Web-only CAPTCHA key differs from the recorded backend configuration")
        directory = self.work / "releases"
        directory.mkdir(exist_ok=True, mode=0o700)
        prior_path = directory / f"before-web-{time.time_ns()}-{source[:12]}.json"
        self.private_json(prior_path, previous)
        # Recheck after npm install/build, immediately before Firebase publishes.
        def before_publish():
            self.web_source(source)
            self.check_web_target(inventory, self.release_state(required=True))
        self.hosting(captcha, require_existing=True,
                     before_publish=before_publish)
        deployed = self.release_state(required=True)
        self.check_web_target(inventory, deployed, hosting_unchanged=False)
        inventory.update(source_revision=source, frontend_source_revision=source,
                         backend_source_revision=backend, release_mode="web-only",
                         runtime=deployed["services"], hosting_release=deployed["hosting_release"],
                         previous_release_inventory=str(prior_path),
                         deployed_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
        self.private_json(self.work / "deployment.json", inventory)
        self.private_json(directory / f"deployed-web-{time.time_ns()}-{source[:12]}.json", inventory)
        print(json.dumps({"web_url": inventory["web_url"], "source_revision": source,
                          "backend_source_revision": backend, "release_mode": "web-only",
                          "inventory": str(self.work / "deployment.json")}, indent=2))

    def apply(self, image: str | None):
        if not (ROOT / "services/backend/Dockerfile").is_file():
            raise RuntimeError("Backend Dockerfile is missing; finish application implementation first.")
        if not (ROOT / "apps/web/package-lock.json").is_file():
            raise RuntimeError("Web lockfile is missing; finish application implementation first.")
        dirty = command(["git", "status", "--porcelain=v1", "--untracked-files=all"], capture=True).stdout.decode().strip()
        if dirty:
            raise RuntimeError("Commit tracked and non-ignored source changes before building or publishing this release")
        source_revision = command(["git", "rev-parse", "HEAD"], capture=True).stdout.decode().strip()
        expected_image = f"{self.region}-docker.pkg.dev/{self.project}/{self.repo}/backend:{source_revision[:12]}"
        if image is not None and image != expected_image:
            raise RuntimeError("--image may reuse only this clean HEAD's exact backend:HEAD12 tag; rollback uses the recorded previous release")
        previous = self.release_state()
        known_worker_url = self.previous_worker_url(previous)
        release_directory = self.work / "releases"
        release_directory.mkdir(exist_ok=True, mode=0o700)
        prior_path = release_directory / f"before-{time.time_ns()}-{source_revision[:12]}.json"
        prior_path.write_text(json.dumps(previous, indent=2) + "\n")
        budget, captcha_key = self.prepare()
        if image is None:
            image = expected_image
            self.build(image)
        worker_url = self.canonical_worker_url(self.deploy_service("worker", image, captcha_key, known_worker_url))
        if known_worker_url:
            # Existing queue/Scheduler tokens keep working on the first new
            # revision. Never publish an empty audience during a redeployment.
            if worker_url != known_worker_url:
                raise RuntimeError("The owned worker's canonical URL changed; API/Hosting publication stopped")
        else:
            # Only first creation needs URL discovery before authenticated work.
            confirmed = self.canonical_worker_url(self.deploy_service("worker", image, captcha_key, worker_url))
            if confirmed != worker_url:
                raise RuntimeError("The owned worker's canonical URL changed; API/Hosting publication stopped")
        api_url = self.deploy_service("api", image, captcha_key, worker_url)
        self.schedule(worker_url)
        self.hosting(captcha_key)
        deployed_state = self.release_state(required=True)
        inventory = dict(self.plan(), image=image, source_revision=source_revision,
                         frontend_source_revision=source_revision, backend_source_revision=source_revision,
                         release_mode="full", api_url=api_url,
                         worker_url=worker_url,
                         runtime=deployed_state["services"], hosting_release=deployed_state["hosting_release"],
                         previous_release_inventory=str(prior_path),
                         web_url=f'https://{self.cfg["firebase_site"]}.web.app',
                         captcha_site_key=captcha_key, billing_alert_budget=budget,
                         deployed_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
        path = self.work / "deployment.json"
        self.private_json(path, inventory)
        self.private_json(release_directory / f"deployed-{time.time_ns()}-{source_revision[:12]}.json", inventory)
        print(json.dumps({"web_url": inventory["web_url"], "api_url": api_url,
                          "inventory": str(path), "image_provider": self.cfg["image_provider"]}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=ROOT / "infra/gcp-demo.json")
    parser.add_argument("--project", required=True,
                        help="Explicit intended project; must match the config")
    parser.add_argument("--region", help="Override application region")
    parser.add_argument("--apply", action="store_true", help="Provision and deploy billable resources")
    parser.add_argument("--provision-only", action="store_true",
                        help="With --apply, prepare the cloud base without building or publishing the app")
    parser.add_argument("--image", help="Use a previously built image rather than building")
    parser.add_argument("--web-only", action="store_true",
                        help="With --apply, publish only web assets against the verified existing backend")
    args = parser.parse_args()
    if args.provision_only and args.image:
        parser.error("--provision-only does not build or deploy an image")
    if args.web_only and (args.provision_only or args.image):
        parser.error("--web-only cannot provision resources or select a backend image")
    cfg = json.loads(args.config.read_text())
    if args.project != EXPECTED_PROJECT or cfg.get("project_id") != EXPECTED_PROJECT:
        parser.error(f"This reviewed deployment is restricted to {EXPECTED_PROJECT}; no other project is allowed")
    if args.project != cfg["project_id"]:
        parser.error("--project must match the reviewed configuration; no implicit project switching")
    if cfg.get("prefix") != EXPECTED_PREFIX or cfg.get("firebase_site") != EXPECTED_HOSTING_SITE:
        parser.error("Resource prefix and Hosting site must remain the reviewed VirtualWardrobe names")
    if cfg["environment"] != "demo":
        parser.error("This script is restricted to the demo environment")
    if cfg.get("image_provider") not in ("mock", "google"):
        parser.error("The reviewed demo image provider must be mock or google")
    if not re.fullmatch(r"[a-z][a-z0-9-]{4,28}[a-z0-9]", args.project):
        parser.error("Invalid GCP project ID")
    if cfg.get("region") != EXPECTED_REGION or (args.region and args.region != EXPECTED_REGION):
        parser.error(f"This reviewed demo is restricted to {EXPECTED_REGION}; changing regions requires a separate resource review")
    if not reviewed_limits(cfg):
        parser.error("The reviewed database, scaling and application-spend bounds must remain within the demo limits")
    if args.image:
        expected_image = f'{cfg["region"]}-docker.pkg.dev/{EXPECTED_PROJECT}/{EXPECTED_PREFIX}/backend'
        if not re.fullmatch(re.escape(expected_image) + r"(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}|@sha256:[0-9a-f]{64})", args.image):
            parser.error("--image must be an image from this project's VirtualWardrobe backend repository")
    deploy = Deployment(cfg)
    if args.apply:
        if args.web_only:
            deploy.apply_web_only()
        elif args.provision_only:
            deploy.prepare()
        else:
            deploy.apply(args.image)
    else:
        plan = deploy.plan()
        if args.web_only:
            plan.update(release_mode="web-only", application_build="apps/web only",
                        backend="Existing verified API/worker revisions and immutable image retained",
                        cloud_changes="Dedicated Hosting assets/config and API pinTag metadata only",
                        required_inventory=str(deploy.work / "deployment.json"))
        print(json.dumps(plan, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(f"Deployment stopped: {error}", file=sys.stderr)
        sys.exit(1)
