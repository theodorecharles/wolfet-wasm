'use strict';

const { fillPlan, applyFill, MATCH_SLOTS } = require('./botfill');
const { queryStatus } = require('./status');
const { sendRcon } = require('./rcon');

const TEAMS = ['axis', 'allies'];
const CLASSES = ['soldier', 'medic', 'engineer', 'fieldops', 'covertops'];

function isLikelyHuman(player) {
  return player.kind === 'human';
}

/**
 * Omni-Bot reports ping 0. After a protocol connect, humans can also be
 * ping 0 until they send snapshots — callers may pass extra human names.
 */
function rosterFromStatus(status, humanNames) {
  const named = new Set((humanNames || []).map((n) => String(n).toLowerCase()));
  let humans = 0;
  let bots = 0;
  (status.players || []).forEach((p) => {
    const n = String(p.name || '');
    if (/\[BOT\]/i.test(n) || p.kind === 'bot') {
      bots += 1;
    } else if (named.has(n.toLowerCase()) || p.kind === 'human') {
      humans += 1;
    } else {
      bots += 1;
    }
  });
  return { humans: humans, bots: bots, slots: MATCH_SLOTS };
}

function stripColors(name) {
  return String(name || '').replace(/\^[0-9a-zA-Z]/g, '').replace(/\[BOT\]/gi, '').trim();
}

function makeRconHooks(rconOpts, log, botNames) {
  let addIndex = 0;
  const names = (botNames || []).slice();
  return {
    addBot: async function () {
      const team = TEAMS[addIndex % TEAMS.length];
      const cls = CLASSES[addIndex % CLASSES.length];
      addIndex += 1;
      const cmd = 'bot addbot ' + team + ' ' + cls;
      if (log) {
        log('botfill add: ' + cmd);
      }
      try {
        await sendRcon(cmd, rconOpts);
      } catch (err) {
        if (log) {
          log('botfill add failed: ' + err.message);
        }
      }
    },
    removeBot: async function () {
      const raw = names.pop();
      const shortName = stripColors(raw);
      const cmd = shortName ? 'bot kickbot ' + shortName : 'bot kickbot';
      if (log) {
        log('botfill remove: ' + cmd);
      }
      try {
        await sendRcon(cmd, rconOpts);
      } catch (err) {
        if (log) {
          log('botfill remove failed: ' + err.message);
        }
      }
    }
  };
}

async function reconcile(opts) {
  const status = await queryStatus({
    host: opts.host,
    port: opts.port,
    timeoutMs: opts.timeoutMs
  });
  const state = rosterFromStatus(status, opts.humanNames);
  const plan = fillPlan(state);
  const botNames = (status.players || [])
    .filter((p) => p.kind === 'bot' && /\[BOT\]/i.test(String(p.name || '')))
    .map((p) => p.name);
  const hooks = makeRconHooks({
    host: opts.host,
    port: opts.port,
    password: opts.password
  }, opts.log, botNames);

  try {
    /* Omni-Bot minplayers is total humans+bots. Always keep the 12-slot match full. */
    await sendRcon('bot minplayers ' + MATCH_SLOTS, {
      host: opts.host,
      port: opts.port,
      password: opts.password
    });
  } catch (err) {
    if (opts.log) {
      opts.log('botfill minplayers failed: ' + err.message);
    }
  }
  for (let i = 0; i < plan.add; i++) {
    await hooks.addBot();
  }
  for (let i = 0; i < plan.remove; i++) {
    await hooks.removeBot();
  }
  return { status: status, state: state, plan: plan };
}

function startSupervisor(opts) {
  const intervalMs = (opts && opts.intervalMs) || 4000;
  let timer = null;
  let stopped = false;

  const tick = async () => {
    if (stopped) {
      return;
    }
    try {
      const result = await reconcile(opts);
      if (opts.onTick) {
        opts.onTick(result);
      }
    } catch (err) {
      if (opts.log) {
        opts.log('bot supervisor: ' + err.message);
      }
    }
  };

  timer = setInterval(tick, intervalMs);
  // kick Omni-Bot's own minplayers as a belt-and-suspenders fill
  sendRcon('bot minplayers ' + MATCH_SLOTS, {
    host: opts.host,
    port: opts.port,
    password: opts.password
  }).catch(() => {});
  tick();

  return {
    stop: () => {
      stopped = true;
      if (timer) {
        clearInterval(timer);
      }
    }
  };
}

module.exports = {
  rosterFromStatus: rosterFromStatus,
  reconcile: reconcile,
  startSupervisor: startSupervisor,
  applyFill: applyFill,
  TEAMS: TEAMS,
  CLASSES: CLASSES
};
