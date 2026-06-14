# -*- coding: utf-8 -*-
"""
generar-productos.py — Convierte yupoo-albumes.json en productos.js para el catálogo.

USO (en la carpeta del proyecto):
    python generar-productos.py

Lee:
    config.json             → {"uid", "lang": "es"|"en", ...}
    yupoo-albumes.json      → {albumId: {title, cat}}  (de extraer-albumes.js)
                              también acepta el formato {albumId: {title, href}}
    categorias-nombres.json → {catId: "Nombre legible", "_orden": [catId,...]}  (lo escribe Claude)
    nombres-fix.json        → {albumId: "Nombre corregido"}  (opcional, correcciones manuales)

Escribe:
    productos.js     → const PRODUCTS = [...]
    revisar.json     → álbumes cuyo nombre quedó dudoso (para que Claude los corrija)
    imgs-locales.js  → reconstruido desde imgs/ si falta o está vacío (autoreparación)
"""
import json, re, os, sys

def load(fn, default=None):
    if os.path.exists(fn):
        with open(fn, encoding='utf-8') as f: return json.load(f)
    return default

cfg = load('config.json', {})
UID = cfg.get('uid', '')
LANG = cfg.get('lang', 'es')

alb = load('yupoo-albumes.json')
if alb is None:
    sys.exit('Falta yupoo-albumes.json — corre primero: node extraer-albumes.js')

catnames = load('categorias-nombres.json', {})
orden = catnames.pop('_orden', list(catnames.keys()))
fixes = load('nombres-fix.json', {})

OTROS = 'Otros' if LANG == 'es' else 'Other'

BRANDS = [('万斯','Vans'),('椰子','Yeezy'),('巴黎世家','Balenciaga'),('耐克','Nike'),
 ('阿迪达斯','Adidas'),('迪奥','Dior'),('麦昆','McQueen'),('古驰','Gucci'),('普拉达','Prada'),
 ('爱马仕','Hermes'),('新百伦','New Balance'),('彪马','Puma'),('匡威','Converse'),
 ('昂跑','On'),('亚瑟士','ASICS'),('勃肯','Birkenstock'),('科比','Kobe'),('詹姆斯','LeBron'),
 ('莫兰特','Ja Morant'),('空军一号','Air Force 1'),('乔丹','Jordan')]

COLORS_ES = [('黑','Negro'),('白','Blanco'),('酒红','Vino'),('红','Rojo'),('藏青','Azul marino'),
 ('蓝','Azul'),('军绿','Verde militar'),('绿','Verde'),('灰','Gris'),('棕','Marrón'),
 ('褐','Marrón'),('黄','Amarillo'),('紫','Morado'),('粉','Rosa'),('橙','Naranja'),
 ('橘','Naranja'),('米','Beige'),('杏','Beige'),('金','Dorado'),('银','Plateado'),
 ('奶','Crema'),('卡其','Caqui')]
COLORS_EN = [('黑','Black'),('白','White'),('酒红','Wine'),('红','Red'),('藏青','Navy'),
 ('蓝','Blue'),('军绿','Army Green'),('绿','Green'),('灰','Grey'),('棕','Brown'),
 ('褐','Brown'),('黄','Yellow'),('紫','Purple'),('粉','Pink'),('橙','Orange'),
 ('橘','Orange'),('米','Beige'),('杏','Beige'),('金','Gold'),('银','Silver'),
 ('奶','Cream'),('卡其','Khaki')]
COLORS = COLORS_ES if LANG == 'es' else COLORS_EN
COLOR_WORDS = r'(negro|blanco|rojo|azul|verde|gris|black|white|red|blue|green|grey|gray|pink|purple|brown|navy|cream|beige|oreo|panda|bred|mocha|chicago)'

def clean(title):
    """Extrae lo legible (latín + códigos) de un título chino-inglés de Yupoo,
    añade marca y colores traducidos cuando el título casi no tiene texto latino."""
    t = re.sub(r'[\U0001F000-\U0001FAFF☀-➿️‍]', ' ', title)
    first_cjk = re.split(r'[A-Za-z]{2,}', t)[0]      # segmento chino inicial → suele tener el color
    runs = re.findall(r"[A-Za-z0-9][A-Za-z0-9.'’\"“”&×+:/\-]*", t)
    seen, toks = set(), []
    for r in runs:
        r = r.strip(".:/-'’\"“”")
        if not r: continue
        k = r.lower()
        if k in seen: continue
        seen.add(k); toks.append(r)
    name = ' '.join(toks)
    for cn, lat in BRANDS:
        if cn in t and lat.lower() not in name.lower():
            name = lat + ' ' + name; break
    cols, rest = [], first_cjk
    for cn, c in COLORS:
        if cn in rest and c not in cols:
            cols.append(c); rest = rest.replace(cn, '', 1)
        if len(cols) == 2: break
    if cols and not re.search(COLOR_WORDS, name, re.I):
        name += ' – ' + '/'.join(cols)
    name = re.sub(r'\s+', ' ', name).strip()
    return name[:80]

cat_order = {c: i for i, c in enumerate([catnames.get(cid, OTROS) for cid in orden] + [OTROS])}

prods, revisar = [], {}
for aid, v in alb.items():
    title = v.get('title', '')
    cid = v.get('cat')
    if cid is None and 'href' in v:                   # compat con formato antiguo
        m = re.search(r'referrercate=(\d+)', v['href'])
        cid = m.group(1) if m else None
    cat = catnames.get(str(cid), OTROS) if cid else OTROS
    name = fixes.get(str(aid)) or clean(title) or f'Modelo {aid}'
    if len(name) < 6 and str(aid) not in fixes:       # nombre dudoso → a revisión
        revisar[str(aid)] = {'titulo_original': title, 'nombre_generado': name}
    prods.append({'id': int(aid), 'cat': cat, 'name': name,
                  'href': f'https://{UID}.x.yupoo.com/albums/{aid}'})

prods.sort(key=lambda p: (cat_order.get(p['cat'], 999), -p['id']))

with open('productos.js', 'w', encoding='utf-8') as f:
    f.write(f'// Generado por generar-productos.py — {len(prods)} productos\n'
            'const PRODUCTS = ' + json.dumps(prods, ensure_ascii=False, separators=(',', ':')) + ';\n')

with open('revisar.json', 'w', encoding='utf-8') as f:
    json.dump(revisar, f, ensure_ascii=False, indent=1)

# ── Autoreparación: reconstruir imgs-locales.js desde imgs/ si falta o quedó vacío ──
need = True
if os.path.exists('imgs-locales.js'):
    s = open('imgs-locales.js', encoding='utf-8').read()
    need = len(s) < 120 or 'IMGS_LOCALES = {}' in s.replace(' ', ' ')
if need and os.path.isdir('imgs'):
    state = {}
    for d in sorted(os.listdir('imgs')):
        p = os.path.join('imgs', d)
        if os.path.isdir(p):
            files = sorted([x for x in os.listdir(p) if x.endswith('.jpg')],
                           key=lambda x: int(x.split('.')[0]))
            if files: state[d] = [f'imgs/{d}/{x}' for x in files]
    with open('imgs-locales.js', 'w', encoding='utf-8') as f:
        f.write('// Generado por descargar-imagenes.js — NO editar a mano\n'
                'const IMGS_LOCALES = ' + json.dumps(state) + ';\n')
    print(f'imgs-locales.js reconstruido: {len(state)} álbumes con fotos')

print(f'productos.js: {len(prods)} productos en {len(set(p["cat"] for p in prods))} categorías')
print(f'revisar.json: {len(revisar)} nombres dudosos' + (' → corrígelos en nombres-fix.json y vuelve a correr' if revisar else ''))
