#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path
import subprocess
import sys

source, scratch, evidence = map(Path, sys.argv[1:])
def sha(path):
    return hashlib.file_digest(path.open('rb'), 'sha256').hexdigest()
root = subprocess.check_output(['git', '-C', str(source.parent), 'rev-parse', '--show-toplevel'], text=True).strip()
result = {
    'source_cli': str(source),
    'source_checkout': root,
    'source_head_at_copy': subprocess.check_output(['git', '-C', root, 'rev-parse', 'HEAD'], text=True).strip(),
    'source_worktree_status_at_copy': subprocess.check_output(['git', '-C', root, 'status', '--short'], text=True),
    'cli_sha256': sha(scratch / 'todo'),
    'server_sha256': sha(scratch / 'server'),
    'development_artifact': True,
    'note': 'The copied binary hash identifies this run. Source HEAD and status are observations, not a claim that the binary was built from that exact tree.',
}
(evidence / 'provenance.json').write_text(json.dumps(result, indent=2) + '\n')
