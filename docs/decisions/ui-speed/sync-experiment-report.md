# Replica, Baseline and Patch experiment

Experiment only, on local branch `exp/sync-experiment`, based on `ab1b4bd57b594f477075eef5e287c226355adcd6`. Nothing here is a product change or a delivery branch. No push, PR, merge, app launch, Keychain access, signing or real Todo data access occurred.

Choose an in-memory Replica and a byte-bounded Patch ring, whole changed lists, and SSE. Wake subscriptions immediately after server commits. For external writers, prefer a best-effort CLI wake hint with one shared durable fallback check. Use data_version polling when CLI cooperation is unavailable. The WAL watch did not deliver reliably in this prototype. A wake hint carries no data authority. The transport comparison does not justify replacing SSE. These are provisional design recommendations, not qualification of the complete protocol.

## Method and limits

The generated fixture has 178 Tasks per populated Profile, 50 open, 126 done, two cancelled, median description length 1,260 and maximum 5,244 characters, 39 Tags, 108 link Attachments, a chain, diamond and fan-out. The owner fixture has one populated Profile and seven empty Profiles. The contrast has 1,424 Tasks in eight Profiles. Replica scope remains the current Profile, 178 Tasks, plus counts for every Profile. It is not a 1,424-Task Replica. The fixture is synthetic; no real database, copy, backup or real Todo directory was opened.

Five paired runs alternate arm order. E1 has 40 command samples per arm and fixture, plus five midnight changes. E6 has 100 single external commits per arm, five 300-edit bursts and idle observations. E7 has 500 applied Patches per client and transport. Percentiles use nearest rank. Tables give p50 / p90 / p99 / min to max, in milliseconds unless a heading says otherwise. Small samples do not establish a production p99. All JSON observations and per-pair loads remain ignored under `docs/evidence/sync-experiment/`.

The machine has ten cores and other workers. The late CLI run reached a one-minute load of 9.35 on those ten cores, and its paired invocation deltas are inconclusive. The experiment's own processes also ran concurrently during some batches. Load is recorded beside each pair; these are warm local prototypes, not isolated production benchmarks. Request and transport arms alternate, but monotonically growing History also increases server work during E7. Use within-pair comparisons, not an absolute Swift-versus-TypeScript comparison. No dependencies were added or resolved; pnpm used the frozen offline lockfile.

The compiled builder instruments the shared domain transaction in generated executables only. The stored arm reads the current Profile and computes a Patch under the same write lock, persists it with the write, then decodes the outbox. The memory arm reads a consistent Baseline after commit and compares it with its Replica. Both use the same full reader and whole-row diff. Neither has an optimized affected-row query. The source is kept in `experiments/sync-patches/`; ordinary server routes are unchanged.

## E1. Patch source

### 178-Task fixture

| Arm | Command ms | Reply with Patch ms | CPU ms | Median WAL bytes |
| --- | --- | --- | --- | --- |
| off | 3.674 / 20.968 / 25.074 / 1.715 to 25.074 | No Patch reply | 6.501 / 26.084 / 55.143 / 4.075 to 55.143 | 45,320 |
| stored | 5.694 / 45.482 / 52.467 / 4.02 to 52.467 | 5.963 / 45.818 / 52.809 / 4.285 to 52.809 | 8.096 / 48.512 / 61.304 / 4.264 to 61.304 | 57,680 |
| memory | 5.65 / 45.551 / 53.52 / 4.036 to 53.52 | 5.898 / 45.86 / 53.798 / 4.291 to 53.798 | 6.684 / 49.581 / 86.314 / 4.374 to 86.314 | 45,320 |
### 1,424-Task contrast

| Arm | Command ms | Reply with Patch ms | CPU ms | Median WAL bytes |
| --- | --- | --- | --- | --- |
| off | 15.268 / 145.698 / 149.901 / 8.974 to 149.901 | No Patch reply | 24.019 / 158.917 / 178.485 / 15.683 to 178.485 | 41,232 |
| stored | 21.234 / 215.043 / 222.544 / 15.93 to 222.544 | 21.579 / 215.377 / 222.936 / 16.198 to 222.936 | 24.119 / 227.986 / 257.21 / 16.25 to 257.21 | 57,680 |
| memory | 21.609 / 214.76 / 221.626 / 15.795 to 221.626 | 21.86 / 215.096 / 222.708 / 16.088 to 222.708 | 22.535 / 224.129 / 251.035 / 16.08 to 251.035 | 41,232 |

Write-path breakdown for the owner fixture, excluding midnight. Phase values are medians over the same operations; the added-command value uses the matching off-arm operation in its pair. Medians do not add arithmetically.

| Arm | Paired added command ms | Consistent read ms | Compare ms | Encode ms | Outbox SQL ms | Outbox decode/apply ms |
| --- | --- | --- | --- | --- | --- | --- |
| stored | 2.462 / 22.739 / 27.634 / -2.493 to 27.634 | 1.952 | 0.273 | 0.028 | 0.046 | 0.102 |
| memory | 2.235 / 24.131 / 28.446 / -1.791 to 28.446 | 1.97 | 0.265 | 0.02 | 0 | 0 |

Operation medians explain the tail rather than a few unnamed outliers. Each kind below has five samples per arm except Dependency, which has ten.

| Operation | Off command ms | Stored command ms | Memory command ms |
| --- | --- | --- | --- |
| dependency | 4.236 / 5.328 / 9.001 / 2.646 to 9.001 | 5.281 / 6.133 / 6.508 / 4.756 to 6.508 | 5.564 / 7.21 / 8.047 / 4.601 to 8.047 |
| complete | 3.674 / 5.958 / 5.958 / 3.323 to 5.958 | 6.272 / 6.355 / 6.355 / 5.842 to 6.355 | 5.767 / 7.117 / 7.117 / 5.558 to 7.117 |
| reopen | 2.494 / 4.614 / 4.614 / 2.269 to 4.614 | 4.963 / 5.752 / 5.752 / 4.74 to 5.752 | 4.802 / 5.759 / 5.759 / 4.63 to 5.759 |
| description | 2.236 / 2.716 / 2.716 / 2.198 to 2.716 | 5.32 / 5.862 / 5.862 / 4.647 to 5.862 | 5.519 / 5.811 / 5.811 / 4.61 to 5.811 |
| quick-add | 1.809 / 5.642 / 5.642 / 1.715 to 5.642 | 4.177 / 6.794 / 6.794 / 4.02 to 6.794 | 4.132 / 4.277 / 4.277 / 4.036 to 4.277 |
| move | 7.325 / 9.787 / 9.787 / 7.064 to 9.787 | 9.641 / 11.387 / 11.387 / 9.282 to 11.387 | 9.253 / 11.94 / 11.94 / 9.094 to 11.94 |
| batch | 22.284 / 25.074 / 25.074 / 20.968 to 25.074 | 48.734 / 52.467 / 52.467 / 45.482 to 52.467 | 47.055 / 53.52 / 53.52 / 45.551 to 53.52 |

The ten-Task batch is 5 of 40 command samples, 12.5%, and occupies the top of this mix. Each Task takes its own domain write transaction and therefore another read/diff/Patch in either arm. The 90th-percentile jump is systematic for this command shape, not a claim that ordinary single-Task edits take that long. An atomic combined batch publication would be a different prototype and must be measured separately.


Command timing includes the arm's subscriber update. Reply timing adds response Patch composition and encoding. The uninstrumented arm's CPU includes the harness's post-command Baseline read, so its CPU is not a clean incremental-write comparator. WAL growth is logical appended WAL bytes with autocheckpoint disabled, not filesystem physical writes or flash wear. Batch edits include ten Tasks; do not compare their tail with a single-Task edit.

| 300-edit arm, n=5 | Elapsed ms | Server CPU ms | Patches | Median WAL bytes | SQL Task-read ms |
| --- | --- | --- | --- | --- | --- |
| stored | 4,415.517 / 4,782.523 / 4,782.523 / 2,801.469 to 4,782.523 | 144.018 / 184.727 / 184.727 / 77.134 to 184.727 | 300, 300, 300, 300, 300 | 15,965,000 | 0.034 / 0.039 / 0.039 / 0.016 to 0.039 |
| memory | 2,033.588 / 2,979.687 / 2,979.687 / 1,542.239 to 2,979.687 | 668.878 / 1,264.771 / 1,264.771 / 433.327 to 1,264.771 | 120, 131, 94, 85, 71 | 13,612,480 | 0.048 / 0.077 / 0.077 / 0.038 to 0.077 |

One actual compiled todo edit command, including process startup and JSON stdout, costs:

| CLI arm | Per-run median wall ms, p50 / p90 / p99 / range | Worst single invocation ms |
| --- | --- | --- |
| stored | 204.574 / 252.624 / 252.624 / 151.891 to 252.624 | 1,553.013 |
| memory | 180.265 / 303.188 / 303.188 / 141.47 to 303.188 | 338.48 |

The memory-arm CLI has no sync observer or Replica at all. It keeps the ordinary direct domain write and lets the server do its own later read. The stored-arm CLI computes and persists the Patch but does not consume the server stream or construct a delivery ring. The pooled group medians differ by 24.309 ms, but this is not a reliable gain. The matched per-pair stored-minus-memory difference is -9.22 / 53.975 / 53.975 / -50.564 to 53.975 ms and changes sign. One todo command therefore has no demonstrated wall-time gain on this loaded-machine run; a quiet paired CLI run is owed. This is a one-Task command; it includes startup and is not a guarantee for every todo command. An earlier burst pilot incorrectly ran an in-memory observer in the CLI as well; those numbers were discarded and are not the final table.


The burst is 300 real domain edits from a persistent compiled external process. It is not 300 independent CLI startups. Five real compiled CLI edits per arm per pair also passed; their process-startup cost is retained in burst.json. Stored emits every Patch and shifts computation into that writer; memory coalesces to consistent captured cursors and spends more CPU in the server. The concurrent Task-read measurement is one prepared SQL payload lookup, not the entire authenticated Task-details request. Poll busy times and Patch sizes are in burst.json.

Choose memory provisionally. The paired write-latency difference is small beside run and operation variation. Memory avoids the durable content copy and its extra WAL and Snapshot-redaction work. Stored is attractive if external-burst server CPU becomes the limiting factor or restart catch-up must avoid Baselines; the present experiment has not established either requirement. A more selective reader or one combined batch Patch could change this decision.

### Correctness and lifecycle

The compiled drive passed 115 Baseline comparisons per arm. It covers 100 generated edits, fan-out completion, a rejected stale edit, Copy, Dependency Delete with a preview fingerprint, Revert, recurrence and successor creation, reminder work, a normal Snapshot restore, Delete and Purge. The deliberately omitted computed record for a newly Ready descendant fails equality. Unchanged Task rows keep their identity. Both whole-list and indexed-edit reducers equal fresh Baselines throughout the measured operation mix.

A concurrent-writer run exposed a prototype bug: it read consistent rows, then fetched a newer sequence outside that read. The Replica could be one commit behind while the observer believed it had caught up. The corrected observer advances only to the cursor captured in the read. The final wake runs compare the final Replica with a fresh Baseline after every burst. This does not substitute for a deterministic all-interleavings proof.

Normal restore clears delivery state on generation change. Purge clears the ring and Replica, and the stored arm deletes its outbox and removes outbox copies from scratch Snapshots. This demonstrates the need for an erasure barrier, not comprehensive byte-erasure qualification. Old-client gaps require a Baseline. A restart initializes a Baseline in these prototypes. Stored outbox persistence exists, but historical cursor replay across an actual server restart was not timed.

Restore after Purge is unqualified. Both arms hit the base Snapshot code's `Restored Snapshot violates foreign keys`. The redacted Snapshot contains task_tags rowid 79 referencing the erased Task. The fixture had no foreign-key violations before this sequence. The coordinator independently reproduced the same defect through the installed compiled CLI in a scratch HOME and assigned FIX-PURGE-RESTORE on another branch. This one check is blocked by a known product defect. The report keeps purge_restore_unproven and changes no product code. Full raw-file erasure, pending frames, overlays and detail-cache erasure remain owed.

The bounded serial subscription tests pass connection replacement, strict predecessor checks, duplicate reply/stream application, a generation/cursor caught-up marker, overflow recovery, remote rename/removal, and refusal of only the affected pending action. They are a reducer test, not app UI or action-overlay qualification. Some reply/stream controls reuse identical no-op/echo frames; real concurrent accepted write replies still need an end-to-end app test.

## E2. Orders and views

| Operation | Whole bytes | Edits bytes | Whole produce ms | Edits produce ms | Whole apply ms | Edits apply ms | Changed lists |
| --- | --- | --- | --- | --- | --- | --- | --- |
| dependency | 3,911 | 2,186 | 0.225 / 0.267 / 2.222 / 0.187 to 2.222 | 0.245 / 0.298 / 1.258 / 0.206 to 1.258 | 0.011 / 0.017 / 0.965 / 0.007 to 0.965 | 0.014 / 0.02 / 0.044 / 0.01 to 0.044 | 1 |
| complete | 12,748 | 11,553 | 0.228 / 0.265 / 1.185 / 0.194 to 1.185 | 0.242 / 0.26 / 0.281 / 0.218 to 0.281 | 0.01 / 0.016 / 0.026 / 0.008 to 0.026 | 0.019 / 0.022 / 0.026 / 0.016 to 0.026 | 4 |
| reopen | 12,756 | 11,606 | 0.223 / 0.263 / 0.304 / 0.195 to 0.304 | 0.242 / 0.262 / 0.279 / 0.217 to 0.279 | 0.01 / 0.015 / 0.018 / 0.007 to 0.018 | 0.017 / 0.021 / 0.03 / 0.014 to 0.03 | 4 |
| description | 2,016 | 2,016 | 0.229 / 0.266 / 0.984 / 0.192 to 0.984 | 0.2 / 0.226 / 0.265 / 0.184 to 0.265 | 0.01 / 0.015 / 0.021 / 0.007 to 0.021 | 0.008 / 0.011 / 0.022 / 0.007 to 0.022 | 0 |
| quick-add | 7,952 | 2,405 | 0.225 / 0.274 / 1.121 / 0.198 to 1.121 | 0.307 / 0.331 / 1.088 / 0.276 to 1.088 | 0.01 / 0.024 / 0.034 / 0.007 to 0.034 | 0.016 / 0.022 / 0.027 / 0.013 to 0.027 | 4 |
| move | 9,965 | 4,654 | 0.22 / 0.263 / 0.302 / 0.189 to 0.302 | 0.299 / 0.319 / 1.209 / 0.26 to 1.209 | 0.014 / 0.026 / 0.037 / 0.009 to 0.037 | 0.019 / 0.023 / 0.033 / 0.015 to 0.033 | 5 |
| batch | 22,360 | 17,753 | 0.226 / 0.268 / 0.305 / 0.19 to 0.305 | 0.288 / 0.333 / 0.362 / 0.262 to 0.362 | 0.01 / 0.016 / 0.02 / 0.008 to 0.02 | 0.018 / 0.021 / 0.029 / 0.014 to 0.029 | 3 |
| midnight | 429 | 817 | 0.223 / 0.252 / 0.309 / 0.198 to 0.309 | 0.211 / 0.228 / 0.248 / 0.182 to 0.248 | 0.009 / 0.015 / 0.021 / 0.007 to 0.021 | 0.017 / 0.021 / 0.026 / 0.014 to 0.026 | 4 |

The fan-out completion changes 31 computed records. Midnight is a clock-only cursor change; no operation is fabricated in History. Switching the default list to Dependency order adds 2001 whole-list bytes versus 561 edit bytes. This is an order-switch prototype, not a new Dependency mutation.

| List representation | Swift decode ms | Swift apply ms |
| --- | --- | --- |
| whole | 0.16 / 0.528 / 0.596 / 0.01 to 0.783 | 0.01 / 0.012 / 0.014 / 0 to 0.073 |
| edits | 0.103 / 0.517 / 0.594 / 0.012 to 1.593 | 0.011 / 0.013 / 0.016 / 0.001 to 0.141 |

Choose whole changed lists. Edits save bytes on the sparse changes, but these lists contain only 178 ids. Both reducers take a small fraction of a millisecond, and edits add positional validity rules. The synthetic Dependency-order switch and midnight sample are included in codec/retention evidence. Revisit edits for much larger current Profiles or a constrained network; eight Profiles of 178 Tasks do not measure that case.

## E3. Ring size and recovery

| Repeated operation | One Patch bytes | 256 raw / encoded bytes | Decoded serialized bytes | Count at 1 MiB |
| --- | --- | --- | --- | --- |
| dependency | 3,927 | 1,005,312 / 1,005,312 | 616,054 | 256 |
| dependency | 3,909 | 1,000,704 / 1,000,704 | 610,934 | 256 |
| complete | 12,748 | 3,263,488 / 3,263,488 | 2,376,300 | 82 |
| reopen | 12,756 | 3,265,536 / 3,265,536 | 2,417,006 | 82 |
| description | 2,016 | 516,096 / 516,096 | 104,110 | 256 |
| quick-add | 7,952 | 2,035,712 / 2,035,712 | 1,735,029 | 131 |
| move | 9,965 | 2,551,040 / 2,551,040 | 2,360,137 | 105 |
| batch | 22,360 | 5,724,160 / 5,724,160 | 2,406,800 | 46 |
| midnight | 429 | 109,824 / 109,824 | 86,502 | 256 |
| dependency-reorder | 2,001 | 512,256 / 512,256 | 491,462 | 256 |

Raw JSON and UTF-8 encoded body sizes coincide for this ASCII fixture; there is no compression. Decoded serialized size is a runtime serialization measurement, not retained heap. The following separate GC observations retain 256 independently decoded Patches and estimate live heap change. They are implementation-specific and contain allocator/collection noise. Replica deltas retain 256 copies and divide by 256.

| Mix | Encoded ring bytes | Decoded ring heap delta bytes | Decoded Replica heap delta bytes |
| --- | --- | --- | --- |
| description | 516,096 | 575,011 (542,658 to 581,787) | 385,255.242 (385,255.133 to 385,422.773) |
| batch | 5,724,160 | 7,810,040 (7,809,993 to 7,842,644) | 384,157.434 (384,147.086 to 384,160.695) |
| complete | 3,263,488 | 5,306,704 (5,306,704 to 5,339,316) | 384,967.484 (384,967.285 to 384,967.953) |

Choose at most 256 Patches and 1 MiB of encoded ring data per active Profile, plus a separately accounted 1 MiB queue/in-flight budget. The observer enforces count and encoded bytes. The serial subscription control rejects a queue overflow. The live network prototype does not implement a complete byte budget on its socket buffers, so 2 MiB is a proposed accounting limit, not a proven total-memory ceiling. An oversized Patch should require a Baseline; a maximum individual-frame threshold still needs qualification.

A subscriber catches up only if its exact cursor chain and generation remain available and catch-up is cheaper than a Baseline. Time alone is not expiration. Under an explicit one-operation-per-second model:

| Away | Delivery | Bytes | Bun decode/apply ms |
| --- | --- | --- | --- |
| 1 s | ring | 2,016 | 0.01 / 0.011 / 0.013 |
| 10 s | ring | 20,160 | 0.098 / 0.117 / 0.237 |
| 60 s | ring | 120,960 | 0.624 / 0.718 / 1.094 |
| 3600 s | baseline | 339,548 | 0.571 / 0.61 / 1.061 |

These reconnect costs replay repeated measured Patch shapes with cursor rebasing, not historical network traffic. One hour with no writes can still catch up immediately; a fast burst can overflow in under a second. The worst measured mix is the batch edit. It is not the contract maximum of many 100,000-character descriptions. Both raw and decoded allocations and one in-flight Patch must be budgeted; count 256 by itself is insufficient.

## E4. Decoding and application

| Bun payload | Bytes p50 | JSON parse ms, pair medians | Schema/construct ms, pair medians | Apply ms, pair medians |
| --- | --- | --- | --- | --- |
| baseline | 339,393 | 0.148 / 0.154 / 0.165 / 0.142 to 0.165 | 0.367 / 0.381 / 0.401 / 0.355 to 0.401 | 0 / 0 / 0 / 0 to 0 |
| whole | 7,952 | 0.016 / 0.025 / 0.026 / 0 to 0.026 | 0.012 / 0.024 / 0.026 / 0.001 to 0.026 | 0.006 / 0.007 / 0.008 / 0.005 to 0.008 |
| edits | 2,405 | 0.002 / 0.011 / 0.013 / 0.001 to 0.013 | 0.009 / 0.024 / 0.027 / 0.002 to 0.027 | 0.007 / 0.009 / 0.009 / 0.006 to 0.009 |
| Foundation Codable | Decode/construct ms | Apply ms |
| --- | --- | --- |
| baseline | 2.172 / 2.466 / 2.768 / 2.071 to 10.857 | 0 / 0 / 0 / 0 to 0 |
| whole | 0.16 / 0.528 / 0.596 / 0.01 to 0.783 | 0.01 / 0.012 / 0.014 / 0 to 0.073 |
| edits | 0.103 / 0.517 / 0.594 / 0.012 to 1.593 | 0.011 / 0.013 / 0.016 / 0.001 to 0.141 |

The 132,000-byte comparison is a synthetic JSON list of 60 stored-shape Task rows, padded in the last description. It is not a captured production TaskView reply. Bun parsing pair-median p50 is 0.038 ms and validation/construction 0.111 ms. Foundation decode is 0.455 / 0.465 / 0.484 / 0.438 to 0.494 ms.

Keep JSON and whole rows. Decoding these Baselines is milliseconds in Foundation and below one millisecond in warm Bun; the smaller Patches cost less. The Foundation benchmark uses typed Task content, computed records and lists, with generic Codable JSON for small metadata arrays. It is shaped like the generated client, not the generated production client itself. Swift apply uses value types and copy-on-write dictionaries. Parsing and object construction are separated in Bun; Foundation JSONDecoder combines them. No renderer-engine measurement was obtained. Bun is not evidence for Electron renderer timing.

A separate CPU-profile run identified JSON parsing and Effect Schema traversal as the main timed codec work. Deep equality was outside timed regions and dominated the first whole-harness CPU capture, so a second capture reduced that verification work. No profiler run supplies the reported timing table.

### Checked-read sensitivity

| Extra indexed credential-row lookup | Baseline ms, pair medians | Memory read/diff ms, pair medians |
| --- | --- | --- |
| none | 1.627 / 1.792 / 1.792 / 1.621 to 1.792 | 1.851 / 2.054 / 2.054 / 1.836 to 2.054 |
| one | 1.637 / 1.654 / 1.654 / 1.614 to 1.654 | 1.866 / 1.894 / 1.894 / 1.832 to 1.894 |

The sensitivity performs one indexed SELECT inside the consistent read. It does not implement the other worker's complete checked-read semantics or copy that work. Authorization changes can move E1 reply/Baseline times, memory-arm server CPU, E6 compute time and E7 absolute times. They should not change encoded bytes or list-reducer costs. The extra lookup alone is smaller than shared-machine variation here.

## E5. Diagnostics proposal

The prototype emits projection, encoding and decode spans through the existing DiagnosticRecorder. Its scratch /diagnostics response includes the existing profiler and a content-free sync_experiment extension with Replica bytes, ring bytes/count and recent numeric observations. diagnostics.json is the captured real response. This is a proposal; no generated contract was changed.

Add a bounded sync object with these fields to the existing contract:

- patch_bytes, patch_rows, patch_computed_records, patch_lists and patch_removed_rows, with count and bounded size histograms.
- patch_compute_ms and patch_encode_ms, separated from wake_wait_ms, commit_to_send_ms and send_to_apply_ms.
- client_decode_ms and client_apply_ms, labeled by client kind and observed process clock; no cross-clock subtraction without an explicit shared-clock capability.
- ring_encoded_bytes, ring_decoded_estimate_bytes, ring_count, replica_encoded_bytes and replica_decoded_estimate_bytes.
- queued_bytes and in_flight_bytes as separate gauges, plus overflow_count.
- baseline_bytes, baseline_read_ms, baseline_decode_ms and baseline_apply_ms.
- baseline_count_by_reason for start, gap, restart, generation_change, overflow and catchup_more_expensive.
- applied_cursor_distance, caught_up and pending_action_count, without Task content or credential material.

The current prototype does not route every Swift apply/decode measurement back through DiagnosticRecorder, and the live socket queue gauges are not implemented. These proposed fields are not all demonstrated in the captured body. Existing profiler byte budgets must still bound them.

## E6. Learning of a commit

The following final run corrects the interim run's phase-biased arrival schedule and watches the WAL file itself. Commit times use a shared machine clock immediately after the external domain command returns. Detection includes a consistent read, diff and local reducer; it does not include a network hop. E7 separately measures the network and client path after own commits.

| Own commit, immediate in-process observer | Commit to server send handoff ms | Commit to subscriber apply ms |
| --- | --- | --- |
| typescript over SSE | 4.896 / 7.267 / 8.656 / 2.567 to 10.718 | 5.476 / 7.779 / 9.275 / 2.72 to 11.039 |
| swift over SSE | 5.674 / 11.423 / 21.731 / 2.642 to 63.092 | 6.138 / 12.189 / 30.61 / 2.95 to 65.172 |

The own-write prototype calls its observer immediately after the transaction commits, then sends the Patch on the already open subscription. Send handoff is the timestamp after enqueue or ws.send returns, not an observed kernel/network departure. The present profiler cannot see that physical boundary. This separates the measured server compute/send interval from the subscriber-applied result; there is no 250 ms sleep in this path. It does not measure a future Effect PubSub scheduler.

| External wake | Commit to local apply ms | Burst Patches, five runs | Missed/normal wake ms |
| --- | --- | --- | --- |
| poll250 | 127.253 / 228.177 / 257.863 / 6.821 to 260.215 | 4, 4, 5, 5, 4 | 244.013 / 252.918 / 252.918 / 241.841 to 252.918 |
| data50 | 28.825 / 49.647 / 53.867 / 2.614 to 58.325 | 19, 20, 21, 20, 20 | 42.944 / 43.619 / 43.619 / 42.618 to 43.619 |
| data20 | 14.507 / 21.388 / 24.927 / 2.479 to 30.357 | 46, 50, 49, 48, 48 | 12.836 / 13.133 / 13.133 / 11.59 to 13.133 |
| data10 | 9.494 / 12.035 / 14.499 / 2.379 to 16.997 | 97, 87, 105, 91, 93 | 11.899 / 13.661 / 13.661 / 2.976 to 13.661 |
| wal | 856.561 / 963.533 / 986.228 / 3.492 to 988.582 | 5, 5, 5, 5, 4 | 991.866 / 992.929 / 992.929 / 974.432 to 992.929 |
| hint | 2.969 / 6.756 / 7.785 / 2.412 to 8.469 | 2, 2, 2, 2, 2 | 670.511 / 998.912 / 998.912 / 330.086 to 998.912 |

The hint arm omits the hint once per run and recovers through its one-second fallback. The WAL missed-wake column is an ordinary watched commit, not a disabled notifier; suppressing or losing a WAL notification was not injected. Duplicate checks publish no extra Patch. Each run performs checkpoint(TRUNCATE), but does not prove a later commit through a replaced WAL inode. The one-second fallback is an experiment parameter; it exceeds the owner's 300 ms tail goal when it is needed. Use one shared fallback of at most 250 ms in the proposed product, then measure its mixed-workload tail. A 20 ms data_version check is the measured alternative without CLI cooperation.

| Idle observer model | Subscribers | CPU ms per second | Wake-ups per second |
| --- | --- | --- | --- |
| per-subscription250 | 1 | 1.116 / 3.458 / 3.458 / 1.018 to 3.458 | 2.994 / 2.997 / 2.997 / 2.994 to 2.997 |
| per-subscription250 | 2 | 1.086 / 1.307 / 1.307 / 0.583 to 1.307 | 5.988 / 5.993 / 5.993 / 5.988 to 5.993 |
| per-subscription250 | 5 | 1.181 / 1.73 / 1.73 / 0.994 to 1.73 | 14.972 / 14.99 / 14.99 / 14.969 to 14.99 |
| shared20 | 1 | 2.709 / 3.237 / 3.237 / 1.867 to 3.237 | 44.998 / 45.98 / 45.98 / 44.983 to 45.98 |
| shared20 | 2 | 2.236 / 3.282 / 3.282 / 1.866 to 3.282 | 44.998 / 45.956 / 45.956 / 44.908 to 45.956 |
| shared20 | 5 | 2.512 / 2.79 / 2.79 / 1.983 to 2.79 | 45.948 / 45.962 / 45.962 / 44.909 to 45.962 |

Idle controls use actual SQLite reads and timers. These are finite one-second windows including timer startup, so the last boundary tick can be excluded; they are not exact steady-state frequency estimates. They model today's per-subscription sleepers versus a shared observer; they do not run the complete production SSE authorization/heartbeat loop. A shared observer's number of database wake checks stays constant as subscribers increase.

Choose immediate in-process signals for own writes. For external writes, choose the measured loopback hint and reject this WAL-watch implementation. Its median was dominated by the one-second fallback. The durability source remains op_log and a captured consistent read. Ship neither a watch-only path nor a hint-only path. A 20 ms data_version observer is the measured fallback option when a fast watch cannot be made reliable. A CLI hint needs a loopback endpoint and a best-effort call after commit, adds no data authority, and must never make a successful commit fail. A filesystem watch changes no public contract but needs replacement/checkpoint/restart qualification.

## E7. SSE versus WebSocket

Both arms use the same domain writes, in-memory Patch computation and immediate own-commit wake on the same Bun loopback server. SSE uses id/event/data framing matching the existing stream; it is an experiment route, not the production Effect HttpApi adapter. Commit-to-apply includes Patch production and client decoding, not UI rendering.

| Client | Transport | Commit to apply ms | Five pair medians ms | Application/frame bytes per message |
| --- | --- | --- | --- | --- |
| typescript | sse | 5.476 / 7.779 / 9.275 / 2.72 to 11.039 | 3.298, 4.659, 5.075, 6.859, 7.599 | 1,957.76 |
| typescript | ws | 5.635 / 10.054 / 18.468 / 2.738 to 22.604 | 3.315, 4.469, 5.344, 6.191, 10.054 | 1,904.73 |
| swift | sse | 6.138 / 12.189 / 30.61 / 2.95 to 65.172 | 3.312, 5.14, 5.964, 7.485, 12.187 | 1,959.6 |
| swift | ws | 6.719 / 19.223 / 45.122 / 3.135 to 107.075 | 3.475, 5.06, 7.779, 6.953, 19.18 | 1,906.65 |

WebSocket minus SSE has no consistent paired latency win. Pooled median saving for WebSocket is -0.159 ms in TypeScript and -0.58 ms in Swift. Both effects are smaller than variation among pairs. The encoded WebSocket estimate includes its short unmasked server-frame header; SSE counts id/event/data delimiters. HTTP headers, TCP/IP, TLS, acknowledgments and kernel buffers are excluded.

| Request-overhead control | HTTP round trip ms | Socket round trip ms |
| --- | --- | --- |
| read | 0.032 / 0.061 / 0.089 / 0.025 to 0.135 | 0.02 / 0.045 / 0.054 / 0.008 to 0.11 |
| write | 0.046 / 0.078 / 0.14 / 0.036 to 0.353 | 0.029 / 0.055 / 0.064 / 0.022 to 0.361 |

The request-overhead control echoes a representative row or Patch. Its write increments a counter, not SQLite. It isolates a small framing/dispatch opportunity and cannot establish the benefit of moving real authenticated reads/writes onto a socket. Both transports keep one connection open during the measured warm runs. Full idle CPU, heartbeat timeout, reconnect after a real drop or machine sleep, slow-client backpressure, and live Profile-switch timing were not measured. Connection-epoch, cursor-gap, caught-up and byte-overflow reducer controls passed separately.

Keep SSE. The measured transport difference is below one millisecond in both clients, while wake and server computation are the larger costs. A WebSocket command/subscription vocabulary would sit outside ADR-0003's single OpenAPI contract and needs an owner-approved contract/ADR decision. It needs hand-written frame decoding and dispatch in Swift and TypeScript, upgrade authentication and revocation behavior, a subscription lifecycle, request correlation, liveness and byte budgets. verify-sse would need a transport matrix covering both stream parsers, credential revocation, generation changes, resumed chains, slow clients, Profile replacement and receipt ordering. The present measurements do not justify that added protocol.

## What remains unmeasured or unqualified

No product latency or rendered-frame target is claimed. No app was launched. Owed are the actual Electron renderer codec, actual generated Swift decoder, all accepted commands and scheduler snooze wakes, attachment/import/Profile-deletion matrices, all interleavings during reads, complete reply-first/stream-first app behavior, erased content in raw disk and queued frames, old CLI/restart recovery timing, the largest permitted Patch, real network catch-up, comprehensive WAL notification failure/replacement controls, socket backpressure and byte accounting, machine sleep/reconnect/Profile switch, and authenticated HTTP-versus-socket domain requests. The post-Purge Snapshot foreign-key failure blocks that restore case. The recommendations can guide the next design, but these prototypes cannot be merged or used to claim the protocol is correct for every command.

## Reproduction and cleanup

The project-local verify-sync-experiment skill was created and its compiled correctness and reducer paths were executed. Experimental TypeScript typecheck passes. Full pnpm check was not required and was not run. No child reviewer was launched, per the explicit no-children instruction; the standing no-comments delegation step therefore could not run. Comments were reviewed locally.

Evidence stays local and ignored. The report and reusable experiment inputs are tracked. The builder records its source digest and executable digests, and reuses a matching digest. Compile temporaries and owned closed scratch state were cleaned; cleanup.json records final counts and free space. No other worker's process or files were removed. The measured executables were compiled from the experiment source at the recorded build digest; the report commit itself is not a claim that every binary's embedded build id equals that commit.

Cleanup removed 106 closed Bun compile temporaries, 9,398,051,584 file bytes, and 2 owned failed scratch directories. No open compile file was deleted. Remaining free space was 105.396 GiB, above the 30 GiB floor.
