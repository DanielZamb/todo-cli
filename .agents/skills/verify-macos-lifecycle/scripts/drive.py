#!/usr/bin/env python3
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import sys
import time
import urllib.request
import uuid
from xml.sax.saxutils import escape

from owned_process import OwnedCommands

scratch, evidence = map(lambda p: Path(p).resolve(), sys.argv[1:])
assert scratch.name.startswith("todo-w02-verify-")
home = scratch / "home"
home.mkdir()
label = f"com.todo-cli.server.verify-{os.getpid()}-{uuid.uuid4().hex[:12]}"
target = f"gui/{os.getuid()}/{label}"
binary = scratch / "bundle/todo-server"
marker = scratch / "launchd-active"
receipts = []
commands = OwnedCommands(scratch / "command-unsafe")
env = {k: v for k, v in os.environ.items() if not k.startswith("TODO_")}
env.update(HOME=str(home), TODO_SERVICE_LABEL=label)


def run(args, expected=0, environment=None):
    if any(str(arg) in ("install", "repair", "update") for arg in args):
        root = Path(__file__).resolve().parents[4]
        run([root / "scripts/disk-guard.sh"])
    try:
        result = commands.run(list(map(str, args)), environment or env)
    except BaseException as error:
        receipts.append(dict(command=list(map(str, args)), failure=type(error).__name__,
                             message=str(error)))
        (evidence / "actions.json").write_text(json.dumps(receipts, indent=2))
        raise
    receipts.append(dict(command=list(map(str, args)), exit=result.returncode,
                         stdout=result.stdout, stderr=result.stderr))
    (evidence / "actions.json").write_text(json.dumps(receipts, indent=2))
    assert result.returncode == expected, receipts[-1]
    return result.stdout


def driver(action, *args, expected=0):
    output = run([scratch / "driver", binary, home, label, action, *args], expected)
    return json.loads(output) if expected == 0 else output


def health(port):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(f"http://127.0.0.1:{port}/health", timeout=1) as response:
        assert response.status == 200
        value = json.load(response)
        root = Path(__file__).resolve().parents[4]
        contract = re.search(r'CONTRACT_ID\s*=\s*"([a-f0-9]+)"', (root / 'packages/api/src/contract.ts').read_text())[1]
        assert value == {"service": "todo-server", "contract": contract, "build": value['build']}
    return True


def wait(check):
    end = time.monotonic() + 25
    while True:
        try:
            value = check()
            if value:
                return value
        except (OSError, ValueError, AssertionError):
            if time.monotonic() >= end:
                raise
        if time.monotonic() >= end:
            raise AssertionError("Timed out waiting for owned server")
        time.sleep(.2)


def pid(executable):
    output = run(["/bin/launchctl", "print", target])
    assert f"program = {executable}" in output
    found = re.search(r"\n\s*pid = (\d+)", output)
    assert found, output
    return int(found[1])


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def stopped(port):
    with socket.socket() as sock:
        return sock.connect_ex(("127.0.0.1", port)) != 0


def cancel(signum, frame):
    raise KeyboardInterrupt(f"Signal {signum}")


signal.signal(signal.SIGTERM, cancel)
ports = []
outside = scratch.with_name(scratch.name + "-outside")
outside.mkdir()
outside_database = outside / "outside.db"
outside_database.write_text("outside verification sentinel")
safety = []
passed = False
try:
    marker.touch()
    initial = driver("status")
    assert (initial["installed"], initial["loaded"], initial.get("configuration")) == (False, False, None)
    assert not list(home.rglob("*.db"))
    driver("install", "relative.db", "4310", expected=1)
    driver("repair", expected=1)
    driver("install", outside_database, "4310", expected=1)
    assert outside_database.read_text() == "outside verification sentinel"
    link = home / "outside.db"
    link.symlink_to(outside_database)
    driver("install", link, "4310", expected=1)
    assert outside_database.read_text() == "outside verification sentinel"
    dangling = home / "dangling.db"
    dangling.symlink_to(outside / "missing.db")
    driver("install", dangling, "4310", expected=1)
    assert not (outside / "missing.db").exists()
    directory_link = home / "outside-directory"
    directory_link.symlink_to(outside, target_is_directory=True)
    driver("install", directory_link / "new.db", "4310", expected=1)
    assert not (outside / "new.db").exists()
    linked_home = scratch / "linked-home"
    linked_home.symlink_to(home, target_is_directory=True)
    run([scratch / "driver", binary, linked_home, label, "status"], expected=1)
    deceptive_home = scratch / "nested/todo-w02-verify-fake/home"
    deceptive_home.mkdir(parents=True)
    run([scratch / "driver", binary, deceptive_home, label, "status"], expected=1)
    safety.extend(["outside install database rejected", "symlink database rejected", "dangling symlink rejected", "symlink ancestor rejected", "symlink HOME rejected", "substring HOME rejected"])
    database = home / "Tasks & plans.db"
    port = free_port()
    ports.append(port)
    marker.touch()
    installed = driver("install", database, str(port))
    executable = home / "Library/Application Support/Todo/Server/todo-server"
    config = dict(executable=str(executable), database=str(database), port=port)
    assert (installed["installed"], installed["loaded"], installed["configuration"]) == (True, True, config)
    wait(lambda: health(port))
    assert database.is_file()
    plist = Path(installed["path"])
    original = plist.read_bytes()
    (evidence / "installed.plist").write_bytes(original)
    assert driver("status")["configuration"] == config
    assert driver("status")["configuration"] == config
    driver("install", home / "must-not-create.db", str(free_port()), expected=1)
    assert not (home / "must-not-create.db").exists()
    assert plist.read_bytes() == original
    first_pid = pid(executable)
    external_plist = original.decode().replace(escape(str(database)), escape(str(outside_database)))
    assert external_plist != original.decode()
    plist.write_text(external_plist)
    driver("repair", expected=1)
    assert pid(executable) == first_pid
    assert plist.read_text() == external_plist
    assert outside_database.read_text() == "outside verification sentinel"
    plist.write_bytes(original)
    outside_executable = outside / "not-a-server"
    outside_executable.write_text("#!/bin/sh\necho ran > \"" + str(outside / "invoked") + "\"\nexit 1\n")
    outside_executable.chmod(0o755)
    executable_link = scratch / "linked-server"
    executable_link.symlink_to(outside_executable)
    external_plist = original.decode().replace(escape(str(executable)), escape(str(executable_link)))
    assert external_plist != original.decode()
    plist.write_text(external_plist)
    driver("repair", expected=1)
    assert not (outside / "invoked").exists()
    assert pid(executable) == first_pid
    plist.write_bytes(original)
    safety.extend(["outside repair database rejected without restart", "symlink repair executable rejected without execution"])
    (evidence / "path-isolation.json").write_text(json.dumps(dict(passed=safety, outsideDatabaseUnchanged=True), indent=2))
    run(["/bin/launchctl", "kill", "SIGKILL", target])
    restarted_pid = wait(lambda: (value if (value := pid(executable)) != first_pid else False))
    wait(lambda: health(port))
    assert plist.read_bytes() == original
    (evidence / "supervision.json").write_text(json.dumps(dict(before=first_pid, after=restarted_pid, health=True)))
    assert driver("repair")["configuration"] == config
    repaired_pid = wait(lambda: (value if (value := pid(executable)) != restarted_pid else False))
    wait(lambda: health(port))
    assert driver("repair")["configuration"] == config
    wait(lambda: health(port))
    run(["/bin/launchctl", "bootout", target])
    wait(lambda: stopped(port))
    assert driver("status")["loaded"] is False
    assert driver("repair")["configuration"] == config
    wait(lambda: health(port))
    assert driver("uninstall")["loaded"] is False
    assert driver("uninstall")["installed"] is False
    wait(lambda: stopped(port))
    assert database.is_file() and not plist.exists()

    existing = scratch / "legacy-server"
    existing_database = home / "Explicit existing.db"
    existing_port = free_port()
    ports.append(existing_port)
    existing_env = dict(env, TODO_DB=str(existing_database), TODO_PORT=str(existing_port))
    existing_status = json.loads(run([existing, "install"], environment=existing_env))
    expected = dict(executable=str(existing), database=str(existing_database), port=existing_port)
    assert "configuration" not in existing_status
    assert (existing_status["installed"], existing_status["loaded"]) == (True, True)
    wait(lambda: health(existing_port))
    old_hash = hashlib.sha256(existing.read_bytes()).hexdigest()
    assert driver("status")["configuration"] == expected
    assert driver("repair")["configuration"] == expected
    wait(lambda: health(existing_port))
    assert hashlib.sha256(existing.read_bytes()).hexdigest() != old_hash
    assert existing.read_bytes() == binary.read_bytes()
    assert not (home / "must-not-create.db").exists()
    (evidence / "preserved.json").write_text(json.dumps(dict(configuration=expected, executableReplaced=True, legacyS03JSON=True)))
    assert driver("uninstall")["installed"] is False
    assert driver("uninstall")["loaded"] is False
    assert existing_database.is_file()
    assert driver("uninstall")["installed"] is False
    wait(lambda: stopped(existing_port))
    shutil.copy2(scratch / "stale-server", scratch / "stale-original")
    upgrade_receipts = []
    for action in ["update", "repair"]:
        stale = scratch / "stale-server"
        stale_env = dict(env, TODO_DB=str(existing_database), TODO_PORT=str(existing_port))
        run([stale, "install"], environment=stale_env)
        wait(lambda: health(existing_port))
        stale_config = dict(executable=str(stale), database=str(existing_database), port=existing_port)
        before_pid = pid(stale)
        before_hash = hashlib.sha256(stale.read_bytes()).hexdigest()
        before_status = driver("status")
        assert before_status['installedIdentity']['build'] == 'verify-stale'
        assert before_status['bundledIdentity']['build'] != 'verify-stale'
        updated = driver(action)
        assert updated['configuration'] == stale_config
        assert updated['installedIdentity'] == updated['bundledIdentity']
        after_pid = wait(lambda: (value if (value := pid(stale)) != before_pid else False))
        wait(lambda: health(existing_port))
        assert hashlib.sha256(stale.read_bytes()).hexdigest() != before_hash
        assert stale.read_bytes() == binary.read_bytes()
        upgrade_receipts.append(dict(action=action, beforePid=before_pid, afterPid=after_pid, configuration=stale_config, identity=updated['installedIdentity']))
        assert driver("uninstall")["installed"] is False
        wait(lambda: stopped(existing_port))
        # Restore the independently compiled older build for the second action.
        if action == 'update':
            stale.unlink()
            shutil.copy2(scratch / 'stale-original', stale)
    (evidence / 'upgrades.json').write_text(json.dumps(upgrade_receipts, indent=2) + '\n')
    passed = True
finally:
    try:
        if commands.marker.exists():
            raise RuntimeError("Command descendants are not proven stopped; retain scratch before uninstall")
        cleanup = json.loads(run([binary, "uninstall"]))
        assert cleanup["installed"] is False and cleanup["loaded"] is False
        for port in ports:
            wait(lambda: stopped(port))
        assert not (home / f"Library/LaunchAgents/{label}.plist").exists()
        for stream in ("stdout", "stderr"):
            source = home / f"Library/Logs/{label}/{stream}.log"
            if source.exists():
                shutil.copy2(source, evidence / f"launchd-{stream}.log")
        (evidence / "cleanup.json").write_text(json.dumps(dict(status=cleanup, portsClosed=ports)))
        shutil.rmtree(outside)
        marker.unlink(missing_ok=True)
    finally:
        (evidence / "result.json").write_text(json.dumps(dict(passed=passed and not marker.exists() and not commands.marker.exists(),
            headlessOnly=True, nativeUI="HOLD", label=label, home=str(home), repairedPid=locals().get("repaired_pid")), indent=2))
assert passed
print("PASS headless lifecycle")
