# Configurable rack construction

Updated: 22 October 2026. These are configurable reference models, not calibrated manufacturer models.

## Reference project

Import [configurable-construction.rack.json](../examples/configurable-construction.rack.json) from the project menu. It contains a provisional 20U rack with 800 mm **overall envelope depth** at U1–U15 and 750 mm at U16–U20, inclusive. Height remains editable. A generic 1U shelf has its own 450 mm overall depth; it does not fill the rack.

The independently editable front/rear rail planes are initially 0/700 mm and 0/650 mm. These rail positions, the 600 mm exterior width, 10 × 10 mm rail profile and shelf dimensions are explicitly illustrative values, not measurements provided by the user. Exterior depth edits never derive a rail spacing. The standard nominal mounting interface remains distinct from those example construction dimensions; see [the primary-source reference](rack-standard-reference.md).

This reference uses **Explicit structural members** with no added beams or crossmembers. No transition support or adjoining-rack beam is inferred from the depth step. The optional **Generic frame preview** generates provisional rectangular frame members from the envelope and frame-section parameters. It is a visual construction example; switch to explicit construction and define the actual members when references are available. New projects continue to start flat, without an automatic depth step. Existing saved projects are retained.

## Independent components and datums

| Component | Editable data | Datum and behaviour |
| --- | --- | --- |
| Exterior envelope | U height, exterior width, clear opening, front inset, overall depth per U section | World front of the envelope is `−frontInsetMm`. The envelope does not stretch equipment or determine rail spacing. |
| Mounting rails | Hole-column centres, rail face width, rail thickness, front screw-plane Z and front/rear spacing per section | Rear plane is stored independently in world Z. Spacing is `rear − front`. Moving the front plane through the UI retains spacing; changing spacing retains the front plane. |
| Rack ears and chassis | Ear thickness, chassis width, allocated/physical height, ear-plane-to-rear depth | Ear bearing faces stay tangent to the selected rail face. Thickness extends outwards; the chassis extends into the rack. |
| Generic shelf | Allocated U, physical height, overall depth/width, usable depth/width, floor/wall thickness | Generated floor and side walls respond to shelf dimensions alone. Usable space limits supported equipment independently of physical floor size and mounting ears. |
| Additional shelf supports | Explicit local boxes, mounting arrangement | No support kit is generated automatically. Enter component dimensions/positions from a reference; components move with their shelf. Front/rear placement mirrors the assembly. |
| Structural members | Independent IDs, world position, XYZ envelope, solid box/angle/channel profile, wall thickness, extrusion axis, quarter-turn orientation, evidence/source | Members remain independent of rack height/depth edits. Their actual configured wall solids participate in rendering and collision checks; angle/channel interiors remain open. |

All coordinates and dimensions are millimetres. A fixed front/rear face at a transition requires matching corresponding planes across sections. Equipment spanning a change in its mounting face is rejected. Rail kits use the actual front-to-rear spacing, not exterior depth. Profile/frame edits that introduce equipment collisions are rejected atomically, leaving the prior project available.

## Editing

In Rack configuration, edit the envelope and **Mounting rail profile** independently. Each depth section has a **Front screw-plane Z** and **Screw-plane depth** (front-to-rear spacing). Apply commits the full valid draft. Height changes adjust section coverage, not shelf dimensions or explicit member coordinates.

The **Structural members** editor adds no geometry until a name, shape, all XYZ positions and positive XYZ dimensions are supplied. Angle/channel profiles also require wall thickness. Choose the extrusion axis and orientation explicitly. Add the component to the rack draft, then apply the configuration. Remove or edit members independently. Compound orthogonal constructions can use several members. An unfinished new-member draft cannot be silently omitted by applying the rack.

In the equipment library, edit a shelf definition and enable **Parametric shelf**. Overall depth and usable depth are separate fields; reducing overall depth below usable depth is rejected at save rather than silently overwriting the usable dimension. Changing allocated U updates the generic shelf's physical height and example screw pattern. Front-only and additional-support arrangements are separate choices. Additional supports require explicitly entered component geometry. Disabling parametric generation retains the current solids as explicit components. Changing mounting type retains inactive shelf data. Clone a definition when different shelves need different dimensions; editing a shared definition updates its instances.

## Provisional data, compatibility and limits

Example definitions stay labelled as examples. Structural members carry their own unknown/example/user-entered/verified status and source notes. A standard interface does not verify a frame profile, shelf, support kit, fastener fit or load rating.

Older projects without the new fields load with front rail Z0, generic frame mode, null independent rail dimensions and their original explicit shelf parts. Unknown legacy rail profiles preserve the earlier half-frame-section preview; they are visibly unverified. A legacy preview/opening conflict is reported as an advisory so the project can be recovered; entering an explicit conflicting rail width is rejected. New examples specify independent rail dimensions. Unknown ear thickness remains an illustrative 2 mm preview. Unverified rail/member data cannot yield a verified length-model status.

Current structural profiles are orthogonal solid boxes, angles and channels, decomposed into axis-aligned solids. Arbitrary rotated profiles, hollow rectangular tubes, calibrated photographs, detailed cage-nut/screw apertures, real support-kit animations, material strength and vehicle attachment calculations remain future work. The present editor does not certify a load-bearing assembly.

Numerical coverage is in [construction.test.ts](../src/engineering/construction.test.ts), [shelves.test.ts](../src/engineering/shelves.test.ts) and the mounting tests. Browser evidence and acceptance limits are recorded in [progress.md](progress.md) and [acceptance.md](acceptance.md).
