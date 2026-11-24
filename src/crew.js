// Crew reports from the "My jobs" page: equipment damage, a job debrief, and receipts / venue photos.
// Crew can only report on jobs they are assigned to. Reports are stored as records (collection
// jobReports), so they appear in History and backups like everything else.
import {applyChanges, loadState} from './store.js';
import {storeFile} from './files.js';

const clean = (s) => String(s || '').trim().toLowerCase();
export const LABELS = ['Receipt', 'Venue photo'];

// Job ids this person is assigned to (as the job's staff member).
export function assignedJobIds(state, email) {
  const ids = new Set(state.staff.filter((s) => clean(s.email) === email).map((s) => String(s.id)));
  return new Set(state.jobs.filter((j) => ids.has(String(j.staffId))).map((j) => j.id));
}
const back = (msg, jobId) => new Response(null, {status: 303, headers: {location: '/?msg=' + encodeURIComponent(msg) + (jobId ? '#job-' + jobId : ''), 'cache-control': 'no-store'}});
const newId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);

export async function handleCrew(req, env, url, email) {
  if (req.method !== 'POST') return new Response('Not found', {status: 404});
  if (req.headers.get('origin') !== url.origin) return new Response('Forbidden', {status: 403});
  const {state} = await loadState(env);
  const me = state.staff.find((s) => clean(s.email) === email);
  if (!me) return new Response('Forbidden', {status: 403});
  let form;
  try { form = await req.formData(); } catch { return back('That form could not be read. Please try again.'); }
  const jobId = Number(form.get('jobId'));
  const job = state.jobs.find((j) => j.id === jobId);
  if (!job || !assignedJobIds(state, email).has(jobId)) return back('You can only report on jobs you are assigned to.');
  const base = {jobId, by: email, byName: me.name || email, at: new Date().toISOString()};
  const records = [];
  const path = url.pathname;
  if (path === '/api/crew/damage') {
    const item = String(form.get('item') || '').slice(0, 120);
    const text = String(form.get('text') || '').trim().slice(0, 4000);
    if (!item || !text) return back('Choose the item and describe the damage.', jobId);
    if (!(job.kit || []).some((k) => k.item === item) && item !== 'Other') return back('Choose an item from this job.', jobId);
    records.push({...base, kind: 'damage', item, text});
  } else if (path === '/api/crew/debrief') {
    const text = String(form.get('text') || '').trim().slice(0, 6000);
    if (!text) return back('Write your debrief first.', jobId);
    records.push({...base, kind: 'debrief', text});
  } else if (path === '/api/crew/photo') {
    const label = LABELS.includes(form.get('label')) ? form.get('label') : '';
    if (!label) return back('Choose Receipt or Venue photo.', jobId);
    const files = form.getAll('photo').filter((f) => f && typeof f === 'object' && f.size);
    if (!files.length) return back('Choose a photo to upload.', jobId);
    if (files.length > 10) return back('Upload up to 10 photos at a time.', jobId);
    const note = String(form.get('note') || '').trim().slice(0, 300);
    for (const f of files) {
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
