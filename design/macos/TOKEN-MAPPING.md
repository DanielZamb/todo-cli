# D01 to SwiftUI token mapping

Reconciled against D01 handoff v2 and the October 27 Liquid Glass amendment. macOS 26 is the deployment target. The source snapshots are [D01 tokens](references/D01-TOKENS.md) and [D01 states](references/D01-STATES.md). The shared design is approved at D01 commit `8c29e73`. D02 still requires its own coordinator visual verdict. No source files in D01 were changed.

The shadcn method maps a role to a paired foreground, then maps type, spacing, geometry, and component states. This preview uses that method with SwiftUI controls. It has no shadcn JavaScript dependency.

## Named colors

Every row is an opaque sRGB Color asset with Any and Dark appearances in `Assets.xcassets`. `Color("role")` resolves the asset from the compiled app bundle. `background-foreground` maps to shadcn `foreground`. The other names stay unchanged.

| D01 role | SwiftUI asset name | Light | Dark |
|---|---|---|---|
| `accent-foreground` | `accent-foreground` | `#244E37` | `#DBF1DF` |
| `accent` | `accent` | `#E0EDE3` | `#324B3A` |
| `background` | `background` | `#F7F8F5` | `#171D19` |
| `border` | `border` | `#D7DED5` | `#405045` |
| `card-foreground` | `card-foreground` | `#161D19` | `#F0F3EF` |
| `card` | `card` | `#FFFFFF` | `#1D2620` |
| `chart-1` | `chart-1` | `#285D46` | `#A6D7B8` |
| `chart-2` | `chart-2` | `#76550B` | `#EBCB83` |
| `chart-3` | `chart-3` | `#AF302D` | `#FFB4AA` |
| `chart-4` | `chart-4` | `#546359` | `#AFBDB1` |
| `chart-5` | `chart-5` | `#161D19` | `#F0F3EF` |
| `destructive-foreground` | `destructive-foreground` | `#FFFFFF` | `#4E1716` |
| `destructive` | `destructive` | `#AF302D` | `#FFB4AA` |
| `background-foreground` | `foreground` | `#161D19` | `#F0F3EF` |
| `input` | `input` | `#7B897E` | `#82978A` |
| `muted-foreground` | `muted-foreground` | `#546359` | `#AFBDB1` |
| `muted` | `muted` | `#EDF0EB` | `#253029` |
| `popover-foreground` | `popover-foreground` | `#161D19` | `#F0F3EF` |
| `popover` | `popover` | `#FFFFFF` | `#242F27` |
| `primary-active` | `primary-active` | `#1D4935` | `#C1E7CE` |
| `primary-foreground` | `primary-foreground` | `#FFFFFF` | `#122219` |
| `primary` | `primary` | `#285D46` | `#A6D7B8` |
| `priority-1` | `priority-1` | `#AF302D` | `#FFB4AA` |
| `priority-2` | `priority-2` | `#76550B` | `#EBCB83` |
| `priority-3` | `priority-3` | `#546359` | `#AFBDB1` |
| `priority-4` | `priority-4` | `#546359` | `#AFBDB1` |
| `ring` | `ring` | `#285D46` | `#A6D7B8` |
| `secondary-foreground` | `secondary-foreground` | `#263C2F` | `#E0EBDD` |
| `secondary` | `secondary` | `#E8EDE7` | `#2C3B30` |
| `selection-foreground` | `selection-foreground` | `#161D19` | `#F0F3EF` |
| `selection` | `selection` | `#F3F7F3` | `#222E25` |
| `sidebar-accent-foreground` | `sidebar-accent-foreground` | `#244E37` | `#DBF1DF` |
| `sidebar-accent` | `sidebar-accent` | `#E0EDE3` | `#324B3A` |
| `sidebar-border` | `sidebar-border` | `#D7DED5` | `#405045` |
| `sidebar-foreground` | `sidebar-foreground` | `#161D19` | `#F0F3EF` |
| `sidebar-primary-foreground` | `sidebar-primary-foreground` | `#FFFFFF` | `#122219` |
| `sidebar-primary` | `sidebar-primary` | `#285D46` | `#A6D7B8` |
| `sidebar-ring` | `sidebar-ring` | `#285D46` | `#A6D7B8` |
| `sidebar` | `sidebar` | `#F7F8F5` | `#171D19` |
| `success-foreground` | `success-foreground` | `#FFFFFF` | `#122219` |
| `success` | `success` | `#286341` | `#A6D7B8` |
| `warning-foreground` | `warning-foreground` | `#FFFFFF` | `#302405` |
| `warning` | `warning` | `#76550B` | `#EBCB83` |

`chart-1` through `chart-5` are reserved assets. There are no v1 charts. `primary-active` is reserved for a custom control if one becomes necessary. Glass button styles own pressed rendering. The asset is never used as an opaque glass background.

## Typography

| D01 token | SwiftUI mapping | Native allowance |
|---|---|---|
| `font-sans` | `.system` with SF Pro | macOS chooses the optical size |
| `font-mono` | `.monospaced()` with SF Mono | Version and shortcut metadata |
| `type-display`, 36/40, medium | `.system(size: 36, weight: .medium)` | Foundation specimen only |
| `type-title`, 24/30, semibold | `.title.weight(.semibold)` | System metrics and line spacing |
| `type-heading`, 16/24, semibold | `.headline` or `.title3.weight(.semibold)` | Native form and inspector hierarchy |
| `type-body`, 14/22, regular | `.body` or `.callout` | macOS body text is typically 13 points |
| `type-caption`, 12/18, regular | `.caption` | macOS metadata is typically 10 points |
| `type-code`, 12/18, mono | `.caption.monospaced()` | Metadata uses system metrics |

Native text wraps and uses system font metrics. SwiftUI styles replace forced CSS line heights and tracking. The window supports resizing and scrolls forms when content exceeds its height.

## Spacing and geometry

| D01 token | SwiftUI mapping |
|---|---|
| `space`, 4, 8, 12, 16, 24, 32, 48 | Identical point ladder in `Design.spacing`; component gaps, row insets, panels, and sections use these values |
| `radius`, 4 | Skeleton and spacing specimens |
| `radius`, 6 | Native menu rows use system geometry |
| `radius`, 8 | Content specimens and inline notices. Native fields own their shape |
| `radius`, 12 | Comparison outline. The floating panel uses a 24-point system glass shape |
| `radius`, 16 | Native feedback containers use system geometry |
| `radius`, 9999 | `Capsule` for tags |
| `control`, 28, 32, 36 | `.controlSize(.small)` and regular controls use macOS intrinsic sizes |
| `elevation-flat` | Task rows and canvas have no custom shadow |
| `elevation-soft` | The actual `MenuBarExtra` window owns its shadow and glass |
| `elevation-dialog` | System Liquid Glass supplies floating-panel elevation. W01 attaches the editor comparison as a sheet |
| `motion-fast` | No custom animation in this fixture. Native controls honor system preferences |
| `ring` | Semantic focus role maps to the native keyboard focus indicator. No ring is painted over glass |
| `border` | 0.5-point structural dividers and group outlines |
| `input` | Available for a custom field boundary. Native fields own their border |

## Roles on Liquid Glass

| D01 role | macOS 26 application |
|---|---|
| `background`, `foreground` | Content canvas and compact task rows. Never used to cover sidebar or toolbar glass |
| `card`, `card-foreground` | Content specimens and task details. Floating controls use system material instead |
| `popover`, `popover-foreground` | The semantic popover role maps to native `MenuBarExtra` glass, or `.glassEffect(.regular)` for its standalone specimen. Text uses adaptive native foregrounds |
| `primary`, `primary-foreground` | `.glassProminent` commit button tint. macOS supplies the foreground and optical states |
| `secondary`, `secondary-foreground` | `.glass` secondary actions. No tint preserves the system material |
| `accent`, `accent-foreground` | Semantic hover and navigation selection roles. The native sidebar owns its selection rendering |
| `selection`, `selection-foreground` | Exact quiet task-selection pair with a 2-point leading primary rule on content rows |
| `priority-1..4` | Exact aliases for destructive, warning, muted-foreground, and muted-foreground. Every row includes its P-number |
| `muted`, `muted-foreground` | Content metadata and skeletons. Text on glass uses native secondary foregrounds |
| `border`, `input`, `ring` | Native borders and focus on glass. Named assets remain content and palette references |
| `sidebar-*` | `NavigationSplitView` owns sidebar glass, selection, borders, and focus. The assets retain the shared vocabulary without an opaque sidebar fill |
| `warning`, `destructive`, `success` | Text plus status icons. Overdue date text uses destructive with an explicit Overdue label. Status meanings remain independent of task priority |
| `chart-1..5`, `primary-active` | Reserved roles. No v1 chart or custom pressed-control renderer |

The 43 named Color assets retain D01's exact light and dark values. The opaque-pair contrast audit checks those reference values. It does not claim that system glass pixels equal an opaque color, or that their contrast is independent of underlying content.

The glass implementation uses `GlassEffectContainer`, `.glassEffect`, `.glass`, `.glassProminent`, and the glass supplied by native toolbar, sidebar, and menu-bar scenes. There is no custom blur or opaque fill behind the floating panels. The screenshots show the system effect over actual task rows.

The user amendment takes precedence over D01's opaque surface recipes. Shared findings 1–6 take precedence over the superseded v1 screen anatomy. Rows match the current 42-point contract. Work has 16 distinct tasks, with twelve in Today, six in Scheduled, and three in Inbox. Project totals are Website 13 and Personal site 3. Personal is empty. No unresolved token-name or shared-anatomy mismatch remains. Native date controls and a native radio group replace Electron Calendar popovers and card-shaped choices. These platform mappings preserve the same values and state contract. Coordinator visual approval is a separate gate.
