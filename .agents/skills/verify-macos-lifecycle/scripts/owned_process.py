import os
from pathlib import Path
import signal
import subprocess
import time


class OwnedCommands:
    def __init__(self, marker: Path):
        self.marker = marker

    @staticmethod
    def groups(session):
        result = subprocess.run(["/bin/ps", "-axo", "pid=,pgid="], text=True,
                                capture_output=True, check=True, timeout=2)
        groups = set()
        for row in result.stdout.splitlines():
            pid, group = map(int, row.split())
            try:
                if os.getsid(pid) == session:
                    groups.add(group)
            except ProcessLookupError:
                pass
        return groups

    @staticmethod
    def signal_groups(groups, sig):
        for group in groups:
            try:
                os.killpg(group, sig)
            except ProcessLookupError:
                pass

    def stop(self, process):
        session = process.pid
        frozen = set()
        deadline = time.monotonic() + 2
        while True:
            current = self.groups(session)
            self.signal_groups(current, signal.SIGSTOP)
            if current <= frozen:
                break
            frozen |= current
            if time.monotonic() >= deadline:
                raise RuntimeError(f"Cannot freeze owned command session {session}")
        self.signal_groups(frozen, signal.SIGTERM)
        self.signal_groups(frozen, signal.SIGCONT)
        try:
            process.communicate(timeout=1)
        except subprocess.TimeoutExpired:
            pass
        deadline = time.monotonic() + 3
        while True:
            remaining = self.groups(session)
            if not remaining:
                break
            self.signal_groups(remaining, signal.SIGKILL)
            if time.monotonic() >= deadline:
                raise RuntimeError(f"Owned command session {session} survived cleanup: {remaining}")
            time.sleep(.02)
        process.communicate(timeout=2)

    def run(self, args, environment, timeout=45):
        self.marker.touch()
        process = None
        try:
            process = subprocess.Popen(args, env=environment, text=True,
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       start_new_session=True)
            stdout, stderr = process.communicate(timeout=timeout)
            return subprocess.CompletedProcess(args, process.returncode, stdout, stderr)
        finally:
            pending = []
            previous = {s: signal.signal(s, lambda signum, frame: pending.append(signum))
                        for s in (signal.SIGTERM, signal.SIGINT)}
            try:
                if process is not None:
                    self.stop(process)
                self.marker.unlink()
            finally:
                for sig, handler in previous.items():
                    signal.signal(sig, handler)
            if pending:
                raise KeyboardInterrupt(f"Cancellation during command cleanup: {pending}")
