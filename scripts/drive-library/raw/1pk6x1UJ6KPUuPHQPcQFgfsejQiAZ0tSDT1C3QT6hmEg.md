# Ticket Automation Rule Book - T1 CS

What each Desk ticket automation does for T1 CS, what it relies on, what it never does, and what the agent checks. Example ticket numbers are Desk tickets.

## 1. Linking a ticket to the right practice (email and web tickets)

| Rule ID | Scenario | What the automation does | Data it relies on | What it never does | What the agent checks | Who updates the record | Status | Example ticket |
|---|---|---|---|---|---|---|---|---|
| AS-01 | Email from someone who is a contact in CRM | The ticket keeps the practice of that CRM contact. For a single-location practice the deal is filled automatically. | Sender email matched to CRM Contacts | Does not guess a deal for a multi-location practice | Correct location (deal) is set | Desk: T1 agent. CRM: OB or CSM | Live |  |
| AS-02 | Sender is not on any CRM contact, but the ticket shows a practice | Adds a private Practice check note: the practice came only from the Desk contact, confirm it before replying. Tag t1-check-practice. | CRM Contacts search by sender email; Desk contact account | Does not change the account on its own | Practice confirmed from the email before replying; OB or CSM informed to add the contact in CRM | Desk: T1 agent. CRM: OB or CSM | Rolling out |  |
| AS-03 | Sender is a CRM contact, but under a different practice than the ticket shows | Adds a Practice check note listing both practices so the agent picks the right one. Tag t1-check-practice. | CRM Contacts search by sender email | Does not pick between the two on its own | Right account and deal set before replying | Desk: T1 agent | Rolling out |  |
| AS-04 | Agency or vendor partner writes in for one of several practices (for example a marketing agency) | Adds a Practice check note: agency sender, the practice on the ticket may be from an earlier email. Agency domains are kept in a list (currently marketingd4y.com). | Agency domain list; subject and body of the email | Does not trust the account on the agency's Desk contact | Practice confirmed from the subject or body; Desk contact for the agency is not tied to one practice; agency person is not added as a practice contact in CRM | Desk: T1 agent | Rolling out | 431093 |
| AS-05 | Multi-location practice (one account, several deals) | Links the account. The location is not chosen automatically. | CRM account and its deals | Does not pick a location | Right location (deal) is set; ask the client if the email does not say | Desk: T1 agent | Live | 431093 |
| AS-06 | Client sends an automatic reply (out of office, we have received your message, read receipt) | No Expert draft is prepared for these. | Sender and subject patterns | Does not draft a reply | Ticket closed or merged into the real one | Desk: T1 agent | Live | 430593 |

## 2. RingCentral missed calls and voicemails

| Rule ID | Scenario | What the automation does | Data it relies on | What it never does | What the agent checks | Who updates the record | Status | Example ticket |
|---|---|---|---|---|---|---|---|---|
| RC-01 | Caller's number is on exactly one CRM contact with an email | Links the ticket to that contact and practice and sends an acknowledgement email (with support hours if the call came after hours). | Caller number from the notification, matched in 14 formats to CRM Phone, Mobile, Other Phone and Account phone | Does not use the caller ID name to link | Contact is the right person | Desk: automation | Live |  |
| RC-02 | Same number is on contacts in more than one practice | Uses the caller ID name to narrow it down. If it still matches more than one practice, the ticket is not linked and the candidates are listed in a note. | CRM contacts and accounts with that number; caller ID name | Does not guess a practice and sends no email | Right practice linked | Desk: T1 agent. CRM: OB or CSM to clean up duplicates | Live | 430012 (two accounts with the same number) |
| RC-03 | Several contacts in the same practice share the number | Links to the contact with the most past conversations and says so in the note. | Desk conversation count per contact |  | Contact changed if it is the wrong person | Desk: T1 agent | Live |  |
| RC-04 | Caller's number is not in CRM | Not linked, no email sent. The random account the ticket inherits from the shared RingCentral contact is cleared. Note asks for the number to be added to the right CRM contact. | Exact phone match only | Does not guess a practice from names or partial numbers | Who called is confirmed; OB or CSM informed to add the number in CRM | CRM: OB or CSM | Live | 430014 (Island's Edge, number not in CRM) |
| RC-05 | Same caller calls again within 30 minutes | Merged into the first open ticket, with a note. No second email. | Phone number, contact's recent tickets | Does not create a second ticket or email |  | Desk: automation | Live | 428239 / 428238 |
| RC-06 | Contact has Email Opt Out in CRM | Linked, but no acknowledgement email. | CRM Email Opt Out | Does not email the client | Call back the client |  | Live |  |
| RC-07 | No caller number in the notification, or CRM could not be searched | Not linked. Note asks the agent to link it manually. |  | Does not link | Link the ticket manually | Desk: T1 agent | Live |  |
| RC-08 | Call to the VoIP support queue | Sent to the T1 - VoIP CSM team queue. | Queue extension in the notification |  |  | Desk: automation | Live |  |
| RC-09 | Missed call or voicemail on a TechOB specialist's line | Sent to that specialist's TechOB pod queue, Google Chat alert posted, no acknowledgement email. A voicemail copy sent to a co-recipient is merged. | Agent name in the notification; TechOB pod list | Does not send the client an email | Specialist follows up directly | TechOB | Live |  |
| RC-10 | Caller was trying to reach a TechOB specialist but chose support | Stays with support, Google Chat alert to the specialist. | Forwarded name in the notification |  | Check the ticket before calling back | Desk: support | Live |  |

## 3. Case notes

| Rule ID | Scenario | What the automation does | Data it relies on | What it never does | What the agent checks | Who updates the record | Status | Example ticket |
|---|---|---|---|---|---|---|---|---|
| CN-01 | Every new ticket | A private case note is added: client name, practice, account number, deal stage, callback number, email, any open escalation, the client's query, troubleshooting so far and next steps. It is updated as the ticket moves. | Ticket, CRM and Help Center | Is not visible to the client | Note is accurate before relying on it | Automation | Live |  |
| CN-02 | Practice details on a RingCentral call | Practice, account number and deal stage are filled only when the caller's number exactly matches CRM, the caller gave their account number, or an agent wrote the account number on the ticket. Otherwise it says Not identified. | Exact phone match; account number from the caller or agent | Never uses the ticket's Desk account or contact, other numbers in the notification, names, or the Overflow Of Customer Service account | Practice confirmed with the caller | Automation | Live | 430014 |
| CN-03 | Practice details on an email ticket from someone not in CRM | Reads the practice or doctor named in the email and matches it to CRM. | Practice and contact names in CRM |  | Practice confirmed (see AS-02 and AS-04) | Automation | Live | 431093 |
| CN-04 | Number or sender matches more than one account | Says it is on more than one account instead of picking one. |  | Does not pick one | Right practice set | Desk: T1 agent | Live | 430012 |
| CN-05 | Any Escalation Ticket Open line | Shows Yes - Tier N when the ticket has an escalation alert or an escalated-tier-1 or escalated-tier-2 tag. | Escalation alert note and tags |  |  | Automation | Live |  |

## 4. Expert reply drafts

| Rule ID | Scenario | What the automation does | Data it relies on | What it never does | What the agent checks | Who updates the record | Status | Example ticket |
|---|---|---|---|---|---|---|---|---|
| EX-01 | New client email in the pilot group | Prepares a draft reply in the reply box and a private note. The agent reads it, edits it and sends it. | Ticket, CRM, Help Center, related past tickets | Never sends a reply on its own | Account, facts and tone checked before sending | Agent | Live (pilot) | 428969, 427538 |
| EX-02 | Ticket is not a client email, is closed, or already has a reply or a draft | No draft is prepared. | Channel, status, threads |  |  |  | Live (pilot) |  |
| EX-03 | Ticket changes while the draft is being written (moved to another team, closed, or an agent replied) | The draft is not saved, or is removed. The note is kept as a reference. | Live ticket re-check before saving | Does not leave an outdated draft |  |  | Live (pilot) | 429169, 426401 |
| EX-04 | Account found by email or by account number in the email | Links the right account automatically and uses it in the draft. | CRM contact email; account number |  | Account checked | Automation | Live (pilot) | 429235, 428726 |

## 5. Escalations (Desk and CRM)

| Rule ID | Scenario | What the automation does | Data it relies on | What it never does | What the agent checks | Who updates the record | Status | Example ticket |
|---|---|---|---|---|---|---|---|---|
| ES-01 | New ticket from a client with an open Tier 1 or Tier 2 escalation | Private note tagging the escalation owner, tag escalated-tier-N, and an alert in ESC Tickets with T1 CS. Mike Norris is copied; for Tier 2 Sebastin, Ronnie G and Kushal Joshi are also copied. | Ticket's deal and CRM Escalations |  | Ticket handled on priority | Escalation owner and T1 agent | Live | 429537 |
| ES-02 | Escalation owner creates or owns the ticket themselves | Only the escalation tag is added. No alert note or Chat post. | Escalation owner vs ticket owner and creator | Does not notify people about their own ticket |  |  | Live | 430278 |
| ES-03 | Escalation is raised after the ticket already exists | Not alerted on the existing ticket. The next new ticket from that client is alerted. |  |  | Escalation owner informed by whoever raised it |  | Known gap | ESC-6309 / 424475 |
| ES-04 | T1 agent raises an escalation in CRM | Posted in ESC Tickets with T1 CS for anyone in the CSM team to take ownership. If still with the T1 agent after 1 hour, the owner moves to Kushal Joshi with a note on the record and a post copying Mike Norris and Ronald Jacob. | CRM Escalations: Created By Role, Owner | Does not change escalations raised by other teams |  | CSM team | Live | ESC-6309 |

## 6. Routing to other teams

| Rule ID | Scenario | What the automation does | Data it relies on | What it never does | What the agent checks | Who updates the record | Status | Example ticket |
|---|---|---|---|---|---|---|---|---|
| RT-01 | Email clearly about RCM | Moved to the RCM team with an acknowledgement and a note. Once routed, it is not routed again. | Subject, body, CRM deal | Does not route on a single weak keyword |  | RCM team | Live |  |
| RT-02 | Email about billing | Moved to the Billing team with a note. | Subject and body |  |  | Billing team | Live |  |

## 7. Data responsibility

| Rule ID | Scenario | What the automation does | Data it relies on | What it never does | What the agent checks | Who updates the record | Status | Example ticket |
|---|---|---|---|---|---|---|---|---|
| DR-01 | A new staff member, wrong contact or duplicate is found on a ticket | T1 fixes the Desk side and informs the OB or CSM, who updates CRM. |  | T1 does not edit CRM records by process |  | CRM: OB or CSM | Live |  |
| DR-02 | Two CRM accounts or contacts are duplicates (same name or same number) | Automations will not pick between them and will flag the ticket instead. |  |  | Report the duplicate | CRM: OB or CSM | Live | 430012 |
