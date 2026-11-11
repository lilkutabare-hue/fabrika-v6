/* map.js — карта производства и шоурума на главной.
   Своя перекрашенная карта (MapLibre + открытые тайлы OpenStreetMap у OpenFreeMap, ключ не нужен; стиль — data/map-style.json,
   собирается tools/build_map_style.py). Библиотека грузится, только когда блок рядом с экраном.
   Когда блок на виду, камера один раз подлетает от города к зданию. Страница не застревает в карте:
   колесо двигает страницу, карту — с ⌘/Ctrl, на телефоне — двумя пальцами.
   Если карта не загрузилась, остаются адрес и кнопки маршрута — они в разметке всегда. */
import { $, reduced } from './ui.js';

const LIB = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl';
const LOCALE = {
  'CooperativeGesturesHandler.WindowsHelpText': 'Ctrl + колесо — приблизить карту',
  'CooperativeGesturesHandler.MacHelpText': '⌘ + колесо — приблизить карту',
  'CooperativeGesturesHandler.MobileHelpText': 'Двигайте карту двумя пальцами',
  'AttributionControl.ToggleAttribution': 'Источник карты',
};
let started = false;

function loadLib() {
  return new Promise((resolve, reject) => {
    if (window.maplibregl) { resolve(window.maplibregl); return; }
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = LIB + '.css';
    document.head.append(css);
    const js = document.createElement('script');
    js.src = LIB + '.js'; js.async = true;
    js.onload = () => (window.maplibregl ? resolve(window.maplibregl) : reject(new Error('maplibre не загрузился')));
    js.onerror = () => reject(new Error('maplibre не загрузился'));
    document.head.append(js);
  });
}

export function init(data) {
  const root = $('[data-map]');
  const point = data.route?.point;
  if (!root || !Array.isArray(point) || point.length !== 2) return;
  const canvas = $('[data-map-canvas]', root);
  const ctl = $('[data-map-ctl]', root);
  const wide = matchMedia('(min-width: 1024px)');
  /* на компьютере слева лежит панель с адресом — здание держим правее неё */
  const pad = () => ({ top: 0, right: 0, bottom: 0, left: wide.matches ? Math.min(480, root.clientWidth * .36) : 0 });
  const near = () => ({ center: point, zoom: 16.3, pitch: 56, bearing: -24, padding: pad() });

  async function start() {
    if (started) return;
    started = true;
    let gl;
    try { gl = await loadLib(); } catch (e) { console.warn('fabrika-v6: карта недоступна', e); return; }
    if (!gl.supported?.() && gl.supported) return;
    const map = new gl.Map({
      container: canvas,
      style: 'data/map-style.json',
      center: point, zoom: 10.8, pitch: 0, bearing: 0,
      minZoom: 9, maxZoom: 18,
      attributionControl: false,
      cooperativeGestures: true,
      locale: LOCALE,
    });
    map.addControl(new gl.AttributionControl({ compact: true }), 'bottom-right');
    const pin = document.createElement('div');
    pin.className = 'fmap__pin';
    pin.innerHTML = `<span>${data.route.pinLabel || 'Фабрика'}</span><i></i>`;
    new gl.Marker({ element: pin, anchor: 'bottom' }).setLngLat(point).addTo(map);

    let flown = false, seen = false, loaded = false;
    const fly = () => {
      if (flown || !seen || !loaded) return;
      flown = true;
      if (reduced.matches) map.jumpTo(near());
      else map.flyTo({ ...near(), duration: 4200, curve: 1.45, essential: true });
    };
    map.on('load', () => { loaded = true; root.classList.add('is-ready'); if (ctl) ctl.hidden = false; fly(); });
    new IntersectionObserver(es => { seen = es[0].isIntersecting; fly(); }, { threshold: .4 }).observe(root);

    ctl?.addEventListener('click', e => {
      const b = e.target.closest('[data-map-do]');
      if (!b) return;
      const d = reduced.matches ? 0 : 400;
      if (b.dataset.mapDo === 'in') map.zoomIn({ duration: d });
      if (b.dataset.mapDo === 'out') map.zoomOut({ duration: d });
      if (b.dataset.mapDo === 'home') map.flyTo({ ...near(), duration: reduced.matches ? 0 : 1400, essential: true });
    });
    new ResizeObserver(() => map.resize()).observe(canvas);
    root._map = map;                                    /* для снимков и проверки */
  }

  /* грузим заранее, за экран до блока; в скрытом экране (каталог) наблюдатель молчит */
  new IntersectionObserver((es, io) => { if (es[0].isIntersecting) { io.disconnect(); start(); } }, { rootMargin: '900px 0px' }).observe(root);
}
