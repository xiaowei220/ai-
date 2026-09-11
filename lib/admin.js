// ============================================================
// lib/admin.js — 后台管理 API（管理员）
// AI 硬件架构师 · Blueprint.clone 全栈版
// ============================================================
import { db, addLog, verifyPassword, hashPassword } from '../db.js';
import { now, genToken, readBody, ok, fail, setSetting } from './util.js';

const ADMIN_TTL = 12 * 3600 * 1000; // 管理员会话 12 小时

function tokenFromReq(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

function adminFromReq(req) {
  const token = tokenFromReq(req);
  if (!token) return null;
  const row = db.prepare(
    'SELECT s.user_id, s.role FROM sessions s WHERE s.token=? AND s.expires_at > ?'
  ).get(token, now());
  if (!row || row.role !== 'admin') return null;
  return { uid: row.user_id };
}

function requireAdmin(req, res) {
  const a = adminFromReq(req);
  if (!a) { fail(res, '管理员未登录', 401); return null; }
  return a;
}

export async function handleAdminApi(req, res, pathname) {
  const method = req.method;
  if (method === 'OPTIONS') return ok(res);
  if (method !== 'GET' && method !== 'POST') return fail(res, 'method not allowed', 405);

  let body = {};
  if (method === 'POST') {
    try { body = await readBody(req); } catch { return fail(res, '请求体格式错误'); }
  }

  try {
    // 公开：登录
    if (pathname === '/api/admin/login' && method === 'POST') return adminLogin(res, body);

    const admin = requireAdmin(req, res);
    if (!admin) return;

    switch (pathname) {
      case '/api/admin/logout': {
        const t = tokenFromReq(req);
        if (t) db.prepare('DELETE FROM sessions WHERE token=?').run(t);
        return ok(res);
      }
      case '/api/admin/stats': return adminStats(res);
      case '/api/admin/history': return adminHistory(res, body);
      case '/api/admin/settings': return method === 'GET' ? adminSettings(res) : adminSetSettings(res, body);
      case '/api/admin/logs': return adminLogs(res, body);
      case '/api/admin/password': return adminPassword(res, admin, body);
    }

    // ---------- 带路径参数的接口 ----------
    let m;
    if ((m = pathname.match(/^\/api\/admin\/history\/(\d+)$/)) && method === 'GET') return adminHistoryDetail(res, Number(m[1]));
    if ((m = pathname.match(/^\/api\/admin\/history\/(\d+)$/)) && method === 'POST') return adminHistoryDelete(res, Number(m[1]));

    return fail(res, '接口不存在', 404);
  } catch (e) {
    console.error('[admin]', pathname, e);
    return fail(res, '服务器内部错误', 500);
  }
}

// ============================================================
function adminLogin(res, body) {
  const rawUser = String(body.username || '').trim();
  const username = rawUser.toLowerCase();
  const password = String(body.password || '').trim();
  const adm = db.prepare('SELECT * FROM admins WHERE lower(username)=?').get(username);
  if (!adm || !verifyPassword(password, adm.password_hash)) {
    addLog('admin_login_fail', `尝试账号: "${rawUser.slice(0, 20)}"`);
    return fail(res, '账号或密码错误', 401);
  }

  const token = genToken();
  db.prepare('INSERT INTO sessions(token,user_id,role,expires_at) VALUES(?,?,?,?)')
    .run(token, `admin:${adm.id}`, 'admin', now() + ADMIN_TTL);
  addLog('admin_login', username);
  return ok(res, { token, username });
}

function adminPassword(res, admin, body) {
  const oldPw = String(body.old || '');
  const newPw = String(body.new_ || '');
  if (!newPw || newPw.length < 6) return fail(res, '新密码至少 6 位');
  const id = admin.uid.replace('admin:', '');
  const adm = db.prepare('SELECT * FROM admins WHERE id=?').get(Number(id));
  if (!adm || !verifyPassword(oldPw, adm.password_hash)) return fail(res, '原密码错误');
  db.prepare('UPDATE admins SET password_hash=? WHERE id=?').run(hashPassword(newPw), adm.id);
  addLog('admin_password', adm.username);
  return ok(res, { msg: '密码已修改' });
}

// ============================================================
// 数据看板
// ============================================================
function adminStats(res) {
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const dayTs = dayStart.getTime();
  const totalProjects = db.prepare('SELECT COUNT(*) c FROM history').get().c;
  const projectsToday = db.prepare('SELECT COUNT(*) c FROM history WHERE created_at>=?').get(dayTs).c;

  // BOM 成本统计（从 parsed_data 中提取 total_estimated_price）
  let bomTotal = 0, bomCount = 0;
  const rows = db.prepare('SELECT parsed_data FROM history').all();
  for (const r of rows) {
    try {
      const p = JSON.parse(r.parsed_data);
      const price = Number(p?.bom?.total_estimated_price);
      if (Number.isFinite(price)) { bomTotal += price; bomCount++; }
    } catch {}
  }

  const recent = db.prepare('SELECT id, project_name, date, created_at FROM history ORDER BY id DESC LIMIT 8').all();
  return ok(res, {
    totalProjects, projectsToday, bomCount,
    bomTotal: Math.round(bomTotal * 100) / 100,
    bomAvg: bomCount ? Math.round((bomTotal / bomCount) * 100) / 100 : 0,
    recent,
  });
}

// ============================================================
// 历史记录管理
// ============================================================
function rowBrief(row) {
  let nodes = 0, bomItems = 0, cost = null;
  try {
    const p = JSON.parse(row.parsed_data);
    nodes = Array.isArray(p?.circuit?.nodes) ? p.circuit.nodes.length : 0;
    bomItems = Array.isArray(p?.bom?.items) ? p.bom.items.length : 0;
    const price = Number(p?.bom?.total_estimated_price);
    if (Number.isFinite(price)) cost = price;
  } catch {}
  return { ...row, nodes, bomItems, cost };
}

function adminHistory(res, body) {
  const q = String(body.q || '').trim();
  const limit = Math.min(200, Math.max(1, Number(body.limit) || 50));
  const offset = Math.max(0, Number(body.offset) || 0);
  let rows, total;
  if (q) {
    rows = db.prepare('SELECT * FROM history WHERE project_name LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?')
      .all(`%${q}%`, limit, offset);
    total = db.prepare('SELECT COUNT(*) c FROM history WHERE project_name LIKE ?').get(`%${q}%`).c;
  } else {
    rows = db.prepare('SELECT * FROM history ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset);
    total = db.prepare('SELECT COUNT(*) c FROM history').get().c;
  }
  return ok(res, { history: rows.map(rowBrief), total });
}

function adminHistoryDetail(res, id) {
  const row = db.prepare('SELECT * FROM history WHERE id=?').get(id);
  if (!row) return fail(res, '记录不存在', 404);
  return ok(res, {
    item: {
      ...rowBrief(row),
      messages: JSON.parse(row.messages),
      parsed_data: JSON.parse(row.parsed_data),
    },
  });
}

function adminHistoryDelete(res, id) {
  const row = db.prepare('SELECT * FROM history WHERE id=?').get(id);
  if (!row) return fail(res, '记录不存在', 404);
  db.prepare('DELETE FROM history WHERE id=?').run(id);
  addLog('admin_history_delete', `#${id} ${row.project_name}`);
  return ok(res, { msg: '记录已删除' });
}

// ============================================================
// 系统设置
// ============================================================
function adminSettings(res) {
  const rows = db.prepare('SELECT key,value FROM settings').all();
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return ok(res, { settings: map });
}

// POST /api/admin/settings {settings: {key: value, ...}}
function adminSetSettings(res, body) {
  const obj = body.settings || body;
  let count = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v !== 'string' && typeof v !== 'number') continue;
    setSetting(k, v);
    count++;
  }
  addLog('admin_settings', JSON.stringify(obj));
  return ok(res, { msg: `已保存 ${count} 项设置` });
}

// ============================================================
// 操作日志
// ============================================================
function adminLogs(res, body) {
  const limit = Math.min(500, Math.max(1, Number(body.limit) || 100));
  return ok(res, { logs: db.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT ?').all(limit) });
}
