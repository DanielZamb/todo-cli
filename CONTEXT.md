# Todo

Personal, local-first task tracking for one person. Agents and several clients read and write it.

## Language

### Organizing work

**Profile**:
A separate space of tasks for one area of life, such as work or personal. Every task belongs to exactly one profile.
_Avoid_: User, account, workspace

**Project**:
A named group of related tasks inside a profile.
_Avoid_: List, folder, area

**Task**:
One thing to do. It has a title, a status, and optional scheduling and effort metadata.
_Avoid_: Todo, item, ticket

**External id**:
A stable identifier supplied by another system to match a Task during import. It is optional and unique inside a Profile. Copy creates a new Task in another Profile and clears the external id; provenance records the source Task. Move keeps the external id because it is the same Task. A Move is rejected if that external id already exists in the destination Profile.

**Series**:
A recurring task definition that holds the recurrence rule and creates occurrences.
_Avoid_: Template, repeating task, routine

**Occurrence**:
One task created by a series, for one date in its rule.
_Avoid_: Instance, child task

**Tag**:
A free-form label on a task, used to cut across projects.
_Avoid_: Label, category

**Attachment**:
A file, image or link referenced by a Task. Files stay where they are, while pasted or dropped images are copied into Todo's per-Profile attachment store.
_Avoid_: Asset, upload

### Task lifecycle

**Version**:
The number of the last accepted change to a task. A change is rejected if it was based on an older version.
_Avoid_: Revision, etag

**Conflict**:
A change that was rejected because it was based on an outdated version of the task.
_Avoid_: Collision, merge error

**History**:
The ordered record of every change attempted on a task, whether it was accepted or rejected.
_Avoid_: Audit trail, activity, changelog

**Revert**:
Undoing an accepted change by recording its opposite change. The original change stays in the history.
_Avoid_: Undo, rollback

**Delete**:
Removing a task from view. It can be recovered, and clients are told it is gone.
_Avoid_: Remove, trash

**Purge**:
Erasing a deleted task for good. Its History keeps that changes happened but loses what they said.
_Avoid_: Hard delete, destroy

### Planning views

**Inbox**:
Open tasks with no due or scheduled date.
_Avoid_: Backlog, unsorted

**Overdue**:
Open tasks whose due date has passed.

**Review**:
A daily or weekly pass over open tasks to decide what to do next.
_Avoid_: Digest, summary

### Profile lifecycle

**Delete a Profile**:
Hides the Profile from discovery and every Profile-scoped HTTP route. A Profile
with visible Tasks is refused unless Delete Tasks too is explicitly selected.
Deleted Tasks do not count. The last remaining Profile cannot be deleted.
After authorization, refusal and dry-run checks, the domain takes a Snapshot.
If it succeeds, the deletion transaction rechecks the rules, then records
recoverable Task Deletes and the Profile deletion. History stays. The Profile
itself cannot be restored in place. Recovery uses the pre-deletion Snapshot.
Profile IDs stay reserved forever. A name can be reused for a new Profile with
a new ID. Sessions and unscoped Access Tokens belong to the owner and survive;
Profile-scoped Access Tokens are revoked. A client whose current Profile
disappears receives an SSE notice and switches to a remaining Profile.

### Database recovery

**Snapshot**:
A point-in-time copy of the whole Todo database that the owner can list and restore.
_Avoid_: Backup, replay checkpoint. Internal `snapshots` rows are replay checkpoints in prose.
