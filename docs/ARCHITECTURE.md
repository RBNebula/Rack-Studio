# Architecture and engineering conventions

## Source map (migration inspection, 25 October 2026)

`index.html` loads `src/main.tsx`, which mounts React `App` from `src/ui/App.tsx`. Vite handles the ES module build. `App` owns workspace navigation, lazy loading of `Scene`/`ModelDesigner`, dialogs, save/recovery and the 900 ms autosave debounce. There is no application server or account service.

| Layer | Actual source and responsibility |
| --- | --- |
| Domain records | `src/model.ts`: Zod schemas for definitions, installed devices, racks, endpoints, cable/guide/exit/destination records, stock and settings; versioned `Project` |
| State | `src/state.ts`: `useStore`, atomic `edit`, `replace`, `undo`, `redo`; project history and temporary selection/view/drag state |
| Main UI | `src/ui/Library.tsx`, `Inspector.tsx`, `Forms.tsx`, `ModellingPanel.tsx`, `WiringPanel.tsx`, `Reports.tsx`; definition authoring in `ModelDesigner.tsx` |
| Scene | `src/ui/Scene.tsx`: Fiber Canvas, `CameraRig`, `RackStructure`, `EquipmentModel`, management objects, `WiringGuides`, `RenderedCable`, `CableTube`, labels and measurements; Drei controls and HTML overlays |
| Shared physical geometry | `src/engineering/geometry.ts`: `mmToScene`, rack/device validation, `deviceBoxes`, `portWorld`, `portDirectionWorld`, `allObstacles`; `space.ts` handles rack origins and oriented boxes |
| Rack/support construction | `rack-frame.ts`, `shelves.ts`, `plates.ts`, `placement.ts`; explicit members, shelf support, plate collision proxies and placement checks |
| Equipment | `src/examples.ts` built-ins and fixtures; `src/catalogue.ts` incomplete sourced references; `src/models/` PC, generic switch and lacing-bar definitions; scene-specific renderers in `src/ui/` |
| Installation/rails | `src/ui/DeviceRails.tsx` and shared geometry for telescoping service poses; placement validates solids/travel. No full installation/fastener animation state machine exists |
| Ports/connectivity | `ports.ts`, `connectivity.ts`, `external.ts`, `wiring.ts`; panel rotation/footprints, physical endpoint identities, compatibility, destinations and ordered guides. `WiringPicker.tsx` supplies physical surface/port interactions |
| Spatial modelling | `attachments.ts`, `modelling.ts`, `assemblies.ts`: parent transforms, anchored accessories, duplication, alignment and remapped portable assemblies; `ModellingGizmo.tsx` supplies transient previews |
| Cable geometry | `routing.ts`: `routeCable`, deterministic obstacle-aware routes, leads, arc fillets and validated samples; `follow-run.ts` provides shared-run relationships |
| Schedule/procurement | `lengths.ts`, `procurement.ts`, `analysis.ts`: explicit allowances, continuous reel allocation, cached `analyseProject`, `scheduleCsv`, `cutListCsv`, `procurementCsv`; rendered by `Reports.tsx` |
| Power and weight | `power.ts`: cached `analysePower` for bank/outlet loads, feeds from cable records, chained distributors, unknown-value tracking and mass/draw totals, also exposed as `analyseProject(project).power`; edited and displayed by `src/ui/PowerPanel.tsx`. See [power-and-weight.md](power-and-weight.md) |
| Persistence | `src/data/project.ts`: parse/serialize, schema/reference checks, safe embedded assets; `src/data/storage.ts`: `ProjectRepository` and IndexedDB adapter |

Engineering filenames in the table without a directory are under `src/engineering/`. Data flows from schema-validated project records through pure engineering functions to both scene geometry and reports. The state edit boundary checks references and rejects new placement failures. Save/reload uses serialisable records, not Three.js objects. Reporting cannot independently invent cable lengths. Browser tests in `tests/` exercise UI workflows; numeric tests are colocated with the relevant source.

The remaining sections retain the established engineering conventions. Current status and unresolved work are maintained in [PROJECT_STATUS.md](PROJECT_STATUS.md) and [ROADMAP.md](ROADMAP.md).

## Authority and boundaries

Optional project `wiringGuides` records define world-space points or A/B lines. Optional per-cable `guideLinks` store ordered stable guide identities and independent line direction. Missing/duplicate links and degenerate lines fail reference validation. Routing resolves guide positions afresh, applies line tangents and checks end-to-end straight traversal after smoothing. Older projects without these fields retain their numeric waypoint behaviour. The viewport picker raycasts tagged physical meshes and transforms the triangle normal to world space before applying the 10 mm offset; it does not create points on an arbitrary camera plane. See [wiring-mode.md](wiring-mode.md).

`Project` in `src/model.ts` is the authoritative version1 graph. Rack sections, definitions, instances, physical ports, cable records, exits, destinations, accessories, loom records, products, stock and schedule settings are serialisable domain data. Three.js objects are derived views and never hold the only copy of a connection or dimension.

Pure TypeScript engines perform geometry, connectivity, routing, lengths and procurement without React or rendered objects. Zustand applies atomic edits on cloned project snapshots, validates schemas/relationships/geometry, and preserves up to50 undo snapshots. New physical placement failures are rejected without partially changing the project. Existing unresolved specifications in an illustrative imported project remain diagnosable and do not make every unrelated edit impossible.

The browser repository implements `ProjectRepository`; a future authenticated remote adapter can implement the same interface. Local saves use IndexedDB transactions, and JSON backups embed images as validated data URIs. Autosave is debounced; the dirty flag is cleared only for the revision actually saved. A failed recovery does not overwrite the failed saved project. Cross-project stock reservations, revision merging, authentication and asset uploads require a future backend and concurrency design.

## Coordinates and physical measurements

All core coordinates and lengths are millimetres. World x is the horizontal model axis; y points up; z points towards the rear. With the front camera at negative z looking towards positive z and y up, positive x appears on the left of that front view. Use this convention when entering port offsets; rear installation mirrors x and z. U1 begins at y0, one U is44.45mm, and front mounting ears sit at z0. `mmToScene` divides all values by1000: one scene unit equals1000mm.

Rack mounting depth means front screw plane to rear screw plane. `overallDepthMm` is a separate illustrative exterior frame envelope, not a renamed rail spacing. New racks have one section. Each section has inclusive `startU`/`endU`; the sorted sections must cover every U exactly once. Construction, support members, exterior clearances and adjoining-rack beam dimensions need independent measurements.

The construction update stores each section's front and rear screw planes as world Z coordinates, `frontRailZMm` and `rearRailZMm`; screw-plane spacing is their difference. Legacy front Z defaults to zero. Rail width/thickness are separate nullable parameters, independent of the generic frame section; explicit dimensions take priority, while unknown legacy previews preserve the previous half-frame-section profile. Explicit construction omits all generated frame posts/beams and uses only configured members and rails. Additional members have stable identities, profile orientation and evidence/source data; angle/channel profiles decompose into their actual wall boxes. See [configurable-construction.md](configurable-construction.md).

Parametric shelf floor/wall solids derive from the shelf definition alone. The usable footprint is independent of the full physical floor and additional support envelope. Supported equipment bears at the configured floor top, including floors thicker than the old heuristic's 12 mm limit. Additional shelf supports are explicit local solids and mirror with rear mounting. Generated and explicit parts share the rendering/collision pipeline.

Photo-referenced frame generation is isolated in `rack-frame.ts`. Rails remain independent; end covers are separately selected nullable components. Generic covers cap the outer beam surfaces, while explicitly selected covers in explicit construction use the U boundaries. Covers exist only at the true rack ends, not at section transitions. Legacy missing cover fields remain null. Thin blanking plates have a nullable definition component with sheet/return/perforation/slot parameters; the sheet extends outward from the screw plane and returns extend inward. Renderer extrusion cuts actual apertures, while placement/routing use a documented conservative solid-sheet proxy. Ordinary equipment rendering is unchanged. Plate thickness is authoritative for integral ears, and a zero return depth is valid only for an explicit plate definition.

Device depth is mounting-ear plane to rear fascia. Changing it extends the chassis rearwards while retaining the mounting plane. Rear mounting rotates x/z180degrees; y is unchanged. Port coordinates are local to the chassis-bottom/front-mounting origin. Front/rear mounting updates both port positions and connector directions. Shelf support derives the PC's height from the support floor; the bearing chassis footprint and protruding lid collision shape are separate.

The photographed PC definition is isolated in `src/models/user-rack-pc.ts`; its nullable appearance selector activates a procedural shell renderer and connector glyphs. Port centres, normals, sizes and stable IDs remain authoritative model data used by the renderer and routing. Legacy appearance defaults to null, retaining generic rendering. Explicit per-port evidence can override the enclosing definition's evidence for cable-calculation confidence. Chassis and fittings keep conservative collision envelopes; visible perforations do not imply routable openings. Photo normalised observations and the subsequent user-confirmed DisplayPort/HDMI identities are recorded in [user-pc-reference.md](user-pc-reference.md).

The universal hole-centre offsets within each U are6.35,22.225,38.1mm, giving15.875/15.875/12.7mm spacing across boundaries. The rendered marks indicate centres; exact holes/cage nuts/fastener solids and installation animations are not implemented. Their dimensions are not inferred from a nominal19-inch mounting standard.

## Geometry and routing

Each chassis/component/frame/tray solid has a model-space axis-aligned collision box. Parts-only definitions represent real openings between explicit solid components; a generic brush plate does not use a solid envelope as its collision shape. Device placement checks nominal U allocation, physical extent, explicit exterior envelope, front/rear interactions, rail adjustment ranges, support compatibility and solid collisions. Tangent surface contact is permitted; penetration is rejected. These are model checks, not a surveyed mechanical fit certificate.

Rack rails extend inwards from their exposed screw contact planes. Explicit ear plates extend outwards with their rear bearing faces tangent to those rails; the full solids are used for rendering and collision checks. There is no blanket penetration allowance for thin plates. Shelves have their own ears and open supporting interiors; a freestanding computer uses its shelf's support rather than acquiring fictitious rack ears. Ear thickness is a separate nullable dimension: unknown legacy definitions use a labelled 2 mm illustrative preview and remain unverified. See [mounting-and-next-steps.md](mounting-and-next-steps.md).

Routing uses deterministic visibility graphs over inflated obstacles with shortest-path search. Connector lead directions are preserved, explicit waypoints remain on the path, and circular fillets provide declared bend radii where they fit. The final sampled path is checked against solids expanded by cable radius, clearance and arc-sampling sagitta (at most0.05mm). Rendering uses the validated samples without a second smoothing operation. Analytic line/arc lengths are used rather than a 2D projection; sampled tube approximation has documented small chord error.

Unknown minimum bend radius produces a visible draft-radius advisory. `valid` means no detected failure of the supplied geometric constraints in the modelled section. It does not certify gravity, tension, slack accommodation, connector shells, all cable-to-cable interactions or material behaviour. A failed route remains visible and is excluded from a complete cut requirement.

A logical external cable stops at the chosen exit and adds an independent manual survey. A destination with routeIn3D enabled instead routes through that exit to its world-positioned port; stored manual external length is ignored and its schedule column is zero, preventing double counting. General panel cutouts/capacity validation remain future work; current exits belong in clear openings.

Following an existing run preserves separate records and endpoint breakouts. It selects an arc-length interval, offsets a parallel lane and checks the assembled route. Cycles, missing reference cables, blocked offsets and inadequate bends are rejected. This geometric route relationship is not a claim that a cable tie, anchor or loom has physically secured the cables.

## Lengths, schedules and procurement

Known route + manual external distance + service allowance + endA allowance + endB allowance + explicitly named other allowances are added exactly once, then rounded upwards once for a bulk cut. User-selected defaults are60mm per end and no service loop. Preterminated supplied length is fixed; the calculated demand can produce insufficient/provisional/sufficient status, but never stretches the assembly. Unknown external distance in logical-destination mode leaves final required length null, including when an unverified manual override exists.

The master schedule maps one physical cable record to one row, regardless of exit/loom membership. `id` is stable internal identity; `label` is the mutable cable number, and `name` is separate. CSVs, UI reports and cut allocation derive from the same analysis. Text fields are quoted, quotes escaped and formula prefixes neutralised. Unknown lengths are exported as Unknown, never0. XLSX/PDF reports remain open requirements.

Each bulk product is allocated independently. Required cuts are continuous and cannot join reel remnants. Best-fit decreasing supplies a feasible incumbent; bounded branch-and-bound proves the additional-purchase minimum for manageable inputs (at most24cuts,250000search nodes by default). Unproven plans are labelled heuristic or bounded-search. Existing partial stock is immutable. A64-machine-epsilon arithmetic tolerance resolves floating-point round-off only; it is many orders below engineering tolerances and is unrelated to reserve.

Reserve target = fixed mm + percentage of one standard reel + percentage of known consumption. Technical feasibility and advisory recommended purchases are separate outputs. Unknown cuts leave the product provisional and any feasible allocation applies to known cuts only. Stock is not committed across projects in this milestone.

## Future extension points

Keep future image calibration, mesh collision decomposition, 3D import, constrained dynamics, hardware animation and worker scheduling behind the domain/engine boundaries. Hosted deployment requires trusted authentication, access control, project ownership, audited shared inventory, secure asset upload/storage and backups; do not expose private designs merely by publishing the static frontend.

## Modelling workspace extension · 24 October 2026

Optional schema fields preserve legacy projects: additionalRacks and per-device rackId provide axis-aligned rack origins; accessory attachment/rotation provide parent-local poses; sharedMembers are independent world structure; measurements store world points; destination routeIn3D opts into complete external routing; loom guideIds reference shared reusable constraints. Pure space/attachments/modelling/assemblies modules handle transforms, oriented collision walls, atomic edits and identity-safe assembly imports.

Move/rotate previews clone the model without mutating authoritative records. Pointer release commits one validated undoable edit; cancellation clears the preview. TransformControls use a separate empty object to avoid reattachment during rerender, and underlying object selection is disabled while transforming. Oriented wall segment tests use inverse transforms; placement uses a separating-axis box test. Bundle lanes use largest-member grid packing and validate opening/tray capacity. This is a geometric solver, not flexible cable dynamics. See [controls and limits](modelling-workspace.md).

## Generic equipment appearance · 24 October 2026

The generic-switch-24 appearance is an optional extension of the existing definition schema, with generic renderer fallback. Its silver shell apertures/labels follow authoritative port records and its slotted ears follow U-allocation offsets and the selected rack rail centres. Routable endpoints remain ordinary port records; renderer details do not replace conservative chassis/ear collision envelopes. Adding a missing built-in definition is an explicit validated edit; existing project definitions and temporary-switch IDs are not rewritten. SFP cages use the physical SFP connector category without inferring optical modules or LC termination.

## Connector face rotation

Optional finite per-port rotationDeg stores clockwise roll as viewed from outside a socket. Pure ports helpers normalize angles, compute rotated footprints and emit chassis-plane aperture corners. Viewed front/rear normals use opposite panel signs; the outward-facing glyph frame always uses negative Z rotation. Preview meshes, rack click targets, face-editor SVGs, detailed shell openings and thumbnails use the same convention. Rotation leaves endpoint position, cable direction and physical identity unchanged. Omitted legacy angles stay omitted in round trips and render at zero. This is face roll; connector aiming remains its independent direction vector.
