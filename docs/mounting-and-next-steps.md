# Mounting correction and next development steps

Updated: 22 October 2026.

Subsequent user steering authorises generic configurable rack/shelf references before real measurements. The independent-construction milestone is now implemented; see [configurable-construction.md](configurable-construction.md). The measurement list below remains useful for later calibration and does not block generic development.

## Correct contact geometry

The previous rail solids were centred on the screw planes. Half their thickness projected outwards through the equipment front face, and shelves did not have separate rack ears. This was a model error, not a need to move every chassis forwards by an arbitrary clearance.

The screw-plane coordinates are preserved: front contact is z0; rear contact is zD. Rail metal now extends inwards from these surfaces. Device ear plates extend outwards, with their back bearing surfaces touching the rails exactly. Chassis bodies, ports, cable identities and U coordinates keep their existing datums.

For an illustrative 800 mm screw-plane rack, 10 mm rail thickness and 2 mm ear plate:

| Physical component | Front-mounted location in mm | Rear-mounted location in mm |
| --- | --- | --- |
| Rail metal | z0 to 10 | z790 to 800 |
| Ear plate | z−2 to 0 | z800 to 802 |
| Ear/rail contact | z0 | z800 |
| 280 mm chassis | z0 to 280 | z520 to 800 |

Ear geometry participates in placement and cable collision calculations and is rendered from the same authoritative boxes. The previous blanket exception for thin parts intersecting rails has been removed: tangency passes naturally; penetration fails. Both ears must span their mounting-hole column. A shelf's bearing footprint excludes its outward ears.

Direct, rail-mounted, bracket-mounted and shelf assemblies receive ears. A freestanding PC on a shelf remains a separate supported object without invented rack ears. Open brush plates and shelf interiors retain their openings. A generic 1U shelf is now available alongside the 2U example.

Ear thickness is stored independently of chassis depth. Existing project definitions without it load with an unknown value; their preview uses an explicitly illustrative 2 mm plate until measured. This fallback is not treated as verified geometry. A thickness edit changes the plate outward from the mounting plane, without moving the chassis, ports or rear fascia. Ear-hole marks use the declared screw offsets from the allocated U bottom. They are centre marks, not proof of drilled hole dimensions, cage-nut geometry or installed fasteners.

## Next milestone: dependable mechanical assembly

1. Calibrate one representative rack, its adjacent-rack centre beam and one actual shelf. Separate screw spacing from exterior frame and cable-clearance dimensions. Confirm measured supports before treating frame geometry as installation data.
2. Turn the Cisco switch and Connectix patch-panel catalogue references into usable measured definitions: chassis/ear dimensions, front-fascia offset, ports and any rear support or protrusion. Carry per-dimension evidence, and keep ports attached to their intended surfaces as geometry is edited.
3. Implement the installation/removal state machine with the specified ears, cage nuts, screws and supports. Add the UPS once its exact rail kit and adjustment range are known. Validate contact and final poses numerically, then exercise interruption/undo and inspect the actual animations.

The next functional milestone after that is direct 3D cable-route manipulation and physically constrained trays, fixing pads, ties, shared runs and breakout points, with final collision/bend checks and measured external exits. The documentation milestone adds XLSX/PDF schedules, cutting/procurement reports and rack elevations. Detailed vehicle modelling remains unnecessary for named external destinations.

## Useful input from the user

No further answer is required for the ear/rail contact correction. Development can continue with labelled examples. To establish real installation accuracy, begin with a small representative set:

- One rack: height in U, front-to-rear screw-plane spacing, and a side/front photograph or dimensioned sketch showing the frame and the vertical beam between adjacent racks.
- One shelf: make/model or usable width/depth, with its ear arrangement and plate thickness if available.
- Cisco switch and patch panel first: straight-on front/rear views and measured ear-contact-plane-to-rear depth; identify chassis width separately from ear-to-ear width. A ruler or known measured reference helps establish port coordinates. Image-derived values remain provisional until checked.
- Before the UPS mounting stage: the actual included/installed rail-kit model and supported adjustment range. These must not be inferred from another APC kit.

The confirmed defaults remain square holes with cage nuts, U1 at the bottom, front/rear mounting, no automatic rack step, no service-loop allowance and 60 mm termination allowance at each end of a bulk cable. These answers do not need to be requested again.
