// 账号模块：离线 / 微软正版 / authlib-injector 外置登录
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getConfig, setConfig, ROOT } = require('./config');
const { fetchJson, fetchWithRetry } = require('./net');
const UA = 'HMCS-Launcher/0.1.0 (Hallo Minecraft Space)';

// ---------- 离线 ----------
function offlineUUID(name) {
  const md5 = crypto.createHash('md5').update('OfflinePlayer:' + name, 'utf8').digest();
  md5[6] = (md5[6] & 0x0f) | 0x30; // version 3
  md5[8] = (md5[8] & 0x3f) | 0x80; // variant
  const h = md5.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function saveAccounts(cfg) {
  setConfig({ accounts: cfg.accounts, activeAccountId: cfg.activeAccountId });
}

function offlineLogin(name) {
  if (!name || !name.trim()) throw new Error('用户名不能为空');
  name = name.trim();
  if (name.length > 16) throw new Error('用户名最长 16 个字符');
  const cfg = getConfig();
  const acc = {
    id: 'offline-' + name,
    type: 'offline',
    name,
    uuid: offlineUUID(name),
    accessToken: '0', // 离线模式 token 由启动时随机化
    userType: 'legacy'
  };
  cfg.accounts = cfg.accounts.filter((a) => a.id !== acc.id);
  cfg.accounts.push(acc);
  cfg.activeAccountId = acc.id;
  saveAccounts(cfg);
  return acc;
}

// ---------- 微软正版（device code 流程） ----------
// 需要在设置里填入自己 Azure 应用的 Client ID（Public client, 开启 device code flow）
const MSA_SCOPES = 'XboxLive.signin offline_access';

let msaState = null; // 进行中的设备码会话

async function microsoftLoginStart(onProgress) {
  const cfg = getConfig();
  if (!cfg.msaClientId) {
    throw new Error('请先在设置中填写 Azure 应用 Client ID（微软正版登录需要）');
  }
  const res = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: new URLSearchParams({
      client_id: cfg.msaClientId,
      scope: MSA_SCOPES
    })
  });
  const data = await res.json();
  if (!data.device_code) throw new Error('获取设备码失败: ' + JSON.stringify(data));
  msaState = {
    deviceCode: data.device_code,
    interval: data.interval || 5,
    expiresAt: Date.now() + (data.expires_in || 900) * 1000,
    onProgress
  };
  onProgress && onProgress({ step: 'code', userCode: data.user_code, verificationUri: data.verification_uri });
  return { userCode: data.user_code, verificationUri: data.verification_uri };
}

async function microsoftLoginPoll() {
  if (!msaState) throw new Error('没有进行中的登录');
  const cfg = getConfig();
  const poll = async () => {
    while (Date.now() < msaState.expiresAt) {
      const res = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        body: new URLSearchParams({
          client_id: cfg.msaClientId,
          device_code: msaState.deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        })
      });
      const t = await res.json();
      if (t.access_token) return t;
      if (t.error === 'authorization_pending') {
        msaState.onProgress && msaState.onProgress({ step: 'waiting' });
        await new Promise((r) => setTimeout(r, msaState.interval * 1000));
        continue;
      }
      if (t.error === 'slow_down') {
        await new Promise((r) => setTimeout(r, (msaState.interval + 5) * 1000));
        continue;
      }
      throw new Error('微软登录失败: ' + (t.error_description || t.error));
    }
    throw new Error('登录超时，请重试');
  };
  const token = await poll();

  // XBL
  const xblRes = await fetch('https://user.auth.xboxlive.com/user/authenticate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA },
    body: JSON.stringify({
      Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${token.access_token}` },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    })
  });
  const xbl = await xblRes.json();
  const xblToken = xbl.Token;
  const uhs = xbl.DisplayClaims.xui[0].uhs;

  // XSTS
  const xstsRes = await fetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA },
    body: JSON.stringify({
      Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    })
  });
  const xsts = await xstsRes.json();
  const xstsToken = xsts.Token;

  // Minecraft 登录
  const mcRes = await fetch('https://api.minecraftservices.com/authentication/login_with_xbox', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ identityToken: `XBL3.0 x=${uhs};${xstsToken}` })
  });
  const mc = await mcRes.json();
  if (!mc.access_token) throw new Error('Minecraft 服务登录失败: ' + JSON.stringify(mc));

  // profile
  const profRes = await fetchWithRetry('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${mc.access_token}` }
  });
  const prof = await profRes.json();
  if (!prof.id) throw new Error('该账号没有 Minecraft 正版档案（未购买？）');

  const acc = {
    id: 'msa-' + prof.id,
    type: 'msa',
    name: prof.name,
    uuid: prof.id,
    accessToken: mc.access_token,
    userType: 'msa',
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + (mc.expires_in || 86400) * 1000
  };
  const cfg2 = getConfig();
  cfg2.accounts = cfg2.accounts.filter((a) => a.id !== acc.id);
  cfg2.accounts.push(acc);
  cfg2.activeAccountId = acc.id;
  saveAccounts(cfg2);
  msaState = null;
  return acc;
}

// ---------- 通用 ----------
function listAccounts() {
  return getConfig().accounts;
}

function removeAccount(id) {
  const cfg = getConfig();
  cfg.accounts = cfg.accounts.filter((a) => a.id !== id);
  if (cfg.activeAccountId === id) cfg.activeAccountId = cfg.accounts[0]?.id || '';
  saveAccounts(cfg);
  return cfg.accounts;
}

function getActiveAccount() {
  const cfg = getConfig();
  return cfg.accounts.find((a) => a.id === cfg.activeAccountId) || null;
}

function setActiveAccount(id) {
  const cfg = getConfig();
  if (!cfg.accounts.find((a) => a.id === id)) throw new Error('账号不存在');
  cfg.activeAccountId = id;
  saveAccounts(cfg);
  return true;
}

// 启动参数组装
async function buildAuthArgs(account, versionId) {
  if (account.type === 'offline') {
    return {
      name: account.name,
      uuid: account.uuid,
      accessToken: crypto.randomUUID().replace(/-/g, ''),
      userType: 'legacy'
    };
  }
  if (account.type === 'msa') {
    // token 过期则静默刷新
    if (account.expiresAt && Date.now() > account.expiresAt - 60000) {
      await refreshMsa(account);
    }
    return { name: account.name, uuid: account.uuid, accessToken: account.accessToken, userType: 'msa' };
  }
  if (account.type === 'authlib') {
    return { name: account.name, uuid: account.uuid, accessToken: account.accessToken, userType: 'mojang' };
  }
  throw new Error('未知账号类型');
}

async function refreshMsa(account) {
  const cfg = getConfig();
  const res = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: new URLSearchParams({
      client_id: cfg.msaClientId,
      refresh_token: account.refreshToken,
      grant_type: 'refresh_token',
      scope: MSA_SCOPES
    })
  });
  const t = await res.json();
  if (!t.access_token) throw new Error('正版登录已过期，请重新登录');
  account.accessToken = t.access_token;
  account.refreshToken = t.refresh_token || account.refreshToken;
  account.expiresAt = Date.now() + (t.expires_in || 86400) * 1000;
  saveAccounts(getConfig());
}

// 外置登录账号（通过 authlib-injector 服务器验证）
async function authlibLogin(serverUrl, username, password) {
  // 拉取服务器元数据
  const meta = await fetchJson(serverUrl);
  const authUrl = meta.meta?.['authenticate'] || serverUrl;
  const res = await fetchWithRetry(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ username, password, agent: { name: 'Minecraft', version: 1 }, requestUser: true })
  }, 1);
  if (!res.ok) throw new Error('登录失败（用户名或密码错误？）HTTP ' + res.status);
  const data = await res.json();
  const acc = {
    id: 'authlib-' + data.selectedProfile.id,
    type: 'authlib',
    name: data.selectedProfile.name,
    uuid: data.selectedProfile.id,
    accessToken: data.accessToken,
    userType: 'mojang',
    server: serverUrl
  };
  const cfg = getConfig();
  cfg.accounts = cfg.accounts.filter((a) => a.id !== acc.id);
  cfg.accounts.push(acc);
  cfg.activeAccountId = acc.id;
  saveAccounts(cfg);
  return acc;
}

module.exports = {
  offlineLogin,
  microsoftLoginStart,
  microsoftLoginPoll,
  authlibLogin,
  listAccounts,
  removeAccount,
  getActiveAccount,
  setActiveAccount,
  buildAuthArgs,
  offlineUUID
};
