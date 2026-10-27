import type { Page } from '@playwright/test';

/** Views that live under a top-level tab with its own sub-navigation. */
export type View =
  | 'Device Library'
  | 'Device Model Designer'
  | 'Cable Schedule'
  | 'Connections'
  | 'Cut List'
  | 'Procurement'
  | 'Power & Weights';

const parent: Record<View, string> = {
  'Device Library': 'Equipment',
  'Device Model Designer': 'Equipment',
  'Cable Schedule': 'Cabling',
  Connections: 'Cabling',
  'Cut List': 'Reports',
  Procurement: 'Reports',
  'Power & Weights': 'Reports',
};

/** Opens a workspace view with real clicks: its top-level tab, then the view's sub-tab. */
export async function openView(page: Page, view: View) {
  const group = parent[view];
  await page
    .getByRole('navigation', { name: 'Workspace', exact: true })
    .getByRole('button', { name: new RegExp(`^${group}`) })
    .click();
  await page
    .getByRole('navigation', { name: `${group} views`, exact: true })
    .getByRole('button', { name: view, exact: true })
    .click();
}

export type FileItem = 'New' | 'Open' | 'Save' | 'Export project';

/** Opens the header File menu (if closed) and returns one of its items. */
export async function fileItem(page: Page, item: FileItem) {
  const button = page.getByRole('button', { name: 'File', exact: true });
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  return page.getByRole('menu', { name: 'File', exact: true }).getByRole('menuitem', {
    name: item,
    exact: true,
  });
}

/** Runs a File menu command with real clicks. */
export async function fileAction(page: Page, item: FileItem) {
  await (await fileItem(page, item)).click();
}

export type CameraView = 'Front' | 'Rear' | 'Left' | 'Right' | 'Top';

/** Opens the view cube's Camera views menu (if closed) and returns one named view in it. */
export async function viewItem(page: Page, view: CameraView) {
  const toggle = page.getByRole('button', { name: 'Camera views', exact: true });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  return page
    .getByRole('group', { name: 'Camera views', exact: true })
    .getByRole('button', { name: `${view} view`, exact: true });
}

/** A named view's button in the (possibly closed) Camera views menu, for state assertions. */
export function viewState(page: Page, view: CameraView) {
  return page.locator(`.view-cube-menu button[aria-label="${view} view"]`);
}

/** Chooses a named camera view from the view cube's menu. */
export async function setView(page: Page, view: CameraView) {
  await (await viewItem(page, view)).click();
}

/** Selects installed equipment from the sidebar's Installed tab, then returns to the Library tab. */
export async function selectInstalled(page: Page, name: string) {
  await page.getByRole('tab', { name: /^Installed/ }).click();
  await page.locator('.installed-pills > button').filter({ hasText: name }).click();
  await page.getByRole('tab', { name: 'Library', exact: true }).click();
}
