import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, normalizeProject } from '../src/model.js';
import { createFurniture, hitFurniture, furnitureCorners, normalizeFurniture, FURNITURE_CATALOG } from '../src/furniture.js';
import { ensureVariants, addVariant, switchVariant, diffLayouts, variantProject, summarize } from '../src/variants.js';

test('カタログから家具を作る', () => {
  const f = createFurniture('sofa3', { x: 100, y: 50 });
  assert.equal(f.name, 'ソファ（3人）');
  assert.deepEqual([f.x, f.y, f.rot, f.w, f.d], [100, 50, 0, 1.9, 0.85]);
  assert.throws(() => createFurniture('nope', { x: 0, y: 0 }));
  assert.ok(FURNITURE_CATALOG.every((c) => c.w > 0 && c.d > 0 && c.h > 0));
});

test('回転した家具の当たり判定と四隅', () => {
  // 1px = 1cm、幅 2m × 奥行 1m を 90° 回転 → 縦長になる
  const f = { x: 0, y: 0, rot: 90, w: 2, d: 1 };
  assert.equal(hitFurniture(f, { x: 0, y: 90 }, 0.01), true);
  assert.equal(hitFurniture(f, { x: 90, y: 0 }, 0.01), false);
  const cs = furnitureCorners(f, 0.01).map((p) => [Math.round(p.x), Math.round(p.y)]);
  assert.deepEqual(cs, [[50, -100], [50, 100], [-50, 100], [-50, -100]]);
});

test('不正な家具データは除外・補正される', () => {
  const list = normalizeFurniture([
    { type: 'bed1', x: 10, y: 20, rot: -90, w: -1 },
    { type: 'unknown' },
    null,
  ]);
  assert.equal(list.length, 1);
  assert.equal(list[0].rot, 270);
  assert.equal(list[0].w, 1.0);
  assert.deepEqual(normalizeFurniture(undefined), []);
});

test('家具は案ごとに保持され、保存データにも残る', () => {
  const p = ensureVariants(createProject());
  const base = p.activeVariant;
  const plan = addVariant(p, '家具配置A');
  p.furniture.push(createFurniture('dining4', { x: 300, y: 200 }));
  switchVariant(p, base);
  assert.equal(p.furniture.length, 0);
  switchVariant(p, plan.id);
  assert.equal(p.furniture.length, 1);
  const d = diffLayouts(variantProject(p, base), variantProject(p, plan.id));
  assert.equal(d.addedFurniture.size, 1);
  assert.equal(summarize(variantProject(p, plan.id), p.scale).furniture, 1);
  const loaded = normalizeProject(JSON.parse(JSON.stringify(p)));
  assert.equal(loaded.furniture.length, 1);
  assert.equal(loaded.variants.find((v) => v.id === plan.id).furniture.length, 1);
});

test('家具のない古い保存データも読み込める', () => {
  const p = normalizeProject({ walls: [], variants: [{ id: 'v1', name: '現状', walls: [] }], activeVariant: 'v1' });
  assert.deepEqual(p.furniture, []);
  assert.deepEqual(p.variants[0].furniture, []);
});

test('推定した水回り・玄関に設備ユニットを部屋の大きさで置く', async () => {
  const { fixturesForRooms } = await import('../src/furniture.js');
  const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const list = fixturesForRooms([
    { name: '浴室', points: rect(0, 0, 200, 180) }, // 2.0 × 1.8m（横長）
    { name: 'トイレ', points: rect(300, 0, 380, 140) }, // 0.8 × 1.4m（縦長）
    { name: '洗面', points: rect(0, 300, 200, 420) }, // 2.0 × 1.2m
    { name: 'LDK', points: rect(0, 500, 600, 900) },
  ], 0.01);
  assert.deepEqual(list.map((f) => f.type), ['unitbath', 'toiletroom', 'washroom']);
  const [bath, wc, wash] = list;
  assert.equal(bath.rot, 0);
  assert.ok(Math.abs(bath.w - 1.96) < 1e-9 && Math.abs(bath.d - 1.76) < 1e-9);
  assert.deepEqual([bath.x, bath.y], [100, 90]);
  // 縦長のトイレは回転せず、奥行が長い辺
  assert.equal(wc.rot, 0);
  assert.ok(Math.abs(wc.d - 1.36) < 1e-9 && Math.abs(wc.w - 0.76) < 1e-9);
  // 洗面所は奥の壁際に寄せる
  assert.ok(wash.y < 360, `wash y ${wash.y}`);
  assert.ok(list.every((f) => f.auto));
});
