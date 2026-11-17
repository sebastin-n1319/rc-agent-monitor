**Adit AI Support**

**T1 Frequently Asked Questions**

AI Front Desk, AI Web Chat and Call Intelligence

| Field | Detail |
| :---- | :---- |
| Audience | T1 Customer Support (Calls Wing and Chat Wing) |
| Version | v1.0 |
| Last updated | 04 September 2026 |
| Source | AI Support space discussions, July to September 2026 |
| Review cycle | Monthly, or whenever AI team announces a process change |

# **How to use this document**

This FAQ covers the AI questions that reach T1 most often. Each entry tells you three things: what the client is actually asking, what you can say or check yourself, and where the request goes next.

**Golden rule:** T1 does not change AI configuration. We identify the issue correctly, set the right expectation, capture a complete intake, and route it to the AI team. A clean handoff is worth more than a guess at a fix.

* Standard promise for a callback is 60 minutes, unless the AI team has already given a specific time.

* Always raise or update a Zoho Desk ticket before posting in chat. The ticket number is what the AI team works from.

* If a client is threatening cancellation, say so explicitly in the chat post. Those move ahead of the queue.

* Never promise a feature, a language or a timeline that is not confirmed in this document. Say you will confirm and come back.

# **1\. Routing and escalation**

## **1.1 Who handles what**

| Request type | Goes to |
| :---- | :---- |
| AI setup, call flow changes, agent preferences, disabling AI | AI T2 support specialists |
| AI onboarding or training scheduling, reschedules, no shows | The Tech Onboarding owner on the deal, not the AI team |
| AI cancellation, refund or package change | AI leadership (Aijaz Shaikh, Zarka, Antony Kay) plus the account CSM |
| EHR sync failures affecting AI booking | T2 Core through a sync ticket, AI team informed |
| Suspected product bug or wrong AI behaviour | AI T2, who escalate to AI T3 or engineering |
| Billing disputes, invoices, double charges | Billing, with AI team copied if the charge is for an AI module |

## **1.2 How to post in the AI Support space**

Use the standard intake block. Posts without a ticket number or callback number get bounced back and cost the client another wait cycle.

*Client Name / Practice Name / Account Number / Deal Stage (OB, CSM or Churn) / Callback Number / Email / Ticket Number / Reason for contact / Resolution or expectation set*

Before transferring a live call, confirm in chat that the specialist is free and ask for their current extension. Do not transfer blind.

# **2\. Turning AI on and off**

## **2.1 The client wants AI Front Desk turned off immediately**

**What is really being asked:** Usually they want AI to stop answering their phones today. That is not the same as cancelling the subscription, and the two must not be confused.

**What T1 does:** Confirm whether they want AI stopped temporarily or cancelled commercially. Raise or update the ticket, mark it urgent, post in the AI space and arrange a callback within 60 minutes.

**Important:** The supported method is removing the AI number from the call flow. Disabling the AI module directly is not the correct approach and has caused follow on issues. Only the AI team performs either action.

**Known failure point:** Clients have called back angry because a disable request was logged but never actioned. If a disable request is more than a few hours old with no notes on the ticket, escalate to AI leadership rather than repeating the same request.

## **2.2 The client wants a package downgrade for AI**

**Answer:** Teams outside the AI team must not enter AI package downgrades in Zoho. A downgrade record does not stop the AI service, it only changes the CRM entry, so the client keeps being charged and keeps receiving AI calls.

**What T1 does:** Log the request and tag the AI leads. They own the downgrade end to end.

## **2.3 The client wants AI paused for a short period**

**Common reasons:** Phone issues at the practice, a holiday, or the office testing something. Pausing is handled as a call flow change by the AI team, not by the client.

**What T1 does:** Capture the exact dates and hours they want AI off, then route. Do not tell the client they can toggle it themselves in the app.

# **3\. Call routing and answering behaviour**

## **3.1 AI is answering calls during business hours and the office wants to answer first**

**Answer:** This is a call flow configuration, not a fault. AI can be set to answer only after hours, only on weekends, or only after the office phones ring for a set time.

**What T1 does:** Capture their exact opening hours per day, and confirm what they want AI to do inside those hours (never answer, answer only on overflow, or answer after X rings). Route to AI T2.

## **3.2 AI picks up too slowly or too quickly**

**Answer:** The number of rings before AI answers is configurable. Clients have asked in both directions, some want AI faster than six rings, others want a delay so staff get a chance first.

**What T1 does:** Ask for the behaviour they want in plain terms and route as a call flow change.

## **3.3 All calls are going to AI and the office receives nothing**

**Treat as urgent.** This is a practice down situation. The office is losing patient calls.

**What T1 does:** Confirm the symptom (do inbound calls reach the hard phones at all, does the caller hear an error message, are auto texts going out), raise the ticket as urgent, post in the AI space flagged URGENT, and arrange the fastest available callback.

## **3.4 The client wants emergencies to reach a person**

**Answer:** Requests to have AI transfer emergency callers to the practice or to an emergency voicemail box are handled as a configuration request. Do not confirm to the client that a specific emergency routing option exists until the AI team validates it for their setup.

## **3.5 Warm transfer is not working**

**Answer:** Warm transfer needs a tracking number ordered on the account, and a tracking number cannot be ordered without valid billing information on file. If the card is missing, the order fails with an invalid billing information error.

**What T1 does:** Check whether the account has billing details on file. If not, route to the billing or account owner to collect the card first, then the AI team can order the tracking number.

# **4\. Hours, holidays and closures**

## **4.1 The office is closed for a holiday and does not want AI booking that day**

**Answer:** Closure dates are handled through the Business Holidays section in AI settings. Adding a closure means AI knows the office is shut and will not treat it as a normal working day.

**What T1 does:** Collect the exact dates, confirm whether they still want AI to answer and take messages or book future appointments during the closure, then route. Holiday requests are time sensitive, so flag the deadline in your post.

## **4.2 AI told a patient the office is closed on the wrong day**

**Answer:** This is a configuration mismatch between the practice hours in Adit and the AI agent settings. Do not tell the client it is a bug.

**What T1 does:** Capture the exact wrong statement, the day it happened, and the correct hours per day. Route to AI T2 for a settings review.

## **4.3 The client wants a voicemail to play only on days off and holidays**

**Answer:** This is a combined call flow and holiday configuration change. Route to the AI team with the exact days and the message they want played.

# **5\. Appointment booking issues**

Booking complaints are the highest volume AI category and the most common trigger for cancellation requests. Treat them as high priority and capture detail carefully.

## **5.1 AI booked into a blocked or unavailable slot**

**Answer:** AI books against the schedule and provider availability it can see. If a provider is blocked in the EHR but AI still booked them, that is a configuration or sync issue worth investigating.

**Capture:** Patient name, appointment date and time, provider expected versus provider booked, and whether the block was set in the EHR or only in the Adit scheduler.

## **5.2 AI created duplicate or multiple appointments from one call**

**Answer:** Known scenario, particularly where a caller books for several family members in one call, or where one provider is set up across two operatories or columns. In the two column setup AI can double book the same provider.

**Capture:** Number of appointments expected versus created, the patient names, and whether the practice runs one provider across multiple columns.

## **5.3 A cancellation or reschedule was confirmed by AI but did not change the schedule**

**Answer:** The AI conversation completed but the change did not land in the EHR. This is usually a sync problem, not an AI conversation problem.

**Capture:** Patient name, original slot, new slot promised, time of the call, and whether other AI bookings are syncing normally.

## **5.4 The appointment type is wrong (emergency booked as hygiene, crown booked as cleaning)**

**Answer:** Appointment type mapping is part of the AI setup. Repeated mismatches point to the mapping rather than a one off.

**Capture:** What the patient asked for, what AI booked, and how many times it has happened.

## **5.5 AI booked appointments are not marked as new patient**

**Answer:** Where staff booking creates an NP marker on the schedule, AI booked appointments have not always carried the same marker. Log it, do not promise a setting exists.

## **5.6 The appointment has no patient name or date of birth**

**Answer:** Incomplete appointment records from AI bookings are a real reported issue. Capture examples with dates so the AI team can pull the call.

## **5.7 The client does not want AI to book at all, only take a message**

**Answer:** AI can be configured to capture the request and create a task instead of confirming an appointment. Several practices run this way deliberately.

**Watch for:** Clients who believe scheduling is off but still see AI telling patients they have an appointment. That combination needs an urgent configuration review, because patients are being told something untrue.

# **6\. EHR sync issues**

Sync failures look like AI failures to the client. Establishing whether sync is healthy early saves the AI team a wasted call.

## **6.1 The standard sync check**

| Step | What it means |
| :---- | :---- |
| Check the sync location | If it is a VM, sync runs on Adit infrastructure. If it is a Chrome extension, sync runs on the client machine through the extension. |
| Check the last backup timestamp | Backup is expected to run once every 24 hours. A backup older than 24 hours means backup is not running and should be treated as an issue. |
| If the location is VM | Raise a ticket to T2 Core. |
| If the location is Chrome extension | The client is not running the extension. Follow up with the practice to get it enabled and connected. |

## **6.2 Appointments are stuck in sync pending and never reach the EHR**

**Answer:** A useful diagnostic is whether online scheduler bookings sync while AI bookings do not. If only AI bookings are stuck, say so in the ticket, it narrows the investigation considerably.

## **6.3 Onboarding is scheduled but sync is broken**

**Answer:** AI Front Desk and online scheduling will not work reliably until sync is healthy, so the session usually has to be rescheduled. Flag broken sync to the onboarding owner before the call, not during it.

# **7\. Recordings, transcripts and tasks**

## **7.1 The client cannot find a call recording or transcript**

**Where to look:** Call Intelligence, then Calls, then All Calls. Search by patient name or phone number, open the timeline on the far right, and the recording is there.

**If the client still cannot see it:** Confirm whether you can see it from your side. If you can and they cannot, it is likely a permissions or app version issue, so capture their user role and route it.

## **7.2 The client can hear only the patient, not the AI, on a recording**

**Answer:** Reported issue with AI handled call recordings. Capture the call date, time and patient, and route to the AI team.

## **7.3 The client wants AI call transcripts to stop posting into the EHR**

**Answer:** This is a configuration request handled by the AI team. Confirm first which product they are actually using, some practices asking this are on Call Intelligence rather than AI Front Desk.

## **7.4 Questions about AI created tasks**

**Common asks:** Tasks not visible to everyone, a task marked complete by one user still showing as open for others, the task list being too long to review, and requests for an email or badge notification when AI handles an interaction.

**What T1 does:** Capture the specific behaviour and the users affected. Do not promise a notification feature, requests for one are logged as product feedback.

## **7.5 The client wants a weekly or summary report of AI activity**

**Answer:** Confirm what they want to measure before routing, since Call Intelligence reporting and AI interaction views cover different things. Route reporting questions to the AI team rather than answering from assumption.

# **8\. Voice, language and conversation quality**

## **8.1 Which languages does AI Front Desk support?**

**Answer:** Language support is confirmed case by case by the AI team. Clients have asked about Arabic, Cantonese, Russian, Ukrainian and Bulgarian, among others.

**What T1 says:** Confirm the language they need and that you will come back with confirmation. Never commit to a language on the call.

## **8.2 AI speaks too fast or talks over the patient**

**Answer:** Speech pace and interruption handling have been raised repeatedly and are treated as a product quality concern, not a per practice setting you can adjust.

**What T1 does:** Capture a specific call example (date, time, patient) so the AI team can review the recording, and flag it clearly if the client is considering cancellation.

## **8.3 Patients realise mid call that they are speaking to AI**

**Answer:** This is a common piece of feedback rather than a fault. Route to the AI team for a review of the greeting and conversation setup, and log it as feedback.

## **8.4 AI gave the patient wrong information (wrong phone number, wrong email, wrong speciality)**

**Answer:** The AI knowledge base for that practice needs correcting. Capture the exact wrong answer and the correct answer.

**Note:** Practices in optometry, chiropractic and orthodontics have reported AI describing them as a dental practice. That is a knowledge base setup issue and should be corrected quickly, because it damages trust with patients.

## **8.5 AI misspelled a patient name**

**Answer:** Log with the example. Name capture accuracy is tracked by the AI team.

## **8.6 AI logged a note against the wrong family member**

**Answer:** Where one phone number is shared by several family members, the integration cannot always identify which patient the call belongs to. This is an EHR integration behaviour, not an AI recognition fault, and should be explained that way rather than logged as an AI bug.

# **9\. Onboarding and training**

## **9.1 The client says they have a session today but received no invite**

**What T1 does:** Do not try to rebook it yourself. Identify the onboarding owner on the deal and post in the AI space with the practice name, deal link and the time the client expected. Include a contact number so someone can call them.

## **9.2 The client needs to reschedule or missed the session**

**Answer:** Rescheduling is done by the Tech Onboarding team, not the AI specialists. AI specialists cannot book their own calls.

## **9.3 Can AI Front Desk and Web Chat be onboarded together?**

**Answer:** Yes. Separate invites are no longer needed. The booking is made once with Front Desk plus Web Chat selected as the product.

## **9.4 What has to be ready before an AI onboarding call?**

* Number porting complete, or the FOC date passed

* Phones set up and online

* EHR sync current, with a backup inside the last 24 hours

* AI add on and package change reflected in the CRM

* Online scheduling enabled where the practice intends to use AI booking

* The decision maker available, since most setup choices need the doctor or owner

## **9.5 A second or third location wants the same setup with no training**

**Answer:** Each location still goes through the booking link for its own onboarding. Do not agree to copy a configuration across locations without the AI team confirming it.

## **9.6 The client cannot see the Get Started button in the app**

**Answer:** Ask them to try the web version of Adit, where the button is usually visible. Confirm they have owner level access, since AI Agent Preferences needs it.

# **10\. Minutes, billing and cancellations**

## **10.1 How do AI minutes and SMS work?**

**Answer:** AI plans include a monthly minute allowance (for example 1,500 minutes). SMS usage is separate from the AI minute allowance. If a client asks for exact allowances or overage rates on their plan, confirm with the AI team rather than quoting from memory.

## **10.2 Can AI stop answering automatically once the minute limit is reached?**

**Answer:** Do not confirm this as available. Clients have asked for calls to bypass AI and fall back to the auto attendant once the allowance is used, and the request is handled case by case with the AI and billing teams.

## **10.3 A client is requesting an AI cancellation and a refund**

**What T1 does:** Capture the reason in the client’s own words, the date they first asked to cancel, whether the service is still live, and whether they have been charged since. Post it to the AI leads and copy the account CSM.

**Why the detail matters:** Delays between a cancellation request and the service actually stopping have produced the most damaging escalations in this space, including clients charged after asking to cancel. Anchoring the original request date in the ticket protects both the client and the team.

## **10.4 The client says they were charged after cancelling**

**What T1 does:** Treat this as an escalation from the first contact. Do not debate the charge or promise a refund amount. Confirm the cancellation request date, raise it to the AI leads and billing together, and set the expectation that someone will come back with a written answer.

# **11\. Multi location and multi EHR setups**

## **11.1 One practice, one phone number, two different EHRs**

**Answer:** Two different EHRs cannot sync into a single Adit location. They are set up as separate locations. With one shared number, callers get a menu (press 1 for the first location, press 2 for the second), and each location then works independently against its own EHR.

## **11.2 A multi location group wants tasks filtered to one office**

**Answer:** Requests to limit the AI task view to a single location have been raised. Capture the location they want to see and route it, rather than describing a filter that may not exist for their setup.

## **11.3 Is this EHR supported for AI Front Desk?**

**Answer:** Check the Adit Integration Rulebook before answering. Support differs by EHR and by vertical, and some combinations are sold while still in testing. When in doubt, confirm with the AI team.

# **12\. Known and recurring issues**

These come up often enough that recognising them saves time. Acknowledge the issue, capture the example, and route. Do not describe anything to a client as a known bug unless the AI team has said so on the ticket.

| Symptom | How to handle |
| :---- | :---- |
| AI states the wrong day of the week for a date | Capture the call example and route. Do not speculate on a fix date with the client. |
| Duplicate appointments from a single call | Check whether one provider runs across two operatories or columns and note it in the ticket. |
| Duplicate patient records created by AI | Capture the patient names and route to AI T2. |
| AI confirmed a cancellation that never reached the EHR | Handle as a sync issue first, capture examples. |
| Calls answered by AI outside the intended hours | Confirm the configured hours before assuming a fault. |
| AI answering when the practice believes AI is disabled | Check whether the AI number is still in the call flow. Escalate as urgent. |
| Notes posted against the wrong family member | Explain as an EHR integration limitation with shared phone numbers. |

# **13\. Phrases that work**

Use these to set expectations without over promising. Adapt to the client’s tone.

* "I have raised this with our AI team and arranged a callback within 60 minutes on this number, is that the best one to reach you?"

* "I want to make sure the right specialist calls you, so let me capture exactly what the AI said and when, and I will get this to them now."

* "Configuration changes to the AI agent are made by our AI specialists, so I will not adjust anything from here, but I will make sure they have the full picture."

* "I would rather confirm that for you than give you the wrong answer. Let me check with the AI team and come back to you today."

* "I understand this has taken longer than it should have. I am escalating it now and I will note the date you first raised it."

# **Appendix: intake checklist**

Every AI issue posted to the AI Support space should carry these fields. Missing fields are the single biggest cause of delay.

| Field | Note |
| :---- | :---- |
| Client name and practice name | Use the practice name exactly as it appears in the CRM |
| Account number | Mandatory |
| Deal stage | OB, CSM or Churn, plus the pod where relevant |
| Callback number and email | Confirm the preferred number, some contacts refuse office lines |
| Ticket number | Raise it before posting |
| Reason for contact | What the AI did, when, and for which patient |
| Expectation set | The exact promise you made, including the callback window |
| Escalation flag | State plainly if cancellation, refund or a threat to churn is involved |

