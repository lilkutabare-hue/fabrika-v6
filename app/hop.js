/* hop.js — волна букв только у «Свой принт» (.hdr__left).
   Как setupButtonAnimations у Wispr Flow, но через Web Animations API.
   Шаг буквы 1 с (gsap duration: 1) линейно делится на три кадра:
   y -20% / -5°, затем +20% / +5°, затем 0. Старт буквы — i * 0.06 с.
   Уход мыши возвращает все буквы в 0 за 0.2 с.
   На таче и при prefers-reduced-motion буквы не режем. */
const FINE = '(hover: hover) and (pointer: fine)';
const CALM = '(prefers-reduced-motion: reduce)';
const TARGET = '.hdr__left';
const SKIP = '.dock, .hdr__added, sup, .hop, .hop-run, [data-cart-count]';

const LETTER_MS = 1000;
const STAGGER_MS = 60;
const REST_MS = 200;
const WAVE = [
  { y: -20, r: -5 },
  { y: 20, r: 5 },
  { y: 0, r: 0 },
];

const motion = new WeakMap();
const bound = new WeakSet();

function tf(p) {
  return `translate(0%, ${p.y}%) rotate(${p.r}deg)`;
}

function lerp(a, b, u) {
  return { y: a.y + (b.y - a.y) * u, r: a.r + (b.r - a.r) * u };
}

function poseOf(letter) {
  const s = motion.get(letter);
  if (!s) return { y: 0, r: 0 };
  if (!s.anim) return s.pose;
  const time = Number(s.anim.currentTime ?? 0);
  if (time <= s.delay) return s.frames[0];
  const p = s.duration <= 0 ? 1 : Math.min(1, (time - s.delay) / s.duration);
  const frames = s.frames;
  let i = 1;
  while (i < frames.length - 1 && frames[i].at < p) i++;
  const b = frames[i];
  const a = frames[i - 1];
  const span = b.at - a.at || 1;
  const u = Math.min(1, Math.max(0, (p - a.at) / span));
  return lerp(a, b, u);
}

function play(letter, frames, duration, delay) {
  const prev = motion.get(letter);
  if (prev?.anim) {
    prev.anim.onfinish = null;
    prev.anim.cancel();
  }
  const anim = letter.animate(
    frames.map(f => ({ transform: tf(f), offset: f.at })),
    { duration, delay, easing: 'linear', fill: 'both' },
  );
  motion.set(letter, { anim, frames, duration, delay, pose: frames[0] });
  anim.onfinish = () => {
    if (motion.get(letter)?.anim !== anim) return;
    const end = frames[frames.length - 1];
    anim.cancel();
    letter.style.transform = '';
    motion.set(letter, { anim: null, pose: end });
  };
}

function wave(el) {
  el.querySelectorAll('.hop').forEach((letter, i) => {
    const from = poseOf(letter);
    const frames = [{ ...from, at: 0 }];
    WAVE.forEach((key, k) => frames.push({ ...key, at: (k + 1) / WAVE.length }));
    play(letter, frames, LETTER_MS, i * STAGGER_MS);
  });
}

function rest(el) {
  el.querySelectorAll('.hop').forEach(letter => {
    const from = poseOf(letter);
    play(letter, [{ ...from, at: 0 }, { y: 0, r: 0, at: 1 }], REST_MS, 0);
  });
}

function bind(el) {
  if (bound.has(el)) return;
  bound.add(el);
  el.addEventListener('mouseenter', () => { if (allowed()) wave(el); });
  el.addEventListener('mouseleave', () => { if (allowed()) rest(el); });
}

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
  const name = texts.map(node => node.textContent).join(' ').replace(/\s+/g, ' ').trim();
  if (name && (el.dataset.hopLabel === '1' || !el.getAttribute('aria-label'))) {
    el.setAttribute('aria-label', name);
    el.dataset.hopLabel = '1';
  }
  el.dataset.hop = 'on';
  for (const node of texts) {
    const run = document.createElement('span');
    run.className = 'hop-run';
    run.setAttribute('aria-hidden', 'true');
    for (const ch of node.textContent.trim()) {
      if (ch.trim() === '') { run.append(ch); continue; }
      const letter = document.createElement('span');
      letter.className = 'hop';
      letter.textContent = ch;
      run.append(letter);
    }
    node.replaceWith(run);
  }
  bind(el);
}

function unwrap(el) {
  if (!(el instanceof Element) || (el.dataset.hop !== 'on' && !el.querySelector('.hop-run'))) return;
  el.querySelectorAll('.hop').forEach(letter => {
    const s = motion.get(letter);
    if (s?.anim) {
      s.anim.onfinish = null;
      s.anim.cancel();
    }
    motion.delete(letter);
    letter.style.transform = '';
  });
  el.querySelectorAll('.hop-run').forEach(run => {
    run.replaceWith(document.createTextNode(run.textContent));
  });
  delete el.dataset.hop;
  if (el.dataset.hopLabel === '1') {
    el.removeAttribute('aria-label');
    delete el.dataset.hopLabel;
  }
}

function scan(node) {
  if (!allowed() || !(node instanceof Element)) return;
  if (node.matches(TARGET)) wrap(node);
  node.querySelectorAll(TARGET).forEach(wrap);
}

let fineQuery;
let calmQuery;
function allowed() {
  return fineQuery.matches && !calmQuery.matches;
}

export function mountHop(root = document) {
  fineQuery = matchMedia(FINE);
  calmQuery = matchMedia(CALM);
  const host = root instanceof Document ? root.body : root;
  const sync = () => {
    root.querySelectorAll(TARGET).forEach(el => (allowed() ? wrap(el) : unwrap(el)));
  };
  sync();
  if (!host) return;
  const obs = new MutationObserver(records => {
    if (!allowed()) return;
    for (const rec of records) {
      for (const node of rec.addedNodes) scan(node);
      const parent = rec.target instanceof Element ? rec.target : rec.target?.parentElement;
      const owner = parent?.closest?.(TARGET);
      if (owner?.dataset.hop === 'on' && !owner.querySelector('.hop')) {
        delete owner.dataset.hop;
        wrap(owner);
      }
    }
  });
  obs.observe(host, { childList: true, subtree: true });
  const onMedia = () => sync();
  fineQuery.addEventListener('change', onMedia);
  calmQuery.addEventListener('change', onMedia);
}
