/**
 * @file Bot opcional baseado na conexão WebSocket/IRC já usada no site original.
 * A ponte com o bot existente é a opção principal; este modo só liga por configuração explícita.
 */
import { isGameCommand } from './game.js';

/** @param {string} line @returns {object} Mensagem IRC com metadados da Twitch. */
export function parseIrcLine(line) {
  let rest = line;
  const tags = {};
  if (rest.startsWith('@')) {
    const end = rest.indexOf(' ');
    for (const pair of rest.slice(1, end).split(';')) {
      const equal = pair.indexOf('=');
      tags[equal < 0 ? pair : pair.slice(0, equal)] = (equal < 0 ? '' : pair.slice(equal + 1))
        .replace(/\\([snr:\\])/g, (_, char) => ({ s: ' ', n: '\n', r: '\r', ':': ';', '\\': '\\' })[char]);
    }
    rest = rest.slice(end + 1);
  }
  let prefix = '';
  if (rest.startsWith(':')) {
    const end = rest.indexOf(' ');
    prefix = rest.slice(1, end);
    rest = rest.slice(end + 1);
  }
  const split = rest.indexOf(' :');
  const text = split < 0 ? '' : rest.slice(split + 2);
  const [command, ...params] = (split < 0 ? rest : rest.slice(0, split)).split(' ');
  return { tags, prefix, command, params, text };
}

/** @param {object} options @returns {{status:object, stop:Function}} */
export function startTwitchBot({ enabled, username, oauth, channel, game, prefix = '!' }) {
  const status = { mode: enabled ? 'standalone' : 'external', connected: false, error: '' };
  let socket;
  let retry;
  let stopped = false;
  let attempt = 0;
  let lastReceived = Date.now();
  const outgoing = [];
  const received = new Map();
  const recent = [];
  if (!enabled) return { status, stop() {} };
  const token = String(oauth || '').replace(/^oauth:/, '');
  if (!/^[a-z0-9_]{3,25}$/.test(username) || !/^[a-z0-9_]{3,25}$/.test(channel) || !/^[a-zA-Z0-9]{20,200}$/.test(token)) {
    status.error = 'Configure canal, login e token OAuth do bot independente.';
    return { status, stop() {} };
  }
  function connect() {
    if (stopped) return;
    socket = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    const current = socket;
    current.addEventListener('open', () => {
      lastReceived = Date.now();
      current.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      current.send(`PASS oauth:${token}`);
      current.send(`NICK ${username}`);
    });
    current.addEventListener('message', ({ data }) => {
      lastReceived = Date.now();
      for (const line of String(data).split('\r\n').filter(Boolean)) {
        const message = parseIrcLine(line);
        if (message.command === 'PING') { current.send(`PONG :${message.text}`); continue; }
        if (message.command === '001') {
          attempt = 0; status.error = ''; current.send(`JOIN #${channel}`);
        }
        if (message.command === 'ROOMSTATE' && message.params[0] === `#${channel}`) status.connected = true;
        if (message.command === 'RECONNECT') current.close();
        if (message.command === 'NOTICE' && /authentication|auth/i.test(message.text)) {
          status.error = 'A Twitch recusou o token. Renove-o na configuração do projeto.';
          stopped = true; current.close();
        }
        if (message.command !== 'PRIVMSG' || message.params[0] !== `#${channel}`) continue;
        if (message.tags['source-room-id'] && message.tags['source-room-id'] !== message.tags['room-id']) continue;
        const login = message.prefix.split('!')[0];
        if (login === username || !isGameCommand(message.text, prefix)) continue;
        if (!message.tags.id || received.has(message.tags.id)) continue;
        if (outgoing.length >= 15) continue; // não altera o jogo se a resposta não cabe na fila
        try {
          const result = game.execute({ channel, playerId: message.tags['user-id'], login,
            displayName: message.tags['display-name'] || login, messageId: message.tags.id, text: message.text });
          received.set(message.tags.id, Date.now());
          if (result) outgoing.push({ id: message.tags.id, text: result.reply });
        } catch (error) { console.warn('Comando da Entidade recusado:', error.message); }
      }
    });
    current.addEventListener('error', () => { status.error = 'Conexão com a Twitch indisponível.'; });
    current.addEventListener('close', () => {
      status.connected = false;
      if (!stopped) {
        retry = setTimeout(connect, Math.min(60_000, 1000 * 2 ** Math.min(attempt++, 6)));
        retry.unref();
      }
    });
  }
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [id, time] of received) if (now - time > 600_000) received.delete(id);
    while (recent.length && now - recent[0] >= 30_000) recent.shift();
    if (socket?.readyState === 1 && now - lastReceived > 240_000) socket.close();
    if (!status.connected || socket?.readyState !== 1 || !outgoing.length || recent.length >= 15) return;
    const message = outgoing.shift();
    const text = message.text.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 450);
    socket.send(`@reply-parent-msg-id=${message.id} PRIVMSG #${channel} :${text}`);
    recent.push(now);
  }, 2100);
  timer.unref();
  connect();
  return { status, stop() { stopped = true; clearTimeout(retry); clearInterval(timer); socket?.close(); } };
}
