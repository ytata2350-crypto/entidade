/** @file Verifica isolamento, sorteios condicionados, economia, talentos, provas em grupo e idempotência dos comandos. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createStore } from '../src/store.js';
import { createGame } from '../src/game.js';
import { ITEMS, EQUIPMENT, TALENTS, REGIONS, equipmentForItem, getCatalogue, talentSlots } from '../src/catalogue.js';
import { createLimiarBridge, isLimiarCommand } from '../src/integrations/existing-bot.js';
import { parseIrcLine } from '../src/twitch-bot.js';

const ALICE = { channel: 'canal_a', playerId: '123', login: 'alice', displayName: 'Alice' };
const BOB = { playerId: '456', login: 'bob', displayName: 'Bob' };
const CAROL = { playerId: '789', login: 'carol', displayName: 'Carol' };

function fixture(t, options = {}) {
  const store = createStore(':memory:');
  t.after(() => store.close());
  let time = 1_000_000;
  let serial = 0;
  const game = createGame(store, { now: () => time, random: () => 0, ...options });
  function run(text, overrides = {}) {
    return game.execute({ ...ALICE, messageId: `message-${++serial}`, text, ...overrides });
  }
  run('!perfil');
  return { store, game, run, advance: (ms) => { time += ms; }, now: () => time,
    setPlayer(fields, who = ALICE) {
      for (const [key, value] of Object.entries(fields)) {
        assert.ok(['coins', 'xp', 'owned_tier', 'equipped_tier', 'backpack', 'ready_at', 'light_level', 'talents_json', 'equipped_talents'].includes(key));
        store.db.prepare(`UPDATE players SET ${key} = ? WHERE channel = ? AND player_id = ?`).run(value, ALICE.channel, who.playerId);
      }
    },
    addItem(id, quantity = 1, who = ALICE) {
      store.db.prepare(`INSERT INTO inventory(channel, player_id, item_id, quantity) VALUES (?, ?, ?, ?)
        ON CONFLICT(channel, player_id, item_id) DO UPDATE SET quantity = quantity + excluded.quantity`)
        .run(ALICE.channel, who.playerId, id, quantity);
    },
    state: (who = ALICE) => game.getState(ALICE.channel, who.playerId),
    /** Altera a prova ativa direto no banco (cenários difíceis de alcançar só pelos comandos). */
    patchTrial(fn) {
      const row = store.db.prepare("SELECT id, data FROM trials WHERE channel = ? AND status IN ('lobby', 'running')").get(ALICE.channel);
      const data = JSON.parse(row.data);
      fn(data);
      store.db.prepare('UPDATE trials SET data = ? WHERE id = ?').run(JSON.stringify(data), row.id);
    },
  };
}

const as = (f, who) => (text, overrides = {}) => f.run(text, { ...who, ...overrides });

// ------------------------------------------------------------------- buscas --

test('uma busca retorna um item, dá XP e registra uma descoberta', (t) => {
  const f = fixture(t);
  const result = f.run('!vasculhar');
  assert.equal(result.ok, true);
  assert.equal(result.player.inventoryCount, 1);
  assert.ok(result.player.xp > 0);
  assert.deepEqual(result.player.discoveries, [result.itemId]);
  assert.equal(f.state().events.length, 1);
});

test('!explorar continua funcionando como outro nome de !vasculhar', (t) => {
  const f = fixture(t);
  assert.equal(f.run('!explorar').ok, true);
  assert.equal(isLimiarCommand('!explorar'), true);
  assert.equal(isLimiarCommand('!regioes'), true);
  assert.equal(isLimiarCommand('!fila'), false);
});

test('cooldown real impede uma segunda recompensa sem consumir outros recursos', (t) => {
  const f = fixture(t);
  const first = f.run('!vasculhar');
  const refused = f.run('!vasculhar');
  assert.equal(refused.ok, false);
  assert.equal(refused.status, 429);
  assert.equal(refused.player.xp, first.player.xp);
  assert.equal(refused.player.inventoryCount, 1);
  f.advance(600_000);
  assert.equal(f.run('!vasculhar').ok, true);
});

test('a ferramenta filtra os achados antes do sorteio em todos os tiers', (t) => {
  for (let tier = 0; tier < EQUIPMENT.length; tier++) {
    const f = fixture(t, { random: () => 0.999999 });
    const sessionId = 'a'.repeat(40);
    f.game.startDemo(sessionId);
    f.game.setDemoScenario(sessionId, tier);
    for (let i = 0; i < 10; i++) {
      const result = f.game.execute({ channel: `demo:${sessionId}`, playerId: 'demo', login: 'explorador',
        displayName: 'Você', messageId: `tier-${tier}-${i}`, text: '!vasculhar' }, { isDemo: true });
      assert.equal(result.ok, true);
      for (const drop of result.drops) {
        const item = ITEMS.find((entry) => entry.id === drop.id);
        assert.ok(item.tier <= EQUIPMENT[tier].resourceTier);
        assert.ok(equipmentForItem(item).tier <= tier);
      }
      f.advance(30_000);
    }
  }
});

test('o hospital é bloqueado sem a caixa de ferramentas e abre quando ela está equipada', (t) => {
  const f = fixture(t, { random: () => 0.99 });
  assert.equal(f.run('!vasculhar hospital').ok, false);
  f.setPlayer({ owned_tier: 2, equipped_tier: 2, xp: 360 });
  const result = f.run('!vasculhar hospital');
  assert.equal(result.ok, true);
  assert.ok(ITEMS.find((item) => item.id === result.itemId).regions.includes('hospital'));
});

test('equipar ferramenta antiga fecha novamente os domínios e raridades avançadas', (t) => {
  const f = fixture(t);
  f.setPlayer({ owned_tier: 5, equipped_tier: 5, xp: 9000 });
  assert.equal(f.run('!equipar bolsa-lona').ok, true);
  assert.equal(f.run('!vasculhar limiar').ok, false);
  assert.equal(f.run('!equipar ferramenta-inexistente').ok, false);
});

test('bolsa cheia não consome o cooldown nem dá XP', (t) => {
  const f = fixture(t);
  f.addItem('corda', 30);
  const result = f.run('!vasculhar');
  assert.equal(result.ok, false);
  assert.equal(result.player.readyAt, 0);
  assert.equal(result.player.xp, 0);
});

// ---------------------------------------------------------------- economia --

test('não permite comprar pulando ferramentas, nível ou saldo', (t) => {
  const f = fixture(t);
  f.setPlayer({ coins: 20_000, xp: 10_000 });
  assert.equal(f.run('!comprar caixa-ferramentas').ok, false);
  f.setPlayer({ coins: 0 });
  assert.equal(f.run('!comprar kit-campo').ok, false);
  f.setPlayer({ coins: 180, xp: 0 });
  assert.equal(f.run('!comprar kit-campo').ok, false);
  assert.equal(f.state().player.ownedTier, 0);
});

test('comprar deduz o preço correto e equipa a ferramenta', (t) => {
  const f = fixture(t);
  f.setPlayer({ coins: 200, xp: 40 });
  const result = f.run('!comprar kit-campo');
  assert.equal(result.ok, true);
  assert.equal(result.player.coins, 20);
  assert.equal(result.player.equipment.id, 'kit-campo');
  assert.equal(f.run('!comprar kit-campo').ok, false);
});

test('comprar bolsa aumenta capacidade, sem adicionar itens', (t) => {
  const f = fixture(t);
  f.setPlayer({ coins: 250 });
  const result = f.run('!comprar bolsa');
  assert.equal(result.player.capacity, 60);
  assert.equal(result.player.coins, 0);
  assert.equal(result.player.inventoryCount, 0);
});

test('venda rejeita números negativos, fracionários e quantidades inexistentes', (t) => {
  const f = fixture(t);
  f.addItem('corda', 2);
  for (const amount of ['-1', '0', '1.5', '3', '999999999']) {
    assert.equal(f.run(`!vender corda ${amount}`).ok, false);
  }
  const state = f.state();
  assert.equal(state.player.coins, 0);
  assert.equal(state.player.inventoryCount, 2);
  assert.equal(f.run('!vender corda 2').player.coins, 20);
});

test('vender tudo paga exatamente o valor dos itens e preserva descobertas', (t) => {
  const f = fixture(t);
  f.run('!vasculhar');
  const discovery = f.state().player.discoveries[0];
  f.addItem('corda', 2);
  const result = f.run('!vender tudo');
  assert.equal(result.player.coins, ITEMS.find((item) => item.id === discovery).value + 20);
  assert.equal(result.player.inventoryCount, 0);
  assert.ok(result.player.discoveries.includes(discovery));
  assert.equal(f.run('!vender tudo').ok, false);
});

test('lanternas têm progressão independente e somam sorte e XP sem liberar domínios', (t) => {
  const f = fixture(t);
  f.setPlayer({ coins: 2000, xp: 640 });
  assert.equal(f.run('!comprar lanterna-oficina').ok, false);
  assert.equal(f.run('!comprar lanterna-trilha').ok, true);
  const bought = f.run('!comprar lanterna-oficina');
  assert.equal(bought.ok, true);
  assert.equal(bought.player.light.id, 'lanterna-oficina');
  assert.ok(bought.player.bonuses.xpMultiplier > 1);
  assert.ok(bought.player.bonuses.lightLuck > 0);
  assert.equal(bought.player.equipment.id, 'bolsa-lona');
  assert.equal(f.run('!vasculhar hospital').ok, false);
});

test('nível melhora venda, com bônus limitado a 20%, e não libera domínios', (t) => {
  const f = fixture(t);
  f.setPlayer({ xp: 1_000_000 });
  f.addItem('corda', 3);
  const result = f.run('!vender corda 3');
  assert.equal(result.coinsGained, 36);
  assert.equal(result.player.bonuses.sellMultiplier, 1.2);
  assert.equal(result.player.bonuses.levelLuck, 0.25);
  assert.equal(f.run('!vasculhar hospital').ok, false);
});

test('mais sorte melhora as chances raras sem ultrapassar os bloqueios da ferramenta', (t) => {
  const f = fixture(t);
  f.setPlayer({ owned_tier: 3, equipped_tier: 2, xp: 640 });
  const first = f.state().regionOdds.find((entry) => entry.regionId === 'hospital');
  f.run('!equipar caixa-reforcada');
  const better = f.state().regionOdds.find((entry) => entry.regionId === 'hospital');
  assert.ok(better.rarities.find((entry) => entry.id === 'rare').probability
    > first.rarities.find((entry) => entry.id === 'rare').probability);
  assert.equal(better.rarities.find((entry) => entry.id === 'epic').probability, 0);
  assert.ok(Math.abs(better.rarities.reduce((sum, entry) => sum + entry.probability, 0) - 1) < 1e-10);
});

test('catálogo tem identificadores únicos, exigências válidas e domínios com achados', () => {
  assert.ok(ITEMS.length >= 60);
  assert.equal(ITEMS.length, new Set(ITEMS.map((entry) => entry.id)).size);
  for (const item of ITEMS) {
    assert.ok(equipmentForItem(item), item.id);
    assert.ok(item.weight > 0 && item.value > 0, item.id);
    assert.ok(['supplies', 'offering', 'relic'].includes(item.category), item.id);
    assert.ok(item.regions.every((id) => REGIONS.some((region) => region.id === id)), item.id);
  }
  for (const region of REGIONS) assert.ok(ITEMS.some((item) => item.regions.includes(region.id)), region.id);
  assert.equal(TALENTS.length, new Set(TALENTS.map((entry) => entry.id)).size);
});

test('loja expõe categorias e o comando mostra talentos e lanternas', (t) => {
  const catalogue = getCatalogue();
  assert.deepEqual(catalogue.shopCategories.map((entry) => entry.id), ['toolboxes', 'exploration', 'backpacks', 'lights', 'talents']);
  assert.equal(catalogue.items[0].weight, undefined);
  const f = fixture(t);
  assert.match(f.run('!loja lanternas').reply, /Lanterna de trilha/);
  assert.match(f.run('!loja talentos').reply, /mao-firme/);
});

// ---------------------------------------------------------------- talentos --

test('talentos: nível e saldo são exigidos, o primeiro é equipado e os espaços crescem com o nível', (t) => {
  const f = fixture(t);
  assert.deepEqual([1, 5, 6, 11, 12, 19, 20].map(talentSlots), [1, 1, 2, 2, 3, 3, 4]);
  f.setPlayer({ coins: 1000, xp: 0 });
  assert.equal(f.run('!aprender mao-firme').ok, false); // exige nível 2
  f.setPlayer({ xp: 40 });
  f.setPlayer({ coins: 100 });
  assert.equal(f.run('!aprender mao-firme').ok, false); // falta saldo
  f.setPlayer({ coins: 1000 });
  const first = f.run('!aprender mao-firme');
  assert.equal(first.ok, true);
  assert.equal(first.player.coins, 700);
  assert.deepEqual(first.player.talents.equipped, ['mao-firme']);
  assert.equal(f.run('!aprender mao-firme').ok, false);
  f.setPlayer({ xp: 360 }); // nível 4: ainda 1 espaço
  const second = f.run('!aprender passos-leves');
  assert.equal(second.ok, true);
  assert.deepEqual(second.player.talents.equipped, ['mao-firme']); // sem espaço livre
  assert.equal(f.run('!usar passos-leves').ok, false);
  assert.equal(f.run('!guardar mao-firme').ok, true);
  assert.equal(f.run('!usar passos-leves').ok, true);
  assert.deepEqual(f.state().player.talents.equipped, ['passos-leves']);
  assert.equal(f.run('!usar coragem').ok, false); // não aprendido
});

test('Faro de achados soma sorte à busca', (t) => {
  const f = fixture(t);
  f.setPlayer({ talents_json: '["faro-achados"]', equipped_talents: '["faro-achados"]', xp: 40 * 11 * 11 });
  assert.equal(f.state().player.bonuses.talentLuck, 0.12);
});

// ------------------------------------------------------------------ provas --

function startLobby(f, { bob = true } = {}) {
  assert.equal(f.run('!prova').kind, 'trial');
  if (bob) assert.equal(as(f, BOB)('!entrar').ok, true);
}

test('prova: abre, aceita entradas até 4, e não deixa entrar depois que começa', (t) => {
  const f = fixture(t);
  const opened = f.run('!prova');
  assert.equal(opened.ok, true);
  assert.match(opened.reply, /abriu uma prova/);
  assert.equal(f.run('!entrar').ok, false); // já está dentro
  assert.equal(as(f, BOB)('!entrar').ok, true);
  assert.equal(as(f, CAROL)('!entrar').ok, true);
  const status = f.run('!prova');
  assert.match(status.reply, /Prova aberta \(3\/4\)/);
  f.advance(46_000);
  assert.equal(as(f, { playerId: '1000', login: 'dave', displayName: 'Dave' })('!entrar').ok, false);
  assert.equal(f.state().trial.phase, 'running');
});

test('prova cheia começa na hora e a quantidade de faróis acompanha o grupo', (t) => {
  const f = fixture(t);
  f.run('!prova');
  as(f, BOB)('!entrar');
  as(f, CAROL)('!entrar');
  const last = as(f, { playerId: '1000', login: 'dave', displayName: 'Dave' })('!entrar');
  assert.match(last.reply, /Prova cheia/);
  const trial = f.state().trial;
  assert.equal(trial.phase, 'running');
  assert.equal(trial.generators.length, 5);
});

test('prova: comandos de ação exigem estar na prova e ela já em andamento', (t) => {
  const f = fixture(t);
  assert.match(f.run('!reparar').reply, /Não há prova/);
  startLobby(f);
  assert.match(f.run('!reparar').reply, /ainda não começou/);
  f.advance(46_000);
  assert.match(as(f, CAROL)('!reparar').reply, /não está nesta prova/);
  assert.equal(f.run('!fugir').ok, false); // portão fechado
});

test('reparar avança o farol, respeita o cooldown e usa a caixa de reparo automaticamente', (t) => {
  const f = fixture(t);
  startLobby(f);
  f.advance(46_000);
  const first = f.run('!reparar');
  assert.equal(first.ok, true);
  assert.match(first.reply, /Farol 1: 9%/);
  const again = f.run('!reparar');
  assert.equal(again.ok, false);
  assert.equal(again.status, 429);
  f.advance(15_000);
  f.addItem('caixa-reparo', 1);
  const boosted = f.run('!reparar');
  assert.match(boosted.reply, /caixa de reparo usada/);
  assert.equal(boosted.player.inventoryCount, 0);
  assert.equal(f.state().trial.generators[0], 9 + Math.round(9 * 1.6));
});

test('o Pálido fere, prende, e o grilhão mata depois de dois estágios', (t) => {
  const f = fixture(t); // random() = 0: o Pálido sempre acerta o primeiro alvo vivo
  startLobby(f);
  f.advance(46_000); // a prova começou em +45 s
  f.run('!reparar');
  const start = f.now() - 1_000; // instante em que a prova começou
  f.advance(20_000); // 1º ataque
  assert.equal(f.state().trial.players.find((p) => p.login === 'alice').state, 'hurt');
  f.advance(20_000); // 2º ataque: prende
  assert.equal(f.state().trial.players.find((p) => p.login === 'alice').state, 'caught');
  assert.match(f.state().trial.log.at(-1).text, /grilhões/);
  assert.equal(f.run('!reparar').ok, false); // preso não age
  f.advance(120_000); // dois estágios de 60 s
  assert.equal(f.state().trial.players.find((p) => p.login === 'alice').state, 'dead');
  assert.match(f.run('!reparar').reply, /névoa já levou/);
  assert.ok(start > 0);
});

test('libertar tira o aliado dos grilhões, marca quem libertou e Coragem evita a marca', (t) => {
  const f = fixture(t);
  as(f, BOB)('!perfil'); // cria o Bob antes de dar o talento a ele
  f.setPlayer({ talents_json: '["coragem"]', equipped_talents: '["coragem"]', xp: 160 }, BOB);
  startLobby(f);
  f.advance(46_000);
  f.run('!reparar');
  f.advance(40_000); // alice ferida e depois presa
  assert.equal(f.state().trial.players.find((p) => p.login === 'alice').state, 'caught');
  assert.equal(f.run('!libertar alice').ok, false); // não se liberta sozinho (e está preso)
  const free = as(f, BOB)('!libertar @alice');
  assert.equal(free.ok, true);
  assert.equal(f.state().trial.players.find((p) => p.login === 'alice').state, 'hurt');
  assert.doesNotMatch(free.reply, /notou o barulho/); // Coragem
  assert.equal(as(f, BOB)('!libertar alice').ok, false); // cooldown/ não está preso
});

test('curar: cura alguém ferido, a si mesmo (mais devagar) e consome kit curativo', (t) => {
  const f = fixture(t);
  startLobby(f);
  f.advance(46_000);
  f.run('!reparar');
  f.advance(20_000);
  f.patchTrial((data) => { data.players['123'].state = 'hurt'; data.players['123'].nextActionAt = 0; data.nextTickAt += 1_000_000; });
  f.addItem('kit-curativo', 1);
  const heal = as(f, BOB)('!curar alice');
  assert.equal(heal.ok, true);
  assert.equal(f.state().trial.players.find((p) => p.login === 'alice').state, 'ok');
  assert.equal(as(f, BOB)('!curar alice').ok, false); // não precisa
  f.patchTrial((data) => { data.players['123'].state = 'hurt'; });
  const self = f.run('!curar');
  assert.equal(self.ok, true);
  assert.equal(self.player.inventoryCount, 0); // o kit curativo da Alice foi usado
  assert.match(self.reply, /kit curativo/);
});

test('esconder reduz a chance de ser atacado e passa na vez seguinte', (t) => {
  let value = 0.45;
  const f = fixture(t, { random: () => value });
  startLobby(f, { bob: false });
  f.advance(46_000);
  const hidden = f.run('!esconder');
  assert.equal(hidden.ok, true);
  f.advance(20_000); // o ataque cai em 0.45 < 0.50 sem esconder, mas com esconder a chance é 0.20
  assert.equal(f.state().trial.players[0].state, 'ok');
  value = 0.1;
  f.advance(20_000);
  assert.equal(f.state().trial.players[0].state, 'hurt');
});

test('portão só abre com todos os faróis, a fuga paga Brasas e XP e encerra a prova', (t) => {
  const f = fixture(t);
  startLobby(f);
  f.advance(46_000);
  f.run('!reparar');
  f.patchTrial((data) => { data.generators = [100, 100, 99]; data.nextTickAt += 1_000_000; });
  f.advance(15_000);
  const opened = as(f, BOB)('!reparar');
  assert.match(opened.reply, /portão da névoa se abriu/);
  assert.equal(f.state().trial.gates, true);
  const bobEscape = as(f, BOB)('!fugir');
  assert.equal(bobEscape.ok, true);
  assert.equal(f.state().trial.phase, 'running');
  const aliceEscape = f.run('!fugir');
  assert.equal(aliceEscape.ok, true);
  assert.match(aliceEscape.reply, /Prova encerrada/);
  const trial = f.state().trial;
  assert.equal(trial.phase, 'ended');
  assert.equal(trial.result.outcome, 'escaped');
  // Bob: 90 + 6 (um reparo) = 96 × 1,25 = 120 Brasas; Alice: 90 + 6 = 96 × 1,25 = 120
  assert.equal(f.state(BOB).player.coins, 120);
  assert.equal(f.state().player.coins, 120);
  assert.equal(f.state().player.escapes, 1);
  assert.equal(f.state().player.trials, 1);
});

test('a névoa se fecha no tempo limite e leva quem não escapou', (t) => {
  const f = fixture(t);
  startLobby(f, { bob: false });
  f.advance(46_000);
  f.run('!esconder');
  f.advance(500_000);
  const trial = f.state().trial;
  assert.equal(trial.phase, 'ended');
  assert.equal(trial.result.outcome, 'lost');
  assert.equal(f.state().player.coins, 20);
  assert.equal(f.state().player.xp, 15);
  assert.equal(f.state().player.trialDeaths, 1);
});

test('descanso entre provas: a próxima só abre depois de 2 minutos', (t) => {
  const f = fixture(t);
  startLobby(f, { bob: false });
  f.advance(46_000);
  f.advance(500_000);
  f.state(); // resolve a prova
  const refused = f.run('!prova');
  assert.equal(refused.ok, false);
  assert.equal(refused.status, 429);
  f.advance(121_000);
  assert.equal(f.run('!prova').ok, true);
});

test('talentos entram na prova congelados e Passos leves reduz a chance de ser atingido', (t) => {
  let value = 0.45;
  const f = fixture(t, { random: () => value });
  f.setPlayer({ talents_json: '["passos-leves"]', equipped_talents: '["passos-leves"]', xp: 160 });
  startLobby(f, { bob: false });
  f.advance(46_000);
  f.advance(20_000); // 0.45 contra 0.50 - 0.10 = 0.40: erra
  assert.equal(f.state().trial.players[0].state, 'ok');
  f.run('!guardar passos-leves'); // trocar o talento durante a prova não muda o que já valia
  value = 0.38;
  f.advance(20_000);
  assert.equal(f.state().trial.players[0].state, 'hurt');
});

test('Segundo fôlego evita ser preso uma vez', (t) => {
  const f = fixture(t);
  f.setPlayer({ talents_json: '["segundo-folego"]', equipped_talents: '["segundo-folego"]', xp: 40 * 14 * 14 });
  startLobby(f, { bob: false });
  f.advance(46_000);
  f.advance(40_000); // ferida e depois "presa" (mas o talento impede)
  assert.equal(f.state().trial.players[0].state, 'hurt');
  f.advance(20_000);
  assert.equal(f.state().trial.players[0].state, 'caught');
});

test('provas de canais diferentes são isoladas e a demonstração corre mais rápido', (t) => {
  const f = fixture(t);
  f.run('!prova');
  assert.equal(f.game.getState('canal_b', '123').trial, null);
  const other = f.run('!prova', { channel: 'canal_b' });
  assert.equal(other.ok, true);
  const session = 'd'.repeat(40);
  f.game.startDemo(session);
  const input = { channel: `demo:${session}`, playerId: 'demo', login: 'explorador', displayName: 'Você', text: '!prova' };
  assert.equal(f.game.execute({ ...input, messageId: 'demo-prova' }, { isDemo: true }).ok, true);
  f.advance(3_000);
  assert.equal(f.game.getState(`demo:${session}`, 'demo').trial.phase, 'running');
});

// -------------------------------------------------------------- integração --

test('mensagem repetida não duplica item, Brasas ou XP; conteúdo trocado é rejeitado', (t) => {
  const f = fixture(t);
  const first = f.run('!vasculhar', { messageId: 'unique-event' });
  const second = f.run('!vasculhar', { messageId: 'unique-event' });
  assert.equal(second.duplicate, true);
  assert.equal(second.player.xp, first.player.xp);
  assert.equal(f.state().player.inventoryCount, 1);
  assert.throws(() => f.run('!vender tudo', { messageId: 'unique-event' }), /reutilizado/);
});

test('mesmo jogador em canais diferentes tem inventário e saldo isolados', (t) => {
  const f = fixture(t);
  f.run('!vasculhar');
  const other = f.run('!perfil', { channel: 'canal_b' });
  assert.equal(other.player.inventoryCount, 0);
  assert.equal(other.player.xp, 0);
  assert.equal(f.state().player.inventoryCount, 1);
});

test('demonstração acelerada não altera jogadores do canal nem outra sessão', (t) => {
  const f = fixture(t);
  const session = 'b'.repeat(40);
  f.game.setDemoScenario(session, 5);
  f.game.startDemo('c'.repeat(40));
  assert.equal(f.state().player.ownedTier, 0);
  assert.equal(f.game.getState(`demo:${'c'.repeat(40)}`, 'demo').player.ownedTier, 0);
  const input = { channel: `demo:${session}`, playerId: 'demo', login: 'explorador', displayName: 'Você',
    messageId: 'demo-first', text: '!vasculhar' };
  assert.equal(f.game.execute(input, { isDemo: true }).ok, true);
  f.advance(30_000);
  assert.equal(f.game.execute({ ...input, messageId: 'demo-next' }, { isDemo: true }).ok, true);
  assert.throws(() => f.game.execute({ ...input, messageId: 'invalid-demo' }), /Twitch|Ambiente/);
});

test('comandos alheios ao jogo não criam jogadores e prefixo pode ser configurado', (t) => {
  const f = fixture(t);
  assert.equal(f.run('!fila', { playerId: '456' }), null);
  assert.equal(f.game.getState('canal_a', '456').player, null);
  const store = createStore(':memory:'); t.after(() => store.close());
  const game = createGame(store, { prefix: '$' });
  assert.equal(game.execute({ channel: 'canal_a', playerId: '123', login: 'alice', displayName: 'Alice',
    messageId: 'custom-prefix', text: '$perfil' }).ok, true);
});

test('adaptador envia o ID verificado da Twitch e a chave apenas no header', async () => {
  let request;
  const bridge = createLimiarBridge({ baseUrl: 'http://127.0.0.1:3210', apiKey: 'test-key-'.repeat(5),
    fetchImpl: async (url, options) => { request = { url, options }; return { ok: true, json: async () => ({ reply: 'achado' }) }; } });
  const message = { texto: '!reparar', params: ['#canal_a'], prefixo: 'alice!alice@alice.tmi.twitch.tv',
    tags: { 'user-id': '123', 'room-id': '321', 'display-name': 'Alice', id: 'event-123' } };
  assert.equal((await bridge(message)).reply, 'achado');
  assert.equal(request.url.pathname, '/api/bot/command');
  assert.equal(request.url.search, '');
  assert.ok(request.options.headers.Authorization.startsWith('Bearer '));
  assert.equal(JSON.parse(request.options.body).playerId, '123');
  request = null;
  assert.equal(await bridge({ ...message, texto: '!fila' }), null);
  assert.equal(request, null);
  assert.equal(await bridge({ ...message, tags: { ...message.tags, 'source-room-id': '999' } }), null);
  assert.equal(request, null);
});

test('adaptador bloqueia envio de segredo por HTTP externo', () => {
  assert.throws(() => createLimiarBridge({ baseUrl: 'http://example.com', apiKey: 'x'.repeat(40) }), /HTTPS/);
});

test('parser preserva IDs e decodifica nome com espaço', () => {
  const result = parseIrcLine('@id=abc;user-id=123;room-id=321;display-name=Alice\\sNova :alice!a@a PRIVMSG #canal_a :!libertar bob');
  assert.equal(result.tags['user-id'], '123');
  assert.equal(result.tags['display-name'], 'Alice Nova');
  assert.equal(result.params[0], '#canal_a');
  assert.equal(result.text, '!libertar bob');
});

test('migração do banco antigo preserva Brasas e XP, reinicia o inventário e guarda uma cópia', () => {
  const directory = mkdtempSync(join(tmpdir(), 'limiar-migration-test-'));
  const path = join(directory, 'game.sqlite');
  let store;
  try {
    store = createStore(path);
    store.db.prepare(`INSERT INTO players(channel, player_id, login, display_name, owned_tier,
      equipped_tier, coins, xp, created_at) VALUES ('canal_a', '123', 'alice', 'Alice', 2, 2, 777, 9000, 1)`).run();
    store.db.prepare("INSERT INTO inventory VALUES ('canal_a', '123', 'ambar', 2)").run();
    store.db.exec('PRAGMA user_version = 3');
    store.close();
    store = createStore(path);
    const state = createGame(store).getState('canal_a', '123');
    assert.equal(state.player.coins, 777);
    assert.equal(state.player.xp, 9000);
    assert.equal(state.player.inventoryCount, 0);
    assert.ok(existsSync(`${path}.v3.bak`));
    store.db.prepare("INSERT INTO inventory VALUES ('canal_a', '123', 'corda', 1)").run();
    store.close();
    store = createStore(path);
    assert.equal(createGame(store).getState('canal_a', '123').player.inventoryCount, 1, 'não zera de novo');
  } finally {
    store?.close();
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !directory.includes('limiar-migration-test-')) {
      throw new Error('Diretório de limpeza inesperado.');
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

test('eventos da cena identificam o reparador e não se repetem em consultas ou mensagens duplicadas', (t) => {
  const f = fixture(t);
  startLobby(f); f.advance(46_000);
  const before = f.state().trial;
  const result = f.run('!reparar', { messageId: 'scene-repair-once' });
  assert.equal(result.ok, true);
  const after = f.state().trial;
  const repair = after.sceneEvents.find(event => event.kind === 'repair');
  assert.equal(repair.actor, 'alice');
  assert.equal(repair.generator, 0);
  assert.equal(repair.value, after.generators[0]);
  assert.equal(repair.at, f.now());
  assert.equal(after.id, before.id);
  f.run('!reparar', { messageId: 'scene-repair-once' });
  assert.deepEqual(f.state().trial.sceneEvents, after.sceneEvents);
  assert.deepEqual(f.state().trial.sceneEvents, after.sceneEvents);
  assert.ok(after.players[0].nextActionAt > f.now());
  assert.equal(after.players[0].fx, undefined);
});

test('ataques públicos apontam alvo, resultado e instante real mesmo com consultas atrasadas', (t) => {
  const f = fixture(t); startLobby(f, { bob: false }); f.advance(46_000);
  const start = f.state().trial;
  const attackAt = start.nextAttackAt;
  f.advance(40_000);
  const attacks = f.state().trial.sceneEvents.filter(event => event.kind === 'attack');
  assert.deepEqual(attacks.map(event => event.target), ['alice', 'alice']);
  assert.deepEqual(attacks.map(event => event.outcome), ['hit', 'caught']);
  assert.equal(attacks[0].at, attackAt);
  assert.ok(attacks[1].at > attacks[0].at);
  assert.ok(attacks.every(event => event.at < f.now()));
});

test('cura, resgate e fuga geram ações com os participantes corretos', (t) => {
  const f = fixture(t); startLobby(f); f.advance(46_000);
  f.state();
  f.patchTrial(data => { data.players['123'].state = 'caught'; data.players['123'].caughtAt = f.now(); data.nextTickAt = f.now() + 1_000_000; });
  assert.equal(as(f, BOB)('!libertar alice').ok, true);
  let events = f.state().trial.sceneEvents;
  assert.deepEqual(events.filter(event => event.kind === 'rescue').map(({actor,target}) => [actor,target]), [['bob','alice']]);
  f.advance(15_000);
  assert.equal(as(f, BOB)('!curar alice').ok, true);
  assert.equal(f.state().trial.sceneEvents.at(-1).kind, 'heal');
  f.patchTrial(data => { data.generators = [100,100,100]; data.gates = true; });
  assert.equal(f.run('!fugir').ok, true);
  assert.equal(as(f, BOB)('!fugir').ok, true);
  events = f.state().trial.sceneEvents;
  assert.deepEqual(events.filter(event => event.kind === 'escape').map(event => event.actor), ['alice','bob']);
  assert.equal(events.at(-1).kind, 'end');
});

test('cena aceita provas antigas e limita o histórico sem reutilizar identificadores', (t) => {
  const f = fixture(t); startLobby(f); f.advance(46_000); f.state();
  f.patchTrial(data => { delete data.sceneEvents; delete data.sceneSequence; data.nextTickAt = f.now() + 10_000_000; data.endsAt = f.now() + 10_000_000; });
  assert.deepEqual(f.state().trial.sceneEvents, []);
  for (let i = 0; i < 70; i++) { assert.equal(f.run('!esconder').ok, true); f.advance(23_000); }
  const events = f.state().trial.sceneEvents;
  assert.equal(events.length, 64);
  assert.equal(new Set(events.map(event => event.id)).size, 64);
  assert.equal(events.at(-1).id, 70);
  assert.equal(f.state().trial.players[0].hidden, true);
});

test('ferimentos crescem a cada golpe, persistem no resgate e desaparecem com a cura', (t) => {
  const f = fixture(t); startLobby(f); f.advance(46_000); f.state();
  f.advance(20_000);
  assert.equal(f.state().trial.players[0].wounds, 1);
  f.advance(20_000);
  let trial = f.state().trial;
  assert.equal(trial.players[0].state, 'caught');
  assert.equal(trial.players[0].wounds, 2);
  assert.deepEqual(trial.sceneEvents.filter(e => e.kind === 'attack').map(e => e.wounds), [1, 2]);
  assert.equal(as(f, BOB)('!libertar alice').ok, true);
  assert.equal(f.state().trial.players[0].wounds, 2);
  assert.equal(createGame(f.store, { now: f.now, random: () => 0 }).getState('canal_a', '123').trial.players[0].wounds, 2);
  f.advance(20_000);
  assert.equal(f.state().trial.players[0].wounds, 3);
  assert.equal(as(f, BOB)('!libertar alice').ok, true);
  f.patchTrial(data => { data.nextTickAt = f.now() + 1_000_000; });
  f.advance(15_000);
  assert.equal(as(f, BOB)('!curar alice').ok, true);
  trial = f.state().trial;
  assert.equal(trial.players[0].wounds, 0);
  assert.equal(trial.sceneEvents.at(-1).wounds, 0);
});

test('esquiva e Segundo fôlego não agravam ferimentos; provas antigas continuam válidas', (t) => {
  const f = fixture(t); startLobby(f); f.advance(46_000); f.state();
  f.patchTrial(data => {
    const p = data.players['123']; delete p.wounds; p.state = 'hurt'; p.fx.secondWind = true;
    data.nextTickAt = f.now();
  });
  let trial = f.state().trial;
  assert.equal(trial.sceneEvents.at(-1).outcome, 'secondWind');
  assert.equal(trial.players[0].wounds, 1);
  const other = fixture(t, { random: () => .999 });
  startLobby(other); other.advance(66_000);
  trial = other.state().trial;
  assert.equal(trial.sceneEvents.filter(e => e.kind === 'attack').at(-1).outcome, 'miss');
  assert.ok(trial.players.every(p => p.wounds === 0));
});

test('espera de busca é compartilhada por aliases, domínios, equipamento e novas instâncias', (t) => {
  const f=fixture(t); f.setPlayer({owned_tier:11,xp:1_000_000});
  const first=f.run('!vasculhar bosque');
  assert.equal(first.player.searchCooldownMs,600_000);
  const deadline=first.player.readyAt;
  assert.equal(f.run(`!equipar ${EQUIPMENT[11].id}`).ok,true);
  for(const text of ['!explorar oficina','!vasculhar bosque','!explorar hospital']) {
    const denied=f.run(text); assert.equal(denied.status,429); assert.equal(denied.player.readyAt,deadline);
    assert.equal(denied.player.inventoryCount,1); assert.equal(denied.player.xp,first.player.xp);
  }
  const reopened=createGame(f.store,{now:f.now,random:()=>0}).getState('canal_a','123').player;
  assert.equal(reopened.readyAt,deadline); assert.equal(reopened.searchCooldownMs,600_000);
  assert.equal(reopened.nextSearchCooldownMs,180_000);
  f.advance(599_999); assert.equal(f.run('!vasculhar').ok,false);
  f.advance(1); assert.equal(f.run('!vasculhar').ok,true);
});

test('buscas têm piso de 1 minuto no canal e 10 segundos na demonstração', (t) => {
  const f=fixture(t,{cooldownMs:1000});
  assert.equal(f.run('!vasculhar').player.searchCooldownMs,60_000);
  const session='e'.repeat(40); f.game.setDemoScenario(session,11);
  const input={channel:`demo:${session}`,playerId:'demo',login:'explorador',displayName:'Você',text:'!vasculhar',messageId:'demo-floor-first'};
  const first=f.game.execute(input,{isDemo:true}); assert.equal(first.player.searchCooldownMs,10_000);
  f.advance(9999); assert.equal(f.game.execute({...input,messageId:'demo-floor-early'},{isDemo:true}).ok,false);
  f.advance(1); assert.equal(f.game.execute({...input,messageId:'demo-floor-next'},{isDemo:true}).ok,true);
});

test('demonstração inicial espera 30 segundos sem perder itens, prazo ou XP nas recusas', (t) => {
  const f=fixture(t),session='f'.repeat(40); f.game.startDemo(session);
  const input={channel:`demo:${session}`,playerId:'demo',login:'explorador',displayName:'Você',text:'!vasculhar',messageId:'demo-wait-first'};
  const first=f.game.execute(input,{isDemo:true}); assert.equal(first.player.searchCooldownMs,30_000);
  f.advance(2000);
  const denied=f.game.execute({...input,messageId:'demo-wait-early',text:'!explorar bosque'},{isDemo:true});
  assert.equal(denied.status,429); assert.equal(denied.player.readyAt,first.player.readyAt);
  assert.equal(denied.player.xp,first.player.xp); assert.equal(denied.player.inventoryCount,1);
  f.advance(28_000); assert.equal(f.game.execute({...input,messageId:'demo-wait-next'},{isDemo:true}).ok,true);
});

test('descanso de 15 segundos entre provas da demonstração também é informado à página', (t) => {
  const f=fixture(t),session='0'.repeat(40),channel=`demo:${session}`; f.game.startDemo(session);
  const input={channel,playerId:'demo',login:'explorador',displayName:'Você',text:'!prova',messageId:'demo-rest-first'};
  assert.equal(f.game.execute(input,{isDemo:true}).ok,true);
  f.advance(155_000);
  const ended=f.game.getState(channel,'demo').trial;
  assert.equal(ended.phase,'ended'); assert.equal(ended.nextTrialAt,f.now()+15_000);
  assert.equal(f.game.execute({...input,messageId:'demo-rest-early'},{isDemo:true}).status,429);
  f.advance(15_000); assert.equal(f.game.execute({...input,messageId:'demo-rest-next'},{isDemo:true}).ok,true);
});
