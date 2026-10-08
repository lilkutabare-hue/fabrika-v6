/* admin.js — админка из v5 без изменения поведения: товары, заявки, шоурум, настройки, палитра.
   Работает только в артефакте (window.claude): db / user / assets. Формат документов не меняется:
   products/*, settings/main, settings/route, settings/palette (items), orders (code, text, status, createdAt, total, data). */
import { registerOverlay, updateData, normalize, getData, esc, rub, CATS } from './data.js';
import { mountGarment, sketchSVG } from './garment.js';
import { addSender } from './order.js';
import * as layers from './layers.js';
import { $, $$, toast, copy } from './ui.js';

const TYPES = [['tee', 'Футболка'], ['long', 'Лонгслив'], ['sweat', 'Свитшот'], ['hood', 'Худи'], ['zhood', 'Зип-худи'], ['olymp', 'Олимпийка'], ['pants', 'Штаны'], ['shorts', 'Шорты'], ['top', 'Топ']];
let DB = null, ASSETS = null, CAN = false, ORDERS = [];
let ALL = [], PAL = null, SET = null, ROUTE = null;
let tab = 'p', edit = null, draft = null, rdraft = null;
const el = $('[data-layer="admin"]');
const mediaUrl = m => /^https?:|^\//.test(m) ? m : '/_blob/' + m;

/* 2-й способ отправки заявки: запись в базу артефакта */
addSender({
  id: 'db',
  async run(order, text) {
    if (!DB) return null;
    await DB.collection('orders').add({ code: order.id, text, status: 'new', createdAt: order.createdAt, total: order.totals.blanks, data: order });
    return { saved: true };
  },
});

registerOverlay(async data => {
  if (!window.claude || !claude.use) return data;
  try {
    const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
    DB = db;
    if (user) CAN = (await user.isOwner()) || (await user.canEdit());
    if (CAN) { ASSETS = await claude.use('assets'); $('[data-adm-btn]').hidden = false; }
  } catch (e) { console.warn('claude db', e); return data; }
  if (!DB) return data;
  ALL = data.raw.catalog.products || []; PAL = data.raw.catalog.palette || []; SET = { ...data.settings }; ROUTE = { ...data.route };
  const push = () => updateData({ products: ALL, palette: PAL, settings: SET, route: ROUTE });
  DB.collection('products').onSnapshot(s => { if (s.empty) return; ALL = s.docs.map(d => ({ id: d.id, ...d.data() })); push(); if (layers.isOpen('admin') && !edit) render(); }, () => {});
  DB.doc('settings/main').onSnapshot(s => { if (s.exists) { SET = { ...SET, ...s.data() }; push(); } }, () => {});
  DB.doc('settings/route').onSnapshot(s => { if (s.exists) { ROUTE = { ...ROUTE, ...s.data() }; push(); } }, () => {});
  DB.doc('settings/palette').onSnapshot(s => { const it = s.exists && s.data().items; if (Array.isArray(it) && it.length) { PAL = it; push(); } }, () => {});
  if (CAN) DB.collection('orders').orderBy('createdAt', 'desc').limit(200).onSnapshot(s => {
    ORDERS = s.docs.map(d => ({ id: d.id, ...d.data() }));
    const n = ORDERS.filter(o => o.status === 'new').length;
    const b = $('[data-adm-btn] sup'); if (b) { b.hidden = !n; b.textContent = n; }
    if (layers.isOpen('admin') && tab === 'o') render();
  }, () => {});
  return data;
});

export function open() { edit = null; render(); layers.open('admin', el); }

const colorsAll = () => PAL.map(c => c.k);
const colorOf = k => PAL.find(c => c.k === k) || { name: 'Цвет', hex: '#CCCCCC' };

function render() {
  $('.panel__body', el).innerHTML = `
    <div class="seg adm__tabs">${[['p', 'Товары'], ['o', `Заявки${ORDERS.filter(o => o.status === 'new').length ? ' <sup>' + ORDERS.filter(o => o.status === 'new').length + '</sup>' : ''}`], ['r', 'Шоурум'], ['s', 'Настройки']].map(([k, n]) => `<button type="button" data-tab="${k}" aria-pressed="${tab === k}">${n}</button>`).join('')}</div>
    <div data-body>${tab === 'p' ? (edit ? editHTML() : listHTML()) : tab === 'o' ? ordersHTML() : tab === 's' ? setHTML() : routeHTML()}</div>`;
  const data = getData();
  $$('[data-th]', el).forEach(n => { const p = data.products.find(x => x.id === n.dataset.th) || ALL.find(x => x.id === n.dataset.th); if (p) mountGarment(n, { ...p, colors: p.colors || [], media: data.products.find(x => x.id === p.id)?.media || null, swatch: {} }, data, { color: (p.colors || [])[0] || colorsAll()[0], variant: 'set', sizes: '48px' }); });
}

function listHTML() {
  const list = [...ALL].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return `<button type="button" class="btn btn--wide" data-a="new" style="margin-bottom:12px">+ Добавить товар</button>
  ${DB ? '' : '<p class="hint">База недоступна в этом просмотре — изменения не сохранятся.</p>'}
  <div class="adm__list">${list.map((p, i) => `<div class="arow${p.hidden ? ' off' : ''}"><div class="th" data-th="${esc(p.id)}"></div>
    <div><b>${esc(p.name)}</b><small>${esc(p.code || '')} · ${rub(+p.price || 0)}${p.hidden ? ' · скрыт' : ''}${p.tag ? ' · ' + esc(p.tag) : ''}</small></div>
    <div class="aact"><button type="button" data-a="up" data-id="${esc(p.id)}" aria-label="Выше" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-a="down" data-id="${esc(p.id)}" aria-label="Ниже" ${i === list.length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="ed" data-a="edit" data-id="${esc(p.id)}">Изменить</button></div></div>`).join('')}</div>`;
}
function editHTML() {
  const d = draft;
  return `<div class="adm__form">
  <button type="button" class="link link--quiet" data-a="back" style="justify-self:start">← Все товары</button>
  <label class="field"><span>Название</span><input type="text" id="f-name" value="${esc(d.name)}"></label>
  <div class="f2"><label class="field"><span>Цена, ₽</span><input type="number" id="f-price" inputmode="numeric" value="${esc(d.price)}"></label>
    <label class="field"><span>Артикул</span><input type="text" id="f-code" value="${esc(d.code)}"></label></div>
  <div class="f2"><label class="field"><span>Раздел</span><select id="f-cat">${CATS.map(([k, n]) => `<option value="${k}" ${k === d.cat ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="field"><span>Эскиз</span><select id="f-type">${TYPES.map(([k, n]) => `<option value="${k}" ${k === d.type ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
  <label class="field"><span>Плотности (через запятую)</span><input type="text" id="f-grams" value="${esc((d.grams || []).join(', '))}"></label>
  <div class="f2"><label class="field"><span>Наличие</span><select id="f-stock"><option value="1" ${d.stock !== false ? 'selected' : ''}>В наличии</option><option value="0" ${d.stock === false ? 'selected' : ''}>Нет — под заказ</option></select></label>
    <label class="field"><span>Сошьём за, дней</span><input type="number" id="f-make" inputmode="numeric" value="${esc(d.makeDays ?? '')}" placeholder="если нет в наличии"></label></div>
  <label class="field"><span>Состав</span><input type="text" id="f-comp" value="${esc(d.composition || '')}" placeholder="например 100 % хлопок"></label>
  <label class="field"><span>Отправка, дней</span><input type="number" id="f-ship" inputmode="numeric" value="${esc(d.shipDays ?? '')}"></label>
  <div class="field"><span>Метка</span><div class="seg" data-tag>${['', 'Хит', 'New', 'Drop', 'Sale'].map(t => `<button type="button" aria-pressed="${(d.tag || '') === t}" data-t="${t}">${t || 'Нет'}</button>`).join('')}</div></div>
  <div class="field"><span>Цвета</span><div class="chipc" data-cols>${colorsAll().map(k => `<button type="button" class="${(d.colors || []).includes(k) ? 'on' : ''}" data-k="${esc(k)}" style="--c:${colorOf(k).hex}"><i></i>${esc(colorOf(k).name)}</button>`).join('')}</div></div>
  <div class="field"><span>Анимация / фото</span><div class="mbox"><div class="pv1">${d.media && typeof d.media === 'string' ? `<img src="${mediaUrl(d.media)}" alt="">` : `<div class="gm">${sketchSVG(d.type, colorOf((d.colors || [])[0] || colorsAll()[0]).hex).replace('<svg ', '<svg class="is-on" ')}</div>`}</div>
    <div class="bb">${ASSETS ? `<label class="btn btn--ghost btn--sm"><input type="file" id="f-file" accept="image/webp,image/gif,image/png,image/jpeg">${d.media ? 'Заменить файл' : 'Загрузить WebP / GIF'}</label>` : '<span class="hint">Загрузка файлов доступна владельцу</span>'}
      ${d.media ? `<button type="button" class="link link--quiet" data-a="unmedia">Вернуть эскиз</button>` : ''}<span class="hint" id="f-up"></span></div></div></div>
  <label class="tog"><span>Показывать на витрине</span><input type="checkbox" id="f-vis" ${d.hidden ? '' : 'checked'}></label>
  <div class="abar"><button type="button" class="btn" data-a="save">Сохранить</button>${d.id ? `<button type="button" class="btn btn--red" data-a="del">Удалить</button>` : ''}</div></div>`;
}
function readForm() {
  const d = draft;
  d.name = $('#f-name').value.trim(); d.price = Math.max(0, Math.round(+$('#f-price').value || 0)); d.code = $('#f-code').value.trim();
  d.cat = $('#f-cat').value; d.type = $('#f-type').value;
  d.grams = $('#f-grams').value.split(',').map(x => x.trim()).filter(Boolean); d.hidden = !$('#f-vis').checked;
  d.stock = $('#f-stock').value === '1' ? undefined : false; if (d.stock === undefined) delete d.stock;
  const mk = +$('#f-make').value; if (mk) d.makeDays = mk; else delete d.makeDays;
  const comp = $('#f-comp').value.trim(); if (comp) d.composition = comp; else delete d.composition;
  const sh = +$('#f-ship').value; if (sh) d.shipDays = sh; else delete d.shipDays;
}
function ordersHTML() {
  if (!DB) return `<div class="adm__empty">База недоступна в этом просмотре</div>`;
  if (!ORDERS.length) return `<div class="adm__empty">Заявок пока нет. Они появятся здесь, когда кто-то нажмёт «Отправить».</div>`;
  const L = { new: 'Новая', work: 'В работе', done: 'Готово' };
  return ORDERS.map(o => `<div class="ocard${o.status === 'new' ? ' new' : ''}"><div class="oh"><span><b>${esc(o.code || o.id)}</b> · ${new Date(o.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
    <div class="seg">${Object.entries(L).map(([k, n]) => `<button type="button" aria-pressed="${o.status === k}" data-a="ost" data-id="${esc(o.id)}" data-s="${k}">${n}</button>`).join('')}</div></div>
    <pre>${esc(o.text)}</pre><div class="of"><button type="button" class="link link--quiet" data-a="ocopy" data-id="${esc(o.id)}">Скопировать</button><button type="button" class="link link--quiet" data-a="odel" data-id="${esc(o.id)}">Удалить</button></div></div>`).join('');
}
function setHTML() {
  return `<div class="adm__form">
  <div class="sech">Telegram</div>
  <label class="field"><span>Бот (username без @)</span><input type="text" id="s-bot" value="${esc(SET.bot)}" placeholder="например fabrika_bot"></label>
  <p class="hint">Если заполнено — заявки открывают бота с номером заказа.</p>
  <label class="field"><span>Менеджер (username без @)</span><input type="text" id="s-man" value="${esc(SET.manager)}"></label>
  <label class="field"><span>Сервер заявок (URL воркера)</span><input type="url" id="s-api" value="${esc(SET.api || '')}" placeholder="https://orders.fabrika.market"></label>
  <p class="hint">Если задан — заявка с файлами уходит на сервер, тот делает DTF-раскладку и пишет в чат заказов. Внутри артефакта не работает, только на сайте.</p>
  <div class="sech">Нанесение</div>
  <div class="f2"><label class="field"><span>DTF, от ₽</span><input type="number" id="s-dtf" inputmode="numeric" value="${esc(SET.dtf)}"></label>
    <label class="field"><span>Вышивка, от ₽</span><input type="number" id="s-emb" inputmode="numeric" value="${esc(SET.emb)}"></label></div>
  <button type="button" class="btn btn--wide" data-a="ssave">Сохранить настройки</button>
  <div class="sech">Палитра</div><p class="hint">Цвет, название и ключ. Ключ — латиницей, по нему цвет привязан к товарам. У товаров с рендерами показываются только цвета рендеров.</p>
  <div data-pal>${PAL.map(c => palRow(c.k, c.name, c.hex)).join('')}</div>
  <div class="abar"><button type="button" class="btn btn--ghost btn--sm" data-a="padd">+ Цвет</button><button type="button" class="btn btn--sm" data-a="psave">Сохранить палитру</button></div></div>`;
}
const palRow = (k, n, h) => `<div class="prow2"><input type="color" value="${h}" aria-label="Цвет"><input type="text" value="${esc(n)}" aria-label="Название"><input type="text" value="${esc(k)}" aria-label="Ключ"><button type="button" data-a="prm" aria-label="Убрать">×</button></div>`;
function routeHTML() {
  if (!rdraft) rdraft = JSON.parse(JSON.stringify({ address: '', hours: '', note: '', map: null, steps: [], ...ROUTE }));
  const r = rdraft;
  return `<div class="adm__form">
  <label class="field"><span>Адрес</span><input type="text" id="r-addr" value="${esc(r.address)}"></label>
  <label class="field"><span>Часы работы</span><input type="text" id="r-hours" value="${esc(r.hours)}" placeholder="например Пн–Пт 10:00–19:00"></label>
  <label class="field"><span>Подсказка</span><input type="text" id="r-note" value="${esc(r.note)}" placeholder="например вход со двора"></label>
  <div class="field"><span>Карта / схема проезда</span><div class="mbox"><div class="pv1">${r.map ? `<img src="${mediaUrl(r.map)}" alt="">` : '<span class="hint">нет</span>'}</div>
    <div class="bb">${ASSETS ? `<label class="btn btn--ghost btn--sm"><input type="file" id="r-mapf" accept="image/png,image/jpeg,image/webp">${r.map ? 'Заменить' : 'Загрузить скрин карты'}</label>` : ''}${r.map ? `<button type="button" class="link link--quiet" data-a="r-unmap">Убрать</button>` : ''}</div></div></div>
  <div class="sech">Как пройти</div>
  ${(r.steps || []).map((s, i) => `<div class="mbox"><div class="pv1">${s.photo ? `<img src="${mediaUrl(s.photo)}" alt="">` : `<span class="hint">шаг ${i + 1}</span>`}</div>
    <div class="bb" style="width:100%"><input type="text" class="r-st" data-i="${i}" value="${esc(s.text)}" placeholder="Что делать на этом шаге" style="width:100%;min-height:40px;border:0;border-bottom:1px solid var(--ink);font-size:16px">
      <div style="display:flex;gap:16px">${ASSETS ? `<label class="link link--quiet" style="cursor:pointer"><input type="file" class="r-sf" data-i="${i}" accept="image/png,image/jpeg,image/webp">Фото</label>` : ''}<button type="button" class="link link--quiet" data-a="r-rm" data-i="${i}">Убрать</button></div></div></div>`).join('')}
  <button type="button" class="btn btn--ghost btn--sm" data-a="r-add" style="justify-self:start">+ Шаг</button>
  <div class="abar"><button type="button" class="btn" data-a="r-save">Сохранить шоурум</button><button type="button" class="link link--quiet" data-a="r-reset">Сбросить</button></div></div>`;
}
function readRoute() { const r = rdraft; r.address = $('#r-addr').value.trim(); r.hours = $('#r-hours').value.trim(); r.note = $('#r-note').value.trim(); $$('.r-st', el).forEach(x => { r.steps[+x.dataset.i].text = x.value.trim(); }); }

async function save(path, body, ok) {
  if (!DB) { toast('База недоступна — не сохранено'); return false; }
  try { await DB.doc(path).set(body); if (ok) toast(ok); return true; }
  catch (e) { toast(e && e.code === 'invalid_argument' ? 'Нет прав на изменение' : 'Не сохранилось — попробуйте ещё раз'); return false; }
}

el.addEventListener('click', async e => {
  const t = e.target;
  if (t.closest('[data-close]')) { layers.close('admin'); return; }
  const tb = t.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab; edit = null; rdraft = null; render(); return; }
  const tg = t.closest('[data-tag] button'); if (tg) { draft.tag = tg.dataset.t; $$('[data-tag] button', el).forEach(x => x.setAttribute('aria-pressed', x === tg)); return; }
  const ck = t.closest('[data-cols] button'); if (ck) { const k = ck.dataset.k; draft.colors = draft.colors.includes(k) ? draft.colors.filter(x => x !== k) : [...draft.colors, k]; ck.classList.toggle('on'); return; }
  const b = t.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a, id = b.dataset.id;
  if (a === 'new') { edit = 'new'; draft = { name: 'Новый товар', price: 990, code: '', cat: 'tshirt', type: 'tee', grams: ['220 г'], colors: colorsAll().slice(0, 3), tag: '', hidden: true, media: null }; render(); return; }
  if (a === 'edit') { edit = id; draft = JSON.parse(JSON.stringify(ALL.find(p => p.id === id))); render(); return; }
  if (a === 'back') { edit = null; render(); return; }
  if (a === 'up' || a === 'down') {
    const list = [...ALL].sort((x, y) => (x.order ?? 0) - (y.order ?? 0)); const i = list.findIndex(p => p.id === id), j = a === 'up' ? i - 1 : i + 1; if (j < 0 || j >= list.length) return;
    list.forEach((p, k) => p.order = k); [list[i].order, list[j].order] = [list[j].order, list[i].order];
    for (const p of [list[i], list[j]]) { const { id: pid, ...rest } = p; await save('products/' + pid, rest); }
    render(); return;
  }
  if (a === 'unmedia') { readForm(); draft.media = null; render(); return; }
  if (a === 'save') {
    readForm(); if (!draft.name) { toast('Нужно название'); return; } if (!draft.colors.length) { toast('Выберите хотя бы один цвет'); return; }
    b.disabled = true; const pid = draft.id || ('p-' + Date.now().toString(36)); const { id: _x, ...body } = draft; if (body.order == null) body.order = ALL.length;
    if (await save('products/' + pid, body, 'Сохранено')) { edit = null; render(); } else b.disabled = false; return;
  }
  if (a === 'del') {
    if (!b.classList.contains('arm')) { b.classList.add('arm'); b.textContent = 'Точно удалить?'; setTimeout(() => { b.classList.remove('arm'); b.textContent = 'Удалить'; }, 3000); return; }
    try { await DB.doc('products/' + draft.id).delete(); if (draft.media && ASSETS && !/^https?:|^\//.test(draft.media)) ASSETS.delete(draft.media).catch(() => {}); toast('Удалено'); edit = null; render(); } catch { toast('Не удалилось'); } return;
  }
  if (a === 'ost') { try { await DB.doc('orders/' + id).update({ status: b.dataset.s }); } catch { toast('Не сохранилось'); } return; }
  if (a === 'ocopy') { copy(ORDERS.find(x => x.id === id)?.text || ''); return; }
  if (a === 'odel') { if (!b.classList.contains('arm')) { b.classList.add('arm'); b.textContent = 'Точно?'; setTimeout(() => { b.classList.remove('arm'); b.textContent = 'Удалить'; }, 3000); return; } try { await DB.doc('orders/' + id).delete(); } catch { toast('Не удалилось'); } return; }
  if (a === 'ssave') { const n = { bot: $('#s-bot').value.trim().replace(/^@/, ''), manager: $('#s-man').value.trim().replace(/^@/, ''), api: $('#s-api').value.trim(), dtf: Math.max(0, +$('#s-dtf').value || 0), emb: Math.max(0, +$('#s-emb').value || 0) }; if (await save('settings/main', n, 'Настройки сохранены')) { SET = { ...SET, ...n }; } return; }
  if (a === 'padd') { $('[data-pal]', el).insertAdjacentHTML('beforeend', palRow('c' + Date.now().toString(36).slice(-4), 'Новый цвет', '#888888')); return; }
  if (a === 'prm') { b.closest('.prow2').remove(); return; }
  if (a === 'psave') {
    const items = $$('[data-pal] .prow2', el).map(r => { const [c, n, k] = r.querySelectorAll('input'); return { k: k.value.trim().replace(/[^a-z0-9_-]/gi, ''), name: n.value.trim() || 'Цвет', hex: c.value }; }).filter(x => x.k);
    if (!items.length) { toast('Нужен хотя бы один цвет'); return; } if (new Set(items.map(x => x.k)).size !== items.length) { toast('Ключи цветов повторяются'); return; }
    if (await save('settings/palette', { items }, 'Палитра сохранена')) PAL = items; return;
  }
  if (a.startsWith('r-')) {
    readRoute();
    if (a === 'r-add') { rdraft.steps.push({ text: '', photo: null }); render(); return; }
    if (a === 'r-rm') { rdraft.steps.splice(+b.dataset.i, 1); render(); return; }
    if (a === 'r-unmap') { rdraft.map = null; render(); return; }
    if (a === 'r-reset') { rdraft = null; render(); return; }
    if (a === 'r-save') { if (!rdraft.address) { toast('Нужен адрес'); return; } rdraft.steps = rdraft.steps.filter(s => s.text || s.photo); if (await save('settings/route', rdraft, 'Шоурум сохранён')) { ROUTE = { ...rdraft }; rdraft = null; render(); } }
  }
});
el.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'f-type' && !draft.media) { draft.type = t.value; render(); return; }
  if (t.id === 'f-file') { const f = t.files[0]; if (!f || !ASSETS) return; $('#f-up').textContent = 'Загружаю…'; try { const r = await ASSETS.upload(f); readForm(); draft.media = r.id; render(); $('#f-up').textContent = 'Готово — не забудьте «Сохранить»'; } catch (err) { $('#f-up').textContent = { too_large: 'Файл больше 20 МБ', unsupported_type: 'Нужен WebP, GIF, PNG или JPG', rate_limited: 'Слишком часто — подождите минуту' }[err && err.code] || 'Не загрузилось'; } return; }
  if (tab === 'r' && (t.id === 'r-mapf' || t.classList.contains('r-sf'))) {
    const f = t.files[0]; if (!f || !ASSETS) return; readRoute(); toast('Загружаю…');
    try { const up = await ASSETS.upload(f); if (t.id === 'r-mapf') rdraft.map = up.id; else rdraft.steps[+t.dataset.i].photo = up.id; render(); toast('Загружено — не забудьте «Сохранить»'); }
    catch (err) { toast({ too_large: 'Файл больше 20 МБ', unsupported_type: 'Нужен PNG, JPG или WebP' }[err && err.code] || 'Не загрузилось'); }
  }
});
