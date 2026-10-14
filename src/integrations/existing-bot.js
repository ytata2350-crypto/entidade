/**
 * @file Ponte HTTP para o bot JavaScript existente. Nenhum segredo chega ao navegador.
 * Recebe o mesmo formato de mensagem usado por parseLinha no overlay-saas.
 */
import { COMMANDS, ALIASES } from '../catalogue.js';

// A mesma lista de comandos do jogo: não há uma segunda lista para esquecer de atualizar.
const COMMAND_NAMES = new Set([...COMMANDS.map(([id]) => id), ...Object.keys(ALIASES)]);

/** @param {string} text @param {string} [prefix] @returns {boolean} */
export function isLimiarCommand(text, prefix = '!') {
  const token = String(text ?? '').trim().split(/\s+/)[0];
  return token.startsWith(prefix) && COMMAND_NAMES.has(token.slice(prefix.length).toLowerCase());
}

/**
 * @param {{baseUrl:string, apiKey:string, prefix?:string, fetchImpl?:Function}} options
 * @returns {(message:object)=>Promise<object|null>} Resposta a enviar pelo bot existente.
 */
export function createLimiarBridge({ baseUrl, apiKey, prefix = '!', fetchImpl = fetch }) {
  const url = new URL('/api/bot/command', baseUrl);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('A ponte exige HTTPS, exceto quando usa localhost.');
  }
  if (!apiKey || apiKey.length < 32) throw new Error('Configure uma BOT_API_KEY com pelo menos 32 caracteres.');
  return async (message) => {
    if (!isLimiarCommand(message.texto, prefix)) return null;
    const channel = String(message.params?.[0] ?? '').replace(/^#/, '').toLowerCase();
    const tags = message.tags ?? {};
    // Não reproduz comandos que chegaram de outra sala por Shared Chat.
    if (tags['source-room-id'] && tags['source-room-id'] !== tags['room-id']) return null;
    const response = await fetchImpl(url, {
      method: 'POST', signal: AbortSignal.timeout(7000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ channel, playerId: tags['user-id'], login: String(message.prefixo ?? '').split('!')[0],
        displayName: tags['display-name'] || String(message.prefixo ?? '').split('!')[0],
        messageId: tags.id, text: message.texto }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'A Entidade não respondeu ao comando.');
    return result;
  };
}
