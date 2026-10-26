# Another device and Codex Cloud

## Fresh checkout

Install Git, Node.js 24 and pnpm 11.25.0 (`npm install --global pnpm@11.25.0` if needed). Use your normal secure GitHub sign-in/credential manager for pushes; never put tokens in repository files or remote URLs.

```sh
git clone https://github.com/RBNebula/Rack-Studio.git
cd Rack-Studio
pnpm install --frozen-lockfile
pnpm check
pnpm dev
```

Open `http://127.0.0.1:5173/`. `pnpm build` creates `dist/`; `pnpm preview` serves it on loopback port 4173. The Windows launcher uses a prior build, so build first. Required code, images and portable examples are committed; `node_modules` and `dist` are generated. No runtime environment variables or production credentials are needed.

Read `AGENTS.md` and `docs/PROJECT_STATUS.md`, then create a separate branch/check-out for each agent and use PR approval. Browser projects live in IndexedDB on one browser/origin; export/import versioned JSON to move them. GitHub does not sync unsaved application projects or agent chat history. Keep private exports outside the public checkout (or in ignored `.local-projects/`).

## Connect Codex Cloud through your account

Checked against [official OpenAI documentation](https://learn.chatgpt.com/docs/environments/cloud-environments) on 25 October 2026. Account/workspace availability and UI labels can vary. No new paid service, account or API key is required by this repository setup.

1. In Codex on web or desktop, start a task and choose **Work in > Cloud > Select environment > Create environment**. Alternatively use **Settings > Codex Cloud > Environments > Create environment**.
2. Connect GitHub when prompted and select `RBNebula/Rack-Studio`. Grant the GitHub connection access to this repository if it is missing from the list. Start from `main`.
3. Select **Get started**. Tell the setup agent: “Use Node 24 and pnpm 11.25.0; run `pnpm install --frozen-lockfile` then `pnpm check`; follow AGENTS.md. No application secrets are required.” Request package-manager network access for dependency installation.
4. For automated browser workflows where the environment permits browser processes, install with `pnpm exec playwright install --with-deps chromium` and use `RACK_BROWSER_CHANNEL=chromium pnpm test:e2e`. Browser/system dependency installation may require environment privileges. Official current Cloud documentation lists interactive computer/browser use as unsupported; do not assume that a passing local/Actions Playwright run verifies a specific Cloud environment. Report any browser execution restriction and use Actions for the browser gate.
5. Review the setup report, configuration and changed files, resolve unfinished setup, save changes and select **Publish**. After **Environment published**, select **Start a new task**.
6. First task: “Read AGENTS.md and docs/PROJECT_STATUS.md. Inspect the latest main and work on a new branch. Run relevant checks, update project status and open a PR; wait for my approval before merging.”

The [legacy Cloud environment guide](https://learn.chatgpt.com/docs/environments/cloud-environment) remains relevant for Code Review and GitHub/Linear integration environments; it is distinct from the current published-environment flow. Use the account's current Cloud UI rather than assuming an older setup-screen layout.

## Claude Code cloud sessions

`.claude/settings.json` registers `.claude/hooks/session-start.sh` as a synchronous SessionStart hook. It runs only when `CLAUDE_CODE_REMOTE=true`: it installs pnpm 11.25.0 if the container has another version (the container provides Node 22, which the manifest permits), runs `pnpm install --frozen-lockfile`, then installs the Chromium revision expected by the locked Playwright. The hook is idempotent and takes effect for new sessions once it is on `main`.

On 25 October 2026 the session's network policy blocked `cdn.playwright.dev`, so Playwright 1.64.1's Chromium 1248 could not be downloaded. The hook then links the container's newest pre-installed Chromium (1243) under the expected revision and prints a warning. With that fallback `pnpm check` passed and `pnpm test:e2e tests/lacing-bar.spec.ts` passed 2/2, but such runs use an older browser than CI and are not a substitute for the Actions browser gate. To use the exact revision, add `cdn.playwright.dev` to the environment's allowed domains (environment settings > Network access) and start a new session.

There is no machine-specific path required for install/build/test. The Windows convenience launcher has an optional Codex-runtime fallback, but ordinary PATH-provided Node is the primary path and the launcher is not needed in Cloud or CI. Private static hosting at `rackstudio.app` is described in `HOSTING.md`; hosted project storage and collaboration remain future decisions.
