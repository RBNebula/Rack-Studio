// Writes browser-test fixtures containing the equipment retired from the application
// (src/data/retired.ts). Their definition ids are renamed to test-only qa-… ids, so opening them
// in the app keeps the equipment the workflows exercise. Run: node scripts/make-test-fixtures.mjs
import { createServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const { createWorkspaceProject } = await server.ssrLoadModule('/src/testing/legacy-example.ts');
  const { serializeProject, parseProject } = await server.ssrLoadModule('/src/data/project.ts');
  const { retiredDefinitionIds } = await server.ssrLoadModule('/src/data/retired.ts');
  const renamed = new Set([...Object.keys(retiredDefinitionIds), 'def-shelf', 'def-shelf-1']);
  const qa = (id) => (renamed.has(id) ? id.replace(/^def-/, 'qa-') : id);
  const remap = (p) => {
    for (const d of p.definitions) d.id = qa(d.id);
    for (const d of p.devices) d.definitionId = qa(d.definitionId);
    return p;
  };
  const example = remap(createWorkspaceProject(true));
  example.id = 'qa-example-project';
  example.updatedAt = '2026-10-28T12:00:00.000Z';
  await writeFile(resolve('tests/fixtures/example-project.rack.json'), serializeProject(example));
  const follow = remap(parseProject(await readFile(resolve('tests/fixtures/route-follow.rack.json'), 'utf8')));
  await writeFile(resolve('tests/fixtures/route-follow.rack.json'), serializeProject(follow));
} finally {
  await server.close();
}
