import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Project } from '../src/model';
import { fileAction, openView, selectInstalled, setView } from './navigation';
test.use({ baseURL: process.env.RACK_TEST_URL ?? 'http://127.0.0.1:5173' });
test('sliding rails preserve cable identity, service extension and saved geometry', async ({
  page,
}) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(10000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.rack-u-label').first()).toBeVisible();
  await fileAction(page, 'New');
  async function exported(): Promise<Project> {
    const dl = page.waitForEvent('download');
    await fileAction(page, 'Export project');
    return JSON.parse(await readFile((await (await dl).path())!, 'utf8')) as Project;
  }
  for (const u of [8, 12]) {
    await page.getByRole('button', { name: 'Place User rack PC · 1U', exact: true }).click();
    const modal = page.getByRole('dialog');
    await modal.getByLabel('Start U', { exact: true }).fill(String(u));
    await modal.getByLabel('Start U', { exact: true }).press('Tab');
    await modal.getByRole('button', { name: 'Place equipment', exact: true }).click();
  }
  const initial = await exported();
  const [pc1, pc2] = initial.devices;
  await selectInstalled(page, 'User rack PC · 1U 1');
  await page.getByRole('checkbox', { name: 'Fit sliding rack rails', exact: true }).check();
  await expect(
    page.getByRole('checkbox', { name: 'Pull device forward on rails', exact: true }),
  ).not.toBeChecked();
  await setView(page, 'Left');
  await page.locator('canvas').screenshot({ path: 'docs/screenshots/device-rails-closed.png' });
  await openView(page, 'Connections');
  await page.getByRole('button', { name: 'New connection', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Cable ID', { exact: true }).fill('RAIL-USB');
  const source = { kind: 'device', deviceId: pc1.id, portId: 'front-usb-top' },
    destination = { kind: 'device', deviceId: pc2.id, portId: 'front-usb-top' };
  await modal
    .getByRole('combobox', { name: 'Source port', exact: true })
    .selectOption(JSON.stringify(source));
  await modal
    .getByRole('combobox', { name: 'Destination port', exact: true })
    .selectOption(JSON.stringify(destination));
  await modal.getByRole('button', { name: 'Connect ports', exact: true }).click();
  await page.getByLabel('Supplied length (mm)', { exact: true }).fill('300');
  await page.getByLabel('Supplied length (mm)', { exact: true }).press('Tab');
  await expect(page.locator('.schedule-table tbody')).not.toContainText('Insufficient length');
  const connected = await exported();
  await page
    .locator('.workspace-tabs')
    .getByRole('button', { name: '3D Rack Designer', exact: true })
    .click();
  await selectInstalled(page, 'User rack PC · 1U 1');
  await page.getByRole('checkbox', { name: 'Pull device forward on rails', exact: true }).check();
  await expect(page.locator('.inspector')).toContainText(
    'Chassis protrusion: 600 mm. Rail projection: 500 mm.',
  );
  await setView(page, 'Left');
  await page.locator('canvas').screenshot({ path: 'docs/screenshots/device-rails-extended.png' });
  const extended = await exported();
  expect(extended.devices.find((v) => v.id === pc1.id)?.rails?.extensionMm).toBe(600);
  expect(extended.cables).toEqual(connected.cables);
  expect(extended.cables[0].suppliedLengthMm).toBe(300);
  await fileAction(page, 'Save');
  await expect(page.locator('.toolbar-save')).toContainText('Saved locally');
  await page.reload();
  await expect(page.locator('.installed-pills > button')).toHaveCount(2);
  expect((await exported()).devices).toEqual(extended.devices);
  await openView(page, 'Connections');
  await expect(page.locator('.schedule-table tbody')).toContainText('Insufficient length');
  await page
    .locator('.workspace-tabs')
    .getByRole('button', { name: '3D Rack Designer', exact: true })
    .click();
  await selectInstalled(page, 'User rack PC · 1U 1');
  await page.getByRole('checkbox', { name: 'Pull device forward on rails', exact: true }).uncheck();
  expect((await exported()).devices.find((v) => v.id === pc1.id)?.rails?.extensionMm).toBe(0);
  await page.getByRole('checkbox', { name: 'Fit sliding rack rails', exact: true }).uncheck();
  expect((await exported()).devices.find((v) => v.id === pc1.id)?.rails).toBeUndefined();
  expect(errors).toEqual([]);
});
