/* catalog.js — бланки (план §7.5): категории, плитки 3:4, образцы цвета в плитке, наведение с размерами,
   «Сошьём за N дней», оптовая лестница, переключатель «С моим принтом». */
import { rub, esc, density, colorName, colorHex, CATS, SIZES } from './data.js';
import { mountGarment, animFor } from './garment.js';
import { zoneRect } from './print/zones.js';
import { state as printState, subscribe as onPrint } from './print/stage.js';
import { artHTML, artClass, methodById, defaultFilm } from './print/methods.js';
import { isDark } from './garment.js';
import { $, $$, reduced } from './ui.js';

let data = null, cat = 'all', mine = false;
const views = new Map();     /* id → garment view */
let api = null;
const root = $('#blanks');

export function init(d, a) { data = d; api = a; render(); onPrint(() => { updateMine(); }); }
export function setData(d) { data = d; render(); }

function visible() { return data.products.filter(p => cat === 'all' || p.cat === cat); }

export function setCat(k, scroll = false) {
  if (!CATS.some(c => c[0] === k) && k !== 'all') k = 'all';
  const changed = k !== cat;
  cat = k;
  render(changed);
  if (scroll) root.scrollIntoView({ block: 'start' });
}

function render(swap = false) {
  const cats = [['all', 'Все'], ...CATS.filter(c => data.products.some(p => p.cat === c[0]))];
  $('[data-cats]', root).innerHTML = cats.map(([k, n]) => `<button type="button" data-cat="${k}" aria-pressed="${k === cat}">${n}</button>`).join('');
  const toggle = $('[data-mine]', root);
  toggle.hidden = !printState.art;
  toggle.setAttribute('aria-pressed', mine && !!printState.art);

  const grid = $('[data-tiles]', root);
  views.clear();
  const list = visible();
  grid.classList.toggle('is-swap', swap && !reduced.matches);
  grid.innerHTML = list.map((p, i) => tileHTML(p, i)).join('');
  $$('.tile', grid).forEach(t => {
    const p = data.products.find(x => x.id === t.dataset.id);
    const v = mountGarment($('.tile__media .gm', t), p, data, { color: t.dataset.color, variant: 'set', sizes: '(min-width:1024px) 25vw, 50vw' });
    views.set(p.id, v);
  });
  updateMine();
  if (swap) setTimeout(() => grid.classList.remove('is-swap'), 800);
}

function tileHTML(p, i) {
  const color = p.colors[0];
  const dens = density(p);
  const stock = p.stock === false ? (p.makeDays ? `Сошьём за ${p.makeDays} дн.` : 'Под заказ') : '';
  const tiers = p.priceTiers?.length ? `опт от ${p.priceTiers[0].qty} шт — ${rub(p.priceTiers[0].price)}` : '';
  return `<article class="tile" data-id="${esc(p.id)}" data-color="${esc(color)}" style="--i:${i}">
    <div class="tile__media" data-open>
      <div class="gm"></div>
      <div class="tile__art"></div>
      ${p.tag ? `<span class="tile__tag" data-tag="${esc(p.tag)}">${esc(p.tag)}</span>` : ''}
    </div>
    <div class="tile__cap">
      <div class="tile__name"><b data-open>${esc(p.name)}</b>${dens ? `<span class="t-mute">${esc(dens)}</span>` : ''}</div>
      <div class="tile__row">
        <div class="tile__price">${rub(p.price)}${stock ? ` <span class="tile__stock">· ${esc(stock)}</span>` : ''}${tiers ? ` <span class="tile__stock">· ${esc(tiers)}</span>` : ''}</div>
        <div class="tile__sizes" aria-label="Размер — в корзину">${SIZES.map(s => `<button type="button" data-size="${s}">${s}</button>`).join('')}</div>
      </div>
      ${p.colors.length > 1 ? `<div class="sw sw--small tile__sw">${p.colors.map(c => `<button type="button" data-color="${esc(c)}" aria-pressed="${c === color}" aria-label="${esc(colorName(data, c))}" style="--c:${colorHex(p, data, c)}"><i></i></button>`).join('')}</div>` : ''}
    </div>
  </article>`;
}

/* «С моим принтом»: макет на всех вещах в зоне по центру */
function updateMine() {
  const toggle = $('[data-mine]', root);
  const on = mine && !!printState.art;
  toggle.hidden = !printState.art;
  toggle.setAttribute('aria-pressed', on);
  $$('.tile', root).forEach(t => {
    const a = $('.tile__art', t);
    if (!on) { a.classList.remove('is-on'); a.innerHTML = ''; return; }
    const p = data.products.find(x => x.id === t.dataset.id);
    const [x, y, w, h] = zoneRect(p, 'front', p.type === 'zhood' || p.type === 'olymp' ? 'chest' : (/pants|shorts/.test(p.type) ? 'leg' : 'center'));
    /* zoneRect даёт доли вещи; вещь занимает 88 % плитки с полем 6 % (рендер) */
    /* .gm занимает 88 % плитки с полем 6 % */
    a.style.left = (6 + x * 88) + '%'; a.style.top = (6 + y * 88) + '%'; a.style.width = w * 88 + '%'; a.style.height = h * 88 + '%';
    const m = methodById(data, printState.method);
    const dark = isDark(colorHex(p, data, t.dataset.color));
    const film = m.group === 'film' ? (printState.film || defaultFilm(m, dark)) : null;
    a.className = 'tile__art art ' + artClass(m) + ' is-on';
    a.style.position = 'absolute'; a.style.cursor = 'default';
    a.innerHTML = artHTML(printState.art, m, film);
    t.querySelector('.tile__media').classList.toggle('on-light', !dark);
  });
}

root.addEventListener('click', e => {
  const t = e.target;
  const c = t.closest('[data-cat]'); if (c) { setCat(c.dataset.cat); return; }
  if (t.closest('[data-mine]')) { mine = !mine; updateMine(); return; }
  const tile = t.closest('.tile'); if (!tile) return;
  const p = data.products.find(x => x.id === tile.dataset.id);
  const sw = t.closest('.tile__sw [data-color]');
  if (sw) {
    tile.dataset.color = sw.dataset.color;
    views.get(p.id)?.setColor(sw.dataset.color);
    $$('.tile__sw [data-color]', tile).forEach(b => b.setAttribute('aria-pressed', b === sw));
    updateMine();
    return;
  }
  const sz = t.closest('[data-size]');
  if (sz) { api.addToCart({ product: { id: p.id, code: p.code, name: p.name }, color: tile.dataset.color, size: sz.dataset.size, gram: p.grams?.[0] || null, qty: 1, unitPrice: p.price, prints: [] }); return; }
  if (t.closest('[data-open]')) api.openProduct(p.id, { color: tile.dataset.color, from: tile.querySelector('.tile__media'), mode: mine && printState.art ? 'print' : 'clean' });
});

/* наведение: анимированный рендер, молния на эскизе */
if (matchMedia('(hover:hover)').matches) {
  root.addEventListener('pointerenter', e => {
    const tile = e.target.closest?.('.tile'); if (!tile) return;
    const v = views.get(tile.dataset.id); if (!v) return;
    v.setAnim(true); v.el.classList.add('is-unzipped');
  }, true);
  root.addEventListener('pointerleave', e => {
    const tile = e.target.closest?.('.tile'); if (!tile) return;
    const v = views.get(tile.dataset.id); if (!v) return;
    v.setAnim(false); v.el.classList.remove('is-unzipped');
  }, true);
}

/* эскизы качаются, только когда видны */
const io = new IntersectionObserver(es => es.forEach(x => x.target.classList.toggle('is-live', x.isIntersecting)), { rootMargin: '10% 0px' });
io.observe(root);
