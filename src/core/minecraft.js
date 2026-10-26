// Minecraft 版本管理：清单获取、下载安装、启动
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { MC_DIR, getConfig } = require('./config');
const { fetchJson, downloadFile, runPool, mirror } = require('./net');
const { ensureJavaForVersion, pickJava } = require('./java');
const { buildAuthArgs } = require('./account');
const { activeAuthlibAgent } = require('./modloader');

const MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';

let manifestCache = null;

async function getRemoteVersions() {
  if (!manifestCache) manifestCache = await fetchJson(MANIFEST_URL);
  return manifestCache.versions.map((v) => ({
    id: v.id,
    type: v.type, // release / snapshot / old_beta / old_alpha
    releaseTime: v.releaseTime
  }));
}

function versionsDir() {
  return path.join(MC_DIR, 'versions');
}

// 获取已安装版本（包含独立 Forge/Fabric 生成的版本目录）
function getInstalledVersions() {
  const dir = versionsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => {
    const json = path.join(dir, name, `${name}.json`);
    return fs.existsSync(json);
  });
}

function versionJsonPath(id) {
  return path.join(versionsDir(), id, `${id}.json`);
}

async function loadVersionJson(id) {
  // 本地优先（Forge/Fabric 复合版有 inheritsFrom）
  const local = versionJsonPath(id);
  if (fs.existsSync(local)) {
    return JSON.parse(fs.readFileSync(local, 'utf8'));
  }
  // 远端下载
  const manifest = manifestCache || (manifestCache = await fetchJson(MANIFEST_URL));
  const entry = manifest.versions.find((v) => v.id === id);
  if (!entry) throw new Error(`未知版本: ${id}`);
  return await fetchJson(entry.url);
}

// 展开继承链（vanilla <- fabric/forge）
function resolveInherits(id, json) {
  if (!json.inheritsFrom) return json;
  const parent = resolveInherits(json.inheritsFrom, loadVersionJsonSync(json.inheritsFrom));
  const merged = JSON.parse(JSON.stringify(parent));

  // 合并 libraries
  if (json.libraries) {
    const ids = new Set(json.libraries.map((l) => (l.name || '').split(':')[0] + ':' + (l.name || '').split(':')[1]));
    const parentLibs = (merged.libraries || []).filter((l) => {
      const n = l.name || '';
      return !ids.has(n.split(':')[0] + ':' + n.split(':')[1]);
    });
    merged.libraries = [...parentLibs, ...json.libraries];
  }
  // 主类覆盖
  if (json.mainClass) merged.mainClass = json.mainClass;
  // jar 覆盖（forge 常见）
  if (json.jar) merged.jar = json.jar;
  // arguments 覆盖
  if (json.minecraftArguments) {
    merged.minecraftArguments = json.minecraftArguments;
    delete merged.arguments;
  } else if (json.arguments) {
    merged.arguments = {
      game: [...(parent.arguments?.game || []), ...(json.arguments.game || [])],
      jvm: [...(parent.arguments?.jvm || []), ...(json.arguments.jvm || [])]
    };
  }
  // assetIndex 沿用父版本
  return merged;
}

function loadVersionJsonSync(id) {
  return JSON.parse(fs.readFileSync(versionJsonPath(id), 'utf8'));
}

// ---------- 安装 ----------
async function installVersion(id, onProgress) {
  const cfg = getConfig();
  const dir = path.join(versionsDir(), id);
  fs.mkdirSync(dir, { recursive: true });
  const jsonPath = versionJsonPath(id);
  let version;

  if (!fs.existsSync(jsonPath)) {
    const manifest = manifestCache || (manifestCache = await fetchJson(MANIFEST_URL));
    const entry = manifest.versions.find((v) => v.id === id);
    if (!entry) throw new Error(`未知版本: ${id}`);
    version = await fetchJson(entry.url);
    fs.writeFileSync(jsonPath, JSON.stringify(version, null, 2));
  } else {
    version = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  }

  const vdir = path.join(MC_DIR, 'versions', id);
  const files = [];

  // 客户端 jar
  const clientUrl = version.downloads?.client?.url;
  if (clientUrl) {
    files.push({
      url: clientUrl,
      dest: path.join(vdir, `${id}.jar`),
      sha1: version.downloads.client.sha1
    });
  }

  // libraries
  const libRoot = path.join(MC_DIR, 'libraries');
  for (const lib of version.libraries || []) {
    const rules = lib.rules;
    if (rules && !rulesAllow(rules)) continue;

    const art = lib.downloads?.artifact;
    if (art && art.url) {
      files.push({ url: art.url, dest: path.join(libRoot, art.path), sha1: art.sha1 });
    }
    const natives = lib.downloads?.classifiers;
    if (natives) {
      const key = natives['natives-' + platKey()];
      if (key) files.push({ url: key.url, dest: path.join(libRoot, key.path), sha1: key.sha1 });
    }
  }

  // assets
  let assetsIndexId = version.assets || 'legacy';
  if (version.assetIndex) {
    const aiPath = path.join(MC_DIR, 'assets', 'indexes', `${version.assetIndex.id}.json`);
    files.push({ url: version.assetIndex.url, dest: aiPath, sha1: version.assetIndex.sha1 });
    assetsIndexId = version.assetIndex.id;
  }

  let done = 0;
  let bytes = 0;
  const report = () => onProgress && onProgress({ total: files.length, done, bytes });

  await runPool(files, async (f) => {
    const r = await downloadFile(mirror(f.url), f.dest, f.sha1);
    bytes += r.bytes;
    done++;
    report();
  }, cfg.maxConcurrency);

  // asset objects
  const aiFile = path.join(MC_DIR, 'assets', 'indexes', `${assetsIndexId}.json`);
  if (fs.existsSync(aiFile)) {
    const idx = JSON.parse(fs.readFileSync(aiFile, 'utf8'));
    const objects = Object.values(idx.objects || {});
    const assetRoot = path.join(MC_DIR, 'assets', 'objects');
    let adone = 0;
    let afail = 0;
    let afailMsg = '';
    const total = objects.length;
    const areport = () => onProgress && onProgress({ total, done: adone, bytes, phaseExtra: 'assets' });
    await runPool(objects, async (o) => {
      const hash = o.hash;
      const dest = path.join(assetRoot, hash.slice(0, 2), hash);
      const url = `https://resources.download.minecraft.net/${hash.slice(0, 2)}/${hash}`;
      try {
        const r = await downloadFile(mirror(url), dest, hash);
        bytes += r.bytes;
      } catch (e) {
        afail++;
        if (!afailMsg) afailMsg = e.message; /* 个别资源失败不阻塞，但记录原因 */
      }
      adone++;
      areport();
    }, cfg.maxConcurrency);
    // 失败过多说明不是个别资源问题，给出明确提示（多为权限/网络问题）
    if (afail > 0 && afail >= Math.min(50, Math.ceil(total * 0.1))) {
      throw new Error(`游戏资源下载失败过多（${afail}/${total}）：${afailMsg}。请检查网络或数据目录权限（sudo chown -R $USER ~/.config/HMCS）`);
    }
  }

  return { version: id, files: files.length };
}

function platKey() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'osx';
  return 'linux';
}

function rulesAllow(rules) {
  let allow = false;
  for (const r of rules) {
    const matchOS = !r.os || r.os.name === platKey() || (r.os.name === 'osx' && false);
    const matchArch = !r.os?.arch || r.os.arch === (process.arch === 'x64' ? 'x86' : process.arch);
    if (matchOS && matchArch) allow = r.action === 'allow';
  }
  return allow;
}

// ---------- 启动 ----------
function libPathFromName(name) {
  // group:artifact:version[@classifier]
  const parts = name.split(':');
  const [group, artifact, ver] = parts;
  const classifierPart = parts[3] ? '-' + parts[3] : '';
  const ext = parts[4] || 'jar';
  return path.join(
    MC_DIR, 'libraries',
    group.split('.').join('/'), artifact, ver,
    `${artifact}-${ver}${classifierPart}.${ext}`
  );
}

async function launchGame(versionId, { onLog, onProgress, serverIp, serverPort } = {}) {
  const cfg = getConfig();

  // ---- 启动前自检：把常见失败原因用明确的话报出来 ----
  if (!fs.existsSync(versionJsonPath(versionId))) {
    throw new Error(`版本 ${versionId} 未安装，请先到「下载」页安装`);
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(versionJsonPath(versionId), 'utf8'));
  } catch (e) {
    throw new Error(`版本配置损坏（${versionId}.json 无法解析），请删除后重新安装该版本`);
  }
  const version = resolveInherits(versionId, raw);
  const vdir = path.join(versionsDir(), versionId);
  const gameDir = cfg.gameDir || vdir;
  fs.mkdirSync(gameDir, { recursive: true });

  // 确保 vanilla 客户端 jar 存在（forge/fabric 复合版）
  const vanillaId = version.inheritsFrom || versionId;
  const clientJarName = version.jar || versionId;
  let mainJar = path.join(vdir, `${clientJarName}.jar`);
  if (!fs.existsSync(mainJar)) {
    onLog && onLog(`[hmcs] 缺少客户端 jar，正在补全 ${vanillaId}...`);
    try {
      await installVersion(vanillaId, onProgress);
    } catch (e) {
      throw new Error(`客户端文件下载失败：${e.message}（可在设置中切换下载源后重试）`);
    }
    mainJar = path.join(versionsDir(), vanillaId, `${vanillaId}.jar`);
  }

  // 资源自检：index 对象缺失过多时自动补齐（历史权限问题/中断会留下残缺资源目录）
  try {
    const aiId = version.assetIndex?.id || version.assets || 'legacy';
    const aiPath2 = path.join(MC_DIR, 'assets', 'indexes', `${aiId}.json`);
    if (fs.existsSync(aiPath2)) {
      const objs = Object.values(JSON.parse(fs.readFileSync(aiPath2, 'utf8')).objects || {});
      const missing = objs.filter((o) => !fs.existsSync(path.join(MC_DIR, 'assets', 'objects', o.hash.slice(0, 2), o.hash)));
      if (missing.length > Math.max(10, Math.floor(objs.length * 0.01))) {
        onLog && onLog(`[hmcs] 检测到游戏资源缺失 ${missing.length}/${objs.length} 个，自动补全中...`);
        await installVersion(vanillaId, (p) => {
          if (p.phaseExtra === 'assets' && p.done % 200 === 0) onLog && onLog(`[hmcs] 资源补全 ${p.done}/${p.total}`);
        });
        onLog && onLog('[hmcs] 资源补全完成');
      }
    }
  } catch (e) {
    onLog && onLog(`[hmcs] 资源自检跳过（${e.message}）`);
  }

  // Java（缺失时自动下载；失败给出明确提示）
  let javaInfo;
  try {
    javaInfo = await ensureJavaForVersion(versionId, onLog);
  } catch (e) {
    throw new Error(`Java 准备失败：${e.message}。请检查网络后重试，或在「设置 → Java」中手动指定已安装的 JDK/JRE 路径`);
  }
  const javaPath = cfg.javaPath || javaInfo.path;
  if (!fs.existsSync(javaPath)) {
    throw new Error(`Java 路径无效: ${javaPath}（可在设置中重新下载 JRE）`);
  }

  // classpath
  const isArgsV2 = !!version.arguments;
  const classpath = [];
  for (const lib of version.libraries || []) {
    if (lib.rules && !rulesAllow(lib.rules)) continue;
    if (lib.downloads?.artifact?.path) {
      classpath.push(path.join(MC_DIR, 'libraries', lib.downloads.artifact.path));
    } else if (lib.name) {
      classpath.push(libPathFromName(lib.name));
    }
  }
  classpath.push(mainJar);

  // 库完整性检查：缺库不再等到 JVM 报错，直接自动补全下载
  {
    const missing = [];
    for (const lib of version.libraries || []) {
      if (lib.rules && !rulesAllow(lib.rules)) continue;
      const art = lib.downloads?.artifact;
      if (art?.path && art.url && !fs.existsSync(path.join(MC_DIR, 'libraries', art.path))) missing.push(art);
    }
    if (missing.length) {
      onLog && onLog(`[hmcs] 检测到 ${missing.length} 个缺失的库文件，自动补全中...`);
      let fail = 0;
      await runPool(missing, async (art) => {
        try {
          await downloadFile(mirror(art.url), path.join(MC_DIR, 'libraries', art.path), art.sha1);
        } catch (e) {
          fail++;
          onLog && onLog(`[hmcs] 库下载失败 ${art.path}: ${e.message}`);
        }
      }, 6);
      if (fail) throw new Error(`有 ${fail} 个库文件补全失败（可在设置中切换下载源后重试）`);
      onLog && onLog('[hmcs] 库文件补全完成');
    }
  }

  // natives
  const nativesDir = path.join(vdir, 'natives');
  fs.mkdirSync(nativesDir, { recursive: true });
  for (const lib of version.libraries || []) {
    if (lib.rules && !rulesAllow(lib.rules)) continue;
    const key = lib.downloads?.classifiers?.['natives-' + platKey()];
    if (key) {
      const zipPath = path.join(MC_DIR, 'libraries', key.path);
      if (fs.existsSync(zipPath)) extractNatives(zipPath, nativesDir);
    }
  }

  // 账号
  const account = require('./account').getActiveAccount();
  if (!account) throw new Error('请先添加并选择一个账号');
  const auth = await buildAuthArgs(account, versionId);

  // jvm 参数（内存按系统内存自动钳制：超过物理内存 75% 时下调，避免"分配内存过大"启动失败）
  const osTotalMB = Math.floor(require('os').totalmem() / 1048576);
  let memMaxMB = clampMemoryMB(parseInt(cfg.maxMemoryMB, 10) || 4096, osTotalMB);
  if (memMaxMB !== (parseInt(cfg.maxMemoryMB, 10) || 4096)) {
    onLog && onLog(`[hmcs] 请求内存 ${cfg.maxMemoryMB}MB 超过系统内存上限（${osTotalMB}MB 的 75%），已自动调整为 ${memMaxMB}MB`);
  }
  const memMax = `-Xmx${memMaxMB}m`;
  const memMin = `-Xms${Math.min(cfg.minMemoryMB, memMaxMB)}m`;
  const assetsIndex = version.assets || 'legacy';
  const assetsDir = path.join(MC_DIR, 'assets');

  const subst = (s) => String(s)
    .replace(/\$\{natives_directory\}/g, nativesDir)
    .replace(/\$\{launcher_name\}/g, 'HMCS')
    .replace(/\$\{launcher_version\}/g, '0.1.0')
    .replace(/\$\{classpath\}/g, classpath.join(path.delimiter))
    .replace(/\$\{classpath_separator\}/g, path.delimiter)
    .replace(/\$\{library_directory\}/g, path.join(MC_DIR, 'libraries'))
    .replace(/\$\{version_name\}/g, versionId)
    .replace(/\$\{libraries\}/g, classpath.slice(0, -1).join(path.delimiter));

  // arguments.jvm 里混有 { rules, value } 对象（按 OS / 特性开关），
  // 需先按规则过滤，再把 value（字符串或数组）展开为字符串
  const expandJvmArgs = (entries) => (entries || []).flatMap((a) => {
    if (typeof a === 'string') return [subst(a)];
    if (!a || typeof a !== 'object') return [];
    const rules = a.rules || [];
    // 含 features 规则的条目默认跳过（demo / 自定义分辨率等未启用特性）
    if (rules.some((r) => r.features)) return [];
    if (rules.length && !rulesAllow(rules)) return [];
    const v = a.value;
    return Array.isArray(v) ? v.map(subst) : [subst(v)];
  });

  let jvmParts;
  if (isArgsV2) {
    jvmParts = [...(version.arguments.jvm || [])];
  } else {
    jvmParts = ['-Djava.library.path=' + nativesDir, '-cp', classpath.join(path.delimiter)];
  }
  jvmParts = expandJvmArgs(jvmParts);
  const jvmExtra = [memMin, memMax, '-Dfile.encoding=UTF-8'];

  // authlib-injector（正确格式：-javaagent:<jar>=<yggdrasil api url>）
  const agent = await activeAuthlibAgent();
  if (agent) {
    jvmExtra.push(`-javaagent:${agent.jar}=${agent.server}`);
  }

  // game 参数
  let gameParts;
  if (isArgsV2) {
    gameParts = expandJvmArgs(version.arguments.game);
  } else {
    gameParts = (version.minecraftArguments || '').split(' ');
  }

  const gameVals = {
    '--username': auth.name,
    '--uuid': auth.uuid,
    '--accessToken': auth.accessToken,
    '--versionType': 'HMCS',
    '--userType': auth.userType || 'msa',
    '--assetsDir': assetsDir,
    '--assetIndex': assetsIndex,
    '--gameDir': gameDir,
    '--width': String(cfg.windowWidth),
    '--height': String(cfg.windowHeight)
  };
  for (let i = 0; i < gameParts.length; i++) {
    if (gameVals[gameParts[i]] !== undefined) gameParts[i + 1] = gameVals[gameParts[i]];
  }
  if (!gameParts.includes('--username')) {
    gameParts.push('--username', auth.name, '--uuid', auth.uuid, '--accessToken', auth.accessToken,
      '--version', versionId, '--gameDir', gameDir, '--assetsDir', assetsDir, '--assetIndex', assetsIndex);
  }
  if (cfg.fullscreen) gameParts.push('--fullscreen');

  // 联机：启动后直接进入服务器（1.20+ 官方 quick play；旧版本回到多人大厅界面）
  if (serverIp) {
    gameParts.push('--server', serverIp);
    if (serverPort) gameParts.push('--port', String(serverPort));
    onLog && onLog(`[hmcs] 联机目标: ${serverIp}${serverPort ? ':' + serverPort : ''}`);
  }

  // classpath 缺失文件自检
  const missing = classpath.filter((p) => !fs.existsSync(p)).length;
  if (missing > 0) {
    onLog && onLog(`[hmcs] 警告: ${missing} 个依赖库缺失，尝试触发重新安装...`);
    try {
      await installVersion(vanillaId, onProgress);
    } catch (e) { /* 不阻塞，让游戏自身报错 */ }
  }

  const finalArgs = [...jvmExtra, ...jvmParts, version.mainClass, ...gameParts];

  onLog(`[hmcs] Java: ${javaPath}`);
  onLog(`[hmcs] 命令: ${javaPath} ${finalArgs.join(' ').slice(0, 400)}...`);

  const child = spawn(javaPath, finalArgs, { cwd: gameDir, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => d.toString().split('\n').forEach((l) => l && onLog(l)));
  child.stderr.on('data', (d) => d.toString().split('\n').forEach((l) => l && onLog(l)));
  child.on('exit', (code) => onLog(`[hmcs] 游戏退出，code=${code}`));
  return { pid: child.pid };
}

function extractNatives(zipPath, destDir) {
  const { execSync } = require('child_process');
  try {
    if (process.platform === 'win32') {
      execSync(`powershell -NoProfile -Command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${destDir}'"`, { stdio: 'ignore' });
    } else {
      execSync(`unzip -o -j "${zipPath}" "*.dylib" "*.so" "*.dll" -d "${destDir}"`, { stdio: 'ignore' });
    }
  } catch (e) {
    // 简单兜底：解压全部
    try {
      if (process.platform !== 'win32') execSync(`unzip -o -j "${zipPath}" -d "${destDir}"`, { stdio: 'ignore' });
    } catch (e2) {}
  }
}

// 内存钳制：不超过物理内存的 75%（至少留 1GB 给系统），下限 512MB
function clampMemoryMB(requestedMB, totalMemMB) {
  const cap = Math.max(1024, Math.floor(totalMemMB * 0.75));
  return Math.min(Math.max(requestedMB || 4096, 512), cap);
}

module.exports = {
  getRemoteVersions,
  getInstalledVersions,
  installVersion,
  loadVersionJson: (id) => Promise.resolve(loadVersionJson(id)),
  versionJsonPath,
  launchGame,
  clampMemoryMB,
  cancelDownload: () => {}
};
