#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
exec bun "$root/packages/domain/scripts/import-scratch.ts" "${1:-build}"
