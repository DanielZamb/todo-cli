#!/usr/bin/env python3
"""Deadlock stress for the stall sampler's suspended C window (no Swift, no app, no Keychain).

Builds the sampler and fixtures/stall-sampler/stress.c as a universal Release (-O2) binary, then:
  release  100,000 samples of a thread churning malloc and two locks; must PASS (no hang, every
           sample OK, the target advances after every resume, no window over 1 ms).
  x86_64   the Intel slice reports unsupported (attribution is compiled out there).
  control  a wrong sampler that takes the target's lock inside the window; must hang and be
           caught by the watchdog (exit 3), proving the stress detects that defect.
Usage: stall_sampler_stress.py <fresh absolute evidence dir>
"""
import json, os, subprocess, sys
from pathlib import Path

root = Path(__file__).resolve().parents[4]
evidence = Path(sys.argv[1]) if len(sys.argv) > 1 else None
assert evidence and evidence.is_absolute() and not evidence.exists(), 'Pass a fresh absolute evidence directory'
evidence.mkdir(parents=True)
source = root / 'apps/macos/API/Sources/ClientStallSampling'
stress = root / '.agents/skills/verify-client-diagnostics/fixtures/stall-sampler/stress.c'
binary = evidence / 'stress'
steps = {}
def run(name, args, env=None, timeout=600):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout, env={**os.environ, **(env or {})})
    (evidence / f'{name}.out').write_text(result.stdout + result.stderr)
    steps[name] = dict(command=[str(a) for a in args], exit=result.returncode, output=result.stdout.strip())
    return result
run('build', ['xcrun', 'clang', '-O2', '-Wall', '-Wextra', '-Werror', '-arch', 'arm64', '-arch', 'x86_64', f'-I{source}/include', source / 'ClientStallSampling.c', stress, '-o', binary])
ok = steps['build']['exit'] == 0
if ok:
    archs = run('archs', ['lipo', '-archs', binary]).stdout.split()
    release = run('release', [binary])
    # The app samples at user-interactive QoS (MAC-C1-S1-21 review): measured, reported, not gated
    # on the 1 ms window (a preempted window has no user-space maximum); it must still pass.
    interactive = run('release-user-interactive', [binary], env={'STALL_STRESS_QOS': 'user-interactive'})
    x86 = run('x86_64', ['arch', '-x86_64', binary])
    control = run('control', [binary, '--control-lock-in-window'], env={'STALL_STRESS_WATCHDOG_SECONDS': '20'})
    report = json.loads(release.stdout)
    ok = (sorted(archs) == ['arm64', 'x86_64'] and release.returncode == 0 and report['result'] == 'PASS'
          and report['windows_over_1ms'] == 0 and interactive.returncode == 0 and json.loads(interactive.stdout)['qos'] == 'user-interactive'
          and x86.returncode == 2 and 'UNSUPPORTED' in x86.stdout
          and control.returncode == 3 and 'watchdog' in control.stdout)
result = dict(result='PASS' if ok else 'FAIL', steps=steps, nativeAppLaunched=False, keychainAccess=False)
(evidence / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(result=result['result'], evidence=str(evidence))))
sys.exit(0 if ok else 1)
