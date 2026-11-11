#!/usr/bin/env python3
"""Отдельные страницы сайта: python3 tools/build_pages.py → oferta.html, privacy.html, production.html.
Оферта и политика собираются из pages/oferta.txt и pages/privacy.txt — текст в них дословно с fabrika.market,
править текст нужно там и пересобирать. Нумерованные разделы становятся оглавлением слева.
Производство для брендов — тексты четырёх направлений дословно с fabrika.market/production, сроки и предоплата —
только строки со статусом fact из data/terms.json."""
import html, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V = '11'
MANAGER = json.load(open(os.path.join(ROOT, 'data', 'catalog.json'), encoding='utf-8'))['settings'].get('manager', 'trtmoscow')
TERMS = json.load(open(os.path.join(ROOT, 'data', 'terms.json'), encoding='utf-8'))
e = html.escape


def shell(title, desc, body, name):
    return f'''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(title)} — Фабрика</title>
<meta name="description" content="{e(desc)}">
<meta name="theme-color" content="#FFFFFF">
<link rel="icon" href="data:,">
<!-- Собрано tools/build_pages.py — руками не править, правки в pages/ и в скрипте. -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Jost:ital,wght@0,400;0,500;0,700;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles/tokens.css?v={V}">
<link rel="stylesheet" href="styles/base.css?v={V}">
<link rel="stylesheet" href="styles/header.css?v={V}">
<link rel="stylesheet" href="styles/factory.css?v={V}">
<link rel="stylesheet" href="styles/page.css?v={V}">
</head>
<body class="pg pg--{name}">

<header class="hdr is-solid">
  <a class="hdr__logo" href="./" aria-label="Fabrika.market — на главную">Fabrika.market</a>
  <div class="hdr__start"><a href="./#catalog">Каталог</a></div>
  <div class="hdr__right"><a href="https://t.me/{e(MANAGER)}" target="_blank" rel="noopener">Написать</a></div>
</header>

<main class="pg__main">
{body}
</main>

<footer class="foot">
  <span>© 2026 Фабрика</span>
  <nav><a href="./">Главная</a><a href="./#catalog">Каталог</a><a href="production.html">Производство для брендов</a><a href="oferta.html">Оферта</a><a href="privacy.html">Приватность</a></nav>
</footer>
<script>
/* оглавление: подсветка раздела, который сейчас на экране */
(() => {{
  const links = [...document.querySelectorAll('.toc a')];
  if (!links.length || !('IntersectionObserver' in window)) return;
  const byId = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver(es => es.forEach(x => {{
    if (!x.isIntersecting) return;
    links.forEach(a => a.removeAttribute('aria-current'));
    byId.get(x.target.id)?.setAttribute('aria-current', 'true');
  }}), {{ rootMargin: '-20% 0px -70% 0px' }});
  document.querySelectorAll('.doc section[id]').forEach(s => io.observe(s));
}})();
</script>
</body>
</html>
'''


def linkify(t):
    t = e(t)
    t = re.sub(r'(https?://[^\s<)]+[^\s<).,;])', r'<a href="\1" rel="noopener">\1</a>', t)
    return re.sub(r'([\w.+-]+@[\w-]+\.[\w.-]+[\w])', r'<a href="mailto:\1">\1</a>', t)


def legal(name, h1, lead_lines):
    lines = [l.strip() for l in open(os.path.join(ROOT, 'pages', name + '.txt'), encoding='utf-8') if l.strip()]
    intro, sections, cur = [], [], None
    for l in lines[lead_lines:]:
        m = re.match(r'^(\d+)\.\s+(.*)$', l)
        if m and not re.match(r'^\d+\.\d', l):
            cur = {'n': m.group(1), 'title': m.group(2).rstrip(':'), 'items': []}
            sections.append(cur)
            continue
        c = re.match(r'^(\d+(?:\.\d+)+)\.?\s+(.*)$', l)
        item = ('clause', c.group(1), c.group(2)) if c else ('dash', '', l.lstrip('–—- ').strip()) if re.match(r'^[–—-]\s', l) else ('p', '', l)
        (cur['items'] if cur else intro).append(item)
    def render(items):
        out, dash = [], False
        for kind, num, text in items:
            if kind == 'dash':
                if not dash: out.append('<ul class="doc__list">'); dash = True
                out.append(f'<li>{linkify(text)}</li>')
                continue
            if dash: out.append('</ul>'); dash = False
            out.append(f'<p class="doc__cl"><span>{num}</span>{linkify(text)}</p>' if kind == 'clause' else f'<p>{linkify(text)}</p>')
        if dash: out.append('</ul>')
        return '\n'.join(out)
    toc = '\n'.join(f'<a href="#s{s["n"]}"><span>{s["n"]}</span>{e(s["title"])}</a>' for s in sections)
    body = '\n'.join(f'<section id="s{s["n"]}"><h2><span>{s["n"]}</span>{e(s["title"])}</h2>\n{render(s["items"])}</section>' for s in sections)
    sub = ''.join(f'<p class="pg__sub">{e(l)}</p>' for l in lines[:lead_lines] if l.lower() != h1.lower())
    return f'''<div class="pg__top">
  <h1>{e(h1)}</h1>
  {sub}
</div>
<div class="doc">
  <nav class="toc" aria-label="Разделы документа">
{toc}
  </nav>
  <article class="doc__body">
{('<div class="doc__intro">' + render(intro) + '</div>') if intro else ''}
{body}
  </article>
</div>'''


# ---------- Производство для брендов: тексты направлений — дословно с fabrika.market/production ----------
DIRECTIONS = [
    ('Коллекция и мерч под ключ', 'media/hood-wash-black-front-fit-1058.webp', 'Худи, варёный чёрный', [
        'Берём на себя весь процесс — от идеи до готового тиража. Работаем по прозрачной схеме: обсуждаем задачу, предлагаем решение, подбираем материалы, отшиваем образцы и запускаем производство. Не усложняем, но и не упрощаем там, где это влияет на результат.',
        'Если у вас нет готового дизайна или чёткого понимания продукта — поможем собрать это вместе. Если всё уже есть — аккуратно реализуем без лишних правок. Наша задача — сделать так, чтобы мерч вашего проекта или коллекция бренда выглядели как полноценный продукт, который действительно хочется носить и покупать.']),
    ('Пошив изделий', 'media/tee-os-sand-back-fit-1185.webp', 'Футболка оверсайз, спина', [
        'Шьём на собственном производстве — без посредников, поэтому контролируем каждый этап. Работаем с трикотажем: футболки, худи, лонгсливы и другие базовые изделия.',
        'В основе — наши лекала, которые мы долго тестировали и дорабатывали. Они дают стабильную посадку и предсказуемый результат в тираже. При необходимости адаптируем их под задачу, конструируем по образцу или разрабатываем модель с нуля.',
        'Следим за деталями, которые формируют итоговое ощущение от вещи: как ведёт себя ткань, как ложится шов, как изделие выглядит после стирки.']),
    ('Печать на изделиях', 'media/sweat-milk-front-fit-1094.webp', 'Свитшот, молочный', [
        'Подбираем технологию печати под задачу, а не под то, что проще сделать. Учитываем тираж, макет, ткань и желаемый результат — и уже под это предлагаем решение.',
        'Работаем с разными видами нанесения: шелкография, цифровая печать и DTF. У каждого — свой визуальный эффект и поведение в носке, и мы это учитываем заранее.',
        'Важно не просто нанести изображение, а сделать так, чтобы оно органично выглядело на изделии и нормально жило в реальности: не трескалось и не выцветало.']),
    ('Вышивка на изделиях', 'media/zhood-black-front-fit-1059.webp', 'Зип-худи, чёрный', [
        'Вышивка — это про аккуратность и тактильные ощущения. Рекомендуем ее использовать, когда нужно сделать продукт премиальнее.',
        'Делаем как машинную, так и ручную вышивку — в зависимости от задачи. Настраиваем плотность, подбираем нити и тестируем на образцах, чтобы вышитое лого/изображение выглядело чисто и не деформировало изделие.',
        'Хорошая вышивка не перетягивает ткань и не выглядит тяжёлой. Она просто становится частью вещи.']),
]
STEPS = [  # те же три шага, что в блоке «Пошив под заказ» на главной
    ('Референс', 'Фото, ссылка или эскиз. Для первого сообщения хватит референса, типа изделия и тиража.'),
    ('Образец', 'Лекала и первая вещь на утверждение.'),
    ('Тираж', 'Шьём партию, наносим принт, отдаём в шоуруме или отправляем.'),
]


def facts():
    fact = lambda x: isinstance(x, dict) and x.get('status') == 'fact' and x.get('value') is not None
    rows = [('Образец', TERMS['lead'].get('sample')), ('Тираж', TERMS['lead'].get('run')), ('Предоплата', TERMS['payment'].get('prepay')), ('Нанесение', TERMS['minQty'].get('print'))]
    out = []
    for k, v in rows:
        if not fact(v): continue
        val = f"от {v['value']} {v.get('unit', '')}".strip() if isinstance(v['value'], int) else str(v['value'])
        out.append(f'<div><dt>{e(k)}</dt><dd>{e(val)}</dd></div>')
    return '\n'.join(out)


def production():
    dirs = '\n'.join(f'''  <section class="dir">
    <figure class="dir__ph"><img src="{src}" alt="{e(alt)}" loading="lazy" decoding="async"></figure>
    <div class="dir__text">
      <h2><span>{i:02d}</span>{e(title)}</h2>
      {''.join(f'<p>{e(p)}</p>' for p in paras)}
    </div>
  </section>''' for i, (title, src, alt, paras) in enumerate(DIRECTIONS, 1))
    steps = '\n'.join(f'<li><b>{e(t)}</b><span>{e(d)}</span></li>' for t, d in STEPS)
    return f'''<div class="pg__top pg__top--wide">
  <h1>Производство для брендов</h1>
  <p class="pg__lead">Берём на себя весь процесс — от идеи до готового тиража.</p>
  <div class="pg__act">
    <a class="btn" href="./#sewing">Отправить задачу</a>
    <a class="pg__link" href="https://t.me/{e(MANAGER)}" target="_blank" rel="noopener">Написать в Telegram</a>
  </div>
  <nav class="pg__jump" aria-label="Направления">{''.join(f'<a href="#d{i}">{e(t[0])}</a>' for i, t in enumerate(DIRECTIONS, 1))}</nav>
</div>
<div class="dirs">
{re.sub(r'<section class="dir">', lambda m, c=iter(range(1, 9)): f'<section class="dir" id="d{next(c)}">', dirs)}
</div>
<section class="pg__band">
  <h2 class="h-block">Как работаем</h2>
  <ol class="pg__steps">
{steps}
  </ol>
  <dl class="pg__facts">
{facts()}
  </dl>
</section>
<section class="pg__cta">
  <p class="h-big">Для первого сообщения хватит референса, типа изделия и тиража.</p>
  <div class="pg__act">
    <a class="btn" href="./#sewing">Отправить задачу</a>
    <a class="pg__link" href="./#catalog">Нужны готовые бланки — в каталог</a>
  </div>
</section>'''


PAGES = {
    'oferta.html': shell('Публичная оферта', 'Договор купли-продажи товаров дистанционным способом.', legal('oferta', 'Публичная оферта', 2), 'doc'),
    'privacy.html': shell('Политика обработки персональных данных', 'Политика в отношении обработки персональных данных.', legal('privacy', 'Политика в отношении обработки персональных данных', 1), 'doc'),
    'production.html': shell('Производство для брендов', 'Коллекция и мерч под ключ, пошив, печать и вышивка на собственном производстве в Москве.', production(), 'prod'),
}
for name, page in PAGES.items():
    open(os.path.join(ROOT, name), 'w', encoding='utf-8').write(page)
    print(name, len(page))
