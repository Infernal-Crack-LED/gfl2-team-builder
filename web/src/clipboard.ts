/**
 * Clipboard write with a textarea fallback — navigator.clipboard requires a
 * secure context AND permission, and both can be missing (plain-http dev
 * hosts, denied prompts, older mobile browsers). Returns false only when both
 * paths fail, so callers can surface "select the URL and copy it manually"
 * instead of silently doing nothing.
 *
 * Shared by every page with a copy button (the builders and the infographics
 * creator) so the fallback behaviour can't drift between them.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
