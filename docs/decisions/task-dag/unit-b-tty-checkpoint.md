# Unit B TTY checkpoint

Parent public source dc35c13194fb04e1a21d3ef08cdcf1c427b0f595.
Only the CLI confirmation placeholder changes in production, to the approved
literal [y/N]. The new compiled public PTY corpus passes No, EOF, Enter default
No, Yes and a competing edge add after preview. The changed fingerprint causes
has_dependencies exit 2. Both directions appear in the prompt. Non-TTY md
refuses without prompting. Purge dry-run preserves source state.

Actual typecheck exits are 0 for domain and CLI. Compiled public CLI/HTTP/PTYS
exit 0; individual PTY exits are 0, 0, 0, 0 and 2 as required. Evidence:
docs/evidence/task-dag/unit-b/tty/drive-1.
The driver compares source Tasks, edges, History, replay checkpoints and complete
owner Snapshot file contents on previews and cancelled confirmations. tty.json
retains each transcript and process exit. cleanup.json records the owned server
exit and scratch removal. build/binaries.txt, hashes and source hash retain the
cached binary provenance. No graph algorithm changed since f140c7b0; graph-queries
only gained the authenticated readGraph adapter in the public checkpoint.

Added proof input is packages/domain/scripts/tty-delete-proof.ts. No new domain
source file. The local comment audit found no added handwritten comments or
suppressions. No children, native app, signing, Keychain, real Todo directory,
owner Task, push, rebase, merge, PR or checkout switch. Import/export/Obsidian and
final source-SHA proofs remain required. This is a partial checkpoint.
