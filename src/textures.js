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

function tileCanvas({ base }) {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const rand = rng(3);
  const n = 4; // 60cm 角
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
  const tex = new THREE.CanvasTexture(finish === 'tile' ? tileCanvas(def) : woodCanvas(def));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / TILE_M, 1 / TILE_M);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 1;
  cache.set(finish, tex);
  return tex;
}
