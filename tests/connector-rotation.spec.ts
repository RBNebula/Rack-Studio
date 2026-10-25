import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Project } from '../src/model';

test.use({ baseURL: process.env.RACK_TEST_URL ?? 'http://127.0.0.1:5173' });
test.setTimeout(120000);
async function exported(page: Page): Promise<Project> {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export project', exact: true }).click();
  return JSON.parse(await readFile((await (await event).path())!, 'utf8'));
}
async function clickPort(page: Page, device: string, port: string) {
  const pin = page.locator(`[data-port="${device}:${port}"]`);
  await expect(pin).toBeVisible();
  await pin.evaluate(async (e) => {
    let before = e.getBoundingClientRect(),
      stable = 0;
    for (let i = 0; i < 120 && stable < 5; i++) {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const now = e.getBoundingClientRect();
      stable = Math.hypot(now.x - before.x, now.y - before.y) < 0.1 ? stable + 1 : 0;
      before = now;
    }
  });
  const b = (await pin.boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
test('front/rear connector rotation, save-as-new, library edits and rotated native port connections persist', async ({
  page,
}) => {
  page.setDefaultTimeout(10000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.rack-u-label').first()).toBeVisible();
  const initial: Project = JSON.parse(await readFile('examples/wiring-guides.rack.json', 'utf8'));
  await page
    .getByLabel('Import project JSON', { exact: true })
    .setInputFiles('examples/wiring-guides.rack.json');
  const original = initial.definitions.find((d) => d.id === initial.devices[0].definitionId)!;
  await page.getByRole('button', { name: 'Device Model Designer', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Edit library model', exact: true })
    .selectOption(original.id);
  const face = page.getByLabel('Device face editor', { exact: true });
  await face.locator('[data-component-id="front-usb-top"]').click();
  const angle = page.getByRole('spinbutton', { name: /^Connector rotation/ }),
    rotate = page.getByRole('button', { name: 'Rotate connector 90°', exact: true });
  await rotate.click();
  await expect(angle).toHaveValue('90');
  await expect(face.locator('[data-component-id="front-usb-top"]')).toHaveAttribute(
    'transform',
    /^rotate\(90 /,
  );
  await page.screenshot({ path: 'docs/screenshots/connector-rotation-designer.png' });
  for (let i = 0; i < 3; i++) await rotate.click();
  await expect(angle).toHaveValue('0');
  await angle.fill('30');
  await angle.press('Tab');
  await page.getByRole('button', { name: 'Design rear', exact: true }).click();
  await face.locator('[data-component-id="rear-power"]').click();
  await rotate.click();
  await expect(angle).toHaveValue('90');
  await expect(face.locator('[data-component-id="rear-power"]')).toHaveAttribute(
    'transform',
    /^rotate\(90 /,
  );
  await page.getByRole('button', { name: 'Save as new', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('New model name', { exact: true }).fill('PC with rotated sockets');
  await dialog.getByRole('button', { name: 'Save as new', exact: true }).click();
  let p = await exported(page);
  const copy = p.definitions.find((d) => d.name === 'PC with rotated sockets')!;
  expect(copy.ports[0].rotationDeg).toBe(30);
  expect(copy.ports.find((port) => port.id === 'rear-power')?.rotationDeg).toBe(90);
  expect(p.definitions.find((d) => d.id === original.id)).toEqual(original);
  expect(p.cables).toEqual(initial.cables);
  await page.getByRole('button', { name: 'Device Library', exact: true }).click();
  await page.getByRole('button', { name: `Edit ${copy.name}`, exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: `Ports (${copy.ports.length})`, exact: true }).click();
  const row = dialog.locator('.port-edit-row').first(),
    libraryAngle = row.getByRole('spinbutton', { name: /^Connector rotation/ });
  await expect(libraryAngle).toHaveValue('30');
  await libraryAngle.fill('-45');
  await libraryAngle.press('Tab');
  await dialog.getByRole('button', { name: 'Save definition', exact: true }).click();
  p = await exported(page);
  expect(p.definitions.find((d) => d.id === copy.id)?.ports[0].rotationDeg).toBe(-45);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(
    (await exported(page)).definitions.find((d) => d.id === copy.id)?.ports[0].rotationDeg,
  ).toBe(30);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.getByRole('button', { name: `Place ${copy.name}`, exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Start U', { exact: true }).fill('16');
  await dialog.getByLabel('Start U', { exact: true }).press('Tab');
  await expect(dialog.locator('.callout.good')).toContainText('No conflict detected');
  await dialog.getByRole('button', { name: 'Place equipment', exact: true }).click();
  p = await exported(page);
  const device = p.devices.find((d) => d.definitionId === copy.id)!;
  await page.getByRole('button', { name: '3D Rack Designer', exact: true }).click();
  await page.getByRole('button', { name: 'Orthographic camera', exact: true }).click();
  await page.getByRole('button', { name: 'Front view', exact: true }).click();
  await page.getByRole('button', { name: 'Wiring mode', exact: true }).click();
  await clickPort(page, initial.devices[0].id, 'front-usb-bottom');
  await expect(page.getByLabel('Wiring tools')).toContainText('Click the destination port');
  await clickPort(page, device.id, 'front-usb-top');
  const connected = await exported(page);
  expect(connected.cables).toHaveLength(initial.cables.length + 1);
  expect(connected.cables.at(-1)?.destination).toEqual({
    kind: 'device',
    deviceId: device.id,
    portId: 'front-usb-top',
  });
  expect(connected.cables.slice(0, initial.cables.length)).toEqual(initial.cables);
  await page.getByRole('button', { name: 'Wiring mode', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toolbar-save')).toContainText('Saved locally');
  await page.reload();
  const restored = await exported(page);
  expect(restored.definitions).toEqual(connected.definitions);
  expect(restored.cables).toEqual(connected.cables);
  expect(restored.definitions.find((d) => d.id === original.id)).toEqual(original);
  expect(errors).toEqual([]);
});
