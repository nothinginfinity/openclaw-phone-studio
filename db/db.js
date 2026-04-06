const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

let db;
let activeDbPath = null;

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function isRecoverableFsError(error) {
  return ['EACCES', 'EPERM', 'ENOENT', 'EROFS'].includes(error?.code);
}

function getFallbackDbPath() {
  return path.resolve(process.cwd(), 'data', 'phone_studio.db');
}

function initDb({ dbPath, schemaPath }) {
  if (db) {
    return db;
  }

  try {
    ensureParentDir(dbPath);
    db = new Database(dbPath);
    activeDbPath = dbPath;
  } catch (error) {
    if (!isRecoverableFsError(error)) {
      throw error;
    }

    const fallbackDbPath = getFallbackDbPath();
    ensureParentDir(fallbackDbPath);
    db = new Database(fallbackDbPath);
    activeDbPath = fallbackDbPath;

    console.warn(
      `Primary DB path "${dbPath}" is unavailable (${error.code}). Falling back to "${fallbackDbPath}".`
    );
  }

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
  getActiveDbPath: () => activeDbPath,
  all,
  get,
  run
};
