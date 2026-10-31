// 間取り図画像から壁を自動検出する（純粋関数。ImageData 互換オブジェクトを受け取る）
//
// 手順:
//  1. 画像をセル単位に縮小し、暗い画素の多いセルを「黒」とする二値化
//  2. モルフォロジー・オープニング（収縮→膨張）で細い線・文字・ドアの弧を除去
//  3. 水平方向・垂直方向それぞれで長いランを抽出し、行（列）をまたいで矩形に統合
//  4. 矩形を中心線＋厚みの壁に変換し、同一直線上の壁を統合、交点に端点をスナップ

/**
 * @param {{data: Uint8ClampedArray, width: number, height: number}} img
 * @param {object} [opts]
 * @param {number} [opts.threshold=128]   暗いとみなす輝度 (0-255)
 * @param {number} [opts.minThickness]    壁の最小厚 (px)。省略時は画像サイズから推定
 * @param {number} [opts.minLength]       壁の最小長 (px)
 * @returns {{a:{x,y}, b:{x,y}, thicknessPx:number}[]}
 */
export function detectWalls(img, opts = {}) {
  const { width, height } = img;
  const maxDim = Math.max(width, height);
  const threshold = opts.threshold ?? 128;
  const minThickness = opts.minThickness ?? Math.max(3, Math.round(maxDim / 220));
  const minLength = opts.minLength ?? minThickness * 4;

  // 壁の最小厚が 3 セル以上になるようにセルサイズを決める
  const cell = Math.max(1, Math.floor(minThickness / 3));
  const gw = Math.ceil(width / cell);
  const gh = Math.ceil(height / cell);

  let grid = binarize(img, cell, gw, gh, threshold);
  const r = Math.max(1, Math.floor(minThickness / cell / 2));
  grid = dilate(erode(grid, gw, gh, r), gw, gh, r);

  const minLenCells = Math.max(2, Math.round(minLength / cell));
  const minThickCells = Math.max(1, Math.round((minThickness * 0.8) / cell));

  const hRects = extractRects(grid, gw, gh, minLenCells, false);
  const vRects = extractRects(grid, gw, gh, minLenCells, true);

  const walls = [];
  for (const rc of hRects) {
    const w = rc.x1 - rc.x0;
    const h = rc.y1 - rc.y0;
    if (h < minThickCells || w < h * 1.5) continue;
    const y = ((rc.y0 + rc.y1) / 2) * cell;
    walls.push({ dir: 'h', c: y, s0: rc.x0 * cell, s1: rc.x1 * cell, t: h * cell });
  }
  for (const rc of vRects) {
    const w = rc.x1 - rc.x0;
    const h = rc.y1 - rc.y0;
    if (w < minThickCells || h < w * 1.5) continue;
    const x = ((rc.x0 + rc.x1) / 2) * cell;
    walls.push({ dir: 'v', c: x, s0: rc.y0 * cell, s1: rc.y1 * cell, t: w * cell });
  }

  const merged = mergeCollinear(walls, cell * 2);
  joinEndpoints(merged);

  return merged
    .filter((w) => w.s1 - w.s0 >= Math.max(w.t, cell * 2))
    .map((w) =>
      w.dir === 'h'
        ? { a: { x: w.s0, y: w.c }, b: { x: w.s1, y: w.c }, thicknessPx: w.t }
        : { a: { x: w.c, y: w.s0 }, b: { x: w.c, y: w.s1 }, thicknessPx: w.t },
    );
}

export function binarize(img, cell, gw, gh, threshold) {
  const { data, width, height } = img;
  const grid = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let dark = 0;
      let total = 0;
      const yEnd = Math.min(height, (gy + 1) * cell);
      const xEnd = Math.min(width, (gx + 1) * cell);
      for (let y = gy * cell; y < yEnd; y++) {
        for (let x = gx * cell; x < xEnd; x++) {
          const i = (y * width + x) * 4;
          const alpha = data[i + 3] / 255;
          // 透過部分は白として扱う
          const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) * alpha + 255 * (1 - alpha);
          if (lum < threshold) dark++;
          total++;
        }
      }
      grid[gy * gw + gx] = dark * 2 >= total ? 1 : 0;
    }
  }
  return grid;
}

// 正方形カーネルの収縮/膨張（分離可能なので x→y の 2 パス）
function morph(grid, gw, gh, r, isErode) {
  const pass = (src, horizontal) => {
    const out = new Uint8Array(src.length);
    const n = horizontal ? gw : gh;
    const m = horizontal ? gh : gw;
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < n; i++) {
        let v = isErode ? 1 : 0;
        for (let k = i - r; k <= i + r; k++) {
          // 画像外は収縮では白、膨張では影響なし
          const s = k < 0 || k >= n ? 0 : src[horizontal ? j * gw + k : k * gw + j];
          if (isErode && !s) { v = 0; break; }
          if (!isErode && s) { v = 1; break; }
        }
        out[horizontal ? j * gw + i : i * gw + j] = v;
      }
    }
    return out;
  };
  return pass(pass(grid, true), false);
}

export const erode = (g, gw, gh, r) => morph(g, gw, gh, r, true);
export const dilate = (g, gw, gh, r) => morph(g, gw, gh, r, false);

/**
 * 長いランを行方向に連結して矩形化する。vertical=true なら列方向で処理。
 * 返り値は常に元の座標系 (x0,y0)-(x1,y1)（終端は排他的）
 */
function extractRects(grid, gw, gh, minLen, vertical) {
  const rows = vertical ? gw : gh;
  const cols = vertical ? gh : gw;
  const at = (row, col) => (vertical ? grid[col * gw + row] : grid[row * gw + col]);
  const tol = 1;
  const done = [];
  let active = [];

  for (let row = 0; row <= rows; row++) {
    const runs = [];
    if (row < rows) {
      let start = -1;
      for (let col = 0; col <= cols; col++) {
        const on = col < cols && at(row, col);
        if (on && start < 0) start = col;
        if (!on && start >= 0) {
          if (col - start >= minLen) runs.push({ c0: start, c1: col });
          start = -1;
        }
      }
    }
    const next = [];
    for (const run of runs) {
      const idx = active.findIndex(
        (a) => Math.abs(a.c0 - run.c0) <= tol && Math.abs(a.c1 - run.c1) <= tol,
      );
      if (idx >= 0) {
        const a = active.splice(idx, 1)[0];
        a.r1 = row + 1;
        a.c0 = Math.min(a.c0, run.c0);
        a.c1 = Math.max(a.c1, run.c1);
        next.push(a);
      } else {
        next.push({ ...run, r0: row, r1: row + 1 });
      }
    }
    done.push(...active);
    active = next;
  }

  return done.map((a) =>
    vertical
      ? { x0: a.r0, x1: a.r1, y0: a.c0, y1: a.c1 }
      : { x0: a.c0, x1: a.c1, y0: a.r0, y1: a.r1 },
  );
}

/** 同じ向き・ほぼ同じ中心線で、重なる/接する壁を統合 */
function mergeCollinear(walls, tol) {
  const out = [];
  for (const dir of ['h', 'v']) {
    const list = walls.filter((w) => w.dir === dir).sort((p, q) => p.c - q.c || p.s0 - q.s0);
    const used = new Array(list.length).fill(false);
    for (let i = 0; i < list.length; i++) {
      if (used[i]) continue;
      const w = { ...list[i] };
      let changed = true;
      while (changed) {
        changed = false;
        for (let j = 0; j < list.length; j++) {
          if (used[j] || j === i) continue;
          const o = list[j];
          if (
            Math.abs(o.c - w.c) <= Math.max(tol, Math.min(o.t, w.t) / 2) &&
            o.s0 <= w.s1 + tol &&
            o.s1 >= w.s0 - tol
          ) {
            const len = w.s1 - w.s0;
            const olen = o.s1 - o.s0;
            w.c = (w.c * len + o.c * olen) / (len + olen);
            w.t = Math.max(w.t, o.t);
            w.s0 = Math.min(w.s0, o.s0);
            w.s1 = Math.max(w.s1, o.s1);
            used[j] = true;
            changed = true;
          }
        }
      }
      used[i] = true;
      out.push(w);
    }
  }
  return out;
}

/**
 * 端点を直交する壁の中心線に揃える（3D 化時に壁を厚み/2 だけ延長して角を埋めるため）。
 * 接続先のない端点は自身の厚み/2 だけ内側に戻す。
 */
function joinEndpoints(walls) {
  for (const w of walls) {
    for (const end of ['s0', 's1']) {
      const pos = w[end];
      let best = null;
      for (const o of walls) {
        if (o.dir === w.dir) continue;
        // o の中心線（w の軸方向の座標）が端点付近にあり、o の範囲が w の中心線を含む
        const d = Math.abs(o.c - pos);
        if (d > o.t + w.t / 2) continue;
        if (w.c < o.s0 - w.t || w.c > o.s1 + w.t) continue;
        if (!best || d < best.d) best = { d, c: o.c };
      }
      if (best) w[end] = best.c;
      else w[end] = end === 's0' ? pos + w.t / 2 : pos - w.t / 2;
    }
    if (w.s0 > w.s1) [w.s0, w.s1] = [w.s1, w.s0];
  }
}

/**
 * 同一直線上で隙間を挟んで並ぶ壁を 1 本に統合し、隙間をドア/窓の開口部に変換する。
 * 隙間の中に壁と平行な線が 2 本以上あれば窓（窓記号の 3 本線）、なければドアとみなす。
 * @param {{a,b,thicknessPx}[]} walls detectWalls の結果
 * @returns {{ walls: {a,b,thicknessPx}[], openings: {wallIndex, t, widthPx, type}[] }}
 */
export function findOpenings(walls, img, opts = {}) {
  // 細い線はアンチエイリアスで灰色になるので、壁より緩いしきい値で判定する
  const threshold = ((opts.threshold ?? 128) + 255) / 2;
  const minRatio = opts.minGapRatio ?? 2.5; // 壁厚に対する隙間幅の下限
  const maxRatio = opts.maxGapRatio ?? 20;
  const lines = walls.map((w) => {
    const h = w.a.y === w.b.y;
    return {
      h,
      c: h ? w.a.y : w.a.x,
      s0: h ? Math.min(w.a.x, w.b.x) : Math.min(w.a.y, w.b.y),
      s1: h ? Math.max(w.a.x, w.b.x) : Math.max(w.a.y, w.b.y),
      t: w.thicknessPx,
      gaps: [],
    };
  });
  // 中心線から offset だけずれた線上で、暗い画素が続く割合
  const darkRatio = (L, from, to, offset) => {
    let dark = 0;
    let n = 0;
    for (let s = Math.ceil(from); s < to; s++) {
      n++;
      for (let d = -2; d <= 2; d++) {
        const x = Math.round(L.h ? s : L.c + offset + d);
        const y = Math.round(L.h ? L.c + offset + d : s);
        if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
        const i = (y * img.width + x) * 4;
        const lum = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
        if (lum < threshold && img.data[i + 3] > 128) { dark++; break; }
      }
    }
    return n ? dark / n : 0;
  };

  const used = new Set();
  const out = [];
  const order = lines.map((_, i) => i).sort((i, j) => lines[i].s0 - lines[j].s0);
  for (const i of order) {
    if (used.has(i)) continue;
    used.add(i);
    const cur = { ...lines[i], gaps: [] };
    let extended = true;
    while (extended) {
      extended = false;
      let best = null;
      for (const j of order) {
        if (used.has(j)) continue;
        const o = lines[j];
        if (o.h !== cur.h || Math.abs(o.c - cur.c) > Math.max(o.t, cur.t) / 2) continue;
        if (Math.abs(o.t - cur.t) > Math.max(o.t, cur.t) * 0.4) continue;
        // 自由端は厚み/2 戻されているので、図面上の隙間は gap - t
        const t = Math.max(o.t, cur.t);
        const gap = o.s0 - cur.s1 - t;
        if (gap < t * minRatio || gap > t * maxRatio) continue;
        if (!best || o.s0 < lines[best].s0) best = j;
      }
      if (best !== null) {
        const o = lines[best];
        const t = Math.max(o.t, cur.t);
        const g0 = cur.s1 + t / 2;
        const g1 = o.s0 - t / 2;
        const off = t * 0.4;
        const hits = [-off, 0, off].filter((d) => darkRatio(cur, g0, g1, d) > 0.6).length;
        cur.gaps.push({ g0, g1, type: hits >= 2 ? 'window' : 'door' });
        cur.c = (cur.c + o.c) / 2;
        cur.t = t;
        cur.s1 = o.s1;
        used.add(best);
        extended = true;
      }
    }
    out.push(cur);
  }

  const resultWalls = [];
  const openings = [];
  for (const L of out) {
    const wallIndex = resultWalls.length;
    resultWalls.push(
      L.h
        ? { a: { x: L.s0, y: L.c }, b: { x: L.s1, y: L.c }, thicknessPx: L.t }
        : { a: { x: L.c, y: L.s0 }, b: { x: L.c, y: L.s1 }, thicknessPx: L.t },
    );
    const len = L.s1 - L.s0;
    for (const g of L.gaps) {
      openings.push({ wallIndex, t: ((g.g0 + g.g1) / 2 - L.s0) / len, widthPx: g.g1 - g.g0, type: g.type });
    }
  }
  return { walls: resultWalls, openings };
}
