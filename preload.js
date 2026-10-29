const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hmcs', {
  appVersion: ipcRenderer.sendSync('app:version'),
  onProgress: (cb) => ipcRenderer.on('hmcs:progress', (_e, data) => cb(data)),
  onLog: (cb) => ipcRenderer.on('hmcs:log', (_e, line) => cb(line)),

  winMinimize: () => ipcRenderer.send('win:minimize'),
  winMaximize: () => ipcRenderer.send('win:maximize'),
  winClose: () => ipcRenderer.send('win:close'),

  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),

  remoteVersions: () => ipcRenderer.invoke('versions:remote'),
  installedVersions: () => ipcRenderer.invoke('versions:installed'),
  installVersion: (id) => ipcRenderer.invoke('versions:install', id),

  installFabric: (mc) => ipcRenderer.invoke('loader:fabric', mc),
  installForge: (mc, forge) => ipcRenderer.invoke('loader:forge', mc, forge),
  forgeList: (mc) => ipcRenderer.invoke('loader:forge:list', mc),

  offlineLogin: (name) => ipcRenderer.invoke('account:offline', name),
  authlibLogin: (server, username, password) => ipcRenderer.invoke('account:authlib', { server, username, password }),
  msaStart: () => ipcRenderer.invoke('account:msa:start'),
  msaPoll: () => ipcRenderer.invoke('account:msa:poll'),
  listAccounts: () => ipcRenderer.invoke('account:list'),
  removeAccount: (id) => ipcRenderer.invoke('account:remove', id),
  getActiveAccount: () => ipcRenderer.invoke('account:getActive'),
  setActiveAccount: (id) => ipcRenderer.invoke('account:setActive', id),

  listAuthServers: () => ipcRenderer.invoke('auth:list'),
  fetchAuthlib: () => ipcRenderer.invoke('auth:authlib'),

  listJava: () => ipcRenderer.invoke('java:list'),
  downloadJava: (major) => ipcRenderer.invoke('java:download', major),
  ensureJava: (mcVersion) => ipcRenderer.invoke('java:ensure', mcVersion),

  listMods: (versionId) => ipcRenderer.invoke('mods:list', versionId),
  removeMod: (versionId, name) => ipcRenderer.invoke('mods:remove', versionId, name),
  openModsDir: (versionId) => ipcRenderer.invoke('mods:open', versionId),
  searchMods: (query, mcVersion, loader, projectType, category, offset, sort) => ipcRenderer.invoke('mods:search', query, mcVersion, loader, projectType, category, offset, sort),
  installMod: (versionId, slug, loader, projectType) => ipcRenderer.invoke('mods:install', versionId, slug, loader, projectType),
  importContent: (versionId, kind) => ipcRenderer.invoke('content:import', versionId, kind),
  // 拖拽：Electron 32+ 取 File 真实路径必须走 webUtils
  resolveDropPaths: (files) => {
    const paths = [];
    for (const f of files || []) {
      try {
        const p = require('electron').webUtils.getPathForFile(f);
        if (p) paths.push(p);
      } catch (e) { /* 跳过取不到路径的项 */ }
    }
    return paths;
  },
  dropImport: (versionId, paths) => ipcRenderer.invoke('content:drop', versionId, paths),
  classifyDrop: (paths) => ipcRenderer.invoke('content:classify', paths),
  checkUpdate: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: (info) => ipcRenderer.invoke('updater:download', info),
  localUpdate: () => ipcRenderer.invoke('updater:local'),
  listContent: (versionId, kind) => ipcRenderer.invoke('content:list', versionId, kind),
  removeContent: (versionId, kind, name) => ipcRenderer.invoke('content:remove', versionId, kind, name),
  openContentDir: (versionId, kind) => ipcRenderer.invoke('content:open', versionId, kind),
  getLocalIp: () => ipcRenderer.invoke('net:localIp'),
  openExternal: (url) => ipcRenderer.invoke('net:openExternal', url),

  launch: (versionId, opts = {}) => ipcRenderer.invoke('game:launch', { versionId, ...opts })
});
