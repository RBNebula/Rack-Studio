# Requirements and engineering decisions

Baseline: 22 October 2026. The complete, unedited user specification is retained in [original-brief.md](original-brief.md). It is authoritative; this register organises its requirements and does not reduce their scope. Each `REQ-N` maps to section N of that specification. Every bullet and example under a referenced section remains in scope, including requirements not individually repeated here.

The intended product is a working, browser-operated engineering application for rack configuration, equipment mounting, physical cable routing, documentation and procurement. This is a staged implementation of that complete product. A runnable foundation or illustrative scene is not full acceptance.

## Status and evidence rules

- **Not implemented**: there is no accepted implementation or validation evidence yet.
- **In progress**: implementation exists or is being developed, but acceptance is incomplete.
- **Blocked on specification**: physical behaviour depends on a confirmed engineering decision.
- **Implemented, unverified**: code exists; required verification has not passed.
- **Verified**: the stated requirement has passed its appropriate checks, with commands/results or artifacts recorded in [acceptance.md](acceptance.md).
- **Future deployment**: explicitly deferred hosted/desktop capabilities from the brief; retain architecture compatibility and do not imply that these are implemented.

Build success, a screenshot, and unit tests are different evidence. None independently establishes all physical and interaction requirements.

## Complete section traceability

| ID | Specification section and retained scope | Planned systems/stages | Initial status | Required evidence |
|---|---|---|---|---|
| REQ-1 | Senior engineering execution; complete working application; all mandatory development principles; no invented accuracy or completion claims | All | In progress: specification review | Whole-product acceptance and honest evidence register |
| REQ-2 | Requirements discovery; grouped essential questions; dimensional provenance; bottom U convention and U16 inclusion; requirements/assumptions register | Foundation, rack, assets, lengths | In progress: clarification requested | Confirmed decisions before dependent physical geometry |
| REQ-3 | Current compatible stable stack verified from official documentation; local-first browser computation; worker opportunities; future hosted and desktop architecture; 15 separate systems; stable IDs; mm; undo/redo | Foundation, persistence, future hosted stage | Not implemented | Dependency verification record; type/build tests; architecture review; operation without login/cloud |
| REQ-4 | Rack properties; accurate mounting pattern; 44.45 mm U; stepped depth and supporting structures; guided photo calibration/manual geometry; all camera views and visibility | Stages 1–2, 12 | Blocked on physical specification | Numerical geometry assertions, visual review, confirmed rack construction |
| REQ-5 | Searchable reusable custom library; independent persistent instance definitions; all dimensional/image/port fields; seven mounting types; photo tools; compound/imported geometry | Stages 3, 12 | Not implemented | Definition CRUD/import tests, safe deletion, geometry and asset validation |
| REQ-6 | True library-to-scene drag; preview, occupancy, snap and camera lock; exact collision-aware U placement; direct, rail and shelf installation/removal; testable explicit animation states | Stages 3–4 | Not implemented | Actual pointer E2E, numerical final poses, mounting compatibility and interrupt/undo tests |
| REQ-7 | Individually identified typed ports; calibrated image editor; local positions/orientations; compatible port-to-port connections; duplicate-use rules; persistent connectivity | Stage 5 | Not implemented | Coordinate/compatibility unit tests; movement and reload browser checks |
| REQ-8 | Defined flexible cable diameter; manual waypoints/segments; real 3D path length; fixed-length/slack distinction; physical obstacle/radius clearance after smoothing; solver evaluation; bend validation; endpoint updates | Stage 6 | Not implemented | Deterministic routing fixtures and final tube collision checks; interactive editing |
| REQ-9 | Loom membership preserving each cable; shared sections/branches; physical bundle envelope; wrap options; tied constraints persisted and attached | Stage 7 | Not implemented | Five cables remain five schedule rows; branch/envelope/tie constraint tests |
| REQ-10 | Pads, mounts, P-clips; parent surface attachment; dimensions/orientation; cable constraints; moving-parent behaviour; mounting suitability provenance | Stage 7 | Not implemented | Attachment and transformation tests; persistence; visual mounting review |
| REQ-11 | Basket, perforated, solid, vertical/horizontal managers, rings and ducts; dimensions/mounts/entries/exits/capacity; routing within usable space and through openings | Stage 7 | Not implemented | Tray routing and wall-collision fixtures, tie attachment browser checks |
| REQ-12 | Physical exits/opening clearance and identity; logical external destinations/ports; many cables per exit; complete internal/external example; calculated/manual/unknown length distinction; future environment compatibility | Stage 8 | Not implemented | Exit collision geometry, destination persistence, unknown-length schedule tests |
| REQ-13 | One authoritative cable schedule; all record fields/IDs; configurable numbering; internal/external cables once each; filters/groups; interactive custom columns/templates/bulk edits; scene selection linkage | Stage 9 | Not implemented | Schedule fixtures A/B/H; table interaction and reload; export parity |
| REQ-14 | Preterminated supplied length and product identity; no stretching; explicit excess management; bulk cut length; separate end terminations/allowances; no double counting; visible upward rounding; provisional and specification-based validation | Stage 10 | Not implemented | Exact numeric examples, fixed-length mutation checks, incomplete-length cases |
| REQ-15 | Product-specific reel sizes/stock/partials; sum bulk only once; aggregate lower bound plus continuous cut allocation; honest optimality claims; configurable reserve separate from minimum; cutting plan, purchasing and reservations | Stage 11 | Not implemented | Scenarios A–D; allocation feasibility and inventory tests; verified summary |
| REQ-16 | CSV/XLSX/PDF master schedule; cut and purchasing lists; selectable documentation; project metadata; numeric and identifier fidelity; one calculation source | Stages 9–11 | Not implemented | Parse/reconcile exports; visually review PDF/XLSX and project metadata |
| REQ-17 | Engineering UI: left library, large 3D workspace, right context editor, seven workflows, complete toolbar; accessible feedback and keyboard alternatives; 1920×1080 support | Stages 1–14 | Not implemented | Browser interaction/accessibility checks and actual screenshots |
| REQ-18 | IndexedDB save/open/autosave/recovery; full versioned validated JSON; complete asset persistence; project duplication; screenshot/elevations/lists/exports; migrations; future storage abstraction | Stages 1, 13 | Not implemented | Complete-model round trip and recovery/import failure cases; assets survive reopen |
| REQ-19 | All fourteen implementation stages and their validation gates; runnable progression; initial stages do not establish full completion | All | In progress: plan recorded | Milestone evidence in progress register |
| REQ-20 | Unit, numeric geometry, final cable geometry, schedule scenarios A–J, true interaction, stateful animation, visual regression, measured stress performance, quality gates and CI | Every stage | Not implemented | Executed tests with results, baseline screenshots, documented hardware/budgets |
| REQ-21 | All twenty sample scene elements and complete 31-step create-to-reopen demonstration | Final integration | Not implemented | Recorded successful workflow, portable sample project, exports and reload checks |
| REQ-22 | Understandable actionable errors for every specified failure; no invalid silent geometry/data loss; recovery | Every stage | Not implemented | Negative cases, browser error flows, recovery verification |
| REQ-23 | Complete engineering/developer/user documentation; genuine screenshots; samples and fixtures | Every stage | In progress: baseline documentation | Documentation review against complete topic list |
| REQ-24 | Progress register covering work, assumptions, bugs, coverage, results, limitations; evidence review per milestone; user consultation for accuracy/major scope | Every stage | In progress: register created | Up-to-date progress and acceptance documents |
| REQ-25 | All 38 final product criteria and eleven handover deliverables; explicit implementation/validation/evidence matrix | Final acceptance | Not implemented | [acceptance.md](acceptance.md) fully supported by actual results |
| REQ-26 | Read whole brief, inspect environment, identify missing engineering data, clarify, propose architecture, initial structure/tests, implement first unblocked milestone | Foundation | In progress | Environment/dependency evidence, complete brief retained, decisions and first validation |

## Outstanding engineering decisions

These are questions, not assumptions about the real installation. Generic infrastructure may proceed using explicitly marked examples; dependent geometry must retain an unverified/configurable status.

| Decision | Required confirmation | Impact / safe interim handling | State |
|---|---|---|---|
| ENG-01 | Does rack depth mean outside frame, usable internal space, mounting-rail spacing, or another datum? | User confirmed depth is front screw plane to rear screw plane. Keep exterior/usable depth separate. The numeric example spacing is still unverified | Confirmed measurement meaning |
| ENG-02 | Where is the front datum, and does a depth change move rear posts, front posts, or both? | User requested no depth step by default. Default workspace is one depth section; stepped capability remains required. Physical step construction and fixed faces still need evidence for a real stepped rack | Default clarified; step construction unresolved |
| ENG-03 | What supports depth transitions: stepped posts, plates, braces, crossmembers and their dimensions? | User-editable primitives can represent example metalwork; no verified structural claim | Awaiting user |
| ENG-04 | Are U positions counted bottom-up and does a section starting U16 include U16? | User confirmed U1 at the bottom. No step is needed by default. UI section bounds are explicitly inclusive examples; real transition construction is still unconfirmed | Bottom-up confirmed; step-specific details open |
| ENG-05 | Nominal width, applicable mounting standard/hole type and precise geometry? Front/rear posts at every height? | User confirmed square mounting holes with cage nuts as the default. 44.45 mm/U is specified; exact frame dimensions, hole dimensions and product-specific mounting compatibility still require evidence. Hole-centre spacing has a cited generic standard reference | Square/cage-nut default confirmed; measured construction open |
| ENG-06 | Are front and rear equipment mounts both used; how are vehicle-specific side/bracket mounts built? | User confirmed mounting from both front and rear. Model retains mounting face and support identity. Vehicle-specific side/bracket construction remains unknown | Front/rear confirmed; special mounts unresolved |
| ENG-07 | Can actual rack photos, drawings and measurements be supplied, with more than one view where necessary? | Calibration workflow must distinguish known scale, user-confirmed geometry and inferred unknowns | Awaiting user |
| ENG-08 | Which devices, rail kits, shelves, trays and mounting hardware must match real products? Are certified dimensions/specifications available? | Named references and official/identified-retailer facts are recorded in [equipment-sources.md](equipment-sources.md). Published catalogue values do not establish chassis/ear datums, exact ports, screw coordinates or rail compatibility. Generic examples remain illustrative | References supplied; complete physical models unverified |
| ENG-09 | What external destinations need 3D positions vs schedule-only logical entries? Which exits/opening sizes apply? | User confirmed logical external destinations reached through rack exits; a full vehicle model is not required. Exit measurements and external surveyed distances remain project inputs | Logical destination workflow confirmed |
| ENG-10 | What are normal service-loop, per-end termination, waste and cut rounding rules? | User requested no service loops by default and selected 60 mm termination allowance at each end: 120 mm total on bulk cables. End A, end B and total appear as default schedule columns and remain editable per cable. Manufacturer-specific cable limits and project waste/rounding rules still need specification | User-selected loop/termination policy confirmed; other engineering limits open |
| ENG-11 | Which schedule columns, cable ID conventions, purpose/status fields and reusable templates are required? | User requested cable numbers 0 through x, editable names/numbers and renumbering. Persistent internal IDs must remain stable beneath mutable display labels. Company-specific columns/templates remain configurable and unconfirmed | Numbering/renaming confirmed; template details open |
| ENG-12 | Which stock products/reel sizes, existing partial reels and reserve rules apply? | 305 m is an example, not universal. Product identity includes specification and colour | Awaiting user |
| ENG-13 | Which cable bend radii, maximum run/link specifications, and manufacturer limits apply? | Unknown limits remain unknown; configurable generic values are not manufacturer specifications or compliance evidence | Awaiting user/reference |
| ENG-14 | Which collision/length tolerances and performance target hardware are acceptable? | Document numerical tolerances and measured hardware before acceptance; no unmeasured FPS claims | To establish from validation |
| ENG-15 | Which hosting provider, organisation model and access policy apply when deployment is reached? | Local operation works independently. Standard auth plus permissions required before private hosted projects | Future deployment decision |
| ENG-16 | From which datum is equipment depth measured? | User defines device depth as mounting-ear screw plane to rear fascia. Published overall/unit depth must not silently substitute for that datum. Ear offsets, front/rear projections and chassis width excluding ears need drawings or measurements | Measurement meaning confirmed; product values unresolved |

### Additional user steering retained

The user also requested that a cable can follow an existing cable run. This extends REQ-8/9: a cable must retain its own endpoint identity and record while using a selected portion of another cable's physical route, with a distinct offset/envelope, constraint validation and clear errors for invalid references or cycles. It must not become a duplicate connection or merely a decorative shared line. Implementation and acceptance evidence for this extension must be recorded separately from generic waypoint routing.

Named product references supplied later in the conversation belong in a specification catalogue with source provenance and unknown dimensions exposed. See [equipment-sources.md](equipment-sources.md) for the reviewed references and the exact limitations of those sources. A catalogue entry must not become a supposedly verified installable model until its relevant dimensions, mounting geometry and port locations are defined and validated. Generic examples remain separate from product-specific claims.

Subsequent construction steering explicitly authorises configurable generic reference models while real calibration is deferred. The requested test is 20U, with provisional overall-depth sections 800 mm at U1–U15 and 750 mm at U16–U20, inclusive. Mounting-rail spacing must remain independent of overall depth. The nominal 19-inch interface follows the [primary-source reference](rack-standard-reference.md); exterior width, rail profile and structural members are not determined by that interface. Generic shelves need configurable U height, overall/usable depth, mounting arrangement and front/rear placement; additional supports require explicit geometry. Do not infer adjacent-rack or transition beam positions, dimensions or shapes. Rack envelopes, rails, shelves and supports must remain independent editable components, with provisional evidence retained through save/load. See [configurable construction](configurable-construction.md) for implementation and the reference fixture. Physical measurements are needed for later calibration, not permission to continue generic development.

The user subsequently supplied four photographs as qualitative references for a plain constant-depth rack, solid blanks and perforated blanks. Preserve the flat open frame with complete top/base framing and separately selectable covers; do not introduce a depth step from those pictures. Blanks should use thin folded sheet construction, integral mounting flanges, slotted fixings and clean faces; perforated blanks should visibly reveal the scene through circular holes. No physical dimensions, gauge, load rating or fastener tolerances are inferred from those photographs. Earlier stepped examples and independently configurable components remain available. See [visual-references.md](visual-references.md).

The user then supplied eleven photographs of an actual rack PC and measured 15-inch ear-plane-to-rear depth, 17-inch chassis width and 19-inch overall ear width (381 / 431.8 / 482.6 mm). They confirmed 1U allocation; exact physical height will follow. Model the photographed two front and fifteen rear sockets at editable photo-estimated positions. Keep the provisional 43 mm physical height, fitting dimensions and uncertain upper rear video connector distinct from the measured dimensions. Do not infer a manufacturer, interface speed or compatible support kit. See [PC reference and port mapping](user-pc-reference.md).

## Architecture plan

Subsequent rail steering: use the supplied rail photos/assembly sheet as modelling reference for separate rack-fixed outer supports and chassis-attached sliding members. Provide per-instance rail and pull-out toggles. The user clarified 500 mm rail projection and approximately 600 mm PC protrusion, with freely adjustable front/rear mounting span and no manufacturer min/max assumption. Keep profile dimensions and compatibility provisional; include rail solids in cable interaction and preserve fixed cable lengths. See [device-rails.md](device-rails.md).
React/TypeScript/Vite is the preferred browser shell. Three.js through React Three Fiber/Drei renders the typed project model; renderer objects are derived and must never be authoritative records. A pure TypeScript domain layer owns engineering calculations. Runtime schema validation guards import/persistence boundaries. IndexedDB stores local projects and assets through a storage interface that can later support a backend. The initial app must work without a paid service, account or AI API. Package versions must be checked against official stable documentation before installation; this document does not claim that check has been performed.

| Independent system | Responsibility and contract |
|---|---|
| Rack geometry | Rack dimensions, inclusive depth-section UI semantics once confirmed, structural solids, mounting datums and opening geometry |
| Definitions/assets | Versioned device definitions, independent project snapshots, calibrated images, imported model scale/orientation, provenance |
| Placement/mounting | Authoritative placement, support relationships, occupied volumes, mounting compatibility and load/clearance checks |
| Interaction/animation | Explicit state machine, drag lifecycle, camera arbitration, interruption/undo and final physical pose |
| Ports/connectivity | Stable device-instance/port identity, connector rules, local/world transforms, endpoint cardinality |
| Cable routes/geometry | Endpoint/waypoint/constraint inputs → deterministic path, final smooth geometry, physical radius clearance and diagnostics |
| Cable physics/constraints | Evaluate constrained spline/PBD/Verlet/Rapier hybrid using deterministic routing plus local behaviour; preserve user route/fixed length |
| Accessories/management | Shelves, rail kits, trays, tie pads, clips, ties, anchor relationships and physical capacities |
| Exits/destinations | Boundary openings and clearances, logical/positioned external endpoints, route segment provenance |
| Schedule | One record per physical cable, configurable projections/filtering/templates and selection identity |
| Length/procurement | Integer or bounded-precision mm calculations, explicit allowances, rounding, stock/continuous cuts, reserve advice |
| Import/calibration | Images/outlines/primitives/GLB import, known references, scale/orientation verification and asset security |
| Persistence/export | Versioned schema, migrations, portable asset package, transactional local saves/recovery and future backend adapter |
| UI | Library, scene, properties, connections, schedule, cut list, procurement and settings; usable keyboard alternatives |
| Validation | Pure numeric tests, deterministic fixtures, real-pointer browser tests, visual baselines, measured stress scenes |

### Domain invariants

1. Store all physical dimensions/lengths in millimetres. Document exactly one conversion to scene units and test its inverse.
2. IDs are stable for project, definition, instance, physical port, cable, accessory, support, exit, external destination, loom and stock/reel records.
3. A physical cable remains one cable through trays, loom memberships and exits. Connections and documentation survive scene regeneration.
4. Separate cable endpoint identity from editable labels/purpose and physical path. Moving equipment updates endpoints and validity without disconnecting it silently.
5. Length breakdown distinguishes calculated internal, modelled external, manually entered external, unknown external, service loop, end A/B preparation, explicit other allowance, waste and rounding. Do not add visually modelled service loops twice.
6. A preterminated supplied length is immutable until the user selects a different assembly. A bulk cut must remain continuous and must fit one assigned reel.
7. Unknown segments make full required length provisional/incomplete. Estimates and manual/unverified inputs carry provenance and cannot become verified measurements by saving.
8. Final route geometry, including cable/bundle radius and smoothing, must clear solids, respect permitted openings and honour anchors and configured bend limits.
9. Every meaningful edit is a recoverable command/transaction with consistent undo/redo, state-machine and persistence effects.
10. No verified geometry/compliance claim arises from photographs, a generic example, a render, or a successful build alone.

## Phased delivery and gates

Follow all fourteen stages from specification section 19. Dependency-independent schedule and procurement work may proceed in parallel without skipping the required integration/physical validation gates.

| Stage | Deliverable | Gate before claiming stage completion |
|---|---|---|
| 1 | Runnable UI, configurable rack foundation, coordinates, cameras, persistence interface, TypeScript/test setup | Unit conversion/dimensions, browser load/camera interactions, storage smoke check |
| 2 | Correct rail pattern, rack/depth sections, structural members, geometry validation and visibility | Confirm ENG-01–06; numeric solid/transition/hole checks; visual review |
| 3 | Library/editor/assets/mount specs, actual drag, U snap, collision/occupancy | Definition/instance safety, physical placement fixtures and real drag browser tests |
| 4 | Direct/rail/shelf installation and removal state machines/fasteners | Verified hardware definitions, valid final transforms and interrupted animation tests |
| 5 | Port editor, anchored ports, compatible persistent connectivity | Port transforms/cardinality/connection reload and movement tests |
| 6 | Flexible cable geometry, manual routes, suggestions, obstacle/bend validation, length and endpoint updates | Deterministic final-tube collision, length tolerance, waypoint and failure tests |
| 7 | Trays, pads, anchors, ties, looms and breakouts | Constraint persistence, bundle envelope, tray wall and parent-movement tests |
| 8 | Physical exits, logical destinations, external lengths and incompleteness | Opening-respecting routes; complete and unknown-external fixtures |
| 9 | Master schedule, custom columns/templates, scene linkage, CSV/XLSX/PDF | One row per cable, independent table usability, linked selection and export parity |
| 10 | Supply types, products, allowances, supplied/cut lengths and upward rounding | Explicit breakdown, no double count/stretch, numeric boundary cases |
| 11 | Product inventory, reels/partials, feasible allocation, safety policy, cut/purchase exports | All procurement scenarios, feasible continuous cuts and stock reconciliation |
| 12 | Compound/imported geometry, overhangs/recesses, photo calibration/tracing | Scale/orientation/provenance and equivalent collision geometry verified |
| 13 | Cloud-ready storage/data/asset conventions; authentication/permissions when hosted | Local portability/recovery; access-control tests before private hosted exposure |
| 14 | Complete integration, polish, stress performance, documentation and sample deliverables | Section 21 workflow, all regression/build/browser/visual/performance checks, final matrix |

## Requirement details and source mapping

The source index below is generated directly from every numbered specification heading; unnumbered development principles, stack preferences, tray-routing instructions and UI subheadings remain covered by their parent requirements. The original file retains every exact field, workflow step and error case.

<!-- SOURCE_INDEX_START -->
| Requirement | Exact source heading | Original line | Initial acceptance status |
|---|---|---|---|
| REQ-1 | Your Role and Objective | 3 | Not implemented / not verified |
| REQ-2 | Requirements Discovery | 49 | Not implemented / not verified |
| REQ-3 | Technology, Architecture and Deployment | 83 | Not implemented / not verified |
| REQ-3.1 | Browser-first approach | 109 | Not implemented / not verified |
| REQ-3.2 | Future hosted deployment | 129 | Not implemented / not verified |
| REQ-3.3 | Optional Windows application | 149 | Not implemented / not verified |
| REQ-3.4 | Architectural separation | 157 | Not implemented / not verified |
| REQ-4 | Rack Configuration and Geometry | 193 | Not implemented / not verified |
| REQ-4.1 | Basic rack creation | 195 | Not implemented / not verified |
| REQ-4.2 | Variable rack depth | 220 | Not implemented / not verified |
| REQ-4.3 | Photograph-assisted rack modelling | 249 | Not implemented / not verified |
| REQ-4.4 | Rack views | 271 | Not implemented / not verified |
| REQ-5 | Device Library and Definition System | 291 | Not implemented / not verified |
| REQ-5.1 | Device properties | 311 | Not implemented / not verified |
| REQ-5.2 | Mounting types | 338 | Not implemented / not verified |
| REQ-5.3 | Importing device photographs | 358 | Not implemented / not verified |
| REQ-5.4 | Custom device geometry | 374 | Not implemented / not verified |
| REQ-6 | Equipment Drag-and-Drop Installation | 411 | Not implemented / not verified |
| REQ-6.1 | Selecting equipment | 415 | Not implemented / not verified |
| REQ-6.2 | U snapping | 434 | Not implemented / not verified |
| REQ-6.3 | Installation animation: direct rack mounting | 444 | Not implemented / not verified |
| REQ-6.4 | Removing equipment | 465 | Not implemented / not verified |
| REQ-6.5 | Rail-mounted devices | 483 | Not implemented / not verified |
| REQ-6.6 | Shelf-mounted devices | 501 | Not implemented / not verified |
| REQ-6.7 | Installation state machine | 515 | Not implemented / not verified |
| REQ-7 | Ports and Connectivity | 537 | Not implemented / not verified |
| REQ-7.1 | Port types | 541 | Not implemented / not verified |
| REQ-7.2 | Port editor | 575 | Not implemented / not verified |
| REQ-7.3 | Connection creation | 593 | Not implemented / not verified |
| REQ-8 | Cable Simulation and Routing | 621 | Not implemented / not verified |
| REQ-8.1 | Cable definitions | 627 | Not implemented / not verified |
| REQ-8.2 | Manual routing | 651 | Not implemented / not verified |
| REQ-8.3 | Flexible cable geometry | 670 | Not implemented / not verified |
| REQ-8.4 | Collision detection | 693 | Not implemented / not verified |
| REQ-8.5 | Physics and behaviour | 723 | Not implemented / not verified |
| REQ-8.6 | Cable bend radius | 742 | Not implemented / not verified |
| REQ-8.7 | Moving connected devices | 754 | Not implemented / not verified |
| REQ-9 | Cable Looms and Bundling | 770 | Not implemented / not verified |
| REQ-9.1 | Loom creation | 774 | Not implemented / not verified |
| REQ-9.2 | Loom geometry | 789 | Not implemented / not verified |
| REQ-9.3 | Cable ties | 799 | Not implemented / not verified |
| REQ-10 | Cable Tie Pads and Anchors | 817 | Not implemented / not verified |
| REQ-11 | Cable Trays and Cable Management | 840 | Not implemented / not verified |
| REQ-12 | External Cable Exit Points and Destinations | 880 | Not implemented / not verified |
| REQ-12.1 | Rack cable exit points | 890 | Not implemented / not verified |
| REQ-12.2 | External destinations | 934 | Not implemented / not verified |
| REQ-12.3 | Connection example | 968 | Not implemented / not verified |
| REQ-12.4 | External cable length | 998 | Not implemented / not verified |
| REQ-12.5 | Multiple cables through one exit | 1030 | Not implemented / not verified |
| REQ-12.6 | Future external environment modelling | 1040 | Not implemented / not verified |
| REQ-13 | Master Cable Schedule Generator | 1050 | Not implemented / not verified |
| REQ-13.1 | Cable schedule records | 1060 | Not implemented / not verified |
| REQ-13.2 | One master schedule | 1117 | Not implemented / not verified |
| REQ-13.3 | Cable schedule table | 1144 | Not implemented / not verified |
| REQ-13.4 | Custom cable schedule templates | 1168 | Not implemented / not verified |
| REQ-14 | Preterminated and Unterminated Cable Management | 1194 | Not implemented / not verified |
| REQ-14.1 | Preterminated cables | 1200 | Not implemented / not verified |
| REQ-14.2 | Changing a preterminated cable | 1245 | Not implemented / not verified |
| REQ-14.3 | Spare cable length | 1255 | Not implemented / not verified |
| REQ-14.4 | Unterminated bulk cable | 1272 | Not implemented / not verified |
| REQ-14.5 | Termination configuration | 1291 | Not implemented / not verified |
| REQ-14.6 | Required length calculation | 1318 | Not implemented / not verified |
| REQ-14.7 | Length rounding | 1334 | Not implemented / not verified |
| REQ-14.8 | Cable length validation | 1350 | Not implemented / not verified |
| REQ-15 | Cable Reel Inventory and Procurement Calculator | 1369 | Not implemented / not verified |
| REQ-15.1 | Cable stock definitions | 1381 | Not implemented / not verified |
| REQ-15.2 | Total cable requirement | 1408 | Not implemented / not verified |
| REQ-15.3 | Basic reel calculation | 1427 | Not implemented / not verified |
| REQ-15.4 | Cut allocation and reel optimisation | 1445 | Not implemented / not verified |
| REQ-15.5 | Safety margin and recommended order quantity | 1479 | Not implemented / not verified |
| REQ-15.6 | Example procurement calculations | 1528 | Not implemented / not verified |
| REQ-15.7 | Reel cutting schedule | 1578 | Not implemented / not verified |
| REQ-15.8 | Cable procurement summary | 1602 | Not implemented / not verified |
| REQ-15.9 | Existing stock | 1628 | Not implemented / not verified |
| REQ-16 | Cable Schedule and Procurement Export | 1648 | Not implemented / not verified |
| REQ-16.1 | Master cable schedule | 1652 | Not implemented / not verified |
| REQ-16.2 | Cable cut list | 1664 | Not implemented / not verified |
| REQ-16.3 | Purchasing list | 1679 | Not implemented / not verified |
| REQ-16.4 | Project documentation | 1694 | Not implemented / not verified |
| REQ-16.5 | Data accuracy | 1715 | Not implemented / not verified |
| REQ-17 | User Interface and Experience | 1725 | Not implemented / not verified |
| REQ-18 | Saving and Exporting Projects | 1829 | Not implemented / not verified |
| REQ-18.1 | Future cloud storage | 1880 | Not implemented / not verified |
| REQ-19 | Project Implementation Stages | 1900 | Not implemented / not verified |
| REQ-20 | Automated Testing Requirements | 2075 | Not implemented / not verified |
| REQ-20.1 | Unit testing | 2081 | Not implemented / not verified |
| REQ-20.2 | Geometry validation | 2117 | Not implemented / not verified |
| REQ-20.3 | Cable routing tests | 2137 | Not implemented / not verified |
| REQ-20.4 | Cable scheduling tests | 2162 | Not implemented / not verified |
| REQ-20.5 | Interaction testing | 2226 | Not implemented / not verified |
| REQ-20.6 | Animation testing | 2263 | Not implemented / not verified |
| REQ-20.7 | Visual regression testing | 2276 | Not implemented / not verified |
| REQ-20.8 | Performance testing | 2298 | Not implemented / not verified |
| REQ-20.9 | Build and quality checks | 2328 | Not implemented / not verified |
| REQ-21 | Required End-to-End Demonstration | 2347 | Not implemented / not verified |
| REQ-22 | Error Handling and Reliability | 2412 | Not implemented / not verified |
| REQ-23 | Documentation | 2444 | Not implemented / not verified |
| REQ-24 | Reporting and Development Discipline | 2480 | Not implemented / not verified |
| REQ-25 | Final Acceptance Criteria | 2518 | Not implemented / not verified |
| REQ-26 | Your First Actions | 2581 | Not implemented / not verified |
<!-- SOURCE_INDEX_END -->

23 October 2026 extension: correct the rear sliding-rail bracket face to remove post penetration. Add Wiring mode with native device-port connection clicks, reusable surface point guides offset 10 mm along the world-space normal, Shift-started/two-click line guides, selected-cable link mode, ordered/reversible line traversal, shared references, numeric repositioning, unlink/deletion guards, undo and portable persistence. Guides remain world-fixed when devices move; they are geometric route constraints rather than installed physical fixings. This extends REQ-7/8/9. See docs/wiring-mode.md and the current acceptance matrix for evidence and remaining segment-drag/physics scope.
