const API = window.STORE_API_URL;
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
  if (!API || API.includes("PASTE_")) throw new Error("Demo mode");
  const response = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error);
  return data;
}

const demoProducts = [
  {id:"1",name:"Betta Fish Pair",categoryId:"c1",categoryName:"Betta Fish",price:500,stock:3,description:"Beautiful betta pair",imageUrl:"assets/sample-betta-1.jpg",active:true},
  {id:"2",name:"Premium Betta",categoryId:"c1",categoryName:"Betta Fish",price:500,stock:0,description:"Colorful premium betta",imageUrl:"assets/sample-betta-2.jpg",active:true}
];

const demoReviews = [
  {id:"rv1",createdAt:"Jul 13, 2026",customerName:"Sample Customer",productName:"Betta Fish Pair",rating:5,reviewText:"Ang ganda ng betta pair at maayos ang packaging. Thank you!",imageUrl:"assets/sample-betta-3.jpg"}
];

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

    if (data.settings && data.settings.logoUrl) $("logo").src = data.settings.logoUrl;
  } catch (err) {
    if (!silent) {
      products = demoProducts;
      categories = [{id:"c1",name:"Betta Fish"}];
      reviews = demoReviews;
    }
  }

  syncCartWithStock();
  renderCategories();
  renderProducts();
  renderCart();
  renderReviews();
  renderReviewProducts();
}

function renderCategories() {
  $("filter").innerHTML =
    '<option value="">All categories</option>' +
    categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
}

function renderProducts() {
  const filter = $("filter").value;
  const visible = products.filter(p => !filter || p.categoryId === filter);

  $("grid").innerHTML = visible.map(p => {
    const stock = Math.max(0, Number(p.stock) || 0);
    const soldOut = stock <= 0;

    return `
      <article class="card">
        <img src="${p.imageUrl || "assets/logo.jpg"}" alt="${escapeHtml(p.name)}">
        <div>
          <small>${escapeHtml(p.categoryName || "")}</small>
          <h3>${escapeHtml(p.name)}</h3>
          <p>${escapeHtml(p.description || "")}</p>
          <div class="row">
            <div>
              <b>${peso(p.price)}</b>
              <small style="display:block;margin-top:4px;color:${soldOut ? "#b42318" : "#65756f"}">
                ${soldOut ? "SOLD OUT" : `${stock} available`}
              </small>
            </div>
            <button class="btn" ${soldOut ? "disabled" : ""} onclick="add('${p.id}')">
              ${soldOut ? "Sold Out" : "Add to Cart"}
            </button>
          </div>
        </div>
      </article>
    `;
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
        ${r.imageUrl ? `<img class="reviewPhoto" src="${r.imageUrl}" alt="Customer review photo">` : ""}
        <div class="reviewBody">
          <div class="reviewStars">${"★".repeat(rating)}${"☆".repeat(5-rating)}</div>
          <h3>${escapeHtml(r.customerName)}</h3>
          ${r.productName ? `<span class="reviewProduct">${escapeHtml(r.productName)}</span>` : ""}
          <p class="reviewText">${escapeHtml(r.reviewText)}</p>
          <span class="reviewDate">${escapeHtml(formatDate(r.createdAt))}</span>
        </div>
      </article>
    `;
  }).join("");
}

function renderReviewProducts() {
  $("reviewProduct").innerHTML =
    '<option value="">General store review</option>' +
    products.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
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
    return {
      id: product.id,
      name: product.name,
      price: Number(product.price),
      imageUrl: product.imageUrl,
      qty: Math.min(Math.max(1, Number(item.qty) || 1), Number(product.stock))
    };
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
      <img src="${item.imageUrl || "assets/logo.jpg"}" alt="${escapeHtml(item.name)}">
      <div>
        <b>${escapeHtml(item.name)}</b>
        <div>${peso(item.price)} each</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
          <button type="button" onclick="changeQty(${index}, -1)">−</button>
          <strong>${item.qty}</strong>
          <button type="button" onclick="changeQty(${index}, 1)">+</button>
        </div>
      </div>
      <button onclick="cart.splice(${index},1);save()">×</button>
    </div>
  `).join("") || "<p style='padding:18px'>Cart is empty.</p>";

  $("total").textContent = peso(cart.reduce((sum, item) => sum + item.price * item.qty, 0));
}

function openCart() {
  $("cart").classList.add("open");
  $("overlay").classList.remove("hide");
}

function closeCart() {
  $("cart").classList.remove("open");
  $("overlay").classList.add("hide");
}

function file64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  })[char]);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-PH", {
    year:"numeric",month:"short",day:"numeric"
  });
}

$("filter").onchange = renderProducts;
$("cartBtn").onclick = openCart;
$("closeCart").onclick = $("overlay").onclick = closeCart;

$("checkout").onclick = () => {
  if (!cart.length) return alert("Cart is empty");
  closeCart();
  $("checkoutDlg").showModal();
};

$("closeDlg").onclick = () => $("checkoutDlg").close();

$("openReview").onclick = () => $("reviewDlg").showModal();
$("closeReview").onclick = () => $("reviewDlg").close();

$("checkoutForm").onsubmit = async event => {
  event.preventDefault();
  const form = event.target;
  const file = form.proof.files[0];

  if (!file) return alert("Please upload your proof of payment.");
  if (file.size > 5e6) return alert("Maximum proof image size is 5 MB.");

  $("status").textContent = "Submitting...";

  try {
    const data = await api("createOrder", {
      order: {
        customerName: form.customerName.value,
        mobile: form.mobile.value,
        address: form.address.value,
        notes: form.notes.value,
        items: cart,
        proofData: await file64(file),
        proofName: file.name
      }
    });

    $("status").textContent = `Order submitted: ${data.orderId}. Payment is waiting for admin approval.`;
    cart = [];
    save();
    form.reset();
    await load(true);
  } catch (err) {
    $("status").textContent = err.message;
  }
};

$("reviewForm").onsubmit = async event => {
  event.preventDefault();
  const form = event.target;
  const file = form.reviewImage.files[0];

  if (file && file.size > 5e6) {
    $("reviewStatus").textContent = "Review image must be 5 MB or less.";
    return;
  }

  $("reviewStatus").textContent = "Submitting review...";

  try {
    await api("createReview", {
      review: {
        customerName: form.customerName.value,
        productId: form.productId.value,
        rating: Number(form.rating.value),
        reviewText: form.reviewText.value,
        imageData: file ? await file64(file) : "",
        imageName: file ? file.name : ""
      }
    });

    $("reviewStatus").textContent = "Thank you! Your review has been posted.";
    form.reset();
    await load(true);
    setTimeout(() => $("reviewDlg").close(), 1200);
  } catch (err) {
    $("reviewStatus").textContent = err.message;
  }
};

load();
renderCart();

setInterval(() => load(true), 60000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) load(true);
});
