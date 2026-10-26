# Claude Code agent team

Claude Code sessions in this repository can hand work to specialist subagents defined in `.claude/agents/`. Each agent follows `AGENTS.md`. The definitions add role-specific context.

| Agent | Handles |
| --- | --- |
| `device-modeller` | Photos, datasheets and measurements → importable device definitions in `library/*.library.json`, validated by `scripts/validate-library.mjs` |
| `cabling-engineer` | Connectivity, routing, guides/trays/looms, exits, lengths, schedules, cuts, procurement and the wiring UI |
| `documents-engineer` | Generated outputs (schedules, cut lists, procurement, labels, CSV/XLSX/PDF, elevations) and repository documentation |
| `test-engineer` | Independent verification of other agents' work; reproduces bugs, runs unit and browser suites, adds regression tests; never changes product code |

## How work flows

The main session is the coordinator. Subagents cannot start other subagents, so the coordinator does all routing:

1. The user asks the main session. It picks the specialist (or several for independent parts) and tells the user who has the work.
2. Each specialist implements, runs its own fast checks and ends its report with a **Test request**.
3. The coordinator passes every Test request to `test-engineer`.
4. On **FAIL**, the coordinator sends the findings back to the same specialist and repeats from step 2. On **PASS**, the coordinator reviews the diff, commits and pushes.

Users may also name an agent directly ("use the device-modeller on these photos"). The same test step follows.

## Parallel work

Run specialists in parallel only on independent tasks with no shared files, e.g. three different devices, or a report change alongside a routing fix in separate files. Run parallel agents that write code in isolated worktrees, and agree file ownership before starting (`AGENTS.md`, "Git and concurrent work"). Specialists do not commit, push or switch branches; the coordinator integrates their work on the session's branch.

## Device models

New device libraries go in `library/`, one definition per file. Import them in the app with **Import library** in the equipment library panel; the app gives each imported definition a new id. Anything private (customer or site names, serial numbers, workplace photos) goes in the ignored `.local-projects/library/` instead, because this repository is public. Dimensions come from user measurements or cited datasheets, never from photographs. Missing values stay labelled provisional.
