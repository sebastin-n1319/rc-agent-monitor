/**
 * Batch 427: T1 ticket handling flow, shown at /t1-flow to anyone signed in with an Adit Google account.
 * Generic on purpose (other departments read it): no internal names, tools or policies.
 * The page holds no content of its own; it reads this through /api/t1-flow after sign-in.
 */
const FLOW = {
  title: 'How T1 Support handles a ticket',
  takeaway: 'Most requests are solved by T1. The rest reach the right team, checked and ready to work.',
  updated: 'Nov 2026',
  stats: [
    { n: '~70%', l: 'of tickets solved by T1, with no handover' },
    { n: '15 min', l: 'review before any ticket leaves T1' },
    { n: '3 days', l: 'of daily follow-ups when a client goes quiet' },
    { n: '1 queue', l: 'for phone, email, chat and web requests' },
  ],
  stages: [
    { id: 'contact', n: 1, name: 'Contact comes in', blurb: 'Every request, from any channel, becomes a ticket in one queue.' },
    { id: 'setup', n: 2, name: 'Ticket setup', blurb: 'Automation prepares the ticket before an agent opens it.' },
    { id: 'checks', n: 3, name: 'T1 checks', blurb: 'Seven questions, asked in the same order every time.' },
    { id: 'outcome', n: 4, name: 'Outcome', blurb: 'Solved in T1, or routed to the team that owns it.' },
    { id: 'handover', n: 5, name: 'Hand over', blurb: 'A quick review makes sure nothing is missing.' },
  ],
  channels: [
    { name: 'Phone', share: '', detail: 'The agent answers live and logs a ticket with notes from the call.' },
    { name: 'Missed call or voicemail', share: '', auto: true, detail: 'Becomes a ticket on its own: the practice is matched, the client gets an email saying we received it, and repeat calls join the same ticket. Clients still in onboarding go to their onboarding owner.' },
    { name: 'Email', share: '', detail: 'Sent to support@adit.com. The ticket is linked to the right practice; billing and RCM emails go straight to those teams.' },
    { name: 'Live chat', share: '', detail: 'Every chat is saved as a ticket, even when it is solved during the chat.' },
    { name: 'Web form or Help widget', share: '', detail: 'Arrives as a ticket in the same queue as everything else.' },
  ],
  setup: [
    'Duplicate tickets from the same office are merged',
    'Assigned to a T1 agent who is on shift',
    'A reopened ticket goes back to the agent who had it',
    'Picked up by someone else when the owner is off shift',
    'Account details added: stage, CSM and onboarding owner',
    'An AI draft reply is ready if the client is still waiting after 15 minutes',
  ],
  agent: 'The T1 agent opens the ticket with the history, the account details and AI suggestions already in front of them.',
  checks: [
    { id: 'c1', q: 'Do we know which practice this is?', hint: 'The office the request is for', leaveOn: 'no', outcome: { kind: 'info', title: 'Confirm the practice first', body: 'Use the call, earlier notes on the ticket, or ask the office. Do not ask for patient details such as names or dates of birth to work it out. Then go on to the next check.', resume: true } },
    { id: 'c2', q: 'Is it part of an outage?', hint: 'The same problem reported by many offices', leaveOn: 'yes', outcome: { kind: 'info', title: 'Link it to the outage', body: 'The VoIP team keeps one main ticket for each outage. This ticket is linked to it, so every affected office hears when it is fixed. Outage details are not shared with clients.' } },
    { id: 'c3', q: 'Is it an escalation, a cancellation or a port-out?', hint: 'An unhappy or at-risk account, or moving numbers away', leaveOn: 'yes', outcome: { kind: 'team', title: 'Account CSM or escalation manager', body: 'They own the relationship. Urgent or at-risk accounts are raised right away.', handover: true } },
    { id: 'c4', q: 'Can T1 solve it?', hint: 'Help Center topics, plus basic AI and phone troubleshooting', leaveOn: 'yes', outcome: { kind: 't1', title: 'Solved in T1', body: 'About 70% of tickets end here.', steps: [
      'Fix it, or guide the client through it',
      'Reply with what was done',
      'No reply: email once a day for 3 days',
      { t: 'Still no reply after 3 follow-ups:', sub: [
        'Fixed, only waiting for the client to confirm: the ticket waits on the client, and the system follows up and closes it.',
        'Not fixed, needs more work: goes to the CSM, through review, for a phone call.',
        'The client has escalated at any level: goes to the CSM for a phone call, fixed or not.',
      ] },
      'Close. If the client writes back, it reopens with the same agent.',
    ] } },
    { id: 'c5', q: 'Are phones or calls not working?', hint: 'No dial tone, phones offline, calls not coming in', leaveOn: 'yes', outcome: { kind: 'team', title: 'VoIP team', body: 'For every client, including clients still in onboarding. The subject says the phones are down, so it is seen as urgent.', handover: true } },
    { id: 'c6', q: 'Is it onboarding setup, install or configuration?', hint: 'A new client getting set up', leaveOn: 'yes', outcome: { kind: 'team', title: 'Onboarding team', body: 'The client\'s onboarding owner handles setup, install and configuration. Anything broken still follows the checks above.', handover: true } },
    { id: 'c7', q: 'Does the client need a callback?', hint: 'They asked to be called', leaveOn: 'yes', outcome: { kind: 'team', title: 'Callback', body: 'Phone system topics go to the VoIP team, everything else to the account CSM. T1 does not make outbound calls.', handover: true } },
  ],
  final: { kind: 'team', title: 'Team that owns the topic', body: 'Specialist (T2) teams: Core, Adit Pay, AI, RCM, Porting, Server Installs and Practice Analytics. Product bugs go through T2 to engineering (T3). Patient Forms requests become a task for that team.', handover: true },
  handover: {
    checklist: ['Email the client that we are on it', 'Add an internal note: what they asked, what was checked, why it moves', 'Fill in the ticket fields', 'Do not promise a callback from a team that is off shift'],
    review: 'The agent does not move the ticket on their own. A reviewer checks it within 15 minutes.',
    question: 'Steps done, right team?',
    yes: 'Moved to the right person or team',
    no: 'Sent back to the agent to add what is missing, then reviewed again',
    after: 'Quality checks: regular audits spot routing mistakes, and they feed coaching.',
  },
  rules: [
    { t: 'Outage details stay internal', b: 'Clients hear that we are working on it. The ticket is linked to the main outage ticket.' },
    { t: 'No patient details to identify a practice', b: 'Confirm the office from the call, earlier notes, or by asking the office. Never ask for patient names or dates of birth for this.' },
    { t: 'Phones down go to the VoIP team', b: 'For every client, including clients still in onboarding.' },
    { t: 'T1 does not make outbound calls', b: 'Callbacks go to the VoIP team for phone topics, otherwise to the account CSM.' },
    { t: 'Only promise what can happen', b: 'No callback promises for a team that is off shift.' },
  ],
  // Batch 429: no incoming volume by channel; resolution and handover shares stay
  resolved: 70,
  handoverSplit: [
    { name: 'T2 and T3 teams', pct: 45 },
    { name: 'Account CSM', pct: 40 },
    { name: 'VoIP team', pct: 10 },
    { name: 'Other teams', pct: 5 },
  ],
  // Batch 433: what runs automatically, and how it learns
  automation: {
    intro: 'Automation and AI take the busywork off agents, so people spend their time on the client. Every AI suggestion is checked by a person before it reaches a client.',
    loop: [
      { k: 'capture', name: 'Capture', text: 'Nothing is lost: every call, email and chat becomes a ticket, linked to the right office.' },
      { k: 'assist', name: 'Assist', text: 'AI prepares replies and answers agent questions from our guides, updates and team rules.' },
      { k: 'check', name: 'Check', text: 'Every handover and a sample of calls and tickets are checked, by reviewers helped by AI.' },
      { k: 'learn', name: 'Learn', text: 'What agents change and what reviews find feeds back into the AI and into training.' },
    ],
    moments: [
      { when: 'The moment it arrives', items: [
        { loop: 'capture', icon: 'phone', title: 'Missed calls become tickets', text: 'A missed call or voicemail opens a ticket on its own, matched to the office, with an email to the client saying we received it.', smart: 'Repeat calls from the same office within 30 minutes join one ticket instead of creating many.' },
        { loop: 'capture', icon: 'link', title: 'Linked to the right practice', text: 'Each ticket is matched to the client account. When an email address is shared by several offices, the ticket is flagged so the agent confirms which one.', smart: 'Agents start with the account history, not a blank page.' },
        { loop: 'capture', icon: 'route', title: 'Sent straight to the right team', text: 'Billing and RCM emails go to those teams on arrival, and onboarding clients\' missed calls go to their onboarding owner.', smart: 'Requests that T1 cannot solve never wait in the T1 queue.' },
      ] },
      { when: 'Before an agent opens it', items: [
        { loop: 'capture', icon: 'user', title: 'Assigned to someone on shift', text: 'New tickets go to a T1 agent who is working now. A reopened ticket goes back to the agent who knows it.', smart: 'When the owner is off shift, the ticket is picked up instead of waiting.' },
        { loop: 'assist', icon: 'card', title: 'Account details on the ticket', text: 'The client\'s stage, CSM and onboarding owner are added to the ticket.', smart: 'Agents see who owns the account before they decide where a ticket goes.' },
        { loop: 'assist', icon: 'spark', title: 'An AI draft reply, when it helps', text: 'If the client is still waiting after 15 minutes, a draft reply is ready for the agent to edit and send.', smart: 'Drafts follow how our agents actually write, and are checked so they do not claim work that has not been done.' },
      ] },
      { when: 'While the agent works', items: [
        { loop: 'assist', icon: 'chat', title: 'An AI expert to ask', text: 'Agents can ask how something works and get an answer built from our guides, the latest updates and team rules.', smart: 'It warns when several offices report the same problem, so a possible outage is caught early.' },
        { loop: 'assist', icon: 'bell', title: 'Updates agents must read', text: 'New product and process updates appear when agents sign in, and they confirm they have read them.', smart: 'Answers follow how things work today, not last month.' },
        { loop: 'check', icon: 'alert', title: 'Escalations raised fast', text: 'Urgent or at-risk accounts are posted for the escalation owner straight away.', smart: 'If nobody picks one up within an hour, it moves up automatically.' },
      ] },
      { when: 'When it moves on', items: [
        { loop: 'check', icon: 'shield', title: 'Every handover reviewed', text: 'A reviewer checks each handover within 15 minutes: the client was told, the note is clear, the team is right.', smart: 'AI checks the ticket first and flags what looks missing, so the review is quick.' },
        { loop: 'check', icon: 'flag', title: 'Routing rules that catch mistakes', text: 'Audit rules flag known mistakes, for example a phones-down ticket sent anywhere but the VoIP team.', smart: 'The rule reads the agent\'s own note too, so a vague subject does not hide the problem.' },
      ] },
      { when: 'After, to get better', items: [
        { loop: 'check', icon: 'mic', title: 'Calls reviewed by AI and people', text: 'Recorded calls are scored against the same checklist reviewers use.', smart: 'Where AI and a reviewer disagree, the checklist is refined.' },
        { loop: 'learn', icon: 'brain', title: 'The AI learns from agents', text: 'Each day the drafting AI studies how agents changed or replaced its drafts and updates its own writing rules.', smart: 'A learned rule that contradicts a team rule is flagged for a person, not used.' },
        { loop: 'learn', icon: 'grad', title: 'Training built from real cases', text: 'Assessments can be written from the latest updates and from the mistakes found in reviews.', smart: 'Agents are tested on what changed and what went wrong, with names left out.' },
      ] },
    ],
  },
  glossary: [
    { t: 'T1', d: 'First line support. Answers every phone call, email, chat and web request.' },
    { t: 'T2', d: 'Specialist support teams: Core, Adit Pay, AI, RCM, Porting, Server Installs, Practice Analytics.' },
    { t: 'T3', d: 'Engineering, for product bugs.' },
    { t: 'CSM', d: 'Customer Success Manager. Owns the client account and its follow-up calls.' },
    { t: 'VoIP team', d: 'Phone system specialists.' },
    { t: 'Onboarding team', d: 'Sets up new clients: server, phones, configuration.' },
    { t: 'Practice', d: 'The dental, eye care or medical office that is our client.' },
    { t: 'Outage', d: 'One problem affecting many offices at once. Tracked on one main ticket.' },
    { t: 'Handover', d: 'Moving a ticket from T1 to another team, after a quick review.' },
    { t: 'PMS', d: 'The practice management software the office uses.' },
  ],
  scenarios: [
    { name: 'How do I add a new user?', answers: ['yes', 'no', 'no', 'yes'] },
    { name: 'Phones down for an onboarding client', answers: ['yes', 'no', 'no', 'no', 'yes'] },
    { name: 'The client wants to cancel', answers: ['yes', 'no', 'yes'] },
    { name: 'Many offices report the same problem', answers: ['yes', 'yes'] },
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
