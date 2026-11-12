# Candidate 8 Compact sheet survey

Opus Mac UI seat ruling 5 (on candidate 7) asked for every Compact sheet to be
checked. It also said not to build window growth. So every sheet must fit the
Compact window, 393 × 426 pt: its actions fully visible, nothing past its width,
and long content scrolling inside its body.

## Method

- **The suite.** Every sheet that can open over the Compact window has a Compact
  capture in the full design suite, rendered at 393 × 426 pt in light and dark.
  For each sheet, one representative capture from f1c3def5's complete set was
  read by eye.
- **The candidate 8 set.** A new review set, `TODO_SNAPSHOT_C8_ONLY` in
  `apps/macos/scripts/verify-design.py`, recaptures what candidate 8 changes: 10
  states, 20 images. Each capture writes a bounds receipt:
  - the window;
  - where its content starts (global frames include the 32 pt title bar);
  - every Compact frame;
  - `controlsInside`, which says whether every action, footer and Dismiss frame
    lies inside the window.

  The harness fails if any is outside, or if Dismiss is smaller than 28 × 28 pt.

## Sheets

| Sheet | Compact captures in the suite | Read | Fits | Note for the seat |
| --- | --- | --- | --- | --- |
| Batch edit | `batch-edit-*-compact` (14) | ready | Yes | — |
| Attachment batch | `attachment-batch-*-compact` (12) | — | Yes (receipts in the suite) | — |
| Attachment label editor | `attachments-label`, at 393 × 426 | — | Yes | Its name lacks "compact"; it is the Compact size |
| Import | `compact-import-*` | preview, rejected rows | Yes | — |
| Dependency picker | `dag-compact-picker-*` (46) | added; long loop notice | Yes; the list scrolls under the notice | — |
| Dependency batch | `dag-compact-batch-*` (10) | long selection | Yes | A scrolled list shows a partly hidden top row under the Action header |
| Delete confirmation | `dag-compact-delete-*` (24) | blockers | Yes | — |
| Dependency graph | `dag-graph-compact-*` | — | Yes (suite bounds checks) | — |
| Series | `dag-compact-series-initial` | initial | Yes | The default action, "Create Series", renders as plain text beside a bordered Close. A raw `FREQ=DAILY` line sits under the chips. |
| Task filters | `dag-compact-filter-*`, `*-compact` filters | combined | Yes | — |
| Copy and Move to Profile | `compact-transfer-*` | copy picker | Yes | — |
| New Project or Tag | `metadata-sheet-*-compact` | empty | Yes | — |
| Profile deletion | `compact-profile-delete-*` | refusal | Yes | — |
| Snapshot restore | `compact-snapshot-restore*` | error | Yes | — |
| Find Task by id | `discovery-compact-*` | copied | Yes | — |
| Quick-add (popover) | `compact-quick-add*`, `c8-compact-quick-add-short` | short | Yes; the receipt's controls are inside | — |
| Editor (inspector in Compact) | `compact-editor`, `c8-compact-editor` | editor | Yes; the receipt's controls are inside | Ruling 5 holds: no Find field, a three-line description and a regular footer |

## Candidate 8 review captures (rulings 1, 2, 3, 5 and D1/D2)

| Capture | Ruling | Receipt |
| --- | --- | --- |
| `c8-picker-follow-up-failed` (Compact) | 1: the notice and its button stay; the failure shows with them | controls inside |
| `c8-banner-hand-off-depends`, `c8-banner-hand-off-blocks` | 2: both Tasks are named, the dependent first | Dismiss 28 × 28, inside |
| `c8-banner-dismiss`, `c8-compact-banner-dismiss` | 3: Dismiss is 28 × 28 pt in the secondary colour | Dismiss 28 × 28, inside |
| `c8-compact-editor`, `c8-compact-quick-add-short` | 5 | controls inside |
| `c8-picker-merged` (Compact) | D2: same-kind failures on two rows, one reason | controls inside |
| `c8-banner-merged-same-reason`, `c8-banner-merged-different-reasons` | D2 in the banner | Dismiss 28 × 28, inside |

Ruling 4 (accessibility: combine only the Label; announce once per sequence)
has no visual state; its state tests cover it.

Wording note for the seat (D2): when the parts share a reason, the merged
message repeats the single-Task sentence ("This Dependency would create a loop.
Choose another Task.") after a count of two. The coordinator's example used a
plural form ("Each would create a cycle."). Plural sentences per code would need
new wording; that is the seat's call.
