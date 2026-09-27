# Tessera OCR (D-022, option B): OCRmyPDF + Tesseract behind a tiny HTTP server.
# The Worker sends a PDF and gets back a searchable PDF (a text layer added under
# each scanned page). Runs as a Cloudflare Container; no internet access needed.
FROM debian:bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ocrmypdf tesseract-ocr tesseract-ocr-eng tesseract-ocr-spa tesseract-ocr-fra \
      python3 ghostscript pngquant unpaper \
 && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home ocr
WORKDIR /home/ocr
COPY server.py .
USER ocr

ENV PORT=8080
EXPOSE 8080
CMD ["python3", "server.py"]
