import json
from pathlib import Path
import tempfile
import unittest
from owner_activity import owner_activity


class OwnerActivityTests(unittest.TestCase):
    def test_recent_input_waits_and_sixty_seconds_admits(self):
        with tempfile.TemporaryDirectory() as root:
            directory = Path(root)
            (directory / 'current.ndjson').write_text(json.dumps(dict(name='ui.input.observed', epochMS=980000)) + '\n')
            self.assertEqual(owner_activity(directory, 1000, True)['admit'], False)
            self.assertEqual(owner_activity(directory, 1040, True)['admit'], True)

    def test_missing_or_incomplete_active_journal_waits(self):
        with tempfile.TemporaryDirectory() as root:
            directory = Path(root)
            self.assertEqual(owner_activity(directory, 1000, True)['admit'], False)
            self.assertEqual(owner_activity(directory, 1000, False)['admit'], True)
            (directory / 'current.ndjson').write_text('{"name":')
            self.assertEqual(owner_activity(directory, 1000, True)['admit'], False)

    def test_rotation_and_background_records_do_not_hide_input(self):
        with tempfile.TemporaryDirectory() as root:
            directory = Path(root)
            (directory / 'previous.ndjson').write_text(json.dumps(dict(name='ui.input.observed', epochMS=990000)) + '\n')
            (directory / 'current.ndjson').write_text(json.dumps(dict(name='request.polls.aggregated', epochMS=1000000)) + '\n')
            value = owner_activity(directory, 1000, True)
            self.assertEqual(value['input_age_seconds'], 10)
            self.assertEqual(value['admit'], False)

    def test_future_input_waits_after_a_clock_change(self):
        with tempfile.TemporaryDirectory() as root:
            directory = Path(root)
            (directory / 'current.ndjson').write_text(json.dumps(dict(name='ui.input.observed', epochMS=1010000)) + '\n')
            self.assertEqual(owner_activity(directory, 1000, True)['admit'], False)


if __name__ == '__main__':
    unittest.main()
