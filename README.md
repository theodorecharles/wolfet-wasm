# wolfet-wasm

wolfet-wasm is an in-progress port of **Wolfenstein: Enemy Territory** to the browser. It combines a WebAssembly/WebGL build of [ET: Legacy](https://github.com/etlegacy/etlegacy), browser behavior learned from [QuakeJS](https://github.com/inolen/quakejs), server-side provisioning of the original Wolf: ET data from Splash Damage, and a Dockerized ET: Legacy dedicated server.

The intended product is the actual ET visit path in a browser: enter a name, see the real engine startup console while same-origin game data is prepared, arrive directly at the official main menu, click **JOIN GAME**, choose a team in limbo, and play one shared 12-slot Objective match. Omni-Bot fills every slot not occupied by a human. There is intentionally no server browser or Host Game flow.

The core browser match is implemented and playable. Automated tests cover the reproducible build, browser input bridge, rendering guardrails, server provisioning, and deployment image; final graphics and gameplay acceptance still requires a real browser playthrough.

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

## Docker image

The self-contained deployment image supports `linux/amd64`. It includes the
WebAssembly client, Node host, patched native game module, and the pinned ET:
Legacy/Omni-Bot runtime. It does not include Wolf: ET's proprietary game data.

Build and run it locally:

```bash
docker build --platform linux/amd64 -t wolfet-wasm:local .
docker run --rm --name wolfet-wasm \
  -p 8088:8088/tcp \
  -p 27960:27960/udp \
  -v wolfet-wasm-data:/data \
  wolfet-wasm:local
```

On the first start, the container downloads the official archive directly from
Splash Damage, verifies its pinned SHA-256 checksums, and installs the required
files beneath `/data`. A named volume preserves both the downloaded archive and
the extracted runtime data, so later starts only perform checksum validation.
Open <http://127.0.0.1:8088/> after the container reports that the dedicated
server is ready.

The GitHub workflow publishes `${DOCKERHUB_USERNAME}/wolfet-wasm:dev` from
`devel` and `${DOCKERHUB_USERNAME}/wolfet-wasm:latest` from `master`. Configure
these repository secrets before running it:

- `DOCKERHUB_USERNAME`: the Docker Hub account or organization name;
- `DOCKERHUB_TOKEN`: a Docker Hub personal access token with write access.

The workflow exits successfully with a setup message when the secrets have not
been configured, and can be run manually after they are added.

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

Live play uses the stock communication controls: **T** opens global chat,
**Y** opens team chat, and **V** opens the voice menu. The level-end debrief has
its own always-ready chat field and a clickable **QUICK CHAT** voice button, so
all letters remain typeable there. In the engine console, **Up/Down** traverse
command history and Backspace/Enter edit and submit commands.

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

Automated tests are guardrails, not acceptance evidence. Rendering and gameplay changes still need a real visit from the name gate through MAIN, loading, limbo, spawn, play, and debrief.

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
ET: Legacy dedicated server
    -> pinned native runtime (separate container for local npm development;
       embedded in the deployment image)
    -> one shared Objective match
    -> Omni-Bot keeps humans + bots at 12
```

## Licensing and trademarks

The ET: Legacy-derived engine modifications are distributed under the repository's GPLv3 license and the additional Wolf ET source terms in [LICENSE](LICENSE). Original game data is not distributed here. Wolfenstein: Enemy Territory and related marks and assets belong to their respective owners. wolfet-wasm is an independent community project and is not affiliated with or endorsed by Splash Damage, id Software, Bethesda, or Microsoft.
