"""Write deterministic ZIP entries with bounded streaming and verify final bytes."""
import hashlib
import json
from pathlib import Path
import shutil
import sys
import zipfile


def verify(file):
    with zipfile.ZipFile(file) as archive:
        entries = archive.namelist()
        if len(entries) != len(set(entries)):
            raise ValueError("Duplicate ZIP entry")
        bad = archive.testzip()
        if bad is not None:
            raise ValueError("ZIP CRC mismatch: " + bad)
        recorded = json.loads(archive.read("SOURCE-SHA256.json"))["files"]
        if set(entries) != set(recorded) | {"SOURCE-SHA256.json"}:
            raise ValueError("ZIP inventory differs from source manifest")
        for name, expected in recorded.items():
            with archive.open(name) as stream:
                actual = hashlib.file_digest(stream, "sha256").hexdigest()
            if actual != expected:
                raise ValueError("ZIP hash mismatch: " + name)
        for item in json.loads(archive.read("PACKAGE-MANIFEST.json"))["files"]:
            if recorded.get(item["file"]) != item["sha256"]:
                raise ValueError("Package manifest mismatch: " + item["file"])


def write_package(instructions):
    base = Path(instructions["root"]).resolve()
    with zipfile.ZipFile(instructions["output"], "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in instructions["files"]:
            source = (base / name).resolve()
            if not source.is_relative_to(base) or not source.is_file():
                raise ValueError("Invalid package source: " + name)
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            with source.open("rb") as reader, archive.open(info, "w") as writer:
                shutil.copyfileobj(reader, writer, 1024 * 1024)
    verify(instructions["output"])


if sys.argv[1] == "--verify":
    verify(sys.argv[2])
else:
    instructions = json.loads(Path(sys.argv[1]).read_text())
    for package in instructions["packages"]:
        write_package(package)
        print("Verified", Path(package["output"]).name, Path(package["output"]).stat().st_size, flush=True)
    for package in instructions["packages"]:
        verify(package["output"])
