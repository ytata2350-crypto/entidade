# Entidade — provas na névoa

Jogo original para o chat da Twitch. Até quatro sobreviventes acendem faróis, fogem de um caçador
chamado **Pálido** e atravessam o portão da névoa; entre as provas, vasculham domínios, vendem achados
por **Brasas** e aprendem **talentos**. Projeto independente em `projetos/entidade`, com servidor, banco SQLite,
interface, demonstração e adaptador para o bot JavaScript do site principal.
O jogo **não tem relação com a fila de resgates nem com a streak**: só compartilha o chat.
Os arquivos e o banco do `overlay-saas` não foram alterados.

> Inspirado no gênero "sobrevivência assimétrica", mas com nomes, regras, textos e arte próprios.
> Não usa nomes, personagens, perks, mapas ou marcas de nenhum jogo existente.

## Experimentar

Use Node.js **22.13 ou mais recente**. Não há dependências para instalar.
No Windows, abra **iniciar.bat**. Ou, dentro desta pasta:

```powershell
npm start
```

Abra **http://127.0.0.1:3210**. A demonstração permite abrir uma prova, vasculhar, vender, comprar e aprender talentos.
O progresso fica associado ao navegador e separado dos jogadores da Twitch.
Em **Testar progressão**, cada cenário fornece 800 Brasas, a ferramenta escolhida e suprimentos
(caixas de reparo e kits curativos). Carregar um cenário reinicia só a demonstração daquele navegador.
Na demonstração, as provas são aceleradas e o Pálido erra mais.
O [guia do chat](GUIA-CHAT.md) reúne exemplos de comandos e os tempos de espera.

## A prova

| Comando | O que faz |
| --- | --- |
| `!prova` | Abre uma prova. O grupo tem 45 s para entrar. |
| `!entrar` | Junta-se à prova aberta (até 4 sobreviventes). |
| `!reparar` | Conserta o próximo farol. |
| `!esconder` | Reduz a chance de ser o alvo do próximo ataque. |
| `!curar [@nome]` | Cura um ferido (você mesmo demora o dobro, sem kit curativo). |
| `!libertar @nome` | Resgata quem está preso (deixa você marcado). |
| `!fugir` | Atravessa o portão, quando todos os faróis estão acesos. |

- Há **um farol a mais que o número de sobreviventes**. Com todos acesos, o portão abre.
- O Pálido ataca a cada ~20 s. O primeiro golpe fere; o segundo prende aos grilhões.
  Preso, há dois estágios de 60 s antes de a névoa levar o sobrevivente.
- A prova dura no máximo 8 min. Entre provas, a névoa descansa 2 min.
- **Caixa de reparo** (+60% no reparo) e **kit curativo** são usados sozinhos, se estiverem na bolsa.
- Recompensas aplicadas **uma única vez** ao fim: fugir rende 90 Brasas e 60 XP (20/15 para quem não escapou),
  mais bônus por reparos, resgates e curas, e ×1,25 se alguém escapou.
- Talentos e ferramentas ficam "congelados" quando a prova começa.

Há três caçadores (Rastreador, Brutal, Sombrio) com chances e ritmos diferentes.

## Entre as provas

- `!vasculhar [domínio]` (também `!explorar`) encontra um achado e dá XP. Seis domínios, liberados pela ferramenta.
- `!vender <item|tudo>`, `!loja [bolsas|lanternas|talentos]`, `!comprar`, `!equipar`, `!mochila`, `!perfil`.
- **12 ferramentas** (caixas de ferramentas e itens de exploração) reduzem o cooldown, aumentam sorte, XP e reparo.
- **Bolsas** de 30 a 360 espaços e **lanternas** (sorte e XP) têm progressão própria.
- **8 talentos** (`!talentos`, `!aprender`, `!usar`, `!guardar`): espaços 1/2/3/4 nos níveis 1/6/12/20.
  Mão firme, Passos leves, Coragem, Mãos gentis, Olhar atento, Persistência, Segundo fôlego e Faro de achados.
- Nível: `1 + floor(sqrt(XP / 40))`. O ranking usa XP, com fugas como desempate. Cada canal tem progresso próprio.
- São **63 achados** em seis raridades; ferramenta e domínio limitam o sorteio **antes** de ele acontecer.
  `!chances [domínio]` mostra as probabilidades reais.

O balanceamento é ajustável (`src/catalogue.js`, `src/trial.js`) e ainda precisa de observação em uma live real.

### Espera entre ações

Buscas começam com **10 minutos** de intervalo no canal; ferramentas reduzem esse tempo até **3 minutos**
com o catálogo atual. A configuração do servidor tem um piso de **1 minuto** para jogadores reais.
Na demonstração, são **30 segundos**, com piso de **10 segundos** conforme o equipamento.
O prazo e a duração da última busca ficam no banco. Atualizar o site, alternar `!explorar` / `!vasculhar`,
trocar de domínio ou equipar outra ferramenta preserva a espera que já começou.
Comandos recusados não dão itens nem XP e não prolongam esse prazo. `!cooldown` consulta quanto falta.

Nas provas reais, reparos e resgates compartilham a espera padrão de **15 segundos**; esconder-se leva **22,5 segundos**
e curar a si mesmo sem kit, **30 segundos**, antes dos efeitos de talentos. Entre provas, há **2 minutos** de descanso.
Na demonstração, as ações partem de **3 segundos** e o descanso é de **15 segundos**.
`EXPLORE_COOLDOWN_SECONDS` e `DEMO_EXPLORE_COOLDOWN_SECONDS` ajustam as buscas no `.env` deste projeto.

Referência consultada: o [manual do Twish](https://twish.com.br/manual), em "Como Pescar", descreve uma espera
base de 10 minutos e redução por equipamento. Aqui a regra foi adaptada à exploração da Entidade.

## Conectar ao bot existente

O bot atual valida os canais e recebe os metadados da Twitch. A ponte reutiliza essas verificações,
sem copiar os tokens OAuth nem abrir o banco original.

1. Copie `.env.example` para `.env` **nesta pasta**.
2. Configure `BOT_API_KEY` com uma chave aleatória de pelo menos 32 caracteres e `TWITCH_CHANNEL` com seu canal.
3. No ambiente do bot original, configure `ENTIDADE_URL=http://127.0.0.1:3210` e `ENTIDADE_API_KEY` com a mesma chave.
4. Use o hook completo em `examples/existing-bot-hook.js`.

Para gerar a chave:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

O ponto de conexão identificado é `aoReceberMensagem(m)`, em `src/modulos/bot-twitch/bot-twitch.js`
do projeto principal. Os trechos abaixo são a integração futura; **não foram aplicados ao bot original**.

```js
import { createGameHook } from '../../../projetos/entidade/examples/existing-bot-hook.js';

const entidadeHook = process.env.ENTIDADE_API_KEY
  ? createGameHook({
    baseUrl: process.env.ENTIDADE_URL || 'http://127.0.0.1:3210',
    apiKey: process.env.ENTIDADE_API_KEY,
    canUseChannel: podeUsarBot,
    sendReply: enviar,
  })
  : () => false;
```

Dentro de `aoReceberMensagem(m)`, depois do bloco `info.pendente` e antes de `const comando = info.comandos?.get(nome);`:

```js
if (entidadeHook(m, info)) return;
```

Se outro bot já usa `!ajuda`, `!loja` ou `!perfil`, configure `COMMAND_PREFIX=$` no jogo Entidade e `prefix: '$'` no hook.
O ID permanente da Twitch identifica o jogador; mensagens repetidas são deduplicadas pelo ID;
comandos de outra sala por Shared Chat são ignorados.

### Contrato da ponte

```http
POST /api/bot/command
Authorization: Bearer <BOT_API_KEY>
Content-Type: application/json
```

```json
{
  "channel": "meu_canal",
  "playerId": "123456789",
  "login": "sobrevivente",
  "displayName": "Sobrevivente",
  "messageId": "id-da-mensagem-twitch",
  "text": "!reparar"
}
```

A resposta contém `ok`, `reply`, `kind`, `player` e, conforme a ação, `itemId`, `xpGained`, `coinsGained` ou `duplicate`.
Recusas do jogo usam HTTP 200 e `ok: false`. Use HTTPS quando os processos estiverem em máquinas diferentes.

Como a prova avança com o tempo, a página (e qualquer comando) resolve os ataques pendentes na hora
(`advance(now)`, sem timers): não há processo em segundo plano consumindo memória.

## Bot independente opcional

Defina `TWITCH_BOT_ENABLED=1`, `TWITCH_BOT_USERNAME`, `TWITCH_BOT_OAUTH` e `TWITCH_CHANNEL` no `.env`.
O token precisa dos escopos `chat:read` e `chat:edit`. Não ative o hook e esse modo para a mesma conta ao mesmo tempo.

## Comunidade real e hospedagem

```text
http://127.0.0.1:3210/?canal=meu_canal&jogador=login_do_jogador
```

A página consulta a prova e o progresso periodicamente. Os botões copiam comandos para o chat.
Mantenha o processo independente atrás de um subdomínio; o servidor escuta em `127.0.0.1` (ajuste `HOST`).
Atrás de HTTPS, defina `PUBLIC_URL=https://seu-endereco`.

## Validação e arquivos

```powershell
npm test
```

Se o ambiente bloquear processos filhos: `node --test --test-isolation=none test/*.test.js`.

| Pasta/arquivo | Responsabilidade |
| --- | --- |
| `public/` | Interface, estilos, mapa e ícones |
| `src/catalogue.js` | Ferramentas, talentos, caçadores, achados e comandos |
| `src/trial.js` | Simulação da prova em grupo |
| `src/game.js` | Motor transacional |
| `src/store.js` | Banco independente (migrações) |
| `src/server.js` | API e servidor |
| `src/integrations/` | Ponte para o bot existente |
| `src/twitch-bot.js` | Bot opcional |
| `examples/` | Hook de integração |
| `test/` | Testes |
| `data/` | Banco local, ignorado pelo Git |

Bancos criados antes desta versão migram sozinhos (com backup `.v3.bak`): XP, saldo e inventário são preservados;
runas de Fortuna e a fuga com itens deixam de existir.

### Paleta do projeto mãe

A interface usa a paleta "Entidade" de [Fila de Resgates](https://dbdfilaresgates.com.br/),
conferida na página publicada e em `web/public/css/landing.css` do projeto principal.
Sua definição única está em `public/style.css`: fundo `#0b0809`, painéis `#151012` / `#1d1619`,
bordas `#2b2023` / `#3d2e32`, texto `#f0e7dc`, texto secundário `#a99d97`,
ação `#b3121f` (hover `#c81a28`), destaque de texto `#f05a5a` e progresso `#f2b544`.

Navegação e ações usam vermelho; títulos usam o texto claro; os painéis têm fundo neutro.
O dourado fica nos indicadores de progresso e recompensas.

Ao editar a interface, use essas variáveis nos componentes. `pixel.css` define a apresentação em pixels;
não deve redefinir a paleta. Os estilos das cenas, contadores, avisos e controles também usam a mesma base.
As cores próprias dos sprites, materiais e raridades são informações da arte e do jogo.

### Cena viva das provas

Os sobreviventes e o Pálido caminham pelo cenário sem serem recriados entre consultas. Corpo, capuz e meia máscara rachada do Pálido formam uma única folha; um relógio por personagem controla todos os quadros. O rosto muda de frente para perfil e fica oculto de costas. Há sangue no rosto, casaco e cutelo, além de gotas frescas após um acerto.

Os comandos de reparar, esconder, curar, libertar e fugir produzem ações na cena. Os ataques mostram o alvo e o resultado resolvidos pelo servidor: esquivas, impactos, grilhões e pequenos efeitos de sangue nos acertos. A câmera acompanha suavemente o grupo, com um loop de floresta em camadas e sombras apoiadas nos pés.

O botão de pausa interrompe a apresentação visual e mantém o jogo atualizado. A preferência por movimento reduzido é respeitada inicialmente. A página consome eventos com IDs únicos, sem repetir ações a cada consulta nem acumular ataques para mostrar ao voltar de outra aba.

Os ferimentos têm três níveis visuais, aumentam somente com golpes que ferem ou capturam e são persistidos na prova. O resgate preserva as marcas; a cura as remove. Na captura, o sobrevivente cai, o Pálido o levanta e o carrega no ombro. Os pés do caçador permanecem no chão até a base dos grilhões: só o sobrevivente é erguido para a plataforma. A posição da vítima acompanha os passos do caçador e a entrega termina com ela sentada. Resgatar, morrer, pausar ou voltar de outra aba limpa o vínculo de transporte; uma página aberta durante a captura mostra o estado atual sem repetir cenas antigas. Libertados, os sobreviventes voltam ao campo.

### Buscas animadas

A carta do domínio mantém uma personagem caminhando entre uma casinha, raízes e um baú, com sombras, poeira, vaga-lumes e cenário em camadas. Ela entra na casa, as janelas acendem enquanto procura e ela sai para continuar a busca. As buscas alternam essa visita com uma escavação: a pá acompanha a mão nos quadros da personagem, a terra salta e uma pequena cova se abre. O baú tem tampa animada, feixes de luz e partículas.

Uma busca confirmada pelo servidor mostra o ícone real do achado e uma reação antes do resultado; a animação ambiente não gera itens ou recompensas. Durante a espera, ela volta para o colchonete ao lado da casinha e dorme deitada, com almofada, cobertor, respiração e "Zzz". Ao liberar, ela levanta e o botão recebe um destaque, acompanhado de um aviso e um blip de 0,2 segundo. Há um controle de som no topo, com preferência salva no navegador; o áudio depende de uma interação prévia na página. O mesmo aviso atende às ações pessoais das provas e ao descanso entre provas, uma vez por prazo, sem repetir a cada consulta. Eventos do bot também animam a busca do jogador selecionado, sem repetir eventos antigos. Movimento reduzido e pausa são respeitados.

`npm run sprites:scene` recompõe o Pálido, as camadas de ferimentos e a pá em SVG, usando os PNGs Mana Seed licenciados sem alterá-los. A casinha e o baú estão em `public/search-props.svg`.
