const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { getConfig, setConfig } = require('./src/core/config');
const {
  getRemoteVersions,
  getInstalledVersions,
  installVersion,
  launchGame,
  cancelDownload
} = require('./src/core/minecraft');
const {
  offlineLogin,
  microsoftLoginStart,
  microsoftLoginPoll,
  authlibLogin,
  listAccounts,
  removeAccount,
  getActiveAccount,
  setActiveAccount
} = require('./src/core/account');
const {
  listJava,
  downloadJava,
  ensureJavaForVersion
} = require('./src/core/java');
const { listContent, removeContent, kindRoot, searchContent, installContent, importContentFiles, listMods, removeMod, modsDir } = require('./src/core/mods');
const {
  installFabric,
  installForge,
  forgeVersionsFor,
  fetchAuthlibInjector,
  listAuthServers
} = require('./src/core/modloader');

let win = null;

function sendProgress(phase, payload) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('hmcs:progress', { phase, ...payload });
  }
}

function sendLog(line) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('hmcs:log', line);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 960,
    height: 640,
    minWidth: 820,
    minHeight: 560,
    frame: false,
    title: 'HMCS - Hallo Minecraft Space',
    backgroundColor: '#0e0f12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ---------- window controls ----------
ipcMain.on('win:minimize', () => win.minimize());
ipcMain.on('app:version', (e) => { e.returnValue = app.getVersion(); });
ipcMain.on('win:maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
ipcMain.on('win:close', () => win.close());

// ---------- config ----------
ipcMain.handle('config:get', () => getConfig());
ipcMain.handle('config:set', (_e, patch) => setConfig(patch));

// ---------- versions ----------
ipcMain.handle('versions:remote', () => getRemoteVersions());
ipcMain.handle('versions:installed', () => getInstalledVersions());
ipcMain.handle('versions:install', (_e, id) => {
  return installVersion(id, (p) => sendProgress('download', p));
});

// ---------- modloader ----------
ipcMain.handle('loader:fabric', (_e, mcVersion) => installFabric(mcVersion, (p) => sendProgress('download', p)));
ipcMain.handle('loader:forge:list', (_e, mcVersion) => forgeVersionsFor(mcVersion));
ipcMain.handle('loader:forge', (_e, mcVersion, forgeVersion) =>
  installForge(mcVersion, forgeVersion, (p) => sendProgress('download', p), sendLog)
);

// ---------- accounts ----------
ipcMain.handle('account:offline', (_e, name) => offlineLogin(name));
ipcMain.handle('account:authlib', (_e, { server, username, password }) => authlibLogin(server, username, password));
ipcMain.handle('account:msa:start', () => microsoftLoginStart((p) => sendProgress('msa', p)));
ipcMain.handle('account:msa:poll', () => microsoftLoginPoll());
ipcMain.handle('account:list', () => listAccounts());
ipcMain.handle('account:remove', (_e, id) => removeAccount(id));
ipcMain.handle('account:getActive', () => getActiveAccount());
ipcMain.handle('account:setActive', (_e, id) => setActiveAccount(id));

// ---------- auth servers ----------
ipcMain.handle('auth:list', () => listAuthServers());
ipcMain.handle('auth:authlib', () => fetchAuthlibInjector((p) => sendProgress('download', p)));

// ---------- java ----------
ipcMain.handle('java:list', () => listJava());
ipcMain.handle('java:download', (_e, major) => downloadJava(major, (p) => sendProgress('download', p)));
ipcMain.handle('java:ensure', (_e, mcVersion) => ensureJavaForVersion(mcVersion));

// ---------- mods ----------
ipcMain.handle('mods:list', (_e, versionId) => listMods(versionId));
ipcMain.handle('mods:remove', (_e, versionId, name) => removeMod(versionId, name));
ipcMain.handle('mods:open', async (_e, versionId) => {
  const { shell } = require('electron');
  const dir = modsDir(versionId);
  require('fs').mkdirSync(dir, { recursive: true });
  return shell.openPath(dir);
});
ipcMain.handle('mods:search', (_e, query, mcVersion, loader, projectType, category) => searchContent(query, mcVersion, loader, projectType || 'mod', category || ''));
ipcMain.handle('mods:install', (_e, versionId, slug, loader, projectType) =>
  installContent(versionId, slug, loader, projectType || 'mod', (p) => sendProgress('download', p))
);
ipcMain.handle('content:list', (_e, versionId, kind) => listContent(versionId, kind));
ipcMain.handle('content:remove', (_e, versionId, kind, name) => removeContent(versionId, kind, name));
ipcMain.handle('content:open', async (_e, versionId, kind) => {
  const { shell } = require('electron');
  const dir = kindRoot(versionId, kind);
  require('fs').mkdirSync(dir, { recursive: true });
  return shell.openPath(dir);
});
// 本地文件直接导入（模组 jar / 资源包·光影 zip）
ipcMain.handle('content:import', async (_e, versionId, kind) => {
  const { dialog } = require('electron');
  const def = { mods: 'jar', resourcepacks: 'zip', shaderpacks: 'zip' }[kind];
  if (!def) throw new Error('该类型不支持文件导入');
  const r = await dialog.showOpenDialog(win, {
    title: kind === 'mods' ? '选择要导入的模组 (.jar)' : '选择要导入的文件 (.zip)',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: kind === 'mods' ? '模组文件' : '资源文件', extensions: [def] }]
  });
  if (r.canceled || !r.filePaths.length) return { dir: '', imported: [], skipped: [] };
  return importContentFiles(versionId, kind, r.filePaths);
});

// ---------- 应用内自更新 ----------
const updater = require('./src/core/updater');
const APP_VERSION = app.getVersion();
ipcMain.handle('updater:check', async () => {
  const cfg = getConfig();
  return updater.checkUpdate(cfg.updateManifestUrl, APP_VERSION);
});
ipcMain.handle('updater:download', async (_e, info) => {
  const os = require('os');
  const staged = await updater.downloadUpdatePackage(info.asarUrl, info.sha256,
    path.join(os.tmpdir(), 'hmcs-update-' + Date.now()), (p) => sendProgress('download', p));
  applyUpdateAndRestart(staged);
  return { staged, restarting: true };
});
ipcMain.handle('updater:local', async () => {
  const { dialog } = require('electron');
  const r = await dialog.showOpenDialog(win, {
    title: '选择更新包 (app.asar)',
    properties: ['openFile'],
    filters: [{ name: 'HMCS 更新包', extensions: ['asar'] }]
  });
  if (r.canceled || !r.filePaths.length) return { canceled: true };
  applyUpdateAndRestart(r.filePaths[0]);
  return { restarting: true };
});
// 暂存更新包 → 写重启脚本 → 退出应用，由脚本完成替换并拉起新版
function applyUpdateAndRestart(packagePath) {
  if (!app.isPackaged) throw new Error('开发模式下不支持自更新（npm start）');
  const fs = require('fs');
  const resDir = process.resourcesPath;
  const target = path.join(resDir, 'app.asar');
  const staged = path.join(resDir, 'app.asar.update');
  fs.copyFileSync(packagePath, staged);
  const exe = process.execPath;
  const pid = process.pid;
  let script, args;
  if (process.platform === 'win32') {
    script = path.join(resDir, 'hmcs-update.bat');
    fs.writeFileSync(script, [
      '@echo off',
      ':wait',
      `tasklist /FI "PID eq ${pid}" | find "${pid}" >nul && (timeout /t 1 /nobreak >nul & goto wait)`,
      `move /Y "${staged}" "${target}" >nul`,
      `start "" "${exe}"`,
      'del "%~f0"'
    ].join('\r\n'));
    args = [];
  } else {
    script = path.join(resDir, 'hmcs-update.sh');
    fs.writeFileSync(script, [
      '#!/bin/sh',
      `while kill -0 ${pid} 2>/dev/null; do sleep 1; done`,
      `mv -f "${staged}" "${target}"`,
      `nohup "${exe}" >/dev/null 2>&1 &`
    ].join('\n'));
    fs.chmodSync(script, 0o755);
    args = [];
  }
  const { spawn } = require('child_process');
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/c', script], { detached: true, stdio: 'ignore', windowsHide: true })
    : spawn('/bin/sh', [script], { detached: true, stdio: 'ignore' });
  child.unref();
  sendLog('[hmcs] 更新已就绪，正在重启…');
  setTimeout(() => app.exit(0), 300);
}
ipcMain.handle('net:localIp', () => {
  const os = require('os');
  const ifs = os.networkInterfaces();
  for (const list of Object.values(ifs)) {
    for (const it of list || []) {
      if (it.family === 'IPv4' && !it.internal) return it.address;
    }
  }
  return '127.0.0.1';
});
ipcMain.handle('net:openExternal', (_e, url) => {
  if (!/^https?:\/\//.test(url)) return false; // 只允许 http(s)
  const { shell } = require('electron');
  return shell.openExternal(url);
});

// ---------- launch ----------
ipcMain.handle('game:launch', (_e, { versionId, serverIp, serverPort }) => {
  sendLog('[hmcs] 正在准备启动 ' + versionId);
  return launchGame(versionId, {
    onLog: sendLog,
    onProgress: (p) => sendProgress('download', p),
    serverIp,
    serverPort
  });
});
