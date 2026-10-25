#!/usr/bin/env bash
# ==============================================================
#  生成 HMCS 静态站点包（放到任意静态托管 / 对象存储）
#
#  用法:
#    bash tools/build-site.sh https://页面地址
#    bash tools/build-site.sh https://页面地址 --files-base=https://对象存储地址
#    bash tools/build-site.sh https://页面地址 --with-packages
#
#  产物: dist/site/
#    index.html      项目主页（下载链接按需指向页面同址或对象存储）
#    update.json     应用内自更新清单（version / asarUrl / sha256）
#    app.asar        自更新包（--with-packages 时复制）
#    上传清单.txt     该把哪些文件传到哪里的对照表
# ==============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

BASE=""
FILES_BASE=""
WITH_PKG=0
for arg in "$@"; do
  case "$arg" in
    --with-packages) WITH_PKG=1 ;;
    --files-base=*)  FILES_BASE="${arg#--files-base=}" ;;
    "") ;;
    *) BASE="$arg" ;;
  esac
done
if [[ -z "$BASE" ]]; then
  echo "用法: bash tools/build-site.sh https://页面地址 [--files-base=https://对象存储地址] [--with-packages]"
  exit 1
fi
BASE="${BASE%/}"
FILES_BASE="${FILES_BASE:-$BASE}"
FILES_BASE="${FILES_BASE%/}"

OUT="dist/site"
mkdir -p "$OUT"

echo "▸ 生成站点目录: $OUT"
echo "  页面地址: $BASE"
echo "  文件地址: $FILES_BASE"

# ---------- 1. 主页：重定向下载链接 ----------
# 母版 index.html → 4 份副本（dist/site、dist/serve、hmcs-site）由 sync-pages.py 统一生成
python3 tools/sync-pages.py --all --base="$BASE" --files-base="$FILES_BASE" | sed 's/^/  /'

# ---------- 2. 自更新清单 ----------
ASAR="dist/win-unpacked/resources/app.asar"
if [[ -f "$ASAR" ]]; then
  SHA=$(sha256sum "$ASAR" | cut -d' ' -f1)
  VER=$(node -p "require('./package.json').version")
  cat > "$OUT/update.json" <<EOF
{
  "version": "$VER",
  "asarUrl": "$FILES_BASE/app.asar",
  "sha256": "$SHA",
  "notes": "HMCS $VER · 完整应用更新包"
}
EOF
  echo "  ✓ update.json（version=$VER, sha256=${SHA:0:16}…）"
  if [[ $WITH_PKG -eq 1 ]]; then
    cp "$ASAR" "$OUT/app.asar"
    echo "  ✓ app.asar（$(du -h "$ASAR" | cut -f1)）"
  fi
else
  echo "  ! 未找到 $ASAR，跳过 update.json（先跑一次 electron-builder）"
fi

# ---------- 3. 上传清单 ----------
cat > "$OUT/上传清单.txt" <<EOF
HMCS 站点上传清单
  页面地址: $BASE
  文件地址: $FILES_BASE

【页面托管】上传到静态托管（Cloudflare Pages / EdgeOne Pages / nginx 均可）
  index.html

【文件】上传到文件地址对应的位置（对象存储 / 同一服务器目录）
  HMCS-0.1.0-win.zip        Windows 便携版（218MB，解压后双击 install.cmd 安装）
  HMCS-0.1.0-amd64.deb      Linux 安装包（176MB）
  HMCS-setup-0.1.0.exe      Windows 安装包（需在 Windows 上 npm run dist:win 生成）
  HMCS-0.1.0-source.zip     源码包（0.16MB）
  app.asar                  自更新包（166MB，可选）

【在启动器里开启自更新】
  设置 → 软件更新 → 更新源填：$FILES_BASE/update.json
EOF
echo "  ✓ 上传清单.txt"

echo "▸ 完成：把 $OUT 里的文件传到你的静态托管根目录即可"
