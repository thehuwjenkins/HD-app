// Saving: after every change the app calls save(). Instead of sending the whole workspace,
// save() compares each record with the last saved copy and sends only the records that changed.
const COLLECTIONS = ["jobs", "inventory", "staff", "clients", "tasks", "projects", "packages", "crewInvites", "crossHires", "quotes", "plans", "jobReports"];
let writes = Promise.resolve(),
  pending = 0,
  failed = false;

// Last saved copy of every record: { collection: Map(id -> {json, version}) }, settings under "settings".
const synced = {};
function snapshot() {
  for (const c of COLLECTIONS)
    synced[c] = new Map(db[c].map((r) => [r.id, { json: JSON.stringify(r), version: boot.versions[c]?.[r.id] ?? 0 }]));
  synced.settings = new Map(
    Object.keys(db)
      .filter((k) => !COLLECTIONS.includes(k))
      .map((k) => [k, { json: JSON.stringify(db[k]), version: boot.versions.settings?.[k] ?? 0 }]),
  );
}
snapshot();

// Work out what changed since the last save.
function pendingChanges() {
  const changes = [];
  const compare = (collection, current, saved) => {
    for (const [id, rec] of current) {
      const json = JSON.stringify(rec),
        was = saved.get(id);
      if (!was || was.json !== json) changes.push({ collection, id, op: "put", version: was?.version ?? 0, data: rec, json });
    }
    for (const [id, was] of saved) if (!current.has(id)) changes.push({ collection, id, op: "delete", version: was.version });
  };
  for (const c of COLLECTIONS) compare(c, new Map(db[c].map((r) => [r.id, r])), synced[c]);
  const settings = new Map(
    Object.keys(db)
      .filter((k) => !COLLECTIONS.includes(k) && db[k] !== undefined)
      .map((k) => [k, db[k]]),
  );
  compare("settings", settings, synced.settings);
  return changes;
}

window.addEventListener("beforeunload", (e) => {
  if (pending) {
    e.preventDefault();
    e.returnValue = "";
  }
});

function save() {
  if (failed) return;
  pending++;
  $("syncState").textContent = "Saving…";
  writes = writes
    .then(async () => {
      if (failed) return;
      const changes = pendingChanges();
      if (!changes.length) return;
      const body = changes.map(({ json, ...c }) => (c.op === "put" ? { ...c, data: JSON.parse(json) } : c));
      const res = await fetch("/api/changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: body }),
      });
      if (!res.ok) throw Error((await res.text()).slice(0, 300));
      const { versions, access } = await res.json();
      if (access) accessSyncResult(access);
      versions.forEach((v, i) => {
        const ch = changes[i];
        if (v.version === null) synced[ch.collection].delete(ch.id);
        else synced[ch.collection].set(ch.id, { json: ch.json, version: v.version });
      });
    })
    .catch((err) => {
      failed = true;
      alert("Changes were not saved. " + err.message);
      location.reload();
    })
    .finally(() => {
      pending--;
      if (!pending && !failed) $("syncState").textContent = "All changes saved";
    });
}

// Upload an image to file storage; resolves to its /files/... address.
async function uploadImage(file, kind) {
  const res = await fetch("/api/files?kind=" + encodeURIComponent(kind), {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) throw Error((await res.text()).slice(0, 300));
  return (await res.json()).url;
}
