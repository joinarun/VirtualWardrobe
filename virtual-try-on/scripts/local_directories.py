#!/usr/bin/env python3
"""Prepare private host-owned local paths without adopting another user's data."""
import os
from pathlib import Path
import stat
import sys


DIRECTORIES = (
    ("LOCAL_WORK", Path("work")),
    ("BACKEND_WORK", Path("services/backend/work")),
    ("LOCAL_MEDIA", Path("services/backend/work/local-data")),
)


class LocalDirectoryError(Exception):
    pass


def prepare(root):
    root = Path(root)
    for role, relative in DIRECTORIES:
        path = root / relative
        cursor = root
        for part in relative.parts:
            cursor = cursor / part
            if cursor.is_symlink():
                raise LocalDirectoryError("SYMLINK_" + role)
        path.mkdir(mode=0o700, exist_ok=True)
        attributes = path.lstat()
        if not stat.S_ISDIR(attributes.st_mode):
            raise LocalDirectoryError("NOT_DIRECTORY_" + role)
        if attributes.st_uid != os.getuid():
            raise LocalDirectoryError("FOREIGN_OWNER_" + role)
        path.chmod(0o700)


if __name__ == "__main__":
    try:
        prepare(Path.cwd())
    except (LocalDirectoryError, OSError) as error:
        code = str(error) if isinstance(error, LocalDirectoryError) else "FILESYSTEM_ACCESS"
        print("LOCAL_DIRECTORY_ERROR=" + code, file=sys.stderr)
        print("Refusing to change existing ownership or follow links. Use a fresh isolated project for checks.", file=sys.stderr)
        sys.exit(2)
