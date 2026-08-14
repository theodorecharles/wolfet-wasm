#!/bin/sh
set -eu

PROJECT_ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
FRAMEWORK_ROOT="${WASM_GAME_FRAMEWORK_DIR:-}"

if [ -z "$FRAMEWORK_ROOT" ]; then
  for candidate in \
    "$PROJECT_ROOT/../wasm/wasm-game-framework" \
    "$PROJECT_ROOT/../wasm-game-framework"
  do
    if [ -x "$candidate/scripts/install-browser-package.sh" ]; then
      FRAMEWORK_ROOT="$candidate"
      break
    fi
  done
fi

if [ -z "$FRAMEWORK_ROOT" ] || [ ! -x "$FRAMEWORK_ROOT/scripts/install-browser-package.sh" ]; then
  echo "Set WASM_GAME_FRAMEWORK_DIR to a wasm-game-framework checkout." >&2
  exit 1
fi

"$FRAMEWORK_ROOT/scripts/install-browser-package.sh" \
  "$PROJECT_ROOT/web/shared-shell" copy
