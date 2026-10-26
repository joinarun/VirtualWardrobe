"""Private cloud seed wrapper checks: controlled subprocesses, no cloud access."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import zipfile

SPEC = importlib.util.spec_from_file_location("vw_cloud_demo", Path(__file__).with_name("cloud-demo.py"))
DEMO = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DEMO)
DATASET = "virtualwardrobe-demo-v1"


def result_marker(**changes):
    result = {"schemaVersion": 1, "command": "seed", "datasetId": DATASET,
              "profile": "standard", "state": "ACTIVE", "changed": True, "dryRun": False,
              "counts": {"accounts": 12, "products": 24}, "objects": 32,
              "credentialsJson": "/ignored/demo-credentials.json", "credentialsText": None}
    result.update(changes)
    return DEMO.RESULT_PREFIX + json.dumps(result)


class CloudDemoContractTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="vw-cloud-demo-test-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name).resolve()
        self.work = self.root / "work"

    def args(self, command="seed", *extra):
        return DEMO.parse_args([command, "--project", DEMO.EXPECTED_PROJECT, "--dataset", DATASET, *extra])

    def test_project_dataset_environment_and_cleanup_guards_precede_execution(self):
        invalid = [
            ["seed", "--project", "proofroom-506314", "--dataset", DATASET],
            ["cleanup", "--project", DEMO.EXPECTED_PROJECT, "--dataset", "unrelated-data", "--run"],
            ["cleanup", "--project", DEMO.EXPECTED_PROJECT, "--dataset", DATASET, "--execute-cleanup"],
            ["seed", "--project", DEMO.EXPECTED_PROJECT, "--dataset", DATASET, "--run", "--execute-cleanup"],
        ]
        for dataset in ("stylereel-demo-v1", "virtualwardrobe-other-v1", "virtualwardrobe-demo-v0",
                        "virtualwardrobe-demo-v01", "virtualwardrobe-load-v10000", "virtualwardrobe-demo-v1/../../other"):
            invalid.append(["seed", "--project", DEMO.EXPECTED_PROJECT, "--dataset", dataset])
        with contextlib.redirect_stderr(io.StringIO()):
            for argv in invalid:
                with self.assertRaises(SystemExit) as stopped:
                    DEMO.parse_args(argv)
                self.assertEqual(stopped.exception.code, 2)
            with patch.dict(os.environ, {"APP_ENVIRONMENT": "production"}):
                with self.assertRaises(SystemExit):
                    self.args()

    def test_default_seed_status_and_cleanup_only_print_plans(self):
        for command in ("seed", "status", "cleanup"):
            output = io.StringIO()
            with patch.object(DEMO, "run") as run, contextlib.redirect_stdout(output):
                code = DEMO.main([command, "--project", DEMO.EXPECTED_PROJECT, "--dataset", DATASET])
            self.assertEqual(code, 0)
            self.assertFalse(json.loads(output.getvalue())["executes"])
            run.assert_not_called()

    def test_standalone_commands_have_explicit_scope_and_no_public_server(self):
        credentials = self.work / "demo-credentials.json"
        seed = DEMO.java_command(self.args(), credentials)
        self.assertIn("-Dloader.main=com.virtualwardrobe.demo.DemoMain", seed)
        self.assertIn("org.springframework.boot.loader.launch.PropertiesLauncher", seed)
        self.assertIn("--project", seed)
        self.assertNotIn("org.springframework.boot.loader.launch.JarLauncher", seed)
        cleanup = DEMO.java_command(self.args("cleanup", "--run"), credentials)
        self.assertIn("--dry-run", cleanup)
        self.assertNotIn("--execute", cleanup)
        execute = DEMO.java_command(self.args("cleanup", "--run", "--execute-cleanup"), credentials)
        self.assertIn("--execute", execute)
        self.assertNotIn("--dry-run", execute)
        load_args = DEMO.parse_args(["seed", "--project", DEMO.EXPECTED_PROJECT,
                                    "--dataset", "virtualwardrobe-load-v1"])
        load = DEMO.java_command(load_args, credentials)
        self.assertEqual(load[load.index("--catalog-size") + 1], "1000")
        next_version = DEMO.parse_args(["seed", "--project", DEMO.EXPECTED_PROJECT,
                                       "--dataset", "virtualwardrobe-load-v2"])
        next_command = DEMO.java_command(next_version, credentials)
        self.assertIn("virtualwardrobe-load-v2", next_command)
        self.assertEqual(next_command[next_command.index("--catalog-size") + 1], "1000")
        self.assertEqual(DEMO.dataset_profile("virtualwardrobe-demo-v9999"), {"profile": "standard"})

    def test_credentials_stay_owner_only_and_reject_symlink_or_hardlink(self):
        path = DEMO.credential_path(DATASET, self.work)
        self.assertEqual(self.work.stat().st_mode & 0o777, 0o700)
        self.assertTrue(path.name.startswith("demo-credentials-"))
        path.write_text("{}")
        path.chmod(0o644)
        with self.assertRaises(DEMO.OperatorFailure):
            DEMO.credential_path(DATASET, self.work)
        path.chmod(0o600)
        DEMO.credential_path(DATASET, self.work)
        sibling = self.root / "linked"
        os.link(path, sibling)
        with self.assertRaises(DEMO.OperatorFailure):
            DEMO.credential_path(DATASET, self.work)
        sibling.unlink(); path.unlink()
        path.symlink_to(self.root / "elsewhere")
        with self.assertRaises(DEMO.OperatorFailure):
            DEMO.credential_path(DATASET, self.work)

    def test_adc_accepts_existing_authorized_user_and_refuses_key_files(self):
        adc = self.root / "adc.json"
        adc.write_text(json.dumps({"type": "authorized_user", "refresh_token": "not-a-real-token"}))
        self.assertEqual(DEMO.existing_user_adc({"GOOGLE_APPLICATION_CREDENTIALS": str(adc)}), adc)
        adc.write_text(json.dumps({"type": "service_account", "private_key": "never-used"}))
        with self.assertRaises(DEMO.OperatorFailure):
            DEMO.existing_user_adc({"GOOGLE_APPLICATION_CREDENTIALS": str(adc)})

    def test_child_environment_pins_project_and_removes_injected_settings(self):
        deployment = SimpleNamespace(private_bucket="virtualtryon-511016-virtualwardrobe-demo-private",
            accounts={"api": "virtualwardrobe-demo-api@virtualtryon-511016.iam.gserviceaccount.com"},
            dbname="virtualwardrobe", db="virtualwardrobe-demo-db", region="asia-south1", dbuser="virtualwardrobe")
        injected = {"APP_ENVIRONMENT": "production", "APP_BOOTSTRAP_SUPERADMIN_PASSWORD": "do-not-pass",
                    "SPRING_DATASOURCE_URL": "jdbc:foreign", "GOOGLE_CLOUD_PROJECT": "foreign",
                    "JAVA_TOOL_OPTIONS": "-javaagent:foreign", "LOADER_MAIN": "foreign"}
        with patch.dict(os.environ, injected):
            environment = DEMO.child_environment(deployment, self.root / "adc.json", "secret-child-value")
        self.assertEqual(environment["APP_ENVIRONMENT"], "demo")
        self.assertEqual(environment["GOOGLE_CLOUD_QUOTA_PROJECT"], DEMO.EXPECTED_PROJECT)
        self.assertEqual(environment["SPRING_DATASOURCE_PASSWORD"], "secret-child-value")
        self.assertIn("cloudSqlInstance=virtualtryon-511016:asia-south1:virtualwardrobe-demo-db", environment["SPRING_DATASOURCE_URL"])
        self.assertFalse({"APP_BOOTSTRAP_SUPERADMIN_PASSWORD", "JAVA_TOOL_OPTIONS", "LOADER_MAIN"} & environment.keys())

    def test_result_schema_is_checked_and_identity_or_raw_logs_never_reported(self):
        output = "raw password=do-not-print\n" + result_marker(email="person@example.test", phone="9999999999")
        safe = DEMO.safe_result(output, DATASET, "seed")
        self.assertEqual(safe["counts"], {"accounts": 12, "products": 24})
        self.assertNotIn("do-not-print", json.dumps(safe))
        self.assertNotIn("example.test", json.dumps(safe))
        self.assertNotIn("credentialsJson", safe)
        for payload in (result_marker(datasetId="foreign"), result_marker(datasetId="virtualwardrobe-demo-v2"),
                        result_marker(command="cleanup"),
                        result_marker(schemaVersion=2), result_marker(state="invalid"),
                        result_marker() + "\n" + result_marker()):
            with self.assertRaises(DEMO.OperatorFailure):
                DEMO.safe_result(payload, DATASET, "seed")

    def test_run_delivers_secret_only_to_child_and_writes_aggregate_report(self):
        java_home = self.root / "java21"
        (java_home / "bin").mkdir(parents=True)
        (java_home / "bin/java").touch()
        jar = self.root / "backend.jar"
        with zipfile.ZipFile(jar, "w") as archive:
            archive.writestr("BOOT-INF/classes/com/virtualwardrobe/demo/DemoMain.class", b"fake")
        assets = self.root / "assets"; assets.mkdir(); (assets / "provenance.json").write_text("[]")
        adc = self.root / "adc.json"; adc.write_text('{"type":"authorized_user"}')
        args = self.args("seed", "--run", "--jar", str(jar), "--java-home", str(java_home), "--assets", str(assets))
        deployment = SimpleNamespace(work=self.work, private_bucket="private-bucket", dbname="virtualwardrobe",
            db="virtualwardrobe-demo-db", region="asia-south1", dbuser="virtualwardrobe",
            accounts={"api": "virtualwardrobe-demo-api@virtualtryon-511016.iam.gserviceaccount.com"},
            database_secret="virtualwardrobe-demo-db-password")
        deployment.value = Mock(side_effect=[json.dumps({"state": "RUNNABLE", "databaseVersion": "POSTGRES_17",
            "connectionName": "virtualtryon-511016:asia-south1:virtualwardrobe-demo-db"}), "secret-child-value"])
        observed = []
        def child(command, **kwargs):
            if "-version" in command:
                return SimpleNamespace(returncode=0, stdout="", stderr='openjdk version "21.0.7"')
            observed.append((command, dict(kwargs["env"])))
            return SimpleNamespace(returncode=0, stdout=result_marker() + "\nunsafe-secret-output", stderr="unsafe-driver-output")
        with patch.dict(os.environ, {"GOOGLE_APPLICATION_CREDENTIALS": str(adc)}), patch.object(DEMO.subprocess, "run", side_effect=child):
            report = DEMO.run(args, deployment)
        command, environment = observed[0]
        self.assertNotIn("secret-child-value", " ".join(command))
        self.assertEqual(environment["SPRING_DATASOURCE_PASSWORD"], "secret-child-value")
        encoded = json.dumps(report)
        self.assertNotIn("secret-child-value", encoded)
        self.assertNotIn("unsafe", encoded)
        self.assertTrue(report["standalone_no_listener_or_provider"])
        reports = list(self.work.glob("demo-operator-*.json"))
        self.assertEqual(len(reports), 1)
        self.assertEqual(reports[0].stat().st_mode & 0o777, 0o600)

    def test_timeout_exception_captured_output_is_not_echoed(self):
        stderr = io.StringIO()
        failure = subprocess.TimeoutExpired("java", 600, output="password-secret", stderr="token-secret")
        with patch.object(DEMO, "run", side_effect=failure), contextlib.redirect_stderr(stderr):
            code = DEMO.main(["seed", "--project", DEMO.EXPECTED_PROJECT, "--dataset", DATASET, "--run"])
        self.assertEqual(code, 1)
        self.assertNotIn("password-secret", stderr.getvalue())
        self.assertNotIn("token-secret", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
