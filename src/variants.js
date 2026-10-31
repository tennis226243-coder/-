// リノベーション案（同じ間取り画像・縮尺を共有する複数のレイアウト）の管理と比較
// project.walls / openings / rooms などのトップレベルは「編集中の案」で、
// project.variants には各案のスナップショットを保存する。
import { uid, wallLength, polygonArea } from './model.js';

export const LAYOUT_KEYS = ['walls', 'openings', 'rooms', 'wallHeight', 'wallThickness'];

const clone = (v) => JSON.parse(JSON.stringify(v));

/** 案として保存する部分だけを複製 */
export function extractLayout(project) {
  const out = {};
  for (const k of LAYOUT_KEYS) out[k] = clone(project[k]);
  return out;
}

/** 案が 1 つもなければ現在の状態を「現状」として登録する */
export function ensureVariants(project) {
  if (!project.variants?.length) {
    const id = uid('v');
    project.variants = [{ id, name: '現状', ...extractLayout(project) }];
    project.activeVariant = id;
  }
  if (!project.variants.some((v) => v.id === project.activeVariant)) {
    project.activeVariant = project.variants[0].id;
  }
  return project;
}

/** 編集中の内容を、選択中の案に書き戻す */
export function syncActive(project) {
  ensureVariants(project);
  const v = project.variants.find((x) => x.id === project.activeVariant);
  Object.assign(v, extractLayout(project));
}

export function activeVariant(project) {
  ensureVariants(project);
  return project.variants.find((x) => x.id === project.activeVariant);
}

export function switchVariant(project, id) {
  syncActive(project);
  const v = project.variants.find((x) => x.id === id);
  if (!v) return;
  for (const k of LAYOUT_KEYS) project[k] = clone(v[k]);
  project.activeVariant = id;
}

/** 編集中の案を複製して新しい案を作り、それに切り替える */
export function addVariant(project, name) {
  syncActive(project);
  const v = { id: uid('v'), name, ...extractLayout(project) };
  project.variants.push(v);
  project.activeVariant = v.id;
  return v;
}

export function removeVariant(project, id) {
  ensureVariants(project);
  if (project.variants.length <= 1) return false;
  if (project.activeVariant === id) {
    const other = project.variants.find((x) => x.id !== id);
    switchVariant(project, other.id);
  }
  project.variants = project.variants.filter((x) => x.id !== id);
  return true;
}

export function renameVariant(project, id, name) {
  const v = project.variants?.find((x) => x.id === id);
  if (v && name) v.name = name;
}

/** 案のデータに、共有の画像・縮尺を加えた「表示用プロジェクト」 */
export function variantProject(project, id) {
  syncActive(project);
  const v = project.variants.find((x) => x.id === id) ?? activeVariant(project);
  return { ...project, ...extractLayout(v) };
}

const wallKey = (w) => [w.a.x, w.a.y, w.b.x, w.b.y, w.thickness].map((n) => Math.round(n * 10)).join(',');
const openingKey = (o) => [o.wallId, Math.round(o.t * 1000), o.type, o.width, o.height, o.sill].join(',');

/**
 * 2 つの案の差分。複製した案は ID を引き継ぐので、ID と形状が一致する物を「変更なし」とみなす。
 * @returns {{ removedWalls:Set, addedWalls:Set, removedOpenings:Set, addedOpenings:Set }}
 */
export function diffLayouts(a, b) {
  const diff = (listA, listB, key) => {
    const mapB = new Map(listB.map((x) => [x.id, key(x)]));
    const mapA = new Map(listA.map((x) => [x.id, key(x)]));
    return {
      removed: new Set(listA.filter((x) => mapB.get(x.id) !== key(x)).map((x) => x.id)),
      added: new Set(listB.filter((x) => mapA.get(x.id) !== key(x)).map((x) => x.id)),
    };
  };
  const w = diff(a.walls, b.walls, wallKey);
  const o = diff(a.openings, b.openings, openingKey);
  return { removedWalls: w.removed, addedWalls: w.added, removedOpenings: o.removed, addedOpenings: o.added };
}

/** 比較表用の集計（m, ㎡） */
export function summarize(layout, scale) {
  const area = layout.rooms.reduce((s, r) => s + polygonArea(r.points), 0) * scale * scale;
  return {
    walls: layout.walls.length,
    wallLength: layout.walls.reduce((s, w) => s + wallLength(w), 0) * scale,
    doors: layout.openings.filter((o) => o.type === 'door').length,
    windows: layout.openings.filter((o) => o.type === 'window').length,
    rooms: layout.rooms.length,
    roomList: layout.rooms.map((r) => ({ name: r.name, area: polygonArea(r.points) * scale * scale })),
    area,
  };
}
