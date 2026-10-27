import { test as base, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openView } from './navigation';

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

test.setTimeout(300_000);
test.use({ baseURL: process.env.RACK_TEST_URL ?? 'http://127.0.0.1:5173' });

/** 3000 W at 230 V. */
const SERVER_MAX_A = 3000 / 230;

async function open(page: Page) {
  // Software WebGL (SwiftShader) compiles a shader program on its first use; a CPU profile of
  // this flow showed one such compile blocking the main thread for about 20 s.
  page.setDefaultTimeout(45_000);
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.rack-u-label').first()).toBeVisible();
  await expect(page.locator('.installed-pills > button')).toHaveCount(6);
}

async function blurNumber(field: Locator, value: number | '') {
  await field.fill(String(value));
  await field.press('Tab');
}

async function downloadText(page: Page, button: Locator): Promise<string> {
  const pending = page.waitForEvent('download');
  await button.click();
  const download = await pending;
  const path = await download.path();
  if (!path) throw new Error('The browser did not produce a local download.');
  return readFile(path, 'utf8');
}

interface ExportedProject {
  definitions: {
    id: string;
    name: string;
    massKg: number | null;
    power?: { nominalW: number | null; maxW: number | null; evidence: string; source: string };
    powerBanks?: {
      name: string;
      portIds: string[];
      maxCurrentA: number;
      outletMaxCurrentA: number | null;
      voltageV: number;
      evidence: string;
    }[];
  }[];
}
async function exportProject(page: Page): Promise<ExportedProject> {
  return JSON.parse(
    await downloadText(page, page.getByRole('button', { name: 'Export project', exact: true })),
  ) as ExportedProject;
}
const definitionNamed = (project: ExportedProject, name: string) => {
  const definition = project.definitions.find((d) => d.name === name);
  if (!definition) throw new Error(`Definition ${name} was not exported.`);
  return definition;
};

const powerIssues = (page: Page) => page.getByTestId('power-issues');
async function select(page: Page, name: string) {
  await page
    .locator('.workspace-tabs')
    .getByRole('button', { name: '3D Rack Designer', exact: true })
    .click();
  await page.locator('.installed-pills > button').filter({ hasText: name }).click();
}
const inspector = (page: Page) => page.locator('.inspector');
const bankCard = (page: Page, name: string) =>
  inspector(page)
    .locator('.power-bank')
    .filter({ has: page.getByText(name, { exact: true }) });
const outletRow = (bank: Locator, outlet: string) =>
  bank.locator('.port-list > div').filter({ hasText: outlet });
/** Numbers in the bank's "Maximum: X A of Y A (Z %)" line. */
async function bankMaximum(bank: Locator) {
  const text = await bank.locator('p.small').first().innerText();
  const match = /Maximum: ([\d.]+) A of ([\d.]+) A \(([\d.]+) %\) · ([\d.]+) W/.exec(text);
  if (!match) throw new Error(`Unexpected bank text: ${text}`);
  const [, amps, limit, percent, watts] = match.map(Number);
  return { amps, limit, percent, watts };
}

async function openDefinitionEditor(page: Page, name: string) {
  await openView(page, 'Device Library');
  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `Device definition · ${name}` });
  await dialog.getByRole('button', { name: 'Power & weight', exact: true }).click();
  return dialog;
}

async function connect(page: Page, sourceLabel: string, destinationLabel: string) {
  await openView(page, 'Connections');
  await page.getByRole('button', { name: 'New connection', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New cable connection' });
  await dialog
    .getByRole('combobox', { name: 'Source port', exact: true })
    .selectOption({ label: sourceLabel });
  await dialog
    .getByRole('combobox', { name: 'Destination port', exact: true })
    .selectOption({ label: destinationLabel });
  await dialog.getByRole('button', { name: 'Connect ports', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.statusbar')).toContainText('Cable connection created.');
}

test('power banks, draw, mass, bank warnings and the status bar survive undo, reload and JSON round trip', async ({
  page,
}) => {
  await open(page);
  // 5. The stock example has no power issues: the server's draw is unknown but it has no feed.
  await expect(powerIssues(page)).toHaveCount(0);

  // 1. Banks in the definition editor.
  const dialog = await openDefinitionEditor(page, '1U power distribution');
  await dialog.getByRole('button', { name: 'Add power bank', exact: true }).click();
  const banks = dialog.locator('.depth-section');
  await expect(banks).toHaveCount(1);
  const top = banks.nth(0);
  await top.getByLabel('Bank name', { exact: true }).fill('Top row');
  for (const n of [1, 2, 3]) await top.getByLabel(`Outlet ${n} · IEC-C13`).check();
  await blurNumber(top.getByLabel('Bank limit (A)', { exact: true }), 16);
  await blurNumber(top.getByLabel('Per-outlet limit (A)', { exact: true }), 10);
  await expect(top.getByRole('button', { name: 'Hide outlets', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Add power bank', exact: true }).click();
  await expect(banks).toHaveCount(2);
  const bottom = banks.nth(1);
  // Ports already in another bank are disabled, and say which bank holds them.
  for (const n of [1, 2, 3]) {
    const taken = bottom.getByLabel(`Outlet ${n} · IEC-C13 · in Top row`);
    await expect(taken).toBeDisabled();
    await expect(taken).not.toBeChecked();
  }
  await bottom.getByLabel('Bank name', { exact: true }).fill('Bottom row');
  for (const n of [4, 5, 6]) {
    await expect(bottom.getByLabel(`Outlet ${n} · IEC-C13`, { exact: true })).toBeEnabled();
    await bottom.getByLabel(`Outlet ${n} · IEC-C13`, { exact: true }).check();
  }
  await blurNumber(bottom.getByLabel('Bank limit (A)', { exact: true }), 16);
  await blurNumber(bottom.getByLabel('Per-outlet limit (A)', { exact: true }), 10);
  // Opening the new bank collapsed the first, whose button now counts its three outlets.
  await expect(top.getByRole('button', { name: 'Outlets (3)', exact: true })).toBeVisible();
  await expect(bottom.getByRole('button', { name: 'Hide outlets', exact: true })).toBeVisible();

  // A bank with no outlets is refused with a readable error.
  await dialog.getByRole('button', { name: 'Add power bank', exact: true }).click();
  await expect(banks).toHaveCount(3);
  await dialog.getByRole('button', { name: 'Save definition', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Power bank Bank 3 needs at least one outlet port.',
  );
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
  await expect(dialog).toBeVisible();
  await banks.nth(2).getByRole('button', { name: 'Remove bank', exact: true }).click();
  await expect(banks).toHaveCount(2);
  // Nominal draw above maximum is refused with a readable error.
  await blurNumber(dialog.getByLabel('Maximum draw (W)', { exact: true }), 20);
  await blurNumber(dialog.getByLabel('Nominal draw (W)', { exact: true }), 30);
  await dialog.getByRole('button', { name: 'Save definition', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Nominal power draw cannot exceed maximum power draw.',
  );
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
  await blurNumber(dialog.getByLabel('Maximum draw (W)', { exact: true }), '');
  await blurNumber(dialog.getByLabel('Nominal draw (W)', { exact: true }), '');
  await expect(dialog.getByLabel('Nominal draw (W)', { exact: true })).toHaveValue('');
  await dialog.getByRole('button', { name: 'Save definition', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.statusbar')).toContainText('Device definition saved.');
  let exported = await exportProject(page);
  const savedPdu = definitionNamed(exported, '1U power distribution');
  // Setting then clearing the draw leaves an all-unknown record, never zero.
  expect(savedPdu.power).toMatchObject({ nominalW: null, maxW: null });
  expect(
    savedPdu.powerBanks?.map((b) => [
      b.name,
      b.portIds,
      b.maxCurrentA,
      b.outletMaxCurrentA,
      b.voltageV,
      b.evidence,
    ]),
  ).toEqual([
    ['Top row', ['iec1', 'iec2', 'iec3'], 16, 10, 230, 'user-entered'],
    ['Bottom row', ['iec4', 'iec5', 'iec6'], 16, 10, 230, 'user-entered'],
  ]);
  // Banks with no feed raise no issue.
  await expect(powerIssues(page)).toHaveCount(0);

  // 2. Connect a banked outlet to the server's inlet. The server draw is unknown: a notice only.
  await connect(page, 'Rear PDU 1 · Outlet 1', 'Server 1 · IEC power');
  await expect(powerIssues(page)).toHaveText('1 power to review');
  await expect(powerIssues(page)).toHaveClass('warning-text');
  await expect(powerIssues(page)).toHaveAttribute('title', /Top row: load is incomplete/);

  // 3. Server inspector: maximum, nominal and mass, by exact label.
  await select(page, 'Server 1');
  const section = inspector(page).getByRole('region', { name: 'Power and weight' });
  await expect(section).toContainText(
    'These values belong to the equipment model 2U rack server, so all 1 placed copy shares them.',
  );
  await blurNumber(section.getByLabel('Maximum draw (W)', { exact: true }), 3000);
  await expect(page.locator('.statusbar')).toContainText('Equipment maximum power draw updated.');
  await blurNumber(section.getByLabel('Nominal draw (W)', { exact: true }), 1200);
  await expect(page.locator('.statusbar')).toContainText('Equipment nominal power draw updated.');
  await blurNumber(section.getByLabel('Mass (kg)', { exact: true }), 18.5);
  await expect(page.locator('.statusbar')).toContainText('Equipment mass updated.');
  await expect(section.getByLabel('Power data status', { exact: true })).toHaveValue(
    'user-entered',
  );
  const feed = section.getByLabel('Power feeds').locator('> div');
  await expect(feed).toHaveCount(1);
  await expect(feed).toContainText('Rear PDU 1 · Top row');
  await expect(feed).toContainText('Outlet 1 → IEC power');
  await expect(feed).toContainText(`bank ${SERVER_MAX_A.toFixed(2)} A of 16 A`);
  await expect(feed.locator('.badge')).toHaveText('Warning');

  // 4. PDU inspector: 3000 W / 230 V = 13.04 A of 16 A = 81.5 %.
  await select(page, 'Rear PDU 1');
  let topCard = bankCard(page, 'Top row');
  await expect(topCard.locator('.section-title .badge')).toHaveText('Warning');
  let figures = await bankMaximum(topCard);
  expect(figures.amps).toBeCloseTo(SERVER_MAX_A, 2);
  expect(figures.amps).toBe(13.04);
  expect(figures.limit).toBe(16);
  expect(figures.percent).toBe(81.5);
  expect(figures.watts).toBe(3000);
  expect(figures.percent).toBeCloseTo((SERVER_MAX_A / 16) * 100, 1);
  await expect(topCard).toContainText('Nominal: 5.22 A · 1200 W');
  await expect(topCard.getByRole('meter', { name: 'Top row utilisation' })).toHaveAttribute(
    'aria-valuenow',
    '82',
  );
  const outlet1 = outletRow(topCard, 'Outlet 1');
  await expect(outlet1).toContainText('Server 1 · 13.04 A of 10 A');
  await expect(outlet1.locator('.badge')).toHaveText('Over limit');
  const bottomCard = bankCard(page, 'Bottom row');
  await expect(bottomCard.locator('.section-title .badge')).toHaveText('OK');
  expect(await bankMaximum(bottomCard)).toEqual({ amps: 0, limit: 16, percent: 0, watts: 0 });
  // The outlet overload is an error: the status bar turns red.
  await expect(powerIssues(page)).toHaveText('2 power to review');
  await expect(powerIssues(page)).toHaveClass('error-text');
  await expect(powerIssues(page)).toHaveCSS('color', 'rgb(184, 78, 73)');

  // Raise the bank limit to 20 A: OK at 65.2 %.
  await blurNumber(topCard.getByLabel('Bank limit (A)', { exact: true }), 20);
  await expect(page.locator('.statusbar')).toContainText('Power bank current limit updated.');
  await expect(topCard.locator('.section-title .badge')).toHaveText('OK');
  figures = await bankMaximum(topCard);
  expect(figures).toEqual({ amps: 13.04, limit: 20, percent: 65.2, watts: 3000 });
  // Lower it to 12 A: over limit at 108.7 %.
  await blurNumber(topCard.getByLabel('Bank limit (A)', { exact: true }), 12);
  await expect(topCard.locator('.section-title .badge')).toHaveText('Over limit');
  figures = await bankMaximum(topCard);
  expect(figures).toEqual({ amps: 13.04, limit: 12, percent: 108.7, watts: 3000 });
  await expect(powerIssues(page)).toHaveClass('error-text');
  await expect(powerIssues(page)).toHaveAttribute('title', /13\.04 A of 12\.0 A \(108\.7 %\)/);
  // Per-outlet rating: 15 A makes the outlet 87 % (warning).
  await blurNumber(topCard.getByLabel('Per outlet (A)', { exact: true }), 15);
  await expect(outletRow(topCard, 'Outlet 1')).toContainText('13.04 A of 15 A');
  await expect(outletRow(topCard, 'Outlet 1').locator('.badge')).toHaveText('Warning');

  // Undo/redo each bank edit. Undo clears the selection, so re-select the PDU each time.
  const undo = async () => {
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await select(page, 'Rear PDU 1');
  };
  const redo = async () => {
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await select(page, 'Rear PDU 1');
  };
  await undo();
  await expect(outletRow(topCard, 'Outlet 1')).toContainText('13.04 A of 10 A');
  await expect(outletRow(topCard, 'Outlet 1').locator('.badge')).toHaveText('Over limit');
  await undo();
  await expect(topCard.getByLabel('Bank limit (A)', { exact: true })).toHaveValue('20');
  expect((await bankMaximum(topCard)).limit).toBe(20);
  await expect(topCard.locator('.section-title .badge')).toHaveText('OK');
  await undo();
  await expect(topCard.getByLabel('Bank limit (A)', { exact: true })).toHaveValue('16');
  expect(await bankMaximum(topCard)).toEqual({
    amps: 13.04,
    limit: 16,
    percent: 81.5,
    watts: 3000,
  });
  await expect(topCard.locator('.section-title .badge')).toHaveText('Warning');
  await redo();
  await redo();
  await redo();
  await expect(topCard.getByLabel('Bank limit (A)', { exact: true })).toHaveValue('12');
  expect(await bankMaximum(topCard)).toEqual({
    amps: 13.04,
    limit: 12,
    percent: 108.7,
    watts: 3000,
  });
  await expect(outletRow(topCard, 'Outlet 1')).toContainText('13.04 A of 15 A');
  await topCard.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/screenshots/power-banks.png' });

  // Clear the server's maximum draw: the bank becomes incomplete and names the unknown consumer.
  await select(page, 'Server 1');
  await blurNumber(section.getByLabel('Maximum draw (W)', { exact: true }), '');
  await expect(section.getByLabel('Maximum draw (W)', { exact: true })).toHaveValue('');
  await expect(feed.locator('.badge')).toHaveText('Incomplete');
  await select(page, 'Rear PDU 1');
  topCard = bankCard(page, 'Top row');
  await expect(topCard.locator('.section-title .badge')).toHaveText('Incomplete');
  expect(await bankMaximum(topCard)).toEqual({ amps: 0, limit: 12, percent: 0, watts: 0 });
  await expect(topCard).toContainText('known part only');
  await expect(topCard).toContainText(
    'Unknown draw: Server 1 (No maximum draw recorded for its equipment model.)',
  );
  await expect(outletRow(topCard, 'Outlet 1').locator('.badge')).toHaveText('Incomplete');
  await expect(powerIssues(page)).toHaveText('1 power to review');
  await expect(powerIssues(page)).toHaveClass('warning-text');
  // Undo restores the maximum draw and the overload; redo clears it again.
  await undo();
  await expect(topCard.locator('.section-title .badge')).toHaveText('Over limit');
  await redo();
  await expect(topCard.locator('.section-title .badge')).toHaveText('Incomplete');
  // Restore the maximum for the persistence checks below.
  await undo();
  await expect(topCard.locator('.section-title .badge')).toHaveText('Over limit');
  await select(page, 'Server 1');
  await expect(section.getByLabel('Maximum draw (W)', { exact: true })).toHaveValue('3000');

  // 6. Export keeps power, powerBanks and massKg.
  exported = await exportProject(page);
  const server = definitionNamed(exported, '2U rack server');
  expect(server.massKg).toBe(18.5);
  expect(server.power).toEqual({
    nominalW: 1200,
    maxW: 3000,
    evidence: 'user-entered',
    source: '',
  });
  const exportedPdu = definitionNamed(exported, '1U power distribution');
  expect(exportedPdu.powerBanks?.map((b) => [b.maxCurrentA, b.outletMaxCurrentA])).toEqual([
    [12, 15],
    [16, 10],
  ]);

  // Save and reload from IndexedDB.
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toolbar-save')).toContainText(/Saved locally/);
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(powerIssues(page)).toHaveText('2 power to review');
  await select(page, 'Rear PDU 1');
  topCard = bankCard(page, 'Top row');
  expect(await bankMaximum(topCard)).toEqual({
    amps: 13.04,
    limit: 12,
    percent: 108.7,
    watts: 3000,
  });
  await select(page, 'Server 1');
  const reloaded = inspector(page).getByRole('region', { name: 'Power and weight' });
  await expect(reloaded.getByLabel('Maximum draw (W)', { exact: true })).toHaveValue('3000');
  await expect(reloaded.getByLabel('Nominal draw (W)', { exact: true })).toHaveValue('1200');
  await expect(reloaded.getByLabel('Mass (kg)', { exact: true })).toHaveValue('18.5');
  expect(await exportProject(page)).toEqual(exported);

  // JSON import of the exported project restores the same values after a new project.
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.locator('.installed-pills > button')).toHaveCount(0);
  await expect(powerIssues(page)).toHaveCount(0);
  await page.getByLabel('Import project JSON', { exact: true }).setInputFiles({
    name: 'power.rack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(page.locator('.installed-pills > button')).toHaveCount(6);
  expect(await exportProject(page)).toEqual(exported);
  await expect(powerIssues(page)).toHaveText('2 power to review');
  await select(page, 'Rear PDU 1');
  expect(await bankMaximum(bankCard(page, 'Top row'))).toEqual({
    amps: 13.04,
    limit: 12,
    percent: 108.7,
    watts: 3000,
  });
});

test('mass edits undo and redo, and removing powered equipment still needs its cable removed first', async ({
  page,
}) => {
  await open(page);
  const section = inspector(page).getByRole('region', { name: 'Power and weight' });
  const mass = section.getByLabel('Mass (kg)', { exact: true });
  const undo = async () => {
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await select(page, 'Server 1');
  };
  await select(page, 'Server 1');
  await expect(mass).toHaveValue('');
  await expect(section).toContainText('Not connected to a banked power outlet in this project.');
  await blurNumber(mass, 18.5);
  await blurNumber(mass, 20);
  await undo();
  await expect(mass).toHaveValue('18.5');
  await undo();
  await expect(mass).toHaveValue('');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await select(page, 'Server 1');
  await expect(mass).toHaveValue('18.5');
  // A negative mass is refused and the field reverts.
  await blurNumber(mass, -1);
  await expect(mass).toHaveValue('18.5');
  expect(definitionNamed(await exportProject(page), '2U rack server').massKg).toBe(18.5);

  // Nominal above maximum is refused in the inspector without changing the project.
  await blurNumber(section.getByLabel('Maximum draw (W)', { exact: true }), 500);
  await blurNumber(section.getByLabel('Nominal draw (W)', { exact: true }), 900);
  await expect(page.getByRole('alert')).toContainText(
    'Nominal power draw cannot exceed maximum power draw.',
  );
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
  expect(definitionNamed(await exportProject(page), '2U rack server').power).toMatchObject({
    nominalW: null,
    maxW: 500,
  });
  // The refused value must not stay on screen.
  await expect(section.getByLabel('Nominal draw (W)', { exact: true })).toHaveValue('');

  // Regression: removal of fed equipment is refused until its cable is deleted.
  await connect(page, 'Rear PDU 1 · Outlet 1', 'Server 1 · IEC power');
  const cableNumber = await inspector(page)
    .getByLabel(/^Cable number/)
    .inputValue();
  expect(cableNumber).toBeTruthy();
  await select(page, 'Server 1');
  await inspector(page).getByRole('button', { name: 'Remove equipment', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Remove the 1 connected cable(s)');
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
  await expect(page.locator('.installed-pills > button')).toHaveCount(6);
  await openView(page, 'Cable Schedule');
  await page
    .locator('.schedule-table')
    .getByRole('button', { name: cableNumber, exact: true })
    .click();
  await inspector(page).getByRole('button', { name: 'Delete cable', exact: true }).click();
  await select(page, 'Server 1');
  await inspector(page).getByRole('button', { name: 'Remove equipment', exact: true }).click();
  await expect(page.locator('.installed-pills > button')).toHaveCount(5);
  await expect(powerIssues(page)).toHaveCount(0);
});

test('the imported APC AP7922B evaluates its B1/B2 banks for a connected IEC-C14 inlet', async ({
  page,
}) => {
  await open(page);
  await openView(page, 'Device Library');
  await page
    .locator('label.button', { hasText: 'Import library' })
    .locator('input[type=file]')
    .setInputFiles(resolve('library/apc-ap7922b-outlets-front.library.json'));
  await expect(page.locator('.statusbar')).toContainText('Library imported.');
  await page
    .locator('.workspace-tabs')
    .getByRole('button', { name: '3D Rack Designer', exact: true })
    .click();
  const name = 'APC AP7922B Switched PDU · 2U · outlets front';
  await page.getByRole('button', { name: `Place ${name}`, exact: true }).click();
  const place = page.getByRole('dialog', { name: 'Place equipment precisely' });
  await blurNumber(place.getByLabel('Start U', { exact: true }), 13);
  await place.getByRole('button', { name: 'Place equipment', exact: true }).click();
  await expect(page.locator('.installed-pills > button')).toHaveCount(7);
  const deviceName = `${name} 1`;
  await expect(
    page.locator('.installed-pills > button').filter({ hasText: deviceName }),
  ).toHaveCount(1);
  await connect(page, `${deviceName} · Outlet 1`, 'Server 1 · IEC power');
  await select(page, 'Server 1');
  const section = inspector(page).getByRole('region', { name: 'Power and weight' });
  await blurNumber(section.getByLabel('Maximum draw (W)', { exact: true }), 3000);
  await blurNumber(section.getByLabel('Nominal draw (W)', { exact: true }), 1200);
  await select(page, deviceName);
  const b1 = bankCard(page, 'Bank B1');
  const b2 = bankCard(page, 'Bank B2');
  await expect(b1.getByLabel('Bank limit (A)', { exact: true })).toHaveValue('16');
  await expect(b1.getByLabel('Per outlet (A)', { exact: true })).toHaveValue('10');
  await expect(b1.getByLabel('Voltage (V)', { exact: true })).toHaveValue('230');
  await expect(b2.getByLabel('Bank limit (A)', { exact: true })).toHaveValue('16');
  await expect(b2.getByLabel('Per outlet (A)', { exact: true })).toHaveValue('10');
  expect(await bankMaximum(b1)).toEqual({ amps: 13.04, limit: 16, percent: 81.5, watts: 3000 });
  await expect(b1.locator('.section-title .badge')).toHaveText('Warning');
  await expect(outletRow(b1, 'Outlet 1').locator('.badge')).toHaveText('Over limit');
  expect(await bankMaximum(b2)).toEqual({ amps: 0, limit: 16, percent: 0, watts: 0 });
  await expect(b2.locator('.section-title .badge')).toHaveText('OK');
  await expect(b1).toContainText('Rating status: user-entered');
});
