#!/usr/bin/env python3
import json
import re
from pathlib import Path
import sys

contract = json.loads(Path(sys.argv[2]).read_text())


def schema_at(pointer):
    value = contract
    for segment in pointer.removeprefix('#/').split('/'):
        while '$ref' in value:
            value = schema_at(value['$ref'])
        if value.get('type') == 'array':
            value = value['items']
        if segment in value.get('properties', {}):
            value = value['properties'][segment]
        elif segment.endswith('Payload') and segment.removesuffix('Payload') in value.get('properties', {}):
            value = value['properties'][segment.removesuffix('Payload')]['items']
        elif re.fullmatch(r'case[1-9][0-9]*', segment):
            value = value['oneOf'][int(segment[4:]) - 1]
        elif re.fullmatch(r'value[1-9][0-9]*', segment):
            value = value['anyOf'][int(segment[5:]) - 1]
        else:
            value = value[segment.replace('~1', '/').replace('~0', '~')]
    return value


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
        version_property = next((prop for prop in re.finditer(r'public var entity_version: ([^\n]+)', bodycode) if depths[prop.start()] == 1), None)
        if version_property:
            origin = re.findall(r'Generated from `([^`]+)`', body[:version_property.start()])[-1]
            if origin.startswith('#/components/schemas/'):
                schema = schema_at(origin)
                choices = schema.get('enum', [schema.get('const')])
                if len(choices) != 1 or isinstance(choices[0], bool) or not isinstance(choices[0], (int, float)):
                    raise ValueError(f'Expected a numeric version constant at {origin}')
                expected = choices[0]
                injection += '\n' + decoder_indent + f'guard try container.decode({version_property.group(1).strip()}.self, forKey: .entity_version) == {expected} else {{ throw Swift.DecodingError.dataCorruptedError(forKey: .entity_version, in: container, debugDescription: "Expected entity_version {expected}") }}'
                parent = schema_at(origin.rsplit('/', 1)[0])
                forbidden = parent.get('x-todo-forbidden-properties', [])
                if forbidden:
                    known = json.dumps(sorted(parent['properties']))
                    injection += '\n' + decoder_indent + f'let extraKeys = try decoder.decodeAdditionalProperties(knownKeys: {known}).value.keys'
                    for key in forbidden:
                        injection += '\n' + decoder_indent + f'guard !extraKeys.contains({json.dumps(key)}) else {{ throw Swift.DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Forbidden property {key}")) }}'
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
