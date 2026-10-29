#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path
import plistlib
import re
import shlex
import subprocess
import sys

root = Path(__file__).resolve().parents[4]
evidence = Path(sys.argv[1])
assert evidence.is_absolute(), 'Evidence path must be absolute'
evidence.mkdir(exist_ok=False, parents=True)
expected = ['/Applications/Todo Electron.app', '/Applications/Todo.app']
identifiers = {'local.todo.Todo', 'dev.todo.electron'}
apps = []

with (evidence / 'commands.log').open('w') as log:
    def run(args):
        args = [str(arg) for arg in args]
        log.write('$ ' + shlex.join(args) + '\n')
        log.flush()
        result = subprocess.run(args, cwd=root, capture_output=True, text=True, timeout=30)
        log.write(result.stderr + '\nexit=' + str(result.returncode) + '\n')
        log.flush()
        assert result.returncode == 0, (args, result.returncode, result.stderr)
        return result.stdout

    for relative, installed, identifier in [
        ('macos/Todo.app', '/Applications/Todo.app', 'local.todo.Todo'),
        ('electron/Todo.app', '/Applications/Todo Electron.app', 'dev.todo.electron'),
    ]:
        staged = root / 'dist/signed.noindex' / relative
        icons = {}
        for app in (staged, Path(installed)):
            run(['codesign', '--verify', '--deep', '--strict', app])
            run(['codesign', '--display', '--verbose=4', app])
            metadata = plistlib.loads((app / 'Contents/Info.plist').read_bytes())
            assert metadata['CFBundleIdentifier'] == identifier, (app, metadata)
            assert metadata['CFBundleIconName'] == 'Todo', (app, metadata)
        for name in ('Assets.car', 'Todo.icns'):
            source = (staged / 'Contents/Resources' / name).read_bytes()
            target = (Path(installed) / 'Contents/Resources' / name).read_bytes()
            assert source, (staged, name)
            assert target == source, (installed, name)
            icons[name] = hashlib.sha256(target).hexdigest()
        apps.append({'staged': str(staged), 'installed': installed, 'identifier': identifier, 'icons': icons})

    dump = run(['/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', '-dump'])
    registered = []
    app_path = None
    for line in dump.splitlines():
        if line.startswith('path:'):
            app_path = re.sub(r' \(0x[0-9a-fA-F]+\)$', '', line.split(':', 1)[1].strip())
        elif line.startswith('identifier:'):
            if line.split(':', 1)[1].strip() in identifiers:
                assert app_path is not None, line
                registered.append(app_path)
            app_path = None
    registered.sort()
    query = 'kMDItemContentType == "com.apple.application-bundle" && (kMDItemCFBundleIdentifier == "local.todo.Todo" || kMDItemCFBundleIdentifier == "dev.todo.electron")'
    spotlight = sorted(run(['mdfind', query]).splitlines())
    (evidence / 'launchservices.txt').write_text('\n'.join(registered) + '\n')
    (evidence / 'spotlight.txt').write_text('\n'.join(spotlight) + '\n')

passed = registered == expected and spotlight == expected
(evidence / 'result.json').write_text(json.dumps({
    'result': 'PASS' if passed else 'FAIL', 'expected': expected,
    'launchservices': registered, 'spotlight': spotlight, 'apps': apps,
}, indent=2) + '\n')
assert passed, f'Duplicate or missing desktop apps; inspect {evidence / "result.json"}'
print('PASS: LaunchServices and Spotlight list exactly the two installed Todo apps; signatures and icon assets match')
