/* cart.js — корзина (панель справа / шторка) и заявка вторым шагом в той же панели (план §7.8).
   Переживает перезагрузку (localStorage в try/catch, баг 12). */
import { rub, esc, colorName, density } from './data.js';
import { mountGarment } from './garment.js';
import { buildOrder, send, orderText } from './order.js';
import * as layers from './layers.js';
import { $, $$, toast, copy } from './ui.js';

const KEY = 'fabrika.cart.v1';
let items = load();
let data = null;
let step = 'cart';          /* cart | order | done */
let lastResult = null;
let lastOrder = null;
const el = $('[data-layer="cart"]');
const listeners = new Set();

function load() { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* приватный режим */ } }
function emit() { for (const fn of listeners) fn(items); }
export function onCart(fn) { listeners.add(fn); fn(items); }
export const count = () => items.reduce((s, i) => s + i.qty, 0);

export function init(d) {
  data = d;
  render();
}
export function setData(d) { data = d; if (layers.isOpen('cart')) render(); }

const keyOf = it => [it.product.id, it.color, it.size, it.gram || '', (it.prints || []).map(p => p.method + p.side + p.place + (p.file?.id || '')).join('|')].join('/');

export function add(item) {
  const key = keyOf(item);
  const ex = items.find(i => i.key === key);
  if (ex) ex.qty += item.qty; else items.push({ ...item, key });
  save(); emit(); render();
  flashAdded();
}
export function remove(key) { items = items.filter(i => i.key !== key); save(); emit(); render(); }
export function setQty(key, qty) { const it = items.find(i => i.key === key); if (!it) return; it.qty = Math.max(1, qty); save(); emit(); render(); }
export function clear() { items = []; save(); emit(); render(); }

function flashAdded() {
  const a = $('[data-added]');
  if (!a) return;
  a.classList.add('is-on');
  clearTimeout(flashAdded.t);
  flashAdded.t = setTimeout(() => a.classList.remove('is-on'), 1800);
}

export function open() {
  step = 'cart';
  $('[data-toast]')?.classList.remove('is-on');   /* уведомление «Добавлено» не висит над открытой корзиной */
  render();
  layers.open('cart', el, { onClose: () => { if (step === 'done') step = 'cart'; } });
}

const total = () => items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
const printFrom = () => items.reduce((s, i) => s + i.qty * (i.prints || []).reduce((a, p) => a + (p.priceFrom || 0), 0), 0);

function render() {
  if (!data) return;
  const body = $('.panel__body', el), foot = $('.panel__foot', el), title = $('[data-title]', el);
  if (step === 'cart') {
    title.textContent = 'Корзина';
    if (!items.length) {
      body.innerHTML = `<div class="cart__empty"><span>В корзине пока пусто.</span><button type="button" class="link" data-go-blanks>Каталог</button></div>`;
      foot.innerHTML = '';
    } else {
      body.innerHTML = `<div class="cart__list">${items.map(it => {
        const p = data.products.find(x => x.id === it.product.id);
        const pr = it.prints?.[0];
        const m = pr && data.methods.find(x => x.id === pr.method);
        return `<div class="ci" data-key="${esc(it.key)}">
          <div class="ci__media" data-gm="${esc(it.product.id)}" data-color="${esc(it.color)}"></div>
          <div class="ci__info">
            <b>${esc(it.product.name)}</b>
            <span class="t-mute">${esc([colorName(data, it.color), it.size, it.gram].filter(Boolean).join(' · '))}</span>
            ${pr ? `<span>+ ${esc(m?.name || pr.method)}${pr.priceFrom ? ' от ' + rub(pr.priceFrom) : ''}${pr.file ? ' · ' + esc(pr.file.name) : ''}</span>` : ''}
            <span>${rub(it.unitPrice * it.qty)}</span>
          </div>
          <div class="ci__act">
            <div class="qty"><button type="button" data-q="-1" aria-label="Меньше">−</button><output>${it.qty}</output><button type="button" data-q="1" aria-label="Больше">+</button></div>
            <button type="button" class="ci__rm" data-rm>Убрать</button>
          </div>
        </div>`;
      }).join('')}</div>`;
      $$('[data-gm]', body).forEach(n => { const p = data.products.find(x => x.id === n.dataset.gm); if (p) mountGarment(n, p, data, { color: n.dataset.color, variant: 'set', sizes: '72px' }); });
      foot.innerHTML = `<div class="cart__tot"><span>Бланки</span><span>${rub(total())}</span></div>
        ${printFrom() ? `<div class="cart__tot t-s"><small>Нанесение</small><small>от ${rub(printFrom())}</small></div>` : ''}
        <button type="button" class="btn btn--wide" data-checkout>Оформить заявку</button>
        <p class="cart__note">Оплаты на сайте нет: заявка уходит в Telegram, цену нанесения подтверждает менеджер.</p>`;
    }
  } else if (step === 'order') {
    title.textContent = 'Заявка';
    body.innerHTML = `<form class="ord" data-ord-form>
      <ul class="ord__sum">${items.map(it => `<li><span>${esc(it.product.name)} · ${esc([colorName(data, it.color), it.size].join(' · '))}${it.prints?.length ? ' · с нанесением' : ''}</span><span>${it.qty} шт</span></li>`).join('')}</ul>
      <div class="ord__fields">
        <label class="field"><span>Как с вами связаться</span><input name="contact" type="text" autocomplete="tel" placeholder="Telegram или телефон"></label>
        <label class="field"><span>Доставка или самовывоз</span><input name="delivery" type="text" placeholder="Город, способ — или заберу в шоуруме"></label>
        <label class="field"><span>Нужно к дате</span><input name="deadline" type="text" placeholder="Необязательно"></label>
        <label class="field"><span>Комментарий</span><textarea name="comment" rows="2" placeholder="Необязательно"></textarea></label>
      </div>
    </form>`;
    foot.innerHTML = `<div class="cart__tot"><span>Бланки</span><span>${rub(total())}</span></div>
      <button type="button" class="btn btn--wide" data-send>${data.settings.bot ? 'Отправить в бота' : 'Отправить в Telegram'}</button>
      <button type="button" class="link link--quiet" data-back style="justify-self:center">Назад в корзину</button>`;
  } else if (step === 'done') {
    title.textContent = 'Заявка готова';
    body.innerHTML = `<div class="ord">
      <div class="ord__id">${esc(lastOrder.id)}</div>
      <p class="t-s t-mute">${lastResult.sent ? 'Файлы макетов и картинки уже у производства. ' : ''}Текст заявки в кнопке ниже${lastResult.saved ? ', копия сохранена у нас' : ''}. Если Telegram не подставил текст — скопируйте и вставьте в чат.</p>
      <pre class="ord__pre">${esc(lastResult.text)}</pre>
    </div>`;
    foot.innerHTML = `<a class="btn btn--wide" href="${esc(lastResult.url)}" target="_blank" rel="noopener" data-tg>${esc(lastResult.label)}</a>
      <div class="ord__row"><button type="button" class="link" data-copy>Скопировать</button><button type="button" class="link link--quiet" data-clear>Очистить корзину</button></div>`;
  }
}

el.addEventListener('click', async e => {
  const t = e.target;
  if (t.closest('[data-close]')) { layers.close('cart'); return; }
  if (t.closest('[data-go-blanks]')) { layers.close('cart').then(() => document.getElementById('blanks')?.scrollIntoView({ block: 'start' })); return; }
  const ci = t.closest('.ci');
  if (ci && t.closest('[data-q]')) { const it = items.find(i => i.key === ci.dataset.key); setQty(ci.dataset.key, it.qty + +t.closest('[data-q]').dataset.q); return; }
  if (ci && t.closest('[data-rm]')) { remove(ci.dataset.key); return; }
  if (t.closest('[data-checkout]')) { step = 'order'; render(); $('.panel__body', el).scrollTop = 0; return; }
  if (t.closest('[data-back]')) { step = 'cart'; render(); return; }
  if (t.closest('[data-send]')) {
    const f = $('[data-ord-form]', el);
    const extras = Object.fromEntries([...new FormData(f)].map(([k, v]) => [k, String(v).trim()]));
    lastOrder = buildOrder({ items, extras });
    t.closest('[data-send]').disabled = true;
    lastResult = await send(lastOrder, data);
    step = 'done'; render();
    /* на телефоне и компьютере ссылка открывается кликом по кнопке — без всплывающих окон */
    return;
  }
  if (t.closest('[data-copy]')) { copy(lastResult.text); return; }
  if (t.closest('[data-clear]')) { clear(); step = 'cart'; render(); return; }
});

/* заявка пошива из другого модуля — та же панель, шаг «готово» */
export async function sendExternal(order) {
  lastOrder = order;
  lastResult = await send(order, data);
  step = 'done';
  render();
  layers.open('cart', el, { onClose: () => { step = 'cart'; } });
  return lastResult;
}

export { orderText };
