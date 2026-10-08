/* preflight.js — проверка макета на сайте. Повторяет приёмку из xtc-dtf мягко: не блокирует заявку,
   говорит человеку понятными словами, результат уходит в заявку (checks[]). */

const RASTER = ['image/png', 'image/jpeg', 'image/webp', 'image/tiff', 'image/gif'];

/* analyze(file) → art: { id, file, name, type, url, px:[w,h], hasAlpha, vector, pdf, colors } */
export async function analyze(file) {
  const type = file.type || guessType(file.name);
  const art = { id: Math.random().toString(36).slice(2, 9), file, name: file.name, type, size: file.size, url: URL.createObjectURL(file), px: null, hasAlpha: null, vector: false, pdf: false, colors: null };
  if (type === 'application/pdf') { art.pdf = true; art.hasAlpha = null; return art; }
  if (type === 'image/svg+xml') {
    art.vector = true; art.hasAlpha = true;
    const text = await file.text();
    art.colors = countColorsSvg(text);
    const dims = await imgDims(art.url).catch(() => null);
    art.px = dims;
    return art;
  }
  if (!RASTER.includes(type)) return art;
  const img = await loadImg(art.url);
  art.px = [img.naturalWidth, img.naturalHeight];
  const s = sample(img);
  art.hasAlpha = type === 'image/jpeg' ? false : s.hasAlpha;
  art.colors = s.colors;
  return art;
}

function guessType(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf', tif: 'image/tiff', tiff: 'image/tiff', gif: 'image/gif' }[ext] || '';
}
const loadImg = url => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
const imgDims = url => loadImg(url).then(i => [i.naturalWidth, i.naturalHeight]);

/* Выборка пикселей: есть ли прозрачность; сколько цветов (грубая квантизация), чтобы предупредить о плёнке */
function sample(img) {
  const c = document.createElement('canvas');
  const k = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight));
  c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, c.width, c.height);
  let d;
  try { d = ctx.getImageData(0, 0, c.width, c.height).data; } catch { return { hasAlpha: null, colors: null }; }
  let transparent = 0; const buckets = new Set();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 250) { transparent++; if (d[i + 3] < 128) continue; }
    buckets.add(((d[i] >> 5) << 6) | ((d[i + 1] >> 5) << 3) | (d[i + 2] >> 5));
  }
  return { hasAlpha: transparent > 0, colors: buckets.size };
}
function countColorsSvg(text) {
  const m = text.match(/(fill|stroke)\s*[:=]\s*["']?(#[0-9a-f]{3,8}|rgb[^;"')]*|[a-z]+)/gi) || [];
  const set = new Set(m.map(x => x.replace(/^(fill|stroke)\s*[:=]\s*["']?/i, '').toLowerCase()).filter(x => x !== 'none' && x !== 'currentcolor'));
  return set.size || 1;
}

/* Многоцветный ли макет (для плёнки): растр — больше 3 корзин цвета, вектор — больше одного цвета */
export function isMulticolor(art) {
  if (!art || art.colors == null) return false;
  return art.vector ? art.colors > 1 : art.colors > 3;
}

/* Проверки для метода и размера. widthMm — ширина макета в натуральную величину (если известна). */
export function runChecks(art, method, widthMm) {
  const out = [];
  if (!art) return out;
  const say = (code, level, text) => out.push({ code, level, text });
  if (art.pdf) say('PDF_NO_PREVIEW', 'info', 'PDF подойдёт для печати. В примерке показываем рамку по размеру — сам файл менеджер посмотрит в заявке.');
  if (art.type === 'image/jpeg') say('JPEG', 'warn', 'Для примерки подойдёт. Для печати нужен PNG с прозрачным фоном, SVG или PDF — менеджер попросит исходник.');
  else if (art.hasAlpha === false && method?.needsAlpha !== false) say('ALPHA_OPAQUE', 'warn', 'Фон напечатается прямоугольником. Нужен файл с прозрачным фоном.');
  if (method?.colors === 'mono' && isMulticolor(art)) say('FILM_MONO', 'info', `${method.group === 'film' ? 'Плёнка одноцветная' : 'Вышивка в примерке одним цветом'}: макет станет силуэтом. Для полноцвета — DTF.`);
  if (widthMm && art.px && !art.vector && !art.pdf) {
    const dpi = art.px[0] / (widthMm / 25.4);
    const minDpi = method?.minDpi || 150, target = method?.targetDpi || 220;
    if (dpi < minDpi) say('DPI_LOW', 'warn', `Чётко получится до ${Math.floor(art.px[0] / minDpi * 25.4 / 10)} см по ширине. Уменьшите макет или пришлите файл крупнее.`);
    else if (dpi < target) say('DPI_SOFT', 'info', 'Будет слегка мягко. Лучше файл крупнее.');
  }
  if (widthMm && method?.maxWidthMm && widthMm > method.maxWidthMm) say('WIDTH', 'warn', `Ширина печати до ${method.maxWidthMm} мм — размер ограничен.`);
  return out;
}

/* dpi для заявки */
export function dpiFor(art, widthMm) {
  if (!art?.px || !widthMm || art.vector || art.pdf) return null;
  return Math.round(art.px[0] / (widthMm / 25.4));
}
