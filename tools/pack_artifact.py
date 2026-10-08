#!/usr/bin/env python3
"""Сборка версии для артефакта claude.ai: python3 tools/pack_artifact.py → dist/
Страница без собственного каркаса (его добавляет публикация), пути без ?v=, медиа только 600 и 1200,
манифест с теми же ширинами. Исходники не меняются."""
import json, re, shutil
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
if DIST.exists(): shutil.rmtree(DIST)
DIST.mkdir()
html = (ROOT / 'index.html').read_text(encoding='utf-8')
head = html[html.index('<head>') + 6:html.index('</head>')]
body = html[html.index('<body>') + 6:html.index('</body>')]
keep = [l for l in head.splitlines() if ('<link' in l and ('fonts.g' in l or 'stylesheet' in l))]
keep = [re.sub(r'\?v=\d+', '', l) for l in keep]
page = '<title>Фабрика v6</title>\n' + '\n'.join(keep) + '\n' + re.sub(r'\?v=\d+', '', body)
(DIST / 'index.html').write_text(page, encoding='utf-8')
for d in ('styles', 'app', 'data'):
    shutil.copytree(ROOT / d, DIST / d, ignore=shutil.ignore_patterns('media-map.json'))
(DIST / 'media').mkdir()
WIDTHS = {600, 1200}
man = json.loads((ROOT / 'media/manifest.json').read_text(encoding='utf-8'))
n = 0
for pid, colors in man['products'].items():
    for c, sides in colors.items():
        for side, variants in sides.items():
            variants.pop('anim', None)
            for v in variants.values():
                keep = [w for w in v['widths'] if w in WIDTHS]
                big = max(v['widths'])
                if big not in keep and big < 1300: keep.append(big)   # родная ширина fit (1053–1186) вместо отсутствующей 1200
                v['widths'] = sorted(keep) or v['widths'][:1]
                for w in v['widths']:
                    f = f"{v['src']}-{w}.webp"
                    shutil.copy(ROOT / 'media' / f, DIST / 'media' / f); n += 1
(DIST / 'media/manifest.json').write_text(json.dumps(man, ensure_ascii=False), encoding='utf-8')
total = sum(p.stat().st_size for p in DIST.rglob('*') if p.is_file())
print(f"dist: {n} картинок, {sum(1 for p in DIST.rglob('*') if p.is_file())} файлов, {total/1024/1024:.1f} МБ")
