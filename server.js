#!/usr/bin/env node
/**
 * server.js — 软件介绍网站后端（纯 Node，无任何第三方依赖）
 *
 * 启动：node server.js
 * 环境变量：
 *   PORT           监听端口（默认 3000）
 *   ADMIN_PASSWORD 管理后台密码（默认空 = 不启用密码，仅本地使用）
 *   DATA_DIR       数据存储目录（默认 data/；部署时指向持久磁盘）
 *
 * 本地也可把上述变量写进项目根目录的 .env 文件（如 ADMIN_PASSWORD=xxx），
 * 启动时会自动读取；但 .env 仅本地用，部署到 Render 等请在平台控制台设环境变量。
 *
 * 数据：data/softwares.json（唯一数据源，增删改都会写回此文件并实时推送前端）
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
// 数据存储目录：默认在 data/；部署时可设 DATA_DIR 指向持久磁盘（Render Disk / Railway Volume / Docker 卷）
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DATA = path.join(DATA_DIR, 'softwares.json');

// ---------- 读取 .env（可选，零依赖；仅作本地便利，不覆盖已有 process.env）----------
(function loadDotEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (!m) continue; // 跳过空行与注释（# 开头）
    if (line.trim().startsWith('#')) continue;
    const key = m[1];
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
})();

const PORT = parseInt(process.env.PORT || '3000', 10);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// ---------- 内存数据 ----------
function loadData() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA, 'utf8'));
    if (!Array.isArray(d.items)) d.items = [];
    return d;
  } catch (e) {
    return { updatedAt: new Date().toISOString(), total: 0, items: [] };
  }
}
let db = loadData();
function persist() {
  db.updatedAt = new Date().toISOString();
  db.total = db.items.length;
  fs.writeFileSync(DATA, JSON.stringify(db, null, 2), 'utf8');
  broadcast();
}

// ---------- 站点设置（标题/副标题/页脚）----------
const SETTINGS = path.join(DATA_DIR, 'settings.json');
const DEFAULT_SETTINGS = {
  title: '科研软件工具集',
  subtitle: '机器学习 · 空间科学 · 因果智能 · 科研论文',
  footer: '数据来源：微信公众号 3S&ML《软件清单》',
};
function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}
let settings = loadSettings();
function persistSettings() {
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2), 'utf8');
  broadcast();
}

// ---------- 登录会话 ----------
const sessions = new Map(); // token -> expireTs
function newToken() {
  const t = crypto.randomUUID();
  sessions.set(t, Date.now() + 3600 * 1000);
  return t;
}
function authOk(req) {
  if (!ADMIN_PASSWORD) return true; // 未设密码则开放（本地）
  const h = req.headers['authorization'] || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  const exp = sessions.get(m[1]);
  if (!exp) return false;
  if (exp < Date.now()) {
    sessions.delete(m[1]);
    return false;
  }
  return true;
}

// ---------- SSE 实时推送 ----------
const sseClients = new Set();
function broadcast() {
  const payload = `data: ${JSON.stringify({ type: 'update', ts: Date.now() })}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch (e) {
      sseClients.delete(res);
    }
  }
}

// ---------- 工具 ----------
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
function serveStatic(req, res, urlPath) {
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  if (rel === '/admin') rel = '/admin.html';
  // 防目录穿越
  const filePath = path.normalize(path.join(PUBLIC, rel));
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
}

// ---------- 路由 ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  const method = req.method.toUpperCase();

  try {
    // 配置（前端判断是否显示登录框）
    if (p === '/api/config' && method === 'GET') {
      return sendJSON(res, 200, { authRequired: !!ADMIN_PASSWORD });
    }

    // 登录
    if (p === '/api/login' && method === 'POST') {
      const body = await readBody(req);
      if (ADMIN_PASSWORD && body.password !== ADMIN_PASSWORD) {
        return sendJSON(res, 401, { error: '密码错误' });
      }
      return sendJSON(res, 200, { token: newToken() });
    }

    // SSE 实时流
    if (p === '/api/stream' && method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('retry: 3000\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    // 公开读取
    if (p === '/api/softwares' && method === 'GET') {
      return sendJSON(res, 200, db);
    }

    // 站点设置（公开读）
    if (p === '/api/settings' && method === 'GET') {
      return sendJSON(res, 200, settings);
    }
    // 站点设置（鉴权写）
    if (p === '/api/settings' && method === 'PUT') {
      if (!authOk(req)) return sendJSON(res, 401, { error: '未授权' });
      const body = await readBody(req);
      settings = { ...settings, ...body };
      persistSettings();
      return sendJSON(res, 200, settings);
    }

    // 管理写操作（需鉴权）
    if (p.startsWith('/api/softwares') && method !== 'GET') {
      if (!authOk(req)) return sendJSON(res, 401, { error: '未授权' });
    }

    // 创建
    if (p === '/api/softwares' && method === 'POST') {
      const body = await readBody(req);
      if (!body.name || !String(body.name).trim()) {
        return sendJSON(res, 400, { error: '软件名称不能为空' });
      }
      const item = {
        id: 'sw-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12),
        name: String(body.name).trim(),
        category: body.category || '未分类',
        version: body.version || '',
        description: body.description || '',
        detail: body.detail || '',
        link: body.link || '',
        lastUpdate: body.lastUpdate || new Date().toISOString().slice(0, 10),
        articleCount: Number(body.articleCount) || 0,
        tags: Array.isArray(body.tags) ? body.tags : [],
        featured: !!body.featured,
        source: 'manual',
      };
      db.items.unshift(item);
      persist();
      return sendJSON(res, 201, item);
    }

    // 更新 / 删除
    const m = p.match(/^\/api\/softwares\/([\w-]+)$/);
    if (m) {
      const id = m[1];
      const idx = db.items.findIndex((x) => x.id === id);
      if (idx < 0) return sendJSON(res, 404, { error: '未找到该软件' });

      if (method === 'PUT') {
        const body = await readBody(req);
        const cur = db.items[idx];
        const updated = {
          ...cur,
          name: body.name != null ? String(body.name).trim() : cur.name,
          category: body.category != null ? body.category : cur.category,
          version: body.version != null ? body.version : cur.version,
          description: body.description != null ? body.description : cur.description,
          detail: body.detail != null ? body.detail : cur.detail,
          link: body.link != null ? body.link : cur.link,
          lastUpdate: body.lastUpdate != null ? body.lastUpdate : cur.lastUpdate,
          articleCount: body.articleCount != null ? Number(body.articleCount) || 0 : cur.articleCount,
          tags: body.tags != null ? (Array.isArray(body.tags) ? body.tags : []) : cur.tags,
          featured: body.featured != null ? !!body.featured : cur.featured,
        };
        if (!updated.name) return sendJSON(res, 400, { error: '软件名称不能为空' });
        db.items[idx] = updated;
        persist();
        return sendJSON(res, 200, updated);
      }
      if (method === 'DELETE') {
        const [removed] = db.items.splice(idx, 1);
        persist();
        return sendJSON(res, 200, { ok: true, removed });
      }
    }

    // 其余静态资源
    if (method === 'GET') return serveStatic(req, res, p);

    return sendJSON(res, 404, { error: 'Not Found' });
  } catch (e) {
    console.error(e);
    return sendJSON(res, 500, { error: '服务器错误' });
  }
});

server.listen(PORT, () => {
  console.log(`✓ 软件介绍网站已启动`);
  console.log(`  公开访问:  http://localhost:${PORT}/`);
  console.log(`  管理后台:  http://localhost:${PORT}/admin`);
  console.log(ADMIN_PASSWORD ? `  管理密码:  已启用（${'*'.repeat(ADMIN_PASSWORD.length)}）` : `  管理密码:  未启用（本地开放，生产请设置 ADMIN_PASSWORD）`);
});
