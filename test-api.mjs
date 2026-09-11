// ============================================================
// test-api.mjs — 全流程自动化测试（服务器需已启动）
// 运行：node test-api.mjs
// 覆盖：静态页面 / 前台历史 CRUD / 后台登录鉴权 / 看板 /
//       历史管理(搜索·详情·删除) / 系统设置 / 操作日志 / 修改密码
// ============================================================
const BASE = 'http://127.0.0.1:7778';
let failures = 0;
const check = (cond, msg) => { console.log((cond ? '✅ ' : '❌ ') + msg); if (!cond) failures++; };

async function req(path, { method = 'GET', token = '', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

const MOCK = {
  projectName: '测试项目-智能小夜灯',
  date: new Date().toLocaleString(),
  messages: [
    { role: 'user', content: '帮我设计一个智能小夜灯' },
    { role: 'assistant', content: '✓ 硬件架构拓扑及 3D PCB 参数生成成功！' },
  ],
  parsedData: {
    project_name: '测试项目-智能小夜灯',
    description: '测试数据',
    circuit: { nodes: [{ id: 'mcu', name: 'ESP32', type: 'Microcontroller', x: 300, y: 150, w: 120, h: 220, color: '#1e293b', pins: [] }], edges: [] },
    bom: { items: [{ name: 'ESP32 开发板', quantity: 1, description: '主控', estimated_price: '25.00' }], total_estimated_price: '25.00' },
    guide: '### 测试说明书',
    firmware_code: '// 测试固件',
  },
};

console.log('========== AI 硬件架构师 · Blueprint.clone 全栈版 · 全流程测试 ==========\n');

// ---------- 1. 静态页面 ----------
{
  const home = await fetch(BASE + '/');
  const homeHtml = await home.text();
  check(home.status === 200 && homeHtml.includes('Blueprint.clone'), '前台首页可访问且包含 Blueprint.clone');
  check(homeHtml.includes('/api/history'), '前台已接入数据库 API（不再使用 localStorage 历史）');

  const admin = await fetch(BASE + '/admin');
  check(admin.status === 200, '后台管理页面可访问');
  const noPage = await fetch(BASE + '/不存在页面');
  check(noPage.status === 404, '不存在的路径返回 404');
}

// ---------- 2. 前台历史 CRUD ----------
let savedId = null;
{
  const created = await req('/api/history', { method: 'POST', body: MOCK });
  check(created.res.ok && created.data.ok && created.data.item, 'POST /api/history 创建记录成功');
  savedId = created.data.item?.id;
  check(created.data.item?.projectName === MOCK.projectName, '返回的 item 形状与原版 state 一致 (projectName/messages/parsedData)');
  check(created.data.item?.messages?.length === 2 && created.data.item?.parsedData?.bom, 'messages 与 parsedData 内容完整');

  const list = await req('/api/history');
  check(list.res.ok && list.data.history.some(h => h.id === savedId), 'GET /api/history 列表包含新记录');

  const bad = await req('/api/history', { method: 'POST', body: { projectName: '' } });
  check(!bad.res.ok, '缺少项目名时 POST 被拒绝');
}

// ---------- 3. 后台鉴权 ----------
let adminToken = '';
{
  const noAuth = await req('/api/admin/stats');
  check(noAuth.res.status === 401, '未登录访问后台接口返回 401');

  const wrong = await req('/api/admin/login', { method: 'POST', body: { username: 'admin', password: 'wrongpass' } });
  check(wrong.res.status === 401, '错误密码登录被拒绝');

  const login = await req('/api/admin/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } });
  check(login.res.ok && login.data.token, 'admin/admin123 登录成功');
  adminToken = login.data.token;
}

// ---------- 4. 后台看板 ----------
{
  const stats = await req('/api/admin/stats', { token: adminToken });
  check(stats.res.ok && stats.data.totalProjects >= 1, `看板数据正常 (总项目 ${stats.data.totalProjects})`);
  check(Number.isFinite(stats.data.bomTotal) && Number.isFinite(stats.data.bomAvg), 'BOM 成本统计有效');
  check(Array.isArray(stats.data.recent) && stats.data.recent.length > 0, '最近生成列表有效');
}

// ---------- 5. 后台历史管理 ----------
{
  const list = await req('/api/admin/history', { method: 'POST', token: adminToken, body: { q: '', limit: 10 } });
  check(list.res.ok && list.data.total >= 1, '后台历史列表正常');
  const found = list.data.history.find(h => h.id === savedId);
  check(!!found && found.nodes >= 1 && found.bomItems >= 1 && found.cost === 25, '列表含节点/BOM/成本统计');

  const search = await req('/api/admin/history', { method: 'POST', token: adminToken, body: { q: '小夜灯', limit: 10 } });
  check(search.data.history.some(h => h.id === savedId), '按项目名搜索命中');
  const searchMiss = await req('/api/admin/history', { method: 'POST', token: adminToken, body: { q: '不存在的项目xyz', limit: 10 } });
  check(searchMiss.data.total === 0, '搜索无结果返回 0');

  const detail = await req(`/api/admin/history/${savedId}`, { token: adminToken });
  check(detail.res.ok && detail.data.item.messages.length === 2 && detail.data.item.parsed_data.firmware_code, '历史详情(对话+完整JSON)正常');

  const del = await req(`/api/admin/history/${savedId}`, { method: 'POST', token: adminToken });
  check(del.res.ok, '后台删除记录成功');
  const afterDel = await req(`/api/admin/history/${savedId}`, { token: adminToken });
  check(afterDel.res.status === 404, '删除后详情返回 404');
}

// ---------- 6. 系统设置 ----------
{
  const get = await req('/api/admin/settings', { token: adminToken });
  check(get.res.ok && typeof get.data.settings === 'object', '读取系统设置正常');
  const set = await req('/api/admin/settings', { method: 'POST', token: adminToken, body: { settings: { site_title: 'AI 硬件架构师' } } });
  check(set.res.ok, '保存系统设置成功');
}

// ---------- 7. 操作日志 ----------
{
  const logs = await req('/api/admin/logs', { method: 'POST', token: adminToken, body: { limit: 50 } });
  const types = logs.data.logs.map(l => l.type);
  check(logs.res.ok && logs.data.logs.length > 0, `操作日志正常 (${logs.data.logs.length} 条)`);
  check(types.includes('history_save') && types.includes('admin_login'), '日志记录了历史保存与管理员登录');
}

// ---------- 8. 修改密码（改后改回，避免污染环境） ----------
{
  const wrongOld = await req('/api/admin/password', { method: 'POST', token: adminToken, body: { old: 'badpass', new_: 'test123456' } });
  check(!wrongOld.res.ok, '原密码错误时拒绝修改');

  const chg = await req('/api/admin/password', { method: 'POST', token: adminToken, body: { old: 'admin123', new_: 'test123456' } });
  check(chg.res.ok, '修改密码成功');
  const loginNew = await req('/api/admin/login', { method: 'POST', body: { username: 'admin', password: 'test123456' } });
  check(loginNew.res.ok, '新密码可登录');
  const restore = await req('/api/admin/password', { method: 'POST', token: loginNew.data.token, body: { old: 'test123456', new_: 'admin123' } });
  check(restore.res.ok, '密码已还原为 admin123');
}

// ---------- 9. 前台删除接口 ----------
{
  const created = await req('/api/history', { method: 'POST', body: MOCK });
  const id = created.data.item.id;
  const del = await req(`/api/history/${id}`, { method: 'DELETE' });
  check(del.res.ok, '前台 DELETE /api/history/:id 成功');
  const list = await req('/api/history');
  check(!list.data.history.some(h => h.id === id), '删除后列表已不含该记录');
}

console.log(`\n========== 测试完成：${failures === 0 ? '全部通过 🎉' : failures + ' 项失败 ❌'} ==========`);
process.exit(failures === 0 ? 0 : 1);
