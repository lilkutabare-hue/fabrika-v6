/* product.js — карточка товара (план §7.6) и конструктор принта в ней (§7.7).
   Панель: сверху всегда вещь, цена и «В корзину»; ниже «Чистый бланк / С принтом»;
   в режиме принта три вкладки: Макет · Где и как · Вещь. «+ ещё вещь» собирает заказ из нескольких вещей. */
import { rub, esc, density, colorName, colorHex, SIZES } from './data.js';
import { mountGarment, hasSide, isDark } from './garment.js';
import * as layers from './layers.js';
import * as cart from './cart.js';
import * as print from './print/stage.js';
import { presetsFor, garmentMm } from './print/zones.js';
import { methodById, publicMethods, defaultFilm, methodLine, artHTML, artClass } from './print/methods.js';
import { $, $$, toast, reduced } from './ui.js';
import { renderMockup } from './print/mockup.js';
import { fileStore } from './order.js';

const el = $('[data-layer="product"]');
let data = null;
let S = null;        /* состояние открытой карточки */
let gm = null, stage = null;

export function init(d) { data = d; }
export function setData(d) { data = d; if (S) { const p = d.products.find(x => x.id === S.product.id); if (p) { S.product = p; renderPanel(); } } }

export function defaultPrintProduct() {
  const list = data.products;
  return list.find(p => p.tag === 'Хит' && p.hasRender) || list.find(p => p.hasRender) || list.find(p => p.tag === 'Хит') || list[0];
}

/* open(id, { color, mode: 'clean'|'print', from: HTMLElement, tab }) */
export function open(id, o = {}) {
  const product = data.products.find(p => p.id === id);
  if (!product) return false;
  const color = product.colors.includes(o.color) ? o.color : product.colors[0];
  const already = !!S;
  S = { product, color, gram: product.grams?.[0] || null, size: S?.size || 'M', qty: 1, mode: o.mode || 'clean', side: 'front', tab: o.tab || (print.state.art ? 'place' : 'art'), more: false };
  print.state.side = 'front';
  if (print.state.place === 'custom') print.state.place = 'center';
  print.ensurePlace(product);

  const paint = () => { renderStage(); renderPanel(); };
  const fromImg = o.from?.querySelector?.('.gm__img.is-on, .gm > svg.is-on');
  if (!already && !reduced.matches && document.startViewTransition && fromImg) {
    fromImg.style.viewTransitionName = 'garment';
    const vt = document.startViewTransition(() => {
      fromImg.style.viewTransitionName = '';
      paint();
      const cur = gm?.currentImg();
      if (cur) cur.style.viewTransitionName = 'garment';
      layers.open('product', el, { hash: `#${product.id}/${color}`, onClose });
    });
    vt.finished.catch(() => {}).finally(() => { const cur = gm?.currentImg(); if (cur) cur.style.viewTransitionName = ''; });
    vt.updateCallbackDone.catch(() => {});
  } else {
    paint();
    if (already) { try { history.replaceState(history.state, '', `#${product.id}/${color}`); } catch {} }
    else layers.open('product', el, { hash: `#${product.id}/${color}`, onClose, push: o.push !== false });
  }
  el.scrollTop = 0;
  return true;
}
function onClose() { S = null; stage?.destroy(); stage = null; el.classList.remove('is-print'); }

/* ---------- сцена ---------- */
function renderStage() {
  const box = $('.pv__box', el);
  box.innerHTML = '<div class="gm"></div>';
  box.style.transform = ''; box.className = 'pv__box';
  gm = mountGarment(box.firstElementChild, S.product, data, { color: S.color, side: S.side, variant: 'fit', sizes: '(min-width:1024px) 56vw, 100vw', eager: true });
  stage?.destroy();
  stage = print.mountStage(box, S.product, data, { fabricHex: () => colorHex(S.product, data, S.color), pickFile: () => $('[data-file-input]').click() });
  el.classList.toggle('is-print', S.mode === 'print');
  renderSides();
  renderTools();
}
function renderSides() {
  const sides = $('.pv__sides', el);
  const can = ['front', 'back'].filter(s => hasSide(S.product, S.color, s));
  sides.innerHTML = can.length > 1 ? can.map(s => `<button type="button" aria-pressed="${S.side === s}" data-side="${s}">${s === 'back' ? 'Спина' : 'Перед'}</button>`).join('') : '';
}
/* кнопки над сценой: отмена, повтор, сравнить, сброс приближения */
function renderTools() {
  const t = $('.pv__tools', el);
  if (!t) return;
  const on = S.mode === 'print' && !!print.state.art;
  t.hidden = !on;
  if (!on) return;
  t.innerHTML = `
    <button type="button" class="pv__tool" data-undo ${print.canUndo() ? '' : 'disabled'} aria-label="Отменить"><svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg></button>
    <button type="button" class="pv__tool" data-redo ${print.canRedo() ? '' : 'disabled'} aria-label="Повторить"><svg viewBox="0 0 24 24"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg></button>
    <button type="button" class="pv__tool pv__tool--text" data-compare>Без принта</button>`;
}
async function setSide(s) {
  if (S.side === s) return;
  S.side = s; print.state.side = s; print.ensurePlace(S.product);
  renderSides();
  await gm.flip(s);
  print.set({});
  renderPanel();
}

/* ---------- панель ---------- */
const catLabel = p => ({ tshirt: 'Футболки', longsleeve: 'Лонгсливы', sweatshirt: 'Свитшоты', hoodie: 'Худи', zhoodie: 'Зип-худи', olympic: 'Олимпийки', sweatpant: 'Штаны', shorts: 'Шорты', top: 'Топы' }[p.cat] || 'Бланки');

function renderPanel() {
  const p = S.product, panel = $('.pv__panel', el);
  const printMode = S.mode === 'print';
  const m = methodById(data, print.state.method);
  const stockLine = p.stock === false ? (p.makeDays ? `Сошьём за ${p.makeDays} дн.` : 'Нет в наличии — напишите, сошьём') : '';
  const inCart = cart.count();
  panel.innerHTML = `
    <div class="pv__panelhead"><span class="pv__code">${esc(catLabel(p))}</span><button type="button" class="x" data-close aria-label="Закрыть"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    <div class="pv__title">
      <h2>${esc(p.name)}</h2>
      <div class="pv__price"><b>${rub(p.price)}</b>${printMode && print.state.art ? `<span class="t-s">+ ${esc(m.name)} ${m.priceFrom ? 'от ' + rub(m.priceFrom) : 'по запросу'}</span>` : (density(p) ? `<span class="t-s t-mute">${esc(density(p))}</span>` : '')}</div>
      ${stockLine ? `<span class="t-s t-mute">${esc(stockLine)}</span>` : ''}
      ${p.priceTiers?.length ? `<span class="t-s t-mute">Опт: ${p.priceTiers.map(t => `от ${t.qty} шт — ${rub(t.price)}`).join(' · ')}</span>` : ''}
    </div>
    <div class="seg pv__tabs" role="tablist">
      <button type="button" role="tab" aria-pressed="${!printMode}" data-mode="clean">Чистый бланк</button>
      <button type="button" role="tab" aria-pressed="${printMode}" data-mode="print">С принтом</button>
    </div>
    ${printMode ? printPanel(m) : itemPanel()}
    <div class="pv__buy">
      <div class="qty"><button type="button" data-q="-1" aria-label="Меньше">−</button><output>${S.qty}</output><button type="button" data-q="1" aria-label="Больше">+</button></div>
      <button type="button" class="btn" data-add>В корзину</button>
      <button type="button" class="btn btn--ghost pv__more" data-add-more aria-label="Добавить и выбрать ещё вещь" title="Добавить и выбрать ещё вещь">+</button>
    </div>
    ${inCart ? `<button type="button" class="pv__order" data-open-cart><span>В заказе ${inCart} ${plural(inCart, 'вещь', 'вещи', 'вещей')}</span><b>Оформить</b></button>` : ''}`;
  el.classList.toggle('is-print', printMode);
  mountThumbs();
  renderTools();
}
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c); };

/* вкладка «Вещь» и чистый бланк */
function itemPanel() {
  const p = S.product;
  const desc = [['Состав', p.composition], ['Полотно', p.fabric], ['Посадка', p.fit], ['Рост', p.heights], ['Размерная сетка', p.sizeChart], ['Отправка', p.shipDays ? `${p.shipDays} дн.` : null]].filter(x => x[1]);
  return `
    <div class="pv__grp">
      <div class="pv__gh"><span>Цвет</span><b>${esc(colorName(data, S.color))}</b></div>
      <div class="sw pv__sw" data-colors>${p.colors.map(c => `<button type="button" data-color="${esc(c)}" aria-pressed="${c === S.color}" aria-label="${esc(colorName(data, c))}" style="--c:${colorHex(p, data, c)}"><i></i></button>`).join('')}</div>
    </div>
    ${p.grams?.length > 1 ? `<div class="pv__grp"><div class="pv__gh"><span>Плотность</span></div><div class="seg" data-grams>${p.grams.map(g => `<button type="button" data-gram="${esc(g)}" aria-pressed="${g === S.gram}">${esc(g)}</button>`).join('')}</div></div>` : ''}
    <div class="pv__grp">
      <div class="pv__gh"><span>Размер</span><span>${SIZES[0]}–${SIZES[SIZES.length - 1]}</span></div>
      <div class="seg" data-sizes>${SIZES.map(s => `<button type="button" data-size="${s}" aria-pressed="${s === S.size}">${s}</button>`).join('')}</div>
    </div>
    ${desc.length ? `<div class="pv__desc">${desc.map(([k, v]) => `<div><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}</div>` : ''}`;
}

/* режим принта: три вкладки */
function printPanel(m) {
  const st = print.state, a = st.art;
  if (S.more) return morePanel();
  const tabs = [['art', 'Макет'], ['place', 'Где и как'], ['item', 'Вещь']];
  if (!a) S.tab = 'art';
  return `
    <div class="seg pv__subtabs" role="tablist">${tabs.map(([k, n]) => `<button type="button" role="tab" data-tab="${k}" aria-pressed="${S.tab === k}" ${k !== 'art' && !a ? 'disabled' : ''}>${n}</button>`).join('')}</div>
    <div class="pt" data-pt>${S.tab === 'art' ? artTab(m) : S.tab === 'place' ? placeTab(m) : itemPanel()}</div>`;
}

function artTab(m) {
  const st = print.state, a = st.art;
  const spec = a ? print.printSpec(S.product, data, colorHex(S.product, data, S.color), S.size) : { checks: [] };
  return `
    <div class="pv__grp">
      <div class="pt__upload">
        <div class="pt__file">${a ? `<b>${esc(a.name)}</b><span class="t-mute">${a.px ? a.px.join('×') + ' px' : (a.pdf ? 'PDF' : 'вектор')}${a.hasAlpha === false ? ' · без прозрачности' : ''}</span>` : `<b>Файл не выбран</b><span class="t-mute">PNG с прозрачным фоном, SVG или PDF. Можно просто бросить файл на вещь.</span>`}</div>
        <button type="button" class="btn ${a ? 'btn--ghost' : ''}" style="height:40px;padding:0 16px" data-art-pick>${a ? 'Заменить' : 'Загрузить'}</button>
      </div>
      ${spec.checks.length ? `<ul class="pt__checks">${spec.checks.map(c => `<li data-level="${c.level}">${esc(c.text)}</li>`).join('')}</ul>` : ''}
    </div>
    ${a ? `<div class="pv__grp">
      <div class="pv__gh"><span>Макет на вещи</span><span>${st.rot ? Math.round(st.rot) + '°' : 'ровно'}${st.flip ? ' · зеркально' : ''}</span></div>
      <div class="chips">
        <button type="button" data-flip aria-pressed="${st.flip}">Отразить</button>
        <button type="button" data-rot0 ${st.rot ? '' : 'disabled'}>Выровнять</button>
        <button type="button" data-folds aria-pressed="${st.folds}">Складки ткани</button>
        <button type="button" data-art-clear>Убрать макет</button>
      </div>
      <p class="pt__hint">Тяните макет по вещи, угол тянет размер, точка сверху — поворот. На телефоне щипок и два пальца. Стрелки на клавиатуре двигают, ⌘Z отменяет.</p>
    </div>
    <div class="pv__grp"><div class="pv__gh"><span>Примерить на другой вещи</span></div>${othersRow()}</div>` : ''}`;
}

function placeTab(m) {
  const st = print.state;
  const presets = presetsFor(S.product, st.side);
  const W = garmentMm(S.product, S.size);
  const widthMm = W ? Math.round(W * st.scale) : null;
  const fabric = colorHex(S.product, data, S.color), dark = isDark(fabric);
  return `
    <div class="pv__grp">
      <div class="pv__gh"><span>Где</span><span>${st.place === 'custom' ? 'своё место' : (st.side === 'back' ? 'спина' : 'перёд')}</span></div>
      <div class="ppre" data-places>${presets.map(p => `<button type="button" data-place="${p.k}" aria-pressed="${p.k === st.place}" aria-label="${esc(p.name)}"><span class="ppre__g" data-gm-mini><i style="left:${p.cx * 100}%;top:${p.cy * 100}%"></i></span><span class="ppre__n">${esc(p.name)}</span></button>`).join('')}</div>
    </div>
    <div class="pv__grp">
      <div class="pv__gh"><span>Размер</span><b>${widthMm ? `${widthMm} мм по ширине` : `${Math.round(st.scale * 100)} % ширины вещи`}</b></div>
      <input type="range" class="pt__range" min="5" max="90" value="${Math.round(st.scale * 100)}" data-scale aria-label="Размер макета">
      ${!W ? `<p class="pt__hint">Точный размер в сантиметрах уточнит менеджер по вашему файлу.</p>` : ''}
    </div>
    <div class="pv__grp">
      <div class="pv__gh"><span>Как</span><b>${esc(m.name)}</b></div>
      <div class="mcards" data-methods>${publicMethods(data).map(x => {
        const film = x.group === 'film' ? defaultFilm(x, dark) : null;
        return `<button type="button" class="mcard" data-method="${esc(x.id)}" aria-pressed="${x.id === m.id}">
          <span class="mcard__pic ${dark ? '' : 'on-light'}" style="--fabric:${fabric}"><span class="art ${artClass(x)}"><span class="art__body">${artHTML(st.art, x, film)}</span></span></span>
          <b>${esc(x.name)}</b><small>${esc(methodLine(x))}</small></button>`;
      }).join('')}</div>
      <p class="pt__hint">${esc(m.forWhat || '')}${m.group === 'film' ? '. Плёнка одноцветная, в примерке контрастная к ткани.' : ''}</p>
    </div>`;
}

function othersRow() {
  const others = data.products.filter(p => p.id !== S.product.id).slice(0, 12);
  return `<div class="pt__others">${others.map(p => `<button type="button" data-other="${esc(p.id)}" aria-label="${esc(p.name)}" data-gm-thumb="${esc(p.id)}"></button>`).join('')}</div>`;
}

/* после «+»: выбрать следующую вещь для того же заказа */
function morePanel() {
  return `<div class="pt pt--more">
    <p class="t-s">Вещь в заказе. Выберите следующую: макет останется тот же, его можно поменять.</p>
    ${othersRow()}
    <div class="chips"><button type="button" data-more-off>Остаться на этой вещи</button><button type="button" data-open-cart>К заказу</button></div>
  </div>`;
}

/* ---------- события ---------- */
el.addEventListener('click', e => {
  if (!S) return;
  const t = e.target;
  if (t.closest('[data-close]')) { layers.close('product'); return; }
  if (t.closest('[data-open-cart]')) { layers.close('product').then(() => cart.open()); return; }
  const side = t.closest('[data-side]'); if (side) { setSide(side.dataset.side); return; }
  const mode = t.closest('[data-mode]'); if (mode) { S.mode = mode.dataset.mode; S.more = false; renderPanel(); return; }
  const tab = t.closest('[data-tab]'); if (tab) { S.tab = tab.dataset.tab; renderPanel(); return; }
  const col = t.closest('[data-color]'); if (col) { setColor(col.dataset.color); return; }
  const gram = t.closest('[data-gram]'); if (gram) { S.gram = gram.dataset.gram; $$('[data-gram]', el).forEach(b => b.setAttribute('aria-pressed', b === gram)); return; }
  const size = t.closest('[data-size]'); if (size) { S.size = size.dataset.size; $$('[data-size]', el).forEach(b => b.setAttribute('aria-pressed', b === size)); return; }
  const q = t.closest('[data-q]'); if (q) { S.qty = Math.max(1, S.qty + +q.dataset.q); $('.pv__buy output', el).textContent = S.qty; return; }
  if (t.closest('[data-add]')) { addToCart(); return; }
  if (t.closest('[data-add-more]')) { if (addToCart(true)) { S.more = true; renderPanel(); } return; }
  if (t.closest('[data-more-off]')) { S.more = false; renderPanel(); return; }
  if (t.closest('[data-art-pick]')) { $('[data-file-input]').click(); return; }
  if (t.closest('[data-art-clear]')) { print.clearArt(); S.tab = 'art'; renderPanel(); return; }
  if (t.closest('[data-flip]')) { print.set({ flip: !print.state.flip }); renderPanel(); return; }
  if (t.closest('[data-rot0]')) { print.set({ rot: 0 }); renderPanel(); return; }
  if (t.closest('[data-folds]')) { print.set({ folds: !print.state.folds }, { history: false }); renderStage(); renderPanel(); return; }
  if (t.closest('[data-undo]')) { print.undo(); renderPanel(); return; }
  if (t.closest('[data-redo]')) { print.redo(); renderPanel(); return; }
  const meth = t.closest('[data-method]'); if (meth) { print.set({ method: meth.dataset.method, film: null }); renderPanel(); return; }
  const place = t.closest('[data-place]'); if (place) { print.applyPlace(S.product, place.dataset.place); renderPanel(); return; }
  const other = t.closest('[data-other]'); if (other) { S.more = false; open(other.dataset.other, { mode: 'print', tab: 'place' }); return; }
});
/* «Без принта»: держишь — макет спрятан */
el.addEventListener('pointerdown', e => { const b = e.target.closest('[data-compare]'); if (!b) return; e.preventDefault(); stage?.setCompare(true); const up = () => { stage?.setCompare(false); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); }; addEventListener('pointerup', up); addEventListener('pointercancel', up); });
el.addEventListener('input', e => {
  const r = e.target.closest('[data-scale]');
  if (r) { print.set({ scale: +r.value / 100 }, { history: false }); const b = r.closest('.pv__grp').querySelector('.pv__gh b'); const W = garmentMm(S.product, S.size); if (b) b.textContent = W ? `${Math.round(W * print.state.scale)} мм по ширине` : `${r.value} % ширины вещи`; }
});
el.addEventListener('change', e => { if (e.target.closest('[data-scale]')) print.commit(); });

function setColor(c) {
  if (c === S.color) return;
  S.color = c;
  gm.setColor(c);
  renderSides();
  if (!hasSide(S.product, c, S.side)) setSide('front');
  try { history.replaceState(history.state, '', `#${S.product.id}/${c}`); } catch {}
  print.set({}, { history: false });
  renderPanel();
}

function mountThumbs() {
  $$('[data-gm-thumb]', el).forEach(b => {
    const p = data.products.find(x => x.id === b.dataset.gmThumb);
    if (!p || b.firstElementChild) return;
    const d = document.createElement('div'); b.appendChild(d);
    mountGarment(d, p, data, { color: p.colors[0], variant: 'set', sizes: '64px' });
  });
  $$('[data-gm-mini]', el).forEach(n => {
    if (n.querySelector('.gm')) return;
    const d = document.createElement('div'); n.prepend(d);
    mountGarment(d, S.product, data, { color: S.color, side: print.state.side, variant: 'fit', sizes: '48px' });
  });
}

function addToCart(silent) {
  const p = S.product;
  const item = { product: { id: p.id, code: p.code, name: p.name }, color: S.color, size: S.size, gram: S.gram, qty: S.qty, unitPrice: p.price, prints: [] };
  if (S.mode === 'print') {
    if (!print.state.art) { toast('Сначала загрузите макет — или добавьте чистый бланк'); return false; }
    const spec = print.printSpec(p, data, colorHex(p, data, S.color), S.size);
    item.prints.push(spec);
    /* картинка вещи с макетом — менеджеру и печатнику, клиенту не отдаётся */
    const mid = 'mockup-' + Math.random().toString(36).slice(2, 8);
    spec.mockup = mid;
    renderMockup($('.pv__box', el), data, print.state, colorHex(p, data, S.color)).then(b => { if (b) fileStore.set(mid, b); }).catch(() => {});
  }
  cart.add(item);
  if (silent) toast(`Добавлено: ${p.name} ${S.size}`);
  else toast(`Добавлено: ${p.name}`, { label: 'Корзина', run: () => layers.close('product').then(() => cart.open()) });
  if (!silent) renderPanel();
  return true;
}

/* файл выбран где угодно на сайте (шапка, первый экран, конструктор) */
export async function onFile(file, { openAfter = true } = {}) {
  await print.setFile(file);
  if (S) { if (S.mode !== 'print') S.mode = 'print'; S.tab = 'place'; S.more = false; renderPanel(); }
  else if (openAfter) openPrint();
}
export function openPrint(from) {
  if (S) { S.mode = 'print'; renderPanel(); return; }
  const p = defaultPrintProduct();
  if (p) open(p.id, { mode: 'print', from });
}

/* сцена сообщила об изменении (жест, отмена, бросили файл): панель вслед, но не во время движения */
print.subscribe(() => {
  if (!S || S.mode !== 'print') return;
  if ($('.zone-ui.is-dragging', el)) return;
  renderTools();
  const pt = $('[data-pt]', el);
  if (!pt) { renderPanel(); return; }
  const m = methodById(data, print.state.method);
  const tmp = document.createElement('div');
  tmp.innerHTML = `<div class="pt" data-pt>${S.tab === 'art' ? artTab(m) : S.tab === 'place' ? placeTab(m) : itemPanel()}</div>`;
  pt.replaceWith(tmp.firstElementChild);
  const price = $('.pv__price .t-s', el); if (price && print.state.art) price.textContent = `+ ${m.name} ${m.priceFrom ? 'от ' + rub(m.priceFrom) : 'по запросу'}`;
  mountThumbs();
});

/* телефон: шторка закрывается свайпом вниз, когда прокрутка в начале */
(() => {
  let y0 = null, dy = 0;
  el.addEventListener('touchstart', e => { if (el.scrollTop > 0 || e.target.closest('.pv__scene, .pt__range, .pt__others, .mcards, .ppre')) return; y0 = e.touches[0].clientY; dy = 0; }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (dy > 0) { el.classList.add('is-dragging'); el.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  el.addEventListener('touchend', () => {
    if (y0 == null) return;
    el.classList.remove('is-dragging'); el.style.transform = '';
    if (dy > 120) layers.close('product');
    y0 = null;
  });
})();
