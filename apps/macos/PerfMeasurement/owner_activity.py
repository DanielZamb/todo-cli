import json
import math
import os
from pathlib import Path
import subprocess
import time


def owner_activity(directory, now, app_running):
    last_input = None
    readable = False
    uncertain = False
    for name in ['previous.ndjson', 'current.ndjson']:
        path = directory / name
        try:
            with path.open() as source:
                readable = True
                for line in source:
                    try:
                        record = json.loads(line)
                        if not isinstance(record, dict):
                            uncertain = True
                            continue
                        if record.get('name') == 'ui.input.observed':
                            value = record.get('epochMS')
                            if type(value) in (int, float) and math.isfinite(value):
                                last_input = value / 1000
                            else:
                                uncertain = True
                    except (ValueError, TypeError):
                        uncertain = True
        except FileNotFoundError:
            pass
        except OSError:
            uncertain = True
    age = None if last_input is None else now - last_input
    recent = age is not None and age < 60
    unknown = app_running and (not readable or uncertain)
    return dict(admit=not recent and not unknown, input_age_seconds=age,
                app_running=app_running, journal_readable=readable, uncertain=uncertain)


def todo_running():
    result = subprocess.run(['ps', '-axo', 'comm='], capture_output=True, text=True, check=True)
    return any(line.strip().endswith('.app/Contents/MacOS/Todo') for line in result.stdout.splitlines())


def wait_for_owner_idle(receipt):
    directory = Path.home() / 'Library/Application Support/Todo/Diagnostics'
    started = time.monotonic()
    while True:
        status = owner_activity(directory, time.time(), todo_running())
        status.update(waited_seconds=time.monotonic() - started, host_load_1m=os.getloadavg()[0], policy='No artificial CPU workers within60seconds of observed Todo input; unknown active journal waits')
        receipt.write_text(json.dumps(status, indent=2) + '\n')
        if status['admit']:
            return
        time.sleep(2)
