# ETJS known issues and acceptance status

Status as of 2026-08-13. This file distinguishes an open defect from a fix that
is compiled and covered by regression tests but still needs a fresh visual or
gameplay check. The required check procedure is in [RUNBOOK.md](RUNBOOK.md).

Hard-refresh after a client rebuild. A stale `etjs.js` paired with a new wasm
can fail as `ASM_CONSTS[emAsmAddr] is not a function`.

## Open / externally blocked

- **Latest browser acceptance pass is pending.** The in-app browser currently
  has no attached browser session, so the newest WebAssembly build has not had
  its complete name → console → logos → menu → join → spawn visit captured.
  Source tests and builds pass, and earlier gameplay was checked by the project
  owner, but the changes marked “retest” below still need one hard-refresh run.
- **The original intro movie is not distributed.** The official paks available
  from Splash Damage do not contain `etintro.roq`. ETJS uses skippable official
  pak stills (`logo_id` → `logo_sd` → `et_logo`) instead.
- **Dynamic quality cannot change latched texture settings mid-match.** The
  selected startup profile controls texture resolution, filtering, compression,
  and antialiasing before WebGL starts. During play, the 30/60/120 FPS governor
  adjusts only live effects, shadows, decals, atmosphere, sky, and model LOD so
  it never forces a disruptive renderer restart.
- **A 120 FPS target requires a high-refresh browser/display.** On a 60 Hz
  display the governor may reach its minimum live-effects tier without being
  able to produce 120 presentation frames.

## Compiled fixes awaiting one fresh browser retest

### Startup and menus

- Play opens an ET-style startup console that streams real engine output. It
  uses the CC0 Modern DOS 8×16 font with light-gray text on desaturated blue.
- ANSI terminal controls and engine timestamps are removed from the web console,
  and the font is preloaded so raw `[0m` fragments and fallback typography do
  not obscure initialization output.
- The WebAssembly UI has a bounded 16 MiB menu-definition pool for ETJS's stock
  options/chat/voice/class/team tree; the former 8 MiB pool aborted while
  parsing `wm_class.menu`.
- SDL and the ET input bridge listen on the focusable game canvas rather than
  the browser window, so ordinary keys are consumed only after canvas capture.
  The normal in-game cursor remains active in menus without pointer lock.
  Ctrl/Cmd browser shortcuts bypass the game input bridge. Ctrl+Shift+R,
  Ctrl+R, Cmd+R, address-bar shortcuts, and developer tools can be used without
  ETJS cancelling their browser defaults; bare Ctrl remains a bindable ET key.
  Printable console/chat input cancels Firefox page actions, so `/` types into
  ET instead of opening Firefox Quick Find.
- The name form has remembered Maximum/Balanced/Performance/Minimum profiles,
  a dynamic-quality toggle, and 30/60/120 FPS targets.
- Company-logo stills remain visible until the engine reports MAIN ready.
- JOIN GAME is clickable without pointer lock. OPTIONS, CREDITS, EXIT, the
  Escape in-game menu, chat entry, voice menus, class/team menus, and the full
  options tree are loaded.
- Routine ETJS renderer/parser diagnostics are developer-only. Missing favorites
  cache and missing `menu2.wav` no longer spam the in-game console.
- `/config.json` publishes exact PK3 sizes, SHA-256 identities, and versioned
  same-origin URLs. IndexedDB keys include the content hash, so a deployment of
  a changed `etjs.pk3` cannot silently reuse an older announcer/data pak.
- The loading panel distinguishes cache checks, local cache reads, and actual
  ETJS network downloads. A hard refresh does not erase IndexedDB, and cached
  entries with the wrong byte length are repaired instead of trusted.
- Large PK3s download as sequential 16 MiB HTTP byte ranges into one destination
  buffer. The Node host serves validated `206`/`416` responses with exact
  `Content-Range` and `Content-Length`, avoiding a single 228 MB proxy response
  while retaining the browser's persistent cache.

### Rendering and HUD

- The sky-blue/mostly-sky world defect was fixed by restoring world drawsurfs,
  entity surfaces, the 3D depth state, proper shader stages, and lightmaps.
  The project owner confirmed the blue defect was fixed.
- Full official texture resolution is enabled (`r_picmip 0` on Maximum); the
  old browser-wide 128-pixel texture clamp is gone. Fragment UVs use high
  precision to prevent stretched single-column wall textures and lightmap
  shimmer as the camera moves.
- The WebGL 2D path now runs stretch pics, arbitrary polygons, rotated compass
  items, and gradients through ET's shader-stage evaluator. This restores
  per-stage blending, alpha, `tcMod` scrolling, animated menu clouds/lightning,
  and transparent crosshair/scope/binocular/foliage edges.
- HUD components use ETLegacy's aspect-correct 640×480 virtual space. A live
  browser resize now invalidates and recomputes cached anchors, keeping the
  crosshair, compass, edge HUD, overlays, and projected labels aligned with the
  3D view. Scope masks height-fit and binocular masks cover full viewport width.
- The stock compass minimap, scoreboard, names/stats, weapon HUD, construction
  entities, dropped equipment, mines, guns, turrets, dynamite, radio gear,
  players, and enemies all have active draw paths.
- Mortar projectiles orient to their gravity-adjusted travel vector rather than
  always pointing upward.

### Input, camera, and gameplay

- WASD, mouse look/fire, jump/crouch/prone/lean/sprint, weapon banks/wheel,
  reload, activate, limbo, scoreboard, stats, chat, team chat, voice menus,
  objectives, map zoom, Escape, and tilde have browser-to-engine key paths.
- A different dropped weapon is picked up with `+activate`, not by walking over
  it. The default is `F`; old partial saved configs are merged with the complete
  shipped bindings so Thompson pickup, T chat, and V voice remain present.
- Pointer lock releases for MAIN, limbo, death, intermission, and debrief. It no
  longer waits for a post-death shot before mouse look recovers.
- Follow-spectate interpolates player state and ignores local look for the
  followed entity. Other snapshot entities use ET's normal frame interpolation;
  bot smoothness still needs confirmation in the fresh visit.
- Deployment automatically taps out into one-second reinforcement waves instead
  of remaining forever at “deploying in 1 second.”
- Authoritative native qagame and browser prediction share 1.25× speed, double
  jump, and unlimited stamina. The dedicated container is verified to load the
  ETJS `qagame.mp.x86_64.so` rather than stock qagame.
- The supervisor reasserts `g_speed 400`, friendly fire off, forced respawn,
  and one-second reinforcement timers after ETLegacy's per-map config restores
  stock values. Live RCON verifies the authoritative values, not just startup
  arguments.
- Bot reconciliation permits only one in-flight pass and completes local RCON
  replies after a short quiet window. It no longer sends the unsupported
  `bot minplayers` command or floods the host log with overlapping add/tick
  output after the 12-slot target is reached.
- Original ETJS-owned Double Kill through Monster Kill voice clips are packaged
  separately from the official paks and play for rapid local enemy kills.

### rshook / aimbot

- Targets must be alive enemies, never teammates, and pass a world trace before
  selection. Visible nearby enemies rank ahead of farther targets.
- Aim uses server-relative command angles, a slightly lowered head point, pitch
  limits, finite-value checks, and maximum per-frame movement; it must not snap
  straight up/down or select a target behind a wall.
- Enemy players get an animated shader shell: blue when visible and red when
  occluded. Teammates do not glow. Enemy deployables and normally hidden mines
  receive the reveal shell.

## Confirmed by the project owner during this work

- The mostly sky-blue rendering failure is fixed.
- WASD/player movement works and the match is playable and fun.
- Wall visibility for rshook worked in an earlier pass.

## Confirmed by automated/runtime acceptance

- The local and public Cloudflare routes expose the same six-asset hashed
  manifest. A production-sized 16,777,216-byte public `pak0.pk3` range returned
  HTTP 206 with the correct total size, and its SHA-256 matched the identical
  byte range read from the pinned local official pak.
- Local `/health` and `/status` report a healthy Oasis Objective match with 12
  bots. The mounted native qagame and ETJS pak hashes match the host artifacts,
  and live RCON reports speed 400, friendly fire off, forced respawn, and
  one-second reinforcement times.

## Intentional product boundaries

- One shared 12-slot Objective match; Omni-Bot fills empty human slots.
- No Host Game, public master list, or server browser.
- ETLegacy and QuakeJS are ignored reference workspaces, not repository content.
- Original Wolf: ET PK3s/installers and generated wasm/native binaries are not
  committed. Setup fetches verified official data from Splash Damage.
- Campaign/Stopwatch/LMS/map vote, PunkBuster, ETPro, public hosting deployment,
  and the future Unraid image are not acceptance requirements for this phase.

## What the next good visit must prove

1. Name form is silent; Advanced settings remember profile, dynamic toggle, and
   FPS target.
2. Play shows the blue Modern DOS startup console with real initialization logs.
3. Logos and animated official MAIN appear with music; menu has no pointer lock.
4. JOIN GAME reaches loading and limbo without an injected connect command.
5. Pick a team and spawn; world remains solid and lit through movement/look.
6. Crosshair/HUD/labels align; Tab scoreboard, compass minimap, transparent
   overlays, players, constructions, and foliage render correctly.
7. WASD/mouse/fire work. F picks up a dropped Thompson. T opens chat, V opens
   voice, L toggles limbo, Escape opens options, and the debrief cursor moves.
8. Follow a moving bot and confirm smooth interpolation. Resize once while
   playing and confirm the HUD and 3D center stay aligned.
9. Toggle rshook: no teammates/occluded aim targets or vertical snaps; shells
   follow players/deployables and use blue-visible/red-hidden colors.
10. Confirm the chosen quality profile starts correctly and, when enabled, the
    governor stays at or above its selected target where hardware permits.
