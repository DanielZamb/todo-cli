#!/usr/bin/env python3
import json
from pathlib import Path
import re
import subprocess
import sys

root = Path(__file__).resolve().parents[3]
base = '2c78a3263c196d870459b17bf647cfc23f421fdd'
sources = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', base, 'apps/macos/Sources'], cwd=root, text=True).splitlines()
original = '\n'.join(subprocess.check_output(['git', 'show', f'{base}:{name}'], cwd=root, text=True) for name in sources if name.endswith('.swift'))
current = '\n'.join(path.read_text() for path in (root / 'apps/macos/Sources').glob('*.swift'))
pattern = r'accessibilityIdentifier\(\s*"([^"\n]*)"\s*\)'
expected = set(re.findall(pattern, original))
actual = set(re.findall(pattern, current))
missing = sorted(expected - actual)
dependency_identifiers = ['dependency-add', 'dependency-depends-on', 'dependency-blocks', 'dependency-picker', 'dependency-direction', 'dependency-search', 'dependency-choice-', 'dependency-pending-', 'dependency-picker-close', 'dependency-error', 'dependency-warning', 'dependency-reload', 'dependency-state-', 'filter-ready', 'filter-blocked', 'task-order-topo', 'task-order-lightest', 'dependency-drag-source-', 'dependency-drop-target-', 'dependency-drop-status', 'dependency-initial-', 'dependency-follow-up', 'dependency-delete-dialog', 'dependency-delete-depends-on', 'dependency-delete-blocks', 'dependency-delete-changed', 'dependency-delete-cancel', 'dependency-delete-confirm', 'dependency-batch-preview', 'dependency-batch-apply', 'dependency-batch-row-', 'dependency-batch-summary', 'dependency-graph', 'dependency-graph-task-', 'dependency-graph-expand-', 'dependency-graph-overview', 'dependency-graph-list', 'dependency-graph-diagram', 'dependency-graph-details', 'dependency-graph-copy-mermaid', 'dependency-graph-retry', 'dependency-graph-reset', 'dependency-graph-close', 'dependency-graph-related-', 'dependency-graph-expand-related-', 'dependency-graph-actions-']
dependency_missing = [name for name in dependency_identifiers if '"' + name not in current]
section_tokens = ['shown', 'depends-on', 'blocks', 'lightest-next', 'starts-at', 'ends-at', 'ancestors', 'descendants']
row_state = (root / 'apps/macos/Sources/DependencyGraphState.swift').read_text()
row_view = (root / 'apps/macos/Sources/DependencyGraphView.swift').read_text()
row_identity_wired = all(expression in row_view for expression in ['.accessibilityIdentifier(row.taskIdentifier)', '.accessibilityIdentifier(row.menuIdentifier)', '.expandIdentifier)']) and all(token in row_state for token in section_tokens)
failed = bool(missing or dependency_missing or not row_identity_wired)
receipt = {'base': base, 'existingIdentifierExpressions': len(expected), 'missing': missing, 'dependencyMissing': dependency_missing, 'dependencyIdentifierPrefixes': dependency_identifiers, 'dependencySectionTokens': section_tokens, 'rowIdentityWired': row_identity_wired, 'status': 'FAIL' if failed else 'PASS'}
Path(sys.argv[1]).write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
raise SystemExit(1 if failed else 0)
