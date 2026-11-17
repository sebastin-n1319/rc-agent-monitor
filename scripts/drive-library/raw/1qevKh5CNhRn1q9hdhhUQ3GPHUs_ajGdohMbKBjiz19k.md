# **AI Training Document: Adit Insurance Verification (RCM Module)**

---

## **1\. Product Overview (Core Facts)**

* Adit's Insurance Verification is part of Adit's **Revenue Cycle Management (RCM)** offering.  
* It automates and standardizes **insurance eligibility checks** to reduce claim denials, protect revenue, and streamline front-office operations.  
* Supported specialties: **Dental, Orthodontic and Optometry** practices. Scales from single-location clinics to large multi-specialty DSOs.  
* Combines **automated EDI verification** with optional **manual verification by Adit's RCM team** (Advanced tiers).  
* Verification confirms in real time:  
  * **Status** – whether the patient's insurance is active  
  * **Financials** – remaining deductibles, co-pays, out-of-pocket limits  
  * **Specialty limits** – multi-phase treatment coverage (Ortho), vision-specific allowances (Optometry)  
  * **Benefit dates** – plan effective dates and renewal cycles  
* **Best practice to recommend:** Verify eligibility **48–72 hours before every appointment** because insurance details can change at any time.  
* The current module version is **IV26**, which allows upgrading individual appointments from Basic to Advanced (pay per upgraded appointment only).

---

## **2\. Verification Tiers & Pricing**

| Tier | Verification method | CDT code coverage | Pricing | Failed verification handling |
| ----- | ----- | ----- | ----- | ----- |
| **Basic (EDI Only)** | Fully automated EDI | Up to 40 CDT codes  | \$99/month, includes 300 free EDI verifications; \$0.06 per additional verification | No cost for failed verifications; no manual expert follow-up |
| **Advanced – Standard** | EDI \+ manual expert validation by RCM team | Up to 20 CDT codes | \$99/month \+ \$1.00 per advanced verification | If EDI fails, expert team manually verifies the appointment |
| **Advanced – Extensive** | EDI \+ full manual expert validation (for complex/high-volume needs, e.g., Medicaid, HMOs) | 20 to 40 CDT codes | \$99/month \+ \$2.25 per advanced verification | All failed verifications handled by the expert team at no additional cost |
| **Add-on: Same-Day Verification** | Advanced verification with expedited turnaround | Up to 40 CDT codes on the form | Available on all plans (add-on) | Results delivered within a **60-minute SLA** |

**Shared benefits across all plans:**

* Verified PDFs and breakdown notes auto-posted into the EHR (if enabled)  
* No cost for failed verifications  
* Any individual appointment can be upgraded to Advanced verification at any time (One-Off Upgrade)

**One-Off Upgrade (Basic → Advanced) options:**

* **Standard:** up to 20 codes  
* **Extensive:** ability to select additional codes, up to 40 codes  
* If no additional codes are selected, only the treatment codes defined in Preferences are verified.  
* Billing: customer pays only for the upgraded appointment.

### **Basic vs. Advanced Verification (definition)**

* **Basic Eligibility Verification:** Automated EDI-only check. Returns standard eligibility information from the payer's EDI response, with limited benefit breakdowns or code-level analysis.  
* **Advanced Eligibility Verification:** Two layers — first EDI, then a second layer of verification by Adit's RCM team. Includes detailed benefits: deductibles, out-of-pocket maximums, co-insurance, co-payments, coverage limitations, and plan-specific rules.

---

## **3\. Setup / Onboarding Flow (RCM Module)**

Order of setup steps the assistant should walk users through:

1. **Navigate to the RCM Module.** If a welcome/demo screen appears, the account is not yet upgraded — direct the user to contact the Adit team (Upgrades) to enable access.  
2. **Practice Information.** Complete all mandatory fields (marked \*). Incorrect/missing info can cause verifications to fail or return inaccurate results.  
3. **NPI Settings.**  
   * **One NPI:** single default NPI for all verifications.  
   * **Multiple NPI:** assign NPIs per provider. Click **Add Provider** and enter Provider Name, NPI, and Tax ID exactly as configured in the EHR.  
   * Also configure each provider's **network participation and fee schedule** so retrieved benefits reflect correct in-/out-of-network status.  
4. **Verification Settings.**  
   * **Trigger Selection:** how many days before the appointment verification runs (e.g., 3 or 5 days before).  
   * **Frequency Selection:** how often patients are re-verified between appointments (default: **6 months**).  
5. **EHR / PMS Settings.**  
   * **PDF setting:** Yes/No to attach the Eligibility Verification PDF to the patient file; if Yes, choose the destination folder. File name format: `Verified Date - Patient Name`.  
   * **Patient Note setting:** Yes/No to add a note after verification.  
   * **Templates:** define the **PPO Template** and **HMO & Other Template** note formats. Available fields include Insurance Carrier, Verification Date, Plan Maximum/Remaining, Ortho Maximum/Remaining, Deductible Met (Ind).  
6. **Select Tx Codes.** Choose which treatment codes are verified per tier. Each code carries 1–4 verification questions (coverage & percentage, age limits, frequency limits, patient eligibility/next eligible date).  
7. **Notification Settings.** Enable email alerts for failed verifications. If disabled, failures can go unnoticed → unverified patients at the front desk, billing issues.  
8. **Automation Credentials.** Provide insurance portal login credentials so Adit can auto-retrieve eligibility. Click **Connect**; status shows **Authenticated** when done. These credentials are for system automation only — not for manual login use.  
9. **Portal Credentials.** For insurances that don't support full automation, provide portal username/password so Adit can perform manual verification or detailed eligibility audits.  
10. **Insurance Mapping (final step).** Map each insurance name from the EHR/PMS to Adit's standardized master insurance list via dropdown (e.g., "BCBSTX" → "Blue Cross Blue Shield of Texas"). Accurate mapping is critical for successful verification.

---

## **4\. Dashboards & Statuses**

After onboarding, users land on the **Insurance Verification Dashboard** in the RCM module. All packages see three dashboards:

1. **Basic Verification Dashboard** (EDI-based checks)  
2. **Advanced Verification Dashboard** (EDI \+ manual review)  
3. **Same-Day Verification Dashboard**

### **4.1 Dashboard cards (Basic)**

| Card | Meaning |
| ----- | ----- |
| Total Appointments | All appointments in the selected date range |
| Scheduled Appointments | Upcoming appointments eligible for verification |
| Skipped Appointments | Excluded due to Cash patient or In-House insurance |
| Successful Verifications | Verification completed successfully |
| Active Insurance | Verified; patient's insurance is active |
| Termed Insurance | Verified; insurance is no longer active |
| Failed Verifications | Could not complete due to data or payer issues |
| Incorrect Data | Failures caused by missing/incorrect patient or insurance info |
| Other Failure Reasons | Failures due to payer responses, system issues, unsupported insurance logic |
| Expired Verifications | Appointment date passed without a completed verification |
| Cancelled by User | Manually cancelled by practice or support |
| Basic Overage Cost | Charges for Basic verifications beyond the included limit |
| Total Transactions | All verification requests processed in range |
| Paid Transactions | Transactions that resulted in a billable charge |

**Advanced dashboard adds:** *Cost to Customer* card, plus columns for Insurance Type (Primary/Secondary), Eligible for Verification, and Cost for Verification. The Same-Day dashboard uses the same cards as Advanced.

### **4.2 Filters**

Date Range, Trigger Date (when verification was initiated), Appointment Date (scheduled date in EHR), Verification Status.

### **4.3 Verification Status definitions**

| Status | Meaning |
| ----- | ----- |
| In Queue | Appointment synced from EHR, waiting for trigger |
| In Progress | Verification triggered (typically 3 or 5 days before appointment) |
| Verified | Eligibility check completed successfully |
| Failed | Incorrect/missing data or payer response issues |
| Skipped | Cash patient or In-House insurance |
| Expired | Appointment date has passed |

### **4.4 Insurance Status definitions**

* **Active** – insurance active at time of verification  
* **Termed** – insurance no longer active  
* **Unknown** – verification not completed / non-final status

### **4.5 Row-level data fields**

Patient Name, Appointment Date, Trigger Date, Insurance Provider, Verification Status, Insurance Status, Verified On (completion date/time).

### **4.6 Available actions**

| Action | What it does |
| ----- | ----- |
| View | Preview the verification form |
| Download | Download the verification PDF (also synced to EHR if enabled) |
| Upgrade to Manual | One-off upgrade (EDI followed by manual verification); only when enabled |
| Audit Logs | Timestamped verification lifecycle events |
| Cancel Verification | Moves the appointment to Expired |
| Verify Same-Day | Triggers Same-Day Advanced verification |
| Mark as Cash Patient | Moves appointment to Skipped |

---

## **5\. Same-Day Verification (workflow detail)**

**How to initiate:**

1. Click **Add** on the Same-Day Verification dashboard  
2. Complete the **Patient Verification Form**  
3. Click **Verify**

**Required form information:**

* Service Code Type (STC) – auto-populated by specialty (Dental / Orthodontics)  
* CDT Codes – maximum of 40  
* Provider Details – auto-populated  
* Subscriber Details – if subscriber \= patient, enter subscriber details; if subscriber ≠ patient, enter both patient and subscriber details  
* Provider ID – select from dropdown  
* Insurance Card Upload – optional

**SLA:** The Advanced verification form is completed within **60 minutes** of submission.

---

## **6\. Failed Verifications (customer-action workflow)**

* Adit's team handles most verifications. **Customer action is required only when a verification fails due to missing/incomplete insurance or demographic information.**  
* Workflow: Click **Update** on the Failed dashboard card → list of failed appointments opens → incorrect/missing data is highlighted → open the patient detail form → correct the data → resubmit. Each corrected submission **re-triggers verification** and updates the final status.  
* If enabled, reminder email notifications prompt the practice to fix missing info and re-initiate verification before the appointment.

---

## **7\. Canonical Q\&A Pairs (training examples)**

**Q: How do I sign up for Insurance Verification?** A: It's part of Adit's RCM offering. Contact the Adit **Upgrades team** to enroll and get next steps. We also have an option for self onboarding.

**Q: How do I change which treatment codes are verified?** A: Email **support at adit.com**. The request is auto-logged as a ticket and routed to the right team. Note: because tiers (Basic, Advanced Standard, Advanced Extensive) are code-count based, changing codes may change your tier and pricing. Refer users to the "Guide to Insurance Verification Charges [https\://help.adit.com/portal/en/kb/articles/guide-to-insurance-verification-charges\#1\_Software-Only\_Package](https://help.adit.com/portal/en/kb/articles/guide-to-insurance-verification-charges#1_Software-Only_Package) " article.

**Q: Will Adit update the patient file in my PMS/EHR?** A: Yes — via a note, an attached PDF, or both, based on your preferences in the RCM module.

**Q: How do I check the status of a verification?** A: Open the **RCM module**; you land on the Verifications page. Check the color-coded **Verification Status** column and use the **Actions** column for the verification form or history.

**Q: When do I need to take action?** A: Only when a verification **fails due to missing or incomplete insurance/demographic information**. Update the details in the Adit App so verification can be re-triggered before the appointment.

**Q: What's the difference between Basic and Advanced verification?** A: Basic is automated EDI-only with standard eligibility info. Advanced adds a second layer of manual review by Adit's RCM team and returns detailed benefits (deductibles, OOP maximums, co-insurance, co-pays, limitations, plan-specific rules). Advanced comes in Standard (up to 20 codes) and Extensive (up to 40 codes).

**Q: Can I stay on Basic but get detailed verification for one patient?** A: Yes. With the IV26 module's One-Off Upgrade, you can upgrade individual appointments to Advanced and pay only for that appointment.

**Q: How am I billed?** A: All plans are \$99/month. Basic includes 300 free EDI verifications (\$0.06 each after). Advanced Standard adds \$1.00 per advanced verification; Advanced Extensive adds \$2.25. Failed verifications are never charged. Direct users to the "Guide to Insurance Verification Charges" article for full details.

**Q: How fast is Same-Day Verification?** A: Results within a 60-minute SLA. It's an Advanced add-on available on all plans, ideal for urgent or last-minute appointments.

**Q: Why did my verification fail?** A: Two failure categories: (1) **Incorrect Data** — missing or wrong patient/insurance information (fixable by the practice via the Failed card → Update flow); (2) **Other Failure Reasons** — payer responses, system issues, or unsupported insurance logic.

**Q: Why was an appointment skipped?** A: Appointments are skipped when the patient is marked as a **Cash patient** or has **In-House insurance**.

**Q: What does "Expired" mean?** A: The appointment date passed without a completed verification, or the verification was cancelled (Cancel Verification moves it to Expired).

**Q: What are Automation Credentials vs. Portal Credentials?** A: Automation Credentials are insurance portal logins Adit uses for automated retrieval (system use only). Portal Credentials cover insurances that don't support full automation, enabling Adit's team to do manual verification or detailed eligibility audits.

---

## **8\. Escalation & Routing Rules for the AI Assistant**

| User intent | Route |
| ----- | ----- |
| Enroll / purchase / upgrade plan | Adit **Upgrades team** |
| Change verified treatment codes | Email **support at adit.com** (auto-ticketed) |
| Billing disputes or charge questions beyond published pricing | Adit Support Team |
| Setup walkthrough | "How To: Set Up Insurance Verification" article |
| Status meaning questions | "How To: Check the Status of an Insurance Verification" article |
| Pricing details | "Guide to Insurance Verification Charges" (help.adit.com KB) |
| Plan selection help | Adit Support Team |

**Assistant guardrails:**

* Never quote prices other than those in Section 2\.  
* Never promise verification outcomes or guarantee payer coverage.  
* Do not ask for or store actual portal passwords in chat; direct users to enter credentials in the Automation/Portal Credentials setup screens.  
* If asked about specialties outside Dental, Ortho, Optometry, Chiropractic, state supported specialties and route to Sales/Upgrades.

---

## **9\. Glossary**

* **RCM** – Revenue Cycle Management  
* **EDI** – Electronic Data Interchange; automated payer eligibility channel  
* **CDT codes** – Dental procedure/treatment codes verified per patient  
* **STC** – Service Code Type (auto-set by specialty on Same-Day forms)  
* **NPI** – National Provider Identifier  
* **DSO** – Dental Service Organization (multi-location group)  
* **Termed** – insurance policy no longer active  
* **One-Off Upgrade** – per-appointment Basic → Advanced upgrade (IV26)  
* **SLA** – Service Level Agreement (60 minutes for Same-Day)  
* **PPO / HMO templates** – note formats posted to the patient file by plan type  
* **Basic client** – EDI-only client service model (automated verification only)  
* **Advanced client** – EDI plus manual verification by the Adit RCM team  
* **Frequency window** – period defined by the client's re-verification frequency setting, measured from the patient's last full verification  
* **Match / Non-match** – all comparison values equal → match (reuse stored result); any divergence → non-match (escalate to fresh verification)

---

### **11.1 What IV26\_v2 adds**

Two connected capabilities:

1. **Configurable re-verification frequency** at the client (practice) level.  
2. **Intelligent routing** that decides, per patient request, whether verification is served by enriched eligibility data, an **EDI eligibility call**, or a **previously stored, still-valid automation result**.

### **11.3 Frequency setting (Preferences page)**

* New dropdown with exactly three options: **1 Year, 6 Months (default), 3 Months**.  
* Default is 6 Months for **all** clients; existing clients are migrated automatically at release with no action required.  
* Applies at the **client (practice) level** and governs all patients under that client.  
* A frequency change takes effect on the **next** verification request; it never retroactively re-processes past requests.  
* Visibility/editability follows the existing preferences-page permission model.

### **11.4 Connect Insurance pages**

* The existing **Insurances Connected** page is retained for manual portal logins.  
* **Basic (soft) customers:** one "Connect Insurance" page containing automation credentials.  
* **Advanced (Soft \+ Manual) customers:** two pages — one for RCM human agents (unchanged), one for automation credentials.  
* The automation list reflects the insurances supported through the client's automation enablement; search/sort/status conventions follow existing page patterns.

### **11.5 Core concepts (canonical definitions)**

* **First request:** first verification request for a patient with no prior verified result on file for that client.  
* **Frequency window:** period defined by the client's frequency setting, measured from the patient's last full verification. Inside the window → candidate for comparison-and-reuse. Outside → full verification.  
* **Comparison values:** specific EDI-response fields compared against the stored automation result to detect material benefit changes (field set owned by Sofiyan; blocking dependency).  
* **Match:** all comparison values equal. Any divergence \= non-match.

### **11.9 Charging rules**

* **Basic clients:** no charge impact — they already receive 300 free requests, and the new flow operates within that arrangement.  
* **Advanced clients:** matched, auto-resolved requests are charged **\$0**; non-matched requests follow existing automated and manual-verification charging.

### **11.15 Internal Q\&A pairs (post-release / internal training)**

**Q: What frequency options can a client choose?** A: 1 Year, 6 Months, or 3 Months, set on the IV preferences page. Default is 6 Months for all clients, applied at the practice level.

**Q: What happens when a patient is re-verified within the frequency window?** A: The system runs a lightweight EDI check and compares defined values against the patient's stored automated result. If everything matches, the stored result is reused and stamped with today's date — for Advanced clients this is verified instantly at \$0 with no manual queue entry. If anything differs, the system calls automation (if enabled) or saves the EDI result and routes to manual verification.

**Q: Does changing the frequency reprocess old requests?** A: No. It takes effect on the next verification request only.

**Q: Are Basic (Soft) clients billed differently under IV26\_v2?** A: No — Basic (Soft) client charging is unchanged; they continue to receive 300 free requests.