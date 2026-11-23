// Creative board (concept, colours, moodboard, AI visuals) and the poster studio.
// AI images are made by Cloudflare Workers AI on the server. Poster text is drawn by the app on top
// of the artwork, so names, dates and line-ups are always spelt correctly.
let aiBusy = false,
  posterIdx = 0;

async function aiImage(prompt) {
  const res = await fetch("/api/ai/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
  const text = await res.text();
  if (!res.ok) throw Error(text.slice(0, 300));
  return JSON.parse(text).url;
}

// ---------- Creative board ----------
const VISUAL_IDEAS = [
  ["Aerial view", "Aerial drone photo of the whole festival site"],
  ["Main stage", "The main stage at night with lights and a big crowd, view from the crowd"],
  ["Golden hour", "Wide shot of the crowd at golden hour, relaxed and happy"],
  ["Bars & food", "The bar and street food area, festoon lighting, busy and welcoming"],
  ["Entrance", "A striking entrance arch with the event name area left blank"],
  ["Night", "The site at night, lighting design, lasers and haze"],
];
function creativeContext(p) {
  const c = p.creative;
  return [p.title, c.theme && "theme: " + c.theme, c.vibe && "mood: " + c.vibe, p.venue && "at " + p.venue, p.capacity && "about " + p.capacity + " people"].filter(Boolean).join(", ");
}
function creativeBoard(p) {
  const c = p.creative || (p.creative = { theme: "", vibe: "", audience: "", palette: ["#0b1120", "#67d5ed", "#f5b85c", "#ff5d8f"], notes: "", images: [] });
  const field = (k, label, ph) => `<label><span class="muted">${label}</span><input class="field" value="${esc(c[k] || "")}" placeholder="${ph}" onchange="setCreative('${k}',this.value)"></label>`;
  return `<div class="cols">
    <div class="panel"><h2>The idea</h2><div class="form">
      ${field("theme", "Theme / concept", "e.g. Summer surf & sound by the sea")}
      ${field("vibe", "Mood in three words", "e.g. sunny, loud, friendly")}
      ${field("audience", "Who it's for", "e.g. families by day, 18–35 by night")}
      <label><span class="muted">Colour palette</span><div class="palette-row">${c.palette.map((col, n) => `<input type="color" value="${esc(col)}" aria-label="Colour ${n + 1}" onchange="setPalette(${n},this.value)">`).join("")}</div></label>
      <label class="wide"><span class="muted">Notes, ideas, references</span><textarea class="field" rows="4" onchange="setCreative('notes',this.value)" placeholder="Headliners, activities, partners, look and feel…">${esc(c.notes || "")}</textarea></label>
    </div></div>
    <div class="panel ai-panel"><h2>✨ Imagine it</h2><p class="hint">Describe a scene and the AI will picture it. Good for selling the idea to a client or the council, and for planning the look.</p>
      <div class="chips">${VISUAL_IDEAS.map(([l, t]) => `<button class="chip" onclick="$('aiPrompt').value=${esc(JSON.stringify(t + ", " + creativeContext(p) + ", photorealistic event photography"))}">${l}</button>`).join("")}</div>
      <textarea id="aiPrompt" class="field" rows="4" placeholder="e.g. Aerial drone photo of a beach festival at sunset, main stage facing the sea, festoon-lit bar village, 3,000 people">${esc(VISUAL_IDEAS[0][1] + ", " + creativeContext(p) + ", photorealistic event photography")}</textarea>
      <div class="toolbar" style="margin-top:10px"><button class="btn" id="aiGo" onclick="imagineIt()" ${aiBusy ? "disabled" : ""}>${aiBusy ? "Imagining…" : "✨ Generate image"}</button><button class="btn secondary" onclick="addMoodImage()">⬆ Upload an image</button></div>
      <p class="hint">AI images are concept art: an impression of the idea, not a design for building.</p></div>
  </div>
  <div class="panel"><h2>Moodboard</h2>${
    c.images.length
      ? `<div class="mood-grid">${c.images
          .map(
            (im, n) => `<figure><img src="${esc(im.url)}" alt="${esc(im.prompt || "Moodboard image")}" loading="lazy"><figcaption>${im.kind === "ai" ? "✨ " : ""}${esc((im.prompt || im.name || "").slice(0, 90))}</figcaption>
          <div class="toolbar"><button class="btn small secondary" onclick="newPoster('${esc(im.url)}')">Use on a poster</button><a class="btn small ghost" href="${esc(im.url)}" download>Download</a><button class="btn small danger" onclick="removeMood(${n})" aria-label="Remove image">×</button></div></figure>`,
          )
          .join("")}</div>`
      : '<p class="empty">No images yet. Generate one or upload your own references.</p>'
  }</div>`;
}
function setCreative(k, v) {
  currentPlan().creative[k] = v;
  save();
}
function setPalette(n, v) {
  currentPlan().creative.palette[n] = v;
  save();
}
async function imagineIt() {
  const prompt = $("aiPrompt").value.trim();
  if (!prompt) return;
  const p = currentPlan();
  aiBusy = true;
  planRefresh();
  $("aiPrompt").value = prompt;
  try {
    const url = await aiImage(prompt);
    p.creative.images.unshift({ url, prompt, kind: "ai", at: new Date().toISOString() });
    save();
    toast("✨ New image added to the moodboard");
  } catch (e) {
    alert("No image this time. " + e.message);
  }
  aiBusy = false;
  planRefresh();
}
async function addMoodImage() {
  const f = await pickFile("image/png,image/jpeg,image/webp,image/gif", "creative");
  if (!f) return;
  currentPlan().creative.images.unshift({ url: f.url, name: f.name, kind: "upload", at: new Date().toISOString() });
  save();
  planRefresh();
}
function removeMood(n) {
  if (!confirm("Remove this image from the moodboard?")) return;
  currentPlan().creative.images.splice(n, 1);
  save();
  planRefresh();
}

// ---------- Poster studio ----------
const POSTER_FORMATS = { a4: ["Poster (A-size)", 1080, 1528], square: ["Instagram post", 1080, 1080], story: ["Story / reel", 1080, 1920] };
const POSTER_LAYOUTS = { festival: "Festival (big title, line-up)", bold: "Bold (title at top)", minimal: "Minimal (text at bottom)" };
const POSTER_FONTS = ["Bebas Neue", "Anton", "Montserrat", "Playfair Display", "Permanent Marker"];
const ART_IDEAS = [
  ["Sunset beach", "vibrant sunset over the sea, silhouettes of a festival crowd with hands in the air"],
  ["Retro", "retro 1970s surf poster illustration, bold flat colours, sun rays and waves"],
  ["Neon night", "neon lights and lasers over a festival stage at night, haze, electric colours"],
  ["Watercolour", "soft watercolour illustration of a seaside festival with bunting and tents"],
  ["Abstract", "bold abstract shapes and gradients inspired by sound waves"],
];
function loadPosterFonts() {
  if ($("posterFonts")) return;
  const l = document.createElement("link");
  l.id = "posterFonts";
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=Montserrat:wght@500;800&family=Permanent+Marker&family=Playfair+Display:wght@700&display=swap";
  document.head.appendChild(l);
}
function newPoster(bg) {
  const p = currentPlan();
  const pal = p.creative?.palette || [];
  p.posters.push({
    id: uid(),
    title: p.title,
    tagline: p.creative?.theme || "",
    dates: p.eventDate ? fmtDay(p.eventDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).toUpperCase() : "",
    venue: p.venue || "",
    lineup: "",
    footer: "Tickets on sale now",
    layout: "festival",
    format: "a4",
    font: "Bebas Neue",
    text: "#ffffff",
    accent: pal[2] || "#f5b85c",
    bg: bg || p.creative?.images?.[0]?.url || "",
    shade: 0.45,
    logo: true,
  });
  posterIdx = p.posters.length - 1;
  save();
  plannerTab = "posters";
  planRefresh();
}
function posterStudio(p) {
  loadPosterFonts();
  if (!p.posters.length) return `<div class="plan-hero"><div><h2>Poster studio</h2><p>Design posters and social posts for the event. Generate artwork with AI or use your own photos, and the app sets your text on top.</p></div><button class="btn big" onclick="newPoster()">+ New poster</button></div>`;
  posterIdx = Math.min(posterIdx, p.posters.length - 1);
  const x = p.posters[posterIdx];
  setTimeout(drawPoster, 0);
  const input = (k, label, extra = "") => `<label><span class="muted">${label}</span><input class="field" value="${esc(x[k] || "")}" oninput="posterSet('${k}',this.value,true)" onchange="posterSet('${k}',this.value)" ${extra}></label>`;
  const sel = (k, label, opts) => `<label><span class="muted">${label}</span><select class="field" onchange="posterSet('${k}',this.value)">${Object.entries(opts).map(([v, l]) => `<option value="${esc(v)}" ${v === x[k] ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  const images = [...new Set([...(p.creative?.images || []).map((i) => i.url)])];
  return `<div class="toolbar">${p.posters.map((q, n) => `<button class="btn small ${n === posterIdx ? "" : "secondary"}" onclick="posterIdx=${n};planRefresh()">${esc(q.title || "Poster " + (n + 1)).slice(0, 24)}${q.exported ? " ✓" : ""}</button>`).join("")}<button class="btn small ghost" onclick="newPoster()">+ New</button></div>
  <div class="poster-studio">
    <div class="poster-stage"><canvas id="posterCanvas" aria-label="Poster preview"></canvas>
      <div class="toolbar" style="margin-top:10px"><button class="btn" onclick="posterDownload()">⬇ Download PNG</button><button class="btn secondary" onclick="posterSave()">Save to plan</button><button class="btn small ghost" onclick="posterDuplicate()">Duplicate</button><button class="btn small danger" onclick="posterDelete()">Delete</button></div>
      ${x.exported ? `<p class="hint">Saved copy: <a href="${esc(x.exported)}" target="_blank" rel="noopener">open</a></p>` : ""}</div>
    <div>
      <div class="panel ai-panel"><h2>✨ Artwork</h2><div class="chips">${ART_IDEAS.map(([l, t]) => `<button class="chip" onclick="$('artPrompt').value=${esc(JSON.stringify(t))}">${l}</button>`).join("")}</div>
        <textarea id="artPrompt" class="field" rows="3" placeholder="Describe the artwork, e.g. retro surf poster illustration with a big sun over the waves">${esc(x.prompt || "")}</textarea>
        <div class="toolbar" style="margin-top:8px"><button class="btn" onclick="posterArt()" ${aiBusy ? "disabled" : ""}>${aiBusy ? "Creating…" : "✨ Generate artwork"}</button><button class="btn secondary" onclick="posterUpload()">⬆ Upload</button>${x.bg ? `<button class="btn small ghost" onclick="posterSet('bg','')">Plain background</button>` : ""}</div>
        ${images.length ? `<div class="thumbs">${images.map((u) => `<button onclick="posterSet('bg','${esc(u)}')" class="${u === x.bg ? "on" : ""}" aria-label="Use this image"><img src="${esc(u)}" alt=""></button>`).join("")}</div>` : ""}
        <p class="hint">The AI makes the picture only. Your text is added by the app, so it's always spelt right.</p></div>
      <div class="panel"><h2>Words</h2><div class="form">
        ${input("title", "Event name")}${input("tagline", "Tagline")}${input("dates", "Dates")}${input("venue", "Venue")}
        <label class="wide"><span class="muted">Line-up / highlights (one per line)</span><textarea class="field" rows="4" oninput="posterSet('lineup',this.value,true)" onchange="posterSet('lineup',this.value)">${esc(x.lineup || "")}</textarea></label>
        ${input("footer", "Bottom line", 'placeholder="e.g. Tickets: hd-events.co.uk"')}
      </div></div>
      <div class="panel"><h2>Look</h2><div class="form">
        ${sel("format", "Format", Object.fromEntries(Object.entries(POSTER_FORMATS).map(([k, v]) => [k, v[0]])))}${sel("layout", "Layout", POSTER_LAYOUTS)}
        ${sel("font", "Headline font", Object.fromEntries(POSTER_FONTS.map((f) => [f, f])))}
        <label><span class="muted">Text / accent colours</span><div class="palette-row"><input type="color" value="${esc(x.text)}" oninput="posterSet('text',this.value,true)" onchange="posterSet('text',this.value)" aria-label="Text colour"><input type="color" value="${esc(x.accent)}" oninput="posterSet('accent',this.value,true)" onchange="posterSet('accent',this.value)" aria-label="Accent colour"></div></label>
        <label><span class="muted">Darken artwork</span><input type="range" min="0" max="0.85" step="0.05" value="${x.shade}" oninput="posterSet('shade',+this.value,true)" onchange="posterSet('shade',+this.value)"></label>
        <label><span class="muted">Logo</span><select class="field" onchange="posterSet('logo',this.value==='1')"><option value="1" ${x.logo ? "selected" : ""}>Show company logo</option><option value="0" ${x.logo ? "" : "selected"}>No logo</option></select></label>
      </div></div>
    </div></div>`;
}
function posterSet(k, v, live) {
  const p = currentPlan(),
    x = p.posters[posterIdx];
  x[k] = v;
  if (x.exported) delete x.exported; // the saved copy no longer matches
  if (live) return drawPoster();
  save();
  ["format", "layout", "font", "logo", "bg"].includes(k) ? planRefresh() : drawPoster();
}
async function posterArt() {
  const prompt = $("artPrompt").value.trim();
  if (!prompt) return alert("Describe the artwork first, or pick an idea.");
  const p = currentPlan(),
    x = p.posters[posterIdx];
  aiBusy = true;
  planRefresh();
  try {
    const url = await aiImage(prompt + ". Poster background artwork, strong composition with space for a title, no text, no letters, no words, no logos.");
    x.prompt = prompt;
    x.bg = url;
    delete x.exported;
    p.creative.images.unshift({ url, prompt, kind: "ai", at: new Date().toISOString() });
    save();
    toast("✨ Artwork ready");
  } catch (e) {
    alert("No artwork this time. " + e.message);
  }
  aiBusy = false;
  planRefresh();
}
async function posterUpload() {
  const f = await pickFile("image/png,image/jpeg,image/webp", "creative");
  if (f) posterSet("bg", f.url);
}
function posterDuplicate() {
  const p = currentPlan();
  const copy = { ...p.posters[posterIdx], id: uid() };
  delete copy.exported;
  p.posters.push(copy);
  posterIdx = p.posters.length - 1;
  save();
  planRefresh();
}
function posterDelete() {
  const p = currentPlan();
  if (!confirm("Delete this poster design?")) return;
  p.posters.splice(posterIdx, 1);
  posterIdx = 0;
  save();
  planRefresh();
}

// Drawing. Images come from this site's own /files storage, so the canvas can be exported.
const imgCache = new Map();
function loadImg(url) {
  if (!url) return Promise.resolve(null);
  if (!imgCache.has(url))
    imgCache.set(
      url,
      new Promise((res) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => res(null);
        im.src = url;
      }),
    );
  return imgCache.get(url);
}
function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean),
    lines = [];
  let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
// Largest font size (down to `min`) at which `text` fits in `lines` lines of `maxW`.
function fit(ctx, text, font, size, min, maxW, lines) {
  for (; size > min; size -= 4) {
    ctx.font = font(size);
    if (wrap(ctx, text, maxW).length <= lines) return size;
  }
  return min;
}
async function drawPoster() {
  const cv = $("posterCanvas"),
    p = currentPlan(),
    x = p?.posters[posterIdx];
  if (!cv || !x) return;
  const [, W, H] = POSTER_FORMATS[x.format] || POSTER_FORMATS.a4;
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  await document.fonts.load(`80px "${x.font}"`).catch(() => {});
  await document.fonts.load('600 30px "Montserrat"').catch(() => {});
  const [bg, logo] = await Promise.all([loadImg(x.bg), x.logo ? loadImg(db.branding?.logo) : null]);
  // Background: artwork cropped to fill, or a gradient from the plan palette.
  const pal = p.creative?.palette || ["#0b1120", "#67d5ed"];
  if (bg) {
    const s = Math.max(W / bg.width, H / bg.height);
    ctx.drawImage(bg, (W - bg.width * s) / 2, (H - bg.height * s) / 2, bg.width * s, bg.height * s);
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, pal[0]);
    g.addColorStop(1, pal[1] || pal[0]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  const a = Number(x.shade) || 0;
  shade.addColorStop(0, `rgba(0,0,0,${x.layout === "minimal" ? a * 0.3 : a})`);
  shade.addColorStop(0.5, `rgba(0,0,0,${a * 0.5})`);
  shade.addColorStop(1, `rgba(0,0,0,${Math.min(0.95, a * 1.4)})`);
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  const M = 80,
    maxW = W - 2 * M,
    head = (s) => `${x.font === "Montserrat" ? "800 " : ""}${s}px "${x.font}", Impact, "Arial Black", sans-serif`,
    body = (s, w = 600) => `${w} ${s}px Montserrat, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0,0,0,.45)";
  ctx.shadowBlur = 18;
  const lineup = String(x.lineup || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const titleSize = fit(ctx, x.title || "", head, x.layout === "minimal" ? 150 : 230, 70, maxW, 2);
  ctx.font = head(titleSize);
  const titleLines = wrap(ctx, (x.title || "").toUpperCase(), maxW);

  // Block heights, so each layout can place the text.
  const tagH = x.tagline ? 60 : 0;
  const titleH = titleLines.length * titleSize * 0.95;
  const lineupSize = lineup.length > 6 ? 44 : 56;
  const lineupH = lineup.length * lineupSize * 1.25;
  const infoH = (x.dates ? 62 : 0) + (x.venue ? 52 : 0);
  let y;
  if (x.layout === "bold") y = M + titleSize * 0.85;
  else if (x.layout === "minimal") y = H - M - 70 - infoH - lineupH - tagH - titleH + titleSize * 0.85;
  else y = Math.max(M + titleSize * 0.85, H * 0.36 - titleH / 2);

  ctx.fillStyle = x.text;
  ctx.font = head(titleSize);
  for (const l of titleLines) {
    ctx.fillText(l, W / 2, y);
    y += titleSize * 0.95;
  }
  if (x.tagline) {
    ctx.font = body(40, 500);
    ctx.fillStyle = x.accent;
    ctx.fillText(x.tagline, W / 2, y + 10, maxW);
    y += tagH + 20;
  }
  if (lineup.length) {
    if (x.layout === "bold") y = Math.max(y + 30, H * 0.5);
    ctx.fillStyle = x.text;
    lineup.forEach((l, n) => {
      ctx.font = body(n === 0 ? lineupSize + 14 : lineupSize, 800);
      ctx.fillText(l.toUpperCase(), W / 2, y + lineupSize, maxW);
      y += lineupSize * 1.25 + (n === 0 ? 10 : 0);
    });
  }
  // Dates, venue and the bottom line sit at the foot of the poster.
  let fy = H - M - (x.footer ? 70 : 10);
  if (x.venue) {
    ctx.font = body(40, 500);
    ctx.fillStyle = x.text;
    ctx.fillText(x.venue.toUpperCase(), W / 2, fy, maxW);
    fy -= 56;
  }
  if (x.dates) {
    ctx.font = body(50, 800);
    ctx.fillStyle = x.accent;
    ctx.fillText(x.dates, W / 2, fy, maxW);
  }
  if (x.footer) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = x.accent;
    ctx.fillRect(0, H - 90, W, 90);
    ctx.fillStyle = "#0b1120";
    ctx.font = body(36, 800);
    ctx.fillText(x.footer.toUpperCase(), W / 2, H - 32, maxW);
  }
  if (logo) {
    ctx.shadowBlur = 0;
    const lw = 220,
      lh = (logo.height / logo.width) * lw;
    ctx.drawImage(logo, W - M - lw, x.layout === "bold" ? H - (x.footer ? 110 : 30) - lh - 140 : 40, lw, Math.min(lh, 140));
  }
}
function posterFileName(x) {
  return (x.title || "poster").replace(/[^\w]+/g, "_") + "_" + x.format + ".png";
}
async function posterDownload() {
  await drawPoster();
  const a = document.createElement("a");
  a.href = $("posterCanvas").toDataURL("image/png");
  a.download = posterFileName(currentPlan().posters[posterIdx]);
  a.click();
}
async function posterSave() {
  await drawPoster();
  const p = currentPlan(),
    x = p.posters[posterIdx];
  const blob = await new Promise((r) => $("posterCanvas").toBlob(r, "image/png"));
  try {
    x.exported = await uploadImage(new File([blob], posterFileName(x), { type: "image/png" }), "creative");
    save();
    toast("🖼️ Poster saved to the plan");
    planRefresh();
  } catch (e) {
    alert("Not saved. " + e.message);
  }
}
