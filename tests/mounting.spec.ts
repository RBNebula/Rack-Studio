import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fileAction, selectInstalled, setView, viewState } from './navigation';

const test = base.extend<{ uncaughtErrors: string[] }>({
  uncaughtErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
      expect(errors, 'The mounting workflow must not raise uncaught JavaScript errors.').toEqual(
        [],
      );
    },
    { auto: true },
  ],
});

test.setTimeout(90_000);
test.use({ baseURL: process.env.RACK_TEST_URL ?? 'http://127.0.0.1:5173' });
test.beforeAll(({ browser }) => {
  console.info(`Mounting QA: Microsoft Edge ${browser.version()}, 1600 × 1000, software WebGL.`);
});

async function open(page: Page) {
  page.setDefaultTimeout(10_000);
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.rack-u-label').first()).toBeVisible();
  await expect(page.locator('.installed-pills > button')).toHaveCount(6);
}

async function placeShelf(page: Page, u: number, face: 'front' | 'rear') {
  await page.getByRole('button', { name: 'Place 1U vented shelf', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Place equipment precisely' });
  const startU = dialog.getByLabel('Start U', { exact: true });
  await startU.fill(String(u));
  await startU.press('Tab');
  await dialog.getByRole('combobox', { name: 'Mounting face', exact: true }).selectOption(face);
  await expect(dialog.locator('.callout.good')).toContainText('No conflict detected');
  await dialog.getByRole('button', { name: 'Place equipment', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.installed-pills > button')).toHaveCount(7);
  const shelf = page.locator('.installed-pills > button').filter({ hasText: '1U vented shelf 1' });
  await expect(shelf).toContainText(`U${u}`);
  await selectInstalled(page, '1U vented shelf 1');
  await expect(
    page.locator('.inspector').getByRole('combobox', { name: 'Mounting face', exact: true }),
  ).toHaveValue(face);
}

async function focusMountingFace(page: Page, u: number, face: 'front' | 'rear') {
  await setView(page, face === 'front' ? 'Front' : 'Rear');
  await expect(viewState(page, face === 'front' ? 'Front' : 'Rear')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const cables = page.getByRole('button', { name: 'Show cables', exact: true });
  if ((await cables.getAttribute('aria-pressed')) === 'true') await cables.click();
  // Pan and orbit with real pointer controls; these do not modify the application model.
  const canvas = await page.locator('canvas').boundingBox();
  const label = await page
    .locator('.rack-u-label')
    .filter({ hasText: new RegExp(`^${String(u).padStart(2, '0')}$`) })
    .boundingBox();
  const neighbour = await page
    .locator('.rack-u-label')
    .filter({ hasText: new RegExp(`^${String(u - 1).padStart(2, '0')}$`) })
    .boundingBox();
  if (!canvas || !label || !neighbour)
    throw new Error('The canvas and adjacent U labels must be visible.');
  const centerX = canvas.x + canvas.width / 2;
  const centerY = canvas.y + canvas.height / 2;
  const focusedLocator = page
    .locator('.rack-u-label')
    .filter({ hasText: new RegExp(`^${String(u).padStart(2, '0')}$`) });
  const settle = async () => {
    const stable = await focusedLocator.evaluate(async (element) => {
      let previous = element.getBoundingClientRect();
      let stableFrames = 0;
      for (let frame = 0; frame < 120 && stableFrames < 4; frame++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const current = element.getBoundingClientRect();
        stableFrames =
          Math.hypot(current.x - previous.x, current.y - previous.y) < 0.15 ? stableFrames + 1 : 0;
        previous = current;
      }
      return stableFrames;
    });
    expect(stable, 'Camera projection must settle before deriving further input.').toBe(4);
  };
  // Begin in empty canvas space so orbiting cannot pick up a device.
  if (face === 'front') {
    const orbitX = canvas.x + canvas.width - 32;
    await page.mouse.move(orbitX, centerY);
    await page.mouse.down();
    await page.mouse.move(orbitX - 58, centerY + 16, { steps: 16 });
    await page.mouse.up();
  }
  await page.mouse.move(centerX, centerY);
  // The bundled controls use discrete wheel steps, so repeated real events zoom reliably.
  for (let step = 0; step < (face === 'rear' ? 8 : 18); step++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(30);
  }
  await expect(page.locator('.scene-placement-message')).toHaveCount(0);
  // Measure actual projection stability; fixed wall-clock waits vary with software WebGL speed.
  await settle();
  let focusedLabel = await focusedLocator.boundingBox();
  if (!focusedLabel) throw new Error('The mounting U label disappeared while zooming.');
  const pan = async (distanceY: number) => {
    await page.mouse.move(centerX, centerY);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(centerX, centerY + distanceY);
    await page.mouse.up({ button: 'right' });
    await settle();
  };
  // Measure the live camera response, then centre the chosen U using bounded real drags.
  const probeY = focusedLabel.y;
  await pan(20);
  focusedLabel = await focusedLocator.boundingBox();
  if (!focusedLabel) throw new Error('The mounting U label disappeared while panning.');
  let gain = (focusedLabel.y - probeY) / 20;
  for (let pass = 0; pass < 4; pass++) {
    const error = centerY - focusedLabel.y - focusedLabel.height / 2;
    if (Math.abs(error) < 30) break;
    if (!Number.isFinite(gain) || Math.abs(gain) < 0.01)
      throw new Error('The camera did not respond to actual pan input.');
    const move = Math.max(-250, Math.min(250, error / gain));
    const previousY = focusedLabel.y;
    await pan(move);
    focusedLabel = await focusedLocator.boundingBox();
    if (!focusedLabel)
      throw new Error('The mounting U label disappeared during camera correction.');
    gain = (focusedLabel.y - previousY) / move;
  }
  const finalLabel = await page
    .locator('.rack-u-label')
    .filter({ hasText: new RegExp(`^${String(u).padStart(2, '0')}$`) })
    .boundingBox();
  const finalNeighbour = await page
    .locator('.rack-u-label')
    .filter({ hasText: new RegExp(`^${String(u - 1).padStart(2, '0')}$`) })
    .boundingBox();
  if (!finalLabel || !finalNeighbour) throw new Error('The enlarged U labels must remain visible.');
  const beforePitch = Math.abs(label.y - neighbour.y);
  const afterPitch = Math.abs(finalLabel.y - finalNeighbour.y);
  expect(afterPitch, 'Actual wheel input must enlarge the visible rack grid.').toBeGreaterThan(
    beforePitch * 1.5,
  );
  expect(finalLabel.y).toBeGreaterThan(canvas.y);
  expect(finalLabel.y + finalLabel.height).toBeLessThan(canvas.y + canvas.height);
  console.info(
    `Mounting view ${face} U${u}: rendered U-label pitch ${beforePitch.toFixed(1)} → ${afterPitch.toFixed(1)} px.`,
  );
}

test('front patch panel and switch expose their rack ears against the mounting rails', async ({
  page,
}) => {
  await open(page);
  await selectInstalled(page, 'Network switch 1');
  await expect(page.locator('.inspector').getByLabel('Start U', { exact: true })).toHaveValue('16');
  await selectInstalled(page, 'Patch panel 1');
  await expect(page.locator('.inspector').getByLabel('Start U', { exact: true })).toHaveValue('18');
  await page
    .locator('.inspector')
    .getByRole('button', { name: 'Select rack', exact: true })
    .click();
  await focusMountingFace(page, 18, 'front');
  await page.locator('canvas').screenshot({ path: 'docs/screenshots/mounting-front.png' });
  await expect(page.locator('.installed-pills > button')).toHaveCount(6);
});

test('a 1U shelf mounts at the front with ears while its centre remains open', async ({ page }) => {
  await open(page);
  await placeShelf(page, 6, 'front');
  await page
    .locator('.inspector')
    .getByRole('button', { name: 'Select rack', exact: true })
    .click();
  await focusMountingFace(page, 6, 'front');
  await page.locator('canvas').screenshot({ path: 'docs/screenshots/mounting-shelf.png' });
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a 1U shelf mounts at the rear and retains its mounting face after local save and reload', async ({
  page,
}) => {
  await open(page);
  await placeShelf(page, 10, 'rear');
  await fileAction(page, 'Save');
  await expect(page.locator('.toolbar-save')).toContainText('Saved locally');
  await page.reload();
  await expect(page.locator('.installed-pills > button')).toHaveCount(7);
  await selectInstalled(page, '1U vented shelf 1');
  await expect(page.locator('.inspector').getByLabel('Start U', { exact: true })).toHaveValue('10');
  await expect(
    page.locator('.inspector').getByRole('combobox', { name: 'Mounting face', exact: true }),
  ).toHaveValue('rear');
  await page
    .locator('.inspector')
    .getByRole('button', { name: 'Select rack', exact: true })
    .click();
  await focusMountingFace(page, 10, 'rear');
  await page.locator('canvas').screenshot({ path: 'docs/screenshots/mounting-rear.png' });
  await expect(page.getByRole('alert')).toHaveCount(0);
});
