import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
const checks = [
  ['TypeScript', ['node_modules/typescript/bin/tsc', '--noEmit']],
  ['ESLint', ['node_modules/eslint/bin/eslint.js', '.']],
  ['Unit and integration tests', ['node_modules/vitest/vitest.mjs', 'run']],
  ['Production build', ['node_modules/vite/bin/vite.js', 'build']],
];
let report = `Rack Studio validation · ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'Europe/London' }).format(new Date())}\n`;
let failed = false;
for (const [name, args] of checks) {
  const result = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    timeout: 120000,
  });
  const entry = `\n${name}\nCommand: node ${args.join(' ')}\nExit: ${result.status}\n${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? String(result.error) : ''}\n`;
  report += entry;
  process.stdout.write(entry);
  if (result.status !== 0) failed = true;
}
await mkdir('docs/validation', { recursive: true });
await writeFile('docs/validation/latest-checks.txt', report);
if (failed) process.exitCode = 1;
