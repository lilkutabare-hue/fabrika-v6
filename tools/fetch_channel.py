#!/usr/bin/env python3
"""Лента канала Telegram для главной: python3 tools/fetch_channel.py [канал] → data/channel.json и media/channel/.
Читает открытую страницу t.me/s/<канал> (без ключей и ботов), берёт последние посты: дату, текст, первую картинку.
Картинки кладёт к нам в media/channel/, потому что ссылки Telegram на них со временем протухают.
Сайт показывает ленту из data/channel.json; пока постов нет — приглашение подписаться.
Обновляется по расписанию: .github/workflows/channel.yml."""
import html, json, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'channel.json')
MEDIA = os.path.join(ROOT, 'media', 'channel')
LIMIT = 8
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'


def get(url, binary=False):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30) as r:
        data = r.read()
    return data if binary else data.decode('utf-8', 'replace')


def clean(fragment):
    t = re.sub(r'(?i)<br\s*/?>', '\n', fragment)
    t = html.unescape(re.sub(r'<[^>]+>', '', t))
    return re.sub(r'\n{3,}', '\n\n', re.sub(r'[ \t\xa0]+', ' ', t)).strip()


def parse(page, channel):
    meta = lambda p: (re.search(r'<meta property="og:%s" content="([^"]*)"' % p, page) or [None, ''])[1]
    about = html.unescape(meta('description'))
    posts = []
    for chunk in re.split(r'(?=<div class="tgme_widget_message_wrap)', page)[1:]:
        m = re.search(r'data-post="%s/(\d+)"' % re.escape(channel), chunk)
        if not m or 'service_message' in chunk.split('data-post=')[0]:
            continue
        text = re.search(r'(?s)<div class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>', chunk)
        photo = re.search(r"tgme_widget_message_(?:photo_wrap|video_thumb)[^>]*background-image:url\('([^']+)'\)", chunk)
        date = re.search(r'<time datetime="([^"]+)"', chunk)
        body = clean(text.group(1)) if text else ''
        if not body and not photo:
            continue
        posts.append({'id': int(m.group(1)), 'url': 'https://t.me/%s/%s' % (channel, m.group(1)),
                      'date': date.group(1) if date else '', 'text': body, '_photo': photo.group(1) if photo else ''})
    posts.sort(key=lambda p: p['id'], reverse=True)
    return {'channel': channel, 'url': 'https://t.me/' + channel, 'title': html.unescape(meta('title')),
            'about': about.split('\n\n')[0].replace('\n', ' ').strip(), 'posts': posts[:LIMIT]}


def main():
    channel = sys.argv[1] if len(sys.argv) > 1 else 'fabrikamrkt'
    feed = parse(get('https://t.me/s/' + channel), channel)
    os.makedirs(MEDIA, exist_ok=True)
    keep = set()
    for p in feed['posts']:
        src = p.pop('_photo')
        p['photo'] = ''
        if not src:
            continue
        name = '%d.jpg' % p['id']
        path = os.path.join(MEDIA, name)
        try:
            if not os.path.exists(path):
                open(path, 'wb').write(get(src, binary=True))
            p['photo'] = 'media/channel/' + name
            keep.add(name)
        except Exception as e:                       # картинка не скачалась — пост идёт без неё
            print('нет картинки у поста', p['id'], e, file=sys.stderr)
    for f in os.listdir(MEDIA):
        if f.endswith('.jpg') and f not in keep:
            os.remove(os.path.join(MEDIA, f))
    json.dump(feed, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(OUT, '· постов:', len(feed['posts']))


if __name__ == '__main__':
    main()
