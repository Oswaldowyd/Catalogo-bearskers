/* app.js — Motor de render del catálogo Bearskers.
 * Compartido por la home (/) y por cada página de categoría (/slug/).
 * Cada página define antes:  const PRODUCTS = [...]  y  const IMGS_LOCALES = {...}
 * (la home los carga desde productos.js / imgs-locales.js). PRECIOS viene de precios.js.
 */
const WA = "526699201472";  // ← número de WhatsApp (solo dígitos, con código de país)
const BATCH = 24;           // productos por lote al hacer scroll

const PRICES = (typeof PRECIOS !== "undefined") ? PRECIOS : {};

// ¿Abierto localmente (file://) o publicado en Netlify?
const IS_LOCAL = location.protocol === "file:" ||
  ["localhost", "127.0.0.1", ""].includes(location.hostname);

// Imágenes: en local usa imgs/ID/n.jpg; publicado usa las URLs del proxy de Netlify.
function getImgs(p) {
  const loc = (typeof IMGS_LOCALES !== "undefined") ? IMGS_LOCALES[String(p.id)] : null;
  if (!loc || !loc.length) return [];
  const base = (typeof window !== "undefined" && window.IMG_BASE) ? window.IMG_BASE : "";
  if (IS_LOCAL) return loc.map((_, i) => `${base}imgs/${p.id}/${i + 1}.jpg`);
  return loc;
}
function getPrice(p) { return PRICES[String(p.id)] || p.price || ""; }

let curSearch = "", shown = 0, curItems = [];

// Búsqueda dentro de los productos de ESTA página (nombre, categoría o grupo)
function filtered() {
  const q = curSearch.toLowerCase();
  return PRODUCTS.filter(p =>
    !q ||
    p.name.toLowerCase().includes(q) ||
    (p.cat && p.cat.toLowerCase().includes(q)) ||
    (p.group && p.group.toLowerCase().includes(q))
  );
}

function cardHTML(p) {
  const srcs = getImgs(p);
  let media;
  if (srcs.length) {
    const imgs = srcs.map((u, i) => `<img ${i === 0 ? `src="${u}"` : `data-src="${u}"`} class="${i === 0 ? "on" : "off"}" loading="lazy" alt="${p.name}">`).join("");
    const dots = srcs.length > 1 ? `<div class="dots">${srcs.map((_, i) => `<span class="dot${i === 0 ? " on" : ""}"></span>`).join("")}</div>` : "";
    media = `${imgs}${dots}<span class="badge">📷 ${srcs.length}</span>`;
  } else {
    media = `<div class="no-img"><span>👟</span>Fotos en Yupoo</div>`;
  }
  const price = getPrice(p) ? `<div class="card-price">${getPrice(p)}</div>` : ``;
  const waMsg = encodeURIComponent("Hola! Me interesa este modelo: " + p.name + " (ref " + p.id + ")");
  return `<div class="card" onclick="openModal(${p.id})" onmouseenter="startSlide(${p.id},this)" onmouseleave="stopSlide(${p.id},this)">
    <div class="card-img">${media}</div>
    <div class="card-body">
      <div class="card-name">${p.name}</div>${price}
      <div class="card-actions">
        <a class="btn-wa" href="https://wa.me/${WA.replace(/[^0-9]/g, "")}?text=${waMsg}" target="_blank" onclick="event.stopPropagation()">💬 Lo quiero</a>
        <button class="btn-more">Ver más</button>
      </div>
    </div>
  </div>`;
}

function render() {
  const sb = document.getElementById("search");
  curSearch = sb ? sb.value : "";
  curItems = filtered();
  shown = 0;
  const grid = document.getElementById("grid");
  const empty = document.getElementById("empty");
  document.getElementById("prod-count").textContent = curItems.length + " producto" + (curItems.length !== 1 ? "s" : "");
  grid.innerHTML = "";
  if (!curItems.length) { empty.style.display = "block"; document.getElementById("sentinel").style.display = "none"; return; }
  empty.style.display = "none";
  loadMore();
}

function loadMore() {
  const grid = document.getElementById("grid");
  const slice = curItems.slice(shown, shown + BATCH);
  grid.insertAdjacentHTML("beforeend", slice.map(cardHTML).join(""));
  shown += slice.length;
  document.getElementById("sentinel").style.display = shown < curItems.length ? "block" : "none";
}

// Image slideshow on hover
const timers = {};
function startSlide(id, el) {
  const imgs = el.querySelectorAll(".card-img img");
  if (imgs.length < 2) return;
  imgs.forEach(im => { if (im.dataset.src) { im.src = im.dataset.src; delete im.dataset.src; } });
  let i = 0;
  timers[id] = setInterval(() => {
    imgs.forEach(im => im.classList.replace("on", "off"));
    const dots = el.querySelectorAll(".dot");
    dots.forEach(d => d.classList.remove("on"));
    i = (i + 1) % imgs.length;
    imgs[i].classList.replace("off", "on");
    if (dots[i]) dots[i].classList.add("on");
  }, 900);
}
function stopSlide(id, el) {
  clearInterval(timers[id]);
  const imgs = el.querySelectorAll(".card-img img"), dots = el.querySelectorAll(".dot");
  imgs.forEach((im, i) => { im.classList.remove("on", "off"); im.classList.add(i === 0 ? "on" : "off"); });
  dots.forEach((d, i) => { d.classList.toggle("on", i === 0); });
}

// Modal
let curP = null;
function openModal(id) {
  curP = PRODUCTS.find(p => p.id === id);
  if (!curP) return;
  curP._imgs = getImgs(curP);
  document.getElementById("m-title").textContent = curP.name;
  const main = document.getElementById("m-main");
  if (curP._imgs.length) {
    main.innerHTML = `<img id="m-img" src="${curP._imgs[0]}" referrerpolicy="no-referrer">`;
  } else {
    main.innerHTML = `<div class="no-img"><span>👟</span>Fotos disponibles en Yupoo →</div>`;
  }
  const price = getPrice(curP);
  document.getElementById("m-price").textContent = price || "Consultar precio";
  document.getElementById("m-price").className = "modal-price" + (price ? "" : " empty");
  const waMsg = encodeURIComponent("Hola! Me interesa: " + curP.name + " (ref " + curP.id + ")");
  document.getElementById("m-wa").href = `https://wa.me/${WA.replace(/[^0-9]/g, "")}?text=${waMsg}`;
  document.getElementById("m-thumbs").innerHTML = curP._imgs.map((u, i) =>
    `<div class="thumb${i === 0 ? " on" : ""}" onclick="selectThumb(${i})"><img src="${u}"></div>`
  ).join("");
  document.getElementById("m-thumbs").style.display = curP._imgs.length ? "flex" : "none";
  document.getElementById("modal-bg").classList.add("open");
  document.body.style.overflow = "hidden";
}
function selectThumb(i) {
  document.getElementById("m-img").src = curP._imgs[i];
  document.querySelectorAll(".thumb").forEach((t, j) => t.classList.toggle("on", j === i));
}
function closeModal() { document.getElementById("modal-bg").classList.remove("open"); document.body.style.overflow = ""; }
function closeModalOnBg(e) { if (e.target.id === "modal-bg") closeModal(); }
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

// Sidebar (móvil) y desplegables de marcas
function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("overlay").classList.toggle("open");
}
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("overlay").classList.remove("open");
}
function toggleSub(btn) {
  const sub = btn.nextElementSibling;
  const isOpen = sub.classList.contains("open");
  document.querySelectorAll(".sub-list").forEach(s => s.classList.remove("open"));
  document.querySelectorAll(".brand-btn").forEach(b => b.classList.remove("open"));
  if (!isOpen) { sub.classList.add("open"); btn.classList.add("open"); }
}

// Resalta el enlace de la categoría actual (data-section del <body>) y abre su grupo
function highlightActive() {
  const sec = document.body.dataset.section || "";
  document.querySelectorAll(".cat-btn[data-slug],.sub-btn[data-slug]").forEach(el => {
    if ((el.dataset.slug || "") === sec) {
      el.classList.add("active");
      const sub = el.closest(".sub-list");
      if (sub) { sub.classList.add("open"); const pb = sub.previousElementSibling; if (pb) pb.classList.add("open"); }
    }
  });
}

// Scroll infinito
new IntersectionObserver(entries => {
  if (entries[0].isIntersecting && shown < curItems.length) loadMore();
}, { rootMargin: "600px" }).observe(document.getElementById("sentinel"));

document.addEventListener("DOMContentLoaded", () => {
  highlightActive();
  render();
});
