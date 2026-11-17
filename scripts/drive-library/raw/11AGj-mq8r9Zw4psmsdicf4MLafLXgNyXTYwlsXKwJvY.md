

**Adit AI Agent**

**Corrections Master Document**

All confirmed wrong answers and required knowledge base fixes

28 Corrections  ·  6 Categories  ·  Prepared by Sebastin N  ·  May 22, 2026

# **Background**

The Adit AI agent (Ask Adit AI) has been tested and audited by the support team and QA, and 28 wrong or misleading answers have been identified. These errors were found across three sources:

* Internal team chat threads — agents flagged incorrect AI responses in real time (Angie Joseph, Logan Pardini, Kristy Do, Dharmik Parmar, Darshan Joshi, Karan Rami, and others)

* AI Tool Finding.xlsx — structured QA test results covering all Adit modules (Dharmik Parmar, QA)

* AskAditAI Questions.csv — 1,008 rows of live user interaction history with Answer Status, Feedback, and Feedback Remarks fields

Every correction in this document is verified — either by a named team member, a QA report, a product team confirmation (Ali Jhaver for location-based access), or negative user feedback in the live interaction logs.

The AI knowledge base is stored as the Adit Knowledge Base \- Customer vector store (ID: vs\_696d3946040c8191b7638373fcf51d2f, approximately 5MB, last active May 21, 2026). Each correction in this document identifies the specific knowledge base document that needs to be updated.

# **How to Use This Document**

This document is structured as a process guide. Each correction follows the same format:

* Question — the exact user question that triggered the wrong answer

* What the AI was saying — a verbatim or near-verbatim quote of the wrong response

* What the AI should say — the correct answer in plain language

* Step-by-step correct process — the exact steps the AI should give

* Why this matters — the impact if this is not fixed

* Document to update — which specific knowledge base file needs to change

Work through corrections in priority order: Critical first, then High, then Medium. The full prioritized action checklist is at the end of this document.

# **Summary of All 28 Corrections**

| \# | Correction Topic | Module | Verified By | Priority | Status |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 1 | Adit Pay Terminal — S710 No Longer Available | Adit Pay / Terminals | Angie Joseph | Critical | Confirmed Wrong |
| 2 | Voicemail Access — Wrong Navigation Path | Voice / Call Tracking | Angie Joseph | High | Confirmed Wrong |
| 3 | Dolphin EHR — On-Premise System, Not Cloud; Single Phone Number Limit for Ortho | EHR Integration / Dolphin | Logan Pardini | High | Confirmed Wrong |
| 4 | Call Override — Toggle Only, No End Time or Schedule | Voice / Call Override | Angie Joseph | High | Confirmed Wrong |
| 5 | Missed Call Text — Located in Engage, Not Settings → Numbers | Engage | Angie Joseph | High | Confirmed Wrong |
| 6 | Canned Messages — SMS Only, Not Email | Engage / Canned Messages | Angie Joseph | Medium | Confirmed Wrong |
| 7 | Manually Adding Patients to a Segment — NOT Possible | Engage / Segments | Dharmik Parmar (QA) | Critical | Confirmed Wrong |
| 8 | Location-Specific Module Access — NOT Supported | Admin / Users & Access | Pranav Maheshwari \+ Ali Jhaver (Product Team) | Critical | Confirmed Wrong |
| 9 | Logging Out All Staff from Mobile — NOT Possible | Admin / Users / Mobile App | Kristy Do | High | Confirmed Wrong |
| 10 | Spanish Patient Forms — Not Supported (Reminders Only) | Patient Forms / Engage | Kristy Do | High | Confirmed Wrong |
| 11 | AI Front Desk — Does Not Know Treatment Plans or Clinical History | AI Front Desk | Padmakumar R, Deepanshu Tahalramani | High | Confirmed Wrong |
| 12 | Practice Address Change — Wrong Navigation Path | Settings / General | QA Report (AI Tool Finding.xlsx) | High | Confirmed Wrong |
| 13 | Audit Logs — No Expandable Details and No Before/After Values | Settings / Admin / Audit Logs | QA Report (AI Tool Finding.xlsx) | Medium | Confirmed Wrong |
| 14 | Logo Change — Missing Required Step: 'Edit Organization' | Settings / Admin / Organization | QA Report (AI Tool Finding.xlsx) | Medium | Confirmed Wrong |
| 15 | Billing Page — Subscription Plan and Renewal Date Not Shown | Settings / Admin / Billing | QA Report (AI Tool Finding.xlsx) | Medium | Confirmed Wrong |
| 16 | Applications Screen — No 'Manage' Button Exists | Settings / Admin / Applications | QA Report (AI Tool Finding.xlsx) | Medium | Confirmed Wrong |
| 17 | Users List — Pencil Icon No Longer Edits Role/Location/Application | Settings / Admin / Users & Access | QA Report (AI Tool Finding.xlsx) | Medium | Confirmed Wrong |
| 18 | On-Premise EHR Sync Frequency — 5 Minutes (Specific Answer Required) | EHR Integration | QA Report (AI Tool Finding.xlsx) | High | Confirmed Wrong |
| 19 | Mass Text with Shared Phone Number — 3 Profiles \= 3 Texts (Not Deduplicated) | Engage / Mass Texting | QA Report (confirmation recommended) | High | Confirmed Wrong |
| 20 | CSV Import for Email Campaigns — Only 3 Exact Headers Accepted | Engage / Email Campaigns | QA Report (AI Tool Finding.xlsx) | High | Confirmed Wrong |
| 21 | Engage General Messaging — Attachment Limit Is 650 KB | Engage / Messaging | Support team (negative feedback) | Medium | Confirmed Wrong |
| 22 | Cannot Revert to Old Adit UI Layout | Adit Platform / UI | Support team (negative feedback confirmation) | High | Confirmed Wrong |
| 23 | Create Follow-Up Task — Button Is the Downward Arrow, Not 'Create Task' | Engage / Tasks | QA Report (AI Tool Finding.xlsx) | Medium | Confirmed Wrong |
| 24 | Refund a Payment — Must Navigate to Transaction Details Page First | Adit Pay / Transactions | QA Report (AI Tool Finding.xlsx) | Medium | Confirmed Wrong |
| 25 | Cannot View the Exact Email Content Sent to a Patient | Engage / Reminders | QA Report (AI Tool Finding.xlsx) | Medium | Confirmed Wrong |
| 26 | GLOBAL TERMINOLOGY: Replace All Instances of 'Number List' with 'Phone System' | Voice / Settings / Engage — All Documents | Sebastin N (confirmed via Asana and chat) | Critical | Confirmed Wrong |
| 27 | Voicemail Setup — Replace 'Number List' with 'Phone System' in Navigation Steps | Voice / Voicemail | Sebastin N | High | Confirmed Wrong |
| 28 | Schedule Confirmation Logic for Two Same-Day Appointments | Engage / Reminders / Schedule Confirmations | Darshan Joshi, Karan Rami | High | Confirmed Wrong |

# **Detailed Corrections**

Each correction below provides the full context needed for the knowledge base team to make the fix: the exact question, the verbatim wrong answer, the correct answer, and step-by-step instructions.

## **Section 1 — Adit Pay / Terminals**

## **Correction 1 — Adit Pay Terminal — S710 No Longer Available**

**Module:** Adit Pay / Terminals     \|     **Source:** Team chat (Angie Joseph → Balaji Naidu) \+ Live CSV logs     \|     **Verified by:** Angie Joseph     \|     **Priority:** Critical

### **Question that triggered this issue**

*Which terminal does Adit use? / What are the hardware options for Adit Pay? / Clients say their credit card terminal isn't turning on — which model should I ask about?*

### **What the AI was saying — WRONG**

Hardware: Stripe Reader S700/S710 — \$150 (US) / \$225 CAD (Canada); Dock Station US\$49. The AI was also asking: "Which terminal model is it (S700 or BBPOS WisePOS E or S710)?" — treating S710 as a current product still in use.

### **What the AI should say — CORRECT**

Adit currently only provides the Stripe Reader S700. The S710 model is no longer available and has not been issued to new customers. Every reference to S710 across the knowledge base must be removed.

### **Step-by-step correct process**

1. Remove 'S710' from all hardware pricing tables, terminal documentation, and troubleshooting guides.

2. Update the pricing line to reflect S700 only: 'Stripe Reader S700 — \$150 (US) / \[confirm CAD price\]. Dock Station — \$49 (US).'

3. Update troubleshooting prompts — when asking a customer which terminal model they have, only list S700 as an option (and BBPOS WisePOS E if still in circulation — confirm with the Pay team).

4. Search the entire knowledge base for every instance of 'S710' and remove or replace.

5. Update the terminal purchase form link and all associated purchase documentation.

### **Why this matters**

Support agents and customers are being told to troubleshoot or order a device that no longer exists. This causes wrong orders and wasted support time.

### **Document to update**

Adit Pay documentation, terminal hardware guides, pricing sheet, troubleshooting guides — all instances of 'S710'.

### **Additional note**

The live CSV logs show the AI quoting 'Stripe Reader S700/S710 — \$150 US / \$225 CAD' in a pricing comparison response. The Adit Pay vs. Finance comparison generated by the AI also still lists both models together.

## **Section 2 — Voice / Call Tracking**

## **Correction 2 — Voicemail Access — Wrong Navigation Path**

**Module:** Voice / Call Tracking     \|     **Source:** Team chat (Angie Joseph → Balaji Naidu)     \|     **Verified by:** Angie Joseph     \|     **Priority:** High

### **Question that triggered this issue**

*Where do I find my voicemails in Adit? / How do I listen to a voicemail a patient left?*

### **What the AI was saying — WRONG**

The AI provided a navigation path that does not match the current Adit interface — directing users through an outdated route that no longer reflects where voicemails actually live.

### **What the AI should say — CORRECT**

Voicemails are accessed in one of two ways: (1) through the Call Tracking / Call Intelligence module, or (2) via the Call Pop when a call comes in. The full navigation steps must be rewritten to reflect the current interface.

### **Step-by-step correct process**

1. From the Adit dashboard, navigate to Call Tracking / Call Intelligence.

2. Inside Call Tracking, locate the Voicemail section or Voicemail Boxes tab.

3. Alternatively, when an incoming call is missed, the Call Pop notification provides direct access to any voicemail left by the caller.

4. Remove all steps that reference old paths such as Settings → Voice → Voicemail or Number List → Voicemail Boxes — these paths no longer match the current UI.

### **Why this matters**

Users follow a wrong path and cannot locate their voicemails, generating avoidable support tickets.

### **Document to update**

Adit Voice Master Document — voicemail access section. Adit Settings Knowledge Article — any voicemail navigation references.

### **Additional note**

This correction is closely linked to Correction \#26 (Number List → Phone System terminology). Both must be fixed at the same time.

## **Correction 3 — Dolphin EHR — On-Premise System, Not Cloud; Single Phone Number Limit for Ortho**

**Module:** EHR Integration / Dolphin     \|     **Source:** Team chat (Logan Pardini → Balaji Naidu)     \|     **Verified by:** Logan Pardini     \|     **Priority:** High

### **Question that triggered this issue**

*How does Dolphin EHR sync with Adit? / We are an ortho practice using Dolphin — how does the integration work?*

### **What the AI was saying — WRONG**

The AI described Dolphin EHR as though it were a cloud-based system, referencing Chrome extension sync in the same way cloud EHR sync is described. The AI also did not mention the phone number limitation that applies to ortho practices using Dolphin.

### **What the AI should say — CORRECT**

Dolphin is an on-premise EHR — it is installed on a local server at the practice, not hosted in the cloud. The Chrome extension is required specifically because of this on-premise architecture: it acts as a bridge between the locally installed Dolphin system and Adit's cloud platform. Additionally, for ortho practices using Dolphin, only ONE mobile phone number per patient can be pulled into Adit.

### **Step-by-step correct process**

1. Always describe Dolphin as on-premise (server-based, installed locally at the practice).

2. Explain why the Chrome extension is required: 'Dolphin is an on-premise system. The Chrome extension is needed to connect the locally installed Dolphin to Adit's cloud platform — this is standard for all on-premise EHR integrations.'

3. For ortho practices using Dolphin, add this note: 'Dolphin ortho practices: Adit can only pull one mobile phone number per patient from Dolphin. If a patient has multiple numbers on file, only one will sync to Adit.'

4. Do not describe Dolphin's sync in the same language used for cloud EHRs like Dentrix Ascend or Carestream.

### **Why this matters**

Ortho practices using Dolphin will not be warned about the single-number limitation, which means patients with multiple numbers on file may not receive appointment reminders on the correct number.

### **Document to update**

EHR Integration documentation — Dolphin section. Update to clearly describe Dolphin as on-premise and add the one-mobile-number-per-patient limitation.

## **Correction 4 — Call Override — Toggle Only, No End Time or Schedule**

**Module:** Voice / Call Override     \|     **Source:** Team chat (Angie Joseph → Balaji Naidu)     \|     **Verified by:** Angie Joseph     \|     **Priority:** High

### **Question that triggered this issue**

*Can I set Call Override to turn off automatically after a certain time? / How do I schedule Call Override to end at 5pm?*

### **What the AI was saying — WRONG**

The AI described a way to configure an end time or schedule for Call Override, implying that the feature can be set to automatically turn itself off at a specific time.

### **What the AI should say — CORRECT**

Call Override can ONLY be toggled ON or OFF manually. There is no option to set an end time, duration, or schedule. This is a known product limitation that is on the feature roadmap but not yet available. Anyone who enables Call Override must manually return and toggle it OFF.

### **Step-by-step correct process**

1. To enable Call Override: navigate to Phone System, select your location, and toggle Call Override to ON.

2. To disable Call Override: return to the same location in Phone System and toggle it OFF manually.

3. There is no scheduler, timer, or automatic shutoff. The person who enables it is responsible for disabling it manually.

4. If the customer asks for automatic shutoff, note this as a feature request and advise that it is planned but not yet available.

5. Remove all language from the knowledge base that implies an end time or auto-schedule can be configured.

### **Why this matters**

If agents tell customers they can set an end time, customers may enable Call Override and assume it will turn off on its own — causing calls to route incorrectly for longer than intended.

### **Document to update**

Adit Voice Master Document — Call Override section. Adit Settings Knowledge Article — Phone System settings.

### **Additional note**

Document this as a known limitation with a note: 'Automatic shutoff is a planned future feature. Currently, Call Override must be turned off manually.'

## **Correction 5 — Missed Call Text — Located in Engage, Not Settings → Numbers**

**Module:** Engage     \|     **Source:** Team chat (Angie Joseph → Balaji Naidu)     \|     **Verified by:** Angie Joseph     \|     **Priority:** High

### **Question that triggered this issue**

*How do I set up a Missed Call Text? / Where do I configure what gets sent to a patient when they call and no one answers?*

### **What the AI was saying — WRONG**

The AI directed users to Settings → Numbers / Call Flows to configure Missed Call Text, providing multi-step instructions that do not match where this feature actually lives in the current Adit interface.

### **What the AI should say — CORRECT**

Missed Call Text is a feature within the Engage module, not Settings → Numbers or Call Flows. All instructions for setting up Missed Call Text must be rewritten starting from the Engage module.

### **Step-by-step correct process**

1. From the Adit dashboard, navigate to the Engage module.

2. Inside Engage, locate the Missed Call Text settings (confirm exact sub-section name from current Engage documentation).

3. You can configure separate messages for missed calls within business hours and outside business hours — this part of the feature is correct and should be preserved in the updated documentation.

4. Remove all instructions referencing Settings → Numbers or Call Flows for Missed Call Text configuration.

### **Why this matters**

Users follow an entirely wrong path and cannot find the Missed Call Text feature, leading to support tickets and frustration.

### **Document to update**

Engage documentation — add or update a Missed Call Text section. Adit Settings Knowledge Article — remove any reference placing Missed Call Text in Numbers/Call Flows.

## **Section 3 — Engage / Patient Communication**

## **Correction 6 — Canned Messages — SMS Only, Not Email**

**Module:** Engage / Canned Messages     \|     **Source:** Team chat (Angie Joseph → Balaji Naidu)     \|     **Verified by:** Angie Joseph     \|     **Priority:** Medium

### **Question that triggered this issue**

*What are canned messages in Adit? / Can I use canned messages for email templates?*

### **What the AI was saying — WRONG**

"Canned messages are saved, reusable communication templates (SMS/email) you can insert into patient outreach." The AI described canned messages as supporting both SMS and email.

### **What the AI should say — CORRECT**

Canned messages in Adit are pre-written text templates for SMS (text messages) only. They cannot be used for email. The word 'email' must be removed entirely from any description of this feature.

### **Step-by-step correct process**

1. Update the description of canned messages to: 'Canned messages are saved, reusable text templates that staff can quickly insert when composing an SMS to a patient in Engage.'

2. Remove all references to canned messages being usable for email or email campaigns.

3. If a user asks about email templates, direct them to the Email Campaigns feature in Engage, which is a separate and distinct feature.

### **Why this matters**

Support agents may tell customers they can use canned messages for email workflows, causing confusion when the customer cannot find this functionality.

### **Document to update**

Engage documentation — Canned Messages section. Remove the word 'email' from all canned message descriptions.

## **Correction 7 — Manually Adding Patients to a Segment — NOT Possible**

**Module:** Engage / Segments     \|     **Source:** Live CSV log (Thread AA-0011830) \+ QA Report (Dharmik Parmar)     \|     **Verified by:** Dharmik Parmar (QA)     \|     **Priority:** Critical

### **Question that triggered this issue**

*I have approximately 60 patient names I want to add manually to a segment for mass texting. Can I do this?*

### **What the AI was saying — WRONG**

"Yes — you can add patients to a segment. Do you want to enter them one-by-one in the Contacts UI, or add them all at once via CSV import? Tell me which and I'll give the exact steps." The AI answered Yes and offered two non-existent methods for manual segment population.

### **What the AI should say — CORRECT**

No — there is currently no way to manually add specific patients to a segment, either one by one or by CSV import. Segments in Adit are built exclusively using filter criteria. The answer to this question must be changed from Yes to No.

### **Step-by-step correct process**

1. When asked whether patients can be manually added to a segment, answer: 'No — Adit segments are filter-based only. You cannot manually add individual patients to a segment.'

2. Explain how segments actually work: 'Segments are dynamic groups built from filters such as Last Appointment date, Next Appointment date, Procedure Codes, Insurance type, Location, and Patient status.'

3. If the practice needs to message a specific hand-picked list of patients, investigate whether the Patient List feature (separate from Segments) supports manual or CSV-based patient addition — and only suggest this if verified.

4. Do not suggest CSV import as a workaround for adding patients to a segment. This feature does not exist for Segments.

### **Why this matters**

A customer was told a workaround exists that does not. They will spend time preparing a CSV and trying to import it, then contact support when it fails. This is a direct trust issue.

### **Document to update**

Engage documentation — Segments section. The answer to 'Can I manually add patients to a segment?' must be updated to No. Clarify the distinction between Segments (filter-based) and Patient Lists (if applicable).

### **Additional note**

Patient Lists and Segments are two different features. Do not conflate them. Verify whether Patient Lists support manual or CSV-based population before including that as a suggestion.

## **Correction 8 — Location-Specific Module Access — NOT Supported**

**Module:** Admin / Users & Access     \|     **Source:** Team chat (Pranav Maheshwari, Jeanette Gillespie, Ali Jhaver → Tyler Roden)     \|     **Verified by:** Pranav Maheshwari \+ Ali Jhaver (Product Team)     \|     **Priority:** Critical

### **Question that triggered this issue**

*Can I give a user access to a module on Location A but restrict them on Location B?*

### **What the AI was saying — WRONG**

"Short answer: Yes." The AI then described steps to configure location-specific module permissions in Admin Panel → Users & Access — a feature that does not currently exist.

### **What the AI should say — CORRECT**

Application (module) access in Adit is universal across all locations. It is not currently possible to restrict a user's module access to specific locations. Ali Jhaver from the product team confirmed this functionality is planned but not yet available.

### **Step-by-step correct process**

1. When asked about location-specific module access, answer: 'No — application access in Adit currently applies across all locations. If a user is given access to a module, they have access to it on every location they are assigned to.'

2. Acknowledge the limitation: 'The ability to restrict access per location is on the product roadmap but is not yet available.'

3. The only partial workaround (not recommended) is creating a separate user account for the restricted location — but this is messy and not a clean solution.

4. Do not describe steps in Admin Panel → Users & Access that imply location-specific module control. Those steps do not produce the described result.

### **Why this matters**

A real example from the support team: a practice needed staff to be able to send faxes from Location A but not listen to call recordings — there is currently no way to configure this in Adit. Agents who say 'Yes' to this question are setting false expectations.

### **Document to update**

Admin documentation — Users & Access section. Update all answers about location-specific application permissions to: 'Not currently supported. Planned for a future release.'

### **Additional note**

Confirmed by Ali Jhaver (Product). Note it as 'coming soon' in the knowledge base — do not say it is currently available under any circumstances.

## **Correction 9 — Logging Out All Staff from Mobile — NOT Possible**

**Module:** Admin / Users / Mobile App     \|     **Source:** Team chat (Kristy Do)     \|     **Verified by:** Kristy Do     \|     **Priority:** High

### **Question that triggered this issue**

*Is there a way to log out all staff from the Adit mobile app? / Can I force all users off the app remotely?*

### **What the AI was saying — WRONG**

"Short answer: Yes." The AI described three methods for logging staff out: (1) individual logout via My Profile, (2) an admin action for a specific user, and (3) a global or module-level disable — describing a level of admin control that does not exist.

### **What the AI should say — CORRECT**

Adit does not support remote or bulk logout of staff from mobile applications. The only session termination option available is in My Profile → Password → 'Terminate all active sessions' — but this is a self-service action that an individual user performs for their own account. An admin cannot do this on behalf of another user.

### **Step-by-step correct process**

1. When asked about remote or bulk mobile logout, answer: 'No — Adit does not have a way to force-logout staff from the mobile app remotely or in bulk.'

2. 'Individual users can end their own sessions by going to My Profile → Password → Terminate all active sessions. This is a self-service action only.'

3. If an admin needs to revoke access immediately, the only option is to disable the user's account entirely in Admin → Users & Access — but this does not force an immediate logout from an active mobile session.

4. Remove all descriptions of admin-controlled session termination, 'global logout', or 'module disable' as logout methods — these do not exist.

### **Why this matters**

Practices expecting to push a logout to all staff at end of day, or when an employee leaves, will be misled. This has security implications if access cannot be removed promptly.

### **Document to update**

Admin documentation — Users & Access section. My Profile documentation — clarify 'Terminate all active sessions' is self-service only, not an admin-controlled action.

## **Correction 10 — Spanish Patient Forms — Not Supported (Reminders Only)**

**Module:** Patient Forms / Engage     \|     **Source:** Team chat (Kristy Do)     \|     **Verified by:** Kristy Do     \|     **Priority:** High

### **Question that triggered this issue**

*Can patients receive their forms in Spanish? / If a patient's preferred language is Spanish, will Adit automatically send them a Spanish version of the form?*

### **What the AI was saying — WRONG**

"Yes — if the patient's Preferred Language is set to Spanish, Adit will auto-assign and send the Spanish version of the form." The AI said Yes and described an automatic Spanish form assignment process that does not exist.

### **What the AI should say — CORRECT**

Adit supports Spanish for appointment reminders (text messages and emails) only. Spanish-language patient forms are not available. The answer to 'Can I send Spanish forms?' is No.

### **Step-by-step correct process**

1. When asked about Spanish-language forms, answer: 'No — Adit does not currently support Spanish-language patient forms (intake forms, medical history, consents, etc.).'

2. Clarify what is supported: 'Adit can send appointment reminders in Spanish when the patient's Preferred Language is set to Spanish. Forms themselves are only available in English.'

3. If a practice needs to serve Spanish-speaking patients with forms, the only workaround is: create a separate appointment type for Spanish-speaking patients and manually associate a translated form — but note this is a custom workaround, not a native Adit feature.

4. Do not describe any automatic Spanish form assignment based on Preferred Language — this does not exist for forms.

### **Why this matters**

Practices serving Spanish-speaking patients will configure Adit expecting Spanish forms to work, only to find patients receive English forms. This directly affects patient experience.

### **Document to update**

Patient Forms documentation — language support section. Engage documentation — update reminders language settings to specify Spanish reminders are supported, but Spanish forms are not.

### **Additional note**

Keep the Spanish reminders answer as Yes — only Spanish FORMS need to be corrected to No.

## **Section 4 — AI Front Desk**

## **Correction 11 — AI Front Desk — Does Not Know Treatment Plans or Clinical History**

**Module:** AI Front Desk     \|     **Source:** Team chat (Padmakumar R, Deepanshu Tahalramani → Gary Weinstein)     \|     **Verified by:** Padmakumar R, Deepanshu Tahalramani     \|     **Priority:** High

### **Question that triggered this issue**

*Does the AI Front Desk know if a patient has a root canal in progress? / Can the AI tell a patient about their ongoing treatment when they call?*

### **What the AI was saying — WRONG**

The AI gave a completely unrelated answer about credit thresholds and billing — entirely off-topic. The question was about clinical treatment plan awareness and the AI failed to address it at all.

### **What the AI should say — CORRECT**

The Adit AI Front Desk only knows about scheduled future appointments that exist in the EHR. It does not have access to treatment plans, clinical history, clinical notes, or any records that are not tied to an upcoming scheduled appointment.

### **Step-by-step correct process**

1. When asked what the AI Front Desk knows about a patient, answer: 'The AI Front Desk only has access to scheduled future appointments synced from your EHR. It does not have access to treatment plans, clinical history, diagnoses, or any information not associated with an upcoming appointment.'

2. If a patient calls asking about their root canal, ongoing orthodontic treatment, or any clinical detail, the AI Front Desk can only respond based on whether there is a relevant appointment on the books. It cannot speak to the clinical content of any treatment.

3. Add a clear 'What the AI Front Desk knows vs. does not know' section to the documentation with this as a key example.

### **Why this matters**

Practices may configure AI Front Desk expecting it to handle clinical questions from patients, leading to poor patient experiences when the AI cannot respond appropriately.

### **Document to update**

AI Front Desk documentation — scope of knowledge section. Add a table or list clearly stating: 'The AI knows: scheduled future appointments. The AI does not know: treatment plans, clinical history, diagnoses, or records not tied to a scheduled appointment.'

### **Additional note**

The wrong answer given was about credit thresholds — the AI likely retrieved from the wrong knowledge base section. Review AI Front Desk knowledge content for misplaced or mislabeled content.

## **Section 5 — Settings / Admin**

## **Correction 12 — Practice Address Change — Wrong Navigation Path**

**Module:** Settings / General     \|     **Source:** AI Tool Finding Excel Report     \|     **Verified by:** QA Report (AI Tool Finding.xlsx)     \|     **Priority:** High

### **Question that triggered this issue**

*How do I change the address for the practice?*

### **What the AI was saying — WRONG**

"Go to Settings (gear icon) \> Admin Panel \> Locations" to change the practice address.

### **What the AI should say — CORRECT**

The practice address is changed under Settings → General → Logo & Address (also shown as Address & Logo in some views). The Locations section in Admin Panel is for managing location-level operational settings, not for editing the practice's physical address.

### **Step-by-step correct process**

1. Click the Settings (gear) icon.

2. Navigate to General.

3. Click on Logo & Address (or Address & Logo).

4. Update the address fields and save.

5. Note: Admin Panel → Locations is NOT the correct path for changing the address.

### **Why this matters**

Users are directed to the wrong section and cannot find the address fields, creating support tickets for a simple navigation question.

### **Document to update**

Adit Settings Knowledge Article — General section. Also check the Admin/Locations section and remove any implication that address changes are made there.

### **Additional note**

The QA report found an inconsistency: when the question was phrased as 'where do I change the address?' the AI answered correctly, but when phrased as 'how do I change the address?' it gave the wrong path. The knowledge base needs consistent anchoring for this topic regardless of question phrasing.

## **Correction 13 — Audit Logs — No Expandable Details and No Before/After Values**

**Module:** Settings / Admin / Audit Logs     \|     **Source:** AI Tool Finding Excel Report     \|     **Verified by:** QA Report (AI Tool Finding.xlsx)     \|     **Priority:** Medium

### **Question that triggered this issue**

*I want to see who made recent changes and what they changed.*

### **What the AI was saying — WRONG**

The AI described "an expandable Details field that shows before-and-after values" and told users they could "expand Details" to see more information about specific changes in the Audit Log.

### **What the AI should say — CORRECT**

The Audit Logs in Adit do not have an expandable Details field. There is no way to view before-and-after values for any change. The audit log shows the date and time, the user who made the change, and the type of action — nothing more. This feature description must be removed entirely.

### **Step-by-step correct process**

1. Describe Audit Logs accurately: 'The Audit Log shows a record of actions taken in Adit — the date, time, the user who made the change, and the type of action performed. You can filter by date range and by user.'

2. Remove all language about 'expandable Details', 'before-and-after values', or clicking into a row for more information.

3. If a customer needs more granular change tracking, inform them that detailed before/after value history is not currently available in the Audit Log.

### **Why this matters**

Users look for an expand option that does not exist and assume the feature is broken. This generates support tickets for expected functionality that was never there.

### **Document to update**

Adit Settings Knowledge Article — Section 1.6 Audit Logs. Remove all references to expandable rows and before/after value display.

## **Correction 14 — Logo Change — Missing Required Step: 'Edit Organization'**

**Module:** Settings / Admin / Organization     \|     **Source:** AI Tool Finding Excel Report     \|     **Verified by:** QA Report (AI Tool Finding.xlsx)     \|     **Priority:** Medium

### **Question that triggered this issue**

*How do I change the practice logo in Adit?*

### **What the AI was saying — WRONG**

"Go to Settings → Admin → Organization and use the Upload Logo / camera icon there." The AI described navigating to Organization and clicking the camera icon directly — omitting a required intermediate step.

### **What the AI should say — CORRECT**

After navigating to Settings → Admin → Organization, you must click 'Edit Organization' before the Upload Logo / camera icon becomes visible. Without this click, the upload option does not appear.

### **Step-by-step correct process**

1. Click Settings (gear icon).

2. Navigate to Admin → Organization.

3. Click 'Edit Organization'. (This is the step the AI was omitting.)

4. The Upload Logo / camera icon will now appear.

5. Click the camera icon and upload the new logo.

6. Save changes.

### **Why this matters**

Users navigate to Organization, see no upload option, and think the feature is missing or broken.

### **Document to update**

Adit Settings Knowledge Article — Admin → Organization section. Insert 'Click Edit Organization' as step 3 in the logo upload process.

## **Correction 15 — Billing Page — Subscription Plan and Renewal Date Not Shown**

**Module:** Settings / Admin / Billing     \|     **Source:** AI Tool Finding Excel Report     \|     **Verified by:** QA Report (AI Tool Finding.xlsx)     \|     **Priority:** Medium

### **Question that triggered this issue**

*How do I see what charges have been incurred? / Where can I view my subscription details?*

### **What the AI was saying — WRONG**

The AI told users they can 'see your current subscription plan, billing cycle, and next renewal date' on the Billing page. It also described a 'billing update form that may take 3–5 business days to process' — neither of these exist on the Billing page.

### **What the AI should say — CORRECT**

The Billing page in Adit does not display the current subscription plan or next renewal date. A billing update form is also not present on the page. These claims must be removed from the documentation.

### **Step-by-step correct process**

1. Describe the Billing page based only on what is actually present — payment method, transaction history, and any fields that are genuinely visible.

2. Remove the following from the documentation: 'current subscription plan', 'billing cycle display', 'next renewal date', and 'billing update form with 3–5 business day processing'.

3. If a customer needs to view their subscription plan or renewal date, direct them to contact Adit's billing team or account manager — this information is not available in the self-serve UI.

### **Why this matters**

Customers look for subscription and renewal information that does not appear on the page, then contact support confused about where it went.

### **Document to update**

Adit Settings Knowledge Article — Billing section. Remove all references to subscription plan, renewal date, and billing update form.

## **Correction 16 — Applications Screen — No 'Manage' Button Exists**

**Module:** Settings / Admin / Applications     \|     **Source:** AI Tool Finding Excel Report — Engage New / Managing Module Access     \|     **Verified by:** QA Report (AI Tool Finding.xlsx)     \|     **Priority:** Medium

### **Question that triggered this issue**

*Where do I see which apps are enabled and which are disabled?*

### **What the AI was saying — WRONG**

"To audit who can use a module, click Manage (or open Users & Access → Application Access) to view and edit which users and locations have that application." There is no button named 'Manage' on the Applications screen.

### **What the AI should say — CORRECT**

There is no 'Manage' button on the Applications screen. The instructions must be updated to reflect the actual UI — which includes toggles for enabling and disabling applications, not a Manage button.

### **Step-by-step correct process**

1. Navigate to Settings → Admin → Applications.

2. You will see a list of applications with their current status.

3. To enable or disable an application, use the Enabled/Disabled toggle next to each app.

4. To manage which users can access an application, navigate separately to Users & Access → Application Access.

5. Remove the instruction to 'click Manage' — this button does not exist on the Applications screen.

### **Why this matters**

Users look for a Manage button that is not there and assume they are on the wrong screen.

### **Document to update**

Engage New documentation — Managing Module Access section. Admin documentation — Applications section. Remove 'Manage button' from all navigation instructions.

## **Correction 17 — Users List — Pencil Icon No Longer Edits Role/Location/Application**

**Module:** Settings / Admin / Users & Access     \|     **Source:** AI Tool Finding Excel Report — Section 1.4     \|     **Verified by:** QA Report (AI Tool Finding.xlsx)     \|     **Priority:** Medium

### **Question that triggered this issue**

*How do I view or change a user's role and location in Adit?*

### **What the AI was saying — WRONG**

"From the Users list you can click a user (or the pencil/edit icon) to view or change their Role, Assigned Locations, and Assigned Applications." The pencil icon no longer performs this function.

### **What the AI should say — CORRECT**

The pencil/edit icon next to a user's name in the Users list no longer allows viewing or changing their Role, Assigned Locations, or Assigned Applications. The correct method for editing these fields needs to be verified and updated in the documentation.

### **Step-by-step correct process**

1. Remove the instruction 'click the pencil icon to change Role, Location, or Application' from all documentation.

2. Verify what the pencil icon currently does — it likely allows editing basic profile information only (name, email, phone).

3. Verify the current correct method for editing a user's Role, Location, and Application access.

4. Update the documentation with the verified, current steps and re-test to confirm accuracy before publishing.

### **Why this matters**

Agents following the old instructions cannot complete user access changes, requiring escalation or manual workarounds.

### **Document to update**

Adit Settings Knowledge Article — Section 1.4 Users & Access. Update with current, verified steps for editing user roles and access.

### **Additional note**

The QA report noted 'Unable to find this file' for the source document referenced in the QA test (Adit Settings Knowledge Article \- Updated.pdf). Verify the correct and current version of the Settings article is uploaded to the vector store.

## **Correction 18 — On-Premise EHR Sync Frequency — 5 Minutes (Specific Answer Required)**

**Module:** EHR Integration     \|     **Source:** AI Tool Finding Excel Report     \|     **Verified by:** QA Report (AI Tool Finding.xlsx)     \|     **Priority:** High

### **Question that triggered this issue**

*For an on-premise EHR, how long does it take for an appointment to sync into Adit? What is the sync frequency?*

### **What the AI was saying — WRONG**

The AI gave a generic, non-specific answer about EHR sync timing without stating the actual sync frequency. The question asked explicitly for a frequency, and the AI failed to provide a concrete number.

### **What the AI should say — CORRECT**

For on-premise EHR integrations, appointments sync between the EHR and Adit every 5 minutes. This specific number must be included every time the sync frequency for on-premise EHR is discussed.

### **Step-by-step correct process**

1. When asked about on-premise EHR sync frequency, answer: 'Appointments sync between your on-premise EHR and Adit every 5 minutes.'

2. Add this specific figure to the EHR sync documentation so the AI can answer confidently.

3. Note: this 5-minute sync applies to on-premise EHR setups (e.g., Eaglesoft, Dolphin). Cloud-based EHRs may have different sync behavior — verify and document each one separately.

### **Why this matters**

Support agents cannot give customers accurate expectations about when newly booked appointments will appear in Adit.

### **Document to update**

EHR Integration documentation — sync frequency section. Add: 'On-premise EHR: appointments sync every 5 minutes.'

## **Section 6 — Engage / Messaging (Additional)**

## **Correction 19 — Mass Text with Shared Phone Number — 3 Profiles \= 3 Texts (Not Deduplicated)**

**Module:** Engage / Mass Texting     \|     **Source:** AI Tool Finding Excel Report     \|     **Verified by:** QA Report (confirmation recommended)     \|     **Priority:** High

### **Question that triggered this issue**

*If 3 patients share the same phone number, will a mass text be sent 3 times to the same number?*

### **What the AI was saying — WRONG**

"The platform detects shared/duplicate phone numbers and consolidates/flags them so a single message is sent to that number." The AI said only 1 message would be sent.

### **What the AI should say — CORRECT**

Mass texts are sent per patient profile, not per phone number. If 3 patient profiles share the same phone number, 3 messages will be sent to that number. The platform does not automatically deduplicate by phone number.

### **Step-by-step correct process**

1. When asked about shared phone numbers and mass texts, answer: 'Yes — if 3 patients share the same phone number, 3 separate mass texts will be sent to that number, one per patient profile.'

2. Advise practices with family accounts: 'In households where all family members share one phone number, each family member will receive their own message. The same physical number may receive 3 or more texts from a single mass text campaign.'

3. If the practice wants to avoid this, they must manually review their segment for duplicate phone numbers before sending.

4. Remove all language about the platform detecting or consolidating duplicate phone numbers for mass texts.

### **Why this matters**

Family practices are being told duplicates are automatically prevented. In reality, a single household number can receive multiple texts, leading to patient complaints.

### **Document to update**

Engage documentation — Mass Texting section. Add a note: 'Mass texts are sent per patient profile. If multiple profiles share the same phone number, each profile will receive its own message.'

### **Additional note**

The QA report flagged this as needing verification. Recommend confirming the behavior with the engineering or product team before publishing the update.

## **Correction 20 — CSV Import for Email Campaigns — Only 3 Exact Headers Accepted**

**Module:** Engage / Email Campaigns     \|     **Source:** AI Tool Finding Excel Report     \|     **Verified by:** QA Report (AI Tool Finding.xlsx)     \|     **Priority:** High

### **Question that triggered this issue**

*How do I import a CSV file with patients for an email campaign?*

### **What the AI was saying — WRONG**

The AI described the CSV import process for email campaigns but did not mention the strict header requirements, implying that any patient CSV would work.

### **What the AI should say — CORRECT**

CSV files for Adit email campaigns are only accepted if the column headers are exactly: 'First name', 'Last name', and 'Email'. Any additional headers — mobile number, location, date of birth, or anything else — will cause the import to fail entirely.

### **Step-by-step correct process**

1. Before importing, ensure your CSV file has exactly these three column headers: First name, Last name, Email.

2. Do not include any other columns. Any extra header will cause the CSV to fail to import.

3. Verify whether the headers are case-sensitive (e.g., 'First name' vs 'first name') and document the exact required format.

4. Navigate to Engage → Email Campaigns → Create Campaign → Import CSV, then upload the correctly formatted file.

5. If the import fails, check that no extra columns have been added to the CSV.

### **Why this matters**

Agents walk customers through a CSV import that fails because the customer included extra columns. This creates frustration and avoidable back-and-forth.

### **Document to update**

Engage documentation — Email Campaigns / CSV Import section. Add a prominent warning: 'CSV files must contain only three columns: First name, Last name, and Email. Any additional columns will cause the import to fail.'

## **Correction 21 — Engage General Messaging — Attachment Limit Is 650 KB**

**Module:** Engage / Messaging     \|     **Source:** Live CSV log — Negative feedback (Thread: 'general Engage messaging attachment limit')     \|     **Verified by:** Support team (negative feedback)     \|     **Priority:** Medium

### **Question that triggered this issue**

*What is the file attachment size limit in Engage messaging?*

### **What the AI was saying — WRONG**

The AI stated it could not find a documented general attachment limit for Engage messaging, mentioning only the 8 MB limit for Text-to-Pay PDF attachments. No specific limit was given for general message attachments, leaving the question unanswered.

### **What the AI should say — CORRECT**

The general Engage messaging file attachment limit is 650 KB. This is a separate and distinct limit from the Text-to-Pay attachment limit (8 MB for a single PDF). Both limits exist and both should be in the knowledge base.

### **Step-by-step correct process**

1. When asked about Engage messaging attachment size: 'The file attachment limit for general Engage messages is 650 KB.'

2. When asked about Text-to-Pay PDF attachment size: 'The Text-to-Pay payment request PDF attachment limit is 8 MB.'

3. Do not give a vague or uncertain answer for the general messaging limit — the 650 KB figure is confirmed and must be documented.

### **Why this matters**

Agents are forced to say 'I don't know' for a basic factual question, or customers are told the limit may be the same as Text-to-Pay (8 MB) when it is actually 650 KB.

### **Document to update**

Engage documentation — Messaging / Attachments section. Document both limits clearly: general messaging \= 650 KB, Text-to-Pay PDF \= 8 MB.

## **Correction 22 — Cannot Revert to Old Adit UI Layout**

**Module:** Adit Platform / UI     \|     **Source:** Live CSV log — Negative feedback (Thread: 'Can we return back to the old layout?')     \|     **Verified by:** Support team (negative feedback confirmation)     \|     **Priority:** High

### **Question that triggered this issue**

*Can we go back to the old Adit layout?*

### **What the AI was saying — WRONG**

The AI asked a clarifying question and then suggested: 'Some modules keep a legacy view or legacy reports available (for example, Call Tracking exposes older charts under Legacy Insights), so a full revert may be possible for specific screens.' This implies reverting is possible, which it is not.

### **What the AI should say — CORRECT**

No — the old Adit UI layout cannot be restored. The current interface is the only available version. Some modules have legacy reporting views (such as Legacy Insights in Call Tracking), but these are report views only and do not represent a revert of the overall UI. The answer to this question should be a clear No.

### **Step-by-step correct process**

1. When asked about reverting to the old UI, answer: 'No — the old Adit layout cannot be restored. The current interface is the only available version.'

2. You can add: 'Some modules include legacy report views (for example, Legacy Insights in Call Tracking), but the overall platform layout cannot be changed back to the previous version.'

3. If the customer is struggling with the new interface, offer to help them navigate or refer them to Adit Academy or support documentation.

4. Remove all language suggesting the old UI may be accessible for specific screens.

### **Why this matters**

Customers are told a layout revert might be possible, then spend time looking for a toggle that does not exist.

### **Document to update**

General platform FAQ — add an explicit entry: 'Can I revert to the old Adit layout? No — the current interface is the only available version.'

## **Correction 23 — Create Follow-Up Task — Button Is the Downward Arrow, Not 'Create Task'**

**Module:** Engage / Tasks     \|     **Source:** AI Tool Finding Excel Report     \|     **Verified by:** QA Report (AI Tool Finding.xlsx)     \|     **Priority:** Medium

### **Question that triggered this issue**

*How do I create a follow-up task on a specific message from a patient who needs a callback?*

### **What the AI was saying — WRONG**

The AI said 'Click Create Task / Create Follow-Up (button inside the message thread)' without specifying where this option is located, making it impossible for the user to find.

### **What the AI should say — CORRECT**

To create a follow-up task on a specific message, click the downward-facing arrow icon at the top right of that specific message thread. This reveals the follow-up and task creation options. It is not a labelled 'Create Task' button — it is the downward arrow.

### **Step-by-step correct process**

1. Open the Engage message thread for the patient.

2. Locate the specific message you want to follow up on.

3. Look for the downward-facing arrow icon at the top right of that message.

4. Click the downward arrow to reveal the task/follow-up creation options.

5. Fill in the follow-up task details and save.

### **Why this matters**

Agents cannot find the follow-up option using the AI's current steps, either skipping the task entirely or calling support.

### **Document to update**

Engage documentation — Follow-Up Tasks / Message Tasks section. Update step to read: 'Click the downward-facing arrow at the top right of the message to access follow-up and task creation options.'

## **Correction 24 — Refund a Payment — Must Navigate to Transaction Details Page First**

**Module:** Adit Pay / Transactions     \|     **Source:** AI Tool Finding Excel Report     \|     **Verified by:** QA Report (AI Tool Finding.xlsx)     \|     **Priority:** Medium

### **Question that triggered this issue**

*How do I refund an amount that was charged to the wrong patient?*

### **What the AI was saying — WRONG**

The AI described the refund process but omitted the critical step of opening the transaction's details page first. Without this step, the Refund button is not visible to the user.

### **What the AI should say — CORRECT**

The Refund button only appears on the transaction's details page. To access it, you must first click on the specific transaction to open it. The Refund button is not visible from the main transactions list.

### **Step-by-step correct process**

1. Navigate to Adit Pay → Transactions.

2. Search for the transaction by patient name, date, or amount.

3. Click on the transaction row to open the transaction details page. This is the critical step.

4. On the transaction details page, the Refund button will be visible.

5. Click Refund, enter the amount (partial or full), and confirm.

6. The transaction status will update to show the refund has been processed.

### **Why this matters**

Without the step to open the transaction details page, users see no Refund button and either contact support or fail to process the refund.

### **Document to update**

Adit Pay documentation — Refunds section. Add as step 3: 'Click on the transaction to open the transaction details page — the Refund button only appears here, not from the transaction list.'

## **Correction 25 — Cannot View the Exact Email Content Sent to a Patient**

**Module:** Engage / Reminders     \|     **Source:** AI Tool Finding Excel Report     \|     **Verified by:** QA Report (AI Tool Finding.xlsx)     \|     **Priority:** Medium

### **Question that triggered this issue**

*Can I see the exact email that was sent to a specific patient as their appointment reminder?*

### **What the AI was saying — WRONG**

The AI provided mostly accurate information but included the claim that you can view the exact email that was sent to a patient — this capability does not exist in the current Adit interface.

### **What the AI should say — CORRECT**

You can confirm that an email reminder was sent to a patient (the log shows the date, time, and type of communication), but you cannot open or preview the actual email content. The exact text of the email body is not visible within Adit.

### **Step-by-step correct process**

1. To check whether a reminder was sent: open the patient's profile or their Engage communication history.

2. The log will show that a reminder was sent, the date and time, and the type (e.g., appointment reminder, recall).

3. You cannot click into the log entry to view the full email content — the email body itself is not stored or displayed within Adit.

4. If a customer needs to verify what the email said, they would need to check from the patient's own email inbox.

### **Why this matters**

Agents tell customers they can review the exact email, leading to confusion and frustration when no preview is available.

### **Document to update**

Engage documentation — Reminders / Communication Logs section. Clarify: 'Adit shows a record of sent reminders but does not allow you to preview or view the exact email content that was delivered.'

## **Section 7 — Terminology and Global Fixes**

## **Correction 26 — GLOBAL TERMINOLOGY: Replace All Instances of 'Number List' with 'Phone System'**

**Module:** Voice / Settings / Engage — All Documents     \|     **Source:** Live CSV logs (Sebastin N, AA-0011698 \+ AA-0011699) \+ QA Report     \|     **Verified by:** Sebastin N (confirmed via Asana and chat)     \|     **Priority:** Critical

### **Question that triggered this issue**

*The settings document says 'eFax Number List no longer exists.' Number List has been renamed to Phone System — can you replace all instances?*

### **What the AI was saying — WRONG**

Throughout the AI knowledge base, the old term 'Number List' is still used to refer to the Voice settings area. The AI itself acknowledged this in thread AA-0011698: 'Some of the uploaded Adit docs still use the old term Number List (examples: Engage New, Adit Voice Master Document, Adit Settings Knowledge Article). Other updated sections already use Phone System.' Despite acknowledging this, the AI has not been corrected because the source documents have not been updated.

### **What the AI should say — CORRECT**

The correct and current term is 'Phone System'. 'Number List' is deprecated. Every single instance of 'Number List' across all knowledge base documents must be replaced with 'Phone System'. This is a global find-and-replace that must be applied to every document before they are re-uploaded to the vector store.

### **Step-by-step correct process**

1. Run a search across all knowledge base documents for the term 'Number List'.

2. Documents confirmed to still contain 'Number List': Adit Voice Master Document, Adit Settings Knowledge Article, Engage New documentation.

3. Replace every instance of 'Number List' with 'Phone System' in each of these documents.

4. Save the corrected versions of all documents.

5. Re-upload the corrected documents to the Adit Knowledge Base \- Customer vector store (ID: vs\_696d3946040c8191b7638373fcf51d2f).

6. After re-uploading, test the AI to verify it no longer uses 'Number List' in any response.

7. Run this as a recurring check whenever new documents are added to the knowledge base.

### **Why this matters**

This is a global terminology error affecting every module that references the voice and phone number settings area. Every answer containing 'Number List' is immediately outdated and confusing to users who see 'Phone System' in the actual interface.

### **Document to update**

ALL documents in the Adit Knowledge Base \- Customer vector store. Priority: Adit Voice Master Document, Adit Settings Knowledge Article, Engage New. This is a global find-and-replace, not a targeted fix.

### **Additional note**

The AI acknowledged the problem itself in thread AA-0011698 but cannot self-correct because it is constrained to its source documents. Fixing the underlying documents and re-uploading is the only permanent solution.

## **Correction 27 — Voicemail Setup — Replace 'Number List' with 'Phone System' in Navigation Steps**

**Module:** Voice / Voicemail     \|     **Source:** Live CSV logs (AskAditAI Questions)     \|     **Verified by:** Sebastin N     \|     **Priority:** High

### **Question that triggered this issue**

*How do I set up a voicemail box in Adit?*

### **What the AI was saying — WRONG**

"Go to Number List, expand your Location, then select Voicemail Boxes." The term 'Number List' is the old, deprecated name for this navigation area.

### **What the AI should say — CORRECT**

The correct instruction is: 'Go to Phone System, navigate to your Location, and select Voicemail Boxes.' All voicemail setup steps that reference 'Number List' must be updated to 'Phone System'.

### **Step-by-step correct process**

1. Navigate to Phone System (formerly called Number List — the term has changed in the current Adit UI).

2. Expand or select your Location.

3. Click on Voicemail Boxes.

4. From here you can add, configure, or edit voicemail boxes for that location.

5. Confirm the exact current navigation path (Settings → Phone System, or accessed via the Voice module) and document it accurately.

### **Why this matters**

Users cannot find 'Number List' in the Adit interface because it has been renamed to 'Phone System'. Any instructions using the old term will leave customers stuck.

### **Document to update**

This is a specific instance of Correction \#26. Fix all 'Number List' references across all documents first, then verify the specific voicemail setup steps are correct in the updated Voice documentation.

### **Additional note**

Do not fix this in isolation. Apply the full global find-and-replace from Correction \#26 first, then verify voicemail-specific steps are accurate.

## **Correction 28 — Schedule Confirmation Logic for Two Same-Day Appointments**

**Module:** Engage / Reminders / Schedule Confirmations     \|     **Source:** Team chat (Darshan Joshi, Karan Rami)     \|     **Verified by:** Darshan Joshi, Karan Rami     \|     **Priority:** High

### **Question that triggered this issue**

*If a patient has two appointments on the same day, does Adit send a schedule confirmation for both?*

### **What the AI was saying — WRONG**

"If both appointments belong to the same patient, Adit sends reminders per appointment (separate confirmations for each)." The AI said two schedule confirmations would be sent for two same-day appointments.

### **What the AI should say — CORRECT**

Only one schedule confirmation (SC) is sent per patient per day. The specific rule: an SC is sent when the first appointment is booked. If a second appointment is booked on the same day at an EARLIER time than the first, an SC is sent for the earlier appointment. If the second appointment is at a LATER time than the first, no second SC is sent. The logic is based on appointment time, not booking order.

### **Step-by-step correct process**

1. Document the schedule confirmation rule for same-day appointments clearly and exactly as follows:

2. Rule 1: Only 1 SC is sent per patient per calendar day.

3. Rule 2: When the first appointment of the day is booked, an SC is queued for that appointment.

4. Rule 3: If a second appointment is later booked on the same day at an EARLIER time — the SC switches to the earlier appointment. A new SC is sent for the earlier time slot.

5. Rule 4: If a second appointment is later booked on the same day at a LATER time — no additional SC is sent.

6. Example to include in documentation: Patient A has a 2pm appointment booked (SC sent for 2pm). Patient then books a 9am appointment on the same day. Result: SC is now sent for the 9am appointment instead. The 2pm appointment does not receive a separate SC.

7. Reverse example: Patient A has a 9am appointment booked (SC sent for 9am). Patient then books a 2pm appointment on the same day. Result: No second SC is sent. Only the 9am SC was generated.

### **Why this matters**

Practices with patients who have multiple same-day appointments are told to expect 2 confirmations when they will only receive 1\. This affects how patients and front desk staff prepare.

### **Document to update**

Engage documentation — Schedule Confirmations section. Add the two-appointment same-day rule with both examples.

### **Additional note**

Include both examples in the documentation (earlier \+ later booking scenario) so agents can explain the logic to customers clearly.

# **Action Checklist for the Knowledge Base Team**

Work through the items below in order of priority. Each item corresponds to one or more corrections in this document.

**Critical — Fix These First**

1. **C1 —** Global find-and-replace: Replace every instance of 'Number List' with 'Phone System' across all knowledge base documents. Affects: Adit Voice Master Document, Adit Settings Knowledge Article, Engage New. Re-upload all corrected documents to the vector store after updating. (Correction \#26)

2. **C2 —** Remove all references to the S710 terminal — Adit only provides the S700 model. Update pricing tables, troubleshooting guides, and all purchase documentation. (Correction \#1)

3. **C3 —** Change the answer to 'Can I manually add patients to a segment?' from Yes to No. Segments are filter-based only. Remove CSV import workaround suggestion for segments. (Correction \#7)

4. **C4 —** Change the answer to 'Can I restrict module access per location?' from Yes to No. Application access is universal across all locations. Note as a planned future feature. (Correction \#8)

5. **C5 —** Update AI Front Desk documentation: clearly state the AI only knows scheduled future EHR appointments — no treatment plans, no clinical history, no records outside of scheduled appointments. (Correction \#11)

6. **C6 —** Add strict CSV header warning to email campaign import instructions: only 'First name', 'Last name', and 'Email' headers are accepted. Any other column causes import failure. (Correction \#20)

**High — Fix After Critical Items**

1. **H1 —** Rewrite voicemail access steps — correct path is Call Tracking / Call Intelligence module or Call Pop. Remove outdated navigation path. (Correction \#2)

2. **H2 —** Update all Dolphin EHR content: describe as on-premise. Explain that Chrome extension is required because of on-premise architecture. Add single mobile number limitation for ortho practices. (Correction \#3)

3. **H3 —** Remove Call Override end-time language entirely. Call Override is toggle ON/OFF only — no scheduler, no auto-shutoff. Note as a planned future feature. (Correction \#4)

4. **H4 —** Move all Missed Call Text instructions to the Engage module. Remove from Settings → Numbers / Call Flows. (Correction \#5)

5. **H5 —** Change the answer to 'Can I log out all staff from mobile?' from Yes to No. Individual self-service session termination exists, but admin-controlled remote logout does not. (Correction \#9)

6. **H6 —** Change the answer to 'Can I send Spanish forms?' to No. Adit supports Spanish appointment reminders only — not Spanish forms. (Correction \#10)

7. **H7 —** Fix practice address path: Settings → General → Logo & Address. Remove Admin Panel → Locations from address change instructions. (Correction \#12)

8. **H8 —** Update on-premise EHR sync answer to specify the 5-minute sync frequency explicitly. (Correction \#18)

9. **H9 —** Fix mass text duplicate behavior: messages are sent per patient profile, not per phone number. 3 profiles sharing one number \= 3 texts to that number. (Correction \#19)

10. **H10 —** Update voicemail setup steps to use 'Phone System' instead of 'Number List'. (Correction \#27, dependent on C1)

11. **H11 —** Fix schedule confirmation logic for two same-day appointments: only 1 SC per patient per day, with time-based rule for which appointment receives it. (Correction \#28)

12. **H12 —** Change the answer to 'Can I revert to the old Adit layout?' to No. No version toggle or legacy UI exists. (Correction \#22)

13. **H13 —** Add Engage general messaging attachment limit to documentation: 650 KB for general messages, 8 MB for Text-to-Pay PDFs. (Correction \#21)

**Medium — Fix After High Priority Items**

1. **M1 —** Remove 'email' from canned message descriptions — canned messages are SMS only. (Correction \#6)

2. **M2 —** Remove 'expandable Details with before/after values' from Audit Logs description. This feature does not exist. (Correction \#13)

3. **M3 —** Add the missing 'Edit Organization' click to the logo upload steps: Settings → Admin → Organization → Edit Organization → camera icon. (Correction \#14)

4. **M4 —** Remove subscription plan, renewal date, and billing update form from Billing page description — none of these are shown on the page. (Correction \#15)

5. **M5 —** Remove 'Manage button' from Applications screen instructions — this button does not exist. (Correction \#16)

6. **M6 —** Update Users list pencil icon instructions — verify the current correct method for editing Role/Location/Application and document it accurately. (Correction \#17)

7. **M7 —** Update follow-up task creation steps: the option is found by clicking the downward-facing arrow at the top right of the message — not a labelled 'Create Task' button. (Correction \#23)

8. **M8 —** Update refund process: add the step to click on the transaction to open the details page first — the Refund button only appears there. (Correction \#24)

9. **M9 —** Clarify email sent visibility: Adit shows a log of sent reminders but does not allow viewing the exact email content. (Correction \#25)

