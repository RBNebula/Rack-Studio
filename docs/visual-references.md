# Rack and blanking-plate visual references

Reviewed: 23 October 2026. This note records the form visible in the four photographs supplied by the user. The photographs are visual references, not dimensioned drawings or verified product specifications.

## What the references establish

| Reference | Visible construction | Details to retain in the generic model |
| --- | --- | --- |
| 1 — basic rack | Black, open-sided rectangular four-post rack with constant depth, uninterrupted vertical mounting rails, and broad solid top and base plates | A plain flat-depth frame option; separate front/rear mounting rails; square mounting-hole appearance; optional top/base sheet panels; open sides and open equipment volume |
| 2 — perforated blank | Thin black sheet with staggered rows of circular perforations, solid end-ear regions, elongated fixing slots and folded edge returns | See-through round perforations rather than a printed dot pattern or wire-grid mesh; uninterrupted material around the fixing regions; thin folded sheet construction |
| 3 — narrow solid blanks | Smooth black central faces, integral end ears, elongated fixing slots and folded long edges | Unlettered solid faces; no invented device ports, chassis box or branding; visible thin material and shallow returns in an oblique view |
| 4 — taller solid blank | A broader smooth solid face with corner fixing slots and subtle folded edges | The same sheet-and-ear construction at a larger allocated U height, with independently configurable physical height and fixing pattern |

The word “square” describes the basic rectangular cage construction here. It does not establish equal width and depth. The perspective and uncalibrated images do not establish rack height, exterior dimensions, sheet gauge, hole or slot sizes, rail profile, return depth, mounting pattern tolerances or load rating.

## Independent dimensions and compatibility

The rack envelope, mounting rails, top/base panels, shelf assemblies and explicit structural members must retain separate data and identities. Changing a frame depth must not silently move a rail plane or stretch equipment. The earlier stepped-depth example remains a separate construction option; it is not part of this flat-depth visual reference.

A photograph of a rail does not establish its internal profile or a cage-nut specification. Nominal 19-inch mounting-interface data is documented separately in [rack-standard-reference.md](rack-standard-reference.md). A standard interface does not verify any pictured construction dimensions. Generic plate dimensions and perforation/slot parameters stay labelled provisional until measured references are supplied.

Blanking plates mount with the bearing surface of their ears against the selected rail face, with sheet thickness extending outwards. Front/rear placement mirrors the whole plate assembly, including folded returns. Physical plate height must fit within its allocated U height without overlapping neighbouring blanks. The fixing slots must remain within the end-ear material, and any configured screw centres must align with their intended fixing regions.

The visible perforations do not authorize cable routes through a blank. Plate collision remains a conservative sheet envelope unless an explicit aperture-aware routing rule is implemented and validated. Rendered holes, mounting slots, actual fastener-fit validation and cable-passable openings are separate capabilities. Top/base plates, however, are physical components and must participate in collision checks when enabled.

## Review and browser verification

Compare the rendered model with the references from an oblique view as well as straight front/rear views. A flat orthographic face alone cannot reveal excessive chassis depth, folded-return direction, a floating ear or a solid backing behind perforations.

1. Start a new flat-depth 20U project through the UI. Retain one constant-depth section, enable the top and base plates and verify an open-sided four-post cage. No transition crossmember or adjoining-rack beam should appear automatically.
2. Change exterior depth, rail spacing and an end-panel setting independently. Save locally and reload. Exported data and the rendered model should preserve each setting without coupling those dimensions or creating a depth step.
3. Place a 1U solid blank, a perforated blank and larger solid blanks through the normal equipment-placement dialog. Check allocated U positions, neighbouring clearances and flush ear contact. Solid blanks must have smooth, unlettered faces with no generated connector markers.
4. Inspect a close oblique view of both blank types. Perforations should reveal the scene behind them, end-ear regions should remain solid, and mounting slots and folded returns should remain visible. The same inspection from the rear must show the correctly mirrored assembly.
5. Save and reload a project containing these plates. Check definition identity, appearance, selected mounting face, dimensions and panel configuration. Older projects with no new plate/panel data should retain their existing geometry until the user explicitly changes it.
6. Check browser console/page errors and the existing placement, shelf, construction, cable and export workflows on the final production build. Screenshot review supplies visual evidence; geometry tests supply contact/collision evidence.

Useful screenshot evidence is a whole empty rack matching the first reference, an oblique close-up containing a solid and perforated blank, and a rear view showing the mirrored mounting arrangement. The validation log should record the target URL, production build, browser version, actual test command, results and any visual limitations. Passing UI tests alone do not establish manufacturing accuracy.

## Source audit points

Before this change, `Scene.tsx` drew all rack rail holes as dark surface marks, while `makeFaceTexture` put generated lettering on ordinary box-bodied devices. The original generic blank definitions used this generic box treatment. Those are the main rendering paths to check when reviewing the new plate renderer: a perforated front mesh must not be backed by a solid generic fascia or duplicated chassis; blanks must not inherit device lettering; and mounting marks must not hide true slots. Existing ear-contact geometry and independently configurable rails must remain intact.

This document is a qualitative design review and verification plan. Completed checks and their limits belong in [progress.md](progress.md), [acceptance.md](acceptance.md) and the corresponding validation logs.

## Using the implemented reference models

Import [flat-rack-reference.rack.json](../examples/flat-rack-reference.rack.json) for an empty 20U constant-depth rack, or [blanking-plates-reference.rack.json](../examples/blanking-plates-reference.rack.json) for installed solid/perforated examples. The 600 mm exterior width, 800 mm overall depth, 700 mm rail spacing and 2 mm end-panel thickness are independent provisional example values. “Square rack” has not been interpreted as a requirement to force width and depth equal. The earlier stepped construction remains a separate fixture.

New generic projects include separate top/base covers and complete upper/lower side crossmembers. Use **Include top plate**, **Include base plate** and **End plate thickness** in Rack configuration. Covers cap the outer beam surfaces in generic construction. With explicit members, the selected covers use the U boundaries and do not infer extra beam dimensions. Their solids participate in collision checks, and the ground view follows the selected base. Rails use the rack's finish rather than a hard-coded grey material.

The library contains 1U, 2U, 3U and 4U solid blanks and matching perforated blanks. **Face construction** selects an equipment chassis, solid blank or perforated blank. Plate controls set sheet thickness, inward return depth, vent-field margin, hole diameter/pitch, mounting-column spacing and slot dimensions. A flat sheet can have zero inward return depth; ordinary equipment still needs positive chassis depth. Converting equipment to a plate explicitly replaces its ports and extra parts, and a connected definition cannot silently discard live endpoints. Save/reload preserves plate parameters and stable instance identities.

New plate faces have actual rendered through-holes and horizontal capsule-shaped mounting slots. They do not draw a second solid chassis/fascia or device label behind the holes. The top/bottom returns stop before the solid integral ear regions. Rear placement rotates the full assembly while keeping the mounting contact plane fixed. Round perforations are bounded to a 4,000-aperture model limit; invalid or excessively dense definitions are rejected rather than silently represented as valid mesh. The routing engine intentionally retains a closed-sheet collision proxy, including mounting slots, until cable-passable aperture rules are implemented.

Older projects with absent `endPanels`/`plate` fields load with null values, retaining their existing frame and equipment geometry. Import a new reference, create a new project or explicitly change a definition's Face construction to use the new models. Photographs are not embedded as textured billboards or presented as calibrated assets.
