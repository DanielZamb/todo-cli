#!/usr/bin/env python3
import copy
import importlib.util
import json
from pathlib import Path
import unittest

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('normalize_openapi', Path(__file__).with_name('normalize-openapi.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class TaggedUnionTests(unittest.TestCase):
    def test_pure_deterministic_disjoint_transform(self):
        source = json.loads((root / 'API/Fixtures/disjoint-unions.json').read_text())
        original = copy.deepcopy(source)
        expected = json.loads((root / 'API/Fixtures/disjoint-unions.normalized.json').read_text())
        first = module.normalize_tagged_unions(source)
        self.assertEqual(source, original)
        self.assertEqual(first, expected)
        self.assertEqual(module.normalize_tagged_unions(source), first)
        self.assertEqual(module.normalize_tagged_unions(first), first)
        schemas = first['components']['schemas']
        self.assertEqual(schemas['Events']['discriminator']['propertyName'], 'kind')
        self.assertEqual(sorted(schemas['Events']['discriminator']['mapping']), ['Created', 'Deleted'])
        self.assertEqual(schemas['Outcomes']['discriminator']['propertyName'], 'outcome')
        for name in ['Overlapping', 'OptionalKind', 'Untagged', 'ConstrainedBranch']:
            self.assertEqual(schemas[name], source['components']['schemas'][name])


    def test_unrelated_document_stays_identical(self):
        source = {'openapi': '3.0.3', 'paths': {}}
        self.assertEqual(module.normalize_tagged_unions(source), source)

    def test_nullable_reference_is_not_provably_disjoint(self):
        source = {'components': {'schemas': {
            'First': {'type': 'object', 'properties': {'kind': {'const': 'First'}}, 'required': ['kind']},
            'Second': {'type': 'object', 'properties': {'kind': {'const': 'Second'}}, 'required': ['kind']},
            'Maybe': {'anyOf': [{'$ref': '#/components/schemas/First', 'nullable': True}, {'$ref': '#/components/schemas/Second'}]}
        }}}
        self.assertEqual(module.normalize_tagged_unions(source), source)

    def test_tags_require_objects_and_nonnullable_values(self):
        first = {'type': 'object', 'properties': {'kind': {'const': 'First'}}, 'required': ['kind']}
        second = {'type': 'object', 'properties': {'kind': {'const': 'Second'}}, 'required': ['kind']}
        cases = []
        missing_type = copy.deepcopy(first)
        del missing_type['type']
        cases.append({'anyOf': [missing_type, second]})
        nullable_kind = copy.deepcopy(first)
        nullable_kind['properties']['kind']['nullable'] = True
        cases.append({'anyOf': [nullable_kind, second]})
        cases.append({'anyOf': [first, second], 'oneOf': [{'type': 'object'}]})
        cases.append({'anyOf': [first, second], 'discriminator': {'propertyName': 'other'}})
        for source in cases:
            self.assertEqual(module.normalize_tagged_unions(source), source)

    def test_sibling_compositions_keep_their_intersection(self):
        def variant(kind):
            return {'type': 'object', 'properties': {'kind': {'const': kind}}, 'required': ['kind']}
        first, second, third = map(variant, ['First', 'Second', 'Third'])
        source = {'components': {'schemas': {'Combined': {'anyOf': [
            {'anyOf': [first, second], 'oneOf': [first]}, third
        ]}}}}
        self.assertEqual(module.normalize_tagged_unions(source), source)

    def test_forward_reference_normalizes_promoted_leaves_once(self):
        def variant(kind):
            return {'type': 'object', 'properties': {'kind': {'const': kind}}, 'required': ['kind']}
        first, second, third = map(variant, ['First', 'Second', 'Third'])
        first['properties']['child'] = {'anyOf': [variant('ChildA'), variant('ChildB')]}
        source = {'components': {'schemas': {
            'Parent': {'anyOf': [{'$ref': '#/components/schemas/Group'}, third]},
            'Group': {'anyOf': [first, second]}
        }}}
        normalized = module.normalize_tagged_unions(source)
        self.assertEqual(module.normalize_tagged_unions(normalized), normalized)


if __name__ == '__main__':
    unittest.main()
