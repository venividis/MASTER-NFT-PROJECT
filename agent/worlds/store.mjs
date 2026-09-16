import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const KINDS = ['players', 'towns', 'orders', 'creatures', 'resources', 'guestAccess'];
const json = value => JSON.stringify(value);
const base = state => Object.fromEntries(Object.entries(state).filter(([key]) => !KINDS.includes(key)));

// Entity rows and the exact command receipt commit together. SQLite's WAL is
// recovered before reads; FULL sync makes a successful HTTP acknowledgement a
// durable commit, including after the server process is killed.
export class WorldStore {
  constructor(stateDir, initial, { historyLimit = 2048 } = {}) {
    this.db = new DatabaseSync(path.join(stateDir, 'world.sqlite'));
    fs.chmodSync(path.join(stateDir, 'world.sqlite'), 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS entities (kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS revisions (revision INTEGER PRIMARY KEY, delta TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS commands (identity TEXT NOT NULL, command_id TEXT NOT NULL, request_hash TEXT NOT NULL, receipt TEXT NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY(identity,command_id));
      CREATE INDEX IF NOT EXISTS command_revision ON commands(revision);`);
    this.historyLimit = historyLimit;
    this.revision = Number(this.db.prepare('SELECT value FROM meta WHERE key=?').get('revision')?.value || 0);
    this.previous = this.load();
    if (!this.previous) this.commit(typeof initial === 'function' ? initial() : initial);
    if (this.db.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw Error('World database integrity check failed. Restore a verified backup.');
  }
  load() {
    const stored = this.db.prepare('SELECT value FROM meta WHERE key=?').get('world');
    if (!stored) return null;
    const state = JSON.parse(stored.value);
    for (const kind of KINDS) state[kind] = {};
    for (const row of this.db.prepare('SELECT kind,id,value FROM entities ORDER BY kind,id').all()) state[row.kind][row.id] = JSON.parse(row.value);
    return state;
  }
  command(identity, id) {
    const row = this.db.prepare('SELECT request_hash,receipt,revision FROM commands WHERE identity=? AND command_id=?').get(identity, id);
    return row ? { requestHash: row.request_hash, receipt: JSON.parse(row.receipt), revision: row.revision } : null;
  }
  commit(next, command) {
    const revision = this.revision + 1;
    const delta = { revision, previousRevision: this.revision, base: base(next), upsert: {}, remove: {} };
    const changes = [];
    for (const kind of KINDS) {
      const old = this.previous?.[kind] || {}, current = next[kind] || {};
      for (const [id, value] of Object.entries(current)) if (json(value) !== json(old[id])) {
        changes.push([kind, id, json(value)]);
        if (kind !== 'guestAccess') (delta.upsert[kind] ||= {})[id] = value;
      }
      for (const id of Object.keys(old)) if (!(id in current)) {
        changes.push([kind, id, null]);
        if (kind !== 'guestAccess') (delta.remove[kind] ||= []).push(id);
      }
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current = Number(this.db.prepare('SELECT value FROM meta WHERE key=?').get('revision')?.value || 0);
      if (current !== this.revision) throw Error('Another writer changed this world. Restart the single world authority.');
      const put = this.db.prepare('INSERT INTO entities(kind,id,value,revision) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value,revision=excluded.revision');
      const remove = this.db.prepare('DELETE FROM entities WHERE kind=? AND id=?');
      for (const [kind,id,value] of changes) value === null ? remove.run(kind,id) : put.run(kind,id,value,revision);
      const meta = this.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
      meta.run('world', json(base(next))); meta.run('revision', String(revision));
      this.db.prepare('INSERT INTO revisions VALUES(?,?)').run(revision, json(delta));
      this.db.prepare('DELETE FROM revisions WHERE revision<=?').run(revision-this.historyLimit);
      if (command) this.db.prepare('INSERT INTO commands VALUES(?,?,?,?,?)').run(command.identity,command.id,command.requestHash,json(command.receipt),revision);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    this.previous = structuredClone(next); this.revision = revision;
    return delta;
  }
  changes(since, limit = 128) {
    if (!Number.isSafeInteger(since) || since < 0 || since > this.revision) throw Error('Invalid world revision.');
    const oldest = this.db.prepare('SELECT min(revision) AS revision FROM revisions').get().revision;
    if (oldest && since < oldest - 1) return { reset: true, revision: this.revision, deltas: [] };
    const rows = this.db.prepare('SELECT delta FROM revisions WHERE revision>? ORDER BY revision LIMIT ?').all(since, Math.min(128,Math.max(1,limit)));
    const deltas = rows.map(row => JSON.parse(row.delta));
    return { reset: false, revision: this.revision, deltas, more: (deltas.at(-1)?.revision ?? since) < this.revision };
  }
  page(kind, cursor = '', limit = 64) {
    if (!KINDS.includes(kind) || kind === 'guestAccess') throw Error('Unknown public entity collection.');
    if (typeof cursor !== 'string' || cursor.length > 200 || !Number.isSafeInteger(limit) || limit < 1 || limit > 128) throw Error('Invalid page bounds.');
    const rows = this.db.prepare('SELECT id,value,revision FROM entities WHERE kind=? AND id>? ORDER BY id LIMIT ?').all(kind,cursor,limit+1);
    const more = rows.length > limit; if (more) rows.pop();
    return { revision: this.revision, kind, entities: Object.fromEntries(rows.map(row=>[row.id,JSON.parse(row.value)])), entityRevisions: Object.fromEntries(rows.map(row=>[row.id,row.revision])), nextCursor: more ? rows.at(-1).id : null };
  }
  close() { this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); this.db.close(); }
}
