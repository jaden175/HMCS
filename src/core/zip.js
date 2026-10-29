// 极简 ZIP 读取/解压：零依赖（只用 zlib），跨平台，供整合包导入使用
// 支持 store(0) 与 deflate(8) 两种压缩方式，忽略 Zip64（整合包不会超过 4GB）
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LH_SIG = 0x04034b50;

function findEocd(buf) {
  const minPos = Math.max(0, buf.length - 66000);
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

// 列出所有条目（不解压内容）
function listEntries(zipPath) {
  const buf = fs.readFileSync(zipPath);
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error('不是有效的 ZIP 文件');
  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (ptr + 46 > buf.length || buf.readUInt32LE(ptr) !== CD_SIG) break;
    const flags = buf.readUInt16LE(ptr + 8);
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const rawSize = buf.readUInt32LE(ptr + 24);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const lho = buf.readUInt32LE(ptr + 42);
    // bit 11 = UTF-8 文件名
    const name = buf.slice(ptr + 46, ptr + 46 + nameLen).toString(flags & 0x800 ? 'utf8' : 'latin1');
    entries.push({ name, method, compSize, size: rawSize, localOffset: lho });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// 校验相对路径安全：不允许绝对路径 / 盘符 / 上跳
function safeJoin(root, name) {
  const clean = name.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean || clean.includes('..') || /^[a-zA-Z]:/.test(clean)) return null;
  const dest = path.join(root, clean);
  if (!path.resolve(dest).startsWith(path.resolve(root) + path.sep) && path.resolve(dest) !== path.resolve(root)) return null;
  return dest;
}

// 解压到目录；filter(name) 返回 false 可跳过；返回 { written, skipped }
function extractZip(zipPath, destDir, filter) {
  const buf = fs.readFileSync(zipPath);
  const entries = listEntries(zipPath);
  let written = 0;
  const skipped = [];
  for (const e of entries) {
    if (e.name.endsWith('/')) continue;
    if (filter && !filter(e.name)) continue;
    const dest = safeJoin(destDir, e.name);
    if (!dest) { skipped.push(e.name + '（非法路径）'); continue; }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    // 定位数据区
    const lho = e.localOffset;
    if (lho + 30 > buf.length || buf.readUInt32LE(lho) !== LH_SIG) { skipped.push(e.name + '（头部损坏）'); continue; }
    const nameLen = buf.readUInt16LE(lho + 26);
    const extraLen = buf.readUInt16LE(lho + 28);
    const start = lho + 30 + nameLen + extraLen;
    const raw = buf.slice(start, start + e.compSize);
    let out;
    if (e.method === 0) out = raw;
    else if (e.method === 8) out = zlib.inflateRawSync(raw);
    else { skipped.push(e.name + '（不支持的压缩方式）'); continue; }
    fs.writeFileSync(dest, out);
    written++;
  }
  return { written, skipped };
}

// 读取单个文本文件（如 modrinth.index.json），找不到返回 null
function readTextFile(zipPath, targetName) {
  const buf = fs.readFileSync(zipPath);
  const entry = listEntries(zipPath).find((e) => e.name === targetName || e.name.endsWith('/' + targetName) && !e.name.slice(0, -targetName.length - 1).includes('/'));
  if (!entry || entry.name.endsWith('/')) return null;
  const lho = entry.localOffset;
  if (lho + 30 > buf.length || buf.readUInt32LE(lho) !== LH_SIG) return null;
  const nameLen = buf.readUInt16LE(lho + 26);
  const extraLen = buf.readUInt16LE(lho + 28);
  const start = lho + 30 + nameLen + extraLen;
  const raw = buf.slice(start, start + entry.compSize);
  const out = entry.method === 8 ? zlib.inflateRawSync(raw) : raw;
  return out.toString('utf8');
}

module.exports = { listEntries, extractZip, readTextFile };
