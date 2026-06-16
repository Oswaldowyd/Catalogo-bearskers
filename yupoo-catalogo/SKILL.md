---
name: yupoo-catalogo
description: Crea o amplía un catálogo web de ecommerce (HTML con búsqueda, categorías y botones de WhatsApp) a partir de cualquier sitio de Yupoo (*.x.yupoo.com). Usa esta skill siempre que el usuario mencione Yupoo, un catálogo de productos de un proveedor, convertir álbumes de fotos en tienda/catálogo, descargar imágenes de Yupoo, o pida scrapear SOLO ciertas categorías/secciones (shorts, t-shirts, etc.) de una tienda — incluso si solo comparte un link x.yupoo.com sin más contexto. También para actualizar/regenerar un catálogo previo, agregar productos de otra tienda a uno existente, o limpiar productos sin fotos.
---

# Catálogo ecommerce desde Yupoo

Convierte un sitio Yupoo de proveedor (típicamente con títulos en chino) en un catálogo
HTML autónomo: sidebar de categorías, búsqueda, scroll infinito, modal de fotos,
botones de WhatsApp y precios opcionales. Funciona sin servidor — el usuario abre
`catalogo.html` directamente.

## Elige el camino según lo que pida el usuario

Hay dos formas de llenar el catálogo. Ambas escriben el MISMO formato (`productos.js`
+ `imgs-locales.js`), así que se pueden combinar en un mismo proyecto.

**A. Pipeline completo (toda la tienda, traduce del chino).** Úsalo cuando el usuario
quiere la tienda entera y los títulos vienen casi 100% en chino. Pasos: `extraer-albumes.js`
→ traducir categorías → `generar-productos.py` → `descargar-imagenes.js`. La traducción
de marca y color del Paso 3 es su gran ventaja. (Pasos 1–6 más abajo.)

**B. Scraper selectivo (`scrapear-yupoo.js`, un solo script interactivo).** Úsalo cuando
el usuario quiere SOLO ciertas categorías/secciones (p.ej. "solo shorts y t-shirts"),
cuando los títulos ya son mayormente latinos (ropa con marca/tipo en inglés), o cuando
quiere AGREGAR productos de otra tienda a un catálogo que ya existe. El script pega un
link de cualquier tienda, lista sus categorías en un menú, deja elegir cuáles, descarga
las fotos, **ignora los productos sin fotos** y mergea todo sin borrar lo anterior.
Detalles abajo en "Camino B".

Si el usuario menciona "solo X", "nada más las secciones Y", "agrega los shorts de esta
otra tienda", o comparte un link `/categories/<id>` concreto, casi siempre quiere el
**Camino B**.

## Datos que pedir al usuario antes de empezar

Pregunta (con AskUserQuestion si está disponible) lo que falte:

1. **URL de Yupoo** — algo como `https://<uid>.x.yupoo.com/albums`. El `uid` es el subdominio.
2. **Nombre de la tienda** y un slogan corto (ej. "Catálogo de calzado premium").
3. **Número de WhatsApp** con código de país, solo dígitos (ej. `51987654321`). Si no lo tiene aún, usar `TUNUMERO` y avisarle dónde cambiarlo.
4. **Idioma de los nombres de producto**: `es` o `en` (default `es`).
5. **Color de acento** (opcional, default `#e94560`).

## Estructura del proyecto que vas a crear

Trabaja en una carpeta del usuario (la carpeta seleccionada o una subcarpeta con el nombre de la tienda):

```
proyecto/
├── config.json            ← {"uid","storeName","tagline","wa","accent","lang"}
├── extraer-albumes.js     ← Camino A · copia de scripts/extraer-albumes.js
├── generar-productos.py   ← Camino A · copia de scripts/generar-productos.py
├── descargar-imagenes.js  ← Camino A · copia de scripts/descargar-imagenes.js
├── scrapear-yupoo.js      ← Camino B · copia de scripts/scrapear-yupoo.js
├── limpiar-sin-fotos.js   ← utilidad · copia de scripts/limpiar-sin-fotos.js
├── yupoo-albumes.json     ← Camino A paso 1 (álbumes crudos)
├── categorias.json        ← Camino A paso 1 (categorías en chino)
├── categorias-nombres.json← Camino A paso 2 (TÚ traduces los nombres)
├── nombres-fix.json       ← Camino A paso 3 (correcciones manuales de nombres)
├── productos.js           ← datos del catálogo (lo escriben ambos caminos)
├── imgs/                  ← fotos descargadas
├── imgs-locales.js        ← mapa de fotos
└── catalogo.html          ← el catálogo final (Paso 5)
```

Copia a la carpeta del proyecto los scripts del camino que vayas a usar (o todos) desde
`scripts/` de esta skill, y escribe `config.json` con los datos del usuario.

## Camino B — Scraper selectivo (`scrapear-yupoo.js`)

Un solo script interactivo, sin dependencias (Node 18+). Sirve para tiendas nuevas y
para agregar a un proyecto existente. Copia `scripts/scrapear-yupoo.js` al proyecto y
dile al usuario que corra, en CMD/PowerShell dentro de la carpeta:

```cmd
node scrapear-yupoo.js
```

El script le pregunta paso a paso: (1) el link de la tienda Yupoo; (2) qué categorías
scrapear — muestra un menú numerado y acepta números `1,5,9`, nombres `shorts,t-shirt`
o `todas`; (3) el nombre del grupo para el menú lateral (todas las categorías elegidas
quedan agrupadas ahí); (4) máx. fotos por producto. Luego descarga las imágenes con el
header `Referer`, **ignora los productos sin fotos** (no entran al catálogo) y mergea en
`productos.js` + `imgs-locales.js` sin tocar lo que ya había. Es reanudable y no duplica.

Modo no interactivo (útil si ya sabes los ids de categoría):

```cmd
node scrapear-yupoo.js --url https://TIENDA.x.yupoo.com/categories/<id> --cats shorts,t-shirt --grupo "Ropa X" --max 8
```

Notas importantes para este camino:
- Los productos llevan un campo `group`; el `catalogo.html` (desde el template) ya
  arma automáticamente un menú colapsable por grupo, así que las secciones nuevas
  aparecen solas. No hay que editar el HTML.
- El nombre se limpia en JS (quita precio en ¥, medidas, códigos). Las marcas que Yupoo
  censura con ⭐ quedan así; el usuario puede renombrarlas a mano en `productos.js`.
- Para títulos casi 100% en chino conviene más el **Camino A** (traduce marca y color).
- Si en el sandbox no tienes red, dale al usuario el comando para que lo corra en su PC.

## Utilidad — Limpiar productos sin fotos (`limpiar-sin-fotos.js`)

Si quedaron productos sin imágenes (p.ej. de una corrida vieja del Camino A), copia
`scripts/limpiar-sin-fotos.js` al proyecto y el usuario corre `node limpiar-sin-fotos.js`
(o `--dry` para solo ver qué quitaría). Hace respaldo en `productos.backup.js` y elimina
de `productos.js` todo producto cuyo `id` no tenga entrada en `imgs-locales.js`.

---

# Camino A — Pipeline completo (toda la tienda, con traducción)

Los Pasos 1 a 6 a continuación son el Camino A. El Paso 5 (generar `catalogo.html`) y el
Paso 6 (verificar) aplican también al Camino B.

## Paso 1 — Extraer álbumes y categorías

Primero verifica si tu shell tiene acceso a Yupoo:

```bash
node -e "fetch('https://<uid>.x.yupoo.com/albums').then(r=>console.log(r.status)).catch(e=>console.log('SIN RED'))"
```

- **Si hay red**: corre `node extraer-albumes.js` en la carpeta del proyecto. Genera
  `yupoo-albumes.json` y `categorias.json`. Verifica el conteo contra lo que muestra
  la web (cada categoría suele tener hasta 120 álbumes visibles).
- **Si no hay red** (típico en sandbox): usa tu herramienta de web_fetch sobre
  `https://<uid>.x.yupoo.com/categories` y cada `https://<uid>.x.yupoo.com/categories/<id>?page=N`
  para construir los mismos JSON tú mismo, o entrega los comandos al usuario para
  correrlos en su CMD:
  ```cmd
  cd "C:\ruta\al\proyecto"
  node extraer-albumes.js
  ```
  y continúa cuando los archivos existan.

## Paso 2 — Traducir categorías

Lee `categorias.json` (nombres en chino, ej. `"AJ4 乔4系列"` o `"特价区"`) y escribe
`categorias-nombres.json` con nombres cortos y legibles en el idioma elegido, más la
clave `_orden` con el orden del sidebar (ofertas primero, luego por familia de marca):

```json
{
  "_orden": ["4835611", "3836190", "..."],
  "4835611": "Ofertas 🔥",
  "3836190": "Air Jordan 1 High"
}
```

Criterio: nombres ≤ 30 caracteres, agrupa series obvias ("AJ8 AJ9 AJ10 AJ14..." →
"Air Jordan 8–23"). No inventes categorías que no existen.

## Paso 3 — Generar productos y revisar nombres

```bash
python generar-productos.py
```

El script limpia los títulos (extrae texto latino y códigos de modelo, traduce marca
y colores del chino) y escribe `productos.js` + `revisar.json`.

**Revisión obligatoria**: abre `revisar.json` — contiene los álbumes cuyo título era
casi 100% chino y quedaron con nombre pobre (ej. solo "UGG"). Traduce tú esos títulos
mirando `titulo_original`, escribe las correcciones en `nombres-fix.json`
(`{"albumId": "Nombre corregido"}`) y vuelve a correr el script. Los títulos de Yupoo
siguen el patrón `<modelo+color en chino> <nombre en inglés> <descripción> <código>`;
el color suele estar en el primer segmento chino.

## Paso 4 — Descargar imágenes

Las fotos NO se pueden hotlinkear (Yupoo verifica el header Referer), por eso se
descargan localmente. En sandbox sin red, da al usuario los comandos:

```cmd
cd "C:\ruta\al\proyecto"
node descargar-imagenes.js --todo
```

Avísale que: tarda (≈1-2 h para ~2,000 álbumes), es reanudable con el mismo comando,
y `--max 10` baja más fotos por álbum. Si tu shell sí tiene red, puedes correrlo tú
(empieza con `--solo <unAlbumId>` para validar).

El catálogo funciona ANTES de descargar fotos: los productos sin foto muestran un
placeholder con enlace al álbum de Yupoo, así que entrega el catálogo de inmediato y
deja las fotos como paso en segundo plano del usuario.

## Paso 5 — Generar el catálogo

Toma `assets/catalogo-template.html` de esta skill, reemplaza los placeholders y
guárdalo como `catalogo.html` en el proyecto:

| Placeholder      | Valor                                  |
|------------------|----------------------------------------|
| `__STORE_NAME__` | Nombre de la tienda (puede llevar emoji) |
| `__TAGLINE__`    | Slogan                                  |
| `__WA__`         | WhatsApp solo dígitos                   |
| `__ACCENT__`     | Color de acento (hex)                   |

El template ya espera `productos.js`, `imgs-locales.js` y un `precios.js` opcional
(`const PRECIOS = {"<albumId>": "S/ 250", ...}`) — explícale al usuario ese formato
si quiere mostrar precios.

## Paso 6 — Verificar (no te lo saltes)

```bash
node -e "const vm=require('vm'),fs=require('fs');const c={};vm.createContext(c);
vm.runInContext(fs.readFileSync('productos.js','utf8'),c);
vm.runInContext('this.P=PRODUCTS',c);
console.log(c.P.length,'productos,',new Set(c.P.map(p=>p.cat)).size,'categorías');
console.log('nombres cortos:',c.P.filter(p=>p.name.length<6).length)"
```

Comprueba: conteo de productos ≈ conteo de álbumes extraídos, 0 nombres cortos
restantes, y que las rutas de `imgs-locales.js` existen en disco. Abre o haz servir
`catalogo.html` si puedes para una verificación visual.

## Problemas conocidos

- **descargas.json corrupto** (corte a mitad de escritura): los scripts ya lo toleran;
  `generar-productos.py` reconstruye `imgs-locales.js` desde las carpetas `imgs/`.
- **0 álbumes extraídos**: Yupoo pudo cambiar su HTML. Baja una página de categoría
  con web_fetch, mira el patrón real de los enlaces `/albums/<id>` y ajusta la regex
  de `extraer-albumes.js`.
- **Catálogo lento**: nunca renderices los miles de productos de golpe; el template ya
  pagina de a 60 con IntersectionObserver — no quites eso.
- Para detalles de URLs y estructura de Yupoo, lee `references/yupoo.md`.
