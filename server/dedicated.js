'use strict';

const { spawn, execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RUNTIME_ETMAIN = path.join(ROOT, 'runtime', 'etmain');
const OMNIBOT_CFG = path.join(ROOT, 'runtime', 'omni-bot-user', 'omni-bot.cfg');
const IMAGE = process.env.ETJS_DED_IMAGE ||
  'etlegacy/server@sha256:e8810511b59a70cd66ddf36951cbb873333c4081d236241343e19ee4a0a30d63';
const CONTAINER = process.env.ETJS_DED_CONTAINER || 'etjs-dedicated';
const RCON_FILE = path.join(ROOT, 'runtime', '.rcon-password');

/** Host UDP port the website / proxy / status queries talk to. */
const HOST_UDP_PORT = Number(process.env.ETJS_DED_PORT || 27961);
/** Container-internal dedicated port. */
const CONTAINER_UDP_PORT = 27960;

function readOrCreateRconPassword() {
  if (process.env.ETJS_RCON) {
    return process.env.ETJS_RCON;
  }

  try {
    const existing = fs.readFileSync(RCON_FILE, 'utf8').trim();
    if (existing.length >= 16) {
      return existing;
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  fs.mkdirSync(path.dirname(RCON_FILE), { recursive: true });
  const generated = crypto.randomBytes(24).toString('hex');
  try {
    fs.writeFileSync(RCON_FILE, generated + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    return generated;
  } catch (err) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
    const raced = fs.readFileSync(RCON_FILE, 'utf8').trim();
    if (raced.length < 16) {
      throw new Error('invalid RCON password file: ' + RCON_FILE);
    }
    return raced;
  }
}

const RCON_PASSWORD = readOrCreateRconPassword();
const CONFIG_LABEL = crypto.createHash('sha256')
  .update(IMAGE + '\0' + RCON_PASSWORD)
  .digest('hex');

const DEFAULT_ARGS = [
  '+set', 'fs_homepath', '/legacy/homepath',
  '+set', 'dedicated', '1',
  '+set', 'sv_advert', '0',
  '+set', 'net_port', String(CONTAINER_UDP_PORT),
  '+set', 'sv_maxclients', '13',
  '+set', 'sv_privateclients', '0',
  '+set', 'sv_hostname', 'ETJS Shared Match',
  '+set', 'sv_pure', '0',
  '+set', 'sv_tempbantime', '0',
  '+set', 'sv_allowDownload', '1',
  '+set', 'g_friendlyFire', '0',
  '+set', 'g_gametype', '2',
  '+set', 'g_heavyWeaponRestriction', '100',
  '+set', 'g_bluelimbotime', '1000',
  '+set', 'g_redlimbotime', '1000',
  '+set', 'omnibot_enable', '1',
  '+set', 'omnibot_path', './legacy/omni-bot',
  '+set', 'omnibot_flags', '0',
  '+set', 'g_xpSaver', '15',
  '+set', 'g_xpSaverMaxAge', '604800',
  '+set', 'rconpassword', RCON_PASSWORD,
  '+set', 'logfile', '2',
  '+set', 'com_hunkMegs', '128',
  '+map', 'oasis',
  '+exec', 'objectiverotate.cfg'
];

function assertOfficialPaks() {
  const required = ['pak0.pk3', 'pak1.pk3', 'pak2.pk3'];
  const missing = required.filter((name) => !fs.existsSync(path.join(RUNTIME_ETMAIN, name)));
  if (missing.length) {
    throw new Error('official ET paks missing from ' + RUNTIME_ETMAIN + ': ' + missing.join(', '));
  }
}

function dockerAvailable() {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' });
    return true;
  } catch (err) {
    return false;
  }
}

function containerRunning() {
  try {
    const out = execFileSync('docker', ['inspect', '-f', '{{.State.Running}}', CONTAINER], {
      encoding: 'utf8'
    }).trim();
    return out === 'true';
  } catch (err) {
    return false;
  }
}

function containerConfigured() {
  try {
    const out = execFileSync('docker', [
      'inspect', '-f', '{{ index .Config.Labels "net.etjs.config" }}', CONTAINER
    ], { encoding: 'utf8' }).trim();
    return out === CONFIG_LABEL;
  } catch (err) {
    return false;
  }
}

function stopDedicated() {
  try {
    execFileSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' });
  } catch (err) {
    /* not running */
  }
}

/**
 * Start the one shared dedicated match (etlegacy + official paks + Omni-Bot).
 * Returns a handle with .kill().
 */
function startDedicated(opts) {
  assertOfficialPaks();
  if (!dockerAvailable()) {
    throw new Error('docker is required to start etlegacy/server');
  }

  stopDedicated();

  const extra = (opts && opts.args) || [];
  const args = [
    'run',
    '--name', CONTAINER,
    '--rm',
    '-d',
    '--label', 'net.etjs.config=' + CONFIG_LABEL,
    '-v', RUNTIME_ETMAIN + ':/legacy/server/etmain',
    '-v', OMNIBOT_CFG + ':/legacy/server/legacy/omni-bot/et/user/omni-bot.cfg',
    '-v', path.join(ROOT, 'runtime', 'legacy') + ':/legacy/homepath/legacy',
    '--user', '0',
    '-p', HOST_UDP_PORT + ':' + CONTAINER_UDP_PORT + '/udp',
    '-w', '/legacy/server',
    '--entrypoint', './etlded',
    IMAGE
  ].concat(DEFAULT_ARGS).concat(extra);

  execFileSync('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  return {
    container: CONTAINER,
    hostPort: HOST_UDP_PORT,
    kill: stopDedicated
  };
}

function followLogs(logStream) {
  const child = spawn('docker', ['logs', '-f', CONTAINER], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (logStream) {
    child.stdout.pipe(logStream, { end: false });
    child.stderr.pipe(logStream, { end: false });
  }
  return child;
}

module.exports = {
  ROOT: ROOT,
  RUNTIME_ETMAIN: RUNTIME_ETMAIN,
  IMAGE: IMAGE,
  CONTAINER: CONTAINER,
  HOST_UDP_PORT: HOST_UDP_PORT,
  CONTAINER_UDP_PORT: CONTAINER_UDP_PORT,
  RCON_PASSWORD: RCON_PASSWORD,
  RCON_FILE: RCON_FILE,
  CONFIG_LABEL: CONFIG_LABEL,
  DEFAULT_ARGS: DEFAULT_ARGS,
  assertOfficialPaks: assertOfficialPaks,
  dockerAvailable: dockerAvailable,
  containerRunning: containerRunning,
  containerConfigured: containerConfigured,
  startDedicated: startDedicated,
  stopDedicated: stopDedicated,
  followLogs: followLogs
};
