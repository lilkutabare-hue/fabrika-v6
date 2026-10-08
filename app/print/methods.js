/* methods.js — реестр методов нанесения (data/methods.json) и показ макета на вещи по полю preview.
   Новый метод — одна запись в JSON; если нужен новый вид показа — одна ветка в artHTML. */
import { esc, rub } from '../data.js';

export const methodById = (data, id) => data.methods.find(m => m.id === id) || data.methods[0];
export const publicMethods = data => data.methods.filter(m => m.status !== 'hidden');

/* Цвет плёнки по умолчанию: контрастный к ткани */
export function defaultFilm(method, fabricDark) {
  const pal = method.palette && method.palette.length ? method.palette : null;
  if (pal) return pal[0];
  return fabricDark ? { k: 'white', name: 'Белый', hex: '#F4F3EF' } : { k: 'black', name: 'Чёрный', hex: '#111111' };
}
export function filmOptions(method) {
  if (method.palette && method.palette.length) return method.palette;
  return [{ k: 'white', name: 'Белый', hex: '#F4F3EF' }, { k: 'black', name: 'Чёрный', hex: '#111111' }];
}

/* Разметка макета внутри .art */
export function artHTML(art, method, film) {
  if (!art) return '';
  const url = art.pdf ? '' : art.url;
  const name = esc(art.name);
  if (art.pdf) return `<div class="art__pdf" style="width:100%;height:100%;display:grid;place-items:center;background:rgba(255,255,255,.4);outline:1px dashed var(--sig);font-size:12px;padding:6px;text-align:center">${name}</div>`;
  const mask = `--mask:url('${url}')`;
  switch (method.preview) {
    case 'silhouette-flat':
    case 'silhouette-matte':
    case 'silhouette-sparkle':
    case 'silhouette-reflective':
      return `<div class="art__sil" style="${mask};--film:${film?.hex || '#fff'}"></div>`;
    case 'stitch':
      return `<img class="art__img" src="${url}" alt=""><div class="art__thread" style="${mask}"></div>`;
    default:
      return `<img class="art__img" src="${url}" alt="">`;
  }
}
export const artClass = method => ({
  'asis': 'art--asis', 'silhouette-flat': 'art--flex', 'silhouette-matte': 'art--flock',
  'silhouette-sparkle': 'art--glitter', 'silhouette-reflective': 'art--reflective', 'stitch': 'art--stitch',
}[method?.preview] || 'art--asis');

export const methodLine = m => `${m.priceFrom ? 'от ' + rub(m.priceFrom) : 'цена по запросу'}${m.minQty ? ' · от ' + m.minQty + ' шт' : ''}`;
