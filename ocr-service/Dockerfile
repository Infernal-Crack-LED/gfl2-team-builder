# Roster OCR service. Deployed on Railway as its own service with this
# directory as the root.
FROM python:3.12-slim

# opencv (pulled in by rapidocr) needs these shared libs even headless
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the OCR models into the image so cold starts never hit the network.
RUN python -c "from rapidocr import RapidOCR; RapidOCR()"

COPY roster_ocr.py main.py ./

# Railway injects PORT; default for local runs.
ENV PORT=8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
