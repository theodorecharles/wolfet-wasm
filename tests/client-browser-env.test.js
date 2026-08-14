'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WEB = path.join(__dirname, '..', 'web');

function assertNoUnguardedNode(src, file) {
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    if (/^\s*\/\//.test(line) || /\/\*/.test(line)) {
      return;
    }
    if (/\brequire\s*\(/.test(line) && !/typeof module/.test(line) && !/typeof require/.test(line)) {
      // allow require only inside a module.exports / typeof module guard on nearby lines
      const window = lines.slice(Math.max(0, i - 6), i + 1).join('\n');
      assert.match(window, /typeof module/, file + ':' + (i + 1) + ' unguarded require');
    }
  });
}

describe('browser client scripts', () => {
  it('uses the canonical framework document plus a game manifest and adapter', () => {
    const html = fs.readFileSync(path.join(WEB, 'shared-shell', 'index.html'), 'utf8');
    const framework = JSON.parse(fs.readFileSync(path.join(WEB, 'shared-shell', 'wasm-game-framework.json'), 'utf8'));
    const config = JSON.parse(fs.readFileSync(path.join(WEB, 'wasm-game.json'), 'utf8'));
    const adapter = fs.readFileSync(path.join(WEB, 'game-adapter.js'), 'utf8');
    assert.equal(fs.existsSync(path.join(WEB, 'index.html')), false, 'WolfET must not fork the framework document');
    assert.equal(fs.existsSync(path.join(WEB, 'css', 'etjs.css')), false, 'WolfET must not fork the framework shell CSS');
    assert.equal(framework.version, '0.6.1');
    assert.match(html, /id="launcher-form"/);
    assert.match(html, /id="launcher"/);
    assert.match(html, /id="player-name"/);
    assert.equal(config.icon, '/img/et.png');
    assert.equal(config.displayMode, 'dynamic');
    assert.equal(config.nativeManaged, true);
    assert.equal(config.adapter, '/game-adapter.js');
    assert.equal(config.fullscreen, true);
    assert.equal(config.pwa.icons.length, 2);
    assert.match(html, /rel="manifest" href="\/app\.webmanifest"/);
    assert.match(html, /data-shell-launch-fullscreen/);
    assert.match(adapter, /player-name\.js/);
    assert.match(adapter, /etjs-input\.js/);
    assert.match(adapter, /bind-store\.js/);
    assert.match(adapter, /pk3-cache\.js/);
    assert.match(adapter, /pk3-download\.js/);
    assert.match(adapter, /client\.js\?v=18/);
    assert.match(html, /shared-shell\/wolfwasm-shell\.js/);
    assert.match(html, /shared-shell\/wolfwasm-shell\.css/);
    assert.match(html, /shared-shell\/wolfwasm-bootstrap\.js/);
    assert.match(html, /data-shell-launcher/);
    assert.match(html, /data-shell-runtime/);
    assert.match(html, /data-shell-canvas/);
    assert.match(html, /id="game-canvas"/);
    assert.match(html, /id="loading"/);
    assert.match(html, /id="loading-console"/);
    assert.match(html, /role="log"/);
    assert.match(html, /id="graphics-profile"/);
    assert.match(html, /id="dynamic-quality"/);
    assert.match(html, /id="fps-target"/);
  });

  it('evaluates player-name.js in a browser-like environment', () => {
    const src = fs.readFileSync(path.join(WEB, 'js', 'player-name.js'), 'utf8');
    assertNoUnguardedNode(src, 'player-name.js');
    const store = {};
    const sandbox = {
      window: {},
      localStorage: {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); }
      }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    assert.equal(typeof sandbox.window.ETJSName.savePlayerName, 'function');
    sandbox.window.ETJSName.savePlayerName('BrowserTed');
    assert.equal(store['etjs.playerName'], 'BrowserTed');
    assert.equal(sandbox.window.ETJSName.loadPlayerName(), 'BrowserTed');
  });

  it('evaluates client.js in a browser-like environment without throwing', () => {
    const nameSrc = fs.readFileSync(path.join(WEB, 'js', 'player-name.js'), 'utf8');
    const src = fs.readFileSync(path.join(WEB, 'js', 'client.js'), 'utf8');
    const downloadSrc = fs.readFileSync(path.join(WEB, 'js', 'pk3-download.js'), 'utf8');
    assertNoUnguardedNode(src, 'client.js');
    assert.doesNotMatch(src, /\bmodule\.exports\b/);
    const store = {};
    const input = {
      classList: { add: () => {}, remove: () => {} },
      addEventListener: () => {},
      focus: () => {},
      value: '',
      hidden: true,
      textContent: '',
      clientWidth: 1024,
      clientHeight: 768,
      width: 1024,
      height: 768
    };
    const document = {
      getElementById: () => input,
      addEventListener: () => {},
      readyState: 'complete',
      body: { appendChild: () => {} },
      createElement: () => ({ addEventListener: () => {} })
    };
    const sandbox = {
      window: {
        addEventListener: () => {},
        location: { hostname: 'localhost', host: 'localhost:8080' }
      },
      document: document,
      console: console,
      localStorage: {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); }
      }
    };
    sandbox.window.document = document;
    sandbox.window.localStorage = sandbox.localStorage;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(nameSrc, sandbox);
    vm.runInContext(downloadSrc, sandbox);
    assert.doesNotThrow(() => vm.runInContext(src, sandbox));
    assert.equal(typeof sandbox.window.ETJSName.loadPlayerName, 'function');
  });
});
