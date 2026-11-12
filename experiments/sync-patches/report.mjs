import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { stats } from "./stats.ts";
const read = (s) =>
  JSON.parse(
    readFileSync("docs/evidence/sync-experiment/" + s + ".json", "utf8"),
  );
const f = (x) => x.toLocaleString("en-US", { maximumFractionDigits: 3 }),
  summary = (x) => {
    const s = stats(x);
    return `${f(s.median)} / ${f(s.p90)} / ${f(s.p99)} / ${f(s.min)} to ${f(s.max)}`;
  };
const table = (heads, rows) =>
  "| " +
  heads.join(" | ") +
  " |\n| " +
  heads.map(() => "---").join(" | ") +
  " |\n" +
  rows.map((r) => "| " + r.join(" | ") + " |").join("\n") +
  "\n";
const bench = read("bench"),
  burst = read("burst"),
  wake = read("wake"),
  codec = read("codec"),
  swift = read("swift-codec"),
  ring = read("retention"),
  memory = read("memory"),
  transport = read("transport"),
  idle = read("idle"),
  sensitivity = read("sensitivity"),
  requests = read("request-cost");
let text = `# Replica, Baseline and Patch experiment\n\nExperiment only, on local branch \`exp/sync-experiment\`, based on \`ab1b4bd57b594f477075eef5e287c226355adcd6\`. Nothing here is a product change or a delivery branch. No push, PR, merge, app launch, Keychain access, signing or real Todo data access occurred.\n\nChoose an in-memory Replica and a byte-bounded Patch ring, whole changed lists, and SSE. Wake subscriptions immediately after server commits. For external writers, prefer a best-effort CLI wake hint with one shared durable fallback check. Use data_version polling when CLI cooperation is unavailable. The WAL watch did not deliver reliably in this prototype. A wake hint carries no data authority. The transport comparison does not justify replacing SSE. These are provisional design recommendations, not qualification of the complete protocol.\n\n## Method and limits\n\nThe generated fixture has 178 Tasks per populated Profile, 50 open, 126 done, two cancelled, median description length 1,260 and maximum 5,244 characters, 39 Tags, 108 link Attachments, a chain, diamond and fan-out. The owner fixture has one populated Profile and seven empty Profiles. The contrast has 1,424 Tasks in eight Profiles. Replica scope remains the current Profile, 178 Tasks, plus counts for every Profile. It is not a 1,424-Task Replica. The fixture is synthetic; no real database, copy, backup or real Todo directory was opened.\n\nFive paired runs alternate arm order. E1 has 40 command samples per arm and fixture, plus five midnight changes. E6 has 100 single external commits per arm, five 300-edit bursts and idle observations. E7 has 500 applied Patches per client and transport. Percentiles use nearest rank. Tables give p50 / p90 / p99 / min to max, in milliseconds unless a heading says otherwise. Small samples do not establish a production p99. All JSON observations and per-pair loads remain ignored under \`docs/evidence/sync-experiment/\`.\n\nThe machine has ten cores and other workers. The late CLI run reached a one-minute load of 9.35 on those ten cores, and its paired invocation deltas are inconclusive. The experiment's own processes also ran concurrently during some batches. Load is recorded beside each pair; these are warm local prototypes, not isolated production benchmarks. Request and transport arms alternate, but monotonically growing History also increases server work during E7. Use within-pair comparisons, not an absolute Swift-versus-TypeScript comparison. No dependencies were added or resolved; pnpm used the frozen offline lockfile.\n\nThe compiled builder instruments the shared domain transaction in generated executables only. The stored arm reads the current Profile and computes a Patch under the same write lock, persists it with the write, then decodes the outbox. The memory arm reads a consistent Baseline after commit and compares it with its Replica. Both use the same full reader and whole-row diff. Neither has an optimized affected-row query. The source is kept in \`experiments/sync-patches/\`; ordinary server routes are unchanged.\n\n## E1. Patch source\n\n`;
for (const fixture of ["owner", "large"]) {
  text += `### ${fixture === "owner" ? "178-Task fixture" : "1,424-Task contrast"}\n\n`;
  text += table(
    ["Arm", "Command ms", "Reply with Patch ms", "CPU ms", "Median WAL bytes"],
    ["off", "stored", "memory"].map((arm) => {
      const r = bench.results.filter(
        (r) => r.fixture === fixture && r.arm === arm && r.kind !== "midnight",
      );
      return [
        arm,
        summary(r.map((x) => x.command_ms)),
        arm === "off" ? "No Patch reply" : summary(r.map((x) => x.reply_ms)),
        summary(r.map((x) => x.cpu_ms)),
        f(stats(r.map((x) => x.wal_bytes)).median),
      ];
    }),
  );
}
text +=
  "\nWrite-path breakdown for the owner fixture, excluding midnight. Phase values are medians over the same operations; the added-command value uses the matching off-arm operation in its pair. Medians do not add arithmetically.\n\n";
text += table(
  [
    "Arm",
    "Paired added command ms",
    "Consistent read ms",
    "Compare ms",
    "Encode ms",
    "Outbox SQL ms",
    "Outbox decode/apply ms",
  ],
  ["stored", "memory"].map((arm) => {
    const rows = bench.results.filter(
      (r) => r.fixture === "owner" && r.arm === arm && r.kind !== "midnight",
    );
    const phase = (k) => f(stats(rows.map((r) => r.phases[k] ?? 0)).median);
    return [
      arm,
      summary(
        rows.map(
          (r) =>
            r.command_ms -
            bench.results.find(
              (o) =>
                o.fixture === r.fixture &&
                o.arm === "off" &&
                o.pair === r.pair &&
                o.i === r.i,
            ).command_ms,
        ),
      ),
      phase("read_ms"),
      phase("compare_ms"),
      phase("encode_ms"),
      phase("persist_ms"),
      f(
        stats(
          rows.map((r) => (r.phases.decode_ms ?? 0) + (r.phases.apply_ms ?? 0)),
        ).median,
      ),
    ];
  }),
);
text +=
  "\nOperation medians explain the tail rather than a few unnamed outliers. Each kind below has five samples per arm except Dependency, which has ten.\n\n";
text += table(
  ["Operation", "Off command ms", "Stored command ms", "Memory command ms"],
  [
    ...new Set(
      bench.results
        .filter((r) => r.fixture === "owner" && r.kind !== "midnight")
        .map((r) => r.kind),
    ),
  ].map((kind) => [
    kind,
    ...["off", "stored", "memory"].map((arm) =>
      summary(
        bench.results
          .filter(
            (r) => r.fixture === "owner" && r.kind === kind && r.arm === arm,
          )
          .map((r) => r.command_ms),
      ),
    ),
  ]),
);
text +=
  "\nThe ten-Task batch is 5 of 40 command samples, 12.5%, and occupies the top of this mix. Each Task takes its own domain write transaction and therefore another read/diff/Patch in either arm. The 90th-percentile jump is systematic for this command shape, not a claim that ordinary single-Task edits take that long. An atomic combined batch publication would be a different prototype and must be measured separately.\n\n";
text += `\nCommand timing includes the arm's subscriber update. Reply timing adds response Patch composition and encoding. The uninstrumented arm's CPU includes the harness's post-command Baseline read, so its CPU is not a clean incremental-write comparator. WAL growth is logical appended WAL bytes with autocheckpoint disabled, not filesystem physical writes or flash wear. Batch edits include ten Tasks; do not compare their tail with a single-Task edit.\n\n`;
text += table(
  [
    "300-edit arm, n=5",
    "Elapsed ms",
    "Server CPU ms",
    "Patches",
    "Median WAL bytes",
    "SQL Task-read ms",
  ],
  ["stored", "memory"].map((arm) => {
    const r = burst.filter((x) => x.arm === arm);
    return [
      arm,
      summary(r.map((x) => x.total_ms)),
      summary(r.map((x) => x.server_cpu_ms)),
      r.map((x) => x.patches).join(", "),
      f(stats(r.map((x) => x.wal_bytes)).median),
      summary(r.map((x) => x.task_read_ms.median)),
    ];
  }),
);
text +=
  "\nOne actual compiled todo edit command, including process startup and JSON stdout, costs:\n\n";
text += table(
  [
    "CLI arm",
    "Per-run median wall ms, p50 / p90 / p99 / range",
    "Worst single invocation ms",
  ],
  ["stored", "memory"].map((arm) => {
    const rows = burst.filter((r) => r.arm === arm);
    return [
      arm,
      summary(rows.map((r) => r.actual_cli_ms.median)),
      f(Math.max(...rows.map((r) => r.actual_cli_ms.max))),
    ];
  }),
);
const cliStored = stats(
    burst.filter((r) => r.arm === "stored").map((r) => r.actual_cli_ms.median),
  ).median,
  cliMemory = stats(
    burst.filter((r) => r.arm === "memory").map((r) => r.actual_cli_ms.median),
  ).median;
text += `\nThe memory-arm CLI has no sync observer or Replica at all. It keeps the ordinary direct domain write and lets the server do its own later read. The stored-arm CLI computes and persists the Patch but does not consume the server stream or construct a delivery ring. The pooled group medians differ by ${f(cliStored - cliMemory)} ms, but this is not a reliable gain. The matched per-pair stored-minus-memory difference is ${summary(Array.from({ length: 5 }, (_, pair) => burst.find((r) => r.pair === pair && r.arm === "stored").actual_cli_ms.median - burst.find((r) => r.pair === pair && r.arm === "memory").actual_cli_ms.median))} ms and changes sign. One todo command therefore has no demonstrated wall-time gain on this loaded-machine run; a quiet paired CLI run is owed. This is a one-Task command; it includes startup and is not a guarantee for every todo command. An earlier burst pilot incorrectly ran an in-memory observer in the CLI as well; those numbers were discarded and are not the final table.\n\n`;
text += `\nThe burst is 300 real domain edits from a persistent compiled external process. It is not 300 independent CLI startups. Five real compiled CLI edits per arm per pair also passed; their process-startup cost is retained in burst.json. Stored emits every Patch and shifts computation into that writer; memory coalesces to consistent captured cursors and spends more CPU in the server. The concurrent Task-read measurement is one prepared SQL payload lookup, not the entire authenticated Task-details request. Poll busy times and Patch sizes are in burst.json.\n\nChoose memory provisionally. The paired write-latency difference is small beside run and operation variation. Memory avoids the durable content copy and its extra WAL and Snapshot-redaction work. Stored is attractive if external-burst server CPU becomes the limiting factor or restart catch-up must avoid Baselines; the present experiment has not established either requirement. A more selective reader or one combined batch Patch could change this decision.\n\n### Correctness and lifecycle\n\nThe compiled drive passed 115 Baseline comparisons per arm. It covers 100 generated edits, fan-out completion, a rejected stale edit, Copy, Dependency Delete with a preview fingerprint, Revert, recurrence and successor creation, reminder work, a normal Snapshot restore, Delete and Purge. The deliberately omitted computed record for a newly Ready descendant fails equality. Unchanged Task rows keep their identity. Both whole-list and indexed-edit reducers equal fresh Baselines throughout the measured operation mix.\n\nA concurrent-writer run exposed a prototype bug: it read consistent rows, then fetched a newer sequence outside that read. The Replica could be one commit behind while the observer believed it had caught up. The corrected observer advances only to the cursor captured in the read. The final wake runs compare the final Replica with a fresh Baseline after every burst. This does not substitute for a deterministic all-interleavings proof.\n\nNormal restore clears delivery state on generation change. Purge clears the ring and Replica, and the stored arm deletes its outbox and removes outbox copies from scratch Snapshots. This demonstrates the need for an erasure barrier, not comprehensive byte-erasure qualification. Old-client gaps require a Baseline. A restart initializes a Baseline in these prototypes. Stored outbox persistence exists, but historical cursor replay across an actual server restart was not timed.\n\nRestore after Purge is unqualified. Both arms hit the base Snapshot code's \`Restored Snapshot violates foreign keys\`. The redacted Snapshot contains task_tags rowid 79 referencing the erased Task. The fixture had no foreign-key violations before this sequence. The coordinator independently reproduced the same defect through the installed compiled CLI in a scratch HOME and assigned FIX-PURGE-RESTORE on another branch. This one check is blocked by a known product defect. The report keeps purge_restore_unproven and changes no product code. Full raw-file erasure, pending frames, overlays and detail-cache erasure remain owed.\n\nThe bounded serial subscription tests pass connection replacement, strict predecessor checks, duplicate reply/stream application, a generation/cursor caught-up marker, overflow recovery, remote rename/removal, and refusal of only the affected pending action. They are a reducer test, not app UI or action-overlay qualification. Some reply/stream controls reuse identical no-op/echo frames; real concurrent accepted write replies still need an end-to-end app test.\n\n## E2. Orders and views\n\n`;
const kinds = [...new Set(bench.results.map((x) => x.kind))];
text += table(
  [
    "Operation",
    "Whole bytes",
    "Edits bytes",
    "Whole produce ms",
    "Edits produce ms",
    "Whole apply ms",
    "Edits apply ms",
    "Changed lists",
  ],
  kinds.map((kind) => {
    const r = bench.results.filter((x) => x.kind === kind),
      a = r.map((x) => x.shapes.find((s) => s.shape === "whole")),
      b = r.map((x) => x.shapes.find((s) => s.shape === "edits"));
    return [
      kind,
      f(stats(a.map((x) => x.bytes)).median),
      f(stats(b.map((x) => x.bytes)).median),
      summary(a.map((x) => x.produce_ms)),
      summary(b.map((x) => x.produce_ms)),
      summary(a.map((x) => x.apply_ms)),
      summary(b.map((x) => x.apply_ms)),
      f(stats(a.map((x) => x.changed_lists)).median),
    ];
  }),
);
const order = bench.samples.find((x) => x.kind === "dependency-reorder");
text += `\nThe fan-out completion changes ${Object.keys(bench.samples.find((x) => x.kind === "complete").whole.computed).length} computed records. Midnight is a clock-only cursor change; no operation is fabricated in History. Switching the default list to Dependency order adds ${JSON.stringify(order.whole).length} whole-list bytes versus ${JSON.stringify(order.edits).length} edit bytes. This is an order-switch prototype, not a new Dependency mutation.\n\n`;
text += table(
  ["List representation", "Swift decode ms", "Swift apply ms"],
  ["whole", "edits"].map((kind) => {
    const r = swift.filter((x) => x.kind === kind);
    return [
      kind,
      summary(r.flatMap((x) => x.decode)),
      summary(r.flatMap((x) => x.apply)),
    ];
  }),
);
text += `\nChoose whole changed lists. Edits save bytes on the sparse changes, but these lists contain only 178 ids. Both reducers take a small fraction of a millisecond, and edits add positional validity rules. The synthetic Dependency-order switch and midnight sample are included in codec/retention evidence. Revisit edits for much larger current Profiles or a constrained network; eight Profiles of 178 Tasks do not measure that case.\n\n## E3. Ring size and recovery\n\n`;
text += table(
  [
    "Repeated operation",
    "One Patch bytes",
    "256 raw / encoded bytes",
    "Decoded serialized bytes",
    "Count at 1 MiB",
  ],
  ring
    .filter((x, i) => i < 9 || x.operation === "dependency-reorder")
    .map((x) => [
      x.operation,
      f(x.patch_bytes),
      f(x.raw_bytes) + " / " + f(x.encoded_bytes),
      f(x.decoded_serialized_bytes),
      x.count_at_1mib,
    ]),
);
text += `\nRaw JSON and UTF-8 encoded body sizes coincide for this ASCII fixture; there is no compression. Decoded serialized size is a runtime serialization measurement, not retained heap. The following separate GC observations retain 256 independently decoded Patches and estimate live heap change. They are implementation-specific and contain allocator/collection noise. Replica deltas retain 256 copies and divide by 256.\n\n`;
text += table(
  [
    "Mix",
    "Encoded ring bytes",
    "Decoded ring heap delta bytes",
    "Decoded Replica heap delta bytes",
  ],
  memory.map((x) => [
    x.kind,
    f(x.encoded_ring_bytes),
    `${f(x.ring_heap_delta_bytes.median)} (${f(x.ring_heap_delta_bytes.min)} to ${f(x.ring_heap_delta_bytes.max)})`,
    `${f(x.replica_heap_delta_per_copy_bytes.median)} (${f(x.replica_heap_delta_per_copy_bytes.min)} to ${f(x.replica_heap_delta_per_copy_bytes.max)})`,
  ]),
);
text += `\nChoose at most 256 Patches and 1 MiB of encoded ring data per active Profile, plus a separately accounted 1 MiB queue/in-flight budget. The observer enforces count and encoded bytes. The serial subscription control rejects a queue overflow. The live network prototype does not implement a complete byte budget on its socket buffers, so 2 MiB is a proposed accounting limit, not a proven total-memory ceiling. An oversized Patch should require a Baseline; a maximum individual-frame threshold still needs qualification.\n\nA subscriber catches up only if its exact cursor chain and generation remain available and catch-up is cheaper than a Baseline. Time alone is not expiration. Under an explicit one-operation-per-second model:\n\n`;
const reconnect = ring.find((x) => x.operation === "description");
text += table(
  ["Away", "Delivery", "Bytes", "Bun decode/apply ms"],
  reconnect.reconnect.map((x) => [
    x.seconds + " s",
    x.choice,
    f(x.bytes),
    `${f(x.time_ms.median)} / ${f(x.time_ms.p90)} / ${f(x.time_ms.p99)}`,
  ]),
);
text += `\nThese reconnect costs replay repeated measured Patch shapes with cursor rebasing, not historical network traffic. One hour with no writes can still catch up immediately; a fast burst can overflow in under a second. The worst measured mix is the batch edit. It is not the contract maximum of many 100,000-character descriptions. Both raw and decoded allocations and one in-flight Patch must be budgeted; count 256 by itself is insufficient.\n\n## E4. Decoding and application\n\n`;
text += table(
  [
    "Bun payload",
    "Bytes p50",
    "JSON parse ms, pair medians",
    "Schema/construct ms, pair medians",
    "Apply ms, pair medians",
  ],
  ["baseline", "whole", "edits"].map((kind) => {
    const r = codec.filter((x) => x.kind === kind);
    return [
      kind,
      f(stats(r.map((x) => x.bytes)).median),
      summary(r.map((x) => x.parse.median)),
      summary(r.map((x) => x.validate.median)),
      summary(r.map((x) => x.apply.median)),
    ];
  }),
);
text += table(
  ["Foundation Codable", "Decode/construct ms", "Apply ms"],
  ["baseline", "whole", "edits"].map((kind) => {
    const r = swift.filter((x) => x.kind === kind);
    return [
      kind,
      summary(r.flatMap((x) => x.decode)),
      summary(r.flatMap((x) => x.apply)),
    ];
  }),
);
const list = read("list-cost"),
  swiftList = read("swift-list");
text += `\nThe 132,000-byte comparison is a synthetic JSON list of 60 stored-shape Task rows, padded in the last description. It is not a captured production TaskView reply. Bun parsing pair-median p50 is ${f(stats(list.map((x) => x.parse.median)).median)} ms and validation/construction ${f(stats(list.map((x) => x.validate.median)).median)} ms. Foundation decode is ${summary(swiftList)} ms.\n\nKeep JSON and whole rows. Decoding these Baselines is milliseconds in Foundation and below one millisecond in warm Bun; the smaller Patches cost less. The Foundation benchmark uses typed Task content, computed records and lists, with generic Codable JSON for small metadata arrays. It is shaped like the generated client, not the generated production client itself. Swift apply uses value types and copy-on-write dictionaries. Parsing and object construction are separated in Bun; Foundation JSONDecoder combines them. No renderer-engine measurement was obtained. Bun is not evidence for Electron renderer timing.\n\nA separate CPU-profile run identified JSON parsing and Effect Schema traversal as the main timed codec work. Deep equality was outside timed regions and dominated the first whole-harness CPU capture, so a second capture reduced that verification work. No profiler run supplies the reported timing table.\n\n### Checked-read sensitivity\n\n`;
text += table(
  [
    "Extra indexed credential-row lookup",
    "Baseline ms, pair medians",
    "Memory read/diff ms, pair medians",
  ],
  [false, true].map((extra) => {
    const r = sensitivity.filter((x) => x.extra === extra);
    return [
      extra ? "one" : "none",
      summary(r.map((x) => x.baseline_ms.median)),
      summary(r.map((x) => x.memory_read_diff_ms.median)),
    ];
  }),
);
text += `\nThe sensitivity performs one indexed SELECT inside the consistent read. It does not implement the other worker's complete checked-read semantics or copy that work. Authorization changes can move E1 reply/Baseline times, memory-arm server CPU, E6 compute time and E7 absolute times. They should not change encoded bytes or list-reducer costs. The extra lookup alone is smaller than shared-machine variation here.\n\n## E5. Diagnostics proposal\n\nThe prototype emits projection, encoding and decode spans through the existing DiagnosticRecorder. Its scratch /diagnostics response includes the existing profiler and a content-free sync_experiment extension with Replica bytes, ring bytes/count and recent numeric observations. diagnostics.json is the captured real response. This is a proposal; no generated contract was changed.\n\nAdd a bounded sync object with these fields to the existing contract:\n\n- patch_bytes, patch_rows, patch_computed_records, patch_lists and patch_removed_rows, with count and bounded size histograms.\n- patch_compute_ms and patch_encode_ms, separated from wake_wait_ms, commit_to_send_ms and send_to_apply_ms.\n- client_decode_ms and client_apply_ms, labeled by client kind and observed process clock; no cross-clock subtraction without an explicit shared-clock capability.\n- ring_encoded_bytes, ring_decoded_estimate_bytes, ring_count, replica_encoded_bytes and replica_decoded_estimate_bytes.\n- queued_bytes and in_flight_bytes as separate gauges, plus overflow_count.\n- baseline_bytes, baseline_read_ms, baseline_decode_ms and baseline_apply_ms.\n- baseline_count_by_reason for start, gap, restart, generation_change, overflow and catchup_more_expensive.\n- applied_cursor_distance, caught_up and pending_action_count, without Task content or credential material.\n\nThe current prototype does not route every Swift apply/decode measurement back through DiagnosticRecorder, and the live socket queue gauges are not implemented. These proposed fields are not all demonstrated in the captured body. Existing profiler byte budgets must still bound them.\n\n## E6. Learning of a commit\n\nThe following final run corrects the interim run's phase-biased arrival schedule and watches the WAL file itself. Commit times use a shared machine clock immediately after the external domain command returns. Detection includes a consistent read, diff and local reducer; it does not include a network hop. E7 separately measures the network and client path after own commits.\n\n`;
text += table(
  [
    "Own commit, immediate in-process observer",
    "Commit to server send handoff ms",
    "Commit to subscriber apply ms",
  ],
  ["typescript", "swift"].map((client) => {
    const rows = transport.filter(
      (r) => r.client === client && r.arm === "sse",
    );
    return [
      client + " over SSE",
      summary(rows.flatMap((r) => r.commit_to_send_ms)),
      summary(rows.flatMap((r) => r.times)),
    ];
  }),
);
text +=
  "\nThe own-write prototype calls its observer immediately after the transaction commits, then sends the Patch on the already open subscription. Send handoff is the timestamp after enqueue or ws.send returns, not an observed kernel/network departure. The present profiler cannot see that physical boundary. This separates the measured server compute/send interval from the subscriber-applied result; there is no 250 ms sleep in this path. It does not measure a future Effect PubSub scheduler.\n\n";
text += table(
  [
    "External wake",
    "Commit to local apply ms",
    "Burst Patches, five runs",
    "Missed/normal wake ms",
  ],
  ["poll250", "data50", "data20", "data10", "wal", "hint"].map((arm) => {
    const r = wake.filter((x) => x.arm === arm);
    return [
      arm,
      summary(r.flatMap((x) => x.latencies)),
      r.map((x) => x.burst.patches).join(", "),
      summary(r.map((x) => x.missed_ms)),
    ];
  }),
);
text += `\nThe hint arm omits the hint once per run and recovers through its one-second fallback. The WAL missed-wake column is an ordinary watched commit, not a disabled notifier; suppressing or losing a WAL notification was not injected. Duplicate checks publish no extra Patch. Each run performs checkpoint(TRUNCATE), but does not prove a later commit through a replaced WAL inode. The one-second fallback is an experiment parameter; it exceeds the owner's 300 ms tail goal when it is needed. Use one shared fallback of at most 250 ms in the proposed product, then measure its mixed-workload tail. A 20 ms data_version check is the measured alternative without CLI cooperation.\n\n`;
text += table(
  [
    "Idle observer model",
    "Subscribers",
    "CPU ms per second",
    "Wake-ups per second",
  ],
  ["per-subscription250", "shared20"].flatMap((arm) =>
    [1, 2, 5].map((n) => {
      const r = idle.filter((x) => x.arm === arm && x.subscribers === n);
      return [
        arm,
        n,
        summary(r.map((x) => x.cpu_ms / (x.elapsed_ms / 1000))),
        summary(r.map((x) => x.wakes / (x.elapsed_ms / 1000))),
      ];
    }),
  ),
);
text += `\nIdle controls use actual SQLite reads and timers. These are finite one-second windows including timer startup, so the last boundary tick can be excluded; they are not exact steady-state frequency estimates. They model today's per-subscription sleepers versus a shared observer; they do not run the complete production SSE authorization/heartbeat loop. A shared observer's number of database wake checks stays constant as subscribers increase.\n\nChoose immediate in-process signals for own writes. For external writes, choose the measured loopback hint and reject this WAL-watch implementation. Its median was dominated by the one-second fallback. The durability source remains op_log and a captured consistent read. Ship neither a watch-only path nor a hint-only path. A 20 ms data_version observer is the measured fallback option when a fast watch cannot be made reliable. A CLI hint needs a loopback endpoint and a best-effort call after commit, adds no data authority, and must never make a successful commit fail. A filesystem watch changes no public contract but needs replacement/checkpoint/restart qualification.\n\n## E7. SSE versus WebSocket\n\nBoth arms use the same domain writes, in-memory Patch computation and immediate own-commit wake on the same Bun loopback server. SSE uses id/event/data framing matching the existing stream; it is an experiment route, not the production Effect HttpApi adapter. Commit-to-apply includes Patch production and client decoding, not UI rendering.\n\n`;
text += table(
  [
    "Client",
    "Transport",
    "Commit to apply ms",
    "Five pair medians ms",
    "Application/frame bytes per message",
  ],
  ["typescript", "swift"].flatMap((client) =>
    ["sse", "ws"].map((arm) => {
      const r = transport.filter((x) => x.client === client && x.arm === arm);
      return [
        client,
        arm,
        summary(r.flatMap((x) => x.times)),
        r.map((x) => f(stats(x.times).median)).join(", "),
        f(stats(r.map((x) => x.sent_bytes / 100)).median),
      ];
    }),
  ),
);
const delta = (client) =>
  stats(
    transport
      .filter((x) => x.client === client && x.arm === "sse")
      .flatMap((x) => x.times),
  ).median -
  stats(
    transport
      .filter((x) => x.client === client && x.arm === "ws")
      .flatMap((x) => x.times),
  ).median;
text += `\nWebSocket minus SSE has no consistent paired latency win. Pooled median saving for WebSocket is ${f(delta("typescript"))} ms in TypeScript and ${f(delta("swift"))} ms in Swift. Both effects are smaller than variation among pairs. The encoded WebSocket estimate includes its short unmasked server-frame header; SSE counts id/event/data delimiters. HTTP headers, TCP/IP, TLS, acknowledgments and kernel buffers are excluded.\n\n`;
text += table(
  ["Request-overhead control", "HTTP round trip ms", "Socket round trip ms"],
  ["read", "write"].map((kind) => [
    kind,
    ...["http", "ws"].map((arm) =>
      summary(
        requests
          .filter((x) => x.kind === kind && x.arm === arm)
          .flatMap((x) => x.times),
      ),
    ),
  ]),
);
text += `\nThe request-overhead control echoes a representative row or Patch. Its write increments a counter, not SQLite. It isolates a small framing/dispatch opportunity and cannot establish the benefit of moving real authenticated reads/writes onto a socket. Both transports keep one connection open during the measured warm runs. Full idle CPU, heartbeat timeout, reconnect after a real drop or machine sleep, slow-client backpressure, and live Profile-switch timing were not measured. Connection-epoch, cursor-gap, caught-up and byte-overflow reducer controls passed separately.\n\nKeep SSE. The measured transport difference is below one millisecond in both clients, while wake and server computation are the larger costs. A WebSocket command/subscription vocabulary would sit outside ADR-0003's single OpenAPI contract and needs an owner-approved contract/ADR decision. It needs hand-written frame decoding and dispatch in Swift and TypeScript, upgrade authentication and revocation behavior, a subscription lifecycle, request correlation, liveness and byte budgets. verify-sse would need a transport matrix covering both stream parsers, credential revocation, generation changes, resumed chains, slow clients, Profile replacement and receipt ordering. The present measurements do not justify that added protocol.\n\n## What remains unmeasured or unqualified\n\nNo product latency or rendered-frame target is claimed. No app was launched. Owed are the actual Electron renderer codec, actual generated Swift decoder, all accepted commands and scheduler snooze wakes, attachment/import/Profile-deletion matrices, all interleavings during reads, complete reply-first/stream-first app behavior, erased content in raw disk and queued frames, old CLI/restart recovery timing, the largest permitted Patch, real network catch-up, comprehensive WAL notification failure/replacement controls, socket backpressure and byte accounting, machine sleep/reconnect/Profile switch, and authenticated HTTP-versus-socket domain requests. The post-Purge Snapshot foreign-key failure blocks that restore case. The recommendations can guide the next design, but these prototypes cannot be merged or used to claim the protocol is correct for every command.\n\n## Reproduction and cleanup\n\nThe project-local verify-sync-experiment skill was created and its compiled correctness and reducer paths were executed. Experimental TypeScript typecheck passes. Full pnpm check was not required and was not run. No child reviewer was launched, per the explicit no-children instruction; the standing no-comments delegation step therefore could not run. Comments were reviewed locally.\n\nEvidence stays local and ignored. The report and reusable experiment inputs are tracked. The builder records its source digest and executable digests, and reuses a matching digest. Compile temporaries and owned closed scratch state were cleaned; cleanup.json records final counts and free space. No other worker's process or files were removed. The measured executables were compiled from the experiment source at the recorded build digest; the report commit itself is not a claim that every binary's embedded build id equals that commit.\n`;
const cleanup = read("cleanup");
text += `\nCleanup removed ${cleanup.compile_temporaries_removed} closed Bun compile temporaries, ${f(cleanup.compile_temporary_bytes_removed)} file bytes, and ${cleanup.owned_failed_scratch_removed.length} owned failed scratch directories. No open compile file was deleted. Remaining free space was ${f(Number(cleanup.disk.trim().split("\n")[1].split(/\s+/)[3]) / 1048576)} GiB, above the 30 GiB floor.\n`;
mkdirSync("docs/decisions/ui-speed", { recursive: true });
writeFileSync("docs/decisions/ui-speed/sync-experiment-report.md", text);
console.log("report written");
