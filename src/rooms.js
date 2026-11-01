// 部屋の床材と、間取り図の色から部屋（和室・水回り・洋室）を推定する処理
// （DOM / three.js に依存しない純粋関数）

/** 部屋ごとに選べる床材。default は「3D 設定」の床の仕上げに従う */
export const ROOM_FLOORS = {
  default: { name: '全体の設定に合わせる', color: '#d9c7a7' },
  'wood-light': { name: 'フローリング（明るい）', color: '#e3cfae' },
  'wood-gray': { name: 'フローリング（グレージュ）', color: '#d6cdc0' },
  'wood-dark': { name: 'フローリング（濃い）', color: '#b89a80' },
  tatami: { name: '畳', color: '#c9d8a4' },
  'tile-bath': { name: '浴室タイル', color: '#bcd6e6' },
  tile: { name: 'タイル', color: '#e2e0da' },
};

/** 部屋名から床材を推定（該当なしは null） */
export function floorFromName(name = '') {
  if (/和室|畳|座敷|茶室/.test(name)) return 'tatami';
  if (/浴室|風呂|バス|シャワー/.test(name)) return 'tile-bath';
  if (/洗面|脱衣|トイレ|WC|ＷＣ|玄関|土間|水回り/i.test(name)) return 'tile';
  return null;
}

export function normalizeRoomFloor(floor, name) {
  return ROOM_FLOORS[floor] ? floor : (floorFromName(name) ?? 'default');
}

// ---------- 色による部屋の推定 ----------

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

/**
 * 不動産の間取り図でよく使われる塗り色を分類する。
 *   1: 和室（畳の緑）  2: 水回り（水色）  3: 洋室・LDK（ベージュ・木目色）
 *   4: 薄いグレー（玄関の土間。バルコニーや共用廊下も同じ色なので、広さで区別する）  0: その他
 */
export function classifyColor(r, g, b) {
  const [h, s, l] = rgbToHsl(r, g, b);
  if (s < 0.08 && l >= 0.72 && l <= 0.9) return 4;
  if (l < 0.45 || l > 0.97 || s < 0.12) return 0;
  if (h >= 65 && h <= 160) return 1;
  if (h >= 175 && h <= 225) return 2;
  // 塗りのベージュは明るめで彩度が中程度（濃いオレンジの線などは除く）
  if (h >= 25 && h <= 60 && l >= 0.62 && s <= 0.85) return 3;
  return 0;
}

export const ROOM_KINDS = {
  1: { name: '和室', floor: 'tatami' },
  2: { name: '水回り', floor: 'tile-bath' },
  3: { name: '洋室', floor: 'default' },
  4: { name: '玄関', floor: 'tile' },
};

/**
 * 画像の塗り色から部屋の範囲を推定する。
 * @param {{data, width, height}} img
 * @param {object} [opts]
 * @param {number} [opts.minAreaRatio=0.004]  画像面積に対する部屋の最小面積
 * @param {{a,b,thicknessPx}[]} [opts.barriers] 部屋の境界とする壁（画像 px）。ドア位置でも途切れない壁を渡すと、
 *   隣の部屋とつながらない
 * @returns {{kind:1|2|3, points:{x,y}[], areaPx:number}[]}  points は画像 px 座標の多角形
 */
export function detectRoomsByColor(img, opts = {}) {
  const { data, width, height } = img;
  const cell = Math.max(2, Math.round(Math.max(width, height) / 220));
  const gw = Math.ceil(width / cell);
  const gh = Math.ceil(height / cell);
  // セルごとに最も多い色の種類（全体の 35% 以上を占めるとき）
  const grid = new Uint8Array(gw * gh);
  // 壁などの暗い線を含むセル（部屋の境界）
  const barrier = new Uint8Array(gw * gh);
  const counts = [0, 0, 0, 0, 0];
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      counts.fill(0);
      let total = 0;
      let dark = 0;
      for (let y = gy * cell; y < Math.min(height, (gy + 1) * cell); y++) {
        for (let x = gx * cell; x < Math.min(width, (gx + 1) * cell); x++) {
          const i = (y * width + x) * 4;
          if (data[i + 3] < 128) { total++; continue; }
          counts[classifyColor(data[i], data[i + 1], data[i + 2])]++;
          if (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < 110) dark++;
          total++;
        }
      }
      let best = 0;
      let bestN = 0;
      for (let k = 1; k <= 4; k++) {
        if (counts[k] > bestN) { best = k; bestN = counts[k]; }
      }
      grid[gy * gw + gx] = bestN >= total * 0.35 ? best : 0;
      if (dark >= total * 0.2) barrier[gy * gw + gx] = 1;
    }
  }

  for (const w of opts.barriers ?? []) {
    // 壁の中心線に沿って、厚み（最低 1 セル）の範囲を境界にする
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const steps = Math.max(1, Math.ceil(len / (cell / 2)));
    const r = Math.max(0, Math.floor((w.thicknessPx ?? 0) / cell / 2));
    for (let k = 0; k <= steps; k++) {
      const cx = Math.floor((w.a.x + ((w.b.x - w.a.x) * k) / steps) / cell);
      const cy = Math.floor((w.a.y + ((w.b.y - w.a.y) * k) / steps) / cell);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && y >= 0 && x < gw && y < gh) barrier[y * gw + x] = 1;
      }
    }
  }

  const minArea = (opts.minAreaRatio ?? 0.004) * gw * gh;
  const rooms = [];
  for (const kind of [1, 2, 3, 4]) {
    let mask = new Uint8Array(gw * gh);
    for (let i = 0; i < mask.length; i++) mask[i] = grid[i] === kind ? 1 : 0;
    // 文字・畳の目・設備の線などで途切れた部分をつなぐ（クロージング）
    mask = erodeMask(dilateMask(mask, gw, gh, 2), gw, gh, 2);
    // 壁の線で区切る（つないだ後で境界を戻す）
    for (let i = 0; i < mask.length; i++) if (barrier[i]) mask[i] = 0;
    for (const comp of components(mask, gw, gh)) {
      if (comp.cells.length < minArea) continue;
      // 細長すぎるもの（廊下の塗りの切れ端・凡例など）は除く
      const bw = comp.maxX - comp.minX + 1;
      const bh = comp.maxY - comp.minY + 1;
      if (Math.min(bw, bh) < 4) continue;
      const compMask = new Uint8Array(gw * gh);
      for (const i of comp.cells) compMask[i] = 1;
      const loop = outerLoop(compMask, gw, gh);
      if (!loop) continue;
      const simplified = simplifyLoop(loop, 1.5);
      if (simplified.length < 3) continue;
      const points = simplified.map((p) => ({ x: Math.min(width, p.x * cell), y: Math.min(height, p.y * cell) }));
      // 面積は外周で囲まれた範囲（浴槽などの白抜きの記号も部屋に含める）
      rooms.push({ kind, points, areaPx: shoelace(points) });
    }
  }
  return rooms;
}

function shoelace(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
}

function morph(mask, gw, gh, r, erode) {
  const pass = (src, horizontal) => {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        let v = erode ? 1 : 0;
        for (let k = -r; k <= r; k++) {
          const xx = horizontal ? x + k : x;
          const yy = horizontal ? y : y + k;
          const s = xx < 0 || yy < 0 || xx >= gw || yy >= gh ? 0 : src[yy * gw + xx];
          if (erode && !s) { v = 0; break; }
          if (!erode && s) { v = 1; break; }
        }
        out[y * gw + x] = v;
      }
    }
    return out;
  };
  return pass(pass(mask, true), false);
}
const dilateMask = (m, gw, gh, r) => morph(m, gw, gh, r, false);
const erodeMask = (m, gw, gh, r) => morph(m, gw, gh, r, true);

function components(mask, gw, gh) {
  const seen = new Uint8Array(mask.length);
  const out = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    const comp = { cells: [], minX: Infinity, minY: Infinity, maxX: -1, maxY: -1 };
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop();
      const x = j % gw;
      const y = (j - x) / gw;
      comp.cells.push(j);
      comp.minX = Math.min(comp.minX, x); comp.maxX = Math.max(comp.maxX, x);
      comp.minY = Math.min(comp.minY, y); comp.maxY = Math.max(comp.maxY, y);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const n = ny * gw + nx;
        if (mask[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    out.push(comp);
  }
  return out;
}

/**
 * 連結成分の外周をセルの角の座標（格子点）の閉路として返す。
 * セルの境界辺を、内側を左に見る向きでつなぎ、最も長い閉路（外周）を採用する。
 */
function outerLoop(mask, gw, gh) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < gw && y < gh && mask[y * gw + x] === 1;
  const next = new Map(); // "x,y" -> 次の点（同じ始点が 2 つある場合は配列）
  const addEdge = (x0, y0, x1, y1) => {
    const k = `${x0},${y0}`;
    if (!next.has(k)) next.set(k, []);
    next.get(k).push([x1, y1]);
  };
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (!inside(x, y)) continue;
      // 画面座標（y 下向き）で、内側が進行方向の右側になる向き（時計回り）
      if (!inside(x, y - 1)) addEdge(x, y, x + 1, y);
      if (!inside(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
      if (!inside(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
      if (!inside(x - 1, y)) addEdge(x, y + 1, x, y);
    }
  }
  let best = null;
  while (next.size) {
    const startKey = next.keys().next().value;
    const loop = [];
    let key = startKey;
    let guard = 0;
    while (next.has(key) && guard++ < 1e6) {
      const [x, y] = key.split(',').map(Number);
      loop.push({ x, y });
      const list = next.get(key);
      const [nx, ny] = list.pop();
      if (!list.length) next.delete(key);
      key = `${nx},${ny}`;
      if (key === startKey) break;
    }
    if (!best || loop.length > best.length) best = loop;
  }
  return best;
}

/** 閉路を Douglas–Peucker で単純化（eps は格子単位） */
function simplifyLoop(loop, eps) {
  if (loop.length < 4) return loop;
  // 最も離れた 2 点で 2 つの開いた折れ線に分けて単純化する
  let far = 0;
  let farD = -1;
  for (let i = 1; i < loop.length; i++) {
    const d = (loop[i].x - loop[0].x) ** 2 + (loop[i].y - loop[0].y) ** 2;
    if (d > farD) { farD = d; far = i; }
  }
  const a = dp(loop.slice(0, far + 1), eps);
  const b = dp([...loop.slice(far), loop[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

function dp(pts, eps) {
  if (pts.length <= 2) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let idx = -1;
  let maxD = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * (pts[i].x - a.x) - dx * (pts[i].y - a.y)) / len;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= eps) return [a, b];
  return [...dp(pts.slice(0, idx + 1), eps).slice(0, -1), ...dp(pts.slice(idx), eps)];
}
