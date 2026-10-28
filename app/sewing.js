/* sewing.js — два крупных превью «Нанесение» и «Пошив под заказ» (план §7.9) и бриф пошива заявкой. */
import { esc, colorHex } from './data.js';
import { mountGarment, isDark } from './garment.js';
import { zoneRect } from './print/zones.js';
import { state as printState, subscribe as onPrint, set as setPrint } from './print/stage.js';
import { artHTML, artClass, methodById, defaultFilm, publicMethods, methodLine } from './print/methods.js';
import { buildOrder, sendCaption, TEXT_ONLY_CAPTION } from './order.js';
import * as cart from './cart.js';
import { $, $$, toast } from './ui.js';

let data = null, api = null, demoView = null, demoProduct = null;
const root = $('#services');
const DEMO_TEXT = 'FABRIKA';
let wordMaskUrl = '';

export function init(d, a) {
  data = d; api = a;
  demoProduct = data.products.find(p => p.hasRender && /tee|sweat|long|hood/.test(p.type)) || data.products[0];
  const box = $('[data-demo]', root);
  const color = demoProduct.colors.find(c => isDark(colorHex(demoProduct, data, c))) || demoProduct.colors[0];
  box.innerHTML = '<div class="gm"></div><div class="art-demo art"></div>';
  demoView = mountGarment(box.firstElementChild, demoProduct, data, { color, variant: 'fit', sizes: '(min-width:1024px) 50vw, 100vw' });
  box.dataset.color = color;
  /* превью пошива: чистая вещь другого типа — «сошьём такое же» */
  const sewBox = $('[data-sew-demo]', root);
  const sewP = data.products.find(p => p.hasRender && p.id !== demoProduct.id && /long|sweat|tee/.test(p.type)) || data.products.find(p => p.id !== demoProduct.id);
  if (sewBox && sewP) { sewBox.insertAdjacentHTML('afterbegin', '<div class="gm gm--sew"></div>'); const light = sewP.colors.find(c => !isDark(colorHex(sewP, data, c))) || sewP.colors[0]; mountGarment(sewBox.firstElementChild, sewP, data, { color: light, side: 'back', variant: 'fit', sizes: '(min-width:1024px) 50vw, 100vw' }); }
  renderDemoArt();
  renderMethods();
  onPrint(() => { renderDemoArt(); renderMethods(); });
  renderTerms();
  labelSewSend();
  document.fonts?.ready.then(async () => {
    try { await document.fonts.load('700 152px Unbounded'); } catch { /* слово останется запасным шрифтом */ }
    wordMaskUrl = '';
    publishMask();
    renderDemoArt();
    renderMethods();
  });
}

/* Пока сервер пустой, кнопка не обещает, что референс уже ушёл. */
function labelSewSend() {
  const b = $('[data-sew-send]', root);
  if (!b) return;
  const cap = sendCaption(data.settings, 'sew');
  if (cap !== TEXT_ONLY_CAPTION) { b.textContent = cap; return; }
  b.style.whiteSpace = 'normal';
  b.style.height = 'auto';
  b.style.minHeight = '48px';
  b.style.maxWidth = '100%';
  b.style.paddingTop = '12px';
  b.style.paddingBottom = '12px';
  const span = document.createElement('span');
  span.textContent = cap;
  span.style.display = 'block';
  span.style.minWidth = '0';
  span.style.whiteSpace = 'normal';
  span.style.textAlign = 'center';
  span.style.textWrap = 'balance';
  b.replaceChildren(span);
}

/* Силуэт слова для плёнки и маска нити. Тот же Unbounded, что у надписи на вещи. */
function wordMask() {
  if (wordMaskUrl) return wordMaskUrl;
  const c = document.createElement('canvas');
  c.width = 800;
  c.height = 220;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 800, 220);
  ctx.fillStyle = '#000';
  ctx.font = '700 152px Unbounded, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  try { ctx.letterSpacing = '-4px'; } catch { /* холст без letterSpacing */ }
  ctx.fillText(DEMO_TEXT, 400, 156);
  wordMaskUrl = c.toDataURL();
  return wordMaskUrl;
}
function publishMask() {
  root.style.setProperty('--demo-mask', `url("${wordMask()}")`);
}

let svgN = 0;
/* Демо-слово без файла: у DTF цвет остаётся, плёнка сводит его в один силуэт. */
function wordSvg(fill, asIs) {
  const id = 'dw' + (++svgN);
  const paint = asIs ? `url(#${id})` : fill;
  const defs = asIs ? `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${fill}"/><stop offset="1" stop-color="#E8734A"/></linearGradient></defs>` : '';
  return `<svg viewBox="0 0 400 110" width="100%" aria-hidden="true">${defs}<text x="200" y="78" text-anchor="middle" font-family="Unbounded, sans-serif" font-weight="700" font-size="76" letter-spacing="-2" fill="${paint}">${DEMO_TEXT}</text></svg>`;
}

function filmOf(method, dark) {
  if (method.group !== 'film') return null;
  return (printState.method === method.id && printState.film) || defaultFilm(method, dark);
}

/* Макет в методе: DTF как есть, плёнка силуэтом, вышивка нитью. Свой файл — та же ветка, что в конструкторе. */
function methodArtInner(method, dark) {
  const film = filmOf(method, dark);
  if (printState.art) return artHTML(printState.art, method, film);
  const fill = film ? film.hex : (dark ? '#F4F3EF' : '#0B0B0B');
  if (method.preview === 'stitch') return `<div class="art__thread"></div>`;
  if ((method.preview || '').startsWith('silhouette')) return `<div class="art__sil" style="--film:${fill}"></div>`;
  return wordSvg(fill, true);
}

function artPlace(grow = 1) {
  const [x, y, w, h] = zoneRect(demoProduct, 'front', 'center');
  const W = w * grow, H = h * grow;
  const cx = x + w / 2, cy = y + h / 2;
  const n = v => (Math.round(v * 100) / 100) + '%';
  return { left: n(12 + (cx - W / 2) * 76), top: n(6 + (cy - H / 2) * 76), width: n(W * 76), height: n(H * 76) };
}

/* То же фото, что в крупном превью. Гифку не берём. */
function garmentShot() {
  const gm = demoView?.el;
  if (!gm) return '';
  if (gm.dataset.kind === 'sketch') {
    const svg = gm.querySelector('svg');
    if (!svg) return '';
    const c = svg.cloneNode(true);
    c.classList.add('is-on');
    return `<span class="gm" data-kind="sketch">${c.outerHTML}</span>`;
  }
  const imgs = [...gm.querySelectorAll('.gm__img:not(.gm__img--anim)')];
  const img = imgs.find(i => i.classList.contains('is-on')) || imgs.at(-1);
  if (!img) return '';
  const c = img.cloneNode(true);
  c.classList.add('is-on');
  c.alt = '';
  c.style.opacity = '1';
  return `<span class="gm" data-kind="render">${c.outerHTML}</span>`;
}

function fabricDark() {
  const box = $('[data-demo]', root);
  return isDark(colorHex(demoProduct, data, box?.dataset.color));
}

/* Макет на превью: свой, если загружен; иначе демонстрационное слово Fabrika */
function renderDemoArt() {
  const box = $('[data-demo]', root), a = $('.art-demo', box);
  if (!box || !a) return;
  publishMask();
  const place = artPlace();
  a.style.left = place.left; a.style.top = place.top; a.style.width = place.width; a.style.height = place.height;
  const m = methodById(data, printState.method);
  const dark = fabricDark();
  box.classList.toggle('on-light', !dark);
  a.className = 'art-demo art ' + artClass(m);
  a.innerHTML = methodArtInner(m, dark);
}

function renderMethods() {
  const list = $('[data-methods]', root);
  if (!list) return;
  publishMask();
  const dark = fabricDark();
  const shot = garmentShot();
  const place = artPlace(1.55);
  const placeStyle = `left:${place.left};top:${place.top};width:${place.width};height:${place.height}`;
  list.innerHTML = publicMethods(data).map(m => `<button type="button" data-method="${esc(m.id)}" aria-pressed="${m.id === printState.method}">
      <span class="meth__shot${dark ? '' : ' on-light'}">
        ${shot}
        <span class="art ${artClass(m)}" style="${placeStyle}">${methodArtInner(m, dark)}</span>
      </span>
      <span class="meth__cap"><span class="meth__name">${esc(m.name)}</span><span class="meth__meta">${esc(methodLine(m))}</span></span>
    </button>`).join('');
}

function renderTerms() {
  const t = data.terms || {};
  const el = $('[data-sew-terms]', root);
  if (!el) return;
  const rows = [];
  if (t.lead?.sample?.status === 'fact') rows.push(['Образец', t.lead.sample.value]);
  if (t.lead?.run?.status === 'fact') rows.push(['Тираж', t.lead.run.value]);
  if (t.payment?.prepay?.status === 'fact') rows.push(['Предоплата', t.payment.prepay.value]);
  el.innerHTML = rows.map(([k, v]) => `<li><span>${esc(k)}</span><span>${esc(v)}</span></li>`).join('');
}

/* раскрытие под парой */
function toggleMore(which) {
  const more = $(`[data-more="${which}"]`, root);
  const other = $(`[data-more="${which === 'print' ? 'sewing' : 'print'}"]`, root);
  const wasOpen = !more.hidden;
  other.hidden = true;
  more.hidden = wasOpen;
  $$('.duo__item', root).forEach(i => i.setAttribute('aria-expanded', i.dataset.which === which && !wasOpen));
  if (!wasOpen) setTimeout(() => more.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
}
export function openMore(which) { const more = $(`[data-more="${which}"]`, root); if (more.hidden) toggleMore(which); }

root.addEventListener('click', async e => {
  const t = e.target;
  const item = t.closest('.duo__item[data-which]');
  if (item && !t.closest('[data-more]')) { toggleMore(item.dataset.which); return; }
  const m = t.closest('[data-method]'); if (m) { setPrint({ method: m.dataset.method, film: null }); return; }
  if (t.closest('[data-try-print]')) { api.pickFile(); return; }
  if (t.closest('[data-sew-send]')) {
    const f = $('[data-brief]', root);
    const v = Object.fromEntries([...new FormData(f)].map(([k, x]) => [k, typeof x === 'string' ? x.trim() : x]));
    if (!v.item && !v.reference) { toast('Напишите, что шьём, или приложите референс'); return; }
    /* Файл из вкладки в заявку не кладём: выглядит, будто он уже ушёл, а отправить его некуда. */
    const sewing = { item: v.item || null, qty: v.qty || null, reference: v.reference || null, deadline: v.deadline || null, comment: v.comment || null };
    const order = buildOrder({ items: [], sewing, extras: { contact: v.contact } });
    t.closest('[data-sew-send]').disabled = true;
    await cart.sendExternal(order);
    t.closest('[data-sew-send]').disabled = false;
    return;
  }
});
root.addEventListener('change', e => {
  if (e.target.name === 'refFile') { const l = $('[data-ref-name]', root); l.textContent = e.target.files[0]?.name || 'Файл'; }
});
