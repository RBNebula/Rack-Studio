import { test as base, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Project } from '../src/model';
import { fileAction } from './navigation';

const test = base.extend<{ uncaughtErrors: string[] }>({
  uncaughtErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
      expect(errors, 'Reference-model editing must not raise uncaught JavaScript errors.').toEqual(
        [],
      );
    },
    { auto: true },
  ],
});

test.setTimeout(90_000);
test.use({ baseURL: process.env.RACK_TEST_URL ?? 'http://127.0.0.1:5173' });
test.beforeAll(({ browser }) => {
  console.info(
    `Visual-reference QA: Microsoft Edge ${browser.version()}, 1600 × 1000, software WebGL.`,
  );
});

async function openReference(page: Page) {
  page.setDefaultTimeout(10_000);
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.rack-u-label').first()).toBeVisible();
  await page
    .getByLabel('Import project JSON', { exact: true })
    .setInputFiles(resolve('examples/flat-rack-reference.rack.json'));
  await expect(page.locator('.statusbar')).toContainText('Project imported');
  await expect(page.locator('.installed-pills > button')).toHaveCount(0);
  await expect(page.locator('.depth-section')).toHaveCount(1);
  await expect(page.locator('.rack-u-label')).toHaveCount(20);
}

async function number(field: Locator, value: number) {
  await field.fill(String(value));
  await field.press('Tab');
}

async function exported(page: Page): Promise<Project> {
  const pending = page.waitForEvent('download');
  await fileAction(page, 'Export project');
  const download = await pending;
  const path = await download.path();
  if (!path) throw new Error('The UI must produce a downloadable project.');
  return JSON.parse(await readFile(path, 'utf8')) as Project;
}

async function saveReload(page: Page, deviceCount: number) {
  await fileAction(page, 'Save');
  await expect(page.locator('.toolbar-save')).toContainText('Saved locally');
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.installed-pills > button')).toHaveCount(deviceCount);
}

async function place(page: Page, definitionName: string, u: number, face: 'front' | 'rear') {
  await page.getByRole('button', { name: `Place ${definitionName}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Place equipment precisely' });
  await number(dialog.getByLabel('Start U', { exact: true }), u);
  await dialog.getByRole('combobox', { name: 'Mounting face', exact: true }).selectOption(face);
  await expect(dialog.locator('.callout.good')).toContainText('No conflict detected');
  await dialog.getByRole('button', { name: 'Place equipment', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

async function focusPlates(page: Page, face: 'front' | 'rear', oblique: boolean) {
  const inspector = page.locator('.inspector');
  const selectRack = inspector.getByRole('button', { name: 'Select rack', exact: true });
  if (await selectRack.count()) await selectRack.click();
  await page
    .getByRole('button', { name: face === 'front' ? 'Front view' : 'Rear view', exact: true })
    .click();
  const canvas = await page.locator('canvas').boundingBox();
  if (!canvas) throw new Error('The rendered canvas must be visible.');
  const x = canvas.x + canvas.width / 2;
  const y = canvas.y + canvas.height / 2;
  const label = (u: number) =>
    page
      .locator('.rack-u-label')
      .filter({ hasText: new RegExp(`^${String(u).padStart(2, '0')}$`) });
  await page.waitForTimeout(250);
  const initial = await label(12).boundingBox();
  const neighbour = await label(11).boundingBox();
  if (!initial || !neighbour) throw new Error('The reference U labels must be rendered.');
  if (oblique) {
    // Orbit from empty space so the gesture cannot pick up a plate.
    await page.mouse.move(canvas.x + canvas.width - 28, y);
    await page.mouse.down();
    await page.mouse.move(canvas.x + canvas.width - 56, y + 8, { steps: 16 });
    await page.mouse.up();
  }
  await page.mouse.move(x, y);
  for (let step = 0; step < 11; step++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(650);
  const pan = async (distanceY: number) => {
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(x, y + distanceY);
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(350);
  };
  let current = await label(12).boundingBox();
  if (!current) throw new Error('The chosen U label must remain visible after zoom.');
  const probeY = current.y;
  await pan(20);
  current = await label(12).boundingBox();
  if (!current) throw new Error('The chosen U label must remain visible during pan.');
  let gain = (current.y - probeY) / 20;
  for (let pass = 0; pass < 4; pass++) {
    // Frame U11 and U12 together, with the solid blank above the perforated blank.
    const error = y - 35 - current.y - current.height / 2;
    if (Math.abs(error) < 20) break;
    if (!Number.isFinite(gain) || Math.abs(gain) < 0.01)
      throw new Error('The camera must respond to actual pan input.');
    const move = Math.max(-220, Math.min(220, error / gain));
    const previousY = current.y;
    await pan(move);
    current = await label(12).boundingBox();
    if (!current) throw new Error('The chosen U label disappeared during camera correction.');
    gain = (current.y - previousY) / move;
  }
  const final = await label(12).boundingBox();
  const finalNeighbour = await label(11).boundingBox();
  if (!final || !finalNeighbour) throw new Error('The enlarged reference labels must be visible.');
  const beforePitch = Math.abs(initial.y - neighbour.y);
  const afterPitch = Math.abs(final.y - finalNeighbour.y);
  expect(afterPitch, 'Real wheel input must enlarge the rendered plate detail.').toBeGreaterThan(
    beforePitch * 1.5,
  );
  console.info(
    `Reference plate view ${face}${oblique ? ' oblique' : ''}: rendered U pitch ${beforePitch.toFixed(1)} → ${afterPitch.toFixed(1)} px.`,
  );
}

test('flat reference rack has independent top and base panels whose settings persist', async ({
  page,
}) => {
  await openReference(page);
  const before = await exported(page);
  expect(before.rack).toMatchObject({
    heightU: 20,
    frameStyle: 'generic',
    holeType: 'square',
    endPanels: { top: true, base: true, thicknessMm: 2 },
    evidence: 'example',
  });
  expect(before.rack.sections).toHaveLength(1);
  expect(before.rack.sections[0]).toMatchObject({
    startU: 1,
    endU: 20,
    overallDepthMm: 800,
    frontRailZMm: 0,
    rearRailZMm: 700,
  });
  expect(before.rack.members).toHaveLength(0);
  await page.getByRole('button', { name: 'Orbit 3D view', exact: true }).click();
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click();
  const canvas = await page.locator('canvas').boundingBox();
  if (!canvas) throw new Error('The empty reference canvas must be visible.');
  await page.mouse.move(canvas.x + canvas.width - 30, canvas.y + canvas.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width - 30, canvas.y + canvas.height / 2 + 25, {
    steps: 20,
  });
  await page.mouse.up();
  await page.waitForTimeout(600);
  await page.locator('canvas').screenshot({ path: 'docs/screenshots/reference-flat-rack.png' });
  await page.getByRole('checkbox', { name: 'Include top plate', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Include base plate', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Apply rack configuration', exact: true }).click();
  const without = await exported(page);
  expect(without.rack.endPanels).toEqual({ top: false, base: false, thicknessMm: 2 });
  expect(without.rack.sections).toEqual(before.rack.sections);
  await saveReload(page, 0);
  await expect(
    page.getByRole('checkbox', { name: 'Include top plate', exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Include base plate', exact: true }),
  ).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Include top plate', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Include base plate', exact: true }).check();
  await number(page.getByRole('spinbutton', { name: /^End plate thickness \(mm\)/ }), 3);
  await page.getByRole('button', { name: 'Apply rack configuration', exact: true }).click();
  await saveReload(page, 0);
  const restored = await exported(page);
  expect(restored.rack.endPanels).toEqual({ top: true, base: true, thicknessMm: 3 });
  expect(restored.rack.sections).toEqual(before.rack.sections);
  expect(restored.rack.members).toEqual(before.rack.members);
  expect(restored.rack.railWidthMm).toBe(before.rack.railWidthMm);
  expect(restored.rack.railThicknessMm).toBe(before.rack.railThicknessMm);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('solid and perforated blanks place at both faces and preserve editable sheet geometry and identities', async ({
  page,
}) => {
  await openReference(page);
  const reference = await exported(page);
  const mesh = reference.definitions.find((definition) => definition.plate?.style === 'perforated');
  expect(mesh, 'The reference library must contain a generic perforated blank.').toBeTruthy();
  if (!mesh?.plate) throw new Error('A perforated plate definition is required.');
  for (const definition of reference.definitions.filter((item) => item.plate)) {
    expect(definition.ports).toHaveLength(0);
    expect(definition.evidence).toBe('example');
  }
  await page.getByRole('button', { name: `Edit ${mesh.name}`, exact: true }).click();
  const editor = page.getByRole('dialog');
  await number(editor.getByLabel('Round hole pitch (mm)', { exact: true }), 9);
  await editor.getByRole('button', { name: 'Save definition', exact: true }).click();
  await expect(editor).toHaveCount(0);
  for (const [name, u, face] of [
    ['1U blank plate', 12, 'front'],
    [mesh.name, 11, 'front'],
    ['2U blank plate', 8, 'front'],
    ['4U blank plate', 3, 'front'],
    ['1U blank plate', 12, 'rear'],
    [mesh.name, 11, 'rear'],
  ] as const) {
    await place(page, name, u, face);
  }
  await expect(page.locator('.installed-pills > button')).toHaveCount(6);
  const before = await exported(page);
  const edited = before.definitions.find((definition) => definition.id === mesh.id);
  expect(edited?.plate).toMatchObject({ style: 'perforated', holePitchMm: 9 });
  expect(edited?.ports).toHaveLength(0);
  expect(before.devices.map(({ startU, face }) => ({ startU, face }))).toEqual([
    { startU: 12, face: 'front' },
    { startU: 11, face: 'front' },
    { startU: 8, face: 'front' },
    { startU: 3, face: 'front' },
    { startU: 12, face: 'rear' },
    { startU: 11, face: 'rear' },
  ]);
  await saveReload(page, 6);
  const after = await exported(page);
  expect(after.devices).toEqual(before.devices);
  expect(after.definitions.find((definition) => definition.id === mesh.id)).toEqual(edited);
  expect(after.rack.endPanels).toEqual(before.rack.endPanels);
  await focusPlates(page, 'front', false);
  await page.locator('canvas').screenshot({ path: 'docs/screenshots/reference-blanks-front.png' });
  await focusPlates(page, 'rear', true);
  await page.locator('canvas').screenshot({ path: 'docs/screenshots/reference-blanks-rear.png' });
  await expect(page.getByRole('alert')).toHaveCount(0);
});
