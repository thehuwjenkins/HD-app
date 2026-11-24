// Printable documents: picking list, quote, invoice, inventory, event checklist and van load plan.
// Each opens in its own tab with a clean A4 layout and a "Print / Save as PDF" button.

const PRINT_CSS = `
*{box-sizing:border-box}body{margin:0;background:#e9edf3;color:#111827;font:12px/1.45 Arial,Helvetica,sans-serif}
.actions{position:sticky;top:0;z-index:2;display:flex;gap:10px;justify-content:center;padding:12px;background:#0f1630}
.actions button{font:600 15px Arial,sans-serif;padding:12px 22px;border-radius:999px;border:0;cursor:pointer;background:linear-gradient(120deg,#00808c,#6d35e8);color:#fff}
.actions button.plain{background:#fff;color:#0f1630}
.sheet{background:#fff;max-width:210mm;margin:16px auto;padding:14mm 13mm;box-shadow:0 4px 24px #0002}
.ph{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding-bottom:12px;margin-bottom:14px;border-bottom:3px solid #111827;position:relative}
.ph:after{content:"";position:absolute;left:0;right:0;bottom:-6px;height:3px;background:linear-gradient(90deg,#00eeed,#9145ff)}
.logo{display:block;height:88px;width:auto;max-width:240px;object-fit:contain;object-position:left;margin:-8px 0 -6px -6px}
.co{font-size:11px;color:#374151;margin-top:6px;line-height:1.5}.brand{font:800 20px Arial,sans-serif;letter-spacing:.06em}
.ph-right{text-align:right}.ph-right h1{margin:0 0 4px;font-size:22px;letter-spacing:.04em}.ph-right div{font-size:11px;color:#374151}
h2{font-size:14px;margin:18px 0 6px;padding-bottom:3px;border-bottom:1px solid #9ca3af}h3{font-size:12.5px;margin:12px 0 4px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px}.grid div b{display:inline-block;min-width:92px;color:#374151}
table{width:100%;border-collapse:collapse;margin-top:4px}th,td{border:1px solid #c5ccd6;padding:6px 7px;text-align:left;vertical-align:top}
th{background:#eef1f6;font-size:11px;text-transform:uppercase;letter-spacing:.03em}tr{break-inside:avoid}
td.num,th.num{text-align:right}td.box{width:44px;text-align:center}.box i{display:inline-block;width:14px;height:14px;border:1.5px solid #111827;border-radius:2px}
.cat td{background:#f6f8fb;font-weight:700}.muted{color:#6b7280}.warn{color:#b42318;font-weight:700}.ok{color:#067647;font-weight:700}
.totals{margin-left:auto;width:55%;margin-top:10px}.totals td{border:0;border-bottom:1px solid #e5e7eb}.totals tr.grand td{font-size:15px;font-weight:700;border-top:2px solid #111827}
.note{margin-top:14px;padding:10px 12px;border:1px solid #c5ccd6;border-radius:6px;white-space:pre-wrap}
.sign{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:26px}.sign div{border-top:1px solid #111827;padding-top:4px;font-size:11px;color:#374151}
.foot{margin-top:22px;padding-top:8px;border-top:1px solid #e5e7eb;font-size:10px;color:#6b7280}
svg{max-width:100%;height:auto;display:block;margin:6px 0}.swatch{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px}
.stage-h{break-after:avoid}tr.acc td{font-size:11px;background:#fbfbfd}tr.acc td:nth-child(4){padding-left:18px}.lead-title{font:700 24px/1.2 Arial,sans-serif;margin:16px 0 14px}
@media print{body{background:#fff}.actions{display:none!important}.sheet{box-shadow:none;margin:0;max-width:none;padding:0}
@page{size:A4;margin:12mm}.ph:after,th,.cat td,.swatch,svg{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;

// The HD Events logo for white paper (black wording, coloured wave, transparent background).
const DOC_LOGO = "/logo-print.png";
const pDate = (d) => (d ? fmtDay(String(d).slice(0, 10), { day: "numeric", month: "short", year: "numeric" }) : "");
const pMoney = (n) => "£" + (Number(n) || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Open a document in a new tab. Returns the HTML (handy for checks).
function printDocument(title, ref, body, { foot = "", lead = "" } = {}) {
  const info = db.company || {};
  const logo = db.branding?.docLogo || DOC_LOGO;
  const contact = [info.address, [info.phone, info.email].filter(Boolean).join(" · "), info.website].filter(Boolean).map(esc).join("<br>");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}${ref ? " " + esc(ref) : ""} · ${esc(info.name || "HD Events")}</title><style>${PRINT_CSS}</style></head><body>
  <div class="actions"><button onclick="print()">Print / Save as PDF</button><button class="plain" onclick="close()">Close</button></div>
  <div class="sheet"><div class="ph"><div><img class="logo" src="${esc(new URL(logo, location.href).href)}" alt="${esc(info.name || "HD Events")}"><div class="co">${contact}</div></div>
  <div class="ph-right"><h1>${esc(title.toUpperCase())}</h1>${ref ? `<div>${esc(ref)}</div>` : ""}<div>Printed ${esc(pDate(todayKey()))}</div></div></div>
  ${lead ? `<div class="lead-title">${esc(lead)}</div>` : ""}${body}<div class="foot">${foot || esc(info.name || "HD Events")}${info.companyNumber ? " · Company no. " + esc(info.companyNumber) : ""}${info.vatNumber ? " · VAT no. " + esc(info.vatNumber) : ""}</div></div></body></html>`;
  const w = window.open("", "_blank");
  if (!w) {
    alert("Please allow pop-ups for this site to open printable documents.");
    return html;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  return html;
}

const jobClient = (j) => db.clients.find((x) => String(x.id) === String(j.clientId)) || {};
function jobCrew(j) {
  const names = [];
  const lead = db.staff.find((s) => String(s.id) === String(j.staffId));
  if (lead) names.push(lead.name);
  db.crewInvites.filter((i) => String(i.jobId) === String(j.id)).forEach((i) => {
    const s = db.staff.find((x) => String(x.id) === String(i.staffId));
    if (s && !names.includes(s.name)) names.push(s.name + (i.status ? " (" + i.status + ")" : ""));
  });
  return names;
}
function jobInfoGrid(j) {
  const c = jobClient(j);
  const vehicles = vehicleList().filter((v) => (j.vehicleIds || []).map(String).includes(String(v.id))).map((v) => v.name);
  const rows = [
    ["Client", j.client || c.name],
    ["Contact", [c.name && c.name !== j.client ? c.name : "", j.contact, c.phone].filter(Boolean).join(" · ")],
    ["Venue", j.venue],
    ["Dates", fmtRange(j)],
    ["Load-in / show", j.load],
    ["Crew", jobCrew(j).join(", ")],
    ["Vehicles", vehicles.join(", ")],
    ["Stage", STAGE_LABELS[stageOf(j)]],
  ].filter(([, v]) => v);
  return `<div class="grid">${rows.map(([k, v]) => `<div><b>${k}</b> ${esc(v)}</div>`).join("")}</div>`;
}

// ---------- Picking list (job sheet) ----------
// Every piece of equipment going out, by section, with Out/Back ticks and the details needed to pick it.
function printJob(id) {
  const j = db.jobs.find((x) => x.id === id);
  if (!j) return;
  const short = jobShortages(j);
  const inv = new Map(db.inventory.map((i) => [i.name, i]));
  const kit = (j.kit || []).filter((k) => !isCrewLine(k));
  const crew = (j.kit || []).filter(isCrewLine);
  // Stock items and hired-in kit get picked; services like delivery are listed separately.
  const service = (k) => !inv.has(k.item) && ["Transport", "Install"].includes(k.category);
  const byCat = {};
  // Accessories are listed under their main item rather than in their own section.
  const hasMain = (k) => k.accessoryOf && kit.some((m) => m.item === k.accessoryOf && !m.accessoryOf);
  kit.filter((k) => !service(k) && !hasMain(k)).forEach((k) => (byCat[inv.get(k.item)?.category || k.category || "Audio"] ||= []).push(k));
  const order = (c) => (cats.indexOf(c) + 1 || (c === "Cases" ? 50 : 99));
  const load = loadCheck(j, db.inventory, vehicleList());
  let units = 0;
  const rows = Object.entries(byCat)
    .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
    .map(([cat, lines]) => {
      const count = lines.reduce((n, k) => n + (Number(k.qty) || 0) + kit.filter((x) => x.accessoryOf === k.item && !k.accessoryOf).reduce((m, x) => m + (Number(x.qty) || 0), 0), 0);
      units += count;
      return (
        `<tr class="cat"><td colspan="6">${esc(cat)} <span class="muted">· ${lines.length} line${lines.length > 1 ? "s" : ""}, ${count} item${count > 1 ? "s" : ""}</span></td></tr>` +
        lines
          .sort((a, b) => a.item.localeCompare(b.item))
          .map((k) => {
            const i = inv.get(k.item) || {},
              issue = short.find((x) => x.name === k.item);
            const details = [
              !inv.has(k.item) ? "<b>Hired in / not in stock</b>" : "",
              k.package ? "Part of " + esc(k.package) + " package" : "",
              i.inCase ? "Packed inside another case" : i.lengthCm ? `Case ${i.lengthCm}×${i.widthCm}×${i.heightCm} cm` : "",
              i.stackable === false ? "Don't stack on" : "",
              i.notes ? esc(i.notes) : "",
              issue ? `<span class="warn">SHORT ${issue.short}: cross-hire needed</span>` : "",
            ].filter(Boolean).join(" · ");
            const acc = k.accessoryOf
              ? ""
              : kit
                  .filter((x) => x.accessoryOf === k.item)
                  .map((x) => {
                    const ai = inv.get(x.item) || {};
                    return `<tr class="acc"><td class="box"><i></i></td><td class="box"><i></i></td><td class="num">${x.qty}</td><td>↳ ${esc(x.item)}</td><td class="muted">Accessory of ${esc(k.item)}</td><td class="num">${hasNum(ai.weightKg) ? kg(ai.weightKg * x.qty) : ""}</td></tr>`;
                  })
                  .join("");
            return `<tr><td class="box"><i></i></td><td class="box"><i></i></td><td class="num"><b>${k.qty}</b></td><td><b>${esc(k.item)}</b></td><td>${details}</td><td class="num">${hasNum(i.weightKg) ? kg(i.weightKg * k.qty) : ""}</td></tr>${acc}`;
          })
          .join("")
      );
    })
    .join("");
  const services = kit.filter(service);
  const body = `${jobInfoGrid(j)}
    <h2>Equipment to pick · ${units} item${units === 1 ? "" : "s"}</h2>
    <table><thead><tr><th>Out</th><th>Back</th><th class="num">Qty</th><th>Equipment</th><th>Details</th><th class="num">Weight</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No equipment on this job yet.</td></tr>'}</tbody></table>
    <p>${load.kg ? `<b>Total kit weight:</b> ${kg(load.kg)}${load.payload ? ` of ${kg(load.payload)} payload ${load.over ? '<span class="warn">OVERLOADED</span>' : '<span class="ok">OK</span>'}` : ""}` : ""}${load.unknown.length ? ` <span class="muted">(${load.unknown.length} line${load.unknown.length > 1 ? "s" : ""} without a weight)</span>` : ""}</p>
    ${crew.length || jobCrew(j).length ? `<h2>Crew</h2><p>${crew.map((k) => `<b>${esc(k.item)}</b>: ${crewQtyText(k)}`).join("<br>")}${jobCrew(j).length ? `${crew.length ? "<br>" : ""}<b>Named crew:</b> ${esc(jobCrew(j).join(", "))}` : ""}</p>` : ""}
    ${services.length ? `<h2>Other services</h2><p>${services.map((k) => `${k.qty} × ${esc(k.item)}`).join("<br>")}</p>` : ""}
    ${short.length ? `<h2>Shortages / cross-hire</h2><p>${short.map((x) => `<span class="warn">${esc(x.name)}: ${x.short} short</span>`).join("<br>")}</p>` : ""}
    ${j.notes ? `<h2>Crew and technical notes</h2><div class="note">${esc(j.notes)}</div>` : ""}
    <div class="sign"><div>Picked by / date</div><div>Checked out by / date</div><div>Returned and checked by / date</div></div>`;
  return printDocument("Picking list", "Job " + j.id, body, { lead: j.title });
}

// Quote and invoice figures come from quoteSummary (stock.js), the same code the client's quote page uses.
function jobTotals(j) {
  return quoteSummary(j, { vatRegistered: !!db.company?.vatNumber });
}
// Quote and invoice lines: one row per equipment section; crew itemised (people × days/hours × rate).
function billingTable(j) {
  const t = jobTotals(j);
  const crew = (j.kit || []).filter((k) => isCrewLine(k) && lineTotal(k) > 0);
  const sections = t.totals.filter((x) => x.name !== CREW_CAT);
  const rows =
    sections.map((x) => `<tr><td>${esc(x.name)}${x.name === "Transport" || x.name === "Install" ? "" : " equipment"}</td><td></td><td></td><td class="num">${pMoney(x.total)}</td></tr>`).join("") +
    (crew.length ? `<tr class="cat"><td colspan="4">Crew</td></tr>` + crew.map((k) => `<tr><td>${esc(k.item)}</td><td>${crewQtyText(k)}</td><td class="num">${pMoney(k.price)} / ${k.unit === "hour" ? "hour" : "day"}</td><td class="num">${pMoney(lineTotal(k))}</td></tr>`).join("") : "");
  return `<table><thead><tr><th>Description</th><th style="width:20%">Quantity</th><th class="num" style="width:18%">Rate</th><th class="num" style="width:16%">Total</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No priced items yet.</td></tr>'}</tbody></table>${totalsTable(t)}`;
}
function totalsTable(t) {
  return `<table class="totals"><tbody>${t.discount ? `<tr><td>Subtotal</td><td class="num">${pMoney(t.sub)}</td></tr><tr><td>Discount</td><td class="num">−${pMoney(t.discount)}</td></tr>` : ""}
    ${t.vat ? `<tr><td>Total ex VAT</td><td class="num">${pMoney(t.net)}</td></tr><tr><td>VAT at 20%</td><td class="num">${pMoney(t.vat)}</td></tr>` : ""}
    <tr class="grand"><td>${t.vat ? "Total inc VAT" : "Total"}</td><td class="num">${pMoney(t.gross)}</td></tr></tbody></table>`;
}
function billTo(j) {
  const c = jobClient(j);
  return [c.company, c.name || j.client, c.address, c.email, c.phone].filter(Boolean).map(esc).join("<br>") || "Client details not entered";
}

// ---------- Quote ----------
function printQuote(id) {
  const j = db.jobs.find((x) => String(x.id) === String(id));
  if (!j || !me.money) return;
  const t = jobTotals(j),
    info = db.company || {};
  const body = `<div class="grid"><div><h3>Prepared for</h3>${billTo(j)}</div><div><h3>Event</h3>${esc(j.title)}<br>${esc(j.venue || "")}<br>${esc(fmtRange(j))}</div></div>
    <h2>Quotation</h2>${billingTable(j)}
    <div class="note">${info.vatNumber ? "Prices include VAT at 20% where shown." : "Prices shown are the total payable."} This quotation is valid for 30 days. Equipment is reserved only once the booking is confirmed.${info.paymentTerms ? "\n\nPayment terms: " + esc(info.paymentTerms) : ""}</div>`;
  return printDocument("Quotation", "Ref " + j.id, body, { lead: j.title });
}

// ---------- Invoice ----------
function printInvoice(id) {
  const j = db.jobs.find((x) => String(x.id) === String(id));
  if (!j || !me.owner) return;
  if (!j.invoiceNo) {
    if (!confirm(`Create invoice ${nextInvoiceNo(db.jobs)} for ${j.title}?\n\nThe invoice number and date are saved on the job, so reprints show the same invoice.`)) return;
    j.invoiceNo = nextInvoiceNo(db.jobs);
    j.invoiceDate = todayKey();
    save();
    render();
  }
  const info = db.company || {},
    t = jobTotals(j);
  const days = Number(info.paymentDays) || 30,
    due = addDays(j.invoiceDate, days);
  const body = `<div class="grid"><div><h3>Bill to</h3>${billTo(j)}</div><div><h3>Invoice details</h3><b>Invoice no.</b> ${esc(j.invoiceNo)}<br><b>Invoice date</b> ${esc(pDate(j.invoiceDate))}<br><b>Payment due</b> ${esc(pDate(due))} (${days} days)<br><b>Event dates</b> ${esc(fmtRange(j))}${j.venue ? `<br><b>Venue</b> ${esc(j.venue)}` : ""}</div></div>
    <h2>Services</h2>${billingTable(j)}
    <h2>How to pay</h2><div class="note">${info.bankDetails ? esc(info.bankDetails) : '<span class="warn">Add your bank details under Branding before sending this invoice.</span>'}
Please use ${esc(j.invoiceNo)} as the payment reference.${info.paymentTerms ? "\n" + esc(info.paymentTerms) : ""}${info.vatNumber ? "" : "\nNot VAT registered: no VAT has been charged."}</div>`;
  return printDocument("Invoice", j.invoiceNo, body, { lead: j.title });
}

// ---------- Inventory ----------
function printInventory() {
  const byCat = {};
  [...db.inventory].sort((a, b) => a.name.localeCompare(b.name)).forEach((i) => (byCat[i.category || "Other"] ||= []).push(i));
  const t = inventoryTotals(db.inventory);
  const cols = me.money ? 7 : 5;
  const rows = Object.entries(byCat)
    .sort()
    .map(
      ([cat, list]) =>
        `<tr class="cat"><td colspan="${cols}">${esc(cat)} <span class="muted">(${list.length})</span></td></tr>` +
        list
          .map(
            (i) =>
              `<tr><td>${esc(i.name)}${i.inCase ? ' <span class="muted">(in a case)</span>' : ""}${i.accessories?.length ? `<br><span class="muted">Accessories: ${i.accessories.map((x) => x.qty + " × " + esc(x.item)).join(", ")}</span>` : ""}</td><td class="num">${i.qty}${i.service ? ` <span class="warn">(${i.service} out of service)</span>` : ""}</td><td>${i.lengthCm ? `${i.lengthCm}×${i.widthCm}×${i.heightCm} cm` : ""}</td><td class="num">${weightText(i)}</td><td class="num">${hasNum(i.weightKg) ? kg(i.weightKg * i.qty) : ""}</td>${me.money ? `<td class="num">${valueText(i)}</td><td class="num">${hasNum(i.value) ? pMoney(i.value * i.qty) : ""}</td>` : ""}</tr>`,
          )
          .join(""),
    )
    .join("");
  const body = `<p><b>${t.lines}</b> equipment lines · <b>${t.units}</b> units · total weight <b>${kg(t.weight)}</b>${me.money ? ` · total value <b>${pMoney(t.value)}</b>` : ""}. ~ means an estimate.</p>
    <table><thead><tr><th>Equipment</th><th class="num">Owned</th><th>Size (L×W×H)</th><th class="num">Weight each</th><th class="num">Total weight</th>${me.money ? '<th class="num">Value each</th><th class="num">Total value</th>' : ""}</tr></thead><tbody>${rows || `<tr><td colspan="${cols}">No equipment yet.</td></tr>`}</tbody></table>`;
  return printDocument("Inventory", "", body);
}

// ---------- Event planner checklist ----------
function printPlanChecklist(id) {
  const p = db.plans.find((x) => x.id === id);
  if (!p) return;
  const pr = planProgress(p);
  const stages = p.stages
    .map(
      (s) => `<h2 class="stage-h">${esc(s.name)}</h2><table><thead><tr><th>Done</th><th>Item</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>${s.items
        .map(
          (i) =>
            `<tr><td class="box">${i.status === "done" ? "✓" : i.status === "na" ? "–" : "<i></i>"}</td><td>${esc(i.title)}${i.cert ? ` <span class="muted">· certificate${i.files?.length ? " filed" : " needed"}</span>` : ""}${i.doc ? ` <span class="muted">· ${i.doc.status === "approved" ? "document approved" : "document draft"}</span>` : ""}</td><td>${esc(i.owner || "")}</td><td>${esc(pDate(i.due))}</td><td>${esc(STATUS_LABELS[i.status])}</td></tr>`,
        )
        .join("")}</tbody></table>`,
    )
    .join("");
  const body = `<div class="grid"><div><b>Event</b> ${esc(p.title)}</div><div><b>Date</b> ${esc(pDate(p.eventDate))}${p.endDate ? " to " + esc(pDate(p.endDate)) : ""}</div><div><b>Venue</b> ${esc(p.venue || "")}</div><div><b>Capacity</b> ${p.capacity ? p.capacity.toLocaleString("en-GB") : ""}</div><div><b>Progress</b> ${pr.done} of ${pr.total} done (${pr.pct}%)</div></div>${stages}`;
  return printDocument("Event checklist", p.title, body);
}

// ---------- Van load plan ----------
function printLoadPlan() {
  const j = db.jobs.find((x) => x.id === editingJob) || { title: "New job" };
  const ids = document.getElementById("jobForm") ? chosenVehicles() : j.vehicleIds || [];
  const vehicles = vehicleList().filter((v) => v.lengthCm && v.widthCm && v.heightCm);
  const chosen = ids.length ? vehicles.filter((v) => ids.map(String).includes(String(v.id))) : vehicles.filter((v) => !planLoad(draftKit, db.inventory, [v]).left.length).slice(0, 1);
  if (!chosen.length) return alert("Tick a vehicle with a load space size first.");
  const names = [...new Set(draftKit.map((k) => k.item))];
  const colourOf = (n) => LOAD_COLOURS[names.indexOf(n) % LOAD_COLOURS.length];
  const plan = planLoad(draftKit, db.inventory, chosen);
  const loads = plan.loads
    .map(
      (l) => `<h2>${esc(l.vehicle.name)}: ${l.placed.length} items · ${l.volumePct}% of the space · ${kg(l.kg)}${l.payload ? " of " + kg(l.payload) : ""}${l.over ? ' <span class="warn">OVER PAYLOAD</span>' : ""}</h2>
      ${l.placed.length ? loadDrawing(l, colourOf) + "<h3>From above (numbers = height of load in cm)</h3>" + loadTopView(l, colourOf) : "<p>Nothing loaded.</p>"}
      <h3>Loading order</h3><table><thead><tr><th>Loaded</th><th>#</th><th>Item</th></tr></thead><tbody>${loadOrder(l)
        .map((o, n) => `<tr><td class="box"><i></i></td><td>${n + 1}</td><td><span class="swatch" style="background:${colourOf(o.name)}"></span>${o.n > 1 ? o.n + " × " : ""}${esc(o.name)}${o.onTop ? ' <span class="muted">(stacked on top)</span>' : ""}</td></tr>`)
        .join("")}</tbody></table>`,
    )
    .join("");
  const body = `<div class="grid"><div><b>Job</b> ${esc(j.title)}</div><div><b>Dates</b> ${esc(j.start ? fmtRange(j) : "")}</div></div>
    ${plan.left.length ? `<p class="warn">Won't fit: ${summariseNames(plan.left)}</p>` : ""}${plan.noSize.length ? `<p class="muted">Not shown (no size yet): ${plan.noSize.map((x) => x.qty + " × " + esc(x.name)).join(", ")}</p>` : ""}${loads}
    <p class="muted">Planning aid: wheel arches and odd shapes aren't modelled. Secure every load before travelling.</p>`;
  return printDocument("Van load plan", j.title, body);
}
