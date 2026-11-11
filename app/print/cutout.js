/* cutout.js — умное вырезание фона у загруженного макета. Всё считается в браузере, файл никуда не уходит.

   Решение «убирать или нет»:
   1. У картинки уже есть прозрачность — не трогаем: человек сам подготовил файл.
   2. Смотрим рамку по краю кадра. Если почти вся она одного цвета (белый, чёрный, любой ровный) — это фон.
      Если края разные — это фотография или рисунок во весь кадр: оставляем как есть, напечатается прямоугольником.
   3. Фон убираем заливкой от краёв, поэтому белое ВНУТРИ рисунка (глаза, блики, белые буквы на плашке) остаётся.
   4. Исключение — макет в один цвет (чёрный логотип на белом): там всё, что цвета фона, — не краска,
      поэтому убираем и «окошки» внутри букв.
   5. Край делаем мягким и вычищаем из него цвет фона, чтобы на тёмной вещи не было светлой каймы.
   6. Пустые поля обрезаем: размер макета на вещи считается по самому рисунку.

   cutout(img) → { url, blob, px:[w,h], bg:'#rrggbb', mono:boolean } или { skip:'alpha'|'photo'|'empty'|'error' } */

const MAX_SIDE = 2200;       /* больше — уменьшаем для примерки; исходный файл в заявке остаётся целым */
const EDGE_SHARE = .86;      /* доля рамки одного цвета, начиная с которой это фон */

const hex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

export function cutout(img) {
  try { return run(img); } catch (e) { console.warn('fabrika-v6: фон не вырезан', e); return { skip: 'error' }; }
}

function run(img) {
  const W0 = img.naturalWidth, H0 = img.naturalHeight;
  if (!W0 || !H0) return { skip: 'error' };
  const k = Math.min(1, MAX_SIDE / Math.max(W0, H0));
  const W = Math.max(1, Math.round(W0 * k)), H = Math.max(1, Math.round(H0 * k));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const image = ctx.getImageData(0, 0, W, H), d = image.data, N = W * H;

  /* 1. уже прозрачная */
  let clear = 0;
  for (let i = 3; i < d.length; i += 4 * 7) if (d[i] < 250) clear++;
  if (clear / (N / 7) > .005) return { skip: 'alpha' };

  /* 2. цвет рамки: самый частый оттенок по краю кадра */
  const edge = [];
  const stepX = Math.max(1, Math.floor(W / 600)), stepY = Math.max(1, Math.floor(H / 600));
  for (let x = 0; x < W; x += stepX) for (const y of [0, 1, H - 2, H - 1]) if (y >= 0 && y < H) edge.push(y * W + x);
  for (let y = 0; y < H; y += stepY) for (const x of [0, 1, W - 2, W - 1]) if (x >= 0 && x < W) edge.push(y * W + x);
  const bins = new Map();
  for (const p of edge) { const i = p * 4, key = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4); bins.set(key, (bins.get(key) || 0) + 1); }
  const top = [...bins.entries()].sort((a, b) => b[1] - a[1])[0][0];
  let sr = 0, sg = 0, sb = 0, sn = 0;
  for (const p of edge) { const i = p * 4; if (((d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4)) === top) { sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; sn++; } }
  const bg = [sr / sn, sg / sn, sb / sn];
  const dist2 = i => { const r = d[i] - bg[0], g = d[i + 1] - bg[1], b = d[i + 2] - bg[2]; return r * r + g * g + b * b; };
  let hit = 0, noise = 0;
  for (const p of edge) { const q = dist2(p * 4); if (q < 34 * 34) { hit++; noise += q; } }
  if (hit / edge.length < EDGE_SHARE) return { skip: 'photo' };
  /* допуск: шум сжатия JPEG у этого файла плюс запас */
  const sd = Math.sqrt(noise / Math.max(1, hit));
  const tol = Math.min(58, Math.max(20, 16 + sd * 3.2)), tol2 = tol * tol;
  const soft = tol * 2.1, soft2 = soft * soft;

  /* 3. заливка от краёв */
  const gone = new Uint8Array(N);                       /* 1 — фон */
  const stack = new Int32Array(N); let sp = 0;
  const push = p => { if (!gone[p] && dist2(p * 4) < tol2) { gone[p] = 1; stack[sp++] = p; } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (sp) {
    const p = stack[--sp], x = p % W;
    if (x > 0) push(p - 1);
    if (x < W - 1) push(p + 1);
    if (p >= W) push(p - W);
    if (p < N - W) push(p + W);
  }
  let removed = 0;
  for (let p = 0; p < N; p++) removed += gone[p];
  if (removed / N > .992) return { skip: 'empty' };

  /* 4. один ли цвет у рисунка: считаем оттенки того, что осталось и далеко от фона */
  const tones = new Map(), inkAt = [];
  const stride = Math.max(1, Math.floor(N / 90000));
  for (let p = 0; p < N; p += stride) {
    if (gone[p]) continue;
    const i = p * 4;
    if (dist2(i) < soft2 * 1.6) continue;                /* кайма и «окошки» цвета фона не считаются краской */
    const key = (d[i] >> 5) << 6 | (d[i + 1] >> 5) << 3 | (d[i + 2] >> 5);
    const t = tones.get(key) || [0, 0, 0, 0];
    t[0]++; t[1] += d[i]; t[2] += d[i + 1]; t[3] += d[i + 2];
    tones.set(key, t); inkAt.push(i);
  }
  /* главный цвет краски и доля пикселей рядом с ним: больше 90 % — макет в один цвет */
  let mono = false;
  if (inkAt.length) {
    const t = [...tones.values()].sort((a, b) => b[0] - a[0])[0];
    const m = [t[1] / t[0], t[2] / t[0], t[3] / t[0]];
    let same = 0;
    for (const i of inkAt) { const r = d[i] - m[0], g = d[i + 1] - m[1], b = d[i + 2] - m[2]; if (r * r + g * g + b * b < 72 * 72) same++; }
    mono = same / inkAt.length > .9;
  }
  if (mono) for (let p = 0; p < N; p++) if (!gone[p] && dist2(p * 4) < tol2) { gone[p] = 1; removed++; }

  /* 5. мягкий край: у пикселей на границе альфа по удалённости от цвета фона, сам цвет фона вычитаем */
  const near = new Uint8Array(N);
  for (let p = 0; p < N; p++) {
    if (!gone[p]) continue;
    const x = p % W;
    if (x > 0) near[p - 1] = 1; if (x < W - 1) near[p + 1] = 1;
    if (p >= W) near[p - W] = 1; if (p < N - W) near[p + W] = 1;
  }
  const near2 = new Uint8Array(N);
  for (let p = 0; p < N; p++) {
    if (!near[p] || gone[p]) continue;
    near2[p] = 1;
    const x = p % W;
    if (x > 0) near2[p - 1] = 1; if (x < W - 1) near2[p + 1] = 1;
    if (p >= W) near2[p - W] = 1; if (p < N - W) near2[p + W] = 1;
  }
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let p = 0; p < N; p++) {
    const i = p * 4;
    if (gone[p]) { d[i + 3] = 0; continue; }
    if (near2[p]) {
      const q = Math.sqrt(dist2(i));
      const a = Math.min(1, Math.max(0, (q - tol * .55) / (soft - tol * .55)));
      if (a < 1) {
        if (a <= .02) { d[i + 3] = 0; continue; }
        const inv = 1 / a;
        d[i] = Math.min(255, Math.max(0, (d[i] - bg[0] * (1 - a)) * inv));
        d[i + 1] = Math.min(255, Math.max(0, (d[i + 1] - bg[1] * (1 - a)) * inv));
        d[i + 2] = Math.min(255, Math.max(0, (d[i + 2] - bg[2] * (1 - a)) * inv));
        d[i + 3] = Math.round(a * 255);
      }
    }
    const x = p % W, y = (p - x) / W;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < x0 || y1 < y0) return { skip: 'empty' };

  /* 6. обрезка пустых полей */
  ctx.putImageData(image, 0, 0);
  const tw = x1 - x0 + 1, th = y1 - y0 + 1;
  const out = document.createElement('canvas'); out.width = tw; out.height = th;
  out.getContext('2d').drawImage(cv, x0, y0, tw, th, 0, 0, tw, th);
  return new Promise(resolve => out.toBlob(blob => {
    if (!blob) { resolve({ skip: 'error' }); return; }
    resolve({ blob, url: URL.createObjectURL(blob), px: [Math.round(tw / k), Math.round(th / k)], bg: hex(bg), mono });
  }, 'image/png'));
}
