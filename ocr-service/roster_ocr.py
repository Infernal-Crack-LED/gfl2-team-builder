"""OCR extraction of doll name, vertebrae level, and power from GFL2 roster
screenshots.

Each roster card shows: portrait, doll name, Lv.N, power, and a blue circle
badge whose glyph is either a digit (vertebrae level 1-6) or a dash (V0).

Names/levels/power come from RapidOCR (ONNX, CPU-only, pip-installable — no
system binary). The badge glyph is too small for detection-stage OCR, so
badges are found by color (HSV mask on the blue circle), the glyph is
isolated inside the circle, and:
  - a wide flat glyph (aspect >= 2) is the dash -> V0
  - anything else is upscaled and sent through the recognizer as a digit
"""

from __future__ import annotations

import re

import cv2
import numpy as np

# Blue of the vertebrae badge circle (HSV). Wide enough to survive JPEG
# artifacts and mild scaling; blobs are further filtered by shape.
BADGE_HSV_LO = (90, 80, 120)
BADGE_HSV_HI = (130, 255, 255)

LV_RE = re.compile(r"^Lv\.?\s*\d+$", re.IGNORECASE)
NUM_RE = re.compile(r"^\d[\d,]*$")


class RosterOCR:
    def __init__(self):
        from rapidocr import RapidOCR

        self._engine = RapidOCR()

    # ---- public API ----

    def extract(self, image) -> list[dict]:
        """image: file path, bytes, or BGR ndarray. Returns one dict per card:
        {"name": str, "vertebrae": int, "level": int|None, "power": int|None}
        """
        img = self._to_bgr(image)
        texts = self._ocr_texts(img)
        badges = self._find_badges(img)

        results = []
        for bx, by, bw, bh in badges:
            b_cx = bx + bw / 2
            b_cy = by + bh / 2
            # card geometry scales with the badge, so distance cutoffs do too
            scale = bw / 21.0
            name = self._nearest_name(texts, bx + bw, b_cy, scale)
            level = self._nearest_level(texts, b_cx, b_cy, scale)
            power = self._nearest_power(texts, bx + bw, b_cy, scale)
            try:
                vert = self._read_badge(img, bx, by, bw, bh)
            except ValueError:
                vert = None  # unreadable badge: report the card, let the caller warn
            if name is not None:
                results.append(
                    {"name": name, "vertebrae": vert, "level": level, "power": power}
                )
        return results

    # ---- internals ----

    @staticmethod
    def _to_bgr(image) -> np.ndarray:
        if isinstance(image, np.ndarray):
            return image
        if isinstance(image, (bytes, bytearray)):
            arr = np.frombuffer(image, np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        else:
            img = cv2.imread(str(image))
        if img is None:
            raise ValueError("could not decode image")
        return img

    def _ocr_texts(self, img):
        """Full-image OCR pass. Returns [(min_x, min_y, max_x, max_y, text)].

        use_det/use_cls are passed explicitly every time: RapidOCR persists
        these kwargs across calls, so the badge reader's use_det=False would
        otherwise stick and break the next full-image pass."""
        res = self._engine(img, use_det=True, use_cls=True)
        out = []
        if not res.txts:
            return out
        for box, txt in zip(res.boxes, res.txts):
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]
            out.append((min(xs), min(ys), max(xs), max(ys), txt.strip()))
        return out

    @staticmethod
    def _find_badges(img):
        """Blue circular blobs of plausible badge size, sorted reading order."""
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        mask = cv2.inRange(hsv, BADGE_HSV_LO, BADGE_HSV_HI)
        n, _, stats, _ = cv2.connectedComponentsWithStats(mask)
        badges = []
        for i in range(1, n):
            x, y, w, h, area = stats[i]
            if area < 100 or not (10 <= w <= 60 and 10 <= h <= 60):
                continue
            if not (0.75 <= w / h <= 1.33):
                continue
            if area / (w * h) < 0.4:  # circles fill ~0.55-0.78 of their box
                continue
            badges.append((x, y, w, h))
        badges.sort(key=lambda b: (round(b[1] / max(b[3], 1)), b[0]))
        return badges

    def _read_badge(self, img, x, y, w, h) -> int:
        """Vertebrae level from one badge: 0 for the dash, else the digit."""
        crop = cv2.cvtColor(img[y : y + h, x : x + w], cv2.COLOR_BGR2GRAY)
        ch, cw = crop.shape
        yy, xx = np.mgrid[0:ch, 0:cw]
        # only pixels inside the circle: the card background outside the dark
        # ring is light gray and would otherwise pass the brightness cut
        inside = ((yy - (ch - 1) / 2) ** 2 + (xx - (cw - 1) / 2) ** 2) <= (
            min(ch, cw) / 2 * 0.78
        ) ** 2
        glyph = (crop > 180) & inside
        ys, xs = np.nonzero(glyph)
        if len(xs) == 0:
            return 0
        gw = xs.max() - xs.min() + 1
        gh = ys.max() - ys.min() + 1
        if gw / gh >= 2.0 and gh <= ch * 0.35:
            return 0  # the dash

        canvas = np.zeros_like(crop)
        canvas[glyph] = 255
        big = cv2.resize(canvas, None, fx=10, fy=10, interpolation=cv2.INTER_CUBIC)
        big = cv2.cvtColor(255 - big, cv2.COLOR_GRAY2BGR)
        res = self._engine(big, use_det=False, use_cls=False)
        if res.txts:
            m = re.search(r"\d", res.txts[0])
            if m:
                return int(m.group())
        raise ValueError(f"unreadable badge glyph at ({x},{y})")

    @staticmethod
    def _nearest_name(texts, badge_right, badge_cy, scale):
        """Name = nearest non-Lv, non-numeric text right of the badge.
        The name sits above the badge center, so allow more slack upward."""
        best, best_d = None, None
        for x0, y0, x1, y1, txt in texts:
            if LV_RE.match(txt) or NUM_RE.match(txt):
                continue
            t_cy = (y0 + y1) / 2
            dx = x0 - badge_right
            dy = t_cy - badge_cy
            if dx < 0 or dx > 350 * scale or dy > 30 * scale or dy < -90 * scale:
                continue
            d = dx + abs(dy)
            if best_d is None or d < best_d:
                best, best_d = txt, d
        return best

    @staticmethod
    def _nearest_level(texts, badge_cx, badge_cy, scale):
        """Lv.N text nearest below the badge (same card column)."""
        best, best_d = None, None
        for x0, y0, x1, y1, txt in texts:
            if not LV_RE.match(txt):
                continue
            t_cx = (x0 + x1) / 2
            t_cy = (y0 + y1) / 2
            if abs(t_cx - badge_cx) > 120 * scale:
                continue
            if not (0 <= t_cy - badge_cy <= 120 * scale):
                continue
            d = abs(t_cx - badge_cx) + (t_cy - badge_cy)
            if best_d is None or d < best_d:
                best, best_d = txt, d
        if best is None:
            return None
        return int(re.search(r"\d+", best).group())

    @staticmethod
    def _nearest_power(texts, badge_right, badge_cy, scale):
        """Power = nearest pure-number text right of and below the badge
        (sits on the Lv row, right of the level)."""
        best, best_d = None, None
        for x0, y0, x1, y1, txt in texts:
            if not NUM_RE.match(txt):
                continue
            t_cy = (y0 + y1) / 2
            dx = x0 - badge_right
            dy = t_cy - badge_cy
            if dx < 0 or dx > 350 * scale or not (0 <= dy <= 120 * scale):
                continue
            d = dx + dy
            if best_d is None or d < best_d:
                best, best_d = txt, d
        if best is None:
            return None
        return int(best.replace(",", ""))
