function crossHire() {
  let shortages = allShortages();
  return panel(
    "Shortages & cross-hire planning",
    `<p class="hint">Shortages are calculated from overlapping bookings and out-of-service stock. Cross-hire entries are planning notes only; they do not increase available inventory.</p>` +
      (shortages.length
        ? shortages
            .map(
              (s) =>
                `<div class="jobcard"><b>${esc(s.name)}</b><p class="muted">${esc(s.job)} · ${esc(s.start)}–${esc(s.end)}</p><span class="tag warning">Short ${s.short} · Need ${s.required}, own ${s.owned}</span><div class="toolbar"><button class="btn secondary" onclick="planCrossHire('${encodeURIComponent(s.name).replace(/'/g, "%27")}','${encodeURIComponent(s.job).replace(/'/g, "%27")}',${s.short})">Plan cross-hire</button></div></div>`,
            )
            .join("")
        : '<p class="empty">No current shortages detected.</p>') +
      `<h2>Cross-hire requests</h2>` +
      (db.crossHires
        .map(
          (h) =>
            `<div class="jobcard"><b>${esc(h.item)}</b> · ${h.qty} required<p class="muted">${esc(h.job)} · ${esc(h.supplier || "Supplier not assigned")} · ${esc(h.status)}</p><button class="btn secondary" onclick="removeCrossHire(${h.id})">Remove</button></div>`,
        )
        .join("") || '<p class="hint">No cross-hire requests recorded.</p>'),
  );
}
function planCrossHire(item, job, qty) {
  let supplier = prompt("Supplier name (optional):", "");
  if (supplier === null) return;
  db.crossHires.push({
    id: uid(),
    item: decodeURIComponent(item),
    job: decodeURIComponent(job),
    qty,
    supplier,
    status: "Planned — not ordered",
  });
  save();
  render();
}
function removeCrossHire(id) {
  db.crossHires = db.crossHires.filter((x) => x.id !== id);
  save();
  render();
}
