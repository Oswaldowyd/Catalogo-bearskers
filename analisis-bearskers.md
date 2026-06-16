# Análisis Técnico — Catálogo Bearskers
> Fecha: Junio 2026 | Sitio: https://catalogo-bearskers.netlify.app

---

## Stack detectado

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML + CSS + JS Vanilla (sin framework) |
| Datos | `productos.js` (2465 productos, ~357 KB) + `imgs-locales.js` (~373 KB) |
| Imágenes | Proxy Netlify Function → Yupoo |
| Hosting | Netlify (free tier) |
| Build | Sin build tool (archivos estáticos directos) |
| Backend | Ninguno — todo en el cliente |

---

## 1. Puntos de mejora detectados

### 🔴 Crítico — rendimiento

**A. Carga de datos bloqueante (~730 KB de JS en el hilo principal)**

`productos.js` (357 KB) e `imgs-locales.js` (373 KB) se cargan como `<script>` síncronos antes del cierre del `<body>`. Esto bloquea el renderizado de la página completa hasta que ambos archivos terminan de descargarse y ejecutarse.

- **Impacto actual**: el usuario ve pantalla en blanco o sin productos durante 1–3 s en conexiones lentas.
- **Causa raíz**: los datos de 2465 productos + sus URLs de imagen se sirven todos de golpe.

**B. `galeria.html` de 1.2 MB en producción**

Este archivo está en el repositorio y se despliega a Netlify. No se usa en el catálogo pero ocupa ancho de banda y podría confundir.

---

### 🔴 Crítico — SEO

**A. Contenido 100% renderizado por JavaScript**

Google puede indexar JS, pero la página HTML que recibe el crawler es un shell vacío. Los 2465 productos no tienen URLs propias, no están en el HTML inicial y no tienen metadatos individuales.

- Consecuencia: el catálogo es invisible en búsquedas de producto como "Air Jordan 4 réplica".

**B. Metadatos ausentes**

```html
<!-- Nada de esto existe actualmente: -->
<meta name="description" content="...">
<meta property="og:title" content="...">
<meta property="og:image" content="...">
<link rel="canonical" href="...">
```

- Sin Open Graph, los shares en WhatsApp/Instagram no muestran preview.
- Sin description, Google genera un snippet genérico o ninguno.

**C. Sin datos estructurados (Schema.org)**

No hay `application/ld+json` con tipo `Product`. Google no puede enriquecer los resultados con precio, disponibilidad o imagen.

---

### 🟡 Importante — rendimiento de imágenes

**A. Proxy de imagen sin optimización**

Cada imagen pasa por `/.netlify/functions/img-proxy`, que reenvía el JPEG de Yupoo sin conversión ni redimensionado. Problemas:

1. **Invocaciones**: el free tier de Netlify Functions es 125 000/mes. Con 559 productos con imágenes y varios por producto, se agota fácilmente.
2. **No WebP**: se sirve JPEG puro. WebP reduce ~30–40% el tamaño.
3. **Sin `srcset`**: no hay imágenes responsivas; un móvil descarga la misma imagen que desktop.
4. **Sin rate limiting** en la función: cualquier bot puede agotar el cupo haciendo scraping de todas las URLs.

**B. Primera imagen no precargada**

Las primeras tarjetas visibles usan `loading="lazy"`. Las primeras 6–8 imágenes deberían usar `loading="eager"` o tener un `<link rel="preload">`.

---

### 🟡 Importante — accesibilidad

| Problema | Elemento | WCAG |
|---------|---------|------|
| `alt=""` en todas las imágenes de producto | `<img alt="">` | 1.1.1 (A) |
| Modal sin ARIA (`role`, `aria-modal`, `aria-labelledby`, focus trap) | `#modal-bg` | 4.1.2 (AA) |
| Botones con solo emoji sin label textual | `☰`, `🔍`, `✕` | 1.1.1 (A) |
| Input de búsqueda sin `aria-label` | `#search` | 1.3.1 (A) |
| Contraste insuficiente probable | `#888` sobre `#ede8e0` | 1.4.3 (AA) |
| Sin `prefers-reduced-motion` | Animaciones CSS/hover | 2.3.3 (AAA) |
| Sin enlace "saltar al contenido" | Layout general | 2.4.1 (A) |

---

### 🟡 Importante — seguridad

**A. Sin `netlify.toml` ni headers de seguridad**

No existe `netlify.toml`, por lo tanto Netlify no sirve ningún header de seguridad. Los siguientes están ausentes:

```
Content-Security-Policy
X-Frame-Options
X-Content-Type-Options
Referrer-Policy
Permissions-Policy
```

**B. Función img-proxy sin rate limiting**

Cualquier petición a `/.netlify/functions/img-proxy?url=...` con un host en `ALLOWED_HOSTS` se procesa sin límite. Un bot puede generar miles de invocaciones por hora.

**C. Teléfono WhatsApp expuesto en JS**

`const WA = "526699201472"` es visible en el código fuente. Menor riesgo pero podría usarse para spam.

---

### 🟠 Buenas prácticas

**A. Filtro "solo fotos" roto**

En el código existe `const soloFotos = false` hardcodeado. Si hubo un checkbox para esto, ya no funciona. Eliminarlo o implementarlo.

**B. `precios.js` inexistente silenciado con `onerror=""`**

```html
<script src="precios.js" onerror=""></script>
```

Este archivo no existe y el error se suprime. Si los precios se quieren mostrar, este archivo debería generarse; si no, la línea debería eliminarse.

**C. `galeria.html` y scripts de scraping en el deploy**

`descargar-imagenes.js`, `generar-urls-proxy.js` y `galeria.html` (1.2 MB) se despliegan a producción. Son artefactos de desarrollo que no deberían estar en el sitio público.

**D. Sin `favicon`, sin `manifest.json`, sin meta theme-color**

Detalles que afectan la percepción de profesionalismo y la experiencia en dispositivos móviles.

---

## 2. Funcionalidades a añadir (por prioridad de valor/esfuerzo)

### Impacto alto, esfuerzo bajo

**1. Filtros de ordenamiento**
Añadir un `<select>` en la topbar: "Más nuevo", "A–Z", "Con fotos primero". Solo requiere ordenar el array `curItems` antes de renderizar.

**2. Compartir producto**
Botón "Compartir" en el modal que use la Web Share API o copie al portapapeles un link de WhatsApp directo. Cero backend.

**3. Favoritos / Wishlist local**
`localStorage` para guardar IDs favoritos. Añadir corazón en la tarjeta. Sin backend, sin login.

**4. Contador del carrito (visual)**
Aunque el modelo de negocio sea WhatsApp, mostrar cuántos productos el usuario ha marcado como "quiero consultar" mejora la retención.

**5. Páginas de producto con URL propia (hash routing)**
Cambiar `openModal(id)` para actualizar `window.location.hash = '#producto-' + id`. Permite compartir links directos a un producto.

---

### Impacto alto, esfuerzo medio

**6. Filtro de precio (rango)**
Si `precios.js` se implementa con datos reales, un slider de rango de precio es el filtro más pedido en ecommerce.

**7. Búsqueda avanzada**
La búsqueda actual solo filtra `p.name` y `p.cat`. Añadir tags implícitos (color, material) y búsqueda fuzzy con una librería ligera como Fuse.js (~24 KB).

**8. Vista de lista vs. grid**
Toggle entre grid compacto y lista con más detalle. Muchos usuarios prefieren la lista para comparar.

**9. Meta tags dinámicos al abrir modal**
Cuando el usuario navega a `#producto-123`, actualizar `document.title` y los meta OG para que el share en redes muestre el producto correcto.

**10. Notificación de WhatsApp agrupada ("consultar X productos")**
Acumular N productos y enviar un único mensaje de WhatsApp con la lista completa.

---

### Impacto medio, esfuerzo medio-alto (medio plazo)

**11. Internacionalización de precios**
Mostrar precio en moneda local del usuario o con conversión aproximada.

**12. Reviews / valoraciones**
Integración simple con un servicio como Disqus o comentarios vía Netlify Forms.

**13. Buscador con autocompletado**
Usar un índice en memoria (Fuse.js) para sugerencias mientras el usuario escribe.

**14. PWA (Progressive Web App)**
Añadir `manifest.json` + Service Worker para caché offline. El catálogo es ideal para esto porque los datos son estáticos.

---

## 3. Implementación concreta — acciones priorizadas

### Sprint 1: Victorias rápidas (1–3 días)

#### 3.1 `netlify.toml` con headers de seguridad y caché

Crear `/netlify.toml`:

```toml
[build]
  publish = "."
  ignore = "echo 'No build needed'"

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=()"

[[headers]]
  for = "/productos.js"
  [headers.values]
    Cache-Control = "public, max-age=86400, stale-while-revalidate=604800"

[[headers]]
  for = "/imgs-locales.js"
  [headers.values]
    Cache-Control = "public, max-age=86400, stale-while-revalidate=604800"

[[headers]]
  for = "/.netlify/functions/img-proxy"
  [headers.values]
    Cache-Control = "public, max-age=604800"

# Excluir archivos de desarrollo del deploy
[[redirects]]
  from = "/galeria.html"
  to = "/index.html"
  status = 301
```

**Impacto medible**: Lighthouse "Best Practices" sube ~10–15 puntos. Headers de caché reducen peticiones repetidas a 0 en revisitas.

---

#### 3.2 Meta tags y Open Graph

Añadir en el `<head>` de `index.html`:

```html
<meta name="description" content="Catálogo premium de calzado Bearskers — Air Jordan, Nike Dunk, Adidas, Yeezy y más. Contáctanos por WhatsApp.">
<meta property="og:title" content="Catálogo Bearskers — Calzado Premium">
<meta property="og:description" content="2465+ modelos: Air Jordan, Nike, Adidas, Balenciaga y más.">
<meta property="og:image" content="https://catalogo-bearskers.netlify.app/og-image.jpg">
<meta property="og:url" content="https://catalogo-bearskers.netlify.app">
<meta property="og:type" content="website">
<meta name="theme-color" content="#111111">
<link rel="icon" href="/favicon.ico">
```

Crear una imagen `og-image.jpg` (1200×630 px) con el logo y 3–4 zapatillas de ejemplo.

**Impacto medible**: los shares en WhatsApp e Instagram mostrarán preview con imagen. Rastreable con inspección de URL en Facebook Debugger.

---

#### 3.3 Atributos `alt` en imágenes de productos

En la función `cardHTML()`, cambiar:

```js
// Antes:
`<img ... alt="">`

// Después:
`<img ... alt="${p.name}">`
```

Y en el modal:
```js
document.getElementById("m-img").alt = curP.name;
```

**Impacto medible**: Lighthouse Accessibility sube inmediatamente.

---

#### 3.4 ARIA en el modal

```html
<div class="modal-bg" id="modal-bg" role="dialog" aria-modal="true" aria-labelledby="m-title" ...>
```

Y en el JS de `openModal()`:
```js
// Al abrir, mover el foco al modal
document.getElementById("modal-bg").querySelector(".close-btn").focus();
// Al cerrar, devolver el foco a la tarjeta que lo abrió
```

---

#### 3.5 Rate limiting básico en img-proxy

Añadir al inicio de `img-proxy.js`:

```js
const RATE_LIMIT_MAP = new Map();
exports.handler = async (event) => {
  const ip = event.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  const now = Date.now();
  const last = RATE_LIMIT_MAP.get(ip) || 0;
  if (now - last < 200) { // max 5 req/s por IP
    return { statusCode: 429, body: 'Too many requests' };
  }
  RATE_LIMIT_MAP.set(ip, now);
  // ... resto del handler
};
```

**Nota**: el Map se resetea en cada cold start (sin estado persistente entre invocaciones). Para rate limiting robusto se necesitaría Redis/KV, pero este freno evita la mayoría de bots.

---

### Sprint 2: Mejoras de rendimiento (3–7 días)

#### 3.6 Cargar datos de forma diferida (defer)

```html
<!-- En vez de scripts síncronos: -->
<script src="imgs-locales.js" defer></script>
<script src="productos.js" defer></script>
<script defer>
  document.addEventListener("DOMContentLoaded", () => {
    buildSidebar();
    render();
  });
</script>
```

Esto permite que el HTML se parsee y el CSS se aplique antes de ejecutar los 730 KB de datos.

**Impacto medible**: FCP (First Contentful Paint) debería bajar ~0.5–1 s. Medir con Chrome DevTools → Performance o PageSpeed Insights.

---

#### 3.7 Dividir productos.js por categoría (code splitting manual)

En vez de un único `productos.js`, generar archivos por marca:
- `data/nike.js` (~720 KB → ~150 KB)
- `data/adidas.js`
- `data/other.js`

Cargar solo el archivo de la categoría activa:

```js
async function loadCategory(brand) {
  const script = document.createElement('script');
  script.src = `/data/${brand}.js`;
  script.onload = render;
  document.head.appendChild(script);
}
```

**Impacto medible**: carga inicial baja de 730 KB a ~150 KB. LCP mejora significativamente.

---

#### 3.8 Hash routing para URLs de producto

```js
function openModal(id) {
  history.pushState({id}, '', `#${id}`);
  // ... resto del modal
}
function closeModal() {
  history.back();
  // ...
}
window.addEventListener('popstate', (e) => {
  if (e.state?.id) openModal(e.state.id);
  else closeModal();
});
// Al cargar la página, abrir modal si hay hash
if (location.hash) {
  const id = parseInt(location.hash.slice(1));
  if (!isNaN(id)) openModal(id);
}
```

**Impacto medible**: tasa de rebote puede bajar al permitir links directos. Los usuarios pueden compartir productos exactos.

---

### Sprint 3: Funcionalidades nuevas (1–2 semanas)

#### 3.9 Wishlist con localStorage

```js
const WISH_KEY = 'bearskers_wish';
function getWish() { return JSON.parse(localStorage.getItem(WISH_KEY) || '[]'); }
function toggleWish(id) {
  let w = getWish();
  w = w.includes(id) ? w.filter(x=>x!==id) : [...w, id];
  localStorage.setItem(WISH_KEY, JSON.stringify(w));
  renderWishBtn(id);
}
```

Añadir botón corazón `❤️` en cada tarjeta y una categoría "Favoritos" en el sidebar.

---

#### 3.10 Consulta múltiple por WhatsApp

Acumular IDs seleccionados y ofrecer un botón flotante "Consultar X modelos":

```js
let consulta = [];
function addToConsulta(p) {
  consulta.push(p);
  updateConsultaBtn();
}
function sendConsulta() {
  const msg = consulta.map(p => `• ${p.name} (ref ${p.id})`).join('\n');
  window.open(`https://wa.me/${WA}?text=Hola! Me interesan estos modelos:\n${encodeURIComponent(msg)}`);
}
```

---

#### 3.11 Búsqueda con Fuse.js (fuzzy search)

```html
<script src="https://cdn.jsdelivr.net/npm/fuse.js@7/dist/fuse.min.js"></script>
```

```js
let fuse;
// Después de cargar PRODUCTS:
fuse = new Fuse(PRODUCTS, { keys: ['name', 'cat'], threshold: 0.3 });

function filtered() {
  if (curSearch.length > 1) {
    return fuse.search(curSearch).map(r => r.item).filter(catFilter);
  }
  return PRODUCTS.filter(catFilter);
}
```

Fuse.js pesa ~24 KB gzipped y permite encontrar "jordan" cuando el usuario escribe "jordanb" o "jordn".

---

#### 3.12 PWA básica

Crear `/manifest.json`:
```json
{
  "name": "Catálogo Bearskers",
  "short_name": "Bearskers",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ede8e0",
  "theme_color": "#111111",
  "icons": [{ "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" }]
}
```

Y un Service Worker mínimo que cachee `index.html`, `productos.js` e `imgs-locales.js` para uso offline.

---

## 4. Cómo medir el impacto de cada cambio

| Cambio | Herramienta | Métrica clave |
|--------|------------|---------------|
| Headers de caché y seguridad | [Security Headers](https://securityheaders.com) | Score A o superior |
| Meta tags / OG | [Facebook Debugger](https://developers.facebook.com/tools/debug/) | Preview correcto |
| `defer` en scripts | Chrome DevTools → Lighthouse | FCP, LCP, TBT |
| `alt` en imágenes | Lighthouse → Accessibility | Score (objetivo: >90) |
| ARIA en modal | axe DevTools (extensión) | 0 errores críticos |
| Hash routing | Google Search Console | URLs indexadas |
| Wishlist | Netlify Analytics | Páginas/sesión, tiempo en sitio |
| Fuse.js search | Netlify Analytics | Tasa de "no resultados" |
| PWA | Chrome DevTools → Application | Installable: sí |

### Baseline recomendado — hacer antes de cualquier cambio

1. Correr Lighthouse en Chrome (modo incógnito, throttling "Mobile") y guardar los scores.
2. Anotar el tiempo de carga en [PageSpeed Insights](https://pagespeed.web.dev).
3. Verificar en Google Search Console cuántas URLs están indexadas actualmente.

---

## Resumen ejecutivo

| Prioridad | Acción | Esfuerzo | Impacto |
|-----------|--------|----------|---------|
| 🔴 1 | Crear `netlify.toml` con headers y caché | 30 min | Seguridad + rendimiento en revisitas |
| 🔴 2 | Añadir meta tags y Open Graph | 30 min | SEO + shares en redes |
| 🔴 3 | `defer` en scripts de datos | 15 min | FCP/LCP −0.5 s |
| 🟡 4 | `alt` descriptivo en imágenes | 15 min | Accesibilidad +10 pts |
| 🟡 5 | ARIA en modal | 1 h | Accesibilidad, usuarios con lector de pantalla |
| 🟡 6 | Rate limiting en img-proxy | 1 h | Evitar agotamiento del free tier |
| 🟠 7 | Hash routing para productos | 2 h | Compartir links, SEO futuro |
| 🟠 8 | Wishlist con localStorage | 3 h | Retención, UX |
| 🟠 9 | Consulta múltiple WhatsApp | 2 h | Conversión |
| 🟢 10 | Fuse.js fuzzy search | 2 h | UX búsqueda |
| 🟢 11 | Code splitting por categoría | 1 día | LCP −1 s en carga inicial |
| 🟢 12 | PWA + Service Worker | 2 días | Instalable, offline |
