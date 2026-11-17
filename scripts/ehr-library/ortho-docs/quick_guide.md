🔵 Blue rows --- standard info/defaults

🔴 Red rows --- disabled/restricted items

🟡 Amber rows --- warnings/caveats

🟢 Green rows --- allowed actions

[[Ortho OS Changes in
Details]{.underline}](https://docs.google.com/document/d/18xSTnnNoU370v30zyITHOb2lN9P8l1PnkB234oBdXnw/edit?usp=sharing),
[[Adit_OS_Ortho_Training_Manual.docx]{.underline}](https://docs.google.com/document/d/1IHLVN0lzv9UCq5CXIQ0iVgX7GrZsWX1-/edit?usp=sharing&ouid=106478461981658482233&rtpof=true&sd=true),
[[Ortho OS
Presentation]{.underline}](https://docs.google.com/presentation/d/13imos1Mo9flTTQ-MRmkDvSCbWav0sEBdQcbdMZ30TuY/edit?usp=sharing)

+-----------------------------------------------------------------------+
| **Dolphin EHR**                                                       |
|                                                                       |
| Key changes, variations & logic --- integration quick guide           |
+=======================================================================+
+-----------------------------------------------------------------------+

**OS CONFIGURATION**

  -----------------------------------------------------------------------------
  **Operatory/Provider   Available to select.
  Hours in EHR**         
  ---------------------- ------------------------------------------------------
  **Availabilities in    Available to select.
  Adit**                 

  **Adit Business        Available to select.
  Hours**                
  -----------------------------------------------------------------------------

**AVAILABILITIES**

  -------------------------------------------------------------------------
  **Sync direction** Availabilities sync and write back in both directions:
                     Adit → Dolphin and Dolphin → Adit.
  ------------------ ------------------------------------------------------
  **Availabilities   Appt Types from both the Availability "Class" & "Type"
  synced from EHR    sync from Dolphin to Adit (Appt Types in "Class"
  (Appt Types)**     appear comma-separated in the Adit Appointments Appt
                     Type section).

  **Edit EHR         For availabilities which are synced from the EHR into
  Availability in    Adit (created in the EHR), we will not allow users to
  Adit**             edit these in Adit

  **Availabilities   Availability synced from the EHR will have the same
  synced from EHR    name as the Appointment Class.\
  (Availability      For Availabilities created with Appointment Type, the
  Names)**           Appointment Type appears as the Availabilities name in
                     Adit

  **Availabilities   Adit-created Availability names do not sync to EHR;
  synced from Adit   the EHR uses the Appt Type name instead.
  to EHR             
  (Availability      
  Names)**           

  **Adit-created     Can create an Availability with only a Single Appt
  availabilities**   Type select (to avoid conflict with EHR Appointment
                     Class). Edit, update, and delete are enabled.

  **Slot             Availabilities can be created in any slot; Dolphin
  flexibility**      allows creation and writeback outside working hours.

  **No Schedule      Closures and Availabilities cannot be created on days
  Template = no      where a Schedule Template is not applied in the EHR.
  availability**     
  -------------------------------------------------------------------------

**APPOINTMENTS**

  -----------------------------------------------------------------------
  **No Schedule    Appointments in Adit can only be created on days where
  Template = no    a Schedule Template is applied in the EHR.
  appointments**   
  ---------------- ------------------------------------------------------

  -----------------------------------------------------------------------

**BOOKING LINK**

  -----------------------------------------------------------------------
  **Availability   Booking link considers both Appointment Class and
  logic**          Appointment Type.
  ---------------- ------------------------------------------------------
  **\"Guardian\" → "Guardian" Label updated for Ortho. Guardian/Resp
  \"Responsible    Party will be added to the Relationship section and
  Party\"**        flagged as Primary Resp Party. No separate patient
                   profile will be created for the Guardian/Resp party

  -----------------------------------------------------------------------

**Note:** Patient statuses in Ortho EHRs define the stage of treatment
or are used to identify leads. Most practices lack a Non-Patient status
--- no new "*Non-Patient status*" status will be created to avoid
workflow disruption.

**WEBFORMS**

  -----------------------------------------------------------------------
  **Webforms not   Webforms are not available in Ortho.
  available**      
  ---------------- ------------------------------------------------------

  -----------------------------------------------------------------------

+-----------------------------------------------------------------------+
| **Orthotrac EHR**                                                     |
|                                                                       |
| Key changes, variations & logic --- integration quick guide           |
+=======================================================================+
+-----------------------------------------------------------------------+

**OS CONFIGURATION**

+---------------+------------------------------------------------------+
| **Opera       | Auto-selected and locked. Appts cannot be written    |
| tory/Provider | back where a Standard is not available or beyond     |
| Hours in      | Standard working hours.                              |
| EHR**         |                                                      |
+===============+======================================================+
| **A           | Available to select.                                 |
| vailabilities |                                                      |
| in Adit**     |                                                      |
+---------------+------------------------------------------------------+
| **Adit        | DISABLED. Enabling both Provider Hours and Business  |
| Business      | Hours creates slot overlaps that don't align with    |
| Hours**       | EHR slot structure, causing booking time             |
|               | discrepancies. Orthotrac does not allow mid-slot     |
|               | appointments.                                        |
+---------------+------------------------------------------------------+
| **Unit-based  | Appointment and service time is based on units, not  |
| duration**    | fixed time.                                          |
|               |                                                      |
|               | > ***e.g.** 10 min slot × 3 units = 30 min           |
|               | > appointment*                                       |
+---------------+------------------------------------------------------+
| **Provider    | Provider list pulled from the "Schedule Maintenance" |
| data source** | for creating Appointments. And from "Staff           |
|               | Maintenance\" screen in Orthotrac for Patient        |
|               | Creation                                             |
+---------------+------------------------------------------------------+
| **1 Standard  | Adit OS cannot manage practices with multiple        |
| per day per   | Standards on the same day and location.              |
| location**    |                                                      |
+---------------+------------------------------------------------------+

**AVAILABILITIES**

+---------------+------------------------------------------------------+
| **\           | Closures and Availabilities can only be created      |
| Availability  | within the working hours of the Standard applied on  |
| Restriction** | that day.                                            |
|               |                                                      |
|               | > ***e.g.** Standard hours 9AM--5PM → Availabilities |
|               | > must be within 9AM--5PM*                           |
+===============+======================================================+
| **No          | Option to create a recurring Availability will not   |
| recurring     | be available; since different days can have          |
| closures/ava  | different Standards applied.                         |
| ilabilities** |                                                      |
+---------------+------------------------------------------------------+
| **Creating    | Closures and Availabilities cannot be created for    |
| Availability  | any day where the slots / chairs / working hours are |
| on different  | different in the Standard applied for the day        |
| Days**        |                                                      |
+---------------+------------------------------------------------------+
| **Moving an   | Users cannot move Closures or Availabilities. Only   |
| A             | Create and Delete are available. Moving creates a    |
| vailability** | new EHR_ID which prevents syncing back to EHR        |
+---------------+------------------------------------------------------+
| *             | EHR-synced Availabilities are named after the Appt   |
| *Availability | Type. Adit-created names do not sync to EHR; the EHR |
| naming**      | uses the Appt Type name instead.                     |
+---------------+------------------------------------------------------+

**APPOINTMENTS**

+---------------+------------------------------------------------------+
| **Creating an | Appointment start time and intervals in Adit shows   |
| Adit          | the next EHR slots                                   |
| Appointment** |                                                      |
|               | > ***e.g.** EHR = 15 min slots, Adit view = 5 min.   |
|               | > Creating at 9:55AM → slots show 10:00AM, 10:15AM,  |
|               | > 10:30AM...*                                        |
+===============+======================================================+
| **End time**  | Uneditable; auto-set based on unit count and         |
|               | Standard slot.                                       |
+---------------+------------------------------------------------------+
| **Provider**  | Defaults to the provider associated with the         |
|               | Standard (1 provider per Standard).                  |
+---------------+------------------------------------------------------+
| **R           | Allowed within the same day or to different days,    |
| escheduling** | even across different Standards. If Appt is being    |
|               | moved to another day and the start time in that day  |
|               | is later than appt time --- e.g. Std2 starts at      |
|               | 10:00AM, appt is 9:30AM in Std1, the slots would     |
|               | appear from 10:00AM. Validation is shown when no     |
|               | slots are available.                                 |
+---------------+------------------------------------------------------+
| **Reschedule  | A validation message is shown and reschedule is      |
| blocked       | blocked in any of these cases:                       |
| (validation   |                                                      |
| shown)        | -   Complete slot unavailable --- e.g. Std1 has 15   |
| when:**       |     > min slots, appt = 2 units (30 min). Moving to  |
|               |     > Std2 with 30 min slots requires 60 min open    |
|               |     > time which is unavailable                      |
|               |                                                      |
|               | -   EHR closure exists on target day.                |
|               |                                                      |
|               | -   Overlapping appointments already exist in EHR.   |
|               |                                                      |
|               | -   Target operatory/chair not present in the        |
|               |     > Standard for that day.                         |
|               |                                                      |
|               | -   Standard not applied on the target date          |
+---------------+------------------------------------------------------+
| **Provider    | If the target day's Standard has a different         |
| auto-update   | provider, provider updates in the Appointment to     |
| on            | match the Standard's provider                        |
| reschedule**  |                                                      |
+---------------+------------------------------------------------------+
| **Appointment | Upon rescheduling, the EHR cancels and recreates the |
| Modification  | appt, generating a new Appt ID each time. This can   |
| Issues**      | potentially trigger duplicate Schedule               |
|               | Confirmations.                                       |
+---------------+------------------------------------------------------+

**MULTI-SINGLE BUILD**

  -----------------------------------------------------------------------
  **Cross-day &    Supported across different days and same-day across
  cross-location   EHR locations, even with different Standards.
  reschedule**     Validation shown when no slots are available.
  ---------------- ------------------------------------------------------
  **Combined       Multiple EHR locations merged in Adit. Differentiator
  schedule view**  = Location_Chair name (based on Standard's location
                   association).

  **Slot view      When slot lengths differ across EHR locations, Adit
  default**        defaults to the minimum slot duration of the Standards
                   applied to either location

  **Recurrence     No recurring Closures or Availabilities.
  restricted**     
  -----------------------------------------------------------------------

**BOOKING LINK**

  -----------------------------------------------------------------------
  **\"Guardian\" → "Guardian" Label updated for Ortho. Guardian/Resp
  \"Responsible    Party will be added to the Relationship section and
  Party\"**        flagged as Primary Resp Party. No separate patient
                   profile will be created for the Guardian/Resp party
  ---------------- ------------------------------------------------------

  -----------------------------------------------------------------------

**Note:** Patient statuses in Ortho EHRs categorize treatment stage or
identify leads. Most practices lack a Non-Patient status --- no new
status will be created to avoid workflow disruption.

**WEBFORMS**

  -----------------------------------------------------------------------
  **Webforms not   Webforms are not available in Ortho.
  available**      
  ---------------- ------------------------------------------------------

  -----------------------------------------------------------------------

+-----------------------------------------------------------------------+
| **Cloud9 EHR**                                                        |
|                                                                       |
| Key changes, variations & logic --- integration quick guide           |
+=======================================================================+
+-----------------------------------------------------------------------+

**OS CONFIGURATION**

  -----------------------------------------------------------------------------
  **Availabilities in    Auto-selected and locked. Appointments can only be
  Adit**                 booked in Schedule Blocks created in the EHR.
  ---------------------- ------------------------------------------------------
  **Operatory/Provider   DISABLED --- appointments can only be booked in EHR
  Hours in EHR**         Schedule Blocks.

  **Adit Business        DISABLED --- appointments can only be booked in EHR
  Hours**                Schedule Blocks.
  -----------------------------------------------------------------------------

**APPOINTMENTS**

+---------------+------------------------------------------------------+
| **Schedule    | Adit can only create appointments for Appt Types     |
| Block         | associated with Schedule Blocks where "Allow Online  |
| restriction** | Scheduling" is enabled in the EHR.                   |
+===============+======================================================+
| **Delete =    | When Editing Appts in Adit, the Delete option for    |
| Cancel**      | appointments will only allow to cancel the Appt.     |
+---------------+------------------------------------------------------+
| **Appt Type   | If an appt is created in the EHR within a Schedule   |
| mismatch**    | Block using an Appt Type not associated with that    |
|               | block, the Appt will sync to Adit but will not be    |
|               | editable from the Adit Scheduler.                    |
|               |                                                      |
|               | > ***e.g.** "Unable to save changes since this       |
|               | > appointment does not match the Appointment Type of |
|               | > the Schedule Block in your PMS. Please update this |
|               | > Appointment from your PMS."*                       |
+---------------+------------------------------------------------------+
| **Range of    | Appointment can be created upto 28 weeks in the      |
| Appt          | future                                               |
| creation**    |                                                      |
+---------------+------------------------------------------------------+

**AVAILABILITIES**

  -------------------------------------------------------------------------
  **Availabilities   Adit Availabilities are based on Scheduled Blocks in
  in Adit**          the EHR
  ------------------ ------------------------------------------------------
  **Availability     Only those Availabilities where Appt Types associated
  from EHR**         with Schedule Blocks in the EHR are enabled for "Allow
                     Online Scheduling" syncs to Adit. Both Appointment
                     Class and Appointment Type schedule blocks sync to
                     Adit.

  **No create or     Closures and Availabilities cannot be created or
  edit in Adit**     edited in the Adit app.

  **No Provider in   Cloud9 does not associate providers with Block
  Adit               Schedules.
  Availabilities**   
  -------------------------------------------------------------------------

**BOOKING LINK**

  -----------------------------------------------------------------------
  **Availability   If the EHR Schedule Block is set to \"Reserve as
  set to \"Reserve one\", the booking link restricts to a single
  as one\"**       appointment in that availability.
  ---------------- ------------------------------------------------------
  **Availability   Booking link allows multiple appointments up to the
  set to \"Reserve permissible limit.
  as many as will  
  fit\"**          

  **Appointment    The booking link displays and accepts bookings for all
  Class Schedule   Appt Types mapped to an Appointment Class & Types
  Blocks**         Schedule Block where "Allow Online Scheduling" is
                   enabled.

  **\"Guardian\" → "Guardian" Label updated for Ortho. Guardian/Resp
  \"Responsible    Party will be added to the Relationship section and
  Party\"**        flagged as Primary Resp Party. No separate patient
                   profile will be created for the Guardian/Resp party
  -----------------------------------------------------------------------

**Note:** Patient statuses in Ortho EHRs categorize treatment stage or
identify leads. Most practices lack a Non-Patient status --- no new
status will be created to avoid workflow disruption.

**WEBFORMS**

  -----------------------------------------------------------------------
  **Webforms not   Webforms are not available in Ortho.
  available**      
  ---------------- ------------------------------------------------------

  -----------------------------------------------------------------------
