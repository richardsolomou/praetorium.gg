import argparse
import concurrent.futures
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parent.parent
# Snapshots carry the source files, rules text included, so they are kept where only Praetorium reads them.
BUCKET = "praetorium-private"
OBJECT_WORKERS = 16


def sha256(file):
    with open(file, "rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def run(*args, check=True):
    return subprocess.run(args, check=check, capture_output=True, text=True)


def validate_release(directory):
    pointer = json.loads((directory / "release.json").read_text())
    for value in [pointer["id"], pointer["archiveSha256"]]:
        if not re.fullmatch(r"[a-f0-9]{64}", value):
            raise ValueError("invalid release hash")
    for file, expected in [("snapshot.zip", pointer["archiveSha256"]), ("manifest.json", pointer["id"])]:
        if sha256(directory / file) != expected:
            raise ValueError(f"{file} checksum does not match")
    manifest = json.loads((directory / "manifest.json").read_text())
    policy = json.loads((directory / "revocations.json").read_text())
    if policy["format"] != "praetorium.catalogue-revocations.v1":
        raise ValueError("invalid revocation policy")
    if pointer["id"] in policy["snapshots"] or set(manifest["sources"]) & set(policy["sources"]):
        raise ValueError("cannot publish revoked catalogue")
    return pointer, manifest


def missing(error):
    return getattr(error, "response", {}).get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}


def r2_client(endpoint):
    import boto3
    from botocore.config import Config

    return boto3.client("s3", endpoint_url=endpoint, config=Config(max_pool_connections=OBJECT_WORKERS))


def publish_object(client, bucket, objects, digest):
    if not re.fullmatch(r"[a-f0-9]{64}", digest):
        raise ValueError("invalid object hash")
    file = objects / f"{digest}.gz"
    hash = hashlib.sha256()
    size = 0
    with gzip.open(file, "rb") as stream:
        while chunk := stream.read(64 * 1024):
            size += len(chunk)
            if size > 64 * 1024 * 1024:
                raise ValueError("object exceeds size limit")
            hash.update(chunk)
    if hash.hexdigest() != digest:
        raise ValueError("object checksum does not match")
    key = f"catalogue/objects/{digest}.gz"
    content = file.read_bytes()
    try:
        stored = client.head_object(Bucket=bucket, Key=key)
    except Exception as error:
        if not missing(error):
            raise
        stored = None
    if stored:
        # A single-part upload's ETag is the MD5 of its bytes; anything else is read back.
        etag = stored["ETag"].strip('"')
        if "-" not in etag:
            if stored["ContentLength"] != len(content) or etag != hashlib.md5(content).hexdigest():
                raise ValueError(f"stored artifact differs: {key}")
            return
    else:
        client.put_object(Bucket=bucket, Key=key, Body=content, ContentType="application/octet-stream", CacheControl="public, max-age=31536000, immutable")
    if client.get_object(Bucket=bucket, Key=key)["Body"].read() != content:
        raise ValueError(f"stored artifact differs: {key}")


class Storage:
    def __init__(self, temporary):
        account = os.environ["CLOUDFLARE_ACCOUNT_ID"]
        if not re.fullmatch(r"[a-f0-9]{32}", account):
            raise ValueError("invalid Cloudflare account")
        self.endpoint = f"https://{account}.r2.cloudflarestorage.com"
        self.temporary = temporary

    def s3(self, *args, check=True):
        return run("aws", *args, "--endpoint-url", self.endpoint, check=check)

    def read(self, key):
        stored = self.temporary / hashlib.sha256(key.encode()).hexdigest()
        if self.s3("s3", "cp", f"s3://{BUCKET}/{key}", str(stored), "--only-show-errors", check=False).returncode:
            return None
        content = stored.read_bytes()
        stored.unlink()
        return content

    def immutable(self, file, key, content_type):
        present = self.s3("s3api", "head-object", "--bucket", BUCKET, "--key", key, check=False)
        if present.returncode:
            self.s3("s3", "cp", str(file), f"s3://{BUCKET}/{key}", "--content-type", content_type, "--cache-control", "public, max-age=31536000, immutable", "--only-show-errors")
        if self.read(key) != file.read_bytes():
            raise ValueError(f"stored artifact differs: {key}")

    def mutable(self, content, key):
        file = self.temporary / f"upload-{hashlib.sha256(key.encode()).hexdigest()}"
        file.write_bytes(content)
        self.s3("s3", "cp", str(file), f"s3://{BUCKET}/{key}", "--content-type", "application/json", "--cache-control", "no-store", "--only-show-errors")
        if self.read(key) != content:
            raise ValueError(f"mutable publication differs: {key}")


def publish(directory, objects, client=None):
    pointer, manifest = validate_release(directory)
    snapshot_id = pointer["id"]
    with tempfile.TemporaryDirectory(prefix="catalogue-publish-") as temporary:
        storage = Storage(Path(temporary))
        storage.immutable(directory / "snapshot.zip", f"catalogue/snapshots/{snapshot_id}.zip", "application/zip")
        storage.immutable(directory / "manifest.json", f"catalogue/manifests/{snapshot_id}.json", "application/json")
        storage.immutable(directory / "release.json", f"catalogue/releases/{snapshot_id}.json", "application/json")
        if pointer.get("objects"):
            client = client or r2_client(storage.endpoint)
            with concurrent.futures.ThreadPoolExecutor(max_workers=OBJECT_WORKERS) as pool:
                list(pool.map(lambda digest: publish_object(client, BUCKET, objects, digest), sorted(set(manifest["files"].values()))))
        print(f"Verified catalogue release {snapshot_id}")


def activate(snapshot_id, revocations):
    if not re.fullmatch(r"[a-f0-9]{64}", snapshot_id):
        raise ValueError("invalid snapshot id")
    policy = revocations.read_bytes()
    if snapshot_id in json.loads(policy)["snapshots"]:
        raise ValueError("cannot activate revoked catalogue")
    with tempfile.TemporaryDirectory(prefix="catalogue-activate-") as temporary:
        storage = Storage(Path(temporary))
        release = storage.read(f"catalogue/releases/{snapshot_id}.json")
        if release is None or json.loads(release)["id"] != snapshot_id:
            raise ValueError(f"catalogue release {snapshot_id} is not published")
        if storage.read("catalogue/current.json") == release and storage.read("catalogue/revocations.json") == policy:
            print(f"Catalogue release {snapshot_id} is already active")
            return
        storage.mutable(policy, "catalogue/revocations.json")
        storage.mutable(release, "catalogue/current.json")
        print(f"Activated catalogue release {snapshot_id}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    publishing = commands.add_parser("publish")
    publishing.add_argument("--directory", type=Path, default=ROOT / "build/release")
    publishing.add_argument("--objects", type=Path, default=ROOT / "build/objects")
    activating = commands.add_parser("activate")
    activating.add_argument("id")
    activating.add_argument("--revocations", type=Path, default=ROOT / "catalogue/revocations.json")
    arguments = parser.parse_args()
    if arguments.command == "publish":
        publish(arguments.directory, arguments.objects)
    else:
        activate(arguments.id, arguments.revocations)
