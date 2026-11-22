// HD Events HQ owner app: shared state, helpers and page rendering.
// The server puts the workspace into <script id="boot">; each feature lives in its own file in /app.
const DEFAULT_HD_LOGO = "/logo.jpg";
const boot = JSON.parse(document.getElementById("boot").textContent);
let db = boot.state;
// Fill in fields that older records may be missing (display defaults only; not saved unless the record is edited).
db.jobs = (db.jobs || []).map((j) => ({
  ...j,
  client: j.client || "",
  venue: j.venue || "",
  contact: j.contact || "",
  load: j.load || "",
  notes: j.notes || "",
  kit: Array.isArray(j.kit) ? j.kit : j.item ? [{ item: j.item, qty: Number(j.qty) || 1 }] : [],
}));
db.inventory = (db.inventory || []).map((i) => ({ ...i, category: i.category || guessCategory(i.name) }));
db.staff = db.staff || [];
db.packages = db.packages || [];
db.crossHires = db.crossHires || [];
db.quotes = db.quotes || [];
db.branding = db.branding || { logo: DEFAULT_HD_LOGO };
db.crewInvites = db.crewInvites || [];
let inventoryView = "grid";
let inventoryQuery = "";
let activeClient = null;
let editingJob = null;
let draftKit = [];
let tab = "Overview";
const tabs = [
  ["Overview", "◫"],
  ["My Workday", "☑"],
  ["Projects", "▣"],
  ["CRM", "♙"],
  ["Staff", "♟"],
  ["Crew Portal", "☷"],
  ["Packages", "▣"],
  ["Cross-hire", "⚠"],
  ["Jobs", "▦"],
  ["Inventory", "▤"],
  ["Branding", "◈"],
];
const $ = (id) => document.getElementById(id);
const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const uid = () => Date.now() + Math.floor(Math.random() * 10000);
const panel = (title, inner) => `<div class="panel"><h2>${title}</h2>${inner}</div>`;
const row = (a, b) => `<div class="line"><div>${a}</div><div>${b}</div></div>`;
const form = (fields, action, label) =>
  `<form class="form" onsubmit="${action}(event)">${fields.map((f) => `<label><div class="muted" style="margin-bottom:5px">${f.label}</div>${f.select ? `<select class="field" name="${f.name}">${f.select.map((v) => `<option>${esc(v)}</option>`).join("")}</select>` : `<input class="field" name="${f.name}" type="${f.type || "text"}" ${f.min !== undefined ? `min="${f.min}"` : ""} ${f.required === false ? "" : "required"} placeholder="${esc(f.placeholder || "")}" />`}</label>`).join("")}<div class="wide"><button class="btn" type="submit">${label}</button></div></form>`;
const data = (e) => Object.fromEntries(new FormData(e.target));
function go(name) {
  tab = name;
  render();
}
function render() {
  updateBrandMark();
  renderTurnover();
  $("nav").innerHTML = tabs
    .map(
      ([n, i]) =>
        `<button data-icon="${i}" class="nav ${n === tab ? "active" : ""}" onclick="go('${n}')">${n}</button>`,
    )
    .join("");
  $("heading").textContent = tab;
  $("description").textContent = {
    Overview: "A clear picture of your business and your next actions.",
    "My Workday": "Keep the next action visible. Tick things off as you go.",
    Projects: "Your business and event development projects.",
    CRM: "Customer records, linked jobs and quotes.",
    Staff: "Manage crew and job assignments.",
    "Crew Portal": "Review the schedule visible to each crew member.",
    Packages: "Create reusable equipment bundles.",
    "Cross-hire": "Track shortages and proposed external hires.",
    Jobs: "Book jobs and reserve equipment by date.",
    Inventory: "Track stock and spot overlapping booking shortages.",
  }[tab];
  $("content").innerHTML = {
    Overview: overview,
    "My Workday": workday,
    Projects: projects,
    CRM: crm,
    Staff: staff,
    "Crew Portal": crewPortal,
    Packages: packages,
    "Cross-hire": crossHire,
    Jobs: jobs,
    Inventory: inventory,
    Branding: branding,
  }[tab]();
}
const cats = ["Audio", "Visual", "Lighting", "Stage & Rigging", "Transport", "Install", "Labour / Crew"];
const money = (n) => "£" + (Number(n) || 0).toFixed(2);
function inputTime(value, end) {
  if (!value) return "";
  if (value.length !== 10) return value;
  return new Date(Date.parse(value + "T00:00:00Z") + (end ? 86400000 : 0)).toISOString().slice(0, 16);
}
function guessCategory(name) {
  let n = name.toLowerCase();
  if (/truck|van|delivery|transport|mileage|fuel/.test(n)) return "Transport";
  if (/rigging|truss|stage|hoist|chain|motor/.test(n)) return "Stage & Rigging";
  if (/light|par |moving head|dimmer|dmx|spotlight/.test(n)) return "Lighting";
  if (/led wall|projector|screen|camera|video|hdmi|vision/.test(n)) return "Visual";
  if (/crew|engineer|technician|operator|rigger|freelancer/.test(n)) return "Labour / Crew";
  if (/install|mount|bracket|fixing/.test(n)) return "Install";
  return "Audio";
}
