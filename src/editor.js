// 2D 間取りエディタ（Canvas）。画像の上に壁・ドア・窓・部屋を描く
import {
  uid, dist, projectOnSegment, findNearestWall, snapToEndpoint, snapOrtho,
  OPENING_DEFAULTS, bounds, wallLength, polygonArea,
} from './model.js';
import { hitFurniture, furnitureCorners } from './furniture.js';
import { ROOM_FLOORS } from './rooms.js';

const HIT_PX = 10; // 画面上のヒット判定半径
const STROKE_ORTHO_DEG = 12; // なぞり描きで水平・垂直に揃える角度

export class Editor2D {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} hooks
   *   getProject(): project
   *   beginEdit(): 変更前に呼ばれる（履歴保存用）
 *   cancelEdit(): 変更がなかった
 *   abortEdit(): 途中までの変更を元に戻す
   *   changed(): 変更後に呼ばれる
   *   selectionChanged(sel)
   *   calibrate(pxLength)
   *   status(text)
   */
  constructor(canvas, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.view = { x: 20, y: 20, zoom: 1 };
    this.tool = 'select';
    this.selection = null; // { kind:'wall'|'opening'|'room', id }
    this.draft = null; // 作図中の状態
    this.mouse = null; // ワールド座標
    this.drag = null;
    this.image = null;
    this.spaceDown = false;
    this.pointers = new Map(); // タッチ中の指（ピンチ操作用）
    this.pinch = null;
    this.tap = null; // タッチでの作図はタップ（指を離した時）で確定する
    this.isTouch = false;

    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onUp(e, true));
    canvas.addEventListener('pointerleave', (e) => {
      // 指を離すと leave が来るが、作図中のプレビューは残す
      if (e.pointerType === 'touch') return;
      this.mouse = null;
      this.render();
    });
    canvas.addEventListener('dblclick', (e) => this.onDblClick(e));
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); this.finishDraft(); });
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
  }

  get project() { return this.hooks.getProject(); }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.canvas.style.width = `${r.width}px`;
    this.canvas.style.height = `${r.height}px`;
    this.dpr = dpr;
    // ユーザーが視点を動かすまではサイズ変更に合わせて全体表示する
    if (!this.viewTouched && this.project) this.fit();
    else this.render();
  }

  setImage(img) {
    this.image = img;
    this.render();
  }

  setTool(tool) {
    this.tool = tool;
    this.draft = null;
    this.canvas.dataset.tool = tool;
    this.hooks.status?.(TOOL_HINTS[tool] ?? '');
    this.render();
  }

  select(sel) {
    this.selection = sel;
    this.hooks.selectionChanged?.(sel);
    this.render();
  }

  fit() {
    const b = bounds(this.project);
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    const bw = Math.max(b.maxX - b.minX, 1);
    const bh = Math.max(b.maxY - b.minY, 1);
    const zoom = Math.min((w - 40) / bw, (h - 40) / bh);
    this.view.zoom = Math.max(0.02, zoom);
    this.view.x = (w - bw * this.view.zoom) / 2 - b.minX * this.view.zoom;
    this.view.y = (h - bh * this.view.zoom) / 2 - b.minY * this.view.zoom;
    this.render();
  }

  // ---- 座標変換 ----
  toWorld(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - this.view.x) / this.view.zoom,
      y: (e.clientY - r.top - this.view.y) / this.view.zoom,
    };
  }
  get hitWorld() { return (this.isTouch ? HIT_PX * 2 : HIT_PX) / this.view.zoom; }

  /** 作図用のスナップ（端点 → 水平垂直） */
  snapped(p, e, from, orthoDeg = this.drag?.kind === 'stroke' ? STROKE_ORTHO_DEG : 8) {
    const ep = snapToEndpoint(this.project.walls, p, this.hitWorld);
    if (ep) return { ...ep, snapped: true };
    // なぞり描きは手ぶれがあるので、水平・垂直に揃える角度を広めにとる
    if (from && !e.shiftKey) return snapOrtho(from, p, orthoDeg);
    return p;
  }

  // ---- ヒットテスト ----
  hitTest(p) {
    const pr = this.project;
    const tol = this.hitWorld;
    for (const o of pr.openings) {
      const w = pr.walls.find((x) => x.id === o.wallId);
      if (!w) continue;
      const c = lerp(w.a, w.b, o.t);
      const halfPx = o.width / pr.scale / 2;
      const r = projectOnSegment(p, w.a, w.b);
      if (r.distance <= Math.max(tol, w.thickness / pr.scale / 2) && dist(r.point, c) <= halfPx) {
        return { kind: 'opening', id: o.id };
      }
    }
    if (this.selection?.kind === 'wall') {
      const w = pr.walls.find((x) => x.id === this.selection.id);
      if (w) {
        if (dist(p, w.a) <= tol) return { kind: 'wall', id: w.id, handle: 'a' };
        if (dist(p, w.b) <= tol) return { kind: 'wall', id: w.id, handle: 'b' };
      }
    }
    // 家具は内側をクリックしたときだけ（壁の近くでも家具を優先）
    const furniture = pr.furniture ?? [];
    for (let i = furniture.length - 1; i >= 0; i--) {
      if (hitFurniture(furniture[i], p, pr.scale)) return { kind: 'furniture', id: furniture[i].id };
    }
    const near = findNearestWall(pr.walls, p, tol);
    if (near) {
      const w = near.wall;
      const handle = dist(p, w.a) <= tol ? 'a' : dist(p, w.b) <= tol ? 'b' : null;
      return { kind: 'wall', id: w.id, handle };
    }
    for (let i = pr.rooms.length - 1; i >= 0; i--) {
      if (pointInPolygon(p, pr.rooms[i].points)) return { kind: 'room', id: pr.rooms[i].id };
    }
    return null;
  }

  // ---- 入力 ----
  onDown(e) {
    this.canvas.setPointerCapture(e.pointerId);
    this.isTouch = e.pointerType === 'touch';
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      this.startPinch();
      return;
    }
    if (this.pointers.size > 2 || this.pinch) return;
    const p = this.toWorld(e);
    this.mouse = p;
    if (e.button === 1 || e.button === 0 && (this.tool === 'pan' || this.spaceDown)) {
      this.startPan(e);
      return;
    }
    if (e.button !== 0) return;

    if (this.tool === 'select') {
      const hit = this.hitTest(p);
      if (this.isTouch && !(hit && this.isSelected(hit.kind, hit.id))) {
        // 指では「タップで選択 → 選択済みの物をドラッグで移動」。未選択の上のドラッグはスクロール
        this.tap = { p, hit };
        this.startPan(e);
        return;
      }
      this.select(hit ? { kind: hit.kind, id: hit.id } : null);
      // 何もない所のドラッグは画面移動
      if (!hit) this.startPan(e);
      else this.startItemDrag(hit, p);
    } else if (this.tool === 'wall') {
      // 押したままなぞると壁を描く。動かさずに離したら従来どおり 1 点ずつの作図
      const start = this.snapped(p, e, null);
      this.drag = {
        kind: 'stroke', sx: e.clientX, sy: e.clientY, p,
        start: { x: start.x, y: start.y }, prevDraft: this.draft, active: false,
      };
    } else if (this.isTouch) {
      // 指でのドラッグは画面移動、動かさずに離したらタップとして作図
      this.tap = { p };
      this.startPan(e);
    } else {
      this.applyTool(p, e);
    }
    this.render();
  }

  startPan(e) {
    this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y };
  }

  startPinch() {
    // 1 本目の指で始めた操作は取り消してピンチに切り替える
    const d = this.drag;
    if (d?.kind === 'stroke') this.draft = d.prevDraft;
    else if (d && d.kind !== 'pan') {
      if (d.moved) this.hooks.abortEdit?.();
      else this.hooks.cancelEdit?.();
    }
    this.drag = null;
    this.tap = null;
    const [a, b] = [...this.pointers.values()];
    this.pinch = { d: Math.max(1, dist(a, b)), mid: lerp(a, b, 0.5), view: { ...this.view } };
    this.viewTouched = true;
  }

  updatePinch() {
    const [a, b] = [...this.pointers.values()];
    const r = this.canvas.getBoundingClientRect();
    const { d, mid, view } = this.pinch;
    const m = lerp(a, b, 0.5);
    const zoom = Math.min(40, Math.max(0.02, (view.zoom * dist(a, b)) / d));
    // ピンチ開始時に指の中点にあった点が、現在の中点に来るようにする
    const wx = (mid.x - r.left - view.x) / view.zoom;
    const wy = (mid.y - r.top - view.y) / view.zoom;
    this.view = { zoom, x: m.x - r.left - wx * zoom, y: m.y - r.top - wy * zoom };
    this.render();
  }

  startItemDrag(hit, p) {
    const pr = this.project;
    this.hooks.beginEdit();
    if (hit.kind === 'wall') {
      const w = pr.walls.find((x) => x.id === hit.id);
      if (hit.handle) {
        // 同じ位置にある他の壁の端点も一緒に動かす
        const origin = { ...w[hit.handle] };
        const linked = [];
        for (const o of pr.walls) {
          for (const k of ['a', 'b']) {
            if (dist(o[k], origin) < 0.5) linked.push({ wall: o, key: k });
          }
        }
        this.drag = { kind: 'handle', wall: w, key: hit.handle, linked, origin };
      } else {
        this.drag = { kind: 'wall', wall: w, start: p, a: { ...w.a }, b: { ...w.b } };
      }
    } else if (hit.kind === 'opening') {
      const o = pr.openings.find((x) => x.id === hit.id);
      this.drag = { kind: 'opening', opening: o, wall: pr.walls.find((w) => w.id === o.wallId) };
    } else if (hit.kind === 'furniture') {
      const f = pr.furniture.find((x) => x.id === hit.id);
      this.drag = { kind: 'furniture', item: f, start: p, x: f.x, y: f.y };
    } else if (hit.kind === 'room') {
      const r = pr.rooms.find((x) => x.id === hit.id);
      this.drag = { kind: 'room', room: r, start: p, points: r.points.map((q) => ({ ...q })) };
    }
    this.drag.moved = false;
  }

  /** 作図ツールの 1 クリック（タップ）分の操作 */
  applyTool(p, e) {
    const pr = this.project;
    switch (this.tool) {
      case 'wall': {
        const from = this.draft?.from;
        // 直前の点をもう一度クリック/タップしたら連続作図を終了
        if (from && dist(p, from) <= this.hitWorld) {
          this.finishDraft();
          break;
        }
        const q = this.snapped(p, e, from);
        if (!from) {
          this.draft = { from: { x: q.x, y: q.y } };
        } else if (dist(from, q) > 1) {
          this.hooks.beginEdit();
          pr.walls.push({ id: uid('w'), a: { ...from }, b: { x: q.x, y: q.y }, thickness: pr.wallThickness });
          this.hooks.changed();
          // 既存端点にスナップして閉じたら連続作図を終了
          this.draft = q.snapped && pr.walls.length > 1 ? null : { from: { x: q.x, y: q.y } };
        }
        break;
      }
      case 'door':
      case 'window': {
        const near = findNearestWall(pr.walls, p, this.hitWorld * 1.5);
        if (!near) { this.hooks.status?.('壁の上をクリック（タップ）してください'); break; }
        this.hooks.beginEdit();
        const o = { id: uid('o'), wallId: near.wall.id, t: near.t, type: this.tool, ...OPENING_DEFAULTS[this.tool] };
        pr.openings.push(o);
        this.hooks.changed();
        this.select({ kind: 'opening', id: o.id });
        break;
      }
      case 'room': {
        const q = snapToEndpoint(pr.walls, p, this.hitWorld) ?? p;
        if (!this.draft) this.draft = { points: [] };
        const pts = this.draft.points;
        if (pts.length >= 3 && dist(q, pts[0]) <= this.hitWorld) {
          this.finishDraft();
        } else {
          pts.push({ x: q.x, y: q.y });
        }
        break;
      }
      case 'calibrate': {
        const q = this.snapped(p, e, this.draft?.from);
        if (!this.draft) {
          this.draft = { from: { x: q.x, y: q.y } };
        } else {
          const len = dist(this.draft.from, q);
          this.draft = null;
          if (len > 2) this.hooks.calibrate(len);
        }
        break;
      }
    }
    this.render();
  }

  onMove(e) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch) {
      if (this.pointers.size >= 2) this.updatePinch();
      return;
    }
    const p = this.toWorld(e);
    if (!this.isTouch || !this.tap) this.mouse = p;
    const d = this.drag;
    if (d) {
      if (d.kind === 'stroke') {
        if (!d.active && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 8) {
          d.active = true;
          this.draft = { from: d.start };
        }
      } else if (d.kind === 'pan') {
        const mx = e.clientX - d.sx;
        const my = e.clientY - d.sy;
        // 少しでも動いたらタップではなくスクロール扱い
        if (Math.hypot(mx, my) > 8) {
          this.tap = null;
          this.viewTouched = true;
        }
        if (!this.tap) {
          this.view.x = d.vx + mx;
          this.view.y = d.vy + my;
        }
      } else if (d.kind === 'handle') {
        const other = d.wall[d.key === 'a' ? 'b' : 'a'];
        let q = snapToEndpoint(this.project.walls.filter((w) => !d.linked.some((l) => l.wall === w)), p, this.hitWorld);
        if (!q) q = e.shiftKey ? p : snapOrtho(other, p);
        for (const l of d.linked) l.wall[l.key] = { x: q.x, y: q.y };
        d.moved = true;
      } else if (d.kind === 'wall') {
        const dx = p.x - d.start.x;
        const dy = p.y - d.start.y;
        d.wall.a = { x: d.a.x + dx, y: d.a.y + dy };
        d.wall.b = { x: d.b.x + dx, y: d.b.y + dy };
        d.moved = true;
      } else if (d.kind === 'opening') {
        // 別の壁にも移動できる
        const near = findNearestWall(this.project.walls, p, this.hitWorld * 2);
        if (near) {
          d.opening.wallId = near.wall.id;
          d.opening.t = near.t;
        } else if (d.wall) {
          d.opening.t = projectOnSegment(p, d.wall.a, d.wall.b).t;
        }
        d.moved = true;
      } else if (d.kind === 'furniture') {
        d.item.x = d.x + p.x - d.start.x;
        d.item.y = d.y + p.y - d.start.y;
        d.moved = true;
      } else if (d.kind === 'room') {
        const dx = p.x - d.start.x;
        const dy = p.y - d.start.y;
        d.room.points = d.points.map((q) => ({ x: q.x + dx, y: q.y + dy }));
        d.moved = true;
      }
      if (d.moved) this.hooks.changed({ live: true });
    }
    this.render();
  }

  onUp(e, cancelled = false) {
    this.pointers.delete(e.pointerId);
    if (this.pinch) {
      // 指がすべて離れるまでピンチ扱い（残った指で誤操作しない）
      if (this.pointers.size === 0) this.pinch = null;
      return;
    }
    const tap = this.tap;
    this.tap = null;
    if (tap && !cancelled) {
      this.drag = null;
      this.mouse = tap.p;
      if (this.tool === 'select') this.select(tap.hit ? { kind: tap.hit.kind, id: tap.hit.id } : null);
      else this.applyTool(tap.p, e);
      this.render();
      return;
    }
    const d = this.drag;
    this.drag = null;
    if (d?.kind === 'stroke') {
      this.finishStroke(d, e, cancelled);
      return;
    }
    if (d && d.kind !== 'pan') {
      if (d.moved) this.hooks.changed();
      else this.hooks.cancelEdit?.();
      this.hooks.selectionChanged?.(this.selection);
    }
    this.render();
  }

  /** なぞり描きの終了：始点から離した点まで壁を 1 本作る */
  finishStroke(d, e, cancelled) {
    if (cancelled) {
      this.draft = d.prevDraft;
    } else if (!d.active) {
      this.draft = d.prevDraft;
      this.applyTool(d.p, e);
    } else {
      const q = this.snapped(this.toWorld(e), e, d.start, STROKE_ORTHO_DEG);
      this.draft = null;
      if (dist(d.start, q) * this.view.zoom > 8) {
        const pr = this.project;
        this.hooks.beginEdit();
        pr.walls.push({ id: uid('w'), a: { ...d.start }, b: { x: q.x, y: q.y }, thickness: pr.wallThickness });
        this.hooks.changed();
      }
    }
    this.render();
  }

  onDblClick() {
    if (this.tool === 'wall' || this.tool === 'room') this.finishDraft();
  }

  onWheel(e) {
    e.preventDefault();
    this.viewTouched = true;
    const r = this.canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const zoom = Math.min(40, Math.max(0.02, this.view.zoom * factor));
    this.view.x = mx - ((mx - this.view.x) * zoom) / this.view.zoom;
    this.view.y = my - ((my - this.view.y) * zoom) / this.view.zoom;
    this.view.zoom = zoom;
    this.render();
  }

  onKey(e, down) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    if (e.code === 'Space') {
      this.spaceDown = down;
      if (down) e.preventDefault();
      return;
    }
    if (!down) return;
    if (e.key === 'Escape') {
      if (this.draft) this.finishDraft(true);
      else this.select(null);
    } else if (e.key === 'Enter') {
      this.finishDraft();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.selection) {
      e.preventDefault();
      this.deleteSelection();
    }
  }

  finishDraft(cancel = false) {
    const d = this.draft;
    this.draft = null;
    if (!cancel && this.tool === 'room' && d?.points?.length >= 3) {
      const pr = this.project;
      this.hooks.beginEdit();
      const room = {
        id: uid('r'),
        name: `部屋${pr.rooms.length + 1}`,
        points: d.points,
        color: ROOM_COLORS[pr.rooms.length % ROOM_COLORS.length],
        floor: 'default',
      };
      pr.rooms.push(room);
      this.hooks.changed();
      this.select({ kind: 'room', id: room.id });
    }
    this.render();
  }

  deleteSelection() {
    const sel = this.selection;
    if (!sel) return;
    const pr = this.project;
    this.hooks.beginEdit();
    if (sel.kind === 'wall') {
      pr.walls = pr.walls.filter((w) => w.id !== sel.id);
      pr.openings = pr.openings.filter((o) => o.wallId !== sel.id);
    } else if (sel.kind === 'opening') {
      pr.openings = pr.openings.filter((o) => o.id !== sel.id);
    } else if (sel.kind === 'room') {
      pr.rooms = pr.rooms.filter((r) => r.id !== sel.id);
    } else if (sel.kind === 'furniture') {
      pr.furniture = pr.furniture.filter((f) => f.id !== sel.id);
    }
    this.hooks.changed();
    this.select(null);
  }

  // ---- 描画 ----
  render() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = null;
      this.draw();
    });
  }

  draw() {
    const { ctx, canvas, view } = this;
    const pr = this.project;
    const z = view.zoom;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--canvas-bg') || '#f6f7f9';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(this.dpr * z, 0, 0, this.dpr * z, this.dpr * view.x, this.dpr * view.y);

    if (this.image) {
      ctx.globalAlpha = 0.85;
      ctx.drawImage(this.image, 0, 0);
      ctx.globalAlpha = 1;
    } else {
      this.drawGrid();
    }

    // 部屋
    for (const r of pr.rooms) {
      ctx.beginPath();
      r.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = hexAlpha(r.color, 0.45);
      ctx.fill();
      const sel = this.isSelected('room', r.id);
      ctx.strokeStyle = sel ? '#2563eb' : hexAlpha(r.color, 0.9);
      ctx.lineWidth = (sel ? 3 : 1.5) / z;
      ctx.stroke();
      const c = centroid(r.points);
      const area = polygonArea(r.points) * pr.scale * pr.scale;
      const floor = r.floor && r.floor !== 'default' ? `・${ROOM_FLOORS[r.floor]?.name ?? ''}` : '';
      this.label(`${r.name}${floor}  ${area.toFixed(1)}㎡ (${(area / 1.62).toFixed(1)}畳)`, c, '#1f2937', 'rgba(255,255,255,0.8)');
    }

    // 家具
    for (const f of pr.furniture ?? []) this.drawFurniture(f);

    // 壁
    for (const w of pr.walls) {
      const sel = this.isSelected('wall', w.id);
      ctx.strokeStyle = sel ? 'rgba(37,99,235,0.85)' : 'rgba(234,88,12,0.75)';
      ctx.lineWidth = Math.max(w.thickness / pr.scale, 2 / z);
      ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(w.a.x, w.a.y);
      ctx.lineTo(w.b.x, w.b.y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1 / z;
      ctx.lineCap = 'butt';
      ctx.stroke();
      if (sel) {
        for (const p of [w.a, w.b]) this.handle(p);
        this.label(`${(wallLength(w) * pr.scale).toFixed(2)} m`, lerp(w.a, w.b, 0.5), '#fff', '#2563eb');
      }
    }

    // 開口部
    for (const o of pr.openings) {
      const w = pr.walls.find((x) => x.id === o.wallId);
      if (!w) continue;
      const L = wallLength(w);
      if (L === 0) continue;
      const half = Math.min(o.width / pr.scale, L) / 2;
      const c = o.t * L;
      const p0 = lerp(w.a, w.b, Math.max(0, c - half) / L);
      const p1 = lerp(w.a, w.b, Math.min(L, c + half) / L);
      const sel = this.isSelected('opening', o.id);
      ctx.strokeStyle = o.type === 'door' ? '#16a34a' : '#0ea5e9';
      if (sel) ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = Math.max(w.thickness / pr.scale + 4 / z, 6 / z);
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
      if (o.type === 'door') {
        // ドアの開き（円弧）
        const ang = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
        const r = dist(p0, p1);
        ctx.lineWidth = 1.2 / z;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.arc(p0.x, p0.y, r, ang, ang + Math.PI / 2);
        ctx.closePath();
        ctx.stroke();
      }
    }

    this.drawDraft();
  }

  drawDraft() {
    const { ctx } = this;
    const pr = this.project;
    const z = this.view.zoom;
    const m = this.mouse;
    if (!m) return;

    if ((this.tool === 'wall' || this.tool === 'calibrate') && (!this.drag || this.drag.kind === 'stroke')) {
      const from = this.draft?.from;
      const q = this.snapped(m, { shiftKey: false }, from);
      if (q.snapped) this.handle(q, '#16a34a');
      if (from) {
        const isWall = this.tool === 'wall';
        ctx.strokeStyle = isWall ? 'rgba(37,99,235,0.6)' : '#db2777';
        ctx.lineWidth = isWall ? Math.max(pr.wallThickness / pr.scale, 2 / z) : 2 / z;
        ctx.setLineDash(isWall ? [] : [6 / z, 4 / z]);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
        ctx.setLineDash([]);
        const len = dist(from, q);
        const text = isWall ? `${(len * pr.scale).toFixed(2)} m` : `${len.toFixed(0)} px`;
        this.label(text, lerp(from, q, 0.5), '#fff', isWall ? '#2563eb' : '#db2777');
        this.handle(from);
      }
    }

    if (this.tool === 'room' && this.draft?.points?.length) {
      const pts = this.draft.points;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.lineTo(m.x, m.y);
      ctx.fillStyle = 'rgba(37,99,235,0.15)';
      ctx.fill();
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2 / z;
      ctx.stroke();
      pts.forEach((p) => this.handle(p));
    }

    if ((this.tool === 'door' || this.tool === 'window') && !this.drag) {
      const near = findNearestWall(pr.walls, m, this.hitWorld * 1.5);
      if (near) {
        const w = near.wall;
        const L = wallLength(w);
        const half = OPENING_DEFAULTS[this.tool].width / pr.scale / 2;
        const p0 = lerp(w.a, w.b, Math.max(0, near.t * L - half) / L);
        const p1 = lerp(w.a, w.b, Math.min(L, near.t * L + half) / L);
        ctx.strokeStyle = this.tool === 'door' ? 'rgba(22,163,74,0.6)' : 'rgba(14,165,233,0.6)';
        ctx.lineWidth = Math.max(w.thickness / pr.scale + 6 / z, 8 / z);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
    }
  }

  drawFurniture(f) {
    const { ctx } = this;
    const pr = this.project;
    const z = this.view.zoom;
    const sel = this.isSelected('furniture', f.id);
    const pts = furnitureCorners(f, pr.scale);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = hexAlpha(f.color, f.type === 'rug' ? 0.45 : 0.8);
    ctx.fill();
    ctx.strokeStyle = sel ? '#2563eb' : 'rgba(31,41,55,0.7)';
    ctx.lineWidth = (sel ? 3 : 1.2) / z;
    ctx.stroke();
    // 背面（壁に付ける側）を太線で示す
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.lineWidth = (sel ? 4 : 3) / z;
    ctx.stroke();
    // 画面上で十分な大きさがあるときだけ名前を表示
    if (Math.min(f.w, f.d) / pr.scale * z > 28) this.label(f.name, f, '#1f2937', 'rgba(255,255,255,0.75)');
  }

  drawGrid() {
    const { ctx } = this;
    const pr = this.project;
    const step = 1 / pr.scale; // 1m グリッド
    const z = this.view.zoom;
    if (step * z < 6) return;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    const x0 = Math.floor(-this.view.x / z / step) * step;
    const y0 = Math.floor(-this.view.y / z / step) * step;
    const x1 = (w - this.view.x) / z;
    const y1 = (h - this.view.y) / z;
    ctx.strokeStyle = 'rgba(100,116,139,0.18)';
    ctx.lineWidth = 1 / z;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += step) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    for (let y = y0; y <= y1; y += step) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    ctx.stroke();
  }

  handle(p, color = '#2563eb') {
    const { ctx } = this;
    const r = 5 / this.view.zoom;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / this.view.zoom;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  label(text, p, fg, bg) {
    const { ctx } = this;
    const z = this.view.zoom;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1 / z, 1 / z);
    ctx.font = '12px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -10, w, 20, 4);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  isSelected(kind, id) {
    return this.selection?.kind === kind && this.selection.id === id;
  }
}

const TOOL_HINTS = {
  select: 'クリック（タップ）で選択、選択した物をドラッグで移動・端点で伸縮、Delete で削除。空き場所のドラッグで画面移動',
  wall: '指（マウス）でなぞると壁を描けます。クリック（タップ）で 1 点ずつの連続作図もでき、最後の点をもう一度押す / Esc で終了（Shift で角度自由）。画面移動は 2 本指',
  door: '壁の上をクリック（タップ）してドアを配置',
  window: '壁の上をクリック（タップ）して窓を配置',
  room: 'クリック（タップ）で頂点を追加、始点を押す / Enter で部屋を確定',
  calibrate: '長さがわかっている2点（寸法線の両端など）をクリック（タップ）',
  pan: 'ドラッグで画面移動。ホイール / 2本指ピンチで拡大縮小',
};

const ROOM_COLORS = ['#e8d5b0', '#c9dcc4', '#c6d5e8', '#ead0d0', '#ddd4ea', '#e9e2bf'];

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function centroid(pts) {
  const n = pts.length;
  return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n };
}

function pointInPolygon(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function hexAlpha(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
