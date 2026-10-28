# Rack Studio

[![Validate](https://github.com/RBNebula/Rack-Studio/actions/workflows/ci.yml/badge.svg)](https://github.com/RBNebula/Rack-Studio/actions/workflows/ci.yml)

A local-first browser workspace for rack layouts, persistent port connections, geometric cable routes, master schedules and continuous cable-cut planning. This is a **working foundation milestone**, not acceptance of the complete simulator specified in [the retained brief](docs/original-brief.md).

## Run locally

Install a supported Node.js version (22.13+,24.x,or26+; Node24 recommended) and pnpm11, then run from this directory:

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://127.0.0.1:5173/** in a desktop browser. All ordinary modelling and storage run locally; no account, cloud GPU or API key is needed. Use **Node.js 24** and the pinned **pnpm 11.25.0** for reproducible setup. Install pnpm with `npm install --global pnpm@11.25.0` if it is not already available.

On this Windows workspace, **`Start Rack Studio.cmd`** starts the existing production build on port4173 and opens the browser. Keep its terminal open while using the application.

The browser must support WebGL for the viewport and IndexedDB for saving. Enable browser hardware acceleration where available. There is no hosted project backend in this milestone.

The same static build can be hosted privately at `https://rackstudio.app` on Cloudflare, behind Cloudflare Access sign-in. Projects still stay in each browser. See [hosting](docs/HOSTING.md).

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm preview
pnpm test:e2e
```

The production build is in `dist/`; serve it over HTTP with `pnpm preview` (normally port4173). Browser tests use installed Microsoft Edge on Windows and bundled Chromium on Linux. Run `pnpm exec playwright install --with-deps chromium` on Linux first. On Windows, bundled Chromium can be selected with `$env:RACK_BROWSER_CHANNEL='chromium'` after `pnpm exec playwright install chromium`. Tests require browser-process and loopback access. See [testing](docs/TESTING.md).

## Continue development

```sh
git clone https://github.com/RBNebula/Rack-Studio.git
cd Rack-Studio
pnpm install --frozen-lockfile
pnpm check
git switch -c feature/your-task
pnpm dev
```

Read [AGENTS.md](AGENTS.md) and [project status](docs/PROJECT_STATUS.md) before editing. Use one branch and separate checkout/worktree per concurrent agent; push a branch and open a pull request for approval. GitHub carries committed code and documentation, not conversations or unsaved browser projects. Export project JSON separately to move browser work between devices. Store private designs outside this public repository.

See [architecture](docs/ARCHITECTURE.md), [roadmap](docs/ROADMAP.md), [decisions](docs/DECISIONS.md), [cloud setup](docs/CLOUD_SETUP.md), [hosting](docs/HOSTING.md) and [migration verification](docs/MIGRATION.md). No runtime environment variables or production credentials are required. `RACK_BROWSER_CHANNEL`, `RACK_TEST_URL` and `CI` are optional test controls described in the testing guide.

## Current workflows

- Add an **Adjustable lacing bar · middle hole** from Cable management, with one screw per side, 150 mm clear inward reach and editable profile. Click **Rear** before dragging equipment for rear mounting, or choose **Mount: Rear** in the viewport; precise placement also supports both faces. See [placement and lacing bar controls](docs/user-guide.md).

- Rotate connectors on their faces in the model designer or library port editor: quarter-turn button plus an exact angle field, with matching previews, socket openings and saved definitions. See [connector rotation](docs/model-designer.md#rotate-a-connector).

- In **Equipment → Device Model Designer**, load an existing model, make changes and choose **Save as new** to name an independent variant. Original definitions, installed equipment and cables stay unchanged; later saves edit the copy. See [designer controls](docs/model-designer.md).

- Add **Generic 24-port switch · 1U**: silver chassis, slotted ears, 24 numbered RJ45 ports in one row, two front SFP cages and one rear IEC C14 inlet. Existing projects can add it from the library without replacing their old switch connections. See [switch model and provisional dimensions](docs/generic-switch.md).

- Open **Modelling tools** to drag guides, move/rotate trays anywhere, duplicate/align objects, measure surfaces and hide/isolate components. Surface-attached clips/ties, packed shared bundle paths, tray routing, movable vehicle endpoints, adjacent racks and portable rack assemblies are available. See the [control and equipment-finalisation guide](docs/modelling-workspace.md).

- Enter Wiring mode to connect ports by clicking, place reusable waypoints 10 mm off actual surfaces, and Shift-click/two-click line guides. Select a cable and link guides in order, reverse lines, reorder/unlink and edit coordinates. Rear slide brackets now contact the exposed post faces without entering the steel. See [Wiring mode](docs/wiring-mode.md).
- Fit optional sliding rails per rack chassis and toggle its service position. Outer supports stay at the front/rear posts; the example uses 500 mm rail projection and approximately 600 mm chassis protrusion. Ports move with the chassis, rail solids affect cable routing and fixed assembly lengths remain unchanged. See [rail controls and calibration limits](docs/device-rails.md).
- Design a device in its own 3D workspace, drag sockets/fans/grilles onto front/rear faces, and save it to the rack library. Perforated PVC tray sections have repeated fixed-size holes and an end stretch handle. See [designer and tray guide](docs/model-designer.md) for controls, the PCT110 source and provisional dimensions.
- Configure rack height, width, screw-plane depth and optional inclusive U-depth sections. New projects have one section; steps are added deliberately. U1 is at the bottom. Square mounting holes with cage nuts are the user-selected default; round/threaded choices remain available. Exterior frame dimensions remain illustrative until measured independently.
- Rack-mounted equipment has explicit ears whose back faces contact the rail surfaces exactly, including generic 1U and 2U shelves. Front/rear mounting uses the same contact rule, and ear solids participate in collisions. Unknown ear thickness uses a clearly labelled 2 mm preview; freestanding PCs remain supported by their shelf. See [the mounting correction and next steps](docs/mounting-and-next-steps.md).
- Adjust exterior sections, front/rear rail planes, rail profiles, parametric shelves and explicit structural members independently. Shelf overall/usable dimensions and additional support components are separate. Solid box, angle and channel beams have configurable positions, dimensions and orientation; no measured supports are inferred. See [configurable construction](docs/configurable-construction.md) and the [19-inch interface reference](docs/rack-standard-reference.md).
- Photo-referenced flat racks have complete top/base framing and optional independent end covers. Solid and perforated 1–4U blanks use thin folded sheet geometry, integral slotted ears and actual visible through-holes, without equipment lettering or dummy ports. Geometry remains provisional; cable collision uses a conservative closed sheet. See [visual reference models](docs/visual-references.md).
- Search the equipment library, create/edit/duplicate/import/export definitions, upload embedded front/rear images, define measured ports and compound box components. Drag generic equipment into the rack or use precise U placement. Invalid placements are rejected with explanations. Move installed equipment while retaining its cable connections. Shelf-mounted PCs retain their support relationship.
- The requested APC models appear as catalogue references (the Cisco and Connectix references were retired on 28 October 2026). Their unknown chassis/ear/port datums are explicit; incomplete drafts cannot be saved as usable geometry. See [source facts and missing measurements](docs/equipment-sources.md).
- Connect compatible physical ports to create stable cable records. External destinations can be logical records with manual surveyed distance, or positioned 3D endpoints routed through a rack exit. Moving a positioned endpoint updates the route; manual external distance is ignored in that mode. No vehicle body model is required.
- Edit cable waypoints, diameter, clearance, bend specification, supply type, manual external distance and allowances. Cable numbers start at0; rename or renumber labels without changing internal identity. A cable may follow a selected portion of an existing cable run, with parallel offset and independent endpoint breakouts. Impossible joins remain invalid.
- The schedule, cutting plan and procurement report derive from the same records. Bulk cables default to60mm at each end and zero service-loop allowance. The schedule shows endA, endB and their total. Preterminated assemblies retain their supplied length and do not receive bulk termination allowances.
- Plan continuous cuts against new and partial reels, separate products, cutting waste and configurable reserve rules. Exact optimisation is bounded and clearly distinguished from heuristic/bounded-search results. Provisional routes cannot become invented zero-length cuts. Existing stock is planned without being consumed or reserved across projects.
- A first visit starts with a blank rack and later visits reopen the last saved project. Save/reopen projects in IndexedDB, recover the last saved project, undo/redo meaningful edits, and export/import complete versioned JSON including embedded images. CSV reports use explicit millimetre columns and neutralise spreadsheet formula prefixes in text.

## Evidence and outstanding scope

See [test evidence and milestone status](docs/progress.md), the [38-criterion acceptance matrix](docs/acceptance.md), [requirements register](docs/requirements.md), [architecture](docs/ARCHITECTURE.md) and [user guide](docs/user-guide.md).

The viewport and numeric tests validate supplied geometric assumptions. They do not certify an installation, load capacity, manufacturer's mounting compatibility, electrical/network compliance or cable dynamics. Catalogue dimensions alone do not establish mounting-ear datums or connector positions.

The complete requested simulator is still open. Installation/fastener/rail animation, full flexible-cable physics, full fixing dynamics and global cable-to-cable checks, calibrated photographs, extrusions/GLB import, surveyed enclosure openings, XLSX/PDF exports, full stress/visual regression acceptance and the complete section21 demonstration remain unimplemented or unverified. These requirements have been retained rather than removed.

## Examples

- `examples/lacing-bars.rack.json` and `.library.json`: generic front/rear middle-hole lacing bars with 150 mm clear reach and editable provisional profile.

- `examples/generic-switch-24.rack.json` and `.library.json`: standalone scene and reusable generic 24-RJ45/2-SFP switch with rear AC power.

- `examples/modelling-workspace.rack.json`: two adjacent racks, independent side/under/top trays, a two-cable clip/tie bundle, cross-rack cable and movable vehicle endpoint. Dimensions and bend specifications remain provisional.

- `examples/user-rack-pc.rack.json`: photographed 1U PC with user-measured 431.8 mm chassis width, 482.6 mm ear width and 381 mm depth. Physical height 43 mm and all 17 port centres remain provisional photo estimates. New projects include **User rack PC · 1U**; existing projects can import `examples/user-rack-pc.library.json` through the expanded equipment library. See [reference and calibration notes](docs/user-pc-reference.md).
- `examples/communications-rack.rack.json`: flat illustrative rack, generic installed equipment, internal cable and surveyed-example external run.
- `examples/stepped-rack.rack.json`: explicitly stepped illustrative example.
- `examples/configurable-construction.rack.json`: requested provisional 20U reference, 800/750 mm overall-depth sections, separately editable rail spacing and a generic shelf; no inferred beams or crossmembers.
- `examples/flat-rack-reference.rack.json`: photo-referenced flat 20U frame with a top and base; no depth step.
- `examples/blanking-plates-reference.rack.json`: thin solid/perforated folded blanks, including rear mounting, in the flat reference rack.
- `examples/route-follow.rack.json`: its power distributor and both power cables were removed with the retired equipment (28 October 2026), so it now holds only the two PCs. Browser tests keep the original route-following case in `tests/fixtures/route-follow.rack.json`.
- `examples/geometric-stress.rack.json`: synthetic42U/40-device/240-port/100-cable smoke benchmark fixture; not the full stress acceptance scene.
- `examples/master-cable-schedule.csv`, `cable-cutting-plan.csv`, `procurement-report.csv`: exports from the flat example's authoritative records.
- `examples/calculation-evidence.json`: route validity, advisories and procurement breakdown behind those reports.

Regenerate them with `node scripts/export-examples.mjs`. Illustrative external survey values in these fixtures are not measurements of a real vehicle.

## Repository structure

```text
src/model.ts              Versioned runtime schemas and central domain records
src/examples.ts           Explicit generic fixtures and current defaults
src/catalogue.ts          Sourced incomplete equipment references
src/engineering/          Pure geometry, routing, lengths and procurement
src/data/                 Import integrity and IndexedDB repository adapter
src/state.ts              Atomic edits and undo/redo history
src/ui/                   React interface and Three.js scene projection
tests/                    Browser workflows using real pointer interactions
docs/                     Source brief, decisions, acceptance and evidence
examples/                 Portable sample projects and consistent CSV reports
```
