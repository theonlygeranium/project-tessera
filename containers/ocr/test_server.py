import io
import tempfile
import unittest
from pathlib import Path

from server import Handler, MAX_IMAGES, MAX_PNG_BYTES, image_manifest, tsv_confidence


class OcrServerTests(unittest.TestCase):
    def test_bad_inputs_return_400_without_running_tools(self):
        for path, data in (("/images", b"bad"), ("/confidence", b"bad"), ("/page?page=1", b"bad"), ("/ocr", b"bad")):
            handler = object.__new__(Handler)
            handler.path = path
            handler.headers = {"content-length": str(len(data))}
            handler.rfile = io.BytesIO(data)
            handler.wfile = io.BytesIO()
            statuses = []
            handler.send_response = statuses.append
            handler.send_header = lambda *args: None
            handler.end_headers = lambda: None
            handler.do_POST()
            self.assertEqual(statuses, [400])

    def test_image_manifest_skips_small_images_and_caps_count(self):
        with tempfile.TemporaryDirectory() as work:
            paths = []
            lines = ["page num type width height"]
            for number in range(MAX_IMAGES + 2):
                width = 20 if number == 0 else 64
                path = Path(work, f"img-001-{number:03}.png")
                path.write_bytes(b"png")
                paths.append(path)
                lines.append(f"1 {number} image {width} 64 rgb 3 8 image no 1 0 72 72 3B 0%")
            result = image_manifest("\n".join(lines), paths)
            self.assertTrue(result["truncated"])
            self.assertEqual(len(result["images"]), MAX_IMAGES)
            self.assertEqual(result["images"][0]["index"], 1)

    def test_image_manifest_caps_png_bytes(self):
        with tempfile.TemporaryDirectory() as work:
            paths = []
            for number in range(2):
                path = Path(work, f"img-001-{number:03}.png")
                path.write_bytes(b"x" * (MAX_PNG_BYTES // 2 + 1))
                paths.append(path)
            result = image_manifest("1 0 image 64 64\n1 1 image 64 64", paths)
            self.assertEqual(len(result["images"]), 1)
            self.assertTrue(result["truncated"])

    def test_image_indexes_follow_pages_and_ignore_masks(self):
        with tempfile.TemporaryDirectory() as work:
            paths = []
            for page in (1, 2):
                path = Path(work, f"img-{page:03}-000.png")
                path.write_bytes(b"png")
                paths.append(path)
            result = image_manifest("1 0 image 64 64\n1 1 smask 64 64\n2 0 image 64 64", paths)
            self.assertEqual([(image["index"], image["page"]) for image in result["images"]], [(0, 1), (1, 2)])

    def test_tsv_ignores_non_words(self):
        tsv = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n"
        self.assertEqual(tsv_confidence(tsv + "5\t1\t1\t1\t1\t1\t0\t0\t1\t1\t80\tHello\n"), 80)


if __name__ == "__main__":
    unittest.main()
