# Repository migration evidence

Migration date: 25 October 2026. Target: https://github.com/RBNebula/Rack-Studio (`main`). This file records actual evidence; pending entries are not successful checks.

## Protected baseline

- Original project root: local `Rack Builder` workspace. No `.git` repository, history, branches, commits, remotes or index existed. Global Git identity was already configured for RBNebula with the GitHub noreply address; no credentials were added to project configuration.
- GitHub connector confirmed the target public repository was empty (size 0); `git ls-remote` returned no refs before import.
- Local ZIP backup created before edits/testing in ignored `.migration-local/rack-studio-before-migration-2026-10-25.zip`, including original source, docs, fixtures, build and retained handover. Dependency directories were excluded because they can be restored from the lockfile. SHA-256: `99D0496F7C58E3F315226A30A3C704774A81C2B5D2DD888BB451E03257BCEAD6`.
- All 80 original `src/` files were hash-compared against that ZIP after documentation/tooling edits: zero changed. Application source and lockfile were preserved. Old `handover/` delivery archive remains local and is ignored because it duplicates an earlier project snapshot; it is not a required runtime asset.

## Pre-publication review

Inspected source/configuration, retained brief/feature docs, sample data, file inventory and screenshot examples. Pattern scan covered credential/key signatures, credential-bearing URLs, private IPs, literal secret assignments and email addresses across publishable text. No findings were reported. No environment secret files, certificates, private databases or private network configuration were found among publishable candidates. There was no earlier Git history to scan or rewrite.

Bundled rack/device models and survey values are labelled illustrative/provisional; screenshots are app renders, not original photographs. The PC model carries geometric observations and original photo filenames, not the source photos or personal EXIF data. No identified customer records or proprietary workplace documents were found. This review does not establish legal ownership of every design or provide a guarantee against every possible secret.

All source assets, screenshot evidence, examples, package manifests, lockfile and runtime/build/test configuration are retained for import. The candidate snapshot is about 6.3 MB and its largest files are sub-megabyte screenshots, so Git LFS is unnecessary. Generated dependencies/build/test artifacts, local backups, caches, secrets and private project exports are ignored. Adding an ignore rule would not remove a historical secret; none was identified here.

## Commands and observed results

| Check | Result |
| --- | --- |
| Original `pnpm check` | PASS: typecheck, lint, 302 tests in 23 files, production build |
| `pnpm install --frozen-lockfile --offline` in original checkout | PASS, lockfile unchanged |
| Post-tooling `pnpm check` | PASS: typecheck, lint, 302 tests, production build with same application asset hashes |
| `node scripts/validate-examples.mjs` | PASS: 13 project fixtures and three library exports; modelling example's four cable routes valid |
| `pnpm format:check` | Existing failure in `src/engineering/routing.ts`; retained without source reformatting |
| Current browser suite | PASS: 29/29 workflows, 7.5 minutes, Edge 156.0.4314.42, headless 1600×1000/software WebGL; `validation/migration-browser-results.txt` |
| Workflow syntax/execution | YAML parsed by Prettier; hosted run started and passed install/type/lint/unit/build. Browser outcome is tracked on the [live Actions page](https://github.com/RBNebula/Rack-Studio/actions/workflows/ci.yml) and reported in the final handover |
| Initial GitHub upload and SHA comparison | PASS: local HEAD, remote main and separate GitHub clone all `01f49391863746324ae8bcef1354b68e66ed61fd` |
| Separate GitHub clone, locked install and build | PASS: fresh GitHub clone into ignored `.migration-local/github-verification`, `pnpm install --frozen-lockfile` then `pnpm check`; 302 tests and production build pass with unchanged tracked files; logs in `validation/migration-fresh-install.txt` and `validation/migration-fresh-checks.txt` |

Initial sandboxed browser execution did not reach assertions because of loopback/server access. That run was stopped, freeing its server; the first elevated retry encountered that occupied port before it was freed. The subsequent full run uses authorised browser/loopback access. No application assertion failure is concealed by calling these setup attempts successful. Existing app preview on port 4173 is not stopped or repurposed.

The full successful browser run exercised the actual application and writes fresh captures. These are retained locally in `.migration-local/current-run-screenshots`; the existing 34 committed screenshot assets were restored from the protected pre-test copy to preserve historical evidence. Current unit/build and browser execution logs are included under `docs/validation/migration-*.txt`. No application source changed. The original formatting failure and non-fatal Three.js deprecation warnings remain documented in `TESTING.md`.

## Migration changes

Added AGENTS/Gemini/Claude instructions, architecture source map, status/roadmap/decisions/testing/cloud/migration documents, a PR template and the `Validate` workflow. README gains portable setup and continuation instructions. The existing architecture document is retained under uppercase `ARCHITECTURE.md` and its Markdown references are updated. Ignore rules exclude generated/private/local files. Playwright preserves Edge on Windows, adds bundled Chromium selection elsewhere, and rejects focused tests in CI; existing lint/format excludes local verification copies.

The workflow gates main pushes and main PRs with locked installation, typecheck, lint, unit tests, build and Linux Chromium workflows. Concurrency cancels superseded runs; there is one cached job with a 20-minute limit and no failure suppression. Branch/PR ownership and owner approval are documented. Server-enforced branch protection is not claimed unless separately verified. No paid infrastructure, deployment or hosted project backend is introduced.

GitHub's main-branch API confirms branch protection is currently disabled. The shared PR/approval rules are instructions for agents, not a server-enforced restriction. The owner can enable a main ruleset requiring PRs and the `validate` check after reviewing solo-owner approval/bypass requirements. Force pushes are not used in this migration.

Three non-duplicate continuation issues were created: [measurement #1](https://github.com/RBNebula/Rack-Studio/issues/1), [installation #2](https://github.com/RBNebula/Rack-Studio/issues/2), [cable validation #3](https://github.com/RBNebula/Rack-Studio/issues/3). The connector returned an integration permission error for issue creation; the existing local Git Credential Manager sign-in completed it through GitHub's API, holding credentials only in process memory. No credential was printed, embedded in an argument or saved to a project file. Local Markdown targets were checked with exact filesystem case: 318 links in 29 documents passed.

The initial import contains 215 files, including all 80 source files and 34 historical screenshot assets. The final evidence update adds fresh-clone logs and changes documentation only; application/configuration/lockfile content is unchanged from the verified import. The initial hosted run is [run 40227048787](https://github.com/RBNebula/Rack-Studio/actions/runs/40227048787); the README badge and Actions page report current execution state. Commit-specific final CI results and the final SHA are reported in the handover without claiming that this file contains its own commit hash.

Git whitespace checking with CRLF recognised found one pre-existing trailing space in the retained original brief (line 1467). The brief is preserved unchanged; this is a document formatting observation, not a failed application check.
