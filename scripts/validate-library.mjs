// Validates equipment library files (JSON arrays of device definitions) before import.
// Usage: node scripts/validate-library.mjs <file.library.json> [...more files]
import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';
import process from 'node:process';

const files = process.argv.slice(2);
if (!files.length) {
  process.stderr.write('Usage: node scripts/validate-library.mjs <file.library.json> [...]\n');
  process.exit(2);
}
const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error',
});
let failures = 0;
try {
  const { definitionSchema } = await server.ssrLoadModule('/src/model.ts');
  const { createExampleProject } = await server.ssrLoadModule('/src/examples.ts');
  const { validatePlacement } = await server.ssrLoadModule('/src/engineering/geometry.ts');
  for (const file of files) {
    const raw = JSON.parse(await readFile(file, 'utf8'));
    if (!Array.isArray(raw)) {
      process.stdout.write(`${file}: FAIL library must be a JSON array of definitions\n`);
      failures++;
      continue;
    }
    for (const [index, entry] of raw.entries()) {
      const label = `${file} [${index}] ${entry?.name ?? '(unnamed)'}`;
      const parsed = definitionSchema.safeParse(entry);
      if (!parsed.success) {
        process.stdout.write(`${label}: FAIL schema\n`);
        for (const issue of parsed.error.issues)
          process.stdout.write(`  ${issue.path.join('.')}: ${issue.message}\n`);
        failures++;
        continue;
      }
      const definition = parsed.data;
      const issues = [];
      const ids = definition.ports.map((p) => p.id);
      for (const id of ids.filter((id, i) => ids.indexOf(id) !== i))
        issues.push(`duplicate port id ${id}`);
      for (const port of definition.ports) {
        if (Math.abs(port.position[0]) > definition.faceWidthMm / 2)
          issues.push(`port ${port.id} x ${port.position[0]} lies outside the face width`);
        if (port.position[1] < 0 || port.position[1] > definition.heightMm)
          issues.push(`port ${port.id} y ${port.position[1]} lies outside the chassis height`);
        if (Math.abs(Math.hypot(...port.direction) - 1) > 1e-6)
          issues.push(`port ${port.id} direction is not a unit vector`);
      }
      const placements = [];
      if (['direct', 'rails', 'bracket'].includes(definition.mounting)) {
        for (const face of ['front', 'rear']) {
          const project = createExampleProject(false);
          // Built-in example definitions can share the id; validate the file's copy.
          project.definitions = [
            ...project.definitions.filter((d) => d.id !== definition.id),
            definition,
          ];
          const device = {
            id: 'validation-device',
            definitionId: definition.id,
            name: definition.name,
            startU: 1,
            face,
            supportId: null,
            installation: 'installed',
          };
          project.devices = [device];
          const placementIssues = validatePlacement(project, device, device.id);
          for (const issue of placementIssues) issues.push(`${face} placement at U1: ${issue}`);
          placements.push(`${face} U1 ${placementIssues.length ? 'invalid' : 'valid'}`);
        }
      } else placements.push(`placement not checked for ${definition.mounting} mounting`);
      const unverified = definition.ports.filter((p) => p.evidence !== 'verified').length;
      const summary = `${definition.heightU}U, ${definition.ports.length} ports (${unverified} not verified), evidence ${definition.evidence}; ${placements.join(', ')}`;
      if (issues.length) {
        failures++;
        process.stdout.write(`${label}: FAIL ${summary}\n`);
        for (const issue of issues) process.stdout.write(`  ${issue}\n`);
      } else process.stdout.write(`${label}: OK ${summary}\n`);
    }
  }
} finally {
  await server.close();
}
process.exit(failures ? 1 : 0);
