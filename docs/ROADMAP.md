# Remaining development roadmap

This is an evidence-based continuation plan, not a replacement for `requirements.md` or `acceptance.md`. Existing implementations must be extended without losing their tested behavior. Status terminology is defined in `PROJECT_STATUS.md`.

Active continuation issues: [measured geometry #1](https://github.com/RBNebula/Rack-Studio/issues/1), [installation state machine #2](https://github.com/RBNebula/Rack-Studio/issues/2), and [cable collision/slack/fixings #3](https://github.com/RBNebula/Rack-Studio/issues/3). Inspect these before creating overlapping work.

Immediate verification priority: [resolve the failing Linux Chromium baseline #4](https://github.com/RBNebula/Rack-Studio/issues/4). The full local Edge suite passes, but Linux CI has six observed failures and a cancelled incomplete run. Do not treat the cross-platform browser baseline as accepted.

| Priority/area | Existing foundation | Outstanding work / acceptance target |
| --- | --- | --- |
| 1. Rack geometry and depth | Variable inclusive U sections, independent screw planes/exterior dimensions, solid members and covers | Obtain measured frame/enclosure sections and clearances; validate transitions and adjacent-rack structure against that data |
| 1. Mounting, shelves and rails | Ear-bearing contact on either face, parametric shelves/supports, telescoping service geometry | Identify actual hardware/kit, load and fixing dimensions; calibrate support and swept travel. Keep rail spacing separate from enclosure depth |
| 2. Installation animations | Validated discrete service poses | Implement install/remove/support/screw/rail state machine, obstruction behavior and interruption/recovery with tests |
| 1. Custom devices, images and ports | Editable definitions, copy-as-new, embedded images, measured/provisional port records and face rotation | Finish missing catalogue datums; interactive crop/perspective/calibration, advanced geometry and GLB/glTF import; retain evidence and stable IDs |
| 2. Cable routing | Obstacle-aware geometric paths, leads, bends, waypoints, shared runs and guide editing | Complete direct cable-segment editing and constrained slack handling; then gravity/tension/connector behavior with explicit physical assumptions |
| 2. Collision detection | Device/support/solid route checks, oriented members and selected shared-path separation | Complete global cable-to-cable checks and measured exit/connector envelopes; route through real openings without weakening solid constraints |
| 2. Looms and trays | Perforated tray appearance, transforms, attached clips/ties and packed bundle guides | Flexible fixings/physical pads, hardware/joiners, slot-aware routing and stable breakout behavior |
| 2. Rack exits | Exit records route internal paths to logical or positioned destinations | Surveyed enclosure cutouts, orientation/capacity, glands and physical fixing geometry |
| 2. External destinations | Logical manual survey or explicit world-positioned endpoints | Broader environment geometry only where required; preserve mutually exclusive distance accounting |
| 2. Master cable schedules | Stable cable labels, configurable columns, CSV and shared analysis | Full persistent table sizing/reordering/template UX and complete source/destination editing acceptance |
| 2. Preterminated/bulk lengths | Fixed assembly lengths, bulk end allowances, explicit extras and unknown-route diagnostics | Physical excess/slack accommodation and assembly stock quantities without changing fixed lengths |
| 2. Reel optimisation | Continuous cuts, partial reels, reserves, alternatives in allocator and exact/bounded/heuristic reporting | Complete alternative-size UI and cross-project stock reservations/commit; stronger large-instance performance evidence |
| 2. Procurement documentation | Consistent cuts/reels/CSV from authoritative records | Pricing/suppliers, XLSX/PDF, professional elevations and complete export templates |
| 3. Thermal and airflow view | Per-model nominal/maximum draw, bank loads and an estimated rack heat output (W × 3.412 BTU/h) in the Power & Weights document | Record per-device heat sources and airflow (fan count/direction/flow, intake and exhaust faces, maximum operating temperature), enclosure state (sides/doors closed, vents, fans, front AC supply) and a toggleable approximate heat map in the 3D rack, to show where extra fans or cooling are needed. State it is an estimate, not CFD; keep unknown airflow values explicit |
| 3. Project storage | Local IndexedDB, recovery, JSON/library/assembly portability and undo | Secure hosted ownership/access, revision merging, asset storage/backups and shared inventory. Design concurrency before enabling collaboration |
| 2. Browser performance | Lazy loading, cached analysis and synthetic 42U/100-cable geometric smoke test | Representative complete scenes, browser FPS/memory/load measurements, worker scheduling if measured bottlenecks justify it |
| 1–3. Automated tests | Numeric/state suite and real-pointer browser workflows | Maintain CI on Linux, add targeted regressions, controlled visual baselines, measurable coverage and full section 21 demonstration |
| 1. Development continuity | Shared AGENTS instructions, status/architecture/decisions and branch/PR conventions | Keep issues small and evidence-based; keep docs updated; verify repository branch protection separately if desired |

Do not relabel provisional geometry as measured to unblock a milestone. A complete end-to-end demonstration still requires installation hardware, cable/fixing behavior and the requested exports. The static frontend is deployed privately behind Cloudflare Access (`HOSTING.md`); projects remain in each browser. Hosted project storage additionally requires a security design.
