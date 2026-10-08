/* ui.js — мелочи интерфейса: уведомление, копирование, выбор запроса. */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const reduced = matchMedia('(prefers-reduced-motion: reduce)');

let toastTimer = 0;
export function toast(msg, action) {
  const t = $('[data-toast]');
  if (!t) return;
  t.textContent = msg;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = action.label;
    b.addEventListener('click', () => { t.classList.remove('is-on'); action.run(); });
    t.appendChild(b);
  }
  t.classList.toggle('has-action', !!action);
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), action ? 4000 : 2200);
}

export function copy(text) {
  return (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
    .then(() => toast('Скопировано'), () => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Скопировано'); } catch { toast('Выделите текст и скопируйте'); }
      ta.remove();
    });
}

export const uid = () => Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[01OI]/g, c => ({ 0: 'Z', 1: 'Y', O: 'X', I: 'W' }[c]));
