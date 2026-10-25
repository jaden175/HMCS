# 在 Windows 上打包 HMCS-setup 安装程序（.exe）

> 沙箱开发机（Linux）的 deepin 内核存在缺陷：makensis 以 mmap 写入高熵数据（真实应用 7z 包）时必然 SIGBUS，
> 因此 `HMCS-setup-0.1.0.exe` 无法在本机产出。在任意 Windows 电脑上按以下步骤可原生构建，无需任何补丁。

## 步骤

1. 安装 [Node.js 18+](https://nodejs.org)（LTS 即可）。
2. 把整个 `hmcs/` 目录拷贝到 Windows 机器（不需要 `node_modules`）。
3. 在 `hmcs/` 目录打开命令行执行：

```bat
npm install
npm run dist:win
```

4. 完成后 `dist\HMCS-setup-0.1.0.exe` 即为完整安装包（内含卸载器、开始菜单/桌面快捷方式、可选安装目录）。

## 说明

- Windows 上 electron-builder 会自动下载所需的 NSIS 工具链，`tools/patch-electron-builder.js` 里的补丁只服务于 Linux 构建，Windows 原生路径不需要也不受影响。
- `npm run dist` 会同时产出 exe 安装包和便携 zip；只要 exe 时用 `npm run dist:win`。
- 首次构建需联网下载 NSIS 与 Electron 发行包，请耐心等待。
