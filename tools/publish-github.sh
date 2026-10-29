#!/usr/bin/env bash
# ==============================================================
#  HMCS → GitHub 一键脚本
#
#  用法:
#    bash tools/publish-github.sh 你的用户名        # 填链接 + 初始化 + 提交
#    bash tools/publish-github.sh 你的用户名 --push # 再用 gh 建仓并推送
#    bash tools/publish-github.sh 你的用户名 --links-only  # 只替换主页里的占位链接
#
#  不填用户名也可以：脚本会提示你输入。
# ==============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

REPO_NAME="${REPO_NAME:-hmcs}"
DESCRIPTION="${DESCRIPTION:-Hallo Minecraft Space — 极简 Minecraft 启动器}"
MODE="init"

for arg in "$@"; do
  case "$arg" in
    --push) MODE="push" ;;
    --links-only) MODE="links" ;;
    *) USER="$arg" ;;
  esac
done

# ---------- 1. 用户名 ----------
if [[ -z "${USER:-}" ]]; then
  read -r -p "请输入你的 GitHub 用户名（就是你主页地址里 / 后面的那串）: " USER
fi
USER="${USER// /}"
if [[ -z "$USER" ]]; then echo "✘ 需要 GitHub 用户名"; exit 1; fi
REPO_URL="https://github.com/$USER/$REPO_NAME"
echo "▸ 仓库地址: $REPO_URL"

# ---------- 2. 替换主页与 README 里的占位链接 ----------
echo "▸ 替换占位链接 https://github.com → $REPO_URL"
python3 - "$USER" "$REPO_NAME" <<'PY'
import re, sys, pathlib
user, repo = sys.argv[1], sys.argv[2]
base = f"https://github.com/{user}/{repo}"
rel  = f"https://github.com/{user}/{repo}/releases"

def patch(path, is_html):
    p = pathlib.Path(path)
    if not p.exists():
        return 0
    s = p.read_text(encoding='utf-8')
    orig = s
    if is_html:
        # Releases 链接（target="_blob"）→ releases 页；其余 → 仓库首页
        s = s.replace('https://github.com" target="_blob"', f'{rel}" target="_blob"')
        s = s.replace('https://github.com"', f'{base}"')
    else:
        s = s.replace('https://github.com)', f'{base})')
        s = s.replace('(https://github.com)', f'({base})')
        s = s.replace('https://github.com" ', f'{base}" ')
    if s != orig:
        p.write_text(s, encoding='utf-8')
        return 1
    return 0

n = patch('index.html', True) + patch('README.md', False)
print('  ✓ 已更新' if n else '  · 无需修改（可能已替换过）')
PY

if [[ "$MODE" == "links" ]]; then
  echo "▸ 仅替换链接，完成。记得 git add . && git commit -m \"更新仓库链接\" && git push"
  exit 0
fi

# ---------- 3. git 身份 ----------
command -v git >/dev/null || { echo "✘ 未找到 git，请先执行: sudo apt install git"; exit 1; }
if ! git config --global user.email >/dev/null 2>&1; then
  if [[ -n "${GIT_NAME:-}" && -n "${GIT_EMAIL:-}" ]]; then
    git config --global user.name "$GIT_NAME"
    git config --global user.email "$GIT_EMAIL"
    echo "  ✓ 已设置身份: $GIT_NAME <$GIT_EMAIL>"
  else
    echo "▸ 首次使用 git，需要设置身份（只需一次）"
    read -r -p "  你的名字（提交记录显示用）: " GNAME
    read -r -p "  你的 GitHub 邮箱（可用 ${USER}@users.noreply.github.com）: " GMAIL
    git config --global user.name "$GNAME"
    git config --global user.email "$GMAIL"
    echo "  ✓ 已设置"
  fi
fi

# ---------- 4. 本地仓库 ----------
if [[ ! -d .git ]]; then
  git init -b main
  echo "  ✓ 已 git init（主分支 main）"
else
  echo "  · 已存在 .git"
fi

for pat in node_modules dist "*.log"; do
  grep -q -- "$pat" .gitignore || { echo "✘ .gitignore 缺少 $pat"; exit 1; }
done
echo "  ✓ .gitignore 覆盖 node_modules / dist / 日志"

git add -A
BAD=$(git diff --cached --name-only | grep -E '^(node_modules|dist)/' || true)
if [[ -n "$BAD" ]]; then
  echo "✘ 检测到不该提交的文件："; echo "$BAD" | head -5; exit 1
fi
COUNT=$(git diff --cached --name-only | wc -l)
echo "  待提交 $COUNT 个文件"

if git diff --cached --quiet; then
  echo "  · 没有新改动"
else
  git commit -m "feat: HMCS 0.1.0 初始版本"
  echo "  ✓ 已提交"
fi

# ---------- 5. 推送 ----------
if [[ "$MODE" == "push" ]]; then
  if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
    if gh repo view "$USER/$REPO_NAME" >/dev/null 2>&1; then
      git remote get-url origin >/dev/null 2>&1 || git remote add origin "$REPO_URL.git"
      git push -u origin main
    else
      gh repo create "$REPO_NAME" --public --description "$DESCRIPTION" --source=. --remote=origin --push
    fi
    echo "  ✓ 已推送"
  else
    echo "  · 未检测到 gh CLI，走 HTTPS 推送"
    git remote get-url origin >/dev/null 2>&1 || git remote add origin "$REPO_URL.git"
    git push -u origin main
  fi
else
  cat <<EOF

▸ 下一步（把下面两行粘到终端）：
    git remote add origin $REPO_URL.git
    git push -u origin main

  推送时 Username 填 $USER，Password 填 **Personal Access Token**（不是登录密码）
  Token 获取：Settings → Developer settings → Personal access tokens → Tokens (classic)
              → Generate new token → 勾选 repo → 生成 → 复制（只显示一次）

▸ 之后：
  1) 仓库 Settings → Pages → Deploy from a branch → main / (root)   ← 主页上线
  2) 打 tag 发版本：git tag -a v0.1.0 -m "v0.1.0" && git push origin v0.1.0
     然后在 Releases 页面把 dist/ 里的安装包拖上去
  3) 图文步骤见 GITHUB-新手教程.md
EOF
fi
