# Scheduler feature map

- [Restart and reminders](reminders.md)
- [Snooze wake-ups](snooze.md)
- [Credential cleanup](cleanup.md)
- [LaunchAgent lifecycle](lifecycle.md)

The [skill recipe](../SKILL.md) drives every feature through compiled artifacts.

The existing loop also creates a daily Snapshot once per UTC date and prunes
retention after creation. [Snapshot verification](../../verify-snapshots/SKILL.md)
proves a reminder restored after its due instant fires once from durable state.
