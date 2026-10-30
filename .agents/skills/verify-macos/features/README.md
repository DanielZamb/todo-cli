# Native feature map

| Feature | Proof |
|---|---|
| [Offscreen design](design.md) | Fixture views at 2x in light and dark, without an app launch. |
| [Compact mode](compact.md) | Single-column layouts and offscreen window collapse and restore. |
| [History](history.md) | Foundation-only formatting tests during HOLD. |
| [Headless generated contract](contract.md) | Generated History and SSE decode redacted entries without apps or Keychain. |
| [Session](session.md) | Secure sign-in and Keychain restore after relaunch |
| [Move and copy between Profiles](transfer.md) | Generated contract, headless HTTP state, and offscreen full and Compact captures. |
| [Diagnostics](diagnostics.md) | Owner metadata, live/pause, Compact disclosures, whole rows and scratch HTTP. |
| [Move, Revert and Series](writes.md) | Headless production state and generated-client scratch HTTP proof during HOLD. |
| [Tasks](tasks.md) | Planning views, parsed quick add, editor and durable writes |
| [Conflict](conflict.md) | Stale write, explicit choice and current Version |
| [Live updates and reminders](live.md) | Compiled CLI write, cursor recovery and native notification |

Native verification is on HOLD. Apply the consent and fail-fast rules in
the parent SKILL.md before any feature drive.

`UITests/MenuBarFlowTests.swift` rechecks native sign-in, Keychain restore,
the actual MenuBarExtra, removable metadata, calendar editing and planning
navigation. One authorized focused mode runs through `scripts/run-ui-tests.py`
after the core CUA proof. Native behavior and generated-contract checks in
`unit` also access Keychain and require new consent.

Profile, Project and Tag discovery, counts, planning views, History and parsed
quick add use S04. Move to Profile, Revert and Series use the S05 generated client.
Their headless recipe is in writes.md; their native menus remain supervised proof.

[Owner Snapshots](snapshots.md) uses a separate compiled scratch server and
headless model test, plus offscreen Settings and Restore confirmation renders.


- [Import Tasks](import.md) covers file selection, preview, Apply and per-Task Conflicts in both layouts.
[Project and Tag creation](metadata.md) covers U01's headless matrix, reload,
second-client SSE, offscreen sheets and unsigned build.

[Profile deletion](profiles.md) has headless HTTP, generated contract, offscreen
full and Compact appearance, and unsigned compilation checks during HOLD.

Version guardrails are covered in [session](<session.md>).
