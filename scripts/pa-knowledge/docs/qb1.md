# **Ask Adit: question bank, part 1 (Dental, Chiropractic)**

Every distinct question customers asked on the PA training, follow-up and support calls, merged where they asked the same thing, sorted into the test buckets of **Ask Adit: vetting test set**. **PA** says whether PA data can answer it (yes / partly / no / unclear); **Passes if** is what a correct Ask Adit answer does; **Calls** is how many calls asked it. Each question links to one call where it was asked.

## **Dental (99 questions)**

### **A. Practice vocabulary (2)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| How can I find overdue, unscheduled, and broken-appointment patients (recall/recare lists)? *Do you have reports like our previous software for patients 3 months overdue, 6 months overdue, cancellation list, unscheduled, and missed or canceled appointments?* PA-0727 · 03:37 | yes | Maps the practice's words (overdue, broken, recall/recare) to the right PA lists and reports | 4 |
| Is broken appointment the same as cancellation plus no-show? *What counts as a broken appointment?* PA-1845 · 33:37 | yes | Maps the practice's 'broken appointment' wording to PA's cancellation (broken \>24h) plus no-show (broken \<24h). | 2 |

### **B. Single-number lookups (3)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| Can we see a snapshot for collections for the overall practice? *Did we collect \$14,386 on Friday?* PA-1235 · 01:50 | yes | Returns the practice-level collections snapshot with the right period and says what collections counts. | 4 |
| Can we see collections alongside production, or real collections from new patients? *Besides production, is there a way to also see collection?* PA-1782 · 18:52 | yes | Returns collections alongside production from the collections dashboard, saying what is gross vs paid. | 2 |
| Does Morning Huddle show all the practice numbers, or only some pages? *Where do gross and net appear?* PA-1850 · 60:20 | yes | States that Morning Huddle shows only scheduled production from procedure-code fees and where gross/net live, correctly scoped. | 2 |

### **D. Breakdowns and rankings (2)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| How do we see provider-specific production, doctor vs hygiene, and case acceptance? *How do we see doctor production separate from hygiene production?* PA-0802 · 40:52 | yes | Groups provider vs hygiene production and case acceptance correctly by provider | 10 |
| Can we see provider-level and hygiene-level production, collections, and appointments? *How do I find production per hour or per provider?* PA-1241 · 24:26 | yes | Confirms provider- and hygiene-level production, collections and appointments exist and shows where, with correct grouping | 8 |

### **E. Patient lists and filters (17)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| Can we build and save patient lists for specific segments (unscheduled treatment, hygiene overdue, inactive patients, procedure codes, insurance)? *Can we get a list of patients with unscheduled treatment?* PA-1349 · 01:15 | yes | Builds saveable, dynamic, exportable patient lists with those segment filters, and flags ortho and unscheduled-hygiene logic as inaccurate. | 12 |
| How do we know which patients have unscheduled treatment, and can we build a list for that? *How do we know what treatment was left unscheduled for the patient?* PA-1169 · 60:56 | yes | Explains the unscheduled-treatment list, its filters (codes, date range, insurance remaining) and counts patients | 6 |
| How do I build a patient list filtered by insurance and target use-it-or-lose-it or hygiene overdue patients, and then text or email them? *Can we search for all patients with Delta Dental?* PA-0940 · 37:45 | yes | Builds the insurance/hygiene filter list, returns a count and patients, and explains how to text/email them | 5 |
| Can we make a list of patients who need treatment and don't have an appointment? *Can we build an unscheduled treatment list over a dollar amount?* PA-1160 · 26:53 | yes | Applies the right filters (no future appointment, treatment plan) and returns the count and patient list | 5 |
| Can we see which patients accepted treatment and which did not? *How do we see which case was not accepted?* PA-1243 · 31:14 | yes | Uses the Cases report to return accepted vs not-accepted patients with the right filters and counts | 5 |
| Can we create a patient list for unscheduled treatment, inactive patients, no future appointment, etc.? *Pulling up or generating a list for a certain procedure code* PA-1405 · 00:14 | yes | Builds the unscheduled/inactive/no-future-appointment list with the right filters and returns count and patients | 5 |
| How do I build or save a patient list for a specific segment (overdue, unscheduled treatment, broken hygiene, older last exam)? *Set up a patient list for overdue patients* PA-1349 · 01:15 | partly | Builds/saves the segmented list with correct filters and counts, flagging any list logic that's unreliable | 5 |
| Can I build a patient list, and how do I filter it? *Can we add filters like balance due and patients seen in the last 18 months?* PA-1792 · 22:50 | yes | Shows building and filtering a patient list with the right filters, count, and list. | 5 |
| Can I get a list of unscheduled patients, including treatment or hygiene, and see who is behind the count? *Is there a report showing people with unscheduled treatment plans?* PA-0371 · 71:06 | yes | Returns the unscheduled treatment/hygiene list with the right filters and counts, naming who's behind it | 4 |
| How do we look up unscheduled hygiene patients for a big group to call and fill the schedule? *How do you look up unscheduled hygiene patients for a big group when trying to call and fill the schedule?* PA-0447 · 26:50 | partly | Builds the unscheduled-hygiene list with the right filters and counts, noting any count discrepancy | 4 |
| How do I build and save a patient list based on specific procedure codes? *Can a list be built based on just a certain code?* PA-1610 · 44:27 | yes | Explains building and saving a patient list filtered by procedure codes, with the count and list. | 4 |
| How do I create a hygiene overdue patient list for outreach? *How can I get a list of all patients overdue for hygiene?* PA-1770 · 26:06 | yes | Builds the hygiene-overdue list with the right filters and returns the count and list. | 4 |
| Does a saved patient list update in real time? *Will the list update every time I run it if I put today's date in the name?* PA-1778 · 19:34 | yes | Confirms saved lists are dynamic and update automatically, and what that means for the count. | 4 |
| How do I create a patient list for unscheduled treatment, including by code and timeframe? *Can PA identify patients who didn't schedule treatment, not just broken appointments?* PA-1775 · 13:46 | yes | Builds the unscheduled-treatment list by code and date range with the right filters and list. | 3 |
| How do we create a list of active patients owing over a certain balance? *How do we create a list of active patients owing over \$200?* PA-1778 · 18:10 | yes | Builds the active-patients-over-balance list with the balance filter and returns the count and list. | 2 |
| How do I create a list of new patients who broke an appointment and never came? *How can I list new patients who broke an appointment and never came?* PA-1785 · 62:57 | yes | Builds the new-patients-with-broken-appointment list with the right filters and returns the count and list. | 2 |
| Will this list update automatically, showing only things after a certain date? *Can you update the list and filter it from January this year to now?* PA-1803 · 05:09 | yes | Confirms the list updates automatically with an 'after' date and returns the filtered count/list. | 2 |

### **F. Definitions and denominators (8)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| How is treatment acceptance counted, and why does it look wrong? *What does patient acceptance percentage mean—full treatment or any treatment?* PA-1194 · 02:36 | partly | Gives PA's case-acceptance definition (accepted a portion and booked, or a procedure completed same day/next visit, read from the EHR treatment plan) and flags count caveats. | 9 |
| Does PA's balance/AR include insurance, and is it past due or due now? *Does this list, if they show a balance, include insurance?* PA-1459 · 24:55 | yes | States PA's balance definition (family ledger past due, excludes insurance and today) and flags confirmation | 6 |
| How does Adit know a patient accepted treatment, and what does 'accepted' mean? *When you say accepted, is that just people who scheduled for the treatment?* PA-0527 · 20:40 | yes | Gives PA's definition of accepted treatment (accepted and scheduled) and its denominator, flagged if unconfirmed | 5 |
| How is operatory utilization calculated, and why doesn't it account for blocked-off time? *Why is occupied operatory time low and how is it calculated?* PA-1435 · 21:09 | partly | Gives PA's operatory-utilization definition (provider chair time from appointment start to marked complete, blocks excluded) and flags mapping/seating caveats. | 4 |
| How does Adit qualify a missed appointment or no show? *What does the broken appointments number pull from?* PA-1758 · 43:49 | yes | Gives PA's definition of broken (cancellations and no-shows, within and before 24 hours) and the bifurcation. | 2 |
| Why do the hygiene reappointment numbers differ from the all-appointments numbers? *Why is the hygiene reappointment number different from the all-appointments number?* PA-1804 · 31:54 | yes | Gives PA's hygiene-reappointment definition (hygiene codes on both appointments) and how it differs from the all-appointments dashboard. | 2 |
| Is operatory time calculated from the EHR listing the provider for the entire appointment, not actual provider time? *Is operatory time calculated from Open Dental listing the provider for the entire appointment, not actual provider time?* PA-1799 · 43:20 | yes | Gives PA's operatory-time definition (whole appointment time tied to provider ID) and the operatory-selection caveat. | 2 |
| What is the difference between diagnosed and accepted percentages? *Why is diagnosed amount different from accepted amount?* PA-1845 · 35:58 | yes | Gives PA's definition of diagnosed (all patients seen) vs accepted (only those who accepted), flagging if unconfirmed. | 2 |

### **H. Doesn't match my EHR (12)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| Why do PA's production, collections, and new patient numbers not match our own numbers? *Why are the numbers in Practice Analytics not matching?* PA-1748 · 01:22 | partly | Names the PA vs EHR basis differences (gross vs net, date basis, patient base) and where to check. | 13 |
| Why don't PA's production, collections, or AR numbers match what we see in our practice management system (Open Dental, Eaglesoft, Dentrix, Curve)? *Why is the production or collection number different from the PMS or another system?* PA-1389 · 00:07 | partly | Names the differing bases (date basis procedure vs payment date, net vs gross, pending insurance claims excluded) and where to check in the EHR. | 12 |
| Why is scheduled or forecast production in PA different from what the EHR shows, and can it show net instead of gross? *Why don't PA's scheduled-production/forecast numbers match the EHR's day sheet?* PA-1203 · 02:14 | partly | Names the gross-vs-net and future scheduled basis PA uses vs the EHR and where to check | 7 |
| Why don't the numbers match between Practice Analytics and our practice management system (Dentrix/Open Dental/Eaglesoft) for production, appointments, or counts? *Why is PA's production different from our day sheet?* PA-0051 · 01:15 | partly | Names the basis differences (procedure vs entry date, active-window, fee schedule) vs Dentrix/Open Dental/Eaglesoft and where to check | 6 |
| Why don't our PA reports match Open Dental / our EHR reports? *Where exactly are we pulling those reports from?* PA-0095 · 06:58 | unclear | Names the basis that differs for Open Dental (code source, fee schedule, date basis) and where to verify | 6 |
| Why are the numbers in the huddle or production report not matching our EHR? *Why is yesterday's analytics all zero?* PA-1416 · 03:43 | partly | Names likely basis differences (duplicated entries, missing codes, sync, insurance) vs the EHR and where to check | 6 |
| How is PA's unscheduled treatment/production calculated, and why doesn't it match our Open Dental totals? *Why doesn't PA's unscheduled treatment/production match our Open Dental totals?* PA-1216 · 04:48 | partly | Names the basis that differs from Open Dental (daily date basis, excludes scheduled treatment) and where to check | 6 |
| Why don't PA's scheduled production numbers match what we see in our EHR? *How come PA's scheduled production doesn't match our operatory view?* PA-0427 · 01:17 | partly | Names the basis differences (fee schedule, treatment-plan fees, refresh) vs the EHR and where to check | 5 |
| Why does PA's number differ from our own report or EHR? *Why does PA's number differ from our own report?* PA-0662 · 43:22 | partly | Names the basis differences (fee schedule, gross/net, code list) vs the practice's report and where to check | 4 |
| Why doesn't PA's production or collections match what our practice management software shows? *PA production doesn't reflect what Dentrix shows — what is the disconnect?* PA-0763 · 03:36 | partly | Names the basis that differs (24-hour window, procedure date basis, fee schedule) vs the PMS and where to check | 4 |
| Why don't PA patient list counts match the practice management system (Dentrix/Eaglesoft)? *How do I reconcile PA list counts with the EHR report?* PA-1850 · 05:47 | partly | Names the PA vs EHR basis that differs (acceptance logic, gross vs net, date basis, sync) and says where to check, without inventing causes. | 3 |
| Why does the patient count in PA differ from Open Dental (e.g., 394 vs \~600)? *Why does Adit show 394 patients when Open Dental shows around 600, and how do we make sure no patients are left behind?* PA-1787 · 02:10 | partly | Names the PA vs Open Dental patient-base difference (active in EHR vs seen in last 18 months) and where to check. | 2 |

### **I. Setup and data quality (9)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| What is the PA sync issue / why is data not showing up in Practice Analytics? *When is data going to sync to Practice Analytics?* PA-0182 · 00:00 | no | Detects the sync gap, says data may be stale, and explains how to fix (restart app, server access) | 6 |
| Why is the unscheduled hygiene or unscheduled treatment count so high or inaccurate? *Who are those 62 patients who left without a future appointment, and can the team call them when they have time?* PA-1709 · 08:36 | partly | Caveats the count by naming data/setup causes (filters, future-appointment logic, flags) and how to fix | 6 |
| Do I have to manually add or update provider working hours (and deactivate days off) in PA for the numbers to be correct? *Do I have to update provider hours on this program like I did in Dental Intel?* PA-0940 · 12:37 | no | Detects the manual-hours setup gap, says there's no automation or expiry prompt, and how to fix | 5 |
| Why do patients with a scheduled appointment still show as unscheduled (treatment or hygiene)? *Why does a treatment with a scheduled appointment show as unscheduled in the cases report?* PA-1200 · 01:06 | partly | Detects the data/setup gap (unlinked codes, no hygiene appointment) and caveats the unscheduled flag | 5 |
| How do I get PA to sync with my practice management system? *The analytics tab is not synchronizing; last sync was February 11 and no data can be pulled from it* PA-0368 · 00:20 | partly | Detects the sync setup gap and explains the fix (server connected, restart app, remote access) | 4 |
| How often does PA update/sync data? *How often does PA update?* PA-0037 · 08:47 | partly | States the sync cadence (Open Dental every 4–5 minutes) and gives the fix path for a stuck sync. | 3 |
| Why do patients show as overdue/unscheduled when they already have a future appointment? *How do we fix the recall list so scheduled patients stop showing as overdue?* PA-1778 · 00:00 | yes | Explains PA flags hygiene overdue only when the future appointment has a hygiene procedure code, and how to fix it. | 3 |
| Why do broken and cancellation data not show correctly for the month? *Why is broken and cancellation data not showing up under the broken appointment report for September?* PA-1801 · 04:46 | partly | Detects the data-quality gap (appointments must be marked cancelled/failed in the EHR) and caveats or suggests the fix. | 2 |
| Why is the hygienist not listed in the provider list? *Would adding providers turn on appointment scheduling?* PA-1805 · 23:33 | partly | Detects the setup gap (hygienist must be added in the EHR first, then analytics) and says how to fix it. | 2 |

### **J. Goals and benchmarks (8)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| Where do I set goals, and where did the default goal numbers come from? *Where do I set provider goals?* PA-1171 · 25:41 | yes | Points to Preferences \> Set Goals, says defaults are industry-standard and editable, and notes provider goals need providers added first. | 10 |
| How do I set up and change goals (production goals, daily/weekly, per provider)? *How do I change the goals again?* PA-0805 · 15:15 | yes | Points to preferences/goals for production goals, notes they can be per-day, per-week, or per provider, and that unedited goals use PA's standard numbers. | 8 |
| How do I adjust goals, and where did the goal numbers come from? *How do I set the provider goal, with doctor separate from hygienist?* PA-1091 · 24:40 | partly | Uses the practice's own goals, notes they don't auto-adjust or come from the EHR, and explains where to edit them | 6 |
| Can we set and track goals, including per provider or hygienist, and how do day-off or half-days affect daily goals? *How do I make changes and set specific goals?* PA-0178 · 05:47 | yes | Uses the practice's goals, explains per-provider and half-day/day-off handling, and where to set them | 4 |
| How do we set production goals for each provider and for the overall practice? *How do we check goal for each provider?* PA-0426 · 16:45 | yes | Uses the practice's goals and explains setting overall and per-provider production goals in Preferences | 4 |
| Can we change the production goal? *Can we change it now for one week with advanced setting? Monday-Thursday 19,060, Friday 6,500.* PA-0666 · 09:10 | yes | Uses the practice's own goal and explains editing it in Preferences \> Set Goals | 4 |
| How do I set up or edit goals (production/collection, per provider)? *How do I set up a goal? How do I edit it?* PA-0733 · 13:43 | yes | Uses the practice's own goals and explains setting/editing overall and per-provider goals | 4 |
| Can we set goals per provider and have the overall practice goal calculate automatically? *Can we set goals per provider and have it calculate the overall practice goal automatically?* PA-1812 · 22:12 | partly | Uses the practice's own per-provider goals and says the auto-calculated practice total is not yet available. | 3 |

### **M. What PA can't do (1)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| How do we track employees reaching out to patients for unscheduled treatment or recalls? *How can we track employees reaching out to patients for unscheduled treatment or recalls?* PA-1460 · 05:51 | no | Says plainly PA does not track per-staff outreach attempts and points to the follow-up/notes features or a feature request. | 4 |

### **N. Actions and how-to (37)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| How do I build a patient list, and can I save or reuse it? *Can you show me how to build a patient list?* PA-0992 · 17:58 | yes | Walks through Patient List \> Create List with provider and date filters, and says to save the list before sending it in text. | 20 |
| Can I send a mass text (or email) to everyone on a patient list? *Can I send a mass text to everyone on a patient list?* PA-1117 · 26:21 | yes | Explains the mass text/email action on a patient list and its per-message cost, without claiming to have sent it | 14 |
| How do we set up providers, operatories, and provider hours in preferences? *Can you help me with the provider setup?* PA-1211 · 37:59 | yes | Walks through Preferences \> Team Settings to add providers, map operatories, and set hours, noting weekly templates carry forward about six months. | 10 |
| Can we do mass text or email to selected patients on a patient list? *Can we send mass text/email to patients on a selected list, such as hygiene overdue or ASAP?* PA-1188 · 38:25 | yes | Explains selecting patients in a list and using actions to send bulk text/email, with personalization and per-message cost. | 10 |
| Can I print or export a patient list or report? *Can we print this data?* PA-1117 · 23:11 | partly | Says lists and reports are printable/exportable, notes the Export tab needs owner access, and flags the manager-permission request as unresolved. | 9 |
| How do I create and manage follow-ups, and are they automated? *How do I create and manage follow-ups?* PA-1240 · 31:15 | partly | Explains creating follow-ups via Follow Ups \> Overview \> Create Follow Up with type, assignee, due date, and notes, and that one assignee per follow-up is allowed. | 8 |
| How do I create a patient list for hygiene overdue or recare patients to call back? *Can we create a patient list for hygiene overdue / recare patients to call back?* PA-1349 · 01:15 | yes | Explains how to build a recare/hygiene-overdue list and text/call them in PA, without claiming to have created it | 8 |
| Where do I find and work the unscheduled treatment list and hygiene list? *How do I get to the unscheduled stuff and hygiene list in the morning?* PA-1350 · 26:07 | yes | Points to the unscheduled treatment and hygiene lists in Morning Huddle and Patient Lists, explaining how to work them | 8 |
| Can we export or download reports and patient lists? *Can we export reports and patient lists for further analysis or printing?* PA-1190 · 07:29 | partly | Explains the export icon, owner-access requirement and CSV/Excel output, and that the huddle can't be downloaded | 7 |
| How do I set up or edit production goals, and what do they include? *We had to redo our goals and margins; where do I make changes?* PA-1774 · 04:49 | yes | Explains editing production goals under Preferences \> Set Goals and what the goals include. | 7 |
| How do I create and send a patient list for bulk text or email, and can I print or export it? *Can we make specific groups and add them to send mass text?* PA-0899 · 18:34 | yes | Explains building, sending, printing and exporting the list and its owner-access limits, without claiming to have acted | 6 |
| Where do notes typed in PA go in the EHR? *Does the note go into the office journal?* PA-1444 · 32:08 | yes | Explains where PA notes land in each EHR, without claiming to have written the note | 6 |
| Does the patient list connect to email/text campaigns, and how do I send to a list? *Do these patient lists connect to the email campaign button?* PA-1792 · 22:50 | yes | Explains connecting a saved list to email/text campaigns and how to send, without claiming it already sent. | 5 |
| Can I export or print patient lists and reports? *Can I export reports?* PA-0315 · 70:58 | partly | Explains export/print with owner-access limits and CSV/Excel workaround, without claiming to have exported | 4 |
| How do I map providers and set provider hours? *What is the significance of setting up provider hours?* PA-0371 · 38:41 | yes | Explains provider mapping and hour setup steps and where to do them, without claiming to have changed it | 4 |
| Is patient list where we set reminders for scheduled appointments, or is it only for nonscheduled patients, and how do we send campaigns? *If we take the unscheduled treatment report and want to do a campaign, send a text, how?* PA-0547 · 34:42 | partly | Explains patient list is for campaigns, reminders live in Engage, and how to send campaigns, without claiming to have sent | 4 |
| How do we set up and change the practice, provider and hygienist goals in PA? *How do I set the goals — it's showing 3 percent right now?* PA-1654 · 40:54 | yes | Walks through Preferences \> Set Goals to set or change practice, provider, and hygienist goals. | 4 |
| How do I set up and change goals (daily, weekly, monthly, per provider, practice-wide)? *Where do you set goals and how did she change daily or monthly goals?* PA-1344 · 52:34 | partly | Explains how to set daily/weekly/monthly and per-provider/practice goals in Preferences \> Set Goals. | 4 |
| How do I set up and change provider hours? *How do I get to the provider hours page?* PA-1802 · 06:24 | yes | Walks through Morning Huddle \> Preferences \> Provider Hours to set up or change provider hours. | 4 |
| How do I build hygiene and treatment lists with specific procedure codes so I can schedule those patients? *Can you build a treatment list using procedure codes?* PA-1827 · 01:23 | partly | Explains how to build code-based patient lists in PA and hands off the scheduling steps to the PA screen; never claims to schedule patients. | 4 |
| Can PA automate text reminders for broken appointments or unscheduled treatment? *Can we automate sending text reminders like appointment reminders?* PA-1775 · 25:17 | partly | Says automations only create tasks/chats, manual bulk texting from a list is possible, and no recurring patient text yet. | 3 |
| How do I navigate to preferences and automations? *Where do you get to the automation screen?* PA-1770 · 33:25 | yes | Explains navigating to preferences and automations via the settings icon. | 3 |
| Where do I set hygiene and doctor production goals? *How is goals calculated? What is the daily goal for doctor and hygienist?* PA-1846 · 38:58 | yes | Points to Preferences \> Set Goals and explains how to set practice/hygienist/provider goals without claiming to change them. | 3 |
| Can you walk me through the morning huddle? *How do I use the morning huddle?* PA-1827 · 02:00 | partly | Walks through Morning Huddle items or hands off to the screen-share; never claims to run the huddle. | 3 |
| How do I set provider hours for irregular schedules (every other Friday, Wednesday until noon) matching Eaglesoft? *Can I set hours so a provider works every other Friday?* PA-1758 · 28:53 | partly | Explains manually deactivating days for irregular schedules since auto-apply is not available. | 2 |
| If I wanted to send a mass text out to people who are due for a cleaning, am I going to have to pay for it? *How much does a mass text cost?* PA-1758 · 20:24 | yes | Confirms mass texts cost 1 cent each and shows the total for the list size. | 2 |
| How do I set provider hours for part-time or occasional providers? *The orthodontist only comes once a month — how should that be handled in provider hours?* PA-1773 · 41:44 | yes | Explains adding hours for days worked, toggling off days not worked, and zeroing out vacation dates. | 2 |
| How do I manage user accounts, roles, and access in PA? *Can I create the Adit user name as a position, like hygiene coordinator, instead of employee names?* PA-1785 · 08:58 | yes | Explains managing users, roles, and access, noting analytics access is all-or-nothing and phone-user removal needs the phones team. | 2 |
| How do I customize Morning Huddle or appointment squares for other appointment types like implants or surgery? *Can we modify the hygiene appointment squares to show implant procedures or other appointment types?* PA-1782 · 10:46 | partly | Explains customizing Huddle/appointment squares and that PA needs procedure codes, with categories pending. | 2 |
| How do I set up or use the provider dashboard? *Is provider dashboard something we set up ourselves or with Adit help?* PA-1779 · 29:22 | yes | Explains setting up the provider dashboard (providers, operatories, hours) and the one-provider-filter limit. | 2 |
| How do I mark contact attempts on patients and manage follow-ups from lists? *How do I again put the check mark for patients we have tried contacting?* PA-1784 · 00:25 | yes | Explains marking contact attempts and managing follow-ups from lists in Follow-ups \> Overview. | 2 |
| How do I create and assign follow-ups from a patient list? *Wants to allocate the pending-treatment-plan list to a treatment coordinator* PA-1809 · 10:11 | yes | Walks through creating and assigning follow-ups from a patient list and verifying them. | 2 |
| How do I print or export a patient list? *Is there a way to print/export this list?* PA-1817 · 51:26 | yes | Explains exporting/printing a list via the export icon and notes owner-level access. | 2 |
| Where do I enter patient notes, and will it go into the comm log/journal? *Does follow-up information carry over into the comm log?* PA-1799 · 11:25 | partly | Explains where to enter patient notes in PA and that they write to the EHR comm log, noting what cannot be added. | 2 |
| Would this save, or do I have to do that for every month? *Is this also for September, or does it only apply from October?* PA-1805 · 28:38 | yes | Explains that goal/hour updates apply to future dates, so monthly repetition is not needed, with September manual. | 2 |
| Can these patient lists be saved for future use? *Does the list save so I can use it again?* PA-1845 · 31:08 | yes | Explains saving a patient list and whether it auto-updates, correcting the prior inconsistency, without claiming to save it. | 2 |
| How do I create a patient list for the new treatment coordinator using the code we created? *Build a list for a specific procedure code for patients not contacted recently* PA-1849 · 00:20 | yes | Explains how to build/save a code-based list for the coordinator, hands off to the PA list screen, never claims to have created it. | 2 |

## **Chiropractic (30 questions)**

### **A. Practice vocabulary (1)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| What are the different colors with the production, what do the patient-type percentages mean, and is each column a week starting Monday? *The cash says 28.9 for the month, what's the 6.4?* PA-0647 · 19:55 | yes | Maps the practice's words for the production colors, patient-type percentages, and weekly columns (Sunday–Sunday) to the right PA metrics. |  |

### **C. Time and period logic (1)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| Do we have the month-to-date production forecast? *The projected forecast was not transferring — is it updating now?* PA-1670 · 23:19 | yes | Resolves month-to-date as completed-so-far plus scheduled to produce the forecast, and notes a goal can be set on the goals page. |  |

### **D. Breakdowns and rankings (3)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| Can I filter a patient list or production report by a specific treatment, procedure code, or purpose of visit? *Can we filter between massages and adjustments?* PA-0908 · 25:06 | partly | Filters by treatment/procedure where available, and flags custom adjustment codes, new-patient self-pay, and limited status mapping as gaps. |  |
| Can we see percentage of patients by specific case type and pick certain ones, and why don't collections numbers change when I select a case type? *Can we pick multiple case types and procedures at once?* PA-0855 · 57:36 | partly | Gives case-type percentages and payer mix by case type, and flags that the dashboard filter won't multi-select case types and collections not changing is an acknowledged issue. |  |
| Can I see a per-provider dashboard showing only one provider's data, and filter Collections received by provider? *How many visits and how many patients did this provider see per week?* PA-0908 · 14:36 | no | Says no provider filter exists in Collections received and no chiropractic provider dashboard yet, offering the export workaround. |  |

### **E. Patient lists and filters (3)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| How do I build a patient list of patients not scheduled or last seen in a date range, and see unscheduled patients who left without booking? *How would I make that list of patients not scheduled?* PA-0647 · 47:45 | partly | Builds the list with last-completed-appointment and next-appointment-scheduled \= none filters over a changeable date range, and notes discharged patients can't be separated out. |  |
| Can I filter a patient list by case type, like PI, auto, or Medicare, and select multiple case types or appointment types at once? *Can we query by case type, such as auto or personal injury?* PA-0647 · 58:45 | partly | Applies case-type filters (PI, auto, work comp, Medicare) with multi-select, and flags that some case types like MO maintenance and the attorney filter are unavailable. |  |
| Can I exclude patients on monthly payment plans from the balance-due list? *Is there a way to exclude patients on monthly payment plans from the balance-due list?* PA-1761 · 22:32 | no | Says no filter exists to exclude payment-plan patients from the balance-due list, giving the manual-uncheck workaround and logging the request. |  |

### **F. Definitions and denominators (8)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| What does capture rate mean, how is it mapped, and can we change or add capture/production categories? *On capture rate by patient, is total patients how many were scheduled and capture how many checked in/out?* PA-1070 · 33:14 | partly | Gives PA's capture definition (patients who purchased products/sales production), notes mapping is editable, and says only three fixed categories exist. |  |
| Can we see new patients and production year over year, and how are new, active, and future patients counted? *Do we have enough historical data for the growth dashboard?* PA-1339 · 62:00 | partly | States PA's definitions (active \= seen within 6 months; new \= no prior appointment in 11 years) and confirms year-over-year new patient and production charts. |  |
| When mapping appointment categories, do I enter what we charge or the amount we collect, and can I see expected production per patient or appointment type reflecting insurance? *Am I able to make the mapping option?* PA-1070 · 27:01 | partly | Explains entering expected collected amounts in mapping, and distinguishes scheduled (estimated) vs actual net production from completed appointments. |  |
| Is production a dollar figure, how does PA calculate net production, and what does the per-visit number mean? *How does it come up with the net production?* PA-1036 · 13:10 | partly | Defines production as a dollar figure, net \= gross minus adjustments, and per-visit \= sales production divided by total visits. |  |
| What is the difference between production and collections, and does collections incorporate charges vs cash or insurance? *Is this production, not collections?* PA-0647 · 20:48 | partly | Distinguishes production (completed) from scheduled production (mapping estimate) and collections (dollars collected, possibly for earlier appointments). |  |
| What counts as a broken appointment, why does broken appointments not show more no-shows, and how does Adit treat deleted appointments? *Would the no-show list work for us?* PA-0855 · 70:02 | partly | Defines broken as any missed appointment (cancellations plus no-shows), explains deleted appointments don't count, and flags practice-process caveats. |  |
| What does Collections Pending mean, and can I drill into or filter the pending list? *What does Collections Pending mean — why are they pending?* PA-1789 · 08:47 | partly | Defines Collections Pending as balance still to collect from insurance and patients as of today, and points to the age/insurance-vs-patient breakdown. |  |
| Does AR balance pull anything whether it is actually outstanding or not, and is a patient's A/R counted once or multiple times when they have several appointments in a day? *What balance does 'EHR balance above a dollar' pull?* PA-0855 · 21:49 | yes | Explains AR is counted once even with multiple appointments in a day, and that patient balance \= total balance due minus filed insurance claim. |  |

### **H. Doesn't match my EHR (1)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| What is the difference between appointment statuses like confirmed, not confirmed, completed, and checked out on the morning huddle, and can we check a patient in or change status inside PA? *Why does an appointment that is completed and checked out in ChiroTouch show 'checked out' instead of 'completed' in PA?* PA-1516 · 02:14 | partly | Explains statuses reflect the EHR (synced every two minutes), checkout maps to completed with unresolved discrepancies, and check-in must be done in ChiroTouch. |  |

### **I. Setup and data quality (4)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| How do I navigate patient records/case types on the patient card, and why are diagnosis, payment posting, alerts, notes, or case type missing or wrong? *How did you switch to the other card again?* PA-0855 · 17:26 | unclear | Says navigation via family file works but diagnosis display, case-type on payment posting, and missing next appointment are unresolved data/display gaps, and alerts only read from the EHR. |  |
| Why is my patient list empty or showing wrong/inconsistent results, and why are people not populating properly in reports? *I've tried to create some lists just to play with it. It's not pulling.* PA-0855 · 36:50 | unclear | Detects the data-quality/setup causes (AND vs OR filters, inconsistent counts, wrong provider, other-case-type appointments) and flags them as unresolved rather than giving a confident wrong list. |  |
| Why isn't data syncing correctly from the EHR, and how far back does historical data go? *We had a full day yesterday but it's not picking up the numbers* PA-1070 · 47:53 | partly | Notes PA can go back 11 years but flags ChiroTouch sync latency and missing yesterday data as unresolved sync issues. |  |
| Why aren't our payments showing in PA? *Why is PA not reflecting any of our payments if it mirrors ChiroTouch?* PA-1789 · 07:10 | unclear | Points to Collections Received in the PA module and flags Cash Practice payment capture as a data gap being raised. |  |

### **J. Goals and benchmarks (1)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| Can I set goals so all Mondays are the same, all Tuesdays the same? *For collections goal, is that past due collection or daily?* PA-1036 · 16:01 | yes | Confirms PA supports a weekly goals template applied forward about six months, with collections goal as the day's collection target. |  |

### **M. What PA can't do (4)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| Can collections be broken down by payment type, CPT code, or provider? *Can collections reports be broken down by payment type (cash, credit card, check)?* PA-1612 · 28:37 | no | Says plainly that payment-type, case-type, and CPT-code breakdowns of collections are not possible in PA. |  |
| Can I tag or build a list of maintenance patients, or turn tasks into a patient list? *Is there a way in the patient list to build a list of my maintenance patients?* PA-1694 · 34:02 | no | Says no maintenance category or task-to-list conversion exists, explains patient card reads from the EHR, and that tasks must be actioned individually. |  |
| Is there a report for care plans, care-plan purchases, or seminar-to-patient conversions? *Is there a report about care plans?* PA-1612 · 36:00 | no | Says no care-plan, care-plan-purchase, or seminar-conversion report exists; care plans are only on the patient card, and logs the feature request. |  |
| The mobile calendar squishes information together; is there a fix? *How can we make the calendar readable on mobile?* PA-1080 · 13:40 | unclear | Says the mobile calendar layout isn't being changed, notes timeframe control on the main page, and that mobile app updates are in progress. |  |

### **N. Actions and how-to (4)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| Can I export, print, or mass text a patient list or report? *Can we send to all these people from patient list?* PA-0647 · 47:04 | partly | Explains export/mass text from the PA list screen, notes owner role for export and notifications for PDF reports, and says printing the appointment list is not available. |  |
| What is Recare/automated recall, how do I set it up, and are recall texts automatic? *What is automated recall?* PA-0647 · 54:39 | partly | Explains PA's automated recall/recare, where to set it up, notes auto reminders run through Engage, and flags open recall-list logic questions. |  |
| How do I add users and control what access they have? *How do I add new users?* PA-1790 · 32:36 | yes | Walks through Settings \> admin panel \> users and access to add a user and toggle module access. |  |
| Is there a list view for the daily schedule, and can I see future dates? *Is this the only way to look at the schedule for the day, or is there a way that is one long list? Are there different views for the daily schedule?* PA-1731 · 30:13 | yes | Points to Engage \> Reports \> Appointment insights for a list view, and explains changing the date range for future dates. |  |

