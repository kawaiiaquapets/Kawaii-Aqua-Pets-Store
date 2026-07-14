const API = window.STORE_API_URL;
const FALLBACK_IMAGE = "assets/logo.png";
let passcode = sessionStorage.getItem("kap_admin_passcode") || "";
let data = {settings:{},categories:[],products:[],orders:[],reviews:[]};

const $ = id => document.getElementById(id);
const peso = n => new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP",maximumFractionDigits:0}).format(Number(n)||0);

async function api(action,payload={}){
  if(!API||API.includes("PASTE_")) throw new Error("API URL is not configured in config.js");
  const response=await fetch(API,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},cache:"no-store",body:JSON.stringify({action,passcode,...payload,requestTime:Date.now()})});
  const result=await response.json();
  if(!result.ok) throw new Error(result.error||"Request failed");
  return result;
}

function driveImageUrl(value,size=1600){
  const url=String(value||"").trim();
  if(!url)return FALLBACK_IMAGE;
  const m=url.match(/(?:[?&]id=|\/d\/)([-\w]{20,})/);
  return m?`https://drive.google.com/thumbnail?id=${m[1]}&sz=w${size}`:url;
}
function imageSrc(value,size=1600){const u=driveImageUrl(value,size);return u.startsWith("https://drive.google.com/thumbnail")?`${u}&v=${Date.now()}`:u;}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[c]);}
function formatDate(v){const d=new Date(v);return !v||Number.isNaN(d.getTime())?String(v||""):d.toLocaleString("en-PH",{year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});}

async function optimizeImage(file,maxDimension=1600,quality=.86){
  if(!file)return "";
  if(!file.type.startsWith("image/"))throw new Error("Please select a valid image file.");
  if(file.size>10*1024*1024)throw new Error("Original image must be 10 MB or less.");
  const bitmap=await createImageBitmap(file);
  const scale=Math.min(1,maxDimension/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
  const mime=file.type==="image/png"&&file.size<2.5*1024*1024?"image/png":"image/jpeg";
  return canvas.toDataURL(mime,mime==="image/png"?undefined:quality);
}

async function loadAdmin(){
  const result=await api("adminGetAll");
  data={settings:result.settings||{},categories:result.categories||[],products:result.products||[],orders:result.orders||[],reviews:result.reviews||[]};
  renderAll();
}

function renderAll(){renderSettings();renderCategories();renderProducts();renderOrders();renderReviews();}
function renderSettings(){
  const f=$("settingsForm"),s=data.settings;
  ["siteName","tagline","gcashName","gcashNumber","paymentNote"].forEach(k=>f.elements[k].value=s[k]||"");
  const logo=imageSrc(s.logoUrl,1000);
  $("logoPreview").src=logo;$("adminTopLogo").src=logo;$("adminLoginLogo").src=logo;
  $("adminStoreName").textContent=s.siteName||"Kawaii Aqua Pets";
}
function renderCategories(){
  $("catList").innerHTML=data.categories.map(c=>`<div class="adminListRow"><b>${escapeHtml(c.name)}</b><div class="actions"><button onclick="editCategory('${escapeHtml(c.id)}')">Edit</button><button class="danger" onclick="removeCategory('${escapeHtml(c.id)}')">Delete</button></div></div>`).join("")||"<p>No categories yet.</p>";
  $("prodForm").elements.categoryId.innerHTML='<option value="">Select category</option>'+data.categories.map(c=>`<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("");
}
function renderProducts(){
  $("prodList").innerHTML=data.products.map(p=>`<article class="card prodAdmin"><img src="${escapeHtml(imageSrc(p.imageUrl,900))}" onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}'"><div><small>${escapeHtml(p.categoryName||"")}</small><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.description||"")}</p><p><b>${peso(p.price)}</b> • Stock: ${Number(p.stock)||0} • ${String(p.active)==="false"?"Hidden":"Visible"}</p><div class="actions"><button onclick="editProduct('${escapeHtml(p.id)}')">Edit</button><button class="danger" onclick="removeProduct('${escapeHtml(p.id)}')">Delete</button></div></div></article>`).join("")||"<p>No products yet.</p>";
}
function renderOrders(){
  const statuses=["Pending","Paid","Shipped","Completed","Cancelled"];
  $("ordersBody").innerHTML=data.orders.map(o=>`<tr><td>${escapeHtml(formatDate(o.createdAt))}</td><td><b>${escapeHtml(o.customerName)}</b><br><small>${escapeHtml(o.mobile)}<br>${escapeHtml(o.address)}</small></td><td>${escapeHtml(o.itemsSummary||"")}</td><td>${peso(o.total)}</td><td>${o.proofUrl?`<a href="${escapeHtml(imageSrc(o.proofUrl))}" target="_blank">View proof</a>`:"—"}</td><td><select onchange="changeOrderStatus('${escapeHtml(o.id)}',this.value)">${statuses.map(s=>`<option value="${s}" ${s===o.status?"selected":""}>${s}</option>`).join("")}</select></td></tr>`).join("")||'<tr><td colspan="6">No orders yet.</td></tr>';
}
function renderReviews(){
  $("adminReviewsGrid").innerHTML=data.reviews.map(r=>`<article class="adminReviewCard ${r.imageUrl?"":"noPhoto"}">${r.imageUrl?`<img src="${escapeHtml(imageSrc(r.imageUrl,700))}" onerror="this.style.display='none'">`:""}<div class="adminReviewContent"><div class="reviewStars">${"★".repeat(Number(r.rating)||5)}</div><h3>${escapeHtml(r.customerName)}</h3>${r.productName?`<span class="reviewProduct">${escapeHtml(r.productName)}</span>`:""}<p>${escapeHtml(r.reviewText)}</p><div class="adminReviewMeta">${escapeHtml(formatDate(r.createdAt))}</div><button class="deleteReviewBtn" onclick="removeReview('${escapeHtml(r.id)}')">Delete Review</button></div></article>`).join("")||"<p>No reviews yet.</p>";
}

window.editCategory=id=>{const c=data.categories.find(x=>x.id===id);if(!c)return;const f=$("catForm");f.elements.id.value=c.id;f.elements.name.value=c.name;f.elements.name.focus();};
window.removeCategory=async id=>{if(!confirm("Delete this category?"))return;try{await api("deleteCategory",{id});await loadAdmin();}catch(e){alert(e.message);}};
window.editProduct=id=>{const p=data.products.find(x=>x.id===id);if(!p)return;const f=$("prodForm");f.elements.id.value=p.id;f.elements.name.value=p.name;f.elements.categoryId.value=p.categoryId;f.elements.price.value=p.price;f.elements.stock.value=p.stock;f.elements.description.value=p.description||"";f.elements.active.checked=String(p.active)!=="false";$("productPreview").src=imageSrc(p.imageUrl,1000);document.querySelector('[data-tab="products"]').click();window.scrollTo({top:0,behavior:"smooth"});};
window.removeProduct=async id=>{if(!confirm("Delete this product and its stored image?"))return;try{await api("deleteProduct",{id});await loadAdmin();}catch(e){alert(e.message);}};
window.changeOrderStatus=async(id,status)=>{try{const r=await api("updateOrderStatus",{id,status});if(r.inventoryAction==="deducted")alert("Payment approved. Stock was deducted.");if(r.inventoryAction==="restored")alert("Order cancelled. Stock was restored.");await loadAdmin();}catch(e){alert(e.message);await loadAdmin();}};
window.removeReview=async id=>{if(!confirm("Delete this review and its photo?"))return;try{await api("deleteReview",{id});await loadAdmin();}catch(e){alert(e.message);}};

function clearProductForm(){const f=$("prodForm");f.reset();f.elements.id.value="";f.elements.stock.value=1;f.elements.active.checked=true;$("productPreview").src=FALLBACK_IMAGE;$("prodMsg").textContent="";}

$("loginForm").onsubmit=async e=>{e.preventDefault();passcode=$("pass").value;$("loginMsg").textContent="Checking...";try{await loadAdmin();sessionStorage.setItem("kap_admin_passcode",passcode);$("login").classList.add("hide");$("dash").classList.remove("hide");$("loginMsg").textContent="";}catch(err){$("loginMsg").textContent=err.message;passcode="";}};

$("settingsForm").onsubmit=async e=>{e.preventDefault();const f=e.target,file=f.logoFile.files[0];$("settingsMsg").textContent="Saving...";try{await api("saveSettings",{settings:{siteName:f.siteName.value.trim(),tagline:f.tagline.value.trim(),gcashName:f.gcashName.value.trim(),gcashNumber:f.gcashNumber.value.trim(),paymentNote:f.paymentNote.value.trim(),logoData:file?await optimizeImage(file,1400,.9):"",logoName:file?file.name:""}});f.logoFile.value="";await loadAdmin();$("settingsMsg").textContent="Settings saved. The new logo now uses a permanent public image link.";}catch(err){$("settingsMsg").textContent=err.message;}};

$("catForm").onsubmit=async e=>{e.preventDefault();const f=e.target;try{await api("saveCategory",{category:{id:f.id.value,name:f.name.value.trim()}});f.reset();await loadAdmin();}catch(err){alert(err.message);}};

$("prodForm").onsubmit=async e=>{e.preventDefault();const f=e.target,file=f.imageFile.files[0];if(!f.id.value&&!file){$("prodMsg").textContent="Please select a product image for a new product.";return;}$("prodMsg").textContent="Optimizing image and saving...";try{await api("saveProduct",{product:{id:f.id.value,name:f.name.value.trim(),categoryId:f.categoryId.value,price:Number(f.price.value),stock:Number(f.stock.value),description:f.description.value.trim(),active:f.active.checked,imageData:file?await optimizeImage(file,1600,.86):"",imageName:file?file.name:""}});clearProductForm();await loadAdmin();$("prodMsg").textContent="Product saved successfully.";}catch(err){$("prodMsg").textContent=err.message;}};

$("cancelProductEdit").onclick=clearProductForm;
$("settingsForm").logoFile.onchange=e=>{const f=e.target.files[0];if(f)$("logoPreview").src=URL.createObjectURL(f);};
$("prodForm").imageFile.onchange=e=>{const f=e.target.files[0];if(f)$("productPreview").src=URL.createObjectURL(f);};

document.querySelectorAll("[data-tab]").forEach(btn=>btn.onclick=()=>{document.querySelectorAll(".tabPanel").forEach(p=>p.classList.add("hide"));$(btn.dataset.tab).classList.remove("hide");});

if(passcode){loadAdmin().then(()=>{$("login").classList.add("hide");$("dash").classList.remove("hide");}).catch(()=>{sessionStorage.removeItem("kap_admin_passcode");passcode="";});}
