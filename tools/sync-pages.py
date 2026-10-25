#!/usr/bin/env python3
# ==============================================================
#  HMCS 主页多副本同步器
#
#  背景：HMCS 的 index.html 存在 4 份副本，只改一处会导致
#        隧道地址 / 站点包 / 独立站点目录看到的仍是旧页面。
#        本脚本以 hmcs/index.html 为唯一母版，一次性同步全部副本。
#
#  用法:
#    python3 tools/sync-pages.py --all
#    python3 tools/sync-pages.py --all --base=https://页面地址
#    python3 tools/sync-pages.py --target dist/site --files-base=https://对象存储
#
#  母版:        index.html
#  同步目标:
#    dist/serve/index.html    隧道服务目录（zip 软链与页面同级）
#    dist/site/index.html     待上传站点包（zip 与页面同级）
#    ../hmcs-site/index.html  独立站点目录（favicon 用 assets/icon.png）
# ==============================================================
import argparse
import os
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# 需要同步的下载产物（存在 dist/ 下）
ARTIFACTS = [
    "HMCS-0.1.0-win.zip",
    "HMCS-0.1.0-amd64.deb",
    "HMCS-0.1.0-source.zip",
]

# GitHub Releases 上的可选产物（不随 dist/ 分发，链接保持指向 Releases）
RELEASE_ONLY = "HMCS-setup-0.1.0.exe"

# 页脚"在线主页"占位符，构建时被替换成实际页面地址
HOME_PLACEHOLDER = "https://jaden175.github.io/hmcs/"


def rewrite(html: str, files_prefix: str = "", base: str = "") -> str:
    """把母版里的下载链接改写成目标目录可用的形式。

    files_prefix: 产物所在位置前缀。
        ""            → 同目录文件名（zip 与页面同级）
        "https://x/"  → 绝对地址（对象存储 / 异地）
    base: 页面自身地址，用于替换页脚"在线主页"占位符。
    """

    def to_prefix(fn: str) -> str:
        return (files_prefix + fn) if files_prefix else fn

    # 1) Releases 资产 URL → 产物地址
    def fix_release(m):
        fn = m.group(1).split("/")[-1]
        return to_prefix(fn) + '"'

    html = re.sub(
        r'https://github\.com/[\w.-]+/[\w.-]+/releases/download/[^"]*/([^"/]+)"',
        fix_release,
        html,
    )

    # 2) 母版里的本地相对直链 href="dist/xxx"
    def fix_rel(m):
        return 'href="' + to_prefix(m.group(1).split("/")[-1]) + '"'

    html = re.sub(r'href="dist/([^"/]+)"', fix_rel, html)

    # 3) JS 映射表里的相对路径 'dist/xxx'
    html = re.sub(
        r"'dist/([^'/]+)'",
        lambda m: "'" + to_prefix(m.group(1).split("/")[-1]) + "'",
        html,
    )

    # 4) 页脚"在线主页" → 实际页面地址
    if base:
        html = html.replace(HOME_PLACEHOLDER, base.rstrip("/") + "/")

    return html


def extract_favicon(html: str) -> str:
    m = re.search(r'<link rel="icon" href="([^"]+)">', html)
    return m.group(1) if m else ""


def link_artifacts(target_dir: pathlib.Path, link_type: str = "symlink") -> list:
    """在目标目录挂上下载产物的软链（供本地直接点开下载）。"""
    linked = []
    for fn in ARTIFACTS:
        src = ROOT / "dist" / fn
        dst = target_dir / fn
        if not src.exists():
            continue
        if dst.exists() or dst.is_symlink():
            if dst.is_symlink() and os.readlink(dst) == str(src):
                linked.append(fn)
                continue
            dst.unlink()
        try:
            if link_type == "symlink":
                dst.symlink_to(src)
            else:
                os.link(src, dst)
            linked.append(fn)
        except OSError:
            pass
    return linked


def sync_to(target: pathlib.Path, master: str, files_prefix: str = "", base: str = "",
            favicon: str = None, link_files: bool = False) -> str:
    target.parent.mkdir(parents=True, exist_ok=True)
    html = rewrite(master, files_prefix=files_prefix, base=base)
    if favicon:
        html = html.replace(
            '<link rel="icon" href="%s">' % extract_favicon(master),
            '<link rel="icon" href="%s">' % favicon,
        )
    target.write_text(html, encoding="utf-8")
    if link_files:
        link_artifacts(target)
    return str(target.relative_to(ROOT.parent))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="同步全部 4 份副本")
    ap.add_argument("--target", help="只同步指定目标（dist/site / dist/serve / hmcs-site）")
    ap.add_argument("--base", default="", help="页面地址（用于替换页脚在线主页占位符）")
    ap.add_argument("--files-base", default="", help="产物地址前缀（空= 同目录文件名）")
    ap.add_argument("--no-link", action="store_true", help="不挂产物软链")
    ap.add_argument("--check", action="store_true", help="只检查副本是否与母版一致，不写入")
    args = ap.parse_args()

    master_path = ROOT / "index.html"
    if not master_path.exists():
        print("✗ 找不到母版 index.html", file=sys.stderr)
        return 1
    master = master_path.read_text(encoding="utf-8")

    files_prefix = args.files_base.rstrip("/") + "/" if args.files_base else ""
    # 产物地址与页面地址相同 → 用同目录文件名（上传包可整目录搬走）
    if args.base and args.files_base.rstrip("/") == args.base.rstrip("/"):
        files_prefix = ""
    link = not args.no_link

    # 目标定义：key -> (路径, 产物前缀, favicon, 是否挂软链)
    # 产物前缀：dist/site 可指向异地对象存储；dist/serve 与 hmcs-site
    #   目录内已挂产物软链，始终用同目录文件名。
    targets = {
        "dist/site": (
            ROOT / "dist/site/index.html",
            files_prefix,
            None,
            False,
        ),
        "dist/serve": (
            ROOT / "dist/serve/index.html",
            "",
            None,
            link,
        ),
        "hmcs-site": (
            ROOT.parent / "hmcs-site/index.html",
            "",
            "assets/icon.png",
            link,
        ),
    }

    keys = list(targets) if args.all else [args.target or "dist/site"]
    if not args.all and args.target not in targets:
        print("✗ 未知目标: %s（可选: %s）" % (args.target, ", ".join(targets)), file=sys.stderr)
        return 1

    if args.check:
        # 只比对内容，不写入
        # 归一化页脚"在线主页"：母版是占位符，副本可能是实时地址，两者视为等价
        def norm(h):
            return re.sub(r'href="https?://[^"]*/?"(?=\s+target="_blank"\s+rel="noopener">在线主页)',
                          'href="<HOME>"', h)

        stale = []
        for k in keys:
            path, prefix, favicon, do_link = targets[k]
            if not path.exists():
                stale.append((k, "缺失"))
                continue
            want = rewrite(master, files_prefix=prefix, base=args.base)
            if favicon:
                want = want.replace(
                    '<link rel="icon" href="%s">' % extract_favicon(master),
                    '<link rel="icon" href="%s">' % favicon,
                )
            got = path.read_text(encoding="utf-8")
            if norm(got) != norm(want):
                stale.append((k, "内容不一致"))
        if stale:
            for k, why in stale:
                print("  ✗ %s：%s" % (k, why))
            print("▸ 请运行: python3 tools/sync-pages.py --all")
            return 1
        print("  ✓ 全部副本与母版一致")
        return 0

    for k in keys:
        path, prefix, favicon, do_link = targets[k]
        out = sync_to(path, master, files_prefix=prefix, base=args.base,
                      favicon=favicon, link_files=do_link)
        print("  ✓ %s" % out)

    return 0


if __name__ == "__main__":
    sys.exit(main())
