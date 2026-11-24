// Pipeline: one column per stage. Move a job forward or back with the arrow buttons.
function pipeline() {
  const today = todayKey();
  const cols = STAGES.map((st, i) => {
    const list = db.jobs
      .filter((j) => stageOf(j) === st)
      .sort((a, b) => (a.start || "9999").localeCompare(b.start || "9999"));
    const total = list.reduce((s, j) => s + jobValue(j), 0);
    const cards = list
      .map((j) => {
        const issues = st === "invoiced" || st === "returned" ? [] : jobShortages(j);
        const late = st === "booked" && (jobDays(j)?.[0] || "9") < today;
        return `<div class="board-card"><b>${esc(j.title)}</b><span class="muted">${esc(j.client || "No client")}</span><span class="muted">${esc(fmtRange(j))}</span><span class="muted">${money(jobValue(j))}</span>${issues.length ? `<span class="tag warning">${issues.length} shortage(s)</span>` : ""}${late ? '<span class="tag warning">Start date passed</span>' : ""}
        <div class="moves"><button class="btn small ghost" ${i === 0 ? "disabled" : ""} onclick="moveStage(${j.id},-1)" aria-label="Move ${esc(j.title)} back to ${i ? STAGE_LABELS[STAGES[i - 1]] : ""}">←</button><button class="btn small secondary" onclick="openJob(${j.id})">Open</button><button class="btn small ghost" ${i === STAGES.length - 1 ? "disabled" : ""} onclick="moveStage(${j.id},1)" aria-label="Move ${esc(j.title)} on to ${STAGE_LABELS[STAGES[i + 1]] || ""}">→</button></div></div>`;
      })
      .join("");
    return `<section class="board-col" data-stage="${st}"><h2>${STAGE_LABELS[st]} <small>${list.length} · ${money(total)}</small></h2>${cards || '<p class="hint">None</p>'}</section>`;
  });
  return `<div class="toolbar">${canWrite("jobs") ? `<button class="btn" onclick="newJob()">+ New job</button>` : ""}<span class="hint">Booked and Out on hire reserve stock. Moving a job to Booked checks for shortages first.</span></div><div class="board">${cols.join("")}</div>`;
}

// Move a job one stage forward (+1) or back (-1), keeping its stock reservation in step.
function moveStage(id, dir) {
  const j = db.jobs.find((x) => x.id === id);
  if (!j) return;
  const to = STAGES[STAGES.indexOf(stageOf(j)) + dir];
  if (!to) return;
  const next = { ...j, stage: to, booking: STAGE_BOOKING[to] };
  if (next.booking === "Reserved" && j.booking !== "Reserved") {
    const [from, until] = bounds(next);
    if (!(until > from)) return alert("Set the job's allocation start and return date before booking it.");
    if (!next.kit.length) return alert("Add equipment to the job before booking it.");
    const issue = shortages(next, db)[0];
    if (issue)
      return alert(`Can't book ${j.title}: ${issue.name} is short by ${issue.short}${issue.conflicts.length ? " (also out on " + issue.conflicts.join(", ") + ")" : ""}. Plan a cross-hire or change the kit first.`);
  }
  Object.assign(j, next);
  save();
  render();
}
