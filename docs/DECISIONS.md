# Established decisions and open questions

Recorded from existing code and retained documentation, 25 October 2026. These are current conventions; historical rationale is only stated where the retained brief establishes it.

| Decision | Evidence / consequence |
| --- | --- |
| Browser-based, local-first application | `original-brief.md` requests a browser engineering tool with client-side modelling; React/Vite implementation and IndexedDB adapter satisfy that boundary. Ordinary use needs no account, cloud GPU or API key |
| Domain data is authoritative | `src/model.ts`, `data/project.ts`, `state.ts`: serialisable Zod-validated project graph and stable references; Three.js scene objects are projections |
| Millimetres internally | `geometry.ts`, `lengths.ts`, `procurement.ts`; `mmToScene` divides by 1000 at the scene boundary |
| Coordinates and U allocation | +Y up, +Z rear; +X appears left facing the front. U1 at Y=0, U pitch 44.45 mm and hole offsets 6.35/22.225/38.1 mm |
| Independent dimensions | Rack screw-plane spacing is distinct from exterior depth; device depth runs from ear plane to rear fascia. Inclusive sections cover all U positions. No generic rack standard proves exterior frame dimensions |
| Explicit mounting contact | Ear back faces bear on rail screw surfaces; rear mounting rotates X/Z together, including ports/normals. Shelves retain independent usable footprint/supports. Unknown ear thickness is labelled provisional |
| Definitions and installed instances separate | `definitions` hold geometry/ports/images; `devices` reference definitions by ID and carry placement. Built-ins are in `examples.ts` and `models/`; catalogue drafts retain missing measurements |
| Atomic state changes | Zustand `edit` clones, validates and commits; up to 50 undo snapshots. Drag previews are transient; existing known diagnostic issues do not automatically block unrelated edits |
| Cables are stable records | Endpoints reference physical device/port or external destination IDs, independent of display labels. Geometry is derived without discarding connections on equipment moves |
| Deterministic geometric routing | Visibility search, obstacle inflation, declared bend fillets and final sampled checks in `routing.ts`; no second render smoothing. Validity describes model constraints, not physical dynamics |
| External distance counted once | A logical destination uses manual survey after an exit; positioned `routeIn3D` endpoints include that section geometrically and ignore manual external length |
| Lengths preserve supply semantics | Bulk defaults: 60 mm each termination end and no automatic service loop. Preterminated length stays fixed; unknown required distances stay unknown |
| Continuous cuts and honest optimiser labels | `procurement.ts` separates products, waste, stock and reserves; exact search is bounded and distinguished from heuristic results. Planning does not consume shared stock |
| Local persistence adapter | `ProjectRepository` implemented by IndexedDB; JSON carries versioned records and validated embedded images. Autosave clears dirty only for the saved revision. No remote backend exists |
| Private static hosting on Cloudflare | `wrangler.jsonc` serves `dist/` from a Workers static-assets Worker on the custom domain `rackstudio.app` only; `workers.dev` and preview URLs are disabled. Worker-level Cloudflare Access gates every request. `public/_headers` sets a same-origin CSP and caching. No server code or secrets; projects stay in browser IndexedDB. See `HOSTING.md` |
| Five top-level workspace tabs | Owner approved option 3 of `ui-navigation-proposal.md` (27 October 2026): 3D Rack Designer, Equipment, Cabling, Reports, Project Settings, with sub-tabs for grouped views. Navigation only: workspace view ids, reports and data are unchanged. Browser tests open grouped views through `tests/navigation.ts` |
| Public repository with PR handover | Initial import to main, then independent branches/checkouts and reviewed PRs; `AGENTS.md` is authoritative, Gemini/Claude files link to it. Git shares files/history, not agent conversations or unsaved browser storage |

## Unresolved decisions

- Measured rack/device/port/support/hardware dimensions and manufacturer compatibility; do not guess them from nominal outlines.
- Physical cable solver, slack/fixing dynamics, global cable collision approach and installation-animation state machine.
- Photo/mesh authoring pipeline and calibrated collision decomposition.
- Backend/authentication/ownership, concurrent revision merging, asset storage and cross-project stock reservation design.
- Report export tooling and performance budgets. Hosting of the static frontend is decided (Cloudflare, see above); hosted project storage is not.

When resolving one, record evidence, tradeoffs, affected invariants and validation here and update the relevant feature guide/status.
