#!/usr/bin/env python3
"""Стиль карты под сайт: python3 tools/build_map_style.py → data/map-style.json.
Берёт открытый стиль Positron у OpenFreeMap (тайлы OpenStreetMap, ключ не нужен) и перекрашивает его
в белый, серый и чёрный сайта, подписи — по-русски, дома — объёмом. Запускать, когда меняем вид карты."""
import json, os, urllib.request

SRC = 'https://tiles.openfreemap.org/styles/positron'
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'map-style.json')
INK, MUTE, PAPER = '#0B0B0B', '#66665F', '#FFFFFF'
LAND, WATER, GREEN, BUILD, CASE, RAIL = '#F4F4F2', '#E2E4E4', '#ECECE9', '#E6E6E2', '#DFDFDA', '#CFCFCA'

style = json.load(urllib.request.urlopen(urllib.request.Request(SRC, headers={'User-Agent': 'map-style-build'}), timeout=30))
style['name'] = 'fabrika'
style['sources'] = {k: v for k, v in style['sources'].items() if k == 'openmaptiles'}
style['light'] = {'anchor': 'viewport', 'color': '#ffffff', 'intensity': 0.3}
NAME = ['coalesce', ['get', 'name:ru'], ['get', 'name']]
DROP = ('shield', 'boundary', 'aeroway', 'airport', 'ice', 'glacier', 'label_country', 'label_state')
layers = []
for l in style['layers']:
    i, t = l['id'], l['type']
    if l.get('source') == 'ne2_shaded' or any(k in i for k in DROP):
        continue
    p = l.setdefault('paint', {})
    if t == 'background':
        p['background-color'] = LAND
    elif t == 'fill':
        if 'water' in i: p['fill-color'] = WATER
        elif 'building' in i: p['fill-color'] = BUILD; l['maxzoom'] = 14.5
        elif 'park' in i or 'wood' in i: p['fill-color'] = GREEN
        elif 'residential' in i: p['fill-color'] = LAND
        else: p['fill-color'] = PAPER
        p.pop('fill-outline-color', None); p.pop('fill-pattern', None)
    elif t == 'line':
        if 'waterway' in i: p['line-color'] = WATER
        elif 'rail' in i: p['line-color'] = RAIL
        elif 'casing' in i: p['line-color'] = CASE
        elif 'path' in i: p['line-color'] = CASE
        else: p['line-color'] = PAPER
    elif t == 'symbol':
        lay = l.setdefault('layout', {})
        if 'text-field' in lay: lay['text-field'] = NAME
        lay.pop('icon-image', None)
        major = any(k in i for k in ('city', 'town', 'major'))
        p['text-color'] = INK if major else MUTE
        p['text-halo-color'] = PAPER
        p['text-halo-width'] = 1.4
        p.pop('text-halo-blur', None)
    layers.append(l)

first_symbol = next(n for n, l in enumerate(layers) if l['type'] == 'symbol')
layers.insert(first_symbol, {
    'id': 'building-3d', 'type': 'fill-extrusion', 'source': 'openmaptiles', 'source-layer': 'building', 'minzoom': 14,
    'paint': {
        'fill-extrusion-color': PAPER,
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.2, ['coalesce', ['get', 'render_height'], 6]],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.92,
        'fill-extrusion-vertical-gradient': True,
    },
})
style['layers'] = layers
json.dump(style, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(OUT, len(layers), 'слоёв', os.path.getsize(OUT), 'байт')
