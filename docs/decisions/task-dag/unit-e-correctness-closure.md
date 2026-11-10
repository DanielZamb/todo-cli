# Electron E-C1 and E-C2 closure

The whole-delta correctness review at delivery ffe683ea, product 94dcbdc8,
requires two P2 fixes. The coordinator authorized only E-C1/E-C2. Prior UI and end
receipts remain historical. Fresh UI delta passes at c0ea5e36; L1's short
correctness closure is still required. No domain/API/canonical/Swift/N1 changes
or children.

The immutable reviewer report and results hashes are
`e8e4e227aba791c646dc9051507fee50656369787a572a3c8bc1580f74245bf9` and
`446e03fa6b5b28c5a472598e85333f98a43091e02a7a2b77c690e7c68e9e252c`.
Both reproducers were copied byte-for-byte into owned scratch. Under the
coordinator's explicit setup alternative, executable copies change only 24 absolute
import specifiers apiece to hash-identical owned modules. Assertions and bodies
are unchanged. Import diffs, effective realpaths, module hashes and owned output
roots are recorded in `docs/evidence/task-dag/unit-e/c1c2-setup/`. Nothing is built
or written under the reviewer checkout. All seven recorded probe PIDs are absent
and their scratch directories removed; no manual signals in the cleanup check.

Unchanged-assertion red proof: E-C1 exits 1 with zero Reload/notice and a disabled
choice after the direction round trip. E-C2 exits 1 with saved draft null and
reopened server title instead of `Unsaved review draft`. Both isolated executable
copies then exit 0 on the fixes. The actual-server preview response substitution
does not allege that the current server emits an incompatible confirmation.

E-C1 stores each Conflict and attempted candidate under the dependent Task id.
Visible recovery is derived from the current direction's dependent scope.
Direction changes retain the applicable notice/lock together; another dependent's
successful operation cannot erase it. Live Conflict cannot be dismissed while
its lock exists. Explicit Reload refreshes candidates as well as the root graph
before releasing locks, including a Blocks candidate outside the root's connected
graph. Failed refresh retains the lock and usable recovery. There is no automatic
resend or client graph validation.

E-C2 excludes every Delete reply from generic renderer draft cleanup. Confirm
returns a Task only after current epoch, matching Profile/id and dry_run=false
are accepted; rejected/preview/foreign/stale results return null. The existing
dialog passes that accepted identity to the renderer, which clears only that
Task's saved draft and matching editor. Unrelated saved drafts survive.

The reusable production-renderer helper is
`apps/electron/scripts/verify-dependency-review-recovery.ts`. It drives real
Conflicts in both directions and direction round trips. After explicit Reload,
the write uses the candidate's Version 3; the durable Versions are root 2 and
candidate 4. It reopens the unsaved title after preview,
foreign and rejected confirmation controls, awaits an obsolete matching reply,
and proves only a real accepted Delete clears its draft. Controlled replies are
explicit fixtures. Twenty-five focused state tests pass, including failed Reload,
another dependent's success, foreign Profile/id and stale close/reopen.

The focused working drive exits 0 with two images. Its first expanded fixture
run fails because it compares saved bytes across a reopen that already normalizes
TaskRead/search-only fields; the corrected fixture captures bytes per operation.
It does not weaken the original reviewer assertion, which remains unchanged.
Working proof reuses the named 94dc backend and does not establish final-source
proof. Two new Compact/light states are registered in the aggregate's 638-capture
inventory. The final delivery sends only those two requested images.

Product/proof source is `c0ea5e36b3c1ef8b2e58e59d60e13fc490f73de7`.
Final unchanged-assertion reproducers exit 0/0 against its identified compiled
cache. The complete DAG matrix passes 638 captures across 180 families, including
the two new Compact/light states. Root check exits 0 with 167 Electron tests and
one existing skip; unsigned Electron package and Xcode each exit 0. Pins remain
byte-identical. Complete Electron exits 1 with 13 PASS and one known main Import
FAIL; complete retained Mac exits 1 with 346 captures and exactly main's 12 Import
failure lines/fixture values. Neither whole suite is called green.

The coordinator read only the requested two new images and passed the UI delta,
extending whole-unit UI seat 2 PASS to c0ea5e36 with the same limits. The 638-image
audit has 389 directly read originals and 249 exact same-fixture hash reuses.
Nine recorded final-suite PIDs are absent; all eight recorded scratch directories
are absent. No manual signals in that cleanup. Current cache/package remain for
review. Final evidence and exact commands/exits are in
`docs/evidence/task-dag/unit-e/final-c0ea5e36-c1c2/`; the source-isolation before/
after identities and unchanged reproducer bodies remain in `c1c2-setup/`.

The report delivery changes only Markdown and records its SHA after commit.
L1 arranges the fresh short E-C1/E-C2-only correctness closure; E has launched no
reviewer and does not self-approve. Native Session/storage/clipboard/VoiceOver,
the retained qualified 2c78 Mac counterpart and all earlier evidence limits remain.
