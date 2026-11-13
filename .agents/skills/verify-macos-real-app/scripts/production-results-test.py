import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest

module = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name('production-results.py')
spec = importlib.util.spec_from_file_location('production_results', module)
loaded = importlib.util.module_from_spec(spec)
spec.loader.exec_module(loaded)

class Results(unittest.TestCase):
    def test_each_framework_must_be_complete(self):
        with tempfile.TemporaryDirectory(prefix='todo-prod-results-') as directory:
            root = Path(directory)
            (root / 'cases-swift-testing.xml').write_text('<testsuite><testcase name="a"/><testcase name="b"/><testcase name="c"/></testsuite>')
            (root / 'log').write_text('Executed 1 test\nTest run with 2 tests passed\n')
            with self.assertRaisesRegex(RuntimeError, 'omitted'):
                loaded.read_results(root / 'cases.xml', root / 'log')
    def test_serial_xctest_and_swift_testing_xml(self):
        with tempfile.TemporaryDirectory(prefix='todo-prod-results-') as directory:
            root = Path(directory)
            (root / 'cases-swift-testing.xml').write_text('<testsuite><testcase classname="S" name="a"/><testcase classname="S" name="b"><failure/></testcase></testsuite>')
            (root / 'log').write_text("Test Case '-[C x]' passed (0.1 seconds).\nExecuted 1 test\nTest run with 2 tests failed\n")
            self.assertEqual(loaded.read_results(root / 'cases.xml', root / 'log')['outcomes'], [
                {'id': 'SwiftTesting/S/a', 'outcome': 'passed'}, {'id': 'SwiftTesting/S/b', 'outcome': 'failed'}, {'id': 'XCTest/C/x', 'outcome': 'passed'}])

unittest.main(argv=[sys.argv[0]])
