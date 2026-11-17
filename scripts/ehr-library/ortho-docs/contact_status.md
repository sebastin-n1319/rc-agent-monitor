**DOLPHIN** 

**Contact Number in Dolphin:**  
[image]

[image]

- [ ] 1st criteria \- Pull the number in the EHR that has "Use for SMS" checked regardless of the number type (in the mobile\# field in Adit)  
- [ ] 2nd criteria \- If there are multiple numbers where "Use for SMS" is checked, pull the contact number based on Priority/Hierarchy (**Priority \= Mobile \> Cell \> Mom’s Cell \> Dad’s Cell \> Patient’s Cell**)  
- [ ] 3rd criteria \- If there are multiple numbers of the same “**Type**” where "Use for SMS" is checked, pull the contact number based on the latest addition to the EHR (this information is available in the Database)


**Patient Status (Active / Inactive):**  
**[image]**

**[image]**  
**if "This is an Active Patient" checkbox is Checked \= Active Patient in Adit**  
**if "This is an Active Patient" checkbox is Unchecked \= Inactive Patient in Adit**

* "**This is an Active Patient**" checkbox mapping is available to map to all **Patient Status**  
* “**Patients**” is the count of patients associated to each Patient Status  
* Since Practices can add/amend a Patient Status, Adit captures the Active/Inactive Patient status through the "**This is an Active Patient**" checkbox mapping

**Communication Logs:**  
**[image]**

**[image]**  
**[image]**

**Cloud9:**  
**Contact Number in Cloud9:**  
We pull the mobile number as per the ranking. If there are 2 numbers available in the Patient profile Rank\#1 & Rank\#2, Adit pulls the number in Rank\#1.

**~~Contact Number in Cloud9:~~**  
~~Adit refers the Contact Info screen in the Patient profile of Cloud9 to pull contact numbers:~~  
[image]

- [ ] **~~Condition 1:~~** ~~Adit considers all Contact Types in the mapping for the Group \= Mobile. For the mobile\# field in Adit, any contact types that are mapped to the Group “Mobile” in Cloud9 are valid mobile number fields. **Condition 1 should always be met.**~~  
  ~~[image]~~


- [ ] **~~Condition 2:~~** ~~Adit has a Priority assigned to the phone types (**Priority \= Mobile \> Cell \> Mom’s Cell \> Dad’s Cell \> Patient’s Cell**). If a Contact Type falls in the Group “Mobile” (See SS above), we will pull the 1st number in the **list** based on Priority.~~ 

- [ ] ~~The reference for this **list** is in an API report (read: report that we fetch in the backend).~~   
  ~~If the there are multiple Phone number entries listed under the same Phone Type, for e.g. if Mobile is listed Twice \- we will Pull the 1st value in the list (**in the API Reports**)~~

- [ ] ~~If a combination of **Condition1 & Condition2** are not met, For e.g. Contact Type listed in Patient Profile is in Group=Mobile however **is not** of any of the Priority Types listed (**Priority \= Mobile \> Cell \> Mom’s Cell \> Dad’s Cell \> Patient’s Cell**), we will \-~~  
  **~~Pull the 1st number available in the data from API Reports (~~**~~read: report that we fetch in the backend**)**~~

- [ ] ~~If none of the conditions listed above are met, we will not pull the Mobile number in Adit.~~

**Communication Logs (Cloud9):**  
**[image]**

**Orthotrac:**

**Condition:** Adit has a Priority assigned to the phone types (**Priority \= Mobile \> Cell \> Mom’s Cell \> Dad’s Cell \> Patient’s Cell**). If there are more than one phone number in Orthotrac, we pull whichever number follows the highest priority

If there are multiples of the same Phone Types listed, we pull the one which is listed as the **Primary** number.  
[image]

**Important Note:** The mobile numbers are only pulled if the office has the number types spelled exactly as shown above (see SS below for where to make those changes)

[image]  
**Communication Logs (Orthotrac):**

[image]

























