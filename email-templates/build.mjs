// Builds the two outreach emails. Edit the SETTINGS and CARDS below, then run: node build.mjs
import { writeFileSync } from 'node:fs';

const S = {
  site: 'https://www.hd-events.co.uk',
  logo: 'https://www.hd-events.co.uk/logo.png',        // CHECK: must be a public image URL
  phoneDisplay: '07XXX XXX XXX',                         // CHANGE
  phoneTel: '+447XXXXXXXXX',                             // CHANGE (no spaces)
  whatsapp: '447XXXXXXXXX',                              // CHANGE (country code, no + or spaces)
  email: 'hello@hd-events.co.uk',                        // CHANGE if different
  sender: 'Huw Jenkins',
  role: 'Director, HD Events',
};

// One card per service. Swap titles, text and links for the real pages on the site.
const CARDS = [
  { tag: 'Sound', title: 'Sound & PA hire', text: 'Speakers, mics and mixing for talks, awards and parties, set up and run by our crew.', url: '/hire/sound' },
  { tag: 'Lighting', title: 'Lighting & staging', text: 'Stage decks, uplighting and effects that turn a plain room into an event space.', url: '/hire/lighting' },
  { tag: 'Production', title: 'Full event production', text: 'One team for kit, crew, delivery and on-the-day running. You get one quote and one contact.', url: '/services' },
  { tag: 'Our work', title: 'Events we run', text: 'See the events and festivals we produce ourselves, from small launches to large outdoor shows.', url: '/events' },
];

const AUDIENCES = {
  planners: {
    file: 'email-planners.html',
    subject: 'Event kit and crew in London, one supplier',
    preheader: 'Sound, lighting, staging and crew for your next London event.',
    hello: 'Hi {{first_name}},',
    body: [
      'I run HD Events. We supply sound, lighting, staging and crew for corporate events, launches and parties across London.',
      'If you need a reliable production supplier you can hand a brief to and not worry about, we can help. You get one quote, one contact, and a crew that turns up on time and leaves the room as they found it.',
    ],
    ask: 'If you have something coming up, send me the date and venue and I will come back with a price the same day.',
  },
  venues: {
    file: 'email-venues.html',
    subject: 'A production partner for your event spaces',
    preheader: 'Sound, lighting and staging your clients can book through you.',
    hello: 'Hi {{first_name}},',
    body: [
      'I run HD Events. We supply sound, lighting, staging and crew for corporate events across London.',
      'When your clients ask for AV or a stage, we can be the supplier you recommend. We work to your venue rules and load-in times, and we can offer your clients a set package price.',
    ],
    ask: 'Would a 10 minute call or a quick site visit suit you? Reply with a time that works and I will fit around you.',
  },
};

const C = { bg: '#050609', card: '#12131d', line: '#26283a', text: '#f2f2f0', text2: '#c4c4cf', muted: '#9c9cab', cyan: '#00eeed', purple: '#9145ff', ink: '#050609', wa: '#25D366' };
const F = "'DM Sans',Arial,Helvetica,sans-serif";
const utm = (u, a) => { const full = u.startsWith('http') ? u : S.site + u; return full + (full.includes('?') ? '&' : '?') + `utm_source=email&utm_medium=outreach&utm_campaign=${a}`; };

const card = (c, a) => `
<td class="col" width="50%" valign="top" style="padding:6px;">
  <a href="${utm(c.url, a)}" target="_blank" style="text-decoration:none;display:block;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.line};border-radius:14px;border-collapse:separate;">
    <tr><td height="4" bgcolor="${C.cyan}" style="height:4px;line-height:4px;font-size:0;background:${C.cyan};background-image:linear-gradient(90deg,${C.cyan},${C.purple});border-radius:14px 14px 0 0;">&nbsp;</td></tr>
    <tr><td style="padding:18px 18px 20px;font-family:${F};">
      <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${C.cyan};font-weight:700;">${c.tag}</div>
      <div style="font-size:17px;line-height:1.3;color:${C.text};font-weight:700;margin:6px 0 8px;">${c.title}</div>
      <div style="font-size:14px;line-height:1.5;color:${C.text2};">${c.text}</div>
      <div style="font-size:14px;color:${C.cyan};font-weight:700;margin-top:12px;">View page &rarr;</div>
    </td></tr>
  </table></a>
</td>`;

const rows = (a) => { let h = ''; for (let i = 0; i < CARDS.length; i += 2) h += `<tr>${card(CARDS[i], a)}${CARDS[i + 1] ? card(CARDS[i + 1], a) : '<td class="col" width="50%"></td>'}</tr>`; return h; };

const btn = (href, label, bg, fg, border) => `
<td class="btn" style="padding:5px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
  <td align="center" bgcolor="${bg}" style="background:${bg};border-radius:999px;${border ? `border:1px solid ${border};` : ''}">
    <a href="${href}" target="_blank" style="display:block;padding:13px 18px;font-family:${F};font-size:15px;font-weight:700;color:${fg};text-decoration:none;white-space:nowrap;">${label}</a>
  </td></tr></table>
</td>`;

const page = (key, A) => `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>${A.subject}</title>
<style>
  body{margin:0;padding:0;background:${C.bg};}
  a{color:${C.cyan};}
  @media (max-width:600px){
    .col,.btn{display:block!important;width:100%!important;box-sizing:border-box;}
    .pad{padding-left:20px!important;padding-right:20px!important;}
    .h1{font-size:24px!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.bg};" bgcolor="${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${A.preheader}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg};">
<tr><td align="center" style="padding:24px 10px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

  <!-- Header -->
  <tr><td class="pad" style="padding:8px 26px 22px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="middle"><a href="${utm('/', key)}" target="_blank" style="text-decoration:none;"><img src="${S.logo}" alt="HD EVENTS" height="44" style="height:44px;width:auto;border:0;display:block;font-family:${F};font-size:20px;font-weight:800;letter-spacing:.07em;color:${C.text};"></a></td>
      <td valign="middle" align="right" style="font-family:${F};font-size:13px;"><a href="${utm('/', key)}" target="_blank" style="color:${C.muted};text-decoration:none;">hd-events.co.uk</a></td>
    </tr></table>
  </td></tr>

  <!-- Message -->
  <tr><td class="pad" style="padding:0 26px;font-family:${F};color:${C.text2};font-size:16px;line-height:1.6;">
    <p style="margin:0 0 16px;color:${C.text};">${A.hello}</p>
    ${A.body.map(p => `<p style="margin:0 0 16px;">${p}</p>`).join('\n    ')}
  </td></tr>

  <!-- Section heading -->
  <tr><td class="pad" style="padding:10px 26px 8px;font-family:${F};">
    <div class="h1" style="font-size:20px;font-weight:800;color:${C.text};letter-spacing:-.01em;">What we do <span style="color:${C.cyan};">/</span> <span style="color:${C.muted};font-weight:500;font-size:15px;">tap a card to see the page</span></div>
  </td></tr>

  <!-- Cards -->
  <tr><td style="padding:0 20px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows(key)}</table>
  </td></tr>

  <!-- Ask -->
  <tr><td class="pad" style="padding:22px 26px 6px;font-family:${F};color:${C.text};font-size:16px;line-height:1.6;">
    <p style="margin:0;">${A.ask}</p>
  </td></tr>

  <!-- Contact buttons -->
  <tr><td style="padding:12px 21px 6px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      ${btn(`https://wa.me/${S.whatsapp}?text=${encodeURIComponent('Hi Huw, I got your email about HD Events. ')}`, 'WhatsApp us', C.wa, '#06240f')}
      ${btn(`tel:${S.phoneTel}`, 'Call ' + S.phoneDisplay, C.cyan, C.ink)}
      ${btn(`mailto:${S.email}?subject=${encodeURIComponent('Re: ' + A.subject)}`, 'Email us', C.bg, C.text, C.line)}
    </tr></table>
  </td></tr>

  <!-- Sign-off -->
  <tr><td class="pad" style="padding:18px 26px 26px;font-family:${F};color:${C.text2};font-size:15px;line-height:1.55;">
    <div style="color:${C.text};font-weight:700;">${S.sender}</div>
    <div style="color:${C.muted};">${S.role}</div>
    <div style="margin-top:6px;">
      <a href="tel:${S.phoneTel}" style="color:${C.cyan};text-decoration:none;">${S.phoneDisplay}</a>
      <span style="color:${C.line};">&nbsp;|&nbsp;</span>
      <a href="mailto:${S.email}" style="color:${C.cyan};text-decoration:none;">${S.email}</a>
      <span style="color:${C.line};">&nbsp;|&nbsp;</span>
      <a href="${utm('/', key)}" style="color:${C.cyan};text-decoration:none;">hd-events.co.uk</a>
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td class="pad" style="border-top:1px solid ${C.line};padding:16px 26px;font-family:${F};color:${C.muted};font-size:12px;line-height:1.5;">
    You are getting this because your business is listed publicly as a London ${key === 'venues' ? 'event venue' : 'event organiser'}. If it is not for you, reply "no thanks" and I will not email again.<br>
    HD Events &middot; {{company_address}}
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>
`;

for (const [k, A] of Object.entries(AUDIENCES)) writeFileSync(new URL(A.file, import.meta.url), page(k, A));
console.log('Built', Object.values(AUDIENCES).map(a => a.file).join(', '));
