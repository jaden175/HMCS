// 整合包（modpack）导入：.mrpack（Modrinth 格式）安装为独立实例，loose zip 按内容导入
const fs = require('fs');
const path = require('path');
const os = require('os');
const { MC_DIR, getConfig } = require('./config');
const { downloadFile, runPool } = require('./net');
const { listEntries, extractZip, readTextFile } = require('./zip');

// ---------- 文件识别 ----------
// 返回：modpack(.mrpack/Modrinth zip) / curseforge / loose-pack(含 mods 的散包) / mod / resourcepack / shaderpack / unknown
function classify(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jar') return 'mod';
  if (ext === '.mrpack') return 'modpack';
  if (ext === '.zip') {
    let names;
    try { names = listEntries(filePath).map((e) => e.name); } catch (e) { return 'unknown'; }
    if (names.includes('modrinth.index.json')) return 'modpack';
    if (names.includes('manifest.json') && names.some((n) => n.startsWith('minecraft/'))) return 'curseforge';
    if (names.some((n) => /^mods\/[^/]+\.jar$/i.test(n))) return 'loose-pack';
    if (names.some((n) => /^shaders?\//i.test(n))) return 'shaderpack';
    if (names.includes('pack.mcmeta')) return 'resourcepack';
    return 'resourcepack';
  }
  return 'unknown';
}

function slugify(s) {
  return String(s || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 48) || 'modpack';
}

function safeRel(p) {
  const clean = String(p || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean || clean.includes('..') || /^[a-zA-Z]:/.test(clean)) return null;
  return clean;
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) n += copyDir(s, d);
    else {
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
      n++;
    }
  }
  return n;
}

// 生成唯一实例 id：名字重复时自动加 -2、-3
function uniqueVersionId(base) {
  const dir = path.join(MC_DIR, 'versions');
  let id = base;
  let i = 2;
  while (fs.existsSync(path.join(dir, id))) id = `${base}-${i++}`;
  return id;
}

// ---------- .mrpack 安装 ----------
// 流程：解出 index → 装原版 → 装加载器 → 建实例 json → 下载 files[] → 铺 overrides
async function installModpack(filePath, { onProgress, onLog } = {}) {
  const log = (s) => onLog && onLog('[modpack] ' + s);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hmcs-pack-'));
  try {
    const indexRaw = readTextFile(filePath, 'modrinth.index.json');
    if (!indexRaw) throw new Error('这不是 Modrinth 整合包（缺少 modrinth.index.json）');
    const index = JSON.parse(indexRaw);
    const deps = index.dependencies || {};
    const mc = deps.minecraft;
    if (!mc) throw new Error('整合包没有声明 Minecraft 版本');

    // 解出 overrides（真正的下载内容在后面按 index 拉）
    log('解包 overrides…');
    extractZip(filePath, tmp, (n) => n.startsWith('overrides/') || n.startsWith('client-overrides/'));

    // 1) 原版
    log(`安装原版 ${mc}…`);
    await installVersionSafe(mc, onProgress, log);

    // 2) 加载器
    let baseId = mc;
    if (deps['fabric-loader']) {
      log(`安装 Fabric (loader ${deps['fabric-loader']})…`);
      const r = await require('./modloader').installFabric(mc, onProgress);
      baseId = r.version;
    } else if (deps.forge) {
      log(`安装 Forge ${deps.forge}…`);
      const r = await require('./modloader').installForge(mc, deps.forge, onProgress, log);
      baseId = r.version;
    } else if (deps['quilt-loader']) {
      throw new Error('该整合包使用 Quilt 加载器，HMCS 暂不支持（可改用 Fabric 版本整合包）');
    } else if (deps.neoforge) {
      throw new Error('该整合包使用 NeoForge，HMCS 暂不支持（可改用 Fabric/Forge 版本）');
    }

    // 3) 实例目录 + 版本 json（继承加载器版本，游戏目录即实例目录）
    const label = index.name || path.basename(filePath, path.extname(filePath));
    const packId = uniqueVersionId(slugify(label) + (index.versionId ? '-' + slugify(index.versionId) : ''));
    const packDir = path.join(MC_DIR, 'versions', packId);
    fs.mkdirSync(packDir, { recursive: true });
    const vjson = {
      id: packId,
      inheritsFrom: baseId,
      type: 'release',
      releaseTime: new Date().toISOString(),
      time: new Date().toISOString(),
      _hmcsPack: { name: label, version: index.versionId || '', mc, loader: deps['fabric-loader'] ? 'fabric' : deps.forge ? 'forge' : 'vanilla' }
    };
    fs.writeFileSync(path.join(packDir, `${packId}.json`), JSON.stringify(vjson, null, 2));

    // 4) 下载 files[]
    const files = (index.files || []).map((f) => {
      const rel = safeRel(f.path);
      const url = (f.downloads || [])[0];
      return rel && url ? { rel, url, sha1: f.hashes?.sha1, size: f.fileSize || 0 } : null;
    }).filter(Boolean);
    log(`整合包内含 ${files.length} 个文件，开始下载…`);
    let done = 0;
    let bytes = 0;
    let fail = 0;
    const total = files.length;
    await runPool(files, async (f) => {
      try {
        const r = await downloadFile(f.url, path.join(packDir, f.rel), f.sha1);
        bytes += r.bytes || f.size;
      } catch (e) {
        fail++;
        log(`失败 ${f.rel}: ${e.message}`);
      }
      done++;
      onProgress && onProgress({ total, done, bytes, phaseExtra: 'modpack' });
    }, Math.min(8, getConfig().maxConcurrency || 8));

    // 5) overrides / client-overrides
    const copied = copyDir(path.join(tmp, 'overrides'), packDir) + copyDir(path.join(tmp, 'client-overrides'), packDir);

    log(`完成：${label} → ${packId}（${files.length - fail} 个文件，overrides ${copied} 个）`);
    return {
      versionId: packId,
      name: label,
      mc,
      loader: deps['fabric-loader'] ? 'fabric' : deps.forge ? 'forge' : 'vanilla',
      files: files.length,
      failed: fail,
      overrideFiles: copied
    };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
}

async function installVersionSafe(mc, onProgress, log) {
  const { installVersion, versionJsonPath } = require('./minecraft');
  if (fs.existsSync(versionJsonPath(mc))) return;
  log(`下载原版 ${mc}…`);
  await installVersion(mc, onProgress);
}

// ---------- 散包（根目录带 mods/ 的整合包）----------
// 直接把这几个目录里的内容并进目标版本的对应目录
const LOOSE_DIRS = ['mods', 'resourcepacks', 'shaderpacks', 'config', 'defaultconfigs', 'kubejs', 'scripts'];

function importLoosePack(filePath, versionId, { onLog } = {}) {
  const log = (s) => onLog && onLog('[pack] ' + s);
  const target = path.join(MC_DIR, 'versions', versionId);
  if (!fs.existsSync(path.join(target, `${versionId}.json`))) throw new Error(`版本 ${versionId} 未安装`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hmcs-loose-'));
  try {
    extractZip(filePath, tmp, (n) => LOOSE_DIRS.some((d) => n.startsWith(d + '/')));
    let count = 0;
    for (const d of LOOSE_DIRS) count += copyDir(path.join(tmp, d), path.join(target, d));
    log(`散包导入 ${versionId}：${count} 个文件`);
    return { versionId, imported: count, dirs: LOOSE_DIRS.filter((d) => fs.existsSync(path.join(tmp, d))) };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
}

// ---------- 统一拖入入口 ----------
// 返回每个文件的处理结果，供 UI 汇总提示
async function importDropped(paths, versionId, { onProgress, onLog } = {}) {
  const { importContentFiles } = require('./mods');
  const out = [];
  for (const p of paths || []) {
    const base = path.basename(p);
    try {
      if (!fs.existsSync(p)) { out.push({ file: base, ok: false, message: '文件不存在' }); continue; }
      const kind = classify(p);
      if (kind === 'modpack') {
        const r = await installModpack(p, { onProgress, onLog });
        out.push({ file: base, ok: true, kind, ...r, message: `整合包「${r.name}」已安装为版本 ${r.versionId}` });
      } else if (kind === 'curseforge') {
        out.push({ file: base, ok: false, kind, message: 'CurseForge 整合包需要官方 API 授权，暂不支持自动安装；请解压后把 mods 文件夹拖进来，或改用 Modrinth 版整合包' });
      } else if (kind === 'loose-pack') {
        if (!versionId) throw new Error('请先在「下载」页安装并选择一个游戏版本');
        const r = importLoosePack(p, versionId, { onLog });
        out.push({ file: base, ok: true, kind, ...r, message: `已把 ${r.imported} 个文件导入到 ${versionId}` });
      } else if (kind === 'mod' || kind === 'resourcepack' || kind === 'shaderpack') {
        if (!versionId) throw new Error('请先在「下载」页安装并选择一个游戏版本');
        const target = kind === 'mod' ? 'mods' : kind === 'resourcepack' ? 'resourcepacks' : 'shaderpacks';
        const r = importContentFiles(versionId, target, [p]);
        if (!r.imported.length) throw new Error(r.skipped[0] || '导入失败');
        out.push({ file: base, ok: true, kind, message: `${base} 已放入 ${versionId}/${target}` });
      } else {
        out.push({ file: base, ok: false, kind, message: '认不出这个文件类型（支持 .mrpack / .zip 整合包 / .jar 模组）' });
      }
    } catch (e) {
      out.push({ file: base, ok: false, message: e.message });
    }
  }
  return out;
}

module.exports = { classify, installModpack, importLoosePack, importDropped, slugify };
