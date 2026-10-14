/**
 * @file Persistência própria do jogo, sem ler tabelas ou dados do site original.
 * Cada canal e demonstração têm jogadores, inventários e recibos isolados.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

/** @param {string} path @returns {object} Conexão e transações síncronas. */
export function createStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS players (
      channel TEXT NOT NULL, player_id TEXT NOT NULL, login TEXT NOT NULL, display_name TEXT NOT NULL,
      coins INTEGER NOT NULL DEFAULT 0 CHECK(coins >= 0), xp INTEGER NOT NULL DEFAULT 0,
      owned_tier INTEGER NOT NULL DEFAULT 0, equipped_tier INTEGER NOT NULL DEFAULT 0,
      backpack INTEGER NOT NULL DEFAULT 0, expeditions INTEGER NOT NULL DEFAULT 0,
      escapes INTEGER NOT NULL DEFAULT 0, ready_at INTEGER NOT NULL DEFAULT 0,
      region TEXT NOT NULL DEFAULT 'bosque', created_at INTEGER NOT NULL,
      PRIMARY KEY(channel, player_id)
    );
    CREATE INDEX IF NOT EXISTS idx_players_login ON players(channel, login);
    CREATE TABLE IF NOT EXISTS inventory (
      channel TEXT NOT NULL, player_id TEXT NOT NULL, item_id TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity >= 0),
      PRIMARY KEY(channel, player_id, item_id),
      FOREIGN KEY(channel, player_id) REFERENCES players(channel, player_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS discoveries (
      channel TEXT NOT NULL, player_id TEXT NOT NULL, item_id TEXT NOT NULL,
      PRIMARY KEY(channel, player_id, item_id),
      FOREIGN KEY(channel, player_id) REFERENCES players(channel, player_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY, channel TEXT NOT NULL, player_id TEXT NOT NULL, display_name TEXT NOT NULL,
      kind TEXT NOT NULL, item_id TEXT, text TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_channel ON events(channel, created_at DESC);
    CREATE TABLE IF NOT EXISTS receipts (
      channel TEXT NOT NULL, message_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
      response TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(channel, message_id)
    );
    CREATE INDEX IF NOT EXISTS idx_receipts_age ON receipts(created_at);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
  `);
  // A primeira versão usava o índice de seis ferramentas. Preserva os IDs antigos ao inserir novas picaretas.
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version < 2) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const columns = db.prepare('PRAGMA table_info(events)').all();
      if (!columns.some((column) => column.name === 'drops_json')) {
        db.exec("ALTER TABLE events ADD COLUMN drops_json TEXT NOT NULL DEFAULT '[]'");
      }
      db.exec(`UPDATE players SET
        owned_tier = CASE owned_tier WHEN 3 THEN 4 WHEN 4 THEN 6 WHEN 5 THEN 8 ELSE owned_tier END,
        equipped_tier = CASE equipped_tier WHEN 3 THEN 4 WHEN 4 THEN 6 WHEN 5 THEN 8 ELSE equipped_tier END;
        PRAGMA user_version = 2;
        COMMIT;`);
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  if (version < 3) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const columns = db.prepare('PRAGMA table_info(players)').all();
      if (!columns.some((column) => column.name === 'fortune_level')) {
        db.exec('ALTER TABLE players ADD COLUMN fortune_level INTEGER NOT NULL DEFAULT 0');
      }
      if (!columns.some((column) => column.name === 'light_level')) {
        db.exec('ALTER TABLE players ADD COLUMN light_level INTEGER NOT NULL DEFAULT 0');
      }
      db.exec('PRAGMA user_version = 3; COMMIT;');
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  // v4: provas em grupo, talentos e um novo catálogo de achados (o antigo, de mineração, deixa de existir).
  if (version < 4) {
    // Guarda uma cópia do banco antigo antes de trocar o catálogo (só quando já existe jogo salvo).
    if (path !== ':memory:' && existsSync(path) && db.prepare('SELECT COUNT(*) AS total FROM players').get().total > 0) {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      copyFileSync(path, `${path}.v3.bak`);
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      const columns = db.prepare('PRAGMA table_info(players)').all().map((column) => column.name);
      if (!columns.includes('talents_json')) db.exec("ALTER TABLE players ADD COLUMN talents_json TEXT NOT NULL DEFAULT '[]'");
      if (!columns.includes('equipped_talents')) db.exec("ALTER TABLE players ADD COLUMN equipped_talents TEXT NOT NULL DEFAULT '[]'");
      if (!columns.includes('trials')) db.exec('ALTER TABLE players ADD COLUMN trials INTEGER NOT NULL DEFAULT 0');
      if (!columns.includes('trial_deaths')) db.exec('ALTER TABLE players ADD COLUMN trial_deaths INTEGER NOT NULL DEFAULT 0');
      // Itens e regiões antigos não existem mais: o inventário e as descobertas são zerados; XP, Brasas e nível ficam.
      const reset = version < 4 && db.prepare('SELECT COUNT(*) AS total FROM players').get().total > 0;
      if (reset) {
        db.exec(`DELETE FROM inventory; DELETE FROM discoveries; DELETE FROM events; DELETE FROM receipts;
          UPDATE players SET region = 'bosque', fortune_level = 0;`);
      }
      db.exec('PRAGMA user_version = 4; COMMIT;');
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  if (version < 5) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const columns = db.prepare('PRAGMA table_info(players)').all();
      if (!columns.some(column => column.name === 'search_wait_ms')) db.exec('ALTER TABLE players ADD COLUMN search_wait_ms INTEGER NOT NULL DEFAULT 0');
      db.exec('PRAGMA user_version = 5; COMMIT;');
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS trials (
      id INTEGER PRIMARY KEY, channel TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('lobby', 'running', 'ended')),
      data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_trials_active ON trials(channel) WHERE status IN ('lobby', 'running');
    CREATE INDEX IF NOT EXISTS idx_trials_channel ON trials(channel, id DESC);
  `);
  return {
    db,
    transaction(fn) {
      db.exec('BEGIN IMMEDIATE');
      try { const result = fn(); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    close() { db.close(); },
  };
}
