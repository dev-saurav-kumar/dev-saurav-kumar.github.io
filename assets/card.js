// Draws the 1200 x 630 picture shown when a page is shared on LinkedIn, WhatsApp and
// similar apps: dark background, a label, the title and the site address.
const W = 1200;
const H = 630;
const PAD = 80;

// Splits text into lines that fit `width`.
const wrap = (ctx, text, width) => {
  const lines = [];
  let line = '';
  text.split(/\s+/).forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  });
  if (line) lines.push(line);
  return lines;
};

export const drawCard = async ({ label, title, footer = 'dev-saurav-kumar.github.io' }) => {
  await Promise.all([document.fonts.load('700 60px Poppins'), document.fonts.load('600 24px Inter')]).catch(() => {});

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background: navy, a faint grid and a blue glow, like the site's dark sections.
  ctx.fillStyle = '#0a0f1e';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 44) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.stroke();
  }
  const glow = ctx.createRadialGradient(W * 0.88, 0, 0, W * 0.88, 0, W * 0.6);
  glow.addColorStop(0, 'rgba(37, 99, 235, 0.45)');
  glow.addColorStop(1, 'rgba(37, 99, 235, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Brand: the SK mark and the name.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(PAD, PAD - 10, 56, 56, 12);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 22px Poppins, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText('SK', PAD + 28, PAD + 19);
  ctx.textAlign = 'left';
  ctx.font = '700 28px Poppins, sans-serif';
  ctx.fillText('Saurav Kumar', PAD + 76, PAD + 19);

  // Label with the amber line before it.
  const labelY = 236;
  ctx.fillStyle = '#f5a524';
  ctx.fillRect(PAD, labelY - 1, 40, 3);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 20px Inter, sans-serif';
  ctx.letterSpacing = '3px';
  ctx.fillText(label.toUpperCase(), PAD + 56, labelY);
  ctx.letterSpacing = '0px';

  // Title: as large as fits in the space between the label and the address.
  const maxWidth = W - PAD * 2;
  const space = 250;
  let size = 64;
  let lines;
  let lineHeight;
  for (;;) {
    ctx.font = `700 ${size}px Poppins, sans-serif`;
    lines = wrap(ctx, title, maxWidth);
    lineHeight = Math.round(size * 1.18);
    if (lines.length * lineHeight <= space || size <= 36) break;
    size -= 4;
  }
  ctx.textBaseline = 'top';
  lines.slice(0, Math.floor(space / lineHeight)).forEach((line, i) => ctx.fillText(line, PAD, 280 + i * lineHeight));

  // Address at the bottom.
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#93a0b8';
  ctx.font = '500 22px Inter, sans-serif';
  ctx.fillText(footer, PAD, H - 56);

  return canvas.toDataURL('image/jpeg', 0.9);
};
