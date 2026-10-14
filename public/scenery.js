/**
 * @file Cenários em camadas (parallax) com os packs de floresta, mais fábricas abandonadas desenhadas em código.
 * Cada tema é uma pilha de camadas de trás para a frente.
 */
import { sprite } from './pixel.js';

/** [arquivo, proporção largura/altura, segundos por volta, filtro opcional] */
const THEMES = {
  floresta: { layers: [['tall-far', 0.7333333333333333, 240], ['tall-back', 0.6, 160], ['tall-middle', 0.8, 90]] },
  ambar: { layers: [['v1-back', 1.7, 200], ['v1-middle', 1.7, 130], ['v1-lights', 1.7, 300], ['v1-front', 1.7, 70]] },
  outono: { layers: [['v2-back', 1.7, 220], ['v2-middle', 1.7, 140], ['v2-front', 1.7, 80]] },
  fabrica: { layers: [['v2-back', 1.7, 260], ['v2-middle', 1.7, 180]], tint: 'sepia(.45) saturate(.9) brightness(1.05)' },
  hospital: { layers: [['tall-far', 0.7333333333333333, 260], ['tall-back', 0.6, 190]], tint: 'hue-rotate(150deg) saturate(.6) brightness(.85)' },
  farol: { layers: [['tall-far', 0.7333333333333333, 240], ['tall-back', 0.6, 170], ['tall-middle', 0.8, 100]], tint: 'hue-rotate(110deg) saturate(1.1) brightness(.7)' },
  limiar: { layers: [['v1-back', 1.7, 200], ['v1-middle', 1.7, 130], ['v1-lights', 1.7, 300]], tint: 'hue-rotate(250deg) saturate(1.2) brightness(.75)' },
};

/** Tema de cada domínio e de cada caçador (a fábrica é o território do Brutal). */
export const THEME_FOR = {
  bosque: 'floresta', oficina: 'fabrica', hospital: 'hospital', celeiro: 'outono', farol: 'farol', limiar: 'limiar',
  rastreador: 'floresta', brutal: 'fabrica', sombrio: 'outono', none: 'ambar',
};

/** Cria as camadas de fundo para um tema. `height` é a altura (px) do recipiente. */
export function sceneLayers(themeId, height) {
  const theme = THEMES[THEME_FOR[themeId] || themeId] || THEMES.floresta;
  const wrapper = document.createElement('div');
  wrapper.className = 'scene';
  wrapper.style.setProperty('--h', `${height}px`);
  const ground = themeId === 'bosque' || themeId === 'rastreador' || themeId === 'floresta'
    ? ['#303a29', '#19241e', '#667145'] : ['#382c2b', '#211b23', '#796343'];
  ['--ground-light', '--ground-dark', '--grass'].forEach((key, index) => wrapper.style.setProperty(key, ground[index]));
  if (theme.tint) wrapper.style.filter = theme.tint;
  theme.layers.forEach(([file, ratio, seconds], index) => {
    const layer = document.createElement('div');
    layer.className = 'scene-layer';
    layer.style.setProperty('--image', `url(/scenery/${file}.png)`);
    layer.style.setProperty('--ratio', ratio);
    layer.style.setProperty('--t', `${seconds}s`);
    layer.style.setProperty('--depth', (index + 1) / (theme.layers.length + 1));
    layer.style.zIndex = index;
    wrapper.append(layer);
  });
  const terrain = document.createElement('div');
  terrain.className = 'scene-ground';
  wrapper.append(terrain);
  return wrapper;
}

export { sprite };
