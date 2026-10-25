// Fabric / Forge 安装 + authlib-injector 外置登录支持
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync, execSync } = require('child_process');
const { MC_DIR, getConfig, ROOT } = require('./config');
const { fetchJson, downloadFile, fetchWithRetry, mirror } = require('./net');

const FABRIC_META = 'https://meta.fabricmc.net/v2';

// ---------- Fabric ----------
async function latestFabricLoader() {
  const list = await fetchJson(`${FABRIC_META}/versions/loader`);
  return list[0]?.version || '0.16.5';
}
// latestFabricLoader 保留备用（全局最新 loader 版本号）

async function installFabric(mcVersion, onProgress) {
  // 获取该 MC 版本支持的 loader 列表（取第一个 = 最新）
  const loaders = await fetchJson(`${FABRIC_META}/versions/loader/${mcVersion}`);
  if (!loaders || !loaders.length) throw new Error(`Fabric 不支持 ${mcVersion}`);
  const loader = loaders[0].loader.version;
  const id = `${mcVersion}-fabric`;
  // profile 端点需要明确 loader 版本号
  const res = await fetchWithRetry(`https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loader}/profile/json`);
  if (!res.ok) throw new Error(`Fabric profile 获取失败: HTTP ${res.status}`);
  const profile = await res.json();
  profile.id = id;

  const dir = path.join(MC_DIR, 'versions', id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(profile, null, 2));

  // 下载 fabric libraries
  const { runPool } = require('./net');
  const files = [];
  for (const lib of profile.libraries || []) {
    const art = lib.downloads?.artifact;
    if (art?.url) files.push({ url: art.url, dest: path.join(MC_DIR, 'libraries', art.path), sha1: art.sha1 });
  }
  let done = 0, bytes = 0;
  await runPool(files, async (f) => {
    const r = await downloadFile(mirror(f.url), f.dest, f.sha1);
    bytes += r.bytes; done++;
    onProgress && onProgress({ total: files.length, done, bytes });
  }, 12);

  return { version: id, loader };
}

// ---------- Forge ----------
async function forgeVersionsFor(mcVersion) {
  const data = await fetchJson('https://bmclapi2.bangbang93.com/forge/minecraft/' + mcVersion);
  return data.map((f) => ({
    version: f.version,
    build: f.build,
    branch: f.branch,
    label: `${mcVersion}-forge-${f.version}`
  })).sort((a, b) => b.build - a.build);
}

async function installForge(mcVersion, forgeVersion, onProgress, onLog) {
  const id = `${mcVersion}-forge-${forgeVersion}`;
  const vdir = path.join(MC_DIR, 'versions', id);
  fs.mkdirSync(vdir, { recursive: true });

  const coords = `${mcVersion}-${forgeVersion}`;
  const installerUrl = `https://bmclapi2.bangbang93.com/maven/net/minecraftforge/forge/${coords}/forge-${coords}-installer.jar`;
  const installerPath = path.join(vdir, 'installer.jar');
  onLog && onLog('[forge] 下载安装器 ' + installerUrl);
  await downloadFile(installerUrl, installerPath, null);
  onProgress && onProgress({ total: 1, done: 1, bytes: fs.statSync(installerPath).size });

  // 解压 installer
  const extractDir = path.join(vdir, 'installer-extract');
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  unzipAll(installerPath, extractDir);

  // version json
  let versionJson;
  const vjsonPath = path.join(extractDir, 'version.json');
  if (fs.existsSync(vjsonPath)) {
    versionJson = JSON.parse(fs.readFileSync(vjsonPath, 'utf8'));
  } else {
    const profile = JSON.parse(fs.readFileSync(path.join(extractDir, 'install_profile.json'), 'utf8'));
    versionJson = profile.versionInfo;
  }
  versionJson.id = id;
  fs.writeFileSync(path.join(vdir, `${id}.json`), JSON.stringify(versionJson, null, 2));

  // 新版 forge：install_profile.json + processors
  const profilePath = path.join(extractDir, 'install_profile.json');
  if (fs.existsSync(profilePath)) {
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    if (profile.processors) {
      await runForgeProcessors(profile, extractDir, installerPath, mcVersion, onProgress, onLog);
    }
  }

  onLog && onLog('[forge] 安装完成: ' + id);
  return { version: id };
}

function unzipAll(zipPath, dest) {
  if (process.platform === 'win32') {
    execSync(`powershell -NoProfile -Command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${dest}'"`, { stdio: 'ignore' });
  } else {
    execSync(`unzip -o "${zipPath}" -d "${dest}"`, { stdio: 'ignore' });
  }
}

function libCoordPath(coord) {
  // group:artifact:version[:classifier]
  const parts = coord.split(':');
  const ext = parts[4] || 'jar';
  const cls = parts[3] ? '-' + parts[3] : '';
  return path.join(
    MC_DIR, 'libraries',
    parts[0].split('.').join('/'), parts[1], parts[2],
    `${parts[1]}-${parts[2]}${cls}.${ext}`
  );
}

async function runForgeProcessors(profile, extractDir, installerPath, mcVersion, onProgress, onLog) {
  const cfg = getConfig();
  const vdir = path.join(MC_DIR, 'versions', `${mcVersion}-forge-TEMP`);
  const vanillaJson = require('./minecraft').loadVersionJson(mcVersion);
  const vanillaJar = path.join(MC_DIR, 'versions', mcVersion, `${mcVersion}.jar`);
  if (!fs.existsSync(vanillaJar)) {
    onLog && onLog('[forge] 先安装原版 ' + mcVersion);
    await require('./minecraft').installVersion(mcVersion, onProgress);
  }

  // 下载 processor 依赖库
  const allLibs = [...(profile.libraries || [])];
  for (const p of profile.processors) {
    allLibs.push({ name: p.jar, downloads: { artifact: p.downloads?.artifact } });
    for (const c of p.classpath || []) {
      if (!allLibs.find((l) => l.name === c)) allLibs.push({ name: c });
    }
  }
  let ddone = 0;
  const dtotal = allLibs.length;
  await require('./net').runPool(allLibs, async (lib) => {
    let art = lib.downloads?.artifact;
    if (!art && lib.name) {
      // 手工推导 maven 路径（BMCLAPI maven 源）
      const parts = lib.name.split(':');
      const ext = parts[4] || 'jar';
      const cls = parts[3] ? '-' + parts[3] : '';
      const repoPath = `${parts[0].split('.').join('/')}/${parts[1]}/${parts[2]}/${parts[1]}-${parts[2]}${cls}.${ext}`;
      art = { path: repoPath, url: `https://bmclapi2.bangbang93.com/maven/${repoPath}` };
    }
    if (art && art.url) {
      await downloadFile(art.url.startsWith('http') ? art.url : `https://bmclapi2.bangbang93.com/maven/${art.path}`,
        path.join(MC_DIR, 'libraries', art.path), art.sha1);
    }
    ddone++;
    onProgress && onProgress({ total: dtotal, done: ddone, bytes: 0 });
  }, 12);

  const vanillaVersionJson = require('./minecraft').loadVersionJson(mcVersion);

  // data 解析
  const dataRaw = profile.data || {};
  const resolved = {};
  const resolveValue = (val, depth = 0) => {
    if (depth > 5) return val;
    if (typeof val !== 'string') return val;
    if (val.startsWith('[') && val.endsWith(']')) {
      const p = libCoordPath(val.slice(1, -1));
      return p;
    }
    if (val.startsWith('{') && val.endsWith('}')) {
      const key = val.slice(1, -1);
      if (resolved[key] !== undefined) return resolved[key];
      return specialData(key);
    }
    // installer 内嵌文件（如 data/client.lzma）
    const inner = path.join(extractDir, val);
    if (fs.existsSync(inner) && fs.statSync(inner).isFile()) return inner;
    return val;
  };
  const resolveData = (val, depth = 0) => {
    if (typeof val !== 'string') return val;
    if (val.startsWith('[') && val.endsWith(']')) return libCoordPath(val.slice(1, -1));
    if (val.startsWith('{') && val.endsWith('}')) {
      const key = val.slice(1, -1);
      if (resolved[key] !== undefined) return resolved[key];
      const sp = specialData(key);
      if (sp !== undefined) return sp;
      const raw = dataRaw[key];
      if (raw) {
        const out = resolveData(raw.client !== undefined ? raw.client : raw, depth + 1);
        resolved[key] = out;
        return out;
      }
      return val;
    }
    const inner = path.join(extractDir, val);
    if (fs.existsSync(inner) && fs.statSync(inner).isFile()) return inner;
    return val;
  };

  function specialData(key) {
    switch (key) {
      case 'SIDE': return 'client';
      case 'MINECRAFT_JAR':
      case 'MINECRAFT_CLIENT': return vanillaJar;
      case 'MINECRAFT_VERSION': return mcVersion;
      case 'ROOT': return path.dirname(path.dirname(vanillaJar));
      case 'INSTALLER': return installerPath;
      case 'LIBRARY_DIR': return path.join(MC_DIR, 'libraries');
      default: return undefined;
    }
  }

  // 逐个执行 processors
  const javaPath = pickJavaPath(8) || 'java';
  for (const proc of profile.processors) {
    if (proc.sides && !proc.sides.includes('client')) continue;
    const jarPath = libCoordPath(proc.jar);
    const cp = [...(proc.classpath || []).map((c) => libCoordPath(c)), jarPath];
    const args = proc.args.map((a) => {
      if (typeof a !== 'string') return a;
      if (a.startsWith('{') && a.endsWith('}')) return resolveData(a);
      if (a.startsWith('[') && a.endsWith(']')) return libCoordPath(a.slice(1, -1));
      // 字符串内嵌 token
      return a.replace(/\{([A-Z_0-9]+)\}/g, (m, k) => resolveData(m));
    });
    onLog && onLog('[forge] processor: ' + path.basename(jarPath));
    const r = spawnSync(javaPath, ['-cp', cp.join(path.delimiter), proc.main || mainClassOf(jarPath), ...args], {
      stdio: 'inherit',
      cwd: vdir
    });
    if (r.error) {
      onLog && onLog('[forge] processor 执行失败(可能可忽略): ' + r.error.message);
    }
  }
}

function mainClassOf(jarPath) {
  // 从 jar 里读 Main-Class
  try {
    const out = execSync(`unzip -p "${jarPath}" META-INF/MANIFEST.MF`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
    const m = out.match(/Main-Class:\s*([^\r\n]+)/);
    if (m) return m[1].trim();
  } catch (e) {}
  return '';
}

function pickJavaPath(major) {
  const { listJava } = require('./java');
  try {
    const found = listJava().find((j) => j.major === major);
    return found ? found.path : null;
  } catch (e) { return null; }
}

// ---------- authlib-injector ----------
const AUTHLIB_DIR = path.join(ROOT, 'authlib-injector');

async function fetchAuthlibInjector(onProgress) {
  fs.mkdirSync(AUTHLIB_DIR, { recursive: true });
  const meta = await fetchJson('https://authlib-injector.yushi.moe/~download/artifact/latest.json');
  const url = meta.download_url;
  const dest = path.join(AUTHLIB_DIR, `authlib-injector-${meta.version}.jar`);
  await downloadFile(url, dest, meta.sha1, () => {});
  onProgress && onProgress({ total: 1, done: 1, bytes: meta.size || 0 });
  return dest;
}

function authlibJarPath() {
  if (!fs.existsSync(AUTHLIB_DIR)) return null;
  const jars = fs.readdirSync(AUTHLIB_DIR).filter((f) => f.endsWith('.jar'));
  return jars.length ? path.join(AUTHLIB_DIR, jars.sort().pop()) : null;
}

// 启动时是否注入 authlib-injector：仅当当前账号是外置登录且 jar 已就绪
function activeAuthlibAgent() {
  const jar = authlibJarPath();
  if (!jar) return null;
  const acc = require('./account').getActiveAccount();
  if (!acc || acc.type !== 'authlib' || !acc.server) return null;
  return { jar, server: acc.server };
}

module.exports = {
  installFabric,
  installForge,
  forgeVersionsFor,
  fetchAuthlibInjector,
  authlibJarPath,
  activeAuthlibAgent,
  listAuthServers: () => [
    { name: 'LittleSkin', url: 'https://littleskin.cn/api/yggdrasil' },
    { name: '自定义', url: getConfig().authServerUrl }
  ]
};
