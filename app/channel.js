/* channel.js — канал в Telegram на главной.
   Лента лежит у нас: data/channel.json и media/channel/ собирает tools/fetch_channel.py (по расписанию — .github/workflows/channel.yml),
   поэтому блок не зависит от того, открывается ли Telegram у посетителя, и выглядит как сайт, а не как чужой виджет.
   Постов нет — вместо ленты приглашение подписаться. Файла нет — блок не показывается. */
import { esc } from './data.js';
import { $ } from './ui.js';

const SHOW = 4;
const day = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }); };

function card(p) {
  return `<a class="post${p.photo ? '' : ' post--text'}" href="${esc(p.url)}" target="_blank" rel="noopener">
    ${p.photo ? `<span class="post__ph"><img src="${esc(p.photo)}" alt="" loading="lazy" decoding="async"></span>` : ''}
    <time datetime="${esc(p.date)}">${esc(day(p.date))}</time>
    ${p.text ? `<span class="post__text">${esc(p.text)}</span>` : ''}
  </a>`;
}

export async function init() {
  const root = $('[data-channel]');
  if (!root) return;
  let feed;
  try { feed = await (await fetch('data/channel.json', { cache: 'no-cache' })).json(); } catch { return; }
  if (!feed?.url) return;
  const posts = (feed.posts || []).slice(0, SHOW);
  const link = $('[data-chan-link]', root);
  link.href = feed.url; link.textContent = '@' + feed.channel;
  const empty = $('[data-chan-empty]', root), list = $('[data-chan-feed]', root);
  if (posts.length) {
    list.innerHTML = posts.map(card).join('');
    list.hidden = false; empty.hidden = true;
  } else {
    $('[data-chan-about]', root).textContent = feed.about || feed.title || '';
    $('[data-chan-btn]', root).href = feed.url;
    list.hidden = true; empty.hidden = false;
  }
  root.classList.toggle('is-empty', !posts.length);
  root.hidden = false;
}
