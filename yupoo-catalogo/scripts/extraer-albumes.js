/**
 * extraer-albumes.js — Extrae todos los álbumes y categorías de un sitio Yupoo.
 *
 * USO (Node 18+, en la carpeta del proyecto donde está config.json):
 *   node extraer-albumes.js
 *
 * Lee config.json:  { "uid": "ptshunfeng", ... }
 * RESULTADO:
 *   yupoo-albumes.json   → { albumId: {title, cat} }
 *   categorias.json      → { catId: "nombre chino de la categoría" }
 *
 * Es REANUDABLE a nivel de categoría: si falla, vuelve a correrlo.
 */
const fs = require('fs');
const path = require('path');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));
const UID = cfg.uid;
const BASE = `https://${UID}.x.yupoo.com`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7', 'Accept': 'text/html,*/*' };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = m => console.log(`[${new Date().toLocaleTimeString('es')}] ${m}`);

async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.text();
    } catch (e) {
      if (i === 2) { log(`✗ ${url} → ${e.message}`); return null; }
      await sleep(1000 * (i + 1));
    }
  }
}

// Decodifica entidades HTML básicas de los títulos
function decode(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

// Extrae pares [albumId, title] del HTML de una página de listado.
// Yupoo marca cada álbum como <a ... href="/albums/<id>?..." ... title="...">
// (el orden de los atributos puede variar, por eso se analiza el tag completo)
function extractAlbums(html) {
  const out = [];
  const re = /<a\b[^>]*href="\/albums\/(\d+)\?[^"]*"[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const t = tag.match(/title="([^"]*)"/i);
    out.push([m[1], t ? decode(t[1]) : '']);
  }
  return out;
}

async function main() {
  // 1) Categorías
  const catHtml = await get(`${BASE}/categories`);
  if (!catHtml) { console.error('No se pudo acceder a ' + BASE + ' — ¿URL correcta? ¿hay internet?'); process.exit(1); }
  const cats = {};
  const reCat = /<a\b[^>]*href="\/categories\/(\d+)[^"]*"[^>]*>/gi;
  let m;
  while ((m = reCat.exec(catHtml)) !== null) {
    const tag = m[0];
    const t = tag.match(/title="([^"]*)"/i);
    if (!cats[m[1]] && t && t[1]) cats[m[1]] = decode(t[1]);
  }
  // fallback: texto interno del enlace si no hay atributo title
  if (Object.keys(cats).length === 0) {
    const reCat2 = /href="\/categories\/(\d+)[^"]*"[^>]*>([^<]{1,80})</gi;
    while ((m = reCat2.exec(catHtml)) !== null) if (!cats[m[1]]) cats[m[1]] = decode(m[2]);
  }
  log(`${Object.keys(cats).length} categorías encontradas`);
  fs.writeFileSync('categorias.json', JSON.stringify(cats, null, 2), 'utf-8');

  // 2) Álbumes por categoría (paginado)
  const albums = fs.existsSync('yupoo-albumes.json')
    ? JSON.parse(fs.readFileSync('yupoo-albumes.json', 'utf-8')) : {};
  for (const catId of Object.keys(cats)) {
    let page = 1, nuevos = 0;
    while (page <= 100) {  // tope de seguridad
      const html = await get(`${BASE}/categories/${catId}?page=${page}`);
      if (!html) break;
      const found = extractAlbums(html);
      if (found.length === 0) break;
      let added = 0;
      for (const [id, title] of found) {
        if (!albums[id]) { albums[id] = { title, cat: catId }; added++; nuevos++; }
        else if (!albums[id].cat) albums[id].cat = catId;
      }
      if (added === 0 && page > 1) break;  // página repetida = fin
      page++;
      await sleep(300);
    }
    log(`categoría ${catId} (${cats[catId].slice(0, 25)}): +${nuevos} álbumes`);
    fs.writeFileSync('yupoo-albumes.json', JSON.stringify(albums), 'utf-8');
  }

  // 3) Álbumes sin categoría (listado general)
  let page = 1, extra = 0;
  while (page <= 200) {
    const html = await get(`${BASE}/albums?tab=gallery&page=${page}`);
    if (!html) break;
    const found = extractAlbums(html);
    if (found.length === 0) break;
    let added = 0;
    for (const [id, title] of found)
      if (!albums[id]) { albums[id] = { title, cat: null }; added++; extra++; }
    if (added === 0 && page > 3) break;
    page++;
    await sleep(300);
  }
  if (extra) log(`listado general: +${extra} álbumes sin categoría`);

  fs.writeFileSync('yupoo-albumes.json', JSON.stringify(albums), 'utf-8');
  log(`🎉 Total: ${Object.keys(albums).length} álbumes → yupoo-albumes.json`);
  log('Siguiente paso: python generar-productos.py');
}

main().catch(e => { console.error('Error fatal:', e); process.exit(1); });
