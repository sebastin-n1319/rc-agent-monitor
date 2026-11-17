# Process Corrections and Updates

	—---------------------------------------------------------------------------------------------------------

### 1\. Adit Task Visibility

Task visibility works similarly to **Asana**, where access is determined by task association and collaboration.

* **Patient-associated tasks:** Visible to all applicable users (Collaborators) within the practice.  
  

* **Project-associated tasks:** Visible only to users who are members of the associated project.

  

* **Tasks not associated with a patient or project:** Visible only to users who have been added as collaborators on the task and the Assignee.

  

Users who are not members of a project cannot view its tasks unless they are explicitly added as **Collaborators** to those individual tasks.



### 2\. [Online Scheduling – Deposit Payments](https://help.adit.com/portal/en/kb/articles/how-to-collect-a-deposit-from-an-online-booking)

When navigating to **Online Scheduling \> Booking Link**, enabling the **Payment Method** option currently applies **only to New Patients**.

* **New Patients:** Can be required to pay a deposit during the online scheduling process.  
* **Existing Patients:** Will **not** be prompted to pay a deposit when booking an appointment.

Support for requesting deposits from **Existing Patients** is currently under development and is planned for a future release.



### 3\. Pediatric Teeth Chart (Coming soon)

Support for a pediatric teeth chart in Treatment Plans is planned for a future update. This enhancement will include the standard primary (child) dentition chart, where teeth are identified using alphabetical notation, in addition to the existing adult tooth chart.

### 4\. Adit Server requirements

**Minimum requirements for Server Application:**  
**Operating System:** Windows Server 2008 R2 SP1 and higher  
**Memory:** 8 GB RAM  
**CPU:** 4 cores at 2.4 GHz  
**Local Drive Install Space:** At least 10 GB on C: Drive (or where the practice management software is located)   
**Internet:**   
	*Download Speed:* 10mbps  
	*Upload Speed:* 3mbps

**Recommended requirements for Server Application:**  
**Operating System:** Windows Server 2008 R2 SP1 and higher  
**Memory:** 8 GB RAM  
**CPU:** 4 cores at 2.4 GHz  
**Local Drive Install Space:**  At least 50 GB on C: Drive (or where the practice management software is located)   
**Internet:**   
	*Download Speed:* 10mbps  
	*Upload Speed:* 3mbps

### 5\. Automate Tracking and Calculation of Additional Provider Services

In the event that a practice wants to calculate additional services per provider from the patient notes, it cannot be directly pulled from there.  
Adit does not pull detailed information from patient notes beyond what is displayed in the patient card, so it cannot automatically calculate additional services documented in notes.

A recommended approach is to use **custom procedure or service codes** in the EHR/PMS to identify additional techniques (such as medical tape). These codes can then be reported on through **Patient Lists** in Adit or by using the reporting capabilities available within the EHR/PMS, making it much easier to track and calculate additional compensation.

### 6\. Custom Hold Music

Settings \> Voice \> Hold Music  


Adit supports custom hold music, allowing practices to upload their own audio that patients hear while they are placed on hold.

**Supported file formats**

* MP3  
* WAV

**Maximum file size**

* 4.5 MB

**Approximate maximum duration**

* **MP3 (128 kbps):** Up to approximately **4.7 minutes**  
* **MP3 (96 kbps):** Up to approximately **6.3 minutes**  
* **MP3 (64 kbps):** Up to approximately **9.3 minutes**  
* **WAV (uncompressed):** Approximately **20–30 seconds** due to the larger file size.

**Playback behavior**

* Hold music plays in a continuous loop while the caller remains on hold.  
* If a caller is taken off hold and then placed on hold again, playback resumes from the current loop rather than restarting from the beginning.

### 7\. Guarantor Information (Child Appointment) in AI Front Desk Scheduling

Currently, AI Front Desk does not capture or create guarantor information when scheduling appointments for children. Although Dentrix supports guarantor records (such as when a parent schedules for a child), the guarantor field is not mandatory for appointment booking. Appointments can be successfully created in Dentrix (on-premises) without adding guarantor information.

### 8\. QR Code for Direct Payments

Each location is assigned a dedicated **Direct Payment Link** (Adit Pay) unique to that location. This link can be converted into a QR code using any QR code generator (3rd Party), allowing patients to quickly access the payment portal by scanning the code. The Direct Payment Link can also be embedded as a widget on the client's website.

The QR code serves as a convenient general payment method for each location and can be displayed on the practice's website or printed for in-office use.

When patients scan the QR code (OR Click the Direct Payment Link), they are directed to the practice's payment portal (Secure Adit Portal), where they can choose to:

\> Log in using their phone number to make a payment as an existing patient.  
\> Continue as a guest to complete a payment.  

### 9\. E-Fax Limits

There is **no monthly limit** on the number of pages that can be sent using **E-Fax**. Offices can send an unlimited number of fax pages without any monthly page cap.

The maximum supported attachment size for an outgoing **E-Fax** is **10 MB**, and the file must be in **PDF, JPG** and **JPEG** formats. If a PDF exceeds **10 MB**, it must be compressed or split into multiple files before sending.



### 10\. Surcharging Feature (Coming soon)

**Once the surcharging feature is released**, practices will have the option to pass the payment processing fee on to patients as a **convenience fee**, which will be added to the total transaction amount.

The processing fees themselves will **remain unchanged**:

* **Card Present:** **2.25% \+ \$0.30** per transaction  
* **Card Not Present:** **2.90% \+ \$0.30** per transaction

There will be **no reduced fee for debit card transactions**; debit and credit cards will continue to be subject to the same applicable processing rates.

### 11\. Accommodating Patients with Special Scheduling Needs

Practices can accommodate patients with disabilities, chronic illnesses, or other unique scheduling requirements by creating **custom questions** on their online booking page. This allows patients to provide relevant information or special requests when scheduling an appointment, helping the practice identify and address any accommodations needed before the visit.  


### 12\. Syncing Communication Preferences from EHR

At this time, **communication preference settings (opt-in/opt-out) from the EHR are not synchronized with Adit**.

If a patient has been marked in the EHR as not wanting communications from the practice, that preference **will not automatically import into Adit**.  
Practices must manually update the patient's communication preferences manually within Adit to ensure they are opted out of communications.

**Patient card \> Patient info \> Opt Out Settings \> Manage**  
   


### 13\. Preferred Language Field Mapping for Eaglesoft

For **Eaglesoft version 23 and later**, Adit supports mapping the patient's **Preferred Language** directly from the dedicated Preferred Language field instead of relying on the **Notes/Memo** field.

This issue has already been identified and resolved. To apply the fix for the affected client, the **Adit Server App** simply needs to be updated to the latest version or reinstalled. Once completed, Adit will correctly read the patient's Preferred Language from Eaglesoft, ensuring that appointment reminders are sent in the appropriate language.



### 14\. Tax Inclusion in Subscription Pricing

The subscription price quoted to an office is **tax-inclusive**. The final amount presented already includes applicable taxes, and no additional tax is added at checkout.

### 15\. Intercom Support on Grandstream Phones

The intercom functionality is supported on Grandstream phones. If your office currently uses an intercom feature with the existing phone system, a similar intercom feature can be configured on the new Grandstream phones.

### 

###  16\. eFax module enhancements: 

* **PDF type selection for better fax quality**

  Customers were seeing image quality drop when faxing (especially X-rays and CT scans). When sending a fax, users now pick a PDF type first:

  • **PDF with Images**  
  • **PDF without Images** (text-based)

  We apply a compression method tuned to each type, so faxes go out at the best possible quality. Big win for practices faxing imaging. 🦷

  

* **Resend button \+ new fax statuses**

  No more re-uploading a failed fax to try again. Users can now retry the **same** fax with one click.  
  • New **Resend** button in the Action column for failed faxes and call pop

  • New statuses show what happened on retry:  
  – **Failed** → first try failed  
  – **Retrying** → user clicked on retry \-\> since its multiple attempts try mechanism (this status will be shown for time being) 🔁  
  – **Resent \- Delivered** → retry went through ✅  
  – **Resent \- Failed** → retry also failed❌

  • Resend can be used **once** per fax to prevent overuse.  
  **🔍 How the retry logic actually works (FYI)**  
  What looks like "one send" is actually a provider-fallback sequence:

   • **First send:** Telnyx (primary) attempts **3×** → if all fail, Documo attempts **1×**. Only after all 4 fail does it show **Failed**.

  • **Resend:** runs that same 4-attempt sequence again silently — the user just sees the final **Resent \- Delivered** or **Resent \- Failed.**

  • So a single fax can go through up to **8 delivery attempts** (4 \+ 4\) before it's truly done, even though the user only clicks Resend once.

### 17\. Supported Languages for AI Front Desk and SMS Agent

The **AI Front Desk** and **SMS Agent** currently support the following languages:

* English (US)  
* Spanish (Spain)  
* French (France)  
* French (Canada)  
* German  
* Portuguese (Portugal)  
* Portuguese (Brazil)  
* Italian  
* Dutch  
* Japanese  
* Korean  
* Vietnamese  
* Chinese (Simplified, China)  
* Russian  
* Turkish  
* Polish  
* Arabic (Saudi Arabia)

For conversations handled in languages other than English, the **conversation transcript remains in the original language** (e.g., Spanish or French), while the **AI-generated summary and other insights are provided in English**. At this time, Adit does **not** offer an option to translate the transcript into English. 

### 18\. Address Field Requirement in Online Scheduling

The **Address** field is currently mandatory in Online Scheduling and cannot be configured as optional. In general, fields that are required in Online Scheduling correspond to fields that the connected EHR/PMS requires when creating a new patient record.  
Most EHR softwares require an Address field to create a patient.





###  19\. California Compliance for Call Recording and AI Front Desk

* **Call Recording:** California is an **all-party consent** state, so all participants must be informed before a call is recorded. This requirement can be met by playing a recorded announcement in the call flow before transferring the call to the practice or the AI Front Desk.

  

* **AI Disclosure:** When the AI Front Desk is used only for administrative tasks (such as scheduling, reminders, patient intake, or billing inquiries), California law does **not** require disclosing that callers are interacting with AI. However, practices can enable the **AI Disclosure** setting in **AI Front Desk Settings** if they wish to notify callers.

  

### 20\. Ophthalmology Practice Support

Ophthalmology is part of **Optometry**.  
Adit supports **ophthalmology practices** and can provide services such as **phone systems, appointment reminders, online scheduling, digital forms, and other practice management features**, provided the practice's EHR/PMS integrates with Adit. Supported EHRs include **Eyefinity** and **Crystal**.

**Revenue Cycle Management (RCM)** is **not supported** for ophthalmology practices, as most patients require **medical insurance verification**, which is outside the scope of Adit's RCM services.

### 21\. Manual vs. Automated Pozative Review Requests

* **Manual review requests** (sent individually, through **Create Request**, or via **Bulk Request** from Patient Lists) **always send**, even if the patient has already received a review request within the configured restriction period (e.g., 90 or 365 days). The frequency restriction does **not** apply to manually initiated requests.  
* **Automated review requests** **do** honor the configured frequency setting. Before sending, the system checks when the last review request (quick text) was sent and will **not** send another automated request if it falls within the configured time window.  
* If a practice sends a **bulk manual review request** to all patients, **everyone in the selected list will receive it**, including patients who have already received an automated review request within the last 365 days.  
* There is **no built-in option** to automatically exclude patients who have already received a review request when sending a **manual bulk request**.  
* As a workaround, practices can create **patient segments** based on the **Last Appointment Date** (for example, selecting patients whose last appointment was before a specific date) to reduce the likelihood of sending duplicate review requests. If the practice uses **Practice Analytics**, additional filtering options may be available.

### 22\. 90-Day Password Reset Policy

On **April 22**, a security update was released requiring users to reset their passwords every **90 days**. As users approach the end of each 90-day period, they will receive prompts to reset their password in accordance with this policy.

If a user is unable to receive the password reset email, a **Manager** or **Owner** can update the email address associated with the user's account. Once the email address has been updated, the email can be sent to the new address.

Alternatively, users can initiate the **Forgot Password** process directly from the login screen without signing in. However, this method also relies on a password reset email being sent to the email address associated with the account.



Enter the **Username** and click **Reset Password**.  


Open the email and follow instructions to complete the password reset and login with the new password  


### 23\. Insurance Verification With and Without Portal Credentials

Insurance verification can be performed for some insurance providers **without portal login credentials**, although the available information may be limited.

When **portal login credentials** are provided, Adit can retrieve the **maximum amount of eligibility and benefits information** available from the insurance portal, resulting in more comprehensive verification results.

### 24\. ACH Payment Support

Support for **ACH bank connects and account payments** is currently **in development** and might be available in a future release.

### 25\. Show/Hide Services on Booking Links

Practices can now choose which services can be shown on their custom booking link.  
You can do this by:

* Log in to Adit and Select the Online Scheduling module  
* Open up “Booking Link”  
* Scroll down to the list of services.  
* Click on the checkboxes beside each service to customize until desired results are achieved.



This feature makes it easy to tailor the booking experience to fit each practice's needs. For example, a dental practice running a summer special for new patients can create a booking link that only shows "New Patient Exam" and "New Patient Consult"

### 26\. New Cloud EHR Sync Reporting (CRM section is internal classified information)

For Cloud EHR customers syncing via chrome extensions, Adit now shows three new data points that tracks the sync:

* Last Extension Sync  
* Last Backup Sync  
* Backup Sync Location  
  

**Why we built this:**  
These data points make it easy to spot customers who aren't syncing properly, whether due to improper extension usage or to identify issues in the backup sync.

**How it works:**

* **Last Extension Sync**: the last time any chrome extension successfully synced on the customer's end  
* **Last Backup Sync**: the last time a backup sync ran  
* **Backup Sync Location**: shows whether the backup sync runs on a VM (Adit-managed) or on a chrome extension (fully dependent on the customer's machine)

This info is visible in the Adit App, Admin Panel, and Zoho CRM (Adoption module).

**Please note**:

* The Adit App updates every 5 minutes, admin panel every 30 minutes, and Zoho CRM only refreshes once a day. Always check the Adit App if you need the most current status.  
* The timezone is CST.

### 27\. Mobile App Enhancements (Coming soon)

The Adit mobile app is currently being enhanced to include additional features such as **Call Tracking, AI capabilities, and support for more Adit modules**, bringing it closer to the functionality available in the web application and competing platforms.

These improvements are in the early stages; hence, **there is no estimated release timeline available at this time**.

### 28\. Collecting Card Information Without an Upfront Charge (Coming soon)

This is **not currently supported**. At this time, Adit cannot collect and store a patient's credit card information during online scheduling.

A patient's card can only be saved on file in one of the following ways:

* The patient completes a payment through a **Quick Text** payment request and chooses to save their card during the checkout process.  
* The practice already has the patient's card information and manually saves it on file.

Support for collecting and securely storing a patient's card during online booking without an upfront charge is **on the product roadmap** for a future release.

### 29\. Online Scheduling Service Type Shows "No Results" for Location

If the **Location** dropdown displays **"No Results"** while creating a **Service** in **Online Scheduling**, preventing the service from being activated:

1. Navigate to **Settings \> Application**.  
2. Disable **Online Scheduling**.  
3. Re-enable **Online Scheduling**.  
4. Refresh the page and try creating the service type again.  
5. Repeat multiple times and this could help resolve the issue.

Toggling the Online Scheduling setting off and back on typically resolves the issue.

### 30\. Yealink T46S Phone Support

The **Yealink T46S** is **not supported** by Adit.

Additionally, the **manufacturer has designated the Yealink T46S as an End-of-Life (EOL) device**, meaning it no longer receives ongoing support, updates, or maintenance. For this reason, the phone model is not supported for deployment with Adit.

### 31\. Accessing the Mobile Interface on a Computer

Yes. Practices can access a **mobile view** from the desktop application, allowing them to use an interface that closely resembles the mobile experience while working on a computer.

The **Mobile Interface** button is on the top-middle of the Desktop Application.





Click on the Desktop Interface button to return back to the original layout.

 

### 32\. Porting Phone Numbers from GoTo to Adit

**Estimated Porting Timeline**

* **Voice services:** Typically completed within **5–7 business days**, provided there are no rejections or delays from the current phone provider.  
* **SMS services:** May require an **additional 2–3 business days** after the voice port is completed. This is because GoTo uses **Bandwidth** for SMS services, and Bandwidth does not release SMS functionality on the voice port's Firm Order Commitment (FOC) date.

**Information Required for Porting**

To port phone numbers from **GoTo** to **Adit**, the following information and documentation are required:

* Account Name  
* Authorized Person's Name  
* Account Number  
* Port-Out PIN  
* Service Address  
* Landline Number(s)  
* Fax Number(s) (if applicable)  
* Tracking Number  
* GoTo Customer Service Record (CSR) document

### 33\. Mass Texts Sent Outside the Texting Window

If a user attempts to send a mass text outside of the configured texting window, the message is **automatically declined** and will not be sent.

### 34\. Blacklisted Patients and Appointment Requests

Patients added to the **blacklist** are typically identified as spammers or malicious callers. For this reason, the system does **not** notify them that their appointment request has been rejected or ignored.

This behavior is intentional. Informing blacklisted users that their appointment was not scheduled could alert spammers that they have been blocked, potentially encouraging them to find alternative methods to continue spamming the practice.

### 35\. eFax Sender Name Fields No Longer Required

As part of a recent CRM update, the **First Name** and **Last Name** fields were initially made required when sending an eFax. This created a usability issue for some clients, particularly when sending faxes to frequently used recipients such as **insurance companies, pharmacies, or referral offices**.

Following client feedback, the requirement has been removed and the change has been **deployed to production**. The **First Name** and **Last Name** fields are now **optional** when sending an eFax, allowing users to send faxes without completing these fields.

For frequently used recipients, users can still save their information as **Fax Contacts**. This makes it easier to send future faxes without having to re-enter the recipient's information each time.



### 36\. Appointment colors on the Adit schedule : Desktop vs Mobile

Colors that are selected on the Adit schedule on the desktop do not reflect as of now on the mobile app.



We can select a color for each appointment status:  


This feature is coming soon for the mobile Application to reflect the same colors.

### 37\. Importing Historical Texting and Call History

Adit does not support importing historical **texting or phone-call logs** from other vendors into the Adit platform. Porting existing communication logs, including text and call history, from a previous platform into Adit is not supported.

* Historical SMS or call-history records from a previous vendor **cannot be imported directly into Adit**.  
* There is no option to upload **CSV, ZIP, or other file formats** containing historical communication records.  
* Previous vendor records cannot be added to Adit's **Call Tracking** or **Engage message threads**.  
* Customers should retain their previous vendor's records separately if they need access to historical communication data.



























































