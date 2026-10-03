import {validateEnvelope, validateRevision} from '../shared/envelope.mjs';
export function createVaultRepository(storage) {
  const sql = storage.sql;
  sql.exec('CREATE TABLE IF NOT EXISTS vault_versions (revision INTEGER PRIMARY KEY, saved_at TEXT NOT NULL, request_id TEXT NOT NULL UNIQUE)');
  sql.exec('CREATE TABLE IF NOT EXISTS vault_chunks (revision INTEGER NOT NULL, part INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (revision,part))');
  const latest = () => sql.exec('SELECT revision,saved_at,request_id FROM vault_versions ORDER BY revision DESC LIMIT 1').toArray()[0];
  function read() {
    const head = latest(); if (!head) return {revision: 0, envelope: null};
    const parts = sql.exec('SELECT body FROM vault_chunks WHERE revision = ? ORDER BY part', head.revision).toArray();
    const envelope = validateEnvelope(JSON.parse(parts.map(x => x.body).join('')));
    return {revision: head.revision, savedAt: head.saved_at, envelope};
  }
  function write(input) {
    validateRevision(input?.revision); validateEnvelope(input?.envelope);
    if (typeof input.requestId !== 'string' || !/^[a-z0-9-]{36}$/i.test(input.requestId)) throw Error('Invalid request identifier.');
    return storage.transactionSync(() => {
      const head = latest(), current = head?.revision || 0;
      const duplicate = sql.exec('SELECT revision FROM vault_versions WHERE request_id = ?', input.requestId).toArray()[0];
      if (duplicate) {
        const stored = sql.exec('SELECT body FROM vault_chunks WHERE revision = ? ORDER BY part', duplicate.revision).toArray().map(x => x.body).join('');
        if (duplicate.revision !== input.revision + 1 || stored !== JSON.stringify(input.envelope)) throw Error('A request identifier cannot be reused for different data.');
        return {ok: true, revision: duplicate.revision, currentRevision: current, duplicate: true};
      }
      if (input.revision !== current) return {ok: false, conflict: true, revision: current};
      const revision = current + 1, text = JSON.stringify(input.envelope), savedAt = new Date().toISOString();
      sql.exec('INSERT INTO vault_versions VALUES (?,?,?)', revision, savedAt, input.requestId);
      for (let start = 0, part = 0; start < text.length; start += 65536, part++) sql.exec('INSERT INTO vault_chunks VALUES (?,?,?)', revision, part, text.slice(start, start + 65536));
      // Keep the current version and two encrypted recovery copies. No destructive reset endpoint.
      sql.exec('DELETE FROM vault_chunks WHERE revision < ?', Math.max(0, revision - 2));
      sql.exec('DELETE FROM vault_versions WHERE revision < ?', Math.max(0, revision - 2));
      return {ok: true, revision, savedAt};
    });
  }
  return {read, write};
}
