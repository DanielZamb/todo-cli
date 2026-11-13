#!/usr/bin/env python3
"""The Mac gate cycle's DAG step (MAC-C1-S1-35): the pins' premise first, then the public check.

Usage: python3 .agents/skills/verify-macos/scripts/dag-public-gate.py [receipt.json]

verify-dag-formal's public check builds its candidate from git blobs at public-pin.json's commit
(candidate-inputs.mjs, materialize), so on its own it never sees a later change to a fenced file.
Before it runs, this step asserts, for each pin file of the skill, that nothing in the pin's
scopes differs between the pin's commit and this checkout (tracked changes, committed or not, and
untracked files):
- public-pin.json, over its `scopes`;
- production-pin.json, over its `scopes`, or, when it has none, over the default list that
  candidate-inputs.mjs's materialize() uses (read from that file, never copied here).
On a difference it exits 5 before the check starts, naming the pin, its commit and the paths.
Otherwise it runs public-check.mjs and exits with its exit code.

Consequence for every Mac delivery: a head that changes a file in a pin's scopes needs that pin
renewed at that head (its check passing first), as the last, verification-only commit.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
SKILL = ROOT / '.agents/skills/verify-dag-formal'


def default_scopes() -> list:
    """The scopes materialize() uses for a pin without its own, read from candidate-inputs.mjs."""
    source = (SKILL / 'candidate-inputs.mjs').read_text()
    match = re.search(r'pin\.scopes\s*\?\?\s*\[(.*?)\]', source, re.S)
    if not match:
        raise SystemExit('dag-public-gate: cannot read materialize()\'s default scopes from candidate-inputs.mjs')
    return re.findall(r'"([^"]+)"', match.group(1))


def git(*args) -> str:
    return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout


def differing(commit: str, scopes: list) -> list:
    changed = git('diff', '--name-only', commit, '--', *scopes).split()
    untracked = git('ls-files', '--others', '--exclude-standard', '--', *scopes).split()
    return sorted(set(changed) | set(untracked))


receipt = {'pins': []}
stale = []
for name in ['public-pin.json', 'production-pin.json']:
    pin = json.loads((SKILL / name).read_text())
    scopes = pin.get('scopes') or default_scopes()
    paths = differing(pin['commit'], scopes)
    receipt['pins'].append({'pin': name, 'commit': pin['commit'], 'scopes': scopes,
                            'scopesFrom': 'pin' if pin.get('scopes') else 'candidate-inputs.mjs default', 'differing': paths})
    if paths:
        stale.append(f"{name} names {pin['commit']}, but these paths in its scopes differ in this checkout: {', '.join(paths)}")
if stale:
    receipt.update(result='STALE', check='not started')
    if len(sys.argv) > 1: Path(sys.argv[1]).write_text(json.dumps(receipt, indent=2) + '\n')
    for line in stale: print('PIN STALE: ' + line, flush=True)
    print('Renew the pin at this head (its check first) as the last, verification-only commit.', flush=True)
    sys.exit(5)
check = subprocess.run(['bun', str(SKILL / 'public-check.mjs')], cwd=ROOT)
receipt.update(result='PASS' if check.returncode == 0 else 'FAIL', check='public-check.mjs', checkExit=check.returncode)
if len(sys.argv) > 1: Path(sys.argv[1]).write_text(json.dumps(receipt, indent=2) + '\n')
sys.exit(check.returncode)
