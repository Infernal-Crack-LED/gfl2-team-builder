/**
 * The community build recommendation for one doll.
 *
 * Two jobs, in this order of importance:
 *   1. CREDIT. This is the GFL2 Info Sheet maintainers' analysis, used with
 *      permission that does not travel onward. The attribution sits INSIDE the
 *      panel, at the top, naming them before the reader sees any of it — not
 *      in a page footer where it reads as boilerplate.
 *   2. Say what the recommended things actually do. The sheet gives bare
 *      names; joined to the site's own weapon and key rows they carry their
 *      real trait and effect text. Half the roster has no prose from the
 *      sheet, and that join is what keeps those pages worth reading.
 */
import { GameIcon } from './GameIcon';
import { RichText } from './RichText';
import {
  RECOMMENDATION_CREDIT,
  type HydratedRecommendation,
  type RecLink,
} from '../recommendations';
import { onSpaLinkClick } from '../router';

function LinkRow({
  item,
  rank,
  art,
}: {
  item: RecLink;
  rank?: number;
  /**
   * Weapon art is wide (512×256) with transparency and letterboxes; key icons
   * are square tiles. Same slot, two aspect ratios.
   */
  art: 'weapon' | 'key';
}) {
  const name = item.href ? (
    <a href={item.href} onClick={onSpaLinkClick(item.href)}>
      {item.label}
    </a>
  ) : (
    <span>{item.label}</span>
  );
  return (
    <li className="recbuild-item">
      <div className={`recbuild-item-art recbuild-item-art-${art}`}>
        {item.icon ? (
          // alt="" — the name is right beside it as real text, so announcing
          // the art again is noise to a screen reader.
          <GameIcon src={item.icon} alt="" />
        ) : (
          <span className="recbuild-item-art-empty" aria-hidden="true">
            ?
          </span>
        )}
      </div>
      <div className="recbuild-item-body">
        <div className="recbuild-item-head">
          {rank !== undefined && <span className="recbuild-rank">{rank}</span>}
          <span className="recbuild-item-name">{name}</span>
          {item.meta && <span className="recbuild-item-meta">{item.meta}</span>}
          {/* The sheet's own aside, e.g. "Please get V6 first" — the
              maintainers' advice, kept verbatim rather than dropped. */}
          {item.aside && (
            <span className="recbuild-item-aside">{item.aside}</span>
          )}
        </div>
        {item.detail && (
          <RichText text={item.detail} className="recbuild-item-detail" />
        )}
      </div>
    </li>
  );
}

/**
 * The milestones a prose block names. This is the "tie the prose back to the
 * path" link: the block is NOT that step's description — the parser was
 * careful to keep those apart — but saying which steps it discusses lets a
 * reader jump between the two without the page claiming they are the same
 * thing.
 */
function StepRefs({ refs }: { refs: string[] }) {
  if (refs.length === 0) {
    return null;
  }
  return (
    <p className="recbuild-refs">
      <span className="recbuild-refs-label">Concerns</span>
      {refs.map((r) => (
        <span className="recbuild-ref" key={r}>
          {r}
        </span>
      ))}
    </p>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="recbuild-section">
      <h3>{title}</h3>
      {hint && <p className="recbuild-hint">{hint}</p>}
      {children}
    </div>
  );
}

export function RecommendationPanel({
  rec,
  dollName,
}: {
  rec: HydratedRecommendation;
  dollName: string;
}) {
  const { primary, alternatives } = rec.keys;
  const a = rec.attachments;

  return (
    <section className="unit-section unit-panel recbuild-panel">
      <header className="recbuild-header">
        <h2>Recommended build</h2>
        <p className="recbuild-credit">
          {RECOMMENDATION_CREDIT.lead} <br />
          <a
            href={RECOMMENDATION_CREDIT.sheetUrl}
            target="_blank"
            rel="noreferrer"
          >
            View {dollName} on the {RECOMMENDATION_CREDIT.sheetName}
          </a>
        </p>
      </header>

      <Section title="Vertical investment">
        {/* The verdict is the sheet's one-line answer to "how far do I go?".
              It leads the section because it is the most useful sentence here
              and it summarises the steps below it. */}
        {rec.verdict && (
          <p className="recbuild-verdict">
            <span className="recbuild-verdict-label">Recommended</span>
            <span className="recbuild-verdict-value">{rec.verdict.text}</span>
          </p>
        )}

        {/* The authors' answer when the answer is "there isn't one" — for a
              Standard unit, one whose vertebrae are free, or one with no
              breakthrough worth chasing. That IS this section's content, so it
              stands in for the step list. */}
        {rec.noPath && <p className="recbuild-prose">{rec.noPath.text}</p>}

        {rec.explainedSteps.length > 0 && (
          <ol className="recbuild-path">
            {rec.explainedSteps.map((s) => (
              <li key={s.step}>
                <span className="recbuild-step">{s.step}</span>
                <span className="recbuild-step-note">{s.note}</span>
              </li>
            ))}
          </ol>
        )}

        {/* Breakpoints the sheet marks but never writes up. Kept as a list
              rather than as empty rows in the path above: they are real
              information, just not descriptions. */}
        {rec.markerSteps.length > 0 && (
          <p className="recbuild-markers">
            <span className="recbuild-markers-label">
              {rec.explainedSteps.length > 0
                ? 'Also marked'
                : 'Marked breakpoints'}
            </span>
            {rec.markerSteps.map((s) => (
              <span className="recbuild-ref" key={s}>
                {s}
              </span>
            ))}
            <span className="recbuild-markers-hint">
              listed without an explanation
            </span>
          </p>
        )}

        {/* Nothing at all: say so, rather than leaving a bare heading. */}
        {rec.explainedSteps.length === 0 &&
          rec.markerSteps.length === 0 &&
          !rec.noPath &&
          !rec.verdict && (
            <p className="recbuild-empty">
              The {RECOMMENDATION_CREDIT.sheetName} hasn’t published a vertical
              investment path for {dollName} yet.
            </p>
          )}

        {/* Caveats qualify the path, so they sit with it rather than in the
              notes below — a "do not stop at V3" warning is useless three
              sections away from V3. */}
        {rec.caveats.map((c, i) => (
          <div className="recbuild-caveat" key={i}>
            <span className="recbuild-caveat-label">Caveat</span>
            <div>
              <p className="recbuild-prose">{c.text}</p>
              <StepRefs refs={c.refs} />
            </div>
          </div>
        ))}
      </Section>

      {rec.weapons.length > 0 && (
        <Section title="Weapons" hint="In the sheet's order of preference.">
          <ul className="recbuild-list">
            {rec.weapons.map((w, i) => (
              <LinkRow key={w.label} item={w} rank={i + 1} art="weapon" />
            ))}
          </ul>
        </Section>
      )}

      {(primary.length > 0 || alternatives.length > 0) && (
        <Section title="Keys">
          {primary.length > 0 && (
            <ul className="recbuild-list">
              {primary.map((k) => (
                <LinkRow key={k.label} item={k} art="key" />
              ))}
            </ul>
          )}
          {alternatives.length > 0 && (
            <div className="recbuild-subsection">
              <p className="recbuild-subsection-label">Alternatives</p>
              <ul className="recbuild-list recbuild-list-alt">
                {alternatives.map((k) => (
                  <LinkRow key={k.label} item={k} art="key" />
                ))}
              </ul>
            </div>
          )}
        </Section>
      )}

      {(a.mainSet || a.substats) && (
        <Section title="Attachments">
          {a.mainSet && (
            <div className="recbuild-item">
              <div className="recbuild-item-head">
                <span className="recbuild-item-name">{a.mainSet}</span>
              </div>
              {a.setEffect && (
                <RichText text={a.setEffect} className="recbuild-item-detail" />
              )}
            </div>
          )}
          {a.substats && (
            <p className="recbuild-substats">
              <span className="recbuild-substats-label">Substats</span>
              <span className="recbuild-substats-value">{a.substats}</span>
            </p>
          )}
        </Section>
      )}

      {/* Mechanics, rotations and interactions. Long — OTs-14 alone runs to
          four blocks and 2000 characters — so it collapses, but it stays in
          the DOM rather than behind a fetch: it is real indexable prose about
          the doll, and it is the sheet's writing, not ours. */}
      {rec.notes.length > 0 && (
        <details className="recbuild-notes">
          <summary>
            Notes on playing {dollName}
            <span className="recbuild-notes-count">{rec.notes.length}</span>
          </summary>
          {rec.notes.map((n, i) => (
            <div className="recbuild-note" key={i}>
              <p className="recbuild-prose">{n.text}</p>
              <StepRefs refs={n.refs} />
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
