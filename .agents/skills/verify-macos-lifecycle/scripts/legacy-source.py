#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path
import subprocess
import sys

root, scratch, evidence = map(Path, sys.argv[1:])
base = "7cfb2418351446119c992c6a257238114f9ec101"
receipts = []
for source, destination in (("main.ts", "legacy-main.ts"), ("lifecycle.ts", "lifecycle.ts")):
    command = ["git", "-C", str(root), "show", f"{base}:apps/server/src/{source}"]
    result = subprocess.run(command, text=True, capture_output=True, check=True)
    text = result.stdout
    for module in ("effect", "@effect/platform-bun"):
        text = text.replace(f'from "{module}"', f'from "{root}/apps/server/node_modules/{module}/dist/index.js"')
    text = text.replace('from "./server.ts"', f'from "{root}/apps/server/src/server.ts"')
    (scratch / destination).write_text(text)
    receipts.append(dict(command=command, exit=result.returncode, originalSHA256=hashlib.sha256(result.stdout.encode()).hexdigest(),
                         relocatedSHA256=hashlib.sha256(text.encode()).hexdigest()))
(evidence / "legacy-source.json").write_text(json.dumps(receipts, indent=2))
