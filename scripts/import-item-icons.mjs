/** Importa somente os ícones selecionados; preserva os PNGs originais e registra a origem. */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) throw new Error('Informe a pasta de origem dos pacotes de ícones.');
const target = fileURLToPath(new URL('../public/art/items/', import.meta.url));
const objects = {
  toolbox: 714, medkit: 913, rope: 689, map: 662, gear: 934, clock: 941,
  battery: 959, coin: 1158, feather: 1176, branch: 988, ribbon: 1203,
  'ribbon-worn': 1202, 'mirror-shard': 1138, lily: 1025, tooth: 1185,
  earrings: 1103, letter: 642, pendant: 862, 'silver-ring': 1104,
  mirror: 805, diary: 648, gloves: 749, orchid: 1026, rose: 1030,
  'gold-ring': 892, cape: 876, crown: 1098,
  'star-map': 663, bell: 937, mask: 302, 'music-box': 979,
  'watcher-mirror': 1140, eye: 1173, 'beacon-shard': 1244,
  scanner: 961, magnifier: 770,
};
const raven = {
  'lamp-trail': 86, 'lamp-field': 85, 'lamp-prism': 91, 'lamp-aurora': 92,
  'bag-canvas': 129, 'bag-leather': 133, 'bag-waterproof': 134,
  'bag-campaign': 135, 'bag-tactical': 136, 'bag-mist': 137,
  flask: 121, 'bronze-key': 77, 'ancient-key': 179, necklace: 118, chalice: 54,
};
await mkdir(target, { recursive: true });
const manifest = {};
const selections = [
  ...Object.entries(objects).map(([name, number]) => [name, 'items', `item${number}.png`]),
  ...Object.entries(raven).map(([name, number]) => [name, 'Free - Raven Fantasy Icons',
    `Free - Raven Fantasy Icons/Separated Files/16x16/fa${number}.png`]),
];
for (const [name, pack, file] of selections) {
  const original = resolve(source, pack, file);
  const bytes = await readFile(original);
  if (bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a'
    || bytes.readUInt32BE(16) !== 16 || bytes.readUInt32BE(20) !== 16)
    throw new Error(`Ícone fora da grade selecionada: ${name}`);
  await copyFile(original, join(target, `${name}.png`));
  manifest[`${name}.png`] = { pack, file, width: 16, height: 16 };
}
await copyFile(resolve(source, 'Free - Raven Fantasy Icons', 'Special Note to the Dev.txt'),
  join(target, 'RAVEN-NOTE.txt'));
await writeFile(join(target, 'sources.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${selections.length} ícones importados, sem alterações nos arquivos de origem.`);
