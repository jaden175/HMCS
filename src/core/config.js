const path = require('path');
const fs = require('fs');

const ROOT = path.join(appDataRoot(), 'hmcs');
const MC_DIR = path.join(ROOT, 'minecraft');
const CFG_FILE = path.join(ROOT, 'config.json');

function appDataRoot() {
  try {
    const { app } = require('electron');
    if (app && app.getPath) return app.getPath('userData');
  } catch (e) { /* plain node (tests) */ }
  return path.join(process.env.HOME || process.cwd(), '.hmcs-test');
}

const DEFAULTS = {
  downloadSource: 'bmclapi', // 'bmclapi' | 'mojang'
  maxConcurrency: 16,
  minMemoryMB: 2048,
  maxMemoryMB: 4096,
  javaPath: '',            // 留空自动选择
  gameDir: '',             // 留空 = MC_DIR/versions/<id>
  windowWidth: 1280,
  windowHeight: 720,
  fullscreen: false,
  msaClientId: '',         // 微软登录需自备 Azure 应用 Client ID
  themeColor: '#3fae52',   // UI 主题色
  activeAccountId: '',
  servers: [],             // 联机页保存的服务器 {name,ip,port,version}
  accounts: [],            // {id,type:'offline'|'msa'|'authlib',name,uuid,accessToken,extra}
  authServerUrl: 'https://littleskin.cn/api/yggdrasil',
  updateManifestUrl: '',   // 应用内自更新的清单 JSON 地址
  javaInstalls: []         // 已下载的 Java 路径
};

let cache = null;

function ensureDirs() {
  for (const d of [ROOT, MC_DIR, path.join(MC_DIR, 'versions'), path.join(MC_DIR, 'libraries'), path.join(MC_DIR, 'assets')]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

function getConfig() {
  if (!cache) {
    ensureDirs();
    let loaded = {};
    try { loaded = JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')); } catch (e) {}
    cache = Object.assign({}, DEFAULTS, loaded);
  }
  return cache;
}

function setConfig(patch) {
  const cfg = getConfig();
  Object.assign(cfg, patch);
  fs.writeFileSync(CFG_FILE, JSON.stringify(cfg, null, 2));
  return cfg;
}

module.exports = { getConfig, setConfig, ROOT, MC_DIR, ensureDirs };
