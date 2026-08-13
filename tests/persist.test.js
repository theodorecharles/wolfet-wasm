'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const binds = require(path.join(ROOT, 'web', 'js', 'bind-store.js'));
const pk3 = require(path.join(ROOT, 'web', 'js', 'pk3-cache.js'));

function memoryStorage() {
  const data = Object.create(null);
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; }
  };
}

describe('binding persist in localStorage', () => {
  it('saves a bind dump and reads it back', () => {
    const storage = memoryStorage();
    binds.saveBinds('bind w +forward\nbind MOUSE1 +attack\n', storage);
    assert.match(binds.loadBinds(storage), /bind w \+forward/);
    assert.match(binds.loadBinds(storage), /MOUSE1 \+attack/);
  });

  it('mergeAutoexec prefers the stored binds over default bind lines', () => {
    const defaults = ['set rate 25000', 'unbindall', 'bind w +forward', 'set r_picmip 0'];
    const stored = 'bind e +leanright\nbind MOUSE1 +attack';
    const merged = binds.mergeAutoexec(defaults, stored);
    assert.ok(merged.includes('set rate 25000'));
    assert.ok(!merged.includes('unbindall'));
    assert.ok(merged.some((l) => /bind e \+leanright/.test(l)));
    assert.ok(merged.some((l) => /MOUSE1 \+attack/.test(l)));
  });
});

describe('pk3 persist get-after-put (no re-download)', () => {
  it('second getOrFetch for the same pak does not call fetch again', async () => {
    const cache = pk3.createPk3Cache({ backend: pk3.memoryBackend() });
    const payload = new Uint8Array([1, 2, 3, 4]);
    let fetches = 0;
    const fetchFn = function () {
      fetches += 1;
      return payload;
    };
    const first = await cache.getOrFetch('pak0.pk3', fetchFn);
    assert.equal(first.cached, false);
    assert.equal(fetches, 1);
    const second = await cache.getOrFetch('pak0.pk3', fetchFn);
    assert.equal(second.cached, true);
    assert.equal(fetches, 1);
    assert.equal(cache.downloadCount(), 1);
    assert.deepEqual(Array.from(second.bytes), [1, 2, 3, 4]);
  });
});
