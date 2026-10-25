import { createServer } from 'vite';
import { writeFile, mkdir } from 'node:fs/promises';
import { cpus, totalmem, platform, release } from 'node:os';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { Buffer } from 'node:buffer';
const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});
try {
  const { createWorkspaceProject, baseCable } = await server.ssrLoadModule('/src/examples.ts');
  const { analyseProject, scheduleCsv } = await server.ssrLoadModule(
    '/src/engineering/analysis.ts',
  );
  const { parseProject, serializeProject } = await server.ssrLoadModule('/src/data/project.ts');
  const p = createWorkspaceProject(false);
  p.id = 'routing-stress-fixture';
  p.name = '42U geometric routing benchmark · illustrative';
  p.rack.heightU = 42;
  p.rack.sections = [
    { id: 'main', startU: 1, endU: 42, overallDepthMm: 900, frontRailZMm: 0, rearRailZMm: 800 },
  ];
  p.accessories = [];
  const d = p.definitions[0];
  d.id = 'stress-switch';
  d.name = 'Six-port geometry fixture';
  d.ports = Array.from({ length: 6 }, (_, i) => ({
    id: `p${i}`,
    name: `Port ${i}`,
    connector: 'RJ45',
    surface: 'front',
    position: [-150 + i * 60, 21, -2],
    direction: [0, 0, -1],
    multiple: false,
  }));
  p.definitions = [d];
  p.devices = Array.from({ length: 40 }, (_, i) => ({
    id: `device-${i}`,
    definitionId: d.id,
    name: `Device ${i}`,
    startU: i + 1,
    face: 'front',
    supportId: null,
    installation: 'installed',
  }));
  p.cables = Array.from({ length: 100 }, (_, i) => ({
    ...baseCable(`physical-${i}`),
    label: String(i),
    name: `Cable ${i}`,
    source: { kind: 'device', deviceId: `device-${i % 40}`, portId: `p${Math.floor(i / 40)}` },
    destination: {
      kind: 'device',
      deviceId: `device-${(i + 7) % 40}`,
      portId: `p${3 + Math.floor(i / 40)}`,
    },
    supply: 'bulk',
    suppliedLengthMm: null,
    minBendRadiusMm: 30,
  }));
  const serial = serializeProject(p);
  const fixture = parseProject(serial);
  const start = performance.now();
  const analysis = analyseProject(fixture);
  const analysed = performance.now();
  const csvStart = performance.now();
  const schedule = scheduleCsv(fixture);
  const csvEnd = performance.now();
  const report = {
    date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date()),
    scope:
      'Synthetic geometric planning smoke benchmark. Does not meet full stress acceptance: no physics, constrained looms, complex imported geometry, browser FPS or memory instrumentation.',
    environment: {
      node: process.version,
      os: `${platform()} ${release()}`,
      cpu: cpus()[0]?.model,
      logicalCores: cpus().length,
      memoryGiB: Math.round(totalmem() / 2 ** 30),
    },
    counts: {
      rackU: 42,
      devices: p.devices.length,
      ports: p.devices.length * d.ports.length,
      cables: p.cables.length,
      validRoutes: analysis.cables.filter((a) => a.route.valid).length,
    },
    timingsMs: {
      routingLengthsAndProcurement: analysed - start,
      cachedScheduleCsv: csvEnd - csvStart,
    },
    bytes: { project: Buffer.byteLength(serial), csv: Buffer.byteLength(schedule) },
  };
  if (report.counts.validRoutes !== p.cables.length)
    throw new Error(
      'Benchmark fixture has invalid routes; refusing to publish a misleading timing.',
    );
  await mkdir('docs/benchmarks', { recursive: true });
  await writeFile('docs/benchmarks/geometric-smoke.json', JSON.stringify(report, null, 2));
  await writeFile('examples/geometric-stress.rack.json', serial);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} finally {
  await server.close();
}
