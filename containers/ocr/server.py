"""Tessera OCR server: POST /ocr with a PDF body, get a searchable PDF back.

Query: ?lang=eng (Tesseract codes, "+"-joined; eng, spa, fra are installed).
Response headers: x-ocr-pages (page count), x-ocr-seconds.
Pages that already have text are left alone (--skip-text), so mixed documents work.
GET /health answers 200 for the container's readiness check.
"""
import json
import os
import re
import subprocess
import tempfile
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BYTES = 30 * 1024 * 1024
LANGS = {"eng", "spa", "fra"}
TIMEOUT_SECONDS = 600


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # one line per request, no request bodies
        print("%s %s" % (self.command, self.path.split("?")[0]), flush=True)

    def reply(self, status, body, content_type="application/json", headers=None):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", content_type)
        self.send_header("content-length", str(len(data)))
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/health"):
            self.reply(200, {"ok": True})
        else:
            self.reply(404, {"error": "not found"})

    def do_POST(self):
        if not self.path.startswith("/ocr"):
            return self.reply(404, {"error": "not found"})
        length = int(self.headers.get("content-length") or 0)
        if length <= 0 or length > MAX_BYTES:
            return self.reply(413 if length > MAX_BYTES else 400, {"error": "Send a PDF up to 30 MB."})
        query = self.path.partition("?")[2]
        match = re.search(r"(?:^|&)lang=([a-z+]+)", query)
        langs = [l for l in (match.group(1) if match else "eng").split("+") if l in LANGS] or ["eng"]
        body = self.rfile.read(length)
        if not body.startswith(b"%PDF"):
            return self.reply(400, {"error": "That isn't a PDF."})
        started = time.time()
        with tempfile.TemporaryDirectory() as work:
            source, target = os.path.join(work, "in.pdf"), os.path.join(work, "out.pdf")
            with open(source, "wb") as f:
                f.write(body)
            command = [
                "ocrmypdf", "--skip-text", "--output-type", "pdf", "--optimize", "0",
                "--jobs", "1", "--tesseract-timeout", "180", "-l", "+".join(langs), source, target,
            ]
            try:
                result = subprocess.run(command, capture_output=True, text=True, timeout=TIMEOUT_SECONDS)
            except subprocess.TimeoutExpired:
                return self.reply(504, {"error": "OCR took too long."})
            # Exit 6 = the PDF already had text on every page; the copy is still valid.
            if result.returncode not in (0, 6) or not os.path.exists(target):
                return self.reply(422, {"error": "OCR failed.", "detail": result.stderr[-600:]})
            with open(target, "rb") as f:
                out = f.read()
        pages = len(re.findall(rb"/Type\s*/Page[^s]", out))
        self.reply(200, out, "application/pdf", {"x-ocr-pages": str(pages), "x-ocr-seconds": "%.1f" % (time.time() - started)})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    print("tessera-ocr listening on %d" % port, flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
