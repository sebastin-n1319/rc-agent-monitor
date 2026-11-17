**ORTHO ONLINE SCHEDULING**

Orthodontics OS Integration

*Training Manual*

Covers: Dolphin • OrthoTrac • Cloud9

Version 1.0 \| Confidential -- Internal Use Only

# About This Manual

This is a manual on how Online Scheduling (OS) works across three
orthodontic EHR systems: Dolphin, OrthoTrac, and Cloud9. Each EHR has
unique scheduling rules, availability logic, appointment handling, and
booking-link behaviour.

Understanding these differences is critical --- what works in one EHR
may cause errors, booking conflicts, or data inconsistencies in another.
Use this guide as a reference before configuring, testing, or supporting
any ortho OS integration.

# Quick-Reference Comparison (refer end of Doc for a Quick-Reference Cheat Sheet)

The table below gives you a at-a-glance view of key feature differences
across all three EHRs. Detailed explanations follow section by section.

  ---------------------------------------------------------------------------------
  **Feature / Behaviour**   **Dolphin**       **OrthoTrac**        **Cloud9**
  ------------------------- ----------------- -------------------- ----------------
  Formula For Availability  N/a               Operatory/Provider   Availabilities
  (**Default selection**)                     Hours (EHR)          in Adit

  Adit Business Hours       **Yes**           Disabled             Disabled
  option                                                           

  Availabilities in Adit    **Yes**           **Yes**              Yes (locked
  option                                                           default)

  Create Closures in Adit   **Yes**           Yes (within working  **No**
  app                                         hours)               

  Create Availabilities in  **Yes**           Yes (within working  **No**
  Adit app                                    hours)               

  Recurring                 **Yes**           **No**               **No**
  Closures/Availabilities                                          

  Move/Edit Closures &      **Yes**           **No**               **No**
  Availabilities                                                   

  Appts outside Custom      Yes (Dolphin      No (slots strictly   No (Schedule
  hours                     allows it)        enforced)            Blocks only)

  Service duration for Appt Time-based        Unit-based\          Time-based
  Types                                       (slot × units)       

  Provider shown in         **Yes**           Yes (Standard\'s     No (Cloud9 has
  Availability                                provider             no provider in
                                              association)         blocks)

  Edit Availabilities       No (read-only in  **No**               **No**
  synced from EHR           Adit)                                  

  Delete option for Appts   **Yes**           **Yes**              Cancel only

  Future booking limit      Not specified     Not specified        28 weeks

  Webforms                  Not available     Not available        Not available
  ---------------------------------------------------------------------------------

# 

# 1 \| Dolphin EHR

*Dolphin is the most flexible of the three. It supports Adit-side
availability creation, write-backs in both directions, and allows
appointments outside normal schedule-template hours.*

## 1.1 OS Configuration

  --------------------------------------------------------------------------
  **Operatory/Provider   \'Operatory/Provider Hours in EHR\' can be enabled
  Hours in EHR**         for Dolphin.
  ---------------------- ---------------------------------------------------
  **Availabilities in    \'Availabilities in Adit\' can be enabled for
  Adit**                 Dolphin.

  **Adit Business        \'Adit Business Hours\' can be enabled for Dolphin.
  Hours**                
  --------------------------------------------------------------------------

## 1.2 Availabilities

### Syncing Direction

-   Adit ↔ Dolphin: bi-directional sync and writeback is supported.

-   Availabilities created in the EHR sync into Adit. These are
    > read-only in Adit --- users cannot edit them.

-   Availabilities created in Adit can be Edited, Updated, and Deleted.

### Appointment Type Selection on Availabilities

-   EHR-synced availabilities: carry ALL Appointment Types from the
    > Appointment Class --- displayed as a comma-separated list in Adit.

-   Adit-created availabilities: only a SINGLE Appointment Type can be
    > selected. This avoids conflicting with an Appointment Class in the
    > EHR.

### Naming Convention

-   EHR-synced availabilities are named after the Appointment Class or
    > Appointment Type in the EHR.

-   Adit-created availabilities use the name entered in Adit.

### EHR Template Hours

-   Adit allows appointments, availabilities, and closures to be created
    > OUTSIDE normal Schedule Template hours.

-   Exception: Appointments, Closures or Availabilities cannot be
    > created on days where no Schedule Template is applied in the EHR

## 1.3 Appointments

-   Appointments cannot be created on days where no Schedule Template is
    > applied.

-   Appointments CAN be created in any time slot --- including outside
    > normal template working hours --- because Dolphin supports this at
    > the EHR level.

## 1.4 Booking Link --- Guardian / Responsible Party Logic

In orthodontics, the \'Guardian\' on the booking link maps to the
Responsible Party (RP) / Billing Party in the EHR. The table below
explains every scenario and what Adit does:

  -----------------------------------------------------------------------------
  **Booking   **Guardian status**  **RP        **Adit action**
  type**                           already     
                                   set?**      
  ----------- -------------------- ----------- --------------------------------
  New patient Not existing patient No RP       Add to Relationships section;
                                   exists      flag as Primary RP in EHR.
                                               Guardian is not added as
                                               patient.

  Existing    Already a patient +  Yes         No change to RP. Existing
  patient     already Primary RP               Guardian shown in Adit Patient
              for this patient                 Card family details.

  Existing    RP is SELF or        Yes         No change to existing RP. New
  patient     another RP already               Guardian added as a Relative.
              exists; Guardian is              Existing Guardian shown in Adit
              different                        Patient Card

  Existing    Already a patient    No /        Associate Guardian as Primary
  patient     but NOT the Primary  different   RP. Guardian shown in Adit
              RP for this patient              family details.

  Existing    NOT an existing      Yes         No change. No new patient
  patient     patient; already                 profile created for Guardian.
              flagged as Primary               
              RP                               
  -----------------------------------------------------------------------------

> **📌 Note:** *Patient Statuses in Ortho EHRs relate to treatment
> stages or flags leads. Most ortho practices do not have a
> \'Non-Patient\' status. Adit will NOT create a new status to avoid
> disrupting the practice\'s workflow.*

# 2 \| OrthoTrac EHR

*OrthoTrac is the most restrictive of the three. Everything revolves
around predefined Standards --- templates that define working hours,
slot duration, and provider. Adit must work strictly within these
Standards.*

## 2.1 OS Configuration

  --------------------------------------------------------------------------
  **Operatory/Provider   Operatory/Provider Hours in EHR --- pre-selected
  Hours in EHR**         and locked.
  ---------------------- ---------------------------------------------------
  **Why locked?**        Appointments cannot be written back to OrthoTrac if
                         a Standard is not available, or if the booking
                         falls outside the Standard\'s working hours.

  **Adit Business        DISABLED. Combining Provider/Operatory Hours and
  Hours**                Business Hours creates slots that may not align
                         with EHR slot structures, causing appointment time
                         discrepancies. OrthoTrac does not allow mid-slot
                         booking.

  **Availabilities in    Available and can be selected.
  Adit**                 

  **1 Standard per day   Adit OS only supports 1 Standard per day per
  rule**                 location. Practices with multiple Standards on the
                         same day/location cannot be fully managed by Adit
                         OS at this time.
  --------------------------------------------------------------------------

## 2.2 Unit-Based Appointment Duration

Unlike Dolphin and Cloud9, OrthoTrac measures appointment length in
units, not fixed minutes.

  -----------------------------------------------------------------------
  **Service           = Slot length × Number of units
  Duration**          
  ------------------- ---------------------------------------------------
  **Example**         Slot = 10 mins, Appt units = 3 units → Total
                      booking = 30 mins

  **Appointment       The Appt End time is auto-calculated and shown as
  created in Adit**   an uneditable field. Users cannot manually change
                      it.
  -----------------------------------------------------------------------

## 2.3 Availabilities & Closures

### Key Restrictions

-   Closures and Availabilities can ONLY be created within the working
    > hours of the Standard applied to that day (e.g. if Standard is
    > 9AM--5PM, Adit will only allow slots within that window).

-   Recurring Closures and Availabilities are NOT available in the Adit
    > app for OrthoTrac. Different days can have different Standards,
    > making recurrence unreliable.

-   Users can create Closure & Availabilities for any day if the
    > Standard's slots, chairs & working hours are available on that
    > day.

-   Moving or editing Closures and Availabilities is NOT supported.
    > Moving creates a new EHR_ID, breaking sync back to the EHR.

-   Only Create and Delete options are available for Closures and
    > Availabilities.

-   The Length of the Availability will be auto selected based on the
    > Appt Type selection. The end time will be uneditable.

-   For Closures, the End time is available to set as required

### Naming Convention

-   Availability created in the EHR will be synced to Adit with the name
    > of the Appointment Type or the Appt Class

-   Name of the Availability created in Adit do NOT sync to the EHR; the
    > EHR always uses the Appointment Type or Appointment Class name.

### Provider

-   The provider shown in the Availability is the provider associated
    > with the Standard --- there will always be only one option to
    > select

-   Provider list for creating Appointments is pulled from \'Schedule
    > Maintenance\'.

-   Provider list for Patient Creation is pulled from \'Staff
    > Maintenance\' (as per EHR behaviour).

## 2.4 Appointments

### Slot Snapping

OrthoTrac only allows booking on predefined Standard slot times. If a
booking is attempted mid-slot in Adit, the system snaps to the next
valid slot.

> **📌 Note:** *Example: EHR Slots = 15 mins \| Working Hours = 9AM to
> 5PM\
> Adit Slot view in Scheduler selected as 5 mins\
> If a user clicks 09:55 AM in Adit to create an Appt, the slots in the
> appointment creation window will start from 10:00 AM and show 15-min
> intervals (10:00, 10:15, 10:30\...).*

-   When creating Appointments in the Adit app, the Appt End time will
    > be default selected based on the "unit" of the Appt. This will be
    > an uneditable field. This is because the appointment duration is
    > based on units and can differ based on slots in the Standards
    > applied.

### Moving / Rescheduling Appointments

-   Appointments CAN be moved or Rescheduled within the same day or to
    > different days even if the Standards differ across the days.

-   If the slot start time on the target day is later than the original
    > appointment time, the slots will display from the target day's
    > Standard\'s start time.

-   If the Appt is being moved to another day, Only those chairs
    > available in the destination day\'s Standard will appear in the
    > chair dropdown.

### When Rescheduling is NOT Possible (Validation Errors)

  -----------------------------------------------------------------------
  **Insufficient open The full slot + units must be open. E.g. Appt has 2
  time**              units in a 15-min (Standard's) Slot interval (= 30
                      mins total). Moving to a 30-min (Standard's) Slot
                      interval requires 60 mins open.
  ------------------- ---------------------------------------------------
  **EHR closure       If there is a closure in the EHR on the target
  exists**            slot.

  **Overlapping       If another appointment already exists in the target
  appointment**       slot.

  **No Standard on    If the target date has no Standard applied.
  target date**       
  -----------------------------------------------------------------------

### Provider Update on Reschedule

When rescheduling to a different day, the provider is updated
automatically to match the provider assigned to the destination
Standard.

-   Same provider in both Standards → no change needed.

-   Different provider in destination Standard → provider is updated to
    > match.

## 2.5 Multi-Single Build (Multi-Location)

  -------------------------------------------------------------------------------
  **Cross-day rescheduling**  Enabled --- works even across different Standards.
  --------------------------- ---------------------------------------------------
  **Cross-location            Enabled within the same day across locations.
  rescheduling**              Combined schedule view shown in Adit.

  **Location differentiator** Chairs displayed as \'Location_Chair name\' based
                              on the Standard\'s location association.

  **Different slot lengths    Adit defaults to the minimum slot size of all
  across locations**          locations in the combined view.

  **Recurring                 Restricted (same as single-location OrthoTrac).
  Closures/Availabilities**   
  -------------------------------------------------------------------------------

Booking Link logic for "Guardian" in Orthotrac is identical to Dolphin
--- see Section 1.4 for the Guardian / Responsible Party table.

# 3 \| Cloud9 EHR

*Cloud9 is the most EHR-controlled of the three. Adit cannot create or
manage availabilities independently --- everything is driven by Schedule
Blocks defined inside Cloud9.*

## 3.1 OS Configuration

  --------------------------------------------------------------------------
  **Availabilities in    \'Availabilities in Adit\' --- pre-selected and
  Adit**                 locked.
  ---------------------- ---------------------------------------------------
  **Operatory/Provider   DISABLED for Cloud9.
  Hours**                

  **Adit Business        DISABLED for Cloud9.
  Hours**                

  **Why both disabled?** Adit can only book appointments within Schedule
                         Blocks created in Cloud9.
  --------------------------------------------------------------------------

## 3.2 Availabilities

-   Availabilities in Adit mirror Cloud9 Schedule Blocks exactly. Adit
    > cannot create or edit these.

-   Closures and Availabilities CANNOT be created in the Adit app for
    > Cloud9.

-   Only Schedule Blocks with \'Allow Online Scheduling\' enabled in
    > Cloud9 will sync to Adit and appear in the booking link.

-   Schedule Blocks for both \'Appointment Class\' and \'Appointment
    > Types\' sync to Adit.

-   For Appointment Class blocks: Adit shows all associated Appointment
    > Types in a comma-separated list.

-   Provider name is unavailable in Availabilities --- Cloud9 does not
    > associate providers with Schedule Blocks.

## 3.3 Appointments

### What Can Be Booked

-   Appointments can ONLY be created for Appointment Types associated
    > with Schedule Blocks where \'Allow Online Scheduling\' is enabled.

-   When creating an appointment within an Availability in Adit, only
    > Appointment Types related to that specific Availability appear in
    > the dropdown.

-   Appointments can be booked up to 28 weeks in the future.

### Editing & Deleting Appointments

-   Delete option for appointments: only allows CANCELLATION

### Out-of-Block Appointments (EHR-Created)

If an appointment is created directly in Cloud9 within a Schedule Block
using an Appointment Type NOT associated with that block, it will still
sync to Adit --- but users will not be able to edit it from the Adit
Scheduler.

> **📌 Note:** *Validation message shown: \"Unable to save changes since
> this appointment does not match the Appointment Type of the Schedule
> Block in your PMS. Please update this Appointment from your PMS.\"*

### Outside Schedule Block Booking Attempts

-   Users cannot create an appointment outside a Schedule Block

## 3.4 Booking Link --- Schedule Block Reservation Rules

  -----------------------------------------------------------------------
  **Reserve as one**  If the Schedule Block is set to \'Reserve as one\'
                      in Cloud9, the booking link restricts to a single
                      appointment in that availability.
  ------------------- ---------------------------------------------------
  **Reserve as many   If set to \'Reserve As Many As Will Fit\', the
  as will fit**       booking link allows multiple appointments (up to
                      the block's capacity).

  **Appointment Class The booking link accepts bookings for all
  blocks**            Appointment Types mapped to an Appointment Class
                      Schedule Block where \'Allow Online Scheduling\' is
                      enabled.
  -----------------------------------------------------------------------

Booking Link Guardian / Responsible Party logic for Cloud9 is identical
to Dolphin --- see Section 1.4 for the full scenario table.

# 4 \| Webforms

> **📌 Note:** *Webforms are NOT available for any Orthodontic EHR
> integration (Dolphin, OrthoTrac, or Cloud9).*

# 5 \| Quick-Reference Cheat Sheet

  ----------------------------------------------------------------------------
  **Question**                 **Dolphin**   **OrthoTrac**      **Cloud9**
  ---------------------------- ------------- ------------------ --------------
  Can users create             Yes           Yes (within        No
  availabilities in Adit?                    Standard hours     
                                             only)              

  Can users set recurring      Yes           No                 No
  availabilities?                                               

  Can users edit an EHR-synced No            No                 No
  availability?                                                 

  Is the provider shown in the Yes           Yes (Standard\'s   No
  availability?                              provider)          

  How is appointment length    By Mins       Slot × Units       By Mins
  calculated?                                                   

  Can appts be booked outside  Yes           No --- slot must   No --- block
  working hours?                             exist in Standard  must exist

  Can Appts be deleted (not    Yes           Yes                No --- cancel
  just cancelled)?                                              only

  Are webforms supported?      No            No                 No
  ----------------------------------------------------------------------------

*Adit \| Internal Training Document \| Confidential*
