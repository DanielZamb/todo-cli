# Discovery source mapping

Status is model-ready preparation. Production conformance is unproven.

The approved immutable contract is commit
7c9d3b7d3f9fd5d06cf8cc533ee42f1811230efa at
`docs/decisions/agent-discovery-phase-0.md`, ADR-0019 and the coordinator gate.
The model's event names refer to that contract. No C/D implementation is present
in this branch at this checkpoint, so there is no production sync commit and
no covered discovery production hash. Existing Task search hashes stay intact.

| Model part | Final mapping obligation |
| --- | --- |
| requestedIdentity | Captured credential scope, dialog kind and submitted prefix; no request while merely typing. |
| generation | Latest submission token, invalidated immediately on prefix edit, including ABA. |
| credentialGeneration | Credential epoch invalidated on sign-out, replacement and same-scope replacement. |
| dialogGeneration | Dialog lifetime epoch invalidated on Close and reopen, including same-kind reopen. |
| ResponseOK | One synchronous identity/rows/state publication after all awaits, guarded by all current epochs and latest submitted identity. |
| ResponseError | Same guard before error state or error copy can change. |
| Close, SignOut, CredentialChanged, EditPrefix | Immediate row clearing and invalidation through every actual dismissal/authentication path. |
| Retry | Exact failed submitted identity, with no accidental use of unsubmitted text. |
| Show | Current authorized applied row, existing draft decision, capture before Close clears rows. |
| ShowResponseOK | Exact-id authorized read under current credential, preserved source Profile/id, rechecked generation before open; Profile selection and All tasks fallback verified in client regressions. |

The final review must name concrete Electron and TodoModel functions, exact
immutable SHA, whole-file SHA-256 values, real-production regression commands
and evidence, and real-code sensitivity/restoration. Awaited network reads are
not atomic. Only synchronous checked publication can map to one model step.
Any split check-and-await-and-publish path needs explicit modeling or a finding.
A code defect remains a finding; the model must not change merely to pass it.

The existing verify-task-search-formal mapping covers whole client files. Their
hashes must not be renewed solely because discovery changed the same file.
Review the affected Task search functions and run its sensitivity and final
check at the actual reviewed client SHA before renewing those hashes.
