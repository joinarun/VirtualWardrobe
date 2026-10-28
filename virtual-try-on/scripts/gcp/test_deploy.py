"""Controlled deployment-contract checks; never build, deploy or contact Google."""
import importlib.util
import contextlib
import copy
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
        self.worker_url = "https://virtualwardrobe-demo-worker-ynpzfmjw7q-el.a.run.app"

    def release_states(self, worker=None):
        previous = {"project_id": self.deployment.project, "region": self.deployment.region,
                    "services": {"api": None, "worker": worker}, "hosting_release": None}
        deployed = {"services": {"api": {"ready_revision": "api-revision", "image_digest": "digest"},
                                  "worker": {"ready_revision": "worker-revision", "image_digest": "digest"}},
                    "hosting_release": {"version": "new-version"}}
        return previous, deployed

    def web_release(self):
        backend = "a" * 40
        digest = f"{self.deployment.region}-docker.pkg.dev/{self.deployment.project}/{self.deployment.repo}/backend@sha256:" + "b" * 64
        runtime = {}
        for mode, name in (("api", self.deployment.api), ("worker", self.deployment.worker)):
            runtime[mode] = {"service": name, "ready_revision": name + "-00003-ready",
                             "image_digest": digest, "url": "https://" + name + "-ynpzfmjw7q-el.a.run.app",
                             "traffic": [{"revisionName": name + "-00003-ready", "percent": 100, "tag": "fh-old"}]}
        release = {"name": "sites/virtualwardrobe-511016/channels/live/releases/1",
                   "version": "sites/virtualwardrobe-511016/versions/old", "release_time": "2026-10-27T20:00:00Z"}
        inventory = dict(self.deployment.plan(), source_revision=backend,
                         image=f"{self.deployment.region}-docker.pkg.dev/{self.deployment.project}/{self.deployment.repo}/backend:{backend[:12]}",
                         runtime=runtime, hosting_release=release, captcha_site_key="public-key",
                         web_url="https://virtualwardrobe-511016.web.app")
        state = {"project_id": self.deployment.project, "region": self.deployment.region,
                 "services": copy.deepcopy(runtime), "hosting_site": "virtualwardrobe-511016",
                 "hosting_release": copy.deepcopy(release)}
        return inventory, state

    def git_web_responses(self, *, prepublish: bool = False):
        responses = [Mock(stdout=b""), Mock(stdout=b"c" * 40), Mock(returncode=0), Mock(returncode=0)]
        return responses + ([Mock(stdout=b""), Mock(stdout=b"c" * 40)] if prepublish else [])

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

    def test_web_only_cli_default_is_plan_and_incompatible_options_fail_before_cloud(self):
        script = str(Path(__file__).with_name("deploy.py"))
        base = [sys.executable, script, "--project", "virtualtryon-511016", "--web-only"]
        result = subprocess.run(base, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["release_mode"], "web-only")
        self.assertNotIn("+ gcloud", result.stdout)
        for extra in (["--provision-only"], ["--image", "anything"]):
            result = subprocess.run(base + extra, capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertNotIn("+ gcloud", result.stdout)

    def test_web_only_missing_or_unsafe_inventory_fails_without_cloud(self):
        path = self.deployment.work / "deployment.json"
        with self.assertRaisesRegex(RuntimeError, "protected deployment inventory"):
            self.deployment.web_inventory()
        inventory, _ = self.web_release()
        path.write_text(json.dumps(inventory)); path.chmod(0o644)
        with self.assertRaisesRegex(RuntimeError, "owner-only"):
            self.deployment.web_inventory()
        path.chmod(0o600)
        self.assertEqual(self.deployment.web_inventory()["source_revision"], "a" * 40)
        path.unlink(); path.symlink_to(self.deployment.work / "missing")
        with self.assertRaisesRegex(RuntimeError, "owner-only"):
            self.deployment.web_inventory()

    def test_web_only_inventory_rejects_foreign_scope_revision_image_or_missing_captcha(self):
        inventory, _ = self.web_release()
        variants = []
        for field, value in [("project_id", "proofroom-506314"), ("region", "us-central1"),
                             ("source_revision", "short"), ("backend_source_revision", "short"),
                             ("image", "gcr.io/other/backend:a"), ("captcha_site_key", "")]:
            variants.append(dict(inventory, **{field: value}))
        foreign = copy.deepcopy(inventory); foreign["resources"]["cloud_run_api"] = "stylereel"; variants.append(foreign)
        for bad in variants:
            self.deployment.private_json(self.deployment.work / "deployment.json", bad)
            with self.assertRaises(RuntimeError):
                self.deployment.web_inventory()

    def test_web_only_dirty_head_or_backend_difference_stops_before_cloud_or_web_build(self):
        inventory, _ = self.web_release()
        for responses in ([Mock(stdout=b" M web.ts\n")],
                          [Mock(stdout=b""), Mock(stdout=b"c" * 40), Mock(returncode=1), Mock(returncode=0)],
                          [Mock(stdout=b""), Mock(stdout=b"c" * 40), Mock(returncode=0), Mock(returncode=1)]):
            with patch.object(DEPLOY, "command", side_effect=responses), patch.object(self.deployment, "web_inventory", return_value=inventory), patch.object(self.deployment, "release_state") as state, patch.object(self.deployment, "hosting") as hosting:
                with self.assertRaises(RuntimeError):
                    self.deployment.apply_web_only()
            state.assert_not_called(); hosting.assert_not_called()

    def test_web_only_target_rejects_runtime_or_hosting_drift_and_traffic_split(self):
        inventory, state = self.web_release()
        variants = []
        for mode, field, value in [("api", "ready_revision", self.deployment.api + "-00004-other"),
                                   ("worker", "image_digest", "foreign@sha256:" + "d" * 64),
                                   ("api", "url", "https://stylereel.run.app")]:
            bad = copy.deepcopy(state); bad["services"][mode][field] = value; variants.append(bad)
        bad = copy.deepcopy(state); bad["hosting_release"]["version"] = "sites/virtualwardrobe-511016/versions/other"; variants.append(bad)
        bad = copy.deepcopy(state); bad["services"]["api"]["traffic"][0]["percent"] = 99; variants.append(bad)
        bad = copy.deepcopy(state); bad["project_id"] = "proofroom-506314"; variants.append(bad)
        for bad in variants:
            with self.assertRaises(RuntimeError):
                self.deployment.check_web_target(inventory, bad)

    def test_web_only_target_rejects_missing_or_foreign_recorded_runtime(self):
        inventory, state = self.web_release()
        for mode, field, value in [("api", "service", "stylereel"), ("worker", "url", "https://stylereel.run.app"),
                                   ("api", "image_digest", "foreign@sha256:" + "b" * 64),
                                   ("worker", "image_digest", state["services"]["worker"]["image_digest"].replace("b" * 64, "d" * 64))]:
            bad = copy.deepcopy(inventory); bad["runtime"][mode][field] = value
            with self.assertRaises(RuntimeError):
                self.deployment.check_web_target(bad, state)

    def test_web_only_captcha_and_missing_site_never_create_cloud_resources(self):
        with patch.object(self.deployment, "value", return_value="[]") as value:
            with self.assertRaisesRegex(RuntimeError, "existing reviewed CAPTCHA"):
                self.deployment.ensure_captcha(required=True)
        self.assertEqual(value.call_count, 1)
        self.assertEqual(value.call_args.args[:3], ("recaptcha", "keys", "list"))
        with patch.object(self.deployment, "api_request", return_value={"sites": []}) as api, patch.object(DEPLOY, "command") as command:
            with self.assertRaisesRegex(RuntimeError, "existing dedicated Hosting"):
                self.deployment.hosting("public-key", require_existing=True)
        self.assertEqual(api.call_count, 1); self.assertEqual(api.call_args.args[0], "GET")
        command.assert_not_called()

    def test_hosting_rechecks_target_after_web_build_and_before_firebase_publish(self):
        events = []
        def command(args, **kwargs): events.append(args[0])
        def verify(): events.append("verify")
        with patch.object(self.deployment, "api_request", return_value={"sites": [{"name": "projects/virtualtryon-511016/sites/virtualwardrobe-511016"}]}), patch.object(DEPLOY, "command", side_effect=command):
            self.deployment.hosting("public-key", require_existing=True, before_publish=verify)
        self.assertEqual(events, ["npm", "npm", "verify", "npx"])
        with patch.object(self.deployment, "api_request", return_value={"sites": [{"name": "projects/virtualtryon-511016/sites/virtualwardrobe-511016"}]}), patch.object(DEPLOY, "command") as command:
            with self.assertRaisesRegex(RuntimeError, "changed"):
                self.deployment.hosting("public-key", require_existing=True, before_publish=lambda: (_ for _ in ()).throw(RuntimeError("changed")))
        self.assertEqual(command.call_count, 2)

    def test_web_only_source_edits_or_head_change_during_build_stop_publication(self):
        inventory, before = self.web_release()
        for changed in ([Mock(stdout=b" M apps/web/src/App.tsx\n")],
                        [Mock(stdout=b""), Mock(stdout=b"d" * 40)]):
            published = []
            def hosting(key, **kwargs):
                kwargs["before_publish"]()
                published.append(True)
            with patch.object(DEPLOY, "command", side_effect=self.git_web_responses() + changed), patch.object(self.deployment, "web_inventory", return_value=inventory), patch.object(self.deployment, "release_state", return_value=before) as state, patch.object(self.deployment, "ensure_captcha", return_value="public-key"), patch.object(self.deployment, "hosting", side_effect=hosting):
                with self.assertRaises(RuntimeError):
                    self.deployment.apply_web_only()
            self.assertEqual(published, [])
            self.assertEqual(state.call_count, 1)

    def test_web_only_publishes_assets_and_records_distinct_source_without_backend_mutations(self):
        inventory, before = self.web_release()
        after = copy.deepcopy(before)
        after["hosting_release"] = {"name": "sites/virtualwardrobe-511016/channels/live/releases/2", "version": "sites/virtualwardrobe-511016/versions/new", "release_time": "2026-10-28T00:00:00Z"}
        after["services"]["api"]["traffic"][0]["tag"] = "fh-new"
        self.deployment.private_json(self.deployment.work / "deployment.json", inventory)
        def hosting(key, **kwargs):
            self.assertEqual(key, "public-key"); self.assertTrue(kwargs["require_existing"])
            self.assertEqual(len(list((self.deployment.work / "releases").glob("before-web-*.json"))), 1)
            kwargs["before_publish"]()
        forbidden = ["prepare", "provision", "build", "deploy_service", "schedule"]
        with contextlib.ExitStack() as stack:
            mutations = [stack.enter_context(patch.object(self.deployment, name)) for name in forbidden]
            cmd = stack.enter_context(patch.object(DEPLOY, "command", side_effect=self.git_web_responses(prepublish=True)))
            stack.enter_context(patch.object(self.deployment, "release_state", side_effect=[before, before, after]))
            captcha = stack.enter_context(patch.object(self.deployment, "ensure_captcha", return_value="public-key"))
            stack.enter_context(patch.object(self.deployment, "hosting", side_effect=hosting))
            stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            self.deployment.apply_web_only()
        for mutation in mutations: mutation.assert_not_called()
        captcha.assert_called_once_with(required=True)
        self.assertEqual(cmd.call_args_list[3].args[0][-3:], ["services/backend", "infra/backend.gcloudignore", "infra/gcp-demo.json"])
        self.assertEqual(cmd.call_count, 6)
        result = json.loads((self.deployment.work / "deployment.json").read_text())
        self.assertEqual(result["source_revision"], "c" * 40)
        self.assertEqual(result["frontend_source_revision"], "c" * 40)
        self.assertEqual(result["backend_source_revision"], "a" * 40)
        self.assertEqual(result["image"], inventory["image"])
        self.assertEqual(result["release_mode"], "web-only")
        self.assertEqual((self.deployment.work / "deployment.json").stat().st_mode & 0o777, 0o600)

    def test_later_web_release_preserves_explicit_backend_source_and_checks_captcha_match(self):
        inventory, before = self.web_release()
        inventory.update(source_revision="d" * 40, backend_source_revision="a" * 40)
        with patch.object(DEPLOY, "command", side_effect=self.git_web_responses()) as command, patch.object(self.deployment, "web_inventory", return_value=inventory), patch.object(self.deployment, "release_state", return_value=before), patch.object(self.deployment, "ensure_captcha", return_value="different-key"), patch.object(self.deployment, "hosting") as hosting:
            with self.assertRaisesRegex(RuntimeError, "CAPTCHA key differs"):
                self.deployment.apply_web_only()
        self.assertEqual(command.call_args.args[0][3], "a" * 40)
        hosting.assert_not_called()

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

    def test_role_session_policy_is_explicit_on_both_services(self):
        for mode in ("api", "worker"):
            environment = self.deployment.environment(mode, "public-key", self.worker_url)
            self.assertEqual(environment["APP_SESSION_CUSTOMER_SECONDS"], "2592000")
            self.assertEqual(environment["APP_SESSION_WORKFORCE_SECONDS"], "28800")
            self.assertEqual(environment["APP_SESSION_ANONYMOUS_SECONDS"], "1800")
            self.assertEqual(environment["SESSION_COOKIE_SECURE"], "true")
        self.assertEqual(self.deployment.plan()["sessions"]["cookie_max_age_seconds"], 2592000)

    def test_session_configuration_cannot_exceed_reviewed_role_limits_or_use_nonintegers(self):
        for key, value in [("session_customer_seconds", 2592001), ("session_workforce_seconds", 28801),
                           ("session_anonymous_seconds", 1801), ("session_customer_seconds", 59),
                           ("session_workforce_seconds", True), ("session_anonymous_seconds", "1800")]:
            self.assertFalse(DEPLOY.reviewed_limits(dict(self.config, **{key: value})))

    def test_worker_is_private_and_database_readiness_controls_startup(self):
        with patch.object(self.deployment, "gc") as gc, patch.object(self.deployment, "value", return_value="https://worker.run.app"):
            self.deployment.deploy_service("worker", "image", "public-key", "")
        args = gc.call_args.args
        self.assertIn("--no-allow-unauthenticated", args)
        self.assertNotIn("--allow-unauthenticated", args)
        self.assertTrue(any("httpGet.path=/actuator/health/readiness" in arg for arg in args))
        self.assertFalse(any("APP_BOOTSTRAP_SUPERADMIN_PASSWORD=" in arg for arg in args))

    def test_scheduler_update_and_create_use_supported_header_flags_without_changing_delivery(self):
        for exists in (False, True):
            with patch.object(self.deployment, "gc") as gc, patch.object(self.deployment, "exists", return_value=exists):
                self.deployment.schedule(self.worker_url)
            args = gc.call_args.args
            self.assertEqual(args[:3], ("scheduler", "jobs", "update" if exists else "create"))
            self.assertIn("--update-headers" if exists else "--headers", args)
            self.assertNotIn("--headers" if exists else "--update-headers", args)
            for option, expected in [("--uri", self.worker_url + "/internal/maintenance"),
                                     ("--http-method", "POST"), ("--message-body", "{}"),
                                     ("--schedule", "* * * * *"), ("--attempt-deadline", "180s"),
                                     ("--oidc-service-account-email", self.deployment.accounts["dispatch"]),
                                     ("--oidc-token-audience", self.worker_url)]:
                self.assertEqual(args[args.index(option) + 1], expected)
            self.assertIn("Content-Type=application/json", args)

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
        previous, deployed = self.release_states()
        def prepare():
            self.assertEqual(len(list((self.deployment.work / "releases").glob("before-*.json"))), 1)
            return {}, "captcha"
        with patch.object(DEPLOY, "command", side_effect=[Mock(stdout=b""), Mock(stdout=b"a" * 40)]), patch.object(self.deployment, "release_state", side_effect=[previous, deployed]), patch.object(self.deployment, "prepare", side_effect=prepare), patch.object(self.deployment, "build") as build, patch.object(self.deployment, "deploy_service", side_effect=[self.worker_url, self.worker_url, "https://api.run.app"]) as deploy, patch.object(self.deployment, "schedule"), patch.object(self.deployment, "hosting"), contextlib.redirect_stdout(io.StringIO()):
            self.deployment.apply(None)
        inventory = json.loads((self.deployment.work / "deployment.json").read_text())
        self.assertEqual(inventory["source_revision"], "a" * 40)
        self.assertEqual(inventory["runtime"], deployed["services"])
        self.assertTrue(Path(inventory["previous_release_inventory"]).is_file())
        self.assertTrue(build.call_args.args[0].endswith(":aaaaaaaaaaaa"))
        self.assertEqual([call.args[3] for call in deploy.call_args_list], ["", self.worker_url, self.worker_url])

    def test_redeployment_uses_the_captured_owned_worker_origin_without_empty_audience(self):
        previous, deployed = self.release_states({"service": self.deployment.worker, "url": self.worker_url})
        with patch.object(DEPLOY, "command", side_effect=[Mock(stdout=b""), Mock(stdout=b"a" * 40)]), patch.object(self.deployment, "release_state", side_effect=[previous, deployed]), patch.object(self.deployment, "prepare", return_value=({}, "captcha")), patch.object(self.deployment, "build"), patch.object(self.deployment, "deploy_service", side_effect=[self.worker_url, "https://api.run.app"]) as deploy, patch.object(self.deployment, "schedule"), patch.object(self.deployment, "hosting"), contextlib.redirect_stdout(io.StringIO()):
            self.deployment.apply(None)
        self.assertEqual([call.args[0] for call in deploy.call_args_list], ["worker", "api"])
        self.assertTrue(all(call.args[3] == self.worker_url for call in deploy.call_args_list))

    def test_foreign_or_noncanonical_captured_worker_origin_stops_before_prepare_or_build(self):
        invalid = [None, "", "https://stylereel-ynpzfmjw7q-el.a.run.app", "http://" + self.worker_url.removeprefix("https://"),
                   self.worker_url + "/", self.worker_url + "/internal", self.worker_url + "?token=not-a-secret",
                   self.worker_url + "#fragment", self.worker_url + ":443", self.worker_url + ".example.com",
                   self.worker_url.replace("https://", "https://user@"), "https://[bad"]
        for url in invalid:
            previous, _ = self.release_states({"service": self.deployment.worker, "url": url})
            with self.subTest(url=url), patch.object(DEPLOY, "command", side_effect=[Mock(stdout=b""), Mock(stdout=b"a" * 40)]), patch.object(self.deployment, "release_state", return_value=previous), patch.object(self.deployment, "prepare") as prepare, patch.object(self.deployment, "build") as build, patch.object(self.deployment, "deploy_service") as deploy:
                with self.assertRaisesRegex(RuntimeError, "canonical URL"):
                    self.deployment.apply(None)
            prepare.assert_not_called(); build.assert_not_called(); deploy.assert_not_called()

    def test_foreign_snapshot_or_worker_identity_is_not_treated_as_first_creation(self):
        for field, value in [("project_id", "proofroom-506314"), ("region", "us-central1"), ("service", "stylereel")]:
            previous, _ = self.release_states({"service": self.deployment.worker, "url": self.worker_url})
            if field == "service": previous["services"]["worker"][field] = value
            else: previous[field] = value
            with patch.object(DEPLOY, "command", side_effect=[Mock(stdout=b""), Mock(stdout=b"a" * 40)]), patch.object(self.deployment, "release_state", return_value=previous), patch.object(self.deployment, "prepare") as prepare:
                with self.assertRaisesRegex(RuntimeError, "previous release"):
                    self.deployment.apply(None)
            prepare.assert_not_called()

    def test_worker_url_change_stops_before_api_schedule_or_hosting(self):
        changed = "https://virtualwardrobe-demo-worker-other-el.a.run.app"
        for existing in (False, True):
            previous, _ = self.release_states({"service": self.deployment.worker, "url": self.worker_url} if existing else None)
            results = [changed] if existing else [self.worker_url, changed]
            with patch.object(DEPLOY, "command", side_effect=[Mock(stdout=b""), Mock(stdout=b"a" * 40)]), patch.object(self.deployment, "release_state", return_value=previous), patch.object(self.deployment, "prepare", return_value=({}, "captcha")), patch.object(self.deployment, "build"), patch.object(self.deployment, "deploy_service", side_effect=results) as deploy, patch.object(self.deployment, "schedule") as schedule, patch.object(self.deployment, "hosting") as hosting:
                with self.assertRaisesRegex(RuntimeError, "canonical URL changed"):
                    self.deployment.apply(None)
            self.assertTrue(all(call.args[0] == "worker" for call in deploy.call_args_list))
            schedule.assert_not_called(); hosting.assert_not_called()


if __name__ == "__main__":
    unittest.main()
