# Modelling workspace, cable management and adjacent racks

Updated 24 October 2026. Import [modelling-workspace.rack.json](../examples/modelling-workspace.rack.json) into a separate project to try two racks, side/under/top trays, a two-cable clip/tie bundle, a cross-rack connection and a positioned vehicle endpoint. Its dimensions are illustrative. The four cable routes pass the model's geometric checks; actual bend specifications remain unresolved.

## Place a cable tray anywhere

Drag **Perforated PVC cable tray** from the equipment palette onto a visible physical surface, or choose **Add object → Cable tray**. A surface drop aligns its floor with the surface normal, leaves a 1 mm placement gap and attaches the tray to the rack, device, accessory or shared member hit by the pointer. Empty-space drops use the viewport's front workplane. A drop does not infer brackets or a rated fixing.

Open **Modelling tools**, select the tray with **Selected object**, then choose **Move** or **Rotate**. Drag the arrows/rings or enter **World X/Y/Z** and **Rotate X/Y/Z**. This supports sides, under the rack, above it and free space; it is independent of equipment U slots. Use **Show ground plane** to reveal under-rack objects. Move snaps to 5 mm; rotate snaps to 15 degrees; numeric fields accept other values. The inspector shows parent coordinates for attached objects; the modelling panel always shows world coordinates. **Detach** retains the current world pose.

For length, close Modelling tools, select the tray and drag its green far-end **Stretch length** handle in a view exposing the length axis. The near end stays fixed, including when the tray is rotated. Numeric tray dimensions are available in the inspector. A cut section supports 40–2000 mm length, with 10 mm handle increments. Add another section for a longer installation. Slot size and pitch stay fixed: length changes add/remove complete holes. The hole pattern, lip height and initial cut are provisional; see [source and dimensions](model-designer.md).

**Duplicate object** gives a tray a new identity and a 50 mm world-X offset without copying cable membership. **Align centres** aligns one axis to another object's centre. Overlaps remain subject to engineering review; free positioning is not a mounting compatibility certificate.

## Guides, measurement and visibility

Select a free point or line guide, choose **Move**, then drag it directly. A line translates as one object; **Rotate** rotates it about its centre. Linked cables recalculate from the same guide identity. Surface waypoints created in Wiring remain world-fixed after placement; their 10 mm offset is not a persistent surface binding.

**Measure** records the straight distance between two clicked physical surface points, in millimetres. Escape cancels an unfinished measurement and returns to Select; Escape again (or **Exit** on the viewport mode pill) closes Modelling tools. The tools panel docks at the left edge of the viewport and can be hidden to a slim tab. Measurements persist in the project; they are world-space observations and do not automatically follow later equipment moves. Delete obsolete measurements from the panel.

**Hide selected**, **Isolate selected** and **Show all objects** affect the view only. Hidden objects still participate in placement and cable collision checks. Isolating a rack displays its frame and installed devices; unrelated guides, trays and cables are hidden. Visibility and tool state are temporary, not installation changes.

## Surface-attached clips, ties and tray routing

Choose **Place clip** or **Place tie**, then click a visible physical surface. The fixing records a parent attachment and local pose. Rack/device/tray/shared-member moves carry it with them; device-attached fixings follow sliding-rail service travel. Its routable opening is a bound point guide. Select the fixing to change its opening and orientation. To move a bound guide, move its hardware; the panel offers **Move attached hardware**.

In Wiring **Link cable**, click that guide to route a cable through its opening. Select a tray and choose **Create tray routing guide** in its inspector to create a bound line along the tray. Link the line to traverse its full length; reverse it when required. Stretching or rotating the tray updates the referenced path. Cable diameter and clearance affect available lanes; tray walls/floor and clip/tie walls remain collision solids.

Under **Bundles and breakouts**, select existing cables and click shared guides in traversal order, then choose **Create cable bundle**. Each cable remains an independent schedule record. Shared guides give members separate packed positions; member-specific guide links continue after the shared sequence and provide breakouts. Remove a bundle to remove its shared constraints while retaining its cables. Rebuild a bundle to change its membership/order. Shared guides can also be linked independently without creating a bundle.

The displayed bundle envelope uses a conservative grid based on the largest member diameter plus clearance. Openings and tray lanes report insufficient capacity instead of stretching hardware or cable. This is geometric cable management: no tie tension, gravity, load rating, flexible slack, animated fasteners or complete global cable-to-cable solver is implemented. Clip/tie shape dimensions are provisional generic geometry. Tray slots are visible holes but use a conservative solid floor for routing.

## Vehicle endpoints and adjacent racks

Use **Add object → Rack cable exit** for the passage out of the rack. Use **Add object → External destination**, enable **Position vehicle endpoint in 3D**, and enter its location. Connect the device port to its endpoint port and choose the rack exit. Wiring's native port connection tool can also use the endpoint marker; choose the exit in the Wiring panel first when there is more than one.

The route then includes the rack-to-exit and exit-to-endpoint portions. Moving the destination with the modelling arrows or numeric coordinates recalculates the route without changing cable identity. The stored manual external distance is ignored while **Position vehicle endpoint in 3D** is enabled, preventing double counting; the schedule's manual-external column is zero. Bulk end allowances remain separate, including the user-selected 60 mm at each end. Disabling 3D positioning restores the logical destination/manual-survey workflow. No vehicle body model is required.

Under **Rack assemblies**, choose **Add adjacent rack** for an empty rack with the selected rack's construction. It is placed beyond the rightmost rack with a provisional 50 mm gap. Select its name in **Active rack** to edit its independent U height, construction and rail planes. Move a rack using world coordinates; installed devices and rack-attached hardware follow. Racks remain axis-aligned. Cables can connect devices in different racks and recalculate if either rack moves.

**Shared beams / crossmembers** adds independent configurable members between racks. These participate in collisions and can receive surface fixings. No shared beam dimensions, shape or vehicle attachment are inferred.

**Duplicate rack assembly** copies its devices, internal wiring and attached hardware with new IDs. **Export rack assembly / Import rack assembly** provides reusable JSON assemblies; existing project identities are preserved. A single-rack export omits external/cross-rack cables and project-level shared beams. An internal wire bound to a fixing outside that rack must be unlinked first. Free unreferenced accessories are not assumed to belong to a rack. Export the whole project to preserve every inter-rack/vehicle relationship.

## Finalise equipment in Rack Studio

Yes: use **Equipment → Device Library → Edit** for an existing definition, especially the photographed PC. It preserves its detailed reference appearance while you correct measured height, chassis/ear dimensions, ports, ear thickness, support requirements and evidence. The **Device Model Designer** is suited to creating a new unit from a blank chassis and placing sockets, fans and grilles on its faces. Its schematic preview does not replace a measured mechanical drawing.

The PC's 1U allocation, 431.8 mm chassis width, 482.6 mm ear width and 381 mm depth are user supplied. Physical height, port centres and fittings still need calibration. Cisco C1300-48P-4G, the Cable Monkey/Connectix panel, APC SMT3000RMI2UC and AP7922B remain catalogue drafts until the missing dimensions/ear datums and port positions are supplied. See [equipment sources](equipment-sources.md). Do not mark a whole model verified just because its product name or one dimension is known.

Save the project, then **Equipment → Device Library → Export library** for a reusable definitions file and **Export project** for a complete backup. Libraries currently belong to each project; import the exported library into other projects deliberately. Share those JSON files together with remaining measurements/photos for review. There is no automatic shared cloud library.

## Validation

The modelling milestone passed 283 unit/integration tests in 20 files and 24 Edge browser workflows. The subsequent [generic switch milestone](generic-switch.md) adds equipment coverage; see the current [progress record](progress.md). The new browser tests exercise native guide dragging, free tray transforms, duplicate/align, visibility, a two-surface measurement, adjacent rack editing/assembly import, surface clips/ties, bundle creation, movable vehicle endpoints and local save/reopen. Older placement, rail, designer/tray stretch, wiring and report workflows remain in the suite. See [checks](validation/latest-checks.txt), [browser results](validation/modelling-browser-results.txt) and [example integrity](validation/example-integrity.txt).

Actual viewport captures: [tray placement](screenshots/modelling-tray-placement.png), [adjacent assemblies](screenshots/adjacent-rack-assemblies.png), [clip/tie bundle](screenshots/attached-cable-bundle.png), [positioned vehicle endpoint](screenshots/positioned-vehicle-endpoint.png).
