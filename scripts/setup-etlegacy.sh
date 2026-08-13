#!/bin/sh
# Prepare the pinned ET: Legacy source tree and apply the ETJS WebAssembly port.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ETLEGACY_DIR="${ETJS_ETLEGACY_DIR:-$ROOT/etlegacy}"
UPSTREAM_URL="https://github.com/etlegacy/etlegacy.git"
UPSTREAM_REF="a44ab4f396370a694109da33df901d85f6fe9626"
ETJS_PATCH="$ROOT/patches/etlegacy-wasm.patch"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required" >&2
  exit 1
fi
if [ ! -f "$ETJS_PATCH" ]; then
  echo "missing ETJS engine patch: $ETJS_PATCH" >&2
  exit 1
fi

if [ ! -d "$ETLEGACY_DIR/.git" ]; then
  if [ -e "$ETLEGACY_DIR" ]; then
    echo "$ETLEGACY_DIR exists but is not a Git checkout" >&2
    exit 1
  fi
  git clone --filter=blob:none "$UPSTREAM_URL" "$ETLEGACY_DIR"
  git -C "$ETLEGACY_DIR" checkout --detach "$UPSTREAM_REF"
fi

ACTUAL_REF="$(git -C "$ETLEGACY_DIR" rev-parse HEAD)"
if [ "$ACTUAL_REF" != "$UPSTREAM_REF" ]; then
  echo "ET: Legacy is at $ACTUAL_REF; ETJS requires $UPSTREAM_REF" >&2
  exit 1
fi

if git -C "$ETLEGACY_DIR" apply --reverse --check "$ETJS_PATCH" >/dev/null 2>&1; then
  echo "ETJS engine patch is already applied at $ETLEGACY_DIR"
  exit 0
fi

if [ -n "$(git -C "$ETLEGACY_DIR" status --porcelain)" ]; then
  echo "ET: Legacy checkout has unrelated changes; refusing to overwrite them" >&2
  exit 1
fi

git -C "$ETLEGACY_DIR" apply --check "$ETJS_PATCH"
git -C "$ETLEGACY_DIR" apply "$ETJS_PATCH"
echo "applied ETJS engine patch to ET: Legacy $UPSTREAM_REF"
