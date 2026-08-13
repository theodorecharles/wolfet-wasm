# wolfet-wasm

wolfet-wasm is an in-progress port of **Wolfenstein: Enemy Territory** to the browser. It combines a WebAssembly/WebGL build of [ET: Legacy](https://github.com/etlegacy/etlegacy), browser behavior learned from [QuakeJS](https://github.com/inolen/quakejs), server-side provisioning of the original Wolf: ET data from Splash Damage, and a Dockerized ET: Legacy dedicated server.

The intended product is the actual ET visit path in a browser: enter a name, download the official data, watch the logos, use the official main menu, click **JOIN GAME**, choose a team in limbo, and play one shared 12-slot Objective match. Omni-Bot fills every slot not occupied by a human. There is intentionally no server browser or Host Game flow.

The core browser match is implemented and playable. The latest rendering, HUD, input, and adaptive-quality changes still need the fresh browser acceptance pass listed in [KNOWN_ISSUES.md](KNOWN_ISSUES.md). [RUNBOOK.md](RUNBOOK.md) is the authoritative validation procedure.

## Repository boundary

The repository contains wolfet-wasm-owned browser/server code, tests, build glue, runtime configuration, and the browser-port patch against a pinned ET: Legacy revision. It does **not** contain:

- either full upstream checkout (`etlegacy/` and `quakejs/` are ignored workspaces);
- the original Wolf: ET installers or PK3 files;
- ET: Legacy runtime PK3s or the dedicated-server image;
- generated WebAssembly, native helper binaries, logs, player sessions, or local credentials.

`patches/etlegacy-wasm.patch` is the source of truth for the current engine port. `npm run setup:engine` clones ET: Legacy at commit `a44ab4f396370a694109da33df901d85f6fe9626` and applies that patch. QuakeJS is only an optional reference checkout.

## Prerequisites

- Linux
- Node.js 18 or newer
- Git, CMake, Ninja, a C/C++ compiler, curl, unzip, and ImageMagick
- Docker with permission to pull and run images
- Emscripten/emsdk and Ninja when rebuilding the browser client

The host's initial game-data provision is about 276 MB. A browser later transfers roughly 262 MB from the wolfet-wasm host on a cold visit and caches PK3s in IndexedDB. Browsers never download directly from Splash Damage.

## Setup

```bash
npm install
npm run playwright:install
npm run setup
```

`npm run setup` does five things:

1. clones the pinned ET: Legacy source and applies the browser-port patch;
2. downloads the official Linux game archive on the host from [Splash Damage](https://www.splashdamage.com/games/wolfenstein-enemy-territory/), verifies fixed SHA-256 checksums, and extracts only the required data and web assets;
3. extracts the matching ET: Legacy data PK3 from the pinned dedicated-server image and builds the native Huffman helper;
4. packages project-owned announcer assets separately from the original game data;
5. builds the matching native qagame module used by the dedicated server, so browser prediction and authoritative movement use the same rules.

The original game data remains ignored and local. Downloading and using it is subject to the Wolfenstein: Enemy Territory license included in Splash Damage's installer.

`npm start` also runs the checksum-based data provisioner before opening the
HTTP service. Missing or invalid official data is fetched on the server; valid
cached files are reused. The web client only sees same-origin paths such as
`/etmain/pak0.pk3` and `/legacy/legacy_v2.84.0.pk3`. The host publishes exact
content hashes and byte counts in `/config.json`; large PK3s transfer in 16 MiB
HTTP ranges and changed content receives a new persistent browser-cache key.
Hard refreshes do not clear that IndexedDB cache. The loading panel reports
cache checks and cached reads separately from real wolfet-wasm network downloads.

Activate Emscripten, then build the browser client:

```bash
source /path/to/emsdk/emsdk_env.sh
npm run build:web
```

The first build configures `etlegacy/build-web`; later builds reuse that configuration, as required by the runbook. To recreate only the optional QuakeJS reference workspace:

```bash
npm run reference:quakejs
```

## Run and verify

```bash
npm test
ETJS_KEEP_DED=1 npm start
```

Open <http://127.0.0.1:8088/>. The server also exposes `/health`, `/status`, and the `/ws` WebSocket-to-UDP game proxy. The dedicated server listens on UDP 27961 by default.

Before Play, the name gate's **Advanced settings** selects a Maximum, Balanced,
Performance, or Minimum graphics ceiling. Dynamic quality can be disabled or
assigned a 30, 60, or 120 FPS target. The target is a quality-governor goal,
not a frame-rate cap; 120 FPS requires a high-refresh browser/display.

The RCON password is read from `ETJS_RCON` when set. Otherwise wolfet-wasm creates a random local password in the ignored `runtime/.rcon-password` file. Do not expose that file or commit runtime logs.

Useful commands:

```bash
npm run setup:data       # revalidate/fetch ignored game and ETL data
npm run setup:engine     # prepare or verify the patched ET: Legacy checkout
npm run build:tools      # rebuild tools/huffpack
npm run build:pak        # package project-owned sounds/data
npm run build:server-mod # rebuild/deploy native qagame movement rules
npm run build:web        # rebuild etjs.js + etjs.wasm
npm run test:e2e
```

Automated tests are guardrails, not acceptance evidence. A fix is complete only after following the real visit path and the before/after screenshot loop in the runbook.

## Architecture

```text
browser
  HTML name gate + asset cache + input bridge
    -> same-origin /etmain and /legacy data served by Node
    -> patched ET: Legacy client (WebAssembly + WebGL 2)
    -> WebSocket /ws
Node host
    -> checksum-based provisioning from Splash Damage when local data is absent
    -> one UDP socket per browser client
    -> ET protocol UDP 27961
Docker
    -> pinned ET: Legacy dedicated server
    -> one shared Objective match
    -> Omni-Bot keeps humans + bots at 12
```

## Licensing and trademarks

The ET: Legacy-derived engine modifications are distributed under the repository's GPLv3 license and the additional Wolf ET source terms in [LICENSE](LICENSE). Original game data is not distributed here. Wolfenstein: Enemy Territory and related marks and assets belong to their respective owners. wolfet-wasm is an independent community project and is not affiliated with or endorsed by Splash Damage, id Software, Bethesda, or Microsoft.
