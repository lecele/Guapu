import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rag.sync_plan import chunk_record_id, plan_drive_sync, select_file_batch


class DriveSyncPlanTests(unittest.TestCase):
    def test_chunk_id_is_stable_and_preserves_file_provenance(self):
        self.assertEqual(
            chunk_record_id("file-a", "hash", 1, 0),
            chunk_record_id("file-a", "hash", 1, 0),
        )
        self.assertNotEqual(
            chunk_record_id("file-a", "hash", 1, 0),
            chunk_record_id("file-b", "hash", 1, 0),
        )
        self.assertNotEqual(
            chunk_record_id("file-a", "hash", 1, 0),
            chunk_record_id("file-a", "hash", 2, 5),
        )

    def test_classifies_new_changed_unchanged_and_removed(self):
        current = [
            {"id": "new", "name": "novo.pdf", "modifiedTime": "2026-08-25T10:00:00Z"},
            {
                "id": "same",
                "name": "igual.pdf",
                "modifiedTime": "2026-08-25T10:00:00Z",
                "md5Checksum": "abc",
            },
            {
                "id": "changed",
                "name": "alterado.pdf",
                "modifiedTime": "2026-08-25T11:00:00Z",
                "md5Checksum": "new-hash",
            },
        ]
        manifest = [
            {
                "drive_file_id": "same",
                "name": "igual.pdf",
                "modified_time": "2026-08-25T10:00:00+00:00",
                "md5_checksum": "abc",
                "status": "active",
            },
            {
                "drive_file_id": "changed",
                "name": "alterado.pdf",
                "modified_time": "2026-08-25T10:00:00+00:00",
                "md5_checksum": "old-hash",
                "status": "active",
            },
            {
                "drive_file_id": "removed",
                "name": "removido.pdf",
                "modified_time": "2026-08-24T10:00:00+00:00",
                "status": "active",
            },
        ]

        plan = plan_drive_sync(current, manifest)

        self.assertEqual([item["id"] for item in plan.new], ["new"])
        self.assertEqual([item["id"] for item in plan.changed], ["changed"])
        self.assertEqual([item["id"] for item in plan.unchanged], ["same"])
        self.assertEqual([item["drive_file_id"] for item in plan.removed], ["removed"])

    def test_retries_manifest_entries_in_error(self):
        current = [{"id": "retry", "name": "retry.pdf", "modifiedTime": "2026-08-25T10:00:00Z"}]
        manifest = [
            {
                "drive_file_id": "retry",
                "name": "retry.pdf",
                "modified_time": "2026-08-25T10:00:00+00:00",
                "status": "error",
            }
        ]

        plan = plan_drive_sync(current, manifest)

        self.assertEqual([item["id"] for item in plan.changed], ["retry"])

    def test_rename_is_a_change_even_when_checksum_matches(self):
        current = [
            {
                "id": "renamed",
                "name": "nome-novo.pdf",
                "drive_path": "ROOT/nome-novo.pdf",
                "modifiedTime": "2026-08-25T10:00:00Z",
                "md5Checksum": "same",
            }
        ]
        manifest = [
            {
                "drive_file_id": "renamed",
                "name": "nome-antigo.pdf",
                "drive_path": "ROOT/nome-antigo.pdf",
                "modified_time": "2026-08-25T10:00:00+00:00",
                "md5_checksum": "same",
                "status": "active",
            }
        ]

        plan = plan_drive_sync(current, manifest)

        self.assertEqual([item["id"] for item in plan.changed], ["renamed"])

    def test_batch_prioritizes_changed_and_defers_the_rest(self):
        current = [
            {"id": "new-a", "name": "novo-a.pdf", "modifiedTime": "2026-08-25T10:00:00Z"},
            {"id": "new-b", "name": "novo-b.pdf", "modifiedTime": "2026-08-25T10:00:00Z"},
            {"id": "changed", "name": "alterado.pdf", "modifiedTime": "2026-08-25T11:00:00Z"},
        ]
        manifest = [
            {
                "drive_file_id": "changed",
                "name": "alterado.pdf",
                "modified_time": "2026-08-25T10:00:00+00:00",
                "status": "active",
            }
        ]
        plan = plan_drive_sync(current, manifest)

        selected, deferred = select_file_batch(plan, 2)

        self.assertEqual([(action, item["id"]) for action, item in selected], [("changed", "changed"), ("new", "new-a")])
        self.assertEqual([(action, item["id"]) for action, item in deferred], [("new", "new-b")])


if __name__ == "__main__":
    unittest.main()
