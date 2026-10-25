# HMCS 托管方案对比 · GitHub 之外怎么放

> 结论先说：**你已经有的云服务器（思亦云）+ nginx 是最省心的方案**——主页、安装包、自更新清单全放自己手里，不受任何平台规则限制。
> 不想动服务器就用 **EdgeOne Pages（腾讯云）**；想零成本零账号就用 **Cloudflare Tunnel**。

---

## 一、方案对比

| 方案 | 放主页 | 放安装包(200MB+) | 账号门槛 | 国内速度 | 备注 |
|---|---|---|---|---|---|
| **自己的云服务器 + nginx**（思亦云） | ✅ | ✅ 不限 | 已有 | ✅ 最快 | **推荐**，完全可控，还能做应用内自更新源 |
| **腾讯云 EdgeOne Pages + COS** | ✅ 拖拽上传 | ✅ COS 放包 | 腾讯云实名 | ✅ 快 | 不想运维就选它 |
| **Cloudflare Pages + R2** | ✅ 拖拽上传 | ✅ R2（10GB 免费出网） | 邮箱（免费） | ⚠️ 一般 | 全免费 internationally，但国内偶尔慢 |
| **Vercel / Netlify** | ✅ 一键 | ⚠️ 单文件上限 | 邮箱 | ⚠️ 慢 | 生态好，但对国内用户不友好 |
| **Gitee 码云** | ⚠️ Pages 受限 | ✅ Release 附件 | 需实名认证 | ✅ 快 | 想要"仓库"体验的话选它 |
| **Cloudflare Tunnel**（自己电脑/NAS） | ✅ 临时域名 | ✅ 本地文件直出 | 零账号 | 看你带宽 | 文件不外传，机器要一直开 |
| **百度/夸克网盘** | ❌ | ✅ 分享链接 | 有账号 | ⚠️ 限速 | 临时给朋友装可以用 |
| **WorkBuddy 发布应用** | ✅ | ❌ 单文件 | 已有 | ✅ | 临时预览，链接需带参数 |

---

## 二、推荐方案 A：思亦云（自己的服务器）

假设你的服务器能用 SSH 登录，站点目录假设是 `/var/www/hmcs`：

```bash
# 1) 在服务器上放文件
rsync -avz dist/site/ user@你的服务器:/var/www/hmcs/

# 2) 把安装包也传上去
rsync -avz --progress \
  dist/HMCS-0.1.0-win.zip \
  dist/HMCS-0.1.0-amd64.deb \
  user@你的服务器:/var/www/hmcs/

# 3) nginx 配置（新建 /etc/nginx/conf.d/hmcs.conf）
cat <<'CONF' | sudo tee /etc/nginx/conf.d/hmcs.conf
server {
    listen 80;
    server_name 你的域名或IP;
    root /var/www/hmcs;
    index index.html;

    # 大文件下载（安装包 200MB+）
    client_max_body_size 512m;
    location / {
        try_files $uri $uri/ =404;
    }
    # 静态资源缓存
    location ~* \.(zip|deb|exe|asar)$ {
        add_header Cache-Control "public, max-age=86400";
    }
    # 主页不缓存，保证更新立刻生效
    location = /index.html {
        add_header Cache-Control "no-cache";
    }
}
CONF
sudo nginx -t && sudo systemctl reload nginx
```

**验证**：浏览器打开 `http://你的域名/` → 应看到 HMCS 主页；`http://你的域名/update.json` 应能看到 JSON。

**开启应用内自更新**（启动器 → 设置 → 软件更新 → 更新源）：

```
http://你的域名/update.json
```

以后出新版本：把新的 `app.asar` 传上去 → 改 `update.json` 里的 `version` 和 `sha256` → 启动器就会提示更新。

---

## 三、推荐方案 B：EdgeOne Pages（腾讯云，不想运维）

1. 登录 [EdgeOne Pages](https://edgeone.ai/products/pages) → 新建项目 → **上传文件夹**
2. 把 `dist/site/` 里的 `index.html`（以及你要放的文件）拖进去
3. 拿到 `*.edgeone.app` 域名；也可绑自己的域名
4. 安装包（218MB）单文件超 Pages 限制，放到 **COS** 或思亦云，主页里改成对应直链即可

命令行上传（可选）：
```bash
npx edgeone pages deploy dist/site ./dist/site
```

---

## 四、推荐方案 C：Cloudflare Pages + R2（零成本）

1. [Cloudflare Pages](https://pages.cloudflare.com) → Create project → **Upload assets** → 拖 `dist/site/index.html`
2. 得到 `https://xxx.pages.dev`
3. 安装包放 **R2**（免费 10GB 月出网）：建 bucket → 上传 → 绑定公开域名/R2.dev 域名
4. 主页里的下载链接改成 R2 的直链

---

## 五、方案 D：SSH 隧道（零账号，我已经帮你开好了）

不想注册任何平台的话，SSH 反向隧道可以直接把**你自己电脑**变成服务器：

```bash
# 1) 本地起一个静态服务（站点目录）
cd hmcs/dist/serve && python3 -m http.server 8901 --bind 127.0.0.1

# 2) 开公网隧道（localhost.run 免注册，免密）
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 \
    -R 80:127.0.0.1:8901 nokey@localhost.run
```

终端会打印一个 `https://fa7e65890d9030.lhr.life` 地址，这就是你的公网主页。

**当前已开好的地址**（本会话期间有效）：

| 用途 | 地址 |
|---|---|
| 项目主页 | https://fa7e65890d9030.lhr.life |
| Windows 便携版 | https://fa7e65890d9030.lhr.life/HMCS-0.1.0-win.zip |
| Linux 安装包 | https://fa7e65890d9030.lhr.life/HMCS-0.1.0-amd64.deb |
| 源码包 | https://fa7e65890d9030.lhr.life/HMCS-0.1.0-source.zip |
| 自更新清单 | https://fa7e65890d9030.lhr.life/update.json |
| 自更新包 | https://fa7e65890d9030.lhr.life/app.asar |

> ⚠️ 特点：零注册、零成本、文件不过第三方；**这台机器要开着**，地址每次重开都会变。
>
> **我已经配好的自启（登录即自动上线）**：
> - 开机自启条目：`~/.config/autostart/hmcs-site.desktop`（登录后延迟 25 秒自动拉起）
> - 一键脚本：`tools/serve-site.sh` —— 断线自动重连，并把新地址同步到主页与 update.json
> - **随时查看当前地址**：`cat hmcs/dist/serve/当前地址.txt`
> - 日志：`hmcs/dist/serve/serve.log`（含每次连接/断开记录）
>
> **关于"永久地址"的实话**（已实测 + 查证官方文档）：localhost.run 免费域名**会定期轮换**，
> 加了 SSH 密钥只是"活得更久"，官方文档也写明 *Domain names change regularly*。
> 实测连开 3 次得到 3 个不同地址。所以想要**真正固定**的地址有两条：
>
> | 方案 | 固定地址 | 成本 | 步骤 |
> |---|---|---|---|
> | **Cloudflare Pages + 对象存储** | `xxx.pages.dev` | 免费（邮箱注册） | 主页拖 index.html 上去；大文件传 COS/R2 |
> | **EdgeOne Pages + 腾讯云 COS** | `xxx.edgeone.app` | 免费额度（需实名） | 同上，且国内更快 |
> | 自己的域名 + Cloudflare Tunnel | `hmcs.你的域名.com` | 域名 ¥30-70/年 | 域名解析到 Cloudflare |
>
> **页面和文件可以分开托管**（推荐）：
> ```bash
> bash tools/build-site.sh https://你的页面地址 --files-base=https://你的对象存储地址
> ```
> 主页放 Pages（永久地址），218MB 的安装包放对象存储（直链下载，还能开 CDN），
> 自更新清单 `update.json` 也放对象存储 —— 启动器「设置 → 软件更新」填它的地址即可。

**本地站点目录** `hmcs/dist/serve/` 里已放好：主页、安装包（软链）、源码包、app.asar、update.json。

---

## 五·补、给隧道域名"续命"（注册 + 绑定密钥，3 步）

localhost.run 的规则：**注册账号 + 添加 SSH 公钥 → 你的密钥被记录，域名存活时间更长**（但免费域名仍会定期轮换，见下方实测）。

我已经把该用的密钥生成好了，**你只需要做前两步**：

**第 1 步**：注册并登录 <https://admin.localhost.run/>（邮箱 + 密码，邮箱验证）

**第 2 步**：在后台页面添加这把公钥（整行复制过去）：

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOoZcAGyl7HgXC4NdFvrnmt20GajOHrOHFPJCscWEt4B hmcs-site@jaden175
```

也可以直接用命令复制：
```bash
cat ~/.ssh/hmcs_lhr.pub
```

**第 3 步**：重启服务（密钥由脚本自动带上；后台页面随后会显示这把密钥的状态）

```bash
pkill -f "serve-site.sh"; sleep 2
bash /home/zhangzihe/WorkBuddy/2026-10-23-12-26-56/hmcs/tools/serve-site.sh
```

登录后台你就能看到**专属的固定域名**（形如 `xxx.lhr.life`），把它写进 `dist/serve/当前地址.txt` 即可；
服务脚本每次重连都会自动检测并同步主页与 update.json 到该域名。

> 🔑 私钥在 `~/.ssh/hmcs_lhr`（仅本机可读，权限 600），**不要外发**。
> 后台页面若显示 "no tunnel"，说明**此刻这把密钥没有活跃隧道**——重启 `tools/serve-site.sh` 即可看到它变成在线。
> 想要**完全固定**的地址，请看下方「固定地址方案」表。

---

## 六、无论选哪家，上传什么

`dist/site/` 里已经准备好（由 `tools/build-site.sh` 生成）：

| 文件 | 作用 |
|---|---|
| `index.html` | 主页，下载链接已重定向到你的地址 |
| `update.json` | 应用内自更新清单（version / asarUrl / sha256 已填好） |
| `上传清单.txt` | 逐项对照表，照着传就行 |

需要另外上传的（体积大，建议放对象存储或服务器）：

| 文件 | 大小 |
|---|---|
| `HMCS-0.1.0-win.zip` | 218MB（Windows 便携版，自带 install.cmd） |
| `HMCS-0.1.0-amd64.deb` | 176MB（Linux） |
| `HMCS-setup-0.1.0.exe` | Windows 安装包（需在 Windows 上 `npm run dist:win`） |
| `app.asar` | 166MB（自更新包，可选） |

**改地址的方法**：确定最终地址后，在项目目录执行

```bash
bash tools/build-site.sh https://你的最终地址
```

会重新生成 `dist/site/`，所有链接自动改好。

---

## 七、常见问题

| 问题 | 说明 |
|---|---|
| 主页打开是 403？ | 思亦云若是带鉴权的分享链接，同样需要**完整链接**（带参数），只复制域名会报"链接不完整" |
| 219MB 下载很慢？ | 对象存储建议开 CDN；自建服务器建议用 nginx + `sendfile` |
| 装完 exe 打不开游戏？ | 与托管无关，是启动器内 Java/下载问题，见日志页具体报错 |
| 以后更新主页？ | 改 `index.html` 后重新跑一次 `build-site.sh` 再上传即可 |
