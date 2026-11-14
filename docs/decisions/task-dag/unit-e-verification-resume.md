# Electron verifier resume and completion maintenance

The complete end run at `b748e391acca1d1b4ab6b8eaf987f002afc4ba10` is retained
under `docs/evidence/task-dag/unit-e/final-b748e391/`. It is nonfinal. Root check
exits 0. The Electron aggregate exits 1 with twelve PASS, two FAIL, zero MISSING
and named native HOLD. Retained qualified2c78 Mac exits 1 with 346 registered
captures and the exact twelve main Import failures. Raw failure lines and all
Import layout dictionaries match the supplied reference. No assertion is changed
or excluded. The new verification checkpoint still requires both complete suites.

The two Electron failures are verification defects with retained evidence.
The DAG drive stops after 560 captures at the unchanged picker row assertion.
Its thin transport starts SSE without production cursors, replaying 246 old
operations after sign-in and issuing 495 full list requests. The transport now
uses `streamHeaders`, `restoreStreamState`, Profile cursors and the production
duplicate boundary. It records requested cursors and raw operation sequences.
`transport-resumption-02` exits 0 with 44 captures. Seven streams request Work
cursors 0/15/15/22/22 and Other cursors 0/17. Resumed streams do not receive any
operation at or before their requested cursor; one receives only new 21/22.
Picker visibility keeps its original 5,000 ms deadline. The import-only setup
failure is preserved separately and launched no app or server.

The host-write failure is the second Series Skip Retry race occurrence. Its
failure-only diagnostic records an authoritative GET at 11:14:54.772, Retry POST
at .773 with from_version 4, and HTTP 200 at .777 with cancelled, Version 5. All
100 subsequent samples are cancelled. The coordinator accepted outcome (i):
the recipe read before the mutation request. The driver now awaits the actual
completed response for the same Occurrence and Version before its original
authoritative assertion. It never sleeps or resends. The failure-only sampler
remains. `series-retry-completion-02` exits 0 for ten corrected scenarios and
ten exact response matches before their GETs; 1,000 samples are cancelled.
The quiet-window source/driver hashes, request/response timestamps and cleanup
are retained. The import-only setup failure started no process. The historical
outcome (iii) receipt remains unchanged; the newer timeline explains the race.

Unsigned Xcode compilation first exits 65 because a custom compiler prefix lacks
Swift capability metadata. The wrapper already forwards every argument unchanged.
The corrected prefix copies installed `usr/share/swift/features.json` byte for
byte, and Xcode emits its own `-package-name swift_collections`. The guarded
unsigned build exits 0, with no Swift source, package, signing or app-launch
change. `xcode-compiler-discovery-02` retains the failed/corrected commands and
metadata identities. The reusable `xcode-compiler-guards.ts` creates the same
layout from SDK discovery. Fake compiler controls prove literal arguments,
stdout/stderr, exit 7 and immediate hard3 with no delegate output. The SDK output
and shims are ignored; no build output is committed.

The coordinator also requested a bounded count through clean main's production
watch and renderer. That investigation is closed without a product fix.
`production-watch-backlog-01` exits 0 on cabf4866. With a stored Profile cursor,
there are zero replayed operations, two initial list requests and four raw Task
list GETs. First connection with 300 historical TaskCreated operations produces
302 list requests and 604 GETs. The 300 additional requests are a pre-existing
main performance finding, handed to the coordinator for the owner's follow-up.
All counted GETs are 200. These are request counts, not a timing benchmark.

That count uses an explicit fresh scratch credential binding, a fail-closed
storage fixture and passive Electron boundary counters. Main's watch,
streamHeaders, restoreStreamState, duplicate handling, IPC handler and renderer
bodies remain traceable to the immutable subject. All 44 product modules consumed
by the bundle match cabf Git blobs. Both PNGs were read. No session.enc exists,
and storage calls remain zero. Native authentication, storage and Session
restoration are unproven. Owned host/server PIDs are absent, scratch directories
are removed and no manual signals were issued. Automatic termination policies
are recorded; exact server exit signals were not separately captured.

This checkpoint changes verification only. Product remains 4cdc5d47, canonical
resources remain e7902582/a5cbe706, and the postmerge API amendment stays L1-owned.
No domain, server, CLI or Swift product file changes. No new review or merge
acceptance is implied. The complete matrix, image audit, packaging and both
complete suites at the next committed source are still required.
