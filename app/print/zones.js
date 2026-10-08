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
