# Mac credential retirement

Candidate 4 is blocked. Its shared ordinary URLSession can be invalidated while
the pinned adapter is about to create another task. This raises an Objective-C
exception before Swift error handling can run. Both the independent correctness
seat and the worker reproduced signal 6 through the default production model.
Candidate 5 removes ownership and was installed separately.

The later lifetime head `f7cf2a37` is also blocked by MAC-C1-S1-06. A failed
sign-out advances the credential epoch before the credential changes. An older
Diagnostics poll then declines to clear `diagnosticsLoading`, preventing all
future polls. Its earlier green gates did not cover this transition. The seat's
unchanged regression fails locally at its `!after` assertion. The following
correction and its new gates are required before installation.

## Failed transition cleanup audit

A failed transition must retain the current credential epoch. Closing Discovery
has its own generation and dialog invalidation; it does not require retiring
unrelated requests. Only installing a credential or committing signed-out state
ends that ownership. Epochs remain monotonic; a failed attempt never rolls one
back to resurrect a stale request.

| State or Task | Failed sign-out | Failed sign-in or restore | Actual credential replacement |
| --- | --- | --- | --- |
| `busy`, including writes, import, Snapshot actions and Discovery Show | The sign-out cleanup releases its own busy state and reconnects the still-signed-in model, including Task cancellation. A cancelled sign-out whose server revocation already succeeded still completes the local sign-out. A busy write prevents sign-out or sign-in from starting. | The originating defer releases busy. Sign-in and restore update their captured epoch after their own successful credential installation. | `replaceCredential` releases the previous busy owner; old defers cannot release new work. |
| `diagnosticsLoading` | The previous poll retains its epoch and clears the flag even when the disconnected generation rejects its result. | A failure before replacement leaves the poll's epoch unchanged. Restore starts only when signed out. | `replaceCredential` resets the flag. |
| Attachment and batch-edit target loading | The same draft and epoch still own completion. | A failed attempt before replacement retains ownership. | `replaceCredential` clears both loading flags; old publication remains rejected by epoch and draft identity. |
| Dependency graph, picker, batch and Delete preview loading | The same epoch and request identity still own completion. | A failed attempt before replacement retains ownership. | `dependencies.reset()` removes the old graph and dialogs and advances their generations. |
| Dependency toggle pending set and picker pending rows | The same epoch releases the dependent marker; picker id releases the row marker. | A failed attempt before replacement retains ownership. | `dependencies.reset()` empties both sets. Old completion cannot remove a new marker. |
| Dependency batch and Delete confirmation pending | Their existing dialog-id cleanup releases the old marker. | Their existing dialog-id cleanup releases the old marker. | Dependency reset removes the old dialogs. |
| Series loading and traversal | The Series request generation still owns its defer. | A failed attempt before replacement leaves that generation unchanged. | Series generation advances and `replaceCredential` clears `seriesLoading`; old results remain rejected. |
| Catalog loading, search phase, search debounce and environmental refresh Task | Disconnect cancels the stream and debounce and invalidates the search request generation. Failed sign-out starts the normal reconnect, which obtains a current catalog or reports Offline. A superseded query never blocks a later retry. | A failed attempt before replacement does not invalidate the catalog. Restore has no connected foreground catalog. | Disconnect invalidates request generations and cancels the stream, debounce and environmental Task. Later connection establishes the new catalog. |
| Quick-add parse, import preview, History and draft intent markers | Parse/import/History retain their own generation; Discovery closes its dialog and invalidates Show intents separately. | A failure before replacement leaves credential ownership unchanged. | Their existing credential, generation, Profile and editor/draft guards reject old publication. |
| Restore's `restored` and `canRestore` | Not used by sign-out. | A cancelled restore must restore retry eligibility, as a transport failure already does. A superseded restore must not modify the replacement's state. | Cleanup belongs to the epoch adopted after loading the credential. |

There is no separate credential-refresh operation in this client. Profile
switches and failed Profile deletion do not advance the credential epoch.
Snapshot restore also retains the credential; its busy cleanup uses that epoch.
Successful sign-in/restore credential installation followed by a failed Profile
read is an actual replacement, rather than rollback to the old epoch. The busy
defer adopts the installed epoch before that read. Vault failures before
installation retain the original ownership. These boundaries are distinct from
transport cancellation and from retiring a real credential scope.

## Cancellation after an await

MAC-C1-S1-08 is older than this correction. Restore was cancelled after
loading the stored Session, while its Profile read was pending, and that read
then succeeded. `discoverProfiles` returns normally when cancelled, so restore's
next guard returned before its cancellation cleanup. Busy cleared, but
`restored` stayed true and `canRestore` false: the stored Session remained,
Retry Session was hidden and a second restore sent no request.

After every await in restore and sign-in, `stillOwns(epoch)` now decides. When
another credential has taken over it returns false, and the caller returns
without touching state it no longer owns. When the same epoch's task is
cancelled it throws `CancellationError`, so the caller runs the cleanup a
thrown cancellation runs. Restore makes Retry Session available again. Sign-in
returns false without a message and releases busy. Sign-out has one await. Its
early return is the superseded epoch. A cancelled sign-out reaches the catch,
reconnects without a message, and completes locally only after a 204.

The controls cancel at each await before the request, during it with the reply
dropped, after a successful reply and after a failed reply. The awaits are
restore's health and Profile reads; sign-in's health, sign-in and second health
requests and its Profile read; and sign-out's request. Each then requires a
second restore or sign-in to run and succeed, or the still-signed-in model to
reconnect.


Only the documented 204 reply proves revocation. Before this correction the
model discarded the reply, so a 409 or any other status that the bearer
middleware does not raise counted as revocation. The app then deleted the
stored Session and signed out locally while the server kept it. A failed
sign-out's notice also lasted only until its own reconnect cleared every
message, a few milliseconds later. Cancellation shows nothing. The notice's
lifetime is set by message ownership, below.

What the owner sees, measured through the production model and transport on a
compiled scratch server
([verify-sign-out-stream.py](../../.agents/skills/verify-macos/scripts/verify-sign-out-stream.py)):

| Server revoked | Reply seen | Case | Owner sees | Server subscribers before / during / after 3 s |
| --- | --- | --- | --- | --- |
| No | Yes | HTTP 503 | Stays signed in; Reconnecting, then live; "The server rejected this request (HTTP 503)." remains. No Offline state. | 1 / 0 / 1 |
| No | No | Connection dropped before the server | Stays signed in; Reconnecting, then live; "Couldn't reach the server or read its response…" remains. | 1 / 0 / 1 |
| No | No | Task cancelled before the server | Stays signed in; Reconnecting, then live; no message. | 1 / 0 / 1 |
| Yes | No | Reply dropped after the server revoked | Reconnecting, then the sign-in screen with "Your Session ended. Sign in again." One 401, none in the next 5 s. | 1 / 0 / 0 |
| Yes | No | Task cancelled after the server revoked | Same as the dropped reply: one 401, then signed out. | 1 / 0 / 0 |
| Yes | Yes | 204 | Sign-in screen, no message, no 401. | 1 / – / 0 |
| Yes | Yes, after cancellation | Controlled transport | Sign-in screen; stored Session removed; no reconnect. | – |
| No | Yes, 200 or 409 | Controlled transport | Stays signed in, Session kept, message shown. | – |

In every case where the Session survives, five CLI writes committed while
the stream was disconnected arrive exactly once, by operation id, with none
skipped. This also holds for a model with no stored cursor. Busy and Diagnostics
loading are false afterwards. The same harness fails at 2ce2abcf: the failed
sign-out's message is lost, a cancelled sign-out never reconnects, a
revocation reply after cancellation leaves the model signed in, and a 200 or
409 reply signs out locally.

## Message ownership

MAC-C1-S1-07 showed that 475726d3 restored a saved sign-out notice by
lifecycle generation alone, and that every ready event cleared any message.
MAC-C1-S1-09 and MAC-C1-S1-10 then showed that owner categories alone do not
give "newest message wins". An older write's read-back erased a newer
Dependency follow-up error. A failed restore's error survived a successful
Retry Session.

The rule, as ruled on 2026-11-11:

1. Every message carries the kind that produced it and a sequence number that
   only grows (`publishMessage(_:kind:)`, `messageSequence`).
2. An action that can clear messages notes `messageMark` when it starts. When it
   succeeds, `clearMessage(_:since:)` may clear only a message that already
   existed then. A message published after it began always survives.
3. Of those, it clears only the kinds its success makes untrue (table below).
4. A message also ends when a newer message replaces it, or when the credential
   (`replaceCredential` with a different value) or the Profile (any change of
   `profile`) changes, or when the person dismisses it. Dismiss
   (`dismissMessage(_:)`, ruled 2026-11-12) ends the message the banner showed
   at that moment and nothing newer. The banner offers Reconnect for
   connection messages only, because a reconnect clears only those; every
   other kind offers Dismiss.
5. Nothing saves or restores a message. An older message never comes back.
6. Every kind has a success that clears it in ordinary use (table below).
7. A surface is an instance: each opening of a sheet, picker or dialog gets a
   new identity. Work started from an instance may publish a message, close a
   surface or open another one only while that same instance is showing. Once
   it has closed, a committed result still reaches the data and the list (its
   read-back runs), but it raises no message, closes nothing and opens nothing.
   Its own message ends when it closes, unless it hands the message to the
   main window on purpose.

Rule 4 holds on every path that changes scope. Each of these ends any message:
`replaceCredential` with a different credential, which covers sign-in,
sign-in as another Profile, restore, sign-out and Session expiry; any change of
`profile`, which covers a Profile switch, Discovery Show into another Profile,
transfer, and leaving a Profile deleted elsewhere; and a Snapshot reload event,
which ends the message before it resets the scope.

| Surface (instance identity) | Work it starts | Completion after its instance has closed or been replaced |
| --- | --- | --- |
| Dependency picker (`DependencyPicker.id`) | Candidate reads; link or unlink; Create follow-up | Reads publish nothing. A committed link or unlink runs its read-back so the list shows it, with no feedback, warning or reload. A follow-up shows no message, does not close a newer picker and does not open Quick Add. Its result is a read that prepares a Quick Add draft, so nothing remains to commit. |
| Import sheet (`importInstance`, renewed on open) | Preview; apply; Create follow-up | A preview publishes nothing. A committed apply runs its read-back; the reopened sheet's generation rejects its report. A follow-up behaves as in the picker. |
| Delete confirmation (`DependencyDelete.id`) | Preview reload; delete | A conflict shows nothing. A committed delete still closes the editor on that Task and runs its read-back, does not close a newer confirmation, and its message ends. |
| Batch edit (`BatchEditDraft.id`) | Target reload; preview; apply | Reloads and previews publish nothing. A committed apply runs its read-back with no report. A failure shows nothing. |
| Attachment batch (`AttachmentBatchDraft.id`) | Target reload; preview; apply | Same as Batch edit. A committed apply also updates the open editor's Attachments when that Task is open. |
| Dependency batch (`DependencyBatchDraft.id`) | Target reload; preview; apply | Same as Batch edit. |
| Editor Attachment actions (editor draft id) | Attach, detach, label, upload | An accepted change runs its read-back. A conflict or error shows nothing once that editor has closed. |
| Discovery Look up (identity and generation; Show intent) | Lookup; Show | A lookup publishes nothing. Show hands its error to the main window on purpose, because the dialog closes before the request. A late Show for a superseded intent does nothing. |
| Settings: Profile deletion, Snapshots | Delete Profile; Snapshot list, preview and restore | These write their own `profileDeletionError` and `snapshotError`, guarded by Profile, generation and credential. They raise no `message`. A committed restore reaches the list through the reload event. |
| Diagnostics | Snapshot polls | Writes `diagnosticsError` only, guarded by generation. Raises no `message`. |

`createDependencyFollowUp` captures the open instance, the picker before the
Import sheet, and applies nothing unless that instance is still showing.
Closing an instance ends only a message that instance raised.

Every asynchronous completion follows one order (MAC-C1-S1-12 and S1-13):

1. Ownership. If the credential or Profile it began under is no longer current,
   it is dropped: no state, no request, no message.
2. Authorization. A 401 under the current credential is handled
   (`authorize(_:epoch:profile:)`, then `handleAuthorization`), whether or not
   the surface is still showing.
3. Data. A committed result is applied and read back whether or not the
   surface is showing.
4. Presentation. A message, report, feedback, error field, or closing or
   opening of a surface happens only if the same instance is still showing.

A read-back for a closed instance runs `refreshAfterWrite(presenting: false)`.
If it fails, it raises no message of its own. It calls `connect()`, and the
ordinary connection recovery takes over: the list shows "Reconnecting" and
then returns to live, or shows Offline with the connection's own message. It
never shows "Tasks updated. The live view is reconnecting."

Instances added: an editor opening (`TaskDraft.opening`, new on each
`beginEditing` and kept when a save rebuilds the draft), so closing and
reopening the editor on the same Task is a new instance; quick-add
(`quickAddInstance`, renewed on open, which also advances the parse
generation); and the Batch edit, Attachment batch and Dependency batch drafts.
A late quick-add success from a closed instance still creates the Task and
reads it back. It does not clear the newer draft, close it, open the editor or
announce. Its failure fills no error.

Save, Move, Copy, transition, Series save and conflict reloads already handle
authorization once the credential is confirmed current. Their editor cannot
close while they run, because closing the inspector is disabled while `busy`.
Settings and Diagnostics raise no `message`.

Before this change, seven committed writes skipped their read-back once their
surface had closed: Batch edit, Attachment batch, Dependency batch, picker link
or unlink, Delete, Import apply after a reopen, and the editor's Attachment
write after the editor closed. In the installed build, the list was still
repaired one stream event later, so it did not stay stale. Every committed
operation for the current Profile triggers a full catalog refresh when it
arrives on the stream. When the stream is not live, the reconnect's replay
triggers it. One visible defect did persist. After an Attachment batch whose
sheet closed during apply, an editor left open on one of its Tasks kept its old
Attachments until it was reopened, because a refresh never updates the open
editor. The change now updates that editor and runs the read-back directly. It
no longer depends on the stream being live.

| Kind | Published by | Success that clears it | Reachable in ordinary use |
| --- | --- | --- | --- |
| `connection` | Stream failure that goes Offline; write accepted with "… The live view is reconnecting."; stream 404 that cannot leave a deleted Profile; update reconnect check failure | Ready after a later connection attempt; a successful restore, sign-in, or write read-back | Yes: the stream retries automatically, and the banner's Reconnect reconnects |
| `restore` | Restore failure (server or stored-Session error) | Successful restore or sign-in | Yes: Retry Session or Sign in |
| `signIn` | Sign-in failure | Successful sign-in or restore | Yes: Sign in again |
| `sessionEnded` | A 401 that ends the Session | Successful sign-in or restore | Yes: the sign-in screen is shown |
| `signOut` | Failed or rejected sign-out | A later successful sign-out (credential change) | Yes: Sign out again |
| `transition` | Complete, Reopen or Cancel failure or conflict | A later successful transition and its read-back | Yes: the same row action |
| `delete` | Delete conflict on a Task that is not open in the editor | A later successful delete and its read-back | Yes: Delete again after the preview reloads |
| `dependencyFollowUp` | Dependency follow-up Task read failure | A later successful follow-up | Yes: the same picker action |
| `discoveryShow` | Discovery Show failure | A later successful Show | Yes: Show from Look up Task |
| `dependencyLink` | A picker link or unlink that failed after its picker was closed while pending (ruling 2, 2026-11-12) | A later successful link or unlink | Yes: the picker again |
| `quickAdd` | A quick-add create that failed after its quick-add was closed during the create | A later successful create | Yes: quick-add again |
| `general` | Direct assignments only. No production writer remains. | Only rule 4 | Not used by production code |

Every kind except `connection` can also be ended by the person with the
banner's Dismiss button; `connection` keeps Reconnect.

No refresh kind exists. Catalog and search failures publish to `searchError`
and `taskLoadError`, which their own next read replaces, never to `message`.
Every production kind has a natural success that clears it. There is still no
dismiss control. A kind whose action the person never repeats keeps its
message until a newer message, a credential change or a Profile change. That
residual case belongs to the Opus Mac UI seat, which may add a dismiss control
or a time limit.

### Surface-local messages (MAC-C1-S1-15)

MAC-C1-S1-15 showed that the rule stopped at the main window. In one open
Import report, follow-up A's success, finishing after a newer follow-up B had
failed, cleared B's error and opened Quick Add. The ruling of 2026-11-12:
moving a message into a surface does not exempt it from the rule.

Every surface-local message is now kept by one helper,
[SurfaceMessages](../../apps/macos/Sources/SurfaceMessages.swift), the same
type that keeps the main window's `message`. Each surface instance holds its
own value, so a new instance starts a new sequence. Within it:

- An action takes a ticket at its start (`begin`): its kind, a generation of
  that kind, and the sequence mark.
- On success (`succeed`) it clears only a message of its own kind that already
  existed at its mark.
- On failure (`fail`) it publishes only while it is still the newest of its
  kind.
- A newer action of the same kind supersedes an older one still pending. The
  older one's data result still applies if it committed something, but it
  presents nothing: no message, no clearing, no feedback, no opening or
  closing.
- `beginClean` and `restart` start an action on a clean surface by ending what
  is shown now. That is always older than the action.
- Nothing saves or restores a message. The picker's background refresh used to
  save its notice, reload and put the notice back. It now reloads without
  clearing anything.

| Field (surface instance) | Kinds | May set it | May clear it |
| --- | --- | --- | --- |
| `message` (main window; Settings shows it under Sign out while `messageKind == .signOut`) | `MessageKind` | The table above, by `publishMessage` and the newest of a follow-up's kind | Rule 2 and rule 4; Dismiss |
| Dependency picker `failure` (`DependencyPicker.id`) | `reload`, `link`, `followUp` | A reload's failure, a link or unlink failure, or a follow-up failure, each only while newest of its kind. A follow-up failure is shown with the notice that offered it (that notice, its button and the failure, published as one `followUp` message; candidate 8 ruling 1). | A link's start (an earlier `link`, `reload` or `followUp` notice); opening, a direction change or the person's Reload on success (`reload`, `link` and `followUp` from before its mark: the Reload ruling below); a link's success (`link` from before its mark); a follow-up's success (`followUp` from before its mark); closing the picker. A link's read-back and the background refresh clear nothing. |
| Import `importError` and `importFollowUpError` (`importInstance`) | `file`, `run`, `followUp` | Reading the file (`file`); a preview or apply failure (`run`); a follow-up failure (`followUp`), each only while newest of its kind | A preview or apply start (`file` and `run`); a run's success (`run` from before its mark); a follow-up's success (`followUp` from before its mark); closing or resetting Import |
| Quick-add `quickAddError` and `parseError` (`quickAddInstance`) | `create`, `parse` | A create failure or a parse failure, each only while newest of its kind | A create start (`create`) or a parse start (`parse`); a success of the same kind from before its mark; opening quick-add |
| Editor `editorError` (`TaskDraft.opening`) | `general`, `save`, `write`, `conflict`, `series`, `seriesSave`, `attachment` | Synchronous checks (`general`: validation, transition and delete conflict text, Attachment input checks); a Save, Move, Copy or transfer failure; a conflict definitions reload failure; a Series open or save failure; an Attachment write failure. Each asynchronous one only while newest of its kind. | Save, write and Series save start clean; a Series open starts by ending `series`; a success of the same kind from before its mark; a new editor opening; accepting a conflict |
| Editor `historyError` (the open editor) | `load` | A History load failure while newest | A History load start; its success; opening an editor |
| Batch edit `error`, with `report` (`BatchEditDraft.id`) | `reload`, `apply` | A target reload, preview or apply failure while newest | A reload, preview or apply start (clean); its success. The report appears only when the run succeeds as newest. |
| Attachment batch `error`, with `report` (`AttachmentBatchDraft.id`) | `reload`, `apply` | As Batch edit | As Batch edit |
| Dependency batch `failure`, with `report` (`DependencyBatchDraft.id`) | `reload`, `run` | A target reload failure, or a preview or apply failure, each only while newest of its kind | A reload's success (`reload` and `run` from before its mark); a run's success (`run` from before its mark); closing the dialog |
| Delete confirmation `failure` (`DependencyDelete.id`) | `reload`, `delete` | A preview reload failure, or a delete refusal, conflict or unreadable reply, each only while newest of its kind | A reload's success (`reload` and `delete` from before its mark: an earlier refusal becomes the review text); closing the confirmation |
| Dependency graph `failure` (`DependencyGraphState`, with `request`) | `read` | A graph read failure while newest | Its success (`read` from before its mark); closing the graph |
| Settings `profileDeletionError` (the Delete Profile prompt) | `delete` | A Profile deletion refusal or failure while newest | A new prompt; "Delete Tasks too…"; a Profile activation |
| Settings `snapshotError` | `list`, `write` | A Snapshot list failure, or a create, preview or restore failure, each only while newest of its kind | A list start (clean), including the list a create or restore runs after it succeeds; a preview's success (`write` from before its mark) |

**What a Reload clears** (ruled 2026-11-12). A Reload the person asks for clears the
notices its success makes untrue, not only its own kind, and only those that
existed before the Reload began (its mark):

- **Picker.** Opening, a direction change and the Reload button clear earlier
  `reload`, `link` and `followUp` notices. A link notice that asked for a
  reload, and a follow-up offered by it, are no longer true once the
  Dependencies are fresh.
- **Delete confirmation.** Its Reload clears earlier `reload` and `delete`
  notices. An earlier refusal becomes the review text (`reviewFailure`).
- **Dependency batch.** Its reload clears earlier `reload` and `run` notices.

A refresh the person did not ask for clears nothing: the picker's background
refresh and a link's read-back.

**Supersession is final** (MAC-C1-S1-16, ruled 2026-11-12). A hand-off to the
main window is a presentation like any other. Every completion checks, in
order:

1. ownership;
2. authorization;
3. data;
4. whether it is still the newest of its kind in its instance;
5. only then, where to present: in the surface if it is still showing; as a
   named main-window message if the surface closed and a hand-off is ruled for
   it; otherwise nowhere.

An action superseded while its surface was open presents nothing anywhere,
whether its surface is still open or has closed, and whether it succeeded or
failed. A ticket carries its instance's generation table (`Ticket.isNewest`), so
the check still works after the surface closed. The hand-off goes only through
`handOff(_:kind:from:)`, which refuses a ticket that is not the newest. The
ruled hand-offs are:

- a picker link that fails after its picker closed;
- a quick-add create that fails after its quick-add closed.

A superseded action also clears no earlier hand-off and raises no "Task added"
capsule. Its read-back runs but raises no "… The live view is reconnecting."
message (`refreshAfterWrite(presents:)`).

**No presentation permission crosses an await** (MAC-C1-S1-17, ruled
2026-11-12). A decision to present is never taken before an await and used after
it. Every function that may present after awaiting asks the helper at the moment
of publishing.

- **Read-backs** take a `ReadBackOwner`, asked when the read-back publishes:
  - `.mainWindow(ticket)`: a row action, or a surface action that closed its own
    surface on success (quick-add create, Save, Move, Delete).
  - `.surface(instance, ticket)`: only while that instance is showing.
- **`PresentationTicket`** can only be made from a real ticket.
- **Removed from the Mac target:**
  - `refreshAfterWrite(presents:)` and `refreshAfterWrite(presenting:)`;
  - the pre-await `showing ? nil : surface` choice in quick-add create, Save
    and Delete;
  - `showing` read after the read-back in quick-add create (announce, return
    value) and Save (announce);
  - `openSeries(presenting:)`, now `openSeries()` and `loadSeries()`;
  - `reloadDependencyPicker(clearing:)`, now `reloadDependencyPicker()` and
    `refreshDependencyPicker()`.
- **Now checked live after the await:**
  - The editor write's transfer report and "Task updated" check the write ticket
    and the opening. A Copy closed during its read-back reports nothing.
  - A transition's editor text reaches only an editor showing that Task.
- **Kept, because they are data or the person's request, not permission:**
  `dryRun`, `erased`, `retry`, `changed`, `firstOccurrence` and `openEditor`.
  `openEditor` is applied only after the live newest check.
- **Control.** `SourcePresentationRuleTests` fails if a removed parameter or
  pattern returns.

**Known limit: one banner slot** (MAC-C1-S1-18, ruled 2026-11-12). The main
window shows one message. A failure that arrives later is a newer message and
replaces an earlier unread one, for example an old picker instance's link
failure after a newer instance's hand-off. That is as two failed Completes in a
row would be, and suppressing it would hide a failure. It replaces only by
publishing its own message, never by clearing. An older action's success never
clears or replaces a newer hand-off. How to keep an earlier unread failure
reachable (a count, a short stack, or a combined message) is for the Opus Mac
UI seat in candidate 8.

Same-kind actions that are gated cannot interleave: Import apply (`busy`),
Batch edit and Attachment batch apply (`busy`), Dependency batch run
(`pending`), delete (`busy` and `pending`), editor Save (`busy`), quick-add
create (`busy`), Profile deletion and Snapshot writes (`busy`). The control
for those is that a second start while the first is held sends no second
request.

These stay outside the helper:

- **Search notices.** `searchFailure` in the picker and the graph, and the
  main list's `searchError` and `taskLoadError`, are governed by the Task
  search generation that the formal search model checks.
- **Discovery.** `discovery.error` is governed by the discovery model's
  identity and generation, which the discovery formal check pins.
- **Statuses and confirmations, not action messages:**
  - `diagnosticsError` is a poll status, guarded by its generation.
  - `renderError` is the graph web view's render status.
  - `exportError` is the result of the Diagnostics export panel, kept in view
    state.
  - `deletionNotice` is the main window's quiet confirmation, read once by the
    list.

The controls run against the compiled scratch server. In each control below,
the first action is held and the newer one runs before it is released.

- **Three orders.** Older success after newer failure; older failure after
  newer success; older success after newer success. These run for:
  - Import report and picker follow-ups;
  - picker link;
  - Snapshot list;
  - History;
  - the editor's conflict definitions reload.
- **Across kinds.** A run failure published while the Dependency batch was
  reloading survives that reload's success. A delete refusal published while
  the confirmation was reloading survives that reload's success.
- **Gated surfaces.** For each one listed above, a second start while the first
  is held sends no second request.
- **The helper itself.** `SurfaceMessagesTests` checks the three orders,
  own-kind clearing, and instance isolation.

The controls run against the compiled scratch server with the in-memory
SessionVault. They are the seat's three probes unchanged; the eleven
S1-07 mirror cases; and, for each kind, one interleaving and one recovery. In
the interleaving, an action that clears that kind is held at its last await
while a newer message of another kind is published, and the newer message must
survive. In the recovery, the same kind's success clears its earlier message.

## Close admission before invalidation

[ScopedTransport](../../apps/macos/API/Sources/TodoAPI/ScopedTransport.swift)
holds an active, retiring or invalidated state and its admitted send Tasks under
one lock. A request checks admission and registers its child Task before leaving
that lock. The child inherits the existing correlation and interaction context.
It invokes the pinned transport, including Diagnostics, without replacing the
HTTP implementation.

Retirement closes admission first, cancels registered sends, and waits for their
transport calls to exit before invalidating the ordinary URLSession. A retained
Client then returns Swift cancellation before starting Diagnostics or creating
a URLSession task. Parent cancellation before or after registration follows the
same path. Session invalidation runs once after the creators have drained.
The existing event-stream body retains its separate cancellation owner.

No write retry is added. A write admitted before retirement can already have
committed on the server. Cancellation cannot undo that commit. Callers still
check their captured credential epoch, Profile and request identity before
publishing a response that was buffered before retirement.

## Audit of callers that cross an await

| Production path | Retirement behavior |
| --- | --- |
| Catalog refresh, matching rows and four planning views | One captured Client supplies all parallel reads. Search generation, request number and full filter identity reject superseded results. Decode records retain their recording scope. |
| Save, Complete, Cancel, Snooze and generic writes | Post-request and post-refresh guards reject old success and Conflict replies. Transfers, Revert, skip and Series edits cannot change the new editor, result or message. Busy cleanup belongs to the originating credential epoch. |
| Quick add and create | The debounce checks epoch, Profile and parse generation before sending. Parse and create use the captured Client. Create checks scope before its write, publication and follow-up announcement. |
| Stream contract check and reconnect | An old healthy or incompatible health reply throws cancellation without changing the current build or availability. The stream loop checks generation between contract, refresh and Dependency awaits. Profile switches and sign-out still cancel the body owner. |
| Discovery directory, lookup and Show | Existing epoch, request, dialog and prefix identities reject old publication. The Show busy defer cannot clear a new scope's busy state. |
| Dependency picker and Delete preview | Sequential endpoint reads use one captured Client. Epoch, Profile, dialog id and request number guard publication. Retirement stops follow-up graph reads. |
| Dependency graph, search and batch | Existing graph/batch identities and credential checks remain. Retired pending work cannot remove a new scope's pending state. |
| Single-Task Attachments and uploads | One Client spans the write and any read-back. Epoch, Profile and editor checks guard acceptance and the post-refresh Conflict notice. |
| Attachment batch | The report is guarded, and Task show has a second scope/draft/editor guard before replacing the editor. Busy and loading cleanup cannot change a new scope. |
| Batch edit and import preview/apply | Existing Profile and draft/import generation checks remain. Busy cleanup is scoped. |
| History and Series traversal | Existing History/Series generations, Profile and editor id guard the result. Series traversal keeps one Client and checks scope before its next History read. |
| Diagnostics polling | Generation and signed-in state guard replies. An old poll cannot clear a new scope's loading flag. |
| Owner Snapshot list, create, preview and restore | Captured credential checks guard replies and scoped busy cleanup preserves new work. |
| Profile deletion, restore, sign-in, sign-out and expiry | Existing epoch/generation checks remain. Profile deletion retains its Client through refusal recovery. Sign-in and restore keep busy while discovering Profiles after their own intended replacement. A late old 401 cannot sign out the new Session. |

## Qualification before the final gates

The exact default-model crash control starts refreshAfterWrite, yields three
times, replaces the credential with another valid scratch Session and awaits
the refresh. It fails with signal 6 before the correction. Its first corrected
Release run passes 200 iterations, ends with 178 model and applied rows, and
remains writable. This small control checks counts, not independent row content.

Four held-response tests then reproduce old success/Conflict, contract and
Attachment read-back publication, old busy cleanup and a retired quick-add
debounce. They pass after the caller correction. These publication controls
use generated clients with a controlled transport. The crash and stress
controls use the default production transport without overrides.

The qualified stress run starts a refresh, a write and a periodic Diagnostics
poll before each of 3,000 credential replacements. Every iteration has
unfinished recorded requests, with 29,993 unfinished requests across the run.
All 3,000 later calls through retained Clients cancel. No retired work starts
a request, refresh or decode in the new scope. An additional 20-call control
makes no server or journal request; a current-Client positive control increments
both counts by exactly one. The final 178 TaskSnapshots equal an independent
server read, and writes remain enabled. Five transitions committed before
cancellation, distinct from the 3,000 write starts. No latency improvement is
claimed by this correctness test.

The first stress attempt is retained as a failure. Ten groups had not started
all operations at the three-yield cutoff. The corrected workload waits for the
actual starts. Its original server counter also used a rolling Latency table;
the corrected counter reads the owned server's cumulative route-only log.
The product code is identical between those two stress attempts.

Complete state, contract, Diagnostics, design, unsigned-build, idle, subscriber,
SSE, socket-bound and restart gates pass on
`f7cf2a370afe57348fc1fde53d8eec4b68f8dd99`. State/contract passes 214 tests in
32 suites and Release Diagnostics passes 37 in three suites. Design verifies
872 captures. The real 300.061-second idle makes zero requests, refreshes and
reconnects while remaining writable. Subscriber counts are
`[0, 1, 1, 1, 1, 1, 1, 0]`; 300 refreshes make 2,400 requests and retain seven
sockets. Three restarted-server GET/Complete/Create boundaries pass with one
History entry per write. Root and document links pass. These are functional
and resource results, not a UI latency improvement. Independent correctness
review remains required before installation.
The inspector and new All-tasks Profile-switch measurements resume afterwards.
