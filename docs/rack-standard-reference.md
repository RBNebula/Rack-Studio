# 19-inch mounting interface and configurable construction

Reviewed on 22 October 2026. This is an engineering reference for the application's nominal mounting grid. It does not establish complete IEC/EIA compliance, manufacturing tolerances, structural capacity or vehicle installation approval. Only primary sources are used below; manufacturer drawings describe their own products and do not replace the complete standard.

## Applicable interface

IEC identifies **IEC 60297-3-100:2008** as the basic-dimension standard for front panels, subracks, chassis, racks and cabinets in the **482.6 mm (19 in)** series. Its public catalogue page establishes that scope; it does not expose all normative dimensions or tolerance clauses. [IEC official publication record](https://webstore.iec.ch/en/publication/1283).

| Model value | Nominal reference and interpretation | Primary evidence |
| --- | --- | --- |
| Face width | **482.6 mm** across a nominal 19-inch mounting face, including the mounting flanges. This is distinct from chassis width, clear opening and exterior frame width. | [Panduit WMPF1E customer drawing V10101AB-DC, revision 10A, 23 March 2023](https://www.panduit.com/content/dam/panduit/en/products/media/1/51/451/8451/110788451.pdf), dimensioned 482.6 mm face. |
| Horizontal hole-column spacing | **465.1 mm** centre to centre in the application's nominal metric grid. This is distinct from the 482.6 mm face width. | The same [Panduit engineering drawing](https://www.panduit.com/content/dam/panduit/en/products/media/1/51/451/8451/110788451.pdf) dimensions the mounting centres at 465.1 mm; [CyberPower's manufacturer reference](https://www.cyberpowersystems.com/faqs/what-is-the-standard-rack-horizontal-hole-spacing/) identifies that value with EIA-310. |
| U allocation | **44.45 mm per U**. This is the pitch of allocated rack space, not proof that a real panel's physical height equals its full allocation. | [Hammond Engineering Resource Hub, “What is a Rack Unit?”](https://www.hammfg.com/dci/faq). |
| Vertical hole pitch | Repeating **15.875, 15.875, 12.7 mm**, converted from **5/8, 5/8, 1/2 inch**. The sum is 44.45 mm. | [nVent HOFFMAN Spec-00021, page 1](https://www.nvent.com/sites/default/files/acquiadam_assets/2021-02/Spec-00021.pdf) specifies this universal EIA pattern. |

The application centres the three-hole group within each U, placing nominal centres at **6.35, 22.225 and 38.1 mm above the U's bottom boundary**. These offsets are a stated datum construction from the published pitch: half of the 12.7 mm inter-group gap at each U boundary. For U numbered from one at the bottom, `holeY = (U - 1) × 44.45 + offset`. This arithmetic is an implementation derivation, not an additional quoted standard clause.

The 465.1 mm value is a published nominal metric value; converting the full imperial fraction 18 5/16 in gives 465.1375 mm. The model should use its declared nominal metric interface consistently and must not present the rounding difference as a tolerance.

## Dimensions the interface does not determine

Exterior rack width, enclosure depth, front/rear rail spacing, rail setback, member section, ear thickness and shelf depth require independent construction data. For example, nVent lists a 19-inch rack whose exterior width is 514 mm, illustrating why “19 inch” is not an exterior-width setting. Its shelf-depth drawings also show multiple shelf arrangements. Those product dimensions are examples, not defaults for this user's rack. [nVent HOFFMAN Spec-00021, pages 1–2](https://www.nvent.com/sites/default/files/acquiadam_assets/2021-02/Spec-00021.pdf).

Cisco separately specifies front-to-rear rail distance, chassis depth and rear clearance for its UCS equipment; it even describes a chassis projecting beyond a rear mounting plane. This supports keeping mounting planes separate from physical enclosure boundaries. Its product-specific limits must not be applied to the generic rack or Cisco C1300 switch. [Cisco UCS Site Preparation Guide, “Rack Requirements”](https://www.cisco.com/c/en/us/td/docs/unified_computing/ucs/hw/site-prep-guide/ucs_site_prep/ucs_siteprep_chapter_010.html).

Square, round and tapped rails are different mounting interfaces. Square holes require compatible cage nuts and screws; hole type alone does not determine thread, aperture dimensions or hardware compatibility. Square holes remain the user's selected default. [Hammond mounting types and hardware reference](https://www.hammfg.com/dci/faq).

## Provisional test construction

The user's example is **20U**, with **800 mm overall depth at U1–U15** and **750 mm at U16–U20**, inclusive. Treat these as provisional construction values; they are not manufacturer measurements. Front-to-rear mounting-plane spacing is independently editable and cannot be inferred from either depth. An illustrative spacing, if displayed, must be labelled provisional. Additional beams and crossmembers are absent until explicitly configured, with their own positions and dimensions; the 19-inch interface supplies none of them.

Shelves likewise need independent overall depth, usable support region, U allocation and mounting arrangement. Changing rack depth must not stretch a shelf into the full rack depth. Additional supports remain explicit components rather than being inferred from a shelf's name or depth.

## Source-model review and integration recommendations

Review of the source before the configurable-construction update found `U_MM = 44.45`, hole offsets `[6.35, 22.225, 38.1]`, example face width 482.6 mm and example hole-column spacing 465.1 mm consistent with the nominal interface above. Preserve these separately from exterior dimensions.

The existing **0.5 mm screw-offset alignment threshold** is an application check, not a verified standard tolerance. Do not label it IEC/EIA tolerance or reuse it to certify rail, screw or cage-nut fit. Real physical panel height and ear thickness must remain separate from U allocation. Unknown ear thickness may have a clearly labelled preview value, but it cannot become verified data on import or save.

Keep independent records and transforms for exterior sections, mounting rails, shelf bodies/support regions and additional structural members. A shared rendering dimension must not silently couple their geometry. Document the chosen datum for each component, preserve unverified evidence labels through save/load, and check collisions against explicit solids while reporting unmodelled enclosure clearance as unknown.
