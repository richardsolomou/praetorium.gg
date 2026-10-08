#!/usr/bin/env python3
import dataclasses
import datetime
import fcntl
import hashlib
import json
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlencode


@dataclasses.dataclass(frozen=True)
class BackupConfig:
    service: str
    data_volume: str
    identity_volume: str
    prefix: str
    endpoint: str
    bucket: str
    region: str
    access_key: str = dataclasses.field(repr=False)
    secret_key: str = dataclasses.field(repr=False)

    def __post_init__(self):
        for value in (
            self.service,
            self.data_volume,
            self.identity_volume,
            self.bucket,
        ):
            if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,100}", value):
                raise ValueError("Invalid backup service, volume or bucket")
        if (
            not re.fullmatch(r"[a-z0-9][a-z0-9/-]{1,100}", self.prefix)
            or "//" in self.prefix
            or self.prefix.endswith("/")
        ):
            raise ValueError("Invalid backup prefix")
        if not re.fullmatch(
            r"https://[0-9a-f]{32}\.r2\.cloudflarestorage\.com", self.endpoint
        ):
            raise ValueError("Invalid R2 endpoint")
        if not re.fullmatch(r"[a-z0-9-]+", self.region):
            raise ValueError("Invalid R2 region")
        if any(
            not value or any(ord(char) < 32 for char in value)
            for value in (self.access_key, self.secret_key)
        ):
            raise ValueError("Invalid R2 credentials")
        if self.data_volume == self.identity_volume:
            raise ValueError("Backup volumes must differ")


def run_command(args, *, timeout=30):
    return subprocess.run(
        args, check=True, text=True, capture_output=True, timeout=timeout
    ).stdout.strip()


def container_volumes(config):
    containers = run_command(
        [
            "docker",
            "ps",
            "--filter",
            f"label=com.docker.swarm.service.name={config.service}",
            "--filter",
            "status=running",
            "--format",
            "{{.ID}}",
        ]
    ).splitlines()
    if len(containers) != 1:
        raise RuntimeError("Backup requires exactly one running SpacetimeDB container")
    container = containers[0]
    (inspected,) = json.loads(run_command(["docker", "inspect", container]))
    if inspected["State"]["Paused"]:
        raise RuntimeError("SpacetimeDB is already paused")
    volumes = {}
    for kind, name in (
        ("data", config.data_volume),
        ("identity", config.identity_volume),
    ):
        (mount,) = [
            mount
            for mount in inspected["Mounts"]
            if mount.get("Type") == "volume" and mount.get("Name") == name
        ]
        source = Path(mount["Source"])
        if not source.is_dir():
            raise RuntimeError("Backup volume is not accessible on this host")
        volumes[kind] = source
    if (
        not (volumes["data"] / "data/metadata.toml").is_file()
        or not (volumes["identity"] / "id_ecdsa").is_file()
    ):
        raise RuntimeError("Backup volumes do not contain a SpacetimeDB instance")
    return container, volumes


def archive(config, work):
    container, volumes = container_volumes(config)
    size = sum(
        int(run_command(["du", "--summarize", "--bytes", str(source)]).split()[0])
        for source in volumes.values()
    )
    if shutil.disk_usage(work).free < size * 3 + 512 * 1024 * 1024:
        raise RuntimeError("Insufficient space for backup copy, archive and readback")
    for kind, source in volumes.items():
        target = work / kind
        target.mkdir()
        # Snapshot GC may remove files during the initial copy; the frozen pass is authoritative.
        copied = subprocess.run(
            [
                "rsync",
                "--archive",
                "--hard-links",
                "--delete",
                str(source) + "/",
                str(target) + "/",
            ],
            capture_output=True,
            timeout=180,
        )
        if copied.returncode not in (0, 24):
            copied.check_returncode()
    watchdog = f"spacetime-backup-resume-{uuid.uuid4().hex}"
    # A separate systemd timer resumes the container even if this process is killed.
    run_command(
        [
            "systemd-run",
            "--quiet",
            "--collect",
            f"--unit={watchdog}",
            "--on-active=10s",
            "--timer-property=AccuracySec=100ms",
            "--property=Restart=on-failure",
            "--property=RestartSec=1s",
            "--property=StartLimitIntervalSec=0",
            "/usr/bin/python3",
            str(Path(__file__).resolve()),
            "--resume",
            container,
        ]
    )
    started = time.monotonic()
    try:
        run_command(["docker", "pause", container], timeout=2)
        for kind, source in volumes.items():
            remaining = 5 - (time.monotonic() - started)
            if remaining <= 0:
                raise TimeoutError(
                    "SpacetimeDB backup exceeded its five-second freeze budget"
                )
            subprocess.run(
                [
                    "rsync",
                    "--archive",
                    "--hard-links",
                    "--checksum",
                    "--delete",
                    "--inplace",
                    str(source) + "/",
                    str(work / kind) + "/",
                ],
                check=True,
                capture_output=True,
                timeout=remaining,
            )
        if (
            run_command(
                ["docker", "inspect", container, "--format", "{{.State.Paused}}"],
                timeout=2,
            )
            != "true"
        ):
            raise RuntimeError(
                "Backup watchdog resumed the container before the copy completed"
            )
    finally:
        # Do not cancel recovery if the Docker daemon cannot resume the container.
        if (
            run_command(
                ["docker", "inspect", container, "--format", "{{.State.Paused}}"],
                timeout=2,
            )
            == "true"
        ):
            run_command(["docker", "unpause", container], timeout=2)
        run_command(["systemctl", "stop", f"{watchdog}.timer"])
        subprocess.run(
            ["systemctl", "stop", f"{watchdog}.service"],
            capture_output=True,
            timeout=30,
        )
    print(f"SpacetimeDB backup freeze: {time.monotonic() - started:.3f}s", flush=True)
    for kind in volumes:
        run_command(
            [
                "tar",
                "--create",
                "--file",
                str(work / f"{kind}.tar"),
                "--directory",
                str(work / kind),
                ".",
            ],
            timeout=180,
        )


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def request(config, url, *, upload=None, download=None, method=None):
    credentials = (
        (config.access_key + ":" + config.secret_key)
        .replace("\\", "\\\\")
        .replace('"', '\\"')
    )
    args = [
        "curl",
        "--fail",
        "--silent",
        "--show-error",
        "--connect-timeout",
        "10",
        "--max-time",
        "180",
        "--retry",
        "3",
        "--retry-all-errors",
        "--aws-sigv4",
        f"aws:amz:{config.region}:s3",
        "--config",
        "-",
    ]
    if upload:
        args += ["--upload-file", str(upload)]
    if download:
        args += ["--output", str(download)]
    if method:
        args += ["--request", method]
    args += ["--url", url]
    return subprocess.run(
        args,
        input=f'user = "{credentials}"\n',
        text=True,
        capture_output=True,
        check=True,
        timeout=800,
    ).stdout


def publish(config, work):
    stamp = (
        datetime.datetime.now(datetime.timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )
    manifest = {"format": "praetorium.spacetime-backup.v1", "createdAt": stamp}
    base = f"{config.endpoint}/{config.bucket}"
    for kind, volume in (
        ("identity", config.identity_volume),
        ("data", config.data_volume),
    ):
        path = work / f"{kind}.tar"
        key = f"{config.prefix}/backups/{kind}/{volume}-{stamp.replace(':', '-').replace('.', '-')}.tar"
        request(config, f"{base}/{key}", upload=path)
        readback = work / "readback.tar"
        request(config, f"{base}/{key}", download=readback)
        sha256 = digest(path)
        if digest(readback) != sha256:
            raise RuntimeError(f"R2 {kind} backup readback differs from the archive")
        readback.unlink()
        manifest[kind] = {"key": key, "sha256": sha256}
    pointer = work / "latest.json"
    pointer.write_text(json.dumps(manifest))
    # Publish the pair only after both archives have been read back successfully.
    request(config, f"{base}/{config.prefix}/backups/latest.json", upload=pointer)
    for kind, volume in (
        ("data", config.data_volume),
        ("identity", config.identity_volume),
    ):
        prefix = f"{config.prefix}/backups/{kind}/"
        listing = ET.fromstring(
            request(config, f"{base}?{urlencode({'list-type': '2', 'prefix': prefix})}")
        )
        if listing.findtext("{*}IsTruncated") != "false":
            raise RuntimeError("Backup retention requires a complete R2 listing")
        pattern = re.compile(
            re.escape(prefix + volume)
            + r"-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.tar"
        )
        keys = sorted(
            key.text
            for key in listing.findall("{*}Contents/{*}Key")
            if key.text and pattern.fullmatch(key.text)
        )
        for key in keys[:-56]:
            request(config, f"{base}/{key}", method="DELETE")
    print(f"Verified SpacetimeDB backup pair: {stamp}", flush=True)


def main():
    signal.signal(signal.SIGTERM, cancelled)
    config = BackupConfig(**json.loads(Path(sys.argv[1]).read_text()))
    workspace = Path("/var/lib/praetorium-spacetime-backup") / config.service
    workspace.mkdir(mode=0o700, parents=True, exist_ok=True)
    with Path(f"/run/lock/{config.service}-backup.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        for stale in workspace.glob("work-*"):
            shutil.rmtree(stale)
        with tempfile.TemporaryDirectory(prefix="work-", dir=workspace) as directory:
            work = Path(directory)
            archive(config, work)
            publish(config, work)


def cancelled(_signal, _frame):
    raise SystemExit(143)


def resume(container):
    if not re.fullmatch(r"[0-9a-f]{12,64}", container):
        raise ValueError("Invalid backup container ID")
    existing = run_command(
        ["docker", "ps", "--all", "--filter", f"id={container}", "--format", "{{.ID}}"]
    )
    if (
        existing
        and run_command(["docker", "inspect", container, "--format", "{{.State.Paused}}"])
        == "true"
    ):
        run_command(["docker", "unpause", container])


if __name__ == "__main__":
    try:
        if len(sys.argv) == 3 and sys.argv[1] == "--resume":
            resume(sys.argv[2])
        else:
            main()
    except Exception as error:
        if isinstance(error, subprocess.CalledProcessError):
            detail = f"{error.cmd[0]} exited with {error.returncode}"
        elif isinstance(error, subprocess.TimeoutExpired):
            detail = f"{error.cmd[0]} exceeded {error.timeout:.1f}s"
        else:
            detail = str(error)
        print(f"SpacetimeDB backup failed: {detail}", file=sys.stderr)
        sys.exit(1)
