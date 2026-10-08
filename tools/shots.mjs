#!/usr/bin/env node
// Снимки страницы через headless Chromium по CDP без библиотек (Node ≥ 22: глобальный WebSocket).
// node tools/shots.mjs <out-dir> [url]  → d-*.png (1440×900) и m-*.png (375×812) по разделам и слоям.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2] || '/tmp/fabrika-shots';
const URL0 = process.argv[3] || 'http://127.0.0.1:4180/';
mkdirSync(OUT, { recursive: true });
const cacheDir = join(homedir(), 'Library/Caches/ms-playwright');
const shell = readdirSync(cacheDir).filter(d => d.startsWith('chromium_headless_shell-')).sort().pop();
const CH = join(cacheDir, shell, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
const PORT = 9333;
const chrome = spawn(CH, ['--headless', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); break; } catch { await sleep(150); } }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

async function shot(name) {
  await sleep(500);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64'));
  console.log(' ', name);
}
async function run(prefix, w, h, mobile) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await send('Page.navigate', { url: URL0 });
  await sleep(2500);
  await evalJs('document.fonts.ready');
  await shot(`${prefix}-hero`);
  for (const sec of ['blanks', 'services', 'factory', 'terms']) {
    await evalJs(`(()=>{const el=document.getElementById('${sec}'); scrollTo(0, el.getBoundingClientRect().top + scrollY - ${mobile ? 56 : 72}); return 1})()`);
    await sleep(400);
    await evalJs(`(()=>{const el=document.getElementById('${sec}'); scrollTo(0, el.getBoundingClientRect().top + scrollY - ${mobile ? 56 : 72}); return 1})()`);
    await sleep(900);
    await shot(`${prefix}-${sec}`);
  }
  /* слои: карточка, режим принта с тестовым макетом, корзина, меню */
  await evalJs(`(async()=>{const m=await import('/app/product.js'); m.open('zhood',{color:'black'}); await new Promise(r=>setTimeout(r,1200)); return 1})()`);
  await shot(`${prefix}-product`);
  await evalJs(`(async()=>{const b=await (await fetch('/tools/test-logo.png')).blob(); const f=new File([b],'logo.png',{type:'image/png'}); const m=await import('/app/product.js'); await m.onFile(f); await new Promise(r=>setTimeout(r,900)); document.querySelector('[data-method=flock]')?.click(); await new Promise(r=>setTimeout(r,600)); return 1})()`);
  await shot(`${prefix}-print`);
  await evalJs(`(async()=>{document.querySelector('[data-add]').click(); await new Promise(r=>setTimeout(r,400)); const L=await import('/app/layers.js'); L.closeAll(); await new Promise(r=>setTimeout(r,700)); document.querySelector('[data-open-cart]').click(); await new Promise(r=>setTimeout(r,1000)); return 1})()`);
  await shot(`${prefix}-cart`);
  if (!mobile) {
    await evalJs(`(async()=>{const L=await import('/app/layers.js'); L.closeAll(); await new Promise(r=>setTimeout(r,700)); document.querySelector('[data-open-menu]').click(); await new Promise(r=>setTimeout(r,1000)); document.querySelector('[data-cat=hoodie]').dispatchEvent(new PointerEvent('pointerover',{bubbles:true})); await new Promise(r=>setTimeout(r,900)); return 1})()`);
    await shot(`${prefix}-menu`);
  }
  await evalJs(`(async()=>{const L=await import('/app/layers.js'); L.closeAll(); localStorage.clear(); return 1})()`);
}
await send('Page.enable');
await run('d', 1440, 900, false);
await run('m', 375, 812, true);
ws.close(); chrome.kill();
