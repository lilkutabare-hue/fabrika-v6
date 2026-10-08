/* sewing.js — два крупных превью «Нанесение» и «Пошив под заказ» (план §7.9) и бриф пошива заявкой. */
import { esc, rub, colorHex } from './data.js';
import { mountGarment, isDark } from './garment.js';
import { zoneRect } from './print/zones.js';
import { state as printState, subscribe as onPrint, set as setPrint } from './print/stage.js';
import { artHTML, artClass, methodById, defaultFilm, publicMethods, methodLine } from './print/methods.js';
import { buildOrder } from './order.js';
import * as cart from './cart.js';
import { $, $$, toast } from './ui.js';

let data = null, api = null, demoView = null, demoProduct = null;
const root = $('#services');
const DEMO_TEXT = 'FABRIKA';

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
}

/* Макет на превью: свой, если загружен; иначе демонстрационное слово Fabrika */
function renderDemoArt() {
  const box = $('[data-demo]', root), a = $('.art-demo', box);
  const [x, y, w, h] = zoneRect(demoProduct, 'front', 'center');
  a.style.left = (12 + x * 76) + '%'; a.style.top = (6 + y * 76) + '%'; a.style.width = w * 76 + '%'; a.style.height = h * 76 + '%';
  const m = methodById(data, printState.method);
  const dark = isDark(colorHex(demoProduct, data, box.dataset.color));
  box.classList.toggle('on-light', !dark);
  a.className = 'art-demo art ' + artClass(m);
  if (printState.art) { a.innerHTML = artHTML(printState.art, m, m.group === 'film' ? (printState.film || defaultFilm(m, dark)) : null); return; }
  const film = m.group === 'film' ? (printState.film || defaultFilm(m, dark)) : null;
  const fill = film ? film.hex : (dark ? '#F4F3EF' : '#0B0B0B');
  const word = `<svg viewBox="0 0 400 110" width="100%" style="overflow:visible"><text x="200" y="78" text-anchor="middle" font-family="Unbounded, sans-serif" font-weight="700" font-size="76" letter-spacing="-2" fill="${fill}">${DEMO_TEXT}</text></svg>`;
  if (m.preview === 'stitch') a.innerHTML = word + `<div class="art__thread" style="--mask:none;mask:none;-webkit-mask:none;opacity:.35"></div>`;
  else if (m.preview === 'silhouette-sparkle') a.innerHTML = word.replace(`fill="${fill}"`, `fill="${fill}" style="filter:url(#)"`);
  else a.innerHTML = word;
}

function renderMethods() {
  const list = $('[data-methods]', root);
  if (!list) return;
  list.innerHTML = publicMethods(data).map(m => `<button type="button" data-method="${esc(m.id)}" aria-pressed="${m.id === printState.method}"><b>${esc(m.name)}</b><span>${esc(m.forWhat || '')}</span><span>${esc(methodLine(m))}</span></button>`).join('');
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
    const refFile = f.querySelector('[name="refFile"]').files[0];
    const sewing = { item: v.item || null, qty: v.qty || null, reference: [v.reference, refFile?.name].filter(Boolean).join(' · ') || null, deadline: v.deadline || null, comment: v.comment || null };
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
