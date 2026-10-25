#!/usr/bin/env node
// 让 electron-builder 在 Linux 上也能打 NSIS 安装包：
// 卸载器提取改走纯 JS 的 UninstallerReader（原本只在 macOS Catalina 启用），绕开 wine 依赖。
// npm install 后需要重新执行一次本脚本。
const fs = require('fs');
const path = require('path');

let ok = true;

// 补丁 1：卸载器提取改走纯 JS 的 UninstallerReader（原本只在 macOS Catalina 启用），免 wine
const nsisTarget = path.join(__dirname, '..', 'node_modules', 'app-builder-lib', 'out', 'targets', 'nsis', 'NsisTarget.js');
let src = fs.readFileSync(nsisTarget, 'utf8');
const from = 'if ((0, macosVersion_1.isMacOsCatalina)()) {';
const to = 'if (process.platform !== "win32") { // HMCS patch: UninstallerReader 也适用于 Linux，免 wine';
if (src.includes(to)) {
  console.log('[patch1] already applied');
} else if (src.includes(from)) {
  fs.writeFileSync(nsisTarget, src.replace(from, to));
  console.log('[patch1] NsisTarget.js: Linux 使用 UninstallerReader 提取卸载器（免 wine）');
} else {
  console.error('[patch1] pattern not found'); ok = false;
}

// 补丁 2：spawnAndWrite 的 4 分钟硬编码超时改为可用 HMCS_BUILD_TIMEOUT_MS 配置（大应用 makensis 压缩会超 4 分钟）
const util = path.join(__dirname, '..', 'node_modules', 'builder-util', 'out', 'util.js');
let usrc = fs.readFileSync(util, 'utf8');
const ufrom = 'const timeout = setTimeout(() => childProcess.kill(), 4 * 60 * 1000);';
const uto = 'const timeout = setTimeout(() => childProcess.kill(), parseInt(process.env.HMCS_BUILD_TIMEOUT_MS || "0", 10) * 1000 || 4 * 60 * 1000); // HMCS patch: 可配置超时';
if (usrc.includes(uto)) {
  console.log('[patch2] already applied');
} else if (usrc.includes(ufrom)) {
  fs.writeFileSync(util, usrc.replace(ufrom, uto));
  console.log('[patch2] util.js: 超时可通过 HMCS_BUILD_TIMEOUT_MS 配置');
} else {
  console.error('[patch2] pattern not found'); ok = false;
}
// 补丁 3：NSIS 数据压缩设为 off（7z 包本身已压缩，重复压缩耗内存且在受限沙箱中会被杀）
const t3 = path.join(__dirname, '..', 'node_modules', 'app-builder-lib', 'out', 'targets', 'nsis', 'NsisTarget.js');
let s3 = fs.readFileSync(t3, 'utf8');
const f3 = 'defines.COMPRESS = "auto";';
const t3to = 'defines.COMPRESS = "off"; // HMCS patch: 免二次压缩';
if (s3.includes(t3to)) {
  console.log('[patch3] already applied');
} else if (s3.includes(f3)) {
  fs.writeFileSync(t3, s3.replace(f3, t3to));
  console.log('[patch3] NsisTarget.js: COMPRESS=off');
} else {
  console.error('[patch3] pattern not found'); ok = false;
}
// 补丁 4：可选的 makensis 脚本转储（HMCS_DUMP_SCRIPT=1 时启用，调试用）
const t4 = path.join(__dirname, '..', 'node_modules', 'app-builder-lib', 'out', 'targets', 'nsis', 'NsisTarget.js');
let s4 = fs.readFileSync(t4, 'utf8');
const f4 = '        const nsisPath = await (0, nsisUtil_1.NSIS_PATH)();';
const t4to = '        if (process.env.HMCS_DUMP_SCRIPT === "1") require("fs").writeFileSync("/tmp/hmcs-makensis-" + Date.now() + ".nsi", script); // HMCS patch: dump script (opt-in)\n        const nsisPath = await (0, nsisUtil_1.NSIS_PATH)();';
if (s4.includes(t4to)) {
  console.log('[patch4] already applied');
} else if (s4.includes(f4)) {
  fs.writeFileSync(t4, s4.replace(f4, t4to));
  console.log('[patch4] executeMakensis 脚本转储已启用（HMCS_DUMP_SCRIPT=1 时生效）');
} else {
  console.error('[patch4] pattern not found'); ok = false;
}

// 补丁 7：makensis 用 mmap 写输出，OutFile 已存在时覆盖写入会 SIGBUS（Linux 沙箱/部分文件系统）。
// 卸载器 pass 先写出 setup exe，最终 pass 覆盖同一 OutFile 即崩溃 → 编译前先删除已存在的输出文件。
const t7 = path.join(__dirname, '..', 'node_modules', 'app-builder-lib', 'out', 'targets', 'nsis', 'NsisTarget.js');
let s7 = fs.readFileSync(t7, 'utf8');
const f7 = '        await ensureNotBusy(commands["OutFile"].replace(/"/g, ""));';
const t7to = '        await ensureNotBusy(commands["OutFile"].replace(/"/g, ""));\n        await require("fs/promises").unlink(commands["OutFile"].replace(/"/g, "")).catch(() => {}); // HMCS patch: makensis mmap 覆盖已存在的 OutFile 会 SIGBUS，先删除\n        if (commands["UNINSTALLER_OUT_FILE"]) await require("fs/promises").unlink(commands["UNINSTALLER_OUT_FILE"].replace(/"/g, "")).catch(() => {}); // HMCS patch: WriteUninstaller 目标已存在同样会 SIGBUS';
if (s7.includes(t7to)) {
  console.log('[patch7] already applied');
} else if (s7.includes(f7)) {
  fs.writeFileSync(t7, s7.replace(f7, t7to));
  console.log('[patch7] NsisTarget.js: 编译前删除已存在的 OutFile（修复 SIGBUS）');
} else {
  console.error('[patch7] pattern not found'); ok = false;
}

// 补丁 5：同时转储完整命令行（含 defines），供手工重放
const t5 = path.join(__dirname, '..', 'node_modules', 'builder-util', 'out', 'util.js');
let s5 = fs.readFileSync(t5, 'utf8');
const f5 = 'function spawnAndWrite(command, args, data, options) {\n    const childProcess = doSpawn(command, args, options, { isPipeInput: true });';
const t5to = 'function spawnAndWrite(command, args, data, options) {\n    try { require("fs").writeFileSync("/tmp/hmcs-makensis-cmd-" + Date.now() + ".txt", command + "\\n" + args.join("\\n") + "\\n---STDIN---\\n" + data); } catch (e) {} // HMCS patch: dump full command\n    const childProcess = doSpawn(command, args, options, { isPipeInput: true });';
if (s5.includes('hmcs-makensis-cmd-')) {
  console.log('[patch5] already applied');
} else if (s5.includes(f5)) {
  fs.writeFileSync(t5, s5.replace(f5, t5to));
  console.log('[patch5] spawnAndWrite 完整命令行转储已启用');
} else {
  console.error('[patch5] pattern not found'); ok = false;
}
// 补丁 6：makensis 输出实时透传（定位静默崩溃）
const t6 = path.join(__dirname, '..', 'node_modules', 'builder-util', 'out', 'util.js');
let s6 = fs.readFileSync(t6, 'utf8');
if (s6.includes('__hmcsLive')) {
  // 修复旧版补丁的作用域问题：改为直接读环境变量
  s6 = s6.split('if (__hmcsLive)').join('if (process.env.HMCS_LIVE_SPAWN === "1")');
  fs.writeFileSync(t6, s6);
  console.log('[patch6] live 透传修复（环境变量直接读取）');
} else if (s6.includes('HMCS_LIVE_SPAWN')) {
  console.log('[patch6] already applied');
} else {
  const f6b = '        childProcess.stdout.on("data", (data) => {\n            out += data;\n        });';
  const t6b = '        childProcess.stdout.on("data", (data) => {\n            out += data;\n            if (process.env.HMCS_LIVE_SPAWN === "1") process.stdout.write(data); // HMCS patch\n        });';
  const f6c = '        childProcess.stderr.on("data", (data) => {\n            errorOut += data;\n        });';
  const t6c = '        childProcess.stderr.on("data", (data) => {\n            errorOut += data;\n            if (process.env.HMCS_LIVE_SPAWN === "1") process.stderr.write(data); // HMCS patch\n        });';
  if (s6.includes(f6b) && s6.includes(f6c)) {
    fs.writeFileSync(t6, s6.replace(f6b, t6b).replace(f6c, t6c));
    console.log('[patch6] spawn 实时输出透传已启用（HMCS_LIVE_SPAWN=1 时生效）');
  } else {
    console.error('[patch6] pattern not found'); ok = false;
  }
}
process.exit(ok ? 0 : 1);
