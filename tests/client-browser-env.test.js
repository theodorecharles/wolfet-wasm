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
  it('ships a web name form then the game canvas', () => {
    const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
    assert.match(html, /id="name-form"/);
    assert.match(html, /id="name-gate"/);
    assert.match(html, /id="player-name"/);
    assert.match(html, /img\/et\.(png|ico)/);
    assert.match(html, /player-name\.js/);
    assert.match(html, /etjs-input\.js/);
    assert.match(html, /bind-store\.js/);
    assert.match(html, /pk3-cache\.js/);
    assert.match(html, /client\.js/);
    assert.match(html, /id="et-canvas"/);
    assert.match(html, /id="load-panel"/);
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
    assert.doesNotThrow(() => vm.runInContext(src, sandbox));
    assert.equal(typeof sandbox.window.ETJSName.loadPlayerName, 'function');
  });
});
