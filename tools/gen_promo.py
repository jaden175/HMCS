#!/usr/bin/env python3
"""生成 itch.io 用的宣传图（无浏览器环境下，用 PIL 绘制矢量风格图）

产出:
  build/itch-cover.png     630×500  封面
  build/promo-features.png 1280×720 功能九宫格
  build/promo-download.png 1280×720 下载卡片
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, 'build')
os.makedirs(BUILD, exist_ok=True)

GREEN = (63, 174, 82)
GREEN_D = (47, 138, 62)
INK = (28, 33, 32)
INK2 = (75, 86, 84)
PAPER = (247, 248, 246)
WHITE = (255, 255, 255)
FONT_DIRS = [
    '/usr/share/fonts/truetype/dejavu',
    '/usr/share/fonts/opentype/noto',
    '/usr/share/fonts/truetype/wqy',
]

def font(size, bold=True):
    names = ['DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf',
             'NotoSansCJK-Bold.ttc' if bold else 'NotoSansCJK-Regular.ttc',
             'wqy-zenhei.ttc']
    for n in names:
        for d in FONT_DIRS:
            p = os.path.join(d, n)
            if os.path.exists(p):
                try:
                    return ImageFont.truetype(p, size)
                except Exception:
                    pass
    return ImageFont.load_default()

def vgrad(size, top, bottom):
    w, h = size
    img = Image.new('RGB', size, top)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        d.line([(0, y), (w, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return img

def ctext(d, xy, text, f, fill, anchor='mm'):
    d.text(xy, text, font=f, fill=fill, anchor=anchor)

def rounded(d, box, r, fill=None, outline=None, width=2):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)

# ---------------------------------------------------------------- 封面 630×500
def cover():
    W, H = 630, 500
    img = vgrad((W, H), GREEN, (32, 96, 46))
    d = ImageDraw.Draw(img)
    for (x, y, s) in [(40, 60, 16), (520, 40, 22), (95, 380, 12), (470, 400, 14),
                      (250, 40, 10), (60, 230, 10), (560, 250, 12), (330, 440, 9)]:
        d.rectangle([x, y, x + s, y + s], outline=(255, 255, 255))
    icon = os.path.join(BUILD, 'icon@2x.png')
    if os.path.exists(icon):
        ic = Image.open(icon).convert('RGBA').resize((210, 210), Image.LANCZOS)
        img.paste(ic, ((W - 210) // 2, 74), ic)
    ctext(d, (W // 2, 340), 'HMCS', font(76), WHITE)
    ctext(d, (W // 2, 396), 'Hallo Minecraft Space', font(24, False), (214, 240, 219))
    ctext(d, (W // 2, 432), 'Minimal Minecraft Launcher  ·  Fabric / Forge  ·  26.x  ·  One-click Mods',
          font(17, False), (186, 222, 195))
    p = os.path.join(BUILD, 'itch-cover.png')
    img.save(p)
    print('✓', p, img.size)

# ------------------------------------------------------- 功能九宫格 1280×720
def features():
    W, H = 1280, 720
    img = Image.new('RGB', (W, H), PAPER)
    d = ImageDraw.Draw(img)
    # 顶部条
    d.rectangle([0, 0, W, 96], fill=WHITE)
    d.line([(0, 96), (W, 96)], fill=(227, 230, 225), width=2)
    icon = os.path.join(BUILD, 'icon@2x.png')
    if os.path.exists(icon):
        ic = Image.open(icon).convert('RGBA').resize((44, 44), Image.LANCZOS)
        img.paste(ic, (40, 26), ic)
    d.text((100, 34), 'HMCS', font=font(32), fill=INK)
    d.text((232, 44), 'Hallo Minecraft Space', font=font(19, False), fill=INK2)
    d.text((W - 40, 48), 'v0.1.0', font=font(18, False), fill=INK2, anchor='rm')

    cards = [
        ('Version manager', 'All releases incl. 26.x', '▣',
         'Mirrors + official sources, resumable downloads with SHA1 verification'),
        ('Fabric / Forge', 'One-click install', '⚙',
         'Latest loader auto-matched, full Forge processors pipeline'),
        ('3 login modes', 'Offline / MS / authlib', '✦',
         'Offline UUID matches the official algorithm, MS device-code flow'),
        ('Auto Java', 'JRE 8 → 25, auto match', '☕',
         'Scans local JREs, downloads the exact major version if missing'),
        ('Mods & packs', 'Modrinth one-click install', '▦',
         'Mods, resource packs and shaders matched to your version & loader'),
        ('Multiplayer', 'Quick join a server', '◈',
         'Saved servers, one-click connect, LAN address for local play'),
    ]
    cw, ch, gap = 370, 168, 26
    x0, y0 = 56, 140
    for i, (t, s, ico, detail) in enumerate(cards):
        x = x0 + (i % 3) * (cw + gap)
        y = y0 + (i // 3) * (ch + gap)
        rounded(d, [x, y, x + cw, y + ch], 16, fill=WHITE, outline=(227, 230, 225))
        d.ellipse([x + 26, y + 26, x + 74, y + 74], fill=(232, 246, 236))
        ctext(d, (x + 50, y + 50), ico, font(26), GREEN_D)
        d.text((x + 92, y + 36), t, font=font(23), fill=INK)
        d.text((x + 92, y + 74), s, font=font(18, False), fill=INK2)
        d.text((x + 92, y + 104), detail, font=font(15, False), fill=(140, 150, 148))
    d.text((56, H - 44), 'Original UI and code  ·  No PCL assets  ·  Windows & Linux',
           font=font(19, False), fill=INK2)
    p = os.path.join(BUILD, 'promo-features.png')
    img.save(p)
    print('✓', p, img.size)

# ---------------------------------------------------------- 下载卡片 1280×720
def download():
    W, H = 1280, 720
    img = vgrad((W, H), (34, 42, 40), (22, 27, 26))
    d = ImageDraw.Draw(img)
    icon = os.path.join(BUILD, 'icon@2x.png')
    if os.path.exists(icon):
        ic = Image.open(icon).convert('RGBA').resize((96, 96), Image.LANCZOS)
        img.paste(ic, (72, 72), ic)
    d.text((196, 76), 'HMCS', font=font(52), fill=WHITE)
    d.text((196, 140), 'Hallo Minecraft Space', font=font(22, False), fill=(180, 200, 186))
    d.text((72, 236), 'Download', font=font(40), fill=WHITE)
    d.text((72, 292), 'Windows portable build  ·  Linux .deb package', font=font(21, False), fill=(170, 190, 176))

    btns = [('Windows  ·  HMCS-0.1.0-win.zip', GREEN),
            ('Linux  ·  HMCS-0.1.0-amd64.deb', GREEN_D)]
    for i, (t, c) in enumerate(btns):
        y = 356 + i * 78
        rounded(d, [72, y, 660, y + 58], 12, fill=c)
        ctext(d, (366, y + 30), t, font(22), WHITE)
    rounded(d, [72, 512, 660, 570], 12, fill=None, outline=(70, 82, 79), width=2)
    ctext(d, (366, 541), 'Source code  ·  HMCS-0.1.0-source.zip', font(21), (214, 226, 218))
    d.text((72, 640), 'MIT License  ·  Original implementation  ·  github.com/jaden175/hmcs',
           font=font(18, False), fill=(130, 150, 138))
    p = os.path.join(BUILD, 'promo-download.png')
    img.save(p)
    print('✓', p, img.size)

cover()
features()
download()
print('全部宣传图已生成 →', BUILD)
