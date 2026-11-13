# Database and connection proof

## Sub-features

Private records, physical identity, HMAC nonce proof, socket binding, stale/copy
fallback and the server-only singleton guard.

## How to get to it (user POV)

Start the server on a database, then invoke the CLI with that same database.
The selected database determines discovery; a URL does not.

## Driving it with the compiled driver

Run the skill's Launch command. It owns two scratch databases and servers plus
an unrelated listener. Wrong-database and copied records must not route. A server
killed after proof must not receive a reconnected credential or command.

## Gotchas

No request may target an existing server or managed port. A test's unrelated
listener is owned by the driver. PID and default port are not identity proofs.
