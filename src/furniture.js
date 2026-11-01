// 家具カタログと家具の幾何計算（DOM / three.js に依存しない）
// 家具は中心 (x, y)[px] と回転 rot[度, 2D 図面上で時計回り]、寸法 w(幅) d(奥行) h(高さ)[m] を持つ。
// rot = 0 のとき、幅は図面の横方向、背面は図面の上側（y が小さい側）。
import { uid } from './model.js';

export const FURNITURE_CATALOG = [
  // 人（広さの目安）。w = 肩幅、d = 体の厚み（座りは足先まで）、h = 身長（座りは座高込みの高さ）、color = 服の色
  { type: 'person', name: '大人（立ち）', group: '人', w: 0.46, d: 0.28, h: 1.7, color: '#4b6a8a', person: true },
  { type: 'person-sit', name: '大人（座り）', group: '人', w: 0.46, d: 0.62, h: 1.3, color: '#8a5a4b', person: true },
  { type: 'child', name: '子ども', group: '人', w: 0.34, d: 0.2, h: 1.15, color: '#d08a3a', person: true },
  // 設備ユニット（部屋まるごと。大きさを部屋に合わせて使う）
  { type: 'unitbath', name: 'ユニットバス', group: '水回り', w: 1.6, d: 1.6, h: 2.0, color: '#eef1f4', unit: true },
  { type: 'toiletroom', name: 'トイレ（手洗い付き）', group: '水回り', w: 0.8, d: 1.3, h: 1.0, color: '#f7f7f5', unit: true },
  { type: 'washroom', name: '洗面所（洗面台＋洗濯機）', group: '水回り', w: 1.4, d: 0.6, h: 1.9, color: '#f2f0ec', unit: true },
  { type: 'genkan', name: '玄関（土間・框・下駄箱）', group: '玄関', w: 1.4, d: 1.2, h: 1.0, color: '#8e8a84', unit: true },
  { type: 'sofa3', name: 'ソファ（3人）', group: 'リビング', w: 1.9, d: 0.85, h: 0.8, color: '#7d8fa3' },
  { type: 'sofa2', name: 'ソファ（2人）', group: 'リビング', w: 1.5, d: 0.85, h: 0.8, color: '#7d8fa3' },
  { type: 'sofaL', name: 'L字ソファ', group: 'リビング', w: 2.4, d: 1.6, h: 0.8, color: '#8b8478' },
  { type: 'armchair', name: '一人掛けソファ', group: 'リビング', w: 0.8, d: 0.82, h: 0.8, color: '#b0866a' },
  { type: 'lowtable', name: 'ローテーブル', group: 'リビング', w: 1.0, d: 0.5, h: 0.4, color: '#a0785a' },
  { type: 'tvboard', name: 'テレビボード', group: 'リビング', w: 1.6, d: 0.4, h: 0.45, color: '#5e4b3c' },
  { type: 'rug', name: 'ラグ', group: 'リビング', w: 2.0, d: 1.4, h: 0.01, color: '#d9cbb5' },
  { type: 'sideboard', name: 'サイドボード', group: 'リビング', w: 1.2, d: 0.45, h: 0.8, color: '#a0785a' },
  { type: 'floorlamp', name: 'フロアランプ', group: 'リビング', w: 0.4, d: 0.4, h: 1.6, color: '#f3ead8' },
  { type: 'curtain', name: 'カーテン', group: 'リビング', w: 1.8, d: 0.12, h: 2.2, color: '#d8d2c4' },
  { type: 'diningset4', name: 'ダイニングセット（4人）', group: 'ダイニング', w: 1.35, d: 1.7, h: 0.72, color: '#b08a64' },
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
  { type: 'bathtub', name: '浴槽', group: '水回り', w: 1.4, d: 0.75, h: 0.55, color: '#f4f6f8' },
  { type: 'toilet', name: 'トイレ', group: '水回り', w: 0.42, d: 0.72, h: 0.78, color: '#f7f7f5' },
  { type: 'vanity', name: '洗面台', group: '水回り', w: 0.75, d: 0.5, h: 1.9, color: '#f2f0ec' },
  { type: 'washer', name: '洗濯機', group: '水回り', w: 0.6, d: 0.6, h: 1.0, color: '#f4f5f7' },
  { type: 'oshiire', name: '押入れ（ふすま）', group: '和室', w: 1.8, d: 0.8, h: 1.8, color: '#efe7d4' },
  { type: 'zataku', name: '座卓', group: '和室', w: 1.2, d: 0.75, h: 0.33, color: '#6b4a32' },
  { type: 'zabuton', name: '座布団', group: '和室', w: 0.55, d: 0.59, h: 0.08, color: '#8a3b3b' },
  { type: 'getabako', name: '下駄箱', group: '玄関', w: 0.9, d: 0.38, h: 1.0, color: '#c9b79c' },
  { type: 'plant', name: '観葉植物', group: 'その他', w: 0.4, d: 0.4, h: 1.2, color: '#4f8a4b' },
];

export const catalogItem = (type) => FURNITURE_CATALOG.find((c) => c.type === type);
export const isPerson = (f) => !!catalogItem(f.type)?.person;

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
        ...(f.auto ? { auto: true } : {}),
      };
    });
}

/**
 * 推定した部屋（浴室・トイレ・洗面・玄関）に合う設備ユニットを、部屋の大きさに合わせて作る。
 * 長い辺を幅（w）にし、部屋の内側に少し余白をとる。
 * @param {{name, points}[]} rooms  画像 px 座標
 * @param {number} scale  m/px
 */
export function fixturesForRooms(rooms, scale) {
  const TYPE_BY_NAME = { 浴室: 'unitbath', トイレ: 'toiletroom', 洗面: 'washroom', 玄関: 'genkan' };
  const out = [];
  for (const r of rooms) {
    const type = TYPE_BY_NAME[r.name];
    if (!type) continue;
    const xs = r.points.map((p) => p.x);
    const ys = r.points.map((p) => p.y);
    const bw = (Math.max(...xs) - Math.min(...xs)) * scale;
    const bh = (Math.max(...ys) - Math.min(...ys)) * scale;
    if (bw < 0.5 || bh < 0.5) continue;
    const f = createFurniture(type, { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 });
    const margin = 0.04;
    const long = Math.max(bw, bh) - margin;
    const short = Math.min(bw, bh) - margin;
    // 縦長の部屋は 90° 回して、長い辺を幅にする
    f.rot = bh > bw ? 90 : 0;
    if (type === 'washroom') {
      // 洗面所は壁際に置く（奥行は家具の大きさのまま）
      f.w = Math.min(long, 1.8);
      const off = (short + margin - f.d) / 2 / scale;
      if (f.rot === 0) f.y -= off; else f.x += off;
    } else if (type === 'toiletroom') {
      // トイレは便器が長い辺の方向を向く
      f.rot = bh > bw ? 0 : 90;
      f.w = short;
      f.d = long;
    } else {
      f.w = long;
      f.d = short;
    }
    f.auto = true;
    out.push(f);
  }
  return out;
}
