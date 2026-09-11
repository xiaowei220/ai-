// ============================================================
// lib/api.js — 前台 API（历史记录 CRUD，替代原 localStorage）
// AI 硬件架构师 · Blueprint.clone 全栈版
// ============================================================
import { db, addLog } from '../db.js';
import { now, readBody, ok, fail } from './util.js';

// 数据库行 → 原版前端 state 形状（HistoryModal 组件零改动）
function rowToItem(row) {
  return {
    id: row.id,
    date: row.date,
    projectName: row.project_name,
    messages: JSON.parse(row.messages),
    parsedData: JSON.parse(row.parsed_data),
  };
}

export async function handleApi(req, res, pathname) {
  const method = req.method;
  if (method === 'OPTIONS') return ok(res);
  if (method !== 'GET' && method !== 'POST' && method !== 'DELETE') {
    return fail(res, 'method not allowed', 405);
  }

  try {
    // ---------- 历史记录列表 ----------
    if (pathname === '/api/history' && method === 'GET') {
      const rows = db.prepare('SELECT * FROM history ORDER BY id DESC LIMIT 500').all();
      return ok(res, { history: rows.map(rowToItem) });
    }

    // ---------- 新增历史记录 ----------
    if (pathname === '/api/history' && method === 'POST') {
      let body;
      try { body = await readBody(req); } catch { return fail(res, '请求体格式错误'); }

      const projectName = String(body.projectName || '').trim();
      if (!projectName) return fail(res, '缺少项目名称');
      if (!Array.isArray(body.messages)) return fail(res, 'messages 格式错误');
      if (typeof body.parsedData !== 'object' || body.parsedData === null) return fail(res, 'parsedData 格式错误');
      if (JSON.stringify(body.parsedData).length > 1.5 * 1024 * 1024) return fail(res, '数据过大');

      const date = String(body.date || new Date().toLocaleString());
      const result = db.prepare(
        'INSERT INTO history(project_name,date,messages,parsed_data,created_at) VALUES(?,?,?,?,?)'
      ).run(projectName, date, JSON.stringify(body.messages), JSON.stringify(body.parsedData), now());

      const row = db.prepare('SELECT * FROM history WHERE id=?').get(Number(result.lastInsertRowid));
      addLog('history_save', `#${row.id} ${projectName}`);
      return ok(res, { item: rowToItem(row) });
    }

    // ---------- 删除历史记录 ----------
    const delMatch = pathname.match(/^\/api\/history\/(\d+)$/);
    if (delMatch && method === 'DELETE') {
      const id = Number(delMatch[1]);
      const row = db.prepare('SELECT * FROM history WHERE id=?').get(id);
      if (!row) return fail(res, '记录不存在', 404);
      db.prepare('DELETE FROM history WHERE id=?').run(id);
      addLog('history_delete', `#${id} ${row.project_name}`);
      return ok(res, { msg: '已删除' });
    }

    return fail(res, '接口不存在', 404);
  } catch (e) {
    console.error('[api]', pathname, e);
    return fail(res, '服务器内部错误', 500);
  }
}
