// Event planner templates. Each item's `due` is days relative to the event date (negative = before).
// `doc` marks items that produce a safety document needing approval: ra = risk assessment,
// fra = fire risk assessment, ms = method statement, hs = health & safety / event safety plan.
// `link` points an item at another part of the app.
// The Aberravon Beach Fest template will be added from the real event documents.
const PLAN_STAGES = [
  ["concept", "Concept & creative", "🎨"],
  ["venue", "Venue, licensing & permissions", "📍"],
  ["insurance", "Insurance", "🛡️"],
  ["risk", "Risk assessment", "⚠️"],
  ["safety", "Health & safety plan", "⛑️"],
  ["method", "Method statements & site plan", "📐"],
  ["crew", "Staffing & crew", "👷"],
  ["kit", "Equipment booking", "🔊"],
  ["suppliers", "Suppliers & subcontractors", "🤝"],
  ["schedule", "Build, show day & derig", "🗓️"],
  ["post", "Post-event review & invoicing", "✅"],
];

const PLAN_TEMPLATES = {
  general: {
    name: "General event",
    description: "A full checklist for an indoor or outdoor event. Remove what you don't need.",
    items: {
      concept: [
        ["Event brief agreed with client", -120],
        ["Theme, concept and look decided", -100, { link: "creative" }],
        ["Audience and expected capacity", -100],
        ["Budget outline", -90],
        ["Moodboard and visuals", -90, { link: "creative" }],
        ["Poster and marketing artwork", -60, { link: "posters" }],
      ],
      venue: [
        ["Venue or landowner agreement signed", -120],
        ["Premises licence or Temporary Event Notice (TEN)", -90, { notes: "A standard TEN must be given at least 10 working days before; check the local authority's own deadlines and capacity limits." }],
        ["Local authority / Safety Advisory Group notified", -90],
        ["Road closures and traffic management", -60],
        ["Noise management and neighbour notices", -45],
      ],
      insurance: [
        ["Public liability certificate", -60],
        ["Employer's liability certificate", -60],
        ["Equipment insurance", -60],
        ["Supplier and subcontractor insurance certificates collected", -30],
      ],
      risk: [
        ["Event risk assessment", -45, { doc: "ra" }],
        ["Fire risk assessment", -45, { doc: "fra" }],
        ["Adverse weather and wind plan", -30],
        ["Crowd management plan", -30],
      ],
      safety: [
        ["Event safety management plan", -45, { doc: "hs" }],
        ["First aid and medical provision booked", -45],
        ["Emergency and evacuation procedures", -30],
        ["Welfare: toilets, drinking water, accessibility", -30],
      ],
      method: [
        ["Site plan drawn", -45, { link: "site" }],
        ["Staging and structures method statement", -30, { doc: "ms" }],
        ["Power distribution and generators method statement", -30, { doc: "ms" }],
        ["Rigging calculations and structural sign-off", -21],
      ],
      crew: [
        ["Crew list and roles", -30],
        ["Crew booked and confirmed", -30],
        ["Stewards and SIA security booked", -30],
        ["Crew briefing pack sent", -7],
      ],
      kit: [
        ["Kit list added to the job", -30, { link: "job" }],
        ["Kit reserved (job moved to Booked)", -21, { link: "job" }],
        ["Cross-hire orders placed", -14, { link: "crosshire" }],
      ],
      suppliers: [
        ["Bars and catering traders", -45],
        ["Toilet and welfare hire", -45],
        ["Fencing and barriers", -30],
        ["Generators and fuel", -30],
        ["Waste management", -30],
      ],
      schedule: [
        ["Production schedule", -14],
        ["Build day timings", -7],
        ["Show running order", -7],
        ["Derig and site clear", 1],
      ],
      post: [
        ["Debrief and lessons learned", 7],
        ["Client invoice sent", 7, { link: "job" }],
        ["Supplier invoices checked", 30],
        ["Template updated with lessons learned", 14],
      ],
    },
  },
};

// Build a fresh plan from a template, with due dates counted from the event date.
function planFromTemplate(templateKey, eventDate) {
  const t = PLAN_TEMPLATES[templateKey] || PLAN_TEMPLATES.general;
  let n = 0;
  return PLAN_STAGES.map(([key, name, icon]) => ({
    key,
    name,
    icon,
    items: (t.items[key] || []).map(([title, offset, extra = {}]) => ({
      id: Date.now() * 100 + n++,
      title,
      status: "todo",
      owner: "",
      due: eventDate ? addDays(eventDate, offset) : "",
      notes: extra.notes || "",
      files: [],
      ...(extra.link ? { link: extra.link } : {}),
      ...(extra.doc ? { doc: { kind: extra.doc, content: "", status: "draft" } } : {}),
    })),
  }));
}
