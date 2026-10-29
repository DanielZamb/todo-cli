# Shared domain schemas

`@todo/domain` exports Effect schemas and their inferred TypeScript types through
`src/index.ts`. Clients import the package root. The package exports TypeScript
source for Bun and client bundlers; it has no generated build folder.

## Contracts

- `Profile`, `Project`, `Task`, `Tag`, `Series` and `Occurrence` have distinct ID
  brands. IDs remain opaque nonempty strings so the port can retain legacy IDs.
- `Version` is the task's accepted change number, stored as `row_version`.
  `entity_version: 1` identifies the schema format, including event payloads.
- `TaskStatus` and `TaskPriority` retain the values in the Go migration. Nullable
  metadata uses explicit `null` in serialized records.
- `CalendarDate` is a valid Gregorian `YYYY-MM-DD` date with no time zone.
  `Instant` is an RFC 3339 timestamp in UTC with a `Z` suffix. Scheduling uses
  `TaskTime`, a discriminated union of a date or a UTC instant together with the
  intended IANA `time_zone`. Numeric offsets such as `+05:30` are rejected;
  IANA names such as `Etc/GMT+5` are retained.
- A `Series` holds RFC 5545 `dtstart`, `rrule` and `exdate` data and task details.
  An `Occurrence` is a real `Task` with a required `OccurrenceOrigin` identifying
  its series and rule date. C01 stores the recurrence text; it does not expand or
  validate RRULE syntax.
- `Event` covers add, edit, done, cancel, reopen and forced rm. `TaskDeleted`
  records Delete as a tombstone; `TaskPurged` records Purge. These follow
  ADR-0007 rather than the legacy hard-delete behavior. Creation includes the
  resolved Project and Tag definitions. Edits include before and after Project,
  Tag and Series definitions as well as task snapshots, so log-only rebuilds
  retain names and metadata. Completion and cancellation include the resolved
  next occurrences so replay will not need a clock or recurrence expansion.
- `OpLogEntry` includes the sequence, actor, profile, event, versions and outcome.
  Creation has no prior version; Purge has no resulting task version. Committed
  entries contain an `Event` and a null reason. Rejected entries contain
  `TaskAttemptRejected` facts and a nonempty reason code, with a required null
  `to_version`. These facts identify the attempted mutation and any known task
  ID, plus validation violations with field names, received JSON values and codes.
  They need no valid Task snapshot, so an invalid priority such as `P0` can be
  recorded truthfully. Rejected-attempt facts cannot be a committed entry or be
  replayed as an `Event`. Actor IDs identify the credential or local actor;
  this package contains no credentials.

These are data contracts. OCC, authorization, recurrence expansion, transactions,
replay and semantic consistency between event snapshots belong to later units.
C01 has no runtime subsystem or runtime verification skill.

C02's operation store now implements transactions, version comparison, rejected
attempt recording, migration 0002, replay, snapshots, and Revert. Its API is
documented in [STORE.md](STORE.md). Authorization and recurrence expansion remain
caller responsibilities. Store verification uses the generated
[verify-op-log skill](../../.agents/skills/verify-op-log/SKILL.md).
Browser clients import schemas from `@todo/domain`. Bun storage callers import
`openStore`, `OperationStore`, and `StoreError` from `@todo/domain/store`.

## Checks

Install Bun and pnpm first. From the repository root, run the standing disk guard
before installing dependencies:

```sh
./scripts/disk-guard.sh
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` runs `pnpm typecheck`, `pnpm lint` and `pnpm test`. To run only the
shared domain checks after integration:

```sh
pnpm --filter @todo/domain typecheck
pnpm lint
pnpm --filter @todo/domain test
```

The Go implementation is retired under ADR-0001 and ADR-0007. Its five integration
golden files remain the CLI acceptance spec at
[apps/cli/test/golden](../../apps/cli/test/golden/). The compiled CLI tests compare
all five outputs byte for byte. The root Makefile and `scripts/install.sh` build
the shared-domain CLI and server with pnpm and Bun.
