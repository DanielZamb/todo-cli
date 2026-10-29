#!/usr/bin/env python3
import json
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import uuid
from native_guard import require_consent, run_once, cancellation_scope, cancellation_requested, cleanup_scope, finish_focused, process_token, process_path, signal_process, stop_native_processes

require_consent()

def main():
    root = Path(__file__).resolve().parents[4]
    appearance = sys.argv[1]
    assert appearance in ('unit', 'light', 'dark')
    test_plan = root / 'dist/signed.noindex/macos/Todo.xctestrun'
    if not test_plan.is_file():
        raise RuntimeError('Focused XCTest needs a user-prepared signed dist/signed.noindex/macos/Todo.xctestrun. No build or signing is allowed here. Use the signed Release CUA drive.')
    configuration = root / 'apps/macos/DerivedData/verification.json'
    config = json.loads(configuration.read_text())
    driver = int(sys.argv[2]) if len(sys.argv) > 2 else int(subprocess.check_output(['ps', '-p', config['appPid'], '-o', 'ppid='], text=True))
    driver_token = process_token(driver)
    command = subprocess.check_output(['ps', '-p', str(driver), '-o', 'command='], text=True)
    assert str(root / '.agents/skills/verify-macos/scripts/drive.py') in command
    assert str(Path(config['db']).parent) in command
    if driver_token is None or process_token(driver) != driver_token:
        raise RuntimeError('Owned driver changed during identity validation')
    evidence = Path(config['evidence'])
    config['captureAppearance'] = appearance
    config['appearance'] = appearance.capitalize()
    config['keychainService'] += '.' + appearance + '-' + str(uuid.uuid4())
    number = 1
    while (evidence / f'Native-{appearance}-r{number}.xcresult').exists():
        number += 1
    bundle = evidence / f'Native-{appearance}-r{number}.xcresult'
    config['captureTaskTitle'] = f'Menu bar XCTest {appearance} r{number}'
    configuration.write_text(json.dumps(config))
    export = evidence / f'native-{appearance}-r{number}-attachments'
    guard = str(root / 'scripts/disk-guard.sh')
    subprocess.run([guard], check=True)
    app_binary = str(root / 'dist/signed.noindex/macos/Todo.app/Contents/MacOS/Todo')
    runner_binary = str(root / 'dist/signed.noindex/macos/TodoUITests-Runner.app/Contents/MacOS/TodoUITests-Runner')


    def native_pids():
        result = set()
        for line in subprocess.check_output(['ps', '-axo', 'pid=,comm='], text=True).splitlines():
            pid, command = line.strip().split(maxsplit=1)
            if any(command == path or command.startswith(path + ' ') for path in (app_binary, runner_binary)):
                token = process_token(int(pid))
                if token is not None and process_path(token) in (app_binary, runner_binary):
                    result.add(token)
        return result


    before = native_pids()
    app_token = process_token(int(config['appPid']))
    if app_token is None or app_token not in before or process_path(app_token) != app_binary:
        raise RuntimeError('Stored app PID does not identify the owned app')
    code = 130
    completed = False
    paused = False
    try:
        if not signal_process(driver_token, signal.SIGSTOP):
            raise RuntimeError('Owned driver exited before it could be paused')
        paused = True
        signal_process(app_token, signal.SIGTERM)
        selection = '-only-testing:TodoTests' if appearance == 'unit' else '-only-testing:TodoUITests/MenuBarFlowTests'
        command = ['xcodebuild', 'test-without-building', '-xctestrun', str(test_plan), '-destination', 'platform=macOS', '-parallel-testing-enabled', 'NO', selection, '-resultBundlePath', str(bundle)]
        (evidence / f'native-{appearance}-command-r{number}.json').write_text(json.dumps(command, indent=2))
        with (evidence / f'native-{appearance}-r{number}.log').open('w') as log:
            code = run_once(command, cwd=root, log=log, failure_path=root / 'apps/macos/DerivedData/keychain-failure.json', timeout=90)
        (evidence / f'native-{appearance}-exit-r{number}.json').write_text(json.dumps({'exit': code}))
        if (bundle / 'Info.plist').exists():
            subprocess.run(['xcrun', 'xcresulttool', 'export', 'attachments', '--path', str(bundle), '--output-path', str(export)], check=True)
        names = [] if appearance == 'unit' else ['session-restored', 'menu-bar-ready', 'today-ready', 'quick-add-ready', 'editor-ready', 'date-picker-ready', 'overdue-ready', 'scheduled-ready', 'inbox-ready']
        for test in json.loads((export / 'manifest.json').read_text()) if (export / 'manifest.json').exists() else []:
            for attachment in test['attachments']:
                human = attachment['suggestedHumanReadableName']
                source = export / attachment['exportedFileName']
                for name in names:
                    target = name + '-' + appearance
                    if human.startswith(target + '_') and source.suffix == '.png':
                        shutil.copyfile(source, evidence / (target + '.png'))
                    if human.startswith(target + '-ax_'):
                        shutil.copyfile(source, evidence / (target + '.txt'))
                if human.startswith('menu-bar-ui_'):
                    shutil.copyfile(source, evidence / ('menu-bar-' + appearance + '.json'))
        assert code == 0, 'Inspect ' + str(bundle)
        for name in names:
            assert (evidence / (name + '-' + appearance + '.png')).stat().st_size > 1000
        completed = True
    finally:
        with cleanup_scope(on_cancel=lambda: finish_focused(evidence, False)):
            cleaned = False
            try:
                if paused:
                    stop_native_processes(native_pids() - before)
                    (evidence / ('keychain-cleanup-' + appearance + '.json')).write_text(json.dumps({'service': config['keychainService'], 'account': config['server'], 'status': 'manual; no Keychain calls during cleanup'}, indent=2))
                    cleaned = True
            finally:
                try:
                    finish_focused(evidence, completed and cleaned and sys.exc_info()[0] is None)
                finally:
                    try:
                        if not signal_process(driver_token, signal.SIGCONT):
                            raise RuntimeError('Owned driver exited before resumption')
                    except BaseException:
                        finish_focused(evidence, False)
                        raise
    if cancellation_requested():
        raise SystemExit(130)
    print(f'Native {appearance} XCTest PASS' + ('; exported screenshots' if names else ''), flush=True)


with cancellation_scope():
    main()
