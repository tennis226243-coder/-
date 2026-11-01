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
