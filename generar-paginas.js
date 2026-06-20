/* generar-paginas.js
 * Genera una página estática por categoría con URL limpia (/balenciaga/, /yeezy/, ...).
 * Cada página carga SOLO los productos de su categoría (mucho más liviana).
 * La home (index.html) sigue mostrando todo el catálogo.
 *
 * Uso:  node generar-paginas.js
 * Reusa: styles.css, app.js, precios.js  (no los toca)
 * Salida: index.html  +  <slug>/index.html por categoría
 */
const fs = require("fs");
const path = require("path");

// ─── Cargar datos ────────────────────────────────────────────────────────────
function load(file, varName) {
  const code = fs.readFileSync(file, "utf8").replace("const " + varName, "global." + varName);
  eval(code);
  return global[varName];
}
const PRODUCTS = load("productos.js", "PRODUCTS");
const IMGS = load("imgs-locales.js", "IMGS_LOCALES");

// ─── Estructura del menú (igual que el index original) ───────────────────────
const BRANDS = [
  { label: "Nike / Jordan", icon: "👟", cats: ["Ofertas 🔥","Air Jordan 1 High","Air Jordan 1 Mid","Air Jordan 1 Low","Air Jordan 2 / 3","Air Jordan 4","AJ4 RM / AJ312","Air Jordan 5","Air Jordan 6","Air Jordan 8–23","Air Jordan 11","Air Jordan 12","Air Jordan 13","Nike Dunk","Air Force 1","Nike Running","Basketball (Kobe/LeBron/Foam)"] },
  { label: "Adidas / Yeezy", icon: "🦴", cats: ["Adidas","Yeezy"] },
  { label: "New Balance", icon: "🔵", cats: ["New Balance"] },
  { label: "Vans", icon: "🛹", cats: ["Vans"] },
  { label: "Bape / Puma / MLB", icon: "🐍", cats: ["Bape / MLB / Puma"] },
  { label: "Balenciaga", icon: "🏷️", cats: ["Balenciaga"] },
  { label: "Lujo", icon: "👑", cats: ["Lujo (LV/Dior/OW/Gucci)"] },
  { label: "HOKA / On / ASICS", icon: "🏃", cats: ["HOKA / On / ASICS"] },
  { label: "UGG / Outdoor", icon: "🥾", cats: ["UGG / Botas / Outdoor"] },
  { label: "Niños / Sandalias", icon: "👧", cats: ["Niños / Sandalias"] },
];
const GROUP_ICONS = { "Birkenstock": "🩴", "On cloud": "☁️" };

// ─── Utilidades ──────────────────────────────────────────────────────────────
const usedSlugs = new Set();
function slugify(s) {
  let base = s.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!base) base = "cat";
  let slug = base, n = 2;
  while (usedSlugs.has(slug)) slug = base + "-" + (n++);
  usedSlugs.add(slug);
  return slug;
}
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const catCount = c => PRODUCTS.filter(p => p.cat === c).length;

// ─── Definir las páginas (secciones hoja) ────────────────────────────────────
const pages = [];
function addPage(label, icon, products) {
  const slug = slugify(label);
  pages.push({ slug, label, icon, products });
  return slug;
}

let sidebarItems = "";

// 1) Marcas curadas
for (const brand of BRANDS) {
  const cats = brand.cats.filter(c => catCount(c) > 0);
  if (!cats.length) continue;
  const total = cats.reduce((s, c) => s + catCount(c), 0);
  if (cats.length <= 1) {
    const prods = PRODUCTS.filter(p => p.cat === cats[0]);
    const slug = addPage(brand.label, brand.icon, prods);
    sidebarItems += `<a class="cat-btn" data-slug="${slug}" href="/${slug}/">${brand.icon} ${esc(brand.label)} <span class="cat-count">${total}</span></a>\n`;
  } else {
    sidebarItems += `<button class="cat-btn brand-btn" onclick="toggleSub(this)">${brand.icon} ${esc(brand.label)} <span class="cat-count">${total}</span><i class="chevron">›</i></button>\n<div class="sub-list">\n`;
    for (const c of cats) {
      const prods = PRODUCTS.filter(p => p.cat === c);
      const slug = addPage(c, brand.icon, prods);
      sidebarItems += `  <a class="sub-btn" data-slug="${slug}" href="/${slug}/">${esc(c)} <span class="cat-count">${prods.length}</span></a>\n`;
    }
    sidebarItems += `</div>\n`;
  }
}

// 2) Grupos dinámicos (productos con .group)
const groups = {};
PRODUCTS.forEach(p => { if (p.group) (groups[p.group] = groups[p.group] || new Set()).add(p.cat); });
Object.keys(groups).sort().forEach(g => {
  const cats = [...groups[g]].sort();
  const icon = GROUP_ICONS[g] || "🛍️";
  const total = PRODUCTS.filter(p => p.group === g).length;
  if (cats.length <= 1) {
    const prods = PRODUCTS.filter(p => p.group === g);
    const slug = addPage(g, icon, prods);
    sidebarItems += `<a class="cat-btn" data-slug="${slug}" href="/${slug}/">${icon} ${esc(g)} <span class="cat-count">${total}</span></a>\n`;
  } else {
    sidebarItems += `<button class="cat-btn brand-btn" onclick="toggleSub(this)">${icon} ${esc(g)} <span class="cat-count">${total}</span><i class="chevron">›</i></button>\n<div class="sub-list">\n`;
    for (const c of cats) {
      const prods = PRODUCTS.filter(p => p.group === g && p.cat === c);
      const slug = addPage(c, icon, prods);
      sidebarItems += `  <a class="sub-btn" data-slug="${slug}" href="/${slug}/">${esc(c)} <span class="cat-count">${prods.length}</span></a>\n`;
    }
    sidebarItems += `</div>\n`;
  }
});

// ─── Sidebar completo (idéntico en todas las páginas) ────────────────────────
// prefix = "" en la home, "../" en páginas de categoría (rutas relativas).
function sidebarHTML(prefix) {
  const home = prefix || "./";
  const items = sidebarItems.replace(/href="\/([^"]*)"/g, (m, p) => `href="${prefix}${p}"`);
  return `<aside class="sidebar" id="sidebar">
  <div class="logo"><a href="${home}"><h1>🐻 Bearskers</h1></a><p>Catálogo de calzado premium</p></div>
  <div class="sidebar-section">
    <div class="sidebar-label">Categorías</div>
    <a class="cat-btn" data-slug="" href="${home}">Todos <span class="cat-count">${PRODUCTS.length}</span></a>
${items}  </div>
</aside>`;
}

// ─── Plantilla de página ─────────────────────────────────────────────────────
function pageHTML({ title, desc, section, label, dataScript, prefix }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%90%BB%3C/text%3E%3C/svg%3E">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:locale" content="es_PE">
<meta name="twitter:card" content="summary">
<link rel="stylesheet" href="${prefix}styles.css">
</head>
<body data-section="${esc(section)}">
<div class="overlay" id="overlay" onclick="closeSidebar()"></div>
<div class="layout">
${sidebarHTML(prefix)}
  <div class="main">
    <div class="topbar">
      <button class="menu-btn" onclick="toggleSidebar()">☰</button>
      <div class="search-wrap">
        <span class="search-icon">🔍</span>
        <input id="search" type="text" placeholder="Buscar modelo, marca, color..." oninput="render()">
      </div>
      <div class="topbar-info">
        <span class="current-cat" id="cat-label">${esc(label)}</span>
        <span class="prod-count" id="prod-count"></span>
      </div>
    </div>
    <div class="grid-area">
      <div class="grid" id="grid"></div>
      <div class="sentinel" id="sentinel" style="display:none">Cargando más…</div>
      <div class="empty" id="empty" style="display:none"><p>🔍 No se encontraron productos</p></div>
    </div>
  </div>
</div>
<div class="modal-bg" id="modal-bg" onclick="closeModalOnBg(event)">
  <div class="modal">
    <div class="modal-head"><div class="modal-title" id="m-title"></div><button class="close-btn" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="modal-main" id="m-main"><img id="m-img" src="" referrerpolicy="no-referrer"></div>
      <div class="modal-thumbs" id="m-thumbs"></div>
    </div>
    <div class="modal-foot">
      <div><div class="modal-price" id="m-price"></div><div class="modal-note">Escríbenos para precio y tallas disponibles</div></div>
      <a id="m-wa" href="#" target="_blank" class="btn-wa-lg">💬 WhatsApp</a>
    </div>
  </div>
</div>
${dataScript}
<script src="${prefix}precios.js" defer></script>
<script src="${prefix}app.js" defer></script>
</body>
</html>`;
}

// ─── Escribir páginas de categoría ───────────────────────────────────────────
let totalBytes = 0;
for (const pg of pages) {
  const subImgs = {};
  for (const p of pg.products) { const k = String(p.id); if (IMGS[k]) subImgs[k] = IMGS[k]; }
  const dataScript = `<script>\nwindow.IMG_BASE = "../";\nconst PRODUCTS = ${JSON.stringify(pg.products)};\nconst IMGS_LOCALES = ${JSON.stringify(subImgs)};\n</script>`;
  const html = pageHTML({
    title: `${pg.label} — Bearskers`,
    desc: `${pg.label}: ${pg.products.length} modelos en Bearskers. Escríbenos por WhatsApp para precios y tallas.`,
    section: pg.slug, label: pg.label, dataScript, prefix: "../",
  });
  const dir = path.join(".", pg.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
  totalBytes += Buffer.byteLength(html);
}

// ─── Home (index.html): carga el catálogo completo desde archivos externos ───
const homeData = `<script>window.IMG_BASE = "";</script>\n<script src="imgs-locales.js" defer></script>\n<script src="productos.js" defer></script>`;
const home = pageHTML({
  title: "Catálogo Bearskers — Calzado premium",
  desc: "Catálogo Bearskers: zapatillas y calzado premium (Nike, Jordan, Adidas, Yeezy, New Balance, lujo y más). Escríbenos por WhatsApp para precios y tallas.",
  section: "", label: "Todos", dataScript: homeData, prefix: "",
});
fs.writeFileSync("index.html", home);

console.log(`✓ ${pages.length} páginas de categoría generadas`);
console.log(`✓ index.html (home) regenerado`);
console.log(`  Peso medio por página: ${(totalBytes / pages.length / 1024).toFixed(0)} KB`);
