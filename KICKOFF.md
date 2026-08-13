# ETJS kickoff goal

## Outcome

Deliver one authentic, stable browser visit in which a player can enter a name, download the official data, see the real startup sequence, click **JOIN GAME**, select a team, remain in a correctly rendered 3D world, move and fire, use limbo and settings, and resize the window without corrupting the view.

The runbook is authoritative for how work is accepted. This document orders the current work; it does not replace [RUNBOOK.md](RUNBOOK.md) or [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## Non-negotiable invariants

- Exercise the real user path. Never inject `connect`, `etjs_joingame`, or an engine call to skip a broken stage.
- Preserve official ET menus, loading, HUD, maps, teams, classes, and gameplay semantics.
- Keep the product to one shared 12-slot Objective match, with bots yielding one-for-one to humans.
- Diagnose and fix causes. A synthetic overlay, hardcoded camera, disconnected mock, or one lucky still is not a fix.
- Hard-refresh after every client rebuild so `etjs.js` and `etjs.wasm` always match.
- Capture comparable screenshots and relevant logs before and after every visual or interaction fix.
- Keep original game data, generated artifacts, credentials, logs, and player state out of Git.

## Baseline at repository kickoff

- The Node static host, health/status endpoints, WebSocket-to-UDP proxy, Docker dedicated server, and bot-fill supervisor exist.
- Name capture, official-data preload and IndexedDB caching, menu/loading music, basic menu flow, canvas startup, and input bridging exist.
- The dedicated server runs Objective Oasis and can maintain a 12-bot empty match.
- The ET: Legacy WebAssembly port is preserved as a patch against a pinned upstream commit.
- The structural/unit suite currently passes, but it does not prove end-to-end playability.
- The last observed real-path failure is at or after team selection: the client may exhaust its hunk and return to MAIN. When a world frame survives, mouse movement can destabilize camera/rendering, and normal movement/fire/menu input remains unreliable.

## Ordered execution plan

### 1. Make startup and spawn deterministic

Acceptance evidence from one cold visit:

1. name form, silent;
2. official-data progress, silent;
3. each skippable logo with music;
4. official MAIN with a clickable JOIN GAME and working tilde console;
5. official loading with music;
6. spectator limbo;
7. Allies or Axis selection plus OK leaves the client alive in the world.

Immediate investigation targets:

- Reproduce the `Hunk_AllocateTempMemory` failure through the real click path and record the allocation, hunk totals, connection state, and transition that requests it.
- Prove that the 128 MB browser hunk setting reaches initialization before cgame/UI allocation; remove any later fallback to 48 MB.
- Check whether redundant menu/audio assets are decoded into the Wasm heap during the transition.
- Confirm startup catchers and splash state transition exactly once and do not reopen MAIN after cgame initializes.

Do not move to aspect/graphics acceptance until team selection consistently leaves a living client in 3D.

### 2. Lock canvas and engine aspect together

Acceptance evidence:

- narrow, wide, and live-resized screenshots at MAIN and in-world;
- CSS canvas size, backing-buffer size, and engine `vidWidth x vidHeight` recorded and equal after each resize;
- no 4:3 bars, skewed art, or orange uncovered region.

Investigation targets are the browser resize bridge, `ETJS_SetResolution`, SDL/glconfig state, and UI 640x480 scaling. Do not mask mismatches with letterboxing.

### 3. Stabilize the 3D renderer and camera

Acceptance evidence at the same location:

- initial stationary frame;
- frame after the first mouse movement;
- 90-degree turn;
- movement/free-spectator frame;
- close/reopen-limbo frame;
- spawned-player frame.

Every frame must retain world geometry, depth, textures, and lightmaps without blue holes. Instrument camera origin/angles, follow flags, visible leaves, submitted draw surfaces, depth state, and lightmap stage selection. Determine whether remaining failures originate in camera state or rendering before changing either.

After geometry is stable, implement missing shader texmods such as the official cloud scroll and evaluate filtering separately from correctness.

### 4. Unify and complete input/UI state

Acceptance evidence in one visit:

- WASD changes player or free-spectator origin;
- mouse1 produces attack down and up and fires;
- L opens limbo, closes, and opens it again;
- Escape opens the real in-game settings tree;
- a changed bind persists across reload;
- local look never rotates a followed remote player;
- other players' body/head orientation follows networked state correctly.

Trace one browser event through the exported ETJS bridge, engine key state, bind execution, key catcher, cgame usercmd, and server-observed state. Remove competing input paths only after proving which path owns each transition. Load the required official in-game menu/options trees instead of clearing their catchers every frame.

## Per-issue work record

For every issue, record:

- exact run date, client build identity, browser viewport, and whether data came from a cold cache;
- the first failing step in the authentic visit path;
- before screenshot/log and a concise root-cause statement;
- source change and why it addresses that cause;
- same-place after screenshot/log;
- regression test added when the behavior can be tested below the browser level;
- remaining uncertainty or the next failing class.

## Definition of complete

The goal is complete only when a cold and a warm visit both satisfy the runbook's one-visit definition of done, the narrow/wide/live-resize checks pass at menu and in-world, the automated suite passes, the dedicated match still replaces bots one-for-one, and the repository can be recreated from a clean clone using the documented setup commands without committed original game data.
