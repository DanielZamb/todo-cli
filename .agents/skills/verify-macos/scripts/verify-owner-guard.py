#!/usr/bin/env python3
"""Q15's control: the owner-quiet guard and its dated override.

Usage: python3 .agents/skills/verify-macos/scripts/verify-owner-guard.py <new evidence dir> [<owner_guard.py to test>]

Against owner_guard.py (this folder's, or the one given, so a broken copy can be shown red):
1. without GATES_OWNER_ACTIVE_OK the guard holds a gate while the owner gave input in the last minute;
2. with yesterday's date it still holds (the override expires by itself);
3. with today's date it does not;
4. with today's date it still holds while either Todo app is frontmost;
5. without the variable, a minute of no input lets a gate start, as before;
6. a gate is "owner active" when the idle time at its start or its end is under a minute.
And in gates.py: the wait goes through owner_guard.should_wait with the dated override, and every gate
records idle_at_start_s and idle_at_end_s. No gate, build, app or Keychain is touched.
"""
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
evidence = Path(sys.argv[1]).resolve()
evidence.mkdir(parents=True, exist_ok=False)
source = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else HERE / 'owner_guard.py'
spec = importlib.util.spec_from_file_location('owner_guard_under_test', source)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

today, yesterday = '2026-11-16', '2026-11-15'
honoured = lambda environ: guard.override(environ, today)['honoured']
cases = {
    '1 no variable, owner active: holds': guard.should_wait('com.google.Chrome', 0, honoured({})) is True,
    '2 yesterday, owner active: holds': guard.should_wait('com.google.Chrome', 0, honoured({guard.VARIABLE: yesterday})) is True,
    '3 today, owner active: runs': guard.should_wait('com.google.Chrome', 0, honoured({guard.VARIABLE: today})) is False,
    '4 today, Todo.app frontmost: holds': guard.should_wait('local.todo.Todo', 600, honoured({guard.VARIABLE: today})) is True,
    '4 today, Todo Electron frontmost: holds': guard.should_wait('dev.todo.electron', 600, honoured({guard.VARIABLE: today})) is True,
    '5 no variable, a minute idle: runs': guard.should_wait('com.google.Chrome', 61, honoured({})) is False,
    '6 owner active at the start': guard.owner_active(10, 300) is True,
    '6 owner active at the end': guard.owner_active(300, 10) is True,
    '6 owner away throughout': guard.owner_active(300, 120) is False,
}
gates = (HERE / 'gates.py').read_text()
wiring = {
    'gates.py waits through owner_guard.should_wait with the dated override': "owner_guard.should_wait(" in gates and "OWNER['honoured']" in gates,
    'gates.py records idle_at_start_s and idle_at_end_s for every gate': 'idle_at_start_s=' in gates and 'idle_at_end_s=' in gates,
    'gates.py names the override in result.json': "owner_override=OWNER" in gates,
}
result = dict(passed=all(cases.values()) and all(wiring.values()), source=str(source), cases=cases, wiring=wiring,
              appLaunched=False, keychain='none: no build, no app')
(evidence / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
sys.exit(0 if result['passed'] else 1)
