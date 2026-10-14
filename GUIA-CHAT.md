# Entidade no chat da Twitch

O jogador escreve um comando no chat da sua live. Seu bot encaminha a ação à Entidade, recebe o resultado e responde no chat. O site mostra o progresso e anima as ações do jogador selecionado. O perfil nasce no primeiro comando, usando o ID da Twitch; cada canal tem seu próprio progresso.

A ponte de integração está pronta nesta pasta. Ela ainda precisa ser conectada ao bot do site principal, conforme o README. A página local funciona como demonstração enquanto essa ligação não estiver ativa.

## Procurar e evoluir

| Escreva no chat | Resultado |
| --- | --- |
| `!vasculhar bosque` | Procura um achado no Bosque esquecido e ganha XP. `!explorar bosque` faz a mesma coisa. |
| `!dominios` | Lista os caminhos e os equipamentos necessários. |
| `!cooldown` | Informa quanto falta para a próxima busca. |
| `!mochila` | Mostra os itens e o espaço na bolsa. |
| `!perfil` | Mostra seu nível, suas Brasas e seu equipamento. |
| `!vender tudo` | Troca os achados por Brasas. |
| `!vender corda 2` | Vende duas unidades do item, se estiverem na bolsa. Use o identificador listado pelo jogo. |
| `!loja` | Mostra a próxima ferramenta disponível. |
| `!loja bolsas` / `!loja lanternas` | Consulta outra categoria. |
| `!comprar kit-campo` | Compra e equipa o Kit de campo, se houver nível e Brasas suficientes. |
| `!equipar bolsa-lona` | Equipa uma ferramenta que você já possui. |
| `!chances bosque` | Mostra as chances reais com seu equipamento atual. |

Os domínios aceitam os identificadores `bosque`, `oficina`, `hospital`, `celeiro`, `farol` e `limiar`. Equipamento e domínio definem quais achados podem aparecer. Cada busca bem-sucedida entrega um achado; a animação mostra o resultado já confirmado pelo servidor.

Para começar: `!vasculhar bosque`, depois `!mochila`, `!perfil` e `!loja`. Enquanto aguarda outra busca, você pode acompanhar ou participar de uma prova.

## Jogar uma prova

| Escreva no chat | Resultado |
| --- | --- |
| `!prova` | Abre uma prova ou consulta a atual. |
| `!entrar` | Entra no grupo durante os 45 segundos de preparação; há até quatro vagas. |
| `!reparar` | Repara o próximo farol; usa uma caixa de reparo automaticamente, se houver. |
| `!esconder` | Reduz a chance de ser escolhido no próximo ataque. |
| `!curar` / `!curar @amigo` | Cura você ou outro sobrevivente ferido. |
| `!libertar @amigo` | Solta um sobrevivente preso, atraindo a atenção do próximo ataque. |
| `!fugir` | Escapa quando todos os faróis estiverem acesos. |

O Pálido age com o tempo: o grupo precisa coordenar reparos, curas e resgates. As recompensas são calculadas uma vez ao fim da prova. O site acompanha os acontecimentos com consultas periódicas; as respostas dos comandos chegam pelo bot.

## Esperas para controlar a coleta

| Ação | Canal real | Demonstração |
| --- | --- | --- |
| Nova busca com equipamento inicial | 10 minutos | 30 segundos |
| Nova busca com a melhor ferramenta atual | 3 minutos | 10 segundos |
| Reparo ou resgate | 15 segundos | 3 segundos |
| Esconder-se | 22,5 segundos | 4,5 segundos |
| Curar a si mesmo sem kit | 30 segundos | 6 segundos |
| Abrir outra prova após o fim | 2 minutos | 15 segundos |

Tempos padrão, antes dos efeitos de talentos. As ações da prova compartilham o prazo pessoal: trocar de reparo para resgate não permite agir de novo imediatamente.

A espera de busca vale para todos os domínios e para os dois nomes do comando. Ela continua ao fechar ou atualizar o site e ao reiniciar o servidor. Trocar de equipamento durante a espera não altera o prazo; o novo benefício entra na próxima busca. Comandos enviados cedo demais apenas informam quanto falta, sem conceder itens e sem aumentar a espera. Se a bolsa estiver cheia, a busca não começa nem consome o intervalo.

O site exibe a contagem e uma barra de recuperação. Durante a espera das buscas, a personagem volta ao colchonete ao lado da casa e dorme deitada, com almofada, cobertor, respiração e pequenos "Zzz". Quando o prazo termina, ela levanta, o botão ganha um brilho e aparece um aviso com um blip curto. O som também avisa quando a ação pessoal da prova ou uma nova prova fica disponível. O botão de som no topo permite silenciar e guarda sua escolha neste navegador. Para o navegador permitir o áudio, interaja ao menos uma vez com o site; o aviso visual funciona mesmo sem som.

O bloqueio também é validado no servidor. A regra limita a frequência de coleta; não é uma verificação de presença humana.

A referência foi o [manual do Twish](https://twish.com.br/manual): espera base de 10 minutos e redução por equipamento, adaptadas à Entidade.

## Talentos e ajuda

Use `!talentos` para consultar, `!aprender <talento>` para comprar, `!usar <talento>` para equipar e `!guardar <talento>` para liberar um espaço. `!ajuda` lista todos os comandos.

Se o bot já usar comandos como `!loja`, a Entidade pode trabalhar com `$` como prefixo. Essa opção precisa ser configurada tanto no jogo quanto na ponte do bot.
