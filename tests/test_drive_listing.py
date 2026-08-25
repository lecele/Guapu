import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.drive_service import list_pdf_files


class _Request:
    def __init__(self, payload=None, error=None):
        self.payload = payload
        self.error = error

    def execute(self):
        if self.error:
            raise self.error
        return self.payload


class _FilesApi:
    def list(self, *, q, pageToken=None, **kwargs):
        if "'root' in parents" in q and pageToken is None:
            return _Request(
                {
                    "nextPageToken": "root-page-2",
                    "files": [
                        {"id": "folder", "name": "Sub", "mimeType": "application/vnd.google-apps.folder"},
                        {"id": "pdf-1", "name": "A.pdf", "mimeType": "application/pdf"},
                    ],
                }
            )
        if "'root' in parents" in q and pageToken == "root-page-2":
            return _Request(
                {
                    "files": [
                        {
                            "id": "docx-1",
                            "name": "B.docx",
                            "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        }
                    ]
                }
            )
        if "'folder' in parents" in q:
            return _Request(
                {
                    "files": [
                        {
                            "id": "gdoc-1",
                            "name": "C",
                            "mimeType": "application/vnd.google-apps.document",
                        }
                    ]
                }
            )
        raise AssertionError(f"Consulta inesperada: {q} / {pageToken}")


class _Drive:
    def files(self):
        return _FilesApi()


class DriveListingTests(unittest.TestCase):
    @patch("services.drive_service.get_drive_service", return_value=_Drive())
    def test_lists_all_pages_and_nested_folders(self, _service):
        files = list_pdf_files("root")
        self.assertEqual({item["id"] for item in files}, {"pdf-1", "docx-1", "gdoc-1"})
        self.assertEqual(
            next(item["drive_path"] for item in files if item["id"] == "gdoc-1"),
            "ROOT/Sub/C",
        )

    @patch("services.drive_service.get_drive_service")
    def test_listing_errors_abort_reconciliation_input(self, service):
        broken = _Drive()
        broken.files = lambda: type(
            "BrokenFiles",
            (),
            {"list": lambda *args, **kwargs: _Request(error=PermissionError("sem acesso"))},
        )()
        service.return_value = broken

        with self.assertRaises(PermissionError):
            list_pdf_files("root")


if __name__ == "__main__":
    unittest.main()
