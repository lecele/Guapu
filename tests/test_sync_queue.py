import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rag.sync_plan import plan_drive_sync
from rag.sync_queue import jobs_from_sync_plan, mark_job_complete, renew_job_lease


class _RpcResponse:
    def __init__(self, data=True, error=None):
        self.data = data
        self.error = error

    def execute(self):
        return self


class _RpcClient:
    def __init__(self):
        self.calls = []

    def rpc(self, name, payload):
        self.calls.append((name, payload))
        return _RpcResponse(data=True)


class _UpdateQuery:
    def __init__(self):
        self.payload = None
        self.filters = []

    def update(self, payload):
        self.payload = payload
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def execute(self):
        return _RpcResponse(data=True)


class _TableClient:
    def __init__(self):
        self.query = _UpdateQuery()

    def table(self, _name):
        return self.query


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

    def test_renews_the_job_lease_for_the_current_worker(self):
        client = _RpcClient()

        renewed = renew_job_lease(client, "job-id", "worker-id", 3600)

        self.assertTrue(renewed)
        self.assertEqual(client.calls[0][0], "renew_drive_sync_job_lease")
        self.assertEqual(client.calls[0][1]["p_job_id"], "job-id")
        self.assertEqual(client.calls[0][1]["p_worker_id"], "worker-id")
        self.assertEqual(client.calls[0][1]["p_lease_seconds"], 3600)

    def test_completion_clears_previous_error_and_worker(self):
        client = _TableClient()

        mark_job_complete(client, "job-id")

        self.assertEqual(client.query.payload["status"], "succeeded")
        self.assertIsNone(client.query.payload["last_error"])
        self.assertIsNone(client.query.payload["worker_id"])
        self.assertEqual(client.query.filters, [("id", "job-id")])


if __name__ == "__main__":
    unittest.main()
