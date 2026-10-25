# Rack Studio project status

Snapshot: 25 October 2026. Milestone: preserve the working lacing-bar/rear-placement foundation, import it to GitHub and establish reproducible agent handover. The complete original simulator remains unfinished. Read `progress.md` for historical evidence and `acceptance.md` for the full requirement matrix.

## Current subsystem status

“Implemented and verified” below means model/software checks for the supplied assumptions; it does not certify real hardware or a physically accurate installation. The migration baseline passes typecheck, lint, 302 unit/integration tests across 23 files, and production build. Current browser results and fresh-checkout results are recorded in `MIGRATION.md`; historical 29-workflow Edge evidence is in `validation/lacing-bar-browser-results.txt`.

| Subsystem | Status | Evidence and remaining boundary |
| --- | --- | --- |
| Rack geometry/variable depth | Implemented and verified | Inclusive depth sections, independent rail planes/exterior dimensions, members and end covers; geometry/construction/rack-frame tests. Actual rack calibration remains partial |
| Front/rear mounting, shelves | Implemented and verified | Explicit ear/rail contact, collisions, supported PCs; mounting/shelves/construction tests. Hardware/load validation remains open |
| Sliding rails | Partially implemented | Service poses, fixed/moving members, overlap and swept-volume checks tested. Latches, fixing mechanics and installation animation remain planned |
| Installation animations | Planned | Full screw/support/install/remove state machine is absent |
| Device definitions/designer | Implemented and verified | Editing, copy-as-new, ports/face rotation, procedural models, embedded face images, import/export. Photo calibration, advanced mesh import and measured catalogue models remain partial/planned |
| Named manufacturer models | Blocked | Catalogue reference drafts exist; missing measured chassis/ear/port/kit data prevents claiming finished compatible models |
| Physical connectivity | Implemented and verified | Stable endpoint IDs, compatible links, moving installed devices without discarding connections; connectivity/state/project tests |
| Geometric cable routing | Implemented and verified | Obstacles, leads, bends, guides, offsets and selected-run following. Unknown values remain diagnostic; no full physical cable simulation |
| Cable dynamics/global collision | Partially implemented | Solid and selected shared-path checks exist. Gravity, tension, slack accommodation and complete cable-to-cable checks are planned |
| Trays, clips/ties and looms | Partially implemented | Movable perforated tray visuals, attached guides and packed bundle routes tested. Flexible fixing behavior, hardware and slot-aware passage remain open |
| Rack exits/external destinations | Partially implemented | Logical survey and positioned 3D endpoints through exits work; general surveyed cutouts, exit capacity and gland hardware remain planned |
| Master schedule/cable lengths | Implemented and verified | Shared records/analysis, editable labels/columns, fixed preterminated lengths, separate bulk end allowances; lengths/analysis tests. Complete saved table templates remain partial |
| Reel allocation/procurement | Partially implemented | Continuous cuts, partial stock, product separation, waste/reserves and bounded optimisation tested; no cross-project stock reservation, pricing or assembly inventory |
| Reports | Partially implemented | Schedule/cuts/procurement CSV works with formula-prefix protection. XLSX/PDF and professional elevations planned |
| Project storage/undo | Implemented and verified | IndexedDB save/recovery/autosave, revision guard, JSON portability and atomic undo/redo tested. Hosted collaboration/version merging planned |
| Adjacent racks/modelling | Partially implemented | Origins, cross-rack links, assemblies, measuring and hide/isolate work; rack rotation and full empty-frame overlap prevention remain open |
| Browser performance | Implemented but not fully tested | Lazy scene/designer and cached analysis; synthetic geometric smoke fixture. Full FPS/memory/stress acceptance is unverified |
| Automated tests | Implemented and verified | 302 numeric/state tests baseline; 29 historical Edge workflows. Full controlled visual regression and coverage instrumentation are absent |
| Repository/CI/cloud readiness | Partially implemented during migration | Shared instructions, PR workflow and Linux browser selection added; see `MIGRATION.md` for actual upload/CI/fresh-clone evidence |
| Hosted backend/team features | Planned | No accounts, authorisation service, shared inventory or project backend; static frontend deployment is not private project hosting |

## Next work

First review the migration/CI evidence and keep `main` stable. The next product task should obtain and record the missing rack/device/support measurements, then add numeric and browser checks for the measured fit. This gates meaningful installation-animation and cable-dynamics work. Continue the priorities in `ROADMAP.md` on separate reviewed branches.

No application behavior was intentionally changed for the migration. Test tooling gains a cross-platform browser choice; runtime source remains preserved. Update this file after major work with the actual subsystem outcome, commands/results and remaining uncertainty.
