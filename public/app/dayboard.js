// Out & back: one day's departures and returns, with anything late at the top, and a run sheet to print
// for the crew. Jobs that hold stock (Booked / Out) going out that day, and jobs due back that day.
let boardDay = null;
function dayBoard() {
  const day = boardDay || todayKey();
  const holds = (j) => ["booked", "out", "returned"].includes(stageOf(j));
  const going = db.jobs.filter((j) => holds(j) && jobDays(j)?.[0] === day && stageOf(j) !== "returned").sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  const back = db.jobs.filter((j) => holds(j) && /^\d{4}-\d\d-\d\d/.exec(j.end || "")?.[0] === day).sort((a, b) => (a.end || "").localeCompare(b.end || ""));
  const late = lateReturns();
  // Booked jobs whose start has passed but nothing has been booked out yet.
  const notOut = db.jobs.filter((j) => stageOf(j) === "booked" && jobDays(j) && jobDays(j)[0] < todayKey() && !(bookingProgress(j)?.out) && !late.some((x) => x.j.id === j.id));
  const staff = (j) => db.staff.find((m) => String(m.id) === String(j.staffId))?.name || "";
  const card = (j, when, kind) => {
    const p = bookingProgress(j);
    const items = (j.kit || []).filter((k) => !isCrewLine(k)).reduce((n, k) => n + (Number(k.qty) || 0), 0);
    const done = kind === "out" ? stageOf(j) !== "booked" : stageOf(j) === "returned" || stageOf(j) === "invoiced";
    return `<div class="jobcard board-card ${done ? "done" : ""}"><div class="head"><div><b>${esc(fmtTime(when) || "Any time")} · ${esc(j.title)}</b><div class="muted">${esc([j.client, j.venue].filter(Boolean).join(" · "))}</div></div>${done ? `<span class="tag success">${kind === "out" ? "Out" : "Back"}</span>` : stageTag(j)}</div>
      <p class="muted" style="margin:6px 0">${items} item${items === 1 ? "" : "s"}${staff(j) ? " · lead " + esc(staff(j)) : ""}${j.load ? " · " + esc(j.load) : ""}${p?.still && kind === "back" ? ` · <b>${p.still} still out</b>` : ""}</p>
      <div class="toolbar" style="margin:0"><button class="btn small secondary" onclick="printJob(${j.id})">Picking list</button>${canWrite("jobs") ? (kind === "out" ? `<button class="btn small" onclick="openBooking(${j.id},'out')">Book out</button>` : `<button class="btn small" onclick="openBooking(${j.id},'in')">Book in</button>`) : ""}<button class="btn small ghost" onclick="editJob(${j.id})">Open job</button></div></div>`;
  };
  const shift = (n) => `boardDay='${addDays(day, n)}';render()`;
  return `<div class="panel"><div class="board-head"><div class="toolbar" style="margin:0"><button class="btn small secondary" onclick="${shift(-1)}" aria-label="Previous day">←</button><input class="field" type="date" value="${day}" onchange="boardDay=this.value||null;render()" style="max-width:180px"><button class="btn small secondary" onclick="${shift(1)}" aria-label="Next day">→</button>${day !== todayKey() ? `<button class="btn small ghost" onclick="boardDay=null;render()">Today</button>` : ""}</div><b>${esc(fmtDay(day, { weekday: "long", day: "numeric", month: "long" }))}</b><button class="btn small" onclick="printDayBoard('${day}')">Print run sheet</button></div>
    ${late.length || notOut.length ? `<div class="board-late"><h3>Needs attention</h3>${late.map((x) => `<div class="line"><span><span class="tag danger-tag">Late return</span> <b>${esc(x.j.title)}</b> · ${x.items} item${x.items === 1 ? "" : "s"} not booked in${x.days ? " · " + x.days + " day" + (x.days === 1 ? "" : "s") + " late" : ""}</span><button class="btn small" onclick="openBooking(${x.j.id},'in')">Book in</button></div>`).join("")}${notOut.map((j) => `<div class="line"><span><span class="tag warning">Not booked out</span> <b>${esc(j.title)}</b> · started ${esc(fmtDay(jobDays(j)[0], { day: "numeric", month: "short" }))}</span><button class="btn small" onclick="openBooking(${j.id},'out')">Book out</button></div>`).join("")}</div>` : ""}
    <div class="board-cols"><section><h3>Going out <span class="muted">(${going.length})</span></h3>${going.map((j) => card(j, j.start, "out")).join("") || '<p class="empty">Nothing going out.</p>'}</section>
    <section><h3>Coming back <span class="muted">(${back.length})</span></h3>${back.map((j) => card(j, j.end, "back")).join("") || '<p class="empty">Nothing due back.</p>'}</section></div></div>`;
}
function printDayBoard(day) {
  const holds = (j) => ["booked", "out", "returned"].includes(stageOf(j));
  const going = db.jobs.filter((j) => holds(j) && jobDays(j)?.[0] === day && stageOf(j) !== "returned").sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  const back = db.jobs.filter((j) => holds(j) && /^\d{4}-\d\d-\d\d/.exec(j.end || "")?.[0] === day).sort((a, b) => (a.end || "").localeCompare(b.end || ""));
  const staff = (j) => db.staff.find((m) => String(m.id) === String(j.staffId))?.name || "";
  const rows = (list, at) =>
    list.map((j) => `<tr><td class="box"><i></i></td><td><b>${esc(fmtTime(j[at]) || "—")}</b></td><td><b>${esc(j.title)}</b><br><span class="muted">${esc(j.client || "")}</span></td><td>${esc(j.venue || "")}${j.load ? "<br>" + esc(j.load) : ""}</td><td>${esc(staff(j))}</td><td class="num">${(j.kit || []).filter((k) => !isCrewLine(k)).reduce((n, k) => n + (Number(k.qty) || 0), 0)}</td></tr>`).join("") || '<tr><td colspan="6">None.</td></tr>';
  const head = '<thead><tr><th>Done</th><th>Time</th><th>Job</th><th>Venue / schedule</th><th>Lead</th><th class="num">Items</th></tr></thead>';
  const late = lateReturns();
  const body = `<h2>Going out</h2><table>${head}<tbody>${rows(going, "start")}</tbody></table>
    <h2>Coming back</h2><table>${head}<tbody>${rows(back, "end")}</tbody></table>
    ${late.length ? `<h2>Late returns</h2><p>${late.map((x) => `<span class="warn">${esc(x.j.title)}: ${x.items} item${x.items === 1 ? "" : "s"} not booked in</span>`).join("<br>")}</p>` : ""}
    <p class="muted">Print each job's picking list from HQ for the full kit list.</p>`;
  return printDocument("Run sheet", fmtDay(day, { weekday: "short", day: "numeric", month: "short", year: "numeric" }), body, { lead: fmtDay(day, { weekday: "long", day: "numeric", month: "long" }) });
}
