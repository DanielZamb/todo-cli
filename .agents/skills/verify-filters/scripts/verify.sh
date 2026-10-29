#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
cd "$root"
pnpm --filter @todo/cli exec bun scripts/verify-filters.ts "${1:?Pass a fresh absolute evidence directory}"
