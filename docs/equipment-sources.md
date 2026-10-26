# Equipment source register

Reviewed on 22 October 2026. Dimensions below are published catalogue values, not measurements of the user's units. A verified catalogue value does not verify an ear-plane offset, port coordinate, mounting-hole layout, rail-kit compatibility, or complete 3D model.

The user defines rack depth as **front screw plane to rear screw plane**, and device depth as **mounting-ear screw plane to rear fascia**. The reviewed catalogue depths do not explicitly establish that second datum. Keep the published depth in the source notes; any value copied into the model's ear-to-rear field must remain a visible provisional assumption until a drawing or measurement confirms it.

## Cisco Catalyst C1300-48P-4G

Primary sources: [Cisco product data sheet](https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-1300-series-switches/nb-06-cat1300-ser-data-sheet-cte-en.html), [Cisco installation guidance](https://www.cisco.com/c/en/us/td/docs/switches/campus-lan-switches-access/Catalyst-1200-and-1300-Switches/Administration-Guide/catalyst-1300-admin-guide/get-to-know-your-switch.html).

| Field | Published fact or outstanding measurement |
| --- | --- |
| Unit size, W × D × H | 444.3 × 350 × 43.94 mm |
| Rack allocation | 1U; the installation guide specifies one 44.45 mm RU |
| Unit mass | 5.43 kg |
| Data connectors | 48 RJ45 10/100/1000 Ethernet ports and four Gigabit SFP slots |
| Console interfaces | RJ45 console and USB Type C, described in the series specification |
| Mounting | Rack mountable; Cisco lists RCKMNT-1RU-1K= for the 24/48-port models and says these models include 19-inch brackets |
| Ear-to-rear fascia depth | **Unknown**: 350 mm is labelled unit depth, without the user's required datum |
| Ear/faceplate width | **Unknown**: 444.3 mm is unit width; a 19-inch bracket kit does not establish a measured complete face width |
| Exact connector coordinates and protrusions | **Unknown** |
| Screw offsets, rack-hole hardware compatibility | **Unknown** for this particular assembly |

The installation guide describes different bracket configurations with different front-panel offsets. Do not infer that the ear plane is flush to the front fascia for this exact model from a general series illustration.

## APC Smart-UPS SMT3000RMI2UC

Primary sources: [Schneider Electric product page](https://www.se.com/uk/en/product/SMT3000RMI2UC/apc-smartups-line-interactive-3kva-rackmount-2u-230v-8x-iec-c13%2B1x-iec-c19-outlets-smartconnect-port%2Bsmartslot-avr-lcd/), [Schneider Electric SmartConnect brochure, final page](https://ckm-content.se.com/ckmContent/sfc/servlet.shepherd/document/download/0691H00000FWcBtQAL), [current official manual record](https://www.se.com/us/en/download/document/SPD_SU-UM-JPS29634_EN/).

| Field | Published fact or outstanding measurement |
| --- | --- |
| Rack allocation | 2U |
| Manufacturer brochure maximum W × D × H | 480 × 683 × 86.1 mm; the reviewed brochure is copyright 2018 |
| Net mass | 44.28 kg in that brochure |
| Power connections | Eight IEC C13 outputs, one IEC C19 output; the brochure lists IEC C20 input for this model group |
| Management | SmartConnect Ethernet, serial RJ45, USB and one SmartSlot; exact physical locations and USB connector shape are not established here |
| Chassis width excluding ears | **Unknown in the reviewed official-domain material**; do not enter the 480 mm maximum width as chassis width inside a 450 mm opening |
| Exact face/ear width | The 480 mm maximum width is published, but its component/datum breakdown is **unconfirmed** |
| Ear-to-rear fascia depth | **Unknown**: 683 mm is maximum unit depth, without a dimensioned ear-plane datum |
| Exact connector coordinates, plug projection and cable clearance | **Unknown** |
| Included rail-kit adjustment range, minimum rail spacing and exact hardware | **Unknown** for the installed kit |

Catalogue copies elsewhere show both 432 mm and 480 mm widths and heights rounded to 86 mm. These cannot be silently treated as the same dimensional field. Obtain a dimensioned chassis/ear drawing or measure the installed unit before marking its complete geometry verified. The current manual record identifies document SPD_SU-UM-JPS29634_EN, released 1 February 2026; its listing alone does not establish dimensions.

Schneider's [four-post rail-kit FAQ](https://www.se.com/ca/en/faqs/FAQ000268228/) covers several named kits and requires checking which kit fits the Smart-UPS model. Its generic maximum extension must not be copied into this UPS's railMinMm/railMaxMm without identifying the actual kit.

## APC AP7922B switched PDU

Primary sources: [Schneider Electric's own product marketplace](https://shop.se.com/pro/ca/en/product/rack-pdu-switched-2u-32a-230v-16-c13/), [official product identity page](https://www.se.com/nl/nl/product/AP7922B/rack-pdu-geschakeld-2u-32a-230v-16c13/).

| Field | Published fact or outstanding measurement |
| --- | --- |
| Rack allocation | 2U, horizontal rack mounting |
| Published W × D × H | 445 × 114 × 89 mm; the same listing gives 17.5 × 4.5 × 3.5 inches |
| Mass | 4.5 kg, rounded in the listing |
| Output connectors | Sixteen IEC 60320 C13 outlets |
| Input | IEC 60309 32 A, 2P + E; 230 V output, 32 A maximum |
| Ear-to-rear fascia depth | User-measured 26 October 2026: about 195 mm with the ears forward of the body (outlets facing the rack front, outlet face recessed about 81 mm); about 114 mm with the unit turned so the outlets face into the rack and the body sits flush to the ears |
| Width excluding / including mounting ears | User-measured: body 445 mm (114 mm deep, 2U); about 449 mm with the mounting brackets fitted, interpreted as the width across the bracket side plates (awaiting confirmation). Ear-flange tip-to-tip width is not measured |
| Connector positions, management connector details, attached lead entry and projections | Banks printed on the unit: B1 = outlets 1–8 (top row), B2 = 9–16 (bottom row), 16 A per bank, 10 A per outlet, 220–240 V. The hardwired input cord enters on the outlet face at its left end (user observation). Connector centres, the cord exit position and projections remain **unknown** |
| Exact screw offsets and rack-hole compatibility | **Unknown** |

The listed 89 mm height is rounded: nominal 2U is 88.9 mm. Do not interpret the 0.1 mm catalogue-rounding difference as a proven mechanical overheight or silently claim a precision physical height of 88.9 mm.

## Connectix / CableMonkey 24-port Cat6a FTP CCS 20/20 right-angled panel

Source: [the exact CableMonkey product supplied by the user](https://www.cablemonkey.co.uk/cat6a-patch-panels/9164-24-port-cat6a-ftp-shielded-ccs-2020-right-angled-patch-panel-5056045700394.html). This is the requested retailer's specification, not an independently reviewed mechanical drawing.

| Field | Published fact or outstanding measurement |
| --- | --- |
| Product reference | 009-002-001-40 |
| EAN | 5056045700394 |
| Rack allocation | 1U |
| Published W × D × H | 483 × 98 × 44.5 mm |
| Connections | 24 shielded Cat6a RJ45 jacks, right-angled IDC punchdown termination at the rear |
| Construction | Steel panel, rear termination tray and earth connection |
| Ear-to-rear fascia depth | **Unknown**: 98 mm has no explicitly dimensioned ear-plane datum |
| Chassis/tray width excluding ears | **Unknown**; do not use the 483 mm full panel width as the chassis width |
| Exact RJ45/IDC coordinates, port direction, mounting-hole offsets | **Unknown** |

The retailer rounds 1U to 44.5 mm; the application U grid remains exactly 44.45 mm. A fitted envelope requires a real drawing or measurement. A right-angled IDC termination is not sufficient evidence for a 3D connector direction or a hole coordinate.

## Library and validation implications

The user's photographed PC is separately modelled with their own measurements and photo provenance, without inferring a manufacturer/model: [PC reference and 17-port map](user-pc-reference.md). Its 1U allocation is confirmed; exact physical height and port calibration remain outstanding.

- Add the named products with their source links and verified catalogue facts. Leave port arrays empty until measured coordinates are entered, or explicitly label manually added coordinates as user supplied. A known connector count is not a measured port layout.
- If the current schema requires numeric chassis width, ear width and ear-to-rear depth where the source does not supply them, provisional modelling values must be distinguished from the facts above. The entire definition cannot be described as a fully verified mechanical model.
- Start 1U, 2U, 3U and 4U blank plates plus a 1U brush plate as configurable **example** definitions. Nominal 19-inch width and the U grid can guide their example envelopes; plate thickness, brush aperture, screw positions and vendor-specific dimensions remain configurable assumptions. A solid brush-envelope box must not be claimed as a measured cable opening.
- Changing device depth changes its rear fascia while its mounting-ear plane remains fixed. Rear mounting reverses the inward chassis direction and mirrors x. U1 begins at the bottom. Keep a single constant-depth rail section unless the user adds a step.
- Treat rail spacing and exterior enclosure clearance as different data. The rear rail is an attachment plane, not a rear wall. A device extending behind it can be geometrically possible when sufficient surveyed enclosure space exists; this is an inference from those separate dimensions, not approval of a particular installation. Cisco's [site preparation guide](https://www.cisco.com/c/en/us/td/docs/unified_computing/ucs/hw/site-prep-guide/ucs_site_prep/ucs_siteprep_chapter_010.html) separately specifies front/rear rail spacing, chassis depth and rear clearance.
- With only the user's rail-spacing depth known, continue checking supplied solid obstacles and explicit rail compatibility, but report rear enclosure fit as unknown. Do not synthesize a rear wall from the rail spacing. Apply an exterior-depth boundary check only when an exterior envelope is independently supplied and its datum is clear.
- These sources do not supply exact rail/ear-hole compatibility, structural load capacity, vehicle mounting approval, cable dynamics or installation certification. No such values were inferred for the library.

## Generic 24-port switch · 24 October 2026

The user supplied a switch photograph as a layout reference and requested a generic model, excluding Etherlighting, touchscreen and DC backup. The new model has24frontRJ45,2frontSFPcages and1rearIECC14inlet. Image annotations442.4mmwidth/325mmdepth/43.7mmheight are provisional values for this generic model; no product identity, speed/PoE capability or precision ear datum is inferred. It remains separate from Cisco and the existing legacy demo switch. See [dimensions and use](generic-switch.md).
