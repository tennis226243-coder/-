// 間取りデータモデルと幾何ユーティリティ（DOM / three.js に依存しない純粋関数）
// 座標はすべて「画像ピクセル」単位。実寸(m)への換算は project.scale (m/px) を使う。

import { normalizeFurniture } from './furniture.js';

let nextId = 1;
export const uid = (prefix) => `${prefix}${Date.now().toString(36)}${(nextId++).toString(36)}`;

export function createProject() {
  return {
    version: 1,
    scale: 0.01, // 1px = 1cm（キャリブレーションで変更）
    wallHeight: 2.4,
    wallThickness: 0.12,
    image: null, // { dataUrl, width, height }
    walls: [], // { id, a:{x,y}, b:{x,y}, thickness(m) }
    openings: [], // { id, wallId, t(0..1 中心位置), type:'door'|'window', width, height, sill (m) }
    rooms: [], // { id, name, points:[{x,y}], color }
    furniture: [], // { id, type, name, x, y (中心 px), rot (度), w, d, h (m), color }
  };
}

export const OPENING_DEFAULTS = {
  door: { width: 0.8, height: 2.0, sill: 0 },
  window: { width: 1.2, height: 1.1, sill: 0.9 },
};

export const dist = (p, q) => Math.hypot(q.x - p.x, q.y - p.y);

export function wallLength(w) {
  return dist(w.a, w.b);
}

/** 点 p から線分 ab への最近点。t は 0..1 にクランプ */
export function projectOnSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + dx * t, y: a.y + dy * t };
  return { t, point, distance: dist(p, point) };
}

/** 最も近い壁を返す（maxDist px 以内） */
export function findNearestWall(walls, p, maxDist) {
  let best = null;
  for (const w of walls) {
    const r = projectOnSegment(p, w.a, w.b);
    if (r.distance <= maxDist && (!best || r.distance < best.distance)) {
      best = { wall: w, ...r };
    }
  }
  return best;
}

/** 既存の壁端点へのスナップ */
export function snapToEndpoint(walls, p, maxDist, excludeWallId = null) {
  let best = null;
  let bestD = maxDist;
  for (const w of walls) {
    if (w.id === excludeWallId) continue;
    for (const q of [w.a, w.b]) {
      const d = dist(p, q);
      if (d <= bestD) {
        bestD = d;
        best = { x: q.x, y: q.y };
      }
    }
  }
  return best;
}

/** 起点 from から見て水平/垂直に近ければ揃える */
export function snapOrtho(from, p, toleranceDeg = 8) {
  const ang = (Math.atan2(p.y - from.y, p.x - from.x) * 180) / Math.PI;
  const mod = ((ang % 90) + 90) % 90;
  if (mod < toleranceDeg || mod > 90 - toleranceDeg) {
    return Math.abs(p.x - from.x) > Math.abs(p.y - from.y)
      ? { x: p.x, y: from.y }
      : { x: from.x, y: p.y };
  }
  return p;
}

/**
 * 壁を開口部で分割し、3D化用の「区間」に変換する。
 * 返り値の各区間: { s0, s1 (m, 壁始点からの距離), bottom, top (m) }
 * 開口部は重なりや壁からのはみ出しをクランプする。
 */
export function wallSegments(wall, openings, scale, wallHeight) {
  const L = wallLength(wall) * scale;
  const list = openings
    .filter((o) => o.wallId === wall.id)
    .map((o) => {
      const c = o.t * L;
      const half = Math.min(o.width, L) / 2;
      const s0 = Math.max(0, c - half);
      const s1 = Math.min(L, c + half);
      const bottom = Math.max(0, Math.min(o.sill, wallHeight));
      const top = Math.max(bottom, Math.min(o.sill + o.height, wallHeight));
      return { ...o, s0, s1, bottom, top };
    })
    .filter((o) => o.s1 > o.s0)
    .sort((a, b) => a.s0 - b.s0);

  const segs = [];
  let cursor = 0;
  for (const o of list) {
    const s0 = Math.max(o.s0, cursor);
    if (s0 >= o.s1) continue; // 前の開口部に完全に含まれる
    if (s0 > cursor) segs.push({ s0: cursor, s1: s0, bottom: 0, top: wallHeight });
    if (o.bottom > 0) segs.push({ s0, s1: o.s1, bottom: 0, top: o.bottom });
    if (o.top < wallHeight) segs.push({ s0, s1: o.s1, bottom: o.top, top: wallHeight });
    cursor = o.s1;
  }
  if (cursor < L) segs.push({ s0: cursor, s1: L, bottom: 0, top: wallHeight });
  return { length: L, segments: segs, openings: list };
}

/** 多角形の面積（px²、符号なし） */
export function polygonArea(points) {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
}

export function bounds(project) {
  const pts = [
    ...project.walls.flatMap((w) => [w.a, w.b]),
    ...project.rooms.flatMap((r) => r.points),
    ...(project.furniture ?? []).map((f) => ({ x: f.x, y: f.y })),
  ];
  if (project.image) {
    pts.push({ x: 0, y: 0 }, { x: project.image.width, y: project.image.height });
  }
  if (!pts.length) return { minX: 0, minY: 0, maxX: 1000, maxY: 800 };
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

/** JSON 読み込み時の検証と正規化 */
export function normalizeProject(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.walls)) {
    throw new Error('間取りデータの形式が正しくありません');
  }
  const base = createProject();
  const project = {
    ...base,
    scale: positive(data.scale, base.scale),
    image: data.image?.dataUrl ? data.image : null,
    ...normalizeLayout(data),
  };
  // リノベーション案（各案はレイアウト部分だけを持つ）
  if (Array.isArray(data.variants)) {
    const variants = data.variants
      .filter((v) => v && Array.isArray(v.walls))
      .map((v) => ({ id: String(v.id ?? uid('v')), name: String(v.name || '案'), ...normalizeLayout(v) }));
    if (variants.length) {
      project.variants = variants;
      const active = String(data.activeVariant);
      project.activeVariant = variants.some((v) => v.id === active) ? active : variants[0].id;
    }
  }
  return project;
}

const positive = (v, d) => (Number.isFinite(v) && v > 0 ? v : d);

/** 壁・開口部・部屋・高さ・壁厚の正規化 */
function normalizeLayout(data) {
  const base = createProject();
  const pt = (p) => ({ x: Number(p?.x) || 0, y: Number(p?.y) || 0 });
  const walls = (data.walls ?? []).map((w) => ({
    id: String(w.id ?? uid('w')),
    a: pt(w.a),
    b: pt(w.b),
    thickness: positive(w.thickness, base.wallThickness),
  }));
  const wallIds = new Set(walls.map((w) => w.id));
  return {
    wallHeight: positive(data.wallHeight, base.wallHeight),
    wallThickness: positive(data.wallThickness, base.wallThickness),
    walls,
    openings: (data.openings ?? [])
      .filter((o) => wallIds.has(String(o.wallId)))
      .map((o) => {
        const type = o.type === 'window' ? 'window' : 'door';
        const d = OPENING_DEFAULTS[type];
        return {
          id: String(o.id ?? uid('o')),
          wallId: String(o.wallId),
          t: Math.max(0, Math.min(1, Number(o.t) || 0.5)),
          type,
          width: positive(o.width, d.width),
          height: positive(o.height, d.height),
          sill: Number.isFinite(o.sill) && o.sill >= 0 ? o.sill : d.sill,
        };
      }),
    rooms: (data.rooms ?? [])
      .filter((r) => Array.isArray(r.points) && r.points.length >= 3)
      .map((r) => ({
        id: String(r.id ?? uid('r')),
        name: String(r.name ?? ''),
        points: r.points.map(pt),
        color: typeof r.color === 'string' ? r.color : '#d9c7a7',
      })),
    furniture: normalizeFurniture(data.furniture),
  };
}
