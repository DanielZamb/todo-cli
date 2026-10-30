# CLI feature map

| Feature | Recipe |
| --- | --- |
| Task History after Purge | [history.md](history.md) |
| Task lifecycle and Version conflicts | [tasks.md](tasks.md) |
| Owner Sessions and Profiles | [auth.md](auth.md) |
| Review and golden output | [planning.md](planning.md) |
| Export and Obsidian files | [files.md](files.md) |
| Help, manual and configuration | [discovery.md](discovery.md) |
| Agent JSON contract and command schemas | [agent-contract.md](agent-contract.md) |

All recipes run through the compiled binary using the helper in the parent skill.

Live server monitoring is covered by [Diagnostics](../../verify-diagnostics/features/panels.md).
[Owner Snapshots](../../verify-snapshots/SKILL.md) verifies create, list, show,
restore and prune, their published schemas and destructive dry runs through
the compiled CLI. It includes Purge redaction and invalid-copy refusal.
Move and Copy use the compiled CLI cases in `apps/cli/test/cli.test.ts` and
`contract.test.ts`. They check filtered selection, dry-run, metadata and timestamps,
completed status, per-Task Conflict reports, source isolation, and both schemas.

Version guardrails are covered in [agent-contract](<agent-contract.md>).
