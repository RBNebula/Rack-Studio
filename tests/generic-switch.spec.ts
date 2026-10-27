import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Project } from '../src/model';
import { fileAction, setView } from './navigation';

test.use({ baseURL: process.env.RACK_TEST_URL ?? 'http://127.0.0.1:5173' });
test.setTimeout(120000);
async function exported(page: Page): Promise<Project> {
  const event = page.waitForEvent('download');
  await fileAction(page, 'Export project');
  return JSON.parse(await readFile((await (await event).path())!, 'utf8'));
}
async function place(page: Page, name: string, u: number) {
  await page.getByRole('button', { name: `Place ${name}`, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Start U', { exact: true }).fill(String(u));
  await dialog.getByLabel('Start U', { exact: true }).press('Tab');
  await expect(dialog.locator('.callout.good')).toContainText('No conflict detected');
  await dialog.getByRole('button', { name: 'Place equipment', exact: true }).click();
}
async function connect(page: Page, source: object, destination: object, label: string) {
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Cable ID', { exact: true }).fill(label);
  await dialog
    .getByRole('combobox', { name: 'Source port', exact: true })
    .selectOption(JSON.stringify(source));
  await dialog
    .getByRole('combobox', { name: 'Destination port', exact: true })
    .selectOption(JSON.stringify(destination));
  await dialog.getByRole('button', { name: 'Connect ports', exact: true }).click();
}

async function capture(page: Page, face: 'front' | 'rear') {
  await page
    .getByRole('button', { name: face === 'front' ? 'Front view' : 'Rear view', exact: true })
    .click();
  const ortho = page.getByRole('button', { name: 'Orthographic camera', exact: true });
  if ((await ortho.getAttribute('aria-pressed')) !== 'true') await ortho.click();
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click();
  const canvas = (await page.locator('canvas').boundingBox())!,
    x = canvas.x + canvas.width / 2,
    y = canvas.y + canvas.height / 2;
  const label = page.locator('.rack-u-label').filter({ hasText: /^08$/ });
  const settle = () =>
    label.evaluate(async (e) => {
      let before = e.getBoundingClientRect().y,
        stable = 0;
      for (let i = 0; i < 120 && stable < 4; i++) {
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        const now = e.getBoundingClientRect().y;
        stable = Math.abs(now - before) < 0.15 ? stable + 1 : 0;
        before = now;
      }
    });
  await settle();
  const before = (await label.boundingBox())!,
    neighbour = (await page.locator('.rack-u-label').filter({ hasText: /^07$/ }).boundingBox())!;
  await page.mouse.move(x, y);
  for (let i = 0; i < 18; i++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(30);
  }
  await settle();
  const pan = async (delta: number) => {
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(x, y + delta);
    await page.mouse.up({ button: 'right' });
    await settle();
  };
  let current = (await label.boundingBox())!,
    previous = current.y;
  await pan(20);
  current = (await label.boundingBox())!;
  let gain = (current.y - previous) / 20;
  for (let i = 0; i < 6; i++) {
    const error = y - current.y - current.height / 2;
    if (Math.abs(error) < 10) break;
    expect(Math.abs(gain)).toBeGreaterThan(0.01);
    const delta = Math.max(-220, Math.min(220, error / gain));
    previous = current.y;
    await pan(delta);
    current = (await label.boundingBox())!;
    gain = (current.y - previous) / delta;
  }
  const finalNeighbour = (await page
    .locator('.rack-u-label')
    .filter({ hasText: /^07$/ })
    .boundingBox())!;
  expect(Math.abs(current.y - finalNeighbour.y)).toBeGreaterThan(
    Math.abs(before.y - neighbour.y) * 1.5,
  );
  await page.mouse.move(canvas.x + canvas.width - 15, canvas.y + canvas.height - 15);
  await page.screenshot({
    path: `docs/screenshots/generic-switch-${face}.png`,
    clip: {
      x: canvas.x,
      y: Math.max(
        canvas.y,
        Math.min(canvas.y + canvas.height - 200, current.y + current.height / 2 - 100),
      ),
      width: canvas.width,
      height: 200,
    },
  });
}

test('generic single-row switch adds to an existing library, connects RJ45/SFP/AC and preserves edited ports', async ({
  page,
}) => {
  page.setDefaultTimeout(10000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.rack-u-label').first()).toBeVisible();
  const old: Project = JSON.parse(await readFile('examples/wiring-guides.rack.json', 'utf8'));
  old.definitions = old.definitions.filter((d) => d.id !== 'def-generic-switch-24');
  await page.getByLabel('Import project JSON', { exact: true }).setInputFiles({
    name: 'existing-project.rack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(old)),
  });
  await page.getByRole('button', { name: 'Add generic 24-port switch', exact: true }).click();
  let p = await exported(page);
  expect(p.devices).toEqual(old.devices);
  expect(p.cables).toEqual(old.cables);
  const d = p.definitions.find((d) => d.id === 'def-generic-switch-24')!;
  expect(d.ports).toHaveLength(27);
  await place(page, d.name, 16);
  await place(page, d.name, 18);
  const pdu = p.definitions.find((d) => d.id === 'def-pdu')!;
  await place(page, pdu.name, 3);
  p = await exported(page);
  const switches = p.devices.filter((v) => v.definitionId === d.id),
    power = p.devices.find((v) => v.definitionId === pdu.id)!;
  const endpoint = (deviceId: string, portId: string) => ({ kind: 'device', deviceId, portId });
  await page.getByRole('button', { name: 'Orthographic camera', exact: true }).click();
  await setView(page, 'Front');
  await page.getByRole('button', { name: 'Wiring mode', exact: true }).click();
  for (const v of switches) {
    const pin = page.locator(`[data-port="${v.id}:sfp1"]`);
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
    if (v === switches[0])
      await expect(page.getByLabel('Wiring tools')).toContainText('Click the destination port');
  }
  p = await exported(page);
  expect(p.cables).toHaveLength(old.cables.length + 1);
  expect(p.cables.at(-1)?.source).toEqual(endpoint(switches[0].id, 'sfp1'));
  expect(p.cables.at(-1)?.destination).toEqual(endpoint(switches[1].id, 'sfp1'));
  await page.getByRole('button', { name: 'Wiring mode', exact: true }).click();
  await connect(
    page,
    endpoint(old.devices[0].id, 'rear-rj45'),
    endpoint(switches[0].id, 'p24'),
    'NETWORK',
  );
  await connect(page, endpoint(power.id, 'iec1'), endpoint(switches[0].id, 'power'), 'POWER');
  p = await exported(page);
  expect(p.cables).toHaveLength(old.cables.length + 3);
  // Edit one real socket without losing its identity or connection.
  await page.getByRole('button', { name: `Edit ${d.name}`, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox', { name: /^Visual model/ })).toHaveValue(
    'generic-switch-24',
  );
  await dialog.getByRole('button', { name: 'Ports (27)', exact: true }).click();
  await dialog.locator('.port-edit-row').first().getByLabel('Name', { exact: true }).fill('LAN 1');
  await dialog.getByRole('button', { name: 'Save definition', exact: true }).click();
  await fileAction(page, 'Save');
  await expect(page.locator('.toolbar-save')).toContainText('Saved locally');
  await page.reload();
  const restored = await exported(page);
  expect(restored.cables).toEqual(p.cables);
  expect(restored.definitions.find((v) => v.id === d.id)).toEqual({
    ...d,
    ports: d.ports.map((p, i) => (i === 0 ? { ...p, name: 'LAN 1' } : p)),
  });
  // Load the single-device reference for unobstructed front/rear visual review.
  await page
    .getByLabel('Import project JSON', { exact: true })
    .setInputFiles('examples/generic-switch-24.rack.json');
  await capture(page, 'front');
  await capture(page, 'rear');
  expect(errors).toEqual([]);
});
