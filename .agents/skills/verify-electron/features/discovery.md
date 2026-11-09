# Authorized directory and explicit Task id lookup

Run from the checkout root during native HOLD. Use a fresh evidence directory.
The cached binaries come from this worktree's source hash, and every drive
provisions a new scratch database and scratch HOME.

```sh
sh scripts/disk-guard.sh
bun .agents/skills/verify-cli/scripts/cache-binaries.ts
sh scripts/disk-guard.sh
/usr/bin/lockf -k /tmp/todo-search-electron.lock bun apps/electron/scripts/verify-discovery-offscreen.ts "$PWD/docs/evidence/agent-discovery/electron-new"
pnpm --filter @todo/electron test
```

Read the real exit of each command. The offscreen drive builds the complete
production renderer and uses the production taskRequest HttpApi adapter against
a compiled scratch server. It does not launch Electron, import safeStorage,
use Keychain, sign, or touch installed Todo data. The bridge holds its synthetic
Session in memory. Copy uses the existing copyTaskId IPC request with an
in-memory clipboard receipt, so native clipboard integration remains unproven.

Start at Compact 393 by 426. Open Navigate tasks, then Profiles and Projects
or Find Task by id. Full view exposes both in the Profile menu. Preserve
compact-search and the ordinary Cmd+F Task search behavior. Discovery does not
change the selected Profile, filters, toolbar text or editor draft by opening.

Selectors are discovery-directory, discovery-directory-list,
discovery-directory-retry, discovery-lookup, discovery-prefix, discovery-find,
discovery-results, discovery-copy-<task-id>, discovery-show-<task-id>,
discovery-lookup-retry, discovery-error and discovery-close. They are data-testid
values. Fields and buttons also have accessible labels. Return submits the
prefix. Close and Escape dismiss, clear rows and invalidate publication.

The directory groups full Profile ids with Project names and full ids. A Profile
without Projects shows No Projects. Lookup validates with the shared LookupQuery
schema, sends nothing while typing or for Invalid input, and submits explicitly.
Rows show the title, Profile name/id, Project or No Project, full Task id, Copy
feedback and Show in the Profile. Neither reading results nor Copy navigates.
Retry repeats only the failed submitted prefix. Editing clears applied rows,
including prefix ABA. Offline clears actionable rows and disables Retry until
connected. Loading maps to Requesting and Offline to ResponseError.

The drive captures directory loading/showing/empty/error/offline and lookup
editing/invalid/requesting/showing/empty/error/offline/Copy feedback in light
and dark at both sizes. Network delay/failure and the empty directory are
controlled bridge states and labeled in result.json. Successful metadata,
lookup, exact-id reads and list refreshes use real HTTP. Every capture checks
dialog bounds and horizontal overflow. The coordinator alone reviews appearance.

Show reuses the renderer's draftForTask/activateEditor path, which preserves
unsaved drafts in localStorage. It captures the authorized source before Close,
reads the exact Task, switches to All tasks with a full-id prefix, and opens it.
The drive starts in Inbox, edits a draft, finds a done Task in another Profile,
uses Show, checks Profile selection, the applied full-id filter, the done Task
and preserved draft, and reloads. It never changes Profiles automatically from
a discovery response.

The focused production-controller tests cover invalid/no-request, duplicate
pending submit, late success and late failure after prefix ABA, Close/reopen,
same-scope credential replacement, sign-out and Offline. They retain a real
applied Show callback, await a draft decision, and delay the exact-id reply.
Both success and error must be discarded after credential replacement. Cancel
preserves the snapshot. Show checks source membership and captures Profile/id
before Close clears the state. See apps/electron/test/discovery.test.ts.

The bounded discovery model is model-ready only. E owns the final immutable
source mapping, production sensitivity and Task search covered-hash renewal.
Passing this drive alone does not establish formal conformance or native IPC,
authentication persistence, Keychain or clipboard proof.

Profile headers use semibold names and distinct muted ids. An id equal to its
name is omitted. Projects are labeled and indented; full ids use type-code and
the shared app mono token. Task ids reuse TaskIdCopy with its square Copy/check
button. Prefix validation uses FieldError immediately beneath Input, with
aria-invalid and aria-describedby. Request failures keep the neutral Alert.
The drive checks Close returns focus to Navigate tasks after layout changes.
It also exercises prefix ABA and signedIn credential replacement through the
production renderer notice boundary, and a real missing exact-id read after a
Task is deleted between Find and Show. The task-lookup-status uses the structured
TaskLookupDetails Profile name, the exact error 3 line, and one Find Task by id
action. The action prefills the full validated id prefix without submitting.
No server message, recovery, CLI command or HTTP route is rendered for this
contextual error. The same neutral status appears inside the editor after a
missing-Task response, with the unsaved draft retained.

U1 retains u1-lookup-id-copy-crop.png, u1-detail-id-copy-crop.png and
u1-id-style-parity.json. The proof compares the shared type-code class, computed
mono font family, size, color and square Copy button dimensions. U5 captures
Show-gone, prefilled lookup and editor-gone states in both appearances/layouts.
Invalid input has no divider beneath its FieldError.

## Stale Unauthorized replies at the host boundary

The standalone production write-host regression uses a delayed-response proxy
and real revoked scratch Sessions. Build unsigned host mode first:

```sh
sh scripts/disk-guard.sh
TODO_ELECTRON_VERIFY_HOST=1 /usr/bin/lockf -k /tmp/todo-search-electron.lock pnpm --filter @todo/electron build
bun apps/electron/scripts/verify-host-unauthorized.ts "$PWD/docs/evidence/agent-discovery/host-unauthorized-new"
```

The host stays hidden and holds its Session in memory. It never imports
safeStorage or launches the installed Todo app. The drive records only
credential labels A, B and C, not bearer values. It sends lookup with A, holds
that request, signs out A, forwards the held request to receive its real 401,
signs in B, then releases A's 401. B must still restore as signedIn, the old
request must return error, and no signedOut notice may follow B's signedIn.
The independent current-credential control signs in C, revokes C directly
through scratch HTTP and sends another lookup. It must return signedOut, emit
signedOut and restore as signedOut. result.json records literal expected and
observed replies/notices; receipts.json records upstream 401 and credential
labels. Both main.ts and write-host.ts compare the captured credential value
and credential generation before clearing authentication on Unauthorized.

## Same-Profile Show and report-row recovery

The full offscreen drive also shows a Task in the current Profile while already
in All tasks with no Project or Tag selection. It asserts one new list request,
the full-id applied identity, a visible Task row, and cleared Applying filters.
Show explicitly calls the existing guarded refresh when navigation keys do not
change. Changed navigation keys retain the ordinary view refresh effect.

Run `TODO_VERIFY_REPORT_ERRORS=1` with the offscreen command for the separate
report-row matrix. It uses the complete production renderer, creates Tasks via
the compiled CLI, selects them, deletes each through CLI before Preview, and
checks the real batch-edit and Attachment batch not_found rows with exit 3.
It also calls the production single-item attachMany adapter against a deleted
Task and checks its retained structured details. Each status has one Find
button, which closes its parent dialog and prefills lookup without a request
until explicit Find. The shared status is `task-lookup-status`.

Import's real stale Task is task_deleted with exit 2 in this fixture. Record its
actual response and capture it as import-real-rejection. The not-found import
presentation is an explicit ImportReport schema-decoded UI fixture, captured
as import-not-found-TYPED-FIXTURE. It is not real backend not-found evidence.
report-errors.json labels every source. Compact light/dark screenshots cover
all report errors, and requests are counted at dispatch to prove prefill does
not submit. An optional TODO_DISCOVERY_RENDERER_ROOT selects an immutable
source-only renderer extraction for a before proof. It does not change the
server or the current checkout.

Report screenshots await the production renderer's finite animations and theme
transitions with settleRenderer. Infinite progress indicators are excluded.
Each capture asserts literal settled popup/card background and foreground
colors, opacity 1 and a hit-test point inside the popup. The scrim must not
cover the dialog. report-appearance.json retains these observations.

I1/I2 were capture timing defects in this report drive. The shared Dialog and
import styles also transition on main; an isolated source archive reproduced
the old-theme computed popup color immediately after a root theme change and
correct settled light/dark colors afterward. No production theme or stacking
change was needed. Do not infer a stacking bug from a mid-transition PNG.

The typed import matrix is normal/recovery/recovery/normal. Compact and full,
light and dark captures assert every row ends before the next begins, each
recovery card stays inside its row, and scrolling reaches the final normal row.
Recovery rows grow in ordinary document flow; normal Compact rows keep 56 px.
Import uses rows.map into a ul or table, with no virtualizer or index-based top.
Batch-edit and Attachment batch also map every row into ordinary flow and use
min-height rather than a fixed height. Their report captures assert containment
and row ordering too. report-appearance.json and report-row-layout.json retain
the measured geometry. Final-row captures are named with last-row.
