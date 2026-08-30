/**
 * Client for the roster OCR service (ocr-service/ — a Python sibling service
 * on Railway, reached via ROSTER_OCR_URL). One POST carries every screenshot
 * of a /roster submission; the service answers per-image.
 */

export interface OcrDoll {
  name: string;
  /** 0-6, or null when the badge glyph was unreadable */
  vertebrae: number | null;
  level: number | null;
  power: number | null;
}

export interface OcrImageResult {
  dolls: OcrDoll[];
  error?: string;
}

export function ocrConfigured(): boolean {
  return !!process.env.ROSTER_OCR_URL;
}

export async function extractRosterImages(
  images: { name: string; data: ArrayBuffer; contentType: string }[]
): Promise<OcrImageResult[]> {
  const base = process.env.ROSTER_OCR_URL?.replace(/\/$/, '');
  if (!base) {
    throw new Error('ROSTER_OCR_URL is not set');
  }

  const form = new FormData();
  for (const image of images) {
    form.append(
      'files',
      new Blob([image.data], { type: image.contentType }),
      image.name
    );
  }

  const headers: Record<string, string> = {};
  if (process.env.ROSTER_OCR_KEY) {
    headers['x-api-key'] = process.env.ROSTER_OCR_KEY;
  }

  const res = await fetch(`${base}/extract`, {
    method: 'POST',
    headers,
    body: form,
  });
  if (!res.ok) {
    throw new Error(`OCR service ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as { images: OcrImageResult[] };
  return body.images;
}
