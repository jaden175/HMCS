# 把 HMCS 发布到 GitHub（完整教程）

本项目已经是标准 Electron 工程，源码可直接推到 GitHub。全文按顺序执行即可，约 10 分钟。

> 约定：仓库名 `hmcs`，公开仓库，GitHub 用户名 `jaden175`。
>
> **没有 GitHub 账号 / 没用过命令行？** 请看 [GITHUB-新手教程.md](GITHUB-新手教程.md)（从注册账号、装 git 开始）。

---

## 0. 先确认两件事

| 项目 | 说明 |
|---|---|
| **`.gitignore` 已就绪** | 仓库根目录已有 `.gitignore`，会排除 `node_modules/`、`dist/`、`*.log` 等。**这一步千万别删**——`node_modules` 有 400MB+，推上去会直接被 GitHub 拒绝（单文件 100MB 硬限制）。 |
| **项目主页已就绪** | 根目录 `index.html` 就是 GitHub Pages 主页（像素极简风，与启动器同一套草方块绿）。 |

---

## 1. 本地初始化 Git 仓库

```bash
cd hmcs

git init -b main                 # 以 main 为主分支
git config user.name  "你的名字"
git config user.email "你的邮箱"

git add .
git status                       # 确认列表里没有 node_modules / dist
git commit -m "feat: HMCS 0.1.0 初始版本"
```

> `git status` 输出里只应有 `main.js`、`preload.js`、`renderer/`、`src/`、`tests/`、`tools/`、`build/`、`index.html`、`README.md`、`package.json`、`package-lock.json`、`.gitignore` 等源码文件。

---

## 2. 在 GitHub 上创建空仓库并推送

**方式 A：网页创建（最直观）**

1. 打开 <https://github.com/new>
2. Repository name 填 `hmcs`，Description 填 `Hallo Minecraft Space — 极简 Minecraft 启动器`
3. 选 **Public**（要开 Pages 就必须公开）
4. **不要**勾选 "Add a README file"（本地已有，避免冲突）
5. 点 **Create repository**

**方式 B：命令行一次搞定（推荐）**

```bash
cd hmcs
gh repo create hmcs --public --description "Hallo Minecraft Space — 极简 Minecraft 启动器" --source=. --remote=origin --push
```

没有 `gh` 命令就先装：<https://cli.github.com>（`gh auth login` 登录）。

推送后 `git remote -v` 应能看到 origin 地址。

---

## 3. 开启 GitHub Pages（项目主页上线）

仓库根目录已有 `index.html`，所以：

1. 进仓库 → **Settings** → 左侧 **Pages**
2. **Build and deployment → Source** 选 **Deploy from a branch**
3. Branch 选 **main**、目录选 **/ (root)** → Save
4. 等 1~2 分钟，页面顶部出现 `https://<用户名>.github.io/hmcs/`

> 如果你的仓库名是 `<用户名>.github.io` 之外的普通名，地址就是 `https://<用户名>.github.io/hmcs/`。

---

## 4. 发布 Release 并挂上安装包

产物在 `dist/`（已被 gitignore 排除，所以不会进仓库历史，靠 Release 分发）：

```bash
# 1) 先确保产物是最新的
npm run dist:win     # Windows 上执行 → dist/HMCS-setup-0.1.0.exe
npm run dist:deb     # 任意平台    → dist/HMCS-0.1.0-amd64.deb
npm run dist:zip     # 任意平台    → dist/HMCS-0.1.0-win.zip

# 2) 打 tag（tag 名建议带 v 前缀）
git tag -a v0.1.0 -m "HMCS v0.1.0"
git push origin main --tags

# 3) 建 Release 并上传产物
gh release create v0.1.0 \
  --title "HMCS v0.1.0" \
  --notes "详见 CHANGELOG.md" \
  dist/HMCS-setup-0.1.0.exe \
  dist/HMCS-0.1.0-amd64.deb \
  dist/HMCS-0.1.0-win.zip
```

网页等价操作：仓库右侧 **Releases → Draft a new release → 选择 tag → 拖拽文件上传**。

发布后 `dist/` 里的文件即可通过 Releases 页面下载，主页的「下载」按钮指向 Releases 即可。

---

## 5. 版本号同步（别忘了这处）

`package.json` 的 `version` 字段是启动器显示的版本号，和 tag 必须一致：

```bash
npm version 0.1.1 --no-git-tag-version   # 改 package.json
git commit -am "chore: bump to 0.1.1"
git tag -a v0.1.1 -m "HMCS v0.1.1"
git push origin main --tags
```

---

## 6. 主页链接改成你的真实地址

`index.html` 里的 GitHub 链接目前是占位 `https://github.com`，全量替换成真实仓库地址：

```bash
sed -i "s|https://github.com\"|https://github.com/jaden175/hmcs\"|g" index.html
sed -i "s|https://github.com/\" target=\"_blob\"|https://github.com/jaden175/hmcs/releases\"|g" index.html
```

更稳的做法是直接编辑 `index.html`，把导航栏、按钮、页脚里的 `https://github.com` 全部改成 `https://github.com/jaden175/hmcs`。

---

## 7. 常见坑

| 现象 | 原因与解法 |
|---|---|
| push 被拒 `file larger than 100MB` | `node_modules/` 或 `dist/` 被提交了。`git rm -r --cached node_modules dist` 后重新提交，`.gitignore` 已包含它们。 |
| Pages 404 | 分支或目录选错；必须是 **main 分支 + / (root)**，且仓库必须 Public。 |
| README 里图片不显示 | 相对路径 `docs/x.png` 可用；引用仓库外文件必须用 raw 链接。 |
| 想让主页与 README 分离 | 保留根目录 `index.html` 给 Pages，README.md 给仓库首页，两者互不影响。 |
| 密钥泄露 | 不要把 Azure Client ID 之外的任何凭据写进仓库；`src/core/config.js` 只存用户本机配置。 |
| 产物不想进 git 但想被下载 | 就用 Releases（见第 4 步），不要把 `dist/` 提交进仓库。 |

---

## 8. 一键检查清单

```bash
git status --short              # 应为空
git ls-files | grep -c node_modules   # 应为 0
git ls-files | head -20         # 确认只有源码
gh repo view --web              # 打开仓库主页
```

仓库主页、Pages 主页、Release 下载链接三者齐活，HMCS 就正式上线了。
