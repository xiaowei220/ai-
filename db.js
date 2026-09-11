// ============================================================
// db.js — SQLite 数据库层（使用 Node 24 内置 node:sqlite，零外部依赖）
// AI 硬件架构师 · Blueprint.clone 全栈版
// ============================================================
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = path.join(DATA_DIR, 'blueprint.db');
export const db = new DatabaseSync(DB_PATH);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 生成历史表（原 localStorage 迁到数据库，全局共享）
CREATE TABLE IF NOT EXISTS history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_name TEXT NOT NULL,
  date         TEXT NOT NULL,
  messages     TEXT NOT NULL,   -- JSON: 聊天记录数组
  parsed_data  TEXT NOT NULL,   -- JSON: 完整生成结果
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_time ON history(created_at);

-- 会话表（后台管理员）
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'admin',
  expires_at INTEGER NOT NULL
);

-- 系统设置（后台可改）
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- 后台管理员
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

-- 操作日志
CREATE TABLE IF NOT EXISTS logs (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  type   TEXT NOT NULL,
  detail TEXT NOT NULL,
  ts     INTEGER NOT NULL
);
`);

// ============================================================
// 种子数据（首次运行写入默认值）
// ============================================================
export function seed() {
  const now = Date.now();

  // 默认设置
  const defaults = {
    site_title: 'AI 硬件架构师',        // 站点名称
    site_desc: 'Blueprint.clone 全栈版', // 站点副标题
  };
  const insSet = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
  for (const [k, v] of Object.entries(defaults)) insSet.run(k, String(v));

  // 默认管理员 admin / admin123（登录后请到后台尽快修改密码）
  const adm = db.prepare('SELECT id FROM admins WHERE username=?').get('admin');
  if (!adm) {
    db.prepare('INSERT INTO admins(username,password_hash,created_at) VALUES(?,?,?)')
      .run('admin', hashPassword('admin123'), now);
    console.log('[DB] 已创建默认管理员 admin / admin123');
  }
}

// ============================================================
// 密码哈希（scrypt + 盐）
// ============================================================
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(pw, stored) {
  try {
    const [salt, hash] = String(stored).split(':');
    const test = crypto.scryptSync(String(pw), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
  } catch { return false; }
}

// ============================================================
// 操作日志
// ============================================================
export function addLog(type, detail) {
  try {
    db.prepare('INSERT INTO logs(type,detail,ts) VALUES(?,?,?)').run(type, detail, Date.now());
  } catch (e) { console.error('log error', e); }
}

// 初始化为幂等操作
seed();
