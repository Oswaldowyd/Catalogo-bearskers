# Estructura de un sitio Yupoo (x.yupoo.com)

Referencia técnica para cuando los scripts fallen o haya que scrapear a mano.

## URLs

| Recurso | URL |
|---|---|
| Portada / álbumes destacados | `https://<uid>.x.yupoo.com/albums` |
| Lista completa de categorías | `https://<uid>.x.yupoo.com/categories` |
| Álbumes de una categoría (paginado) | `https://<uid>.x.yupoo.com/categories/<catId>?page=N` |
| Todos los álbumes (paginado) | `https://<uid>.x.yupoo.com/albums?tab=gallery&page=N` |
| Un álbum | `https://<uid>.x.yupoo.com/albums/<albumId>?uid=1` |
| Foto | `https://photo.yupoo.com/<uid>/<hash>/<tamaño>.jpg` |

- `<uid>` = subdominio (ej. `ptshunfeng`).
- `<hash>` = hex de 8-10 caracteres, aparece en el HTML del álbum.
- Tamaños de foto: `small`, `medium`, `large` (no siempre todos disponibles).
- En los listados, los enlaces a álbum llevan `referrercate=<catId>` — útil para
  saber la categoría de cada álbum.

### ⚠️ href absoluto vs relativo (causa común de "0 resultados")

Según la tienda, los `<a>` de categorías y álbumes traen el href **relativo**
(`href="/albums/123"`) o **absoluto** (`href="https://uid.x.yupoo.com/albums/123"`).
Las regex deben aceptar ambos: usa `href="[^"]*\/albums\/(\d+)` y
`href="[^"]*\/categories\/(\d+)` (con el `[^"]*` inicial), no `href="\/albums\/`.
Además el atributo `title="..."` puede ir antes o después del href dentro del tag:
captura el tag `<a ...>` completo y busca el title dentro, en vez de exigir un orden.
`scrapear-yupoo.js` y la versión nueva de `extraer-albumes.js` ya lo hacen así.

### Página de categorías

`https://<uid>.x.yupoo.com/categories` lista todas las categorías. Muchas tiendas de
ropa ya las nombran en inglés + chino (ej. `"SHORTS 短裤"`, `"T-SHIRT T恤"`); basta
quitar el chino para un nombre legible. La categoría con id `0` es "sin categoría" /
"otros" — normalmente conviene ignorarla. Cada categoría pagina con `?page=N`.
Los títulos de álbum de ropa suelen traer precio en yuan (`￥145`), el tipo de prenda
en inglés (SHORTS, HOODIE…) y la marca a veces **censurada con ⭐** (ej. `RA⭐⭐H LA⭐RE⭐`).

## Anti-hotlink

`photo.yupoo.com` devuelve 403 si la petición no lleva header `Referer` del propio
sitio Yupoo. Por eso:

- Un `<img src="https://photo.yupoo.com/...">` en una página propia NO funciona
  (el navegador manda otro Referer). `referrerpolicy="no-referrer"` tampoco ayuda.
- Solución del pipeline: descargar las fotos con `Referer: https://<uid>.x.yupoo.com/`
  y servirlas localmente desde `imgs/`.
- Proxies tipo `wsrv.nl` funcionan a veces pero son lentos y poco fiables — solo
  como último recurso.

## Títulos de álbum

Patrón típico: `<modelo y color en chino> <versión>️<nombre en inglés> <descripción china> <código de modelo>`

Ejemplo: `椰子700v3黑橘渐变 Adidas Yeezy 700V3 阿迪达斯椰子异形黑橘渐变 GY4109`

Vocabulario frecuente:

| Chino | Significado |
|---|---|
| 椰子 | Yeezy ("coco") |
| 乔1, 乔4... | AJ1, AJ4... (Jordan) |
| 倒钩 | Travis Scott ("gancho invertido") |
| 纯原 | "Pure Original" (gama alta de réplica) |
| 头层皮 | cuero de primera capa |
| 尺码 | tallas |
| 特价/福利 | oferta |
| 男款/女款/男女同款 | hombre / mujer / unisex |
| 黑白红蓝绿灰棕黄紫粉 | negro blanco rojo azul verde gris marrón amarillo morado rosa |
| 高帮/中帮/低帮 | caña alta / media / baja |

Las siglas tipo LJR, OG, GX, DT, PK, VG, Y3, S2 son nombres de fábrica/versión de
réplica — consérvalas en el nombre, los compradores las buscan.

## Paginación

Cada página de listado muestra ~20 álbumes; las categorías suelen mostrar máximo
120 (6 páginas). El fin de la paginación se detecta cuando una página no aporta
álbumes nuevos (Yupoo a veces repite la última página en vez de dar 404).
