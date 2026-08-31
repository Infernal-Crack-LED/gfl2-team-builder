"""Roster OCR API — reads GFL2 roster screenshots and returns the dolls found.

POST /extract   multipart form, one or more `files` fields (PNG/JPEG)
                -> {"images": [{"dolls": [{name, vertebrae, level, power}]}]}
GET  /healthz   -> {"ok": true}

If OCR_API_KEY is set, requests must carry it in the X-Api-Key header.
The engine loads once at startup (model download on first run), so build the
Docker image with the models baked in — see Dockerfile.
"""

import os

from fastapi import FastAPI, HTTPException, Request, UploadFile

from roster_ocr import RosterOCR

app = FastAPI()
ocr = RosterOCR()

API_KEY = os.environ.get("OCR_API_KEY", "")


def check_key(request: Request) -> None:
    if API_KEY and request.headers.get("x-api-key") != API_KEY:
        raise HTTPException(status_code=401, detail="bad api key")


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.post("/extract")
async def extract(request: Request, files: list[UploadFile]):
    check_key(request)
    images = []
    for f in files:
        data = await f.read()
        try:
            dolls = ocr.extract(data)
            images.append({"dolls": dolls})
        except Exception as e:  # noqa: BLE001 — one bad image must not fail the batch
            print(f"[extract] {f.filename}: {type(e).__name__}: {e}", flush=True)
            images.append({"dolls": [], "error": f"{type(e).__name__}: {e}"})
    return {"images": images}
