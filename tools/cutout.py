#!/usr/bin/env python3
"""白背景のイラストを背景透過PNGにしてゲームに入れる。

使い方:
  python3 tools/cutout.py <入力画像> <キャラID> [--thresh 28]

画像の外周から白っぽい色を塗りつぶし、つながっている部分だけを透明にする
（瞳のハイライトなど、キャラの内側の白は残る）。
--holes を付けると、キャラに囲まれた白い隙間（腕と体の間など）も一定以上の広さなら透明にする。
白い服のキャラでは服まで消えることがあるので、結果を見て使い分ける。
出力: assets/characters/<キャラID>.png（高さ1024pxに縮小）
"""
import argparse
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SENTINEL = (255, 0, 255)


def fill_holes(marked, min_area, thresh=8):
    """外周とつながっていない、ほぼ真っ白な領域のうち min_area 以上のものを背景扱いにする。
    肌など淡い色を消さないよう、外周より厳しい白さで判定する"""
    arr = np.array(marked)
    white = (arr.min(axis=2) > 246) & ~(arr == SENTINEL).all(axis=2)
    visited = np.zeros(white.shape, bool)
    work = marked.copy()
    k = 0
    for y in range(0, white.shape[0], 3):
        for x in range(0, white.shape[1], 3):
            if not white[y, x] or visited[y, x]:
                continue
            k += 1
            color = (1, (k >> 8) & 255, k & 255)
            ImageDraw.floodfill(work, (x, y), color, thresh=thresh)
            region = (np.array(work) == color).all(axis=2)
            visited |= region
            visited[y, x] = True
            if region.sum() >= min_area:
                arr[region] = SENTINEL
    return Image.fromarray(arr)


def cutout(src, thresh, holes=0):
    img = Image.open(src).convert('RGB')
    if img.height > 1024:
        img = img.resize((round(img.width * 1024 / img.height), 1024), Image.LANCZOS)
    w, h = img.size
    marked = img.copy()
    px = marked.load()
    # 外周の白っぽいピクセルを起点に塗りつぶす
    edge = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + \
           [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    for x, y in edge:
        if px[x, y] != SENTINEL and min(px[x, y]) > 255 - thresh:
            ImageDraw.floodfill(marked, (x, y), SENTINEL, thresh=thresh)
    if holes:
        marked = fill_holes(marked, holes)
    # 背景マスク → 輪郭を少しぼかしてアンチエイリアス
    bg = (np.array(marked) == SENTINEL).all(axis=2)
    mask = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8))
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out = img.convert('RGBA')
    out.putalpha(mask)
    return out.crop(out.getbbox())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('id')
    ap.add_argument('--thresh', type=int, default=28)
    ap.add_argument('--holes', type=int, nargs='?', const=600, default=0,
                    help='囲まれた白い隙間を透明にする最小面積（px、省略時600）')
    a = ap.parse_args()
    dst = os.path.join(ROOT, 'assets', 'characters', f'{a.id}.png')
    out = cutout(a.src, a.thresh, a.holes)
    out.save(dst, optimize=True)
    print('saved', os.path.relpath(dst, ROOT), out.size)


if __name__ == '__main__':
    main()
