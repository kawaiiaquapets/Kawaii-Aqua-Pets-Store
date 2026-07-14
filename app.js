const API = window.STORE_API_URL;
const FALLBACK_IMAGE = "assets/logo.png";
const DEFAULT_LALAMOVE_FORM_URL = "https://delivery.lalamove.com/forms/PH4c4ef013d6d54893b979fa6c04c447ca";
const DEFAULT_PAYMENT_QR = {
  gcash: "assets/gcash-qr.jpg",
  unionbank: "assets/unionbank-qr.jpeg"
};

let products = [];
let categories = [];
let reviews = [];
let storeSettings = {};
let cart = JSON.parse(localStorage.getItem("cart") || "[]");
let lastOrderMessage = "";
let checkoutMode = "cart";
let buyNowItem = null;
let lastSubmittedOrder = null;

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
  if (!img) return;
  img.onerror = () => {
    img.onerror = null;
    img.src = fallback;
  };
}


function safeExternalUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function facebookChatUrl() {
  const pageUrl = safeExternalUrl(storeSettings.facebookPageUrl);
  if (!pageUrl) return "";

  try {
    const url = new URL(pageUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");

    if (host === "m.me") return url.href;

    if (host === "facebook.com" || host === "fb.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      const first = parts[0] || "";

      if (
        first &&
        !["pages", "profile.php", "groups", "share", "sharer"].includes(first.toLowerCase()) &&
        !/^\d+$/.test(first)
      ) {
        return `https://m.me/${encodeURIComponent(first)}`;
      }
    }
  } catch {}

  return pageUrl;
}

function renderSocialLinks() {
  const links = [
    ["facebookLink", storeSettings.facebookPageUrl],
    ["tiktokLink", storeSettings.tiktokUrl],
    ["youtubeLink", storeSettings.youtubeUrl]
  ];

  let visibleCount = 0;

  links.forEach(([id, value]) => {
    const element = $(id);
    const url = safeExternalUrl(value);
    if (!element) return;

    element.classList.toggle("hide", !url);
    if (url) {
      element.href = url;
      visibleCount += 1;
    } else {
      element.removeAttribute("href");
    }
  });

  $("socialSection")?.classList.toggle("hide", visibleCount === 0);

  const chatUrl = facebookChatUrl();
  $("floatingChatBtn")?.classList.toggle("hide", !chatUrl);
}

async function copyText(value) {
  const textValue = String(value || "");

  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(textValue);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = textValue;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) throw new Error("Browser blocked automatic copy.");
}

function openSellerChat() {
  const url = facebookChatUrl();

  if (!url) {
    alert("Seller chat is not available yet.");
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

function buildOrderMessage(order) {
  const itemLines = (order.items || []).map(item =>
    `• ${item.name} x${item.qty} — ${peso(Number(item.price || 0) * Number(item.qty || 0))}`
  );

  return [
    `Hi ${storeSettings.siteName || "Kawaii Aqua Pets"}! 🐠`,
    "",
    "I submitted an order from your website.",
    "",
    `ORDER ID: ${order.orderId}`,
    `CUSTOMER: ${order.customerName}`,
    `MOBILE: ${order.mobile}`,
    `EMAIL: ${order.email || ""}`,
    "",
    "ORDER:",
    ...itemLines,
    "",
    `TOTAL: ${peso(order.total)}`,
    `PAYMENT: ${order.paymentSummary}`,
    `DELIVERY: ${order.deliverySummary}`,
    "STATUS: Waiting for payment approval",
    "",
    "Please confirm my order. Thank you! 🐟"
  ].join("\n");
}

function showOrderSuccess(order) {
  lastSubmittedOrder = order;
  lastOrderMessage = buildOrderMessage(order);
  localStorage.setItem("kap_last_order_lookup", JSON.stringify({
    orderId: order.orderId,
    email: order.email || "",
    mobile: order.mobile || ""
  }));

  $("successOrderId").textContent = order.orderId;
  $("successOrderTotal").textContent = peso(order.total);
  $("orderSuccessSummary").textContent =
    `${order.paymentSummary} payment proof received. Your order is waiting for admin payment approval. Once approved, a payment receipt will be emailed to ${order.email}. Shipping fee is not included in the product total.`;

  const hasFacebook = Boolean(facebookChatUrl());
  $("sendOrderSellerBtn").classList.toggle("hide", !hasFacebook);
  $("messengerInstruction").classList.toggle("hide", !hasFacebook);
  $("orderSuccessMsg").textContent = "";

  $("orderSuccessDlg").showModal();
}

async function copyOrderAndOpenSeller() {
  if (!lastOrderMessage) return;

  const url = facebookChatUrl();
  if (!url) return;

  const chatWindow = window.open("about:blank", "_blank");

  try {
    await copyText(lastOrderMessage);
    $("orderSuccessMsg").textContent =
      "Order details copied. Facebook/Messenger is opening—paste the message and send it to the seller.";

    if (chatWindow) {
      chatWindow.opener = null;
      chatWindow.location.href = url;
    } else {
      window.location.href = url;
    }
  } catch (err) {
    if (chatWindow) chatWindow.close();
    $("orderSuccessMsg").textContent =
      err.message || "Could not copy the order details.";
  }
}

async function copyLastOrder() {
  if (!lastOrderMessage) return;

  try {
    await copyText(lastOrderMessage);
    $("orderSuccessMsg").textContent = "Order details copied.";
  } catch (err) {
    $("orderSuccessMsg").textContent =
      err.message || "Could not copy the order details.";
  }
}

function getSavedOrderLookup() {
  try {
    return JSON.parse(localStorage.getItem("kap_last_order_lookup") || "{}") || {};
  } catch {
    return {};
  }
}

function openTrackOrder(prefill = null) {
  const form = $("trackOrderForm");
  const saved = prefill || getSavedOrderLookup();

  if (saved) {
    form.orderId.value = saved.orderId || saved.id || "";
    form.contact.value = saved.email || saved.mobile || saved.contact || "";
  }

  $("trackOrderStatus").textContent = "";
  $("trackOrderResult").classList.add("hide");
  $("trackOrderResult").innerHTML = "";
  $("trackOrderDlg").showModal();
}

function formatDateTime(value) {
  const date = new Date(value);
  return !value || Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
}

function trackingStatusLabel(status) {
  const labels = {
    Pending: "Waiting for Payment Approval",
    Paid: "Payment Confirmed",
    Preparing: "Preparing Your Order",
    Ready: "Ready for Shipping",
    Shipped: "Shipped / Out for Delivery",
    Completed: "Order Completed",
    Cancelled: "Order Cancelled"
  };
  return labels[status] || status || "Order Received";
}

function renderTrackingResult(order) {
  const container = $("trackOrderResult");
  const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  const eventMap = {};
  history.forEach(event => {
    if (event?.status && !eventMap[event.status]) eventMap[event.status] = event.at || "";
  });

  const steps = [
    {key: "Received", eventStatus: "Pending", label: "Order Received", description: "Your order and payment proof were submitted."},
    {key: "Paid", eventStatus: "Paid", label: "Payment Confirmed", description: "The seller approved your payment."},
    {key: "Preparing", eventStatus: "Preparing", label: "Preparing Your Order", description: "Your order is being prepared for shipment."},
    {key: "Ready", eventStatus: "Ready", label: "Ready for Shipping", description: "Your parcel is ready for courier handoff."},
    {key: "Shipped", eventStatus: "Shipped", label: "Shipped / Out for Delivery", description: "Your order has been handed to the selected delivery service."},
    {key: "Completed", eventStatus: "Completed", label: "Order Completed", description: "The order has been completed."}
  ];
  const statusStepIndex = {
    Pending: 1,
    Paid: 1,
    Preparing: 2,
    Ready: 3,
    Shipped: 4,
    Completed: 5
  };
  const currentStatus = order.status || "Pending";
  const currentStepIndex = statusStepIndex[currentStatus] ?? 1;
  const isCancelled = currentStatus === "Cancelled";

  const timelineHtml = steps.map((step, index) => {
    let state = "upcoming";

    if (isCancelled) {
      state = index === 0 || eventMap[step.eventStatus] ? "done" : "upcoming";
    } else if (index === 0) {
      state = "done";
    } else if (index < currentStepIndex) {
      state = "done";
    } else if (index === currentStepIndex) {
      state = "current";
    }

    const at = step.key === "Received"
      ? (eventMap.Pending || order.createdAt)
      : eventMap[step.eventStatus] || "";
    const label = currentStatus === "Pending" && step.key === "Paid"
      ? "Waiting for Payment Confirmation"
      : step.label;
    const description = currentStatus === "Pending" && step.key === "Paid"
      ? "Your proof of payment is waiting for seller approval."
      : step.description;

    return `
      <div class="trackStep ${state}">
        <div class="trackStepMarker">${state === "done" ? "✓" : state === "current" ? "●" : ""}</div>
        <div class="trackStepContent">
          <b>${escapeHtml(label)}</b>
          <p>${escapeHtml(description)}</p>
          ${at ? `<small>${escapeHtml(formatDateTime(at))}</small>` : ""}
        </div>
      </div>
    `;
  }).join("");

  const courierAction = order.trackingUrl
    ? `<a class="btn trackCourierBtn" href="${escapeHtml(order.trackingUrl)}" target="_blank" rel="noopener noreferrer">Open Courier Tracking</a>`
    : "";

  const itemsHtml = (order.items || []).map(item => `
    <div class="trackItemRow">
      <span>${escapeHtml(item.name)} × ${Number(item.qty) || 1}</span>
      <b>${peso(Number(item.price || 0) * Number(item.qty || 0))}</b>
    </div>
  `).join("");

  container.innerHTML = `
    <section class="trackOrderCard">
      <div class="trackOrderCardHead">
        <div>
          <small>ORDER ID</small>
          <b>${escapeHtml(order.id)}</b>
        </div>
        <span class="trackStatusBadge ${isCancelled ? "cancelled" : ""}">${escapeHtml(trackingStatusLabel(currentStatus))}</span>
      </div>
      <div class="trackMetaGrid">
        <div><small>PRODUCT TOTAL</small><b>${peso(order.total)}</b><span>Shipping fee not included</span></div>
        <div><small>PAYMENT</small><b>${escapeHtml(order.paymentSummary || "—")}</b></div>
        <div><small>DELIVERY</small><b>${escapeHtml(order.deliverySummary || order.deliveryMethod || "—")}</b></div>
        ${order.trackingNumber ? `<div><small>TRACKING NUMBER</small><b class="trackingNumberText">${escapeHtml(order.trackingNumber)}</b></div>` : ""}
      </div>
      ${courierAction}
    </section>

    ${isCancelled ? `
      <div class="trackCancelledNotice">
        <b>Order Cancelled</b>
        <span>This order has been cancelled. Contact the seller if you need assistance.</span>
        ${eventMap.Cancelled ? `<small>${escapeHtml(formatDateTime(eventMap.Cancelled))}</small>` : ""}
      </div>
    ` : ""}

    <section class="trackTimeline">
      <h3>Order Timeline</h3>
      ${timelineHtml}
    </section>

    <section class="trackItemsCard">
      <h3>Order Items</h3>
      ${itemsHtml}
      <div class="trackItemTotal"><span>Product Total</span><b>${peso(order.total)}</b></div>
      <small>Shipping fee is not included in the product total.</small>
    </section>
  `;

  container.classList.remove("hide");
}

function cartTotal() {
  return cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
}

function getCheckoutItems() {
  return checkoutMode === "buyNow" && buyNowItem
    ? [{...buyNowItem}]
    : cart.map(item => ({...item}));
}

function checkoutTotal() {
  return getCheckoutItems().reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0),
    0
  );
}

function renderCheckoutMiniSummary() {
  const box = $("checkoutMiniSummary");
  if (!box) return;

  const items = getCheckoutItems();
  const title = checkoutMode === "buyNow" ? "Buy Now" : "Cart Checkout";

  box.innerHTML = `
    <div>
      <small>${escapeHtml(title.toUpperCase())}</small>
      <b>${items.map(item => `${escapeHtml(item.name)} x${Number(item.qty) || 1}`).join(", ")}</b>
    </div>
    <strong>${peso(checkoutTotal())}</strong>
  `;
}

function openCheckout(mode = "cart", productId = "") {
  if (mode === "buyNow") {
    const product = products.find(item => item.id === productId);
    if (!product) return alert("Product is not available.");

    const stock = Math.max(0, Number(product.stock) || 0);
    if (stock <= 0) return alert("This item is sold out.");

    checkoutMode = "buyNow";
    buyNowItem = {
      id: product.id,
      name: product.name,
      price: Number(product.price),
      imageUrl: product.imageUrl,
      qty: 1
    };
  } else {
    if (!cart.length) return alert("Cart is empty");
    checkoutMode = "cart";
    buyNowItem = null;
    closeCart();
  }

  toggleDeliveryFields();
  renderCheckoutMiniSummary();
  renderPaymentDetails();
  $("status").textContent = "";
  $("checkoutDlg").showModal();
}

function showAddedToCartToast(product) {
  let toast = document.getElementById("cartToast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "cartToast";
    toast.className = "cartToast";
    toast.innerHTML = `
      <div class="cartToastIcon">✓</div>
      <div class="cartToastText">
        <b id="cartToastTitle">Added to cart</b>
        <span id="cartToastProduct"></span>
      </div>
      <button type="button" id="cartToastView">View Cart</button>
    `;
    document.body.appendChild(toast);
    toast.querySelector("#cartToastView").onclick = () => {
      toast.classList.remove("show");
      openCart();
    };
  }

  toast.querySelector("#cartToastTitle").textContent = "Added to cart";
  toast.querySelector("#cartToastProduct").textContent = product.name;
  toast.classList.remove("show");
  void toast.offsetWidth;
  toast.classList.add("show");

  clearTimeout(showAddedToCartToast.timer);
  showAddedToCartToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

function selectedPaymentMethod(form = $("checkoutForm")) {
  return form.querySelector('input[name="paymentMethod"]:checked')?.value || "";
}

function getPaymentInfo(method) {
  if (method === "unionbank") {
    return {
      method: "unionbank",
      label: "UnionBank",
      accountName: storeSettings.unionBankName || "JOEBERT O GREGANDA",
      accountHint: storeSettings.unionBankAccountHint || "**** **** 6628",
      qrUrl: storeSettings.unionBankQrUrl || DEFAULT_PAYMENT_QR.unionbank,
      fileId: storeSettings.unionBankQrFileId || ""
    };
  }

  return {
    method: "gcash",
    label: "GCash",
    accountName: storeSettings.gcashName || "Joebert Greganda",
    accountHint: storeSettings.gcashNumber || "",
    qrUrl: storeSettings.gcashQrUrl || DEFAULT_PAYMENT_QR.gcash,
    fileId: storeSettings.gcashQrFileId || ""
  };
}

function renderPaymentDetails() {
  const method = selectedPaymentMethod();
  const box = $("paymentBox");

  box.classList.toggle("hide", !method);
  $("paymentAmount").textContent = peso(checkoutTotal());

  if (!method) return;

  const info = getPaymentInfo(method);
  $("paymentProvider").textContent = info.label;
  $("paymentAccountName").textContent = info.accountName;
  $("paymentAccountHint").textContent = info.accountHint;
  $("paymentAccountHint").classList.toggle("hide", !info.accountHint);
  $("paymentQr").src = imageSrc(info.qrUrl, 1800);
  $("paymentQr").alt = `${info.label} payment QR code`;
  $("paymentNote").textContent = storeSettings.paymentNote || "Using one phone only? Download the QR first, then select the saved QR image inside your payment app.";
}

function triggerDownload(dataUrl, filename) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function downloadPaymentQr() {
  const method = selectedPaymentMethod();
  if (!method) return alert("Please select GCash or UnionBank first.");

  const info = getPaymentInfo(method);
  const filename = `Kawaii-Aqua-Pets-${info.label}-QR.${method === "unionbank" ? "jpeg" : "jpg"}`;
  const isDriveImage = Boolean(info.fileId) || /drive\.google\.com/.test(info.qrUrl);

  try {
    if (isDriveImage) {
      const result = await api("getPaymentQr", {method});
      if (!result.dataUrl) throw new Error("Payment QR is not available for download.");
      triggerDownload(result.dataUrl, result.filename || filename);
      return;
    }

    const link = document.createElement("a");
    link.href = info.qrUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (err) {
    alert(err.message || "Could not download the QR. Use View Full Size and save the image instead.");
  }
}

function viewPaymentQr() {
  const method = selectedPaymentMethod();
  if (!method) return alert("Please select GCash or UnionBank first.");
  window.open(imageSrc(getPaymentInfo(method).qrUrl, 2000), "_blank", "noopener");
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
    storeSettings = data.settings || {};

    Object.entries(storeSettings).forEach(([key, value]) => {
      const element = $(key);
      if (element) element.textContent = value;
    });

    if (storeSettings.siteName) document.title = storeSettings.siteName;
    if (storeSettings.logoUrl) {
      $("logo").src = imageSrc(storeSettings.logoUrl, 800);
      $("heroImage").src = imageSrc(storeSettings.logoUrl, 1200);
    }

    $("lalamoveFormLink").href = storeSettings.lalamoveFormUrl || DEFAULT_LALAMOVE_FORM_URL;
    renderPaymentDetails();
    renderSocialLinks();
  } catch (err) {
    if (!silent) console.error(err);
    $("lalamoveFormLink").href = DEFAULT_LALAMOVE_FORM_URL;
    renderPaymentDetails();
    renderSocialLinks();
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
            <div class="productActions">
              <button class="btn secondary addCartBtn" ${soldOut ? "disabled" : ""} onclick="add('${escapeHtml(p.id)}')">${soldOut ? "Sold Out" : "Add to Cart"}</button>
              <button class="btn buyNowBtn" ${soldOut ? "disabled" : ""} onclick="buyNow('${escapeHtml(p.id)}')">${soldOut ? "Unavailable" : "Buy Now"}</button>
            </div>
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
  else cart.push({
    id: product.id,
    name: product.name,
    price: Number(product.price),
    imageUrl: product.imageUrl,
    qty: 1
  });

  save();
  showAddedToCartToast(product);
}

function buyNow(id) {
  openCheckout("buyNow", id);
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
      <img src="${escapeHtml(imageSrc(item.imageUrl, 500))}" alt="${escapeHtml(item.name)}" onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}'">
      <div>
        <b>${escapeHtml(item.name)}</b>
        <div>${peso(item.price)} each</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
          <button type="button" onclick="changeQty(${index},-1)">−</button>
          <strong>${item.qty}</strong>
          <button type="button" onclick="changeQty(${index},1)">+</button>
        </div>
      </div>
      <button onclick="cart.splice(${index},1);save()">×</button>
    </div>
  `).join("") || "<p style='padding:18px'>Cart is empty.</p>";

  $("total").textContent = peso(cartTotal());
  renderPaymentDetails();
}

function openCart() {
  $("cart").classList.add("open");
  $("overlay").classList.remove("hide");
}

function closeCart() {
  $("cart").classList.remove("open");
  $("overlay").classList.add("hide");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[c]);
}

function formatDate(value) {
  const d = new Date(value);
  return !value || Number.isNaN(d.getTime())
    ? String(value || "")
    : d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function setRequired(form, names, required) {
  names.forEach(name => {
    const field = form.elements[name];
    if (field) field.required = required;
  });
}

function syncBaseCustomerToLbc() {
  const form = $("checkoutForm");
  if (!form.lbcReceiverName.value.trim()) form.lbcReceiverName.value = form.customerName.value.trim();
  if (!form.lbcMobile.value.trim()) form.lbcMobile.value = form.mobile.value.trim();
  if (!form.lbcEmail.value.trim()) form.lbcEmail.value = form.email.value.trim();
}

function toggleLbcServiceType() {
  const form = $("checkoutForm");
  const isLbc = form.deliveryMethod.value === "lbc";
  const isBranch = isLbc && form.lbcServiceType.value === "Branch Pickup";

  $("lbcDoorFields").classList.toggle("hide", !isLbc || isBranch);
  $("lbcBranchFields").classList.toggle("hide", !isBranch);

  setRequired(form, [
    "lbcProvince",
    "lbcCity",
    "lbcBarangay",
    "lbcPostalCode",
    "lbcHouseUnit",
    "lbcStreet"
  ], isLbc && !isBranch);

  setRequired(form, [
    "lbcBranchProvince",
    "lbcBranchCity",
    "lbcBranchName",
    "lbcValidIdName"
  ], isBranch);
}

function toggleDeliveryFields() {
  const form = $("checkoutForm");
  const method = form.deliveryMethod.value;
  const isLalamove = method === "lalamove";
  const isLbc = method === "lbc";

  $("lalamoveFields").classList.toggle("hide", !isLalamove);
  $("lbcFields").classList.toggle("hide", !isLbc);

  form.lalamoveCompleted.required = isLalamove;
  setRequired(form, ["lbcReceiverName", "lbcMobile", "lbcServiceType"], isLbc);

  if (isLbc) syncBaseCustomerToLbc();
  toggleLbcServiceType();
}

function buildLbcPayload(form) {
  return {
    receiverName: form.lbcReceiverName.value.trim(),
    mobile: form.lbcMobile.value.trim(),
    email: form.lbcEmail.value.trim(),
    serviceType: form.lbcServiceType.value,
    province: form.lbcProvince.value.trim(),
    cityMunicipality: form.lbcCity.value.trim(),
    barangay: form.lbcBarangay.value.trim(),
    postalCode: form.lbcPostalCode.value.trim(),
    houseUnit: form.lbcHouseUnit.value.trim(),
    streetSubdivision: form.lbcStreet.value.trim(),
    landmark: form.lbcLandmark.value.trim(),
    branchProvince: form.lbcBranchProvince.value.trim(),
    branchCity: form.lbcBranchCity.value.trim(),
    branchName: form.lbcBranchName.value.trim(),
    validIdName: form.lbcValidIdName.value.trim(),
    instructions: form.lbcInstructions.value.trim()
  };
}

safeImage($("logo"));
safeImage($("heroImage"));

$("filter").onchange = renderProducts;
$("trackOrderBtn").onclick = () => openTrackOrder();
$("closeTrackOrder").onclick = () => $("trackOrderDlg").close();
$("trackThisOrderBtn").onclick = () => {
  $("orderSuccessDlg").close();
  openTrackOrder(lastSubmittedOrder ? {
    orderId: lastSubmittedOrder.orderId,
    email: lastSubmittedOrder.email,
    mobile: lastSubmittedOrder.mobile
  } : null);
};
$("cartBtn").onclick = openCart;
$("closeCart").onclick = $("overlay").onclick = closeCart;

$("checkout").onclick = () => openCheckout("cart");

$("closeDlg").onclick = () => {
  $("checkoutDlg").close();
  checkoutMode = "cart";
  buyNowItem = null;
};
$("openReview").onclick = () => $("reviewDlg").showModal();
$("closeReview").onclick = () => $("reviewDlg").close();

$("deliveryMethod").onchange = toggleDeliveryFields;
$("lbcServiceType").onchange = toggleLbcServiceType;
document.querySelectorAll('input[name="paymentMethod"]').forEach(input => {
  input.onchange = renderPaymentDetails;
});
$("downloadQrBtn").onclick = downloadPaymentQr;
$("viewQrBtn").onclick = viewPaymentQr;
$("floatingChatBtn").onclick = openSellerChat;
$("sendOrderSellerBtn").onclick = copyOrderAndOpenSeller;
$("copyOrderBtn").onclick = copyLastOrder;
$("closeOrderSuccess").onclick = () => $("orderSuccessDlg").close();
$("continueShoppingBtn").onclick = () => $("orderSuccessDlg").close();

$("checkoutForm").customerName.addEventListener("change", () => {
  const form = $("checkoutForm");
  if (form.deliveryMethod.value === "lbc" && !form.lbcReceiverName.value.trim()) {
    form.lbcReceiverName.value = form.customerName.value.trim();
  }
});

$("checkoutForm").mobile.addEventListener("change", () => {
  const form = $("checkoutForm");
  if (form.deliveryMethod.value === "lbc" && !form.lbcMobile.value.trim()) {
    form.lbcMobile.value = form.mobile.value.trim();
  }
});

$("checkoutForm").email.addEventListener("change", () => {
  const form = $("checkoutForm");
  if (form.deliveryMethod.value === "lbc" && !form.lbcEmail.value.trim()) {
    form.lbcEmail.value = form.email.value.trim();
  }
});

$("trackOrderForm").onsubmit = async event => {
  event.preventDefault();
  const form = event.target;
  const orderId = form.orderId.value.trim();
  const contact = form.contact.value.trim();

  $("trackOrderStatus").textContent = "Checking order...";
  $("trackOrderResult").classList.add("hide");

  try {
    const result = await api("trackOrder", {orderId, contact});
    $("trackOrderStatus").textContent = "";
    renderTrackingResult(result.order);
    localStorage.setItem("kap_last_order_lookup", JSON.stringify({orderId, contact}));
  } catch (err) {
    $("trackOrderStatus").textContent = err.message;
    $("trackOrderResult").innerHTML = "";
  }
};

$("checkoutForm").onsubmit = async event => {
  event.preventDefault();
  const form = event.target;
  const file = form.proof.files[0];
  const deliveryMethod = form.deliveryMethod.value;
  const paymentMethod = selectedPaymentMethod(form);
  const checkoutItems = getCheckoutItems();

  toggleDeliveryFields();

  if (!form.reportValidity()) return;
  if (!checkoutItems.length) return alert("There are no items to checkout.");
  if (!file) return alert("Please upload your proof of payment.");

  if (deliveryMethod === "lalamove" && !form.lalamoveCompleted.checked) {
    $("status").textContent = "Please complete the Lalamove delivery form and confirm the checkbox.";
    return;
  }

  $("status").textContent = "Optimizing image and submitting...";

  try {
    const data = await api("createOrder", {
      order: {
        customerName: form.customerName.value.trim(),
        mobile: form.mobile.value.trim(),
        email: form.email.value.trim(),
        address: form.address.value.trim(),
        notes: form.notes.value.trim(),
        items: checkoutItems,
        deliveryMethod,
        paymentMethod,
        lalamoveFormCompleted: form.lalamoveCompleted.checked,
        lbc: deliveryMethod === "lbc" ? buildLbcPayload(form) : {},
        proofData: await optimizeImage(file, 1600, 0.84),
        proofName: file.name
      }
    });

    const submittedOrder = {
      orderId: data.orderId,
      total: data.total,
      paymentSummary: data.paymentSummary,
      deliverySummary: data.deliverySummary,
      customerName: form.customerName.value.trim(),
      mobile: form.mobile.value.trim(),
      email: form.email.value.trim(),
      items: checkoutItems.map(item => ({
        name: item.name,
        qty: Number(item.qty),
        price: Number(item.price)
      }))
    };

    $("status").textContent = `Order submitted: ${data.orderId}. Waiting for admin payment approval.`;

    if (checkoutMode === "cart") {
      cart = [];
      save();
    }

    checkoutMode = "cart";
    buyNowItem = null;
    form.reset();
    toggleDeliveryFields();
    $("checkoutDlg").close();
    await load(true);
    showOrderSuccess(submittedOrder);
  } catch (err) {
    $("status").textContent = err.message;
  }
};

$("reviewForm").onsubmit = async event => {
  event.preventDefault();
  const form = event.target;
  const file = form.reviewImage.files[0];
  $("reviewStatus").textContent = "Submitting review...";

  try {
    await api("createReview", {
      review: {
        customerName: form.customerName.value.trim(),
        productId: form.productId.value,
        rating: Number(form.rating.value),
        reviewText: form.reviewText.value.trim(),
        imageData: file ? await optimizeImage(file, 1600, 0.84) : "",
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

toggleDeliveryFields();
load();
renderCart();

setInterval(() => load(true), 60000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) load(true);
});
