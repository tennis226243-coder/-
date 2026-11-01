// 床材などのテクスチャをキャンバスで生成する（画像ファイル不要）
// UV は「メートル」単位で使う前提。1 枚のテクスチャが TILE_M × TILE_M メートルを表す。
import * as THREE from 'three';

export const TILE_M = 2.4;

export const FLOOR_FINISHES = {
  plan: { name: '間取り図' },
  'wood-light': { name: 'フローリング（明るい）', base: [196, 160, 118], spread: 22 },
  'wood-dark': { name: 'フローリング（濃い）', base: [118, 82, 56], spread: 16 },
  'wood-gray': { name: 'フローリング（グレージュ）', base: [170, 158, 142], spread: 14 },
  tile: { name: 'タイル', base: [226, 224, 218] },
  // 部屋ごとの床材としてだけ使うもの（tile はテクスチャ 1 枚が何 m 角か）
  tatami: { name: '畳', base: [200, 196, 136], tile: 3.64, roomOnly: true },
  'tile-bath': { name: '浴室タイル', base: [214, 224, 230], tile: 1.2, roomOnly: true },
};

const cache = new Map();

// 再現性のある疑似乱数（毎回同じ木目にする）
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function woodCanvas({ base, spread }) {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const rand = rng(7);
  const plankW = size / 16; // 幅 15cm
  const rows = 16;
  for (let i = 0; i < rows; i++) {
    // 板ごとに継ぎ目の位置をずらす
    let y = -rand() * size;
    while (y < size) {
      const len = size * (0.45 + rand() * 0.4); // 約 1.1〜2m
      const k = (rand() - 0.5) * spread;
      const [r, gg, b] = base.map((v) => Math.max(0, Math.min(255, v + k)));
      g.fillStyle = `rgb(${r},${gg},${b})`;
      g.fillRect(i * plankW, y, plankW, len);
      // 木目
      for (let j = 0; j < 9; j++) {
        const x = i * plankW + rand() * plankW;
        g.strokeStyle = `rgba(${r * 0.7},${gg * 0.65},${b * 0.6},${0.08 + rand() * 0.12})`;
        g.lineWidth = 0.6 + rand() * 1.6;
        g.beginPath();
        g.moveTo(x, y);
        g.bezierCurveTo(x + (rand() - 0.5) * 6, y + len / 3, x + (rand() - 0.5) * 6, y + (len * 2) / 3, x, y + len);
        g.stroke();
      }
      // 継ぎ目
      g.fillStyle = 'rgba(40,25,15,0.35)';
      g.fillRect(i * plankW, y, plankW, 1.5);
      y += len;
    }
    g.fillStyle = 'rgba(40,25,15,0.3)';
    g.fillRect(i * plankW, 0, 1.5, size);
  }
  return c;
}

/** 畳（半畳 = 91cm を 1 単位として 4×4 単位 = 3.64m 角。2 枚ずつ縦横を交互に敷く） */
function tatamiCanvas({ base }) {
  const size = 1024;
  const u = size / 4;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const rand = rng(11);
  const mat = (x, y, w, h) => {
    const vertical = h > w;
    const k = (rand() - 0.5) * 14;
    g.fillStyle = `rgb(${base.map((v) => v + k).join(',')})`;
    g.fillRect(x, y, w, h);
    // い草の目（長手方向に細い線）
    g.strokeStyle = 'rgba(120,115,60,0.18)';
    g.lineWidth = 1;
    const step = 5;
    for (let t = step; t < (vertical ? w : h); t += step) {
      g.beginPath();
      if (vertical) { g.moveTo(x + t, y); g.lineTo(x + t, y + h); } else { g.moveTo(x, y + t); g.lineTo(x + w, y + t); }
      g.stroke();
    }
    // 長辺の縁（へり）
    const e = 9;
    g.fillStyle = '#3f3a2e';
    if (vertical) { g.fillRect(x, y, e, h); g.fillRect(x + w - e, y, e, h); } else { g.fillRect(x, y, w, e); g.fillRect(x, y + h - e, w, e); }
    g.strokeStyle = 'rgba(60,50,30,0.5)';
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, w - 2, h - 2);
  };
  // 左上・右下は縦 2 枚、右上・左下は横 2 枚
  for (const [qx, qy, vertical] of [[0, 0, true], [2, 0, false], [0, 2, false], [2, 2, true]]) {
    if (vertical) { mat(qx * u, qy * u, u, 2 * u); mat((qx + 1) * u, qy * u, u, 2 * u); }
    else { mat(qx * u, qy * u, 2 * u, u); mat(qx * u, (qy + 1) * u, 2 * u, u); }
  }
  return c;
}

function tileCanvas({ base }, n = 4) {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const rand = rng(3);
  const t = size / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const k = (rand() - 0.5) * 10;
      g.fillStyle = `rgb(${base.map((v) => v + k).join(',')})`;
      g.fillRect(i * t, j * t, t, t);
    }
  }
  g.strokeStyle = 'rgba(120,115,105,0.6)';
  g.lineWidth = 3;
  for (let i = 0; i <= n; i++) {
    g.beginPath(); g.moveTo(i * t, 0); g.lineTo(i * t, size); g.stroke();
    g.beginPath(); g.moveTo(0, i * t); g.lineTo(size, i * t); g.stroke();
  }
  return c;
}

/** 床材のテクスチャ（UV がメートル単位のジオメトリ用） */
export function floorTexture(finish, renderer) {
  if (cache.has(finish)) return cache.get(finish);
  const def = FLOOR_FINISHES[finish];
  if (!def?.base) return null;
  const canvas = finish === 'tatami' ? tatamiCanvas(def)
    : finish === 'tile' ? tileCanvas(def, 4) // 60cm 角
      : finish === 'tile-bath' ? tileCanvas(def, 6) // 20cm 角
        : woodCanvas(def);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const tile = def.tile ?? TILE_M;
  tex.repeat.set(1 / tile, 1 / tile);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 1;
  cache.set(finish, tex);
  return tex;
}
