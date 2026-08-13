'use strict';
/**
 * Walk the real site startup: load bar → main menu → click Join Game → limbo → close limbo.
 * Does not inject connect / etjs_joingame.
 */
const fs = require('fs');
const path = require('path');
const input = require('../web/js/etjs-input.js');

const OUT = process.env.ETJS_SHOT_DIR || path.join(__dirname, '..', 'tmp-etjs-shots');
const URL = process.env.ETJS_URL || ('http://127.0.0.1:8088/?v=' + Date.now());
const SKY = { r: 118, g: 158, b: 208 };

function findPlaywright() {
  try {
    return require('playwright');
  } catch (err) {
    throw new Error('playwright is not installed; run npm install and npm run playwright:install');
  }
}

function from640(x640, y640, width, height) {
  /* Same mapping as etjs-input letterboxTo640 / QuakeJS stretch-to-window. */
  return { x: x640 * width / 640, y: y640 * height / 480 };
}

async function canvasStats(page) {
  return page.evaluate((sky) => {
    const canvas = document.getElementById('et-canvas');
    const load = document.getElementById('load-panel');
    let painted = 0, skyish = 0, total = 0, dataUrl = null, err = null;
    try {
      if (canvas && canvas.width) {
        const c2 = document.createElement('canvas');
        c2.width = Math.min(canvas.width, 640);
        c2.height = Math.min(canvas.height, 400);
        const ctx = c2.getContext('2d');
        ctx.drawImage(canvas, 0, 0, c2.width, c2.height);
        const img = ctx.getImageData(0, 0, c2.width, c2.height).data;
        for (let i = 0; i < img.length; i += 4) {
          total++;
          if (Math.abs(img[i] - sky.r) < 18 && Math.abs(img[i + 1] - sky.g) < 18 && Math.abs(img[i + 2] - sky.b) < 18) {
            skyish++;
          }
          if (img[i] > 8 || img[i + 1] > 8 || img[i + 2] > 8) painted++;
        }
        dataUrl = c2.toDataURL('image/png');
      }
    } catch (e) {
      err = String(e && e.message ? e.message : e);
    }
    let limbo = null;
    let ingame = null;
    try {
      if (window.Module && typeof window.Module.ccall === 'function') {
        limbo = window.Module.ccall('ETJS_CvarInt', 'number', ['string'], ['etjs_limbo']);
        ingame = window.Module.ccall('ETJS_CvarInt', 'number', ['string'], ['etjs_ingame']);
      }
    } catch (e) {
      limbo = 'err';
    }
    return {
      loadHidden: !!(load && load.classList.contains('hidden')),
      painted, skyish, total, dataUrl, err, limbo, ingame,
      nameGate: !!(document.getElementById('name-gate') &&
        !document.getElementById('name-gate').classList.contains('hidden'))
    };
  }, SKY);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const logs = [];
  const push = (s) => {
    logs.push(s);
    console.log(s);
    fs.writeFileSync(path.join(OUT, 'page-console.log'), logs.join('\n'));
  };

  let chromium;
  try {
    chromium = findPlaywright().chromium;
  } catch (e) {
    fs.writeFileSync(path.join(OUT, 'playwright-env.log'), String(e.stack || e));
    process.exit(2);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--disable-dev-shm-usage']
  });
  const page = await browser.newContext({ viewport: { width: 1280, height: 800 } }).then((c) => c.newPage());
  page.on('console', (msg) => push(msg.type() + ': ' + msg.text()));
  page.on('pageerror', (err) => push('PAGEERROR: ' + err.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  await page.waitForSelector('#name-form', { timeout: 15000 });
  await page.fill('#player-name', 'ETPlayer');
  push('submit name form');
  await page.click('#name-submit');

  let st = null;
  for (let i = 0; i < 48; i++) {
    await page.waitForTimeout(1500);
    st = await canvasStats(page);
    push('boot' + i + ' load=' + st.loadHidden + ' painted=' + st.painted + ' limbo=' + st.limbo + ' ingame=' + st.ingame);
    if (logs.some((l) => /ETJS splash start/.test(l)) && !logs.some((l) => /ETJS splash skip|ETJS UIMENU_MAIN/.test(l))) {
      push('skip splash with Space');
      await page.keyboard.press('Space');
    }
    if (logs.some((l) => /ETJS UIMENU_MAIN/.test(l)) && st.loadHidden) {
      break;
    }
  }

  await page.screenshot({ path: path.join(OUT, 'menu-1.png') });
  if (st && st.dataUrl) {
    fs.writeFileSync(path.join(OUT, 'menu-1-canvas.png'), Buffer.from(st.dataUrl.split(',')[1], 'base64'));
  }
  push('menu painted=' + (st && st.painted) + ' nameGate=' + (st && st.nameGate));

  const join = input.JOIN_GAME_640;
  const click = from640(join.x + join.w * 0.5, join.y + join.h * 0.5, 1280, 800);
  push('click Join Game at ' + click.x.toFixed(0) + ',' + click.y.toFixed(0));
  await page.mouse.click(click.x, click.y);

  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(1000);
    if (logs.some((l) => /ETJS join name=|Connecting to|resolved to/.test(l))) {
      await page.screenshot({ path: path.join(OUT, 'after-join.png') });
      push('wrote after-join.png');
      break;
    }
  }

  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(2000);
    st = await canvasStats(page);
    push('join' + i + ' load=' + st.loadHidden + ' painted=' + st.painted + ' limbo=' + st.limbo + ' ingame=' + st.ingame);
    if (st.limbo === 1 || st.ingame === 1) {
      break;
    }
  }

  if (st && st.dataUrl) {
    fs.writeFileSync(path.join(OUT, 'browser-limbo.png'), Buffer.from(st.dataUrl.split(',')[1], 'base64'));
  }

  if (st && st.limbo === 1) {
    const allies = input.LIMBO_ALLIES_640;
    const alliesClick = from640(allies.x + allies.w * 0.5, allies.y + allies.h * 0.5, 1280, 800);
    push('click Allies at ' + alliesClick.x.toFixed(0) + ',' + alliesClick.y.toFixed(0));
    await page.mouse.move(alliesClick.x, alliesClick.y);
    await page.waitForTimeout(80);
    await page.mouse.click(alliesClick.x, alliesClick.y);
    await page.waitForTimeout(400);

    const ok = input.LIMBO_OK_640;
    const okClick = from640(ok.x + ok.w * 0.5, ok.y + ok.h * 0.5, 1280, 800);
    push('click OK at ' + okClick.x.toFixed(0) + ',' + okClick.y.toFixed(0));
    await page.mouse.move(okClick.x, okClick.y);
    await page.waitForTimeout(80);
    await page.mouse.click(okClick.x, okClick.y);
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(400);
      st = await canvasStats(page);
      push('ok' + i + ' limbo=' + st.limbo + ' ingame=' + st.ingame);
      if (st.limbo === 0) {
        break;
      }
    }

    if (st.limbo === 1) {
      const box = input.LIMBO_CANCEL_640;
      const cancel = from640(box.x + box.w * 0.5, box.y + box.h * 0.5, 1280, 800);
      push('click Cancel at ' + cancel.x.toFixed(0) + ',' + cancel.y.toFixed(0));
      await page.mouse.click(cancel.x, cancel.y);
      await page.waitForTimeout(500);
      st = await canvasStats(page);
    }
  }

  st = await canvasStats(page);
  if (st.dataUrl) {
    fs.writeFileSync(path.join(OUT, 'after-limbo-1.png'), Buffer.from(st.dataUrl.split(',')[1], 'base64'));
  }
  await page.screenshot({ path: path.join(OUT, 'after-limbo-1-page.png') });
  const frac = st.total ? st.skyish / st.total : 1;
  push('after-limbo painted=' + st.painted + ' skyFrac=' + frac.toFixed(3) + ' limbo=' + st.limbo + ' ingame=' + st.ingame);

  if (st.limbo === 0 && st.ingame === 1) {
    await page.evaluate(() => {
      const c = document.getElementById('et-canvas');
      if (c) { c.focus(); }
      if (document.getElementById('viewport-frame')) {
        document.getElementById('viewport-frame').focus();
      }
    });
    const before = await page.evaluate(() => {
      const ccall = window.Module && window.Module.ccall;
      if (!ccall) { return { ox: 0, oy: 0, fwd: 0 }; }
      return {
        ox: ccall('ETJS_CvarInt', 'number', ['string'], ['etjs_ox']),
        oy: ccall('ETJS_CvarInt', 'number', ['string'], ['etjs_oy']),
        fwd: ccall('ETJS_CvarInt', 'number', ['string'], ['etjs_fwd'])
      };
    });
    push('before-W ox=' + before.ox + ' oy=' + before.oy + ' fwd=' + before.fwd);
    await page.keyboard.down('w');
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'w', code: 'KeyW', bubbles: true, cancelable: true
      }));
    });
    await page.waitForTimeout(900);
    const mid = await page.evaluate(() => {
      const ccall = window.Module && window.Module.ccall;
      if (!ccall) { return { ox: 0, oy: 0, fwd: 0, last: null }; }
      return {
        ox: ccall('ETJS_CvarInt', 'number', ['string'], ['etjs_ox']),
        oy: ccall('ETJS_CvarInt', 'number', ['string'], ['etjs_oy']),
        fwd: ccall('ETJS_CvarInt', 'number', ['string'], ['etjs_fwd']),
        last: window.__etjsLastMove || null
      };
    });
    push('hold-W ox=' + mid.ox + ' oy=' + mid.oy + ' fwd=' + mid.fwd + ' last=' + JSON.stringify(mid.last));
    await page.keyboard.up('w');
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'w', code: 'KeyW', bubbles: true, cancelable: true
      }));
    });
    await page.mouse.click(640, 400);
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => {
      const ccall = window.Module && window.Module.ccall;
      if (!ccall) { return { atk: 0 }; }
      return { atk: ccall('ETJS_CvarInt', 'number', ['string'], ['etjs_atk']) };
    });
    st = await canvasStats(page);
    if (st.dataUrl) {
      fs.writeFileSync(path.join(OUT, 'browser-fire.png'), Buffer.from(st.dataUrl.split(',')[1], 'base64'));
    }
    push('after-move-fire painted=' + st.painted + ' limbo=' + st.limbo
      + ' dOrg=' + Math.hypot(mid.ox - before.ox, mid.oy - before.oy).toFixed(0)
      + ' atk=' + after.atk);
  }

  await browser.close();
})().catch((err) => {
  console.error(err);
  fs.writeFileSync(path.join(OUT, 'playwright-env.log'), String(err && err.stack || err));
  process.exit(1);
});
