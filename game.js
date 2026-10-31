'use strict';
// ハジキ・ブレイブ — 引っ張って弾くオリジナルのアクションRPG

// ===== 画面・定数 =====
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
const W = 420, H = 760;          // 論理解像度
const FT = 60, FB = 590;         // フィールド上端・下端
const FRICTION = 0.986;
const MAX_PULL = 150;
const LAUNCH_SPEED = 21;
const WEAK_R = 14;
const MAX_HP = 6000;
let scale = 1;

function resize() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  const dpr = window.devicePixelRatio || 1;
  cvs.style.width = W * s + 'px';
  cvs.style.height = H * s + 'px';
  cvs.width = Math.round(W * s * dpr);
  cvs.height = Math.round(H * s * dpr);
  scale = (W * s * dpr) / W;
}
addEventListener('resize', resize);
resize();

// ===== 属性 =====
const EL = {
  fire:  { name: '炎', color: '#ff5a3c', light: '#ffb199' },
  water: { name: '水', color: '#3c9bff', light: '#a6d4ff' },
  wind:  { name: '風', color: '#3ccf6e', light: '#a8f0c0' },
  light: { name: '光', color: '#ffd83c', light: '#fff3b0' },
  dark:  { name: '闇', color: '#a04cff', light: '#d9b8ff' },
};
const BEATS = { fire: 'wind', wind: 'water', water: 'fire', light: 'dark', dark: 'light' };
function elMult(atk, def) {
  if (BEATS[atk] === def) return 1.5;
  if (BEATS[def] === atk && atk !== 'light' && atk !== 'dark') return 0.66;
  return 1;
}

// ===== ユニット =====
const ROSTER = [
  { name: 'ヒノコ', el: 'fire',  type: 'reflect', atk: 420, link: 'burst',
    skill: { name: '紅蓮ブースト', turns: 4, kind: 'power', desc: '攻撃2倍＆加速' } },
  { name: 'ミナモ', el: 'water', type: 'pierce',  atk: 380, link: 'heal',
    skill: { name: '潮騒の祈り', turns: 3, kind: 'heal', desc: 'HP35%回復＆攻撃1.5倍' } },
  { name: 'ソヨギ', el: 'wind',  type: 'reflect', atk: 360, link: 'homing',
    skill: { name: '疾風乱舞', turns: 4, kind: 'pierce', desc: '貫通化＆攻撃1.6倍' } },
  { name: 'ルクス', el: 'light', type: 'pierce',  atk: 400, link: 'laser',
    skill: { name: '流星の審判', turns: 5, kind: 'meteor', desc: '全敵に流星' } },
];
const LINK_NAMES = { burst: 'バーストリンク', heal: 'ヒールリンク', homing: 'ホーミングリンク', laser: 'クロスレーザー' };

// ===== ステージ =====
function E(name, el, hp, atk, cd, x, y, r, opt = {}) {
  return { name, el, hp, maxHp: hp, atk, cd, maxCd: cd, x, y, r,
    weakAng: Math.random() * Math.PI * 2, flash: 0, hit: 0, cool: 0, inside: false, weakIn: false,
    seed: Math.random() * 10, ...opt };
}
const STAGES = [
  { name: 'はじまりの草原', bg: ['#1f4a30', '#0b1d12'], waves: [
    () => [E('グリーンぷに', 'wind', 2400, 500, 2, 100, 170, 28), E('グリーンぷに', 'wind', 2400, 500, 3, 320, 170, 28),
           E('ブルーぷに', 'water', 2800, 600, 2, 210, 290, 30)],
    () => [E('いばらウルフ', 'wind', 4200, 700, 2, 110, 220, 34), E('みずがめ兵', 'water', 4600, 800, 3, 310, 220, 34),
           E('ひばな虫', 'fire', 3000, 600, 1, 210, 130, 26)],
    () => [E('岩窟の番人ゴルドン', 'wind', 34000, 1700, 3, 210, 230, 64, { boss: true })],
  ] },
  { name: '蒼き深淵', bg: ['#123a5c', '#060f1f'], waves: [
    () => [E('あわクラゲ', 'water', 4000, 700, 2, 90, 160, 30), E('あわクラゲ', 'water', 4000, 700, 2, 330, 160, 30),
           E('ほのおエビ', 'fire', 4500, 800, 3, 210, 260, 32), E('あわクラゲ', 'water', 4000, 700, 3, 210, 120, 26)],
    () => [E('深海騎士', 'water', 8000, 1000, 3, 130, 230, 40), E('深海騎士', 'water', 8000, 1000, 2, 290, 230, 40)],
    () => [E('渦の女王メイルストラ', 'water', 52000, 2000, 3, 210, 220, 66, { boss: true })],
  ] },
  { name: '黄昏の魔塔', bg: ['#3a1a4f', '#0d0614'], waves: [
    () => [E('かげコウモリ', 'dark', 5000, 800, 2, 80, 140, 28), E('かげコウモリ', 'dark', 5000, 800, 2, 340, 140, 28),
           E('のろい人形', 'dark', 7000, 1000, 3, 210, 240, 36)],
    () => [E('魔塔の門番', 'dark', 12000, 1300, 3, 210, 180, 48), E('ひかり喰い', 'light', 6000, 900, 2, 90, 300, 30),
           E('ひかり喰い', 'light', 6000, 900, 2, 330, 300, 30)],
    () => [E('黄昏王ノクティス', 'dark', 75000, 2400, 3, 210, 210, 70, { boss: true })],
  ] },
];

// ===== 状態 =====
let state = 'title';   // title | aim | moving | busy | win | lose
let stageIdx = 0, stage = null, wave = 0, turnCount = 0;
let units = [], enemies = [], cur = 0, teamHp = MAX_HP;
let particles = [], texts = [], bullets = [], beams = [], rings = [], timers = [];
let banner = null, shake = 0, hurtFlash = 0, frame = 0;
let shotMult = 1, shotSpeed = 1, shotPierce = false, linked = new Set();
let drag = null;
let cleared = loadCleared();

function loadCleared() {
  try { return JSON.parse(localStorage.getItem('hajiki_cleared') || '[]'); } catch (e) { return []; }
}
function saveCleared() {
  try { localStorage.setItem('hajiki_cleared', JSON.stringify(cleared)); } catch (e) { /* 無視 */ }
}

function after(f, fn) { timers.push({ t: f, fn }); }
function rand(a, b) { return a + Math.random() * (b - a); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// ===== サウンド =====
let actx = null;
function tone(freq, dur = 0.08, type = 'square', vol = 0.06, slide = 0) {
  if (!actx) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, actx.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), actx.currentTime + dur);
  g.gain.setValueAtTime(vol, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
  o.connect(g).connect(actx.destination);
  o.start(); o.stop(actx.currentTime + dur);
}

// ===== 進行 =====
function startStage(i) {
  stageIdx = i; stage = STAGES[i]; wave = 0; turnCount = 1;
  teamHp = MAX_HP;
  units = ROSTER.map((r, k) => ({ ...r, x: 75 + k * 90, y: 520, r: 22, vx: 0, vy: 0,
    charge: r.skill.turns, pulse: 0 }));
  enemies = stage.waves[0]();
  particles = []; texts = []; bullets = []; beams = []; rings = []; timers = [];
  cur = 0; resetShot();
  showBanner('WAVE 1', '#fff');
  state = 'aim';
}

function resetShot() { shotMult = 1; shotSpeed = 1; shotPierce = false; linked = new Set(); }

function nextTurn() {
  for (const u of units) u.charge = Math.max(0, u.charge - 1);
  for (const e of enemies) if (e.boss) e.weakAng += rand(1.2, 3.5);
  cur = (cur + 1) % units.length;
  turnCount++;
  resetShot();
  state = 'aim';
}

function endShot() {
  state = 'busy';
  const finish = () => {
    if (bullets.length) { after(5, finish); return; }
    if (enemies.length === 0) { nextWave(); return; }
    enemyTurn();
  };
  after(20, finish);
}

function enemyTurn() {
  let delay = 0;
  for (const e of enemies) {
    e.cd--;
    if (e.cd <= 0) { delay += 32; const t = e; after(delay, () => enemyAttack(t)); }
  }
  after(delay + 30, () => {
    if (teamHp <= 0) { state = 'lose'; tone(160, 0.6, 'sawtooth', 0.08, -100); return; }
    nextTurn();
  });
}

function enemyAttack(e) {
  if (!enemies.includes(e)) return;
  e.cd = e.maxCd; e.flash = 24;
  const dmg = Math.round(e.atk * rand(0.9, 1.1));
  teamHp = Math.max(0, teamHp - dmg);
  shake = e.boss ? 18 : 10; hurtFlash = 14;
  for (const u of units) {
    for (let i = 0; i < 8; i++) {
      const t = i / 8;
      particles.push({ x: e.x + (u.x - e.x) * t, y: e.y + (u.y - e.y) * t, vx: rand(-1, 1), vy: rand(-1, 1),
        life: 20 + i * 2, max: 36, color: EL[e.el].color, size: 5 });
    }
  }
  texts.push({ x: W / 2, y: FB + 28, text: '-' + dmg, color: '#ff5050', size: 24, life: 50 });
  tone(120, 0.25, 'sawtooth', 0.09, -60);
}

function nextWave() {
  wave++;
  if (wave >= stage.waves.length) {
    state = 'win';
    if (!cleared.includes(stageIdx)) { cleared.push(stageIdx); saveCleared(); }
    tone(660, 0.15, 'triangle', 0.1); after(10, () => tone(880, 0.3, 'triangle', 0.1));
    return;
  }
  const isBoss = wave === stage.waves.length - 1;
  showBanner(isBoss ? '⚠ BOSS ⚠' : 'WAVE ' + (wave + 1), isBoss ? '#ff4a4a' : '#fff');
  after(50, () => {
    enemies = stage.waves[wave]();
    for (const e of enemies) burst(e.x, e.y, EL[e.el].color, 20, 4);
    nextTurn();
  });
}

function showBanner(text, color, sub = '') { banner = { text, color, sub, life: 80 }; }

// ===== 戦闘処理 =====
function weakPos(e) {
  return { x: e.x + Math.cos(e.weakAng) * e.r * 0.8, y: e.y + Math.sin(e.weakAng) * e.r * 0.8 };
}

function dealDamage(e, dmg, x, y, crit) {
  if (!enemies.includes(e)) return;
  e.hp -= dmg; e.hit = 6;
  texts.push({ x: x + rand(-8, 8), y: y - 10, text: String(dmg), color: crit ? '#ffe14d' : '#fff',
    size: crit ? 24 : 17, life: 40 });
  burst(x, y, crit ? '#ffe14d' : '#fff', crit ? 14 : 6, crit ? 5 : 3);
  if (e.hp <= 0) {
    enemies.splice(enemies.indexOf(e), 1);
    burst(e.x, e.y, EL[e.el].color, e.boss ? 80 : 30, e.boss ? 8 : 5);
    rings.push({ x: e.x, y: e.y, r: e.r, max: e.r * 3, life: 30, color: EL[e.el].color });
    shake = e.boss ? 24 : 8;
    tone(e.boss ? 90 : 220, e.boss ? 0.6 : 0.2, 'sawtooth', 0.08, -80);
  }
}

function hitEnemy(e, u, px, py, weakOnly = false) {
  const w = weakPos(e);
  const weak = !!e.boss && Math.hypot(u.x - w.x, u.y - w.y) < u.r + WEAK_R + 4;
  if (weakOnly && !weak) return false;
  let mult = shotMult * elMult(u.el, e.el) * (weak ? 3 : 1);
  if (shotPierce || u.type === 'pierce') mult *= 1.15;
  dealDamage(e, Math.round(u.atk * mult * rand(0.9, 1.1)), weak ? w.x : px, weak ? w.y : py, weak);
  tone(weak ? 1100 : rand(600, 800), 0.05, 'square', 0.05);
  return weak;
}

function collideEnemy(u, e) {
  const dx = u.x - e.x, dy = u.y - e.y;
  const d = Math.hypot(dx, dy) || 0.01, min = u.r + e.r;
  if (d >= min) { e.inside = false; e.weakIn = false; return; }
  const nx = dx / d, ny = dy / d;
  if (u.type === 'pierce' || shotPierce) {
    if (!e.inside) { e.inside = true; e.weakIn = hitEnemy(e, u, e.x + nx * e.r, e.y + ny * e.r); }
    else if (!e.weakIn && e.boss) e.weakIn = hitEnemy(e, u, u.x, u.y, true);
  } else {
    u.x = e.x + nx * min; u.y = e.y + ny * min;
    const dot = u.vx * nx + u.vy * ny;
    if (dot < 0) { u.vx -= 2 * dot * nx; u.vy -= 2 * dot * ny; }
    if (e.cool <= 0) { e.cool = 6; hitEnemy(e, u, e.x + nx * e.r, e.y + ny * e.r); }
  }
}

function linkDamage(a, e, rate) {
  dealDamage(e, Math.round(a.atk * rate * elMult(a.el, e.el) * rand(0.9, 1.1)), e.x, e.y, false);
}

function triggerLink(a) {
  a.pulse = 24;
  texts.push({ x: a.x, y: a.y - 34, text: LINK_NAMES[a.link], color: EL[a.el].light, size: 14, life: 50 });
  tone(880, 0.12, 'triangle', 0.08, 400);
  switch (a.link) {
    case 'burst':
      rings.push({ x: a.x, y: a.y, r: 10, max: 130, life: 22, color: EL[a.el].color });
      for (const e of [...enemies]) if (dist(a, e) < 130 + e.r) linkDamage(a, e, 0.8);
      break;
    case 'heal':
      teamHp = Math.min(MAX_HP, teamHp + 600);
      texts.push({ x: W / 2, y: FB + 28, text: '+600', color: '#5cff8a', size: 22, life: 50 });
      burst(a.x, a.y, '#5cff8a', 20, 3);
      break;
    case 'homing':
      for (let i = 0; i < 4; i++) {
        const ang = rand(0, Math.PI * 2);
        bullets.push({ x: a.x, y: a.y, vx: Math.cos(ang) * 6, vy: Math.sin(ang) * 6, src: a,
          target: enemies[Math.floor(Math.random() * enemies.length)], life: 200 });
      }
      break;
    case 'laser':
      beams.push({ x: a.x, y: a.y, life: 24, color: EL[a.el].color });
      for (const e of [...enemies]) {
        if (Math.abs(e.y - a.y) < e.r + 12 || Math.abs(e.x - a.x) < e.r + 12) linkDamage(a, e, 0.6);
      }
      break;
  }
}

function useSkill() {
  const u = units[cur];
  if (state !== 'aim' || u.charge > 0) return;
  u.charge = u.skill.turns; u.pulse = 30;
  showBanner(u.skill.name, EL[u.el].color, u.skill.desc);
  tone(520, 0.1, 'triangle', 0.1); after(6, () => tone(780, 0.2, 'triangle', 0.1));
  burst(u.x, u.y, EL[u.el].light, 40, 6);
  switch (u.skill.kind) {
    case 'power': shotMult = 2; shotSpeed = 1.3; break;
    case 'heal': {
      const h = Math.round(MAX_HP * 0.35);
      teamHp = Math.min(MAX_HP, teamHp + h); shotMult = 1.5;
      texts.push({ x: W / 2, y: FB + 28, text: '+' + h, color: '#5cff8a', size: 22, life: 50 });
      break;
    }
    case 'pierce': shotPierce = true; shotMult = 1.6; shotSpeed = 1.2; break;
    case 'meteor': {
      state = 'busy';
      const targets = [...enemies];
      targets.forEach((e, i) => after(20 + i * 12, () => {
        rings.push({ x: e.x, y: e.y, r: 5, max: e.r * 1.8, life: 20, color: EL.light.color });
        shake = 8;
        dealDamage(e, Math.round(u.atk * 2.5 * elMult(u.el, e.el) * rand(0.9, 1.1)), e.x, e.y, true);
      }));
      after(40 + targets.length * 12, () => {
        if (enemies.length === 0) nextWave(); else state = 'aim';
      });
      break;
    }
  }
}

function burst(x, y, color, n, sp) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(0.5, sp);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(18, 36), max: 36, color, size: rand(2, 5) });
  }
}

// ===== 入力 =====
function toLogical(ev) {
  const rc = cvs.getBoundingClientRect();
  return { x: (ev.clientX - rc.left) / rc.width * W, y: (ev.clientY - rc.top) / rc.height * H };
}
function inRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
function cardRect(i) { const w = (W - 50) / 4; return { x: 10 + i * (w + 10), y: 636, w, h: 112 }; }
function stageBtn(i) { return { x: 60, y: 360 + i * 100, w: 300, h: 80 }; }
const BTN_BACK = { x: 110, y: 470, w: 200, h: 56 };

cvs.addEventListener('pointerdown', (ev) => {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* 音なし */ } }
  const p = toLogical(ev);
  if (state === 'title') {
    STAGES.forEach((s, i) => { if (inRect(p, stageBtn(i))) { tone(660, 0.08); startStage(i); } });
    return;
  }
  if (state === 'win' || state === 'lose') {
    if (inRect(p, BTN_BACK)) { state = 'title'; tone(440, 0.08); }
    else if (state === 'lose' && inRect(p, { x: 110, y: 390, w: 200, h: 56 })) startStage(stageIdx);
    return;
  }
  if (state !== 'aim') return;
  if (inRect(p, cardRect(cur))) { useSkill(); return; }
  if (p.y > FB) return;
  drag = { sx: p.x, sy: p.y, x: p.x, y: p.y };
  cvs.setPointerCapture(ev.pointerId);
});
cvs.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const p = toLogical(ev); drag.x = p.x; drag.y = p.y;
});
cvs.addEventListener('pointerup', () => {
  if (!drag) return;
  const v = pullVector(); drag = null;
  if (state !== 'aim' || !v) return;
  const u = units[cur];
  const sp = LAUNCH_SPEED * v.power * shotSpeed;
  u.vx = v.dx * sp; u.vy = v.dy * sp;
  state = 'moving';
  tone(300, 0.12, 'triangle', 0.08, 500);
});
cvs.addEventListener('pointercancel', () => { drag = null; });

function pullVector() {
  if (!drag) return null;
  const dx = drag.sx - drag.x, dy = drag.sy - drag.y, len = Math.hypot(dx, dy);
  if (len < 20) return null;
  return { dx: dx / len, dy: dy / len, power: Math.min(len, MAX_PULL) / MAX_PULL };
}

// ===== 更新 =====
function update() {
  frame++;
  for (const t of [...timers]) { if (--t.t <= 0) { timers.splice(timers.indexOf(t), 1); t.fn(); } }

  if (state === 'moving') updateMoving();

  for (const e of enemies) { e.cool--; e.flash = Math.max(0, e.flash - 1); e.hit = Math.max(0, e.hit - 1); }
  for (const u of units) u.pulse = Math.max(0, u.pulse - 1);

  for (const b of bullets) {
    if (!b.target || !enemies.includes(b.target)) b.target = enemies[0];
    b.life--;
    if (!b.target) { b.life = 0; continue; }
    const dx = b.target.x - b.x, dy = b.target.y - b.y, d = Math.hypot(dx, dy);
    b.vx = b.vx * 0.9 + dx / d * 1.4; b.vy = b.vy * 0.9 + dy / d * 1.4;
    b.x += b.vx; b.y += b.vy;
    particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 10, max: 10, color: EL[b.src.el].light, size: 3 });
    if (d < b.target.r) { linkDamage(b.src, b.target, 0.35); b.life = 0; }
  }
  bullets = bullets.filter(b => b.life > 0);

  for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy *= 0.94; p.life--; }
  particles = particles.filter(p => p.life > 0);
  for (const t of texts) { t.y -= 0.6; t.life--; }
  texts = texts.filter(t => t.life > 0);
  for (const b of beams) b.life--;
  beams = beams.filter(b => b.life > 0);
  for (const r of rings) { r.r += (r.max - r.r) * 0.2; r.life--; }
  rings = rings.filter(r => r.life > 0);
  if (banner && --banner.life <= 0) banner = null;
  shake *= 0.85; if (shake < 0.5) shake = 0;
  hurtFlash = Math.max(0, hurtFlash - 1);
}

function updateMoving() {
  const u = units[cur];
  const steps = 3;
  for (let s = 0; s < steps; s++) {
    u.x += u.vx / steps; u.y += u.vy / steps;
    let wall = false;
    if (u.x < u.r) { u.x = u.r; u.vx = Math.abs(u.vx); wall = true; }
    if (u.x > W - u.r) { u.x = W - u.r; u.vx = -Math.abs(u.vx); wall = true; }
    if (u.y < FT + u.r) { u.y = FT + u.r; u.vy = Math.abs(u.vy); wall = true; }
    if (u.y > FB - u.r) { u.y = FB - u.r; u.vy = -Math.abs(u.vy); wall = true; }
    if (wall) tone(240, 0.03, 'sine', 0.04);
    for (const e of [...enemies]) collideEnemy(u, e);
    for (const a of units) {
      if (a !== u && !linked.has(a) && dist(u, a) < u.r + a.r) { linked.add(a); triggerLink(a); }
    }
  }
  u.vx *= FRICTION; u.vy *= FRICTION;
  if (frame % 2 === 0) particles.push({ x: u.x, y: u.y, vx: 0, vy: 0, life: 14, max: 14, color: EL[u.el].light, size: 6 });
  if (Math.hypot(u.vx, u.vy) < 0.25) {
    u.vx = u.vy = 0;
    for (const e of enemies) { e.inside = false; e.weakIn = false; }
    endShot();
  }
}

// ===== 描画 =====
function draw() {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = '#07070f';
  ctx.fillRect(0, 0, W, H);
  if (state === 'title') { drawTitle(); return; }

  ctx.save();
  if (shake) ctx.translate(rand(-shake, shake), rand(-shake, shake));
  drawField();
  for (const r of rings) {
    ctx.strokeStyle = r.color; ctx.globalAlpha = r.life / 30; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const b of beams) {
    ctx.globalAlpha = b.life / 24; ctx.fillStyle = b.color;
    ctx.fillRect(0, b.y - 10, W, 20); ctx.fillRect(b.x - 10, FT, 20, FB - FT);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, b.y - 3, W, 6); ctx.fillRect(b.x - 3, FT, 6, FB - FT);
  }
  ctx.globalAlpha = 1;
  for (const e of enemies) drawEnemy(e);
  if (state === 'aim') drawGuide();
  units.forEach((u, i) => drawUnit(u, i === cur));
  for (const b of bullets) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.fill();
  }
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const t of texts) {
    ctx.globalAlpha = Math.min(1, t.life / 15);
    ctx.font = `bold ${t.size}px sans-serif`; ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  drawHud();
  if (hurtFlash) { ctx.fillStyle = `rgba(255,0,0,${hurtFlash / 40})`; ctx.fillRect(0, 0, W, H); }
  if (banner) drawBanner();
  if (state === 'win' || state === 'lose') drawResult();
}

function drawField() {
  const g = ctx.createLinearGradient(0, FT, 0, FB);
  g.addColorStop(0, stage.bg[0]); g.addColorStop(1, stage.bg[1]);
  ctx.fillStyle = g; ctx.fillRect(0, FT, W, FB - FT);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 35) { ctx.beginPath(); ctx.moveTo(x, FT); ctx.lineTo(x, FB); ctx.stroke(); }
  for (let y = FT; y <= FB; y += 35) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3;
  ctx.strokeRect(1.5, FT + 1.5, W - 3, FB - FT - 3);
}

function drawEyes(x, y, r, lookX, lookY, angry) {
  for (const s of [-1, 1]) {
    const ex = x + s * r * 0.35, ey = y - r * 0.1;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.2, r * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(ex + lookX * r * 0.08, ey + lookY * r * 0.08, r * 0.1, 0, Math.PI * 2); ctx.fill();
    if (angry) {
      ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(2, r * 0.07);
      ctx.beginPath(); ctx.moveTo(ex - s * r * 0.22, ey - r * 0.38); ctx.lineTo(ex + s * r * 0.18, ey - r * 0.22); ctx.stroke();
    }
  }
}

function drawEnemy(e) {
  const c = EL[e.el];
  const wob = Math.sin(frame * 0.06 + e.seed) * 2;
  const r = e.r + (e.flash ? Math.sin(e.flash) * 4 : 0);
  if (e.boss) {
    ctx.fillStyle = c.color;
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2 + frame * 0.005;
      ctx.beginPath();
      ctx.moveTo(e.x + Math.cos(a - 0.15) * r * 0.9, e.y + Math.sin(a - 0.15) * r * 0.9);
      ctx.lineTo(e.x + Math.cos(a) * r * 1.3, e.y + Math.sin(a) * r * 1.3);
      ctx.lineTo(e.x + Math.cos(a + 0.15) * r * 0.9, e.y + Math.sin(a + 0.15) * r * 0.9);
      ctx.fill();
    }
  }
  const g = ctx.createRadialGradient(e.x - r * 0.3, e.y - r * 0.3, r * 0.1, e.x, e.y, r);
  g.addColorStop(0, e.hit ? '#fff' : c.light); g.addColorStop(1, c.color);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(e.x, e.y + wob, r, r - wob * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.stroke();
  const u = units[cur];
  const dx = u.x - e.x, dy = u.y - e.y, d = Math.hypot(dx, dy) || 1;
  drawEyes(e.x, e.y + wob, r, dx / d, dy / d, true);

  if (e.boss) {
    const w = weakPos(e), pr = WEAK_R + Math.sin(frame * 0.15) * 3;
    ctx.fillStyle = 'rgba(255,225,77,0.35)'; ctx.beginPath(); ctx.arc(w.x, w.y, pr + 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.arc(w.x, w.y, pr * 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(w.x, w.y, pr, 0, Math.PI * 2); ctx.stroke();
  } else {
    const bw = e.r * 1.8;
    ctx.fillStyle = '#000a'; ctx.fillRect(e.x - bw / 2, e.y + e.r + 6, bw, 6);
    ctx.fillStyle = '#4cff6a'; ctx.fillRect(e.x - bw / 2, e.y + e.r + 6, bw * Math.max(0, e.hp / e.maxHp), 6);
  }
  // 攻撃カウンター
  const bx = e.x - e.r * 0.8, by = e.y - e.r * 0.8;
  ctx.fillStyle = e.cd <= 1 ? '#e8243c' : '#222';
  ctx.beginPath(); ctx.arc(bx, by, 12, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(e.cd, bx, by + 1);
  ctx.textBaseline = 'alphabetic';
}

function drawUnit(u, active) {
  const c = EL[u.el];
  const r = u.r + (u.pulse ? Math.sin(u.pulse * 0.5) * 3 : 0);
  if (active) {
    ctx.strokeStyle = '#fff'; ctx.globalAlpha = 0.5 + Math.sin(frame * 0.15) * 0.3; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(u.x, u.y, r + 7, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  }
  const g = ctx.createRadialGradient(u.x - r * 0.3, u.y - r * 0.3, 2, u.x, u.y, r);
  g.addColorStop(0, c.light); g.addColorStop(1, c.color);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(u.x, u.y, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#fff';
  if (u.type === 'pierce' || (active && shotPierce)) ctx.setLineDash([6, 4]);
  ctx.stroke(); ctx.setLineDash([]);
  const sp = Math.hypot(u.vx, u.vy) || 1;
  drawEyes(u.x, u.y, r, u.vx / sp, u.vy / sp, false);
}

function drawGuide() {
  const v = pullVector();
  const u = units[cur];
  if (!v) {
    if (turnCount <= 2 && !drag) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.6 + Math.sin(frame * 0.1) * 0.3) + ')';
      ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('画面を引っ張って離すと発射！', W / 2, FB - 14);
    }
    return;
  }
  let x = u.x, y = u.y, dx = v.dx, dy = v.dy;
  const len = 80 + v.power * 260;
  ctx.fillStyle = '#fff';
  for (let t = 0; t < len; t += 4) {
    x += dx * 4; y += dy * 4;
    if (x < u.r || x > W - u.r) dx = -dx;
    if (y < FT + u.r || y > FB - u.r) dy = -dy;
    if (t % 16 === 0) {
      ctx.globalAlpha = 1 - t / len;
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  // パワーゲージ
  ctx.strokeStyle = EL[u.el].light; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * v.power); ctx.stroke();
}

function drawHud() {
  // 上部
  ctx.fillStyle = '#10101c'; ctx.fillRect(0, 0, W, FT);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(stage.name, 12, 22);
  ctx.textAlign = 'right';
  ctx.fillText(`WAVE ${Math.min(wave + 1, stage.waves.length)}/${stage.waves.length}  TURN ${turnCount}`, W - 12, 22);
  const boss = enemies.find(e => e.boss);
  if (boss) {
    ctx.fillStyle = '#300'; ctx.fillRect(12, 32, W - 24, 16);
    ctx.fillStyle = '#ff3b3b'; ctx.fillRect(12, 32, (W - 24) * Math.max(0, boss.hp / boss.maxHp), 16);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(12, 32, W - 24, 16);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(boss.name, W / 2, 44);
  }

  // 下部パネル
  ctx.fillStyle = '#10101c'; ctx.fillRect(0, FB, W, H - FB);
  ctx.fillStyle = '#222'; ctx.fillRect(12, FB + 12, W - 24, 18);
  const hpRate = teamHp / MAX_HP;
  ctx.fillStyle = hpRate > 0.5 ? '#4cff6a' : hpRate > 0.2 ? '#ffc93c' : '#ff3b3b';
  ctx.fillRect(12, FB + 12, (W - 24) * hpRate, 18);
  ctx.strokeStyle = '#fff'; ctx.strokeRect(12, FB + 12, W - 24, 18);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`HP ${teamHp} / ${MAX_HP}`, W / 2, FB + 25);

  units.forEach((u, i) => {
    const r = cardRect(i), c = EL[u.el], active = i === cur;
    const ready = u.charge === 0;
    ctx.fillStyle = active ? '#2a2a44' : '#18182a';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = active ? '#fff' : c.color; ctx.lineWidth = active ? 3 : 1.5;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = c.color; ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + 26, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif';
    ctx.fillText(c.name, r.x + r.w / 2, r.y + 31);
    ctx.fillText(u.name, r.x + r.w / 2, r.y + 58);
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#bbb';
    ctx.fillText(u.type === 'pierce' ? '貫通' : '反射', r.x + r.w / 2, r.y + 73);
    if (ready) {
      ctx.fillStyle = active ? `rgba(255,225,77,${0.7 + Math.sin(frame * 0.2) * 0.3})` : '#ffe14d';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(active ? 'TAPでスキル!' : 'スキルOK', r.x + r.w / 2, r.y + 96);
    } else {
      ctx.fillStyle = '#333'; ctx.fillRect(r.x + 8, r.y + 88, r.w - 16, 8);
      ctx.fillStyle = c.color;
      ctx.fillRect(r.x + 8, r.y + 88, (r.w - 16) * (1 - u.charge / u.skill.turns), 8);
      ctx.fillStyle = '#ccc'; ctx.font = '10px sans-serif';
      ctx.fillText(`あと${u.charge}`, r.x + r.w / 2, r.y + 108);
    }
    if (active) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif';
      ctx.fillText('▼', r.x + r.w / 2, r.y - 2);
    }
  });
}

function drawBanner() {
  const a = Math.min(1, banner.life / 15, (80 - banner.life) / 10 + 0.1);
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 260, W, banner.sub ? 100 : 80);
  ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center';
  ctx.lineWidth = 6; ctx.strokeStyle = '#000'; ctx.strokeText(banner.text, W / 2, 312);
  ctx.fillStyle = banner.color; ctx.fillText(banner.text, W / 2, 312);
  if (banner.sub) { ctx.font = 'bold 15px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(banner.sub, W / 2, 342); }
  ctx.globalAlpha = 1;
}

function button(r, label, color) {
  ctx.fillStyle = color; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 7);
}

function drawResult() {
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.font = 'bold 42px sans-serif';
  if (state === 'win') {
    ctx.fillStyle = '#ffe14d'; ctx.fillText('STAGE CLEAR!', W / 2, 280);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif';
    ctx.fillText(`${turnCount} ターンでクリア`, W / 2, 330);
  } else {
    ctx.fillStyle = '#ff4a4a'; ctx.fillText('GAME OVER', W / 2, 280);
    button({ x: 110, y: 390, w: 200, h: 56 }, 'リトライ', '#7a2030');
  }
  button(BTN_BACK, 'タイトルへ', '#2a3a7a');
}

function drawTitle() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#24145a'); g.addColorStop(1, '#07070f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 5; i++) {
    const c = EL[Object.keys(EL)[i]];
    const x = W / 2 + Math.cos(frame * 0.02 + i * 1.256) * 140, y = 250 + Math.sin(frame * 0.02 + i * 1.256) * 40;
    ctx.fillStyle = c.color; ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.font = 'bold 46px sans-serif'; ctx.lineWidth = 8; ctx.strokeStyle = '#000';
  ctx.strokeText('ハジキ・ブレイブ', W / 2, 150);
  ctx.fillStyle = '#ffe14d'; ctx.fillText('ハジキ・ブレイブ', W / 2, 150);
  ctx.font = 'bold 16px sans-serif'; ctx.fillStyle = '#fff';
  ctx.fillText('引っ張って、はじいて、ぶっとばせ！', W / 2, 190);
  STAGES.forEach((s, i) => {
    const r = stageBtn(i);
    button(r, `${i + 1}. ${s.name}`, s.bg[0]);
    if (cleared.includes(i)) { ctx.fillStyle = '#ffe14d'; ctx.font = 'bold 20px sans-serif'; ctx.fillText('★', r.x + r.w - 22, r.y + 28); }
  });
  ctx.fillStyle = '#999'; ctx.font = '12px sans-serif';
  ctx.fillText('炎→風→水→炎 / 光⇔闇 に有利（1.5倍）', W / 2, 700);
  ctx.fillText('味方に触れるとリンクスキル発動・ボスの弱点は3倍', W / 2, 720);
}

// ===== ループ =====
let last = performance.now(), acc = 0;
function loop(now) {
  acc += Math.min(100, now - last); last = now;
  while (acc >= 1000 / 60) { update(); acc -= 1000 / 60; }
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
