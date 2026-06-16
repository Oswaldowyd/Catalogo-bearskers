/**
 * scrapear-yupoo.js — Scraper interactivo SELECTIVO para CUALQUIER tienda Yupoo
 * ============================================================================
 * Sin dependencias (Node 18+). Pega un link de Yupoo, elige QUÉ CATEGORÍAS
 * quieres (solo shorts, t-shirts, etc. — no toda la tienda) y el script:
 *   1. Lista las categorías de la tienda en un menú numerado.
 *   2. Te deja elegir cuáles scrapear (por número, por nombre o "todas").
 *   3. Baja los álbumes de esas categorías (con paginación).
 *   4. Descarga las imágenes localmente (con el header Referer que
 *      Yupoo exige) en imgs/<albumId>/1.jpg, 2.jpg ...
 *   5. Limpia los nombres, IGNORA los productos sin fotos, y MERGEA todo en
 *      productos.js e imgs-locales.js existentes (no borra lo que ya tienes).
 *
 * Cuándo usar este script en vez del pipeline completo
 * (extraer-albumes.js → generar-productos.py → descargar-imagenes.js):
 *   - Quieres SOLO ciertas secciones, no la tienda entera.
 *   - Los títulos de la tienda ya son mayormente latinos (ropa con marca/tipo
 *     en inglés). Para tiendas con títulos casi 100% en chino, el pipeline con
 *     generar-productos.py traduce mejor marca y color.
 *   - Quieres AÑADIR productos de otra tienda a un catálogo ya existente.
 * Ambos caminos escriben el mismo formato (productos.js + imgs-locales.js),
 * así que se pueden combinar en un mismo proyecto.
 *
 * USO (CMD o PowerShell, dentro de la carpeta del proyecto):
 *   node scrapear-yupoo.js
 *
 * Es REANUDABLE: si lo cortas y lo vuelves a correr, salta lo ya bajado.
 *
 * Opciones rápidas (sin menú interactivo):
 *   node scrapear-yupoo.js --url https://scorpio-reps.x.yupoo.com/categories/4621443 --cats 4621443,4618133 --grupo "Ropa Scorpio"
 *   node scrapear-yupoo.js --url ... --cats todas --max 8
 */

'use strict';

const fs       = require('fs');
const path     = require('path');
const readline = require('readline/promises');
const { stdin: input, stdout: output } = require('process');

// ─── Rutas de salida ─────────────────────────────────────────────────────────
const IMGS_DIR   = path.join(__dirname, 'imgs');
const PROD_FILE  = path.join(__dirname, 'productos.js');
const MAP_FILE   = path.join(__dirname, 'imgs-locales.js');

// ─── Config de red ─────────────────────────────────────────────────────────
const CONCURRENCY = 4;     // álbumes en paralelo al bajar fotos
const RETRIES     = 2;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log   = m  => console.log(`[${new Date().toLocaleTimeString('es')}] ${m}`);

// ─── Argumentos de línea de comando (opcionales) ───────────────────────────
function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : null;
}
const ARG_URL   = arg('url');
const ARG_CATS  = arg('cats');
const ARG_GRUPO = arg('grupo');
const ARG_MAX   = arg('max');

// ─── HTTP con reintentos ───────────────────────────────────────────────────
async function fetchRetry(url, headers, asBuffer = false) {
  for (let i = 0; i <= RETRIES; i++) {
    try {
      const res = await fetch(url, { headers, redirect: 'follow' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return asBuffer ? Buffer.from(await res.arrayBuffer()) : await res.text();
    } catch (e) {
      if (i === RETRIES) { log(`   ✗ ${String(url).slice(0, 80)} → ${e.message}`); return null; }
      await sleep(800 * (i + 1));
    }
  }
}

// ─── Utilidades ──────────────────────────────────────────────────────────────
function decode(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').trim();
}

// Extrae el uid (subdominio) de un link tipo https://scorpio-reps.x.yupoo.com/...
function parseUid(url) {
  const m = String(url).match(/https?:\/\/([^.]+)\.x\.yupoo\.com/i);
  return m ? m[1] : null;
}

// ─── Limpieza de NOMBRE de categoría ────────────────────────────────────────
// "SHORTS 短裤" -> "Shorts" ; "T-SHIRT T恤" -> "T-Shirt" ; "🔥SALE" -> "Sale"
function cleanCatName(raw) {
  let s = decode(raw);
  s = s.replace(/[一-鿿　-〿]/g, ' ');         // quita chino
  s = s.replace(/[⭐️\u{1f000}-\u{1ffff}]/gu, ' ');   // quita emojis/estrellas
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) s = decode(raw).replace(/\s+/g, ' ').trim();          // fallback
  // Title Case suave + quita letras sueltas que quedan al borrar el chino (ej "T-shirt T")
  let words = s.split(' ').filter((w, idx, arr) => !(w.length === 1 && /[A-Za-z]/.test(w) && arr.length > 1));
  if (!words.length) words = s.split(' ');
  return words.map(w => w.length > 2 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w).join(' ').trim();
}

// ─── Limpieza de NOMBRE de producto ──────────────────────────────────────────
// "￥145 RA⭐⭐H LA⭐RE⭐ SHORTS 22061613171（im 170cm 60kg ...）" -> "RA⭐⭐H LA⭐RE⭐ Shorts"
function cleanProductName(raw, catFallback, id) {
  let s = decode(raw);
  s = s.replace(/[（(][^（()）]*[)）]/g, ' ');         // quita paréntesis (im 170cm...)
  s = s.replace(/[￥¥]\s*\d+(\s*[←<]\s*\d+)?/g, ' ');  // quita precios ￥145 / ￥219←399
  s = s.replace(/[一-鿿　-〿]/g, ' '); // quita chino
  s = s.replace(/[\u{1f300}-\u{1ffff}]/gu, ' ');       // quita emojis (conserva ⭐ de marca censurada)
  s = s.replace(/\b\d{5,}\b/g, ' ');                   // quita códigos largos de modelo
  s = s.replace(/\s+/g, ' ').trim();
  // Title-case palabras de tipo de prenda que vienen en mayúsculas
  s = s.replace(/\b(SHORTS|T-SHIRT|HOODIE|TROUSERS|JACKET|SWEATER|POLO|SHIRT|VEST|HAT|BAG|SLIPPERS|SOCKS|DOWN JACKETS|SCARF|UNDERWEAR|FEMAIE STYIE)\b/g,
    m => m.split(' ').map(w => w[0] + w.slice(1).toLowerCase()).join(' '));
  if (s.replace(/[^A-Za-z⭐]/g, '').length < 3) s = `${catFallback} ${id}`; // nombre pobre -> fallback
  return s;
}

// ─── Extraer pares [albumId, title] de una página de listado ─────────────────
// Acepta href relativo (/albums/123) o absoluto (https://uid.x.yupoo.com/albums/123)
function extractAlbums(html) {
  const out = []; const seen = new Set();
  const re = /<a\b[^>]*href="[^"]*\/albums\/(\d+)[^"]*"[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const t = m[0].match(/title="([^"]*)"/i);
    out.push([id, t ? decode(t[1]) : '']);
  }
  return out;
}

// ─── Extraer hashes de fotos del HTML de un álbum ───────────────────────────
function extractHashes(html, uid) {
  const re = new RegExp(`photo\\.yupoo\\.com/${uid}/([0-9a-f]+)/`, 'gi');
  const seen = new Set(); const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const h = m[1].toLowerCase();
    if (!seen.has(h)) { seen.add(h); out.push(h); }
  }
  return out;
}

// ─── Listar categorías de la tienda ──────────────────────────────────────────
async function getCategories(base) {
  const html = await fetchRetry(`${base}/categories`, { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7', 'Accept': 'text/html,*/*' });
  if (!html) { log('   (no se pudo descargar /categories — revisa tu internet)'); return []; }
  const cats = []; const seen = new Set();
  const add = (id, raw) => {
    if (id === '0' || seen.has(id)) return;
    seen.add(id);
    cats.push({ id, raw, name: cleanCatName(raw || id) });
  };
  // 1) Enlaces <a> a /categories/<id> — href relativo o absoluto, título en cualquier orden del tag
  const re = /<a\b[^>]*href="[^"]*\/categories\/(\d+)[^"]*"[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tm = m[0].match(/title="([^"]*)"/i);
    add(m[1], tm ? decode(tm[1]) : '');
  }
  // 2) Fallback: usar el texto interno del enlace cuando no hay atributo title
  if (cats.length === 0) {
    const re2 = /href="[^"]*\/categories\/(\d+)[^"]*"[^>]*>([^<]{1,80})</gi;
    while ((m = re2.exec(html)) !== null) add(m[1], decode(m[2]));
  }
  // 3) Si aún no hay nada, guardar el HTML para diagnóstico
  if (cats.length === 0) {
    try {
      fs.writeFileSync(path.join(__dirname, 'debug-categorias.html'), html, 'utf-8');
      log('   ⚠️  Encontré la página pero no reconocí las categorías. Guardé debug-categorias.html para revisarla.');
    } catch (_) {}
  }
  return cats;
}

// ─── Bajar todos los álbumes de una categoría (paginado) ─────────────────────
async function getCategoryAlbums(base, catId) {
  const albums = {};
  let page = 1;
  while (page <= 100) {
    const html = await fetchRetry(`${base}/categories/${catId}?page=${page}`, { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7', 'Accept': 'text/html,*/*' });
    if (!html) break;
    const found = extractAlbums(html);
    if (found.length === 0) break;
    let added = 0;
    for (const [id, title] of found) if (!albums[id]) { albums[id] = title; added++; }
    if (added === 0 && page > 1) break;   // página repetida = fin
    page++;
    await sleep(250);
  }
  return albums;
}

// ─── Descargar las fotos de un álbum ─────────────────────────────────────────
async function downloadAlbumImages(uid, base, albumId, maxImgs) {
  const albumDir = path.join(IMGS_DIR, String(albumId));
  const headersImg = { 'User-Agent': UA, 'Referer': base + '/' };   // ← clave anti-403

  const html = await fetchRetry(`${base}/albums/${albumId}?uid=1`, { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7', 'Accept': 'text/html,*/*' });
  if (!html) return [];
  const hashes = extractHashes(html, uid).slice(0, maxImgs);
  if (hashes.length === 0) return [];

  if (!fs.existsSync(albumDir)) fs.mkdirSync(albumDir, { recursive: true });
  const paths = [];
  for (let i = 0; i < hashes.length; i++) {
    const file    = path.join(albumDir, `${i + 1}.jpg`);
    const relPath = `imgs/${albumId}/${i + 1}.jpg`;
    if (fs.existsSync(file) && fs.statSync(file).size > 500) { paths.push(relPath); continue; }
    let buf = await fetchRetry(`https://photo.yupoo.com/${uid}/${hashes[i]}/medium.jpg`, headersImg, true);
    if (!buf) buf = await fetchRetry(`https://photo.yupoo.com/${uid}/${hashes[i]}/small.jpg`, headersImg, true);
    if (buf && buf.length > 500) { fs.writeFileSync(file, buf); paths.push(relPath); }
    await sleep(120);
  }
  return paths;
}

// ─── Leer un `const X = ...;` existente y devolver el dato ────────────────────
function readJsConst(file, openChar) {
  if (!fs.existsSync(file)) return openChar === '[' ? [] : {};
  const c = fs.readFileSync(file, 'utf-8');
  const start = c.indexOf(openChar);
  const end   = c.lastIndexOf(openChar === '[' ? ']' : '}');
  if (start < 0 || end < 0) return openChar === '[' ? [] : {};
  try { return JSON.parse(c.slice(start, end + 1)); }
  catch (e) { log(`⚠️  No se pudo leer ${path.basename(file)} (${e.message}); empiezo vacío.`); return openChar === '[' ? [] : {}; }
}

// ─── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  const rl = readline.createInterface({ input, output });
  const ask = async (q, def) => {
    const a = (await rl.question(q)).trim();
    return a || def || '';
  };

  // 1) URL
  let url = ARG_URL || await ask('🔗 Pega el link de la tienda Yupoo: ');
  const uid = parseUid(url);
  if (!uid) { console.error('❌ No reconozco el link. Debe ser tipo https://NOMBRE.x.yupoo.com/...'); rl.close(); process.exit(1); }
  const base = `https://${uid}.x.yupoo.com`;
  log(`Tienda: ${uid}`);

  // 2) Listar categorías
  log('Buscando categorías…');
  const cats = await getCategories(base);
  if (cats.length === 0) { console.error('❌ No encontré categorías (¿sin internet o la tienda cambió su HTML?).'); rl.close(); process.exit(1); }

  console.log('\n── Categorías disponibles ──────────────────────────');
  cats.forEach((c, i) => console.log(`  ${String(i + 1).padStart(3)}. ${c.name}${c.name !== c.raw ? `   (${c.raw})` : ''}  [${c.id}]`));
  console.log('────────────────────────────────────────────────────\n');

  // 3) Selección
  let sel = ARG_CATS || await ask('👉 ¿Cuáles scrapear? (números "1,5,7", nombres "shorts,t-shirt", o "todas"): ', 'todas');
  let chosen;
  if (/^todas?$/i.test(sel.trim())) {
    chosen = cats.slice();
  } else {
    const tokens = sel.split(',').map(t => t.trim()).filter(Boolean);
    chosen = [];
    for (const t of tokens) {
      if (/^\d+$/.test(t)) {
        // ¿es un índice del menú o un id de categoría?
        const asIdx = cats[parseInt(t, 10) - 1];
        const asId  = cats.find(c => c.id === t);
        const pick = asId || asIdx;
        if (pick && !chosen.includes(pick)) chosen.push(pick);
      } else {
        cats.filter(c => (c.name + ' ' + c.raw).toLowerCase().includes(t.toLowerCase()))
            .forEach(c => { if (!chosen.includes(c)) chosen.push(c); });
      }
    }
  }
  if (chosen.length === 0) { console.error('❌ No seleccionaste ninguna categoría válida.'); rl.close(); process.exit(1); }
  log(`Seleccionadas: ${chosen.map(c => c.name).join(', ')}`);

  // 4) Grupo para el sidebar + máx fotos
  const defGroup = `${uid.replace(/[-_]/g, ' ').replace(/\b\w/g, m => m.toUpperCase())}`;
  const grupo  = ARG_GRUPO || await ask(`🏷️  Nombre del grupo en el menú lateral [${defGroup}]: `, defGroup);
  const maxStr = ARG_MAX   || await ask('🖼️  Máx. fotos por producto [6]: ', '6');
  const MAX_IMGS = Math.max(1, parseInt(maxStr, 10) || 6);
  rl.close();

  // 5) Recolectar álbumes de las categorías elegidas
  if (!fs.existsSync(IMGS_DIR)) fs.mkdirSync(IMGS_DIR, { recursive: true });
  const productos = readJsConst(PROD_FILE, '[');
  const idsExistentes = new Set(productos.map(p => String(p.id)));
  const imgsMap = readJsConst(MAP_FILE, '{');

  const aProcesar = [];   // {id, cat, name}
  for (const cat of chosen) {
    log(`Listando álbumes de "${cat.name}"…`);
    const albums = await getCategoryAlbums(base, cat.id);
    const ids = Object.keys(albums);
    log(`  → ${ids.length} álbumes en "${cat.name}"`);
    for (const id of ids) {
      if (idsExistentes.has(id)) continue;            // ya está en el catálogo
      aProcesar.push({ id, cat: cat.name, name: cleanProductName(albums[id], cat.name, id), href: `${base}/albums/${id}` });
      idsExistentes.add(id);
    }
  }
  log(`🧮 ${aProcesar.length} productos nuevos por descargar.`);

  // 6) Descargar imágenes (en paralelo) y agregar al catálogo.
  //    Un producto SOLO entra al catálogo si descargó al menos una foto.
  let done = 0, ok = 0, sinImg = 0;
  const queue = [...aProcesar];
  function persist() {
    fs.writeFileSync(PROD_FILE,
      `// Generado/actualizado por scrapear-yupoo.js — ${productos.length} productos\n` +
      'const PRODUCTS = ' + JSON.stringify(productos) + ';\n', 'utf-8');
    fs.writeFileSync(MAP_FILE,
      '// Generado/actualizado por scrapear-yupoo.js — NO editar a mano\n' +
      'const IMGS_LOCALES = ' + JSON.stringify(imgsMap) + ';\n', 'utf-8');
  }
  async function worker() {
    while (queue.length) {
      const p = queue.shift();
      const paths = await downloadAlbumImages(uid, base, p.id, MAX_IMGS);
      done++;
      if (paths.length) {
        imgsMap[p.id] = paths; ok++;
        productos.push({ id: Number(p.id), cat: p.cat, name: p.name, href: p.href, group: grupo });
        log(`[${done}/${aProcesar.length}] ${p.id} ✅ ${paths.length} fotos — ${p.name.slice(0, 40)}`);
      } else {
        sinImg++;   // sin fotos → se ignora, no se agrega al catálogo
        log(`[${done}/${aProcesar.length}] ${p.id} ⛔ sin fotos, ignorado — ${p.name.slice(0, 40)}`);
      }
      if (done % 10 === 0) persist();
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length || 1) }, worker));
  persist();

  log(`\n🎉 Listo: ${ok} agregados con fotos, ${sinImg} ignorados (sin fotos). Total en catálogo: ${productos.length} productos.`);
  log('   Abre catalogo.html — las categorías nuevas aparecen en el menú lateral bajo el grupo "' + grupo + '".');
}

main().catch(e => { console.error('Error fatal:', e); process.exit(1); });
