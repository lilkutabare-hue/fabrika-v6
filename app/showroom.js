/* showroom.js — производство и шоурум (план §7.10), условия (§7.11). Пустые поля не показываются.
   Пока нет кадра цеха, слот показывает ту же вещь, что первый экран. factoryMedia не придумываем. */
import { esc } from './data.js';
import { mountGarment } from './garment.js';
import { $, $$, copy } from './ui.js';

let data = null;
let frameView = null;
let frameKey = '';
const root = $('#factory');
const terms = $('#terms');
const mediaUrl = m => /^https?:|^\//.test(m) ? m : '/_blob/' + m;

/* Та же вещь, что на первом экране: settings.hero, иначе первый бланк с рендером. Цвет — выбранный там. */
function heroGarment() {
  const id = data.settings?.hero;
  const p = (id && data.products.find(x => x.id === id)) || data.products.find(x => x.hasRender) || data.products[0];
  if (!p) return null;
  const on = document.querySelector('#hero [data-swatches] [aria-pressed="true"]')?.dataset.color;
  return { p, color: on && p.colors.includes(on) ? on : p.colors[0] };
}

export function init(d) { data = d; render(); renderTerms(); live(); }
export function setData(d) { data = d; render(); renderTerms(); }

function render() {
  const r = data.route || {}, a = r.address || '';
  paintFrame();
  const enc = encodeURIComponent;
  $('[data-addr]', root).textContent = a;
  $('[data-route]', root).innerHTML = a ? `
    <a class="btn" href="https://yandex.ru/maps/?rtext=~${enc(a)}&rtt=pd" target="_blank" rel="noopener">Маршрут</a>
    <a class="link" href="https://yandex.ru/maps/?text=${enc(a)}" target="_blank" rel="noopener">Яндекс Карты</a>
    <a class="link" href="https://2gis.ru/moscow/search/${enc(a)}" target="_blank" rel="noopener">2ГИС</a>
    <button type="button" class="link" data-copy="${esc(a)}">Копировать</button>` : '';
  const extra = $('[data-route-extra]', root);
  const steps = (r.steps || []).filter(s => s.text || s.photo);
  extra.innerHTML = [
    r.hours ? `<p><span class="t-mute">Часы</span> ${esc(r.hours)}</p>` : '',
    r.note ? `<p class="t-s">${esc(r.note)}</p>` : '',
    r.map ? `<div class="rmap"><img src="${mediaUrl(r.map)}" alt="Схема проезда" loading="lazy"></div>` : '',
    steps.length ? `<details class="rows__item"><summary class="t-s">Как пройти</summary><div class="walk">${steps.map((s, i) => `<figure><div class="ph">${s.photo ? `<img src="${mediaUrl(s.photo)}" alt="" loading="lazy">` : ''}</div><figcaption><span>${i + 1}</span>${esc(s.text)}</figcaption></figure>`).join('')}</div></details>` : '',
  ].join('');
  const m = data.settings.manager || 'trtmoscow';
  $('[data-contacts]', root).innerHTML = `
    <a class="btn" href="https://t.me/${esc(m)}" target="_blank" rel="noopener">Написать в Telegram</a>
    <div class="contacts">
      <a href="tel:+79055776969"><span class="t-mute">Телефон</span>+7 905 577-69-69</a>
      <a href="https://t.me/fabrikamrkt" target="_blank" rel="noopener"><span class="t-mute">Канал</span>@fabrikamrkt</a>
      <a href="https://vk.com/trt.moscow" target="_blank" rel="noopener"><span class="t-mute">VK</span>trt.moscow</a>
    </div>`;
}

function renderTerms() {
  const t = data.terms || {};
  const fact = x => x && x.status === 'fact' && x.value != null;
  const rows = [];
  const minQ = [['Бланки', t.minQty?.blanks], ['Нанесение', t.minQty?.print], ['Пошив под заказ', t.minQty?.sewing]].filter(x => fact(x[1]));
  if (minQ.length) rows.push({ title: 'Минимальные тиражи', hint: minQ.every(x => x[1].value === 1) ? 'всё от одной штуки' : '', body: `<ul class="terms__list">${minQ.map(([k, v]) => `<li><span>${esc(k)}</span><span>от ${esc(v.value)} ${esc(v.unit || 'шт')}</span></li>`).join('')}</ul><p class="t-s t-mute" style="margin-top:12px">Одна штука — это и есть образец: закажите, примерьте, потом тираж.</p>` });
  const lead = [['Бланки из наличия', t.lead?.stock], ['Образец под заказ', t.lead?.sample], ['Тираж под заказ', t.lead?.run]].filter(x => fact(x[1]));
  if (lead.length) rows.push({ title: 'Сроки', hint: '', body: `<ul class="terms__list">${lead.map(([k, v]) => `<li><span>${esc(k)}</span><span>${esc(v.value)}</span></li>`).join('')}</ul>` });
  const del = [['Доставка', t.delivery], ['Самовывоз', t.pickup]].filter(x => fact(x[1]));
  if (del.length) rows.push({ title: 'Доставка и самовывоз', hint: '', body: `<ul class="terms__list">${del.map(([k, v]) => `<li><span>${esc(k)}</span><span>${esc(v.value)}</span></li>`).join('')}</ul>` });
  const pay = [['Предоплата', t.payment?.prepay], ['Способы оплаты', t.payment?.methods]].filter(x => fact(x[1]));
  if (pay.length) rows.push({ title: 'Оплата', hint: '', body: `<ul class="terms__list">${pay.map(([k, v]) => `<li><span>${esc(k)}</span><span>${esc(v.value)}</span></li>`).join('')}</ul>` });
  if (fact(t.warranty)) rows.push({ title: 'Гарантии', hint: '', body: `<p class="t-s">${esc(t.warranty.value)}</p>` });
  const box = $('[data-terms]', terms);
  box.innerHTML = rows.map(r => `<details><summary><span>${esc(r.title)}</span>${r.hint ? `<small>${esc(r.hint)}</small>` : ''}</summary><div class="rows__body">${r.body}</div></details>`).join('');
  terms.hidden = !rows.length;
}

/* Кадр цеха, если файл уже есть. Иначе — крупно та же вещь, что на первом экране. Схемы ниже не трогаем. */
function paintFrame() {
  const frame = $('[data-factory-frame]', root);
  if (!frame) return;
  const fm = data.settings.factoryMedia;
  if (fm) {
    frameView = null;
    frameKey = '';
    frame.hidden = false;
    frame.classList.remove('is-garment');
    frame.innerHTML = /\.(mp4|webm)(\?|$)/i.test(fm) ? `<video src="${esc(mediaUrl(fm))}" autoplay muted loop playsinline></video>` : `<img src="${esc(mediaUrl(fm))}" alt="">`;
    return;
  }
  const hero = heroGarment();
  if (!hero) {
    frameView = null;
    frameKey = '';
    frame.hidden = true;
    frame.innerHTML = '';
    return;
  }
  const key = hero.p.id + ':' + hero.color;
  frame.hidden = false;
  frame.classList.add('is-garment');
  if (frameView && frameView.id === hero.p.id && frame.querySelector('.gm')) {
    frameView.view.setColor(hero.color);
    frameKey = key;
    return;
  }
  if (frameKey === key && frame.querySelector('.gm')) return;
  frame.innerHTML = '<div class="gm"></div>';
  frameView = { id: hero.p.id, view: mountGarment(frame.firstElementChild, hero.p, data, { color: hero.color, variant: 'fit', sizes: '(min-width:1024px) 56vw, 75vw' }) };
  frameKey = key;
}

/* схемы оживают, когда на экране */
function live() {
  const io = new IntersectionObserver(es => es.forEach(x => x.target.classList.toggle('is-live', x.isIntersecting)), { threshold: .2 });
  $$('[data-live]', root).forEach(n => io.observe(n));
  const hero = document.getElementById('hero');
  hero?.addEventListener('click', e => { if (!data.settings.factoryMedia && e.target.closest('[data-color]')) paintFrame(); });
}

root.addEventListener('click', e => { const b = e.target.closest('[data-copy]'); if (b) copy(b.dataset.copy); });
