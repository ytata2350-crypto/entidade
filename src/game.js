/**
 * @file Regras da Entidade usadas igualmente pelo navegador, API e chat da Twitch.
 * Sorteios, compras e vendas são atômicos; o ID da mensagem impede recompensas duplicadas.
 * As provas em grupo (faróis, Pálido, grilhões) ficam em trial.js.
 */
import { createHash, randomInt } from 'node:crypto';
import { ITEMS, RARITIES, EQUIPMENT, BACKPACKS, REGIONS, COMMANDS, LIGHTS, TALENTS, ALIASES,
  talentSlots, equipmentForTier, equipmentForItem } from './catalogue.js';
import { createTrials } from './trial.js';

export class GameError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

/** @param {number} xp @returns {number} Nível derivado do XP acumulado. */
export const levelForXp = (xp) => 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 40));

const COMMAND_IDS = new Set([...COMMANDS.map(([id]) => id), ...Object.keys(ALIASES)]);

/** @param {string} text @param {string} prefix @returns {boolean} */
export function isGameCommand(text, prefix = '!') {
  const name = String(text).trim().split(/\s+/)[0];
  return name.startsWith(prefix) && COMMAND_IDS.has(name.slice(prefix.length).toLowerCase());
}

const parseList = (json) => { try { const list = JSON.parse(json || '[]'); return Array.isArray(list) ? list : []; } catch { return []; } };

/** @param {object} store @param {object} [options] @returns {object} Serviço do jogo. */
export function createGame(store, options = {}) {
  const { db } = store;
  const now = options.now ?? Date.now;
  const random = options.random ?? (() => randomInt(1_000_000) / 1_000_000);
  const prefix = options.prefix ?? '!';
  const cooldownMs = options.cooldownMs ?? 600_000;
  const demoCooldownMs = options.demoCooldownMs ?? 30_000;
  const searchWaitFor = player => Math.max(player.channel.startsWith('demo:') ? 10_000 : 60_000,
    Math.round((player.channel.startsWith('demo:') ? demoCooldownMs : cooldownMs) * EQUIPMENT[player.equipped_tier].cooldown));
  const get = db.prepare('SELECT * FROM players WHERE channel = ? AND player_id = ?');
  const inventory = db.prepare('SELECT item_id, quantity FROM inventory WHERE channel = ? AND player_id = ? AND quantity > 0');
  const discoveries = db.prepare('SELECT item_id FROM discoveries WHERE channel = ? AND player_id = ?');
  const countItems = db.prepare('SELECT COALESCE(SUM(quantity), 0) AS total FROM inventory WHERE channel = ? AND player_id = ?');
  const addItem = db.prepare(`INSERT INTO inventory(channel, player_id, item_id, quantity) VALUES (?, ?, ?, ?)
    ON CONFLICT(channel, player_id, item_id) DO UPDATE SET quantity = quantity + excluded.quantity`);
  const removeItem = db.prepare(`UPDATE inventory SET quantity = quantity - ?
    WHERE channel = ? AND player_id = ? AND item_id = ? AND quantity >= ?`);
  const itemCount = db.prepare('SELECT quantity FROM inventory WHERE channel = ? AND player_id = ? AND item_id = ?');
  const log = db.prepare(`INSERT INTO events(channel, player_id, display_name, kind, item_id, text, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const readReceipt = db.prepare('SELECT fingerprint, response FROM receipts WHERE channel = ? AND message_id = ?');

  // ------------------------------------------------------------- efeitos --

  function equippedTalents(player) {
    return parseList(player.equipped_talents).map((id) => TALENTS.find((entry) => entry.id === id)).filter(Boolean);
  }

  /** Efeitos somados dos talentos equipados e da ferramenta. Fica "congelado" ao entrar numa prova. */
  function effectsFor(player) {
    const fx = { repair: 0, evade: 0, hide: 0, shackle: 0, luck: 0, healCooldown: 1, fearlessRescue: false, secondWind: false };
    for (const talent of equippedTalents(player)) {
      for (const [key, value] of Object.entries(talent.effects)) {
        if (typeof value === 'boolean') fx[key] = fx[key] || value;
        else if (key === 'healCooldown') fx[key] = Math.min(fx[key], value);
        else fx[key] += value;
      }
    }
    const equipment = EQUIPMENT[player.equipped_tier];
    const light = LIGHTS[player.light_level];
    fx.toolRepair = equipment.repair;
    fx.xpMultiplier = equipment.xpMultiplier * light.xpMultiplier;
    return fx;
  }

  function bonusesFor(player) {
    const equipment = EQUIPMENT[player.equipped_tier];
    const light = LIGHTS[player.light_level];
    const fx = effectsFor(player);
    const progress = Math.min(39, Math.max(0, levelForXp(player.xp) - 1)) / 39;
    return { luck: equipment.luck + light.luck + progress * 0.25 + fx.luck, equipmentLuck: equipment.luck,
      lightLuck: light.luck, levelLuck: progress * 0.25, talentLuck: fx.luck, repair: fx.toolRepair + fx.repair,
      evade: fx.evade, xpMultiplier: fx.xpMultiplier, sellMultiplier: 1 + progress * 0.20,
      cooldownMultiplier: equipment.cooldown, resourceTier: equipment.resourceTier };
  }

  const trials = createTrials(store, {
    now, random, GameError, effectsFor, prefix,
    consume: (channel, playerId, id) => removeItem.run(1, channel, playerId, id, 1).changes > 0,
    count: (channel, playerId, id) => itemCount.get(channel, playerId, id)?.quantity ?? 0,
  });

  function ensurePlayer(channel, playerId, login, displayName) {
    db.prepare(`INSERT INTO players(channel, player_id, login, display_name, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(channel, player_id) DO UPDATE SET login = excluded.login, display_name = excluded.display_name`)
      .run(channel, playerId, login, displayName, now());
    return get.get(channel, playerId);
  }

  function snapshot(player) {
    if (!player) return null;
    const entries = inventory.all(player.channel, player.player_id);
    const level = levelForXp(player.xp);
    const levelStart = 40 * (level - 1) ** 2;
    const nextLevelXp = 40 * level ** 2;
    const learned = parseList(player.talents_json);
    const equipped = equippedTalents(player).map((talent) => talent.id);
    return {
      id: player.player_id, login: player.login, name: player.display_name, coins: player.coins,
      xp: player.xp, level, levelStart, nextLevelXp,
      equipment: EQUIPMENT[player.equipped_tier], ownedTier: player.owned_tier,
      light: LIGHTS[player.light_level],
      talents: { learned, equipped, slots: talentSlots(level) },
      capacity: BACKPACKS[player.backpack].capacity, backpackLevel: player.backpack,
      inventoryCount: entries.reduce((sum, entry) => sum + entry.quantity, 0),
      inventory: entries.map((entry) => ({ id: entry.item_id, quantity: entry.quantity })),
      discoveries: discoveries.all(player.channel, player.player_id).map((entry) => entry.item_id),
      expeditions: player.expeditions, escapes: player.escapes, trials: player.trials, trialDeaths: player.trial_deaths,
      readyAt: player.ready_at, region: player.region,
      searchCooldownMs: player.search_wait_ms || searchWaitFor(player), nextSearchCooldownMs: searchWaitFor(player),
      bonuses: bonusesFor(player),
    };
  }

  function poolFor(player, region) {
    const equipment = EQUIPMENT[player.equipped_tier];
    const bonus = bonusesFor(player);
    return ITEMS.filter((entry) => entry.tier <= equipment.resourceTier
      && equipmentForItem(entry).tier <= equipment.tier && entry.regions.includes(region.id))
      .map((entry) => ({ item: entry, weight: entry.weight * (1 + bonus.luck * entry.rarity) }));
  }

  function oddsFor(player, region) {
    const pool = poolFor(player, region);
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    return { regionId: region.id, eligibleItems: pool.length,
      items: pool.map((entry) => ({ id: entry.item.id, probability: total ? entry.weight / total : 0 })),
      rarities: RARITIES.map((rarity, index) => ({ id: rarity.id, name: rarity.name,
        probability: total ? pool.filter((entry) => entry.item.rarity === index)
          .reduce((sum, entry) => sum + entry.weight, 0) / total : 0 })) };
  }

  function draw(pool) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.max(0, Math.min(0.999999, random())) * total;
    for (const entry of pool) { roll -= entry.weight; if (roll < 0) return entry.item; }
    return pool.at(-1).item;
  }

  function event(player, kind, text, itemId = null, drops = []) {
    log.run(player.channel, player.player_id, player.display_name, kind, itemId, text, now());
    if (drops.length) db.prepare('UPDATE events SET drops_json = ? WHERE id = last_insert_rowid()')
      .run(JSON.stringify(drops));
  }

  // --------------------------------------------------------------- buscas --

  function search(player, requestedRegion) {
    const region = REGIONS.find((entry) => entry.id === (requestedRegion || player.region));
    if (!region) throw new GameError(`Domínio desconhecido. Consulte ${prefix}dominios.`);
    const equipment = EQUIPMENT[player.equipped_tier];
    if (region.tier > equipment.resourceTier) {
      throw new GameError(`${region.name} exige ${equipmentForTier(region.tier).name} equipada ou uma ferramenta superior.`);
    }
    if (player.ready_at > now()) {
      throw new GameError(`Sua próxima busca estará pronta em ${Math.ceil((player.ready_at - now()) / 1000)}s.`, 429);
    }
    const freeSpace = BACKPACKS[player.backpack].capacity - countItems.get(player.channel, player.player_id).total;
    if (freeSpace < 1) {
      throw new GameError(`Sua bolsa está cheia. Use ${prefix}vender ou compre uma bolsa maior.`);
    }
    // O filtro é uma barreira real: nenhum aumento de sorte pode sortear um item de uma ferramenta superior.
    const pool = poolFor(player, region);
    if (!pool.length) throw new GameError('Não há achados disponíveis neste domínio.');
    const found = draw(pool);
    const bonus = bonusesFor(player);
    const xp = Math.round(RARITIES[found.rarity].xp * bonus.xpMultiplier);
    const duration = searchWaitFor(player);
    addItem.run(player.channel, player.player_id, found.id, 1);
    db.prepare('INSERT OR IGNORE INTO discoveries(channel, player_id, item_id) VALUES (?, ?, ?)')
      .run(player.channel, player.player_id, found.id);
    db.prepare(`UPDATE players SET xp = xp + ?, expeditions = expeditions + 1, ready_at = ?, region = ?, search_wait_ms = ?
      WHERE channel = ? AND player_id = ?`).run(xp, now() + duration, region.id, duration, player.channel, player.player_id);
    const drops = [{ id: found.id, quantity: 1 }];
    const reply = `${player.display_name} encontrou ${found.name} (${RARITIES[found.rarity].name}) em ${region.name}. +${xp} XP. Valor base: ${found.value} Brasas.`;
    event(player, 'explore', reply, found.id, drops);
    return { reply, kind: 'explore', itemId: found.id, xpGained: xp, drops };
  }

  function sell(player, itemId, amountText) {
    if (!itemId) throw new GameError(`Use ${prefix}vender <item> [quantidade] ou ${prefix}vender tudo.`);
    const entries = inventory.all(player.channel, player.player_id);
    let value = 0;
    let quantity = 0;
    if (itemId === 'tudo') {
      if (amountText) throw new GameError('A venda de tudo não aceita quantidade.');
      for (const entry of entries) {
        value += ITEMS.find((item) => item.id === entry.item_id).value * entry.quantity;
        quantity += entry.quantity;
      }
      if (!quantity) throw new GameError('Sua bolsa está vazia.');
      db.prepare('DELETE FROM inventory WHERE channel = ? AND player_id = ?').run(player.channel, player.player_id);
    } else {
      const item = ITEMS.find((entry) => entry.id === itemId);
      if (!item) throw new GameError('Item desconhecido. Consulte sua bolsa para ver os identificadores.');
      if (amountText && !/^[1-9]\d{0,5}$/.test(amountText)) throw new GameError('Use uma quantidade inteira maior que zero.');
      quantity = Number(amountText || 1);
      if (!removeItem.run(quantity, player.channel, player.player_id, itemId, quantity).changes) {
        throw new GameError('Você não tem essa quantidade do item.');
      }
      value = item.value * quantity;
    }
    value = Math.floor(value * bonusesFor(player).sellMultiplier);
    db.prepare('UPDATE players SET coins = coins + ? WHERE channel = ? AND player_id = ?')
      .run(value, player.channel, player.player_id);
    const reply = `${player.display_name} vendeu ${quantity} ${quantity === 1 ? 'achado' : 'achados'} por ${value} Brasas.`;
    event(player, 'sell', reply);
    return { reply, kind: 'sell', coinsGained: value };
  }

  function buy(player, itemId) {
    const light = LIGHTS.find((entry) => entry.id === itemId);
    if (light) {
      if (light.level <= player.light_level) throw new GameError('Você já possui essa lanterna ou uma superior.');
      if (light.level !== player.light_level + 1) throw new GameError('Adquira primeiro a lanterna anterior.');
      if (levelForXp(player.xp) < light.requiredLevel) throw new GameError(`${light.name} exige nível ${light.requiredLevel}.`);
      if (player.coins < light.price) throw new GameError(`${light.name} custa ${light.price} Brasas.`);
      db.prepare('UPDATE players SET coins = coins - ?, light_level = ? WHERE channel = ? AND player_id = ?')
        .run(light.price, light.level, player.channel, player.player_id);
      const reply = `${player.display_name} adquiriu ${light.name}. A iluminação melhorou e seus bônus já estão ativos.`;
      event(player, 'buy', reply);
      return { reply, kind: 'buy' };
    }
    if (itemId === 'bolsa' || itemId === 'mochila') {
      const next = BACKPACKS[player.backpack + 1];
      if (!next) throw new GameError('Você já tem a maior bolsa.');
      if (player.coins < next.price) throw new GameError(`A próxima bolsa custa ${next.price} Brasas.`);
      db.prepare('UPDATE players SET coins = coins - ?, backpack = backpack + 1 WHERE channel = ? AND player_id = ?')
        .run(next.price, player.channel, player.player_id);
      const reply = `${player.display_name} ampliou a bolsa para ${next.capacity} espaços.`;
      event(player, 'buy', reply);
      return { reply, kind: 'buy' };
    }
    const equipment = EQUIPMENT.find((entry) => entry.id === itemId);
    if (!equipment) throw new GameError(`Ferramenta desconhecida. Consulte ${prefix}loja.`);
    if (equipment.tier <= player.owned_tier) throw new GameError(`Você já possui ${equipment.name}. Use ${prefix}equipar ${equipment.id}.`);
    if (equipment.tier !== player.owned_tier + 1) throw new GameError('Adquira primeiro a ferramenta anterior.');
    if (levelForXp(player.xp) < equipment.level) throw new GameError(`${equipment.name} exige nível ${equipment.level}.`);
    if (player.coins < equipment.price) throw new GameError(`${equipment.name} custa ${equipment.price} Brasas. Seu saldo: ${player.coins}.`);
    db.prepare(`UPDATE players SET coins = coins - ?, owned_tier = ?, equipped_tier = ?
      WHERE channel = ? AND player_id = ?`).run(equipment.price, equipment.tier, equipment.tier, player.channel, player.player_id);
    const reply = `${player.display_name} adquiriu e equipou ${equipment.name}. Novos caminhos estão disponíveis.`;
    event(player, 'buy', reply);
    return { reply, kind: 'buy' };
  }

  function equip(player, itemId) {
    const equipment = EQUIPMENT.find((entry) => entry.id === itemId);
    if (!equipment || equipment.tier > player.owned_tier) throw new GameError('Você ainda não possui essa ferramenta.');
    const currentRegion = REGIONS.find((entry) => entry.id === player.region);
    const region = currentRegion.tier > equipment.resourceTier ? 'bosque' : player.region;
    db.prepare('UPDATE players SET equipped_tier = ?, region = ? WHERE channel = ? AND player_id = ?')
      .run(equipment.tier, region, player.channel, player.player_id);
    return { reply: `${player.display_name} equipou ${equipment.name}.`, kind: 'equip' };
  }

  // -------------------------------------------------------------- talentos --

  function talentById(id) {
    const talent = TALENTS.find((entry) => entry.id === id);
    if (!talent) throw new GameError(`Talento desconhecido. Veja ${prefix}talentos.`);
    return talent;
  }

  function saveTalents(player, learned, equipped) {
    db.prepare('UPDATE players SET talents_json = ?, equipped_talents = ? WHERE channel = ? AND player_id = ?')
      .run(JSON.stringify(learned), JSON.stringify(equipped), player.channel, player.player_id);
  }

  function learnTalent(player, id) {
    if (!id) throw new GameError(`Use ${prefix}aprender <talento>. Veja ${prefix}talentos.`);
    const talent = talentById(id);
    const learned = parseList(player.talents_json);
    if (learned.includes(talent.id)) throw new GameError(`Você já aprendeu ${talent.name}.`);
    if (levelForXp(player.xp) < talent.requiredLevel) throw new GameError(`${talent.name} exige nível ${talent.requiredLevel}.`);
    if (player.coins < talent.price) throw new GameError(`${talent.name} custa ${talent.price} Brasas. Seu saldo: ${player.coins}.`);
    const equipped = parseList(player.equipped_talents);
    const slots = talentSlots(levelForXp(player.xp));
    const willEquip = equipped.length < slots;
    db.prepare('UPDATE players SET coins = coins - ? WHERE channel = ? AND player_id = ?').run(talent.price, player.channel, player.player_id);
    saveTalents(player, [...learned, talent.id], willEquip ? [...equipped, talent.id] : equipped);
    const reply = `${player.display_name} aprendeu ${talent.name}${willEquip ? ' e já o equipou' : `. Sem espaço livre: use ${prefix}guardar e depois ${prefix}usar ${talent.id}`}. ${talent.description}`;
    event(player, 'buy', reply);
    return { reply, kind: 'buy' };
  }

  function useTalent(player, id) {
    const talent = talentById(id);
    const learned = parseList(player.talents_json);
    const equipped = parseList(player.equipped_talents);
    if (!learned.includes(talent.id)) throw new GameError(`Você ainda não aprendeu ${talent.name}.`);
    if (equipped.includes(talent.id)) throw new GameError(`${talent.name} já está equipado.`);
    const slots = talentSlots(levelForXp(player.xp));
    if (equipped.length >= slots) throw new GameError(`Seus ${slots} espaços de talento estão cheios. Use ${prefix}guardar <talento>.`);
    saveTalents(player, learned, [...equipped, talent.id]);
    return { reply: `${player.display_name} equipou ${talent.name}.`, kind: 'equip' };
  }

  function stowTalent(player, id) {
    const talent = talentById(id);
    const equipped = parseList(player.equipped_talents);
    if (!equipped.includes(talent.id)) throw new GameError(`${talent.name} não está equipado.`);
    saveTalents(player, parseList(player.talents_json), equipped.filter((entry) => entry !== talent.id));
    return { reply: `${player.display_name} guardou ${talent.name}.`, kind: 'equip' };
  }

  // ---------------------------------------------------------------- comandos --

  function run(player, name, args, isDemo) {
    switch (name) {
      case 'vasculhar': return search(player, args[0]);
      case 'prova': return trials.open(player, isDemo);
      case 'entrar': return trials.join(player);
      case 'reparar': return trials.repair(player);
      case 'esconder': return trials.hide(player);
      case 'curar': return trials.heal(player, args[0]);
      case 'libertar': return trials.free(player, args[0]);
      case 'fugir': return trials.flee(player);
      case 'vender': return sell(player, args[0], args[1]);
      case 'comprar': return buy(player, args[0]);
      case 'equipar': return equip(player, args[0]);
      case 'aprender': return learnTalent(player, args[0]);
      case 'usar': return useTalent(player, args[0]);
      case 'guardar': return stowTalent(player, args[0]);
      case 'talentos': {
        const level = levelForXp(player.xp);
        const equipped = equippedTalents(player);
        const learned = parseList(player.talents_json);
        const next = TALENTS.filter((talent) => !learned.includes(talent.id)).slice(0, 3);
        return { kind: 'info', reply: `Talentos de ${player.display_name} (${equipped.length}/${talentSlots(level)} espaços): ${equipped.length ? equipped.map((talent) => talent.name).join(', ') : 'nenhum'}.`
          + `${next.length ? ` Para aprender: ${next.map((talent) => `${talent.id} (${talent.price} Brasas, nível ${talent.requiredLevel})`).join(' | ')}.` : ''}` };
      }
      case 'mochila': {
        const entries = inventory.all(player.channel, player.player_id);
        return { kind: 'info', reply: entries.length
          ? `Bolsa de ${player.display_name}: ${entries.slice(0, 8).map((entry) => `${entry.quantity}x ${entry.item_id}`).join(' | ')}.${entries.length > 8 ? ` Mais ${entries.length - 8} tipos no site.` : ''} Use ${prefix}vender <item>.`
          : `A bolsa de ${player.display_name} está vazia. Use ${prefix}vasculhar.` };
      }
      case 'perfil': {
        const bonus = bonusesFor(player);
        return { kind: 'info', reply: `${player.display_name} · Nível ${levelForXp(player.xp)} · ${player.xp} XP · ${player.coins} Brasas · ${EQUIPMENT[player.equipped_tier].name} · ${player.escapes} fugas em ${player.trials} provas. ${LIGHTS[player.light_level].name}. Reparo +${Math.round(bonus.repair * 100)}% · XP extra ${Math.round((bonus.xpMultiplier - 1) * 100)}% · Venda extra ${((bonus.sellMultiplier - 1) * 100).toFixed(1)}%.` };
      }
      case 'loja': {
        const next = EQUIPMENT[player.owned_tier + 1];
        const pack = BACKPACKS[player.backpack + 1];
        if (args[0] === 'lanternas') {
          const light = LIGHTS[player.light_level + 1];
          return { kind: 'info', reply: light ? `${light.name}: ${light.price} Brasas, nível ${light.requiredLevel}. Sorte +${Math.round(light.luck * 100)}%, XP +${Math.round((light.xpMultiplier - 1) * 100)}%. ${prefix}comprar ${light.id}.` : 'Sua iluminação já está no máximo.' };
        }
        if (args[0] === 'talentos') return { kind: 'info', reply: TALENTS.map((talent) =>
          `${talent.id}: ${talent.price} Brasas, nível ${talent.requiredLevel}`).join(' | ') };
        if (args[0] === 'bolsas' || args[0] === 'mochilas') return { kind: 'info', reply: pack
          ? `${pack.name}: ${pack.capacity} espaços, ${pack.price} Brasas. Use ${prefix}comprar bolsa.` : 'Sua bolsa já está no máximo.' };
        return { kind: 'info', reply: `${next ? `${next.name}: ${next.price} Brasas, nível ${next.level} (${prefix}comprar ${next.id}). Espera ${Math.max(60,Math.round(cooldownMs * next.cooldown / 1000))}s, reparo +${Math.round(next.repair * 100)}%.` : 'Todas as ferramentas adquiridas.'} Categorias: ${prefix}loja bolsas | ${prefix}loja lanternas | ${prefix}loja talentos.` };
      }
      case 'dominios': return { kind: 'info', reply: REGIONS.map((entry) =>
        `${entry.id}: ${entry.tier <= EQUIPMENT[player.equipped_tier].resourceTier ? 'disponível' : `exige ${equipmentForTier(entry.tier).name}`}`).join(' | ') };
      case 'chances': {
        const region = REGIONS.find((entry) => entry.id === (args[0] || player.region));
        if (!region || region.tier > EQUIPMENT[player.equipped_tier].resourceTier) {
          throw new GameError('Domínio indisponível para sua ferramenta.');
        }
        const odds = oddsFor(player, region);
        return { kind: 'info', reply: `${region.name}: ${odds.rarities.filter((entry) => entry.probability > 0)
          .map((entry) => `${entry.name} ${(entry.probability * 100).toFixed(1)}%`).join(' | ')}.` };
      }
      case 'cooldown': return { kind: 'info', reply: player.ready_at > now()
        ? `Próxima busca em ${Math.ceil((player.ready_at - now()) / 1000)}s.` : `${player.display_name}, o caminho está livre. Use ${prefix}vasculhar.` };
      default: return { kind: 'info', reply: `Entidade: ${prefix}prova · ${prefix}entrar · ${prefix}reparar · ${prefix}esconder · ${prefix}curar · ${prefix}libertar @nome · ${prefix}fugir · ${prefix}vasculhar · ${prefix}vender · ${prefix}loja · ${prefix}talentos. IDs de itens estão na bolsa e na loja.` };
    }
  }

  return {
    /** @param {string} channel @param {string} playerId @returns {object} */
    getState(channel, playerId) {
      return store.transaction(() => {
        const player = get.get(channel, playerId);
        const stats = db.prepare(`SELECT COUNT(*) AS players, COALESCE(SUM(expeditions), 0) AS expeditions,
          COALESCE(SUM(escapes), 0) AS escapes, COALESCE(SUM(trials), 0) AS trials FROM players WHERE channel = ?`).get(channel);
        const ranking = db.prepare(`SELECT login, display_name AS name, xp, escapes, expeditions, trials
          FROM players WHERE channel = ? ORDER BY xp DESC, escapes DESC, player_id ASC LIMIT 10`).all(channel)
          .map((entry, index) => ({ ...entry, rank: index + 1, level: levelForXp(entry.xp) }));
        const events = db.prepare(`SELECT id, display_name AS name, kind, item_id AS itemId, text,
          drops_json AS dropsJson, created_at AS createdAt FROM events WHERE channel = ? ORDER BY id DESC LIMIT 20`)
          .all(channel).map(({ dropsJson, ...entry }) => ({ ...entry, drops: JSON.parse(dropsJson) }));
        const regionOdds = player ? REGIONS.filter((entry) => entry.tier <= EQUIPMENT[player.equipped_tier].resourceTier)
          .map((region) => oddsFor(player, region)) : [];
        return { player: snapshot(player), stats, ranking, events, regionOdds, trial: trials.publicState(channel),
          serverTime: now(), prefix };
      });
    },
    /** @param {string} channel @param {string} login @returns {string|null} */
    findPlayer(channel, login) {
      return db.prepare('SELECT player_id FROM players WHERE channel = ? AND login = ? ORDER BY created_at DESC LIMIT 1')
        .get(channel, login)?.player_id ?? null;
    },
    /** @param {object} input @param {object} [settings] @returns {object|null} */
    execute(input, settings = {}) {
      const { channel, playerId, login, displayName, messageId, text } = input;
      if (!isGameCommand(text, prefix)) return null;
      if (!/^(?:[a-z0-9_]{3,25}|demo:[a-f0-9]{40})$/.test(channel)) throw new GameError('Canal inválido.');
      if (typeof login !== 'string' || typeof messageId !== 'string'
        || !/^[a-z0-9_]{1,25}$/.test(login) || !/^[\w-]{1,80}$/.test(messageId)) {
        throw new GameError('Identificação inválida.');
      }
      if (!/^\d{1,20}$/.test(playerId) && !(settings.isDemo && playerId === 'demo')) throw new GameError('ID da Twitch inválido.');
      if (channel.startsWith('demo:') !== Boolean(settings.isDemo)) throw new GameError('Ambiente inválido.');
      if (typeof displayName !== 'string' || displayName.length > 40 || /[\u0000-\u001f\u007f]/.test(displayName)) {
        throw new GameError('Nome de exibição inválido.');
      }
      if (typeof text !== 'string' || text.length > 200) throw new GameError('Comando muito longo.');
      const fingerprint = createHash('sha256').update(JSON.stringify([playerId, text, login])).digest('hex');
      return store.transaction(() => {
        const receipt = readReceipt.get(channel, messageId);
        if (receipt) {
          if (receipt.fingerprint !== fingerprint) throw new GameError('ID de mensagem reutilizado com outro conteúdo.', 409);
          return { ...JSON.parse(receipt.response), duplicate: true };
        }
        const player = ensurePlayer(channel, playerId, login, displayName || login);
        const [token, ...args] = text.trim().toLowerCase().split(/\s+/);
        const typed = token.slice(prefix.length);
        const name = ALIASES[typed] ?? typed;
        // Um SAVEPOINT permite registrar recusas de jogo sem manter qualquer alteração parcial.
        db.exec('SAVEPOINT game_action');
        let response;
        try {
          const result = run(player, name, args, settings.isDemo);
          response = { ok: true, ...result };
          db.exec('RELEASE game_action');
        } catch (error) {
          db.exec('ROLLBACK TO game_action; RELEASE game_action');
          if (!(error instanceof GameError)) throw error;
          response = { ok: false, reply: error.message, kind: 'error', status: error.status };
        }
        response.player = snapshot(get.get(channel, playerId));
        db.prepare('INSERT INTO receipts(channel, message_id, fingerprint, response, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(channel, messageId, fingerprint, JSON.stringify(response), now());
        return response;
      });
    },
    /** Demonstração isolada; não aceita canal nem identidade vindos do corpo da requisição. */
    startDemo(sessionId) {
      const channel = `demo:${sessionId}`;
      ensurePlayer(channel, 'demo', 'explorador', 'Você');
      return this.getState(channel, 'demo');
    },
    /** @param {string} sessionId @param {number} tier @returns {object} */
    setDemoScenario(sessionId, tier) {
      if (!Number.isInteger(tier) || tier < 0 || tier >= EQUIPMENT.length) throw new GameError('Cenário inválido.');
      const channel = `demo:${sessionId}`;
      store.transaction(() => {
        ensurePlayer(channel, 'demo', 'explorador', 'Você');
        db.prepare('DELETE FROM inventory WHERE channel = ?').run(channel);
        db.prepare('DELETE FROM discoveries WHERE channel = ?').run(channel);
        db.prepare('DELETE FROM events WHERE channel = ?').run(channel);
        db.prepare('DELETE FROM receipts WHERE channel = ?').run(channel);
        db.prepare("DELETE FROM trials WHERE channel = ?").run(channel);
        const xp = 40 * (EQUIPMENT[tier].level - 1) ** 2;
        db.prepare(`UPDATE players SET coins = 800, xp = ?, owned_tier = ?, equipped_tier = ?,
          expeditions = 0, escapes = 0, trials = 0, trial_deaths = 0, backpack = 0, fortune_level = 0, light_level = 0,
          talents_json = '[]', equipped_talents = '[]', ready_at = 0, search_wait_ms = 0, region = ? WHERE channel = ?`)
          .run(xp, tier, tier, REGIONS[EQUIPMENT[tier].resourceTier].id, channel);
        for (const id of ['caixa-reparo', 'kit-curativo']) addItem.run(channel, 'demo', id, 2);
      });
      return this.getState(channel, 'demo');
    },
  };
}
