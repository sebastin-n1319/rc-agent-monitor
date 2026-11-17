**Orthotrac Training**

**Orthotrac**

1. **Schedule Maintenance screen:**  
   **` {{IMG:image1}} `**

**`Standards Applied to Day(s):`**

``

**`On Clicking a Std on a day, the Schedule opens up - Appts inside the Standard:`**  
` {{IMG:image3}} `

**`Duration of an Appt in Units (when Creating Appts):`**  
` {{IMG:image4}} `

**`Creating a Standard:`**

` {{IMG:image5}} `

` {{IMG:image6}} `

**`Adding a Standard to a Day:`**  
` {{IMG:image7}} `

**Adit**

- [ ] **`Adit can handle only 1 Standard (MVP phase) per day - per location`** `currently. We will be working on a build to handle multiple standards in the next phase.`  
  ``

- [ ] **`Availabilities in Adit:`**   
  `“Closures” and “Availabilities” in Adit can be created only within the working hours of the Standard applied in the EHR on that day. Meaning, if the Standard Start and End times are 9AM-5PM, the Availabilities in Adit can be only applied within 9AM-5PM.`  
  ` {{IMG:image9}} `

- [ ] **`Recurring Closure or Availability`** `in the Adit App will NOT be available for Orthotrac. This is because different days can have different Standards applied.`  
  ` {{IMG:image10}} `

- [ ] `Users will be able to create Closure & Availabilities in the Adit App for any day if the slots, chairs & working hours are available to create the Closure/Availability on that day.`

- [ ] `The Provider names in the Availability will be of the Provider associated to the Standard (only 1 option will be available)`  
  ` {{IMG:image11}} `

- [ ] `Users cannot Move Closures and Availabilities for Orthotrac.`  
  `In Orthotrac moving a Closure or Availability creates a new EHR_ID which limits syncing it back to the EHR`

- [ ] `Users will only have a Create and a Delete option for Closures and Availabilities. Edit Option is not available`  
  ` {{IMG:image12}} `

- [ ] **`Availability Name`** `- When an availability is created in the EHR and synced to Adit, the Availability Name in Adit will be set to the Appointment Type name.`   
  `For Availabilities created in Adit, the name of the Availability will be retained in Adit however when this syncs to the EHR, the Availability will be created in the EHR using the Appointment Type name.`

- [ ] **`Appointments in Adit:`**  
  `When creating Appointments in the Adit app, the Appt End time will be default selected based on the “unit” of the Appt. This will be an uneditable field. This is because the appointment duration is based on units and can differ based on slots in the Standards applied.`  
  ` {{IMG:image13}} `

- [ ] `In Orthotrac Appointment & Service time duration will be based on units rather than fixed time. E.g. if Slot is of 10 mins and the Appt has 3 units, this will book the Appt time for 30 mins (10 x 3)`  
  ` {{IMG:image14}} `

- [ ] `Users can move / reschedule Appts in Adit within the same day as well as on different days even if the Standards are different across the days.`  
  `For days where Standards are not available in the EHR - we will show a validation message.`   
  ` {{IMG:image15}} `

- [ ] `If Appt is being moved to another day and the start time on that day is later than appt time — e.g. Std2 starts at 10:00AM, appt is 9:30AM in Std1, the slots would appear from 10:00AM.`

- [ ] `If The Operatory/Chair the Appt is being moved to is not available on a different day - Only the Chairs available on that day’s Standard will appear in the dropdown.`   
  ` {{IMG:image16}} `

- [ ] `While rescheduling an Appt in the Adit app to a different day, we will update the provider to match the provider in the Standard the Appt is being moved to.`

  
















