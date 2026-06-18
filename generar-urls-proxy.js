/**
 * generar-urls-proxy.js  (MULTI-TIENDA)
 *
 * Lee los productos de productos.js, detecta la TIENDA de cada uno desde su
 * `href` (https://<tienda>.x.yupoo.com/albums/<id>), consulta Yupoo para
 * obtener los hashes de las fotos y genera imgs-locales.js con URLs que apuntan
 * al proxy de Netlify (/.netlify/functions/img-proxy?url=...).
 *
 * Funciona con CUALQUIER tienda (ptshunfeng, footaction, etc.), no solo una.
 *
 * USO:
 *   node generar-urls-proxy.js            → todos los álbumes de productos.js
 *   node generar-urls-proxy.js --max 4    → máximo 4 fotos por álbum (default: 6)
 *   node generar-urls-proxy.js --solo-faltantes
 *                                         → solo los que aún tienen ruta local
 *                                           (imgs/...) o no tienen entrada de proxy
 *
 * Ejecutar cada vez que se agreguen productos nuevos, luego hacer git push.
 */

const fs   = require('fs');
const path = require('path');

const PROXY_BASE  = '/.netlify/functions/img-proxy?url=';
const PROD_FILE   = path.join(__dirname, 'productos.js');
const MAP_FILE    = path.join(__dirname, 'imgs-locales.js');
const STORE_DEFAULT = 'ptshunfeng';        // tienda principal (bearskers)
const CONCURRENCY = 4;
const RETRIES     = 2;

const args         = process.argv.slice(2);
const maxIdx       = args.indexOf('--max');
const MAX_IMGS     = maxIdx >= 0 ? parseInt(args[maxIdx + 1], 10) : 6;
const SOLO_FALTANTES = args.includes('--solo-faltantes');

const UA           = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const HEADERS_PAGE = { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9,es;q=0.8', 'Accept': 'text/html,*/*' };

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

// ─── Detectar la tienda (uid) de un href ─────────────────────────────────────
function storeFromHref(href) {
  const m = String(href || '').match(/https?:\/\/([^.]+)\.x\.yupoo\.com/i);
  return m ? m[1] : STORE_DEFAULT;
}

// ─── Extraer hashes de fotos del HTML del álbum, para una tienda dada ────────
function extractHashes(html, store) {
  const re = new RegExp(`photo\\.yupoo\\.com/${store}/([0-9a-f]+)/`, 'gi');
  const seen = new Set(); const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const h = m[1].toLowerCase();
    if (!seen.has(h)) { seen.add(h); out.push(h); }
  }
  return out;
}

// ─── Obtener URLs proxy para un álbum de una tienda concreta ─────────────────
async function getProxyUrls(store, albumId) {
  const base = `https://${store}.x.yupoo.com`;
  const photoBase = `https://photo.yupoo.com/${store}`;
  const html = await fetchText(`${base}/albums/${albumId}?uid=1`);
  if (!html) return [];
  if (html.includes('页面未找到')) return [];

  const hashes = extractHashes(html, store).slice(0, MAX_IMGS);
  return hashes.map(h => PROXY_BASE + encodeURIComponent(`${photoBase}/${h}/medium.jpg`));
}

// ─── Leer un `const X = ...;` existente y devolver el dato ────────────────────
function readJsConst(file, openChar) {
  if (!fs.existsSync(file)) return openChar === '[' ? [] : {};
  const c = fs.readFileSync(file, 'utf-8');
  const start = c.indexOf(openChar);
  const end   = c.lastIndexOf(openChar === '[' ? ']' : '}');
  if (start < 0 || end < 0) return openChar === '[' ? [] : {};
  try { return JSON.parse(c.slice(start, end + 1)); }
  catch (e) { log(`⚠️  No se pudo leer ${path.basename(file)} (${e.message}).`); return openChar === '[' ? [] : {}; }
}

const esProxy = arr => Array.isArray(arr) && arr.length > 0 && arr[0].startsWith(PROXY_BASE);

// ─── Main ──────────────────────────────────────────────────────────────────
(async () => {
  const productos = readJsConst(PROD_FILE, '[');
  if (!productos.length) { console.error('No hay productos en productos.js'); process.exit(1); }

  // Mapa actual (lo conservamos y solo sobreescribimos lo que reconvertimos)
  const result = readJsConst(MAP_FILE, '{');

  // Qué álbumes procesar
  let tareas = productos.map(p => ({ id: String(p.id), store: storeFromHref(p.href) }));
  if (SOLO_FALTANTES) {
    tareas = tareas.filter(t => !esProxy(result[t.id]));
  }
  // sin duplicados por id
  const vistos = new Set();
  tareas = tareas.filter(t => (vistos.has(t.id) ? false : vistos.add(t.id)));

  const porTienda = tareas.reduce((a, t) => ((a[t.store] = (a[t.store] || 0) + 1), a), {});
  log(`📦 ${tareas.length} álbumes a procesar (máx ${MAX_IMGS} fotos c/u)`);
  log(`   Tiendas: ${Object.entries(porTienda).map(([s, n]) => `${s} (${n})`).join(', ')}`);

  let done = 0, conImg = 0;
  for (let i = 0; i < tareas.length; i += CONCURRENCY) {
    const batch = tareas.slice(i, i + CONCURRENCY);
    const res = await Promise.all(batch.map(async t => ({ t, urls: await getProxyUrls(t.store, t.id) })));
    for (const { t, urls } of res) {
      if (urls.length > 0) { result[t.id] = urls; conImg++; }
      done++;
      if (done % 10 === 0 || done === tareas.length) {
        log(`  ${done}/${tareas.length} — ${conImg} con imágenes esta corrida`);
      }
    }
    await sleep(200);
  }

  // Guardar imgs-locales.js (solo entradas con al menos una imagen)
  const clean = Object.fromEntries(Object.entries(result).filter(([, u]) => Array.isArray(u) && u.length > 0));
  fs.writeFileSync(MAP_FILE,
    '// Generado por generar-urls-proxy.js (multi-tienda) — NO editar a mano\n' +
    '// URLs apuntan al proxy Netlify para evitar el bloqueo de Yupoo\n' +
    'const IMGS_LOCALES = ' + JSON.stringify(clean, null, 2) + ';\n',
    'utf-8'
  );

  log(`✅ imgs-locales.js actualizado: ${Object.keys(clean).length} álbumes con imágenes.`);
  log(`\nAhora ejecuta:`);
  log(`  git add imgs-locales.js`);
  log(`  git commit -m "proxy multi-tienda para imágenes Yupoo"`);
  log(`  git push`);
})();
