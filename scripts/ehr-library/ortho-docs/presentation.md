Ortho OS Differences
Important Document Links:
Adit_OS_Ortho_Training_Manual.docx, Ortho OS Changes in Details, Ortho OS Quick Guide.docx
This is a presentation on how Online Scheduling works across the three orthodontic EHR systems: Dolphin, Orthotrac, and Cloud9. Each EHR has unique scheduling rules, availability logic, appointment handling, and booking-link behaviour.

Understanding these differences is critical — what works in one EHR may cause errors, booking conflicts, or data inconsistencies in another. Use this guide as your reference before configuring, testing, or supporting any ortho OS integration.

Feature / Behaviour
Dolphin
OrthoTrac
Cloud9
APPOINTMENTS
Create Adit Appts on non-working days
✘
✘
✘
Create Appts outside Operatory hours
✔
✘
✘
Edit Appointment end time (in Adit)
✔
✘
✔
Move / reschedule appointments
✔
✔
✔
Delete appointments
✔
✔
✘Can Cancel Appts
Online Scheduling  Dolphin  ·  OrthoTrac  ·  Cloud9
OS Configuration  ·  Availabilities  ·  AppointmentsComparison Table

Feature / Behaviour
Dolphin
OrthoTrac
Cloud9
OS CONFIGURATION
Operatory / Provider
Hours in EHR
✔
✔
Locked default
✘
Adit Business Hours option
✔
✘
✘
Availabilities in Adit option
✔
✔
✔
Locked default
AVAILABILITIES
2 way Availability sync
✔
✔
✘
Create / Delete availabilities (Adit)
✔
✔
✘
Edit EHR-synced availabilities in Adit
✘
✘
✘
Edit Adit-created availabilities
✔
✔
✘
Move / reschedule availabilities
✔
✘
✘
Recurring availabilities in Adit
✔
✘
✘
Provider shown in availability
✔
✔
✘
Availability end time editable
✔
✘
✘

OS Configuration
Dolphin
Schedule Templates are applied to working days; templates are not stored for non-working days in the DB.
Feature / Behaviour
Dolphin
OrthoTrac
Cloud9
Formula For Availability (Default selection)
N/A
Operatory/Provider Hours (EHR)
Availabilities in Adit
Adit Business Hours option
Yes
Disabled
Disabled
Availabilities in Adit option
Yes
Yes
Yes (locked default)
Service duration type
Time-based
Unit-based (slot × units)
e.g. 10 min slot × 3 units = 30 min
Time-based
Orthotrac
Appts cannot be created in Orthotrac where a Standard is not available OR beyond the working hours of a Standard
Cloud9
we can only create appointments in the Schedule Blocks created in the EHR


Availabilities
Feature / Behaviour
Dolphin
OrthoTrac
Cloud9
Sync Direction
Bi-directional (Adit ↔ Dolphin)
Bi-directional (Adit ↔ Orthotrac)
EHR → Adit only
Create/Delete availabilities in Adit app
Yes
Also outside template hours
Yes — within Standard hours only
No
Edit EHR-synced availabilities in Adit
Read-only
Read-only
Read-only
Edit Adit-created availabilities
Create / Edit / Update / Delete
Create and Delete only
Move / Edit not supported
N/A — cannot create in Adit
Move / reschedule availabilities
Yes
No
Moving creates new EHR_ID, breaks sync
No
Recurring availabilities in Adit
Yes
No
Different days can have different Standards
No

Availabilities cont1…
Feature / Behaviour
Dolphin
OrthoTrac
Cloud9
Availability name source
EHR-synced: Appointment Class and Type name
Adit-created: uses Adit name
EHR-synced: Appointment Type name
Adit-created: uses Adit name
Mirrors Schedule Block name
Appt Types on EHR-synced Availability Class
All Appt types in the Appt Class — comma-separated list
Appointment Type name from StandardNo Appt Class in Orthotrac
All Appt types in the Appt Class — comma-separated list
Appt Types on Adit-created Availability
Single select only
Avoids conflict with EHR Appt Class
Single type (from Standard)
N/A
Provider shown in availability
Yes
Yes — Standard's provider only (1 option)
No — Cloud9 has no provider in blocks
Availability end time editable
Yes
No — auto-set from Appt Type (based on units)
Closures: end time is editable
Mirrors EHR block

Availabilities cont2…
Feature / Behaviour
Dolphin
OrthoTrac
Cloud9
EHR Schedule Blocks by Appt Class sync to Adit
Yes
N/A (No Appt Class)
Yes
"Allow Online Scheduling" flag required
No
No
Required — must be enabled on the Block for it to sync to Adit
Creating Availabilities for Non-Working days
No closures or availabilities can be created on days without a Schedule Template
User can create only if Standards/ slots / chairs are available that day
Cannot create Availabilities
Create closures in Adit app
Yes
Also outside template hours
Yes — within Standard hours only
End time is customisable
No
Move / edit closures
Yes
No
No
Recurring closures in Adit
Yes
No
No
Closures

Appointments
Feature / Behaviour
Dolphin
OrthoTrac
Cloud9
Create Appts on non-working days in Adit
No
Templates must exist on target day
No
Standard must exist on target day
No

Create Appts outside Operatory hours
Yes
Dolphin allows outside-template-hours bookings
No
Must align to predefined Standard slots
No
Must be within a Schedule Block
Slot snapping behaviour
No snapping — any slot
Snaps to next available Standard slot
e.g. 9:55 AM → displays from 10:00 AM at 15-min intervals
No snapping — any slotRestricted to EHR Schedule Blocks
Appointment end time editable in Adit
Yes
No  auto-set from unit calculation
YesIf block is available in EHR
Appt types shown when creating in availability
All types in that availability Class
Appointment Type from that availability
Only types related to that specific availability / block
Move / reschedule appointments
Yes
Yes
Even across different Standards if Standard/slots etc available
Yes
If Schedule Blocks are available

Appointments cont1…
Feature / Behaviour
Dolphin
OrthoTrac
Cloud9
Delete appointments
Yes — full delete
Yes — full delete
Cancel only
Appt created in EHR that is reserved for Another Appt Type
Syncs; editable in Adit
Syncs; editable within Standard
Syncs to Adit but NOT editable in Adit
Future booking limit
No Change
No Change
28 weeks maximum
Delete appointments
Yes — full delete
Yes — full delete
Cancel only

Other Changes
Feature / Behaviour
Dolphin
OrthoTrac
Cloud9
Guardian renamed to Guardian/Responsible Party?
Yes
Yes
Yes
Guardian/Responsible Party creates a Responsible Party in EHR
Yes
Yes
Yes
Booking Link
Feature / Behaviour
Dolphin
OrthoTrac
Cloud9
Webforms available?
No
No
No
Webforms

Thank You
Key changes, variations, and logic for Dolphin, Orthotrac, and Cloud9 integrations with Adit Online Scheduling.
Important Document Links:
Ortho OS Changes in Details, Adit_OS_Ortho_Training_Manual.docx, Ortho OS Quick Guide.docx
