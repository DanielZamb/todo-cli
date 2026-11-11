# Mac credential retirement

Candidate 4 is blocked. Its shared ordinary URLSession can be invalidated while
the pinned adapter is about to create another task. This raises an Objective-C
exception before Swift error handling can run. Both the independent correctness
seat and the worker reproduced signal 6 through the default production model.
Candidate 5 removes ownership and was installed separately.

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
SSE, socket-bound and restart gates on the final committed head are still
required. Independent correctness review remains required before installation.
The inspector and new All-tasks Profile-switch measurements resume afterwards.
