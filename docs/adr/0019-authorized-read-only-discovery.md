# Authorized discovery is explicit and read-only

Accepted, 2026-11-09. Coordinator Phase 0 gate with corrections A1 through A7.

Agents sometimes know a Task id prefix or a Project name without knowing its
Profile. Repeating exact-id requests hides the selected Profile and encourages
guessing. Discovery needs to show the authorized context before a caller chooses
a full Task id and Profile for a later command.

`todo profile list --projects` and `GET /profiles?include_projects=true` extend
existing discovery with Project ids and names grouped under stable Profile ids
and names. Empty Profiles have an empty projects array. Defined Projects remain
visible even when they have no Tasks. Existing discovery without the option
keeps its output.

`todo lookup --prefix <value>` and `GET /tasks/lookup?prefix=<value>` explicitly
search the caller's authorized Profiles. They return every visible matching Task
with Profile id and name, full Task id, title, and Project name or null. Empty
results are successful empty arrays. Prefix validation and literal,
case-insensitive matching follow ADR-0014. Deleted Tasks and Profiles are absent.

Authentication.profiles in packages/domain owns credential-to-Profile visibility.
Both read queries use that authorized set and authenticated Profile reads inside
one SQLite read transaction. Each response reflects one database state. Any
credential failure fails the entire read.
Profile-scoped Access Tokens learn nothing about any other Profile, its names,
Projects, Tasks, or counts. Owner Sessions and unscoped Access Tokens keep their
existing authorization. An invalid or revoked credential returns no rows. No
adapter performs an unfiltered scan to discover a match. No discovery cache or
new all-Profile SSE stream is added.

Discovery does not change the selected Profile or resolve an exact-id command.
Mutations keep full ids and the selected Profile. A lookup failure identifies
only the successfully authorized selected Profile and names both Profile-scoped
`todo list --prefix` and explicit `todo lookup --prefix` recovery. HTTP names
both corresponding routes. These generic hints query nothing. No error searches another Profile automatically.
Both desktop clients expose read-only directory and explicit prefix lookup
sheets through existing Profile navigation, including Compact. A result offers
Copy task id and `Show in <Profile name>`. Show is explicit user navigation
through existing draft protection. It closes discovery, selects the Profile,
and opens the Task. When a planning view would hide it, All tasks with the
full-id prefix filter makes it visible. Only a current authorized applied
result can trigger Show. CLI Markdown and table rows print the exact
`todo show <full-id> --profile <profile-id>` next command. JSON retains four keys.
Opening discovery alone does not change navigation or editor drafts.

The approved contract, UI states, workflow diagrams and proof plan are
in [the design gate](../decisions/agent-discovery-phase-0.md). Generated properties
exercise the real authorization and discovery queries. Bounded TLA+ checks and
client regressions cover late responses after Close, sign-out, or credential
replacement. These are separate claims, with separate bounds and receipts.

We rejected automatic cross-Profile resolution in show or mutations because an
ambiguous id or guessed Profile could select the wrong Task. We rejected a
client-side directory assembled from unrestricted data because the domain must
enforce Profile scope before disclosure. We rejected a second Task matcher and
an all-Profile live feed because neither is needed for explicit discovery.

ADR-0019 is reserved by the coordinator because the parallel DAG branch already
reserves ADR-0016 through ADR-0018. Error responses add the actual exit code and
its meaning. Markdown and both apps share `error 3 - not found or auth missing`
as the human wording. JSON keeps exit_code and exit_meaning.

## Amendment, 2026-11-09: CLI credential selection

The CLI stores a credential under a Profile name. Previously `--profile` chose
both that file and the target Profile. A lookup could find a Task in another
Profile but print a Show command that failed because the destination had no
stored credential. An unscoped agent Token could authorize the read and still
have no way to select its stored key separately from the target.

The global `--credential-profile <name>` flag explicitly selects the stored
credential file for every command, reads and mutations. A single CLI resolver
uses this value when supplied and otherwise uses today's `--profile` credential,
or default. No implicit fallback searches other files. `lookup` and `profile
list` have no target Profile. Their `--profile` selects a stored credential as
today, and `--credential-profile` takes precedence when both are present.

Lookup Markdown and table rows include `--credential-profile <used-name>` in
the exact Show command when it differs from the result's Profile. CLI lookup
recovery hints also carry the used credential name explicitly. A missing stored
credential returns exit 3, auth_required, and names only that credential Profile.
Existing behavior without the new selector stays unchanged.

[ADR-0005](0005-single-owner-profiles-and-two-credential-kinds.md) is unchanged.
Authentication still checks the selected key against the explicit target Profile.
A scoped Token cannot read or mutate another Profile and learns no foreign
names, ids, counts, or existence. Mutations still require the full Task id and
the explicit target Profile. The selector chooses a key, never a Task.

This is CLI credential plumbing. HTTP already carries its credential in the
Authorization header, and both apps use one owner Session. Neither needs another
UI control. We rejected credential-file fallback because it silently chooses a
key the caller did not name. The compiled regression uses a source login and a
destination logout, then proves that source lookup's printed Show command works.
