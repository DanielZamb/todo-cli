# Server projection reads

## Authorization revision after review

Product: `219749f2ab4ed40fdf7f257c991385a2057bf215`. Base delivery reviewed: `98511eff3673239ae4edd6432a1c40c2f90f6080`. Contract remains `78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289`.

The unchanged seat probe failed with exit 1 on both exact e69230f9 product sources and 98511eff. List, Show and graph returned work-more data under a work-scoped Token. The hole was inherited. The same unchanged compiled probe passes with exit 0 on this product; its graph and Show return ab-prefix in work. The copied probe bytes are unchanged; only its private fixture paths were relocated. All databases and credentials remain scratch-only.

[ReadAuthority](../../../packages/domain/src/auth/authorized-read.ts) is a nominal value with a frozen Profile, checked credential scope and owned, parsed, recursively frozen fields. Credential secrets use private fields. Raw AccessRequest objects cannot satisfy the graph, stream or owner Snapshot read-port types. The auth transaction constructs the value after the credential check, then executes its projection callback with it. Graph/search continuations, Show and image selection, History, planning filters, lookup prefix, Quick-add payload, Snapshot id and stream subscription use those bound values through later hooks and yields. Missing-Task recovery also uses the bound Profile and id. The full-state readers used by import, transfer metadata and Revert retain their authorization/check ordering while owning their read inputs.

Profile summaries now count exactly the checked Profile rows and ids. The grouped SELECT starts from those ids through json_each; it does not ask the credential to rediscover a visible set. A literal control inserts a new Profile during the second credential-use callback: the current reply contains only work, while the next storage read proves late was inserted. Profile names/timestamps come from the checked rows too.

### Mutation and overlap controls

The new domain regression preceded the implementation. It failed at the literal scoped-Task assertion, then passed for list/search, Show, graph, views and History with the real credential-use callback or graph hook mutating the caller's Profile, Task id and filters. A separate same-Profile Task id mutation proves History retains the requested id. Runtime Reflect.set checks prove the authority and nested arrays/filters are frozen without freezing the caller. Compile-time assertions reject a raw AccessRequest at graph, stream and owner Snapshot ports.

The compiled verification server wraps actual decoded handler arguments. It mutates them from the real diagnostics callback, or immediately after construction of the checked value and at graph/Snapshot/stream ports. It runs no replacement auth or query algorithm. Each mode compares all 1,267 lifecycle reply/status pairs and auth evidence with an uninstrumented candidate. Receipts require actual mutations of Profile, Task, Attachment and Snapshot ids, lookup prefix and quick-add text; they also list view, time and stream generation/cursor mutations by handler shape. Successful Snapshot Show and managed PNG bytes are included. Diagnostics' volatile process fields retain the original exclusion.

The same compiled server runs two scoped Tokens for different Profiles concurrently. Ten request pairs per mode return the literal aa-work/work and aa-personal/personal results. A graph-port delay forces overlap. Every mode records ten overlaps; both mutation modes record actual changed fields. The final run has 60 successful responses across normal, credential-callback and port-hook modes. No process-wide current-authorization variable exists.

The complete e69230f9-to-candidate differential was repeated on all 57 fixtures: 23,880 original-checkpoint pairs plus 1,267 lifecycle pairs, 25,147 per side, with byte-identical replies and equal auth evidence. Root attempt 9 ran the exact standing lock after the disk guard and exited 0: 391 domain, 69 CLI, 32 server and 168 Electron tests, one existing skip.

### Paired timings on the repaired product

The same 18 corners, two request orders, five alternating fresh-process pairs and three passes produced 8,640 validated HTTP 200 responses. Every candidate observation decoded zero operation entries. These instrumented handler intervals are medians with min/max ranges in milliseconds. Both binaries use real clocks and the normal scheduler. The sweep ran after this worker's builds and functional/formal checks ended, under one-minute boundary loads 1.89 to 2.94 on 10 logical CPUs. No pressure workers or settings changed. Host activity from other work was uncontrolled. The limiter removed remains unrelated operation materialization, with the earlier independent CPU profile and current decode counters as evidence; the separate post-fix CPU shares are not measured. First pass is each route's first call in that process and may benefit from earlier routes. Warm is pass two. No input-to-render or p99 claim follows.

On the synthetic 178-total-Task/eight-Profile/2,234-operation owner shape, warm /profiles was 120.12 [119.49, 124.83] ms before and 0.28 [0.27, 0.29] ms after. The eight-handler sum was 228.28 [227.87, 235.30] ms before and 4.42 [4.18, 4.56] ms after.

| Fixture | Warm /profiles before | After | Warm eight-handler sum before | After |
| --- | --- | --- | --- | --- |
| n15-p1-large0-h32 | 0.77 [0.72, 0.92] | 0.13 [0.13, 0.17] | 4.55 [4.25, 6.03] | 1.44 [1.34, 1.48] |
| n15-p1-large0-h2048 | 11.49 [10.82, 20.66] | 0.12 [0.12, 0.14] | 96.02 [92.14, 107.92] | 1.08 [1.06, 1.31] |
| n15-p1-large1-h32 | 0.96 [0.91, 0.98] | 0.13 [0.12, 0.14] | 7.64 [7.48, 8.02] | 3.23 [3.20, 3.52] |
| n15-p1-large1-h2048 | 11.56 [10.49, 16.96] | 0.13 [0.11, 0.17] | 93.50 [92.89, 96.20] | 1.59 [1.48, 1.99] |
| n15-p8-large0-h32 | 8.15 [7.83, 8.61] | 0.23 [0.23, 0.24] | 16.22 [15.47, 17.77] | 1.24 [1.22, 1.31] |
| n15-p8-large0-h2048 | 93.23 [90.27, 96.20] | 0.23 [0.22, 0.25] | 178.53 [173.16, 192.80] | 1.16 [1.12, 1.45] |
| n15-p8-large1-h32 | 13.21 [12.15, 15.37] | 0.23 [0.23, 0.25] | 23.88 [23.18, 26.59] | 3.45 [3.30, 3.52] |
| n15-p8-large1-h2048 | 95.69 [93.89, 98.59] | 0.25 [0.23, 0.28] | 181.67 [178.17, 183.33] | 1.67 [1.54, 1.76] |
| n178-p1-large0-h32 | 1.60 [1.55, 1.70] | 0.23 [0.20, 0.24] | 16.44 [15.89, 17.15] | 4.05 [3.93, 4.11] |
| n178-p1-large0-h2048 | 16.52 [15.44, 18.70] | 0.20 [0.19, 0.21] | 123.10 [118.40, 124.50] | 3.91 [3.73, 4.00] |
| n178-p1-large1-h32 | 1.97 [1.93, 1.99] | 0.22 [0.20, 0.30] | 19.49 [19.34, 19.77] | 5.82 [5.67, 6.59] |
| n178-p1-large1-h2048 | 15.56 [15.02, 17.36] | 0.21 [0.20, 0.23] | 127.77 [124.47, 129.56] | 4.41 [4.08, 4.50] |
| n178-p8-large0-h32 | 84.92 [82.84, 88.14] | 0.87 [0.84, 0.90] | 166.66 [166.20, 170.49] | 4.53 [4.45, 4.62] |
| n178-p8-large0-h2048 | 196.49 [192.75, 200.35] | 0.80 [0.79, 0.82] | 372.43 [371.13, 378.77] | 4.34 [4.19, 4.40] |
| n178-p8-large1-h32 | 87.55 [86.49, 88.96] | 0.90 [0.85, 1.33] | 172.33 [165.85, 175.13] | 7.84 [6.93, 7.88] |
| n178-p8-large1-h2048 | 194.09 [193.03, 200.18] | 0.86 [0.82, 0.92] | 367.31 [362.57, 378.76] | 4.89 [4.70, 5.38] |
| n178-p8-empty-large0-h2048 | 120.31 [118.02, 122.37] | 0.30 [0.26, 0.30] | 228.53 [226.11, 233.57] | 4.14 [4.08, 5.34] |
| n178-p8-empty-large1-h2048 | 120.12 [119.49, 124.83] | 0.28 [0.27, 0.29] | 228.28 [227.87, 235.30] | 4.42 [4.18, 4.56] |

| Fixture / route | First pass before | After | Warm before | After | Profiles-last warm before | After |
| --- | --- | --- | --- | --- | --- | --- |
| n15-p1-large0-h32 / profiles | 2.38 [2.27, 2.68] | 1.40 [1.35, 1.57] | 0.77 [0.72, 0.92] | 0.13 [0.13, 0.17] | 0.47 [0.46, 2.13] | 0.13 [0.12, 0.22] |
| n15-p1-large0-h32 / tags | 0.94 [0.86, 0.96] | 0.33 [0.32, 0.36] | 0.52 [0.49, 0.53] | 0.10 [0.09, 0.11] | 0.63 [0.54, 0.69] | 0.10 [0.08, 0.37] |
| n15-p1-large0-h32 / tasks | 1.36 [1.33, 1.50] | 0.87 [0.84, 0.91] | 0.64 [0.61, 0.77] | 0.27 [0.26, 0.31] | 0.67 [0.64, 0.75] | 0.31 [0.28, 0.59] |
| n15-p1-large0-h32 / overdue | 1.00 [0.97, 1.03] | 0.58 [0.54, 0.78] | 0.51 [0.49, 0.56] | 0.23 [0.18, 0.25] | 0.55 [0.49, 0.60] | 0.20 [0.18, 0.74] |
| n15-p1-large0-h32 / projects | 0.68 [0.65, 0.76] | 0.20 [0.17, 0.24] | 0.48 [0.47, 0.51] | 0.09 [0.08, 0.12] | 0.48 [0.45, 0.51] | 0.11 [0.07, 0.39] |
| n15-p1-large0-h32 / inbox | 0.61 [0.58, 0.62] | 0.28 [0.28, 0.29] | 0.52 [0.47, 0.56] | 0.22 [0.21, 0.25] | 0.52 [0.51, 0.60] | 0.28 [0.22, 0.71] |
| n15-p1-large0-h32 / today | 0.67 [0.57, 0.78] | 0.21 [0.20, 0.25] | 0.46 [0.43, 0.48] | 0.17 [0.16, 0.23] | 0.44 [0.43, 0.51] | 0.23 [0.18, 0.63] |
| n15-p1-large0-h32 / scheduled | 0.63 [0.59, 0.85] | 0.21 [0.21, 0.29] | 0.46 [0.44, 2.11] | 0.16 [0.15, 0.19] | 0.45 [0.43, 0.47] | 0.17 [0.16, 0.32] |
| n15-p1-large0-h2048 / profiles | 15.69 [13.41, 18.55] | 1.47 [1.45, 1.54] | 11.49 [10.82, 20.66] | 0.12 [0.12, 0.14] | 12.03 [11.71, 13.12] | 0.12 [0.10, 0.17] |
| n15-p1-large0-h2048 / tags | 14.89 [14.04, 20.49] | 0.35 [0.33, 0.36] | 12.09 [11.31, 13.20] | 0.09 [0.09, 0.13] | 10.73 [10.56, 10.93] | 0.09 [0.09, 0.13] |
| n15-p1-large0-h2048 / tasks | 13.93 [13.62, 19.86] | 0.79 [0.79, 0.81] | 12.30 [12.03, 12.94] | 0.21 [0.20, 0.24] | 12.31 [12.18, 12.56] | 0.23 [0.22, 0.35] |
| n15-p1-large0-h2048 / overdue | 12.19 [11.93, 13.13] | 0.53 [0.53, 0.57] | 11.08 [10.65, 11.66] | 0.15 [0.14, 0.17] | 11.99 [11.74, 12.07] | 0.15 [0.14, 0.23] |
| n15-p1-large0-h2048 / projects | 13.97 [12.22, 16.03] | 0.18 [0.17, 0.25] | 12.68 [11.92, 13.01] | 0.07 [0.06, 0.08] | 10.76 [10.64, 10.98] | 0.08 [0.07, 0.10] |
| n15-p1-large0-h2048 / inbox | 13.41 [11.98, 15.34] | 0.22 [0.21, 0.25] | 12.35 [10.56, 12.73] | 0.17 [0.16, 0.20] | 11.92 [11.62, 12.25] | 0.19 [0.17, 0.25] |
| n15-p1-large0-h2048 / today | 11.28 [10.75, 12.13] | 0.17 [0.16, 0.17] | 11.97 [11.09, 12.44] | 0.14 [0.14, 0.22] | 10.48 [10.20, 12.03] | 0.17 [0.13, 0.17] |
| n15-p1-large0-h2048 / scheduled | 12.61 [12.28, 21.88] | 0.17 [0.17, 0.26] | 12.83 [11.88, 13.62] | 0.14 [0.13, 0.23] | 12.19 [11.28, 12.24] | 0.15 [0.14, 0.17] |
| n15-p1-large1-h32 / profiles | 2.89 [2.83, 3.20] | 1.47 [1.43, 1.48] | 0.96 [0.91, 0.98] | 0.13 [0.12, 0.14] | 0.78 [0.74, 0.80] | 0.15 [0.13, 0.16] |
| n15-p1-large1-h32 / tags | 1.34 [1.28, 1.41] | 0.34 [0.34, 0.43] | 0.80 [0.78, 0.93] | 0.09 [0.09, 0.09] | 0.84 [0.79, 0.92] | 0.09 [0.08, 0.10] |
| n15-p1-large1-h32 / tasks | 3.48 [3.25, 3.50] | 1.00 [0.95, 1.02] | 1.02 [0.96, 1.07] | 0.35 [0.34, 0.37] | 1.01 [0.94, 1.09] | 0.38 [0.36, 0.40] |
| n15-p1-large1-h32 / overdue | 1.41 [1.38, 1.58] | 0.67 [0.64, 0.72] | 1.78 [1.41, 1.93] | 0.28 [0.27, 0.31] | 0.79 [0.76, 0.82] | 0.28 [0.27, 0.34] |
| n15-p1-large1-h32 / projects | 0.98 [0.96, 1.03] | 0.19 [0.18, 0.20] | 0.86 [0.84, 1.06] | 0.07 [0.07, 0.08] | 1.88 [1.79, 1.97] | 0.08 [0.07, 0.10] |
| n15-p1-large1-h32 / inbox | 1.01 [0.94, 1.09] | 0.37 [0.36, 0.40] | 0.81 [0.75, 0.93] | 0.26 [0.25, 0.27] | 0.98 [0.94, 1.05] | 0.31 [0.27, 0.32] |
| n15-p1-large1-h32 / today | 1.18 [1.12, 2.40] | 0.30 [0.29, 0.37] | 0.70 [0.69, 0.81] | 1.73 [1.67, 1.88] | 0.74 [0.72, 0.77] | 1.67 [1.63, 1.79] |
| n15-p1-large1-h32 / scheduled | 2.04 [1.18, 2.41] | 0.31 [0.29, 0.33] | 0.72 [0.69, 0.77] | 0.35 [0.32, 0.40] | 0.73 [0.72, 0.76] | 0.33 [0.30, 0.37] |
| n15-p1-large1-h2048 / profiles | 16.27 [15.56, 16.66] | 1.46 [1.43, 1.47] | 11.56 [10.49, 16.96] | 0.13 [0.11, 0.17] | 11.76 [11.46, 12.17] | 0.11 [0.10, 0.16] |
| n15-p1-large1-h2048 / tags | 12.62 [12.39, 14.96] | 0.34 [0.34, 0.35] | 11.73 [11.26, 13.24] | 0.09 [0.08, 0.10] | 11.20 [11.11, 12.76] | 0.08 [0.08, 0.10] |
| n15-p1-large1-h2048 / tasks | 13.13 [12.74, 13.49] | 0.89 [0.87, 0.95] | 12.43 [11.96, 12.48] | 0.32 [0.30, 0.34] | 13.49 [11.96, 13.58] | 0.32 [0.31, 0.33] |
| n15-p1-large1-h2048 / overdue | 13.38 [13.17, 13.91] | 0.63 [0.61, 0.65] | 11.12 [10.68, 11.21] | 0.23 [0.23, 0.46] | 11.89 [10.63, 12.02] | 0.23 [0.22, 0.27] |
| n15-p1-large1-h2048 / projects | 13.53 [13.26, 14.21] | 0.17 [0.17, 0.26] | 11.78 [11.68, 12.17] | 0.07 [0.06, 0.13] | 10.77 [10.50, 11.58] | 0.07 [0.07, 0.10] |
| n15-p1-large1-h2048 / inbox | 12.27 [11.93, 14.36] | 0.32 [0.30, 0.42] | 10.84 [10.76, 10.99] | 0.27 [0.24, 0.32] | 11.73 [11.53, 12.22] | 0.26 [0.26, 0.29] |
| n15-p1-large1-h2048 / today | 12.27 [11.09, 13.00] | 0.26 [0.25, 1.65] | 11.93 [11.76, 12.33] | 0.23 [0.22, 0.27] | 10.62 [10.32, 13.65] | 0.22 [0.21, 0.23] |
| n15-p1-large1-h2048 / scheduled | 12.44 [11.99, 13.35] | 0.28 [0.26, 0.44] | 10.77 [10.60, 12.26] | 0.22 [0.20, 0.25] | 11.71 [10.70, 12.23] | 0.22 [0.19, 1.48] |
| n15-p8-large0-h32 / profiles | 12.97 [12.82, 13.05] | 1.62 [1.54, 1.63] | 8.15 [7.83, 8.61] | 0.23 [0.23, 0.24] | 8.54 [8.27, 9.49] | 0.21 [0.20, 0.21] |
| n15-p8-large0-h32 / tags | 1.33 [1.30, 1.54] | 0.33 [0.33, 0.35] | 1.04 [0.96, 2.46] | 0.09 [0.09, 0.09] | 1.18 [1.11, 1.29] | 0.09 [0.09, 0.11] |
| n15-p8-large0-h32 / tasks | 1.96 [1.88, 2.00] | 0.81 [0.78, 0.82] | 2.45 [1.32, 2.48] | 0.22 [0.22, 0.23] | 1.36 [1.33, 1.49] | 0.25 [0.24, 0.26] |
| n15-p8-large0-h32 / overdue | 1.43 [1.40, 1.62] | 0.55 [0.55, 0.57] | 1.05 [0.97, 1.12] | 0.15 [0.14, 0.17] | 1.01 [1.00, 1.17] | 0.15 [0.15, 0.16] |
| n15-p8-large0-h32 / projects | 1.11 [1.08, 1.28] | 0.18 [0.17, 0.30] | 0.94 [0.93, 1.05] | 0.07 [0.06, 0.07] | 1.02 [0.96, 1.09] | 0.07 [0.07, 0.12] |
| n15-p8-large0-h32 / inbox | 1.06 [1.02, 1.20] | 0.24 [0.23, 0.27] | 1.00 [1.00, 1.10] | 0.20 [0.18, 0.21] | 1.20 [1.14, 1.32] | 0.18 [0.18, 0.22] |
| n15-p8-large0-h32 / today | 1.03 [0.98, 2.33] | 0.18 [0.17, 0.20] | 0.95 [0.94, 1.07] | 0.14 [0.14, 0.14] | 1.02 [0.98, 1.09] | 0.16 [0.16, 0.17] |
| n15-p8-large0-h32 / scheduled | 2.35 [1.42, 2.41] | 0.18 [0.17, 0.18] | 0.93 [0.92, 1.05] | 0.14 [0.13, 0.20] | 1.00 [0.98, 1.14] | 0.14 [0.13, 0.17] |
| n15-p8-large0-h2048 / profiles | 103.31 [96.63, 104.29] | 1.59 [1.57, 1.65] | 93.23 [90.27, 96.20] | 0.23 [0.22, 0.25] | 96.17 [93.38, 97.65] | 0.20 [0.19, 0.21] |
| n15-p8-large0-h2048 / tags | 12.07 [11.43, 12.33] | 0.35 [0.34, 0.36] | 12.36 [11.89, 12.75] | 0.09 [0.08, 0.12] | 11.76 [11.55, 14.19] | 0.09 [0.09, 0.10] |
| n15-p8-large0-h2048 / tasks | 13.51 [13.25, 13.89] | 0.75 [0.74, 0.79] | 12.83 [11.04, 13.39] | 0.21 [0.20, 0.24] | 12.96 [11.80, 14.05] | 0.22 [0.22, 0.22] |
| n15-p8-large0-h2048 / overdue | 12.00 [11.32, 13.37] | 0.53 [0.51, 0.54] | 11.74 [11.31, 12.63] | 0.14 [0.13, 0.16] | 12.18 [11.40, 12.81] | 0.15 [0.14, 0.15] |
| n15-p8-large0-h2048 / projects | 13.35 [11.44, 13.44] | 0.18 [0.17, 0.20] | 13.09 [10.55, 13.49] | 0.07 [0.06, 0.08] | 11.91 [10.91, 12.81] | 0.07 [0.07, 0.08] |
| n15-p8-large0-h2048 / inbox | 13.00 [10.60, 13.62] | 0.22 [0.21, 0.29] | 11.41 [10.67, 11.99] | 0.17 [0.16, 0.27] | 12.07 [11.32, 12.94] | 0.17 [0.16, 0.17] |
| n15-p8-large0-h2048 / today | 12.00 [11.90, 12.10] | 0.17 [0.16, 0.21] | 12.16 [11.84, 15.95] | 0.13 [0.13, 0.17] | 12.37 [11.96, 12.69] | 0.13 [0.12, 0.14] |
| n15-p8-large0-h2048 / scheduled | 11.22 [11.18, 12.95] | 0.17 [0.16, 0.19] | 12.01 [11.09, 16.95] | 0.13 [0.12, 0.15] | 11.90 [11.34, 12.75] | 0.13 [0.12, 0.13] |
| n15-p8-large1-h32 / profiles | 16.21 [15.56, 16.71] | 1.59 [1.58, 1.61] | 13.21 [12.15, 15.37] | 0.23 [0.23, 0.25] | 12.45 [11.12, 12.62] | 0.24 [0.23, 0.26] |
| n15-p8-large1-h32 / tags | 2.66 [1.60, 2.85] | 0.33 [0.32, 0.34] | 1.29 [1.23, 2.21] | 0.08 [0.08, 0.10] | 1.49 [1.34, 1.52] | 0.09 [0.08, 0.11] |
| n15-p8-large1-h32 / tasks | 2.54 [2.39, 3.58] | 0.87 [0.85, 1.01] | 1.71 [1.59, 2.70] | 0.33 [0.30, 0.35] | 2.86 [2.70, 3.17] | 0.34 [0.33, 0.43] |
| n15-p8-large1-h32 / overdue | 1.71 [1.66, 1.89] | 0.63 [0.62, 0.68] | 1.27 [1.19, 1.32] | 1.73 [1.68, 1.84] | 1.31 [1.26, 1.55] | 1.77 [1.68, 2.03] |
| n15-p8-large1-h32 / projects | 1.56 [1.37, 2.42] | 0.20 [0.19, 0.25] | 1.22 [1.20, 2.41] | 0.15 [0.12, 0.15] | 1.22 [1.19, 1.36] | 0.15 [0.12, 0.16] |
| n15-p8-large1-h32 / inbox | 2.52 [1.45, 2.82] | 0.35 [0.33, 0.37] | 1.66 [1.27, 2.33] | 0.37 [0.32, 0.39] | 2.42 [1.39, 2.63] | 0.32 [0.31, 0.37] |
| n15-p8-large1-h32 / today | 1.37 [1.32, 1.43] | 0.28 [0.26, 0.30] | 1.38 [1.22, 1.55] | 0.28 [0.27, 0.32] | 1.44 [1.30, 4.01] | 0.26 [0.22, 0.27] |
| n15-p8-large1-h32 / scheduled | 1.37 [1.33, 1.52] | 0.28 [0.26, 0.29] | 1.24 [1.22, 1.41] | 0.22 [0.21, 0.23] | 1.32 [1.26, 1.51] | 0.21 [0.20, 0.22] |
| n15-p8-large1-h2048 / profiles | 105.02 [103.52, 109.19] | 1.59 [1.57, 1.62] | 95.69 [93.89, 98.59] | 0.25 [0.23, 0.28] | 93.82 [93.62, 95.23] | 0.20 [0.18, 0.21] |
| n15-p8-large1-h2048 / tags | 14.05 [11.92, 14.45] | 0.35 [0.34, 0.36] | 11.59 [11.33, 14.10] | 0.10 [0.09, 0.11] | 12.55 [12.18, 12.92] | 0.09 [0.09, 0.09] |
| n15-p8-large1-h2048 / tasks | 12.71 [12.24, 14.97] | 0.88 [0.85, 1.13] | 13.02 [12.54, 13.85] | 0.30 [0.29, 0.33] | 11.86 [11.48, 13.05] | 0.31 [0.31, 0.38] |
| n15-p8-large1-h2048 / overdue | 13.01 [12.94, 14.31] | 0.65 [0.62, 1.95] | 11.56 [11.36, 12.54] | 0.23 [0.20, 0.24] | 12.33 [11.29, 12.50] | 0.24 [0.23, 0.29] |
| n15-p8-large1-h2048 / projects | 11.38 [11.29, 13.28] | 0.17 [0.17, 0.27] | 11.88 [11.29, 13.67] | 0.07 [0.06, 0.08] | 11.31 [10.99, 13.15] | 0.07 [0.07, 0.10] |
| n15-p8-large1-h2048 / inbox | 12.44 [11.54, 12.70] | 0.35 [0.30, 0.36] | 12.06 [11.21, 12.45] | 0.26 [0.23, 0.27] | 12.48 [11.74, 12.59] | 0.25 [0.23, 0.28] |
| n15-p8-large1-h2048 / today | 12.69 [11.10, 12.90] | 0.26 [0.24, 0.30] | 11.88 [11.25, 12.65] | 0.23 [0.20, 0.25] | 11.79 [11.26, 13.40] | 0.23 [0.21, 0.26] |
| n15-p8-large1-h2048 / scheduled | 12.79 [11.44, 12.88] | 0.26 [0.24, 0.34] | 12.18 [11.16, 12.90] | 0.23 [0.19, 0.25] | 11.95 [10.99, 12.84] | 0.22 [0.19, 0.23] |
| n178-p1-large0-h32 / profiles | 3.89 [3.80, 3.92] | 1.52 [1.51, 1.58] | 1.60 [1.55, 1.70] | 0.23 [0.20, 0.24] | 1.66 [1.61, 1.68] | 0.19 [0.18, 0.22] |
| n178-p1-large0-h32 / tags | 3.92 [3.82, 4.10] | 0.36 [0.35, 0.40] | 2.72 [2.63, 2.93] | 0.10 [0.08, 0.11] | 1.55 [1.54, 1.67] | 0.10 [0.09, 0.11] |
| n178-p1-large0-h32 / tasks | 3.67 [3.51, 3.92] | 2.00 [1.96, 2.41] | 2.60 [2.56, 2.72] | 1.08 [1.08, 1.12] | 3.63 [3.55, 4.19] | 1.14 [1.11, 1.17] |
| n178-p1-large0-h32 / overdue | 2.18 [2.13, 2.25] | 1.15 [1.14, 1.19] | 1.63 [1.57, 1.77] | 0.65 [0.64, 0.66] | 1.71 [1.70, 1.82] | 0.66 [0.64, 0.72] |
| n178-p1-large0-h32 / projects | 1.88 [1.81, 3.17] | 0.21 [0.21, 0.22] | 1.53 [1.49, 2.74] | 0.08 [0.08, 0.09] | 1.54 [1.53, 1.71] | 0.10 [0.09, 0.16] |
| n178-p1-large0-h32 / inbox | 3.09 [2.03, 3.18] | 0.80 [0.79, 2.46] | 2.82 [1.82, 3.02] | 0.69 [0.68, 0.71] | 1.80 [1.70, 2.73] | 0.69 [0.67, 0.84] |
| n178-p1-large0-h32 / today | 1.72 [1.67, 1.73] | 2.20 [0.87, 2.32] | 1.72 [1.65, 1.81] | 0.58 [0.58, 0.64] | 2.75 [1.65, 2.88] | 0.58 [0.57, 0.63] |
| n178-p1-large0-h32 / scheduled | 1.67 [1.62, 1.71] | 0.69 [0.68, 0.75] | 1.61 [1.54, 1.70] | 0.58 [0.56, 0.63] | 1.77 [1.64, 1.79] | 0.66 [0.56, 0.73] |
| n178-p1-large0-h2048 / profiles | 19.99 [19.43, 20.51] | 1.53 [1.52, 1.74] | 16.52 [15.44, 18.70] | 0.20 [0.19, 0.21] | 16.29 [14.46, 17.01] | 0.17 [0.17, 0.22] |
| n178-p1-large0-h2048 / tags | 18.08 [16.90, 19.71] | 0.36 [0.35, 0.40] | 14.22 [13.71, 15.13] | 0.09 [0.09, 0.10] | 16.65 [14.31, 16.85] | 0.09 [0.09, 0.12] |
| n178-p1-large0-h2048 / tasks | 20.60 [18.71, 22.08] | 1.81 [1.74, 1.92] | 15.42 [14.84, 15.63] | 1.05 [1.02, 1.07] | 16.07 [15.48, 18.11] | 1.08 [1.04, 1.17] |
| n178-p1-large0-h2048 / overdue | 15.60 [14.63, 16.49] | 1.35 [1.30, 1.43] | 15.41 [14.90, 16.73] | 0.61 [0.60, 0.63] | 15.02 [14.66, 16.13] | 0.62 [0.61, 0.87] |
| n178-p1-large0-h2048 / projects | 16.74 [15.27, 16.95] | 0.27 [0.23, 0.27] | 15.22 [13.96, 15.57] | 0.08 [0.08, 0.09] | 15.43 [15.23, 16.93] | 0.09 [0.08, 0.14] |
| n178-p1-large0-h2048 / inbox | 15.68 [15.41, 17.34] | 0.78 [0.75, 0.83] | 14.40 [14.20, 15.41] | 0.67 [0.64, 0.77] | 15.59 [14.30, 16.04] | 0.70 [0.66, 2.17] |
| n178-p1-large0-h2048 / today | 15.02 [14.65, 15.67] | 0.62 [0.59, 0.63] | 14.63 [14.31, 16.00] | 0.56 [0.54, 0.61] | 15.23 [14.98, 15.55] | 0.60 [0.59, 0.75] |
| n178-p1-large0-h2048 / scheduled | 15.56 [14.80, 17.04] | 0.60 [0.59, 0.63] | 16.54 [14.21, 16.71] | 0.58 [0.56, 0.60] | 15.65 [14.87, 16.67] | 0.59 [0.55, 0.63] |
| n178-p1-large1-h32 / profiles | 5.82 [5.65, 6.04] | 1.54 [1.52, 1.55] | 1.97 [1.93, 1.99] | 0.22 [0.20, 0.30] | 1.92 [1.88, 2.78] | 0.20 [0.19, 0.24] |
| n178-p1-large1-h32 / tags | 2.58 [2.56, 2.69] | 0.36 [0.34, 0.39] | 2.00 [1.95, 2.96] | 0.10 [0.09, 0.10] | 2.13 [2.09, 2.23] | 0.09 [0.09, 0.13] |
| n178-p1-large1-h32 / tasks | 5.28 [5.12, 5.33] | 3.74 [3.65, 4.07] | 4.13 [3.34, 4.36] | 1.21 [1.16, 1.33] | 2.97 [2.92, 3.05] | 1.20 [1.18, 1.38] |
| n178-p1-large1-h32 / overdue | 2.69 [2.63, 2.81] | 1.36 [1.33, 1.41] | 2.25 [2.22, 2.32] | 1.73 [0.73, 2.00] | 2.00 [1.96, 2.09] | 0.85 [0.74, 1.88] |
| n178-p1-large1-h32 / projects | 4.73 [2.78, 4.87] | 0.24 [0.23, 0.26] | 1.89 [1.86, 2.01] | 0.14 [0.08, 0.18] | 2.85 [1.81, 3.02] | 0.12 [0.09, 0.14] |
| n178-p1-large1-h32 / inbox | 2.53 [2.39, 2.59] | 0.93 [0.89, 0.93] | 2.08 [2.06, 2.17] | 0.93 [0.89, 2.20] | 2.38 [2.20, 3.20] | 1.90 [0.86, 1.96] |
| n178-p1-large1-h32 / today | 2.02 [1.98, 2.08] | 0.74 [0.70, 0.77] | 2.96 [1.97, 3.17] | 0.73 [0.70, 0.89] | 2.04 [1.86, 2.15] | 0.76 [0.71, 0.78] |
| n178-p1-large1-h32 / scheduled | 1.89 [1.83, 1.95] | 0.77 [0.72, 0.82] | 2.16 [2.10, 3.01] | 0.71 [0.68, 0.73] | 2.02 [1.91, 2.22] | 0.71 [0.68, 0.74] |
| n178-p1-large1-h2048 / profiles | 19.65 [19.54, 20.63] | 1.56 [1.52, 1.58] | 15.56 [15.02, 17.36] | 0.21 [0.20, 0.23] | 14.98 [14.58, 17.15] | 0.18 [0.18, 0.19] |
| n178-p1-large1-h2048 / tags | 18.66 [17.81, 19.77] | 0.36 [0.35, 0.37] | 16.76 [16.08, 17.46] | 0.10 [0.09, 0.10] | 15.02 [14.33, 15.26] | 0.10 [0.09, 0.70] |
| n178-p1-large1-h2048 / tasks | 20.58 [20.26, 23.71] | 1.87 [1.83, 1.94] | 16.85 [16.20, 17.36] | 1.15 [1.12, 1.17] | 17.86 [16.93, 18.86] | 1.16 [1.14, 1.88] |
| n178-p1-large1-h2048 / overdue | 16.80 [16.47, 17.26] | 1.37 [1.18, 2.53] | 14.78 [14.52, 15.91] | 0.71 [0.68, 0.83] | 15.53 [14.52, 16.91] | 0.74 [0.70, 0.95] |
| n178-p1-large1-h2048 / projects | 14.97 [14.88, 16.20] | 0.24 [0.20, 0.30] | 15.78 [15.38, 16.05] | 0.08 [0.08, 0.09] | 14.83 [14.48, 14.99] | 0.10 [0.09, 0.12] |
| n178-p1-large1-h2048 / inbox | 15.86 [15.81, 16.31] | 0.88 [0.86, 0.93] | 16.18 [16.11, 17.50] | 0.76 [0.69, 0.78] | 15.57 [15.43, 15.99] | 0.80 [0.74, 0.83] |
| n178-p1-large1-h2048 / today | 16.30 [15.74, 16.71] | 0.73 [0.70, 2.09] | 14.81 [14.44, 15.39] | 0.68 [0.61, 0.73] | 15.72 [14.37, 16.97] | 0.65 [0.64, 0.71] |
| n178-p1-large1-h2048 / scheduled | 15.74 [15.39, 17.33] | 0.69 [0.67, 0.88] | 15.35 [14.93, 16.95] | 0.66 [0.59, 0.74] | 15.78 [14.71, 16.20] | 0.67 [0.67, 0.72] |
| n178-p8-large0-h32 / profiles | 100.99 [98.20, 129.78] | 2.50 [2.44, 2.51] | 84.92 [82.84, 88.14] | 0.87 [0.84, 0.90] | 85.52 [82.55, 86.56] | 0.78 [0.73, 0.87] |
| n178-p8-large0-h32 / tags | 11.63 [10.78, 13.59] | 0.36 [0.36, 0.41] | 11.06 [10.17, 11.18] | 0.10 [0.09, 0.10] | 11.72 [11.54, 12.83] | 0.10 [0.10, 0.11] |
| n178-p8-large0-h32 / tasks | 17.17 [16.09, 17.66] | 1.76 [1.72, 1.98] | 15.67 [15.36, 17.45] | 1.06 [0.99, 1.14] | 16.43 [16.18, 17.05] | 1.02 [1.00, 1.18] |
| n178-p8-large0-h32 / overdue | 11.51 [11.12, 11.96] | 2.12 [1.49, 3.88] | 10.92 [10.28, 12.29] | 0.64 [0.61, 0.67] | 10.31 [9.89, 11.32] | 0.57 [0.56, 0.66] |
| n178-p8-large0-h32 / projects | 11.57 [11.10, 12.12] | 0.30 [0.26, 0.32] | 10.06 [9.88, 11.31] | 0.08 [0.07, 0.09] | 10.71 [9.74, 12.27] | 0.09 [0.08, 0.10] |
| n178-p8-large0-h32 / inbox | 10.61 [10.13, 11.25] | 0.79 [0.77, 0.82] | 11.38 [10.37, 11.44] | 0.67 [0.62, 0.70] | 11.62 [10.26, 12.76] | 0.66 [0.62, 0.69] |
| n178-p8-large0-h32 / today | 11.46 [10.27, 12.71] | 0.65 [0.61, 0.67] | 11.17 [10.42, 11.66] | 0.55 [0.54, 0.58] | 10.46 [9.80, 10.73] | 0.56 [0.53, 0.64] |
| n178-p8-large0-h32 / scheduled | 11.23 [10.37, 11.33] | 0.62 [0.59, 0.63] | 11.41 [10.16, 12.45] | 0.55 [0.54, 0.57] | 11.36 [10.05, 12.57] | 0.59 [0.54, 0.61] |
| n178-p8-large0-h2048 / profiles | 200.38 [197.00, 205.59] | 2.30 [2.22, 2.47] | 196.49 [192.75, 200.35] | 0.80 [0.79, 0.82] | 192.50 [190.61, 197.94] | 0.74 [0.70, 0.77] |
| n178-p8-large0-h2048 / tags | 24.66 [24.54, 25.62] | 0.36 [0.36, 0.40] | 24.67 [24.08, 27.91] | 0.09 [0.09, 0.10] | 23.02 [22.63, 24.45] | 0.09 [0.09, 0.11] |
| n178-p8-large0-h2048 / tasks | 31.08 [30.71, 32.71] | 1.73 [1.71, 1.79] | 29.40 [29.27, 31.00] | 0.99 [0.97, 1.01] | 29.31 [27.42, 30.53] | 1.02 [0.99, 1.04] |
| n178-p8-large0-h2048 / overdue | 24.36 [23.96, 25.84] | 1.07 [1.04, 1.08] | 24.58 [22.08, 24.86] | 0.58 [0.55, 0.61] | 23.50 [21.89, 25.40] | 0.60 [0.55, 0.64] |
| n178-p8-large0-h2048 / projects | 24.21 [22.47, 24.64] | 0.20 [0.19, 0.21] | 24.22 [23.19, 25.53] | 0.07 [0.07, 0.08] | 23.74 [22.47, 25.15] | 0.08 [0.07, 0.08] |
| n178-p8-large0-h2048 / inbox | 24.02 [23.82, 25.51] | 0.73 [0.69, 0.74] | 24.51 [23.12, 24.86] | 0.65 [0.61, 0.70] | 24.31 [22.55, 27.07] | 0.65 [0.63, 0.67] |
| n178-p8-large0-h2048 / today | 23.93 [23.04, 25.48] | 0.57 [0.56, 0.59] | 24.34 [23.39, 25.08] | 0.55 [0.54, 0.56] | 24.16 [23.07, 24.28] | 0.57 [0.53, 0.68] |
| n178-p8-large0-h2048 / scheduled | 22.95 [22.29, 25.68] | 0.59 [0.57, 0.61] | 24.02 [23.40, 26.05] | 0.57 [0.55, 0.59] | 25.49 [23.16, 25.95] | 0.58 [0.57, 0.61] |
| n178-p8-large1-h32 / profiles | 100.63 [98.74, 102.07] | 2.54 [2.51, 2.56] | 87.55 [86.49, 88.96] | 0.90 [0.85, 1.33] | 88.08 [86.49, 91.07] | 0.91 [0.87, 1.12] |
| n178-p8-large1-h32 / tags | 11.72 [11.20, 13.37] | 0.38 [0.36, 0.43] | 12.37 [10.20, 12.85] | 0.12 [0.09, 2.18] | 11.01 [10.11, 13.17] | 0.10 [0.09, 0.54] |
| n178-p8-large1-h32 / tasks | 16.33 [16.18, 18.59] | 1.85 [1.82, 1.86] | 15.56 [14.46, 15.82] | 3.72 [1.50, 3.98] | 16.36 [14.76, 17.66] | 3.67 [3.56, 4.04] |
| n178-p8-large1-h32 / overdue | 11.55 [10.98, 12.36] | 1.15 [1.12, 1.18] | 11.09 [10.78, 11.40] | 0.77 [0.72, 0.90] | 11.01 [10.38, 11.16] | 0.87 [0.80, 0.95] |
| n178-p8-large1-h32 / projects | 11.82 [11.52, 12.70] | 0.20 [0.20, 0.21] | 11.47 [10.40, 13.08] | 0.10 [0.09, 0.11] | 11.62 [10.97, 13.00] | 0.11 [0.10, 0.11] |
| n178-p8-large1-h32 / inbox | 10.65 [10.45, 11.64] | 0.86 [0.82, 0.87] | 10.60 [10.48, 11.58] | 0.73 [0.72, 0.74] | 10.38 [10.12, 11.38] | 0.76 [0.73, 0.79] |
| n178-p8-large1-h32 / today | 11.58 [10.45, 11.80] | 0.70 [0.68, 0.72] | 13.11 [10.51, 13.36] | 0.64 [0.61, 0.66] | 11.83 [11.70, 11.99] | 0.63 [0.62, 0.65] |
| n178-p8-large1-h32 / scheduled | 10.72 [10.42, 11.91] | 0.68 [0.65, 0.69] | 11.05 [10.37, 11.25] | 0.64 [0.62, 0.66] | 11.35 [10.09, 11.38] | 0.65 [0.63, 0.69] |
| n178-p8-large1-h2048 / profiles | 201.09 [199.20, 207.28] | 2.38 [2.20, 2.59] | 194.09 [193.03, 200.18] | 0.86 [0.82, 0.92] | 199.57 [196.15, 200.62] | 0.81 [0.76, 1.96] |
| n178-p8-large1-h2048 / tags | 25.19 [23.88, 26.53] | 0.38 [0.35, 0.42] | 24.23 [22.39, 24.30] | 0.10 [0.09, 0.11] | 24.31 [23.21, 24.96] | 0.10 [0.09, 0.35] |
| n178-p8-large1-h2048 / tasks | 30.94 [29.21, 31.77] | 1.88 [1.80, 1.93] | 30.08 [28.69, 30.53] | 1.13 [1.06, 1.19] | 28.96 [27.77, 31.97] | 1.10 [1.09, 3.01] |
| n178-p8-large1-h2048 / overdue | 24.13 [22.72, 26.13] | 1.18 [1.16, 1.33] | 23.37 [22.87, 25.77] | 0.68 [0.64, 0.73] | 23.01 [22.55, 24.07] | 0.66 [0.65, 1.04] |
| n178-p8-large1-h2048 / projects | 24.33 [22.71, 25.10] | 0.21 [0.20, 0.34] | 24.24 [23.66, 24.71] | 0.08 [0.07, 0.12] | 23.78 [23.29, 24.18] | 0.08 [0.08, 0.14] |
| n178-p8-large1-h2048 / inbox | 23.19 [22.73, 26.22] | 0.82 [0.80, 1.01] | 23.74 [23.71, 25.21] | 0.73 [0.70, 0.81] | 24.19 [23.63, 26.85] | 0.75 [0.71, 0.94] |
| n178-p8-large1-h2048 / today | 23.06 [22.50, 24.25] | 0.68 [0.63, 0.80] | 24.01 [23.65, 26.40] | 0.64 [0.61, 0.78] | 24.51 [23.03, 25.71] | 0.64 [0.62, 0.76] |
| n178-p8-large1-h2048 / scheduled | 23.34 [22.70, 24.41] | 0.69 [0.65, 0.72] | 23.78 [22.95, 24.29] | 0.68 [0.64, 0.71] | 23.78 [23.41, 25.67] | 0.67 [0.65, 1.05] |
| n178-p8-empty-large0-h2048 / profiles | 129.52 [128.24, 131.06] | 1.63 [1.59, 1.66] | 120.31 [118.02, 122.37] | 0.30 [0.26, 0.30] | 117.76 [116.84, 122.15] | 0.24 [0.23, 0.26] |
| n178-p8-empty-large0-h2048 / tags | 15.44 [15.00, 16.64] | 0.35 [0.35, 0.36] | 15.89 [14.64, 16.90] | 0.10 [0.10, 0.10] | 15.12 [14.24, 16.32] | 0.11 [0.10, 0.14] |
| n178-p8-empty-large0-h2048 / tasks | 16.66 [15.73, 17.52] | 1.79 [1.71, 1.83] | 16.57 [16.16, 17.77] | 1.06 [1.00, 1.11] | 16.68 [15.01, 18.06] | 1.09 [1.04, 1.18] |
| n178-p8-empty-large0-h2048 / overdue | 15.45 [15.12, 17.30] | 1.33 [1.04, 1.41] | 14.10 [13.97, 16.53] | 0.62 [0.56, 0.72] | 15.46 [15.26, 16.69] | 0.65 [0.61, 0.69] |
| n178-p8-empty-large0-h2048 / projects | 15.70 [14.15, 17.60] | 0.26 [0.18, 0.27] | 15.50 [14.99, 16.92] | 0.09 [0.08, 0.11] | 15.55 [14.16, 21.01] | 0.09 [0.08, 0.11] |
| n178-p8-empty-large0-h2048 / inbox | 14.40 [14.30, 14.87] | 0.81 [0.68, 0.87] | 16.07 [14.47, 16.47] | 0.74 [0.72, 2.10] | 14.97 [14.57, 25.18] | 0.73 [0.66, 0.78] |
| n178-p8-empty-large0-h2048 / today | 15.82 [14.36, 16.91] | 0.63 [0.59, 0.67] | 15.60 [13.91, 17.08] | 0.60 [0.59, 0.68] | 15.83 [15.72, 17.52] | 0.60 [0.54, 0.71] |
| n178-p8-empty-large0-h2048 / scheduled | 15.36 [14.27, 16.04] | 0.63 [0.58, 0.66] | 14.70 [13.75, 15.66] | 0.58 [0.57, 0.59] | 15.79 [13.92, 16.78] | 0.59 [0.56, 0.66] |
| n178-p8-empty-large1-h2048 / profiles | 134.05 [131.06, 134.96] | 1.64 [1.61, 1.71] | 120.12 [119.49, 124.83] | 0.28 [0.27, 0.29] | 120.48 [117.35, 126.83] | 0.23 [0.23, 0.35] |
| n178-p8-empty-large1-h2048 / tags | 16.11 [15.33, 18.06] | 0.38 [0.35, 0.51] | 15.06 [14.55, 16.15] | 0.10 [0.09, 0.11] | 14.89 [14.52, 15.41] | 0.11 [0.09, 0.11] |
| n178-p8-empty-large1-h2048 / tasks | 19.35 [18.91, 19.87] | 1.89 [1.85, 1.99] | 16.25 [15.49, 16.76] | 1.12 [1.09, 1.15] | 18.00 [16.92, 18.56] | 1.13 [1.10, 1.21] |
| n178-p8-empty-large1-h2048 / overdue | 16.25 [15.09, 17.01] | 1.48 [1.16, 2.41] | 14.96 [14.74, 16.13] | 0.68 [0.66, 0.77] | 14.95 [13.93, 15.64] | 0.71 [0.66, 0.75] |
| n178-p8-empty-large1-h2048 / projects | 15.76 [14.89, 16.18] | 0.24 [0.19, 0.27] | 15.89 [14.39, 16.89] | 0.08 [0.08, 0.10] | 15.13 [14.81, 17.72] | 0.08 [0.08, 0.10] |
| n178-p8-empty-large1-h2048 / inbox | 15.84 [14.51, 16.40] | 0.85 [0.79, 0.88] | 15.00 [14.30, 16.76] | 0.76 [0.73, 0.81] | 15.74 [14.85, 17.13] | 0.74 [0.70, 0.85] |
| n178-p8-empty-large1-h2048 / today | 15.97 [14.71, 16.32] | 0.69 [0.64, 0.72] | 14.73 [14.27, 17.06] | 0.67 [0.62, 0.73] | 14.83 [14.50, 16.78] | 0.64 [0.61, 0.72] |
| n178-p8-empty-large1-h2048 / scheduled | 16.04 [14.58, 17.65] | 0.68 [0.65, 0.72] | 15.62 [14.20, 15.94] | 0.67 [0.63, 0.74] | 15.91 [14.80, 17.46] | 0.65 [0.61, 0.77] |

### Read-port caller audit

The table is the complete production domain/CLI/server call-site inventory for the listed read ports. Authentication methods are the input boundary. Query continuations consume the returned nominal value. Low-level storage ports also serve bootstrap, replay, scheduler and mutation operations; those remain under their existing internal identities/transactions rather than changing the writer/replay model in this repair. The table identifies those separately and names the source of their selectors. Verification scripts/tests are separate callers and use scratch-only inputs.

| Production caller | Read call | Profile, ids and fields |
| --- | --- | --- |
| `packages/domain/src/store/store.ts:209` | `const purged = this.snapshots.purgedIdsSync();` | Internal cursor, generation or erasure state. No caller Profile/id field is consumed. |
| `packages/domain/src/store/store.ts:221` | `tasks: () => readTasks(this.db),` | Trusted storage implementation. Request-facing calls enter through the nominal read wrapper; mutation calls use their checked identity Profile. |
| `packages/domain/src/store/store.ts:268` | `tasks: readTasks(this.db).filter(` | Trusted storage implementation. Request-facing calls enter through the nominal read wrapper; mutation calls use their checked identity Profile. |
| `packages/domain/src/store/store.ts:414` | `const tasks = readTasks(this.db).filter(` | Trusted storage implementation. Request-facing calls enter through the nominal read wrapper; mutation calls use their checked identity Profile. |
| `packages/domain/src/store/store.ts:472` | `const before = readTasks(this.db).find((task) => task.id === target.id);` | Trusted storage implementation. Request-facing calls enter through the nominal read wrapper; mutation calls use their checked identity Profile. |
| `packages/domain/src/store/store.ts:550` | `readonly tasks = () => attempt(() => readTasks(this.db));` | Trusted storage implementation. Request-facing calls enter through the nominal read wrapper; mutation calls use their checked identity Profile. |
| `packages/domain/src/store/store.ts:556` | `tasks: new ClientProjection(this.db).tasks(profile),` | Trusted storage implementation. Request-facing calls enter through the nominal read wrapper; mutation calls use their checked identity Profile. |
| `packages/domain/src/store/store.ts:567` | `readonly graphRead = (read: AuthorizedRead) => this.graph(read.profile);` | Trusted storage implementation. Request-facing calls enter through the nominal read wrapper; mutation calls use their checked identity Profile. |
| `packages/domain/src/store/store.ts:607` | `attempt(() => committedHistory(this.db, profile, after));` | Nominal read.profile; cursor is the subscription's internal unfolding state. |
| `packages/domain/src/store/store.ts:610` | `this.committedHistory(read.profile, after);` | Nominal read.profile; cursor is the subscription's internal unfolding state. |
| `packages/domain/src/store/store.ts:618` | `const state = this.snapshots.generationSync();` | Internal cursor, generation or erasure state. No caller Profile/id field is consumed. |
| `packages/domain/src/store/store.ts:736` | `for (const id of this.snapshots.purgedIdsSync())` | Internal cursor, generation or erasure state. No caller Profile/id field is consumed. |
| `packages/domain/src/store/store.ts:844` | `const purged = new Set(this.snapshots.purgedIdsSync());` | Internal cursor, generation or erasure state. No caller Profile/id field is consumed. |
| `packages/domain/src/store/store.ts:1349` | `const tasks = readTasks(this.db);` | Trusted storage implementation. Request-facing calls enter through the nominal read wrapper; mutation calls use their checked identity Profile. |
| `packages/domain/src/store/store.ts:1526` | `return readTasks(this.db);` | Trusted storage implementation. Request-facing calls enter through the nominal read wrapper; mutation calls use their checked identity Profile. |
| `packages/domain/src/store/snapshots.ts:296` | `readonly generation = () => attempt(() => this.generationSync());` | Internal cursor, generation or erasure state. No caller Profile/id field is consumed. |
| `packages/domain/src/store/snapshots.ts:396` | `const ids = this.purgedIdsSync();` | Internal cursor, generation or erasure state. No caller Profile/id field is consumed. |
| `packages/domain/src/store/snapshots.ts:492` | `generation: this.generationSync().generation,` | Internal cursor, generation or erasure state. No caller Profile/id field is consumed. |
| `apps/server/src/server.ts:453` | `diagnostics.read({ credential: yield* BearerCredential }),` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/server/src/server.ts:519` | `attachments.imageRead(` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/server/src/server.ts:614` | `readGraphQuery(` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/server/src/server.ts:661` | `commands.readOne(` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/server/src/server.ts:822` | `: reads.profiles(credential),` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/server/src/server.ts:828` | `reads.projects({` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/server/src/server.ts:837` | `reads.tags({` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/server/src/server.ts:859` | `reads.history({` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/server/src/server.ts:869` | `store.auth.subscribe(` | Authorization boundary: Profile plus QuickAddInput or stream header/cursor fields are copied, parsed and frozen before the check. |
| `apps/server/src/server.ts:939` | `return yield* translate(store.auth.listTokens({ credential }));` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/server/src/server.ts:994` | `store.auth.ownerRead(` | Authorization boundary: Schema-owned Snapshot fields are copied before the check. |
| `apps/server/src/server.ts:1000` | `return yield* snapshotResult(store.snapshots.listRead(read));` | Nominal owner-read value; Show uses read.fields.snapshot. List has no id. |
| `apps/server/src/server.ts:1007` | `store.auth.ownerRead(` | Authorization boundary: Schema-owned Snapshot fields are copied before the check. |
| `apps/server/src/server.ts:1013` | `return yield* snapshotResult(store.snapshots.showRead(read));` | Nominal owner-read value; Show uses read.fields.snapshot. List has no id. |
| `packages/domain/src/store/diagnostics.ts:119` | `this.restoreGeneration = snapshots.generationSync().generation;` | Internal cursor, generation or erasure state. No caller Profile/id field is consumed. |
| `packages/domain/src/store/diagnostics.ts:195` | `const generation = yield* this.snapshots.generation();` | Owner check precedes parameter-free diagnostic collection; all ids/cursors are internal rows/state. |
| `packages/domain/src/store/diagnostics.ts:196` | `this.generation(generation.generation);` | Owner check precedes parameter-free diagnostic collection; all ids/cursors are internal rows/state. |
| `packages/domain/src/store/diagnostics.ts:198` | `const pending = yield* this.scheduled.pendingReminders();` | Owner check precedes parameter-free diagnostic collection; all ids/cursors are internal rows/state. |
| `packages/domain/src/store/purge.ts:15` | `...metadata(entry.event),` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `apps/server/src/sse.ts:27` | `store.auth.subscribe(` | Authorization boundary: Profile plus QuickAddInput or stream header/cursor fields are copied, parsed and frozen before the check. |
| `apps/server/src/sse.ts:48` | `const initial = yield* translate(store.snapshots.generation());` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `apps/server/src/sse.ts:61` | `const current = yield* translate(store.snapshots.generation());` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `apps/server/src/sse.ts:80` | `store.changesRead(read, state.cursor),` | Nominal read.profile; cursor is the subscription's internal unfolding state. |
| `packages/domain/src/store/dependency-validation.ts:78` | `? readTasks(db).filter((task) => task.profile_id === profile)` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/store/projection.ts:344` | `tasks: readTasks(db),` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/store/scheduled-work.ts:55` | `.tasks()` | Scheduler-owned Task rows; Profile and ids come from those rows, with no caller request. |
| `packages/domain/src/store/scheduled-work.ts:72` | `for (const task of this.ports.tasks()) {` | Scheduler-owned Task rows; Profile and ids come from those rows, with no caller request. |
| `packages/domain/src/store/scheduled-work.ts:100` | `for (const before of this.ports.tasks()) {` | Scheduler-owned Task rows; Profile and ids come from those rows, with no caller request. |
| `packages/domain/src/store/scheduled-work.ts:129` | `for (const task of this.ports.tasks()) {` | Scheduler-owned Task rows; Profile and ids come from those rows, with no caller request. |
| `packages/domain/src/store/client-projection.ts:32` | `...this.metadata(profile),` | Trusted storage implementation. Request-facing calls enter through the nominal read wrapper; mutation calls use their checked identity Profile. |
| `packages/domain/src/store/client-projection.ts:33` | `tasks: this.tasks(profile),` | Trusted storage implementation. Request-facing calls enter through the nominal read wrapper; mutation calls use their checked identity Profile. |
| `packages/domain/src/dependency-commands.ts:134` | `const graph = yield* this.store.graph(identity.profile);` | Mutation-only graph: checked MutationIdentity.profile; selectors are the write's typed ids/current Task. This is not a request query port. |
| `packages/domain/src/dependency-commands.ts:211` | `const updated = yield* this.store.graph(identity.profile);` | Mutation-only graph: checked MutationIdentity.profile; selectors are the write's typed ids/current Task. This is not a request query port. |
| `apps/server/src/task-search-cache-hygiene.ts:6` | `let cursor = yield* store.searchCacheEvents();` | Internal cursor, generation or erasure state. No caller Profile/id field is consumed. |
| `apps/server/src/task-search-cache-hygiene.ts:8` | `const current = yield* store.searchCacheEvents(cursor);` | Internal cursor, generation or erasure state. No caller Profile/id field is consumed. |
| `packages/domain/src/discovery.ts:42` | `const profiles = yield* auth.profileSummaries({ credential });` | Credential is an immutable string. Profile rows come from authorized discovery; prefix is read.fields.prefix. The existing snapshot/recheck order remains. |
| `packages/domain/src/discovery.ts:46` | `auth.metadata({ credential, profile: profile.id }).pipe(` | Credential is an immutable string. Profile rows come from authorized discovery; prefix is read.fields.prefix. The existing snapshot/recheck order remains. |
| `packages/domain/src/discovery.ts:55` | `yield* auth.profiles({ credential });` | Credential is an immutable string. Profile rows come from authorized discovery; prefix is read.fields.prefix. The existing snapshot/recheck order remains. |
| `packages/domain/src/discovery.ts:63` | `const { read, profiles } = yield* auth.profilesRead(` | Credential is an immutable string. Profile rows come from authorized discovery; prefix is read.fields.prefix. The existing snapshot/recheck order remains. |
| `packages/domain/src/discovery.ts:72` | `auth.catalog({ credential, profile: profile.id }).pipe(` | Credential is an immutable string. Profile rows come from authorized discovery; prefix is read.fields.prefix. The existing snapshot/recheck order remains. |
| `packages/domain/src/discovery.ts:92` | `yield* auth.profiles({ credential });` | Credential is an immutable string. Profile rows come from authorized discovery; prefix is read.fields.prefix. The existing snapshot/recheck order remains. |
| `packages/domain/src/attachment-store.ts:155` | `export function readManagedImage(` | Image metadata from the bound Task; filesystem Task id is read.fields.task_id. |
| `packages/domain/src/attachment-store.ts:209` | `const image = readManagedImage(root, attachment, task.id);` | Image metadata from the bound Task; filesystem Task id is read.fields.task_id. |
| `packages/domain/src/attachment-store.ts:225` | `const image = readManagedImage(root, attachment, source.id);` | Image metadata from the bound Task; filesystem Task id is read.fields.task_id. |
| `packages/domain/src/client-reads.ts:79` | `this.store.auth.profileSummaries({ credential });` | Raw input is consumed at the authorization boundary only. The query continuation uses the bound Profile and fields; History binds Task id. |
| `packages/domain/src/client-reads.ts:82` | `this.store.auth.projects(request);` | Raw input is consumed at the authorization boundary only. The query continuation uses the bound Profile and fields; History binds Task id. |
| `packages/domain/src/client-reads.ts:84` | `readonly tags = (request: AccessRequest) => this.store.auth.tags(request);` | Raw input is consumed at the authorization boundary only. The query continuation uses the bound Profile and fields; History binds Task id. |
| `packages/domain/src/client-reads.ts:92` | `const { read, data } = yield* this.store.auth.readCatalog(` | Authorization boundary: Profile and fields are parsed/copied before the callback. The returned read owns ids, filters and scope. |
| `packages/domain/src/client-reads.ts:152` | `this.store.auth.taskHistory(request);` | Raw input is consumed at the authorization boundary only. The query continuation uses the bound Profile and fields; History binds Task id. |
| `packages/domain/src/auth/auth.ts:341` | `.profiles()` | Authentication-owned lookup of Profile definitions or owner-only credential metadata. Selection uses checked credential scope/resolution; no caller id is reused after the check. |
| `packages/domain/src/auth/auth.ts:615` | `!this.ports.profiles().some((p) => p.id === token.profile)` | Authentication-owned lookup of Profile definitions or owner-only credential metadata. Selection uses checked credential scope/resolution; no caller id is reused after the check. |
| `packages/domain/src/auth/auth.ts:778` | `(read) => this.projection.catalog(read.profile),` | The private query callback's read.profile; Task History also takes read.fields.task_id. |
| `packages/domain/src/auth/auth.ts:784` | `(read) => this.projection.metadata(read.profile),` | The private query callback's read.profile; Task History also takes read.fields.task_id. |
| `packages/domain/src/auth/auth.ts:850` | `this.projection.catalog(read.profile),` | The private query callback's read.profile; Task History also takes read.fields.task_id. |
| `packages/domain/src/auth/auth.ts:855` | `this.projection.metadata(read.profile),` | The private query callback's read.profile; Task History also takes read.fields.task_id. |
| `packages/domain/src/auth/auth.ts:871` | `data: this.projection.metadata(read.profile),` | The private query callback's read.profile; Task History also takes read.fields.task_id. |
| `packages/domain/src/auth/auth.ts:881` | `data: this.ports.read(read.profile),` | Authentication-owned lookup of Profile definitions or owner-only credential metadata. Selection uses checked credential scope/resolution; no caller id is reused after the check. |
| `packages/domain/src/auth/auth.ts:891` | `data: this.projection.catalog(read.profile),` | The private query callback's read.profile; Task History also takes read.fields.task_id. |
| `packages/domain/src/auth/auth.ts:936` | `(read) => taskHistory(this.db, read.profile, read.fields.task_id),` | Authentication-owned lookup of Profile definitions or owner-only credential metadata. Selection uses checked credential scope/resolution; no caller id is reused after the check. |
| `packages/domain/src/auth/auth.ts:941` | `this.projection.projects(read.profile),` | The private query callback's read.profile; Task History also takes read.fields.task_id. |
| `packages/domain/src/auth/auth.ts:945` | `this.projectionWithin(input, (read) => this.projection.tags(read.profile));` | The private query callback's read.profile; Task History also takes read.fields.task_id. |
| `packages/domain/src/auth/auth.ts:976` | `return this.projection.profiles(profiles);` | The frozen, checked Profile rows and ids, reused once. No second visible-set discovery. |
| `packages/domain/src/auth/auth.ts:1037` | `return this.ports.read(` | Authentication-owned lookup of Profile definitions or owner-only credential metadata. Selection uses checked credential scope/resolution; no caller id is reused after the check. |
| `packages/domain/src/graph-queries.ts:137` | `const read = yield* store.auth.authorizeRead(` | Authorization boundary: Profile and fields are parsed/copied before the callback. The returned read owns ids, filters and scope. |
| `packages/domain/src/graph-queries.ts:145` | `yield* store.graphRead(read),` | Nominal read.profile; Task id/filter selection uses that read.fields in the continuation. |
| `packages/domain/src/graph-queries.ts:153` | `readGraphQuery(...args).pipe(Effect.map((result) => result.graph));` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:154` | `const search = store.searchWords.read(selected.profile);` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:155` | `const { read, data } = yield* store.auth.readState(` | Authorization boundary: Profile and fields are parsed/copied before the callback. The returned read owns ids, filters and scope. |
| `packages/domain/src/commands.ts:161` | `const graph = yield* store.graphRead(read);` | Nominal read.profile; Task id/filter selection uses that read.fields in the continuation. |
| `packages/domain/src/commands.ts:220` | `? (yield* store.profiles()).some(` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:355` | `const search = this.store.searchWords.read(selected.profile);` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:357` | `const { read, data: view } = yield* this.store.auth.readMetadata(` | Authorization boundary: Profile and fields are parsed/copied before the callback. The returned read owns ids, filters and scope. |
| `packages/domain/src/commands.ts:363` | `const graph = yield* this.store.graphRead(read);` | Nominal read.profile; Task id/filter selection uses that read.fields in the continuation. |
| `packages/domain/src/commands.ts:399` | `const { read, data } = yield* this.store.auth.readMetadata(` | Authorization boundary: Profile and fields are parsed/copied before the callback. The returned read owns ids, filters and scope. |
| `packages/domain/src/commands.ts:404` | `const graph = yield* this.store.graphRead(read);` | Nominal read.profile; Task id/filter selection uses that read.fields in the continuation. |
| `packages/domain/src/commands.ts:424` | `this.readOne(request, Schema.Struct({ task_id: TaskId }), {` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:464` | `...(yield* this.store.projects()),` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:469` | `const tags = yield* this.store.tags();` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:488` | `projects: yield* this.store.projects(),` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:489` | `tags: yield* this.store.tags(),` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:638` | `const graph = yield* this.store.graph(identity.profile);` | Mutation-only graph: checked MutationIdentity.profile; selectors are the write's typed ids/current Task. This is not a request query port. |
| `packages/domain/src/commands.ts:707` | `const tasks = yield* this.store.tasks();` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:730` | `const edges = (yield* this.store.graph(` | Mutation-only graph: checked MutationIdentity.profile; selectors are the write's typed ids/current Task. This is not a request query port. |
| `packages/domain/src/commands.ts:781` | `: seriesForTask(before, yield* this.store.series());` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:999` | `const before = (yield* this.store.tasks()).find(` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:1029` | `(yield* this.store.tasks()).find(` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:1154` | `const data = yield* readTasks(store, request);` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:1202` | `const data = yield* readTasks(store, request);` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:1205` | `const { read, data: checked } = yield* store.auth.readState(` | Authorization boundary: Profile and fields are parsed/copied before the callback. The returned read owns ids, filters and scope. |
| `packages/domain/src/commands.ts:1397` | `const before = (yield* store.tasks()).find(` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:1462` | `const { read, data } = yield* store.auth.readState(` | Authorization boundary: Profile and fields are parsed/copied before the callback. The returned read owns ids, filters and scope. |
| `packages/domain/src/commands.ts:1468` | `const { data: target, read: targetRead } = yield* store.auth.readState(` | Authorization boundary: Profile and fields are parsed/copied before the callback. The returned read owns ids, filters and scope. |
| `packages/domain/src/commands.ts:1507` | `yield* store.series(),` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:1538` | `? (yield* store.history(entry.seq - 2)).find(` | Revert/Move writer: sequence and Task ids come from the bound Revert read or a Schema-decoded committed event/current Task. |
| `packages/domain/src/commands.ts:1560` | `const destination = (yield* store.profiles()).find(` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:1622` | `!(yield* store.profiles()).some(` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:1633` | `const source = (yield* store.profiles()).find(` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:1708` | `const definition = seriesForTask(context.before, yield* store.series());` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:1735` | `const definition = seriesForTask(context.before, yield* store.series());` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:1755` | `const { read, data } = yield* store.auth.readState(` | Authorization boundary: Profile and fields are parsed/copied before the callback. The returned read owns ids, filters and scope. |
| `packages/domain/src/commands.ts:1800` | `const pair = (yield* store.history()).filter(` | Revert/Move writer: sequence and Task ids come from the bound Revert read or a Schema-decoded committed event/current Task. |
| `packages/domain/src/commands.ts:1901` | `(yield* store.tasks()).find(` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/import-tasks.ts:45` | `const { read } = yield* store.auth.readState(` | Authorization boundary: Profile and fields are parsed/copied before the callback. The returned read owns ids, filters and scope. |
| `packages/domain/src/import-tasks.ts:55` | `const graph = yield* store.graphRead(read);` | Nominal read.profile; Task id/filter selection uses that read.fields in the continuation. |
| `packages/domain/src/import-tasks.ts:147` | `const tasks = (yield* store.auth.read(request)).tasks;` | Import continuation's owned request, reconstructed from its initial read credential/Profile; items and ids come from read.fields.input and decoded ImportItem. |
| `packages/domain/src/import-tasks.ts:221` | `const data = yield* store.auth.read(request);` | Import continuation's owned request, reconstructed from its initial read credential/Profile; items and ids come from read.fields.input and decoded ImportItem. |
| `packages/domain/src/import-tasks.ts:336` | `const currentBlockers = (yield* store.graphRead(read)).edges` | Nominal read.profile; Task id/filter selection uses that read.fields in the continuation. |
| `packages/domain/src/attachment-commands.ts:56` | `const before = (yield* this.store.tasks()).find(` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/attachment-commands.ts:468` | `const { read, task } = yield* new TaskCommands(this.store).readOne(` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/attachment-commands.ts:480` | `readManagedImage(` | Image metadata from the bound Task; filesystem Task id is read.fields.task_id. |
| `packages/domain/src/attachment-commands.ts:490` | `this.imageRead(request, id).pipe(Effect.map((result) => result.image));` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `apps/cli/src/main.ts:708` | `const data = yield* readTasks(store, request);` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:796` | `const data = yield* readTasks(store, request, filters).pipe(` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:923` | `const data = yield* readTasks(store, request);` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:1104` | `const data = yield* readTasks(` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:1320` | `const data = yield* readTasks(store, request);` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:1377` | `const entries = yield* new ClientReads(store).history({` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:1445` | `const data = yield* readTasks(store, request);` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:1510` | `const data = yield* readTasks(store, request);` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:1563` | `const data = yield* readTasks(store, request);` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:1616` | `const graph = yield* readGraph(` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:1701` | `const data = yield* readTasks(store, request);` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:1750` | `const latest = yield* readTasks(store, request);` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:1774` | `const data = yield* readTasks(` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:1803` | `const data = yield* readTasks(` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:1839` | `const data = yield* readTasks(` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:2116` | `: new ClientReads(store).profiles(credential);` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:2207` | `.listRead(read)` | Nominal owner-read value; Show uses read.fields.snapshot. List has no id. |
| `apps/cli/src/main.ts:2218` | `.showRead(read)` | Nominal owner-read value; Show uses read.fields.snapshot. List has no id. |
| `apps/cli/src/main.ts:2259` | `const read = yield* store.auth.ownerRead(` | Authorization boundary: Schema-owned Snapshot fields are copied before the check. |

### Commands, mapping and actual exits

Receipts below are relative to `docs/evidence/ui-speed/server-reads/boundary-revision`. They preserve failures rather than relabeling them. Exact argv for compiled recipes is in skills/summary.json and skills-rest/summary.json. Normal binaries are frozen by boundary-product-build.json at source hash 27faae19b383da3d0e342c2b56fd520f3add5402614190b3bbca19596241c9fe. The root used explicit same-source TODO_CLI_BINARY and TODO_SERVER_BINARY overrides. The complete cache command passed at docs/evidence/perf-cache/verify-Xh1k3D/result.json, including the admission model/code, erasure and CLI defect/refusal controls. All compiled recipe repeats passed; the sole held recipe was rerun. The source-map-only follow-up commit is 031504b5255d20f9ea8998746cbc2af009b7a7d8. The caller inventory contains 148 production call sites and trusted storage implementations. Read fields are now validated for in-process callers too; equality claims cover the published HTTP/CLI decoders and their fixtures rather than previously unchecked invalid in-process objects.

```sh
pnpm --filter @todo/domain test read-authorization.test.ts
pnpm typecheck
bun build --compile .scratch/review-s1/boundary-probe.ts --outfile .scratch/bin/boundary-seat-after
.scratch/bin/boundary-seat-after after
bun apps/server/scripts/build-read-control.ts after .scratch/bin/read-timing-after
bun apps/server/scripts/read-control.ts .scratch/bin/read-timing-before .scratch/bin/read-timing-after .scratch/server-reads/checkpoints/fixtures.json docs/evidence/ui-speed/server-reads/boundary-revision/control-56
bun apps/server/scripts/read-control.ts .scratch/bin/read-timing-before .scratch/bin/read-timing-after .scratch/server-reads/rich-audited/fixtures.json docs/evidence/ui-speed/server-reads/boundary-revision/control-rich
bun apps/server/scripts/build-read-boundary.ts .scratch/bin/read-boundary-server-final
READ_BOUNDARY_MODE=credential READ_BOUNDARY_BINARY="$PWD/.scratch/bin/read-boundary-server-final" bun apps/server/scripts/read-control.ts .scratch/bin/read-timing-after .scratch/bin/read-boundary-server-final .scratch/server-reads/rich-audited/fixtures.json docs/evidence/ui-speed/server-reads/boundary-revision/http-credential-final
READ_BOUNDARY_MODE=port READ_BOUNDARY_BINARY="$PWD/.scratch/bin/read-boundary-server-final" bun apps/server/scripts/read-control.ts .scratch/bin/read-timing-after .scratch/bin/read-boundary-server-final .scratch/server-reads/rich-audited/fixtures.json docs/evidence/ui-speed/server-reads/boundary-revision/http-port-final
bun apps/server/scripts/read-boundary-concurrency.ts .scratch/bin/read-boundary-server-final .scratch/server-reads/rich-audited/fixtures.json docs/evidence/ui-speed/server-reads/boundary-revision/concurrency-final
export TODO_CLI_BINARY="$PWD/.scratch/bin/27faae19b383-219749f2ab4e/todo"
export TODO_SERVER_BINARY="$PWD/.scratch/bin/27faae19b383-219749f2ab4e/todo-server"
sh scripts/disk-guard.sh
/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check
bun .agents/skills/verify-occ-atomicity/check.ts
bun .agents/skills/verify-task-search-cache/build-baseline.mjs 219749f2ab4ed40fdf7f257c991385a2057bf215 --uncached
bun .agents/skills/verify-task-search-cache/verify.mjs 219749f2ab4ed40fdf7f257c991385a2057bf215
```

| Invocation / receipt | Real exit |
| --- | ---: |
| `atomicity` | 0 |
| `benchmark` | 0 |
| `boundary-build-1` | 0 |
| `boundary-build-2` | 0 |
| `boundary-build-final` | 0 |
| `cache-baseline` | 0 |
| `cache-final-2` | 0 |
| `cache-final` | 1 |
| `cache-hygiene-1` | 1 |
| `cache-properties-1` | 1 |
| `cache-properties-2` | 1 |
| `cleanup` | 0 |
| `compression` | 0 |
| `concurrency-2` | 0 |
| `concurrency-final` | 0 |
| `concurrency` | 1 |
| `control-56` | 0 |
| `control-build-1` | 0 |
| `control-build-final` | 0 |
| `control-rich` | 0 |
| `domain-after-1` | 1 |
| `domain-after-2` | 0 |
| `domain-after-3` | 1 |
| `domain-after-4` | 0 |
| `domain-after-5` | 0 |
| `domain-after-6` | 0 |
| `domain-before` | 1 |
| `domain-suite-1` | 0 |
| `format-1` | 0 |
| `format-6` | 1 |
| `http-credential-confirmed` | 0 |
| `http-credential-final` | 0 |
| `http-credential` | 0 |
| `http-port-final` | 0 |
| `http-port` | 0 |
| `product-build` | 0 |
| `root-9` | 0 |
| `seat-after` | 0 |
| `seat-base-build` | 0 |
| `seat-base` | 1 |
| `seat-before` | 1 |
| `seat-build-after` | 0 |
| `seat-build-before` | 0 |
| `server-1` | 0 |
| `skills-rest` | 0 |
| `skills` | 1 |
| `typecheck-1` | 1 |
| `typecheck-10` | 0 |
| `typecheck-11` | 1 |
| `typecheck-12` | 0 |
| `typecheck-2` | 1 |
| `typecheck-3` | 1 |
| `typecheck-4` | 1 |
| `typecheck-5` | 0 |
| `typecheck-6` | 1 |
| `typecheck-7` | 0 |
| `typecheck-8` | 1 |
| `typecheck-9` | 0 |

| Compiled recipe command | Real exit |
| --- | ---: |
| `sh .agents/skills/verify-op-log/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/op-log"` | 0 |
| `sh .agents/skills/verify-auth/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/auth"` | 0 |
| `sh .agents/skills/verify-recurrence/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/recurrence"` | 0 |
| `sh .agents/skills/verify-server-api/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/server-api"` | 0 |
| `sh .agents/skills/verify-server-api/scripts/verify-reads.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/server-reads"` | 0 |
| `sh .agents/skills/verify-profiles/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/profiles"` | 0 |
| `sh .agents/skills/verify-filters/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/filters"` | 0 |
| `sh .agents/skills/verify-snapshots/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/snapshots"` | 0 |
| `sh .agents/skills/verify-sse/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/sse" "$PWD/.scratch/bin/27faae19b383-219749f2ab4e/todo"` | 0 |
| `sh .agents/skills/verify-cli/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/cli"` | 0 |
| `bun --define 'TODO_BUILD_ID="219749f2"' .agents/skills/verify-attachments/scripts/drive.ts "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/attachments"` | 0 |
| `bun --define 'TODO_BUILD_ID="219749f2"' .agents/skills/verify-attachments/scripts/cli01.ts "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/attachment-groups"` | 0 |
| `sh .agents/skills/verify-dag/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/dag"` | 0 |
| `sh .agents/skills/verify-dag/scripts/verify-public.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/dag-public"` | 0 |
| `sh .agents/skills/verify-discovery/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/discovery"` | 3 |
| `sh .agents/skills/verify-discovery/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills-rest/discovery"` | 0 |
| `sh .agents/skills/verify-import/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills-rest/import"` | 0 |
| `sh .agents/skills/verify-diagnostics/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills-rest/diagnostics"` | 0 |

Type/formatter iterations caught unfinished schema imports, private credential spread use, and TypeScript 7's async-loop inference issue. The first concurrency seeder reused an invalid Task Version; the corrected fixture asserts both creations before running requests. The first observer instrumentation lacked explicit execution receipts; the final runs require them. Cache property and hygiene controls passed behavior/restoration/strict checks before stopping at stale source mappings. Cache setup first lacked its evidence directory, then its separate pinned-jar path. The existing AtomicCAS jar has the identical pinned SHA-256 and was copied to that ignored cache path. No model, configuration or invariant was changed. AtomicCAS mapped bodies remain byte-identical; its renewed hash covers moved lines and unmapped read wrappers only. The cache mapping records the preserved epoch-before-auth and both preparation hooks, keys, admission, accounting, erasure and observer bodies.

Discovery's first recipe held with exit 3 at its stricter disk guard. The user's 30 GB floor was not crossed at that observation; a later sample was 35.2 GB. Owned closed Bun temporaries were removed, then the recipe was rerun. Sixteen files totaling 1,418,573,824 bytes were removed after lsof checks. Earlier superseded byte-control samples were gzip-compressed, verified by exact decompression before removal of their raw copies: 290 files saved 4,397,967,107 bytes. Aggregate receipts and accepted delivery matrices remain available. A retirement helper hit a post-removal stat error on its first file entry after retiring older owned binaries; no open binary was removed. This helper failure is not a product or proof pass.

The paired table above measures the repaired product. The prior performance tables and Unit B audit below describe the earlier measured product. They do not certify input-to-render latency or a new UI/native result. The immediate transaction and writer model remain unchanged. Final cleanup removed 11 further closed compile temporaries, 975,269,504 bytes. Free space was 42.2 GB; no owned cached-binary process remained. Delivery source/binary hashes are recorded in boundary-revision/delivery-audit.json. The independent correctness seat's re-check is separate; this worker started no children and did not launch native apps, access Keychain, sign, push, merge or open a PR.

## Earlier implementation, measurements and lock audit

Pure server reads no longer decode the global operation log. The paired sweep returned 8,640 successful, validated responses; every after-read decoded zero operation entries. On the synthetic 178-total-Task/eight-Profile fixture with long deleted text and 2,234 operations, warm GET /profiles changed from 218.48 [211.41, 254.24] ms to 0.63 [0.41, 0.74] ms. Its eight-handler refresh sum changed from 437.62 [403.43, 457.25] ms to 10.40 [6.38, 13.33] ms. These are handler observations, not an input-to-render or p99 result.

Branch: `perf/server-reads`. Starting commit: `e69230f93ce0ea29e955c34c4610122c6f47cb5c`. Main implementation: `7a90388d246e6c03f975d82c164c3e589cf15c7d`. Cursor proof: `43c7511753c76940842f7c87c5b503c211bc4bc2`. Final product with the authorization-boundary correction: `35d6790836e8139ae00e7e70086fd5211ab4c683`. Later changes are this report. The HTTP contract remains `78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289`. No dependency, migration, API schema, Swift or client UI changed. Commits are local; nothing was pushed, merged elsewhere or opened as a PR.

## What changed

- [ClientProjection](../../../packages/domain/src/store/client-projection.ts) owns Profile-filtered Task/catalog/metadata reads and grouped Profile, Project and Tag counts. Task lists and graphs filter Tasks and edges by Profile in SQL. Planning views load their Profile catalog without Series or History. Search and graph algorithms retain their existing in-memory semantics.
- GET /profiles computes counts with one grouped projection SELECT inside one immediate transaction. Its original credential-check sequence remains discovery followed by one read check per authorized Profile. Inbox is open with no due or scheduled date; open excludes snoozed and terminal Tasks; all counts exclude deleted Tasks. Active empty Profiles remain visible; tombstones and Token scope retain their previous meaning. The directory reuses its existing deferred read snapshot and its original discovery/read/discovery check order.
- [History queries](../../../packages/domain/src/store/history-reads.ts) select relevant Task events, or committed Profile SSE events, before OpLogEntry decoding. The Task predicate exhaustively covers the event-kind union, both lifecycle versions, dependency endpoints, rejected witnesses and redacted replay facts. The embedded-NUL witness regression preserves the old NonEmptyString semantics. SSE reads its global high-water cursor and selected entries in one deferred read snapshot. Skipped rejected and foreign rows still advance the cursor without decoding them. The cursor never moves backwards before a generation reset.

The two new domain implementation files are the links above. The new domain test is [client-projection.test.ts](../../../packages/domain/test/client-projection.test.ts). The existing full command-state loader remains for command/Revert paths; this unit's no-History claim covers server read routes. It does not claim to optimize every CLI or mutation pre-read.

## ADR-0007 and projection integrity

[ADR-0007](../../adr/0007-operation-log-is-the-source-of-truth.md) permits guarded, derived projections. No read-time comparison of replay with projection existed in the old broad loader: it decoded both datasets but never compared them. Removing that unused decode removes no consistency check. Generated Task columns, projection write guards, before-value and Version validation, and atomic event/projection commits remain. Rebuild, checkpoint replay, Purge and restore retain their original implementations. The compiled operation-log/DAG proofs check literal rows, guarded direct-write refusals and full/checkpoint replay.

Every mapped AtomicCAS body, including the store constructor, transaction, historySync, append, validation, rejection, checkpoint and replay, is byte-identical to the pinned base. The store's read methods outside that mapping changed; covered bodies moved lines. All other covered files, models, configs, fixtures and invariants are unchanged. Both real-code breaks failed behavioral enumeration with exit 1, exact source was restored, and the restored command and final command exited 0. The pin renewal documents only that reviewed line movement. It does not extend AtomicCAS to graph reads or SSE.

## Differential control

The test-only baseline is compiled from exact e69230f9 product blobs by `build-read-control.ts before`; no legacy read implementation remains in production routing. The initial baseline binary and raw HTTP control preceded implementation. The no-History behavior regression was added after the first candidate, then run against exact original product files, where it failed, and against the candidate, where it passed. That regression did not follow the requested test-before-edit chronology. The later cursor regression did: an array result failed the literal global-cursor expectation before the cursor fix. A final boundary regression also failed before its fix: a diagnostics callback mutated the request object after the credential check, and the candidate returned the other Profile's Task. Projection callbacks now receive the captured parsed Profile that was authorized; the literal scoped-Task assertion passes. The original full loader already read its parsed request Profile.

The accepted matrix has 56 original checkpoints, the report's 36 base, eight empty-Profile and 12 rich checkpoints, plus one audited lifecycle fixture. It compares 25,147 status/body pairs on each side, including 1,267 lifecycle requests. Bodies are compared as base64-encoded bytes, not parsed or reordered JSON. Coverage includes:

- Profile lists with and without Projects, prefix lookup, all four planning views, Projects, Tags, default/closed/all/Ready/Blocked/ordered/search/prefix Task reads, Show, graph and Task History.
- Health/OpenAPI, credential lists, Snapshot list and successful/missing Show, successful/missing image reads, quick-add parsing and bounded SSE catch-up.
- Owner, scoped read-only/read-write and unscoped Tokens, a revoked deleted-Profile Token, invalid/missing credentials, absent/deleted Profiles and Tasks, malformed/unknown queries, empty results, metadata, copied images, Series/Occurrences, Dependencies, deleted/purged Tasks and old v1 events.

The lifecycle seeder now asserts successful Purge, absence of its Task, exactly three expected rejections, and coverage of every supported event kind, counting original kinds retained by redaction. It includes restore generation metadata and requests the purged Task's History explicitly. Earlier lifecycle receipts with a rejected malformed Purge are excluded from this coverage claim. The audited fixture and all 56 checkpoint controls pass against final product 35d67908.

Date and Effect wall clocks are fixed only for parity; timers and monotonic time remain functional. Build identity is fixed in the test comparator so health can be compared; the normal delivery binary reports build 35d67908 and the unchanged contract. One private Snapshot directory persists across each pair so file ids and paths match. Managed image bytes belong to the private fixture. The SSE comparator sends the matching generation and reads a bounded complete prefix before canceling its own reader.

Auth History fields and event timestamps, plus diagnostic credential last-use values, compare equal. SQLite's physical recorded_at clock is naturally different across processes and is excluded from that durable-row comparison. Diagnostics' memory, uptime and latency measurements are inherently process-dependent; those volatile values are not claimed byte-identical. Its nonvolatile credential projection is compared. Error statuses, tags, exit pairs, scope/refusal ordering and selected-Profile History remain unchanged.

A final review found two verification issues in the inherited recipes. The Profile migration driver still expected schema 6 although this base and its skill require 7; its unchanged 7 result first failed, then passed the corrected literal. The HTTP expired-credential test raced scheduler deletion. A forced cleanup interval reproduced invalid_credential on the original compiled build. A scratch-only delete guard now retains the row so the unchanged strict expired assertion tests expiry rather than absence. The forced interval and complete CLI suite then passed. Neither change modifies production auth or scheduling.

## Measurement method

The source report and harness are exactly commit 28602ee2bdbb1926feb89e9a1b681a902c39ffde. Their current worktree bytes were checked against those blobs. The reusable preparation script copies its 56 scratch checkpoints and makes an ignored adapter of its driver. The adapter retains literal status, count, view membership and request-correlation assertions; alternates before/after for each pair; and requires zero operation decodes after the fix. Newer Diagnostics stage/detail assertions unavailable under contract 78a2be44 are omitted, not replaced with zeros.

The timing binaries add only the same middleware handler header, request echo and operation-decode counter. They do not change the API schema or product sources. The interval is the existing diagnostics middleware's handler entry to pre-response handoff. Network/body-end client intervals are retained separately. The counter adds baseline observer work; these are instrumented compiled measurements, not a promise of exact installed latency. The earlier source CPU profile in the measurement report identifies JSON/OpLogEntry materialization as the old limiter; this run directly verifies its removal. Current Task decoding, graph/filter work, SQLite and encoding remain. Their separate post-fix CPU shares are not measured.

There are 16 factorial corners, 15/178 Tasks per populated Profile, one/eight Profiles, 32/2,048 edits and null/large deleted text, plus two 178-total-Task/eight-Profile shapes with seven empty Profiles. Both request orders run five fresh-process pairs and three passes. No health/sign-in request precedes the first timed read. Within a pair, order alternates A/B then B/A. First-use means each route's first call in a fresh process. Later routes in that pass can benefit from earlier calls; it does not mean flushed OS caches or cold disk. Tables report five-run medians and min/max ranges, milliseconds. Warm means the second pass; the third remains in raw receipts.

Expected claim before the final run: removing unrelated History decoding reduces handler latency at the factorial corners; the run must still perform and validate every response. All 8,640 responses were 200 and validated, with no retries or timeouts. All 4,320 after-observations decoded zero operation entries. The largest populated fixture has 1,424 live Tasks across eight Profiles, not 178 total, and 3,480 operations. Before, its eight reads decode 52,200 operations per refresh, including 27,840 for /profiles; after, zero. The owner-shaped empty-Profile fixture has 178 total live Tasks and 2,234 operations.

The machine has 10 logical CPUs. This is ambient load, with one-minute boundary loads 5.45 to 7.03. No pressure workers, cache purge or database setting changes were used. Timings use the real clock and normal live scheduler. The accepted final sweep ran after this worker's builds, functional controls and root/subsystem checks had finished. Host activity from other work was not controlled; pairing limits that drift. No quiet-host or pressure conclusion is claimed. Earlier complete sweeps preceded the cursor or authorization-boundary follow-ups; they remain exploratory evidence and are not substituted for this table.

### Profile counts and refresh sums

Case ids encode Tasks per populated Profile, Profile count, large deleted text and extra edits. The table also states total live Tasks and total operation count. Warm Profile-first order:

| Fixture | Total live Tasks | Ops | Warm /profiles before | After | Warm eight-handler sum before | After |
| --- | ---: | ---: | --- | --- | --- | --- |
| n15-p1-large0-h32 | 15 | 55 | 1.12 [1.06, 1.17] | 0.18 [0.16, 0.24] | 6.65 [5.62, 8.30] | 1.91 [1.69, 2.60] |
| n15-p1-large0-h2048 | 15 | 2071 | 16.77 [15.91, 17.53] | 0.31 [0.17, 0.36] | 144.68 [140.18, 152.35] | 2.05 [1.74, 2.98] |
| n15-p1-large1-h32 | 15 | 55 | 1.50 [1.48, 1.57] | 0.17 [0.16, 0.21] | 13.60 [12.42, 15.07] | 5.81 [5.36, 6.36] |
| n15-p1-large1-h2048 | 15 | 2071 | 17.19 [16.65, 19.09] | 0.20 [0.16, 0.61] | 138.97 [131.94, 158.19] | 2.66 [2.22, 4.37] |
| n15-p8-large0-h32 | 120 | 160 | 17.96 [12.11, 18.53] | 0.46 [0.38, 0.95] | 33.95 [24.53, 37.30] | 3.20 [2.02, 5.39] |
| n15-p8-large0-h2048 | 120 | 2176 | 147.09 [138.54, 155.39] | 0.35 [0.29, 0.51] | 275.18 [260.98, 301.58] | 2.01 [1.57, 2.58] |
| n15-p8-large1-h32 | 120 | 160 | 20.99 [16.32, 21.90] | 0.35 [0.28, 0.42] | 39.76 [35.48, 42.50] | 5.23 [2.76, 5.84] |
| n15-p8-large1-h2048 | 120 | 2176 | 139.16 [107.70, 165.97] | 0.51 [0.22, 0.55] | 254.58 [201.93, 301.23] | 2.81 [1.72, 3.62] |
| n178-p1-large0-h32 | 178 | 218 | 2.93 [2.08, 3.33] | 0.36 [0.23, 0.48] | 27.37 [20.84, 33.63] | 6.73 [5.14, 7.53] |
| n178-p1-large0-h2048 | 178 | 2234 | 26.21 [23.75, 28.93] | 0.25 [0.23, 0.49] | 183.68 [170.16, 193.49] | 6.12 [5.37, 9.65] |
| n178-p1-large1-h32 | 178 | 218 | 3.06 [2.68, 4.85] | 0.26 [0.25, 0.56] | 30.27 [27.48, 39.90] | 10.68 [8.76, 12.21] |
| n178-p1-large1-h2048 | 178 | 2234 | 22.75 [21.13, 24.79] | 0.31 [0.26, 0.56] | 183.96 [175.73, 248.54] | 6.61 [6.22, 11.40] |
| n178-p8-large0-h32 | 1424 | 1464 | 126.61 [124.47, 142.08] | 1.07 [0.95, 1.44] | 254.14 [240.88, 294.50] | 6.65 [5.94, 7.95] |
| n178-p8-large0-h2048 | 1424 | 3480 | 283.46 [270.35, 323.67] | 1.07 [0.99, 1.35] | 585.20 [508.43, 600.51] | 7.38 [6.07, 8.63] |
| n178-p8-large1-h32 | 1424 | 1464 | 111.39 [90.13, 148.68] | 0.87 [0.80, 1.52] | 209.96 [172.81, 323.36] | 9.11 [8.18, 14.75] |
| n178-p8-large1-h2048 | 1424 | 3480 | 196.66 [194.12, 201.26] | 0.75 [0.69, 0.93] | 377.13 [366.09, 381.52] | 4.87 [4.70, 5.61] |
| n178-p8-empty-large0-h2048 | 178 | 2234 | 182.30 [153.21, 299.90] | 0.60 [0.31, 0.99] | 345.06 [290.84, 549.23] | 6.26 [5.27, 15.32] |
| n178-p8-empty-large1-h2048 | 178 | 2234 | 218.48 [211.41, 254.24] | 0.63 [0.41, 0.74] | 437.62 [403.43, 457.25] | 10.40 [6.38, 13.33] |

### Every route at every corner

Primary order is profiles, tags, tasks, overdue, projects, inbox, today, scheduled. The last two columns use the alternate order with profiles last. First-use and warm ranges overlap for some small cells; no precise small-cell multiplier is claimed.

| Fixture / route | First-use before | First-use after | Warm before | Warm after | Profiles-last warm before | Profiles-last warm after |
| --- | --- | --- | --- | --- | --- | --- |
| n15-p1-large0-h32 / profiles | 3.22 [2.81, 3.63] | 1.97 [1.65, 2.11] | 1.12 [1.06, 1.17] | 0.18 [0.16, 0.24] | 1.34 [0.83, 4.33] | 0.16 [0.14, 0.24] |
| n15-p1-large0-h32 / tags | 1.28 [1.16, 1.38] | 0.42 [0.36, 0.45] | 0.81 [0.70, 0.85] | 0.13 [0.12, 0.18] | 1.10 [0.97, 1.47] | 0.12 [0.12, 0.13] |
| n15-p1-large0-h32 / tasks | 1.96 [1.84, 2.09] | 1.20 [1.12, 1.32] | 0.97 [0.76, 1.93] | 0.38 [0.33, 0.49] | 1.25 [1.03, 1.99] | 0.39 [0.39, 0.41] |
| n15-p1-large0-h32 / overdue | 1.54 [1.37, 1.65] | 0.84 [0.74, 1.05] | 0.76 [0.66, 1.39] | 0.28 [0.23, 0.41] | 1.22 [0.87, 1.38] | 0.27 [0.26, 0.66] |
| n15-p1-large0-h32 / projects | 1.09 [0.99, 1.21] | 0.28 [0.23, 0.39] | 0.77 [0.60, 0.86] | 0.11 [0.10, 0.14] | 0.95 [0.80, 1.88] | 0.13 [0.11, 0.25] |
| n15-p1-large0-h32 / inbox | 0.90 [0.75, 0.95] | 0.42 [0.36, 0.68] | 0.75 [0.60, 0.77] | 0.32 [0.27, 0.55] | 1.24 [0.94, 1.45] | 0.45 [0.31, 0.54] |
| n15-p1-large0-h32 / today | 0.96 [0.72, 1.03] | 0.33 [0.27, 0.42] | 0.68 [0.55, 0.72] | 0.25 [0.22, 0.33] | 0.99 [0.78, 1.41] | 0.26 [0.24, 0.36] |
| n15-p1-large0-h32 / scheduled | 1.04 [0.75, 1.13] | 0.36 [0.33, 0.49] | 0.67 [0.54, 0.88] | 0.25 [0.19, 0.27] | 0.81 [0.69, 1.38] | 0.25 [0.21, 0.36] |
| n15-p1-large0-h2048 / profiles | 28.52 [25.01, 31.16] | 2.19 [2.09, 2.45] | 16.77 [15.91, 17.53] | 0.31 [0.17, 0.36] | 17.66 [15.73, 22.17] | 0.18 [0.13, 0.26] |
| n15-p1-large0-h2048 / tags | 24.30 [22.70, 28.62] | 0.52 [0.45, 0.59] | 19.00 [17.80, 19.20] | 0.16 [0.13, 0.29] | 18.55 [15.32, 22.24] | 0.16 [0.12, 0.30] |
| n15-p1-large0-h2048 / tasks | 21.61 [20.64, 22.94] | 1.38 [1.18, 1.75] | 18.81 [17.97, 19.18] | 0.36 [0.31, 0.39] | 18.83 [17.22, 23.92] | 0.36 [0.35, 0.47] |
| n15-p1-large0-h2048 / overdue | 18.61 [17.63, 19.68] | 0.86 [0.79, 1.06] | 16.99 [15.66, 18.28] | 0.32 [0.22, 0.58] | 18.66 [16.91, 22.65] | 0.25 [0.22, 0.40] |
| n15-p1-large0-h2048 / projects | 20.74 [20.06, 24.27] | 0.33 [0.27, 0.44] | 18.33 [17.57, 18.98] | 0.14 [0.09, 0.33] | 17.80 [15.70, 18.85] | 0.12 [0.10, 0.20] |
| n15-p1-large0-h2048 / inbox | 19.64 [19.21, 20.09] | 0.36 [0.32, 0.40] | 16.84 [15.93, 18.46] | 0.30 [0.26, 0.41] | 20.53 [17.94, 21.87] | 0.28 [0.24, 0.41] |
| n15-p1-large0-h2048 / today | 17.31 [16.70, 17.78] | 0.61 [0.24, 0.69] | 19.94 [16.18, 23.07] | 0.24 [0.21, 0.33] | 16.70 [16.40, 20.98] | 0.20 [0.19, 0.28] |
| n15-p1-large0-h2048 / scheduled | 18.59 [18.47, 18.87] | 0.45 [0.27, 0.61] | 19.67 [17.96, 19.79] | 0.24 [0.20, 0.41] | 18.98 [17.85, 21.58] | 0.23 [0.19, 0.25] |
| n15-p1-large1-h32 / profiles | 4.13 [4.07, 4.58] | 2.03 [1.96, 2.30] | 1.50 [1.48, 1.57] | 0.17 [0.16, 0.21] | 1.16 [1.07, 1.20] | 0.25 [0.20, 0.29] |
| n15-p1-large1-h32 / tags | 2.25 [1.85, 2.67] | 0.49 [0.42, 0.56] | 1.34 [1.24, 1.96] | 0.13 [0.12, 0.14] | 1.43 [1.25, 1.76] | 0.15 [0.12, 0.25] |
| n15-p1-large1-h32 / tasks | 5.49 [5.31, 6.24] | 1.50 [1.37, 1.67] | 1.60 [1.48, 1.93] | 0.54 [0.50, 0.55] | 1.54 [1.51, 2.10] | 0.55 [0.52, 0.80] |
| n15-p1-large1-h32 / overdue | 2.27 [1.89, 2.54] | 1.04 [0.96, 1.26] | 2.11 [1.35, 4.98] | 0.50 [0.40, 0.62] | 1.16 [1.14, 2.06] | 0.41 [0.41, 0.69] |
| n15-p1-large1-h32 / projects | 1.63 [1.49, 1.73] | 0.28 [0.26, 0.63] | 1.70 [1.30, 2.43] | 0.14 [0.10, 0.29] | 2.87 [2.32, 3.04] | 0.14 [0.11, 0.37] |
| n15-p1-large1-h32 / inbox | 1.42 [1.37, 1.54] | 0.54 [0.53, 0.87] | 1.52 [1.20, 1.74] | 0.50 [0.44, 0.86] | 1.61 [1.56, 1.80] | 0.45 [0.38, 0.69] |
| n15-p1-large1-h32 / today | 4.33 [1.53, 4.44] | 0.44 [0.43, 0.73] | 1.51 [1.16, 1.98] | 3.01 [2.83, 3.73] | 1.26 [1.14, 1.50] | 2.60 [0.34, 3.06] |
| n15-p1-large1-h32 / scheduled | 2.25 [1.70, 3.94] | 0.49 [0.44, 0.61] | 1.32 [1.06, 1.88] | 0.54 [0.51, 0.66] | 1.14 [1.03, 1.25] | 0.67 [0.52, 2.28] |
| n15-p1-large1-h2048 / profiles | 25.08 [20.71, 28.53] | 2.16 [2.00, 2.30] | 17.19 [16.65, 19.09] | 0.20 [0.16, 0.61] | 16.82 [15.02, 19.08] | 0.16 [0.14, 0.17] |
| n15-p1-large1-h2048 / tags | 20.36 [16.66, 22.25] | 0.46 [0.44, 0.47] | 19.13 [16.25, 25.15] | 0.18 [0.13, 0.23] | 17.68 [16.19, 20.35] | 0.16 [0.12, 0.20] |
| n15-p1-large1-h2048 / tasks | 21.61 [20.77, 22.58] | 1.37 [1.30, 1.50] | 17.58 [16.48, 22.62] | 0.55 [0.43, 0.77] | 21.32 [19.74, 23.90] | 0.50 [0.44, 0.56] |
| n15-p1-large1-h2048 / overdue | 20.98 [19.58, 22.15] | 0.96 [0.88, 1.05] | 15.87 [15.03, 20.40] | 0.40 [0.36, 0.46] | 19.02 [18.27, 19.53] | 0.35 [0.33, 0.39] |
| n15-p1-large1-h2048 / projects | 21.06 [20.14, 21.58] | 0.28 [0.25, 0.37] | 16.68 [15.84, 17.80] | 0.11 [0.10, 0.18] | 18.99 [18.19, 21.83] | 0.11 [0.11, 0.15] |
| n15-p1-large1-h2048 / inbox | 19.26 [17.17, 20.07] | 0.51 [0.47, 2.69] | 17.52 [15.44, 18.87] | 0.42 [0.35, 0.57] | 18.23 [16.00, 20.01] | 0.39 [0.39, 0.50] |
| n15-p1-large1-h2048 / today | 18.89 [17.91, 19.67] | 0.55 [0.38, 2.33] | 18.12 [15.35, 19.27] | 0.33 [0.31, 1.08] | 16.83 [16.19, 18.68] | 0.37 [0.31, 0.45] |
| n15-p1-large1-h2048 / scheduled | 18.95 [18.23, 20.29] | 0.60 [0.39, 0.88] | 17.49 [16.94, 17.71] | 0.32 [0.28, 0.85] | 18.24 [15.92, 21.18] | 0.34 [0.31, 0.35] |
| n15-p8-large0-h32 / profiles | 26.75 [19.42, 28.53] | 2.80 [2.65, 2.92] | 17.96 [12.11, 18.53] | 0.46 [0.38, 0.95] | 16.30 [13.96, 16.76] | 0.35 [0.30, 0.54] |
| n15-p8-large0-h32 / tags | 2.55 [2.10, 2.64] | 0.61 [0.61, 0.79] | 2.52 [1.48, 4.25] | 0.27 [0.15, 0.97] | 2.68 [2.41, 5.39] | 0.14 [0.13, 0.21] |
| n15-p8-large0-h32 / tasks | 3.81 [3.15, 4.12] | 1.53 [1.38, 2.16] | 2.61 [2.48, 4.88] | 0.62 [0.38, 1.37] | 2.90 [2.42, 3.96] | 0.41 [0.35, 0.51] |
| n15-p8-large0-h32 / overdue | 2.60 [2.34, 3.48] | 1.10 [0.89, 1.44] | 1.77 [1.62, 1.88] | 0.49 [0.24, 0.58] | 2.02 [1.78, 2.39] | 0.26 [0.23, 0.34] |
| n15-p8-large0-h32 / projects | 2.24 [1.86, 3.19] | 0.52 [0.45, 0.68] | 1.70 [1.43, 4.06] | 0.17 [0.12, 0.20] | 1.82 [1.73, 2.96] | 0.12 [0.11, 0.18] |
| n15-p8-large0-h32 / inbox | 2.07 [1.61, 2.16] | 0.49 [0.44, 1.01] | 1.95 [1.53, 2.11] | 0.42 [0.28, 0.69] | 2.14 [1.83, 3.44] | 0.40 [0.26, 0.50] |
| n15-p8-large0-h32 / today | 1.91 [1.64, 3.56] | 0.52 [0.40, 0.78] | 1.81 [1.48, 2.30] | 0.29 [0.25, 0.51] | 1.93 [1.73, 3.49] | 0.32 [0.27, 0.53] |
| n15-p8-large0-h32 / scheduled | 3.36 [1.68, 5.08] | 0.42 [0.34, 0.49] | 2.18 [1.39, 3.67] | 0.29 [0.22, 0.51] | 2.52 [1.70, 3.30] | 0.29 [0.27, 0.69] |
| n15-p8-large0-h2048 / profiles | 166.30 [157.19, 183.94] | 2.54 [2.29, 3.12] | 147.09 [138.54, 155.39] | 0.35 [0.29, 0.51] | 171.91 [143.07, 208.32] | 0.33 [0.24, 0.68] |
| n15-p8-large0-h2048 / tags | 20.86 [19.85, 22.07] | 0.52 [0.50, 0.83] | 19.41 [16.04, 20.34] | 0.17 [0.13, 0.24] | 20.57 [15.32, 22.19] | 0.15 [0.13, 0.34] |
| n15-p8-large0-h2048 / tasks | 23.49 [19.00, 30.96] | 1.43 [1.13, 1.89] | 18.67 [18.12, 21.59] | 0.38 [0.31, 0.48] | 20.72 [17.12, 24.68] | 0.45 [0.33, 0.51] |
| n15-p8-large0-h2048 / overdue | 22.19 [21.18, 23.69] | 0.95 [0.71, 1.27] | 18.97 [17.12, 19.88] | 0.24 [0.19, 0.36] | 18.76 [16.97, 25.00] | 0.29 [0.22, 0.60] |
| n15-p8-large0-h2048 / projects | 20.44 [19.35, 21.26] | 0.39 [0.25, 0.48] | 17.83 [15.82, 22.36] | 0.11 [0.09, 0.17] | 20.39 [15.93, 23.46] | 0.14 [0.10, 0.35] |
| n15-p8-large0-h2048 / inbox | 18.95 [16.31, 20.22] | 0.40 [0.29, 0.46] | 18.55 [15.79, 21.94] | 0.33 [0.21, 0.37] | 22.32 [17.10, 22.87] | 0.29 [0.24, 0.64] |
| n15-p8-large0-h2048 / today | 17.93 [17.43, 19.96] | 0.30 [0.24, 0.53] | 19.04 [16.77, 22.56] | 0.23 [0.18, 0.26] | 20.17 [15.83, 26.93] | 0.22 [0.20, 0.41] |
| n15-p8-large0-h2048 / scheduled | 18.81 [17.53, 20.38] | 0.34 [0.23, 0.49] | 17.71 [16.39, 23.27] | 0.21 [0.16, 0.26] | 20.17 [19.06, 23.72] | 0.21 [0.18, 0.29] |
| n15-p8-large1-h32 / profiles | 26.67 [22.61, 29.45] | 2.31 [1.99, 2.45] | 20.99 [16.32, 21.90] | 0.35 [0.28, 0.42] | 20.63 [19.58, 23.67] | 0.35 [0.33, 0.60] |
| n15-p8-large1-h32 / tags | 2.60 [2.20, 4.83] | 0.48 [0.43, 0.64] | 2.01 [1.78, 2.31] | 0.14 [0.11, 0.16] | 2.54 [2.20, 2.59] | 0.22 [0.16, 0.37] |
| n15-p8-large1-h32 / tasks | 4.63 [4.30, 5.58] | 1.36 [1.23, 1.60] | 4.26 [2.45, 6.78] | 0.52 [0.40, 0.62] | 4.87 [4.30, 5.79] | 0.58 [0.53, 0.87] |
| n15-p8-large1-h32 / overdue | 3.08 [2.66, 3.23] | 1.10 [0.88, 1.25] | 2.21 [1.92, 2.68] | 2.61 [0.36, 3.23] | 2.48 [2.04, 3.27] | 2.90 [0.37, 3.59] |
| n15-p8-large1-h32 / projects | 2.70 [2.25, 2.91] | 0.34 [0.27, 0.38] | 2.41 [2.21, 3.32] | 0.22 [0.22, 0.29] | 2.52 [1.97, 2.86] | 0.24 [0.11, 0.41] |
| n15-p8-large1-h32 / inbox | 3.67 [3.23, 4.64] | 0.49 [0.46, 0.69] | 2.31 [2.09, 4.09] | 0.57 [0.50, 0.63] | 3.76 [2.56, 4.33] | 0.65 [0.51, 2.39] |
| n15-p8-large1-h32 / today | 2.22 [1.89, 2.69] | 0.43 [0.36, 0.70] | 2.43 [2.04, 4.50] | 0.40 [0.37, 0.48] | 2.92 [2.42, 6.75] | 0.49 [0.37, 0.57] |
| n15-p8-large1-h32 / scheduled | 2.90 [1.92, 3.08] | 0.44 [0.38, 0.60] | 2.08 [2.02, 2.30] | 0.34 [0.31, 0.48] | 2.35 [2.20, 3.58] | 0.36 [0.32, 0.39] |
| n15-p8-large1-h2048 / profiles | 144.83 [116.06, 202.11] | 2.25 [1.70, 4.16] | 139.16 [107.70, 165.97] | 0.51 [0.22, 0.55] | 113.18 [103.07, 141.21] | 0.20 [0.18, 0.24] |
| n15-p8-large1-h2048 / tags | 18.22 [15.63, 24.09] | 0.48 [0.37, 1.03] | 15.67 [13.04, 18.56] | 0.18 [0.10, 0.27] | 14.44 [13.35, 17.49] | 0.12 [0.09, 0.15] |
| n15-p8-large1-h2048 / tasks | 20.18 [14.57, 25.18] | 1.30 [0.98, 1.79] | 17.18 [16.10, 20.95] | 0.50 [0.34, 0.61] | 14.46 [13.15, 18.90] | 0.40 [0.34, 0.51] |
| n15-p8-large1-h2048 / overdue | 19.85 [15.23, 24.43] | 1.20 [0.66, 4.12] | 16.64 [12.28, 22.42] | 0.37 [0.26, 0.70] | 14.68 [13.60, 19.02] | 0.29 [0.24, 0.34] |
| n15-p8-large1-h2048 / projects | 17.55 [13.34, 21.39] | 0.34 [0.19, 0.65] | 18.18 [13.20, 30.53] | 0.11 [0.07, 0.21] | 13.86 [12.17, 17.60] | 0.09 [0.08, 0.14] |
| n15-p8-large1-h2048 / inbox | 18.46 [15.24, 24.99] | 0.66 [0.34, 0.79] | 18.64 [12.26, 23.45] | 0.38 [0.27, 0.52] | 15.28 [13.32, 18.67] | 0.32 [0.27, 0.32] |
| n15-p8-large1-h2048 / today | 19.91 [13.24, 20.32] | 0.51 [0.26, 0.87] | 16.58 [13.35, 20.79] | 0.30 [0.23, 0.40] | 15.19 [13.91, 16.35] | 0.26 [0.24, 0.37] |
| n15-p8-large1-h2048 / scheduled | 18.54 [14.53, 22.22] | 0.58 [0.34, 0.72] | 15.11 [14.01, 19.03] | 0.29 [0.23, 0.53] | 15.38 [12.25, 17.81] | 0.26 [0.22, 0.31] |
| n178-p1-large0-h32 / profiles | 5.52 [4.96, 12.95] | 2.17 [1.78, 2.76] | 2.93 [2.08, 3.33] | 0.36 [0.23, 0.48] | 2.75 [2.50, 4.85] | 0.25 [0.22, 0.48] |
| n178-p1-large0-h32 / tags | 6.31 [4.66, 7.70] | 0.57 [0.37, 0.97] | 4.33 [3.33, 8.05] | 0.15 [0.11, 0.20] | 2.85 [2.63, 5.07] | 0.16 [0.16, 0.50] |
| n178-p1-large0-h32 / tasks | 6.09 [4.55, 6.48] | 3.00 [2.38, 3.99] | 4.32 [3.29, 5.38] | 1.69 [1.40, 1.87] | 6.19 [5.72, 7.00] | 1.83 [1.74, 2.36] |
| n178-p1-large0-h32 / overdue | 3.75 [2.83, 4.36] | 1.76 [1.38, 2.33] | 2.62 [2.07, 3.78] | 1.10 [0.84, 1.50] | 3.05 [2.73, 4.55] | 1.26 [1.01, 2.34] |
| n178-p1-large0-h32 / projects | 3.40 [2.55, 5.50] | 0.37 [0.25, 0.57] | 2.97 [2.30, 4.19] | 0.18 [0.10, 0.19] | 2.88 [2.45, 5.06] | 0.18 [0.14, 0.39] |
| n178-p1-large0-h32 / inbox | 4.42 [3.18, 5.57] | 1.28 [1.03, 2.38] | 3.95 [2.46, 4.90] | 1.09 [0.86, 1.20] | 4.31 [3.05, 4.90] | 1.19 [1.09, 1.59] |
| n178-p1-large0-h32 / today | 2.67 [2.18, 3.19] | 2.86 [1.41, 4.11] | 2.89 [2.06, 4.83] | 0.92 [0.80, 1.11] | 2.92 [2.58, 4.61] | 0.99 [0.88, 1.98] |
| n178-p1-large0-h32 / scheduled | 2.66 [2.17, 2.99] | 1.21 [0.99, 1.43] | 3.02 [2.18, 3.15] | 0.91 [0.76, 1.19] | 3.06 [2.61, 5.40] | 0.95 [0.88, 1.55] |
| n178-p1-large0-h2048 / profiles | 31.53 [29.02, 35.40] | 2.31 [1.95, 2.78] | 26.21 [23.75, 28.93] | 0.25 [0.23, 0.49] | 23.26 [19.31, 30.64] | 0.24 [0.21, 0.64] |
| n178-p1-large0-h2048 / tags | 28.13 [25.36, 30.79] | 0.50 [0.41, 0.76] | 21.39 [19.45, 22.67] | 0.13 [0.12, 0.22] | 24.34 [22.91, 27.45] | 0.18 [0.12, 0.53] |
| n178-p1-large0-h2048 / tasks | 31.78 [27.59, 35.12] | 2.53 [2.34, 2.95] | 23.49 [21.77, 24.93] | 1.49 [1.44, 2.33] | 22.68 [22.10, 28.31] | 1.61 [1.40, 2.12] |
| n178-p1-large0-h2048 / overdue | 22.76 [21.31, 29.55] | 2.05 [1.69, 3.65] | 22.30 [20.72, 23.47] | 1.06 [0.82, 1.28] | 23.58 [20.44, 28.75] | 1.01 [0.83, 1.45] |
| n178-p1-large0-h2048 / projects | 23.18 [22.08, 26.50] | 0.39 [0.31, 0.49] | 20.32 [19.50, 23.16] | 0.15 [0.12, 0.25] | 23.35 [21.58, 25.92] | 0.15 [0.11, 0.32] |
| n178-p1-large0-h2048 / inbox | 26.26 [22.24, 28.86] | 1.16 [1.08, 1.39] | 22.48 [20.32, 23.92] | 1.11 [0.97, 3.59] | 22.08 [19.93, 25.80] | 1.26 [0.91, 3.25] |
| n178-p1-large0-h2048 / today | 24.13 [20.87, 27.50] | 0.91 [0.84, 1.20] | 21.30 [20.54, 27.41] | 0.92 [0.75, 1.84] | 23.59 [20.47, 25.93] | 1.00 [0.86, 1.35] |
| n178-p1-large0-h2048 / scheduled | 23.38 [20.98, 29.08] | 0.91 [0.84, 1.08] | 22.39 [19.20, 25.40] | 1.03 [0.73, 1.20] | 25.80 [21.14, 28.47] | 0.87 [0.81, 1.17] |
| n178-p1-large1-h32 / profiles | 9.12 [7.81, 10.06] | 2.21 [2.01, 3.56] | 3.06 [2.68, 4.85] | 0.26 [0.25, 0.56] | 2.78 [2.62, 3.87] | 0.26 [0.25, 0.31] |
| n178-p1-large1-h32 / tags | 4.20 [3.43, 5.09] | 0.48 [0.44, 0.95] | 3.54 [2.72, 4.33] | 0.14 [0.13, 0.20] | 3.40 [2.90, 3.61] | 0.17 [0.13, 0.53] |
| n178-p1-large1-h32 / tasks | 10.46 [7.07, 12.07] | 5.85 [4.86, 7.08] | 5.26 [4.62, 6.71] | 1.88 [1.66, 2.08] | 4.22 [3.97, 5.28] | 2.02 [1.82, 2.55] |
| n178-p1-large1-h32 / overdue | 5.10 [3.83, 5.33] | 2.37 [2.08, 3.32] | 3.41 [3.01, 4.03] | 2.57 [1.19, 4.40] | 2.86 [2.76, 3.28] | 2.49 [1.32, 2.94] |
| n178-p1-large1-h32 / projects | 6.65 [3.64, 9.24] | 0.58 [0.39, 0.97] | 3.07 [2.65, 5.30] | 0.22 [0.20, 0.39] | 3.06 [2.80, 4.09] | 0.24 [0.14, 0.26] |
| n178-p1-large1-h32 / inbox | 6.52 [3.34, 7.74] | 1.53 [1.38, 1.85] | 3.98 [3.07, 4.94] | 1.79 [1.31, 2.95] | 3.42 [2.98, 4.91] | 1.39 [1.37, 3.56] |
| n178-p1-large1-h32 / today | 3.48 [2.88, 4.93] | 1.17 [1.06, 1.64] | 5.15 [2.88, 7.11] | 1.33 [1.01, 3.31] | 2.83 [2.62, 4.30] | 1.08 [1.05, 1.48] |
| n178-p1-large1-h32 / scheduled | 3.55 [2.66, 11.04] | 1.18 [1.02, 1.88] | 3.56 [3.03, 6.13] | 1.54 [1.28, 1.67] | 2.89 [2.64, 4.07] | 1.12 [1.07, 1.25] |
| n178-p1-large1-h2048 / profiles | 27.14 [25.67, 31.54] | 2.67 [2.10, 2.97] | 22.75 [21.13, 24.79] | 0.31 [0.26, 0.56] | 25.41 [21.58, 25.82] | 0.21 [0.20, 0.49] |
| n178-p1-large1-h2048 / tags | 27.55 [23.96, 29.17] | 0.52 [0.44, 0.88] | 24.09 [20.95, 26.78] | 0.14 [0.13, 0.23] | 23.45 [22.82, 24.79] | 0.15 [0.14, 0.38] |
| n178-p1-large1-h2048 / tasks | 32.94 [27.38, 36.84] | 2.98 [2.66, 3.70] | 26.68 [23.18, 29.86] | 1.72 [1.65, 2.29] | 26.03 [21.82, 30.19] | 1.71 [1.60, 2.67] |
| n178-p1-large1-h2048 / overdue | 27.36 [23.09, 34.29] | 2.84 [2.29, 3.41] | 22.73 [20.42, 26.16] | 1.05 [1.02, 2.90] | 23.32 [22.14, 25.94] | 0.98 [0.95, 1.58] |
| n178-p1-large1-h2048 / projects | 24.18 [23.75, 56.84] | 0.52 [0.36, 1.11] | 21.83 [21.78, 25.19] | 0.14 [0.11, 0.60] | 21.79 [20.45, 24.41] | 0.14 [0.12, 0.23] |
| n178-p1-large1-h2048 / inbox | 23.99 [22.19, 31.64] | 1.47 [1.26, 3.65] | 22.60 [20.29, 25.24] | 1.18 [1.05, 1.73] | 24.67 [23.17, 29.24] | 1.03 [0.97, 1.51] |
| n178-p1-large1-h2048 / today | 24.40 [22.68, 27.15] | 1.43 [0.99, 3.33] | 22.07 [20.68, 57.15] | 1.05 [0.93, 1.60] | 26.03 [19.90, 29.77] | 1.05 [0.96, 1.26] |
| n178-p1-large1-h2048 / scheduled | 23.58 [23.25, 25.39] | 1.28 [1.01, 1.61] | 22.96 [22.00, 35.87] | 1.15 [1.00, 1.60] | 23.22 [21.86, 24.99] | 0.99 [0.94, 1.23] |
| n178-p8-large0-h32 / profiles | 158.61 [137.70, 169.27] | 2.80 [2.68, 3.49] | 126.61 [124.47, 142.08] | 1.07 [0.95, 1.44] | 138.95 [125.66, 156.23] | 1.15 [0.92, 1.25] |
| n178-p8-large0-h32 / tags | 18.89 [17.79, 19.91] | 0.56 [0.44, 0.73] | 17.26 [14.44, 20.42] | 0.16 [0.13, 0.28] | 19.87 [17.56, 20.95] | 0.25 [0.14, 0.35] |
| n178-p8-large0-h32 / tasks | 28.95 [23.78, 30.35] | 2.71 [2.39, 3.10] | 24.98 [21.82, 70.42] | 1.67 [1.47, 2.05] | 28.00 [25.42, 29.54] | 1.78 [1.65, 1.99] |
| n178-p8-large0-h32 / overdue | 17.77 [16.11, 19.20] | 2.67 [1.59, 3.44] | 16.30 [15.03, 19.67] | 0.97 [0.81, 1.23] | 17.38 [16.27, 21.55] | 0.99 [0.87, 1.31] |
| n178-p8-large0-h32 / projects | 18.81 [15.82, 21.91] | 0.50 [0.44, 0.81] | 15.06 [13.99, 17.71] | 0.14 [0.10, 0.24] | 18.21 [15.01, 18.68] | 0.13 [0.13, 0.18] |
| n178-p8-large0-h32 / inbox | 15.91 [14.70, 17.53] | 1.32 [1.14, 2.08] | 16.31 [13.97, 18.18] | 0.90 [0.84, 1.11] | 17.61 [16.54, 23.51] | 1.04 [0.95, 1.28] |
| n178-p8-large0-h32 / today | 16.51 [15.51, 17.63] | 1.30 [0.99, 2.20] | 16.18 [15.24, 18.95] | 0.82 [0.72, 0.86] | 16.26 [13.82, 19.07] | 0.98 [0.83, 1.12] |
| n178-p8-large0-h32 / scheduled | 15.69 [15.42, 19.47] | 1.12 [0.90, 1.34] | 15.44 [14.77, 18.90] | 0.83 [0.75, 1.05] | 17.72 [15.68, 20.20] | 1.04 [0.90, 1.47] |
| n178-p8-large0-h2048 / profiles | 307.75 [291.91, 330.23] | 3.25 [2.78, 4.43] | 283.46 [270.35, 323.67] | 1.07 [0.99, 1.35] | 245.97 [236.13, 284.57] | 1.09 [0.69, 1.20] |
| n178-p8-large0-h2048 / tags | 35.33 [32.87, 40.71] | 0.51 [0.43, 0.90] | 35.71 [33.53, 41.37] | 0.19 [0.14, 0.23] | 29.88 [29.35, 41.12] | 0.20 [0.12, 0.53] |
| n178-p8-large0-h2048 / tasks | 45.28 [41.84, 50.79] | 2.42 [2.28, 3.06] | 48.59 [40.44, 53.28] | 1.70 [1.42, 2.17] | 37.39 [34.68, 49.34] | 1.63 [1.28, 2.77] |
| n178-p8-large0-h2048 / overdue | 35.77 [30.85, 44.37] | 1.66 [1.51, 1.96] | 37.03 [30.24, 48.90] | 1.19 [0.82, 1.69] | 30.02 [27.33, 36.13] | 1.07 [0.78, 1.25] |
| n178-p8-large0-h2048 / projects | 34.29 [30.68, 40.94] | 0.36 [0.27, 0.58] | 36.58 [34.70, 42.40] | 0.15 [0.11, 0.46] | 30.49 [26.98, 34.30] | 0.19 [0.11, 0.21] |
| n178-p8-large0-h2048 / inbox | 37.96 [29.05, 46.07] | 1.15 [0.97, 1.51] | 40.06 [33.85, 42.55] | 1.00 [0.92, 1.33] | 31.10 [29.17, 37.95] | 0.97 [0.78, 1.55] |
| n178-p8-large0-h2048 / today | 33.36 [28.24, 47.98] | 1.02 [0.79, 1.29] | 36.27 [30.21, 58.19] | 0.87 [0.76, 1.03] | 31.21 [28.83, 34.04] | 0.80 [0.64, 1.35] |
| n178-p8-large0-h2048 / scheduled | 35.95 [28.55, 45.02] | 0.93 [0.79, 1.57] | 35.61 [30.93, 38.54] | 0.89 [0.78, 1.09] | 29.57 [27.97, 33.23] | 0.81 [0.65, 1.37] |
| n178-p8-large1-h32 / profiles | 141.05 [103.10, 162.59] | 2.33 [2.19, 3.37] | 111.39 [90.13, 148.68] | 0.87 [0.80, 1.52] | 98.01 [88.17, 105.23] | 0.75 [0.72, 1.51] |
| n178-p8-large1-h32 / tags | 15.75 [11.08, 16.35] | 0.40 [0.33, 1.22] | 14.13 [11.67, 17.26] | 0.11 [0.09, 0.23] | 11.95 [10.67, 12.94] | 0.10 [0.09, 0.12] |
| n178-p8-large1-h32 / tasks | 23.28 [17.37, 26.69] | 1.94 [1.82, 3.23] | 18.82 [16.49, 27.21] | 4.70 [4.13, 7.44] | 17.97 [16.15, 18.58] | 4.06 [3.73, 4.32] |
| n178-p8-large1-h32 / overdue | 14.41 [11.28, 17.73] | 1.20 [1.18, 1.98] | 12.60 [10.04, 24.06] | 0.99 [0.90, 1.52] | 12.14 [10.54, 12.70] | 0.88 [0.85, 1.09] |
| n178-p8-large1-h32 / projects | 15.76 [10.61, 15.99] | 0.22 [0.21, 0.78] | 13.79 [10.97, 18.56] | 0.13 [0.10, 0.19] | 13.57 [11.23, 15.41] | 0.11 [0.10, 0.16] |
| n178-p8-large1-h32 / inbox | 14.03 [10.93, 16.35] | 0.90 [0.87, 1.67] | 12.56 [10.40, 17.05] | 0.82 [0.75, 1.49] | 11.62 [10.63, 16.20] | 0.78 [0.73, 0.87] |
| n178-p8-large1-h32 / today | 14.90 [10.83, 18.88] | 0.80 [0.75, 1.58] | 14.10 [11.25, 26.67] | 0.74 [0.64, 1.21] | 12.00 [11.38, 13.21] | 0.67 [0.65, 0.68] |
| n178-p8-large1-h32 / scheduled | 14.82 [10.91, 16.68] | 0.73 [0.70, 1.45] | 13.38 [10.99, 43.86] | 0.72 [0.67, 1.14] | 11.28 [10.20, 13.22] | 0.68 [0.65, 0.73] |
| n178-p8-large1-h2048 / profiles | 203.94 [199.94, 217.50] | 2.13 [2.08, 2.31] | 196.66 [194.12, 201.26] | 0.75 [0.69, 0.93] | 273.89 [247.06, 304.08] | 0.85 [0.78, 0.97] |
| n178-p8-large1-h2048 / tags | 25.10 [23.64, 29.02] | 0.33 [0.30, 0.35] | 24.51 [23.28, 24.74] | 0.10 [0.10, 0.17] | 31.72 [29.81, 39.15] | 0.12 [0.10, 0.13] |
| n178-p8-large1-h2048 / tasks | 30.42 [29.52, 33.41] | 1.85 [1.79, 1.99] | 30.39 [28.79, 31.99] | 1.21 [1.09, 1.26] | 38.02 [35.15, 42.62] | 1.44 [1.36, 1.51] |
| n178-p8-large1-h2048 / overdue | 24.50 [23.68, 30.88] | 1.16 [1.11, 1.27] | 24.85 [22.73, 26.03] | 0.70 [0.67, 0.79] | 30.78 [27.87, 33.97] | 0.86 [0.85, 0.94] |
| n178-p8-large1-h2048 / projects | 25.10 [23.60, 37.24] | 0.20 [0.19, 0.21] | 24.80 [23.83, 25.48] | 0.08 [0.07, 0.11] | 30.23 [28.37, 34.31] | 0.10 [0.09, 0.13] |
| n178-p8-large1-h2048 / inbox | 24.95 [23.63, 33.30] | 0.83 [0.81, 1.03] | 24.79 [23.67, 26.74] | 0.73 [0.72, 0.83] | 30.60 [28.43, 33.69] | 0.94 [0.92, 1.07] |
| n178-p8-large1-h2048 / today | 24.77 [23.52, 25.60] | 0.70 [0.67, 1.20] | 24.76 [23.48, 25.26] | 0.64 [0.63, 0.73] | 30.82 [28.61, 36.03] | 0.83 [0.78, 0.96] |
| n178-p8-large1-h2048 / scheduled | 24.88 [24.05, 25.91] | 0.72 [0.67, 1.00] | 25.00 [23.30, 26.71] | 0.69 [0.64, 0.82] | 30.47 [28.19, 35.59] | 0.84 [0.79, 0.89] |
| n178-p8-empty-large0-h2048 / profiles | 182.26 [175.52, 292.47] | 2.58 [1.91, 2.97] | 182.30 [153.21, 299.90] | 0.60 [0.31, 0.99] | 225.76 [209.85, 255.55] | 0.66 [0.43, 0.86] |
| n178-p8-empty-large0-h2048 / tags | 22.34 [20.22, 30.18] | 0.58 [0.41, 0.76] | 24.31 [18.23, 38.66] | 0.17 [0.13, 0.49] | 31.14 [25.40, 34.65] | 0.35 [0.24, 0.51] |
| n178-p8-empty-large0-h2048 / tasks | 26.29 [23.64, 34.24] | 2.80 [2.18, 3.35] | 22.08 [19.70, 41.46] | 1.56 [1.34, 4.32] | 32.69 [28.73, 34.64] | 2.58 [2.04, 3.62] |
| n178-p8-empty-large0-h2048 / overdue | 25.64 [20.72, 31.41] | 3.09 [1.82, 4.90] | 23.27 [19.21, 38.93] | 0.98 [0.78, 1.85] | 34.12 [26.20, 38.75] | 1.34 [1.27, 1.79] |
| n178-p8-empty-large0-h2048 / projects | 24.30 [22.18, 27.79] | 0.39 [0.33, 0.65] | 22.13 [18.64, 33.85] | 0.14 [0.12, 0.28] | 29.17 [24.57, 39.89] | 0.24 [0.22, 0.31] |
| n178-p8-empty-large0-h2048 / inbox | 22.83 [18.09, 33.78] | 1.30 [1.06, 1.73] | 22.57 [20.38, 35.07] | 0.95 [0.87, 3.85] | 30.13 [24.70, 37.90] | 1.85 [1.34, 2.03] |
| n178-p8-empty-large0-h2048 / today | 24.79 [19.63, 37.68] | 1.02 [0.81, 2.19] | 22.82 [18.43, 33.11] | 0.85 [0.77, 1.65] | 28.56 [27.00, 32.06] | 1.35 [1.02, 1.90] |
| n178-p8-empty-large0-h2048 / scheduled | 23.26 [19.82, 36.19] | 1.02 [0.79, 3.01] | 25.10 [18.32, 31.92] | 1.01 [0.80, 4.44] | 29.35 [25.10, 35.53] | 1.33 [1.05, 1.94] |
| n178-p8-empty-large1-h2048 / profiles | 234.73 [234.67, 326.60] | 2.73 [2.21, 4.37] | 218.48 [211.41, 254.24] | 0.63 [0.41, 0.74] | 199.37 [174.33, 210.16] | 0.48 [0.35, 0.61] |
| n178-p8-empty-large1-h2048 / tags | 28.04 [25.97, 38.76] | 0.59 [0.42, 1.19] | 27.25 [25.59, 29.50] | 0.40 [0.15, 0.44] | 25.51 [22.44, 34.94] | 0.18 [0.11, 0.32] |
| n178-p8-empty-large1-h2048 / tasks | 31.96 [30.35, 42.02] | 3.36 [2.50, 5.76] | 29.38 [27.19, 42.84] | 2.61 [1.72, 3.32] | 26.55 [23.89, 30.31] | 1.91 [1.57, 2.06] |
| n178-p8-empty-large1-h2048 / overdue | 28.59 [27.29, 34.70] | 2.79 [1.88, 5.81] | 29.64 [24.49, 37.44] | 1.47 [1.02, 3.04] | 26.00 [23.62, 29.01] | 1.14 [1.01, 1.39] |
| n178-p8-empty-large1-h2048 / projects | 25.63 [24.93, 29.52] | 0.48 [0.34, 0.81] | 25.39 [25.17, 41.72] | 0.24 [0.11, 0.37] | 25.67 [23.60, 26.05] | 0.14 [0.12, 0.33] |
| n178-p8-empty-large1-h2048 / inbox | 27.30 [25.13, 62.50] | 1.88 [1.17, 2.54] | 26.88 [25.90, 29.57] | 1.51 [1.00, 2.53] | 23.08 [21.20, 28.23] | 1.11 [1.04, 2.02] |
| n178-p8-empty-large1-h2048 / today | 27.43 [26.60, 33.78] | 1.40 [0.97, 2.27] | 27.48 [24.94, 32.59] | 1.39 [0.90, 2.07] | 24.37 [23.27, 28.02] | 1.01 [0.89, 1.93] |
| n178-p8-empty-large1-h2048 / scheduled | 27.80 [25.55, 37.84] | 1.65 [0.92, 2.35] | 25.95 [25.06, 29.16] | 1.40 [1.05, 2.52] | 25.31 [21.53, 29.00] | 1.24 [0.96, 1.48] |

## Immediate-transaction audit

No existing immediate authorization/writer transaction was converted. [OperationStore.transaction](../../../packages/domain/src/store/store.ts) still calls immediate, has a synchronous callback, and keeps the same projection-write guard lifetime. Discovery's existing readSnapshot stays deferred. Graph reads remain deferred. The new SSE selection uses an explicit deferred read snapshot solely to pair the global cursor with selected rows; this replaces the old single implicit read snapshot and changes no auth/write admission mode.

The current read waits synchronously for BEGIN IMMEDIATE before credential lookup. This blocks that server process's JS dispatch while SQLite waits. perform obtains its Clock value before admission; a long wait therefore retains the old pre-wait expiry time. The new Profile count loop preserves fresh per-Profile expiry checks. These temporal details were audited, not changed. A failure to acquire the writer lock maps to the existing generic 500/exit-1 storage error, not rejected-auth History.

A separate owned process held BEGIN IMMEDIATE on the same scratch database. These are individual mechanism controls, not medians. A 4,900 ms hold produced a near-five-second 200 on both paths. A 5,300 ms hold exhausted the unchanged 5,000 ms busy timeout and returned 500:

| Build | Writer hold ms | Status | Handler ms | HTTP body-end ms |
| --- | ---: | ---: | ---: | ---: |
| before | 0 | 200 | 4.87 | 16.05 |
| before | 4900 | 200 | 4905.80 | 4906.88 |
| before | 5300 | 500 | 5006.53 | 5010.98 |
| after | 0 | 200 | 4.95 | 19.08 |
| after | 4900 | 200 | 4900.67 | 4903.71 |
| after | 5300 | 500 | 5003.39 | 5006.53 |

This reproduces a successful near-five-second wait. It does not establish who held the lock during the owner's 5,105 ms incident. The actual duration of each product holder below was not measured on owner data. They are source-supported candidates, not findings about that incident.

| Holder or candidate | Live writer admission and work |
| --- | --- |
| Owner Snapshot create/daily | Snapshots.create wraps createSync in the live immediate transaction. Serialization, copy compaction, counts/checksum, file fsync/rename and manifest durability run before release. A large database or slow filesystem can prolong it. |
| Restore, including dry run | The restore transaction covers verification/staging, migrations/redaction, pre-restore Snapshot, durable Purge union, table/trigger replacement and FK checks. It can hold the live writer while also working on copies. |
| Purge | appendSync validates under the writer, creates pre-purge Snapshot, redacts every stored Snapshot, appends/applies and redacts live History before release. No change was made to this guarantee. |
| Migration/open/rebuild/checkpoint | Constructor migration and pre-migration Snapshot share immediate admission. Rebuild decodes/replays under the writer; internal checkpoints serialize current state under it. The paths are unbounded with data size. |
| Import and other CLI writers | Import's pre-change Snapshot and per-Task mutate transactions can hold the same live lock. Each Task normally releases it separately. Large metadata/graph/History work in a command can extend a single hold. A separate process can contend with the server. |
| Scheduler | runDue scans Tasks and applies wake/reminder work under immediate; nextAt/pendingReminders also scan under it; credential cleanup and daily Snapshot/prune have immediate work. Same-process synchronous work delays dispatch or execution between stages; it cannot overlap a synchronous transaction callback. Another server/scheduler process can hold the shared writer lock. |
| Checkpoint, VACUUM and backup distinctions | Explicit compact uses checkpoint/journal-mode/VACUUM on Snapshot/staging copies; the surrounding live Snapshot/restore/Purge transaction may remain held. Commit fsync/automatic checkpoint work can add delay. The installer's SQLite .backup is a source reader and destination writer, not itself a live BEGIN IMMEDIATE holder. It was inspected, never run. |

These distinctions follow [SQLite transaction semantics](https://sqlite.org/lang_transaction.html), [WAL concurrency/checkpoint behavior](https://sqlite.org/wal.html) and [the backup API's source/destination locks](https://sqlite.org/backup.html). The code-specific live-lock lifetimes come from store.ts, snapshots.ts, scheduled-work.ts, auth.ts and import-tasks.ts.

### Smallest safe deferred-read proposal, not implemented

For pure current-state reads, a dedicated deferred read boundary can preserve coherent credential/projection state if it performs credential checks and every required query in one fresh synchronous snapshot. A concurrent revocation committed before that snapshot is rejected; an overlapping later revocation is observed next request. Existing discovery already accepts that snapshot boundary. Successful credential last-use remains in memory. On AuthError, close/roll back the read snapshot first, then record rejection through the existing short immediate transaction. Never try to upgrade the stale snapshot into a rejection write.

Read-your-writes holds when the fresh snapshot starts after the write commit; never retain a read transaction across request/search yields. Keep mutations, sign-in, Snapshot/restore/Purge and their authorization rules on the writer path. Do not globally change perform, requireOwner or authenticate: callers also authorize writes and streams. For Task lists, include metadata and graph capture in the same new boundary, then run yielding search outside it.

SSE needs a separate coherent generation/cursor/event decision and must retain the ProfileDeleted-before-revocation-close behavior. A blanket deferred replacement would not prove that guarantee. Keep current SSE auth admission until that boundary has explicit concurrent revocation/restore/deletion controls. Re-run rejected-auth attribution, last-use, fresh-after-write, WAL revocation, restore-generation/cursor and cancellation controls before shipping the proposal. No existing transaction mode is changed here.

## Commands and real exits

Every full root attempt used the standing lock and a successful disk guard first. No compiler or verification failure is treated as a pass:

| Attempt | Exact command after `sh scripts/disk-guard.sh` | Exit | Result |
| --- | --- | ---: | --- |
| root-1 | `/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` | 1 | Fixture type error |
| root-2 | `/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` | 1 | Formatting during iteration |
| root-3 | `/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` | 0 | 386 domain, 69 CLI, 32 server, 168 Electron; one skip |
| root-4 | `/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` | 0 | Same complete suite |
| root-5 | `/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` | 0 | Same complete suite after fixture hardening |
| root-6 | `/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` | 0 | Same complete suite on product 43c75117 |
| root-7 | `/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` | 1 | Two unchanged Electron compiler-wrapper tests hit 5 s deadlines while other controls ran |
| root-8 | `/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` | 0 | 387 domain, 69 CLI, 32 server, 168 Electron; one skip, product 35d67908 |

The initial compiled recipes below ran on product 7a90388d. Their repeated final recipes ran on 35d67908. Each receives a fresh evidence directory. Final recipes use TODO_CLI_BINARY, TODO_SERVER_BINARY and TODO_SEED_BINARY from the frozen scope-build.json, with TODO_BINARY_PROVENANCE pointing to that same manifest. The wrapper only reuses that compiled seed when a shell recipe asks to compile the identical seed source. Exact argv, exits and cleanup are retained in the listed receipts under `docs/evidence/ui-speed/server-reads`:

| Recipe or command | Exit | Local receipt |
| --- | ---: | --- |
| `sh .agents/skills/verify-op-log/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-2/op-log"` | 0 | `skills-2/op-log` |
| `sh .agents/skills/verify-auth/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-2/auth"` | 0 | `skills-2/auth` |
| `sh .agents/skills/verify-recurrence/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-2/recurrence"` | 0 | `skills-2/recurrence` |
| `sh .agents/skills/verify-server-api/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-2/server-api"` | 0 | `skills-2/server-api` |
| `sh .agents/skills/verify-server-api/scripts/verify-reads.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-2/server-reads"` | 0 | `skills-2/server-reads` |
| `sh .agents/skills/verify-profiles/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-3/profiles"` | 0 | `skills-3/profiles` |
| `sh .agents/skills/verify-filters/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-3/filters"` | 0 | `skills-3/filters` |
| `sh .agents/skills/verify-snapshots/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-3/snapshots"` | 0 | `skills-3/snapshots` |
| `sh .agents/skills/verify-sse/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-3/sse" "$TODO_CLI_BINARY"` | 0 | `skills-3/sse` |
| `sh .agents/skills/verify-cli/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-4/cli"` | 0 | `skills-4/cli` |
| `bun --define 'TODO_BUILD_ID="7a90388d"' .agents/skills/verify-attachments/scripts/drive.ts "$PWD/docs/evidence/ui-speed/server-reads/skills-6/attachments"` | 0 | `skills-6/attachments` |
| `bun --define 'TODO_BUILD_ID="7a90388d"' .agents/skills/verify-attachments/scripts/cli01.ts "$PWD/docs/evidence/ui-speed/server-reads/skills-6/attachment-groups"` | 0 | `skills-6/attachment-groups` |
| `sh .agents/skills/verify-dag/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-6/dag"` | 0 | `skills-6/dag` |
| `sh .agents/skills/verify-dag/scripts/verify-public.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-6/dag-public"` | 0 | `skills-6/dag-public` |
| `sh .agents/skills/verify-discovery/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-6/discovery"` | 0 | `skills-6/discovery` |
| AtomicCAS sensitivity, two behavioral failures and exact restoration | 0 | `atomicity-sensitivity.log` |
| Final `bun .agents/skills/verify-occ-atomicity/check.ts` | 0 | `atomicity-final.log` |
| Compiled SSE cursor proof on 43c75117 | 0 | `sse-delivery.log` |
| Compiled restore/SSE proof on 43c75117 | 0 | `snapshots-delivery.log` |
| Full 56-checkpoint differential on 35d67908 | 0 | `control-scope-final.log` |
| Audited lifecycle differential, all event kinds | 0 | `control-scope-rich.log` |
| Paired factorial, both orders, five pairs | 0 | `benchmark-scope-final.log` |
| Near-five-second external writer control | 0 | `lock-scope-final.log` |
| Final fixture typecheck | 0 | `fixture-audit-typecheck-2.log` |
| `sh .agents/skills/verify-auth/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-scope-final/auth"` | 0 | `skills-scope-final/auth` |
| `sh .agents/skills/verify-server-api/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-scope-final/server-api"` | 0 | `skills-scope-final/server-api` |
| `sh .agents/skills/verify-server-api/scripts/verify-reads.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-scope-final/server-reads"` | 0 | `skills-scope-final/server-reads` |
| `sh .agents/skills/verify-profiles/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-scope-final/profiles"` | 0 | `skills-scope-final/profiles` |
| `sh .agents/skills/verify-snapshots/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-scope-final/snapshots"` | 0 | `skills-scope-final/snapshots` |
| `sh .agents/skills/verify-sse/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-scope-final/sse" "$TODO_CLI_BINARY"` | 0 | `skills-scope-final/sse` |
| `sh .agents/skills/verify-discovery/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-scope-final/discovery"` | 0 | `skills-scope-final/discovery` |
| `pnpm --filter @todo/domain test client-projection.test.ts` after fix | 0 | `scope-boundary-after.log` |
| `bun .agents/skills/verify-cli/scripts/cache-binaries.ts` | 0 | `scope-build.log` |

Reproduction commands, run from this checkout with a read-only source checkout supplied as COLD_PATH_CHECKOUT:

```sh
bun apps/server/scripts/prepare-read-benchmark.ts "$COLD_PATH_CHECKOUT"
sh scripts/disk-guard.sh
bun apps/server/scripts/build-read-control.ts before .scratch/bin/read-timing-before
sh scripts/disk-guard.sh
bun apps/server/scripts/build-read-control.ts after .scratch/bin/read-timing-after
bun apps/server/scripts/read-fixture.ts .scratch/server-reads/rich-audited
bun apps/server/scripts/read-control.ts .scratch/bin/read-timing-before .scratch/bin/read-timing-after .scratch/server-reads/checkpoints/fixtures.json docs/evidence/ui-speed/server-reads/control-scope-final
bun apps/server/scripts/read-control.ts .scratch/bin/read-timing-before .scratch/bin/read-timing-after .scratch/server-reads/rich-audited/fixtures.json docs/evidence/ui-speed/server-reads/control-scope-rich
COLD_ONLY="n15-p1-large0-h32,n15-p1-large0-h2048,n15-p1-large1-h32,n15-p1-large1-h2048,n15-p8-large0-h32,n15-p8-large0-h2048,n15-p8-large1-h32,n15-p8-large1-h2048,n178-p1-large0-h32,n178-p1-large0-h2048,n178-p1-large1-h32,n178-p1-large1-h2048,n178-p8-large0-h32,n178-p8-large0-h2048,n178-p8-large1-h32,n178-p8-large1-h2048,n178-p8-empty-large0-h2048,n178-p8-empty-large1-h2048"
READ_CONTROL_REAL_TIME=1 COLD_PAIRS=5 COLD_FIRST= COLD_ONLY="$COLD_ONLY" /usr/bin/lockf -k /tmp/todo-server-read-timing.lock bun .scratch/server-reads/harness/cold-path.ts ambient .scratch/server-reads/checkpoints docs/evidence/ui-speed/server-reads/benchmark-scope-final
```

COLD_ONLY is the 16 corner ids plus n178-p8-empty-large0-h2048 and n178-p8-empty-large1-h2048, generated from the copied manifest. Use fresh evidence destinations. The final sweep and both accepted controls exit 0. Normal compiled source provenance and SHA-256 binary hashes are in final-binaries.json; the source hash is ee0325ce5941a71ae774d6d37b9812608e146d845fa29934464cde426c95bc27. The reproducible lock control is retained locally at `.scratch/server-reads/lock-scope-final.ts` with exact holds/status assertions. No absolute machine path is tracked. Root attempt 8 sets the two binary overrides above, runs sh scripts/disk-guard.sh, then exactly /usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check.

Earlier failures remain local. The first control build could not resolve a server-only dependency from the skill folder, exit 1; moving the helper into apps/server fixed resolution. A version-flag probe of the test-only helper lacked TODO_DB and exited 1 before opening a database. An early lifecycle creation used the wrong Attachment input shape and failed, exit 1. Later fixture audit found a malformed Purge had been rejected; its earlier coverage claim is excluded and the audited seeder now asserts success and every event kind. The first timer fixture copied an inherited clock method incorrectly; SSE exposed clock.sleep missing. The corrected helper explicitly supplies clock methods, and the final byte control and timing sweep use it. Iterative helper type/format failures remain in their individual logs.

The first recipe batch's local compiler wrapper forwarded the wrong argv, exit 1; its repaired batch passed. Profile schema 6 versus 7 and the expired-row cleanup race failed as described above before fixture corrections. Two Attachment setup attempts had mismatched dev/stamped build identities, exit 1; explicit fixed binary provenance and matching build define preserved the strict health assertion and passed. Root attempt 7 hit the unchanged five-second deadlines in Electron's fake compiler/delegate wrapper tests while this worker's other controls ran. No timeout was relaxed; the complete root suite was repeated after those controls stopped. The initial AtomicCAS run completed behavior then failed only the source pin, exit 1. The reviewed movement mapping, sensitivity and final command passed. The no-decode, cursor and authorization-boundary red controls each exited 1 at their intended literal assertion; corrected candidates exited 0.

## Limits and cleanup

SQL narrows Task/catalog/graph reads by Profile; shared domain code still applies Task and planning filters. Show reuses its Profile list/graph computation. This unit does not add per-Task SQL pushdown. This is not a formal equivalence proof over every possible database, Unicode id or event ordering. It covers the 56 checkpoints, the audited all-kind lifecycle fixture, literal regression controls and compiled subsystem workflows. Physical SQLite recording time, process Diagnostics values, production build id and installed UI rendering are not byte-invariance claims. Full immutable DAG-F qualification was not renewed for this read-only change; graph algorithms/models and writer logic are unchanged, while compiled public graph and replay proofs passed. Independent review seats and a fresh native session are not claimed; the worker's explicit no-children/no-native limits took precedence.

The 20 ms input-to-render median and 300 ms p99 objective is not certified by handler medians. No real database, credential, installed server, app, Swift, Keychain or signing operation was used. Python appeared only inside existing verification recipes, not as a replacement for a missing Todo CLI capability. All database, file and process work belongs to private scratch directories. All owned servers/readers/writer lockers exited; recipe cleanup receipts survive. No CPU-pressure workers were launched.

The initial cleanup scan removed 35 closed owned Bun compile temporaries, 3,103,130,240 bytes, after lsof checks; open files were skipped. The final scan removed 13 further closed files, 1,152,591,232 bytes. Final free space was 36.5 GB. The process audit found no owned cached-binary process and no compile temporary remaining. The receipts are retained locally. All evidence, binary hashes, fixtures, private credentials and bulk replies remain ignored. The final no-comments review was performed directly because the explicit single-worker/no-children instruction forbids the skill's delegated reviewer; no new product comments or suppressions were added.
