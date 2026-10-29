#!/usr/bin/env python3
import copy
import hashlib
import json
from pathlib import Path
import re
import sys


def normalize(value):
    if isinstance(value, list):
        return [normalize(child) for child in value]
    if not isinstance(value, dict):
        return value
    result = dict(value)
    branches = value.get('anyOf')
    if isinstance(branches, list) and {'type': 'null'} in branches:
        remaining = [branch for branch in branches if branch != {'type': 'null'}]
        del result['anyOf']
        if len(remaining) == 1:
            result.update(remaining[0])
        else:
            result['anyOf'] = remaining
        result['nullable'] = True
    if result.get('type') == 'null':
        result = {'type': 'string', 'nullable': True, 'enum': [None]}
    for bound in ('Minimum', 'Maximum'):
        key = 'exclusive' + bound
        if key in result and isinstance(result[key], (int, float)) and not isinstance(result[key], bool):
            result[bound.lower()] = result[key]
            result[key] = True
    return {key: normalize(child) for key, child in result.items()}


def normalize_tagged_unions(document):
    result = copy.deepcopy(document)
    schemas = result.get('components', {}).get('schemas', {})

    def resolve(member):
        if not isinstance(member, dict):
            return None
        reference = member.get('$ref')
        if reference is not None and len(member) != 1:
            return None
        if reference is None:
            return member
        prefix = '#/components/schemas/'
        if not isinstance(reference, str) or not reference.startswith(prefix):
            return None
        name = reference[len(prefix):].replace('~1', '/').replace('~0', '~')
        return schemas.get(name)

    def constant(member, key):
        schema = resolve(member)
        if not isinstance(schema, dict) or schema.get('type') != 'object' or schema.get('nullable') or key not in schema.get('required', []):
            return None
        value = schema.get('properties', {}).get(key)
        if not isinstance(value, dict) or value.get('nullable'):
            return None
        if isinstance(value.get('const'), str):
            return value['const']
        values = value.get('enum')
        if isinstance(values, list) and len(values) == 1 and isinstance(values[0], str):
            return values[0]
        return None

    def leaves(member, seen=frozenset()):
        schema = resolve(member)
        reference = member.get('$ref') if isinstance(member, dict) else None
        if reference in seen:
            return [member]
        if not isinstance(schema, dict) or schema.get('nullable'):
            return [member]
        composition = schema.get('anyOf', schema.get('oneOf'))
        if not isinstance(composition, list) or ('anyOf' in schema and 'oneOf' in schema) or not set(schema).issubset({'anyOf', 'oneOf', 'discriminator'}):
            return [member]
        nested = seen | {reference} if reference else seen
        return [leaf for branch in composition for leaf in leaves(branch, nested)]

    def visit(value):
        if isinstance(value, list):
            return [visit(child) for child in value]
        if not isinstance(value, dict):
            return value
        node = {key: visit(child) for key, child in value.items()}
        members = node.get('anyOf')
        if not isinstance(members, list) or len(members) < 2 or node.get('nullable') or 'oneOf' in node or 'discriminator' in node:
            return node
        flattened = [visit(leaf) for member in members for leaf in leaves(member)]
        for key in ('kind', 'outcome'):
            values = [constant(member, key) for member in flattened]
            if any(value is None for value in values) or len(set(values)) != len(values):
                continue
            references = []
            mapping = {}
            for tag, member in zip(values, flattened):
                if '$ref' in member and len(member) == 1:
                    reference = member['$ref']
                else:
                    encoded = json.dumps(member, sort_keys=True, separators=(',', ':')).encode()
                    digest = hashlib.sha256(encoded).hexdigest()[:16]
                    name = 'SwiftTagged_' + re.sub(r'[^A-Za-z0-9_]', '_', tag) + '_' + digest
                    existing = schemas.get(name)
                    if existing is not None and existing != member:
                        raise ValueError('Generated discriminator schema name collision')
                    schemas[name] = copy.deepcopy(member)
                    reference = '#/components/schemas/' + name
                references.append({'$ref': reference})
                mapping[tag] = reference
            del node['anyOf']
            node['oneOf'] = references
            node['discriminator'] = {'propertyName': key, 'mapping': mapping}
            return node
        return node

    for name in list(schemas):
        schemas[name] = visit(schemas[name])
    for key in list(result):
        if key != 'components':
            result[key] = visit(result[key])
    for key in list(result.get('components', {})):
        if key != 'schemas':
            result['components'][key] = visit(result['components'][key])
    if schemas:
        result.setdefault('components', {})['schemas'] = schemas
    return result


def normalize_contract(contract):
    result = normalize(contract)
    result['openapi'] = '3.0.3'
    operation = contract['paths']['/profiles/{profile}/events']['get']['responses']['200']['content']['text/event-stream']['schema']['anyOf'][0]['properties']['data']['contentSchema']
    result['components']['schemas']['CommittedOperation'] = normalize(operation)
    return normalize_tagged_unions(result)


if __name__ == '__main__':
    source, destination = map(Path, sys.argv[1:])
    contract = json.loads(source.read_text())
    destination.write_text(json.dumps(normalize_contract(contract), indent=2) + '\n')
