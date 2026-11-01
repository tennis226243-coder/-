// 家具カタログと家具の幾何計算（DOM / three.js に依存しない）
// 家具は中心 (x, y)[px] と回転 rot[度, 2D 図面上で時計回り]、寸法 w(幅) d(奥行) h(高さ)[m] を持つ。
// rot = 0 のとき、幅は図面の横方向、背面は図面の上側（y が小さい側）。
import { uid } from './model.js';

export const FURNITURE_CATALOG = [
  { type: 'sofa3', name: 'ソファ（3人）', group: 'リビング', w: 1.9, d: 0.85, h: 0.8, color: '#7d8fa3' },
  { type: 'sofa2', name: 'ソファ（2人）', group: 'リビング', w: 1.5, d: 0.85, h: 0.8, color: '#7d8fa3' },
  { type: 'lowtable', name: 'ローテーブル', group: 'リビング', w: 1.0, d: 0.5, h: 0.4, color: '#a0785a' },
  { type: 'tvboard', name: 'テレビボード', group: 'リビング', w: 1.6, d: 0.4, h: 0.45, color: '#5e4b3c' },
  { type: 'rug', name: 'ラグ', group: 'リビング', w: 2.0, d: 1.4, h: 0.01, color: '#d9cbb5' },
  { type: 'dining4', name: 'ダイニングテーブル（4人）', group: 'ダイニング', w: 1.35, d: 0.8, h: 0.72, color: '#b08a64' },
  { type: 'chair', name: 'チェア', group: 'ダイニング', w: 0.45, d: 0.5, h: 0.85, color: '#8a6a4f' },
  { type: 'fridge', name: '冷蔵庫', group: 'キッチン', w: 0.65, d: 0.7, h: 1.8, color: '#e8eaed' },
  { type: 'cupboard', name: '食器棚', group: 'キッチン', w: 1.2, d: 0.45, h: 1.9, color: '#c9b79c' },
  { type: 'kitchen', name: 'キッチン（I型）', group: 'キッチン', w: 2.55, d: 0.65, h: 0.85, color: '#f1efe9' },
  { type: 'bed1', name: 'シングルベッド', group: '寝室', w: 1.0, d: 2.0, h: 0.5, color: '#b9a48a' },
  { type: 'bed2', name: 'セミダブルベッド', group: '寝室', w: 1.2, d: 2.0, h: 0.5, color: '#b9a48a' },
  { type: 'bed3', name: 'ダブルベッド', group: '寝室', w: 1.4, d: 2.0, h: 0.5, color: '#b9a48a' },
  { type: 'wardrobe', name: 'ワードローブ', group: '寝室', w: 0.9, d: 0.6, h: 1.8, color: '#d4c4aa' },
  { type: 'desk', name: 'デスク', group: '書斎', w: 1.0, d: 0.6, h: 0.72, color: '#a0785a' },
  { type: 'shelf', name: '本棚', group: '書斎', w: 0.8, d: 0.3, h: 1.8, color: '#c9b79c' },
  { type: 'washer', name: '洗濯機', group: '水回り', w: 0.6, d: 0.6, h: 1.0, color: '#f4f5f7' },
  { type: 'plant', name: '観葉植物', group: 'その他', w: 0.4, d: 0.4, h: 1.2, color: '#4f8a4b' },
];

export const catalogItem = (type) => FURNITURE_CATALOG.find((c) => c.type === type);

export function createFurniture(type, center) {
  const c = catalogItem(type);
  if (!c) throw new Error(`unknown furniture: ${type}`);
  return { id: uid('f'), type, name: c.name, x: center.x, y: center.y, rot: 0, w: c.w, d: c.d, h: c.h, color: c.color };
}

/** 図面上の 4 隅（px） */
export function furnitureCorners(f, scale) {
  const hw = f.w / scale / 2;
  const hd = f.d / scale / 2;
  const r = (f.rot * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => ({ x: f.x + x * c - y * s, y: f.y + x * s + y * c }));
}

/** 点 p（px）が家具の内側か（tol px の余裕） */
export function hitFurniture(f, p, scale, tol = 0) {
  const r = (-f.rot * Math.PI) / 180;
  const dx = p.x - f.x;
  const dy = p.y - f.y;
  const lx = dx * Math.cos(r) - dy * Math.sin(r);
  const ly = dx * Math.sin(r) + dy * Math.cos(r);
  return Math.abs(lx) <= f.w / scale / 2 + tol && Math.abs(ly) <= f.d / scale / 2 + tol;
}

export function normalizeFurniture(list) {
  if (!Array.isArray(list)) return [];
  const pos = (v, d) => (Number.isFinite(v) && v > 0 ? v : d);
  return list
    .filter((f) => f && catalogItem(f.type))
    .map((f) => {
      const c = catalogItem(f.type);
      return {
        id: String(f.id ?? uid('f')),
        type: f.type,
        name: typeof f.name === 'string' && f.name ? f.name : c.name,
        x: Number(f.x) || 0,
        y: Number(f.y) || 0,
        rot: ((Number(f.rot) || 0) % 360 + 360) % 360,
        w: pos(f.w, c.w),
        d: pos(f.d, c.d),
        h: pos(f.h, c.h),
        color: typeof f.color === 'string' ? f.color : c.color,
      };
    });
}
