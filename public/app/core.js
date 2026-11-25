// HD Events HQ owner app: shared state, helpers and page rendering.
// The server puts the workspace into <script id="boot">; each feature lives in its own file in /app.
const DEFAULT_HD_LOGO = "/logo.png";
const boot = JSON.parse(document.getElementById("boot").textContent);
let db = boot.state;
// Who is signed in and what they may use (set by the server; the server enforces it too).
const me = boot.me || { role: "owner", owner: true, money: true, sections: [], write: [] };
const canWrite = (collection) => me.owner || (me.write || []).includes(collection);
const hasSection = (key) => me.owner || (me.sections || []).includes(key);
document.documentElement.classList.toggle("no-money", !me.money);
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
db.plans = db.plans || [];
db.jobReports = db.jobReports || [];
db.jobTemplates = db.jobTemplates || [];
let inventoryView = "grid";
let inventoryQuery = "";
let inventoryCat = "";
let activeClient = null;
let editingJob = null;
let draftKit = [];
let tab = "Overview";
// Navigation, grouped. [name]
const navGroups = [
  ["Work", [["Overview"], ["Event Planner"], ["Pipeline"], ["Calendar"], ["Jobs"], ["My Workday"]]],
  ["Resources", [["Inventory"], ["Packages"], ["Cross-hire"], ["Staff"], ["Crew Portal"]]],
  ["Business", [["CRM"], ["Projects"], ["Branding"], ["People & access"]]],
];
const tabs = navGroups.flatMap(([, items]) => items);
// Pages each area unlocks for team members (matches src/roles.js).
const SECTION_PAGES = {
  overview: ["Overview"],
  planner: ["Event Planner"],
  jobs: ["Pipeline", "Calendar", "Jobs", "Cross-hire"],
  tasks: ["My Workday", "Projects"],
  kit: ["Inventory", "Packages", "Cross-hire"],
  people: ["Staff", "Crew Portal", "CRM"],
};
const canSee = (page) => me.owner || (me.sections || []).some((s) => (SECTION_PAGES[s] || []).includes(page));
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
const pages = {
  Overview: ["A clear picture of the business and the one thing to do next.", () => overview()],
  "Event Planner": ["Plan an event from idea to derig: checklist, site map, creative, posters and safety documents.", () => planner()],
  Pipeline: ["Every job from first enquiry to invoice. Move a job along as it progresses.", () => pipeline()],
  Calendar: ["Jobs, crew and kit by day.", () => calendar()],
  Jobs: ["Create jobs, build the kit list and quote.", () => jobs()],
  "My Workday": ["Keep the next action visible. Tick things off as you go.", () => workday()],
  Inventory: ["Track stock and spot overlapping booking shortages.", () => inventory()],
  Packages: ["Reusable equipment bundles.", () => packages()],
  "Cross-hire": ["Kit you are short of, and what you plan to hire in.", () => crossHire()],
  Staff: ["Crew and freelancers.", () => staff()],
  "Crew Portal": ["Preview what each crew member sees.", () => crewPortal()],
  CRM: ["Customer records, linked jobs and quotes.", () => crm()],
  Projects: ["Business and event development projects.", () => projects()],
  Branding: ["Company details and logo for quotes and job sheets.", () => branding()],
  "People & access": ["Who can sign in, and which parts of HQ each person can use.", () => peopleAccess()],
};
function render() {
  updateBrandMark();
  const shortCount = allShortages().length;
  if (!canSee(tab)) tab = tabs.map(([n]) => n).find(canSee) || tab;
  $("nav").innerHTML = navGroups
    .map(([group, items]) => [group, items.filter(([n]) => canSee(n))])
    .filter(([, items]) => items.length)
    .map(
      ([group, items]) =>
        `<div class="nav-group">${group}</div>` +
        items
          .map(
            ([n]) =>
              `<button class="nav ${n === tab ? "active" : ""}" ${n === tab ? 'aria-current="page"' : ""} onclick="go('${n}')">${n}${n === "Cross-hire" && shortCount ? `<span class="count">${shortCount}</span>` : ""}</button>`,
          )
          .join(""),
    )
    .join("");
  const [description, view] = canSee(tab) ? pages[tab] || pages.Overview : ["You don't have access to any areas yet. Ask Huw.", () => ""];
  $("heading").textContent = tab;
  $("description").textContent = description;
  $("content").innerHTML = view();
}
// Coloured label for a job's pipeline stage.
function stageTag(job) {
  const st = stageOf(job);
  return `<span class="stage" data-stage="${st}">${STAGE_LABELS[st]}</span>`;
}
const cats = ["Audio", "Visual", "Lighting", "Backline", "Stage & Rigging", "Power Distribution", "Transport", "Install", "Labour / Crew"];
const money = (n) => (me.money ? "£" + (Number(n) || 0).toFixed(2) : "—");
// Crew lines are charged per person per day or hour: people × days/hours × rate. Everything else is qty × price.
const CREW_CAT = "Labour / Crew";
const isCrewLine = (k) => (k.category || "") === CREW_CAT;
const lineTotal = (k) => lineAmount(k); // shared with the server (stock.js)
const crewQtyText = (k) => `${Number(k.qty) || 0} crew × ${Number(k.time) || 1} ${k.unit === "hour" ? "hour" : "day"}${(Number(k.time) || 1) === 1 ? "" : "s"}`;
function inputTime(value, end) {
  if (!value) return "";
  if (value.length !== 10) return value;
  return new Date(Date.parse(value + "T00:00:00Z") + (end ? 86400000 : 0)).toISOString().slice(0, 16);
}
function guessCategory(name) {
  let n = name.toLowerCase();
  if (/truck|van|delivery|transport|mileage|fuel/.test(n)) return "Transport";
  if (/drum|snare|cymbal|kit\b|guitar|bass amp|combo|amp head|marshall|fender|ashdown|keyboard/.test(n)) return "Backline";
  if (/distro|distribution|16a|32a|63a|125a|ceeform|powercon|iec|extension|cable drum|generator|power/.test(n)) return "Power Distribution";
  if (/rigging|truss|stage|hoist|chain|motor/.test(n)) return "Stage & Rigging";
  if (/light|par |moving head|dimmer|dmx|spotlight/.test(n)) return "Lighting";
  if (/led wall|projector|screen|camera|video|hdmi|vision|\btv\b|monitor|display/.test(n)) return "Visual";
  if (/crew|engineer|technician|operator|rigger|freelancer/.test(n)) return "Labour / Crew";
  if (/install|mount|bracket|fixing/.test(n)) return "Install";
  return "Audio";
}
