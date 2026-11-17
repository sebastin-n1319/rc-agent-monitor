Adit RCM – Insurance Verification
      AI Assistant Training & Knowledge Base
            Version 1.0 | CY26 Q1 Release
1. Product Overview
Adit's Revenue Cycle Management (RCM) – Insurance Verification solution helps healthcare
practices automate and standardize insurance eligibility checks, reduce claim denials, protect
revenue, and streamline front-office operations.


 Supported Specialties
    •​ Dental
    •​ Orthodontics
    •​ Optometry


Unlike manual workflows or basic EDI-only tools, Adit's RCM combines automated EDI verification
with optional professional manual verification, delivered in clearly defined tiers. It scales from
single-location clinics to large multi-specialty DSOs.


 What Insurance Verification Confirms
   •​ Status – Is the patient's insurance currently active?
   •​ Financials – Remaining deductibles, co-pays, out-of-pocket limits
   •​ Specialty Limits – Multi-phase treatment coverage (Ortho), vision-specific allowances
       (Opto)
   •​ Benefit Dates – Plan effective dates and renewal cycles
   •​ Procedure-level benefit details (for enhanced accuracy)


Best Practice: Verify eligibility 48–72 hours before every appointment. Insurance details can
change at any time. This reduces claim denials and billing surprises.



2. Verification Tiers & Pricing

2.1 Tier Comparison
Adit offers three verification tiers. Basic uses EDI automation only; Advanced tiers add professional
manual verification on top.


 Feature                  Basic                   Advanced Standard        Advanced Extensive
 Verification Type        EDI Only (Soft)         EDI + Manual (Soft +     EDI + Manual (Soft +
                                                  Hard)                    Hard)
 CDT Codes                Up to 40 codes          Up to 20 codes           20–40 codes
 Free Transactions        300/month               Included in $149/mo      Included in $149/mo
                                                  fee                      fee
 Overage Charge           $0.06 per transaction   Tiered fees apply        Tiered fees apply
 One-Off Upgrade          Yes → Advanced           N/A                      N/A
 Same-Day Add-On          Available                Available                Available
 Configuration            Limited (standardized)   Editable form            Editable form
 Manual Fallback          No                       Yes                      Yes



2.2 Basic Verification
Basic Verification is a fully automated eligibility check performed via EDI (Electronic Data
Interchange). It returns standard eligibility information from the payer's EDI response.
    •​ Supports up to 40 CDT codes
    •​ No manual intervention — entirely EDI-driven
    •​ Includes 300 free transactions per month
    •​ Overage charge: $0.06 per transaction beyond 300
    •​ Cancelled verifications do not count toward the transaction limit



2.3 Advanced Verification
Advanced Verification provides a comprehensive eligibility and benefits check, including detailed
benefit information: deductibles, out-of-pocket maximums, co-insurance, co-payments, coverage
limitations, and plan-specific rules.
    •​ Standard Advanced: up to 20 CDT codes — EDI + Manual verification
    •​ Extensive Advanced: 20–40 CDT codes — EDI + Manual verification
    •​ Includes 'Next Eligible Date' information
    •​ Monthly fee: $149; tiered per-verification fees apply



2.4 One-Off Upgrade (Basic → Advanced)
Basic plan clients can upgrade individual appointments to Advanced verification without switching
their entire plan. They pay only for that specific appointment.
    •​ Upgrade option available from the dashboard for In Queue or Verified appointments
    •​ If Upgraded after EDI completes, cost = EDI cost + Advanced cost
    •​ Standard upgrade: up to 20 codes
    •​ Extensive upgrade: up to 40 codes



2.5 Same-Day Verification (Paid Add-On)
Available across all tiers for walk-ins or urgent eligibility needs.
   •​ Supports up to 40 CDT codes
   •​ Instant Active/Termed notification within a 60-minute SLA
   •​ Detailed benefit breakdown continues processing in the background
   •​ Cost: $6 per verification (displayed via tooltip in the dashboard)
   •​   PDF sync is included



2.6 Medicaid & HMO Handling
For Medicaid and HMO insurance plans, the system bypasses standard EDI calls because CDT
codes and plan information are typically unavailable via EDI.
   •​ Uses scraper APIs to download eligibility and history PDFs
   •​ Pricing follows the same structure as the selected verification tier (Basic or Advanced)
3. Setting Up Insurance Verification

3.1 Getting Started
To access Adit's Insurance Verification, your account must be upgraded to include RCM. If the RCM
module shows a welcome/demo screen, the account has not yet been upgraded.
    •​ Contact the Adit Upgrades team to enroll
    •​ Schedule a consultation via the platform — the Adit team will guide the entire configuration



3.2 Setup Steps
Step 1 – Practice Information
Enter basic practice details used exclusively by the Adit verification team for accurate insurance
coverage checks. Complete all required fields, then click Next.


Step 2 – Verification Settings
Trigger Settings: Configure how far in advance of an appointment verification should be initiated —
either 3 days or 5 days before the appointment date.
EHR/PMS Write-Back Settings: Choose how verification results are returned to the patient record:
    •​ Attach a PDF of verification results to the patient record
    •​ Add a note to the patient's chart (synced to Communication Logs in the EHR)
    •​ Both options can be enabled simultaneously
    •​ If PDF is enabled, select the EHR folder where PDFs should be stored


Step 3 – Select Treatment Codes (Tx Codes)
Select the CDT codes that should be verified for Basic and/or Advanced verifications. Each code
includes 1–4 verification questions covering:
    •​ Whether the treatment is covered and at what percentage
    •​ Age limitations for coverage
    •​ Frequency limitations
    •​ Patient eligibility and next eligible date (if applicable)


Basic package: up to 40 codes. Advanced Standard: up to 20 codes. Advanced Extensive: up to 40
codes.


Step 4 – Insurance Mapping
Map insurance names from your EHR/PMS to Adit's master insurance list. This standardization
ensures consistent handling across the RCM module.
Example: Your EHR may list 'BCBSTX'; Adit's master list uses 'Blue Cross Blue Shield of Texas'.
Select the correct standardized option from the dropdown.
   •​ Adit supports 350+ insurers in its master list
•​   Medicaid/HMO plans are handled via scraper — not EDI
4. Verification Status Lifecycle

4.1 How Status Flows
When appointments are synced from your EHR, they enter the RCM module and progress through
a defined lifecycle until verification is complete or the appointment date passes.


               In Queue → In Progress → Verified / Failed / Skipped / Expired



4.2 Verification Status Definitions
 Status                  Meaning
 In Queue                Appointment synced from EHR and waiting for the verification
                         trigger date.
 In Progress             Verification has been triggered (3 or 5 days before appointment).
                         EDI attempts are ongoing. Remains In Progress until a final
                         resolution is reached.
 Verified (Active)       Eligibility check completed successfully — patient's insurance is
                         currently active.
 Verified (Termed)       Eligibility check completed — patient's insurance is no longer
                         active. Charge: $0.75 only for advanced package
 Failed                  Verification failed due to incorrect/missing patient or insurance data,
                         or payer response issues. Does NOT automatically expire — can
                         be retried after correction.
 Skipped                 Appointment excluded from verification — applies to Cash patients
                         or In-House insurance plans.
 Expired                 Appointment date has passed and verification was not completed.
                         Applies to cancelled appointments, no-shows, past dates, and
                         non-patients.



4.3 Insurance Status Definitions
 Status                  Meaning
 Active                  Insurance is active at the time of verification.
 Termed                  Insurance is no longer active at the time of verification.
 Unknown                 Verification is not yet complete or falls under a non-final status (e.g.,
                         In Progress).
4.4 Retry & Expiration Logic
  •​   System makes up to 3 automated retry attempts for payer-side EDI failures
  •​   After 3 retries, practice can correct the data and re-trigger — up to 2 additional manual
       reattempts
  •​   Failed verifications do NOT move to Expired automatically — they persist until the
       appointment date passes
  •​   Appointments only expire when the appointment date has passed and verification is still
       incomplete



4.5 Advanced Verification Logic (Soft + Hard)
  •​   EDI Success (Termed) → No manual verification needed
  •​   EDI Success (Active) → Triggers manual (hard) verification. View icon enabled immediately
       while hard verification continues
  •​   EDI Failed + Manual Verified → Final status: Verified
  •​   EDI Failed + Manual Failed → Final status: Failed
  •​   Manual verification status shows amber while pending; turns green when complete
5. Dashboards & Monitoring

5.1 Where to Find Verification Status
Navigate to the RCM module within the Adit platform. You will be directed automatically to the
Insurance Verification Dashboard. All three dashboards are visible regardless of your package:
    •​ Basic Verification Dashboard
    •​ Advanced Verification Dashboard
    •​ Same-Day Verification Dashboard



5.2 Basic Verification Dashboard
Displays all EDI-based automated eligibility checks.

Dashboard Cards
   •​   Total Appointments – All appointments in the selected date range
   •​   Scheduled Appointments – Upcoming appointments eligible for verification
   •​   Skipped Appointments – Excluded due to Cash or In-House insurance
   •​   Successful Verifications – Verifications completed successfully
   •​   Active Insurance – Successfully verified with active insurance
   •​   Termed Insurance – Successfully verified but insurance is no longer active
   •​   Failed Verifications – Could not complete due to data or payer issues
   •​   Incorrect Data – Failed due to missing or incorrect patient/insurance info
   •​   Other Failure Reasons – Payer responses, system issues, unsupported logic
   •​   Expired Verifications – Appointment date passed without completed verification
   •​   Cancelled by User – Manually cancelled by practice or support
   •​   Basic Overage Cost – Charges for verifications beyond the 300 free transactions
   •​   Total Transactions – Total verification requests processed
   •​   Paid Transactions – Billable verification transactions


Filters & Date Selection
   •​   Date Range – Filter by time period
   •​   Trigger Date – Date verification was initiated by the system
   •​   Appointment Date – The scheduled care date in the EHR
   •​   Verification Status – Filter by In Queue, In Progress, Verified, Failed, Skipped, or Expired


Appointment-Level Columns
   •​   Patient Name, Appointment Date, Trigger Date
   •​   Insurance Provider, Verification Status, Insurance Status, Verified On



5.3 Advanced Verification Dashboard
Includes all Basic Dashboard cards plus:
    •​ Cost to Customer – Total verification cost for the selected date range
    •​ Additional columns: Insurance Type (Primary/Secondary), Eligible for Verification, Cost for
       Verification



5.4 Available Actions (per appointment row)
 Status                    Meaning
 View                      Preview the completed verification form
 Download                  Download the verification PDF (also syncs to EHR if enabled)
 Upgrade to Manual         Upgrade a Basic appointment to Advanced (one-off) — available for
                           In Queue or Verified statuses
 Audit Logs                View full timestamped lifecycle events for the verification
 Cancel Verification       Moves the appointment to Expired status
 Verify Same-Day           Triggers a Same-Day Advanced verification
 Mark as Cash Patient      Moves the appointment to Skipped status
6. Same-Day Verification
Same-Day Verification is a paid add-on available across all tiers. It delivers active/termed
notifications within a 60-minute SLA while the full benefit breakdown loads in the background.



6.1 How to Initiate a Same-Day Verification
   •​   Click Add from the Same-Day Verification dashboard
   •​   Complete the Patient Verification Form
   •​   Click Verify



6.2 Required Information
   •​   Service Code Type (STC) – Auto-populated based on specialty (Dental, Optometry,
        Orthodontics)
   •​   CDT Codes – Up to 40 codes
   •​   Provider Details – Auto-populated
   •​   Subscriber Details – If subscriber = patient, enter subscriber details; if different, enter both
        patient and subscriber details
   •​   Provider ID – Select from dropdown
   •​   Insurance Card Upload – Optional



6.3 Same-Day Status Definitions
 Status                     Meaning
 Pending (In Queue)         Form submitted, verification in progress
 Active                     Successfully verified — insurance is active
 Termed                     Successfully verified — insurance is no longer active
 Failed                     Verification failed — update missing or incorrect information




7. Managing Failed Verifications

7.1 When Does a Practice Need to Take Action?
Adit's team handles the vast majority of verifications. Practice action is only required when a
verification fails due to missing or incorrect data.


 Practice Action Required When:
    •​    Verification fails due to missing or incorrect patient demographic information
    •​    Verification fails due to missing or incorrect insurance information
    •​    The practice receives an email reminder from Adit prompting a data update



7.2 How to Fix a Failed Verification
   •​    From the dashboard, click Update on the Failed card to see all failed appointments
   •​    Incorrect or missing fields are highlighted
   •​    Select the appointment to open the patient detail form
   •​    Correct the data and resubmit — this re-triggers the verification
   •​    Up to 2 correction reattempts are allowed per verification



7.3 Failure Reasons
   •​    Incorrect/missing patient demographic data
   •​    Incorrect/missing insurance information
   •​    Payer rejection or on-hold response
   •​    System issues or unsupported insurance logic
   •​    Could not identify patient
   •​    Termed insurance (insurance lapsed)
   •​    Other payer-specific reasons
8. Frequently Asked Questions (FAQ)
These Q&A pairs are designed for direct use in AI assistant training.


 Q: How do I sign up for Adit's Insurance Verification?

 A: Insurance Verification is part of Adit's RCM offerings. Contact Adit's Upgrades team to get
 started. They will assist with enrollment and next steps.
     •​ Visit: https://calendly.com/d/ckb6-4w6-qff/rcm-walkthrough
     •​ An Adit representative will guide you through onboarding



 Q: How do I set up the Insurance Verification module?

 A: An Adit team member will guide you through setup. During configuration you will define:
     •​ How far in advance verification should trigger (3 or 5 days before appointment)
     •​ Whether results are attached as a PDF, note, or both in your EHR/PMS
     •​ Which treatment codes (CDT codes) are included for Basic and Advanced
        verifications
     •​ Insurance mappings from your EHR to Adit's master insurance list



 Q: What is the difference between Basic and Advanced Eligibility Verification?

 A: Basic Verification is automated EDI-only, covering up to 40 CDT codes with no manual
 intervention. Advanced Verification adds professional manual verification on top of EDI and
 includes detailed benefit breakdowns (deductibles, co-pays, OOP maximums, coverage
 limitations). Advanced Standard covers up to 20 codes; Advanced Extensive covers 20–40
 codes.



 Q: Can I upgrade a single appointment from Basic to Advanced without changing my
 plan?

 A: Yes. Adit's IV26 module supports one-off upgrades. You stay on the Basic plan for routine
 verifications, and pay only for the individual appointment you upgrade to Advanced.



 Q: When does my practice need to take action on a verification?

 A: Adit manages verifications on your behalf. You only need to act when a verification fails
 due to missing or incorrect patient or insurance information. In that case, update the details in
 the Adit app so the verification can be retriggered before the appointment.
     •​ Email reminders can be configured to notify you when action is needed
Q: How do I change which treatment codes are being verified?

A: Email support at adit.com. Your request will be logged automatically and routed to the
appropriate team. Note that changing codes may affect your verification tier and pricing.



Q: Will Adit update the patient file in my PMS/EHR?

A: Yes. Adit can update the patient file in two ways: by attaching a PDF of the verification
results, and/or by adding a note to the patient's chart. You can enable either or both options
in RCM preferences.



Q: How do I check the status of an insurance verification?

A: Navigate to the RCM module in the Adit platform. You'll land on the Verifications page. The
Verification Status column shows color-coded status indicators. The Actions column provides
access to verification forms, PDFs, and history.



Q: What is the 60-minute SLA for Same-Day Verification?

A: Same-Day Verification provides an instant Active/Termed notification while the detailed
benefit breakdown continues loading in the background. The full advanced verification form is
completed within 60 minutes.



Q: Does a failed verification automatically expire?

A: No. Failed verifications do not automatically expire. They remain in Failed status and can
be corrected and re-triggered (up to 2 reattempts). Appointments only move to Expired once
the appointment date has passed.



Q: How does Adit handle Medicaid or HMO insurance plans?

A: Medicaid and HMO plans are processed differently from standard insurance. Because
CDT codes and plan information are typically unavailable via EDI, Adit bypasses EDI and
uses scraper APIs to download eligibility and history PDFs. Pricing follows the same structure
as your selected verification tier.



Q: How many times can a failed verification be retried?

A: The system makes up to 3 automated EDI retry attempts. After that, the practice can
correct the data and manually re-trigger — up to 2 additional reattempts are allowed, as long
as the appointment date has not yet passed.
Q: What does 'Skipped' mean in the verification dashboard?

A: A Skipped status means the appointment was intentionally excluded from insurance
verification. This happens for Cash patients and appointments using In-House insurance —
neither requires an insurance eligibility check.



Q: Can I verify a walk-in patient?

A: Yes. Use Same-Day Verification, available across all tiers. Complete the Patient
Verification Form with the patient's subscriber and insurance details, and Adit will return an
Active/Termed notification within 60 minutes.



Q: What specialties does Adit's Insurance Verification support?

A: Adit's Insurance Verification is designed for Dental, Orthodontic and Optometry practices.
Specialty-specific benefit checks include multi-phase treatment coverage for Ortho and
vision-specific allowances for Optometry.



Q: What is the audit log?

A: The Audit Log (accessible via the History icon in the Actions column) captures the full
lifecycle of a verification with timestamps: when it entered In Queue, In Progress, was
Verified or Failed, any EDI reattempts, and any demographic updates made by the practice
or the Adit RCM team.
9. Quick Reference: Key Numbers & Rules
Status                 Meaning
Verification Trigger   3 days or 5 days before appointment (configurable)
Best Practice          Verify 48–72 hours before every appointment
Basic Free             300 per month
Transactions
Basic Overage Rate     $0.06 per transaction
Basic CDT Codes        Up to 40 codes
Advanced Standard      Up to 20 CDT codes
Codes
Advanced Extensive     20–40 CDT codes
Codes
Same-Day CDT           Up to 40 codes
Codes
Same-Day Cost          $6 per verification
Same-Day SLA           60 minutes for Active/Termed notification
Termed Insurance       $0.75 per verification
Charge for Advanced
Package
Auto Retries (EDI)     Up to 3 automated attempts
Manual Reattempts      Up to 2 additional after data correction
Failed → Expires?      No — only expires when appointment date passes
Medicaid/HMO           Scraper APIs (bypasses EDI)
Method
Support Email          support at adit.com



                                    — End of Document —
