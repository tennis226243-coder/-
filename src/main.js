import { createProject, normalizeProject, uid, wallLength, polygonArea, OPENING_DEFAULTS } from './model.js';
import { detectWalls, findOpenings } from './autodetect.js';
import { Editor2D } from './editor.js';
import { Viewer3D } from './viewer3d.js';
import { drawSamplePlan, SAMPLE_SCALE } from './sample.js';

const $ = (sel) => document.querySelector(sel);
const STORAGE_KEY = 'madori3d.project';

let project = loadAutosave() ?? createProject();
const undoStack = [];
const redoStack = [];
let pending = null;

// ---------- 2D / 3D ビュー ----------
const viewer = new Viewer3D($('#view-3d'));
const editor = new Editor2D($('#plan-canvas'), {
  getProject: () => project,
  beginEdit: () => { pending = snapshot(); },
  cancelEdit: () => { pending = null; },
  abortEdit: () => {
    if (!pending) return;
    restore(pending);
    pending = null;
    refresh();
  },
  changed: ({ live } = {}) => {
    if (!live && pending) {
      pushUndo(pending);
      pending = null;
    }
    refresh({ live });
  },
  selectionChanged: (sel) => renderSelection(sel),
  calibrate: (px) => openCalibration(px),
  status: (t) => setStatus(t),
});
viewer.onWalkModeChange = (on) => {
  $('#walk').classList.toggle('active', on);
  $('#walk-help').hidden = !on;
};

// ---------- 履歴 ----------
function snapshot() {
  return { json: JSON.stringify({ ...project, image: null }), image: project.image };
}
function restore(s) {
  project = { ...JSON.parse(s.json), image: s.image };
}
function pushUndo(s) {
  undoStack.push(s);
  if (undoStack.length > 100) undoStack.shift();
  redoStack.length = 0;
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  afterRestore();
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  afterRestore();
}
function afterRestore() {
  editor.select(null);
  syncImage();
  syncInputs();
  refresh();
}
/** 任意の変更を履歴付きで実行 */
function edit(fn) {
  pushUndo(snapshot());
  fn();
  refresh();
}

// ---------- 再描画 ----------
let raf3d = null;
let saveTimer = null;
function refresh({ live = false } = {}) {
  editor.render();
  if (!raf3d) {
    raf3d = requestAnimationFrame(() => {
      raf3d = null;
      viewer.update(project, viewOptions());
    });
  }
  if (!live) {
    renderSelection(editor.selection);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(autosave, 400);
  }
  $('#undo').disabled = !undoStack.length;
  $('#redo').disabled = !redoStack.length;
  $('#empty-2d').hidden = !!(project.image || project.walls.length || project.rooms.length);
  const area = project.rooms.reduce((s, r) => s + polygonArea(r.points), 0) * project.scale ** 2;
  $('#stats').textContent =
    `壁 ${project.walls.length} ・ ドア ${project.openings.filter((o) => o.type === 'door').length}` +
    ` ・ 窓 ${project.openings.filter((o) => o.type === 'window').length} ・ 部屋 ${project.rooms.length}` +
    (area ? `（延床 ${area.toFixed(1)}㎡）` : '');
}

function viewOptions() {
  return {
    showPlanImage: $('#show-plan').checked,
    showRooms: $('#show-rooms').checked,
    wallColor: $('#wall-color').value,
    wallOpacity: Number($('#wall-opacity').value),
  };
}

function setStatus(text) {
  $('#status').textContent = text;
}

// ---------- 画像 ----------
function syncImage() {
  if (!project.image) {
    editor.setImage(null);
    return;
  }
  const img = new Image();
  img.onload = () => editor.setImage(img);
  img.src = project.image.dataUrl;
}

function loadImageFromBlob(blob) {
  if (!blob?.type.startsWith('image/')) {
    setStatus('画像ファイルを選択してください');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => setPlanImage(reader.result);
  reader.readAsDataURL(blob);
}

function setPlanImage(dataUrl, { scale, detect = false } = {}) {
  const img = new Image();
  img.onload = () => {
    edit(() => {
      project.image = { dataUrl, width: img.naturalWidth, height: img.naturalHeight };
      if (scale) project.scale = scale;
    });
    editor.setImage(img);
    editor.fit();
    viewer.hasFitted = false;
    syncInputs();
    if (detect) runDetection(img);
    else setStatus('画像を読み込みました。縮尺を合わせてから「壁を自動検出」を押してください');
  };
  img.onerror = () => setStatus('画像を読み込めませんでした');
  img.src = dataUrl;
}

function runDetection(img = editor.image) {
  if (!img) {
    setStatus('先に間取り図の画像を読み込んでください');
    return;
  }
  setStatus('壁を検出しています…');
  // 大きな画像は縮小して検出し、座標を元に戻す
  const maxDim = 1600;
  const f = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * f);
  c.height = Math.round(img.naturalHeight * f);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, c.width, c.height);
  const minThick = Number($('#min-thick').value);
  const imageData = g.getImageData(0, 0, c.width, c.height);
  const threshold = Number($('#threshold').value);
  let found = detectWalls(imageData, { threshold, minThickness: minThick > 0 ? minThick * f : undefined });
  let foundOpenings = [];
  if ($('#detect-openings').checked) {
    ({ walls: found, openings: foundOpenings } = findOpenings(found, imageData, { threshold }));
  }
  let doors = 0;
  let windows = 0;
  edit(() => {
    if ($('#detect-replace').checked) {
      const ids = new Set(project.walls.map((w) => w.id));
      project.walls = [];
      project.openings = project.openings.filter((o) => !ids.has(o.wallId));
    }
    const ids = found.map((w) => {
      const id = uid('w');
      const thicknessM = (w.thicknessPx / f) * project.scale;
      project.walls.push({
        id,
        a: { x: w.a.x / f, y: w.a.y / f },
        b: { x: w.b.x / f, y: w.b.y / f },
        thickness: clamp(round2(thicknessM), 0.05, 0.4),
      });
      return id;
    });
    for (const o of foundOpenings) {
      const d = OPENING_DEFAULTS[o.type];
      project.openings.push({
        ...d,
        id: uid('o'),
        wallId: ids[o.wallIndex],
        t: o.t,
        type: o.type,
        width: round2((o.widthPx / f) * project.scale),
      });
      if (o.type === 'door') doors++;
      else windows++;
    }
  });
  viewer.hasFitted = false;
  // 2D だけの表示だと 3D 化されたことに気付きにくいので分割表示にする
  if (found.length && $('.views').dataset.view === '2d') setView('split');
  setStatus(found.length
    ? `壁 ${found.length} 本・ドア ${doors} 箇所・窓 ${windows} 箇所を検出しました。ツールで修正・追加できます`
    : '壁を検出できませんでした。詳細設定の明るさ・壁厚を調整してください');
}

// ---------- 縮尺 ----------
const calibDialog = $('#calib-dialog');
let calibPx = 0;
function openCalibration(px) {
  calibPx = px;
  $('#calib-px').textContent = px.toFixed(0);
  $('#calib-len').value = (px * project.scale).toFixed(2);
  calibDialog.showModal();
  $('#calib-len').select();
}
calibDialog.addEventListener('close', () => {
  const len = Number($('#calib-len').value);
  if (calibDialog.returnValue === 'ok' && len > 0 && calibPx > 0) {
    edit(() => { project.scale = len / calibPx; });
    viewer.hasFitted = false;
    syncInputs();
    editor.setTool('select');
    updateToolButtons();
    setStatus(`縮尺を設定しました：1m = ${(1 / project.scale).toFixed(1)} px`);
  }
});

// ---------- 選択中の要素の編集 ----------
function renderSelection(sel) {
  const panel = $('#selection-panel');
  const fields = $('#sel-fields');
  const item = sel && findItem(sel);
  panel.hidden = !item;
  if (!item) return;
  fields.replaceChildren();
  const add = (label, value, onInput, attrs = {}) => {
    const row = document.createElement('label');
    row.className = 'row';
    row.append(label + ' ');
    const input = document.createElement('input');
    Object.assign(input, { type: 'number', step: 0.01, min: 0, value, ...attrs });
    input.addEventListener('focus', () => { pending = snapshot(); });
    input.addEventListener('change', () => {
      if (pending) { pushUndo(pending); pending = null; }
      refresh();
    });
    input.addEventListener('input', () => {
      const v = input.type === 'number' ? Number(input.value) : input.value;
      if (input.type === 'number' && !(v >= Number(attrs.min ?? 0))) return;
      onInput(v);
      refresh({ live: true });
    });
    row.append(input);
    if (attrs.unit !== '') row.append(` ${attrs.unit ?? 'm'}`);
    fields.append(row);
  };

  if (sel.kind === 'wall') {
    $('#sel-title').textContent = '壁';
    add('長さ', round2(wallLength(item) * project.scale), (v) => {
      // 始点を固定して終点を動かす
      const L = wallLength(item);
      if (L === 0 || v <= 0) return;
      const k = v / project.scale / L;
      item.b = { x: item.a.x + (item.b.x - item.a.x) * k, y: item.a.y + (item.b.y - item.a.y) * k };
    }, { min: 0.05 });
    add('厚さ', item.thickness, (v) => { item.thickness = v; }, { min: 0.02 });
  } else if (sel.kind === 'opening') {
    $('#sel-title').textContent = item.type === 'door' ? 'ドア' : '窓';
    const typeRow = document.createElement('div');
    typeRow.className = 'seg small';
    for (const [type, label] of [['door', 'ドア'], ['window', '窓']]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.classList.toggle('active', item.type === type);
      b.addEventListener('click', () => edit(() => {
        item.type = type;
        if (type === 'window' && item.sill === 0) item.sill = 0.9;
        if (type === 'door') item.sill = 0;
      }));
      typeRow.append(b);
    }
    fields.append(typeRow);
    add('幅', item.width, (v) => { item.width = v; }, { min: 0.1 });
    add('高さ', item.height, (v) => { item.height = v; }, { min: 0.1 });
    add('床からの高さ', item.sill, (v) => { item.sill = v; });
  } else if (sel.kind === 'room') {
    $('#sel-title').textContent = '部屋';
    add('名前', item.name, (v) => { item.name = v; }, { type: 'text', unit: '' });
    add('色', item.color, (v) => { item.color = v; }, { type: 'color', unit: '' });
    const area = polygonArea(item.points) * project.scale ** 2;
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = `面積 ${area.toFixed(2)}㎡（約 ${(area / 1.62).toFixed(1)} 畳）`;
    fields.append(p);
  }
}

function findItem(sel) {
  const list = { wall: project.walls, opening: project.openings, room: project.rooms }[sel.kind];
  return list?.find((x) => x.id === sel.id);
}

// ---------- 入力欄 ----------
function syncInputs() {
  $('#px-per-m').value = round2(1 / project.scale);
  $('#wall-height').value = project.wallHeight;
  $('#wall-thick').value = project.wallThickness;
}

$('#px-per-m').addEventListener('change', (e) => {
  const v = Number(e.target.value);
  if (v > 0) {
    edit(() => { project.scale = 1 / v; });
    viewer.hasFitted = false;
  }
});
$('#wall-height').addEventListener('change', (e) => {
  const v = Number(e.target.value);
  if (v > 0) edit(() => { project.wallHeight = v; });
});
$('#wall-thick').addEventListener('change', (e) => {
  const v = Number(e.target.value);
  if (v > 0) edit(() => { project.wallThickness = v; });
});
$('#apply-thick').addEventListener('click', () =>
  edit(() => { for (const w of project.walls) w.thickness = project.wallThickness; }));
for (const id of ['#wall-color', '#wall-opacity', '#show-plan', '#show-rooms']) {
  $(id).addEventListener('input', () => refresh({ live: true }));
}
$('#threshold').addEventListener('input', (e) => { $('#threshold-out').textContent = e.target.value; });

// ---------- ツール・表示切替 ----------
const TOOL_KEYS = { v: 'select', w: 'wall', d: 'door', n: 'window', r: 'room', m: 'calibrate', h: 'pan' };
function updateToolButtons() {
  for (const b of document.querySelectorAll('[data-tool]')) b.classList.toggle('active', b.dataset.tool === editor.tool);
}
for (const b of document.querySelectorAll('[data-tool]')) {
  b.addEventListener('click', () => { editor.setTool(b.dataset.tool); updateToolButtons(); });
}
function setView(mode) {
  $('.views').dataset.view = mode;
  for (const b of document.querySelectorAll('[data-view]')) b.classList.toggle('active', b.dataset.view === mode);
}
for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => setView(b.dataset.view));

window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, select, dialog')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redo();
  } else if (!e.ctrlKey && !e.metaKey && !e.altKey && TOOL_KEYS[e.key.toLowerCase()] && !viewer.walkMode) {
    editor.setTool(TOOL_KEYS[e.key.toLowerCase()]);
    updateToolButtons();
  }
});

$('#undo').addEventListener('click', undo);
$('#redo').addEventListener('click', redo);
$('#fit-2d').addEventListener('click', () => editor.fit());
$('#fit-3d').addEventListener('click', () => viewer.fitView());
$('#walk').addEventListener('click', () => viewer.setWalkMode(!viewer.walkMode));
$('#sel-delete').addEventListener('click', () => editor.deleteSelection());

// ---------- 読み込み ----------
$('#image-input').addEventListener('change', (e) => {
  loadImageFromBlob(e.target.files[0]);
  e.target.value = '';
});
$('#load-sample').addEventListener('click', () => {
  setPlanImage(drawSamplePlan().toDataURL('image/png'), { scale: SAMPLE_SCALE, detect: true });
});
$('#detect').addEventListener('click', () => runDetection());

const drop = $('#drop-zone');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragging'); });
drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('dragging');
  const file = e.dataTransfer.files[0];
  if (file?.name.endsWith('.json')) openProjectFile(file);
  else loadImageFromBlob(file);
});
window.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
  if (item) loadImageFromBlob(item.getAsFile());
});

// ---------- 保存・書き出し ----------
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('#save-json').addEventListener('click', () => {
  download(new Blob([JSON.stringify(project)], { type: 'application/json' }), 'madori.json');
});
$('#open-json').addEventListener('change', (e) => {
  if (e.target.files[0]) openProjectFile(e.target.files[0]);
  e.target.value = '';
});
async function openProjectFile(file) {
  try {
    const data = normalizeProject(JSON.parse(await file.text()));
    edit(() => { project = data; });
    afterRestore();
    viewer.hasFitted = false;
    editor.fit();
    setStatus(`${file.name} を開きました`);
  } catch (err) {
    setStatus(`読み込みに失敗しました：${err.message}`);
  }
}
$('#export-glb').addEventListener('click', async () => {
  try {
    const glb = await viewer.exportGLB();
    download(new Blob([glb], { type: 'model/gltf-binary' }), 'madori.glb');
    setStatus('3Dモデル (GLB) を書き出しました。Blender や Windows の 3D ビューアーなどで開けます');
  } catch (err) {
    setStatus(`書き出しに失敗しました：${err.message}`);
  }
});
$('#export-png').addEventListener('click', async () => {
  const blob = await (await fetch(viewer.screenshot())).blob();
  download(blob, 'madori-3d.png');
});
$('#clear-all').addEventListener('click', () => {
  if (!confirm('画像・壁・部屋をすべて消去します。よろしいですか？')) return;
  edit(() => { project = createProject(); });
  afterRestore();
});

function autosave() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch {
    // 画像が大きく容量を超えた場合は画像抜きで保存
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...project, image: null })); } catch { /* 保存不可 */ }
  }
}
function loadAutosave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeProject(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

const round2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------- 起動 ----------
syncInputs();
syncImage();
setView(window.innerWidth < 800 ? '2d' : 'split');
editor.setTool('select');
updateToolButtons();
refresh();
requestAnimationFrame(() => editor.fit());
setStatus(project.walls.length || project.image
  ? '前回の作業を復元しました'
  : '間取り図の画像を読み込むか、「サンプル間取りで試す」を押してください');

// テスト・デバッグ用
window.madori = { get project() { return project; }, editor, viewer };
