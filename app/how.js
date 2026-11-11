/* how.js — «Как это шьётся»: одна футболка проходит цех от ткани до коробки.
   Одна общая шкала времени на все дорожки (Web Animations), поэтому этап можно открыть нажатием.
   Играет только на экране. При prefers-reduced-motion стоит кадром, этапы листаются нажатием. */
import { $, $$, reduced } from './ui.js';

const T = 16.6;                                   /* длина круга, секунды */
const CHAPTERS = [
  { at: 0,    still: 2.9,  name: 'Раскрой',   text: 'По своим лекалам — посадка одна и та же от первой штуки до тиража.' },
  { at: 3.2,  still: 6.45, name: 'Пошив',     text: 'Свои швеи и оборудование, без посредников.' },
  { at: 6.6,  still: 9.3,  name: 'Нанесение', text: 'DTF, плёнки и вышивка в том же цеху.' },
  { at: 9.6,  still: 11.8, name: 'Контроль',  text: 'Проверяем каждую вещь.' },
  { at: 12.4, still: 15.6, name: 'Упаковка',  text: 'Отдаём в шоуруме или отправляем.' },
];
const BIG = 'cubic-bezier(.5,0,0,1)', OUT = 'cubic-bezier(.2,.8,.2,1)', IN = 'cubic-bezier(.6,0,.9,.4)';

const SVG = `
<svg class="how__svg" viewBox="85 100 430 430" role="img" aria-label="Схема: ткань, раскрой, пошив, нанесение принта, контроль, упаковка">
  <g data-k="scene">
    <g data-k="fabric"><rect class="ln" x="110" y="140" width="380" height="330"/><path class="ln" d="M122 140v330"/></g>
    <g data-k="boxback"><path class="ln fl" d="M178 322l22-26h200l22 26z"/></g>
    <g data-k="tee">
      <g data-k="sl-l"><path class="ln fl pc" pathLength="1" d="M208 204l-58 46 26 36 32-24z"/><g data-st="157 249 179 280"></g></g>
      <g data-k="sl-r"><path class="ln fl pc" pathLength="1" d="M392 204l58 46-26 36-32-24z"/><g data-st="443 249 421 280"></g></g>
      <g data-k="body">
        <g data-k="low"><path class="ln fl pc" pathLength="1" d="M208 310V430H392V310"/><g data-st="214 420 386 420"></g></g>
        <g data-k="up">
          <path class="ln fl pc" pathLength="1" d="M208 310V204l62-16q30 26 60 0l62 16V310"/>
          <g data-st="214 210 214 262"></g><g data-st="386 210 386 262"></g>
          <path class="ln" data-k="fold" d="M208 310H392"/>
          <g data-st-neck></g>
          <text data-k="print" class="how__print" x="300" y="270" text-anchor="middle">FABRIKA</text>
        </g>
      </g>
    </g>
    <g data-k="needle"><g class="how__bob"><path class="ln" d="M214 372v38"/><path class="ln s" d="M214 410v8"/></g></g>
    <g data-k="press"><path class="ln" d="M300 -260V218"/><rect class="ln fl" x="222" y="218" width="156" height="78"/><path class="ln" d="M240 218v-14h120v14"/></g>
    <g data-k="dims">
      <path class="ln th" data-k="dim-h" pathLength="1" d="M208 452H392M208 445v14M392 445v14"/>
      <path class="ln th" data-k="dim-v" pathLength="1" d="M476 188V430M469 188h14M469 430h14"/>
      <circle class="ln s" data-k="ok-o" pathLength="1" cx="456" cy="150" r="17" transform="rotate(-90 456 150)"/>
      <path class="ln s" data-k="ok" pathLength="1" d="M448 150l6 6 11-12"/>
    </g>
    <g data-k="box">
      <rect class="ln fl" data-k="boxfront" pathLength="1" x="178" y="322" width="244" height="134"/>
      <path class="ln s" data-k="tape" pathLength="1" d="M300 322v34"/>
      <path class="ln th" data-k="label" pathLength="1" d="M352 404h48v30h-48zM360 414h32M360 423h20"/>
    </g>
  </g>
</svg>`;

let anims = [], playing = false, raf = 0, current = -1, root = null, list = null, desc = null;

function track(el, prop, frames) {
  if (!el) return;
  const kf = frames.map(([t, v, e]) => ({ offset: Math.min(1, t / T), [prop]: v, ...(e ? { easing: e } : {}) }));
  if (kf[0].offset > 0) kf.unshift({ offset: 0, [prop]: frames[0][1] });
  if (kf[kf.length - 1].offset < 1) kf.push({ offset: 1, [prop]: frames[frames.length - 1][1] });
  const a = el.animate(kf, { duration: T * 1000, iterations: Infinity, fill: 'both' });
  a.pause();
  anims.push(a);
}

/* Строчка: стежки проступают один за другим, как из-под иглы. */
function stitch(g, pts, t0, t1) {
  const NS = 'http://www.w3.org/2000/svg';
  const n = pts.length - 1;
  for (let i = 0; i < n; i += 2) {
    const l = document.createElementNS(NS, 'path');
    l.setAttribute('class', 'ln s');
    l.setAttribute('d', `M${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}L${pts[i + 1][0].toFixed(1)} ${pts[i + 1][1].toFixed(1)}`);
    g.appendChild(l);
    const t = t0 + (t1 - t0) * (i / n);
    track(l, 'opacity', [[0, 0], [t, 0], [t + .04, 1], [T - .01, 1]]);
  }
}
const lineDashes = (x1, y1, x2, y2, step = 5) => {
  const len = Math.hypot(x2 - x1, y2 - y1), n = Math.max(2, Math.round(len / step) | 1);
  return Array.from({ length: n + 1 }, (_, i) => [x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n]);
};
const quadDashes = (p0, c, p1, n = 17) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
});

function build(stage) {
  stage.innerHTML = SVG;
  const k = name => $(`[data-k="${name}"]`, stage);
  const draw = (el, t0, t1, hideAt) => track(el, 'strokeDashoffset', [[0, 1], [t0, 1, OUT], [t1, 0], ...(hideAt ? [[hideAt, 0], [hideAt + .01, 1]] : [])]);

  /* сцена целиком: в конце круга коробка уезжает вправо */
  track(k('scene'), 'transform', [[0, 'translateX(0px)'], [15.9, 'translateX(0px)', IN], [T, 'translateX(520px)']]);
  track(k('scene'), 'opacity', [[0, 1], [16.2, 1], [T, 0]]);

  /* 1. Раскрой: полотно разворачивается, детали прочерчиваются по лекалам */
  track(k('fabric'), 'transform', [[0, 'scaleX(.02)', OUT], [.7, 'scaleX(1)']]);
  track(k('fabric'), 'opacity', [[0, 0], [.15, 1], [3.2, 1], [3.7, 0]]);
  const pcs = $$('.pc', stage);
  draw(pcs[3], .7, 1.9); draw(pcs[2], .7, 1.9);          /* стан: верх и низ из одной точки */
  draw(pcs[0], 1.5, 2.4); draw(pcs[1], 1.8, 2.7);        /* рукава */

  /* 2. Пошив: детали сходятся, по швам идёт нить */
  const SL = (x, y, r, s) => `translate(${x}px,${y}px) rotate(${r}deg) scaleX(${s})`;
  track(k('sl-l'), 'transform', [[0, SL(222, -22, -24, 1)], [3.3, SL(222, -22, -24, 1), BIG], [4.2, SL(0, 0, 0, 1)], [12.5, SL(0, 0, 0, 1), BIG], [13, SL(0, 0, 0, .02)]]);
  track(k('sl-r'), 'transform', [[0, SL(-14, 128, 24, 1)], [3.4, SL(-14, 128, 24, 1), BIG], [4.3, SL(0, 0, 0, 1)], [12.5, SL(0, 0, 0, 1), BIG], [13, SL(0, 0, 0, .02)]]);
  track(k('body'), 'transform', [[0, 'translateX(-58px)'], [3.3, 'translateX(-58px)', BIG], [4.2, 'translateX(0px)']]);
  $$('[data-st]', stage).forEach((g, i) => {
    const [x1, y1, x2, y2] = g.dataset.st.split(' ').map(Number);
    const win = [[5.0, 5.3], [5.05, 5.35], [5.25, 6.25], [4.3, 4.75], [4.35, 4.8]][i];
    stitch(g, lineDashes(x1, y1, x2, y2), win[0], win[1]);
  });
  stitch($('[data-st-neck]', stage), quadDashes([264, 191], [300, 229], [336, 191]), 4.65, 5.1);
  track(k('needle'), 'transform', [[0, 'translateX(0px)'], [5.25, 'translateX(0px)'], [6.25, 'translateX(172px)']]);
  track(k('needle'), 'opacity', [[0, 0], [5.1, 0], [5.25, 1], [6.25, 1], [6.5, 0]]);

  /* 3. Нанесение: пресс опускается, под ним остаётся принт */
  track(k('press'), 'transform', [[0, 'translateY(-340px)'], [6.8, 'translateY(-340px)', BIG], [7.45, 'translateY(0px)'], [8.3, 'translateY(0px)', BIG], [8.95, 'translateY(-340px)']]);
  track(k('print'), 'opacity', [[0, 0], [7.5, 0], [7.6, 1], [T - .01, 1]]);
  track(k('tee'), 'transform', [
    [0, 'translateY(0px) scale(1,1)'], [7.4, 'translateY(0px) scale(1,1)'], [7.55, 'translateY(0px) scale(1,.985)'], [8.3, 'translateY(0px) scale(1,.985)'], [8.5, 'translateY(0px) scale(1,1)'],
    [14.0, 'translateY(0px) scale(1,1)', BIG], [14.6, 'translateY(140px) scale(1,1)'],
  ]);

  /* 4. Контроль: мерки и отметка */
  draw(k('dim-h'), 9.8, 10.4); draw(k('dim-v'), 10.1, 10.7);
  draw(k('ok-o'), 10.8, 11.25); draw(k('ok'), 11.15, 11.5);
  track(k('dims'), 'opacity', [[0, 0], [9.75, 0], [9.8, 1], [12.0, 1], [12.4, 0]]);

  /* 5. Упаковка: рукава и низ подгибаются, вещь уходит в коробку, скотч */
  track(k('low'), 'transform', [[0, 'scaleY(1)'], [12.9, 'scaleY(1)', BIG], [13.4, 'scaleY(.02)']]);
  track(k('fold'), 'opacity', [[0, 0], [13.3, 0], [13.4, 1], [T - .01, 1]]);
  track(k('low'), 'opacity', [[0, 1], [13.3, 1], [13.4, 0], [T - .01, 0]]);
  track(k('sl-l'), 'opacity', [[0, 1], [12.9, 1], [13, 0], [T - .01, 0]]);
  track(k('sl-r'), 'opacity', [[0, 1], [12.9, 1], [13, 0], [T - .01, 0]]);
  track(k('boxback'), 'opacity', [[0, 0], [13.4, 0], [13.8, 1], [T, 1]]);
  track(k('boxback'), 'transform', [[0, 'scaleY(1)'], [14.7, 'scaleY(1)', BIG], [15.0, 'scaleY(.02)']]);
  track(k('box'), 'opacity', [[0, 0], [13.4, 0], [13.45, 1], [T, 1]]);
  draw(k('boxfront'), 13.4, 14.0);
  track(k('boxfront'), 'fillOpacity', [[0, 0], [13.9, 0], [14.0, 1], [T, 1]]);
  draw(k('tape'), 15.0, 15.3); draw(k('label'), 15.2, 15.7);
}

function setChapter(i) {
  if (i === current) return;
  current = i;
  $$('button', list).forEach((b, n) => b.setAttribute('aria-selected', n === i));
  desc.textContent = CHAPTERS[i].text;
  desc.classList.remove('is-in'); void desc.offsetWidth; desc.classList.add('is-in');
}
const chapterAt = t => { let i = 0; CHAPTERS.forEach((c, n) => { if (t >= c.at) i = n; }); return i; };
const now = () => ((anims[0]?.currentTime || 0) / 1000) % T;
function seek(t) { anims.forEach(a => { a.currentTime = t * 1000; }); setChapter(chapterAt(t)); }
function tick() { setChapter(chapterAt(now())); raf = playing ? requestAnimationFrame(tick) : 0; }
function play(on) {
  if (reduced.matches) on = false;
  if (on === playing) return;
  playing = on;
  root.classList.toggle('is-live', on);
  anims.forEach(a => (on ? a.play() : a.pause()));
  if (on && !raf) raf = requestAnimationFrame(tick);
}

export function init() {
  root = $('[data-how]');
  if (!root) return;
  list = $('[data-how-list]', root);
  desc = $('[data-how-desc]', root);
  list.innerHTML = CHAPTERS.map((c, i) => `<button type="button" role="tab" data-ch="${i}" aria-selected="false">${c.name}</button>`).join('');
  build($('[data-how-stage]', root));
  seek(reduced.matches ? CHAPTERS[2].still : 0);
  list.addEventListener('click', e => {
    const b = e.target.closest('[data-ch]');
    if (!b) return;
    const c = CHAPTERS[+b.dataset.ch];
    seek(reduced.matches ? c.still : c.at + .02);
  });
  let seen = false;
  new IntersectionObserver(es => { seen = es[0].isIntersecting; play(seen && !document.hidden); }, { threshold: .25 }).observe(root);
  document.addEventListener('visibilitychange', () => play(seen && !document.hidden));
  reduced.addEventListener?.('change', () => { play(seen); if (reduced.matches) seek(CHAPTERS[Math.max(0, current)].still); });
}

/* для снимков и проверки: поставить кадр по времени */
export const debug = { seek: t => { play(false); seek(t); }, T, CHAPTERS };
