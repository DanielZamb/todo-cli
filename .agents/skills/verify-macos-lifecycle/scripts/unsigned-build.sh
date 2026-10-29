#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?Pass a new absolute evidence directory}
case "$evidence" in /*) ;; *) echo 'Evidence must be absolute' >&2; exit 1 ;; esac
[ ! -e "$evidence" ] || { echo 'Choose fresh evidence' >&2; exit 1; }
"$root/scripts/disk-guard.sh"
mkdir -p "$evidence"
scratch=$(mktemp -d "${TMPDIR:-/tmp}/todo-w03-build-XXXXXX")
trap 'rm -rf "$scratch"' EXIT HUP INT TERM
xcodebuild -project "$root/apps/macos/Todo.xcodeproj" -scheme Todo -configuration Debug -destination platform=macOS -derivedDataPath "$scratch/DerivedData" build CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO EXPANDED_CODE_SIGN_IDENTITY=- > "$evidence/build.log" 2>&1
python3 - "$scratch" "$evidence" <<'PY'
import json
from pathlib import Path
import subprocess
import sys
scratch, evidence = map(Path, sys.argv[1:])
app = scratch / "DerivedData/Build/Products/Debug/Todo.app"
helpers = list(app.rglob("todo-server"))
assert helpers == [app / "Contents/Resources/Server/todo-server"], helpers
log = (evidence / "build.log").read_text()
assert "** BUILD SUCCEEDED **" in log
assert not any(line.startswith("CodeSign ") for line in log.splitlines())
assert "replacing existing signature" not in log
metadata = subprocess.run(["/usr/bin/codesign", "--display", "--verbose=4", str(helpers[0])], capture_output=True, text=True, timeout=10)
assert metadata.returncode == 0
assert "runtime" not in metadata.stderr.lower()
(evidence / "helper-signature.txt").write_text(metadata.stderr)
(evidence / "unsigned-build.json").write_text(json.dumps(dict(
    buildSucceeded=True, codeSigningAllowed=False, explicitIdentity="-", codeSignBuildActions=0,
    helperPath="Contents/Resources/Server/todo-server", helperCount=len(helpers),
    helperBytes=helpers[0].stat().st_size, helperHardened=False, appLaunched=False,
    xctestRan=False, scratchRemovedByShell=True), indent=2))
PY
rm -rf "$scratch"
[ ! -e "$scratch" ]
printf 'PASS; unsigned compile-only app build; scratch removed\n'
