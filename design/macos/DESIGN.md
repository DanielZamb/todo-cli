# Todo for Mac

D02 targets macOS 26 and uses native Liquid Glass. It renders the seven v1 screens in six states and both appearances. The October 27 user amendment and shared findings 1–6 replace the earlier D01 screen anatomy.

## Native structure and glass

`NavigationSplitView` supplies the sidebar and toolbar glass. `MenuBarExtra` uses its native window material. Neither has a D01 color painted over its glass. `Settings` supplies a native settings window.

The quick-add, editor, and conflict specimens appear over the twelve-task Today view. `GlassEffectContainer` hosts the floating controls. `.glassEffect(.regular, in: .rect(cornerRadius: 24))` supplies their system material. Secondary actions and removable chips use `.glass`; commit actions use `.glassProminent` with the primary tint. The actual menu-bar popover inherits its window glass without another panel effect.

Screenshots show task titles, section boundaries, priority, and dates behind the refractive panel. There is no custom blur, bitmap background, or opaque card behind floating controls. The task canvas retains the shared content colors because it is content rather than navigation glass.

This follows Apple's [Liquid Glass guidance](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views), [sidebar guidance](https://developer.apple.com/design/human-interface-guidelines/sidebars), and [MenuBarExtra API](https://developer.apple.com/documentation/swiftui/menubarextra).

## Shared review dispositions

The full source findings are preserved in [D01-r1.md](references/D01-r1.md). The approved D01 review at `8c29e73` adds [two shared polish items](references/D01-r2.md). Both are applied here. Project and one tag keep their natural widths, and overdue date text uses the destructive role with an explicit Overdue label.

| Finding | D02 disposition | Evidence |
|---|---|---|
| 1. Compact rows | A row is one 42-point line with checkbox, priority, title, muted Project and at most one tag at their natural widths, and right-aligned date metadata. The title takes the remaining width without truncating the metadata mid-word. Selection uses a quiet tint and a leading rule. | `today-ready-light.png`, `today-ready-dark.png` |
| 2. Visible priority | Every task row shows P1–P4. P1 and P2 have text plus semantic color. P3 and P4 stay quiet. Priority appears as a quick-add chip and an editor field. | Today, quick-add, and editor ready captures |
| 3. Daily review sections | Today has Overdue, Due today, and Scheduled today, with four tasks in each section. The overdue count is four in both sidebar and section. Task IDs are unique across the twelve rows. | Today ready captures and `ui-drive/today-dense.txt` |
| 4. One-input quick add | The input recognizes the fixture tokens `tomorrow`, `fri 10am`, `p1`–`p4`, `#tag`, and `@project`. Parsed chips are removable. Profile appears once in the header. Return adds. Command-Return adds and opens the editor. | Quick-add ready captures and compiled UI drive |
| 5. Editor order | Title, markdown Description, Due, Scheduled, Priority, Project, Tags, Recurrence, Energy, Estimate. There is no Status select or top-level Profile field. Completion, Cancel task, Reopen task, and Move to Profile are menu actions. The typical editor fits a window under 927 points tall. | Editor ready captures and `ui-drive/editor-order.txt` |
| 6. Live footer | The footer is absent while live. Loading shows Reconnecting. Offline shows Offline · Read only. There is no last-refresh timestamp. | Today ready, loading, and offline captures |

## Screen and state coverage

Each row has ready, empty, loading, error, conflict, and offline screenshots in light and dark appearances. Filenames are `screen-state-appearance.png` in [evidence/screenshots](evidence/screenshots).

| Screen | Ready content | Recovery behavior |
|---|---|---|
| `today` | Twelve tasks across the three daily review sections | Empty action, skeleton rows, retry, overlapping-change review, or read-only offline content |
| `overdue` | Open tasks ordered by due date, oldest first | Same states with Overdue context |
| `scheduled` | Tasks grouped by scheduled date, due dates independent | Same states with scheduled groups |
| `inbox` | Tasks without due or scheduled dates | Same states with Inbox context |
| `quick-add` | One input and removable parsed chips on glass | Draft stays through retry, refreshed choices, and reconnect. Submission stays disabled while unavailable |
| `editor` | Reordered native form on glass, base Version 7 | Draft stays through retry and reconnect. An overlap opens the comparison |
| `conflict` | Both title values, unselected radios, merge summary | Choices stay through recovery. A second conflict shows the newer title and Version |

Settings and design foundations add a ready capture in both appearances. The manifest contains 88 images. The Today ready images are also the requested dense-task evidence. The quick-add ready images are the parsed-chip and glass-over-content evidence.

## Semantic mapping

[TOKEN-MAPPING.md](TOKEN-MAPPING.md) maps every D01 role to Color assets, native type, geometry, and glass. System materials own the pixels on glass. Named surface colors remain available for content and the palette specimen. Native foregrounds, focus, disabled rendering, and materials respond to system appearance and accessibility preferences.

The priority-1 and priority-2 roles alias destructive and warning. Priority-3 and priority-4 alias muted-foreground. Task selection uses the selection pair. Text carries the priority meaning independently of color. Dates and scheduled dates remain separate. A displayed time includes America/Bogota. Fixture dates stay on October 26, 2026.

## Fixture boundaries

The preview has no database, credentials, HTTP calls, recurrence expansion, or concurrency algorithm. It never opens `~/.todo-cli/todo.db`. Buttons demonstrate local fixture outcomes rather than server acceptance. The inline-token recognition is a presentation fixture, not the authoritative date or task parser. W01 implements that contract through the generated server client.

The editor's transition menu and Move to Profile demonstrate placement. W01 implements the accepted task transitions and profile move. W01 also verifies sheet focus return, VoiceOver announcements, system appearance, Increase Contrast, and Reduce Motion in the integrated app.

The current D01 v2 contracts are preserved in the reference directory. Work has 16 distinct open tasks, Website has 13, and Personal site has 3. Today has twelve tasks, Scheduled has six, and Inbox has three. Personal is empty and displays no Work tasks.

D02 has no verification skill until W01, as its ticket specifies. [VERIFY.md](VERIFY.md) records the exact compiled-app build, drive, and capture path. Coordinator visual APPROVE remains required before integration.
