/* stage.js — макет на вещи. Состояние одно на весь сайт («примерить на другой вещи», «+ ещё вещь»).
   Сцена: поле печати — вся вещь, слой обрезан маской по силуэту, поверх — тени ткани, складки через
   карту смещения из самого рендера. Руки: тянуть, щипок, поворот двумя пальцами, ручки размера и поворота,
   колесо/щипок приближает вещь, стрелки двигают, отмена/повтор, «сравнить с чистым». */
import { analyze, runChecks, dpiFor } from './preflight.js';
import { preset, defaultPlace, presetsFor, garmentMm } from './zones.js';
import { artHTML, artClass, methodById, defaultFilm } from './methods.js';
import { fileStore } from '../order.js';
import { isDark } from '../garment.js';
import { reduced } from '../ui.js';

export const SCALE_MIN = .05, SCALE_MAX = .9;

/* ---------- состояние ---------- */
export const state = {
  art: null,          /* результат analyze() */
  method: 'dtf',
  film: null,
  side: 'front',
  place: 'center',    /* пресет; после сдвига рукой — 'custom' */
  cx: .5, cy: .42,    /* центр макета, доли вещи */
  scale: .34,         /* ширина макета от ширины вещи */
  rot: 0,             /* градусы */
  flip: false,
  folds: true,        /* складки ткани на макете */
  checks: [],
};
const subs = new Set();
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
const emit = () => { for (const fn of subs) fn(state); };

/* ---------- история ---------- */
const KEYS = ['cx', 'cy', 'scale', 'rot', 'flip', 'place', 'method', 'side'];
const hist = []; let hi = -1;
const snap = () => Object.fromEntries(KEYS.map(k => [k, state[k]]));
const same = (a, b) => KEYS.every(k => a[k] === b[k]);
export function commit() {
  const s = snap();
  if (hi >= 0 && same(hist[hi], s)) return;
  hist.splice(hi + 1); hist.push(s); if (hist.length > 60) hist.shift();
  hi = hist.length - 1;
  emit();
}
export const canUndo = () => hi > 0, canRedo = () => hi < hist.length - 1;
export function undo() { if (!canUndo()) return; hi--; Object.assign(state, hist[hi]); emit(); }
export function redo() { if (!canRedo()) return; hi++; Object.assign(state, hist[hi]); emit(); }

/* ---------- файл ---------- */
export async function setFile(file) {
  if (!file) return;
  if (state.art?.url) URL.revokeObjectURL(state.art.url);
  const art = await analyze(file);
  fileStore.set(art.id, file);
  state.art = art;
  state.fresh = true;
  commit();
  return art;
}
export function clearArt() {
  if (state.art?.url) URL.revokeObjectURL(state.art.url);
  if (state.art) fileStore.delete(state.art.id);
  state.art = null; state.checks = []; emit();
}
export function set(patch, { history = true } = {}) { Object.assign(state, patch); if (history) commit(); else emit(); }

/* Пресет: центр и размер прыгают, дальше человек двигает как хочет */
export function applyPlace(product, k) {
  const p = preset(product, state.side, k);
  state.place = p.k; state.cx = p.cx; state.cy = p.cy; state.scale = p.w; state.rot = 0;
  commit();
}
export function ensurePlace(product) {
  const list = presetsFor(product, state.side);
  if (state.place !== 'custom' && !list.some(p => p.k === state.place)) {
    const p = preset(product, state.side, defaultPlace(product, state.side));
    state.place = p.k; state.cx = p.cx; state.cy = p.cy; state.scale = p.w;
  }
}

/* Описание принта для корзины/заявки */
export function printSpec(product, data, fabricHex, size) {
  const m = methodById(data, state.method);
  const W = garmentMm(product, size);
  const width_mm = W ? Math.round(W * state.scale) : null;
  const art = state.art;
  const height_mm = width_mm && art?.px ? Math.round(width_mm * art.px[1] / art.px[0]) : null;
  const checks = runChecks(art, m, width_mm);
  return {
    method: m.id,
    film: m.group === 'film' ? (state.film || defaultFilm(m, isDark(fabricHex))) : null,
    side: state.side, place: state.place,
    width_mm, height_mm,
    offset_mm: W ? { x: Math.round((state.cx - .5) * W), y: Math.round((state.cy - .5) * W * 1.1) } : null,
    center: { x: +state.cx.toFixed(3), y: +state.cy.toFixed(3) },
    scale_pct: Math.round(state.scale * 100),
    rotate_deg: Math.round(state.rot), mirrored: !!state.flip,
    file: art ? { id: art.id, name: art.name, type: art.type, px: art.px, hasAlpha: art.hasAlpha, dpi: dpiFor(art, width_mm) } : null,
    checks,
    priceFrom: m.priceFrom || 0,
  };
}

/* ---------- карта складок из рендера ---------- */
const foldCache = new Map();
function foldMap(src) {
  if (foldCache.has(src)) return foldCache.get(src);
  const p = new Promise(res => {
    const img = new Image();
    img.onload = () => {
      try {
        const W = 480, H = Math.round(W * img.naturalHeight / img.naturalWidth);
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.filter = 'grayscale(1) blur(1.5px)'; ctx.drawImage(img, 0, 0, W, H);
        const fine = ctx.getImageData(0, 0, W, H).data;
        ctx.clearRect(0, 0, W, H);
        ctx.filter = 'grayscale(1) blur(14px)'; ctx.drawImage(img, 0, 0, W, H);
        const coarse = ctx.getImageData(0, 0, W, H).data;
        const out = ctx.createImageData(W, H), d = out.data;
        for (let i = 0; i < d.length; i += 4) {
          const a = fine[i + 3];
          const v = a < 20 ? 128 : Math.max(0, Math.min(255, 128 + (fine[i] - coarse[i]) * 2.2));
          d[i] = d[i + 1] = v; d[i + 2] = 128; d[i + 3] = 255;
        }
        ctx.filter = 'none'; ctx.putImageData(out, 0, 0);
        res(c.toDataURL('image/png'));
      } catch { res(null); }
    };
    img.onerror = () => res(null);
    img.src = src;
  });
  foldCache.set(src, p);
  return p;
}
let filterEl = null;
function ensureFilter() {
  if (filterEl) return filterEl;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.innerHTML = `<filter id="fold-f" color-interpolation-filters="sRGB" x="-10%" y="-10%" width="120%" height="120%" filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse"><feImage result="map" preserveAspectRatio="none"/><feDisplacementMap in="SourceGraphic" in2="map" scale="9" xChannelSelector="R" yChannelSelector="G"/></filter>`;
  document.body.appendChild(svg);
  filterEl = svg.querySelector('feImage');
  return filterEl;
}

/* ---------- сцена ---------- */
export function mountStage(box, product, data, opts) {
  /* не innerHTML += : он пересоздал бы уже смонтированную вещь и потерял её обработчики */
  box.insertAdjacentHTML('beforeend', `
    <div class="zone"><div class="art" hidden><div class="art__body"></div><img class="art__shade" alt="" aria-hidden="true"></div></div>
    <div class="zone-ui"><i class="zone__axis zone__axis--x" aria-hidden="true"></i><i class="zone__axis zone__axis--y" aria-hidden="true"></i>
      <div class="art-ui" hidden><i class="art__rotate" aria-hidden="true"></i><i class="art__handle" aria-hidden="true"></i></div></div>
    <button type="button" class="zone__empty"><span>Положите макет на вещь</span></button>`);
  const zone = box.querySelector('.zone'), ui = box.querySelector('.zone-ui');
  const art = zone.querySelector('.art'), body = art.querySelector('.art__body'), shade = art.querySelector('.art__shade');
  const artUi = ui.querySelector('.art-ui'), handle = ui.querySelector('.art__handle'), rotH = ui.querySelector('.art__rotate');
  const empty = box.querySelector('.zone__empty');
  const view = { zoom: 1, px: 0, py: 0 };

  /* маска по силуэту текущего кадра; карта складок */
  let maskKey = '', foldSrc = '';
  function applyMask() {
    const gm = box.querySelector('.gm');
    const img = gm?.querySelector('.gm__img.is-on');
    const svg = gm?.querySelector('svg.is-on');
    let url = '', size = 'contain';
    if (img && img.currentSrc) url = `url("${img.currentSrc}")`;
    else if (svg) {
      const r = svg.getBoundingClientRect();
      const xml = svg.outerHTML.includes('xmlns=') ? svg.outerHTML : svg.outerHTML.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      url = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}")`;
      size = `${r.width / view.zoom}px ${r.height / view.zoom}px`;
    }
    const key = url + size;
    if (key !== maskKey) {
      maskKey = key;
      zone.style.webkitMaskImage = zone.style.maskImage = url || 'none';
      zone.style.webkitMaskSize = zone.style.maskSize = size;
      zone.style.webkitMaskPosition = zone.style.maskPosition = 'center';
      zone.style.webkitMaskRepeat = zone.style.maskRepeat = 'no-repeat';
      if (img) { shade.src = img.currentSrc; shade.hidden = false; } else { shade.removeAttribute('src'); shade.hidden = true; }
    }
    /* складки только у рендеров */
    const src = img?.currentSrc || '';
    if (src !== foldSrc) {
      foldSrc = src; body.classList.remove('has-folds');
      if (src && state.folds && !reduced.matches) foldMap(src).then(map => { if (map && foldSrc === src) { ensureFilter().setAttribute('href', map); body.classList.add('has-folds'); layout(); } });
    }
  }

  function layout() {
    ensurePlace(product);
    applyMask();
    const a = state.art;
    box.classList.toggle('has-art', !!a);
    art.hidden = artUi.hidden = !a;
    if (!a) return;
    const ratio = a.px ? a.px[1] / a.px[0] : 1;
    const zw = zone.clientWidth || 1, zh = zone.clientHeight || 1;
    let aw = state.scale * zw, ah = aw * ratio;
    if (ah > zh) { ah = zh; aw = ah / ratio; }
    const hx = aw / zw / 2, hy = ah / zh / 2;
    state.cx = Math.max(hx, Math.min(1 - hx, state.cx));
    state.cy = Math.max(hy, Math.min(1 - hy, state.cy));
    const left = state.cx * zw - aw / 2, top = state.cy * zh - ah / 2;
    for (const el of [art, artUi]) { el.style.width = aw + 'px'; el.style.height = ah + 'px'; el.style.left = left + 'px'; el.style.top = top + 'px'; el.style.transform = `rotate(${state.rot}deg)`; }
    body.style.transform = state.flip ? 'scaleX(-1)' : '';
    /* копия вещи поверх макета совмещена с вещью, поворот компенсируем */
    shade.style.width = zw + 'px'; shade.style.height = zh + 'px'; shade.style.left = -left + 'px'; shade.style.top = -top + 'px';
    shade.style.transformOrigin = `${left + aw / 2}px ${top + ah / 2}px`; shade.style.transform = `rotate(${-state.rot}deg)`;
    const fi = filterEl; if (fi) { fi.setAttribute('x', -left); fi.setAttribute('y', -top); fi.setAttribute('width', zw); fi.setAttribute('height', zh); }
    const m = methodById(data, state.method);
    const dark = isDark(opts.fabricHex());
    const film = m.group === 'film' ? (state.film || defaultFilm(m, dark)) : null;
    const key = [a.id, m.id, film?.hex].join('|');
    if (art.dataset.key !== key) {
      art.dataset.key = key;
      art.className = 'art ' + artClass(m);
      body.innerHTML = artHTML(a, m, film);
      if (state.fresh && !reduced.matches) {
        art.classList.add('is-fresh');
        const gm = box.querySelector('.gm');
        if (gm && m.preview !== 'stitch') { gm.classList.remove('is-pressed'); void gm.offsetWidth; gm.classList.add('is-pressed'); }
        state.fresh = false;
      }
    }
    box.classList.toggle('on-light', !dark);
    applyView();
  }
  function applyView() {
    box.style.transform = view.zoom > 1 ? `translate(${view.px}px, ${view.py}px) scale(${view.zoom})` : '';
    box.classList.toggle('is-zoomed', view.zoom > 1);
  }

  /* ---------- жесты на макете: один палец тянет, два — щипок и поворот ---------- */
  const pts = new Map();
  let gesture = null;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  art.addEventListener('pointerdown', e => {
    if (e.button) return;
    e.preventDefault(); e.stopPropagation();
    try { art.setPointerCapture(e.pointerId); } catch {}
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const P = [...pts.values()];
    gesture = P.length >= 2
      ? { kind: 'pinch', d0: dist(P[0], P[1]), a0: ang(P[0], P[1]), scale0: state.scale, rot0: state.rot, mx: (P[0].x + P[1].x) / 2, my: (P[0].y + P[1].y) / 2, cx0: state.cx, cy0: state.cy }
      : { kind: 'drag', x: e.clientX, y: e.clientY, cx0: state.cx, cy0: state.cy };
    ui.classList.add('is-dragging'); body.classList.add('is-moving');
  });
  art.addEventListener('pointermove', e => {
    if (!gesture || !pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const zw = zone.clientWidth * view.zoom, zh = zone.clientHeight * view.zoom;
    if (gesture.kind === 'drag') {
      let cx = gesture.cx0 + (e.clientX - gesture.x) / zw, cy = gesture.cy0 + (e.clientY - gesture.y) / zh;
      const sx = Math.abs(cx - .5) < 6 / zw, sy = Math.abs(cy - .5) < 6 / zh;
      if (sx) cx = .5; if (sy) cy = .5;
      ui.classList.toggle('is-cx', sx); ui.classList.toggle('is-cy', sy);
      state.cx = cx; state.cy = cy; state.place = 'custom';
    } else {
      const P = [...pts.values()]; if (P.length < 2) return;
      const k = dist(P[0], P[1]) / gesture.d0;
      state.scale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, gesture.scale0 * k));
      state.rot = gesture.rot0 + (ang(P[0], P[1]) - gesture.a0);
      const mx = (P[0].x + P[1].x) / 2, my = (P[0].y + P[1].y) / 2;
      state.cx = gesture.cx0 + (mx - gesture.mx) / zw; state.cy = gesture.cy0 + (my - gesture.my) / zh;
      state.place = 'custom';
    }
    layout();
  });
  const endG = e => {
    pts.delete(e.pointerId);
    if (pts.size) { gesture = null; const P = [...pts.values()]; if (P.length === 1) gesture = { kind: 'drag', x: P[0].x, y: P[0].y, cx0: state.cx, cy0: state.cy }; return; }
    if (!gesture) return;
    gesture = null;
    ui.classList.remove('is-dragging', 'is-cx', 'is-cy'); body.classList.remove('is-moving');
    commit();
  };
  art.addEventListener('pointerup', endG); art.addEventListener('pointercancel', endG);

  /* ручка размера */
  let resize = null;
  handle.addEventListener('pointerdown', e => {
    if (e.button) return; e.preventDefault(); e.stopPropagation();
    try { handle.setPointerCapture(e.pointerId); } catch {}
    const r = art.getBoundingClientRect();
    resize = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, d0: Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)), scale0: state.scale };
    ui.classList.add('is-dragging', 'is-resizing');
  });
  handle.addEventListener('pointermove', e => {
    if (!resize) return;
    const k = Math.hypot(e.clientX - resize.cx, e.clientY - resize.cy) / (resize.d0 || 1);
    state.scale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, resize.scale0 * k));
    layout();
  });
  const endR = () => { if (!resize) return; resize = null; ui.classList.remove('is-dragging', 'is-resizing'); commit(); };
  handle.addEventListener('pointerup', endR); handle.addEventListener('pointercancel', endR);

  /* ручка поворота */
  let rotg = null;
  rotH.addEventListener('pointerdown', e => {
    if (e.button) return; e.preventDefault(); e.stopPropagation();
    try { rotH.setPointerCapture(e.pointerId); } catch {}
    const r = art.getBoundingClientRect();
    rotg = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, a0: Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI, rot0: state.rot };
    ui.classList.add('is-dragging', 'is-rotating');
  });
  rotH.addEventListener('pointermove', e => {
    if (!rotg) return;
    let rot = rotg.rot0 + Math.atan2(e.clientY - rotg.cy, e.clientX - rotg.cx) * 180 / Math.PI - rotg.a0;
    rot = ((rot + 180) % 360 + 360) % 360 - 180;
    if (Math.abs(rot) < 3) rot = 0;                              /* примагничивание к ровному */
    for (const s of [90, -90, 180, -180, 45, -45]) if (Math.abs(rot - s) < 3) rot = s;
    state.rot = rot; layout();
  });
  const endRot = () => { if (!rotg) return; rotg = null; ui.classList.remove('is-dragging', 'is-rotating'); commit(); };
  rotH.addEventListener('pointerup', endRot); rotH.addEventListener('pointercancel', endRot);

  /* ---------- вещь: колесо и щипок приближают, перетаскивание двигает, двойной тап возвращает ---------- */
  const scene = box.parentElement;
  const setZoom = (z, ax, ay) => {
    z = Math.max(1, Math.min(3, z));
    if (ax != null) {
      const r = box.getBoundingClientRect();
      const k = z / view.zoom;
      view.px = (view.px - (ax - (r.left + r.width / 2))) * k + (ax - (r.left + r.width / 2)) ;
      view.py = (view.py - (ay - (r.top + r.height / 2))) * k + (ay - (r.top + r.height / 2));
    }
    view.zoom = z;
    if (z === 1) { view.px = view.py = 0; }
    applyView();
  };
  scene.addEventListener('wheel', e => {
    if (!box.classList.contains('has-art') && view.zoom === 1 && e.deltaY > 0) return;
    e.preventDefault();
    setZoom(view.zoom * (e.deltaY < 0 ? 1.1 : .9), e.clientX, e.clientY);
  }, { passive: false });
  const spts = new Map(); let sg = null;
  scene.addEventListener('pointerdown', e => {
    if (e.target.closest('.art, .art__handle, .art__rotate, .zone__empty, button')) return;
    spts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { scene.setPointerCapture(e.pointerId); } catch {}
    const P = [...spts.values()];
    sg = P.length >= 2 ? { kind: 'pinch', d0: dist(P[0], P[1]), z0: view.zoom } : { kind: 'pan', x: e.clientX, y: e.clientY, px: view.px, py: view.py, moved: false };
  });
  scene.addEventListener('pointermove', e => {
    if (!sg || !spts.has(e.pointerId)) return;
    spts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (sg.kind === 'pinch') { const P = [...spts.values()]; if (P.length >= 2) setZoom(sg.z0 * dist(P[0], P[1]) / sg.d0); }
    else if (view.zoom > 1) { view.px = sg.px + (e.clientX - sg.x); view.py = sg.py + (e.clientY - sg.y); sg.moved = true; applyView(); }
  });
  const endS = e => { spts.delete(e.pointerId); if (!spts.size) sg = null; };
  scene.addEventListener('pointerup', endS); scene.addEventListener('pointercancel', endS);
  scene.addEventListener('dblclick', e => { if (!e.target.closest('.art')) setZoom(1); });

  /* ---------- клавиатура: стрелки двигают, Cmd/Ctrl+Z отменяет ---------- */
  const onKey = e => {
    if (!state.art || !document.body.contains(box) || box.closest('.pv:not(.is-open)')) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const step = e.shiftKey ? .05 : .01;
    const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (map[e.key]) { e.preventDefault(); state.cx += map[e.key][0]; state.cy += map[e.key][1]; state.place = 'custom'; layout(); commit(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
  };
  addEventListener('keydown', onKey);

  /* пустая вещь: клик → файл; бросить файл на вещь */
  empty.addEventListener('click', () => opts.pickFile?.());
  const over = e => { e.preventDefault(); box.classList.add('is-over'); };
  box.addEventListener('dragenter', over); box.addEventListener('dragover', over);
  box.addEventListener('dragleave', () => box.classList.remove('is-over'));
  box.addEventListener('drop', e => { e.preventDefault(); box.classList.remove('is-over'); const f = e.dataTransfer?.files?.[0]; if (f) setFile(f); });

  const unsub = subscribe(layout);
  const ro = new ResizeObserver(layout); ro.observe(box);
  const gmEl = box.querySelector('.gm');
  const mo = new MutationObserver(() => { maskKey = ''; layout(); });
  if (gmEl) { mo.observe(gmEl, { attributes: true, attributeFilter: ['class', 'src'], subtree: true, childList: true }); gmEl.addEventListener('load', () => { maskKey = ''; layout(); }, true); }
  if (hi < 0) commit();
  layout();
  return {
    update: layout,
    setCompare(on) { box.classList.toggle('is-compare', !!on); },
    resetView() { setZoom(1); },
    destroy() { unsub(); ro.disconnect(); mo.disconnect(); removeEventListener('keydown', onKey); },
  };
}
