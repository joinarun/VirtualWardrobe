"""Check the local seed wrapper without Docker, a database or real credentials."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import zipfile


class DemoRunnerIdentityTest(unittest.TestCase):
    def test_bootstrap_uses_host_identity_without_replacing_existing_credentials(self):
        script = Path(__file__).resolve().parents[1] / "bootstrap-admin.sh"
        with tempfile.TemporaryDirectory(prefix="bootstrap-runner-proof-") as temporary:
            root = Path(temporary) / "project with spaces"
            (root / "scripts").mkdir(parents=True)
            shutil.copy2(script, root / "scripts/bootstrap-admin.sh")
            private = root / "private fixture directory"
            private.mkdir(mode=0o700)
            credentials = private / "bootstrap-credentials.txt"
            credentials.write_bytes(b"unchanged synthetic fixture\n")
            credentials.chmod(0o600)
            commands = root / "commands.jsonl"
            tools = root / "fake-tools"
            tools.mkdir()
            docker = tools / "docker"
            docker.write_text(
                "#!/usr/bin/env python3\n"
                "import json,os,sys\n"
                "with open(os.environ['DEMO_RUNNER_TEST_CAPTURE'],'a') as output:\n"
                " output.write(json.dumps(sys.argv[1:])+'\\n')\n"
            )
            docker.chmod(0o700)
            identity = tools / "id"
            identity.write_text("#!/bin/sh\ncase \"$1\" in -u) echo 1001;; -g) echo 1002;; *) exit 2;; esac\n")
            identity.chmod(0o700)
            environment = {
                **os.environ,
                "PATH": str(tools) + os.pathsep + os.environ["PATH"],
                "DEMO_RUNNER_TEST_CAPTURE": str(commands),
                "BOOTSTRAP_SKIP_PACKAGE": "true",
                "BOOTSTRAP_OUTPUT_DIRECTORY": str(private),
            }
            subprocess.run(["/bin/bash", str(root / "scripts/bootstrap-admin.sh")],
                           env=environment, check=True, capture_output=True)
            calls = [json.loads(line) for line in commands.read_text().splitlines()]
            bootstrap = next(call for call in calls if "java" in call)
            self.assertEqual(bootstrap[bootstrap.index("--user") + 1], "1001:1002")
            self.assertIn("-Duser.name=1001", bootstrap)
            self.assertIn(str(private) + ":/workspace/work", bootstrap)
            self.assertEqual(credentials.read_bytes(), b"unchanged synthetic fixture\n")
            self.assertEqual(private.stat().st_mode & 0o777, 0o700)
            self.assertEqual(credentials.stat().st_mode & 0o777, 0o600)

    def test_seed_preserves_private_host_files_and_maps_the_host_identity(self):
        script = Path(__file__).resolve().parents[1] / "demo.sh"
        with tempfile.TemporaryDirectory(prefix="demo-runner-proof-") as temporary:
            root = Path(temporary) / "project with spaces"
            (root / "scripts").mkdir(parents=True)
            shutil.copy2(script, root / "scripts/demo.sh")
            (root / "apps/web/public/demo").mkdir(parents=True)
            target = root / "services/backend/target"
            target.mkdir(parents=True)
            with zipfile.ZipFile(target / "backend-0.0.1-SNAPSHOT.jar", "w") as jar:
                jar.writestr("BOOT-INF/classes/com/virtualwardrobe/demo/DemoMain.class", b"fixture")
            private = root / "private fixture directory"
            private.mkdir(mode=0o700)
            credentials = private / "demo-credentials-test.json"
            credentials.write_bytes(b"unchanged synthetic fixture\n")
            credentials.chmod(0o600)
            commands = root / "commands.jsonl"
            tools = root / "fake-tools"
            tools.mkdir()
            docker = tools / "docker"
            docker.write_text(
                "#!/usr/bin/env python3\n"
                "import json,os,sys\n"
                "with open(os.environ['DEMO_RUNNER_TEST_CAPTURE'],'a') as output:\n"
                " output.write(json.dumps(sys.argv[1:])+'\\n')\n"
            )
            docker.chmod(0o700)
            identity = tools / "id"
            identity.write_text("#!/bin/sh\ncase \"$1\" in -u) echo 1001;; -g) echo 1002;; *) exit 2;; esac\n")
            identity.chmod(0o700)
            environment = {
                **os.environ,
                "PATH": str(tools) + os.pathsep + os.environ["PATH"],
                "DEMO_RUNNER_TEST_CAPTURE": str(commands),
                "DEMO_SKIP_PACKAGE": "true",
                "DEMO_CREDENTIALS_FILE": str(credentials),
            }
            subprocess.run(["/bin/bash", str(root / "scripts/demo.sh"), "seed"],
                           env=environment, check=True, capture_output=True)
            calls = [json.loads(line) for line in commands.read_text().splitlines()]
            seed = next(call for call in calls if "java" in call)
            self.assertEqual(seed[seed.index("--user") + 1], "1001:1002")
            self.assertIn("-Duser.name=1001", seed)
            self.assertIn(str(private) + ":/demo-credentials", seed)
            self.assertIn("/demo-credentials/demo-credentials-test.json", seed)
            self.assertEqual(credentials.read_bytes(), b"unchanged synthetic fixture\n")
            self.assertEqual(private.stat().st_mode & 0o777, 0o700)
            self.assertEqual(credentials.stat().st_mode & 0o777, 0o600)
            self.assertEqual(credentials.stat().st_nlink, 1)

    def test_non_seed_commands_work_with_nounset_under_system_bash(self):
        script = Path(__file__).resolve().parents[1] / "demo.sh"
        with tempfile.TemporaryDirectory(prefix="demo-read-runner-proof-") as temporary:
            root = Path(temporary)
            (root / "scripts").mkdir()
            shutil.copy2(script, root / "scripts/demo.sh")
            target = root / "services/backend/target"
            target.mkdir(parents=True)
            with zipfile.ZipFile(target / "backend-0.0.1-SNAPSHOT.jar", "w") as jar:
                jar.writestr("BOOT-INF/classes/com/virtualwardrobe/demo/DemoMain.class", b"fixture")
            commands = root / "commands.jsonl"
            tools = root / "fake-tools"
            tools.mkdir()
            docker = tools / "docker"
            docker.write_text(
                "#!/usr/bin/env python3\n"
                "import json,os,sys\n"
                "with open(os.environ['DEMO_RUNNER_TEST_CAPTURE'],'a') as output:\n"
                " output.write(json.dumps(sys.argv[1:])+'\\n')\n"
            )
            docker.chmod(0o700)
            environment = {
                **os.environ,
                "PATH": str(tools) + os.pathsep + os.environ["PATH"],
                "DEMO_RUNNER_TEST_CAPTURE": str(commands),
                "DEMO_SKIP_PACKAGE": "true",
            }
            for command in ("status", "cleanup", "cleanup-execute"):
                with self.subTest(command=command):
                    commands.write_text("")
                    subprocess.run(["/bin/bash", str(root / "scripts/demo.sh"), command],
                                   env=environment, check=True, capture_output=True)
                    calls = [json.loads(line) for line in commands.read_text().splitlines()]
                    invocation = next(call for call in calls if "java" in call)
                    self.assertEqual(invocation[invocation.index("api") + 1], "java")
                    self.assertNotIn("--user", invocation)
                    self.assertFalse(any(argument.startswith("-Duser.name=") for argument in invocation))
                    self.assertIn("status" if command == "status" else "cleanup", invocation)
                    if command == "cleanup":
                        self.assertIn("--dry-run", invocation)
                    if command == "cleanup-execute":
                        self.assertIn("--execute", invocation)


if __name__ == "__main__":
    unittest.main()
