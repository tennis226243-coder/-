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
const WALL_DAMAGE = 300;
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

// ===== 状態 =====
// title | party | aim | moving | busy | cutin | win | lose
let state = 'title';
let stageIdx = 0, stage = null, wave = 0, turnCount = 0;
let units = [], enemies = [], cur = 0, teamHp = 0, maxHp = 1;
let particles = [], texts = [], bullets = [], beams = [], rings = [], timers = [], eshots = [], hearts = [], bolts = [];
let banner = null, cutin = null, warning = null, turnPop = null, comboPop = null;
let shake = 0, hurtFlash = 0, whiteFlash = 0, frame = 0;
let shotMult = 1, shotSpeed = 1, shotPierce = false, linked = new Set(), combo = 0;
let drag = null, detailIdx = 0;
let party = loadJSON('hajiki_party', ['kagutsuchi', 'otohime', 'susanoo', 'amaterasu']).filter(id => CHAR_BY_ID[id]);
let cleared = loadJSON('hajiki_cleared2', {});

function loadJSON(key, def) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v === null ? def : v; } catch (e) { return def; }
}
function saveJSON(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* 保存できなくても続行 */ }
}

function after(f, fn) { timers.push({ t: f, fn }); }
function rand(a, b) { return a + Math.random() * (b - a); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function ease(p) { return 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3); }

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
function jingle(notes, step = 7, type = 'triangle') { notes.forEach((n, i) => setTimeout(() => tone(n, 0.18, type, 0.08), i * step * 16)); }

// ===== 進行 =====
function startStage(i) {
  stageIdx = i; stage = STAGES[i]; wave = 0; turnCount = 1;
  units = party.map((id, k) => ({ ...CHAR_BY_ID[id], x: 75 + k * 90, y: 520, r: 22, vx: 0, vy: 0,
    charge: CHAR_BY_ID[id].skill.turns, pulse: 0 }));
  maxHp = teamHp = units.reduce((s, u) => s + u.hp, 0);
  enemies = stage.waves[0]();
  particles = []; texts = []; bullets = []; beams = []; rings = []; timers = []; eshots = []; hearts = []; bolts = [];
  cutin = warning = comboPop = null;
  cur = 0; resetShot();
  showBanner('WAVE 1', '#fff', stage.name);
  turnPop = { life: 70 };
  state = 'aim';
}

function resetShot() { shotMult = 1; shotSpeed = 1; shotPierce = false; linked = new Set(); combo = 0; }

function nextTurn() {
  for (const u of units) u.charge = Math.max(0, u.charge - 1);
  for (const e of enemies) if (e.boss) e.weakAng += rand(1.2, 3.5);
  cur = (cur + 1) % units.length;
  turnCount++;
  resetShot();
  turnPop = { life: 60 };
  state = 'aim';
}

function endShot() {
  state = 'busy';
  if (combo >= 5) comboPop = { n: combo, life: 60 };
  const finish = () => {
    if (bullets.length || bolts.length) { after(5, finish); return; }
    if (teamHp <= 0) { lose(); return; }
    if (enemies.length === 0) { waveClear(); return; }
    enemyTurn();
  };
  after(20, finish);
}

function lose() { state = 'lose'; tone(160, 0.6, 'sawtooth', 0.08, -100); }

function enemyTurn() {
  let delay = 0;
  for (const e of enemies) {
    e.cd--;
    if (e.cd <= 0) { const t = e; after(delay, () => enemyAttack(t)); delay += e.boss ? 70 : 34; }
  }
  after(delay + 40, () => {
    if (teamHp <= 0) { lose(); return; }
    nextTurn();
  });
}

function enemyAttack(e) {
  if (!enemies.includes(e)) return;
  e.cd = e.maxCd; e.flash = 24;
  if (e.boss) {
    texts.push({ x: W / 2, y: e.y - e.r - 30, text: e.attackName, color: EL[e.el].light, size: 22, life: 60 });
    rings.push({ x: e.x, y: e.y, r: e.r, max: 700, life: 40, color: EL[e.el].color, w: 18 });
    tone(80, 0.5, 'sawtooth', 0.1, 60);
    after(22, () => hurtTeam(Math.round(e.atk * rand(0.9, 1.1)), true));
  } else {
    const target = units[Math.floor(Math.random() * units.length)];
    eshots.push({ x: e.x, y: e.y, sx: e.x, sy: e.y, tx: target.x, ty: target.y, t: 0, dur: 24, el: e.el,
      dmg: Math.round(e.atk * rand(0.9, 1.1)) });
    tone(300, 0.15, 'square', 0.05, -150);
  }
}

function hurtTeam(dmg, big) {
  teamHp = Math.max(0, teamHp - dmg);
  shake = big ? 20 : 10; hurtFlash = big ? 20 : 12;
  texts.push({ x: W / 2, y: FB + 26, text: '-' + dmg, color: '#ff5050', size: big ? 28 : 22, life: 50 });
  tone(120, 0.25, 'sawtooth', 0.09, -60);
}

function waveClear() {
  state = 'busy';
  hearts = [];
  showBanner('CLEAR!', '#ffe14d');
  jingle([660, 880], 6);
  after(55, nextWave);
}

function nextWave() {
  wave++;
  if (wave >= stage.waves.length) { win(); return; }
  const isBoss = wave === stage.waves.length - 1;
  const spawn = () => {
    enemies = stage.waves[wave]();
    for (const e of enemies) burst(e.x, e.y, EL[e.el].color, 24, 5);
    nextTurn();
  };
  if (isBoss) {
    const b = stage.waves[wave]()[0];
    warning = { life: 150, name: b.name, el: b.el };
    tone(200, 0.3, 'square', 0.07); after(30, () => tone(200, 0.3, 'square', 0.07)); after(60, () => tone(200, 0.3, 'square', 0.07));
    after(150, spawn);
  } else {
    showBanner('WAVE ' + (wave + 1), '#fff');
    after(50, spawn);
  }
}

function win() {
  state = 'win';
  const rank = turnCount <= stage.par ? 'S' : turnCount <= stage.par + 6 ? 'A' : 'B';
  const prev = cleared[stageIdx];
  if (!prev || 'SAB'.indexOf(rank) < 'SAB'.indexOf(prev)) { cleared[stageIdx] = rank; saveJSON('hajiki_cleared2', cleared); }
  winInfo = { rank, t: 0 };
  jingle([523, 659, 784, 1047], 8);
}
let winInfo = null;

function showBanner(text, color, sub = '') { banner = { text, color, sub, life: 80 }; }

// ===== 戦闘処理 =====
function weakPos(e) {
  return { x: e.x + Math.cos(e.weakAng) * e.r * 0.8, y: e.y + Math.sin(e.weakAng) * e.r * 0.8 };
}

function dealDamage(e, dmg, x, y, crit) {
  if (!enemies.includes(e)) return;
  e.hp -= dmg; e.hit = 6;
  texts.push({ x: x + rand(-8, 8), y: y - 10, text: String(dmg), color: crit ? '#ffe14d' : '#fff',
    size: crit ? 26 : 18, life: 40, pop: 8 });
  burst(x, y, crit ? '#ffe14d' : '#fff', crit ? 16 : 6, crit ? 6 : 3);
  if (e.hp > 0) return;
  if (e.gauges > 1) {
    e.gauges--; e.hp = e.maxHp; e.cd = e.maxCd; e.flash = 30;
    whiteFlash = 10; shake = 16;
    rings.push({ x: e.x, y: e.y, r: e.r, max: e.r * 4, life: 30, color: '#fff', w: 10 });
    texts.push({ x: e.x, y: e.y - e.r - 20, text: 'BREAK!', color: '#ff7040', size: 30, life: 60, pop: 12 });
    tone(140, 0.4, 'sawtooth', 0.1, 300);
    return;
  }
  enemies.splice(enemies.indexOf(e), 1);
  burst(e.x, e.y, EL[e.el].color, e.boss ? 120 : 34, e.boss ? 10 : 6);
  burst(e.x, e.y, '#fff', e.boss ? 40 : 10, e.boss ? 8 : 4);
  rings.push({ x: e.x, y: e.y, r: e.r, max: e.r * 3, life: 30, color: EL[e.el].color, w: 8 });
  shake = e.boss ? 28 : 8;
  if (e.boss) whiteFlash = 24;
  if (!e.boss && Math.random() < 0.4) hearts.push({ x: e.x, y: e.y, t: 0 });
  tone(e.boss ? 90 : 220, e.boss ? 0.8 : 0.2, 'sawtooth', 0.08, -80);
}

function hitEnemy(e, u, px, py, weakOnly = false) {
  const w = weakPos(e);
  const weak = !!e.boss && Math.hypot(u.x - w.x, u.y - w.y) < u.r + WEAK_R + 4;
  if (weakOnly && !weak) return false;
  let mult = shotMult * elMult(u.el, e.el);
  if (weak) mult *= u.abilities.includes('crit') ? 4.5 : 3;
  if (shotPierce || u.type === 'pierce') mult *= 1.15;
  combo++;
  dealDamage(e, Math.round(u.atk * mult * rand(0.9, 1.1)), weak ? w.x : px, weak ? w.y : py, weak);
  tone(weak ? 1100 : 600 + Math.min(combo, 20) * 20, 0.05, 'square', 0.05);
  if (weak) { texts.push({ x: w.x, y: w.y - 30, text: '弱点!', color: '#ffe14d', size: 16, life: 30 }); shake = Math.max(shake, 6); }
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
  combo++;
  dealDamage(e, Math.round(a.atk * rate * elMult(a.el, e.el) * rand(0.9, 1.1)), e.x, e.y, false);
}

function heal(n, x, y) {
  n = Math.min(n, maxHp - teamHp);
  teamHp += n;
  texts.push({ x: W / 2, y: FB + 26, text: '+' + n, color: '#5cff8a', size: 22, life: 50 });
  burst(x, y, '#5cff8a', 20, 3);
}

function triggerLink(a) {
  a.pulse = 24;
  texts.push({ x: a.x, y: a.y - 34, text: LINKS[a.link].name, color: EL[a.el].light, size: 15, life: 50, pop: 6 });
  tone(880, 0.12, 'triangle', 0.08, 400);
  switch (a.link) {
    case 'burst':
      rings.push({ x: a.x, y: a.y, r: 10, max: 130, life: 22, color: EL[a.el].color, w: 10 });
      for (const e of [...enemies]) if (dist(a, e) < 130 + e.r) linkDamage(a, e, 0.8);
      break;
    case 'heal':
      heal(Math.round(maxHp * 0.08), a.x, a.y);
      rings.push({ x: a.x, y: a.y, r: 10, max: 60, life: 20, color: '#5cff8a', w: 5 });
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
    case 'chain': {
      const targets = [...enemies].sort((p, q) => dist(a, p) - dist(a, q)).slice(0, 3);
      let from = a;
      targets.forEach((e, i) => {
        const f = { x: from.x, y: from.y };
        after(i * 5, () => { bolts.push({ x1: f.x, y1: f.y, x2: e.x, y2: e.y, life: 14, color: EL[a.el].light }); linkDamage(a, e, 0.7); });
        from = e;
      });
      break;
    }
  }
}

function useSkill() {
  const u = units[cur];
  if (state !== 'aim' || u.charge > 0) return;
  u.charge = u.skill.turns; u.pulse = 30;
  cutin = { u, life: 90 };
  state = 'cutin';
  jingle([523, 784, 1047], 5, 'square');
}

function applySkill(u) {
  burst(u.x, u.y, EL[u.el].light, 50, 7);
  rings.push({ x: u.x, y: u.y, r: u.r, max: 90, life: 24, color: EL[u.el].light, w: 6 });
  state = 'aim';
  switch (u.skill.kind) {
    case 'power': shotMult = 2.5; shotSpeed = 1.35; break;
    case 'heal': heal(Math.round(maxHp * 0.35), u.x, u.y); shotMult = 1.5; break;
    case 'pierce': shotPierce = true; shotMult = 1.8; shotSpeed = 1.2; break;
    case 'delay':
      for (const e of enemies) {
        e.cd += 2;
        texts.push({ x: e.x, y: e.y - e.r - 14, text: 'ターン+2', color: EL.dark.light, size: 15, life: 50 });
        rings.push({ x: e.x, y: e.y, r: e.r * 2, max: e.r, life: 20, color: EL.dark.color, w: 4 });
      }
      break;
    case 'barrage': {
      state = 'busy';
      const targets = [...enemies];
      for (let k = 0; k < 3; k++) {
        targets.forEach((e, i) => after(10 + k * 14 + i * 4, () => {
          rings.push({ x: e.x, y: e.y, r: 5, max: e.r * 1.6, life: 18, color: EL[u.el].color, w: 8 });
          beams.push({ x: e.x, y: e.y, life: 12, color: EL[u.el].color, vertical: true });
          shake = 8; combo++;
          dealDamage(e, Math.round(u.atk * 1.0 * elMult(u.el, e.el) * rand(0.9, 1.1)), e.x, e.y, true);
        }));
      }
      after(70 + targets.length * 4, () => { if (enemies.length === 0) waveClear(); else state = 'aim'; });
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
function stageBtn(i) { return { x: 50, y: 330 + i * 105, w: 320, h: 88 }; }
function tileRect(i) { return { x: 12 + (i % 4) * 100, y: 64 + Math.floor(i / 4) * 124, w: 96, h: 118 }; }
const BTN_SORTIE = { x: 220, y: 700, w: 186, h: 48 };
const BTN_BACK_PARTY = { x: 14, y: 700, w: 120, h: 48 };
const BTN_RETRY = { x: 110, y: 470, w: 200, h: 56 };
const BTN_BACK = { x: 110, y: 540, w: 200, h: 56 };

cvs.addEventListener('pointerdown', (ev) => {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* 音なし */ } }
  const p = toLogical(ev);
  if (state === 'title') {
    STAGES.forEach((s, i) => { if (inRect(p, stageBtn(i))) { tone(660, 0.08); stageIdx = i; state = 'party'; } });
    return;
  }
  if (state === 'party') { partyTap(p); return; }
  if (state === 'win' || state === 'lose') {
    if (inRect(p, BTN_BACK)) { state = 'title'; tone(440, 0.08); }
    else if (inRect(p, BTN_RETRY)) startStage(stageIdx);
    return;
  }
  if (state !== 'aim') return;
  if (inRect(p, cardRect(cur))) { useSkill(); return; }
  if (p.y > FB) return;
  drag = { sx: p.x, sy: p.y, x: p.x, y: p.y, t: 0 };
  cvs.setPointerCapture(ev.pointerId);
});
cvs.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const p = toLogical(ev); drag.x = p.x; drag.y = p.y;
});
cvs.addEventListener('pointerup', () => {
  if (!drag) return;
  const v = pullVector(), g = gaugeValue(); drag = null;
  if (state !== 'aim' || !v) return;
  const u = units[cur];
  if (g >= 0.88) {
    shotMult *= 1.25;
    texts.push({ x: u.x, y: u.y - 40, text: 'JUST SHOT!', color: '#ffe14d', size: 20, life: 45, pop: 10 });
    tone(1320, 0.15, 'triangle', 0.08);
  }
  const sp = LAUNCH_SPEED * v.power * shotSpeed;
  u.vx = v.dx * sp; u.vy = v.dy * sp;
  state = 'moving';
  turnPop = null;
  tone(300, 0.12, 'triangle', 0.08, 500);
});
cvs.addEventListener('pointercancel', () => { drag = null; });

function partyTap(p) {
  if (inRect(p, BTN_BACK_PARTY)) { state = 'title'; return; }
  if (inRect(p, BTN_SORTIE) && party.length === 4) { saveJSON('hajiki_party', party); tone(880, 0.1); startStage(stageIdx); return; }
  CHARACTERS.forEach((c, i) => {
    if (!inRect(p, tileRect(i))) return;
    detailIdx = i;
    const k = party.indexOf(c.id);
    if (k >= 0) party.splice(k, 1);
    else if (party.length < 4) party.push(c.id);
    tone(k >= 0 ? 440 : 660, 0.06);
  });
}

function pullVector() {
  if (!drag) return null;
  const dx = drag.sx - drag.x, dy = drag.sy - drag.y, len = Math.hypot(dx, dy);
  if (len < 20) return null;
  return { dx: dx / len, dy: dy / len, power: Math.min(len, MAX_PULL) / MAX_PULL };
}
// 引っ張っている間に往復するゲージ（満タン付近で離すとJUST SHOT）
function gaugeValue() { if (!drag) return 0; const p = (drag.t % 80) / 40; return p < 1 ? p : 2 - p; }

// ===== 更新 =====
function update() {
  frame++;
  if (state === 'cutin') {
    if (--cutin.life <= 0) { const u = cutin.u; cutin = null; applySkill(u); }
    return;
  }
  for (const t of [...timers]) { if (--t.t <= 0) { timers.splice(timers.indexOf(t), 1); t.fn(); } }
  if (drag) drag.t++;

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

  for (const s of eshots) {
    s.t++;
    const p = s.t / s.dur;
    s.x = s.sx + (s.tx - s.sx) * p; s.y = s.sy + (s.ty - s.sy) * p - Math.sin(p * Math.PI) * 60;
    particles.push({ x: s.x, y: s.y, vx: rand(-0.5, 0.5), vy: rand(-0.5, 0.5), life: 14, max: 14, color: EL[s.el].color, size: 5 });
    if (s.t >= s.dur) { burst(s.tx, s.ty, EL[s.el].color, 16, 4); hurtTeam(s.dmg, false); }
  }
  eshots = eshots.filter(s => s.t < s.dur);
  for (const h of hearts) h.t++;

  for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy *= 0.94; p.life--; }
  particles = particles.filter(p => p.life > 0);
  for (const t of texts) { t.y -= 0.6; t.life--; if (t.pop) t.pop--; }
  texts = texts.filter(t => t.life > 0);
  for (const b of beams) b.life--;
  beams = beams.filter(b => b.life > 0);
  for (const b of bolts) b.life--;
  bolts = bolts.filter(b => b.life > 0);
  for (const r of rings) { r.r += (r.max - r.r) * 0.2; r.life--; }
  rings = rings.filter(r => r.life > 0);
  if (banner && --banner.life <= 0) banner = null;
  if (warning && --warning.life <= 0) warning = null;
  if (turnPop && --turnPop.life <= 0) turnPop = null;
  if (comboPop && --comboPop.life <= 0) comboPop = null;
  if (winInfo) winInfo.t++;
  shake *= 0.85; if (shake < 0.5) shake = 0;
  hurtFlash = Math.max(0, hurtFlash - 1);
  whiteFlash = Math.max(0, whiteFlash - 1);
}

function touchWall(u, side) {
  if (!stage.walls.includes(side)) { tone(240, 0.03, 'sine', 0.04); return; }
  const px = side === 'left' ? 0 : side === 'right' ? W : u.x, py = side === 'top' ? FT : u.y;
  burst(px, py, '#fff36a', 12, 5);
  if (u.abilities.includes('guard')) {
    texts.push({ x: u.x, y: u.y - 30, text: '雷耐性!', color: '#8ad8ff', size: 15, life: 30 });
    tone(1500, 0.05, 'sine', 0.05);
  } else {
    teamHp = Math.max(0, teamHp - WALL_DAMAGE); hurtFlash = 6; shake = 6;
    texts.push({ x: u.x, y: u.y - 30, text: '-' + WALL_DAMAGE, color: '#ff5050', size: 16, life: 30 });
    tone(90, 0.1, 'sawtooth', 0.07);
  }
}

function updateMoving() {
  const u = units[cur];
  const steps = 3;
  for (let s = 0; s < steps; s++) {
    u.x += u.vx / steps; u.y += u.vy / steps;
    if (u.x < u.r) { u.x = u.r; u.vx = Math.abs(u.vx); touchWall(u, 'left'); }
    if (u.x > W - u.r) { u.x = W - u.r; u.vx = -Math.abs(u.vx); touchWall(u, 'right'); }
    if (u.y < FT + u.r) { u.y = FT + u.r; u.vy = Math.abs(u.vy); touchWall(u, 'top'); }
    if (u.y > FB - u.r) { u.y = FB - u.r; u.vy = -Math.abs(u.vy); touchWall(u, 'bottom'); }
    for (const e of [...enemies]) collideEnemy(u, e);
    for (const a of units) {
      if (a !== u && !linked.has(a) && dist(u, a) < u.r + a.r) { linked.add(a); triggerLink(a); }
    }
    for (const h of hearts) {
      if (!h.got && Math.hypot(u.x - h.x, u.y - h.y) < u.r + 14) {
        h.got = true; heal(Math.round(maxHp * 0.12), h.x, h.y); tone(1200, 0.1, 'triangle', 0.07);
      }
    }
  }
  hearts = hearts.filter(h => !h.got);
  u.vx *= FRICTION; u.vy *= FRICTION;
  const sp = Math.hypot(u.vx, u.vy);
  particles.push({ x: u.x, y: u.y, vx: 0, vy: 0, life: 16, max: 16, color: EL[u.el].light, size: 4 + sp * 0.4 });
  if (sp < 0.25) {
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
  ctx.textBaseline = 'alphabetic';
  if (state === 'title') { drawTitle(); return; }
  if (state === 'party') { drawParty(); return; }

  ctx.save();
  if (shake) ctx.translate(rand(-shake, shake), rand(-shake, shake));
  drawField();
  for (const h of hearts) {
    ctx.fillStyle = '#ff4d7a'; ctx.shadowColor = '#ff8aa8'; ctx.shadowBlur = 10;
    drawHeart(ctx, h.x, h.y + Math.sin(h.t * 0.1) * 3, 12 + Math.sin(h.t * 0.2));
    ctx.shadowBlur = 0;
  }
  for (const r of rings) {
    ctx.strokeStyle = r.color; ctx.globalAlpha = Math.min(1, r.life / 20); ctx.lineWidth = r.w || 6;
    circle(ctx, r.x, r.y, r.r); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const b of beams) {
    ctx.globalAlpha = b.life / 24; ctx.fillStyle = b.color;
    if (b.vertical) { ctx.fillRect(b.x - 16, FT, 32, b.y - FT); ctx.fillStyle = '#fff'; ctx.fillRect(b.x - 5, FT, 10, b.y - FT); continue; }
    ctx.fillRect(0, b.y - 10, W, 20); ctx.fillRect(b.x - 10, FT, 20, FB - FT);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, b.y - 3, W, 6); ctx.fillRect(b.x - 3, FT, 6, FB - FT);
  }
  ctx.globalAlpha = 1;
  for (const b of bolts) drawBolt(b);
  const u = units[cur];
  for (const e of enemies) {
    const dx = u.x - e.x, dy = u.y - e.y, d = Math.hypot(dx, dy) || 1;
    drawMonster(ctx, e, frame, dx / d, dy / d);
    drawEnemyUi(e);
  }
  if (state === 'aim') drawGuide();
  units.forEach((v, i) => drawUnit(v, i === cur));
  for (const b of bullets) { ctx.fillStyle = '#fff'; circle(ctx, b.x, b.y, 5); ctx.fill(); }
  for (const s of eshots) { ctx.fillStyle = '#fff'; circle(ctx, s.x, s.y, 7); ctx.fill(); }
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color;
    circle(ctx, p.x, p.y, p.size); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const t of texts) {
    const sc = 1 + (t.pop || 0) * 0.06;
    ctx.globalAlpha = Math.min(1, t.life / 15);
    ctx.font = `900 ${Math.round(t.size * sc)}px sans-serif`; ctx.textAlign = 'center';
    ctx.lineWidth = 5; ctx.strokeStyle = '#000'; ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  drawHud();
  if (turnPop && state === 'aim') drawTurnPop();
  if (comboPop) drawCombo();
  if (state === 'moving' && combo > 0) {
    ctx.textAlign = 'right'; ctx.font = '900 italic 30px sans-serif';
    ctx.lineWidth = 5; ctx.strokeStyle = '#000'; ctx.strokeText(combo + ' HIT', W - 12, FB - 16);
    ctx.fillStyle = '#ffe14d'; ctx.fillText(combo + ' HIT', W - 12, FB - 16);
  }
  if (hurtFlash) { ctx.fillStyle = `rgba(255,0,0,${hurtFlash / 40})`; ctx.fillRect(0, 0, W, H); }
  if (whiteFlash) { ctx.fillStyle = `rgba(255,255,255,${whiteFlash / 30})`; ctx.fillRect(0, 0, W, H); }
  if (banner) drawBanner();
  if (warning) drawWarning();
  if (cutin) drawCutin();
  if (state === 'win') drawWin();
  if (state === 'lose') drawLose();
}

function drawField() {
  const g = ctx.createLinearGradient(0, FT, 0, FB);
  g.addColorStop(0, stage.bg[0]); g.addColorStop(1, stage.bg[1]);
  ctx.fillStyle = g; ctx.fillRect(0, FT, W, FB - FT);
  // 床の模様と浮遊する光
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 35) { ctx.beginPath(); ctx.moveTo(x, FT); ctx.lineTo(x, FB); ctx.stroke(); }
  for (let y = FT; y <= FB; y += 35) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.fillStyle = stage.mote;
  for (let i = 0; i < 24; i++) {
    const x = (i * 97 + Math.sin(frame * 0.01 + i) * 20 + 420) % W;
    const y = FB - ((i * 53 + frame * (0.2 + (i % 3) * 0.1)) % (FB - FT));
    ctx.globalAlpha = 0.25 + (i % 4) * 0.1; circle(ctx, x, y, 1.5 + (i % 3)); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3;
  ctx.strokeRect(1.5, FT + 1.5, W - 3, FB - FT - 3);
  for (const side of stage.walls) drawElectricWall(side);
}

function drawElectricWall(side) {
  const seg = 14, pts = [];
  const len = side === 'top' ? W : FB - FT;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, j = (Math.random() - 0.5) * 8;
    if (side === 'top') pts.push([t * W, FT + 4 + j]);
    else pts.push([side === 'left' ? 4 + j : W - 4 + j, FT + t * len]);
  }
  ctx.save();
  ctx.shadowColor = '#fff36a'; ctx.shadowBlur = 14;
  ctx.strokeStyle = '#fff36a'; ctx.lineWidth = 3;
  ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}

function drawBolt(b) {
  ctx.save();
  ctx.globalAlpha = b.life / 14; ctx.strokeStyle = b.color; ctx.lineWidth = 4;
  ctx.shadowColor = b.color; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.moveTo(b.x1, b.y1);
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    ctx.lineTo(b.x1 + (b.x2 - b.x1) * t + rand(-12, 12), b.y1 + (b.y2 - b.y1) * t + rand(-12, 12));
  }
  ctx.lineTo(b.x2, b.y2); ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}

function drawEnemyUi(e) {
  if (e.boss) {
    const w = weakPos(e), pr = WEAK_R + Math.sin(frame * 0.15) * 3;
    ctx.fillStyle = 'rgba(255,225,77,0.35)'; circle(ctx, w.x, w.y, pr + 6); ctx.fill();
    ctx.fillStyle = '#ffe14d'; circle(ctx, w.x, w.y, pr * 0.6); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; circle(ctx, w.x, w.y, pr); ctx.stroke();
  } else {
    const bw = e.r * 1.8;
    ctx.fillStyle = '#000a'; ctx.fillRect(e.x - bw / 2, e.y + e.r + 8, bw, 6);
    ctx.fillStyle = '#4cff6a'; ctx.fillRect(e.x - bw / 2, e.y + e.r + 8, bw * Math.max(0, e.hp / e.maxHp), 6);
  }
  // 攻撃ターン
  const bx = e.x - e.r * 0.85, by = e.y - e.r * 0.85;
  const danger = e.cd <= 1;
  ctx.fillStyle = danger ? '#e8243c' : '#222';
  circle(ctx, bx, by, 13 + (danger ? Math.sin(frame * 0.3) * 1.5 : 0)); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = '900 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(e.cd, bx, by + 1);
  ctx.textBaseline = 'alphabetic';
  // 属性マーク
  ctx.fillStyle = EL[e.el].color; circle(ctx, e.x + e.r * 0.85, e.y - e.r * 0.85, 9); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textBaseline = 'middle';
  ctx.fillText(EL[e.el].name, e.x + e.r * 0.85, e.y - e.r * 0.85 + 1);
  ctx.textBaseline = 'alphabetic';
}

function drawUnitIcon(c, x, y, r, t, look) {
  ctx.save();
  const el = EL[c.el];
  const g = ctx.createLinearGradient(x, y - r, x, y + r);
  g.addColorStop(0, el.light); g.addColorStop(1, el.dark);
  ctx.fillStyle = g; circle(ctx, x, y, r + 3); ctx.fill();
  ctx.fillStyle = '#fff8f0'; circle(ctx, x, y, r); ctx.fill();
  ctx.clip();
  const bg = ctx.createRadialGradient(x, y, 2, x, y, r);
  bg.addColorStop(0, '#fff'); bg.addColorStop(1, el.light);
  ctx.fillStyle = bg; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  drawFace(ctx, c, x, y, r, { t, lx: look ? look.x : 0, ly: look ? look.y : 0 });
  ctx.restore();
}

function drawUnit(u, active) {
  const r = u.r + (u.pulse ? Math.sin(u.pulse * 0.5) * 3 : 0);
  if (active) {
    ctx.strokeStyle = EL[u.el].light; ctx.globalAlpha = 0.5 + Math.sin(frame * 0.15) * 0.3; ctx.lineWidth = 3;
    circle(ctx, u.x, u.y, r + 9); ctx.stroke(); ctx.globalAlpha = 1;
    if (shotMult > 1 || shotPierce) {
      ctx.globalAlpha = 0.35; ctx.fillStyle = EL[u.el].color; circle(ctx, u.x, u.y, r + 14 + Math.sin(frame * 0.3) * 3); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  const sp = Math.hypot(u.vx, u.vy) || 1;
  drawUnitIcon(u, u.x, u.y, r, frame, { x: u.vx / sp, y: u.vy / sp });
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff';
  if (u.type === 'pierce' || (active && shotPierce)) ctx.setLineDash([6, 4]);
  circle(ctx, u.x, u.y, r + 3); ctx.stroke(); ctx.setLineDash([]);
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
    if (t % 16 === 0) { ctx.globalAlpha = 1 - t / len; circle(ctx, x, y, 3.5); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = EL[u.el].light; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * v.power); ctx.stroke();
  // JUST SHOT ゲージ
  const g = gaugeValue(), gx = u.x - 40, gy = u.y + u.r + 16;
  ctx.fillStyle = '#000a'; ctx.fillRect(gx - 2, gy - 2, 84, 12);
  ctx.fillStyle = g >= 0.88 ? '#ffe14d' : '#6ad0ff'; ctx.fillRect(gx, gy, 80 * g, 8);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(gx + 80 * 0.88, gy - 2, 80 * 0.12 + 2, 12);
}

function drawHud() {
  ctx.fillStyle = '#10101c'; ctx.fillRect(0, 0, W, FT);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(stage.name, 12, 20);
  ctx.textAlign = 'right';
  ctx.fillText(`WAVE ${Math.min(wave + 1, stage.waves.length)}/${stage.waves.length}  TURN ${turnCount}`, W - 12, 20);
  const boss = enemies.find(e => e.boss);
  if (boss) {
    const bw = W - 24 - boss.maxGauges * 16;
    ctx.fillStyle = '#300'; ctx.fillRect(12, 30, bw, 18);
    const hg = ctx.createLinearGradient(12, 0, 12 + bw, 0);
    hg.addColorStop(0, '#ff7a3b'); hg.addColorStop(1, '#ff2b4b');
    ctx.fillStyle = hg; ctx.fillRect(12, 30, bw * Math.max(0, boss.hp / boss.maxHp), 18);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(12, 30, bw, 18);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(boss.name, 12 + bw / 2, 43);
    for (let i = 0; i < boss.maxGauges; i++) {
      ctx.fillStyle = i < boss.gauges ? '#ff3b3b' : '#333';
      ctx.beginPath(); const gx = W - 18 - i * 16, gy = 39;
      ctx.moveTo(gx, gy - 8); ctx.lineTo(gx + 6, gy); ctx.lineTo(gx, gy + 8); ctx.lineTo(gx - 6, gy); ctx.fill();
    }
  }

  ctx.fillStyle = '#10101c'; ctx.fillRect(0, FB, W, H - FB);
  ctx.fillStyle = '#222'; ctx.fillRect(12, FB + 12, W - 24, 18);
  const hpRate = teamHp / maxHp;
  ctx.fillStyle = hpRate > 0.5 ? '#4cff6a' : hpRate > 0.2 ? '#ffc93c' : '#ff3b3b';
  ctx.fillRect(12, FB + 12, (W - 24) * hpRate, 18);
  ctx.strokeStyle = '#fff'; ctx.strokeRect(12, FB + 12, W - 24, 18);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`HP ${teamHp} / ${maxHp}`, W / 2, FB + 25);

  units.forEach((u, i) => {
    const r = cardRect(i), c = EL[u.el], active = i === cur, ready = u.charge === 0;
    const cg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    cg.addColorStop(0, active ? '#34345a' : '#1e1e34'); cg.addColorStop(1, '#10101c');
    ctx.fillStyle = cg; roundRect(ctx, r.x, r.y, r.w, r.h, 8); ctx.fill();
    ctx.strokeStyle = ready ? '#ffe14d' : active ? '#fff' : c.color; ctx.lineWidth = active || ready ? 3 : 1.5; ctx.stroke();
    drawUnitIcon(u, r.x + r.w / 2, r.y + 30, 22, frame + i * 50);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(u.name, r.x + r.w / 2, r.y + 68);
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#bbb';
    ctx.fillText(`${c.name}・${u.type === 'pierce' ? '貫通' : '反射'}`, r.x + r.w / 2, r.y + 82);
    if (ready) {
      ctx.fillStyle = active ? `rgba(255,225,77,${0.7 + Math.sin(frame * 0.2) * 0.3})` : '#ffe14d';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(active ? 'TAPでスキル!' : 'スキルOK', r.x + r.w / 2, r.y + 102);
    } else {
      ctx.fillStyle = '#333'; ctx.fillRect(r.x + 8, r.y + 90, r.w - 16, 6);
      ctx.fillStyle = c.color; ctx.fillRect(r.x + 8, r.y + 90, (r.w - 16) * (1 - u.charge / u.skill.turns), 6);
      ctx.fillStyle = '#ccc'; ctx.font = '10px sans-serif';
      ctx.fillText(`あと${u.charge}`, r.x + r.w / 2, r.y + 108);
    }
    if (active) { ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('▼', r.x + r.w / 2, r.y - 2); }
  });
}

function drawTurnPop() {
  const u = units[cur], p = ease((70 - turnPop.life) / 12), a = Math.min(1, turnPop.life / 15);
  ctx.globalAlpha = a;
  const x = -200 + p * 210;
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; roundRect(ctx, x, FT + 8, 200, 44, 22); ctx.fill();
  ctx.strokeStyle = EL[u.el].color; ctx.lineWidth = 2; ctx.stroke();
  drawUnitIcon(u, x + 22, FT + 30, 17, frame);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(`${u.name}のターン`, x + 48, FT + 35);
  ctx.globalAlpha = 1;
}

function drawCombo() {
  const p = ease((60 - comboPop.life) / 10);
  ctx.globalAlpha = Math.min(1, comboPop.life / 15);
  ctx.textAlign = 'center'; ctx.font = `900 italic ${Math.round(40 * p)}px sans-serif`;
  const label = comboPop.n >= 20 ? 'AMAZING!' : comboPop.n >= 10 ? 'GREAT!' : 'GOOD!';
  ctx.lineWidth = 7; ctx.strokeStyle = '#000'; ctx.strokeText(label, W / 2, 200);
  ctx.fillStyle = '#ffe14d'; ctx.fillText(label, W / 2, 200);
  ctx.font = '900 20px sans-serif'; ctx.strokeText(comboPop.n + ' HIT COMBO', W / 2, 230);
  ctx.fillStyle = '#fff'; ctx.fillText(comboPop.n + ' HIT COMBO', W / 2, 230);
  ctx.globalAlpha = 1;
}

function drawBanner() {
  const a = Math.min(1, banner.life / 15, (80 - banner.life) / 10 + 0.1);
  const sx = (1 - ease((80 - banner.life) / 12)) * W;
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 260, W, banner.sub ? 100 : 80);
  ctx.fillStyle = banner.color; ctx.fillRect(0, 260, W, 3); ctx.fillRect(0, 260 + (banner.sub ? 97 : 77), W, 3);
  ctx.font = '900 italic 38px sans-serif'; ctx.textAlign = 'center';
  ctx.lineWidth = 7; ctx.strokeStyle = '#000'; ctx.strokeText(banner.text, W / 2 + sx, 314);
  ctx.fillStyle = banner.color; ctx.fillText(banner.text, W / 2 + sx, 314);
  if (banner.sub) { ctx.font = 'bold 15px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(banner.sub, W / 2 - sx, 344); }
  ctx.globalAlpha = 1;
}

function drawWarning() {
  const t = 150 - warning.life, a = Math.min(1, warning.life / 15, t / 10);
  ctx.globalAlpha = a;
  ctx.fillStyle = `rgba(80,0,0,${0.5 + Math.sin(t * 0.25) * 0.15})`; ctx.fillRect(0, 0, W, H);
  for (const y of [200, 420]) {
    ctx.fillStyle = '#ffcc00'; ctx.fillRect(0, y, W, 34);
    ctx.save(); ctx.beginPath(); ctx.rect(0, y, W, 34); ctx.clip();
    ctx.fillStyle = '#111';
    for (let x = -60 + ((t * 3) % 60); x < W + 60; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 30, y); ctx.lineTo(x + 10, y + 34); ctx.lineTo(x - 20, y + 34); ctx.fill();
    }
    ctx.restore();
  }
  ctx.textAlign = 'center';
  ctx.font = '900 italic 54px sans-serif';
  ctx.globalAlpha = a * (0.6 + Math.abs(Math.sin(t * 0.12)) * 0.4);
  ctx.lineWidth = 8; ctx.strokeStyle = '#000'; ctx.strokeText('WARNING', W / 2, 330);
  ctx.fillStyle = '#ff3030'; ctx.fillText('WARNING', W / 2, 330);
  ctx.globalAlpha = a;
  ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = '#fff';
  const nx = W / 2 + (1 - ease((t - 30) / 20)) * 300;
  ctx.fillText(`${EL[warning.el].name}属性ボス　${warning.name}`, nx, 385);
  ctx.globalAlpha = 1;
}

function drawCutin() {
  const u = cutin.u, el = EL[u.el], t = 90 - cutin.life;
  const a = Math.min(1, cutin.life / 10);
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, H);
  // 斜めの帯
  const bandIn = ease(t / 10);
  ctx.save();
  ctx.beginPath(); ctx.moveTo(-W + bandIn * W, 190); ctx.lineTo(bandIn * W * 2, 150);
  ctx.lineTo(bandIn * W * 2, 470); ctx.lineTo(-W + bandIn * W, 510); ctx.closePath();
  const bg = ctx.createLinearGradient(0, 150, 0, 510);
  bg.addColorStop(0, el.dark); bg.addColorStop(0.5, el.color); bg.addColorStop(1, el.dark);
  ctx.fillStyle = bg; ctx.fill(); ctx.clip();
  // 集中線
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 18; i++) {
    const y = 150 + ((i * 47 + t * 3) % 360), x = W - ((i * 131 + t * 40) % (W * 2));
    ctx.lineWidth = 1 + (i % 3); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 120, y - 13); ctx.stroke();
  }
  // キャラクター
  const px = W + 160 - ease((t - 4) / 16) * 300 - t * 0.3;
  drawPortrait(ctx, u, px, 270, 78, { t: frame });
  ctx.restore();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-W + bandIn * W, 190); ctx.lineTo(bandIn * W * 2, 150); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-W + bandIn * W, 510); ctx.lineTo(bandIn * W * 2, 470); ctx.stroke();
  // 技名
  const tx = -200 + ease((t - 14) / 14) * 220;
  ctx.textAlign = 'left';
  ctx.font = 'bold 15px sans-serif'; ctx.fillStyle = '#fff';
  ctx.fillText(u.title, tx, 400);
  ctx.font = '900 italic 34px sans-serif';
  ctx.lineWidth = 7; ctx.strokeStyle = '#000'; ctx.strokeText(u.skill.name, tx, 440);
  ctx.fillStyle = '#fff'; ctx.fillText(u.skill.name, tx, 440);
  ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = el.light; ctx.fillText(u.skill.desc, tx, 466);
  ctx.textAlign = 'center'; ctx.font = 'bold 16px sans-serif'; ctx.fillStyle = '#fff';
  if (t > 30) ctx.fillText(`「${u.quote}」`, W / 2, 560);
  ctx.globalAlpha = 1;
}

function button(r, label, color) {
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, color); g.addColorStop(1, '#0a0a14');
  ctx.fillStyle = g; roundRect(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
  ctx.textBaseline = 'alphabetic';
}

function drawWin() {
  const t = winInfo.t;
  ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(W / 2, 140); ctx.rotate(t * 0.005);
  ctx.fillStyle = 'rgba(255,225,77,0.12)';
  for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-30, -400); ctx.lineTo(30, -400); ctx.fill(); }
  ctx.restore();
  ctx.textAlign = 'center';
  const s = 1 + Math.max(0, 1 - t / 15);
  ctx.font = `900 italic ${Math.round(44 * s)}px sans-serif`;
  ctx.lineWidth = 8; ctx.strokeStyle = '#000'; ctx.strokeText('STAGE CLEAR!', W / 2, 140);
  ctx.fillStyle = '#ffe14d'; ctx.fillText('STAGE CLEAR!', W / 2, 140);
  units.forEach((u, i) => {
    const p = ease((t - 10 - i * 6) / 14);
    if (p <= 0) return;
    drawPortrait(ctx, u, 66 + i * 96, 250 + (1 - p) * 60 + Math.sin(frame * 0.1 + i) * 3, 34, { t: frame + i * 30 });
  });
  ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif';
  ctx.fillText(`クリアターン：${turnCount}（目標 ${stage.par}）`, W / 2, 380);
  if (t > 40) {
    const rs = 1 + Math.max(0, 1 - (t - 40) / 10) * 2;
    const rc = { S: '#ffe14d', A: '#ff8a3c', B: '#6ad0ff' }[winInfo.rank];
    ctx.font = `900 italic ${Math.round(56 * rs)}px sans-serif`;
    ctx.lineWidth = 8; ctx.strokeStyle = '#000'; ctx.strokeText('RANK ' + winInfo.rank, W / 2, 445);
    ctx.fillStyle = rc; ctx.fillText('RANK ' + winInfo.rank, W / 2, 445);
  }
  button(BTN_RETRY, 'もう一度', '#2a5a3a');
  button(BTN_BACK, 'タイトルへ', '#2a3a7a');
}

function drawLose() {
  ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.font = '900 italic 46px sans-serif';
  ctx.lineWidth = 8; ctx.strokeStyle = '#000'; ctx.strokeText('GAME OVER', W / 2, 300);
  ctx.fillStyle = '#ff4a4a'; ctx.fillText('GAME OVER', W / 2, 300);
  ctx.fillStyle = '#ccc'; ctx.font = '14px sans-serif';
  ctx.fillText('属性相性や雷耐性を考えてパーティを組み直そう', W / 2, 350);
  button(BTN_RETRY, 'リトライ', '#7a2030');
  button(BTN_BACK, 'タイトルへ', '#2a3a7a');
}

function drawTitle() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2a1660'); g.addColorStop(1, '#07070f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 40; i++) {
    ctx.globalAlpha = 0.3 + 0.3 * Math.sin(frame * 0.05 + i);
    circle(ctx, (i * 113) % W, (i * 71) % 320, 1 + (i % 2)); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // キャラクターが並ぶ
  const show = [CHARACTERS[3], CHARACTERS[0], CHARACTERS[2], CHARACTERS[1]];
  show.forEach((c, i) => drawPortrait(ctx, c, 70 + i * 93, 225 + Math.sin(frame * 0.05 + i) * 5, 30, { t: frame + i * 40 }));
  ctx.textAlign = 'center';
  ctx.font = '900 italic 46px sans-serif'; ctx.lineWidth = 9; ctx.strokeStyle = '#000';
  ctx.strokeText('ハジキ・ブレイブ', W / 2, 105);
  const tg = ctx.createLinearGradient(0, 70, 0, 110);
  tg.addColorStop(0, '#fff6a0'); tg.addColorStop(1, '#ff9a20');
  ctx.fillStyle = tg; ctx.fillText('ハジキ・ブレイブ', W / 2, 105);
  ctx.font = 'bold 15px sans-serif'; ctx.fillStyle = '#fff';
  ctx.fillText('引っ張って、はじいて、神話をぶっとばせ！', W / 2, 140);
  STAGES.forEach((s, i) => {
    const r = stageBtn(i);
    button(r, '', s.bg[0]);
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`${i + 1}. ${s.name}`, r.x + 18, r.y + 36);
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#ffe14d';
    ctx.fillText('難易度 ' + '★'.repeat(s.diff) + '☆'.repeat(3 - s.diff) + (s.walls.length ? '　⚡雷の壁あり' : ''), r.x + 18, r.y + 62);
    if (cleared[i]) {
      ctx.textAlign = 'right'; ctx.font = '900 italic 30px sans-serif'; ctx.fillStyle = '#ffe14d';
      ctx.fillText(cleared[i], r.x + r.w - 16, r.y + 56);
    }
  });
  ctx.textAlign = 'center'; ctx.fillStyle = '#999'; ctx.font = '12px sans-serif';
  ctx.fillText('炎→風→水→炎 / 光⇔闇 に有利（1.5倍）', W / 2, 668);
  ctx.fillText('味方に触れるとリンクスキル・ボスの弱点は3倍', W / 2, 688);
  ctx.fillText('ゲージが満タンの瞬間に離すと JUST SHOT', W / 2, 708);
}

function drawParty() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a1840'); g.addColorStop(1, '#07070f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('パーティ編成', 14, 32);
  ctx.font = '12px sans-serif'; ctx.fillStyle = '#aaa';
  ctx.fillText(`${STAGES[stageIdx].name}${STAGES[stageIdx].walls.length ? '（⚡雷の壁：雷耐性が有効）' : ''}`, 14, 52);

  CHARACTERS.forEach((c, i) => {
    const r = tileRect(i), el = EL[c.el], k = party.indexOf(c.id);
    const tg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    tg.addColorStop(0, el.color); tg.addColorStop(1, el.dark);
    ctx.fillStyle = tg; roundRect(ctx, r.x, r.y, r.w, r.h, 8); ctx.fill();
    ctx.save(); roundRect(ctx, r.x, r.y, r.w, r.h, 8); ctx.clip();
    drawPortrait(ctx, c, r.x + r.w / 2, r.y + 44, 26, { t: frame + i * 30 });
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(r.x, r.y + r.h - 30, r.w, 30);
    ctx.restore();
    ctx.strokeStyle = detailIdx === i ? '#fff' : 'rgba(255,255,255,0.3)'; ctx.lineWidth = detailIdx === i ? 3 : 1;
    roundRect(ctx, r.x, r.y, r.w, r.h, 8); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(c.name, r.x + r.w / 2, r.y + r.h - 16);
    ctx.fillStyle = '#ffe14d'; ctx.font = '8px sans-serif';
    ctx.fillText('★'.repeat(c.rarity), r.x + r.w / 2, r.y + r.h - 4);
    if (k >= 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(ctx, r.x, r.y, r.w, r.h, 8); ctx.fill();
      ctx.fillStyle = '#ff3b6b'; circle(ctx, r.x + r.w - 14, r.y + 14, 11); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '900 13px sans-serif'; ctx.textBaseline = 'middle';
      ctx.fillText(k + 1, r.x + r.w - 14, r.y + 15); ctx.textBaseline = 'alphabetic';
    }
  });

  // 詳細
  const c = CHARACTERS[detailIdx], el = EL[c.el];
  const py = 320;
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; roundRect(ctx, 12, py, W - 24, 300, 12); ctx.fill();
  ctx.strokeStyle = el.color; ctx.lineWidth = 2; ctx.stroke();
  ctx.save(); roundRect(ctx, 12, py, W - 24, 300, 12); ctx.clip();
  const bg = ctx.createRadialGradient(95, py + 120, 10, 95, py + 120, 120);
  bg.addColorStop(0, el.light); bg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bg; ctx.fillRect(12, py, 170, 300);
  drawPortrait(ctx, c, 95, py + 95, 46, { t: frame });
  ctx.restore();
  ctx.textAlign = 'left';
  const tx = 185;
  ctx.fillStyle = el.light; ctx.font = 'bold 11px sans-serif'; ctx.fillText(c.title, tx, py + 24);
  ctx.fillStyle = '#fff'; ctx.font = '900 22px sans-serif'; ctx.fillText(c.name, tx, py + 50);
  ctx.fillStyle = '#ffe14d'; ctx.font = '12px sans-serif'; ctx.fillText('★'.repeat(c.rarity), tx, py + 68);
  const lines = [
    [`${el.name}属性 / ${c.type === 'pierce' ? '貫通' : '反射'}タイプ`, '#fff'],
    [`HP ${c.hp}　攻撃 ${c.atk}`, '#fff'],
    ['アビリティ：' + c.abilities.map(a => ABILITIES[a].name).join('・'), '#8ad8ff'],
    ['リンク：' + LINKS[c.link].name, '#a8f0c0'],
    ['　' + LINKS[c.link].desc, '#ccc'],
    [`スキル：${c.skill.name}（${c.skill.turns}T）`, '#ffd08a'],
    ['　' + c.skill.desc, '#ccc'],
  ];
  ctx.font = '12px sans-serif';
  lines.forEach(([s, col], i) => { ctx.fillStyle = col; ctx.fillText(s, tx, py + 92 + i * 20); });
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'italic 13px sans-serif';
  ctx.fillText(`「${c.quote}」`, W / 2, py + 285);

  // 選択中
  for (let i = 0; i < 4; i++) {
    const x = 50 + i * 60, y = 662;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5; circle(ctx, x, y, 24); ctx.stroke();
    if (party[i]) drawUnitIcon(CHAR_BY_ID[party[i]], x, y, 21, frame + i * 20);
  }
  ctx.textAlign = 'left'; ctx.fillStyle = '#aaa'; ctx.font = '11px sans-serif';
  ctx.fillText('タップで編成（4体）', 290, 666);
  button(BTN_BACK_PARTY, '戻る', '#444');
  button(BTN_SORTIE, party.length === 4 ? '出撃！' : `あと${4 - party.length}体`, party.length === 4 ? '#c03a20' : '#444');
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
