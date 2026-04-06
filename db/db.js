const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

let db;

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function initDb({ dbPath, schemaPath }) {
  if (db) {
    return db;
  }

  ensureParentDir(dbPath);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
  return db;
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized.');
  }

  return db;
}

function all(sql, params = {}) {
  return getDb().prepare(sql).all(params);
}

function get(sql, params = {}) {
  return getDb().prepare(sql).get(params);
}

function run(sql, params = {}) {
  return getDb().prepare(sql).run(params);
}

module.exports = {
  initDb,
  getDb,
  all,
  get,
  run
};
