import {
  createProject, normalizeProject, uid, wallLength, polygonArea, OPENING_DEFAULTS, estimateScaleFromWalls,
} from './model.js';
import { detectWalls, findOpenings, estimateWallThickness } from './autodetect.js';
import { Editor2D } from './editor.js';
import { Viewer3D } from './viewer3d.js';
import { drawSamplePlan, SAMPLE_SCALE } from './sample.js';
import { FURNITURE_CATALOG, createFurniture } from './furniture.js';
import {
  ensureVariants, syncActive, switchVariant, addVariant, removeVariant, renameVariant,
  variantProject, diffLayouts, summarize,
} from './variants.js';

const $ = (sel) => document.querySelector(sel);
const STORAGE_KEY = 'madori3d.project';

let project = ensureVariants(loadAutosave() ?? createProject());
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
  project = ensureVariants({ ...JSON.parse(s.json), image: s.image });
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
    renderVariants();
    if ($('.views').dataset.view === 'compare') updateCompare();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(autosave, 400);
  }
  renderSteps();
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
    floorFinish: $('#floor-finish').value,
    showRooms: $('#show-rooms').checked,
    showFurniture: $('#show-furniture').checked,
    wallColor: $('#wall-color').value,
    wallOpacity: Number($('#wall-opacity').value),
  };
}

let toastTimer = null;
function setStatus(text) {
  $('#status').textContent = text;
  // スマホではページ下部のステータスが見えないので、一時的なお知らせとして表示する
  if (window.innerWidth < 800 && text) {
    const toast = $('#toast');
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
  }
}

/** 手順の完了マーク */
function renderSteps() {
  const done = {
    1: !!project.image,
    2: !!project.calibrated,
    3: project.walls.length > 0,
    4: (project.variants?.length ?? 0) > 1 || (project.furniture?.length ?? 0) > 0,
  };
  for (const [n, ok] of Object.entries(done)) $(`#step-${n}`)?.classList.toggle('done', ok);
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
  reader.onload = () => setPlanImage(reader.result, { detect: $('#auto-3d').checked });
  reader.readAsDataURL(blob);
}

function setPlanImage(dataUrl, { scale, detect = false } = {}) {
  const img = new Image();
  img.onload = () => {
    edit(() => {
      project.image = { dataUrl, width: img.naturalWidth, height: img.naturalHeight };
      // 新しい画像の縮尺は分からないので、指定がなければ未設定に戻す
      project.calibrated = !!scale;
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

let detectedOnce = false;
function runDetection(img = editor.image, { tuning = false } = {}) {
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
  const estimated = estimateWallThickness(imageData, threshold);
  $('#min-thick').placeholder = estimated ? `自動 ${Math.round(estimated / f)}` : '自動';
  let found = detectWalls(imageData, {
    threshold, minThickness: minThick > 0 ? minThick * f : undefined, estimatedThickness: estimated,
  });
  let foundOpenings = [];
  if ($('#detect-openings').checked) {
    ({ walls: found, openings: foundOpenings } = findOpenings(found, imageData, { threshold }));
  }
  let doors = 0;
  let windows = 0;
  // 縮尺が未設定なら、壁の外形が一般的な住戸の広さになるよう仮の縮尺を決める
  const provisional = !project.calibrated
    ? estimateScaleFromWalls(found.map((w) => ({ a: { x: w.a.x / f, y: w.a.y / f }, b: { x: w.b.x / f, y: w.b.y / f } })))
    : null;
  edit(() => {
    if (provisional) project.scale = provisional;
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
  detectedOnce = true;
  if (!tuning) viewer.hasFitted = false;
  // 2D だけの表示だと 3D 化されたことに気付きにくいので分割表示にする
  if (!tuning && found.length && $('.views').dataset.view === '2d') setView('split');
  if (provisional) syncInputs();
  setStatus(found.length
    ? `3D に変換しました（壁 ${found.length} 本・ドア ${doors} 箇所・窓 ${windows} 箇所）。` +
      (provisional
        ? '縮尺は仮の値（約 65㎡ と想定）です。「縮尺」ツールで寸法線の長さを合わせると実寸になります'
        : 'ツールで修正・追加できます')
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
    edit(() => { project.scale = len / calibPx; project.calibrated = true; });
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
  $('#delete-2d').hidden = !item;
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
  } else if (sel.kind === 'furniture') {
    $('#sel-title').textContent = item.name;
    const actions = document.createElement('div');
    actions.className = 'grid2';
    const button = (label, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', fn);
      actions.append(b);
    };
    button('↻ 右に90°', () => edit(() => { item.rot = (item.rot + 90) % 360; }));
    button('↺ 左に90°', () => edit(() => { item.rot = (item.rot + 270) % 360; }));
    button('複製', () => {
      const copy = { ...item, id: uid('f'), x: item.x + 0.3 / project.scale, y: item.y + 0.3 / project.scale };
      edit(() => project.furniture.push(copy));
      editor.select({ kind: 'furniture', id: copy.id });
    });
    fields.append(actions);
    add('名前', item.name, (v) => { item.name = v; }, { type: 'text', unit: '' });
    add('幅', item.w, (v) => { item.w = v; }, { min: 0.05 });
    add('奥行', item.d, (v) => { item.d = v; }, { min: 0.05 });
    add('高さ', item.h, (v) => { item.h = v; }, { min: 0.01 });
    add('回転', item.rot, (v) => { item.rot = ((v % 360) + 360) % 360; }, { step: 15, min: -360, unit: '°' });
    add('色', item.color, (v) => { item.color = v; }, { type: 'color', unit: '' });
  }
}

function findItem(sel) {
  const list = { wall: project.walls, opening: project.openings, room: project.rooms, furniture: project.furniture }[sel.kind];
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
    edit(() => { project.scale = 1 / v; project.calibrated = true; });
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
for (const id of ['#wall-color', '#wall-opacity', '#floor-finish', '#show-rooms', '#show-furniture']) {
  $(id).addEventListener('input', () => refresh({ live: true }));
}
$('#threshold').addEventListener('input', (e) => { $('#threshold-out').textContent = e.target.value; });
// 検出の設定を変えたら、その場で検出し直して結果を見せる
for (const id of ['#threshold', '#min-thick', '#detect-openings']) {
  $(id).addEventListener('change', () => {
    if (detectedOnce && editor.image && $('#detect-replace').checked) runDetection(editor.image, { tuning: true });
  });
}

// ---------- ツール・表示切替 ----------
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.closest?.('input, textarea, select, dialog')) {
    togglePalette();
  }
});
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
  if (mode === 'compare') requestAnimationFrame(() => updateCompare());
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
$('#delete-2d').addEventListener('click', () => editor.deleteSelection());

// ---------- 読み込み ----------
$('#image-input').addEventListener('change', (e) => {
  loadImageFromBlob(e.target.files[0]);
  e.target.value = '';
});
$('[data-action="sample"]').addEventListener('click', () => $('#load-sample').click());
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
  syncActive(project);
  download(new Blob([JSON.stringify(project)], { type: 'application/json' }), 'madori.json');
});
$('#open-json').addEventListener('change', (e) => {
  if (e.target.files[0]) openProjectFile(e.target.files[0]);
  e.target.value = '';
});
async function openProjectFile(file) {
  try {
    const data = ensureVariants(normalizeProject(JSON.parse(await file.text())));
    edit(() => { project = data; });
    afterRestore();
    viewer.hasFitted = false;
    editor.fit();
    setStatus(`${file.name} を開きました`);
  } catch (err) {
    setStatus(`読み込みに失敗しました：${err.message}`);
  }
}
const isAppleMobile = () => /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

async function export3D(format) {
  if (!project.walls.length) {
    setStatus('先に画像を読み込んで 3D に変換してください');
    return;
  }
  // 日本語のファイル名は環境によって保存できないので英数字にする（2 つ目以降の案は番号付き）
  const index = project.variants?.findIndex((v) => v.id === project.activeVariant) ?? 0;
  const name = index > 0 ? `madori-plan${index + 1}` : 'madori';
  setStatus('3D データを作成しています…');
  try {
    if (format === 'glb') {
      const glb = await viewer.exportGLB();
      download(new Blob([glb], { type: 'model/gltf-binary' }), `${name}.glb`);
      setStatus('3D データ (GLB) を保存しました。Blender や Windows の 3D ビューアーなどで開けます');
    } else if (format === 'usdz') {
      const usdz = await viewer.exportUSDZ();
      const blob = new Blob([usdz], { type: 'model/vnd.usdz+zip' });
      if (isAppleMobile()) {
        // iPhone / iPad ではそのまま AR クイックルックで開く
        const a = document.createElement('a');
        a.rel = 'ar';
        a.href = URL.createObjectURL(blob);
        a.append(document.createElement('img'));
        a.click();
        setStatus('AR で表示しています。床に向けて部屋を置いてみてください');
      } else {
        download(blob, `${name}.usdz`);
        setStatus('USDZ を保存しました。iPhone / iPad に送って開くと AR で表示できます');
      }
    } else if (format === 'obj') {
      download(new Blob([viewer.exportOBJ()], { type: 'text/plain' }), `${name}.obj`);
      setStatus('OBJ（形状のみ）を保存しました');
    }
  } catch (err) {
    setStatus(`書き出しに失敗しました：${err.message}`);
  }
}
for (const b of document.querySelectorAll('[data-export]')) {
  b.addEventListener('click', () => {
    toggleExportMenu(false);
    export3D(b.dataset.export);
  });
}
function toggleExportMenu(open = $('#export-menu').hidden) {
  $('#export-menu').hidden = !open;
  $('#export-menu-btn').setAttribute('aria-expanded', String(open));
}
$('#export-menu-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleExportMenu();
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.export-wrap')) toggleExportMenu(false);
});
$('#export-png').addEventListener('click', async () => {
  const blob = await (await fetch(viewer.screenshot())).blob();
  download(blob, 'madori-3d.png');
});
$('#clear-all').addEventListener('click', () => {
  if (!confirm('画像・壁・部屋をすべて消去します。よろしいですか？')) return;
  edit(() => { project = ensureVariants(createProject()); });
  afterRestore();
});

function autosave() {
  syncActive(project);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch {
    // 画像が大きく容量を超えた場合は画像抜きで保存
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...project, image: null })); } catch { /* 保存不可 */ }
  }
}
// 閉じる・アプリを切り替える直前の変更も失わないよう、すぐに保存する
window.addEventListener('pagehide', () => { clearTimeout(saveTimer); autosave(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { clearTimeout(saveTimer); autosave(); }
});
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

// ---------- 家具 ----------
function renderPalette() {
  const box = $('#palette-items');
  for (const c of FURNITURE_CATALOG) {
    const b = document.createElement('button');
    b.title = `${c.name}（幅 ${c.w}m × 奥行 ${c.d}m × 高さ ${c.h}m）`;
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = c.color;
    const size = document.createElement('span');
    size.className = 'size';
    size.textContent = `${Math.round(c.w * 100)}×${Math.round(c.d * 100)}`;
    b.append(sw, c.name, size);
    b.addEventListener('click', () => placeFurniture(c.type));
    box.append(b);
  }
}

function placeFurniture(type) {
  // 図面の表示中央に置く（続けて置くときは少しずらす）
  const { view, canvas, dpr } = editor;
  const palette = $('#furniture-palette');
  const covered = palette.hidden ? 0 : palette.offsetHeight + 8; // パレットで隠れている下側
  const cx = (canvas.width / dpr / 2 - view.x) / view.zoom;
  const cy = ((canvas.height / dpr - covered) / 2 - view.y) / view.zoom;
  const shift = (project.furniture.length % 5) * (0.2 / project.scale);
  const f = createFurniture(type, { x: cx + shift, y: cy + shift });
  edit(() => project.furniture.push(f));
  editor.setTool('select');
  updateToolButtons();
  editor.select({ kind: 'furniture', id: f.id });
  // スマホでは図面が狭いので、置いたらパレットを閉じてすぐ動かせるようにする
  if (isNarrow()) togglePalette(false);
  setStatus(`${f.name}を置きました。ドラッグで移動、選択中のパネルで回転・サイズ変更ができます`);
}

function togglePalette(open = $('#furniture-palette').hidden) {
  $('#furniture-palette').hidden = !open;
  $('#furniture-btn').classList.toggle('active', open);
  // 図面が見えていないと置けないので 2D を表示する（スマホは分割表示だと狭いので 2D のみ）
  const mode = $('.views').dataset.view;
  if (open && (isNarrow() ? mode !== '2d' : ['3d', 'compare'].includes(mode))) setView(isNarrow() ? '2d' : 'split');
}
const isNarrow = () => window.innerWidth < 800;
renderPalette();
$('#furniture-btn').addEventListener('click', () => togglePalette());
$('#palette-close').addEventListener('click', () => togglePalette(false));

// ---------- リノベーション案 ----------
function renderVariants() {
  const list = $('#variant-list');
  list.replaceChildren();
  for (const v of project.variants) {
    const li = document.createElement('li');
    const name = document.createElement('button');
    name.className = 'v-name';
    name.textContent = v.name;
    name.title = 'この案に切り替えて編集';
    name.classList.toggle('active', v.id === project.activeVariant);
    name.addEventListener('click', () => {
      if (v.id === project.activeVariant) return;
      edit(() => switchVariant(project, v.id));
      editor.select(null);
      syncInputs();
      setStatus(`「${v.name}」を編集中`);
    });
    const rename = document.createElement('button');
    rename.className = 'v-icon';
    rename.textContent = '名前';
    rename.title = '名前を変更';
    rename.addEventListener('click', () => {
      const n = prompt('案の名前', v.name)?.trim();
      if (n) edit(() => renameVariant(project, v.id, n));
    });
    const del = document.createElement('button');
    del.className = 'v-icon danger';
    del.textContent = '削除';
    del.title = 'この案を削除';
    del.disabled = project.variants.length <= 1;
    del.addEventListener('click', () => {
      if (!confirm(`「${v.name}」を削除しますか？`)) return;
      edit(() => removeVariant(project, v.id));
      editor.select(null);
      syncInputs();
    });
    li.append(name, rename, del);
    list.append(li);
  }
}

$('#variant-add').addEventListener('click', () => {
  const n = prompt('新しい案の名前（今の案を複製します）', `案${String.fromCharCode(64 + project.variants.length)}`)?.trim();
  if (!n) return;
  edit(() => addVariant(project, n));
  editor.select(null);
  setStatus(`「${n}」を作成しました。壁の撤去・追加などを行い、「案を比較」で確認できます`);
});
$('#variant-compare').addEventListener('click', () => {
  if (project.variants.length < 2) {
    setStatus('比較するには「＋ 案を複製」で 2 つ以上の案を作ってください');
    return;
  }
  setView('compare');
  // スマホではパネルが下にあるので、比較画面の先頭までスクロールする
  $('.views').scrollIntoView({ block: 'start', behavior: 'smooth' });
});

let cmp = null;
function ensureCompareViewers() {
  if (cmp) return cmp;
  cmp = { a: new Viewer3D($('#cmp-3d-a')), b: new Viewer3D($('#cmp-3d-b')) };
  // 視点を連動させる
  let syncing = false;
  const link = (src, dst) => src.orbit.addEventListener('change', () => {
    if (syncing) return;
    syncing = true;
    dst.camera.position.copy(src.camera.position);
    dst.orbit.target.copy(src.orbit.target);
    dst.orbit.update();
    syncing = false;
  });
  link(cmp.a, cmp.b);
  link(cmp.b, cmp.a);
  for (const id of ['#cmp-a', '#cmp-b']) $(id).addEventListener('change', () => updateCompare());
  return cmp;
}

function updateCompare() {
  if ($('.views').dataset.view !== 'compare') return;
  const { a, b } = ensureCompareViewers();
  const ids = project.variants.map((v) => v.id);
  const selA = $('#cmp-a');
  const selB = $('#cmp-b');
  // 初期値：比較元は最初の案（現状）、比較先は編集中の案（同じなら 2 番目）
  const prevA = ids.includes(selA.value) ? selA.value : ids[0];
  let prevB = ids.includes(selB.value) ? selB.value : project.activeVariant;
  if (prevB === prevA && ids.length > 1) prevB = ids.find((id) => id !== prevA);
  for (const sel of [selA, selB]) {
    sel.replaceChildren(...project.variants.map((v) => new Option(v.name, v.id)));
  }
  selA.value = prevA;
  selB.value = prevB;

  const pa = variantProject(project, prevA);
  const pb = variantProject(project, prevB);
  const d = diffLayouts(pa, pb);
  const opts = viewOptions();
  a.update(pa, {
    ...opts,
    highlightWalls: new Map([...d.removedWalls].map((id) => [id, '#e11d48'])),
    highlightFurniture: new Map(),
    ghostWalls: [],
  });
  b.update(pb, {
    ...opts,
    highlightWalls: new Map([...d.addedWalls].map((id) => [id, '#16a34a'])),
    highlightFurniture: new Map(),
    ghostWalls: pa.walls.filter((w) => d.removedWalls.has(w.id)),
  });
  renderCompareSummary(pa, pb, d);
}

/** 変更のあった項目だけを文章にする */
function changeParts(removed, added, moved, d) {
  const openings = new Set([...d.removedOpenings, ...d.addedOpenings]).size;
  const furniture = new Set([...d.removedFurniture, ...d.addedFurniture]).size;
  return [
    removed && `壁の撤去 ${removed} 本`,
    added && `壁の新設 ${added} 本`,
    moved && `壁の移動・変更 ${moved} 本`,
    openings && `ドア・窓の変更 ${openings} 箇所`,
    furniture && `家具の追加・移動・撤去 ${furniture} 点`,
  ].filter(Boolean);
}

function renderCompareSummary(pa, pb, d) {
  const sa = summarize(pa, project.scale);
  const sb = summarize(pb, project.scale);
  const nameA = $('#cmp-a').selectedOptions[0]?.text ?? '';
  const nameB = $('#cmp-b').selectedOptions[0]?.text ?? '';
  // 部屋が描かれていない場合は面積の行を出さない
  const roomRows = sa.rooms + sb.rooms ? [
    ['部屋数', sa.rooms, sb.rooms, (v) => v],
    ['延床（部屋の合計）', sa.area, sb.area, (v) => `${v.toFixed(1)}㎡`],
  ] : [];
  const rows = [
    ...roomRows,
    ['壁の本数', sa.walls, sb.walls, (v) => v],
    ['壁の総延長', sa.wallLength, sb.wallLength, (v) => `${v.toFixed(1)}m`],
    ['ドア', sa.doors, sb.doors, (v) => v],
    ['窓', sa.windows, sb.windows, (v) => v],
    ...(sa.furniture + sb.furniture ? [['家具', sa.furniture, sb.furniture, (v) => `${v}点`]] : []),
  ];
  const table = document.createElement('table');
  const head = table.createTHead().insertRow();
  for (const t of ['', nameA, nameB, '差']) head.append(Object.assign(document.createElement('th'), { textContent: t }));
  const body = table.createTBody();
  for (const [label, va, vb, fmt] of rows) {
    const r = body.insertRow();
    const delta = vb - va;
    const deltaText = Math.abs(delta) < 1e-9 ? '±0' : `${delta > 0 ? '+' : '−'}${fmt(Math.abs(delta))}`;
    r.insertCell().textContent = label;
    r.insertCell().textContent = fmt(va);
    r.insertCell().textContent = fmt(vb);
    const c = r.insertCell();
    c.textContent = deltaText;
    if (Math.abs(delta) > 1e-9) c.className = delta > 0 ? 'up' : 'down';
  }
  const removed = pa.walls.filter((w) => d.removedWalls.has(w.id) && !pb.walls.some((x) => x.id === w.id)).length;
  const added = pb.walls.filter((w) => d.addedWalls.has(w.id) && !pa.walls.some((x) => x.id === w.id)).length;
  const moved = d.addedWalls.size - added;
  const note = document.createElement('p');
  note.className = 'changes';
  note.textContent = d.removedWalls.size + d.addedWalls.size + d.removedOpenings.size + d.addedOpenings.size +
    d.removedFurniture.size + d.addedFurniture.size
    ? `変更点：${changeParts(removed, added, moved, d).join('、')}`
    : '変更点はありません（比較先の案で壁の撤去・追加などを行ってください）';
  $('#cmp-summary').replaceChildren(table, note);
}

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
window.madori = { get project() { return project; }, editor, viewer, get compare() { return cmp; }, createFurniture, refresh };
