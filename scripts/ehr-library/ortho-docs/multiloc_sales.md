# **`Multi-Location PMS into Single Adit Loc Build – Sales Guide`**

### **What is the Multi-Location Build?**

Adit’s Multi-Location Build allows practices with multiple PMS locations to operate in Adit as a single location, enabling unified communications and a single phone across locations

---

## **Industry Use-Case**

In Ortho (and sometimes other verticals), there are Practices that run satellite locations. These Practices have the same staff working different locations and have Patients that go in & out of multiple locations. 

**What these practices want:**  
 ✔ One phone number across 2–3 locations  
 ✔ Single SMS conversation for each patient across locations  
 ✔ Customize reminders based on each location (mentioning the location address)

**The Multi-Location Build will combine multiple PMS locations into a Single Adit Location**

---

## **Customers who Qualify**

| Requirement | Must Have | Wants |
| :---- | :---: | :---: |
| Multiple Physical locations, Multiple PMS Locations, Single Patient Database | ✔ |  |
| Same PMS for all Locations | ✔ |  |
| One phone number for all outbound communication | ✔ |  |
| Locations in the same Timezone | ✔ |  |
| A unified chat thread per patient |  | ✔ |
| Maximum of 3 Locations | ✔ |  |
| Combined Patient Card |  | ✔ |

**For Cloud PMS, there needs to be 1 dedicated Adit user for each Location**

---

## **Advantages with this Build**

- [ ] Single Patient Profile (no patient duplications if patient visits multiple locations)  
- [ ] Single chat thread across Locations  
- [ ] Single Patient Card to show appointments across locations  
- [ ] Single Phone number across Multiple Locations

---

## **Integration Limitations:**

| Feature | Function | Limitation |
| :---- | :---- | :---- |
| Online Scheduling | Online scheduling is built to schedule at one location. In this build, practices can still book in separate locations (with Service-Operatory mapping) | The booking link will have limitations with choosing a location, showing location specific maps/addresses  |
| Scheduler | All appointments across locations will be visible in one calendar (locations will be segregated based on operatories) | Location based appointment Schedule will not be available |
| Forms | Not location-specific | Will not be associated with Locations |
| Patients | There will be a single Patient profile | Patients will not be associated to a location |
| New Patient Creation | Adit can create New Patients in the PMS through Forms | New Patients created by Adit through Forms will be created in the PMS Primary location (the primary location is defined in the Tech Stack and CRM) |
| Practice Analytics | Not Available with this build | Adit would not be able to run any kind of metrics and analytics on the location level |
| Adit Pay | Practices can opt for Adit Pay | This will be associated to a single Stripe account (since there's just one Location in Adit) |
| Reviews | Can add 1 GMB page | Since there is one location, practices cannot add multiple GMB |
| Auto Assign | Practices can Auto Assign Forms | Since there is one location, Practices can assign Location specific forms based on Operatories (or providers for Opto). \[currently not available for Ortho\]  |
| AIFD | Can take calls, create tasks, assign tasks, Maintain full interaction records: transcript, summary, outcome, sentiment, reason-for-visit  | Cannot write back into the PMS |

---

## **Sales \- Tech Stack (Sales Operations Process \- [Multiple Locations in 1 Deal with 1 EHR](https://docs.google.com/document/d/1d-Vfnf49BBUb7y1YWZvKSS6P03tdc7Mxnic3N3gQTwc/edit?usp=sharing))**

- If the customer meets qualifying criteria and wants to pay for a Single Location  
   **→ Sell as a Single-Location Deal**

- If the customer meets qualifying criteria AND is willing to pay for multiple locations  
   **→ This becomes a Sales call**  
* If Sales wants to create multiple deals in CRM they can, this would however be treated as Multiple Adit locations instead of a single location in Adit

- **Process for linking Multiple locations to a Single Adit Location:-**  

  AE would choose the Multiple Locations \= "Yes" in the pre-agreement form  
   {{IMG:image1}} 

  > > > > > > ⬇️

	AE would link PMS locations to the Primary location  
	 {{IMG:image2}} 

⬇️

This would create 1 deal in the CRM, “*EHR Locations Linked*” under "Sales Details" would be TRUE.   
Linked Locations would be visible in the Agreements Module in CRM  
	

⬇️

If Deal Stage \= “WON”, and “EHR Locations Linked” \= True, this will auto-create a Task in the Asana Project for Server Installs/Initial Sync. [Asana](https://app.asana.com/1/7153196700226/project/1212631630672469/list/1212677612373566). E.g. \-   


---

## **Understanding \- Single Patient Database setup in the PMS**

**How does a singular patient database work?**

1. Patient data in the PMS is Centralized

2. This means that all patient information \- Demographics, Forms, Attachments, Folders, insurance details etc. live at the Patient level and are not specific to a Location in the PMS

**How do we know if the PMS has a singular database for Multiple Locations?**

| Server-based PMS | Same user login in PMS for all locations No server selection prompt during login |
| :---- | :---- |
| **Cloud-based PMS** | One login URL  The user should be able to access both locations in the PMS through the same login |

---

**Screenshots of PMS**

**Orthotrac Location view \-** 

 {{IMG:image5}} 

**Dolphin Location view \-** 

** {{IMG:image6}} **

**Cloud9 Location view \-** 

** {{IMG:image7}} **

**Officemate Location view \-** 

 {{IMG:image8}} 








