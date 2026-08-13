'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const dedicated = require('./dedicated');
const { attachWsProxy } = require('./ws-proxy');
const { startSupervisor } = require('./supervisor');
const { queryStatus } = require('./status');

const ROOT = path.join(__dirname, '..');
const WEB_ROOT = path.join(ROOT, 'web');
const HTTP_PORT = Number(process.env.ETJS_HTTP_PORT || 8088);
const DED_PORT = dedicated.HOST_UDP_PORT;
const RCON = dedicated.RCON_PASSWORD;
const GAME_ASSET_DEFS = [
  { parent: '/etmain', name: 'pak0.pk3', hash: '712966b20e06523fe81419516500e499c86b2b4fec823856ddbd333fcb3d26e5' },
  { parent: '/etmain', name: 'pak1.pk3', hash: '5610fd749024405b4425a7ce6397e58187b941d22092ef11d4844b427df53e5d' },
  { parent: '/etmain', name: 'pak2.pk3', hash: 'a48ab749a1a12ab4d9137286b1f23d642c29da59845b2bafc8f64e052cf06f3e' },
  { parent: '/etmain', name: 'mp_bin.pk3', hash: 'cf0a7ce662421c766f93cc196841849eb66905b047d209dd5f3ed0b1396cd42e' },
  { parent: '/legacy', name: 'legacy_v2.84.0.pk3', hash: 'd1abab70f6e3e3af8f34dfb4d94542c8bd592b0a1a582f0107d2162ee23c679b' },
  { parent: '/legacy', name: 'etjs.pk3', hash: dedicated.ETJS_PAK_HASH }
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.pk3': 'application/octet-stream',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf'
};

function log(msg) {
  const line = '[' + new Date().toISOString() + '] ' + msg;
  console.log(line);
}

function safeJoin(root, reqPath) {
  const decoded = decodeURIComponent((reqPath || '/').split('?')[0]);
  const rel = decoded.replace(/^\/+/, '');
  const full = path.normalize(path.join(root, rel));
  if (full !== root && !full.startsWith(root + path.sep)) {
    return null;
  }
  return full;
}

function gameAssets() {
  return GAME_ASSET_DEFS.map((def) => {
    const base = def.parent === '/etmain'
      ? path.join(ROOT, 'runtime', 'etmain')
      : path.join(ROOT, 'runtime', 'legacy');
    const filePath = path.join(base, def.name);
    const bytes = fs.statSync(filePath).size;
    return {
      parent: def.parent,
      name: def.name,
      url: def.parent + '/' + def.name + '?v=' + def.hash.slice(0, 16),
      bytes: bytes,
      sha256: def.hash,
      cacheKey: def.name + '@sha256:' + def.hash
    };
  });
}

function sendFile(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const stat = fs.statSync(filePath);
  const headers = {
    'content-type': type,
    'accept-ranges': 'bytes',
    'cache-control': ext === '.pk3' || ext === '.data'
      ? 'public, max-age=3600'
      : (ext === '.js' || ext === '.wasm' ? 'no-store' : 'no-cache')
  };
  const range = req.headers && req.headers.range;
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    const start = match ? Number(match[1]) : -1;
    const requestedEnd = match && match[2] ? Number(match[2]) : stat.size - 1;
    if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) ||
        start < 0 || start >= stat.size || requestedEnd < start) {
      res.writeHead(416, Object.assign(headers, { 'content-range': 'bytes */' + stat.size }));
      res.end();
      return;
    }
    const end = Math.min(requestedEnd, stat.size - 1);
    headers['content-range'] = 'bytes ' + start + '-' + end + '/' + stat.size;
    headers['content-length'] = String(end - start + 1);
    res.writeHead(206, headers);
    if (req.method === 'HEAD') {
      res.end();
    } else {
      fs.createReadStream(filePath, { start: start, end: end }).pipe(res);
    }
    return;
  }
  headers['content-length'] = String(stat.size);
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
  } else {
    fs.createReadStream(filePath).pipe(res);
  }
}

function serveStatic(req, res) {
  const urlPath = (req.url || '/').split('?')[0];

  if (urlPath === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, dedicatedPort: DED_PORT }));
    return;
  }

  if (urlPath === '/status') {
    queryStatus({ host: '127.0.0.1', port: DED_PORT })
      .then((st) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(st));
      })
      .catch((err) => {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  if (urlPath === '/config.json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      connect: '127.0.0.1:' + DED_PORT,
      wsPath: '/ws',
      httpPort: HTTP_PORT,
      map: 'oasis',
      gametype: 2,
      assets: gameAssets()
    }));
    return;
  }

  const searchRoots = [
    { prefix: '/etmain/', root: path.join(ROOT, 'runtime', 'etmain'), strip: '/etmain/' },
    { prefix: '/legacy/', root: path.join(ROOT, 'runtime', 'legacy'), strip: '/legacy/' },
    { prefix: '/client/', root: path.join(ROOT, 'web', 'client'), strip: '/client/' },
    { prefix: '/', root: WEB_ROOT, strip: '/' }
  ];

  for (let i = 0; i < searchRoots.length; i++) {
    const entry = searchRoots[i];
    if (urlPath !== '/' && !urlPath.startsWith(entry.prefix) && entry.prefix !== '/') {
      continue;
    }
    let rel = urlPath === '/' ? 'index.html' : urlPath.slice(entry.strip.length);
    if (!rel || rel.endsWith('/')) {
      rel += 'index.html';
    }
    const filePath = safeJoin(entry.root, rel);
    if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      sendFile(req, res, filePath);
      return;
    }
  }

  // SPA fallback: name gate lives on index.html
  const index = path.join(WEB_ROOT, 'index.html');
  if (fs.existsSync(index)) {
    sendFile(req, res, index);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
}

function startHttp(port) {
  const server = http.createServer(serveStatic);
  attachWsProxy(server, { destHost: '127.0.0.1', destPort: DED_PORT, path: '/ws' });
  return new Promise((resolve) => {
    server.listen(typeof port === 'number' ? port : HTTP_PORT, '0.0.0.0', () => {
      const boundPort = server.address().port;
      log('website listening on http://0.0.0.0:' + boundPort);
      log('websocket game proxy on ws://0.0.0.0:' + boundPort + '/ws -> udp 127.0.0.1:' + DED_PORT);
      resolve(server);
    });
  });
}

async function waitForDedicated(timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 60000);
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const st = await queryStatus({ host: '127.0.0.1', port: DED_PORT, timeoutMs: 1500 });
      return st;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error('dedicated server did not become ready: ' + (lastErr && lastErr.message));
}

async function main() {
  log('ETJS starting');
  log('validating server-side game data');
  dedicated.ensureGameData();
  dedicated.assertServerMod();
  log('official paks ready for same-origin browser delivery: ' + dedicated.RUNTIME_ETMAIN);

  if (process.env.ETJS_SKIP_DED !== '1') {
    if (dedicated.containerRunning() && dedicated.containerConfigured()) {
      log('reusing running dedicated container ' + dedicated.CONTAINER);
    } else {
      log('starting dedicated server (' + dedicated.IMAGE + ') on udp/' + DED_PORT);
      dedicated.startDedicated();
    }
    const st = await waitForDedicated(90000);
    log('dedicated ready map=' + st.map + ' gametype=' + st.gametype + ' players=' + st.players.length);
  }

  const httpServer = await startHttp();

  let lastFillSummary = '';
  const supervisor = startSupervisor({
    host: '127.0.0.1',
    port: DED_PORT,
    password: RCON,
    intervalMs: 1500,
    log: log,
    onTick: (result) => {
      const summary = 'fill humans=' + result.state.humans + ' bots=' + result.state.bots +
        ' target=' + result.plan.target + ' add=' + result.plan.add + ' remove=' + result.plan.remove;
      if (summary !== lastFillSummary || result.plan.add || result.plan.remove) {
        log(summary);
        lastFillSummary = summary;
      }
    }
  });

  const shutdown = () => {
    log('shutting down');
    supervisor.stop();
    httpServer.close();
    if (process.env.ETJS_KEEP_DED !== '1') {
      dedicated.stopDedicated();
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  main: main,
  gameAssets: gameAssets,
  sendFile: sendFile,
  serveStatic: serveStatic,
  startHttp: startHttp,
  waitForDedicated: waitForDedicated
};
