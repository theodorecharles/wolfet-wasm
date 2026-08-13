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
  '.ico': 'image/x-icon'
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

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    'cache-control': ext === '.pk3' || ext === '.data'
      ? 'public, max-age=3600'
      : (ext === '.js' || ext === '.wasm' ? 'no-store' : 'no-cache')
  });
  fs.createReadStream(filePath).pipe(res);
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
      gametype: 2
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
      sendFile(res, filePath);
      return;
    }
  }

  // SPA fallback: name gate lives on index.html
  const index = path.join(WEB_ROOT, 'index.html');
  if (fs.existsSync(index)) {
    sendFile(res, index);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
}

function startHttp() {
  const server = http.createServer(serveStatic);
  attachWsProxy(server, { destHost: '127.0.0.1', destPort: DED_PORT, path: '/ws' });
  return new Promise((resolve) => {
    server.listen(HTTP_PORT, '0.0.0.0', () => {
      log('website listening on http://0.0.0.0:' + HTTP_PORT);
      log('websocket game proxy on ws://0.0.0.0:' + HTTP_PORT + '/ws -> udp 127.0.0.1:' + DED_PORT);
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
  dedicated.assertOfficialPaks();
  log('official paks: ' + dedicated.RUNTIME_ETMAIN);

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

  const supervisor = startSupervisor({
    host: '127.0.0.1',
    port: DED_PORT,
    password: RCON,
    intervalMs: 1500,
    log: log,
    onTick: (result) => {
      log('fill humans=' + result.state.humans + ' bots=' + result.state.bots +
        ' target=' + result.plan.target + ' add=' + result.plan.add + ' remove=' + result.plan.remove);
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
  startHttp: startHttp,
  waitForDedicated: waitForDedicated
};
