import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import publishCatalogue as publish


class MissingObject(Exception):
    response = {"Error": {"Code": "404"}}


class FakeR2:
    def __init__(self):
        self.objects = {}
        self.etags = {}
        self.calls = []

    def head_object(self, Bucket, Key):
        self.calls.append(("head", Key))
        if Key not in self.objects:
            raise MissingObject()
        return {"ETag": f'"{self.etags.get(Key) or hashlib.md5(self.objects[Key]).hexdigest()}"', "ContentLength": len(self.objects[Key])}

    def put_object(self, Bucket, Key, Body, ContentType, CacheControl):
        self.calls.append(("put", Key))
        self.objects[Key] = Body

    def get_object(self, Bucket, Key):
        self.calls.append(("get", Key))
        return {"Body": io.BytesIO(self.objects[Key])}


class PublisherTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.assets = {}
        self.storage = {}
        self.calls = []
        self.created = False
        self.corrupt_r2 = False
        (self.directory / "snapshot.zip").write_bytes(b"snapshot.zip")
        manifest = {"sources": ["definitions"], "files": {}}
        (self.directory / "manifest.json").write_text(json.dumps(manifest))
        self.pointer = {
            "id": publish.sha256(self.directory / "manifest.json"),
            "archiveSha256": publish.sha256(self.directory / "snapshot.zip"),
        }
        (self.directory / "release.json").write_text(json.dumps(self.pointer))
        (self.directory / "revocations.json").write_text(json.dumps({"format": "praetorium.catalogue-revocations.v1", "snapshots": [], "sources": []}))
        self.environment = patch.dict(os.environ, {"CLOUDFLARE_ACCOUNT_ID": "a" * 32, "GITHUB_REPOSITORY": "owner/app", "CATALOGUE_RELEASE_TARGET": "f" * 40})
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def add_object(self, content):
        digest = hashlib.sha256(content).hexdigest()
        (self.directory / f"{digest}.gz").write_bytes(gzip.compress(content, mtime=0))
        (self.directory / "manifest.json").write_text(json.dumps({"sources": ["definitions"], "files": {"definitions/book.json": digest}}))
        self.pointer.update(id=publish.sha256(self.directory / "manifest.json"), objects=True)
        (self.directory / "release.json").write_text(json.dumps(self.pointer))
        return f"catalogue/objects/{digest}.gz"

    def command(self, *args, check=True):
        self.calls.append(args)
        status = 0
        output = ""
        if args[:3] == ("gh", "release", "view"):
            status = 0 if self.created else 1
            output = json.dumps({"isDraft": True})
        elif args[:3] == ("gh", "release", "create"):
            self.created = True
        elif args[:3] == ("gh", "release", "upload"):
            file = Path(args[4])
            self.assets[file.name] = file.read_bytes()
        elif args[:3] == ("gh", "release", "download"):
            name = args[args.index("--pattern") + 1]
            if name not in self.assets:
                status = 1
            else:
                (Path(args[args.index("--dir") + 1]) / name).write_bytes(self.assets[name])
        elif args[:3] == ("aws", "s3api", "head-object"):
            key = args[args.index("--key") + 1]
            status = 0 if "s3://praetorium/" + key in self.storage else 1
        elif args[:3] == ("aws", "s3", "cp"):
            source, target = args[3:5]
            if source.startswith("s3://"):
                if source not in self.storage:
                    status = 1
                else:
                    Path(target).write_bytes(b"wrong" if self.corrupt_r2 else self.storage[source])
            else:
                self.storage[target] = Path(source).read_bytes()
        if status and check:
            raise subprocess.CalledProcessError(status, args)
        return subprocess.CompletedProcess(args, status, output, "")

    def test_repeated_publication_creates_one_release(self):
        with patch.object(publish, "run", self.command):
            publish.publish(self.directory, self.directory)
            publish.publish(self.directory, self.directory)
        self.assertEqual(sum(call[:3] == ("gh", "release", "create") for call in self.calls), 1)

    def test_publication_never_marks_a_catalogue_release_latest(self):
        with patch.object(publish, "run", self.command):
            publish.publish(self.directory, self.directory)
        self.assertEqual([call for call in self.calls if any(argument.startswith("--latest") for argument in call) and "--latest=false" not in call], [])

    def test_bad_storage_readback_fails_publication(self):
        self.corrupt_r2 = True
        with patch.object(publish, "run", self.command), self.assertRaisesRegex(ValueError, "stored artifact differs"):
            publish.publish(self.directory, self.directory)

    def test_candidate_publication_leaves_discovery_unchanged(self):
        with patch.object(publish, "run", self.command):
            publish.publish(self.directory, self.directory)
        self.assertNotIn("s3://praetorium/catalogue/current.json", self.storage)
        self.assertNotIn("s3://praetorium/catalogue/revocations.json", self.storage)

    def test_activation_points_discovery_at_the_published_release(self):
        with patch.object(publish, "run", self.command):
            publish.publish(self.directory, self.directory)
            publish.activate(self.pointer["id"], self.directory / "revocations.json")
        self.assertEqual(self.storage["s3://praetorium/catalogue/current.json"], (self.directory / "release.json").read_bytes())

    def test_activation_publishes_the_revocation_policy(self):
        with patch.object(publish, "run", self.command):
            publish.publish(self.directory, self.directory)
            publish.activate(self.pointer["id"], self.directory / "revocations.json")
        self.assertEqual(self.storage["s3://praetorium/catalogue/revocations.json"], (self.directory / "revocations.json").read_bytes())

    def test_activation_of_the_active_release_writes_nothing(self):
        with patch.object(publish, "run", self.command):
            publish.publish(self.directory, self.directory)
            publish.activate(self.pointer["id"], self.directory / "revocations.json")
            uploads = len([call for call in self.calls if call[:3] == ("aws", "s3", "cp") and call[4].startswith("s3://")])
            publish.activate(self.pointer["id"], self.directory / "revocations.json")
        self.assertEqual(len([call for call in self.calls if call[:3] == ("aws", "s3", "cp") and call[4].startswith("s3://")]), uploads)

    def test_unpublished_release_cannot_be_activated(self):
        with patch.object(publish, "run", self.command), self.assertRaisesRegex(ValueError, "is not published"):
            publish.activate(self.pointer["id"], self.directory / "revocations.json")
        self.assertNotIn("s3://praetorium/catalogue/current.json", self.storage)

    def test_revoked_release_cannot_be_activated(self):
        (self.directory / "revocations.json").write_text(json.dumps({"format": "praetorium.catalogue-revocations.v1", "snapshots": [self.pointer["id"]], "sources": []}))
        with patch.object(publish, "run", self.command), self.assertRaisesRegex(ValueError, "revoked"):
            publish.activate(self.pointer["id"], self.directory / "revocations.json")
        self.assertEqual(self.calls, [])

    def test_bad_discovery_readback_fails_activation(self):
        with patch.object(publish, "run", self.command):
            publish.publish(self.directory, self.directory)
            self.corrupt_r2 = True
            with self.assertRaises(ValueError):
                publish.activate(self.pointer["id"], self.directory / "revocations.json")

    def test_mismatched_github_asset_prevents_storage_publication(self):
        self.created = True
        self.assets["snapshot.zip"] = b"wrong"
        with patch.object(publish, "run", self.command), self.assertRaisesRegex(ValueError, "GitHub mirror differs"):
            publish.publish(self.directory, self.directory)
        self.assertEqual(self.storage, {})

    def test_changed_archive_is_rejected_before_any_external_write(self):
        (self.directory / "snapshot.zip").write_bytes(b"wrong")
        with patch.object(publish, "run", self.command), self.assertRaisesRegex(ValueError, "snapshot.zip checksum"):
            publish.publish(self.directory, self.directory)
        self.assertEqual(self.calls, [])

    def test_new_object_is_read_back_after_upload(self):
        key = self.add_object(b"book")
        r2 = FakeR2()
        with patch.object(publish, "run", self.command):
            publish.publish(self.directory, self.directory, client=r2)
        self.assertIn(("get", key), r2.calls)

    def test_existing_object_with_matching_etag_is_not_downloaded(self):
        key = self.add_object(b"book")
        r2 = FakeR2()
        r2.objects[key] = (self.directory / key.split("/")[-1]).read_bytes()
        with patch.object(publish, "run", self.command):
            publish.publish(self.directory, self.directory, client=r2)
        self.assertNotIn(("get", key), r2.calls)

    def test_existing_object_with_different_etag_fails_publication(self):
        key = self.add_object(b"book")
        r2 = FakeR2()
        r2.objects[key] = b"other"
        with patch.object(publish, "run", self.command), self.assertRaisesRegex(ValueError, "stored artifact differs"):
            publish.publish(self.directory, self.directory, client=r2)

    def test_existing_multipart_object_is_read_back(self):
        key = self.add_object(b"book")
        r2 = FakeR2()
        r2.objects[key] = (self.directory / key.split("/")[-1]).read_bytes()
        r2.etags[key] = "0123-2"
        with patch.object(publish, "run", self.command):
            publish.publish(self.directory, self.directory, client=r2)
        self.assertIn(("get", key), r2.calls)


if __name__ == "__main__":
    unittest.main()
