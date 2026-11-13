# Server read formal mapping renewal

Pinned source: 7d947f917d1895df45c78f9f9df31638a9f3f2b8. Reviewed product source: ac6e7bd24356060aa0f3ceddf89cfc1d25cf1344. The pending control-only commit changes no product runtime. No model, invariant, bounds or expected graph/search results change. This report supersedes the stale whole-file pins for the two skills.

## Per-function audit

The extraction includes overloads and the implementation. Whole queryGraph is identical, proving its covered component and shape fields identical. Exact before/after bytes, SHA-256 and unified diffs are retained locally under docs/evidence/ui-speed/server-reads/formal-read-renewal/. Additional public coverage beyond the four flagged files was also audited. CLI changes affect only Snapshot reads; dependency commands, deletion confirmation, false-filter and malformed-Version guards are unchanged. Server changes affect read/error/Snapshot adapters; rejectUnknownQuery and all four mapped Dependency/import handlers are identical.

| File | Covered function | Result | Before / after SHA-256 |
| --- | --- | --- | --- |
| packages/domain/src/import-tasks.ts | executeImport | changed; exact diff below | 12d854c297196ea95e73dba61bdba2f357fbb9ca39c691f24f8c3ec164856aaf / cd46cf941623dcf972f45c5374ddd3abd2232cd8731d1247ad06d9b9329e2735 |
| apps/cli/src/main.ts | dependencyCommand | byte-identical | bf3176b75205ad3a8858284cddde36a03e29bc0b1cbf8199a23cea42f81ba09e / bf3176b75205ad3a8858284cddde36a03e29bc0b1cbf8199a23cea42f81ba09e |
| apps/cli/src/main.ts | batchDependCommand | byte-identical | f2447fbdc1a4ec7a18e61f37207f01548c60c86729131bfbeab5271bb3db47b0 / f2447fbdc1a4ec7a18e61f37207f01548c60c86729131bfbeab5271bb3db47b0 |
| apps/server/src/server.ts | rejectUnknownQuery | byte-identical | 26733b9329f488a3f408175012b2d4f0db41ddd7e78d23a3bc6bbdf2a8f7a650 / 26733b9329f488a3f408175012b2d4f0db41ddd7e78d23a3bc6bbdf2a8f7a650 |
| packages/domain/src/graph-queries.ts | graphShape | byte-identical | 3acfe7a3379383440494cddfa1b6a3c3186f8e62de0e27375104c4e9ca4534f4 / 3acfe7a3379383440494cddfa1b6a3c3186f8e62de0e27375104c4e9ca4534f4 |
| packages/domain/src/graph-queries.ts | queryGraph | byte-identical | 9529fa8fdf937390cca56286be5b514b8ded8ed888fae7cd46add6efa858f4e6 / 9529fa8fdf937390cca56286be5b514b8ded8ed888fae7cd46add6efa858f4e6 |
| packages/domain/src/graph-queries.ts | readGraph | changed; exact diff below | b6970b345bc86a14202526715af4dd9c2c90294c67268d1cca0c87e9cb5fe69c / e512dcc80a21afd903449ba30a9c39ad530588e9ad8fce65a7136173ab599759 |
| packages/domain/src/store/store.ts | OperationStore.transaction | byte-identical | 34bc79c7f6cb75eda1686dc744630eb7b3b719c7a70ea4d5b0e05fca2a524fe1 / 34bc79c7f6cb75eda1686dc744630eb7b3b719c7a70ea4d5b0e05fca2a524fe1 |
| packages/domain/src/store/store.ts | OperationStore.validate | byte-identical | fc7f3ed541586fac8b09a6ccd92f98db12542584f423e4b85d9c4600440640de / fc7f3ed541586fac8b09a6ccd92f98db12542584f423e4b85d9c4600440640de |
| packages/domain/src/store/store.ts | OperationStore.appendSync | byte-identical | bc4a425397a8b31ec6e92c5a7470fb0fc389261e0e5b1eac61270f634e38ac6c / bc4a425397a8b31ec6e92c5a7470fb0fc389261e0e5b1eac61270f634e38ac6c |
| packages/domain/src/store/store.ts | OperationStore.recordRejection | byte-identical | 4944375a7310ea5043df8bd7f09cb77e275ee6058a3937e20b5da19906761d08 / 4944375a7310ea5043df8bd7f09cb77e275ee6058a3937e20b5da19906761d08 |
| packages/domain/src/store/store.ts | OperationStore.graph | changed; exact diff below | eac6958c23f876206640087780e3535981d6af42fc0da88075605b343046f3d9 / ff4207baa941f49150b4574202985c5e53a6a611d03ba8ce08961039930b9cde |
| packages/domain/src/store/store.ts | OperationStore.dependencies | byte-identical | 3002f304ea7c91082dd88df5859867a97450004d6a080370e088a8e4fbf8860e / 3002f304ea7c91082dd88df5859867a97450004d6a080370e088a8e4fbf8860e |
| packages/domain/src/store/store.ts | OperationStore.rebuild | byte-identical | c672d7b2a8775c400ba79a882573d4625fd9ce26be130f1ffb684cc9168db795 / c672d7b2a8775c400ba79a882573d4625fd9ce26be130f1ffb684cc9168db795 |
| packages/domain/src/store/store.ts | OperationStore.takeSnapshot | byte-identical | 666eb776724a87ae57f9841fc723a1b129f11228473e55bde7d9665bd02ddc25 / 666eb776724a87ae57f9841fc723a1b129f11228473e55bde7d9665bd02ddc25 |
| packages/domain/src/store/store.ts | OperationStore.resolveRevertSync | byte-identical | 60e7a2d5ed5f8e57bee1d4f5efcb640739e46d06d93d1c9021ffcf657c7759ac / 60e7a2d5ed5f8e57bee1d4f5efcb640739e46d06d93d1c9021ffcf657c7759ac |
| packages/domain/src/store/store.ts | OperationStore.move | byte-identical | 036d8c4c614d7f557655fe5da362039f500da7b8263432cb1413f9ffb68b0a65 / 036d8c4c614d7f557655fe5da362039f500da7b8263432cb1413f9ffb68b0a65 |
| packages/domain/src/store/store.ts | OperationStore.startSeriesSync | byte-identical | e0c2d479ac7c3b4f0031281bb308d95e4e8323d7044ed58c9f4d2925e7c0ed88 / e0c2d479ac7c3b4f0031281bb308d95e4e8323d7044ed58c9f4d2925e7c0ed88 |
| packages/domain/src/auth/auth.ts | Authentication.startSeries | byte-identical | bf0127e90a74d59e3b1108bd7d951612299da7fed03da3956fe65f931aab44a9 / bf0127e90a74d59e3b1108bd7d951612299da7fed03da3956fe65f931aab44a9 |
| packages/domain/src/auth/auth.ts | Authentication.append | byte-identical | d35d8be8df44b801f98d2971e218a228f9ef28220a24752b23ae6ced0ed152c8 / d35d8be8df44b801f98d2971e218a228f9ef28220a24752b23ae6ced0ed152c8 |
| packages/domain/src/auth/auth.ts | Authentication.requireCredential | changed; exact diff below | 92eead2235b5fbeafd6a4f8224720003138eedc75dadf7f4f3c87f3aad7a3666 / 6e5555d8f034be6a235029d74219d163e717a884c4ba719b5c07cfb1d61dc5b1 |
| packages/domain/src/auth/auth.ts | Authentication.mutate | changed; exact diff below | d987f21a7651ba312d6cdcea5abe46b1e6025beec4159d218debf0ef574e40f1 / b14254a344bb3aecef24e9a7c7d3e4a825c2fecc373da7996d48b8b8226b53f4 |
| packages/domain/src/commands.ts | readTasks | changed; exact diff below | a635fc68ebdf62b1a23b2af95b7e20e61cad62fd00c5c0818c866117e825e766 / d9e5ddf146e635e006f4854b45e072b523750b02befbb4be9359381c9baec676 |
| packages/domain/src/commands.ts | TaskCommands.list | changed; exact diff below | d383e3cffc5bfa94eb4eca3cecd77b38df6fab1ccf601241d8e0054f3ca1d3e4 / 3c7291e3fe39fd3b230409b06b3f032613074176680fbd71c515f2ed3bf4e9dd |
| packages/domain/src/commands.ts | TaskCommands.result | byte-identical | 693d657c794e24d0efb5d0132ba9b90c7365e7b08174ef4633048e17921c707f / 693d657c794e24d0efb5d0132ba9b90c7365e7b08174ef4633048e17921c707f |
| packages/domain/src/commands.ts | TaskCommands.change | byte-identical | e1a7ec7de3689c5c91b0c646a1b1daabff07145df1327dc495abf08f611a0adb / e1a7ec7de3689c5c91b0c646a1b1daabff07145df1327dc495abf08f611a0adb |
| packages/domain/src/commands.ts | cliResult | byte-identical | b088397dddbfdedcb9be10d62dbf9f3e32fbf827a1bdaa7919b5462ab78f10aa / b088397dddbfdedcb9be10d62dbf9f3e32fbf827a1bdaa7919b5462ab78f10aa |
| packages/domain/src/commands.ts | mutateTask | changed; exact diff below | d1e8f0fd1644710c61072171026f4326fda308629c69a20de9130b058ab4db41 / e313885ceeb198977d68db2945a12c92e3bcb1aaf2d7e8ba1a6052ac9ca2517e |
| apps/server/src/server.ts | TasksApi.depend | byte-identical | 375e8321b594b7edbd8fe3c7e036df2ad366b76e8d1ecdc2a0128b3ab18f917f / 375e8321b594b7edbd8fe3c7e036df2ad366b76e8d1ecdc2a0128b3ab18f917f |
| apps/server/src/server.ts | TasksApi.undepend | byte-identical | bdf6039f56f0747870554d54e0835ba9b29aa9415872354bf7418b0b4908e55e / bdf6039f56f0747870554d54e0835ba9b29aa9415872354bf7418b0b4908e55e |
| apps/server/src/server.ts | TasksApi.batchDepend | byte-identical | f14c9c74fc454a5c296bc9991c4ecb9596aec0949b3acff8d2d011f8d9f5a45d / f14c9c74fc454a5c296bc9991c4ecb9596aec0949b3acff8d2d011f8d9f5a45d |
| apps/server/src/server.ts | TasksApi.importTasks | byte-identical | 6597889139ffca3b91623b4638ac9db539cb527391af14f142d975c0d235be34 / 6597889139ffca3b91623b4638ac9db539cb527391af14f142d975c0d235be34 |

## Changed mappings and exact diffs

### executeImport

Import captures and materializes graph/input under a checked lease, returns plain selectors, and reacquires a fresh read for later blocker lookup after writes. Each command retains its authoritative write transaction/validation and resolved event construction. Bulk import composition is outside the finite one-change model and remains public/concrete conformance.

```diff
--- docs/evidence/ui-speed/server-reads/formal-read-renewal/executeImport.before.ts	2026-11-12 21:23:11
+++ docs/evidence/ui-speed/server-reads/formal-read-renewal/executeImport.after.ts	2026-11-12 21:23:11
@@ -1,11 +1,25 @@
 const executeImport = Effect.fn(function* (
   store: OperationStore,
-  request: AccessRequest,
-  input: ImportRequest,
+  source: AccessRequest,
+  options: ImportRequest,
 ) {
   const commands = new TaskCommands(store);
-  yield* store.auth.read(request);
-  const graph = yield* store.graph(request.profile);
+  const { authority, graph } = yield* store.auth.withRead(
+    source,
+    Schema.Struct({ input: ImportRequest }),
+    { input: options },
+    (read) =>
+      Effect.gen(function* () {
+        const authority = yield* store.auth.checkRead(read, "read");
+        const graph = yield* store.graphRead(read);
+        return { authority, graph };
+      }),
+    "read",
+    (authority) =>
+      Effect.succeed({ authority, graph: { tasks: [], edges: [] } }),
+  );
+  const request = readRequest(authority),
+    input = authority.fields.input;
   const initial = graph.tasks;
   const dependencyPlan = planImportDependencies(
     graph,
@@ -286,7 +300,14 @@
               );
               changed_fields.push("status");
             }
-            const currentBlockers = (yield* store.graph(request.profile)).edges
+            const currentBlockers = (yield* store.auth.withRead(
+              request,
+              Schema.Struct({}),
+              {},
+              (read) => store.graphRead(read),
+              "read",
+              () => Effect.succeed({ tasks: [], edges: [] }),
+            )).edges
               .filter((edge) => edge.dependent_id === task.id)
               .map((edge) => edge.blocker_id);
             const removed = currentBlockers.filter(
```

### readGraph

The public wrapper delegates to readGraphQuery, which captures/validates Task id and generated_at and materializes queryGraph inside one checked lease. Pure queryGraph is byte-identical. This maps to public read selection and unchanged component/shape semantics; authorization/leases are concrete boundaries, outside DagAcyclic.

```diff
--- docs/evidence/ui-speed/server-reads/formal-read-renewal/readGraph.before.ts	2026-11-12 21:23:11
+++ docs/evidence/ui-speed/server-reads/formal-read-renewal/readGraph.after.ts	2026-11-12 21:23:11
@@ -1,13 +1,2 @@
-export const readGraph = (
-  store: OperationStore,
-  request: AccessRequest & { readonly task_id: TaskId },
-  generated_at: Instant,
-) =>
-  Effect.gen(function* () {
-    yield* store.auth.read(request);
-    return queryGraph(
-      yield* store.graph(request.profile),
-      request.task_id,
-      generated_at,
-    );
-  });
+export const readGraph = (...args: Parameters<typeof readGraphQuery>) =>
+  readGraphQuery(...args).pipe(Effect.map((result) => result.graph));
```

### OperationStore.graph

Pre-Begin graph observation keeps its transaction and identical Task/edge meaning. SQL equality now selects the Profile before decoding instead of filtering global decoded rows. Canonical projection/replay consistency remains the existing AtomicGraphHistory assumption and concrete replay corpus. No Validate/Record/Apply/Commit transition changes.

```diff
--- docs/evidence/ui-speed/server-reads/formal-read-renewal/OperationStore-graph.before.ts	2026-11-12 21:23:11
+++ docs/evidence/ui-speed/server-reads/formal-read-renewal/OperationStore-graph.after.ts	2026-11-12 21:23:11
@@ -1,7 +1,13 @@
   readonly graph = (profile: ProfileId) =>
     attempt(() =>
       this.db.transaction(() => ({
-        tasks: readTasks(this.db).filter((task) => task.profile_id === profile),
-        edges: readEdges(this.db).filter((edge) => edge.profile_id === profile),
+        tasks: new ClientProjection(this.db).tasksForMutation(profile),
+        edges: Schema.decodeUnknownSync(Schema.Array(Edge))(
+          this.db
+            .query(
+              "SELECT * FROM task_dependencies WHERE profile_id=? ORDER BY profile_id,dependent_id,blocker_id",
+            )
+            .all(profile),
+        ),
       }))(),
     );
```

### Authentication.requireCredential

Delegation to credentialCheck retains kind, revocation, expiry, owner, Profile-scope and write-scope checks before Profile classification. The lease cache is invalidated by native mutation serial; no permission is cached past scope exit. Authentication is outside the finite DAG state space. Concrete read/write refusal controls remain required.

```diff
--- docs/evidence/ui-speed/server-reads/formal-read-renewal/Authentication-requireCredential.before.ts	2026-11-12 21:23:11
+++ docs/evidence/ui-speed/server-reads/formal-read-renewal/Authentication-requireCredential.after.ts	2026-11-12 21:23:11
@@ -4,36 +4,5 @@
     access: "owner" | "read" | "write" | "profiles",
     profile: ProfileId | null = null,
   ) {
-    const { credential } = parse(OwnerRequest, input);
-    if (!/^(ses|tok)_[a-f0-9]{64}$/.test(credential))
-      throw new AuthError("invalid_credential");
-    const row = this.db
-      .query(`SELECT ${credentialColumns} FROM credentials WHERE secret_hash=?`)
-      .get(sha256(credential));
-    if (row === null) throw new AuthError("invalid_credential");
-    const value = Schema.decodeUnknownSync(CredentialInfo)(row);
-    if ((value.kind === "session") !== credential.startsWith("ses_"))
-      throw new AuthError("invalid_credential");
-    if (value.revoked_at !== null) throw new AuthError("revoked", value.id);
-    if (Date.parse(value.expires_at) <= time)
-      throw new AuthError("expired", value.id);
-    if (access === "owner" && value.kind !== "session")
-      throw new AuthError("owner_required", value.id);
-    if (
-      access !== "profiles" &&
-      value.profile !== null &&
-      value.profile !== profile
-    )
-      throw new AuthError("profile_scope", value.id);
-    if (access === "write" && value.scope !== "read-write")
-      throw new AuthError("write_scope", value.id);
-    if (
-      profile !== null &&
-      this.db
-        .query("SELECT 1 FROM profile_deletions WHERE profile=?")
-        .get(profile)
-    )
-      throw new AuthError("profile_deleted", value.id);
-    this.ports.credentialUsed?.(value.id, time);
-    return value;
+    return this.credentialCheck(input, time, access, profile).info;
   }
```

### Authentication.mutate

Clock fix 6b167266 captures the Effect context and passes it to runSyncExitWith instead of starting a new default context. The synchronous mutation still runs in perform under the same writer transaction, with the same actor/Profile and exception behavior. The model has no wall clock or authentication transition; parsed depends_on forwarding and authoritative validation are unchanged. clock-fix-auth.diff retains that commit separately.

```diff
--- docs/evidence/ui-speed/server-reads/formal-read-renewal/Authentication-mutate.before.ts	2026-11-12 21:23:11
+++ docs/evidence/ui-speed/server-reads/formal-read-renewal/Authentication-mutate.after.ts	2026-11-12 21:23:11
@@ -5,20 +5,22 @@
       readonly profile: ProfileId;
     }) => Effect.Effect<A, StoreError | AuthError>,
   ) =>
-    this.perform("mutate", input.profile, (time) => {
-      const request = parse(AccessRequest, input);
-      const credential = this.requireCredential(
-        request,
-        time,
-        "write",
-        request.profile,
-      );
-      const result = Effect.runSyncExit(
-        operation({
-          actor: Schema.decodeUnknownSync(ActorId)(credential.id),
-          profile: request.profile,
-        }),
-      );
-      if (Exit.isFailure(result)) throw Cause.squash(result.cause);
-      return result.value;
-    });
+    Effect.contextWith<never, A, AuthError | StoreError, never>((context) =>
+      this.perform("mutate", input.profile, (time) => {
+        const request = parse(AccessRequest, input);
+        const credential = this.requireCredential(
+          request,
+          time,
+          "write",
+          request.profile,
+        );
+        const result = Effect.runSyncExitWith(context)(
+          operation({
+            actor: Schema.decodeUnknownSync(ActorId)(credential.id),
+            profile: request.profile,
+          }),
+        );
+        if (Exit.isFailure(result)) throw Cause.squash(result.cause);
+        return result.value;
+      }),
+    );
```

### readTasks

Profile and parsed filters are owned selectors. withState checks credentials and materializes data/graph in one synchronous lease; filtering and yielding occur afterward on those rows. Cache epoch capture remains before auth. OneSnapshot maps to one complete response carrying original strings and spans; client generation/identity publication guards and all matcher/runner bodies remain unchanged. The model does not cover SQL cost, auth, CPU scheduling, cancellation latency or memory bounds.

```diff
--- docs/evidence/ui-speed/server-reads/formal-read-renewal/readTasks.before.ts	2026-11-12 21:23:11
+++ docs/evidence/ui-speed/server-reads/formal-read-renewal/readTasks.after.ts	2026-11-12 21:23:11
@@ -3,9 +3,41 @@
   request: AccessRequest,
   filters: TaskFilters = {},
 ) {
-  const read = store.searchWords.read(request.profile);
-  const data = yield* store.auth.read(request);
-  const graph = yield* store.graph(request.profile);
+  const selected = Object.freeze({
+    credential: request.credential,
+    profile: request.profile,
+  });
+  const fields = { filters: { ...filters } };
+  const search = store.searchWords.read(selected.profile);
+  const {
+    selection: authority,
+    data,
+    graph,
+  } = yield* store.auth.withState(
+    selected,
+    Schema.Struct({ filters: TaskFilters }),
+    fields,
+    (read, data) =>
+      Effect.gen(function* () {
+        const selection = yield* store.auth.checkRead(read, "read");
+        const graph = yield* store.graphRead(read);
+        return { selection, data, graph };
+      }),
+    (selection) =>
+      Effect.succeed({
+        selection,
+        data: {
+          profiles: [],
+          tasks: [],
+          series: [],
+          projects: [],
+          tags: [],
+          history: [],
+        },
+        graph: { tasks: [], edges: [] },
+      }),
+  );
+  const checkedFilters = authority.fields.filters;
   const ordered = graph.tasks
     .filter((t) => t.deleted_at === null)
     .sort(
@@ -27,20 +59,23 @@
         a.id.localeCompare(b.id),
     );
   const context =
-    graph.edges.length || filters.ready || filters.blocked || filters.order
+    graph.edges.length ||
+    checkedFilters.ready ||
+    checkedFilters.blocked ||
+    checkedFilters.order
       ? graph
       : undefined;
-  const tasks = yield* filters.text === undefined
+  const tasks = yield* checkedFilters.text === undefined
     ? Effect.sync(() =>
-        filterTaskRecords(ordered, filters, data, undefined, context),
+        filterTaskRecords(ordered, checkedFilters, data, undefined, context),
       )
     : filterTaskRecordsEffect(
         ordered,
-        filters,
+        checkedFilters,
         data,
         {
           ...taskSearchExecution(),
-          prepare: (text) => store.searchWords.words(read, text),
+          prepare: (text) => store.searchWords.words(search, text),
         },
         context,
       );
```

### TaskCommands.list

withMetadata replaces separate global read/graph calls with one checked materialization and immutable parsed filters. Non-text filtering remains synchronous; text evaluation uses the same cooperative runner and memo provider after lease exit. ResponseOK/OneSnapshot publish complete rows/spans under unchanged client guards. No new model state or transition is needed; budget, cancellation and cache safety retain separate concrete proofs.

```diff
--- docs/evidence/ui-speed/server-reads/formal-read-renewal/TaskCommands-list.before.ts	2026-11-12 21:23:11
+++ docs/evidence/ui-speed/server-reads/formal-read-renewal/TaskCommands-list.after.ts	2026-11-12 21:23:11
@@ -7,10 +7,37 @@
   ): Effect.Effect<TaskRead[], AuthError | StoreError | SearchTooBroad>;
   list(request: AccessRequest, filters: TaskFilters = {}) {
     return Effect.suspend(() => {
-      const read = this.store.searchWords.read(request.profile);
+      const selected = Object.freeze({
+        credential: request.credential,
+        profile: request.profile,
+      });
+      const fields = {
+        filters: { ...filters },
+      };
+      const search = this.store.searchWords.read(selected.profile);
       return Effect.gen({ self: this }, function* () {
-        const view = yield* this.store.auth.read(request);
-        const graph = yield* this.store.graph(request.profile);
+        const {
+          selection: authority,
+          data: view,
+          graph,
+        } = yield* this.store.auth.withMetadata(
+          selected,
+          TaskListFields,
+          fields,
+          (read, data) =>
+            Effect.gen({ self: this }, function* () {
+              const selection = yield* this.store.auth.checkRead(read, "read");
+              const graph = yield* this.store.graphRead(read);
+              return { selection, data, graph };
+            }),
+          (selection) =>
+            Effect.succeed({
+              selection,
+              data: { projects: [], tags: [] },
+              graph: { tasks: [], edges: [] },
+            }),
+        );
+        const filters = authority.fields.filters;
         const tasks = graph.tasks.filter((task) => task.deleted_at === null);
         const context =
           graph.edges.length ||
@@ -19,7 +46,7 @@
           filters.order
             ? graph
             : undefined;
-        return yield* filters.text === undefined
+        const tasksRead = yield* filters.text === undefined
           ? Effect.sync(() =>
               filterTaskRecords(tasks, filters, view, undefined, context),
             )
@@ -29,10 +56,11 @@
               view,
               {
                 ...taskSearchExecution(),
-                prepare: (text) => this.store.searchWords.words(read, text),
+                prepare: (text) => this.store.searchWords.words(search, text),
               },
               context,
             );
+        return tasksRead;
       });
     });
   }
```

### mutateTask

Only invalid-Version error enrichment uses a freshly checked readState and bound Profile/id rather than re-reading the caller object. TaskCommands.change and authoritative mutation are identical. This is public refusal attribution, outside finite Task mutation transitions; no partial Task write is introduced.

```diff
--- docs/evidence/ui-speed/server-reads/formal-read-renewal/mutateTask.before.ts	2026-11-12 21:23:11
+++ docs/evidence/ui-speed/server-reads/formal-read-renewal/mutateTask.after.ts	2026-11-12 21:23:11
@@ -11,8 +11,17 @@
   const data = yield* readTasks(store, request);
   if (!Number.isSafeInteger(expected) || expected < 1)
     return yield* Effect.gen(function* () {
-      const task = (yield* store.auth.read(request)).tasks.find(
-        (task) => task.profile_id === request.profile && task.id === id,
+      const { selection: authority, data: checked } =
+        yield* store.auth.readState(
+          request,
+          Schema.Struct({ id: Schema.String }),
+          { id },
+        );
+      const task = checked.tasks.find(
+        (task) =>
+          authority.kind === "read" &&
+          task.profile_id === authority.profile &&
+          task.id === authority.fields.id,
       );
       return yield* Effect.fail(
         new CommandError(
```

## Model and runtime limits

DAG Begin/Validate/Record/Apply/Commit/Reject/Crash and replay bodies remain unchanged, as do authenticated initial-edge forwarding bodies. Store graph selection maps to an observation, not a write. The finite model does not establish authorization, leases, SQLite, clocks, multiple-operation imports, disk durability, filesystem correctness or unbounded safety. Public/read controls, issued-input replay, authenticated initial edges and guarded AtomicCAS are still required.

TaskSearch input, generation, response publication, rollback and recovery transitions are unchanged. The matcher, work meter, generator, spans, client guards and model are unchanged. A complete materialized response precedes yielding; no SQLite lease is held across matcher checkpoints. The model does not establish SQL latency, scheduling, cancellation latency, native pixels, focus or a mechanical TS/Swift refinement.

## Control debt O1 and O2

O1 adds restore-direct-removed: Snapshot while the Profile has never existed, then create it and issue a scoped Token, connect, and restore directly without deletion. The Token is proven live immediately before restore and absent at the pass. Literal baseline is ready/reload(generation 00000000-0000-4000-8000-000000000009, seq 18)/invalid_credential; head is ready/identical invalid_credential and close. The old revocation proxy must fail this case.

O2 records a discriminated pass check: not-observed, missing, live or ended. Every case must be observed; missing cannot mean unobserved. Ended authority means a credential row is missing or fails validity/read-scope checks at that pass; Profile tombstone alone does not end a valid unscoped credential. Exception eligibility is separate from wire omission. The four standalone revoke/expire cases now label ended authority but still require full two-frame equality. No product code changes.

## Qualification

Immutable product/control input is eca430bf1f3b5b9aeeb69a82c0086e3dab364249, with unchanged runtime source from ac6e7bd2. Both skills now pin that Git object; verifier inputs are committed at 1dcef6fd. DAG model, production and public stages are now complete on that same pinned product through the released stock continuation described below. The earlier default-command failures remain recorded; no default-command exit is relabelled. The stock TaskSearch formal runner invokes TLC, TypeScript and real matcher checks, not Swift; Swift client/runtime mapping still owes the compiled production TodoModel task-search drive under the Swift slot. Nothing Swift/native/Keychain/signing is run here.

## Historical park on the coordinator's disk hold

No more formal stage, suite, product compilation or large evidence write starts until the coordinator releases the hold. The three already-running top-level commands were allowed to finish. The per-function audit and mapping review are complete; no model change was required or made.

| Command / attempt | Real exit and evidence |
| --- | --- |
| 37 stream scenarios | 0; docs/evidence/ui-speed/server-reads/formal-read-renewal/stream-37/ and control-summary.json |
| Old revocation-proxy sensitivity on direct removal | 1 at the intended three-versus-two wire assertion; direct-old-proxy.log |
| Standalone matcher check at eca430bf | 0; matcher-0B0sqT under docs/evidence/task-search-formal |
| First DAG full command | 1 after model/algorithm/replay/integration success, missing repo-local jar for nested AtomicCAS; check-QDsDY9 / conformance-XkkutV |
| Second DAG full command | 1 at missing e717 baseline CLI/provenance; model, all 36 library mutants, exact restoration, integration, replay and guarded AtomicCAS pass; check-uI3bD0 / conformance-94Buj4 / public-60i3xA |
| First TaskSearch full command | 1 at stale source-map hash: the first pin-write helper hit its default child-output buffer on generated source before completing the search map; model and all intended controls pass; check-Qy9FpV |
| Corrected TaskSearch full command at eca430bf | 0, model, sensitivity, restoration, strict TypeScript, source map and real matcher; check-9Np8ay |
| Exact standing order 27 root check | 0 after disk guard 0; 431 domain, 69 CLI, 32 server, 168 Electron and one existing skip; root-check.log |

All main logs above are under docs/evidence/ui-speed/server-reads/formal-read-renewal/; formal detail directories are under docs/evidence/dag-formal/ and docs/evidence/task-search-formal/. Initial controller typecheck 1 (closure narrowing) and initial direct-base capture 1 (literal UUID from the deletion case) were wiring failures, corrected before the 37-case green. The exact direct-removal base reload UUID is 00000000-0000-4000-8000-000000000009, sequence 18.

The DAG public runner requires the preserved immutable e7170510a376b51eaf3525bb9933cb0dd588b233 CLI and its metadata at .scratch/bin/dag-f-todo-1aa1db7f8ede6a9401d4f9eaf5e52823ed8ec52a3275cd02b71e71040c95713b plus .provenance.json. Those were removed in the coordinator's disk prune. The run passed the current candidate's 31-case input matrix before stopping there. This is a missing verification prerequisite, not a product/model counterexample. It must be reconstructed through the immutable baseline recipe after release, then the public controls and complete DAG recipe must finish. No public full-pass is claimed.

Swift owed: the production TodoModel task-search/client-refinement drive, unhosted GeneratedContractTests and StateTests via scripts/swift-slot.sh apps/macos/scripts/verify-write-state.py with fresh scratch evidence and matching compiled CLI/server/seed inputs. The exact scope is .agents/skills/verify-macos/features/task-search.md: pending/late success/error, ABA, filters, Profile/view resets, full/query catalog debt, reload and real SSE refusal/recovery. The stock verify-task-search-formal/check.ts contains no Swift process invocation; its entire permitted stock recipe passed. Swift runtime/client proof is still owed, not inferred from source hashes or TLC. No Swift, native app, Keychain or signing was run.

Contract remains 78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289. Eleven closed runtime copies (620,626,142 bytes) are retired by hash in park-runtime-retirement.json; the follow-up found zero further copies. A root-cache cleanup attempt exited 1 because the pruned build.json manifest was absent; park-root-binaries.json records that no binary was removed by that attempt. DAG artifacts needed for the held continuation remain.

## Released stock public continuation

The coordinator released the missing public stage from parked head 063664203455289b6f47435520f574540d1fe701, first allowing the pinned baseline CLI rebuild, then explicitly authorizing the stock serial control/clean builds after the compile-plan audit showed those additional builds were required. No skill, control, count, model, invariant or bound was changed. No product source changed during this continuation.

| Released command / stage | Actual exit / result | Evidence |
| --- | --- | --- |
| Baseline e717 preparation, first attempt | 1 before any compiler: whole lock differs only for Electron's dev-only pele addition | dag-public-resume/build-pinned.log; baseline-lock-delta.diff |
| Baseline build, second attempt | 1: captured source lacked its workspace node_modules links; no usable binary | build-pinned-2.log |
| Corrected immutable e717 CLI build | 0; all four CLI-relevant manifests and installed production dependency versions match; only the one requested baseline target is built | build-pinned-3.log; baseline-inputs.json; baseline-runtime-dependencies.json; pinned-cli-build.json |
| First resource-wrapper setup | 1 before proof or compilation: Bun.build is writable but not configurable | public-stock.log; public-attempt-1-start.json |
| Stock public-check.mjs, all mode through the resource-only wrapper | 0; all 53 source mutants exit 1 at their named AssertionErrors, all 53 byte-exact restorations exit 0; no timeout | public-stock-2.log; docs/evidence/dag-formal/public-LYdR8w/result.json |
| Required public follow-through | 0: baseline, 31-case input matrix, generated contract artifacts, G11 literal/size/count checks, portable client, strict TypeScript, replay, integration and fresh clean CLI/server/driver rerun | public-LYdR8w/commands.json; sensitivity.json |
| End-to-end DAG stage binding | Model stages complete with expected exits/empty positive queues; production/library command 0 with 36 controls and guarded AtomicCAS; resumed public command 0 with 53 controls; all use eca430bf | dag-public-resume/completed-stage-ledger.json |

All relative resume evidence above is under docs/evidence/ui-speed/server-reads/dag-public-resume/ unless its full docs/evidence/dag-formal path is given. The wrapper changes only scheduling around Bun.build: one compiler, the 22 GiB floor and a file-backed pause gate at control boundaries. It leaves the stock public script and every control unchanged; their physical script hash is checked before and after. It records completed control names so a pause continues the same process without redoing controls. All 89 required compiler calls were serial. There was no coordinator pause, disk-floor stop, timeout, unexpected control failure or silent retry during the successful stock run. The only early retries were the explicit preparation/wrapper wiring failures listed above. The exact reusable wrapper and baseline-builder inputs are archived as text under dag-public-resume/inputs/.

Start 2026-11-13T03:26:25.392Z: load averages (1/5/15 minute) 6.48828125/4.4072265625/3.779296875, free 29.51 GiB. End 2026-11-13T03:32:35.834Z: load 5.0595703125/4.935546875/4.24609375, free 121.10 GiB. These observations include neighboring units; they are not a performance or reclaimed-capacity claim.

The rebuilt e717 CLI's SHA-256 is 59073293769769094dfbfef1b6ddfea0345def4f3a2ff6b93d3f32d6df13c7ef. Its actual source hash and complete loaded-module provenance are recorded separately from the legacy cache filename required by the runner. The store prune list did not contain that filename, so no claim of byte equality to a missing old binary is made. The source is immutable e7170510a376b51eaf3525bb9933cb0dd588b233; the old/current lock delta is solely the unrelated Electron dev package, while all CLI/runtime manifests and installed production versions match. After the proof, lsof found the rebuilt baseline closed and it was retired with its 90,679,010-byte size and hash recorded in retired-pinned-cli.json. Its provenance remains.

The two earlier complete check.mjs invocations retain their real exit 1 at missing prerequisites. They are not overwritten or called aggregate exit 0. The first completed model plus production checkpoint and the successful unchanged public continuation now cover every required default-recipe stage on the same immutable product, as bound in completed-stage-ledger.json. Passing completed stages were not rerun merely to replace a historical failed invocation. The separate TaskSearch full command remains exit 0 at check-9Np8ay, including model, sensitivity, restoration, source mapping and real matcher checks. The exact order-27 root command remains exit 0 at formal-read-renewal/root-check.log, 431/69/32/168 tests with one existing skip.

**One Swift-worker stage remains owed:** Task search, **Headless proof during HOLD**, in .agents/skills/verify-macos/features/task-search.md. Run scripts/swift-slot.sh apps/macos/scripts/verify-write-state.py with fresh evidence and source-matched TODO_CLI_BINARY, TODO_SERVER_BINARY and TODO_SEED_BINARY. This is the unhosted GeneratedContractTests and production TodoModel StateTests task-search/client-refinement drive, covering publication/late replies/ABA, filters and Profile/view reset, full/query catalog debt, reload and real SSE refusal/recovery. It is not executed by the stock TaskSearch formal command and was not run here. No Swift/native app/Keychain/signing action is claimed.

Final summary: 32 audited functions, 24 byte-identical and eight changed mappings with exact diffs; no model change. O1/O2 remain green across 37 cases, including the four ended-authority relabels with unchanged two-frame wire replies. Both formal renewals and the completed control debt are ready for the seat's re-check. Contract remains 78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289.
