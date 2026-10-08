#!/bin/sh
# Снимки headless-Chromium: tools/shots.sh <out-dir> [url]. Экраны 1440×900 и 375×812 по якорям разделов.
OUT="${1:-/tmp/fabrika-shots}"; URL="${2:-http://127.0.0.1:4180/}"
CH=$(ls -d "$HOME"/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell | tail -1)
mkdir -p "$OUT"
shot() { "$CH" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size="$2,$3" --virtual-time-budget=5000 --screenshot="$OUT/$1.png" "$4" 2>/dev/null; }
for a in "" blanks services factory terms; do
  n=${a:-hero}
  shot "d-$n" 1440 900 "$URL#$a"
  shot "m-$n" 375 812 "$URL#$a"
done
ls "$OUT"
