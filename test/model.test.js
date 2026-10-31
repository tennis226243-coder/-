import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wallSegments, normalizeProject, projectOnSegment, snapOrtho, polygonArea } from '../src/model.js';

const wall = { id: 'w1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, thickness: 0.12 };

test('開口部なしの壁は1区間', () => {
  const r = wallSegments(wall, [], 0.01, 2.4);
  assert.equal(r.length, 4);
  assert.deepEqual(r.segments, [{ s0: 0, s1: 4, bottom: 0, top: 2.4 }]);
});

test('ドアと窓で壁が分割される', () => {
  const openings = [
    { id: 'd', wallId: 'w1', t: 0.25, type: 'door', width: 0.8, height: 2.0, sill: 0 },
    { id: 'x', wallId: 'w1', t: 0.75, type: 'window', width: 1.0, height: 1.0, sill: 0.9 },
    { id: 'z', wallId: 'other', t: 0.5, type: 'door', width: 1, height: 2, sill: 0 },
  ];
  const r = wallSegments(wall, openings, 0.01, 2.4);
  const round = (v) => Math.round(v * 1000) / 1000;
  const segs = r.segments.map((s) => [s.s0, s.s1, s.bottom, s.top].map(round));
  assert.deepEqual(segs, [
    [0, 0.6, 0, 2.4],
    [0.6, 1.4, 2, 2.4], // ドア上の垂れ壁
    [1.4, 2.5, 0, 2.4],
    [2.5, 3.5, 0, 0.9], // 窓下の腰壁
    [2.5, 3.5, 1.9, 2.4], // 窓上
    [3.5, 4, 0, 2.4],
  ]);
  assert.equal(r.openings.length, 2);
});

test('重なった開口部と壁端のはみ出しはクランプされる', () => {
  const openings = [
    { id: 'a', wallId: 'w1', t: 0.05, type: 'door', width: 1, height: 2, sill: 0 },
    { id: 'b', wallId: 'w1', t: 0.1, type: 'door', width: 1, height: 2, sill: 0 },
  ];
  const r = wallSegments(wall, openings, 0.01, 2.4);
  for (const s of r.segments) assert.ok(s.s0 >= 0 && s.s1 <= 4 && s.s1 > s.s0);
  const full = r.segments.filter((s) => s.bottom === 0 && s.top === 2.4);
  assert.equal(full.length, 1);
  assert.ok(Math.abs(full[0].s0 - 0.9) < 1e-9);
});

test('normalizeProject は不正値を補正し孤立した開口部を除く', () => {
  const p = normalizeProject({
    scale: -1,
    walls: [{ id: 1, a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }],
    openings: [{ wallId: 1, t: 2 }, { wallId: 99 }],
    rooms: [{ points: [{ x: 0, y: 0 }] }],
  });
  assert.equal(p.scale, 0.01);
  assert.equal(p.walls[0].id, '1');
  assert.equal(p.openings.length, 1);
  assert.equal(p.openings[0].t, 1);
  assert.equal(p.rooms.length, 0);
  assert.throws(() => normalizeProject({}));
});

test('幾何ユーティリティ', () => {
  const r = projectOnSegment({ x: 50, y: 30 }, { x: 0, y: 0 }, { x: 100, y: 0 });
  assert.equal(r.t, 0.5);
  assert.equal(r.distance, 30);
  assert.deepEqual(snapOrtho({ x: 0, y: 0 }, { x: 100, y: 5 }), { x: 100, y: 0 });
  assert.deepEqual(snapOrtho({ x: 0, y: 0 }, { x: 100, y: 60 }), { x: 100, y: 60 });
  assert.equal(polygonArea([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }]), 50);
});
