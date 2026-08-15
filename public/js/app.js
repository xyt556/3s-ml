'use strict';

const state = {
  settings: { title: '软件介绍', subtitle: '', footer: '' },
  items: [],
  search: '',
  category: 'all',
  sort: 'default',
};

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadSettings() {
  try {
    state.settings = await (await fetch('/api/settings')).json();
  } catch (e) {}
  applySettings();
}
function applySettings() {
  document.title = state.settings.title || '软件介绍';
  $('siteTitle').textContent = state.settings.title || '软件介绍';
  $('siteSubtitle').textContent = state.settings.subtitle || '';
  $('siteFooter').innerHTML = state.settings.footer
    ? esc(state.settings.footer)
    : '';
}

async function loadData() {
  const d = await (await fetch('/api/softwares')).json();
  state.items = d.items || [];
  render();
}

function categories() {
  const map = new Map();
  for (const it of state.items) {
    const c = it.category || '未分类';
    map.set(c, (map.get(c) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function filtered() {
  const q = state.search.trim().toLowerCase();
  let arr = state.items.filter((it) => {
    if (state.category !== 'all' && (it.category || '未分类') !== state.category) return false;
    if (!q) return true;
    const hay = [it.name, it.description, it.category, it.detail, (it.tags || []).join(' ')]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
  if (state.sort === 'update') {
    arr = arr.slice().sort((a, b) => String(b.lastUpdate).localeCompare(String(a.lastUpdate)));
  } else if (state.sort === 'name') {
    arr = arr.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  } else if (state.sort === 'articles') {
    arr = arr.slice().sort((a, b) => (b.articleCount || 0) - (a.articleCount || 0));
  }
  // 精选置顶（仅默认排序时）
  if (state.sort === 'default') {
    arr = arr.slice().sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  }
  return arr;
}

function renderFilters() {
  const cats = categories();
  const wrap = $('filters');
  wrap.innerHTML = '';
  const all = mkChip('all', `全部 ${state.items.length}`);
  wrap.appendChild(all);
  for (const [c, n] of cats) {
    wrap.appendChild(mkChip(c, `${esc(c)} <span class="n">${n}</span>`));
  }
}
function mkChip(val, html) {
  const el = document.createElement('div');
  el.className = 'chip' + (state.category === val ? ' active' : '');
  el.innerHTML = html;
  el.onclick = () => {
    state.category = val;
    renderFilters();
    render();
  };
  return el;
}

function render() {
  renderFilters();
  const arr = filtered();
  const grid = $('grid');
  $('count').textContent = `共 ${arr.length} 款软件` +
    (state.category !== 'all' ? `（分类：${state.category}）` : '') +
    (state.search ? `（搜索：“${state.search}”）` : '');
  grid.innerHTML = '';
  $('empty').style.display = arr.length ? 'none' : 'block';
  for (const it of arr) grid.appendChild(card(it));
}

function card(it) {
  const el = document.createElement('div');
  el.className = 'card' + (it.featured ? ' featured' : '');
  const tags = (it.tags || []).slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  el.innerHTML = `
    <div class="card-head">
      <h3 class="card-title">${esc(it.name)}</h3>
      ${it.version ? `<span class="ver">${esc(it.version)}</span>` : ''}
    </div>
    <span class="badge">${esc(it.category || '未分类')}</span>
    <p class="desc">${esc(it.description || '（暂无简介）')}</p>
    <div class="card-foot">
      <span>${tags || `<span style="opacity:.7">${it.lastUpdate ? '更新 ' + esc(it.lastUpdate) : ''}</span>`}</span>
      <span class="more">详情 ›</span>
    </div>`;
  el.onclick = () => openModal(it.id);
  return el;
}

function renderDetailText(text) {
  if (!text) return '<p style="opacity:.7">暂无详细介绍。</p>';
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let html = '';
  let inList = false;
  for (const ln of lines) {
    if (ln.startsWith('- ') || ln.startsWith('* ')) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${esc(ln.slice(2))}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<p>${esc(ln)}</p>`;
    }
  }
  if (inList) html += '</ul>';
  return html;
}

function openModal(id) {
  const it = state.items.find((x) => x.id === id);
  if (!it) return;
  $('mTitle').textContent = it.name;
  const meta = [];
  if (it.category) meta.push(`<span class="badge">${esc(it.category)}</span>`);
  if (it.version) meta.push(`<span class="ver">${esc(it.version)}</span>`);
  if (it.lastUpdate) meta.push(`<span style="color:var(--text-faint);font-size:12px">更新于 ${esc(it.lastUpdate)}</span>`);
  if (it.articleCount) meta.push(`<span style="color:var(--text-faint);font-size:12px">${esc(it.articleCount)} 篇相关文章</span>`);
  $('mMeta').innerHTML = meta.join(' ');

  let body = '';
  if (it.description) body += `<p>${esc(it.description)}</p>`;
  if (it.detail) {
    body += `<h4>功能详解</h4>${renderDetailText(it.detail)}`;
  }
  if ((it.tags || []).length) {
    body += `<h4>标签</h4><div class="tags">${it.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>`;
  }
  $('mBody').innerHTML = body;

  $('mFoot').innerHTML = it.link
    ? `<a class="btn-link" href="${esc(it.link)}" target="_blank" rel="noopener">查看原文 / 下载 ↗</a>`
    : '';
  $('modal').classList.add('open');
}
function closeModal() { $('modal').classList.remove('open'); }

// 事件
$('search').addEventListener('input', (e) => { state.search = e.target.value; render(); });
$('sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
$('mClose').addEventListener('click', closeModal);
$('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// 实时更新（SSE）
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), 2200);
}
function connectSSE() {
  const es = new EventSource('/api/stream');
  es.onmessage = () => {
    loadData();
    loadSettings();
    showToast('内容已实时更新');
  };
  es.onerror = () => { /* 浏览器会自动重连 */ };
}

(async function init() {
  await loadSettings();
  await loadData();
  connectSSE();
})();
