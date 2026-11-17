**Multi-Single Build (Onboarding Guide)**

# **Chrome Extension (Cloud 9\)**  For locations which are on the new multi-single location build, meaning an Adit location is created specifically to combine multiple PMS locations to 1 Adit location, will need to download the cloud 9 CNMS chrome extension ** {{IMG:image1}} **  For Locations which are not on the multi-single location build, continue using the existing Chrome Extns.

# **Server EHR Clients**  For locations which are on the new multi-single location build, meaning an Adit location is created specifically to combine multiple PMS locations to 1 Adit location \- The sync App specific to the Multi-Single Location build will need to be installed in the client’s server

# **Data Sync (Cloud9)**

**What happens if client onboards with multiple locations but then migrates these locations to a Single Adit location**  
Once the new Extns are installed, realtime and back up sync begins in the new Adit location, STOP the sync for the old locations.

# **Phone Number Migration (Both Server & Cloud)**  **What should be done with the number that is in their current office?** We can move their numbers and phone lines to the New location without issues. The 10DLC and everything else can get moved over by:  *Sumit Jangir & team \+ Jay Adesara / Preksha (Linet) Pant*  **When do we move the number from the Old location(s) to the New Single Location?** We can do the phone migration, and complete all processes to the Single location once the client is ready. It would be advisable to turn off all reminders in the Old location and then request  *Pranav and team*  to update a dummy number from the backend to the Old location.  **How do we handle the down time of 15 to 20 minutes during the phone migration?** Since the process will be done in the day time of India which will be after business hours the client will not be impacted  **Process for number movement from old Adit app account to new Adit app account:**[Process for number movement from old Adit app account to new Adit app account](https://docs.google.com/document/d/19F544KvqTuUOvXCp8YbmewBHzrDKTX0fj8iGs8fHxNQ/edit?usp=sharing)

# **Combined Schedule (Both Server & Cloud):** The schedule view for the Multi-\>Single location will show a combined schedule of the multiple PMS locations   **How will the Practice distinguish between the chairs in the Combined Schedule (which chair belongs to what Location)?**

The Practice can rename the Chair/Operatory name to identify with a Location in their PMS (for e.g. Chair1\_Austin). This will reflect in the Operatory/Chair name in the schedule

# **How to set up Online Scheduling for Multi-Single Location Build:**

[Set up Online Scheduling (Multi-Loc) Build](https://docs.google.com/document/d/1UVBZLFDNuQPQn6YCBPpcAG2hmg104do2iLuXWrb1bvA/edit?usp=sharing)

# **Reminders (Both Server & Cloud):**

**How do we set up Automatic reminders per Location?**  
Practices can set up reminders specific to a location based on the Operatory Advance Filter. For e.g. Chair1\_Austin belongs to the Austin Location. They can input the Location name manually in the text specific to a location.  
For this, the Practice will need to rename the Chair/Operatory name to identify with a Location in their PMS  
 {{IMG:image2}} 

**How do we set up Recalls?**  
For Recalls Adit refers to the due date available in the PMS. This will not be available by Location. The Practice can (i) manually add the Location name in the recall text or (ii) Use the Organization name Placeholder or (iii) Name the new location as the Org name so that the text automatically pulls the Org name through the location placeholder.

**How will missed call texts work?**   
OB/Sales would need to ask the Practice to provide a combination of their Business hours across locations.   
For example,   
Location1 \- Open Mon-Wed from 9am-5pm,   
Location2 \- Open Thurs-Fri from 10am-6pm

We will redirect the Missed call texts to read from the Adit Business Hours for these specific Multi-Single Location clients.  
A task will need to be created and assigned to *Nitin & Team*  
OB team will then set up a combination of the business hours for the linked locations during configuration calls.

**Form Reminders:**  
Form reminders will not be available by Location. The Practice can manually add the Location name in the form text

**Auto-Assign Forms:**  
Practices can set up reminders specific to a location based on the Operatory Advance Filter. For e.g. Chair1\_Austin belongs to the Austin Location. They can input the Location name manually in the text specific to a location.  
For EHRs where this is not yet available (Ortho), we are working on this to see if Auto-Assign can be enabled.  
 {{IMG:image3}} 

# **What happens if the Client already Onboarded with a single/multiple locations but needs a Multi-Single Build (Both Server & Cloud)**

We will need to create a new location in Adit (even if they have an existing location).  
Next Steps: 

- [ ] Redirect the Missed call texts to read from the Adit business hours (create a Sub-Task in [Asana](https://app.asana.com/1/7153196700226/project/1212631630672469/list/1212677612373566) under the relevant Client task) \- OB team to create task & Dev team to execute  
- [ ] Multi-Single build sync app will need to be installed \- Manish / Yash Sejani  
- [ ] Phones need to be migrated \- OB in coordination with the VOIP team  
- [ ] OB needs to complete configuration of this new location (including setting up a combination of Business Hours for Missed call texts)  
- [ ] Dummy numbers will need to be updated to the old locations (create a Sub-Task in [Asana](https://app.asana.com/1/7153196700226/project/1212631630672469/list/1212677612373566) under the relevant Client task) \- OB team to create task & Dev team to execute  
- [ ] Sync in Old locations will need to stop \- (create a Sub-Task in [Asana](https://app.asana.com/1/7153196700226/project/1212631630672469/list/1212677612373566) under the relevant Client task) \- OB team to create task & Dev team to execute



