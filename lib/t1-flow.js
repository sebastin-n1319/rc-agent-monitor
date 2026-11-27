/**
 * Batch 427: T1 ticket handling flow, shown at /t1-flow to anyone signed in with an Adit Google account.
 * Generic on purpose (other departments read it): no internal names, tools or policies.
 * The page holds no content of its own; it reads this through /api/t1-flow after sign-in.
 */
const FLOW = {
  title: 'How T1 Support handles a ticket',
  takeaway: 'Resolve in T1, or hand over after a quick review.',
  updated: 'Nov 2026',
  stats: [
    { n: '~70%', l: 'of tickets resolved in T1' },
    { n: '15 min', l: 'review before any handover' },
    { n: '3 days', l: 'of daily follow-ups before the next step' },
    { n: '1 queue', l: 'for phone, email, chat and web' },
  ],
  stages: [
    { id: 'contact', n: 1, name: 'Contact comes in', blurb: 'Four ways in, one queue.' },
    { id: 'setup', n: 2, name: 'Ticket setup', blurb: 'Automatic steps before an agent opens it.' },
    { id: 'checks', n: 3, name: 'T1 checks', blurb: 'Seven questions, always in this order.' },
    { id: 'outcome', n: 4, name: 'Outcome', blurb: 'Resolved in T1, or the right team.' },
    { id: 'handover', n: 5, name: 'Hand over', blurb: 'Every move out of T1 is reviewed first.' },
  ],
  channels: [
    { name: 'Phone', share: '', detail: 'The agent answers and logs a ticket with call notes.' },
    { name: 'Missed call or voicemail', share: '', auto: true, detail: 'A ticket is created automatically: practice matched, acknowledgement email sent, repeat calls merged. Onboarding clients go to their onboarding owner.' },
    { name: 'Email', share: '', detail: 'Sent to support@adit.com. The practice is linked automatically; billing and RCM emails go straight to their teams.' },
    { name: 'Live chat', share: '', detail: 'Every chat becomes a ticket, even when it is solved live.' },
    { name: 'Web form or Help widget', share: '', detail: 'Arrives as a ticket in the same queue.' },
  ],
  setup: [
    'Duplicate tickets are merged',
    'Assigned to a T1 agent on shift',
    'Reopened tickets go back to the same agent',
    'Covered when the owner is off shift',
    'Account details filled in: stage, CSM, onboarding owner',
    'An AI draft reply is ready if the client is still waiting after 15 minutes',
  ],
  agent: 'The T1 agent opens the ticket and reads the history, the account and the AI suggestions.',
  checks: [
    { id: 'c1', q: 'Is the practice confirmed?', leaveOn: 'no', outcome: { kind: 'info', title: 'Confirm the practice', body: 'Confirm it from the call, an agent note or the client. Never ask for patient details. Then go on to the next check.', resume: true } },
    { id: 'c2', q: 'Is it part of an outage?', leaveOn: 'yes', outcome: { kind: 'info', title: 'Link it to the outage', body: 'Ask the VoIP team for the parent outage ticket and attach this one to it. Outage details are never shared with the client.' } },
    { id: 'c3', q: 'Is it an escalation, a cancellation or a port-out?', leaveOn: 'yes', outcome: { kind: 'team', title: 'Account CSM or escalation manager', body: 'Urgent or at-risk accounts are escalated right away.', handover: true } },
    { id: 'c4', q: 'Can T1 resolve it?', hint: 'Help Center topics, basic AI and basic VoIP', leaveOn: 'yes', outcome: { kind: 't1', title: 'Resolve in T1', body: 'About 70% of tickets end here.', steps: [
      'Fix it or guide the client',
      'Reply with what was done',
      'No reply: email once a day for 3 days',
      { t: 'Still no reply after 3 follow-ups:', sub: [
        'Resolved, only the client\'s confirmation pending: set to waiting on the client in the T1 queue. The system follows up and closes it.',
        'Not resolved, needs more work: to the CSM through review, for a phone follow-up.',
        'Client escalated at any level (T1 or T2): to the CSM for a phone follow-up, resolved or not.',
      ] },
      'Close. If the client comes back, it reopens with the same agent.',
    ] } },
    { id: 'c5', q: 'Are phones or calls not working?', leaveOn: 'yes', outcome: { kind: 'team', title: 'VoIP team', body: 'For every client, onboarding included. The subject says the phones are down.', handover: true } },
    { id: 'c6', q: 'Is it onboarding setup, install or configuration?', leaveOn: 'yes', outcome: { kind: 'team', title: 'Onboarding team', body: 'The client\'s onboarding owner. Setup, install and configuration only.', handover: true } },
    { id: 'c7', q: 'Does the client need a callback?', leaveOn: 'yes', outcome: { kind: 'team', title: 'Callback', body: 'VoIP topics go to the VoIP team, all others to the account CSM. T1 does not make outbound calls.', handover: true } },
  ],
  final: { kind: 'team', title: 'Owning team', body: 'T2 teams: Core, Adit Pay, AI, RCM, Porting, Server Installs, Practice Analytics. Product bugs go through T2 to T3. Patient Forms requests become a team task.', handover: true },
  handover: {
    checklist: ['Acknowledge the client by email', 'Internal note: the ask, the checks done and why it moves', 'Ticket fields filled in', 'No callback promised for a team that is off shift'],
    review: 'Sent for review. The agent does not move the ticket alone; a reviewer checks it within 15 minutes.',
    question: 'Checks done, right team?',
    yes: 'Moved to the right person or team',
    no: 'Sent back to the agent to fix the missing steps, then resubmitted',
    after: 'Quality checks: regular audits find routing misses to coach on.',
  },
  rules: [
    { t: 'Never share outage details', b: 'with clients. Link the ticket to the parent outage ticket.' },
    { t: 'Never ask for patient details', b: 'Confirm the practice from the call, notes or the client.' },
    { t: 'Phones down go to VoIP', b: 'for every client, onboarding included.' },
    { t: 'T1 does not make outbound calls', b: 'Callbacks: VoIP topics to VoIP, others to the CSM.' },
    { t: 'No callback promises', b: 'for a team that is off shift.' },
  ],
  // Batch 429: no incoming volume by channel; resolution and handover shares stay
  resolved: 70,
  handoverSplit: [
    { name: 'T2 and T3 teams', pct: 45 },
    { name: 'Account CSM', pct: 40 },
    { name: 'VoIP team', pct: 10 },
    { name: 'Other teams', pct: 5 },
  ],
  glossary: [
    { t: 'T1', d: 'First line support. Answers every phone call, email, chat and web request.' },
    { t: 'T2', d: 'Specialist support teams: Core, Adit Pay, AI, RCM, Porting, Server Installs, Practice Analytics.' },
    { t: 'T3', d: 'Engineering, for product bugs.' },
    { t: 'CSM', d: 'Customer Success Manager. Owns the client account and its follow-up calls.' },
    { t: 'VoIP team', d: 'Phone system specialists.' },
    { t: 'Onboarding team', d: 'Sets up new clients: server, phones, configuration.' },
    { t: 'Outage', d: 'One problem affecting many clients at once. Tracked on one parent ticket.' },
    { t: 'PMS', d: 'The practice management software the client uses.' },
  ],
  scenarios: [
    { name: 'How do I add a new user?', answers: ['yes', 'no', 'no', 'yes'] },
    { name: 'Phones down for an onboarding client', answers: ['yes', 'no', 'no', 'no', 'yes'] },
    { name: 'The client wants to cancel', answers: ['yes', 'no', 'yes'] },
    { name: 'Many clients report the same problem', answers: ['yes', 'yes'] },
    { name: 'New client needs their server installed', answers: ['yes', 'no', 'no', 'no', 'no', 'yes'] },
    { name: 'Payments are not posting to the PMS', answers: ['yes', 'no', 'no', 'no', 'no', 'no', 'no'] },
  ],
};

/** Where a list of yes/no answers ends: the path of check ids and the outcome. */
function walk(answers) {
  const path = [];
  for (let i = 0; i < FLOW.checks.length; i++) {
    const c = FLOW.checks[i];
    const a = answers[i];
    if (a !== 'yes' && a !== 'no') return { path, next: c.id };
    path.push(c.id);
    if (a === c.leaveOn && !c.outcome.resume) return { path, outcome: c.outcome };
  }
  return { path, outcome: FLOW.final };
}

module.exports = { FLOW, walk };
