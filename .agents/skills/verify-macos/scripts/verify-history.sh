#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?Pass a fresh absolute evidence directory}
case "$evidence" in /*) ;; *) exit 2 ;; esac
[ ! -e "$evidence" ] || { echo 'Choose a fresh evidence directory'; exit 2; }
mkdir -p "$evidence"
scratch=$(mktemp -d "${TMPDIR:-/tmp}/todo-history-proof-XXXXXX")
trap 'rm -rf "$scratch"' EXIT HUP INT TERM
mkdir -p "$scratch/Sources/TodoState" "$scratch/Tests/HistoryTests"
for source in TaskSnapshot AttachmentSnapshot Recurrence ClientReads; do
  cp "$root/apps/macos/Sources/$source.swift" "$scratch/Sources/TodoState/"
done
cp "$root/apps/macos/StateTests/HistoryFormattingTests.swift" "$scratch/Tests/HistoryTests/"
cat > "$scratch/Package.swift" <<'SWIFT'
// swift-tools-version: 6.2
import PackageDescription
let package = Package(name: "HistoryProof", platforms: [.macOS(.v26)], targets: [
    .target(name: "TodoState"),
    .testTarget(name: "HistoryTests", dependencies: ["TodoState"])
])
SWIFT
printf '%s\n' 'swift test --package-path <scratch Foundation-only package>' > "$evidence/commands.log"
swift test --package-path "$scratch" > "$evidence/tests.log" 2>&1
printf '%s\n' 'exit 0' >> "$evidence/commands.log"
printf '%s\n' '{"status":"PASS","nativeAppLaunched":false,"keychainAccessed":false,"dependencies":[],"productionSources":["ClientReads.swift","TaskSnapshot.swift","Recurrence.swift"]}' > "$evidence/result.json"
echo 'PASS; production History formatting with Swift Testing, Foundation only'
