/* order.js — заявка как данные (план §9.3), текст для Telegram и сменные способы отправки (§9.4).
   Новый способ отправки — одна функция в SENDERS. */
import { rub, colorName, esc } from './data.js';
import { presetsFor } from './print/zones.js';
import { uid } from './ui.js';

/* Файлы макетов живут в памяти до отправки — для будущего способа 3 (бот + сервер) */
export const fileStore = new Map();

export function buildOrder({ items = [], sewing = null, extras = {} }) {
  const order = {
    v: 1,
    id: uid(),
    createdAt: new Date().toISOString(),
    items: items.map(it => ({
      product: { id: it.product.id, code: it.product.code || null, name: it.product.name },
      color: it.color, size: it.size, gram: it.gram || null,
      qty: it.qty, unitPrice: it.unitPrice,
      prints: (it.prints || []).map(p => ({
        method: p.method, film: p.film || null,
        side: p.side, place: p.place,
        width_mm: p.width_mm ?? null, height_mm: p.height_mm ?? null,
        offset_mm: p.offset_mm || null, center: p.center || null, scale_pct: p.scale_pct ?? null,
        allow_rotate: true,
        rotate_deg: p.rotate_deg || 0, mirrored: !!p.mirrored,
        file: p.file ? { id: p.file.id || null, name: p.file.name, type: p.file.type, px: p.file.px || null, hasAlpha: p.file.hasAlpha ?? null, dpi: p.file.dpi ?? null, kept: fileStore.has(p.file.id) } : null,
        mockup: p.mockup || null,
        text: null,
        checks: (p.checks || []).map(c => c.code),
        priceFrom: p.priceFrom ?? null,
      })),
    })),
    sewing,
    totals: {
      blanks: items.reduce((s, it) => s + it.qty * it.unitPrice, 0),
      printFrom: items.reduce((s, it) => s + it.qty * (it.prints || []).reduce((a, p) => a + (p.priceFrom || 0), 0), 0),
    },
  };
  for (const k of ['delivery', 'deadline', 'budget', 'packaging', 'comment', 'contact']) if (extras[k]) order[k] = extras[k];
  return order;
}

const NAMES = { chest: 'грудь слева', 'chest-r': 'грудь справа', center: 'центр', full: 'вся грудь', 'sleeve-l': 'левый рукав', 'sleeve-r': 'правый рукав', hem: 'низ', pocket: 'карман', nape: 'под воротом', back: 'спина', hoodie: 'капюшон', leg: 'бедро', 'leg-l': 'левая штанина', knee: 'колено', hip: 'пояс', custom: 'своё место' };
const placeName = (side, place) => NAMES[place] || place;

export function orderText(order, data) {
  const L = [];
  L.push(`Заявка ${order.id} · fabrika.market`);
  if (order.items.length) {
    L.push('');
    order.items.forEach((it, i) => {
      const bits = [colorName(data, it.color), it.size, it.gram].filter(Boolean).join(' · ');
      L.push(`${i + 1}. ${it.product.name} — ${bits} — ${it.qty} шт × ${rub(it.unitPrice)}`);
      for (const p of it.prints) {
        const m = data.methods.find(x => x.id === p.method);
        const size = p.width_mm ? `${p.width_mm}×${p.height_mm} мм` : (p.scale_pct != null ? `${p.scale_pct} % зоны, размер уточнит менеджер` : 'размер уточнит менеджер');
        const pos = p.center ? ` (центр ${Math.round(p.center.x * 100)} % × ${Math.round(p.center.y * 100)} % от вещи)` : '';
        L.push(`   + ${m?.name || p.method}${p.film ? ' (' + p.film.name + ')' : ''}: ${side(p.side)}, ${placeName(p.side, p.place)}${pos}, ${size}${p.priceFrom ? ', от ' + rub(p.priceFrom) : ''}`);
        if (p.file) L.push(`     файл: ${p.file.name}${p.file.px ? ' ' + p.file.px.join('×') + ' px' : ''}${p.file.hasAlpha === false ? ', без прозрачности' : ''}${p.file.dpi ? ', ' + p.file.dpi + ' dpi' : ''}`);
        if (p.checks.length) L.push(`     проверка: ${p.checks.join(', ')}`);
      }
    });
    L.push('');
    L.push(`Бланки: ${rub(order.totals.blanks)}${order.totals.printFrom ? ` · нанесение от ${rub(order.totals.printFrom)}` : ''}`);
  }
  if (order.sewing) {
    const s = order.sewing;
    L.push('');
    L.push('Пошив под заказ');
    if (s.item) L.push(`Что шьём: ${s.item}`);
    if (s.qty) L.push(`Тираж: ${s.qty}`);
    if (s.reference) L.push(`Референс: ${s.reference}`);
    if (s.deadline) L.push(`Срок: ${s.deadline}`);
    if (s.comment) L.push(`Комментарий: ${s.comment}`);
  }
  for (const [k, n] of [['contact', 'Связь'], ['delivery', 'Доставка'], ['deadline', 'Срок'], ['comment', 'Комментарий']]) if (order[k] && !(order.sewing && k !== 'contact')) L.push(`${n}: ${order[k]}`);
  return L.join('\n');
}
const side = s => s === 'back' ? 'спина' : 'перёд';

/* Пустой settings.api: с вкладки уходит только текст. Файл остаётся у человека, его кладут в чат. */
export const TEXT_ONLY_CAPTION = 'Уходит текст, файл надо приложить в чат';

export function orderApi(settings) {
  return String(settings?.api || '').trim().replace(/\/$/, '');
}

export function sendCaption(settings, where) {
  if (!orderApi(settings)) return TEXT_ONLY_CAPTION;
  if (where === 'done') return settings?.bot ? 'Открыть бота' : 'Открыть Telegram';
  if (where === 'sew') return 'Отправить задачу';
  return settings?.bot ? 'Отправить в бота' : 'Отправить в Telegram';
}

/* ---------- способы отправки ---------- */
export const SENDERS = [
  /* 1. Telegram: бот с номером заявки или чат менеджера с текстом */
  {
    id: 'telegram',
    run(order, text, data) {
      const s = data.settings;
      const url = s.bot
        ? `https://t.me/${encodeURIComponent(s.bot)}?start=${encodeURIComponent(order.id)}`
        : `https://t.me/${encodeURIComponent(s.manager || 'trtmoscow')}?text=${encodeURIComponent(text)}`;
      return { url, label: sendCaption(s, 'done') };
    },
  },
];
/* 2. База артефакта (admin.js добавляет sender 'db') */
export function addSender(s) { SENDERS.push(s); }

/* 3. Сервер воркера (worker/worker.py): заявка + текст + исходники макетов + картинки вещей.
   Включается адресом в settings.api. Ошибка сервера не ломает путь через Telegram. */
SENDERS.push({
  id: 'server',
  async run(order, text, data) {
    const api = orderApi(data.settings);
    if (!api) return null;
    const fd = new FormData();
    fd.append('order', JSON.stringify(order));
    fd.append('text', text);
    const seen = new Set();
    order.items.forEach((it, i) => {
      for (const p of it.prints) {
        const id = p.file?.id;
        if (id && !seen.has(id) && fileStore.has(id)) { seen.add(id); fd.append('file:' + id, fileStore.get(id), p.file.name); }
        if (p.mockup && fileStore.has(p.mockup)) fd.append('mockup:' + i, fileStore.get(p.mockup), `mockup-${i}.png`);
      }
    });
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 60000);
    try {
      const r = await fetch(api + '/api/orders', { method: 'POST', body: fd, signal: ctrl.signal });
      const j = await r.json().catch(() => ({}));
      return { sent: !!j.ok, files: j.files || 0 };
    } finally { clearTimeout(t); }
  },
});

export async function send(order, data) {
  const text = orderText(order, data);
  const result = { text, url: null, label: '', saved: false, sent: false };
  for (const s of SENDERS) {
    try {
      const r = await s.run(order, text, data);
      if (r?.url) { result.url = r.url; result.label = r.label; }
      if (r?.saved) result.saved = true;
      if (r?.sent) result.sent = true;
    } catch (e) { console.warn('order sender', s.id, e); }
  }
  return result;
}

export { esc };
