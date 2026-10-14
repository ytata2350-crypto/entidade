/**
 * @file Hook para o bot existente. Cada comando mantém a verificação de acesso do canal.
 * Deve ser chamado depois do vínculo e antes do filtro dos comandos antigos.
 */
import { createLimiarBridge, isLimiarCommand } from '../src/integrations/existing-bot.js';

/**
 * @param {{baseUrl:string, apiKey:string, prefix?:string, canUseChannel:Function, sendReply:Function}} options
 * @returns {(message:object, channelInfo:object)=>boolean} true se o comando pertence ao jogo.
 */
export function createGameHook({ baseUrl, apiKey, prefix = '!', canUseChannel, sendReply }) {
  const bridge = createLimiarBridge({ baseUrl, apiKey, prefix });
  return (message, channelInfo) => {
    if (!channelInfo || channelInfo.pendente || !isLimiarCommand(message.texto, prefix)) return false;
    if (!canUseChannel(channelInfo.userId)) return false;
    const channel = (message.params[0] || '').replace(/^#/, '').toLowerCase();
    bridge(message).then((response) => {
      if (response && !response.duplicate) {
        sendReply(channel, response.reply, message.tags.id, message.tags['room-id']);
      }
    }).catch(() => {
      sendReply(channel, 'O acampamento da Entidade não respondeu. Tente novamente em instantes.',
        message.tags.id, message.tags['room-id']);
    });
    return true;
  };
}
