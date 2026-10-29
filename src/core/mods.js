// 资源管理：mods / 资源包 / 光影 / 世界 的本地管理 + Modrinth 在线搜索/下载
const fs = require('fs');
const path = require('path');
const { MC_DIR, getConfig } = require('./config');
const { downloadFile, fetchWithRetry } = require('./net');

const MODRINTH_API = 'https://api.modrinth.com/v2';
const UA = 'HMCS-Launcher/0.1.0 (Hallo Minecraft Space)';

// kind → 子目录与文件过滤器
const KINDS = {
  mods: { dir: 'mods', exts: ['.jar'] },
  resourcepacks: { dir: 'resourcepacks', exts: ['.zip'] },
  shaderpacks: { dir: 'shaderpacks', exts: ['.zip'] },
  saves: { dir: 'saves', exts: null } // 世界是文件夹，列出目录
};

function kindRoot(versionId, kind) {
  const cfg = getConfig();
  const base = cfg.gameDir || path.join(MC_DIR, 'versions', versionId);
  return path.join(base, KINDS[kind]?.dir || kind);
}

function listContent(versionId, kind = 'mods') {
  const dir = kindRoot(versionId, kind);
  if (!fs.existsSync(dir)) return { dir, items: [] };
  const k = KINDS[kind];
  const items = fs.readdirSync(dir)
    .filter((f) => {
      if (f.startsWith('.')) return false;
      if (kind === 'saves') return fs.statSync(path.join(dir, f)).isDirectory();
      return k.exts.some((e) => f.toLowerCase().endsWith(e));
    })
    .map((f) => {
      const st = fs.statSync(path.join(dir, f));
      return { name: f, size: st.size, mtime: st.mtimeMs, isDir: st.isDirectory() };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { dir, items };
}

function removeContent(versionId, kind, name) {
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new Error('非法文件名');
  }
  const dir = kindRoot(versionId, kind);
  const target = path.join(dir, name);
  if (!path.resolve(target).startsWith(path.resolve(dir))) throw new Error('非法路径');
  if (!fs.existsSync(target)) throw new Error('不存在: ' + name);
  fs.rmSync(target, { recursive: true, force: true });
  return true;
}

// 兼容旧接口（mods 页）
function modsDir(versionId) { return kindRoot(versionId, 'mods'); }
function listMods(versionId) {
  const { dir, items } = listContent(versionId, 'mods');
  return { dir, mods: items };
}
function removeMod(versionId, name) { return removeContent(versionId, 'mods', name); }

// ---------- Modrinth 在线搜索 ----------
// projectType: mod / resourcepack / shader；category: Modrinth 分类（optimization/technology/magic/...，空 = 不限）
// offset/sort 支持分页与排序：一个版本下 Modrinth 常有上万条结果，必须能翻页
const PAGE_SIZE = 40;

async function searchContent(query, mcVersion, loader, projectType = 'mod', category = '', offset = 0, sort = '') {
  const facets = [[`project_type:${projectType}`], [`versions:${mcVersion}`]];
  if (loader && loader !== 'any' && projectType === 'mod') facets.push([`categories:${loader}`]);
  if (category) facets.push([`categories:${category}`]);
  const index = sort || (query ? 'relevance' : 'downloads');
  const url = `${MODRINTH_API}/search?limit=${PAGE_SIZE}&offset=${Math.max(0, parseInt(offset, 10) || 0)}` +
    `&index=${encodeURIComponent(index)}&query=${encodeURIComponent(query || '')}` +
    `&facets=${encodeURIComponent(JSON.stringify(facets))}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`Modrinth 搜索失败: HTTP ${res.status}`);
  const data = await res.json();
  const hits = (data.hits || []).map((h) => ({
    projectId: h.project_id,
    slug: h.slug,
    title: h.title,
    description: h.description,
    author: h.author,
    downloads: h.downloads,
    iconUrl: h.icon_url || '',
    loader: h.display_categories?.find((c) => ['fabric', 'forge', 'neoforge', 'quilt'].includes(c)) || ''
  }));
  return { hits, total: data.total_hits || hits.length, offset: Math.max(0, parseInt(offset, 10) || 0), pageSize: PAGE_SIZE };
}

function mcVersionOf(versionId) {
  const m = versionId.match(/^(\d+\.\d+(?:\.\d+)?)/);
  if (!m) throw new Error(`无法从 ${versionId} 识别游戏版本`);
  return m[1];
}

// ---------- 本地文件直接导入 ----------
// 把用户选好的 jar/zip 直接复制进对应目录（"向启动器里发文件"），按 KINDS 校验扩展名
function importContentFiles(versionId, kind, filePaths) {
  const def = KINDS[kind];
  if (!def || !def.exts) throw new Error(`该类型不支持文件导入: ${kind}`);
  const dir = kindRoot(versionId, kind);
  fs.mkdirSync(dir, { recursive: true });
  const imported = [], skipped = [];
  for (const p of filePaths || []) {
    const base = path.basename(p);
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) { skipped.push(base + '（文件不存在）'); continue; }
    if (!def.exts.includes(path.extname(base).toLowerCase())) {
      skipped.push(base + `（需要 ${def.exts.join('/')}）`); continue;
    }
    if (base.includes('..') || path.sep === '/' && base.startsWith('/')) { skipped.push(base + '（非法路径）'); continue; }
    const dest = path.join(dir, base);
    fs.copyFileSync(p, dest);
    imported.push({ name: base, size: fs.statSync(dest).size });
  }
  return { dir, imported, skipped };
}

// 下载兼容版本：mod 装 jar 进 mods，资源包/光影装 zip 进对应目录
async function installContent(versionId, slugOrId, loader, projectType = 'mod', onProgress) {
  const gv = encodeURIComponent(JSON.stringify([mcVersionOf(versionId)]));
  let vUrl = `${MODRINTH_API}/project/${encodeURIComponent(slugOrId)}/version?game_versions=${gv}`;
  if (loader && loader !== 'any' && projectType === 'mod') {
    vUrl += `&loaders=${encodeURIComponent(JSON.stringify([loader]))}`;
  }
  const res = await fetchWithRetry(vUrl);
  if (!res.ok) throw new Error(`获取版本失败: HTTP ${res.status}`);
  const versions = await res.json();
  if (!versions.length) throw new Error('没有兼容当前游戏版本的文件');

  const primary = versions[0].files.find((f) => f.primary) || versions[0].files[0];
  if (!primary?.url) throw new Error('版本文件缺失');
  if (primary.filename.includes('/') || primary.filename.includes('..')) throw new Error('非法文件名');

  const dir = kindRoot(versionId, projectType === 'mod' ? 'mods' : projectType + 's');
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, primary.filename);
  await downloadFile(primary.url, dest, primary.hashes?.sha1, null);
  onProgress && onProgress({ total: 1, done: 1, bytes: primary.size || 0 });
  return { name: primary.filename, size: primary.size, versionNumber: versions[0].version_number, dir };
}

module.exports = {
  KINDS, kindRoot, listContent, removeContent,
  modsDir, listMods, removeMod,
  searchContent, installContent, importContentFiles,
  // 旧命名兼容
  searchMods: (q, v, l) => searchContent(q, v, l, 'mod'),
  installMod: (v, s, l, p) => installContent(v, s, l, 'mod', p)
};
