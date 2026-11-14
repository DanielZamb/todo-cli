#!/usr/bin/env python3
"""Prove a pure move of Swift declarations by text identity (standing orders: refactors).

Usage: declaration-identity.py <parent commit> <source path> <destination path> [head commit]

Reads <source path> at the parent, and <source path> and <destination path> at the head (the
working tree when no head commit is given). Declarations are the top-level ones and, inside a type
or extension, its members, each with the doc comments and attributes above it; a declaration's key
is its first code line. For every declaration the parent's source had and the head's source no
longer has (the moved ones), it prints whether the destination holds the same text, byte for byte.
It also lists every declaration of the source whose text changed in place, so a reader sees exactly
what is not a move. Exit 0 only when every moved declaration is identical; changed-in-place
declarations are reported, not judged.
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip())
START = re.compile(r'^\s*(@[\w()".: ]+\s+)*((public|private|fileprivate|internal|static|final|mutating|nonisolated|override|convenience|required|lazy|weak|isolated)\s+)*'
                   r'(func|var|let|struct|class|actor|enum|extension|init|deinit|case|typealias|protocol)\b')


ACCESS = re.compile(r'\b(public|private|fileprivate|internal) ')


def read(commit, path):
    if commit is None:
        return (ROOT / path).read_text()
    return subprocess.check_output(['git', 'show', f'{commit}:{path}'], cwd=ROOT, text=True)


def code(line):
    """The line without a trailing // comment or string contents, for brace counting."""
    line = re.sub(r'"(\\.|[^"\\])*"', '""', line)
    return line.split('//', 1)[0]


def declarations(text, depth_wanted=(0, 1)):
    lines = text.split('\n')
    out, depth, pending, i = [], 0, [], 0
    containers = []  # depth-0 declarations that hold members
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if depth in depth_wanted and (stripped.startswith('///') or (stripped.startswith('@') and not START.match(line))):
            pending.append(i); i += 1; continue
        if depth in depth_wanted and START.match(line):
            start = pending[0] if pending else i
            pending = []
            level, j, opened = depth, i, False
            while j < len(lines):
                c = code(lines[j])
                level += c.count('{') - c.count('}')
                opened = opened or '{' in c
                if (opened and level == depth) or (not opened and j == i and '{' not in c):
                    break
                j += 1
            key = (depth, re.sub(r'\s+', ' ', ACCESS.sub('', line.strip())))
            body = '\n'.join(lines[start:j + 1])
            if depth == 0 and re.match(r'^\s*(.*\s)?(extension|struct|class|actor|enum)\b', line) and opened:
                containers.append(key)
                out.append((key + ('container',), body, start + 1))
                # members: re-scan inside at depth 1
                depth = 1; i += 1
                continue
            out.append((key, body, start + 1))
            i = j + 1
            continue
        pending = [] if stripped and not stripped.startswith('///') else pending
        c = code(line)
        depth += c.count('{') - c.count('}')
        i += 1
    return out


def index(decls):
    found = {}
    for key, body, line in decls:
        found.setdefault(key, []).append((body, line))
    return found


def main():
    parent, source, destination = sys.argv[1], sys.argv[2], sys.argv[3]
    head = sys.argv[4] if len(sys.argv) > 4 else None
    before = index(declarations(read(parent, source)))
    after_source = index(declarations(read(head, source)))
    after_destination = index(declarations(read(head, destination)))
    moved = [key for key in before if key not in after_source]
    failures = 0
    print(f'# Declaration identity: {source} at {parent[:8]} -> {destination} at {head[:8] if head else "the working tree"}')
    print(f'moved declarations: {len(moved)}')
    for key in moved:
        for body, line in before[key]:
            target = [l for b, l in after_destination.get(key, []) if b == body]
            status = f'IDENTICAL ({destination}:{target[0]})' if target else ('DIFFERENT' if key in after_destination else 'MISSING')
            if not target: failures += 1
            print(f'  {status:40} {source}:{line}  {key[1][:110]}')
    # Members are compared one by one; a container (type or extension) is not compared as a whole.
    changed = [key for key in before if key in after_source and len(key) == 2 and [b for b, _ in before[key]] != [b for b, _ in after_source[key]]]
    print(f'declarations of {source} changed in place: {len(changed)}')
    for key in changed:
        old, new = [b for b, _ in before[key]], [b for b, _ in after_source[key]]
        access_only = [ACCESS.sub('', b) for b in old] == [ACCESS.sub('', b) for b in new]
        print(f'  {"ACCESS ONLY" if access_only else "CHANGED":11} {key[1][:110]}')
    added = [key for key in after_source if key not in before]
    print(f'declarations added to {source}: {len(added)}')
    for key in added: print(f'  ADDED    {key[1][:110]}')
    print('RESULT: ' + ('PASS, every moved declaration is identical' if failures == 0 else f'FAIL, {failures} moved declarations differ or are missing'))
    sys.exit(0 if failures == 0 else 1)


if __name__ == '__main__':
    main()
