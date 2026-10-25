#!/usr/bin/env python3
"""生成 HMCS 启动器图标：等距像素立方体 + 透明背景"""
from PIL import Image, ImageDraw

S = 1024  # 画布

def draw_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # 等距立方体（MC 草方块风格），比例占画布 72%
    u = size * 0.36        # 半宽
    h = size * 0.21        # 面高度
    cx, cy = size / 2, size * 0.46
    top = [(cx, cy - h), (cx + u, cy), (cx, cy + h), (cx - u, cy)]
    left = [(cx - u, cy), (cx, cy + h), (cx, cy + h + size * 0.30), (cx - u, cy + size * 0.30)]
    right = [(cx, cy + h), (cx + u, cy), (cx + u, cy + size * 0.30), (cx, cy + h + size * 0.30)]
    d.polygon(top, fill=(126, 217, 138, 255))   # 顶面亮绿
    d.polygon(left, fill=(63, 174, 82, 255))    # 左面主绿
    d.polygon(right, fill=(40, 120, 52, 255))   # 右面深绿
    # 描边增加立体感
    for face in (top, left, right):
        d.line(face + [face[0]], fill=(30, 80, 40, 255), width=max(2, size // 128))
    return img

img = draw_icon(S)

# PNG（Linux/Windows 通用源图）
img.resize((512, 512), Image.LANCZOS).save('build/icon.png')
img.resize((256, 256), Image.LANCZOS).save('build/icon@2x.png')

# ICO（Windows，多尺寸）
img.save('build/icon.ico', sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
print('icons generated: build/icon.png, build/icon@2x.png, build/icon.ico')
