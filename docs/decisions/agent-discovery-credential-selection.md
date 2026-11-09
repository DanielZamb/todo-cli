# Explicit CLI credential selection

Approved by the coordinator on 2026-11-09 after the compiled scratch recovery
workflow failed with auth_required. This amends the CLI plumbing in the
[agent discovery contract](agent-discovery-phase-0.md) and
[ADR-0019](../adr/0019-authorized-read-only-discovery.md).

Global `--credential-profile <name>` chooses the stored key for the invocation.
One CLI resolver uses it when supplied, otherwise `--profile`, otherwise default.
An explicit empty selector is a usage error with exit 2 and never falls back.
It applies to every command that uses stored credentials, reads and mutations.
No implicit fallback reads a different credential file. Authorization and exact
Task id rules remain in the domain. A scoped key against a different target
still fails with exit 3 and no foreign context.

`lookup` and `profile list` have no target Profile. `--profile` keeps its existing
credential-file meaning for these commands, and `--credential-profile` wins when
both flags are supplied. Man pages and command schemas explain the precedence.

Lookup Markdown and table rows print this next command when the credential name
and the result's Profile differ:

```sh
todo show <full-id> --profile <result-profile> --credential-profile <used-key-name>
```

Omit the credential flag when its value equals the result Profile. Every value
is shell-quoted, with flag=value for a dash-leading value when the CLI parser
requires it. JSON lookup rows retain exactly profile, task_id, title and project.
CLI lookup recovery includes `todo lookup --prefix <p> --credential-profile
<used-key-name>`. Scoped list recovery also retains the explicit target Profile
and the correct key when they differ. HTTP hints are unchanged because the
Authorization header carries the key independently of the route's Profile.

B owns the global flag, centralized CLI credential resolver, Show next commands,
manual/schema documentation and regressions. A owns shared lookup-error recovery
text; L1 wires the resolved credential name across the integrated call sites.
No app UI is added. HTTP and both clients already select the key independently
of the target Profile under ADR-0005.

The compiled regressions cover source and destination login followed by a
destination logout, then a source lookup whose printed Show command reads the
Task successfully. They also cover a source-scoped key refused against the
destination without leaks, unchanged owner behavior without the selector, and
an absent selected key returning auth_required with only that key's Profile name.
Initial failure evidence stays local at docs/evidence/agent-discovery/recovery-credential.

The UI request-order contract is unchanged. The model-ready proof at E's immutable
checkpoint remains a proof of those bounded states, with production mapping still
unproven. Its final mapping will reference the integrated contract and source.
