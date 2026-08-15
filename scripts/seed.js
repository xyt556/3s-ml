#!/usr/bin/env node
/**
 * seed.js — 从工作区里的两份 Markdown 生成 data/softwares.json
 *
 * 数据源：
 *   - 软件清单汇总.md  : 46 款软件的完整清单（分类 / 版本 / 功能 / 最近更新 / 文章数）
 *   - 软件汇总.md      : 其中 21 款软件的详细功能说明 + 原文链接
 *
 * 用法：node scripts/seed.js
 * 重新运行即可用最新 Markdown 覆盖 data/softwares.json（会保留已存在的 id，
 * 以及 Markdown 里没有、但 JSON 里已手工新增的条目）。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
// 注意：文件内容与其字面名称相反
//   软件汇总.md        -> 46 款软件的完整分类清单（核心字段）
//   软件清单汇总.md    -> 21 款软件的详细功能 + 原文链接（富化数据）
const SRC_LIST = path.join(ROOT, '..', '软件汇总.md');
const SRC_DETAIL = path.join(ROOT, '..', '软件清单汇总.md');
const OUT = path.join(ROOT, 'data', 'softwares.json');

function read(p) {
  if (!fs.existsSync(p)) {
    console.warn('⚠ 找不到数据源:', p);
    return '';
  }
  return fs.readFileSync(p, 'utf8');
}

// 归一化名称用于跨文件匹配：去星号、去括号版本号、转小写、压缩空格
function norm(s) {
  return String(s)
    .replace(/\*/g, '')
    .replace(/[（(][^)）]*[)）]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// 已知名称差异的别名映射（归一化后的值）
const ALIAS = {
  'dml studio 双重机器学习分析平台': '双重机器学习 dml 交互界面',
  'geoshap analysis tool pro': 'geoshap_pro geoshap analysis tool',
  '景观格局分析系统 landscape': '景观格局分析系统 landsacpe',
  '数据增强工具': '小样本数据增强工具',
};

function resolveName(name) {
  const n = norm(name);
  return ALIAS[n] || n;
}

// ---------- 解析 软件清单汇总.md（46 条核心数据）----------
function parseList(md) {
  const lines = md.split(/\r?\n/);
  const items = [];
  let category = '';
  for (const line of lines) {
    const cat = line.match(/^##\s+(.+?)（\s*\d+\s*款）\s*$/);
    if (cat) {
      category = cat[1].trim();
      continue;
    }
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim()).filter((c) => c !== '');
    // 跳过表头、分隔行，且只认分类数据表（恰好 6 列、首列为数字序号）
    if (cells[0] === '#' || /^-+:?$/.test(cells[0])) continue;
    if (cells.length !== 6 || !/^\d+$/.test(cells[0])) continue;
    const name = cells[1].replace(/\*/g, '').trim();
    if (!name) continue;
    items.push({
      name,
      category,
      description: cells[2] || '',
      version: cells[3] || '',
      lastUpdate: cells[4] || '',
      articleCount: parseInt(cells[5], 10) || 0,
    });
  }
  return items;
}

// ---------- 解析 软件清单汇总.md（链接 + 详细）----------
function parseDetail(md) {
  const lines = md.split(/\r?\n/);
  const links = new Map(); // normName -> url
  const details = new Map(); // normName -> detailText

  // 1) 总览表里的链接
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim()).filter((c) => c !== '');
    if (cells.length < 5) continue;
    const m = cells[cells.length - 1].match(/\[链接\]\(([^)]+)\)/);
    if (!m) continue;
    const name = cells[1].replace(/\*/g, '').trim();
    if (name) links.set(resolveName(name), m[1]);
  }

  // 2) 各软件功能详解（### N. 名称（版本））
  let curName = null;
  let buf = [];
  const flush = () => {
    if (curName && buf.length) {
      details.set(resolveName(curName), buf.join('\n').trim());
    }
    curName = null;
    buf = [];
  };
  for (const line of lines) {
    const h = line.match(/^###\s+\d+\.\s+([^（(]+)/);
    if (h) {
      flush();
      curName = h[1].trim();
      continue;
    }
    if (/^#{1,2}\s/.test(line) && curName) {
      flush();
      continue;
    }
    if (curName) buf.push(line);
  }
  flush();

  return { links, details };
}

// 宽松匹配：别名优先；否则取「互相包含且最长」的键
function bestMatch(query, map) {
  const q = resolveName(query);
  if (map.has(q)) return map.get(q);
  let best = null;
  let bestLen = 0;
  for (const [k, v] of map) {
    if (k.length < 3) continue;
    if (k.includes(q) || q.includes(k)) {
      if (k.length > bestLen) {
        bestLen = k.length;
        best = v;
      }
    }
  }
  return best;
}

// ---------- 生成 id ----------
function main() {
  const listMd = read(SRC_LIST);
  const detailMd = read(SRC_DETAIL);

  const core = parseList(listMd);
  const { links, details } = parseDetail(detailMd);

  // 读取已有 JSON，保留 id 与手工新增条目
  let existing = { items: [] };
  if (fs.existsSync(OUT)) {
    try {
      existing = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    } catch (e) {
      console.warn('⚠ 现有 JSON 解析失败，将被覆盖');
    }
  }
  const existingById = new Map(existing.items.map((it) => [it.id, it]));
  const existingByName = new Map(existing.items.map((it) => [resolveName(it.name), it]));
  const seenId = new Set();

  const items = core.map((c) => {
    const link = bestMatch(c.name, links) || '';
    const detail = bestMatch(c.name, details) || '';
    let id;
    const prev = existingByName.get(resolveName(c.name));
    if (prev) {
      id = prev.id;
    } else {
      // 中文名无法转 ASCII slug，改用名称的短哈希作为稳定 id
      id = 'sw-' + crypto.createHash('md5').update(c.name).digest('hex').slice(0, 8);
      while (seenId.has(id)) id = id + 'x';
    }
    seenId.add(id);
    return {
      id,
      name: c.name,
      category: c.category,
      version: c.version,
      description: c.description,
      detail,
      link,
      lastUpdate: c.lastUpdate,
      articleCount: c.articleCount,
      tags: prev?.tags || [],
      featured: prev?.featured || false,
      source: 'markdown',
    };
  });

  // 仅保留手工新增的条目（source==='manual'），避免把旧 JSON 里的脏数据带回来
  for (const it of existing.items) {
    if (it.source === 'manual' && !items.find((x) => x.id === it.id)) items.push(it);
  }

  const out = {
    updatedAt: new Date().toISOString(),
    total: items.length,
    items,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
  console.log(`✓ 已生成 ${items.length} 条软件数据 -> ${OUT}`);
  // 统计匹配情况
  const withLink = items.filter((i) => i.link).length;
  const withDetail = items.filter((i) => i.detail).length;
  console.log(`  含原文链接: ${withLink} 条, 含详细功能: ${withDetail} 条`);
}

main();
