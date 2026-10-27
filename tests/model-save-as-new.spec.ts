import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Project } from '../src/model';
import { openView } from './navigation';

test.use({ baseURL: process.env.RACK_TEST_URL ?? 'http://127.0.0.1:5173' });
test.setTimeout(120000);
async function exported(page: Page): Promise<Project> {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export project', exact: true }).click();
  return JSON.parse(await readFile((await (await event).path())!, 'utf8'));
}
test('save as new preserves the source and its cables, edits only the copy and survives undo and reload', async ({
  page,
}) => {
  page.setDefaultTimeout(10000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.rack-u-label').first()).toBeVisible();
  const source: Project = JSON.parse(await readFile('examples/wiring-guides.rack.json', 'utf8'));
  await page
    .getByLabel('Import project JSON', { exact: true })
    .setInputFiles('examples/wiring-guides.rack.json');
  const original = source.definitions.find((d) => d.id === source.devices[0].definitionId)!;
  await openView(page, 'Device Model Designer');
  const models = page.getByRole('combobox', { name: 'Edit library model', exact: true });
  await models.selectOption(original.id);
  await expect(models).toHaveValue(original.id);
  const depth = page.getByLabel('Model depth (mm)', { exact: true });
  await depth.fill('410');
  await depth.press('Tab');
  await page.getByRole('button', { name: 'Save as new', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Save model as new', exact: true });
  await expect(dialog.getByLabel('New model name', { exact: true })).toHaveValue(
    `${original.name} copy`,
  );
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await exported(page)).definitions).toEqual(source.definitions);
  await expect(depth).toHaveValue('410');
  await page.getByRole('button', { name: 'Save as new', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Save model as new', exact: true });
  const name = dialog.getByLabel('New model name', { exact: true }),
    save = dialog.getByRole('button', { name: 'Save as new', exact: true });
  await name.fill(original.name.toUpperCase());
  await expect(save).toBeDisabled();
  await expect(dialog.getByRole('alert')).toContainText('already in the library');
  await name.fill(' ');
  await expect(save).toBeDisabled();
  await name.fill('Rack PC v2');
  await page.screenshot({ path: 'docs/screenshots/model-save-as-new.png' });
  await save.click();
  await expect(dialog).toHaveCount(0);
  let p = await exported(page);
  const copy = p.definitions.find((d) => d.name === 'Rack PC v2')!;
  expect(copy.id).not.toBe(original.id);
  expect(copy).toEqual({
    ...original,
    id: copy.id,
    name: 'Rack PC v2',
    depthMm: 410,
    ports: original.ports.map((port) =>
      port.surface === 'rear'
        ? { ...port, position: [port.position[0], port.position[1], 410.1] }
        : port,
    ),
  });
  expect(p.definitions.filter((d) => d.id !== copy.id)).toEqual(source.definitions);
  expect(p.devices).toEqual(source.devices);
  expect(p.cables).toEqual(source.cables);
  await expect(models).toHaveValue(copy.id);
  await depth.fill('420');
  await depth.press('Tab');
  await page.getByRole('button', { name: 'Save model to library', exact: true }).click();
  p = await exported(page);
  expect(p.definitions.find((d) => d.id === copy.id)?.depthMm).toBe(420);
  expect(p.definitions.find((d) => d.id === original.id)).toEqual(original);
  // Repeated Save as new gets a fresh identity and a distinct suggested name.
  await page.getByRole('button', { name: 'Save as new', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Save model as new', exact: true });
  await expect(dialog.getByLabel('New model name', { exact: true })).toHaveValue('Rack PC v2 copy');
  await dialog.getByRole('button', { name: 'Save as new', exact: true }).click();
  const duplicated = await exported(page);
  const second = duplicated.definitions.at(-1)!;
  expect(new Set([original.id, copy.id, second.id]).size).toBe(3);
  expect(duplicated.definitions).toHaveLength(source.definitions.length + 2);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await exported(page)).definitions).toEqual(p.definitions);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect((await exported(page)).definitions).toEqual(duplicated.definitions);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toolbar-save')).toContainText('Saved locally');
  await page.reload();
  const restored = await exported(page);
  expect(restored.definitions).toEqual(duplicated.definitions);
  expect(restored.devices).toEqual(source.devices);
  expect(restored.cables).toEqual(source.cables);
  expect(errors).toEqual([]);
});
