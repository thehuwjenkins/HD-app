// Date helpers. Jobs store local depot times as "YYYY-MM-DDTHH:MM" (older jobs: "YYYY-MM-DD").
// Days are handled as "YYYY-MM-DD" strings, with arithmetic in UTC so clock changes never shift a day.
const DAY = 86400000;
const dayMs = (d) => Date.parse(d + "T00:00:00Z");
const msDay = (ms) => new Date(ms).toISOString().slice(0, 10);
function addDays(d, n) {
  return msDay(dayMs(d) + n * DAY);
}
function todayKey() {
  const n = new Date();
  return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
}
// Monday of the week containing d.
function weekStart(d) {
  const dow = (new Date(dayMs(d)).getUTCDay() + 6) % 7;
  return addDays(d, -dow);
}
// First and last day a job occupies (inclusive), or null if it has no valid dates.
// An end time of exactly 00:00 means the job finished at the end of the day before.
function jobDays(job) {
  const s = /^\d{4}-\d\d-\d\d/.exec(job.start || "")?.[0];
  if (!s) return null;
  let e = /^\d{4}-\d\d-\d\d/.exec(job.end || "")?.[0] || s;
  if (/T00:00$/.test(job.end || "") && e > s) e = addDays(e, -1);
  return e < s ? [s, s] : [s, e];
}
function overlaps(job, from, to) {
  const d = jobDays(job);
  return !!d && d[0] <= to && d[1] >= from;
}
function fmtDay(d, opts = { weekday: "short", day: "numeric", month: "short" }) {
  return new Date(dayMs(d)).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
}
function fmtTime(s) {
  return /T(\d\d:\d\d)$/.exec(s || "")?.[1] || "";
}
// "Sat 12 Dec 09:00 – Sun 13 Dec 12:00", or "Dates not set".
function fmtRange(job) {
  const d = jobDays(job);
  if (!d) return "Dates not set";
  const a = fmtDay(d[0]) + (fmtTime(job.start) ? " " + fmtTime(job.start) : "");
  const endDay = /^\d{4}-\d\d-\d\d/.exec(job.end || "")?.[0];
  const b = endDay ? fmtDay(endDay) + (fmtTime(job.end) ? " " + fmtTime(job.end) : "") : "";
  return b && b !== a ? a + " – " + b : a;
}
function dateBox(d) {
  if (!d) return '<div class="datebox"><b>–</b><span>no date</span></div>';
  return `<div class="datebox"><b>${Number(d.slice(8, 10))}</b><span>${fmtDay(d, { month: "short" })}</span></div>`;
}
