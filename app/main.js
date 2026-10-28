/* main.js — запуск: данные, шапка, первый экран, док, адрес, связка модулей. */
import { loadData, onData, density } from './data.js';
import { mountGarment } from './garment.js';
import * as layers from './layers.js';
import * as catalog from './catalog.js';
import * as product from './product.js';
import * as cart from './cart.js';
import * as menu from './menu.js';
import * as sewing from './sewing.js';
import * as showroom from './showroom.js';
import * as admin from './admin.js';
import { $, $$, toast } from './ui.js';
import { mountHop } from './hop.js';

/* ---------- Шапка: прозрачная → белая после порога ---------- */
function initHeader() {
  const hdr = $('[data-hdr]');
  const hero = $('[data-hero]');
  hdr.dataset.on = hero?.dataset.tone === 'dark' ? 'dark' : 'light';
  const ENTER = 64, LEAVE = 32;
  let solid = false, queued = false;
  const update = () => {
    queued = false;
    const y = window.scrollY;
    const next = solid ? y > LEAVE : y > ENTER;
    if (next !== solid) { solid = next; hdr.classList.toggle('is-solid', solid); }
  };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}

/* ---------- Первый экран ---------- */
function pickHero(data) {
  const id = data.settings.hero;
  return (id && data.products.find(p => p.id === id)) || data.products.find(p => p.hasRender) || data.products[0];
}
function initHero(data) {
  const hero = $('[data-hero]');
  const stage = $('[data-stage]', hero);
  const sw = $('[data-swatches]', hero);
  const p = pickHero(data);
  if (!p) return;
  let current = p.colors[0];
  stage.innerHTML = '<div></div>';
  const view = mountGarment(stage.firstElementChild, p, data, { color: current, variant: 'fit', sizes: '(min-width:1024px) 70vh, 92vw', eager: true });
  if (p.colors.length > 1) {
    sw.innerHTML = p.colors.map(c => `<button type="button" data-color="${c}" aria-label="${data.palette[c]?.name || c}" aria-pressed="${c === current}" style="--c:${p.swatch[c] || data.palette[c]?.hex || '#ccc'}"><i></i></button>`).join('');
    sw.addEventListener('click', e => {
      const b = e.target.closest('[data-color]');
      if (!b || b.dataset.color === current) return;
      current = b.dataset.color;
      hero.dataset.color = current;
      $$('button', sw).forEach(x => x.setAttribute('aria-pressed', x.dataset.color === current));
      view.setColor(current);
    });
  } else sw.hidden = true;
  stage.addEventListener('click', () => { rememberFrame(p.id, current); product.open(p.id, { color: current, from: stage }); });
  stage.style.cursor = 'pointer';
  hero.dataset.product = p.id;
  hero.dataset.color = current;
  const specs = $('[data-specs]', hero);
  const d = density(p);
  specs.textContent = ['от 1 шт', d ? 'до ' + d.split('–').pop() : '', p.colors.length > 1 ? p.colors.length + ' цветов' : '', 'XS–XXL'].filter(Boolean).join(' · ');
}

/* Вещь, которая уже в кадре: сцена первого экрана или плитка каталога.
   «Принт» открывает конструктор на ней. Худи с меткой «Хит» сюда не подставляется. */
let framed = null;
function rememberFrame(id, color) { if (id) framed = { id, color }; }

function visibleArea(el) {
  if (!el) return 0;
  const r = el.getBoundingClientRect();
  const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
  const h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
  return w > 0 && h > 0 ? w * h : 0;
}
function frameSpots() {
  const spots = [];
  const hero = $('[data-hero]');
  const stage = hero && $('[data-stage]', hero);
  const heroArea = visibleArea(stage);
  if (hero?.dataset.product && heroArea > 0) spots.push({ id: hero.dataset.product, color: hero.dataset.color, area: heroArea, from: stage });
  $$('#blanks .tile').forEach(tile => {
    const media = $('.tile__media', tile);
    const area = visibleArea(media);
    if (area > 0) spots.push({ id: tile.dataset.id, color: tile.dataset.color, area, from: media });
  });
  return spots;
}
function garmentInFrame() {
  const spots = frameSpots();
  const top = spots.reduce((a, b) => (!a || b.area > a.area ? b : a), null);
  if (framed) {
    const s = spots.filter(x => x.id === framed.id).reduce((a, b) => (!a || b.area > a.area ? b : a), null);
    if (s && top && s.area >= top.area * 0.5) return { id: s.id, color: s.color || framed.color, from: s.from };
  }
  if (top) return { id: top.id, color: top.color, from: top.from };
  const hero = $('[data-hero]');
  if (!hero?.dataset.product) return null;
  return { id: hero.dataset.product, color: hero.dataset.color, from: $('[data-stage]', hero) };
}
function openFramePrint() {
  if (layers.isOpen('product')) { product.openPrint(); return; }
  const g = garmentInFrame();
  if (g && product.open(g.id, { mode: 'print', color: g.color, from: g.from })) { rememberFrame(g.id, g.color); return; }
  product.openPrint();
}

/* ---------- Переходы по разделам ---------- */
function goTo(key) {
  const map = { blanks: 'blanks', print: 'print', sewing: 'sewing', factory: 'factory', terms: 'terms', contact: 'contact' };
  if (key === 'print' || key === 'sewing') sewing.openMore(key);
  const t = document.getElementById(map[key] || key);
  if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/* ---------- Док ---------- */
function initDock() {
  const dock = $('[data-dock]');
  if (!dock) return;
  const pill = $('.dock__pill', dock);
  const items = $$('button[data-go]', dock);
  let active = items[0];
  const place = () => { pill.style.setProperty('--w', active.offsetWidth + 'px'); pill.style.setProperty('--x', (active.offsetLeft - 4) + 'px'); };
  const set = b => { active = b; items.forEach(x => x.setAttribute('aria-current', x === b ? 'true' : 'false')); place(); };
  dock.addEventListener('click', e => {
    const b = e.target.closest('button[data-go]');
    if (!b) return;
    set(b);
    if (b.dataset.go === 'print') { openFramePrint(); return; }
    if (b.dataset.go === 'cart') { set(items.find(x => x.dataset.go === 'blanks') || b); cart.open(); return; }
    goTo(b.dataset.go);
  });
  /* подсветка следует за положением страницы */
  const targets = [['blanks', 'blanks'], ['print', 'services'], ['sewing', 'sewing'], ['contact', 'factory']];
  const io = new IntersectionObserver(entries => {
    const hit = entries.filter(x => x.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!hit) return;
    const key = targets.find(t => t[1] === hit.target.id)?.[0];
    const b = items.find(x => x.dataset.go === key);
    if (b && b !== active) set(b);
  }, { rootMargin: '-40% 0px -45% 0px', threshold: [0, .2, .5] });
  targets.forEach(([, id]) => { const s = document.getElementById(id); if (s) io.observe(s); });
  new ResizeObserver(place).observe(dock);
  document.fonts?.ready.then(place);
  place();
}

/* ---------- Файл макета с любого входа ---------- */
function initFileInput() {
  const input = $('[data-file-input]');
  input.addEventListener('change', async () => {
    const f = input.files[0];
    input.value = '';                           /* повторный выбор того же файла срабатывает (баг 14) */
    if (f) await product.onFile(f);
  });
  input.addEventListener('cancel', () => { if (!layers.isOpen('product')) product.openPrint(); });
  const pick = () => input.click();
  $$('[data-pick-file]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); pick(); }));
  return pick;
}

/* ---------- Адрес при загрузке: #hood/black открывает товар, #blanks — раздел ---------- */
function initRoute(data) {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h) return;
  const [id, color] = h.split('/');
  if (data.products.some(p => p.id === id)) {
    rememberFrame(id, color);
    try { history.replaceState({ depth: 0 }, '', location.pathname + location.search); } catch {}
    product.open(id, { color, mode: 'clean' });
  }
}

/* ---------- старт ---------- */
mountHop();
initHeader();
initDock();
const pickFile = initFileInput();

$('[data-open-cart]').addEventListener('click', cart.open);
$('[data-open-menu]')?.addEventListener('click', menu.open);
$('[data-adm-btn]')?.addEventListener('click', admin.open);
$$('[data-go]').forEach(b => { if (!b.closest('.dock')) b.addEventListener('click', e => { e.preventDefault(); goTo(b.dataset.go); }); });

const api = {
  openProduct: (id, o) => { rememberFrame(id, o?.color); return product.open(id, o); },
  openFramePrint,
  addToCart: item => { cart.add(item); toast(`Добавлено: ${item.product.name} ${item.size}`); },
  setCat: (k, scroll) => catalog.setCat(k, scroll),
  goTo,
  pickFile,
};

loadData()
  .then(data => {
    document.documentElement.classList.remove('is-loading');
    initHero(data);
    catalog.init(data, api);
    product.init(data);
    cart.init(data);
    menu.init(data, api);
    sewing.init(data, api);
    showroom.init(data);
    cart.onCart(items => {
      const n = items.reduce((s, i) => s + i.qty, 0);
      $$('[data-cart-count]').forEach(x => { x.textContent = n; if (x.classList.contains('dock__n')) x.hidden = !n; });
      $('[data-open-cart]').setAttribute('aria-label', `Корзина, ${n} товаров`);
    });
    initRoute(data);
    onData(d => { catalog.setData(d); product.setData(d); cart.setData(d); menu.setData(d); showroom.setData(d); });
  })
  .catch(err => { console.error('fabrika-v6: данные не загрузились', err); toast('Не удалось загрузить каталог'); });
