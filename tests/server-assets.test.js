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
});
