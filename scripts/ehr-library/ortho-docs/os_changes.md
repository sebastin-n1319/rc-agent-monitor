**Dolphin EHR**

Key Changes, Variations & Logic — Integration Quick Guide

**OS Configuration:**

1. `When enabling OS in Adit for Dolphin, the “Operatory/Provider Hours in EHR” will be default selected and will be an uneditable field.`   
   `This is because`   
   1. `Practices apply Schedule Templates to working days. If the Operatory/Provider Hours are not enabled, practices can inadvertently create appointments in non-working days.`

   2. `The data for Schedule Templates are stored in a separate DB table. We do not get data for days where a Schedule Template is not applied in the DB table`

2. `“Availabilities in Adit” will be available to select for Dolphin EHR`

3. `“Adit Business Hours” will be available to select for Dolphin EHR`

**[image]**

**Availabilities:**

1. `We will sync and writeback Availabilities from both Adit->Dolphin and Dolphin->Adit`

2. `We will Sync the “Appt Types” in the “Availability Class” from Dolphin to Adit (so that the Availability is created in Adit with multiple Appt Type selections). For availabilities which are synced from the EHR into Adit (created in the EHR), we will not allow users to edit these in Adit`  
   `[image]`

3. `When creating Availabilities in Adit (Editable), we will only allow a Single Select on Appt Types. This way it would avoid conflict with an Appt Class in the EHR. Edit/update/delete will be enabled for Availabilities created in Adit`  
   `[image]`

4. `Availability and Closures in Adit can be created in any slot since Dolphin allows creating availability and writebacks outside working hours. We can create Appts, Availabilities & Closures outside the normal Schedule Template Hours`  
   `[image]`

5. `We will not create Closures & Availabilities on days where Schedule Templates are not available.`  
   `Practices apply Schedule Templates to working days. We do not want Practices to inadvertently create appointments in non-working days through Adit`  
   `[image]`

6. `Availability Names in Adit: Availabilities (by Appointment Class) synced from the EHR into Adit will have the name of the Appointment Class in the EHR`  
   `[image]`

7. `For Availabilities (by Appointment Class) synced from EHR into Adit, it will contain all the Appointment Types in the Appointment Type section of Adit availabilities in a comma separated format.`  
   `[image]`

**Appointments:**

1. `We will not create Appointments on days where Schedule Templates are not available.`  
   `Practices apply Schedule Templates to working days. We do not want Practices to inadvertently create appointments in non-working days through Adit`  
   `[image]`

2. `Appointments in Adit can be created in any slot since Dolphin allows creating Appointments and writebacks outside working hours. We can create Appts, Availabilities & Closures outside the normal Schedule Template Hours`  
   `[image]`

   

 


**Orthotrac EHR**

Key Changes, Variations & Logic — Integration Quick Guide

**OS Configuration:**

1. `When enabling OS in Adit for Orthotrac, the “Operatory/Provider Hours in EHR” will be default selected and will be an uneditable field.`   
   `This is because Appts cannot be written back to Orthotrac where a Standard is not available OR beyond the working hours of a Standard.`

2. `“Availabilities in Adit” will be available to select for Orthotrac`

3. `“Adit Business Hours” option will be disabled for Orthotrac.`  
   `Reason: When both Provider/Operatory Hours and Adit Business Hours are enabled, Adit generates appointment slots based on the overlap of the two schedules. This can create booking times that do not align with the EHR's slot structure, resulting in appointment time discrepancies between what is being booked in the Booking link vs what is actually booked in the EHR. This is because Orthotrac does not allow creating Appointment mid-slot.`  
   `[image]`

4. `In Orthotrac Appointment & Service time duration will be based on units rather than fixed time. E.g. if Slot is of 10 mins and the Appt has 3 units, this will book the Appt time for 30 mins (10 x 3)`  
   `[image]`

5. `Provider list pulled from the “Schedule Maintenance” for creating Appointments. And from “Staff Maintenance" screen in Orthotrac for Patient Creation (as per EHR behaviour)`

6. `Adit OS works with 1 Standard per Day per Location. If Practices have Multiple Standards on the same day and same location, Adit OS cannot manage the Practice’s scheduling at this point`  
   `[image]`

**Availabilities:**

1. `“Closures” and “Availabilities” in Adit can be created only within the working hours of the Standard applied in the EHR on that day. Meaning, if the Standard Start and End times are 9AM-5PM, the Availabilities in Adit can be only applied within 9AM-5PM.`  
   `[image]`

2. `Creating a Recurring Closure or Availability in the Adit App will NOT be available for Orthotrac. This is because different days can have different Standards applied.`  
   `[image]`

3. `Users will be able to create Closure & Availabilities in the Adit App for any day if the slots, chairs & working hours are available to create the Closure/Availability on that day.`

4. `The Provider names in the Availability will be of the Provider associated to the Standard (only 1 option will be available)`  
   `[image]`

5. `Users cannot Move Closures and Availabilities for Orthotrac.`  
   `In Orthotrac moving a Closure or Availability creates a new EHR_ID which limits syncing it back to the EHR`

6. `The Length of the Appt will be auto selected based on the Appt Type selection. The end time will be uneditable.`  
   `[image]`

   `For Closures, the End time can be set as per choice`  
   `[image]`

7. `Users will only have a Create and a Delete option for Closures and Availabilities. Edit Option is not available`  
   `[image]`

8. **`Availability Name`** `- When an availability is created in the EHR and synced to Adit, the Availability Name in Adit will be set to the Appointment Type name. For Availabilities created in Adit, the custom Availability Name will not sync to the EHR; instead, the Availability will be created in the EHR using the Appointment Type name.`  
   `This is because Orthotrac Availabilities are named after the Appt Type selected when creating the Availability`

**Appointments:**

1. `When creating Appointments in Adit, if the Appt is being created in the middle of the EHR slot, the Appt Start time as well as slot intervals would default to the EHR slots of the Standard applied. E.g.`   
   `EHR Slots = 15 mins | Working Hours = 9AM to 5PM`  
   `Adit Slot view in Scheduler selected as 5 mins`  
   `If Appt is being created at 09:55AM - In the Appt creation window, the slots would appear as starting from 10:00AM and show an interval of 15 mins there on (10:00AM, 10:15AM, 10:30AM and so on)`  
   `This is because OrthoTrac only supports booking appointments on predefined “Standard” slots.`  
   `[image]`

2. `When creating Appointments in the Adit app, the Appt End time will be default selected based on the “unit” of the Appt. This will be an uneditable field. This is because the appointment duration is based on units and can differ based on slots in the Standards applied.`  
   `[image]`

8. `When creating Appts in the Adit app, the Provider available to select will be the default Provider associated with the Standard. This is because only 1 provider is/can be associated to an EHR Standard`

9. `Users can move / reschedule Appts in Adit within the same day as well as on different days even if the Standards are different across the days.`  
   `For days where Standards are not available in the EHR - we will show a validation message.`   
   `[image]`

10. `If Appt is being moved to another day and the start time on that day is later than appt time — e.g. Std2 starts at 10:00AM, appt is 9:30AM in Std1, the slots would appear from 10:00AM.`

11. `If The Operatory/Chair the Appt is being moved to is not available on a different day - Only the Chairs available on that day’s Standard will appear in the dropdown.`   
    `[image]`  
    

12. `Exceptions (where users will NOT be able to move/reschedule Appts) -` 

    1. **`The complete slot needs to be open`**`. If Std1 → 15 mins slot duration & Appt has 2 units, total appt length will be 30 mins. When moving Appt to Std2 where there are 30 mins slot durations, a 60 mins open time must be available to book that appointment.`  
       `If this is unavailable, we will not be able to reschedule the Appt and we will show a validation message.`  
       `[image]`

    2. **`If there is a closure in the EHR`**`, we will not be able to reschedule the Appt and we will show a validation message.`  
       `[image]`

    3. **`If there is an existing/overlapping Appt in the EHR`**`, we will not be able to reschedule the Appt and we will show a validation message.`  
       `[image]`

    4. **`Standard is not applied`** `on the target date`  
       `[image]`

13. `While rescheduling an Appt in the Adit app to a different day, we will update the provider to match the provider in the Standard the Appt is being moved to. Explanation:-`  
    `Each Standard has a provider associated with it. Although the Appts do not have a provider association in the Orthotrac UI, the provider association is available in the DB tables. While rescheduling if both standards have the same provider, no change is required. However if the provider is different in the standard the Appt is being moved into, we will update the provider to the one associated with that Std.`  
    `[image]`

**Multi-Single Build for Orthotrac EHR:**

1. `For the Multi-Single Build:`  
   1. `We will enable movement / rescheduling of Appts in Adit between the same and different days. For days where there may not be any available slot in the EHR - we will show a validation message.`  
      `Note: This will be available even if the Standards are different across the days.`  
   2. `We will enable movement / rescheduling of Appts in Adit within the same day across locations. Note: there will be a combined schedule view for multiple EHR locations in Adit.`   
      `If there are no available slots in the EHR - we will show a validation message.`  
      `Note: This will be available even if the Standards are different.`   
   3. `In case of Multi-single, we will combine the schedule of multiple locations in the EHR and the differentiator in Adit will be "Location_Chair name" (based on the Location association to the Standard)`  
   4. `In case of Multi-Single if the slots are different in 2 EHR locations, in the Adit schedular, we will default the slot view to the minimum of the multiple locations.`   
   5. `We will Restrict recurrence of Closure & Availabilities in the Adit App for Orthotrac`

 


**Cloud9 EHR**

Key Changes, Variations & Logic — Integration Quick Guide

**OS Configuration:**

1. `When enabling OS in Adit for Cloud9, the “Availabilities in Adit” will be default selected and will be an uneditable field.`

2. `“Operatory/Provider Hours in EHR” option will be disabled for Cloud9.`

3. `“Adit Business Hours” option will be disabled for Cloud9.`  
   `This is because we can only book appointments in the Schedule Blocks created in the EHR`  
   `[image]`

**Appointments:**

1. `Adit can only create appointments for Appointment Types associated with Schedule Blocks where Allow Online Scheduling is enabled in the EHR.`  
   `[image]`

2. `When creating an Appointment in an Availability in Adit, only the Appointment Types related to that Availability will show in the dropdown selection`  
   `[image]`

3. `When creating Appointment outside the EHR Schedule Blocks, Adit will show a validation message`  
   `[image]`

4. `When Editing Appts in Adit, the Delete option for appointments will only allow to cancel the Appt.`  
   `[image]`  
    

5. `If an appointment is created in the EHR within a Schedule Block using an Appointment Type that is not associated with that Schedule Block, the appointment will still sync to Adit. However, users will not be able to edit this Appt from the Adit Scheduler.`  
   `validation message -`  
   `“Unable to make changes since this appointment does not match the Appointment Type of the Schedule Block in your PMS. Please update this Appointment from your PMS”`

6. `Appointments can be created upto 28 weeks in the future`

**Availability:**

1. `Availabilities in Adit are based on Scheduled Blocks/Availabilities in the EHR.`

2. `Adit will only display Availabilities for Appointment Types associated with Schedule Blocks where “Allow Online Scheduling” is enabled in the EHR.`  
   `[image]`

3. `Closures and Availabilities cannot be created in the Adit app`

4. `Availabilities in Adit will mirror the EHR Schedule Blocks`

5. `Provider name will be unavailable in Availabilities (since Cloud9 does not have a Provider association with Block Schedules)`  
   `[image]`

6. `EHR Schedule Blocks for both “Appointment Class” as well as “Appointment Types” will sync to Adit` 

7. `For Availabilities (by Appointment Class) synced from EHR into Adit, it will contain all the Appointment Types in the Appointment Type section of Adit availabilities in a comma separated format.`  
   `[image]`

**Booking Link:**

1. `If the EHR Schedule Block has been created with "Reserve as one", Adit booking link will restrict booking multiple Appts in the Availability.`

2. `If the EHR Schedule Block has been created with "Reserve As Many As Will Fit", Adit will allow booking multiple Appts (as many permissible) in the Availability.`

3. `The Booking Link will display and accept bookings for all Appointment Types mapped to an Appointment Class Schedule Block where Allow Online Scheduling is enabled.`   
   

`______________________________________________________________________________`

**Booking Link Guardian/Resp Party Process for Ortho EHRs:**

4. `In the Booking link, the “Guardian” in case of Orthodontics is the Responsible Party / Billing Party. When collecting information from this screen in the booking link for the Resp party, we will not create a Patient profile separately, we will add this to the Relationship section of Dolphin and Flag them as the "Primary Resp Party" if a Primary Resp Party does not already exist (meaning that the booking is for a New Patient)` 

5. `If the Guardian/Resp Party is already a patient and already associated as a "Primary Resp Party" to the patient the Appt is being booked for (existing patient), there will be no change to the "Primary Resp Party". In this case, the Guardian will reflect in the family details section of the Adit Patient Card.`

6. `If the booking is for an existing Patient where the “Primary Resp Party” is SELF OR where a “Primary Resp Party” already exists, we will not change this information. Where receiving Guardian/Resp Party information from the Booking link, if the Guardian/Resp Party is different to the existing Guardian/Resp Party in the patient profile, we will associate this new Guardian/Resp Party as a Relative`

7. `If the Guardian/Resp Party is already a patient and NOT associated as a "Primary Resp Party" to the patient the Appt is being booked for, we will associate them as the "Primary Resp Party" to the patient the Appt is being booked for. In this case as well, the Guardian will reflect in the family details section of the Adit Patient Card.`

8. `If the Guardian/Resp Party is NOT an existing patient and associated as a "Primary Resp Party" to the patient the Appt is being booked for (existing patients),there will be no change to the "Primary Resp Party". We will not create a Patient profile separately for the Guardian / Resp Party.`

9. `If the Guardian/Resp Party is NOT an existing patient and NOT associated as a "Primary Resp Party" to the patient the Appt is being booked for, we will associate them as the "Primary Resp Party" to the patient the Appt is being booked for. In this case as well, we will not create a Patient profile separately for the Guardian / Resp Party.`

`Note: Patient Statuses in Ortho EHRs are used to categorize the stage of Treatment or identify Leads/follow up requirements. Most Ortho practices do not have a Non-Patient status hence we will not disrupt their workflow by creating a new status.`

**Webforms for Ortho EHRs:**

1. `Webforms are not available in Ortho`



























































