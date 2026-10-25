import { createServer } from 'vite';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import process from 'node:process';

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});
try {
  const { parseProject, validateReferences } = await server.ssrLoadModule('/src/data/project.ts');
  const { validatePlacement } = await server.ssrLoadModule('/src/engineering/geometry.ts');
  const { definitionSchema } = await server.ssrLoadModule('/src/model.ts');
  const { analyseProject } = await server.ssrLoadModule('/src/engineering/analysis.ts');
  const results = [];
  for (const file of (await readdir('examples'))
    .filter((name) => name.endsWith('.rack.json'))
    .sort()) {
    const project = parseProject(await readFile(`examples/${file}`, 'utf8'));
    assert.deepEqual(validateReferences(project), [], `${file}: reference integrity`);
    for (const device of project.devices)
      assert.deepEqual(
        validatePlacement(project, device, device.id),
        [],
        `${file}: ${device.name}`,
      );
    results.push(`${file}: parsed, references valid, ${project.devices.length} placements valid`);
    if (file === 'modelling-workspace.rack.json') {
      const routes = analyseProject(project).cables;
      for (const a of routes)
        assert.equal(
          a.route.valid,
          true,
          `${file}: cable ${a.cable.label}: ${a.route.issues.join('; ')}`,
        );
      results.push(
        `${file}: all ${routes.length} cable routes geometrically valid; bend specifications remain provisional`,
      );
    }
  }
  for (const [file, definitionId] of [
    ['user-rack-pc', 'def-user-rack-pc'],
    ['generic-switch-24', 'def-generic-switch-24'],
    ['lacing-bars', 'def-lacing-bar'],
  ]) {
    const library = JSON.parse(await readFile('examples/' + file + '.library.json', 'utf8'));
    assert.equal(library.length, 1);
    const definition = definitionSchema.parse(library[0]);
    const standalone = parseProject(await readFile('examples/' + file + '.rack.json', 'utf8'));
    assert.deepEqual(
      definition,
      standalone.definitions.find((d) => d.id === definitionId),
    );
    results.push(
      file + '.library.json: schema valid; identical to the standalone project definition',
    );
  }
  const report = `Portable example integrity · ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'Europe/London' }).format(new Date())}\nCommand: node scripts/validate-examples.mjs\n${results.join('\n')}\n`;
  await writeFile('docs/validation/example-integrity.txt', report);
  process.stdout.write(report);
} finally {
  await server.close();
}
