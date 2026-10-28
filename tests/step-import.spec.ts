import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Project } from '../src/model';
import { fileAction } from './navigation';

test.use({ baseURL: process.env.RACK_TEST_URL ?? 'http://127.0.0.1:5173' });
test.setTimeout(180000);
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus)
    await page.screenshot({ path: `docs/validation/step-import-failure-${info.line}.png` });
});

async function exported(page: Page): Promise<Project> {
  const event = page.waitForEvent('download');
  await fileAction(page, 'Export project');
  return JSON.parse(await readFile((await (await event).path())!, 'utf8')) as Project;
}
const faceOf = (page: Page, side: 'front' | 'rear') =>
  page.locator('.elevation-slots').and(page.locator(`[data-face="${side}"]`));
/** Drop point at the middle of U `u`, from the face's own row count. */
async function atU(target: Locator, u: number) {
  const box = (await target.boundingBox())!;
  const rows = Number(
    await target.evaluate((el) => getComputedStyle(el).getPropertyValue('--rows')),
  );
  return { x: box.width / 2, y: ((rows - u + 0.5) / rows) * box.height };
}

test('a STEP model without rack ears imports, stands set back on a shelf and moves with it', async ({
  page,
}) => {
  page.setDefaultTimeout(15000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.rack-u-label').first()).toBeVisible();

  await page.getByRole('button', { name: 'Import STEP model', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import STEP model' });
  await dialog.getByLabel('STEP file').setInputFiles('tests/fixtures/test-unit.stp');
  // The hidden internal board is omitted; the port adds 6 mm in front of the 150 mm body.
  await expect(dialog.getByTestId('step-facts')).toContainText(
    '200 W × 30 H × 156 D mm · 1U · 24 triangles · 1 hidden parts omitted',
    { timeout: 60000 },
  );
  await expect(dialog.getByRole('img', { name: 'Model front view' })).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /Model has no rack ears/ })).toBeChecked();
  // A narrow model is not offered as rack-eared equipment without a warning.
  await dialog.getByRole('radio', { name: /Model has rack ears/ }).check();
  await expect(dialog.locator('.callout')).toContainText('probably has no ears');
  await expect(dialog.getByRole('button', { name: 'Add to library' })).toBeDisabled();
  await dialog.getByRole('radio', { name: /Model has no rack ears/ }).check();
  await expect(dialog.getByLabel('Set back from shelf front (mm)')).toHaveValue('50');
  await dialog.getByLabel('Name', { exact: true }).fill('Test unit');
  await dialog.getByRole('button', { name: 'Add to library' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.statusbar')).toContainText('Imported Test unit');

  let data = await exported(page);
  const unit = data.definitions.find((d) => d.name === 'Test unit')!;
  expect(unit).toMatchObject({
    mounting: 'freestanding',
    heightU: 1,
    widthMm: 200,
    depthMm: 156,
    shelfSetbackMm: 50,
    evidence: 'user-entered',
  });
  expect(unit.heightMm).toBeCloseTo(30, 3);
  expect(unit.mesh).toMatchObject({ source: 'step', fileName: 'test-unit.stp', triangles: 24 });
  expect(unit.frontImage).toMatch(/^data:image\/png;base64,/);

  // 2D: a 1U shelf at U10, then the unit dropped onto it.
  await page
    .getByRole('group', { name: 'Design view' })
    .getByRole('button', { name: '2D', exact: true })
    .click();
  const front = faceOf(page, 'front');
  await page
    .locator('.library-card')
    .filter({ has: page.getByRole('heading', { name: '1U shelf', exact: true }) })
    .dragTo(front, { targetPosition: await atU(front, 10) });
  await expect(page.locator('.statusbar')).toContainText('at U10 (front)');
  await page
    .locator('.library-card')
    .filter({ has: page.getByRole('heading', { name: 'Test unit', exact: true }) })
    .dragTo(front, { targetPosition: await atU(front, 10) });
  await expect(page.locator('.statusbar')).toContainText('Placed Test unit 1 at U10 (front)');
  data = await exported(page);
  const shelf = data.devices.find((d) => d.name.startsWith('1U shelf'))!;
  expect(data.devices.find((d) => d.name === 'Test unit 1')).toMatchObject({
    startU: 10,
    supportId: shelf.id,
  });

  // Dragging the unit moves its shelf too, and the unit stays selected.
  await front
    .getByRole('button', { name: /^Test unit 1,/ })
    .dragTo(front, { targetPosition: await atU(front, 20) });
  await expect(page.locator('.statusbar')).toContainText(`Moved ${shelf.name} at U20 (front)`);
  data = await exported(page);
  expect(data.devices.find((d) => d.id === shelf.id)?.startU).toBe(20);
  expect(data.devices.find((d) => d.name === 'Test unit 1')).toMatchObject({
    startU: 20,
    supportId: shelf.id,
  });
  await expect(page.locator('.inspector').getByLabel('Instance name', { exact: true })).toHaveValue(
    'Test unit 1',
  );
  await page.screenshot({ path: 'docs/screenshots/step-import-2d.png' });

  // 3D renders the imported mesh.
  await page
    .getByRole('group', { name: 'Design view' })
    .getByRole('button', { name: '3D', exact: true })
    .click();
  await expect(page.getByRole('region', { name: '3D rack viewport' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a crashed import worker is reported, and the next file starts a fresh worker', async ({
  page,
}) => {
  page.setDefaultTimeout(15000);
  // Simulate the first CAD worker dying without a message (as an out-of-memory crash does):
  // it raises an error event and never answers.
  await page.addInitScript(() => {
    const Native = window.Worker;
    let crashedOne = false;
    window.Worker = class extends Native {
      dead = false;
      postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions) {
        // The first file sent to any worker crashes it, which then answers nothing more;
        // a replacement worker behaves normally.
        if (this.dead) return;
        if (!crashedOne) {
          crashedOne = true;
          this.dead = true;
          setTimeout(() => this.dispatchEvent(new ErrorEvent('error', { cancelable: true })), 50);
          return;
        }
        super.postMessage(message, transfer as Transferable[]);
      }
    };
  });
  await page.goto('/');
  await expect(page.locator('.rack-u-label').first()).toBeVisible();
  await page.getByRole('button', { name: 'Import STEP model', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import STEP model' });
  await dialog.getByLabel('STEP file').setInputFiles('tests/fixtures/test-unit.stp');
  await expect(dialog.getByRole('alert')).toContainText('The CAD import stopped unexpectedly');
  await expect(dialog.locator('.step-progress')).toHaveCount(0);
  // Choosing the file again uses a new, working worker.
  await dialog.getByLabel('STEP file').setInputFiles('tests/fixtures/test-unit.stp');
  await expect(dialog.getByTestId('step-facts')).toContainText('200 W × 30 H × 156 D mm', {
    timeout: 60000,
  });
});
