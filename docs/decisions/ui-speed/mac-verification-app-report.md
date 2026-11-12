# Mac verification app V01 safety correction

Status: blocked for qualification by the coordinator's Swift-slot hold; correction
is draft, with all seven findings still awaiting final closure. Visible launches
and V02 remain held. No new frozen-head or end-to-end safety pass is claimed.
Branch: feat/mac-verification-app. Previous reviewed head:
`eceedba4589717ff0615614ce283841bab378638`.

The initial candidate-6 checkout matched
`8b9be429751165d4ecef11f3f23d1844384e54b4`. The prior implementation/readback
receipts belong to `ab989410cef89b5670fc2a6101698441753b5ec5`; the later
review rejected its isolation. Neither those receipts nor dirty development
runs qualify the correction. The final corrected runtime head has not yet been
frozen. This report's blocked handoff commit is an intermediate draft.

## Seven findings and current evidence

The full independent review and urgent probes were read. Each original reviewer
probe was copied unchanged and rerun against the reviewed implementation before
correction, using synthetic files/listeners only. The seven matching safety
assertions each failed at exit 1. The original helper processes often exit 0
when they successfully record an unsafe result; that is not a safety pass.
MV-S1-7's first failure is an evaluation of the unchanged source assignment,
matching the seat's inspected probe, not an invented full guards-only rerun.

Local baseline evidence: docs/evidence/mac-verification-app/review-red-before.
It includes assertions.json, p1, p2 and partial-receipt-red.json. No original
Security function was called; no visible window was opened for these probes.

| Finding | Correction in the draft | Executed after-fix evidence / outstanding qualification |
| --- | --- | --- |
| MV-S1-1: curl/config/file exfiltration | No curl. In-process ephemeral GET under the sandbox; no credentials/cookies/cache/proxy/redirects. Skill subprocesses use explicit paths and fresh environments. | Dirty diagnostic accepted healthy owned child with poisoned CURL/proxy/netrc/SSL settings and zero unrelated requests/bytes; redirect and 401 refused 78. Environment-inheritance red fails 1. Built app still needs fresh qualification. |
| MV-S1-2: hard-linked database | Descriptor traversal/checks for manifest, HOME/tmp, code, DB/WAL/SHM, outputs and locks; one link/current UID/root device; descriptor hashing and kernel pins. | Six hard links and six symlinks refused 78; eight pinned replacements denied by kernel; unprotected replacement independently refused 78. Final matrix/red sweep, creation/rotation and abrupt cleanup still pending. |
| MV-S1-3: ps substring spoof | No ps/attach path. Start pinned compiled child with exact seven-key environment; retain child; require kernel parent/start, actual database inode and listening socket before requests. | Healthy owned child and public seeded-Task readback exited 0. Four actual foreign compiled servers with wrong HOME/DB and markers in environment/argv0/cwd/executable path refused 78. Foreign listener and child replacement refused without HTTP to the impostor. Frozen/built-app rerun pending. |
| MV-S1-4: missing credential APIs/brokers/stores | SDK/runtime census expands bindings to 1,099; unique trap handlers and imported-symbol audit. Deny unlisted Mach brokers. Memory standard defaults and isolated HTTP including streams use existing clientFactory injection. | Headless broker queries deny securityd.xpc and related services, while ephemeral health/HID/defaults work under the earlier policy. The 1,099 positive/removal batch, built imports and stricter-policy compatibility remain pending. |
| MV-S1-5: modifier-only/busy-main input | Full exposed input masks; local/global monitor installation before window; independent background session-any-event and IOKit HID sampling every 50 ms. | Posted event types 10 and 12 stop at 80; literal input-mask and busy-main injected-HID controls pass. New removal controls are written, not run. Pre-window monitor refactor and global/visible behavior remain unqualified. |
| MV-S1-6: duplicate instances | Descriptor-checked root flock plus consumed marker, machine visible lock plus protected directory entries. | Concurrent first/second root checks return 0/78; reuse 78. Machine first/second lock checks return 0/78 without opening windows. Latest directory protection change needs rerun. |
| MV-S1-7: partial receipt says complete | Explicit actual stage vector. Complete requires visible scope and every required stage true. | Node tests and restored-old-logic red pass/fail at 0/1. Actual dirty headless diagnostic has completeRecipe=false. Frozen guards-only/built artifact receipts pending. |

These are partial observations, not closed findings. The
[guard design](mac-verification-guard-design.md) lists the counterfactual for
each check, exact process classes/environments and matching controls. The skill
has been returned to draft until its corrected recipe passes end to end.

## Current commands and real exits

All paths below are relative to this checkout. Local evidence is ignored by Git.
Every Swift build/probe before the hold ran through scripts/swift-slot.sh.
After the hold message no Swift job was running, and none was started.

| Command | Exit/result | Evidence |
| --- | --- | --- |
| Unchanged six reviewer scripts through scripts/swift-slot.sh on reviewed source | Outer 0; each unsafe observation reproduced; seven matching safety assertions 1 | review-red-before/assertions.json and p1/p2 logs |
| node .agents/skills/verify-macos-real-app/scripts/verify.mjs <safety-development-6> --development --focus-regressions | 0; PASS_DIAGNOSTIC, 66 observations, 90 command receipts, completeRecipe=false | safety-development-6/result.json, commands.json, guard-matrix.json |
| node .agents/skills/verify-macos-real-app/scripts/verify.mjs <safety-development-7> --development --guards-only | 1; 66 observations recorded, then stricter read-denial sandbox caused compiled server to stop before mutant baseline readiness; 94 receipts; cleanup true | safety-development-7/result.json and mutant-baseline.log |
| node .agents/skills/verify-macos-real-app/scripts/process-policy.test.mjs | 0; every named hostile parent variable dropped | slot-hold-cleanup/node-reds.json records repeated baseline |
| node .agents/skills/verify-macos-real-app/scripts/receipt-stages.test.mjs | 0; partial scopes and each missing required stage incomplete | slot-hold-cleanup/node-reds.json records repeated baseline |
| node .agents/skills/verify-macos-real-app/scripts/node-reds.mjs <receipt> | 0; both baseline tests 0, each matching mutation test 1 | slot-hold-cleanup/node-reds.json |
| node --check on changed Node helpers; git diff --check | 0 when last run; repeat before handoff | local tool execution |

Development receipts record eceedba4 as their parent head and development=true;
their code was dirty and is not claimed byte-equal to that commit. In the seventh
run the guard/mutant builds also straddled the stricter sandbox edit. This is
explicitly disqualified diagnostic evidence. The added server log descriptor
will expose the child startup reason on the next permitted run. No hidden
retry, relaxed broker rule or visible launch followed that failure.

## Remaining work after the holds

1. After the Swift hold is released, resolve the stricter sandbox child-startup
   failure using only owned scratch logs, keeping credential brokers denied.
   Qualify SQLite side-file/Diagnostics creation and cleanup under directory pins.
2. Compile/run the latest class controls (input/defaults/sandbox), guard predicate
   sweep, full 1,099 binding positives and individual removals, and current app
   source/project generation. The generator script is changed but the tracked
   Xcode project has not yet been regenerated; it must not be treated as current.
3. Restore production state/offscreen execution through an explicit linked safety
   boundary with a fresh minimal environment. The old DYLD-injection wrapper is
   disabled before starting any subprocess. Historical passes cannot replace reruns.
4. Freeze one clean implementation head. Rebuild CLI/server, bindings, native
   proofs and verification app from it with clean build; rerun all controls and
   root check, then source/symbol comparisons. No working-tree SHA restamping.
5. Only after a green guard matrix and explicit coordinator visible release,
   requalify bundle-ID/owned-PID accessibility readback/capture and interruption.
   The current build's visibleAllowed=false gate must stay held until then.
   Keep completeRecipe=false until every actual visible stage passes.

No V02 input driver or measurements were started. The coordinator's requested
correctness, UI and hands-on review releases still apply.

## Production preservation

No new production Mac source change was made during this correction. The sole
existing seam remains TodoModel's MainActor SessionStorage, SessionVault
conformance, optional constructor injection and immutable existential property.
SessionVault.swift is byte-identical to candidate 6, SHA-256
`101ad59877b3446eb95db6766f91590b4e31985558a9fc9ba3f2b07d390f60c5`.
The existing clientFactory parameter supplies verification-only HTTP policy;
no additional production seam was introduced. The generated API and production
transport implementation remain unchanged; its default-session factories are
not selected by this entrypoint. Ordinary/stream behavior of the new safety
adapter still requires compiled/runtime qualification.

The independent seat confirmed prior production source/symbol preservation.
Those artifacts were built, never launched. Their hashes are production
`fbb3082170522b277bf8c2e736cd4462075401c4ab86f87d5a952788931db7b9`,
candidate 6
`39856a0c0ad85d22d309cdbca1e8a1faaf32540d81d74984d38e8cc7c2930a7c`.
Both were preserved by hash before removing superseded DerivedData. The six
Security imports remain SecCopyErrorMessageString, SecItemAdd,
SecItemCopyMatching, SecItemDelete, SecItemUpdate and
SecKeychainSetUserInteractionAllowed. No storage symbol was removed.

The exact 26 added production symbols are below. They are in the production
binary because the allowed stored existential needs metadata, value copying,
protocol dispatch/conformance and the model field offset. They are not
verification-code leakage. Original comparison: symbols-ab989410/comparison.json.

```text
_symbolic Todo.SessionStorage
_symbolic _____ 4Todo12SessionVaultV
_symbolic ______p 4Todo14SessionStorageP
_symbolic ______pSg 4Todo14SessionStorageP
assignWithCopy value witness for Todo.SessionVault
assignWithTake value witness for Todo.SessionVault
demangling cache variable for type metadata for Todo.SessionStorage?
destroy value witness for Todo.SessionVault
direct field offset for Todo.TodoModel.(vault in _277A8AEC59CD413B5F17A239A8575E79) : Todo.SessionStorage
full type metadata for Todo.SessionVault
getEnumTagSinglePayload value witness for Todo.SessionVault
initializeBufferWithCopyOfBuffer value witness for Todo.SessionVault
initializeWithCopy value witness for Todo.SessionVault
mangled name ref for type metadata for Todo.SessionStorage?
nominal type descriptor for Todo.SessionVault
protocol conformance descriptor for Todo.SessionVault : Todo.SessionStorage in Todo
protocol descriptor for Todo.SessionStorage
protocol requirements base descriptor for Todo.SessionStorage
protocol witness for Todo.SessionStorage.delete() throws -> () in conformance Todo.SessionVault : Todo.SessionStorage in Todo
protocol witness table for Todo.SessionVault : Todo.SessionStorage in Todo
reflection metadata field descriptor Todo.SessionStorage
reflection metadata field descriptor Todo.SessionVault
storeEnumTagSinglePayload value witness for Todo.SessionVault
type metadata accessor for Todo.SessionVault
type metadata for Todo.SessionVault
value witness table for Todo.SessionVault
```

The original state recipe reported 238 tests/45 suites, three Diagnostics tests
and two contract tests; offscreen reported ten tests/872 renders, all at
ab989410. This correction has not rerun them. Neither the installed app nor a
production executable has been launched. Production project, API, resource,
installer, packaging, lock and Swift-pin files remain unchanged.

## Historical first launch and limits

The ab989410 visible receipt independently read V01 seeded Task alpha and
V01 seeded Task beta from the verification app's own window after resolving
local.todo.verification and its owned PID. The local frozen-ab989410 capture
showed All tasks, Profile verify and two P3 Tasks. A marked event posted inside
that app stopped it at 80. These are historical UI observations; the later
safety escapes prevent using them as proof of isolation. No new visible launch
has been attempted during the correction.

The current input design covers the exposed NSEvent types locally/globally
where macOS allows, plus independent background HID sampling. macOS can withhold
secure input/gestures or consume events, and a suspended process cannot execute
a monitor. Sampling and scheduling impose detection delay; there is no hard
real-time or physical-delivery claim. Denying brokers may disable native file
panels, URL opening, preferences or cloud/autofill features. These flows remain
unproven, and no permission is requested by this draft.

## Disk and cleanup during the Swift hold

After checking every removed directory with lsof -Di +D (exit 1, no open files),
removed only this worker's superseded verification/production/candidate DerivedData
and compiled-binary caches. Preserved all evidence plus hash-verified production
and candidate-6 symbol inputs at .scratch/preserved-symbol-inputs. Free disk
before was 40,383,459,328 bytes (37.610 GiB); after was 45,082,894,336 bytes
(41.987 GiB), reclaiming 4,699,435,008 bytes (4.377 GiB). Receipt:
slot-hold-cleanup/receipt.json. Shared disk usage can change independently.
No other worker's cache, production app, server or launchd state was touched.
