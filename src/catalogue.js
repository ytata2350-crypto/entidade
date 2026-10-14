/**
 * @file Catálogo original da Entidade: raridades, ferramentas, domínios, achados e talentos.
 * O jogo é inspirado na tensão de uma partida de sobrevivência em grupo, mas nomes e personagens são próprios:
 * nada aqui reproduz personagens, habilidades, mapas ou textos de outro jogo.
 * A ferramenta equipada e o domínio limitam o sorteio antes de qualquer cálculo de sorte.
 */
export const RARITIES = [
  { id: 'common', name: 'Comum', color: '#a7b9ad', xp: 14 },
  { id: 'uncommon', name: 'Incomum', color: '#90c9a1', xp: 22 },
  { id: 'rare', name: 'Raro', color: '#78b7d6', xp: 36 },
  { id: 'epic', name: 'Épico', color: '#b49cd9', xp: 58 },
  { id: 'legendary', name: 'Lendário', color: '#dfbc77', xp: 90 },
  { id: 'relic', name: 'Relíquia', color: '#df9491', xp: 150 },
];

export const EQUIPMENT = [
  { id: 'bolsa-lona', name: 'Bolsa de lona', tier: 0, resourceTier: 0, level: 1, price: 0,
    cooldown: 1, luck: 0, xpMultiplier: 1, repair: 0, icon: 'bag', category: 'exploration',
    description: 'O essencial para recolher suprimentos e atravessar a primeira névoa.' },
  { id: 'kit-campo', name: 'Kit de campo', tier: 1, resourceTier: 1, level: 2, price: 180,
    cooldown: 0.9, luck: 0.03, xpMultiplier: 1, repair: 0.03, icon: 'toolbox', category: 'toolboxes',
    description: 'Ferramentas básicas. Abre a oficina e os primeiros achados incomuns.' },
  { id: 'caixa-ferramentas', name: 'Caixa de ferramentas', tier: 2, resourceTier: 2, level: 4, price: 650,
    cooldown: 0.8, luck: 0.05, xpMultiplier: 1.05, repair: 0.06, icon: 'toolbox', category: 'toolboxes',
    description: 'Peças para consertar de verdade. Libera achados raros e acelera os reparos.' },
  { id: 'caixa-reforcada', name: 'Caixa reforçada', tier: 3, resourceTier: 2, level: 5, price: 1200,
    cooldown: 0.75, luck: 0.10, xpMultiplier: 1.05, repair: 0.09, icon: 'toolbox', category: 'toolboxes',
    description: 'Cantos de ferro e encaixes melhores: mais sorte e reparos mais firmes.' },
  { id: 'sonda-ecos', name: 'Sonda de ecos', tier: 4, resourceTier: 3, level: 7, price: 2000,
    cooldown: 0.7, luck: 0.15, xpMultiplier: 1.10, repair: 0.09, icon: 'scanner', category: 'exploration',
    description: 'Escuta o que a névoa esconde: achados épicos passam a aparecer.' },
  { id: 'caixa-precisao', name: 'Caixa de precisão', tier: 5, resourceTier: 3, level: 9, price: 4200,
    cooldown: 0.62, luck: 0.20, xpMultiplier: 1.10, repair: 0.13, icon: 'toolbox', category: 'toolboxes',
    description: 'Cada ferramenta no lugar certo. Explorações mais rápidas e reparos melhores.' },
  { id: 'lupa-rastros', name: 'Lupa de rastros', tier: 6, resourceTier: 4, level: 11, price: 6000,
    cooldown: 0.6, luck: 0.25, xpMultiplier: 1.15, repair: 0.13, icon: 'scanner', category: 'exploration',
    description: 'Revela marcas quase apagadas. Os primeiros achados lendários ficam ao alcance.' },
  { id: 'caixa-mecanico', name: 'Caixa do mecânico', tier: 7, resourceTier: 4, level: 13, price: 9500,
    cooldown: 0.55, luck: 0.30, xpMultiplier: 1.15, repair: 0.17, icon: 'toolbox', category: 'toolboxes',
    description: 'O kit de quem já consertou de tudo. Muita sorte e reparos velozes.' },
  { id: 'bussola-nevoa', name: 'Bússola da névoa', tier: 8, resourceTier: 5, level: 16, price: 16000,
    cooldown: 0.45, luck: 0.35, xpMultiplier: 1.20, repair: 0.17, icon: 'compass', category: 'exploration',
    description: 'Aponta para passagens além do mapa e para as primeiras relíquias.' },
  { id: 'caixa-ferro-negro', name: 'Caixa de ferro negro', tier: 9, resourceTier: 5, level: 19, price: 28000,
    cooldown: 0.4, luck: 0.45, xpMultiplier: 1.20, repair: 0.21, icon: 'toolbox', category: 'toolboxes',
    description: 'Forjada com sobras do que a névoa levou. Pesada, confiável, rápida.' },
  { id: 'caixa-antigos', name: 'Caixa dos antigos', tier: 10, resourceTier: 5, level: 23, price: 48000,
    cooldown: 0.35, luck: 0.60, xpMultiplier: 1.25, repair: 0.25, icon: 'toolbox', category: 'toolboxes',
    description: 'Ferramentas de quem chegou aqui antes de todos. Reparos como poucos viram.' },
  { id: 'chave-limiar', name: 'Chave do limiar', tier: 11, resourceTier: 5, level: 28, price: 80000,
    cooldown: 0.3, luck: 0.80, xpMultiplier: 1.30, repair: 0.30, icon: 'key', category: 'exploration',
    description: 'A última ferramenta. Abre qualquer porta, até a que não deveria existir.' },
];

/** @param {number} tier @returns {object} Primeiro equipamento que libera um grau de achados. */
export function equipmentForTier(tier) {
  return EQUIPMENT.find((entry) => entry.resourceTier >= tier);
}

/** @param {object} item @returns {object} Ferramenta mínima do achado. */
export function equipmentForItem(item) {
  return item.minEquipmentId ? EQUIPMENT.find((entry) => entry.id === item.minEquipmentId) : equipmentForTier(item.tier);
}

export const BACKPACKS = [
  { name: 'Bolsa de lona', capacity: 30, price: 0 },
  { name: 'Bolsa de couro', capacity: 60, price: 250 },
  { name: 'Bolsa impermeável', capacity: 100, price: 900 },
  { name: 'Bolsa de campanha', capacity: 160, price: 2600 },
  { name: 'Bolsa tática', capacity: 240, price: 7500 },
  { name: 'Bolsa da névoa', capacity: 360, price: 18000 },
];

export const LIGHTS = [
  { id: 'sem-lanterna', name: 'Sem lanterna equipada', level: 0, price: 0, requiredLevel: 1, luck: 0, xpMultiplier: 1 },
  { id: 'lanterna-trilha', name: 'Lanterna de trilha', level: 1, price: 120, requiredLevel: 2, luck: 0.02, xpMultiplier: 1,
    description: 'Ilumina vestígios difíceis de ver. Acrescenta sorte às buscas.' },
  { id: 'lanterna-oficina', name: 'Lanterna de oficina', level: 2, price: 900, requiredLevel: 5, luck: 0.05, xpMultiplier: 1.05,
    description: 'Luz firme em corredores escuros. Mais sorte e experiência em cada busca.' },
  { id: 'lanterna-prismatica', name: 'Lanterna prismática', level: 3, price: 3200, requiredLevel: 12, luck: 0.10, xpMultiplier: 1.10,
    description: 'Revela cores ocultas. Favorece os achados mais raros já liberados.' },
  { id: 'lanterna-aurora', name: 'Lanterna da aurora', level: 4, price: 9000, requiredLevel: 20, luck: 0.15, xpMultiplier: 1.15,
    description: 'Uma luz que acompanha os sobreviventes mais experientes, com os maiores bônus da categoria.' },
];

/**
 * Talentos: habilidades permanentes aprendidas com Brasas. O número de espaços cresce com o nível
 * (1, 2, 3 e 4 espaços nos níveis 1, 6, 12 e 20) e cada talento muda uma regra da prova ou da busca.
 * `effects` usa chaves fixas lidas por game.js e trial.js.
 */
export const TALENTS = [
  { id: 'mao-firme', name: 'Mão firme', price: 300, requiredLevel: 2, icon: 'toolbox',
    effects: { repair: 0.15 }, description: 'Seus reparos rendem 15% a mais.' },
  { id: 'passos-leves', name: 'Passos leves', price: 400, requiredLevel: 3, icon: 'arrow',
    effects: { evade: 0.10 }, description: 'O Pálido acerta você com 10 pontos percentuais a menos.' },
  { id: 'coragem', name: 'Coragem', price: 500, requiredLevel: 4, icon: 'user',
    effects: { fearlessRescue: true }, description: 'Libertar alguém não deixa você marcado.' },
  { id: 'maos-gentis', name: 'Mãos gentis', price: 600, requiredLevel: 5, icon: 'heart',
    effects: { healCooldown: 0.5 }, description: 'Suas curas esperam metade do tempo.' },
  { id: 'olhar-atento', name: 'Olhar atento', price: 900, requiredLevel: 8, icon: 'eye',
    effects: { hide: 0.15 }, description: 'Esconder-se reduz 15 pontos percentuais a mais da chance de ser atacado.' },
  { id: 'persistencia', name: 'Persistência', price: 1400, requiredLevel: 10, icon: 'chain',
    effects: { shackle: 0.4 }, description: 'Seu tempo preso aos grilhões dura 40% a mais.' },
  { id: 'segundo-folego', name: 'Segundo fôlego', price: 2200, requiredLevel: 14, icon: 'heart',
    effects: { secondWind: true }, description: 'Uma vez por prova, o golpe que prenderia você apenas o deixa ferido.' },
  { id: 'faro-achados', name: 'Faro de achados', price: 1800, requiredLevel: 12, icon: 'gem',
    effects: { luck: 0.12 }, description: 'Suas buscas ganham 12% de sorte, além da ferramenta e da lanterna.' },
];

/** @param {number} level @returns {number} Espaços de talento liberados pelo nível. */
export function talentSlots(level) {
  return level >= 20 ? 4 : level >= 12 ? 3 : level >= 6 ? 2 : 1;
}

export const SHOP_CATEGORIES = [
  { id: 'toolboxes', name: 'Caixas de ferramentas', icon: 'toolbox', description: 'Reparam mais rápido, abrem novos achados e encurtam a espera das buscas.' },
  { id: 'exploration', name: 'Exploração', icon: 'compass', description: 'Bolsa, sonda, lupa, bússola e a chave que completam a progressão.' },
  { id: 'backpacks', name: 'Bolsas', icon: 'bag', description: 'Mais espaço para carregar seus achados. Cada compra amplia a bolsa atual.' },
  { id: 'lights', name: 'Lanternas', icon: 'flashlight', description: 'Uma melhoria independente: mais sorte e XP para os achados já liberados.' },
  { id: 'talents', name: 'Talentos', icon: 'star', description: 'Habilidades permanentes. Aprenda com Brasas e equipe nos espaços do seu nível.' },
];

export const REGIONS = [
  { id: 'bosque', name: 'Bosque esquecido', subtitle: 'Toda prova começa entre as árvores.', tier: 0,
    coordinates: [19, 70], icon: 'tree', description: 'Trilhas cobertas de musgo, acampamentos vazios e suprimentos esquecidos.' },
  { id: 'oficina', name: 'Oficina abandonada', subtitle: 'Há valor entre os destroços.', tier: 1,
    coordinates: [38, 49], icon: 'toolbox', description: 'Bancadas antigas guardam ferramentas, peças e oferendas deixadas por quem passou aqui.' },
  { id: 'hospital', name: 'Hospital em ruínas', subtitle: 'Os corredores ainda têm eco.', tier: 2,
    coordinates: [53, 69], icon: 'heart', description: 'Macas vazias e armários trancados. Quem sabe procurar encontra mais que curativos.' },
  { id: 'celeiro', name: 'Celeiro do corvo', subtitle: 'Algo se move no feno.', tier: 3,
    coordinates: [65, 36], icon: 'house', description: 'Vigas escuras e corvos silenciosos guardam relíquias que a sonda consegue ouvir.' },
  { id: 'farol', name: 'Farol sem luz', subtitle: 'Uma luz que ninguém acendeu.', tier: 4,
    coordinates: [82, 53], icon: 'beacon', description: 'No alto do farol, vestígios lendários só respondem a quem lê os rastros com precisão.' },
  { id: 'limiar', name: 'Além do limiar', subtitle: 'Onde os mapas terminam.', tier: 5,
    coordinates: [83, 18], icon: 'compass', description: 'A bússola da névoa aponta para vestígios que não pertencem a este lugar.' },
];

const item = (id, name, rarity, tier, value, weight, icon, regions, description, category = 'offering') =>
  ({ id, name, rarity, tier, value, weight, icon, regions, description, category });

const supply = (id, name, rarity, tier, value, weight, icon, regions, description) =>
  item(id, name, rarity, tier, value, weight, icon, regions, description, 'supplies');

/** Cria vários itens de uma raridade a partir de [id, nome, descrição]. */
const group = (base, entries) => entries.map(([id, name, description, icon], index) =>
  item(id, name, base.rarity, base.tier, Math.round(base.value * (1 + (index % 4) * 0.08)), base.weight,
    icon || base.icon, base.regions, description || base.description, base.category));

export const ITEMS = [
  // Suprimentos: úteis nas provas (a caixa de reparo e o kit curativo são usados sozinhos quando você os tem) e vendáveis.
  supply('lanterna-gasta', 'Lanterna gasta', 0, 0, 12, 22, 'flashlight', ['bosque', 'oficina'], 'Ainda ilumina o caminho. Alguém vai querer comprar.'),
  supply('caixa-reparo', 'Caixa de reparo', 0, 0, 16, 18, 'toolbox', ['bosque', 'oficina'], 'Peças suficientes para um reparo muito mais rápido. É usada automaticamente em !reparar.'),
  supply('kit-curativo', 'Kit curativo', 0, 0, 18, 16, 'heart', ['bosque', 'oficina', 'hospital'], 'Cura na hora, sem esperar. É usado automaticamente em !curar.'),
  supply('corda', 'Corda de escalada', 0, 0, 10, 20, 'rope', ['bosque', 'oficina', 'hospital'], 'Trinta metros de uma boa razão para voltar inteiro.'),
  supply('mapa-rasgado', 'Mapa rasgado', 0, 0, 8, 16, 'map', ['bosque', 'oficina'], 'Alguns caminhos desaparecem. A tinta permanece.'),
  supply('cantimplora', 'Cantimplora antiga', 0, 0, 9, 15, 'bottle', ['bosque', 'hospital'], 'Uma pequena reserva para uma longa noite.'),
  supply('pecas', 'Peças de cobre', 0, 0, 14, 18, 'parts', ['oficina', 'hospital', 'celeiro'], 'Pequenos fragmentos, muitas possibilidades.'),
  supply('lanterna-campo', 'Lanterna de campo', 1, 1, 35, 12, 'flashlight', ['bosque', 'oficina'], 'Uma lente intacta, um facho firme, uma trilha menos incerta.'),
  supply('estojo-ferramentas', 'Estojo de ferramentas', 1, 1, 42, 10, 'toolbox', ['oficina', 'hospital'], 'Instrumentos bem cuidados em um lugar que ninguém cuida.'),
  supply('chave-bronze', 'Chave de bronze', 1, 1, 30, 12, 'key', ['oficina', 'celeiro'], 'O número gravado nela não corresponde a nenhuma porta conhecida.'),
  supply('relogio-bolso', 'Relógio de bolso', 1, 1, 38, 9, 'compass', ['bosque', 'celeiro'], 'Parou às seis e dezessete. O silêncio parece ter a mesma idade.'),
  supply('bateria', 'Bateria de reserva', 1, 1, 33, 11, 'parts', ['oficina', 'hospital'], 'Ainda guarda uma carga. Suficiente para uma última esperança.'),

  // Oferendas e lembranças deixadas pela névoa, da mais simples à mais rara.
  ...group({ rarity: 0, tier: 1, value: 20, weight: 9, icon: 'candle', category: 'offering',
    regions: ['bosque', 'oficina', 'hospital'], description: 'Uma lembrança simples. Alguém deixou aqui por um motivo.' }, [
    ['vela-sebo', 'Vela de sebo', 'Derreteu pela metade e ainda cheira a fumaça.'],
    ['flor-seca', 'Flor seca', 'Foi colhida em outro verão.', 'tree'],
    ['fita-desbotada', 'Fita desbotada', 'Amarrava algo importante.'],
    ['pano-manchado', 'Pano manchado', 'Melhor não perguntar de quê.'],
    ['moeda-gasta', 'Moeda gasta', 'A face desapareceu. O valor, não.', 'coin'],
    ['pena-corvo', 'Pena de corvo', 'Preta, firme, ainda quente.'],
    ['terco-madeira', 'Terço de madeira', 'Cada conta tem um nome gravado.'],
    ['caco-espelho', 'Caco de espelho', 'Reflete algo que não estava ali.', 'crystal'],
  ]),
  ...group({ rarity: 1, tier: 1, value: 38, weight: 6, icon: 'candle', category: 'offering',
    regions: ['oficina', 'hospital', 'celeiro'], description: 'Uma oferenda mais cuidada, deixada com intenção.' }, [
    ['vela-cera-negra', 'Vela de cera negra', 'Acende sozinha quando alguém mente.'],
    ['lirio-murcho', 'Lírio murcho', 'Ainda guarda o perfume do lugar de onde veio.', 'tree'],
    ['fita-seda', 'Fita de seda', 'Alguém a amarrou três vezes.'],
    ['sino-rachado', 'Sino rachado', 'Toca uma nota só.', 'bottle'],
    ['dente-lobo', 'Dente de lobo', 'Veio de longe. Muito longe.'],
    ['chaveiro-ferrugem', 'Chaveiro enferrujado', 'Faltam todas as chaves.', 'key'],
    ['brinco-latao', 'Brinco de latão', 'Havia um par. Ele procurou o outro.', 'gem'],
    ['carta-amassada', 'Carta amassada', 'A primeira linha: "Se você está lendo isto…"', 'book'],
    ['lencol-bordado', 'Lençol bordado', 'Iniciais que ninguém reconhece.'],
  ]),
  ...group({ rarity: 2, tier: 2, value: 90, weight: 4, icon: 'relic', category: 'relic',
    regions: ['hospital', 'celeiro', 'farol'], description: 'Um achado valioso. A caixa de ferramentas já abre este tipo de gaveta.' }, [
    ['vela-perfumada', 'Vela perfumada', 'Cheira a casa antiga.', 'candle'],
    ['orquidea-palida', 'Orquídea pálida', 'Nunca murcha, nunca floresce.', 'tree'],
    ['relicario-vazio', 'Relicário vazio', 'Pesa mais do que deveria.', 'gem'],
    ['anel-prata', 'Anel de prata', 'Folgado. Quem o usava emagreceu.', 'gem'],
    ['espelho-mao', 'Espelho de mão', 'Mostra o cômodo ao lado.', 'crystal'],
    ['boneca-pano', 'Boneca de pano', 'Os olhos de botão acompanham você.', 'user'],
    ['colar-contas', 'Colar de contas', 'Uma conta foi trocada por um dente.', 'gem'],
    ['diario-rasgado', 'Diário rasgado', 'Faltam as páginas do final.', 'book'],
    ['luva-renda', 'Luva de renda', 'Combinava com uma festa que não aconteceu.'],
    ['mascara-papel', 'Máscara de papel', 'Sorri para quem a veste.', 'user'],
    ['calice-trincado', 'Cálice trincado', 'Guarda um gole de algo antigo.', 'bottle'],
    ['medalhao-sem-foto', 'Medalhão sem foto', 'O retrato foi arrancado com cuidado.', 'gem'],
  ]),
  ...group({ rarity: 3, tier: 3, value: 250, weight: 2.5, icon: 'relic', category: 'relic',
    regions: ['celeiro', 'farol', 'limiar'], description: 'A sonda de ecos ouviu este vestígio muito antes de você vê-lo.' }, [
    ['vela-vigia', 'Vela do vigia', 'Nunca apaga quando alguém está por perto.', 'candle'],
    ['rosa-nevoa', 'Rosa da névoa', 'Espinhos de fumaça.', 'tree'],
    ['relogio-quebrado', 'Relógio quebrado', 'Os ponteiros giram ao contrário.', 'compass'],
    ['anel-ouro-velho', 'Anel de ouro velho', 'Brasão apagado, peso verdadeiro.', 'gem'],
    ['lanterna-vitral', 'Lanterna de vitral', 'Projeta uma sala que não existe.', 'flashlight'],
    ['boneca-porcelana', 'Boneca de porcelana', 'Uma rachadura nova a cada noite.', 'user'],
    ['estola-veludo', 'Estola de veludo', 'Ainda quente, apesar de tudo.'],
    ['cetro-ebano', 'Cetro de ébano', 'Frio como um juramento.', 'key'],
    ['violino-mudo', 'Violino mudo', 'As cordas vibram, o som nunca sai.', 'rune'],
    ['relicario-prata', 'Relicário de prata', 'Dentro dele, uma mecha de cabelo e uma data.', 'gem'],
  ]),
  ...group({ rarity: 4, tier: 4, value: 750, weight: 1.6, icon: 'relic', category: 'relic',
    regions: ['farol', 'limiar'], description: 'Poucos sobreviventes viram algo assim. A lupa de rastros mostra o caminho.' }, [
    ['coroa-espinhos', 'Coroa de espinhos', 'Escolheu a cabeça errada, e depois a certa.', 'crystal'],
    ['mapa-estrelas', 'Mapa das estrelas', 'Cada ponto é uma luz que se apagou.', 'map'],
    ['sino-vigia', 'Sino do vigia', 'Soa sozinho quando a névoa se aproxima.', 'bottle'],
    ['mascara-marfim', 'Máscara de marfim', 'Mais antiga que a névoa.', 'user'],
    ['caixa-musica', 'Caixa de música', 'A melodia muda de acordo com quem escuta.', 'rune'],
    ['espelho-vigilia', 'Espelho da vigília', 'Mostra quem está atrás de você.', 'crystal'],
  ]),
  ...group({ rarity: 5, tier: 5, value: 2800, weight: 0.7, icon: 'rune', category: 'relic',
    regions: ['limiar'], description: 'Uma relíquia da própria névoa. A bússola ainda aponta para ela.' }, [
    ['olho-nevoa', 'Olho da névoa', 'Pisca quando você desvia o olhar.', 'crystal'],
    ['chave-primeira-porta', 'Chave da primeira porta', 'Serve em toda fechadura que já existiu.', 'key'],
    ['coracao-cinza', 'Coração de cinza', 'Bate devagar, no ritmo de quem te segue.', 'heart'],
    ['veu-palido', 'Véu do Pálido', 'Quem o veste quase não faz sombra.', 'user'],
    ['estilhaco-farol', 'Estilhaço do primeiro farol', 'A luz ainda lembra o caminho de volta.', 'beacon'],
    ['relogio-parado', 'Relógio do tempo parado', 'Marca a hora em que tudo começou.', 'compass'],
  ]),
];

export const CATEGORIES = [
  { id: 'supplies', name: 'Suprimentos' }, { id: 'offering', name: 'Oferendas' }, { id: 'relic', name: 'Relíquias' },
];

/** Os tipos de Pálido que podem aparecer em uma prova. Cada um muda um pouco o ritmo da caçada. */
export const HUNTERS = [
  { id: 'rastreador', name: 'O Rastreador', hit: 0.50, tickScale: 1.0, description: 'Persistente. Quase nunca erra duas vezes seguidas.' },
  { id: 'brutal', name: 'O Brutal', hit: 0.62, tickScale: 1.15, description: 'Golpes pesados, mas demora mais entre um ataque e outro.' },
  { id: 'sombrio', name: 'O Sombrio', hit: 0.55, tickScale: 0.9, hideEffect: 0.6, description: 'Rápido e silencioso: esconder-se funciona pior contra ele.' },
];

export const COMMANDS = [
  ['prova', '', 'Abre uma prova (ou mostra a que está acontecendo).'],
  ['entrar', '', 'Entra na prova aberta, até 4 sobreviventes.'],
  ['reparar', '', 'Conserta o próximo farol. Gasta uma caixa de reparo, se tiver.'],
  ['esconder', '', 'Reduz a chance de ser o alvo do próximo ataque.'],
  ['curar', '[@alvo]', 'Cura um ferido (ou a si mesmo). Gasta um kit curativo, se tiver.'],
  ['libertar', '@alvo', 'Tira alguém dos grilhões. Deixa você marcado por um ataque.'],
  ['fugir', '', 'Escapa pelo portão da névoa depois que todos os faróis acenderem.'],
  ['vasculhar', '[domínio]', 'Procura achados fora das provas. O mesmo que !explorar.'],
  ['mochila', '', 'Mostra os itens e o espaço disponível.'],
  ['perfil', '', 'Mostra nível, ferramenta, Brasas e fugas.'],
  ['vender', '<item|tudo> [quantidade]', 'Troca achados por Brasas.'],
  ['loja', '[bolsas|lanternas|talentos]', 'Consulta uma categoria da loja.'],
  ['comprar', '<ferramenta|bolsa|lanterna>', 'Compra e equipa uma melhoria.'],
  ['equipar', '<ferramenta>', 'Usa uma ferramenta já adquirida.'],
  ['talentos', '', 'Mostra seus talentos e os espaços disponíveis.'],
  ['aprender', '<talento>', 'Aprende um talento com Brasas (equipa se houver espaço).'],
  ['usar', '<talento>', 'Equipa um talento aprendido.'],
  ['guardar', '<talento>', 'Tira um talento dos espaços.'],
  ['dominios', '', 'Mostra os domínios e suas exigências.'],
  ['cooldown', '', 'Mostra quando você pode vasculhar novamente.'],
  ['chances', '[domínio]', 'Mostra as chances com sua ferramenta e nível.'],
  ['ajuda', '', 'Lista os comandos da Entidade.'],
];

/** Nomes que o chat também aceita para o mesmo comando. */
export const ALIASES = { explorar: 'vasculhar', regioes: 'dominios', inventario: 'mochila', saldo: 'perfil' };

/** @returns {object} Catálogo público, sem pesos internos de sorteio. */
export function getCatalogue() {
  return { rarities: RARITIES, equipment: EQUIPMENT, backpacks: BACKPACKS, lights: LIGHTS,
    talents: TALENTS, shopCategories: SHOP_CATEGORIES, regions: REGIONS, categories: CATEGORIES, hunters: HUNTERS,
    items: ITEMS.map(({ weight, ...entry }) => ({ ...entry, minEquipmentId: equipmentForItem(entry).id })),
    commands: COMMANDS };
}
