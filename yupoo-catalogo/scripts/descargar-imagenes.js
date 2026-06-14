/**
 * descargar-imagenes.js — Descarga las fotos de cada álbum Yupoo a imgs/.
 *
 * Yupoo bloquea el hotlinking verificando el header "Referer"; por eso las
 * imágenes no se pueden mostrar directamente desde photo.yupoo.com en un
 * catálogo propio. Este script las descarga con los headers correctos.
 *
 * USO (Node 18+, en la carpeta del proyecto donde está config.json):
 *   node descargar-imagenes.js                  → álbumes usados en productos.js
 *   node descargar-imagenes.js --todo           → TODOS los álbumes (yupoo-albumes.json)
 *   node descargar-imagenes.js --solo 103634284 → prueba con un solo álbum
 *   node descargar-imagenes.js --max 10         → nº de imágenes por álbum (default 6)
 *
 * RESULTADO:
 *   imgs/{albumId}/1.jpg ... n.jpg
 *   imgs-locales.js  → mapa albumId → rutas locales (lo usa catalogo.html)
 *
 * Es REANUDABLE: si lo cortas y lo vuelves a correr, salta lo ya descargado.
 */
const fs = require('fs');
const path = require('path');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));
const UID         = cfg.uid;
const BASE        = `https://${UID}.x.yupoo.com`;
const IMGS_DIR    = path.join(__dirname, 'imgs');
const STATE_FILE  = path.join(__dirname, 'descargas.json');
const MAP_FILE    = path.join(__dirname, 'imgs-locales.js');
const CONCURRENCY = 5;
const RETRIES     = 2;

const args     = process.argv.slice(2);
const MODE_ALL = args.includes('--todo');
const soloIdx  = args.indexOf('--solo');
const SOLO_ID  = soloIdx >= 0 ? args[soloIdx + 1] : null;
const maxIdx   = args.indexOf('--max');
const MAX_IMGS = maxIdx >= 0 ? parseInt(args[maxIdx + 1], 10) : 6;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const HEADERS_PAGE = { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9,es;q=0.8,en;q=0.7', 'Accept': 'text/html,*/*' };
const HEADERS_IMG  = { 'User-Agent': UA, 'Referer': BASE + '/' };   // ← la clave anti-403

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log   = m  => console.log(`[${new Date().toLocaleTimeString('es')}] ${m}`);

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

// Los hashes de foto aparecen en el HTML del álbum como photo.yupoo.com/<uid>/<hash>/
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

async function downloadAlbum(albumId, state) {
  const albumDir = path.join(IMGS_DIR, String(albumId));
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
    let buf = await fetchRetry(`https://photo.yupoo.com/${UID}/${hashes[i]}/medium.jpg`, HEADERS_IMG, true);
    if (!buf) buf = await fetchRetry(`https://photo.yupoo.com/${UID}/${hashes[i]}/small.jpg`, HEADERS_IMG, true);
    if (buf && buf.length > 500) { fs.writeFileSync(file, buf); paths.push(relPath); }
    await sleep(120);  // cortesía con el servidor
  }

  return { albumId, paths };
}

function getAlbumIds() {
  if (SOLO_ID) return [SOLO_ID];
  if (MODE_ALL) {
    const p = path.join(__dirname, 'yupoo-albumes.json');
    if (!fs.existsSync(p)) { console.error('No existe yupoo-albumes.json — corre extraer-albumes.js'); process.exit(1); }
    return Object.keys(JSON.parse(fs.readFileSync(p, 'utf-8')));
  }
  const p = path.join(__dirname, 'productos.js');
  if (!fs.existsSync(p)) { console.error('No existe productos.js — corre generar-productos.py (o usa --todo)'); process.exit(1); }
  const js = fs.readFileSync(p, 'utf-8');
  return [...new Set([...js.matchAll(/"id":(\d+)/g)].map(m => m[1]))];
}

// El estado se guarda cada 10 álbumes; si el archivo quedara corrupto por un
// corte, generar-productos.py sabe reconstruir imgs-locales.js desde imgs/.
function writeMap(state) {
  const clean = Object.fromEntries(Object.entries(state).filter(([, p]) => p.length > 0));
  fs.writeFileSync(MAP_FILE,
    '// Generado por descargar-imagenes.js — NO editar a mano\n' +
    'const IMGS_LOCALES = ' + JSON.stringify(clean) + ';\n', 'utf-8');
}

async function main() {
  const ids = getAlbumIds();
  let state = {};
  try { state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) : {}; }
  catch (_) { log('descargas.json corrupto, empezando estado limpio (las fotos ya bajadas se conservan)'); }
  log(`🚀 ${ids.length} álbumes · ${MAX_IMGS} imgs/álbum · modo ${SOLO_ID ? 'solo' : MODE_ALL ? 'TODO' : 'catálogo'}`);

  if (!fs.existsSync(IMGS_DIR)) fs.mkdirSync(IMGS_DIR, { recursive: true });

  let done = 0, ok = 0, fail = 0, skip = 0;
  const queue = [...ids];

  async function worker() {
    while (queue.length) {
      const id = queue.shift();
      const r = await downloadAlbum(id, state);
      done++;
      if (r.skipped)           { skip++; }
      else if (r.paths.length) { ok++;   log(`[${done}/${ids.length}] ${id} ✅ ${r.paths.length} imgs`); }
      else                     { fail++; log(`[${done}/${ids.length}] ${id} ⚠️  ${r.error || '0 imgs'}`); }
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

  log(`\n🎉 Terminado: ${ok} descargados, ${skip} ya existían, ${fail} fallos`);
  log('   Abre catalogo.html — las imágenes ahora cargan desde imgs/');
}

main().catch(e => { console.error('Error fatal:', e); process.exit(1); });
