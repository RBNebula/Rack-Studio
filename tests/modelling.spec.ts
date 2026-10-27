import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Project } from '../src/model';
import { fileAction, setView } from './navigation';
test.use({ baseURL: process.env.RACK_TEST_URL ?? 'http://127.0.0.1:5173' });
test.setTimeout(120000);
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus)
    await page.screenshot({ path: `docs/validation/modelling-failure-${info.line}.png` });
});
async function exported(page: Page): Promise<Project> {
  const event = page.waitForEvent('download');
  await fileAction(page, 'Export project');
  return JSON.parse(await readFile((await (await event).path())!, 'utf8')) as Project;
}
async function open(page: Page, emptyWires = false) {
  page.setDefaultTimeout(10000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.rack-u-label').first()).toBeVisible();
  const p = JSON.parse(await readFile('examples/wiring-guides.rack.json', 'utf8')) as Project;
  if (emptyWires) {
    p.cables = [];
    p.wiringGuides = [];
  }
  await page.getByLabel('Import project JSON', { exact: true }).setInputFiles({
    name: 'modelling-reference.rack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(page.locator('.installed-pills > button')).toHaveCount(2);
  await page.getByRole('button', { name: 'Orthographic camera', exact: true }).click();
  await setView(page, 'Front');
  return { p, errors };
}
async function settle(page: Page) {
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
}
async function fillNumber(page: Page, name: string, value: number, scope = '.model-tools-panel') {
  const field = page.locator(scope).getByLabel(name, { exact: true });
  await field.fill(String(value));
  await field.press('Tab');
}
async function centre(page: Page, selector: string) {
  const el = page.locator(selector);
  await expect(el).toBeVisible();
  await settle(page);
  const b = (await el.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test('direct guide dragging, tray rotation/free placement, duplication, alignment, visibility and measurement', async ({
  page,
}) => {
  const { p, errors } = await open(page);
  await page.getByRole('button', { name: 'Modelling tools', exact: true }).click();
  const tools = page.getByRole('complementary', { name: 'Modelling tools', exact: true });
  await tools.getByLabel('Model object', { exact: true }).selectOption('guide:guide-point');
  await tools.getByRole('button', { name: 'Move', exact: true }).click();
  const pivot = await centre(page, '[data-model-pivot="guide:guide-point"]');
  await page.mouse.move(pivot.x, pivot.y + 35);
  await page.mouse.down();
  await page.mouse.move(pivot.x, pivot.y - 25, { steps: 12 });
  await page.mouse.up();
  const moved = await exported(page);
  const old = p.wiringGuides![0],
    now = moved.wiringGuides![0];
  if (old.kind !== 'point' || now.kind !== 'point') throw Error('Expected point guide');
  expect(now.position[1]).toBeGreaterThan(old.position[1] + 20);
  await page.locator('summary').filter({ hasText: 'Add object' }).click();
  await page.getByRole('button', { name: 'Cable tray', exact: true }).click();
  const tray = (await exported(page)).accessories.at(-1)!;
  await fillNumber(page, 'World X (mm)', 450);
  await fillNumber(page, 'World Y (mm)', -180);
  await fillNumber(page, 'World Z (mm)', 400);
  await fillNumber(page, 'Rotate X (°)', 90);
  await tools.getByRole('checkbox', { name: 'Show ground plane', exact: true }).uncheck();
  const rotated = await exported(page);
  expect(rotated.accessories.at(-1)?.position).toEqual([450, -180, 400]);
  expect(rotated.accessories.at(-1)?.rotationDeg?.[0]).toBe(90);
  await page
    .locator('canvas')
    .screenshot({ path: 'docs/screenshots/modelling-tray-placement.png' });
  await tools.getByRole('button', { name: 'Duplicate object', exact: true }).click();
  let data = await exported(page);
  expect(data.accessories).toHaveLength(2);
  const copy = data.accessories.at(-1)!;
  expect(copy.id).not.toBe(tray.id);
  await tools.getByText('Align centres', { exact: true }).click();
  await tools.getByLabel('Alignment target', { exact: true }).selectOption(`accessory:${tray.id}`);
  await tools.getByRole('button', { name: 'Align Y', exact: true }).click();
  await tools.getByRole('button', { name: 'Hide selected', exact: true }).click();
  await expect(tools.getByLabel('Model object', { exact: true })).toHaveValue('');
  await tools.getByRole('button', { name: 'Show all objects', exact: true }).click();
  await tools.getByLabel('Model object', { exact: true }).selectOption(`accessory:${tray.id}`);
  await tools.getByRole('button', { name: 'Isolate selected', exact: true }).click();
  await expect(page.locator('.installed-pills > button')).toHaveCount(2);
  await tools.getByRole('button', { name: 'Show all objects', exact: true }).click();
  // Remove the two trays to restore the rack-only framing for a measured surface pick.
  for (const id of [copy.id, tray.id]) {
    await tools.getByLabel('Model object', { exact: true }).selectOption(`accessory:${id}`);
    await page.getByRole('button', { name: 'Remove accessory', exact: true }).click();
  }
  await tools.getByLabel('Model object', { exact: true }).selectOption('guide:guide-line');
  const line = (await exported(page)).wiringGuides!.find((g) => g.id === 'guide-line')!;
  if (line.kind !== 'line') throw Error('Expected line');
  const point = await centre(page, '[data-model-pivot="guide:guide-line"]');
  const u10 = (await page
      .locator('.rack-u-label')
      .filter({ hasText: '10' })
      .first()
      .boundingBox())!,
    u11 = (await page.locator('.rack-u-label').filter({ hasText: '11' }).first().boundingBox())!;
  const scale = (u10.y - u11.y) / 44.45,
    midpoint = (line.start[1] + line.end[1]) / 2;
  await tools.getByRole('button', { name: 'Measure', exact: true }).click();
  await page.mouse.click(point.x, point.y - (650 - midpoint) * scale);
  await page.mouse.click(point.x, point.y - (750 - midpoint) * scale);
  data = await exported(page);
  expect(data.measurements).toHaveLength(1);
  expect(
    Math.hypot(...data.measurements![0].end.map((v, i) => v - data.measurements![0].start[i])),
  ).toBeCloseTo(100, 1);
  await fileAction(page, 'Save');
  await expect(page.locator('.toolbar-save')).toContainText('Saved locally');
  await page.reload();
  expect((await exported(page)).measurements).toEqual(data.measurements);
  expect(errors).toEqual([]);
});

test('adjacent racks retain independent layouts and portable assemblies remap all identities', async ({
  page,
}) => {
  const { p, errors } = await open(page);
  await page.getByRole('button', { name: 'Modelling tools', exact: true }).click();
  const tools = page.getByRole('complementary', { name: 'Modelling tools', exact: true });
  await tools.getByText('Rack assemblies', { exact: true }).click();
  await tools.getByRole('button', { name: 'Add adjacent rack', exact: true }).click();
  let data = await exported(page);
  expect(data.additionalRacks).toHaveLength(1);
  const b = data.additionalRacks![0];
  expect(b.originMm).toEqual([650, 0, 0]);
  const name = page.locator('.inspector').getByLabel('Rack name', { exact: true });
  await name.fill('Rack B · independent');
  await page.getByRole('button', { name: 'Apply rack configuration', exact: true }).click();
  data = await exported(page);
  expect(data.rack.name).toBe(p.rack.name);
  expect(data.additionalRacks![0].name).toBe('Rack B · independent');
  await tools.getByLabel('Active rack', { exact: true }).selectOption(p.rack.id);
  await tools.getByRole('button', { name: 'Duplicate rack assembly', exact: true }).click();
  data = await exported(page);
  expect(data.additionalRacks).toHaveLength(2);
  expect(data.additionalRacks![1].originMm).toEqual([1300, 0, 0]);
  expect(data.devices).toHaveLength(4);
  expect(data.cables).toHaveLength(2);
  const beforeIds = data.devices.map((d) => d.id);
  const event = page.waitForEvent('download');
  await tools.getByRole('button', { name: 'Export rack assembly', exact: true }).click();
  const path = (await (await event).path())!;
  await tools.getByLabel('Import rack assembly JSON', { exact: true }).setInputFiles(path);
  data = await exported(page);
  expect(data.additionalRacks).toHaveLength(3);
  expect(data.devices).toHaveLength(6);
  expect(data.devices.slice(0, 4).map((d) => d.id)).toEqual(beforeIds);
  expect(new Set(data.devices.map((d) => d.id)).size).toBe(6);
  expect(data.cables).toHaveLength(3);
  await page
    .locator('canvas')
    .screenshot({ path: 'docs/screenshots/adjacent-rack-assemblies.png' });
  await fileAction(page, 'Save');
  await expect(page.locator('.toolbar-save')).toContainText('Saved locally');
  await page.reload();
  const restored = await exported(page);
  expect(restored.additionalRacks).toEqual(data.additionalRacks);
  expect(restored.cables).toEqual(data.cables);
  expect(errors).toEqual([]);
});

test('attached clips, shared bundle paths and a movable 3D vehicle endpoint retain real cable records', async ({
  page,
}) => {
  const { p, errors } = await open(page, true);
  for (const [index, port] of ['front-usb-top', 'front-usb-bottom'].entries()) {
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Cable ID', { exact: true }).fill(String(index));
    await dialog
      .getByRole('combobox', { name: 'Source port', exact: true })
      .selectOption(JSON.stringify({ kind: 'device', deviceId: p.devices[0].id, portId: port }));
    await dialog
      .getByRole('combobox', { name: 'Destination port', exact: true })
      .selectOption(JSON.stringify({ kind: 'device', deviceId: p.devices[1].id, portId: port }));
    await dialog.getByRole('button', { name: 'Connect ports', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Modelling tools', exact: true }).click();
  const tools = page.getByRole('complementary', { name: 'Modelling tools', exact: true });
  await tools.getByLabel('Model object', { exact: true }).selectOption(`rack:${p.rack.id}`);
  await settle(page);
  const pivot = await centre(page, `[data-model-pivot="rack:${p.rack.id}"]`),
    u10 = (await page.locator('.rack-u-label').filter({ hasText: '10' }).first().boundingBox())!,
    u11 = (await page.locator('.rack-u-label').filter({ hasText: '11' }).first().boundingBox())!;
  const scale = (u10.y - u11.y) / 44.45;
  for (const [i, y] of [400, 460].entries()) {
    await tools.getByRole('button', { name: i ? 'Place tie' : 'Place clip', exact: true }).click();
    await page.mouse.click(pivot.x + 232.55 * scale, pivot.y - y * scale);
    await expect(page.getByLabel('Fixing clear opening (mm)', { exact: true })).toBeVisible();
    await fillNumber(page, 'Fixing clear opening (mm)', 50, '.inspector');
  }
  let data = await exported(page);
  expect(data.accessories).toHaveLength(2);
  expect(data.accessories.every((a) => a.attachment?.id === p.rack.id)).toBe(true);
  await tools.getByText('Bundles and breakouts', { exact: true }).click();
  for (const n of ['0', '1'])
    await tools.getByRole('checkbox', { name: new RegExp(`^${n} ·`) }).check();
  await tools.getByRole('button', { name: 'Clip 1', exact: true }).click();
  await tools.getByRole('button', { name: 'Tie 2', exact: true }).click();
  await tools.getByRole('button', { name: 'Create cable bundle', exact: true }).click();
  data = await exported(page);
  expect(data.looms).toHaveLength(1);
  expect(data.looms[0].cableIds).toHaveLength(2);
  expect(data.cables).toHaveLength(2);
  await page.locator('canvas').screenshot({ path: 'docs/screenshots/attached-cable-bundle.png' });
  // A vehicle endpoint is independently positioned while its cable still passes through a rack exit.
  await page.getByRole('button', { name: 'Modelling tools', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Add object' }).click();
  await page.getByRole('button', { name: 'Rack cable exit', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Exit name', { exact: true }).fill('Vehicle exit');
  for (const [axis, value] of [
    ['x', -350],
    ['y', 400],
    ['z', 650],
  ] as const) {
    const f = dialog.getByLabel(`${axis} (mm)`, { exact: true });
    await f.fill(String(value));
    await f.press('Tab');
  }
  await dialog.getByRole('button', { name: 'Add exit', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Add object' }).click();
  await page.getByRole('button', { name: 'External destination', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Destination name', { exact: true }).fill('Vehicle network');
  await dialog
    .getByRole('checkbox', { name: 'Position vehicle endpoint in 3D', exact: true })
    .check();
  await dialog.getByLabel('Vehicle X (mm)', { exact: true }).fill('-850');
  await dialog.getByLabel('Vehicle X (mm)', { exact: true }).press('Tab');
  await dialog.getByRole('button', { name: 'Add destination', exact: true }).click();
  data = await exported(page);
  const vehicle = data.destinations[0];
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Cable ID', { exact: true }).fill('VEHICLE');
  await dialog
    .getByRole('combobox', { name: 'Source port', exact: true })
    .selectOption(
      JSON.stringify({ kind: 'device', deviceId: p.devices[0].id, portId: 'rear-rj45' }),
    );
  await dialog
    .getByRole('combobox', { name: 'Destination port', exact: true })
    .selectOption(
      JSON.stringify({ kind: 'external', destinationId: vehicle.id, portId: vehicle.ports[0].id }),
    );
  await dialog
    .getByRole('combobox', { name: 'Rack exit', exact: true })
    .selectOption(data.exits[0].id);
  await dialog.getByRole('button', { name: 'Connect ports', exact: true }).click();
  await expect(page.locator('.inspector')).toContainText(
    'Vehicle distance is included in the 3D route',
  );
  const before = await exported(page);
  await page.getByRole('button', { name: 'Modelling tools', exact: true }).click();
  await tools.getByLabel('Model object', { exact: true }).selectOption(`destination:${vehicle.id}`);
  await fillNumber(page, 'World X (mm)', -1250);
  const after = await exported(page);
  expect(after.destinations[0].position?.[0]).toBe(-1250);
  expect(after.cables).toEqual(before.cables);
  expect(after.cables).toHaveLength(3);
  expect(after.looms[0].cableIds).toHaveLength(2);
  await page
    .locator('canvas')
    .screenshot({ path: 'docs/screenshots/positioned-vehicle-endpoint.png' });
  await fileAction(page, 'Save');
  await expect(page.locator('.toolbar-save')).toContainText('Saved locally');
  await page.reload();
  const restored = await exported(page);
  expect(restored.destinations).toEqual(after.destinations);
  expect(restored.accessories).toEqual(after.accessories);
  expect(restored.looms).toEqual(after.looms);
  expect(errors).toEqual([]);
});
