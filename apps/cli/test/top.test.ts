import { DiagnosticsSnapshot } from "@todo/domain";
import { Schema } from "effect";
import { expect, it } from "vitest";
import { diagnosticsOutput } from "../src/diagnostics.ts";
import { topPanes } from "../src/top.ts";

const snapshot = Schema.decodeUnknownSync(DiagnosticsSnapshot)({
  generated_at: "2026-11-11T00:00:00Z",
  poll_interval_ms: 1000,
  runtime: {
    version: "0.1.0",
    started_at: "2026-11-11T00:00:00Z",
    uptime_seconds: 1,
    memory_bytes: 1024,
  },
  profiles: [],
  deleted_profiles: [],
  storage: {
    database_bytes: 0,
    wal_bytes: 0,
    snapshot_bytes: 0,
    external_id_tasks: 0,
    attachments: 0,
    attachment_store_bytes: 0,
    last_snapshot: null,
    restore_generation: "initial",
    tables: [],
    entities: [],
  },
  operations: {
    total: 3,
    committed: 3,
    rejected: 0,
    window_seconds: 60,
    per_second: 1,
    samples: [],
    recent: [],
  },
  clients: [],
  credentials: [],
  errors: [],
  latency: { window_seconds: 300, capacity: 2048, routes: [], samples: [] },
  scheduler: {
    next_wake_at: null,
    pending_reminders: 0,
    last_reminder_fired: null,
  },
});

const cases = [
  { label: "rising series", samples: [8, 4, 1], line: "▁▄█" },
  { label: "empty series", samples: [], line: "Collecting samples…" },
  { label: "one sample", samples: [8], line: "█" },
  {
    label: "60 samples",
    samples: Array.from({ length: 60 }, (_, i) => 60 - i),
    line: "▁▁▁▁▁▁▁▁▂▂▂▂▂▂▂▂▂▃▃▃▃▃▃▃▃▄▄▄▄▄▄▄▄▄▅▅▅▅▅▅▅▅▆▆▆▆▆▆▆▆▆▇▇▇▇▇▇▇▇█",
  },
];

for (const title of ["Operations", "Latency"])
  it.each(cases)(
    `${title} plots $label oldest to newest without mutating input`,
    ({ samples, line }) => {
      const values = Object.freeze([...samples]);
      const input = {
        ...snapshot,
        operations: { ...snapshot.operations, samples: values },
        latency: { ...snapshot.latency, samples: values },
      };
      const pane = topPanes(input, null).find((pane) => pane.title === title);
      expect(pane?.lines[1]).toBe(line);
      expect(input.operations.samples).toEqual(samples);
      expect(input.latency.samples).toEqual(samples);
      expect(input.operations.total).toBe(3);
      expect(input.operations.committed).toBe(3);
    },
  );

for (const follow of [false, true])
  it(`keeps server sample order in ${follow ? "NDJSON" : "JSON"} after plotting`, () => {
    const values = Object.freeze([8, 4, 1]);
    const input = {
      ...snapshot,
      operations: { ...snapshot.operations, samples: values },
      latency: { ...snapshot.latency, samples: values },
    };
    topPanes(input, null);
    const output = Schema.decodeUnknownSync(
      Schema.fromJsonString(DiagnosticsSnapshot),
    )(diagnosticsOutput(input, "json", follow));
    expect(output.operations.samples).toEqual([8, 4, 1]);
    expect(output.latency.samples).toEqual([8, 4, 1]);
    expect(output.operations.total).toBe(3);
    expect(output.operations.committed).toBe(3);
  });
