/** @file Ícones nítidos desenhados em grade, com a mesma linguagem dos cenários. */
const NS = 'http://www.w3.org/2000/svg';
const shapes = {
  toolbox: 'M5 2h6v3h3v9H2V5h3Zm1 1v2h4V3ZM3 6v3h4V8h2v1h4V6Zm0 4v3h10v-3H9v1H7v-1Z',
  bag: 'M6 1h4v2h2v2h1v9H3V5h1V3h2Zm1 1v1h2V2ZM5 4v2h6V4Zm0 5v4h6V9Zm1 1h4v2H6Z',
  flashlight: 'M4 1h8v2h1v4h-2v7H5V7H3V3h1Zm1 1v2h6V2ZM6 7v6h4V7Z',
  compass: 'M5 1h6v1h2v2h1v8h-1v2h-2v1H5v-1H3v-2H2V4h1V2h2Zm0 2H4v2H3v6h1v2h2v1h4v-1h2v-2h1V5h-1V3Zm5 1L6 7l-2 5 5-3Z',
  gem: 'M4 2h8l3 4-7 9L1 6Zm1 1L3 5h3l1-2Zm4 0 1 2h3l-2-2ZM3 7l4 5-1-5Zm5 0v5l2-5Z',
  crystal: 'M8 1h2l3 4-1 8-4 2-3-3V5Zm1 2L7 5v6l2 2 2-2V5ZM2 6h2v7l-3-2V8Zm12 0h1v7h-2Z',
  scanner: 'M4 1h8v14H4Zm1 1v7h6V2Zm1 2h4v3H6Zm0 7v2h2v-2Zm3 0v2h1v-2Z',
  key: 'M3 1h5l3 3v4L9 9l6 6h-3l-1-2H9v-2L7 9H3L1 7V3Zm1 2L3 4v2l1 1h2l2-2-2-2Z',
  tree: 'M7 1h2v2h2v2h2v2h-2l3 4H9v4H7v-4H2l3-4H3V5h2V3h2Z',
  beacon: 'M7 1h2v1h2v2h1v5H9v4h3v2H4v-2h3V9H4V4h1V2h2ZM5 5v3h6V5ZM1 5h2v1H1Zm12 0h2v1h-2Z',
  candle: 'M8 1h1v2h1v2H9v1H7V5H6V3h1V2h1ZM5 7h6v6h2v2H3v-2h2Zm1 1v5h2V8Z',
  heart: 'M2 3h4l2 2 2-2h4l1 2v4l-7 6-7-6V5Zm1 1v3h1V5h2V4Z',
  eye: 'M5 3h6v1h2v1h1v1h1v3h-1v1h-1v1h-2v1H5v-1H3v-1H2V9H1V6h1V5h1V4h2Zm1 2L3 7v2l3 1h4l3-2V7l-3-2Zm1 1h2v1h1v2H8v1H6V7h1Z',
  star: 'M7 1h2l1 4h5v2l-4 3 2 5-5-3-5 3 2-5-4-3V5h5Z',
  lock: 'M5 1h6v1h1v5h2v8H2V7h2V2h1Zm1 2v4h4V3ZM7 9v4h2V9Z',
  book: 'M1 2h5l2 1 2-1h5v11h-5l-2 2-2-2H1Zm1 1v9h4l1 1V4L5 3Zm7 1v9l1-1h4V3h-3Z',
  coin: 'M5 1h6v1h2v2h1v8h-1v2h-2v1H5v-1H3v-2H2V4h1V2h2Zm1 2H5v1H4v8h1v1h1ZM8 4l-3 4 3 4 3-4Z',
  arrow: 'M9 2h2v2h2v2h2v3h-2v2h-2v2H9v-2h2V9H1V6h10V4H9Z',
  chat: 'M1 1h14v11H8l-4 3v-3H1Zm1 1v9h3v2l3-2h6V2ZM4 4h8v1H4Zm0 3h6v1H4Z',
  user: 'M6 1h4l2 2v4l-2 2h3v2h1v4H2v-4h1V9h3L4 7V3Zm0 2v4h4V3ZM4 11v3h8v-3Z',
  house: 'M7 1h2l6 5v2h-2v7H3V8H1V6Zm1 2L3 7h1v7h3V9h3v5h2V7h1Z',
  exit: 'M1 1h8v4H7V3H3v10h4v-2h2v4H1Zm10 3h2v2h2v3h-2v2h-2V9H6V6h5Z',
  close: 'M3 2l5 5 5-5 1 1-5 5 5 5-1 1-5-5-5 5-1-1 5-5-5-5Z',
  check: 'M13 2h2v2L6 14 1 9V7h2l3 3Z',
  chain: 'M9 1h4l2 2v4l-4 4H8V8l4-3-1-1-4 4H4V5Zm-5 4h3v3l-4 3 1 1 4-4h3v3l-4 4H3l-2-2V9Z',
  bottle: 'M6 1h4v3l3 3v8H3V7l3-3Zm1 1v3L4 8v1h8V8L9 5V2ZM4 10v4h8v-4Z',
  trophy: 'M4 1h8v2h3v6l-4 2-2 1v1h3v2H4v-2h3v-1l-2-1-4-2V3h3Zm1 1v6l2 2h2l2-2V2ZM2 4v4l2 1V4Zm10 0v5l2-1V4Z',
  map: 'M1 2 6 1l4 2 5-1v12l-5 1-4-2-5 1Zm1 1v10l3-1V2Zm4-1v10l3 2V4Zm4 2v10l4-1V3Z',
  parts: 'M6 1h4v3h3v2h2v4h-3v3h-2v2H6v-3H3v-2H1V6h3V3h2Zm0 5v4h4V6Z',
};
Object.assign(shapes, { relic: shapes.gem, rune: shapes.crystal, rope: shapes.chain, ore: shapes.crystal, ingot: shapes.toolbox, pickaxe: shapes.toolbox, drill: shapes.scanner });
export async function installPixelIcons() {
  if (document.getElementById('pixel-symbols')) return true;
  const holder = document.createElementNS(NS, 'svg');
  holder.id = 'pixel-symbols'; holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  for (const [name, path] of Object.entries(shapes)) {
    const symbol = document.createElementNS(NS, 'symbol');
    symbol.id = `pi-${name}`; symbol.setAttribute('viewBox', '0 0 16 16');
    symbol.setAttribute('shape-rendering', 'crispEdges');
    const shape = document.createElementNS(NS, 'path');
    shape.setAttribute('d', path); shape.setAttribute('fill-rule', 'evenodd');
    shape.style.cssText = 'fill:currentColor;stroke:none';
    symbol.append(shape); holder.append(symbol);
  }
  document.body.prepend(holder); document.documentElement.classList.add('pixel-icons');
  return true;
}
export function retargetIcons(root = document) {
  root.querySelectorAll('use[href^="/icons.svg#"]').forEach((use) => {
    use.setAttribute('href', use.getAttribute('href').replace('/icons.svg#', '#pi-'));
  });
}
