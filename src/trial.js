/**
 * @file Provas em grupo da Entidade: até quatro sobreviventes do chat acendem faróis, escapam do Pálido e tentam cruzar o portão
 * da névoa. A regra inteira vive aqui, sem Twitch nem HTTP: o jogo (game.js) só traduz comandos em chamadas.
 *
 * Sem relógio próprio: nada acontece "sozinho". Cada comando (e cada consulta de estado) chama `advance`, que simula, em ordem, os
 * ataques do Pálido e os tempos de grilhão que já passaram. Assim a prova sobrevive a reinícios do servidor e é testável com um
 * relógio de mentira.
 */
import { HUNTERS } from './catalogue.js';

export const MAX_PLAYERS = 4;
const MAX_STEPS = 80;
const LOG_LIMIT = 30;

/** Tempos em ms. A demonstração do navegador corre bem mais rápido. */
export const TIMING = {
  real: { lobby: 45_000, tick: 20_000, cooldown: 15_000, stage: 60_000, max: 480_000, rest: 120_000 },
  demo: { lobby: 2_500, tick: 5_000, cooldown: 3_000, stage: 14_000, max: 150_000, rest: 15_000, hitScale: 0.45 },
};

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * @param {object} store
 * @param {object} deps
 * @param {() => number} deps.now
 * @param {() => number} deps.random
 * @param {new (message: string, status?: number) => Error} deps.GameError
 * @param {(player: object) => object} deps.effectsFor efeitos de talentos e ferramenta de um jogador (linha do banco)
 * @param {(channel: string, playerId: string, id: string) => boolean} deps.consume gasta 1 item da mochila, se houver
 * @param {(channel: string, playerId: string, id: string) => number} deps.count quantidade de um item
 * @param {string} [deps.prefix]
 */
export function createTrials(store, { now, random, GameError, effectsFor, consume, count, prefix = '!' }) {
  const { db } = store;
  const activeRow = db.prepare("SELECT id, data FROM trials WHERE channel = ? AND status IN ('lobby', 'running')");
  const lastEnded = db.prepare("SELECT id, data, updated_at FROM trials WHERE channel = ? AND status = 'ended' ORDER BY id DESC LIMIT 1");
  const insert = db.prepare("INSERT INTO trials(channel, status, data, created_at, updated_at) VALUES (?, 'lobby', ?, ?, ?)");
  const update = db.prepare('UPDATE trials SET status = ?, data = ?, updated_at = ? WHERE id = ?');
  const getPlayer = db.prepare('SELECT * FROM players WHERE channel = ? AND player_id = ?');
  const reward = db.prepare(`UPDATE players SET coins = coins + ?, xp = xp + ?, escapes = escapes + ?, trials = trials + 1,
    trial_deaths = trial_deaths + ? WHERE channel = ? AND player_id = ?`);
  const journal = db.prepare(`INSERT INTO events(channel, player_id, display_name, kind, item_id, text, created_at)
    VALUES (?, ?, ?, 'trial', NULL, ?, ?)`);

  // ------------------------------------------------------------------ dados --

  function say(data, text, events) {
    data.log.push({ t: now(), text });
    if (data.log.length > LOG_LIMIT) data.log.shift();
    events?.push(text);
  }

  /** Eventos públicos estruturados: a cena reage aos mesmos fatos que o jogo resolveu. */
  function motion(data, kind, details = {}, at = now()) {
    data.sceneSequence = (data.sceneSequence || 0) + 1;
    data.sceneEvents ||= [];
    data.sceneEvents.push({ id: data.sceneSequence, at, kind, ...details });
    if (data.sceneEvents.length > 64) data.sceneEvents.splice(0, data.sceneEvents.length - 64);
  }

  const alive = (data) => Object.values(data.players).filter((p) => p.state === 'ok' || p.state === 'hurt');
  const caught = (data) => Object.values(data.players).filter((p) => p.state === 'caught');
  const generatorsDone = (data) => data.generators.filter((value) => value >= 100).length;
  const stageMs = (data, p) => data.timing.stage * (1 + (p.fx.shackle || 0));
  const woundsFor = p => Number.isInteger(p.wounds) ? clamp(p.wounds, 0, 3) : p.state === 'caught' ? 2 : p.state === 'hurt' ? 1 : 0;

  function newPlayer(row) {
    return { id: row.player_id, login: row.login, name: row.display_name, state: 'ok', caughtAt: 0, nextActionAt: 0,
      hidden: false, marked: false, windUsed: false, wounds: 0, lastRepairAt: 0, repairs: 0, heals: 0, rescues: 0, fx: effectsFor(row) };
  }

  // -------------------------------------------------------------- simulação --

  function startRunning(data, at, events) {
    data.phase = 'running';
    data.startedAt = at;
    data.endsAt = at + data.timing.max;
    data.busyUntil = 0;
    data.nextTickAt = at + Math.round(data.timing.tick * data.hunter.tickScale);
    motion(data, 'start', {}, at);
    say(data, `${data.hunter.name} entrou na prova. Acendam ${data.generators.length} faróis e fujam pelo portão!`, events);
  }

  /** Um ataque do Pálido (e os grilhões) no instante `at`. */
  function tick(data, at, events) {
    settleCaught(data, at, events);
    if (data.busyUntil <= at) {
      const targets = alive(data);
      if (targets.length) {
        const weights = targets.map((p) => (p.hidden ? 0.35 : 1) + (at - p.lastRepairAt <= data.timing.tick ? 0.5 : 0));
        let roll = random() * weights.reduce((sum, value) => sum + value, 0);
        let target = targets[targets.length - 1];
        for (let i = 0; i < targets.length; i++) { roll -= weights[i]; if (roll < 0) { target = targets[i]; break; } }
        const hideEffect = data.hunter.hideEffect ?? 1;
        const raw = data.hunter.hit - target.fx.evade
          - (target.hidden ? (0.30 + target.fx.hide) * hideEffect : 0) + (target.marked ? 0.15 : 0) + (data.gates ? 0.08 : 0);
        const chance = clamp(raw, 0.08, 0.92) * (data.timing.hitScale ?? 1);
        let outcome = 'miss';
        const previousWounds = woundsFor(target);
        if (random() < chance) {
          if (target.state === 'ok') {
            target.state = 'hurt';
            outcome = 'hit';
            say(data, `${data.hunter.name} acertou ${target.name}, que seguiu ferido.`, events);
          } else if (target.fx.secondWind && !target.windUsed) {
            target.windUsed = true;
            outcome = 'secondWind';
            say(data, `${target.name} usou Segundo fôlego e resistiu ao golpe.`, events);
          } else {
            target.state = 'caught';
            outcome = 'caught';
            target.caughtAt = at;
            data.busyUntil = at + data.timing.tick;
            say(data, `${target.name} foi preso aos grilhões! Use ${prefix}libertar ${target.login}.`, events);
          }
        } else {
          say(data, `${target.name} escapou de um golpe de ${data.hunter.name}.`, events);
        }
        if (outcome === 'hit' || outcome === 'caught') target.wounds = Math.min(3, previousWounds + 1);
        motion(data, 'attack', { target: target.login, outcome, wounds: woundsFor(target) }, at);
      }
    }
    for (const p of Object.values(data.players)) { p.hidden = false; p.marked = false; }
    const next = Math.round(data.timing.tick * data.hunter.tickScale * (data.gates ? 0.8 : 1));
    data.nextTickAt = at + next;
  }

  function settleCaught(data, at, events) {
    for (const p of caught(data)) {
      const elapsed = at - p.caughtAt;
      if (elapsed >= 2 * stageMs(data, p)) {
        p.state = 'dead';
        motion(data, 'death', { actor: p.login }, p.caughtAt + 2 * stageMs(data, p));
        say(data, `${p.name} sucumbiu à névoa.`, events);
      }
    }
  }

  /** Aplica tudo o que o relógio já fez. Devolve true se a prova terminou agora. */
  function advance(data, at, events) {
    if (data.phase === 'lobby') {
      if (at >= data.startsAt) startRunning(data, data.startsAt, events);
      else return false;
    }
    if (data.phase !== 'running') return false;
    let steps = 0;
    while (data.nextTickAt <= at && data.nextTickAt < data.endsAt && steps++ < MAX_STEPS) {
      tick(data, data.nextTickAt, events);
      if (isOver(data)) break;
    }
    settleCaught(data, Math.min(at, data.endsAt), events);
    if (isOver(data) || at >= data.endsAt) {
      if (!isOver(data)) {
        for (const p of Object.values(data.players)) {
          if (p.state === 'ok' || p.state === 'hurt' || p.state === 'caught') {
            p.state = 'dead';
            motion(data, 'death', { actor: p.login }, data.endsAt);
            say(data, `${p.name} se perdeu quando a névoa se fechou.`, events);
          }
        }
      }
      finish(data, at, events);
      return true;
    }
    return false;
  }

  const isOver = (data) => Object.values(data.players).every((p) => p.state === 'dead' || p.state === 'escaped');

  /** Calcula e aplica as recompensas. Chamado uma única vez (a prova passa a "ended"). */
  function finish(data, at, events) {
    data.phase = 'ended';
    data.endedAt = at;
    const escaped = Object.values(data.players).filter((p) => p.state === 'escaped').length;
    const won = escaped > 0;
    const bonus = won ? 1.25 : 1;
    data.result = { outcome: won ? 'escaped' : 'lost', escaped, rewards: {} };
    motion(data, 'end', { outcome: data.result.outcome }, at);
    for (const p of Object.values(data.players)) {
      let coins = 0;
      let xp = 0;
      if (p.state === 'escaped') { coins += 90; xp += 60; } else { coins += 20; xp += 15; }
      coins += Math.min(12, p.repairs) * 6 + p.rescues * 25 + p.heals * 10;
      xp += Math.min(12, p.repairs) * 8 + p.rescues * 25 + p.heals * 10;
      coins = Math.round(coins * bonus);
      xp = Math.round(xp * bonus * (p.fx.xpMultiplier || 1));
      data.result.rewards[p.id] = { coins, xp, escaped: p.state === 'escaped' };
      reward.run(coins, xp, p.state === 'escaped' ? 1 : 0, p.state === 'dead' ? 1 : 0, data.channel, p.id);
      journal.run(data.channel, p.id, p.name, `${p.name} ${p.state === 'escaped' ? 'escapou da prova' : 'não saiu da névoa'}: +${coins} Brasas, +${xp} XP.`, at);
    }
    say(data, won ? `Prova encerrada: ${escaped} ${escaped === 1 ? 'sobrevivente escapou' : 'sobreviventes escaparam'}.`
      : 'Prova encerrada: ninguém escapou da névoa.', events);
  }

  // ------------------------------------------------------------ persistência --

  function activeTrial(channel) {
    const row = activeRow.get(channel);
    return row ? { id: row.id, data: JSON.parse(row.data) } : null;
  }

  function persist(trial) {
    update.run(trial.data.phase === 'ended' ? 'ended' : trial.data.phase, JSON.stringify(trial.data), now(), trial.id);
  }

  /** Avança o relógio de uma prova aberta e a grava. Devolve os eventos novos e se terminou. */
  function settle(channel) {
    const trial = activeTrial(channel);
    if (!trial) return { trial: null, events: [], ended: false };
    const events = [];
    const ended = advance(trial.data, now(), events);
    persist(trial);
    return { trial, events, ended };
  }

  // ----------------------------------------------------------------- comandos --

  const timingFor = (isDemo) => (isDemo ? TIMING.demo : TIMING.real);

  function news(events) {
    if (!events.length) return '';
    const shown = events.slice(-2).join(' ');
    return ` · ${shown}${events.length > 2 ? ` (+${events.length - 2})` : ''}`;
  }

  function remaining(data, at) {
    return Math.max(0, Math.ceil(((data.phase === 'lobby' ? data.startsAt : data.endsAt) - at) / 1000));
  }

  function summary(data, at) {
    if (data.phase === 'lobby') {
      return `Prova aberta (${Object.keys(data.players).length}/${MAX_PLAYERS}): ${Object.values(data.players).map((p) => p.name).join(', ')}. `
        + `Começa em ${remaining(data, at)}s. Entre com ${prefix}entrar.`;
    }
    const states = Object.values(data.players);
    const count = (state) => states.filter((p) => p.state === state).length;
    return `Prova em andamento · ${data.hunter.name} · faróis ${generatorsDone(data)}/${data.generators.length}${data.gates ? ' (portão aberto: !fugir)' : ''}`
      + ` · livres ${count('ok') + count('hurt')} · presos ${count('caught')} · fora ${count('dead') + count('escaped')} · ${remaining(data, at)}s.`;
  }

  function open(player, isDemo) {
    const channel = player.channel;
    const settled = settle(channel);
    if (settled.trial) {
      const at = now();
      return { kind: 'info', reply: `${summary(settled.trial.data, at)}${news(settled.events)}` };
    }
    const previous = lastEnded.get(channel);
    const timing = timingFor(isDemo);
    if (previous && timing.rest && now() - previous.updated_at < timing.rest) {
      const wait = Math.ceil((timing.rest - (now() - previous.updated_at)) / 1000);
      throw new GameError(`A névoa ainda está se reorganizando. Uma nova prova abre em ${wait}s.`, 429);
    }
    const hunter = HUNTERS[Math.floor(random() * HUNTERS.length) % HUNTERS.length];
    const at = now();
    const data = { channel, phase: 'lobby', timing, openedAt: at, startsAt: at + timing.lobby, hunter: { ...hunter },
      generators: [0, 0], gates: false, players: {}, log: [], result: null };
    data.players[player.player_id] = newPlayer(player);
    motion(data, 'join', { actor: player.login });
    data.generators = Array(clamp(Object.keys(data.players).length + 1, 2, 5)).fill(0);
    say(data, `${player.display_name} abriu uma prova. ${hunter.name} está à espreita.`);
    insert.run(channel, JSON.stringify(data), at, at);
    return { kind: 'trial', reply: `${player.display_name} abriu uma prova contra ${hunter.name}! Entrem com ${prefix}entrar: começa em ${Math.round(timing.lobby / 1000)}s (até ${MAX_PLAYERS} sobreviventes).` };
  }

  function join(player) {
    const { trial, events } = settle(player.channel);
    if (!trial) throw new GameError(`Não há prova aberta. Use ${prefix}prova para abrir uma.`);
    const data = trial.data;
    if (data.phase !== 'lobby') throw new GameError('A prova já começou. Espere a próxima.');
    if (data.players[player.player_id]) throw new GameError('Você já está nesta prova.');
    if (Object.keys(data.players).length >= MAX_PLAYERS) throw new GameError('A prova está cheia.');
    data.players[player.player_id] = newPlayer(player);
    motion(data, 'join', { actor: player.login });
    data.generators = Array(clamp(Object.keys(data.players).length + 1, 2, 5)).fill(0);
    say(data, `${player.display_name} entrou na prova.`);
    let reply = `${player.display_name} entrou na prova (${Object.keys(data.players).length}/${MAX_PLAYERS}). Faróis necessários: ${data.generators.length}.`;
    if (Object.keys(data.players).length >= MAX_PLAYERS) {
      data.startsAt = now();
      advance(data, now(), events);
      reply += ' Prova cheia: começou!';
    }
    persist(trial);
    return { kind: 'trial', reply };
  }

  /** Verifica prova em andamento e jogador vivo; devolve o contexto da ação. */
  function actor(player, label) {
    const { trial, events, ended } = settle(player.channel);
    if (!trial) throw new GameError(ended ? 'A prova terminou.' : `Não há prova em andamento. Use ${prefix}prova.`);
    const data = trial.data;
    const self = data.players[player.player_id];
    if (!self) throw new GameError(`Você não está nesta prova. Entre na próxima com ${prefix}entrar.`);
    if (data.phase === 'lobby') throw new GameError(`A prova ainda não começou (${remaining(data, now())}s).`);
    if (self.state === 'dead') throw new GameError('A névoa já levou você. Descanse até a próxima prova.');
    if (self.state === 'escaped') throw new GameError('Você já escapou desta prova.');
    if (self.state === 'caught' && label !== 'preso') throw new GameError('Você está preso aos grilhões. Espere alguém libertar você.');
    return { trial, data, self, events };
  }

  function cooldownLeft(self, at) {
    return Math.max(0, self.nextActionAt - at);
  }

  function closing(trial, events) {
    persist(trial);
    return news(events);
  }

  function repair(player) {
    const { trial, data, self, events } = actor(player);
    const at = now();
    if (cooldownLeft(self, at)) throw new GameError(`Seu próximo reparo em ${Math.ceil(cooldownLeft(self, at) / 1000)}s.`, 429);
    const index = data.generators.findIndex((value) => value < 100);
    if (index < 0) throw new GameError(`Todos os faróis estão acesos. Corra: ${prefix}fugir.`);
    let multiplier = 1 + (self.fx.toolRepair || 0) + (self.fx.repair || 0);
    if (self.state === 'hurt') multiplier *= 0.85;
    const boxed = consume(player.channel, player.player_id, 'caixa-reparo');
    if (boxed) multiplier *= 1.6;
    const amount = Math.round((9 + Math.floor(random() * 6)) * multiplier);
    const previous = data.generators[index];
    data.generators[index] = Math.min(100, previous + amount);
    self.repairs++;
    self.lastRepairAt = at;
    self.nextActionAt = at + data.timing.cooldown;
    motion(data, 'repair', { actor: self.login, generator: index, value: data.generators[index], amount: data.generators[index] - previous, boxed }, at);
    let reply = `${player.display_name} consertou o Farol ${index + 1}: ${data.generators[index]}%${boxed ? ' (caixa de reparo usada)' : ''}.`;
    if (data.generators[index] >= 100) {
      say(data, `O Farol ${index + 1} acendeu.`);
      motion(data, 'beacon', { generator: index }, at);
      reply += ` Acesos: ${generatorsDone(data)}/${data.generators.length}.`;
      if (generatorsDone(data) === data.generators.length) {
        data.gates = true;
        motion(data, 'gate', {}, at);
        say(data, 'O portão da névoa se abriu! Fujam!');
        reply += ` O portão da névoa se abriu: ${prefix}fugir!`;
      }
    }
    return { kind: 'trial', reply: reply + closing(trial, events) };
  }

  function hide(player) {
    const { trial, data, self, events } = actor(player);
    const at = now();
    if (cooldownLeft(self, at)) throw new GameError(`Você poderá se esconder em ${Math.ceil(cooldownLeft(self, at) / 1000)}s.`, 429);
    self.hidden = true;
    motion(data, 'hide', { actor: self.login }, at);
    self.nextActionAt = at + Math.round(data.timing.cooldown * 1.5);
    return { kind: 'trial', reply: `${player.display_name} se escondeu: menos chance de ser o alvo do próximo ataque.${closing(trial, events)}` };
  }

  function findTarget(data, text) {
    const login = String(text || '').replace(/^@/, '').toLowerCase();
    return Object.values(data.players).find((p) => p.login === login) ?? null;
  }

  function heal(player, targetText) {
    const { trial, data, self, events } = actor(player);
    const at = now();
    if (cooldownLeft(self, at)) throw new GameError(`Sua próxima cura em ${Math.ceil(cooldownLeft(self, at) / 1000)}s.`, 429);
    const target = targetText ? findTarget(data, targetText) : self;
    if (!target) throw new GameError('Esse sobrevivente não está na prova.');
    if (target.state !== 'hurt') throw new GameError(target.id === self.id ? 'Você não está ferido.' : `${target.name} não precisa de cura.`);
    const kit = consume(player.channel, player.player_id, 'kit-curativo');
    const own = target.id === self.id;
    target.state = 'ok';
    target.wounds = 0;
    self.heals += own ? 0 : 1;
    const base = data.timing.cooldown * (own && !kit ? 2 : 1) * (self.fx.healCooldown ?? 1);
    self.nextActionAt = at + Math.round(base);
    motion(data, 'heal', { actor: self.login, target: target.login, kit, wounds: 0 }, at);
    const who = own ? 'se curou' : `curou ${target.name}`;
    return { kind: 'trial', reply: `${player.display_name} ${who}${kit ? ' com um kit curativo' : ''}.${closing(trial, events)}` };
  }

  function free(player, targetText) {
    const { trial, data, self, events } = actor(player);
    const at = now();
    if (cooldownLeft(self, at)) throw new GameError(`Você poderá libertar em ${Math.ceil(cooldownLeft(self, at) / 1000)}s.`, 429);
    const target = findTarget(data, targetText);
    if (!targetText || !target) throw new GameError(`Diga quem libertar: ${prefix}libertar @nome.`);
    if (target.id === self.id) throw new GameError('Você não consegue se libertar sozinho.');
    if (target.state !== 'caught') throw new GameError(`${target.name} não está preso.`);
    target.wounds = Math.max(2, woundsFor(target));
    target.state = 'hurt';
    target.caughtAt = 0;
    self.rescues++;
    if (!self.fx.fearlessRescue) self.marked = true;
    self.nextActionAt = at + data.timing.cooldown;
    motion(data, 'rescue', { actor: self.login, target: target.login, wounds: target.wounds }, at);
    say(data, `${player.display_name} libertou ${target.name}.`);
    return { kind: 'trial', reply: `${player.display_name} libertou ${target.name}!${self.marked ? ' O Pálido notou o barulho.' : ''}${closing(trial, events)}` };
  }

  function flee(player) {
    const { trial, data, self, events } = actor(player);
    if (!data.gates) throw new GameError(`O portão ainda está fechado: faróis ${generatorsDone(data)}/${data.generators.length}.`);
    self.state = 'escaped';
    motion(data, 'escape', { actor: self.login });
    say(data, `${self.name} escapou pelo portão da névoa.`);
    const finished = isOver(data);
    if (finished) finish(data, now(), events);
    persist(trial);
    const result = finished ? data.result : null;
    const mine = result?.rewards[self.id];
    const extra = events.filter((line) => !line.includes('escapou pelo portão'));
    return { kind: 'trial', reply: `${player.display_name} escapou pelo portão da névoa!${mine ? ` Prova encerrada: +${mine.coins} Brasas, +${mine.xp} XP.` : ''}${news(extra)}`,
      ...(finished ? { trialEnded: true } : {}) };
  }

  /** Para a página: estado público da prova (avança o relógio, então já resolve ataques pendentes). */
  function publicState(channel) {
    const settled = settle(channel);
    const record = settled.trial ?? lastEnded.get(channel);
    const data = record ? (typeof record.data === 'string' ? JSON.parse(record.data) : record.data) : null;
    if (!data) return null;
    const at = now();
    return { id: record.id, openedAt: data.openedAt, phase: data.phase,
      nextTrialAt: data.phase === 'ended' ? (record.updated_at ?? data.endedAt ?? at) + timingFor(channel.startsWith('demo:')).rest : 0,
      nextAttackAt: data.nextTickAt || 0, actionCooldownMs: data.timing.cooldown,
      sceneEvents: data.sceneEvents || [],
      hunter: { id: data.hunter.id, name: data.hunter.name, description: data.hunter.description },
      generators: data.generators, gates: data.gates, secondsLeft: data.phase === 'ended' ? 0 : remaining(data, at),
      players: Object.values(data.players).map((p) => ({ login: p.login, name: p.name, state: p.state,
        repairs: p.repairs, hidden: p.hidden, nextActionAt: p.nextActionAt, wounds: woundsFor(p) })),
      log: data.log.slice(-12).map((entry) => ({ text: entry.text, at: entry.t })),
      result: data.result ? { outcome: data.result.outcome, escaped: data.result.escaped } : null };
  }

  return { open, join, repair, hide, heal, free, flee, publicState, settle };
}
