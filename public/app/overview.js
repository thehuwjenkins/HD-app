// Overview: one next action, four cards, the pipeline at a glance, this week and tasks due.
function overviewFacts() {
  const today = todayKey(),
    wkFrom = weekStart(today),
    wkTo = addDays(wkFrom, 6),
    soon = addDays(today, 7);
  const byStage = Object.fromEntries(STAGES.map((s) => [s, db.jobs.filter((j) => stageOf(j) === s)]));
  const week = db.jobs
    .filter((j) => stageOf(j) !== "invoiced" && overlaps(j, wkFrom, wkTo))
    .sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  // Shortages that still matter: jobs not yet finished whose dates have not passed.
  const short = db.jobs
    .filter((j) => ["enquiry", "quote", "booked"].includes(stageOf(j)) && (jobDays(j)?.[1] || "") >= today)
    .map((j) => ({ job: j, issues: jobShortages(j) }))
    .filter((x) => x.issues.length);
  const open = db.tasks.filter((t) => !t.done);
  const overdue = open.filter((t) => t.due && t.due < today);
  const dueSoon = open.filter((t) => t.due && t.due <= soon).sort((a, b) => a.due.localeCompare(b.due));
  const quotes = byStage.quote;
  const toInvoice = byStage.returned;
  const shouldBeOut = byStage.booked.filter((j) => (jobDays(j)?.[0] || "9") < today);
  // Every job from today on (any stage), this week and next week, and where the money is.
  const endDay = (j) => jobDays(j)?.[1] || jobDays(j)?.[0] || "";
  const byStart = (a, b) => (a.start || "9999").localeCompare(b.start || "9999");
  const upcoming = db.jobs.filter((j) => !endDay(j) || endDay(j) >= today).sort(byStart);
  const thisWeek = db.jobs.filter((j) => overlaps(j, wkFrom, wkTo)).sort(byStart);
  const nextWeek = db.jobs.filter((j) => overlaps(j, addDays(wkFrom, 7), addDays(wkFrom, 13))).sort(byStart);
  const awaitingReply = byStage.quote.filter((j) => !j.acceptedAt);
  const quotesToSend = byStage.enquiry;
  const invoicesToSend = db.jobs.filter((j) => ["booked", "out", "returned", "invoiced"].includes(stageOf(j)) && !j.invoiceSentAt);
  const unpaid = db.jobs.filter((j) => j.invoiceSentAt && !j.paidAt);
  const overdueInvoices = unpaid.filter((j) => j.invoiceDate && addDays(j.invoiceDate, Number(db.company?.paymentDays) || 30) < today);
  return { today, wkFrom, wkTo, byStage, week, short, open, overdue, dueSoon, quotes, toInvoice, shouldBeOut, upcoming, thisWeek, nextWeek, awaitingReply, quotesToSend, invoicesToSend, unpaid, overdueInvoices };
}

// The single most useful thing to do next.
function nextAction(f) {
  const n = (x, one, many) => (x === 1 ? one : many.replace("#", x));
  const late = lateReturns();
  if (late.length)
    return [`Late return: ${esc(late[0].j.title)} (${lateText(late[0])})`, `${late[0].items} item${late[0].items === 1 ? "" : "s"} not booked back in.${late.length > 1 ? " " + (late.length - 1) + " more late return" + (late.length > 2 ? "s" : "") + "." : ""} Kit counts as out until it's booked in.`, "Book in", `openBooking(${late[0].j.id},'in')`];
  const accepted0 = db.jobs.filter((j) => j.acceptedAt && stageOf(j) === "quote");
  if (f.overdueInvoices.length)
    return [`Invoice ${esc(f.overdueInvoices[0].invoiceNo)} is overdue`, `${esc(f.overdueInvoices[0].title)} · ${money(jobValue(f.overdueInvoices[0]))}${f.overdueInvoices.length > 1 ? ` · ${f.overdueInvoices.length - 1} more overdue` : ""}. Chase it, or mark it paid.`, "Mark as paid", `markPaid(${f.overdueInvoices[0].id})`];
  const accepted = accepted0;
  if (accepted.length)
    return [`${esc(accepted[0].acceptedBy || "The client")} accepted the quote for ${esc(accepted[0].title)}`, esc(accepted[0].needsBooking || "It needs booking."), "Book it", `acceptJob(${accepted[0].id})`];
  if (f.short.length)
    return [`Sort kit for ${esc(f.short[0].job.title)}`, `${f.short[0].issues.map((i) => esc(i.name) + " short by " + i.short).join(", ")}${f.short.length > 1 ? ` · ${f.short.length - 1} more job(s) short` : ""}`, "Plan cross-hire", "go('Cross-hire')"];
  if (f.overdue.length)
    return [`Overdue: ${esc(f.overdue[0].title)}`, n(f.overdue.length, "1 task is past its due date.", "# tasks are past their due date."), "Open tasks", "go('My Workday')"];
  if (f.shouldBeOut.length)
    return [`Has ${esc(f.shouldBeOut[0].title)} gone out?`, "It started on " + fmtDay(jobDays(f.shouldBeOut[0])[0]) + " but is still marked Booked.", "Open pipeline", "go('Pipeline')"];
  if (f.toInvoice.length)
    return [n(f.toInvoice.length, "Invoice 1 returned job", "Invoice # returned jobs"), f.toInvoice.map((j) => esc(j.title)).slice(0, 3).join(", "), "Open pipeline", "go('Pipeline')"];
  if (f.quotes.length)
    return [n(f.quotes.length, "Chase 1 outstanding quote", "Chase # outstanding quotes"), money(f.quotes.reduce((s, j) => s + jobValue(j), 0)) + " waiting on a decision.", "Open pipeline", "go('Pipeline')"];
  return canWrite("jobs") ? ["You're all caught up", "Nothing urgent. Add the next enquiry when it comes in.", "New job", "newJob()"] : ["You're all caught up", "Nothing urgent right now.", "Event Planner", "go('Event Planner')"];
}

// Team members without jobs access see their event plans instead of the business dashboard.
function memberOverview() {
  const plans = [...db.plans].sort((a, b) => (a.eventDate || "9999").localeCompare(b.eventDate || "9999"));
  const due = plans
    .flatMap((p) => p.stages.flatMap((s) => s.items.filter((i) => i.due && i.status !== "done" && i.status !== "na").map((i) => ({ p, i }))))
    .sort((a, b) => a.i.due.localeCompare(b.i.due))
    .slice(0, 8);
  const today = todayKey();
  return `<div class="toolbar">${hasSection("planner") ? `<button class="btn" onclick="planDialog()">Plan an event</button>` : ""}</div>
  <div class="cols"><div class="panel"><h2>Your events</h2>${plans.map((p) => row(`<b>${esc(p.title)}</b><div class="muted">${p.eventDate ? fmtDay(p.eventDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Date not set"} · ${countdown(p.eventDate)}</div>`, `<button class="btn small secondary" onclick="openPlan(${p.id})">Open</button>`)).join("") || '<p class="empty">No event plans yet.</p>'}</div>
  <div class="panel"><h2>Coming up on the checklists</h2>${due.map(({ p, i }) => row(`${esc(i.title)}<div class="muted">${esc(p.title)}</div>`, `<span class="tag ${i.due < today ? "warning" : ""}">${i.due < today ? "Overdue · " : ""}${fmtDay(i.due, { day: "numeric", month: "short" })}</span>`)).join("") || '<p class="empty">Nothing due.</p>'}</div></div>`;
}
function overview() {
  if (!me.owner && !hasSection("jobs")) return memberOverview();
  const f = overviewFacts();
  const [title, detail, label, action] = nextAction(f);
  const month = f.today.slice(0, 7);
  const monthBooked = db.jobs.filter((j) => (j.start || "").startsWith(month) && ["booked", "out", "returned", "invoiced"].includes(stageOf(j)));
  const sum = (list) => money(list.reduce((s, j) => s + jobValue(j), 0));
  const stat = (label, value, sub, action, alert) =>
    `<button class="stat ${alert ? "alert" : ""}" onclick="${action}"><span class="label">${label}</span><span class="value">${value}</span><span class="sub">${sub}</span></button>`;
  const late = lateReturns();
  const when = (j) => (jobDays(j)?.[0] ? fmtDay(jobDays(j)[0], { weekday: "short", day: "numeric", month: "short" }) : "Date not set");
  const jobRow = (j, extra = "") =>
    row(
      `<div class="job-line">${dateBox(jobDays(j)?.[0])}<div><b>${esc(j.title)}</b><div class="muted">${esc(fmtRange(j))}${j.venue ? " · " + esc(j.venue) : ""}${j.client ? " · " + esc(j.client) : ""}</div>${extra}</div></div>`,
      `${stageTag(j)} <button class="btn small secondary" onclick="openJob(${j.id})">Open</button>`,
    );
  const list = (jobs, empty, max = 6, extra) => (jobs.length ? jobs.slice(0, max).map((j) => jobRow(j, extra ? extra(j) : "")).join("") + (jobs.length > max ? `<p class="hint">and ${jobs.length - max} more</p>` : "") : `<p class="empty">${empty}</p>`);
  const more = (filter, text) => `<div class="toolbar" style="margin-top:10px"><button class="btn small secondary" onclick="showJobs('${filter}')">${text}</button></div>`;
  const nextUp = f.upcoming[0];
  return `
  <div class="toolbar">${hasSection("planner") ? `<button class="btn" onclick="planDialog()">Plan an event</button>` : ""}${canWrite("jobs") ? `<button class="btn secondary" onclick="newJob()">+ New job</button>` : ""}</div>
  <div class="next-action"><div><span class="muted">Next action</span><b>${title}</b><span class="muted">${detail}</span></div><button class="btn" onclick="${action}">${label}</button></div>
  <div class="stats">
    ${stat("Coming up", f.upcoming.length, nextUp ? "Next: " + esc(nextUp.title) + " · " + when(nextUp) : "No jobs booked ahead", "showJobs('upcoming')")}
    ${stat("This week", f.thisWeek.length, fmtDay(f.wkFrom, { day: "numeric", month: "short" }) + " – " + fmtDay(f.wkTo, { day: "numeric", month: "short" }) + (f.nextWeek.length ? ` · ${f.nextWeek.length} next week` : ""), "go('Calendar')")}
    ${stat("Late returns", late.length, late.length ? late.reduce((s, x) => s + x.items, 0) + " items not booked back in" : "Everything's back", "showJobs('late')", late.length)}
    ${stat("Quotes out", f.awaitingReply.length, f.awaitingReply.length ? sum(f.awaitingReply) + " awaiting a reply" : f.quotesToSend.length ? f.quotesToSend.length + " enquir" + (f.quotesToSend.length > 1 ? "ies" : "y") + " to quote" : "None waiting", "showJobs('quote')")}
    ${me.money ? stat("Unpaid invoices", f.unpaid.length, f.unpaid.length ? sum(f.unpaid) + (f.overdueInvoices.length ? ` · ${f.overdueInvoices.length} overdue` : " awaiting payment") : f.invoicesToSend.length ? f.invoicesToSend.length + " to send" : "All paid", "showJobs('unpaid')", f.overdueInvoices.length) : ""}
    ${stat("Kit shortages", f.short.length, f.short.length ? "jobs can't be fully supplied" : "All jobs covered", "go('Cross-hire')", f.short.length)}
    ${stat("Tasks due", f.dueSoon.length, f.overdue.length ? f.overdue.length + " overdue · " + f.open.length + " open" : f.open.length + " open in total", "go('My Workday')", f.overdue.length)}
  </div>
  <p class="hint" style="margin:0 0 6px">Pipeline · ${sum(monthBooked)} booked for ${fmtDay(f.today, { month: "long" })} (excluding VAT, not payments received) · click a stage to see its jobs</p>
  <div class="strip" aria-label="Pipeline">${STAGES.map((s) => `<button data-stage="${s}" onclick="showJobs('${s}')" title="Show ${STAGE_LABELS[s]} jobs"><b>${f.byStage[s].length}</b><span>${STAGE_LABELS[s]}</span></button>`).join("")}</div>
  ${late.length ? `<div class="cols"><div class="panel late-panel"><h2>Late returns</h2>${late.map((x) => row(`<b>${esc(x.j.title)}</b><div class="muted">${esc(lateText(x))} · ${x.items} item${x.items === 1 ? "" : "s"} still out · due back ${esc(fmtDay(String(x.j.end).slice(0, 10), { day: "numeric", month: "short" }))}</div>`, `<span class="tag danger-tag">Late</span> <button class="btn small" onclick="openBooking(${x.j.id},'in')">Book in</button>`)).join("")}</div></div>` : ""}
  <div class="cols">
    ${panel("Coming up", list(f.upcoming, "No jobs from today onwards. Add one with + New job.", 8) + (f.upcoming.length ? more("upcoming", "All upcoming jobs") : ""))}
    <div>${panel("This week", list(f.thisWeek, "No jobs this week.", 5))}${panel("Next week", list(f.nextWeek, "No jobs next week.", 5))}</div>
  </div>
  <div class="cols">
    ${panel("Quotes", (f.awaitingReply.length ? `<h3>Awaiting a reply</h3>${list(f.awaitingReply, "", 5, (j) => (j.quoteSentAt ? `<div class="muted">Sent ${fmtDay(j.quoteSentAt.slice(0, 10), { day: "numeric", month: "short" })} · ${money(jobValue(j))}</div>` : ""))}` : "") + (f.quotesToSend.length ? `<h3>Enquiries to quote</h3>${list(f.quotesToSend, "", 5)}` : "") + (!f.awaitingReply.length && !f.quotesToSend.length ? '<p class="empty">No quotes waiting.</p>' : ""))}
    ${me.money ? panel("Invoices", (f.unpaid.length ? `<h3>Sent, awaiting payment</h3>${f.unpaid.slice(0, 6).map((j) => row(`<b>${esc(j.invoiceNo)} · ${esc(j.title)}</b><div class="muted">${money(jobValue(j))} · sent ${fmtDay(j.invoiceSentAt.slice(0, 10), { day: "numeric", month: "short" })}${f.overdueInvoices.includes(j) ? ' · <span class="tag danger-tag">Overdue</span>' : ""}</div>`, me.owner ? `<button class="btn small" onclick="markPaid(${j.id})">Mark as paid</button>` : "")).join("")}` : "") + (f.invoicesToSend.length ? `<h3>To send</h3>${f.invoicesToSend.slice(0, 6).map((j) => row(`<b>${esc(j.title)}</b><div class="muted">${j.invoiceNo ? esc(j.invoiceNo) + " created · not sent" : "No invoice yet"} · ${money(jobValue(j))}</div>`, me.owner ? `<button class="btn small secondary" onclick="sendToClient(${j.id},'invoice')">Send invoice</button>` : "")).join("")}` : "") + (!f.unpaid.length && !f.invoicesToSend.length ? '<p class="empty">Nothing to send or chase.</p>' : "")) : ""}
  </div>
  <div class="cols">
    ${panel(
      "Tasks due",
      f.dueSoon.length || f.open.length
        ? (f.dueSoon.length ? f.dueSoon : f.open)
            .slice(0, 6)
            .map((t) => row(`<label><input class="check" type="checkbox" onchange="toggleTask(${t.id})"> ${esc(t.title)}</label>`, dueTag(t, f.today)))
            .join("") + `<div class="toolbar" style="margin-top:10px"><button class="btn small secondary" onclick="go('My Workday')">All tasks</button></div>`
        : '<p class="empty">Nothing outstanding.</p>',
    )}
  </div>`;
}

function dueTag(t, today = todayKey()) {
  if (!t.due) return t.priority === "High" ? '<span class="tag warning">High</span>' : "";
  const cls = t.due < today ? "warning" : t.due === today ? "success" : "";
  const word = t.due < today ? "Overdue · " : t.due === today ? "Today · " : "";
  return `<span class="tag ${cls}">${word}${fmtDay(t.due)}</span>`;
}

function workday() {
  const today = todayKey();
  const order = (t) => (t.done ? "2" : "1") + (t.due || "9999") + (t.priority === "High" ? "0" : "1");
  const list = [...db.tasks].sort((a, b) => order(a).localeCompare(order(b)));
  return (
    panel(
      "Tasks",
      form(
        [
          { name: "title", label: "Next action", placeholder: "e.g. Follow up theatre quote" },
          { name: "due", label: "Due (optional)", type: "date", required: false },
          { name: "project", label: "Project", select: ["", ...db.projects.map((p) => p.name)] },
          { name: "priority", label: "Priority", select: ["Normal", "High", "Low"] },
        ],
        "addTask",
        "Add task",
      ) +
        (list
          .map((t) =>
            row(
              `<label><input class="check" type="checkbox" ${t.done ? "checked" : ""} onchange="toggleTask(${t.id})"> <span style="${t.done ? "text-decoration:line-through;opacity:.6" : ""}">${esc(t.title)}</span><div class="muted" style="padding-left:26px">${esc(t.project || "")}</div></label>`,
              t.done ? "" : dueTag(t, today) + (t.due && t.priority === "High" ? ' <span class="tag warning">High</span>' : ""),
            ),
          )
          .join("") || '<p class="empty">No tasks yet.</p>'),
    ) +
    panel(
      "Ask HQ · Assistant preview",
      `<p class="muted">The live AI assistant will review permitted email, calendar and job data once securely connected. For now, use these quick prompts to plan your day.</p><div class="toolbar"><button class="btn small secondary" onclick="hqTip('today')">What should I do today?</button><button class="btn small secondary" onclick="hqTip('risk')">Find job risks</button><button class="btn small secondary" onclick="hqTip('growth')">Growth idea</button></div><p id="hqTip" class="hq-tip">Suggestions here are generated from the workspace records, not live email or calendar.</p>`,
    ) +
    panel(
      "Opportunities & Inspiration",
      `<b>Growth idea:</b> Offer scheduled servicing and support contracts to existing AV installation customers.<p><b>Project to revisit:</b> ARENA VI — reserve 30 minutes to advance sponsorship outreach.</p><p><b>Book:</b> The E-Myth Revisited — Michael E. Gerber.</p><p class="muted">These are illustrative suggestions, not live research.</p>`,
    )
  );
}
function projects() {
  return panel(
    "Projects",
    form(
      [
        { name: "name", label: "Project name" },
        { name: "note", label: "Description" },
      ],
      "addProject",
      "Add project",
    ) +
      (db.projects
        .map((p) => row(`<b>${esc(p.name)}</b><div class="muted">${esc(p.note)}</div>`, `<span class="tag success">${esc(p.status)}</span>`))
        .join("") || '<p class="empty">No projects yet.</p>'),
  );
}
function addTask(e) {
  e.preventDefault();
  const d = data(e);
  if (!d.due) delete d.due;
  db.tasks.push({ id: uid(), ...d, done: false });
  save();
  render();
}
function toggleTask(id) {
  let t = db.tasks.find((t) => t.id === id);
  t.done = !t.done;
  save();
  render();
}
function addProject(e) {
  e.preventDefault();
  db.projects.push({ id: uid(), ...data(e), status: "Active" });
  save();
  render();
}
function hqTip(type) {
  let box = $("hqTip");
  if (!box) return;
  if (type === "today") {
    const [title, detail] = nextAction(overviewFacts());
    box.innerHTML = "Start with: <b>" + title + "</b>. " + detail;
  } else if (type === "risk") {
    let s = allShortages();
    box.textContent = s.length
      ? s.length + " equipment shortage alerts. Open Cross-hire to review."
      : "No shortage alerts in the current records. This does not check real-world stock.";
  } else
    box.textContent =
      "Potential growth action: contact one past AV installation customer about a service and maintenance agreement.";
}
