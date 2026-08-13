#!/bin/sh
# Build the native qagame module that shares ETJS movement rules with the WASM client.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT/etlegacy"
BUILD="$SOURCE/build-etjs-server"
OUTPUT="$BUILD/legacy/qagame.mp.x86_64.so"
DEST="$ROOT/runtime/legacy/qagame.mp.x86_64.so"

if [ ! -d "$SOURCE/.git" ]; then
  echo "ET: Legacy source is not prepared; run: npm run setup:engine" >&2
  exit 1
fi
if ! command -v cmake >/dev/null 2>&1 || ! command -v ninja >/dev/null 2>&1; then
  echo "cmake and ninja are required to build the dedicated game module" >&2
  exit 1
fi

mkdir -p "$BUILD" "$ROOT/runtime/legacy"
if [ ! -f "$BUILD/CMakeCache.txt" ]; then
  cmake -S "$SOURCE" -B "$BUILD" -GNinja \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_CLIENT=OFF \
    -DBUILD_SERVER=OFF \
    -DBUILD_CLIENT_MOD=OFF \
    -DBUILD_SERVER_MOD=ON \
    -DFEATURE_DBMS=OFF \
    -DFEATURE_LUA=OFF \
    -DFEATURE_LUAJIT=OFF \
    -DFEATURE_OMNIBOT=ON
fi

cmake --build "$BUILD" --target qagame -j"$(nproc)"
install -m 0755 "$OUTPUT" "$DEST"
echo "wrote $DEST"
