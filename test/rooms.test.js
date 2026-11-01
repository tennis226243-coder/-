import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyColor, detectRoomsByColor, floorFromName, normalizeRoomFloor } from '../src/rooms.js';
import { polygonArea, normalizeProject } from '../src/model.js';

test('部屋名から床材を推定', () => {
  assert.equal(floorFromName('和室 6帖'), 'tatami');
  assert.equal(floorFromName('浴室'), 'tile-bath');
  assert.equal(floorFromName('洗面・脱衣'), 'tile');
  assert.equal(floorFromName('トイレ'), 'tile');
  assert.equal(floorFromName('LDK'), null);
  assert.equal(normalizeRoomFloor('nope', '和室'), 'tatami');
  assert.equal(normalizeRoomFloor('wood-dark', '和室'), 'wood-dark');
  assert.equal(normalizeRoomFloor(undefined, '洋室'), 'default');
});

test('間取り図の塗り色の分類', () => {
  assert.equal(classifyColor(200, 225, 170), 1); // 畳の緑
  assert.equal(classifyColor(180, 220, 240), 2); // 水回りの水色
  assert.equal(classifyColor(240, 220, 170), 3); // 洋室のベージュ
  assert.equal(classifyColor(255, 255, 255), 0); // 白
  assert.equal(classifyColor(30, 30, 30), 0); // 壁の黒
  assert.equal(classifyColor(215, 215, 215), 4); // 玄関・バルコニーの薄いグレー（広さで区別）
  assert.equal(classifyColor(150, 150, 150), 0); // 濃いグレー
  assert.equal(classifyColor(234, 88, 12), 0); // 濃いオレンジの線
});

function makeImage(width, height) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const fill = (x0, y0, x1, y1, [r, g, b]) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
    }
  };
  return { img: { data, width, height }, fill };
}

test('色から和室・水回り・洋室の範囲を推定する（文字や畳の目があっても 1 部屋）', () => {
  const { img, fill } = makeImage(880, 660);
  const black = [30, 30, 30];
  // 和室（緑、畳の目の線あり）
  fill(40, 40, 340, 340, [200, 225, 170]);
  for (let x = 40; x < 340; x += 75) fill(x, 40, x + 2, 340, [150, 180, 120]);
  // 水回り（水色、中に白い浴槽の記号）
  fill(400, 40, 600, 240, [180, 220, 240]);
  fill(430, 70, 520, 140, [255, 255, 255]);
  // L 字の LDK（ベージュ、中に黒い文字）
  fill(40, 400, 840, 620, [240, 220, 170]);
  fill(640, 260, 840, 400, [240, 220, 170]);
  fill(400, 500, 460, 512, black);
  // 壁の線
  fill(0, 360, 600, 380, black);

  const rooms = detectRoomsByColor(img);
  const byKind = Object.fromEntries([1, 2, 3].map((k) => [k, rooms.filter((r) => r.kind === k)]));
  assert.equal(byKind[1].length, 1, 'tatami');
  assert.equal(byKind[2].length, 1, 'wet');
  assert.equal(byKind[3].length, 1, 'western');
  const area = (r) => polygonArea(r.points);
  // 面積は実際の塗り範囲の ±15% 以内
  assert.ok(Math.abs(area(byKind[1][0]) - 300 * 300) / (300 * 300) < 0.15, `tatami ${area(byKind[1][0])}`);
  assert.ok(Math.abs(area(byKind[2][0]) - 200 * 200) / (200 * 200) < 0.15, `wet ${area(byKind[2][0])}`);
  const ldk = 800 * 220 + 200 * 140;
  assert.ok(Math.abs(area(byKind[3][0]) - ldk) / ldk < 0.15, `ldk ${area(byKind[3][0])}`);
  // L 字は 4 点より多い多角形
  assert.ok(byKind[3][0].points.length >= 6, `L shape points ${byKind[3][0].points.length}`);
});

test('色のない白黒の図面では部屋を推定しない', () => {
  const { img, fill } = makeImage(400, 300);
  fill(50, 50, 350, 60, [20, 20, 20]);
  assert.equal(detectRoomsByColor(img).length, 0);
});

test('部屋の床材は保存データに残る', () => {
  const p = normalizeProject({
    walls: [],
    rooms: [
      { name: '和室', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] },
      { name: 'LDK', floor: 'wood-dark', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] },
    ],
  });
  assert.equal(p.rooms[0].floor, 'tatami');
  assert.equal(p.rooms[1].floor, 'wood-dark');
});
