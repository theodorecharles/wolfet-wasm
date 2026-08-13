# wolfet-wasm runbook

What this project is supposed to do, and how to fix it without guessing.

The game should be **the actual game** in a browser: official paks, official MAIN, official loading, official HUD, one shared 12-slot Objective match (bots fill empty slots). The only product difference is no Host Game / no server browser — **JOIN GAME** connects to the one match.

The visit path is always:

1. Web name form + optional Advanced graphics settings (XP ET icon, **no music**)
2. Play opens the blue Modern DOS startup console and streams real engine logs
3. Browser downloads official paks from this ETJS host (**no music**)
4. Official MAIN + music (no synthetic logo/splash sequence)
5. Click **JOIN GAME**
6. Official connect/loading + music
7. Spectator limbo → pick team + OK → 3D world stays
8. WASD moves, mouse1 fires, F activates/picks up, T opens global chat,
   Y opens team chat, V opens voice, Tab shows scores, L opens limbo, and
   Escape opens settings

The browser must never fetch from Splash Damage. At host startup the server
checks its ignored local data and invokes the pinned, checksum-verifying Splash
Damage fetcher only if it needs to provision or repair that cache. Browsers then
receive the files from same-origin `/etmain/` and `/legacy/` URLs.

Never inject `etjs_joingame` / `connect` to “see the world.” If the real sequence is black or hangs, that is the bug.

---

## The loop (do this for every class of bug)

This is the only accepted way to work. Screenshot → diagnose the **cause** → fix that cause → start the game again → screenshot the same place. Repeat until that class looks and plays right. Do not declare a class done from a unit test or a single still of the menu.

```
start the real game
    → take a screenshot of the thing that is wrong
    → name the underlying cause (not the symptom)
    → fix that cause
    → start the real game again
    → screenshot the same place
    → still wrong? repeat
    → looks right? move to the next class
```

Four classes, in this order. Later classes are meaningless if you cannot get into a stable 3D view.

| Order | Class | Done when |
| --- | --- | --- |
| 1 | **Startup** | Name/settings → console → host data → MAIN → JOIN → loading → limbo, no skip, no hang |
| 2 | **Aspect** | Window resize: canvas + engine resolution = the window. No 4:3 bars, no skew, no orange strip |
| 3 | **Graphics** | In-game 3D stays map geometry + lightmaps after you look around. No sky-blue holes |
| 4 | **Input** | WASD changes origin, mouse1 fires, L toggles limbo, Escape opens settings, look does not wreck the picture |

Hard-refresh after every client rebuild. Stale `etjs.js` + new wasm is `ASM_CONSTS[emAsmAddr] is not a function`.
A hard refresh reloads code but does not erase IndexedDB. The asset panel must
say whether files came from the local cache or ETJS; a changed content hash
downloads exactly that changed asset once.

Local: `http://127.0.0.1:8088/`
Public: `https://wolfet.tedcharles.net/` (this laptop is only `:8088`; nginx is the other box)

---

### 1. Startup sequence

**Wanted:** the path above, direct transition from startup console to MAIN, music from MAIN through loading, JOIN GAME as the only connect, tilde on MAIN, and no pointer lock on the menu.

**Loop:**

1. Open the real page. Screenshot the name form (XP icon, silence). Expand
   Advanced and confirm profile, dynamic toggle, and 30/60/120 target persist.
2. Click Play. Screenshot the desaturated-blue startup console: light-gray
   Modern DOS text must be real initialization output, not a canned animation.
3. Screenshot the download bar (still silence). Network requests must be
   same-origin `/etmain/` or `/legacy/`, never `splashdamage.com`. `pak0.pk3`
   should arrive as sequential `206` responses no larger than 16 MiB; reload
   after changing `etjs.pk3` and confirm its SHA-keyed cache entry changes.
4. Confirm it goes directly to MAIN (animated clouds, eagle, JOIN GAME) and starts music.
5. Click JOIN GAME. Screenshot loading + music, then limbo.
6. If any step is black, ETL-on-black, highlight-without-click, or a hang, fix **that** step. Do not jump to connect.
7. Repeat from step 1 until a cold visit walks the whole path.

**Forbidden:** `Cbuf_AddText("connect…")`, `etjs_joingame` from Playwright, `Module.ccall` join. Those shots do not count.

---

### 2. Aspect / window

**Wanted:** QuakeJS behavior. The canvas fills the window. On resize, set the backbuffer to `#viewport-frame` size and tell the engine (`r_mode -1` / `ETJS_SetResolution`). World, menu, and HUD use that resolution. No 4:3 letterbox.

**Loop:**

1. Start through MAIN (and later, the 3D view).
2. Screenshot a **narrow** window. Circles / the eagle must not look stretched like a 4:3 frame CSS-scaled.
3. Screenshot a **wide** window. No orange (`.70 .63 .49`) strip to the right of a 640-wide menu.
4. Screenshot after a live resize. The engine `vidWidth×vidHeight` must match the CSS box.
5. If it skews or leaves a gap, fix resize / `glconfig` / UI scale — do not add black bars.
6. Repeat until narrow, wide, and live-resize all look right on **menu, HUD, and world**.

Reference: `quakejs/bin/index.ejs` `resizeViewport()`.

---

### 3. Graphics (the blue)

**Wanted:** after limbo closes, the canvas is oasis (or the current Objective map) with lightmaps. Looking around does not open sky-blue holes. Mouse look must not be the thing that “turns the graphics on/off.”

**Loop:**

1. Start the real game. Get to a 3D view (spectator is fine for the first pass; spawned is the bar).
2. **Do not move the mouse.** Screenshot the 3D view. Mark every blue hole, missing face, and washed unlit wall.
3. **Move the mouse.** Screenshot again. If it only breaks after look, the camera/pitch/follow path is the cause — not “the map has no textures.”
4. Hold still, turn 90°, screenshot. Walk or free-spec if you can, screenshot. Close and reopen limbo, screenshot.
5. Fix the **cause** of those blue pixels:
   - camera in the void / pitch slammed (often −85 leftover from a limbo click)
   - spectator follow applying local look
   - depth test left off after 2D/limbo
   - lightmap stage skipped
   - faces never submitted
6. Start the game again. Same spots, before and after mouse move. Repeat until a full look-around stays map, not sky.

A menu screenshot is not a graphics pass. A world shot taken after injecting connect is not a graphics pass.

---

### 4. Input

**Wanted:** it plays like ET. QuakeJS is the input reference (one path through the engine; lock on click only in-world; mouse down **and** up; tilde is `K_CONSOLE`).

**Loop:**

1. Start the real game into the match (or free spectator if spawn is still broken).
2. Screenshot / log **WASD**: origin must change, not just `etjs_fwd=127`.
3. Screenshot / log **mouse1**: `+attack` while in-world.
4. Aim at a dropped Thompson and press **F** (`+activate`): it is picked up.
5. Hold **Tab**: names and stats appear. During live play, **T** opens global
   chat, **Y** opens team chat, and **V** opens the voice menu. At debrief, click
   its global/team/fireteam selector and type into its built-in chat field;
   every letter including T, Y, and V must work. Click **QUICK CHAT** for the
   debrief voice menu. Verify Backspace and Enter edit/send, and that every
   debrief button works with its visible cursor.
6. Open the console: `/` types normally, Backspace edits, Enter executes, and
   Up/Down move through command history.
7. Press **L**: limbo opens. Close it, press L again: it opens again.
8. Press **Escape**: in-game settings (binds, crosshair). Change one bind, reload, it stuck.
9. Look while **following**: the followed player’s head does not turn with your mouse.
10. Die and respawn: look works without first firing and retains the full pitch range.
11. If only right-click (next spec) works, that is not “input done.”
12. Fix the cause (catchers eating keys, binds never issued, lock stealing menu clicks, follow look). Start again. Repeat until all of the above work in one visit.

---

### 5. HUD, entities, and overlays

**Wanted:** the stock HUD is aligned with the 3D view at every aspect ratio. The
crosshair has transparent edges and sits at the real view center; player labels
sit on their players. Tab scoreboard and compass minimap are present. Scope,
binocular, and mortar masks fill the correct window axis without stretching.

In one spawned and one follow-spectator pass, confirm players, enemies, radio
equipment, dropped weapons, foliage edges, mines, dynamite, construction
materials, mounted guns, turrets, and other deployables are visible. Follow a bot
long enough to judge interpolation. Resize while the HUD is visible and repeat
the center/label/overlay checks after the resize.

---

### 6. Quality governor

Start once with each graphics profile and inspect `window.__etjsQuality` when
debugging. Maximum is the ceiling and begins with full-resolution textures,
trilinear/anisotropic filtering, detailed geometry, dynamic lights, shadows,
atmosphere, and full sky. Dynamic quality may step only live settings down and
back up; it never raises quality above the selected profile and never restarts
the renderer during a match.

Test the 30, 60, and 120 targets. These are minimum performance goals rather
than caps. Use a high-refresh display for meaningful 120 FPS acceptance. A
source test or cvar dump proves configuration, not sustained visual performance.

---

## How to start and rebuild

```bash
# first checkout only (fetches ignored game data and prepares ET: Legacy)
npm install
npm run setup

# npm start also validates/provisions missing server-side game data
ETJS_KEEP_DED=1 npm start    # HTTP :8088 + dedicated UDP 27961

# rebuild each owned layer after changing it
npm run build:pak
npm run build:server-mod
source /path/to/emsdk/emsdk_env.sh
npm run build:web
```

Then hard-refresh the browser. This does not clear the persistent game-data
cache; do not interpret “checking” or “loading cached” as a network transfer.

Host acceptance must also check the authoritative process, not only config
files: `/health` returns 200, `/status` reports Oasis with 12 total players,
the container log shows the mounted `qagame.mp.x86_64.so` loaded successfully,
and RCON reports `g_speed 400`, `g_friendlyFire 0`, `g_forcerespawn 1`, and both
team reinforcement timers at `1000`. Leave the supervisor running for several
intervals; an unchanged roster should not print a line every 1.5 seconds.
`/config.json` must list six same-origin assets with exact byte counts and
64-character SHA-256 values. A request for `Range: bytes=8-39` on `pak0.pk3`
must return `206`, 32 bytes, and `Content-Range: bytes 8-39/228138631`.

Playwright (real path only): `npm run test:e2e`
In-repo tests: `npm test`
Tests do not replace the screenshot loop.

---

## Definition of done (one visit)

A person can: enter a name, choose/persist graphics settings, see the real startup
console, receive data only from the wolfet-wasm host, reach MAIN directly, click JOIN GAME, pick
a team, and look around a solid lit map. In the same visit they can move/fire,
pick up with F, use live T/Y/V communication, type and send debrief chat, open
debrief QUICK CHAT, see scores with Tab, use limbo and settings, see every
entity/HUD/overlay class above, respawn with normal mouse
look, and resize without moving the crosshair or projected labels away from the
3D view. The chosen dynamic target responds without a renderer restart.

Until that happens, keep looping the class that is still wrong.
