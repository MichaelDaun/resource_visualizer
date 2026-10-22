#!/bin/bash
# Installs dependencies when a Claude Code cloud session starts, so tests,
# builds and screenshots work right away.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
npm ci --no-audit --no-fund
