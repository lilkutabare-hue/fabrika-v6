/* hop.js — на десктопе режет подпись кнопки и пункта шапки на буквы.
   Прыжок делает CSS (transform + задержка). Здесь нет цикла кадров. */
const FINE = '(hover: hover) and (pointer: fine)';
const CALM = '(prefers-reduced-motion: reduce)';
const TARGET = '.btn:not(.btn--ghost), .hdr a, .hdr button';
const SKIP = '.dock, .hdr__added, sup, .hop, .hop-run, [data-cart-count]';

function wrap(el) {
  if (!(el instanceof Element) || el.dataset.hop === 'on' || el.closest('.dock, .hdr__added')) return;
  const texts = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest(SKIP)) return NodeFilter.FILTER_REJECT;
      if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  while (walker.nextNode()) texts.push(walker.currentNode);
  if (!texts.length) return;
  if (el.dataset.hopLabel === '1' || !el.getAttribute('aria-label')) {
    const name = texts.map(node => node.textContent).join(' ').replace(/\s+/g, ' ').trim();
    if (name) {
      el.setAttribute('aria-label', name);
      el.dataset.hopLabel = '1';
    }
  }
  el.dataset.hop = 'on';
  let i = 0;
  for (const node of texts) {
    const run = document.createElement('span');
    run.className = 'hop-run';
    run.setAttribute('aria-hidden', 'true');
    for (const ch of node.textContent.trim()) {
      if (ch.trim() === '') { run.append(ch); continue; }
      const letter = document.createElement('span');
      letter.className = 'hop';
      letter.style.setProperty('--d', String(i++));
      letter.textContent = ch;
      run.append(letter);
    }
    node.replaceWith(run);
  }
}

function scan(node) {
  if (!(node instanceof Element)) return;
  if (node.matches(TARGET)) wrap(node);
  node.querySelectorAll(TARGET).forEach(wrap);
}

export function mountHop(root = document) {
  const fine = matchMedia(FINE);
  if (!fine.matches || matchMedia(CALM).matches) return;
  const scope = root instanceof Document ? root : root;
  scope.querySelectorAll(TARGET).forEach(wrap);
  const host = root instanceof Document ? root.body : root;
  if (!host) return;
  const obs = new MutationObserver(records => {
    for (const rec of records) {
      for (const node of rec.addedNodes) scan(node);
      const parent = rec.target instanceof Element ? rec.target : rec.target?.parentElement;
      const host = parent?.closest?.(TARGET);
      /* Кнопка могла заменить подпись целиком (textContent) — собрать буквы заново. */
      if (host?.dataset.hop === 'on' && !host.querySelector('.hop')) {
        delete host.dataset.hop;
        wrap(host);
      }
    }
  });
  obs.observe(host, { childList: true, subtree: true });
  fine.addEventListener('change', () => { if (!fine.matches) obs.disconnect(); });
}
