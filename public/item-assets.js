/** Arte compartilhada entre a loja, a bolsa, o códice e os achados da cena. */
const assignments = {
  'lamp-trail': ['lanterna-gasta', 'lanterna-trilha'],
  'lamp-field': ['lanterna-campo', 'lanterna-oficina'],
  'lamp-prism': ['lanterna-vitral', 'lanterna-prismatica'],
  'lamp-aurora': ['lanterna-aurora'],
  toolbox: ['caixa-reparo', 'estojo-ferramentas', 'kit-campo', 'caixa-ferramentas',
    'caixa-reforcada', 'caixa-precisao', 'caixa-mecanico', 'caixa-ferro-negro', 'caixa-antigos'],
  medkit: ['kit-curativo'], rope: ['corda'], map: ['mapa-rasgado'], flask: ['cantimplora'],
  gear: ['pecas'], 'bronze-key': ['chave-bronze'], clock: ['relogio-bolso', 'relogio-quebrado', 'relogio-parado'],
  battery: ['bateria'], coin: ['moeda-gasta'], feather: ['pena-corvo'], branch: ['flor-seca'],
  candle: ['vela-sebo', 'vela-perfumada', 'vela-vigia'], fabric: ['pano-manchado', 'lencol-bordado', 'veu-palido'],
  ribbon: ['fita-seda'], 'ribbon-worn': ['fita-desbotada'], 'mirror-shard': ['caco-espelho'],
  lily: ['lirio-murcho'], tooth: ['dente-lobo'], earrings: ['brinco-latao'], letter: ['carta-amassada'],
  pendant: ['relicario-vazio', 'medalhao-sem-foto'], 'silver-ring': ['anel-prata'], mirror: ['espelho-mao'],
  diary: ['diario-rasgado'], gloves: ['luva-renda'], orchid: ['orquidea-palida'],
  chalice: ['calice-trincado'], rose: ['rosa-nevoa'], 'gold-ring': ['anel-ouro-velho'], cape: ['estola-veludo'],
  crown: ['coroa-espinhos'], 'star-map': ['mapa-estrelas'], bell: ['sino-rachado', 'sino-vigia'],
  mask: ['mascara-marfim'], 'music-box': ['caixa-musica'], 'watcher-mirror': ['espelho-vigilia'],
  eye: ['olho-nevoa'], 'ancient-key': ['chave-primeira-porta', 'chave-limiar'],
  'beacon-shard': ['estilhaco-farol'], scanner: ['sonda-ecos'], magnifier: ['lupa-rastros'],
  bag: ['bolsa-lona', 'backpack-0', 'backpack-1', 'backpack-2', 'backpack-3', 'backpack-4', 'backpack-5'],
};

export const ITEM_ASSETS = Object.freeze(Object.fromEntries(Object.entries(assignments)
  .flatMap(([file, ids]) => ids.map(id => [id, `/art/items/${file}.png`]))));

/** Imagem decorativa; o nome e a raridade continuam descritos no cartão do item. */
export function itemImage(id, className = '') {
  const path = ITEM_ASSETS[id];
  if (!path) return null;
  const image = document.createElement('img');
  image.className = `item-sprite ${className}`.trim();
  image.src = path; image.alt = ''; image.width = 64; image.height = 64;
  image.decoding = 'async';
  return image;
}
