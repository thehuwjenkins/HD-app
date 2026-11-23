// Site map: satellite or street map of the venue, with stages, bars, toilets, fire points, fences and routes.
// Uses Leaflet (loaded on first use) with Esri satellite imagery and OpenStreetMap; no API key needed.
const SITE_KINDS = {
  stage: ["🎤", "Stage"],
  foh: ["🎛️", "FOH / control"],
  bar: ["🍺", "Bar"],
  food: ["🍔", "Food"],
  toilets: ["🚻", "Toilets"],
  water: ["💧", "Drinking water"],
  firstaid: ["⛑️", "First aid"],
  firepoint: ["🧯", "Fire point"],
  exit: ["🚪", "Emergency exit"],
  assembly: ["🟢", "Assembly point"],
  entrance: ["🎟️", "Entrance"],
  security: ["🛡️", "Security / control"],
  generator: ["⚡", "Generator / power"],
  info: ["ℹ️", "Info point"],
  parking: ["🅿️", "Parking"],
  camping: ["⛺", "Camping"],
};
const SITE_SHAPES = {
  arena: ["polygon", "#67d5ed", "Arena / audience area"],
  backstage: ["polygon", "#c4a1ff", "Backstage / production"],
  nogo: ["polygon", "#ff6b6b", "No-go / hazard area"],
  fence: ["line", "#f5b85c", "Fence / barrier line"],
  route: ["line", "#ff4d4d", "Emergency vehicle route"],
  path: ["line", "#7fd6a4", "Walkway / crowd route"],
};
let siteTool = null, // null = move/select, a SITE_KINDS key, or a SITE_SHAPES key
  siteDraft = [], // points of the shape being drawn
  siteBase = "satellite",
  siteLeaflet = null,
  siteLeafletPlan = null,
  siteViewTimer = null;

function loadLeaflet() {
  if (window.L) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    js.onload = resolve;
    js.onerror = () => reject(Error("Could not load the map. Check your internet connection."));
    document.head.appendChild(js);
  });
}

function siteMap(p) {
  const s = p.site || (p.site = { address: p.venue || "", features: [] });
  // Keep the current view when the page redraws (the saved view is only updated after panning stops).
  if (siteLeaflet) {
    try {
      if (siteLeafletPlan !== p.id) throw 0;
      const c = siteLeaflet.getCenter();
      s.center = [+c.lat.toFixed(6), +c.lng.toFixed(6)];
      s.zoom = siteLeaflet.getZoom();
      siteLeaflet.remove();
    } catch {}
    siteLeaflet = null;
  }
  setTimeout(() => initSiteMap(p), 0);
  const counts = {};
  s.features.forEach((f) => (counts[f.kind] = (counts[f.kind] || 0) + 1));
  const gmaps = s.center ? `https://www.google.com/maps/@${s.center[0]},${s.center[1]},${(s.zoom || 17) + 0}z/data=!3m1!1e3` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address || p.venue || "")}`;
  return `<div class="site-tools noprint">
    <form class="toolbar" onsubmit="siteSearch(event)"><input class="field" style="flex:1;min-width:200px" name="q" value="${esc(s.address || "")}" placeholder="Search an address or paste a Google Maps link"><button class="btn small">Find</button>
    <button type="button" class="btn small ${siteBase === "satellite" ? "" : "secondary"}" onclick="siteBase='satellite';planRefresh()">Satellite</button><button type="button" class="btn small ${siteBase === "map" ? "" : "secondary"}" onclick="siteBase='map';planRefresh()">Map</button>
    <a class="btn small ghost" href="${esc(gmaps)}" target="_blank" rel="noopener">Open in Google Maps ↗</a></form>
    <div class="palette" role="toolbar" aria-label="Add to the site plan">
      <button class="${siteTool === null ? "on" : ""}" data-tool="" onclick="siteSetTool(null)" title="Move and edit">✋ Move</button>
      ${Object.entries(SITE_KINDS).map(([k, [e, l]]) => `<button class="${siteTool === k ? "on" : ""}" data-tool="${k}" onclick="siteSetTool('${k}')" title="Place: ${l}">${e} ${l}</button>`).join("")}
      ${Object.entries(SITE_SHAPES).map(([k, [, c, l]]) => `<button class="${siteTool === k ? "on" : ""}" data-tool="${k}" onclick="siteSetTool('${k}')" title="Draw: ${l}"><span class="swatch" style="background:${c}"></span>${l}</button>`).join("")}
    </div>
    <p class="hint" id="siteHint">${siteHintText()}</p></div>
  <div id="siteMap" class="site-map" aria-label="Site map"></div>
  <div class="cols" style="margin-top:12px"><div class="panel"><h2>On the plan</h2><div id="siteList">${siteList(s)}</div></div>
  <div class="panel"><h2>Safety check</h2><div id="siteChecks">${siteChecks(s)}</div><div class="toolbar" style="margin-top:12px"><button class="btn small secondary" onclick="window.print()">Print site plan</button></div></div></div>`;
}
function siteList(s) {
  return s.features.length
    ? s.features
        .map((f, n) => row(`${SITE_KINDS[f.kind]?.[0] || `<span class="swatch" style="background:${SITE_SHAPES[f.kind]?.[1]}"></span>`} ${esc(f.label || SITE_KINDS[f.kind]?.[1] || SITE_SHAPES[f.kind]?.[2])}`, `<button class="btn small ghost" onclick="siteFocus(${n})">Show</button>`))
        .join("")
    : '<p class="hint">Nothing placed yet. Pick an item above, then click on the map.</p>';
}
// Redraw pins, shapes, the list, hint and tool buttons in place: the map itself stays put.
let siteLayer = null;
function siteUpdate() {
  const p = currentPlan();
  if (!p || !siteLeaflet || !$("siteMap")) return planRefresh();
  siteLayer.clearLayers();
  p.site.features.forEach((f, n) => drawFeature(siteLayer, p, f, n));
  if (siteDraft.length) L.polyline(siteDraft, { color: SITE_SHAPES[siteTool]?.[1] || "#fff", dashArray: "6 6" }).addTo(siteLayer);
  siteDraft.forEach((pt) => L.circleMarker(pt, { radius: 5, color: "#fff", weight: 2, fillOpacity: 1, fillColor: SITE_SHAPES[siteTool]?.[1] || "#fff" }).addTo(siteLayer));
  $("siteList").innerHTML = siteList(p.site);
  $("siteChecks").innerHTML = siteChecks(p.site);
  $("siteHint").innerHTML = siteHintText();
  document.querySelectorAll(".palette button").forEach((b) => b.classList.toggle("on", (b.dataset.tool || null) === (siteTool || null)));
}
function siteHintText() {
  if (siteTool && SITE_SHAPES[siteTool]) return `Drawing ${SITE_SHAPES[siteTool][2].toLowerCase()}: click to add points${siteDraft.length ? ` (${siteDraft.length} so far)` : ""}, then <button class="btn small" onclick="siteFinishShape()">Finish shape</button> <button class="btn small ghost" onclick="siteDraft=[];siteSetTool(null)">Cancel</button> <button class="btn small ghost" onclick="siteDraft.pop();siteUpdate()">Undo point</button>`;
  if (siteTool) return `Click the map to place a ${SITE_KINDS[siteTool][1].toLowerCase()}. Drag items to move them; click one to rename or remove it.`;
  return "Pick an item above and click on the map. Drag to move, click to rename or remove.";
}
// Simple prompts for things every outdoor site plan should show.
function siteChecks(s) {
  const has = (k) => s.features.some((f) => f.kind === k);
  const checks = [
    ["firstaid", "First aid point"],
    ["firepoint", "Fire points"],
    ["exit", "Emergency exits"],
    ["assembly", "Assembly point"],
    ["route", "Emergency vehicle route"],
    ["toilets", "Toilets"],
    ["water", "Drinking water"],
    ["entrance", "Entrance"],
  ];
  return checks.map(([k, l]) => `<div class="check-row">${has(k) ? "✅" : "⬜"} ${l}</div>`).join("") + '<p class="hint">A prompt list, not a full assessment. The event risk assessment and fire risk assessment decide what the site needs.</p>';
}
function siteSetTool(t) {
  siteTool = t;
  if (!t || !SITE_SHAPES[t]) siteDraft = [];
  siteUpdate();
}

async function initSiteMap(p) {
  const el = $("siteMap");
  if (!el) return;
  try {
    await loadLeaflet();
  } catch (e) {
    el.innerHTML = `<p class="empty">${esc(e.message)}</p>`;
    return;
  }
  if (!document.body.contains(el)) return;
  const s = p.site;
  const map = L.map(el, { doubleClickZoom: false }).setView(s.center || [51.5866, -3.8091], s.zoom || (s.center ? 17 : 6));
  siteLeaflet = map;
  siteLeafletPlan = p.id;
  (siteBase === "satellite"
    ? L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 20, maxNativeZoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" })
    : L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 20, maxNativeZoom: 19, attribution: "© OpenStreetMap contributors" })
  ).addTo(map);
  siteLayer = L.layerGroup().addTo(map);
  siteUpdate();
  if (!s.center && s.address) siteGeocode(s.address).then((r) => r && map.setView(r, 17));
  map.on("click", (e) => {
    const pt = [+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)];
    if (siteTool && SITE_KINDS[siteTool]) {
      s.features.push({ id: uid(), kind: siteTool, type: "marker", label: "", at: pt });
      save();
      siteUpdate();
    } else if (siteTool && SITE_SHAPES[siteTool]) {
      siteDraft.push(pt);
      siteUpdate();
    }
  });
  map.on("moveend", () => {
    clearTimeout(siteViewTimer);
    siteViewTimer = setTimeout(() => {
      const c = map.getCenter();
      s.center = [+c.lat.toFixed(6), +c.lng.toFixed(6)];
      s.zoom = map.getZoom();
      save();
    }, 1500);
  });
}
function drawFeature(layer, p, f, n) {
  const popup = () => {
    const div = document.createElement("div");
    div.innerHTML = `<label class="muted">Label</label><input class="field" value="${esc(f.label || "")}" placeholder="${esc(SITE_KINDS[f.kind]?.[1] || SITE_SHAPES[f.kind]?.[2] || "")}"><div class="toolbar" style="margin:8px 0 0"><button class="btn small">Save</button><button class="btn small danger">Remove</button></div>`;
    const [ok, del] = div.querySelectorAll("button");
    ok.onclick = () => {
      f.label = div.querySelector("input").value.trim();
      save();
      siteLeaflet.closePopup();
      siteUpdate();
    };
    del.onclick = () => {
      p.site.features.splice(n, 1);
      save();
      siteLeaflet.closePopup();
      siteUpdate();
    };
    return div;
  };
  if (f.type === "marker") {
    const [emoji] = SITE_KINDS[f.kind] || ["📍"];
    const m = L.marker(f.at, { draggable: true, title: f.label || SITE_KINDS[f.kind]?.[1], icon: L.divIcon({ className: "site-pin", html: `<span>${emoji}</span>${f.label ? `<b>${esc(f.label)}</b>` : ""}`, iconSize: [34, 34], iconAnchor: [17, 17] }) }).addTo(layer);
    m.bindPopup(popup);
    m.on("dragend", () => {
      const ll = m.getLatLng();
      f.at = [+ll.lat.toFixed(6), +ll.lng.toFixed(6)];
      save();
    });
  } else {
    const [type, color] = SITE_SHAPES[f.kind] || ["line", "#fff"];
    const shape = (type === "polygon" ? L.polygon : L.polyline)(f.points, { color, weight: f.kind === "route" ? 5 : 3, fillOpacity: 0.18, dashArray: f.kind === "route" ? "10 6" : null }).addTo(layer);
    shape.bindPopup(popup);
    if (f.label) shape.bindTooltip(esc(f.label), { permanent: true, direction: "center", className: "site-label" });
  }
}
function siteFinishShape() {
  const p = currentPlan(),
    [type] = SITE_SHAPES[siteTool] || [];
  if (siteDraft.length < (type === "polygon" ? 3 : 2)) return alert(type === "polygon" ? "An area needs at least 3 points." : "A line needs at least 2 points.");
  p.site.features.push({ id: uid(), kind: siteTool, type, label: "", points: siteDraft });
  siteDraft = [];
  siteTool = null;
  save();
  siteUpdate();
}
function siteFocus(n) {
  const f = currentPlan().site.features[n];
  if (!siteLeaflet || !f) return;
  f.at ? siteLeaflet.setView(f.at, 19) : siteLeaflet.fitBounds(f.points);
}
// Address search (Photon, OpenStreetMap data), or coordinates from a pasted Google Maps link / "lat, lng".
async function siteGeocode(q) {
  const m = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(q) || /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/.exec(q) || /[?&]q(?:uery)?=(-?\d+\.\d+),(-?\d+\.\d+)/.exec(q);
  if (m) return [+m[1], +m[2]];
  try {
    const r = await fetch("https://photon.komoot.io/api/?limit=1&q=" + encodeURIComponent(q));
    const c = (await r.json()).features?.[0]?.geometry?.coordinates;
    return c ? [c[1], c[0]] : null;
  } catch {
    return null;
  }
}
async function siteSearch(e) {
  e.preventDefault();
  const q = data(e).q.trim();
  if (!q) return;
  const at = await siteGeocode(q);
  if (!at) return alert("Couldn't find that place. Try a postcode, or paste a link from Google Maps.");
  const s = currentPlan().site;
  s.address = q;
  s.center = at;
  s.zoom = 17;
  save();
  if (siteLeaflet && $("siteMap")) siteLeaflet.setView(at, 17);
  else planRefresh();
}
