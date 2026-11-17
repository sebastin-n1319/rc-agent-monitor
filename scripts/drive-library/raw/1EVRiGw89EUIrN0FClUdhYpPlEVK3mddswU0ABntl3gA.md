**Q: I want production goals to be calculated based on provider hours, but after updating hours the monthly goal didn’t change. Why is this happening?**

**A:** Adit does not automatically recalculate production goals when provider hours are updated. Provider hours are used for reporting (like utilization and production per hour), but the actual monthly production goals are set separately in Preferences → Set Goals. Because of this separation, changing hours won’t update your goals automatically—you need to either update the goals manually or set them using a production-per-hour or similar target so they scale with scheduled hours going forward.

**Q: In Practice Analytics, how do I create a patient list of patients with scheduled future appointments within a certain date range that only includes hygiene appointments and excludes doctor-side appointments?**

**A:** Create a patient list in **Practice Analytics → Patient Lists → New Patient List**. Then add the following filters:

* **Date filter:** Scheduled Appointment Date → set your future date range (start and end dates)  
* **Appointment Type filter:** Appointment Type \= Hygiene (or select hygiene/prophy appointment types only)  
* **Provider filter (to exclude doctors):** Provider Role \= Hygienist or Provider ≠ Dentist/Doctor

Run the list to confirm it only shows patients with future hygiene appointments, then save the Patient List for reuse or export if needed.

**Q: Morning huddle shows unscheduled treatment. Where can I find the list of those patients?**

**A:** Open **Practice Analytics → Morning Huddle**. The patient-level list (List View or Quick View on the Adit dashboard) shows today’s patients along with scheduled and unscheduled treatment amounts. You can sort or filter the **Unscheduled Treatment** column and click on a patient’s name to open their patient card.

For a quick snapshot, you can also use the **Morning Huddle Quick View** on the Adit landing page. For more follow-up tracking, use **Analytics → Follow Ups**, where you can view and manage unscheduled-treatment follow-ups.

**Q: Need to add custom treatment codes in Practice Analytics. How do I add treatment codes?**

**A:** Custom treatment codes cannot be created directly inside Practice Analytics. Adit pulls treatment/procedure codes from your connected EHR/PMS system. To add a new code, you must first create it in your EHR/PMS and allow it to sync into Adit. Once synced, the code will become available in Practice Analytics for reporting, filters, patient lists, and goal tracking. If the code does not appear after syncing, contact Adit Support for assistance with code mapping or synchronization.

**Q: Why is scheduled production wrong?**

**A:** Scheduled production may appear incorrect due to configuration, provider mapping, or EHR data issues. Common causes include:

* Incorrect or missing Team Settings (provider roles or operatory assignments)  
* Provider Hours not configured correctly  
* Missing or outdated Provider Goals in Preferences → Set Goals  
* Incorrect appointment, procedure, or operatory data in the EHR  
* Appointments that were moved, cancelled, or left uncoded  
* Sync delays (Analytics updates approximately every 5 minutes)

It’s also important to note that Adit scheduled production is associated with the treatment plan and provider assignment in your EHR. If production is attached to the wrong provider in the EHR, it may display under the wrong provider in Adit as well.

Quick checklist:

* Verify Team Settings and operatory assignments  
* Confirm Provider Hours templates and split blocks  
* Update Provider Goals in Preferences → Set Goals  
* Check appointment procedure codes, provider, and operatory assignments in the EHR  
* Wait for the next sync cycle and refresh the report/views

**Q: Can I track hygiene reappointment?**

**A:** Yes, Adit tracks hygiene reappointments through **Practice Analytics → Reports → Reappointment**. This report specifically tracks whether patients have a future appointment tied to a hygiene treatment code, making it the most direct way to monitor hygiene reappointment rates.

You can also use:

* **Patients → Recall** or **Patient Lists** to filter patients by recall status, due date, or last hygiene visit  
* **Morning Huddle** to monitor upcoming hygiene appointments and unscheduled patients  
* Automated reminders and follow-up workflows to improve hygiene reappointment conversion rates

**Q: Do users receive email notifications when a task is assigned or created, and is there a setting to enable this?**

**A:** No, Adit does not currently send email notifications for task assignments or task creation. There is also no settings option to enable or disable email alerts for tasks. 

**Q: Can I highlight messages that I need to go back to?**

**A:** Yes — you can use **Tags** in Engage to highlight and organize messages that need follow-up. Tags allow you to assign custom labels and colors to message threads so they are easier to find later.

To use Tags:

* Go to **Engage → Tags → Manage** to create or edit tags  
* Open a message thread and use the **Add Tag** option to apply a tag  
* Tagged conversations can later be viewed and filtered from the **Tags** section

This helps track conversations that require follow-up, internal ownership, or special attention

**Q: Can I find older messages that I need to address?**

**A:** Yes. Use **Engage → Messages** to find and surface older conversations that still need attention:

* Use the **Search bar** to find conversations by patient name, phone number, or keywords  
* Toggle the **Unread** filter or use **Quick Filters** to show only unread or specific message types  
* Use the **Filter** icon to refine views (for example, hide automated texts or show only internal messages)  
* Mark conversations as **Unread** or use **Mentions (@)** to flag messages you need to return to later

**Q: Can I highlight messages that I need to go back to?**

**A:** Yes — you can flag messages to return to later in Engage.

* Mark a conversation as **Unread** from the conversation menu to keep it in your Unread list  
* Use **Mentions (@)** to surface messages where you’re tagged  
* Toggle the **Unread** filter or use **Quick Filters** on the Messages sidebar to show only items needing attention  
* Use the **Filter** icon to hide automated texts and narrow results to manual SMS or internal messages

**Q: Can I listen to call recordings from the Adit mobile app?**

**A:** No, call recordings are not currently available in the Adit mobile app. Call recordings can only be accessed through the Adit web app or desktop app. 

### **Q: What should I know about accessing Phone System in Adit?**

**A:** Phone System in the new admin panel, you can go to the **Settings page → Phone System**. If a location is already selected, you will be taken directly into the Phone System settings for that location without needing to reselect it.

The location selection screen will only appear when **“All Locations”** is selected, in which case you will be prompted to choose a specific location before proceeding.

**Q: Can I upload a profile picture or logo to my Adit account?**

**A:** Yes, you can now personalize your Adit account with a profile picture or office logo.

To update your profile picture:

* Click your profile icon in the top-right corner  
* Select **My Profile** from the dropdown  
* Click **Upload New Photo**  
* Choose your image and click **Save**

Supported formats:

* `.jpg`  
* `.png`

Recommended image size:

* Larger than **300px by 300px** for best quality

You can also remove or replace your profile photo anytime from the **My Profile** page.

# **ADIT Integration Support – Q\&A Guide**

> **Note: Feature availability depends on the EHR/PMS version, integration type, and deployment method (Cloud vs On-Prem). Some versions may support only limited ADIT services or analytics features.**

**General Questions**

## **Q1. What is ADIT Integration?**

**A: ADIT Integration connects dental, optometry, chiropractic, and orthodontic EHR/PMS systems with ADIT services such as analytics, scheduling, reminders, patient communication, AI workflows, and reporting.**

**Q2. Which industries are supported by ADIT integrations?**

**A: ADIT supports integrations for:**

* **Dental**  
* **Optometry**  
* **Chiropractic**  
* **Orthodontics**

**Q3. What services are commonly available through ADIT integrations?**

**A: Common services include:**

* **Morning Huddle**  
* **Schedule Management**  
* **Dashboards**  
* **Practice Performance Reports**  
* **Patient Communication**  
* **Recall & Reminders**  
* **Online Scheduling**  
* **Forms & Reviews**  
* **AI Front Desk**  
* **Call Intelligence**  
* **Insurance Verification**  
* **Payments & Ledger Posting**

**Dental Integrations Q\&A**

# **Dentrix**

## **Q4. Does ADIT support Dentrix integration?**

**A: Yes, ADIT supports Dentrix integrations.**

**Q5. Which Dentrix versions are supported?**

**A: Supported versions include:**

* **G6**  
* **G6.2+**  
* **G7.0**  
* **G7.1**  
* **G7.2**  
* **G7.3**

**Q6. Are all features available on every Dentrix version?**

**A: No. Some older Dentrix versions may not support all dashboards, analytics, scheduling automation, or write-back features.**

**Q7. Can Dentrix be sold in the Tech Bundle?**

**A: Yes, Dentrix integrations can be sold in the Tech Bundle.**

**Q8. What does Adit support in Dentrix integration?**

### **Practice Analytics**

* **Morning Huddle**  
* **Schedule View**  
* **Dashboards:**  
  * **Practice**  
  * **Provider**  
  * **Hygiene**  
  * **Growth**  
  * **Collections**  
* **Reports**  
* **Patient Lists**  
* **Patient Card**  
* **Follow Ups**  
* **Automated Recall Reports**

  ### **Scheduling & Production**

* **Real-time availability**  
* **Appointment write-back into Dentrix**  
* **Provider hours sync**  
* **Operatory hours sync**  
* **Treatment code mapping**  
* **Pull treatment codes from appointments**

  ### **Patient Data**

* **Patient status sync**  
* **Patient notes sync**  
* **Profile picture support**  
* **Preferred language support (if configured)**

  ### **Forms & Documents**

* **Import patient forms**  
* **Attach PDFs to patient records**  
* **Sync allergies, medications, and medical history**  
* **Store documents in Dentrix Document Center**

  ### **Engage**

* **Appointment reminders**  
* **Confirmations**  
* **Recall reminders**  
* **Birthday messaging**  
* **ASAP scheduling workflows**

  ### **Payments**

* **Communication log posting**  
* **Ledger posting**  
* **Refund and discount posting**  
* **CareCredit posting support**

  ### **Advanced Features**

* **Call Intelligence summaries**  
* **AI Front Desk support**  
* **Insurance verification with PDF attachment**

**OpenDental**

## **Q9. Does ADIT support OpenDental integration?**

**A: Yes, ADIT supports OpenDental integrations.**

**Q10. Which OpenDental versions are supported?**

**A: Supported versions include:**

* **15.4**  
* **17**  
* **18**  
* **19**  
* **20**

**Q11. Do all OpenDental versions support the same features?**

**A: No. Feature availability depends on OpenDental version and database compatibility.**

**Q12. Is OpenDental an official integration?**

**A: Yes, some OpenDental integrations are officially supported.**

**Q13. Can OpenDental be included in the Tech Bundle?**

**A: Yes.**

**Q14. What does Adit support in OpenDental integration?**

### **Practice Analytics**

* **Full Morning Huddle**  
* **Schedule tracking**  
* **All dashboard modules**  
* **Reports & patient lists**  
* **Follow Ups**  
* **Patient Card**  
* **Automated Recall Reporting**

  ### **Scheduling**

* **Real-time availability**  
* **Appointment write-back**  
* **Operatory \+ provider sync**  
* **Treatment code mapping**

  ### **Clinical Data**

* **Treatment plans**  
* **Production tracking**  
* **Patient notes read/write**

  ### **Engage**

* **Reminders**  
* **Confirmations**  
* **Recall workflows**  
* **ASAP scheduling**

  ### **Forms**

* **Full form field mapping**  
* **PDF attachments**  
* **Insurance \+ allergy \+ medical sync**

  ### **Payments**

* **Ledger posting**  
* **Refunds/discounts**  
* **Communication logs**

  ### **Advanced Features**

* **Insurance verification (RCM)**  
* **Call Intelligence**  
* **AI Front Desk support**

**Eaglesoft**

## **Q15. Does ADIT support Eaglesoft?**

**A: Yes.**

**Q16. Which Eaglesoft versions are supported?**

**A: Supported versions include:**

* **17**  
* **18.1**  
* **19.11**  
* **20.0**

**Q17. Are all Eaglesoft features available on every version?**

**A: No. Some dashboards and write-back features may not work on older versions.**

**Q18. Can Eaglesoft be sold in the Tech Bundle?**

**A: Yes.**

**Q19. What does Adit support in Eaglesoft integration?**

### **Practice Analytics**

* **Morning Huddle**  
* **Schedule View**  
* **Dashboards**  
* **Reports**  
* **Patient Lists**  
* **Follow Ups**

  ### **Scheduling**

* **Appointment write-back**  
* **Provider sync**  
* **Partial operatory mapping**  
* **Limited treatment code support on older versions**

  ### **Patient Data**

* **Patient status sync**  
* **Basic notes support**

  ### **Engage**

* **Reminders**  
* **Confirmations**  
* **Recall messaging**  
* **Birthday campaigns**

  ### **Forms**

* **Patient form import**  
* **PDF attachment via SmartDoc**  
* **Medical history sync**

  ### **Payments**

* **Communication logs**  
* **Limited ledger write-back**

**Cleardent**

## **Q20. What does Adit support in Cleardent integration?**

**A: Cleardent supports strong real-time cloud syncing.**

### **Features Supported**

* **Morning Huddle**  
* **Dashboards**  
* **Reports**  
* **Follow Ups**  
* **Real-time scheduling**  
* **Appointment write-back**  
* **Operatory \+ provider sync**  
* **Treatment code mapping**  
* **Full reminders & recalls**  
* **Form syncing**  
* **PDF storage**  
* **Ledger posting**

**Denticon (Planet DDS)**

## **Q21. What does Adit support in Denticon integration?**

**A: Denticon supports cloud-native integration workflows.**

### **Features Supported**

* **Morning Huddle**  
* **Dashboards**  
* **Reports**  
* **Patient lists**  
* **Follow Ups**  
* **Real-time scheduling**  
* **Appointment write-back**  
* **Treatment code support**  
* **Full engagement suite**  
* **Cloud forms syncing**  
* **Ledger posting**

**Dentrix Ascend**

## **Q22. What does Adit support in Dentrix Ascend integration?**

**A: Dentrix Ascend supports near real-time cloud syncing.**

### **Features Supported**

* **Morning Huddle**  
* **Schedule**  
* **Dashboards**  
* **Reports**  
* **Follow Ups**  
* **Real-time availability**  
* **Appointment write-back**  
* **Treatment code support**  
* **Forms syncing**  
* **PDF attachment**  
* **Ledger posting**

**Curve Dental**

## **Q23. What does Adit support in Curve Dental integration?**

**A: Curve Dental supports strong scheduling and engagement workflows.**

### **Features Supported**

* **Morning Huddle**  
* **Dashboards**  
* **Reports**  
* **Scheduling sync**  
* **Appointment write-back**  
* **Recall workflows**  
* **Forms syncing**  
* **PDF support**  
* **Ledger posting**

**Optometry Integrations Q\&A**

# **OfficeMate**

## **Q24. Does ADIT support OfficeMate integration?**

**A: Yes.**

**Q25. Which OfficeMate versions are supported?**

**A: Version 12 is supported.**

**Q26. What services are available with OfficeMate?**

**A:**

* **Morning Huddle**  
* **Schedule**  
* **Dashboards**  
* **Practice Performance**  
* **Capture Dashboard**  
* **Growth Dashboard**

**Crystal PM**

## **Q27. Does ADIT support Crystal PM integration?**

**A: Yes.**

**Q28. Which Crystal PM version is supported?**

**A: Version 6.1.9 is supported.**

**Q29. Is Crystal PM an official integration?**

**A: Yes.**

**Q30. What services are supported with Crystal PM?**

**A:**

* **Morning Huddle**  
* **Schedule**  
* **Dashboards**  
* **Practice Performance**  
* **Capture Dashboard**  
* **Growth Dashboard**

**RevEHR**

## **Q31. Does ADIT support RevEHR?**

**A: Yes, limited support is available.**

**Q32. Which services are available with RevEHR?**

**A: Most analytics features are currently unavailable.**

**EyeFinity**

## **Q33. Does ADIT support EyeFinity integration?**

**A: Yes, limited support is available.**

**Q34. Which services are available with EyeFinity?**

**A: Most analytics features are currently unavailable.**

**Revolution Web**

## **Q35. Does ADIT support Revolution Web integration?**

**A: Yes.**

**Q36. What services are supported with Revolution Web?**

**A:**

* **Morning Huddle**  
* **Schedule**  
* **Dashboards**  
* **Practice Performance**  
* **Capture Dashboard**  
* **Growth Dashboard**

**Chiropractic Integrations Q\&A**

# **Chirotouch (On Prem)**

## **Q37. Does ADIT support Chirotouch On-Prem integration?**

**A: Yes.**

**Q38. Which Chirotouch version is supported?**

**A: Supported version:**

* **7.2.13**

**Q39. Are all Chirotouch features available on every version?**

**A: No. Certain dashboards and analytics may have limited support.**

**Q40. Can Chirotouch be sold in the Tech Bundle?**

**A: Yes.**

**Q41. Which services are supported with Chirotouch?**

**A:**

* **Morning Huddle**  
* **Schedule**  
* **Practice Performance**

**Chirotouch (Cloud)**

## **Q42. Does ADIT support Chirotouch Cloud?**

**A: Yes.**

**Q43. Which services are supported with Chirotouch Cloud?**

**A:**

* **Morning Huddle**  
* **Schedule**  
* **Practice Performance**

**Jane**

## **Q44. Does ADIT support Jane integration?**

**A: Limited support is available.**

**Q45. What services are available with Jane?**

**A: Most analytics services are currently unavailable.**

**Orthodontics Integrations Q\&A**

# **Orthotrac**

## **Q46. Does ADIT support Orthotrac integration?**

**A: Yes.**

**Q47. Which Orthotrac versions are supported?**

**A:**

* **v11.1**  
* **v14**  
* **v15.1**  
* **v15.2.0.74**

**Q48. Do all Orthotrac versions support the same features?**

**A: No. Most analytics features are limited depending on version.**

**Q49. What services are available with Orthotrac?**

**A: Most analytics services are currently unavailable.**

**Dolphin**

## **Q50. Does ADIT support Dolphin integration?**

**A: Yes.**

**Q51. Which Dolphin version is supported?**

**A: 10.06.8486.38254**

**Q52. What services are available with Dolphin?**

**A: Most analytics services are currently unavailable.**

**Cloud 9**

## **Q53. Does ADIT support Cloud 9 integration?**

**A: Limited support is available.**

**Q54. What services are available with Cloud 9?**

**A: Most analytics services are currently unavailable.**

**Support & Troubleshooting Questions**

## **Q55. How can I verify if an EHR version is supported?**

**A: Check the ADIT Integration Rulebook or confirm with the Integration Support team.**

**Q56. What should I do if a feature is unavailable for an integration?**

**A: Inform the customer that the feature is not currently supported for that EHR/PMS version.**

**Q57. Why are some dashboards unavailable for certain integrations?**

**A: Some EHR systems do not expose required data through APIs or database access.**

**Q58. What does “Official Integration” mean?**

**A: Official Integration means the EHR vendor formally supports or approves the ADIT integration.**

**Q59. What does “On Prem” mean?**

**A: On Prem means the EHR system is hosted locally on the client’s server.**

**Q60. What does “Cloud” mean?**

**A: Cloud means the EHR system is hosted online and accessed through the internet.**

**Final Important Note**

**Q61. Do all EHRs support the same Adit features?**

**A: No.**

**Support depends on:**

* **EHR version**  
* **API availability**  
* **Cloud vs server deployment**  
* **Integration type (official vs legacy)**

  ### **Key Differences**

* **Cloud EHRs → full real-time feature support**  
* **Legacy server EHRs → partial dashboards and limited write-back**  
* **Older versions → reduced analytics and scheduling capabilities**

# **Chiropractic PMS Compatibility – Adit Integration Overview**

## **Q: Which Chiropractic PMS platforms does Adit support?**

A: Adit supports the following Chiropractic PMS platforms:

* ChiroTouch (On-Prem)  
* Jane (Cloud)  
* ChiroTouch (Cloud)

All platforms support core features like Engage, Online Scheduling, Patient Forms, and Payments, but Practice Analytics capabilities vary by system.

---

## **Q: Are all features available in every PMS system?**

A: No. Feature availability depends on the PMS:

* Some platforms support full scheduling and communication tools  
* Analytics and dashboards may be limited or not yet available in certain systems  
* Payment write-back and advanced reporting can also vary by PMS

---

## **Q: What Practice Analytics features are supported?**

### **ChiroTouch (On-Prem)**

A: Supports:

* Morning Huddle  
* Schedule view  
* Practice Performance  
* Growth & Collections  
* Reports  
* Patient Lists & Patient Card  
* Automated Recall Report

Not fully supported:

* Advanced dashboards (visual analytics)  
* Provider / Hygiene / Operatory performance breakdowns  
* Practice Health Score  
* Follow-ups analytics

---

### **Jane (Cloud) & ChiroTouch (Cloud)**

A: Currently:

* Practice Analytics dashboards are not available  
* Performance, growth, and recall analytics are not active yet

---

## **Q: Can Adit show Treatment Plans in Chiropractic PMS systems?**

A: No. Treatment Plans and Treatment Plan PDF attachments are not supported in ChiroTouch (On-Prem), Jane, or ChiroTouch (Cloud).

---

## **Q: Does Adit support Online Scheduling with Chiropractic PMS systems?**

A: Yes. All supported platforms include:

* Real-time availability  
* Appointment creation inside PMS  
* Operatory hour syncing  
* Provider hour syncing

Online Scheduling is one of the strongest supported features across all Chiropractic systems.

---

## **Q: What Engage features are available?**

A: All platforms support:

* Appointment reminders  
* Auto-confirmations  
* Birthday messages  
* Recall reminders  
* ASAP lists  
* Schedule tracking inside Engage

Note:

* Scheduled confirmations are only available in ChiroTouch (On-Prem)

---

## **Q: Does Adit support Patient Forms integration?**

A: Yes, partially across all platforms.

Supported:

* Import completed forms  
* PDF attachment to PMS  
* General patient fields  
* Insurance fields

Not supported:

* Medical history fields  
* Allergies  
* Medical problems  
* Medications

---

## **Q: Can Adit read and write patient notes in Chiropractic PMS systems?**

A: Yes. All platforms support:

* Writing patient notes/logs into the PMS  
* Reading patient notes/logs back into Adit

---

## **Q: How does Adit Pay work with these systems?**

### **ChiroTouch (On-Prem)**

* Payments written to communication logs: Yes  
* Ledger posting: Yes  
* Refunds: No  
* Discounts: No

### **Jane**

* Ledger posting: Yes  
* Refunds: Yes  
* Discounts: No  
* Communication logs: No

### **ChiroTouch (Cloud)**

* Ledger posting: Yes  
* Refunds: Yes  
* Discounts: Yes  
* Communication logs: No

---

## **Q: Does Adit support insurance verification (RCM) back into PMS?**

A: No. Across all Chiropractic PMS systems:

* Insurance verification PDFs cannot be pushed back into the PMS  
* RCM is used as an external workflow tool only

---

## **Q: What is the overall capability by system?**

A:

* **ChiroTouch (On-Prem):** Strong scheduling \+ partial analytics  
* **Jane:** Strong Engage & Payments, analytics still in roadmap  
* **ChiroTouch (Cloud):** Strong Engage & Payments, limited analytics today

# **Orthodontic PMS Compatibility – Adit Integration Overview (Q\&A)**

---

## **Q: Which Orthodontic PMS systems does Adit support?**

A: Adit supports the following Orthodontic PMS platforms:

* Orthotrac  
* Dolphin  
* Cloud 9

All three support core workflows like Engage, Patient Forms, Payments, and Insurance Verification, but advanced features like Practice Analytics and full Scheduling are limited.

---

## **Q: Do all Orthodontic PMS systems support full Adit features?**

A: No. Feature availability varies significantly by PMS.

* Core engagement and communication tools are supported across all systems  
* Practice Analytics dashboards are not supported  
* Online Scheduling is limited or partially supported depending on the system  
* Cloud 9 has the most functional limitations

---

## **Q: Are Practice Analytics available in Orthodontic PMS integrations?**

A: No. Practice Analytics is not supported across Orthotrac, Dolphin, or Cloud 9\.

This includes:

* Morning Huddle  
* Schedule dashboards  
* Provider / hygiene / practice performance  
* Operatory utilization  
* Practice Health Score  
* Growth and collections dashboards  
* Reports and follow-ups  
* Treatment-code based analytics

Note:

* Patient Lists are available in Orthotrac and Dolphin only  
* Cloud 9 does not support Patient Lists

---

## **Q: Can Adit attach treatment codes or use treatment plans in Orthodontic PMS systems?**

A: No. The following are not supported across all three platforms:

* Attaching treatment codes to appointments  
* Pulling treatment codes from appointments  
* Automated recall reports  
* Treatment plan PDFs

---

## **Q: Does Adit support auto-assigned forms in Orthodontic PMS systems?**

A: Yes, partially.

Auto-assigned forms (without treatment codes) are supported in:

* Orthotrac  
* Dolphin

Cloud 9 does not support this capability.

---

## **Q: Does Adit support Online Scheduling for Orthodontic PMS systems?**

A: Limited support only.

Not supported:

* Real-time availability  
* Writing appointments directly into the PMS

Supported:

* Pulling operatory hours (all systems)  
* Pulling provider hours (Orthotrac only)

Online Scheduling should be positioned as limited sync, not full automation.

---

## **Q: What Engage features are supported?**

A: All Orthodontic PMS systems support:

* Appointment reminders (including family reminders)  
* Auto-confirmations  
* Birthday messages  
* ASAP lists  
* Schedule tracking inside Engage

Partial support:

* Scheduled confirmations (available in Orthotrac and Dolphin only)  
* Recall reminders (not supported in Orthotrac, supported in Dolphin and Cloud 9\)

---

## **Q: What Patient Profile features are supported?**

A: Support varies by PMS.

Fully supported across most systems:

* Active/inactive patient status  
* Preferred language

### **Partial support breakdown:**

| Feature | Orthotrac | Dolphin | Cloud 9 |
| ----- | ----- | ----- | ----- |
| New / Existing status | Yes | Yes | No |
| Profile picture | Yes | Yes | No |
| Patient notes | Yes | Yes | No |

---

## **Q: Does Adit support Patient Forms in Orthodontic PMS systems?**

A: Yes. All systems support:

* Importing completed forms  
* PDF attachment to PMS  
* General patient fields  
* Insurance fields

Partial support:

* Medical history forms (Orthotrac & Dolphin only)

Not supported:

* Allergies  
* Medical problems  
* Medications

---

## **Q: Where are patient form PDFs stored in each PMS?**

A:

* **Orthotrac:** OrthoTrac image folder → patient document/charting area  
* **Cloud 9:** Document Cabinet → Patient Document Listing  
* **Dolphin:** Patients → Documents

---

## **Q: Can Adit write or read patient notes in Orthodontic PMS systems?**

A:

| Capability | Orthotrac | Dolphin | Cloud 9 |
| ----- | ----- | ----- | ----- |
| Write notes to PMS | Yes | Yes | No |
| Read notes from PMS | Yes | Yes | No |

---

## **Q: How does Adit Pay work with Orthodontic PMS systems?**

A:

### **Orthotrac & Dolphin (Fully supported)**

* Payments written to ledger  
* Refunds supported  
* Discounts supported  
* CareCredit supported  
* Payment communication logs supported

### **Cloud 9 (Limited support)**

* Discounts not supported  
* CareCredit ledger write not supported  
* Other payment capabilities are limited compared to other systems

---

## **Q: Does Adit support insurance verification (RCM) in Orthodontic PMS systems?**

A: Yes. All three systems support:

* Insurance verification workflows  
* Attaching verification PDFs to patient files

---

## **Q: What is the overall capability of each Orthodontic PMS?**

A:

* **Orthotrac:** Strong Engage, Forms, Payments, and RCM support  
* **Dolphin:** Best-balanced orthodontic PMS with broadest support  
* **Cloud 9:** Core-only functionality with the most limitations

---

## **Q: What should be considered when selling Adit with Orthodontic PMS systems?**

A:

* Practice Analytics should not be sold or promised  
* Online Scheduling is limited (not full automation)  
* Engage \+ Payments \+ Forms are the core value drivers  
* Cloud 9 has the highest limitations and must be positioned carefully  
* PMS validation is required before onboarding

# **Optometry PMS Compatibility – Adit Integration Overview (Q\&A)**

---

## **Q: Which Optometry PMS systems does Adit support?**

A: Adit supports the following Optometry PMS platforms:

* OfficeMate (On-Prem)  
* Crystal PM (On-Prem)  
* RevEHR (Cloud)  
* EyeFinity (Cloud)  
* Revolution (Web)  
* Eyefinity

Each system has different levels of support for Engage, Scheduling, Forms, Analytics, and Payments.

---

## **Q: Do all Optometry PMS systems support the same features?**

A: No. Feature support varies significantly by PMS type.

* Engage, Scheduling, and Forms are widely supported  
* Practice Analytics is only available on select systems  
* Financial write-back (refunds/discounts) is generally not supported  
* Some cloud systems have limited or no analytics support

---

## **Q: Which Optometry PMS systems support Practice Analytics?**

A: Practice Analytics is supported only in:

* OfficeMate  
* Crystal PM  
* Revolution (Web) (partial support)

These systems support features like:

* Morning Huddle  
* Schedule analytics  
* Dashboards  
* Practice Performance  
* Growth and Reports  
* Patient Lists and Recall Reports

Not supported across all Optometry PMS:

* Provider performance analytics  
* Operatory utilization  
* Practice Health Score  
* Follow-ups analytics

---

## **Q: Which Optometry PMS systems do NOT support Practice Analytics?**

A: The following systems do not support Practice Analytics:

* RevEHR  
* EyeFinity (Cloud)  
* Eyefinity

These systems do not include dashboards, reporting analytics, or recall insights.

---

## **Q: Can Adit support Treatment Plans in Optometry PMS systems?**

A: No. Across all Optometry PMS platforms:

* Treatment Plans are not supported  
* Treatment Plan PDF attachments are not supported

---

## **Q: Does Adit support Online Scheduling for Optometry PMS systems?**

A: Yes, partially.

Fully supported:

* OfficeMate  
* Crystal PM  
* RevEHR  
* Revolution (Web)  
* Eyefinity

Not supported:

* EyeFinity (Cloud)  
* Pulling operatory hours (not supported across all systems)

Online Scheduling includes:

* Real-time availability (where supported)  
* Writing appointments into PMS  
* Provider hour syncing

---

## **Q: What Engage features are available?**

A: Most Optometry PMS systems support core Engage features:

* Appointment reminders  
* Auto-confirmations  
* Birthday messages  
* Recall reminders  
* ASAP lists

Not supported:

* EyeFinity (Cloud)

### **Optometry-specific Engage features:**

* Eyeglass ready notifications  
* Eyeglass follow-ups

Supported in:

* OfficeMate  
* Crystal PM  
* RevEHR  
* Revolution (Web)  
* Eyefinity

---

## **Q: Does Adit support Patient Forms in Optometry PMS systems?**

A: Yes, across most systems.

Fully supported:

* Import completed forms  
* PDF attachment to PMS  
* General patient fields  
* Insurance fields

Not supported:

* Medical history fields (most platforms)  
* Allergies (limited support only in some systems)  
* Medications (limited support)

EyeFinity (Cloud) has the most limited support.

---

## **Q: Does Adit support Patient Profile features?**

A: Yes, but support varies.

### **Example support breakdown:**

| Feature | OfficeMate | Crystal PM | RevEHR | EyeFinity | Revolution | Eyefinity |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| Patient status | Yes | Yes | Yes | No | Yes | Yes |
| New / Existing | Yes | Yes | Yes | No | Yes | Yes |
| Profile picture | Yes | No | Yes | No | Yes | No |
| Preferred language | Yes | Yes | Yes | No | Yes | Yes |
| Patient notes | No | Yes | Yes | No | No | No |

---

## **Q: Does Adit support payments and financial write-back in Optometry PMS systems?**

A: Yes, but limited.

### **Adit Pay ledger write support:**

* OfficeMate: Supported  
* Crystal PM: Supported  
* Others: Not supported

### **Refunds & discounts:**

* Not supported in any Optometry PMS system

### **Communication logs:**

* Supported only in Crystal PM

### **CareCredit:**

* Supported in OfficeMate and Crystal PM (region-dependent)  
* Not supported in other systems

---

## **Q: Does Adit support insurance verification (RCM)?**

A: Yes, in most systems.

Supported in:

* OfficeMate  
* Crystal PM  
* Revolution (Web)  
* Eyefinity

Capabilities include:

* Insurance verification  
* PDF attachment to patient file

Not supported in:

* RevEHR  
* EyeFinity (Cloud)

---

## **Q: What are the key sales rules for Optometry PMS systems?**

A:

* Practice Analytics should only be sold for OfficeMate, Crystal PM, and Revolution (Web)  
* Refunds and discounts write-back are not supported anywhere  
* EyeFinity (Cloud) should be positioned as Engage \+ Forms only  
* CareCredit availability depends on region  
* PMS validation is required before onboarding

---

## **Q: What is the overall capability of each Optometry PMS?**

A:

* **OfficeMate:** Best overall for Analytics \+ Scheduling  
* **Crystal PM:** Strong Analytics \+ Engage support  
* **RevEHR:** Engage \+ Scheduling only  
* **EyeFinity (Cloud):** Very limited integration  
* **Revolution (Web):** Partial Analytics \+ strong Engage  
* **Eyefinity:** Engage-focused with RCM support

---

# **Dental PMS Compatibility – Adit Integration Overview (Q\&A)**

---

## **Q: Which Dental PMS systems does Adit support?**

A: Adit supports the following Dental PMS platforms:

* Dentrix (On-Prem)  
* OpenDental  
* Eaglesoft  
* Cleardent  
* SoftDent  
* Tracker  
* PracticeWorks  
* EasyDental  
* Denticon (Planet DDS)  
* PracticeWeb  
* Abledent  
* Dentrix Ascend  
* Curve

Legacy / QA / Chrome-based PMS systems are also seen in some environments but are not fully supported.

---

## **Q: Are all Dental PMS systems supported equally?**

A: No. Support depends on the PMS version and platform.

* Modern PMS platforms support full Adit feature sets  
* Older systems (like Dentrix G6) have limited functionality  
* Some cloud or legacy systems only support partial features  
* Chrome/QA/extension-based PMS must not be sold as full integrations

---

## **Q: Which Dental PMS systems support full Practice Analytics?**

A: Full Practice Analytics is supported on modern PMS platforms only:

* OpenDental  
* Eaglesoft  
* Cleardent  
* SoftDent  
* PracticeWorks  
* EasyDental  
* Denticon  
* PracticeWeb  
* Dentrix Ascend  
* Curve

These systems support:

* Morning Huddle  
* Schedule analytics  
* Dashboards  
* Provider & hygiene performance  
* Operatory utilization  
* Practice Health Score  
* Growth & collections  
* Reports  
* Patient Lists & Patient Card  
* Follow-ups  
* Treatment-code analytics

---

## **Q: Does Dentrix G6 support Practice Analytics?**

A: No. Dentrix G6 (Legacy) does NOT support:

* Dashboards  
* Performance analytics  
* Follow-ups  
* Provider or hygiene metrics  
* Schedule analytics

Only supported feature:

* Automated Recall Report

---

## **Q: Which PMS systems have limited Practice Analytics?**

A: Tracker supports partial analytics only:

Supported:

* Morning Huddle  
* Schedule view  
* Dashboards (limited)  
* Reports  
* Patient Lists  
* Patient Card  
* Treatment-code analytics

Not supported:

* Follow-ups  
* Hygiene or operatory metrics

---

## **Q: Are Treatment Plans supported in Dental PMS systems?**

A: Yes, but only on modern systems.

### **Supported:**

* OpenDental  
* Eaglesoft  
* Cleardent  
* SoftDent  
* PracticeWorks  
* EasyDental  
* Denticon  
* PracticeWeb  
* Dentrix Ascend  
* Curve

### **Not supported:**

* Dentrix G6  
* Chrome / QA / extension-based PMS

Includes:

* Treatment plan view  
* Treatment plan PDF attachments

---

## **Q: Does Adit support auto review requests (Pozative) across all Dental PMS systems?**

A: Yes. This feature is fully supported across ALL Dental PMS platforms:

* Auto review requests are triggered when an appointment is completed  
* No PMS exceptions apply

---

## **Q: What Patient Profile features are supported?**

A: Patient Profile support varies by PMS.

### **Universally supported (most systems):**

* Active / inactive status  
* Patient notes (with some exceptions)

---

## **Q: Which systems support “New vs Existing Patient” and profile pictures?**

A:

### **New vs Existing Patient NOT supported:**

* Abledent  
* Chrome / QA PMS

### **Profile pictures NOT supported:**

* Abledent  
* Dentrix G6  
* Chrome / QA PMS

---

## **Q: Which PMS systems support preferred language?**

A:

### **NOT supported:**

* Dentrix  
* OpenDental  
* Eaglesoft  
* Tracker  
* PracticeWorks  
* EasyDental

### **Supported:**

* Cleardent  
* SoftDent  
* Denticon  
* PracticeWeb  
* Dentrix Ascend  
* Curve

---

## **Q: Does Adit support Online Scheduling for Dental PMS systems?**

A: Yes, but with version-based limitations.

### **Fully supported:**

Modern PMS systems including:

* OpenDental  
* Eaglesoft  
* Cleardent  
* SoftDent  
* PracticeWorks  
* EasyDental  
* Denticon  
* PracticeWeb  
* Dentrix Ascend  
* Curve

Includes:

* Real-time availability  
* Appointment write-back  
* Provider hours sync  
* Operatory hours sync

### **Not supported:**

* Dentrix G6  
* Chrome / QA PMS

---

## **Q: What Engage features are supported?**

A: Most Dental PMS systems support full Engage functionality:

* Appointment reminders  
* Auto-confirmations  
* Scheduled confirmations  
* Birthday messages  
* Recall reminders  
* ASAP workflows  
* Schedule tracking

### **Exceptions:**

* Track Schedule is not supported in PracticeWorks and EasyDental  
* ASAP is not supported in EasyDental  
* Scheduled confirmations are not supported in Chrome/QA PMS

---

## **Q: Does Adit support Patient Forms across Dental PMS systems?**

A: Yes, but with important limitations.

### **Not supported:**

* Dentrix G6 (import \+ PDF attachment)  
* Chrome / QA PMS

### **Medical history fields not supported:**

* Tracker  
* Abledent  
* Dentrix G6  
* Chrome PMS

### **Field-level limitations:**

* Allergies not supported in Dentrix and Dentrix G6  
* Medical problems not supported in Dentrix and Tracker  
* Medications not supported in Dentrix G6

---

## **Q: Where are patient form PDFs stored in Dental PMS systems?**

A:

* OpenDental → Images \> Patient Information  
* Eaglesoft → SmartDoc  
* Cleardent → ElectronicDoc  
* Dentrix → Document Center  
* Dentrix Ascend → Document Manager  
* Tracker → Patient \> Correspondence

---

## **Q: Can Adit write or read patient notes in Dental PMS systems?**

A:

### **Write notes NOT supported:**

* Abledent  
* Chrome PMS

### **Read notes NOT supported:**

* Dentrix G6  
* Abledent  
* Chrome PMS

---

## **Q: How does Adit Pay work across Dental PMS systems?**

A:

### **Dentrix G6 (very limited):**

* No ledger write  
* No refunds  
* No discounts

---

### **Fully supported systems:**

* OpenDental  
* Eaglesoft  
* Cleardent  
* SoftDent  
* PracticeWorks  
* EasyDental  
* Denticon  
* PracticeWeb  
* Dentrix Ascend  
* Curve

Includes:

* Ledger write  
* Refunds  
* Discounts  
* CareCredit (where applicable)

---

### **Partial support:**

* Tracker → Ledger only  
* Abledent → Ledger only

---

## **Q: Does Adit support insurance verification (RCM)?**

A:

### **Fully supported:**

* OpenDental  
* Eaglesoft  
* Cleardent  
* SoftDent  
* PracticeWorks  
* EasyDental  
* Denticon  
* PracticeWeb  
* Dentrix Ascend  
* Curve

### **Not supported:**

* Dentrix G6  
* Tracker  
* Abledent  
* Chrome / QA PMS

---

## **Q: What are the non-negotiable sales rules for Dental PMS integrations?**

A:

* Dentrix G6 must not be treated as modern Dentrix  
* Chrome/QA/extension PMS must never be oversold  
* Analytics must always be validated per PMS  
* Preferred language support is PMS-specific  
* Adit Pay is not universal across all systems

---

## **Q: What is the overall classification of Dental PMS systems?**

A:

* **Modern Dental PMS:** Full-stack Adit support (safe to sell full capabilities)  
* **Tracker / EasyDental:** Partial support (must disclose limitations)  
* **Dentrix G6:** Limited functionality only  
* **Chrome / QA PMS:** Not safe for full positioning

