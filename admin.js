const API = window.STORE_API_URL;
let pass = sessionStorage.getItem("adminPass") || "";
let data = {};

const $ = id => document.getElementById(id);
const peso = n => new Intl.NumberFormat("en-PH", {
  style:"currency",
  currency:"PHP",
  maximumFractionDigits:0
}).format(Number(n) || 0);

async function api(action, payload = {}) {
  const response = await fetch(API, {
    method:"POST",
    headers:{"Content-Type":"text/plain"},
    body:JSON.stringify({action,passcode:pass,...payload})
  });

  const result = await response.json();
  if (!result.ok) throw new Error(result.error);
  return result;
}

function f64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function stars(rating) {
  const n = Math.max(1, Math.min(5, Number(rating) || 5));
  return "★".repeat(n) + "☆".repeat(5-n);
}

async function load() {
  data = await api("adminGetAll");
  render();
}

function render() {
  const settingsForm = $("settingsForm");
  ["siteName","tagline","gcashName","gcashNumber","paymentNote"].forEach(key => {
    settingsForm[key].value = data.settings[key] || "";
  });

  $("catList").innerHTML = data.categories.map(c => `
    <div class="row">
      <b>${c.name}</b>
      <div class="actions">
        <button onclick="editCat('${c.id}')">Edit</button>
        <button onclick="delCat('${c.id}')">Delete</button>
      </div>
    </div>
  `).join("");

  $("prodForm").categoryId.innerHTML = data.categories.map(c =>
    `<option value="${c.id}">${c.name}</option>`
  ).join("");

  $("prodList").innerHTML = data.products.map(p => `
    <article class="card prodAdmin">
      <img src="${p.imageUrl || "assets/logo.jpg"}">
      <div>
        <h3>${p.name}</h3>
        <p>${peso(p.price)}</p>
        <p><strong>Stock: ${p.stock}</strong> ${Number(p.stock) <= 0 ? "• SOLD OUT" : ""}</p>
        <div class="actions">
          <button onclick="editProd('${p.id}')">Edit</button>
          <button onclick="delProd('${p.id}')">Delete</button>
        </div>
      </div>
    </article>
  `).join("");

  $("ordersBody").innerHTML = (data.orders || []).map(order => {
    const approved = order.stockDeducted === true || String(order.stockDeducted) === "true";

    return `
      <tr>
        <td>${order.createdAt}</td>
        <td>${order.customerName}<br>${order.mobile}</td>
        <td>${order.itemsSummary}<br><small>${approved ? "Inventory deducted" : "Inventory not deducted yet"}</small></td>
        <td>${peso(order.total)}</td>
        <td><a href="${order.proofUrl}" target="_blank">View Proof</a></td>
        <td>
          ${order.status === "Pending" ? `
            <button class="btn" style="margin-bottom:8px" onclick="approvePayment('${order.id}')">
              Approve Payment
            </button><br>
          ` : ""}
          <select onchange="statusOrder('${order.id}',this.value)">
            ${["Pending","Paid","Shipped","Completed","Cancelled"].map(status =>
              `<option value="${status}" ${order.status === status ? "selected" : ""}>
                ${status === "Paid" ? "Paid / Payment Approved" : status}
              </option>`
            ).join("")}
          </select>
        </td>
      </tr>
    `;
  }).join("");

  $("adminReviewsGrid").innerHTML = (data.reviews || []).map(review => `
    <article class="adminReviewCard ${review.imageUrl ? "" : "noPhoto"}">
      ${review.imageUrl ? `<img src="${review.imageUrl}" alt="Review photo">` : ""}
      <div class="adminReviewContent">
        <div class="reviewStars">${stars(review.rating)}</div>
        <h3>${review.customerName}</h3>
        ${review.productName ? `<span class="reviewProduct">${review.productName}</span>` : ""}
        <p>${review.reviewText}</p>
        <div class="adminReviewMeta">${review.createdAt}</div>
        <div style="margin-top:12px">
          <button class="deleteReviewBtn" onclick="deleteReview('${review.id}')">Delete Review</button>
        </div>
      </div>
    </article>
  `).join("") || "<p>No customer reviews yet.</p>";
}

$("loginForm").onsubmit = async event => {
  event.preventDefault();
  pass = $("pass").value;

  try {
    await load();
    sessionStorage.setItem("adminPass", pass);
    $("login").classList.add("hide");
    $("dash").classList.remove("hide");
  } catch (err) {
    $("loginMsg").textContent = err.message;
  }
};

document.querySelectorAll(".tabs button").forEach(button => {
  button.onclick = () => {
    document.querySelectorAll(".tabPanel").forEach(x => x.classList.add("hide"));
    $(button.dataset.tab).classList.remove("hide");
  };
});

$("settingsForm").onsubmit = async event => {
  event.preventDefault();
  const form = event.target;
  const file = form.logoFile.files[0];

  await api("saveSettings", {
    settings: {
      siteName:form.siteName.value,
      tagline:form.tagline.value,
      gcashName:form.gcashName.value,
      gcashNumber:form.gcashNumber.value,
      paymentNote:form.paymentNote.value,
      logoData:file ? await f64(file) : "",
      logoName:file?.name || ""
    }
  });

  $("settingsMsg").textContent = "Saved";
  await load();
};

$("catForm").onsubmit = async event => {
  event.preventDefault();
  const form = event.target;
  await api("saveCategory", {category:{id:form.id.value,name:form.name.value}});
  form.reset();
  await load();
};

function editCat(id) {
  const category = data.categories.find(x => x.id === id);
  const form = $("catForm");
  form.id.value = category.id;
  form.name.value = category.name;
}

async function delCat(id) {
  if (!confirm("Delete category?")) return;
  try {
    await api("deleteCategory", {id});
    await load();
  } catch (err) {
    alert(err.message);
  }
}

$("prodForm").onsubmit = async event => {
  event.preventDefault();
  const form = event.target;
  const file = form.imageFile.files[0];

  try {
    await api("saveProduct", {
      product: {
        id:form.id.value,
        name:form.name.value,
        categoryId:form.categoryId.value,
        price:form.price.value,
        stock:form.stock.value,
        description:form.description.value,
        active:form.active.checked,
        imageData:file ? await f64(file) : "",
        imageName:file?.name || ""
      }
    });

    form.reset();
    form.active.checked = true;
    await load();
  } catch (err) {
    alert(err.message);
  }
};

function editProd(id) {
  const product = data.products.find(x => x.id === id);
  const form = $("prodForm");
  ["id","name","categoryId","price","stock","description"].forEach(key => {
    form[key].value = product[key] ?? "";
  });
  form.active.checked = String(product.active) !== "false";
}

async function delProd(id) {
  if (!confirm("Delete product?")) return;
  try {
    await api("deleteProduct", {id});
    await load();
  } catch (err) {
    alert(err.message);
  }
}

async function approvePayment(id) {
  if (!confirm("Confirm that the GCash payment was received? Stock will be deducted now.")) return;

  try {
    const result = await api("updateOrderStatus", {id,status:"Paid"});
    if (result.inventoryAction === "deducted") {
      alert("Payment approved. Product stock has been deducted.");
    }
    await load();
  } catch (err) {
    alert(err.message);
    await load();
  }
}

async function statusOrder(id, status) {
  try {
    const result = await api("updateOrderStatus", {id,status});
    if (result.inventoryAction === "deducted") alert("Payment approved. Stock deducted.");
    if (result.inventoryAction === "restored") alert("Order cancelled. Stock restored.");
    await load();
  } catch (err) {
    alert(err.message);
    await load();
  }
}

async function deleteReview(id) {
  if (!confirm("Delete this customer review from the website?")) return;

  try {
    await api("deleteReview", {id});
    await load();
  } catch (err) {
    alert(err.message);
  }
}

if (pass) {
  load().then(() => {
    $("login").classList.add("hide");
    $("dash").classList.remove("hide");
  }).catch(() => sessionStorage.removeItem("adminPass"));
}
