/* zones.js — где может лежать принт. Поле печати — вся вещь: макет двигается и растёт по всему силуэту
   (рукав, низ, капюшон — куда нужно человеку). «Расположения» — это пресеты: куда прыгнуть и какого размера быть.
   Координаты — доли холста вещи: cx, cy — центр, w — ширина макета от ширины вещи.
   Реальный размер: product.widthCm — ширина вещи на рендере в сантиметрах (например, ширина худи по груди).
   Пока его нет, размер считается в процентах, а в заявке «размер уточнит менеджер». */
import { BASE_TYPE } from '../garment.js';

/* ширина вещи на холсте и область вещи для каждого вида сцены */
export const BOX_INSET = { render: .03, sketch: .10 };

const P = (k, name, cx, cy, w) => ({ k, name, cx, cy, w });
const TOPS_FRONT = [
  P('chest', 'Грудь слева', .62, .34, .14),
  P('center', 'Центр', .50, .42, .34),
  P('full', 'Вся грудь', .50, .44, .50),
  P('sleeve-l', 'Левый рукав', .17, .38, .10),
  P('sleeve-r', 'Правый рукав', .83, .38, .10),
  P('hem', 'Низ', .50, .80, .24),
];
const TOPS_BACK = [
  P('nape', 'Под воротом', .50, .22, .12),
  P('back', 'Спина', .50, .46, .50),
  P('sleeve-l', 'Левый рукав', .17, .38, .10),
  P('sleeve-r', 'Правый рукав', .83, .38, .10),
  P('hem', 'Низ', .50, .80, .24),
];
const HOOD_FRONT = [
  P('chest', 'Грудь слева', .63, .40, .13),
  P('center', 'Центр', .50, .45, .32),
  P('full', 'Вся грудь', .50, .47, .48),
  P('sleeve-l', 'Левый рукав', .18, .50, .10),
  P('sleeve-r', 'Правый рукав', .82, .50, .10),
  P('pocket', 'Карман', .50, .76, .26),
];
const HOOD_BACK = [
  P('hoodie', 'Капюшон', .50, .14, .20),
  P('nape', 'Под воротом', .50, .30, .12),
  P('back', 'Спина', .50, .50, .50),
  P('sleeve-l', 'Левый рукав', .18, .50, .10),
  P('sleeve-r', 'Правый рукав', .82, .50, .10),
];
const ZIP_FRONT = [
  P('chest', 'Грудь слева', .64, .40, .13),
  P('chest-r', 'Грудь справа', .36, .40, .13),
  P('sleeve-l', 'Левый рукав', .18, .50, .10),
  P('sleeve-r', 'Правый рукав', .82, .50, .10),
  P('pocket', 'Карман', .64, .76, .16),
];
const PANTS_FRONT = [
  P('leg', 'Бедро', .66, .28, .14),
  P('knee', 'Колено', .66, .55, .14),
  P('hem', 'Низ штанины', .66, .86, .12),
  P('hip', 'Пояс', .50, .08, .20),
];
const PANTS_BACK = [
  P('pocket', 'Карман', .66, .20, .14),
  P('leg', 'Бедро', .34, .32, .14),
  P('hem', 'Низ штанины', .66, .86, .12),
];
const SHORTS_FRONT = [
  P('leg', 'Бедро', .66, .50, .16),
  P('leg-l', 'Левая штанина', .32, .50, .16),
  P('hem', 'Низ', .66, .84, .14),
];
const SHORTS_BACK = [P('pocket', 'Карман', .66, .40, .16), P('leg', 'Бедро', .34, .50, .16)];
const TOP_FRONT = [P('chest', 'Грудь слева', .64, .36, .14), P('center', 'Центр', .50, .50, .30), P('full', 'Вся грудь', .50, .52, .46)];
const TOP_BACK = [P('nape', 'Под воротом', .50, .22, .12), P('back', 'Спина', .50, .52, .44)];

export function presetsFor(product, side = 'front') {
  const t = product.type, b = BASE_TYPE[t] || 'tee';
  const back = side === 'back';
  if (t === 'zhood' || t === 'olymp') return back ? HOOD_BACK : ZIP_FRONT;
  if (b === 'hood') return back ? HOOD_BACK : HOOD_FRONT;
  if (b === 'pants') return back ? PANTS_BACK : PANTS_FRONT;
  if (b === 'shorts') return back ? SHORTS_BACK : SHORTS_FRONT;
  if (b === 'top') return back ? TOP_BACK : TOP_FRONT;
  return back ? TOPS_BACK : TOPS_FRONT;
}
/* Бирка: печать внутри вещи. Место — внутренняя сторона спинки под воротом (у штанов и шорт — пояс сзади),
   на рендере спереди она видна в вырезе. Доли холста вещи: центр и ширина; замерено по рендерам.
   Для отдельной вещи место можно задать в каталоге: "labelSpot": [cx, cy, w]. */
/* [cx, dy, w]: dy — на сколько ниже верхнего края вещи по центру стоит середина бирки (доля высоты вещи).
   Верхний край ищет сцена по самой картинке: у разных цветов одной вещи ворот на рендере стоит на разной высоте. */
const LABEL = {
  tee: [.50, .027, .07], long: [.50, .030, .07], sweat: [.50, .035, .07], olymp: [.50, .035, .07],
  hood: [.50, .090, .08], zhood: [.50, .085, .08],
};
/* на этих рендерах внутренняя сторона не видна (топ — вырез без спинки, штаны и шорты — пояс закрыт):
   бирка уходит в заказ, но на вещи её не рисуем, чтобы не показывать её снаружи */
const LABEL_UNSEEN = /^(top|pants|shorts)$/;
/* у эскизов (вещь без рендера) ворот нарисован ниже края кадра — высота от верха эскиза */
const LABEL_SKETCH = { tops: .135, hood: .17 };
export function labelSpot(product, sketch = false) {
  const own = Array.isArray(product.labelSpot) && product.labelSpot.length === 3 ? product.labelSpot : null;
  const base = BASE_TYPE[product.type] || product.type;
  const waist = /pants|shorts/.test(product.type) || /pants|shorts/.test(base);
  const where = waist ? 'внутри, на поясе сзади' : 'внутри, под воротом';
  if (!own && (LABEL_UNSEEN.test(product.type) || LABEL_UNSEEN.test(base))) return { hidden: true, cx: .5, dy: 0, w: .07, where };
  const [cx, dy, w] = own || LABEL[product.type] || LABEL[base] || LABEL.tee;
  if (sketch) return { cx, w, where, cy: /hood/.test(product.type) ? LABEL_SKETCH.hood : LABEL_SKETCH.tops };
  return { cx, dy, w, where };
}

export function placesFor(product, side) { return presetsFor(product, side).map(p => [p.k, p.name]); }
export function preset(product, side, k) {
  const list = presetsFor(product, side);
  return list.find(p => p.k === k) || list.find(p => p.k === 'center') || list[0];
}
export function defaultPlace(product, side) {
  const list = presetsFor(product, side);
  return (list.find(p => p.k === 'center') || list[0]).k;
}

/* Прямоугольник пресета в долях холста вещи — для плиток «С моим принтом» и превью */
export function zoneRect(product, side, k) {
  const p = preset(product, side, k);
  const h = p.w * .8;
  return [p.cx - p.w / 2, p.cy - h / 2, p.w, h];
}

/* Реальная ширина вещи в мм, если владелец задал widthCm (число или по размерам: { M: 60 }) */
export function garmentMm(product, size) {
  const v = product.widthCm;
  if (!v) return null;
  const cm = typeof v === 'number' ? v : (v[size] ?? v.M ?? Object.values(v)[0]);
  return cm ? Math.round(cm * 10) : null;
}
