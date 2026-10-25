// 应用内自更新：检查清单 → 下载 app.asar 更新包 → 校验 → 交由 main 应用并重启
// 更新清单 JSON 格式：
// { "version": "0.1.1", "asarUrl": "https://.../app.asar", "sha256": "<hex, 可选>", "notes": "更新说明" }
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fetchJson, downloadFile } = require('./net');

// 比较 x.y.z 版本号，next 是否比 cur 新
function isNewerVersion(cur, next) {
  const p = (s) => String(s || '').trim().split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const a = p(cur), b = p(next);
  for (let i = 0; i < 3; i++) {
    if ((b[i] || 0) > (a[i] || 0)) return true;
    if ((b[i] || 0) < (a[i] || 0)) return false;
  }
  return false;
}

// 检查更新：返回 { available, current, version, asarUrl, sha256, notes }
async function checkUpdate(manifestUrl, currentVersion) {
  if (!manifestUrl) throw new Error('未配置更新源（设置 → 软件更新）');
  const m = await fetchJson(manifestUrl);
  if (!m || !m.version || !m.asarUrl) throw new Error('更新清单格式不正确（需要 version + asarUrl）');
  return {
    available: isNewerVersion(currentVersion, m.version),
    current: currentVersion,
    version: m.version,
    asarUrl: m.asarUrl,
    sha256: m.sha256 || '',
    notes: m.notes || ''
  };
}

// 下载更新包到临时目录并校验 sha256（可选），返回本地路径
async function downloadUpdatePackage(asarUrl, sha256, destDir, onProgress) {
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, 'app.asar.update');
  await downloadFile(asarUrl, dest, null, onProgress);
  if (sha256) {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex').toLowerCase();
    if (actual !== String(sha256).toLowerCase()) {
      fs.rmSync(dest, { force: true });
      throw new Error('更新包校验失败（sha256 不匹配），已删除下载文件');
    }
  }
  // 粗校验：asar 文件头以 pickle 前缀 04 00 00 00 开头
  const fd = fs.openSync(dest, 'r');
  const head = Buffer.alloc(8);
  fs.readSync(fd, head, 0, 8, 0);
  fs.closeSync(fd);
  if (head.readUInt32LE(0) !== 4 || head.readUInt32LE(4) === 0) throw new Error('更新包不是有效的 app.asar');
  return dest;
}

module.exports = { isNewerVersion, checkUpdate, downloadUpdatePackage };
