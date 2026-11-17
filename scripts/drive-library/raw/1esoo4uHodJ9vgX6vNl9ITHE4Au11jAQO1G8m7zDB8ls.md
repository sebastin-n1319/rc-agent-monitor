# Dental PMS Compatibility & Feature Support

**Granular Version-Level Integration Document**

**Audience:** Sales, Technical Support (T1–T3), Implementations, Product, Leadership  
**Last Updated:** Based on current integration matrix  
Internal Only

---

## 1\. Scope & Intent

This document defines **exact Adit feature behavior per Dental PMS and version**.  
It must be used when:

* Validating **Tech Bundle eligibility**  
* Answering **“Does Adit support X on this PMS?”**  
* Preventing **oversell or misrepresentation**  
* Handling **customer escalations related to missing features**

**Rule:** If a feature is marked FALSE anywhere below, it **must not be promised**, even if adjacent PMS support it.

---

## 2\. PMS & Version Coverage (Explicit)

### 2.1 Dentrix (On-Prem)

**Server App Versions (TS only):**

* G6 (Legacy)  
* G6.2+ (Required for most integrations)

**Supported EHR Versions:**

* G6  
* G6.2  
* G7.0  
* G7.1  
* G7.2  
* G7.3

**Tech Bundle Eligibility:**

* G6.2+ → **TRUE**  
* G6 (Legacy) → **Functionally limited**

---

### 2.2 OpenDental

**Server App Version:**

* G6.2+

**Supported EHR Versions:**

* G7.0+  
* Executable ≥ 17.0.291

**Tech Bundle Eligibility:** **TRUE**

---

### 2.3 Eaglesoft

**Server App Version:**

* 15.4

**Supported EHR Versions:**

* 17  
* 18  
* 19  
* 20

**Tech Bundle Eligibility:** **TRUE**

---

### 2.4 Cleardent

**Server App Version:**

* 17.2+

**Supported EHR Versions:**

* 15.4  
* 17  
* 18  
* 19  
* 20

**Tech Bundle Eligibility:** **TRUE**

---

### 2.5 SoftDent (Cloud)

**Supported Versions:**

* 17  
* 18.1\*

**Tech Bundle Eligibility:** **TRUE**

---

### 2.6 Tracker

**Server App Version:**

* 17

**Supported EHR Version:**

* 19.11

**Tech Bundle Eligibility:** **TRUE (with gaps)**

---

### 2.7 PracticeWorks

**Server App Version:**

* 19.11

**Supported EHR Versions:**

* 20  
* 21  
* 22  
* 23+

**Tech Bundle Eligibility:** **TRUE**

---

### 2.8 EasyDental

**Server App Version:**

* 20

**Supported EHR Version:**

* 9.10+

**Tech Bundle Eligibility:** **TRUE (limited depth)**

---

### 2.9 Denticon (Planet DDS)

**Server App Versions:**

* 21  
* 22  
* 23+

**Supported EHR Versions:**

* 9.8+  
* 17.0.0+

**Tech Bundle Eligibility:** **TRUE**

---

### 2.10 PracticeWeb (GOOD TO SELL)

**Server App Version:**

* 11.29+

**Supported EHR Version:**

* 7.9+

**Tech Bundle Eligibility:** **TRUE**

---

### 2.11 Abledent

**Server App Version:**

* 11.1+

**Supported EHR Version:**

* Version 10\*

**Tech Bundle Eligibility:** **TRUE (partial)**

---

### 2.12 Dentrix Ascend (Cloud)

**Supported Versions:**

* 12.10.6  
* 14.4.2  
* 14.8.2

**Tech Bundle Eligibility:** **TRUE**

---

### 2.13 Curve (Cloud)

**Supported Versions:**

* 15+

**Tech Bundle Eligibility:** **TRUE**

---

### 2.14 Legacy / QA / Chrome Extension PMS

**Includes:**

* Old Dentrix  
* Chrome Extension PMS  
* PMS in QA

**Tech Bundle Eligibility:** **FALSE**

---

## 3\. Practice Analytics — FULL BREAKDOWN

### 3.1 Analytics NOT Supported on Dentrix G6 (Legacy)

Dentrix G6 does **NOT** support:

* Morning Huddle  
* Schedule analytics  
* Dashboards  
* Any performance dashboards  
* Follow-ups  
* TX code–based analytics

**Only supported:**

* Automated Recall Report

---

### 3.2 Analytics FULLY Supported (Modern PMS)

The following PMS support **ALL** analytics rows below:

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

**Includes:**

* Morning Huddle  
* Schedule analytics  
* Dashboards  
* Practice Performance  
* Provider Performance  
* Hygiene Performance  
* Operatory Utilization  
* Practice Health Score  
* Growth  
* Collections  
* Reports  
* Patient Lists  
* Patient Card  
* Follow-ups  
* TX codes on appointment booking  
* TX codes pulled from appointments

---

### 3.3 Tracker — Partial Analytics Only

Tracker supports:

* Morning Huddle  
* Schedule  
* Dashboards  
* Performance dashboards  
* Reports  
* Patient Lists  
* Patient Card  
* TX code analytics

**Tracker does NOT support:**

* Follow-ups  
* Hygiene / Operatory metrics

---

## 4\. Treatment Plans (Explicit)

**Supported (TRUE):**

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

**NOT Supported:**

* Dentrix G6  
* Chrome / QA PMS

Includes:

* Treatment Plan view  
* Treatment Plan PDF attachment

---

## 5\. Pozative (Reviews)

**Universal across ALL Dental PMS:**

* Auto review request when appointment is completed

No PMS exception here.

---

## 6\. Patient Profile — Granular Differences

### 6.1 Universally Supported

* Patient active/inactive  
* Patient notes (except limited PMS noted below)

---

### 6.2 New vs Existing Patient

**NOT Supported:**

* Abledent  
* Chrome / QA PMS

---

### 6.3 Profile Pictures — NOT Universal

**NOT Supported on:**

* Abledent  
* Dentrix G6  
* Chrome Extension PMS

---

### 6.4 Preferred Language

**NOT Supported on:**

* Dentrix  
* OpenDental  
* Eaglesoft  
* Tracker  
* PracticeWorks  
* EasyDental

Supported only on:

* Cleardent  
* SoftDent  
* Denticon  
* PracticeWeb  
* Dentrix Ascend  
* Curve

---

## 7\. Online Scheduling — Exact Behavior

### Fully Supported (Modern PMS)

* Real-time availability  
* Appointment write-back  
* Provider hours  
* Operatory hours

### NOT Supported

* Dentrix G6  
* Chrome Extension PMS

---

## 8\. Engage — Row-Level Truth

### Fully Supported (Modern PMS)

* Appointment reminders  
* Auto confirmations  
* Scheduled confirmations  
* Birthday wishes  
* Recall reminders  
* ASAP  
* Track schedule in Engage

---

### Engage Exceptions

| Feature | NOT Supported On |
| ----- | ----- |
| Track Schedule | PracticeWorks, EasyDental |
| ASAP | EasyDental |
| Scheduled Confirmations | Chrome / QA PMS |

---

## 9\. Patient Forms — Detailed Mapping

### 9.1 Import & PDF Attachment

**NOT Supported:**

* Dentrix G6  
* Chrome / QA PMS

---

### 9.2 Medical History Fields

**NOT Supported:**

* Tracker  
* Abledent  
* Dentrix G6  
* Chrome PMS

---

### 9.3 Allergies / Medical / Medications

| Field | NOT Supported On |
| ----- | ----- |
| Allergies | Dentrix, Dentrix G6 |
| Medical Problems | Dentrix, Tracker |
| Medications | Dentrix G6 |

---

### 9.4 PDF Storage Locations

* OpenDental → Images \> Patient Information  
* Eaglesoft → SmartDoc  
* Cleardent → ElectronicDoc  
* Dentrix → Document Center  
* Dentrix Ascend → Document Manager  
* Tracker → Patient \> Correspondence

---

## 10\. Patient Notes & Logs

### Write Notes to PMS

**NOT Supported:**

* Abledent  
* Chrome PMS

### Read Notes from PMS

**NOT Supported:**

* Dentrix G6  
* Abledent  
* Chrome PMS

---

## 11\. Adit Pay — Strict Matrix

### 11.1 Dentrix G6

* NO ledger write  
* NO refunds  
* NO discounts

---

### 11.2 Fully Supported (Ledger \+ Refund \+ Discount \+ CareCredit)

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

---

### 11.3 Partial Support

* Tracker → Ledger only  
* Abledent → Ledger only

---

## 12\. RCM — Insurance Verification

### Fully Supported

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

### NOT Supported

* Dentrix G6  
* Tracker  
* Abledent  
* Chrome PMS

---

## 13\. Non-Negotiable Rules (Must Be Followed)

1. **Dentrix G6 ≠ Modern Dentrix**  
2. **Chrome PMS must never be oversold**  
3. **Analytics promises require PMS verification**  
4. **Preferred language is PMS-specific**  
5. **Adit Pay ≠ universal**

---

## 14\. Final Classification

| Category | Safe to Sell Full Stack |
| ----- | ----- |
| Modern Dental PMS | Yes |
| Tracker / EasyDental | With disclosure |
| Dentrix G6 | Limited |
| Chrome / QA PMS | No |

# **Optometry PMS Compatibility – Feature & Version Support**

**Platforms Covered:** OfficeMate (On-Prem), Crystal PM (On-Prem), RevEHR (Cloud), EyeFinity (Cloud), Revolution (Web), Eyefinity  
**Internal Use Only**

---

## **1\. Overview**

This section documents **Adit’s integration capabilities for Optometry PMS platforms**.  
Compared to Dental and Ortho systems, Optometry PMS support shows **strong Engage, Scheduling, and Forms coverage**, with **selective Practice Analytics availability** and **limited financial write-back functionality**.

Proper **PMS-specific positioning** is required, especially for **Analytics scope and Payments**.

---

## **2\. Version & Deployment Requirements**

### **2.1 OfficeMate (On-Prem)**

**Supported EHR Version:**

* Version 12

**Deployment:**

* On-Prem

**Tech Bundle Eligibility:**

* **Yes**

**Positioning Summary:**  
OfficeMate is the **most capable Optometry PMS** for Practice Analytics among supported platforms.

---

### **2.2 Crystal PM (On-Prem)**

**Supported EHR Version:**

* Version 6.1.9

**Deployment:**

* On-Prem

**Tech Bundle Eligibility:**

* **Yes**

**Positioning Summary:**  
Comparable to OfficeMate for Analytics, with **strong Engage and Forms support**.

---

### **2.3 RevEHR (Cloud)**

**Deployment:**

* Cloud-based

**Supported Versions:**

* Vendor-managed (cloud)

**Tech Bundle Eligibility:**

* **Yes**

**Positioning Summary:**  
Strong for Engage, Scheduling, and Forms. **No Practice Analytics support**.

---

### **2.4 EyeFinity (Cloud)**

**Deployment:**

* Cloud-based

**Supported Versions:**

* Vendor-managed

**Tech Bundle Eligibility:**

* **No Analytics Support**

**Positioning Summary:**  
Limited integration depth. Best positioned for **basic Engage and Forms only**.

---

### **2.5 Revolution (Web)**

**Deployment:**

* Web-based

**Supported Versions:**

* Vendor-managed

**Tech Bundle Eligibility:**

* **Yes**

**Positioning Summary:**  
Good Engage and Scheduling support with **partial Analytics**.

---

### **2.6 Eyefinity**

**Deployment:**

* Cloud-based

**Supported Versions:**

* Vendor-managed

**Tech Bundle Eligibility:**

* **Yes (Limited Analytics)**

---

## **3\. Practice Analytics**

### **3.1 Platforms with Analytics Support**

**OfficeMate, Crystal PM, Revolution (Web)** support the following:

* Morning Huddle  
* Schedule analytics  
* Dashboards  
* Practice Performance  
* Capture Dashboard  
* Growth  
* Reports  
* Patient Lists  
* Patient Card  
* Automated Recall Reports  
* Treatment-code–based appointment analytics

**Not Supported (All Optometry PMS):**

* Provider Performance  
* Operatory Utilization  
* Practice Health Score  
* Follow-ups

---

### **3.2 Platforms without Analytics**

**RevEHR, EyeFinity (Cloud), Eyefinity**:

* No Practice Analytics  
* No Dashboards  
* No Reports or Recall analytics

**Sales Rule:**  
Analytics must **not be positioned or implied** for these PMS platforms.

---

## **4\. Treatment Planning**

Across **all Optometry PMS platforms**:

* Treatment Plans are **not supported**  
* Treatment Plan PDF attachment is **not supported**

---

## **5\. Pozative (Reviews)**

| Platform | Auto Review on Appt Completion |
| ----- | ----- |
| OfficeMate | Yes |
| Crystal PM | Yes |
| RevEHR | No |
| EyeFinity (Cloud) | No |
| Revolution (Web) | Yes |
| Eyefinity | Yes |

---

## **6\. Patient Profile Support**

### **Supported Capabilities**

| Feature | OM | Crystal | RevEHR | EyeFinity | Revolution | Eyefinity |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| Patient Status | Yes | Yes | Yes | No | Yes | Yes |
| New / Existing | Yes | Yes | Yes | No | Yes | Yes |
| Profile Picture | Yes | No | Yes | No | Yes | No |
| Preferred Language | Yes | Yes | Yes | No | Yes | Yes |
| Patient Notes | No | Yes | Yes | No | No | No |

---

## **7\. Online Scheduling**

### **Fully Supported**

* Real-time availability  
* Writing appointments into PMS  
* Provider hour sync

Supported in:

* OfficeMate  
* Crystal PM  
* RevEHR  
* Revolution (Web)  
* Eyefinity

### **Not Supported**

* EyeFinity (Cloud)

### **Universally Not Supported**

* Pulling operatory hours (all platforms)

---

## **8\. Engage Module Support**

### **Core Engage (Strong Coverage)**

All platforms **except EyeFinity (Cloud)** support:

* Appointment reminders  
* Auto-confirmations  
* Birthday wishes  
* Recall reminders  
* ASAP lists

### **Optometry-Specific Engage Features**

Supported in **OfficeMate, Crystal PM, RevEHR, Revolution, Eyefinity**:

* Eyeglass Ready notifications  
* Eyeglass follow-ups

---

### **Partial / Platform-Specific**

| Feature | OfficeMate | Crystal | RevEHR | EyeFinity | Revolution | Eyefinity |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| Scheduled Confirmations | Yes | Yes | Yes | No | No | No |
| Order Status Update | Yes | Yes | No | No | No | No |

---

## **9\. Patient Forms Integration**

### **Fully Supported (Except EyeFinity Cloud)**

* Import completed forms  
* PDF attachment to PMS  
* General patient fields  
* Insurance fields

### **Not Supported (All Platforms)**

* Medical history fields  
* Allergies (except OfficeMate, RevEHR, Revolution)  
* Medical problems (OfficeMate, RevEHR only)  
* Medications (OfficeMate, RevEHR, Revolution)

---

## **10\. Payments & Financial Write-Back**

### **Write Logs into PMS**

* Crystal PM  
* Revolution  
* Eyefinity

### **Payment Communication Logs**

* Crystal PM only

---

### **Adit Pay Ledger Write**

| Platform | Ledger Write |
| ----- | ----- |
| OfficeMate | Yes |
| Crystal PM | Yes |
| Others | No |

### **Refunds & Discounts**

* **Not supported on any Optometry PMS**

---

### **CareCredit (US Only – Not for Canadian Clients)**

* Ledger write supported in:  
  * OfficeMate  
  * Crystal PM  
* Not supported elsewhere

---

## **11\. RCM (Insurance Verification)**

Supported in:

* OfficeMate  
* Crystal PM  
* Revolution (Web)  
* Eyefinity

Capabilities:

* Insurance verification  
* PDF attachment to patient file

Not supported in:

* RevEHR  
* EyeFinity (Cloud)

---

## **12\. Sales & Implementation Rules (Mandatory)**

* Practice Analytics should only be sold for:  
  * OfficeMate  
  * Crystal PM  
  * Revolution (Web)  
* Financial expectations must be set clearly:  
  * No refunds or discounts write-back  
* EyeFinity (Cloud) is **Engage \+ Forms only**  
* CareCredit availability must be confirmed by **country**  
* PMS validation is mandatory before onboarding

---

## **13\. Summary Classification**

| PMS | Overall Capability |
| ----- | ----- |
| OfficeMate | Best Analytics \+ Scheduling |
| Crystal PM | Strong Analytics \+ Engage |
| RevEHR | Engage & Scheduling only |
| EyeFinity (Cloud) | Very limited integration |
| Revolution (Web) | Partial Analytics \+ Engage |
| Eyefinity | Engage-focused with RCM |

# **Chiropractic PMS Compatibility** 

# **Platforms Covered:** ChiroTouch (On-Prem), Jane, ChiroTouch (Cloud) **Internal Use Only**

---

## **1\. Overview**

This section documents **Adit’s integration depth with Chiropractic PMS platforms**.  
These systems generally support **Engage, Online Scheduling, Patient Forms, and Payments**, while **Practice Analytics support is limited, phased, or roadmap-dependent**.

Clear expectation setting is required, especially for **Analytics timelines and financial write-backs**.

---

## **2\. Version & Server App Requirements**

### **2.1 ChiroTouch (On-Prem)**

**Server App Version (TS Only):**

* 1.0.0.38

**Supported EHR Version:**

* 7.2.13

**Tech Bundle Eligibility:**

* **Yes**

**Analytics Roadmap Note:**

* Partial analytics supported  
* Broader analytics coverage planned **mid-May** (approximate)  
* Current functionality is **not dashboard-complete**

---

### **2.2 Jane**

**Deployment:**

* Cloud-based

**Supported Versions:**

* Cloud PMS (vendor-managed)

**Tech Bundle Eligibility:**

* **Yes**

**Analytics Availability:**

* Targeted availability: **October 2024**  
* Currently **no active Practice Analytics**

---

### **2.3 ChiroTouch (Cloud)**

**Deployment:**

* Cloud-based

**Supported Versions:**

* Cloud PMS (vendor-managed)

**Tech Bundle Eligibility:**

* **Yes**

**Analytics Availability:**

* Targeted availability: **October 2024**  
* No dashboards or analytics at present

---

## **3\. Practice Analytics (Highly Limited)**

### **3.1 ChiroTouch (On-Prem)**

**Supported:**

* Morning Huddle  
* Schedule  
* Practice Performance  
* Growth  
* Collections  
* Reports  
* Patient Lists  
* Patient Card  
* Automated Recall Report

**Not Supported:**

* Dashboards (visual)  
* Provider, Hygiene, Operatory utilization  
* Practice Health Score  
* Follow-ups  
* Treatment-code analytics

---

### **3.2 Jane & ChiroTouch (Cloud)**

**Not Supported (Current):**

* Morning Huddle  
* Schedule analytics  
* Dashboards  
* Performance metrics  
* Growth & Collections  
* Reports  
* Patient Lists  
* Recall analytics

**Operational Rule:**  
Practice Analytics **must not be positioned as live** for Jane or ChiroTouch Cloud until the October release.

---

## **4\. Treatment Planning**

Across all three platforms:

* Treatment Plans are **not supported**  
* Treatment Plan PDF attachment is **not supported**

---

## **5\. Pozative (Reviews)**

All three platforms support:

* **Auto review request when appointment is completed**

This feature is **fully reliable** and safe to sell.

---

## **6\. Patient Profile Capabilities**

### **Fully Supported (All Platforms)**

* Patient status (active/inactive)  
* Patient status (new/existing)  
* Preferred language  
* Patient notes

### **Not Supported (All Platforms)**

* Profile pictures

---

## **7\. Online Scheduling (Strong Coverage)**

All three platforms support:

* Real-time availability  
* Writing appointments into PMS  
* Pulling operatory hours  
* Pulling provider hours

**Positioning Note:**  
Online Scheduling is a **strong selling point** for all Chiropractic PMS platforms.

---

## **8\. Engage Module Support**

### **Fully Supported (All Platforms)**

* Appointment reminders  
* Auto-confirmations  
* Birthday wishes  
* Recall reminders  
* Schedule tracking inside Engage  
* ASAP lists

### **Partial Support**

* Scheduled confirmations:  
  * Supported only in **ChiroTouch (On-Prem)**  
  * Not supported in Jane or ChiroTouch (Cloud)

---

## **9\. Patient Forms Integration**

### **Fully Supported (All Platforms)**

* Import completed forms  
* PDF attachment to PMS  
* General patient field mapping  
* Insurance field mapping

### **Not Supported (All Platforms)**

* Medical history form fields  
* Allergies  
* Medical problems  
* Medications

**PDF Storage:**

* PMS-managed document storage (platform-specific)

---

## **10\. Patient Notes & Logs**

All three platforms support:

* Writing patient notes/logs to PMS  
* Reading patient notes/logs from PMS into Adit

---

## **11\. Adit Pay Integration**

### **ChiroTouch (On-Prem)**

* Write payments to communication logs: **Yes**  
* Write payments to ledger: **Yes**  
* Refunds: **Not supported**  
* Discounts: **Not supported**

---

### **Jane**

* Write payments to ledger: **Yes**  
* Refunds: **Yes**  
* Discounts: **Not supported**  
* Communication log write: **Not supported**

---

### **ChiroTouch (Cloud)**

* Write payments to ledger: **Yes**  
* Refunds: **Yes**  
* Discounts: **Yes**  
* Communication log write: **Not supported**

---

## **12\. RCM (Insurance Verification)**

All three platforms:

* **Do not support** attaching insurance verification PDFs back into the PMS

RCM should be positioned as **external workflow support only**.

---

## **13\. Sales & Implementation Rules (Mandatory)**

* Practice Analytics must be **clearly phased**:  
  * ChiroTouch On-Prem → partial today, expanding mid-May  
  * Jane & ChiroTouch Cloud → **October**  
* Do not oversell dashboards or advanced analytics  
* Online Scheduling and Engage are the **primary value drivers**  
* Payment write-back behavior varies by platform and must be disclosed  
* PMS validation is required before onboarding

---

## **14\. Summary Classification**

| PMS | Overall Capability |
| ----- | ----- |
| ChiroTouch (On-Prem) | Strong scheduling, partial analytics |
| Jane | Strong Engage & Payments, analytics roadmap |
| ChiroTouch (Cloud) | Strong Engage & Payments, most flexible refunds |

---

# **Orthodontic PMS Compatibility – Feature & Version Support**

**Platforms Covered:** Orthotrac, Dolphin, Cloud 9  
**Internal Use Only**

---

## **1\. Overview**

This section documents **Adit’s integration depth and feature availability for Orthodontic PMS platforms**.  
While these systems support **core Engage, Forms, Payments, and RCM workflows**, they have **significant limitations in Practice Analytics and Online Scheduling**.

These PMS platforms should be sold with **clear scope control and expectation setting**.

---

## **2\. Version & Server App Requirements**

### **2.1 Orthotrac**

**Server App Version (TS Only):**

* 1.0.0.38

**Supported EHR Versions:**

* 15.6

**Tech Bundle Eligibility:**

* **Yes**

**Positioning Note:**  
Orthotrac supports Engage, Forms, Payments, and RCM well, but **does not support Practice Analytics dashboards or real-time scheduling**.

---

### **2.2 Dolphin**

**Server App Version (TS Only):**

* 1.0.0.38

**Supported EHR Versions:**

* 10.06.8486.38254

**Tech Bundle Eligibility:**

* **Yes**

**Positioning Note:**  
Dolphin provides stronger Engage and Forms coverage than Cloud 9, with **limited analytics and partial provider-hour sync**.

---

### **2.3 Cloud 9**

**Deployment:**

* Cloud-based Orthodontic PMS

**Server App Version:**

* Not applicable

**Supported Versions:**

* Cloud PMS (version controlled by vendor)

**Tech Bundle Eligibility:**

* **Yes**

**Positioning Note:**  
Cloud 9 supports core engagement and payments but has **the most functional limitations** among the three platforms.

---

## **3\. Practice Analytics (Not Supported)**

Across **Orthotrac, Dolphin, and Cloud 9**, the following Practice Analytics features are **not supported**:

* Morning Huddle  
* Schedule dashboards  
* Practice, Provider, Hygiene performance  
* Operatory utilization  
* Practice health score  
* Growth and collections dashboards  
* Reports  
* Follow-ups  
* Treatment-code–based appointment analytics

### **Limited Analytics Capability**

* **Patient Lists** are supported in Orthotrac and Dolphin  
* Cloud 9 does **not** support Patient Lists

**Operational Guidance:**  
Practice Analytics **must not be sold or promised** for these PMS platforms.

---

## **4\. Appointment & Treatment Limitations**

* Treatment codes **cannot** be attached when booking appointments  
* Treatment codes **cannot** be pulled from appointments  
* Automated recall reports are **not available**  
* Treatment plan PDFs are **not supported**

### **Supported Exception**

* **Auto-assign forms (without treatment codes)** is supported in:  
  * Orthotrac  
  * Dolphin

---

## **5\. Pozative (Reviews)**

All three platforms support:

* **Auto review request when appointment is completed**

This feature is **fully reliable** and safe to position.

---

## **6\. Patient Profile Capabilities**

### **Fully Supported (All PMS)**

* Patient active/inactive status  
* Preferred language

### **Partially Supported**

| Feature | Orthotrac | Dolphin | Cloud 9 |
| ----- | ----- | ----- | ----- |
| Patient New / Existing | Yes | Yes | No |
| Profile Picture | Yes | Yes | No |
| Patient Notes | Yes | Yes | No |

---

## **7\. Online Scheduling**

### **Not Supported**

* Real-time availability  
* Writing appointments into PMS

### **Supported**

* Pull operatory hours (all three)  
* Pull provider hours (Orthotrac only)

**Important Note:**  
Online Scheduling must be positioned as **limited availability sync**, not full appointment automation.

---

## **8\. Engage Module Support**

### **Fully Supported (All PMS)**

* Appointment reminders (Family reminders)  
* Auto-confirmations  
* Birthday wishes  
* ASAP lists  
* Schedule tracking within Engage

### **Partial Support**

| Feature | Orthotrac | Dolphin | Cloud 9 |
| ----- | ----- | ----- | ----- |
| Scheduled confirmations | Yes | Yes | No |
| Recall reminders | No | Yes | Yes |

---

## **9\. Patient Forms Integration**

### **Fully Supported (All PMS)**

* Import completed forms  
* PDF attachment to PMS  
* General patient fields  
* Insurance fields

### **Partial Support**

* Medical history fields:  
  * Supported in Orthotrac & Dolphin  
  * Not supported in Cloud 9

### **Not Supported**

* Allergies  
* Medical problems  
* Medications

---

## **10\. Form PDF Storage Locations**

* **Orthotrac:**  
  `OrthoTrac exe folder → \image\pwimage Patient > Edit Charting > Imaging > Documents`  
* **Cloud 9:**  
  `Home → Document Cabinet → Search Patient → Document Listing`  
* **Dolphin:**  
  `Patients → Documents`

---

## **11\. Patient Notes & Logs**

| Capability | Orthotrac | Dolphin | Cloud 9 |
| ----- | ----- | ----- | ----- |
| Write notes to PMS | Yes | Yes | No |
| Read notes from PMS | Yes | Yes | No |

---

## **12\. Adit Pay Integration**

### **Fully Supported (Orthotrac & Dolphin)**

* Write payments to ledger  
* Write refunds  
* Write discounts  
* Write CareCredit payments  
* Log payment communication

### **Cloud 9 Limitations**

* Discounts not supported  
* CareCredit ledger write not supported

---

## **13\. RCM (Insurance Verification)**

All three platforms support:

* Insurance verification  
* PDF attachment of verification results to patient file

---

## **14\. Sales & Implementation Rules (Mandatory)**

* **Do not sell Practice Analytics** for Orthodontic PMS  
* Clearly position **Engage \+ Payments \+ Forms** as core value  
* Online Scheduling must be framed as **limited**  
* Cloud 9 has the **highest functional constraints**  
* PMS validation is mandatory before onboarding

---

## **15\. Summary Classification**

| PMS | Overall Capability |
| ----- | ----- |
| Orthotrac | Strong Engage, Forms, Payments |
| Dolphin | Best balance among Ortho PMS |
| Cloud 9 | Core-only support, limited depth |

---

