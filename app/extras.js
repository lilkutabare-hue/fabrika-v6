/* extras.js — два блока главной, которые появляются, когда для них есть данные.
   Работы для клиентов: data/cases.json — список { title, text, photo, url }. Пустой список — блока нет.
   Отзывы с Яндекс Карт: settings.yandexOrg — номер организации из ссылки на её карточку
   (yandex.ru/maps/org/название/НОМЕР/). Виджет отзывов — официальный, Яндекс рисует его сам. */
import { esc } from './data.js';
import { $ } from './ui.js';

async function cases() {
  const root = $('[data-cases]');
  if (!root) return;
  let list = [];
  try { list = await (await fetch('data/cases.json', { cache: 'no-cache' })).json(); } catch { return; }
  list = (Array.isArray(list) ? list : []).filter(c => c && c.title && c.photo);
  if (!list.length) return;
  $('[data-cases-grid]', root).innerHTML = list.map(c => {
    const tag = c.url ? 'a' : 'div';
    return `<${tag} class="case"${c.url ? ` href="${esc(c.url)}" target="_blank" rel="noopener"` : ''}>
      <span class="case__ph"><img src="${esc(c.photo)}" alt="${esc(c.title)}" loading="lazy" decoding="async"></span>
      <b>${esc(c.title)}</b>${c.text ? `<span class="t-mute">${esc(c.text)}</span>` : ''}
    </${tag}>`;
  }).join('');
  root.hidden = false;
}

function reviews(data) {
  const root = $('[data-reviews]');
  const org = String(data.settings?.yandexOrg || '').replace(/\D/g, '');
  if (!root || !org) return;
  $('[data-reviews-link]', root).href = `https://yandex.ru/maps/org/${org}/reviews/`;
  const box = $('[data-reviews-box]', root);
  /* виджет подключаем, когда блок рядом с экраном */
  new IntersectionObserver((es, io) => {
    if (!es[0].isIntersecting) return;
    io.disconnect();
    box.innerHTML = `<iframe src="https://yandex.ru/maps-reviews-widget/${org}?comments" title="Отзывы на Яндекс Картах" loading="lazy"></iframe>`;
  }, { rootMargin: '600px 0px' }).observe(root);
  root.hidden = false;
}

export function init(data) { cases(); reviews(data); }
