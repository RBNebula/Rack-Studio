import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// A brand-new visitor: no stored project and no record of the tour (the config presets it).
test.use({
  baseURL: process.env.RACK_TEST_URL ?? 'http://127.0.0.1:5173',
  storageState: { cookies: [], origins: [] },
});

const titles = [
  'Welcome to Rack Studio',
  'File menu',
  'Workspaces',
  'Equipment library',
  'Import STEP model',
  'Design zone',
  '3D and 2D views',
  'Connect and add objects',
  'Properties',
  'Undo, save and help',
];
const targets: (string | null)[] = [
  null,
  '[data-tour="file"]',
  '[data-tour="tabs"]',
  '[data-tour="library"]',
  '[aria-label="Import STEP model"]',
  '[data-tour="design-zone"]',
  '[data-tour="view-switch"]',
  '[data-tour="connect"]',
  '[data-tour="properties"]',
  '[data-tour="save"]',
];

const tour = (page: Page) => page.locator('.tour-card[role="dialog"]');

test('a first visit walks through the main areas once, and the quick guide replays it', async ({
  page,
}) => {
  page.setDefaultTimeout(15_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  const card = tour(page);
  await expect(card).toBeVisible();
  const viewport = page.viewportSize()!;

  for (let i = 0; i < titles.length; i++) {
    await expect(card.locator('#tour-title')).toHaveText(titles[i]);
    await expect(card).toContainText(`${i + 1} of ${titles.length}`);
    const box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    const selector = targets[i];
    if (selector) {
      // The spotlight frames the highlighted area, 4 px outside its bounds, once it settles.
      await expect
        .poll(async () => {
          const target = (await page.locator(selector).first().boundingBox())!;
          const spot = (await page.locator('.tour-spotlight').boundingBox())!;
          return Math.max(
            Math.abs(spot.x - (target.x - 4)),
            Math.abs(spot.y - (target.y - 4)),
            Math.abs(spot.width - (target.width + 8)),
            Math.abs(spot.height - (target.height + 8)),
          );
        })
        .toBeLessThan(2);
    } else {
      await expect(page.locator('.tour-spotlight')).toHaveCount(0);
    }
    if (i === 2) {
      await card.getByRole('button', { name: 'Back', exact: true }).click();
      await expect(card.locator('#tour-title')).toHaveText(titles[1]);
      await page.keyboard.press('ArrowRight');
      await expect(card.locator('#tour-title')).toHaveText(titles[2]);
    }
    await card
      .getByRole('button', { name: i === titles.length - 1 ? 'Finish' : 'Next', exact: true })
      .click();
  }
  await expect(card).toHaveCount(0);

  // Finished once: a reload does not show it again.
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.tour')).toHaveCount(0);

  // The quick guide replays it; Escape closes it.
  await page.getByRole('button', { name: 'Quick guide', exact: true }).click();
  await page.getByRole('button', { name: 'Take the tour', exact: true }).click();
  await expect(card.locator('#tour-title')).toHaveText(titles[0]);
  await page.keyboard.press('Escape');
  await expect(page.locator('.tour')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('skipping the tour is remembered, and a returning project does not start it', async ({
  page,
}) => {
  page.setDefaultTimeout(15_000);
  await page.goto('/');
  const card = tour(page);
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Skip tour', exact: true }).click();
  await expect(page.locator('.tour')).toHaveCount(0);

  // Store a project, then forget the tour: reopening that project is not a first visit.
  await page
    .locator('.workspace-tabs')
    .getByRole('button', { name: 'Project Settings', exact: true })
    .click();
  await page.getByLabel('Project name', { exact: true }).fill('QA returning project');
  await expect(page.locator('.toolbar-save .unsaved-dot')).toHaveCount(0);
  await expect(page.locator('.toolbar-save')).toContainText('Saved locally');
  await page.evaluate(() => localStorage.removeItem('rack-studio-tour-done'));
  await page.reload();
  await expect(page.locator('.statusbar')).toContainText('Reopened your last project.');
  await expect(page.locator('.tour')).toHaveCount(0);
});
