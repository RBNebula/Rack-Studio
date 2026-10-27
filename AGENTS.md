# Shared instructions for coding agents

## Start here

Read `docs/PROJECT_STATUS.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/TESTING.md` and the relevant feature guide before editing. Check Git status, branch, recent commits and existing issues/PRs. Preserve uncommitted work. Read `docs/requirements.md` and `docs/acceptance.md` for the retained acceptance scope; earlier conversation is not required project context.

Rack Studio is a local-first browser application for 3D rack/equipment design, physical connectivity, geometric cable routing, cable schedules, continuous cuts and procurement. This is a working foundation with substantial verified functionality, not a completed physical simulator.

## Stack and boundaries

React 19, TypeScript 6, Vite 8, Three.js with React Three Fiber/Drei, Zustand and Zod. IndexedDB stores projects. pnpm 11.25.0 and its committed lockfile install dependencies; Node 24 is the standard development/CI runtime. Vitest tests pure domain/state logic; Playwright exercises real browser workflows. Use the existing ESLint/Prettier policy.

- `src/model.ts` defines the versioned serialisable domain graph. Stable IDs, references and legacy defaults must survive import/export, copy, undo and reload.
- `src/engineering/` owns pure model calculations. Rendering projects that data; do not store authoritative geometry or connections only in Three.js objects.
- `src/state.ts` applies atomic validated edits and undo/redo. A drag preview must not mutate the authoritative project before commit.
- Keep changes focused. Preserve existing capabilities and examples; do not reorganise architecture or upgrade packages incidentally.

## Geometry and cable rules

Use millimetres internally; convert only at the scene boundary. Y points up, Z rearwards, and +X appears left in the front view. U1 starts at Y=0; U pitch is 44.45 mm. Rack screw-plane spacing, exterior envelope and device ear-plane depth are independent measurements. Inclusive U sections cover each U exactly once.

Front/rear mounting must transform chassis, ears, ports and connector directions together. Ear bearing faces contact rail surfaces without penetration. Keep shelves/support relationships and rail travel solids consistent between rendering, placement and routing. Never infer measured geometry, manufacturer compatibility or hardware dimensions from a catalogue outline or photograph. Preserve evidence/provisional labels.

Cable endpoints use stable physical identities. Route samples rendered by the scene must match validated geometry without extra smoothing. Preserve lead directions, bend checks, clearance, route-follow relationships and guide order. Invalid/unknown routes must stay diagnostic and must not become zero-length cuts. Fixed preterminated lengths remain fixed; bulk allowances and surveyed versus positioned external routes must not be double-counted. Geometric routing is not gravity/tension/flexible cable physics. Global cable collision and full installation animations remain open.

## Validation and continuity

Run `pnpm check` for code changes (typecheck, lint, 429 baseline unit/integration tests, production build). Run relevant Playwright workflows for UI/scene/interaction changes and the full suite for cross-system geometry/routing changes; see `docs/TESTING.md`. Add meaningful regression coverage when behavior changes. Never suppress failures or claim checks that did not run. Numeric geometry assertions must cover both mounting faces and relevant transforms; visual success alone is insufficient.

After major work update `docs/PROJECT_STATUS.md`; update architecture, decisions, roadmap and feature guides as relevant. Record actual commands/results and remaining limits. Keep `docs/progress.md` as the historical milestone log. Screenshots are evidence, not proof of physical accuracy. Tests write tracked screenshots: review changes and retain only intentional evidence updates.

## Git and concurrent work

The initial migration is the one-time import to `main`. Afterwards `main` is the stable integration branch; ordinary work uses feature/fix/test branches and pull requests.

1. Fetch and inspect the appropriate latest base. Create a separate checkout/worktree and unique branch, e.g. `feature/cable-schedules`, `fix/cable-collisions`, `test/cable-routing`.
2. Agree file ownership when concurrent agents overlap. Never let agents make uncoordinated edits on one branch or in one working directory.
3. Implement, validate, update documents, commit and push the branch. Open a PR describing the behavior and actual test results, linking its issue where applicable.
4. Wait for the user's approval before merging unless automatic merging was explicitly authorised. Do not push ordinary development directly to `main`.

Inspect others' changes, reconcile conflicts preserving intended behavior, and rerun relevant checks. Never force push, reset hard, clean away work, or overwrite another agent's branch. Use a few meaningful GitHub Issues for real bugs/milestones; search for duplicates. Branch rules are documented conventions unless GitHub protection is explicitly verified as enabled.

This repository is public. Never commit credentials, private workplace designs, customer data, local databases or private project exports. `.gitignore` does not remove historical secrets; if discovered, stop publication and notify the user. Keep decisions and progress in the repository; agent chats do not automatically synchronise.
