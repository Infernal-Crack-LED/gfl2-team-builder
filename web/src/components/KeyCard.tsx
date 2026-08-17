/**
 * The one key-card rendering used across the site: icon + title + level, the
 * attribute line, then the resolved effect text.
 *
 * Two hosts, one body. The builder wraps it in a <button> (keys are a
 * selection there), the doll page in a <div> (keys are reference data), so the
 * card body is the shared piece rather than the card element itself — that's
 * what keeps the two pages' key grids visually identical.
 */
import type { Key } from '../data';
import { GameIcon } from './GameIcon';
import { RichText } from './RichText';

export function KeyCardBody({ keyData }: { keyData: Key }) {
  return (
    <>
      <span className="dollbuilder-key-head">
        {keyData.imageUrl ? (
          <GameIcon className="dollbuilder-key-icon" src={keyData.imageUrl} />
        ) : (
          <span
            className="dollbuilder-key-icon dollbuilder-key-icon-empty"
            aria-hidden="true"
          >
            ?
          </span>
        )}
        <strong>{keyData.displayTitle ?? keyData.keyTitle ?? 'Key'}</strong>
        {keyData.level != null && (
          <span className="muted">Lv{keyData.level}</span>
        )}
      </span>
      {keyData.attributes && keyData.attributes.length > 0 && (
        <span className="dollbuilder-key-attrs">
          {keyData.attributes.map((attr, i) => (
            <span key={i}>
              {attr.name}: {attr.value}
            </span>
          ))}
        </span>
      )}
      <RichText text={keyData.effect} className="dollbuilder-effect" />
    </>
  );
}

/** Read-only key card — the doll page's counterpart to the builder's toggle. */
export function StaticKeyCard({ keyData }: { keyData: Key }) {
  return (
    <div className="dollbuilder-key-card static">
      <KeyCardBody keyData={keyData} />
    </div>
  );
}
