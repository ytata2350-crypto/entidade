/**
 * @file Servidor independente da Entidade, usando apenas bibliotecas nativas do Node.
 * Demonstrações usam cookies opacos; comandos reais exigem uma chave de serviço no header.
 */
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { createGame, GameError } from './game.js';
import { getCatalogue } from './catalogue.js';
import { startTwitchBot } from './twitch-bot.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const publicDir = resolve(ROOT, 'public');
const port = Number(process.env.PORT || 3210);
const host = process.env.HOST || '127.0.0.1';
const apiKey = process.env.BOT_API_KEY || '';
const defaultChannel = (process.env.TWITCH_CHANNEL || '').toLowerCase();
const prefix = process.env.COMMAND_PREFIX || '!';
const cooldownSeconds = Number(process.env.EXPLORE_COOLDOWN_SECONDS || 600);
const demoCooldownSeconds = Number(process.env.DEMO_EXPLORE_COOLDOWN_SECONDS || 30);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválida.');
if (!['!', '$'].includes(prefix)) throw new Error('COMMAND_PREFIX precisa ser ! ou $.');
if (!Number.isInteger(cooldownSeconds) || cooldownSeconds < 30 || cooldownSeconds > 86400) {
  throw new Error('EXPLORE_COOLDOWN_SECONDS precisa estar entre 30 e 86400.');
}
if (!Number.isInteger(demoCooldownSeconds) || demoCooldownSeconds < 10 || demoCooldownSeconds > 600) {
  throw new Error('DEMO_EXPLORE_COOLDOWN_SECONDS precisa estar entre 10 e 600.');
}
if (apiKey && apiKey.length < 32) throw new Error('BOT_API_KEY precisa ter pelo menos 32 caracteres.');
if (defaultChannel && !/^[a-z0-9_]{3,25}$/.test(defaultChannel)) throw new Error('TWITCH_CHANNEL inválido.');
const store = createStore(resolve(ROOT, process.env.DATABASE_PATH || 'data/limiar.sqlite'));
const game = createGame(store, { cooldownMs: cooldownSeconds * 1000, demoCooldownMs: demoCooldownSeconds * 1000, prefix });
const bot = startTwitchBot({ game, prefix, enabled: process.env.TWITCH_BOT_ENABLED === '1',
  username: (process.env.TWITCH_BOT_USERNAME || '').toLowerCase(), oauth: process.env.TWITCH_BOT_OAUTH,
  channel: defaultChannel });
let lastBotEventAt = 0;
const rateLimits = new Map();
const SESSION_TTL = 30 * 86400_000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function requireOrigin(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new GameError('Origem não autorizada.', 403);
  if (req.headers.origin) {
    let origin;
    try { origin = new URL(req.headers.origin); } catch { throw new GameError('Origem inválida.', 403); }
    if (origin.host !== req.headers.host) throw new GameError('Origem não autorizada.', 403);
  }
}

function limit(req, route, maximum) {
  const key = `${req.socket.remoteAddress}:${route}`;
  let entry = rateLimits.get(key);
  if (!entry || entry.until < Date.now()) entry = { count: 0, until: Date.now() + 60_000 };
  entry.count++;
  rateLimits.set(key, entry);
  if (entry.count > maximum) throw new GameError('Muitas requisições. Aguarde um minuto.', 429);
}

async function readBody(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
    throw new GameError('Envie o corpo como application/json.', 415);
  }
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 8192) throw new GameError('Requisição muito grande.', 413);
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new GameError('JSON inválido.'); }
}

function session(req, res) {
  const candidate = String(req.headers.cookie || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith('limiar_demo='))?.slice('limiar_demo='.length);
  if (/^[a-f0-9]{40}$/.test(candidate || '') && store.db.prepare('SELECT id FROM sessions WHERE id = ? AND expires_at > ?')
    .get(candidate, Date.now())) return candidate;
  const id = randomBytes(20).toString('hex');
  store.db.prepare('INSERT INTO sessions(id, expires_at) VALUES (?, ?)').run(id, Date.now() + SESSION_TTL);
  const secure = req.socket.encrypted || process.env.PUBLIC_URL?.startsWith('https:');
  res.setHeader('Set-Cookie', `limiar_demo=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL / 1000}${secure ? '; Secure' : ''}`);
  return id;
}

function requireBot(req) {
  if (!apiKey) throw new GameError('Integração desativada. Configure BOT_API_KEY no projeta Entidade.', 503);
  const provided = String(req.headers.authorization || '').replace(/^Bearer /, '');
  const a = Buffer.from(provided);
  const b = Buffer.from(apiKey);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new GameError('Chave de integração inválida.', 401);
}

const server = createServer(async (req, res) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'POST') requireOrigin(req);
    if (url.pathname === '/api/catalogue' && req.method === 'GET') return send(res, 200, getCatalogue());
    if (url.pathname === '/api/health' && req.method === 'GET') return send(res, 200, { ok: true, project: 'limiar' });
    if (url.pathname === '/api/state' && req.method === 'GET') {
      limit(req, 'state', 180);
      const mode = url.searchParams.get('mode') === 'live' ? 'live' : 'demo';
      let state;
      let channel;
      if (mode === 'demo') {
        const id = session(req, res);
        state = game.startDemo(id);
        channel = 'demonstração';
      } else {
        channel = (url.searchParams.get('channel') || defaultChannel).toLowerCase();
        if (!/^[a-z0-9_]{3,25}$/.test(channel)) throw new GameError('Informe um canal válido.');
        const login = String(url.searchParams.get('player') || '').toLowerCase();
        const playerId = game.findPlayer(channel, login) || '';
        state = game.getState(channel, playerId);
      }
      return send(res, 200, { ...state, mode, channel, defaultChannel, cooldownSeconds, demoCooldownSeconds,
        integration: { configured: Boolean(apiKey), ...bot.status, lastEventAt: lastBotEventAt } });
    }
    if (url.pathname === '/api/demo/command' && req.method === 'POST') {
      limit(req, 'demo', 60);
      const body = await readBody(req);
      const id = session(req, res);
      const result = game.execute({ channel: `demo:${id}`, playerId: 'demo', login: 'explorador',
        displayName: 'Você', messageId: body.messageId || randomBytes(16).toString('hex'), text: body.text }, { isDemo: true });
      if (!result) throw new GameError('Comando desconhecido. Consulte o manual.');
      return send(res, 200, { ...result, state: game.getState(`demo:${id}`, 'demo') });
    }
    if (url.pathname === '/api/demo/scenario' && req.method === 'POST') {
      limit(req, 'demo', 60);
      const body = await readBody(req);
      return send(res, 200, game.setDemoScenario(session(req, res), body.tier));
    }
    if (url.pathname === '/api/bot/command' && req.method === 'POST') {
      requireBot(req);
      limit(req, 'bot', 600);
      const input = await readBody(req);
      if (typeof input.channel !== 'string' || !/^[a-z0-9_]{3,25}$/.test(input.channel)) throw new GameError('Canal inválido.');
      const result = game.execute(input);
      if (!result) throw new GameError('Comando desconhecido.');
      lastBotEventAt = Date.now();
      return send(res, 200, result);
    }
    if (url.pathname.startsWith('/api/')) throw new GameError('Rota não encontrada.', 404);
    if (!['GET', 'HEAD'].includes(req.method)) throw new GameError('Método não permitido.', 405);
    const pathname = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const path = resolve(publicDir, pathname);
    if (!path.startsWith(publicDir + sep) || !MIME[extname(path)]) throw new GameError('Arquivo não encontrado.', 404);
    let content;
    try { content = await readFile(path); } catch { throw new GameError('Arquivo não encontrado.', 404); }
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (!res.headersSent) send(res, error instanceof GameError ? error.status : 500,
      { error: error instanceof GameError ? error.message : 'Não foi possível concluir a operação.' });
    else res.end();
    if (!(error instanceof GameError)) console.error('Falha no jogo Entidade:', error.message);
  }
});

const cleanup = setInterval(() => {
  const now = Date.now();
  store.transaction(() => {
    const expired = store.db.prepare('SELECT id FROM sessions WHERE expires_at <= ?').all(now);
    for (const { id } of expired) {
      const channel = `demo:${id}`;
      store.db.prepare('DELETE FROM players WHERE channel = ?').run(channel);
      store.db.prepare('DELETE FROM events WHERE channel = ?').run(channel);
      store.db.prepare('DELETE FROM receipts WHERE channel = ?').run(channel);
    }
    store.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    store.db.prepare('DELETE FROM receipts WHERE created_at < ?').run(now - 7 * 86400_000);
    store.db.prepare('DELETE FROM events WHERE created_at < ?').run(now - 30 * 86400_000);
  });
  for (const [key, entry] of rateLimits) if (entry.until < now) rateLimits.delete(key);
}, 60_000);
cleanup.unref();

server.listen(port, host, () => console.log(`Entidade disponível em http://${host}:${port}`));
function shutdown() {
  clearInterval(cleanup); bot.stop(); server.close(() => { store.close(); process.exit(0); });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
