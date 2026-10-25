<div align="center">

# HMCS · Hallo Minecraft Space

**极简风格的 Minecraft 启动器 —— UI 与代码 100% 原创，未使用 PCL 任何源码或素材。**

[![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Node](https://img.shields.io/badge/Node-18%2B-5FA04E?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-3fae52.svg)](LICENSE)
[![Version](https://img.shields.io/badge/release-v0.1.0-3fae52.svg)](https://github.com/jaden175/hmcs)

[项目主页](https://github.com/jaden175/hmcs) · [Releases 下载](https://github.com/jaden175/hmcs) · [发布到 GitHub 教程](GITHUB-GUIDE.md) · [在线主页](https://jaden175.github.io/hmcs/)

</div>

---

## 截图 / 界面

- 主页：动态浮动方块背景 + 大圆形启动按钮（带下载进度环）+ 版本/账号胶囊
- 5 套主题色（草方块绿 / 钻石蓝 / 紫水晶 / 岩浆橙 / 红石红），标题栏小圆点一键切换
- 分段式版本类型选择、圆角卡片列表、页面切换动画
- 模组页：热门推荐榜 + 10 个分类筛选 + 图标显示 + 本地 jar 导入

> 网页版项目主页见仓库根目录 [`index.html`](index.html)（可开启 GitHub Pages 直接托管）。

## 界面

- 主页：动态浮动方块背景 + 大圆形启动按钮（带下载进度环）+ 版本/账号胶囊
- 5 套主题色（草方块绿/钻石蓝/紫水晶/岩浆橙/红石红），标题栏小圆点一键切换
- 分段式版本类型选择、圆角卡片列表、页面切换动画
- 模组页：按版本管理 mods 文件夹（列表/删除/打开目录）

## 功能

- **版本管理**：从 BMCLAPI（国内镜像）/ Mojang 官方源下载任意版本（正式/快照/Beta/Alpha），并发下载 + SHA1 校验
- **加载器**：一键安装 Fabric（最新 loader）、Forge（processors 管线安装）
- **账号**：
  - 离线登录（UUID 与官方算法一致）
  - 微软正版（device code 流程，需自备 Azure Client ID）
  - authlib-injector 外置登录（内置 LittleSkin 预设，可自定义服务器）
- **Java 自动管理**：扫描本机 Java；缺失时按版本要求（≤1.16→8 / 1.17→16 / 1.18~1.20.4→17 / 1.20.5~1.21.x→21 / 26.x→25）自动从 Adoptium 下载 JRE；优先读取版本清单中 Mojang 声明的 javaVersion
- **版本号方案**：已适配 2026 年起的年份版本号（26.1、26.2、26.3…，1.21.11 为 1.x 最终版本）
- **模组/资源在线安装**：Modrinth 搜索 + 一键下载（模组 / 资源包 / 光影，自动匹配游戏版本与加载器）
- **本地资源管理**：资源包 / 光影 / 世界 的列表、删除、打开目录
- **联机**：快速进服（启动后直接连接服务器，1.20+）、保存服务器列表、局域网联机指引与本机 IP 显示
- **启动自检**：版本未装全 / Java 缺失 / 配置损坏时给出明确原因，失败自动跳转日志页
- **打包**：Windows NSIS `HMCS-setup-x.x.x.exe` + Linux `HMCS-x.x.x-x64.deb`（图标为原创等距方块）

## 开发

```bash
npm install
npm start
```

## 打包

```bash
npm run dist       # 按 OS 产出安装包到 dist/
npm run dist:win   # Windows NSIS 安装包（需在 Windows 上执行）
npm run dist:deb   # Linux deb
npm test           # 冒烟测试（34 项断言）
```

> Windows 安装包（`HMCS-setup-x.x.x.exe`）请在 Windows 机器上执行 `npm run dist:win` 原生构建，详见 [BUILD-EXE.md](BUILD-EXE.md)。
> 产物不在仓库里（`dist/` 已 gitignore），通过 [Releases](https://github.com/jaden175/hmcs) 分发。

## 目录

```
main.js            Electron 主进程 + 全部 IPC
preload.js         contextBridge 上下文桥
renderer/          界面（index.html / style.css / app.js）
src/core/
  config.js        配置与数据目录
  net.js           下载层：UA + 双源回退 + 流式落盘 + 断点续传
  minecraft.js     版本清单、下载安装、启动命令组装、启动自检
  modloader.js     Fabric / Forge / authlib-injector
  account.js       三种登录（离线 / 微软 / 外置服）
  java.js          Java 扫描与自动下载（Adoptium / 清华 TUNA）
  updater.js       应用内自更新（清单 / 下载 / 校验 / 替换重启）
  mods.js          模组 / 资源包 / 光影 / 世界 管理与在线安装
tests/smoke.js     冒烟测试（34 项断言：node tests/smoke.js）
tools/             图标生成、构建补丁、发布包校验
build/             应用图标（原创等距方块）
index.html         GitHub Pages 项目主页
GITHUB-GUIDE.md   发布到 GitHub 的完整教程
```

## 说明

- 数据目录：`userData/hmcs`（Linux 下 `~/.config/hmcs`），游戏文件在其下 `minecraft/`
- 微软正版登录需要在 [Azure Portal](https://portal.azure.com) 注册应用（Public client，启用 device code flow），把 Client ID 填入「设置」页
- Forge 安装会先自动安装对应原版，再执行 installer 的 processors，首次安装耗时较长
- 日志页右键账号可删除；启动日志在「日志」页查看

## 发布到 GitHub

> 🆕 **第一次用 GitHub？先看 [GITHUB-新手教程.md](GITHUB-新手教程.md)** —— 从注册账号开始，一步一步带你把项目放上去并让主页上线。
> 已经熟悉流程的话看 [GITHUB-GUIDE.md](GITHUB-GUIDE.md)（进阶版：建仓 → 推送 → Pages → Release 附产物 → 版本号同步）。

```bash
git init -b main && git add . && git commit -m "feat: HMCS 0.1.0"
gh repo create hmcs --public --source=. --remote=origin --push
```

## 许可证

MIT —— 代码与图标均为本项目原创实现。
