#!/bin/bash
# Prepares a Claude Code cloud session so `pnpm check` and `pnpm test:e2e` run.
# See docs/TESTING.md for the toolchain and docs/CLOUD_SETUP.md for context.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

PNPM_VERSION=11.25.0
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

if [ "$(pnpm -v 2>/dev/null || true)" != "$PNPM_VERSION" ]; then
  npm install --global "pnpm@$PNPM_VERSION"
  hash -r
fi

pnpm install --frozen-lockfile

# Playwright needs the Chromium revisions its locked version expects.
browsers_path="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
read -r chromium_rev shell_rev < <(node -e "
  const { createRequire } = require('module');
  const path = require('path');
  const req = createRequire(createRequire(require.resolve('@playwright/test')).resolve('playwright/package.json'));
  const { browsers } = require(path.join(path.dirname(req.resolve('playwright-core/package.json')), 'browsers.json'));
  const rev = (name) => browsers.find((b) => b.name === name).revision;
  console.log(rev('chromium'), rev('chromium-headless-shell'));
")

if [ -d "$browsers_path/chromium-$chromium_rev" ] && [ -d "$browsers_path/chromium_headless_shell-$shell_rev" ]; then
  exit 0
fi

if pnpm exec playwright install chromium; then
  exit 0
fi

# The environment's network policy may block cdn.playwright.dev. Fall back to the
# newest Chromium pre-installed in the container so browser workflows can still run;
# results then come from an older browser build than CI uses.
link_latest() {
  local prefix=$1 rev=$2 latest
  [ -e "$browsers_path/$prefix-$rev" ] && return 0
  latest=$(find "$browsers_path" -maxdepth 1 -name "$prefix-[0-9]*" -printf '%f\n' | sort -t- -k2 -n | tail -1)
  if [ -z "$latest" ]; then
    echo "session-start: no pre-installed $prefix found; browser workflows unavailable" >&2
    return 0
  fi
  ln -s "$browsers_path/$latest" "$browsers_path/$prefix-$rev"
  echo "session-start: WARNING $prefix-$rev unavailable; linked $latest instead" >&2
}
link_latest chromium "$chromium_rev"
link_latest chromium_headless_shell "$shell_rev"
