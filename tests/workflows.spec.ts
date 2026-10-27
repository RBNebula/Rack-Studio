import { test as base, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  fileAction,
  fileItem,
  openExample,
  openView,
  selectInstalled,
  setView,
  viewState,
} from './navigation';

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

test.setTimeout(90_000);
test.use({ baseURL: process.env.RACK_TEST_URL ?? 'http://127.0.0.1:5173' });
test.beforeAll(({ browser }) => {
  console.info(`Browser QA: Microsoft Edge ${browser.version()}, 1600 × 1000, software WebGL.`);
});

async function open(page: Page) {
  page.setDefaultTimeout(10_000);
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.rack-u-label').first()).toBeVisible();
  await openExample(page);
  await expect(page.locator('.installed-pills > button')).toHaveCount(6);
  await expect(page.locator('.depth-section')).toHaveCount(1);
  await expect(page.getByLabel('Mounting hole type', { exact: true })).toHaveValue('square');
}

async function blurNumber(field: Locator, value: number) {
  await field.fill(String(value));
  await field.press('Tab');
}

async function setSquareExampleHoles(page: Page) {
  await page.getByLabel('Mounting hole type', { exact: true }).selectOption('square');
  await page.getByRole('button', { name: 'Apply rack configuration', exact: true }).click();
  await expect(page.locator('.statusbar')).toContainText('Rack configuration updated.');
}

async function pointerLibraryDrop(page: Page, definitionName: string, u: number) {
  const card = page
    .locator('.library-card')
    .filter({ has: page.getByRole('heading', { name: definitionName, exact: true }) });
  await card.scrollIntoViewIfNeeded();
  const source = await card.locator('.device-mini').boundingBox();
  const canvas = await page.locator('canvas').boundingBox();
  const uLabel = await page
    .locator('.rack-u-label')
    .filter({ hasText: new RegExp(`^${String(u).padStart(2, '0')}$`) })
    .boundingBox();
  expect(source).not.toBeNull();
  expect(canvas).not.toBeNull();
  expect(uLabel).not.toBeNull();
  if (!source || !canvas || !uLabel)
    throw new Error('The drag source, rendered canvas, or U label has no visible bounds.');
  // These are real mouse actions. The native draggable article starts the HTML5
  // operation; no dispatched drag events or application-store manipulation is used.
  const startX = source.x + source.width / 2,
    startY = source.y + source.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 14, startY + 4, { steps: 5 });
  await page.mouse.move(canvas.x + canvas.width / 2, uLabel.y + uLabel.height / 2, { steps: 32 });
  await expect(page.locator('.scene-placement-message')).toBeVisible();
  await page.mouse.up();
}

async function pointerMoveInstalled(page: Page, fromU: number, toU: number) {
  const label = (u: number) =>
    page
      .locator('.rack-u-label')
      .filter({ hasText: new RegExp(`^${String(u).padStart(2, '0')}$`) });
  const gridMotion = await label(fromU).evaluate(async (element) => {
    const positions: { x: number; y: number }[] = [];
    const read = () => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y };
    };
    positions.push(read());
    let stableFrames = 0;
    for (let frame = 0; frame < 60 && stableFrames < 4; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const current = read();
      const previous = positions.at(-1)!;
      stableFrames =
        Math.hypot(current.x - previous.x, current.y - previous.y) < 0.25 ? stableFrames + 1 : 0;
      positions.push(current);
    }
    return { positions, stableFrames };
  });
  expect(
    gridMotion.stableFrames,
    'Camera projection must settle before deriving drag coordinates.',
  ).toBe(4);
  console.info(
    `Installed drag U${fromU}: rendered grid samples ${JSON.stringify(gridMotion.positions)}.`,
  );
  const canvas = await page.locator('canvas').boundingBox();
  const from = await label(fromU).boundingBox(),
    to = await label(toU).boundingBox();
  if (!canvas || !from || !to) throw new Error('Installed drag positions are not visible.');
  const x = canvas.x + canvas.width / 2;
  // Grab the chassis above its row of individually selectable port markers.
  await page.mouse.move(x, from.y + from.height / 2 - 7);
  await page.mouse.down();
  await page.mouse.move(x, to.y + to.height / 2 - 7, { steps: 20 });
  await page.mouse.up();
}

async function downloadText(page: Page, button: Locator): Promise<string> {
  const pending = page.waitForEvent('download');
  await button.click();
  const download = await pending;
  const path = await download.path();
  if (!path) throw new Error('The browser did not produce a local download.');
  return readFile(path, 'utf8');
}

function purposeField(page: Page, cableNumber: string): Locator {
  return page
    .locator('.schedule-table tbody > tr')
    .filter({ has: page.getByRole('button', { name: cableNumber, exact: true }) })
    .locator('input.table-input');
}

test('actual library drag, occupied drop, precise placement, undo/redo and camera controls', async ({
  page,
}) => {
  await open(page);
  await page.screenshot({ path: 'docs/screenshots/rack-designer.png' });
  await setSquareExampleHoles(page);
  await setView(page, 'Front');
  await page.getByRole('button', { name: 'Orthographic camera', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Orthographic camera', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await pointerMoveInstalled(page, 16, 15);
  await expect(
    page.locator('.installed-pills > button').filter({ hasText: 'Network switch 1' }),
  ).toContainText('U15');
  await expect(page.locator('.statusbar')).toContainText('Moved');
  await expect(page.locator('.scene-footer')).toContainText('2 cables');
  await selectInstalled(page, 'Shelf 1');
  await blurNumber(page.getByLabel('Start U', { exact: true }), 4);
  await page.getByRole('button', { name: 'Apply position', exact: true }).click();
  await expect(
    page.locator('.installed-pills > button').filter({ hasText: 'Shelf 1' }),
  ).toContainText('U4');
  await expect(page.locator('.installed-pills > button').filter({ hasText: 'PC 1' })).toContainText(
    'U4',
  );
  await pointerLibraryDrop(page, '24-port network switch', 6);
  await expect(page.locator('.installed-pills > button')).toHaveCount(7);
  await expect(page.locator('.statusbar')).toContainText('Placed');
  await expect(page.locator('.statusbar')).toContainText('U6');
  await expect(page.locator('.installed-pills')).toContainText('24-port network switch 2');

  await pointerLibraryDrop(page, '24-port network switch', 6);
  await expect(page.locator('.installed-pills > button')).toHaveCount(7);
  await expect(page.getByRole('alert')).toContainText(/collision|occupied/i);
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();

  await page.getByRole('button', { name: 'Place 1U horizontal manager', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Place equipment precisely' });
  await blurNumber(dialog.getByLabel('Start U', { exact: true }), 14);
  await dialog.getByRole('button', { name: 'Place equipment', exact: true }).click();
  await expect(page.locator('.installed-pills > button')).toHaveCount(8);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.installed-pills > button')).toHaveCount(7);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.locator('.installed-pills > button')).toHaveCount(8);
  await setView(page, 'Rear');
  await expect(viewState(page, 'Rear')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Show measurements', exact: true }).click();
  await expect(page.locator('.scene-dimension')).not.toHaveCount(0);
  await page.getByRole('button', { name: 'Orbit 3D view', exact: true }).click();
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click();
  await page.screenshot({ path: 'docs/screenshots/rack-placement.png' });
});

test('custom definition, port editing and embedded image survive a real local save/reload', async ({
  page,
}) => {
  await open(page);
  await openView(page, 'Device Library');
  await page.getByRole('button', { name: 'New device', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Device name', { exact: true }).fill('QA compact switch');
  await dialog.getByLabel('Manufacturer', { exact: true }).fill('QA fixture');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
    'base64',
  );
  await dialog
    .getByLabel(/Front image/)
    .setInputFiles({ name: 'qa-front.png', mimeType: 'image/png', buffer: png });
  await expect(dialog.locator('.image-preview')).toHaveCount(1);
  await expect
    .poll(() =>
      dialog
        .locator('.image-preview')
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await dialog.getByRole('button', { name: 'Ports (0)', exact: true }).click();
  await dialog.getByRole('button', { name: 'Add port', exact: true }).click();
  const port = dialog.locator('.port-edit-row');
  await port.getByLabel('Name', { exact: true }).fill('QA management');
  await blurNumber(port.getByLabel('x (mm)', { exact: true }), 100);
  await dialog.getByRole('button', { name: 'Save definition', exact: true }).click();
  await page.getByLabel('Search equipment', { exact: true }).fill('QA compact switch');
  await expect(page.locator('.library-card')).toHaveCount(1);
  let library = JSON.parse(
    await downloadText(page, page.getByRole('button', { name: 'Export library', exact: true })),
  ) as { name: string; frontImage: string | null; ports: { name: string; position: number[] }[] }[];
  let definition = library.find((item) => item.name === 'QA compact switch');
  expect(definition?.frontImage).toMatch(/^data:image\/png;base64,/);
  expect(definition?.ports[0]).toMatchObject({
    name: 'QA management',
    position: [100, 21.475, 282],
  });
  await fileAction(page, 'Save');
  await expect(page.locator('.toolbar-save')).toContainText(/Saved locally/);
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  await openView(page, 'Device Library');
  await page.getByLabel('Search equipment', { exact: true }).fill('QA compact switch');
  await expect(page.locator('.library-card')).toHaveCount(1);
  library = JSON.parse(
    await downloadText(page, page.getByRole('button', { name: 'Export library', exact: true })),
  ) as typeof library;
  definition = library.find((item) => item.name === 'QA compact switch');
  expect(definition?.frontImage).toMatch(/^data:image\/png;base64,/);
  expect(definition?.ports[0].name).toBe('QA management');
});

test('connections, master schedule, external length, reserve, CSV and project reopen stay consistent', async ({
  page,
}) => {
  await open(page);
  await openView(page, 'Connections');
  await expect(page.locator('.schedule-table tbody > tr')).toHaveCount(2);
  const externalId = (await page.locator('.schedule-table .cable-id').allTextContents())[1].trim();
  await page.getByRole('button', { name: 'New connection', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New cable connection' });
  await dialog.getByLabel('Cable ID', { exact: true }).fill('QA-NEW');
  await dialog
    .getByRole('combobox', { name: 'Source port', exact: true })
    .selectOption({ label: 'Patch panel 1 · Port 2' });
  await dialog
    .getByRole('combobox', { name: 'Destination port', exact: true })
    .selectOption({ label: 'Network switch 1 · Port 2' });
  await dialog.getByLabel('Purpose', { exact: true }).fill('QA workstation network');
  await dialog.getByRole('button', { name: 'Connect ports', exact: true }).click();
  await expect(page.locator('.schedule-table tbody > tr')).toHaveCount(3);
  await openView(page, 'Cable Schedule');
  await expect(
    page.getByRole('button', { name: 'End A allowance (mm)', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'End B allowance (mm)', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Termination total (mm)', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Search cable schedule', { exact: true }).fill('QA-NEW');
  await expect(page.locator('.schedule-table tbody > tr')).toHaveCount(1);
  await purposeField(page, 'QA-NEW').fill('QA edited purpose');
  await expect(purposeField(page, 'QA-NEW')).toHaveValue('QA edited purpose');
  await page.getByLabel('Search cable schedule', { exact: true }).fill('');
  await page
    .locator('.schedule-table')
    .getByRole('button', { name: externalId, exact: true })
    .click();
  await expect(page.locator('.cable-heading')).toContainText(/Provisional|Unknown|unresolved/i);
  await expect(page.getByLabel('End A allowance (mm)', { exact: true })).toHaveValue('60');
  await expect(page.getByLabel('End B allowance (mm)', { exact: true })).toHaveValue('60');
  await page.getByLabel('External distance has been entered', { exact: true }).check();
  await blurNumber(page.getByLabel('Manual external distance (mm)', { exact: true }), 5500);
  await blurNumber(page.getByLabel('Service loop (mm)', { exact: true }), 800);
  await blurNumber(page.getByLabel('End A allowance (mm)', { exact: true }), 100);
  await blurNumber(page.getByLabel('End B allowance (mm)', { exact: true }), 100);
  const required = await page.locator('.length-breakdown dd strong').innerText();
  expect(required).not.toBe('Unknown');
  expect(Number.parseFloat(required)).toBeGreaterThan(6.5);
  const schedule = await downloadText(
    page,
    page.getByRole('button', { name: 'Export CSV', exact: true }),
  );
  expect(schedule).toContain('QA-NEW');
  expect(schedule).toContain('QA edited purpose');
  expect(schedule).toContain(externalId);
  await page
    .locator('.inspector')
    .getByRole('button', { name: 'Select rack', exact: true })
    .click();
  await page.screenshot({ path: 'docs/screenshots/cable-schedule.png' });

  await openView(page, 'Procurement');
  await blurNumber(page.getByLabel('Fixed project reserve (mm)', { exact: true }), 300000);
  await expect(page.locator('.product-numbers > div').nth(2).locator('strong')).toHaveText('1');
  await expect(page.locator('.product-numbers > div').nth(3).locator('strong')).toHaveText('2');
  const procurement = await downloadText(
    page,
    page.getByRole('button', { name: 'Export CSV', exact: true }),
  );
  expect(procurement).toContain('Cat6A');
  await page.screenshot({ path: 'docs/screenshots/procurement.png' });
  await openView(page, 'Cut List');
  const cuts = await downloadText(
    page,
    page.getByRole('button', { name: 'Export CSV', exact: true }),
  );
  expect(cuts).toContain(externalId);
  expect(cuts).toContain('QA-NEW');

  await fileAction(page, 'Save');
  await expect(page.locator('.toolbar-save')).toContainText(/Saved locally/);
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  await openView(page, 'Cable Schedule');
  await expect(page.locator('.schedule-table tbody > tr')).toHaveCount(3);
  await expect(purposeField(page, 'QA-NEW')).toHaveValue('QA edited purpose');
  await fileAction(page, 'Open');
  const saved = page.getByRole('dialog', { name: 'Open local project' });
  // The empty starting rack is saved too when the example is imported; open the example.
  const example = saved
    .locator('.saved-project')
    .filter({ hasText: 'Vehicle communications · example' });
  await expect(example).toHaveCount(1);
  await example.click();
  await expect(page.locator('.toolbar-save')).toContainText('Opened from local storage');
  await expect(page.locator('.installed-pills > button')).toHaveCount(6);

  await openView(page, 'Cable Schedule');
  const before = JSON.parse(await downloadText(page, await fileItem(page, 'Export project'))) as {
    cables: { id: string; label: string; purpose: string }[];
  };
  const stableId = before.cables.find((cable) => cable.label === 'QA-NEW')?.id;
  expect(stableId).toBeTruthy();
  expect(stableId).not.toBe('QA-NEW');
  await page
    .locator('.schedule-table')
    .getByRole('button', { name: 'QA-NEW', exact: true })
    .click();
  const number = page.locator('.inspector').getByLabel(/^Cable number/);
  await number.fill('QA-RENAMED');
  await number.press('Tab');
  await expect(
    page.locator('.schedule-table').getByRole('button', { name: 'QA-RENAMED', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Renumber 0…', exact: true }).click();
  expect(
    (await page.locator('.schedule-table .cable-id').allTextContents()).map((text) => text.trim()),
  ).toEqual(['0', '1', '2']);
  const after = JSON.parse(
    await downloadText(page, await fileItem(page, 'Export project')),
  ) as typeof before;
  expect(after.cables.map((cable) => cable.id)).toEqual(before.cables.map((cable) => cable.id));
  expect(after.cables.find((cable) => cable.id === stableId)).toMatchObject({
    label: '2',
    purpose: 'QA edited purpose',
  });
});

test('new rack dimensions and inclusive depth sections persist while invalid overlapping sections are rejected', async ({
  page,
}) => {
  await open(page);
  await fileAction(page, 'New');
  await expect(page.locator('.installed-pills > button')).toHaveCount(0);
  await page.getByLabel('Rack name', { exact: true }).fill('QA rack B');
  await blurNumber(page.getByLabel('Height (U)', { exact: true }), 24);
  await blurNumber(page.getByLabel('Exterior width (mm)', { exact: true }), 620);
  await page.getByRole('button', { name: 'Add depth section', exact: true }).click();
  await expect(page.locator('.depth-section')).toHaveCount(2);
  const upper = page.locator('.depth-section').last();
  await blurNumber(upper.getByLabel('Illustrative exterior (mm)', { exact: true }), 850);
  await blurNumber(upper.getByRole('spinbutton', { name: /^Screw-plane depth \(mm\)/ }), 750);
  await page.getByRole('button', { name: 'Apply rack configuration', exact: true }).click();
  await expect(page.locator('.rack-u-label')).toHaveCount(24);
  await expect(page.locator('.inspector .rack-summary')).toContainText('QA rack B');
  await page.getByRole('button', { name: 'Show measurements', exact: true }).click();
  await expect(page.locator('.scene-dimension.vertical')).toContainText('1066.8 mm');
  await page.screenshot({ path: 'docs/screenshots/custom-rack.png' });

  await blurNumber(
    page.locator('.depth-section').first().getByLabel('Last U', { exact: true }),
    13,
  );
  await page.getByRole('button', { name: 'Apply rack configuration', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('every U exactly once');
  const json = JSON.parse(await downloadText(page, await fileItem(page, 'Export project'))) as {
    rack: { name: string; heightU: number; sections: { startU: number; endU: number }[] };
  };
  expect(json.rack.name).toBe('QA rack B');
  expect(json.rack.heightU).toBe(24);
  expect(json.rack.sections.map((section) => [section.startU, section.endU])).toEqual([
    [1, 12],
    [13, 24],
  ]);
  await fileAction(page, 'Save');
  await expect(page.locator('.toolbar-save')).toContainText(/Saved locally/);
  await page.reload();
  await expect(page.locator('.inspector .rack-summary')).toContainText('QA rack B');
  await expect(page.locator('.rack-u-label')).toHaveCount(24);
});

test('a storage failure preserves the current project when New is requested', async ({ page }) => {
  await open(page);
  const original = JSON.parse(await downloadText(page, await fileItem(page, 'Export project'))) as {
    id: string;
    devices: unknown[];
  };
  // Deliberate failure injection at the storage boundary, with no application
  // state manipulation: exercise the same save failure a full/quota store raises.
  await page.evaluate(() => {
    Object.defineProperty(indexedDB, 'open', {
      configurable: true,
      value: () => {
        throw new Error('Simulated storage quota failure');
      },
    });
  });
  await page
    .locator('.workspace-tabs')
    .getByRole('button', { name: 'Project Settings', exact: true })
    .click();
  await page.getByLabel('Project name', { exact: true }).fill('Recoverable QA project');
  await fileAction(page, 'New');
  await expect(page.getByRole('alert')).toContainText('Simulated storage quota failure');
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue(
    'Recoverable QA project',
  );
  await expect(page.locator('.toolbar-save')).toContainText('Save failed');
  const recovered = JSON.parse(
    await downloadText(page, await fileItem(page, 'Export project')),
  ) as { id: string; name: string; devices: unknown[] };
  expect(recovered.id).toBe(original.id);
  expect(recovered.name).toBe('Recoverable QA project');
  expect(recovered.devices).toHaveLength(original.devices.length);
});

test('imported power cable follows an existing curved run through UI edits and reload', async ({
  page,
}) => {
  await open(page);
  await page
    .getByLabel('Import project JSON', { exact: true })
    .setInputFiles(resolve('tests/fixtures/route-follow.rack.json'));
  await expect(page.locator('.installed-pills > button')).toHaveCount(3);
  await page.getByRole('button', { name: 'Project Settings', exact: true }).click();
  await expect(page.locator('.header-project')).toContainText('Follow existing power cable');
  await openView(page, 'Cable Schedule');
  await expect(page.locator('.schedule-table tbody > tr')).toHaveCount(2);
  await page.locator('.schedule-table').getByRole('button', { name: '1', exact: true }).click();
  let reference = page
    .locator('.inspector')
    .getByRole('combobox', { name: 'Reference cable', exact: true });
  await expect(reference).toHaveValue('cable-power-reference');
  await expect(page.getByLabel('Join run at (%)', { exact: true })).toHaveValue('35');
  await expect(page.getByLabel('Break out at (%)', { exact: true })).toHaveValue('65');
  await expect(page.locator('.cable-heading')).not.toContainText('Route invalid');
  const followingLength = await page.locator('.length-breakdown dd').first().innerText();
  await reference.selectOption('');
  await expect(page.getByLabel('Join run at (%)', { exact: true })).toHaveCount(0);
  await expect(page.locator('.length-breakdown dd').first()).not.toHaveText(followingLength);
  await reference.selectOption('cable-power-reference');
  await expect(page.locator('.length-breakdown dd').first()).toHaveText(followingLength);
  await expect(page.locator('.cable-heading')).not.toContainText('Route invalid');
  const exported = JSON.parse(await downloadText(page, await fileItem(page, 'Export project'))) as {
    cables: { id: string; followCableId: string | null }[];
  };
  expect(exported.cables).toHaveLength(2);
  expect(exported.cables.find((cable) => cable.id === 'cable-power-follower')?.followCableId).toBe(
    'cable-power-reference',
  );
  await fileAction(page, 'Save');
  await expect(page.locator('.toolbar-save')).toContainText(/Saved locally/);
  await page.reload();
  await expect(page.locator('.installed-pills > button')).toHaveCount(3);
  await openView(page, 'Cable Schedule');
  await page.locator('.schedule-table').getByRole('button', { name: '1', exact: true }).click();
  reference = page
    .locator('.inspector')
    .getByRole('combobox', { name: 'Reference cable', exact: true });
  await expect(reference).toHaveValue('cable-power-reference');
  await expect(page.getByLabel('Join run at (%)', { exact: true })).toHaveValue('35');
  await expect(page.getByLabel('Break out at (%)', { exact: true })).toHaveValue('65');
  await page
    .locator('.workspace-tabs')
    .getByRole('button', { name: '3D Rack Designer', exact: true })
    .click();
  await expect(page.locator('canvas')).toBeVisible();
  await setView(page, 'Rear');
  await expect(page.locator('.rack-u-label').first()).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/cable-follow.png' });
});
