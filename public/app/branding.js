function saveCompanyDetails(e) {
  e.preventDefault();
  db.company = Object.fromEntries(new FormData(e.target));
  save();
  render();
}
function updateBrandMark() {
  let el = $("brandMark");
  if (!el) return;
  let b = db.branding || {};
  el.innerHTML = b.logo
    ? `<img src="${esc(b.logo)}" alt="HD Events" style="display:block;max-width:100%;max-height:105px;object-fit:contain">`
    : "HD <span>EVENTS</span>";
}
function branding() {
  let b = db.branding || {};
  return panel(
    "HD Events branding",
    `<h3>Company details for quotations</h3><form class="form" onsubmit="saveCompanyDetails(event)">${[
      ["name", "Trading name"],
      ["address", "Business address"],
      ["email", "Email"],
      ["phone", "Phone"],
      ["website", "Website"],
      ["approverName", "Approver for safety documents (full name)"],
      ["companyNumber", "Company number (if a limited company)"],
      ["vatNumber", "VAT number (leave blank if not VAT registered)"],
      ["paymentDays", "Invoice payment terms in days (e.g. 30)"],
      ["paymentTerms", "Payment terms wording for quotes and invoices"],
      ["bankDetails", "Bank details for invoices (name, sort code, account)"],
    ]
      .map(
        ([key, label]) =>
          `<label><span class="muted">${label}</span><input class="field" name="${key}" value="${esc((db.company || {})[key] || (key === "name" ? "HD Events" : ""))}"></label>`,
      )
      .join(
        "",
      )}<div class="wide"><button class="btn" type="submit">Save company details</button></div></form><hr><p class="hint">Add your actual company logo here. It will appear in the navigation and on printed documents. Changes are saved in the staff workspace.</p><div class="jobcard" style="text-align:center;min-height:130px;display:flex;align-items:center;justify-content:center">${b.logo ? `<img src="${esc(b.logo)}" alt="Current company logo" style="max-height:160px;max-width:90%;object-fit:contain">` : "<strong>HD EVENTS — No logo uploaded yet</strong>"}</div><label class="muted">Choose a PNG, JPEG, SVG or WebP logo (up to 5 MB)</label><input class="field" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onchange="uploadBrandLogo(this)"><div class="toolbar" style="margin-top:15px"><button class="btn secondary" onclick="removeBrandLogo()">Remove logo</button><button class="btn secondary" onclick="go('Overview')">Back to dashboard</button></div><p class="hint">Tip: a transparent PNG or SVG works best on the dark dashboard. Your original artwork is not included until you select it.</p>`,
  );
}
async function uploadBrandLogo(input) {
  let file = input.files && input.files[0];
  if (!file) return;
  let allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
  if (!allowed.includes(file.type)) {
    alert("Choose PNG, JPEG, WebP or SVG.");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert("Please use a logo smaller than 5 MB.");
    return;
  }
  try {
    // The image goes to file storage; the workspace only keeps its address.
    db.branding = { logo: await uploadImage(file, "branding") };
    save();
    render();
  } catch (e) {
    alert("Logo not uploaded. " + e.message);
  }
}
function removeBrandLogo() {
  if (!confirm("Remove the saved logo from this workspace?")) return;
  db.branding = {};
  save();
  render();
}
