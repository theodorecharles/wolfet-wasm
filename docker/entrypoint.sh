#!/bin/sh
set -eu

case "$(uname -m)" in
  x86_64|amd64) ;;
  *)
    echo "wolfet-wasm: this image supports amd64 only (found $(uname -m))" >&2
    exit 1
    ;;
esac

APP_ROOT="/opt/wolfet-wasm"
DATA_ROOT="${ETJS_DATA_ROOT:-/data}"
SEED_ROOT="$APP_ROOT/seed/runtime"

mkdir -p "$DATA_ROOT/runtime/etmain" "$DATA_ROOT/runtime/legacy" \
  "$DATA_ROOT/runtime/omni-bot-user" "$DATA_ROOT/web/img" \
  "$DATA_ROOT/web/sound/music"

# Seed text configuration only when absent so a persistent volume remains
# user-editable. Project binaries and data are refreshed on every image start.
cp -an "$SEED_ROOT/." "$DATA_ROOT/runtime/"
install -m 0755 "$SEED_ROOT/legacy/qagame.mp.x86_64.so" \
  "$DATA_ROOT/runtime/legacy/qagame.mp.x86_64.so"
install -m 0644 "$SEED_ROOT/legacy/etjs.pk3" \
  "$DATA_ROOT/runtime/legacy/etjs.pk3"

if [ -f "$DATA_ROOT/runtime/omni-bot-user/omni-bot.cfg" ]; then
  install -m 0644 "$DATA_ROOT/runtime/omni-bot-user/omni-bot.cfg" \
    /legacy/server/legacy/omni-bot/et/user/omni-bot.cfg
fi

export ETJS_DATA_ROOT="$DATA_ROOT"
export ETJS_LEGACY_PAK_SOURCE="/legacy/server/legacy/legacy_v2.84.0.pk3"
export ETJS_EMBEDDED_DED=1
export ETJS_DED_BIN="/legacy/server/etlded"
export ETJS_DED_PORT="${ETJS_DED_PORT:-27960}"
export ETJS_HTTP_PORT="${ETJS_HTTP_PORT:-8088}"
export ETJS_OMNIBOT="${ETJS_OMNIBOT:-1}"

echo "wolfet-wasm: validating game data in $DATA_ROOT"
sh "$APP_ROOT/scripts/fetch-game-data.sh"
echo "wolfet-wasm: starting browser runtime on tcp/$ETJS_HTTP_PORT and udp/$ETJS_DED_PORT"

exec "$@"
