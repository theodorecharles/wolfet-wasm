'use strict';

/**
 * Emscripten SOCKFS datagram <-> native UDP proxy.
 *
 * Browser/WASM clients open ws://host:port and send binary datagrams.
 * The first packet may be the SOCKFS port announcement:
 *   FF FF FF FF 'p' 'o' 'r' 't' hi lo
 * which is not forwarded. Each WebSocket gets its own UDP socket so
 * etlded sees distinct clients.
 */

const dgram = require('dgram');
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT_MAGIC = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x70, 0x6f, 0x72, 0x74]);

function isPortAnnouncement(buf) {
  return buf.length === 10 && buf.slice(0, 8).equals(PORT_MAGIC);
}

function attachWsProxy(server, opts) {
  const destHost = (opts && opts.destHost) || '127.0.0.1';
  const destPort = (opts && opts.destPort) || 27961;
  const path = (opts && opts.path) || '/ws';

  const wss = new WebSocketServer({ server: server, path: path });

  wss.on('connection', (ws) => {
    const udp = dgram.createSocket('udp4');
    udp.bind(0, '127.0.0.1');

    udp.on('message', (msg) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(msg, { binary: true });
      }
    });

    udp.on('error', (err) => {
      try {
        ws.close();
      } catch (e) {
        /* ignore */
      }
    });

    ws.on('message', (data) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (isPortAnnouncement(buf)) {
        return;
      }
      udp.send(buf, destPort, destHost);
    });

    const cleanup = () => {
      try {
        udp.close();
      } catch (e) {
        /* ignore */
      }
    };
    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });

  return wss;
}

function listenProxy(port, opts) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('etjs websocket game proxy\n');
  });
  attachWsProxy(server, opts);
  return new Promise((resolve) => {
    server.listen(port, '0.0.0.0', () => resolve(server));
  });
}

module.exports = {
  isPortAnnouncement: isPortAnnouncement,
  attachWsProxy: attachWsProxy,
  listenProxy: listenProxy
};
