# Generic 24-port switch

The **Generic 24-port switch · 1U** is a generic silver rack device based on the layout in the user's supplied switch image. It is not a Ubiquiti product definition.

- Front: 24 individually numbered RJ45 Ethernet sockets in one horizontal row, followed by two separately labelled SFP cages at the right.
- Rear: one IEC C14 AC inlet.
- Thin silver chassis, front fascia with connector apertures, and integral rack ears with mounting slots aligned to the rail hole centres.
- No touchscreen, Etherlighting, reset button or DC backup connector. No PoE capability or port speed has been inferred.

Every socket is a persistent cable endpoint. RJ45 supports the existing Ethernet cabling workflow, the SFP cage connector supports a schematic SFP-to-SFP assembly, and the C14 inlet accepts the existing C13 power connector. Optical transceivers, LC sockets inside modules, module insertion and speed/media compatibility remain separate future modelling work. An empty cage is not itself an LC fibre termination.

## Use it in Rack Studio

Save your project and refresh the application. Search for **Generic 24-port switch**. New projects include it. Existing projects show **Add generic 24-port switch**, which adds this definition without replacing any installed equipment or current cable connections. Place it precisely or drag it into a rack. Both front and rear mounting are supported.

The original temporary **24-port network switch** remains available for existing projects and demo connections, including its old rear-uplink identifier. It is a separate definition. Replacing a connected device requires an explicit port mapping; this update does not silently reassign its cables.

Use **Device Library → Edit** to adjust chassis dimensions, ears, socket coordinates/sizes, names and evidence. **Visual model → Generic equipment / explicit components** switches off the detailed switch appearance if you need a different construction. The detailed shell derives its connector apertures and number labels from the same editable port records. Socket positions do not rescale automatically when the chassis is resized.

For a portable model, import [generic-switch-24.library.json](../examples/generic-switch-24.library.json). For a separate single-device reference scene, import [generic-switch-24.rack.json](../examples/generic-switch-24.rack.json).

## Provisional dimensions and limits

| Field | Initial value | Evidence |
| --- | --- | --- |
| Rack allocation | 1U | Generic chosen configuration |
| Chassis width | 442.4 mm | Provisional, taken from the reference image annotation |
| Ear-plane-to-rear depth | 325 mm | Provisional: photo annotation does not establish that datum |
| Physical height | 43.7 mm | Provisional, reference image annotation |
| Overall ear width | 482.6 mm | Generic 19-inch interface |
| Ear thickness | 2 mm | Provisional preview |
| RJ45 pitch / socket size | 15 mm / 14 × 12.5 mm | Provisional layout |
| SFP cage opening | 14 × 9.5 mm | Provisional schematic |
| Rear inlet opening | 28 × 20 mm | Provisional schematic |

No measured manufacturing drawing, mass, load rating or rail-kit compatibility is supplied. Collision uses conservative chassis and ear envelopes; the visible socket/ear openings do not certify a connector shell or screw fit. SFP ports have no assumed module, speed or optical characteristics. SFP also appears as a connector palette option in the Device Model Designer; it is distinct from an LC connector.

## Validation

The current build passes 288 unit/integration tests in 21 files and 25 Edge browser workflows. Unit tests cover the 27 endpoints, single-row order/separation, bounds, mounting-slot alignment, front/rear ear contact, socket transforms, power routing and persistence. The native browser workflow adds the model to an existing project without changing its current records, places two switches, clicks SFP ports to connect them, connects Ethernet and AC power, edits a port name and saves/reopens the project.

Actual viewport captures: [front](screenshots/generic-switch-front.png), [rear](screenshots/generic-switch-rear.png). See [quality checks](validation/latest-checks.txt) and [browser results](validation/generic-switch-browser-results.txt).
