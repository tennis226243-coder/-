'use strict';
// キャラクター・モンスターの描画（すべてCanvasで手続き的に描く）

function ellipse(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2); }
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0, r), 0, Math.PI * 2); }
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// ===== キャラクター（デフォルメ顔＋任意で胴体） =====
// s = 頭の半径。opt: { t: フレーム, body: 胴体を描く, lx, ly: 視線 }
function drawChibi(g, c, x, y, s, opt = {}) {
  const L = c.look, t = opt.t || 0, skin = L.skin || '#ffe2cc';
  g.save();
  g.lineJoin = 'round'; g.lineCap = 'round';

  // 背面アクセサリー
  if (L.acc === 'halo') {
    g.save(); g.translate(x, y - s * 0.1); g.rotate(t * 0.01);
    g.fillStyle = 'rgba(255,214,80,0.55)';
    for (let i = 0; i < 12; i++) {
      g.rotate(Math.PI / 6);
      g.beginPath(); g.moveTo(-s * 0.1, -s * 1.25); g.lineTo(0, -s * 1.75); g.lineTo(s * 0.1, -s * 1.25); g.fill();
    }
    g.restore();
    g.strokeStyle = '#ffd84a'; g.lineWidth = s * 0.1; circle(g, x, y - s * 0.1, s * 1.28); g.stroke();
  }
  if (L.acc === 'wing') {
    for (const sd of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i % 2 ? '#e8eeff' : '#ffffff';
        ellipse(g, x + sd * s * (1.05 + i * 0.12), y - s * (0.55 + i * 0.12), s * 0.42, s * 0.13, sd * (-0.6 - i * 0.25));
        g.fill(); g.strokeStyle = '#9aa8c8'; g.lineWidth = s * 0.03; g.stroke();
      }
    }
  }

  // 後ろ髪
  g.fillStyle = L.hair;
  if (L.style === 'long') { roundRect(g, x - s * 1.12, y - s * 0.5, s * 2.24, s * 2.2, s * 0.6); g.fill(); }
  if (L.style === 'bob') { ellipse(g, x, y + s * 0.2, s * 1.18, s * 1.05); g.fill(); }
  if (L.style === 'twin') {
    for (const sd of [-1, 1]) {
      const sw = Math.sin(t * 0.08 + sd) * 0.08;
      ellipse(g, x + sd * s * 1.2, y + s * 0.65, s * 0.38, s * 1.05, sd * (0.25 + sw)); g.fill();
      g.fillStyle = '#ff70c0'; circle(g, x + sd * s * 0.95, y - s * 0.35, s * 0.15); g.fill(); g.fillStyle = L.hair;
    }
  }
  if (L.style === 'spiky' || L.style === 'wild') {
    const n = L.style === 'wild' ? 9 : 7, len = L.style === 'wild' ? 1.75 : 1.55;
    for (let i = 0; i < n; i++) {
      const a = Math.PI + 0.25 - (i / (n - 1)) * (Math.PI + 0.5);
      const ang = -a, sp = 0.32;
      g.beginPath();
      g.moveTo(x + Math.cos(ang - sp) * s * 0.85, y + Math.sin(ang - sp) * s * 0.85);
      g.lineTo(x + Math.cos(ang) * s * len, y + Math.sin(ang) * s * len);
      g.lineTo(x + Math.cos(ang + sp) * s * 0.85, y + Math.sin(ang + sp) * s * 0.85);
      g.fill();
    }
    if (L.style === 'wild') { ellipse(g, x, y + s * 0.3, s * 1.12, s * 0.95); g.fill(); }
  }

  if (opt.body) drawBody(g, c, x, y, s);

  // 顔
  g.fillStyle = skin; ellipse(g, x, y + s * 0.08, s * 0.95, s * 0.9); g.fill();
  g.strokeStyle = 'rgba(90,40,30,0.35)'; g.lineWidth = s * 0.04; g.stroke();

  // ほお
  g.fillStyle = 'rgba(255,120,140,0.35)';
  ellipse(g, x - s * 0.58, y + s * 0.48, s * 0.17, s * 0.09); g.fill();
  ellipse(g, x + s * 0.58, y + s * 0.48, s * 0.17, s * 0.09); g.fill();

  // 目
  const lx = opt.lx || 0, ly = opt.ly || 0;
  const blink = opt.t !== undefined && (t + c.name.length * 37) % 220 < 6;
  for (const sd of [-1, 1]) {
    const ex = x + sd * s * 0.38 + lx * s * 0.04, ey = y + s * 0.24 + ly * s * 0.03;
    if (blink) {
      g.strokeStyle = '#2a1a1a'; g.lineWidth = s * 0.07;
      g.beginPath(); g.arc(ex, ey - s * 0.05, s * 0.18, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      continue;
    }
    g.fillStyle = '#fff'; ellipse(g, ex, ey, s * 0.21, s * 0.28); g.fill();
    const ig = g.createLinearGradient(ex, ey - s * 0.25, ex, ey + s * 0.25);
    ig.addColorStop(0, '#1a1020'); ig.addColorStop(0.45, L.eye); ig.addColorStop(1, '#ffffff');
    g.fillStyle = ig; ellipse(g, ex + lx * s * 0.03, ey + s * 0.02, s * 0.16, s * 0.23); g.fill();
    g.fillStyle = '#140a18'; ellipse(g, ex + lx * s * 0.04, ey + s * 0.02, s * 0.07, s * 0.12); g.fill();
    g.fillStyle = '#fff';
    circle(g, ex - s * 0.06, ey - s * 0.09, s * 0.065); g.fill();
    circle(g, ex + s * 0.06, ey + s * 0.1, s * 0.03); g.fill();
    g.strokeStyle = '#2a1a1a'; g.lineWidth = s * 0.075;
    g.beginPath(); g.arc(ex, ey + s * 0.04, s * 0.25, 1.12 * Math.PI, 1.88 * Math.PI); g.stroke();
    if (L.brow) {
      g.strokeStyle = L.hair; g.lineWidth = s * 0.08;
      g.beginPath(); g.moveTo(ex - sd * s * 0.2, ey - s * 0.42); g.lineTo(ex + sd * s * 0.18, ey - s * 0.32); g.stroke();
    }
  }

  // 口
  g.strokeStyle = '#7a2a2a'; g.lineWidth = s * 0.05;
  const my = y + s * 0.6;
  if (L.mouth === 'grin') {
    g.fillStyle = '#9a2030';
    g.beginPath(); g.moveTo(x - s * 0.16, my - s * 0.03); g.quadraticCurveTo(x, my + s * 0.22, x + s * 0.16, my - s * 0.03); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.fillRect(x + s * 0.04, my - s * 0.03, s * 0.07, s * 0.06);
  } else if (L.mouth === 'calm') {
    g.beginPath(); g.moveTo(x - s * 0.08, my); g.lineTo(x + s * 0.08, my); g.stroke();
  } else {
    g.beginPath(); g.arc(x, my - s * 0.08, s * 0.12, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  }

  // 前髪
  const n = L.style === 'spiky' || L.style === 'wild' ? 4 : 5;
  g.fillStyle = L.hair; g.beginPath();
  g.arc(x, y + s * 0.05, s * 1.02, Math.PI - 0.12, Math.PI * 2 + 0.12);
  for (let i = 0; i <= n * 2; i++) {
    const px = x + s * 0.99 - (i / (n * 2)) * s * 1.98;
    const py = i % 2 ? y - s * 0.4 : y - s * 0.06 + (i === 0 || i === n * 2 ? s * 0.35 : 0);
    g.lineTo(px, py);
  }
  g.closePath(); g.fill();
  g.strokeStyle = L.hair2; g.lineWidth = s * 0.09;
  g.beginPath(); g.arc(x - s * 0.1, y - s * 0.3, s * 0.6, Math.PI * 1.15, Math.PI * 1.5); g.stroke();

  drawAccessory(g, L, x, y, s, t);
  g.restore();
}

function drawBody(g, c, x, y, s) {
  const L = c.look, el = EL[c.el];
  g.fillStyle = L.skin || '#ffe2cc'; g.fillRect(x - s * 0.2, y + s * 0.75, s * 0.4, s * 0.45);
  g.fillStyle = L.outfit;
  g.beginPath(); g.moveTo(x - s * 0.5, y + s * 1.05);
  g.quadraticCurveTo(x - s * 1.45, y + s * 1.1, x - s * 1.55, y + s * 2.6);
  g.lineTo(x + s * 1.55, y + s * 2.6);
  g.quadraticCurveTo(x + s * 1.45, y + s * 1.1, x + s * 0.5, y + s * 1.05);
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = s * 0.04; g.stroke();
  // 襟と飾り
  g.fillStyle = el.color;
  g.beginPath(); g.moveTo(x - s * 0.55, y + s * 1.05); g.lineTo(x, y + s * 1.7); g.lineTo(x + s * 0.55, y + s * 1.05);
  g.lineTo(x + s * 0.3, y + s * 1.05); g.lineTo(x, y + s * 1.4); g.lineTo(x - s * 0.3, y + s * 1.05); g.closePath(); g.fill();
  g.fillStyle = '#ffd84a'; circle(g, x, y + s * 1.75, s * 0.13); g.fill();
  for (const sd of [-1, 1]) {
    g.fillStyle = el.color;
    ellipse(g, x + sd * s * 1.15, y + s * 1.35, s * 0.42, s * 0.22, sd * 0.4); g.fill();
    g.strokeStyle = '#ffd84a'; g.lineWidth = s * 0.05; g.stroke();
  }
}

function flame(g, x, y, sz, t, ph) {
  const f = 1 + Math.sin(t * 0.25 + ph) * 0.12;
  g.fillStyle = '#ff5a1c';
  g.beginPath(); g.moveTo(x, y - sz * 1.6 * f);
  g.quadraticCurveTo(x + sz, y - sz * 0.3, x, y + sz * 0.3);
  g.quadraticCurveTo(x - sz, y - sz * 0.3, x, y - sz * 1.6 * f); g.fill();
  g.fillStyle = '#ffd040';
  g.beginPath(); g.moveTo(x, y - sz * 0.9 * f);
  g.quadraticCurveTo(x + sz * 0.5, y - sz * 0.1, x, y + sz * 0.2);
  g.quadraticCurveTo(x - sz * 0.5, y - sz * 0.1, x, y - sz * 0.9 * f); g.fill();
}

function drawAccessory(g, L, x, y, s, t) {
  switch (L.acc) {
    case 'flame':
      flame(g, x - s * 0.55, y - s * 0.95, s * 0.22, t, 0);
      flame(g, x + s * 0.1, y - s * 1.15, s * 0.28, t, 2);
      flame(g, x + s * 0.7, y - s * 0.85, s * 0.2, t, 4);
      break;
    case 'pearl':
      g.fillStyle = '#ff9ac0';
      g.beginPath(); g.moveTo(x + s * 0.75, y - s * 0.45);
      for (let i = 0; i <= 5; i++) {
        const a = Math.PI * 1.1 + i / 5 * Math.PI * 0.8;
        g.lineTo(x + s * 0.75 + Math.cos(a) * s * 0.32, y - s * 0.45 + Math.sin(a) * s * 0.32);
      }
      g.closePath(); g.fill();
      g.fillStyle = '#fff';
      for (let i = 0; i < 3; i++) { circle(g, x + s * (0.45 + i * 0.22), y - s * 0.3 + (i % 2) * s * 0.05, s * 0.09); g.fill(); }
      break;
    case 'band':
      g.strokeStyle = '#d02828'; g.lineWidth = s * 0.17;
      g.beginPath(); g.arc(x, y + s * 0.35, s * 0.93, Math.PI * 1.2, Math.PI * 1.8); g.stroke();
      g.lineWidth = s * 0.12;
      const w = Math.sin(t * 0.15) * s * 0.15;
      g.beginPath(); g.moveTo(x - s * 0.8, y - s * 0.35); g.quadraticCurveTo(x - s * 1.3, y - s * 0.4 + w, x - s * 1.6, y - s * 0.1 + w); g.stroke();
      g.beginPath(); g.moveTo(x - s * 0.8, y - s * 0.35); g.quadraticCurveTo(x - s * 1.2, y - s * 0.1 - w, x - s * 1.45, y + s * 0.25 - w); g.stroke();
      break;
    case 'halo':
      g.fillStyle = '#ffd84a'; circle(g, x, y - s * 0.78, s * 0.16); g.fill();
      g.fillStyle = '#ff7a20'; circle(g, x, y - s * 0.78, s * 0.08); g.fill();
      break;
    case 'moon':
      g.fillStyle = '#fff2a0'; circle(g, x - s * 0.72, y - s * 0.55, s * 0.28); g.fill();
      g.fillStyle = '#b8b0e8'; circle(g, x - s * 0.62, y - s * 0.62, s * 0.24); g.fill();
      break;
    case 'wing':
      g.fillStyle = '#c8d0e8';
      g.beginPath(); g.arc(x, y + s * 0.05, s * 1.03, Math.PI * 1.25, Math.PI * 1.75); g.lineTo(x, y - s * 0.55); g.closePath(); g.fill();
      g.strokeStyle = '#ffd84a'; g.lineWidth = s * 0.06; g.stroke();
      g.fillStyle = '#3a8aff'; circle(g, x, y - s * 0.72, s * 0.1); g.fill();
      break;
    case 'horn':
      for (const sd of [-1, 1]) {
        g.fillStyle = '#e8d070';
        g.beginPath(); g.moveTo(x + sd * s * 0.35, y - s * 0.8);
        g.quadraticCurveTo(x + sd * s * 0.65, y - s * 1.6, x + sd * s * 1.15, y - s * 1.55);
        g.quadraticCurveTo(x + sd * s * 0.75, y - s * 1.3, x + sd * s * 0.65, y - s * 0.7); g.closePath(); g.fill();
        g.strokeStyle = '#7a6020'; g.lineWidth = s * 0.04; g.stroke();
      }
      break;
    case 'fin':
      for (const sd of [-1, 1]) {
        g.fillStyle = '#80f0e8';
        g.beginPath(); g.moveTo(x + sd * s * 0.9, y + s * 0.05);
        g.lineTo(x + sd * s * 1.5, y - s * 0.35); g.lineTo(x + sd * s * 1.35, y + s * 0.15); g.lineTo(x + sd * s * 1.5, y + s * 0.45);
        g.closePath(); g.fill();
        g.strokeStyle = '#30a0b0'; g.lineWidth = s * 0.04; g.stroke();
      }
      break;
  }
}

// ===== モンスター =====
function drawMonster(g, e, t, lx, ly) {
  const c = EL[e.el];
  const wob = Math.sin(t * 0.06 + e.seed) * 2;
  const r = e.r + (e.flash ? Math.sin(e.flash) * 4 : 0);
  const x = e.x, y = e.y + wob;
  const body = (rx, ry) => {
    const gr = g.createRadialGradient(x - rx * 0.3, y - ry * 0.35, rx * 0.1, x, y, Math.max(rx, ry));
    gr.addColorStop(0, e.hit ? '#fff' : c.light); gr.addColorStop(0.7, c.color); gr.addColorStop(1, c.dark);
    return gr;
  };
  g.save(); g.lineJoin = 'round';
  switch (e.art) {
    case 'slime':
      g.fillStyle = body(r, r);
      g.beginPath(); g.moveTo(x - r, y + r * 0.7);
      g.quadraticCurveTo(x - r * 1.05, y - r * 1.1, x, y - r);
      g.quadraticCurveTo(x + r * 1.05, y - r * 1.1, x + r, y + r * 0.7);
      g.quadraticCurveTo(x, y + r * 1.0, x - r, y + r * 0.7); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.6)'; ellipse(g, x - r * 0.4, y - r * 0.5, r * 0.2, r * 0.12, -0.5); g.fill();
      monsterEyes(g, x, y, r * 0.8, lx, ly, '#fff', '#111', true);
      break;
    case 'ghost': {
      g.fillStyle = body(r, r);
      g.beginPath(); g.arc(x, y, r, Math.PI, 0);
      for (let i = 0; i <= 6; i++) g.lineTo(x + r - i / 6 * r * 2, y + r * (0.7 + (i % 2) * 0.35) + Math.sin(t * 0.2 + i) * 3);
      g.closePath(); g.fill();
      g.globalAlpha = 0.4; g.fillStyle = c.light; circle(g, x, y - r * 0.2, r * 1.25); g.fill(); g.globalAlpha = 1;
      monsterEyes(g, x, y, r * 0.8, lx, ly, '#fff', '#111', true);
      break;
    }
    case 'jelly':
      g.strokeStyle = c.color; g.lineWidth = r * 0.12;
      for (let i = 0; i < 5; i++) {
        const bx = x - r * 0.6 + i * r * 0.3;
        g.beginPath(); g.moveTo(bx, y);
        g.quadraticCurveTo(bx + Math.sin(t * 0.1 + i) * r * 0.3, y + r * 0.8, bx, y + r * 1.3); g.stroke();
      }
      g.fillStyle = body(r, r);
      g.beginPath(); g.arc(x, y, r, Math.PI, 0); g.quadraticCurveTo(x, y + r * 0.4, x - r, y); g.fill();
      monsterEyes(g, x, y - r * 0.15, r * 0.7, lx, ly, '#fff', '#111', false);
      break;
    case 'bat': {
      const f = Math.sin(t * 0.3 + e.seed) * 0.4;
      g.fillStyle = c.dark;
      for (const sd of [-1, 1]) {
        g.beginPath(); g.moveTo(x + sd * r * 0.5, y);
        g.lineTo(x + sd * r * 1.7, y - r * (0.7 + f)); g.lineTo(x + sd * r * 1.5, y + r * 0.1);
        g.lineTo(x + sd * r * 1.2, y - r * 0.1); g.lineTo(x + sd * r * 1.0, y + r * 0.4); g.closePath(); g.fill();
      }
      g.fillStyle = body(r, r); circle(g, x, y, r); g.fill();
      for (const sd of [-1, 1]) {
        g.beginPath(); g.moveTo(x + sd * r * 0.3, y - r * 0.8); g.lineTo(x + sd * r * 0.65, y - r * 1.35); g.lineTo(x + sd * r * 0.75, y - r * 0.55); g.fill();
      }
      monsterEyes(g, x, y, r * 0.8, lx, ly, '#ff4040', '#300', true);
      fangs(g, x, y + r * 0.45, r * 0.5);
      break;
    }
    case 'golem': {
      g.fillStyle = body(r, r);
      g.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2, rr = r * (0.88 + ((i * 7919 + Math.floor(e.seed * 10)) % 5) * 0.04);
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.closePath(); g.fill(); g.strokeStyle = c.dark; g.lineWidth = 3; g.stroke();
      g.beginPath(); g.moveTo(x - r * 0.6, y - r * 0.2); g.lineTo(x - r * 0.3, y + r * 0.1); g.lineTo(x - r * 0.4, y + r * 0.5); g.stroke();
      g.shadowColor = c.light; g.shadowBlur = 12; g.fillStyle = c.light;
      g.fillRect(x - r * 0.45, y - r * 0.15, r * 0.3, r * 0.12); g.fillRect(x + r * 0.15, y - r * 0.15, r * 0.3, r * 0.12);
      g.shadowBlur = 0;
      break;
    }
    case 'knight':
      g.fillStyle = c.color;
      g.beginPath(); g.moveTo(x, y - r * 0.9);
      g.quadraticCurveTo(x + r * 0.2, y - r * 1.7, x - r * 0.4, y - r * 1.5 + Math.sin(t * 0.1) * 3); g.lineTo(x - r * 0.1, y - r * 0.9); g.fill();
      { const gr = g.createLinearGradient(x - r, y - r, x + r, y + r);
        gr.addColorStop(0, e.hit ? '#fff' : '#f0f4ff'); gr.addColorStop(0.5, '#a8b0c8'); gr.addColorStop(1, '#4a5068');
        g.fillStyle = gr; }
      circle(g, x, y, r); g.fill();
      g.strokeStyle = c.color; g.lineWidth = 4; g.stroke();
      g.fillStyle = '#111'; roundRect(g, x - r * 0.65, y - r * 0.15, r * 1.3, r * 0.25, r * 0.1); g.fill();
      g.fillStyle = c.light; g.shadowColor = c.light; g.shadowBlur = 10;
      g.fillRect(x - r * 0.45 + lx * 3, y - r * 0.07, r * 0.2, r * 0.09); g.fillRect(x + r * 0.25 + lx * 3, y - r * 0.07, r * 0.2, r * 0.09);
      g.shadowBlur = 0;
      g.strokeStyle = '#4a5068'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, y + r * 0.2); g.lineTo(x, y + r * 0.85); g.stroke();
      break;
    case 'nue': {
      g.fillStyle = c.dark;
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * Math.PI * 2 + Math.sin(t * 0.05) * 0.05;
        g.beginPath();
        g.moveTo(x + Math.cos(a - 0.2) * r * 0.85, y + Math.sin(a - 0.2) * r * 0.85);
        g.lineTo(x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35);
        g.lineTo(x + Math.cos(a + 0.2) * r * 0.85, y + Math.sin(a + 0.2) * r * 0.85); g.fill();
      }
      // 雷の角
      g.fillStyle = '#ffe040';
      for (const sd of [-1, 1]) {
        g.beginPath(); g.moveTo(x + sd * r * 0.35, y - r * 0.75); g.lineTo(x + sd * r * 0.7, y - r * 1.25);
        g.lineTo(x + sd * r * 0.55, y - r * 1.05); g.lineTo(x + sd * r * 0.85, y - r * 1.5); g.lineTo(x + sd * r * 0.5, y - r * 0.8); g.fill();
      }
      g.fillStyle = e.hit ? '#fff' : '#d89040'; circle(g, x, y, r * 0.88); g.fill();
      g.strokeStyle = '#3a2010'; g.lineWidth = r * 0.07;
      for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) {
        g.beginPath(); g.moveTo(x + sd * r * 0.85, y - r * 0.3 + i * r * 0.3); g.lineTo(x + sd * r * 0.55, y - r * 0.2 + i * r * 0.3); g.stroke();
      }
      g.fillStyle = '#f0d0a0'; ellipse(g, x, y + r * 0.35, r * 0.45, r * 0.3); g.fill();
      monsterEyes(g, x, y - r * 0.05, r * 0.8, lx, ly, '#ffe040', '#300', true);
      fangs(g, x, y + r * 0.42, r * 0.6);
      break;
    }
    case 'kraken': {
      g.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        const a = Math.PI * 0.1 + i / 7 * Math.PI * 0.8 + (i < 4 ? -0.9 : 0.9) * 0.3;
        const ang = i < 4 ? Math.PI - (i * 0.35 + 0.1) - 0.2 : (i - 4) * 0.35 + 0.1 + 0.2;
        const ex = x + Math.cos(ang) * r * 1.6, ey = y + Math.sin(ang) * r * 1.0 + r * 0.6;
        g.strokeStyle = c.dark; g.lineWidth = r * 0.2;
        g.beginPath(); g.moveTo(x, y + r * 0.3);
        g.quadraticCurveTo(x + Math.cos(ang) * r * 0.9, y + r * 1.2 + Math.sin(t * 0.08 + i + a) * r * 0.3, ex, ey); g.stroke();
        g.strokeStyle = c.color; g.lineWidth = r * 0.12; g.stroke();
      }
      g.fillStyle = body(r, r);
      g.beginPath(); g.moveTo(x - r * 0.9, y + r * 0.4);
      g.quadraticCurveTo(x - r * 1.1, y - r * 1.4, x, y - r * 1.2);
      g.quadraticCurveTo(x + r * 1.1, y - r * 1.4, x + r * 0.9, y + r * 0.4);
      g.quadraticCurveTo(x, y + r * 0.8, x - r * 0.9, y + r * 0.4); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.25)';
      for (let i = 0; i < 5; i++) { circle(g, x - r * 0.5 + i * r * 0.25, y - r * 0.7 + (i % 2) * r * 0.2, r * 0.08); g.fill(); }
      monsterEyes(g, x, y, r * 0.95, lx, ly, '#ffe060', '#200', true);
      break;
    }
    case 'orochi': {
      g.lineCap = 'round';
      const heads = [];
      for (let i = 0; i < 8; i++) {
        const ang = Math.PI + 0.15 + i / 7 * (Math.PI - 0.3);
        const sw = Math.sin(t * 0.05 + i * 0.9) * 0.08;
        heads.push({ x: x + Math.cos(ang + sw) * r * 1.35, y: y + Math.sin(ang + sw) * r * 1.1 - r * 0.1, i });
      }
      for (const h of heads) {
        g.strokeStyle = c.dark; g.lineWidth = r * 0.22;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo((x + h.x) / 2, h.y + r * 0.5, h.x, h.y); g.stroke();
        g.strokeStyle = c.color; g.lineWidth = r * 0.13; g.stroke();
      }
      g.fillStyle = body(r, r); circle(g, x, y + r * 0.15, r * 0.9); g.fill();
      g.strokeStyle = c.dark; g.lineWidth = 2;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(x, y + r * 0.15, r * (0.3 + i * 0.15), 0.2, Math.PI - 0.2); g.stroke(); }
      for (const h of heads) {
        g.fillStyle = e.hit ? '#fff' : c.color; ellipse(g, h.x, h.y, r * 0.22, r * 0.17); g.fill();
        g.strokeStyle = c.dark; g.lineWidth = 2; g.stroke();
        g.fillStyle = '#ff3030'; circle(g, h.x - r * 0.08, h.y - r * 0.04, r * 0.045); g.fill();
        circle(g, h.x + r * 0.08, h.y - r * 0.04, r * 0.045); g.fill();
      }
      monsterEyes(g, x, y + r * 0.1, r * 0.7, lx, ly, '#ff3030', '#200', true);
      fangs(g, x, y + r * 0.5, r * 0.5);
      break;
    }
  }
  g.restore();
}

function monsterEyes(g, x, y, r, lx, ly, white, pupil, angry) {
  for (const sd of [-1, 1]) {
    const ex = x + sd * r * 0.35, ey = y - r * 0.08;
    g.fillStyle = white; ellipse(g, ex, ey, r * 0.2, r * 0.24); g.fill();
    g.fillStyle = pupil; circle(g, ex + lx * r * 0.08, ey + ly * r * 0.08, r * 0.1); g.fill();
    g.fillStyle = '#fff'; circle(g, ex + lx * r * 0.08 - r * 0.04, ey + ly * r * 0.08 - r * 0.04, r * 0.035); g.fill();
    if (angry) {
      g.strokeStyle = '#111'; g.lineWidth = Math.max(2, r * 0.08); g.lineCap = 'round';
      g.beginPath(); g.moveTo(ex - sd * r * 0.25, ey - r * 0.38); g.lineTo(ex + sd * r * 0.2, ey - r * 0.22); g.stroke();
    }
  }
}

function fangs(g, x, y, w) {
  g.fillStyle = '#fff';
  for (const sd of [-1, 1]) {
    g.beginPath(); g.moveTo(x + sd * w * 0.35, y); g.lineTo(x + sd * w * 0.25, y + w * 0.35); g.lineTo(x + sd * w * 0.15, y); g.fill();
  }
}

function drawHeart(g, x, y, s) {
  g.beginPath(); g.moveTo(x, y + s * 0.9);
  g.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.6, y - s * 1.1, x, y - s * 0.35);
  g.bezierCurveTo(x + s * 0.6, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9); g.fill();
}

// ===== 外部イラスト（assets/characters/<id>.png があれば手描き風の描画より優先） =====
const CHAR_IMG = {}, CHAR_BUST = {};
for (const c of CHARACTERS) {
  const img = new Image();
  img.onload = () => { CHAR_IMG[c.id] = img; CHAR_BUST[c.id] = makeBust(img, c); };
  img.src = `assets/characters/${c.id}.png`;
}

// 全身画像から顔を中心に上半身（高さ bust の割合）を切り出し、下端をフェードさせた画像を作る
function makeBust(img, c) {
  const rate = c.bust || 1, fx = c.face ? c.face.x : 0.5;
  const cv = document.createElement('canvas');
  cv.height = Math.round(img.height * rate);
  cv.width = Math.min(img.width, Math.round(cv.height * 0.8));
  const sx = Math.max(0, Math.min(img.width - cv.width, img.width * fx - cv.width / 2));
  const g = cv.getContext('2d');
  g.drawImage(img, -sx, 0);
  if (rate < 1) {
    g.globalCompositeOperation = 'destination-out';
    const fade = g.createLinearGradient(0, cv.height * 0.8, 0, cv.height);
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = fade; g.fillRect(0, cv.height * 0.8, cv.width, cv.height * 0.2);
  }
  return cv;
}

// 胴体つき立ち絵。drawChibi(body) とほぼ同じ範囲（y-1.8s〜y+2.6s）に収める。opt.full で全身
function drawPortrait(g, c, x, y, s, opt = {}) {
  const img = opt.full ? CHAR_IMG[c.id] : CHAR_BUST[c.id];
  if (!img) { drawChibi(g, c, x, y, s, { ...opt, body: true }); return; }
  const h = s * (opt.full ? 5.2 : 4.4), w = h * img.width / img.height;
  g.drawImage(img, x - w / 2, y - s * (opt.full ? 1.4 : 1.8), w, h);
}

// 丸アイコン用に顔のあたりを切り出す。face: { x, y, size }（画像幅に対する割合）
function drawFace(g, c, x, y, r, opt = {}) {
  const img = CHAR_IMG[c.id];
  if (!img) { drawChibi(g, c, x, y + r * 0.22, r * 0.6, opt); return; }
  const f = c.face || { x: 0.5, y: 0.28, size: 0.42 };
  const side = img.width * f.size;
  g.drawImage(img, img.width * f.x - side / 2, img.height * f.y - side / 2, side, side, x - r, y - r, r * 2, r * 2);
}
