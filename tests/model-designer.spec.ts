import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test.use({ baseURL: process.env.RACK_TEST_URL ?? 'http://127.0.0.1:5173' });
test('isolated device designer, face drag/drop, library persistence and tray stretching', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('button', { name: 'Device Model Designer', exact: true }).click();
  await page.getByLabel('Model name', { exact: true }).fill('QA designed device');
  const face = page.getByLabel('Device face editor', { exact: true });
  const drop = async (kind: string, x: number, y: number) => {
    const data = await page.evaluateHandle((value) => {
      const d = new DataTransfer();
      d.setData('application/model-component', value);
      return d;
    }, kind);
    await face.dispatchEvent('drop', { dataTransfer: data, clientX: x, clientY: y });
  };
  let box = await face.boundingBox();
  if (!box) throw Error('Face editor missing');
  await drop('RJ45', box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.getByRole('button', { name: 'Design rear', exact: true }).click();
  box = await face.boundingBox();
  if (!box) throw Error('Face editor missing');
  await drop('fan', box.x + box.width * 0.7, box.y + box.height * 0.5);
  const previewBox = await page.locator('canvas').boundingBox();
  if (!previewBox) throw Error('3D model canvas missing');
  const usbData = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.setData('application/model-component', 'USB-A');
    return d;
  });
  await page.locator('canvas').dispatchEvent('drop', {
    dataTransfer: usbData,
    clientX: previewBox.x + previewBox.width / 2,
    clientY: previewBox.y + previewBox.height / 2,
  });
  await page.getByRole('button', { name: 'Save model to library', exact: true }).click();
  await expect(page.locator('.statusbar')).toContainText('Designer model saved');
  await page.locator('canvas').screenshot({ path: 'docs/screenshots/model-designer.png' });
  await page.getByRole('button', { name: '3D Rack Designer', exact: true }).click();
  await expect(page.locator('.rack-u-label').first()).toBeVisible();
  await page.getByRole('checkbox', { name: 'Include top plate', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Apply rack configuration', exact: true }).click();
  const canvas = page.locator('canvas');
  const cb = await canvas.boundingBox();
  if (!cb) throw Error('Rack canvas missing');
  const trayData = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.setData('application/rack-tray', 'pct110-reference');
    return d;
  });
  await page.getByLabel('3D rack viewport').dispatchEvent('drop', {
    dataTransfer: trayData,
    clientX: cb.x + cb.width / 2,
    clientY: cb.y + cb.height / 2,
  });
  await expect(page.getByLabel('Accessory name', { exact: true })).toHaveValue('tray 1');
  await page.getByRole('button', { name: 'Top view', exact: true }).click();
  const handle = page.locator('.tray-stretch-label');
  await expect(handle).toBeVisible();
  await handle.evaluate(async (el) => {
    let old = el.getBoundingClientRect();
    let stable = 0;
    for (let i = 0; i < 120 && stable < 4; i++) {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const rect = el.getBoundingClientRect();
      stable = Math.hypot(rect.x - old.x, rect.y - old.y) < 0.1 ? stable + 1 : 0;
      old = rect;
    }
  });
  const hb = await handle.boundingBox();
  if (!hb) throw Error('Stretch handle missing');
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 70, { steps: 16 });
  await page.mouse.up();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export project', exact: true }).click();
  const path = await (await download).path();
  const p = JSON.parse(await readFile(path!, 'utf8'));
  const d = p.definitions.find((v: { name: string }) => v.name === 'QA designed device');
  expect(d.ports).toHaveLength(2);
  expect(d.faceFeatures).toHaveLength(1);
  expect(d.faceFeatures[0].kind).toBe('fan');
  expect(p.accessories[0].perforated).toBe(true);
  expect(p.accessories[0].size[2]).not.toBe(400);
  await canvas.screenshot({ path: 'docs/screenshots/perforated-tray.png' });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toolbar-save')).toContainText('Saved locally');
  await page.reload();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export project', exact: true }).click();
  const restored = JSON.parse(await readFile((await (await dl).path())!, 'utf8'));
  expect(restored.accessories).toEqual(p.accessories);
  expect(restored.definitions.find((v: { id: string }) => v.id === d.id)).toEqual(d);
  expect(errors).toEqual([]);
});
