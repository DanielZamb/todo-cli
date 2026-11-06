# Single owner, profiles instead of users, two credential kinds

The database belongs to one person. Multiple users are removed. Tasks are partitioned by **Profile** (for example work or personal) and grouped by **Project** inside a profile. Signing in with the owner's passphrase (Argon2id) creates a **Session**, used by the CLI, SwiftUI and Electron. A session has a fixed lifetime with no sliding renewal: we chose to sign in again now and then over long-lived credentials that are worth stealing. Agents and other services use a separate **Access Token**, issued explicitly, optionally limited to one profile with a read-only or read-write scope, and revocable by name. Both travel in the `Authorization` header, told apart by the `ses_` and `tok_` prefixes.

## Amendment (2026-11-06): sign-in lockout and passphrase reset

A security review (KIMI-2) found that the sign-in throttle let any process already on the Mac block the owner's sign-in while still allowing slow guessing. The owner chose a hard limit with local recovery instead:

- After 10 wrong passphrases in a row, sign-in refuses every attempt for one hour, the correct passphrase too, without running Argon2. The server answers 429 `TooManySignIns` with `locked_until`; the CLI exits 3 with `sign_in_locked`. When the hour ends, the next 10 attempts start a new run. A correct sign-in ends a run. Existing Sessions and Access Tokens keep working during a lock.
- The count is read from the wrong-passphrase rows in History since the last owner setup, sign-in or reset. It therefore holds across the CLI and the server and across restarts, and needs no new table. Wrong-passphrase rows are exempt from per-minute merging (ADR-0007 amendment); the lock caps them at 10 an hour.
- `todo reset-passphrase` sets a new passphrase and ends a lock. It first asks macOS to check the login password of the account running Todo (`dscl . -authonly`, with the password on a pipe, never in arguments). The reset revokes every Session and keeps Access Tokens. Like `todo init`, it is owner provisioning on this Mac, so it is a CLI command only, and both desktop apps show the server's lock message pointing to it (an exception to ADR-0009's UI rule, the same as owner setup).

The macOS password check is a presence check, not a security boundary: a process running as the owner can already edit the database file. It keeps a remote client or a prompt-injected agent with an Access Token from resetting the passphrase.

Rejected alternatives: `sudo`, because a root CLI leaves root-owned SQLite WAL and SHM files the owner's server cannot write, and root adds no protection against code already running as the owner. A permanent lock until reset, which lets any local process lock the owner out indefinitely. The previous exponential backoff alone, which still allowed unlimited slow guessing.
