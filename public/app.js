/**
 * @file Interface jogável da Entidade. Demonstrações escrevem somente na sessão deste navegador.
 * Na comunidade real, a página consulta o progresso; ações são executadas pelo bot no chat.
 */
import { sprite, person, PARTS, PART_LABELS, appearanceFor, normalizeAppearance } from './pixel.js';
import { installPixelIcons, retargetIcons } from './pixel-icons.js';
import { sceneLayers } from './scenery.js';
import { TrialScene } from './trial-scene.js';
import { ExplorationScene } from './exploration-scene.js';
import { ReadinessClock, ReadySound } from './action-readiness.js';
import { itemImage } from './item-assets.js';

let iconBase = '/icons.svg#';
let myLook = null;
try { myLook = JSON.parse(localStorage.getItem('limiar:visual') || 'null'); } catch { myLook = null; }

const $ = (id) => document.getElementById(id);
const labels = { provas: 'Provas', expedicoes: 'Buscas', mochila: 'Bolsa', loja: 'Equipamentos',
  codice: 'Códice de achados', ranking: 'Sobreviventes', manual: 'Manual de campo' };
const stateNames = { ok: 'Em pé', hurt: 'Ferido', caught: 'Preso', dead: 'Perdido na névoa', escaped: 'Escapou' };
const parameters = new URLSearchParams(location.search);
let mode = parameters.get('canal') ? 'live' : 'demo';
let channel = parameters.get('canal') || '';
let playerLogin = parameters.get('jogador') || '';
let catalogue;
let state;
let selectedRegion = 'bosque';
let currentView = 'provas';
let rarityFilter = -1;
let categoryFilter = 'all';
let searchTerm = '';
let availableOnly = false;
let codexVisibleCount = 24;
let shopCategory = 'toolboxes';
let busy = false;
let clockOffset = 0;
let toastTimer;
let liveFailures = 0;
let pollInFlight = false;
let explorationScene;
const readiness = new ReadinessClock(), readySound = new ReadySound(), readyPulses = new Map();

/** Visual escolhido por mim (só vale para o meu jogador); os demais são sorteados pelo login. */
function lookFor(login) {
  return !login || login === state?.player?.login ? myLook : null;
}

function node(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text != null) result.textContent = text;
  return result;
}

function icon(name, className = '') {
  const result = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  result.setAttribute('aria-hidden', 'true');
  if (className) result.setAttribute('class', className);
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `${iconBase}${name}`);
  result.append(use);
  return result;
}

function objectIcon(entry, className = '') {
  return itemImage(entry?.id, className) || icon(entry?.icon || 'bag', className);
}

function empty(title, description, symbol = 'compass') {
  const result = node('div', 'empty-state');
  result.append(icon(symbol), node('strong', '', title), node('p', '', description));
  return result;
}

function format(value) { return Number(value || 0).toLocaleString('pt-BR'); }
function command(text) { return `${state?.prefix || '!'}${text}`; }
function toolForTier(tier) { return catalogue.equipment.find((entry) => entry.resourceTier >= tier); }
function toolForItem(item) { return catalogue.equipment.find((entry) => entry.id === item.minEquipmentId); }
function canFind(item) {
  return item.tier <= (state.player?.equipment.resourceTier ?? 0)
    && toolForItem(item).tier <= (state.player?.equipment.tier ?? 0);
}
function percent(value) { return `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`; }
function normalize(text) { return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function toast(text) {
  clearTimeout(toastTimer);
  $('toast').textContent = text;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6000);
}

async function api(path, body) {
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}

function stateUrl() {
  const search = new URLSearchParams({ mode });
  if (mode === 'live') { search.set('channel', channel); search.set('player', playerLogin); }
  return `/api/state?${search}`;
}

function applyState(next) {
  if (state && next.serverTime < state.serverTime) return;
  state = { ...state, ...next };
  clockOffset = state.serverTime - Date.now();
  const region = catalogue.regions.find((entry) => entry.id === selectedRegion);
  if (!region || region.tier > (state.player?.equipment.resourceTier ?? 0)) selectedRegion = state.player?.region || 'bosque';
  render();
}

function showView(name) {
  if (!labels[name]) name = 'provas';
  currentView = name;
  document.body.dataset.view = name;
  document.querySelectorAll('.page-view').forEach((view) => { view.hidden = view.id !== `view-${name}`; });
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === name);
    if (button.dataset.view === name) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  $('page-label').textContent = labels[name];
  history.replaceState(null, '', `${location.pathname}${location.search}#${name}`);
  document.title = `${labels[name]} — Entidade`;
}

function itemArt(item) {
  const art = node('div', 'item-art');
  art.style.setProperty('--item-color', catalogue.rarities[item.rarity].color);
  art.append(objectIcon(item, 'artifact-icon'));
  return art;
}

function renderProfile() {
  const player = state.player;
  $('player-name').textContent = player?.name || 'Um lugar para você';
  $('player-title').textContent = player ? ['O primeiro passo', 'Leitor de trilhas', 'Rastreador de vestígios',
    'Veterano da névoa', 'Guardião dos faróis', 'Viajante do limiar'][player.equipment.resourceTier]
    : 'Selecione um jogador para ver seu progresso';
  $('avatar-level').textContent = player?.level || '—';
  document.querySelector('.explorer-avatar > :is(svg, .person)')?.replaceWith(person(player?.login || 'voce', 'portrait', 3, '', lookFor(player?.login)));
  $('level-label').textContent = player ? `Nível ${player.level}` : 'Sem jogador selecionado';
  $('xp-label').textContent = player ? `${format(player.xp)} / ${format(player.nextLevelXp)} XP` : '—';
  $('xp-progress').style.width = player ? `${100 * (player.xp - player.levelStart) / (player.nextLevelXp - player.levelStart)}%` : '0%';
  $('coins').textContent = format(player?.coins);
  $('escapes').textContent = format(player?.escapes);
  $('equipped-icon').replaceChildren(objectIcon(player?.equipment));
  $('equipped-name').textContent = player?.equipment.name || 'Nenhum equipamento';
  $('equipped-tier').textContent = player ? `Etapa ${player.equipment.tier + 1} · Até ${catalogue.rarities[player.equipment.resourceTier].name}` : 'Jogue pelo chat para começar';
  const bonuses = player?.bonuses;
  $('active-benefits').replaceChildren(...(bonuses ? [
    ['Sorte total', `+${percent(bonuses.luck)}`], ['Reparo', `+${percent(bonuses.repair)}`],
    ['XP por busca', `+${percent(bonuses.xpMultiplier - 1)}`], ['Bônus de venda', `+${percent(bonuses.sellMultiplier - 1)}`],
  ].map(([label, value]) => { const row = node('div'); row.append(node('span', '', label), node('strong', '', value)); return row; }) : []));
  $('light-status').replaceChildren(objectIcon({ ...player?.light, icon: 'flashlight' }), node('span', '', player?.light.name || 'Sem lanterna'));
  const equippedTalents = (player?.talents.equipped || []).map((id) => catalogue.talents.find((entry) => entry.id === id)?.name);
  $('talent-status').replaceChildren(icon('star'), node('span', '', player
    ? `Talentos ${equippedTalents.length}/${player.talents.slots}${equippedTalents.length ? ` · ${equippedTalents.join(', ')}` : ''}` : 'Sem talentos'));
  $('bag-space').textContent = player ? `${player.inventoryCount} / ${player.capacity}` : '—';
  $('bag-progress').style.width = player ? `${100 * player.inventoryCount / player.capacity}%` : '0%';
  $('nav-count').textContent = player?.inventoryCount || 0;
}

function renderRegions() {
  const tier = state.player?.equipment.resourceTier || 0;
  const region = catalogue.regions.find((entry) => entry.id === selectedRegion);
  const index = catalogue.regions.indexOf(region);
  $('hero-region').textContent = region.name;
  $('hero-description').textContent = region.description;
  renderHero(region);
  $('region-tag').textContent = `DOMÍNIO ${String(index + 1).padStart(2, '0')} · DISPONÍVEL`;
  const rarities = [...new Set(catalogue.items.filter((entry) => canFind(entry) && entry.regions.includes(region.id))
    .map((entry) => entry.rarity))];
  $('hero-rarity').textContent = `Até ${catalogue.rarities[Math.max(...rarities, 0)].name.toLowerCase()}`;
  $('hero-equipment').textContent = state.player?.equipment.name || 'Bolsa de lona';
  $('explore-hint').textContent = command(`vasculhar ${region.id}`);
  $('unlocked-count').textContent = catalogue.regions.filter((entry) => entry.tier <= tier).length;
  const selectRegion = (entry) => {
    if (entry.tier > tier) { toast(`${entry.name} exige ${toolForTier(entry.tier).name} equipada.`); return; }
    selectedRegion = entry.id; renderRegions();
  };
  $('region-selector').replaceChildren(...catalogue.regions.map((entry) => {
    const locked = entry.tier > tier;
    const button = node('button', `region-option${locked ? ' locked' : ''}${entry.id === selectedRegion ? ' selected' : ''}`);
    button.type = 'button';
    button.disabled = busy;
    button.setAttribute('aria-pressed', String(entry.id === selectedRegion));
    const text = node('span');
    text.append(node('strong', '', entry.name), node('small', '', locked ? toolForTier(entry.tier).name : 'Caminho disponível'));
    const preview = node('div', 'domain-preview');
    preview.setAttribute('aria-hidden', 'true');
    preview.append(sceneLayers(entry.id, 120), icon(locked ? 'lock' : entry.icon));
    button.append(preview, text, node('span', 'domain-number', String(catalogue.regions.indexOf(entry) + 1).padStart(2, '0')));
    button.addEventListener('click', () => selectRegion(entry));
    return button;
  }));
  const odds = state.regionOdds?.find((entry) => entry.regionId === region.id);
  $('region-odds').replaceChildren(...(odds ? odds.rarities.filter((entry) => entry.probability > 0).map((entry) => {
    const row = node('div', 'odds-row');
    row.append(node('span', '', entry.name), node('strong', '', `${(entry.probability * 100).toFixed(1)}%`));
    return row;
  }) : [node('p', '', 'Selecione seu jogador para consultar as chances reais.') ]));
  $('odds-note').textContent = odds
    ? `${odds.eligibleItems} achados possíveis. Sorte, lanterna, talentos e nível já incluídos.`
    : 'As chances dependem do equipamento equipado e do nível.';
  renderCooldown();
}

function renderCooldown() {
  if (!state) return;
  const seconds = Math.max(0, Math.ceil(((state.player?.readyAt || 0) - Date.now() - clockOffset) / 1000));
  const searchMode = document.querySelector('.hero-art').dataset.searchMode;
  $('explore').disabled = busy || seconds > 0;
  $('explore-label').textContent = busy ? searchMode === 'roots' ? 'Cavando…' : searchMode === 'crate' ? 'Abrindo o baú…' : searchMode === 'hut' ? 'Vasculhando a casinha…' : 'Procurando vestígios…'
    : seconds > 0 ? `Próxima busca em ${formatDelay(seconds)}` : mode === 'live' ? 'Jogar no chat da Twitch' : 'Partir em busca';
  $('explore-label').classList.toggle('loading-label', busy);
  $('search-cooldown').hidden = seconds <= 0;
  $('search-cooldown-time').textContent = formatDelay(seconds);
  const duration = Math.max(1,(state.player?.searchCooldownMs || 30_000)/1000);
  const recovery = Math.max(0,Math.min(100,100*(1-seconds/duration)));
  $('search-recovery').style.setProperty('--recovery',`${recovery}%`);
  $('search-recovery').setAttribute('aria-valuenow',String(Math.floor(recovery)));
  const nextSeconds = Math.ceil((state.player?.nextSearchCooldownMs || (mode === 'demo' ? 30_000 : 600_000))/1000);
  $('search-policy').textContent = `${mode === 'demo' ? 'Demonstração' : 'Seu equipamento'}: uma busca a cada ${formatDelay(nextSeconds)}. A espera vale para todos os domínios.`;
}

function formatDelay(seconds) {
  return seconds >= 60 ? `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}` : `${seconds}s`;
}
function toolWait(entry) { return Math.max(60,Math.round((state.cooldownSeconds || 600)*entry.cooldown)); }

function paintSoundControl() {
  const button = $('ready-sound');
  button.setAttribute('aria-pressed', String(readySound.enabled));
  button.setAttribute('aria-label', readySound.enabled ? 'Silenciar avisos sonoros' : 'Ativar avisos sonoros');
  button.title = readySound.enabled ? 'Blip quando uma ação liberar. Clique para silenciar.' : 'Avisos silenciados. Clique para ativar.';
  $('ready-sound-label').textContent = readySound.enabled ? 'Som ligado' : 'Sem som';
}

function renderReadiness() {
  if (!state) return;
  const now = Date.now() + clockOffset, player = state.player, trial = state.trial;
  const me = trial?.players.find(entry => entry.login === player?.login);
  const entries = [];
  if (player) entries.push({ key: 'search', until: player.readyAt, text: 'Sua próxima busca está disponível!' });
  if (trial?.phase === 'running' && me && ['ok','hurt'].includes(me.state)) {
    entries.push({ key: 'action', until: me.nextActionAt, text: 'Você já pode agir novamente na prova!' });
  }
  if (player && trial?.phase === 'ended') entries.push({ key: 'trial', until: trial.nextTrialAt, text: 'Uma nova prova está disponível!' });
  const scope = `${mode}:${channel}:${player?.login || ''}`, changed = readiness.scope !== scope;
  if (changed) readyPulses.clear();
  const ready = readiness.observe(scope, entries, now);
  if (ready.length) {
    readySound.play(); toast(ready.map(entry => entry.text).join(' '));
    for (const entry of ready) readyPulses.set(entry.key, now + 7000);
  }
  const lit = key => !busy && (readyPulses.get(key) || 0) > now && entries.some(entry => entry.key === key && entry.until <= now);
  $('explore').classList.toggle('action-ready', lit('search'));
  document.querySelectorAll('[data-ready-kind]').forEach(button => button.classList.toggle('action-ready', lit(button.dataset.readyKind)));
  $('trial-hint').classList.toggle('action-ready-text', lit('action') || lit('trial'));
}

document.addEventListener('pointerdown', () => readySound.prepare(), { passive: true });
document.addEventListener('keydown', () => readySound.prepare(), { passive: true });
$('ready-sound').addEventListener('click', () => { readySound.toggle(); paintSoundControl(); });
paintSoundControl();

function renderRecent() {
  const discoveries = state.events.filter((entry) => entry.kind === 'explore')
    .flatMap((entry) => entry.drops?.length ? entry.drops : [{ id: entry.itemId, quantity: 1 }]).slice(0, 4);
  $('recent-loot').replaceChildren(...(discoveries.length ? discoveries.map((entry) => {
    const item = catalogue.items.find((item) => item.id === entry.id);
    const card = node('div', 'loot-mini');
    card.style.setProperty('--item-color', catalogue.rarities[item.rarity].color);
    card.append(itemArt(item), node('strong', '', `${entry.quantity > 1 ? `${entry.quantity}× ` : ''}${item.name}`),
      node('small', '', catalogue.rarities[item.rarity].name));
    return card;
  }) : [empty('A primeira descoberta está logo ali.', 'Escolha um domínio e parta em busca. Todo achado conta uma história.', 'gem')]));
  $('journal-count').textContent = state.events.length ? `${state.events.length} REGISTROS RECENTES` : 'O COMEÇO DE UMA HISTÓRIA';
  $('journal').replaceChildren(...(state.events.length ? state.events.slice(0, 6).map((entry) => {
    const row = node('div', 'journal-row');
    const text = node('div');
    text.append(node('p', '', entry.text), node('small', '', entry.kind === 'explore' ? 'Busca concluída'
      : entry.kind === 'trial' ? 'Prova encerrada' : 'Movimentação no acampamento'));
    const time = node('time', '', new Date(entry.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    time.dateTime = new Date(entry.createdAt).toISOString();
    row.append(icon(entry.kind === 'explore' ? 'compass' : entry.kind === 'trial' ? 'exit' : 'coin'), text, time);
    return row;
  }) : [empty('O diário ainda está em branco.', 'Suas buscas, vendas e provas aparecerão aqui.', 'book')]));
}

function itemCard(item, quantity, codex = false) {
  const rarity = catalogue.rarities[item.rarity];
  const card = node('article', 'item-card');
  card.style.setProperty('--item-color', rarity.color);
  if (quantity) card.append(node('span', 'quantity-badge', `×${quantity}`));
  card.append(itemArt(item), node('span', 'rarity-badge', rarity.name), node('h3', '', item.name),
    node('p', 'item-description', item.description));
  const meta = node('div', 'item-meta');
  const sellValue = Math.floor(item.value * (state.player?.bonuses.sellMultiplier || 1));
  meta.append(node('span', '', `${format(sellValue)} Brasas`), node('span', '', `${rarity.xp} XP base`));
  card.append(meta);
  if (codex) {
    const row = node('div', 'item-lock');
    const unlocked = canFind(item);
    row.append(icon(unlocked ? 'check' : 'lock'), node('span', '', unlocked
      ? state.player?.discoveries.includes(item.id) ? 'Descoberto por você' : 'Disponível para descobrir'
      : `Exige ${toolForItem(item).name}`));
    card.append(row);
  } else {
    const button = node('button', 'secondary', mode === 'live' ? 'Copiar venda de 1 unidade' : 'Vender 1 unidade');
    button.disabled = busy;
    button.addEventListener('click', () => act(`vender ${item.id}`));
    card.append(button);
  }
  card.append(node('div', 'item-id', item.id));
  return card;
}

function renderInventory() {
  const player = state.player;
  $('inventory-total').textContent = player ? `${player.inventoryCount} / ${player.capacity} espaços` : 'Selecione um jogador';
  $('sell-all').disabled = busy || !player?.inventoryCount;
  $('sell-all').textContent = mode === 'live' ? 'Copiar comando de venda' : 'Vender todos os achados';
  $('inventory-grid').replaceChildren(...(player?.inventory.length
    ? player.inventory.map((entry) => itemCard(catalogue.items.find((item) => item.id === entry.id), entry.quantity))
    : [empty('Leve apenas o necessário. Volte com uma história.', 'Sua bolsa ainda está vazia. Os itens encontrados nas buscas aparecerão aqui.', 'bag')]));
}

function trialSeconds() {
  const trial = state?.trial;
  if (!trial || trial.phase === 'ended') return 0;
  return Math.max(0, trial.secondsLeft - Math.floor((Date.now() + clockOffset - state.serverTime) / 1000));
}

function renderTrialClock() {
  if (!state) return;
  $('trial-seconds').textContent = trialSeconds();
  document.querySelectorAll('[data-cooldown-until]').forEach(button => {
    const seconds = Math.max(0, Math.ceil((Number(button.dataset.cooldownUntil) - Date.now() - clockOffset) / 1000));
    button.disabled = busy || seconds > 0;
    const countdown = button.querySelector('.action-countdown');
    if (countdown) countdown.textContent = seconds ? `${seconds}s` : '';
  });
}

/** A cena mantém seus atores vivos entre consultas do canal. */
let trialScene;
function renderStage(trial) {
  trialScene ||= new TrialScene($('trial-stage'), { lookFor, prefix: () => state?.prefix || '!' });
  trialScene.sync(trial, state.player?.login, state.serverTime);
}
function renderTrial() {
  const trial = state.trial;
  const me = trial?.players.find((entry) => entry.login === state.player?.login);
  const active = trial && trial.phase !== 'ended';
  const phaseText = !trial ? 'SEM PROVA ABERTA' : trial.phase === 'lobby' ? 'ABERTA · REUNINDO O GRUPO'
    : trial.phase === 'running' ? 'EM ANDAMENTO' : trial.result?.outcome === 'escaped' ? 'ENCERRADA · ALGUÉM ESCAPOU' : 'ENCERRADA · A NÉVOA VENCEU';
  $('trial-phase').textContent = phaseText;
  $('trial-card').dataset.phase = trial?.phase || 'none';
  $('nav-trial').textContent = active ? (trial.phase === 'lobby' ? 'ABERTA' : 'AO VIVO') : '—';
  $('trial-title').textContent = !trial ? 'Um respiro antes da névoa'
    : trial.phase === 'lobby' ? 'Prova aberta' : trial.phase === 'running' ? `${trial.hunter.name} está à solta` : 'A névoa se fechou';
  $('trial-hunter').textContent = trial ? trial.hunter.description : 'Reúna até quatro sobreviventes. A próxima travessia começa com vocês.';
  $('trial-clock').hidden = !active;
  $('trial-clock').querySelector('small').textContent = trial?.phase === 'lobby' ? 'para começar' : 'restantes';
  renderTrialClock();
  renderStage(trial);
  $('trial-generators').replaceChildren(...(trial?.generators || []).map((value, index) => {
    const lamp = node('div', `generator${value >= 100 ? ' lit' : ''}`);
    const bar = node('i'); bar.style.setProperty('--value', `${Math.min(100, value)}%`);
    lamp.append(sprite(value >= 100 ? 'farolOn' : 'farolOff'), node('strong', '', `Farol ${index + 1}`), node('small', '', `${Math.min(100, Math.floor(value))}%`), bar);
    return lamp;
  }));
  if (trial?.gates) $('trial-generators').append(node('div', 'gate-open', 'PORTÃO ABERTO'));
  $('trial-players').replaceChildren(...(trial?.players || []).map((entry) => {
    const card = node('div', `survivor ${entry.state}${entry.login === state.player?.login ? ' me' : ''}`);
    card.append(person(entry.login, entry.state, 2, '', lookFor(entry.login)), node('strong', '', entry.name), node('small', '', stateNames[entry.state]),
      node('em', '', `${entry.repairs} reparos`));
    if (mode === 'demo' && active && me && entry.state === 'caught' && entry.login !== me.login) {
      const free = node('button', 'secondary', 'Libertar'); free.disabled = busy;
      free.dataset.cooldownUntil = me.nextActionAt || 0; free.append(node('small', 'action-countdown'));
      free.dataset.readyKind = 'action';
      free.addEventListener('click', () => act(`libertar ${entry.login}`));
      card.append(free);
    }
    return card;
  }));
  const actions = [];
  const add = (label, text, className = 'secondary', symbol) => {
    const button = node('button', className);
    if (symbol) button.append(icon(symbol));
    button.append(node('span', '', label));
    if (['prova', 'reparar', 'esconder', 'curar'].includes(text)) {
      button.dataset.cooldownUntil = text === 'prova' ? trial?.nextTrialAt || 0 : me?.nextActionAt || 0;
      button.dataset.readyKind = text === 'prova' ? 'trial' : 'action';
      button.append(node('small', 'action-countdown'));
    }
    button.disabled = busy;
    button.addEventListener('click', () => act(text));
    actions.push(button);
  };
  if (!active) add('Abrir prova', 'prova', 'primary', 'beacon');
  else if (trial.phase === 'lobby' && !me) add('Entrar na prova', 'entrar', 'primary', 'user');
  else if (trial.phase === 'running' && me && ['ok', 'hurt'].includes(me.state)) {
    if (trial.gates) add('Fugir pelo portão', 'fugir', 'primary', 'exit');
    else add('Reparar farol', 'reparar', 'primary', 'toolbox');
    add('Esconder-se', 'esconder', 'secondary', 'eye');
    if (me.state === 'hurt') add('Curar-se', 'curar', 'secondary', 'heart');
  }
  $('trial-actions').replaceChildren(...actions);
  $('trial-actions').hidden = !actions.length || mode === 'live';
  renderTrialClock();
  const hint = $('trial-hint');
  const actionCommand = !active ? 'prova' : trial.phase === 'lobby' ? 'entrar' : me?.state === 'caught' ? 'libertar @nome' : trial.gates ? 'fugir' : 'reparar';
  const hintCode = node('code', '', command(actionCommand));
  hint.replaceChildren(document.createTextNode(mode === 'live' ? 'Jogue pelo chat: ' : 'No chat da live: '), hintCode,
    document.createTextNode(active && trial.phase === 'running' && !trial.gates ? ` · ${command('esconder')} reduz o risco de ser encontrado.` : active && trial.phase === 'lobby' ? ' · Até 4 sobreviventes por prova.' : ''));
  $('trial-log-count').textContent = trial?.log.length ? `${trial.log.length} REGISTROS` : 'NADA, POR ENQUANTO';
  $('trial-log').replaceChildren(...(trial?.log.length ? [...trial.log].reverse().map((entry) => {
    const row = node('div', 'journal-row');
    const time = node('time', '', new Date(entry.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    row.append(icon('candle'), node('div', '', ''), time);
    row.children[1].append(node('p', '', entry.text));
    return row;
  }) : [empty('Silêncio. Por enquanto.', 'Quando uma prova começar, cada passo dela aparece aqui.', 'candle')]));
  $('trial-side-text').replaceChildren(document.createTextNode(active ? (trial.phase === 'lobby' ? 'Uma prova está reunindo o grupo.' : 'Uma prova está em andamento.') : 'Nenhuma prova aberta agora.'),
    node('br'), document.createTextNode(active ? `${trial.players.length} sobrevivente(s).` : 'Que tal abrir uma?'));
}

function statRows(pairs) {
  const benefits = node('div', 'equipment-benefits');
  pairs.forEach(([label, value]) => { const row = node('div'); row.append(node('span', '', label), node('strong', '', value)); benefits.append(row); });
  return benefits;
}

function renderEquipment() {
  const player = state.player;
  const selectedCategory = catalogue.shopCategories.find((entry) => entry.id === shopCategory);
  const counts = { toolboxes: catalogue.equipment.filter((entry) => entry.category === 'toolboxes').length,
    exploration: catalogue.equipment.filter((entry) => entry.category === 'exploration').length,
    backpacks: catalogue.backpacks.length, lights: catalogue.lights.length - 1, talents: catalogue.talents.length };
  $('shop-categories').replaceChildren(...catalogue.shopCategories.map((entry) => {
    const button = node('button', `shop-category${entry.id === shopCategory ? ' active' : ''}`);
    button.append(icon(entry.icon), node('span', '', entry.name), node('small', '', counts[entry.id]));
    if (entry.id === shopCategory) button.setAttribute('aria-current', 'true');
    button.addEventListener('click', () => { shopCategory = entry.id; renderEquipment(); });
    return button;
  }));
  $('shop-category-title').textContent = selectedCategory.name;
  $('shop-category-description').textContent = selectedCategory.description;
  const nextTool = player ? catalogue.equipment[player.ownedTier + 1] : null;
  $('shop-next-step').textContent = nextTool
    ? `Próxima etapa: ${nextTool.name} · ${catalogue.shopCategories.find((entry) => entry.id === nextTool.category).name}.`
    : 'Ferramentas, lanternas, bolsas e talentos têm suas próprias melhorias.';
  $('equipment-grid').hidden = !['toolboxes', 'exploration'].includes(shopCategory);
  $('backpack-grid').hidden = shopCategory !== 'backpacks';
  $('light-grid').hidden = shopCategory !== 'lights';
  $('talent-grid').hidden = shopCategory !== 'talents';
  $('equipment-grid').replaceChildren(...catalogue.equipment.filter((entry) => entry.category === shopCategory).map((entry) => {
    const owned = player && entry.tier <= player.ownedTier;
    const equipped = player?.equipment.id === entry.id;
    const next = player && entry.tier === player.ownedTier + 1;
    const canBuy = next && player.level >= entry.level && player.coins >= entry.price;
    const card = node('article', `equipment-card${equipped ? ' equipped' : ''}${next ? ' next-up' : ''}${!owned && !next ? ' locked' : ''}`);
    card.style.setProperty('--gear-color', catalogue.rarities[entry.resourceTier].color);
    card.dataset.step = String(entry.tier + 1).padStart(2, '0');
    card.append(node('span', 'equipment-status', equipped ? 'EM USO' : owned ? 'NA SUA COLEÇÃO'
      : next ? 'SUA PRÓXIMA MELHORIA' : `ETAPA ${entry.tier + 1}`), objectIcon(entry),
      node('h3', '', entry.name), node('p', '', entry.description));
    const requirements = node('div', 'equipment-requirements');
    requirements.append(node('span', '', entry.price ? `${format(entry.price)} Brasas` : 'Equipamento inicial'),
      node('span', '', `Nível ${entry.level}`));
    const button = node('button', equipped ? 'secondary' : 'primary', equipped ? 'Equipado'
      : owned ? mode === 'live' ? 'Copiar comando de equipar' : 'Equipar'
      : mode === 'live' ? 'Copiar comando de compra' : 'Adquirir');
    button.disabled = busy || equipped || (!owned && !canBuy);
    button.addEventListener('click', () => act(`${owned ? 'equipar' : 'comprar'} ${entry.id}`));
    const detail = node('small', '', `Espera entre buscas no canal: ${formatDelay(toolWait(entry))}`);
    if (!owned && !next && entry.tier) {
      const previous = catalogue.equipment[entry.tier - 1];
      detail.textContent = `Requer ${previous.name}, na categoria ${catalogue.shopCategories.find((category) => category.id === previous.category).name}.`;
    }
    if (next && !canBuy) detail.textContent = player.level < entry.level
      ? `Disponível no nível ${entry.level}. Você está no nível ${player.level}.`
      : `Faltam ${format(entry.price - player.coins)} Brasas para esta melhoria.`;
    card.append(requirements, statRows([['Espera', formatDelay(toolWait(entry))],
      ['Sorte', `+${percent(entry.luck)}`], ['Reparo', `+${percent(entry.repair || 0)}`],
      ['Raridade', catalogue.rarities[entry.resourceTier].name], ['XP adicional', `+${percent(entry.xpMultiplier - 1)}`]]), button, detail);
    return card;
  }));
  $('backpack-grid').replaceChildren(...catalogue.backpacks.map((pack, index) => {
    const active = player?.backpackLevel === index;
    const owned = player && player.backpackLevel >= index;
    const next = player && player.backpackLevel + 1 === index;
    const card = node('article', `equipment-card${active ? ' equipped' : ''}`);
    card.append(node('span', 'equipment-status', active ? 'EM USO' : owned ? 'MELHORIA ADQUIRIDA' : `BOLSA ${index + 1}`),
      objectIcon({ id: `backpack-${index}`, icon: 'bag' }), node('h3', '', pack.name), node('p', '', `${pack.capacity} espaços para suprimentos, relíquias e oferendas.`));
    const requirements = node('div', 'equipment-requirements');
    requirements.append(node('span', '', pack.price ? `${format(pack.price)} Brasas` : 'Bolsa inicial'));
    const button = node('button', active || owned ? 'secondary' : 'primary', active ? 'Equipada' : owned
      ? 'Já adquirida' : mode === 'live' ? 'Copiar ampliação' : 'Ampliar bolsa');
    button.disabled = busy || !next || (player?.coins || 0) < pack.price;
    button.addEventListener('click', () => act('comprar bolsa'));
    card.append(requirements, button, node('small', '', index && !owned && !next ? `Requer ${catalogue.backpacks[index - 1].name}.` : 'A melhoria amplia sua capacidade permanentemente.'));
    return card;
  }));
  $('light-grid').replaceChildren(...catalogue.lights.filter((light) => light.level).map((light) => {
    const active = player?.light.level === light.level;
    const owned = player && player.light.level >= light.level;
    const next = player && player.light.level + 1 === light.level;
    const card = node('article', `equipment-card${active ? ' equipped' : ''}`);
    card.append(node('span', 'equipment-status', active ? 'ACESA E EQUIPADA' : owned ? 'MELHORIA ADQUIRIDA' : `LANTERNA ${light.level}`),
      objectIcon({ ...light, icon: 'flashlight' }), node('h3', '', light.name), node('p', '', light.description));
    const requirements = node('div', 'equipment-requirements');
    requirements.append(node('span', '', `${format(light.price)} Brasas`), node('span', '', `Nível ${light.requiredLevel}`));
    const button = node('button', owned ? 'secondary' : 'primary', active ? 'Equipada' : owned ? 'Já adquirida'
      : mode === 'live' ? 'Copiar compra' : 'Adquirir e acender');
    button.disabled = busy || !next || (player?.coins || 0) < light.price || (player?.level || 0) < light.requiredLevel;
    button.addEventListener('click', () => act(`comprar ${light.id}`));
    card.append(requirements, statRows([['Sorte adicional', `+${percent(light.luck)}`], ['XP adicional', `+${percent(light.xpMultiplier - 1)}`]]),
      button, node('small', '', !owned && !next && light.level > 1
        ? `Requer ${catalogue.lights[light.level - 1].name}.` : 'Seus bônus acompanham todas as ferramentas.'));
    return card;
  }));
  $('talent-grid').replaceChildren(...catalogue.talents.map((talent) => {
    const learned = player?.talents.learned.includes(talent.id);
    const equipped = player?.talents.equipped.includes(talent.id);
    const slotsFull = player && player.talents.equipped.length >= player.talents.slots;
    const card = node('article', `equipment-card talent-card${equipped ? ' equipped' : ''}`);
    card.append(node('span', 'equipment-status', equipped ? 'EQUIPADO' : learned ? 'APRENDIDO' : 'TALENTO'),
      icon(talent.icon || 'star'), node('h3', '', talent.name), node('p', '', talent.description));
    const requirements = node('div', 'equipment-requirements');
    requirements.append(node('span', '', `${format(talent.price)} Brasas`), node('span', '', `Nível ${talent.requiredLevel}`));
    let label; let verb; let disabled;
    if (equipped) { label = mode === 'live' ? 'Copiar comando de guardar' : 'Guardar'; verb = 'guardar'; disabled = false; }
    else if (learned) { label = mode === 'live' ? 'Copiar comando de equipar' : 'Equipar'; verb = 'usar'; disabled = !!slotsFull; }
    else {
      label = mode === 'live' ? 'Copiar comando de aprender' : 'Aprender';
      verb = 'aprender';
      disabled = !player || player.coins < talent.price || player.level < talent.requiredLevel;
    }
    const button = node('button', learned ? 'secondary' : 'primary', label);
    button.disabled = busy || disabled;
    button.addEventListener('click', () => act(`${verb} ${talent.id}`));
    card.append(requirements, button, node('small', '', equipped || learned
      ? `Espaços: ${player.talents.equipped.length}/${player.talents.slots}. Vale a partir da próxima prova.`
      : 'Vale a partir da próxima prova em que você entrar.'));
    return card;
  }));
  document.querySelectorAll('.equipment-card > :is(svg, img.item-sprite)').forEach((drawing) => {
    const display = node('div', 'gear-display');
    drawing.replaceWith(display); display.append(drawing);
  });
}

function renderCodex() {
  $('rarity-filters').replaceChildren(...[{ name: 'Todos os achados', index: -1 },
    ...catalogue.rarities.map((entry, index) => ({ name: entry.name, index }))].map((entry) => {
    const button = node('button', `filter-button${entry.index === rarityFilter ? ' active' : ''}`, entry.name);
    button.setAttribute('aria-pressed', String(entry.index === rarityFilter));
    button.addEventListener('click', () => { rarityFilter = entry.index; renderCodex(); });
    return button;
  }));
  const filtered = catalogue.items.filter((entry) => (rarityFilter < 0 || entry.rarity === rarityFilter)
    && (categoryFilter === 'all' || entry.category === categoryFilter)
    && (!availableOnly || canFind(entry))
    && (!searchTerm || normalize(`${entry.name} ${entry.id}`).includes(normalize(searchTerm))));
  $('discovery-count').textContent = `${state.player?.discoveries.length || 0} de ${catalogue.items.length} descobertos · ${filtered.length} achados nesta seleção.`;
  $('codex-grid').replaceChildren(...(filtered.length
    ? filtered.slice(0, codexVisibleCount).map((entry) => itemCard(entry, 0, true))
    : [empty('Nenhum achado nesta seleção.', 'Experimente outra raridade, categoria ou nome.', 'gem')]));
  $('codex-load-more').hidden = filtered.length <= codexVisibleCount;
  $('codex-load-more').textContent = `Mostrar mais achados (${Math.min(codexVisibleCount, filtered.length)} / ${filtered.length})`;
}

function renderRanking() {
  $('community-stats').replaceChildren(...[['Sobreviventes', state.stats.players], ['Buscas', state.stats.expeditions],
    ['Provas jogadas', state.stats.trials], ['Fugas concluídas', state.stats.escapes]].map(([label, value]) => {
    const card = node('div'); card.append(node('strong', '', format(value)), node('span', '', label)); return card;
  }));
  if (!state.ranking.length) {
    $('ranking-table').replaceChildren(empty('Toda comunidade tem um primeiro sobrevivente.', 'O ranking aparece quando alguém usa um comando da Entidade no chat.', 'trophy'));
    return;
  }
  const table = node('table', 'ranking');
  const head = node('thead'); const header = node('tr');
  ['POSIÇÃO', 'SOBREVIVENTE', 'NÍVEL', 'EXPERIÊNCIA', 'FUGAS'].forEach((label) => header.append(node('th', '', label)));
  head.append(header); table.append(head);
  const body = node('tbody');
  state.ranking.forEach((entry) => {
    const row = node('tr');
    const name = node('td');
    if (mode === 'live') {
      const link = node('a', '', entry.name);
      link.href = `/?canal=${encodeURIComponent(channel)}&jogador=${encodeURIComponent(entry.login)}#provas`;
      name.append(link);
    } else name.textContent = `${entry.name} · demonstração`;
    row.append(node('td', '', String(entry.rank).padStart(2, '0')), name, node('td', '', entry.level),
      node('td', '', `${format(entry.xp)} XP`), node('td', '', entry.escapes));
    body.append(row);
  });
  table.append(body); $('ranking-table').replaceChildren(table);
}

function renderManual() {
  $('commands-list').replaceChildren(...catalogue.commands.map(([name, argumentsText, description]) => {
    const row = node('div', 'command-row');
    const text = command(name);
    const copy = node('button', '', '⧉');
    copy.setAttribute('aria-label', `Copiar ${text}`);
    copy.addEventListener('click', () => copyCommand(text));
    row.append(node('code', '', `${text}${argumentsText ? ` ${argumentsText}` : ''}`), node('p', '', description), copy);
    return row;
  }));
  $('manual-cooldown').textContent = `No canal, a espera base entre buscas é de ${formatDelay(state.cooldownSeconds || 600)} (minutos:segundos). Ferramentas melhores reduzem esse tempo, com mínimo de 1 minuto. A espera é compartilhada entre comandos e domínios e permanece ao sair do site. Na demonstração, começa em ${state.demoCooldownSeconds || 30} segundos. A bolsa começa com 30 espaços. Se estiver cheia, a busca não começa nem consome sua espera. Entre provas reais há 2 minutos de descanso; na demonstração, 15 segundos.`;
  for (const name of ['prova', 'reparar', 'libertar', 'fugir']) {
    document.querySelectorAll(`.dynamic-${name}`).forEach((entry) => { entry.textContent = command(name) + (name === 'libertar' ? ' @nome' : ''); });
  }
  $('command-input').placeholder = command('vasculhar bosque');
}

function render() {
  $('demo-banner').hidden = mode !== 'demo';
  $('mode-label').replaceChildren(node('i'), document.createTextNode(mode === 'demo' ? 'Demonstração' : `Comunidade · ${channel}`));
  $('open-settings').hidden = mode !== 'demo';
  $('side-channel').replaceChildren(document.createTextNode(mode === 'demo' ? 'Sua comunidade' : channel),
    node('small', '', mode === 'demo' ? 'Um jogo. Muitas histórias.' : 'Progresso real do canal'));
  $('channel-input').value = channel || state.defaultChannel || '';
  $('player-input').value = playerLogin;
  const connection = state.integration;
  $('integration-status').textContent = connection.connected ? 'Bot independente conectado ao chat.'
    : connection.mode === 'standalone' && connection.error ? connection.error
    : connection.lastEventAt ? `Último comando recebido: ${new Date(connection.lastEventAt).toLocaleTimeString('pt-BR')}.`
    : connection.configured ? 'Chave configurada. Aguardando o primeiro comando do bot.'
    : 'A demonstração está disponível. A integração aguarda configuração da chave do bot.';
  renderProfile(); renderTrial(); renderRegions(); renderRecent(); renderInventory(); renderEquipment(); renderCodex();
  renderRanking(); renderManual();
  renderReadiness();
}

async function copyCommand(text) {
  try { await navigator.clipboard.writeText(text); toast(`${text} copiado. Use no chat da Twitch.`); }
  catch { toast(`Use este comando no chat: ${text}`); }
}

function showResult(result) {
  const item = catalogue.items.find((entry) => entry.id === result.itemId);
  if (!item) { toast(result.reply); return; }
  const rarity = catalogue.rarities[item.rarity];
  $('result-dialog').style.setProperty('--item-color', rarity.color);
  $('result-art').replaceChildren(icon(item.icon));
  $('result-rarity').textContent = rarity.name;
  const drops = result.drops || [{ id: item.id, quantity: 1 }];
  const firstDrop = drops[0];
  $('result-eyebrow').textContent = 'UM NOVO ACHADO';
  $('result-title').textContent = `${firstDrop.quantity > 1 ? `${firstDrop.quantity}× ` : ''}${item.name}`;
  $('result-description').textContent = item.description;
  $('result-extra').replaceChildren(...drops.slice(1).map((drop) => {
    const extra = catalogue.items.find((entry) => entry.id === drop.id);
    const row = node('div', 'extra-drop');
    row.append(icon(extra.icon), node('span', '', `${drop.quantity}× ${extra.name}`),
      node('small', '', catalogue.rarities[extra.rarity].name));
    return row;
  }));
  $('result-extra').hidden = drops.length < 2;
  const value = drops.reduce((sum, drop) => sum + catalogue.items.find((entry) => entry.id === drop.id).value * drop.quantity, 0);
  $('result-details').replaceChildren(node('span', '', `+${result.xpGained} XP`), node('span', '', `${format(value)} Brasas de valor base`));
  $('result-dialog').showModal();
}

async function act(text, shouldShowResult = false) {
  if (busy) return;
  if (mode === 'live') { await copyCommand(command(text)); return; }
  busy = true; render();
  if (shouldShowResult) explorationScene?.begin();
  try {
    const result = await api('/api/demo/command', { text: command(text), messageId: crypto.randomUUID() });
    applyState(result.state);
    $('command-response').textContent = result.reply;
    if (!result.ok) { explorationScene?.cancel(); toast(result.reply); }
    else if (shouldShowResult && result.itemId) {
      if ($('settings-dialog').open) $('settings-dialog').close();
      await explorationScene?.reveal(result);
      showResult(result);
    } else toast(result.reply);
  } catch (error) { explorationScene?.cancel(); toast(error.message); $('command-response').textContent = error.message; }
  finally { busy = false; renderCooldown(); renderProfile(); renderTrial(); renderInventory(); renderEquipment(); renderRegions(); }
}

function openDialog(id) { if (!$(id).open) $(id).showModal(); }
document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => showView(button.dataset.view));
});
document.querySelectorAll('[data-close]').forEach((button) => {
  button.addEventListener('click', () => $(button.dataset.close).close());
});
document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
});
window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
['open-integration', 'open-integration-mobile', 'banner-connect'].forEach((id) => $(id).addEventListener('click', () => openDialog('integration-dialog')));
['open-channel', 'integration-live'].forEach((id) => $(id).addEventListener('click', () => {
  $('integration-dialog').close(); openDialog('channel-dialog');
}));
$('open-settings').addEventListener('click', () => openDialog('settings-dialog'));
$('chat-action').addEventListener('click', () => showView('manual'));
$('explore').addEventListener('click', () => {
  if (mode === 'live') { window.open(`https://www.twitch.tv/${encodeURIComponent(channel)}`, '_blank', 'noopener,noreferrer'); return; }
  act(`vasculhar ${selectedRegion}`, true);
});
$('sell-all').addEventListener('click', () => act('vender tudo'));
$('command-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = $('command-input').value.trim();
  act(text.startsWith(state.prefix) ? text.slice(state.prefix.length) : text, /(vasculhar|explorar)/.test(text));
});
$('load-scenario').addEventListener('click', async () => {
  if (mode !== 'demo' || busy) return;
  const button = $('load-scenario'); button.disabled = true;
  try {
    const result = await api('/api/demo/scenario', { tier: Number($('scenario-tier').value) });
    selectedRegion = result.player.region;
    applyState(result);
    $('settings-dialog').close(); showView('provas');
    toast('Cenário de demonstração carregado. Somente seu progresso de teste foi reiniciado.');
  } catch (error) { $('command-response').textContent = error.message; }
  finally { button.disabled = false; }
});
$('channel-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const search = new URLSearchParams({ canal: $('channel-input').value.trim().toLowerCase() });
  if ($('player-input').value.trim()) search.set('jogador', $('player-input').value.trim().toLowerCase());
  location.href = `/?${search}#${currentView}`;
});
$('back-demo').addEventListener('click', () => { location.href = `/#${currentView}`; });
$('codex-search').addEventListener('input', () => {
  searchTerm = $('codex-search').value.trim(); codexVisibleCount = 24; renderCodex();
});
$('category-filter').addEventListener('change', () => {
  categoryFilter = $('category-filter').value; codexVisibleCount = 24; renderCodex();
});
$('available-only').addEventListener('change', () => {
  availableOnly = $('available-only').checked; codexVisibleCount = 24; renderCodex();
});
$('codex-load-more').addEventListener('click', () => { codexVisibleCount += 24; renderCodex(); });

/** Personalização do visual: pré-visualização animada e seletores por peça. */
const LOOK_SIZES = { skin: PARTS.skins, outfit: PARTS.outfits.length, hair: PARTS.hairs.length,
  hairColor: PARTS.hairColors, hat: PARTS.hats.length };
let draft = null;

function renderLookEditor() {
  const seed = state?.player?.login || 'voce';
  $('look-preview').replaceChildren(person(seed, 'portrait', 4, '', draft));
  $('look-controls').replaceChildren(...Object.keys(LOOK_SIZES).map((key) => {
    const row = node('div', 'look-row');
    const back = node('button', 'secondary', '◀'); const next = node('button', 'secondary', '▶');
    back.type = next.type = 'button';
    back.setAttribute('aria-label', `${PART_LABELS[key]} anterior`); next.setAttribute('aria-label', `${PART_LABELS[key]} seguinte`);
    const shift = (step) => { draft[key] = (draft[key] + step + LOOK_SIZES[key]) % LOOK_SIZES[key]; renderLookEditor(); };
    back.addEventListener('click', () => shift(-1)); next.addEventListener('click', () => shift(1));
    const value = key === 'hat' && draft[key] === 0 ? 'Nenhum' : `${draft[key] + 1} / ${LOOK_SIZES[key]}`;
    row.append(node('span', '', PART_LABELS[key]), back, node('strong', '', value), next);
    return row;
  }));
}

function openLookEditor() {
  draft = normalizeAppearance(myLook, state?.player?.login || 'voce');
  renderLookEditor();
  openDialog('look-dialog');
}

$('open-look').addEventListener('click', openLookEditor);
document.querySelector('.explorer-avatar').addEventListener('click', openLookEditor);
$('look-random').addEventListener('click', () => {
  draft = Object.fromEntries(Object.keys(LOOK_SIZES).map((key) => [key, Math.floor(Math.random() * LOOK_SIZES[key])]));
  renderLookEditor();
});
$('look-save').addEventListener('click', () => {
  myLook = { ...draft };
  try { localStorage.setItem('limiar:visual', JSON.stringify(myLook)); } catch { /* sem armazenamento: vale só nesta sessão */ }
  $('look-dialog').close();
  render();
  toast('Visual salvo.');
});

/** Cena pixel do domínio escolhido, no cartão da aba Buscas. */
function renderHero(region) {
  explorationScene ||= new ExplorationScene(document.querySelector('.hero-art'), {
    lookFor, itemFor: id => catalogue.items.find(item => item.id === id),
    rarityFor: tier => catalogue.rarities[tier], iconFor: name => icon(name), itemArtFor: item => objectIcon(item)
  });
  explorationScene.sync(region, state.player, state.events, state.serverTime);
}
async function init() {
  if (await installPixelIcons()) { iconBase = '#pi-'; retargetIcons(); }
  for (const [selector, id] of [['.supply-bag', 'backpack-0'], ['.supply-box', 'caixa-reparo'], ['.supply-light', 'lanterna-trilha']]) {
    const current = document.querySelector(selector), image = itemImage(id, selector.slice(1));
    if (current && image) current.replaceWith(image);
  }
  try {
    const [data, snapshot] = await Promise.all([api('/api/catalogue'), api(stateUrl())]);
    catalogue = data;
    $('category-filter').replaceChildren(...[{ id: 'all', name: 'Todas as categorias' }, ...catalogue.categories].map((entry) => {
      const option = node('option', '', entry.name); option.value = entry.id; return option;
    }));
    $('scenario-tier').replaceChildren(...catalogue.equipment.map((entry) => {
      const option = node('option', '', `Etapa ${entry.tier + 1} · ${entry.name}`);
      option.value = entry.tier; return option;
    }));
    selectedRegion = snapshot.player?.region || 'bosque';
    applyState(snapshot);
    showView(location.hash.slice(1) || 'provas');
    setInterval(() => { renderCooldown(); renderTrialClock(); renderReadiness(); }, 250);
    const poll = async () => {
      const trialOpen = state?.trial && state.trial.phase !== 'ended';
      if (document.hidden || busy || pollInFlight || liveFailures > 6 || (mode === 'demo' && !trialOpen)) return;
      pollInFlight = true;
      try { applyState(await api(stateUrl())); liveFailures = 0; }
      catch (error) { liveFailures++; if (liveFailures === 1) toast('A atualização do canal falhou. Tentando novamente.'); }
      finally { pollInFlight = false; }
    };
    setInterval(poll, mode === 'live' ? 1500 : 1000);
  } catch (error) {
    toast(error.message);
    $('explore').disabled = true;
    $('hero-description').textContent = 'O acampamento não respondeu. Atualize a página para tentar novamente.';
  }
}
init();
