#!/usr/bin/env bash
# ==============================================================
#  HMCS 站点一键服务
#   1) 启动本地静态服务（dist/serve 目录）
#   2) 建立公网隧道（localhost.run，免注册）
#   3) 隧道断开自动重连，并把"当前地址"写进文件、���步到主页与自更新清单
#
#  用法:
#    bash tools/serve-site.sh            # 前台运行（Ctrl+C 停止）
#    bash tools/serve-site.sh --daemon   # 后台运行
#
#  当前公网地址会写到:  dist/serve/当前地址.txt
#  日志:                   dist/serve/serve.log
# ==============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVE_DIR="$ROOT/dist/serve"
LOG="$SERVE_DIR/serve.log"
TUNNEL_LOG="$SERVE_DIR/tunnel.log"
URL_FILE="$SERVE_DIR/当前地址.txt"
PORT="${HMCS_PORT:-8901}"
TUNNEL_HOST="${HMCS_TUNNEL:-nokey@localhost.run}"
KEY_FILE="${HMCS_KEY:-$HOME/.ssh/hmcs_lhr}"

mkdir -p "$SERVE_DIR"
log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

# ---------- 1) 本地静态服务 ----------
if curl -s --noproxy '*' -o /dev/null --max-time 3 "http://127.0.0.1:$PORT/index.html"; then
  log "本地服务已在运行 :$PORT"
else
  log "启动本地静态服务 :$PORT （目录 $SERVE_DIR）"
  nohup python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$SERVE_DIR" >>"$LOG" 2>&1 &
  sleep 1
fi

# ---------- 2) 隧道循环（断线自动重连） ----------
publish_url() {
  local url="$1"
  echo "$url" > "$URL_FILE"
  log "公网地址: $url"
  # 母版 index.html → 全部副本统一同步（含隧道目录），下载链接指向同目录产物
  if python3 "$ROOT/tools/sync-pages.py" --all --base="$url" >/dev/null 2>&1; then
    bash "$ROOT/tools/build-site.sh" "$url" >/dev/null 2>&1 || true
    log "主页与 update.json 已同步到当前地址"
  fi
}

while true; do
  : > "$TUNNEL_LOG"
  log "连接隧道 $TUNNEL_HOST ..."
  KEY_OPT=()
  if [[ -f "$KEY_FILE" ]]; then
    KEY_OPT=(-i "$KEY_FILE" -o IdentitiesOnly=yes)
    log "使用专用密钥 $KEY_FILE（已在 admin.localhost.run 注册 → 域名存活更久；免费域名仍会轮换）"
  fi
  ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
      -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
      -o ExitOnForwardFailure=no -o LogLevel=ERROR \
      "${KEY_OPT[@]}" \
      -R 80:127.0.0.1:$PORT "$TUNNEL_HOST" >"$TUNNEL_LOG" 2>&1 &
  SSHPID=$!
  LAST=""
  while kill -0 "$SSHPID" 2>/dev/null; do
    U=$(grep -o 'https://[a-z0-9.-]*\.lhr\.life' "$TUNNEL_LOG" 2>/dev/null | head -1)
    if [[ -n "$U" && "$U" != "$LAST" ]]; then
      LAST="$U"
      publish_url "${U%/}"
    fi
    sleep 4
  done
  log "隧道断开，3 秒后重连…"
  sleep 3
done
