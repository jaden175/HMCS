// 通用下载工具：并发池、SHA1 校验、重试、双源自动回退
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { getConfig } = require('./config');

// BMCLAPI / Mojang / Modrinth 都会对无 UA 请求限流或拒绝，必须带
const UA = 'HMCS-Launcher/0.1.0 (Hallo Minecraft Space)';

// 按 BMCLAPI 映射规则转换（不依赖当前配置的下载源）
function toBmclapi(url) {
  return url
    .replace('https://launchermeta.mojang.com', 'https://bmclapi2.bangbang93.com')
    .replace('https://launcher.mojang.com', 'https://bmclapi2.bangbang93.com')
    .replace('https://piston-meta.mojang.com', 'https://bmclapi2.bangbang93.com')
    .replace('https://piston-data.mojang.com', 'https://bmclapi2.bangbang93.com')
    .replace('https://resources.download.minecraft.net', 'https://bmclapi2.bangbang93.com/assets')
    .replace('https://libraries.minecraft.net', 'https://bmclapi2.bangbang93.com/maven')
    .replace('https://maven.fabricmc.net', 'https://bmclapi2.bangbang93.com/maven')
    .replace('https://meta.fabricmc.net', 'https://bmclapi2.bangbang93.com/fabric-meta');
}

function mirror(url) {
  const src = getConfig().downloadSource;
  if (src !== 'bmclapi') return url;
  return toBmclapi(url);
}

// 候选 URL：主源（按配置）+ 备源互为回退
function candidateUrls(url) {
  const primary = mirror(url);
  const list = [primary];
  const alt = primary === url ? toBmclapi(url) : url; // 主源官方→备选BMCLAPI；主源BMCLAPI→备选官方
  if (alt !== primary) list.push(alt);
  return list;
}

// 每个候选源重试 2 次，主源失败自动切换备源
function fetchWithRetry(url, opts = {}, retriesPerSource = 2) {
  const candidates = candidateUrls(url);
  const attempt = async (ci, n) => {
    const u = candidates[ci];
    try {
      const res = await fetch(u, {
        ...opts,
        signal: opts.signal,
        headers: { 'User-Agent': UA, ...(opts.headers || {}) }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (n < retriesPerSource) {
        await new Promise((r) => setTimeout(r, 800 * (n + 1)));
        return attempt(ci, n + 1);
      }
      if (ci < candidates.length - 1) return attempt(ci + 1, 0); // 换下载源重试
      throw new Error(`${err.message}（已尝试 ${candidates.length} 个下载源）`);
    }
  };
  return attempt(0, 0);
}

async function fetchJson(url) {
  const res = await fetchWithRetry(url);
  return res.json();
}

function sha1(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

// 下载单个文件：流式落盘 + 断点续传 + 断流重试 + 双源回退 + SHA1 校验
// 关键点：响应体读取必须放在重试循环内，否则中途断流会直接抛 "terminated" 且不重试
async function downloadFile(url, dest, expectedSha1, onBytes) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  // 已有完整文件且校验通过 → 跳过
  if (fs.existsSync(dest)) {
    const buf = fs.readFileSync(dest);
    if (!expectedSha1 || sha1(buf) === expectedSha1) {
      if (onBytes) onBytes(0);
      return { changed: false, bytes: buf.length };
    }
    fs.rmSync(dest, { force: true }); // 损坏则重下
  }

  const part = dest + '.part';
  const candidates = candidateUrls(url);
  let lastErr = null;

  for (let ci = 0; ci < candidates.length; ci++) {
    for (let n = 0; n < 3; n++) {
      try {
        let start = 0;
        if (fs.existsSync(part)) start = fs.statSync(part).size;
        const headers = { 'User-Agent': UA };
        if (start > 0) headers.Range = `bytes=${start}-`;

        const res = await fetch(candidates[ci], { headers });
        if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
        if (res.status === 200 && start > 0) {
          // 服务器不支持续传 → 从头开始
          start = 0;
          fs.rmSync(part, { force: true });
        }

        if (onBytes) onBytes(start);
        const ws = fs.createWriteStream(part, { flags: start > 0 ? 'a' : 'w' });
        if (res.body && typeof res.body.pipe === 'function') {
          await pipeline(res.body, ws);
        } else {
          const buf = Buffer.from(await res.arrayBuffer());
          ws.end(buf);
          await new Promise((r) => ws.on('close', r));
        }

        const buf = fs.readFileSync(part);
        if (expectedSha1 && sha1(buf) !== expectedSha1) {
          fs.rmSync(part, { force: true });
          throw new Error('SHA1 校验失败');
        }
        fs.renameSync(part, dest);
        if (onBytes) onBytes(buf.length);
        return { changed: true, bytes: buf.length };
      } catch (err) {
        lastErr = err;
        // 断流/超时：保留 .part 以便下次续传，仅在内容损坏时清空
        if (/SHA1/.test(err.message)) fs.rmSync(part, { force: true });
        await new Promise((r) => setTimeout(r, 1000 * (n + 1)));
      }
    }
  }
  throw new Error(`下载失败: ${lastErr ? lastErr.message : '未知错误'}`);
}

// 并发池执行
async function runPool(items, worker, concurrency) {
  let i = 0;
  let done = 0;
  const total = items.length;
  const workers = Array.from({ length: Math.min(concurrency, total || 1) }, async () => {
    while (i < total) {
      const idx = i++;
      try {
        await worker(items[idx], idx);
      } finally {
        done++;
      }
    }
  });
  await Promise.all(workers);
  return done;
}

module.exports = { fetchWithRetry, fetchJson, downloadFile, runPool, sha1, mirror };
