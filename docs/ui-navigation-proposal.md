# Proposal: fewer top-level workspace tabs

Status: **proposed, not implemented.** Nothing in this document changes the application until the owner approves it. Written 27 October 2026 alongside the UI polish branch.

## Problem

The workspace bar has nine peer tabs: 3D Rack Designer, Device Model Designer, Device Library, Connections, Cable Schedule, Cut List, Procurement, Power & Weights and Project Settings. At 1440 px they fill the bar, and several overlap:

- **Connections** and **Cable Schedule** render the same cable table from the same analysis (`Reports.tsx`, `isConn`). Connections adds external destinations and exits; the schedule adds column configuration and bulk status changes.
- **Cut List**, **Procurement** and **Power & Weights** are all read-mostly documents with the same layout (eyebrow, title, CSV/print actions, four KPI cards, callout, tables). Users switch between them when preparing a build pack.
- **Device Model Designer** and **Device Library** both manage equipment definitions; the designer is effectively an editor opened from the library.

## Proposed structure (five tabs)

| New tab | Contains | Notes |
| --- | --- | --- |
| **3D Rack Designer** | unchanged | Primary workspace |
| **Equipment** | Library (default) · Model designer | Sub-tabs inside the workspace header. "Edit in designer" on a library card opens the designer sub-tab with that model |
| **Cabling** | Schedule (default) · Connections & destinations | One cable table; destinations/exits become a section or sub-tab. Column settings stay with the schedule |
| **Reports** | Cut list · Procurement · Power & weights | Sub-tabs share one document frame and one set of Export CSV / Print actions |
| **Project** | Settings (unchanged) | Could also move to the header avatar menu |

Each sub-tab keeps its current component, so no engineering code, calculation or data format changes. The cable-count badge moves to **Cabling**; a review-count badge could appear on **Reports** when power or cable issues exist.

## Compatibility and risk

- **Workspace state**: `state.ts` stores `workspace` as one of the nine ids. Keep those ids as the internal sub-view identity and add a derived top-level group, so saved sessions, deep links and the restore-after-reload behaviour keep working.
- **Browser tests**: many workflows click tabs by accessible name (`getByRole('button', { name: 'Cable Schedule' })`, `'Device Model Designer'`, `'Power & Weights'`, `'Device Library'`…). Either keep those names on the sub-tab buttons (recommended: tests then only need the parent tab clicked first) or update every affected spec in the same commit, as AGENTS.md requires.
- **Print layout**: the Power & Weights print rules hide the workspace bar; a sub-tab bar must be hidden in print as well.
- **Discoverability**: two clicks instead of one for Procurement and Power. Mitigate with the sub-tabs visible in the workspace header and a remembered last sub-tab per group.

## Alternatives considered

1. **Keep nine tabs, group visually** with dividers (Design | Equipment | Cabling | Reports | Project). Lowest risk, no navigation change, modest gain.
2. **Merge Connections into Cable Schedule only** (eight tabs). Smallest real consolidation.
3. **The five-tab structure above** (recommended).

## Decision needed

Please choose 1, 2 or 3 (or amend the grouping). Implementation would follow on a separate branch with the test updates in the same commit and before/after screenshots.
