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
