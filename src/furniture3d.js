// 家具の簡易 3D モデル（箱・円柱の組み合わせ）
// ローカル座標：幅 = x、奥行 = z（背面が -z）、高さ = y（床が 0）
import * as THREE from 'three';

// 3D ビューは再構築のたびにマテリアルを破棄するので、キャッシュは家具 1 点の中だけで使う
const mats = new Map();
function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...opts }));
  return mats.get(key);
}

/** 箱を追加（x, y, z は箱の中心、y は床からの高さ） */
function box(group, w, h, d, x, y, z, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  group.add(m);
  return m;
}

function legs(group, w, d, h, t, material) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(group, t, h, t, sx * (w / 2 - t), h / 2, sz * (d / 2 - t), material);
  }
}

const BUILDERS = {
  sofa(g, { w, d, h }, c) {
    const seatH = h * 0.5;
    const arm = Math.min(0.18, w * 0.12);
    box(g, w, seatH, d, 0, seatH / 2, 0, c);
    box(g, w, h - seatH, d * 0.25, 0, seatH + (h - seatH) / 2, -d / 2 + d * 0.125, c);
    for (const s of [-1, 1]) box(g, arm, h * 0.75, d, s * (w / 2 - arm / 2), h * 0.375, 0, c);
    const cushion = mat('#ffffff', { roughness: 0.9, transparent: true, opacity: 0.25 });
    box(g, w - arm * 2 - 0.02, 0.04, d * 0.7, 0, seatH + 0.02, d * 0.12, cushion);
  },
  table(g, { w, d, h }, c) {
    const top = Math.min(0.04, h * 0.1);
    box(g, w, top, d, 0, h - top / 2, 0, c);
    legs(g, w, d, h - top, 0.05, c);
  },
  chair(g, { w, d, h }, c) {
    const seatH = Math.min(0.44, h * 0.52);
    box(g, w, 0.04, d, 0, seatH, 0, c);
    legs(g, w, d, seatH, 0.035, c);
    box(g, w, h - seatH, 0.04, 0, seatH + (h - seatH) / 2, -d / 2 + 0.02, c);
  },
  tvboard(g, { w, d, h }, c) {
    box(g, w, h, d, 0, h / 2, 0, c);
    const tvW = Math.min(w * 0.85, 1.25);
    box(g, tvW, tvW * 0.58, 0.05, 0, h + 0.05 + tvW * 0.29, -d / 4, mat('#111418', { roughness: 0.3 }));
    box(g, 0.3, 0.05, 0.2, 0, h + 0.025, -d / 4, mat('#111418'));
  },
  bed(g, { w, d, h }, c) {
    const frameH = h * 0.5;
    box(g, w, frameH, d, 0, frameH / 2, 0, c);
    box(g, w - 0.04, h - frameH, d - 0.06, 0, frameH + (h - frameH) / 2, 0.02, mat('#f4f2ee', { roughness: 0.95 }));
    box(g, w, 0.9, 0.06, 0, 0.45, -d / 2 + 0.03, c);
    box(g, Math.min(w - 0.2, 0.6), 0.1, 0.35, 0, h + 0.05, -d / 2 + 0.3, mat('#ffffff', { roughness: 0.95 }));
    box(g, w - 0.04, 0.03, d * 0.55, 0, h + 0.015, d * 0.2, mat('#9fb4c8', { roughness: 0.95 }));
  },
  rug(g, { w, d, h }, c) {
    const m = box(g, w, Math.max(h, 0.01), d, 0, Math.max(h, 0.01) / 2 + 0.003, 0, c);
    m.castShadow = false;
  },
  kitchen(g, { w, d, h }, c) {
    box(g, w, h - 0.04, d, 0, (h - 0.04) / 2, 0, c);
    box(g, w + 0.02, 0.04, d + 0.02, 0, h - 0.02, 0, mat('#d8d5cf', { roughness: 0.3 }));
    box(g, 0.75, 0.02, d * 0.6, w * 0.15, h + 0.001, 0, mat('#9aa3ab', { metalness: 0.6, roughness: 0.3 }));
    box(g, 0.6, 0.02, d * 0.7, -w * 0.3, h + 0.001, 0, mat('#2b2f33', { roughness: 0.4 }));
  },
  cabinet(g, { w, d, h }, c) {
    box(g, w, h, d, 0, h / 2, 0, c);
    // 扉の目地
    box(g, 0.01, h * 0.9, 0.005, 0, h / 2, d / 2 + 0.003, mat('#000000', { transparent: true, opacity: 0.3 }));
  },
  shelf(g, { w, d, h }, c) {
    const t = 0.02;
    for (const s of [-1, 1]) box(g, t, h, d, s * (w / 2 - t / 2), h / 2, 0, c);
    box(g, w, h, t, 0, h / 2, -d / 2 + t / 2, c);
    const n = Math.max(2, Math.round(h / 0.35));
    for (let i = 0; i <= n; i++) box(g, w, t, d, 0, (h - t) * (i / n) + t / 2, 0, c);
  },
  plant(g, { w, h }, c) {
    const potH = Math.min(0.3, h * 0.3);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.35, w * 0.28, potH, 16), mat('#b5754c'));
    pot.position.y = potH / 2;
    pot.castShadow = true;
    g.add(pot);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(w * 0.6, 16, 12), c);
    leaf.scale.set(1, (h - potH) / (w * 1.2), 1);
    leaf.position.y = potH + (h - potH) / 2;
    leaf.castShadow = true;
    g.add(leaf);
  },
  box(g, { w, d, h }, c) {
    box(g, w, h, d, 0, h / 2, 0, c);
  },
};

const TYPE_BUILDER = {
  sofa3: 'sofa', sofa2: 'sofa', lowtable: 'table', dining4: 'table', desk: 'table', chair: 'chair',
  tvboard: 'tvboard', rug: 'rug', bed1: 'bed', bed2: 'bed', bed3: 'bed', kitchen: 'kitchen',
  fridge: 'cabinet', cupboard: 'cabinet', wardrobe: 'cabinet', washer: 'cabinet', shelf: 'shelf', plant: 'plant',
};

/** 家具 1 点の 3D グループ（位置・回転は呼び出し側で設定） */
export function buildFurniture3D(f, { highlight } = {}) {
  mats.clear();
  const g = new THREE.Group();
  g.name = `Furniture_${f.name}_${f.id}`;
  const color = highlight ?? f.color;
  const c = mat(color, highlight ? { emissive: highlight, emissiveIntensity: 0.25 } : {});
  (BUILDERS[TYPE_BUILDER[f.type]] ?? BUILDERS.box)(g, f, c);
  return g;
}
