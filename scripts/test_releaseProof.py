import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("releaseProof.sh")
REPO = "owner/app"

# Answers `gh api <path> --jq <filter>` from a fixture through the real `jq`, so the script's
# own filters are what decide, and `gh run download` writes whatever tree the fixture recorded.
FAKE_GH = """#!/usr/bin/env python3
import json, os, subprocess, sys
args = sys.argv[1:]
fixture = json.loads(os.environ["FAKE_GH"])
if args[:2] == ["run", "download"]:
    tree = fixture.get("tree")
    if tree is None:
        sys.exit(1)
    directory = args[args.index("--dir") + 1]
    open(os.path.join(directory, "tree"), "w").write(tree + "\\n")
    sys.exit(0)
path, jq = args[1], args[args.index("--jq") + 1]
body = next(value for prefix, value in fixture["api"].items() if path.startswith(prefix))
sys.exit(subprocess.run(["jq", "-r", jq], input=json.dumps(body), text=True).returncode)
"""


def git(directory: Path, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=directory, check=True, capture_output=True, text=True).stdout.strip()


class ReleaseProofTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        git(self.repo, "init", "-q")
        git(self.repo, "config", "user.email", "test@example.com")
        git(self.repo, "config", "user.name", "Test")
        (self.repo / "package.json").write_text(json.dumps({"name": "app", "version": "1.0.0"}) + "\n")
        (self.repo / "app.ts").write_text("export {}\n")
        (self.repo / ".changeset").mkdir()
        (self.repo / ".changeset" / "feature.md").write_text("---\n'app': minor\n---\n\nAdd a feature.\n")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-qm", "merge feature")
        self.main = git(self.repo, "rev-parse", "HEAD")
        self.main_tree = git(self.repo, "rev-parse", "HEAD^{tree}")

    def tearDown(self) -> None:
        self.temp.cleanup()

    def release(self, package: dict | None = None, extra: str | None = None) -> None:
        (self.repo / "package.json").write_text(json.dumps(package or {"name": "app", "version": "1.1.0"}) + "\n")
        (self.repo / "CHANGELOG.md").write_text("## 1.1.0\n\n- Add a feature.\n")
        (self.repo / ".changeset" / "feature.md").unlink()
        if extra:
            (self.repo / extra).write_text("changed\n")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-qm", "chore: release v1.1.0")

    def fixture(self, **overrides: object) -> dict:
        fixture = {
            "api": {
                f"repos/{REPO}/commits/{self.main}/pulls": [
                    {"number": 7, "merge_commit_sha": self.main, "head": {"repo": {"full_name": REPO}}}
                ],
                f"repos/{REPO}/pulls/7": {"head": {"sha": "feature-head"}},
                f"repos/{REPO}/actions/workflows/ci.yml/runs": {
                    "workflow_runs": [{"id": 42, "head_repository": {"full_name": REPO}}]
                },
            },
            "tree": self.main_tree,
        }
        fixture.update(overrides)
        return fixture

    def prove(self, fixture: dict) -> tuple[str, str]:
        bin_dir = self.root / "bin"
        bin_dir.mkdir(exist_ok=True)
        gh = bin_dir / "gh"
        gh.write_text(FAKE_GH)
        gh.chmod(0o755)
        output = self.root / "output"
        output.write_text("")
        result = subprocess.run(
            ["bash", str(SCRIPT)],
            cwd=self.repo,
            check=True,
            capture_output=True,
            text=True,
            env={
                **os.environ,
                "PATH": f"{bin_dir}:{os.environ['PATH']}",
                "REPO": REPO,
                "BASE_SHA": self.main,
                "GITHUB_OUTPUT": str(output),
                "FAKE_GH": json.dumps(fixture),
            },
        )
        return output.read_text().strip(), result.stdout

    def test_proves_a_release_on_the_tree_ci_validated(self) -> None:
        self.release()
        self.assertEqual(self.prove(self.fixture())[0], "proven=true")

    def test_runs_everything_when_pull_request_was_tested_against_another_main(self) -> None:
        self.release()
        self.assertEqual(self.prove(self.fixture(tree="0" * 40)), ("proven=false", "::notice::Running every job: pull request #7 was tested against a different main\n"))

    def test_runs_everything_when_no_run_recorded_a_tree(self) -> None:
        self.release()
        self.assertEqual(self.prove(self.fixture(tree=None)), ("proven=false", "::notice::Running every job: CI run 42 recorded no validated tree\n"))

    def test_runs_everything_when_release_commit_changes_code(self) -> None:
        self.release(extra="app.ts")
        self.assertEqual(self.prove(self.fixture()), ("proven=false", "::notice::Running every job: the release commit changes app.ts \n"))

    def test_runs_everything_when_package_json_changes_more_than_version(self) -> None:
        self.release(package={"name": "app", "version": "1.1.0", "dependencies": {"left-pad": "1.0.0"}})
        self.assertEqual(self.prove(self.fixture()), ("proven=false", "::notice::Running every job: package.json changes more than its version\n"))

    def test_runs_everything_when_release_commit_is_not_directly_on_main(self) -> None:
        (self.repo / "app.ts").write_text("export const later = 1\n")
        git(self.repo, "commit", "-qam", "a later change")
        self.release()
        self.assertEqual(self.prove(self.fixture()), ("proven=false", "::notice::Running every job: the release commit does not sit directly on main\n"))

    def test_ignores_a_passing_run_from_a_fork(self) -> None:
        self.release()
        fixture = self.fixture()
        fixture["api"][f"repos/{REPO}/actions/workflows/ci.yml/runs"] = {
            "workflow_runs": [{"id": 42, "head_repository": {"full_name": "fork/app"}}]
        }
        self.assertEqual(self.prove(fixture), ("proven=false", "::notice::Running every job: pull request #7 has no passing CI run for its last commit\n"))

    def test_runs_everything_when_main_is_not_a_pull_request_merge(self) -> None:
        self.release()
        fixture = self.fixture()
        fixture["api"][f"repos/{REPO}/commits/{self.main}/pulls"] = []
        self.assertEqual(self.prove(fixture), ("proven=false", "::notice::Running every job: main's head is not the merge of a pull request from this repository\n"))


if __name__ == "__main__":
    unittest.main()
