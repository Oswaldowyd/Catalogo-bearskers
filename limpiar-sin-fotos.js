/**
 * limpiar-sin-fotos.js — Quita del catálogo los productos sin fotos.
 * ==================================================================
 * Recorre productos.js y elimina cualquier producto cuyo id NO tenga
 * imágenes en imgs-locales.js (entrada inexistente o lista vacía).
 *
 * Hace un RESPALDO automático (productos.backup.js) antes de escribir,
 * así que si algo sale mal puedes restaurarlo.
 *
 * USO (CMD/PowerShell en esta carpeta, Node 18+):
 *   node limpiar-sin-fotos.js            → aplica la limpieza
 *   node limpiar-sin-fotos.js --dry      → solo muestra qué quitaría, sin tocar nada
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const PROD_FILE = path.join(__dirname, 'productos.js');
const MAP_FILE  = path.join(__dirname, 'imgs-locales.js');
const DRY = process.argv.includes('--dry');

function readJsConst(file, open) {
  const c = fs.readFileSync(file, 'utf-8');
  const s = c.indexOf(open);
  const e = c.lastIndexOf(open === '[' ? ']' : '}');
  if (s < 0 || e < 0) throw new Error(`No pude leer ${path.basename(file)} (¿archivo incompleto?)`);
  return JSON.parse(c.slice(s, e + 1));
}

function main() {
  if (!fs.existsSync(PROD_FILE)) { console.error('❌ No existe productos.js'); process.exit(1); }
  if (!fs.existsSync(MAP_FILE))  { console.error('❌ No existe imgs-locales.js'); process.exit(1); }

  const productos = readJsConst(PROD_FILE, '[');
  const imgs      = readJsConst(MAP_FILE, '{');

  const tieneFotos = p => {
    const a = imgs[String(p.id)];
    return Array.isArray(a) && a.length > 0;
  };

  const conFotos = productos.filter(tieneFotos);
  const sinFotos = productos.filter(p => !tieneFotos(p));

  console.log(`Total actual:        ${productos.length}`);
  console.log(`Con fotos (se quedan): ${conFotos.length}`);
  console.log(`Sin fotos (se quitan): ${sinFotos.length}`);
  if (sinFotos.length) {
    console.log('\nEjemplos que se quitarían:');
    sinFotos.slice(0, 10).forEach(p => console.log(`  - ${p.id}  ${p.name}`));
    if (sinFotos.length > 10) console.log(`  …y ${sinFotos.length - 10} más`);
  }

  if (DRY) { console.log('\n(modo --dry: no se modificó nada)'); return; }
  if (sinFotos.length === 0) { console.log('\n✅ No hay productos sin fotos. Nada que limpiar.'); return; }

  // Respaldo
  fs.copyFileSync(PROD_FILE, path.join(__dirname, 'productos.backup.js'));

  // Escribir productos.js limpio
  fs.writeFileSync(PROD_FILE,
    `// Limpiado por limpiar-sin-fotos.js — ${conFotos.length} productos (con fotos)\n` +
    'const PRODUCTS = ' + JSON.stringify(conFotos) + ';\n', 'utf-8');

  console.log(`\n✅ Listo: quité ${sinFotos.length} productos sin fotos.`);
  console.log(`   Quedaron ${conFotos.length} productos. Respaldo en productos.backup.js`);
  console.log('   Abre index.html para verificar.');
}

main();
