import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { DeviceDefinition, Project } from '../src/model';
import { fileAction, openView, setView } from './navigation';

const definitionName = 'User rack PC · 1U';
const definitionId = 'def-user-rack-pc';
const test = base.extend<{ uncaughtErrors: string[] }>({
  uncaughtErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
      expect(
        errors,
        'The photographed PC workflow must not raise uncaught JavaScript errors.',
      ).toEqual([]);
    },
    { auto: true },
  ],
});

test.setTimeout(120_000);
test.use({ baseURL: process.env.RACK_TEST_URL ?? 'http://127.0.0.1:5173' });
test.beforeAll(({ browser }) => {
  console.info(
    `Photographed PC QA: Microsoft Edge ${browser.version()}, 1600 × 1000, software WebGL.`,
  );
});

async function openBlank(page: Page) {
  page.setDefaultTimeout(10_000);
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.rack-u-label').first()).toBeVisible();
  await fileAction(page, 'New');
  await expect(page.locator('.installed-pills > button')).toHaveCount(0);
}

async function exported(page: Page): Promise<Project> {
  const pending = page.waitForEvent('download');
  await fileAction(page, 'Export project');
  const path = await (await pending).path();
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

async function place(page: Page, name: string, u: number, face: 'front' | 'rear') {
  await page.getByRole('button', { name: `Place ${name}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Place equipment precisely' });
  const startU = dialog.getByLabel('Start U', { exact: true });
  await startU.fill(String(u));
  await startU.press('Tab');
  await dialog.getByRole('combobox', { name: 'Mounting face', exact: true }).selectOption(face);
  await expect(dialog.locator('.callout.good')).toContainText('No conflict detected');
  await dialog.getByRole('button', { name: 'Place equipment', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

function pcDefinition(project: Project): DeviceDefinition {
  const definition = project.definitions.find((item) => item.id === definitionId);
  if (!definition)
    throw new Error('The reusable photographed PC must be available in a new project.');
  return definition;
}

async function focusPC(page: Page, u: number, face: 'front' | 'rear', oblique = false) {
  const selectRack = page
    .locator('.inspector')
    .getByRole('button', { name: 'Select rack', exact: true });
  if (await selectRack.count()) await selectRack.click();
  await setView(page, face === 'front' ? 'Front' : 'Rear');
  const ortho = page.getByRole('button', { name: 'Orthographic camera', exact: true });
  if ((await ortho.getAttribute('aria-pressed')) !== 'true') await ortho.click();
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click();
  const cables = page.getByRole('button', { name: 'Show cables', exact: true });
  if ((await cables.getAttribute('aria-pressed')) === 'true') await cables.click();
  const canvas = await page.locator('canvas').boundingBox();
  if (!canvas) throw new Error('The rendered rack canvas must be visible.');
  const x = canvas.x + canvas.width / 2;
  const y = canvas.y + canvas.height / 2;
  const label = (number: number) =>
    page
      .locator('.rack-u-label')
      .filter({ hasText: new RegExp(`^${String(number).padStart(2, '0')}$`) });
  const settle = async () => {
    const stable = await label(u).evaluate(async (element) => {
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
  await settle();
  const initial = await label(u).boundingBox();
  const neighbour = await label(u - 1).boundingBox();
  if (!initial || !neighbour) throw new Error('The rendered rack grid must be available.');
  if (oblique) {
    // Use empty canvas space so this real orbit gesture cannot pick up equipment.
    await page.mouse.move(canvas.x + canvas.width - 24, y);
    await page.mouse.down();
    await page.mouse.move(canvas.x + canvas.width - 66, y + 14, { steps: 16 });
    await page.mouse.up();
  }
  await page.mouse.move(x, y);
  for (let step = 0; step < 18; step++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(30);
  }
  await settle();
  const pan = async (distanceY: number) => {
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(x, y + distanceY);
    await page.mouse.up({ button: 'right' });
    await settle();
  };
  let current = await label(u).boundingBox();
  if (!current) throw new Error('The selected U label must remain available after zoom.');
  const probeY = current.y;
  await pan(20);
  current = await label(u).boundingBox();
  if (!current) throw new Error('The selected U label must remain available while panning.');
  let gain = (current.y - probeY) / 20;
  for (let pass = 0; pass < 6; pass++) {
    const error = y - current.y - current.height / 2;
    if (Math.abs(error) < 20) break;
    if (!Number.isFinite(gain) || Math.abs(gain) < 0.01)
      throw new Error('The camera must respond to actual pan input.');
    const move = Math.max(-220, Math.min(220, error / gain));
    const previousY = current.y;
    await pan(move);
    current = await label(u).boundingBox();
    if (!current) throw new Error('The selected U label disappeared during camera correction.');
    gain = (current.y - previousY) / move;
  }
  const final = await label(u).boundingBox();
  const finalNeighbour = await label(u - 1).boundingBox();
  if (!final || !finalNeighbour) throw new Error('The enlarged rack grid must remain visible.');
  const beforePitch = Math.abs(initial.y - neighbour.y);
  const afterPitch = Math.abs(final.y - finalNeighbour.y);
  expect(afterPitch, 'Actual wheel events must enlarge the visible PC detail.').toBeGreaterThan(
    beforePitch * 1.5,
  );
  expect(final.y).toBeGreaterThan(canvas.y);
  expect(final.y + final.height).toBeLessThan(canvas.y + canvas.height);
  console.info(
    `PC view ${face}${oblique ? ' oblique' : ''} U${u}: rendered U pitch ${beforePitch.toFixed(1)} → ${afterPitch.toFixed(1)} px.`,
  );
}

async function captureFace(page: Page, path: string, u: number) {
  const canvas = await page.locator('canvas').boundingBox();
  if (!canvas) throw new Error('A rendered canvas is required for a face close-up.');
  const label = await page
    .locator('.rack-u-label')
    .filter({ hasText: new RegExp(`^${String(u).padStart(2, '0')}$`) })
    .boundingBox();
  if (!label) throw new Error('The focused U grid must remain visible.');
  // Crop the actual browser canvas around the face; no raster manipulation or generated image.
  await page.screenshot({
    path,
    clip: {
      x: canvas.x,
      y: Math.max(
        canvas.y,
        Math.min(canvas.y + canvas.height - 200, label.y + label.height / 2 - 100),
      ),
      width: canvas.width,
      height: 200,
    },
  });
}

test('photographed PC places at either rack face and preserves measured dimensions and front/rear ports', async ({
  page,
}) => {
  await openBlank(page);
  await page.getByRole('button', { name: `Edit ${definitionName}`, exact: true }).click();
  const editor = page.getByRole('dialog');
  await expect(editor.getByLabel('Allocated height (U)', { exact: true })).toHaveValue('1');
  await expect(editor.getByLabel('Physical chassis height (mm)', { exact: true })).toHaveValue(
    '43',
  );
  await expect(editor.getByLabel('Ear plane → rear fascia (mm)', { exact: true })).toHaveValue(
    '381',
  );
  await expect(editor.getByLabel('Faceplate / ears width (mm)', { exact: true })).toHaveValue(
    '482.6',
  );
  const visual = editor.getByRole('combobox', { name: /^Visual model/ });
  await expect(visual).toHaveValue('user-rack-pc');
  await editor.getByRole('combobox', { name: 'Solid geometry', exact: true }).selectOption('parts');
  await expect(visual).toHaveValue('generic');
  await expect(visual.locator('option[value="user-rack-pc"]')).toHaveAttribute('disabled', '');
  await editor.getByRole('combobox', { name: 'Solid geometry', exact: true }).selectOption('box');
  await visual.selectOption('user-rack-pc');
  await editor.getByRole('button', { name: 'Save definition', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await place(page, definitionName, 8, 'front');
  await place(page, definitionName, 12, 'rear');
  await expect(page.locator('.installed-pills > button')).toHaveCount(2);
  const before = await exported(page);
  const definition = pcDefinition(before);
  expect(definition).toMatchObject({
    name: definitionName,
    widthMm: 431.8,
    depthMm: 381,
    faceWidthMm: 482.6,
    heightU: 1,
    heightMm: 43,
  });
  expect(definition.evidence).not.toBe('verified');
  expect(definition.source).toMatch(/provisional|estimated|photo/i);
  const front = definition.ports.filter((port) => port.surface === 'front');
  const rear = definition.ports.filter((port) => port.surface === 'rear');
  expect(front).toHaveLength(2);
  expect(front.every((port) => /USB/i.test(port.connector))).toBe(true);
  expect(front.map((port) => port.id)).toEqual(['front-usb-top', 'front-usb-bottom']);
  expect(front[0].position[0]).toBeCloseTo(front[1].position[0], 0);
  expect(front[0].position[1]).toBeGreaterThan(front[1].position[1]);
  expect(front.every((port) => port.position[2] === -2)).toBe(true);
  expect(rear).toHaveLength(15);
  expect(rear.filter((port) => /USB/i.test(port.connector))).toHaveLength(6);
  expect(rear.filter((port) => port.connector === 'RJ45')).toHaveLength(1);
  expect(rear.filter((port) => /VGA/i.test(port.connector))).toHaveLength(1);
  expect(rear.filter((port) => /IEC/i.test(port.connector))).toHaveLength(1);
  expect(rear.every((port) => port.position[2] === 381)).toBe(true);
  expect(rear.find((port) => port.id === 'rear-video-top')?.connector).toBe('DisplayPort');
  expect(rear.find((port) => port.id === 'rear-rj45')?.position).toEqual([10.2, 32, 381]);
  expect(new Set(definition.ports.map((port) => port.id)).size).toBe(17);
  await saveReload(page, 2);
  const after = await exported(page);
  expect(after.devices).toEqual(before.devices);
  expect(pcDefinition(after)).toEqual(definition);
  await focusPC(page, 8, 'front');
  await captureFace(page, 'docs/screenshots/user-pc-front.png', 8);
  await focusPC(page, 8, 'rear');
  await captureFace(page, 'docs/screenshots/user-pc-rear.png', 8);
  await focusPC(page, 8, 'front', true);
  await page.locator('canvas').screenshot({ path: 'docs/screenshots/user-pc-oblique.png' });
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a PC library import adds the photographed model to an existing rack without changing old devices or cables', async ({
  page,
}) => {
  page.setDefaultTimeout(10_000);
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await page
    .getByLabel('Import project JSON', { exact: true })
    .setInputFiles(resolve('examples/route-follow.rack.json'));
  await expect(page.locator('.statusbar')).toContainText('Project imported');
  await expect(page.locator('.installed-pills > button')).toHaveCount(3);
  const before = await exported(page);
  expect(before.definitions.some((definition) => definition.appearance === 'user-rack-pc')).toBe(
    false,
  );
  await openView(page, 'Device Library');
  await page
    .locator('.library.expanded input[type="file"]')
    .setInputFiles(resolve('examples/user-rack-pc.library.json'));
  await expect(page.locator('.statusbar')).toContainText('Library imported.');
  await expect(
    page.getByRole('button', { name: `Edit ${definitionName}`, exact: true }),
  ).toBeVisible();
  await page
    .locator('.workspace-tabs')
    .getByRole('button', { name: '3D Rack Designer', exact: true })
    .click();
  await place(page, definitionName, 10, 'front');
  const imported = await exported(page);
  const definition = imported.definitions.find((item) => item.appearance === 'user-rack-pc');
  expect(definition).toMatchObject({
    name: definitionName,
    widthMm: 431.8,
    depthMm: 381,
    faceWidthMm: 482.6,
    heightU: 1,
    appearance: 'user-rack-pc',
  });
  expect(definition?.ports).toHaveLength(17);
  expect(
    imported.devices.filter((device) =>
      before.devices.some((original) => original.id === device.id),
    ),
  ).toEqual(before.devices);
  expect(imported.cables).toEqual(before.cables);
  expect(
    imported.definitions.filter((item) =>
      before.definitions.some((original) => original.id === item.id),
    ),
  ).toEqual(before.definitions);
  const pc = imported.devices.find((device) => device.definitionId === definition?.id);
  expect(pc).toMatchObject({ startU: 10, face: 'front' });
  await saveReload(page, 4);
  const after = await exported(page);
  expect(after.devices).toEqual(imported.devices);
  expect(after.cables).toEqual(before.cables);
  expect(after.definitions.find((item) => item.id === definition?.id)).toEqual(definition);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a photographed rear network port connects through the UI and retains identity after a PC move and save/reload', async ({
  page,
}) => {
  await openBlank(page);
  await place(page, definitionName, 8, 'front');
  await place(page, '24-port network switch', 16, 'front');
  const initial = await exported(page);
  const pc = initial.devices.find((device) => device.definitionId === definitionId);
  const pcPort = pcDefinition(initial).ports.find(
    (port) => port.surface === 'rear' && port.connector === 'RJ45',
  );
  const networkSwitch = initial.devices.find((device) => device.id !== pc?.id);
  const switchPort = initial.definitions
    .find((definition) => definition.id === networkSwitch?.definitionId)
    ?.ports.find((port) => port.connector === 'RJ45');
  if (!pc || !pcPort || !networkSwitch || !switchPort)
    throw new Error('The measured PC network port and a compatible switch port are required.');
  expect(pcPort.id).toBe('rear-rj45');
  const source = { kind: 'device', deviceId: pc.id, portId: pcPort.id };
  const destination = { kind: 'device', deviceId: networkSwitch.id, portId: switchPort.id };
  await openView(page, 'Connections');
  await page.getByRole('button', { name: 'New connection', exact: true }).click();
  const connection = page.getByRole('dialog', { name: 'New cable connection' });
  await connection.getByLabel('Cable ID', { exact: true }).fill('QA-PC-LAN');
  await connection
    .getByRole('combobox', { name: 'Source port', exact: true })
    .selectOption(JSON.stringify(source));
  await connection
    .getByRole('combobox', { name: 'Destination port', exact: true })
    .selectOption(JSON.stringify(destination));
  await connection.getByLabel('Purpose', { exact: true }).fill('Photographed PC rear Ethernet');
  await connection.getByRole('button', { name: 'Connect ports', exact: true }).click();
  await expect(connection).toHaveCount(0);
  await expect(page.locator('.schedule-table tbody > tr')).toHaveCount(1);
  await expect(page.locator('.schedule-table tbody')).toContainText(pcPort.name);
  await expect(page.locator('.schedule-table tbody')).not.toContainText('Route invalid');
  const connected = await exported(page);
  expect(connected.cables[0]).toMatchObject({ label: 'QA-PC-LAN', source, destination });
  const cableId = connected.cables[0].id;
  await page
    .locator('.workspace-tabs')
    .getByRole('button', { name: '3D Rack Designer', exact: true })
    .click();
  await page
    .locator('.installed-pills > button')
    .filter({ hasText: `${definitionName} 1` })
    .click();
  const startU = page.locator('.inspector').getByLabel('Start U', { exact: true });
  await startU.fill('9');
  await startU.press('Tab');
  await page.getByRole('button', { name: 'Apply position', exact: true }).click();
  await expect(page.locator('.statusbar')).toContainText('connected cable routes recalculated');
  await saveReload(page, 2);
  const after = await exported(page);
  expect(after.devices.find((device) => device.id === pc.id)?.startU).toBe(9);
  expect(after.cables[0]).toMatchObject({ id: cableId, label: 'QA-PC-LAN', source, destination });
  expect(pcDefinition(after).ports).toEqual(pcDefinition(connected).ports);
  await openView(page, 'Connections');
  const row = page.locator('.schedule-table tbody > tr');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(pcPort.name);
  await expect(row).not.toContainText('Route invalid');
  await row.getByRole('button', { name: 'QA-PC-LAN', exact: true }).click();
  await expect(page.locator('.length-breakdown dd strong')).not.toContainText('Unknown');
  const csvPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const csvPath = await (await csvPending).path();
  if (!csvPath) throw new Error('The schedule must download through the actual UI.');
  const csv = await readFile(csvPath, 'utf8');
  expect(csv).toContain('QA-PC-LAN');
  expect(csv).toContain(pcPort.name);
  expect(csv).not.toContain('Route invalid');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
