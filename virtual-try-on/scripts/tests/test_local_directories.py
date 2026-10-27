import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "local_directories", Path(__file__).resolve().parents[1] / "local_directories.py")
directories = importlib.util.module_from_spec(spec)
spec.loader.exec_module(directories)


class LocalDirectoryPreparationTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="local-path-proof-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        (self.root / "services/backend").mkdir(parents=True)

    def test_fresh_paths_are_private_and_owned_by_the_host_user(self):
        directories.prepare(self.root)
        for _, relative in directories.DIRECTORIES:
            metadata = (self.root / relative).stat()
            self.assertEqual(metadata.st_uid, os.getuid())
            self.assertEqual(metadata.st_mode & 0o777, 0o700)

    def test_existing_objects_and_permissions_are_preserved(self):
        directories.prepare(self.root)
        item = self.root / "services/backend/work/local-data/owned-object"
        item.write_bytes(b"unchanged synthetic object")
        item.chmod(0o600)
        directories.prepare(self.root)
        self.assertEqual(item.read_bytes(), b"unchanged synthetic object")
        self.assertEqual(item.stat().st_mode & 0o777, 0o600)

    def test_foreign_owned_paths_are_refused_before_chmod(self):
        work = self.root / "work"
        work.mkdir(mode=0o755)
        work.chmod(0o755)
        with patch.object(directories.os, "getuid", return_value=os.getuid() + 10000):
            with self.assertRaisesRegex(directories.LocalDirectoryError, "FOREIGN_OWNER_LOCAL_WORK"):
                directories.prepare(self.root)
        self.assertEqual(work.stat().st_mode & 0o777, 0o755)

    def test_symlinked_media_path_is_refused_without_touching_target(self):
        backend_work = self.root / "services/backend/work"
        backend_work.mkdir()
        target = self.root / "outside"
        target.mkdir(mode=0o755)
        target.chmod(0o755)
        (backend_work / "local-data").symlink_to(target, target_is_directory=True)
        with self.assertRaisesRegex(directories.LocalDirectoryError, "SYMLINK_LOCAL_MEDIA"):
            directories.prepare(self.root)
        self.assertEqual(target.stat().st_mode & 0o777, 0o755)
        self.assertEqual(list(target.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
