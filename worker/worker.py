#!/usr/bin/env python3
"""
worker.py — приём заявок с сайта fabrika.market, DTF-раскладка по правилам xtc-dtf, отправка в чат заказов.

Что делает:
  1. HTTP: POST /api/orders (multipart: order=JSON, text=строка, file:<id>=макеты, mockup:<i>=картинки вещи с макетом)
     → папка inbox/<ID>/, ответ {"ok":true,"id":"…"}. GET /health.
  2. Telegram-бот: кладёт в чат заказов текст заявки, картинки вещей, потом результат раскладки:
     превью листа, production.pdf, QC_REPORT.txt (или причины блокировки). Команды менеджера в чате:
     /size <ID> <№ принта> <мм>  — задать ширину принта и пересобрать; /redo <ID> — пересобрать.
     Клиент, открывший бота по t.me/<бот>?start=<ID>, получает подтверждение и может дослать файлы.
  3. Раскладка: dtf-roll (reference/dtf-roll из скилла xtc-dtf) с правилами §0: ширина страницы DTF_ROLL_WIDTH
     (570), поля 5, зазор 5, 150/220 dpi, чистка кромок auto, fail-closed QC. Плёнки и вышивка в лист не идут:
     их файлы с размерами уходят отдельным сообщением «на плоттер / на вышивку».

Запуск: см. README.md рядом. Нужны только стандартная библиотека и venv dtf-roll.
"""
import io
import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
from email.message import Message
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENV = {}
for line in (HERE / '.env').read_text(encoding='utf-8').splitlines() if (HERE / '.env').exists() else []:
    line = line.strip()
    if line and not line.startswith('#') and '=' in line:
        k, v = line.split('=', 1); ENV[k.strip()] = v.strip()
cfg = lambda k, d='': os.environ.get(k) or ENV.get(k) or d

PORT = int(cfg('PORT', '4190'))
INBOX = Path(cfg('INBOX', str(HERE / 'inbox')))
DTF_ROLL = Path(os.path.expanduser(cfg('DTF_ROLL', '~/.claude/skills/xtc-dtf/reference/dtf-roll')))
ROLL_WIDTH = cfg('ROLL_WIDTH', '570')
MARGIN = cfg('MARGIN_MM', '5'); GAP = cfg('GAP_MM', '5')
BOT_TOKEN = cfg('BOT_TOKEN'); CHAT_ID = cfg('CHAT_ID')
METHODS = json.loads((HERE.parent / 'data' / 'methods.json').read_text(encoding='utf-8'))['methods'] if (HERE.parent / 'data' / 'methods.json').exists() else []
PREP = {m['id']: m.get('prep', 'dtf-roll') for m in METHODS}
NAMES = {m['id']: m['name'] for m in METHODS}
INBOX.mkdir(parents=True, exist_ok=True)
log = lambda *a: print(time.strftime('%H:%M:%S'), *a, flush=True)

# ---------------------------------------------------------------- Telegram
def tg(method, data=None, files=None):
    """Вызов Bot API. Без токена — пишем в outbox/ и в лог (локальная проверка)."""
    if not BOT_TOKEN:
        out = INBOX / '_outbox'; out.mkdir(exist_ok=True)
        (out / f"{int(time.time()*1000)}-{method}.json").write_text(json.dumps({k: (v if not isinstance(v, bytes) else f'<{len(v)} bytes>') for k, v in (data or {}).items()}, ensure_ascii=False, indent=1), encoding='utf-8')
        log('TG(off)', method, (data or {}).get('text', '')[:80] if data else '', list(files or {}))
        return None
    url = f'https://api.telegram.org/bot{BOT_TOKEN}/{method}'
    if files:
        boundary = '----fabrika' + str(int(time.time() * 1000))
        body = io.BytesIO()
        for k, v in (data or {}).items():
            body.write(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        for k, (name, blob, ctype) in files.items():
            body.write(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"; filename="{name}"\r\nContent-Type: {ctype}\r\n\r\n'.encode())
            body.write(blob); body.write(b'\r\n')
        body.write(f'--{boundary}--\r\n'.encode())
        req = urllib.request.Request(url, data=body.getvalue(), headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
    else:
        req = urllib.request.Request(url, data=urllib.parse.urlencode(data or {}).encode(), headers={'Content-Type': 'application/x-www-form-urlencoded'})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read())
    except Exception as e:
        log('TG error', method, e)
        return None

def say(text, chat=None):
    return tg('sendMessage', {'chat_id': chat or CHAT_ID, 'text': text, 'disable_web_page_preview': 'true'})
def photo(path, caption='', chat=None):
    p = Path(path); return tg('sendPhoto', {'chat_id': chat or CHAT_ID, 'caption': caption[:1000]}, {'photo': (p.name, p.read_bytes(), 'image/png')})
def doc(path, caption='', chat=None):
    p = Path(path)
    if p.stat().st_size > 48 * 1024 * 1024:
        return say(f'{caption}\nФайл {p.name} больше 48 МБ, в чат не лезет. Лежит на сервере: {p}', chat)
    ctype = {'pdf': 'application/pdf', 'png': 'image/png', 'txt': 'text/plain', 'svg': 'image/svg+xml'}.get(p.suffix[1:].lower(), 'application/octet-stream')
    return tg('sendDocument', {'chat_id': chat or CHAT_ID, 'caption': caption[:1000]}, {'document': (p.name, p.read_bytes(), ctype)})

# ---------------------------------------------------------------- заявка → лист
def order_dir(oid): return INBOX / re.sub(r'[^A-Z0-9]', '', oid.upper())

def ink_width_mm(path, width_mm):
    """Ширина краски: макет в заявке задан по рамке файла, dtf-roll режет по альфе — размеры совпадут, если файл без полей."""
    return width_mm

def prepared_art(od, path, p, n):
    """Макет, повёрнутый и отражённый как на вещи; ширина в мм пересчитывается по рамке после поворота."""
    rot = float(p.get('rotate_deg') or 0); mir = bool(p.get('mirrored'))
    w_mm = float(p['width_mm'])
    if (abs(rot) < 0.5 and not mir) or path.suffix.lower() not in ('.png', '.webp', '.tif', '.tiff'):
        return path, w_mm
    from PIL import Image
    im = Image.open(path).convert('RGBA')
    ppm = im.width / w_mm
    if mir: im = im.transpose(Image.FLIP_LEFT_RIGHT)
    if abs(rot) >= 0.5: im = im.rotate(-rot, expand=True, resample=Image.BICUBIC)   # CSS rotate по часовой = PIL против
    bb = im.getbbox()
    if bb: im = im.crop(bb)
    out = od / f'prepared-{n}.png'; im.save(out)
    return out, round(im.width / ppm, 2)

def build_manifest(od, order):
    items, missing, other = [], [], []
    n = 0
    for it in order.get('items', []):
        for p in it.get('prints', []):
            n += 1
            f = p.get('file') or {}
            fid = f.get('id')
            path = next((x for x in od.glob(f'file-{fid}.*')), None) if fid else None
            label = f"{n}. {it['product']['name']} {it.get('size','')} — {NAMES.get(p['method'], p['method'])}"
            if PREP.get(p['method'], 'dtf-roll') != 'dtf-roll':
                other.append((label, path, p)); continue
            if not path:
                missing.append(f'{label}: файла нет (клиент не загрузил или файл не дошёл)'); continue
            if not p.get('width_mm'):
                missing.append(f'{label}: нет размера в мм. Задайте: /size {order["id"]} {n} <мм>'); continue
            if f.get('type') == 'image/jpeg' or path.suffix.lower() in ('.jpg', '.jpeg'):
                missing.append(f'{label}: JPEG — для печати нужен PNG с прозрачным фоном, SVG или PDF'); continue
            src, w_mm = prepared_art(od, path, p, n)
            items.append({'name': f"{order['id']}-{n}", 'path': str(src), 'width_mm': w_mm, 'copies': int(it.get('qty', 1)), 'allow_rotate': bool(p.get('allow_rotate', True))})
    man = {'settings': {'roll_width_mm': float(ROLL_WIDTH), 'margin_mm': float(MARGIN), 'gap_mm': float(GAP), 'allow_rotate': False, 'min_dpi': 150, 'warn_dpi': 220, 'cleanup': 'auto'}, 'items': items}
    return man, missing, other

def run_dtf_roll(od, man):
    mp = od / 'manifest.json'; mp.write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding='utf-8')
    out = od / 'out'
    env = dict(os.environ, DTF_ROLL_WIDTH=str(ROLL_WIDTH))
    r = subprocess.run([str(DTF_ROLL / 'dtf-roll'), 'build', str(mp), '--out', str(out)], capture_output=True, text=True, env=env, timeout=900)
    return out, r.returncode, (r.stdout + r.stderr)[-2000:]

def summarize_qc(out):
    rep = out / 'qc_report.json'
    if not rep.exists(): return 'BLOCKED', [], None
    q = json.loads(rep.read_text(encoding='utf-8'))
    status = q.get('status') or ('PASS' if (out / 'production.pdf').exists() else 'BLOCKED')
    issues = [f"{i.get('severity','').upper()} {i.get('code')}{' [' + i['item'] + ']' if i.get('item') else ''}: {i.get('message','')}" for i in q.get('issues', [])]
    page = q.get('page') or q.get('working_page') or {}
    return status, issues, q

def process(oid, chat=None):
    od = order_dir(oid)
    order = json.loads((od / 'order.json').read_text(encoding='utf-8'))
    man, missing, other = build_manifest(od, order)
    lines = [f'Заявка {order["id"]} — раскладка DTF']
    if other:
        lines.append('')
        lines.append('Не в лист, отдельно:')
        for label, path, p in other:
            route = PREP.get(p['method'], '')
            lines.append(f'• {label} → {"плоттер" if route == "plotter" else "вышивка" if route == "embroidery" else route}; {p.get("width_mm") or p.get("scale_pct", "?")} {"мм" if p.get("width_mm") else "% ширины вещи"}' + (f'; плёнка {p["film"]["name"]}' if p.get('film') else ''))
    if missing:
        lines.append('')
        lines.append('Нужно до раскладки:')
        lines += [f'• {m}' for m in missing]
    say('\n'.join(lines), chat)
    for label, path, p in other:
        if path: doc(path, f'{order["id"]} · {label} · не DTF', chat)
    if not man['items']:
        say(f'{order["id"]}: в лист DTF класть нечего.', chat); return
    out, code, tail = run_dtf_roll(od, man)
    status, issues, q = summarize_qc(out)
    head = f'{order["id"]} · DTF лист {ROLL_WIDTH} мм: {status}'
    if q:
        pg = q.get('page_length_mm') or (q.get('layout') or {}).get('page_length_mm') or ''
        if pg: head += f', длина {pg:.0f} мм' if isinstance(pg, (int, float)) else f', длина {pg} мм'
    body = [head, f'Принтов: {len(man["items"])}, копий: {sum(i["copies"] for i in man["items"])}, поля {MARGIN}, зазор {GAP}']
    if issues: body += ['', 'Проверка:'] + [f'• {i}' for i in issues[:20]]
    if status != 'PASS' and not issues: body += ['', tail or 'dtf-roll не ответил']
    say('\n'.join(body), chat)
    if (out / 'layout_preview.png').exists(): photo(out / 'layout_preview.png', f'{order["id"]} · превью листа', chat)
    if (out / 'production.pdf').exists(): doc(out / 'production.pdf', f'{order["id"]} · production.pdf · {ROLL_WIDTH} мм · 1:1, не зеркалить', chat)
    if (out / 'QC_REPORT.txt').exists(): doc(out / 'QC_REPORT.txt', f'{order["id"]} · QC', chat)

def announce(oid):
    od = order_dir(oid)
    order = json.loads((od / 'order.json').read_text(encoding='utf-8'))
    text = (od / 'text.txt').read_text(encoding='utf-8') if (od / 'text.txt').exists() else json.dumps(order, ensure_ascii=False)
    say(text)
    for i, _ in enumerate(order.get('items', [])):
        m = next(iter(od.glob(f'mockup-{i}.*')), None)
        if m: photo(m, f'{order["id"]} · {order["items"][i]["product"]["name"]} {order["items"][i].get("size","")}')
    for f in sorted(od.glob('file-*')):
        doc(f, f'{order["id"]} · исходник макета')
    process(oid)

# ---------------------------------------------------------------- бот: команды и файлы от клиента
def poll_loop():
    if not BOT_TOKEN: log('BOT_TOKEN не задан: бот выключен, сообщения пишутся в inbox/_outbox'); return
    offset = 0
    while True:
        r = tg('getUpdates', {'offset': offset, 'timeout': 25})
        for u in (r or {}).get('result', []):
            offset = u['update_id'] + 1
            try: handle_update(u)
            except Exception as e: log('update error', e)
        time.sleep(1)

def handle_update(u):
    msg = u.get('message') or {}
    chat = msg.get('chat', {}).get('id'); text = (msg.get('text') or '').strip()
    if not chat: return
    if text.startswith('/start'):
        oid = text.split(maxsplit=1)[1].strip() if ' ' in text else ''
        od = order_dir(oid) if oid else None
        if od and (od / 'order.json').exists():
            (od / 'client-chat.txt').write_text(str(chat), encoding='utf-8')
            say(f'Заявка {oid} у нас. Если у макета нет исходника в хорошем качестве — пришлите его сюда файлом (PNG с прозрачным фоном, SVG или PDF). Менеджер ответит здесь.', chat)
            say(f'Клиент открыл бота по заявке {oid} (chat {chat}).')
        else:
            say('Это бот fabrika.market. Откройте заявку на сайте и нажмите «Отправить в бота».', chat)
        return
    if text.startswith('/size') and str(chat) == str(CHAT_ID):
        try:
            _, oid, n, mm = text.split()
            od = order_dir(oid); order = json.loads((od / 'order.json').read_text(encoding='utf-8'))
            k = 0
            for it in order['items']:
                for p in it['prints']:
                    k += 1
                    if k == int(n): p['width_mm'] = float(mm); p['height_mm'] = None
            (od / 'order.json').write_text(json.dumps(order, ensure_ascii=False, indent=1), encoding='utf-8')
            say(f'{oid}: принт {n} → {mm} мм. Пересобираю.'); threading.Thread(target=process, args=(oid,), daemon=True).start()
        except Exception as e: say(f'Формат: /size <ID> <№ принта> <мм> ({e})')
        return
    if text.startswith('/redo') and str(chat) == str(CHAT_ID):
        oid = text.split(maxsplit=1)[1].strip(); threading.Thread(target=process, args=(oid,), daemon=True).start(); return
    d = msg.get('document')
    if d:
        # файл от клиента: ищем заявку по chat id
        for od in INBOX.iterdir():
            if (od / 'client-chat.txt').exists() and (od / 'client-chat.txt').read_text().strip() == str(chat):
                f = tg('getFile', {'file_id': d['file_id']})
                if f and f.get('ok'):
                    url = f'https://api.telegram.org/file/bot{BOT_TOKEN}/{f["result"]["file_path"]}'
                    blob = urllib.request.urlopen(url, timeout=120).read()
                    name = re.sub(r'[^\w.\-]', '_', d.get('file_name', 'file'))
                    (od / f'client-{int(time.time())}-{name}').write_bytes(blob)
                    say('Файл получили, спасибо.', chat)
                    say(f'{od.name}: клиент прислал файл {name} ({len(blob)//1024} КБ). Если это исходник для печати — положите его как file-<id> и /redo {od.name}.')
                return

# ---------------------------------------------------------------- HTTP
def parse_multipart(headers, body):
    msg = BytesParser().parsebytes(b'Content-Type: ' + headers.get('Content-Type', '').encode() + b'\r\n\r\n' + body)
    out = {}
    for part in msg.walk():
        cd = part.get('Content-Disposition', '')
        if 'form-data' not in cd: continue
        name = re.search(r'name="([^"]+)"', cd); fn = re.search(r'filename="([^"]*)"', cd)
        if not name: continue
        payload = part.get_payload(decode=True)
        out[name.group(1)] = (fn.group(1), payload, part.get_content_type()) if fn else payload.decode('utf-8', 'replace')
    return out

class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*'); self.send_header('Access-Control-Allow-Headers', 'Content-Type'); self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
    def _json(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode(); self.send_response(code); self._cors(); self.send_header('Content-Type', 'application/json; charset=utf-8'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_OPTIONS(self): self.send_response(204); self._cors(); self.end_headers()
    def do_GET(self):
        if self.path.startswith('/health'): return self._json(200, {'ok': True, 'bot': bool(BOT_TOKEN), 'roll': ROLL_WIDTH, 'orders': len([p for p in INBOX.iterdir() if p.is_dir() and not p.name.startswith('_')])})
        self._json(404, {'ok': False})
    def do_POST(self):
        if not self.path.startswith('/api/orders'): return self._json(404, {'ok': False})
        n = int(self.headers.get('Content-Length', '0'))
        if n > 200 * 1024 * 1024: return self._json(413, {'ok': False, 'error': 'too large'})
        form = parse_multipart(self.headers, self.rfile.read(n))
        o = form.get('order') or '{}'
        if isinstance(o, tuple): o = o[1].decode('utf-8', 'replace')     # прислали файлом
        try: order = json.loads(o)
        except Exception: return self._json(400, {'ok': False, 'error': 'bad order json'})
        oid = str(order.get('id') or '')
        if not re.fullmatch(r'[A-Z0-9]{4,12}', oid): return self._json(400, {'ok': False, 'error': 'bad id'})
        od = order_dir(oid); od.mkdir(parents=True, exist_ok=True)
        (od / 'order.json').write_text(json.dumps(order, ensure_ascii=False, indent=1), encoding='utf-8')
        t = form.get('text'); t = t[1].decode('utf-8', 'replace') if isinstance(t, tuple) else t
        if isinstance(t, str): (od / 'text.txt').write_text(t, encoding='utf-8')
        saved = 0
        for k, v in form.items():
            if not isinstance(v, tuple): continue
            fn, blob, ctype = v
            ext = Path(fn).suffix.lower() or {'image/png': '.png', 'image/svg+xml': '.svg', 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/webp': '.webp'}.get(ctype, '.bin')
            if k.startswith('file:'): (od / f"file-{re.sub(r'[^a-z0-9]', '', k[5:])}{ext}").write_bytes(blob); saved += 1
            elif k.startswith('mockup:'): (od / f"mockup-{int(k[7:])}{ext}").write_bytes(blob); saved += 1
        log('order', oid, 'files', saved)
        threading.Thread(target=announce, args=(oid,), daemon=True).start()
        self._json(200, {'ok': True, 'id': oid, 'files': saved})
    def log_message(self, *a): pass

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'redo':
        process(sys.argv[2]); sys.exit(0)
    threading.Thread(target=poll_loop, daemon=True).start()
    log(f'worker on :{PORT}, inbox {INBOX}, dtf-roll {DTF_ROLL}, width {ROLL_WIDTH}, bot {"on" if BOT_TOKEN else "off"}')
    ThreadingHTTPServer.allow_reuse_address = True
    ThreadingHTTPServer(('0.0.0.0', PORT), H).serve_forever()
