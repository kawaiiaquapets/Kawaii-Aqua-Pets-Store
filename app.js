const API = window.STORE_API_URL;
const FALLBACK_IMAGE = "assets/logo.png";
let products = [];
let categories = [];
let reviews = [];
let cart = JSON.parse(localStorage.getItem("cart") || "[]");

const $ = id => document.getElementById(id);
const peso = n => new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0
}).format(Number(n) || 0);

async function api(action, payload = {}) {
  if (!API || API.includes("PASTE_")) throw new Error("API URL is not configured in config.js");
  const response = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    cache: "no-store",
    body: JSON.stringify({ action, ...payload, requestTime: Date.now() })
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "Request failed");
  return data;
}

function driveImageUrl(value, size = 1600) {
  const url = String(value || "").trim();
  if (!url) return FALLBACK_IMAGE;
  const match = url.match(/(?:[?&]id=|\/d\/)([-\w]{20,})/);
  return match ? `https://drive.google.com/thumbnail?id=${match[1]}&sz=w${size}` : url;
}

function imageSrc(value, size = 1600) {
  const url = driveImageUrl(value, size);
  if (url.startsWith("https://drive.google.com/thumbnail")) {
    return `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;
  }
  return url;
}

function safeImage(img, fallback = FALLBACK_IMAGE) {
  img.onerror = () => {
    img.onerror = null;
    img.src = fallback;
  };
}

async function optimizeImage(file, maxDimension = 1600, quality = 0.86) {
  if (!file) return "";
  if (!file.type.startsWith("image/")) throw new Error("Please select a valid image file.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Original image must be 10 MB or less.");

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  const mime = file.type === "image/png" && file.size < 2.5 * 1024 * 1024 ? "image/png" : "image/jpeg";
  return canvas.toDataURL(mime, mime === "image/png" ? undefined : quality);
}

async function load(silent = false) {
  try {
    const data = await api("getStore");
    products = data.products || [];
    categories = data.categories || [];
    reviews = data.reviews || [];

    Object.entries(data.settings || {}).forEach(([key, value]) => {
      const element = $(key);
      if (element) element.textContent = value;
    });

    if (data.settings?.siteName) document.title = data.settings.siteName;
    if (data.settings?.logoUrl) {
      $("logo").src = imageSrc(data.settings.logoUrl, 800);
      $("heroImage").src = imageSrc(data.settings.logoUrl, 1200);
    }
  } catch (err) {
    if (!silent) console.error(err);
  }

  syncCartWithStock();
  renderCategories();
  renderProducts();
  renderCart();
  renderReviews();
  renderReviewProducts();
}

function renderCategories() {
  $("filter").innerHTML = '<option value="">All categories</option>' +
    categories.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("");
}

function renderProducts() {
  const filter = $("filter").value;
  const visible = products.filter(p => !filter || p.categoryId === filter);

  $("grid").innerHTML = visible.map(p => {
    const stock = Math.max(0, Number(p.stock) || 0);
    const soldOut = stock <= 0;
    return `
      <article class="card">
        <img src="${escapeHtml(imageSrc(p.imageUrl))}" alt="${escapeHtml(p.name)}" onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}'">
        <div>
          <small>${escapeHtml(p.categoryName || "")}</small>
          <h3>${escapeHtml(p.name)}</h3>
          <p>${escapeHtml(p.description || "")}</p>
          <div class="row">
            <div>
              <b>${peso(p.price)}</b>
              <small style="display:block;margin-top:4px;color:${soldOut ? "#b42318" : "#65756f"}">${soldOut ? "SOLD OUT" : `${stock} available`}</small>
            </div>
            <button class="btn" ${soldOut ? "disabled" : ""} onclick="add('${escapeHtml(p.id)}')">${soldOut ? "Sold Out" : "Add to Cart"}</button>
          </div>
        </div>
      </article>`;
  }).join("") || "<p>No products available.</p>";
}

function renderReviews() {
  if (!reviews.length) {
    $("reviewSummary").textContent = "No reviews yet. Be the first to share your experience.";
    $("reviewsGrid").innerHTML = '<div class="reviewEmpty">No customer reviews yet.</div>';
    return;
  }

  const average = reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / reviews.length;
  $("reviewSummary").textContent = `${average.toFixed(1)} out of 5 • ${reviews.length} review${reviews.length === 1 ? "" : "s"}`;

  $("reviewsGrid").innerHTML = reviews.map(r => {
    const rating = Math.max(1, Math.min(5, Number(r.rating) || 5));
    return `
      <article class="reviewCard">
        ${r.imageUrl ? `<img class="reviewPhoto" src="${escapeHtml(imageSrc(r.imageUrl))}" alt="Customer review photo" onerror="this.style.display='none'">` : ""}
        <div class="reviewBody">
          <div class="reviewStars">${"★".repeat(rating)}${"☆".repeat(5-rating)}</div>
          <h3>${escapeHtml(r.customerName)}</h3>
          ${r.productName ? `<span class="reviewProduct">${escapeHtml(r.productName)}</span>` : ""}
          <p class="reviewText">${escapeHtml(r.reviewText)}</p>
          <span class="reviewDate">${escapeHtml(formatDate(r.createdAt))}</span>
        </div>
      </article>`;
  }).join("");
}

function renderReviewProducts() {
  $("reviewProduct").innerHTML = '<option value="">General store review</option>' +
    products.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join("");
}

function add(id) {
  const product = products.find(x => x.id === id);
  if (!product) return;
  const stock = Math.max(0, Number(product.stock) || 0);
  if (stock <= 0) return alert("This item is sold out.");
  const item = cart.find(x => x.id === id);
  const currentQty = item ? Number(item.qty) : 0;
  if (currentQty >= stock) return alert(`Only ${stock} item(s) available.`);
  if (item) item.qty += 1;
  else cart.push({id:product.id,name:product.name,price:Number(product.price),imageUrl:product.imageUrl,qty:1});
  save();
}

function changeQty(index, delta) {
  const item = cart[index];
  const product = products.find(p => p.id === item.id);
  const stock = product ? Math.max(0, Number(product.stock) || 0) : 0;
  if (delta > 0 && item.qty >= stock) return alert(`Only ${stock} item(s) available.`);
  item.qty = Math.max(1, item.qty + delta);
  save();
}

function syncCartWithStock() {
  cart = cart.map(item => {
    const product = products.find(p => p.id === item.id);
    if (!product || Number(product.stock) <= 0) return null;
    return {id:product.id,name:product.name,price:Number(product.price),imageUrl:product.imageUrl,qty:Math.min(Math.max(1,Number(item.qty)||1),Number(product.stock))};
  }).filter(Boolean);
  localStorage.setItem("cart", JSON.stringify(cart));
}

function save() {
  localStorage.setItem("cart", JSON.stringify(cart));
  renderCart();
}

function renderCart() {
  $("cartCount").textContent = cart.reduce((sum, item) => sum + item.qty, 0);
  $("cartItems").innerHTML = cart.map((item, index) => `
    <div class="cartItem">
      <img src="${escapeHtml(imageSrc(item.imageUrl, 500))}" alt="${escapeHtml(item.name)}" onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}'">
      <div><b>${escapeHtml(item.name)}</b><div>${peso(item.price)} each</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
          <button type="button" onclick="changeQty(${index},-1)">−</button><strong>${item.qty}</strong><button type="button" onclick="changeQty(${index},1)">+</button>
        </div>
      </div>
      <button onclick="cart.splice(${index},1);save()">×</button>
    </div>`).join("") || "<p style='padding:18px'>Cart is empty.</p>";
  $("total").textContent = peso(cart.reduce((sum, item) => sum + item.price * item.qty, 0));
}

function openCart(){ $("cart").classList.add("open"); $("overlay").classList.remove("hide"); }
function closeCart(){ $("cart").classList.remove("open"); $("overlay").classList.add("hide"); }
function escapeHtml(value){ return String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[c]); }
function formatDate(value){ const d=new Date(value); return !value||Number.isNaN(d.getTime())?String(value||""):d.toLocaleDateString("en-PH",{year:"numeric",month:"short",day:"numeric"}); }

safeImage($("logo"));
safeImage($("heroImage"));
$("filter").onchange = renderProducts;
$("cartBtn").onclick = openCart;
$("closeCart").onclick = $("overlay").onclick = closeCart;
$("checkout").onclick = () => { if(!cart.length)return alert("Cart is empty"); closeCart(); $("checkoutDlg").showModal(); };
$("closeDlg").onclick = () => $("checkoutDlg").close();
$("openReview").onclick = () => $("reviewDlg").showModal();
$("closeReview").onclick = () => $("reviewDlg").close();

$("checkoutForm").onsubmit = async event => {
  event.preventDefault();
  const form = event.target;
  const file = form.proof.files[0];
  if (!file) return alert("Please upload your proof of payment.");
  $("status").textContent = "Optimizing image and submitting...";
  try {
    const data = await api("createOrder", {order:{
      customerName:form.customerName.value.trim(), mobile:form.mobile.value.trim(), address:form.address.value.trim(), notes:form.notes.value.trim(), items:cart,
      proofData:await optimizeImage(file,1600,.84), proofName:file.name
    }});
    $("status").textContent = `Order submitted: ${data.orderId}. Payment is waiting for admin approval.`;
    cart=[]; save(); form.reset(); await load(true);
  } catch(err){ $("status").textContent=err.message; }
};

$("reviewForm").onsubmit = async event => {
  event.preventDefault();
  const form = event.target;
  const file = form.reviewImage.files[0];
  $("reviewStatus").textContent = "Submitting review...";
  try {
    await api("createReview", {review:{
      customerName:form.customerName.value.trim(), productId:form.productId.value, rating:Number(form.rating.value), reviewText:form.reviewText.value.trim(),
      imageData:file?await optimizeImage(file,1600,.84):"", imageName:file?file.name:""
    }});
    $("reviewStatus").textContent="Thank you! Your review has been posted.";
    form.reset(); await load(true); setTimeout(()=>$("reviewDlg").close(),1200);
  } catch(err){ $("reviewStatus").textContent=err.message; }
};

load();
renderCart();
setInterval(()=>load(true),60000);
document.addEventListener("visibilitychange",()=>{ if(!document.hidden)load(true); });
