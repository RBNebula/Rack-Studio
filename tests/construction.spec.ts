import { test as base, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Project } from '../src/model';
import { fileAction, openView, selectInstalled, setView } from './navigation';

const test = base.extend<{ uncaughtErrors: string[] }>({
  uncaughtErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
      expect(errors, 'Construction editing must not raise uncaught JavaScript errors.').toEqual([]);
    },
    { auto: true },
  ],
});

test.setTimeout(90_000);
test.use({ baseURL: process.env.RACK_TEST_URL ?? 'http://127.0.0.1:5173' });
test.beforeAll(({ browser }) => {
  console.info(
    `Construction QA: Microsoft Edge ${browser.version()}, 1600 × 1000, software WebGL.`,
  );
});

async function openBlank(page: Page) {
  page.setDefaultTimeout(10_000);
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.rack-u-label').first()).toBeVisible();
  await expect(page.locator('.installed-pills > button')).toHaveCount(6);
  await fileAction(page, 'New');
  await expect(page.locator('.installed-pills > button')).toHaveCount(0);
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

test('exterior envelope, rail planes and rail profile stay independently configurable through save and reload', async ({
  page,
}) => {
  await openBlank(page);
  const inspector = page.locator('.inspector');
  const section = inspector.locator('.depth-section').first();
  const spacing = section.getByRole('spinbutton', { name: /^Screw-plane depth \(mm\)/ });
  const initial = await exported(page);
  const initialSection = initial.rack.sections[0];
  const initialSpacing = initialSection.rearRailZMm - initialSection.frontRailZMm;
  await number(section.getByLabel('Illustrative exterior (mm)', { exact: true }), 1000);
  await expect(spacing).toHaveValue(String(initialSpacing));
  await number(section.getByLabel('Front screw-plane Z (mm)', { exact: true }), 25);
  await expect(spacing).toHaveValue(String(initialSpacing));
  await number(spacing, 760);
  await expect(section.getByLabel('Illustrative exterior (mm)', { exact: true })).toHaveValue(
    '1000',
  );
  await number(inspector.getByLabel('Rail face width (mm)', { exact: true }), 12);
  await number(inspector.getByLabel('Rail thickness (mm)', { exact: true }), 8);
  await inspector.getByRole('button', { name: 'Apply rack configuration', exact: true }).click();
  await expect(page.locator('.statusbar')).toContainText('Rack configuration updated.');
  let project = await exported(page);
  expect(project.rack).toMatchObject({
    frameMm: initial.rack.frameMm,
    railWidthMm: 12,
    railThicknessMm: 8,
  });
  expect(project.rack.sections[0]).toMatchObject({
    overallDepthMm: 1000,
    frontRailZMm: 25,
    rearRailZMm: 785,
  });
  expect(project.rack.evidence).not.toBe('verified');
  await saveReload(page, 0);
  project = await exported(page);
  expect(project.rack.sections[0]).toMatchObject({
    overallDepthMm: 1000,
    frontRailZMm: 25,
    rearRailZMm: 785,
  });
  await expect(page.getByLabel('Rail face width (mm)', { exact: true })).toHaveValue('12');
  await expect(page.getByLabel('Rail thickness (mm)', { exact: true })).toHaveValue('8');
  await page.getByRole('button', { name: 'Show measurements', exact: true }).click();
  await expect(page.locator('.scene-dimension')).not.toHaveCount(0);
  await page.screenshot({ path: 'docs/screenshots/construction-independent-rails.png' });
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('explicit structural channels require entered geometry and retain their identity and provisional evidence', async ({
  page,
}) => {
  await openBlank(page);
  const inspector = page.locator('.inspector');
  const members = inspector.getByRole('region', { name: 'Structural members', exact: true });
  await expect(members).toContainText('No explicit structural members defined.');
  await members.getByRole('button', { name: 'Add structural member', exact: true }).click();
  const draft = members.getByRole('group', { name: 'New structural member', exact: true });
  await expect(
    draft.getByRole('combobox', { name: 'New member profile', exact: true }),
  ).toHaveValue('');
  for (const field of [
    'New centre X (mm)',
    'New centre Y (mm)',
    'New centre Z (mm)',
    'New size X (mm)',
    'New size Y (mm)',
    'New size Z (mm)',
    'New wall thickness (mm)',
  ]) {
    await expect(draft.getByRole('spinbutton', { name: field })).toHaveValue('');
  }
  await draft.getByRole('button', { name: 'Add member to rack draft', exact: true }).click();
  await expect(draft.getByRole('alert')).toContainText('Enter all three centre coordinates');
  expect((await exported(page)).rack.members).toHaveLength(0);
  await draft.getByLabel('New member name', { exact: true }).fill('QA channel crossmember');
  await draft
    .getByRole('combobox', { name: 'New member profile', exact: true })
    .selectOption('channel');
  await draft
    .getByRole('combobox', { name: 'Profile extrusion axis', exact: true })
    .selectOption('x');
  await draft.getByRole('combobox', { name: 'Profile rotation', exact: true }).selectOption('1');
  for (const [axis, position, size] of [
    ['X', 0, 500],
    ['Y', 25, 30],
    ['Z', 400, 30],
  ] as const) {
    await draft.getByLabel(`New centre ${axis} (mm)`, { exact: true }).fill(String(position));
    await draft.getByLabel(`New size ${axis} (mm)`, { exact: true }).fill(String(size));
  }
  await draft.getByRole('spinbutton', { name: /^New wall thickness \(mm\)/ }).fill('3');
  await draft
    .getByRole('combobox', { name: 'Member measurement status', exact: true })
    .selectOption('example');
  await draft
    .getByRole('textbox', { name: 'Member source / measurement note', exact: true })
    .fill('Provisional QA geometry; no surveyed beam dimensions.');
  await draft.getByRole('button', { name: 'Add member to rack draft', exact: true }).click();
  await expect(draft).toHaveCount(0);
  await inspector.getByRole('combobox', { name: /^Frame construction/ }).selectOption('explicit');
  await inspector.getByRole('button', { name: 'Apply rack configuration', exact: true }).click();
  await expect(page.locator('.statusbar')).toContainText('Rack configuration updated.');
  let project = await exported(page);
  expect(project.rack.frameStyle).toBe('explicit');
  expect(project.rack.members).toHaveLength(1);
  const memberId = project.rack.members[0].id;
  expect(project.rack.members[0]).toMatchObject({
    name: 'QA channel crossmember',
    profile: 'channel',
    profileAxis: 'x',
    profileRotationQuarterTurns: 1,
    position: [0, 25, 400],
    size: [500, 30, 30],
    wallMm: 3,
    evidence: 'example',
    source: 'Provisional QA geometry; no surveyed beam dimensions.',
  });
  await saveReload(page, 0);
  project = await exported(page);
  expect(project.rack.frameStyle).toBe('explicit');
  expect(project.rack.members[0].id).toBe(memberId);
  await page
    .locator('.inspector details')
    .filter({ hasText: 'QA channel crossmember' })
    .locator('summary')
    .click();
  await expect(
    page.getByRole('combobox', { name: 'Member measurement status', exact: true }),
  ).toHaveValue('example');
  await page.screenshot({ path: 'docs/screenshots/construction-explicit-channel.png' });
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('generic shelf depth, usable depth and entered supports survive front and rear placements', async ({
  page,
}) => {
  await openBlank(page);
  await openView(page, 'Device Library');
  await page.getByRole('button', { name: 'Edit 1U vented shelf', exact: true }).click();
  const editor = page.getByRole('dialog');
  await expect(editor).toHaveAccessibleName('Device definition · 1U vented shelf');
  await editor.getByLabel('Device name', { exact: true }).fill('Configurable reference shelf');
  await editor
    .getByRole('textbox', { name: 'Specification source / verification notes', exact: true })
    .fill('Provisional QA shelf and support dimensions; not calibrated to a physical product.');
  await number(editor.getByLabel('Allocated height (U)', { exact: true }), 2);
  await expect(editor.getByLabel('Physical chassis height (mm)', { exact: true })).toHaveValue(
    '88.9',
  );
  await number(editor.getByLabel('Ear plane → rear fascia (mm)', { exact: true }), 350);
  await number(editor.getByLabel('Shelf usable depth (mm)', { exact: true }), 300);
  await editor
    .getByRole('combobox', { name: 'Shelf mounting arrangement', exact: true })
    .selectOption('additional-supports');
  await editor.getByRole('button', { name: 'Add configured shelf support', exact: true }).click();
  for (const field of [
    'New support x centre (mm)',
    'New support y centre (mm)',
    'New support z centre (mm)',
    'New support width (mm)',
    'New support height (mm)',
    'New support depth (mm)',
  ]) {
    await expect(editor.getByLabel(field, { exact: true })).toHaveValue('');
  }
  await editor.getByLabel('New shelf support name', { exact: true }).fill('QA support envelope');
  for (const [name, value] of [
    ['x centre', 222],
    ['y centre', 12],
    ['z centre', 170],
    ['width', 4],
    ['height', 8],
    ['depth', 300],
  ] as const) {
    await editor.getByLabel(`New support ${name} (mm)`, { exact: true }).fill(String(value));
  }
  await editor.getByRole('button', { name: 'Add shelf support', exact: true }).click();
  await expect(
    editor.getByRole('heading', { name: 'Additional shelf supports (1)' }),
  ).toBeVisible();
  await editor.screenshot({ path: 'docs/screenshots/construction-shelf-definition.png' });
  await editor.getByRole('button', { name: 'Save definition', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page
    .locator('.workspace-tabs')
    .getByRole('button', { name: '3D Rack Designer', exact: true })
    .click();
  for (const [u, face] of [
    [6, 'front'],
    [12, 'rear'],
  ] as const) {
    await page
      .getByRole('button', { name: 'Place Configurable reference shelf', exact: true })
      .click();
    const placement = page.getByRole('dialog', { name: 'Place equipment precisely' });
    await number(placement.getByLabel('Start U', { exact: true }), u);
    await placement
      .getByRole('combobox', { name: 'Mounting face', exact: true })
      .selectOption(face);
    await expect(placement.locator('.callout.good')).toContainText('No conflict detected');
    await placement.getByRole('button', { name: 'Place equipment', exact: true }).click();
    await expect(placement).toHaveCount(0);
  }
  await expect(page.locator('.installed-pills > button')).toHaveCount(2);
  const before = await exported(page);
  const shelf = before.definitions.find(
    (definition) => definition.name === 'Configurable reference shelf',
  );
  expect(shelf).toMatchObject({
    heightU: 2,
    heightMm: 88.9,
    depthMm: 350,
    evidence: 'example',
    shelf: { usableDepthMm: 300, supportMode: 'additional-supports' },
  });
  expect(shelf?.shelf?.supports).toHaveLength(1);
  expect(shelf?.shelf?.supports[0]).toMatchObject({
    name: 'QA support envelope',
    position: [222, 12, 170],
    size: [4, 8, 300],
  });
  expect(before.devices.map(({ startU, face }) => ({ startU, face }))).toEqual([
    { startU: 6, face: 'front' },
    { startU: 12, face: 'rear' },
  ]);
  await saveReload(page, 2);
  const after = await exported(page);
  expect(after.devices).toEqual(before.devices);
  expect(after.definitions.find((definition) => definition.id === shelf?.id)).toEqual(shelf);
  await selectInstalled(page, 'Configurable reference shelf 2');
  await expect(
    page.locator('.inspector').getByRole('combobox', { name: 'Mounting face', exact: true }),
  ).toHaveValue('rear');
  await setView(page, 'Rear');
  await page.screenshot({ path: 'docs/screenshots/construction-shelf-placements.png' });
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('pending shelf supports block saving and inactive supports stay absent when generation is disabled', async ({
  page,
}) => {
  await openBlank(page);
  await page.getByRole('button', { name: 'Edit 1U vented shelf', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor
    .getByRole('combobox', { name: 'Shelf mounting arrangement', exact: true })
    .selectOption('additional-supports');
  await editor.getByRole('button', { name: 'Add configured shelf support', exact: true }).click();
  await editor.getByRole('button', { name: 'Save definition', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Add or cancel the pending shelf support');
  await expect(editor).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
  await editor.getByLabel('New shelf support name', { exact: true }).fill('Inactive QA support');
  for (const [name, value] of [
    ['x centre', 222],
    ['y centre', 12],
    ['z centre', 170],
    ['width', 4],
    ['height', 8],
    ['depth', 300],
  ] as const) {
    await editor.getByLabel(`New support ${name} (mm)`, { exact: true }).fill(String(value));
  }
  await editor.getByRole('button', { name: 'Add shelf support', exact: true }).click();
  await editor
    .getByRole('combobox', { name: 'Shelf mounting arrangement', exact: true })
    .selectOption('front-only');
  await editor
    .getByRole('checkbox', {
      name: 'Generate shelf floor and side walls from dimensions',
      exact: true,
    })
    .uncheck();
  await editor.getByRole('button', { name: 'Save definition', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const project = await exported(page);
  const shelf = project.definitions.find((definition) => definition.name === '1U vented shelf');
  expect(shelf?.shelf).toBeNull();
  expect(shelf?.bodyMode).toBe('parts');
  expect(shelf?.parts.map((part) => part.name)).toContain('Parametric shelf floor');
  expect(shelf?.parts.map((part) => part.name)).not.toContain('Inactive QA support');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
