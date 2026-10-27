# Device rails: sliding service rails and fixed support rails

Rear attachment correction: the far bracket bears against the exposed rear mounting face; the near bracket bears on the inside of its post, leaving the outside clear for the device ear. Neither enters the post steel or the seated device ear. Contact tests cover both front- and rear-mounted devices with mirrored geometry. This is separate from the hardware calibration limits below. See [Wiring mode](wiring-mode.md) for shared guide controls and cable interaction.

Select an installed rack chassis, enable **Fit sliding rack rails**, then enable **Pull device forward on rails**. The first checkbox adds a separate rail assembly to that instance. The second selects the service position. It can be returned to the seated position or removed without changing device or port identities. Rail positions/configuration persist in the project. Existing projects have no new rail assemblies until enabled.

The user's follow-up establishes **500 mm of rail projection beyond the rack** and **approximately 600 mm of PC protrusion**. The model separates rail projection from the chassis lead: its default lead is 100 mm, and the service checkbox therefore selects 600 mm of chassis travel. Chassis pull-out and lead remain editable. At rest the inner member nose is 100 mm behind the mounting plane; at the example service pose it is 500 mm in front. Rear-mounted devices extend outward from the rear face with the same mirrored geometry.

The fixed outer members and mounting brackets remain connected to the front/rear rack posts. Their span follows the independently configured post spacing with **no guessed manufacturer minimum/maximum spacing constraint**, per the user's instruction. Middle and inner members slide in two stages. The overlap check prevents depicting detached telescopic members; longer members can be entered where a different configuration needs them. This geometric overlap constraint is separate from a manufacturer's rated travel limit.

Default sliding-member length **520 mm**, rail pack width **8 mm per side**, and profile height **28 mm** are editable provisional estimates. The tape photograph appears to place the member end around 52 cm; it does not establish a tolerance or identify every stage. The fully extended photograph gives overall assembly context, not an independent supported-travel limit. The 100 mm chassis lead is derived from the user's approximate protrusion description. Rail mounting height can be adjusted independently of the body. No manufacturer, model number, load rating or exact stud/keyhole/clip compatibility is inferred.

The six supplied photographs and assembly sheet are visual references, rather than software execution instructions. They show detachable inner rails, sliding middle/outer members, side keyholes/studs, release features and front/rear mounting brackets. The application currently renders channel profiles and bracket plates. Bearings, exact keyhole slots, latch/release operation and screw installation are not animated. Rail assemblies can be enabled on generic direct/rail/bracket chassis; flat plates, parametric shelves and freestanding supported devices need their own support construction and are excluded from this template. Compatibility must be established for each actual device; enabling the example assembly does not certify that the photographed kit fits other equipment.

Rail stages and brackets are conservative collision solids. Cable routing includes these solids, including on the cable's own device. Rails cannot silently pass through other modelled devices/accessories. Placement checks cover the chassis's swept volume between seated and extended positions, rail side clearance, profile height, stage overlap and changes of post planes across the occupied U range. Intended member/stud attachment overlap and bracket/post contact are treated separately from unrelated collisions. Channels use closed bounding envelopes for collision, so routing through their internal clearances is conservative.

Connected ports follow the chassis, while fixed rack hardware stays put. The current pose recalculates required cable routes and schedule lengths. **A supplied assembly length is never increased automatically**: the browser test keeps a 300 mm cable at 300 mm and reports insufficient length at the service pose. A rendered route describes the required path, not physically accommodated supplied slack. Continuous tension, snagging, disconnect forces, cable-chain supports and installed slack physics remain future work. The checkbox changes pose immediately; it is not a completed installation/removal animation state machine.

**Installed depth envelope (fixed 27 October 2026).** A sliding rail record used to switch off the exterior depth-envelope check on its own mounting face, even when the chassis was seated at 0 mm extension, so a rear-mounted unit with a 40 mm bezel passed where the rack allows only 30 mm behind the rear rails. Placement now checks the seated pose (extension 0) against the envelope on both faces for every device. Only the extended service pose may carry the chassis out of the rack, which is the intended 500 mm projection described above. Fixed support rails never skip the check. Regression tests are in `device-rails.test.ts` and `support-rails.test.ts`.

Import [pc-sliding-rails.rack.json](../examples/pc-sliding-rails.rack.json) for the extended reference. Actual application captures: [seated](screenshots/device-rails-closed.png), [service position](screenshots/device-rails-extended.png). Validation is recorded in [numeric/build checks](validation/latest-checks.txt), [browser results](validation/device-rails-browser-results.txt) and [portable example integrity](validation/example-integrity.txt).

## Fixed support rails (L-section, non-sliding)

Some equipment ships with plain fixed rails instead of a sliding kit. The user's APC SMT3000RMI2U UPS is an example: one L-section rail per side sits just behind the rack screw holes, screwed to the front and rear rack rails; the UPS rests on the horizontal flange, small tabs on its rear slot into the rear of each rail, and it is screwed in at the front through its ears. Nothing slides or extends. These rails belong to the equipment model (the definition), so a library file carries them, unlike the sliding rails above, which are fitted per placement.

**Schema.** An optional `supportRails` record on the definition:

| Field | Meaning |
| --- | --- |
| `kind` | `"fixed-l"`, the only kind so far |
| `spanMinMm`, `spanMaxMm` | Compatible front-to-rear rack screw-plane spacing (`rearRailZMm − frontRailZMm`), mm. Either may be `null` (unknown) |
| `legHeightMm` | Overall height of the vertical leg, measured from the underside of the flange |
| `flangeWidthMm` | Overall width of the horizontal flange, measured from the outer face of the vertical leg |
| `thicknessMm` | Sheet thickness of both legs |
| `loadRatingKg` | Rated load of the pair, kg, or `null` (unknown, never zero) |
| `evidence`, `source` | Status and notes for the rail data, independent of the definition's own evidence |

A definition with `supportRails` must use `mounting: "rails"`, a chassis box (`bodyMode: "box"`, no plate, shelf or lacing bar), and leave `railMinMm`/`railMaxMm` empty, because the spacing range now belongs to the rails. Flange width and leg height must both exceed the thickness. The schema rejects anything else. Definitions without the field are unchanged; `mounting: "rails"` without `supportRails` still needs `railMinMm`/`railMaxMm`.

**Geometry.** In device-local millimetres (x outward from the chassis side, z inward from the mounting face), each rail is:

- a vertical leg at x `w/2` to `w/2 + t`, tangent to the chassis side;
- a flange at x `w/2 + t − flange` to `w/2`, under the chassis, with its top at the chassis bottom;
- both running in z between the inner faces of the front and rear posts (`postThickness` to `spacing − postThickness`);
- two end tabs, thickness `t` and the leg's height, bearing on the inside face of each post and reaching the post's outer edge (`railCentersMm/2 + railWidth/2`), where the screws pass. The tab outline is illustrative; the real tab shape is unknown.

The rails mirror with the chassis for rear mounting (x → −x, z → the opposite post), so the near tab is always at the mounting-face post. They are ordinary solids (`support-rail:<device>:<left|right>:<leg|flange|near-tab|far-tab>`). They render in the scene, take part in placement collisions and act as cable-routing obstacles, like other parts. The device's own chassis touches its rails (tangent contact) without penetrating them.

**Bearing height.** The ears decide the chassis height; the rails do not raise it. The chassis keeps its existing position, centred in its allocated U range, so the ear screw holes (`screwOffsetsMm`, measured from the allocated U bottom) stay on the rack holes. The flange top is at the chassis bottom, and the flange thickness is taken up in the space under the chassis. For the 86 mm UPS in 2U (88.9 mm), that space is (88.9 − 86) / 2 = 1.45 mm. A flange up to 1.45 mm thick stays inside the allocation. A thicker flange extends below the allocated U boundary into the U below. The Inspector reports by how much, and the solid collides with any equipment there. At U1 it is reported as leaving the rack U volume. See `DECISIONS.md`.

**Placement checks.** These are failures that reject an edit:

- spacing outside a known `spanMinMm`/`spanMaxMm` bound;
- rails spanning a change of front or rear post plane;
- chassis plus two rail thicknesses wider than the clear opening;
- rail solids outside the rack U volume;
- equipment `massKg` above a known `loadRatingKg`;
- solid collisions;
- a sliding rail record on the same device (the two kinds are exclusive).

Unknown data is not a failure. A missing span bound marks the fit unverified (or partly verified). A missing rating or mass leaves the load unknown. The Inspector's Rails section shows the rail profile, spacing, load status (with the mass as a percentage of a known rating), the bearing level and these advisories. `node scripts/validate-library.mjs` prints the same assessment for library files.

**Editing.** In the library's definition editor (Dimensions & mounting), rails mounting shows **Fixed L-section support rails supplied with the unit**. Turning it on moves any rail spacing range into the rails and fills labelled example profile values (25 mm leg, 20 mm flange, 1.2 mm thickness, evidence `example`). These are starting values to replace, not measurements. Changing a dimension marks the rail data user-entered unless a status is chosen. Turning it off moves the range back to the definition. Save validates and commits the whole definition as one undoable edit, so a rating below the mass or a range that excludes a placed instance's rack spacing is refused with the reason.

**Not modelled.** The UPS's rear tabs and the slots they engage, rail screws, cage nuts, the real tab and bracket outline, any front-to-rear length adjustment mechanism (the rail is drawn as one continuous piece at the current spacing), rail deflection and material strength. A load rating is compared with the definition's mass only; it does not certify the installation. Numeric coverage is in `src/engineering/support-rails.test.ts`.
