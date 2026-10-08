import dataclasses
import os
import subprocess
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backupSpacetime import BackupConfig, archive, publish, resume, run_command

CONFIG = BackupConfig(
    "spacetime-production",
    "spacetime-data",
    "spacetime-identity",
    "spacetime-production",
    "https://" + "a" * 32 + ".r2.cloudflarestorage.com",
    "private-backups",
    "us-east-1",
    "access",
    "secret",
)


class ArchiveTest(unittest.TestCase):
    def exercise(self, copy_error=None, resume_error=None, watchdog_fired=False):
        events = []
        paused = False

        def command(args, **_kwargs):
            nonlocal paused
            if args[:2] == ["docker", "pause"]:
                paused = True
                events.append("pause")
            elif args[:2] == ["docker", "inspect"]:
                return "true" if paused else "false"
            elif args[:2] == ["docker", "unpause"]:
                events.append("unpause")
                if resume_error:
                    raise resume_error
                paused = False
            elif args[0] == "systemd-run":
                events.append("arm watchdog")
            elif args[0] == "du":
                return "0"
            elif args[0] == "tar":
                events.append("archive")
            elif args[:2] == ["systemctl", "stop"]:
                events.append("cancel watchdog")
            return ""

        def subprocess_run(args, **kwargs):
            nonlocal paused
            if args[0] == "rsync" and "--checksum" in args:
                events.append("copy")
                self.assertLessEqual(kwargs["timeout"], 5)
                if copy_error:
                    raise copy_error
                if watchdog_fired:
                    paused = False
            return subprocess.CompletedProcess(args, 0)

        error = None
        with tempfile.TemporaryDirectory() as directory, patch(
            "backupSpacetime.container_volumes",
            return_value=(
                "container",
                {"data": Path(directory), "identity": Path(directory)},
            ),
        ), patch("backupSpacetime.run_command", side_effect=command), patch(
            "backupSpacetime.subprocess.run", side_effect=subprocess_run
        ):
            try:
                archive(CONFIG, Path(directory))
            except Exception as caught:
                error = type(caught)
        return error, paused, events

    def test_copies_both_volumes_with_an_armed_watchdog_and_resumes(self):
        self.assertEqual(
            self.exercise(),
            (
                None,
                False,
                [
                    "arm watchdog",
                    "pause",
                    "copy",
                    "copy",
                    "unpause",
                    "cancel watchdog",
                    "archive",
                    "archive",
                ],
            ),
        )

    def test_failed_copy_resumes_before_propagating_error(self):
        self.assertEqual(
            self.exercise(copy_error=subprocess.CalledProcessError(1, ["tar"])),
            (
                subprocess.CalledProcessError,
                False,
                ["arm watchdog", "pause", "copy", "unpause", "cancel watchdog"],
            ),
        )

    def test_copy_timeout_resumes_before_propagating_error(self):
        self.assertEqual(
            self.exercise(copy_error=subprocess.TimeoutExpired(["tar"], 5)),
            (
                subprocess.TimeoutExpired,
                False,
                ["arm watchdog", "pause", "copy", "unpause", "cancel watchdog"],
            ),
        )

    def test_failed_resume_leaves_independent_watchdog_armed(self):
        self.assertEqual(
            self.exercise(
                resume_error=subprocess.CalledProcessError(1, ["docker", "unpause"])
            ),
            (
                subprocess.CalledProcessError,
                True,
                ["arm watchdog", "pause", "copy", "copy", "unpause"],
            ),
        )

    def test_watchdog_firing_invalidates_the_copy(self):
        self.assertEqual(
            self.exercise(watchdog_fired=True),
            (
                RuntimeError,
                False,
                ["arm watchdog", "pause", "copy", "copy", "cancel watchdog"],
            ),
        )


class PublishTest(unittest.TestCase):
    def exercise(
        self, corrupt=None, upload_failure=None, truncated=False, listing_keys=()
    ):
        events = []
        objects = {}

        def request(_config, url, *, upload=None, download=None, method=None):
            key = url.split("private-backups/", 1)[-1]
            if upload:
                events.append("upload " + upload.name)
                if upload.name != "latest.json":
                    kind = upload.stem
                    self.assertRegex(
                        key,
                        rf"^spacetime-production/backups/{kind}/spacetime-{kind}-[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}T[0-9]{{2}}-[0-9]{{2}}-[0-9]{{2}}-[0-9]{{3}}Z[.]tar$",
                    )
                if upload.name == upload_failure:
                    raise subprocess.CalledProcessError(22, ["curl"])
                objects[key] = upload.read_bytes()
            if download:
                events.append("readback " + key.split("/")[-2])
                download.write_bytes(
                    b"corrupt" if f"/{corrupt}/" in key else objects[key]
                )
            if method == "DELETE":
                events.append("delete " + key)
            return (
                f"<ListBucketResult><IsTruncated>{str(truncated).lower()}</IsTruncated>"
                + "".join(
                    f"<Contents><Key>{key}</Key></Contents>" for key in listing_keys
                )
                + "</ListBucketResult>"
            )

        error = None
        with tempfile.TemporaryDirectory() as directory, patch(
            "backupSpacetime.request", side_effect=request
        ):
            work = Path(directory)
            (work / "data.tar").write_bytes(b"data archive")
            (work / "identity.tar").write_bytes(b"identity archive")
            try:
                publish(CONFIG, work)
            except Exception as caught:
                error = type(caught)
        return error, events

    def test_publishes_pair_only_after_both_archives_pass_readback(self):
        self.assertEqual(
            self.exercise(),
            (
                None,
                [
                    "upload identity.tar",
                    "readback identity",
                    "upload data.tar",
                    "readback data",
                    "upload latest.json",
                ],
            ),
        )

    def test_corrupt_data_readback_does_not_publish_pair(self):
        self.assertEqual(
            self.exercise(corrupt="data"),
            (
                RuntimeError,
                [
                    "upload identity.tar",
                    "readback identity",
                    "upload data.tar",
                    "readback data",
                ],
            ),
        )

    def test_failed_second_upload_does_not_publish_pair(self):
        self.assertEqual(
            self.exercise(upload_failure="data.tar"),
            (
                subprocess.CalledProcessError,
                ["upload identity.tar", "readback identity", "upload data.tar"],
            ),
        )

    def test_retention_deletes_only_the_oldest_matching_archive(self):
        prefix = "spacetime-production/backups/data/"
        oldest = prefix + "spacetime-data-2026-09-01T00-00-00-000Z.tar"
        keys = [oldest] + [
            prefix + f"spacetime-data-2026-09-02T00-00-{second:02d}-000Z.tar"
            for second in range(56)
        ]
        keys += [prefix + "other-volume-2020-01-01T00-00-00-000Z.tar"]
        error, events = self.exercise(listing_keys=keys)
        self.assertEqual(
            (error, [event for event in events if event.startswith("delete ")]),
            (None, ["delete " + oldest]),
        )

    def test_truncated_retention_listing_fails_without_deleting_archives(self):
        self.assertEqual(
            self.exercise(truncated=True),
            (
                RuntimeError,
                [
                    "upload identity.tar",
                    "readback identity",
                    "upload data.tar",
                    "readback data",
                    "upload latest.json",
                ],
            ),
        )


class ConfigTest(unittest.TestCase):
    def test_rejects_same_volume_for_data_and_identity(self):
        with self.assertRaisesRegex(ValueError, "volumes must differ"):
            dataclasses.replace(CONFIG, identity_volume=CONFIG.data_volume)

    def test_rejects_a_non_r2_upload_host(self):
        with self.assertRaisesRegex(ValueError, "Invalid R2 endpoint"):
            dataclasses.replace(CONFIG, endpoint="https://other.example")


class ResumeTest(unittest.TestCase):
    def test_watchdog_does_not_retry_a_removed_container(self):
        with patch("backupSpacetime.run_command", return_value="") as command:
            resume("abcdef123456")
        self.assertEqual(command.call_count, 1)

    def test_watchdog_leaves_a_running_container_alone(self):
        with patch(
            "backupSpacetime.run_command", side_effect=["abcdef123456", "false"]
        ) as command:
            resume("abcdef123456")
        self.assertEqual(command.call_count, 2)

    def test_watchdog_resumes_a_paused_container(self):
        with patch(
            "backupSpacetime.run_command", side_effect=["abcdef123456", "true", ""]
        ) as command:
            resume("abcdef123456")
        self.assertEqual(
            command.call_args.args, (["docker", "unpause", "abcdef123456"],)
        )


class CopyIntegrationTest(unittest.TestCase):
    def test_frozen_copy_detects_changed_bytes_with_unchanged_size_and_time(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            identity = root / "keys"
            work = root / "work"
            for path in (source, identity, work):
                path.mkdir()
            value = source / "value"
            value.write_bytes(b"before")
            original = value.stat()
            paused = False
            subprocess_run = subprocess.run

            def execute(args, **kwargs):
                if args[:2] == ["systemctl", "stop"]:
                    return subprocess.CompletedProcess(args, 0)
                return subprocess_run(args, **kwargs)

            def command(args, **kwargs):
                nonlocal paused
                if args[0] == "du":
                    return "0"
                if args[:2] == ["docker", "pause"]:
                    value.write_bytes(b"after!")
                    os.utime(value, ns=(original.st_atime_ns, original.st_mtime_ns))
                    paused = True
                elif args[:2] == ["docker", "unpause"]:
                    paused = False
                elif args[:2] == ["docker", "inspect"]:
                    return str(paused).lower()
                elif args[0] == "tar":
                    return run_command(args, **kwargs)
                return ""

            with patch(
                "backupSpacetime.container_volumes",
                return_value=("container", {"data": source, "identity": identity}),
            ), patch("backupSpacetime.run_command", side_effect=command), patch(
                "backupSpacetime.subprocess.run", side_effect=execute
            ):
                archive(CONFIG, work)
            with tarfile.open(work / "data.tar") as copied:
                self.assertEqual(copied.extractfile("./value").read(), b"after!")


if __name__ == "__main__":
    unittest.main()
