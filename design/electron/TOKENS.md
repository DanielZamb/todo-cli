# Semantic tokens

Status: D01 handoff v2. Branch: `clients/d01-electron-design`. The local commit and verification report accompany this handoff.

Names are shared roles for Electron CSS and SwiftUI named colors. Values are opaque sRGB. Each foreground belongs to the surface in the same row. Native materials must preserve these text contrasts.

| Role | Light surface | Light foreground | Dark surface | Dark foreground | Use |
|---|---|---|---|---|---|
| `background` / `background-foreground` | `#F7F8F5` | `#161D19` | `#171D19` | `#F0F3EF` | Main canvas |
| `card` / `card-foreground` | `#FFFFFF` | `#161D19` | `#1D2620` | `#F0F3EF` | Task and editor panels |
| `popover` / `popover-foreground` | `#FFFFFF` | `#161D19` | `#242F27` | `#F0F3EF` | Quick add and menus |
| `primary` / `primary-foreground` | `#285D46` | `#FFFFFF` | `#A6D7B8` | `#122219` | Commit action |
| `secondary` / `secondary-foreground` | `#E8EDE7` | `#263C2F` | `#2C3B30` | `#E0EBDD` | Secondary action |
| `muted` / `muted-foreground` | `#EDF0EB` | `#546359` | `#253029` | `#AFBDB1` | Quiet bands and secondary text |
| `accent` / `accent-foreground` | `#E0EDE3` | `#244E37` | `#324B3A` | `#DBF1DF` | Selected view and hover |
| `selection` / `selection-foreground` | `#F3F7F3` | `#161D19` | `#222E25` | `#F0F3EF` | Selected task row tint, with a 2px primary leading bar |
| `destructive` / `destructive-foreground` | `#AF302D` | `#FFFFFF` | `#FFB4AA` | `#4E1716` | Error action |
| `success` / `success-foreground` | `#286341` | `#FFFFFF` | `#A6D7B8` | `#122219` | Accepted change |
| `warning` / `warning-foreground` | `#76550B` | `#FFFFFF` | `#EBCB83` | `#302405` | Conflict and offline notice |

`background-foreground` is named `foreground` in shadcn. All other pairs use the names above.

| Role | Light | Dark | Use |
|---|---|---|---|
| `border` | `#D7DED5` | `#405045` | Structural hairline, not a control boundary |
| `input` | `#7B897E` | `#82978A` | Visible field boundary |
| `ring` | `#285D46` | `#A6D7B8` | 2px focus outline, 2px offset |
| `primary-active` | `#1D4935` | `#C1E7CE` | Pressed primary |
| `sidebar` / `sidebar-foreground` | background / foreground | background / foreground | Planning navigation |
| `sidebar-accent` / `sidebar-accent-foreground` | accent pair | accent pair | Selected navigation |
| `sidebar-primary` / `sidebar-primary-foreground` | primary pair | primary pair | Navigation action |
| `sidebar-border`, `sidebar-ring` | border, ring | border, ring | Sidebar edges and focus |
| `chart-1..5` | primary, warning, destructive, muted-foreground, foreground | same semantic roles | Reserved, no v1 charts |

## Type and geometry

| Token | Value | Use |
|---|---|---|
| `font-sans` | system-ui, -apple-system, sans-serif | SF Pro on macOS, system substitute elsewhere |
| `font-mono` | ui-monospace, SFMono-Regular, monospace | Version and shortcut metadata |
| `type-display` | 36/40px, 500, -0.025em | Design page title |
| `type-title` | 24/30px, 600, -0.02em | View title |
| `type-heading` | 16/24px, 600, 0 | Panel heading |
| `type-body` | 14/22px, 400, 0 | Task and form copy |
| `type-caption` | 12/18px, 400, 0 | Metadata |
| `type-code` | 12/18px, 400, 0, mono | Version and shortcuts |
| `space` | 4, 8, 12, 16, 24, 32, 48px | Base 4px. Controls 8px; row columns 8px; panels 24px; sections 48px |
| `radius` | 4, 6, 8, 12, 16, 9999px | Accents, menu rows, controls, panels, toast, badges |
| `control` | 32px default, 28px small, 36px large | Aligned buttons and fields |
| `elevation-flat` | none | Canvas and task rows |
| `elevation-soft` | 0 4px 16px rgb(22 29 25 / 0.10) | Menu and quick add |
| `elevation-dialog` | 0 16px 48px rgb(22 29 25 / 0.18) | Modal conflict resolution |
| `motion-fast` | 120ms ease-out | Hover and selection; disabled under reduced motion |

Status text always accompanies color. Due dates and scheduled dates are distinct fields. Use an IANA time zone next to any time. Native text may scale with Dynamic Type.

## Round 2 interaction roles

`priority-1` uses destructive, `priority-2` uses warning, and `priority-3` and `priority-4` use muted-foreground. Every priority displays P1, P2, P3 or P4 as text. Disabled action buttons use the secondary pair at full opacity. The selected task row uses the selection pair with a 2px primary leading bar. Rows are 42px tall. An optional description snippet adds a second line; metadata never adds a line.
