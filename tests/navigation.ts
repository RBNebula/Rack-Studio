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
