import dataclasses
import datetime
import os
import subprocess
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backupSpacetime import BackupConfig, archive, publish, prunable_archives, resume, run_command

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
                    kind = upload.name.split(".", 1)[0]
                    self.assertRegex(
                        key,
                        rf"^spacetime-production/backups/{kind}/spacetime-{kind}-[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}T[0-9]{{2}}-[0-9]{{2}}-[0-9]{{2}}-[0-9]{{3}}Z[.]tar[.]gz$",
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
            (work / "data.tar.gz").write_bytes(b"data archive")
            (work / "identity.tar.gz").write_bytes(b"identity archive")
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
                    "upload identity.tar.gz",
                    "readback identity",
                    "upload data.tar.gz",
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
                    "upload identity.tar.gz",
                    "readback identity",
                    "upload data.tar.gz",
                    "readback data",
                ],
            ),
        )

    def test_failed_second_upload_does_not_publish_pair(self):
        self.assertEqual(
            self.exercise(upload_failure="data.tar.gz"),
            (
                subprocess.CalledProcessError,
                ["upload identity.tar.gz", "readback identity", "upload data.tar.gz"],
            ),
        )

    def test_retention_does_not_delete_other_volumes(self):
        prefix = "spacetime-production/backups/data/"
        oldest = prefix + "spacetime-data-2020-09-01T00-00-00.000Z.tar"
        error, events = self.exercise(
            listing_keys=[
                oldest,
                oldest.replace("/data/spacetime-data-", "/identity/spacetime-identity-"),
                prefix + "other-volume-2020-01-01T00-00-00-000Z.tar",
            ]
        )
        self.assertEqual(
            (error, [event for event in events if event.startswith("delete ")]),
            (None, [
                "delete " + oldest,
                "delete " + oldest.replace("/data/spacetime-data-", "/identity/spacetime-identity-"),
            ]),
        )

    def test_truncated_retention_listing_fails_without_deleting_archives(self):
        self.assertEqual(
            self.exercise(truncated=True),
            (
                RuntimeError,
                [
                    "upload identity.tar.gz",
                    "readback identity",
                    "upload data.tar.gz",
                    "readback data",
                    "upload latest.json",
                ],
            ),
        )


class RetentionTest(unittest.TestCase):
    now = datetime.datetime(2026, 11, 17, 12, tzinfo=datetime.timezone.utc)
    prefix = "spacetime-production/backups/data/"

    def key(self, hours_ago, suffix=".tar.gz", separator="-"):
        stamp = (self.now - datetime.timedelta(hours=hours_ago)).strftime(
            "%Y-%m-%dT%H-%M-%S"
        )
        return f"{self.prefix}spacetime-data-{stamp}{separator}000Z{suffix}"

    def prunable(self, *keys):
        paired = [
            key.replace("/data/spacetime-data-", "/identity/spacetime-identity-")
            for key in keys
        ]
        return [
            key for key in prunable_archives([*keys, *paired], CONFIG, self.now)
            if "/data/" in key
        ]

    def test_partial_upload_does_not_displace_a_complete_pair(self):
        data = self.key(72)
        identity = data.replace("/data/spacetime-data-", "/identity/spacetime-identity-")
        orphan = self.key(66).replace("/data/spacetime-data-", "/identity/spacetime-identity-")
        self.assertEqual(prunable_archives([data, identity, orphan], CONFIG, self.now), [])

    def test_keeps_every_six_hour_snapshot_for_two_days(self):
        self.assertEqual(self.prunable(*(self.key(hour) for hour in range(0, 48, 6))), [])

    def test_keeps_only_the_newest_snapshot_per_day_through_day_fourteen(self):
        self.assertEqual(self.prunable(self.key(73), self.key(72)), [self.key(73)])

    def test_keeps_daily_snapshots_even_when_they_share_a_week(self):
        self.assertEqual(self.prunable(self.key(72), self.key(96)), [])

    def test_keeps_only_the_newest_snapshot_per_utc_week_after_two_weeks(self):
        self.assertEqual(
            self.prunable(self.key(16 * 24), self.key(17 * 24), self.key(23 * 24)),
            [self.key(17 * 24)],
        )

    def test_expires_archives_at_six_weeks(self):
        self.assertEqual(self.prunable(self.key(42 * 24)), [self.key(42 * 24)])

    def test_keeps_future_archives(self):
        self.assertEqual(self.prunable(self.key(-6)), [])

    def test_two_day_cutoff_starts_daily_retention(self):
        self.assertEqual(self.prunable(self.key(48), self.key(49)), [self.key(49)])

    def test_fourteen_day_cutoff_starts_weekly_retention(self):
        self.assertEqual(self.prunable(self.key(14 * 24), self.key(15 * 24)), [self.key(15 * 24)])

    def test_counts_gzip_and_uncompressed_archives_in_one_policy(self):
        raw = self.key(73, suffix=".tar")
        self.assertEqual(self.prunable(raw, self.key(72)), [raw])

    def test_prunes_legacy_dotted_millisecond_archives(self):
        legacy = self.key(45 * 24, suffix=".tar", separator=".")
        self.assertEqual(self.prunable(legacy), [legacy])

    def test_ignores_foreign_or_incomplete_keys(self):
        self.assertEqual(
            self.prunable(
                self.key(45 * 24) + ".partial",
                self.key(45 * 24).replace("spacetime-data-", "other-volume-"),
            ),
            [],
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
    def frozen(self, build, during_pause=lambda _source: None):
        """Runs a real copy of the volume `build` fills; returns the archive's names and what was compared by content."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, identity, work = root / "source", root / "keys", root / "work"
            for path in (source, identity, work):
                path.mkdir()
            build(source)
            paused = False
            compared = []
            subprocess_run = subprocess.run

            def execute(args, **kwargs):
                if args[:2] == ["systemctl", "stop"]:
                    return subprocess.CompletedProcess(args, 0)
                if "--files-from=-" in args:
                    compared.extend(filter(None, kwargs["input"].split("\n")))
                return subprocess_run(args, **kwargs)

            def command(args, **kwargs):
                nonlocal paused
                if args[0] == "du":
                    return "0"
                if args[:2] == ["docker", "pause"]:
                    during_pause(source)
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
            with tarfile.open(work / "data.tar.gz", "r:gz") as copied:
                return copied.getnames(), compared

    @staticmethod
    def settled_and_recent(source):
        (source / "settled").write_bytes(b"old")
        os.utime(source / "settled", (1, 1))
        (source / "recent").write_bytes(b"new")

    def test_frozen_copy_compares_only_recently_written_files(self):
        self.assertEqual(self.frozen(self.settled_and_recent)[1], ["recent"])

    def test_frozen_copy_keeps_settled_files(self):
        self.assertIn("./settled", self.frozen(self.settled_and_recent)[0])

    def test_frozen_copy_drops_a_file_deleted_after_the_first_copy(self):
        names, _ = self.frozen(
            self.settled_and_recent, lambda source: (source / "settled").unlink()
        )
        self.assertNotIn("./settled", names)

    def test_server_logs_stay_out_of_the_archive(self):
        def with_logs(source):
            (source / "data/logs").mkdir(parents=True)
            (source / "data/logs/server.log").write_bytes(b"noise")

        self.assertNotIn("./data/logs/server.log", self.frozen(with_logs)[0])

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
            with tarfile.open(work / "data.tar.gz", "r:gz") as copied:
                self.assertEqual(copied.extractfile("./value").read(), b"after!")


if __name__ == "__main__":
    unittest.main()
