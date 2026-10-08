/* garment.js — сцена вещи: реальный рендер, если он есть у товара в этом цвете, иначе эскиз.
   mountGarment(el, product, data, opts) → view с setColor / setSide / setAnim / flip.
   Цвет меняется в том же узле (баг 16): у рендеров — проявление второго слоя, у эскизов — перекраска путей. */

/* ---------- эскизы (контуры v5) ---------- */
const SH = {
  tee: 'M150 38Q200 64 250 38L318 58Q331 62 337 74L384 150L336 180L313 152L314 440L86 440L87 152L64 180L16 150L63 74Q69 62 82 58Z',
  long: 'M150 38Q200 64 250 38L318 58Q331 62 335 76L378 380L334 390L312 172L314 440L86 440L88 172L66 390L22 380L65 76Q69 62 82 58Z',
  sweat: 'M152 42Q200 68 248 42L318 60Q331 64 335 78L378 382L334 392L312 176L314 438L86 438L88 176L66 392L22 382L65 78Q69 64 82 60Z',
  hood: 'M142 72L86 88Q72 92 68 106L24 382L68 392L96 198L96 440L304 440L304 198L332 392L376 382L332 106Q328 92 314 88L258 72Z',
  top: 'M150 40L176 40Q200 92 224 40L250 40L262 112Q302 150 302 250L302 420L98 420L98 250Q98 150 138 112Z',
  pants: 'M110 34L290 34L312 452L222 452L200 158L178 452L88 452Z',
  shorts: 'M98 96L302 96L328 332L216 346L200 196L184 346L72 332Z',
};
export const BASE_TYPE = { tee: 'tee', long: 'long', sweat: 'sweat', hood: 'hood', zhood: 'hood', olymp: 'sweat', top: 'top', pants: 'pants', shorts: 'shorts' };
let uid = 0;

/* Владелец (07.10): анимированные рендеры (WebP-«гифки») на сайте пока не показываем. Файлы собраны, включается одним флагом. */
export const ANIM_RENDERS = false;

const hexToRgb = c => (c || '#cccccc').replace('#', '').match(/../g).map(x => parseInt(x, 16));
export const isDark = c => { const [r, g, b] = hexToRgb(c); return (r * 299 + g * 587 + b * 114) / 1000 < 120; };
const shade = (c, a) => '#' + hexToRgb(c).map(v => Math.max(0, Math.min(255, v + a)).toString(16).padStart(2, '0')).join('');

function details(type, side, st, sd) {
  const b = BASE_TYPE[type], back = side === 'back';
  const L = d => `<path d="${d}" fill="none" stroke="${st}" stroke-width="1" stroke-linecap="round"/>`;
  const D = d => `<path d="${d}" fill="none" stroke="${sd}" data-sd stroke-width=".8" stroke-dasharray="3 3"/>`;
  let o = '';
  if (b === 'tee' || b === 'long' || b === 'sweat') {
    if (type !== 'olymp') o += back ? L('M150 38Q200 52 250 38') : L('M156 41Q200 84 244 41') + D('M160 48Q200 88 240 48');
    o += L('M82 60Q92 110 87 152') + L('M318 60Q308 110 313 152');
  }
  if (b === 'tee') o += D('M24 142L66 168') + D('M376 142L334 168') + D('M88 428L312 428');
  if (b === 'long') o += L('M28 356L70 366') + L('M372 356L330 366') + D('M88 428L312 428');
  if (b === 'sweat') o += L('M30 360L70 370') + L('M370 360L330 370') + D('M34 370L68 378') + D('M366 370L332 378') + L('M88 410L312 410') + D('M88 418L312 418');
  if (b === 'hood') {
    o += L('M86 90Q98 140 96 198') + L('M314 90Q302 140 304 198') + L('M30 358L70 368') + L('M370 358L330 368') + L('M96 412L304 412') + D('M96 420L304 420');
    if (!back && type === 'hood') o += L('M132 300L268 300L290 386L110 386Z') + L('M132 300L112 386') + L('M268 300L288 386') + L('M180 92L176 158') + L('M220 92L224 158') + `<rect x="172" y="158" width="8" height="12" rx="2" fill="${st}"/><rect x="220" y="158" width="8" height="12" rx="2" fill="${st}"/>`;
    if (!back && type === 'zhood') o += L('M118 318L136 384') + L('M282 318L264 384');
  }
  if (type === 'olymp' && !back) o += L('M150 40L152 18L248 18L250 40') + L('M152 30L248 30');
  if (b === 'pants') o += L('M110 62L290 62') + D('M110 56L290 56') + L('M116 72Q146 104 122 150') + L('M284 72Q254 104 278 150') + L('M200 62L200 158') + L('M92 424L178 424') + L('M222 424L308 424') + (back ? '' : L('M190 62L186 100') + L('M210 62L214 100'));
  if (b === 'shorts') o += L('M98 122L302 122') + D('M98 116L302 116') + D('M78 318L184 332') + D('M216 332L322 318') + (back ? '' : L('M190 122L186 156') + L('M210 122L214 156'));
  if (b === 'top') o += D('M176 46Q200 86 224 46') + D('M142 116Q108 150 104 240') + D('M258 116Q292 150 296 240') + D('M98 408L302 408');
  return o;
}

/* Эскиз вещи. Молния закрыта, бегунок наверху (план §7.5); расстёгивание — классом .is-unzipped на .gm */
export function sketchSVG(type, color, o = {}) {
  const b = BASE_TYPE[type] || 'tee', d = SH[b], dark = isDark(color);
  const st = 'rgba(11,11,11,.8)', sd = dark ? 'rgba(255,255,255,.45)' : 'rgba(11,11,11,.3)';
  const back = o.side === 'back', zip = (type === 'zhood' || type === 'olymp') && !back;
  const outline = `<path d="${d}" fill="none" stroke="${st}" stroke-width="1.2" stroke-linejoin="round"/>`;
  const hood = b === 'hood'
    ? `<path d="M142 76C126 10 274 10 258 76C240 100 160 100 142 76Z" fill="${color}" data-fill="body"/><path d="M142 76C126 10 274 10 258 76C240 100 160 100 142 76Z" fill="none" stroke="${st}" stroke-width="1.8"/>`
      + (back ? `<path d="M200 22V92" fill="none" stroke="${st}" stroke-width="1.4"/>` : `<path d="M164 72C162 40 238 40 236 72C222 86 178 86 164 72Z" fill="${shade(color, -38)}" data-fill="shade" stroke="${st}" stroke-width="1.4"/>`)
    : '';
  const det = details(type, o.side, st, sd);
  const label = o.label ? `<title>${o.label}</title>` : '';
  if (zip) {
    const id = uid++;
    const half = s => `<g class="${s}"><clipPath id="c${s}${id}"><rect x="${s === 'zl' ? -20 : 200}" y="0" width="220" height="480"/></clipPath>
      <g clip-path="url(#c${s}${id})"><path d="${d}" fill="${color}" data-fill="body"/>${outline}${det}</g>
      <path d="M${s === 'zl' ? 198 : 202} 84L${s === 'zl' ? 198 : 202} 440" stroke="${st}" stroke-width="1.6"/><path d="M${s === 'zl' ? 195 : 205} 88L${s === 'zl' ? 195 : 205} 436" stroke="${sd}" data-sd stroke-width="3" stroke-dasharray="1.5 2"/></g>`;
    return `<svg viewBox="0 0 400 480" role="img" aria-label="${o.label || ''}">${label}<g class="body"><path d="M200 86L140 440L260 440Z" fill="${shade(color, -40)}" data-fill="shade"/>${half('zl')}${half('zr')}${hood}<rect class="pull" x="195" y="84" width="10" height="18" rx="2" fill="#fff" stroke="${st}" stroke-width="1.4"/></g></svg>`;
  }
  return `<svg viewBox="0 0 400 480" role="img" aria-label="${o.label || ''}">${label}<g class="body"><path d="${d}" fill="${color}" data-fill="body"/>${outline}${det}${hood}</g></svg>`;
}

/* ---------- рендеры ---------- */
export function mediaFor(product, color, side = 'front', variant = 'set') {
  const m = product.media;
  if (!m) return null;
  const sides = m[color] || m['*'];
  const v = sides?.[side];
  if (!v) return null;
  return v[variant] || v[variant === 'set' ? 'fit' : 'set'] || null;
}
export function animFor(product, color, side = 'front') {
  return product.media?.[color]?.[side]?.anim || null;
}
export function hasSide(product, color, side) {
  if (!product.media) return true;              /* эскиз есть с обеих сторон */
  return !!(product.media[color] || product.media['*'])?.[side];
}

function imgSrc(v, mediaBase, { sizes = '100vw' } = {}) {
  if (v.url) return { src: v.url, srcset: '', sizes: '' };
  const srcset = v.widths.map(w => `${mediaBase}${v.src}-${w}.webp ${w}w`).join(', ');
  return { src: `${mediaBase}${v.src}-${v.widths[v.widths.length - 1]}.webp`, srcset, sizes };
}

/* Разметка сцены одним куском (для серверного рендера списков) */
export function garmentHTML(product, color, data, o = {}) {
  const v = mediaFor(product, color, o.side, o.variant);
  const name = data.palette[color]?.name || '';
  const alt = `${product.name}${name ? ', ' + name.toLowerCase() : ''}`;
  if (v) {
    const s = imgSrc(v, data.mediaBase, o);
    return `<div class="gm" data-kind="render"><img class="gm__img is-on" src="${s.src}" ${s.srcset ? `srcset="${s.srcset}" sizes="${s.sizes}"` : ''} width="${v.w || ''}" height="${v.h || ''}" alt="${alt}" decoding="async" ${o.eager ? 'fetchpriority="high"' : 'loading="lazy"'}></div>`;
  }
  const hexColor = data.palette[color]?.hex || '#CCCCCC';
  return `<div class="gm" data-kind="sketch" style="--sway-delay:${(Math.random() * -7).toFixed(2)}s">${sketchSVG(product.type, hexColor, { side: o.side, label: alt }).replace('<svg ', '<svg class="is-on" ')}</div>`;
}

/* Живая сцена: смена цвета, стороны, анимированный кадр, переворот */
export function mountGarment(el, product, data, o = {}) {
  let color = o.color, side = o.side || 'front', variant = o.variant || 'set', anim = false;
  el.classList.add('gm');
  el.style.setProperty('--sway-delay', (Math.random() * -7).toFixed(2) + 's');
  const layers = [];   /* <img> слои для рендеров */
  let svg = null;

  const alt = c => `${product.name}${data.palette[c]?.name ? ', ' + data.palette[c].name.toLowerCase() : ''}`;

  function show(fade = true) {
    const v = mediaFor(product, color, side, variant);
    const a = anim && animFor(product, color, side);
    if (v) {
      el.dataset.kind = 'render';
      if (svg) { svg.remove(); svg = null; }
      const s = imgSrc(v, data.mediaBase, o);
      let img = layers.find(i => i.dataset.key === s.src);
      if (!img) {
        img = document.createElement('img');
        img.className = 'gm__img';
        img.dataset.key = s.src;
        img.alt = alt(color);
        img.decoding = 'async';
        if (o.eager) img.fetchPriority = 'high'; else img.loading = 'lazy';
        if (s.srcset) { img.srcset = s.srcset; img.sizes = s.sizes; }
        img.src = s.src;
        if (v.w) { img.width = v.w; img.height = v.h; }
        el.appendChild(img);
        layers.push(img);
      }
      const on = () => {
        layers.forEach(i => i.classList.toggle('is-on', i === img));
        if (!fade) layers.forEach(i => { i.style.transition = 'none'; requestAnimationFrame(() => i.style.transition = ''); });
      };
      if (img.complete && img.naturalWidth) on(); else img.addEventListener('load', on, { once: true });
      /* слой анимации поверх */
      let animImg = el.querySelector('.gm__img--anim');
      if (a) {
        const src = `${data.mediaBase}${a.src}-${a.widths[0]}.webp`;
        if (!animImg) { animImg = document.createElement('img'); animImg.className = 'gm__img gm__img--anim'; animImg.alt = ''; animImg.decoding = 'async'; el.appendChild(animImg); }
        if (animImg.dataset.key !== src) { animImg.dataset.key = src; animImg.classList.remove('is-on'); animImg.src = src; animImg.onload = () => { if (anim) animImg.classList.add('is-on'); }; }
        else if (animImg.complete) animImg.classList.add('is-on');
      } else if (animImg) animImg.classList.remove('is-on');
      /* слои прошлых цветов не копим: оставляем текущий и один предыдущий */
      while (layers.length > 3) { const old = layers.shift(); if (old !== img) old.remove(); else layers.push(old); }
    } else {
      el.dataset.kind = 'sketch';
      layers.forEach(i => i.classList.remove('is-on'));
      const hex = data.palette[color]?.hex || data.palette[color]?.hex === null && product.swatch?.[color] || '#CCCCCC';
      if (!svg || svg.dataset.side !== side) {
        if (svg) svg.remove();
        el.insertAdjacentHTML('beforeend', sketchSVG(product.type, hex, { side, label: alt(color) }));
        svg = el.lastElementChild; svg.dataset.side = side;
        requestAnimationFrame(() => svg.classList.add('is-on'));
      } else {
        svg.querySelectorAll('[data-fill="body"]').forEach(p => p.setAttribute('fill', hex));
        svg.querySelectorAll('[data-fill="shade"]').forEach(p => p.setAttribute('fill', shade(hex, -38)));
        const sd = isDark(hex) ? 'rgba(255,255,255,.55)' : 'rgba(11,11,11,.42)';
        svg.querySelectorAll('[data-sd]').forEach(p => p.setAttribute('stroke', sd));
      }
    }
  }

  const view = {
    el,
    get color() { return color; },
    get side() { return side; },
    setColor(c, fade = true) { if (c === color) return; color = c; show(fade); },
    setSide(s) { if (s === side) return; side = s; show(false); },
    setAnim(on) { const next = ANIM_RENDERS && !!on; if (next === anim) return; anim = next; show(false); },
    flip(s) {
      if (s === side) return Promise.resolve();
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) { view.setSide(s); return Promise.resolve(); }
      el.classList.add('is-flipping');
      return new Promise(r => setTimeout(() => { view.setSide(s); el.classList.remove('is-flipping'); setTimeout(r, 200); }, 200));
    },
    currentImg() { return layers.find(i => i.classList.contains('is-on')) || svg; },
  };
  show(false);
  return view;
}
