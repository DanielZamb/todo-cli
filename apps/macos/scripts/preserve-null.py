#!/usr/bin/env python3
import re
from pathlib import Path
import sys


def mask(source):
    pattern = r'//[^\n]*|/\*.*?\*/|"(?:\\.|[^"\\])*"'
    return re.sub(pattern, lambda match: ' ' * len(match.group()), source, flags=re.S)


def closing(code, start):
    depth = 0
    for index in range(start, len(code)):
        if code[index] == '{':
            depth += 1
        elif code[index] == '}':
            depth -= 1
            if depth == 0:
                return index
    raise ValueError('Unbalanced generated source')


for path in Path(sys.argv[1]).glob('Types*.swift'):
    source = path.read_text()
    code = mask(source)
    edits = []
    for match in re.finditer(r'public struct \w+: Codable[^\{]*\{', code):
        start = match.end() - 1
        end = closing(code, start)
        body = source[start:end]
        bodycode = code[start:end]
        depth = 0
        depths = []
        for char in bodycode:
            depths.append(depth)
            depth += (char == '{') - (char == '}')
        properties = []
        for prop in re.finditer(r'public var (`?\w+`?): ([^\n]+)', bodycode):
            if depths[prop.start()] == 1:
                properties.append((prop.group(1), prop.group(2).strip().endswith('?')))
        if any(item.group(0).find('_explicitNullKeys') >= 0 and depths[item.start()] == 1 for item in re.finditer(r'private var _explicitNullKeys', bodycode)):
            continue
        if not properties:
            continue
        containers = [item for item in re.finditer(r'let container = try decoder.container\(keyedBy: CodingKeys.self\)', bodycode) if depths[item.start()] == 2]
        if not containers:
            continue
        if len(containers) != 1:
            raise ValueError(f'Ambiguous generated decoder in {path}')
        custom = next((item for item in re.finditer(r'public func encode\(', bodycode) if depths[item.start()] == 1), None)
        indent = re.search(r'\n( *)public var ', body).group(1)
        decoder_indent = indent + '    '
        injection = '\n' + decoder_indent + 'self._explicitNullKeys = Set(try container.allKeys.filter { try container.decodeNil(forKey: $0) }.map(\\.stringValue))'
        edits.append((start + containers[0].end(), start + containers[0].end(), injection))
        edits.append((start + 1, start + 1, '\n' + indent + 'private var _explicitNullKeys: Set<String> = []\n'))
        if custom:
            encode_start = bodycode.index('{', custom.end())
            encode_end = closing(bodycode, encode_start)
            encode = body[encode_start:encode_end]
            for name, optional in properties:
                if not optional:
                    continue
                pattern = r'try container\.encodeIfPresent\(\s*self\.' + re.escape(name) + r',\s*forKey:\s*\.' + re.escape(name) + r'\s*\)'
                original = re.search(pattern, encode)
                if original:
                    replacement = f'if self.{name} == nil && _explicitNullKeys.contains(CodingKeys.{name}.stringValue) {{ try container.encodeNil(forKey: .{name}) }} else {{ ' + original.group() + ' }'
                    edits.append((start + encode_start + original.start(), start + encode_start + original.end(), replacement))
            continue
        encoder = '\n' + indent + 'public func encode(to encoder: any Swift.Encoder) throws {\n'
        encoder += decoder_indent + 'var container = encoder.container(keyedBy: CodingKeys.self)\n'
        for name, optional in properties:
            if optional:
                encoder += decoder_indent + f'if self.{name} == nil && _explicitNullKeys.contains(CodingKeys.{name}.stringValue) {{\n'
                encoder += decoder_indent + f'    try container.encodeNil(forKey: .{name})\n'
                encoder += decoder_indent + '} else {\n'
                encoder += decoder_indent + f'    try container.encodeIfPresent(self.{name}, forKey: .{name})\n'
                encoder += decoder_indent + '}\n'
            else:
                encoder += decoder_indent + f'try container.encode(self.{name}, forKey: .{name})\n'
        encoder += indent + '}\n' + indent.removesuffix('    ')
        edits.append((end, end, encoder))
    for index, stop, replacement in sorted(edits, reverse=True):
        source = source[:index] + replacement + source[stop:]
    path.write_text('\n'.join(line.rstrip() for line in source.splitlines()) + '\n')
