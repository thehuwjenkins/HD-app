function overview() {
  let now = new Date();
  now.setHours(0, 0, 0, 0);
  let end = new Date(now);
  end.setDate(end.getDate() + 14);
  let upcoming = db.jobs
    .filter(
      (j) =>
        new Date((j.start || "").slice(0, 10) + "T00:00:00") >= now &&
        new Date((j.start || "").slice(0, 10) + "T00:00:00") <= end,
    )
    .sort((a, b) => a.start.localeCompare(b.start));
  let pending = db.tasks.filter((t) => !t.done);
  let shortages = allShortages();
  return `<div class="hq-actions"><button onclick="editingJob=null;draftKit=[];go('Jobs')"><span>＋</span><b>New Job</b><small>Build a booking & quote</small></button><button onclick="go('Jobs')"><span>▦</span><b>Upcoming Jobs</b><small>${upcoming.length} in the next 14 days</small></button><button onclick="go('Cross-hire')"><span>⚠</span><b>Equipment Shortages</b><small>${shortages.length} alerts</small></button><button onclick="go('My Workday')"><span>☑</span><b>My Tasks</b><small>${pending.length} to tackle</small></button></div><div class="hq-cols">${panel("Next 14 days", upcoming.length ? upcoming.map((j) => row(`<b>${esc(j.title)}</b><div class="muted">${esc(j.start)} · ${esc(j.client)}</div>`, `<button class="btn secondary" onclick="go('Jobs');editJob(${j.id})">Open</button>`)).join("") : '<p class="muted">No upcoming bookings entered yet.</p>')}${panel(
    "Your next actions",
    pending
      .slice(0, 4)
      .map((t) => row(esc(t.title), `<button class="btn secondary" onclick="go('My Workday')">View</button>`))
      .join("") || '<p class="muted">Nothing outstanding.</p>',
  )}</div>${panel("Ask HQ · Assistant preview", `<p class="muted">The live AI assistant will review permitted email, calendar and job data once securely connected. For now, use these quick prompts to plan your day.</p><button class="btn secondary" onclick="hqTip('today')">What should I do today?</button> <button class="btn secondary" onclick="hqTip('risk')">Find job risks</button> <button class="btn secondary" onclick="hqTip('growth')">Growth idea</button><p id="hqTip" class="hq-tip">Suggestions here are generated from the workspace records, not live email or calendar.</p>`)}${panel("Opportunities & Inspiration", `<b>Growth idea:</b> Offer scheduled servicing and support contracts to existing AV installation customers.<p><b>Project to revisit:</b> ARENA VI — reserve 30 minutes to advance sponsorship outreach.</p><p><b>Book:</b> The E-Myth Revisited — Michael E. Gerber.</p><p class="muted">These are illustrative suggestions, not live research.</p>`)}`;
}
function workday() {
  return panel(
    "Today’s tasks",
    form(
      [
        { name: "title", label: "Next action", placeholder: "e.g. Follow up theatre quote" },
        { name: "project", label: "Project", select: db.projects.map((p) => p.name) },
        { name: "priority", label: "Priority", select: ["Normal", "High", "Low"] },
      ],
      "addTask",
      "Add task",
    ) +
      db.tasks
        .map((t) =>
          row(
            `<label><input class="check" type="checkbox" ${t.done ? "checked" : ""} onchange="toggleTask(${t.id})"> <span style="${t.done ? "text-decoration:line-through;opacity:.6" : ""}">${esc(t.title)}</span><div class="muted" style="padding-left:22px">${esc(t.project)}</div></label>`,
            `<span class="tag ${t.priority === "High" ? "warning" : ""}">${esc(t.priority)}</span>`,
          ),
        )
        .join(""),
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
      db.projects
        .map((p) =>
          row(
            `<b>${esc(p.name)}</b><div class="muted">${esc(p.note)}</div>`,
            `<span class="tag success">${esc(p.status)}</span>`,
          ),
        )
        .join(""),
  );
}
function addTask(e) {
  e.preventDefault();
  db.tasks.push({ id: uid(), ...data(e), done: false });
  save();
  render();
  e.target.reset();
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
    let t = db.tasks.find((t) => !t.done);
    box.textContent = t
      ? "Start with: " + t.title + ". Spend 20 focused minutes on it."
      : "Your task list is clear. Add a specific next action.";
  } else if (type === "risk") {
    let s = allShortages();
    box.textContent = s.length
      ? s.length + " equipment shortage alerts. Open Equipment Shortages to review."
      : "No shortage alerts in the current demo records. This does not check real-world stock.";
  } else
    box.textContent =
      "Potential growth action: contact one past AV installation customer about a service and maintenance agreement.";
}
