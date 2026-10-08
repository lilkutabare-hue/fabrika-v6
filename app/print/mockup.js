/* mockup.js — картинка вещи с макетом для менеджера и печатника (клиенту не отдаётся).
   Собирается на canvas из того же, что видно на сцене: рендер вещи, макет по месту, обрезка по силуэту,
   тени ткани поверх. 1200 px по большей стороне, PNG. */
import { artHTML, methodById, defaultFilm } from './methods.js';
import { isDark } from '../garment.js';

const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

/* renderMockup(box, product, data, state, fabricHex) → Promise<Blob|null> */
export async function renderMockup(box, data, state, fabricHex) {
  const gmImg = box.querySelector('.gm__img.is-on');
  const art = state.art;
  if (!gmImg || !art || art.pdf) return null;
  const garment = await loadImg(gmImg.currentSrc);
  const W = 1200, H = Math.round(W * garment.naturalHeight / garment.naturalWidth);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.drawImage(garment, 0, 0, W, H);

  /* слой макета в координатах вещи (сцена = квадрат, вещь вписана по contain) */
  const zone = box.querySelector('.zone');
  const zr = zone.getBoundingClientRect(), gr = gmImg.getBoundingClientRect();
  /* рамка самой картинки внутри квадрата: contain */
  const r = Math.min(gr.width / garment.naturalWidth, gr.height / garment.naturalHeight);
  const iw = garment.naturalWidth * r, ih = garment.naturalHeight * r;
  const ix = gr.left + (gr.width - iw) / 2, iy = gr.top + (gr.height - ih) / 2;
  const k = W / iw;                                   /* px холста на css px */
  const artEl = box.querySelector('.art');
  const ar = artEl.getBoundingClientRect();           /* повёрнутая рамка — берём стили */
  const aw = parseFloat(artEl.style.width) * k, ah = parseFloat(artEl.style.height) * k;
  const ax = (zr.left + parseFloat(artEl.style.left) - ix) * k, ay = (zr.top + parseFloat(artEl.style.top) - iy) * k;

  const layer = document.createElement('canvas'); layer.width = W; layer.height = H;
  const lc = layer.getContext('2d');
  const m = methodById(data, state.method);
  const dark = isDark(fabricHex);
  const film = m.group === 'film' ? (state.film || defaultFilm(m, dark)) : null;
  const src = await loadImg(art.url);
  lc.save();
  lc.translate(ax + aw / 2, ay + ah / 2);
  lc.rotate(state.rot * Math.PI / 180);
  if (state.flip) lc.scale(-1, 1);
  if (film) {
    /* силуэт цветом плёнки */
    const t = document.createElement('canvas'); t.width = Math.max(1, Math.round(aw)); t.height = Math.max(1, Math.round(ah));
    const tc = t.getContext('2d'); tc.drawImage(src, 0, 0, t.width, t.height);
    tc.globalCompositeOperation = 'source-in'; tc.fillStyle = film.hex; tc.fillRect(0, 0, t.width, t.height);
    lc.drawImage(t, -aw / 2, -ah / 2, aw, ah);
  } else {
    lc.drawImage(src, -aw / 2, -ah / 2, aw, ah);
  }
  lc.restore();
  /* обрезка по силуэту вещи */
  lc.globalCompositeOperation = 'destination-in';
  lc.drawImage(garment, 0, 0, W, H);
  /* тени ткани поверх макета */
  lc.globalCompositeOperation = 'multiply';
  lc.globalAlpha = dark ? .35 : .55;
  if (dark) { lc.filter = 'grayscale(1) brightness(2.6) contrast(1.3)'; }
  lc.drawImage(garment, 0, 0, W, H);
  lc.filter = 'none'; lc.globalAlpha = 1;
  lc.globalCompositeOperation = 'destination-in';
  lc.drawImage(garment, 0, 0, W, H);

  ctx.globalCompositeOperation = dark ? 'source-over' : 'multiply';
  ctx.drawImage(layer, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  return new Promise(res => c.toBlob(res, 'image/png'));
}
