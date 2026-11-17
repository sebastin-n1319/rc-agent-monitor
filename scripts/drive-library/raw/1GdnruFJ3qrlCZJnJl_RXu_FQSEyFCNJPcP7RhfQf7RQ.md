# AI Front Desk support per EHR (QA status)

Status of AI Front Desk scheduling, rescheduling and cancellation testing per EHR, from the AI FD EHR Master Sheet (product QA tracker). "Completed" means tested and documented; check the Integration Rulebook for what a practice can use today.

| EHR | Tested | Documented | Status | Notes |
|---|---|---|---|---|
| Eaglesoft | Yes | Yes | Completed |  |
| Dentrix | Yes | Yes | Completed |  |
| Open Dental | Yes | Yes | Completed |  |
| Crystal PM | Yes | Yes | Completed |  |
| Dentrix Ascend (client account) | Yes | Yes | Completed |  |
| Revolution | Yes | Yes | Testing done, document pending | New and existing patient booking, single cancellation, single and multiple reschedule passed |
| Eyefinity (client account) | Yes | Yes | Testing done, document pending | New and existing patient booking, single cancellation, single and multiple reschedule passed |
| Tracker | Yes | Yes | Completed |  |
| ChiroTouch (client account) | Yes | Yes | Awaiting client permission |  |
| Curve Dental (client account) | Yes | Yes | Completed |  |
| Jane Chiro (sandbox, with limitations) | Yes | Yes | Completed |  |
| ChiroTouch Cloud (client account) | Yes | Yes | Completed |  |
| PracticeWeb | Yes | Yes | Completed |  |
| PracticeWork (client account) | Yes | Yes | Completed |  |
| AbelDent (client account) | No | No | Awaiting client permission or access |  |
| ClearDent (client account) | Yes | Yes | Completed |  |
| Dolphin (client machine) | Yes | Yes | Completed |  |
| SoftDent (client machine) | No | No | Deferred |  |
| Easy Dental (client machine) | No | No | Deferred |  |
| Cloud 9 (client machine) | Yes | No | Bug fixes in progress |  |
| OfficeMate | Yes | Yes | Completed |  |
| OrthoTrac | Yes | Yes | Completed |  |
| Denticon (client machine) | Yes | Yes | Not marked |  |

# Cancel or delete when the AI Front Desk cancels an appointment

Whether a cancellation marks the appointment as cancelled or broken in the EHR, or deletes it. In Eaglesoft the AI Front Desk does not cancel or reschedule. Note: the AI Agent Master Document lists Cloud 9 among the EHRs where an appointment is marked cancelled; this sheet (updated November 2026) says Cloud 9 appointments are deleted. Check with the AI team before telling a client.

| EHR | Result of a cancellation |
|---|---|
| Open Dental | Marked cancelled or broken |
| PracticeWeb | Marked cancelled or broken |
| Eaglesoft | Appointment deleted |
| Dentrix | Appointment deleted |
| Tracker | Appointment deleted |
| ClearDent | Appointment deleted |
| AbelDent | Appointment deleted |
| PracticeWork | Marked cancelled or broken |
| Crystal PM | Marked cancelled or broken |
| OfficeMate | Appointment deleted |
| ChiroTouch | Marked cancelled or broken |
| OrthoTrac | Appointment deleted |
| Dolphin | Appointment deleted |
| Dentrix Ascend | Marked cancelled or broken |
| Curve | Marked cancelled or broken |
| Denticon | Marked cancelled or broken |
| Eyefinity | Marked cancelled or broken |
| Revolution | Marked cancelled or broken |
| Jane | Marked cancelled or broken |
| Cloud 9 | Appointment deleted |

# How availability is worked out per EHR (AI Front Desk and Online Scheduling)

Which inputs set the open slots. "Availabilities in Adit or blocks in the EHR" is used for Crystal PM and Revolution; the others use operatory or provider hours in the EHR plus the Adit app business hours. Double booking is allowed for Crystal PM, OfficeMate, ChiroTouch and Jane.

Ideal availability formula by vertical: Optometry by provider; Chiropractic by provider; Dental by operatory plus provider; Orthodontics by operatory plus provider.

Show Provider can be turned Off so callers and patients do not see provider details, but Provider Available for Booking must stay on; if it is turned off, one default provider is booked for every appointment.

Which EHR schedule settings Online Scheduling and the AI Front Desk read when they look for open slots (Yes = read). In Adit itself, Adit Availability reads: provider office hours, operatory office hours, provider custom hours, operatory custom hours, blocked out, booking allowed, appointment slot. Adit Closer reads: blocked out, booking not allowed, operatory time off, holiday.

| EHR | Provider office hours | Operatory office hours | Provider custom hours | Operatory custom hours | Block with an appointment type (availability) | Blocked out, booking allowed | Blocked out, booking not allowed | Operatory time off | Holiday | Provider time off | Appointment slot | Appointment type feature in the EHR |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Open Dental | No | No | Yes | Yes | No | Yes | Yes | No | Yes | No | No | Yes |
| PracticeWeb | No | No | Yes | Yes | No | Yes | Yes | No | Yes | No | No | Yes |
| Eaglesoft | Yes | Yes | Yes | No | No | No | Yes | Yes | Yes | No | No | Yes |
| Dentrix | Yes | Yes | Yes | Yes | No | Yes | Yes | No | Yes | No | No | Yes |
| Tracker | No | No | Yes | Yes | No | Yes | Yes | No | Yes | No | No | No |
| ClearDent | No | No | Yes | Yes | No | Yes | Yes | No | No | No | No | Yes |
| AbelDent | No | No | Yes | Yes | Yes | Yes | No | No | Yes | No | No | Yes |
| PracticeWork | No | Yes | Yes | Yes | No | Yes | No | No | No | No | No | No |
| Dentrix Ascend | Yes | No | Yes | Yes | No | Yes | No | No | Yes | No | No | No |
| Curve | Yes | Yes | No | No | No | No | Yes | No | Yes | No | No | No |
| Denticon | Yes | Yes | Yes | No | Yes | Yes | No | No | Yes | No | No | Yes |
| Crystal PM | No | No | Yes | No | Yes | Yes | No | No | No | Yes | No | Yes |
| OfficeMate | Yes | No | Yes | No | Yes | Yes | No | No | Yes | No | No | Yes |
| Revolution | Yes | No | Yes | No | Yes | Yes | No | No | No | No | Yes | Yes |
| Eyefinity | No | No | Yes | No | No | Yes | Yes | No | Yes | No | No | Yes |
| ChiroTouch | Yes | Yes | No | No | No | Yes | Yes | No | Yes | No | No | Yes |
| Jane | Yes | Yes | No | No | No | No | Yes | No | No | No | No | Yes |
| OrthoTrac | No | No | Yes | Yes | No | Yes | No | No | Yes | No | No | Yes |
| Dolphin | No | Yes | No | Yes | No | No | Yes | No | Yes | No | No | Yes |
| Cloud 9 | No | No | No | No | No | No | No | No | No | No | No | Yes |
| ChiroTouch Cloud | No | No | No | No | No | No | No | No | No | No | No | Yes |

# How often each cloud EHR syncs

From the AI FD EHR Master Sheet. NA means not available for that EHR.

| Sync | Dentrix Ascend | Curve | Denticon | Revolution | Eyefinity | Cloud 9 | Jane Chiro | ChiroTouch Cloud |
|---|---|---|---|---|---|---|---|---|
| EHR to Adit, real-time sync (Tech bundle) | Instant | Instant | NA | Instant | Instant | Instant | Instant (patients and appointments) | Instant (patients and appointments) |
| EHR to Adit, real-time sync (PA) | Instant (patients and appointments); the rest on the backup sync | Backup sync only (every 2 hours) | NA | Instant | Instant | NA | NA | Instant (patients and appointments) |
| Backup sync, PA | Twice a day |  |  | Once a day between 11 AM and 5 PM (time differs by location) | Twice a day |  |  |  |
| Backup sync, Tech bundle (both ways) | 15 min | 2 hours EHR to Adit; 5 min Adit to EHR | Every 5 min (Adit to EHR) | Once a day between 11 AM and 5 PM | Twice a day | Twice a day | Banner status 2 min; last sync time 5 min; Auto C 5 min; backup 60 min | Banner status 2 min; last sync time 5 min; Auto C 15 min; backup once a day |
| Patient Forms sync (Adit to EHR) | 5 min | 15 min | Every 15 min | Every 5 min | Every 5 min | 5 min (15 min on the customer side) | 15 min | Every 15 min |
| Online Scheduling, Scheduler and AI Front Desk appointments (Adit to EHR) | 5 min (extension); 15 min (VM) |  |  | 5 min (extension) | 5 min (extension) |  | 10 min (VM) | 5 min (VM) |
| Adit Pay sync (Adit to EHR) | 5 min | 15 min | NA | NA | NA | 5 min | 15 min | Every 15 min |
| Patient note sync (Adit to EHR) | 5 min | 15 min | Every 15 min | Every 5 min | Every 5 min | 15 min (in development) | 15 min | Every 15 min |
| Master data backup sync (providers, operatories, appointment types, insurance) | NA | NA | Once a day | Once a day between 11 AM and 5 PM | Twice a day | NA | Once a day | Every 6 hours |
| Appointment sync through backup | 15 min | 2 hours EHR to Adit; 5 min Adit to EHR | Subscription every 5 to 7 min; official API every hour | Once a day between 11 AM and 5 PM | Twice a day | Twice a day | 60 min | Every 2 hours |

# AI Front Desk call summary write-back per EHR

Whether the AI Front Desk interaction summary is written into the EHR (QA result).

| EHR | Summary syncs to the EHR | Note |
|---|---|---|
| Eaglesoft | Yes |  |
| Dentrix | Yes | Known bug: notes not syncing in the EHR |
| Open Dental | Yes |  |
| Crystal PM | Yes |  |
| Dentrix Ascend | Yes |  |
| Revolution | No | Bug: call summary not synced as communication logs |
| Eyefinity | Yes |  |
| Tracker | Yes |  |
| ChiroTouch | Yes |  |
| Curve Dental | No | Testing not started (waiting for product approval) |
| Jane Chiro | No | Bug: call summary not synced into notes |
| ChiroTouch Cloud | No | Validation pending; awaiting client permission |
| PracticeWeb | Yes |  |
| PracticeWork | No | Notes are not synced for PracticeWork |
| AbelDent | No | Awaiting client permission or access |
| ClearDent | Yes | Notes are not synced for ClearDent |
| Dolphin | Yes |  |
| SoftDent | No | Deferred |
| Easy Dental | No | Deferred |
| Cloud 9 | No | Notes in development |
| OfficeMate | Yes |  |
| OrthoTrac | No |  |
| Denticon | No |  |

# Pending or Failed appointment sync status

When an AI Front Desk or Online Scheduling appointment shows Pending or Failed.

| Case | Scenario | Status | Retry |
|---|---|---|---|
| 1 | The appointment time passed and the sync ran after it | Pending, then Failed | Retried every sync cycle, no time limit |
| 2 | Data points do not match (very rare) | Failed | No retry |
| 3 | Error from the EHR side | Failed | No retry |
