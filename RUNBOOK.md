# ETJS runbook

What this project is supposed to do, and how to fix it without guessing.

The game should be **the actual game** in a browser: official paks, official MAIN, official loading, official HUD, one shared 12-slot Objective match (bots fill empty slots). The only product difference is no Host Game / no server browser — **JOIN GAME** connects to the one match.

The visit path is always:

1. Web name form (XP ET icon, **no music**)
2. Download official paks (**no music**)
3. Skippable company logos + menu music
4. Official MAIN + music
5. Click **JOIN GAME**
6. Official connect/loading + music
7. Spectator limbo → pick team + OK → 3D world stays
8. WASD moves you, mouse1 fires, L opens limbo, Escape opens settings

Never inject `etjs_joingame` / `connect` to “see the world.” If the real sequence is black or hangs, that is the bug.

Issue inventory: [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

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
| 1 | **Startup** | Name → download → logos → MAIN → click JOIN → loading → limbo, no skip, no hang |
| 2 | **Aspect** | Window resize: canvas + engine resolution = the window. No 4:3 bars, no skew, no orange strip |
| 3 | **Graphics** | In-game 3D stays map geometry + lightmaps after you look around. No sky-blue holes |
| 4 | **Input** | WASD changes origin, mouse1 fires, L toggles limbo, Escape opens settings, look does not wreck the picture |

Hard-refresh after every client rebuild. Stale `etjs.js` + new wasm is `ASM_CONSTS[emAsmAddr] is not a function`.

Local: `http://127.0.0.1:8088/`
Public: `https://wolfet.tedcharles.net/` (this laptop is only `:8088`; nginx is the other box)

---

### 1. Startup sequence

**Wanted:** the path above, music from splash through loading, skippable logos like the real intro, JOIN GAME is the only connect, tilde works on MAIN, no pointer lock on the menu.

**Loop:**

1. Open the real page. Screenshot the name form (XP icon, silence).
2. Play. Screenshot the download bar (still silence).
3. Screenshot each logo, then MAIN (clouds, eagle, JOIN GAME). Confirm music.
4. Click JOIN GAME. Screenshot loading + music, then limbo.
5. If any step is black, ETL-on-black, highlight-without-click, or a hang, fix **that** step. Do not jump to connect.
6. Repeat from step 1 until a cold visit walks the whole path.

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
4. Press **L**: limbo opens. Close it, press L again: it opens again.
5. Press **Escape**: in-game settings (binds, crosshair). Change one bind, reload, it stuck.
6. Look while **following**: the followed player’s head does not turn with your mouse.
7. If only right-click (next spec) works, that is not “input done.”
8. Fix the cause (catchers eating keys, binds never issued, lock stealing menu clicks, follow look). Start again. Repeat until all of the above work in one visit.

---

## How to start and rebuild

```bash
# first checkout only (fetches ignored game data and prepares ET: Legacy)
npm install
npm run setup

# already running is fine
ETJS_KEEP_DED=1 npm start    # :8088 + dedicated 27961

# after client/ui/cgame/renderer edits — do not reconfigure cmake
source /path/to/emsdk/emsdk_env.sh
npm run build:web
```

Then hard-refresh the browser.

Playwright (real path only): `npm run test:e2e`
In-repo tests: `npm test`
Tests do not replace the screenshot loop.

---

## Definition of done (one visit)

A person (or Playwright acting as a person) can: enter a name → see logos → click JOIN GAME → pick a team → look around a solid lit map → walk with WASD → fire → open limbo with L → open settings with Escape. Resize the window at the menu and in-game; nothing skews or grows an orange slab.

Until that happens, keep looping the class that is still wrong.
