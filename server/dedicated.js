'use strict';

const { spawn, execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RUNTIME_ETMAIN = path.join(ROOT, 'runtime', 'etmain');
const SERVER_MOD = path.join(ROOT, 'runtime', 'legacy', 'qagame.mp.x86_64.so');
const ETJS_PAK = path.join(ROOT, 'runtime', 'legacy', 'etjs.pk3');
const OMNIBOT_CFG = path.join(ROOT, 'runtime', 'omni-bot-user', 'omni-bot.cfg');
const IMAGE = process.env.ETJS_DED_IMAGE ||
  'etlegacy/server@sha256:e8810511b59a70cd66ddf36951cbb873333c4081d236241343e19ee4a0a30d63';
const CONTAINER = process.env.ETJS_DED_CONTAINER || 'etjs-dedicated';
const RCON_FILE = path.join(ROOT, 'runtime', '.rcon-password');
const DATA_FETCHER = path.join(ROOT, 'scripts', 'fetch-game-data.sh');

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
const SERVER_MOD_HASH = fs.existsSync(SERVER_MOD)
  ? crypto.createHash('sha256').update(fs.readFileSync(SERVER_MOD)).digest('hex')
  : 'missing';
const ETJS_PAK_HASH = fs.existsSync(ETJS_PAK)
  ? crypto.createHash('sha256').update(fs.readFileSync(ETJS_PAK)).digest('hex')
  : 'missing';
const CONFIG_LABEL = crypto.createHash('sha256')
  .update(IMAGE + '\0' + RCON_PASSWORD + '\0' + SERVER_MOD_HASH + '\0' + ETJS_PAK_HASH)
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
  '+set', 'g_speed', '400',
  '+set', 'g_bluelimbotime', '1000',
  '+set', 'g_redlimbotime', '1000',
  /* Automatically enter the reinforcement queue after death. Without this,
   * ET keeps displaying the one-second wave while waiting for a manual tapout. */
  '+set', 'g_forcerespawn', '1',
  '+set', 'omnibot_enable', '1',
  '+set', 'omnibot_path', './legacy/omni-bot',
  '+set', 'omnibot_flags', '0',
  '+set', 'g_xpSaver', '15',
  '+set', 'g_xpSaverMaxAge', '604800',
  '+set', 'rconpassword', RCON_PASSWORD,
  '+set', 'logfile', '2',
  '+set', 'com_hunkMegs', '128',
  '+map', 'oasis',
  '+exec', 'objectiverotate.cfg',
  /* legacy's defaultpublic config is loaded during map init and resets speed. */
  '+set', 'g_speed', '400',
  '+set', 'g_friendlyFire', '0',
  '+set', 'g_forcerespawn', '1'
];

function assertOfficialPaks() {
  const required = ['pak0.pk3', 'pak1.pk3', 'pak2.pk3'];
  const missing = required.filter((name) => !fs.existsSync(path.join(RUNTIME_ETMAIN, name)));
  if (missing.length) {
    throw new Error('official ET paks missing from ' + RUNTIME_ETMAIN + ': ' + missing.join(', '));
  }
}

/**
 * Validate/provision the host's ignored game-data cache. The fetch script uses
 * pinned SHA-256 sums and only contacts Splash Damage when an official file is
 * missing or invalid. Browsers never use that upstream URL; they download the
 * resulting files from this ETJS host under /etmain and /legacy.
 */
function ensureGameData() {
  execFileSync('sh', [DATA_FETCHER], {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit'
  });
  assertOfficialPaks();
}

function assertServerMod() {
  if (!fs.existsSync(SERVER_MOD)) {
    throw new Error('ETJS server game module missing; run: npm run build:server-mod');
  }
  if (!fs.existsSync(ETJS_PAK)) {
    throw new Error('ETJS data pak missing; run: npm run build:pak');
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
  assertServerMod();
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
  SERVER_MOD: SERVER_MOD,
  ETJS_PAK: ETJS_PAK,
  IMAGE: IMAGE,
  CONTAINER: CONTAINER,
  HOST_UDP_PORT: HOST_UDP_PORT,
  CONTAINER_UDP_PORT: CONTAINER_UDP_PORT,
  RCON_PASSWORD: RCON_PASSWORD,
  RCON_FILE: RCON_FILE,
  DATA_FETCHER: DATA_FETCHER,
  CONFIG_LABEL: CONFIG_LABEL,
  DEFAULT_ARGS: DEFAULT_ARGS,
  assertOfficialPaks: assertOfficialPaks,
  ensureGameData: ensureGameData,
  assertServerMod: assertServerMod,
  dockerAvailable: dockerAvailable,
  containerRunning: containerRunning,
  containerConfigured: containerConfigured,
  startDedicated: startDedicated,
  stopDedicated: stopDedicated,
  followLogs: followLogs
};
