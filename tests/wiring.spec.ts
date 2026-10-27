import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Project } from '../src/model';
import { fileAction, setView } from './navigation';

test.use({ baseURL: process.env.RACK_TEST_URL ?? 'http://127.0.0.1:5173' });
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    await page.screenshot({ path: 'docs/validation/wiring-failure.png' });
    console.info(
      await page
        .getByRole('button', { name: 'Select guide Line 2 A', exact: true })
        .evaluate((button) => {
          const b = button.getBoundingClientRect();
          const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
          return {
            button: b.toJSON(),
            hit: hit?.outerHTML.slice(0, 1200),
            parent: hit?.parentElement?.outerHTML.slice(0, 1600),
          };
        })
        .catch(() => 'No line guide label'),
    );
  }
});
test('surface waypoints, line traversal, port wiring and ordered reusable links persist', async ({
  page,
}) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(10000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.rack-u-label').first()).toBeVisible();
  await fileAction(page, 'New');
  for (const u of [8, 12]) {
    await page.getByRole('button', { name: 'Place User rack PC · 1U', exact: true }).click();
    const modal = page.getByRole('dialog');
    await modal.getByLabel('Start U', { exact: true }).fill(String(u));
    await modal.getByLabel('Start U', { exact: true }).press('Tab');
    await modal.getByRole('button', { name: 'Place equipment', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Orthographic camera', exact: true }).click();
  await setView(page, 'Front');
  await page.getByRole('button', { name: 'Wiring mode', exact: true }).click();
  const initial = await exported(page),
    [pc1, pc2] = initial.devices;
  const selector = (id: string, port = 'front-usb-top') =>
    page.locator(`[data-port="${id}:${port}"]`);
  const position = async (id: string, port?: string) => {
    const pin = selector(id, port);
    await expect(pin).toBeVisible();
    const b = (await pin.boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  // Native canvas clicks at the DOM label projection; no application state injection.
  const a = await position(pc1.id),
    b = await position(pc2.id);
  await page.mouse.click(a.x, a.y);
  await expect(page.getByLabel('Wiring tools')).toContainText('Click the destination port');
  await page.mouse.click(b.x, b.y);
  await expect(page.getByLabel('Wiring cable')).not.toHaveValue('');
  const connected = await exported(page);
  expect(connected.cables).toHaveLength(1);
  const cable = connected.cables[0];
  expect(cable.source).toEqual({ kind: 'device', deviceId: pc1.id, portId: 'front-usb-top' });
  expect(cable.destination).toEqual({ kind: 'device', deviceId: pc2.id, portId: 'front-usb-top' });
  expect(cable.label).toBe('0');
  expect(cable.suppliedLengthMm).toBeNull();
  await expect(page.getByRole('spinbutton', { name: /^Supplied length \(mm\)/ })).toHaveValue('');
  // Calibrate screen/mm using real projected ports in the orthographic front view.
  const definition = initial.definitions.find((d) => d.id === pc1.definitionId)!;
  const port = definition.ports.find((p) => p.id === 'front-usb-top')!;
  const scale = (a.y - b.y) / ((pc2.startU - pc1.startU) * 44.45);
  const originY = (pc1.startU - 1) * 44.45 + (44.45 - definition.heightMm) / 2 + port.position[1];
  const projectPoint = (x: number, y: number) => ({
    x: a.x - (x - port.position[0]) * scale,
    y: a.y - (y - originY) * scale,
  });
  await page.getByRole('button', { name: 'Waypoints', exact: true }).click();
  const point = projectPoint(232.55, 450);
  await page.mouse.click(point.x, point.y);
  let saved = await exported(page);
  expect(saved.wiringGuides).toHaveLength(1);
  const g = saved.wiringGuides![0];
  expect(g.kind).toBe('point');
  if (g.kind !== 'point') throw new Error('Expected surface point');
  expect(g.position[0]).toBeCloseTo(232.55, 1);
  expect(g.position[1]).toBeCloseTo(450, 1);
  expect(g.position[2]).toBeCloseTo(-10, 4);
  const lineStart = projectPoint(-232.55, 400),
    lineEnd = projectPoint(-232.55, 440);
  await page.keyboard.down('Shift');
  await page.mouse.click(lineStart.x, lineStart.y);
  await page.keyboard.up('Shift');
  await expect(page.getByLabel('Wiring tools')).toContainText('Click the line end');
  await page.mouse.click(lineEnd.x, lineEnd.y);
  saved = await exported(page);
  expect(saved.wiringGuides).toHaveLength(2);
  const line = saved.wiringGuides![1];
  expect(line.kind).toBe('line');
  if (line.kind === 'line') {
    expect(line.start[2]).toBeCloseTo(-10, 4);
    expect(line.end[2]).toBeCloseTo(-10, 4);
  }
  await page.getByRole('button', { name: 'Link cable', exact: true }).click();
  await page.getByRole('button', { name: 'Select guide Point 1', exact: true }).click();
  await page.getByRole('button', { name: 'Select guide Line 2 A', exact: true }).click();
  await expect(page.getByLabel('Ordered cable guides')).toContainText('1. Point 1');
  await expect(page.getByLabel('Ordered cable guides')).toContainText('2. Line 2 A → B');
  await page.getByRole('button', { name: 'Reverse Line 2', exact: true }).click();
  await page.getByRole('button', { name: 'Move Line 2 earlier', exact: true }).click();
  await expect(page.getByLabel('Ordered cable guides')).toContainText('1. Line 2 B → A');
  await expect(page.locator('.scene-cable-label')).not.toContainText('Needs review');
  saved = await exported(page);
  expect(saved.cables[0].guideLinks).toEqual([
    { guideId: line.id, reverse: true },
    { guideId: g.id, reverse: false },
  ]);
  await page.getByRole('button', { name: 'Waypoints', exact: true }).click();
  await page.keyboard.down('Shift');
  await page.mouse.click(...(Object.values(projectPoint(-232.55, 720)) as [number, number]));
  await page.keyboard.up('Shift');
  await page.keyboard.press('Escape');
  expect((await exported(page)).wiringGuides).toEqual(saved.wiringGuides);
  await page.locator('canvas').screenshot({ path: 'docs/screenshots/wiring-guides.png' });
  // Rear surface normal points outward in +Z, independent of the camera's front-plane logic.
  await page.getByRole('button', { name: 'Connect ports', exact: true }).click();
  await setView(page, 'Rear');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const rearA = await position(pc1.id, 'rear-rj45'),
    rearB = await position(pc2.id, 'rear-rj45');
  const rearPort = definition.ports.find((p) => p.id === 'rear-rj45')!;
  const rearScale = (rearA.y - rearB.y) / ((pc2.startU - pc1.startU) * 44.45);
  const rearY = (pc1.startU - 1) * 44.45 + (44.45 - definition.heightMm) / 2 + rearPort.position[1];
  await page.getByRole('button', { name: 'Waypoints', exact: true }).click();
  await page.mouse.click(
    rearA.x + (232.55 - rearPort.position[0]) * rearScale,
    rearA.y - (600 - rearY) * rearScale,
  );
  saved = await exported(page);
  expect(saved.wiringGuides).toHaveLength(3);
  const rearGuide = saved.wiringGuides![2];
  if (rearGuide.kind !== 'point') throw new Error('Expected rear surface point');
  expect(rearGuide.position[2]).toBeCloseTo(810, 4);
  await fileAction(page, 'Save');
  await expect(page.locator('.toolbar-save')).toContainText('Saved locally');
  await page.reload();
  const reloaded = await exported(page);
  expect(reloaded.wiringGuides).toEqual(saved.wiringGuides);
  expect(reloaded.cables).toEqual(saved.cables);
  await page.getByRole('button', { name: 'Wiring mode', exact: true }).click();
  await page.getByLabel('Wiring cable').selectOption(cable.id);
  await page.getByRole('button', { name: 'Link cable', exact: true }).click();
  await expect(page.getByLabel('Ordered cable guides')).toContainText('Line 2 B → A');
  await page.getByRole('button', { name: 'Unlink Point 1', exact: true }).click();
  expect((await exported(page)).cables[0].guideLinks).toEqual([
    { guideId: line.id, reverse: true },
  ]);
  expect(errors).toEqual([]);
});

async function exported(page: Page): Promise<Project> {
  const event = page.waitForEvent('download');
  await fileAction(page, 'Export project');
  return JSON.parse(await readFile((await (await event).path())!, 'utf8')) as Project;
}
