/**
 * The Download / Copy pair under every card preview.
 *
 * All three previews (build, squad, rec) render a 1200×630-class node and turn
 * it into a PNG the same way, so the render options, the "Rendering…" state and
 * the copy-flash live here once rather than three times.
 *
 * Copying an IMAGE is not `copyText`: it needs ClipboardItem, which Safari only
 * honours inside the original user gesture. html-to-image takes ~1s, which is
 * long enough to lose that gesture, so the first attempt hands ClipboardItem
 * the still-pending render promise (the spec allows it, and it keeps the
 * gesture alive). Firefox rejects a promise-valued ClipboardItem, so the second
 * attempt awaits the blob and writes it plainly — Chrome and Firefox don't
 * enforce the gesture window that strictly. If both fail the user is told to
 * use Download, which always works.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { toBlob, toPng } from 'html-to-image';

/** Matches the server renderer's DPR=2 and the card background. */
const RENDER_OPTIONS = {
  pixelRatio: 2,
  cacheBust: true,
  backgroundColor: '#101216',
} as const;

/** Same 1.5s flash as the text copy buttons elsewhere on the site. */
const COPIED_MS = 1500;

async function writeImage(pending: Promise<Blob | null>): Promise<boolean> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    return false;
  }
  // The render is shared by both attempts; guard it so a failed render never
  // surfaces as an unhandled rejection when a write path skips it.
  const required = pending.then((blob) => {
    if (!blob) {
      throw new Error('render produced no image');
    }
    return blob;
  });
  required.catch(() => {});

  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': required }),
    ]);
    return true;
  } catch {
    // Engine rejected the promise form (or the gesture) — retry with the blob.
  }
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': await required }),
    ]);
    return true;
  } catch {
    return false;
  }
}

export function CardImageActions({
  cardRef,
  filename,
  downloadLabel,
  copyLabel = 'Copy card image',
}: {
  /** The node to rasterize — the card itself, at logical size. */
  cardRef: RefObject<HTMLDivElement | null>;
  /** Download filename, extension included. */
  filename: string;
  downloadLabel: string;
  copyLabel?: string;
}) {
  const [busy, setBusy] = useState<'download' | 'copy' | null>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    []
  );

  const flashCopied = useCallback(() => {
    setCopied(true);
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!cardRef.current || busy) {
      return;
    }
    setBusy('download');
    try {
      const dataUrl = await toPng(cardRef.current, RENDER_OPTIONS);
      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      link.click();
    } catch {
      // Download failed silently — the preview is still visible.
    }
    setBusy(null);
  }, [busy, cardRef, filename]);

  const handleCopy = useCallback(async () => {
    const node = cardRef.current;
    if (!node || busy) {
      return;
    }
    setBusy('copy');
    setFailed(false);
    // Started BEFORE the await so the promise form can reach ClipboardItem
    // while the click is still the current user gesture.
    const ok = await writeImage(toBlob(node, RENDER_OPTIONS));
    if (ok) {
      flashCopied();
    } else {
      setFailed(true);
    }
    setBusy(null);
  }, [busy, cardRef, flashCopied]);

  return (
    <div className="card-preview-actions">
      <button
        type="button"
        className="btn-outline"
        onClick={() => void handleDownload()}
        disabled={busy !== null}
      >
        {busy === 'download' ? 'Rendering…' : downloadLabel}
      </button>
      <button
        type="button"
        className="btn-outline"
        onClick={() => void handleCopy()}
        disabled={busy !== null}
      >
        {busy === 'copy' ? 'Rendering…' : copied ? '✓ Copied' : copyLabel}
      </button>
      {failed && (
        <span className="muted" role="alert">
          Copy failed — use Download instead.
        </span>
      )}
    </div>
  );
}
