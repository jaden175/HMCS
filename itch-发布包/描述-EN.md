# HMCS — Hallo Minecraft Space

A clean, minimal Minecraft launcher with a **fully original UI** (no PCL code or assets), built on Electron.

![features](promo-features.png)

## What it does

- **Version manager** — every release, snapshot and beta, including the new **26.x year-versioned releases** (26.1 / 26.2 / 26.3 …). Downloads go through BMCLAPI mirrors *and* official Mojang sources, with **resumable transfers and SHA1 verification**.
- **Fabric & Forge** — one-click install. Fabric picks the latest loader automatically; Forge runs the full processor pipeline.
- **Three ways to log in** — offline accounts (UUID generated with the official algorithm), Microsoft accounts (device-code flow), and third-party `authlib-injector` servers (LittleSkin preset included).
- **Automatic Java management** — scans the JREs on your machine and downloads the exact one your version needs (Java 8 → 25, including Java 25 for 26.x).
- **Mods, resource packs and shaders** — browse and install from Modrinth, automatically matched to your game version and loader. You can also drop local `.jar` / `.zip` files in.
- **Multiplayer** — saved server list, quick-connect straight into a server, and a LAN address display for local play.
- **In-app updates** — the launcher checks for new versions and replaces itself.

## Downloads

| Platform | File | Notes |
|---|---|---|
| Windows | `HMCS-0.1.0-win.zip` | Portable build. Unzip, then run **`install.cmd`** to install it properly (Start Menu + Desktop shortcuts, uninstaller entry). |
| Linux | `HMCS-0.1.0-amd64.deb` | Debian / Ubuntu package. |
| Source | `HMCS-0.1.0-source.zip` | Full source code (MIT). |

## Install (Windows)

1. Unzip `HMCS-0.1.0-win.zip` anywhere.
2. Double-click **`install.cmd`** — it copies HMCS to `%LOCALAPPDATA%\Programs\HMCS`, creates shortcuts and registers an uninstaller entry.
3. Launch **HMCS.exe**.

> If you'd rather skip the installer, just run `HMCS.exe` from the unzipped folder — everything works, only the shortcuts are missing.

## Install (Linux)

```bash
sudo apt install ./HMCS-0.1.0-amd64.deb
```

## First run

- Pick a version on the **Download** page and install it (the launcher handles the rest).
- Add an account on the **Accounts** page — offline works instantly.
- Press the big green button. That's it.

> **Microsoft login** needs your own Azure Client ID: create a Public client app in the Azure Portal, enable the device-code flow, and paste the ID into Settings → Accounts.

## Requirements

- Windows 10+ / x64 Linux
- Java is **not** required — HMCS downloads the right JRE for you
- Internet access on first run

## Links

- Source code: https://github.com/jaden175/hmcs
- Homepage: https://jaden175.github.io/hmcs/

## License

MIT. Every line of the interface and the icon set is original work — the layout follows familiar habits, but no third-party launcher code or assets were used.
