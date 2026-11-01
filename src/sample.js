// デモ用の間取り図画像（2LDK）をキャンバスで生成する。1px = 1cm
export const SAMPLE_SCALE = 0.01;

export function drawSamplePlan() {
  const M = 90; // 余白
  const W = 900;
  const H = 660;
  const canvas = document.createElement('canvas');
  canvas.width = W + M * 2;
  canvas.height = H + M * 2;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.translate(M, M);

  const OUT = 16;
  const IN = 10;
  g.fillStyle = '#1a1a1a';
  const hWall = (x0, x1, y, t) => g.fillRect(x0 - t / 2, y - t / 2, x1 - x0 + t, t);
  const vWall = (y0, y1, x, t) => g.fillRect(x - t / 2, y0 - t / 2, t, y1 - y0 + t);

  // 外壁・間仕切りを描いてから、窓・ドアの位置を白で抜く
  hWall(0, W, 0, OUT); hWall(0, W, H, OUT);
  vWall(0, H, 0, OUT); vWall(0, H, W, OUT);
  vWall(0, H, 500, IN);
  hWall(500, 900, 330, IN);
  hWall(0, 220, 440, IN);
  vWall(440, H, 220, IN);
  g.fillStyle = '#fff';
  const gapH = (x0, x1, y, t) => g.fillRect(x0, y - t / 2 - 1, x1 - x0, t + 2);
  const gapV = (y0, y1, x, t) => g.fillRect(x - t / 2 - 1, y0, t + 2, y1 - y0);
  const windows = [[100, 280, 0, 'h'], [620, 780, 0, 'h'], [420, 560, W, 'v'], [200, 320, 0, 'v']];
  for (const [s0, s1, c, dir] of windows) (dir === 'h' ? gapH : gapV)(s0, s1, c, OUT);
  gapH(300, 390, H, OUT); // 玄関
  gapV(120, 200, 500, IN);
  gapV(450, 530, 500, IN);
  gapV(480, 560, 220, IN);

  // 窓（細い三重線）
  g.strokeStyle = '#1a1a1a';
  g.lineWidth = 1;
  for (const [s0, s1, c, dir] of windows) {
    for (const d of [-OUT / 2 + 0.5, 0.5, OUT / 2 - 0.5]) {
      g.beginPath();
      if (dir === 'h') { g.moveTo(s0, c + d); g.lineTo(s1, c + d); } else { g.moveTo(c + d, s0); g.lineTo(c + d, s1); }
      g.stroke();
    }
  }

  // 吊元から開いた扉の線と軌跡の円弧（壁の中心線上には線を引かない）
  const door = (hx, hy, r, a0, a1) => {
    g.beginPath(); g.moveTo(hx, hy); g.arc(hx, hy, r, a0, a1); g.stroke();
  };
  door(500, 120, 80, 0, Math.PI / 2);
  door(500, 450, 80, 0, Math.PI / 2);
  door(220, 480, 80, Math.PI / 2, Math.PI);
  door(300, H, 90, -Math.PI / 2, 0);

  // 室名
  g.fillStyle = '#333';
  g.font = '22px sans-serif';
  g.textAlign = 'center';
  g.fillText('LDK 14.5帖', 250, 230);
  g.fillText('洋室 6.5帖', 700, 170);
  g.fillText('洋室 6.5帖', 700, 500);
  g.fillText('浴室・洗面', 110, 560);
  g.fillText('玄関', 345, 610);

  // 寸法線
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, -50); g.lineTo(W, -50);
  g.moveTo(0, -60); g.lineTo(0, -40);
  g.moveTo(W, -60); g.lineTo(W, -40);
  g.moveTo(-50, 0); g.lineTo(-50, H);
  g.moveTo(-60, 0); g.lineTo(-40, 0);
  g.moveTo(-60, H); g.lineTo(-40, H);
  g.stroke();
  g.font = '16px sans-serif';
  g.fillText('9,000', W / 2, -58);
  g.save();
  g.translate(-58, H / 2);
  g.rotate(-Math.PI / 2);
  g.fillText('6,600', 0, 0);
  g.restore();

  return canvas;
}

/**
 * 不動産の間取り図風のカラーサンプル（和室・浴室・洗面・トイレ・玄関・LDK）。1px = 1cm
 * 室内を色で塗り、壁は黒、ドア・窓の位置は壁を抜いている。
 */
export function drawColorSamplePlan() {
  const M = 80;
  const W = 1000;
  const H = 700;
  const canvas = document.createElement('canvas');
  canvas.width = W + M * 2;
  canvas.height = H + M * 2;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.translate(M, M);

  const BEIGE = '#f2e2be';
  const GREEN = '#cddea5';
  const BLUE = '#bedeee';
  const GRAY = '#d9d9d9';
  const rect = (x0, y0, x1, y1, c) => { g.fillStyle = c; g.fillRect(x0, y0, x1 - x0, y1 - y0); };
  // 床の塗り
  rect(0, 0, 330, 300, BEIGE); // 洋室1
  rect(330, 0, 640, 300, BEIGE); // 洋室2
  rect(640, 0, 1000, 330, GREEN); // 和室
  rect(0, 300, 640, 400, BEIGE); // 廊下
  rect(320, 400, 430, 520, BEIGE);
  rect(0, 400, 200, 520, BLUE); // 洗面
  rect(0, 520, 200, 700, BLUE); // 浴室
  rect(200, 400, 320, 520, BLUE); // トイレ
  rect(200, 520, 430, 700, GRAY); // 玄関
  rect(430, 400, 1000, 700, BEIGE); // LDK
  rect(640, 330, 1000, 400, BEIGE);
  // 畳の目（6 畳）
  g.strokeStyle = '#a9bf86';
  g.lineWidth = 2;
  for (const [x0, y0, x1, y1] of [[640, 165, 1000, 165], [820, 0, 820, 165], [760, 165, 760, 330], [880, 165, 880, 330]]) {
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }

  // 壁
  const OUT = 14;
  const IN = 8;
  g.fillStyle = '#262626';
  const hWall = (x0, x1, y, t) => g.fillRect(x0 - t / 2, y - t / 2, x1 - x0 + t, t);
  const vWall = (y0, y1, x, t) => g.fillRect(x - t / 2, y0 - t / 2, t, y1 - y0 + t);
  hWall(0, W, 0, OUT); hWall(0, W, H, OUT); vWall(0, H, 0, OUT); vWall(0, H, W, OUT);
  vWall(0, 300, 330, IN); vWall(0, 400, 640, IN);
  hWall(0, 640, 300, IN); hWall(640, 1000, 330, IN);
  hWall(0, 320, 400, IN); hWall(430, 640, 400, IN);
  vWall(400, 700, 200, IN); hWall(0, 200, 520, IN); hWall(200, 320, 520, IN);
  vWall(400, 520, 320, IN); vWall(400, 700, 430, IN);

  // ドア・窓の位置を抜く（床色で塗り直す）
  const gapH = (x0, x1, y, t, c) => { g.fillStyle = c; g.fillRect(x0, y - t / 2 - 1, x1 - x0, t + 2); };
  const gapV = (y0, y1, x, t, c) => { g.fillStyle = c; g.fillRect(x - t / 2 - 1, y0, t + 2, y1 - y0); };
  gapH(120, 200, 300, IN, BEIGE); // 洋室1
  gapH(450, 530, 300, IN, BEIGE); // 洋室2
  gapH(700, 860, 330, IN, BEIGE); // 和室（ふすま）
  gapH(80, 160, 400, IN, BEIGE); // 洗面
  gapH(60, 140, 520, IN, BLUE); // 浴室
  gapV(430, 500, 320, IN, BEIGE); // トイレ
  gapV(420, 500, 430, IN, BEIGE); // LDK
  gapH(260, 360, H, OUT, '#fff'); // 玄関ドア
  const windows = [[80, 250, 0, 'h'], [400, 570, 0, 'h'], [720, 920, 0, 'h'], [600, 900, H, 'h'], [450, 650, W, 'v']];
  for (const [s0, s1, c, dir] of windows) {
    (dir === 'h' ? gapH : gapV)(s0, s1, c, OUT, '#fff');
    g.strokeStyle = '#262626';
    g.lineWidth = 1;
    for (const d of [-OUT / 2 + 0.5, 0.5, OUT / 2 - 0.5]) {
      g.beginPath();
      if (dir === 'h') { g.moveTo(s0, c + d); g.lineTo(s1, c + d); } else { g.moveTo(c + d, s0); g.lineTo(c + d, s1); }
      g.stroke();
    }
  }

  // 浴槽とキッチンの記号（白抜き）
  g.fillStyle = '#fff';
  g.strokeStyle = '#555';
  g.lineWidth = 2;
  g.fillRect(20, 560, 160, 80); g.strokeRect(20, 560, 160, 80);
  g.fillRect(480, 420, 250, 65); g.strokeRect(480, 420, 250, 65);

  // 室名
  g.fillStyle = '#333';
  g.font = '24px sans-serif';
  g.textAlign = 'center';
  for (const [t, x, y] of [['洋室 5.5帖', 165, 160], ['洋室 5.5帖', 485, 160], ['和室 6帖', 820, 250], ['LDK 15帖', 720, 590],
    ['浴室', 100, 680], ['洗面', 100, 470], ['WC', 260, 470], ['玄関', 315, 630]]) g.fillText(t, x, y);
  return canvas;
}
