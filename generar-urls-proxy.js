/**
 * generar-urls-proxy.js
 *
 * Lee los álbumes de productos.js, consulta Yupoo para obtener los hashes
 * de las fotos, y genera imgs-locales.js con URLs que apuntan al proxy
 * de Netlify (/.netlify/functions/img-proxy?url=...) en vez de rutas locales.
 *
 * USO:
 *   node generar-urls-proxy.js           → álbumes de productos.js
 *   node generar-urls-proxy.js --todo    → todos los álbumes de yupoo-albumes-reales.json
 *   node generar-urls-proxy.js --max 4   → máximo 4 fotos por álbum (default: 6)
 *
 * Ejecutar cada vez que se agreguen productos nuevos, luego hacer git push.
 */

const fs          = require('fs');
const path        = require('path');

const BASE        = 'https://ptshunfeng.x.yupoo.com';
const UID         = 'ptshunfeng';
const PHOTO_BASE  = `https://photo.yupoo.com/${UID}`;
const PROXY_BASE  = '/.netlify/functions/img-proxy?url=';
const MAP_FILE    = path.join(__dirname, 'imgs-locales.js');
const CONCURRENCY = 4;
const RETRIES     = 2;

const args      = process.argv.slice(2);
const MODE_ALL  = args.includes('--todo');
const maxIdx    = args.indexOf('--max');
const MAX_IMGS  = maxIdx >= 0 ? parseInt(args[maxIdx + 1], 10) : 6;

const UA            = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const HEADERS_PAGE  = { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9,es;q=0.8', 'Accept': 'text/html,*/*' };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log   = m  => console.log(`[${new Date().toLocaleTimeString('es')}] ${m}`);

// ─── HTTP con reintentos ───────────────────────────────────────────────────
async function fetchText(url) {
  for (let i = 0; i <= RETRIES; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS_PAGE, redirect: 'follow' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.text();
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

// ─── Obtener URLs proxy para un álbum ─────────────────────────────────────
async function getProxyUrls(albumId) {
  const html = await fetchText(`${BASE}/albums/${albumId}?uid=1`);
  if (!html) return [];
  if (html.includes('页面未找到')) return [];

  const hashes = extractHashes(html).slice(0, MAX_IMGS);
  return hashes.map(h => PROXY_BASE + encodeURIComponent(`${PHOTO_BASE}/${h}/medium.jpg`));
}

// ─── Obtener lista de álbumes ──────────────────────────────────────────────
function getAlbumIds() {
  if (MODE_ALL) {
    const jsonPath = path.join(__dirname, 'yupoo-albumes-reales.json');
    if (!fs.existsSync(jsonPath)) { console.error('No existe yupoo-albumes-reales.json'); process.exit(1); }
    return Object.keys(JSON.parse(fs.readFileSync(jsonPath, 'utf-8')));
  }

  // Default: álbumes en productos.js
  const prodPath = path.join(__dirname, 'productos.js');
  if (!fs.existsSync(prodPath)) { console.error('No existe productos.js'); process.exit(1); }
  const content = fs.readFileSync(prodPath, 'utf-8');
  const matches = [...content.matchAll(/(\d{7,})/g)].map(m => m[1]);
  // También buscar en index.html
  const htmlPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(htmlPath)) {
    const html = fs.readFileSync(htmlPath, 'utf-8');
    [...html.matchAll(/\/albums\/(\d+)/g)].forEach(m => matches.push(m[1]));
  }
  return [...new Set(matches)];
}

// ─── Main ──────────────────────────────────────────────────────────────────
(async () => {
  const albumIds = getAlbumIds();
  log(`📦 ${albumIds.length} álbumes a procesar (máx ${MAX_IMGS} fotos c/u)`);

  const result = {};
  let done = 0;

  // Procesar en lotes para no saturar Yupoo
  for (let i = 0; i < albumIds.length; i += CONCURRENCY) {
    const batch = albumIds.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async id => {
      const urls = await getProxyUrls(id);
      return { id, urls };
    }));
    for (const { id, urls } of results) {
      if (urls.length > 0) result[id] = urls;
      done++;
      if (done % 10 === 0 || done === albumIds.length) {
        log(`  ${done}/${albumIds.length} — ${Object.keys(result).length} con imágenes`);
      }
    }
    await sleep(200);
  }

  // Guardar imgs-locales.js
  const clean = Object.fromEntries(Object.entries(result).filter(([, u]) => u.length > 0));
  fs.writeFileSync(MAP_FILE,
    '// Generado por generar-urls-proxy.js — NO editar a mano\n' +
    '// URLs apuntan al proxy Netlify para evitar bloqueo de Yupoo\n' +
    'const IMGS_LOCALES = ' + JSON.stringify(clean, null, 2) + ';\n',
    'utf-8'
  );

  log(`✅ imgs-locales.js actualizado con ${Object.keys(clean).length} álbumes`);
  log(`\nAhora ejecuta:`);
  log(`  git add imgs-locales.js`);
  log(`  git commit -m "usar proxy para imágenes Yupoo"`);
  log(`  git push`);
})();
