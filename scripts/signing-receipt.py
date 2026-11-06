#!/usr/bin/env python3
import json
import hashlib
import os
from pathlib import Path
import subprocess
import sys

def check_commands():
    root = Path(__file__).resolve().parents[1]
    for team, identity in [
        ("ALPHATEAM1", "Apple Development: Alpha Example (ALPHA12345)"),
        ("BETATEAM02", "Apple Development: Beta Example (BETA678901)"),
    ]:
        result = subprocess.run(
            ["make", "--no-print-directory", "-n", "sign-desktop",
             f"TODO_SIGNING_TEAM={team}", f"TODO_SIGNING_IDENTITY={identity}"],
            cwd=root, capture_output=True, text=True, check=True,
        )
        commands = result.stdout.splitlines()
        assert (
            f'xcodebuild -project apps/macos/Todo.xcodeproj -scheme Todo -configuration Release '
            f'-destination platform=macOS -derivedDataPath "{root}/dist/signed.noindex/DerivedData" '
            f'CONFIGURATION_BUILD_DIR="{root}/dist/signed.noindex/macos" DEVELOPMENT_TEAM="{team}" '
            'CODE_SIGN_STYLE=Automatic CODE_SIGN_IDENTITY="Apple Development" CODE_SIGNING_ALLOWED=YES '
            'CODE_SIGN_INJECT_BASE_ENTITLEMENTS=NO OTHER_CODE_SIGN_FLAGS="--timestamp=none" build'
        ) in commands, result.stdout
        assert (
            f'TODO_SIGNING_TEAM="{team}" TODO_SIGNING_IDENTITY="{identity}" '
            f'pnpm --filter @todo/electron build --sign --output "{root}/dist/signed.noindex/electron/Todo.app"'
        ) in commands, result.stdout
    print("PASS: literal signing commands match both override sets; no signing executed")


if sys.argv[1:] == ["--check-commands"]:
    check_commands()
    raise SystemExit(0)

output = Path(sys.argv[1]).resolve()
root = Path(__file__).resolve().parents[1]
expected_team = os.environ.get("TODO_SIGNING_TEAM", "").strip()
if not expected_team:
    raise SystemExit("Set TODO_SIGNING_TEAM before verifying signed apps")
receipts = []
apps = [("macos/Todo.app", "local.todo.Todo"), ("electron/Todo.app", "dev.todo.electron")]
for relative, expected_identifier in apps:
    app = output / relative
    checks = []
    commands = [
        ["--verify", "--deep", "--strict", "--verbose=2"],
        ["--display", "--verbose=4"],
        ["--display", "--requirements", "-"],
    ]
    for args in commands:
        command = ["codesign", *args, str(app)]
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        print("$ " + " ".join(command), flush=True)
        print(result.stdout + result.stderr, end="", flush=True)
        checks.append({
            "command": command, "exit": result.returncode,
            "stdout": result.stdout, "stderr": result.stderr,
        })
    metadata = checks[1]["stdout"] + checks[1]["stderr"]
    requirement = checks[2]["stdout"] + checks[2]["stderr"]
    fields = dict(line.split("=", 1) for line in metadata.splitlines() if "=" in line)
    team = fields.get("TeamIdentifier")
    identifier = fields.get("Identifier")
    passed = (
        all(check["exit"] == 0 for check in checks)
        and team == expected_team
        and identifier == expected_identifier
        and "designated =>" in requirement
    )
    notices_path = app / ('Contents/Resources/app/THIRD_PARTY_NOTICES.txt' if relative.startswith('electron/') else 'Contents/Resources/Server/THIRD_PARTY_NOTICES.txt')
    notices = notices_path.read_text() if notices_path.is_file() else ''
    notices_present = (root / 'LICENSE').read_text().strip() in notices and all(value in notices for value in ['Todo and third-party license notices', 'effect ', 'Copyright (c) 2023 shadcn', 'swift-openapi-runtime', 'JavaScriptCore'])
    notice_checks = [{'path': str(notices_path.relative_to(app)), 'present': notices_present}]
    if relative.startswith('electron/'):
        for source, destination in [('LICENSE', 'LICENSE.electron'), ('LICENSES.chromium.html', 'LICENSES.chromium.html')]:
            original = root / 'apps/electron/node_modules/electron/dist' / source
            bundled = app / 'Contents/Resources' / destination
            matches = bundled.is_file() and bundled.read_bytes() == original.read_bytes()
            notice_checks.append({'path': str(bundled.relative_to(app)), 'matchesUpstream': matches, 'sha256': hashlib.sha256(bundled.read_bytes()).hexdigest() if bundled.is_file() else None})
            notices_present = notices_present and matches
    passed = passed and notices_present
    receipts.append({
        "app": str(app), "passed": passed, "teamIdentifier": team,
        "identifier": identifier, "designatedRequirement": requirement, "checks": checks,
        "notices": notice_checks,
    })
passed = all(receipt["passed"] for receipt in receipts)
(output / "signing-receipt.json").write_text(
    json.dumps({"passed": passed, "expectedTeamIdentifier": expected_team, "apps": receipts}, indent=2) + "\n"
)
if not passed:
    raise SystemExit(f"Signing verification failed; inspect {output / 'signing-receipt.json'}")
