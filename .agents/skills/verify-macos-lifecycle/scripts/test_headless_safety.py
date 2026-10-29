#!/usr/bin/env python3
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest

from owned_process import OwnedCommands

WORKER = r'''
import pathlib, signal, subprocess, sys, time
signal.signal(signal.SIGTERM, signal.SIG_IGN)
child = subprocess.Popen([sys.executable, "-c", "import pathlib,signal,sys,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); time.sleep(8); pathlib.Path(sys.argv[1]).write_text('late mutation')", sys.argv[2]], process_group=0, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
pathlib.Path(sys.argv[1]).write_text(str(child.pid))
time.sleep(30)
'''


def wait_file(path):
    end = time.monotonic() + 5
    while not path.exists():
        if time.monotonic() > end:
            raise AssertionError(f"Missing {path}")
        time.sleep(.02)


def gone(pid):
    end = time.monotonic() + 3
    while True:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return
        if time.monotonic() > end:
            raise AssertionError(f"Owned child {pid} survived")
        time.sleep(.02)


class HeadlessSafetyTests(unittest.TestCase):
    def test_timeout_stops_descendants_before_cleanup(self):
        with tempfile.TemporaryDirectory(prefix="todo-w02-safety-") as directory:
            root = Path(directory)
            child = root / "child"
            mutation = root / "late-mutation"
            marker = root / "command-unsafe"
            commands = OwnedCommands(marker)
            with self.assertRaises(subprocess.TimeoutExpired):
                commands.run([sys.executable, "-c", WORKER, str(child), str(mutation)], os.environ.copy(), timeout=.5)
            wait_file(child)
            gone(int(child.read_text()))
            self.assertFalse(marker.exists())
            self.assertFalse(mutation.exists())

    def test_cancellation_stops_descendants_and_preserves_unrelated_process(self):
        with tempfile.TemporaryDirectory(prefix="todo-w02-safety-") as directory:
            root = Path(directory)
            child = root / "child"
            mutation = root / "late-mutation"
            marker = root / "command-unsafe"
            runner = root / "runner.py"
            runner.write_text("\n".join([
                "import os,signal,sys",
                f"sys.path.insert(0, {str(Path(__file__).parent)!r})",
                "from pathlib import Path",
                "from owned_process import OwnedCommands",
                "def cancel(signum,frame): raise KeyboardInterrupt()",
                "signal.signal(signal.SIGTERM,cancel)",
                "try:",
                f"    OwnedCommands(Path({str(marker)!r})).run([sys.executable,'-c',{WORKER!r},{str(child)!r},{str(mutation)!r}],os.environ.copy())",
                "except KeyboardInterrupt: sys.exit(130)",
            ]))
            unrelated = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"], start_new_session=True)
            process = subprocess.Popen([sys.executable, str(runner)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                wait_file(child)
                process.send_signal(signal.SIGTERM)
                output, error = process.communicate(timeout=8)
                self.assertEqual(process.returncode, 130, output + error)
                gone(int(child.read_text()))
                self.assertFalse(marker.exists())
                self.assertFalse(mutation.exists())
                self.assertIsNone(unrelated.poll())
            finally:
                if process.poll() is None:
                    process.kill()
                process.communicate()
                unrelated.terminate()
                unrelated.wait(timeout=3)

    def test_uncertain_termination_retains_marker(self):
        with tempfile.TemporaryDirectory(prefix="todo-w02-safety-") as directory:
            marker = Path(directory) / "command-unsafe"
            commands = OwnedCommands(marker)
            commands.stop = lambda process: (_ for _ in ()).throw(RuntimeError("cleanup uncertain"))
            with self.assertRaisesRegex(RuntimeError, "cleanup uncertain"):
                commands.run([sys.executable, "-c", "pass"], os.environ.copy())
            self.assertTrue(marker.exists())


if __name__ == "__main__":
    unittest.main()
