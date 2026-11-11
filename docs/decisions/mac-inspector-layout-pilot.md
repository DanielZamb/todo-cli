# Inspector layout pilot

One pilot per revision did not reproduce the owner's captured 68-second
beachball with the 100,000-character filler Task. The native description editor
existed and held the requested character count. The production RootView and
inspector were hosted in an unordered scratch window. This measures public
NSHostingView.layout callbacks, not every private SwiftUI layout pass or a
physical screen presentation. It cannot refute the live thread samples.

The command is `apps/macos/PerfMeasurement/run.py <new-evidence-directory>
--runs 1 --ref 225b512f --ref e69230f9 --owner-fixture --inspector-layout
--max-start-load 0`. The fixture stays synthetic and the vault traps access.
The driver reads the current Version before each repeated CLI edit. The normal
frozen count session is unchanged. Both sessions completed, with 20 measured
steps each and no errors. This is a pilot, not the five alternating runs needed
for an optimization verdict.

| Description | Action | Old callbacks / maximum ms | New callbacks / maximum ms |
| --- | --- | --- | --- |
| 5,000 characters | Refresh | 3 / 39.3 | 9 / 42.0 |
| 5,000 characters | Stream operation | 3 / 3.8 | 8 / 5.8 |
| 5,000 characters | Idle reconnect | 12 / 4.8 | 16 / 7.5 |
| 100,000 characters | Refresh | 3 / 41.7 | 9 / 45.8 |
| 100,000 characters | Stream operation | 3 / 4.2 | 8 / 5.6 |
| 100,000 characters | Idle reconnect | 12 / 5.2 | 16 / 8.2 |

The current client caused more observed root callbacks for these actions in
this pilot. Callback cost did not grow into the live symptom. Opening the
100,000-character inspector had a longest run-loop awake interval of about
174 ms old and 254 ms new. Whole-root private work outside the callback is not
attributed by that callback timer. No improvement is claimed.

The [small JSON receipt](../evidence/mac-perf/inspector-layout-summary.json)
includes all 1,260, 5,000, 20,000 and 100,000-character steps and host load.
Raw samples remain in the local run store. The content-independent editor size
and avoiding unchanged inspector publications remain early C4 hypotheses.
