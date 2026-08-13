'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PAK0 = path.join(ROOT, 'runtime', 'etmain', 'pak0.pk3');
const OBJDATA = path.join(ROOT, 'etlegacy', 'etmain', 'maps', 'oasis.objdata');
const CLASSES = path.join(ROOT, 'etlegacy', 'src', 'game', 'bg_public.h');
const CG_DRAW = path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_draw.c');
const TR_WORLD = path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_world.c');
const TR_BACKEND = path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_backend.c');

function extractFn(src, name) {
  const startRe = new RegExp('(?:void|static void)\\s+' + name + '\\s*\\(');
  const m = src.match(startRe);
  assert.ok(m, name + ' must exist');
  let i = m.index + m[0].length;
  let pdepth = 1;
  while (i < src.length && pdepth > 0) {
    if (src[i] === '(') {
      pdepth++;
    } else if (src[i] === ')') {
      pdepth--;
    }
    i++;
  }
  while (i < src.length && src[i] !== '{') {
    i++;
  }
  assert.ok(i < src.length, name + ' body not found');
  const start = m.index;
  i++;
  let depth = 1;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') {
      depth++;
    } else if (src[i] === '}') {
      depth--;
    }
    i++;
  }
  return src.slice(start, i);
}

describe('shipped ET identity (teams, classes, official oasis)', () => {
  it('serves official pak0.pk3 containing oasis.bsp', () => {
    assert.ok(fs.existsSync(PAK0), 'pak0.pk3 on search path');
    const listing = execFileSync('unzip', ['-l', PAK0], { encoding: 'utf8' });
    assert.match(listing, /maps\/oasis\.bsp/);
  });

  it('ships Allies/Axis and the five class ids in the game code the client links', () => {
    const src = fs.readFileSync(CLASSES, 'utf8');
    assert.match(src, /TEAM_AXIS/);
    assert.match(src, /TEAM_ALLIES/);
    assert.match(src, /PC_SOLDIER/);
    assert.match(src, /PC_MEDIC/);
    assert.match(src, /PC_ENGINEER/);
    assert.match(src, /PC_FIELDOPS/);
    assert.match(src, /PC_COVERTOPS/);
    assert.match(src, /#define NUM_PLAYER_CLASSES\s+5/);
  });

  it('ships an Objective-mode official map cycle', () => {
    const cycle = fs.readFileSync(path.join(ROOT, 'runtime', 'etmain', 'objectiverotate.cfg'), 'utf8');
    assert.match(cycle, /g_gametype 2/);
    assert.match(cycle, /map oasis/);
    assert.match(cycle, /map battery/);
    assert.match(cycle, /map goldrush/);
    assert.match(cycle, /map radar/);
    assert.match(cycle, /map railgun/);
    assert.match(cycle, /map fueldump/);
    assert.match(cycle, /nextmap/);
    assert.doesNotMatch(cycle, /g_gametype 4/);
    assert.doesNotMatch(cycle, /campaign /);
    const launcher = fs.readFileSync(path.join(ROOT, 'server', 'dedicated.js'), 'utf8');
    assert.match(launcher, /objectiverotate\.cfg/);
    assert.match(launcher, /g_gametype',\s*'2'/);
  });

  it('ships oasis objective scripts the dedicated server map uses', () => {
    const obj = fs.readFileSync(OBJDATA, 'utf8');
    assert.match(obj, /wm_mapdescription axis/);
    assert.match(obj, /wm_mapdescription allied/);
    assert.match(obj, /75mm/);
    const script = fs.readFileSync(path.join(ROOT, 'etlegacy', 'etmain', 'maps', 'oasis.script'), 'utf8');
    assert.match(script, /oasis/i);
  });
});

describe('no overlay theater in the shipped draw path', () => {
  const world = fs.readFileSync(TR_WORLD, 'utf8');
  const backend = fs.readFileSync(TR_BACKEND, 'utf8');
  const draw = fs.readFileSync(CG_DRAW, 'utf8');
  const shade = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_shade.c'), 'utf8');

  it('forbids ETJS overlay markers and the hardcoded oasis camera', () => {
    const blob = world + backend + draw + shade;
    assert.doesNotMatch(blob, /ETJS_RB_DrawWorld/);
    assert.doesNotMatch(blob, /ETJS_DrawFirstPerson/);
    assert.doesNotMatch(blob, /ETJS_DrawSafeWorld/);
    assert.doesNotMatch(backend, /R_ES2_DrawSafeWorld\s*\(/);
    assert.doesNotMatch(blob, /8867\.f/);
    assert.doesNotMatch(blob, /CG_FillRect\s*\(\s*shift\s*,\s*168/);
  });

  it('CG_Draw2D uses the stock HUD path', () => {
    const fn = extractFn(draw, 'CG_Draw2D');
    assert.match(fn, /CG_ScreenFade/);
    assert.match(fn, /CG_DrawActiveHud|CG_DrawCrosshair/);
    assert.doesNotMatch(fn, /skillPics\[SK_HEAVY_WEAPONS\][\s\S]{0,400}return\s*;/);
  });

  it('CG_DrawActive falls through to RenderScene and stock CG_Draw2D', () => {
    const fn = extractFn(draw, 'CG_DrawActive');
    assert.match(fn, /trap_R_RenderScene/);
    assert.match(fn, /CG_Draw2D/);
    const beforeScene = fn.split('trap_R_RenderScene')[0];
    assert.doesNotMatch(beforeScene, /#ifdef\s+__EMSCRIPTEN__[\s\S]*\breturn\s*;/);
  });

  it('R_AddWorldSurfaces adds visible faces instead of MarkLeaves+return', () => {
    const fn = extractFn(world, 'R_AddWorldSurfaces');
    assert.match(fn, /R_RecursiveWorldNode|R_AddLeafSurfaces/);
    assert.doesNotMatch(fn, /R_MarkLeaves\s*\(\s*\)\s*;\s*return\s*;/);
    assert.doesNotMatch(fn, /ETJS_RB_DrawWorld/);
  });

  it('RB_BeginDrawingView does not stay in 2D ortho and return', () => {
    const fn = extractFn(backend, 'RB_BeginDrawingView');
    assert.doesNotMatch(fn, /ETJS_RB_DrawWorld/);
    assert.doesNotMatch(fn, /glOrtho[\s\S]{0,500}return\s*;/);
  });

  it('RB_RenderDrawSurfList runs the tessellator over drawsurfs', () => {
    const fn = extractFn(backend, 'RB_RenderDrawSurfList');
    assert.match(fn, /rb_surfaceTable/);
    assert.doesNotMatch(fn, /RB_BeginDrawingView\s*\(\s*\)\s*;\s*return\s*;/);
    assert.doesNotMatch(fn, /numDrawSurfs\s*=\s*40/);
    assert.doesNotMatch(fn, /numDrawSurfs\s*=\s*0/);
  });

  it('ES2 tessellator does not abort after a small submit budget', () => {
    const es2 = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_es2.c'), 'utf8');
    const fn = extractFn(es2, 'R_ES2_DrawTess');
    assert.doesNotMatch(fn, /s_submits\s*>=\s*\d+/);
    assert.doesNotMatch(fn, /maxIdx\s*=\s*2046/);
    assert.match(fn, /glDrawArrays|glDrawElements/);
    assert.match(fn, /while\s*\(\s*i\s*\+\s*2\s*<\s*numIndexes/);
  });

  it('registers rshook icebot and ethook as the same console toggle', () => {
    const main = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'client', 'cl_main.c'), 'utf8');
    assert.match(main, /Cmd_AddCommand\("rshook"/);
    assert.match(main, /Cmd_AddCommand\("icebot"/);
    assert.match(main, /Cmd_AddCommand\("ethook"/);
    assert.match(main, /CL_RsHook_f/);
  });

  it('R_AddEntitySurfaces walks entities and adds MD3 surfaces', () => {
    const main = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_main.c'), 'utf8');
    const fn = extractFn(main, 'R_AddEntitySurfaces');
    assert.match(fn, /R_AddMD3Surfaces/);
    assert.match(fn, /R_AddBrushModelSurfaces/);
    assert.match(fn, /for\s*\(\s*tr\.currentEntityNum/);
    assert.doesNotMatch(fn, /MD3 tess overflows/);
    assert.doesNotMatch(fn, /#ifdef\s+__EMSCRIPTEN__\s+return\s*;/);
  });

  it('RE_RenderScene calls R_RenderView and has no levelshot collage', () => {
    const scene = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_scene.c'), 'utf8');
    const fn = extractFn(scene, 'RE_RenderScene');
    assert.match(fn, /R_RenderView\s*\(/);
    assert.doesNotMatch(fn, /levelshots\/oasis/);
    assert.doesNotMatch(fn, /RE_StretchPic\s*\(\s*-shift/);
  });

  it('3D view begin restores depth test and write after 2D/limbo', () => {
    const es2 = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_es2.c'), 'utf8');
    const begin = extractFn(es2, 'R_ES2_BeginView');
    assert.match(begin, /glEnable\s*\(\s*GL_DEPTH_TEST\s*\)/);
    assert.match(begin, /glDepthMask\s*\(\s*1\s*\)/);
    assert.match(begin, /GLS_DEFAULT/);
    const world = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_world.c'), 'utf8');
    const rec = extractFn(world, 'R_RecursiveWorldNode');
    assert.doesNotMatch(rec, /numDrawSurfs >= 8192/);
    const etjs = fs.readFileSync(path.join(ROOT, 'web', 'client', 'etjs.js'), 'utf8');
    assert.match(etjs, /preserveDrawingBuffer/);
    const splash = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderercommon', 'tr_splash.c'), 'utf8');
    const drawSplash = splash.split('void R_DrawSplash')[1].split('void ')[0];
    assert.match(drawSplash, /__EMSCRIPTEN__/);
    assert.match(drawSplash, /return;/);
    const shade = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'renderer', 'tr_shade.c'), 'utf8');
    assert.match(shade, /isLightmap \|\| pStage->bundle\[1\]\.isLightmap/);
  });

  it('does not hide the load overlay on renderer/UI-init prints', () => {
    const client = fs.readFileSync(path.join(ROOT, 'web', 'js', 'client.js'), 'utf8');
    assert.match(client, /ETJS menu ready/);
    assert.doesNotMatch(client, /ETJS UI_LoadMenus slim[\s\S]{0,80}hideLoadPanel/);
    assert.doesNotMatch(client, /ES2 tessellator ready[\s\S]{0,80}hideLoadPanel/);
    const scrn = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'client', 'cl_scrn.c'), 'utf8');
    assert.match(scrn, /ETJS menu ready/);
    const disc = scrn.split('case CA_DISCONNECTED')[1].split('case CA_CONNECTING')[0];
    const emDisc = disc.split('#ifdef __EMSCRIPTEN__')[1].split('#else')[0];
    assert.match(emDisc, /UI_SET_ACTIVE_MENU/);
    assert.match(emDisc, /UIMENU_MAIN/);
    assert.match(emDisc, /ETJS_DrawEngineSplash/);
    assert.doesNotMatch(emDisc, /S_StopAllSounds/);
    assert.match(scrn, /ETJS splash skip/);
    assert.match(fs.readFileSync(path.join(ROOT, 'runtime', 'legacy', 'ui', 'main.menu'), 'utf8'), /JOIN GAME/);
    assert.match(fs.readFileSync(path.join(ROOT, 'runtime', 'legacy', 'ui', 'etjs_menus.txt'), 'utf8'), /etjs_official\.menu/);
    assert.match(fs.readFileSync(path.join(ROOT, 'runtime', 'legacy', 'ui', 'etjs_official.menu'), 'utf8'), /ui\/assets\/et_clouds/);
    assert.match(fs.readFileSync(path.join(ROOT, 'runtime', 'legacy', 'ui', 'etjs_official.menu'), 'utf8'), /ui\/assets\/et_logo_huge/);
  });

  it('follow look is not applied to the followed player and join uses the in-game command', () => {
    const input = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'client', 'cl_input.c'), 'utf8');
    assert.match(input, /pm_flags & 4096/);
    const main = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'client', 'cl_main.c'), 'utf8');
    assert.match(main, /etjs_joingame/);
    assert.match(main, /etjs_splash"\) == 2/);
    const page = fs.readFileSync(path.join(ROOT, 'web', 'js', 'client.js'), 'utf8');
    assert.doesNotMatch(page, /\+connect/);
    assert.match(page, /etjs_connect/);
    assert.match(page, /ETJS_ASSET_VER/);
    assert.match(page, /etjs\.js\?v=/);
    const uiMain = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'ui', 'ui_main.c'), 'utf8');
    assert.match(uiMain, /UI_LoadMenus\("ui\/etjs_menus.txt"/);
    assert.doesNotMatch(uiMain, /ETJS skip parsed menus/);
    const setMain = uiMain.split('case UIMENU_MAIN')[1].split('case UIMENU_INGAME')[0] ||
      uiMain.split('case UIMENU_MAIN')[1].split('#else')[0];
    const mainIdx = setMain.lastIndexOf('ActivateByName("main"');
    const bgIdx = setMain.lastIndexOf('ActivateByName("background_1"');
    assert.ok(mainIdx > bgIdx, 'official MAIN must be activated after background_1 so JOIN has focus');
    const cgSys = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_syscalls.c'), 'utf8');
    assert.match(cgSys, /PC_ReadTokenHandle/);
    const pw = fs.readFileSync(path.join(ROOT, 'scripts', 'playwright-etjs.js'), 'utf8');
    assert.doesNotMatch(pw, /Cbuf_AddText.*etjs_joingame/);
    assert.doesNotMatch(pw, /Cbuf_AddText.*connect /);
    assert.match(pw, /JOIN_GAME_640/);
    assert.match(pw, /LIMBO_CANCEL_640/);
    const limbo = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_limbopanel.c'), 'utf8');
    assert.match(limbo, /ETJS_SyncLimboCursor/);
    assert.match(limbo, /CG_LimboPanel_KeyHandling[\s\S]*ETJS_SyncLimboCursor/);
    const scrn2 = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'client', 'cl_scrn.c'), 'utf8');
    assert.match(scrn2, /ETJS_DrawStartupMenu/);
    assert.match(scrn2, /ETJS menu ready/);
    const mainMenu = fs.readFileSync(path.join(ROOT, 'runtime', 'legacy', 'ui', 'etjs_main.menu'), 'utf8');
    assert.match(mainMenu, /JOIN GAME/);
    assert.match(mainMenu, /etjs_joingame/);
    assert.match(mainMenu, /menu_server\.wav/);
    assert.match(mainMenu, /ui\/assets\/et_logo/);
    const html = fs.readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8');
    assert.match(html, /id="name-gate"/);
    assert.match(html, /img\/et\.(png|ico)/);
    assert.match(page, /ETJS UIMENU_MAIN/);
    assert.match(page, /playMenuMusic/);
    const beginForm = page.split('function beginFromForm')[1] || '';
    assert.doesNotMatch(beginForm.slice(0, 900), /playMenuMusic/);
    assert.match(main, /etjs_joingame/);
  });

  it('does not recurse Z_Malloc into Com_Error; small-zone overflow uses the main zone', () => {
    const common = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'qcommon', 'common.c'), 'utf8');
    assert.match(common, /s_smallZoneTotal = 512 \* 1024/);
    const cvar = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'qcommon', 'cvar.c'), 'utf8');
    assert.match(cvar, /Cvar_IsLinked/);
    assert.match(cvar, /!cvar_indexes\[index\]\.name && !Cvar_IsLinked/);
    assert.match(cvar, /broke cycle/);
    assert.match(cvar, /cvar_vars\s*=\s*NULL/);
    assert.match(common, /#define DEF_COMHUNKMEGS\s+128/);
    assert.match(common, /#define DEF_COMZONEMEGS\s+16/);
    const pageHunk = fs.readFileSync(path.join(ROOT, 'web', 'js', 'client.js'), 'utf8');
    assert.match(pageHunk, /com_hunkMegs', '128'/);
    assert.match(pageHunk, /com_zoneMegs', '16'/);
    assert.doesNotMatch(pageHunk, /com_hunkMegs', '192'/);
    assert.match(common, /com_errorEntered/);
    assert.match(common, /Z_Malloc exhausted during:/);
    assert.match(common, /tag == TAG_SMALL/);
    assert.match(common, /Z_TagMalloc\(origSize, TAG_GENERAL\)/);
    const glimp = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'sdl', 'sdl_glimp.c'), 'utf8');
    assert.match(glimp, /r_allowSoftwareGL", "1"/);
    assert.match(glimp, /SDL_GL_ACCELERATED_VISUAL, 0/);
    assert.match(glimp, /skipping desktop mode probe/);
    const sys = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'sys', 'sys_main.c'), 'utf8');
    assert.match(sys, /emscripten_set_main_loop\(Sys_EmscriptenFrame/);
    assert.match(sys, /!com_fullyInitialized/);
    assert.match(sys, /Com_InitSmallZoneMemory/);
    const newDraw = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'cgame', 'cg_newDraw.c'), 'utf8');
    assert.match(newDraw, /etjs_resetlook/);
  });

  it('hosts the game on 8088 with /ws and a remote-nginx snippet (no nginx on this box)', () => {
    const server = fs.readFileSync(path.join(ROOT, 'server', 'index.js'), 'utf8');
    assert.match(server, /ETJS_HTTP_PORT \|\| 8088/);
    assert.match(server, /wsPath: '\/ws'/);
    assert.match(server, /connect: '127\.0\.0\.1:' \+ DED_PORT/);
    const client = fs.readFileSync(path.join(ROOT, 'web', 'js', 'client.js'), 'utf8');
    assert.match(client, /window\.location\.protocol === 'https:' \? 'wss:\/\/' : 'ws:\/\/'/);
    assert.match(client, /window\.location\.host \+ '\/ws'/);
    const pw = fs.readFileSync(path.join(ROOT, 'scripts', 'playwright-etjs.js'), 'utf8');
    assert.match(pw, /127\.0\.0\.1:8088/);
    const nginx = fs.readFileSync(path.join(ROOT, 'deploy', 'nginx-wolfet.tedcharles.net.conf'), 'utf8');
    assert.match(nginx, /server_name wolfet\.tedcharles\.net/);
    assert.match(nginx, /4\.20\.69\.92:8088/);
    assert.match(nginx, /location \/ws/);
    assert.match(nginx, /application\/wasm wasm/);
    assert.doesNotMatch(nginx, /apt install/);
    assert.ok(fs.existsSync(path.join(ROOT, 'web', 'img', 'et.png')));
    assert.ok(fs.existsSync(path.join(ROOT, 'web', 'sound', 'music', 'menu_server.wav')));
  });
});
