#!/bin/zsh
set -euo pipefail
if [[ ${TODO_VERIFY_NATIVE_UI:-0} != 1 ]]; then
    print -u2 'HOLD: native verification needs current user consent and TODO_VERIFY_NATIVE_UI=1.'
    exit 78
fi
root=${0:A:h:h:h:h:h}
if [[ -e "$root/apps/macos/DerivedData/keychain-failure.json" ]]; then
    print -u2 'HOLD: review the recorded Keychain failure and obtain new user consent before another native attempt.'
    exit 78
fi
evidence=${1:?Supply a new absolute evidence directory}
[[ "$evidence" == /* && ! -e "$evidence" ]]
mkdir -p "$evidence" "$root/apps/macos/DerivedData"
scratch=$(mktemp -d -t todo-s01-verify-XXXXXXXX)
trap 'python3 -c "import shutil,sys; shutil.rmtree(sys.argv[1])" "$scratch"' EXIT
cd "$root"
{
    cd "$scratch"
    "$root/scripts/disk-guard.sh"
    bun build --compile "$root"/apps/server/src/main.ts --outfile "$scratch/server"
    "$root/scripts/disk-guard.sh"
    bun build --compile "$root"/apps/server/scripts/seed-verification.ts --outfile "$scratch/seed"
    "$root/scripts/disk-guard.sh"
    bun build --compile "$root"/apps/cli/src/main.ts --outfile "$scratch/todo"
    "$scratch/seed" "$scratch"
} > "$evidence/build-server.log" 2>&1
python3 "$root/.agents/skills/verify-macos/scripts/drive.py" "$root" "$scratch" "$evidence"
[[ -s "$evidence/result.json" && -s "$evidence/06-live-cli-write.png" ]]
print 'PASS; evidence survived cleanup'
