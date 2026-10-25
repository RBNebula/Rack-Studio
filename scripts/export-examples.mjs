import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});
try {
  const { createWorkspaceProject, createExampleProject } =
    await server.ssrLoadModule('/src/examples.ts');
  const { serializeProject } = await server.ssrLoadModule('/src/data/project.ts');
  const { scheduleCsv, cutListCsv, procurementCsv, analyseProject } = await server.ssrLoadModule(
    '/src/engineering/analysis.ts',
  );
  const dir = resolve('examples');
  await mkdir(dir, { recursive: true });
  const project = createWorkspaceProject();
  project.id = 'sample-communications-rack';
  project.updatedAt = '2026-10-22T12:00:00.000Z';
  // Explicit illustrative survey/allowances for demonstrating arithmetic, not an installation rule.
  project.cables[1].externalLengthMm = 5500;
  project.settings.notes +=
    ' Sample external survey5500mm is illustrative only. End allowances are60mm perend per the user-selected default.';
  await writeFile(resolve(dir, 'communications-rack.rack.json'), serializeProject(project));
  await writeFile(resolve(dir, 'master-cable-schedule.csv'), scheduleCsv(project));
  await writeFile(resolve(dir, 'cable-cutting-plan.csv'), cutListCsv(project));
  await writeFile(resolve(dir, 'procurement-report.csv'), procurementCsv(project));
  const lacing = createExampleProject(false);
  lacing.id = 'lacing-bar-reference';
  lacing.name = 'Front and rear lacing bars · provisional';
  lacing.updatedAt = '2026-10-24T12:00:00.000Z';
  lacing.rack.endPanels = null;
  lacing.devices = ['front', 'rear'].map((face, i) => ({
    id: 'lacing-bar-' + face,
    definitionId: 'def-lacing-bar',
    name: face + ' lacing bar',
    startU: i ? 17 : 8,
    face,
    supportId: null,
    installation: 'installed',
  }));
  lacing.exits = [];
  lacing.destinations = [];
  lacing.settings.notes =
    'Generic middle-hole lacing bars with 150 mm clear inward reach (156 mm overall with the provisional 6 mm crossbar). Profile/tab dimensions and rack construction are illustrative. Front/rear placement examples; ordinary surface wiring guides stay in world space when hardware moves.';
  await writeFile(resolve(dir, 'lacing-bars.rack.json'), serializeProject(lacing));
  await writeFile(
    resolve(dir, 'lacing-bars.library.json'),
    JSON.stringify(
      lacing.definitions.filter((d) => d.lacing),
      null,
      2,
    ),
  );
  const stepped = createExampleProject();
  stepped.id = 'sample-stepped-rack';
  stepped.updatedAt = project.updatedAt;
  await writeFile(resolve(dir, 'stepped-rack.rack.json'), serializeProject(stepped));
  const reference = createExampleProject(false);
  reference.id = 'configurable-construction-reference';
  reference.name = '20U configurable construction reference · provisional';
  reference.updatedAt = project.updatedAt;
  reference.rack.name = 'Generic 19-inch reference · provisional';
  reference.rack.frameStyle = 'explicit';
  reference.rack.endPanels = null;
  reference.rack.members = [];
  reference.devices = [
    {
      id: 'reference-shelf',
      definitionId: 'def-shelf-1',
      name: 'Generic 1U shelf · provisional',
      startU: 3,
      face: 'front',
      supportId: null,
      installation: 'installed',
    },
  ];
  reference.exits = [];
  reference.destinations = [];
  reference.settings.notes =
    'User-selected provisional test:20U, overall frame-envelope depth800mm atU1–U15 and750mm atU16–U20 inclusive. Rail planes0/700mm and0/650mm, externalwidth600mm, railprofile10×10mm and450mm shelf are independent illustrative values, not surveyed measurements. No structural beams or transition supports have been inferred: explicitmembers are empty. Configure them from a reference. Generic frame preview can be enabled separately. The shelf does not span the rack depth.';
  await writeFile(resolve(dir, 'configurable-construction.rack.json'), serializeProject(reference));
  const flat = createWorkspaceProject(false);
  flat.id = 'flat-rack-visual-reference';
  flat.name = 'Flat 20U rack · photograph reference';
  flat.updatedAt = '2026-10-23T00:00:00.000Z';
  flat.rack.name = 'Basic flat 19-inch rack · provisional';
  flat.rack.depthMeaning = 'external';
  flat.rack.sections = [
    { id: 'flat', startU: 1, endU: 20, overallDepthMm: 800, frontRailZMm: 0, rearRailZMm: 700 },
  ];
  flat.rack.color = '#242629';
  flat.exits = [];
  flat.destinations = [];
  flat.settings.notes =
    'Qualitative reference: user-provided open square-frame rack photograph, solid folded blanks and circular-perforated blanks. Dimensions are provisional:20U,600mmwide,800mmoverall,700mmrailspacing,2mmtop/base. No depth step. Mountingrails remain independentlyconfigurable. Pictures do not establish measured dimensions or load capacity.';
  await writeFile(resolve(dir, 'flat-rack-reference.rack.json'), serializeProject(flat));
  const plates = globalThis.structuredClone(flat);
  plates.id = 'blanking-plates-visual-reference';
  plates.name = 'Solid and mesh blanking plates · photograph reference';
  plates.devices = [
    {
      id: 'solid-1',
      definitionId: 'def-blank-1',
      name: 'Solid 1U blank',
      startU: 18,
      face: 'front',
      supportId: null,
      installation: 'installed',
    },
    {
      id: 'mesh-1',
      definitionId: 'def-mesh-1',
      name: 'Perforated 1U blank',
      startU: 16,
      face: 'front',
      supportId: null,
      installation: 'installed',
    },
    {
      id: 'solid-2',
      definitionId: 'def-blank-2',
      name: 'Solid 2U blank',
      startU: 12,
      face: 'front',
      supportId: null,
      installation: 'installed',
    },
    {
      id: 'mesh-4',
      definitionId: 'def-mesh-4',
      name: 'Perforated 4U blank',
      startU: 5,
      face: 'front',
      supportId: null,
      installation: 'installed',
    },
    {
      id: 'rear-mesh',
      definitionId: 'def-mesh-1',
      name: 'Rear perforated blank',
      startU: 10,
      face: 'rear',
      supportId: null,
      installation: 'installed',
    },
  ];
  await writeFile(resolve(dir, 'blanking-plates-reference.rack.json'), serializeProject(plates));
  const pc = globalThis.structuredClone(flat);
  pc.id = 'user-rack-pc-reference';
  pc.name = 'Photographed 1U rack PC · measured width and depth';
  pc.devices = [
    {
      id: 'user-pc-1',
      definitionId: 'def-user-rack-pc',
      name: 'User rack PC 1',
      startU: 8,
      face: 'front',
      supportId: null,
      installation: 'installed',
    },
  ];
  pc.settings.notes =
    'User PC: 1U confirmed; width431.8mm, earwidth482.6mm, ear-plane-to-rear381mm user measured. Physicalheight43mm provisional. Ports and visual fittings are photo estimates; rear DisplayPort/HDMI and interface labels follow the annotated user photo. Rack construction remains provisional. See docs/user-pc-reference.md. No load/support certification inferred.';
  await writeFile(resolve(dir, 'user-rack-pc.rack.json'), serializeProject(pc));
  const networkSwitch = globalThis.structuredClone(flat);
  networkSwitch.id = 'generic-switch-24-reference';
  networkSwitch.name = 'Generic 24-port switch · single-row reference';
  networkSwitch.devices = [
    {
      id: 'generic-switch-1',
      definitionId: 'def-generic-switch-24',
      name: 'Generic switch 1',
      startU: 8,
      face: 'front',
      supportId: null,
      installation: 'installed',
    },
  ];
  networkSwitch.updatedAt = '2026-10-24T12:00:00.000Z';
  networkSwitch.settings.notes =
    'Generic visual reference from user-provided switch photo: 24 RJ45 in one front row, two front SFP cages, one rear IEC C14 AC inlet. No touchscreen, Etherlighting or DC backup. Chassis 442.4 × 325 × 43.7 mm, ear gauge and connector datums are editable PROVISIONAL values, not verified specifications of a Ubiquiti product. Existing temporary switch definitions are retained for saved cable compatibility.';
  await writeFile(resolve(dir, 'generic-switch-24.rack.json'), serializeProject(networkSwitch));
  await writeFile(
    resolve(dir, 'generic-switch-24.library.json'),
    JSON.stringify(
      [networkSwitch.definitions.find((d) => d.id === 'def-generic-switch-24')],
      null,
      2,
    ),
  );
  await writeFile(
    resolve(dir, 'user-rack-pc.library.json'),
    JSON.stringify([pc.definitions.find((d) => d.id === 'def-user-rack-pc')], null, 2),
  );
  const analysis = analyseProject(project);
  const service = globalThis.structuredClone(pc);
  service.id = 'pc-sliding-rails-reference';
  service.name = 'PC sliding rails · extended service position';
  service.devices[0].rails = {
    memberLengthMm: 520,
    profileWidthMm: 8,
    profileHeightMm: 28,
    chassisLeadMm: 100,
    extensionMm: 600,
    evidence: 'example',
  };
  service.settings.notes +=
    ' User-confirmed rail projection500mm, approximate chassis protrusion600mm. Sliding member520mm, pack width8mm and height28mm are editable provisional values; no mounting span min/max. See docs/device-rails.md.';
  await writeFile(resolve(dir, 'pc-sliding-rails.rack.json'), serializeProject(service));
  const wiring = globalThis.structuredClone(pc);
  wiring.id = 'shared-wiring-guides-reference';
  wiring.name = 'Shared surface waypoints and line guide';
  wiring.devices.push({
    ...wiring.devices[0],
    id: 'user-pc-2',
    name: 'User rack PC 2',
    startU: 12,
  });
  wiring.wiringGuides = [
    { id: 'guide-point', name: 'Point 1', kind: 'point', position: [232.55, 450, -10] },
    {
      id: 'guide-line',
      name: 'Line 2',
      kind: 'line',
      start: [-232.55, 400, -10],
      end: [-232.55, 440, -10],
    },
  ];
  const { baseCable } = await server.ssrLoadModule('/src/examples.ts');
  wiring.cables = [
    {
      ...baseCable('usb-0'),
      label: '0',
      name: 'PC USB reference',
      type: 'USB-A',
      suppliedLengthMm: null,
      source: { kind: 'device', deviceId: 'user-pc-1', portId: 'front-usb-top' },
      destination: { kind: 'device', deviceId: 'user-pc-2', portId: 'front-usb-top' },
      terminationAMm: 0,
      terminationBMm: 0,
      guideLinks: [
        { guideId: 'guide-point', reverse: false },
        { guideId: 'guide-line', reverse: false },
      ],
      notes:
        'Geometry demonstration. Actual USB cable specification, length and bend radius remain unset/unverified.',
    },
  ];
  wiring.settings.notes +=
    ' Shared guides are world-fixed, 10 mm in front of the rack post faces. Line entry/exit are explicit. See docs/wiring-mode.md.';
  await writeFile(resolve(dir, 'wiring-guides.rack.json'), serializeProject(wiring));
  const workspace = globalThis.structuredClone(wiring);
  workspace.id = 'modelling-workspace-reference';
  workspace.name = 'Adjacent racks, physical guides and vehicle endpoint · provisional';
  workspace.updatedAt = '2026-10-24T12:00:00.000Z';
  workspace.additionalRacks = [
    {
      ...globalThis.structuredClone(workspace.rack),
      id: 'rack-b',
      name: 'Rack B',
      originMm: [700, 0, 0],
    },
  ];
  workspace.devices.push({
    ...workspace.devices[0],
    id: 'rack-b-pc',
    name: 'Rack B PC',
    rackId: 'rack-b',
  });
  const accessory = (id, name, kind, position, size, rotationDeg = [0, 0, 0]) => ({
    id,
    name,
    kind,
    position,
    size,
    rotationDeg,
    perforated: kind === 'tray',
    parentId: null,
    cableIds: [],
    evidence: 'example',
    attachment: { kind: 'rack', id: workspace.rack.id },
  });
  workspace.accessories = [
    accessory(
      'side-tray',
      'Side tray · provisional',
      'tray',
      [-360, 450, 350],
      [110, 30, 400],
      [0, 0, 90],
    ),
    accessory('under-tray', 'Under-rack tray · provisional', 'tray', [0, -90, 350], [110, 30, 400]),
    accessory('top-tray', 'Top tray · provisional', 'tray', [0, 990, 350], [110, 30, 400]),
    {
      ...accessory('clip-a', 'Front clip', 'anchor', [232.55, 400, -10], [54, 54, 12], [-90, 0, 0]),
      openingMm: 50,
    },
    {
      ...accessory('tie-b', 'Front tie', 'tie', [232.55, 460, -10], [54, 54, 12], [-90, 0, 0]),
      openingMm: 50,
    },
  ];
  const { fixingGuide } = await server.ssrLoadModule('/src/engineering/modelling.ts');
  workspace.wiringGuides = [];
  const guides = workspace.accessories
    .filter((a) => a.kind !== 'tray')
    .map((a) => fixingGuide(workspace, a));
  workspace.cables = ['front-usb-top', 'front-usb-bottom'].map((port, i) => ({
    ...globalThis.structuredClone(wiring.cables[0]),
    id: `workspace-usb-${i}`,
    label: String(i),
    source: { kind: 'device', deviceId: 'user-pc-1', portId: port },
    destination: { kind: 'device', deviceId: 'user-pc-2', portId: port },
    guideLinks: [],
  }));
  workspace.looms = [
    {
      id: 'bundle',
      name: 'Shared front USB path',
      cableIds: workspace.cables.map((c) => c.id),
      guideIds: guides,
      waypoints: [],
      packingFactor: 1,
    },
  ];
  workspace.exits = [
    {
      id: 'vehicle-exit',
      name: 'Rack-to-vehicle exit',
      position: [-350, 400, 650],
      size: [80, 60],
      direction: [-1, 0, 0],
      evidence: 'example',
    },
  ];
  workspace.destinations = [
    {
      id: 'vehicle',
      name: 'Vehicle network',
      location: 'Outside rack',
      notes: 'Illustrative endpoint; no vehicle body model.',
      position: [-850, 400, 1000],
      routeIn3D: true,
      ports: [
        {
          id: 'network',
          name: 'Network',
          connector: 'RJ45',
          surface: 'custom',
          position: [0, 0, 0],
          direction: [0, 0, -1],
          multiple: false,
        },
      ],
    },
  ];
  workspace.cables.push({
    ...baseCable('vehicle-2'),
    label: '2',
    name: 'Rack A to vehicle',
    source: { kind: 'device', deviceId: 'user-pc-1', portId: 'rear-rj45' },
    destination: { kind: 'external', destinationId: 'vehicle', portId: 'network' },
    exitId: 'vehicle-exit',
    externalLengthMm: null,
  });
  workspace.cables.push({
    ...baseCable('cross-rack-3'),
    label: '3',
    name: 'Rack A to rack B',
    source: { kind: 'device', deviceId: 'user-pc-2', portId: 'rear-rj45' },
    destination: { kind: 'device', deviceId: 'rack-b-pc', portId: 'rear-rj45' },
  });
  workspace.settings.notes =
    'All rack, tray, clip/tie and endpoint positions are illustrative. PC width/depth and 1U allocation are user confirmed; height and ports remain provisional. Side/under/top trays demonstrate independent placement without inferred mounting brackets. USB bundle uses two surface-attached guides; individual cable identities are retained. Vehicle path is measured geometrically through the exit, with 60mm termination allowance at each end. No service-loop allowance or rated installation approval is inferred.';
  await writeFile(resolve(dir, 'modelling-workspace.rack.json'), serializeProject(workspace));
  await writeFile(
    resolve(dir, 'calculation-evidence.json'),
    JSON.stringify(
      {
        notice: 'Illustrative model. No physical installation certification.',
        cables: analysis.cables.map((a) => ({
          id: a.cable.id,
          number: a.cable.label,
          routeMm: a.route.lengthMm,
          routeValid: a.route.valid,
          routeIssues: a.route.issues,
          requiredMm: a.requiredMm,
          status: a.status,
        })),
        procurement: analysis.procurement,
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
