import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReadinessClock } from '../public/action-readiness.js';

const search = until => ({ key: 'search', until });

test('avisa uma única vez no prazo, sem repetir em consultas e renders', () => {
  const clock = new ReadinessClock();
  assert.deepEqual(clock.observe('jogador', [search(30_000)], 0), []);
  assert.deepEqual(clock.observe('jogador', [search(30_000)], 29_999), []);
  assert.deepEqual(clock.observe('jogador', [search(30_000)], 30_000), [search(30_000)]);
  assert.deepEqual(clock.observe('jogador', [search(30_000)], 30_001), []);
  assert.deepEqual(clock.observe('jogador', [search(30_000)], 40_000), []);
});

test('abrir a página depois do prazo não dispara um aviso antigo', () => {
  const clock = new ReadinessClock();
  assert.deepEqual(clock.observe('jogador', [search(100)], 200), []);
  assert.deepEqual(clock.observe('jogador', [search(100)], 300), []);
});

test('novo prazo substitui o anterior e pode gerar outro aviso', () => {
  const clock = new ReadinessClock();
  clock.observe('jogador', [search(100)], 0);
  assert.deepEqual(clock.observe('jogador', [search(200)], 99), []);
  assert.deepEqual(clock.observe('jogador', [search(200)], 100), []);
  assert.deepEqual(clock.observe('jogador', [search(200)], 200), [search(200)]);
  clock.observe('jogador', [search(300)], 201);
  assert.equal(clock.observe('jogador', [search(300)], 300).length, 1);
});

test('trocar de canal ou jogador descarta avisos do perfil anterior', () => {
  const clock = new ReadinessClock();
  clock.observe('canal:ana', [search(100)], 0);
  assert.deepEqual(clock.observe('canal:beto', [search(100)], 101), []);
  clock.observe('canal:beto', [search(200)], 102);
  assert.equal(clock.observe('canal:beto', [search(200)], 200).length, 1);
});

test('ações removidas deixam de avisar; prazos simultâneos vêm no mesmo lote', () => {
  const clock = new ReadinessClock(), action = { key: 'action', until: 100 };
  clock.observe('jogador', [search(100), action], 0);
  clock.observe('jogador', [search(100)], 50);
  assert.deepEqual(clock.observe('jogador', [search(100)], 101), [search(100)]);
  const trial = { key: 'trial', until: 200 };
  clock.observe('jogador', [search(200), trial], 102);
  assert.deepEqual(clock.observe('jogador', [search(200), trial], 250), [search(200), trial]);
});

test('um prazo futuro observado antes de suspender a aba avisa uma vez ao voltar', () => {
  const clock = new ReadinessClock();
  clock.observe('jogador', [search(100)], 0);
  assert.deepEqual(clock.observe('jogador', [search(100)], 100_000), [search(100)]);
  assert.deepEqual(clock.observe('jogador', [search(100)], 100_001), []);
});
