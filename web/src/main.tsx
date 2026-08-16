/**
 * React root — lazy() page switch, Suspense fallback, head sync.
 * Every page is a separate chunk for code splitting.
 */
import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { SiteNav, SiteFooter } from './SiteChrome';
import { useRouteAndSlug } from './router';
import { useDocumentHead } from './useDocumentHead';
import { captureTokenFromUrl } from './auth';
import './styles.css';

// Pick up the OAuth token fragment BEFORE first render so the nav and any
// save controls see the session immediately.
captureTokenFromUrl();

// Route-level code splitting: every page loads as its own chunk.
const HomePage = lazy(() =>
  import('./HomePage').then((m) => ({ default: m.HomePage }))
);
const CharactersPage = lazy(() =>
  import('./CharactersPage').then((m) => ({ default: m.CharactersPage }))
);
const DollPage = lazy(() =>
  import('./DollPage').then((m) => ({ default: m.DollPage }))
);
const WeaponsPage = lazy(() =>
  import('./WeaponsPage').then((m) => ({ default: m.WeaponsPage }))
);
const WeaponPage = lazy(() =>
  import('./WeaponPage').then((m) => ({ default: m.WeaponPage }))
);
const TeamBuilderPage = lazy(() =>
  import('./TeamBuilderPage').then((m) => ({ default: m.TeamBuilderPage }))
);
const DollBuilderPage = lazy(() =>
  import('./DollBuilderPage').then((m) => ({ default: m.DollBuilderPage }))
);
const CreditsPage = lazy(() =>
  import('./CreditsPage').then((m) => ({ default: m.CreditsPage }))
);

function PageFallback() {
  return (
    <div className="page-fallback">
      <span className="page-fallback-spin" aria-hidden="true" />
      Loading…
    </div>
  );
}

function Root() {
  const { route, slug } = useRouteAndSlug();
  useDocumentHead();

  return (
    <>
      <SiteNav current={route} />
      <Suspense fallback={<PageFallback />}>
        {route === 'home' ? (
          <HomePage />
        ) : route === 'characters' ? (
          <CharactersPage />
        ) : route === 'character' ? (
          <DollPage slug={slug} />
        ) : route === 'weapons' ? (
          <WeaponsPage />
        ) : route === 'weapon' ? (
          <WeaponPage slug={slug} />
        ) : route === 'team-builder' ? (
          <TeamBuilderPage />
        ) : route === 'builder' ? (
          <DollBuilderPage slug={slug} />
        ) : route === 'credits' ? (
          <CreditsPage />
        ) : (
          <HomePage />
        )}
      </Suspense>
      <SiteFooter />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
