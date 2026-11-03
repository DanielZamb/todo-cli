# Attachment URI links and atomic input groups

Accepted, 2026-11-03. Supersedes the HTTP(S)-only storage restriction in
ADR-0011. Its file ownership, copied image, opening and Purge rules remain.

A link Attachment stores an absolute URI with a scheme, including opaque URIs
such as `mailto:` and application URIs such as `t3-thread://`. HTTP and HTTPS
URIs still need a host and must not contain credentials. Whitespace and control
characters are invalid in a URI. A local path remains a file or image reference.
An explicit file input always means a path, even when its name contains a colon.
Neither validation nor display fetches a link. The desktop clients continue to
open only HTTP and HTTPS links. Storing another scheme does not authorize
executing it through the operating system.

Creation accepts an array of references with kind, location and optional label
or name. All references must validate and file paths must identify existing
files before the Task commits. The first Occurrence may carry these references;
the Series and later Occurrences do not inherit them. Import accepts the same
array and adds missing references without removing existing Attachments.
An invalid reference rejects that import item and rolls back its Task changes.
The existing single attach command may still record a missing path, as ADR-0011
allows, and existing paths that disappear remain attached.

Batch Attachment input groups references by Task id and expected Version. Each
Task group commits atomically, independently of other groups. Results distinguish
attached, unchanged and rejected. Repeating the same kind, location, label and
name does not add another Attachment. Version checks run even for unchanged
groups. Dry runs execute against an isolated in-memory database copy.

Import may adopt an existing Task without an external id by supplying its Task
id and expected Version. Adoption is an edit of that Task, preserving its id,
History and omitted fields. The external id must be free in the Profile. A
stale adoption leaves the Task without that external id and reports its current
Version. A later import matches the adopted external id normally.

We rejected a special Attachment kind for T3 threads, creating a Task before
checking its references, and replacing a Task to give it an external id.
