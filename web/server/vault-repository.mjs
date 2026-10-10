import {validateEnvelope, validateRevision} from '../shared/envelope.mjs';
export function createVaultRepository(storage) {
  const sql = storage.sql;
  sql.exec('CREATE TABLE IF NOT EXISTS vault_versions (revision INTEGER PRIMARY KEY, saved_at TEXT NOT NULL, request_id TEXT NOT NULL UNIQUE)');
  sql.exec('CREATE TABLE IF NOT EXISTS vault_chunks (revision INTEGER NOT NULL, part INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (revision,part))');
  sql.exec('CREATE TABLE IF NOT EXISTS vault_archives (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, saved_at TEXT NOT NULL)');
  sql.exec('CREATE TABLE IF NOT EXISTS vault_archive_chunks (id TEXT NOT NULL, part INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (id,part))');
  const latest = () => sql.exec('SELECT revision,saved_at,request_id FROM vault_versions ORDER BY revision DESC LIMIT 1').toArray()[0];
  function read() {
    const head = latest(); if (!head) return {revision: 0, envelope: null};
    const parts = sql.exec('SELECT body FROM vault_chunks WHERE revision = ? ORDER BY part', head.revision).toArray();
    const envelope = validateEnvelope(JSON.parse(parts.map(x => x.body).join('')));
    return {revision: head.revision, savedAt: head.saved_at, envelope};
  }
  function validateWrite(input) {
    validateRevision(input?.revision); validateEnvelope(input?.envelope);
    if (typeof input.requestId !== 'string' || !/^[a-z0-9-]{36}$/i.test(input.requestId)) throw Error('Invalid request identifier.');
  }
  function writeCore(input) {
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
      // Reset archives are separate and are never pruned with ordinary revisions.
      sql.exec('DELETE FROM vault_chunks WHERE revision < ?', Math.max(0, revision - 2));
      sql.exec('DELETE FROM vault_versions WHERE revision < ?', Math.max(0, revision - 2));
      return {ok: true, revision, savedAt};
  }
  function write(input) { validateWrite(input); return storage.transactionSync(() => writeCore(input)); }
  function archiveAndWrite(input, authorize) {
    validateWrite(input);
    return storage.transactionSync(() => {
      const current = read(), permission = authorize(current);
      // Failed code attempts must commit too, so authorization returns errors rather than throwing.
      if (!permission.ok || permission.duplicate) return permission;
      if (current.revision !== input.revision || !current.envelope || current.envelope.salt === input.envelope.salt) throw Error('Vault changed before reset.');
      const id = input.requestId;
      sql.exec('INSERT INTO vault_archives VALUES (?,?,?)', id, current.revision, new Date().toISOString());
      sql.exec('INSERT INTO vault_archive_chunks SELECT ?,part,body FROM vault_chunks WHERE revision = ?', id, current.revision);
      return {...writeCore(input), archiveId: id};
    });
  }
  const archives = () => sql.exec('SELECT id,revision,saved_at AS savedAt FROM vault_archives ORDER BY saved_at DESC').toArray();
  function archive(id) {
    if (typeof id !== 'string' || !/^[a-z0-9-]{36}$/i.test(id)) throw Error('Invalid archive.');
    const row = sql.exec('SELECT id,revision,saved_at AS savedAt FROM vault_archives WHERE id = ?', id).toArray()[0];
    if (!row) throw Error('Archive not found.');
    return {...row, envelope: validateEnvelope(JSON.parse(sql.exec('SELECT body FROM vault_archive_chunks WHERE id = ? ORDER BY part', id).toArray().map(x=>x.body).join('')))};
  }
  return {read, write, archiveAndWrite, archives, archive};
}
