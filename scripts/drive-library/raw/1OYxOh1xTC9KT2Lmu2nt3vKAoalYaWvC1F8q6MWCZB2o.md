**AI Care Coordinator (AI Recare)**

Master Doc — Internal Reference  \|  Draft for review  \|  July 2026

# List of Contents

1. Intro to AI Care Coordinator

2. How it Works — The Modular Model

3. Getting Started — 1\. Settings Reused from AI Front Desk

4. Getting Started — 2\. Service Mapping

5. Getting Started — 3\. Recall Set Up (Cloud vs On-Prem)

6. Getting Started — 4\. Outreach Schedules

7. Getting Started — 5\. Outreach Flows

8. Getting Started — 6\. Outreach Sequences (per Sequence Type)

9. Getting Started — 7\. Sequence Downtime

10. Getting Started — 8\. Outreach Settings

11. Getting Started — 9\. Blocked Numbers & Patients

12. Agent Behaviour — Sequence Lifecycle & Flow

13. Navigating AI Recare

14. Other Info — Sequence Status

15. Other Info — Step Outcome

16. Other Info — Call Analysis Fields

17. Placeholders — To Be Added

# Intro to AI Care Coordinator

AI Care Coordinator (also referred to as AI Recare or the AI Outreach Agent) is the outbound agent within the Adit AI Agent suite. While AI Front Desk handles all incoming communication to the practice and AI Web Chat engages website visitors, AI Care Coordinator plans and executes all relevant outgoing communication (calls and texts) to patients on behalf of the practice. Practices can fully customise for what, when, whom and how the agent reaches out.

Every outreach handled by the agent is fully documented, transcribed and analysed, and surfaces in the same Interactions framework used across the AI Agent suite. The agent is created per practice and per location, and updates instantly whenever preferences change.

## Terminology

* **Outreach / Step —** a single outbound call or outbound SMS sent by the agent to a patient. “Outreach” is the colloquial term; in the app it is a Step within a sequence.

* **Sequence —** the full set of steps the agent performs for a particular patient for a particular use case (e.g., an appointment marked broken, a recall coming due).

* **Sequence Type —** the kind of scenario for which the agent performs outreach. The conversations differ per type, so the agent only supports types it is fully trained on.

* **Enrolled Patient —** every patient added to a sequence. The same patient can be enrolled in different sequence types.

* **Schedule —** business-hours-like timings the agent must respect when reaching out. Multiple schedules can be created and assigned per sequence.

* **Flow —** an organised collection of steps defining which step happens on which day and via which mode (Call or SMS). Multiple flows can be created and assigned per sequence.

* **Sequence Status —** the ongoing status of an active sequence, or the final status of an ended one (full list under Other Info).

* **Step Outcome —** the result of each individual step (full list under Other Info).

## Supported Sequence Types

* **Unscheduled Broken Appointments —** the agent reaches out to patients whose appointments are marked broken / no show (and optionally cancelled) with no future appointment, to get them rescheduled.

* **Recall Due —** the agent reaches out to patients with a recall due and tries to schedule their appointment.

* **Unscheduled Treatment —** the agent reaches out to patients who have not had an appointment in a long time (e.g., 9/12/15/18 months) and tries to schedule them.

* **Unconfirmed Appointments —** the agent reaches out to patients with an upcoming appointment who have not confirmed via call or SMS, to get the appointment confirmed.

**Note:** *Payment Due (agent reaches out to patients with outstanding payments to help clear dues) appeared in earlier scoping and is on the roadmap. It is not part of the current release and is excluded from the sections below.*

# How it Works — The Modular Model

A capable outreach agent must let the practice compose exactly what the agent should do for every scenario — e.g., “if a New Patient Exam goes broken with no future appointment, call in 48 hours, then SMS, then another call in 72 hours,” or “if a Hygiene recall is due and the patient had no completed appointment in the last 6 months, follow up 2 days before the due date, 3 attempts, twice by call and once by text.”

To support every permutation, the setup is modular. Four basic elements are abstracted and then composed into Outreach Sequences:

* **Services —** the list of services the agent follows up on. Captured separately so the right patients are triggered (via treatment codes and appointment status) and so the agent has context about the service before calling. Treatment code mapping is mandatory to save a service.

* **Recall —** the recall types the agent works with, including an explanation of each recall to give the agent context. Treatment code mapping is mandatory to save a recall type.

* **Schedule / Timings —** when the agent is allowed to reach out. Different outreaches can run on different days/times (e.g., recall outreach Mon–Wed during business hours; confirmation outreach 6 days a week).

* **Flow —** the mode of outreach for each step and the gap between steps. A recall flow may have 5 steps, a broken-appointment flow 3, a confirmation flow only 1\.

## Cloud vs On-Prem EHRs — the key structural split

Where recall data comes from depends on the EHR category. This split shapes field availability, editability and layout throughout the Preferences page.

| EHR category | Recall data behaviour |
| :---- | :---- |
| On-Prem EHRs | Recall data is PULLED FROM the EHR — Recall Type, TX Code / Appointment Type, Last Completed Appt Date and Interval come from EHR records and are read-only in Adit. The only editable (and mandatory) field is the Select Service mapping. Sequence and Time are set in Adit. |
| Cloud EHRs | Recall is SET UP entirely in Adit — the practice configures Recall Type, TX Code / Appointment Type, Due Date, Interval, Sequence and Time. Adit auto-creates recalls based on treatment codes and last completed appointment dates. |

Within the 17 in-scope EHRs, two field groups exist: the TX Code group (OpenDental, Eaglesoft, Dentrix, Tracker, Cleardent, Abeldent, Crystal PM, PracticeWork, PracticeWeb) and the Appointment Type group (Officemate, Chirotouch, Eyefinity, Revolution, Jane, CT Cloud). Dentrix Ascend and Curve are the Cloud EHRs. Figma covers all four variants: Cloud with/without TX Code and On-Prem with/without TX Code.

# Getting Started — 1\. Settings Reused from AI Front Desk

AI Care Coordinator reuses most of the AI Agent setup that practices complete for AI Front Desk. If AI Front Desk is already configured, these carry over; if not, they must be completed as part of Recare onboarding. All settings are per-location.

* **Configure Agent —** Agent Name, Practice Name and Agent Voice define the identity the agent uses on outbound calls. Capabilities (Scheduling / Rescheduling / Cancellation) govern what the agent may do when a patient wants to book, move or cancel during an outreach conversation.

* **Custom Messages —** AI Disclosure applies to outbound conversations as well (default No; the agent confirms it is AI if asked directly).

* **Practice Details —** address, time zone, business hours, website, parking, directions — the agent’s knowledge of the practice when talking to patients. Several fields are pulled from Online Scheduling.

* **Booking Settings —** payment options, accepted insurances, services offered, availability settings, max booking window, cancellation/rescheduling windows and charges, price sheet, age limits, walk-ins. These govern the booking part of every outreach conversation.

* **Configure Tasks —** how AI-generated tasks are assigned. “Recare” already exists as a task type, so follow-ups generated by outreach conversations route through the same assignment options (round robin / direct / by task type / unassigned).

**Note:** *Inbound Call Settings and Inbound SMS Settings are NOT part of Recare — they are inbound-only AI Front Desk features.*

**Note:** *Eaglesoft does not support Rescheduling or Cancellation. For Eaglesoft practices both capabilities must remain off; the agent collects the request and creates a task instead.*

# Getting Started — 2\. Service Mapping

This section captures the list of services the agent will follow up on. It exists separately in Outreach Settings for two reasons: (1) to trigger the correct patients for outreach based on treatment codes and appointment status, and (2) to provide the agent context on the type of service and its details before it contacts the patient.

Mapping treatment codes is mandatory to save a service. Ideally this page will auto-populate from the services set up in Online Scheduling; that is an upcoming enhancement and may not be available in the first iteration.



*Outreach Mapping → Service Mapping — services for new and existing patients with TX codes*

# Getting Started — 3\. Recall Set Up (Cloud vs On-Prem)

## On-Prem EHRs

“Recall outreach will be done based on EHR data. Service mapping is required to activate each recall type.”

Each recall card shows Recall Type, TX Code / Appointment Type, Last Completed Appt Date and Interval as read-only fields pulled from the EHR. The only editable field is the Select Service dropdown, which is mandatory (validation: “Service Name cannot be blank”). There are no Sequence or Time fields on On-Prem cards. Go-live is blocked only when a service is not mapped; Sequence and Time can be completed in any order elsewhere.



*Recall Set Up — On-Prem: read-only EHR fields; Select Service is the only editable field*

## Cloud EHRs

The practice sets up each recall type directly in Adit: Recall Type, TX Code / Appointment Type, Due Date, Interval, Sequence and Time (before / on / after the recall date). Based on the treatment codes and last completed appointment dates, Adit auto-creates recalls for the agent. Each recall set up in Adit also carries an explanation of the recall to give the agent context. Treatment code mapping is mandatory to save a recall type.



*Recall Set Up — Cloud: recall types configured in Adit with TX codes and intervals*

**Note:** *CT Cloud and Jane calculate the recall due date from the appointment type plus the interval set in Adit; in Jane the recall type is fetched the same as the appointment type.*

# Getting Started — 4\. Outreach Schedules

Schedules define when the agent is allowed to reach out, similar to business hours. The practice can create multiple named schedules (e.g., “New Patient Broken Appt Schedule”) and use the relevant one per sequence. For example, recall outreach can be restricted to Monday–Wednesday during business hours while appointment confirmation outreach runs six days a week. Schedule name is required.



*Outreach Schedule — multiple named schedules with per-day timings*

# Getting Started — 5\. Outreach Flows

Flows define the mode of outreach for each step and the gap between steps. Each flow has a required name (e.g., “Standard Sequence Flow”) and a set of steps, each with a Day (1 to 30 days) and a Mode (Call or Text). Multiple flows can be created and assigned per sequence — e.g., a 5-step recall flow, a 3-step broken appointment flow, a 1-step confirmation flow.



*Outreach Flow — day-by-day steps with Call/SMS mode*

# Getting Started — 6\. Outreach Sequences (per Sequence Type)

With the basic elements in place, the practice composes sequences. Creating a sequence starts with two fields — Sequence Name (custom) and Sequence Type (one of the four supported types) — and the remaining fields open up based on the type selected. Any number of sequences can be created per type, so the agent can take different steps for different services, recall types or patient brackets.

Common to all sequence types:

* **Sequence Schedule and Sequence Flow —** select one of the schedules and one of the flows created earlier (required).

* **Skip if future appointment —** option to skip patients who already have a future appointment booked.

* **Engage with —** Active, Inactive, or Active and Inactive patients.

* **Additional Agent Knowledge —** optional free text for sequence-specific context (promotions, pre-treatment care etc.). If provided, Knowledge Valid Till (a date) becomes applicable; when the date is reached the knowledge resets to blank for that sequence.

* **On / Off toggle —** sequences can be temporarily turned off without deletion. Turning a sequence off deletes all future steps for all enrolled patients and updates their Sequence Status to Stopped.

## Unscheduled Broken Appointments

The practice selects the applicable appointment statuses (at least one required — e.g., whether the outreach covers only Broken/No Show or Cancelled as well), then the applicable services (multi-select, from Service Mapping), schedule and flow. The trigger defines how many hours/days after the appointment the sequence is created.

**Note:** *The statuses shown are EHR-specific. Some EHRs map cleanly to Cancelled \+ No Show/Missed; others expose their own status sets (e.g., Eaglesoft: Failed / Cancelled / Neither; Tracker: Cancelled / Office Cancel / Short Cancel / No Show / Pending / Waiting). The Preferences page displays the relevant statuses for the connected EHR.*



*Sequence — Unscheduled Broken Appointment (new patient example)*



*Sequence — Unscheduled Broken Appointment (existing patient example)*

## Recall Due

The practice selects the applicable recall types (multi-select, from Recall Set Up), then the minimum time that must have elapsed since the last completed appointment of ANY service for the patient to be considered — e.g., if a hygiene recall is due today but the patient had an emergency appointment 3 weeks ago, it may not make sense to reach out yet. The trigger defines when the sequence is created: before, on, or after the recall due date.



*Sequence — Recall Due (applicable recall types \+ recall schedule and flow)*

## Unscheduled Treatment

A more generic outreach — the only check is the time since the last completed appointment, regardless of appointment type. The trigger defines how long it must have been (e.g., 9, 12, 15 or 18 months). Multiple sequences can serve different brackets.



*Sequence — Unscheduled Treatment (months-since-last-appointment trigger)*

## Unconfirmed Appointments

The practice selects which services the agent should confirm, plus schedule and flow. The trigger defines how many hours/days before the appointment the sequence is created.



*Sequence — Unconfirmed Appointments (hours-before-appointment trigger)*

# Getting Started — 7\. Sequence Downtime

Sequence Downtime ensures the AI does not overwhelm patients by reaching out too frequently — it defines how many days must pass since the last sequence end date before a patient can be added to a new sequence (30 / 60 / 90 / 120 / 150 / 180 / 210 / 240 days).



*Sequence Downtime — minimum days between sequences for the same patient*

# Getting Started — 8\. Outreach Settings

The final Preferences screen collects cross-cutting outreach behaviour:

* **Confirm Insurance Details —** whether the agent reconfirms insurance details and collects them if missing when scheduling an appointment (recommended: Yes).

* **Call Transfer Setting —** whether the AI transfers the call to the practice if it comes across questions it can’t answer within practice business hours. Outside business hours, the agent takes a message and creates a task for the practice to follow up. An Extension Number can be provided.

* **Recare Agent Capabilities —** what kinds of calls the agent handles end-to-end: Scheduling, Rescheduling, Cancellations (Yes/No each). For other call types the agent takes a message and creates a follow-up task or transfers, based on the settings.

* **Blocked Numbers & Patients —** entry point to the blocked list (see next section).



*Outreach Settings — insurance confirmation, call transfer, Recare agent capabilities, blocked list*

# Getting Started — 9\. Blocked Numbers & Patients

The Manage modal lets the practice add a phone number or a patient to the blocked list (input \+ Add button), with type pills (Phone / Patient), the date added, a remove action per entry and a footer count. Blocked numbers and patients are permanently excluded from all outreach sequences.



*Blocked Numbers & Patients — Manage modal*

# Agent Behaviour — Sequence Lifecycle & Flow

This section covers how the outbound flow works end to end — from patient enrollment through step execution to sequence completion.

## Enrollment — how patients enter a sequence

* **Unscheduled Broken Appointments —** when an appointment reaches one of the selected broken/cancelled statuses for a mapped service and the trigger time since the appointment elapses, the patient is enrolled (unless skipped for a future appointment).

* **Recall Due —** when a patient’s recall due date approaches/passes per the before/on/after trigger for a selected recall type, and the minimum time since their last completed appointment (any service) has elapsed. Data is taken from the day the practice enrolls on AI Recare onward.

* **Unscheduled Treatment —** when the configured number of months since the patient’s last completed appointment is reached.

* **Unconfirmed Appointments —** when an upcoming appointment for a selected service remains unconfirmed at the configured hours/days before appointment time.

## How the recall due date is determined

There is generally no directly stored recall due date usable across EHRs; the due date is identified per EHR. For recall-table EHRs, the system checks the nearest future recall due date for the patient, and if none exists, the nearest past due date, then verifies no future appointment is scheduled. For EHRs without usable recall records (e.g., OpenDental-style logic), the due date is derived in priority order: (1) the original recall appointment date, where a completed appointment has the Recall flag and Recall Type; (2) the patient recall interval applied to the last completed appointment; (3) a hygiene-procedure fallback — completed appointments with hygiene codes (D1110, D1120, D4341, D4910) plus a default 6-month interval. Only one final due date is selected per patient per recall type. If a step-1 result exists, later steps are skipped.

Recall status is then determined by matching the appointment against the recall (via TX code, or stored appointment id for certain configurations): Completed, Scheduled, Unscheduled, Overdue and Scheduled, or Overdue and Unscheduled.

## Step execution

Once enrolled, the agent executes the assigned flow step by step — each step is a call or SMS on its configured day — within the time windows of the assigned schedule. Step outcomes are recorded per attempt (Answered, No Answer, Left Voicemail, Sent, Replied). During a conversation the agent behaves per the reused AI FD behaviour: it verifies the patient, works within Booking Settings, books/reschedules where capabilities allow, and creates tasks or transfers where they do not.

## What ends or interrupts a sequence

* Appointment scheduled (scheduling types) / appointment confirmed (confirmation type) — sequence ends successfully.

* Patient not interested — sequence ends.

* Call Back Later — the agent collects a callback time and the sequence restarts at that time.

* Do Not Call — patient moved to the DNC list; excluded from all future sequences unless opted back in.

* Out of Service — number unreachable; sequence ends.

* Stopped — practice stops the sequence for a patient, or turns the sequence off entirely.

* Sequence Ended — all steps completed without connecting with the patient.

# Navigating AI Recare

The module’s left navigation comprises: Home, Interactions, Outreach (Enrolled Patients, Queued Steps, Completed Steps, Patients Overview), AI Tasks, Insights and Preferences.

## Home

The Recare landing page with summary metrics and entry points into patients, steps and interactions.



*Recare Home Page*

## Interactions

Every completed outreach conversation with summary, transcript and call analysis — consistent with the AI FD interaction detail experience: call summary, patient/sequence context, Call Analysis fields, tags, notes and associated tasks.



*Interaction detail — summary, call analysis, sequence details and tasks*

## Enrolled Patients

All patients currently enrolled across sequences, with a Sequence Category chart by start date and a table of Patient, Category, Sequence Name, Service, Due Date, Start Date, Outcome, Sequence Status, Last/Next Step details, plus quick filters, saved views, CSV export and bulk actions (send message/email, update sequence result). Sequence status can only be manually updated to Stopped.



*Enrolled Patients — chart, filters and sequence table*

## Queued Steps

Upcoming steps the agent is scheduled to perform: Next Step Date & Time, Patient, Sequence Type, Outcome so far, Mode (Call/Text) and Step Number, with bulk actions.



*Queued Steps*

## Completed Steps

Steps already performed with their outcomes: a Step Outcome by Step Date chart plus a table showing Step Date and Time, Patient, Category, Sequence Name, Service, Due Date, Outcome, Sequence Result, Step Number, Attempted, Mode, Call Duration, Step Outcome and Remaining Steps.



*Completed Steps — step outcomes and history*

## Patients Overview

One record per patient showing enrollment status across all four sequence types. Columns: Patient, Category, Sequence Name, Service, Due Date, Last Appointment, Last Completed Appt/Interval, Enrollment (Enrolled / Not Enrolled / Planned), Reason, Next Step, Next Step Mode, Sequence End Date and Next Eligible Date.



*Patients Overview — one record per patient across sequence types*

## Preferences

All Getting Started sections above (service mapping, recall set up, schedules, flows, sequences, downtime, outreach settings, blocked numbers & patients).

**Note:** *An Appointments Diagnostic page is planned: every appointment with the reason AI outreach did or did not occur, using a four-bucket status taxonomy (Reached Out, Queued, Not Reaching Out, Excluded), summary metrics, filter chips and a data table with reason and suggested fix.*

# Other Info — Sequence Status

If the sequence is ongoing this shows its current status; if it has ended, its final status.

* **Yet to Reach Out —** sequence created, but no steps completed yet.

* **Reached Out —** reached out via call or SMS, no response yet.

* **Call Back Later —** patient asked to be called back later; a callback time is collected and the sequence restarts at that time.

* **Not Interested —** for scheduling sequence types, the patient is not interested now. Sequence ends.

* **Scheduled —** for scheduling sequence types, an appointment is scheduled. Sequence ends.

* **Confirmed —** for the confirmation sequence type, the appointment is confirmed. Sequence ends.

* **Do Not Call —** patient asked not to be contacted again. Moved to the DNC list and excluded from future sequences unless they opt back in or the practice moves them out.

* **Out of Service —** outreach attempted, but the number is out of service. Sequence ends.

* **Stopped —** practice manually stopped the sequence for a patient or turned the sequence off in Preferences.

* **Sequence Ended —** all steps completed but the agent could not connect with the patient.

**Note:** *Payment Collected exists as a status for the Payment Due sequence type and becomes relevant when that type ships.*

# Other Info — Step Outcome

* **Answered —** an outreach call is answered.

* **No Answer —** an outreach call is not answered and no voicemail is left.

* **Left Voicemail —** an outreach call is not answered and the agent leaves a voicemail.

* **Sent —** the agent sends an outbound SMS with no reply.

* **Replied —** the agent sends an outbound SMS and the patient replies.

# Other Info — Call Analysis Fields

Each completed outreach interaction carries six analysis data points, aligned with the AI FD taxonomy (no duplication with fields already shown on the interaction page):

| Field | Definition |
| :---- | :---- |
| Interaction Type | The category of conversation. Outreach conversations are typed Recare (practice reaching out to book because of a missed appointment, due treatment, or a long gap since the last visit) or Confirmation, consistent with the AI FD Interaction Type list. |
| Outcome | Booked / Not Booked for scheduling outreach; Resolved / Not Resolved for confirmation outreach; Cancelled where a rescheduling conversation ends in cancellation. (Expanded value set — renamed from Scheduling Status.) |
| Reason for Visit | The service discussed, converted to the practice’s allowed service list (renamed from Service). Vertical-specific values per the AI FD master list (Dental/Ortho, Opto, Chiro). |
| Reason for Not Booking | Captured when outcome is Not Booked or Cancelled. Includes Recare-specific values: Not Interested Right Now (declines without a specific callback time) and Call Back Later (explicitly names a time/day/period — vague statements do not qualify), alongside the standard values (price enquiry, slot not available, insurance not accepted, outstanding balance etc.). |
| Patient Type | New or existing patient. |
| Revenue Potential | \$ / \$\$ / \$\$\$ buckets mapped from Reason for Visit per vertical, per the AI FD master table. |

# Placeholders — To Be Added

The following sections exist in the AI Front Desk master doc and will be added here once Recare content is finalised:

* **Switch Factors —** positioning and switching arguments for AI Care Coordinator.

* **Competitor Comparison —** outbound/recare competitor landscape.

* **Possible Error Scenarios —** known issues / ticket patterns once the product is live.

* **Insights —** Recare summary metrics and reporting.

* **Appointments Diagnostic —** full spec once the page design is finalised.





































