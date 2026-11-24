// Van load planner: packs a job's kit into the vans and trailers and draws the result.
const LOAD_COLOURS = ["#0e9aa7", "#6d35e8", "#e8833a", "#2f6fd0", "#d1497a", "#3a9d5d", "#b8860b", "#7a4fd1", "#c0392b", "#16a085", "#8e5a2b", "#5a6b7d"];

// 3D picture (oblique view: van length left to right, cab on the left, depth going back and up).
function loadDrawing(load, colourOf) {
  const v = load.vehicle,
    L = +v.lengthCm,
    W = +v.widthCm,
    H = +v.heightCm;
  const dx = 0.5,
    dy = 0.32; // how far one cm of depth moves right and up
  const pad = 14,
    width = 760;
  const s = (width - pad * 2) / (L + W * dx);
  const height = Math.ceil((H + W * dy) * s + pad * 2);
  const P = (x, y, z) => [pad + (x + y * dx) * s, height - pad - (z + y * dy) * s];
  const poly = (pts, fill, stroke = "#1b2436", extra = "") => `<polygon points="${pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ")}" fill="${fill}" stroke="${stroke}" stroke-width="0.8" stroke-linejoin="round" ${extra}/>`;
  const shade = (hex, f) => {
    const n = parseInt(hex.slice(1), 16),
      c = [n >> 16, (n >> 8) & 255, n & 255].map((x) => Math.round(f > 1 ? x + (255 - x) * (f - 1) : x * f));
    return "rgb(" + c.join(",") + ")";
  };
  // Van: floor, cab bulkhead and far wall.
  let svg = poly([P(0, 0, 0), P(L, 0, 0), P(L, W, 0), P(0, W, 0)], "#eef1f6", "#9aa5b5");
  svg += poly([P(0, W, 0), P(L, W, 0), P(L, W, H), P(0, W, H)], "#f5f7fa", "#c2cad6");
  svg += poly([P(0, 0, 0), P(0, W, 0), P(0, W, H), P(0, 0, H)], "#e3e8f0", "#9aa5b5");
  const boxes = [...load.placed].sort((a, b) => b.y - a.y || a.x - b.x || a.z - b.z);
  for (const b of boxes) {
    const c = colourOf(b.name),
      x1 = b.x + b.l,
      y1 = b.y + b.w,
      z1 = b.z + b.h;
    svg += `<g><title>${esc(b.name)} · ${b.l}×${b.w}×${b.h} cm${b.kg ? " · " + b.kg + " kg" : ""}${b.stackable ? "" : " · don't stack on"}</title>`;
    svg += poly([P(b.x, b.y, b.z), P(x1, b.y, b.z), P(x1, b.y, z1), P(b.x, b.y, z1)], c); // front
    svg += poly([P(x1, b.y, b.z), P(x1, y1, b.z), P(x1, y1, z1), P(x1, b.y, z1)], shade(c, 0.72)); // rear-door end
    svg += poly([P(b.x, b.y, z1), P(x1, b.y, z1), P(x1, y1, z1), P(b.x, y1, z1)], shade(c, b.stackable ? 1.35 : 1.6), "#1b2436", b.stackable ? "" : 'stroke-dasharray="3 2"'); // top
    svg += "</g>";
  }
  // Open edges of the load space, dashed.
  svg += `<polyline points="${[P(0, 0, H), P(L, 0, H), P(L, W, H)].map((p) => p.join(",")).join(" ")}" fill="none" stroke="#9aa5b5" stroke-dasharray="5 4"/>`;
  svg += `<line x1="${P(L, 0, 0)[0]}" y1="${P(L, 0, 0)[1]}" x2="${P(L, 0, H)[0]}" y2="${P(L, 0, H)[1]}" stroke="#9aa5b5" stroke-dasharray="5 4"/>`;
  const [cx, cy] = P(0, 0, 0);
  svg += `<text x="${cx}" y="${cy + 12}" font-size="12" fill="#556070">Cab end</text>`;
  const [rx, ry] = P(L, 0, 0);
  svg += `<text x="${rx - 4}" y="${ry + 12}" font-size="12" fill="#556070" text-anchor="end">Rear doors</text>`;
  return `<svg class="load-svg" viewBox="0 0 ${width} ${height + 14}" role="img" aria-label="Load plan for ${esc(v.name)}">${svg}</svg>`;
}

// View from above: what you see looking down into the van (the top box at each spot).
function loadTopView(load, colourOf) {
  const v = load.vehicle,
    L = +v.lengthCm,
    W = +v.widthCm,
    width = 760,
    pad = 14;
  const s = (width - pad * 2) / L,
    height = Math.ceil(W * s + pad * 2);
  let svg = `<rect x="${pad}" y="${pad}" width="${L * s}" height="${W * s}" fill="#eef1f6" stroke="#9aa5b5"/>`;
  for (const b of [...load.placed].sort((a, c) => a.z + a.h - (c.z + c.h))) {
    svg += `<g><title>${esc(b.name)}${b.z ? " (stacked, top at " + (b.z + b.h) + " cm)" : ""}</title><rect x="${(pad + b.x * s).toFixed(1)}" y="${(pad + b.y * s).toFixed(1)}" width="${(b.l * s).toFixed(1)}" height="${(b.w * s).toFixed(1)}" fill="${colourOf(b.name)}" stroke="#1b2436" stroke-width="0.8"/>`;
    if (b.l * s > 34 && b.w * s > 16) svg += `<text x="${(pad + (b.x + b.l / 2) * s).toFixed(1)}" y="${(pad + (b.y + b.w / 2) * s + 4).toFixed(1)}" font-size="11" fill="#fff" text-anchor="middle">${Math.round(b.z + b.h)}</text>`;
    svg += "</g>";
  }
  svg += `<text x="${pad}" y="${height - 1}" font-size="12" fill="#556070">Cab end</text><text x="${pad + L * s}" y="${height - 1}" font-size="12" fill="#556070" text-anchor="end">Rear doors</text>`;
  return `<svg class="load-svg top" viewBox="0 0 ${width} ${height + 4}" role="img" aria-label="Load seen from above">${svg}</svg>`;
}
// Loading order: cab end first, floor before stacked.
function loadOrder(load) {
  const seq = [...load.placed].sort((a, b) => a.x - b.x || a.z - b.z || a.y - b.y);
  const out = [];
  for (const b of seq) {
    const last = out[out.length - 1];
    if (last && last.name === b.name && last.onTop === b.z > 0) last.n++;
    else out.push({ name: b.name, n: 1, onTop: b.z > 0 });
  }
  return out;
}

function loadPlanner(jobKit, vehicleIds) {
  const vehicles = vehicleList();
  const sized = vehicles.filter((v) => v.lengthCm && v.widthCm && v.heightCm);
  const names = [...new Set(jobKit.map((k) => k.item))];
  const colourOf = (n) => LOAD_COLOURS[names.indexOf(n) % LOAD_COLOURS.length];
  if (!sized.length) return `<p class="hint">Add the load space size (length, width and height inside) to your vans and trailers under Inventory first.</p>`;
  // Which single vehicle could take everything?
  const each = sized.map((v) => ({ v, r: planLoad(jobKit, db.inventory, [v]) }));
  const fitsTable = `<table class="fit-table"><thead><tr><th>Vehicle</th><th>Fits?</th><th>Space used</th><th>Weight</th></tr></thead><tbody>${each
    .map(({ v, r }) => {
      const l = r.loads[0],
        fits = !r.left.length && !l.over;
      return `<tr><td><b>${esc(v.name)}</b></td><td>${fits ? '<span class="tag success">Fits</span>' : r.left.length ? `<span class="tag warning">${r.left.length} won't fit</span>` : '<span class="tag warning">Over weight</span>'}</td><td>${l.volumePct}%</td><td>${kg(l.kg)}${l.payload ? " of " + kg(l.payload) : ""}</td></tr>`;
    })
    .join("")}</tbody></table>`;
  const chosen = vehicleIds.length ? sized.filter((v) => vehicleIds.map(String).includes(String(v.id))) : [each.find(({ v, r }) => !r.left.length && !r.loads[0].over)?.v || sized[0]];
  const plan = planLoad(jobKit, db.inventory, chosen);
  const loads = plan.loads
    .map((l) => {
      const order = loadOrder(l);
      return `<div class="panel load-plan"><div class="line" style="border:0;padding-top:0"><h2 style="margin:0">${esc(l.vehicle.name)}</h2><span class="muted">${l.placed.length} item${l.placed.length === 1 ? "" : "s"} · ${l.volumePct}% of the space · ${kg(l.kg)}${l.payload ? " of " + kg(l.payload) + " payload" : ""}</span></div>
      ${l.over ? `<p><span class="tag warning">Over the payload by ${kg(l.kg - l.payload)}</span></p>` : ""}
      ${l.placed.length ? loadDrawing(l, colourOf) + `<h3>From above</h3><p class="hint" style="margin-top:0">Numbers show how high the load reaches there, in cm.</p>` + loadTopView(l, colourOf) : '<p class="empty">Nothing loaded in this vehicle.</p>'}
      ${order.length ? `<h3>Loading order</h3><ol class="load-order">${order.map((o) => `<li><span class="swatch" style="background:${colourOf(o.name)}"></span>${o.n > 1 ? o.n + " × " : ""}${esc(o.name)}${o.onTop ? ' <span class="muted">(stacked on top)</span>' : ""}</li>`).join("")}</ol>` : ""}</div>`;
    })
    .join("");
  const warn = [
    plan.left.length ? `<b>${plan.left.length} item${plan.left.length > 1 ? "s" : ""} won't fit</b> in ${chosen.length > 1 ? "these vehicles" : "this vehicle"}: ${summariseNames(plan.left)}.` : "",
    plan.noSize.length ? `No size yet for ${plan.noSize.map((x) => x.qty + " × " + esc(x.name)).join(", ")}: add their dimensions under Inventory to include them.` : "",
    plan.inside.length ? `<span class="note">Packed inside other cases (weight counted, no extra space): ${plan.inside.map((x) => x.qty + " × " + esc(x.name)).join(", ")}.</span>` : "",
  ].filter(Boolean);
  return `<h3 style="margin-top:0">Which vehicle fits?</h3>${fitsTable}
    <p class="hint">${vehicleIds.length ? "Showing the vehicles ticked on this job, filled in order." : "No vehicles ticked on this job, so this shows the first one that fits everything."} A planning aid: wheel arches and odd shapes aren't modelled, so allow some spare room. Dashed tops mean don't stack on.</p>
    ${warn.map((w) => `<p class="${w.startsWith('<span class="note">') ? "load-note" : "load-warn"}">${w}</p>`).join("")}${loads}`;
}
function summariseNames(list) {
  const counts = {};
  list.forEach((b) => (counts[b.name] = (counts[b.name] || 0) + 1));
  return Object.entries(counts)
    .map(([n, c]) => c + " × " + esc(n))
    .join(", ");
}
function openLoadPlanner() {
  const ids = document.getElementById("jobForm") ? chosenVehicles() : [];
  const root = document.createElement("div");
  root.className = "modal";
  root.id = "loadDialog";
  root.innerHTML = `<div class="panel load-dialog"><div class="line"><h2 style="margin:0">Van load plan</h2><button type="button" class="btn small ghost" onclick="$('loadDialog').remove()">Close</button></div>${loadPlanner(draftKit, ids)}</div>`;
  document.body.appendChild(root);
}
