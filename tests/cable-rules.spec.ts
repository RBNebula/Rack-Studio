import { test as base, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Cable, DeviceDefinition, Project } from '../src/model';
import { routeCable } from '../src/engineering/routing';

/**
 * Regression workflows for the connector-lead bend-radius fix and gendered IEC 60320 couplers:
 * explicit radii at a C14 inlet -> AP7922B C13 outlet (both variants, both mounting faces), an
 * impossible radius keeps an unknown cut, outlet-to-outlet refusal in wiring mode, and a stored
 * outlet-to-outlet cable that still loads, is flagged and stays editable.
 */
const test = base.extend<{ uncaughtErrors: string[] }>({
  uncaughtErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
      expect(errors, 'The browser must not raise uncaught JavaScript errors.').toEqual([]);
    },
    { auto: true },
  ],
});
test.setTimeout(420_000);
test.use({ baseURL: process.env.RACK_TEST_URL ?? 'http://127.0.0.1:5173' });

const GENDER_MESSAGE = 'Two IEC-C13 couplers cannot mate: IEC 60320 connectors are gendered.';
const VARIANTS = [
  { file: 'apc-ap7922b-outlets-front', name: 'APC AP7922B Switched PDU · 2U · outlets front' },
  { file: 'apc-ap7922b-outlets-inward', name: 'APC AP7922B Switched PDU · 2U · outlets inward' },
] as const;

async function open(page: Page) {
  // Software WebGL compiles shader programs on first use; allow for that stall.
  page.setDefaultTimeout(45_000);
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.rack-u-label').first()).toBeVisible();
  await expect(page.locator('.installed-pills > button')).toHaveCount(6);
}
async function blurNumber(field: Locator, value: number | string) {
  await field.fill(String(value));
  await field.press('Tab');
}
async function exported(page: Page): Promise<Project> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export project', exact: true }).click();
  const path = await (await pending).path();
  if (!path) throw new Error('The browser did not produce a local download.');
  return JSON.parse(await readFile(path, 'utf8')) as Project;
}
const tab = (page: Page, name: string | RegExp) =>
  page.locator('.workspace-tabs').getByRole('button', { name, exact: typeof name === 'string' });
const inspector = (page: Page) => page.locator('.inspector');
async function importLibrary(page: Page, file: string) {
  await tab(page, 'Device Library').click();
  await page
    .locator('label.button', { hasText: 'Import library' })
    .locator('input[type=file]')
    .setInputFiles(resolve(`library/${file}.library.json`));
  await expect(page.locator('.statusbar')).toContainText('Library imported.');
  await tab(page, '3D Rack Designer').click();
}
async function place(page: Page, name: string, startU: number, face: 'front' | 'rear') {
  await page.getByRole('button', { name: `Place ${name}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Place equipment precisely' });
  await dialog.getByRole('combobox', { name: 'Mounting face', exact: true }).selectOption(face);
  await blurNumber(dialog.getByLabel('Start U', { exact: true }), startU);
  await dialog.getByRole('button', { name: 'Place equipment', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
async function connect(page: Page, source: string, destination: string) {
  await tab(page, 'Connections').click();
  await page.getByRole('button', { name: 'New connection', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New cable connection' });
  await dialog.getByRole('combobox', { name: 'Source port', exact: true }).selectOption({
    label: source,
  });
  await dialog.getByRole('combobox', { name: 'Destination port', exact: true }).selectOption({
    label: destination,
  });
  await dialog.getByRole('button', { name: 'Connect ports', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.statusbar')).toContainText('Cable connection created.');
}
const cableBadge = (page: Page) => inspector(page).locator('.cable-heading .badge');
const lengthValue = (page: Page, term: string) =>
  inspector(page)
    .locator('.length-breakdown dt', { hasText: term })
    .locator('xpath=following-sibling::dd[1]');

for (const variant of VARIANTS) {
  for (const face of ['front', 'rear'] as const) {
    test(`${variant.file} on the ${face} face: explicit 28/35/50 mm radii route from a C14 inlet; 400 mm keeps an unknown cut`, async ({
      page,
    }) => {
      await open(page);
      await importLibrary(page, variant.file);
      // U1-2 is free at both faces of the default workspace rack.
      await place(page, variant.name, 1, face);
      const pdu = `${variant.name} 1`;
      await connect(page, 'Server 1 · IEC power', `${pdu} · Outlet 1`);
      // The new cable is selected in the inspector.
      await expect(inspector(page).locator('.connection-label')).toContainText(`${pdu} · Outlet 1`);
      await inspector(page).getByLabel('Minimum bend radius specified').check();
      const radiusField = inspector(page).getByRole('spinbutton', {
        name: /^Minimum bend radius \(mm\)/,
      });
      for (const radius of [28, 35, 50]) {
        await blurNumber(radiusField, radius);
        await expect(radiusField).toHaveValue(String(radius));
        // The same exported project, routed independently, gives the declared radius on every arc.
        const project = await exported(page);
        const cable = project.cables.find(
          (c) => c.destination.kind === 'device' && c.destination.portId === 'outlet-1',
        )!;
        expect(cable.minBendRadiusMm).toBe(radius);
        const route = routeCable(project, cable);
        expect(route.valid, `${variant.file}/${face}/${radius}: ${route.issues.join('; ')}`).toBe(
          true,
        );
        await expect(cableBadge(page)).not.toHaveText('Route invalid');
        await expect(inspector(page).locator('.callout')).not.toContainText(
          /bend radius does not fit|intersects|No automatic route|reversal/,
        );
        const arcs = route.segments.filter((s) => s.kind === 'arc');
        expect(arcs.length).toBeGreaterThan(0);
        for (const arc of arcs) expect(arc.radiusMm).toBeCloseTo(radius, 6);
        expect(route.minRadiusMm).toBeCloseTo(radius, 6);
        // The inspector shows the same modelled route length (to its 10 mm display precision).
        await expect(lengthValue(page, 'Modelled rack route')).toHaveText(
          `${(route.lengthMm / 1000).toFixed(2)} m`,
        );
      }
      // An impossible radius is reported invalid and the cut stays unknown, never zero.
      await blurNumber(radiusField, 400);
      await expect(cableBadge(page)).toHaveText('Route invalid');
      await expect(inspector(page).locator('.callout')).toContainText(
        'The 400.0 mm bend radius does not fit between adjacent routing constraints.',
      );
      await expect(lengthValue(page, 'Required length')).toHaveText('Unknown');
      await tab(page, /Cable Schedule/).click();
      const table = page.locator('.schedule-table table');
      const headers = await table.locator('thead th').allInnerTexts();
      const requiredColumn = headers.findIndex((h) => h.startsWith('Required (mm)'));
      expect(requiredColumn).toBeGreaterThan(0);
      const row = table.locator('tbody tr', { hasText: `${pdu} · Outlet 1` });
      await expect(row).toContainText('Route invalid');
      await expect(row.locator('td').nth(requiredColumn)).toHaveText('Unknown');
    });
  }
}

test('wiring mode refuses outlet -> outlet with the gender message and accepts outlet -> inlet', async ({
  page,
}) => {
  await open(page);
  const before = await exported(page);
  await page.getByRole('button', { name: 'Orthographic camera', exact: true }).click();
  await page.getByRole('button', { name: 'Rear view', exact: true }).click();
  await page.getByRole('button', { name: 'Wiring mode', exact: true }).click();
  const click = async (deviceId: string, portId: string) => {
    const pin = page.locator(`[data-port="${deviceId}:${portId}"]`);
    await expect(pin).toBeVisible();
    const b = (await pin.boundingBox())!;
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  };
  await click('pdu-1', 'iec1');
  await expect(page.getByLabel('Wiring tools')).toContainText('Click the destination port');
  await click('pdu-1', 'iec2');
  await expect(page.getByRole('alert')).toContainText(GENDER_MESSAGE);
  expect((await exported(page)).cables).toEqual(before.cables);
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
  // The source is still armed; a C14 inlet completes the connection.
  await click('server-1', 'power');
  await expect(page.getByLabel('Wiring cable')).not.toHaveValue('');
  const after = await exported(page);
  expect(after.cables).toHaveLength(before.cables.length + 1);
  const created = after.cables.at(-1)!;
  expect(created.source).toEqual({ kind: 'device', deviceId: 'pdu-1', portId: 'iec1' });
  expect(created.destination).toEqual({ kind: 'device', deviceId: 'server-1', portId: 'power' });
  // The connection dialog also refuses two sockets.
  await tab(page, 'Connections').click();
  await page.getByRole('button', { name: 'New connection', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New cable connection' });
  await dialog
    .getByRole('combobox', { name: 'Source port', exact: true })
    .selectOption({ label: 'Rear PDU 1 · Outlet 3' });
  await dialog
    .getByRole('combobox', { name: 'Destination port', exact: true })
    .selectOption({ label: 'Rear PDU 1 · Outlet 4' });
  await expect(dialog.locator('.callout.error')).toContainText(GENDER_MESSAGE);
  await dialog.getByRole('button', { name: 'Connect ports', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(GENDER_MESSAGE);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await exported(page)).cables).toEqual(after.cables);
});

test('an imported C13-C13 cable loads, is flagged outlet-to-outlet, survives move/undo/reload, and a retyped inlet is refused', async ({
  page,
}) => {
  await open(page);
  const project = await exported(page);
  const [definition] = JSON.parse(
    await readFile(resolve('library/apc-ap7922b-outlets-front.library.json'), 'utf8'),
  ) as DeviceDefinition[];
  project.definitions.push(definition);
  project.devices.push({
    ...project.devices.find((d) => d.id === 'pdu-1')!,
    id: 'ap-1',
    definitionId: definition.id,
    name: 'AP7922B 1',
    startU: 13,
    face: 'front',
  });
  const template = project.cables[0];
  const cable = (
    id: string,
    label: string,
    source: Cable['source'],
    destination: Cable['destination'],
  ): Cable => ({
    ...template,
    id,
    label,
    name: `Cable ${label}`,
    type: 'Power',
    source,
    destination,
    waypoints: [],
    guideLinks: [],
    followCableId: null,
    exitId: null,
    externalLengthMm: null,
  });
  const outlet = (n: number) => ({
    kind: 'device' as const,
    deviceId: 'ap-1',
    portId: `outlet-${n}`,
  });
  project.cables.push(
    cable('legacy-c13-c13', 'L1', outlet(1), outlet(2)),
    cable('feed-1', 'F1', outlet(3), { kind: 'device', deviceId: 'server-1', portId: 'power' }),
  );
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.locator('.installed-pills > button')).toHaveCount(0);
  await page.getByLabel('Import project JSON', { exact: true }).setInputFiles({
    name: 'legacy-outlet-to-outlet.rack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.locator('.installed-pills > button')).toHaveCount(7);
  const imported = await exported(page);
  expect(imported.cables.map((c) => [c.id, c.source, c.destination])).toEqual(
    project.cables.map((c) => [c.id, c.source, c.destination]),
  );
  const powerIssues = page.getByTestId('power-issues');
  await expect(powerIssues).toBeVisible();
  await expect(powerIssues).toHaveAttribute(
    'title',
    /Cable L1 joins two banked outlets; it is not counted as a power feed\./,
  );

  // An unrelated move is accepted, then undone.
  await page.locator('.installed-pills > button').filter({ hasText: 'Server 1' }).click();
  await blurNumber(inspector(page).getByLabel('Start U', { exact: true }), 6);
  await inspector(page).getByRole('button', { name: 'Apply position', exact: true }).click();
  await expect(page.locator('.statusbar')).toContainText('Equipment repositioned');
  expect((await exported(page)).devices.find((d) => d.id === 'server-1')!.startU).toBe(6);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const undone = await exported(page);
  expect(undone.devices.find((d) => d.id === 'server-1')!.startU).toBe(8);
  expect(undone.cables).toEqual(imported.cables);

  // Save and reload: the stored cable is still present and still flagged.
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toolbar-save')).toContainText('Saved locally');
  await page.reload();
  await expect(page.locator('.installed-pills > button')).toHaveCount(7);
  const reloaded = await exported(page);
  expect(reloaded.cables).toEqual(undone.cables);
  await expect(page.getByTestId('power-issues')).toHaveAttribute(
    'title',
    /Cable L1 joins two banked outlets/,
  );

  // There is no UI to re-point an existing cable end. The closest UI edit that would create a new
  // same-gender pair is retyping the fed C14 inlet as a C13 socket; it must be refused.
  await tab(page, 'Device Library').click();
  const serverDefinition = reloaded.definitions.find(
    (d) => d.id === reloaded.devices.find((v) => v.id === 'server-1')!.definitionId,
  )!;
  await page.getByRole('button', { name: `Edit ${serverDefinition.name}`, exact: true }).click();
  const editor = page.getByRole('dialog', { name: `Device definition · ${serverDefinition.name}` });
  await editor.getByRole('button', { name: /^Ports \(/ }).click();
  const index = serverDefinition.ports.findIndex((p) => p.id === 'power');
  await editor
    .locator('.port-edit-row')
    .nth(index)
    .getByRole('combobox', { name: 'Connector', exact: true })
    .selectOption('IEC-C13');
  await editor.getByRole('button', { name: 'Save definition', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(`feed-1: ${GENDER_MESSAGE}`);
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(await exported(page)).toEqual(reloaded);
});
