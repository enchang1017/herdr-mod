import contextlib
import ctypes
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "spaces-agents/mods/spaces-agents"


@unittest.skipUnless(os.name == "nt" and shutil.which("pwsh"), "requires Windows and PowerShell 7")
class WindowsHelpers(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="herdr spaces & apostrophe' ")
        self.root = Path(self.temp.name)
        self.helper = self.root / "mods/spaces-agents/windows.ps1"
        self.helper.parent.mkdir(parents=True)
        shutil.copy2(SOURCE / "windows.ps1", self.helper)

    def tearDown(self):
        self.temp.cleanup()

    def run_helper(self, mode, payload, check=True):
        return subprocess.run(["pwsh", "-NoProfile", "-File", str(self.helper),
                               "-Mode", mode, "-Payload", payload],
                              capture_output=True, text=True, check=check, timeout=20)

    def test_hash_and_snapshot_match_and_ignore_generated_and_hidden_files(self):
        source = self.root / "mods/spaces"
        (source / "nested").mkdir(parents=True)
        (source / ".hidden").mkdir()
        (source / "main.js").write_text("export default 1")
        (source / "nested/icon.svg").write_text("<svg/>")
        (source / "gpui-kit.d.ts").write_text("generated")
        (source / ".hidden/private").write_text("hidden")
        destination = self.root / "data/spaces-agents/upstream/spaces"
        payload = {"source": str(source), "destination": str(destination)}
        self.run_helper("snapshot", json.dumps(payload))
        before = self.run_helper("hash", str(source)).stdout.strip()
        self.assertEqual(before, self.run_helper("hash", str(destination)).stdout.strip())
        (source / "gpui-kit.d.ts").write_text("changed generated")
        self.assertEqual(before, self.run_helper("hash", str(source)).stdout.strip())
        (source / "main.js").write_text("export default 2")
        self.assertNotEqual(before, self.run_helper("hash", str(source)).stdout.strip())
        (destination / "obsolete.js").write_text("old")
        self.run_helper("snapshot", json.dumps({**payload, "replace": True}))
        self.assertFalse((destination / "obsolete.js").exists())
        self.assertFalse((destination / ".hidden/private").exists())
        self.assertEqual(self.run_helper("hash", str(source)).stdout.strip(),
                         self.run_helper("hash", str(destination)).stdout.strip())

    def test_snapshot_rejects_unscoped_destination_without_modifying_it(self):
        destination = self.root / "unrelated"
        destination.mkdir()
        keep = destination / "keep.txt"
        keep.write_text("keep")
        result = self.run_helper("snapshot", json.dumps({"source": str(self.helper.parent),
                                  "destination": str(destination), "replace": True}), check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(keep.read_text(), "keep")

    def test_registry_checks_real_pid_and_transcript_with_special_characters(self):
        transcript = self.root / "session's & text.jsonl"
        transcript.write_text("{}")
        result = self.run_helper("registry", json.dumps([
            {"pid": os.getpid(), "transcript": str(transcript)},
            {"pid": 2147483647, "transcript": str(self.root / "missing")},
        ]))
        lines = result.stdout.splitlines()
        self.assertEqual(lines, [f"pid {os.getpid()}", f"file {transcript}"])

    def test_monitor_returns_real_metrics_and_parent_pid(self):
        self.assertEqual(int(self.run_helper("parent", "").stdout), os.getpid())
        result = self.run_helper("monitor", json.dumps({"pid": os.getpid(), "withChildren": True}))
        sample = json.loads(result.stdout)
        self.assertGreaterEqual(sample["cpu"], 0)
        self.assertGreater(sample["mb"], 0)
        self.assertIsInstance(sample["children"], list)
        result = self.run_helper("monitor", json.dumps({"pid": os.getpid(), "withChildren": False}))
        self.assertNotIn("children", json.loads(result.stdout))

    def test_cmd_quota_probe_returns_json_and_cleans_up_child(self):
        spec = importlib.util.spec_from_file_location("quota_rpc", SOURCE / "quota-rpc.py")
        rpc = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(rpc)
        worker = self.root / "fake rpc.py"
        pid_file = self.root / "pid.txt"
        worker.write_text("import json, os, sys, time\n"
                          f"open({str(pid_file)!r}, 'w').write(str(os.getpid()))\n"
                          "for line in sys.stdin:\n"
                          " request = json.loads(line)\n"
                          " if request.get('id') == 2:\n"
                          "  print(json.dumps({'id': 2, 'result': {'ok': True}}), flush=True)\n"
                          "  time.sleep(60)\n")
        launcher = self.root / "fake & rpc.cmd"
        launcher.write_text(f'@"{sys.executable}" "{worker}"\n')
        rpc.PROBES = {"codex": ([str(launcher)], [{"id": 2}])}
        captured = io.StringIO()
        with patch.object(sys, "argv", ["quota-rpc.py", "codex"]), contextlib.redirect_stdout(captured):
            rpc.main()
        self.assertEqual(json.loads(captured.getvalue()), {"ok": True})
        child = int(pid_file.read_text())
        kernel = ctypes.windll.kernel32
        kernel.OpenProcess.restype = ctypes.c_void_p
        handle = kernel.OpenProcess(0x00100000, False, child)
        if handle:
            try:
                self.assertEqual(kernel.WaitForSingleObject(ctypes.c_void_p(handle), 5000), 0)
            finally:
                kernel.CloseHandle(ctypes.c_void_p(handle))


if __name__ == "__main__":
    unittest.main()
