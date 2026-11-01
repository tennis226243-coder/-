// 間取り図画像から壁を自動検出する（純粋関数。ImageData 互換オブジェクトを受け取る）
//
// 手順:
//  1. 画像をセル単位に縮小し、暗い画素の多いセルを「黒」とする二値化
//  2. クロージングで壁内の白抜けを埋め、オープニング（収縮→膨張）で細い線・文字・ドアの弧を除去
//  3. 水平方向・垂直方向それぞれで「長いランに属するセル」だけを残し、連結成分ごとに 1 本の壁とする
//     （JPEG のにじみや輪郭のギザギザがあっても成分としてまとまるので途切れにくい）
//  4. 成分を中心線＋厚みの壁に変換し、同一直線上の壁を統合、交点に端点をスナップ

/**
 * @param {{data: Uint8ClampedArray, width: number, height: number}} img
 * @param {object} [opts]
 * @param {number} [opts.threshold=128]   暗いとみなす輝度 (0-255)
 * @param {number} [opts.minThickness]    壁の最小厚 (px)。省略時は画像サイズから推定
 * @param {number} [opts.minLength]       壁の最小長 (px)
 * @param {number} [opts.estimatedThickness] 推定済みの壁厚 (px)。省略時はここで推定する
 * @returns {{a:{x,y}, b:{x,y}, thicknessPx:number}[]}
 */
export function detectWalls(img, opts = {}) {
  const { width, height } = img;
  const maxDim = Math.max(width, height);
  const threshold = opts.threshold ?? 128;
  // 壁厚は画像から推定（推定できなければ画像サイズから決める）
  // 推定値は細い壁の図面で基準を下げるときだけ使う（3px 以下は畳の目や寸法線の可能性が高いので使わない）
  const fallback = Math.max(3, Math.round(maxDim / 220));
  const estimated = opts.minThickness ? null : (opts.estimatedThickness ?? estimateWallThickness(img, threshold));
  const minThickness = opts.minThickness ??
    (estimated >= 4 ? Math.min(fallback, Math.max(3, Math.round(estimated * 0.7))) : fallback);
  // 太字の文字などを壁と誤認しないよう、短すぎる線は除く
  // （壁の断面を「長い線」と誤認しないよう、推定した壁厚の 2 倍以上にもする）
  const minLength = opts.minLength ?? Math.max(minThickness * 4, (estimated ?? 0) * 2, Math.round(maxDim / 50));

  // 壁の最小厚が 3 セル以上になるようにセルサイズを決める
  const cell = Math.max(1, Math.floor(minThickness / 3));
  const gw = Math.ceil(width / cell);
  const gh = Math.ceil(height / cell);

  let grid = binarize(img, cell, gw, gh, threshold);
  // 画素単位のときはクロージングで壁の中の 1〜2px の白抜け（JPEG ノイズ等）を埋める。
  // セルが 2px 以上なら二値化の平均で吸収されるので行わない（窓記号の平行線を潰さないため）
  if (cell === 1) grid = erode(dilate(grid, gw, gh, 1), gw, gh, 1);
  // オープニングで細い線・文字を除去する
  const r = Math.max(1, Math.floor(minThickness / cell / 2));
  grid = dilate(erode(grid, gw, gh, r), gw, gh, r);

  const minLenCells = Math.max(2, Math.round(minLength / cell));
  const minThickCells = Math.max(1, Math.round((minThickness * 0.8) / cell));

  const walls = [];
  for (const vertical of [false, true]) {
    const mask = directionalMask(grid, gw, gh, minLenCells, vertical);
    for (const cp of components(mask, gw, gh)) {
      const len = vertical ? cp.maxY - cp.minY + 1 : cp.maxX - cp.minX + 1;
      const thick = cp.count / len; // 平均の厚み（ギザギザの影響を受けにくい）
      if (thick < minThickCells || len < thick * 1.5) continue;
      const c = ((vertical ? cp.sumX : cp.sumY) / cp.count + 0.5) * cell;
      walls.push(vertical
        ? { dir: 'v', c, s0: cp.minY * cell, s1: (cp.maxY + 1) * cell, t: thick * cell }
        : { dir: 'h', c, s0: cp.minX * cell, s1: (cp.maxX + 1) * cell, t: thick * cell });
    }
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

/**
 * 壁の厚さ（px）を推定する。
 * 暗い画素ごとに水平・垂直方向の連続長を求め、「一方向に長く、もう一方向に短い」画素
 * （＝長い線の一部）の短い方の長さを集計し、最も多い値を壁厚とみなす。
 * 文字や記号は両方向とも短いので除外される。
 * @returns {number|null}
 */
export function estimateWallThickness(img, threshold = 128) {
  const { data, width, height } = img;
  const n = width * height;
  const dark = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3] / 255;
    const lum = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) * a + 255 * (1 - a);
    dark[i] = lum < threshold ? 1 : 0;
  }
  const hRun = new Uint16Array(n);
  const vRun = new Uint16Array(n);
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      if (!dark[y * width + x]) { x++; continue; }
      let e = x;
      while (e < width && dark[y * width + e]) e++;
      for (let k = x; k < e; k++) hRun[y * width + k] = Math.min(e - x, 65535);
      x = e;
    }
  }
  for (let x = 0; x < width; x++) {
    let y = 0;
    while (y < height) {
      if (!dark[y * width + x]) { y++; continue; }
      let e = y;
      while (e < height && dark[e * width + x]) e++;
      for (let k = y; k < e; k++) vRun[k * width + x] = Math.min(e - y, 65535);
      y = e;
    }
  }
  const maxT = 80;
  const hist = new Float64Array(maxT + 2);
  const minLong = Math.max(20, Math.round(Math.max(width, height) / 40));
  let samples = 0;
  for (let i = 0; i < n; i++) {
    if (!dark[i]) continue;
    const t = Math.min(hRun[i], vRun[i]);
    const L = Math.max(hRun[i], vRun[i]);
    if (t < 2 || t > maxT || L < minLong || L < t * 6) continue;
    hist[t]++;
    samples++;
  }
  if (samples < 100) return null;
  // 隣の値と合わせてならした上で最頻値をとる（アンチエイリアスで ±1px ぶれるため）
  let best = 0;
  let bestT = null;
  for (let t = 2; t <= maxT; t++) {
    const v = hist[t - 1] * 0.5 + hist[t] + hist[t + 1] * 0.5;
    if (v > best) { best = v; bestT = t; }
  }
  return bestT;
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

/** 指定方向のランの長さが minLen 以上のセルだけを残したマスク */
function directionalMask(grid, gw, gh, minLen, vertical) {
  const mask = new Uint8Array(grid.length);
  const lines = vertical ? gw : gh;
  const len = vertical ? gh : gw;
  const idx = (line, k) => (vertical ? k * gw + line : line * gw + k);
  for (let line = 0; line < lines; line++) {
    let start = -1;
    for (let k = 0; k <= len; k++) {
      const on = k < len && grid[idx(line, k)];
      if (on && start < 0) start = k;
      if (!on && start >= 0) {
        if (k - start >= minLen) for (let j = start; j < k; j++) mask[idx(line, j)] = 1;
        start = -1;
      }
    }
  }
  return mask;
}

/** 4 近傍の連結成分ごとの外接矩形・画素数・重心用の和 */
function components(mask, gw, gh) {
  const seen = new Uint8Array(mask.length);
  const stack = [];
  const out = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    const cp = { minX: Infinity, minY: Infinity, maxX: -1, maxY: -1, count: 0, sumX: 0, sumY: 0 };
    seen[i] = 1;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop();
      const x = j % gw;
      const y = (j - x) / gw;
      cp.count++;
      cp.sumX += x;
      cp.sumY += y;
      if (x < cp.minX) cp.minX = x;
      if (x > cp.maxX) cp.maxX = x;
      if (y < cp.minY) cp.minY = y;
      if (y > cp.maxY) cp.maxY = y;
      if (x > 0 && mask[j - 1] && !seen[j - 1]) { seen[j - 1] = 1; stack.push(j - 1); }
      if (x < gw - 1 && mask[j + 1] && !seen[j + 1]) { seen[j + 1] = 1; stack.push(j + 1); }
      if (y > 0 && mask[j - gw] && !seen[j - gw]) { seen[j - gw] = 1; stack.push(j - gw); }
      if (y < gh - 1 && mask[j + gw] && !seen[j + gw]) { seen[j + gw] = 1; stack.push(j + gw); }
    }
    out.push(cp);
  }
  return out;
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
        // 隙間を横切る直交壁があれば、別の部屋の壁なので繋げない
        const crossed = lines.some((p) => p.h !== cur.h && p.c > cur.s1 && p.c < o.s0 &&
          p.s0 - p.t / 2 <= cur.c && p.s1 + p.t / 2 >= cur.c);
        if (crossed) continue;
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
