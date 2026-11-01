// 家具の 3D モデル（角を丸めた箱や円柱を組み合わせた手続き的モデル）
// ローカル座標：幅 = x、奥行 = z（背面が -z、正面が +z）、高さ = y（床が 0）
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// 3D ビューは再構築のたびにマテリアルを破棄するので、キャッシュは家具 1 点の中だけで使う
const mats = new Map();
function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!mats.has(key)) {
    const Ctor = opts.sheen ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    mats.set(key, new Ctor({ color, roughness: 0.75, ...opts }));
  }
  return mats.get(key);
}
const fabric = (c) => mat(c, { roughness: 0.95, sheen: 0.6, sheenRoughness: 0.8, sheenColor: new THREE.Color(c).offsetHSL(0, 0, 0.15) });
const wood = (c) => mat(c, { roughness: 0.55 });
const metal = (c = '#2f3337') => mat(c, { roughness: 0.35, metalness: 0.8 });
const white = () => mat('#f6f6f4', { roughness: 0.35 });
const shade = (c) => new THREE.Color(c).offsetHSL(0, 0, -0.12).getStyle();

function add(group, geom, material, x, y, z) {
  const m = new THREE.Mesh(geom, material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  group.add(m);
  return m;
}
/** 角丸の箱（y は箱の中心の高さ） */
function rbox(group, w, h, d, x, y, z, material, r = 0.02) {
  const radius = Math.max(0.001, Math.min(r, w / 2, h / 2, d / 2) - 0.0005);
  return add(group, new RoundedBoxGeometry(w, h, d, 2, radius), material, x, y, z);
}
function box(group, w, h, d, x, y, z, material) {
  return add(group, new THREE.BoxGeometry(w, h, d), material, x, y, z);
}
function cyl(group, rTop, rBottom, h, x, y, z, material, seg = 16) {
  return add(group, new THREE.CylinderGeometry(rTop, rBottom, h, seg), material, x, y, z);
}
function legs(group, w, d, h, material, inset = 0.05, r = 0.02, taper = 0.7) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    cyl(group, r, r * taper, h, sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset), material, 10);
  }
}

// ---- 各家具 ----
function sofa(g, { w, d, h }, color, seats = Math.max(1, Math.round(w / 0.62))) {
  const c = fabric(color);
  const legH = 0.08;
  const arm = Math.min(0.2, w * 0.14);
  const baseH = h * 0.32;
  const innerW = w - arm * 2;
  rbox(g, w, baseH, d, 0, legH + baseH / 2, 0, fabric(shade(color)), 0.03);
  for (const s of [-1, 1]) rbox(g, arm, h * 0.72 - legH, d, s * (w / 2 - arm / 2), legH + (h * 0.72 - legH) / 2, 0, c, 0.06);
  const backD = d * 0.24;
  rbox(g, innerW, h - legH - baseH, backD, 0, legH + baseH + (h - legH - baseH) / 2, -d / 2 + backD / 2, c, 0.05);
  // 座面・背もたれのクッション
  const cw = innerW / seats;
  for (let i = 0; i < seats; i++) {
    const x = -innerW / 2 + cw * (i + 0.5);
    rbox(g, cw - 0.01, 0.13, d - backD - 0.02, x, legH + baseH + 0.065, backD / 2, c, 0.05);
    rbox(g, cw - 0.03, h * 0.42, 0.16, x, legH + baseH + 0.12 + h * 0.21, -d / 2 + backD + 0.06, c, 0.06);
  }
  legs(g, w - 0.04, d - 0.04, legH, wood('#5b4331'), 0.04, 0.018);
}

function sofaL(g, { w, d, h }, color) {
  // 背面側に 3 人掛け、右側に手前まで伸びるカウチ
  const mainD = Math.min(0.9, d * 0.55);
  const main = new THREE.Group();
  sofa(main, { w, d: mainD, h }, color, 3);
  main.position.z = -d / 2 + mainD / 2;
  g.add(main);
  const chaiseW = Math.min(0.85, w * 0.4);
  const len = d - mainD;
  const chaise = new THREE.Group();
  chaise.position.set(w / 2 - chaiseW / 2, 0, d / 2 - len / 2);
  rbox(chaise, chaiseW, h * 0.32, len, 0, 0.08 + h * 0.16, 0, fabric(shade(color)), 0.03);
  rbox(chaise, chaiseW - 0.04, 0.13, len, 0, 0.08 + h * 0.32 + 0.065, 0, fabric(color), 0.05);
  legs(chaise, chaiseW, len, 0.08, wood('#5b4331'), 0.04, 0.018);
  g.add(chaise);
}

function table(g, { w, d, h }, color) {
  const top = 0.035;
  rbox(g, w, top, d, 0, h - top / 2, 0, wood(color), 0.008);
  box(g, w - 0.16, 0.07, d - 0.16, 0, h - top - 0.035, 0, wood(shade(color)));
  legs(g, w, d, h - top, wood(shade(color)), 0.06, 0.025, 0.65);
}

function chair(g, { w, d, h }, color) {
  const seatH = Math.min(0.44, h * 0.52);
  const c = wood(color);
  rbox(g, w, 0.04, d, 0, seatH, 0, c, 0.01);
  rbox(g, w - 0.04, 0.03, d - 0.06, 0, seatH + 0.035, 0.01, fabric('#d9d2c5'), 0.012);
  legs(g, w, d, seatH - 0.02, c, 0.03, 0.016, 0.8);
  for (const s of [-1, 1]) cyl(g, 0.015, 0.015, h - seatH, s * (w / 2 - 0.03), seatH + (h - seatH) / 2, -d / 2 + 0.03, c, 8);
  rbox(g, w - 0.02, 0.1, 0.025, 0, h - 0.07, -d / 2 + 0.03, c, 0.01);
  rbox(g, w - 0.06, 0.05, 0.02, 0, seatH + (h - seatH) * 0.45, -d / 2 + 0.03, c, 0.008);
}

function diningSet(g, { w, d, h }, color) {
  // 中央のテーブル（幅いっぱい × 奥行 0.8m）と、手前・奥に 2 脚ずつのチェア
  const tableD = Math.min(0.8, d * 0.5);
  table(g, { w, d: tableD, h }, color);
  const chairW = 0.45;
  const chairD = Math.min(0.5, (d - tableD) / 2 + 0.15);
  for (const side of [-1, 1]) {
    for (const k of [-1, 1]) {
      const cg = new THREE.Group();
      chair(cg, { w: chairW, d: chairD, h: 0.82 }, shade(color));
      cg.position.set(k * w * 0.22, 0, side * (tableD / 2 + chairD / 2 - 0.12));
      cg.rotation.y = side > 0 ? Math.PI : 0;
      g.add(cg);
    }
  }
}

function tvboard(g, { w, d, h }, color) {
  const c = wood(color);
  rbox(g, w, h - 0.06, d, 0, 0.06 + (h - 0.06) / 2, 0, c, 0.01);
  for (const s of [-1, 1]) box(g, 0.04, 0.06, d - 0.06, s * (w / 2 - 0.08), 0.03, 0, metal());
  for (const x of [-w / 4, w / 4]) box(g, w / 2 - 0.03, 0.005, 0.004, x, h * 0.55, d / 2 + 0.002, mat('#000000', { transparent: true, opacity: 0.25 }));
  const tvW = Math.min(w * 0.85, 1.25);
  const tvH = tvW * 0.57;
  rbox(g, tvW, tvH, 0.04, 0, h + 0.07 + tvH / 2, -d / 6, mat('#15181c', { roughness: 0.15, metalness: 0.3 }), 0.006);
  box(g, tvW - 0.03, tvH - 0.03, 0.002, 0, h + 0.07 + tvH / 2, -d / 6 + 0.021, mat('#0b0d10', { roughness: 0.05, metalness: 0.5 }));
  box(g, 0.25, 0.012, 0.18, 0, h + 0.006, -d / 6, metal());
  box(g, 0.05, 0.07, 0.03, 0, h + 0.04, -d / 6 - 0.01, metal());
}

function bed(g, { w, d, h }, color) {
  const frame = wood(color);
  const frameH = h * 0.45;
  rbox(g, w, frameH, d, 0, frameH / 2, 0, frame, 0.015);
  rbox(g, w - 0.05, h - frameH + 0.05, d - 0.08, 0, frameH + (h - frameH) / 2, 0.02, mat('#f7f5f0', { roughness: 0.95 }), 0.05);
  rbox(g, w, 0.95, 0.07, 0, 0.475, -d / 2 + 0.035, frame, 0.02);
  // 掛け布団と枕
  rbox(g, w + 0.02, 0.08, d * 0.62, 0, h + 0.03, d * 0.18, fabric('#9fb4c8'), 0.04);
  const pillows = w >= 1.3 ? 2 : 1;
  for (let i = 0; i < pillows; i++) {
    const x = pillows === 1 ? 0 : (i - 0.5) * (w / 2);
    rbox(g, Math.min(0.6, w / pillows - 0.12), 0.12, 0.38, x, h + 0.06, -d / 2 + 0.32, fabric('#ffffff'), 0.05);
  }
}

function rug(g, { w, d, h }, color) {
  const m = rbox(g, w, Math.max(h, 0.012), d, 0, Math.max(h, 0.012) / 2 + 0.002, 0, fabric(color), 0.005);
  m.castShadow = false;
  // 縁取り
  const border = rbox(g, w - 0.12, 0.002, d - 0.12, 0, Math.max(h, 0.012) + 0.003, 0, fabric(shade(color)), 0.001);
  border.castShadow = false;
}

function kitchen(g, { w, d, h }, color) {
  const top = 0.04;
  const bodyH = h - top - 0.1;
  box(g, w - 0.02, 0.1, d - 0.06, 0, 0.05, -0.03, mat('#3b3b3b'));
  box(g, w, bodyH, d, 0, 0.1 + bodyH / 2, 0, mat(color, { roughness: 0.4 }));
  // 扉の目地と取っ手
  const n = Math.max(2, Math.round(w / 0.6));
  for (let i = 1; i < n; i++) box(g, 0.004, bodyH - 0.02, 0.004, -w / 2 + (w / n) * i, 0.1 + bodyH / 2, d / 2 + 0.002, mat('#000000', { transparent: true, opacity: 0.25 }));
  box(g, w - 0.1, 0.015, 0.02, 0, h - top - 0.06, d / 2 + 0.012, metal('#9aa0a6'));
  rbox(g, w + 0.02, top, d + 0.03, 0, h - top / 2, 0.015, mat('#dcd8d0', { roughness: 0.2 }), 0.004);
  // シンクと水栓
  box(g, 0.75, 0.01, d * 0.58, w * 0.18, h + 0.001, 0, metal('#b9bec3'));
  cyl(g, 0.012, 0.012, 0.3, w * 0.18, h + 0.15, -d * 0.36, metal('#c9ced3'), 10);
  box(g, 0.02, 0.02, 0.2, w * 0.18, h + 0.3, -d * 0.27, metal('#c9ced3'));
  // コンロ
  const hobX = -w * 0.3;
  box(g, 0.6, 0.008, d * 0.75, hobX, h + 0.004, 0, mat('#16181a', { roughness: 0.15, metalness: 0.3 }));
  for (const [dx, dz] of [[-0.15, -0.1], [0.15, -0.1], [0, 0.12]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.006, 6, 24), mat('#555a60', { metalness: 0.5 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(hobX + dx, h + 0.01, dz);
    g.add(ring);
  }
}

function cabinet(g, { w, d, h }, color, { doors = Math.max(1, Math.round(w / 0.45)), glassTop = false } = {}) {
  const c = mat(color, { roughness: 0.5 });
  rbox(g, w, h - 0.05, d, 0, 0.05 + (h - 0.05) / 2, 0, c, 0.008);
  box(g, w - 0.02, 0.05, d - 0.04, 0, 0.025, -0.01, mat(shade(color)));
  const line = mat('#000000', { transparent: true, opacity: 0.22 });
  for (let i = 1; i < doors; i++) box(g, 0.004, h - 0.07, 0.004, -w / 2 + (w / doors) * i, 0.05 + (h - 0.05) / 2, d / 2 + 0.002, line);
  if (glassTop) {
    box(g, w - 0.06, h * 0.4, 0.004, 0, h * 0.72, d / 2 + 0.003, mat('#cfe3ef', { roughness: 0.05, transparent: true, opacity: 0.45 }));
    box(g, w - 0.02, 0.006, 0.004, 0, h * 0.5, d / 2 + 0.003, line);
  }
  for (let i = 0; i < doors; i++) {
    const x = -w / 2 + (w / doors) * (i + 0.5) + (i % 2 ? -1 : 1) * (w / doors) * 0.38;
    box(g, 0.012, Math.min(0.18, h * 0.15), 0.02, x, glassTop ? h * 0.42 : Math.min(h * 0.5, 1.0), d / 2 + 0.012, metal('#8d9399'));
  }
}

function fridge(g, { w, d, h }, color) {
  const c = mat(color, { roughness: 0.25, metalness: 0.2 });
  rbox(g, w, h, d, 0, h / 2, 0, c, 0.03);
  box(g, w - 0.01, 0.006, 0.004, 0, h * 0.62, d / 2 + 0.001, mat('#000000', { transparent: true, opacity: 0.3 }));
  for (const y of [h * 0.8, h * 0.4]) box(g, 0.02, 0.3, 0.03, w / 2 - 0.06, y, d / 2 + 0.015, metal('#a7adb3'));
}

function washer(g, { w, d, h }, color) {
  rbox(g, w, h, d, 0, h / 2, 0, mat(color, { roughness: 0.3 }), 0.04);
  const door = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.3, w * 0.3, 0.02, 32), mat('#2e3a44', { roughness: 0.05, metalness: 0.4 }));
  door.rotation.x = Math.PI / 2;
  door.position.set(0, h * 0.45, d / 2 + 0.005);
  g.add(door);
  box(g, w - 0.08, 0.1, 0.01, 0, h - 0.08, d / 2 + 0.002, mat('#d8dde2'));
}

function shelf(g, { w, d, h }, color) {
  const c = wood(color);
  const t = 0.02;
  for (const s of [-1, 1]) box(g, t, h, d, s * (w / 2 - t / 2), h / 2, 0, c);
  box(g, w, h, t, 0, h / 2, -d / 2 + t / 2, c);
  const n = Math.max(2, Math.round(h / 0.35));
  const rand = seeded(Math.round(w * 1000 + h * 100));
  const bookColors = ['#7a3b3b', '#3b5a7a', '#c9a24d', '#4d7a5a', '#e6e1d6', '#5a4d7a'];
  for (let i = 0; i <= n; i++) {
    const y = (h - t) * (i / n) + t / 2;
    box(g, w, t, d, 0, y, 0, c);
    if (i === n) break;
    // 本
    let x = -w / 2 + t + 0.01;
    while (x < w / 2 - t - 0.04 && rand() < 0.93) {
      const bw = 0.02 + rand() * 0.03;
      const bh = (h / n - t) * (0.6 + rand() * 0.3);
      box(g, bw, bh, d * 0.75, x + bw / 2, y + t / 2 + bh / 2, -d * 0.05, mat(bookColors[Math.floor(rand() * bookColors.length)], { roughness: 0.8 }));
      x += bw + 0.002;
    }
  }
}

function desk(g, { w, d, h }, color) {
  table(g, { w, d, h }, color);
  rbox(g, 0.4, h - 0.12, d - 0.08, w / 2 - 0.25, (h - 0.12) / 2 + 0.02, 0, wood(shade(color)), 0.01);
}

function plant(g, { w, h }, color) {
  const potH = Math.min(0.32, h * 0.28);
  cyl(g, w * 0.32, w * 0.24, potH, 0, potH / 2, 0, mat('#e9e4dc', { roughness: 0.6 }), 24);
  const rand = seeded(Math.round(h * 1000));
  const leaf = mat(color, { roughness: 0.7 });
  const leafDark = mat(shade(color), { roughness: 0.7 });
  for (let i = 0; i < 14; i++) {
    const r = w * (0.18 + rand() * 0.16);
    const ang = rand() * Math.PI * 2;
    const rad = rand() * w * 0.3;
    const y = potH + (h - potH) * (0.25 + rand() * 0.65);
    const m = add(g, new THREE.SphereGeometry(r, 12, 10), i % 3 ? leaf : leafDark, Math.cos(ang) * rad, y, Math.sin(ang) * rad);
    m.scale.y = 1.3;
  }
  cyl(g, 0.012, 0.015, (h - potH) * 0.7, 0, potH + (h - potH) * 0.35, 0, mat('#6b5440'), 6);
}

function floorlamp(g, { w, h }, color) {
  cyl(g, w * 0.4, w * 0.45, 0.03, 0, 0.015, 0, metal(), 24);
  cyl(g, 0.012, 0.012, h - 0.3, 0, (h - 0.3) / 2, 0, metal(), 8);
  const shadeMesh = cyl(g, w * 0.32, w * 0.48, 0.3, 0, h - 0.15, 0, mat(color, { roughness: 0.9, emissive: '#ffd9a0', emissiveIntensity: 0.6, side: THREE.DoubleSide }), 24);
  shadeMesh.castShadow = false;
}

function curtain(g, { w, d, h }, color) {
  // 波打つ布（左右 2 枚）とレール
  const c = mat(color, { roughness: 0.95, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const pw = w / 2 - 0.01;
    const geo = new THREE.PlaneGeometry(pw, h - 0.05, 48, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / pw) * Math.PI * 9) * Math.min(0.035, d / 3));
    geo.computeVertexNormals();
    add(g, geo, c, s * (w / 4), (h - 0.05) / 2, 0);
  }
  box(g, w + 0.06, 0.025, 0.04, 0, h - 0.02, -d / 4, metal('#c9ced3'));
}

function bathtub(g, { w, d, h }, color) {
  const c = mat(color, { roughness: 0.2 });
  const t = 0.07;
  rbox(g, w, h, t, 0, h / 2, -d / 2 + t / 2, c, 0.02);
  rbox(g, w, h, t, 0, h / 2, d / 2 - t / 2, c, 0.02);
  rbox(g, t, h, d, -w / 2 + t / 2, h / 2, 0, c, 0.02);
  rbox(g, t, h, d, w / 2 - t / 2, h / 2, 0, c, 0.02);
  rbox(g, w - 0.02, 0.06, d - 0.02, 0, 0.03, 0, c, 0.02);
  // 湯（半透明の水面）
  box(g, w - t * 2, 0.01, d - t * 2, 0, h * 0.7, 0, mat('#9fd0e6', { roughness: 0.05, transparent: true, opacity: 0.55 }));
  cyl(g, 0.015, 0.015, 0.18, w / 2 - 0.15, h + 0.09, -d / 2 + 0.04, metal('#c9ced3'), 10);
}

function toilet(g, { w, d, h }, color) {
  const c = mat(color, { roughness: 0.15 });
  const seatH = Math.min(0.42, h * 0.55);
  // タンク（背面）
  rbox(g, w, h - seatH + 0.05, 0.2, 0, seatH + (h - seatH) / 2 - 0.02, -d / 2 + 0.1, c, 0.03);
  // 便器（楕円の筒）と便座
  const bowl = cyl(g, w * 0.48, w * 0.36, seatH - 0.02, 0, (seatH - 0.02) / 2, d * 0.08, c, 24);
  bowl.scale.z = 1.35;
  const seat = cyl(g, w * 0.5, w * 0.5, 0.03, 0, seatH, d * 0.08, mat('#fbfbfa', { roughness: 0.3 }), 24);
  seat.scale.z = 1.4;
  const lid = cyl(g, w * 0.44, w * 0.44, 0.015, 0, seatH + 0.025, d * 0.08, mat('#fbfbfa', { roughness: 0.3 }), 24);
  lid.scale.z = 1.35;
}

function vanity(g, { w, d, h }, color) {
  const c = mat(color, { roughness: 0.35 });
  const counter = 0.85;
  rbox(g, w, counter - 0.05, d, 0, 0.05 + (counter - 0.05) / 2, 0, c, 0.01);
  box(g, 0.004, counter - 0.15, 0.004, 0, counter / 2, d / 2 + 0.002, mat('#000000', { transparent: true, opacity: 0.2 }));
  rbox(g, w, 0.03, d, 0, counter + 0.015, 0, mat('#ffffff', { roughness: 0.15 }), 0.008);
  const basin = cyl(g, w * 0.3, w * 0.24, 0.02, 0, counter + 0.025, d * 0.05, mat('#dfe5ea', { roughness: 0.1 }), 24);
  basin.scale.z = 0.8;
  cyl(g, 0.012, 0.012, 0.2, 0, counter + 0.13, -d / 2 + 0.06, metal('#c9ced3'), 10);
  // 鏡付きの収納（上部）
  if (h > 1.4) {
    const mh = Math.min(0.75, h - 1.15);
    rbox(g, w, mh, 0.16, 0, h - mh / 2, -d / 2 + 0.08, c, 0.01);
    box(g, w - 0.06, mh - 0.08, 0.004, 0, h - mh / 2, -d / 2 + 0.162, mat('#cfd8de', { roughness: 0.02, metalness: 1 }));
  }
}

function oshiire(g, { w, d, h }, color) {
  const frame = wood('#8b6b4a');
  rbox(g, w, h, d, 0, h / 2, 0, mat('#d9cdb4', { roughness: 0.8 }), 0.005);
  // ふすま 2 枚（上下 2 段に分かれた見た目）
  const paper = mat(color, { roughness: 0.95 });
  for (const s of [-1, 1]) {
    box(g, w / 2 - 0.03, h - 0.06, 0.02, s * w / 4, h / 2, d / 2 + 0.01, paper);
    // 引手（ふすまの外側寄り）
    cyl(g, 0.025, 0.025, 0.006, s * (w / 2 - 0.12), h * 0.5, d / 2 + 0.022, mat('#3a3128'), 12).rotation.x = Math.PI / 2;
  }
  box(g, w, 0.03, 0.03, 0, h - 0.015, d / 2 + 0.015, frame);
  box(g, w, 0.03, 0.03, 0, 0.015, d / 2 + 0.015, frame);
  box(g, 0.02, h, 0.025, 0, h / 2, d / 2 + 0.022, frame);
}

function zataku(g, { w, d, h }, color) {
  const c = wood(color);
  rbox(g, w, 0.05, d, 0, h - 0.025, 0, mat(color, { roughness: 0.3 }), 0.01);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(g, 0.06, h - 0.05, 0.06, sx * (w / 2 - 0.08), (h - 0.05) / 2, sz * (d / 2 - 0.08), c);
  }
}

function zabuton(g, { w, d, h }, color) {
  rbox(g, w, h, d, 0, h / 2, 0, fabric(color), Math.min(0.04, h / 2));
}

function armchair(g, size, color) {
  sofa(g, size, color, 1);
}

// ---- 設備ユニット（部屋まるごと） ----
/** 子グループに家具を作って配置する */
function part(g, build, size, color, x, z, rotY = 0) {
  const sub = new THREE.Group();
  build(sub, size, color);
  sub.position.set(x, 0, z);
  sub.rotation.y = rotY;
  g.add(sub);
  return sub;
}
function tileFloor(g, w, d, color, step) {
  const t = 0.02;
  const m = box(g, w, t, d, 0, t / 2, 0, mat(color, { roughness: 0.4 }));
  m.castShadow = false;
  const line = mat('#9aa3aa', { roughness: 0.6 });
  for (let x = -w / 2 + step; x < w / 2 - 0.01; x += step) box(g, 0.006, 0.002, d, x, t + 0.001, 0, line).castShadow = false;
  for (let z = -d / 2 + step; z < d / 2 - 0.01; z += step) box(g, w, 0.002, 0.006, 0, t + 0.001, z, line).castShadow = false;
}

function unitbath(g, { w, d }, color) {
  tileFloor(g, w, d, '#dfe4e8', 0.2);
  // 奥の壁に沿って浴槽、手前が洗い場
  const tubD = Math.min(0.8, d * 0.48);
  part(g, bathtub, { w: w - 0.04, d: tubD, h: 0.55 }, color, 0, -d / 2 + tubD / 2 + 0.02);
  // 洗い場側の壁（右）にシャワー・水栓・鏡・棚
  const wx = w / 2 - 0.03;
  const zc = (-d / 2 + tubD + d / 2) / 2;
  cyl(g, 0.012, 0.012, 0.9, wx, 1.35, zc + 0.15, metal('#c9ced3'), 10);
  const head = cyl(g, 0.05, 0.05, 0.03, wx - 0.05, 1.82, zc + 0.15, metal('#d5dade'), 16);
  head.rotation.z = Math.PI / 2;
  box(g, 0.06, 0.08, 0.25, wx - 0.02, 0.85, zc + 0.15, metal('#c9ced3'));
  box(g, 0.01, 0.5, 0.35, wx, 1.35, zc - 0.25, mat('#cfd8de', { roughness: 0.02, metalness: 1 }));
  box(g, 0.12, 0.02, 0.45, wx - 0.06, 1.0, zc - 0.25, mat('#ffffff', { roughness: 0.3 }));
  // 風呂椅子と洗面器
  cyl(g, 0.14, 0.16, 0.3, wx - 0.35, 0.15, zc + 0.05, mat('#ffffff', { roughness: 0.3 }), 16);
  cyl(g, 0.13, 0.1, 0.08, wx - 0.12, 0.06, zc + 0.35, mat('#ffffff', { roughness: 0.3 }), 16);
}

function toiletroom(g, { w, d }, color) {
  tileFloor(g, w, d, '#e8e6e1', 0.3);
  // 奥の壁に便器（正面が手前）、横の壁に手洗いと紙巻き器
  part(g, toilet, { w: 0.42, d: 0.72, h: 0.78 }, color, 0, -d / 2 + 0.38);
  const sx = -w / 2 + 0.11;
  rbox(g, 0.2, 0.12, 0.35, sx, 0.82, 0, mat('#ffffff', { roughness: 0.15 }), 0.03);
  cyl(g, 0.008, 0.008, 0.12, sx - 0.05, 0.94, 0, metal('#c9ced3'), 8);
  const paper = cyl(g, 0.06, 0.06, 0.11, w / 2 - 0.08, 0.7, -d / 2 + 0.6, mat('#ffffff', { roughness: 0.9 }), 16);
  paper.rotation.z = Math.PI / 2;
  box(g, 0.02, 0.03, 0.14, w / 2 - 0.01, 0.76, -d / 2 + 0.6, metal('#c9ced3'));
}

function washroom(g, { w, d }, color) {
  // 奥の壁沿いに洗面台（左）と洗濯機（右）
  part(g, vanity, { w: 0.75, d: 0.5, h: 1.9 }, color, -w / 2 + 0.375, -d / 2 + 0.25);
  const pan = box(g, 0.64, 0.06, 0.64, w / 2 - 0.33, 0.03, -d / 2 + 0.32, mat('#f2f4f6', { roughness: 0.3 }));
  pan.castShadow = false;
  part(g, washer, { w: 0.6, d: 0.6, h: 1.0 }, '#f4f5f7', w / 2 - 0.33, -d / 2 + 0.32).position.y = 0.06;
}

function genkan(g, { w, d }, color) {
  // 土間（石）と、奥の上がり框（木）、横に下駄箱、靴
  const doma = box(g, w, 0.03, d, 0, 0.015, 0, mat(color, { roughness: 0.85 }));
  doma.castShadow = false;
  box(g, w, 0.16, 0.1, 0, 0.08, -d / 2 + 0.05, wood('#a87b52'));
  const gw = Math.min(d - 0.15, 1.0);
  part(g, (sub, s, c) => cabinet(sub, s, c, { doors: 2 }), { w: gw, d: 0.38, h: 1.0 }, '#c9b79c', w / 2 - 0.19, 0.05, -Math.PI / 2);
  const shoe = mat('#3b3027', { roughness: 0.6 });
  for (const [x, z] of [[-0.25, 0.1], [-0.13, 0.1], [0.05, 0.25], [0.15, 0.25]]) rbox(g, 0.09, 0.08, 0.26, x, 0.07, z, shoe, 0.03);
  box(g, Math.min(0.8, w * 0.6), 0.01, 0.5, -0.1, 0.035, d / 2 - 0.3, fabric('#7a6a58')).castShadow = false;
}

// ---- 人（シンプルなマネキン風。正面が +z） ----
const SKIN = '#e9c7a6';
const HAIR = '#2f2620';
function limb(g, r, len, x, y, z, material, rotX = 0) {
  const m = add(g, new THREE.CapsuleGeometry(r, Math.max(0.01, len - r * 2), 4, 10), material, x, y, z);
  m.rotation.x = rotX;
  return m;
}
function head(g, r, y, z = 0) {
  add(g, new THREE.SphereGeometry(r, 20, 16), mat(SKIN, { roughness: 0.6 }), 0, y, z);
  const hair = add(g, new THREE.SphereGeometry(r * 1.04, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(HAIR, { roughness: 0.8 }), 0, y + r * 0.05, z - r * 0.06);
  hair.rotation.x = -0.25;
}

function personStanding(g, { w, h }, color) {
  const s = h / 1.7; // 身長 1.7m を基準に全体を拡大縮小
  const cloth = fabric(color);
  const pants = fabric('#3a3f47');
  const skin = mat(SKIN, { roughness: 0.6 });
  const legLen = 0.8 * s;
  const hip = w * 0.22;
  for (const sx of [-1, 1]) {
    limb(g, 0.065 * s, legLen, sx * hip, legLen / 2, 0, pants);
    rbox(g, 0.1 * s, 0.06 * s, 0.24 * s, sx * hip, 0.03 * s, 0.04 * s, mat('#2b2b2b'), 0.02);
  }
  const torsoH = 0.62 * s;
  rbox(g, w * 0.82, torsoH, 0.24 * s, 0, legLen + torsoH / 2 - 0.02 * s, 0, cloth, 0.08 * s);
  for (const sx of [-1, 1]) {
    limb(g, 0.048 * s, 0.6 * s, sx * (w / 2 - 0.02 * s), legLen + torsoH - 0.32 * s, 0, cloth);
    add(g, new THREE.SphereGeometry(0.045 * s, 12, 10), skin, sx * (w / 2 - 0.02 * s), legLen + torsoH - 0.64 * s, 0);
  }
  limb(g, 0.045 * s, 0.1 * s, 0, legLen + torsoH + 0.03 * s, 0, skin);
  head(g, 0.105 * s, h - 0.11 * s);
}

function personSitting(g, { w, d, h }, color) {
  // 座面の高さ 0.45m の椅子に座った姿勢（椅子は含まない）
  const s = h / 1.3;
  const cloth = fabric(color);
  const pants = fabric('#3a3f47');
  const skin = mat(SKIN, { roughness: 0.6 });
  const seatH = 0.45 * s;
  const backZ = -d / 2 + 0.12 * s;
  const kneeZ = backZ + 0.45 * s;
  const hip = w * 0.22;
  for (const sx of [-1, 1]) {
    limb(g, 0.065 * s, 0.48 * s, sx * hip, seatH, (backZ + kneeZ) / 2, pants, Math.PI / 2);
    limb(g, 0.055 * s, seatH, sx * hip, seatH / 2, kneeZ, pants);
    rbox(g, 0.1 * s, 0.06 * s, 0.24 * s, sx * hip, 0.03 * s, kneeZ + 0.06 * s, mat('#2b2b2b'), 0.02);
  }
  const torsoH = 0.6 * s;
  rbox(g, w * 0.82, torsoH, 0.24 * s, 0, seatH + torsoH / 2, backZ, cloth, 0.08 * s);
  for (const sx of [-1, 1]) {
    // 腕は前に出して膝の上
    limb(g, 0.045 * s, 0.3 * s, sx * (w / 2 - 0.03 * s), seatH + torsoH - 0.17 * s, backZ, cloth);
    limb(g, 0.042 * s, 0.32 * s, sx * (w / 2 - 0.05 * s), seatH + torsoH - 0.32 * s, backZ + 0.15 * s, cloth, Math.PI / 2);
    add(g, new THREE.SphereGeometry(0.042 * s, 12, 10), skin, sx * (w / 2 - 0.05 * s), seatH + torsoH - 0.32 * s, backZ + 0.32 * s);
  }
  limb(g, 0.045 * s, 0.1 * s, 0, seatH + torsoH + 0.04 * s, backZ, skin);
  head(g, 0.105 * s, h - 0.11 * s, backZ);
}

function child(g, size, color) {
  // 子どもは頭身を大きめにする
  personStanding(g, size, color);
  g.children.forEach((m) => {
    if (m.geometry?.type === 'SphereGeometry' && m.position.y > size.h * 0.8) m.scale.multiplyScalar(1.25);
  });
}

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const BUILDERS = {
  sofa3: sofa, sofa2: sofa, sofaL, armchair,
  lowtable: table, dining4: table, diningset4: diningSet, desk, chair,
  tvboard, rug, bed1: bed, bed2: bed, bed3: bed, kitchen,
  fridge, cupboard: (g, s, c) => cabinet(g, s, c, { doors: 2, glassTop: true }),
  wardrobe: (g, s, c) => cabinet(g, s, c, { doors: 2 }),
  sideboard: (g, s, c) => cabinet(g, s, c),
  washer, shelf, plant, floorlamp, curtain,
  bathtub, toilet, vanity, oshiire, zataku, zabuton,
  getabako: (g, s, c) => cabinet(g, s, c, { doors: 2 }),
  person: personStanding, 'person-sit': personSitting, child,
  unitbath, toiletroom, washroom, genkan,
};

/** 家具 1 点の 3D グループ（位置・回転は呼び出し側で設定） */
export function buildFurniture3D(f, { highlight } = {}) {
  mats.clear();
  const g = new THREE.Group();
  g.name = `Furniture_${f.name}_${f.id}`;
  const color = highlight ?? f.color;
  const build = BUILDERS[f.type] ?? ((gr, s, c) => rbox(gr, s.w, s.h, s.d, 0, s.h / 2, 0, mat(c), 0.02));
  build(g, f, color);
  if (highlight) {
    g.traverse((o) => {
      if (o.material && !o.material.emissive?.getHex()) {
        o.material = o.material.clone();
        o.material.emissive = new THREE.Color(highlight);
        o.material.emissiveIntensity = 0.25;
      }
    });
  }
  return g;
}
