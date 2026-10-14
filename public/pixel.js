/**
 * @file Sprites em pixel art desenhados em texto (16×16) e convertidos em SVG nítido.
 * Tudo original: cada letra é uma cor da paleta; "." é transparente.
 */
const PALETTE = {
  k: '#0b0809', d: '#2b2023', g: '#8e827b', w: '#e8dccb', W: '#ffffff',
  r: '#b3121f', R: '#f05a5a', y: '#f2b544', Y: '#ffe08a', o: '#e0963c',
  b: '#3b6ea5', B: '#6fa3d8', n: '#6b4b3a', N: '#8a6a4a', s: '#e0b090',
  p: '#5a3a6a', P: '#8c6aa8', e: '#2f5d3a', E: '#4f8a4f', c: '#9aa3ad',
};

const SPRITES = {
  survivor: [
    '................',
    '.....kkkkk......',
    '....knnnnnk.....',
    '....knnnnnk.....',
    '....kssssk......',
    '....kskskk......',
    '....kssssk......',
    '.....kkkk.......',
    '....kbbbbbk.....',
    '...kbbBbbbbk....',
    '...ksbbbbbsk....',
    '...ksbbbbbsk....',
    '....kbbbbbk.....',
    '....kddkddk.....',
    '....kddkddk.....',
    '....kkk.kkk.....',
  ],
  caught: [
    '................',
    '..c..kkkkk..c...',
    '..c.knnnnnk.c...',
    '..c.knnnnnk.c...',
    '..cckssssk.cc...',
    '...ckskskkc.....',
    '..c.kssssk.c....',
    '..c..kkkk..c....',
    '..ckrrrrrrkc....',
    '..ckrrRrrrkc....',
    '..ccsrrrrrsc....',
    '...ksrrrrrsk....',
    '....krrrrrk.....',
    '....kddkddk.....',
    '..cckddkddkcc...',
    '..c.kkk.kkk.c...',
  ],
  dead: [
    '................',
    '................',
    '.....kkkkk......',
    '....kWWWWWk.....',
    '...kWWWWWWWk....',
    '...kWkWWWkWk....',
    '...kWkWWWkWk....',
    '...kWWWkWWWk....',
    '....kWWWWWk.....',
    '....kWkWkWk.....',
    '.....kkkkk......',
    '................',
    '..kk..kk..kk....',
    '.kddkkddkkddk...',
    '.kkkkkkkkkkkk...',
    '................',
  ],
  escaped: [
    '..y..........y..',
    '.yYy...kkkk.yYy.',
    '..y...knnnnk.y..',
    '..s...knnnnk.s..',
    '..sk..kssssk.ks.',
    '..sk..kskskk.ks.',
    '...sk.kssssk.s..',
    '...sk..kkkk.ks..',
    '....kkbbbbbkk...',
    '.....kbbBbbbk...',
    '.....kbbbbbbk...',
    '.....kbbbbbbk...',
    '.....kbbbbbk....',
    '.....kddkddk....',
    '.....kddkddk....',
    '.....kkk.kkk....',
  ],
  hunter: [
    '.....kkkkkk.....',
    '....kddddddk....',
    '...kddddddddk...',
    '...kdwwwwwwdk...',
    '...kdwRwwRwdk...',
    '...kdwwwwwwdk...',
    '...kddwkkwddk...',
    '....kdddddk.....',
    '...kdddddddk....',
    '..kdddpdpdddk...',
    '.kwddddddddwk...',
    '.kwdddpddddwk...',
    '.kwddddddddwk...',
    '..kdddddddddk...',
    '..kddkkddkkdk...',
    '...kk..kk..kk...',
  ],
  farolOff: [
    '................',
    '......kkkk......',
    '.....kggggk.....',
    '....kkkkkkkk....',
    '....kdddddck....',
    '....kdddddck....',
    '....kdddddck....',
    '....kdddddck....',
    '....kkkkkkkk....',
    '.....kggggk.....',
    '......kggk......',
    '......kggk......',
    '.....kkkkkk.....',
    '....kddddddk....',
    '................',
    '................',
  ],
  farolOn: [
    '......y..y......',
    '......kkkk......',
    '.....kggggk.....',
    '....kkkkkkkk....',
    '....kYYYYYYk....',
    '....kYyoyyYk....',
    '....kYyoyyYk....',
    '....kYYYYYYk....',
    '....kkkkkkkk....',
    '.....kggggk.....',
    '......kggk......',
    '......kggk......',
    '.....kkkkkk.....',
    '....kddddddk....',
    '................',
    '................',
  ],
  tree: [
    '......kkkk......',
    '....kkEEEEkk....',
    '...kEEeEEEEEk...',
    '..kEEEEEeEEEEk..',
    '..kEeEEEEEEeEk..',
    '...kEEEEeEEEk...',
    '....kkEEEEkk....',
    '......kkNk......',
    '......kNNk......',
    '......kNNk......',
    '......kNNk......',
    '.....kNNNNk.....',
    '................',
    '................',
    '................',
    '................',
  ],
  gate: [
    '................',
    '..kkkkkkkkkkkk..',
    '..kppppppppppk..',
    '..kpPPPPPPPPpk..',
    '..kpPyyyyyyPpk..',
    '..kpPyYYYYyPpk..',
    '..kpPyYYYYyPpk..',
    '..kpPyYYYYyPpk..',
    '..kpPyYYYYyPpk..',
    '..kpPyYYYYyPpk..',
    '..kpPyYYYYyPpk..',
    '..kpPyYYYYyPpk..',
    '..kpPyYYYYyPpk..',
    '..kkkkkkkkkkkk..',
    '................',
    '................',
  ],
};

const cache = new Map();

/** Converte o mapa em retângulos (uma faixa por sequência de pixels iguais). */
function rects(name) {
  if (cache.has(name)) return cache.get(name);
  const out = [];
  SPRITES[name].forEach((line, y) => {
    const row = line.padEnd(16, '.');
    for (let x = 0; x < 16;) {
      const ch = row[x];
      let end = x + 1;
      while (end < 16 && row[end] === ch) end++;
      if (ch !== '.' && PALETTE[ch]) out.push([x, y, end - x, PALETTE[ch]]);
      x = end;
    }
  });
  cache.set(name, out);
  return out;
}

/** @returns {SVGSVGElement} sprite em pixel art, sem suavização. */
export function sprite(name, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('class', `px ${className}`.trim());
  for (const [x, y, width, fill] of rects(name)) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x); rect.setAttribute('y', y);
    rect.setAttribute('width', width); rect.setAttribute('height', 1);
    rect.style.fill = fill; rect.style.stroke = 'none';
    svg.append(rect);
  }
  return svg;
}

export const spriteForState = { ok: 'survivor', hurt: 'survivor', caught: 'caught', dead: 'dead', escaped: 'escaped' };

/** Personagem animado a partir das folhas "Mana Seed" (peças em camadas: corpo, roupa, cabelo e chapéu). */
const ANIMATIONS = {
  idle: { row: 4, col: 0, frames: 1, ms: 1000 },
  walk: { row: 6, col: 0, frames: 6, ms: 700 },
  run: { row: 6, col: 0, frames: 6, ms: 430 },
  attack: { row: 6, col: 0, frames: 1, ms: 700 },
  repair: { row: 0, col: 5, frames: 1, ms: 1000 },
  heal: { row: 0, col: 1, frames: 2, ms: 750 },
  hide: { row: 0, col: 5, frames: 1, ms: 1000 },
  ok: { row: 6, col: 0, frames: 6, ms: 900 },
  hurt: { row: 6, col: 0, frames: 6, ms: 1700 },
  limp: { row: 6, col: 0, frames: 6, ms: 1050 },
  seated: { row: 0, col: 1, frames: 1, ms: 1000 },
  sleep: { row: 6, col: 0, frames: 1, ms: 1000 },
  downed: { row: 6, col: 0, frames: 1, ms: 1000 },
  carried: { row: 2, col: 5, frames: 1, ms: 1000 },
  search: { row: 0, col: 1, frames: 2, ms: 900 },
  dig: { row: 2, col: 0, frames: 2, ms: 700 },
  reach: { row: 2, col: 0, frames: 2, ms: 900 },
  celebrate: { row: 0, col: 0, frames: 1, ms: 1000 },
  caught: { row: 2, col: 1, frames: 2, ms: 1200 },
  dead: { row: 4, col: 0, frames: 1, ms: 1000 },
  escaped: { row: 6, col: 0, frames: 6, ms: 450 },
  portrait: { row: 4, col: 0, frames: 1, ms: 1000 },
};

/** Peças disponíveis. Cada índice vira um arquivo em /sprites/layers. */
export const PARTS = {
  skins: 8,
  outfits: ['fstr_v01', 'fstr_v02', 'fstr_v03', 'fstr_v04', 'fstr_v05', 'pfpn_v01', 'pfpn_v02', 'pfpn_v03', 'pfpn_v04', 'pfpn_v05'],
  hairs: ['bob1', 'dap1'],
  hairColors: 14,
  hats: ['', 'pfht_v01', 'pfht_v02', 'pfht_v03', 'pfht_v04', 'pfht_v05', 'pnty_v01', 'pnty_v02', 'pnty_v03', 'pnty_v04', 'pnty_v05'],
};
export const PART_LABELS = { skin: 'Pele', outfit: 'Roupa', hair: 'Cabelo', hairColor: 'Cor do cabelo', hat: 'Chapéu' };

function hash(text) {
  let value = 0;
  for (const ch of String(text || '')) value = (value * 31 + ch.charCodeAt(0)) >>> 0;
  return value;
}

/** Aparência sorteada de forma estável a partir de um texto (por exemplo, o login). */
export function appearanceFor(seed) {
  const h = hash(seed);
  return { skin: h % PARTS.skins, outfit: (h >>> 3) % PARTS.outfits.length, hair: (h >>> 5) % PARTS.hairs.length,
    hairColor: (h >>> 7) % PARTS.hairColors, hat: 0 };
}

export function normalizeAppearance(value, seed) {
  const base = appearanceFor(seed);
  const pick = (key, size) => (Number.isInteger(value?.[key]) && value[key] >= 0 && value[key] < size ? value[key] : base[key]);
  return { skin: pick('skin', PARTS.skins), outfit: pick('outfit', PARTS.outfits.length), hair: pick('hair', PARTS.hairs.length),
    hairColor: pick('hairColor', PARTS.hairColors), hat: pick('hat', PARTS.hats.length) };
}

function layerUrls(appearance) {
  const pad = (n) => String(n).padStart(2, '0');
  const urls = [`skin-v${pad(appearance.skin)}`, `outfit-${PARTS.outfits[appearance.outfit]}`,
    `hair-${PARTS.hairs[appearance.hair]}_v${pad(appearance.hairColor)}`];
  if (PARTS.hats[appearance.hat]) urls.push(`hat-${PARTS.hats[appearance.hat]}`);
  return urls.map((name) => `url(/sprites/layers/${name}.png)`);
}

/** @returns {HTMLElement} personagem 64×64 (ampliado por `scale`) animado só com CSS. */
export function person(seed, state = 'ok', scale = 2, className = '', appearance = null) {
  const animation = ANIMATIONS[state] || ANIMATIONS.ok;
  const element = document.createElement('div');
  element.className = `person ${state} ${className}`.trim();
  element.setAttribute('aria-hidden', 'true');
  element.style.setProperty('--scale', scale);
  element.style.setProperty('--row', animation.row);
  element.style.setProperty('--col0', animation.col);
  element.style.setProperty('--frames', animation.frames);
  element.style.setProperty('--ms', `${animation.ms}ms`);
  for (const url of layerUrls(normalizeAppearance(appearance, seed))) {
    const layer = document.createElement('div');
    layer.className = 'person-layer';
    layer.style.setProperty('--layer', url);
    element.append(layer);
  }
  return element;
}

/** Troca a pose sem remover as camadas ou reiniciar a caminhada a cada consulta do canal. */
export function setPersonPose(element, pose, facing = 'front') {
  if (element.dataset.pose === pose && element.dataset.facing === facing) return;
  const animation = { ...(ANIMATIONS[pose] || ANIMATIONS.idle) };
  if (['walk', 'run', 'limp', 'idle', 'attack'].includes(pose)) animation.row = facing === 'back' ? 5 : facing === 'front' ? 4 : 6;
  element.dataset.pose = pose;
  element.dataset.facing = facing;
  element.style.setProperty('--row', animation.row);
  element.style.setProperty('--col0', animation.col);
  element.style.setProperty('--frames', animation.frames);
  element.style.setProperty('--ms', `${animation.ms}ms`);
  clocks.set(element, { elapsed: 0, ...animation });
  element.style.setProperty('--frame', 0);
  const grip = facing === 'front' ? [37, 31] : facing === 'back' ? [38, 34] : [36, 32];
  element.style.setProperty('--grip-x', grip[0]); element.style.setProperty('--grip-y', grip[1]);
}

const clocks = new WeakMap();
/** Um único quadro por personagem, aplicado a todas as peças; pausa junto com a cena. */
export function advancePersonFrame(element, delta) {
  element.classList.add('scene-clocked');
  const clock = clocks.get(element);
  if (!clock) return 0;
  clock.elapsed += delta * 1000;
  const frame = Math.floor(clock.elapsed / (clock.ms / clock.frames)) % clock.frames;
  element.style.setProperty('--frame', frame);
  return frame;
}

export function addWoundLayers(figure) {
  for (let level = 1; level <= 3; level++) {
    const layer = document.createElement('div');
    layer.className = `person-layer wound-layer wound-${level}`;
    layer.style.setProperty('--layer', `url(/sprites/layers/wounds-${level}.svg)`);
    figure.append(layer);
  }
  return figure;
}

/** O Pálido usa o mesmo esqueleto, passos e roupas dos sobreviventes, com máscara e manto próprios. */
export function paleHunter() {
  const hunter = person('palido', 'idle', 3, 'palido-person', { skin: 0, outfit: 1, hair: 0, hairColor: 0, hat: 4 });
  hunter.replaceChildren();
  for (const name of ['body', 'cleaver']) {
    const layer = document.createElement('div');
    layer.className = `person-layer palido-${name}-layer`;
    layer.style.setProperty('--layer', `url(/sprites/layers/palido-${name}.svg)`);
    hunter.append(layer);
  }
  const drops = document.createElement('span'); drops.className = 'palido-blood-drip'; hunter.append(drops);
  return hunter;
}
