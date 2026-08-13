'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const input = require(path.join(ROOT, 'web', 'js', 'etjs-input.js'));

describe('shipped input helpers (window map, WASD, attack)', () => {
  it('maps a canvas-center click to 320,240 across the full window (QuakeJS stretch)', () => {
    const rect = { left: 0, top: 0, width: 1280, height: 800 };
    const mid = input.letterboxTo640(640, 400, rect);
    assert.ok(Math.abs(mid.x - 320) < 1, 'x=' + mid.x);
    assert.ok(Math.abs(mid.y - 240) < 1, 'y=' + mid.y);
  });

  it('exposes the JOIN GAME control in 640 space so a page click can hit it', () => {
    assert.ok(input.JOIN_GAME_640);
    assert.equal(input.clickHitsRect(
      input.JOIN_GAME_640.x + 10,
      input.JOIN_GAME_640.y + 10,
      input.JOIN_GAME_640
    ), true);
  });

  it('maps a known limbo OK region inside 640x480', () => {
    const rect = { left: 0, top: 0, width: 1280, height: 800 };
    /* OK is roughly 470,430 in 640 space on the official panel */
    const mapped = input.letterboxTo640(890, 717, rect);
    assert.ok(input.clickHitsRect(mapped.x, mapped.y, { x: 430, y: 400, w: 100, h: 50 }));
  });

  it('exposes the official limbo Cancel hit box', () => {
    assert.ok(input.LIMBO_CANCEL_640);
    assert.equal(input.clickHitsRect(584, 463, input.LIMBO_CANCEL_640), true);
    assert.equal(input.clickHitsRect(575, 452, input.LIMBO_CANCEL_640), false);
    assert.ok(input.LIMBO_ALLIES_640);
    assert.equal(input.clickHitsRect(539, 210, input.LIMBO_ALLIES_640), true);
  });

  it('WASD held state becomes a non-zero move command', () => {
    assert.deepEqual(input.moveFromHeld({ KeyW: true }), { forward: 1, right: 0, up: 0 });
    assert.deepEqual(input.moveFromHeld({ KeyS: true, KeyD: true }), { forward: -1, right: 1, up: 0 });
    assert.deepEqual(input.moveFromHeld({}), { forward: 0, right: 0, up: 0 });
  });

  it('mouse1 attacks once play has started, even without pointer lock', () => {
    assert.equal(input.shouldFireOnMouseDown(true, false, false), true);
    assert.equal(input.shouldFireOnMouseDown(true, false, true), true);
    assert.equal(input.shouldFireOnMouseDown(true, true, false), false);
    assert.equal(input.shouldFireOnMouseDown(false, false, false), false);
  });

  it('engine SetMove is added onto the usercmd in CL_KeyMove', () => {
    const src = fs.readFileSync(path.join(ROOT, 'etlegacy', 'src', 'client', 'cl_input.c'), 'utf8');
    assert.match(src, /void ETJS_SetMove/);
    assert.match(src, /etjsMoveForward/);
    assert.match(src, /cmd->forwardmove/);
    assert.match(src, /BUTTON_TALK/);
    assert.match(src, /etjs_limbo/);
    assert.match(src, /do not set BUTTON_TALK from leftover catchers/);
    assert.match(src, /kb\[KB_FORWARD\]\.active/);
  });

  it('page pumps SetMove from held WASD and does not steal those keys from SDL', () => {
    const client = fs.readFileSync(path.join(ROOT, 'web', 'js', 'client.js'), 'utf8');
    assert.match(client, /requestAnimationFrame\(pumpMove\)/);
    assert.match(client, /resolveCode/);
    assert.match(client, /KeyW: '\+forward'/);
    const onKeyDown = client.split('function onKeyDown')[1].split('function onKeyUp')[0];
    assert.match(onKeyDown, /K_CONSOLE/);
    assert.match(onKeyDown, /isConsoleEvent/);
    assert.match(client, /K_CONSOLE = 297/);
    const menuBranch = onKeyDown.split('if (uiOpen())')[1] || '';
    assert.doesNotMatch(menuBranch, /stopImmediatePropagation/);
  });

  it('does not pointer-lock the official MAIN menu and maps resize like QuakeJS', () => {
    const client = fs.readFileSync(path.join(ROOT, 'web', 'js', 'client.js'), 'utf8');
    const click = client.split('function onCanvasClick')[1].split('function onMouseOut')[0];
    assert.match(click, /uiOpen\(\)/);
    assert.match(click, /lockPointer/);
    assert.match(client, /offsetWidth/);
    assert.match(client, /setCanvasSize/);
    const mouseDown = client.split('function onMouseDown')[1].split('function onMouseUp')[0];
    assert.match(mouseDown, /held\['mouse'/);
    assert.match(mouseDown, /uiOpen\(\)/);
  });
});
