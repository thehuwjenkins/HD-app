function printJob(id) {
  let j = db.jobs.find((x) => x.id === id);
  if (!j) return;
  let shortages = jobShortages(j);
  let rows = (j.kit || [])
    .map((k) => {
      let issue = shortages.find((s) => s.name === k.item);
      return `<tr><td style="width:40px">☐</td><td>${esc(k.item)}</td><td>${k.qty}</td><td>${issue ? "SHORT " + issue.short : "—"}</td></tr>`;
    })
    .join("");
  let markup = `<div class="print-sheet"><div class="print-head"><h1>HD EVENTS · JOB SHEET</h1><div>Job #${j.id}</div></div><h2>${esc(j.title)}</h2><div class="print-info"><div><b>Client:</b> ${esc(j.client)}</div><div><b>Venue:</b> ${esc(j.venue)}</div><div><b>Contact:</b> ${esc(j.contact)}</div><div><b>Allocation:</b> ${esc(j.start)} to ${esc(j.end)}</div><div><b>Load-in / show:</b> ${esc(j.load)}</div></div><div class="print-section"><h2>Equipment prep / loading list</h2><table><thead><tr><th>Packed</th><th>Equipment</th><th>Qty</th><th>Availability</th></tr></thead><tbody>${rows}</tbody></table></div><div class="print-section"><h2>Notes / crew</h2><p style="white-space:pre-wrap;color:#111">${esc(j.notes)}</p></div><div class="print-section"><h2>Shortfall / cross-hire</h2>${shortages.length ? shortages.map((x) => `<p style="color:#111">${esc(x.name)} — ${x.short} short</p>`).join("") : '<p style="color:#111">No shortages detected</p>'}</div><div class="print-section"><b>Prepared by:</b> ____________________ &nbsp;&nbsp; <b>Checked by:</b> ____________________</div></div>`;
  let existing = $("printArea");
  if (existing) existing.remove();
  let area = document.createElement("div");
  area.id = "printArea";
  area.style.display = "none";
  area.innerHTML = markup;
  document.body.appendChild(area);
  let style = document.createElement("style");
  style.id = "printStyle";
  style.textContent = "@media print{body>.app{display:none!important}#printArea{display:block!important}}";
  document.head.appendChild(style);
  window.print();
  setTimeout(() => {
    area.remove();
    style.remove();
  }, 1000);
}
function printQuote(id) {
  const j = db.jobs.find((x) => String(x.id) === String(id));
  if (!j) return;
  const c = db.clients.find((x) => String(x.id) === String(j.clientId)) || {};
  const info = db.company || {};
  const lines = j.kit || [];
  const totals = cats
    .map((cat) => ({
      name: cat,
      total: lines
        .filter((k) => (k.category || "Audio") === cat)
        .reduce((sum, k) => sum + (Number(k.qty) || 0) * (Number(k.price) || 0), 0),
    }))
    .filter((x) => x.total > 0);
  const total = Math.max(0, totals.reduce((sum, x) => sum + x.total, 0) - (Number(j.discount) || 0));
  const field = (v) => esc(v || "");
  const company = [info.name || "HD Events", info.address, info.email, info.phone, info.website]
    .filter(Boolean)
    .map(field)
    .join("<br>");
  const customer = [c.company, c.name || j.client, c.address, c.email, c.phone]
    .filter(Boolean)
    .map(field)
    .join("<br>");
  const markup = `<div class="print-sheet" style="font-family:Arial,sans-serif;color:#17202b;background:white;padding:30px;max-width:800px;margin:auto">
 <div style="display:flex;justify-content:space-between;gap:30px;border-bottom:2px solid #17202b;padding-bottom:20px">
 <div>${db.branding?.logo ? `<img src="${esc(db.branding.logo)}" style="max-height:75px;max-width:220px;object-fit:contain"><br>` : ""}<strong>${company}</strong></div><div style="text-align:right"><h1 style="margin:0">QUOTATION</h1><p>Reference: ${field(j.id)}</p><p>Date: ${new Date().toLocaleDateString("en-GB")}</p></div></div>
 <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:25px 0"><div><b>Prepared for</b><p style="line-height:1.6">${customer || "Client details not entered"}</p></div><div><b>Job details</b><p>${field(j.title)}<br>${field(j.venue)}<br>${field(j.start)} to ${field(j.end)}</p></div></div>
 <h2>Quotation summary</h2><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;border-bottom:1px solid #888;padding:12px">Service</th><th style="text-align:right;border-bottom:1px solid #888;padding:12px">Total</th></tr></thead><tbody>${totals.map((x) => `<tr><td style="padding:12px;border-bottom:1px solid #ddd">${field(x.name)}</td><td style="padding:12px;border-bottom:1px solid #ddd;text-align:right">${money(x.total)}</td></tr>`).join("")}<tr><th style="text-align:left;padding:14px">Total (excluding VAT, if applicable)</th><th style="text-align:right;padding:14px">${money(total)}</th></tr></tbody></table>
 <p style="margin-top:35px;font-size:12px">Draft quotation. VAT status, payment terms and company details must be verified before sending.</p></div>`;
  const popup = window.open("", "_blank");
  if (!popup) {
    alert("Please allow pop-ups to open the quotation preview.");
    return;
  }
  popup.document.open();
  popup.document.write(
    '<!doctype html><html><head><meta charset="utf-8"><title>HD Events quotation</title><style>body{margin:0;background:white;color:#17202b} .actions{padding:12px;background:#eef2f6;text-align:center}button{padding:10px 18px;cursor:pointer}@media print{.actions{display:none!important}@page{size:A4;margin:12mm}}</style></head><body><div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div>' +
      markup +
      "</body></html>",
  );
  popup.document.close();
}
function printMarkup(markup) {
  if (db.branding?.logo) {
    markup =
      `<div style="padding:8px 0 18px;border-bottom:2px solid #222;margin-bottom:16px"><img src="${esc(db.branding.logo)}" alt="HD Events logo" style="max-width:210px;max-height:85px;object-fit:contain"></div>` +
      markup;
  }
  let area = document.createElement("div");
  area.id = "printArea";
  area.style.display = "none";
  area.innerHTML = markup;
  document.body.appendChild(area);
  let style = document.createElement("style");
  style.id = "printStyle";
  style.textContent = "@media print{body>.app{display:none!important}#printArea{display:block!important}}";
  document.head.appendChild(style);
  window.print();
  setTimeout(() => {
    area.remove();
    style.remove();
  }, 1200);
}
