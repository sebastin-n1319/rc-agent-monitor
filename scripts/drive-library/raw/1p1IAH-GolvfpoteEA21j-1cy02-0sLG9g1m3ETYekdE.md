**Intro to Call Intelligence (INTERNAL) \-** [Link](#intro-to-adit-call-intelligence)

**Why Call Intelligence? / Switch Factors (INTERNAL)** \- [Link](#intro-to-adit-call-intelligence)

**Competitor Comparison (INTERNAL) \-** [Link]() 

**Impact of Call Intelligence (INTERNAL)** \- [Link](#impact-of-call-intelligence-on-practice-kpis)

**Call Intelligence – Prerequisites & Requirements Checklist** \- [Link](#heading=h.c1572co5tjjl)

**Getting Started**

1. [What is Voice Print and how does it work]()  
2. [How to set up/update your Voice Print](#how-to-set-up/update-your-voice-print)  
3. [Manage Voice Print settings for your Team](#manage-voice-print-settings-for-your-team)  
4. [Manage Task Assignment Logic](#manage-task-assignment-logic)   
5. [Sync Call Summary with Patient Notes](#sync-call-summary-with-patient-notes)

**Navigating Call Intelligence**

1. [Summary](#call-intelligence-\>-summary)  
2. [Calls](#call-intelligence-\>-calls)  
3. [Voicemails](#call-intelligence-\>-calls)  
4. [Fax](#call-intelligence-\>-calls)  
5. [Call Tasks](#call-intelligence-\>-calls)  
6. [Leads](#call-intelligence-\>-calls)  
7. [Opportunities](#call-intelligence-\>-calls)  
8. [AI Coaching](#call-intelligence-\>-calls)  
9. [AI Intelligence](#call-intelligence-\>-calls)  
10. [Legacy Insights](#call-intelligence-\>-calls)  
11. [Preferences](#call-intelligence-\>-calls)  
12. Alerts & Notifications

**Understanding Call Detail**

1. [Summary & Transcript](#summary-&-transcript)  
2. [Call Analysis & Sentiment](#call-analysis-&-sentiment)  
3. [Scorecard](#scorecards)  
4. [Associated Tasks](#associated-tasks)  
5. [Tags & Notes](#tags-and-notes)

**Understanding Call Tasks**

1. How are call tasks created  
2. How are call tasks assigned  
3. How to work your tasks

**Understanding Opportunities**

1. How are opportunities created  
2. Opportunity Stages and Meaning  
3. How to work your opportunities  
4. How to track opportunity conversion

**Understanding AI Coaching**

1. How are calls scored  
2. [Scorecard types and questions](#revenue-potential)  
3. How are scores calculated  
4. How to identify areas of improvement  
5. Userwise \- Understanding Team Performance at a Glance

**Understanding AI Intelligence**

1. [Call Analytics](#revenue-potential)  
2. Opportunities Summary  
3. Call Handling  
4. Task Handling  
5. Location Analytics

**How Call Summaries will show in EHRs**

## Intro to Adit Call Intelligence {#intro-to-adit-call-intelligence}

Adit Call Intelligence solution helps practices understand and optimize every patient phone interaction with unprecedented accuracy. By automatically classifying call type, intent, outcome, and next-step actions, it enables practices to quickly identify missed opportunities and streamline patient scheduling.

Adit Call Intelligence provides the following information for a call \-

* Call Summary  
* Call Transcript  
* Call Type  
* Call Outcome  
* Customer Sentiment  
* Reason for Visit  
* Reason for Not Booking  
* Revenue Potential  
* Patient Name  
* Patient Type  
* Front Desk User Name  
* Follow Up Tasks  
* Call Scorecard

**How it Works**

Adit Call intelligence uses the call recordings to process and analyze the information. The call recording is first passed through an ASR (Automatic Speech Recognition) software which converts the audio to timestamped transcript. This transcript is then processed via an LLM (Large Language Model) to get the all the required information other than customer sentiment

Customer sentiment is identified based on an analysis of both the emotional tone of the transcript and acoustic analysis of the audio. Entire call is broken down into segments and each segment is scored and aggregated into an overall sentiment rating.

For each segment Adit checks the following \- 

* Word choices (e.g., “frustrated,” “awesome”)  
* Polarity (positive/negative language)  
* Emotion markers (anger, relief, confusion, appreciation)  
* Segment structure and context  
* Tone  
* Volume  
* Pitch  
* Pace

**Underlying Models**

ASR (Automatic Speech Recognition) Used : Deepgram Nova 3  
LLM (Large Language Model) Used : GPT 4o

**Supported Languages**

Call Intelligence supports almost all major languages. For Non-English conversations, the transcript will be shown in the original language, but the call analysis, summary and scorecard will be in English

*List of Languages Supported (60+)*

Afrikaans, Arabic, Armenian, Azerbaijani, Belarusian, Bosnian, Bulgarian, Cantonese, Catalan, Chinese (Simplified), Chinese (Mandarin, Traditional), Croatian, Czech, Danish, Dutch, English, Estonian, Farsi, Finnish, Flemish, French, French Canada, Galician, German, German Swiss, Greek, Hebrew, Hindi, Hungarian, Icelandic, Indonesian, Italian, Japanese, Kannada, Kazakh, Korean, Latvian, Lithuanian, Macedonian, Malay, Marathi, Nepali, Norwegian, Polish, Portuguese, Romanian, Russian, Serbian, Slovak, Slovenian, Spanish, Swahili, Swedish, Tagalog, Tamil, Telugu, Thai, Turkish, Ukrainian, Urdu, Vietnamese, Welsh

**Pre-requisites**

Customers should be using the Adit Phone system to be able to use Call Intelligence. They should also have recording enabled for all their numbers within the call flow and also outbound recording enabled from Numbers \> Organization \> Call Recording \> Enable Outbound Recording

**Usage Limits**

Customers signing up for Call Intelligence will get 10000 minutes of AI analysis per month. Any usage above this limit will be charged at \$0.03 per minute.

Is 10000 minutes of analysis per month enough?  
Yes. 99% of our customer base consume less than 10000 minutes per month in call minutes.

**Module Set Up in Platform**

Call Intelligence sign up will not create a new module in Adit App for the customer. Instead we upgrade their Call Tracking module into Call Intelligence. 

Previous users who had access to Call Tracking will not by default have access to Call Intelligence. It has to be provided once again if the practice wants a particular user to have access to this.

**Syncing Data with EHR**

Call Intelligence can automatically sync Call Summary to the EHR used by the practice. As of now, we can only sync call summary and not anything else. For the following EHRs, we cannot write summary also back to EHR \- PracticeWork, OfficeMate or Cloud9

## **Prerequisites & Requirements Checklist**

This document outlines all **prerequisites, configurations, and dependencies** required to ensure **Call Intelligence (CI)** functions correctly. It should be used **before onboarding**, **during setup**, and **while troubleshooting issues**.

---

## **1\. Telephony & Call Recording Prerequisites (Mandatory)**

### **1.1 Call Recording**

* Call recording must be **enabled** for the practice/location  
* Recording must be enabled for:  
  * Inbound calls  
  * Outbound calls  
*  If calls are not recorded, **CI cannot generate transcripts, summaries, or insights**

# **Guide on: [How to Enable Inbound & Outbound Call Recording](https://help.adit.com/portal/en/kb/articles/how-to-enable-inbound-outbound-call-recording#Before_enabling_Call_Intelligence_for_your_practice_Please_perform_a_quick_pre-check_to_ensure_________call_recording_is_enabled_on_all_your_phone_lines_This_helps_us_process_your_calls_accurately_________and_ensures_that_every_eligible_call_is_analyzed_without_interruption)**

### **1.2 Tracking Numbers**

*  Calls must come through **Adit Landline numbers**  
*  Tracking numbers should be:  
  * Properly assigned to locations  
  * Actively receiving calls  
* Numbers with “0 calls” over long periods may indicate misconfiguration

---

## **2\. Call Intelligence Enablement**

### **2.1 Feature Activation**

*  Call Intelligence must be **enabled at the org/location level**  
*  Enablement date matters:  
  * Only calls **after CI is enabled (Sign up date)** will be analyzed  
  * Historical calls (before enablement) will not populate unless manually processed

---

## **3\. User & Voiceprint Configuration**

### **3.1 Users**

*  All staff handling calls must:  
  * Exist as users in the system  
  * Be assigned to the correct location(s)

### **3.2 Voiceprint Setup (For User Tagging)**

* Voiceprint is required for **accurate user tagging**  
* Notes:  
  * Initial accuracy may vary with low data  
  * Accuracy improves over time as more calls are processed  
*  If voiceprint is not registered:  
  * Calls may show “Unknown User”  
  * User tagging may be incorrect

---

## **4\. Task Assignment Prerequisites**

### **4.1 Task Configuration**

* Task creation rules must be configured  
* Assignment logic must be selected:  
  * Call user  
  * Round Robin  
  * Direct Assignment  
  * Task type  
*  If no assignment rule is selected:  
  * Tasks will be created but **not assigned**

---

## **5\. EHR Integration Prerequisites** 

### **5.1 EHR Connection**

* EHR integration and enable logs::  
  * Properly connected (Syncing)  
  * Logs enabled under EHR settings.  
    

### **5.3 Patient Matching**

*  Call summaries sync only if:  
  * Patient exists in EHR, **or**  
  * Patient matching is successful  
* Unregistered patients may not receive EHR notes

---

## **6\. Data Processing & Expectations**

### **6.1 Processing Time**

* CI is **not real-time**  
* Expected delays:  
  * Transcript: a few minutes  
  * Summary & insights: shortly after transcript  
* Delays may occur during:  
  * High call volume  
  * System incidents

---

## **8\. Common Reasons CI May Not Work Properly**

*  Call recording disabled  
*  CI not enabled at location  
*  Calls made before enablement date  
*  Voiceprint not registered  
*  Tasks configured but not assigned  
*  EHR permissions missing  
*  UI filters hiding data

---

## **9\. Pre-Onboarding Checklist (Quick Use)**

*  Call recording enabled  
*  CI enabled for location  
*  Tracking numbers verified  
*  Users added & assigned  
*  Voiceprint registered (recommended)  
*  Task assignment rules configured  
*  EHR connected & logs enabled

## Switch Factors / Why Call Intelligence?

**Top Reason why we built Call Intelligence**

To stop Revenue Leakage

* Revenue Leakage from Not Booked Scheduling Calls/voicemails due to lack of organised follow up  
* Revenue Leakage from Missed Calls due to staff not calling back on time  
* Revenue Leakage from underperforming staff not able to convert booking opportunities  
* Revenue Leakage from unhappy patients not returning to the practice  
* Revenue Leakage from incorrect strategy decisions due to lack of proper data  
  * Like what insurance providers should I accept  
  * What services should I add   
  * Which marketing channel should I spend money on  
  * Should I hire someone more or fire someone not performing

**Switch Factors \----------------------------------------------------------------------------------------------**

**Missed Revenue Opportunities**

*How many scheduling calls in a month would you say do not result in a booking? How are you tracking the follow ups on this? How many appointments would you say you are losing because of bad follow up processes?*

Lead and Opportunity tracking with automated tasks follow up will ensure that you have a scalable, dependable and automated process for this. You will get to know how many scheduling calls you had, how many have been booked, list of new patients who did not book, list of existing patients who did not book, the reason for not booking, follow up process, when was the last time we reached out and what happened. 

**Missed Call Recovery**

*How many calls go missed in a month? How are you tracking the follow ups on this? How many appointments would you say you are losing because of not calling these patients back?*

Missed call recovery tracking will give you full visibility on how many missed calls your practice had, how many have been called back, how many got connected and out of that how many were for scheduling and what percentage has been converted. With easy to use filters and automated tasks, your team can do follow ups on missed calls very easily

**Upset Customer Notification**

*How do you get to know if a patient who called your practice was unhappy with the interaction?*

Customer sentiment notification allows you to get instant notification when a user is unhappy with your front desk. Furthermore, customer sentiment analysis will let you know who your patients are mostly unhappy with or what type of calls they are mostly unhappy with. This will allow to intervene on time and make the required changes before things escalate further

**High Value Opportunity Notification**

*How do you get to know if your practice has failed to book a high value opportunity like invisalign or crown? When do you get to know about this and if you do, do you know why they did not book?*

High Value opportunity notification will instantly let you know when your practice had a high value opportunity go not booked with full summary and reasons allowing you to act immediately before the opportunity goes cold. Further more, opportunity insights will clearly let you know how many calls you got for each service type and what has been the conversion for each once again with clear reasons for the cases conversion did not happen

**Inconsistent Patient Experience**

*How do you know if your front desk is able to deliver a consistently good experience to your patients?*

Customer sentiment tracking along with AI call performance scoring means you are always in the know about how your front desk is being perceived by your patients. You will get know what kind of patients (New or Existing) are not getting a consistently good experience and what kind of interactions (Scheduling, Rescheduling, Insurance, Complaints, Billing etc) are particularly being perceived in bad light

**Staffing decisions & Training**

*How often do you get a chance to listen to calls your staff is doing? How deep are you able to go to understand the areas of improvement? If retrained, how often are you able to reassess them?*

AI Call Scoring is designed to solve this problem. AI will listen to all the calls and score them based on a very clearly defined set of criteria based on what type of call it was. This means you always know how your front desk is doing without having to listen to a single call. Moreover, this will clearly highlight where each and every one of your staff needs to improve on allowing you to immediately give them a very pointed training on where they need to improve. Post that, come back to AI scoring and see if your team is incorporating those feedbacks and if their overall performance is improving

**After Call Actionables**

*How do you know if all the steps that need to be taken after a call are being done? For eg. if a patient called in to confirm an issue with their billing and in the meantime wanted to confirm if the new insurance they are switching to is accepted and the practice mentioned that we will check and call back*

There are good chances of things getting dropped especially during busy front desk hours with your staff multi-tasking. AI based action item tracking and automated task creation based on buckets like scheduling, billing, insurance ensures that nothing falls through the crack and there is a very easy way for your practice to see their to-do list in an automated organised way

**Marketing ROI Tracking**

*Do you know which of your marketing channels are converting? Do you know if the failure of a channel is about generating leads or is it failing at conversion when it hits your front desk? If it is failing at the front desk, do you know why? Do you have enough data to decide if you are targeting the right segments with your ads?*

Call Intelligence can clearly tell you how many scheduling calls you got from each channel and what has been its conversion. For conversion failed cases, you will get to know why allowing you to make decisions with confidence regarding your marketing spend. You will also get to see missed calls from those channels and if they have returned back and recovered. 

**Data Driven Decision Making**

*How confident are you now when you make decisions about when to staff (when are my peak scheduling hours), who to staff (who are my top performers and who are my bad performers), where to spend (spending a lot on Facebook but not seeing conversions and don’t know why), which insurances and financing options to add (why are patients calling to book and not booking due to insurance not accepted), which services to add (why are patients calling to book and not booking due to service not available), why am I not getting the expected number of high value appointments (Is it because no one is calling about this?  Is this a marketing problem or is it because my front desk is not able to convert, if so why) and a myriad of other things*

The AI Intelligence part of Call Intelligence is a treasure trove of information which will allow you to make business decisions with confidence and backed by data. Not only that, it is the single place where you need to go to get total visibility into your front desk operations. No more guess work, no more at the mercy of what your front desk is saying. 

**Location level comparison (For Multi-locations and DSOs)**

*How difficult is it right now for you to understand front desk performance at each of your locations and compare it with your other locations to understand what is working where and what needs to be improved where?* 

Location level insights from Call Intelligence will empower you like never before allowing you to quickly see in one dashboard all your locations and their front desk performance. See how many calls are being handled, how many opportunities are being generated, new patient conversion, existing patient , outreach efforts, outreach conversions, average call performance, patient satisfaction levels, automated task completions, 

## **Competitor Comparison**

Weave  
PbN (Practice by Numbers)  
Peer Logic  
Mango  
Patient Prism  
Voicestack / CS Conversations by Carestack

| Feature | Adit | Weave | PbN | Peer Logic | Mango | Patient Prism | Top Feature? | Remarks |
| :---- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | ----- |
| Voice Print Based User Identification | Yes | No | Yes | No | No |  | Yes | Key Differentiator 1 |
| Transcript based User Identification | Yes | No | No | No |  |  |  |  |
| Extension based User Identification | No | Yes | No | Yes |  |  |  |  |
| Summary | Yes | Yes | Yes | Yes |  |  | Yes |  |
| Transcript and Playback | Yes | Yes | Yes | Yes |  |  | Yes |  |
| Call Type | Yes | Yes | Yes | Yes |  |  | Yes |  |
| Call Outcome | Yes | Yes | Yes | Yes |  |  | Yes |  |
| Reason for Visit / Procedure | Yes | Yes | Yes | Yes |  |  | Yes |  |
| Reason for Not Booking | Yes | No | No | No |  |  | Yes | Key Differentiator 2 |
| Automated Tasks  | Yes | Yes | No | No |  |  | Yes |  |
| Opportunity Lists | Yes | Yes | Yes | Yes |  |  |  |  |
| Opportunity Management | Yes | No | No | No |  |  | Yes | Key Differentiator 3 |
| Missed Call Recovery | Yes | Yes | Yes | Yes |  |  | Yes |  |
| Customisable Tasks with Call Links and Auto Custom Fields | Yes | No | No | No |  |  |  | Key Differentiator 4  |
| Customer Sentiment | Yes | Yes | Yes | Yes |  |  | Yes |  |
| Call Scoring & Training | Yes | Yes | Yes | Yes |  |  | Yes | Key Differentiator 5 \- Scored on more parameters (15) |
| Summary write back to EHR | Yes | No | Yes | No |  |  | Yes | Key Differentiator 6 |
| Transcript write back to EHR | Yes | No | Yes | No |  |  |  | Key Differentiator 6 |
| Alerts & Notifications | Yes | Yes | Yes | Yes |  |  | Yes |  |
| Userwise Coaching Dashboard | Yes | Yes | Yes | Yes |  |  | Yes | Not as effective for others due to flawed user identification |
| Detailed Call Insights | Yes | Yes | Yes | Yes |  |  |  |  |
| Multi-location Insights | Yes | No | No | No |  |  | Yes | Key Differentiator 7 |
| Detailed Opportunity Insights | Yes | No | Yes | Yes |  |  | Yes |  |
| **Full Feature Price** | **\$99 \- \$199** | **\$199** | **\$348** | **\$399** |  |  |  |  |

Peer Logic CI Demo \- Link 

Weave CI \- [Link](https://www.getweave.com/call-intelligence/)

PbN CI \- [Link](https://www.practicenumbers.com/pbn-ai/)

## Impact of Call Intelligence on Practice KPIs {#impact-of-call-intelligence-on-practice-kpis}

If calls are not handled properly, then a lot of key KPIs of Practice performance will be impacted

Top KPIs of Practices and how Call Handling impacts it

| KPI Name | Explanation (Short) | Phone Handling Impact? | How Phone Handling Impacts It |
| ----- | ----- | ----- | ----- |
| **Call Answer Rate** | % of calls answered vs missed | Yes | Missed calls \= lost new patients, fewer bookings |
| **New Patient Conversion Rate** | % of inquiries that turn into appointments | Yes | Poor tone/info \= callers don’t book |
| **Schedule Utilization (%)** | % of chair time filled | Yes | Poor booking/rescheduling → empty slots |
| **No-Show & Late Cancel Rate** | Missed appts & late cancels | Yes | Failed confirmations → more no-shows |
| **Treatment Acceptance Rate** | % of patients accepting tx plans | Yes | No follow-up on interested callers → revenue loss |
| **Daily Production / Revenue** | Revenue generated per day | Yes | Lost calls & missed tx → lower production |
| **AR / Collections** | Money collected vs owed | Yes | Missing insurance details → denials/write-offs |
| **Patient Satisfaction / Reviews** | Patient experience & ratings | Yes | Poor etiquette/tone → complaints/bad reviews |
| **Active Patient Count** | Returning / engaged patients | Yes | Weak follow-up → patients drift to other clinics |
| **Operational Efficiency** | Smoothness \+ minimal errors | Yes | Incomplete notes/info → workflow breakdowns |

How Call Intelligence can solve this

| KPI Name | How Poor Phone Handling Impacts the KPI | How Call Intelligence Fixes / Improves It |
| ----- | ----- | ----- |
| **Call Answer Rate** | Missed calls not noticed → lost new patients | Tracks missed calls, alerts instantly, prompts urgent callbacks |
| **New Patient Conversion Rate** | Weak phone skills, poor tone, incorrect info → callers don’t book | Sentiment \+ analysis \+ scoring → identifies why and highlights reps needing coaching |
| **Schedule Utilization (%)** | Unbooked scheduling intent, poor rescheduling → empty chair time | Auto-detects unbooked appointment intent and creates Scheduling tasks |
| **No-Show & Cancellation Rate** | Failed confirmation calls → more no-shows | Flags unconfirmed and cancelled appointments → auto follow-up tasks |
| **Treatment Acceptance Rate** | Patient shows interest but front desk fails to follow up | System tags unscheduled treatment calls → auto tasks for treatment coordinator |
| **Daily Production / Revenue** | Lost appointments, lost treatment \= reduced daily revenue | Tracks outcome of every call → ensures every opportunity gets followed up |
| **AR / Collections Performance** | Missing/wrong insurance details from calls → claim denials | Detects incomplete info collection and unresolved billing calls → auto follow-up tasks \+ scoring highlights for training |
| **Patient Satisfaction / Reviews** | Poor etiquette/tone → bad reviews, complaints | Sentiment detection alerts manager early → service recovery |
| **Operational Efficiency** | Miscommunication, missing notes, no documentation → chaos | Auto-logs call type, outcome, caller info → pushes to EHR and reduces manual admin mistakes |

## What is a Voice Print and how does it work? How does Adit identify who answered the call?

Adit Call Intelligence uses voice print to identify the staff who spoke on the call. As part of Getting Started, Adit captures a voice recording of all users speaking a passage which we use to create a unique voice print for each user.

A voice print is just a digital representation of the unique vocal characteristics of an individual. It captures specific features of a person's voice such as pitch, tone, cadence, rhythm, and speech patterns, creating a unique vocal signature which we can use to identify the staff who spoke on the phone.

*Why voice print and not some other solutions for identifying who spoke on the call?*

There are two other ways to identify who spoke on the call, both of which are not as reliable as using a voice print

1. Using Transcript \- AI can use the transcript to understand which user spoke on the phone if their name shows up in the transcript. For example, if a user picked up the phone and mentioned “Hello, ABC Dental. This is Emma. How can I help you?”, then AI will be able to identify it was Emma who spoke on the phone. But the drawback of this method is that the staff will not introduce themselves or mention their names in all the calls leaving a lot of calls which AI cannot tag to a user  
2. Using Extension Number \- This is a low tech solution which will tag a particular staff to a particular extension and assign all the calls coming to that extension to that user. This has obvious drawbacks wherein this solution will not work if same extensions are answered by multiple staff

   ## How to set up/update your Voice Print {#how-to-set-up/update-your-voice-print}

### Setting up your voice print

Voiceprint can be set up from the Web/Desktop App or from the Mobile App. Voiceprint can be set up from Web/Desktop App only if the system has an inbuilt microphone. Else, users will have to use the mobile app to set up the voiceprint.

**To set it up in Web / Desktop App \-** 

1. Go to Call Intelligence \> Get Started \> 1\. Voice Print  
     
2. Select the “Use Microphone in your Computer” option and provide Adit access to your microphone. In your Chrome browser, you can select the “Allow this time”

3. Click on “Record Me” and start reading the passage. Please ensure that you read the whole passage. A minimum length of voice recording is required to create the voice print properly  
   



4. Once the passage is done, click on “Stop Recording”



5. You can listen to recording if needed by pressing the play button and click on “Save” once done



6. If not satisfied, click on “Discard” to restart the voice recording

7. Once successfully uploaded, Getting Started will show a success message



### Checking if your voice print is set up properly/Updating your voice print

1. Go to Preferences \> Voice Print and check the status of your voice print. It will show either success or failure



2. You can create your voice print again from here if it is not successfully set up. You have the option to recreate the voiceprint if needed in case of successful creation as well.

**To set it up in Mobile App \-** 

1. Go to Settings \> Voice Print  
     
2. Click on the \+ icon on top right to add a new Voice Print. Select the user and click on done and handover the phone to the user  
     
     
     
3. Click on the microphone icon to start recording and read the paragraph. Once done click on the stop button  
     
4. Playback if needed to hear if it has been recorded properly. If happy with the recording, then click on ‘Save’ to save the voiceprint

   

### Can we set up voiceprints for users in the practice without giving them access to Call Intelligence?

Yes, this is possible via the Mobile App. Anyone in the practice who has the mobile app installed can login and provide their phone to the required users to record their voiceprint. This can be used by the application to identify the users on the call without giving Call Intelligence access to these users.

How to set up voice print help page : [https\://help.adit.com/portal/en/kb/articles/getting-started-with-adit-call-intelligence](https://help.adit.com/portal/en/kb/articles/getting-started-with-adit-call-intelligence)

### *Possible Support Issues we can face*

1. Not able to set up voiceprint using microphone \- This could be possibly because their system do not have a microphone or they have not given permission to Adit to use the microphone

2. Voice Print showing as not set up even after uploading \- This could be because the file uploaded did not meet the minimum requirements for creating the voice print. Users can try creating it once again and see if that solves the problem. If there are failures happening across practices, then this could be a backend API issue which will again have to be investigated

   ## Manage Voice Print settings for your Team {#manage-voice-print-settings-for-your-team}

Setting up voice print is important for us to surface a lot of useful information from call intelligence especially with regards to team performance and coaching opportunities. You can manage which all roles should mandatorily set up the voice print using this setting.

1. Go to Call Intelligence \> Get Started \> Voice Print Criteria for your Team

2. Mark voice print as required for the applicable roles



3. If marked as required, users belonging to that role will not be able to access Call Intelligence unless they have set up their Voice Print

You can access this from Call Intelligence \> Preferences as well. In order to see who all has set up voice print successfully, you can go to Call Intelligence \> Preferences \> Team Status



### *Possible Support Issues we can face*

1. Want to control voice print requirement user level and not at role level \- Unfortunately, this is not possible at this time. If we get enough requests, we will consider it

   ## Manage Task Assignment Logic {#manage-task-assignment-logic}

One of the most important features of call intelligence is that it will automatically create follow up tasks whenever a manual action is required from the practice. It is imperative that we assign those tasks to relevant people so that follow up happens on time. This setting will allow you to automate how you want the system created tasks to be assigned

1. Go to Call Intelligence \> Get Started \> Task Assignment Logic. You will see four options  
   1. Assign based on Call User \- Task will get assigned to the person who handled the call. Task will remain unassigned if you select this option and someone who has not set up a voice print answers the call  
   2. Round Robin assign all Call Tasks \- This option will allow you to select a set of users to whom the tasks will be assigned in a round robin manner  
   3. Direct Assign all Call Tasks \- This option will allow you to mention a single user to whom all the call tasks will be assigned  
   4. Do Not Assign Call Tasks to Anyone \- Selecting this option will ensure that the system created tasks are not assigned to anyone



### *Possible Support Issues we can face*

1. Tasks are not getting assigned \- Check preferences and ensure that we have not selected the “Do Not Assign Call Tasks to Anyone” option

2. Can tasks be assigned to users based on task type \- Unfortunately, we can’t do that now. But it will be part of next level of Product Updates

   ## Sync Call Summary with Patient Notes {#sync-call-summary-with-patient-notes}

Call Intelligence will provide you the option to automatically summarise calls with your patients into EHR patient notes so that your staff does not have to do it manually everytime

To set this up, go to Call Intelligence \> Get Started \> Call Summary sync with Patient Notes and set it to “Yes”



There are some EHRs where we won’t be able to write back summary to \- Denticon, Officemate, Cloud9 and Practicework. Orthotrac has a 60 character limit and summary will get cut off beyond that. We will be able to write full call summaries to all other EHRs

### *Possible Support Issues we can face*

1. Summary not syncing to Patient Notes \- First we need to check if this functionality is enabled in Preferences, if enabled check if the case(s) for which sync is not happening are actually patients in Adit (sync will not work for Lead, Contacts, Unrecognized and Temp Patients). If it is a patient, option is enabled and there are proper call summary against call records and sync still not working, then it needs to be investigated

   ## Call Intelligence \> Summary {#call-intelligence->-summary}

The Summary page in Call Intelligence is designed to show the most important information in a concise format. The information shown in this page quickly summarizes how your front desk is doing.

**Trend Chart**

The first widget in Summary is a Trend Chart. By default, this chart will show New Patient Conversion Trend. But there is an option to select one out of four options \- New Patient Conversion Trend, All Opportunity Conversion Trend, Customer Sentiment Trend and Call Type Trend  
 

***New Patient Conversion Trend*** \- This shows the breakdown of scheduling opportunities from new patients. Whenever a new patient calls to book an appointment, Call Intelligence creates a New Patient Opportunity. Opportunity has a lifespan of 30 days within which it can get booked. Opportunity can have 3 status \- Booked, Not Booked, Lost

* Booked Status \- If the appointment is booked on the call or within 30 days of creating the opportunity  
* Lost Status \- If the appointment is not booked on the call and within 30 days of creating the opportunity or if the opportunity is manually moved to Lost  
* Not Booked Status \- If the appointment is not booked on the call and it has been less than 30 days since the creation of the opportunity


New Patient Conversion Trend will show the number of new patient opportunities created for the practice in the last 30 days and how many of them have been booked, not booked and lost. This can be filtered for any timeline from the top. Trend chart can also be updated to show absolute numbers or percentage numbers from the top

***All Opportunity Conversion Trend*** \- This shows the breakdown of scheduling opportunities from all patients. Whenever a patient calls to book an appointment, Call Intelligence creates an Opportunity.

All Opportunity Conversion Trend will show the number of opportunities created for the practice in the last 30 days and how many of them have been booked, not booked and lost. This can be filtered for any timeline from the top. Trend chart can also be updated to show absolute numbers or percentage numbers from the top

***Customer Sentiment Trend*** \- This shows the customer sentiment breakdown of all the calls handled by the practice over the last 30 days. All the completed calls will get a customer sentiment attached to it based on advanced natural language processing techniques that analyze text to detect emotions, opinions, attitudes, full context of language, tone, sarcasm, negations and intensifiers. Completed calls get categorised into 3 customer sentiment buckets \- Happy, Unhappy, Neutral

* Happy: The customer feels positive, satisfied, and delighted with their experience or interaction with the practice.  
* Unhappy: The customer experiences dissatisfaction, frustration, or negative emotions towards their interaction with the practice.  
* Neutral: The customer feels indifferent or has no strong positive or negative emotions about their interaction with the practice.


Customer Sentiment Trend will show how many interactions had happy, unhappy, neutral customer sentiments across the last 30 days. This can be filtered for any timeline from the top. Trend chart can also be updated to show absolute numbers or percentage numbers from the top

***Call Type Trend*** \- This shows the call type breakdown of all the calls handled by the practice over the last 30 days. All the completed calls will get categorized into a call type based on the purpose of the call. Completed calls get categorised into 10 call type buckets

* Scheduling \- If the patient is calling the practice looking to book an appointment   
* Recheduling \- If the patient or the practice is calling to cancel an appointment or to reschedule an appointment  
* Confirmation \- If the patient is calling to confirm or clarify the time of the appointment or if the practice is calling the patient to confirm their participation  
* Emergency \- If the patient is looking to book an appointment on an emergency basis due to severe pain, accident or for some other unforeseen reason  
* Recare \- If the practice is reaching out to the patient to get them to book an appointment because they missed their appointment or if some of their treatment is due or just trying to bring them back because it has been sometime since their last visit  
* Clinical \- If the patient or the practice is calling to check on general care, treatment care, treatment recovery, instructions, prescriptions or medicines  
* Billing \- If the conversation is between the patient (or guardian) and the practice regarding outstanding payments, billing clarifications or payment plans and benefits  
* Insurance \- If the conversation is between the patient (or guardian) and the practice regarding insurance acceptance, insurance rejection or claim follow ups  
* Verifications: Calls made by the practice to an insurance company or provider on behalf of a patient to check eligibility, claims, benefits, or status  
* Product Order \- If the call is related to tracking the order or confirming the arrival of products like crowns, braces, veneers, specs, lenses etc  
* Vendor \- If the call is between the practice and a vendor other than the insurance provider regarding the orders placed by the practice to the vendor or regarding diagnostics done with the vendor  
* Others \- If the completed call does not fall into any of the above categories, then it will get categorised as others  
* Incomplete \- If the call gets terminated very early without a proper conversation between the practice and the patient, then it will get marked as “Incomplete”  
* Missed \- If it is a missed call


Call Type Trend can be filtered for any timeline from the top. Trend chart can also be updated to show absolute numbers or percentage numbers from the top

**Customer Sentiment Chart**

The second widget in Summary is the Customer Sentiment Chart. This chart will show the overall breakdown of the count of all happy, unhappy and neutral interactions over the selected period. There is an overall sentiment score that is being calculated and shown in the chart. This is done by providing happy interactions a score of 100, neutral interactions a score of 50 and unhappy interactions a score of 0

Overall Sentiment Score \= (Happy Calls x 100\) \+ (Neutral Calls x 50\) \+ (Unhappy Calls x 0\)  
                                                                (Count of Happy, Unhappy and Neutral Calls)

**Call Type Chart**

The third widget in Summary is the Call Type Chart. This chart will show the overall breakdown of the count of all different call types over the selected period. 

**Opportunity Conversion Chart**

The last widget in Summary is the Opportunity Conversion Chart. This chart will show the overall breakdown of the count of all booked, not booked and lost opportunities over the selected period. There is an overall conversion percentage that is being calculated and shown in the chart.

Opportunity Conversion % \= Booked Opportunities x 100  
                                                       All Opportunities  
.

### *Possible Support Issues we can face*

1. Blank data in Summary \- This could be because of backend API issues and will have to be investigated

   ## Call Intelligence \> Calls {#call-intelligence->-calls}

Calls will have 2 sections \- All Calls and Missed Calls. All Calls houses all the  inbound calls, outbound calls, missed calls and voicemails. Missed calls will track unique missed calls and its recovery .i.e if they have been called back

**All Calls**  
   


Call Volume breakdown chart on the top of the page shows the number of calls handled by the practice. It can be updated for different criterias \- 

* By Source \- Based on the Source set up against the Tracking Numbers  
* By Patient Type \- Based on if it is a New Patient, Existing Patient or Non-Patient Calls (N/A)  
* By Call Type \- Based on Call Type breakdown \- Scheduling, Rescheduling, Confirmations, Emergency, Recare, Clinical, Billing, Insurance, Verifications, Product Order, Vendor, Others, Incomplete  
* By Outcome \- Based on Call Type outcome \- Booked, Not Booked, Resolved, Not Resolved, Cancelled  
* By User \- Based on the user who spoke from the practice on the call based on voice print  
* By Call Direction \- Based on if it is Inbound or Outbound  
* By Phone Number \- Based on the phone number that received the initial call between landline and tracking numbers  
* By Sentiment \- Based on if the sentiment of the caller is happy, unhappy or neutral

Call Table will have the following columns. Table can be customized to show based on practice preference

* Caller \- User id of the caller  
* Tracking Number \- The original number that received the call  
* Extension \- Extension it was answered from  
* Time \- Time stamp of the call  
* Location \- Location of the organization which received the call  
* Source \- Based on the source from the tracking number that received the call  
* Duration \- Total duration of the call  
* User \- Staff which handled the call from the practice  
* Patient Type \- Based on if the call is from New Patient, Existing Patient or Non-Patient (N/A)  
* Call Type \- [Call Type](#call-intelligence-\>-calls) based on the call analysis  
* Call Outcome \- [Call outcome](#call-intelligence-\>-calls) based on the call analysis  
* Sentiment \- Customer sentiment based on the call analysis  
* Reason for Visit \- [Reason for Visit](#call-intelligence-\>-calls) based on the call analysis  
* Reason for Not Booking \- [Reason for Not Booking](#call-intelligence-\>-calls) based on the call analysis  
* Revenue Potential \- \$ (Low Potential \~\$100-\$200), \$\$ (Medium Potential \~\$250-\~\$2000) or \$\$\$ (High Potential \>\~\$2500) based on the Reason for Visit  
* Open Tasks \- No of open tasks tagged against the call  
* Closed Tasks \- No of closed tasks tagged against the call  
* Notes \- Manual Notes added against the call  
* Custom Tags \- Manual tags added against the call

There are 3 actions available against the call

* Call Detail \- Analysis of the call as shown by the play button. The play button will show a filled icon if the detail is yet to be clicked and will show as border icon when clicked.   
* Patient Card \- It will open the patient card of the caller  
* Tasks \- This will create a task against the call

**Missed Calls**

****

Missed Call Table is technically Missed Call Recovery Table. The table will have unique entries for missed calls based on the number the call came from. The idea is to show if any missed calls are yet to be returned.

In the top there are 5 KPIs shown \- 

* Unique Missed Calls \- Total number of missed calls from unique phone numbers for the selected timeline  
* Missed Calls yet to be Returned \- Total number of unique missed calls that are yet to be called back or not answered as a later incoming call. Essentially nobody from the practice has attempted to contact or have spoken to the caller  
* Missed Calls yet to be Connected \- Total number of unique missed calls where no one from the practice has been able to talk to the caller. This could mean the practice have attempted to contact the caller but could not get connected with the caller and speak to them  
* Scheduling Opportunities Generated \- Missed Calls when returned are for Scheduling resulting in a Scheduling Opportunity  
* Appointments Booked \- Appointments booked from the missed calls returned by the practice

Missed Call Table will have the following columns. Table can be customized to show based on practice preference

* Caller \- User id of the caller  
* Time \- Time stamp of the call  
* Location \- Location of the organization which received the call  
* Source \- Based on the source from the tracking number that received the call  
* Duration \- Total duration of the call  
* \# Missed Calls \- Total number of missed calls received from the number  
* Returned? \- Updates as ‘Yes’ if the latest missed call from the number has been attempted to contact or has come in as another call which was answered. Else it will be updated as ‘No’  
* Returned Time \- Time stamp of the call if Returned? Is ‘Yes’ else it will be blank  
* Previous Returned Time \- Timestamp of the penultimate attempt to return the call  
* \# Attempts \- Number of outbound calls attempted against the number  
* Connected? \- Updates as ‘Yes’ if the latest missed call from the number has been returned and connected or has come in as another call which was answered. It will be updated as ‘No’ if the call has been returned and not connected else it will be updated as N/A which means the call has not been returned yet  
* Connected Time \- Time stamp of the call if Connected? Is ‘Yes’ else it will be blank  
* Previous Connected Time \- Timestamp of the penultimate time the call got connected  
* User \- Staff which handled the call from the practice  
* Call Type \- [Call Type](#call-intelligence-\>-calls) based on the call analysis  
* Call Outcome \- [Call outcome](#call-intelligence-\>-calls) based on the call analysis  
* Sentiment \- Customer sentiment based on the call analysis  
* Reason for Visit \- [Reason for Visit](#call-intelligence-\>-calls) based on the call analysis  
* Reason for Not Booking \- [Reason for Not Booking](#call-intelligence-\>-calls) based on the call analysis  
* Revenue Potential \- \$ (Low Potential \~\$100-\$200), \$\$ (Medium Potential \~\$250-\~\$2000) or \$\$\$ (High Potential \>\~\$2500) based on the Reason for Visit

Missed Call Recovery Logic

* When to create new entries  
  * When a missed call comes and we are not able to find an entry in the Missed Calls table where Connected \= Yes. In other words we will only create a new entry if no entry is present at all or an entry is present but for that entry connected status is Yes.  
* Updating entries in the Missed Call Table  
  * When another missed call is registered for a call in the table and Connected \= No, we will go and update the Time and \#Missed Calls  
  * When a call is answered (incoming/outgoing) and that phone number is part of the missed calls table and Connected \= No, then we need to update the relevant fields.  
    * Connected \= Yes  
    * Connected Date  
    * User  
    * \# Attempts  
    * Call Type  
    * Call Outcome  
    * Sentiment  
    * Reason for Visit  
    * Reason for Not Booking  
    * Revenue Potential  
    * If Returned \= No, then update it as Yes  
    * If Returned is updated as then, update Returned Date  
    * Previous Returned Date \= Returned Date prior update  
    * Previous Connected Date \= Connected Date prior update  
  * When an outgoing call is made and is unanswered and that phone number is part of the missed calls table and Connected \= No, then we need to update the relevant fields.  
    * Returned \= Yes  
    * Returned Date Date  
    * User  
    * \# Attempts  
    * Previous Returned Date \= Returned Date prior update  
* Once a missed call entry has been updated as Connected, let us not touch that record anymore. It will be the final status of that record  
* When a missed call comes, we create a new record if we are only able to find Connected \= Yes, status records for that phone number

Even if we hit the voicemail, we still need to show it as Not Connected. Connected means the practice has been able to talk to the patient

\[To Finalise\] For missed call tracking, would it be possible to track and update the record based on all the phone numbers in the patient card. For eg, we get a missed call from number which is their mobile number and the practice calls back home phone number in the patient card

## Call Intelligence \> Voicemails {#call-intelligence->-voicemails}

Voicemails house all the voicemails received by the practice. This will not include the voicemails left the practice for the patients \- that will show as an outgoing call.



Voicemails will also be analysed by AI and will have the following details \- 

* Summary  
* Transcript  
* Call Type  
* Call Outcome  
* Reason for Visit (if applicable)  
* Reason for Not Booking (if applicable)  
* Customer Sentiment  
* Revenue Potential (if applicable)  
* Follow Up Tasks (if applicable)

Voicemails will not be scored since there is no two way interaction between the patient and the practice



Voicemails will also have an archive functionality when archived will push the voicemail to the Archived tab. To unarchive click on the unarchive option and it will push the voicemail back to the inbox

Voicemails Table will have the following columns. Table can be customized to show based on practice preference

* Caller \- User id of the caller  
* Tracking Number \- The original number that received the voicemail  
* Time \- Time stamp of the voicemail  
* Location \- Location of the organization which received the voicemail  
* Source \- Based on the source from the tracking number that received the voicemail  
* Duration \- Total duration of the voicemail  
* Voicemail Box \- The voicemail box which received the voicemail  
* Patient Type \- Based on if the voicemail is from New Patient, Existing Patient or Non-Patient (N/A)  
* Call Type \- [Call Type](#call-intelligence-\>-voicemails) based on the call analysis  
* Call Outcome \- [Call outcome](#call-intelligence-\>-voicemails) based on the call analysis  
* Sentiment \- Customer sentiment based on the call analysis  
* Reason for Visit \- [Reason for Visit](#call-intelligence-\>-voicemails) based on the call analysis  
* Reason for Not Booking \- [Reason for Not Booking](#call-intelligence-\>-voicemails) based on the call analysis  
* Revenue Potential \- \$ (Low Potential \~\$100-\$200), \$\$ (Medium Potential \~\$250-\~\$2000) or \$\$\$ (High Potential \>\~\$2500) based on the Reason for Visit  
* Open Tasks \- No of open tasks tagged against the call  
* Closed Tasks \- No of closed tasks tagged against the call  
* Notes \- Manual Notes added against the call  
* Custom Tags \- Manual tags added against the call

  ## Call Intelligence \> Fax

The fax page houses all the faxes received and sent by the Practice. There is no Intelligence functionality for faxes



Only 2 actions can be performed against a fax. The first action is to read the fax and the second action is to archive the fax which will move it to the Archived tab. To unarchive click on the unarchive option and it will push the fax back to the inbox

## 

## Call Intelligence \> Call Tasks {#call-intelligence->-call-tasks}

Call Intelligence will automatically create tasks based on call analysis if a follow up is warranted from the practice for a particular call



Call Tasks in Call Intelligence is essentially the same as Task Module but just filtered for the auto-created tasks from Call Intelligence. All the tasks will be part of the system-created Task project called Call Intelligence. Call Tasks will have 2 sections \- My Tasks and All Tasks

Call Tasks Table will have the following columns

* Subject \- User id of the caller  
* Call Link \- Link the Call Details page  
* Assignee \- Name of the person the task is assigned  
* Location \- Location of the organization for which the task was created  
* Patient \- Name of the patient for whom the task needs to be completed  
* Patient Type \- Based on if the task is for a new patient or an existing patient  
* Profile Type \- Based on if the task is for a Lead, Patient, Contact or Unrecognised  
* Task Type \- Highlights which category the task falls under  
* Call Type \- [Call Type](#call-intelligence-\>-call-tasks) based on the call analysis  
* Call Outcome \- [Call outcome](#call-intelligence-\>-call-tasks) based on the call analysis  
* Sentiment \- Customer sentiment based on the call analysis  
* Status \- Status of task (Completed, Incomplete, Overdue)  
* Created Date \- Date of task creation  
* Created By \- Who created the task  
* Completed Date \- Date of task completion  
* Completed by \- Who completed the task  
* Due Date \- Due date of the task

Adit Call Intelligence creates the following task types

* Scheduling – If follow-up is required to schedule an appointment.  
* Rescheduling – If follow-up is required to reschedule an appointment.  
* Cancellation – If follow-up is required to cancel an appointment.  
* Confirmations – If follow-up is required to confirm an appointment.  
* Emergency – If follow-up is required for emergency appointments.  
* Clinical – If follow-up is required for clinical/treatment instructions or actions.  
* Product Order – If follow-up is required for product-related actions (e.g., crowns, retainers).  
* Billing – If follow-up is required for billing issues.  
* Insurance – If follow-up is required for insurance approval/verification/claims.  
* Complaints – If follow-up is required for patient complaints.  
* Others – If follow-up is required that doesn’t fit in the above categories.




  ## Call Intelligence \> Opportunities {#call-intelligence->-opportunities}

Opportunities in Call Intelligence refers to all the scheduling opportunities that practice had for both new and existing patients. Opportunities will be housed in 2 sections in Call Intelligence \- 

* Open \- Opportunities that have not booked yet and needs to be followed up on  
* Closed \- Won and Lost Opportunities



The following actions are available against an opportunity \- 

* Call Detail \- This will show the call which resulted in the creation of the opportunity  
* Profile Card \- This will be the profile card of Lead or the Patient based on whom the opportunity is created  
* Create Task \- This will create a follow up task against the Opportunity

Opportunity Table will have the following columns

* Lead Name \- Name of the Lead or the Patient  
* Status \- Open, Won or Lost  
* Created Date \- Date of Opportunity Creation  
* Temperature \- Measure of how hot the opportunity is. 0-5 Days \= Hot, 6-15 Days \= Warm else Cold  
* Phone \- Phone Number of the Lead / Patient  
* Email \- Email of the Lead / Patient  
* Preferred mode of contact \- How would the Lead / Patient  like to be contacted \- Phone, Email orText  
* Preferred time of contact \- When would the Lead / Patient like to be contacted  
* Follow Up Date \- Next date of follow up with the Lead / Patient  
* Call Type \- [Call Type](#call-intelligence-\>-opportunities) based on the call analysis  
* Call Outcome \- [Call outcome](#call-intelligence-\>-opportunities) based on the call analysis  
* Sentiment \- Customer sentiment based on the call analysis  
* Reason for Visit \- [Reason for Visit](#call-intelligence-\>-opportunities) based on the call analysis  
* Reason for Not Booking \- [Reason for Not Booking](#call-intelligence-\>-opportunities) based on the call analysis  
* Revenue Potential \- \$ (Low Potential \~\$100-\$200), \$\$ (Medium Potential \~\$250-\~\$2000) or \$\$\$ (High Potential \>\~\$2500) based on the Reason for Visit  
* Won Date \- Date when the Opportunity was moved to Won (Date on which the Lead / Patient has booked an appointment)  
* Days Since Last Reachout \- No. of days since a phone or text communication has happened with the Lead / Patient  
* Lost Date \- Date when the Opportunity was moved to Lost  
* Lost Reason \- Reason why the practice was not able to book (Price Enquiry Call, Location not acceptable, Pricing Too High, Insurance Not Accepted, Treatment not available, Expected Date not available etc)  
* User \- Staff which handled the call from the practice  
* Notes \- Manual Notes added against the Opportunity

  ## Call Intelligence \> AI Coaching

The AI Coaching section in Call Intelligence shows the information related to practice performance. AI Coaching will have 3 sections \- 

* Summary \- This page provides a high level summary of performance. Data shown in this page is based on the Logged In User. For Staff and Read-Only users, it will show their performance .i.e. Based on the calls they have handled. Managers and Owners will be able to see overall practice performance summary. Staff and Read Only users will be able to see only their own data  
* Userwise \- This page provides a quick breakdown of performance for all the users in the practice. Only Managers and Owners will have access to this page  
* Scored Calls \- This will be the listing of all the calls that have been scored. This list will be used to filter out and show corresponding calls based on the clickable numbers shown in the Summary page of Coaching



**Summary Page** will have the following information

* Overall Average Score \- Average score of all the scored calls for the selected time period  
* Scored Conversations \- Number of calls that have been scored for the selected time period  
* Call Tasks Created \- Total number of automated call tasks created for the selected time period  
* Call Tasks Completed \- Total number of automated call tasks that have been completed for the selected time period  
* Call Task Completion \- Percentage of automated call tasks that have been completed  
* Score Trend \- This chart shows the cal score trend by multiple scenarios like user, call type, source, patient type, outcome etc  
* Average Score by Call Type \- Average score of all the scored calls for each call type for the selected time period  
* Unhappy Customers by Patient Type \- Percentage of unhappy conversations for New and Existing patients for the selected time period  
* Unhappy Customers by Call Type \- Total number of unhappy customers for each call type for the selected time period  
* Scorecard Breakdown \- This shows the performance for each of the 15 parameters which are part of our scorecards. Yes is positive and No is Negative



**User Wise Page** will have the list of all the users in the practice and the shows the performance of the users in a tabular format



User Wise Table will have the the following columns

* User \- List of staff from the practice  
* Location \- Location assigned to the user  
* Role \- Role of the user   
* Average Score \- Average score of the calls handled by the user  
* Scored Calls \- Total number of calls handled by the user which has been scored   
* Open Call Tasks \- Automated call tasks assigned to the user which are still open  
* Call Task Completion \- Percentage of call tasks which has been assigned to the user that has been completed   
* Happy Patients \- Percentage of calls where the customer sentiment was marked as happy  
* Unhappy New Patients \- Percentage of new patient calls where the customer sentiment was marked as unhappy  
* Unhappy Existing Patients \- Percentage of existing patient calls where the customer sentiment was marked as unhappy  
* Scheduling Score \- Average score of the scheduling calls handled by the user  
* Emergency Score \- Average score of the emergency calls handled by the user  
* Rescheduling Score \- Average score of the rescheduling calls handled by the user  
* Confirmations Score \- Average score of the confirmation calls handled by the user  
* Recare Score \- Average score of the recare calls handled by the user  
* Billing Score \- Average score of the billing calls handled by the user  
* Insurance Score \- Average score of the insurance calls handled by the user  
* Clinical Score \- Average score of the clinical calls handled by the user  
* Product Order Score \- Average score of the product order calls handled by the user  
* Verifications Score \- Average score of the verification calls handled by the user  
* Introduction Score \- Percentage of calls where Introduction was handled properly by the user  
* Rapport Building Score \- Percentage of calls where the agent was able to build rapport with the patient  
* Speed and Tone Score \- Percentage of calls where the agent spoke in proper speed and tone  
* Active Listening Score \- Percentage of calls where the agent was able to demonstrate active listening  
* Knowledge Score \- Percentage of calls where the agent was able to demonstrate knowledge  
* Empathy Score \- Percentage of calls where the agent was able to demonstrate empathy  
* Objection Handling Score \- Percentage of calls where the agent was able to handle objections properly  
* Process Adherence Score \- Percentage of calls where the agent adhered to the process guidelines  
* Recare Pitching Score \- Percentage of recare calls where the agent was able to pitch recare properly  
* Cancellation Handling Score \- Percentage of calls where the agent was able to handle cancellations well by trying to reschedule them  
* Responsiveness Score \- Percentage of calls where the agent was responsive to the patient  
* Clinical Handling Score \- Percentage of clinical calls where the agent was able to handle it correctly  
* Collections Handling Score \- Percentage of billing calls where the agent was able to get a commitment on outstanding balances   
* Resolution Score \- Percentage of calls where the agent was able to resolve it on the call itself  
* Closing Score \- Percentage of calls where the agent closed the call politely on a positive note

**Scored Calls Page** will have the list of all the calls which have been scored. This page will be used to filter and show information from the AI Coaching summary page



Scored Calls Table will have the the following columns

* Caller \- Name of the caller  
* Time \- Time of the call  
* Location \- Location which received / made the call  
* User \- Staff from practice who spoke on the call  
* Patient Type \- Whether it is a new patient or existing patient  
* Call Type \- Type of call based the categories we have  
* Call Outcome \- Outcome of the call  
* Sentiment \- Sentiment of the customer in the call  
* Reason for Visit \- Service the patient is looking for if it is Scheduling, Emergency or Rescheduling call  
* Reason for Not Booking \- If an appointment call goes Not Booked, what is the reason for the same  
* Revenue Potential \- Low, Medium or High revenue potential based on the service practice is looking for  
* Introduction \- Did the agent greet the customer in a professional manner?  
* Rapport Building \- Was the agent able to build rapport with the customer?  
* Speed and Tone \- Did the agent speak in the appropriate tone and speed?  
* Active Listening \- Did the agent demonstrate active listening skills?  
* Knowledge \- Was the agent able to answer all customer clarifications?  
* Empathy \- Did the agent empathise with the customer?  
* Objection Handling \- Was the agent able to effectively handle all objections and hesitations?  
* Process Adherence \- Did the agent collect all the relevant information? (Name, DOB, Insurance, Purpose and Preferred time of visit)  
* Recare Pitching \- Was the agent able to convincingly create an urgency for recare?  
* Cancellation Handling \- Was the agent able to handle cancellation objection to nudge the patient to reschedule?  
* Responsiveness \- Was the agent able to respond without delays?  
* Clinical Handling \- Did the agent provide accurate follow-up instructions while refraining from providing clinical advice?  
* Collections Handling \- Was the agent able to get a commitment for clearing the balances?  
* Resolution \- Was the agent able to book the appointment?  
* Closing \- Did the agent end the call in a cordial manner?

  ## Call Intelligence \> AI Intelligence

AI Intelligence will have 5 dashboards which will give incredibly deep insights into the front desk performance

* Call Analytics \- Deep insights into where the calls are coming from, why are people calling, when are they calling, are we missing calls, are we returning missed calls and are we able to find resolution to the calls  
* Opportunities \- Deep insights into all the appointment booking opportunities the practice had \- are we able to convert them, how many are still in pipeline, how many are hot, how many are of high revenue potential, if lost opportunity then why did we lose, how effective are each staff at converting opportunities and how effective is the practice at converting opportunities for each service type  
* Call Handling \- Deep insights into the call handling handling performance of the practice \- how many calls are being scored, average performance per each call type, what percentage of customers are unhappy, how is call performance trending, average call performance by each staff of the practice and percentage of unhappy customers for each staff   
* Task Handling \- Deep insights into how the automated tasks created by AI is handled by the practice \- how many tasks are created daily, how many of these are completed, how many are open, how many are overdue, what percentage of tasks are completed based on each task type and what percentage of tasks are completed based on each user  
* Location Analytics \- Deep insights into how each and every location is performing across top level metrics \- what is the call traffic across each location, how many opportunities are created across each location, what is the opportunity win rate across each location by patient type, what is the opportunity win rate across each location based on inbound and outbound calls, what percentage of customers are unhappy for each location, what percentage of tasks are completed for each location and what is the average call score for each location

**Call Analytics**

  
KPIs

* Total Calls \- Total number of calls handled by the practice.   
* Incoming Calls \- Total number of incoming calls handled by the practice.   
* Outgoing Calls \- Total number of outgoing calls handled by the practice.   
* Scheduling Calls \- Total number of scheduling calls handled by the practice.   
* Appointments Booked \- Total number of appointments booked from the scheduling calls. 

  
Incoming Calls Breakdown \- This chart shows the breakdown of incoming calls by tracking how many have been answered, how many have been missed and how many many have been missed in business hours. 

  
Total Calls by Call Direction \- This chart shows the trend of total incoming, outgoing  and missed calls handled by the practice.

Call Volume by Hours \- This chart shows the total calls handled by the practice every hour. 

Unique Callers by Call Direction \- This chart shows the trend of total unique callers engaged by the practice. 

  
Missed Call Recovery \- This chart shows how many missed calls have been received and how many have been returned and the breakdown of returned calls to show how many connected, how many of connected were for scheduling and out of that how many have booked. 

  
Scheduling Calls Breakdown \- This chart shows how many scheduling have been handled by the practice and out of which how many were incoming and how many were outgoing and what is the appointment conversion for each. 

  
Calls by Call Type \- This chart shows the trend of how many calls have been the practice handling for each call type. 

Total Calls by Call Type \- This chart shows the total calls handled by the practice for each call type. 

  
New Patients by Source \- This chart shows how many new patients have been gained by the practice from each source. 

Total New Patient Calls by Source \- This chart shows the trend of new patient booking calls received by the practice from each source. 

**Opportunities**



KPIs

* Opportunities Created \- Total number of scheduling opportunities the practice had.   
* Won Opportunities \- Total number of scheduling opportunities converted to appointments by the practice.   
* Opportunity Win Rate \- Percentage of scheduling opportunities converted to appointments.   
* New Patient Win Rate \- Percentage of new patient scheduling opportunities converted to appointments.   
* Existing Patient Win Rate \- Percentage of existing patient scheduling opportunities converted to appointments.   
* All Open Opportunities \- All the scheduling opportunities which are still open to be followed up on.   
* All New Patient Open Opportunities \- All the new patient scheduling opportunities which are still open to be followed up on.   
* All Existing Patient Open Opportunities \- All the existing patient scheduling opportunities which are still open to be followed up on.   
* All High Value Open Opportunities \- All the high value scheduling opportunities which are still open to be followed up on.   
* All Hot Open Opportunities \- All the hot scheduling opportunities which are still open to be followed up on. 



Opportunities Breakdown \- This chart shows the breakdown of scheduling opportunities by won, lost and open status. 

Opportunity Conversion Trend \- This chart shows the breakdown of how many patients have called your practice to book an appointment and if you have been able to book them or not. 

  
Opportunity Distribution by User \- This chart shows all scheduling opportunities broken down by the user who handled the call. 

New Patient Win Rate by User \- Percentage of new patient scheduling opportunities converted to bookings based on the user who handled the call. 

Existing Patient Win Rate by User \- Percentage of existing patient scheduling opportunities converted to bookings based on the user who handled the call. 

  
Opportunity Created by Appointment Type \- This chart shows all scheduling opportunities broken down by the service the patient is looking for. 

New Patient Win Rate by Appointment Type \- Percentage of new patient scheduling opportunities converted to bookings based on the service the patient is looking for. 

Existing Patient Win Rate by Appointment Type \- Percentage of existing patient scheduling opportunities converted to bookings based on the service patient is looking for. 

  
New Patient Opportunities Lost by Reason \- This chart shows the breakdown of the reasons for failing to convert new patient scheduling opportunities.

Existing Patient Opportunities Lost by Reason \- This chart shows the breakdown of the reasons for failing to convert existing patient scheduling opportunities. 

**Call Handling**

  
KPIs

* Scored Calls \- Total number of calls which have been scored.   
* Customer Sentiment \- Calculated overall sentiment score of all the calls.   
* Overall Call Score \- Average score of all the calls handled by the practice.   
* Unhappy Customers \- Percentage of calls with unhappy customer sentiment compared to all the calls.   
* Happy Customers \- Percentage of calls with happy customer sentiment compared to all the calls. 

  
Customer Sentiment Breakdown \- This chart shows the overall sentiment of your patients and its breakdown  based on the interactions they had with your practice. 

Scored Calls by Type \- This chart shows the total number of calls which have been scored based on call type. 

Avg Scores by Call Type \- This chart shows the average score of all the calls which have been scored based on the call type. 

Call Score Trend \- This chart shows the trend of average call score over a period of time. 

  
Scored Calls by User \- This chart shows the number of calls which have been scored for each user. 

Unhappy Customers by User \- This chart shows the percentage of unhappy customers compared to all calls handled by each user. 

Overall Call Score by User \- This chart shows average call score for all the calls handled by each user. 

**Task Handling**

  
KPIs

* Total Tasks \- Total number of tasks auto-created by Adit based on the calls.   
* Completed Tasks \- Total number of auto-created tasks which have been completed.   
* Task Completion \- Percentage of completed tasks out of all the auto-created tasks based on calls.   
* Total Open Tasks \- Total number of auto-created tasks which are still open.   
* Total Overdue Tasks \- Total number of auto-created tasks which are open and overdue based on due date. 

  
Tasks by Task Status \- This chart shows the trend of auto-created tasks broken down by task status. 

Open Tasks by Created Date \- This chart shows the trend of auto-created tasks which are still open. 

Overall Task Completion \- This chart shows the percentage of auto-created tasks which have been completed based on all auto-created tasks. 

  
Task Completion by Task Type \- This chart shows the percentage of auto-created tasks by task type which have been completed based on all auto-created tasks. 

Total Tasks by User \- This chart shows the total number of auto-created tasks assigned to each user broken down by task status. 

Task Completion by User \- This chart shows the percentage of auto-created tasks which have been completed based on the tasks assigned to each user. 

**Location Analytics**

  
KPIs

* Total Calls \- Total number of calls handled across all the locations.   
* Opportunities Created \- Total number of scheduling opportunities created across all the locations.   
* Opportunities Won \- Total number of scheduling opportunities converted to bookings across all the locations.   
* Unhappy Customers \- Percentage of unhappy customers compared to all the calls handled by all the locations.   
* Overall Call Score \- Average score of all the calls handled across all the locations. 

  
Total Calls by Call Direction \- This chart shows the breakdown of calls by incoming, outgoing and missed across each location. 

  
Opportunity Created by Location \- This chart shows the total number of scheduling opportunities created across each location. 

New Patient Win Rate by Location \- This chart shows the percentage of new patient scheduling opportunities converted to bookings across each location. 

Existing Patient Win Rate by Location \- This chart shows the percentage of existing patient scheduling opportunities converted to bookings across each location. 

  
Scheduling Calls Breakdown by Location \- This chart shows the breakdown of scheduling calls across locations by showing how many have been booked compared to opportunities and how it further breaks down based on incoming and outgoing calls. 

  
Unhappy Customers by Location \- This chart shows the percentage of unhappy customers based on all the calls handled by each location. 

Overall Call Score by Location \- This chart shows the average call score based on calls handled by each location. 

Task Completion by Location \- This chart shows the percentage of auto-created tasks which have been completed for each location.

## Call Intelligence \> Legacy Insights

This page holds the existing Insights data from Call Tracking when customers are upgraded to Call Intelligence

## Call Intelligence \> C

Calls will have 2 sections \- All Calls and Missed Calls. All Calls houses all the  inbound calls, outbound calls, missed calls and voicemails. Missed calls will track unique missed calls and its recovery .i.e if they have been called back

## Call Detail Page {#call-detail-page}

The Call Detail page in Call Intelligence houses all the important information that is processed from a call. Call Detail page will have the following important sections

* Call Playback  
* Summary & Transcript  
* Call Analysis & Sentiment  
* Scorecard  
* Associated Tasks  
* Tags & Notes

It usually takes around 5-10 minutes for a call to be fully analysed and updated back in Adit

## Call Playback

This section allows the user to play and listen to the call. The playback section will have the following information and functionalities \- 

- Call Title will mention the phone number and the name of the caller if available  
- Time of the call and duration of the call  
- Location and Extension Number  
- User from the Practice who spoke on the call (if Voice Print set up)  
- Call Link which can be copied and shared  
- Patient Card which will open the patient card of the patient  
- Play button to play the call  
- Statistics mentioning the percentage of time the staff and the caller spoke on the call  
- Volume and Playback speed  
- Download the audio of the call



## Summary & Transcript {#summary-&-transcript}

Summary will be 3-4 line summarisation of the call. As part of the summary section we will also be able to see the total score of the call and high level analysis breakdown of Patient Type, Call Type and Call Outcome



Transcript will have the entire timestamped transcript of the call tagged against the Agent and the Caller. When the audio is getting played that particular section of the transcript will get highlighted

  
Summary and Transcript cannot be edited

## Call Analysis & Sentiment {#call-analysis-&-sentiment}

This section will hold the key call analysis outcomes. It will have the following values \- 

- Patient Type \- Whether it is a new patient or existing patient  
- Call Type \- Which [Call Type](#call-detail-page) it is. This field will be populated for all calls including missed and incomplete calls  
- Sentiment \- Sentiment of the caller \- whether it was happy, neutral or sad. Missed Calls, Incomplete Calls and some really short calls will not have this value  
- Outcome \- What is the [outcome](#call-detail-page) of the call. This field will be populated for all calls other than Others, Incomplete and Missed calls  
- Reason for Visit \- [Reason for visit](#call-detail-page) will be updated only for Scheduling, Emergency, Rescheduling and Recare Calls. Reason for Visit will be different based on the vertical  
- Revenue Potential \- This shows what is the [revenue potential](#revenue-potential) based on Reason for Visit. \$ for low revenue potential, \$\$ for medium revenue potential and \$\$\$ for high revenue potential  
- Reason for Not Booking \- [Reason for Not Booking](#call-detail-page) will be updated only for Scheduling, Emergency, Rescheduling and Recare Calls if the call outcome is Not Booked or Cancelled.



There is an option to edit the Call Analysis section which when clicked will open it up in editable picklist format



**Call Analysis Accuracy**

Adit Call Intelligence has an accuracy of 90% as of Dec 2025\. The categorisation data is continuously analysed and trained to improve the performance and accuracy of the AI.

The 10% usually happens for those cases where the call covers multiple things like a billing related call, the patient is looking to book an appointment while clarifying their insurance acceptance. 

## Scorecards {#scorecards}

[Scorecards](#revenue-potential) are run for all call types other than Others, Vendor, Incomplete and Missed Calls. All scorecards other than the one we run for Verifications have 10 questions. If any of the questions in a scorecard is not applicable to a particular call, it will not be part of the scorecard against the call which means a Scheduling call can have 6 or 8 questions based on the call and not always have 10 questions.

Each question will have an answer (Yes or No) and an explanation for the answer



The total score of the call is calculated as follows \- 

                         **Call Score \= \[ (No. of Yes) \* 100 \] / \[ ( No. of Yes) \+  No. of Yes) \]**

There is a 5 star rating given next to the call score which is indicative of the total score. A score of 100 corresponds to half a star which means a call with 100 score will have 5 stars and a call with a score of 60 will have 3 stars and a call with 70 score will have 3.5 stars

Scorecard cannot be edited

## Associated Tasks {#associated-tasks}

This section will show all the tasks created against this call \- both automatically created by Adit AI and manually created by the practice.   


There is an option to add tasks from this section as well which will automatically tag it against the call. The auto-created task will have the following custom fields pre-populated \- Call Link, Patient Type, Call Outcome, Customer Sentiment, Task Type and Call User. The pre-population happens only for automated calls created by AI



## Tags and Notes {#tags-and-notes}

These are sections in Call Detail that can be manually updated. 

Tags are a collection of predefined options that users can use to tag a call. The benefits of tagging calls is that it can be used for filter functionality. 

  
Notes is where the practice can add manual Notes against the call which they can use for later reference. This Notes is not synced back to the EHR and will stay only on Adit Platform

## Call Type

Call Type will be updated for all calls

* Scheduling \- If the patient is calling the practice looking to book an appointment   
* Recheduling \- If the patient or the practice is calling to cancel an appointment or to reschedule an appointment  
* Confirmation \- If the patient is calling to confirm or clarify the time of the appointment or if the practice is calling the patient to confirm their participation  
* Emergency \- If the patient is looking to book an appointment on an emergency basis due to severe pain, accident or for some other unforeseen reason  
* Recare \- If the practice is reaching out to the patient to get them to book an appointment because they missed their appointment or if some of their treatment is due or just trying to bring them back because it has been sometime since their last visit  
* Clinical \- If the patient or the practice is calling to check on general care, treatment care, treatment recovery, instructions, prescriptions or medicines  
* Billing \- If the conversation is between the patient (or guardian) and the practice regarding outstanding payments, billing clarifications or payment plans and benefits  
* Insurance \- If the conversation is between the patient (or guardian) and the practice regarding insurance acceptance, insurance rejection or claim follow ups  
* Verifications: Calls made by the practice to an insurance company or provider on behalf of a patient to check eligibility, claims, benefits, or status  
* Product Order \- If the call is related to tracking the order or confirming the arrival of products like crowns, braces, veneers, specs, lenses etc  
* Vendor \- If the call is between the practice and a vendor other than the insurance provider regarding the orders placed by the practice to the vendor or regarding diagnostics done with the vendor  
* Others \- If the completed call does not fall into any of the above categories, then it will get categorised as others  
* Incomplete \- If the call gets terminated very early without a proper conversation between the practice and the patient, then it will get marked as “Incomplete”  
* Missed \- If it is a missed call

  ## Call Outcome

All calls other than Others, Incomplete and Missed Calls will get categorised with this

* Booked \- If the call type is Rescheduling, Scheduling, Emergency or Recare and an appointment has been booked. An appointment should be considered Booked if the practice schedules it and will follow up only if there is an issue, even if insurance verification is pending.   
* Cancelled \- If the call type is Rescheduling and the appointment has been cancelled without rescheduling  
* Not Booked \- If the call type is Scheduling, Emergency or Recare and an appointment has not been booked.Only mark as Not Booked if the patient actively leaves without an appointment or if no appointment was scheduled  
* Resolved \- If the call type is Confirmation, Clinical, Billing, Insurance, Verifications, Vendor, Product Order or Others and call has been fully resolved with no further action required for now  
* Not Resolved \- If the call type is Confirmation, Clinical, Billing, Insurance, Verifications, Vendor, Product Order or Others and call has not been fully resolved and will require further action

  ## Reason for Visit

Reason for visit will be updated only for Scheduling, Emergency, Rescheduling and Recare Calls. Reason for Visit will be different based on the vertical

**Dental/Ortho** 

* General Checkup \- If  booking a routine hygiene checkup or a general check up  
* Tooth Pain \- If the patient is looking to book an appointment due to tooth pain or tooth ache without any apparent reason or from previous appointments or processes.   
* Cracked Tooth \- If the patient is looking to book an appointment due to a crack or a fracture or a split in the tooth  
* Cleaning \- If Cleaning or Dental Cleaning or Teeth Cleaning or Prophy or Prophylaxis is mentioned as the treatment patient is looking to book  
* Teeth Whitening \- If the patient is looking for teeth whitening/bleaching/brightening  
* Fillings \- If the patient is looking to for tooth filling/cavity filling  
* Root Canal \- If the patient is looking for root canal/endodontic treatment  
* Crowns \- If the patient is looking for dental crowns/caps  
* Implants \- If the patient is looking for dental fixtures/implants  
* Dentures \- If the patient is looking for dentures/false teeth/artificial teeth/dental plates  
* Bridges \- If the patient is looking for dental bridges/bridgework  
* Extraction \- If Tooth removal or Tooth Extraction or Exodontia or Tooth pulling is mentioned as the treatment patient is looking for  
* Flouride Treatment \- If the patient is looking for fluoride gel treatment  
* Sealants \- If the patient is looking for applying sealants  
* Veneers \- If the patient is looking for dental veneers/porcelain veneers/dental porcelain laminates  
* Retainers \- If the patient is looking for retainers  
* Braces \- If the patient is looking for dental braces or orthodontic braces  
* Invisalign \- If the patient is looking for Invisalign/clear aligners/invisible braces/removable aligners  
* Bonding \- If the patient is looking for composite bonding/teeth bonding  
* Gum Contouring \- If the patient is looking for Gum contouring/gingival sculpting/gingivoplasty/gum reshaping  
* Deep Cleaning \- If the patient is looking for deep cleaning/scaling/root planing/periodontal therapy  
* Gum Grafting \- If the patient is looking for gum grafting/gingival grafting/periodontal plastic surgery  
* Inlays / Onlays \- If the patient is looking for inlays/onlays/partial crowns/indirect fillings  
* Pulpotomy \-  If the patient is looking for pulpotomy/vital pulp therapy  
* Space Maintainers \- If the patient is looking for dental spacers/space maintainers  
* Appliance Placement \- Used when the caller is scheduling placement or adjustment of other orthodontic appliances such as palatal expanders, Herbst appliances,or habit breakers  
* Interceptive Treatment \- Used when the caller is inquiring about orthodontic evaluation or treatment for young children (Phase I treatment), typically to address developmental issues early, such as jaw growth guidance or space management.  
* Orthognathic Consultation \- Used when the caller is discussing surgical orthodontic treatment, usually in cases involving jaw discrepancies that require combined orthodontic and surgical planning  
* Appliance Removal \- Used when the caller is scheduling the removal of braces or other fixed orthodontic appliances, usually toward the end of treatment.  
* Follow Up Exam \- If the patient is looking for a follow up for a previous procedure or appointment  
* Others \- If it is a scheduling/emergency call and Appointment type is not any of the above

**Optometry**

* Pediatric Eye Exam \- For parents or guardians scheduling routine or comprehensive eye exams for children or adolescents. This includes first-time exams, annual vision checks, or assessments for visual development issues in patients under 18\.  
* School Vision Screening \- For parents scheduling vision checks required by schools or requesting screenings for school forms. These are typically brief, standardized vision assessments to meet educational or state requirements  
* Amblyopia / Strabismus \- For children with conditions like lazy eye (amblyopia) or eye misalignment (strabismus), including evaluations, patching therapy, or referrals for vision therapy. These calls often come from parents noticing eye turning or vision differences  
* Pediatric Myopia Control \- For parents exploring options to slow down the progression of nearsightedness in their children. This may involve discussions of orthokeratology lenses, atropine therapy, or specialized myopia control spectacle lenses  
* General Eye Exam \- For patients scheduling their regular annual or routine eye checkup. This includes vision testing, prescription updates if needed, and a general ocular health evaluation, without any acute medical complaints or specialty concerns.  
* Prescription Update \- For patients specifically seeking to update or verify their existing glasses or contact lens prescription due to changes in vision or clarity. This visit is focused on refraction and determining the correct new prescription rather than a full comprehensive exam.   
* Blurred Vision – When the caller reports experiencing unclear, hazy, or unfocused vision that may affect one or both eyes  
* Vision Loss – When the caller reports sudden or noticeable loss of vision, partial or complete, in one or both eyes  
* Eye Pain – When the caller reports sudden, severe, or intense eye pain requiring urgent attention  
* Eye Injuries – When the caller describes trauma or injury to the eye area, including accidents, blunt force, or cuts.  
* Foreign Bodies in the Eye – When the caller reports something stuck in the eye such as dust, debris, or any object causing irritation  
* Red Eye/Infection – For patients reporting symptoms of acute irritation, infection, or inflammation of the eye such as redness, discharge, swelling, or discomfort. These calls often relate to conditions like conjunctivitis, minor infections, or surface inflammation  
* Allergy Eye Care \- For patients experiencing eye symptoms caused by seasonal or environmental allergies, such as itchiness, watering, or irritation that occurs during allergy seasons. The focus is on allergy evaluation and treatment, not infection.  
* Dry Eye \- For patients dealing with chronic dry eye symptoms including burning, grittiness, frequent irritation, or dryness.   
* Contact Lens Exam \- For patients scheduling appointments to be fitted with contact lenses for the first time or evaluated for new types of lenses.   
* Occupational / Driver Vision Test \- For patients scheduling vision tests required for work, licensing, or regulatory compliance (e.g., commercial driver’s license, DMV requirements, or job-specific vision checks).  
* Eyeglass Purchase \- For patients interested in selecting and purchasing eyeglass frames or lenses.  
* Eyeglass Repairs \- For patients calling about repairing or adjusting their existing eyeglasses due to damage, loose hinges, misalignment, or discomfort.  
* Cataract Evaluation \- For patients experiencing cataract symptoms who are seeking an evaluation to determine cataract presence and discuss treatment options, often before a surgical referral is made.  
* Diabetic Eye Exam \- For patients with diabetes scheduling their routine or specialized eye examinations.  
* Glaucoma \- For patients undergoing or initiating monitoring and treatment for glaucoma  
* Macular Degeneration Screening \- For patients being screened or monitored for age-related macular degeneration (AMD), often due to family history, existing early signs, or visual changes affecting central vision. These calls typically involve specialized retinal imaging and follow-up planning  
* LASIK \- For patients seeking consultations, pre-operative evaluations, or post-operative follow-ups related to laser vision correction procedures such as LASIK, PRK, or SMILE. These calls often involve patients interested in reducing dependence on glasses or contacts through surgery, or existing surgical patients checking  
* Migraine / Neurology Consultation – When the caller is seeking evaluation or treatment for recurrent headaches, migraines, or related neurological symptoms  
* Follow Up Exam \- If the patient is looking for a follow up for a previous procedure or appointment  
* Others \- If it is a scheduling/emergency call and Appointment type is not any of the above

**Chiro**

* General Consultation \- Used when the caller is seeking advice or evaluation for musculoskeletal concerns, posture issues, or wellness guidance without having an immediate acute problem. This may include discussion of treatment options, exercise recommendations, or preventive care  
* Pediatric Consultation \- Used when the caller is scheduling chiropractic evaluation or treatment for children, including posture guidance, growth-related musculoskeletal assessment, or pediatric wellness care.  
* Scoliosis – When the caller is seeking assessment or ongoing care for abnormal spine curvature or scoliosis-related symptoms  
* Spinal Adjustments \- Used when the caller specifically wants chiropractic adjustments, manipulations, or spinal realignment sessions, either as part of a treatment plan or a single session  
* Soft Tissue Therapy \- Used when the caller is requesting soft tissue treatment such as therapeutic massage, myofascial release, or other soft tissue therapies provided by the clinic  
* Pain Management \- Used when the caller is focused on managing pain, stiffness, or other symptoms without specifying a particular type of treatment. This may include chronic back pain, neck pain, headaches, or joint discomfort  
* Physical Therapy \- Used when the caller is seeking physical therapy, rehabilitation exercises, or guided therapeutic sessions for injury recovery, mobility improvement, or post-surgical rehabilitation.  
* Performance Therapy \- Used when the caller is seeking chiropractic care to enhance athletic performance, prevent injury, or receive specialized treatment for sports-related musculoskeletal issues.   
* Prenatal Care \- Used when the caller is seeking chiropractic services tailored to pregnancy, such as spinal alignment, pelvic balancing, and relief from pregnancy-related back or joint discomfort.  
* Ergonomic Evaluation \- Used when the caller wants assessment or advice on posture, ergonomic setup, workplace adjustments, or lifestyle modifications to prevent musculoskeletal issues  
* Preventive Care \- Used when the caller is seeking routine or preventive chiropractic care for overall wellness, health maintenance, or ongoing spinal health, without a specific injury or pain complaint.  
* Diagnostics \- Used when the caller is requesting diagnostic services such as X-rays, MRI referrals, posture analysis, or musculoskeletal imaging as part of evaluation or treatment planning  
* Follow Up Exam \- If the patient is looking for a follow up for a previous procedure or appointment  
* Others \- If it is a scheduling/emergency call and Appointment type is not any of the above

  ## Reason for Not Booking

Reason for Not Booking will be updated only for Scheduling, Emergency, Rescheduling and Recare Calls if the call outcome is Not Booked or Cancelled.

* Price Enquiry \- Patient enquire about the pricing/financing options of treatments and is not ready to decide yet or will call back  
* Availability Enquiry \- Patient enquire about the available slots and is not ready to decide yet or will call back  
* Preferred Financing Not Accepted \- Practice do not the accept the type of financing option the patient is looking for   
* Preferred Slot Not Available \- Practice is not able to offer a slot that is acceptable to the patient  
* Preferred Service Not Available \- Practice do not provide the service/treatment the patient is looking for  
* Preferred Location Not Available \- Preferred slots are not available for a specific location the patient wants  
* Preferred Provider Not Available \- Acceptable slots are not available for the specific doctor/provider the patient is looking for  
* Call Missed \- Call Missed by practice but a voicemail is left by the patient looking to book an appointment  
* Left Voicemail \- Patient missed the call and the practice left a voicemail  
* Medicaid Not Accepted \- Patient has Medicare and practice do not accept it  
* Medicare Not Accepted \- Patient has Medicaid and practice do not accept it  
* Insurance Not Accepted \- Practice does not accept the insurance the patient has. This does not include those scenarios where patient has Medicare or Medicaid  
* Personal Emergency \- When a rescheduling call goes cancelled due to personal emergency  
* Cash Patients Not Accepted \- Practice do not accept cash patients for those cases where patients are willing to pay cash because their insurance is not accepted or they don’t have insurance  
* Language Barrier \- Patient looking for specific language speaking staff to book an appointment. For eg. a Spanish only speaking patient checking if someone in the practice can speak Spanish  
* Not Interested Right Now \- If the call type is Recare and the patient declines to book at this time or indicates they are not ready to schedule, and does not provide a specific callback time  
* Call Back Later \- If the call type is Recare and the patient mentioned the practice to call back later at a specific time or time period to get them scheduled. Only mark as **Call Back Later** if the patient explicitly mentions a specific time, day, or period for the practice to call back to schedule. Any vague statements like ‘maybe later’ or ‘not now’ should **not** be considered Call Back Later  
* Outstanding Balance \- If an appointment is not booked due to an outstanding balance or collections  
* Others \- If a scheduling/emergency call goes Not Booked and reasons do not fall within any of the above

  ## Revenue Potential {#revenue-potential}

\$ for low revenue potential, \$\$ for medium revenue potential and \$\$\$ for high revenue potential

| Vertical | Reason for Visit / Treatment | Bucket |
| :---- | ----- | ----- |
| Dental / Ortho | General Checkup | \$ |
| Dental / Ortho | Cleaning | \$ |
| Dental / Ortho | Tooth Pain | \$ |
| Dental / Ortho | Cracked Tooth | \$ |
| Dental / Ortho | Teeth Whitening | \$\$ |
| Dental / Ortho | Fillings | \$\$ |
| Dental / Ortho | Root Canal | \$\$ |
| Dental / Ortho | Crowns | \$\$ |
| Dental / Ortho | Implants | \$\$\$ |
| Dental / Ortho | Dentures | \$\$\$ |
| Dental / Ortho | Bridges | \$\$\$ |
| Dental / Ortho | Extraction | \$\$ |
| Dental / Ortho | Fluoride Treatment | \$ |
| Dental / Ortho | Sealants | \$ |
| Dental / Ortho | Veneers | \$\$\$ |
| Dental / Ortho | Retainers | \$\$ |
| Dental / Ortho | Braces | \$\$ |
| Dental / Ortho | Invisalign | \$\$\$ |
| Dental / Ortho | Bonding | \$\$ |
| Dental / Ortho | Gum Contouring | \$\$ |
| Dental / Ortho | Deep Cleaning | \$\$ |
| Dental / Ortho | Gum Grafting | \$\$\$ |
| Dental / Ortho | Inlays / Onlays | \$\$ |
| Dental / Ortho | Pulpotomy | \$\$ |
| Dental / Ortho | Space Maintainers | \$\$ |
| Dental / Ortho | Appliance Placement | \$\$ |
| Dental / Ortho | Interceptive Treatment | \$\$ |
| Dental / Ortho | Orthognathic Consultation | \$\$\$ |
| Dental / Ortho | Appliance Removal | \$ |
| Dental / Ortho | Follow-Up Exam | \$ |
| Dental / Ortho | Others | \$ |
| Opto | Pediatric Eye Exam | \$ |
| Opto | School Vision Screening | \$ |
| Opto | Amblyopia / Strabismus | \$\$ |
| Opto | Pediatric Myopia Control | \$\$ |
| Opto | General Eye Exam | \$ |
| Opto | Prescription Update | \$ |
| Opto | Blurred Vision | \$\$ |
| Opto | Vision Loss | \$\$ |
| Opto | Eye Pain | \$\$ |
| Opto | Eye Injuries | \$\$ |
| Opto | Foreign Body Removal | \$\$ |
| Opto | Red Eye / Infection | \$\$ |
| Opto | Allergy Eye Care | \$\$ |
| Opto | Dry Eye | \$\$ |
| Opto | Contact Lens Exam | \$\$ |
| Opto | Occupational / Driver Vision Test | \$ |
| Opto | Eyeglass Purchase | \$\$\$ |
| Opto | Eyeglass Repairs | \$ |
| Opto | Cataract Evaluation | \$\$ |
| Opto | Diabetic Eye Exam | \$\$ |
| Opto | Glaucoma | \$\$ |
| Opto | Macular Degeneration Screening | \$\$ |
| Opto | LASIK | \$\$\$ |
| Opto | Migraine / Neurology Consult | \$\$ |
| Opto | Follow Up Exam | \$ |
| Opto | Others | \$ |
| Chiro | General Consultation | \$ |
| Chiro | Pediatric Consultation | \$ |
| Chiro | Scoliosis | \$\$ |
| Chiro | Spinal Adjustments | \$\$ |
| Chiro | Soft Tissue Therapy | \$\$ |
| Chiro | Pain Management | \$\$ |
| Chiro | Physical Therapy | \$\$ |
| Chiro | Performance Therapy | \$\$ |
| Chiro | Prenatal care | \$\$ |
| Chiro | Ergonomic Evaluation | \$\$ |
| Chiro | Preventive Care | \$ |
| Chiro | Diagnostics | \$\$ |
| Chiro | Follow Up Exam | \$ |
| Chiro | Others | \$ |

## Tags

* New Patient  
* Existing Patient  
* Scheduling  
* Insurance  
* Billing  
* Emergency  
* Complaint  
* Missed  
* Robocall  
* Sales call  
* Conversion  
* Opportunity  
* Did Not Book  
* Not Relevant  
* Listen Later  
* Cancellation  
* Hung Up  
* Missed Call After Hours  
* Missed Call Business Hours  
* Error In Call  
* Follow Up  
* Call Back  
* Opportunity Voicemail  
* Other Language Call  
* Non-Working Day  
* Non-Working Hours  
* Rescheduling  
* Confirmations  
* Spanish Call  
* Cancelled Appt  
* Missed Call  
* Auto Call

  ## Scorecards

Scorecards are run for all call types other than Others, Vendor, Incomplete and Missed Calls. All scorecards other than the one we run for Verifications have 10 questions. If any of the questions in a scorecard is not applicable to a particular call, it will not be part of the scorecard against the call which means a Scheduling call can have 6 or 8 questions based on the call and not always have 10 questions.

The scorecards we use are as follows \- 

**Scheduling Calls Scorecard**

|  | Bucket | Question | Positive | Negative |
| ----- | :---: | :---- | :---: | :---: |
| 1 | Introduction | Did the agent greet the customer in a professional manner? | Yes | No |
| 2 | Rapport Building | Was the agent able to build rapport with the customer? | Yes | No |
| 3 | Speed and Tone | Did the agent speak in the appropriate tone and speed? | Yes | No |
| 4 | Active Listening | Did the agent demonstrate active listening skills? | Yes | No |
| 5 | Knowledge | Was the agent able to answer all customer clarifications? | Yes | No |
| 6 | Empathy | Did the agent empathise with the customer? | Yes | No |
| 7 | Objection Handling | Was the agent able to effectively handle all objections and hesitations? | Yes | No |
| 8 | Process Adherence | Did the agent collect all the relevant information? (Name, DOB, Insurance, Purpose and Preferred time of visit) | Yes | No |
| 9 | Resolution | Was the agent able to book the appointment? | Yes | No |
| 10 | Closing | Did the agent end the call in a cordial manner? | Yes | No |

**Emergency Calls Scorecard**

|  | Bucket | Question | Positive | Negative |
| ----- | :---: | :---- | :---: | :---: |
| 1 | Introduction | Did the agent greet the customer in a professional manner? | Yes | No |
| 2 | Rapport Building | Was the agent able to build rapport with the customer? | Yes | No |
| 3 | Speed and Tone | Did the agent speak in the appropriate tone and speed? | Yes | No |
| 4 | Active Listening | Did the agent demonstrate active listening skills? | Yes | No |
| 5 | Knowledge | Was the agent able to answer all customer clarifications? | Yes | No |
| 6 | Empathy | Did the agent empathise with the customer? | Yes | No |
| 7 | Objection Handling | Was the agent able to effectively handle all objections and hesitations? | Yes | No |
| 8 | Process Adherence | Did the agent collect all the relevant information? (Name, DOB, Insurance, Purpose and Preferred time of visit) | Yes | No |
| 9 | Resolution | Was the agent able to book the appointment? | Yes | No |
| 10 | Closing | Did the agent end the call in a cordial manner? | Yes | No |

**Rescheduling Calls Scorecard**

|  | Bucket | Question | Positive | Negative |
| ----- | :---: | :---- | :---: | :---: |
| 1 | Introduction | Did the agent greet the customer in a professional manner? | Yes | No |
| 2 | Rapport Building | Was the agent able to build rapport with the customer? | Yes | No |
| 3 | Speed and Tone | Did the agent speak in the appropriate tone and speed? | Yes | No |
| 4 | Active Listening | Did the agent demonstrate active listening skills? | Yes | No |
| 5 | Knowledge | Was the agent able to answer all customer clarifications? | Yes | No |
| 6 | Empathy | Did the agent empathise with the customer? | Yes | No |
| 7 | Cancellation Handling | Was the agent able to handle cancellation objections to nudge the patient to reschedule? | Yes | No |
| 8 | Objection Handling | Was the agent able to effectively handle all objections and hesitations? | Yes | No |
| 9 | Resolution | Was the agent able to reschedule the appointment? | Yes | No |
| 10 | Closing | Did the agent end the call in a cordial manner? | Yes | No |

**Confirmation Calls Scorecard**

|  | Bucket | Question | Positive | Negative |
| ----- | :---: | :---- | :---: | :---: |
| 1 | Introduction | Did the agent greet the customer in a professional manner? | Yes | No |
| 2 | Rapport Building | Was the agent able to build rapport with the customer? | Yes | No |
| 3 | Speed and Tone | Did the agent speak in the appropriate tone and speed? | Yes | No |
| 4 | Active Listening | Did the agent demonstrate active listening skills? | Yes | No |
| 5 | Knowledge | Was the agent able to answer all customer clarifications? | Yes | No |
| 6 | Empathy | Did the agent empathise with the customer? | Yes | No |
| 7 | Cancellation Handling | Was the agent able to handle cancellation objections to nudge the patient to reschedule? | Yes | No |
| 8 | Objection Handling | Was the agent able to effectively handle all objections and hesitations? | Yes | No |
| 9 | Resolution | Was the agent able to confirm the appointment? | Yes | No |
| 10 | Closing | Did the agent end the call in a cordial manner? | Yes | No |

**Recare Calls Scorecard**

|  | Bucket | Question | Positive | Negative |
| ----- | :---: | :---- | :---: | :---: |
| 1 | Introduction | Did the agent greet the customer in a professional manner? | Yes | No |
| 2 | Rapport Building | Was the agent able to build rapport with the customer? | Yes | No |
| 3 | Speed and Tone | Did the agent speak in the appropriate tone and speed? | Yes | No |
| 4 | Active Listening | Did the agent demonstrate active listening skills? | Yes | No |
| 5 | Knowledge | Was the agent able to answer all customer clarifications? | Yes | No |
| 6 | Empathy | Did the agent empathise with the customer? | Yes | No |
| 7 | Objection Handling | Was the agent able to effectively handle all objections and hesitations? | Yes | No |
| 8 | Recare Pitching | Was the agent able to convincingly create an urgency for recare? | Yes | No |
| 9 | Resolution | Was the agent able to resolve the complaint? | Yes | No |
| 10 | Closing | Did the agent end the call in a cordial manner? | Yes | No |

**Billing Calls Scorecard**

|  | Bucket | Question | Positive | Negative |
| ----- | :---: | :---- | :---: | :---: |
| 1 | Introduction | Did the agent greet the customer in a professional manner? | Yes | No |
| 2 | Rapport Building | Was the agent able to build rapport with the customer? | Yes | No |
| 3 | Speed and Tone | Did the agent speak in the appropriate tone and speed? | Yes | No |
| 4 | Active Listening | Did the agent demonstrate active listening skills? | Yes | No |
| 5 | Knowledge | Was the agent able to answer all customer clarifications? | Yes | No |
| 6 | Empathy | Did the agent empathise with the customer? | Yes | No |
| 7 | Collections Handling | Was the agent able to get a commitment for clearing the balances? | Yes | No |
| 8 | Objection Handling | Was the agent able to effectively handle all objections and hesitations? | Yes | No |
| 9 | Resolution | Was the agent able to resolve the collection issue? | Yes | No |
| 10 | Closing | Did the agent end the call in a cordial manner? | Yes | No |

**Insurance Calls Scorecard**

|  | Bucket | Question | Positive | Negative |
| ----- | :---: | :---- | :---: | :---: |
| 1 | Introduction | Did the agent greet the customer in a professional manner? | Yes | No |
| 2 | Rapport Building | Was the agent able to build rapport with the customer? | Yes | No |
| 3 | Speed and Tone | Did the agent speak in the appropriate tone and speed? | Yes | No |
| 4 | Active Listening | Did the agent demonstrate active listening skills? | Yes | No |
| 5 | Knowledge | Was the agent able to answer all customer clarifications? | Yes | No |
| 6 | Empathy | Did the agent empathise with the customer? | Yes | No |
| 7 | Objection Handling | Was the agent able to effectively handle all objections and hesitations? | Yes | No |
| 8 | Process Adherence | Did the agent communicate all the relevant details with regards to insurance coverage? | Yes | No |
| 9 | Resolution | Was the agent able to resolve the insurance issue? | Yes | No |
| 10 | Closing | Did the agent end the call in a cordial manner? | Yes | No |

**Clinical Calls Scorecard**

|  | Bucket | Question | Positive | Negative |
| ----- | :---: | :---- | :---: | :---: |
| 1 | Introduction | Did the agent greet the customer in a professional manner? | Yes | No |
| 2 | Rapport Building | Was the agent able to build rapport with the customer? | Yes | No |
| 3 | Speed and Tone | Did the agent speak in the appropriate tone and speed? | Yes | No |
| 4 | Active Listening | Did the agent demonstrate active listening skills? | Yes | No |
| 5 | Knowledge | Was the agent able to answer all customer clarifications? | Yes | No |
| 6 | Empathy | Did the agent empathise with the customer? | Yes | No |
| 7 | Responsiveness | Was the agent able to respond without delays? | Yes | No |
| 8 | Clinical Handling | Did the agent provide accurate follow-up instructions while refraining from providing clinical advice? | Yes | No |
| 9 | Resolution | Was the agent able to resolve the insurance issue? | Yes | No |
| 10 | Closing | Did the agent end the call in a cordial manner? | Yes | No |

**Product Order Calls Scorecard**

|  | Bucket | Question | Positive | Negative |
| ----- | :---: | :---- | :---: | :---: |
| 1 | Introduction | Did the agent greet the customer in a professional manner? | Yes | No |
| 2 | Rapport Building | Was the agent able to build rapport with the customer? | Yes | No |
| 3 | Speed and Tone | Did the agent speak in the appropriate tone and speed? | Yes | No |
| 4 | Active Listening | Did the agent demonstrate active listening skills? | Yes | No |
| 5 | Knowledge | Was the agent able to answer all customer clarifications? | Yes | No |
| 6 | Empathy | Did the agent empathise with the customer? | Yes | No |
| 7 | Objection Handling | Was the agent able to effectively handle all objections and hesitations? | Yes | No |
| 8 | Process Adherence | Did the agent communicate all the relevant details with regards to product order? | Yes | No |
| 9 | Resolution | Was the agent able to resolve the product order issue? | Yes | No |
| 10 | Closing | Did the agent end the call in a cordial manner? | Yes | No |

**Verification Calls Scorecard**

|  | Bucket | Question | Positive | Negative |
| ----- | :---: | :---- | :---: | :---: |
| 1 | Introduction | Did the agent greet the provider in a professional manner? | Yes | No |
| 2 | Active Listening | Did the agent demonstrate active listening skills? | Yes | No |
| 3 | Speed and Tone | Did the agent speak in the appropriate tone and speed? | Yes | No |
| 4 | Resolution | Was the agent able to get all the relevant insurance information from the provider? | Yes | No |
| 5 | Closing | Did the agent end the call in a cordial manner? | Yes | No |

## Call Analytics

Call Analytics page in AI Intelligence has a plethora of information that can sliced and diced with different filters to get a lot of information

The default timeline of the dashboard is for the last 30 days, but this can be adjusted from the top. The data can also be easily updated for All Locations or specific locations from top left. The dashboard also has a set of quick filters and custom filters for pretty much all the important call detail fields

Quick Filters

* New Patient \- Filters the entire dashboard for New Patient Calls  
* Existing Patient \- Filters the entire dashboard for Existing Patient Calls  
* Scheduling Calls \- Filters the entire dashboard for Scheduling Calls  
* Booked Calls \- Filters the entire dashboard for calls where call outcome is Booked  
* Not Booked Calls \-  Filters the entire dashboard for calls where call outcome is Not Booked  
* Not Resolved Calls \- Filters the entire dashboard for calls where call outcome is Not Resolved  
* Missed Calls \- Filters the entire dashboard for Missed Calls

Custom Filters

* Call Status \- Multi select option between Answered, Voicemail and Missed  
* Direction \- Multi select option between Inbound and Outbound  
* Call Type \- Multi select option from Scheduling,Emergency, Rescheduling, Confirmations, Recare, Clinical, Billing, Insurance, Product Order, Verifications, Vendor, Others, Incomplete and Missed  
* Revenue Potential \- Multi select option from \$, \$\$ and \$\$\$  
* Call Outcome \- Multi select option from Booked, Not Booked, Cancelled, Resolved and Not Resolved  
* Reason for Not Booking \- Multi-select option from all reasons for Not Booking  
* Reason for Visit \- Multi-select option from all reasons for Visit based on the vertical  
* Call Score \- Multi-select option between 0-10, 11-20, 21-30, 31-40, 41-50, 51-60, 61-70, 71-80, 81-90, 91-99, 100  
* Patient Type \- Multi select option from New and Existing Patients  
* Customer Sentiment \- Mulit-select option from Happy, Neutral and Unhappy  
* User \- Multi-Select option from the list of users from specific locations or all locations based on the location filter  
* Numbers \- Multi-Select option from the list of phone numbers from specific locations or all locations based on the location filter  
* Source \- Multi-Select option from the list of extensions from specific locations or all locations based on the location filter  
* Tag \- Multi-Select option from the list of tags from specific locations or all locations based on the location filter  
* Extension \- Multi-Select option from the list of extensions from specific locations or all locations based on the location filter  
* Duration \- Multi select option between 0 seconds \-15 seconds, 16 seconds \-30 seconds, 31seconds \- 60 seconds, 61 seconds \- 90 seconds, 91 seconds \- 2 minutes, 2 minutes \- 5 minutes, 5 minutes \- 10 minutes, 10 minutes \- 20 minutes, \> 20 minutes

**Key KPIs**

The KPI section is meant to provide a quick high level overview of call traffic and how it breaks down with regards to appointments booked  


* Total Calls \- Total number of calls handled by the practice.   
* Incoming Calls \- Total number of incoming calls handled by the practice.   
* Outgoing Calls \- Total number of outgoing calls handled by the practice.   
* Scheduling Calls \- Total number of scheduling calls handled by the practice.   
* Appointments Booked \- Total number of appointments booked from the scheduling calls. 

These widgets will also have previous 30 days (31 \- 60 days) data and show the trend of the last 30 days data compared to the previous 30 days. When the timeline filter is updated to any value other than the last 30 days, the previous 30 days comparison will no longer be available.

**Incoming Calls Breakdown**

The widget shows the call answer rate of the practice. For the calls not answered, there will be a further breakdown of what percentage of missed calls were missed during business hours. Business hours breakdown is calculated based on the business hours set by the practice in the Location page in Settings 

  
To understand what percentage 

Incoming Calls Breakdown \- This chart shows the breakdown of incoming calls by tracking how many have been answered, how many have been missed and how many many have been missed in business hours. 

  
Total Calls by Call Direction \- This chart shows the trend of total incoming, outgoing  and missed calls handled by the practice.

Call Volume by Hours \- This chart shows the total calls handled by the practice every hour. 

Unique Callers by Call Direction \- This chart shows the trend of total unique callers engaged by the practice. 

  
Missed Call Recovery \- This chart shows how many missed calls have been received and how many have been returned and the breakdown of returned calls to show how many connected, how many of connected were for scheduling and out of that how many have booked. 

  
Scheduling Calls Breakdown \- This chart shows how many scheduling have been handled by the practice and out of which how many were incoming and how many were outgoing and what is the appointment conversion for each. 

  
Calls by Call Type \- This chart shows the trend of how many calls have been the practice handling for each call type. 

Total Calls by Call Type \- This chart shows the total calls handled by the practice for each call type. 

  
New Patients by Source \- This chart shows how many new patients have been gained by the practice from each source. 

Total New Patient Calls by Source \- This chart shows the trend of new patient booking calls received by the practice from each source. 

## Call Summaries in EHRs

This is how Adit will post the call intelligence call summaries in various EHRs

  
In Open Dental, the call summary will show under communication log of the patient

  
In Dentrix, the call summary will show as Notes in the Journal Entry section of the Patient record

1. Eaglesoft



2. Tracker



3. Cleardent



4. Crystal PM



5. Dolphin



6. Orthotrac



7. Chirotouch



8. Practiceweb



9. Abledent



10. Dentrix Ascend



11. Curve



12. Revolution



13. Eyefinity



14. Jane



15. Denticon



16. Chirotouch Cloud





































































































































































