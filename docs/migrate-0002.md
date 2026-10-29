# Migrate the approved database to 0002

Run these commands from the checkout after C02 merges into `track/core`.
The core sub-coordinator owns this production step. C02's tests and compiled
driver use scratch databases and do not open the real database.

Stop the old Go writer and other database writers. Record the old counts:

```sh
db="$HOME/.todo-cli/todo.db"
backup="$HOME/.todo-cli/todo.db.v0.1.bak"
test -f "$db"
sqlite3 -readonly "$db" 'PRAGMA user_version; SELECT count(*) AS profiles_to_migrate FROM users; SELECT count(*) AS tasks FROM tasks; SELECT count(*) AS task_tags FROM task_tags; SELECT user_id,status,count(*) FROM tasks GROUP BY user_id,status ORDER BY user_id,status;'
```

Create the required backup once. SQLite's backup command includes committed WAL
contents. Keep the backup after migration:

```sh
test ! -e "$backup" && sqlite3 -readonly "$db" ".backup '$backup'"
sqlite3 -readonly "$backup" 'PRAGMA integrity_check; SELECT count(*) FROM tasks;'
```

The migration-only invocation below requires an absolute, existing database
path. It opens the file, migrates it, reads connection settings, and closes it.
It never seeds fixtures, appends a sample operation, rebuilds, or reverts:

```sh
bun packages/domain/scripts/migrate.ts "$HOME/.todo-cli/todo.db"
```

Expect `{"journal_mode":"wal","busy_timeout":5000,"user_version":2}`.
The equivalent Effect API invocation is:

```ts
import { Effect } from "effect";
import { openStore } from "@todo/domain/store";

Effect.acquireUseRelease(
  openStore({ path: absoluteExistingPath, create: false }),
  (store) => store.settings(),
  (store) => Effect.orDie(store.close()),
)
```

Check the resulting counts and database integrity:

```sh
sqlite3 -readonly "$db" 'PRAGMA user_version; PRAGMA journal_mode; PRAGMA integrity_check; PRAGMA foreign_key_check; SELECT count(*) AS profiles FROM profiles; SELECT count(*) AS tasks FROM tasks; SELECT count(*) AS task_tags FROM task_tags; SELECT count(*) AS projects FROM projects; SELECT count(*) AS tags FROM tags; SELECT count(*) AS series FROM series; SELECT outcome,reason,count(*) FROM op_log GROUP BY outcome,reason; SELECT count(*) AS snapshots FROM snapshots; SELECT profile_id,status,count(*) FROM tasks GROUP BY profile_id,status ORDER BY profile_id,status; SELECT name FROM sqlite_master WHERE type="trigger" ORDER BY name;'
sqlite3 -readonly "$backup" 'SELECT id,user_id,row_version,title,status FROM tasks ORDER BY id;'
sqlite3 -readonly "$db" 'SELECT id,profile_id,row_version,title,status FROM tasks ORDER BY id;'
```

Profile, task, and task-tag counts must equal their old counts. The log initially
has one committed `migration:0002` baseline event per task and no rejected rows.
Snapshots initially number zero. `integrity_check` must return `ok`, and
`foreign_key_check` must return no rows. A repeated migration-only invocation
must retain the counts and sequences.

Retire the Go binary after success. Migration removes the legacy `users` and
`sessions` tables and their credential hashes. The new auth subsystem establishes
owner credentials separately. Each old profile ID and task ID stays unchanged.
Legacy project and tag names become profile-scoped IDs with their names intact.
Legacy timestamps become UTC instants with the UTC zone because v0.1 did not
retain an intended IANA zone. Recurrence text is retained in a Series without
expansion. Invalid legacy facts abort and roll back the schema conversion.
