'use strict';

const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const host = require('../server/index');

function request(port, pathname, options) {
  return new Promise((resolve, reject) => {
    const req = http.request(Object.assign({
      hostname: '127.0.0.1',
      port: port,
      path: pathname,
      method: 'GET'
    }, options || {}), (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks)
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('same-origin content-addressed game assets', () => {
  let server;
  let port;

  before(async () => {
    server = await host.startHttp(0);
    port = server.address().port;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('publishes exact sizes, hashes, and versioned same-origin URLs', async () => {
    const response = await request(port, '/config.json');
    assert.equal(response.status, 200);
    const config = JSON.parse(response.body.toString('utf8'));
    assert.equal(config.admin, true);
    assert.equal(Object.hasOwn(config, 'rconPassword'), false);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(config.assets.length, 6);
    config.assets.forEach((asset) => {
      assert.match(asset.url, /^\/(?:etmain|legacy)\/[^?]+\.pk3\?v=[a-f0-9]{16}$/);
      assert.match(asset.sha256, /^[a-f0-9]{64}$/);
      assert.equal(asset.cacheKey, asset.name + '@sha256:' + asset.sha256);
      assert.ok(asset.bytes > 1000);
    });
  });

  it('serves valid bounded byte ranges and rejects invalid ranges', async () => {
    const partial = await request(port, '/etmain/pak0.pk3?v=test', {
      headers: { Range: 'bytes=8-39' }
    });
    assert.equal(partial.status, 206);
    assert.equal(partial.body.length, 32);
    assert.equal(partial.headers['accept-ranges'], 'bytes');
    assert.equal(partial.headers['content-range'], 'bytes 8-39/228138631');
    assert.equal(partial.headers['content-length'], '32');

    const invalid = await request(port, '/etmain/pak0.pk3', {
      headers: { Range: 'bytes=999999999-1000000000' }
    });
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers['content-range'], 'bytes */228138631');
  });

  it('exposes the framework game-data contract without an upload gate', async () => {
    const statusResponse = await request(port, '/game-data/status');
    assert.equal(statusResponse.status, 200);
    const status = JSON.parse(statusResponse.body.toString('utf8'));
    assert.equal(status.configured, true);
    assert.equal(status.ready, true);
    assert.equal(status.files.length, 6);
    const pak0 = status.files.find((file) => file.key === 'etmain-pak0.pk3');
    assert.equal(pak0.path, 'etmain/pak0.pk3');
    assert.equal(pak0.size, 228138631);
    assert.match(pak0.sha256, /^[a-f0-9]{64}$/);
    assert.equal(pak0.valid, true);

    const fileResponse = await request(port, '/game-data/files/etmain-pak0.pk3', {
      headers: { Range: 'bytes=0-3' }
    });
    assert.equal(fileResponse.status, 206);
    assert.deepEqual(Array.from(fileResponse.body), [80, 75, 3, 4]);

    const upload = await request(port, '/game-data/setup/etmain-pak0.pk3', { method: 'PUT' });
    assert.equal(upload.status, 405);
  });
});
