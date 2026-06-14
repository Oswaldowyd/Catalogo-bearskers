/**
 * descargar-imagenes.js  (v2 — sin Puppeteer, sin dependencias)
 *
 * Yupoo bloquea el hotlinking verificando el header "Referer".
 * Este script descarga las imágenes con los headers correctos vía HTTP simple.
 *
 * USO (CMD/PowerShell en esta carpeta, requiere Node 18+):
 *   node descargar-imagenes.js                → descarga los álbumes usados en catalogo.html
 *   node descargar-imagenes.js --todo         → descarga TODOS los álbumes (yupoo-albumes-reales.json)
 *   node descargar-imagenes.js --solo 103634284  → prueba con un solo álbum
 *   node descargar-imagenes.js --max 10       → cambia el nº de imágenes por álbum (default 6)
 *
 * RESULTADO:
 *   imgs/{albumId}/1.jpg ... n.jpg
 *   imgs-locales.js   → mapa albumId → rutas locales (lo usa catalogo.html)
 *   galeria.html      → solo en modo --todo
 *
 * Es REANUDABLE: si lo cortas y lo vuelves a correr, salta lo ya descargado.
 */

const fs = require('fs');
const path = require('path');

// ─── Config ────────────────────────────────────────────────────────────────
const BASE        = 'https://ptshunfeng.x.yupoo.com';
const UID         = 'ptshunfeng';
const IMGS_DIR    = path.join(__dirname, 'imgs');
const STATE_FILE  = path.join(__dirname, 'descargas.json');
const MAP_FILE    = path.join(__dirname, 'imgs-locales.js');
const CONCURRENCY = 5;      // álbumes en paralelo
const RETRIES     = 2;

const args    = process.argv.slice(2);
const MODE_ALL  = args.includes('--todo');
const soloIdx   = args.indexOf('--solo');
const SOLO_ID   = soloIdx >= 0 ? args[soloIdx + 1] : null;
const maxIdx    = args.indexOf('--max');
const MAX_IMGS  = maxIdx >= 0 ? parseInt(args[maxIdx + 1], 10) : 6;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const HEADERS_PAGE = { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9,es;q=0.8,en;q=0.7', 'Accept': 'text/html,*/*' };
const HEADERS_IMG  = { 'User-Agent': UA, 'Referer': BASE + '/' };   // ← la clave anti-403

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log   = m  => console.log(`[${new Date().toLocaleTimeString('es')}] ${m}`);

// ─── HTTP con reintentos ───────────────────────────────────────────────────
async function fetchRetry(url, headers, asBuffer = false) {
  for (let i = 0; i <= RETRIES; i++) {
    try {
      const res = await fetch(url, { headers, redirect: 'follow' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return asBuffer ? Buffer.from(await res.arrayBuffer()) : await res.text();
    } catch (e) {
      if (i === RETRIES) { log(`   ✗ ${url.slice(0, 80)} → ${e.message}`); return null; }
      await sleep(800 * (i + 1));
    }
  }
}

// ─── Extraer hashes de fotos del HTML del álbum ───────────────────────────
function extractHashes(html) {
  const re = new RegExp(`photo\\.yupoo\\.com/${UID}/([0-9a-f]+)/`, 'gi');
  const seen = new Set(); const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const h = m[1].toLowerCase();
    if (!seen.has(h)) { seen.add(h); out.push(h); }
  }
  return out;
}

// ─── Descargar un álbum completo ───────────────────────────────────────────
async function downloadAlbum(albumId, state) {
  const albumDir = path.join(IMGS_DIR, String(albumId));
  // Reanudable: si ya está completo, saltar
  if (state[albumId] && state[albumId].length > 0 &&
      state[albumId].every(p => fs.existsSync(path.join(__dirname, p)))) {
    return { albumId, paths: state[albumId], skipped: true };
  }

  const html = await fetchRetry(`${BASE}/albums/${albumId}?uid=1`, HEADERS_PAGE);
  if (!html) return { albumId, paths: [], error: 'página no accesible' };
  if (html.includes('页面未找到')) return { albumId, paths: [], error: '404' };

  const hashes = extractHashes(html).slice(0, MAX_IMGS);
  if (hashes.length === 0) return { albumId, paths: [], error: 'sin imágenes' };

  if (!fs.existsSync(albumDir)) fs.mkdirSync(albumDir, { recursive: true });
  const paths = [];

  for (let i = 0; i < hashes.length; i++) {
    const file    = path.join(albumDir, `${i + 1}.jpg`);
    const relPath = `imgs/${albumId}/${i + 1}.jpg`;
    if (fs.existsSync(file) && fs.statSync(file).size > 500) { paths.push(relPath); continue; }

    // medium → fallback a small
    let buf = await fetchRetry(`https://photo.yupoo.com/${UID}/${hashes[i]}/medium.jpg`, HEADERS_IMG, true);
    if (!buf) buf = await fetchRetry(`https://photo.yupoo.com/${UID}/${hashes[i]}/small.jpg`, HEADERS_IMG, true);
    if (buf && buf.length > 500) { fs.writeFileSync(file, buf); paths.push(relPath); }
    await sleep(120);  // cortesía con el servidor
  }

  return { albumId, paths };
}

// ─── Obtener lista de álbumes según el modo ────────────────────────────────
function getAlbumIds() {
  if (SOLO_ID) return [SOLO_ID];

  if (MODE_ALL) {
    const jsonPath = path.join(__dirname, 'yupoo-albumes-reales.json');
    if (!fs.existsSync(jsonPath)) { console.error('No existe yupoo-albumes-reales.json'); process.exit(1); }
    return Object.keys(JSON.parse(fs.readFileSync(jsonPath, 'utf-8')));
  }

  // Default: álbumes referenciados en catalogo.html
  const catPath = path.join(__dirname, 'catalogo.html');
  if (!fs.existsSync(catPath)) { console.error('No existe catalogo.html'); process.exit(1); }
  const html = fs.readFileSync(catPath, 'utf-8');
  const ids = [...new Set([...html.matchAll(/\/albums\/(\d+)/g)].map(m => m[1]))];
  return ids;
}

// ─── Generar imgs-locales.js (lo consume catalogo.html) ───────────────────
function writeMap(state) {
  const clean = Object.fromEntries(Object.entries(state).filter(([, p]) => p.length > 0));
  fs.writeFileSync(MAP_FILE,
    '// Generado por descargar-imagenes.js — NO editar a mano\n' +
    'const IMGS_LOCALES = ' + JSON.stringify(clean) + ';\n', 'utf-8');
}

// ─── Generar galeria.html (modo --todo) ────────────────────────────────────
function writeGallery(state) {
  let titles = {};
  try { titles = JSON.parse(fs.readFileSync(path.join(__dirname, 'yupoo-albumes-reales.json'), 'utf-8')); } catch (_) {}
  const items = Object.entries(state).filter(([, p]) => p.length > 0).map(([id, paths]) => {
    const t = (titles[id]?.title || id).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const imgs = paths.map(p => `<img src="${p}" loading="lazy">`).join('');
    return `<div class="card"><div class="imgs">${imgs}</div><p class="title">${t}</p><small class="id">ID: ${id}</small></div>`;
  }).join('\n');
  const total = Object.values(state).filter(p => p.length > 0).length;
  fs.writeFileSync(path.join(__dirname, 'galeria.html'), `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Galería Yupoo — Bearskers</title><style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;background:#111;color:#eee;padding:16px}
h1{text-align:center;margin-bottom:8px;font-size:1.4rem}.sub{text-align:center;color:#888;margin-bottom:24px;font-size:.9rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.card{background:#1e1e1e;border-radius:10px;overflow:hidden;padding:10px}
.imgs{display:flex;gap:4px;overflow-x:auto;padding-bottom:4px}
.imgs img{width:110px;height:110px;object-fit:cover;border-radius:6px;flex-shrink:0}
.title{font-size:12px;margin:10px 2px 4px;line-height:1.5;color:#ddd}.id{font-size:11px;color:#555;display:block;margin:0 2px}
</style></head><body><h1>Galería Yupoo — Bearskers</h1>
<p class="sub">${total} álbumes · Generado ${new Date().toLocaleDateString('es')}</p>
<div class="grid">${items}</div></body></html>`, 'utf-8');
  log(`galeria.html generado (${total} álbumes)`);
}

// ─── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  const ids = getAlbumIds();
  const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) : {};
  log(`🚀 ${ids.length} álbumes · ${MAX_IMGS} imgs/álbum · modo ${SOLO_ID ? 'solo' : MODE_ALL ? 'TODO' : 'catálogo'}`);

  if (!fs.existsSync(IMGS_DIR)) fs.mkdirSync(IMGS_DIR, { recursive: true });

  let done = 0, ok = 0, fail = 0, skip = 0;
  const queue = [...ids];

  async function worker() {
    while (queue.length) {
      const id = queue.shift();
      const r = await downloadAlbum(id, state);
      done++;
      if (r.skipped)            { skip++; }
      else if (r.paths.length)  { ok++;   log(`[${done}/${ids.length}] ${id} ✅ ${r.paths.length} imgs`); }
      else                      { fail++; log(`[${done}/${ids.length}] ${id} ⚠️  ${r.error || '0 imgs'}`); }
      state[id] = r.paths;
      if (done % 10 === 0 || queue.length === 0) {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf-8');
        writeMap(state);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));

  fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf-8');
  writeMap(state);
  if (MODE_ALL) writeGallery(state);

  log(`\n🎉 Terminado: ${ok} descargados, ${skip} ya existían, ${fail} fallos`);
  log(`   Abre catalogo.html — las imágenes ahora cargan desde imgs/`);
}

main().catch(e => { console.error('Error fatal:', e); process.exit(1); });
