# Todo for Electron

D01 round 2 keeps system type, one forest accent, and the semantic token pipeline. It applies all 11 findings in the coordinator's review of `08947d2`. This is an interactive design reference with fixed October 26, 2026 fixtures. It has no database or real server.

## Foundations

[TOKENS.md](TOKENS.md) is the shared Electron and SwiftUI token table. `pnpm tokens` generates `src/index.css`. The page measures foreground contrast in both themes. Nova supplies compact Base UI controls. Lucide icons use 16px in controls.

The light canvas is green-white with white panels. The dark theme uses opaque green-charcoal panels. Task selection uses a subtle `selection` fill and a 2px primary leading bar. P1 uses destructive text, P2 uses warning text, and P3 and P4 use muted text. Every priority includes its P-number. Disabled actions use the secondary pair at full opacity so their labels stay readable.

Use 4px spacing units. Default controls are 32px tall, with 8px corners. Panels have 12px corners. Task rows are 42px tall. A description snippet alone may add a second line. Menus use soft elevation and dialogs use deeper elevation. Focus uses a solid 2px ring with a 2px offset. Hover transitions take 120ms. Reduced motion disables transitions and animations.

## Screen recipes

### Task views

The sidebar starts with a working Profile switcher. Views and Projects use the same icon, title and count columns. The Work fixture contains 16 distinct open tasks: Website has 13 and Personal site has 3. The Personal fixture is empty and demonstrates a Profile change without showing Work tasks.

Today follows SPEC 12.4 and contains 12 tasks across Overdue, Due today and Scheduled today. A task that qualifies for multiple sections appears once, with Overdue first, then Due today, then Scheduled today. The selected task, Prepare launch notes, has both a due date and a scheduled time and appears in Due today. The shared domain remains authoritative for membership in E01.

Each row has a completion checkbox, priority, title, muted Project and tags, and right-aligned due and scheduled metadata. Metadata stays on the same line. Long titles truncate and keep their full accessible name and title tooltip. At narrow reference widths, Project and tags hide to preserve the title and date. The Electron target begins at 960px.

The view title and date line identify the content. No extra Profile or Planning eyebrow appears in the task pane. SSE is live by default, so no connection text appears while connected. Loading shows Reconnecting. Offline shows Offline (read only), preserves visible tasks and drafts, and disables writes through every overlay.

### Menu-bar quick add

Quick add contains one task input and shows the current Profile once. Recognized inline tokens become removable chips on a space or blur. The fixed fixture understands `tomorrow`, `fri 10am`, `p1` through `p4`, `#tag` and `@project`. Tomorrow maps to October 27; Friday maps to October 30 at 10:00 AM in America/Bogota. The default fixture shows scheduled, P1, tag and Project chips.

Enter adds the task. Cmd+Enter adds it and opens the editor with the entered title. Successful fixture acceptance clears the input and chips. Error, conflict and offline references keep the draft. E01 replaces this small fixture lexer with the shared domain parser. It is not a second implementation of natural-language scheduling.

### Task editor

The editor order is Title, Description with Markdown, Due, Scheduled, Priority, Project, Tags, Recurrence, Energy and Estimate. Property rows are compact and the typical task fits a 927px-tall window. Dates and times are independent. Recurrence presets describe a Series rule; E01 maps them to the ADR-0006 RFC 5545 contract.

Status transitions are actions. Completion uses the row checkbox. The Task actions menu contains Cancel task and Reopen task. Move to Profile is in the same menu. There is no Status select or top-level Profile field.

Due and Scheduled use a shadcn Popover and Calendar. Dates consistently display the English month name and day, such as October 26. Add time reveals a 12-hour text field with a 10:00 AM example and the America/Bogota zone. No native date or time control appears.

### Conflict resolution

The titled Dialog shows equal full-width cards for Your change and Latest accepted. Each highlights the differing title words. Every overlapping field requires a choice before Save resolution enables. Non-overlapping Description and Project changes merge. The result panel displays the selected title. History keeps the rejected attempt.

## States and evidence

[STATES.md](STATES.md) defines seven screens across six states. [evidence/README.md](evidence/README.md) indexes the complete regenerated set and the extra Today density and parsed-chip screenshots. The compiled verifier asserts row heights, section counts, editor bounds, chip behavior, shortcut behavior, menu actions, calendar behavior, readable disabled actions and both conflict outcomes.

## Scope and gates

D01 is not the Electron binary. E01 owns server integration, SSE, menu-bar placement, safeStorage, cross-restart drafts, real conflict computation and the verification skill. The curated shadcn set contains only D01 controls. The coordinator owns visual and design-taste review. Integration waits for APPROVE.
