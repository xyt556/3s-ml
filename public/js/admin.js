'use strict';

const $ = (id) => document.getElementById(id);
let cfg = { authRequired: false };
let items = [];
let settings = {};
let editingId = null;

function headers() {
  const t = sessionStorage.getItem('admin_token');
  return Object.assign({ 'Content-Type': 'application/json' }, t ? { Authorization: 'Bearer ' + t } : {});
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ---------- 认证 ---------- */
function showLogin() { $('loginMask').classList.add('open'); }
function hideLogin() { $('loginMask').classList.remove('open'); }

$('loginBtn').addEventListener('click', doLogin);
$('pwd').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
async function doLogin() {
  const pw = $('pwd').value;
  const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
  if (!r.ok) {
    $('loginErr').textContent = (await r.json()).error || '登录失败';
    return;
  }
  const d = await r.json();
  sessionStorage.setItem('admin_token', d.token);
  $('loginErr').textContent = '';
  hideLogin();
  initApp();
}

/* ---------- 初始化 ---------- */
async function boot() {
  cfg = await (await fetch('/api/config')).json();
  if (cfg.authRequired && !sessionStorage.getItem('admin_token')) {
    showLogin();
    return;
  }
  initApp();
}

async function initApp() {
  await Promise.all([loadItems(), loadSettingsView()]);
  bindTabs();
  bindEdit();
  $('addBtn').onclick = () => openEdit(null);
  $('adminSearch').oninput = (e) => renderRows(e.target.value);
  $('saveSettings').onclick = saveSettings;
}

/* ---------- 软件列表 ---------- */
async function loadItems() {
  const d = await (await fetch('/api/softwares')).json();
  items = d.items || [];
  // 分类下拉
  const cats = [...new Set(items.map((i) => i.category).filter(Boolean))].sort();
  $('catlist').innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join('');
  renderRows();
}
function renderRows(q) {
  q = (q || '').trim().toLowerCase();
  const rows = items.filter((i) => !q || (i.name + ' ' + (i.category || '')).toLowerCase().includes(q));
  $('adminCount').textContent = `共 ${rows.length} / ${items.length} 款`;
  const tb = $('adminRows');
  tb.innerHTML = '';
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-faint);padding:24px">暂无软件，点击「新增软件」添加</td></tr>`;
    return;
  }
  for (const it of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${esc(it.name)}</strong>${it.featured ? ' ⭐' : ''}</td>
      <td>${esc(it.category || '—')}</td>
      <td>${esc(it.version || '—')}</td>
      <td>${esc(it.lastUpdate || '—')}</td>
      <td>${it.articleCount || 0}</td>
      <td><div class="row-actions">
        <button data-edit="${it.id}">编辑</button>
        <button class="del" data-del="${it.id}">删除</button>
      </div></td>`;
    tr.querySelector('[data-edit]').onclick = () => openEdit(it.id);
    tr.querySelector('[data-del]').onclick = () => delItem(it.id);
    tb.appendChild(tr);
  }
}

/* ---------- 编辑弹窗 ---------- */
function bindEdit() {
  $('editClose').onclick = closeEdit;
  $('cancelBtn').onclick = closeEdit;
  $('editModal').addEventListener('click', (e) => { if (e.target.id === 'editModal') closeEdit(); });
  $('saveBtn').onclick = saveItem;
}
function openEdit(id) {
  editingId = id;
  const it = id ? items.find((x) => x.id === id) : null;
  $('editTitle').textContent = it ? '编辑软件' : '新增软件';
  $('f_name').value = it?.name || '';
  $('f_category').value = it?.category || '';
  $('f_version').value = it?.version || '';
  $('f_lastUpdate').value = it?.lastUpdate || '';
  $('f_articleCount').value = it?.articleCount || 0;
  $('f_link').value = it?.link || '';
  $('f_description').value = it?.description || '';
  $('f_detail').value = it?.detail || '';
  $('f_tags').value = (it?.tags || []).join(', ');
  $('f_featured').checked = !!it?.featured;
  $('deleteBtn').style.display = it ? 'inline-block' : 'none';
  $('deleteBtn').onclick = () => delItem(it.id);
  $('editModal').classList.add('open');
}
function closeEdit() { $('editModal').classList.remove('open'); }

function collectForm() {
  return {
    name: $('f_name').value.trim(),
    category: $('f_category').value.trim() || '未分类',
    version: $('f_version').value.trim(),
    lastUpdate: $('f_lastUpdate').value.trim(),
    articleCount: Number($('f_articleCount').value) || 0,
    link: $('f_link').value.trim(),
    description: $('f_description').value.trim(),
    detail: $('f_detail').value.trim(),
    tags: $('f_tags').value.split(',').map((s) => s.trim()).filter(Boolean),
    featured: $('f_featured').checked,
  };
}
async function saveItem() {
  const payload = collectForm();
  if (!payload.name) { alert('软件名称不能为空'); return; }
  const url = editingId ? `/api/softwares/${editingId}` : '/api/softwares';
  const method = editingId ? 'PUT' : 'POST';
  const r = await fetch(url, { method, headers: headers(), body: JSON.stringify(payload) });
  if (!r.ok) { alert((await r.json()).error || '保存失败'); return; }
  closeEdit();
  await loadItems();
}
async function delItem(id) {
  const it = items.find((x) => x.id === id);
  if (!confirm(`确定删除「${it?.name || ''}」？此操作不可撤销。`)) return;
  const r = await fetch(`/api/softwares/${id}`, { method: 'DELETE', headers: headers() });
  if (!r.ok) { alert((await r.json()).error || '删除失败'); return; }
  await loadItems();
}

/* ---------- 站点设置 ---------- */
async function loadSettingsView() {
  settings = await (await fetch('/api/settings')).json();
  $('setTitle').value = settings.title || '';
  $('setSubtitle').value = settings.subtitle || '';
  $('setFooter').value = settings.footer || '';
}
async function saveSettings() {
  const payload = {
    title: $('setTitle').value.trim(),
    subtitle: $('setSubtitle').value.trim(),
    footer: $('setFooter').value.trim(),
  };
  const r = await fetch('/api/settings', { method: 'PUT', headers: headers(), body: JSON.stringify(payload) });
  if (!r.ok) { $('setMsg').textContent = '保存失败'; return; }
  settings = await r.json();
  $('setMsg').textContent = '✓ 已保存，网站实时更新';
  setTimeout(() => ($('setMsg').textContent = ''), 2500);
}

/* ---------- Tabs ---------- */
function bindTabs() {
  document.querySelectorAll('.tab').forEach((t) => {
    t.onclick = () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      const tab = t.dataset.tab;
      $('tab-sw').style.display = tab === 'sw' ? '' : 'none';
      $('tab-set').style.display = tab === 'set' ? '' : 'none';
    };
  });
}

boot();
