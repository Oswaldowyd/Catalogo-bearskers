# Cómo agregar productos de cualquier tienda Yupoo

El script `scrapear-yupoo.js` toma **cualquier** link de Yupoo, te deja elegir
**qué categorías** scrapear (solo shorts, t-shirts, etc.) y agrega esos productos
a tu catálogo (`index.html`) descargando las imágenes a tu PC.

## Uso (modo interactivo — recomendado)

Abre la terminal (CMD o PowerShell) en esta carpeta y corre:

```cmd
node scrapear-yupoo.js
```

El script te va preguntando paso a paso:

1. **Link de la tienda** — pega cualquier URL de la tienda, por ejemplo
   `https://scorpio-reps.x.yupoo.com/categories/4621443`
   (sirve cualquier página de esa tienda; solo necesita el nombre del subdominio).
2. **Categorías** — muestra la lista numerada y eliges. Puedes responder:
   - por número: `1,5,9`
   - por nombre: `shorts,t-shirt,hoodie`
   - todo: `todas`
3. **Nombre del grupo** — la etiqueta con la que aparecerán en el menú lateral
   (ej. `Ropa Scorpio`). Todas las categorías que elijas quedan agrupadas ahí.
4. **Máx. fotos por producto** — por defecto 6.

Luego baja las imágenes (con el header `Referer` que Yupoo exige) a
`imgs/<albumId>/1.jpg, 2.jpg…` y actualiza `productos.js` e `imgs-locales.js`.

Cuando termine, abre `index.html`: las nuevas categorías aparecen en el menú
lateral bajo el grupo que nombraste, junto a las de bearskers.

## Uso rápido (sin preguntas)

```cmd
node scrapear-yupoo.js --url https://scorpio-reps.x.yupoo.com/categories/4621443 --cats shorts,t-shirt --grupo "Ropa Scorpio" --max 8
```

## Cosas a saber

- **Es reanudable.** Si lo cortas (Ctrl+C) y lo vuelves a correr con las mismas
  opciones, salta lo que ya descargó.
- **No duplica.** Los álbumes que ya están en `productos.js` se omiten.
- **No borra nada.** Solo agrega; tus productos de bearskers quedan intactos.
- **Nombres.** Limpia el título (quita precio en yuanes, medidas y códigos). Las
  marcas que Yupoo censura con ⭐ quedan así (ej. `RA⭐⭐H LA⭐RE⭐`); puedes
  renombrarlas a mano en `productos.js` si quieres.
- **Solo necesita Node 18+** (sin instalar nada más; no usa Puppeteer).

## Importante para publicar en Netlify

La carpeta `imgs/` está en `.gitignore` (pesa mucho), así que NO se sube a
Netlify. Para que las imágenes se vean en el sitio publicado se usa el **proxy**
(`netlify/functions/img-proxy.js`): trae las fotos desde Yupoo sin subirlas.

**Ya no hay paso manual extra.** El scraper guarda directamente las URLs del
proxy en `imgs-locales.js`, y tanto el proxy como el generador detectan
**automáticamente la tienda** de cada producto (ptshunfeng, footaction, la que
sea). El flujo nuevo es simplemente:

```cmd
node scrapear-yupoo.js          (elige tienda y categorías)
git add productos.js imgs-locales.js
git commit -m "nueva sección"
git push
```

`index.html` detecta solo el entorno: al abrirlo en tu PC usa las fotos de la
carpeta `imgs/`; publicado en Netlify usa el proxy.

### Convertir secciones viejas que aún tienen rutas locales

Si una sección que scrapeaste antes del arreglo no carga en Netlify (sus
imágenes en `imgs-locales.js` empiezan con `imgs/...` en vez de
`/.netlify/functions/...`), conviértelas una sola vez con:

```cmd
node generar-urls-proxy.js --solo-faltantes
git add imgs-locales.js && git commit -m "proxy multi-tienda" && git push
```

(Corre eso en tu PC, que sí tiene acceso a Yupoo.) Quita `--solo-faltantes`
para regenerar TODAS las URLs del proxy desde cero.
