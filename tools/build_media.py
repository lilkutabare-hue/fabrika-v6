#!/usr/bin/env python3
"""
build_media.py — подготовка рендеров для fabrika-v6.

Читает data/media-map.json, берёт исходники из папок рендеров (их не трогает),
кладёт WebP в media/ и пишет media/manifest.json, который читает app/data.js.

    python3 tools/build_media.py            # всё, что размечено товаром
    python3 tools/build_media.py --force    # пересобрать
    python3 tools/build_media.py --only hood

Нужен только Pillow (системный python3 на маке: Pillow 11.3). cwebp и ffmpeg не нужны.

Варианты на каждый кадр:
  set  — единый холст: вещь вписана в 80 % квадрата и отцентрована (как в наборе 1400),
         поэтому в плитках все вещи одного масштаба. Ширины 600 и 1200.
  fit  — обрезка по вещи с полем 3 %: первый экран и сцена карточки. Ширины 600, 1200 и родная (до 2048).
  anim — анимированный WebP, обрезанный по вещи как fit (чтобы при наведении кадр не прыгал). Как есть, 720.
Рендеры Magnific на белом (bg: white) вырезаются: флуд-заливка белого от краёв, мягкая кромка.
Для каждого цвета считается средний цвет ткани (hex) — образцы цвета на сайте.
Имена файлов: [a-z0-9-], вид {product}-{color}-{side}-{set|fit|anim}-{width}.webp.
"""
import argparse
import json
import re
import sys
import time
import warnings
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFilter, ImageChops
except ImportError:
    sys.exit("Нужен Pillow: python3 -m pip install --user pillow")

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parent.parent
MAP = ROOT / "data" / "media-map.json"
OUT = ROOT / "media"
WIDTHS = (600, 1200)
FIT_MAX = 2048
SET_CANVAS = 1400
SET_FILL = 0.80           # вещь занимает 80 % холста по большей стороне (как в наборе 1400: 1120/1400)
QUALITY = 86
ALPHA_T = 8
MARGIN = 0.03
SLUG = re.compile(r"^[a-z0-9-]+$")


def slug(*parts):
    s = "-".join(p for p in parts if p)
    if not SLUG.match(s):
        sys.exit(f"Недопустимое имя {s!r}: только [a-z0-9-]")
    return s


def alpha_mask(im):
    return im.getchannel("A").point(lambda v: 255 if v > ALPHA_T else 0)


def bbox(im):
    return alpha_mask(im).getbbox() or (0, 0, im.width, im.height)


def trim(im, bb=None):
    bb = bb or bbox(im)
    w, h = im.size
    m = int(max(bb[2] - bb[0], bb[3] - bb[1]) * MARGIN)
    return im.crop((max(0, bb[0] - m), max(0, bb[1] - m), min(w, bb[2] + m), min(h, bb[3] + m)))


def to_set_canvas(im):
    """Вещь → квадрат SET_CANVAS, большая сторона = SET_FILL холста, центр."""
    bb = bbox(im)
    cut = im.crop(bb)
    scale = SET_CANVAS * SET_FILL / max(cut.width, cut.height)
    if scale < 1:
        cut = cut.resize((round(cut.width * scale), round(cut.height * scale)), Image.LANCZOS)
    elif scale > 1.02:
        # вверх не масштабируем — холст уменьшим под вещь, пропорция 80 % сохранится
        canvas = round(max(cut.width, cut.height) / SET_FILL)
        out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
        out.paste(cut, ((canvas - cut.width) // 2, (canvas - cut.height) // 2))
        return out
    out = Image.new("RGBA", (SET_CANVAS, SET_CANVAS), (0, 0, 0, 0))
    out.paste(cut, ((SET_CANVAS - cut.width) // 2, (SET_CANVAS - cut.height) // 2))
    return out


def cutout_white(im, white=225):
    """Рендер на белом → прозрачный. Фон = связанная с краями область «почти белого» (≥ white по min(r,g,b)),
    в неё уходит и мягкая тень под вещью. Кромка: в полосе 3 px у границы альфа тает по белизне."""
    rgb = im.convert("RGB")
    r, g, b = rgb.split()
    whiteness = ImageChops.darker(ImageChops.darker(r, g), b)        # min(r,g,b)
    near = whiteness.point(lambda v: 255 if v >= white else 0)       # кандидаты в фон
    fill = near.copy()
    W, H = fill.size
    for xy in ((0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1), (W // 2, 0), (W // 2, H - 1), (0, H // 2), (W - 1, H // 2)):
        if fill.getpixel(xy) == 255:
            ImageDraw.floodfill(fill, xy, 128)
    bg = fill.point(lambda v: 255 if v == 128 else 0)                # фон = залитое
    alpha = bg.point(lambda v: 0 if v else 255)
    band = ImageChops.difference(bg.filter(ImageFilter.MaxFilter(7)), bg)   # полоса вокруг фона внутри вещи
    soft = whiteness.point(lambda v: max(0, min(255, int((255 - v) * 255 / (255 - white + 1)))) if v >= white - 30 else 255)
    alpha = Image.composite(soft, alpha, band)
    alpha = Image.composite(alpha, Image.new("L", im.size, 0), alpha.point(lambda v: 255 if v > 0 else 0))
    out = im.convert("RGBA")
    out.putalpha(alpha)
    return out


def sample_hex(im):
    """Цвет ткани: непрозрачные пиксели центральной трети вещи, полоса 55–85 % по яркости, среднее."""
    bb = alpha_mask(im).getbbox()
    if not bb:
        return None
    x0, y0, x1, y1 = bb
    cw, ch = (x1 - x0) / 3, (y1 - y0) / 3
    region = im.crop((int(x0 + cw), int(y0 + ch), int(x1 - cw), int(y1 - ch)))
    if region.width > 400:
        region = region.resize((400, max(1, round(region.height * 400 / region.width))))
    px = [p for p in region.getdata() if p[3] == 255]
    if not px:
        return None
    px.sort(key=lambda p: p[0] * 299 + p[1] * 587 + p[2] * 114)
    band = px[int(len(px) * .55):int(len(px) * .85)] or px
    n = len(band)
    return "#%02X%02X%02X" % (sum(p[0] for p in band) // n, sum(p[1] for p in band) // n, sum(p[2] for p in band) // n)


def save_widths(im, stem, widths, force, src_mtime):
    W, H = im.size
    written = []
    for w in widths:
        out = OUT / f"{stem}-{w}.webp"
        if out.exists() and not force and out.stat().st_mtime >= src_mtime:
            written.append((w, False))
            continue
        h = round(H * w / W)
        img = im if w == W else im.resize((w, h), Image.LANCZOS)
        img.save(out, "WEBP", quality=QUALITY, method=6)
        written.append((w, True))
    return written


def entry(im, stem, widths, hexv):
    return {"src": stem, "widths": widths, "w": im.width, "h": im.height, "ratio": round(im.width / im.height, 4), "hex": hexv}


def build_static(src, it, force):
    im = Image.open(src).convert("RGBA")
    if it.get("bg") == "white":
        im = cutout_white(im)
    hexv = sample_hex(im)
    base = slug(it["product"], it["color"], it["side"])
    res = {}
    # set
    s = to_set_canvas(im)
    ws = [w for w in WIDTHS if w <= s.width] or [s.width]
    wr = save_widths(s, base + "-set", ws, force, src.stat().st_mtime)
    res["set"] = entry(s, base + "-set", ws, hexv)
    # fit
    f = trim(im)
    wf = sorted(set([w for w in WIDTHS if w <= f.width] + [min(f.width, FIT_MAX)]))
    wr += save_widths(f, base + "-fit", wf, force, src.stat().st_mtime)
    res["fit"] = entry(f, base + "-fit", wf, hexv)
    return res, wr


def build_anim(src, it, force):
    im = Image.open(src)
    n = getattr(im, "n_frames", 1)
    # объединённый bbox по всем кадрам
    union = None
    frames = []
    durations = []
    for i in range(n):
        im.seek(i)
        fr = im.convert("RGBA")
        frames.append(fr)
        durations.append(im.info.get("duration", 40))
        bb = alpha_mask(fr).getbbox()
        if bb:
            union = bb if union is None else (min(union[0], bb[0]), min(union[1], bb[1]), max(union[2], bb[2]), max(union[3], bb[3]))
    union = union or (0, 0, im.width, im.height)
    cut = [trim(fr, union) for fr in frames]
    stem = slug(it["product"], it["color"], it["side"], "anim")
    w = cut[0].width
    out = OUT / f"{stem}-{w}.webp"
    wrote = False
    if force or not out.exists() or out.stat().st_mtime < src.stat().st_mtime:
        cut[0].save(out, "WEBP", save_all=True, append_images=cut[1:], duration=durations, loop=0, quality=84, method=4)
        wrote = True
    return {"src": stem, "widths": [w], "w": cut[0].width, "h": cut[0].height, "ratio": round(cut[0].width / cut[0].height, 4), "frames": n}, [(w, wrote)]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="только товар с этим id")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    spec = json.loads(MAP.read_text(encoding="utf-8"))
    sources = {k: (ROOT / v).resolve() for k, v in spec["sources"].items()}
    OUT.mkdir(exist_ok=True)

    manifest = {"generated": time.strftime("%Y-%m-%dT%H:%M:%S"), "colors": spec.get("colors", {}), "products": {}}
    done = skipped = 0
    t0 = time.time()
    for it in spec["items"]:
        if not it.get("product"):
            skipped += 1
            continue
        if args.only and it["product"] != args.only:
            skipped += 1
            continue
        src_key, _, rel = it["file"].partition("/")
        src = sources[src_key] / rel
        if not src.exists():
            print(f"  НЕТ ФАЙЛА {src}")
            skipped += 1
            continue
        if args.dry:
            print(f"  {it['file']} → {it['product']}-{it['color']}-{it['side']}{'-anim' if it.get('anim') else ''}")
            continue
        node = manifest["products"].setdefault(it["product"], {}).setdefault(it["color"], {}).setdefault(it["side"], {})
        if it.get("anim"):
            e, wr = build_anim(src, it, args.force)
            node["anim"] = e
            print(f"  {'+' if any(w for _, w in wr) else '='} {e['src']}  {e['w']}x{e['h']}  {e['frames']} кадров")
        else:
            res, wr = build_static(src, it, args.force)
            node.update(res)
            print(f"  {'+' if any(w for _, w in wr) else '='} {it['product']}-{it['color']}-{it['side']}  set {res['set']['w']}  fit {res['fit']['w']}x{res['fit']['h']}  {res['fit']['hex']}{'  [вырезка]' if it.get('bg') else ''}")
        done += 1

    if not args.dry:
        (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
        total = sum(p.stat().st_size for p in OUT.glob("*.webp"))
        print(f"готово: {done} записей, {skipped} пропущено, {total / 1024 / 1024:.1f} МБ в media/, {time.time() - t0:.0f} с")


if __name__ == "__main__":
    main()
