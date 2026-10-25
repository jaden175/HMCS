#!/usr/bin/env python3
"""HMCS 发布包验证工具：校验 win.zip / .deb 里的 app.asar 是否包含全部关键功能代码。

用法:
  python3 tools/verify-package.py dist/HMCS-0.1.0-win.zip
  python3 tools/verify-package.py dist/HMCS-0.1.0-amd64.deb

asar 格式要点（踩过的坑）:
  - 头部 pickle: u32[0]=4(固定), u32[4]=header pickle 总长, u32[12]=JSON 长度
  - JSON 起点固定在偏移 16，长度取 u32(12)
  - 文件内容字符串区起点 = 8 + u32(4)（不是 16+！）
  - 目录层级导航必须每层经过 'files' 键: root['files']['src']['files']['core'][...]
"""
import sys, os, json, struct, zipfile, tarfile, subprocess, tempfile

CHECKS = [
    ('内存钳制 clampMemoryMB',   'src/core/minecraft.js', lambda s: 'clampMemoryMB' in s),
    ('缺库自动补全',             'src/core/minecraft.js', lambda s: '库文件补全' in s or '缺失的库文件' in s),
    ('TUNA Java 镜像回退',       'src/core/java.js',      lambda s: 'tuna' in s.lower() or 'tsinghua' in s.lower()),
    ('自更新 applyUpdateAndRestart', 'main.js',           lambda s: 'applyUpdateAndRestart' in s),
    ('本地导入 importContentFiles',  'src/core/mods.js',  lambda s: 'importContentFiles' in s),
    ('appVersion 暴露',          'preload.js',            lambda s: 'app:version' in s),
    ('热门模组榜单',             'renderer/app.js',       lambda s: '热门' in s),
    # 下载层加固（修复 terminated 断流失败）
    ('流式下载 pipeline',        'src/core/net.js',       lambda s: 'pipeline' in s and '.part' in s),
    ('断点续传 Range',           'src/core/net.js',       lambda s: 'Range' in s and 'bytes=' in s),
    ('请求带 User-Agent',        'src/core/net.js',       lambda s: 'User-Agent' in s),
    ('双源自动回退',             'src/core/net.js',       lambda s: 'candidateUrls' in s),
]

def load_asar_from_zip(path):
    z = zipfile.ZipFile(path)
    name = [n for n in z.namelist() if n.endswith('resources/app.asar')][0]
    return z.read(name)

def load_asar_from_deb(path):
    # 注意：/tmp 可能是很小的 tmpfs（本环境 10MB），临时目录放在 deb 所在磁盘
    with tempfile.TemporaryDirectory(dir=os.path.dirname(os.path.abspath(path))) as td:
        subprocess.run(['ar', 'x', os.path.abspath(path), 'data.tar.xz'], check=True, cwd=td)
        t = tarfile.open(os.path.join(td, 'data.tar.xz'))
        m = [m for m in t.getmembers() if m.name.endswith('resources/app.asar')][0]
        return t.extractfile(m).read()

def parse_asar(data):
    u32 = lambda off: struct.unpack('<I', data[off:off+4])[0]
    root = json.loads(data[16:16 + u32(12)])
    base = 8 + u32(4)
    def read(p):
        cur = root
        for part in p.split('/'):
            cur = cur['files'][part]
        return data[base + int(cur['offset']): base + int(cur['offset']) + cur['size']].decode('utf-8', 'replace')
    return read

def main():
    path = sys.argv[1] if len(sys.argv) > 1 else 'dist/HMCS-0.1.0-win.zip'
    if path.endswith('.zip'):
        data = load_asar_from_zip(path)
    elif path.endswith('.deb'):
        data = load_asar_from_deb(path)
    else:
        sys.exit('只支持 .zip / .deb')
    read = parse_asar(data)
    ok = True
    for name, rel, test in CHECKS:
        try:
            passed = test(read(rel))
        except KeyError:
            passed = False
        print(f"  {name}: {'✓' if passed else '✗'}")
        ok &= passed
    print(f"\n{path}: {'功能完整 ✓' if ok else '有缺失 ✗'}")
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
