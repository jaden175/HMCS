# HMCS 上架 GitHub · 零基础教程

> 面向完全没用过 GitHub 的人。全程约 **15 分钟**，其中注册账号 3 分钟。
> 看完你会有：一个 GitHub 账号、一个公开仓库、一个能在线访问的项目主页、别人能下载的安装包。

---

## 第 0 步：注册 GitHub 账号（3 分钟）

1. 打开 <https://github.com/signup>
2. 填三样东西：
   - **邮箱**：用你常用的（要收验证邮件）
   - **用户名**：想好后不能随便改，以后你的主页地址就是 `github.com/这个用户名`
   - **密码**：至少 8 位
3. 勾选验证邮件里的链接，账号就激活了
4. 建议顺手开**两步验证**（Settings → Password and authentication → Two-factor authentication），更安全

> 💡 **不想用命令行？** 装 [GitHub Desktop](https://desktop.github.com/)（有图形界面，拖拽即可上传代码），后面第 3、5、8 步可以用它替代。本教程仍以命令行讲，因为更通用。

---

## 第 1 步：在电脑上装 Git（1 分钟）

打开终端（deepin 里按 `Ctrl+Alt+T`），执行：

```bash
sudo apt update
sudo apt install git
git --version        # 出现 git version 2.x 就装好了
```

---

## 第 2 步：告诉 Git 你是谁（一次性）

```bash
git config --global user.name "你的名字"
git config --global user.email "你注册GitHub用的邮箱"
```

> 这两条只需做一次，以后所有项目通用。邮箱要和 GitHub 账号一致，提交记录才会显示你的头像和名字。

---

## 第 3 步：把 HMCS 变成一个"仓库"

进到项目文件夹（`hmcs` 目录），依次执行：

```bash
cd hmcs
git init -b main
git add .
git commit -m "HMCS 第一个版本"
```

看到 `git commit` 输出的提交编号就成功了。

> ❗ 不用担心 `git add .` 会把 400MB 的 node_modules 一起传上去——项目里已经有 `.gitignore` 自动排除了它。可以随时用 `git status` 检查将被提交的文件。

---

## 第 4 步：在 GitHub 网页上建一个空仓库

1. 登录 <https://github.com>，右上角点 **+** → **New repository**
2. 填：
   - **Repository name**：`hmcs`
   - **Description**：`Hallo Minecraft Space — 极简 Minecraft 启动器`
   - 选 **Public**（公开）——**必须公开**，否则后面的 Pages 主页不开
   - ⚠️ **不要**勾选 "Add a README file"、不要勾 "Add .gitignore"、语言选 None（本地已经有了，重复会冲突）
3. 点 **Create repository**

---

## 第 5 步：把本地代码推上去

回到终端，还在 `hmcs` 目录里，执行（命令已填好你的 GitHub 用户名 `jaden175`，可直接复制）：

```bash
git remote add origin https://github.com/jaden175/hmcs.git
git push -u origin main
```

推送时提示 **Username / Password**：

- 用户名：填 GitHub 用户名
- 密码：**不能填登录密码！** 要填 **Personal Access Token**

**拿 Token 的方法**（只显示一次，复制好）：

1. 右上角头像 → **Settings**
2. 左侧最下面 → **Developer settings**
3. **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**
4. Note 随便填（如 `hmcs`），Expiration 选个期限，**勾选 `repo`**，滑到底点 **Generate token**
5. 复制那串 `ghp_...`，粘贴到密码框

推送成功会看到 `main -> main`。刷新 GitHub 页面，代码就上去了 ✅

---

## 第 6 步：让项目主页上线（GitHub Pages）

> 💡 想先看看效果？你的 GitHub Pages 上线后地址就是 **https://jaden175.github.io/hmcs/**；若用 WorkBuddy 的「发布应用」托管，需要到「设置—数据管理—我发布的应用」里复制**完整**分享链接（只复制域名会提示"链接不完整"）。
> 等你的 GitHub Pages 配好后，把主页里的下载链接换成你自己的 Releases 链接即可。

1. 仓库页面 → 顶部 **Settings**
2. 左侧 → **Pages**
3. **Build and deployment → Source** 选 **Deploy from a branch**
4. **Branch** 选 `main`，目录选 `/ (root)` → **Save**
5. 等 1~2 分钟，页面顶部会出现绿色提示
6. 访问 **https://jaden175.github.io/hmcs/** ——项目主页上线了 🎉

> 主页面文件是项目根目录的 `index.html`，不需要任何额外操作。

---

## 第 7 步：把安装包放上去给大家下载

### 7.1 先在 Windows 上做出安装包

Windows 安装包（`HMCS-setup-0.1.0.exe`）需要在 **Windows 机器**上构建（Linux 打包工具链不完整）：

```bash
npm install
npm run dist:win
```

产物在 `dist/` 目录。Linux 的 `.deb` 任意机器都能构建：`npm run dist:deb`。

### 7.2 打标签并推送

```bash
git tag -a v0.1.0 -m "HMCS v0.1.0"
git push origin v0.1.0
```

### 7.3 在网页上创建 Release 并上传文件

1. 仓库右侧栏点 **Releases**（可能显示 "No releases published yet"）
2. 点 **Draft a new release**
3. **Choose a tag** 选刚推的 `v0.1.0`
4. 标题写 `HMCS v0.1.0`，下面写几句更新说明
5. 页面下方 **Attach files** 区域，**把 `dist/` 里的文件直接拖进去上传**（exe / deb / zip 都可以，多选）
6. 点 **Publish release**

完成！下载链接长这样：
`https://github.com/jaden175/hmcs/releases/download/v0.1.0/HMCS-0.1.0-amd64.deb`

### 7.4 主页链接（已帮你填好 ✅）

`index.html` 与 `README.md` 里指向 GitHub 的链接**已经全部替换成你的真实地址**：

- 仓库链接 → `https://github.com/jaden175/hmcs`
- 下载按钮 → `https://github.com/jaden175/hmcs/releases`
- 主页地址 → `https://jaden175.github.io/hmcs/`

你不需要手动改。如果之后改了仓库名，再执行一次这个命令即可批量替换：

```bash
cd hmcs
bash tools/publish-github.sh jaden175 --links-only
git add . && git commit -m "更新主页链接" && git push
```

---

## 🅱️ 路线 B：完全不用命令行（网页拖拽上传）

不想装 git、记不住命令？用这条路线，**只需要浏览器**。

1. 照常在 <https://github.com/signup> 注册账号
2. 按第 4 步在网页上建空仓库（Repository name 填 `hmcs`，选 Public，不勾 README）
3. 打开仓库页面 → 顶部 **Add file** → **Upload files**
4. 解压准备好的 **`dist/HMCS-0.1.0-source.zip`**（0.2MB，32 个文件，已排除 node_modules），把里面的**所有文件和文件夹**拖进上传框
5. 底部 Commit message 写 `HMCS 初始版本`，点 **Commit changes**
6. 接着做**第 6 步开 Pages**（主页就能上线）和**第 7 步发 Release**（把安装包拖到 Releases 上传区）

> ⚠️ 拖拽上传时**要选中 zip 里的全部内容**（包括 `src/`、`renderer/`、`tools/` 等文件夹），别只传 `index.html`。
> 缺点：没有版本历史，命令行方式（路线 A）才有 commit 记录和 tag。

---

## 第 8 步：以后每次更新，只要三条命令

```bash
cd hmcs
git add .
git commit -m "修复了下载断流问题"
git push
```

想让别人拿到新版，再走一遍第 7 步（打新 tag + 发 Release）。

---

## 常见问题速查

| 报错 / 现象 | 原因 & 解决 |
|---|---|
| `Please tell me who you are` | 第 2 步没做，补两条 `git config --global ...` |
| `remote origin already exists` | 改地址：`git remote set-url origin https://github.com/jaden175/hmcs.git` |
| `Support for password authentication was removed` | 密码位要填 **Token**，见第 5 步 |
| `Permission denied (publickey)` | 用了 SSH 但没配密钥；改用 HTTPS 地址即可 |
| `error: large files detected` | 误提交了 node_modules：删掉 `node_modules` 目录后重新 `git add .`（.gitignore 已排除，正常不会发生） |
| Pages 打开是 404 | 仓库必须是 **Public**；分支选 `main`；目录选 `/ (root)`；等 1~2 分钟 |
| 提交记录里没有我的头像 | 邮箱和 GitHub 账号不一致，检查第 2 步 |
| 想撤销还没推送的提交 | `git reset --soft HEAD~1`（保留改动） |
| 想改仓库名 | Settings → General → Repository name → Rename（主页地址会变） |

---

## 上线自查清单

- [ ] 账号已注册并验证邮箱
- [ ] 仓库是 **Public**
- [ ] 代码已推送，网页上能看到 `main.js`、`renderer/`、`src/` 等文件
- [ ] `https://jaden175.github.io/hmcs/` 能正常打开
- [ ] Releases 页面能看到 `v0.1.0` 并能下载到安装包
- [ ] 主页上的下载按钮指向你的 Releases 链接

全部打勾，HMCS 就正式上线了 🎉
