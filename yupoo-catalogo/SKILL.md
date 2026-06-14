---
name: yupoo-catalogo
description: Crea un catálogo web de ecommerce completo (HTML con búsqueda, categorías y botones de WhatsApp) a partir de cualquier sitio de Yupoo (*.x.yupoo.com). Usa esta skill siempre que el usuario mencione Yupoo, un catálogo de productos de un proveedor, convertir álbumes de fotos en tienda/catálogo, o pida descargar imágenes de Yupoo — incluso si solo comparte un link x.yupoo.com sin más contexto. También para actualizar o regenerar un catálogo creado previamente con esta skill.
---

# Catálogo ecommerce desde Yupoo

Convierte un sitio Yupoo de proveedor (típicamente con títulos en chino) en un catálogo
HTML autónomo: sidebar de categorías, búsqueda, scroll infinito, modal de fotos,
botones de WhatsApp y precios opcionales. Funciona sin servidor — el usuario abre
`catalogo.html` directamente.

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
├── extraer-albumes.js     ← copia de scripts/extraer-albumes.js
├── descargar-imagenes.js  ← copia de scripts/descargar-imagenes.js
├── generar-productos.py   ← copia de scripts/generar-productos.py
├── yupoo-albumes.json     ← paso 1 (álbumes crudos)
├── categorias.json        ← paso 1 (categorías en chino)
├── categorias-nombres.json← paso 2 (TÚ traduces los nombres)
├── nombres-fix.json       ← paso 3 (correcciones manuales de nombres)
├── productos.js           ← paso 3 (datos del catálogo)
├── imgs/                  ← paso 4 (fotos descargadas)
├── imgs-locales.js        ← paso 4 (mapa de fotos)
└── catalogo.html          ← paso 5 (el catálogo final)
```

Copia los tres scripts desde `scripts/` de esta skill a la carpeta del proyecto y
escribe `config.json` con los datos del usuario.

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
