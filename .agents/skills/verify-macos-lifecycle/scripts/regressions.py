#!/usr/bin/env python3
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import signal
import socket
import sys
import time
import uuid

from owned_process import OwnedCommands

scratch, evidence = (Path(p).resolve() for p in sys.argv[1:])
assert scratch.name.startswith("todo-w02-verify-")
root = Path(__file__).resolve().parents[4]
home = scratch / "home"
home.mkdir()
label = f"com.todo-cli.server.verify-{os.getpid()}-{uuid.uuid4().hex[:12]}"
target = f"gui/{os.getuid()}/{label}"
binary = scratch / "bundle/todo-server"
marker = scratch / "launchd-active"
commands = OwnedCommands(scratch / "command-unsafe")
env = {k: v for k, v in os.environ.items() if not k.startswith("TODO_")}
env.update(HOME=str(home), TODO_SERVICE_LABEL=label, SWIFT_BACKTRACE="enable=no")
receipts, checks = [], []


def run(args, environment=None):
    if any(str(arg) in ("install", "repair") for arg in args):
        guard = commands.run([str(root / "scripts/disk-guard.sh")], env)
        assert guard.returncode == 0, guard
    result = commands.run(list(map(str, args)), environment or env)
    receipts.append(dict(command=list(map(str, args)), exit=result.returncode,
                         stdout=result.stdout, stderr=result.stderr))
    (evidence / "regression-actions.json").write_text(json.dumps(receipts, indent=2))
    return result


def check(name, passed):
    checks.append(dict(name=name, passed=bool(passed)))
    (evidence / "regressions.json").write_text(json.dumps(checks, indent=2))


def driver(action, *args):
    return run([scratch / "driver", binary, home, label, action, *args])


def status():
    result = driver("status")
    assert result.returncode == 0, result
    return json.loads(result.stdout)


def wait_closed(port):
    end = time.monotonic() + 25
    while time.monotonic() < end:
        with socket.socket() as sock:
            if sock.connect_ex(("127.0.0.1", port)) != 0:
                return
        time.sleep(.1)
    raise AssertionError("Owned server port did not close")


def cancel(signum, frame):
    raise KeyboardInterrupt(f"Signal {signum}")


signal.signal(signal.SIGTERM, cancel)
port = None
try:
    values = [([], "http://127.0.0.1:4310"),
              (["--server", "https://example.invalid:8443/api"], "https://example.invalid:8443/api"),
              (["--server", "HTTP://127.0.0.1:4310"], "HTTP://127.0.0.1:4310"),
              (["--server", "http://[::1]:4310"], "http://[::1]:4310")]
    invalid = [[], ["--profile", "work"], ["relative"], ["//example.invalid"],
               ["http://"], ["file:///tmp/server"], ["http://u:p@example.invalid"],
               ["http://example.invalid:0"], ["http://example.invalid:65536"],
               ["http://example.invalid:abc"], ["http://example.invalid:"], [""], [" https://example.invalid"], ["http://bad host"], ["http://example.invalid/%zz"],
               ["http://example.invalid", "--server", "https://example.invalid"]]
    for args, expected in values:
        result = run([scratch / "configuration-driver", *args])
        check(f"valid arguments {args}", result.returncode == 0 and result.stdout.strip() == expected)
    config = home / "client.json"
    for args in invalid:
        for configured in (False, True):
            config.write_text(json.dumps(dict(server="https://configured.invalid", keychainService="scratch")))
            environment = dict(env, TODO_MACOS_CONFIG=str(config)) if configured else env
            result = run([scratch / "configuration-driver", "--server", *args], environment)
            check(f"reject explicit {args}, config={configured}", result.returncode != 0)
    for args in (["--server=http://example.invalid"], ["--server=http://example.invalid", "--server", "https://example.invalid"], ["--server", "http://example.invalid", "--server"]):
        result = run([scratch / "configuration-driver", *args])
        check(f"reject unsupported or repeated explicit {args}", result.returncode != 0)
    for address in ("relative", "http://", "file:///tmp/server", "http://u:p@example.invalid", "http://bad host", "http://example.invalid:65536"):
        config.write_text(json.dumps(dict(server=address, keychainService="scratch")))
        result = run([scratch / "configuration-driver"], dict(env, TODO_MACOS_CONFIG=str(config)))
        check(f"reject configured {address}", result.returncode != 0)
    config.write_text(json.dumps(dict(server="https://configured.invalid", keychainService="scratch")))
    result = run([scratch / "configuration-driver", "--server", "http://override.invalid"], dict(env, TODO_MACOS_CONFIG=str(config)))
    check("valid config retains precedence", result.returncode == 0 and result.stdout.strip() == "https://configured.invalid")
    check("configuration created no database or installation", not list(home.rglob("*.db")) and not (home / "Library/LaunchAgents").exists())

    marker.touch()
    assert status()["installed"] is False
    executable = home / "Library/Application Support/Todo/Server/todo-server"
    executable.parent.mkdir(parents=True)
    sentinel = b"existing executable sentinel\n"
    executable.write_bytes(sentinel)
    executable.chmod(0o755)
    database = home / "explicit.db"
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen(32)
        port = listener.getsockname()[1]
        result = driver("install", database, str(port))
        current = status()
        check("raw TCP blocks fresh install", result.returncode == 1 and "address" in result.stderr.lower())
        check("fresh rejection preserves executable", executable.read_bytes() == sentinel)
        check("fresh rejection creates no database or agent", not database.exists() and not current["installed"] and not current["loaded"])
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            check("fresh rejection leaves listener alive", True)
        assert driver("uninstall").returncode == 0
    wait_closed(port)
    assert driver("install", database, str(port)).returncode == 0
    end = time.monotonic() + 25
    while not database.exists() and time.monotonic() < end:
        time.sleep(.1)
    assert database.exists()
    assert run(["/bin/launchctl", "bootout", target]).returncode == 0
    wait_closed(port)
    current = status()
    assert current["installed"] and not current["loaded"]
    plist = Path(current["path"])
    original = plist.read_bytes()
    hashes = [hashlib.sha256(p.read_bytes()).hexdigest() for p in (database, executable)]
    with socket.socket() as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind(("127.0.0.1", port))
        listener.listen(32)
        result = driver("repair")
        check("raw TCP blocks unloaded repair", result.returncode == 1 and "address" in result.stderr.lower())
        check("repair rejection leaves agent unloaded", status()["loaded"] is False)
        check("repair rejection preserves plist database executable", plist.read_bytes() == original and hashes == [hashlib.sha256(p.read_bytes()).hexdigest() for p in (database, executable)])
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            check("repair rejection leaves listener alive", True)
        assert driver("uninstall").returncode == 0
    wait_closed(port)
    entitlements = root / "apps/macos/BunServer.entitlements"
    expected = {f"com.apple.security.cs.{key}": True for key in (
        "allow-jit", "allow-unsigned-executable-memory", "disable-executable-page-protection",
        "allow-dyld-environment-variables", "disable-library-validation")}
    check("Bun official helper entitlements", entitlements.exists() and plistlib.loads(entitlements.read_bytes()) == expected)
finally:
    if commands.marker.exists():
        raise RuntimeError("Uncertain owned command cleanup; retain scratch")
    if marker.exists():
        result = driver("uninstall")
        assert result.returncode == 0
        final = status()
        assert not final["installed"] and not final["loaded"]
        if port is not None:
            wait_closed(port)
        (evidence / "regression-cleanup.json").write_text(json.dumps(final, indent=2))
        marker.unlink()
    shutil.rmtree(home)
assert checks and all(c["passed"] for c in checks), [c for c in checks if not c["passed"]]
print(f"PASS {len(checks)} lifecycle/configuration regressions")
