import { describe, expect, it } from 'vitest';
import { baseCable, createExampleProject } from '../examples';
import type { Cable, Port, Project } from '../model';
import { parseProject, serializeProject } from '../data/project';
import {
  analyseCable,
  analyseProject,
  csv,
  cutListCsv,
  procurementCsv,
  scheduleCsv,
  scheduleValue,
} from './analysis';

/** Two verified, unobstructed parallel connector tracks with a known 3U gap. */
function straightFixture(): Project {
  const project = createExampleProject(false);
  project.rack.evidence = 'verified';
  const topPort = (id: string, x: number): Port => ({
    id,
    name: id,
    connector: 'RJ45',
    surface: 'custom',
    position: [x, 44.45, -10],
    direction: [0, 1, 0],
    multiple: false,
  });
  const bottomPort = (id: string, x: number): Port => ({
    id,
    name: id,
    connector: 'RJ45',
    surface: 'custom',
    position: [x, 0, -10],
    direction: [0, -1, 0],
    multiple: false,
  });
  const base = project.definitions[0];
  project.definitions.push(
    {
      ...structuredClone(base),
      id: 'source-definition',
      name: 'Source',
      evidence: 'verified',
      heightMm: 44.45,
      depthMm: 20,
      widthMm: 200,
      ports: [topPort('p', 100), topPort('q', 50)],
    },
    {
      ...structuredClone(base),
      id: 'destination-definition',
      name: 'Destination',
      evidence: 'verified',
      heightMm: 44.45,
      depthMm: 20,
      widthMm: 200,
      ports: [bottomPort('p', 100), bottomPort('q', 50)],
    },
  );
  project.devices = [
    {
      id: 'source-device',
      definitionId: 'source-definition',
      name: 'Source device',
      startU: 4,
      face: 'front',
      supportId: null,
      installation: 'installed',
    },
    {
      id: 'destination-device',
      definitionId: 'destination-definition',
      name: 'Destination device',
      startU: 8,
      face: 'front',
      supportId: null,
      installation: 'installed',
    },
  ];
  const cable: Cable = {
    ...baseCable('NET-STRAIGHT'),
    source: { kind: 'device', deviceId: 'source-device', portId: 'p' },
    destination: { kind: 'device', deviceId: 'destination-device', portId: 'p' },
    supply: 'bulk',
    suppliedLengthMm: null,
    minBendRadiusMm: 20,
    terminationAMm: 0,
    terminationBMm: 0,
  };
  project.cables = [cable];
  project.accessories = [];
  return project;
}

function externalFixture(externalLengthMm: number | null = 18000): Project {
  const project = straightFixture();
  project.exits = [
    {
      id: 'straight-exit',
      name: 'Upper cable exit',
      position: [100, 577.8, -10],
      size: [40, 40],
      direction: [0, 1, 0],
      evidence: 'verified',
    },
  ];
  project.cables[0] = {
    ...project.cables[0],
    id: 'NET-EXTERNAL',
    label: 'NET-EXTERNAL',
    destination: { kind: 'external', destinationId: 'desk-1', portId: 'network' },
    exitId: 'straight-exit',
    externalLengthMm,
    serviceMm: 200,
    terminationAMm: 100,
    terminationBMm: 150,
    otherMm: 35,
    roundToMm: 100,
  };
  return project;
}

/** Small RFC 4180 reader so exports are tested as records, including quoted newlines. */
function csvRecords(input: string): string[][] {
  const text = input.replace(/^\ufeff/, '');
  const records: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index++;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if (character === '\r' && text[index + 1] === '\n' && !quoted) {
      row.push(field);
      records.push(row);
      row = [];
      field = '';
      index++;
    } else field += character;
  }
  row.push(field);
  records.push(row);
  return records;
}

describe('cable, route, length and procurement integration', () => {
  it('calculates a known unobstructed straight 133.35 mm centreline and 140 mm rounded cut', () => {
    const project = straightFixture();
    const result = analyseProject(project);
    expect(result.cables[0].route.valid, result.cables[0].route.issues.join('; ')).toBe(true);
    expect(result.cables[0].route.lengthMm).toBeCloseTo(133.35, 8);
    expect(result.cables[0].requiredMm).toBe(140);
    expect(result.cables[0].status).toBe('Calculated');
    expect(result.procurement.products[0].knownCutLengthMm).toBe(140);
    expect(result.procurement.products[0].allocatedReels[0].cuts[0].lengthMm).toBe(140);
  });

  it('adds a manually surveyed external run to the modelled port-to-exit length exactly once', () => {
    const project = externalFixture();
    // Logical external destinations do not need an invented world position.
    expect(project.destinations[0].position).toBeNull();
    const result = analyseProject(project);
    const cable = result.cables[0];
    expect(cable.route.valid, cable.route.issues.join('; ')).toBe(true);
    expect(cable.route.lengthMm).toBeCloseTo(400, 8);
    expect(cable.route.points.at(-1)).toEqual([100, 577.8, -10]);
    expect(cable.length.knownSubtotalMm).toBeCloseTo(18885, 8);
    expect(cable.requiredMm).toBe(18900);
    expect(result.procurement.products[0].knownCutLengthMm).toBe(18900);
    expect(scheduleValue(project, cable, 'external')).toBe(18000);
  });

  it('retains unknown external demand as null and unresolved rather than a completed zero-length cut', () => {
    const project = externalFixture(null);
    const result = analyseProject(project);
    const cable = result.cables[0];
    expect(cable.route.valid, cable.route.issues.join('; ')).toBe(true);
    expect(cable.requiredMm).toBeNull();
    expect(cable.length.knownSubtotalMm).toBeCloseTo(885, 8);
    expect(cable.status).toBe('External length unknown');
    const procurement = result.procurement.products[0];
    expect(procurement.status).toBe('provisional');
    expect(procurement.requiredCutLengthMm).toBeNull();
    expect(procurement.minimumFeasibleNewReels).toBeNull();
    expect(procurement.unresolvedCutIds).toEqual(['NET-EXTERNAL']);
    expect(procurement.allocatedReels).toEqual([]);
    expect(scheduleValue(project, cable, 'required')).toBeNull();
    expect(csvRecords(scheduleCsv(project))[1]).toContain('Unknown');
  });

  it('counts each physical cable once even when it belongs to a loom and passes through an exit', () => {
    const project = externalFixture();
    project.cables.push({
      ...baseCable('NET-INTERNAL'),
      source: { kind: 'device', deviceId: 'source-device', portId: 'q' },
      destination: { kind: 'device', deviceId: 'destination-device', portId: 'q' },
      supply: 'bulk',
      suppliedLengthMm: null,
      minBendRadiusMm: 20,
      terminationAMm: 0,
      terminationBMm: 0,
    });
    project.looms = [
      {
        id: 'loom',
        name: 'Network loom',
        cableIds: ['NET-EXTERNAL', 'NET-INTERNAL'],
        waypoints: [],
        packingFactor: 1.3,
      },
    ];
    const result = analyseProject(project);
    expect(result.cables).toHaveLength(2);
    expect(result.procurement.products[0].knownCutLengthMm).toBe(19040);
    const allocations = result.procurement.products.flatMap((product) =>
      product.allocatedReels.flatMap((reel) => reel.cuts.map((cut) => cut.id)),
    );
    expect(allocations.sort()).toEqual(['NET-EXTERNAL', 'NET-INTERNAL']);
    expect(csvRecords(scheduleCsv(project))).toHaveLength(3);
    expect(csvRecords(cutListCsv(project))).toHaveLength(3);
  });

  it('excludes fixed supplied assemblies from bulk-reel demand', () => {
    const project = straightFixture();
    project.cables[0].supply = 'preterminated';
    project.cables[0].suppliedLengthMm = 2000;
    const result = analyseProject(project);
    expect(result.cables[0].preterminated?.status).toBe('sufficient');
    expect(result.cables[0].preterminated?.availableSlackMm).toBeCloseTo(1866.65, 8);
    expect(result.procurement.products[0].knownCutLengthMm).toBe(0);
    expect(result.procurement.products[0].allocatedReels).toEqual([]);
  });

  it('flags a fixed 2 m assembly against a 2.3 m external connection without stretching it', () => {
    const project = externalFixture(1900);
    const cable = project.cables[0];
    cable.supply = 'preterminated';
    cable.suppliedLengthMm = 2000;
    cable.serviceMm = 0;
    cable.otherMm = 0;
    const result = analyseCable(project, cable);
    expect(result.requiredMm).toBeCloseTo(2300, 8);
    expect(result.preterminated?.status).toBe('insufficient');
    expect(result.preterminated?.shortfallMm).toBeCloseTo(300, 8);
    expect(result.cable.suppliedLengthMm).toBe(2000);
    expect(result.status).toBe('Insufficient length');
  });

  it('preserves endpoints after save/reload, then recomputes a moved device in an edited project', () => {
    const original = straightFixture();
    const before = analyseProject(original).cables[0];
    const edited = parseProject(serializeProject(original));
    edited.devices.find((device) => device.id === 'destination-device')!.startU = 9;
    const after = analyseProject(edited).cables[0];
    expect(after.cable.id).toBe(before.cable.id);
    expect(after.cable.source).toEqual(before.cable.source);
    expect(after.cable.destination).toEqual(before.cable.destination);
    expect(after.route.points.at(-1)![1] - before.route.points.at(-1)![1]).toBeCloseTo(44.45, 8);
    expect(after.route.lengthMm).toBeCloseTo(177.8, 8);
    expect(after.requiredMm).toBe(180);
    expect(analyseProject(original).cables[0].requiredMm).toBe(140);
  });

  it('blocks an invalid route and a short manual override from final procurement', () => {
    const invalid = straightFixture();
    invalid.cables[0].source = {
      kind: 'device',
      deviceId: 'source-device',
      portId: 'missing-port',
    };
    const invalidResult = analyseProject(invalid);
    expect(invalidResult.cables[0].status).toBe('Route invalid');
    expect(invalidResult.cables[0].requiredMm).toBeNull();
    expect(invalidResult.procurement.products[0].unresolvedCutIds).toEqual(['NET-STRAIGHT']);
    const short = straightFixture();
    short.cables[0].manualOverrideMm = 100;
    short.cables[0].overrideReason = 'User-entered cut, to be checked';
    const shortResult = analyseProject(short);
    expect(shortResult.cables[0].status).toBe('Override too short');
    expect(shortResult.procurement.products[0].unresolvedCutIds).toEqual(['NET-STRAIGHT']);
    expect(shortResult.procurement.products[0].allocatedReels).toEqual([]);
  });

  it('exports the same authoritative cut total and reel quantities used in the cutting plan', () => {
    const project = straightFixture();
    const records = csvRecords(procurementCsv(project));
    expect(records[1][2]).toBe('140');
    expect(records[1][4]).toBe('1');
    expect(records[1][5]).toBe('1');
    expect(records[1][6]).toBe('1');
    const cuts = csvRecords(cutListCsv(project));
    expect(cuts[1][0]).toBe('NET-STRAIGHT');
    expect(cuts[1][5]).toBe('140');
    expect(cuts[1][7]).toBe(
      analyseProject(project).procurement.products[0].allocatedReels[0].reelId,
    );
  });
});

describe('CSV export integrity', () => {
  it('neutralises formula prefixes in text, including leading whitespace, while retaining numbers', () => {
    const output = csv([
      ['=1+1', '+cmd', '-cmd', '@SUM(A1)', '  =SUM(A1)', '\t=1', '\r=1', '\n=1', -5, 42, null],
    ]);
    const fields = csvRecords(output)[0];
    expect(fields.slice(0, 8)).toEqual([
      "'=1+1",
      "'+cmd",
      "'-cmd",
      "'@SUM(A1)",
      "'  =SUM(A1)",
      "'\t=1",
      "'\r=1",
      "'\n=1",
    ]);
    expect(fields.slice(8)).toEqual(['-5', '42', 'Unknown']);
  });

  it('quotes commas, doubles quotes, and preserves embedded newlines in a single cell', () => {
    const text = 'Operator "A", console\r\nSecond line';
    const output = csv([
      ['Label', 'Purpose'],
      ['NET-1', text],
    ]);
    expect(output).toContain('"Operator ""A"", console\r\nSecond line"');
    expect(csvRecords(output)).toEqual([
      ['Label', 'Purpose'],
      ['NET-1', text],
    ]);
  });

  it('applies formula neutralisation to user-entered schedule fields and preserves columns', () => {
    const project = straightFixture();
    project.settings.scheduleColumns = ['id', 'purpose', 'source', 'required'];
    project.cables[0].purpose = '=HYPERLINK("https://example.com","Unsafe formula")';
    const records = csvRecords(scheduleCsv(project));
    expect(records[0]).toEqual(['Cable number', 'Purpose', 'Source · port', 'Required (mm)']);
    expect(records[1]).toEqual([
      'NET-STRAIGHT',
      '\'=HYPERLINK("https://example.com","Unsafe formula")',
      'Source device · p',
      '140',
    ]);
  });
});
