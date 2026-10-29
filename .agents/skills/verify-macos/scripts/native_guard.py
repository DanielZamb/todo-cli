import ctypes
import errno
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import json
from contextlib import contextmanager

_cancelled = False


def install_cancellation_handler():
    def cancel(signum, frame):
        global _cancelled
        _cancelled = True
        raise KeyboardInterrupt('Native verification cancelled')
    signal.signal(signal.SIGTERM, cancel)
    signal.signal(signal.SIGINT, cancel)


@contextmanager
def cancellation_scope():
    previous = {name: signal.getsignal(name) for name in (signal.SIGTERM, signal.SIGINT)}
    try:
        install_cancellation_handler()
        yield
    finally:
        for name, handler in previous.items():
            signal.signal(name, handler)


@contextmanager
def cleanup_scope(on_cancel=None):
    def defer_cancel(signum, frame):
        global _cancelled
        _cancelled = True
        if on_cancel is not None:
            on_cancel()
    previous = {name: signal.getsignal(name) for name in (signal.SIGTERM, signal.SIGINT)}
    try:
        for name in previous:
            signal.signal(name, defer_cancel)
        yield
    finally:
        for name, handler in previous.items():
            signal.signal(name, handler)


def cancellation_requested():
    return _cancelled


def stop_group(group, reap=None):
    if reap is not None:
        reap()
    try:
        os.killpg(group, signal.SIGTERM)
    except ProcessLookupError:
        return
    deadline = time.monotonic() + .5
    while time.monotonic() < deadline:
        if reap is not None:
            reap()
        try:
            os.killpg(group, 0)
        except ProcessLookupError:
            return
        time.sleep(.02)
    try:
        os.killpg(group, signal.SIGKILL)
    except ProcessLookupError:
        pass


def process_token(pid):
    api = ctypes.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True)
    own_task = ctypes.c_uint32.in_dll(api, 'mach_task_self_').value
    port = ctypes.c_uint32()
    if api.task_name_for_pid(own_task, pid, ctypes.byref(port)) != 0:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return None
        raise RuntimeError(f'Cannot identify process {pid}; refusing PID-only signals')
    try:
        token = (ctypes.c_uint32 * 8)()
        count = ctypes.c_uint32(8)
        if api.task_info(port, 15, token, ctypes.byref(count)) != 0 or count.value != 8:
            raise RuntimeError(f'Cannot read audit token for process {pid}')
        return tuple(token)
    finally:
        api.mach_port_deallocate(own_task, port)


def process_path(token):
    api = ctypes.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True)
    buffer = ctypes.create_string_buffer(4096)
    if api.proc_pidpath_audittoken((ctypes.c_uint32 * 8)(*token), buffer, len(buffer)) > 0:
        return os.fsdecode(buffer.value)
    code = ctypes.get_errno()
    if code in (errno.ESRCH, errno.ENOENT):
        return None
    raise OSError(code, os.strerror(code))


def signal_process(token, signum):
    if token is None:
        return False
    api = ctypes.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True)
    code = api.proc_signal_with_audittoken((ctypes.c_uint32 * 8)(*token), signum)
    if code not in (0, errno.ESRCH):
        raise OSError(code, os.strerror(code))
    return code == 0


def stop_native_processes(tokens, timeout=1):
    active = set(tokens)
    for signum in (signal.SIGTERM, signal.SIGKILL):
        for token in active:
            signal_process(token, signum)
        deadline = time.monotonic() + timeout
        while active:
            active = {token for token in active if process_path(token) is not None}
            if not active or time.monotonic() >= deadline:
                break
            time.sleep(.02)
    if active:
        raise TimeoutError('Owned native processes survived cleanup')


def stop_process(process):
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=1)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=2)


def finish_focused(evidence, completed):
    try:
        passed = json.loads((evidence / 'ui-proof.json').read_text()).get('passed') is True
    except (OSError, ValueError, AttributeError):
        passed = False
    if completed and passed and not cancellation_requested():
        (evidence / 'finish-proof').touch()
        if not cancellation_requested():
            return
    (evidence / 'finish-proof').unlink(missing_ok=True)
    (evidence / 'abort-proof').write_text('Focused verification stopped; no automatic app relaunch. New consent is required.\n')


def require_consent():
    if os.environ.get('TODO_VERIFY_NATIVE_UI') != '1':
        print('HOLD: native verification needs current user consent and TODO_VERIFY_NATIVE_UI=1.', file=sys.stderr)
        raise SystemExit(78)
    root = Path(__file__).resolve().parents[4]
    if (root / 'apps/macos/DerivedData/keychain-failure.json').exists():
        print('HOLD: recorded Keychain failure. Review it and obtain new user consent before another native attempt.', file=sys.stderr)
        raise SystemExit(78)


def keychain_environment(root):
    return {**os.environ, 'TODO_VERIFY_KEYCHAIN_NO_UI': '1',
            'TODO_VERIFY_KEYCHAIN_FAILURE': str(root / 'apps/macos/DerivedData/keychain-failure.json')}


def run_once(command, *, cwd, log, failure_path, timeout=300):
    if cancellation_requested():
        return 130
    if failure_path.exists():
        return 78
    run = None
    previous = {name: signal.getsignal(name) for name in (signal.SIGINT, signal.SIGTERM)}
    code = 130

    def cancel(signum, frame):
        global _cancelled
        _cancelled = True
        raise InterruptedError('Native verification cancelled')

    try:
        for name in previous:
            signal.signal(name, cancel)
        run = subprocess.Popen(command, cwd=cwd, env=keychain_environment(cwd), stdout=log,
                               stderr=subprocess.STDOUT, start_new_session=True)
        deadline = time.monotonic() + timeout
        while run.poll() is None:
            if failure_path.exists():
                code = 78
                break
            if time.monotonic() >= deadline:
                code = 124
                break
            time.sleep(.1)
        else:
            code = run.returncode
    except (InterruptedError, KeyboardInterrupt):
        code = 130
    finally:
        try:
            with cleanup_scope():
                if run is not None:
                    try:
                        stop_group(run.pid, reap=run.poll)
                    finally:
                        run.wait(timeout=2)
        finally:
            for name, handler in previous.items():
                signal.signal(name, handler)
    return 130 if cancellation_requested() else 78 if failure_path.exists() else code
