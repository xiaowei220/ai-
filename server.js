// ============================================================
// server.js — AI 硬件架构师 · Blueprint.clone 全栈版 · 服务器入口
// 零外部依赖：Node 24 (http + sqlite + crypto)
// 启动：node server.js  （或双击 start.bat）
// 前台：http://本机IP:7778/        后台：http://本机IP:7778/admin
// ============================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './lib/api.js';
import { handleAdminApi } from './lib/admin.js';
import { DB_PATH } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 7778;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400); return res.end('Bad Request');
  }

  // ---------- API 路由 ----------
  if (pathname.startsWith('/api/admin/')) return handleAdminApi(req, res, pathname);
  if (pathname.startsWith('/api/')) return handleApi(req, res, pathname);

  // ---------- 静态文件 ----------
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/admin' || pathname === '/admin/') pathname = '/admin/index.html';

  const filePath = path.normalize(path.join(PUBLIC, pathname));
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('==============================================');
  console.log('  AI 硬件架构师 · Blueprint.clone 全栈版 服务器已启动');
  console.log(`  前台应用:  http://localhost:${PORT}/`);
  console.log(`  后台管理:  http://localhost:${PORT}/admin`);
  console.log('  默认管理员: admin / admin123 (请尽快修改)');
  console.log(`  数据库:    ${DB_PATH}`);
  console.log('==============================================');
});

server.on('error', (e) => {
  console.error('[server] 启动失败:', e.message);
  process.exit(1);
});
