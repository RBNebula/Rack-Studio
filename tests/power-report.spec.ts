import { test as base, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openView } from './navigation';
import type { View } from './navigation';

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

const AP = 'APC AP7922B Switched PDU · 2U · outlets front';
const AP_DEVICE = `${AP} 1`;
const VOLTS = 230;
const BANK_LIMIT_A = 16;
/** Independent arithmetic: amps at 230 V, rounded as the document rounds them. */
const amps = (w: number) => Math.round((w / VOLTS) * 100) / 100;
const percent = (w: number, limitA = BANK_LIMIT_A) => Math.round((w / VOLTS / limitA) * 1000) / 10;
const en = (n: number, digits = 2) => n.toLocaleString('en-GB', { maximumFractionDigits: digits });

async function open(page: Page) {
  // Software WebGL compiles shaders slowly on first use; see tests/power.spec.ts.
  page.setDefaultTimeout(45_000);
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.rack-u-label').first()).toBeVisible();
  await expect(page.locator('.installed-pills > button')).toHaveCount(6);
}
const tab = (page: Page, name: string | RegExp) =>
  page
    .locator('.workspace-tabs')
    .getByRole('button', typeof name === 'string' ? { name, exact: true } : { name });
async function blurNumber(field: Locator, value: number | '') {
  await field.fill(String(value));
  await field.press('Tab');
}
async function select(page: Page, name: string) {
  await tab(page, '3D Rack Designer').click();
  await page.locator('.installed-pills > button').filter({ hasText: name }).click();
}
const inspector = (page: Page) => page.locator('.inspector');
const powerSection = (page: Page) =>
  inspector(page).getByRole('region', { name: 'Power and weight' });
async function setPower(
  page: Page,
  device: string,
  values: { nominal?: number | ''; max?: number | ''; mass?: number | '' },
) {
  await select(page, device);
  const section = powerSection(page);
  if (values.max !== undefined)
    await blurNumber(section.getByLabel('Maximum draw (W)', { exact: true }), values.max);
  if (values.nominal !== undefined)
    await blurNumber(section.getByLabel('Nominal draw (W)', { exact: true }), values.nominal);
  if (values.mass !== undefined)
    await blurNumber(section.getByLabel('Mass (kg)', { exact: true }), values.mass);
  if (values.mass !== undefined)
    await expect(section.getByLabel('Mass (kg)', { exact: true })).toHaveValue(String(values.mass));
}
/** Adds an IEC-C14 inlet to an equipment model through the definition editor. */
async function addInlet(page: Page, model: string, portName: string) {
  await openView(page, 'Device Library');
  await page.getByRole('button', { name: `Edit ${model}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `Device definition · ${model}` });
  await dialog.getByRole('button', { name: /^Ports \(\d+\)$/ }).click();
  const rows = dialog.locator('.port-edit-row');
  const before = await rows.count();
  await dialog.getByRole('button', { name: 'Add port', exact: true }).click();
  await expect(rows).toHaveCount(before + 1);
  const row = rows.nth(before);
  await row.getByLabel('Name', { exact: true }).fill(portName);
  // A select's accessible name includes its value, so find it through its field caption.
  await row
    .locator('label.field')
    .filter({ has: page.getByText('Connector', { exact: true }) })
    .locator('select')
    .selectOption('IEC-C14');
  await dialog.getByRole('button', { name: 'Save definition', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.statusbar')).toContainText('Device definition saved.');
}
async function place(page: Page, name: string, startU: number) {
  await tab(page, '3D Rack Designer').click();
  await page.getByRole('button', { name: `Place ${name}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Place equipment precisely' });
  await blurNumber(dialog.getByLabel('Start U', { exact: true }), startU);
  await dialog.getByRole('button', { name: 'Place equipment', exact: true }).click();
  await expect(dialog).toHaveCount(0);
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

/**
 * The example project plus an imported APC AP7922B (U13–14, unfed), a 1U blank plate (U20), and:
 * - Server 1 dual-fed from B1 Outlet 1 and B2 Outlet 9: 300 W nominal, 450 W max, 18.5 kg;
 * - PC 1 on B1 Outlet 2: 60 W nominal, no maximum draw, 3.2 kg;
 * - Network switch 1 on B2 Outlet 10: 40 W nominal, 90 W max, no mass.
 * Masses are also given to the patch panel (1.2), shelf (2), rear PDU (1.5) and blank (0.3).
 */
async function setUp(page: Page) {
  await open(page);
  await openView(page, 'Device Library');
  await page
    .locator('label.button', { hasText: 'Import library' })
    .locator('input[type=file]')
    .setInputFiles(resolve('library/apc-ap7922b-outlets-front.library.json'));
  await expect(page.locator('.statusbar')).toContainText('Library imported.');
  await addInlet(page, '2U rack server', 'IEC power B');
  await addInlet(page, 'Compact computer', 'IEC inlet');
  await addInlet(page, '24-port network switch', 'IEC inlet');
  await place(page, AP, 13);
  await place(page, '1U blank plate', 20);
  await expect(page.locator('.installed-pills > button')).toHaveCount(8);
  await connect(page, `${AP_DEVICE} · Outlet 1`, 'Server 1 · IEC power');
  await connect(page, `${AP_DEVICE} · Outlet 9`, 'Server 1 · IEC power B');
  await connect(page, `${AP_DEVICE} · Outlet 2`, 'PC 1 · IEC inlet');
  await connect(page, `${AP_DEVICE} · Outlet 10`, 'Network switch 1 · IEC inlet');
  await setPower(page, 'Server 1', { max: 450, nominal: 300, mass: 18.5 });
  await setPower(page, 'PC 1', { nominal: 60, mass: 3.2 });
  await setPower(page, 'Network switch 1', { max: 90, nominal: 40 });
  await setPower(page, 'Patch panel 1', { mass: 1.2 });
  await setPower(page, 'Shelf 1', { mass: 2 });
  await setPower(page, 'Rear PDU 1', { mass: 1.5 });
  await setPower(page, '1U blank plate 1', { mass: 0.3 });
}

const documentView = (page: Page) => page.getByRole('main', { name: 'Power and weights document' });
async function openDocument(page: Page) {
  await openView(page, 'Power & Weights');
  await expect(documentView(page)).toBeVisible();
}
/** Visible text of each body row of a table. */
const bodyRows = (table: Locator) =>
  table
    .locator('tbody > tr')
    .evaluateAll((rows) =>
      rows.map((r) => [...r.querySelectorAll('td')].map((td) => td.innerText.trim())),
    );
const headings = (table: Locator) =>
  table.locator('thead th').evaluateAll((ths) => ths.map((th) => th.textContent?.trim() ?? ''));
const equipmentTable = (page: Page) =>
  documentView(page).getByRole('region', { name: 'Equipment' }).locator('table');
const bankTable = (page: Page) =>
  documentView(page).locator('.power-distributor').filter({ hasText: AP_DEVICE }).locator('table');
async function equipment(page: Page) {
  const columns = await headings(equipmentTable(page));
  const rows = await bodyRows(equipmentTable(page));
  return rows.map((cells) => Object.fromEntries(columns.map((c, i) => [c, cells[i]])));
}
async function banks(page: Page) {
  const columns = await headings(bankTable(page));
  const rows = await bodyRows(bankTable(page));
  return rows.map((cells) => Object.fromEntries(columns.map((c, i) => [c, cells[i]])));
}
async function totals(page: Page) {
  const rows = await bodyRows(
    documentView(page).getByRole('region', { name: 'Totals' }).locator('table'),
  );
  return Object.fromEntries(rows.map(([label, value, detail]) => [label, { value, detail }]));
}
const issueItems = (page: Page) =>
  documentView(page).getByRole('region', { name: 'Power issues' }).locator('li');
async function issueTexts(page: Page) {
  return issueItems(page).evaluateAll((items) =>
    items.map((li) => ({
      severity: li.querySelector('.badge')?.textContent?.trim() ?? '',
      message: li.querySelector('span:not(.badge)')?.textContent?.trim() ?? '',
    })),
  );
}
async function statusBarMessages(page: Page): Promise<string[]> {
  const bar = page.getByTestId('power-issues');
  if ((await bar.count()) === 0) return [];
  return ((await bar.getAttribute('title')) ?? '').split('\n');
}

interface CsvCell {
  text: string;
  quoted: boolean;
}
/** RFC 4180 parser that keeps whether each cell was quoted (text) or bare (a number). */
function parseCsv(text: string): CsvCell[][] {
  const rows: CsvCell[][] = [];
  let row: CsvCell[] = [];
  let i = 0;
  let lineHasContent = false;
  while (i < text.length) {
    if (text[i] === '"') {
      let value = '';
      i++;
      while (i < text.length) {
        if (text[i] === '"' && text[i + 1] === '"') {
          value += '"';
          i += 2;
        } else if (text[i] === '"') {
          i++;
          break;
        } else value += text[i++];
      }
      row.push({ text: value, quoted: true });
      lineHasContent = true;
    } else if (text[i] === ',') {
      i++;
    } else if (text.startsWith('\r\n', i)) {
      rows.push(lineHasContent ? row : []);
      row = [];
      lineHasContent = false;
      i += 2;
    } else {
      let value = '';
      while (i < text.length && text[i] !== ',' && !text.startsWith('\r\n', i)) value += text[i++];
      row.push({ text: value, quoted: false });
      lineHasContent = true;
    }
  }
  rows.push(lineHasContent ? row : []);
  return rows;
}
/** The CSV cell as the screen shows it: bare numbers in en-GB form, formula guards removed. */
function asScreen(cell: CsvCell): string {
  if (!cell.quoted) return en(Number(cell.text));
  return cell.text.startsWith("'") ? cell.text.slice(1) : cell.text;
}
function csvSection(rows: CsvCell[][], title: string): CsvCell[][] {
  const start = rows.findIndex((r) => r.length === 1 && r[0].quoted && r[0].text === title);
  expect(start, `CSV section ${title}`).toBeGreaterThan(0);
  expect(rows[start - 1], `blank line before ${title}`).toEqual([]);
  const end = rows.findIndex((r, i) => i > start && r.length === 0);
  return rows.slice(start + 1, end < 0 ? rows.length : end);
}
async function exportCsv(page: Page) {
  const pending = page.waitForEvent('download');
  await documentView(page).getByRole('button', { name: 'Export CSV', exact: true }).click();
  const download = await pending;
  const path = await download.path();
  if (!path) throw new Error('The browser did not produce a local download.');
  return { filename: download.suggestedFilename(), bytes: await readFile(path) };
}

test('the Power & Weights document lists equipment, banks, totals and issues, updates live and exports a matching CSV', async ({
  page,
}) => {
  await setUp(page);
  await openDocument(page);

  // Step 2. Equipment: one row per placed device, top of the rack first.
  let rows = await equipment(page);
  expect(rows.map((r) => r.Device)).toEqual([
    '1U blank plate 1',
    'Patch panel 1',
    'Network switch 1',
    AP_DEVICE,
    'Rear PDU 1',
    'Server 1',
    'PC 1',
    'Shelf 1',
  ]);
  const byName = (name: string) => rows.find((r) => r.Device === name)!;
  expect(byName('Server 1')).toEqual({
    Device: 'Server 1',
    Model: '2U rack server',
    Position: 'Communications rack A · U8–9 · Front',
    'Mass (kg)': '18.5',
    'Mass evidence': 'example',
    'Nominal draw (W)': '300',
    'Max draw (W)': '450',
    'Max inlet current (A)': en(amps(450)),
    'Power evidence': 'user-entered',
    'Fed from': `${AP_DEVICE} · Bank B1 · Outlet 1; ${AP_DEVICE} · Bank B2 · Outlet 9 (redundant feed)`,
  });
  expect(amps(450)).toBe(1.96);
  // Unknown values read Unknown, never 0.
  expect(byName('PC 1')).toMatchObject({
    'Mass (kg)': '3.2',
    'Nominal draw (W)': '60',
    'Max draw (W)': 'Unknown',
    'Max inlet current (A)': 'Unknown',
    'Fed from': `${AP_DEVICE} · Bank B1 · Outlet 2`,
  });
  expect(byName('Network switch 1')).toMatchObject({
    'Mass (kg)': 'Unknown',
    'Mass evidence': '—',
    'Nominal draw (W)': '40',
    'Max draw (W)': '90',
    'Max inlet current (A)': en(amps(90)),
    'Fed from': `${AP_DEVICE} · Bank B2 · Outlet 10`,
  });
  expect(amps(90)).toBe(0.39);
  // The PDU has no draw record and no feed.
  expect(byName(AP_DEVICE)).toMatchObject({
    Position: 'Communications rack A · U13–14 · Front',
    'Mass (kg)': '4.5',
    'Mass evidence': 'user-entered',
    'Nominal draw (W)': 'Unknown',
    'Max draw (W)': 'Unknown',
    'Max inlet current (A)': '—',
    'Power evidence': 'No power record',
    'Fed from': 'Not connected',
  });
  // Unpowered devices: a dash in every power column.
  for (const name of ['1U blank plate 1', 'Patch panel 1', 'Rear PDU 1', 'Shelf 1'])
    expect(byName(name)).toMatchObject({
      'Nominal draw (W)': '—',
      'Max draw (W)': '—',
      'Max inlet current (A)': '—',
      'Power evidence': '—',
      'Fed from': '—',
    });
  expect(byName('1U blank plate 1')['Mass (kg)']).toBe('0.3');
  expect(byName('PC 1').Position).toBe('Communications rack A · U3–4 · Front · on Shelf 1');
  // No cell anywhere in the equipment table reads 0 for an unknown value.
  for (const r of rows) for (const v of Object.values(r)) expect(v).not.toBe('0');
  await expect(
    equipmentTable(page).locator('td.unknown-value'),
    'PC max draw, PC inlet current, switch mass, PDU nominal and max',
  ).toHaveCount(5);

  // Banks: B1 is incomplete (PC max unknown), B2 is complete and OK.
  let bankRows = await banks(page);
  expect(bankRows.map((b) => b.Bank)).toEqual(['Bank B1', 'Bank B2']);
  expect(bankRows[0]).toEqual({
    Bank: 'Bank B1',
    'Voltage (V)': '230',
    'Bank limit (A)': '16',
    'Outlet limit (A)': '10',
    'Nominal (A)': en(amps(360)),
    'Nominal (W)': '360',
    'Max (A)': `≥ ${en(amps(450))}`,
    'Max (W)': '≥ 450',
    'Utilisation (%)': `≥ ${en(percent(450), 1)}`,
    Status: 'Incomplete',
    'Consumers (outlets; max load)':
      'Server 1 (Outlet 1; 450 W; redundant feed); PC 1 (Outlet 2; Unknown)',
    'Unknown draw': 'PC 1: No maximum draw recorded for its equipment model.',
    'Rating evidence': expect.stringMatching(/^user-entered \(printed on unit front panel/),
  });
  expect([amps(360), percent(450)]).toEqual([1.57, 12.2]);
  expect(bankRows[1]).toMatchObject({
    'Nominal (A)': en(amps(340)),
    'Nominal (W)': '340',
    'Max (A)': en(amps(540)),
    'Max (W)': '540',
    'Utilisation (%)': en(percent(540), 1),
    Status: 'OK',
    'Consumers (outlets; max load)':
      'Server 1 (Outlet 9; 450 W; redundant feed); Network switch 1 (Outlet 10; 90 W)',
    'Unknown draw': 'None',
  });
  expect([amps(340), amps(540), percent(540)]).toEqual([1.48, 2.35, 14.7]);
  const badges = bankTable(page).locator('tbody .badge');
  await expect(badges).toHaveText(['Incomplete', 'OK']);
  const distributor = documentView(page).locator('.power-distributor');
  await expect(distributor).toHaveCount(1);
  await expect(distributor).toContainText('Fed from: Not connected');
  await expect(distributor).toContainText(
    'Input: ≥ 540 W (incomplete) max · ≥ 400 W (incomplete) nominal',
  );

  // Totals: lower bounds naming the missing devices.
  let t = await totals(page);
  expect(t['Placed devices'].value).toBe('8');
  expect(t['Placed devices'].detail).toBe(
    '4 powered, including 1 power distributor; 4 without power (for example blanking plates).',
  );
  const knownMass = 18.5 + 3.2 + 4.5 + 1.2 + 2 + 1.5 + 0.3;
  expect(t['Total mass'].value).toBe(`≥ ${en(knownMass)} kg (incomplete: 1 device unknown)`);
  expect(t['Total mass'].detail).toContain('Unknown mass: Network switch 1.');
  expect(t['Total nominal draw'].value).toBe('≥ 400 W (incomplete: 1 device unknown)');
  expect(t['Total nominal draw'].detail).toContain(`Unknown nominal draw: ${AP_DEVICE}.`);
  expect(t['Total maximum draw'].value).toBe('≥ 540 W (incomplete: 2 devices unknown)');
  expect(t['Total maximum draw'].detail).toContain(`Unknown maximum draw: PC 1, ${AP_DEVICE}.`);
  expect(t['Estimated heat output'].value).toBe(`≥ ${en(Math.round(400 * 3.412))} BTU/h nominal`);
  expect(t['Estimated heat output'].detail).toMatch(
    new RegExp(`^≥ ${en(Math.round(540 * 3.412))} BTU/h at maximum draw`),
  );
  expect(t['Powered devices not connected'].value).toBe('1');
  expect(t['Powered devices not connected'].detail).toMatch(new RegExp(`^${AP_DEVICE}\\.`));
  expect(t['Devices with redundant feeds']).toMatchObject({ value: '1' });
  expect(t['Devices with redundant feeds'].detail).toMatch(/^Server 1\./);
  expect(t[`Input load · ${AP_DEVICE}`].value).toBe('≥ 540 W (incomplete) max');
  expect(t['Power issues']).toEqual({ value: '1', detail: '0 errors · 0 warnings · 1 notice' });
  await expect(documentView(page).locator('.metric')).toHaveText([
    'Placed devices8',
    `Total mass≥ ${en(knownMass)} kg`,
    'Total maximum draw≥ 540 W',
    'Power issues1',
  ]);

  // Issues match the status bar's "power to review" entries.
  await expect(page.getByTestId('power-issues')).toHaveText('1 power to review');
  let issues = await issueTexts(page);
  expect(issues.map((i) => i.message)).toEqual(await statusBarMessages(page));
  expect(issues).toEqual([
    {
      severity: 'Notice',
      message: `${AP_DEVICE} · Bank B1: load is incomplete; unknown draw for PC 1. Known part: ${amps(450).toFixed(2)} A of 16.0 A.`,
    },
  ]);

  // Step 3. Live updates. Giving the switch a mass completes the total.
  await setPower(page, 'Network switch 1', { mass: 2.8 });
  await openDocument(page);
  t = await totals(page);
  expect(t['Total mass'].value).toBe(`${en(knownMass + 2.8)} kg`);
  expect(t['Total mass'].detail).toBe(
    'Every device has a recorded mass. Equipment only: the rack frame, cables and fixings are not included.',
  );
  rows = await equipment(page);
  expect(byName('Network switch 1')['Mass (kg)']).toBe('2.8');

  // Push Bank B2 to at least 80 %: server 1700 W + switch 1350 W = 3050 W.
  await setPower(page, 'Server 1', { max: 1700 });
  await setPower(page, 'Network switch 1', { max: 1350 });
  await openDocument(page);
  bankRows = await banks(page);
  expect(percent(3050)).toBe(82.9);
  expect(bankRows[1]).toMatchObject({
    'Max (A)': en(amps(3050)),
    'Max (W)': '3,050',
    'Utilisation (%)': en(percent(3050), 1),
    Status: 'Warning',
  });
  await expect(badges).toHaveText(['Incomplete', 'Warning']);
  issues = await issueTexts(page);
  // Same entries; the document lists errors first, the status bar keeps analysis order.
  expect(issues.map((i) => i.message).sort()).toEqual((await statusBarMessages(page)).sort());
  expect(issues).toContainEqual({
    severity: 'Warning',
    message: `${AP_DEVICE} · Bank B2: ${amps(3050).toFixed(2)} A of 16.0 A (${percent(3050).toFixed(1)} %) at maximum draw is at or above the 80 % continuous-load guideline.`,
  });
  expect(issues.map((i) => i.severity)).toEqual(['Warning', 'Notice']);
  expect(
    (await equipment(page)).find((r) => r.Device === 'Server 1')!['Max inlet current (A)'],
  ).toBe(en(amps(1700)));

  // Above 100 %: switch 2100 W, bank 3800 W = 16.52 A (103.3 %); the switch outlet is 91.3 %.
  await setPower(page, 'Network switch 1', { max: 2100 });
  await openDocument(page);
  bankRows = await banks(page);
  expect([amps(3800), percent(3800), percent(2100, 10)]).toEqual([16.52, 103.3, 91.3]);
  expect(bankRows[1]).toMatchObject({
    'Max (A)': en(amps(3800)),
    'Max (W)': '3,800',
    'Utilisation (%)': en(percent(3800), 1),
    Status: 'Over limit',
  });
  await expect(badges).toHaveText(['Incomplete', 'Over limit']);
  issues = await issueTexts(page);
  expect(issues.map((i) => i.message).sort()).toEqual((await statusBarMessages(page)).sort());
  expect(issues).toEqual([
    {
      severity: 'Error',
      message: `${AP_DEVICE} · Bank B2: 16.52 A of 16.0 A (103.3 %) at maximum draw exceeds the bank limit.`,
    },
    {
      severity: 'Warning',
      message: `${AP_DEVICE} · Bank B2 · Outlet 10: 9.13 A of 10.0 A outlet rating (91.3 %) is at or above 80 % of the outlet limit.`,
    },
    {
      severity: 'Notice',
      message: `${AP_DEVICE} · Bank B1: load is incomplete; unknown draw for PC 1. Known part: ${amps(1700).toFixed(2)} A of 16.0 A.`,
    },
  ]);
  await expect(page.getByTestId('power-issues')).toHaveText('3 power to review');
  t = await totals(page);
  expect(t['Power issues']).toEqual({ value: '3', detail: '1 error · 1 warning · 1 notice' });
  expect(t['Total maximum draw'].value).toBe(
    `≥ ${en(1700 + 2100)} W (incomplete: 2 devices unknown)`,
  );

  // Step 4. CSV export, with a formula-like device name.
  await select(page, 'PC 1');
  await inspector(page).getByLabel('Instance name', { exact: true }).fill('=SUM(1)');
  await inspector(page).getByRole('button', { name: 'Apply position', exact: true }).click();
  await expect(
    page.locator('.installed-pills > button').filter({ hasText: '=SUM(1)' }),
  ).toHaveCount(1);
  await openDocument(page);
  const { filename, bytes } = await exportCsv(page);
  expect(filename).toBe('Vehicle-communications---example-power-weights.csv');
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const text = bytes.toString('utf8').slice(1);
  expect(text).toContain('"\'=SUM(1)","Compact computer"');
  expect(text).not.toMatch(/(^|,)"=/m);
  const csv = parseCsv(text);
  expect(csv[0]).toEqual([
    { text: 'Power and weights', quoted: true },
    { text: 'Vehicle communications · example', quoted: true },
  ]);
  // Sections in order, each after a blank line.
  const titles = csv
    .map((r, i) => (r.length === 1 && csv[i - 1]?.length === 0 ? r[0].text : null))
    .filter(Boolean);
  expect(titles).toEqual(['Equipment', 'Power banks', 'Totals', 'Issues', 'Notes']);

  // Every figure matches the screen.
  const screenEquipment = await bodyRows(equipmentTable(page));
  const equipmentCsv = csvSection(csv, 'Equipment');
  expect(equipmentCsv[0].map((c) => c.text)).toEqual(await headings(equipmentTable(page)));
  expect(equipmentCsv.slice(1).map((r) => r.map(asScreen))).toEqual(screenEquipment);
  const pcRow = equipmentCsv.find((r) => r[0].text === "'=SUM(1)")!;
  expect(pcRow[3]).toEqual({ text: '3.2', quoted: false });
  expect(pcRow[6]).toEqual({ text: 'Unknown', quoted: true });
  const banksCsv = csvSection(csv, 'Power banks');
  expect(banksCsv[0].map((c) => c.text)).toEqual([
    'Distributor',
    ...(await headings(bankTable(page))),
  ]);
  expect(banksCsv.slice(1).map((r) => r[0].text)).toEqual([AP_DEVICE, AP_DEVICE]);
  expect(banksCsv.slice(1).map((r) => r.slice(1).map(asScreen))).toEqual(
    await bodyRows(bankTable(page)),
  );
  // Raw numbers in the CSV, the lower bound as text, and the renamed consumer neutralised.
  // Bank B2: nominal 300 + 40 W, maximum 1700 + 2100 W.
  expect(banksCsv[2].slice(5, 11)).toEqual([
    { text: String(amps(340)), quoted: false },
    { text: '340', quoted: false },
    { text: String(amps(3800)), quoted: false },
    { text: '3800', quoted: false },
    { text: String(percent(3800)), quoted: false },
    { text: 'Over limit', quoted: true },
  ]);
  expect(banksCsv[1][7]).toEqual({ text: `≥ ${amps(1700)}`, quoted: true });
  // A composite cell that starts with the renamed device is guarded as a whole.
  expect(banksCsv[1][11].text).toBe(
    'Server 1 (Outlet 1; 1,700 W; redundant feed); =SUM(1) (Outlet 2; Unknown)',
  );
  expect(banksCsv[1][12].text).toBe("'=SUM(1): No maximum draw recorded for its equipment model.");
  const totalsCsv = csvSection(csv, 'Totals');
  expect(totalsCsv[0].map((c) => c.text)).toEqual(['Item', 'Value', 'Detail']);
  expect(totalsCsv.slice(1).map((r) => r.map((c) => c.text))).toEqual(
    (
      await bodyRows(documentView(page).getByRole('region', { name: 'Totals' }).locator('table'))
    ).map((r) => r),
  );
  const issuesCsv = csvSection(csv, 'Issues');
  expect(issuesCsv[0].map((c) => c.text)).toEqual(['Severity', 'Message']);
  expect(issuesCsv.slice(1).map((r) => ({ severity: r[0].text, message: r[1].text }))).toEqual(
    await issueTexts(page),
  );
  const notesCsv = csvSection(csv, 'Notes');
  expect(notesCsv.map((r) => r[0].text)).toEqual(
    await documentView(page)
      .locator('.report-notes li')
      .evaluateAll((li) => li.map((x) => x.textContent?.trim() ?? '')),
  );
  expect(notesCsv).toHaveLength(6);
});

/** Page sizes in PDF points from each page's MediaBox. */
function pdfPageSizes(pdf: Buffer): [number, number][] {
  return [...pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)].map(
    (m) => [Number(m[1]), Number(m[2])],
  );
}

test('the Power & Weights print layout hides the app chrome, adds the project line, wraps cells and prints A4 landscape', async ({
  page,
}) => {
  await setUp(page);
  await openDocument(page);
  const view = documentView(page);
  // On screen the print-only line is hidden and the buttons show.
  const printLine = view.locator('.print-only');
  await expect(printLine).toBeHidden();
  await expect(view.getByRole('button', { name: 'Print / save PDF', exact: true })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/power-weights-document.png', fullPage: true });

  await page.emulateMedia({ media: 'print' });
  for (const selector of [
    '.app-header',
    '.project-toolbar',
    '.workspace-tabs',
    '.workspace-subtabs',
    '.accuracy-banner',
    '.statusbar',
  ])
    await expect(page.locator(selector), `${selector} is hidden in print`).toBeHidden();
  // Hidden buttons leave the accessibility tree, so query the elements.
  await expect(view.locator('button')).toHaveCount(2);
  for (const button of await view.locator('button').all()) await expect(button).toBeHidden();
  await expect(page.locator('.inspector')).toHaveCount(0);
  await expect(printLine).toBeVisible();
  // The page background prints white even with background graphics enabled.
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor),
  ).toBe('rgb(255, 255, 255)');
  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  await expect(printLine).toHaveText(
    new RegExp(
      `^Vehicle communications · example · revision \\d+ · Communications rack A · printed ${today}$`,
    ),
  );
  // Long cells wrap, and table headings are a repeating header group.
  const rating = bankTable(page).locator('tbody tr').first().locator('td').last();
  await expect(rating).toHaveCSS('white-space', 'normal');
  const lineHeight = await rating.evaluate((td) => parseFloat(getComputedStyle(td).fontSize) * 1.2);
  expect((await rating.boundingBox())!.height).toBeGreaterThan(2 * lineHeight);
  for (const head of await view.locator('thead').all())
    await expect(head).toHaveCSS('display', 'table-header-group');
  await expect(view).toHaveCSS('page', 'power-document');
  // Nothing in the document is wider than the page content box (A4 landscape less 2 × 12 mm).
  const contentWidthPx = ((297 - 24) / 25.4) * 96;
  await page.setViewportSize({ width: Math.floor(contentWidthPx), height: 1000 });
  const overflow = await view.evaluate((main) =>
    [...main.querySelectorAll('table')].map((t) => t.scrollWidth - main.clientWidth),
  );
  for (const excess of overflow) expect(excess).toBeLessThanOrEqual(1);

  // Chromium's PDF output honours the CSS page size: every page is A4 landscape.
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  // Kept under test-results/ for review.
  await writeFile(test.info().outputPath('power-weights.pdf'), pdf);
  const sizes = pdfPageSizes(pdf);
  expect(sizes.length).toBeGreaterThan(0);
  for (const [width, height] of sizes) {
    expect(width).toBeCloseTo(841.89, 0);
    expect(height).toBeCloseTo(595.28, 0);
  }
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect(printLine).toBeHidden();
});

test('cable reports and their CSV exports still work, and the Power & Weights tab hides the cable inspector', async ({
  page,
}) => {
  await open(page);
  const reports: [View, string, RegExp][] = [
    ['Cable Schedule', 'schedule', /^"Cable/],
    ['Cut List', 'cuts', /^"/],
    ['Procurement', 'procurement', /^"/],
  ];
  for (const [name, workspace, header] of reports) {
    await openView(page, name);
    const pending = page.waitForEvent('download');
    await page.getByRole('main').getByRole('button', { name: 'Export CSV', exact: true }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe(`Vehicle-communications---example-${workspace}.csv`);
    const bytes = await readFile((await download.path())!);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = bytes.toString('utf8').slice(1).split('\r\n');
    expect(lines[0]).toMatch(header);
    if (workspace === 'schedule') {
      expect(lines).toHaveLength(3);
      expect(lines[2]).toMatch(/^"1","Patch panel 1 · Port 1",/);
    }
  }
  // Select a cable in the schedule: its inspector opens beside the report.
  await openView(page, 'Cable Schedule');
  await page.locator('.schedule-table').getByRole('button', { name: '1', exact: true }).click();
  await expect(inspector(page).getByLabel(/^Cable number/)).toHaveValue('1');
  // The Power & Weights document is read-only and does not show the cable inspector.
  await openDocument(page);
  await expect(page.locator('.inspector')).toHaveCount(0);
  await expect(documentView(page)).toBeVisible();
  await expect(equipmentTable(page).locator('tbody > tr')).toHaveCount(6);
  // Returning to the schedule keeps the selection and its inspector.
  await openView(page, 'Cable Schedule');
  await expect(inspector(page).getByLabel(/^Cable number/)).toHaveValue('1');
});
