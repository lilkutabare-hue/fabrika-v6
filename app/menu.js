/* menu.js — меню-панель на компьютере (план §7.2). При наведении на категорию её вещь проявляется слева. */
import { CATS, esc } from './data.js';
import { mountGarment } from './garment.js';
import * as layers from './layers.js';
import { $, $$ } from './ui.js';

let data = null, api = null, peekView = null, peekId = null;
const el = $('[data-layer="menu"]');
const peek = $('[data-peek]');

export function init(d, a) { data = d; api = a; render(); }
export function setData(d) { data = d; render(); }

function render() {
  const cats = CATS.filter(c => data.products.some(p => p.cat === c[0]));
  $('.panel__body', el).innerHTML = `
    <div class="menu__group menu__group--big">
      <span class="menu__label">Бланки</span>
      <button type="button" data-cat="all">Все</button>
      ${cats.map(([k, n]) => `<button type="button" data-cat="${k}">${n}</button>`).join('')}
    </div>
    <div class="menu__group menu__group--small">
      <button type="button" data-go="print">Нанесение</button>
      <button type="button" data-go="sewing">Пошив под заказ</button>
      <button type="button" data-go="factory">Производство и шоурум</button>
      <button type="button" data-go="terms">Условия</button>
      <button type="button" data-go="contact">Связь</button>
    </div>
    <div class="menu__group menu__group--util">
      <a href="https://fabrika.market/sale">Распродажа</a>
      <a href="https://fabrika.market/production">Производство для брендов</a>
      <a href="https://t.me/${esc(data.settings.manager || 'trtmoscow')}" target="_blank" rel="noopener">Telegram</a>
    </div>`;
}

export function open() { layers.open('menu', el, { onClose: () => hidePeek() }); }

function showPeek(cat) {
  const p = cat === 'all' ? data.products.find(x => x.tag === 'Хит' && x.hasRender) || data.products[0] : data.products.find(x => x.cat === cat);
  if (!p) { hidePeek(); return; }
  if (peekId !== p.id) {
    peek.innerHTML = '<div></div>';
    peekView = mountGarment(peek.firstElementChild, p, data, { color: p.colors[0], variant: 'fit', sizes: '44vw' });
    peekId = p.id;
  }
  peek.classList.add('is-on');
}
function hidePeek() { peek.classList.remove('is-on'); }

el.addEventListener('click', e => {
  const t = e.target;
  if (t.closest('[data-close]')) { layers.close('menu'); return; }
  const c = t.closest('[data-cat]'); if (c) { layers.close('menu').then(() => api.setCat(c.dataset.cat, true)); return; }
  const g = t.closest('[data-go]'); if (g) { layers.close('menu').then(() => api.goTo(g.dataset.go)); return; }
});
el.addEventListener('pointerover', e => { const c = e.target.closest('[data-cat]'); if (c) showPeek(c.dataset.cat); });
el.addEventListener('pointerleave', hidePeek);
