#!/usr/bin/env python3
"""生成 itch.io 封面图（630×500）——用 HMCS 的等距方块图标 + 字标。

用法: python3 tools/gen_cover.py
产出: build/itch-cover.png  (630×500)
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON = os.path.join(ROOT, 'build', 'icon@2x.png')
OUT = os.path.join(ROOT, 'build', 'itch-cover.png')
W, H = 630, 500

# 草方块绿渐变背景
top = (63, 174, 82)
bottom = (32, 96, 46)
bg = Image.new('RGB', (W, H), top)
d = ImageDraw.Draw(bg)
for y in range(H):
    t = y / (H - 1)
    d.line([(0, y), (W, y)],
           fill=(int(top[0] + (bottom[0] - top[0]) * t),
                 int(top[1] + (bottom[1] - top[1]) * t),
                 int(top[2] + (bottom[2] - top[2]) * t)))

# 背景浮块（像素感）
blocks = [(40, 60, 16), (520, 40, 22), (95, 380, 12), (470, 400, 14),
          (250, 40, 10), (60, 230, 10), (560, 250, 12), (330, 440, 9)]
for (x, y, s) in blocks:
    d.rectangle([x, y, x + s, y + s], fill=(255, 255, 255, 30), outline=None)
    d.rectangle([x, y, x + s, y + s], outline=(255, 255, 255))

# 主图标
if os.path.exists(ICON):
    ic = Image.open(ICON).convert('RGBA')
    size = 210
    ic = ic.resize((size, size), Image.LANCZOS)
    bg.paste(ic, ((W - size) // 2, 78), ic)

# 字标
def font(size, bold=True):
    cands = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '',
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc' if bold else '',
        '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
        '/usr/share/fonts/truetype/arphic/uming.ttc',
    ]
    for c in cands:
        if c and os.path.exists(c):
            try:
                return ImageFont.truetype(c, size)
            except Exception:
                pass
    return ImageFont.load_default()

f_title = font(72)
f_tag = font(24, bold=False)
f_sub = font(19, bold=False)

def center(text, y, f, fill):
    try:
        l, t, r, b = d.textbbox((0, 0), text, font=f)
        d.text(((W - (r - l)) / 2 - l, y), text, font=f, fill=fill)
    except Exception:
        d.text((W / 2, y), text, font=f, fill=fill, anchor='mm')

center('HMCS', 300, f_title, (255, 255, 255))
center('Hallo Minecraft Space', 382, f_tag, (214, 240, 219))
center('Minimal Minecraft Launcher  ·  Fabric / Forge  ·  26.x  ·  One-click Mods', 418, f_sub, (186, 222, 195))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bg.save(OUT)
print('封面已生成:', OUT, bg.size)
