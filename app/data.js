/* data.js — загрузка данных и слияние.
   Источники: data/catalog.json (формат v5 не меняется), media/manifest.json (пишет tools/build_media.py),
   data/methods.json, data/terms.json. Крючок для базы артефакта: registerOverlay(async data => data) —
   admin.js подменяет документы из window.claude db, не трогая этот файл. */

const BASE = new URL('../', import.meta.url);
const overlays = [];
const listeners = new Set();
let current = null;

export function registerOverlay(fn) { overlays.push(fn); }
export function onData(fn) { listeners.add(fn); if (current) fn(current); return () => listeners.delete(fn); }
export function getData() { return current; }

async function getJSON(rel, optional = false) {
  const res = await fetch(new URL(rel, BASE));
  if (!res.ok) {
    if (optional) return null;
    throw new Error(`${rel}: ${res.status}`);
  }
  return res.json();
}

export const CATS = [
  ['tshirt', 'Футболки'], ['longsleeve', 'Лонгсливы'], ['sweatshirt', 'Свитшоты'], ['hoodie', 'Худи'],
  ['zhoodie', 'Зип-худи'], ['olympic', 'Олимпийки'], ['sweatpant', 'Штаны'], ['shorts', 'Шорты'], ['top', 'Топы'],
];
export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

/* v5 хранил media строкой (url или asset id) — одна картинка на все цвета, только перед. */
function normalizeMedia(media) {
  if (!media) return null;
  if (typeof media === 'string') return { '*': { front: { set: { url: media }, fit: { url: media } } } };
  return media;
}

export function normalize(raw) {
  const { catalog, manifest, methods, terms } = raw;
  const palette = {};
  for (const c of catalog.palette || []) palette[c.k] = { name: c.name, hex: c.hex, status: 'fact' };
  for (const [k, c] of Object.entries(manifest?.colors || {})) {
    if (!palette[k]) palette[k] = { name: c.name, hex: null, status: c.status || 'hypothesis' };
  }

  const products = (catalog.products || [])
    .filter(p => !p.hidden)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(p => {
      const fromManifest = manifest?.products?.[p.id] || null;
      const media = fromManifest || normalizeMedia(p.media);
      const swatch = {};
      for (const [k, sides] of Object.entries(media || {})) {
        const v = sides.front || Object.values(sides)[0];
        const hex = v?.fit?.hex || v?.set?.hex || null;
        if (hex) swatch[k] = hex;
      }
      const renderColors = Object.keys(media || {}).filter(k => k !== '*');
      const colors = renderColors.length ? renderColors : (p.colors || []);
      return { ...p, media, swatch, colors, allColors: p.colors || [], hasRender: renderColors.length > 0 };
    });

  /* нет в наличии без срока пошива — в конец */
  products.sort((a, b) => {
    const ao = a.stock === false && !a.makeDays ? 1 : 0, bo = b.stock === false && !b.makeDays ? 1 : 0;
    return ao - bo;
  });

  const settings = { bot: '', manager: 'trtmoscow', dtf: 100, emb: 200, ...(catalog.settings || {}) };
  const methodList = (methods?.methods || []).map(m => {
    /* цены DTF и вышивки могут быть переопределены настройками артефакта (settings/main) */
    if (m.id === 'dtf' && settings.dtf) return { ...m, priceFrom: +settings.dtf };
    if (m.id === 'emb' && settings.emb) return { ...m, priceFrom: +settings.emb };
    return m;
  });

  return {
    products,
    palette,
    settings,
    route: catalog.route || {},
    methods: methodList,
    terms: terms || {},
    mediaBase: new URL('media/', BASE).href,
    raw,
  };
}

export async function loadData() {
  const [catalog, manifest, methods, terms] = await Promise.all([
    getJSON('data/catalog.json'),
    getJSON('media/manifest.json', true),
    getJSON('data/methods.json', true),
    getJSON('data/terms.json', true),
  ]);
  let data = normalize({ catalog, manifest, methods, terms });
  for (const fn of overlays) data = (await fn(data)) || data;
  current = data;
  return data;
}

/* Админка или база прислали новые документы: пересобрать и оповестить. */
export function updateData(patch) {
  if (!current) return;
  const raw = { ...current.raw, catalog: { ...current.raw.catalog, ...patch } };
  current = normalize(raw);
  for (const fn of listeners) fn(current);
}

/* Плотность из grams: ["340 г · начёс", "380 г · без начёса"] → "340–380 г/м²" */
export function density(product) {
  const nums = (product.grams || []).map(g => parseInt(g, 10)).filter(n => !Number.isNaN(n));
  if (!nums.length) return '';
  const lo = Math.min(...nums), hi = Math.max(...nums);
  return (lo === hi ? `${lo}` : `${lo}–${hi}`) + ' г/м²';
}

/* 2 990 ₽ — узкий неразрывный пробел между разрядами */
export function rub(n) {
  return Math.round(+n || 0).toLocaleString('ru-RU').replace(/\s/g, ' ') + ' ₽';
}

export const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const colorName = (data, k) => data.palette[k]?.name || k;
export const colorHex = (product, data, k) => product.swatch?.[k] || data.palette[k]?.hex || '#CCCCCC';
export const catName = k => (CATS.find(c => c[0] === k) || [])[1] || k;
