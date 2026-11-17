**Adit AI Agent**  
Master Reference Document

# **Introduction to Adit AI Agent**

Adit AI Agent is a comprehensive suite of AI-powered solutions designed to automate, enhance, and streamline the operations of healthcare practices. The suite comprises three independent agents, each addressing a specific use case. They can be deployed individually or together for maximum operational benefit.

## **The Three Agents**

**AI Front Desk —** Handles all incoming communication to the practice, including calls and texts.  
**AI Care Coordinator —** Plans and manages all relevant outgoing communication, including calls and texts.  
**AI Web Chat —** Engages and converts visitors to the practice's website via an embedded chat widget.

## **Interactions**

Every communication handled by an agent is fully documented, transcribed, and analysed. Each complete communication is referred to as an Interaction. An Interaction may represent:

* A fully completed phone call  
* A thread of text messages constituting a single completed conversation  
* A thread of web chat messages constituting a complete conversation

Every Interaction captures the following data:

* Summary  
* Transcript  
* Interaction Type  
* Outcome  
* Customer Sentiment  
* Reason for Visit  
* Reason for Not Booking  
* Revenue Potential  
* Patient Name  
* Patient Type  
* Follow-Up Tasks

## **How It Works**

During the onboarding process, practices configure their preferences across several dimensions:

* Agent identity — name, voice, and persona  
* Agent behaviour — which call types to handle end-to-end vs. escalate  
* Agent knowledge — practice details, business hours, directions, parking, and more  
* Booking preferences — accepted insurances, services, providers, availability rules, and booking buffers  
* Task handling and call handover preferences

Once configured, a dedicated agent is instantly created for the practice. The practice then defines call forwarding criteria (e.g., after-hours only or all calls) and SMS forwarding criteria in the AI Agent preferences. Preferences can be updated at any time and take effect immediately.

## **Agent Capabilities**

### **AI Front Desk**

The AI Front Desk fully handles scheduling calls (emergency, single-patient, multi-patient), rescheduling, insurance acceptance queries, and appointment confirmations. It can partially handle billing inquiries, product order tracking, and patient callbacks by creating follow-up tasks or performing warm transfers as needed. The agent also screens marketing and sales solicitation calls. All capabilities apply equally to both calls and texts.

Note: The AI Front Desk does not make outbound calls and cannot handle outbound payment collection, recall reminders, or outbound appointment confirmations.

### **AI Care Coordinator**

Full capabilities are being finalised ahead of the release date. This agent will proactively engage patients with broken or unscheduled appointments, recall-due patients, long-lapsed patients, overdue payments, and appointment confirmations.

### **AI Web Chat**

Full capabilities are being finalised ahead of the release date. This agent will answer practice and booking-related questions from website visitors and proactively engage visitors to convert them into patients.

## **Underlying Technology**

The agent uses a combination of best-in-class providers for each component:

* Speech-to-Text (STT): Deepgram  
* Large Language Model (LLM): GPT  
* Text-to-Speech (TTS): ElevenLabs

## **Supported Languages**

Adit AI Agent can interact in all major languages and handle multiple accents. For non-English interactions, transcripts and threads are displayed in the original language; however, interaction summaries and analysis are provided in English.

Supported languages: English, Spanish, French, German, Hindi, Russian, Portuguese, Japanese, Italian, Dutch.

## **Pre-requisites**

Customers are not required to use Adit Phones to use the agent. They will need to:

* Purchase a tracking number from Adit (used for warm-transfer call forwarding to their phone provider)  
* Enable and set up Online Scheduling (booking links are optional)  
* Ensure the AI Agent module, OS, CRM (Patients Module), Tasks Module, and a call flow for warm transfers are active

For SMS handling, the practice must enable Engage and either port in their existing number or purchase a new one.

Important: The AI Agent is currently only being sold to customers who are on Adit Phones.

## **Product Release Timeline**

* AI Front Desk (without SMS) — February 2026  
* AI Front Desk (with SMS) — March 2026  
* AI Care Coordinator (with SMS) — May 2026  
* AI Web Chat — May 2026

## **Usage & Credits**

Customers may choose from two subscription variants. Usage is measured in credits:  
**1 Credit \= 1 Call Minute or 10 SMS Threads**

**After-Hours Only —** Handles calls and texts outside business hours. Includes 200 credits per subscription period. Overage: \$1 per additional credit.  
**Full-Time —** Handles overflow and missed calls during business hours in addition to after-hours. Includes 400 credits per subscription period. Overage: \$0.50 per additional credit.

Usage limits for AI Care Coordinator and AI Web Chat will be confirmed closer to their release dates.

## **Module Setup**

The AI Agent module is automatically enabled in the Adit platform as soon as a customer signs up. No manual activation is required.

## **EHR Data Sync**

The AI Agent syncs patient records and appointments back to all supported EHRs, along with the interaction summary. Note that interaction summary write-back is currently not supported for the following EHRs: PracticeWork, OfficeMate, and Cloud9. If in doubt, refer to the Adit EHR Integration Rulebook. The AI Agent requires Advanced Online Scheduling (Adv OS) to be live with full functionality.

**EHRs supporting cancel/mark-as-broken for appointments:** Open Dental, PracticeWeb, Revolution, DentrixAscend, Cloud9, ChiroTouchCloud, CrystalPM, ChiroTouch, CurveDental, Denticon, Eyefinity.

**EHRs where only appointment deletion is supported (no cancel):** Eaglesoft, Dentrix, AbelDent, Dentrix(H), ClearDent, OfficeMate, Tracker.

## **Test the Agent**

You can speak to the AI Front Desk agent by calling the following test numbers:

* Dental: \+1 (832) 590-3388  
* Optometry: \+1 (832) 399-3691  
* Chiropractic: \+1 (832) 743-6380

# **AI Front Desk — Key Value Propositions**

## **1\. Zero Missed Calls**

How many potential new patients are lost simply because lines are busy or the office is closed? With AI Front Desk, your practice achieves a 100% answer rate around the clock. Whether it is 2 PM during a lunch rush or 2 AM on a Sunday, every caller is greeted immediately. The agent captures intent, answers questions, and schedules appointments on the spot — so you never lose a patient to a competitor simply because no one picked up.

## **2\. After-Hours Revenue Capture**

Patients' needs don't stop at 5 PM. The AI Front Desk turns your after-hours voicemail into an active booking engine. Instead of leaving a message and waiting, patients can schedule, reschedule, or confirm appointments directly with the agent. Practices wake up to a filled calendar rather than a list of callbacks — generating revenue even when the office is closed.

## **3\. Eliminating Hold-Time Frustration**

When your front desk is managing in-office patients, callers often wait on hold and hang up. The AI Front Desk acts as an unlimited overflow channel — instantly handling routine requests such as scheduling hygiene, confirming appointment times, and answering FAQs. For matters requiring a human, the agent can perform a warm transfer when staff become available, or create a prioritised callback task.

## **4\. Staff Productivity and Burnout Prevention**

Highly trained front desk staff should not be bogged down by repetitive, low-value calls. By offloading routine scheduling and confirmation tasks to the agent, staff can focus on high-value interactions — such as treatment presentations and in-person patient hospitality. This reduces burnout and meaningfully improves the in-office experience.

## **5\. Accurate, Consistent Message Taking**

Every interaction handled by the AI Front Desk is automatically transcribed, categorised, and summarised — eliminating the risk of handwritten notes being lost or misinterpreted. When the agent cannot resolve a request directly, it records the exact reason for the call and creates a specific follow-up task for the practice. This creates a reliable audit trail and ensures nothing is missed.

## **6\. Seamless Warm Hand-Off**

The agent is designed to recognise when a caller is distressed or has a complex clinical question. In those scenarios, rather than blocking the caller, it initiates a warm transfer — passing the caller to a staff member along with a summary of the conversation so far. The patient feels heard, and the staff member picks up exactly where the agent left off.

## **7\. Operational Continuity During Staffing Shortages**

When a receptionist calls in sick or takes leave, the AI Front Desk provides instant redundancy. It is the team member who never gets sick, never takes a vacation, and never has a bad day. During staffing gaps, the agent can scale up to handle a higher call volume, ensuring the practice runs smoothly regardless of who is at the desk.

## **8\. A Continuously Improving System**

Unlike human staff whose performance may only be reviewed occasionally, the AI agent is continuously monitored across hundreds of practices and thousands of calls daily. A combination of sophisticated algorithms, AI agents, and domain experts make iterative improvements every day. The agent performs well out of the box and becomes measurably better over time.

# **AI Agent Overages — Explained**

Overages apply when a practice exceeds their monthly credit allocation. Below is an explanation of why this pricing model exists and what the costs represent.

## **Why We Charge Overages**

1. Enterprise-grade AI models: We use state-of-the-art STT, LLM, and TTS models — the same technology powering the world's most advanced AI systems. These models deliver natural, human-like conversations, high accuracy in understanding patient needs, and fast, reliable responses. Most competitors use lower-tier models to cut costs, which compromises performance.  
2. Investment in quality: We deliberately waited for the technology to mature before going to market. We could have launched earlier at a lower cost, but chose not to compromise on quality. The current product is the result of over 18 months of focused R\&D by a dedicated team.  
3. Dedicated computing resources: AI is resource-intensive. To ensure consistent, high-quality performance, we maintain dedicated infrastructure for each customer — resources are not shared during peak times. Most providers use shared infrastructure to reduce costs, which can lead to fluctuating performance.  
4. Fair pricing for all usage levels: Rather than charging a flat high price with unlimited minutes — which would result in most practices overpaying for capacity they don't need — we keep the base price accessible and only charge overages for genuinely heavy usage.

## **The Bottom Line**

The credits included in each plan generously cover typical practice usage. 90% of practices will never trigger an overage.

For practices with exceptionally high call volumes, overage charges reflect the real costs of premium AI model usage and the dedicated infrastructure needed to ensure every patient receives instant, reliable service. Overage rates are transparent and fair — you only pay for what you use beyond your plan.

## **Putting Overages in Perspective**

Heavy usage is a positive signal: it means the agent has been actively booking appointments and handling a high volume of patient interactions.

On average, the agent books one appointment for every 20 minutes of conversation (across all call types including scheduling, rescheduling, confirmation, cancellation, billing, and insurance).

As an example: if a practice on the Full-Time plan incurs a 200-credit overage (200 additional minutes), the agent will have booked approximately 10 additional appointments. At \$200 per appointment, that represents \$2,000 in additional revenue against an overage charge of \$100.

# **Getting Started**

## **Configure Agent**

The Configure Agent screen establishes the core identity and capabilities of the agent.

**Agent Name —** The name the agent will use when answering calls.  
**Practice Name —** How the agent will refer to the practice in conversation. This is kept as a separate setting because the practice name in Adit's location settings is sometimes set to a city or location shorthand, which would result in the agent communicating an incorrect name.  
**Agent Voice —** Practices can listen to a curated selection of voices and choose the one that best fits their brand. Agent Voice covers the full communication dimension: tone, timbre, cadence, rhythm, pitch, pacing, volume, and accent.

**Agent Capabilities —** Defines which actions the agent is authorised to handle end-to-end:

* Scheduling (Yes): The agent will collect all required information, search for available slots, and book the appointment where possible. (No): The agent collects information and creates a task for the practice to follow up.  
* Rescheduling (Yes): The agent will attempt to reschedule appointments outside the rescheduling window. (No): The agent collects information and creates a follow-up task.  
* Cancellation (Yes): The agent will first attempt to reschedule; if not possible, it will cancel the appointment within the cancellation window. (No): The agent collects information and creates a follow-up task.

For all other call types, the agent collects relevant information and either performs a warm transfer or creates a follow-up task, per the practice's preferences.

## **Custom Messages**

**Welcome Message —** The first thing the agent says when it picks up a call.  
**AI Disclosure —** When enabled, the welcome message is replaced with a statement that the caller is speaking with an AI. Disabled by default.

## **Practice Details**

The Practice Details page provides the agent with contextual knowledge about the practice. Most fields are auto-populated from Location Settings and Online Scheduling. Fields include:

* Practice Address (from Location Settings — edit via Location Settings)  
* Time Zone (from Location Settings — edit via Location Settings)  
* Google Business Page (from Business Pages Settings — edit via Business Pages Settings)  
* Business Hours (from Online Scheduling — edit via OS Settings)  
* Practice Website (from Location Settings — edit via Location Settings)  
* Parking Availability (free-text field for the practice to describe parking options)  
* Google Maps Link (if provided, the agent will send this link to new patients who ask for directions)  
* Directions to Reach (free-text field for additional directions or landmarks)

## **Booking Settings**

Booking Settings is the most critical preference page. It defines what the agent can book, how it searches for availability, and the rules governing rescheduling and cancellations.

**Payment Options —** The practice specifies accepted payment types: Medicaid, Medicare, Care Credit, credit cards, FSA, and in-house financing. An in-house financing option can be expanded with detailed terms. A free-text field is also available for any other accepted payment options.

**Accepted Insurances —** Pulled directly from Online Scheduling insurance settings (not editable from AI Agent preferences). Note: As of now, the agent cannot verify whether a patient's insurance is in the accepted list. It will collect insurance information and proceed to book unless the caller specifically requests confirmation first, in which case a follow-up task is created. Full insurance verification functionality is expected by end of March 2026\.

**Services Offered —** This section requires careful configuration. The agent can only book services that are explicitly listed and explained here. Two reasons for this design:

5. Practices often need to route calls differently than the patient expects — for example, a patient calling for a root canal may first need to be booked for a New Patient Exam.  
6. Service names in Online Scheduling are often shorthand that would not provide enough context for the agent to correctly interpret intent.

For each service, a clear explanation must be provided so the agent understands when and how to book it. An AI-assisted auto-generate button is available for the explanation field. Only services configured here will be bookable by the agent.

**Availability Settings —** The availability formula from Online Scheduling that governs how the agent searches for open slots. Not editable from AI Agent preferences — changes must be made in Online Scheduling.

**Max Booking Window —** How far into the future the agent can book appointments. Callers requesting dates beyond this window will not be booked.

**Cancellation Window —** The minimum notice period required to cancel an appointment. If a caller requests a cancellation within this window, the agent will explain the policy and create a task for the practice to follow up. Best practice: keep this to 12–24 hours.

**Rescheduling Window —** The minimum notice period required to reschedule an appointment. If a caller requests a reschedule within this window, the agent will create a task for follow-up. Best practice: keep this to 12–24 hours.

**Appointment Schedule Text Confirmation —** When enabled, the agent informs the patient they will receive a confirmation text after booking. This communication is handled by Engage as part of Scheduled Confirmation.

**Price Sheet —** Allows the practice to provide cost information for treatments. If left blank, the agent will explain that costs depend on clinical prognosis and insurance coverage. If prices are entered, the agent will share them when asked.

**Age Limitation —** Defines the patient age range the practice accepts. For example, a paediatric-only practice can set a maximum age of 18; the agent will not book appointments for older patients.

**Walk-ins —** Additional information the agent uses to answer the question: "Do you accept walk-ins?"

# **Agent Architecture and Process Flow**

When a call is sent to the agent, the following caller information is pre-loaded (provided the practice uses Adit Phones): phone number, caller ID (if available) for new patients; and phone number, first name, last name, date of birth, primary insurance provider, family file, and upcoming appointments for existing patients.

## **New Patient Scheduling**

When a caller indicates they are looking to book an appointment, the agent asks whether the appointment is for a new or returning patient. This question is asked even when caller ID is available, because existing patients sometimes call from unfamiliar numbers and new patients may call from a number already in the system.

If the caller identifies as a new patient:

7. The agent collects: First Name, Last Name, Date of Birth, and Insurance Provider.  
8. A patient record is created in Adit. If a record with matching name and phone number already exists, no duplicate is created.  
9. The agent verifies appointment history to confirm the patient is genuinely new, which determines which services are available for booking.  
10. The agent collects the reason for visit and preferred date/time, then maps the request to the appropriate service type.  
11. Available slots are retrieved via the OS API. If acceptable options exist, the appointment is booked. If none are suitable (e.g., no slots available within an acceptable timeframe for an emergency), the agent performs a warm transfer during business hours or creates a task for callback.

Prerequisite: Agent Capabilities \> Scheduling must be set to Yes.

## **Existing Patient Scheduling**

When the caller identifies as an existing patient, the agent requests their date of birth, first name, and last name for identity verification (required for HIPAA compliance). If the date of birth does not match the phone number on record, the agent prompts for an alternative number.

Once verified, the flow proceeds identically to new patient scheduling, with slot lookup and booking via the OS API.

Prerequisite: Agent Capabilities \> Scheduling must be set to Yes.

## **Rescheduling**

The agent verifies the caller's identity via date of birth and name, retrieves upcoming appointments, and confirms which appointment the caller wants to reschedule. It then presents available alternatives.

If the appointment falls within the Rescheduling Window, the agent informs the caller that a staff member will call back and creates a follow-up task.

Prerequisite: Agent Capabilities \> Rescheduling must be set to Yes.

## **Cancellation**

After identity verification, the agent retrieves upcoming appointments and identifies the one to be cancelled. Before proceeding, the agent proactively offers to reschedule. If the caller prefers to cancel, the agent gently asks for a reason (without being pushy), then cancels the appointment.

If the appointment falls within the Cancellation Window, the agent creates a task for the practice to handle the cancellation and notifies the caller accordingly.

Prerequisite: Agent Capabilities \> Cancellation must be set to Yes.

## **Appointment Confirmation**

When a caller contacts the practice to confirm appointment details, the agent verifies identity, retrieves the relevant appointment, and communicates the details.

## **Other Patient Call Types**

For any call type not covered above, the agent either performs a warm transfer during business hours (if enabled) or creates a task for the practice, communicating to the caller that someone will be in touch.

## **Sales and Marketing Calls**

The agent screens solicitation calls. It informs the caller that no one is available and creates a Vendor Calls task for the practice to review at their discretion.

# **Troubleshooting and Possible Issues**

The AI Front Desk relies on four core components — Speech-to-Text (STT), Large Language Model (LLM), Text-to-Speech (TTS), and scheduling APIs. Issues arise when one or more of these components underperform. APIs are the most controllable component and can be made close to 100% reliable; STT and LLM are inherently non-deterministic, which means occasional inaccuracies can occur.

## **Issue Reference**

**1\. Agent not scheduling/rescheduling/cancelling — only creating tasks:** Verify that the relevant Agent Capabilities are set to Yes. If they are and the issue persists, escalate to the AI Support Team.

**2\. Appointment booked for the incorrect service:** Verify that all relevant services are listed in Booking Settings with accurate explanations. If settings are correct, escalate to the AI Support Team.

**3\. Agent reports no availability when slots exist (or vice versa):** Likely an API failure. If the transcript confirms the date was captured correctly and OS shows availability for that service and date, escalate to the AI Support Team. If a date transcription error is visible in the transcript, that is the root cause.

**4\. Incorrect patient type identified (new vs. existing):** Usually caused by a STT transcription error due to call quality or pronunciation. Review the transcript and call recording to determine if the audio was unclear. If both were clear and error-free, escalate to the AI Support Team.

**5\. Agent responds to the wrong question:** Typically a STT transcription error driven by poor call quality or pronunciation. The team applies denoising and STT optimisation to minimise these cases. Verify using the transcript and recording; escalate if neither shows an issue.

**6\. Agent switches language mid-call:** Caused by a STT misinterpretation where unclear audio in English matches a word in another language, triggering the auto-language detection. The agent will switch back as soon as the caller responds in the original language. Verify using the transcript; escalate if the audio was clear.

**7\. Unable to verify existing patient:** May result from a transcription error (incorrect DOB or phone number captured) or from the patient providing incorrect information. Cross-check the patient record in the Adit platform to identify the discrepancy.

**8\. App shows incorrect patient type:** Under investigation — escalate to the AI Support Team with the interaction details.

**9\. Appointment booked for unaccepted insurance:** The agent does not currently verify insurance acceptance. By default, it books PPO patients and creates a task if the caller specifically asks for confirmation. Insurance verification functionality is expected by mid-March 2026\.

# **Interaction Types**

An Interaction Type is assigned to all calls:

* Scheduling — Patient calling to book an appointment  
* Rescheduling — Call to cancel or reschedule an existing appointment  
* Confirmation — Call to confirm or clarify appointment details  
* Emergency — Patient booking urgently due to severe pain, accident, or unforeseen circumstance  
* Recare — Outreach to patients with missed, unscheduled, or overdue appointments  
* Clinical — Queries about care, treatment, recovery, prescriptions, or medications  
* Billing — Discussions about outstanding payments, billing clarifications, or payment plans  
* Insurance — Queries about insurance acceptance, rejection, or claim follow-ups  
* Verifications — Practice calling an insurer on behalf of a patient to verify eligibility, benefits, or claim status  
* Product Order — Calls related to tracking or confirming the arrival of dental/optical products (crowns, braces, lenses, etc.)  
* Vendor — Calls between the practice and a vendor regarding orders or diagnostics  
* Others — Completed calls that do not fit any of the above categories  
* Incomplete — Call terminated too early for a meaningful interaction  
* Missed — Missed call

# **Interaction Outcomes**

Outcomes are assigned to all calls except Others, Incomplete, and Missed:

* Booked — An appointment was scheduled (applicable to Scheduling, Rescheduling, Emergency, Recare)  
* Cancelled — Appointment was cancelled without rescheduling (applicable to Rescheduling)  
* Not Booked — No appointment was scheduled and the patient left without booking (applicable to Scheduling, Emergency, Recare)  
* Resolved — Call was fully resolved with no further action required (applicable to Confirmation, Clinical, Billing, Insurance, Verifications, Vendor, Product Order, Others)  
* Not Resolved — Call was not fully resolved and requires further action (same call types as above)

# **Reason for Visit**

Reason for Visit is recorded for Scheduling, Emergency, Rescheduling, and Recare calls. The categories vary by practice vertical.

## **Dental / Orthodontics**

General Checkup, Tooth Pain, Cracked Tooth, Cleaning, Teeth Whitening, Fillings, Root Canal, Crowns, Implants, Dentures, Bridges, Extraction, Fluoride Treatment, Sealants, Veneers, Retainers, Braces, Invisalign, Bonding, Gum Contouring, Deep Cleaning, Gum Grafting, Inlays/Onlays, Pulpotomy, Space Maintainers, Appliance Placement, Interceptive Treatment, Orthognathic Consultation, Appliance Removal, Follow-Up Exam, Others.

## **Optometry**

Pediatric Eye Exam, School Vision Screening, Amblyopia/Strabismus, Pediatric Myopia Control, General Eye Exam, Prescription Update, Blurred Vision, Vision Loss, Eye Pain, Eye Injuries, Foreign Body Removal, Red Eye/Infection, Allergy Eye Care, Dry Eye, Contact Lens Exam, Occupational/Driver Vision Test, Eyeglass Purchase, Eyeglass Repairs, Cataract Evaluation, Diabetic Eye Exam, Glaucoma, Macular Degeneration Screening, LASIK, Migraine/Neurology Consultation, Follow-Up Exam, Others.

## **Chiropractic**

General Consultation, Pediatric Consultation, Scoliosis, Spinal Adjustments, Soft Tissue Therapy, Pain Management, Physical Therapy, Performance Therapy, Prenatal Care, Ergonomic Evaluation, Preventive Care, Diagnostics, Follow-Up Exam, Others.

# **Reason for Not Booking**

Reason for Not Booking is recorded for Scheduling, Emergency, Rescheduling, and Recare calls where the outcome is Not Booked or Cancelled:

* Price Enquiry — Patient inquired about pricing but was not ready to decide  
* Availability Enquiry — Patient inquired about slots but was not ready to commit  
* Preferred Financing Not Accepted — Practice does not offer the financing option the patient needs  
* Preferred Slot Not Available — No acceptable slot could be found  
* Preferred Service Not Available — Practice does not offer the requested service  
* Preferred Location Not Available — No slots available at the patient's preferred location  
* Preferred Provider Not Available — No acceptable slots for the patient's preferred provider  
* Call Missed — Practice missed the call; patient left a voicemail to book  
* Left Voicemail — Patient missed the call; practice left a voicemail  
* Medicaid Not Accepted — Patient has Medicaid which the practice does not accept  
* Medicare Not Accepted — Patient has Medicare which the practice does not accept  
* Insurance Not Accepted — Practice does not accept the patient's insurance (excluding Medicaid/Medicare)  
* Personal Emergency — Rescheduling call resulted in cancellation due to a personal emergency  
* Cash Patients Not Accepted — Practice does not accept self-pay patients  
* Language Barrier — Patient requires a specific language-speaking staff member  
* Not Interested Right Now — Recare call declined by patient without a specific callback time  
* Call Back Later — Recare call where the patient requests a callback at a specific time or date  
* Outstanding Balance — Appointment not booked due to an outstanding balance  
* Others — Reason does not fit any of the above categories

# **Revenue Potential**

Revenue Potential is assigned to each interaction based on the Reason for Visit and practice vertical. Three tiers are used:

* \$ — Low revenue potential  
* \$\$ — Medium revenue potential  
* \$\$\$ — High revenue potential

| Vertical | Reason for Visit / Treatment | Revenue Potential |
| :---- | :---- | :---- |
| Dental / Ortho | General Checkup | \$ |
| Dental / Ortho | Cleaning | \$ |
| Dental / Ortho | Tooth Pain | \$ |
| Dental / Ortho | Cracked Tooth | \$ |
| Dental / Ortho | Fluoride Treatment | \$ |
| Dental / Ortho | Sealants | \$ |
| Dental / Ortho | Appliance Removal | \$ |
| Dental / Ortho | Follow-Up Exam | \$ |
| Dental / Ortho | Others | \$ |
| Dental / Ortho | Teeth Whitening | \$\$ |
| Dental / Ortho | Fillings | \$\$ |
| Dental / Ortho | Root Canal | \$\$ |
| Dental / Ortho | Crowns | \$\$ |
| Dental / Ortho | Extraction | \$\$ |
| Dental / Ortho | Retainers | \$\$ |
| Dental / Ortho | Braces | \$\$ |
| Dental / Ortho | Bonding | \$\$ |
| Dental / Ortho | Gum Contouring | \$\$ |
| Dental / Ortho | Deep Cleaning | \$\$ |
| Dental / Ortho | Inlays / Onlays | \$\$ |
| Dental / Ortho | Pulpotomy | \$\$ |
| Dental / Ortho | Space Maintainers | \$\$ |
| Dental / Ortho | Appliance Placement | \$\$ |
| Dental / Ortho | Interceptive Treatment | \$\$ |
| Dental / Ortho | Implants | \$\$\$ |
| Dental / Ortho | Dentures | \$\$\$ |
| Dental / Ortho | Bridges | \$\$\$ |
| Dental / Ortho | Veneers | \$\$\$ |
| Dental / Ortho | Invisalign | \$\$\$ |
| Dental / Ortho | Gum Grafting | \$\$\$ |
| Dental / Ortho | Orthognathic Consultation | \$\$\$ |
| Optometry | Pediatric Eye Exam | \$ |
| Optometry | School Vision Screening | \$ |
| Optometry | General Eye Exam | \$ |
| Optometry | Prescription Update | \$ |
| Optometry | Occupational/Driver Vision Test | \$ |
| Optometry | Eyeglass Repairs | \$ |
| Optometry | Follow-Up Exam | \$ |
| Optometry | Others | \$ |
| Optometry | Amblyopia/Strabismus | \$\$ |
| Optometry | Pediatric Myopia Control | \$\$ |
| Optometry | Blurred Vision | \$\$ |
| Optometry | Vision Loss | \$\$ |
| Optometry | Eye Pain | \$\$ |
| Optometry | Eye Injuries | \$\$ |
| Optometry | Foreign Body Removal | \$\$ |
| Optometry | Red Eye/Infection | \$\$ |
| Optometry | Allergy Eye Care | \$\$ |
| Optometry | Dry Eye | \$\$ |
| Optometry | Contact Lens Exam | \$\$ |
| Optometry | Cataract Evaluation | \$\$ |
| Optometry | Diabetic Eye Exam | \$\$ |
| Optometry | Glaucoma | \$\$ |
| Optometry | Macular Degeneration Screening | \$\$ |
| Optometry | Migraine/Neurology Consult | \$\$ |
| Optometry | Eyeglass Purchase | \$\$\$ |
| Optometry | LASIK | \$\$\$ |
| Chiropractic | General Consultation | \$ |
| Chiropractic | Pediatric Consultation | \$ |
| Chiropractic | Preventive Care | \$ |
| Chiropractic | Follow-Up Exam | \$ |
| Chiropractic | Others | \$ |
| Chiropractic | Scoliosis | \$\$ |
| Chiropractic | Spinal Adjustments | \$\$ |
| Chiropractic | Soft Tissue Therapy | \$\$ |
| Chiropractic | Pain Management | \$\$ |
| Chiropractic | Physical Therapy | \$\$ |
| Chiropractic | Performance Therapy | \$\$ |
| Chiropractic | Prenatal Care | \$\$ |
| Chiropractic | Ergonomic Evaluation | \$\$ |
| Chiropractic | Diagnostics | \$\$ |

# **Frequently Asked Questions**

## **General**

**Q: What exactly is Adit AI Agent and what does it do?**

A: Adit AI Agent is a suite of AI-powered solutions that handles incoming and outgoing communication for your practice — including phone calls and text messages. It can schedule, reschedule, confirm, and cancel appointments; answer common patient questions; and create follow-up tasks for your team when human intervention is needed. Think of it as a front desk team member that is always available, never on hold, and never calls in sick.

**Q: Do we need to be on Adit Phones to use the AI Agent?**

A: Currently, yes. The AI Agent is being sold exclusively to practices that use Adit Phones. You do not need to use Adit's booking links, but you will need to purchase a tracking number from Adit for warm-transfer call forwarding. If you use SMS handling, you will also need to enable Engage and either port in your existing number or purchase a new one.

**Q: Will the AI Agent work with our existing EHR system?**

A: Yes. The agent syncs patient records and appointments back to all supported EHRs. However, interaction summary write-back is not currently supported for PracticeWork, OfficeMate, and Cloud9. If you are unsure about your specific EHR, refer to the Adit EHR Integration Rulebook or check with your onboarding specialist.

**Q: How quickly can the agent be set up and go live?**

A: Once you complete the Getting Started configuration — including Agent Setup, Practice Details, and Booking Settings — the agent is created instantly and is ready to handle calls. There is no waiting period after onboarding is complete.

**Q: Can we update the agent's settings after it goes live?**

A: Yes. All preferences can be updated at any time from within the AI Agent module, and the agent reflects those changes immediately.

## **Calls and Call Handling**

**Q: What happens when a patient calls — do they know they're speaking to an AI?**

A: By default, the agent does not announce that it is an AI. If your practice prefers full transparency, you can enable the AI Disclosure setting, which overrides the welcome message to inform callers they are speaking with an AI.

**Q: What if the AI cannot resolve a caller's request?**

A: If the agent cannot handle a request on its own, it will either perform a warm transfer to your staff (during business hours, if warm transfer is enabled) or create a follow-up task and inform the caller that someone from the practice will be in touch. The agent never simply disconnects a caller without attempting to help.

**Q: Can the agent handle calls in languages other than English?**

A: Yes. The agent supports English, Spanish, French, German, Hindi, Russian, Portuguese, Japanese, Italian, and Dutch, and can handle a wide range of accents. For non-English calls, transcripts are shown in the original language, while interaction summaries and analysis are provided in English.

**Q: What happens to sales and solicitation calls?**

A: The agent screens marketing and vendor calls before they reach your team. It informs the caller that no one is available and creates a Vendor Calls task in the system. Your staff can review and respond to these tasks at their discretion.

**Q: Can the agent handle multiple family members booking in a single call?**

A: Yes. The agent supports multi-patient booking within a single call, subject to the services and availability settings configured for your practice.

## **Scheduling and Bookings**

**Q: Will the agent book appointments for all of our services?**

A: Only services that are explicitly configured in the Booking Settings section will be available for the agent to book. Each service must include a clear explanation so the agent can accurately match patient requests to the correct appointment type. Services that are not listed will not be booked by the agent.

**Q: Can the agent book appointments for new patients?**

A: Yes, provided the relevant services are enabled for new patients in Booking Settings. The agent collects the patient's name, date of birth, and insurance information, creates a patient record in Adit, and proceeds to find and book the appropriate appointment.

**Q: What happens if no suitable slot is available for a patient?**

A: If no acceptable slot is found — for example, in an emergency situation where the patient cannot wait — the agent performs a warm transfer to your staff during business hours, or creates a priority callback task and informs the patient that someone will call them back as soon as possible.

**Q: Can we limit how far in advance the agent can book appointments?**

A: Yes. The Max Booking Window setting in Booking Settings controls how far out the agent can schedule. If a caller requests a date beyond this window, the agent will not book the appointment.

**Q: Can the agent handle rescheduling and cancellations?**

A: Yes, both are supported. Rescheduling and cancellation handling can be enabled or disabled independently in Agent Capabilities. Minimum notice period windows (Rescheduling Window and Cancellation Window) can be configured to define how close to the appointment the agent is allowed to act independently versus creating a task for staff.

## **Insurance and Billing**

**Q: Can the agent verify if a patient's insurance is accepted?**

A: Not yet. The agent currently collects the patient's insurance information and proceeds to book the appointment. If a patient specifically asks whether their insurance is accepted, the agent will note that a staff member will follow up and creates a task accordingly. Full insurance verification functionality is expected to be available by the end of March 2026\.

**Q: What if a patient asks about treatment costs?**

A: If a price sheet has been configured in Booking Settings, the agent will share the relevant cost information when asked. If no prices are configured, the agent will explain that costs depend on clinical prognosis and the patient's insurance coverage, and that someone from the practice can provide more detail.

## **Tasks and Follow-Ups**

**Q: How does the agent create tasks for our team?**

A: Whenever the agent cannot fully resolve a caller's request — whether due to a complex inquiry, a call outside business hours, or a scheduling constraint — it automatically creates a structured follow-up task in the Adit Tasks module. Each task includes the reason for the call, relevant caller details, and any other context captured during the interaction.

**Q: Can we customise the tasks the agent creates?**

A: Yes. Tasks can be configured with call links, auto-populated custom fields, and specific task types to match your team's workflow.

## **Performance and Reliability**

**Q: How accurate is the AI? What if it makes a mistake?**

A: The agent uses enterprise-grade Speech-to-Text (STT), Large Language Model (LLM), and Text-to-Speech (TTS) components. While these are state-of-the-art, they are not 100% infallible — occasional errors can occur, particularly with poor call quality or unusual accents. Every interaction is fully transcribed and recorded, so your team can review any call and identify the root cause of an issue. The agent is continuously monitored and improved based on data across all practices.

**Q: What if the agent books an appointment incorrectly?**

A: First, verify that the relevant services are correctly configured and explained in Booking Settings. If the settings are accurate and the issue persists, the interaction transcript and call recording should be reviewed to determine whether a transcription error occurred. If neither resolves the issue, it should be escalated to the Adit AI Support Team.

**Q: What happens during a staffing shortage or if our receptionist is unavailable?**

A: The agent continues to operate normally regardless of your staffing situation. You can also increase the agent's involvement — for example, routing all calls to the agent instead of only overflow or after-hours calls — during periods of short staffing.

## **Pricing and Usage**

**Q: How are credits calculated?**

A: 1 credit equals 1 call minute or 10 SMS threads. The After-Hours Only plan includes 200 credits per subscription period; the Full-Time plan includes 400 credits. Usage beyond these limits is billed as overage.

**Q: What are the overage charges?**

A: After-Hours Only plan: \$1 per additional credit. Full-Time plan: \$0.50 per additional credit. You only pay for what you use beyond your plan.

**Q: Will we regularly hit overages?**

A: Unlikely for most practices. The included credits are sized to cover typical usage generously — 90% of practices will not exceed their allocation. Overages are most relevant for practices with very high inbound call volumes.

**Q: If we do hit overages, is it worth it?**

A: In most cases, yes. Overages indicate the agent has been actively handling patient calls and booking appointments. On average, the agent books one appointment for every 20 minutes of conversation. A 200-credit overage on the Full-Time plan (\$100 in overage charges) typically corresponds to approximately 10 additional booked appointments — generating significantly more revenue than the cost incurred.

## **Data and Privacy**

**Q: Is patient data kept secure?**

A: Yes. All interactions are processed in compliance with HIPAA requirements. The agent requests multiple identifying data points (name and date of birth) before accessing or disclosing any patient-specific appointment information, in line with HIPAA verification standards.

**Q: Are calls recorded?**

A: Yes. Every call is transcribed and the recording is stored and accessible through the Adit AI module. This enables your team to review any interaction in full at any time.

**Q: Who can see the interaction data?**

A: Interaction data — including transcripts, summaries, sentiment analysis, and task details — is accessible to authorised users within your practice's Adit platform. Data is not shared with other practices.

