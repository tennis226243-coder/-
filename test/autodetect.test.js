import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectWalls } from '../src/autodetect.js';

function makeImage(width, height) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const fill = (x0, y0, x1, y1, v = 0) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = v;
      }
  };
  return { img: { data, width, height }, fill };
}

test('四角い部屋の外壁4本を検出し、角は中心線で接続される', () => {
  const { img, fill } = makeImage(400, 300);
  // 厚さ 10px の外壁（外形 50..350 x 50..250）
  fill(50, 50, 350, 60);
  fill(50, 240, 350, 250);
  fill(50, 50, 60, 250);
  fill(340, 50, 350, 250);
  // 細い線（寸法線・文字の代わり）は無視されるべき
  fill(100, 150, 300, 151);
  fill(200, 100, 201, 200);

  const walls = detectWalls(img, { minThickness: 6 });
  assert.equal(walls.length, 4);
  const horiz = walls.filter((w) => w.a.y === w.b.y);
  const vert = walls.filter((w) => w.a.x === w.b.x);
  assert.equal(horiz.length, 2);
  assert.equal(vert.length, 2);
  for (const w of walls) {
    assert.ok(Math.abs(w.thicknessPx - 10) <= 2, `thickness ${w.thicknessPx}`);
  }
  const top = horiz.sort((p, q) => p.a.y - q.a.y)[0];
  assert.ok(Math.abs(top.a.y - 55) <= 2);
  // 端点は縦壁の中心線 (x=55, 345) に揃う
  const xs = [top.a.x, top.b.x].sort((p, q) => p - q);
  assert.ok(Math.abs(xs[0] - 55) <= 2, `x0 ${xs[0]}`);
  assert.ok(Math.abs(xs[1] - 345) <= 2, `x1 ${xs[1]}`);
});

test('T字の間仕切り壁とドア開口の隙間', () => {
  const { img, fill } = makeImage(400, 300);
  fill(50, 50, 350, 60);
  fill(50, 240, 350, 250);
  fill(50, 50, 60, 250);
  fill(340, 50, 350, 250);
  // 中央の間仕切り（上から 60..120、隙間 120..170、170..240）
  fill(196, 60, 204, 120);
  fill(196, 170, 204, 240);
  const walls = detectWalls(img, { minThickness: 6 });
  const inner = walls.filter((w) => w.a.x === w.b.x && Math.abs(w.a.x - 200) <= 2);
  assert.equal(inner.length, 2);
  const ys = inner.map((w) => [Math.min(w.a.y, w.b.y), Math.max(w.a.y, w.b.y)]).sort((p, q) => p[0] - q[0]);
  // 上端は外壁の中心線に接続、ドア側の自由端は厚み/2 だけ戻る
  assert.ok(Math.abs(ys[0][0] - 55) <= 3, `top ${ys[0][0]}`);
  assert.ok(ys[0][1] <= 120 && ys[0][1] >= 112, `gap start ${ys[0][1]}`);
  assert.ok(Math.abs(ys[1][1] - 245) <= 3, `bottom ${ys[1][1]}`);
});

test('白紙の画像では壁なし', () => {
  const { img } = makeImage(200, 200);
  assert.equal(detectWalls(img).length, 0);
});

test('隙間を挟む壁を統合し、窓記号のある隙間は窓・空の隙間はドアにする', async () => {
  const { findOpenings } = await import('../src/autodetect.js');
  const { img, fill } = makeImage(500, 300);
  // 上の外壁: 50..150 | 窓 150..250 | 250..330 | ドア 330..410 | 410..450 （厚さ 10, y=45..55）
  fill(50, 45, 150, 55);
  fill(250, 45, 330, 55);
  fill(410, 45, 450, 55);
  // 窓記号: 3 本線
  for (const y of [46, 50, 54]) fill(150, y, 250, y + 1);
  // 縦壁（角の接続用）
  fill(50, 45, 60, 250);
  fill(440, 45, 450, 250);
  fill(50, 240, 450, 250);
  const walls = detectWalls(img, { minThickness: 6 });
  const r = findOpenings(walls, img);
  assert.equal(r.walls.length, 4);
  assert.equal(r.openings.length, 2);
  const byType = Object.fromEntries(r.openings.map((o) => [o.type, o]));
  const top = r.walls[byType.window.wallIndex];
  assert.equal(byType.window.wallIndex, byType.door.wallIndex);
  const len = Math.abs(top.b.x - top.a.x);
  const center = (o) => Math.min(top.a.x, top.b.x) + o.t * len;
  assert.ok(Math.abs(center(byType.window) - 200) <= 3, `window center ${center(byType.window)}`);
  assert.ok(Math.abs(byType.window.widthPx - 100) <= 3, `window width ${byType.window.widthPx}`);
  assert.ok(Math.abs(center(byType.door) - 370) <= 3, `door center ${center(byType.door)}`);
  assert.ok(Math.abs(byType.door.widthPx - 80) <= 3);
});

test('輪郭がギザギザでノイズのある壁（JPEG 風）でも途切れずに検出する', () => {
  const { img, fill } = makeImage(600, 400);
  // 疑似乱数（再現性のため固定シード）
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  // 各列/行で ±1px 揺れる厚さ 8px の壁
  for (let x = 50; x < 550; x++) fill(x, 46 + Math.round(rnd() * 2 - 1), x + 1, 54 + Math.round(rnd() * 2 - 1), 40);
  for (let x = 50; x < 550; x++) fill(x, 346 + Math.round(rnd() * 2 - 1), x + 1, 354 + Math.round(rnd() * 2 - 1), 40);
  for (let y = 50; y < 350; y++) fill(46 + Math.round(rnd() * 2 - 1), y, 54 + Math.round(rnd() * 2 - 1), y + 1, 40);
  for (let y = 50; y < 350; y++) fill(546 + Math.round(rnd() * 2 - 1), y, 554 + Math.round(rnd() * 2 - 1), y + 1, 40);
  // 塩胡椒ノイズ
  for (let i = 0; i < 3000; i++) {
    const x = Math.floor(rnd() * 600);
    const y = Math.floor(rnd() * 400);
    fill(x, y, x + 1, y + 1, rnd() < 0.5 ? 0 : 255);
  }
  const walls = detectWalls(img, { minThickness: 5 });
  assert.equal(walls.length, 4, JSON.stringify(walls));
  for (const w of walls) {
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    assert.ok(len > 290, `wall too short: ${len}`);
  }
});

test('直交する壁をまたいで隙間を繋がない', async () => {
  const { findOpenings } = await import('../src/autodetect.js');
  const { img, fill } = makeImage(500, 300);
  // 左右の部屋の上壁は同一直線上だが、間に縦の壁がある（上壁は 150..250 で途切れている）
  fill(50, 95, 150, 105);
  fill(250, 95, 450, 105);
  fill(195, 60, 205, 250); // 隙間を横切る縦壁
  const walls = detectWalls(img, { minThickness: 6 });
  const r = findOpenings(walls, img);
  assert.equal(r.openings.length, 0);
});

test('細い壁（4px）の図面でも壁厚を推定して検出する', async () => {
  const { estimateWallThickness } = await import('../src/autodetect.js');
  const { img, fill } = makeImage(1000, 800);
  // 厚さ 4px の外壁と間仕切り
  fill(100, 100, 900, 104);
  fill(100, 700, 900, 704);
  fill(100, 100, 104, 704);
  fill(896, 100, 900, 704);
  fill(500, 100, 504, 400);
  // 文字のような短い線（2px）と寸法線（1px）
  for (let i = 0; i < 20; i++) fill(200 + i * 12, 300, 202 + i * 12, 312);
  fill(100, 60, 900, 61);
  assert.equal(estimateWallThickness(img), 4);
  const walls = detectWalls(img);
  assert.equal(walls.length, 5, JSON.stringify(walls.map((w) => [w.a, w.b])));
  // 推定なし（画像サイズから 5px）だと細い壁は消えてしまう
  assert.ok(detectWalls(img, { minThickness: 5 }).length < 5);
});

test('太い壁の図面では大きな厚さを推定する', async () => {
  const { estimateWallThickness } = await import('../src/autodetect.js');
  const { img, fill } = makeImage(600, 400);
  fill(50, 50, 550, 66);
  fill(50, 334, 550, 350);
  fill(50, 50, 66, 350);
  fill(534, 50, 550, 350);
  const t = estimateWallThickness(img);
  assert.ok(Math.abs(t - 16) <= 1, `t=${t}`);
  assert.equal(detectWalls(img).length, 4);
});
