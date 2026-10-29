#!/usr/bin/env python3
from pathlib import Path
import re
import subprocess
import sys

output = Path(sys.argv[1]).resolve()
apps = [output / 'macos/Todo.app', output / 'electron/Todo.app']
assert output.name.endswith('.noindex'), output
assert all(app.is_dir() for app in apps), apps
lsregister = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
result = subprocess.run([lsregister, '-u', *map(str, apps)], capture_output=True, text=True, timeout=30)
# lsregister can unregister an excluded bundle, then fail its Spotlight scan.
dump = subprocess.check_output([lsregister, '-dump'], text=True, timeout=30)
remaining = [str(app) for app in apps if re.search(r'^path:\s+' + re.escape(str(app)) + r'(?: \(0x[0-9a-fA-F]+\))?$', dump, re.MULTILINE)]
if remaining:
    sys.stderr.write(result.stdout + result.stderr)
    raise SystemExit('Desktop build copies remain registered: ' + ', '.join(remaining))
print('Desktop build copies are absent from LaunchServices.')
