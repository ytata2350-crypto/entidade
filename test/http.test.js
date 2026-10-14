/** @file Exercita o servidor real, autenticação da ponte e isolamento das sessões do navegador. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const testDirectory = mkdtempSync(join(tmpdir(), 'limiar-http-test-'));
const key = 'integration-test-key-with-at-least-32-characters';
let processHandle;
let base;
before(async () => {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((done) => reservation.close(done));
  base = `http://127.0.0.1:${port}`;
  processHandle = spawn(process.execPath, ['src/server.js'], { cwd: root,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1',
      DATABASE_PATH: join(testDirectory, 'test.sqlite'), BOT_API_KEY: key,
      TWITCH_BOT_ENABLED: '0', TWITCH_CHANNEL: 'testchannel', COMMAND_PREFIX: '!',
      EXPLORE_COOLDOWN_SECONDS: '600', DEMO_EXPLORE_COOLDOWN_SECONDS: '30' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((done, reject) => {
    const timer = setTimeout(() => reject(new Error('Servidor de testes não iniciou.')), 10000);
    processHandle.on('error', reject);
    processHandle.on('exit', (code) => { if (code) reject(new Error(`Servidor encerrou: ${code}`)); });
    processHandle.stdout.on('data', (chunk) => {
      if (String(chunk).includes('Entidade disponível')) { clearTimeout(timer); done(); }
    });
  });
});
after(async () => {
  if (processHandle && processHandle.exitCode === null) {
    const exited = once(processHandle, 'exit'); processHandle.kill(); await exited;
  }
  if (dirname(resolve(testDirectory)) !== resolve(tmpdir()) || !testDirectory.includes('limiar-http-test-')) {
    throw new Error('Diretório de limpeza inesperado.');
  }
  rmSync(testDirectory, { recursive: true, force: true });
});
const post = (path, body, headers = {}) => fetch(`${base}${path}`, { method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('comandos simultâneos e aliases concedem uma única recompensa durante a espera', async () => {
  const input={channel:'cooldownqa',playerId:'777',login:'viajante',displayName:'Viajante'};
  const replies=await Promise.all(['!vasculhar bosque','!explorar bosque','!vasculhar'].map(async (text,i)=>{
    const response=await post('/api/bot/command',{...input,text,messageId:`parallel-wait-${i}`},{Authorization:`Bearer ${key}`});
    return response.json();
  }));
  assert.equal(replies.filter(r=>r.ok).length,1);
  assert.ok(replies.filter(r=>!r.ok).every(r=>r.status===429));
  const snapshot=await (await fetch(`${base}/api/state?mode=live&channel=cooldownqa&player=viajante`)).json();
  assert.equal(snapshot.player.inventoryCount,1); assert.equal(snapshot.player.expeditions,1);
  assert.equal(snapshot.player.searchCooldownMs,600_000);
  assert.ok(snapshot.player.readyAt>snapshot.serverTime+590_000);
});

test('página e catálogo servem conteúdo real com headers de segurança', async () => {
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /A névoa <em>não espera/);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  const catalogue = await (await fetch(`${base}/api/catalogue`)).json();
  assert.equal(catalogue.regions.length, 6);
  assert.ok(catalogue.items.length > 20);
  assert.equal(catalogue.items[0].weight, undefined);
});

test('chave ausente e chave incorreta não permitem comandos do bot', async () => {
  const body = { channel: 'testchannel', playerId: '123', login: 'alice', displayName: 'Alice',
    messageId: 'http-unauthorized', text: '!explorar' };
  assert.equal((await post('/api/bot/command', body)).status, 401);
  assert.equal((await post('/api/bot/command', body, { Authorization: 'Bearer incorrect' })).status, 401);
  const state = await (await fetch(`${base}/api/state?mode=live&channel=testchannel&player=alice`)).json();
  assert.equal(state.player, null);
});

test('bot autenticado executa uma mensagem exatamente uma vez', async () => {
  const body = { channel: 'testchannel', playerId: '123', login: 'alice', displayName: 'Alice',
    messageId: 'http-authorized', text: '!explorar' };
  const first = await (await post('/api/bot/command', body, { Authorization: `Bearer ${key}` })).json();
  const second = await (await post('/api/bot/command', body, { Authorization: `Bearer ${key}` })).json();
  assert.equal(first.ok, true);
  assert.equal(second.duplicate, true);
  const state = await (await fetch(`${base}/api/state?mode=live&channel=testchannel&player=alice`)).json();
  assert.equal(state.player.inventoryCount, 1);
});

test('demonstração não aceita identidade do canal nem afeta outra sessão', async () => {
  const response = await fetch(`${base}/api/state`);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const before = await response.json();
  const result = await (await post('/api/demo/scenario', { tier: 5, channel: 'testchannel', playerId: '123' }, { Cookie: cookie })).json();
  assert.equal(result.player.equipment.tier, 5);
  const other = await (await fetch(`${base}/api/state`)).json();
  assert.equal(other.player.equipment.tier, 0);
  assert.equal(before.player.id, 'demo');
  const live = await (await fetch(`${base}/api/state?mode=live&channel=testchannel&player=alice`)).json();
  assert.equal(live.player.equipment.tier, 0);
});

test('escritas de outra origem são recusadas', async () => {
  const response = await post('/api/demo/scenario', { tier: 5 }, { Origin: 'https://evil.example' });
  assert.equal(response.status, 403);
});

test('mensagem autenticada com identificação incompleta é recusada sem criar jogador', async () => {
  const response = await post('/api/bot/command', { channel: 'testchannel', playerId: '888',
    displayName: 'Outro', text: '!explorar' }, { Authorization: `Bearer ${key}` });
  assert.equal(response.status, 400);
  const state = await (await fetch(`${base}/api/state?mode=live&channel=testchannel&player=outro`)).json();
  assert.equal(state.player, null);
});

test('JSON inválido, método inesperado e travessia de caminho são rejeitados', async () => {
  const invalid = await fetch(`${base}/api/demo/command`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: '{invalid' });
  assert.equal(invalid.status, 400);
  assert.equal((await fetch(base, { method: 'DELETE' })).status, 405);
  assert.equal((await fetch(`${base}/%2e%2e%2fsrc%2fserver.js`)).status, 404);
});
