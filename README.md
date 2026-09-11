# AI 硬件架构师 · Blueprint.clone 全栈版

基于原版单文件 HTML「Blueprint.clone - AI 硬件架构师」开发的**数据库 + 后台管理**全栈版。
前台 UI 与原版**一模一样**,唯一区别:历史记录从浏览器 localStorage 迁移到 SQLite 数据库。

**零外部依赖** — Node.js 24+ 内置 `node:sqlite` / `node:http` / `node:crypto`,无需 npm install。

## 功能

- **前台**(`http://localhost:7778/`):聊天式 AI 硬件设计 — 实物接线图 / BOM 清单(导出 CSV、一键淘宝/拼多多采购)/ 3D PCB(爆炸图、顶视图、嘉立创 EDA 导出、Gerber 下载)/ 新手说明书(实拍视频 + AI 语音讲解)/ 固件代码 / JSON。无 API Key 时使用内置模拟数据演示。
- **数据库**:所有生成历史存入 `data/blueprint.db`(SQLite,全局共享,刷新/换设备不丢失)。
- **后台管理**(`http://localhost:7778/admin`):数据看板、历史记录管理(搜索/查看详情/删除)、系统设置、操作日志、修改密码。

## 启动

双击 `start.bat`(自动启动 + 放行防火墙 + 打开浏览器),或在目录下运行:

```
node server.js
```

- 前台应用: http://localhost:7778/
- 后台管理: http://localhost:7778/admin
- 默认管理员: **admin / admin123**(登录后请尽快修改密码)
- 端口可通过环境变量 `PORT` 修改(默认 7778,7777 已被撕名牌大戰占用)

## 测试

服务器启动后运行全流程自动化测试:

```
node test-api.mjs
```

覆盖:静态页面、前台历史 CRUD、后台登录鉴权、看板统计、历史管理(搜索/详情/删除)、系统设置、操作日志、修改密码。

## 目录结构

```
ai硬件架构师/
  server.js              HTTP 服务器 (端口 7778)
  db.js                  SQLite 数据库层 (node:sqlite)
  lib/util.js            工具函数
  lib/api.js             前台 API (/api/history CRUD)
  lib/admin.js           后台 API (/api/admin/*)
  public/index.html      前台应用 (与原版 UI 一致)
  public/admin/          后台管理页面
  test-api.mjs           全流程自动化测试
  start.bat              一键启动脚本
  data/blueprint.db      数据库 (自动生成)
```
