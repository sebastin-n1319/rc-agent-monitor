# **1\. Adit Pay & Payment Terminals**

## **1.1 Card Terminals \- Supported Device**

Adit currently provides one card reader model: the Stripe Reader S700. This is the only terminal available for purchase through Adit.

* Terminal model: Stripe Reader S700

* Dock station is available separately (sold as an optional add-on)

* The S700 connects via Wi-Fi and processes in-person card payments through Adit Pay

**Q:** Which terminal model does Adit provide?

**A:** Adit provides the Stripe Reader S700. This is the only model currently available. If you need to purchase a terminal, contact your Adit account representative.

**Q:** My terminal is not turning on \- what should I try?

**A:** First, confirm you are using the original power adapter. Unplug the power cable for 30 seconds, then reconnect. If the terminal still does not power on, contact Adit Support with your terminal model (S700) and a description of the issue.

## **1.2 Processing Fees \- Adit Pay (Stripe)**

Adit Pay uses Stripe's blended pricing model. This means one rate applies to all card types \- there are no separate tiers for different card types.

* Card-present (terminal): 2.25% \+ \$0.20 per transaction

* Card-not-present (manual entry or Text-to-Pay): 2.9% \+ \$0.30 per transaction

Unlike some payment processors that divide transactions into qualified, mid-qualified, and non-qualified tiers, Adit Pay's blended rate covers all card types under a single rate. There are no unexpected surcharges applied to specific card types.

## **1.3 How to Refund a Payment**

The Refund button for a transaction is only available on the transaction's details page. It is not visible from the main transactions list.

1. Navigate to Adit Pay → Transactions.

2. Search for the transaction by patient name, date, or amount.

3. Click on the transaction row to open its details page. The Refund button is only available here.

4. Click Refund, enter the refund amount (partial or full), and confirm.

5. The transaction will update to show the refund has been processed.

# **2\. Voice & Call Tracking**

## **2.1 Accessing Voicemails**

Voicemails in Adit can be accessed in two ways:

* Through the Call Tracking / Call Intelligence module \- navigate there from the Adit dashboard to view and listen to voicemails

* Through the Call Pop \- when an incoming call triggers a Call Pop notification, you can access a voicemail left by the caller directly from there

**Q:** Where do I find voicemails left by patients?

**A:** Go to Call Tracking / Call Intelligence from the Adit dashboard. From there you can view and listen to voicemail messages. You can also access voicemails through the Call Pop that appears when a call comes in.

## **2.2 Setting Up Voicemail Boxes**

Voicemail boxes are configured in the Phone System section of Adit.

1. Navigate to Phone System.

2. Expand or select your Location.

3. Click on Voicemail Boxes.

4. From here you can add, edit, and configure voicemail boxes for that location.

Note: The Phone System section was previously named 'Number List' in older versions of Adit. If you see any documentation referring to 'Number List', this refers to the same area now called Phone System.

## **2.3 Call Override**

Call Override allows you to temporarily redirect all incoming calls to a specified destination \- for example, an after-hours number or a specific staff member's phone.

**How to enable Call Override:**

1. Go to Settings \> Voice \> Call Override.

2. Select your Location from the top left of the page.

3. Toggle Call Override to ON.

4. Configure the destination where calls should be directed and how they are handled.

**How to disable Call Override:**

Return to Settings \> Voice \> Call Override → your Location and toggle Call Override to OFF.

**Q:** Can I set Call Override to turn off automatically at a specific time?

**A:** No \- Call Override can only be turned on and off manually. There is no option to set an end time or schedule an automatic shutoff. Whoever enables Call Override must remember to return and toggle it off manually when it is no longer needed.

## **2.4 Missed Call Text**

Missed Call Text is a feature that automatically sends a text message to a caller when their call to the practice goes unanswered. It is configured in the Engage module.

1. Navigate to the Engage module from the Adit dashboard.

2. Select sub-section “Auto-Reminders \> Missed Call Text” within Engage.

3. You can configure separate messages for missed calls during business hours and outside business hours.

4. Save your settings and ensure that the reminder that was configured is enabled.

**Q:** Where is Missed Call Text configured?

**A:** Missed Call Text is configured within the Engage module.  
Navigate to Engage \> Auto-Reminders and look for the “Missed Call Text” section to set up your messages for within and outside business hours.

# **3\. Engage \- Messaging & Patient Communication**

## **3.1 Canned Messages**

Canned messages are pre-written text templates that staff can quickly insert when composing a message to a patient in Engage.

**Q:** Can canned messages be used for email?

**A:** No \- canned messages are limited to be used in SMS (text messages) only within Engage. They cannot be used in email campaigns or email reminder templates.

## **3.2 Patient Segments**

Segments in Adit are dynamic patient groups built from filter criteria. Adit uses segments to target specific groups of patients for mass texts and email campaigns.

**How segments work:**

Segments are created by setting one or more filters. When the segment is used, Adit automatically finds all patients who match the filter criteria at that time.  
Filters include:

* Last Appointment

* Next Appointment

* Patient status (Active, Inactive or Both)

* Location

* Age

* Recall Due Date

* Balance Amount

* Remaining Benefits

* Primary Provider

* Secondary Provider

**Q:** Can I manually add specific patients to a segment?

**A:** No \- segments in Adit are filter-based only. You cannot add individual patients to a segment by name, and you cannot import a list of patient names via CSV into a segment. Segments automatically populate based on the filters you set.

**Q:** Can I create a segment and add 60 specific patients by hand?

**A:** No \- manual addition of specific patients to a segment is not supported. Segments work by applying filter criteria (such as last Appointment Date, Patient Status or Recall Due Date), and Adit automatically determines which patients qualify. To message a specific patient list, you would need to set filters that match those patients as a group.

## **3.3 Mass Texting \- Shared Phone Numbers**

**Q:** If three patients share the same phone number, will a mass text go to that number three times?

**A:** Yes \- mass texts are sent per patient profile, not per phone number. If three patient profiles share the same phone number, three separate messages will be sent to that number. The platform does not automatically detect or consolidate duplicate phone numbers. If your practice has family accounts where multiple family members share one phone number, each person will receive their own message from the campaign.

## **3.4 Email Campaigns \- CSV Import Requirements**

When importing a “Mailing list” of patients for an email campaign using a CSV file, the file must follow strict formatting requirements.

**CSV file requirements:**

Your CSV file must contain exactly three columns with these exact header names:

* First name

* Last name

* Email

Adding any other column \- such as phone number, date of birth, location, or any other field \- will cause the CSV import to fail. The file will be rejected entirely.

**Q:** Why is my CSV not importing for an email campaign?

**A:** Check that your CSV file contains only three columns: First name, Last name, and Email. Any additional columns or different header names will cause the import to fail. Remove all extra columns, save the file, and try importing again.

## **3.5 Messaging Attachment Limits**

Adit Engage has two separate attachment limits depending on the type of message:

* General Engage messages (SMS and in-app messages): 650 KB maximum file size and only .jpeg and .png formats are accepted.

* Text-to-Pay payment request PDF attachments: 8 MB maximum file size

**Q:** What is the file size limit for attachments in Engage messages?

**A:** For general Engage messages, the attachment limit is 650 KB. For Text-to-Pay payment request PDFs, the limit is 8 MB. These are two separate limits \- the 8 MB limit applies only to Text-to-Pay, not to regular messaging.

## **3.6 Creating a Follow-Up Task on a Message**

You can create a follow-up task directly from a patient's message thread in Engage. The option is accessed through the downward-facing arrow icon, not a labelled button.

1. Open the patient's Engage message thread.

2. Find the specific message you want to follow up on.

3. Click the downward-facing arrow icon at the top right of that message.

4. This reveals the task and follow-up creation options.

5. Fill in the follow-up task details and save.

## **3.7 Viewing Sent Email Reminders**

**Q:** Can I view the exact email that was sent to a patient as their appointment reminder?

**A:** You can see a record that an email reminder was sent \- the log shows the date, time, and type of communication (for example, appointment reminder or recall). However, you cannot view or preview the actual email content within Adit. The body of the email that was sent to the patient is not stored or displayed in the platform. To see the exact email, you would need to check from the patient's own email inbox.

## **3.8 Schedule Confirmations for Same-Day Appointments**

If a patient has two appointments on the same calendar day, the following rule applies for schedule confirmations (SC):

* Both schedule confirmations are sent to the patient.

* When the first appointment is booked, a schedule confirmation is generated for that appointment.

* If a second appointment is booked on the same day at any other time than the first appointment, a new schedule confirmation is sent for the second appointment as well.

Example: An appointment was booked at 2:00 PM(schedule confirmation sent). The patient then books a 9:00 AM appointment on the same day. Scheduled confirmation for this will also be sent out as 

**Q:** Will a patient with two appointments on the same day receive two schedule confirmations?

**A:** Yes \- Schedule Confirmation is sent per appointment booked or rescheduled. If two appointments are booked on the same day, both Schedule Confirmations would go out as soon as the appointments are booked.

## **3.9 Spanish Language Support**

Adit supports Spanish for appointment reminders (text messages and emails) when the patient's Preferred Language is set to Spanish in the EHR.

**Q:** Can patients receive their intake forms or patient forms in Spanish?

**A:** No \- Spanish-language patient forms are not currently available in Adit. Spanish is supported for appointment reminders only (text and email). Forms (intake forms, medical history, consents, etc.) are only available in English at this time.

**Q:** Can appointment reminders be sent in Spanish?

**A:** Yes \- if a patient's Preferred Language is set to Spanish in their profile, Adit will send their appointment reminders in Spanish.

# **4\. EHR Integration**

## **4.1 How EHR Sync Works \- On-Premise vs. Cloud**

Adit integrates with two types of EHR/PMS systems:

**Cloud-based EHR (e.g., Dentrix Ascend, Revolution):**

Cloud EHRs sync directly over the internet. Adit connects to Cloud systems using the Adit Chrome extension, which acts as a bridge between the Cloud EHR and the Adit platform.

**On-premise EHR (e.g., Eaglesoft, Dolphin, Dentrix):**

On-premise EHR systems are installed on a local server at your practice and are not hosted in the cloud. Adit connects to on-premise systems, which acts as a bridge between the EHR and the Adit platform. The Adit Pozative software must be running on the server that has access to the EHR for the sync to function.

## **4.2 On-Premise EHR Sync Frequency**

**Q:** How often does Adit sync with an on-premise EHR?

**A:** For on-premise EHR integrations, appointments sync between the EHR and Adit every 5 minutes. This means a new appointment booked in your EHR will appear in Adit within 5 minutes of being entered.

**Q:** A new appointment was just booked. Why isn't it showing in Adit yet?

**A:** For on-premise EHR systems, sync occurs every 5 minutes. If the appointment was just booked, it may take up to 5 minutes to appear in Adit. If it has not appeared after 10 minutes, confirm that the Adit-EHR connection is working by checking the “Last Sync On” section in Settings \> EHR \> Connection Status.

## **4.3 Dolphin EHR \- Specific Notes**

Dolphin is an on-premise dental practice management system used by many orthodontic practices. When using Dolphin with Adit, please note the following:

* Dolphin is an on-premise EHR/PMS system.

* For orthodontic practices using Dolphin: Adit can only pull one mobile phone number per patient from Dolphin. If a patient has multiple phone numbers on file in Dolphin, only one will sync to Adit. Ensure the correct mobile number is the primary number in Dolphin to make sure appointment reminders reach the right number.

## **4.4 AI Front Desk \- What It Knows and Does Not Know**

The Adit AI Front Desk handles incoming calls and texts on behalf of your practice. It answers questions, books appointments, and manages routine patient communication. It is important to understand the scope of what the AI Front Desk has access to.

**What the AI Front Desk knows:**

* Scheduled future appointments that exist in your EHR and have synced to Adit

* Your practice details configured during setup (name, address, business hours, accepted insurance, services offered, providers, booking rules)

* Standard booking, rescheduling, and cancellation workflows

**What the AI Front Desk does NOT know:**

* Treatment plans in progress (e.g., whether a patient is mid-way through a root canal or orthodontic treatment)

* Clinical history, diagnoses, or clinical notes

* Past appointment records or historical patient clinical data

* Any information not tied to a scheduled future appointment in the EHR

**Q:** Will the AI know that my patient has an ongoing root canal and can answer their questions about it?

**A:** No \- the AI Front Desk only knows about scheduled future appointments. It does not have access to treatment plans, clinical history, or any clinical data not associated with an upcoming appointment on the calendar. If a patient calls with questions about a treatment in progress, the AI will not be able to address those clinical specifics and the call will be handled according to your configured escalation settings.

# **5\. Admin & Settings**

## **5.1 Changing Your Practice Address**

The practice address is managed under the General settings section, for each of the Locations section.

1. Click the Settings (gear) icon and ensure the correct location is selected on the top left of the page.

2. Navigate to General.

3. Click on Logo & Address (this may also appear as Address & Logo).

4. Update your address fields and save.

To update the address for the Organization, navigate to Settings \> Organization \> Edit Organization and update the address here. This is not for location level address information.

**Q:** Where do I go to update the practice's physical address?

**A:** Go to Settings → General → Logo & Address. Update the address fields there and save. Note: the Admin Panel → Locations section is for managing location-level settings and is not where address changes are made.

## **5.2 Changing Your Practice Logo**

Uploading a new logo requires one additional step that is easy to miss: you must click 'Edit Organization' before the upload option becomes visible.

1. Click the Settings (gear) icon.

2. Navigate to Admin → Organization.

3. Click Edit Organization. (The upload option does not appear until this step is completed.)

4. The Upload Logo / Choose File option will now be visible. Click on it to select and upload your new logo.

5. Save changes.

**Q:** I went to Admin → Organization but I cannot see the option to upload a logo. Where is it?

**A:** You need to click 'Edit Organization' first. After clicking Edit Organization, the Upload Logo / Choose File option will appear. This step is required before the upload option becomes visible.

## **5.3 Managing User Access & Permissions**

**User roles and application access:**

User roles and application (module) access are managed in Admin → Users & Access. From there you can add new users, assign roles, and control which applications each user can access.

**Location-specific module access:**

**Q:** Can I give a user access to a module on one location but not another?

**A:** No \- application access in Adit applies across all locations. If a user is given access to a module, they will have access to that module on all locations they are assigned to. It is not currently possible to grant access to a module on one location while restricting it on another. This capability is planned for a future release.

## **5.4 Enabling and Disabling Applications (Modules)**

To see which applications are enabled or disabled, and to turn them on or off:

1. Go to Settings → Admin → Applications.

2. You will see a list of all available modules with their current enabled/disabled status.

3. Use the toggle next to each application to enable or disable it.

4. To manage which users can access a specific application, navigate to Users & Access → Application Access.

## **5.5 Audit Logs**

The Audit Log records actions taken in Adit \- who made a change, what type of action was performed, and when it occurred. You can filter the log by date range and by user.

**Q:** Can I see what a setting was before and after a change was made?

**A:** No \- the Audit Log shows that a change occurred (the user, the action type, and the timestamp) but does not display the specific before-and-after values for any change. Detailed before/after tracking is not currently available in the Audit Log.

## **5.6 Billing & Subscription**

The Billing page in Adit shows payment method and transaction history information. To review your current subscription plan or renewal date, please contact your Adit account representative or the Adit billing team \- this information is managed by Adit and is not displayed in the self-service billing page.

**Q:** Where can I see my current subscription plan and next renewal date?

**A:** Your subscription plan and renewal date are not displayed on the Adit billing page. To get this information, contact your Adit account representative or the billing team directly.

## **5.7 Logging Staff Out of the Mobile App**

**Q:** Is there a way to log all staff out of the Adit mobile app remotely?

**A:** No \- Adit does not support remote or bulk logout of staff from the mobile app. Individual users can end their own active sessions by going to My Profile → Password → Terminate all active sessions, but this is a self-service action that each user performs for their own account. An administrator cannot force-logout another user from the mobile app. To immediately remove a user's access, the user's account can be disabled in Admin → Users & Access.

## **5.8 Returning to the Previous Adit Layout**

**Q:** Can we go back to the previous version of the Adit interface?

**A:** No \- the current Adit interface is the only available version and cannot be reverted. Some modules include legacy reporting views within them (for example, Call Tracking includes Legacy Insights for older-style reports), but the overall platform layout and navigation cannot be changed back to a previous version.

# **6\. Voice**

The area in Adit where you manage phone numbers, call flows, voicemail boxes, and related voice settings is called Voice (Settings \> Voice). In older versions of Adit, this section was called 'Number List'. If you see any Adit documentation that still uses the term 'Number List', this refers to the same section now called Voice.

**Q:** Where is 'Number List' in Adit? I cannot find it.

**A:** 'Number List' is the old name for what is now called 'Voice'. Navigate to Settings \> Voice to find all phone number management, call flow, voicemail box, and eFax settings. The section was renamed and 'Number List' no longer exists as a separate area.

## **6.1 What Is in Phone System?**

The Phone System is a sub section within Settings \> Voice that contains:

* Your Adit phone numbers by location

* Call flows \- how incoming calls are routed

* Voicemail boxes

* eFax numbers

# **7\. Quick Reference \- Supported and Not Supported Features**

The table below summarizes common questions about whether specific features or capabilities are available in Adit.

| Question / Feature | Supported? | Notes |
| :---- | :---- | :---- |
| Can I manually add specific patients to a segment? | **No** | Segments are filter-based only |
| Can I restrict a user's module access to specific locations? | **No** | Access applies across all assigned locations |
| Can I remotely log out staff from the mobile app? | **No** | Individual self-logout only via My Profile |
| Can I send Spanish-language patient forms? | **No** | Spanish supported for reminders only |
| Can I set Call Override to turn off automatically? | **No** | Manual toggle only \- no auto-shutoff |
| Can I revert to the old Adit UI layout? | **No** | Current interface is the only version |
| Does the AI Front Desk know about ongoing treatment plans? | **No** | Scheduled future appointments only |
| Can I view the exact email content sent to a patient? | **No** | Log shows it was sent, not the email body |
| Can I see before/after values in the Audit Log? | **No** | Log shows action type and user only |
| Do mass texts deduplicate by phone number? | **No** | Sent per patient profile, not per number |
| Can canned messages be used for email? | **No** | SMS only |
| Can I see my subscription plan in the Billing page? | **No** | Contact your account representative |
| Are Spanish appointment reminders supported? | **Yes** | Set patient's Preferred Language to Spanish |
| Can I configure separate missed call texts for business hours vs. after-hours? | **Yes** | Configured in Engage |
| Does Adit sync with on-premise EHR every 5 minutes? | **Yes** | Appointments sync every 5 minutes |
| Can I view voicemails in Call Tracking? | **Yes** | Also accessible via Call Pop |

Adit Knowledge Base  ·  For customer use