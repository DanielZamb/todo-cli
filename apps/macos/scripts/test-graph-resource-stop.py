#!/usr/bin/env python3
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[3]
evidence = Path(sys.argv[1]).resolve()
if not evidence.is_relative_to(root) or evidence.exists():
    raise SystemExit('Pass a fresh evidence directory inside this checkout')
evidence.mkdir(parents=True)
node = Path(os.environ.get('TODO_DAG_REAL_NODE') or shutil.which('node')).resolve()
with tempfile.TemporaryDirectory(prefix='graph-stop-', dir=root / '.scratch') as temporary:
    scratch = Path(temporary)
    guard_count = scratch / 'guard-count'
    compiler_called = scratch / 'compiler-called'
    fake_sh = scratch / 'sh'
    fake_sh.write_text(f'''#!{sys.executable}
import os
from pathlib import Path
import sys
if len(sys.argv) > 1 and sys.argv[1].endswith('/scripts/disk-guard.sh'):
    file = Path({str(guard_count)!r})
    count = int(file.read_text()) + 1 if file.exists() else 1
    file.write_text(str(count))
    sys.exit(0 if count == 1 else 3)
os.execv('/bin/sh', ['/bin/sh', *sys.argv[1:]])
''')
    fake_sh.chmod(0o755)
    fake_bun = scratch / 'bun'
    fake_bun.write_text(f'''#!{sys.executable}
from pathlib import Path
Path({str(compiler_called)!r}).write_text('must not run')
raise SystemExit(99)
''')
    fake_bun.chmod(0o755)
    destination = scratch / 'resources'
    command = [str(node), str(root / 'apps/macos/scripts/graph-resources.mjs'), str(destination)]
    environment = dict(os.environ, PATH=str(scratch) + os.pathsep + os.environ['PATH'])
    environment.pop('TODO_MACOS_GRAPH_RESOURCE_LOCK', None)
    result = subprocess.run(command, cwd=root, env=environment, capture_output=True, text=True)
    (evidence / 'stop.log').write_text(result.stdout + result.stderr)
    assert result.returncode == 3, result.stderr
    assert guard_count.read_text() == '2'
    assert not compiler_called.exists()
    assert not destination.exists()
    receipt = dict(command=command, exit=result.returncode, initialGuard=0, sharedWrapperGuard=3, compilerCalled=False, resourcesCopied=False, realCompilerRan=False)
(evidence / 'result.json').write_text(json.dumps(receipt, indent=2) + '\n')
print('PASS: Mac outer helper preserves shared guard 3; no compiler or copy follows')
