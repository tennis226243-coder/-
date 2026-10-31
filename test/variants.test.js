import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, normalizeProject } from '../src/model.js';
import {
  ensureVariants, addVariant, switchVariant, removeVariant, renameVariant,
  variantProject, diffLayouts, summarize, activeVariant,
} from '../src/variants.js';

function sampleProject() {
  const p = createProject();
  p.walls = [
    { id: 'w1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, thickness: 0.12 },
    { id: 'w2', a: { x: 200, y: 0 }, b: { x: 200, y: 300 }, thickness: 0.12 },
  ];
  p.openings = [{ id: 'o1', wallId: 'w1', t: 0.5, type: 'window', width: 1, height: 1, sill: 0.9 }];
  p.rooms = [{ id: 'r1', name: 'LDK', points: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 300 }, { x: 0, y: 300 }], color: '#fff' }];
  return p;
}

test('最初の案は「現状」として作られる', () => {
  const p = ensureVariants(sampleProject());
  assert.equal(p.variants.length, 1);
  assert.equal(activeVariant(p).name, '現状');
  assert.equal(p.variants[0].walls.length, 2);
});

test('案を複製して編集しても、元の案は変わらない。切り替えで内容が入れ替わる', () => {
  const p = ensureVariants(sampleProject());
  const base = p.activeVariant;
  const plan = addVariant(p, '案A');
  assert.equal(p.activeVariant, plan.id);
  // 案A で間仕切り壁を撤去
  p.walls = p.walls.filter((w) => w.id !== 'w2');
  switchVariant(p, base);
  assert.equal(p.walls.length, 2, '現状に戻すと壁は 2 本');
  switchVariant(p, plan.id);
  assert.equal(p.walls.length, 1, '案A は壁 1 本');
});

test('差分：撤去・追加された壁と開口部', () => {
  const p = ensureVariants(sampleProject());
  const base = p.activeVariant;
  const plan = addVariant(p, '案A');
  p.walls = p.walls.filter((w) => w.id !== 'w2');
  p.walls.push({ id: 'w3', a: { x: 0, y: 150 }, b: { x: 100, y: 150 }, thickness: 0.1 });
  p.walls[0] = { ...p.walls[0], thickness: 0.2 }; // 形状変更は撤去＋追加とみなす
  p.openings[0] = { ...p.openings[0], type: 'door', sill: 0 };
  const d = diffLayouts(variantProject(p, base), variantProject(p, plan.id));
  assert.deepEqual([...d.removedWalls].sort(), ['w1', 'w2']);
  assert.deepEqual([...d.addedWalls].sort(), ['w1', 'w3']);
  assert.deepEqual([...d.removedOpenings], ['o1']);
  assert.deepEqual([...d.addedOpenings], ['o1']);
});

test('同じ内容の案どうしは差分なし', () => {
  const p = ensureVariants(sampleProject());
  const base = p.activeVariant;
  const plan = addVariant(p, '案A');
  const d = diffLayouts(variantProject(p, base), variantProject(p, plan.id));
  assert.equal(d.removedWalls.size + d.addedWalls.size + d.removedOpenings.size + d.addedOpenings.size, 0);
});

test('最後の案は削除できない。編集中の案を削除すると別の案に切り替わる', () => {
  const p = ensureVariants(sampleProject());
  const base = p.activeVariant;
  assert.equal(removeVariant(p, base), false);
  const plan = addVariant(p, '案A');
  p.walls = [];
  assert.equal(removeVariant(p, plan.id), true);
  assert.equal(p.activeVariant, base);
  assert.equal(p.walls.length, 2);
  renameVariant(p, base, 'Before');
  assert.equal(activeVariant(p).name, 'Before');
});

test('集計：面積・壁の長さ・開口部数', () => {
  const s = summarize(sampleProject(), 0.01);
  assert.equal(s.walls, 2);
  assert.ok(Math.abs(s.wallLength - 7) < 1e-9);
  assert.equal(s.windows, 1);
  assert.equal(s.doors, 0);
  assert.ok(Math.abs(s.area - 6) < 1e-9);
});

test('保存データの読み込みで案が保持される', () => {
  const p = ensureVariants(sampleProject());
  addVariant(p, '案A');
  p.walls = [];
  const loaded = normalizeProject(JSON.parse(JSON.stringify(p)));
  assert.equal(loaded.variants.length, 2);
  assert.equal(loaded.variants[1].name, '案A');
  assert.equal(loaded.activeVariant, p.activeVariant);
  assert.equal(loaded.walls.length, 0);
});
