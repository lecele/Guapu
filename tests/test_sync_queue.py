import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rag.sync_plan import plan_drive_sync
from rag.sync_queue import jobs_from_sync_plan


class DriveSyncQueueTests(unittest.TestCase):
    def test_creates_jobs_for_changed_new_and_removed_files(self):
        current = [
            {"id": "new", "name": "novo.pdf", "modifiedTime": "2026-08-25T10:00:00Z"},
            {"id": "changed", "name": "alterado.pdf", "modifiedTime": "2026-08-25T11:00:00Z"},
        ]
        manifest = [
            {
                "drive_file_id": "changed",
                "name": "alterado.pdf",
                "modified_time": "2026-08-25T10:00:00Z",
                "status": "active",
            },
            {
                "drive_file_id": "removed",
                "name": "removido.pdf",
                "modified_time": "2026-08-25T10:00:00Z",
                "status": "active",
            },
        ]

        jobs = jobs_from_sync_plan(plan_drive_sync(current, manifest), current)

        self.assertEqual(
            [(job.action, job.drive_file_id) for job in jobs],
            [("changed", "changed"), ("new", "new"), ("removed", "removed")],
        )
        self.assertTrue(jobs[0].file_info["cleanup_legacy_source"])


if __name__ == "__main__":
    unittest.main()
