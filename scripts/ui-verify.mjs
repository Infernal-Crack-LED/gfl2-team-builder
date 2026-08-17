/**
 * Visual smoke pass over the site's builder/tool pages, driven by Playwright.
 *
 * Screenshots land in /tmp/verify-*.png, and every console error, page error,
 * and failed request is reported per page — so a lazily-imported chunk that
 * blew up can't pass as "it rendered". The last block is a real interaction
 * test of the contract that has no unit-test seam: editing a build inside the
 * team builder's modal and closing it must leave the squad on that build.
 *
 * `npm run smoke:ui` builds first and starts its own preview server; pass a
 * base URL to point it at an already-running one instead.
 */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 4188;
let server;
let base = process.argv[2];
if (!base) {
  base = `http://localhost:${PORT}`;
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT)], {
    stdio: 'ignore',
  });
  // vite preview is up in well under a second; give it room on a cold cache.
  await new Promise((r) => setTimeout(r, 3000));
}

process.on('exit', () => server?.kill());

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') {
    problems.push(`console: ${m.text()}`);
  }
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) =>
  problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`)
);

async function visit(path, name, after) {
  problems.length = 0;
  await page.goto(base + path, { waitUntil: 'networkidle' });
  if (after) {
    await after();
  }
  await page.screenshot({ path: `/tmp/verify-${name}.png`, fullPage: false });
  const h1 = await page
    .$eval('h1', (e) => e.textContent)
    .catch(() => '(no h1)');
  console.log(
    `${path.padEnd(22)} h1=${JSON.stringify(h1).padEnd(28)} ${
      problems.length ? 'PROBLEMS: ' + problems.join(' | ') : 'clean'
    }`
  );
}

await visit('/keys', 'keys', async () => {
  const sections = await page.$$eval('.keys-section h2', (els) =>
    els.map((e) => e.textContent.trim())
  );
  console.log('  key sections:', sections.join(' / '));
  const affinity = await page.$$eval(
    '.keycard-title',
    (els) => els.filter((e) => /affinity/i.test(e.textContent)).length
  );
  console.log('  affinity cards visible (want 0):', affinity);
});

await visit('/tools', 'tools', async () => {
  console.log(
    '  tiles:',
    (
      await page.$$eval('.tool-tile-title', (e) => e.map((x) => x.textContent))
    ).join(', ')
  );
});

await visit('/tools/infographics', 'infographics', async () => {
  console.log('  title:', await page.title());
});

// The pull card is the one tool whose preview is driven purely by the shared
// odds model, so its ladder row count is the signal that share/gacha.ts came
// through the bundle intact.
await visit('/tools/infographics?card=pull', 'infographics-pull', async () => {
  console.log(
    '  odds rows (want 7):',
    await page.$$eval('.pull-card-row', (e) => e.length),
    '| headline:',
    await page.$eval('.pull-card-tile-value', (e) => e.textContent)
  );
});

await visit('/saved', 'saved');

await visit('/team-builder', 'teambuilder-empty', async () => {
  const slots = await page.$$eval('.teambuilder-slot', (e) => e.length);
  console.log('  slots rendered (want 5):', slots);
});

// Fill two slots, then open the build modal on the first.
await page.locator('.dollcard').first().click();
await page.locator('.dollcard').first().click();
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/verify-teambuilder-filled.png' });
console.log(
  '  build selects:',
  await page.$$eval('.teambuilder-build-select', (e) => e.length),
  '| edit buttons:',
  await page.$$eval('.teambuilder-edit-build', (e) => e.length)
);

await page.locator('.teambuilder-edit-build').first().click();
await page.waitForSelector('.modal-panel');
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/verify-modal.png' });
console.log(
  '  modal title:',
  await page.$eval('.modal-head h2', (e) => e.textContent)
);

// Change the build inside the modal, close, and confirm the slot kept it.
const before = await page.$eval('.teambuilder-build-select', (e) => e.value);
await page
  .locator('.modal-panel')
  .getByRole('button', { name: 'R4', exact: true })
  .click();
await page.waitForTimeout(200);
await page.click('.modal-actions .btn-primary');
await page.waitForTimeout(300);
const after = await page.$eval('.teambuilder-build-select', (e) => e.value);
console.log(
  `  slot build select: before="${before}" after="${after}" (want custom)`
);
await page.screenshot({ path: '/tmp/verify-after-modal.png' });

await browser.close();
server?.kill();
