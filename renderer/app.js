// hmcs renderer — PCL 风格 UI
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// ---------- 演示模式（静态预览用；Electron 中 window.hmcs 存在则走真实 IPC） ----------
const DEMO = !window.hmcs;
const demoApi = {
  async getConfig() { return { downloadSource: 'bmclapi', maxMemoryMB: 4096, msaClientId: '', themeColor: '#3fae52', updateManifestUrl: '' }; },
  async setConfig() {},
  async importContent() { return { imported: [], skipped: [] }; },
  async checkUpdate() { return { available: false, current: '0.1.0' }; },
  async downloadUpdate() {}, async localUpdate() { return { canceled: true }; },
  async remoteVersions() {
    const cal = ['26.3', '26.2', '26.1.2', '26.1.1', '26.1'];
    const rel = ['1.21.11', '1.21.10', '1.21.9', '1.21.8', '1.21.4', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.17.1', '1.16.5', '1.12.2', '1.8.9'];
    const snap = ['26.4-snapshot-5', '26.4-snapshot-4', '26.4-snapshot-3'];
    return [
      ...cal.map((id) => ({ id, type: 'release' })),
      ...rel.map((id) => ({ id, type: 'release' })),
      ...snap.map((id) => ({ id, type: 'snapshot' }))
    ];
  },
  async installedVersions() { return ['26.3-fabric', '1.20.1-fabric', '1.20.4', '1.21.11']; },
  async installVersion() { await new Promise((r) => setTimeout(r, 800)); return { version: '1.21.1' }; },
  async installFabric(mc) { return { version: mc + '-fabric', loader: '0.16.14' }; },
  async installForge(mc, fv) { return { version: `${mc}-forge-${fv}` }; },
  async forgeList(mc) { return [{ version: '52.0.24' }, { version: '51.0.33' }]; },
  // 演示模式账号仓库：让预览里的增删切换真实生效
  _demoAccounts: [{ id: 'a1', name: 'Steve', type: 'offline' }],
  _demoActive: 'a1',
  async listAccounts() { return [...this._demoAccounts]; },
  async getActiveAccount() { return this._demoAccounts.find((a) => a.id === this._demoActive) || null; },
  async setActiveAccount(id) { this._demoActive = id; return true; },
  async removeAccount(id) { this._demoAccounts = this._demoAccounts.filter((a) => a.id !== id); if (this._demoActive === id) this._demoActive = this._demoAccounts[0]?.id || ''; return this._demoAccounts; },
  async offlineLogin(n) {
    const acc = { id: 'offline-' + n, name: n, type: 'offline' };
    this._demoAccounts = this._demoAccounts.filter((a) => a.id !== acc.id);
    this._demoAccounts.push(acc);
    this._demoActive = acc.id;
    return acc;
  },
  async authlibLogin() { return { name: 'demo' }; },
  async msaStart() { return { userCode: 'DEMO-CODE', verificationUri: 'https://microsoft.com/link' }; },
  async msaPoll() { return { name: 'Demo' }; },
  async listJava() { return [{ major: 17, full: 'openjdk version "17.0.2"', path: '/usr/lib/jvm/temurin-17' }]; },
  async downloadJava() { return { path: '/demo', major: 17 }; },
  async listMods() { return { dir: '~/.minecraft/mods', mods: [{ name: 'sodium-0.6.0.jar', size: 1048576 }] }; },
  async searchMods(q, _v, _l, _pt, cat) {
    const all = [
      { slug: 'sodium', title: 'Sodium', author: 'jellysquid3', description: '现代渲染引擎，大幅提升帧率', downloads: 4800000, loader: 'fabric', iconUrl: '', cats: ['optimization'] },
      { slug: 'jei', title: 'JEI', author: 'mezz', description: 'Just Enough Items 物品查询', downloads: 3900000, loader: 'forge', iconUrl: '', cats: ['utility'] },
      { slug: 'lithium', title: 'Lithium', author: 'jellysquid3', description: '游戏物理与 AI 优化', downloads: 2100000, loader: 'fabric', iconUrl: '', cats: ['optimization'] },
      { slug: 'create', title: 'Create', author: 'simibubi', description: '机械动力：旋转传动自动化', downloads: 1900000, loader: 'forge', iconUrl: '', cats: ['technology'] },
      { slug: 'auth-me', title: 'Auth Me', author: 'axieum', description: '外置登录辅助', downloads: 900000, loader: 'fabric', iconUrl: '', cats: ['utility'] },
      { slug: 'botania', title: 'Botania', author: 'vazkii', description: '自然魔法：花朵与魔力', downloads: 1600000, loader: 'forge', iconUrl: '', cats: ['magic'] },
      { slug: 'twilightforest', title: 'The Twilight Forest', author: 'benimatic', description: '暮色森林维度探险', downloads: 1800000, loader: 'forge', iconUrl: '', cats: ['adventure'] },
      { slug: 'worldedit', title: 'WorldEdit', author: 'enginehub', description: '建筑编辑神器', downloads: 2400000, loader: 'forge', iconUrl: '', cats: ['utility'] },
      { slug: 'supplementaries', title: 'Supplementaries', author: 'mehvahh', description: '大量装饰与小物件', downloads: 1100000, loader: 'forge', iconUrl: '', cats: ['decoration'] },
      { slug: 'ironchests', title: 'Iron Chests', author: 'progwml6', description: '铁箱子等更大容量存储', downloads: 1300000, loader: 'forge', iconUrl: '', cats: ['storage'] },
      { slug: 'farmersdelight', title: "Farmer's Delight", author: 'vectorwing', description: '农夫乐事：烹饪与农业', downloads: 1500000, loader: 'forge', iconUrl: '', cats: ['food'] },
      { slug: 'terralith', title: 'Terralith', author: 'stardustlabs', description: '超多新生物群系的世界生成', downloads: 1200000, loader: 'fabric', iconUrl: '', cats: ['worldgen'] }
    ];
    let hits = all;
    if (q) hits = hits.filter((m) => (m.title + m.description).toLowerCase().includes(q.toLowerCase()));
    if (cat) hits = hits.filter((m) => m.cats.includes(cat));
    return hits.map(({ cats, ...rest }) => rest);
  },
  async installMod(_v, slug, _l, projectType) { return { name: slug + (projectType === 'mod' ? '.jar' : '.zip'), size: 1024, versionNumber: 'demo', dir: '~/demo' }; },
  async listContent(_v, kind) {
    const demo = {
      mods: [{ name: 'sodium-0.6.0.jar', size: 1048576, isDir: false }],
      resourcepacks: [{ name: 'Faithful-32x.zip', size: 5242880, isDir: false }],
      shaderpacks: [{ name: 'Complementary.zip', size: 3145728, isDir: false }],
      saves: [{ name: 'New World', size: 0, isDir: true }]
    };
    return { dir: '~/.minecraft/' + kind, items: demo[kind] || [] };
  },
  async removeContent() {}, async openContentDir() {},
  async getLocalIp() { return '192.168.1.100'; },
  async removeMod() {}, async openModsDir() {},
  launch: async () => ({ pid: 0 }),
  onProgress() {}, onLog() {},
  winMinimize() {}, winMaximize() {}, winClose() {}
};
const api = window.hmcs || demoApi;

let state = {
  config: null,
  remote: [],
  installed: [],
  selectedVersion: null,
  activeAccount: null
};

const THEMES = [
  { name: '草方块绿', color: '#3fae52' },
  { name: '钻石蓝',   color: '#3f8eae' },
  { name: '紫水晶',   color: '#8a5ec2' },
  { name: '岩浆橙',   color: '#d97a2b' },
  { name: '红石红',   color: '#cf4444' }
];

// ---------- toast ----------
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}

// ---------- 主题色 ----------
function applyTheme(color) {
  document.documentElement.style.setProperty('--accent', color);
  $$('#theme-picker button, #theme-dots i').forEach((el) => {
    el.classList.toggle('on', el.dataset.color === color);
  });
}
function buildThemeUI() {
  const picker = $('#theme-picker');
  const dots = $('#theme-dots');
  picker.innerHTML = '';
  dots.innerHTML = '';
  for (const t of THEMES) {
    const b = document.createElement('button');
    b.textContent = t.name;
    b.dataset.color = t.color;
    b.onclick = async () => {
      applyTheme(t.color);
      await api.setConfig({ themeColor: t.color });
    };
    picker.appendChild(b);
    const dot = document.createElement('i');
    dot.style.background = t.color;
    dot.title = t.name;
    dot.dataset.color = t.color;
    dot.onclick = async () => {
      applyTheme(t.color);
      await api.setConfig({ themeColor: t.color });
    };
    dots.appendChild(dot);
  }
}

// ---------- 导航 ----------
$$('.nav').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.nav').forEach((b) => b.classList.remove('active'));
    $$('.page').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    $('#page-' + btn.dataset.page).classList.add('active');
    if (btn.dataset.page === 'accounts') renderAccounts();
    if (btn.dataset.page === 'settings') renderSettings();
    if (btn.dataset.page === 'versions') renderVersionList();
    if (btn.dataset.page === 'mods') { renderMods(); loadHotModsOnce(); }
    if (btn.dataset.page === 'resources') renderResources();
    if (btn.dataset.page === 'multiplayer') renderMultiplayer();
  });
});

// ---------- 窗口 ----------
$('#btn-min').onclick = () => api.winMinimize();
$('#btn-max').onclick = () => api.winMaximize();
$('#btn-close').onclick = () => api.winClose();

// ---------- 进度 / 日志 ----------
api.onProgress(({ total, done, bytes, phaseExtra, step, userCode, verificationUri }) => {
  const ring = $('#ring-fg');
  const wrap = $('#progress-wrap');
  wrap.classList.remove('hidden');
  if (step === 'code') {
    setRing(0);
    $('#progress-text').textContent = `打开 ${verificationUri} 输入代码: ${userCode}`;
    return;
  }
  const pct = total ? done / total : 0;
  setRing(pct);
  $('#progress-fill').style.width = (pct * 100).toFixed(1) + '%';
  const extra = phaseExtra ? `[${phaseExtra}] ` : '';
  $('#progress-text').textContent = `${extra}${done}/${total} (${Math.round(pct * 100)}%) ${fmtBytes(bytes)}`;
});
api.onLog((line) => {
  const box = $('#log-box');
  box.textContent += line + '\n';
  box.scrollTop = box.scrollHeight;
});
$('#btn-clear-log').onclick = () => { $('#log-box').textContent = ''; };

const RING_LEN = 289; // 2πr, r=46
function setRing(p) {
  $('#ring-fg').style.strokeDashoffset = RING_LEN * (1 - Math.min(1, Math.max(0, p)));
}
function fmtBytes(n) {
  if (!n) return '';
  if (n > 1e9) return (n / 1e9).toFixed(1) + 'GB';
  if (n > 1e6) return (n / 1e6).toFixed(1) + 'MB';
  return (n / 1e3).toFixed(0) + 'KB';
}

// ---------- 主页 ----------
async function refreshHome() {
  state.config = await api.getConfig();
  if (state.config.themeColor) applyTheme(state.config.themeColor);
  state.installed = await api.installedVersions();
  state.activeAccount = await api.getActiveAccount();
  const sel = state.selectedVersion || (state.installed.length ? state.installed[0] : null);
  state.selectedVersion = sel;
  $('#home-version').textContent = sel || '未选择版本';
  $('#home-account').textContent = state.activeAccount
    ? `${state.activeAccount.name} · ${accType(state.activeAccount.type)}`
    : '未登录';
}

function accType(t) {
  return { offline: '离线', msa: '正版', authlib: '外置' }[t] || t;
}

$('#pill-version').onclick = async () => {
  $$('.nav').forEach((b) => b.classList.remove('active'));
  $$('.page').forEach((p) => p.classList.remove('active'));
  $$('.nav').find((b) => b.dataset.page === 'versions')?.classList.add('active');
  $('#page-versions').classList.add('active');
  renderVersionList();
};

$('#chip-account').onclick = () => {
  $$('.nav').forEach((b) => b.classList.remove('active'));
  $$('.page').forEach((p) => p.classList.remove('active'));
  $$('.nav').find((b) => b.dataset.page === 'accounts')?.classList.add('active');
  $('#page-accounts').classList.add('active');
  renderAccounts();
};

$('#btn-launch').onclick = async () => {
  if (!state.selectedVersion) return toast('请先选择版本');
  if (!state.activeAccount) return toast('请先添加账号');
  $('#btn-launch').disabled = true;
  try {
    const r = await api.launch(state.selectedVersion);
    toast('游戏已启动' + (r.pid ? ` (pid ${r.pid})` : ''));
  } catch (e) {
    toast('启动失败: ' + e.message);
    // 自动切到日志页，方便定位原因
    $$('.nav').forEach((b) => b.classList.remove('active'));
    $$('.page').forEach((p) => p.classList.remove('active'));
    $$('.nav').find((b) => b.dataset.page === 'logs')?.classList.add('active');
    $('#page-logs').classList.add('active');
    const box = $('#log-box');
    box.textContent += `[hmcs] 启动失败: ${e.message}\n[hmcs] 常见原因: 版本未下载完整 / Java 缺失 / 内存分配过大\n`;
  }
  $('#btn-launch').disabled = false;
  setRing(0);
  $('#progress-wrap').classList.add('hidden');
};

// ---------- 下载页 ----------
let remoteLoaded = false;
async function loadRemote() {
  if (remoteLoaded) return;
  try {
    state.remote = await api.remoteVersions();
    remoteLoaded = true;
  } catch (e) {
    toast('版本清单获取失败: ' + e.message);
  }
}

let verType = 'release';
$$('#ver-type .seg-btn').forEach((b) => {
  b.onclick = () => {
    $$('#ver-type .seg-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    verType = b.dataset.v;
    renderVersionList();
  };
});

async function renderVersionList() {
  await loadRemote();
  const q = $('#ver-search').value.toLowerCase();
  const list = $('#version-list');
  list.innerHTML = '';

  let items;
  if (verType === 'installed') {
    items = state.installed.map((id) => ({ id, type: 'installed' }));
  } else {
    items = state.remote.filter((v) => v.type === verType);
  }
  if (q) items = items.filter((v) => v.id.toLowerCase().includes(q));
  items = items.slice(0, 120);

  items.forEach((v, i) => {
    const installed = state.installed.includes(v.id) || state.installed.some((x) => x.startsWith(v.id + '-'));
    const li = document.createElement('li');
    li.style.animationDelay = (i * 0.02) + 's';
    li.innerHTML = `<span class="grow">${v.id}</span>` +
      (state.selectedVersion === v.id
        ? '<span class="tag on">当前</span>'
        : installed ? '<span class="tag on">已安装</span>' : `<span class="tag">${typeLabel(v.type)}</span>`);
    li.onclick = async () => {
      if (installed) {
        state.selectedVersion = v.id;
        refreshHome();
        renderVersionList();
        toast('已选择 ' + v.id);
        return;
      }
      li.innerHTML = `<span class="grow">${v.id}</span><span class="tag">下载中…</span>`;
      try {
        await api.installVersion(v.id);
        state.installed = await api.installedVersions();
        state.selectedVersion = v.id;
        refreshHome();
        toast(v.id + ' 安装完成');
      } catch (e) {
        toast('安装失败: ' + e.message);
      }
      renderVersionList();
    };
    list.appendChild(li);
  });
}

function typeLabel(t) {
  return { release: '正式', snapshot: '快照', old_beta: 'beta', old_alpha: 'alpha', installed: '本地' }[t] || t;
}

$('#ver-search').oninput = renderVersionList;
$('#btn-refresh-remote').onclick = async () => {
  remoteLoaded = false;
  await loadRemote();
  renderVersionList();
};

// ---------- 加载器 ----------
async function fillLoaderMc() {
  await loadRemote();
  const sel = $('#loader-mc');
  sel.innerHTML = '';
  state.remote.filter((v) => v.type === 'release').slice(0, 20).forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.id;
    sel.appendChild(opt);
  });
  fillModsVersions();
}

$('#btn-fabric').onclick = async () => {
  const mc = $('#loader-mc').value;
  if (!mc) return;
  try {
    const r = await api.installFabric(mc);
    state.installed = await api.installedVersions();
    state.selectedVersion = r.version;
    refreshHome();
    toast('Fabric 安装完成: ' + r.version);
  } catch (e) {
    toast('Fabric 安装失败: ' + e.message);
  }
};

$('#btn-forge').onclick = async () => {
  const mc = $('#loader-mc').value;
  if (!mc) return;
  try {
    const versions = await api.forgeList(mc);
    if (!versions.length) return toast('该版本没有 Forge');
    const label = versions.slice(0, 15).map((v, i) => `${i}: ${v.version}`).join('\n');
    const idx = parseInt(prompt(`选择 Forge 版本 (0-${Math.min(14, versions.length - 1)}):\n${label}`, '0'));
    if (isNaN(idx) || !versions[idx]) return;
    const r = await api.installForge(mc, versions[idx].version);
    state.installed = await api.installedVersions();
    state.selectedVersion = r.version;
    refreshHome();
    toast('Forge 安装完成: ' + r.version);
  } catch (e) {
    toast('Forge 安装失败: ' + e.message);
  }
};

// ---------- 模组页 ----------
async function fillModsVersions() {
  const sel = $('#mods-version');
  sel.innerHTML = '';
  state.installed.forEach((id) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = id;
    sel.appendChild(opt);
  });
}

async function renderMods() {
  const vid = $('#mods-version').value || state.selectedVersion;
  if (!vid) { $('#mods-list').innerHTML = '<li>暂无已安装版本</li>'; return; }
  const { dir, mods } = await api.listMods(vid);
  $('#mods-dir').textContent = '目录: ' + dir;
  const list = $('#mods-list');
  list.innerHTML = '';
  if (!mods.length) {
    list.innerHTML = '<li class="dim">mods 文件夹为空（拖入 .jar 或点击上方按钮打开文件夹）</li>';
    return;
  }
  mods.forEach((m) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="grow">${m.name}</span><span class="tag">${fmtBytes(m.size)}</span><button class="ghost">删除</button>`;
    li.querySelector('button').onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`删除 ${m.name}？`)) return;
      await api.removeMod(vid, m.name);
      renderMods();
      toast('已删除 ' + m.name);
    };
    list.appendChild(li);
  });
}
$('#mods-version').onchange = renderMods;
$('#btn-open-mods').onclick = () => api.openModsDir($('#mods-version').value || state.selectedVersion);
$('#btn-import-mods').onclick = async () => {
  const vid = $('#mods-version').value || state.selectedVersion;
  if (!vid) return toast('请先安装游戏版本');
  const r = await api.importContent(vid, 'mods');
  if (r.imported?.length) { toast(`已导入 ${r.imported.length} 个模组`); renderMods(); }
  else if (r.skipped?.length) toast('导入失败: ' + r.skipped[0]);
};

// ---------- Modrinth 在线模组 ----------
function currentLoader() {
  const vid = $('#mods-version').value || '';
  if (vid.includes('fabric')) return 'fabric';
  if (vid.includes('forge')) return vid.includes('neoforge') ? 'neoforge' : 'forge';
  return 'any';
}

async function searchModsOnline(opts = {}) {
  const vid = $('#mods-version').value || state.selectedVersion;
  if (!vid) return toast('请先在版本页安装游戏');
  const q = $('#mod-search').value.trim();
  const cat = modCat || '';
  const loader = $('#mod-loader').value;
  const list = $('#mod-results');
  list.innerHTML = '<li class="dim">搜索中…</li>';
  $('#mod-cat-hint').textContent = q
    ? `“${q}” 的搜索结果`
    : (CAT_NAMES[cat] || '热门模组') + ' · 按下载量排序';
  try {
    const hits = await api.searchMods(q, vid.replace(/-.*$/, ''), loader, 'mod', cat);
    list.innerHTML = '';
    if (!hits.length) { list.innerHTML = '<li class="dim">没有找到兼容的模组（试试换分类、loader 或关键词）</li>'; return; }
    hits.forEach((h) => {
      const li = document.createElement('li');
      li.innerHTML =
        (h.iconUrl ? `<img class="mod-icon" src="${h.iconUrl}" loading="lazy" onerror="this.remove()">` : '') +
        `<span class="grow"><b>${h.title}</b> <span class="dim">by ${h.author}</span><br>` +
        `<span class="dim small-text">${(h.description || '').slice(0, 60)}</span></span>` +
        `<span class="tag">${h.loader || loader}</span>` +
        `<span class="tag">${h.downloads >= 1e6 ? (h.downloads / 1e6).toFixed(1) + 'M' : (h.downloads / 1000).toFixed(0) + 'k'}</span>` +
        `<button>安装</button>`;
      li.querySelector('button').onclick = async (e) => {
        e.stopPropagation();
        const btn = e.target;
        btn.textContent = '下载中…';
        btn.disabled = true;
        try {
          const r = await api.installMod(vid, h.slug, $('#mod-loader').value === 'any' ? h.loader : $('#mod-loader').value);
          btn.textContent = '已安装 ✓';
          toast(`已安装 ${h.title} (${r.versionNumber})`);
          renderMods();
        } catch (err) {
          btn.textContent = '安装';
          btn.disabled = false;
          toast('安装失败: ' + err.message);
        }
      };
      list.appendChild(li);
    });
  } catch (e) {
    list.innerHTML = `<li class="dim">搜索失败: ${e.message}</li>`;
  }
}
$('#btn-mod-search').onclick = searchModsOnline;
$('#mod-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') searchModsOnline(); });

// 分类筛选 + 热门推荐
const CAT_NAMES = {
  '': '热门模组', optimization: '性能优化', technology: '科技', magic: '魔法',
  adventure: '冒险', decoration: '装饰', utility: '工具', storage: '存储',
  food: '食物', worldgen: '世界生成'
};
let modCat = '';
let hotLoaded = false;
document.querySelectorAll('#mod-cats button').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('#mod-cats button').forEach((b) => b.classList.toggle('active', b === btn));
    modCat = btn.dataset.cat || '';
    searchModsOnline();
  };
});
function loadHotModsOnce() {
  if (hotLoaded) return;
  hotLoaded = true;
  searchModsOnline();
}

// ---------- 资源页（资源包 / 光影 / 世界） ----------
let resKind = 'resourcepacks';
const RES_PROJECT_TYPE = { resourcepacks: 'resourcepack', shaderpacks: 'shader', saves: null };

$$('#res-type .seg-btn').forEach((b) => {
  b.onclick = () => {
    $$('#res-type .seg-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    resKind = b.dataset.kind;
    renderResources();
  };
});

async function fillResVersions() {
  const sel = $('#res-version');
  sel.innerHTML = '';
  state.installed.forEach((id) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = id;
    sel.appendChild(opt);
  });
}

async function renderResources() {
  await fillResVersions();
  const vid = $('#res-version').value || state.selectedVersion;
  $('#res-online-card').style.display = RES_PROJECT_TYPE[resKind] ? '' : 'none';
  if (!vid) { $('#res-list').innerHTML = '<li class="dim">暂无已安装版本</li>'; return; }
  const { dir, items } = await api.listContent(vid, resKind);
  $('#res-dir').textContent = '目录: ' + dir;
  const list = $('#res-list');
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = `<li class="dim">此目录为空${resKind === 'saves' ? '（启动游戏创建世界后会出现在这里）' : ''}</li>`;
    return;
  }
  items.forEach((m) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="grow">${m.name}${m.isDir ? ' <span class="tag">文件夹</span>' : ''}</span>` +
      `<span class="tag">${fmtBytes(m.size)}</span><button class="ghost">删除</button>`;
    li.querySelector('button').onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`删除 ${m.name}？此操作不可恢复。`)) return;
      await api.removeContent(vid, resKind, m.name);
      renderResources();
      toast('已删除 ' + m.name);
    };
    list.appendChild(li);
  });
}
$('#res-version').onchange = renderResources;
$('#btn-open-res').onclick = () => api.openContentDir($('#res-version').value || state.selectedVersion, resKind);
$('#btn-import-res').onclick = async () => {
  const vid = $('#res-version').value || state.selectedVersion;
  if (!vid) return toast('请先安装游戏版本');
  if (resKind === 'saves') return toast('世界是文件夹，请直接放到 saves 目录');
  const r = await api.importContent(vid, resKind);
  if (r.imported?.length) { toast(`已导入 ${r.imported.length} 个文件`); renderResources(); }
  else if (r.skipped?.length) toast('导入失败: ' + r.skipped[0]);
};

$('#btn-res-search').onclick = searchResOnline;
$('#res-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') searchResOnline(); });
async function searchResOnline() {
  const vid = $('#res-version').value || state.selectedVersion;
  if (!vid) return toast('请先安装游戏版本');
  const q = $('#res-search').value.trim();
  const list = $('#res-results');
  list.innerHTML = '<li class="dim">搜索中…</li>';
  try {
    const hits = await api.searchMods(q, vid.replace(/-.*$/, ''), 'any', RES_PROJECT_TYPE[resKind]);
    list.innerHTML = '';
    if (!hits.length) { list.innerHTML = '<li class="dim">没有找到兼容的资源</li>'; return; }
    hits.forEach((h) => {
      const li = document.createElement('li');
      li.innerHTML =
        `<span class="grow"><b>${h.title}</b> <span class="dim">by ${h.author}</span><br>` +
        `<span class="dim small-text">${(h.description || '').slice(0, 60)}</span></span>` +
        `<span class="tag">${(h.downloads / 1000).toFixed(0)}k</span><button>下载</button>`;
      li.querySelector('button').onclick = async (e) => {
        e.stopPropagation();
        const btn = e.target;
        btn.textContent = '下载中…';
        btn.disabled = true;
        try {
          const r = await api.installMod(vid, h.slug, 'any', RES_PROJECT_TYPE[resKind]);
          btn.textContent = '已下载 ✓';
          toast(`已下载 ${h.title} → ${r.name}`);
          renderResources();
        } catch (err) {
          btn.textContent = '下载';
          btn.disabled = false;
          toast('下载失败: ' + err.message);
        }
      };
      list.appendChild(li);
    });
  } catch (e) {
    list.innerHTML = `<li class="dim">搜索失败: ${e.message}</li>`;
  }
}

// ---------- 联机页 ----------
let savedServers = [];

async function renderMultiplayer() {
  await fillResVersions(); // 复用版本填充逻辑到两个下拉框
  const sel = $('#mp-version');
  sel.innerHTML = '';
  state.installed.forEach((id) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = id;
    sel.appendChild(opt);
  });
  state.config = await api.getConfig();
  savedServers = state.config.servers || [];
  const list = $('#mp-list');
  list.innerHTML = savedServers.length ? '' : '<li class="dim">还没有保存的服务器</li>';
  savedServers.forEach((s, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="grow">${s.name || s.ip}</span><span class="tag">${s.ip}:${s.port}</span><button class="ghost">启动</button>`;
    li.querySelector('button').onclick = async (e) => {
      e.stopPropagation();
      connectServer(s.ip, s.port, s.version);
    };
    li.oncontextmenu = async (e) => {
      e.preventDefault();
      savedServers.splice(i, 1);
      await api.setConfig({ servers: savedServers });
      renderMultiplayer();
    };
    list.appendChild(li);
  });
  if (api.getLocalIp) $('#mp-local-ip').textContent = '本机 IP: ' + (await api.getLocalIp());
}

async function connectServer(ip, port, version) {
  const vid = version || $('#mp-version').value || state.selectedVersion;
  if (!vid) return toast('请先安装游戏版本');
  if (!state.activeAccount) return toast('请先添加账号');
  toast(`启动 ${vid} → ${ip}:${port}`);
  try {
    await api.launch(vid, { serverIp: ip, serverPort: port });
  } catch (e) {
    toast('启动失败: ' + e.message);
  }
}

$('#btn-mp-launch').onclick = async () => {
  const ip = $('#mp-ip').value.trim();
  if (!ip) return toast('输入服务器地址');
  const port = parseInt($('#mp-port').value) || 25565;
  // 保存到服务器列表
  if (!savedServers.find((s) => s.ip === ip && s.port === port)) {
    savedServers.unshift({ name: ip, ip, port, version: $('#mp-version').value });
    await api.setConfig({ servers: savedServers.slice(0, 20) });
    renderMultiplayer();
  }
  connectServer(ip, port, $('#mp-version').value);
};

// ---------- 账号页 ----------
async function renderAccounts() {
  const list = $('#account-list');
  const accounts = await api.listAccounts();
  const active = await api.getActiveAccount();
  list.innerHTML = '';
  for (const a of accounts) {
    const li = document.createElement('li');
    if (a.id === active?.id) li.classList.add('sel');
    li.innerHTML = `<span class="grow">${a.name}</span><span class="tag">${accType(a.type)}</span>` +
      (a.id === active?.id ? '<span class="tag on">使用中</span>' : '');
    li.onclick = async () => { await api.setActiveAccount(a.id); renderAccounts(); refreshHome(); };
    li.oncontextmenu = async (e) => {
      e.preventDefault();
      await api.removeAccount(a.id);
      renderAccounts();
      refreshHome();
    };
    list.appendChild(li);
  }
}

$('#btn-off-login').onclick = async () => {
  const name = $('#off-name').value.trim();
  if (!name) return toast('输入用户名');
  await api.offlineLogin(name);
  renderAccounts();
  refreshHome();
  toast('离线账号已添加: ' + name);
};

$('#btn-auth-login').onclick = async () => {
  let server = $('#auth-server').value;
  if (server === 'custom') server = prompt('输入 authlib-injector 服务器 API 地址:');
  if (!server) return;
  try {
    const r = await api.authlibLogin(server, $('#auth-user').value.trim(), $('#auth-pass').value);
    renderAccounts();
    refreshHome();
    toast('外置登录成功: ' + r.name);
  } catch (e) {
    toast('外置登录失败: ' + e.message);
  }
};

$('#btn-msa-login').onclick = async () => {
  try {
    const code = await api.msaStart();
    $('#msa-status').textContent = `打开 ${code.verificationUri} 输入 ${code.userCode}`;
    const acc = await api.msaPoll();
    $('#msa-status').textContent = '';
    renderAccounts();
    refreshHome();
    toast('正版登录成功: ' + acc.name);
  } catch (e) {
    $('#msa-status').textContent = '';
    toast('微软登录失败: ' + e.message);
  }
};

$('#btn-littleskin').onclick = () => {
  if (api.openExternal) api.openExternal('https://littleskin.cn');
  else window.open('https://littleskin.cn', '_blank');
};

// ---------- 设置页 ----------
async function renderSettings() {
  state.config = await api.getConfig();
  if (state.config.themeColor) applyTheme(state.config.themeColor);
  $('#set-source').value = state.config.downloadSource;
  $('#set-maxmem').value = state.config.maxMemoryMB;
  $('#set-msaid').value = state.config.msaClientId || '';
  const javas = await api.listJava();
  const jl = $('#java-list');
  jl.innerHTML = '';
  if (!javas.length) jl.innerHTML = '<li class="dim">未检测到 Java（可用下方按钮自动下载）</li>';
  javas.forEach((j) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="grow">${j.full}</span><span class="tag">Java ${j.major}</span>`;
    jl.appendChild(li);
  });
}

$('#set-source').onchange = async (e) => { await api.setConfig({ downloadSource: e.target.value }); toast('已保存'); };

// ---------- 软件更新 ----------
let updateInfo = null; // 有可用更新时缓存 {version, asarUrl, sha256}
async function renderUpdateCard() {
  $('#set-update-url').value = state.config.updateManifestUrl || '';
  $('#update-status').textContent = '当前版本 ' + (api.appVersion || '');
  if (updateInfo) $('#update-status').textContent = `发现新版本 ${updateInfo.version}！点击"检查更新"旁的按钮即可更新`;
}
$('#set-update-url').onchange = async (e) => { await api.setConfig({ updateManifestUrl: e.target.value.trim() }); toast('更新源已保存'); };
$('#btn-check-update').onclick = (function () {
  let armed = false;
  const handler = async () => {
    if (!armed) {
      // 第一次点击 = 检查（renderUpdateCard 里的主逻辑）
      const st = $('#update-status');
      st.textContent = '正在检查…';
      try {
        const r = await api.checkUpdate();
        updateInfo = r.available ? r : null;
        armed = r.available;
        st.textContent = r.available
          ? `发现新版本 ${r.version}（当前 ${r.current}）${r.notes ? ' — ' + r.notes : ''}`
          : `已是最新版本（${r.current}）`;
        $('#btn-check-update').textContent = r.available ? `下载并更新到 ${r.version}` : '检查更新';
      } catch (e) {
        st.textContent = '检查失败: ' + e.message;
      }
      return;
    }
    // 已确认有更新 → 下载并应用
    const st = $('#update-status');
    st.textContent = '正在下载更新…（完成后将自动重启）';
    $('#btn-check-update').disabled = true;
    try {
      await api.downloadUpdate(updateInfo);
      st.textContent = '更新完成，应用即将重启…';
    } catch (e) {
      st.textContent = '更新失败: ' + e.message;
      $('#btn-check-update').disabled = false;
    }
  };
  return handler;
})();
$('#btn-local-update').onclick = async () => {
  const st = $('#update-status');
  try {
    const r = await api.localUpdate();
    if (r.canceled) return;
    st.textContent = '已应用本地更新包，应用即将重启…';
  } catch (e) {
    st.textContent = '更新失败: ' + e.message;
  }
};
$('#set-maxmem').onchange = async (e) => { await api.setConfig({ maxMemoryMB: parseInt(e.target.value) || 4096 }); toast('已保存'); };
$('#set-msaid').onchange = async (e) => { await api.setConfig({ msaClientId: e.target.value.trim() }); toast('已保存'); };
$('#btn-java-dl').onclick = async () => {
  const major = $('#java-major').value;
  try {
    const r = await api.downloadJava(major);
    toast(`Java ${r.major} 安装完成`);
    renderSettings();
  } catch (e) {
    toast('Java 下载失败: ' + e.message);
  }
};

// ---------- 启动 ----------
buildThemeUI();
refreshHome().then(fillLoaderMc);

// 启动时静默检查更新（仅当配置了更新源）
(async () => {
  try {
    if (!state.config.updateManifestUrl) return;
    const r = await api.checkUpdate();
    if (r.available) {
      updateInfo = r;
      const st = $('#update-status');
      if (st) st.textContent = `发现新版本 ${r.version}！到「设置 → 软件更新」一键更新`;
      toast(`HMCS 有新版本 ${r.version} 可用`);
    }
  } catch (_) { /* 静默失败 */ }
})();
