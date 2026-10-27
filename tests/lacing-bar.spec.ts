import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createExampleProject } from '../src/examples';
import type { Project } from '../src/model';
import { fileAction, setView, viewState } from './navigation';

test.use({ baseURL: process.env.RACK_TEST_URL ?? 'http://127.0.0.1:5173' });
test.setTimeout(120000);

async function exported(page: Page): Promise<Project> {
  const event = page.waitForEvent('download');
  await fileAction(page, 'Export project');
  return JSON.parse(await readFile((await (await event).path())!, 'utf8'));
}
async function imported(page: Page, p: Project) {
  await page.getByLabel('Import project JSON', { exact: true }).setInputFiles({
    name: 'lacing-example.rack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(p)),
  });
}
async function settle(page: Page, u: number) {
  await page
    .locator('.rack-u-label')
    .filter({ hasText: new RegExp(`^${String(u).padStart(2, '0')}$`) })
    .evaluate(async (e) => {
      let before = e.getBoundingClientRect(),
        stable = 0;
      for (let i = 0; i < 180 && stable < 5; i++) {
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        const now = e.getBoundingClientRect();
        stable = Math.hypot(now.x - before.x, now.y - before.y) < 0.1 ? stable + 1 : 0;
        before = now;
      }
    });
}
async function nativeDrop(page: Page, name: string, u: number, face: 'front' | 'rear') {
  await setView(page, face === 'rear' ? 'Rear' : 'Front');
  await expect(page.getByRole('combobox', { name: 'Drop mounting face', exact: true })).toHaveValue(
    face,
  );
  const ortho = page.getByRole('button', { name: 'Orthographic camera', exact: true });
  if ((await ortho.getAttribute('aria-pressed')) !== 'true') await ortho.click();
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click();
  const card = page
    .locator('.library-card')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
  await card.scrollIntoViewIfNeeded();
  await settle(page, u);
  const from = (await card.locator('.device-mini').boundingBox())!,
    canvas = (await page.locator('canvas').boundingBox())!;
  const label = (await page
    .locator('.rack-u-label')
    .filter({ hasText: new RegExp(`^${String(u).padStart(2, '0')}$`) })
    .boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 14, from.y + from.height / 2 + 4, { steps: 5 });
  await page.mouse.move(canvas.x + canvas.width / 2, label.y + label.height / 2, { steps: 32 });
  await expect(page.locator('.scene-placement-message')).toContainText(new RegExp(face, 'i'));
  await expect(page.locator('.scene-placement-message')).toHaveClass(/valid/);
  await page.mouse.up();
}

test('native rear and front library drops follow the selected mounting face in a translated stepped rack', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.setDefaultTimeout(10000);
  await page.goto('/');
  await expect(page.locator('.rack-u-label').first()).toBeVisible();
  const p = createExampleProject(false);
  p.rack.originMm = [150, 180, -200];
  p.rack.endPanels = null;
  await imported(page, p);
  const bar = p.definitions.find((d) => d.lacing)!;
  await nativeDrop(page, bar.name, 17, 'rear');
  await expect(page.locator('.installed-pills > button')).toHaveCount(1);
  let saved = await exported(page);
  expect(saved.devices[0]).toMatchObject({ definitionId: bar.id, face: 'rear', startU: 17 });
  await nativeDrop(page, bar.name, 8, 'front');
  await expect(page.locator('.installed-pills > button')).toHaveCount(2);
  saved = await exported(page);
  expect(saved.devices[1]).toMatchObject({ definitionId: bar.id, face: 'front', startU: 8 });
  await page.getByRole('button', { name: 'Orbit 3D view', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Drop mounting face', exact: true })
    .selectOption('rear');
  await page.getByRole('button', { name: `Place ${bar.name}`, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox', { name: 'Mounting face', exact: true })).toHaveValue(
    'rear',
  );
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await setView(page, 'Top');
  await expect(page.getByRole('combobox', { name: 'Drop mounting face', exact: true })).toHaveValue(
    'rear',
  );
  await expect(viewState(page, 'Top')).toHaveAttribute('aria-pressed', 'true');
  await settle(page, 8);
  await page.screenshot({ path: 'docs/screenshots/lacing-bar-top.png' });
  await page.getByRole('button', { name: 'Orbit 3D view', exact: true }).click();
  await settle(page, 8);
  await page.screenshot({ path: 'docs/screenshots/lacing-bar-3d.png' });
  expect(errors).toEqual([]);
});

test('existing projects can add, edit, place and round-trip a lacing bar without replacing their equipment', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.setDefaultTimeout(10000);
  await page.goto('/');
  const p = createExampleProject(false);
  p.definitions = p.definitions.filter((d) => !d.lacing);
  await imported(page, p);
  await page.getByRole('button', { name: 'Add lacing bar', exact: true }).click();
  const name = 'Adjustable lacing bar · middle hole';
  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  let dialog = page.getByRole('dialog');
  const reach = dialog.getByRole('spinbutton', { name: /^Lacing bar inward reach/ });
  await expect(reach).toHaveValue('150');
  await reach.fill('225');
  await reach.press('Tab');
  await dialog.getByRole('button', { name: 'Save definition', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: `Place ${name}`, exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Start U', { exact: true }).fill('10');
  await dialog.getByLabel('Start U', { exact: true }).press('Tab');
  await expect(dialog.locator('.callout.good')).toContainText('No conflict detected');
  await dialog.getByRole('button', { name: 'Place equipment', exact: true }).click();
  const saved = await exported(page),
    definition = saved.definitions.find((d) => d.lacing)!;
  expect(definition.depthMm).toBe(231);
  expect(definition.screwOffsetsMm).toEqual([22.225]);
  expect(saved.definitions.filter((d) => !d.lacing)).toEqual(p.definitions);
  expect(saved.rack).toEqual(p.rack);
  await imported(page, saved);
  expect((await exported(page)).devices).toEqual(saved.devices);
  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: /^Lacing bar inward reach/ })).toHaveValue(
    '225',
  );
  expect(errors).toEqual([]);
});
