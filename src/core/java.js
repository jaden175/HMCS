// Java 管理：本机扫描 + Adoptium 自动下载 + 按版本选择
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { getConfig, setConfig, ROOT } = require('./config');
const { downloadFile, fetchWithRetry } = require('./net');

const JAVA_DIR = path.join(ROOT, 'java');
const MC_MIN_JAVA = { 1: 8 }; // 默认兜底

function mcVersionToJavaMajor(mcVersion) {
  // 版本号 → 所需 Java 主版本（按 Mojang 官方要求）
  // 26.1+（2026 年份版本号）→ Java 25；1.20.5~1.21.x → Java 21；1.18~1.20.4 → 17；1.17 → 16；其余 → 8
  const m = mcVersion.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return 8;
  const major = parseInt(m[1]), minor = parseInt(m[2]), patch = parseInt(m[3] || 0);
  if (major >= 26) return 25;
  if (major === 1) {
    if (minor <= 16) return 8;
    if (minor === 17) return 16;
    if (minor === 18 || minor === 19) return 17;
    // 1.20.x：1.20.5 起需要 Java 21；1.21.x 全系 Java 21
    if (minor === 20) return patch >= 5 ? 21 : 17;
    return 21;
  }
  return 8;
}

// 优先读版本 JSON 里的 javaVersion.majorVersion（Mojang 官方声明），启发式只做兜底
async function requiredJavaMajor(mcVersion) {
  try {
    const { versionJsonPath } = require('./minecraft');
    const p = versionJsonPath(mcVersion);
    if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (j.javaVersion?.majorVersion) return j.javaVersion.majorVersion;
    }
  } catch (e) { /* 文件不存在/未安装，走启发式兜底 */ }
  return mcVersionToJavaMajor(mcVersion);
}

// 扫描常见位置 + PATH
function listJava() {
  const results = [];
  const seen = new Set();
  const candidates = [];

  const push = (p) => {
    if (p && !seen.has(p) && fs.existsSync(p)) {
      seen.add(p);
      candidates.push(p);
    }
  };

  // PATH 里的 java
  const which = spawnSync('which', ['java']);
  if (which.status === 0) push(which.stdout.toString().trim());

  // 常见目录
  const scanRoots = [
    '/usr/lib/jvm', '/opt/java', '/usr/java',
    path.join(os.homedir(), '.jdks'),
    path.join(JAVA_DIR)
  ].filter((d) => fs.existsSync(d));

  for (const root of scanRoots) {
    try {
      for (const entry of fs.readdirSync(root)) {
        const bin = path.join(root, entry, 'bin', 'java' + (process.platform === 'win32' ? '.exe' : ''));
        const bin2 = path.join(root, entry, 'bin', 'javaw' + (process.platform === 'win32' ? '.exe' : ''));
        push(bin);
        push(bin2);
        // 扫描一层子目录（如 hmcs/java/temurin-21/bin/java）
        const sub = path.join(root, entry);
        if (fs.statSync(sub).isDirectory()) {
          for (const e2 of fs.readdirSync(sub)) {
            push(path.join(sub, e2, 'bin', 'java' + (process.platform === 'win32' ? '.exe' : '')));
          }
        }
      }
    } catch (e) {}
  }

  // 探测版本
  for (const binPath of candidates) {
    const r = spawnSync(binPath, ['-version']);
    const out = (r.stderr ? r.stderr.toString() : '') + (r.stdout ? r.stdout.toString() : '');
    const m = out.match(/version "(\d+)(?:\.(\d+))?(\.(\d+))?[_0-9]*"/);
    if (m) {
      const major = parseInt(m[1]) === 1 ? parseInt(m[2]) : parseInt(m[1]);
      results.push({ path: binPath, major, full: out.split('\n')[0] });
    }
  }
  return results;
}

function pickJavaPath(major) {
  const list = listJava().filter((j) => j.major === major);
  if (list.length) return list[0].path;
  // 找更高版本兜底
  const higher = listJava().filter((j) => j.major > major).sort((a, b) => a.major - b.major);
  return higher.length ? higher[0].path : null;
}

// Adoptium 下载 JRE
// 优先清华 TUNA 镜像（国内快且稳），失败再走 Adoptium 官方 API

// 从清华 TUNA 镜像解析最新 JRE 包
async function tunaAsset(major, osName, arch) {
  const base = `https://mirrors.tuna.tsinghua.edu.cn/Adoptium/${major}/jre/${arch}/${osName}/`;
  const res = await fetchWithRetry(base);
  const html = await res.text();
  const names = [...html.matchAll(/href="([^"]+\.(?:tar\.gz|zip))"/g)].map((m) => m[1]);
  if (!names.length) throw new Error('TUNA 镜像未找到可用包');
  names.sort();
  const name = names[names.length - 1];
  return { name, link: base + name, size: 0 };
}

async function adoptiumAsset(major, osName, arch) {
  const api = `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?architecture=${arch}&image_type=jre&os=${osName}`;
  const res = await fetchWithRetry(api);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const assets = await res.json();
  if (!assets.length) throw new Error('无构建');
  return assets[0].binary.package;
}

async function downloadJava(major, onProgress) {
  const osName = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
  let pkg;
  const errors = [];
  for (const getter of [tunaAsset, adoptiumAsset]) {
    try {
      pkg = await getter(major, osName, arch);
      break;
    } catch (e) {
      errors.push(`${getter.name}: ${e.message}`);
    }
  }
  if (!pkg) throw new Error(`无法获取 Java ${major} 安装包（${errors.join('；')}）`);

  fs.mkdirSync(JAVA_DIR, { recursive: true });
  const archivePath = path.join(JAVA_DIR, pkg.name);
  onProgress && onProgress({ total: 1, done: 0, bytes: 0, phaseExtra: `Java ${major}` });
  // 大文件：net.downloadFile 已支持断点续传 + 断流重试
  await downloadFile(pkg.link, archivePath, null, (b) => onProgress && onProgress({ total: 1, done: 0, bytes: b, phaseExtra: `Java ${major}` }));
  onProgress && onProgress({ total: 1, done: 1, bytes: pkg.size || 0 });

  // 解压（失败时保留错误信息，便于定位）
  const { execSync } = require('child_process');
  try {
    if (pkg.name.endsWith('.zip')) {
      execSync(`powershell -NoProfile -Command "Expand-Archive -Force -Path '${archivePath}' -DestinationPath '${JAVA_DIR}'"`, { stdio: 'ignore' });
    } else {
      execSync(`tar -xzf "${archivePath}" -C "${JAVA_DIR}"`, { stdio: 'ignore' });
    }
  } catch (e) {
    throw new Error(`Java 压缩包解压失败: ${(e.stderr || e.message || '').toString().slice(0, 200)}`);
  }
  fs.rmSync(archivePath, { force: true });

  const javaPath = pickJavaPath(major);
  if (!javaPath) throw new Error('解压完成但未找到 java 可执行文件');
  const installs = [...new Set([...getConfig().javaInstalls, javaPath])];
  setConfig({ javaInstalls: installs });
  return { path: javaPath, major };
}

async function ensureJavaForVersion(mcVersion, onLog) {
  const need = await requiredJavaMajor(mcVersion);
  const p = pickJavaPath(need);
  if (p) return { path: p, major: need };
  onLog && onLog(`[hmcs] 未找到 Java ${need}，开始自动下载（清华 TUNA 镜像 → Adoptium 官方源，支持断点续传）...`);
  let lastErr;
  try {
    const r = await downloadJava(need, onLog ? (prog) => onLog(`[hmcs] Java ${need} 下载中 ${Math.round((prog.bytes || 0) / 1048576)}MB`) : undefined);
    onLog && onLog(`[hmcs] Java ${need} 安装完成: ${r.path}`);
    return r;
  } catch (e) {
    lastErr = e;
    // 兜底：本机任意可用 Java（版本更高也能跑）
    const fallback = listJava()[0];
    if (fallback) {
      onLog && onLog(`[hmcs] 自动下载失败（${e.message}），改用本机已安装的 Java ${fallback.major}: ${fallback.path}`);
      return fallback;
    }
    throw new Error(`${e.message}；本机也未检测到任何 Java，请手动安装或指定路径`);
  }
}

module.exports = { listJava, pickJavaPath, downloadJava, ensureJavaForVersion, mcVersionToJavaMajor, requiredJavaMajor };
