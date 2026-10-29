#!/usr/bin/env python3
import json
from pathlib import Path
import re
import subprocess
import sys

root = Path(__file__).resolve().parents[3]
base = 'a19f207'
sources = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', base, 'apps/macos/Sources'], cwd=root, text=True).splitlines()
original = '\n'.join(subprocess.check_output(['git', 'show', f'{base}:{name}'], cwd=root, text=True) for name in sources if name.endswith('.swift'))
current = '\n'.join(path.read_text() for path in (root / 'apps/macos/Sources').glob('*.swift'))
pattern = r'accessibilityIdentifier\(\s*"([^"\n]*)"\s*\)'
expected = set(re.findall(pattern, original))
actual = set(re.findall(pattern, current))
missing = sorted(expected - actual)
receipt = {'base': base, 'existingIdentifierExpressions': len(expected), 'missing': missing, 'status': 'FAIL' if missing else 'PASS'}
Path(sys.argv[1]).write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
raise SystemExit(1 if missing else 0)
