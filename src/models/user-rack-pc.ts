import { definitionSchema, type DeviceDefinition, type Port, type PhysicalBox } from '../model';

const photoSource =
  'Photo-derived estimate from user IMG_9051.JPG / IMG_9058.JPG, rectified to 431.8 mm width and provisional 43 mm height. XY centres and socket sizes are editable, unmeasured; see docs/user-pc-port-map.json. Rear connector identities and protocol labels follow the subsequent user-annotated rear photo. Front USB speed remains unconfirmed.';

function socket(
  id: string,
  name: string,
  connector: string,
  x: number,
  y: number,
  widthMm: number,
  heightMm: number,
  visualColor = '#171b20',
): Port {
  const front = id.startsWith('front-');
  return {
    id,
    name,
    connector,
    surface: front ? 'front' : 'rear',
    position: [x, y, front ? -2 : 381],
    direction: [0, 0, front ? -1 : 1],
    multiple: false,
    widthMm,
    heightMm,
    visualColor,
    evidence: 'example',
    source: photoSource,
  };
}

/** The photographed PC, with user-measured width/depth and editable photo estimates.
 * Local origin: ear/rail contact plane, centred in X, chassis bottom in Y.
 * +X appears left when looking at the front. No manufacturer/model is inferred. */
export function createUserRackPc(): DeviceDefinition {
  const annotations: Record<string, Partial<Port>> = Object.fromEntries([
    ...[
      'rear-usb-left-top',
      'rear-usb-left-bottom',
      'rear-usb-middle-bottom',
      'rear-usb-lan-top',
      'rear-usb-lan-bottom',
    ].map((id) => [id, { protocol: 'USB 2.0', name: `${id} · USB 2.0` }]),
    ['rear-usb-middle-top', { protocol: 'USB 3.0', name: 'Rear USB 3.0' }],
    ['rear-rj45', { protocol: '1G Ethernet', name: 'Rear 1G Ethernet · RJ45' }],
  ]);
  const parts: PhysicalBox[] = [];
  for (const [side, sign] of [
    ['left', -1],
    ['right', 1],
  ] as const) {
    parts.push({
      id: `handle-${side}`,
      name: `${side} handle · provisional envelope`,
      position: [sign * 231, 21.5, -12],
      size: [12, 32, 24],
    });
    for (const [index, z] of [55, 143, 231, 319].entries())
      parts.push({
        id: `side-stud-${side}-${index + 1}`,
        name: `${side} side stud ${index + 1} · provisional envelope`,
        position: [sign * 218.5, 21.5, z],
        size: [5.2, 8, 8],
      });
  }
  return definitionSchema.parse({
    id: 'def-user-rack-pc',
    name: 'User rack PC · 1U',
    manufacturer: '',
    model: '',
    category: 'Computers',
    widthMm: 431.8,
    heightU: 1,
    heightMm: 43,
    depthMm: 381,
    faceWidthMm: 482.6,
    earThicknessMm: null,
    shelf: null,
    plate: null,
    appearance: 'user-rack-pc',
    mounting: 'direct',
    bodyMode: 'box',
    color: '#a5acb1',
    evidence: 'user-entered',
    source:
      'User-measured: 15 in / 381 mm from mounting-ear contact plane to rear fascia; chassis 17 in / 431.8 mm wide, 19 in / 482.6 mm across ears. User-confirmed 1U; physical height 43 mm is PROVISIONAL, exact height to follow. Ports are editable photo-plane estimates from IMG_9051.JPG / IMG_9058.JPG, with rear checked against IMG_9057.JPG. Ear thickness unknown (2 mm preview), ear holes, socket sizes/recess, handles and side-stud envelopes are provisional. Manufacturer/model, mass, support/rail kit and load rating unknown. Direct mounting describes the ear datum, not a support certification. User annotated rear photo confirms DisplayPort above HDMI, five USB 2.0 ports, one USB 3.0 port and 1G Ethernet. Port centres remain photo estimates. See docs/user-pc-reference.md.',
    massKg: null,
    railMinMm: null,
    railMaxMm: null,
    screwOffsetsMm: [6.35, 38.1],
    ports: [
      socket('front-usb-top', 'Front USB-A · upper', 'USB-A', 20.2, 32.9, 12, 4.5, '#2364ba'),
      socket('front-usb-bottom', 'Front USB-A · lower', 'USB-A', 20.1, 24.4, 12, 4.5, '#2364ba'),
      socket('rear-power', 'Rear power · C14 inlet', 'IEC-C14', -185.7, 17.3, 23, 29),
      socket('rear-usb-left-top', 'Rear USB-A · left upper', 'USB-A', -87.9, 32.8, 12, 4.5),
      socket('rear-usb-left-bottom', 'Rear USB-A · left lower', 'USB-A', -87.7, 25.9, 12, 4.5),
      socket('rear-ps2', 'Rear PS/2', 'PS/2', -87.1, 15.1, 9, 9, '#709e78'),
      socket('rear-video-top', 'Rear DisplayPort', 'DisplayPort', -69.1, 21.4, 14, 5),
      socket('rear-video-bottom', 'Rear video · lower, HDMI-shaped', 'HDMI', -69, 11.4, 14, 5),
      socket('rear-vga', 'Rear VGA', 'VGA', -41.6, 14.4, 18, 8, '#303f56'),
      socket(
        'rear-usb-middle-top',
        'Rear USB-A · middle upper',
        'USB-A',
        -13.8,
        20.7,
        12,
        4.5,
        '#2364ba',
      ),
      socket('rear-usb-middle-bottom', 'Rear USB-A · middle lower', 'USB-A', -13.5, 11.4, 12, 4.5),
      socket('rear-rj45', 'Rear 1G Ethernet · RJ45', 'RJ45', 10.2, 32, 14, 12),
      socket('rear-usb-lan-top', 'Rear USB-A · below LAN upper', 'USB-A', 11, 19.4, 12, 4.5),
      socket('rear-usb-lan-bottom', 'Rear USB-A · below LAN lower', 'USB-A', 11.6, 10.3, 12, 4.5),
      socket('rear-audio-blue', 'Rear audio · blue jack', '3.5mm', 44.7, 36.7, 7, 7, '#52a9d3'),
      socket('rear-audio-green', 'Rear audio · green jack', '3.5mm', 45.4, 25.2, 7, 7, '#a1c76c'),
      socket('rear-audio-pink', 'Rear audio · pink jack', '3.5mm', 45.9, 14.1, 7, 7, '#db678f'),
    ].map((p) => ({ ...p, ...annotations[p.id] })),
    parts,
    frontImage: null,
    rearImage: null,
  });
}
