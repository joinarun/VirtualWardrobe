"""Controlled deployment-contract checks; never build, deploy or contact Google."""
import importlib.util
import contextlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch, Mock

SPEC = importlib.util.spec_from_file_location("vw_deploy", Path(__file__).with_name("deploy.py"))
DEPLOY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DEPLOY)


class DeploymentContractTest(unittest.TestCase):
    def setUp(self):
        self.config = json.loads((DEPLOY.ROOT / "infra/gcp-demo.json").read_text())
        self.deployment = DEPLOY.Deployment(self.config)
        self.directory = tempfile.TemporaryDirectory(prefix="virtualwardrobe-deploy-test-")
        self.addCleanup(self.directory.cleanup)
        self.deployment.work = Path(self.directory.name)

    def test_cloud_build_is_explicit_amd64_runtime_with_scoped_source_and_identity(self):
        with patch.object(self.deployment, "gc") as gc:
            self.deployment.build("example-image")
        config = json.loads((self.deployment.work / "cloudbuild.json").read_text())
        self.assertEqual(config["steps"][0]["args"], ["build", "--platform", "linux/amd64", "--target", "runtime", "-t", "example-image", "."])
        self.assertEqual(config["options"]["logging"], "CLOUD_LOGGING_ONLY")
        args = gc.call_args.args
        self.assertIn(str(DEPLOY.ROOT / "infra/backend.gcloudignore"), args)
        self.assertIn("projects/virtualtryon-511016/serviceAccounts/virtualwardrobe-demo-build@virtualtryon-511016.iam.gserviceaccount.com", args)

    def test_installed_cli_exact_owned_service_absence_diagnostic_is_recognized(self):
        for name in (self.deployment.api, self.deployment.worker):
            missing = f"ERROR: (gcloud.run.services.describe) Cannot find service [{name}]\n".encode()
            with patch.object(self.deployment, "gc", return_value=Mock(returncode=1, stderr=missing)):
                self.assertFalse(self.deployment.exists("run", "services", "describe", name, "--region", self.deployment.region))

    def test_permission_network_foreign_and_unrecognized_diagnostics_still_fail_closed(self):
        expected = f"ERROR: (gcloud.run.services.describe) Cannot find service [{self.deployment.api}]"
        cases = [(self.deployment.api, "Permission denied"), (self.deployment.api, "Connection timed out"),
                 (self.deployment.api, "ERROR: Cannot find anything"),
                 (self.deployment.api, "ERROR: (gcloud.run.services.describe) Cannot find service [stylereel]"),
                 ("stylereel", "ERROR: (gcloud.run.services.describe) Cannot find service [stylereel]"),
                 (self.deployment.api, expected + "\nPermission denied")]
        for name, error in cases:
            with patch.object(self.deployment, "gc", return_value=Mock(returncode=1, stderr=error.encode())):
                with self.assertRaisesRegex(RuntimeError, "Resource lookup failed"):
                    self.deployment.exists("run", "services", "describe", name, "--region", self.deployment.region)

    def test_hosting_uses_only_dedicated_site_and_pins_api_revision(self):
        responses = [
            {"sites": [{"name": "projects/virtualtryon-511016/sites/virtualtryon-511016"}], "nextPageToken": "next token"},
            {"sites": [{"name": "projects/virtualtryon-511016/sites/virtualwardrobe-511016"}]},
        ]
        with patch.object(self.deployment, "api_request", side_effect=responses) as api, patch.object(DEPLOY, "command") as command:
            self.deployment.hosting("public-site-key")
        self.assertEqual(api.call_count, 2)
        self.assertTrue(all(c.args[0] == "GET" for c in api.call_args_list))
        self.assertIn("pageToken=next+token", api.call_args_list[1].args[1])
        hosting = json.loads((self.deployment.work / "firebase.json").read_text())["hosting"]
        self.assertEqual(hosting["site"], "virtualwardrobe-511016")
        self.assertEqual(hosting["rewrites"][0], {"source": "/api/**", "run": {"serviceId": "virtualwardrobe-demo-api", "region": "asia-south1", "pinTag": True}})
        self.assertIn("--project", command.call_args.args[0])
        self.assertIn("virtualtryon-511016", command.call_args.args[0])

    def test_existing_captcha_with_wrong_domain_or_multiple_names_fails_closed(self):
        key = {"displayName": "virtualwardrobe-demo-signup", "name": "projects/1/keys/public",
               "webSettings": {"integrationType": "SCORE", "allowedDomains": ["other.example"]}}
        for keys in [[key], [key, key]]:
            with patch.object(self.deployment, "value", return_value=json.dumps(keys)):
                with self.assertRaisesRegex(RuntimeError, "CAPTCHA configuration conflicts"):
                    self.deployment.ensure_captcha()

    def test_runtime_contract_enforces_live_demo_budget_and_safe_logging(self):
        environment = self.deployment.environment("worker", "public-key", "https://worker.run.app")
        self.assertEqual(environment["APP_ENVIRONMENT"], "demo")
        self.assertEqual(environment["APP_IMAGE_PROVIDER"], "google")
        self.assertEqual(environment["APP_GENERATION_DAILY_BUDGET_USD"], "5.00")
        self.assertEqual(environment["APP_GENERATION_ATTEMPT_RESERVATION_USD"], "0.25")
        self.assertEqual(environment["APP_GENERATION_ENABLED"], "true")
        self.assertEqual(environment["LOGGING_STRUCTURED_FORMAT_CONSOLE"], "logstash")
        self.assertEqual(environment["LOGGING_STRUCTURED_JSON_RENAME_LEVEL"], "severity")
        self.assertEqual(environment["LOGGING_STRUCTURED_JSON_EXCLUDE"], "stack_trace")
        self.assertNotIn("APP_GENERATION_QUALITY_REPORT", environment)
        self.assertIn("socketFactory=com.google.cloud.sql.postgres.SocketFactory", environment["SPRING_DATASOURCE_URL"])

    def test_worker_is_private_and_database_readiness_controls_startup(self):
        with patch.object(self.deployment, "gc") as gc, patch.object(self.deployment, "value", return_value="https://worker.run.app"):
            self.deployment.deploy_service("worker", "image", "public-key", "")
        args = gc.call_args.args
        self.assertIn("--no-allow-unauthenticated", args)
        self.assertNotIn("--allow-unauthenticated", args)
        self.assertTrue(any("httpGet.path=/actuator/health/readiness" in arg for arg in args))
        self.assertFalse(any("APP_BOOTSTRAP_SUPERADMIN_PASSWORD=" in arg for arg in args))

    def test_cost_limits_fail_closed_for_unreviewed_or_malformed_values(self):
        self.assertTrue(DEPLOY.reviewed_limits(self.config))
        for key, value in [("daily_provider_budget_usd", "5.01"), ("daily_provider_budget_usd", "NaN"),
                           ("api_max_instances", 3), ("worker_max_instances", True),
                           ("attempt_reservation_usd", "0.01"), ("database_tier", "db-custom-32-65536")]:
            self.assertFalse(DEPLOY.reviewed_limits(dict(self.config, **{key: value})), key)

    def test_imported_operator_helpers_cannot_bypass_the_project_or_resource_guards(self):
        for key, value in [("project_id", "proofroom-506314"), ("prefix", "stylereel"),
                           ("region", "us-central1"), ("environment", "production")]:
            with self.assertRaisesRegex(RuntimeError, "reviewed VirtualWardrobe"):
                DEPLOY.Deployment(dict(self.config, **{key: value}))

    def test_cli_rejects_other_project_region_and_foreign_images_before_cloud_access(self):
        for args in [["--project", "proofroom-506314"],
                     ["--project", "virtualtryon-511016", "--region", "us-central1"],
                     ["--project", "virtualtryon-511016", "--image", "gcr.io/other/image:latest"]]:
            result = subprocess.run([sys.executable, str(Path(__file__).with_name("deploy.py")), *args], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertNotIn("+ gcloud", result.stdout)

    def test_dirty_source_is_rejected_before_cloud_mutations_or_build(self):
        with patch.object(DEPLOY, "command", return_value=Mock(stdout=b" M source.java\n")), patch.object(self.deployment, "prepare") as prepare:
            with self.assertRaisesRegex(RuntimeError, "Commit tracked and non-ignored source changes"):
                self.deployment.apply(None)
        prepare.assert_not_called()

    def test_reused_image_must_match_current_head_before_any_cloud_lookup_or_mutation(self):
        responses = [Mock(stdout=b""), Mock(stdout=b"a" * 40)]
        for image in ("asia-south1-docker.pkg.dev/virtualtryon-511016/virtualwardrobe/backend:older",
                      "asia-south1-docker.pkg.dev/virtualtryon-511016/virtualwardrobe/backend@sha256:" + "b" * 64):
            with patch.object(DEPLOY, "command", side_effect=responses), patch.object(self.deployment, "release_state") as state, patch.object(self.deployment, "prepare") as prepare:
                with self.assertRaisesRegex(RuntimeError, "exact backend:HEAD12"):
                    self.deployment.apply(image)
            state.assert_not_called(); prepare.assert_not_called()

    def test_release_inventory_contains_only_owned_revision_digest_and_live_hosting_fields(self):
        digest = "owned/backend@sha256:" + "b" * 64
        def service(name):
            return {"status": {"latestReadyRevisionName": name + "-00001-test", "url": "https://" + name + ".run.app",
                    "traffic": [{"revisionName": name + "-00001-test", "percent": 100}]},
                    "spec": {"secret": "must-not-be-retained"}}
        descriptions = [service(self.deployment.api), {"status": {"imageDigest": digest}},
                        service(self.deployment.worker), {"status": {"imageDigest": digest}}]
        pages = [{"sites": [{"name": "projects/virtualtryon-511016/sites/virtualwardrobe-511016"}]},
            {"releases": [{"name": "release-old", "version": {"name": "sites/virtualwardrobe-511016/versions/old"},
                           "releaseTime": "2026-10-26T00:00:00Z", "releaseUser": {"email": "must-not-be-retained"}}], "nextPageToken": "next"},
            {"releases": [{"name": "release-new", "version": {"name": "sites/virtualwardrobe-511016/versions/new"}, "releaseTime": "2026-10-27T00:00:00Z"}]}]
        with patch.object(self.deployment, "exists", return_value=True), patch.object(self.deployment, "value", side_effect=[json.dumps(item) for item in descriptions]), patch.object(self.deployment, "api_request", side_effect=pages) as api:
            state = self.deployment.release_state(required=True)
        self.assertEqual(state["services"]["api"]["image_digest"], digest)
        self.assertEqual(state["hosting_release"]["version"], "sites/virtualwardrobe-511016/versions/new")
        self.assertNotIn("must-not-be-retained", json.dumps(state))
        self.assertTrue(all("channels/live/releases" in call.args[1] for call in api.call_args_list[1:]))

    def test_prior_release_is_saved_before_prepare_and_final_inventory_records_full_revision(self):
        previous = {"project_id": self.deployment.project, "services": {"api": None, "worker": None}, "hosting_release": None}
        deployed = {"services": {"api": {"ready_revision": "api-revision", "image_digest": "digest"}, "worker": {"ready_revision": "worker-revision", "image_digest": "digest"}}, "hosting_release": {"version": "new-version"}}
        def prepare():
            self.assertEqual(len(list((self.deployment.work / "releases").glob("before-*.json"))), 1)
            return {}, "captcha"
        with patch.object(DEPLOY, "command", side_effect=[Mock(stdout=b""), Mock(stdout=b"a" * 40)]), patch.object(self.deployment, "release_state", side_effect=[previous, deployed]), patch.object(self.deployment, "prepare", side_effect=prepare), patch.object(self.deployment, "build") as build, patch.object(self.deployment, "deploy_service", side_effect=["https://worker.run.app", "https://worker.run.app", "https://api.run.app"]), patch.object(self.deployment, "schedule"), patch.object(self.deployment, "hosting"), contextlib.redirect_stdout(io.StringIO()):
            self.deployment.apply(None)
        inventory = json.loads((self.deployment.work / "deployment.json").read_text())
        self.assertEqual(inventory["source_revision"], "a" * 40)
        self.assertEqual(inventory["runtime"], deployed["services"])
        self.assertTrue(Path(inventory["previous_release_inventory"]).is_file())
        self.assertTrue(build.call_args.args[0].endswith(":aaaaaaaaaaaa"))


if __name__ == "__main__":
    unittest.main()
