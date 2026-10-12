'use strict';

// Departments offered in the check-in form. Edit this list to match your organisation;
// attendees who pick "Other" are asked to type their department instead.
const DEPARTMENTS = [
  'Executive',
  'Finance',
  'Human Resources',
  'MIS',
  'Internal Audit',
  'Legal',
  'Tax',
  'ESG',
  'Risk & Compliance',
  'Marketing',
];

const OTHER_DEPARTMENT = 'Other';

// ---------------------------------------------------------------------------
// Cybersecurity Awareness Month "quishing" (QR phishing) simulation
//
// Set AWARENESS_MODE=true in .env to turn the attendee page into an enticing
// party-invite lure instead of a plain attendance form. The moment someone
// submits, they get a clear teachable-moment reveal explaining it was a
// security-awareness test run by your own team.
//
// This deliberately collects ONLY the same harmless fields the attendance tool
// already asks for — name, email, department. It never requests a password or
// any other credential, so all it measures is who scanned an unknown QR code
// and handed over their details. Keep it that way: the goal is to teach, not
// to harvest anything sensitive. Edit the copy below for each campaign.
// ---------------------------------------------------------------------------

const AWARENESS = {
  enabled: /^(1|true|yes|on)$/i.test(process.env.AWARENESS_MODE || ''),

  // The lure shown before the person submits.
  lure: {
    eyebrow: 'Staff appreciation',
    headline: 'You’re invited! 🎉',
    subhead: 'Join us after work for the staff party — cocktails, drinks and dinner, on the house.',
    perks: [
      '🍸  Open bar — cocktails & drinks all night',
      '🍽️  Dinner & live music',
      '🎁  Prize draw for every guest who RSVPs',
    ],
    cta: 'Reserve my spot',
    footnote: 'Spots are limited — RSVP now to reserve yours.',
  },

  // The teachable moment shown the instant they submit.
  reveal: {
    headline: 'Hold on — this was a security test',
    lead: 'There is no party. This was a Cybersecurity Awareness Month exercise run by the Information Security team. You just scanned an unknown QR code and submitted your details.',
    points: [
      'Attackers hide malicious links inside QR codes — it’s called “quishing”. You cannot tell where a code leads just by looking at it.',
      'A tempting offer — free drinks, prizes, gifts — is a classic trick to rush you past your judgement.',
      'Before you scan a code or type in your details, stop and ask: do I trust the source, and was I expecting this?',
    ],
    reassure: 'No password was requested and nothing was compromised. Only your name, email and department were recorded, so the team can share a short refresher with everyone who took part.',
    signoff: 'Thanks for helping keep us secure. — Information Security',
  },
};

module.exports = { DEPARTMENTS, OTHER_DEPARTMENT, AWARENESS };
