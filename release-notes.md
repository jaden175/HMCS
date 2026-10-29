## HMCS 0.1.3

### 新增：整合包拖拽导入
- 直接把文件拖进窗口即可导入，支持 `.mrpack`（Modrinth 整合包）、根目录带 `mods/` 的散包 zip、`.jar` 模组、资源包/光影 zip
- `.mrpack` 会自动装成**独立版本实例**：解析 `modrinth.index.json` → 安装对应原版 → 安装 Fabric/Forge → 并发下载整合包内文件 → 铺设 overrides 配置
- CurseForge 整合包会明确提示（需官方 API 授权），可解压后拖 mods 目录
- 使用 Electron 33 的 `webUtils.getPathForFile` 取真实路径，Windows / macOS / Linux 一致可用

### 修复：模组列表太少
- 原来每次只取 30 条且无翻页（1.20.1 + Fabric 实际有 17826 个兼容模组）
- 现在每页 40 条，支持「加载更多」持续翻页
- 新增排序：下载量 / 相关度 / 关注数 / 最新发布 / 最近更新
- 顶部显示「共 N 个结果，已显示 M 个」

### 优化
- app.asar 从 174MB 降到 224KB（打包配置修正），安装包体积同步缩小：deb 168MB → 72MB，win.zip 212MB → 107MB，mac zip 99MB → 95MB

### 安装
- **Windows**：解压 `HMCS-0.1.3-win.zip`，运行 `HMCS.exe`（或 `install.cmd` 建快捷方式）
- **Linux**：`sudo dpkg -i HMCS-0.1.3-amd64.deb`
- **macOS**：解压得到 `HMCS.app`，拖进「应用程序」；未签名，首次打开执行 `xattr -cr HMCS.app`
