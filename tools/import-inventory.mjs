// Add or update inventory items in the live app from a JSON list, as one undoable save.
//   NODE_USE_ENV_PROXY=1 node tools/import-inventory.mjs items.json [--dry-run]
// Each item: {name, category?, qty, service?, weightKg?, weightEst?, value?, valueEst?, price?, lengthCm?, widthCm?, heightCm?, stackable?, inCase?, notes?}
// Existing items (same name, any case) are updated with the fields given; others are added.
import {readFileSync} from 'node:fs';
import {liveDB} from './live-d1.mjs';
import {loadState, applyChanges} from '../src/store.js';

const [file, flag] = process.argv.slice(2);
const items = JSON.parse(readFileSync(file, 'utf8'));
const env = {DB: liveDB};
const {state, versions} = await loadState(env);
const byName = new Map(state.inventory.map((i) => [i.name.toLowerCase(), i]));
const FIELDS = ['category', 'qty', 'service', 'weightKg', 'weightEst', 'value', 'valueEst', 'price', 'lengthCm', 'widthCm', 'heightCm', 'stackable', 'inCase', 'notes'];
let id = Date.now() * 10;
const changes = [];
for (const it of items) {
  const name = String(it.name || '').trim();
  if (!name) throw Error('An item has no name');
  const old = byName.get(name.toLowerCase());
  const rec = old ? {...old} : {id: id++, name, qty: 0, service: 0, price: 0, photo: ''};
  for (const f of FIELDS) if (it[f] !== undefined && it[f] !== null && it[f] !== '') rec[f] = it[f];
  rec.qty = Number(rec.qty) || 0;
  rec.service = Number(rec.service) || 0;
  changes.push({collection: 'inventory', id: rec.id, op: 'put', version: old ? versions.inventory[old.id] : 0, data: rec});
  byName.set(name.toLowerCase(), rec);
}
console.log(`${changes.filter((c) => !c.version).length} new, ${changes.filter((c) => c.version).length} updated`);
if (flag === '--dry-run') { console.log(JSON.stringify(changes.map((c) => c.data), null, 1)); process.exit(0); }
const r = await applyChanges(env, 'claude (on behalf of huw@hd-events.co.uk)', changes, {reason: 'import', summaryExtra: {source: 'inventory list pasted in chat'}});
console.log('Saved', r.versions.length, 'records as save', r.saveId);
