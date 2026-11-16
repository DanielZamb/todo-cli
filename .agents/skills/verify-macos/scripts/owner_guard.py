"""The gate cycle's owner-quiet guard, and its one override (Q15).

A gate loads the machine and a few show offscreen work, so by default a gate starts only when
neither Todo app is frontmost and there has been no input for QUIET_SECONDS.

Q15, the owner, 2026-11-16 ("Run anyway", for that day): with GATES_OWNER_ACTIVE_OK set to today's
local date (YYYY-MM-DD) the idle wait is skipped. It expires by itself: any other value, yesterday's
date included, is ignored. The wait while either Todo app is frontmost always stays. A gate that
fails while the owner was active (idle under QUIET_SECONDS at its start or end) under the override
is "owner active, rerun owed": not a finding and not a pass; the cycle stops there and the rerun is
started by hand.

`scripts/verify-owner-guard.py` is the control.
"""
import os
import subprocess
import time

TODO_APPS = ('local.todo.Todo', 'dev.todo.electron')
QUIET_SECONDS = 60
VARIABLE = 'GATES_OWNER_ACTIVE_OK'


def override(environ=None, today=None) -> dict:
    """The override as this run sees it: honoured only when the variable equals today's local date."""
    environ = os.environ if environ is None else environ
    today = today or time.strftime('%Y-%m-%d')
    value = environ.get(VARIABLE)
    return dict(variable=VARIABLE, value=value, today=today, honoured=value == today)


def should_wait(bundle: str, idle_seconds: float, honoured: bool) -> bool:
    """True while a gate must not start: a Todo app is frontmost, or (without the override) the owner
    gave input in the last QUIET_SECONDS."""
    if bundle in TODO_APPS:
        return True
    if honoured:
        return False
    return idle_seconds < QUIET_SECONDS


def owner_active(idle_at_start: float, idle_at_end: float) -> bool:
    return min(idle_at_start, idle_at_end) < QUIET_SECONDS


def front_bundle() -> str:
    front = subprocess.run(['lsappinfo', 'front'], capture_output=True, text=True).stdout.strip()
    return subprocess.run(['lsappinfo', 'info', '-only', 'bundleid', front], capture_output=True, text=True).stdout.split('=')[-1].strip().strip('"')


def idle_seconds() -> float:
    """Seconds since the owner's last keyboard or pointer input (IOHIDSystem's HIDIdleTime)."""
    return next((int(line.split('=')[-1]) / 1e9 for line in subprocess.run(['ioreg', '-c', 'IOHIDSystem'], capture_output=True, text=True).stdout.splitlines() if 'HIDIdleTime' in line), 0)
