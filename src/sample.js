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
