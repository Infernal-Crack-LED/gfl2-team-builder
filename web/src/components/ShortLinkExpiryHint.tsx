/**
 * The one-line caveat under a logged-out short link.
 *
 * Short links used to be login-only; now anyone can mint one, but a
 * session-less row is swept after ANON_SHARE_RETENTION_DAYS. A link that
 * quietly dies three days after someone pastes it into Discord is worse than
 * no short link at all, so the expiry is stated up front — with the two ways
 * to avoid it.
 *
 * Rendered only when logged out; a signed-in user's short link is permanent.
 */
import { ANON_SHARE_RETENTION_DAYS } from '../../../src/share/shareRetention';

export function ShortLinkExpiryHint({
  onCopyFullLink,
}: {
  onCopyFullLink?: () => void | Promise<void>;
}) {
  return (
    <p className="muted shortlink-hint">
      Short links expire after {ANON_SHARE_RETENTION_DAYS} days when you&apos;re
      not logged in. Log in to keep them, or use the{' '}
      {onCopyFullLink ? (
        <button
          type="button"
          className="shortlink-hint-link"
          onClick={() => void onCopyFullLink()}
        >
          full link
        </button>
      ) : (
        'full link'
      )}{' '}
      — it never expires.
    </p>
  );
}
