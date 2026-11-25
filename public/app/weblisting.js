// Event Planner > Website: what the public sees for this event on www.hd-events.co.uk/events.
// Tick "Show on the website" and it appears there within about a minute (no website rebuild).
const WEB_EVENTS_URL = "https://www.hd-events.co.uk/events";
function webListing(p) {
  p.web ||= {};
  return p.web;
}
function planWebsite(p) {
  const w = webListing(p);
  const can = canWrite("plans");
  const v = (k, d = "") => esc(w[k] ?? d);
  const field = (k, label, attrs = "", d = "") => `<label><span class="muted">${label}</span><input class="field" ${can ? "" : "disabled"} value="${v(k, d)}" onchange="setWeb('${k}',this.value)" ${attrs}></label>`;
  const posters = (p.posters || []).filter((x) => x.exported);
  const missing = [!w.description && "a description", !w.tickets && "a ticket link", !w.poster && "a poster"].filter(Boolean);
  const start = w.start || p.eventDate || "";
  return `<div class="panel web-listing">
    <div class="line" style="border:0;padding-top:0"><div><h2 style="margin:0">Website listing</h2><span class="muted">Shown on <a href="${WEB_EVENTS_URL}" target="_blank" rel="noopener">hd-events.co.uk/events</a> with the poster, a short description and a Buy tickets button.</span></div>
      <label class="check-card web-show"><input type="checkbox" ${w.show ? "checked" : ""} ${can ? "" : "disabled"} onchange="setWebShow(this.checked)"> Show on the website</label></div>
    ${w.show ? `<p><span class="tag success">Live on the website</span> <span class="muted">Changes appear there within about a minute.</span>${missing.length ? ` <span class="tag warning">Still needs ${missing.join(", ")}</span>` : ""}</p>` : `<p class="hint">Fill this in, then tick <b>Show on the website</b> when you're ready to announce it.</p>`}
    <div class="form">
      ${field("title", "Event name", "maxlength=120", p.title)}
      ${field("price", "Price (optional)", 'maxlength=60 placeholder="e.g. From £15, or Free entry"')}
      <label><span class="muted">Starts</span><input class="field" type="datetime-local" ${can ? "" : "disabled"} value="${esc(start.length === 10 ? start + "T00:00" : start)}" onchange="setWeb('start',this.value)"></label>
      <label><span class="muted">Ends (optional)</span><input class="field" type="datetime-local" ${can ? "" : "disabled"} value="${v("end")}" onchange="setWeb('end',this.value)"></label>
      ${field("venue", "Venue", "maxlength=120", p.venue)}
      ${field("town", "Town", 'maxlength=80 placeholder="e.g. Port Talbot"')}
      <label class="wide"><span class="muted">Full address (helps Google show the event)</span><input class="field" ${can ? "" : "disabled"} maxlength="200" value="${v("address")}" onchange="setWeb('address',this.value)"></label>
      <label class="wide"><span class="muted">Description: two or three sentences on what it is, who's on and who it's for</span><textarea class="field" rows="3" maxlength="1200" ${can ? "" : "disabled"} onchange="setWeb('description',this.value)">${v("description")}</textarea></label>
      <label class="wide"><span class="muted">Ticket link (the page where people buy tickets)</span><input class="field" type="url" ${can ? "" : "disabled"} placeholder="https://…" value="${v("tickets")}" onchange="setWeb('tickets',this.value)"></label>
      <label><span class="muted">Status</span><select class="field" ${can ? "" : "disabled"} onchange="setWeb('status',this.value)">${[["", "On sale / coming soon"], ["sold out", "Sold out"], ["cancelled", "Cancelled"]].map(([k, l]) => `<option value="${k}" ${String(w.status || "") === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    </div>
    <h3>Poster</h3>
    <div class="web-posters">${w.poster ? `<figure class="on"><img src="${esc(w.poster)}" alt="Chosen poster"><figcaption>On the website</figcaption></figure>` : ""}${posters
      .filter((x) => x.exported !== w.poster)
      .map((x, n) => `<button type="button" class="web-poster-pick" ${can ? "" : "disabled"} onclick="setWeb('poster','${esc(x.exported)}')"><img src="${esc(x.exported)}" alt="${esc(x.title || "Poster " + (n + 1))}"><span>Use this poster</span></button>`)
      .join("")}</div>
    ${can ? `<div class="toolbar"><button class="btn small secondary" onclick="uploadWebPoster()">Upload a poster image</button>${w.poster ? `<button class="btn small ghost" onclick="setWeb('poster','')">Remove poster</button>` : ""}<button class="btn small ghost" onclick="plannerTab='posters';render()">Make one in the poster studio</button></div>` : ""}
    <p class="hint">Portrait posters (like A4) look best. Posters you export in the poster studio appear above to pick from.</p></div>`;
}
function setWeb(k, value) {
  const p = currentPlan(),
    w = webListing(p);
  value = typeof value === "string" ? value.trim() : value;
  if (k === "tickets" && value && !/^https:\/\//i.test(value)) return alert("The ticket link needs to start with https://");
  w[k] = value;
  save();
  if (k === "poster" || k === "status") planRefresh();
}
function setWebShow(on) {
  const p = currentPlan(),
    w = webListing(p);
  if (on) {
    if (!(w.start || p.eventDate)) {
      alert("Add the start date and time first.");
      return planRefresh();
    }
    w.title ||= p.title;
    w.venue ??= p.venue || "";
    w.start ||= p.eventDate.length === 10 ? p.eventDate + "T00:00" : p.eventDate;
  }
  w.show = on;
  save();
  planRefresh();
  toast(on ? "On the website within about a minute" : "Taken off the website");
}
async function uploadWebPoster() {
  const f = await pickFile("image/png,image/jpeg,image/webp", "creative");
  if (f) setWeb("poster", f.url);
}
