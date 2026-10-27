/**
 * Test-only copy of the original example project and built-in library, including the equipment
 * retired from the application on 28 October 2026 (see src/data/retired.ts). Unit tests use it as
 * a stable engineering fixture; the application never imports this module.
 */
import type { Cable, DeviceDefinition, Port, Project } from '../model';
import { makeShelfConfiguration } from '../engineering/shelves';
import { makePlateConfiguration } from '../engineering/plates';
import { createUserRackPc } from '../models/user-rack-pc';
import { createGenericSwitch } from '../models/generic-switch';
import { createLacingBar } from '../models/lacing-bar';
const U = 44.45;
const port = (
  id: string,
  name: string,
  x: number,
  y: number,
  z: number,
  surface: Port['surface'] = 'front',
  connector = 'RJ45',
): Port => ({
  id,
  name,
  connector,
  surface,
  position: [x, y, z],
  direction: surface === 'front' ? [0, 0, -1] : [0, 0, 1],
  multiple: false,
});
const networkPorts = (count: number, z = -2, surface: Port['surface'] = 'front') =>
  Array.from({ length: count }, (_, i) =>
    port(`p${i + 1}`, `Port ${i + 1}`, -178 + i * 15.5, 21, z, surface),
  );
const definition = (
  id: string,
  name: string,
  category: string,
  heightU: number,
  depthMm: number,
  extra: Partial<DeviceDefinition> = {},
): DeviceDefinition => ({
  id,
  name,
  manufacturer: 'Generic example',
  model: 'Illustrative geometry',
  category,
  widthMm: 430,
  heightU,
  heightMm: heightU * U - 1.5,
  depthMm,
  faceWidthMm: 482.6,
  earThicknessMm: 2,
  shelf: null,
  plate: null,
  appearance: null,
  mounting: 'direct',
  bodyMode: 'box',
  color: '#344150',
  evidence: 'example',
  source: 'Configurable example; no manufacturer specification supplied.',
  massKg: null,
  railMinMm: null,
  railMaxMm: null,
  screwOffsetsMm: heightU === 1 ? [6.35, 38.1] : [6.35, heightU * U - 6.35],
  ports: [],
  parts: [],
  frontImage: null,
  rearImage: null,
  ...extra,
});
export function exampleDefinitions(): DeviceDefinition[] {
  const definitions = [
    definition('def-switch', '24-port network switch', 'Network switches', 1, 280, {
      ports: [...networkPorts(24), port('uplink', 'Rear uplink', 150, 21, 282, 'rear')],
      color: '#475967',
    }),
    definition('def-patch', '24-port patch panel', 'Patch panels', 1, 90, {
      ports: networkPorts(24),
      color: '#283540',
    }),
    definition('def-server', '2U rack server', 'Servers', 2, 620, {
      mounting: 'rails',
      railMinMm: 600,
      railMaxMm: 740,
      ports: [
        port('net', 'Ethernet', 155, 24, 622, 'rear'),
        port('power', 'IEC power', -145, 24, 622, 'rear', 'IEC-C14'),
      ],
      color: '#64717e',
    }),
    definition('def-shelf', '2U vented shelf', 'Shelves', 2, 450, {
      mounting: 'shelf',
      widthMm: 440,
      heightMm: U * 2,
      parts: [
        { id: 'floor', name: 'Shelf floor', position: [0, 2, 225], size: [440, 4, 450] },
        { id: 'left', name: 'Left bracket', position: [-218, 42, 225], size: [4, 84, 450] },
        { id: 'right', name: 'Right bracket', position: [218, 42, 225], size: [4, 84, 450] },
      ],
      color: '#374552',
    }),
    definition('def-shelf-1', '1U vented shelf', 'Shelves', 1, 450, {
      mounting: 'shelf',
      widthMm: 440,
      heightMm: U,
      parts: [
        { id: 'floor', name: 'Shelf floor', position: [0, 2, 225], size: [440, 4, 450] },
        { id: 'left', name: 'Left bracket', position: [-218, 21.5, 225], size: [4, 43, 450] },
        { id: 'right', name: 'Right bracket', position: [218, 21.5, 225], size: [4, 43, 450] },
      ],
      color: '#374552',
    }),
    definition('def-pc', 'Compact computer', 'Computers', 2, 300, {
      mounting: 'freestanding',
      widthMm: 300,
      heightMm: 60,
      faceWidthMm: 300,
      screwOffsetsMm: [],
      ports: [
        port('net', 'Ethernet', 110, 24, 302, 'rear'),
        port('usb', 'USB-C', 80, 24, 302, 'rear', 'USB-C'),
      ],
      parts: [
        { id: 'lid', name: 'Example overhanging lid', position: [0, 59, 145], size: [320, 4, 310] },
      ],
      color: '#465668',
    }),
    definition('def-pdu', '1U power distribution', 'Power equipment', 1, 45, {
      ports: Array.from({ length: 6 }, (_, i) =>
        port(`iec${i + 1}`, `Outlet ${i + 1}`, -160 + i * 64, 22, -2, 'front', 'IEC-C13'),
      ),
      color: '#222e3b',
    }),
    definition('def-av', 'AVoIP encoder', 'AVoIP equipment', 1, 200, {
      ports: [
        port('net', 'Network', -100, 21, -2),
        port('hdmi', 'HDMI', 50, 21, -2, 'front', 'HDMI'),
      ],
      color: '#315162',
    }),
    definition('def-manager', '1U horizontal manager', 'Cable management', 1, 75, {
      color: '#354350',
    }),
    ...[1, 2, 3, 4].map((u) =>
      definition(`def-blank-${u}`, `${u}U blank plate`, 'Custom equipment', u, 10, {
        plate: makePlateConfiguration('solid'),
        earThicknessMm: 1.5,
        bodyMode: 'parts',
        source:
          'Generic folded solid blank based on user photographs. Nominal 19-inch interface; sheet thickness, return depth and slotted mounting dimensions are provisional examples, not measured from the photos.',
        color: '#252a2d',
      }),
    ),
    ...[1, 2, 3, 4].map((u) =>
      definition(`def-mesh-${u}`, `${u}U mesh blank plate`, 'Custom equipment', u, 10, {
        plate: makePlateConfiguration('perforated'),
        earThicknessMm: 1.5,
        bodyMode: 'parts',
        source:
          'Generic perforated folded blank based on user photographs. Circular perforations and mounting slots are visible geometry; collision checks conservatively treat the sheet as closed. Dimensions are provisional examples.',
        color: '#252a2d',
      }),
    ),
    definition('def-brush', '1U brush plate', 'Cable management', 1, 10, {
      bodyMode: 'parts',
      parts: [
        { id: 'top', name: 'Upper strip', position: [0, 39, 5], size: [430, 7, 10] },
        { id: 'bottom', name: 'Lower strip', position: [0, 4, 5], size: [430, 7, 10] },
        { id: 'left', name: 'Left border', position: [-208, 21.5, 5], size: [14, 28, 10] },
        { id: 'right', name: 'Right border', position: [208, 21.5, 5], size: [14, 28, 10] },
      ],
      source:
        'Generic open brush plate. Border dimensions and 402×28 mm opening are configurable examples, not a manufacturer specification. Flexible bristles are not simulated.',
    }),
  ];
  for (const shelf of definitions.filter((item) => item.mounting === 'shelf')) {
    shelf.shelf = makeShelfConfiguration(shelf);
    shelf.parts = [];
    shelf.source =
      'Provisional generic 19-inch shelf. Overall and usable depth, U height, walls and additional supports are independently configurable; no real shelf or load rating has been verified.';
  }
  return [...definitions, createUserRackPc(), createGenericSwitch(), createLacingBar()];
}
export const baseCable = (id: string): Cable => ({
  id,
  label: id,
  name: id,
  source: { kind: 'device', deviceId: 'pc-1', portId: 'net' },
  destination: { kind: 'device', deviceId: 'switch-1', portId: 'uplink' },
  purpose: '',
  type: 'Cat6A',
  color: '#25c5bc',
  diameterMm: 6,
  minBendRadiusMm: null,
  clearanceMm: 3,
  waypoints: [],
  followCableId: null,
  followStartPercent: 15,
  followEndPercent: 85,
  followOffsetMm: null,
  exitId: null,
  supply: 'preterminated',
  productId: 'cat6a-blue',
  suppliedLengthMm: 2000,
  externalLengthMm: null,
  serviceMm: 0,
  terminationAMm: 60,
  terminationBMm: 60,
  otherMm: 0,
  roundToMm: 10,
  manualOverrideMm: null,
  overrideReason: '',
  status: 'planned',
  notes: '',
});
export function createExampleProject(populated = true): Project {
  const p: Project = {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name: populated ? 'Vehicle communications · example' : 'Untitled rack project',
    revision: 0,
    updatedAt: new Date().toISOString(),
    rack: {
      id: 'rack-1',
      name: 'Communications rack A',
      heightU: 20,
      outerWidthMm: 600,
      clearWidthMm: 450,
      railCentersMm: 465.1,
      frontInsetMm: 50,
      frameMm: 20,
      railWidthMm: 10,
      railThicknessMm: 10,
      frameStyle: 'generic',
      endPanels: { top: true, base: true, thicknessMm: 2 },
      depthMeaning: 'external',
      fixedFace: 'front',
      holeType: 'square',
      evidence: 'example',
      color: '#293543',
      sections: [
        {
          id: 'lower',
          startU: 1,
          endU: 15,
          overallDepthMm: 800,
          frontRailZMm: 0,
          rearRailZMm: 700,
        },
        {
          id: 'upper',
          startU: 16,
          endU: 20,
          overallDepthMm: 750,
          frontRailZMm: 0,
          rearRailZMm: 650,
        },
      ],
      members: [],
      showPanels: false,
    },
    definitions: exampleDefinitions(),
    devices: [],
    cables: [],
    accessories: [],
    looms: [],
    exits: [
      {
        id: 'exit-1',
        name: 'Rear cable exit 1',
        position: [-260, 90, 700],
        size: [65, 65],
        direction: [0, 0, 1],
        evidence: 'example',
      },
    ],
    destinations: [
      {
        id: 'desk-1',
        name: 'User position 1',
        location: 'Operator area',
        notes: 'Logical destination; external distance unknown.',
        ports: [port('network', 'Network port 1', 0, 0, 0)],
        position: null,
      },
      {
        id: 'screen-1',
        name: 'Screen 1',
        location: 'Console',
        notes: 'Logical destination.',
        ports: [port('network', 'Network port', 0, 0, 0)],
        position: null,
      },
    ],
    products: [
      {
        id: 'cat6a-blue',
        name: 'Cat6A blue · example',
        type: 'Cat6A',
        color: 'Blue',
        manufacturer: 'Unspecified',
        partNumber: '',
        reelLengthMm: 305000,
        wastePerCutMm: 0,
      },
    ],
    stock: [],
    settings: {
      reservePercent: 0,
      reserveFixedMm: 0,
      contingencyPercent: 0,
      cablePrefix: 'NET',
      scheduleColumns: [
        'id',
        'source',
        'destination',
        'purpose',
        'type',
        'supply',
        'route',
        'external',
        'terminationA',
        'terminationB',
        'terminationTotal',
        'required',
        'status',
      ],
      author: '',
      notes:
        'All dimensions and port positions in this example require verification. Reserve defaults are zero. User-selected termination allowance is60mm perend on bulk cables; no service loop is added bydefault.',
    },
  };
  if (populated) {
    p.devices = [
      {
        id: 'patch-1',
        definitionId: 'def-patch',
        name: 'Patch panel 1',
        startU: 18,
        face: 'front',
        supportId: null,
        installation: 'installed',
      },
      {
        id: 'switch-1',
        definitionId: 'def-switch',
        name: 'Network switch 1',
        startU: 16,
        face: 'front',
        supportId: null,
        installation: 'installed',
      },
      {
        id: 'server-1',
        definitionId: 'def-server',
        name: 'Server 1',
        startU: 8,
        face: 'front',
        supportId: null,
        installation: 'installed',
      },
      {
        id: 'shelf-1',
        definitionId: 'def-shelf',
        name: 'Shelf 1',
        startU: 3,
        face: 'front',
        supportId: null,
        installation: 'installed',
      },
      {
        id: 'pc-1',
        definitionId: 'def-pc',
        name: 'PC 1',
        startU: 3,
        face: 'front',
        supportId: 'shelf-1',
        installation: 'installed',
      },
      {
        id: 'pdu-1',
        definitionId: 'def-pdu',
        name: 'Rear PDU 1',
        startU: 12,
        face: 'rear',
        supportId: null,
        installation: 'installed',
      },
    ];
    p.cables = [
      { ...baseCable('NET-001'), purpose: 'PC network uplink' },
      {
        ...baseCable('NET-002'),
        source: { kind: 'device', deviceId: 'patch-1', portId: 'p1' },
        destination: { kind: 'external', destinationId: 'desk-1', portId: 'network' },
        exitId: 'exit-1',
        supply: 'bulk',
        suppliedLengthMm: null,
        color: '#629aff',
        purpose: 'Operator workstation network',
        notes: 'External run has not been surveyed.',
      },
    ];
    p.accessories = [
      {
        id: 'tray-1',
        name: 'Vertical cable tray · example',
        position: [258, 430, 390],
        size: [55, 760, 55],
        kind: 'tray',
        parentId: null,
        cableIds: [],
        evidence: 'example',
      },
    ];
  }
  return p;
}
/** Current workspace defaults. The separately requested demonstration retains a step. */
export function createWorkspaceProject(populated = true): Project {
  const p = createExampleProject(populated);
  p.rack.sections = [
    {
      id: 'main',
      startU: 1,
      endU: p.rack.heightU,
      overallDepthMm: 900,
      frontRailZMm: 0,
      rearRailZMm: 800,
    },
  ];
  p.rack.depthMeaning = 'rail-spacing';
  p.rack.fixedFace = 'front';
  const server = p.definitions.find((d) => d.id === 'def-server');
  if (server) server.railMaxMm = 900;
  p.settings.cablePrefix = '';
  p.cables.forEach((c, i) => {
    c.label = String(i);
    c.name = `Cable ${i}`;
  });
  p.name = populated ? 'Vehicle communications · example' : 'Untitled rack project';
  p.settings.notes =
    'Rack depth means front-to-rear screw-plane spacing. U1 is at the bottom. External destinations are logical records reached via rack exits. All numerical rack and generic equipment dimensions in this example require verification. No service loops are added by default. User-selected termination allowance is60mm perend on bulk cables, editableper cable and shown in the schedule.';
  return p;
}
