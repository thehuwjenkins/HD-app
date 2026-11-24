// Book kit out to a job and back in: tick items one by one or all at once, with quantities.
// Every movement is logged on the job (job.movements); stock counts anything not booked back in as still out.
let bookDraft = null; // { id, dir }

function jobPickRows(j) {
  const t = movementTotals(j);
  return pickItems(j, db.inventory).map(({ item, need }) => {
    const x = t[item] || { out: 0, in: 0 };
    return { item, need, out: x.out, back: x.in, outstanding: Math.max(0, x.out - x.in) };
  });
}
// "6 of 9 out" style progress for job cards.
function bookingProgress(j) {
  const rows = jobPickRows(j);
  if (!rows.length || !(j.movements || []).length) return null;
  const need = rows.reduce((s, r) => s + r.need, 0),
    out = rows.reduce((s, r) => s + Math.min(r.need, r.outstanding), 0),
    back = rows.reduce((s, r) => s + r.back, 0),
    still = rows.reduce((s, r) => s + r.outstanding, 0);
  return { need, out, back, still };
}
function bookingTag(j) {
  const p = bookingProgress(j);
  if (!p) return "";
  const st = stageOf(j);
  if (["returned", "invoiced"].includes(st)) return p.still ? `<span class="tag warning">${p.still} item${p.still > 1 ? "s" : ""} not booked back in</span>` : "";
  if (p.still === 0 && p.back) return `<span class="tag success">All booked back in</span>`;
  if (p.back && p.still) return `<span class="tag">${p.back} back · ${p.still} still out</span>`;
  if (p.out >= p.need) return `<span class="tag success">All ${p.need} booked out</span>`;
  return `<span class="tag">Booked out ${p.out} of ${p.need}</span>`;
}

function openBooking(id, dir) {
  const j = db.jobs.find((x) => x.id === id);
  if (!j) return;
  const st = stageOf(j);
  if (dir === "out" && !["booked", "out"].includes(st)) return alert("Book the job first (Mark as accepted), so the kit is reserved for its dates.");
  bookDraft = { id, dir };
  $("bookDialog")?.remove();
  const root = document.createElement("div");
  root.className = "modal";
  root.id = "bookDialog";
  root.innerHTML = bookingDialog(j, dir);
  document.body.appendChild(root);
}
function bookingDialog(j, dir) {
  const rows = jobPickRows(j).filter((r) => (dir === "out" ? r.need - r.outstanding > 0 : r.outstanding > 0));
  const out = dir === "out";
  const history = (j.movements || []).slice(-8).reverse();
  const when = (s) => new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const body = rows.length
    ? `<table class="book-table"><thead><tr><th><label class="book-all"><input type="checkbox" id="bookAll" onchange="bookSelectAll(this.checked)"> All</label></th><th>Item</th><th class="num">${out ? "On job" : "Out"}</th><th class="num">${out ? "Already out" : "Back"}</th><th>Quantity</th>${out ? "" : "<th>Condition</th>"}</tr></thead><tbody>${rows
        .map((r, n) => {
          const max = out ? r.need - r.outstanding : r.outstanding;
          return `<tr><td><input type="checkbox" class="book-pick" data-n="${n}" aria-label="Select ${esc(r.item)}" onchange="bookCount()"></td><td><b>${esc(r.item)}</b></td><td class="num">${out ? r.need : r.outstanding}</td><td class="num">${out ? r.outstanding : r.back}</td>
            <td><input class="field book-qty" type="number" min="1" max="${max}" value="${max}" data-item="${esc(r.item)}" data-max="${max}" aria-label="How many ${esc(r.item)}" oninput="this.closest('tr').querySelector('.book-pick').checked=true;bookCount()"></td>
            ${out ? "" : `<td><select class="field book-cond" aria-label="Condition of ${esc(r.item)}" onchange="this.nextElementSibling.hidden=this.value==='ok'"><option value="ok">OK</option><option value="damaged">Damaged</option></select><input class="field book-note" hidden placeholder="What's wrong?" maxlength="300"></td>`}</tr>`;
        })
        .join("")}</tbody></table>`
    : `<p class="empty">${out ? "Everything on this job is booked out." : "Nothing is out on this job."}</p>`;
  const p = bookingProgress(j);
  const finish = !out && p && p.still && rows.length ? `<button class="btn ghost" onclick="closeWithMissing(${j.id})">Mark job returned with items still missing</button>` : "";
  return `<div class="panel book-dialog"><div class="line"><h2 style="margin:0">${out ? "Book out" : "Book in"} · ${esc(j.title)}</h2><button class="btn small ghost" onclick="$('bookDialog').remove()">Close</button></div>
    <p class="hint">${out ? "Tick what's going out (or All). Change the quantity if only some are going. Once everything is out, the job moves to Out on hire." : "Tick what's come back (or All). Mark anything damaged and it's added to the job's crew reports. Once everything is back, the job moves to Returned."}</p>
    ${body}
    <div class="toolbar">${rows.length ? `<button class="btn big" id="bookGo" disabled onclick="saveBooking()">${out ? "Book out" : "Book in"} selected</button>` : ""}<button class="btn secondary" onclick="printJob(${j.id})">Picking list</button>${finish}</div>
    ${history.length ? `<details class="book-history"><summary>History (${(j.movements || []).length})</summary>${history.map((m) => `<div class="muted">${when(m.at)} · ${m.dir === "out" ? "Out" : "In"}: ${m.qty} × ${esc(m.item)}${m.condition === "damaged" ? " (damaged)" : ""}${m.by ? " · " + esc(m.by) : ""}</div>`).join("")}</details>` : ""}</div>`;
}
function bookSelectAll(on) {
  document.querySelectorAll("#bookDialog .book-pick").forEach((c) => (c.checked = on));
  bookCount();
}
function bookCount() {
  const picks = [...document.querySelectorAll("#bookDialog .book-pick")];
  const n = picks.filter((c) => c.checked).length;
  const go = $("bookGo");
  if (go) {
    go.disabled = !n;
    go.textContent = `${bookDraft.dir === "out" ? "Book out" : "Book in"} ${n ? n + " selected" : "selected"}`;
  }
  const all = $("bookAll");
  if (all) all.checked = n === picks.length && n > 0;
}
function saveBooking() {
  const { id, dir } = bookDraft;
  const j = db.jobs.find((x) => x.id === id);
  const now = new Date().toISOString(),
    by = me.email || "";
  const moves = [],
    damage = [];
  for (const tr of document.querySelectorAll("#bookDialog tbody tr")) {
    if (!tr.querySelector(".book-pick").checked) continue;
    const q = tr.querySelector(".book-qty"),
      qty = Math.min(Number(q.dataset.max), Math.max(1, Math.round(Number(q.value) || 0)));
    const cond = tr.querySelector(".book-cond")?.value || "ok";
    moves.push({ at: now, by, dir, item: q.dataset.item, qty, ...(cond === "damaged" ? { condition: "damaged" } : {}) });
    if (cond === "damaged")
      damage.push({ id: uid() + damage.length, jobId: id, kind: "damage", item: q.dataset.item, text: (tr.querySelector(".book-note").value.trim() || "Came back damaged") + ` (${qty} booked in)`, by, byName: "Booked in at HQ", at: now });
  }
  if (!moves.length) return;
  j.movements = [...(j.movements || []), ...moves];
  if (damage.length) db.jobReports.push(...damage);
  $("bookDialog").remove();
  const p = bookingProgress(j);
  // The workflow follows the kit: all out → Out on hire; all back → Returned (or Invoiced if the invoice went).
  if (dir === "out" && stageOf(j) === "booked" && p && p.out >= p.need) {
    if (!moveTo(id, "out")) save();
  } else if (dir === "in" && stageOf(j) === "out" && p && p.still === 0) {
    if (!moveTo(id, "returned")) save();
  } else {
    save();
    render();
  }
  toast(`${moves.reduce((s, m) => s + m.qty, 0)} item${moves.length > 1 || moves[0].qty > 1 ? "s" : ""} booked ${dir}${damage.length ? ` · ${damage.length} damage report${damage.length > 1 ? "s" : ""} added` : ""}`);
}
function closeWithMissing(id) {
  const j = db.jobs.find((x) => x.id === id);
  const p = bookingProgress(j);
  if (!confirm(`Mark ${j.title} as returned with ${p.still} item${p.still > 1 ? "s" : ""} still not booked back in?\n\nThey stay counted as out (so they can't be hired to anyone else) until you book them in, or reduce the stock if they're lost.`)) return;
  $("bookDialog")?.remove();
  moveTo(id, "returned");
}
// Kit that should be back by now but hasn't been booked in.
function overdueReturns() {
  const now = Date.now();
  return db.jobs
    .map((j) => ({ j, p: bookingProgress(j) }))
    .filter(({ j, p }) => p && p.still && (["returned", "invoiced"].includes(stageOf(j)) || bounds(j)[1] < now));
}
