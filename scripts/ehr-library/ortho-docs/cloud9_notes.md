# **ð¥️ Cloud9 Notes**  

**Cloud9 EHR Scheduler & Online Scheduling**

## **Provider List**

**Where to find in Cloud9:**

Edit -\> Setup -\> Employees 

**Who should be considered as a provider?**  
Type = Doctor

## **Operatory (Chairs) List**

**Where to find in Cloud9:**

Edit -\> Setup -\> Schedule Views 

You can set up the **operatories**, **location hours** **start and end time**, and **time intervals here**

**Appointment Type List**

**Where to find in Cloud9:**

Edit -\> Setup -\> Appointment Types

  -  

  

**Procedure Codes List**

**Where to find in Cloud9:**

Edit -\> Setup -\> Codes

**Data Points to Pull for Availability Logic**

  - **\*\*Schedule: Appointments\*\***

  - **\*\*Schedule: Blockouts/Closures\*\***

  - **\*\*Schedule Templates: Operatory Working Hours\*\***  
      - Go to Edit -\> Schedule Templates
          
          - Online Article: <https://cloud9support.planetdds.com/hc/en-us/articles/21595297345179-Scheduling-Setting-up-Schedule-Templates>
          - Downloadable PDF on Schedule Templates: [Schedule Templates.pdf](https://drive.google.com/file/d/1-kwiB4lVR0RFUTnbkuosbJCiSSsgeD1l/view?usp=sharing)
      - Notes:
          
          - Each day can have a separate schedule template applied   
          - In schedule Templates, you can block out certain time frames to only accept “Appointment Types” (Single) or “Appointment Classes” (Multiple)  
  - **\*\*Important Note: Unable to Find Provider Working Hours\*\***   
      - **Don’t see any information on:**  
          - How to associate a provider to an operatory
          - How to set provider working hours
  - **\*\*Other Notes:\*\***  
      - **The Schedule has a feature where you can add “schedule notes” with start and end times. Sometimes people will use this to as a “Closure”. Right now, we won’t be syncing these notes and considering them as a closure. Instead the user needs to properly create the closure on the schedule** 
      - 
  

**Questions:**

1.  Can multiple schedule templates be assigned to the same day? 
      
    1.  I dont think so  
        This is Possible if there are multiple Schedules Views tied to the same location - We have not seen any live client examples so far however Cloud9 allows users to do this
2.  Can schedule templates be associated to any providers?
      
    1.  Don’t think so. Schedule templates are associated with a LOCATION. And Providers are also associated to a LOCATION
3.  How do you know when providers are working? 
      
    1.  ??

  

**Need To Do R\&D for Scheduling:**

  - Create/Update/Delete Appointments
  - Create/Update/Delete Blockouts
  - Create/Update/Delete Availabilities
      
      - Will availabilities only be in Adit or will we be able to create it back in Cloud9?
  - Can we pull the exact color codes from their EHR?

  
  

**CLOUD 9 RESOURCES:**

Videos: <https://cloud9support.planetdds.com/hc/en-us/categories/21590674643355-Training-Videos>

Knowledge Base:

<https://cloud9support.planetdds.com/hc/en-us/categories/21150039401755-Setup>

  

—-----------------------------------------------------------------------------

  

**Orthotrac**

## **Provider List | Standard List | Chairs (at Location level)**

**Where to find in Orthotrac:** **  
****Schedule Maintenance -\>** 

  

## **Time unit | Slot**

**Where to find in Orthotrac:** **  
****Available in a Standard (****add SS****)**

  

## **Multiple Standards in the same Day**

**What is the use case for Multiple Standards applied to the same day?****  
**In OrthoTrac, a Standard is essentially a block schedule that defines how appointment slots are structured—such as appointment types, chair allocation, time units, and doctor time for a portion of the day.   
Orthodontic clinics often run different types of appointment blocks within the same day, also practices may have multiple Providers or Services and may apply individual Standards for each Provider or Types of Service.

**Example of Multiple Standards-\>** 

  

**How to Set up Multiple Standards-\>** 

  - When applying a Std to a day, there are 3 fields that need to be selected -\> Office. Std, Provider
  - When applying Multiple Stds to a day, users need to change the Office, the office should be different to the office in the other Stds (even if the Std and Provider is the same)
  - For each Std, users can set it up to be a different Office, different Standard & different Provider. Users can also create multiple Standards with a different Office, same Standard & same Provider

**Can I associate a Provider to an Appointment-\>** **  
**No, Orthotrac does not have a way to associate a Provider while creating an Appt. However, if an Appointment is created in a Std, the Provider associated with that Std for the Day will reflect in Reports as a Provider for the Appt.  

  

**What information can be added while creating an Appointment from within the EHR Std?****  
**The Date of Appt, Time, number of units (if slots are 10 mins each, 4 units mean a total of 40 mins), Appt Type & Procedure codes can be added while creating an Appt in the EHR.  

  

**Patient to Provider Association-\>** **  
**Associating a Provider/Doctor to a Patient is a mandatory step while creating New Patients. The masterlist of Providers associated to a Patient pulls from the Staff Maintenance screen.   

**This is different to the Provider masterlist available in the Scheduled Maintenance screen when Associating a Standard to a Provider on a Day**

  

**How does availability reflect if the same Std is applied twice on the same day with the same Provider and an Appt is created in one of the Standards?****  
**The Appts booked in one Std does not Block time in another Std. Meaning if 10AM - 11AM is booked in Std1, this will not block this slot in Std2 even if the Provider is the same in both Standards.  
E.g.  
Std Name - SchedulingStd  
Office Name - Adit Loc A  

Std Name - SchedulingStd  
Office Name - Adit Loc B  

  
  

## **Other Notes:**

**How can we show Availability with Standards (same Location)?****  
****For New Patients:****  
**If only 1 Std: Show availability based on Services to Operatory mapping  
  
If Multiple Stds with different Providers: Show availability based on Services to Operatory mapping to Provider mapping (if multiple providers associated to the same service in Adit, show availabilities based on available slots for any  provider in any of the Multiple Standards - catering to that service)  
  
If Multiple Stds with same Providers: (need to understand use case from Carter Ortho) -   
Show availability based on Services to Operatory mapping Only. We will not be able to read the Provider data since the Stds for the day would reflect the same Provider across all Stds**  
****  
****For Existing Patients:****  
**Pull provider mapped to the Patient. (need to understand use case of mapping Provider to Patient)  
This will need a Status Mapping in Adit between Schedule Maintenance Providers and Staff Maintenance Providers  
  
If only 1 Std: Show availability based on Services to Operatory mapping  
  
If Multiple Stds with different Providers: Show availability based on Services to Operatory mapping to Provider mapping (show availability of only the Provider associated to the Patient)

If Multiple Stds with same Providers:  
Show availability based on Services to Operatory mapping Only. We will not be able to read the Provider data since the Stds for the day would reflect the same Provider across all Stds**  
  
**

**How can we show the schedule when Multiple Stds applied?****  
****TBD:** **  
**Should we pull all Operatories from all Standards and show a combined Schedule?

**How will Availabilities in Adit work?****  
**Limit the Start & End time and Chairs to match the Standard for the day. Adit availabilities cannot be created beyond what is in the Standard for the day.

**How will Adit Business hours work****  
**We will need to disable the Adit Business hours since we cannot write back into a Standard if the Chair for the Service does not exist in a Day’s Std

**How will Booking link writeback to the correct Std work****  
**Associate Operatory to Std in the backend -\> Services Mapped to Operatories will writeback to the correct Std

  

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

  

**Cloud9 Key OS Changes / Variations / Logic:**

1.  The API available to pull Availability / Open slots is "*GetOnlineReservations*". "*This returns a list of appointments available for scheduling based on an office's schedule templates.*"  
      
2.  What this actually returns are Schedule Blocks where "Allow Online Scheduling" is enabled. This means that if there are open slots where practices have not applied schedule blocks or for that matter where schedule blocks are applied however "Allow Online Scheduling" is disabled, we would not have visibility into those.  
      
3.  Impact on Adit OS functionality -
      
    1.  This means we cannot read (or writeback into) Open time OR any Schedule Blocks where "Allow Online Scheduling" option is disabled, Note: APIs to writeback Appts only apply to Schedule blocks.
    2.  This also means Adit Availabilities cannot be created 
    3.  Booking link Availabilities would only show Schedule Blocks where "Allow Online Scheduling" option is enabled, 
    4.  We cannot writeback Appointments into any slots which are outside the Schedule Block, 
    5.  Not all practices strictly follow or follow at all the Block Schedules, meaning impact on adoption.  
          
4.  Workaround Solution: Practices can create Block Schedules with Appointment Class (parent) and associate multiple Appt Types (child) to it.   
      
5.  **\*\*Adit side changes:\*\***  
    1.  Closures and Availabilities cannot be created in the Adit app
    2.  Adit Availabilities will mirror the EHR Schedule Blocks
    3.  Availabilities can still be viewed in Adit (but not editable)
    4.  Provider will not be available in availability in Adit (since C9 (APIs) does not have a Provider associated with Block Schedules
    5.  Adit will read "***Reserve as one***" restriction for a Schedule Block in the EHR. In such cases, Adit booking link will restrict booking multiple Appts (since the EHR will only allow a single Appt in the Schedule Block)
    6.  In EHR Schedule Blocks, if "***Reserve As Many As Will Fit***" is enabled, Adit will allow booking multiple Appts (as many permissible) in the Block Schedule.
    7.  Appointment writeback will only be available in C9 Schedule Blocks where "Allow Online Scheduling" option is enabled
    8.  We will be reading “Appt Class” Schedule Blocks. Appt Class can contain multiple Appt types. E.g. Schedule Block for Exams can contain Appt Types such as NP Consults, Adult Exams, Child Exam etc.
    9.  The booking link will accept booking for all Appt types / services which are associated to an Appt class schedule block (where "Allow Online Scheduling" option is enabled)  
          
6.  **\*\*Appointments in Adit:\*\***  
    1.  When Editing Appts in Adit, the Delete option for appointments will only allow to cancel the Appt (Mark as Cancelled option only will be available) instead of both Delete & Cancel. This is because there is no API available to delete the Appt. Also users cannot delete an Appt from the C9 UI.
    2.  if an Appt in EHR is created with an Appt Type which is not associated to the Block Schedule for Appt Class or Appt Type -   
        Adit will still sync this Appt, however users will not be able to edit this Appt from the Adit Scheduler.
7.  Sx
8.  Sad
9.    

  

**Booking Link:**

Guardian in case of Orthodontics is the Responsible Party / Billing Party. When collecting information from this screen in the booking link for the Resp party, we will not create a Patient profile separately, we will add this to the Relationship section of Cloud9 and Flag them as the "Primary Resp Party" if a Primary Resp Party does not already exist (meaning that the booking is for a New Patient) 

  - If the Guardian/Resp Party is already a patient and already associated as a "Primary Resp Party" to the patient the Appt is being booked for (existing patient), there will be no change to the "Primary Resp Party". In this case, the Guardian will reflect in the family details section of the Adit Patient Card.  
      
  - If the booking is for an existing Patient where the “Primary Resp Party” is SELF OR where a “Primary Resp Party” already exists, we will not change this information. Where receiving Guardian/Resp Party information from the Booking link, if the Guardian/Resp Party is different to the existing Guardian/Resp Party in the patient profile, we will associate this new Guardian/Resp Party as a Relative  
      
  - If the Guardian/Resp Party is already a patient and NOT associated as a "Primary Resp Party" to the patient the Appt is being booked for, we will associate them as the "Primary Resp Party" to the patient the Appt is being booked for. In this case as well, the Guardian will reflect in the family details section of the Adit Patient Card.  
      
  - If the Guardian/Resp Party is NOT an existing patient and associated as a "Primary Resp Party" to the patient the Appt is being booked for (existing patients),there will be no change to the "Primary Resp Party". We will not create a Patient profile separately for the Guardian / Resp Party.  
      
  - If the Guardian/Resp Party is NOT an existing patient and NOT associated as a "Primary Resp Party" to the patient the Appt is being booked for, we will associate them as the "Primary Resp Party" to the patient the Appt is being booked for. In this case as well, we will not create a Patient profile separately for the Guardian / Resp Party.  
      

Note:   
Patient Statuses in Ortho EHRs are used to categorize the stage of Treatment or identify Leads/follow up requirements. Most Ortho practices do not have a Non-Patient status hence we will not disrupt their workflow by creating a new status.

  
  
  

Provider will not be available in availability in Adit

  

**Appointment in Adit -** 

Delete option in Adit Appt - can only cancel instead of Delete (Mark as Cancelled option only will be available)  

  

**if Appt in a Schedule Block is not created within Appt Class/Type in the EHR -** 

We will sync the Appt however not allow Edit (since we don't have APIs to writeback Appts which do not belong to the Class/Type in the Schedule Block). When editing the Appt, On save - need design to disallow changing the appt. Add validation -  
“Unable to save changes since this appointment does not match the Appointment Type of the Schedule Block in your PMS. Please update this Appointment from your PMS”  

**  
****Webforms will not be available in C9 -** 

Webforms work on the logic of “Operatory/Provider Hours” AND “Adit App Business Hours”. This means the availability in the webform would show the overlapping hours of the two.  
In Cloud9, we are only showing availability from the “Availabilities in Adit/Blocks in EHR”.  
Which means, the webforms cannot pull the available hours based on only the Schedule blocks in the EHR & will not work for the purposes intended.   
The Cloud9 integration will not offer Webforms.

  

# **Cloud9 Official Integration Migration Plan**

## **Objective**

Minimize client disruption and validate system stability before a full-scale rollout.  
Cloud9 does not provide a staging environment. As a result:

  - CRM functionality must be tested using live client data (in the QA environment)
  - Client data will be synced into Adit's QA environment to validate both read and write-back capabilities (initial sync will be done through the existing process)
  - We will get the Client authorization forms signed before migration testing in Adit QA account

-----

# **Step 1: Pilot Testing (QA Environment)**

### **Pilot Client = Bernstein Ortho**

### **Objectives**

  - Validate the Official Cloud9 Integration end-to-end.
  - **\*\*Execute CRM functionality testing.\*\***
  - Verify data sync accuracy.
  - Confirm read and write-back capabilities.
  - Identify any migration-related issues before production rollout.

### **Process**

1.  Get the Cloud9 authorization form signed by Bernstein Ortho
2.  Sync & Configure the Official Cloud9 API build in Adit QA Env.
3.  Execute CRM testing as well as API integration validation.
4.  Monitor performance and sync consistency for **1 week**.

If no issues are found we move to Step 2.

-----

# **Step 2: Live/Production Environment Tests**

### **Clients = Bernstein Ortho + Uptown Ortho + 2 additional Cloud9 clients (include 1 Multiple Location client)**

### **Objectives**

  - Validate the Official Integration in a live production environment.
  - Confirm migration process and operational stability.
  - **\*\*Verify scalability beyond a single Location\*\***

### **Process**

1.  Get the signed Cloud9 Authorization Forms from these clients
2.  Send the authorization forms to Cloud9 to establish API connections.
3.  Migrate participating clients to the Official Integration (in production/live Env)
4.  Continue monitoring for **1 week** in production.

If no issues are found we move to Step 3.

-----

# **Step 3: General Migration Rollout**

Following successful completion of the pilot phases, clients will be migrated in batches.

## **Batch 1 –** 

  - Non-VIP clients
  - Single location practices
  - Multiple location practices

### **Objectives**

  - Migrate lower-risk accounts first.
  - Refine migration procedures

-----

## **Batch 2 – VIP / KOL Clients**

  - Key Opinion Leaders (KOLs)
  - VIP Accounts
  - Strategic Customers

-----

# **Step 4: Multi-Single Migration Rollout**

Multi-Single Official Integration Build Release ETA is **June 26th**

### **Migration Strategy**

The Multi-Single migration will follow the same phased approach:

#### **Batch 1**

  - Non-VIP Multi-Single clients

#### **Batch 2**

  - VIP / KOL Multi-Single clients

-----

# **Migration Logistics**

  - Initial syncs can be performed outside practice business hours, Weekend only migrations are not required.

<!-- end list -->

  - Existing clients will be migrated into their current Adit locations (No new Adit location creation is required)

<!-- end list -->

  - Multi-Single migrations will begin after the Official Integration Multi-Single build is ready
  - Chrome Extensions will not be needed.
  - Engineering will build APIs/processes to disable Extension-based syncing during migrations

Provide a **rollback plan** - what happens if a migrated client experiences any critical issues within the 1st week of Migration.   
Also, Engineering will need to confirm if switching from the Chrome Extension to the Official Integration create data conflicts

  
**  
**

# **ð¬ Dolphin Notes**  

**Dolphin EHR Scheduler & Online Scheduling**

**Provider List**

**Where to find:**

Edit -\> Practice -\> Employees

Employee Type = Provider

  

**Operatory (Chairs) List**

**Where to find:**

Edit -\> Practice -\> Locations 

Schedule Columns = How Many Chairs will be created for the location

Start and End Time = The Locations Business Hours

Slot Unites = The intervals that will be shown on the schedule 

**Appointment Type List**

**Where to find in Dolphin:**

Edit -\> Scheduling -\> Appt Types

**Page 863:** [**Dolphin Management User Guide (1).PDF**](https://drive.google.com/file/d/147Rh_M60qVvYIu7X0Urghhr9bbnejwPp/view?usp=sharing)

**Appointment Status L**[**Dolphin Management User Guide (1).PDF**](https://drive.google.com/file/d/147Rh_M60qVvYIu7X0Urghhr9bbnejwPp/view?usp=sharing)**ist**

**Where to find in Dolphin:**

Edit -\> Scheduling -\> Appt Statuses

**Procedure Codes List**

**Where to find:**

Edit -\> Financial -\> Code Types 

  

**Data Points to Pull for Availability Logic**

  - **\*\*Schedule: Appointments\*\***

  

  - **\*\*Schedule: Blockouts/Closures\*\***

Dolphin has a feature where users can create “Day Notes” on the schedule 

Some practices might use this to block out time, but as of right now, we wouldn’t consider that as a closure or show it on our adit schedule 

Refer to Page 178: [Dolphin Management User Guide (1).PDF](https://drive.google.com/file/d/147Rh_M60qVvYIu7X0Urghhr9bbnejwPp/view?usp=sharing)  

  - **\*\*Schedule Templates: Operatory & Provider Working Hours\*\***

**Scheduling -\> Edit -\> Schedule Templates**

Page 1105 [Dolphin Management User Guide (1).PDF](https://drive.google.com/file/d/147Rh_M60qVvYIu7X0Urghhr9bbnejwPp/view?usp=sharing)

  - You can do the following in schedule templates:
      
      - Rename Chairs

  - Create Closures
  - Create Available Times  
  - Associate Providers to Certain Time Slots

<!-- end list -->

  - 
      
      - Create “Blocks” to only accept certain appointment “Classes”(Multiple) or “Types” (Single)

  - Notes:
      
      - Each day can have a separate schedule template applied 

  

  
  

**Need To Do R\&D for Scheduling:**

  - Create/Update/Delete Appointments
  - Create/Update/Delete Blockouts
  - Create/Update/Delete Availabilities
      
      - Dolphin has the ability to “reserve time” (block scheduling) is this something adit will be able to write back? 
  - Can we pull the exact color codes from their EHR?

  

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

  

**Dolphin Key OS Changes / Variations / Logic:****  
  
**

1.  **Availability**  
    Dolphin Availabilities/Schedule blocks can be created with both an Appointment Class (parent) as well as an Appointment Type (child). Since Adit Availabilities can only be created with Appt Types (& can be multi-selected), there will be an issue when writing back from Adit to EHR if Adit Availabilities are created with multiple Appointment Types which do not fall under any Appointment Class in Dolphin.  
    As a solution, we will:
      
    1.  We will sync and writeback Availabilities from both Adit-\>Dolphin and Dolphin-\>Adit
    2.  We will Sync the “Appt Types” in the “Availability Class” from Dolphin to Adit (*so that the Availability is created in Adit with multiple Appt Type sections*), however we will **Not** allow “Edit” in those availabilities
    3.  When creating Availabilities in Adit (**Editable**), we will only allow a Single Select on Appt Types. This way it would avoid conflict with an Appt Class in the EHR.   
        Edit/update/delete will be enabled for Availabilities created in Adit  
          
2.  For availabilities which are synced from the EHR into Adit (created in the EHR), we will not allow users to edit these in Adit (same reason as point 1). We will need a validation message saying - "Adit cannot change Schedule Blocks that have been created in your PMS"  
      
3.  Availability in Adit can be created in any slot since Dolphin allows creating availabilities and writebacks  
      
4.  We cannot create Appt, Closures, Availabilities in days where Schedule Templates are not available (since data for Schedule Templates are stored in a separate table which is being passed to the front end team. Days where Schedule Template are not created does not have this data in this table) If an availability is being created in a Non-Working day, we do not have a way to write that back into the EHR if a template is not applied to the day.  
      
5.  We can create Appts & Availabilities outside the normal Schedule Template Hours  
      
6.  Availability Names: Availabilities (Class) synced from EHR will contain the name of the 1st Availability  
      
7.  Availability Types: For Availabilities (Class) synced from EHR will contain the names of the Appt Type in the Appt Type section of Adit availabilities (comma separated).  
      
8.  Appointments and Availabilities can only be created where a Schedule Template is applied in the EHR  
      
9.  We will show availability in the booking link for a Schedule Block for both Appt Class & Appt Type   
      
10. **If show Provider’s are selected in Adit, there needs to be an association of a Provider in the Appointment Class or Appointment Type in Dolphin for Adit to be able to show the Provider availability in the Booking link.** **  
    ****Since users in Dolphin cannot associate a Provider to an Appointment Class or an Appointment Type when creating an Availability inside Dolphin, the Booking link in Adit will not show any available times if the user decides to show Providers and Map providers to services/operatories in Adit. This is because the booking link will look for those specific Provider slots that has been mapped in the Adit app to services/operatories.**  
      
11. When writing back into a Schedule Block, we will only write back appointments for Appt Types that are associated to the schedule block, meaning associated to the Appt Class or the Appt Type  
      
12. Availabilities can be created in Adit within the working hour of the Schedule Layout  
      
13. Appointments can be created from Adit to EHR in days where a Schedule Template is not applied in the EHR. This is currently not available.  
    In development.

  

**Booking Link:**

Guardian in case of Orthodontics is the Responsible Party / Billing Party. When collecting information from this screen in the booking link for the Resp party, we will not create a Patient profile separately, we will add this to the Relationship section of Dolphin and Flag them as the "Primary Resp Party" if a Primary Resp Party does not already exist (meaning that the booking is for a New Patient) 

  - If the Guardian/Resp Party is already a patient and already associated as a "Primary Resp Party" to the patient the Appt is being booked for (existing patient), there will be no change to the "Primary Resp Party". In this case, the Guardian will reflect in the family details section of the Adit Patient Card.  
      
  - If the booking is for an existing Patient where the “Primary Resp Party” is SELF OR where a “Primary Resp Party” already exists, we will not change this information. Where receiving Guardian/Resp Party information from the Booking link, if the Guardian/Resp Party is different to the existing Guardian/Resp Party in the patient profile, we will associate this new Guardian/Resp Party as a Relative  
      
  - If the Guardian/Resp Party is already a patient and NOT associated as a "Primary Resp Party" to the patient the Appt is being booked for, we will associate them as the "Primary Resp Party" to the patient the Appt is being booked for. In this case as well, the Guardian will reflect in the family details section of the Adit Patient Card.  
      
  - If the Guardian/Resp Party is NOT an existing patient and associated as a "Primary Resp Party" to the patient the Appt is being booked for (existing patients),there will be no change to the "Primary Resp Party". We will not create a Patient profile separately for the Guardian / Resp Party.  
      
  - If the Guardian/Resp Party is NOT an existing patient and NOT associated as a "Primary Resp Party" to the patient the Appt is being booked for, we will associate them as the "Primary Resp Party" to the patient the Appt is being booked for. In this case as well, we will not create a Patient profile separately for the Guardian / Resp Party.  
      

Note:   
Patient Statuses in Ortho EHRs are used to categorize the stage of Treatment or identify Leads/follow up requirements. Most Ortho practices do not have a Non-Patient status hence we will not disrupt their workflow by creating a new status.

  
  
  

1.  The EHR behavior (for Appointments, Availabilities & Closures created outside working hours of the Schedule Template) is to show the Appointments/Availabilities/Closures in the 1st or the last slot of the day (depending on when the Appt has been created - before the day start or after the day end).  
    With this discovery, we would need to restrict creation of Appointments, Availabilities & Closures in the Adit App to within the EHR Schedule Template's working hours.  
    [Asana](https://app.asana.com/1/7153196700226/project/1211201621881831/task/1216076192515519?focus=true)  
      
2.    
3.    

  
**  
**

# **Orthotrac**  

**Orthotrac**

## **Provider List | Standard List | Chairs (at Location level)**

**Where to find in Orthotrac:** **  
****Schedule Maintenance -\>** 

  

## **Time unit | Slot**

**Where to find in Orthotrac:** **  
****Available in a Standard (****add SS****)**

  

## **Multiple Standards in the same Day**

**What is the use case for Multiple Standards applied to the same day?****  
**In OrthoTrac, a Standard is essentially a block schedule that defines how appointment slots are structured—such as appointment types, chair allocation, time units, and doctor time for a portion of the day.   
Orthodontic clinics often run different types of appointment blocks within the same day, also practices may have multiple Providers or Services and may apply individual Standards for each Provider or Types of Service.

**Example of Multiple Standards-\>** 

  

**How to Set up Multiple Standards-\>** 

  - When applying a Std to a day, there are 3 fields that need to be selected -\> Office. Std, Provider
  - When applying Multiple Stds to a day, users need to change the Office, the office should be different to the office in the other Stds (even if the Std and Provider is the same)
  - For each Std, users can set it up to be a different Office, different Standard & different Provider. Users can also create multiple Standards with a different Office, same Standard & same Provider

**Can I associate a Provider to an Appointment-\>** **  
**No, Orthotrac does not have a way to associate a Provider while creating an Appt. However, if an Appointment is created in a Std, the Provider associated with that Std for the Day will reflect in Reports as a Provider for the Appt.  

  

**What information can be added while creating an Appointment from within the EHR Std?****  
**The Date of Appt, Time, number of units (if slots are 10 mins each, 4 units mean a total of 40 mins), Appt Type & Procedure codes can be added while creating an Appt in the EHR.  

  

**Patient to Provider Association-\>** **  
**Associating a Provider/Doctor to a Patient is a mandatory step while creating New Patients. The masterlist of Providers associated to a Patient pulls from the Staff Maintenance screen.   

**This is different to the Provider masterlist available in the Scheduled Maintenance screen when Associating a Standard to a Provider on a Day**

  

**How does availability reflect if the same Std is applied twice on the same day with the same Provider and an Appt is created in one of the Standards?****  
**The Appts booked in one Std does not Block time in another Std. Meaning if 10AM - 11AM is booked in Std1, this will not block this slot in Std2 even if the Provider is the same in both Standards.  
E.g.  
Std Name - SchedulingStd  
Office Name - Adit Loc A  

Std Name - SchedulingStd  
Office Name - Adit Loc B  

  
  

## **Other Notes:**

**How can we show Availability with Standards (same Location)?****  
****For New Patients:****  
**If only 1 Std: Show availability based on Services to Operatory mapping  
  
If Multiple Stds with different Providers: Show availability based on Services to Operatory mapping to Provider mapping (if multiple providers associated to the same service in Adit, show availabilities based on available slots for any  provider in any of the Multiple Standards - catering to that service)  
  
If Multiple Stds with same Providers: (need to understand use case from Carter Ortho) -   
Show availability based on Services to Operatory mapping Only. We will not be able to read the Provider data since the Stds for the day would reflect the same Provider across all Stds**  
  
**

  - **  
    **
  - **\*\*Practice has multiple standards and they’re all tied to one provider in EHR, however they actually do have 3 different providers working in their office\*\***  
      - **\*\*What do we do to address this? - We should train this practice to associate their standards correctly to different providers\*\*** 
  - **\*\*Practice has multiple standards and they’re tied to one provider\*\***  
      - **\*\*NO OVERLAPPING HOURS\*\***
      - **\*\*Use case: one standard is focused on braces in the morning, another standard is focused on debonding in the afternoon.\*\*** 
      - **\*\*What do we do?\*\*** 
  - **\*\*Practice has multiple standards and they’re tied to one provider\*\***  
      - **\*\*OVERLAPPING HOURS\*\***
      - **\*\*Use case: one standard is created 8am to 5pm and is focused on “new patient exams” and even though its TIED to the orthodontist in ehr, we know the tx coordinator is the one that sees these patients\*\***  
          - **\*\*Second standard is created 8am to 5pm and any other ortho services are offered and is tied to the ortho\*\***
          - **\*\*The ortho will then jump between rooms to handle both\*\*** 
      - **\*\*What do we do?\*\***   
          - **  
            **
      -  

**  
****For Existing Patients:****  
**Pull provider mapped to the Patient. (need to understand use case of mapping Provider to Patient)  
This will need a Status Mapping in Adit between Schedule Maintenance Providers and Staff Maintenance Providers  
  
If only 1 Std: Show availability based on Services to Operatory mapping  
  
If Multiple Stds with different Providers: Show availability based on Services to Operatory mapping to Provider mapping (show availability of only the Provider associated to the Patient)

If Multiple Stds with same Providers:  
Show availability based on Services to Operatory mapping Only. We will not be able to read the Provider data since the Stds for the day would reflect the same Provider across all Stds**  
  
**

**How can we show the schedule when Multiple Stds applied?****  
****TBD:** **  
**Should we pull all Operatories from all Standards and show a combined Schedule?

**How will Availabilities in Adit work?****  
**Limit the Start & End time and Chairs to match the Standard for the day. Adit availabilities cannot be created beyond what is in the Standard for the day.

**How will Adit Business hours work****  
**We will need to disable the Adit Business hours since we cannot write back into a Standard if the Chair for the Service does not exist in a Day’s Std

**How will Booking link writeback to the correct Std work****  
**Associate Operatory to Std in the backend -\> Services Mapped to Operatories will writeback to the correct Std

  

Multiple Standard on the same day with 

  

  

  
  

  

  - Build for 1 Standard only (MVP) and phase2 for multiple standards -   
      
  - Restricted Availability to Standard (hours & Chairs) -   
    Recurrence options in Availability might need to be disabled or will need to be available for the duration of Standards that Adit reads from the EHR - **We can read the Standards data in the EHR for the entire duration of the calendar**  
      
  - Adit Business Hours - Its a AND formula \>  
    Default enable the EHR hours and don't allow to deselect (Grey out with Tooltip - the exiting design)  
      
  - For both EHR & Availability - for grey slot or hours outside the Standard -  
    “*You cannot create availabilities outside of your available hours*”  
      
  - Provider to Operatory association - The same Standard can be associated with different Providers on different days, in which case, the Provider to Operatory association in Adit will conflict. E,g,   
    Monday STD1 applied, Provider1 applied  
    Tuesday STD1 applied, Provider2 applied  
      
    If Provider 1 is associated to Chair1 in Adit OS Scheduling page \> the availability in the booking link will not show for Tuesday in Chair1  
      
      
  - Work on changes to the Pop out -   

Every time an Appt is being booked in a blocked out slot, there is a pop-out asking   
“*The Appointment you have selected falls in an area that has been coded for NO Appointments.* *  
**Do you want to Override the Blockout?*”   
  

  - How are we showing the EHR schedule if Multiple Standards are applied to the same day? (how is Blockout and Availability defined)  
      
    **For Blockout:**   
    We sync the data for all blockout across Stds.  
    (for Carter Ortho, there is possibility of a blockout in the entire schedule based on a combination of all standards)  
    (**Keep Same?**)  
      
    **For Availability (Operatory Hours):**   
      
    We go by the Office id associated with the STDs on that day (meaning Office id (2) is the 1st STD and Office id (1) is the 2nd STD.  
    Provider (1) | Office id (1) | Chairs (1,2,3,4,5) - This is the 2nd STD  
    Provider (1) | Office id (2) | Chairs (1,2,3) - This is the 1st STD  
      
    In this example, we are syncing the data of the 1st 3 chairs for Operatory Hours from “Provider (1) | Office id (2) | Chairs (1,2,3)”  
      
    For the next 2 Chairs, we will sync the data from   
    Provider (1) | Office id (1) | Chairs (1,2,3,4,5)  
      
    If the 1st Standard has a higher number of chairs, we will only sync the data from the 1st Standard. E.g.  
    Provider (1) | Office id (1) | Chairs (1,2,3) - This is the 2nd STD  
    Provider (1) | Office id (2) | Chairs (1,2,3,4,5) - This is the 1st STD  
    The Operatory availability for all 5 chairs will be from - Provider (1) | Office id (2) | Chairs (1,2,3,4,5)  
      
    **IF**  
    Provider (1) | Office id (3) | Chairs (1,2,3) - This is the 1st STD  
    Provider (1) | Office id (2) | Chairs (1,2,3,4,5,6) - This is the 2nd STD  
    Provider (2) | Office id (1) | Chairs (1,2,3,4,5) - This is the 3rd STD  
      
    In this case, we will sync the Operatory hours from the 1st STD for chairs (1,2,3) and from Std 2 for chairs (4,5,6), We are not considering operatory hours from the 3rd STD  
      
      

Recurrence for Availabilities & Closures in Adit:

For recurrence, what happens if the chair is not available in a Standard for the recurrence created e.g., recurrence created daily in chair 3 but chair 3 not available in the standard for wednesday.

Restrict recurrence with a pop-out if recurrence cannot be applied within 1 month/6mths?

  

1.  Jay to confirm with Kaushal if there would be any issues in considering the OS for 1 standard only
2.  Vikram to confirm -  
    \- How do we handle Recurrence in Availabilities & Closures (apply for only those standards / create only until the recurrence breaks / create recurrence where possible / do not enable feature?)  
    \- Look at logic on how to show schedule in Adit where multiple Standards applied for Blockouts & availability (read only) - So far no use case  
      
3.  Orthotrac Appt Type Slot duration conflict - Book the Appt for 2 time slots The appointment **occupies one full 30-minute slot**, not 20 minutes. ?  
      

<!-- end list -->

  - **Standard 1 (Std 1):** Uses 20-minute time slots
  - **Standard 2 (Std 2):** Uses 30-minute time slots  
      
    Service created in Adit called **“debond”** with a duration of **20 minutes**, and mapped to **Chair 1**.

Issue:  
Since **Chair 1** is linked to both standards, there can be days when it operates under **Std 2**, which follows **30-minute slots**. If you try to book the **Cleaning** service (20 minutes) on a day when **Std 2** is active, the system will attempt to fit a 20-minute service into a 30-minute slot.

Because of this mismatch between the **service duration (20 minutes)**, and the **schedule slot duration (30 minutes in EHR)** the booking (write operation) will fail.  
  
  
  

  
  
  

Problem: In the schedule, users can create recurring appts, blockouts, availabilities. However in orthotrac you can apply different standards.   
  
Use Case:   
\-M/T/W we have a standard with 3 chairs working 8 - 5PM  
\- THU/FRI we have a standard with 2 chairs working 8 - 12PM.

  

Data When Required to Create an Availability: 

  - Date/Time
  - Chair
  - Provider (Not a problem) 
  - Appt Type (Not a problem)

Questions:  
1\. 

\-M/T/W we have a standard with 3 chairs working 8 - 5PM  
\- THU/FRI we have a standard with 2 chairs working 8 - 12PM.

  

What happens if i create a recurring closure in Chair 3 for “Everyday” , and i start this event on a monday? What happens to THU/FRI.

What happens if i create a recurring closure in chair 2 for “Every day” and the closure is at 5PM. What happens to THU/FRI? 

What happens if i created a closure on Monday, but then in the EHR, i decide to remove the standard. What happens to the data? 

  

Option 1: We will create the recurrence whenever its possible, and then on days where its not possible, we need to explain that to the user in the pop up. 

Option 2: We will create the recurrence up until the first blocker/issue the system faces. Then in the pop up we show the number of instances this was successfully created for.   
 For Example, if user creates recurring closure for “Everyday” for op 3 at 3PM, we will say something about “3 successful events were created” etc.. 

Option 3: Limit the ability to set recurrences 

  

**Questions:**

1.  If someone creates a recurring availability/blockout for every day.. How long does this create until? When is the last instance created?   
    For 2 years the same as google calendar. Kaushal suggests no more than 30 days in one occurrence  
      
2.  In Orthotrac can a user create a recurring blockout across multiple days?   
    Yes. This is created at a Standard level and will reflect in all days where this standard is applied. If user wants to change the blockouts/closures, they will need to do this in the Standard and reapply this to the days -   
      
      
3.  Can users create Lunch Blocks / or similar blocks (closures) or is it just Open time and Closed time (or can they label it)?  
    They cannot label it. Users can create “Change Pre Blocks” which is analogous to Block scheduling.  
      
4.  How are we reading blockouts in Adit, is it the Closed time or Blocked time (in Orthotrac) or both?  
    In Orthotrac, Closed time cannot be named, meaning if a closed time is reserved for Lunch, users cannot name that closed slot as “Lunch”. This means that we are reading any closed time as Blockouts / Closures.  
    **Carter Ortho:** “***Any closed time is a closure where we do not want to receive Appts***”  
      
5.  How are we showing Greyed out slots vis Blockout in Adit for Orthotrac?  
    All Greyed out slots / Close Time is shown as blockouts in Adit  
      
6.  Can Appointments be booked in Closed time in Orthotrac?  
    Yes, Appts can be booked in closed time.  
    **Carter Ortho:** “***This is an exception and not a norm***”  
      
7.  Can other Appointments be booked in reserved time for specific Appts Types in Orthotrac?  
    Yes, other Appts Types can be booked in reserved time for specific Appts Types in Orthotrac  
      
    **Questions for Consultants / Practice”****  
      
    **
8.  How do you add Lunch time? What is the purpose of closing time and how do you distinguish between Close time, Lunch time, Meetings etc?
9.  Is there a way you can label Close time?   
    Memo \> Schedule (not used much)  
      
10. You need to associate an Office to a day when applying a Standard.What is the meaning of “Office” in Orthotrac?   
    **Carter Ortho:** “***We treat an Office as a location***”  
      
    Is it a Satellite location or a space inside of the location for specific purposes (x-rays, Consult etc)  
      
11. Purpose of Multiple Standards to the same day?  
    **Carter Ortho:** “***Each Standard is a separate location***”  
      
12. How do you associate a Provider to a Standard? Why is it a default provider?  
    **Carter Ortho:** “***We default it to the Practice owner, we can change it if required***”  
      
13. Is there a primary/Main Standard?  
    **Carter Ortho:** “***We have a main office but we have separate standards for all offices***”

  

**Consultant: Sue**

1.  Orthotrac has units for duration of the Appt rather than a fixed time. So if there are for e.g. different Standards applied on Monday (10 mins slot) & Tuesday (20 mins slot), what will be the behaviour of a 30 min Appt type in both days (will they book 2 slots on Tuesday).  
      
2.  Purpose of Multiple Standards to the same day? Use case  
      
3.  how do you distinguish between Close time, Lunch time, Meetings etc (Closures)? I dont believe there is a way you can label Close time?   
      
4.  What is the meaning of “Office” in Orthotrac? Is it a Satellite location or a space inside of the location for specific purposes (x-rays, Consult etc)  
      
5.  Provider to a Standard association is done while applying the Standard, is it always for the Provider who’s working on the day or is it defaulted to 1 provider always?  
      
6.  Is there a primary/Main Standard (in case multiples are applied on the same day)?

  

  

When writing back Availabilities & Block outs from Adit to EHR, will it update the Schedule for the day or create the Availabilities / Block out in the Standard. If it create the Availabilities / Block out in the Standard, this will reflect in any day the Standard is applied.  
Ans: This will be applied only to that Day (through backend)

Default the slot view to match with the Standard

  
  

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

  

**Orthotrac Key OS Changes / Variations / Logic:**

1.  When enabling OS in Adit for Orthotrac, the “***Operatory/Provider Hours in EHR***” will be default selected and will be an uneditable field.   
    This is because Appts cannot be written back to Orthotrac where a Standard is not available OR beyond the working hours of a Standard.  
      
2.  Closures and Availability in Adit can only be created in the working hours of the Standard applied on the day.   
      
3.  The “OR” logic for OS “Availabilities in Adit” will be available to select for Orthotrac however this will be available to apply only within the working hours of the Standard applied on the day. Meaning, if the Standard Start and End times are 9AM-5PM, the “Availabilities in Adit” can be only applied within 9AM-5PM.  
      
4.  “**Adit Business Hours**” option will be disabled for Orthotrac.  
    Reason: When both **Provider/Operatory Hours** and **Adit Business Hours** are enabled, Adit generates appointment slots based on the overlap of the two schedules. This can create booking times that do not align with the EHR's slot structure, resulting in appointment time discrepancies between what is being booked in the Booking link vs what is actually booked in the EHR. This is because Orthotrac does not allow creating Appointment mid-slot.  
      
5.  **Creating Appointments in Adit** - When creating Appointments in Adit, if the Appt is being created in the middle of the EHR slot, the Appt Start time as well as slot intervals would default to the EHR slots of the Standard applied. E.g.   
    EHR Slots = 30 mins | Working Hours = 9AM to 5PM  
    Adit Slot view in Scheduler selected as 15 mins  
    If Appt is being created at 9:15AM - In the Appt creation window, the slots would appear as starting from 9:30AM and show an interval of 30 mins there on (9:30AM, 10:00AM, 10:30AM and so on)  
      
      
6.  In Orthotrac Appointment & Service time duration will be based on units rather than fixed time. E.g. if Slot is of 10 mins and the Appt has 3 units, this will book the Appt time for 30 mins (10 x 3)  
      
      
7.  When creating Appts in the Adit app, the Appt End time will be default selected based on the “unit” of the Appt. This will be an uneditable field. This is because the appointment duration is based on units and can differ based on slots in the Standards applied.  
      
8.  When creating Appts in the Adit app, the Provider will be default selected based on the EHR provider association to the Standard. This will be an uneditable field. This is because only 1 provider is/can be associated to a Standard  
      
9.  We will enable movement / rescheduling of Appts in Adit within the same day as well as on different days. For days where slots are not available in the EHR - we will show a validation message. The Appts can be rescheduled/moved in Adit to different days even if the Standards are different across the days.  
    Exceptions (where users will **NOT** be able to move/reschedule Appts) -   
      
      
    1.  The complete slot needs to be open. If Std1 → 15 mins slot duration & Appt has 2 units, total appt length will be 30 mins. When moving Appt to Std2 where there are 30 mins slot durations, a 60 mins open time must be available to book that appointment.  
        If this is unavailable, we will not be able to reschedule the Appt and we will show a validation message.
    2.  Start time should match in case of moving the Appt to a different date. E.g. if Std1 has a 30 mins slot and Std2 has a 45 mins slot, Appt time is 9:30 AM, in Std2 (45 mins slot) 9:30 AM would be in the middle of a slot. In this case, we will not be able to reschedule the Appt and we will show a validation message.
    3.  If Practice Start time is later than the Appt time. Meaning if the user is attempting to reschedule the Appt time to 9:30 AM to a day where Std2 is applied which has working hours starting at 10:00 AM, In this case we will not be able to reschedule the Appt and we will show a validation message.
    4.  If there is a closure in the EHR, we will not be able to reschedule the Appt and we will show a validation message.
    5.  If there is an existing/overlapping Appt in the EHR, we will not be able to reschedule the Appt and we will show a validation message.
    6.  The Operatory/Chair the Appt is being moved to must be present in that standard. If it is unavailable, we will not be able to reschedule the Appt and we will show a validation message.  
          
10. While rescheduling an Appt in the Adit app to a different day, we will update the provider to match the provider in the Standard the Appt is being moved to. Explanation:-  
    Each Standard has a provider associated with it. Although the Appts do not have a provider association in the Orthotrac UI, the provider association is available in the DB tables. While rescheduling if both standards have the same provider, no change is required. However if the provider is different in the standard the Appt is being moved into, we will update the provider to the one associated with that Std.  
      
11. We will Restrict **Recurrence** of **Closure & Availabilities** in the Adit App for Orthotrac. This is because different days can have different Standards applied.  
      
12. For **Closure & Availabilities** in the Adit App for Orthotrac, users will be able to create Closure & Availabilities for any day or chair /operatory if the slots, chairs & working hours are available to create the Closure/Availability on that day.  
      
13. For Closures and Availabilities: We will not have an Edit icon or the option to Move Closures and Availabilities for Orthotrac. Users will only have a Create and a Delete option for Closures and Availabilities. This is because when a Blockout or Availability is moved from the Adit Scheduler page, a new EHR\_ID is  generated every time, handling the acknowledgment with a new EHR\_ID in modification mode is not feasible from the Adit side. We will revisit this in Phase II.  
      
14. We will pull the providers data/list from the “Schedule Maintenance” screen in Orthotrac  
      
15. For the Multi-Single Build:
      
    1.  We will enable movement / rescheduling of Appts in Adit between the same and different days. For days where there may not be any available slot in the EHR - we will show a validation message.  
        Note: This will be available even if the Standards are different across the days.
    2.  We will enable movement / rescheduling of Appts in Adit within the same day across locations. Note: there will be a combined schedule view for multiple EHR locations in Adit.   
        If there are no available slots in the EHR - we will show a validation message.  
        Note: This will be available even if the Standards are different. 
    3.  In case of Multi-single, we will combine the schedule of multiple locations in the EHR and the differentiator in Adit will be "Location\_Chair name" (based on the Location association to the Standard)
    4.  In case of Multi-Single if the slots are different in 2 EHR locations, in the Adit schedular, we will default the slot view to the minimum of the multiple locations. 
    5.  We will Restrict recurrence of Closure & Availabilities in the Adit App for Orthotrac  
          
16. Logs for appointment modifications:   
    We cannot maintain logs for appointment modifications from the Adit app side. In the EHR, the appointment modification flow works like this -
      
    1.  Cancel old appointment
    2.  Create new appointment

 Due to this EHR behavior, a new Appt\_EHR\_ID is generated every time, and  
 there is no option available to update the existing Appt ID  
 Adit behavior when updating an appointment in the EHR is to update all  
 the parameters in the DB tables based on the existing Appt\_EHR\_ID. Which  
 is why maintaining appointment change logs in this scenario is not  
 feasible with the current EHR flow (i.e. updating the change logs in the EHR in this case is not possible since once the Appt is changed in the EHR, the Appt ID changes and there is no way to associate/update/record the Appt modification to the Appt ID). We will be revisiting this in  
 PhaseII.

Issue:  
We will end up sending SC again if the Appt is moved between Operatories2.   
  

1.  Booking Link: For all Ortho EHRs, we will update the “Guardian” text in the Booking link to “Responsible Party”  
      
2.  Booking Link “Responsible Party”:   
    When collecting information from this screen in the booking link for the Resp party, we will not create a Patient profile separately, we will add this to the Relationship section of Orthotrac and Flag them as the "Primary Resp Party" if a Primary Resp Party does not already exist (meaning that the booking is for a New Patient)   
    If Appt is being booked for a Spouse/Child, we will collect the Resp Party information and add to the Resp Party section in Orthotrac as the Primary Resp party.   
    If the booking is done for "Myself" in the booking link, we will add the Responsible Party as “Self”  
      
    Note:   
    Patient Statuses in Ortho EHRs are used to categorize the stage of Treatment or identify Leads/follow up requirements. Most Ortho practices do not have a Non-Patient status hence we would not disrupt their workflow by creating a new Patient status.  
      
3.  In other EHRs there is no restriction on booking an Appt on a specific slot, appointments can be booked in any slot from Adit to EHR.  
    In Orthotrac, If an user is trying to book an Appt in a slot which is different to Slots in the EHR Standard, **Use Case**:  
    EHR Standard slot length: 20 mins: so it has slots starting from 8 AM, 8:20 AM, 8:40 AM etc, however in Adit schedular the slots were changed to reflect 5 mins, and user is trying to book an Appt at 8:05 AM or 8:10 AM, the write operation will fail.  
      
    **Solution:**   
    We will show the slots of the EHR which has 20 mins slots in the Appointment dropdown (so that we are calculating the unit time correctly and matching the EHR slots).  
    The EHR, the behavior is the same, meaning in this use case, if we book an appt in the 8:05 slot, the Appt start time will default to the next slot in the EHR (at 8:20AM)  
      
4.  For **Practices with Multiple Standards on the same day and same location** - Adit OS works with 1 Standard per Day per Location. Since we do not have the means to restrict the Scheduler and Booking Link to a single standard, we will need to have the On boarder handle this during onboarding. No action required from a development standpoint at this time.  
      
5.  **Booking Link:**

Guardian in case of Orthodontics is the Responsible Party / Billing Party. When collecting information from this screen in the booking link for the Resp party, we will not create a Patient profile separately, we will add this to the Relationship section of Orthotrac and Flag them as the "Primary Resp Party" if a Primary Resp Party does not already exist (meaning that the booking is for a New Patient) 

  - If the Guardian/Resp Party is already a patient and already associated as a "Primary Resp Party" to the patient the Appt is being booked for (existing patient), there will be no change to the "Primary Resp Party". In this case, the Guardian will reflect in the family details section of the Adit Patient Card.  
      
  - If the booking is for an existing Patient where the “Primary Resp Party” is SELF OR where a “Primary Resp Party” already exists, we will not change this information. Where receiving Guardian/Resp Party information from the Booking link, if the Guardian/Resp Party is different to the existing Guardian/Resp Party in the patient profile, we will not make any updates (or associate this as a new Guardian/Resp Party as a Relative)  
    **Decision -** [**Asana**](https://app.asana.com/1/7153196700226/project/1211201621881831/task/1212393317317341?focus=true)  
      
  - If the Guardian/Resp Party is already a patient and NOT associated as a "Primary Resp Party" to the patient the Appt is being booked for, we will associate them as the "Primary Resp Party" to the patient the Appt is being booked for. In this case as well, the Guardian will reflect in the family details section of the Adit Patient Card.  
      
  - If the Guardian/Resp Party is NOT an existing patient and associated as a "Primary Resp Party" to the patient the Appt is being booked for (existing patients),there will be no change to the "Primary Resp Party". We will not create a Patient profile separately for the Guardian / Resp Party.  
      
  - If the Guardian/Resp Party is NOT an existing patient and NOT associated as a "Primary Resp Party" to the patient the Appt is being booked for, we will associate them as the "Primary Resp Party" to the patient the Appt is being booked for. In this case as well, we will not create a Patient profile separately for the Guardian / Resp Party.  
      

Note:   
Patient Statuses in Ortho EHRs are used to categorize the stage of Treatment or identify Leads/follow up requirements. Most Ortho practices do not have a Non-Patient status hence we will not disrupt their workflow by creating a new status.

  

1.  **\*\*Webforms in Orthotrac -\*\*** 

Webforms work on the logic of “Operatory/Provider Hours” AND “Adit App Business Hours”. This means the availability in the webform would show the overlapping hours of the two.  
In Orthotrac, we are only showing availability within “Operatory/Provider Hours” and disabling “Adit App Business Hours” to avoid scheduling conflicts (refer: points 4 & 5).  
The webform however will still refer to the “Operatory/Provider Hours” AND “Adit App Business Hours” to show availability. Which is why we will need to disable the webforms for Orthotrac.

**Decision: Disable Webforms in Ortho**

  

1.  **Availability** - when Availability created in the EHR is synced from EHR to Adit, the Availability name will be of the Appt Type (as is the EHR behaviour). When these availabilities are synced to Adit, We will create the Availability with the Appt Type Name.  
    For Availabilities created in Adit, the name of the Availability cannot be synced to the EHR, the Availability will be created in the EHR with the Appt Type name. When syncing back from the EHR, we will exclude the name of the Availability to sync back to Adit so that the name of the Availability created in Adit is retained.  
    We will add a validation based on if the Availability is created in EHR OR Adit 

  
**  
**

# **ð¦· Orthotrac Notes**  

**Orthotrac is Not Worked On Yet** 

  

**Coming Soon**

  
  

**  
**

# **⛔ Do Not Use (Multi-Single)****  
**

# **Online Scheduling (Multi-Single) Build Ortho**

  

The Adit scheduler would show appointments across all locations based on the operatories selected. Operatories would be associated with locations. 

[Figma](https://www.figma.com/design/6Zyiez0IGZtr01IyCv0YCe/Orthodontics?node-id=4241-9&t=NqXztqbPFlgJFgEH-1) for combined scheduled view

**Online Scheduling** 

Ortho practices book New Patient Exams. E.g. Depew Ortho using Rooster Grin  
  
  
In Adit, For practices to allow patients to book in respective locations based on real-time availability, they would need to do the following:

  - Practices would need to label the location in the services. (ex: New Patient Consult - Location 1, New Patient Consult - Location 2)  

  

  - Associate these services to those specific operatories based on the location association.  
      
      
      
  - When patients go to the booking link, we would show the real-time availability based on the Operatory availability. The Operatories would mirror the location.   
      
      
  - We will show those operatories as closed when the staff is NOT at that location using Adit availabilities.   

  

**Product Requirement:** 

The final page of the Booking link has the Address.   
Add a Check box to toggle Hide / Show the address details (refer Figma)  
  
  

  

**Notes:** 

  - **\*\*Map in Booking link\*\***  
      - Encourage Practices to disable Map from booking link settings (for multiple locations synced to 1 Adit Location)
  - **Appt Type & Tx Code - Are there different appt types? Does it vary from location to location?** 
      
      - There could be some Appt types that are serviced on specific days (Debond Day). Since the Practices work out of each location in specific days of the week, there could be Appt types used only in those locations
      - For New Patients, there are specific Appt Types used across practices, for e.g. “**New Patient Child**” or “**Start Consult**” or “**Exam 40**” (no change needed)  
          
  - **\*\*Would we need Tx Codes?\*\***   
      - TX codes are added to the Treatment Card, not in the Appointments (no change needed)
  - **\*\*Do we need to show providers?\*\***  
      - The Schedule View is by Operatories - There is a provider filter however it works the same way as in the Adit Patients Module \> Scheduled view  
         (no change needed)  
          

  
  
  
  
  