// Event planner templates.
// The checklist builds itself from the event profile: items with `when` only appear if that
// condition is true for this event. Each item carries `why`: the reason and the UK law or
// guidance behind it. This is a planning aid, not legal advice: a competent person must review
// and sign off safety documents, and organisers should check the current Purple Guide
// (Events Industry Forum), HSE guidance and their local authority / Safety Advisory Group.
//
// Item format: [title, daysBeforeEvent (negative = before), { why, when, doc, cert, link, notes }]
//   doc  = produces a safety document needing approval (see DOC_KINDS in stock.js)
//   cert = a certificate or evidence that must be collected and filed
//   when = (profile) => boolean

const PLAN_STAGES = [
  ["concept", "Concept & creative", "🎨"],
  ["venue", "Venue, licensing & permissions", "📍"],
  ["insurance", "Insurance", "🛡️"],
  ["risk", "Risk assessments", "⚠️"],
  ["safety", "Safety, medical & welfare", "⛑️"],
  ["method", "Site, structures & method statements", "📐"],
  ["power", "Power & technical safety", "⚡"],
  ["bars", "Bars & food", "🍺"],
  ["crew", "Staffing, crew & security", "👷"],
  ["kit", "Equipment booking", "🔊"],
  ["suppliers", "Suppliers & contractors", "🤝"],
  ["schedule", "Build, show day & derig", "🗓️"],
  ["post", "Post-event review & invoicing", "✅"],
];

// Questions asked when an event is created. Keys are stored on plan.profile.
const PLAN_PROFILE = [
  ["outdoor", "Outdoors (or partly outdoors)", "🌤️"],
  ["alcohol", "Alcohol sold or supplied", "🍺"],
  ["food", "Food traders or catering", "🍔"],
  ["liveMusic", "Live or amplified music", "🎵"],
  ["structures", "Staging, marquees or temporary structures", "🏗️"],
  ["generators", "Generators / temporary power", "⚡"],
  ["rigging", "Flown or rigged equipment (speakers, lights, truss)", "⛓️"],
  ["children", "Children or families attending", "👨‍👩‍👧"],
  ["camping", "Overnight camping", "⛺"],
  ["traffic", "Road closures or public highway use", "🚧"],
  ["sfx", "Fireworks, pyro, lasers, haze or special effects", "🎆"],
  ["drones", "Drone filming", "🚁"],
];

const big = (p) => (Number(p.capacity) || 0) >= 500;
const veryBig = (p) => (Number(p.capacity) || 0) >= 1000;
const any = (...keys) => (p) => keys.some((k) => p[k]);

const PLAN_TEMPLATES = {
  general: {
    name: "Full event plan (builds from your answers)",
    description: "Every area of putting on an event, filtered to what this event needs.",
    items: {
      concept: [
        ["Event brief agreed with client", -120, { why: "Sets the scope everything else is planned and costed against: purpose, audience, dates, budget and who signs off." }],
        ["Theme, concept and look decided", -100, { link: "creative" }],
        ["Audience profile and expected capacity confirmed", -100, { why: "Capacity drives licensing, toilets, medical cover, stewarding, security and exits. The Purple Guide bases most provision on audience size and profile." }],
        ["Budget and income plan", -90],
        ["Outline running order and event hours", -90, { why: "Licensable hours, noise curfews, staffing shifts and transport all depend on the timings." }],
        ["Moodboard and visuals", -90, { link: "creative" }],
        ["Poster and marketing artwork", -60, { link: "posters" }],
        ["Ticketing and capacity controls set up", -60, { why: "Ticket sales must not exceed the safe capacity in the licence and fire risk assessment." }],
      ],
      venue: [
        ["Venue or landowner agreement signed", -120, { cert: true, why: "Written permission and agreed responsibilities for the site, access, reinstatement and damage." }],
        ["Premises licence or Temporary Event Notice (TEN)", -90, { when: any("alcohol", "liveMusic"), cert: true, why: "Licensing Act 2003: selling alcohol, regulated entertainment and late-night refreshment need a premises licence or a TEN. A TEN covers up to 499 people at once (including staff) and must be given at least 10 working days before (5 for a late TEN). Larger events need a premises or time-limited licence, which takes longer." }],
        ["Safety Advisory Group (SAG) notified", -90, { when: (p) => big(p) || p.outdoor || p.traffic || p.sfx, why: "Most local authorities run a Safety Advisory Group that reviews larger or higher-risk public events. Expect to submit your event safety plan, site plan and risk assessments, often 8 to 12 weeks ahead. Check your council's thresholds." }],
        ["Road closure / Traffic Regulation Order application", -84, { when: any("traffic"), cert: true, why: "Closing or using the public highway needs the highway authority's order (Town Police Clauses Act 1847 or Road Traffic Regulation Act 1984 s16A). Typically 8 to 12 weeks' notice." }],
        ["Music licence (PRS for Music / PPL)", -45, { when: any("liveMusic"), cert: true, why: "Playing recorded or live music in public generally needs TheMusicLicence from PPL PRS, unless the venue already holds it." }],
        ["Noise management plan agreed", -45, { when: (p) => p.liveMusic && p.outdoor, doc: "noise", why: "Environmental Protection Act 1990 (statutory nuisance). Councils usually set off-site noise limits and curfews; the plan sets limits, monitoring positions and who can turn it down." }],
        ["Street trading consent for traders on public land", -45, { when: (p) => p.food && p.outdoor, cert: true, why: "Local Government (Miscellaneous Provisions) Act 1982: trading on streets or public land usually needs the council's consent." }],
        ["Fireworks / pyrotechnics permissions", -45, { when: any("sfx"), cert: true, why: "Landowner and council agreement, fire service notification, and a licensed or competent display operator. Fireworks Regulations 2004; Explosives Regulations 2014 for storage." }],
        ["Drone flight permissions and operator ID", -30, { when: any("drones"), cert: true, why: "CAA rules: operator ID and flyer ID; crowds and congested areas need the right category of approval. Check site restrictions." }],
        ["Camping area approval", -60, { when: any("camping"), why: "Camping needs its own layout, fire separation between tents, lighting, welfare and security. Include it in the SAG submission." }],
      ],
      insurance: [
        ["Public liability insurance (typically £5m to £10m)", -60, { cert: true, why: "Covers injury to the public or damage to property. Many venues and councils require £5m or £10m and to be named on the policy." }],
        ["Employer's liability insurance", -60, { cert: true, why: "Employers' Liability (Compulsory Insurance) Act 1969: legally required if you employ staff or crew, minimum £5m." }],
        ["Equipment and hired-in kit insurance", -60, { cert: true }],
        ["Event cancellation / adverse weather cover considered", -60, { when: any("outdoor") }],
        ["Supplier and trader insurance certificates collected", -30, { cert: true, link: "suppliers", why: "Every contractor and trader should provide current public liability cover. Track expiry dates in the Suppliers tab." }],
      ],
      risk: [
        ["Event risk assessment", -45, { doc: "ra", why: "Management of Health and Safety at Work Regulations 1999 (reg 3): a suitable and sufficient risk assessment is a legal requirement, and the core of any SAG submission." }],
        ["Fire risk assessment", -45, { doc: "fra", why: "Regulatory Reform (Fire Safety) Order 2005: the responsible person must carry out a fire risk assessment, covering exits, detection, fire points, fuel and ignition sources." }],
        ["Crowd management plan and risk assessment", -40, { when: big, doc: "crowd", why: "Larger audiences need planned capacity, density, ingress/egress, queueing and crowd monitoring. The Purple Guide and the Green Guide principles apply." }],
        ["Adverse weather and wind management plan", -30, { when: any("outdoor"), why: "Sets wind speed limits for structures and screens, lightning, heat and flooding actions, and who decides to stop the show." }],
        ["Noise at work assessment for staff", -30, { when: any("liveMusic"), why: "Control of Noise at Work Regulations 2005: action values of 80 and 85 dB(A). Provide hearing protection and limit exposure for crew and bar staff." }],
        ["COSHH assessment (fuel, haze fluid, cleaning chemicals)", -30, { when: any("generators", "sfx"), why: "Control of Substances Hazardous to Health Regulations 2002." }],
        ["Working at height risk assessment", -30, { when: any("structures", "rigging"), why: "Work at Height Regulations 2005: plan, use competent people and the right access equipment (MEWPs, towers, ladders)." }],
        ["Special effects, laser and pyrotechnics risk assessment", -30, { when: any("sfx"), doc: "ra", why: "Lasers to BS EN 60825 with a laser safety officer; pyro by a competent operator; haze agreed with the venue because it can trigger smoke detection." }],
        ["Safeguarding and lost children procedure", -30, { when: any("children"), why: "Designated safeguarding lead, a lost-child point, reunion procedure and DBS-checked staff where they work with children." }],
      ],
      safety: [
        ["Event safety management plan", -45, { doc: "hs", why: "Brings everything together: roles, site, crowd, medical, fire, emergencies, welfare and communications. Usually the main document the SAG reviews." }],
        ["Emergency and evacuation plan", -40, { doc: "evac", why: "Required under the Fire Safety Order and expected by the SAG: alarm, evacuation routes, assembly points, show-stop procedure, emergency service access and liaison." }],
        ["Medical and first aid needs assessment", -45, { doc: "medical", why: "Health and Safety (First-Aid) Regulations 1981 for staff; for the public, a documented medical needs assessment based on size, profile, alcohol and activities (the Purple Guide's medical chapter sets the approach)." }],
        ["Medical / first aid provider booked", -40, { cert: true, why: "Use a competent provider; if they give treatment beyond first aid they should be CQC registered. Collect their insurance and plan." }],
        ["Welfare: toilets, drinking water and handwashing", -30, { why: "Provision should match capacity, duration and alcohol. Free drinking water must be available where alcohol is sold (mandatory licensing condition)." }],
        ["Accessibility plan (access, viewing, toilets, information)", -30, { why: "Equality Act 2010: make reasonable adjustments for disabled visitors and staff." }],
        ["Command, control and communications plan (radio channels, call signs)", -21, { when: (p) => big(p) || p.outdoor, why: "Clear decision-making in an incident: who is in charge, radio channels, escalation and a written incident log." }],
        ["Incident and accident log ready", -7, { why: "Record every incident. Some must be reported under RIDDOR 2013 (see post-event)." }],
        ["Lost property and lost persons procedure", -14, { when: big }],
      ],
      method: [
        ["Site plan drawn", -45, { link: "site", why: "Shows stages, bars, traders, toilets, first aid, fire points, exits, assembly points, emergency vehicle routes and barriers." }],
        ["Ingress, egress and queueing plan", -30, { when: big }],
        ["Temporary structures: design, calculations and certificates", -30, { when: any("structures"), cert: true, why: "Stages, marquees, towers and screens need design information, wind loading limits and installation by a competent contractor (IStructE guidance for temporary demountable structures)." }],
        ["Structure inspection and sign-off before public entry", -1, { when: any("structures"), cert: true, why: "A competent person inspects and signs off each structure after build and before the public are admitted." }],
        ["CDM 2015 arrangements for build and derig", -30, { when: any("structures", "rigging"), why: "Construction (Design and Management) Regulations 2015 apply to building and breaking temporary event structures: client duties, a plan for the build/break and competent contractors." }],
        ["Staging and structures method statement", -30, { when: any("structures"), doc: "ms" }],
        ["Rigging plan and method statement", -30, { when: any("rigging"), doc: "ms" }],
        ["Vehicle movement and traffic management plan", -30, { when: any("outdoor", "traffic"), doc: "traffic", why: "Separate vehicles and pedestrians, banksmen for reversing, site speed limits, emergency vehicle routes. Road works signing follows Chapter 8." }],
        ["Build and derig method statement", -21, { doc: "ms" }],
      ],
      power: [
        ["Power plan and distribution layout", -30, { why: "BS 7909 is the code of practice for temporary power at events: a designed system, protective devices, earthing and a competent person in charge." }],
        ["Vendor and trader power requirements collected", -30, { link: "suppliers", why: "Every trader and supplier states what they will plug in (watts or amps, single or three phase) so supply and generators can be sized. Use the Suppliers tab calculator." }],
        ["Generator sizing, fuel plan and refuelling procedure", -21, { when: any("generators"), why: "Size for total load with headroom, plan fuel quantities and safe refuelling (COSHH, spill kits, no refuelling while hot or in public areas)." }],
        ["Temporary electrical installation inspected and certified (BS 7909)", -1, { cert: true, why: "A competent electrician inspects, tests and certifies the temporary installation before use. Keep the certificate on site." }],
        ["PAT / in-service inspection and testing certificates for all equipment", -14, { cert: true, why: "Electricity at Work Regulations 1989: electrical equipment must be maintained safe. Collect current in-service test records (IET Code of Practice) for your kit and every trader's." }],
        ["RCD protection on all final circuits", -1, { why: "BS 7909 requires RCD protection for circuits accessible to the public and outdoor sockets." }],
        ["Cable routes, ramps and trip protection", -7, { why: "Keep cables out of walkways or protect them with ramps; no cables across emergency routes." }],
        ["AV safety: rigging, safety bonds and LOLER certificates", -14, { when: any("rigging"), cert: true, why: "Lifting Operations and Lifting Equipment Regulations 1998: chain hoists, truss and flying hardware need thorough examination certificates. Secondary safety bonds on every flown item." }],
        ["Sound level limits and monitoring agreed", -14, { when: any("liveMusic"), why: "Protect the audience and staff (Noise at Work Regulations) and meet off-site limits in the noise plan." }],
        ["Haze, smoke and detector isolation agreed with venue", -7, { when: any("sfx"), why: "Haze can trigger fire detection. Any isolation must be agreed in writing with the venue and covered by a fire watch." }],
      ],
      bars: [
        ["Designated Premises Supervisor or personal licence holder named", -30, { when: any("alcohol"), cert: true, why: "Licensing Act 2003: alcohol sales must be authorised by a personal licence holder; premises licences need a DPS." }],
        ["Bar risk assessment and bar management plan", -30, { when: any("alcohol"), doc: "bar", why: "Covers staffing, refusals, drunkenness, glassware, cash, cellar and gas cylinders, queues and closing." }],
        ["Age verification policy (Challenge 21/25)", -21, { when: any("alcohol"), why: "Mandatory licensing condition: an age verification policy must be in place and staff trained on it." }],
        ["Free drinking water available at bars", -7, { when: any("alcohol"), why: "Mandatory licensing condition for premises selling alcohol." }],
        ["Polycarbonate or plastic drinkware in crowded and outdoor areas", -14, { when: (p) => p.alcohol && (big(p) || p.outdoor) }],
        ["Drink spiking and welfare procedure (e.g. Ask for Angela)", -14, { when: any("alcohol") }],
        ["Gas cylinders (CO2, LPG) secured, ventilated and signed", -7, { when: any("alcohol", "food"), why: "Cylinders must be secured upright, in ventilated areas and away from heat and public access." }],
        ["Food traders: food business registration and hygiene rating", -30, { when: any("food"), cert: true, link: "suppliers", why: "Every food business must be registered with its local authority. Collect each trader's registration and Food Hygiene Rating." }],
        ["Food traders: food hygiene training certificates", -30, { when: any("food"), cert: true }],
        ["Food traders: allergen information arrangements", -21, { when: any("food"), why: "Food Information Regulations 2014 and Natasha's Law: allergen information must be available; full ingredient labels on prepacked-for-direct-sale food." }],
        ["Food traders: LPG gas safety certificates (Gas Safe engineer)", -30, { when: any("food"), cert: true, link: "suppliers", why: "LPG appliances in catering units should have a current gas safety check by a Gas Safe registered engineer, with fire extinguisher and fire blanket in every unit." }],
        ["Food traders: risk assessments and public liability insurance", -30, { when: any("food"), cert: true, link: "suppliers" }],
        ["Waste, grey water and grease disposal arranged", -21, { when: any("food", "camping") }],
      ],
      crew: [
        ["Crew list, roles and contact sheet", -30],
        ["Crew booked and confirmed", -30],
        ["Competence evidence collected (IPAF, PASMA, rigging, electrical)", -21, { when: any("structures", "rigging", "generators"), cert: true, why: "Operators of MEWPs, towers, rigging and electrical work must be trained and competent; keep copies of cards and certificates." }],
        ["Stewards booked (ratio set by risk assessment)", -30, { when: big }],
        ["SIA licensed security booked", -30, { when: (p) => p.alcohol || veryBig(p), cert: true, why: "Private Security Industry Act 2001: door supervisors and security staff must hold an SIA licence. Licence conditions often specify numbers." }],
        ["Accreditation and wristband / pass system", -21, { when: big }],
        ["Staff welfare, breaks and working hours plan", -14, { why: "Working Time Regulations 1998 and late finishes: plan rest breaks, food, water and safe travel home." }],
        ["Safety briefing pack and crew briefing scheduled", -7, { why: "Everyone on site knows the emergency plan, their role, radio channels and how to report incidents." }],
      ],
      kit: [
        ["Kit list added to the job", -30, { link: "job" }],
        ["Kit reserved (job moved to Booked)", -21, { link: "job" }],
        ["Cross-hire orders placed", -14, { link: "crosshire" }],
        ["Equipment test records up to date (PAT / in-service)", -14, { cert: true }],
      ],
      suppliers: [
        ["Supplier compliance packs collected (insurance, RA, MS, certificates)", -30, { link: "suppliers", cert: true, why: "Each contractor provides insurance, a risk assessment and method statement for their work, plus any trade certificates. Check them before they arrive on site." }],
        ["Bars and catering traders confirmed", -45, { when: any("alcohol", "food") }],
        ["Toilet and welfare hire", -45, { when: any("outdoor") }],
        ["Fencing and barriers", -30, { when: any("outdoor") }],
        ["Generators and fuel", -30, { when: any("generators") }],
        ["Waste management and cleaning", -30, { when: any("outdoor") }],
      ],
      schedule: [
        ["Production schedule", -14],
        ["Build day timings and site induction", -7],
        ["Show running order with cue points", -7],
        ["Pre-opening safety walk round and sign-off", 0, { why: "Before doors: exits clear, fire points in place, structures signed off, power certified, medical and security in position. Record who signed off and when." }],
        ["Derig, site clear and reinstatement", 1],
      ],
      post: [
        ["RIDDOR reports made (if any reportable incidents)", 3, { why: "Reporting of Injuries, Diseases and Dangerous Occurrences Regulations 2013: certain injuries and dangerous occurrences must be reported to HSE, most within 10 days." }],
        ["Debrief and lessons learned", 7],
        ["Client invoice sent", 7, { link: "job" }],
        ["Supplier invoices checked", 30],
        ["Template updated with lessons learned", 14],
      ],
    },
  },
};

// Build a plan's checklist from the template, filtered by the event profile.
function planFromTemplate(templateKey, eventDate, profile = {}) {
  const t = PLAN_TEMPLATES[templateKey] || PLAN_TEMPLATES.general;
  let n = 0;
  return PLAN_STAGES.map(([key, name, icon]) => ({
    key,
    name,
    icon,
    items: (t.items[key] || [])
      .filter(([, , extra = {}]) => !extra.when || extra.when(profile))
      .map(([title, offset, extra = {}]) => ({
        id: Date.now() * 100 + n++,
        title,
        status: "todo",
        owner: "",
        due: eventDate ? addDays(eventDate, offset) : "",
        notes: extra.notes || "",
        files: [],
        ...(extra.why ? { why: extra.why } : {}),
        ...(extra.cert ? { cert: true } : {}),
        ...(extra.link ? { link: extra.link } : {}),
        ...(extra.doc ? { doc: { kind: extra.doc, content: "", status: "draft" } } : {}),
      })),
  })).filter((s) => s.items.length);
}
