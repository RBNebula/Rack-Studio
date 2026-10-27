# User PC photo reference

Recorded 23 October 2026 from the eleven photographs and dimensions supplied by the user. This is a model of the photographed PC, without an inferred manufacturer or chassis model number.

**Subsequent annotated-photo update:** the user explicitly identifies the upper video socket as DisplayPort and the lower as HDMI, five rear USB sockets as USB 2.0 and the blue middle upper socket as USB 3.0, plus 1G Ethernet/RJ45. The current bundled model records these labels. Earlier identity uncertainty in the photo analysis below is superseded by this annotation. Port positions and exact physical height still require measurement. Existing project definitions are retained unchanged; import the updated reference library if needed.

## Using the PC model

New projects include **User rack PC · 1U** in the equipment library. Select it and place an instance on the front or rear of the rack.

For an existing project, open **Equipment → Device Library → Import library**, choose [user-rack-pc.library.json](../examples/user-rack-pc.library.json), then place the imported PC. To inspect the standalone example, use the toolbar's **Import** with [user-rack-pc.rack.json](../examples/user-rack-pc.rack.json). **Open** lists projects already saved in this browser.

The exact physical height is still to follow. The current model uses 43 mm for its confirmed 1U allocation. After actual measurements arrive, adjust both the chassis dimensions and the affected editable port coordinates. Changing a dimension does not automatically rescale port centres or fitting positions; the normalised observations below are calibration references. Front USB centres currently use the provisional front-fascia plane at Z = −2 mm, so review their Z coordinates if ear/fascia thickness is calibrated.

The definition's **Visual model** selector switches between the photographed enclosure and generic equipment rendering. Selecting parts-only or a different mounting construction automatically uses generic rendering so the visible body follows the configured collision solids. Select generic rendering when using uploaded face images. Socket positions and fitting boxes remain explicit editable data.

## Dimensions and evidence

| Parameter | Value | Evidence |
| --- | --- | --- |
| Rack allocation | 1U | User confirmed |
| Chassis depth, mounting-ear plane to rear face | 381 mm (15 inches) | User measurement and the established depth convention |
| Chassis width, excluding ears | 431.8 mm (17 inches) | User measurement |
| Overall ear width | 482.6 mm (19 inches) | User measurement |
| Physical chassis height | 43 mm | Provisional drawing value; exact measured height to follow |
| Ear thickness, handle projection, side-stud projection and connector recess | Unmeasured | Appearance may be approximated, but these values are not calibrated |

1U describes the allocated rack height, not a measured 44.45 mm chassis height. The measured width and depth do not establish manufacturing tolerances or a load/support rating. The 15-inch depth excludes any unmeasured outward handle projection. The photos show side studs and front rack ears; they do not establish a compatible rail kit or prove that ear-only support is sufficient.

## Visible connections

Front, from photograph `IMG_9051.JPG`: two horizontally oriented USB-A receptacles, stacked vertically just left of the front-panel status/control cluster when looking directly at the PC. Their blue inserts are retained as appearance. A USB protocol version or speed is not inferred from colour.

Rear, looking directly at the rear of the PC, left to right:

1. One IEC C14-shaped power inlet, then the PSU fan.
2. Two stacked USB-A receptacles above one PS/2-shaped circular socket.
3. Two stacked video sockets. The lower socket has an HDMI-shaped opening; the upper socket's exact type remains unconfirmed from these photographs.
4. One VGA-shaped 15-pin socket with side fixing posts.
5. Two stacked USB-A receptacles.
6. One RJ45-shaped socket above two more stacked USB-A receptacles.
7. Three round 3.5 mm jack openings, blue, green and pink from top to bottom.
8. Ventilated expansion-slot blanks on the right, with no installed connector visible.

The model therefore has **17 connectable endpoints: two front and fifteen rear**. Six USB-A sockets are visible on the rear. Buttons, indicator lamps, ventilation holes, the fan, ear slots, studs and expansion covers are not cable endpoints. Jack functions, Ethernet rate, USB speed, PSU rating and the upper video connector identity remain unverified. Connector names describe visible shapes rather than electrically tested capabilities.

## Photo-plane mapping

The port positions in [user-pc-port-map.json](user-pc-port-map.json) are manually digitized photo estimates. The original local images were viewed before selecting the points. The file keeps the original 5712 × 3213 image coordinate equivalents as well as a 2048 × 1152 working coordinate system; the scale factor is 5712 / 2048 = 2.7890625 on both axes. No image edits or generated replacement photography were used.

The body face, excluding ears, was mapped to a unit rectangle using a planar projective transform. Coordinates are ordered top-left, top-right, bottom-right, bottom-left:

| Photograph | Face quadrilateral at 2048 × 1152 |
| --- | --- |
| Front `IMG_9051.JPG` | (315, 471), (1778, 492), (1767, 630), (321, 614) |
| Rear `IMG_9058.JPG` | (207, 449), (1896, 442), (1878, 594), (215, 612) |

The independent oblique rear photograph `IMG_9057.JPG` was checked for connector order and identification. `IMG_9052.JPG` through `IMG_9056.JPG` show the silver chassis, black front, projecting handles, ears and side studs. `IMG_9059.JPG`, `IMG_9060.JPG` and `IMG_9061.JPG` support the user's dimensional observations; their perspective does not provide an independent exact height measurement.

For a rectified centre `(u, v)`, with `u` increasing to the right in the photograph and `v` downwards, local coordinates in millimetres are:

```text
front x = (0.5 - u) × 431.8
rear  x = (u - 0.5) × 431.8
y = (1 - v) × 43
```

Local +X appears to the viewer's left when facing the front; the rear therefore uses the opposite horizontal sign. Y is measured upwards from the chassis bottom. Front and rear have outward normals `(0, 0, -1)` and `(0, 0, 1)` respectively in the device's canonical front-mounted coordinates. The rear face is at local Z = 381 mm. The front connector face must follow the model's front-fascia plane; a small ear/fascia thickness is a provisional model parameter rather than a newly measured recess. Rotating the whole device for rear installation must rotate both the ports and their directions together.

| Port ID | Visible connector | X mm | Y mm |
| --- | --- | ---: | ---: |
| front-usb-top | USB-A | 20.2 | 32.9 |
| front-usb-bottom | USB-A | 20.1 | 24.4 |
| rear-power | C14-shaped inlet | -185.7 | 17.3 |
| rear-usb-left-top | USB-A | -87.9 | 32.8 |
| rear-usb-left-bottom | USB-A | -87.7 | 25.9 |
| rear-ps2 | PS/2-shaped socket | -87.1 | 15.1 |
| rear-video-top | Video socket, type unconfirmed | -69.1 | 21.4 |
| rear-video-bottom | HDMI-shaped socket | -69.0 | 11.4 |
| rear-vga | VGA-shaped socket | -41.6 | 14.4 |
| rear-usb-middle-top | USB-A | -13.8 | 20.7 |
| rear-usb-middle-bottom | USB-A | -13.5 | 11.4 |
| rear-rj45 | RJ45-shaped socket | 10.2 | 32.0 |
| rear-usb-lan-top | USB-A | 11.0 | 19.4 |
| rear-usb-lan-bottom | USB-A | 11.6 | 10.3 |
| rear-audio-blue | 3.5 mm jack | 44.7 | 36.7 |
| rear-audio-green | 3.5 mm jack | 45.4 | 25.2 |
| rear-audio-pink | 3.5 mm jack | 45.9 | 14.1 |

Rounding to 0.1 mm preserves repeatable model inputs; it does not imply that accuracy. Manual edge/centre selection, perspective, lens distortion, shallow recesses and the unmeasured physical height affect the result. Several millimetres of planning uncertainty should be expected, without a validated error bound. In particular, the Y values scale with the provisional 43 mm height; the normalised `(u, v)` values retain the observation so they can be recalibrated after the exact height is supplied. All photo-derived centre positions remain editable and unverified.

## Review targets

Actual application captures: [front](screenshots/user-pc-front.png), [rear](screenshots/user-pc-rear.png), and [oblique](screenshots/user-pc-oblique.png). These are browser renders of the model; the original user photographs remain the dimensional/visual reference.

Review a front view and an independently oriented rear view against the photographs. Confirm the two front USB endpoints, all six rear USB endpoints, rear left-to-right connector groups, opposite horizontal sign, front/rear normals and the body's 381 mm depth. The black face, silver enclosure, two handles, ventilation fields, right-side rear expansion blanks and PS/2/audio insert colours provide visual cues. Generic decorative geometry must not be mistaken for measured projections or a manufacturer-certified rail/support model.

Save/reload should preserve the device definition, stable port IDs and any connected cable endpoints. A cable connected to the rear power or network socket must start on the rear, while a front USB cable must start on the front. Rendering success and route tests do not establish the mechanical or electrical characteristics that remain unmeasured.
