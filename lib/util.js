// ============================================================
// lib/util.js — 通用工具函数
// AI 硬件架构师 · Blueprint.clone 全栈版
// ============================================================
import crypto from 'node:crypto';
import { db } from '../db.js';

export const now = () => Date.now();

export function genToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 读取 JSON 请求体（限制 2MB，历史记录可能含大段说明书）
export function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2 * 1024 * 1024) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

export function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

export const ok = (res, data = {}) => sendJson(res, 200, { ok: true, ...data });
export const fail = (res, error, code = 400) => sendJson(res, code, { ok: false, error });

export function getSetting(key, def) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  if (!row) return def;
  const v = row.value;
  if (typeof def === 'number' && v !== '' && !isNaN(Number(v))) return Number(v);
  return v;
}

export function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(key, String(value));
}
