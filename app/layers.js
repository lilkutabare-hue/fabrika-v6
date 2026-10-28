/* layers.js — один стек слоёв: меню, корзина, карточка, админка.
   Верхний закрывается первым (Esc, затемнение, «назад» на телефоне). Фон под слоем inert, прокрутка заперта,
   фокус уходит внутрь и возвращается. История: каждый открытый слой — запись, popstate закрывает. */

const stack = [];
const scrim = document.querySelector('[data-scrim]');
const dock = document.querySelector('[data-dock]');
const bgNodes = () => [document.querySelector('main'), document.querySelector('.hdr'), dock].filter(Boolean);
const isTouch = () => matchMedia('(pointer: coarse)').matches;
let lockY = 0;
let touchX = 0;
let touchY = 0;
let gestureX = 0;

/* Жест можно отдать только прокрутке внутри слоя (или ползунку). Иначе на iPhone фон едет вместе со шторкой. */
function canTakeScroll(node, dx, dy) {
  for (let n = node instanceof Element ? node : null; n && n !== document.body; n = n.parentElement) {
    if (n.matches('input, textarea, select')) return true;
    const s = getComputedStyle(n);
    const vert = (s.overflowY === 'auto' || s.overflowY === 'scroll') && n.scrollHeight > n.clientHeight + 1;
    const hor = (s.overflowX === 'auto' || s.overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 1;
    if (vert && Math.abs(dy) >= Math.abs(dx)) {
      if (dy > 0 && n.scrollTop > 0) return true;
      if (dy < 0 && n.scrollTop + n.clientHeight < n.scrollHeight - 1) return true;
    }
    if (hor && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0 && n.scrollLeft > 0) return true;
      if (dx < 0 && n.scrollLeft + n.clientWidth < n.scrollWidth - 1) return true;
    }
  }
  return false;
}

function onLockStart(e) {
  const t = e.touches[0];
  if (!t) return;
  gestureX = touchX = t.clientX;
  touchY = t.clientY;
}

function onLockMove(e) {
  if (e.touches.length !== 1) return;
  const t = e.touches[0];
  const dx = t.clientX - touchX;
  const dy = t.clientY - touchY;
  touchX = t.clientX;
  touchY = t.clientY;
  if (gestureX < 24 && dx > 0 && Math.abs(dx) > Math.abs(dy)) return;
  const layer = e.target instanceof Element && e.target.closest('[data-layer]');
  if (layer && canTakeScroll(e.target, dx, dy)) return;
  if (e.cancelable) e.preventDefault();
}

function bindTouchLock(on) {
  if (on) {
    document.addEventListener('touchstart', onLockStart, { passive: true });
    document.addEventListener('touchmove', onLockMove, { passive: false });
  } else {
    document.removeEventListener('touchstart', onLockStart);
    document.removeEventListener('touchmove', onLockMove);
  }
}

function lock(on) {
  const html = document.documentElement;
  if (on) {
    if (html.classList.contains('lock') || html.classList.contains('lock-touch')) return;
    if (isTouch()) {
      lockY = window.scrollY;
      html.style.setProperty('--lock-y', `-${lockY}px`);
      html.classList.add('lock-touch');
      bindTouchLock(true);
    } else {
      html.style.setProperty('--sbw', (window.innerWidth - html.clientWidth) + 'px');
      html.classList.add('lock');
    }
  } else {
    bindTouchLock(false);
    if (html.classList.contains('lock-touch')) { html.classList.remove('lock-touch'); window.scrollTo(0, lockY); }
    html.classList.remove('lock');
    html.style.setProperty('--sbw', '0px');
  }
}

function applyInert() {
  const top = stack[stack.length - 1];
  for (const n of bgNodes()) { if (top) n.setAttribute('inert', ''); else n.removeAttribute('inert'); }
  for (const e of stack) { if (e === top) e.el.removeAttribute('inert'); else e.el.setAttribute('inert', ''); }
  scrim.classList.toggle('is-on', stack.length > 0);
  dock?.classList.toggle('is-hidden', stack.length > 0);
  lock(stack.length > 0);
}

function focusInto(el) {
  /* фокус уходит в сам слой: клавиатура дальше идёт по его кнопкам, рамки на заголовке нет */
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  requestAnimationFrame(() => el.focus({ preventScroll: true }));
}

export function isOpen(name) { return stack.some(e => e.name === name); }
export function topLayer() { return stack[stack.length - 1]?.name || null; }

/* open(name, el, { onClose, hash, push }) */
export function open(name, el, opts = {}) {
  if (isOpen(name)) { if (opts.hash) { try { history.replaceState({ depth: stack.length, layer: name }, '', opts.hash); } catch {} } return; }
  const entry = { name, el, onClose: opts.onClose, pushed: false, prevFocus: document.activeElement, resolvers: [] };
  stack.push(entry);
  try {
    if (opts.push !== false) {
      history.pushState({ depth: stack.length, layer: name }, '', opts.hash || location.pathname + location.search + location.hash);
      entry.pushed = true;
    } else if (opts.hash) {
      history.replaceState({ depth: stack.length, layer: name }, '', opts.hash);
    }
  } catch { /* песочница без истории адреса: слой работает без записи в историю */ }
  el.removeAttribute('inert');
  el.classList.add('is-open');
  el.setAttribute('aria-hidden', 'false');
  applyInert();
  focusInto(el);
}

/* закрыть напрямую, без истории */
function closeEntry(entry) {
  const i = stack.indexOf(entry);
  if (i < 0) return;
  stack.splice(i, 1);
  entry.el.classList.remove('is-open');
  entry.el.setAttribute('aria-hidden', 'true');
  entry.el.setAttribute('inert', '');
  entry.onClose?.();
  applyInert();
  entry.resolvers.forEach(r => r());
  const pf = entry.prevFocus;
  if (pf && pf.focus && document.contains(pf)) requestAnimationFrame(() => pf.focus({ preventScroll: true }));
}

/* Закрыть слой: если он в истории — через back (popstate закроет), иначе напрямую. Возвращает Promise «закрыт». */
export function close(name) {
  const entry = name ? stack.find(e => e.name === name) : stack[stack.length - 1];
  if (!entry) return Promise.resolve();
  const done = new Promise(r => entry.resolvers.push(r));
  if (entry === stack[stack.length - 1] && entry.pushed && history.state?.layer === entry.name) {
    history.back();
    return done;
  }
  closeEntry(entry);
  if (!stack.length && /^#[\w-]+\/[\w-]+$/.test(location.hash)) { try { history.replaceState({ depth: 0 }, '', location.pathname + location.search); } catch {} }
  return done;
}

export function closeAll() { while (stack.length) closeEntry(stack[stack.length - 1]); }

addEventListener('popstate', e => {
  const depth = e.state?.depth ?? 0;
  while (stack.length > depth) closeEntry(stack[stack.length - 1]);
});

addEventListener('keydown', e => {
  if (e.key === 'Escape' && stack.length) { e.preventDefault(); close(); }
});
scrim.addEventListener('click', () => close());

/* Элементы слоёв в начале заперты */
document.querySelectorAll('[data-layer]').forEach(el => { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); });
