# Testing Rack Studio

Use Node 24 and pnpm 11.25.0; install with `pnpm install --frozen-lockfile`. The manifest also permits compatible Node 22.13+ and 26+ lines. No runtime secrets or environment file is required.

## Commands

| Command | What it checks |
| --- | --- |
| `pnpm typecheck` | TypeScript strict checking with no emitted files |
| `pnpm lint` | Existing ESLint/TypeScript/React hook rules |
| `pnpm test` | Vitest `src/**/*.test.ts` using the Node environment; migration baseline 302 tests in 23 files, 325 in 24 files after the power-and-weight feature, 336 with its added verification cases, 350 in 25 files after the Power & Weights document, 359 with its added verification cases 386 after the connector-lead bend-radius and gendered IEC coupler fixes, and 387 with their added verification case; the branch baseline was 400 in 27 files, and 424 in 27 files after the distributor total output limit |
| `pnpm build` | Typecheck then Vite production bundle in ignored `dist/` |
| `pnpm check` | Typecheck, lint, unit/integration tests and build, stopping on failure |
| `pnpm test:e2e` | All real-pointer Playwright workflows in `tests/` |
| `pnpm exec playwright test tests/lacing-bar.spec.ts` | Example targeted browser run |
| `pnpm format:check` | Existing Prettier check; separate from CI check, report any existing failures |
| `node scripts/validate-examples.mjs` | Parse portable project/library examples and validate references/placement; writes `docs/validation/example-integrity.txt` |
| `node scripts/validate-library.mjs <file>…` | Validate equipment library files: schema, unique port ids, ports within face/chassis, front and rear placement at U1 in the empty example rack (placement skipped for shelf/freestanding/side/custom mounting). Writes nothing |
| `node scripts/benchmark.mjs` | Existing synthetic geometric smoke benchmark, not full browser FPS/stress acceptance |

`scripts/verify.mjs` is an alternative sequential verifier that writes `docs/validation/latest-checks.txt`; it has per-command 120-second limits. Do not use generated historical evidence as a substitute for rerunning relevant checks.

## Browser setup

On Windows the existing default is installed Microsoft Edge (`msedge`). On Linux the default is bundled Chromium. Install it and its Linux system dependencies before testing:

```sh
pnpm exec playwright install --with-deps chromium
pnpm test:e2e
```

For Windows bundled Chromium, run `pnpm exec playwright install chromium`, then `$env:RACK_BROWSER_CHANNEL='chromium'` and `pnpm test:e2e`. `RACK_BROWSER_CHANNEL` selects a supported Playwright browser channel; the special value `chromium` uses the bundled browser. CI explicitly selects it. Browser execution requires process-launch, loopback and WebGL support; SwiftShader launch arguments support software rendering.

`playwright.config.ts` runs one worker, 1600×1000 headless, and starts Vite at `http://127.0.0.1:5173`. With `CI=true` an existing server is not reused, focused tests are rejected, and execution stops with a failing exit code at the first failure so its complete diagnostic reaches the log. Failure traces are retained; the workflow uploads `test-results/` for three days. Retries are not added. The full suite remains selected; later tests are unrun after a CI failure, not accepted as passing. Free port 5173 before a CI-style run. Most specs accept optional `RACK_TEST_URL` (e.g. `http://127.0.0.1:5174`) to target a separately started immutable production preview. The configured webServer still starts/checks 5173. Use the default URL for a uniform full-suite run.

Browser workflows cover placement, shelves, construction, persistence/recovery, port connections, designer/tray controls, rails, wiring, modelling/assemblies, generic switch, copy-as-new, rotation, lacing/rear placement power banks/weights (`tests/power.spec.ts`) the Power & Weights document, its CSV and print layout (`tests/power-report.spec.ts`), and explicit bend radii and gendered IEC coupler rules (`tests/cable-rules.spec.ts`). Tests write screenshots under `docs/screenshots/`; preserve/review existing evidence before accepting updates. These are workflow captures, not an automated pixel-comparison regression suite. CI screenshots are ephemeral and do not change repository commits.

## Geometry and collision validation

Pure tests cover U grids/sections, chassis/ear/rail contact on both faces, shelf bearing and independent construction, oriented geometry/attachments, rail travel, port transforms/rotation, obstacles and routing, guides/shared runs, length breakdowns, continuous cut allocation, schema integrity and atomic state changes. For geometry changes assert contact versus penetration numerically, both front/rear transforms, stable IDs and unchanged dependent schedules. Inspect appropriate browser views as well. Rendered holes may use conservative solid collision proxies; never infer physical passage from appearance alone.

## Baseline, failures and coverage

The 25 October migration's pre-change `pnpm check` passes: 302 tests across 23 files, typecheck, lint and build. See `MIGRATION.md` for browser/final/fresh-checkout evidence and actual GitHub Actions outcome. Previous accepted 29-workflow Edge run is retained in `validation/lacing-bar-browser-results.txt` and must be distinguished from current runs. Any environment-related execution failure must be reported separately from application assertions.

No instrumented coverage percentage is configured or measured, and no coverage threshold should be invented. Gaps include complete global cable interaction/physical dynamics, surveyed hardware, install/fastener animations, full section 21 end-to-end acceptance, calibrated visual baselines and full browser FPS/memory stress tests. Existing `benchmarks/geometric-smoke.json` is limited synthetic evidence. Extend meaningful domain and browser coverage alongside new behavior.

The migration's optional `pnpm format:check` fails on existing formatting in `src/engineering/routing.ts`. That source is preserved byte-for-byte; the required type/lint/unit/build checks pass. Formatting is not silently added as a passing CI gate. Browser execution also emits existing Three.js deprecation warnings for `Clock` and `PCFSoftShadowMap`; record failures separately from these warnings.

The first completed Linux Chromium run ([40227251797](https://github.com/RBNebula/Rack-Studio/actions/runs/40227251797)) is **not a passing browser baseline**. Install/type/lint/302 tests/build passed, but six workflows failed: connector rotation, shelf placement, sliding rails, generic switch, adjacent-rack assemblies and photographed-PC front/rear placement. Sixteen other workflows passed before the 20-minute job limit cancelled the run during wiring; the remaining workflows did not complete. The interrupted reporter did not print its final assertion details. CI now stops at the first failure and retains a trace to make diagnosis efficient. All 29 local Edge workflows passed; do not generalise that result to Linux.

A full local `pnpm test:e2e` on 26 October 2026 (Claude Code cloud session, fallback Chromium 1243, without `CI=true`) gave 29 passed and 6 failed. Five failures are on the baseline list above (shelf placement, sliding rails, generic switch, adjacent-rack assemblies, photographed-PC placement); connector rotation passed. The sixth, `tests/workflows.spec.ts` custom definition save/reload, fails because the Device Library tab is restored after reload so the canvas is absent; it fails identically before the power, report and cabling changes and is tracked with the Linux baseline. All six are timeouts or missing elements, not routing or connectivity assertions.

UI polish branch, 27 October 2026 (Claude Code cloud session, Chromium 1248, one spec file per invocation, without `CI=true`). Unmodified `main` (1f20feb) first gave 37 passed and 4 failed: device rails, adjacent-rack assemblies, attached clips/vehicle endpoint and photographed-PC placement, all screenshot timeouts. The final branch head gave 36 passed and 7 failed. Five are screenshot (`waiting for fonts to load`) or `page.reload` 10 s timeouts: device rails, adjacent-rack assemblies, photographed-PC placement, generic shelf placement and connector rotation. Generic switch failed on a `page.reload` timeout, and the custom-definition save/reload workflow failed on the documented restored-Library-tab issue. None is a behaviour assertion. `page.reload` timeouts also occur on `main`: connector rotation failed 2 of 5 repeated runs there and 4 of 5 on the branch, where reloads measured roughly 1–2 s slower (9.5–11 s against 8.6–8.9 s) with no difference in retained heap. That margin is within run-to-run noise but is recorded as a possible small regression. A label race introduced by the docked drawer, where a port pin could be clicked at a pre-resize position, was found by `cable-rules` and fixed: it passed 4 of 4 repeats afterwards.

After the five-tab navigation (option 3) the full suite, one spec file per invocation, gave 38 passed and 5 failed. The failures were four screenshot timeouts (generic shelf placement, device rails, adjacent-rack assemblies, photographed-PC placement) and the documented restored-Library-tab save/reload issue. Grouped views are opened in tests through `tests/navigation.ts` (`openView`), which clicks the parent tab and then the view. PR CI stops at the first failure; on this branch that was the known Linux generic-shelf placement workflow.

Single top bar, File menu, view cube and Installed sidebar tab (28 October 2026): the full suite, one spec file per invocation, gave 39 passed and 3 failed, after fixing one missed test click. The failures were the screenshot timeouts in device rails, adjacent-rack assemblies and photographed-PC placement, which also fail on `main`. Tests drive the File menu, camera views and installed equipment through `tests/navigation.ts` (`fileAction`, `fileItem`, `setView`, `viewState`, `selectInstalled`).

To keep runs short and their output small: `pnpm test:e2e:quick` uses the dot reporter, the dev server's echoed browser console is no longer copied into test output, and a single spec can be run with `pnpm exec playwright test tests/<name>.spec.ts --reporter=line`. Since the 3D canvas renders on demand (28 October 2026) the full local suite takes about 16 minutes instead of about 25. In that run 36 passed and 5 failed: page-reload or screenshot timeouts in generic-switch, user-rack-pc:192 and visual-references:206, the documented restored-Library-tab workflow, and a mounting pan regression from on-demand rendering. The mounting regression was fixed and then passed 6/6. The device-rails and adjacent-rack screenshot timeouts no longer occur.

Since the retired equipment was removed (28 October 2026) the app starts empty. Unit tests import the original example from `src/testing/legacy-example.ts`. Browser tests load it through **File → Import** with `openExample()` in `tests/navigation.ts`, using `tests/fixtures/example-project.rack.json`. That fixture is generated by `node scripts/make-test-fixtures.mjs` with test-only `qa-…` definition ids, so the retired-equipment strip leaves it intact.

The STEP import test uses `tests/fixtures/test-unit.stp`, a synthetic model (body, front port, hidden board) written by `node scripts/make-step-fixture.mjs`. Manufacturer CAD files are not committed.

The `Validate` GitHub workflow runs locked installation, typecheck, lint, unit/integration tests, production build and Chromium workflows on main pushes/PRs, with dependency-store caching, one Linux job and no failure suppression. It can also be started manually. A successful upload is not a test result.
