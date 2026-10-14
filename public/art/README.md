# Arte da Entidade

`palido-walk-v1.png` preserva quatro quadros de caminhada criados com ImageGen (2172 × 724 px, células de 543 × 724 px), como alternativa de arte. A versão ativa usa a mesma base Mana Seed dos sobreviventes, composta com uma meia máscara rachada, rosto e casaco manchados de sangue em `public/sprites/layers/palido-body.svg`. O cutelo fica na mão e compartilha o quadro do corpo. `public/pixel.js` controla as poses; cenas, câmera, reparos, ferimentos, grilhões e Buscas usam os módulos `trial-scene` e `exploration-scene`.

## Prompt da caminhada

### Versão ativa da cena

O Pálido ativo usa `public/sprites/layers/palido-body.svg`: corpo Mana Seed, capuz escurecido, manto e máscara desenhada em pixels inteiros são compostos em uma única imagem de 512 × 512 px. Não existe uma máscara animada separadamente. `advancePersonFrame` aplica um único índice de quadro a todas as peças da figura, incluindo o cutelo e os ferimentos dos sobreviventes. `npm run sprites:scene` recompõe a folha do Pálido e os três níveis de ferimentos sem alterar os PNGs licenciados. Os sobreviventes capturados usam a pose sentada da mesma base na área lateral de grilhões; o resgate os devolve ao campo.

Use case: precise-object-edit. Asset type: production horizontal WALK-CYCLE SPRITE SHEET for the pixel-art game Entidade. Use the provided original Pálido as identity and art-style reference. Create exactly FOUR distinct successive walking frames, arranged in ONE HORIZONTAL ROW of FOUR EXACTLY EQUAL CELLS on a wide 4:1 canvas. All frames show the SAME entire character facing LEFT in a side/three-quarter view, ivory mask, burgundy tattered coat, brown boots. Preserve crisp chunky low-resolution pixel-art style. Frame 1 left leg forward/right leg back; frame 2 passing stride legs close and right heel lifted; frame 3 right leg forward/left leg back; frame 4 opposite passing stride. Arms counter-swing and coat tails gently change with each frame. Head, torso, scale and mask identity stay identical. NO DUPLICATED STILL POSES. IMPORTANT technical alignment: centers at EXACTLY 12.5%, 37.5%, 62.5%, 87.5% of total width, all feet share EXACTLY the same ground baseline at 92% of total height, all head tops at 8% height, equal scale, each sprite fully inside its equal cell. Entire canvas actual transparency, no floor, no cast shadow, no glow, no gradient, no labels, no gridlines, no background, no text. Four equal tiles intended for direct CSS steps(4) animation. Leave narrow consistent transparent margins inside every tile. Frame artwork should fit one 128x128 logical tile and look good at 90 pixels tall.

`palido-v2.png` preserva a versão ilustrada do Pálido, anterior à adaptação para a base animada Mana Seed. `palido-v1.png` preserva a primeira ilustração de conceito. Gerada em 14/10/2026 com a ferramenta nativa ImageGen, em fundo transparente. Os arquivos foram preservados nesta pasta.

Os cenários e as camadas dos sobreviventes existentes foram preservados. Ícones de navegação são desenhos vetoriais em grade, definidos em `public/pixel-icons.js`.

## Ícones de itens fornecidos pelo usuário

`items/` guarda uma seleção de PNGs de 16 × 16 e 32 × 32 pixels, copiados sem alterações dos pacotes
`items`, `Free - Raven Fantasy Icons` e `Pixel Art Icon Pack - RPG` da pasta fornecida pelo usuário.
O pacote Raven é de Clockwork Raven Studios; sua nota original está em `items/RAVEN-NOTE.txt`.
`items/sources.json` registra o pacote e o arquivo de origem de cada imagem.

`public/item-assets.js` associa cada item à sua arte, compartilhada entre loja, bolsa,
códice, perfil e a revelação das Buscas. Itens sem correspondência conservam seu ícone vetorial.
As imagens usam escala em pixels inteiros e não recebem filtros de cor de raridade;
a raridade permanece nos contornos, rótulos e efeitos dos cartões.

Para repetir a importação: `node scripts/import-item-icons.mjs "caminho/da/pasta"`.

## Prompt final do sprite

Use case: style-transfer. Asset type: transparent enemy sprite for the existing pixel-art browser game Entidade. Image 1 is the target hunter concept to simplify. Image 2 is a STYLE AND PIXEL-SCALE REFERENCE ONLY: match the tiny side-facing RPG survivor shown in its central preview, do not copy the screenshot or interface. Transform the hunter into a genuinely low-resolution, hand-placed 32-by-48-pixel RPG sprite with the SAME LARGE SQUARE PIXELS and roughly 3-head-tall proportions as that survivor. Enlarge these source pixels with exact hard nearest-neighbor edges. Preserve the ivory mask, dark burgundy ragged coat and boots, make his head visibly large like the reference sprite, much simpler shapes and only 3 shades per material, approximately 16 total colors. No fine-grained painted textures, no tiny subpixels, no realism. One complete hunter, standing and facing left in three-quarter view, both feet resting at the same baseline, head visible, no weapon. Actual transparent background, no scene, no ground, no interface, no shadow rectangle, no words. Center the single full-body sprite with very narrow transparent margins. The resulting sprite should fit beside the screenshot's character at 100px display height and clearly look like it belongs in the same game.

## Prompt do conceito inicial

Use case: stylized-concept. Asset type: transparent pixel-art enemy sprite for the browser game Entidade. Primary request: one full-body original ominous forest hunter called O Pálido, standing still, facing three-quarter left toward small survivors. A tall gaunt adult humanoid, weathered ivory featureless mask with narrow black eye sockets, ragged dark burgundy charcoal overcoat, leather boots, gloved hands relaxed at sides. Original design, subtle gothic survival atmosphere, no weapons. Style: meticulously hand-placed 64-bit-era pixel art, visible crisp square pixels, limited muted palette charcoal #171319, burgundy #49282e, warm bone #d9c7a8, rust #8c5340. Approximately 48 pixels wide and 80 pixels tall of intentional pixel detail, enlarged with hard nearest-neighbor edges. Proportions head to body about 1:4, compatible with detailed small RPG sprites rather than an oversized chibi icon. Composition: exactly one isolated complete character, feet level, centered and filling almost the entire height with narrow transparent margins, no sheet, no extra poses. Lighting: subtle amber rim light from left, readable dark silhouette. Actual fully transparent background, no scenery, no ground, no shadow rectangle, no text, no watermark, no interface.
