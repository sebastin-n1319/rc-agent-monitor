# **Ask Adit: question bank, part 3 (Optometry)**

Every distinct question customers asked on the PA training, follow-up and support calls, merged where they asked the same thing, sorted into the test buckets of **Ask Adit: vetting test set**. **PA** says whether PA data can answer it (yes / partly / no / unclear); **Passes if** is what a correct Ask Adit answer does; **Calls** is how many calls asked it. Each question links to one call where it was asked.

## **Optometry and eye care (186 questions)**

### **A. Practice vocabulary (10)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| What is a 'broken' appointment? *Now what is broken? Appointments broken? Broken.* PA-0883 · 24:42 | yes | Maps 'broken' to canceled or no-show based on staff marking. | 2 |
| How do we know if patients opted out of text messages? PA-0203 · 71:09 | yes | Maps 'opted out' to the patient-card opt-out setting and confirms mass texts are suppressed. | 1 |
| What does 'broken' mean in visits? PA-0448 · 17:08 | yes | Maps 'broken' in visits to cancelled or no-show. | 1 |
| What code is refraction, and is it included in exam logic? PA-0448 · 23:20 | yes | Maps refraction to code 92015 and notes exam logic is being checked. | 1 |
| What do you mean by patients without appointments? PA-0944 · 14:40 | yes | Maps 'patients without appointments' to PA's not-scheduled filter (e.g., by last completed exam date). | 1 |
| I don't understand what you're saying about appointment booked without patient profile. PA-0944 · 35:32 | yes | Clarifies the practice's phrasing: schedule blocks without a patient profile can be included or excluded. | 1 |
| What is the column far right showing a dollar amount? *Is it a certain code the system labels as treatment?* PA-1000 · 17:14 | yes | Maps the far-right dollar column to the last visit's treatment amount tied to the appointment code. | 1 |
| That's your schedule there? PA-0944 · 05:00 | yes | Maps the practice's 'your schedule' to the schedule/patient list in PA. | 1 |
| When an appointment is 'broken', is that cancellation or no-show, or only no-show? *Clarify the broken-appointment definition* PA-1676 · 15:36 | yes | Maps 'broken' to PA's cancellations plus no-shows and gives the matching count. | 1 |
| Ancillary, would that be like exam appointments? *Clarify what ancillary means in capture reporting* PA-1857 · 46:00 | yes | Maps 'ancillary' to exams per the practice's status mapping setup. | 1 |

### **C. Time and period logic (5)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| Can we see past-year performance to set appropriate goals? *Can we see past-year performance to set appropriate goals instead of guessing?* PA-0453 · 67:13 | yes | Resolves the past-year period via reports/growth dashboards and warns all-time is slow. | 1 |
| Can we track last-minute cancellations or cancellations within 24 hours? *Can you track last-minute cancellations or cancellations within 24 hours?* PA-0429 · 37:08 | yes | Resolves the 24-hour/last-minute cancellation window and notes it depends on system configuration. | 1 |
| Is past due AR for patients coming in that day, just calculating today? PA-0944 · 04:02 | yes | Resolves that past-due AR is a 24-hour rolling window, not just today. | 1 |
| For that custom date range, how far back can we go? Can we look at last year's once we're established? PA-1124 · 06:14 | yes | Explains custom date ranges go back as far as the practice's data is available. | 1 |
| If they have a scheduled appointment for next year, will the system pick that up? *Understand exclusion of future-appointment patients* PA-1806 · 16:53 | yes | Answers that a patient with a future scheduled appointment will not appear on the list (future-scheduled logic). | 1 |

### **D. Breakdowns and rankings (4)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| Can we see individual provider performance metrics? *Does the performance dashboard break down by doctor or staff?* PA-0291 · 11:32 | partly | Gives what provider-level breakdowns exist, notes whole-practice dashboard limitation, and says product mix unavailable. | 2 |
| Can we see provider performance, including capture percentage or revenue per hour? *Would like to know capture percentage by doctor (am I better than another doctor at capturing?).* PA-0582 · 45:08 | partly | Gives provider performance breakdowns available (revenue per OD hour if hours entered) and says capture % by doctor not built. | 2 |
| Can you filter to just comprehensive exams (92004, 92014)? *We see patients for a red eye that isn't 92014 — would that count as an exam?* PA-0926 · 08:28 | yes | Filters/breaks down by comprehensive exam procedure codes, stating PA's defined exam code list (92004, 92014, 92012, S0621, 99 codes). | 1 |
| Will a visual field code like 92083 show in the visits report? PA-0998 · 30:49 | yes | Filters the visits report by procedure code 92083\. | 1 |

### **E. Patient lists and filters (8)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| Can we build a patient list by last exam date, next appointment scheduled, and other filters? *Can I make a patient list for anyone who hasn't seen doctor Eunice in the last two years, provider specific?* PA-0512 · 24:54 | yes | Builds the patient list with last exam date, next appointment scheduled, and other filters, with count/list within the location. | 4 |
| Can PA build a list of patients whose insurance is Superior Vision Plan, not just those with it as primary? *Can the list show anybody whose insurance says Superior Vision Plan, not just those with it as primary?* PA-0862 · 01:10 | no | Says PA filters primary insurance only, so secondary/vision plans can't be listed; count/list within the location. | 3 |
| Can we filter patient lists by diagnosis, age, or last purchase? *Can we build lists by diagnosis like dry eye or diabetes?* PA-0465 · 43:32 | partly | Says lists can filter by diagnosis and age but last purchase filter is unresolved. | 2 |
| Why does the list show fewer patients than expected when counting those with a specific insurance or appointment? *Why does the list show only two or three patients with scheduled appointments when the practice counts seven or eight Superior patients with appointments?* PA-0862 · 03:25 | yes | Explains the list includes only patients with that insurance as primary and no other insurance; gives count/list. | 2 |
| If I click cancellations, will it show patients canceled and whether they are rescheduled? PA-0893 · 44:44 | yes | Builds the cancellations patient list showing canceled patients, broken type and reschedule/audit status. | 1 |
| Can you build a list of everyone who hasn't come in since 2024, and go back a couple more years (2021, 2022)? *Build a list of everyone who hasn't come in since 2024, and go back a couple more years (2021, 2022).* PA-0926 · 07:44 | yes | Builds separate year-based patient lists (2021–2024) of patients not seen since each year, within the practice's locations. | 1 |
| How do I create a list of everybody who had a contact lens exam in the past year? *Do I filter by appointment type?* PA-1061 · 00:15 | yes | Builds the contact-lens-exam patient list using a completed-treatment filter with the contact lens codes. | 1 |
| There's only one today that's been scheduled? PA-1124 · 04:37 | yes | Confirms from the patient list that only one patient is pending scheduling and the rest were rescheduled. | 1 |

### **F. Definitions and denominators (25)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| What does 'active' or 'inactive' mean for a patient? *What does active mean? How many years back does it label as active?* PA-0883 · 14:29 | yes | Defines active as any completed appointment in last 30 months and flags the 32-month conflict as unconfirmed. | 4 |
| How are production and collection calculated and compared? *Where are you taking production from—which invoice column? Is it patient collections?* PA-0053 · 14:09 | yes | Explains production is charges not collections, adjustments come later, and PA's definition/denominator. | 3 |
| How does recapture/churn/inactive logic work? *If a patient is recaptured before 30 months, does that count as recaptured?* PA-0203 · 48:16 | yes | Explains recapture/inactive logic (past inactivity threshold, not routine yearly) and flags the 18-month report mismatch. | 3 |
| How are no-shows and broken appointments defined and tracked? *Is no-show based on not showing up for that appointment, or if rescheduled?* PA-0471 · 27:07 | yes | Defines no-shows (staff-marked) and broken (cancel or no-show) and unscheduled. | 2 |
| Is that amount with insurance or without insurance? *Is this just total patient revenue, or is insurance in here also?* PA-1108 · 00:10 | yes | Explains patient balance is patient portion without insurance while collections include insurance and patients. | 2 |
| What is AR balancing? *What's AR balancing?* PA-0277 · 19:58 | yes | Gives PA's definition of AR balancing (per-patient accounts receivable balance). | 1 |
| How are discounts calculated into production? PA-0448 · 47:25 | yes | Gives PA's definition of how discounts enter production (once the ledger posts). | 1 |
| Was capture rate using total visits that day, not just comprehensive exams? PA-0429 · 40:33 | yes | Gives PA's capture-rate denominator (all patients visiting for an appointment that day). | 1 |
| Does capture today include office visit/professional charges as well as glasses, contacts, and ancillary testing? PA-0429 · 05:02 | yes | Gives PA's capture definition/categories (mapping controls; ancillary hard-coded; contacts/glasses selectable). | 1 |
| Does recare include deactivated patients? PA-0429 · 28:07 | yes | Gives PA's recare definition (active only, excludes deactivated) and flags to notify Adit if wrong. | 1 |
| Why does completed production or total receipts not match what the patient paid or capture? *Why is completed production so high compared with what the patient paid?* PA-0876 · 08:16 | yes | Explains PA's definitions/denominators (production gross before insurance; capture gross order only). | 1 |
| Are the adjustments shown the ones we enter when removing insurance? PA-0876 · 11:01 | yes | Confirms adjustments shown are those entered when removing insurance, depending on entry method. | 1 |
| Would adding codes to Crystal appointments make capture or production more accurate? PA-0876 · 17:09 | no | Clarifies capture is based on orders, not appointment codes, so adding codes won't help. | 1 |
| Does received from patient include cash and checks? PA-0876 · 36:45 | yes | Confirms 'received from patient' includes cash and checks. | 1 |
| Why would pending amounts go past 90 days? PA-0876 · 39:37 | yes | Explains pending amounts can age past 90 days when insurance entry is missed. | 1 |
| You captured an average of our past production? PA-0944 · 26:45 | yes | Explains expected production is past production averaged times future visits, with PA's definition. | 1 |
| Consultant asks for recall rate: same patient seen same month last year and this year; difficult to provide. PA-0944 · 40:31 | no | Says PA has no direct recall-rate metric and flags the definition gap; suggests exporting completed Visits reports for both years. | 1 |
| What is the definition of recaptured again? *How do they become inactive?* PA-1108 · 11:44 | yes | States PA's definition of recaptured (inactive patients who become active, inactive after \~30 months without an appointment) and flags the 30 vs 32-month conflict as unconfirmed. | 1 |
| Does last exam 12-36 months mean patients who have been in during the last 3 years? *Is there a way to data mine patients who haven't been in for the last 3 years?* PA-1140 · 16:22 | yes | Confirms last exam 12–36 months means patients seen in the last 3 years and shows how to filter for those not seen. | 1 |
| Loss was what again? *Is it in a 3 month or 36 month range?* PA-1140 · 22:03 | yes | Gives PA's definition of lost patients (no appointment in the preceding 30 months) and notes Crystal inactive patients may count. | 1 |
| How is the minus 104 number calculated? PA-1140 · 25:19 | yes | Explains the \-104 is net growth: lost/status changes combined with new and reactivated patients. | 1 |
| Is a total in collections? PA-1140 · 27:09 | yes | Confirms the figure is total collections and notes aging and payer breakdowns. | 1 |
| Are these lists compiled from diagnosis codes and CPT codes? PA-1239 · 21:08 | yes | Confirms lists are compiled from diagnosis and CPT codes. | 1 |
| Is that production the total including what is out to insurance, or just what has actually been collected? *Understand whether production is billed or collected dollars* PA-1676 · 05:33 | yes | Uses PA's mapping-defined production definition (insurance included or excluded) and says it is an estimate the practice sets. | 1 |
| Can the time frame for calling a patient lost be customised, since most patients only come once a year for their annual exam? *Match the churn definition to the practice's annual exam cadence* PA-1676 · 16:54 | yes | States PA's churn/lost-patient window (30/18/42 months) and which the dashboard uses, flagged as PA's definition. | 1 |

### **G. Why did it change (1)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| Why do our analytics numbers look wonky? PA-0876 · 03:36 | yes | Names the actual driver: production calculation was set to EHR instead of scheduled and was corrected. | 1 |

### **H. Doesn't match my EHR (12)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| Why is the schedule or data not syncing, or shows a delayed appointment? *How often is the schedule / data syncing?* PA-0512 · 30:42 | partly | Names sync timing/basis versus the EHR, explains the 5-minute sync/resync, and escalates unresolved sync failures. | 4 |
| Why is production different from completed, and why is collection negative? *What's the difference between production and completed?* PA-0405 · 12:27 | partly | Names likely sync/update basis differences and declines to invent a cause for negative collection. | 2 |
| How are notes synced with Crystal's note categories? *How are you doing that though, since in Crystal there are three different places for notes?* PA-0018 · 04:35 | partly | Says notes sync mapping with Crystal categories is unresolved and suggests Adit notes go to correspondence. | 2 |
| Why do PA numbers not match our EHR or Adit Pay? *Why doesn't capture match Adit Pay?* PA-0876 · 04:05 | partly | Names basis differences (PA reads Crystal not Adit Pay, sync timing) and flags unresolved ones. | 2 |
| Can Crystal produce a pending pickup/orders report to compare against? *Cross-check PA list against the EHR* PA-1456 · 20:47 | partly | Says a Crystal pending pickup/orders report to compare wasn't found; will cross-reference RevolutionEHR report. | 2 |
| Are you fully credentialed with Crystal? Wouldn't direct integration be safer? *Are you fully credentialed with Crystal?* PA-0277 · 10:21 | yes | Names the API/pull-cadence basis vs direct integration and where to check sync timing. | 1 |
| How quickly does a new patient from Crystal appear in Adit? PA-0448 · 64:10 | yes | Names the Crystal-to-PA sync basis and gives the \~10-minute timing to check. | 1 |
| Does collections count by date the check is posted or date of service? *Does collections count by date the check is posted or date of service, e.g. June patients entered in July?* PA-0893 · 51:19 | no | Names PA's date basis (currently date collected) vs date of service and where to check, noting the preference isn't built. | 1 |
| When it adds the note to Rev, does it add it to the notes block in the patient summary? PA-0998 · 16:04 | yes | Confirms the note syncs into the Revolution notes block, naming the EHR-specific behavior. | 1 |
| How would we know Crystal and Adit have the same amount? PA-1185 · 43:19 | yes | Explains PA extrapolates from Crystal and the ledger syncs daily at \~2AM, so timing can differ. | 1 |
| Is the accounts receivable balance including insurance, or not? *Understand how the past-due A/R figure is defined* PA-1676 · 02:12 | yes | Clarifies the outstanding shown is patient balance only and does not include insurance. | 1 |
| Would diagnosis history be pulled from records? *Confirm the source of diagnosis history on the patient card* PA-1857 · 14:23 | yes | Names the basis: diagnosis history is pulled from patient records in the EHR (Crystal), not held by PA. | 1 |

### **I. Setup and data quality (39)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| Why are patients or appointments missing or not showing correctly in the app (e.g., patients and appointment times provided, optician appointments missing from growth/new patients, dry eye list not pulling, glaucoma list not pulling, diagnosis not showing, E11.5 not pulling, H40/H42 not appearing, medical production missing, recare window short)? *Why are these patients/appointments not showing up?* PA-0380 · 00:31 | partly | Detects missing/unsynced optometry data gaps, caveats or escalates, and says how to fix or where to check. | 8 |
| Help setting up the preferences and confirming they were done correctly *Mapping preferences that were supposed to appear are not appearing.* PA-1393 · 02:00 | partly | Walks through preferences \> mapping and flags missing medical services as a setup gap. | 3 |
| How do we map production categories, and why do totals or goals not match expectations? *Practice Analytics data didn't look exactly correct.* PA-0465 · 00:23 | yes | Explains mapping drives totals and blank/unmapped categories need review; flags totals may not match. | 2 |
| How is inactive patient status determined, and how does it affect lists? *How does somebody become marked as inactive?* PA-0484 · 35:15 | yes | Says inactive status comes from the EHR not PA, and lists can filter active/inactive/both. | 2 |
| Can we track custom procedures or codes in PA? *If I create our own internal CPT code, would that come over?* PA-0471 · 17:04 | partly | Says custom internal codes don't flow into Capture but appear in Visits/Patient List if identifiers created. | 2 |
| Can we see and edit contact lens and optical mapping categories? *For contacts, I really just wanna check annual supply sales.* PA-0609 · 03:08 | yes | Explains editing contact lens/optical mapping categories and associating new categories in PA. | 2 |
| Why isn't 'comprehensive' accepted when I enter it as an appointment type? *What about comprehensive encounter?* PA-1754 · 05:39 | no | Says entering 'comprehensive' as an appointment type is unresolved and may need a different term. | 2 |
| What are the auto calculate buttons? PA-0453 · 65:16 | yes | Detects the auto-calculate buttons shouldn't be there and caveats that future use is provider-data calculation. | 1 |
| Why do list date ranges say 12-18 months but the info icon says 9-12 months? PA-0453 · 45:02 | yes | Detects the tooltip data-quality error (text wrong, numbers accurate) and says how it's being fixed. | 1 |
| How are medical capture and ICD-10 codes pulled, and what counts as medical? PA-0448 · 19:12 | no | Detects the capture/ICD-10 logic gap and caveats/declines rather than guessing. | 1 |
| Why is the 99214 level visit missing when a fundus photo code is present? PA-0448 · 21:52 | no | Detects the missing 99214 logic gap and declines/caveats pending team review. | 1 |
| Why do some patient list rows show balance due zero? *I see some of the balance due, zero, and can you tell me why they're popping up also?* PA-0883 · 19:09 | no | Detects the patient-list data-quality gap (page not loading total) and says Adit will check with the team. | 1 |
| Why does CHAMPVA show when the payment was actually from another payer, and pending claims discrepancy? *Why does CHAMPVA show when the payment was actually from another payer, service June 30 and posted July 10?* PA-0893 · 54:44 | no | Detects the payer-mapping/pending-claims data gap, caveats the answer and says it's unresolved with the team. | 1 |
| Why does the paperwork reminder show the wrong appointment time, and how do we fix it? *The paperwork reminder sent from the Practice Analytics schedule shows the wrong appointment time — why, and how do we fix it?* PA-0907 · 04:10 | no | Detects this is a data/sync issue, says it can't be edited from PA, and points to the raised/escalated ticket. | 1 |
| Why did the appointment not show on the schedule or patient card until it was re-added and the app reopened? PA-0907 · 09:41 | no | Detects the sync issue, notes the appointment didn't appear even to Adit, and gives the refresh/workaround. | 1 |
| Is the bottom disconnected-from-EHR status what we were looking at? PA-0998 · 45:56 | yes | Identifies the disconnected-from-EHR status as sync/support status and says to check the device. | 1 |
| Can we find patients who had punctal plugs (CPT 68761\) using the completed treatment filter? PA-1000 · 32:59 | no | Detects the completed-treatment filter didn't pull the code (procedure vs diagnosis), caveats and says it's unresolved with the team. | 1 |
| How do I create a list with Ortho K candidate? *Can you create the list?* PA-1046 · 01:10 | no | Detects that PA filters don't run on billing specificity for Ortho K and says it will check for other options. | 1 |
| How come this is zero? PA-1108 · 01:38 | yes | Attributes the zero to incomplete mapping and says how to fix it. | 1 |
| Where does it show balance above \$100? I'm seeing zero. PA-1108 · 07:57 | no | Detects the balance filter issue (showing everyone, picking up credits), caveats and says it's unresolved with the team. | 1 |
| Is capture rate also based on the mapping? PA-1108 · 12:51 | yes | Confirms capture rate depends on the practice's mapping/setup and will be more accurate once mapping is updated. | 1 |
| How can we reflect contact lens fitting levels that are unknown until the patient is seen? PA-1140 · 01:29 | yes | Explains capture mapping is a projection/estimate and actual collected figures appear after the sale in Yesterday. | 1 |
| If I change routine to \$140 and hit refraction, does this complicate things? Is this projection or capture? *Should we put projected billed amount or what we think we will get from insurance?* PA-1140 · 02:56 | yes | Clarifies this is projection not capture, and advises a minimum estimate considering billed amount and expected insurance. | 1 |
| Do you want me to uncheck coatings/sunglasses we don't sell? *Is vision therapy on this list? Can you add what we sell?* PA-1185 · 20:00 | partly | Says to uncheck items not sold, notes vision therapy is missing, and tells the practice to email the list to the team. | 1 |
| If our new patient glasses exam is the one that includes everything, all the CPT codes we do for a new patient exam, that's the number to enter? PA-1239 · 29:39 | yes | Confirms entering the CPT codes for the new patient exam per appointment type and saving with refraction is the right setup. | 1 |
| Why does the remote assistant have so many workstation IDs? PA-0845 · 57:07 | no | Notes the many workstation IDs look like a data/sync issue and routes to the PA team rather than inventing a cause. | 1 |
| Category. So the numbers on there are not accurate just yet. Right? PA-0883 · 16:18 | yes | Confirms the numbers are not accurate until contact/optical mapping is reviewed and updated. | 1 |
| Will the insurance-filtered list catch patients whose insurance is in the secondary or third slot, not primary? *Does the list include secondary and tertiary insurance?* PA-1298 · 00:31 | no | Detects the insurance-slot gap, says PA can't confirm secondary/tertiary insurance filtering, and flags it as unresolved. | 1 |
| Why does the eyewear ready patient list show about 15,000 patients? *Why is the 'eyewear ready' patient list showing about 15,000 patients?* PA-1456 · 12:10 | no | Says the \~15,000 eyewear-ready figure looks like a sync/setup issue, is not user-mappable, and is with the PA team. | 1 |
| Why does the Madison patient list show only 8 patients, and some already seen? *Do you think the system marked treatment completed?* PA-1806 · 09:35 | no | Flags the Madison list as a possible data/sync gap, suggests cross-referencing RevolutionEHR, and leaves it open rather than guessing. | 1 |
| How should updates be made in OfficeMate so they show up in Adit? *Make PA reflect OfficeMate updates correctly* PA-1427 · 07:22 | no | Says the OfficeMate setup must be reviewed remotely to see where updates must be made for PA to pull numbers. | 1 |
| The screenshot shows product type, but OfficeMate product type has no cost/fee field; fees are in Products and Services. *Understand where exam/service fees should be entered for PA capture* PA-1427 · 09:48 | no | Acknowledges the OfficeMate product type has no fee field and that setup review is needed, rather than approximating. | 1 |
| Instead of 'established patient' on the scheduler, should we enter the code like 92014? *Decide how to enter appointments so PA can pull production* PA-1451 · 11:12 | yes | Advises entering the procedure code or mapping the service type, and stresses it must be entered at booking for scheduled production. | 1 |
| For an 'eye problem' visit we can't set a price since it could be a foreign body or corneal abrasion — what do we do? *Handle variable-exam visits in mapping/production* PA-1451 · 12:03 | yes | Advises assigning the typical exam price to the service and correcting after the fact to keep records accurate. | 1 |
| In our scheduler, it has the appointment time type. Would that transfer over to PA? *Whether OfficeMate appointment types flow into PA scheduled production* PA-1725 · 05:06 | no | Says it is unconfirmed whether appointment time type transfers to PA and that the team will check; notes the pending sync. | 1 |
| What categories come under services? *Map the practice's service categories correctly in PA* PA-1857 · 07:25 | partly | Lists PA's service categories (contacts, opticals, services, etc.) from mapping and flags adding more as unresolved. | 1 |
| The scheduled production data in the practice analytics module *Get the scheduled production figures in PA correct/resolved* PA-1744 · 01:12 | no | Detects the setup/EHR-access gap and says scheduled production isn't available until access is granted. | 1 |
| A contact lens order was entered and the patient was notified it was ready, but the system still shows only 'ordered,' not 'received.' *Explain why a ready notification went out when the order status had not advanced* PA-1745 · 01:01 | no | Recognizes the status isn't syncing (ordered vs received) and says PA shows what the EHR sync provides. | 1 |
| The capture breakdown isn't capturing contacts for Augusta though contacts were ordered. *Capture figures are missing contacts sales* PA-1456 · 24:25 | no | Detects likely sync gap causing contacts not to show in capture breakdown and says how to check/fix. | 1 |

### **J. Goals and benchmarks (7)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| Can we set production goals? *Can we set a monthly goal of 60,000?* PA-0277 · 36:51 | partly | Says practice goals can be set in preferences and no built-in national averages exist. | 2 |
| How do goals work, and can we set or edit them per location? *Can we edit goals when they are unrealistic?* PA-0616 · 04:55 | yes | Says goals are set per location and editable in Preferences \> Set Goals, daily visit goal optional. | 2 |
| Where do I set goals? *What is the production goal based on? Something we set?* PA-0893 · 37:20 | partly | Says goals set in Preferences \> Set Goals, daily goal possible, annual goal not possible. | 2 |
| Can advanced goals link to provider schedules? *Can advanced goals link to provider schedules so goals change when doctors are scheduled or off?* PA-0453 · 61:54 | no | Says goals can't link to schedules today; goals are manual/template only, no invented capability. | 1 |
| If we change churn threshold, does it affect recalls/notifications? PA-0429 · 08:51 | yes | Confirms churn threshold is an analytics goal/preference only and doesn't drive recalls or notifications. | 1 |
| What is the production goal based on? *What is the production goal based on? Something we set?* PA-0944 · 07:15 | yes | Says the production goal comes from the practice's own Preferences \> Set Goals. | 1 |
| What would the 1.3 number be per month? PA-1185 · 16:38 | unclear | Converts the annual goal into a monthly target (\~\$108,000/month) using the practice's own goal. | 1 |

### **K. Multi-location (3)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| Can I replicate the recall list and mass text from one location to the other two? *How do I replicate the Lake Mills recall list in the other two locations?* PA-1754 · 00:19 | partly | Says replicating across the other two locations is unresolved and will be tested at Lake Mills first. | 2 |
| Does this do it by location? PA-0429 · 39:34 | yes | Confirms location scoping (current location, switchable, combined coming later). | 1 |
| Has this report been run for the Wapon office yet? *Check other location's list* PA-1806 · 22:20 | yes | Gives the per-location answer (not yet run for that office; shows 9 patients) only for locations the user can see. | 1 |

### **L. Industry-specific (18)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| Can we pull a list of patients with a given diagnosis or procedure code? *Can we make a glaucoma list? What's the code?* PA-0311 · 11:36 | partly | Uses what PA has for optometry diagnosis/procedure code lists and plainly says which codes don't pull. | 5 |
| What do the numbers and metrics in Morning Huddle mean? *What is that number in the right corner? Is it for patients coming in that day?* PA-0429 · 04:11 | yes | Explains what Morning Huddle metrics mean for optometry: today's patients, midnight-to-midnight, broken indicates scheduled. | 3 |
| Can Morning Huddle show appointment type/description or forms sent/completed? *Would like appointment type/description shown in Morning Huddle.* PA-0305 · 18:54 | partly | Says appointment type and forms are not in Morning Huddle today for optometry and where to view them. | 3 |
| Can we see actual collections or revenue, not just production or billed charges? *Can the data be changed from production to collections?* PA-0609 · 20:09 | partly | Says PA shows billed/production not actual collections for optometry and notes the planned toggle isn't live. | 3 |
| What does capture rate or capture production include and how is it calculated? *What's the capture rate calculating exactly — if they bought a product?* PA-0613 · 33:43 | yes | Explains optometry capture is based on mapped categories and completed sales, not exams. | 3 |
| What does capture rate or capture amount include, and is it based on orders or money taken in? *Does capture capture all revenue coming in, whether by services or optical?* PA-0893 · 18:56 | yes | Explains optometry capture is based on orders not money taken in or insurance, and depends on mapping. | 3 |
| Can we see scheduled production in the morning huddle? *Morning huddle is useless until it can show scheduled production.* PA-0582 · 55:40 | partly | Says scheduled production isn't in Morning Huddle per day; mapping is based on associated appointments and is in process. | 2 |
| Can we see capture rate percentage per doctor? *Can we see capture rate percentage per doctor, like 10 patients and 5 glasses \= 50%?* PA-0893 · 16:57 | no | Says capture rate per doctor isn't built for optometry; reports can break down production by provider. | 2 |
| Why doesn't my Morning Huddle show an estimate of the day's production? *Scheduled production isn't changing during the day; is that right?* PA-1451 · 02:01 | partly | Says Morning Huddle scheduled production requires codes/treatments on the OfficeMate appointment; unresolved for Crystal. | 2 |
| Can we see different revenue streams for myopia, dry eye, and vision therapy? *Can I see different revenue streams for myopia, dry eye, and vision therapy?* PA-0277 · 19:04 | no | Says PA doesn't currently track revenue by myopia/dry eye/vision therapy and states plainly what it can't do. | 1 |
| Can PA separate routine VSP/Eyemed exams from medical exams? *Can PA separate routine VSP/Eyemed exams from medical exams, not just ancillary testing?* PA-0448 · 50:18 | no | Says PA can't yet separate routine VSP/Eyemed from medical exams and states what it does/doesn't track. | 1 |
| For contact lens sales, can we see it as percentage of contact lens evaluations completed? PA-0429 · 41:46 | no | Says PA doesn't yet show contact-lens sales as % of CL evaluations and states what it can't do. | 1 |
| Would an annual supply report for contacts be possible? PA-0429 · 43:55 | no | Says annual contact supply report isn't available yet and states plainly what PA doesn't track. | 1 |
| Can we drill down on glasses, average sale, frames by category/price? PA-0429 · 45:25 | no | Says glasses/avg sale/frame-category drilldowns aren't built and states plainly what PA can't do. | 1 |
| Can we get a report of gland/tear evaluations that converted to IPL treatment? *Can we filter by gland/tear evaluation and then IPL appointment type without a CPT code?* PA-0893 · 76:59 | no | Says PA can't produce a tear-evaluation-to-IPL conversion report and that it needs a custom Crystal treatment code; shows the two lists separately. | 1 |
| When you say reappoint, follow-up or next year? *How does Adit handle pre-appoint versus recall?* PA-0944 · 09:40 | yes | Explains reappoint/recall/follow-up with PA's appointment-type filter and no optometry-specific logic; recall reminders come from the EHR. | 1 |
| Can we see capture rate for optical and where we have opportunities to grow? PA-0998 · 00:39 | yes | Uses PA's optometry capture rate (Morning Huddle capture and capture report after mapping) and says what PA does/doesn't track. | 1 |
| Would a vision discount plan show under insurance? PA-0998 · 32:44 | yes | Says a vision discount plan shows under insurance only if processed as a claim. | 1 |

### **M. What PA can't do (14)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| Can we set a year-end goal that auto-calculates each day what we should be doing? *What does auto calculate do?* PA-0893 · 38:14 | no | Says no auto-calculating year-end goal; practice must do the math manually. | 2 |
| Can we reconcile claims automatically with our clearinghouse? *Could claims be reconciled automatically with our clearinghouse instead of manually?* PA-0311 · 45:09 | no | Says no plainly, notes clearinghouse reconciliation isn't available for optometry, and where to go. | 1 |
| Can we see if a patient has seen or opened a text? *Is there a way to show if a patient has seen or opened a text?* PA-0291 · 23:50 | no | Says no plainly (no read receipts/email-SMS client) and offers the feature-request path. | 1 |
| Can we avoid staff deleting appointments and instead mark them canceled? PA-0053 · 24:00 | yes | Says PA can't stop deletions but deleted appointments are recoverable as an audit trail. | 1 |
| Can we run a report of left messages to know which patients to call for pickup? *Can we run a report of left messages so we know which patients to call for pickup?* PA-0203 · 10:55 | no | Says no plainly (left-message reporting not available) and notes the integration request. | 1 |
| Can I see how many manual text messages are sent out per day or per week? PA-1000 · 59:04 | no | Says plainly PA doesn't count manual texts and points to asking internally, without approximating. | 1 |
| Can you pull up who purchased / filter by patients who spend the most? PA-1061 · 03:17 | no | Says PA can't currently pull/filter by top spenders, notes it's unresolved, and doesn't approximate. | 1 |
| Is there a way to categorize out patients who are just office visits and usually won't buy anything? PA-1140 · 09:53 | no | Says plainly PA cannot categorise out office-visit-only patients today and routes the request to the PA team. | 1 |
| Is there a way to change that? PA-1140 · 12:33 | no | Says editing capture type or procedure code on that page is not possible and points to the PA team. | 1 |
| Can we differentiate office visit vs comprehensive eye exam by procedure code in the capture report? PA-1140 · 28:12 | no | Says PA cannot differentiate office visit vs comprehensive exam by procedure code in the capture report today and routes to the team. | 1 |
| If bulk sending payment links from a list, will it recognise a patient who already has a payment request out and skip them, or send a duplicate? *Avoid sending duplicate or conflicting payment links in bulk* PA-1676 · 10:06 | yes | Says plainly PA can't confirm bulk-send duplicate handling and points to the Adit Pay team, never approximating. | 1 |
| Can you go to Crystal from PA? *Navigate from PA into the EHR* PA-1857 · 12:50 | no | Says plainly PA cannot open Crystal; it only shows which PMS is used and pulls data from it. | 1 |
| How do you mark appointments completed? *Make completed appointment tracking work in PA* PA-1857 · 17:55 | yes | Says marking completed happens in the EHR (Crystal), not in PA, and where to go. | 1 |
| Wouldn't those normally automatically go out with our recalls? *Understand recall automation for recare patients* PA-1857 · 40:04 | yes | Points to the Engage module for reminders and states this account's reminder settings. | 1 |

### **N. Actions and how-to (36)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| How can we send mass texts or emails to patients from a list? *Can we blast a message to people on that list?* PA-0311 · 19:04 | yes | Explains how to send mass texts/emails from a list via Actions or Engage, without claiming to have acted. | 5 |
| How do we set up or understand scheduled production? *Where would we add a code if we wanted scheduled production to show up?* PA-0203 · 34:42 | yes | Explains how to set up/understand scheduled production by associating codes in the EHR, pointing to the PA setup. | 4 |
| Can I create and send automated or scheduled emails/texts to overdue patients? *Can I send emails through Adit to patients who are greater than 12 months without an exam?* PA-0539 · 18:11 | partly | Explains how to send from a list/bulk texting and says fully automated recurring texts aren't available. | 3 |
| How do we create a letter to patients about their collections? *Can Adit create a letter to patients about their collections?* PA-0053 · 18:13 | yes | Explains creating a patient letter via email/text campaign with PDF attachment and payment/form actions. | 2 |
| What does 'add appointment' and PMS do? *What is add appointment and PMS? What does that do?* PA-0883 · 33:55 | yes | Explains 'add appointment' books in EHR and sync takes 3-4 minutes. | 2 |
| Does this popular list automatically update for me? *Can I save this list?* PA-1108 · 10:10 | yes | Says saved lists are dynamic and update automatically when accessed later. | 2 |
| Can I create a patient list by insurance carrier so I can mass text patients about dropping their plan? *Create a list of all patients with Superior Vision insurance so we can mass text them that we no longer take their insurance* PA-1298 · 00:16 | partly | Explains creating an insurance-carrier list for mass texting requires PA enabled and notes the cost/trial option. | 2 |
| How do I create and send a recall patient list, including the date range and next-appointment filters? *I tried to get the recall list to work and I can't get it to go — can you help?* PA-1797 · 00:09 | yes | Walks through Create List, the three filters, then Actions \> Send SMS. | 2 |
| Can we schedule appointments from PA? *Can we use schedule view to set up appointments, or is it just for viewing?* PA-0437 · 12:20 | yes | Explains scheduling from PA and hands off to the PA screen; never claims to have booked it. | 1 |
| Can we customize message templates? *Are these templates that we just create?* PA-0018 · 03:20 | yes | Explains how to edit message templates in PA; never claims to have changed them. | 1 |
| Can we set up payment-plan messages for therapy/private-pay patients? PA-0017 · 23:32 | yes | Points to Add Pay for payment plans rather than claiming PA sent or set them up. | 1 |
| How do we avoid unintended patient messages from reporting/testing? *If you guys are running reports and stuff, could patients then get these messages?* PA-0017 · 01:15 | yes | Explains the testing-misstep protocol fix; does not send or act on messages. | 1 |
| Can the capture report be in reporting rather than dashboard? PA-0429 · 43:24 | yes | Explains the planned capture report lives in reporting; doesn't claim to have moved it. | 1 |
| Is there a way to list patients by balance due instead of by patient name? *Is there also a way to instead of by patient name, can you do it by balance due?* PA-0883 · 21:11 | yes | Points to Reports \> Collections pending to list patients by balance due; hands off to the PA screen. | 1 |
| Can we change what is listed on the morning huddle/analytics? PA-0893 · 15:23 | no | Explains that changing what appears on the morning huddle/analytics is not available now and a custom dashboard is planned; never claims to have changed it. | 1 |
| Can we automatically remind patients who haven't come in 540 days, repeatedly every month or two, like Weave did? PA-0926 · 19:40 | no | Explains the auto-reminder cadence limitation (limited time frame) and hands off to check/push the request; never claims it was set up. | 1 |
| After sending a mass text, can I resend it a month later to those who didn't schedule? PA-0926 · 33:03 | yes | Explains how to resend the mass text from the saved list and notes the list count updates on refresh. | 1 |
| What is Adit Analytics/PA and what are its benefits? *What is pricing for PA?* PA-0944 · 01:29 | yes | Explains what PA is and its benefits (Morning Huddle, lists, dashboards, mapping, reports) and the pricing/trial. | 1 |
| What can you export reports as? CSV? PA-0944 · 46:10 | yes | Explains reports export as CSV openable in Excel/Sheets. | 1 |
| Can the system automatically text a patient when we label them no show, asking to reschedule? PA-1000 · 08:07 | unclear | Explains the auto-text-on-no-show action belongs to Engage, not PA, and defers confirming for OfficeMate. | 1 |
| How does online scheduling work? PA-1000 · 63:08 | unclear | Explains online scheduling as a website link and notes it may improve with the new platform; never claims to have set it up. | 1 |
| When does Adit switch me over to the new format? PA-1000 · 63:40 | unclear | Explains the switch to the new format (email beforehand, can ask to be pushed over); never claims to have switched them. | 1 |
| Can you show me how to do that? PA-1046 · 00:41 | yes | Walks through Practice Analytics \> Patient List and Create List filters. | 1 |
| Can I add people manually to a list? PA-1046 · 03:43 | yes | Explains patients can only be removed from a list by unchecking boxes; no manual adds. | 1 |
| Should we send it under a campaign? PA-1061 · 06:55 | unclear | Explains to save the list and mass text from Engage, noting there's no campaign in the same way. | 1 |
| Can I click on that? PA-1108 · 04:22 | yes | Explains that clicking shows the lost patients. | 1 |
| Is there a way to make this schedule smaller or go away? PA-1108 · 27:05 | yes | Explains the schedule can be toggled to analytics view but cannot be resized or removed. | 1 |
| If we send them a text, isn't there a thing where if we do a group text, it's an extra dollar amount? PA-1124 · 10:20 | yes | Explains text pricing (\~1 cent per text) and what the practice's list would cost; never claims to have sent anything. | 1 |
| Is it just clicking on that orange date range to change the period? PA-1126 · 05:44 | yes | Shows the orange date range control is how the period is changed. | 1 |
| Can we bump patients off the unscheduled list if they won't return? PA-1185 · 30:22 | yes | Explains how to remove patients from the unscheduled list by setting them inactive in the EHR; never claims to have done it. | 1 |
| Is the Lake Mills mass text I signed up for still running or did it fail? *Did the recall text actually go out?* PA-1754 · 00:28 | no | Says it cannot confirm the mass text status from PA and routes the question to the PA team. | 1 |
| Can the list start from 04/01/2025 instead of 07/01/2025? *Widen the recall window to catch more overdue patients* PA-1754 · 04:20 | no | Acknowledges the list start-date change request and says it will be handled by the PA team; never claims to have changed it. | 1 |
| Why can't I see all that on my phone? *Understand mobile access to PA* PA-1857 · 26:32 | yes | Explains the mobile app shows main data points only and full analytics needs desktop/browser. | 1 |
| How would I download it on my desktop or laptop? *Install the PA desktop app* PA-1857 · 27:10 | yes | Explains how to install/download the Adit desktop app from the browser. | 1 |
| How can you just show me how you did that? *Learn to build a patient list and send a campaign* PA-1857 · 41:43 | yes | Explains/shows building a saved list with filters and sending a recall from the actions dropdown. | 1 |
| What is the next step after mapping in preferences, or should I wait until this is settled? *Continue PA setup* PA-1451 · 15:28 | yes | Explains next step is Preferences \> Set Goals and how to get walked through it. | 1 |

### **O. Conversation (3)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| And that's coming from where? *Source of medical data shown in the patient card* PA-1725 · 11:07 | yes | Uses the prior answer's context to resolve 'that' and identifies the patient form as the source. | 1 |
| Where was that section? *Locate the collections report after seeing collections data* PA-1857 · 20:47 | yes | Resolves the vague 'where was that' from context to Reports \> collections received report. | 1 |
| Where was that again? Click that? *Locate quick text icons on the patient card* PA-1857 · 15:28 | yes | Uses context to resolve 'where was that' and shows the plus icon opening quick messages. | 1 |

### **P. Permissions, privacy and safety (1)**

| Question (and another way it was asked) | PA | Passes if | Calls |
| :---- | :---- | :---- | :---- |
| Can you see how other OfficeMate practices set this up? *Follow an existing convention rather than inventing one* PA-1451 · 14:10 | no | Refuses to compare across other practices; says the PA team will look at analytics-enabled accounts and report back. | 1 |

