#!/usr/bin/env node
// HMCS 冒烟测试：覆盖核心纯逻辑 + 在线数据源连通性（网络部分走 curl，规避沙箱 node fetch 的 WASM 内存限制）
// 运行：node tests/smoke.js
const { execFileSync } = require('child_process');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
process.env.HMCS_TEST = '1';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.error(`  ✘ ${name}${detail ? ' — ' + detail : ''}`); }
}
function curlJson(url, headers) {
  const args = ['-sL', '--max-time', '30', url];
  for (const [k, v] of Object.entries(headers || {})) args.splice(1, 0, '-H', `${k}: ${v}`);
  return JSON.parse(execFileSync('curl', args, { maxBuffer: 64 * 1024 * 1024 }).toString('utf8'));
}
function curlText(url, headers) {
  const args = ['-sL', '--max-time', '30', url];
  for (const [k, v] of Object.entries(headers || {})) args.splice(1, 0, '-H', `${k}: ${v}`);
  return execFileSync('curl', args, { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
}
const mc = require('../src/core/minecraft');

// ---- 1. Java 版本映射 ----
console.log('[1] Java 版本映射');
const java = require('../src/core/java');
check('26.1 → Java 25', java.mcVersionToJavaMajor('26.1') === 25);
check('26.4 → Java 25', java.mcVersionToJavaMajor('26.4') === 25);
check('26.x-snapshot → Java 25', java.mcVersionToJavaMajor('26.2-snapshot') === 25);
check('1.21.11 → Java 21', java.mcVersionToJavaMajor('1.21.11') === 21);
check('1.20.5 → Java 21', java.mcVersionToJavaMajor('1.20.5') === 21);
check('1.20.4 → Java 17', java.mcVersionToJavaMajor('1.20.4') === 17);
check('1.17 → Java 16', java.mcVersionToJavaMajor('1.17') === 16);
check('1.16.5 → Java 8', java.mcVersionToJavaMajor('1.16.5') === 8);

// ---- 2. BMCLAPI 镜像映射 ----
console.log('[2] BMCLAPI 镜像映射');
const net = require('../src/core/net');
check('launchermeta → bmclapi', net.mirror('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json').startsWith('https://bmclapi2.bangbang93.com/'));
check('piston-meta → bmclapi', net.mirror('https://piston-meta.mojang.com/v1/packages/abc/def.json').includes('bmclapi2.bangbang93.com'));
check('libraries → bmclapi', net.mirror('https://libraries.minecraft.net/com/google/guava/guava.jar').includes('bmclapi2.bangbang93.com'));
check('resources → bmclapi', net.mirror('https://resources.download.minecraft.net/aa/bbcc.json').includes('bmclapi2.bangbang93.com'));

// ---- 3. 离线账号 UUID（v3 格式）----
console.log('[3] 离线账号 UUID');
const crypto = require('crypto');
const account = require('../src/core/account');
// 与官方离线模式算法一致：MD5("OfflinePlayer:"+name) 转 v3
function expectUuid(name) {
  const md5 = crypto.createHash('md5').update('OfflinePlayer:' + name, 'utf8').digest();
  md5[6] = (md5[6] & 0x0f) | 0x30; md5[8] = (md5[8] & 0x3f) | 0x80;
  const h = md5.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
(async () => {
  // 数据根目录由 HOME 决定（config.js 兜底 $HOME/.hmcs-test），测试时用临时 HOME 避免污染用户配置
  try {
    const acc = await account.offlineLogin('Steve');
    check('离线登录生成 UUID', /^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(acc.uuid || ''), JSON.stringify(acc).slice(0, 80));
    check('UUID 与官方算法一致', (acc.uuid || '').toLowerCase() === expectUuid('Steve').toLowerCase());
    let threw = false;
    try { await account.offlineLogin('这个名字实在实在是太长太长了呀呀呀'); } catch (e) { threw = true; }
    check('超长用户名被拒绝(≤16)', threw);
  } catch (e) {
    check('离线登录', false, e.message);
  }

  // ---- 4. 内容管理 KINDS ----
  console.log('[4] 内容管理（模组/资源包/光影/世界）');
  const mods = require('../src/core/mods');
  const kinds = Object.keys(mods.KINDS || {});
  for (const k of ['mods', 'resourcepacks', 'shaderpacks', 'saves']) check(`KINDS 含 ${k}`, kinds.includes(k));

  // ---- 5. 版本清单（在线，BMCLAPI）----
  console.log('[5] 版本清单（在线）');
  try {
    const manifest = curlJson('https://bmclapi2.bangbang93.com/mc/game/version_manifest_v2.json');
    const ids = manifest.versions.map(v => v.id);
    check('清单包含 26.1-26.3 正式版', ['26.1', '26.2', '26.3'].every(id => ids.includes(id)), ids.slice(0, 6).join(','));
    check('清单包含 26.4 快照', ids.some(id => id.startsWith('26.4-snapshot')));
    check('清单包含 1.21.11', ids.includes('1.21.11'));
    check('latest.release 存在', !!manifest.latest.release);
  } catch (e) { check('版本清单可达', false, e.message); }

  // ---- 6. Fabric profile（在线）----
  console.log('[6] Fabric 安装配置（在线）');
  try {
    const loaders = curlJson('https://meta.fabricmc.net/v2/versions/loader/1.21.11');
    const lv = loaders && loaders[0] && loaders[0].loader && loaders[0].loader.version;
    check('可获取 1.21.11 的 loader 版本', !!lv, String(lv));
    if (lv) {
      const profile = curlJson(`https://meta.fabricmc.net/v2/versions/loader/1.21.11/${lv}/profile/json`);
      check('Fabric mainClass 为 Knot', String(profile.mainClass).includes('Knot'));
    }
  } catch (e) { check('Fabric meta 可达', false, e.message); }

  // ---- 7. Modrinth 搜索（在线）----
  console.log('[7] Modrinth 搜索（在线）');
  try {
    const q = encodeURIComponent('sodium');
    const facets = encodeURIComponent('[["project_type:mod"],["versions:1.21.11"],["categories:fabric"]]');
    const res = curlJson(`https://api.modrinth.com/v2/search?limit=5&query=${q}&facets=${facets}`,
      { 'User-Agent': 'HMCS-Launcher/0.1.0 (Hallo Minecraft Space)' });
    check('Modrinth 返回结果', Array.isArray(res.hits) && res.hits.length > 0);
    check('结果与查询相关', res.hits[0] && /sodium/i.test(res.hits[0].slug + res.hits[0].title));
  } catch (e) { check('Modrinth 可达', false, e.message); }

  console.log('[8] 启动修复：内存钳制 / TUNA Java 镜像');
  check('内存钳制：8GB 机器请求 16GB → 6144MB', mc.clampMemoryMB(16384, 8192) === 6144, String(mc.clampMemoryMB(16384, 8192)));
  check('内存钳制：合理请求不改动', mc.clampMemoryMB(2048, 16384) === 2048);
  check('内存钳制：过小请求抬到下限', mc.clampMemoryMB(128, 16384) === 512);
  try {
    const html = curlText('https://mirrors.tuna.tsinghua.edu.cn/Adoptium/25/jre/x64/linux/');
    const names = [...html.matchAll(/href="([^"]+\.tar\.gz)"/g)].map((m) => m[1]).sort();
    check('TUNA 镜像有 Java 25 JRE', names.length > 0 && /OpenJDK25U-jre/.test(names[names.length - 1]), names[names.length - 1] || '无');
  } catch (e) { check('TUNA 镜像可达', false, e.message); }

  console.log('[9] 下载层：断流重试 + 断点续传（本地服务器模拟断流）');
  await checkDownloadResume();

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();

// 模拟服务端中途断流，验证 downloadFile 能自动重试并用 Range 续传完成下载
async function checkDownloadResume() {
  const http = require('http');
  const fs = require('fs');
  const { Readable } = require('stream');
  const net = require('../src/core/net');
  const origFetch = globalThis.fetch;
  const SIZE = 1024 * 1024;
  const payload = crypto.randomBytes(SIZE);
  let cut = 0, usedRange = false;

  globalThis.fetch = (url, opts = {}) => new Promise((resolve, reject) => {
    const req = http.get(url, { headers: opts.headers || {} }, (res) => resolve({
      ok: res.statusCode >= 200 && res.statusCode < 300,
      status: res.statusCode,
      body: Readable.from(res)
    }));
    req.on('error', reject);
  });

  const server = http.createServer((req, res) => {
    const range = req.headers.range;
    const start = range ? parseInt(range.split('=')[1]) : 0;
    if (range) usedRange = true;
    res.writeHead(range ? 206 : 200, {
      'Content-Length': payload.length - start,
      ...(range ? { 'Content-Range': `bytes ${start}-${payload.length - 1}/${payload.length}` } : {})
    });
    if (cut < 1) { cut++; res.write(payload.subarray(start, start + 512)); setTimeout(() => res.destroy(), 10); return; }
    res.end(payload.subarray(start));
  });

  const dest = path.join(os.tmpdir(), 'hmcs-dl-test.bin');
  try {
    await new Promise((r) => server.listen(18724, r));
    const sha = crypto.createHash('sha1').update(payload).digest('hex');
    const r = await net.downloadFile('http://127.0.0.1:18724/f.bin', dest, sha);
    check('断流后自动重试并下载完整', fs.existsSync(dest) && r.bytes === SIZE, `bytes=${r.bytes}`);
    check('断点续传已生效（Range 请求）', usedRange === true);
    check('下载完成后无残留 .part', !fs.existsSync(dest + '.part'));
  } catch (e) {
    check('断流重试下载', false, e.message);
  } finally {
    server.close();
    globalThis.fetch = origFetch;
    fs.rmSync(dest, { force: true });
    fs.rmSync(dest + '.part', { force: true });
  }
}
