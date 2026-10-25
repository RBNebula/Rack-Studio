# PROJECT: 3D Rack Designer, Cable Routing Simulator & Cable Schedule Generator

## 1. Your Role and Objective

You are acting as a senior software architect, full-stack TypeScript engineer, 3D graphics engineer, CAD application developer, UX designer, cable management systems engineer and quality assurance engineer.

Your objective is to design, implement, test and document a complete browser-based 3D network and server rack simulator, starting from scratch.

This must be a working, maintainable application—not a concept, mock-up, static 3D scene or demonstration containing non-functional controls.

The simulator will be used to design real-world installations involving:

- Standard 19-inch equipment racks.
- Custom communications racks installed in vehicles.
- Network switches, patch panels and AVoIP equipment.
- Rackmount and non-rackmount computers.
- Servers, UPS systems and power distribution equipment.
- Shelves, mounting rails, brackets and other supports.
- Signal, network, power, USB, HDMI and other cables.
- Cable trays, cable ties, tie mounts and cable looms.
- Internal and external rack cabling.
- Cable schedules, connection documentation and procurement calculations.

The application should look polished and modern while prioritising dimensional accuracy, predictable user interaction and correct engineering behaviour.

The final product must open in a standard desktop browser and be operable using a mouse and keyboard.

It should ultimately be suitable for deployment as a private or public website, allowing authorised users to save projects, share equipment definitions and access designs from multiple computers.

### Mandatory development principles

1. Do not guess dimensions, mounting geometry, port positions, equipment compatibility, cable lengths or physical behaviour where accuracy matters.
2. Ask me specific questions whenever essential information is missing or ambiguous.
3. Distinguish verified specifications, configurable defaults, placeholders, estimates and unknown information.
4. Do not falsely claim a feature is working merely because code exists.
5. Do not mark a task complete without appropriate validation.
6. Do not silently remove features from the requirements.
7. Do not substitute cosmetic effects for functional behaviour without explicit disclosure.
8. If a requested feature proves technically impractical, explain the limitation, present alternatives and obtain approval before changing its intended behaviour.
9. Keep the application runnable throughout development.
10. Prioritise correctness, reliability, usability, maintainability and then visual polish.
11. Do not falsely represent calculated cable lengths as measurements where sections of the cable route are unknown.
12. Treat equipment geometry, cable connections and cable schedule data as authoritative project information, not disposable visual effects.

You have permission to organise the implementation into milestones, but the objective remains the complete application.

---

## 2. Requirements Discovery

Before implementing geometry-dependent features, review the requirements and identify any missing information.

Ask me concise, grouped questions that are necessary to proceed accurately.

In particular, establish:

- Whether rack depth means overall external depth, usable internal depth, front-to-rear mounting-rail spacing, or another measurement.
- How changes in rack depth are physically constructed.
- Whether I can provide photographs and measurements of an existing rack.
- How the rack's depth transitions are positioned and supported.
- The rack's nominal width and mounting standard.
- Whether front and rear mounting posts are present at every rack level.
- Whether equipment can be mounted from both front and rear.
- Any special mounting arrangements used in vehicle racks.
- Whether I have particular examples of devices, mounting rails or cable trays that should be replicated accurately.
- Whether external cable destinations need to be represented in the 3D environment or only documented in a cable schedule.
- How cable length allowances are normally calculated in our installations.
- Which cable schedule columns and identification conventions our engineering team uses.
- The intended project directory and local development environment, if not already available.

For rack-depth transitions, verify whether U positions are counted from the bottom and whether a transition beginning at U16 includes U16 itself.

Do not invent these answers.

You may proceed with generic infrastructure that does not depend on unresolved details, using clearly identified example data where appropriate.

Maintain a requirements and assumptions register.

An unresolved physical specification must not silently become a supposedly accurate feature.

---

## 3. Technology, Architecture and Deployment

Develop this as a modern **web-first, local-first engineering application**.

### Preferred technology stack

- React with TypeScript.
- Vite.
- Three.js.
- React Three Fiber.
- React Three Drei.
- Zustand or an equivalently appropriate state management solution.
- Rapier for collision and physics functionality where suitable.
- A purpose-built cable routing and geometry subsystem.
- Vitest for automated unit and integration tests.
- Playwright for browser end-to-end and visual regression testing.
- Zod or equivalent runtime schema validation.
- IndexedDB for local project storage.
- A suitable backend database and object storage system when cloud project saving is implemented.

Verify current stable compatible versions from official documentation before installing packages.

Avoid experimental versions unless there is a justified requirement.

You may recommend a superior architecture, but explain the reasons before significantly deviating.

### 3.1 Browser-first approach

The 3D simulation should normally run on the user's local computer through the browser.

Client-side operations should include:

- 3D rendering.
- Camera movement.
- Equipment dragging.
- Placement validation.
- Installation animations.
- Interactive cable editing.
- Cable geometry updates.
- Most collision calculations.
- Cable routing where computationally practical.

Do not require a cloud GPU or continuous server-side calculation for ordinary modelling interactions.

For expensive processing, consider Web Workers, WebAssembly or other suitable techniques to prevent the user interface from freezing.

### 3.2 Future hosted deployment

The architecture must support eventual deployment as a hosted website.

Plan for:

- User accounts.
- Authentication.
- Secure project storage.
- Shared equipment libraries.
- Project access permissions.
- Revision history.
- Organisation or team workspaces.
- Project backups.
- Secure file and image uploads.

Implement these using sound security practices when the relevant deployment stage is reached.

Do not build a proprietary authentication mechanism unnecessarily.

### 3.3 Optional Windows application

Keep the application architecture compatible with future packaging using Tauri or an equivalent desktop application wrapper.

Separate browser-specific and desktop-specific functionality from the core engineering model.

The project must not require a Windows-specific component to perform its normal browser operations.

### 3.4 Architectural separation

Separate the application into independently testable systems:

1. Rack geometry engine.
2. Device definition and asset library.
3. Device placement and mounting engine.
4. Animation and interaction engine.
5. Port definition and connectivity engine.
6. Cable pathfinding and geometry engine.
7. Cable physics and constraints engine.
8. Mounting accessories and cable management engine.
9. External cable destination and exit-point subsystem.
10. Cable schedule generation engine.
11. Cable length and procurement calculation engine.
12. Image and geometry import subsystem.
13. Project persistence and import/export.
14. User interface and interaction layer.
15. Automated testing and validation utilities.

Business logic must not be tightly coupled to rendered Three.js objects.

Use a central, typed data model from which the 3D scene is generated.

Use stable identifiers for devices, ports, cables, accessories, mounting locations, exit points and external destinations.

All physical measurements must use millimetres internally.

Convert to rendering units consistently using one documented transformation.

Provide undo and redo for meaningful editing operations.

The initial application should run locally without requiring a paid cloud service, login or external AI API.

---

## 4. Rack Configuration and Geometry

### 4.1 Basic rack creation

Allow users to create a rack with configurable:

- Project name.
- Rack name.
- Total height in U.
- Rack width.
- Overall rack depth.
- Usable internal depth.
- Front and rear mounting rail positions.
- Vertical and horizontal frame elements.
- Rack mounting standard and hole type.
- Rack colour and appearance.
- Optional side panels, top panel, doors and rear panel.
- Rack orientation and access clearances.

Use accurate 19-inch rack geometry where the relevant standard applies.

A rack unit is 44.45 mm.

Represent the mounting-hole pattern accurately rather than placing equally spaced decorative holes.

Where useful, show U numbers alongside the mounting posts, with U1 at the bottom unless the user explicitly selects another convention.

### 4.2 Variable rack depth

The rack must support changes in depth at particular heights.

Example configuration:

Total rack height: 20U.

U1–U15: 800 mm deep.

U16–U20: 750 mm deep.

This is an illustrative example only.

Confirm what the depth measurements physically represent before implementing the final geometry.

Requirements:

- Support multiple independently configurable depth sections.
- Permit editing section boundaries and dimensions.
- Generate physically meaningful supporting structures.
- Represent stepped frame members and transitions accurately.
- Support additional metalwork at a transition.
- Allow braces, crossmembers, plates and mounting supports.
- Account for these objects in collision and cable routing calculations.
- Permit users to specify support-member dimensions and positions.

Create an interface that allows depth sections to be added, edited and removed.

### 4.3 Photograph-assisted rack modelling

I should be able to upload photographs showing the rack construction.

The application should support a guided workflow where:

1. I upload one or more reference photographs.
2. I identify known dimensions or reference points.
3. The software helps establish orientation and scale.
4. I identify visible frame members and transition locations.
5. The application generates or edits corresponding structural geometry.
6. I review measurements and correct the result.
7. The accepted geometry becomes part of the rack definition.

Automatic image interpretation may assist, but it must not present unverified inferred dimensions as fact.

Single photographs cannot always reveal hidden geometry, depth or scale reliably.

Request more views or measurements when necessary.

Provide manual modelling controls as a dependable fallback.

### 4.4 Rack views

Provide:

- Front orthographic view.
- Rear orthographic view.
- Left side view.
- Right side view.
- Top view.
- Free 3D orbit view.
- Perspective and orthographic camera options.
- Optional cutaway or section view.
- Optional frame-only view.

Allow users to hide structural panels temporarily without deleting them.

Provide a clear way to reset the camera.

---

## 5. Device Library and Definition System

The left-hand panel should contain a searchable, categorised device library.

Device categories should include:

- Servers.
- Computers.
- Network switches.
- Patch panels.
- AVoIP equipment.
- Power equipment.
- Shelves.
- Cable management.
- Custom equipment.

Users must be able to create, duplicate, edit, import and delete custom device definitions.

Deleting a library definition must not silently corrupt an existing project containing instances of that device.

### 5.1 Device properties

Every device definition should support:

- Manufacturer.
- Model.
- Custom name.
- Category.
- Width in mm.
- Height in U and/or mm where appropriate.
- Depth in mm.
- Device body shape.
- Front and rear orientation.
- Mounting type.
- Front and rear overhangs.
- Optional mass and centre of gravity.
- Optional equipment colour.
- Front image.
- Rear image.
- Optional side images.
- Optional imported 3D model.
- Defined connection ports.

Distinguish between device chassis width and total width including rack ears.

Rackmount faceplates and rack ears may extend beyond the equipment body.

### 5.2 Mounting types

Support at least:

1. Direct rack-ear mounting.
2. Front and rear rail mounting.
3. Shelf mounting.
4. Fixed bracket mounting.
5. Side-mounted equipment.
6. Freestanding equipment on a shelf.
7. User-defined mounting arrangements.

A non-rackmount PC might be only 300 mm wide and sit on a shelf occupying 2U or more.

The model should place the PC on the shelf, not automatically extend the PC's width to the rack rails.

Shelves and their brackets must be independent objects with their own geometry, placement and clearances.

A device may have different mounting requirements from other devices of the same height.

### 5.3 Importing device photographs

Allow a user to upload a photograph or front-panel image.

Provide image scaling, cropping, positioning and calibration tools.

The front image should align correctly with the physical front surface of the device.

Support transparent images.

Allow the user to define a separate rear texture.

If an image has perspective distortion, provide suitable correction or require a better reference.

Never use the image alone to claim accurate device dimensions.

### 5.4 Custom device geometry

Not all devices are rectangular boxes.

A PC might have:

- An overhanging lid.
- Recessed connection panels.
- Protruding handles.
- Fans and ventilation grilles.
- Rear cable-management brackets.
- Stepped or angled casing.
- A cover extending 20 mm beyond the main chassis.

Allow users to model these details.

Provide:

- Editable boxes and primitive shapes.
- Compound shapes.
- Extrusions.
- User-defined outlines.
- Editable offsets.
- Independently positioned subcomponents.
- GLB/glTF model import where supported.
- Collision geometry associated with the visible shape.

Consider an image-assisted outline detection feature that suggests shapes from photographs.

For example, the user could trace or confirm the outline of an overhanging lid and specify its dimensions and extrusion depth.

For shapes that cannot be reconstructed confidently, provide manual correction tools rather than inventing geometry.

Imported models must be scaled, oriented and validated before use.

---

## 6. Equipment Drag-and-Drop Installation

This is one of the most important user interactions.

### 6.1 Selecting equipment

The user should be able to click and hold a device in the left library, drag it into the 3D scene and position it within the rack.

During dragging:

- Show a semi-transparent device preview.
- Track the intended mounting location.
- Highlight the selected U positions.
- Snap the preview to valid rack positions.
- Show occupied locations.
- Identify incompatible mounting arrangements.
- Display collisions clearly.
- Prevent invalid installation.

The camera must not unexpectedly rotate while a device is being dragged.

Ensure dragging remains accurate when the camera is zoomed or rotated.

### 6.2 U snapping

If a device is 2U high, it must occupy exactly two rack units.

It must not overlap an installed device or mounting accessory.

The actual space occupied must include relevant chassis overhangs and mounting geometry, not only the nominal U allocation.

Check both front and rear equipment where applicable.

### 6.3 Installation animation: direct rack mounting

When the user releases a valid directly mounted device:

1. Snap it into the correct U alignment.
2. Move it smoothly towards the front mounting plane.
3. Animate it sliding backwards until the mounting ears contact the front rack rails.
4. Stop at the physically correct mounting position.
5. Animate the correct number of mounting screws entering the appropriate holes.
6. Mark the installation as complete.

For a typical device requiring four front screws, animate all four.

Do not force four screws on a mounting arrangement that requires something different.

The mounting details must be part of the device or mounting-system specification.

Use smooth, controlled animation with configurable duration.

Avoid unrealistic bouncing, rotation, clipping or acceleration.

### 6.4 Removing equipment

When the user clicks and begins dragging an installed device:

1. Fade out or quickly remove its mounting screws.
2. Move the device forwards to clear its mounting plane.
3. Allow the user to reposition it.
4. Display the next valid target.
5. Reinstall it when released.

This operation should be considerably quicker than the initial installation.

Connected cables must remain tracked during this action.

If their routing is invalidated, recalculate it or indicate that user intervention is required.

Do not silently disconnect cables.

### 6.5 Rail-mounted devices

For devices requiring mounting rails:

1. Identify the rail kit associated with the device.
2. Check front-to-rear mounting-post compatibility.
3. Check the available installation space.
4. Position the rails at the selected U.
5. Animate the rail brackets and rails being installed.
6. Show required fasteners.
7. Animate the device sliding onto or into those rails.
8. Stop at the correct front mounting position.
9. Animate final securing screws or latches.

Rail models must have real dimensions and collision geometry.

Do not allow an incompatible rail to stretch or penetrate rack structures to make the animation work.

### 6.6 Shelf-mounted devices

For devices requiring a shelf:

1. Check whether a suitable shelf is already present.
2. If required, install or prompt the user to choose one.
3. Animate the shelf mounting.
4. Place the device onto the shelf.
5. Check for interference and available clearance.
6. Respect the shelf's usable area and any configured load capacity.
7. Preserve the relationship between the shelf and its supported devices.

If the user moves or removes the shelf, handle the supported devices appropriately rather than leaving them floating.

### 6.7 Installation state machine

Implement installation animations using explicit states, not arbitrary independent timers.

Examples include:

- In library.
- Dragging.
- Previewing.
- Placement validated.
- Installing supports.
- Sliding into position.
- Securing fasteners.
- Installed.
- Unlocking.
- Removing.
- Invalid placement.

State transitions should be testable and robust against repeated clicks, interrupted animations and undo/redo.

---

## 7. Ports and Connectivity

Each device should support a user-defined port configuration.

### 7.1 Port types

Include common types such as:

- RJ45 network.
- Fibre optic.
- HDMI.
- DisplayPort.
- USB-A.
- USB-C.
- Serial.
- Audio.
- DC power.
- IEC AC power.
- Coaxial.
- SDI.
- Custom connector types.

Each port definition should contain:

- Unique ID.
- Port name.
- Port category.
- Connector type.
- Front, rear, side or custom surface.
- Local 3D position.
- Orientation and insertion direction.
- Optional port colour.
- Optional connection restrictions.

Each physical port must have a unique identity.

For example, a 24-port switch should contain separately identifiable ports 1–24.

### 7.2 Port editor

Provide an interface where I can:

1. Open a device definition.
2. View its front or rear image.
3. Click the desired port position.
4. Assign the port name and type.
5. Adjust its exact position.
6. Specify the connector orientation.
7. Save the device.

Allow ports to be repositioned later.

Port positions must remain correctly attached to devices when moved or rotated.

Where photographs are used, translate image coordinates into the device's calibrated local geometry.

### 7.3 Connection creation

I should be able to connect two physical ports.

Example:

PC1 Ethernet port → Network Switch Port 1.

The application should:

1. Identify the originating port.
2. Identify the destination port.
3. Validate connector compatibility.
4. Create a cable record.
5. Generate the visual cable endpoints.
6. Permit manual routing of that cable.
7. Display the connection in a searchable connectivity list.

Prevent accidental duplicate use of single-connection ports unless explicitly allowed.

Support connection editing and deletion.

Provide a warning where connector types are incompatible.

Maintain connectivity independently of the 3D visualisation so it survives model updates.

---

## 8. Cable Simulation and Routing

This subsystem requires particular attention.

Cables must behave as flexible physical objects, not straight decorative lines passing through equipment.

### 8.1 Cable definitions

Support:

- Cable name and ID.
- Cable type.
- Diameter.
- Colour.
- Origin port.
- Destination port.
- Connector geometry.
- Minimum bend radius.
- Optional specified physical cable length.
- Optional slack allowance.
- Routing waypoints.
- Cable tie and anchor associations.
- Loom membership.

Provide editable presets for common cable categories.

Do not invent engineering limits such as permissible bend radius for a specific cable manufacturer.

Where specifications are unavailable, use clearly labelled user-configurable values or mark them unknown.

### 8.2 Manual routing

After connecting two ports, the user must be able to select the cable and manipulate its route.

They should be able to:

- Drag cable segments.
- Add waypoints.
- Move waypoints.
- Remove waypoints.
- Position a route around equipment.
- Route cable up and down rack sides.
- Route cable beneath or behind equipment.
- Route cable through trays and support structures.
- Establish additional constraints.
- Inspect cable length.

The cable should update smoothly while the user edits it.

### 8.3 Flexible cable geometry

Render cables as convincing three-dimensional flexible objects with actual diameter.

Use suitable curves, tube geometry or equivalent rendering techniques.

The result should exhibit natural curvature rather than sharp angular bends.

The user must see changes in shape as waypoints and endpoints move.

The underlying cable length must be calculated from the real three-dimensional path.

Distinguish clearly between:

- Calculated routing length.
- User-selected cable length.
- Required service loop or slack.
- Available excess length.

Do not physically stretch a fixed-length cable to make it reach.

Warn when the defined cable length is inadequate.

### 8.4 Collision detection

Cable routes must account for:

- Rack rails.
- Horizontal frame members.
- Mounting supports.
- Shelves.
- Cable trays.
- Equipment bodies.
- Protruding device geometry.
- Relevant obstructions.
- Other explicitly modelled physical constraints.

A cable must not pass through a solid device or structural component.

Provide configurable clearance around obstacles.

Use a combination of collision geometry, spatial routing, geometric constraints and physically plausible curve generation.

Investigate spatial pathfinding approaches such as A*, Theta* or other suitable algorithms, including adaptive discretisation where practical.

Ensure that smoothing a valid route does not subsequently push the cable through an obstacle.

Validate final tube geometry, including its radius, rather than checking only the centreline.

If no valid route exists, return a clear failure indication and explain the obstruction.

Do not silently generate an impossible route.

### 8.5 Physics and behaviour

Evaluate suitable methods such as:

- Constrained spline geometry.
- Segment-based cable solvers.
- Position-based dynamics.
- Verlet integration.
- Rapier-based collision constraints.
- Hybrid deterministic routing with local physical deformation.

Choose the approach based on performance, controllability and routing accuracy.

A purely decorative spline is insufficient if it passes through physical obstacles.

A fully simulated rope is also insufficient if it cannot preserve a user-defined route.

The implemented solution should combine reliable routing constraints with natural visual behaviour.

### 8.6 Cable bend radius

When the relevant cable bend radius is known:

- Calculate local curve curvature.
- Enforce or validate minimum bend radius.
- Identify violations visually.
- Prevent invalid automatic route generation.
- Permit explicitly flagged user overrides if required.

Avoid generating sharp corners that are visually smooth but physically violate the cable specifications.

### 8.7 Moving connected devices

When equipment moves:

- Preserve the connection identifiers.
- Move the cable endpoints with their ports.
- Update the route.
- Maintain fixed cable anchors where appropriate.
- Recalculate cable length.
- Detect new collisions.
- Flag excessive tension or insufficient slack.

If an operation cannot maintain the existing valid route, warn the user.

---

## 9. Cable Looms and Bundling

Allow multiple cables to be gathered into a common loom.

### 9.1 Loom creation

The user should be able to:

1. Select multiple cables.
2. Create a loom.
3. Define common routing sections.
4. Identify branch points.
5. Add cable ties.
6. Route the combined loom through the rack.

Each cable must retain its individual endpoints, identity and electrical connection.

Do not replace the cables with one purely decorative bundle.

### 9.2 Loom geometry

The combined loom should have an appropriate physical envelope based on its constituent cables.

Cables should follow a shared route where constrained together and branch naturally at designated breakouts.

Account for bundle width when validating clearance.

Where physically appropriate, provide an outer wrap, sleeving or conduit option.

### 9.3 Cable ties

I should be able to select a cable tie tool and click a position along a cable or loom.

The application should:

- Add the tie.
- Visually secure the cables.
- Treat the tie as a constraint.
- Permit moving or removing it.
- Preserve it when saving the project.

Cable ties should be modelled at realistic locations.

Do not allow a tie to float independently of the supported geometry.

---

## 10. Cable Tie Pads and Anchors

Allow creation of cable tie pads, mounts, P-clips and similar fixing points.

Users should be able to choose a mounting surface and position the fixing on that surface.

The fixing must have its own dimensions, orientation and attachment identity.

Cables or looms should be attachable to it.

Once attached:

- The routing must respect the anchor position.
- The cable should not freely drift away.
- The fixing should move with its parent object if that object moves.
- The application should recognise the resulting routing constraints.

Provide an option for screw-mounted or adhesive-style accessories where appropriate.

The application should not claim that a physical surface is suitable for adhesive or screw mounting without supporting specifications.

---

## 11. Cable Trays and Cable Management

Support custom cable tray objects.

These might include:

- Open wire basket trays.
- Perforated metal trays.
- Solid-bottom trays.
- Vertical cable managers.
- Horizontal cable managers.
- Cable rings.
- Cable ducts and trunking.

Each tray should have:

- Width.
- Height.
- Length.
- Position.
- Orientation.
- Mounting method.
- Cable entry and exit regions.
- Collision geometry.
- Optional capacity settings.

### Cable tray routing

A user must be able to route a cable into a tray and have it follow the tray.

The cable should remain within the tray's usable routing space unless explicitly taken out through an appropriate exit.

Allow cables and looms to be fixed to cable trays using ties or clips.

Do not allow a cable to pass directly through a tray wall.

Where the cable tray bends or changes direction, cable routing should follow the permitted path.

---

# 12. External Cable Exit Points and Destinations

This is a major additional requirement.

The application must support cables that do not terminate inside the rack.

In real installations, many cables are connected to equipment or patch panels inside the rack but travel outside the rack to user positions, displays, cameras, antennas and other equipment.

We need to accurately document these connections even when the external devices are not modelled in 3D.

## 12.1 Rack cable exit points

Allow the user to create one or more cable exit points.

These might represent:

- A hole in the rack.
- A cable gland.
- A cable brush plate.
- A cable pass-through.
- A cable tray leaving the enclosure.
- A floor entry or exit.
- A rear cable opening.
- A side cable opening.
- A cable loom exiting towards another part of a vehicle.

Each exit point should have:

- Unique ID.
- User-defined name.
- Position in the rack.
- Orientation.
- Dimensions or usable opening size.
- Optional physical geometry.
- Optional cable capacity information.
- Optional mounting hardware.
- List of cables using the exit point.

Example exit points:

- Rear Cable Exit 1.
- Roof Loom Exit.
- Front Console Cable Exit.
- Vehicle Bulkhead Exit.
- Floor Cable Entry.

The user should be able to position an exit point in the 3D scene and route cables or looms through it.

The routing engine must recognise the exit point as an intentional, permitted path through the relevant enclosure boundary.

It must not simply ignore collision detection around the exit.

If the exit is associated with a physical opening, cable routing should respect the available dimensions.

## 12.2 External destinations

Allow the user to create named external destinations.

Examples:

- User Position 1.
- User Position 2.
- Operator Desk.
- Rear Workstation.
- Screen 1.
- Screen 2.
- Mast Camera.
- External Antenna.
- Vehicle Router.
- External Network Cabinet.
- AVoIP Decoder Screen 1.
- Driver Console.

Each external destination should support:

- Unique ID.
- Destination name.
- Location or area.
- Optional associated device.
- Optional port definitions.
- Optional physical position.
- Optional manually defined external cable run length.
- Notes.

The destination may exist only as a logical entry in the cable schedule.

It must not be mandatory to build a complete 3D model of an entire vehicle or room merely to document a connection leaving the rack.

## 12.3 Connection example

I should be able to create the following connection:

Source:

Patch Panel 1 — Port 1.

Cable exit:

Rear Cable Exit 1.

Destination:

User Position 1 — Network Port 1.

Purpose:

Operator workstation network connection.

Cable type:

Cat6A.

Termination:

Unterminated bulk cable, terminated during installation.

The application should create a complete cable record and associate the corresponding visible cable route with the selected rack exit point.

## 12.4 External cable length

If the route is modelled only inside the rack, the simulator cannot know the true external cable distance.

Therefore, the application must distinguish:

- Calculated in-rack route length.
- Modelled external route length, if available.
- Manually entered external route length.
- Unmodelled or unknown external route.
- Additional service loop.
- Termination allowance.
- Final required cable length.

For example:

Calculated in-rack route: 1.4 m.

Manually specified external distance: 5.5 m.

Service loop: 0.8 m.

Termination allowance: 0.2 m.

Required cable length: 7.9 m.

The application should clearly identify which measurements were calculated and which were entered manually.

If no external distance has been defined, do not falsely claim to know the complete required cable length.

Display an incomplete or provisional length until sufficient information exists.

## 12.5 Multiple cables through one exit

Allow multiple independent cables and cable looms to share one exit point.

Track which cables pass through each exit.

Provide a way to view all cables associated with a particular exit.

Identify insufficient exit clearance where the necessary dimensions are available.

## 12.6 Future external environment modelling

Architect the external destination system so that complete rooms, vehicles, desks and other external equipment could eventually be modelled in 3D.

However, detailed external environment modelling is not a prerequisite for the initial cable scheduling functionality.

The primary requirement is reliable cable documentation and length management.

---

# 13. Master Cable Schedule Generator

This is a core feature of the finished application, not an optional extra.

The application must be able to generate **one complete master cable schedule** containing all relevant cables in the project.

The schedule should update automatically as the rack design changes.

The schedule must support both internal rack cables and cables leaving the rack through defined exit points.

## 13.1 Cable schedule records

Every physical cable should have a persistent, unique cable ID.

Example IDs:

- NET-001.
- NET-002.
- AV-001.
- HDMI-001.
- PWR-001.

Allow configurable numbering conventions and manual overrides.

Each cable record should support:

- Cable ID.
- Cable name.
- Source device.
- Source port.
- Source location.
- Destination device or position.
- Destination port.
- Destination location.
- Cable purpose.
- Cable category or type.
- Manufacturer or specification.
- Cable colour.
- Termination method.
- Connector at end A.
- Connector at end B.
- Rack exit point, if applicable.
- Cable loom, if applicable.
- Calculated route length.
- Manually entered length.
- Service loop or slack allowance.
- Termination allowance.
- Required installation length.
- Selected supplied cable length.
- Length validation status.
- Cable installation status.
- Notes.

Support both end-to-end connectivity and logical labels.

For example:

Source: Patch Panel 1, Port 1.

Destination: User Position 1, Network Port 1.

Purpose: User workstation network.

The user must be able to edit the destination and purpose without having to change the physical 3D route.

Likewise, moving the cable in the 3D scene must not delete the documentation associated with that cable.

## 13.2 One master schedule

Generate a master schedule from every physical cable in the project.

Do not generate separate disconnected schedules that require manual merging.

Allow users to filter the master schedule by:

- Cable type.
- Cable colour.
- Source.
- Destination.
- Exit point.
- Loom.
- Preterminated or unterminated.
- Installation status.
- Rack area.
- Purpose.

Also provide optional grouped schedule views.

All views must use the same underlying authoritative cable records.

A cable belonging to a loom must still appear as its own record.

A cable passing through a rack exit point must not accidentally be counted as two separate physical cables.

## 13.3 Cable schedule table

Create a professional table interface.

Users should be able to:

- Resize columns.
- Reorder columns.
- Hide and show columns.
- Filter entries.
- Search.
- Sort.
- Edit permitted fields.
- Select multiple records.
- Apply bulk changes.
- Copy values.
- Export the complete schedule.

The schedule must be usable independently of the 3D rack view.

Selecting a cable in the schedule should highlight the corresponding cable in the 3D scene.

Selecting a cable in the 3D scene should highlight the corresponding schedule row.

## 13.4 Custom cable schedule templates

Different engineering projects may require different schedule formats.

Allow users to define and save column configurations.

For example, our company might use:

1. Cable Number.
2. Cable Type.
3. Source Device.
4. Source Port.
5. Destination Device.
6. Destination Port.
7. Purpose.
8. Cable Length.
9. Notes.

Another project might require a different set of columns.

Support reusable templates.

Preserve column configuration when a project is reopened.

---

# 14. Preterminated and Unterminated Cable Management

The application must distinguish between preterminated cables and bulk cable cut from reels.

This distinction affects lengths, purchasing quantities and installation procedures.

## 14.1 Preterminated cables

A preterminated cable is supplied at a fixed length with connectors already fitted.

Examples:

- 0.5 m Cat6A patch lead.
- 1 m Cat6A patch lead.
- 2 m Cat6A patch lead.
- 3 m HDMI cable.
- 5 m USB cable.
- 1.5 m IEC power cable.

When creating a cable, the user should be able to select:

**Cable Supply Type: Preterminated**

Then specify:

- Cable type.
- Manufacturer or model.
- Connector at end A.
- Connector at end B.
- Supplied cable length.
- Colour.
- Optional part number.
- Optional price.
- Quantity, where appropriate.

For example:

Cat6A S/FTP Patch Lead — 2.0 m.

This cable has a physical supplied length of 2.0 m.

Its length must not automatically change merely because the user edits the routing path.

The application should compare its actual supplied length against the required routing length.

If a user attempts to route a 2.0 m cable along a path requiring 2.3 m, display an insufficient-length warning.

Suggest a compatible longer cable where available.

Do not automatically stretch it.

## 14.2 Changing a preterminated cable

The user should be able to change a selected cable from 2 m to 3 m, for example.

Update the cable record and recalculate the excess available length.

If the newly selected cable is shorter than the required route, flag the issue.

Do not silently shorten the routing path in a way that bypasses obstructions or violates minimum bend-radius constraints.

## 14.3 Spare cable length

If a 2 m preterminated cable requires only 1.6 m along its defined route, the remaining 0.4 m should be treated as available slack.

Provide an option to define how and where that slack is physically accommodated.

For example:

- Service loop.
- Rear cable management.
- Side cable tray.
- Free slack near equipment.

Where slack is visually represented, it must still respect collision and bend-radius requirements.

Do not imply that excess cable automatically fits within the rack.

## 14.4 Unterminated bulk cable

The user should also be able to select:

**Cable Supply Type: Bulk Cable / Cut from Reel**

In this case, the cable length is not restricted to a preset catalogue length.

For example, the required cut length might be:

- 2.35 m.
- 3.4 m.
- 6.75 m.
- 18.2 m.

The system should calculate the length based on the actual routing information and specified allowances.

It should also permit manual overrides.

## 14.5 Termination configuration

Bulk cable may be terminated using:

- RJ45 plugs.
- RJ45 keystone modules.
- Patch panels.
- Fibre connectors.
- Terminal blocks.
- Other user-defined termination methods.

Allow separate termination definitions at both ends.

Support configurable termination allowances.

For example, an engineer might want an additional 100 mm at one end and 150 mm at the other.

Do not assume the same allowance applies to every connector or cable type.

Distinguish between:

- Physical cable cut length.
- Cable length used for routing.
- Termination preparation allowance.
- Service loop.
- Installation waste.

## 14.6 Required length calculation

For an unterminated cable, use a transparent calculation model.

For example:

Required Cut Length = Routed Path Length + Service Loop Allowance + Termination Allowances + Other Explicit Allowances.

The exact rules should be configurable.

Display a breakdown so the user can understand the calculated result.

Do not double-count slack or allowances.

Keep all calculations internally in millimetres to avoid floating-point rounding inconsistencies.

## 14.7 Length rounding

Allow configurable cut-length rounding.

For example:

- Exact calculated length.
- Nearest 10 mm upwards.
- Nearest 50 mm upwards.
- Nearest 100 mm upwards.
- Nearest 0.5 m upwards.

Always round upwards for a cutting allowance rule, not to the nearest value where that could result in a shorter cable.

The selected rounding policy must be visible and applied consistently.

## 14.8 Cable length validation

The application should identify:

- Insufficient cable length.
- Excessive slack.
- Unknown external route length.
- Unverified manual measurements.
- Bend-radius issues.
- Cable routes exceeding applicable user-defined or manufacturer-specified limits.

Do not claim an entire Ethernet link is compliant merely because it fits physically.

Where appropriate, account for differences between permanent link and channel limits, cable construction and manufacturer restrictions.

Any compliance assessment should use explicit verified specifications.

---

# 15. Cable Reel Inventory and Procurement Calculator

This is another core feature.

The application must calculate how much unterminated cable is required and how many reels should be ordered.

It must support the standard reel lengths used by our engineering team.

For example:

305 m Cat6A cable reels.

## 15.1 Cable stock definitions

Allow users to define bulk cable products.

Each product should support:

- Product name.
- Manufacturer.
- Cable type.
- Specification.
- Colour.
- Part number.
- Standard reel length.
- Alternative reel lengths, if available.
- Quantity of existing reels.
- Optional available partial reels.
- Optional unit cost.
- Optional supplier.
- Minimum stock or reserve preferences.
- Procurement safety margin.

Different cable products must be calculated separately.

Do not automatically combine physically different cables simply because they are both network cables.

For example, Cat6A blue and Cat6A red may require separate inventory calculations.

## 15.2 Total cable requirement

Automatically calculate the total required bulk cable length.

Example:

- Cable 1: 8.4 m.
- Cable 2: 12.7 m.
- Cable 3: 5.8 m.
- Cable 4: 17.5 m.

Total required: 44.4 m.

This total must include the selected cable-cut allowances.

It must not include preterminated patch leads because these are purchased as complete individual cables.

Avoid double-counting individual cables simply because they are members of a loom or pass through several cable trays.

## 15.3 Basic reel calculation

For a simplified aggregate estimate:

Minimum Reel Count = Ceiling(Total Required Length / Reel Length).

Example:

Total bulk cable required: 405 m.

Standard reel length: 305 m.

Aggregate minimum: 2 reels.

However, this is not sufficient as the final procurement calculation.

The application must also consider individual required cut lengths.

## 15.4 Cut allocation and reel optimisation

A physical cable run must normally be cut as a continuous length.

The calculator must not assume the remaining lengths of separate reels can be combined to make one continuous cable.

Treat the cutting plan as a stock allocation or bin-packing problem.

Use an appropriate allocation algorithm to distribute required cable cuts across available reels.

The system must:

- Assign individual cuts to available reels.
- Prevent cuts from exceeding the remaining length of a reel.
- Track remaining reel lengths.
- Attempt to minimise reel usage and unnecessary waste.
- Identify when an aggregate calculation underestimates the actual number of reels required.
- Account for existing partial reels.
- Support configurable cutting waste.

For example, if the total is 405 m, two 305 m reels will be sufficient only when the individual cuts can actually be allocated across those two reels.

If three individual cables each require 135 m, the total is 405 m, but three reels are required because two 135 m cuts cannot fit on one 305 m reel? 

**Important: The preceding example does fit two 135 m cuts on one 305 m reel, so two reels suffice. Use correct mathematical validation and construct genuine counterexamples rather than relying on an incorrect illustrative claim.**

For example, three 160 m cuts total 480 m, but require three 305 m reels because two 160 m cuts cannot fit on a single reel.

Use exact calculations and tested allocation logic.

Optimisation may use established bin-packing algorithms.

Be clear where an algorithm is heuristic rather than mathematically guaranteed to find the optimum.

## 15.5 Safety margin and recommended order quantity

The application must distinguish between:

- Technical minimum reels.
- Recommended purchase quantity.

This is extremely important.

Example:

Total cable required: 300 m.

Reel length: 305 m.

Technically, one reel may be sufficient.

However, that leaves only 5 m spare.

This is a high-risk procurement situation because:

- Measurements might change.
- A cable might be damaged.
- A termination might need to be repeated.
- Installation may require additional slack.
- Unexpected rerouting may occur.
- Cutting waste may occur.

Therefore, the application should be able to recommend:

**Minimum required: 1 reel.**

**Recommended order: 2 reels.**

Reason: Only 5 m spare, below the configured safety reserve.

Allow users to configure the safety reserve.

For example:

- Percentage of reel length.
- Fixed reserve length.
- Project-wide contingency percentage.
- Combination of these approaches.

Do not hardcode an arbitrary safety margin without making it configurable.

Clearly distinguish an advisory recommendation from an absolute physical requirement.

## 15.6 Example procurement calculations

The application should correctly handle examples such as:

**Scenario A**

Bulk cable required: 120 m.

Reel size: 305 m.

Technical minimum: 1 reel.

Recommended quantity: normally 1 reel, subject to configured reserve rules.

**Scenario B**

Bulk cable required: 300 m.

Reel size: 305 m.

Technical minimum: 1 reel, provided the individual cuts fit.

Recommended quantity: 2 reels if the remaining 5 m falls below the configured reserve threshold.

**Scenario C**

Bulk cable required: 405 m.

Reel size: 305 m.

Aggregate minimum: 2 reels.

Recommended quantity: at least 2 reels, provided all individual cuts fit and the configured safety rules do not require more.

**Scenario D**

Three individual cable runs each require 160 m.

Reel size: 305 m.

Total required: 480 m.

Aggregate minimum: 2 reels.

Actual minimum: 3 reels.

Reason: Each 160 m run requires its own reel.

All scenarios should be included in automated tests.

## 15.7 Reel cutting schedule

Generate a reel allocation plan.

For example:

Reel 1:

- NET-001: 8.4 m.
- NET-002: 12.7 m.
- NET-003: 5.8 m.
- Other allocated cables.

Show:

- Allocated length.
- Remaining length.
- Waste allowance.
- Utilisation percentage.

Provide the same details for every reel.

The results should be suitable for use by engineers preparing cables.

## 15.8 Cable procurement summary

Generate a purchasing summary grouped by product.

For example:

Cat6A S/FTP Blue — 305 m reels.

- Required bulk cable: 405 m.
- Minimum feasible reels: 2.
- Recommended order: 2, assuming the selected reserve policy permits it.
- New cable available: 610 m.
- Estimated unused cable: 205 m before applicable cutting waste.

Preterminated Cat6A 2 m patch leads:

- Required quantity: 8.

Preterminated HDMI 3 m cables:

- Required quantity: 4.

The purchasing summary must distinguish complete preterminated cable assemblies from cable reels.

Do not treat preterminated cables as available bulk reel material.

## 15.9 Existing stock

Allow the user to enter existing stock.

For example:

- One new 305 m reel.
- One partially used reel containing 86 m.
- Eight 2 m Cat6A patch leads.

The procurement system should account for available stock when calculating additional purchases.

Provide a way to reserve stock to the current project.

Avoid double-counting stock if the future application supports multiple projects.

Any shared inventory features must be designed with appropriate concurrency controls once multi-user access is implemented.

---

## 16. Cable Schedule and Procurement Export

Allow users to export professional documents based on the current project.

### 16.1 Master cable schedule

Support export to:

- CSV.
- XLSX.
- PDF.

The export should include the configured columns and useful project metadata.

Ensure CSV and Excel exports preserve identifiers, units and numeric values correctly.

### 16.2 Cable cut list

Generate a separate cut list containing:

- Cable ID.
- Cable product.
- Cable colour.
- End A termination.
- End B termination.
- Required cut length.
- Reel allocation, where applicable.
- Notes.

For preterminated cables, show the supplied product length rather than an invented cut length.

### 16.3 Purchasing list

Generate a purchasing list containing:

- Product.
- Specification.
- Part number, if defined.
- Unit of purchase.
- Technical minimum quantity.
- Recommended quantity.
- Quantity already available.
- Additional quantity to purchase.
- Optional unit cost.
- Optional total cost.

### 16.4 Project documentation

Exports should optionally include:

- Project name.
- Rack name.
- Project version.
- Export date.
- Author or organisation.
- Revision.
- Rack elevation diagrams.
- Cable exit-point list.
- Cable loom list.
- Cable schedule.
- Cut list.
- Procurement summary.

Do not require a PDF export to contain every available document section.

Allow users to choose what to include.

### 16.5 Data accuracy

Exported totals must match the application's underlying calculations.

The cable schedule, cutting plan and procurement summary must all derive from the same authoritative cable records.

Avoid maintaining separate copies of quantities that can become inconsistent.

---

## 17. User Interface and Experience

Develop a professional engineering application interface.

### Left panel

Device library with:

- Search.
- Categories.
- Device thumbnails.
- New device.
- Edit device.
- Duplicate.
- Import.
- Drag-and-drop.

### Centre

Large interactive 3D workspace with:

- Rack visualisation.
- Smooth orbit controls.
- Pan and zoom.
- View selectors.
- Selection highlighting.
- Drag previews.
- Snap indicators.
- Measurements.
- Cable routing controls.
- Installation animation.

### Right panel

Context-sensitive property editor for:

- Rack dimensions.
- Depth sections.
- Selected devices.
- Mounting arrangements.
- Ports.
- Cables.
- Cable supply type.
- Cable length.
- Looms.
- Trays.
- Anchors.
- Exit points.
- External destinations.

### Main workspace tabs

Provide a convenient way to switch between major workflows:

1. **3D Rack Designer**
2. **Device Library**
3. **Cable Connections**
4. **Cable Schedule**
5. **Cable Cut List**
6. **Procurement**
7. **Project Settings**

These may use tabs, panels or another appropriate layout.

The 3D view should remain easily accessible from the cable schedule.

### Toolbar

Include:

- New project.
- Open.
- Save.
- Import.
- Export.
- Undo.
- Redo.
- Front view.
- Rear view.
- Side view.
- Reset view.
- Measurement tool.
- Cable tool.
- Mounting accessories.
- Visibility settings.

### Visual design

Use a polished, restrained interface.

Prefer clear engineering-style controls over decorative elements that reduce usable workspace.

Use subtle lighting, realistic metal materials, soft shadows, readable labels and consistent colours.

Provide visual feedback for every meaningful interaction.

Invalid placement should be clearly distinguishable from valid placement without relying solely on colour.

Support common desktop display resolutions, including 1920 × 1080.

Consider accessible keyboard alternatives for drag-and-drop and precise placement.

---

## 18. Saving and Exporting Projects

All meaningful user-created information must be persistable.

Support:

- Save project locally.
- Reopen saved project.
- Autosave with recovery.
- Export complete project as JSON.
- Import project JSON.
- Duplicate project.
- Export screenshot.
- Export front and rear rack elevations.
- Export equipment list.
- Export port connectivity list.
- Export cable schedule.
- Export cable lengths.
- Export cable cut list.
- Export procurement summary.

Use versioned project schemas and migration logic for future compatibility.

Validate imported data.

Handle missing assets gracefully.

Ensure project export includes the data necessary to reconstruct the rack without relying on temporary browser object URLs.

On reopening a project, restore:

- Rack configuration.
- Device definitions and placements.
- Mounting accessories.
- Port configurations.
- Cable connections.
- Cable paths.
- Cable ties.
- Looms.
- Trays and anchors.
- Rack exit points.
- External destinations.
- Cable purposes.
- Cable supply types.
- Cable length settings.
- Cable schedule settings.
- Cable stock products.
- Reel inventory and procurement preferences.

Do not silently lose data.

### 18.1 Future cloud storage

Architect the persistence layer to support saving projects to a backend in the future.

The core rack editor should not need to be rewritten to support this.

Plan for:

- Project ownership.
- Shared projects.
- Team access.
- Revision history.
- Project duplication.
- Asset storage.
- Automatic backups.

Authentication and access control must be implemented and tested before exposing private workplace projects through a hosted deployment.

---

## 19. Project Implementation Stages

Develop the project in logical stages.

### Stage 1: Foundation

- Create the project from scratch.
- Establish repository structure.
- Configure TypeScript, linting and testing.
- Implement the basic UI.
- Render a configurable 3D rack.
- Establish the internal coordinate system.
- Implement camera controls.
- Add project persistence foundations.

Validation: rack dimensions and camera interactions must be correct.

### Stage 2: Rack geometry

- Accurate mounting rails and U positions.
- Configurable widths and depths.
- Variable-depth sections.
- Structural members.
- Geometry validation.
- Frame visibility options.

Validation: verify dimensions, transitions and solid geometry.

### Stage 3: Device library and placement

- Device editor.
- Device library.
- Image assets.
- Mounting definitions.
- Drag-and-drop.
- U snapping.
- Collision checks.
- Occupancy rules.

Validation: devices must consistently occupy valid physical locations.

### Stage 4: Installation animations

- Mounting state machine.
- Direct-mounted installation.
- Screws.
- Rail mounting.
- Shelf mounting.
- Animated removal.
- Interrupted animation handling.

Validation: animations must finish in correct physical states.

### Stage 5: Ports and connectivity

- Port definition editor.
- 3D port anchors.
- Port identification.
- Connection creation.
- Connector compatibility.
- Connection persistence.

Validation: links must remain correct after device movement and project reload.

### Stage 6: Cable routing

- Cable models.
- Manual waypoints.
- Cable geometry.
- Automatic route suggestions.
- Obstacle detection.
- Minimum bend radius.
- Path length calculations.
- Dynamic endpoint updates.

Validation: cables must avoid solids and honour configured constraints.

### Stage 7: Advanced cable management

- Cable trays.
- Cable tie pads.
- Cable ties.
- Cable looms.
- Anchoring.
- Branching.
- Constrained routing.

Validation: cable geometry and stored routing constraints must remain consistent.

### Stage 8: Rack exit points and external destinations

- Define rack exit points.
- Position exit points in 3D.
- Route cables through exit points.
- Create external destination records.
- Associate cables with named external ports.
- Support manually entered external route lengths.
- Track incomplete or unknown external route lengths.

Validation: external connections must remain correctly documented and physically connected to the rack-side route.

### Stage 9: Master cable schedule

- Develop the cable schedule data model.
- Implement automatic schedule generation.
- Support source, destination and purpose fields.
- Provide a searchable and editable schedule table.
- Implement configurable columns.
- Link schedule rows to 3D cable objects.
- Add CSV, XLSX and PDF export.

Validation: the master schedule must contain the correct physical cables without duplication.

### Stage 10: Cable lengths and termination types

- Add preterminated cable products.
- Add bulk cable products.
- Define length allowances.
- Calculate required cut lengths.
- Validate supplied cable lengths.
- Display unknown and provisional lengths.
- Support selected cable lengths and manual overrides.
- Calculate slack and available excess length.

Validation: all lengths and allowances must be accurate and internally consistent.

### Stage 11: Cable reel calculator and procurement

- Define reel sizes.
- Add cable stock inventory.
- Calculate bulk cable totals.
- Implement individual cut allocation.
- Optimise reel usage.
- Apply configurable safety reserves.
- Generate purchasing quantities.
- Generate cutting plans.
- Produce procurement exports.

Validation: test cases must include 300 m from a 305 m reel, 405 m across multiple reels and cutting arrangements that require more reels than the aggregate calculation suggests.

### Stage 12: Advanced geometry

- Compound custom device shapes.
- Imported 3D assets.
- Photograph calibration.
- Assisted outline tracing.
- Overhangs and recesses.
- Geometry editing.

Validation: inferred dimensions must require verification before being treated as accurate.

### Stage 13: Cloud-ready project architecture

- Review storage abstraction.
- Implement or prepare cloud project persistence.
- Establish user and project data schemas.
- Establish asset storage conventions.
- Introduce authentication and permissions when required for hosted use.
- Verify that local operation remains available.

Validation: project data must remain portable and recoverable.

### Stage 14: Polish and optimisation

- Performance.
- Visual presentation.
- UX refinements.
- Documentation.
- Sample projects.
- Final regression testing.

Do not declare the full project finished merely because the first few stages work.

---

## 20. Automated Testing Requirements

Testing is mandatory.

Maintain automated tests alongside implementation.

### 20.1 Unit testing

Test at least:

- Millimetre-to-scene-unit conversion.
- U-position calculations.
- Mounting-hole coordinates.
- Depth-section boundaries.
- Rack geometry generation.
- Device bounding boxes.
- Occupancy detection.
- Collision checks.
- Placement validity.
- Mounting compatibility.
- Device state transitions.
- Port coordinate conversion.
- Connector compatibility.
- Cable path length.
- Cable curvature and bend radius.
- Cable obstacle clearance.
- Anchor constraints.
- Loom membership.
- Exit-point geometry.
- External destination relationships.
- Cable length allowances.
- Preterminated cable validation.
- Bulk cable length rounding.
- Master cable schedule generation.
- Duplicate cable detection.
- Reel allocation.
- Stock consumption.
- Procurement safety margins.
- Project serialisation and deserialisation.

Use known input/output examples and boundary conditions.

### 20.2 Geometry validation

Test cases must include:

- Empty racks.
- Fully populated racks.
- Adjacent devices.
- Devices with overhangs.
- Different mounting types.
- Variable-depth transitions.
- Equipment too deep to fit.
- Equipment too wide to fit.
- Rail incompatibility.
- Rear-mounted devices.
- Shelves supporting non-rackmount devices.
- Frame obstructions.
- Conflicting mounting positions.

Test geometry with numeric assertions, not screenshots alone.

### 20.3 Cable routing tests

Construct test environments containing known obstacles.

Verify that:

1. Valid routes can be generated.
2. Solid obstacles are avoided.
3. Cable thickness is included in clearance calculations.
4. Endpoints are accurate.
5. Waypoints are honoured.
6. Minimum bend radius rules are respected where configured.
7. Calculated cable length is correct within documented numerical tolerance.
8. Invalid routes are rejected.
9. Moving equipment updates the connection geometry.
10. A cable does not penetrate equipment following curve smoothing.
11. Anchored cable sections respect their constraints.
12. Cable bundles respect their collision envelopes.
13. Routes through defined exit points behave correctly.
14. Unknown external routes are not reported as fully measured lengths.

For complex cases, include deterministic reference scenes.

Tests must validate the final rendered-route geometry or its equivalent collision representation, not merely the initial pathfinding nodes.

### 20.4 Cable scheduling tests

Test at least:

**Scenario A: Internal connection**

PC1 Ethernet → Switch1 Port 1.

Verify that the cable appears once in the schedule and retains its connections after project reload.

**Scenario B: External connection**

Patch Panel 1 Port 1 → User Position 1 Network Port 1.

Verify that the exit point, external destination, purpose and defined length are recorded correctly.

**Scenario C: Preterminated cable**

A 2 m cable is assigned to a 2.3 m route.

Verify that the application flags insufficient length.

**Scenario D: Unterminated cable**

A 3.4 m calculated cable route has specified service and termination allowances.

Verify that the final cut length includes the allowances exactly once.

**Scenario E: Reel safety margin**

300 m of bulk cable is required from 305 m reels.

Verify that the technical minimum can be one reel while the recommended quantity becomes two under an appropriate safety reserve.

**Scenario F: Multiple reels**

405 m total cable is required from 305 m reels.

Verify that the allocator determines whether two reels can accommodate all individual cuts.

**Scenario G: Infeasible aggregate estimate**

Three individual 160 m runs are required from 305 m reels.

Verify that three reels are required despite the aggregate minimum being two.

**Scenario H: Cable loom**

Five cables are gathered into a loom.

Verify that the schedule contains five cables, not an additional sixth cable for the loom.

**Scenario I: Unknown external distance**

A cable leaves the rack through an exit point, but the external distance has not been specified.

Verify that the complete length is marked provisional or unknown.

**Scenario J: Export consistency**

Generate the schedule and procurement exports.

Verify that all quantities match the project's authoritative records.

### 20.5 Interaction testing

Use Playwright to exercise the application in a real browser.

Test:

- Opening the application.
- Creating a rack.
- Changing rack height.
- Editing depth sections.
- Creating a device.
- Importing an image.
- Dragging equipment from the library.
- Dropping equipment into a valid U.
- Rejecting invalid placements.
- Repositioning installed equipment.
- Adding a shelf.
- Installing a rail-mounted device.
- Defining ports.
- Connecting ports.
- Routing cables.
- Adding cable ties.
- Creating a loom.
- Creating a rack exit point.
- Creating an external destination.
- Changing cable supply type.
- Editing cable length.
- Opening the cable schedule.
- Generating a cut list.
- Generating a reel purchasing estimate.
- Saving and reopening projects.
- Undo and redo.

Do not rely entirely on simulated clicks that bypass actual pointer interactions.

Test representative real drag-and-drop workflows.

### 20.6 Animation testing

Ensure every animation:

- Begins from a valid state.
- Follows its intended path.
- Has appropriate duration.
- Completes without geometry errors.
- Cannot leave the device in an inconsistent state.
- Correctly handles interruption and repeated interaction.

Verify animation completion numerically as well as visually.

### 20.7 Visual regression testing

Capture screenshots of representative scenes.

Include:

- Empty rack.
- Fully populated rack.
- Stepped-depth rack.
- Rack viewed from the rear.
- Rail-mounted equipment.
- Shelf-mounted computer.
- Complex cable loom.
- Cable tray and anchors.
- Rack exit points.
- Cable schedule table.
- Reel procurement summary.

Use controlled browser configurations for comparisons.

Review screenshots for clipping, misplaced screws, rendering artefacts, distorted textures and incorrect cable paths.

### 20.8 Performance testing

Create a realistic stress-test project, such as:

- One 42U rack.
- 30–40 installed devices.
- Several hundred defined ports.
- At least 100 routed cables.
- Multiple looms and cable trays.
- A selection of custom geometry.
- Numerous external destinations.
- A complete cable schedule.

Measure:

- Frames per second.
- Memory consumption.
- Initial load time.
- Scene update time.
- Cable-routing calculation time.
- Cable schedule generation time.
- Reel allocation calculation time.
- Dragging responsiveness.

Establish target performance budgets and document the test hardware.

Optimise rendering and collision computations when necessary.

Do not claim 60 FPS performance without measuring it.

### 20.9 Build and quality checks

Run:

- TypeScript type checking.
- Linting.
- Unit tests.
- Integration tests.
- Production build.
- Browser end-to-end tests.
- Visual regression tests.
- Relevant performance tests.

Where possible, use a continuous integration workflow to enforce these checks.

Do not suppress test failures merely to achieve a passing result.

---

## 21. Required End-to-End Demonstration

Before declaring completion, create a demonstration project proving that the systems work together.

The demonstration must contain:

1. A configurable 19-inch rack.
2. A depth transition.
3. A 1U network switch.
4. A 24-port patch panel.
5. A rail-mounted server.
6. A shelf-mounted PC.
7. A rear-mounted power distribution device.
8. A cable tray.
9. Multiple defined network and power ports.
10. Multiple cables between devices.
11. A cable loom.
12. Cable ties and at least one fixing pad.
13. An example of a custom protruding device shape.
14. At least one rack cable exit point.
15. At least two external destinations.
16. Preterminated cables.
17. Bulk cables cut from reels.
18. A complete master cable schedule.
19. A cable cut list.
20. A reel procurement report.

Perform the following complete workflow:

- Create the rack.
- Configure its dimensions.
- Add the devices.
- Install a device with mounting screws.
- Install a rail-mounted device.
- Place the PC on a shelf.
- Define ports on the PC and switch.
- Connect PC Ethernet to Switch Port 1.
- Route the cable around an obstruction.
- Secure it to a cable tray.
- Combine multiple cables into a loom.
- Create an external cable destination.
- Route a patch-panel cable through an exit point.
- Assign its destination and purpose.
- Define the cable as unterminated Cat6A.
- Calculate its required cut length.
- Define a 305 m cable reel product.
- Generate the reel allocation and recommended purchase quantity.
- Add a preterminated 2 m cable.
- Validate its length against its routed path.
- Generate the complete master cable schedule.
- Export the schedule.
- Export the cable cutting plan.
- Export the procurement report.
- Move one connected device.
- Recalculate or validate the affected cable route.
- Confirm the cable schedule updates.
- Save the project.
- Close or reload the application.
- Reopen the project.
- Verify that the entire configuration and documentation are preserved.

Do not consider the application complete unless this demonstration succeeds and the automated regression checks pass.

---

## 22. Error Handling and Reliability

Provide understandable feedback whenever an operation fails.

Examples:

- Device exceeds rack depth.
- Selected U is occupied.
- Required mounting rails are incompatible.
- Device cannot fit behind an obstruction.
- Cable route is blocked.
- Cable length is insufficient.
- Bend radius cannot be maintained.
- Port types are incompatible.
- Image calibration is incomplete.
- An imported model has unknown scale.
- External cable length is unknown.
- A cable is longer than its selected preterminated assembly.
- A required continuous cable cut cannot fit on a selected reel.
- Available stock is insufficient.
- A reel allocation cannot satisfy the cutting plan.
- Project file is invalid.
- Required image or 3D asset is missing.

Errors should explain what went wrong and what the user can change.

Do not silently create invalid geometry or discard user changes.

Preserve recoverable data after crashes or reloads where practical.

---

## 23. Documentation

Create clear documentation for:

- Installation and development setup.
- Starting the local server.
- Production build.
- Application architecture.
- Coordinate conventions.
- Engineering units.
- Rack standards.
- Device definition format.
- Port and connection model.
- Cable routing methodology.
- Collision handling.
- Rack exit points.
- External destination modelling.
- Cable schedule data model.
- Cable length calculation methodology.
- Termination allowances.
- Reel allocation algorithms.
- Procurement safety margin calculations.
- Saved project format.
- Importing assets.
- Running tests.
- Known limitations.
- Future extension points.

Include a user guide with screenshots of the actual running application.

Do not use fabricated interface screenshots.

Include sample projects and test fixtures.

---

## 24. Reporting and Development Discipline

Maintain a project progress document containing:

- Implemented features.
- Current work.
- Remaining requirements.
- Assumptions requiring confirmation.
- Bugs.
- Test coverage.
- Test results.
- Technical limitations.

At each milestone:

1. Summarise the completed work.
2. Run relevant tests.
3. Review the output.
4. Resolve identified failures.
5. Record anything that remains unverified.
6. Proceed to the next stage.

Avoid unnecessary interruptions for minor coding decisions, but ask about decisions affecting physical accuracy, requirements or major architecture choices.

Do not present speculative implementation as verified functionality.

A successful build does not establish that the application behaves correctly.

A passing unit-test suite does not establish that the 3D interactions work.

A screenshot does not establish that collisions and cable routes are physically valid.

Use multiple forms of evidence.

Where relevant testing equipment or browser capabilities are unavailable, report that limitation explicitly.

---

## 25. Final Acceptance Criteria

The final application must:

- Open successfully in a browser.
- Permit creation of custom racks.
- Support multiple rack-depth sections.
- Display convincing structural rack geometry.
- Support a reusable custom device library.
- Accept device images and dimensions.
- Permit drag-and-drop equipment installation.
- Snap equipment correctly to U positions.
- Animate device installation and removal.
- Animate applicable rails and mounting screws.
- Support shelves and other mounting methods.
- Permit front and rear port definition.
- Support port-to-port connectivity.
- Render genuine 3D cable paths.
- Allow interactive cable routing.
- Avoid defined physical obstacles.
- Support cable trays and fixing points.
- Support cable looms and ties.
- Support physical rack exit points.
- Support named external cable destinations.
- Permit user-defined cable purposes.
- Distinguish preterminated and bulk cable.
- Calculate cable lengths and allowances.
- Identify insufficient cable lengths.
- Generate one master cable schedule.
- Link schedule entries to the 3D scene.
- Generate cable cut lists.
- Support multiple reel sizes.
- Calculate required bulk cable quantities.
- Optimise cable cuts across reels.
- Distinguish minimum and recommended purchasing quantities.
- Support configurable procurement safety margins.
- Generate purchasing summaries.
- Export schedules and reports.
- Identify invalid physical configurations.
- Save and reopen complete projects.
- Pass appropriate automated and browser tests.
- Include complete documentation.

Do not label incomplete features as complete.

Provide a final acceptance matrix listing each requirement, its implementation status, the validation method and the evidence of successful testing.

The handover must include:

1. Complete source code.
2. Instructions to install and run it.
3. A working production build.
4. A demonstration project.
5. Automated tests.
6. Test execution results.
7. Screenshots from the actual application.
8. A sample cable schedule.
9. A sample cable cutting plan.
10. A sample procurement report.
11. Known limitations and outstanding issues.

---

## 26. Your First Actions

Before writing substantial application code:

1. Review this entire specification.
2. Verify available tools and the development environment.
3. Identify any critical missing engineering details.
4. Ask me the essential clarifying questions.
5. Propose a maintainable architecture and implementation plan.
6. Establish the directory structure and initial tests.
7. Start implementing the first functional milestone once any blocking questions have been resolved.

You are expected to build and validate the application—not merely explain how somebody else could build it.

Be thorough, technically critical and evidence-driven throughout the project.

The central objective is a rack simulator that can be trusted for practical installation planning, with clear distinction between verified physical geometry and illustrative visualisation.

**A successful final product should allow an engineer to design a rack, install equipment virtually, route every cable, document every connection, calculate cable lengths, generate a complete cable schedule, produce cutting instructions and determine what cable materials must be purchased before installation begins.**
