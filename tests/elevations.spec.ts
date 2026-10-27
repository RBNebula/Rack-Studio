import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Project } from '../src/model';
import { fileAction } from './navigation';

test.use({ baseURL: process.env.RACK_TEST_URL ?? 'http://127.0.0.1:5173' });
test.setTimeout(120000);
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus)
    await page.screenshot({ path: `docs/validation/elevations-failure-${info.line}.png` });
});

async function exported(page: Page): Promise<Project> {
  const event = page.waitForEvent('download');
  await fileAction(page, 'Export project');
  return JSON.parse(await readFile((await (await event).path())!, 'utf8')) as Project;
}
/** Two 20U racks: the fixture's rack plus an empty Rack B to its +X side (left from the front). */
async function open(page: Page) {
  page.setDefaultTimeout(10000);
  await page.goto('/');
  await expect(page.locator('.rack-u-label').first()).toBeVisible();
  const p = JSON.parse(await readFile('tests/fixtures/route-follow.rack.json', 'utf8')) as Project;
  p.additionalRacks = [{ ...p.rack, id: 'rack-b', name: 'Rack B', originMm: [650, 0, 0] }];
  await page.getByLabel('Import project JSON', { exact: true }).setInputFiles({
    name: 'elevations.rack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(page.locator('.statusbar')).toContainText('Project imported');
  await page
    .getByRole('group', { name: 'Design view' })
    .getByRole('button', { name: '2D', exact: true })
    .click();
  return p;
}
const face = (page: Page, rack: string, side: 'front' | 'rear') =>
  page.getByRole('group', { name: `${rack} ${side}`, exact: true });
/** Drop point at the middle of U `u` in a 20U face. */
async function atU(target: Locator, u: number) {
  const box = (await target.boundingBox())!;
  return { x: box.width / 2, y: ((20 - u + 0.5) / 20) * box.height };
}
const MAIN = 'Illustrative 20U rack - dimensions require verification';

test('2D elevations show front and rear per rack and place, move and block drops', async ({
  page,
}) => {
  await open(page);
  await expect(page.getByRole('region', { name: '3D rack viewport' })).toBeHidden();
  // Racks run left to right as seen from the front; each shows its front, then its rear.
  await expect(page.locator('.elevation-rack h3')).toHaveText(['Rack B', MAIN]);
  await expect(page.locator('.elevation-face figcaption')).toHaveText([
    'Front',
    'Rear',
    'Front',
    'Rear',
  ]);
  await expect(face(page, MAIN, 'front').getByRole('button')).toHaveCount(2);
  await expect(face(page, MAIN, 'rear').getByRole('button', { name: /Rear PDU 1/ })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/rack-elevations-2d.png' });

  // Library drop into Rack B's rear.
  const card = page.locator('.library-card').filter({ hasText: 'Example compact rack PC' });
  const rearB = face(page, 'Rack B', 'rear');
  await card.dragTo(rearB, { targetPosition: await atU(rearB, 10) });
  await expect(page.locator('.statusbar')).toContainText('at U10 (rear, Rack B)');
  let data = await exported(page);
  const added = data.devices.find((d) => d.rackId === 'rack-b')!;
  expect(added).toMatchObject({ startU: 10, face: 'rear', definitionId: 'def-demo-pc' });

  // Move an installed device to the other face of its rack.
  const rearMain = face(page, MAIN, 'rear');
  await face(page, MAIN, 'front')
    .getByRole('button', { name: /^PC 1,/ })
    .dragTo(rearMain, { targetPosition: await atU(rearMain, 2) });
  await expect(rearMain.getByRole('button', { name: 'PC 1, U2', exact: true })).toBeVisible();
  data = await exported(page);
  expect(data.devices.find((d) => d.name === 'PC 1')).toMatchObject({ startU: 2, face: 'rear' });

  // A blocked drop reports the reason and changes nothing.
  const before = JSON.stringify((await exported(page)).devices);
  await face(page, MAIN, 'front')
    .getByRole('button', { name: /^PC 2,/ })
    .dragTo(rearMain, { targetPosition: await atU(rearMain, 2) });
  await expect(page.getByRole('alert')).toContainText('Cannot place PC 2 at U2');
  expect(JSON.stringify((await exported(page)).devices)).toBe(before);

  // Keyboard: the arrow keys move the focused device by 1U through the same checks.
  await face(page, MAIN, 'front')
    .getByRole('button', { name: /^PC 2,/ })
    .focus();
  await page.keyboard.press('ArrowUp');
  await expect(
    face(page, MAIN, 'front').getByRole('button', { name: 'PC 2, U8', exact: true }),
  ).toBeVisible();

  // Selection drives the Inspector; switching back restores the 3D viewport.
  await face(page, MAIN, 'front').getByRole('button', { name: 'PC 2, U8', exact: true }).click();
  await expect(page.locator('.inspector').getByLabel('Instance name', { exact: true })).toHaveValue(
    'PC 2',
  );
  await page
    .getByRole('group', { name: 'Design view' })
    .getByRole('button', { name: '3D', exact: true })
    .click();
  await expect(page.getByRole('region', { name: '3D rack viewport' })).toBeVisible();
  await expect(page.getByRole('region', { name: '2D rack elevations' })).toHaveCount(0);
});
