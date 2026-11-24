// Calendar: month view of jobs, filter by crew member, and a day panel with jobs, crew and kit out.
let calMonth = todayKey().slice(0, 7),
  calDay = todayKey(),
  calCrew = "";

function crewFor(job) {
  const ids = new Set([job.staffId, ...db.crewInvites.filter((i) => String(i.jobId) === String(job.id)).map((i) => i.staffId)].filter(Boolean).map(String));
  return db.staff.filter((m) => ids.has(String(m.id)));
}
function calJobs() {
  return db.jobs.filter((j) => jobDays(j) && (!calCrew || crewFor(j).some((m) => String(m.id) === calCrew)));
}
function calendar() {
  const first = calMonth + "-01";
  const start = weekStart(first);
  const nextMonth = addDays(first, 32).slice(0, 7) + "-01";
  const today = todayKey();
  const list = calJobs();
  const days = [];
  for (let d = start; d < nextMonth || days.length % 7; d = addDays(d, 1)) days.push(d);
  const cells = days
    .map((d) => {
      const on = list.filter((j) => overlaps(j, d, d)).sort((a, b) => (a.start || "").localeCompare(b.start || ""));
      const bars = on
        .slice(0, 3)
        .map((j) => `<span class="cal-job" data-stage="${stageOf(j)}" title="${esc(j.title)} · ${STAGE_LABELS[stageOf(j)]}">${esc(j.title)}</span>`)
        .join("");
      const cls = [d.slice(0, 7) !== calMonth && "other", d === today && "today", d === calDay && "selected"].filter(Boolean).join(" ");
      const deadlines = db.plans.reduce((n, p) => n + p.stages.reduce((m, s) => m + s.items.filter((i) => i.due === d && i.status !== "done" && i.status !== "na").length, 0), 0);
      return `<button class="cal-day ${cls}" onclick="calDay='${d}';render()" aria-label="${fmtDay(d, { weekday: "long", day: "numeric", month: "long" })}, ${on.length} job(s)"><span class="num">${Number(d.slice(8))}${deadlines ? ` <span class="due-dot" title="${deadlines} planner deadline(s)">${deadlines} due</span>` : ""}</span>${bars}${on.length > 3 ? `<span class="cal-more">+${on.length - 3} more</span>` : ""}</button>`;
    })
    .join("");
  const monthName = fmtDay(first, { month: "long", year: "numeric" });
  return `<div class="panel"><div class="cal-head"><div class="toolbar" style="margin:0"><button class="btn small secondary" onclick="calShift(-1)" aria-label="Previous month">←</button><h2>${monthName}</h2><button class="btn small secondary" onclick="calShift(1)" aria-label="Next month">→</button><button class="btn small ghost" onclick="calMonth=todayKey().slice(0,7);calDay=todayKey();render()">Today</button></div>
  <select class="field" style="max-width:220px" onchange="calCrew=this.value;render()" aria-label="Show jobs for"><option value="">All crew</option>${db.staff.map((m) => `<option value="${m.id}" ${String(m.id) === calCrew ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></div>
  <div class="cal">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<div class="dow">${d}</div>`).join("")}${cells}</div>
  <div class="legend" style="margin-top:12px">${STAGES.map((s) => `<span class="stage" data-stage="${s}">${STAGE_LABELS[s]}</span>`).join("")}</div></div>
  ${calDayPanel(calDay, list)}`;
}
function calShift(n) {
  calMonth = addDays(calMonth + "-15", n * 30).slice(0, 7);
  calDay = calMonth + "-01";
  render();
}

// Everything happening on one day: jobs, who is working, and what kit is out.
function calDayPanel(d, list) {
  const on = list.filter((j) => overlaps(j, d, d)).sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  const jobsHtml = on.length
    ? on
        .map((j) => {
          const crew = crewFor(j);
          return row(
            `<b>${esc(j.title)}</b><div class="muted">${esc(fmtRange(j))}${j.venue ? " · " + esc(j.venue) : ""}</div><div class="muted">Crew: ${crew.length ? crew.map((m) => esc(m.name)).join(", ") : "none assigned"}</div>`,
            `${stageTag(j)} <button class="btn small secondary" onclick="openJob(${j.id})">Open</button>`,
          );
        })
        .join("")
    : '<p class="empty">Nothing booked on this day.</p>';
  // Kit: reserved (booked / out) and pending (enquiry / quote) quantities against what is owned.
  const kit = new Map();
  for (const j of db.jobs.filter((j) => overlaps(j, d, d))) {
    const b = STAGE_BOOKING[stageOf(j)];
    if (b === "Returned") continue;
    for (const line of j.kit || []) {
      if (line.external) continue;
      const k = kit.get(line.item) || { reserved: 0, pending: 0 };
      k[b === "Reserved" ? "reserved" : "pending"] += Number(line.qty) || 0;
      kit.set(line.item, k);
    }
  }
  const rows = [...kit]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, k]) => {
      const item = db.inventory.find((i) => i.name === name);
      const owned = item ? item.qty - item.service - setAside(db, item.name) : 0;
      const over = k.reserved + k.pending > owned;
      return `<tr><td>${esc(name)}</td><td>${k.reserved}</td><td>${k.pending}</td><td>${owned}</td><td>${over ? `<span class="tag warning">Short ${k.reserved + k.pending - owned}</span>` : '<span class="tag success">OK</span>'}</td></tr>`;
    })
    .join("");
  const kitHtml = rows
    ? `<div class="tablewrap"><table><thead><tr><th>Equipment</th><th>Reserved</th><th>Pending</th><th>Available to use</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><p class="hint">Reserved = Booked or Out on hire. Pending = enquiries and quotes that would also need it. Counted per day; exact times are checked when a job is booked.</p>`
    : '<p class="empty">No equipment out.</p>';
  // Event planner deadlines falling on this day.
  const due = db.plans.flatMap((p) => p.stages.flatMap((s) => s.items.filter((i) => i.due === d && i.status !== "done" && i.status !== "na").map((i) => ({ p, i }))));
  const dueHtml = due.length ? `<h3>Planner deadlines</h3>` + due.map(({ p, i }) => row(`${esc(i.title)}<div class="muted">${esc(p.title)}${i.owner ? " · " + esc(i.owner) : ""}</div>`, `<button class="btn small secondary" onclick="openPlan(${p.id})">Open plan</button>`)).join("") : "";
  return `<div class="cols">${panel(fmtDay(d, { weekday: "long", day: "numeric", month: "long" }) + (calCrew ? " · " + esc(db.staff.find((m) => String(m.id) === calCrew)?.name || "") : ""), jobsHtml + dueHtml)}${panel("Kit out on this day", kitHtml)}</div>`;
}
