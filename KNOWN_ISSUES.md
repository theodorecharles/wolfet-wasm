# ETJS known issues

What is still wrong as of 2026-08-13. Grouped the way you run into it, not by file.

**How to work these:** [RUNBOOK.md](RUNBOOK.md) — start the real game, screenshot the failure, fix the cause, screenshot the same place, repeat. Separate loops for startup, aspect, in-game 3D/blue, and input. Do not inject connect to “see the world.”

Hard-refresh after a client rebuild. Stale `etjs.js` + new wasm shows up as `ASM_CONSTS[emAsmAddr] is not a function`.

---

## In the match (what you are hitting now)

### World / picture

- **Blue / sky through the world.** After spawn or after closing limbo the canvas often goes to the sky-blue clear with holes in the map, or only brief triangle flashes. Dual-tex lightmaps are on; a lot of the remaining blue is the camera sitting in the void or looking into the floor/sky.
- **Looks okay until the mouse moves.** The first spectator/world frame can look decent. Any mouse move then wrecks it — view slams (often pitch toward −85 from the last limbo click), you clip through geometry, and the blue comes back. Same family of bug as “look locks down.”
- **Menu/world clouds do not scroll.** Official `et_clouds` uses `tcMod scroll`. The ES2 renderer never runs texmods, so the MAIN background is a still photo.
- **Menu art is softer than desktop ET.** `r_picmip` is now 0; leftover blur is stretch-to-window + ES2 filtering, not the old picmip-1 soup.
- **Connect flash can still show ET Legacy branding.** The renderer splash draw is disabled on WASM; the official ETL load panel / fonts can still leak “LEGACY” during map load.

### Movement, shoot, limbo, Escape

- **WASD does not move you.** Command can reach the engine (`etjs_fwd=127`) while origin stays put. Causes we have actually seen:
  - leftover `KEYCATCH_UI|CGAME` marking the cmd as talk (pmove zeroes move)
  - spawn / spectator view in solid or looking into the void
  - you are in **follow-spectate** (right-click cycles players). In that mode WASD is not free-fly; you have to leave follow / open limbo and pick a team. Free-fly spectator is also supposed to work and currently often does not.
- **Mouse1 does not shoot.** Same leftover-catcher / not-really-spawned / follow-spectate problems. First in-world click also used to only grab pointer lock; that path was changed so lock + attack should both happen once you are actually in the world.
- **L does not open limbo.** You can close limbo (click) but L does nothing. The page only falls back to `openlimbomenu` if the engine key call *fails*. If the call succeeds, the bind is supposed to run — and often does not, because cgame never sees it or catchers get stripped the next frame.
- **Escape does not open the in-game menu.** Two stacked reasons:
  1. Every in-world frame currently **clears `KEYCATCH_UI` and `KEYCATCH_CGAME`** unless limbo is flagged open. Even if Escape opened the official ingame UI, the next frame would kill it.
  2. We only load the slim official MAIN (`JOIN GAME / OPTIONS / CREDITS / EXIT`). Desktop `ingame.menu` + options / binds / crosshair trees are **not** loaded, so there is nothing useful for Escape to show yet.
- **Right-click still cycles who you spectate.** That bind is working. It is also why it feels like “the only thing that works.”
- **Spectator mouse can still steer the followed player.** Local look is supposed to no-op on `PMF_FOLLOW` (4096). If your mouse move is rotating the person you are watching, that guard is not winning.
- **Other players’ bodies do not face their look.** Models can stay on a default yaw; spectate look must not turn *their* head.

### Team pick / staying in the world

- **Limbo OK can crash the client out of the match.** Playwright: Allies click works, OK then `Hunk_AllocateTempMemory: failed on 1958832` (hunk is 48MB). Engine drops, MAIN comes back. That is why a “successful join” still does not leave you playing. Fix in flight: raise client hunk toward the desktop 128MB default (512MB wasm heap is supposed to have room).

---

## Startup / menu

- **Company-logo splash is easy to miss.** Official `etintro.roq` is **not** in Steam ET or the paks we ship. We draw skippable pak0 stills (`logo_id` → `logo_sd` → `et_logo`). The engine used to open MAIN on frame 0 and skip them; that is gated on `etjs_splash==2` now. If you still never see logos, say so after a hard refresh.
- **JOIN GAME used to highlight and not click.** Cause: MAIN was activated *before* the 640×480 background, so focus sat on a decoration; plus pointer lock on the first menu click froze the cursor (“input devices captured”). Official JOIN is `{22,48,116,18}` in 640-space. Playwright can click it and get `connect 127.0.0.1:27961`. If your browser still cannot, hard-refresh — do not inject connect.
- **OPTIONS / CREDITS / EXIT do not do the desktop thing.** OPTIONS has no options tree loaded. CREDITS has no credits menu. EXIT only plays a click.
- **Tilde / `` ` `` from MAIN** is supposed to send engine `K_CONSOLE` (297), not ASCII 96 into the UI. Confirm after refresh if the console still refuses to drop.
- **No Host Game / no server browser.** Intentional. JOIN GAME is the only connect.

---

## Window / hosting

- **Aspect must follow the window like QuakeJS**, not a 4:3 letterbox. Canvas backbuffer = `#viewport-frame` size; engine `r_mode -1`. If you still get a **skewed** picture when the window is narrow, or an **orange strip** (`.70 .63 .49`) when it is wide, the engine `vidWidth/Height` is not matching the CSS box.
- **Cloudflare free orange-cloud caps downloads at 100MB.** `pak0.pk3` is ~228MB. Public first load on `wolfet.tedcharles.net` fails unless that host is grey-cloud or paks bypass the proxy.
- **This laptop is only the game host** (`0.0.0.0:8088`, `/ws` → UDP 27961). nginx/SSL live on the other box. Unraid Docker is later.

---

## Sound / persist

- **`sound/misc/menu2.wav` missing** (item hover). Focus sound errors in the console; not fatal.
- **HTML `menu_server.wav`** is the menu/loading music. It must not start on the name form. If the engine also decodes the 4.7MB wav into the wasm heap, first-frame memory dies.
- **Binds** persist in `localStorage` (`etjs.binds`). **Paks** persist in IndexedDB. `localStorage` cannot hold pak0.

---

## Engine / tab death (mostly fixed, still landmines)

- **`Array buffer allocation failed`** — wasm `Memory.grow` copies old+new heap. Stay inside 512MB `INITIAL_MEMORY`. Do not raise the small zone (512KB). Do not decode huge TGAs/wavs on frame 0.
- **`ASM_CONSTS[emAsmAddr] is not a function`** — stale `etjs.js` with a new wasm. One `ETJS_ASSET_VER`, `Cache-Control: no-store`, hard refresh.
- **Do not reconfigure cmake.** A reconfigure has dropped required Emscripten GL flags before.

---

## Intentionally not in scope

Campaign, Stopwatch, LMS, map vote, public masters, PunkBuster, ETPro, pixel-perfect every BSP curve, a full objective round, nginx on this laptop, Unraid image, opening from `file://`, injecting `etjs_joingame` / `connect` to “see the world.”

---

## What a good visit looks like (so you can tell what is still broken)

1. Web name form, XP ET icon, **silence**
2. Download official paks, **silence**
3. Skippable company logos + `menu_server.wav`
4. Official MAIN (stormy clouds, eagle, JOIN GAME) + music; no pointer lock; tilde console
5. Click **JOIN GAME** only
6. Official connect/loading + music
7. Spectator limbo → pick team + OK → world **stays**
8. WASD moves origin, mouse1 fires, L toggles limbo, Escape opens settings that persist

If you stop before step 7, say which step. If you get in and only right-click works, that is the “in the match” block above.
