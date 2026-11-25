// Crew reports from the "My jobs" page: equipment damage, a job debrief, and receipts / venue photos.
// Crew can only report on jobs they are assigned to. Reports are stored as records (collection
// jobReports), so they appear in History and backups like everything else.
import {applyChanges, loadState} from './store.js';
import {storeFile} from './files.js';

const clean = (s) => String(s || '').trim().toLowerCase();
export const LABELS = ['Receipt', 'Venue photo'];

// Job ids this person is on: as the job's staff member, or by accepting a crew invite.
export function assignedJobIds(state, email) {
  const ids = new Set(state.staff.filter((s) => clean(s.email) === email).map((s) => String(s.id)));
  const accepted = (state.crewInvites || []).filter((i) => ids.has(String(i.staffId)) && i.status === 'Accepted').map((i) => String(i.jobId));
  return new Set(state.jobs.filter((j) => ids.has(String(j.staffId)) || accepted.includes(String(j.id))).map((j) => j.id));
}
// Same-site form posts. Browsers may send "Origin: null" when the page asks for no referrer, so a
// same-origin Sec-Fetch-Site also counts. Cross-site posts are refused.
export function sameSite(req, url) {
  const o = req.headers.get('origin');
  if (o) return o === url.origin || (o === 'null' && req.headers.get('sec-fetch-site') === 'same-origin');
  return req.headers.get('sec-fetch-site') === 'same-origin';
}
const back = (msg, jobId) => new Response(null, {status: 303, headers: {location: '/?msg=' + encodeURIComponent(msg) + (jobId ? '#job-' + jobId : ''), 'cache-control': 'no-store'}});
const newId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);

export async function handleCrew(req, env, url, email) {
  if (req.method !== 'POST') return new Response('Not found', {status: 404});
  if (!sameSite(req, url)) return new Response('Forbidden', {status: 403});
  const {state} = await loadState(env);
  const me = state.staff.find((s) => clean(s.email) === email);
  if (!me) return new Response('Forbidden', {status: 403});
  let form;
  try { form = await req.formData(); } catch { return back('That form could not be read. Please try again.'); }
  const path = url.pathname;
  // Accept or decline a crew invite.
  if (path === '/api/crew/invite') {
    const inv = (state.crewInvites || []).find((i) => String(i.id) === String(form.get('inviteId')));
    const mine = new Set(state.staff.filter((s) => clean(s.email) === email).map((s) => String(s.id)));
    if (!inv || !mine.has(String(inv.staffId))) return back('That invitation is no longer available.');
    const answer = form.get('answer') === 'accept' ? 'Accepted' : form.get('answer') === 'decline' ? 'Declined' : '';
    if (!answer) return back('Choose accept or decline.');
    const {versions} = await loadState(env);
    await applyChanges(env, email, [{collection: 'crewInvites', id: inv.id, op: 'put', version: versions.crewInvites[inv.id], data: {...inv, status: answer, respondedAt: new Date().toISOString()}}], {reason: 'crew invite ' + answer.toLowerCase()});
    return back(answer === 'Accepted' ? 'Thanks, you are booked on the job. It is now in your jobs below.' : 'Thanks, we have let Huw know you can\'t make it.', answer === 'Accepted' ? inv.jobId : '');
  }
  const jobId = Number(form.get('jobId'));
  const job = state.jobs.find((j) => j.id === jobId);
  if (!job || !assignedJobIds(state, email).has(jobId)) return back('You can only report on jobs you are assigned to.');
  const base = {jobId, by: email, byName: me.name || email, at: new Date().toISOString()};
  const records = [];
  if (path === '/api/crew/damage') {
    // One description can cover several items.
    const text = String(form.get('text') || '').trim().slice(0, 6000);
    if (!text) return back('Describe what was damaged and what happened.', jobId);
    records.push({...base, kind: 'damage', item: String(form.get('item') || '').slice(0, 120), text});
  } else if (path === '/api/crew/debrief') {
    const text = String(form.get('text') || '').trim().slice(0, 6000);
    if (!text) return back('Write your debrief first.', jobId);
    records.push({...base, kind: 'debrief', text});
  } else if (path === '/api/crew/photo') {
    // Receipts and venue photos, several of each in one go (older form: one "photo" field plus a label).
    const isFile = (f) => f && typeof f === 'object' && f.size;
    const files = [
      ...form.getAll('receipts').filter(isFile).map((f) => [f, 'Receipt']),
      ...form.getAll('venue').filter(isFile).map((f) => [f, 'Venue photo']),
      ...(LABELS.includes(form.get('label')) ? form.getAll('photo').filter(isFile).map((f) => [f, form.get('label')]) : []),
    ];
    if (!files.length) return back('Choose at least one receipt or venue photo.', jobId);
    if (files.length > 20) return back('Upload up to 20 photos at a time.', jobId);
    const note = String(form.get('note') || '').trim().slice(0, 300);
    for (const [f, label] of files) {
      try {
        const fileUrl = await storeFile(env, 'crew', f.type, await f.arrayBuffer());
        records.push({...base, kind: 'photo', label, url: fileUrl, name: String(f.name || '').slice(0, 120), ...(note ? {text: note} : {})});
      } catch (e) {
        return back((e.message || 'Upload failed') + ' (' + (f.name || 'photo') + ')', jobId);
      }
    }
  } else return new Response('Not found', {status: 404});
  let id = newId();
  await applyChanges(env, email, records.map((data) => ({collection: 'jobReports', id: id, op: 'put', version: 0, data: {...data, id: id++}})), {reason: 'crew report'});
  const done = {damage: 'Damage report saved. Thank you.', debrief: 'Debrief saved. Thank you.', photo: records.length + ' photo' + (records.length > 1 ? 's' : '') + ' uploaded.'}[records[0].kind];
  return back(done, jobId);
}
