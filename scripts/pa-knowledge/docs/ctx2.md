# **Ask Adit: PA context, part 2 (by industry)**

*Part 2 of 3\. Read with part 1, which explains how to review and how citations work. Citations open the Avoma recording; the call register lists each call's practice, Aria thesis, CRM deal and who spoke for Adit.*

## **By industry**

### **Dental**

1,634 PA calls.

#### **How these practices say it**

| Practice says | In PA | Note | Calls |
| :---- | :---- | :---- | :---- |
| unscheduled / unscheduled treatment / unscheduled production / amount / value in treatment plan / outstanding treatment | Unscheduled Treatment / unscheduled treatment production / unscheduled treatment patient list | Presented but not accepted or scheduled treatment and its dollar amount; worked from patient lists and shown in Morning Huddle. 'outstanding treatment' used interchangeably. | (PA-1184; on about 107 calls) |
| broken appointments / broken visits / broken appointment / cancellations and no shows / cancellation rate / no shows | No Show / Cancellation / broken appointment (Broken Appointments report; cancellations and no-shows) | Appointment statuses; no-shows may mean canceled within 24 hours, cancellations before 24 hours. 'unbreak' \= reschedule/restore. | (PA-1188; on about 97 calls) |
| hygiene reappointment / reappointment / reappointed / reappointment rate / reappoint / rescheduled | Hygiene reappointment / Reappointment report / next visits | Next hygiene or future appointment booked; tracked by procedure code on next appointment. PA separates all-appointment reappointment from hygiene reappointment; overall vs hygiene-specific logic differs. | (PA-1184; on about 88 calls) |
| lost / churned / closed / lost inactive / status change / clicked inactive | Lost patients / lost inactive / status change / inactive (churn) / lost due to inactivity (18-month inactive) | No appointment in 18-36 months or marked inactive in the EHR; 'lost status change' \= manually inactivated. | (PA-1208; on about 78 calls) |
| cases report / cases / case acceptance / treatment closing rate / treatment plan / treatment case acceptance | Cases report / case acceptance (Treatment Acceptance / treatment planning detail report) | Practice sometimes calls it the cases report; PA may frame it as accepted treatment. Accepted when appointment scheduled or completed; 'duplicates' in the cases report are multiple appointment types, not literal duplicate rows. | (PA-1184; on about 67 calls) |
| provider hours / hours / chair hours / provider per hour / provider time / team members | Provider hours / production per hour / Provider Working Hours / Operatory Mapping | Block time for production hours, used for utilization and provider dashboard metrics; set under Preferences/team settings. | (PA-1195; on about 47 calls) |
| mass text / mass texting / campaign / blast / mass message / blast email | Bulk SMS from patient list / mass communication / Campaign (messaging module) | Send-text action on a patient list; charged about a cent per text. Send-email action on a patient list. | (PA-1247; on about 46 calls) |
| team settings / set goals / goals / goal / office goal / doctor goal | Team Settings / Set Goals / Goals / Preferences (overall practice, provider production, hygienist production) | Goals and settings live under Preferences/Team Settings; used for targets and mapping. Per-day provider goals enabled via advanced settings; PA cannot set a yearly goal. | (PA-1186; on about 42 calls) |

#### **Questions customers asked on the calls**

Most asked first. *Data needed* is what a query must read; *In PA* says whether PA answers it today.

> 1. **How do I build a patient list, and can I save or reuse it?** (asked on about 20 calls)  
>    Data needed: Analytics \> Patient List; filters such as provider, date range, next appointment, treatment codes, completed treatment, balance due, insurance; save list.  
>    In PA: **yes**. Use Patient List \> Create List with provider and date filters; save the list before sending it in text. Filters include completed hygiene codes, unscheduled treatment, and balance due. (PA-0992 · 17:58; on about 20 calls)  
> 2. **Can I send a mass text (or email) to everyone on a patient list?** (asked on about 14 calls)  
>    Data needed: Patient list membership, contact details, selection scope (selected rows vs all), Actions menu.  
>    In PA: **yes**. Select all or specific patients, then go to Actions and send text or email; the count reflects selected. Mass text charged 1¢ per person; individual texts not charged. ASAP list sends individual texts with placeholders. (PA-1117 · 26:21; on about 14 calls)  
> 3. **Why do PA's production, collections, and new patient numbers not match our own numbers?** (asked on about 13 calls)  
>    Data needed: PA metric values vs practice's own/other report values with date range and filters; appointment completed status; sync status/logs; provider-level gross and net production with entry-date vs procedure-date basis; adjustments and write-offs  
>    In PA: **partly**. Adit has not diagnosed on calls; tickets and analytics sessions are scheduled. One call confirmed everything except the analytics module appears to be working. Adit explained gross/net production and that the production report is production and collections received is actual collected, but discrepancies remained; she needed server access or screenshots to investigate and sessions were booked or access failed. (PA-1748 · 01:22; on about 13 calls)  
> 4. **Why don't PA's production, collections, or AR numbers match what we see in our practice management system (Open Dental, Eaglesoft, Dentrix, Curve)?** (asked on about 12 calls)  
>    Data needed: PA gross/net production, collections received, AR by patient vs EHR day sheet/end-of-month report; date basis (procedure vs payment date), adjustments/write-offs, pending insurance claims.  
>    In PA: **partly**. Adit pulls backend data; differences can come from date basis (procedure vs payment date), net vs gross, or pending insurance claims PA does not include. In several cases Adit takes screenshots, asks for the EHR report, opens internal tickets, and escalates to the dev team; root cause is often unconfirmed on the call. (PA-1389 · 00:07; on about 12 calls)  
> 5. **Can we build and save patient lists for specific segments (unscheduled treatment, hygiene overdue, inactive patients, procedure codes, insurance)?** (asked on about 12 calls)  
>    Data needed: Filters by procedure code, last completed appointment, next appointment scheduled, insurance carrier/remaining, unscheduled treatment, date range; save and export capability.  
>    In PA: **yes**. PA supports patient lists with these filters; lists are saveable, dynamic (re-apply to current data), and exportable with owner-level access. Some list logic (ortho, unscheduled hygiene) remains inaccurate or unexplained. (PA-1349 · 01:15; on about 12 calls)  
> 6. **How do we set up providers, operatories, and provider hours in preferences?** (asked on about 10 calls)  
>    Data needed: Provider list and roles, operatory list and provider-to-operatory mapping, weekly hour templates, provider working days/hours, lunch blocks.  
>    In PA: **yes**. Adit walks through Preferences \> Team Settings: add providers (dentist/hygienist), map operatories, and set hours; weekly templates carry forward about 6 months and prior months are added manually. Provider hours must be updated before provider production reads correctly. (PA-1211 · 37:59; on about 10 calls)  
> 7. **Can we do mass text or email to selected patients on a patient list?** (asked on about 10 calls)  
>    Data needed: Selected patient list, patient phone/email, contact preferences, message template.  
>    In PA: **yes**. Select patients in a patient list and use actions to send bulk text/email; messages personalize with first name and organization. Mass texting is 1 cent per message (free on 10DLC); individual texts from the patient card are free. (PA-1188 · 38:25; on about 10 calls)  
> 8. **Where do I set goals, and where did the default goal numbers come from?** (asked on about 10 calls)  
>    Data needed: Goal settings, default values, provider list, provider hours, weekly templates.  
>    In PA: **yes**. Goals are set in Preferences \> Set Goals (Overall Practice \> Production \> Edit Settings); defaults are industry-standard and can be changed. Provider goals require adding providers in team settings; weekly and monthly goals auto-calculate from daily goals, and advanced weekly templates allow different goals by weekday. (PA-1171 · 25:41; on about 10 calls)  
> 9. **How do we see provider-specific production, doctor vs hygiene, and case acceptance?** (asked on about 10 calls)  
>    Data needed: Provider production, treatment plans by provider, provider goals plus completed/scheduled production.  
>    In PA: **yes**. PA answers in provider\_performance: provider performance separates doctor and hygiene production; a provider-specific hygiene dashboard can be opened; provider case measures of patients seen, how many were given a treatment plan; provider goals feed provider performance and Schedule gives a scheduled-vs-completed view; the 80% treatment acceptance rate can be changed. (PA-0802 · 40:52; on about 10 calls)  
> 10. **Can I print or export a patient list or report?** (asked on about 9 calls)  
>     Data needed: Report type or patient list, list membership, export/print permission by role.  
>     In PA: **partly**. Lists and reports are printable and exportable; Export tab requires owner access, and managers have asked for export permission (still unresolved). (PA-1117 · 23:11; on about 9 calls)  
> 11. **How is treatment acceptance counted, and why does it look wrong?** (asked on about 9 calls)  
>     Data needed: Diagnosed treatment plans, accepted portions, appointments booked, completed/scheduled procedures, dates.  
>     In PA: **partly**. Acceptance counts patients who accepted a portion of the plan and booked it (or had at least one procedure completed same day or scheduled next visit), read from the EHR treatment plan. Counted in the month it was scheduled, not presented. Some zero-acceptance cases were unresolved and moved to a screen-share. (PA-1194 · 02:36; on about 9 calls)  
> 12. **How do I set up and change goals (production goals, daily/weekly, per provider)?** (asked on about 8 calls)  
>     Data needed: Goal values (overall office and per provider/hygienist), per-day vs same-all-days schedule, provider roster, working days, month transition.  
>     In PA: **yes**. PA answers in preferences/goals and provider performance: goals can be set in preferences, can be same all the time or set by day, and can be set per provider; if not edited PA uses standard goal numbers. Use Preferences \> Set Goals; goals are one-time entry, and the advanced weekly template applies for the next 6 months. (PA-0805 · 15:15; on about 8 calls)  
> 13. **How do I create and manage follow-ups, and are they automated?** (asked on about 8 calls)  
>     Data needed: Patient, reason, assignee, due date, notes; automation settings; follow-up due dates and date range.  
>     In PA: **partly**. Follow-ups are created via Follow Ups \> Overview \> Create Follow Up, selecting type, assignee, due date and notes; can assign to one team member per follow-up, and anyone can see or work them but only assigned members get notifications. Automations create internal tasks with nothing sent to the patient; an issue creating follow-ups for inactive/archived patients is fixed by setting the automation to active patients only, but removing already-created follow-ups was not addressed. (PA-1240 · 31:15; on about 8 calls)  
> 14. **How do I create a patient list for hygiene overdue or recare patients to call back?** (asked on about 8 calls)  
>     Data needed: Next appointment \= none, last completed appointment date, hygiene procedure codes, recare due window, patient status.  
>     In PA: **yes**. PA supports recare lists with last-30 and 30-60 day buckets and popular lists for 6/6-9/9-12/12-18 month buckets; create a list with the unscheduled hygiene patient filter, a date filter ('is after' six months back), and 'next appointment scheduled is no'. Lists update automatically and can be saved. (PA-1349 · 01:15; on about 8 calls)  
> 15. **Where do I find and work the unscheduled treatment list and hygiene list?** (asked on about 8 calls)  
>     Data needed: Unscheduled future appointments; hygiene reappointment; patient list 'unscheduled treatment in the last 365 days'; Cases report.  
>     In PA: **yes**. From Morning Huddle go to a past working day; unscheduled future appointments top right. Use Patient List 'unscheduled treatment in the last 365 days' or Reports \> Cases report; can also create custom lists for specific procedures. (PA-1350 · 26:07; on about 8 calls)  
> 16. **Can we see provider-level and hygiene-level production, collections, and appointments?** (asked on about 8 calls)  
>     Data needed: Provider list, date range, provider hours, procedure codes, collections and production by provider.  
>     In PA: **yes**. Provider dashboard and hygiene report show provider-level metrics; all providers can appear at once; adding hours enables production per hour. Review Performance opens a dedicated collections dashboard; the main provider dashboard has no collection graph. (PA-1241 · 24:26; on about 8 calls)  
> 17. **Can we export or download reports and patient lists?** (asked on about 8 calls)  
>     Data needed: Report or patient list export capability; account user permissions.  
>     In PA: **partly**. Reports and patient lists have an export icon usable only with owner-level access; exports as CSV/Excel. The huddle page cannot be downloaded (updates every \~2 minutes) — use reports/patient lists or a screenshot. Printing requires export first. In one case export/print was unresolved because the manager lacked owner access. (PA-1190 · 07:29; on about 8 calls)  
> 18. **How do we know which patients have unscheduled treatment, and can we build a list for that?** (asked on about 8 calls)  
>     Data needed: Unscheduled treatment, procedure code, next appointment, date range, primary insurance remaining, treatment amount.  
>     In PA: **yes**. PA has an unscheduled treatment patient list; Morning Huddle and patient card show it. Filters can be built for specific treatment codes, date ranges, and insurance remaining; multiple codes can be added and saved. Treatment plans must be cleaned up in the EHR so Adit pulls only active plans. (PA-1169 · 60:56; on about 8 calls)  
> 19. **How is PA's unscheduled treatment/production calculated, and why doesn't it match our Open Dental totals?** (asked on about 8 calls)  
>     Data needed: Unscheduled treatment amounts from treatment plan; Open Dental patient account balances; PA preference settings; completed production forecast; appointments by type.  
>     In PA: **partly**. PA shows patients coming today with unscheduled pipeline; it is daily for the selected date and excludes treatment already scheduled. Adit found all data points selected in settings, updated them, and the numbers changed. Proposed but not accepted is read as unscheduled; mark accepted in Dentrix; enable under Preferences \> Set Goals. Some cases remain unresolved. (PA-1216 · 04:48; on about 8 calls)  
> 20. **Where do notes typed in PA go in the EHR?** (asked on about 8 calls)  
>     Data needed: Note write-back destination in the EHR (journal, communication log, chart).  
>     In PA: **yes**. Adit confirmed notes sync: Eaglesoft journal notes, Open Dental patient chart/journal notes (communication log), Dentrix communication log/journal. In Eaglesoft it logs the note by location name, not a specific provider; Adit was unsure of Eaglesoft tagging. For Engage, the EHR logging setting was enabled but its sub-options (calls, texts) were not updated. (PA-1444 · 32:08; on about 8 calls)  
> 21. **Why is scheduled or forecast production in PA different from what the EHR shows, and can it show net instead of gross?** (asked on about 7 calls)  
>     Data needed: Scheduled/gross/net production by date from PA vs EHR; adjustments, write-offs; account setting.  
>     In PA: **partly**. PA shows gross scheduled production from procedure codes for future appointments; net only shows in reports or after posting. Everything scheduled into the future is gross and excludes adjustments across all dashboards; only completed production includes adjustments. A preference to add net scheduled production is being worked on; Morning Huddle scheduled production has no net option right now. (PA-1203 · 02:14; on about 7 calls)  
> 22. **Does PA's balance/AR include insurance, and is it past due or due now?** (asked on about 7 calls)  
>     Data needed: Family ledger balance, past due vs due now, insurance exclusion.  
>     In PA: **yes**. Adit: PA reads past due family balance from family ledger, excludes insurance and today's balance. Patient list balance is patient's true balance excluding insurance; it shows what to collect from the patient. (PA-1459 · 24:55; on about 7 calls)  
> 23. **Can we create a patient list for unscheduled treatment, inactive patients, no future appointment, etc.?** (asked on about 7 calls)  
>     Data needed: Procedure code, diagnosis date, next appointment scheduled, patient status, last appointment date.  
>     In PA: **yes**. Patient lists support filters (procedure code, diagnosis date, next appointment scheduled, status) and can be saved, updated, exported as Excel (owner-level access), and printed from the export; no direct print from PA. (PA-1405 · 00:14; on about 7 calls)  
> 24. **How do I set up or edit production goals, and what do they include?** (asked on about 7 calls)  
>     Data needed: Preferences \> Set Goals \> Production; goal scope, gross/net basis, provider-specific goals, weekly template, vacation dates  
>     In PA: **yes**. Edit under Preferences \> Set Goals \> Production; goals include overall practice production (gross), can be set per provider/hygienist, and saved for future months. Miss-day rollover is not confirmed. Goals are not calculated; set them in Preferences \> Set Goals, with practice-level, per-hygienist and advanced per-day-of-week options. (PA-1774 · 04:49; on about 7 calls)  
> 25. **Why don't the numbers match between Practice Analytics and our practice management system (Dentrix/Open Dental/Eaglesoft) for production, appointments, or counts?** (asked on about 6 calls)  
>     Data needed: PA production totals by date, PMS production report, date-basis preference (procedure vs entry date), adjustments; active patient counts; per-location configuration.  
>     In PA: **partly**. Adit explained procedure vs entry date preference, asked for the Dentrix production report, and will research. PA shows active last 18 months without future appointment; practice saw a mismatch with Open Dental. For zero to 6 months, 25.14% is of total population. In later calls unresolved; Adit requested screenshots and possibly unattended server access for the dev team. (PA-0051 · 01:15; on about 6 calls)

#### **Questions they are likely to ask Ask Adit**

Not asked on the calls, but what the trainer showed suggests them.

> * Why do PA numbers differ from our practice management system reports? (suggested by 96 calls)  
>   Data needed: PA metrics vs PM system metrics; production, collections, appointments; filters by date range, provider; comparison logic  
> * How do I set production goals for the practice and individual providers? (suggested by 89 calls)  
>   Data needed: Goal setting interface, provider list, time periods (daily/weekly/monthly)  
> * How do I set up provider hours and operatories so provider performance and operatory utilization populate? (suggested by 75 calls)  
>   Data needed: Providers, operatories, hours, lunch breaks, mappings  
> * How do I build a patient list for unscheduled treatment or broken hygiene? (suggested by 73 calls)  
>   Data needed: List type, filters (codes, balance, recall status, location, provider)  
> * How do I reconcile differences between PA numbers and my EHR reports? (suggested by 72 calls)  
>   Data needed: Metric, EHR report, date basis, sync status, preferences  
> * How do I export or email a patient list or report? (suggested by 71 calls)  
>   Data needed: Report type, format (PDF, Excel, CSV), recipients  
> * How often does PA sync with our EHR, and why do PA numbers differ from the EHR's own reports? (suggested by 71 calls)  
>   Data needed: Sync status, last sync time, data refresh frequency; reconciliation of measures like production, collections, active patients, visits.  
> * How often does Practice Analytics sync with our practice management system, and when will new data show up? (suggested by 70 calls)  
>   Data needed: Sync schedule, last sync timestamp, source EHR/system.  
> * Why do PA's production and collections numbers differ from our EHR's reports? (suggested by 70 calls)  
>   Data needed: PA production/collections measures by date basis and provider vs EHR report equivalents.  
> * How do I create and save a custom patient list for a specific procedure, insurance, or dollar threshold? (suggested by 70 calls)  
>   Data needed: Patient attributes, procedure codes, insurance, balance, last visit, appointment status.

### **Orthodontics**

31 PA calls.

#### **How these practices say it**

| Practice says | In PA | Note | Calls |
| :---- | :---- | :---- | :---- |
| op / ops / operator / operatively / optatory / chairs | Operatory | Practice uses 'op(s)', 'operator', 'optatory', 'chairs', and room number for PA's Operatory. Names often come from the EHR room setup. | (PA-0188; on about 17 calls) |
| recare / recall / rec are / re care / week care / pre care | Recare / Recare report | Practice says recare/recall for PA's recare report. PA-0188 maps recare to Unscheduled Patient Reschedule/recare report; PA-0865 says recare is basically hygiene in PA; PA-0714 says recare means patients not scheduled, not exactly hygiene. Conflict/needs confirmation on hygiene vs unscheduled recare. | (PA-0188; on about 16 calls) |
| AR / UAR / past due / EHR balance / ledger balance / balance due | Accounts receivable / patient balance due / ledger balance | Practice uses AR/UAR/past due/EHR balance/balance due for outstanding patient balances. PA-0865 notes PA distinguishes EHR balance due from PA-calculated current balance; PA-1105 says EHR balance is patient side only, not insurance. | (PA-0188; on about 14 calls) |
| reappointment / return appointment / extra appointment / next appointment scheduled | Reappointment report / next appointment scheduled | Practice uses reappointment/return appointment/extra appointment for PA's reappointment report and next appointment scheduled. PA-1373 notes general reappointment vs hygiene-to-hygiene reappointment use different logic. | (PA-0188; on about 13 calls) |
| broken appointments / no shows / cancellations / broken | Broken Appointment report / cancellations and no-shows | Practice uses broken appointments for no-shows plus cancellations. PA-0865 notes practices break appointments rather than deleting so they stay in the broken appointment list. | (PA-0188; on about 13 calls) |
| unscheduled treatment / pending treatment / unscheduled treatment plan / on schedule treatment | Unscheduled treatment / unscheduled production | Practice uses pending treatment/on schedule treatment for PA's unscheduled treatment or unscheduled production. PA-1690 notes dollar value on hover and patient lists by last 365 days; PA-1690 also notes treatment plan status 'decline' can be excluded under preferences. | (PA-0541; on about 12 calls) |
| hygienist / hygiene / prophy / perio maintenance / regular cleaning / cleaning | Hygiene / hygiene provider / hygiene appointment | Practice uses hygienist, prophy, perio maintenance, regular cleaning, cleaning, hygiene visit/department for PA hygiene metrics. PA-0552 notes PA recognizes hygiene codes, not scaling. | (PA-0188; on about 10 calls) |
| churn / inactive / lost / churned / recaptured / reactivated | Lost/inactive/churned patient classification / recaptured | Practice uses churn/inactive/lost/churned for patients without an appointment, default 18 months in growth report. Recaptured/reactivated means became active after being inactive. PA-1105 says churned used for 18–36 month inactive range. | (PA-0188; on about 9 calls) |
| production / gross / net / actual production | Production / net production | Practice uses production and gross/net for PA production metrics. PA-0328 says PA report shows net production after adjustments/write-offs; PA-1436 says actual production is completed production under actual provider name. | (PA-0188; on about 8 calls) |
| provider / review performance / provider view / doctor's side / team performance / operating time | Provider View / Provider Performance | Practice uses provider/review performance/doctor's side/team performance for PA provider performance. PA-1631 notes operating time is an occupied operating time metric. | (PA-0188; on about 8 calls) |
| NP / new patient | New Patient / NP filter | Practice uses NP/new patient for PA's new patient flag/filter, shown on Morning Huddle list view. | (PA-0188; on about 7 calls) |
| mass text / mass texting / bulk message / bulk SMS / mass text reminders | Bulk texting / patient-list bulk SMS | Practice uses mass text/bulk message for PA patient-list bulk texting. PA-0847 says PA patient-list texting lacks reporting; Engage mass texting has campaign reporting. | (PA-0587; on about 7 calls) |

#### **Questions customers asked on the calls**

Most asked first. *Data needed* is what a query must read; *In PA* says whether PA answers it today.

> 1. **How do I set up provider hours and weekly templates, including providers who work only certain days?** (asked on about 4 calls)  
>    Data needed: Provider weekly template, hours, lunch, day-specific hours, operatory mapping.  
>    In PA: **partly**. Weekly templates and day-specific hours can be set; a provider working every other Thursday is a feature request with a workaround; hours do not sync from Open Dental. (PA-0442 · 30:57; on about 4 calls)  
> 2. **Can I set different production/visit goals for different days and providers, and can providers set their own goals?** (asked on about 3 calls)  
>    Data needed: Goal values by period and provider, day-specific advanced settings, provider hours.  
>    In PA: **yes**. Preferences \> set goal for days/weeks/months and providers; advanced settings allow different goals per day, and turning advanced settings off restores standard reading. (PA-0188 · 03:07; on about 3 calls)  
> 3. **Why do some appointments show as uncategorized/unspecified, and why are some codes not counted?** (asked on about 3 calls)  
>    Data needed: Procedure codes, custom/internal codes, provider attached to appointment.  
>    In PA: **partly**. Uncategorized is any appointment without a specific treatment code or with a custom code like 999; PA cannot read custom/internal codes today, support is in development. (PA-0328 · 07:33; on about 3 calls)  
> 4. **Why does a patient list show zero or not refresh even though patients match the filter?** (asked on about 3 calls)  
>    Data needed: Completed hygiene appointments, list filter logic, refresh status, report vs list counts.  
>    In PA: **no**. Lists do not auto-refresh — click refresh; a list returning zero and report mismatches are unresolved and being checked. (PA-0515 · 16:27; on about 3 calls)  
> 5. **Where does the collections pending patient/insurance amount come from, and can I see which insurances I'm pending payment from?** (asked on about 3 calls)  
>    Data needed: AR by patient and insurance, aging buckets, remaining benefits, ledger data.  
>    In PA: **partly**. Pending comes from the AR report; click patient name and go to EHR balance remaining benefits for insurance details; PA extracts data directly from the EHR ledger, not via a collections organization. (PA-0328 · 22:41; on about 3 calls)  
> 6. **Can I filter/print/export reports or lists by provider, appointment type, or date range?** (asked on about 3 calls)  
>    Data needed: Cases by provider, patient list rows, appointment type, date range.  
>    In PA: **partly**. Cases report can be filtered by provider and exported/printed; patient lists can be exported; appointment-type filter is being built; unscheduled report uses selected time frame. (PA-0188 · 58:54; on about 3 calls)  
> 7. **Can I compare visits/production/collections to last year or month-to-date, including custom date ranges?** (asked on about 3 calls)  
>    Data needed: Production, collections, visits, exams, starts, case acceptance by date range and year.  
>    In PA: **partly**. Growth dashboard compares month-on-month and can read past 3 years; custom date ranges are available in growth dashboard/email reports; comparative view only covers three years including current. (PA-0328 · 00:45; on about 3 calls)  
> 8. **How does the broken appointment report count broken appointments, and does it include hygienist only or treatment too?** (asked on about 3 calls)  
>    Data needed: EHR appointment break reason, no-show/cancellation status, appointment types.  
>    In PA: **yes**. PA reads the EHR break appointment workflow and counts everything marked broken across all appointment types; if the practice does not use the workflow, the count is low. (PA-0328 · 01:57; on about 3 calls)  
> 9. **Can we get a list of hygiene patients due for their cleaning, and text them to fill open slots?** (asked on about 3 calls)  
>    Data needed: Hygiene due date, last hygiene appointment, active status, next appointment scheduled \= no, patient contact info, open slot details.  
>    In PA: **yes**. PA builds hygiene due lists (this month/last month) with a not-scheduled filter; send text/email via list actions, add scheduling link; online scheduling not working. (PA-0842 · 09:00; on about 3 calls)  
> 10. **How do we see patients who completed an appointment but never scheduled again?** (asked on about 3 calls)  
>     Data needed: Last completed appointment, next appointment is none, treatment code, patient notes/comm log.  
>     In PA: **yes**. Use last completed appointment, next appointment \= no, optional treatment code; patient notes/comm logs can be added and sync to the EHR; ledger entries come from the EHR. (PA-1696 · 103:21; on about 3 calls)  
> 11. **Can we set each provider to their certain days so productivity isn't counted on non-working days?** (asked on about 3 calls)  
>     Data needed: Provider hours, working days, provider IDs, operatory mapping.  
>     In PA: **yes**. Preferences \> provider hours lets you set days/times and turn off non-working days; overlapping operatory mapping is fine; don't add dummy hours first — test with one provider. (PA-1690 · 52:15; on about 3 calls)  
> 12. **Which reports can we trust, and where do the numbers come from?** (asked on about 3 calls)  
>     Data needed: Report definitions and source data per metric, data-check points, PA vs EHR comparison.  
>     In PA: **partly**. PA uses its own logic (e.g., new-patient counting) so numbers can differ from the EHR; onboarding data check and follow-up offered; treatment plans must be kept updated in real time for accuracy. (PA-1221 · 14:06; on about 3 calls)  
> 13. **How quickly does PA data update after a change in the practice management software?** (asked on about 3 calls)  
>     Data needed: Sync timing by data point.  
>     In PA: **yes**. Morning huddle syncs every 4–5 minutes (10 minutes max, can be seconds depending on server cycle); some reports sync twice a day so check next day; Dentrix Ascend syncs every few minutes — more accurate than overnight sync. (PA-0865 · 02:10; on about 3 calls)  
> 14. **Can we see total restorative acceptance for the month if a patient called back next week?** (asked on about 3 calls)  
>     Data needed: Cases report with diagnosed, accepted, scheduled columns; treatment plan procedures, amounts, provider, dates; perio codes.  
>     In PA: **yes**. Use the cases report with a date range and the accepted column; eye icon shows procedure codes, provider, fees, status; perio acceptance available under provider dashboard and cases report. (PA-1105 · 34:34; on about 3 calls)  
> 15. **Can we add exam operatories and map providers to the operatories they use?** (asked on about 3 calls)  
>     Data needed: Provider IDs, operatory IDs, provider schedules/hours.  
>     In PA: **yes**. Add providers/operatories in Preferences \> Team Settings; edit operatory names in the EHR (sync overnight); add exam operatories for hygienists as needed. (PA-1321 · 53:14; on about 3 calls)

#### **Questions they are likely to ask Ask Adit**

Not asked on the calls, but what the trainer showed suggests them.

> * How is hygiene reappointment calculated, and how do we track it by provider or hygienist and pull overdue recare lists? (suggested by 19 calls)  
>   Data needed: Patients, hygiene appointments, recall type, hygiene provider/hygienist, last hygiene date, future appointment flag, date range, location, ortho exclusion.  
> * How do we set provider production goals and see production per hour by provider? (suggested by 16 calls)  
>   Data needed: Provider, production, hours worked, days worked, goal type, location, date range, operatory assignments.  
> * How do we create, filter, edit, save, and bulk-text PA patient lists? (suggested by 15 calls)  
>   Data needed: Patient attributes, insurance carrier, recall/appointment type, balance, last visit, future appointment, saved list definition, text campaign results.  
> * Can we export, email, schedule, and customize PA reports and dashboards, and control who sees them? (suggested by 15 calls)  
>   Data needed: Report/dashboard type, date range, grouping by provider/location/hygiene/ortho, recipients, schedule, export format, user role.  
> * How do we build a patient list for unscheduled treatment by provider, amount, and date range, and work it for follow-up? (suggested by 14 calls)  
>   Data needed: Treatment plans, procedures, presented/not accepted, provider, operatory, dollar amount, date range, future appointment flag, patient contact.  
> * How do we reconcile PA collections and AR with the PMS, and split aging by insurance vs patient? (suggested by 14 calls)  
>   Data needed: Ledger payments, production, collections, insurance vs patient balances, aging buckets, claim status, financing payments, provider/location, date range.  
> * How does PA classify new patients, and why does the new patient count differ from the PMS? (suggested by 13 calls)  
>   Data needed: Patient first visit, provider, location, source, appointment status, ortho/general chart flag, re-appointment, date range.  
> * How do we set provider and operatory hours, and fix schedule sync so utilization and per-hour metrics are correct? (suggested by 12 calls)  
>   Data needed: Provider hours, operatory hours, lunch/block time, location, effective dates, appointment schedule.  
> * How do we track no-shows, cancellations, and broken appointments by provider and date range? (suggested by 11 calls)  
>   Data needed: Appointment status, cancellation/no-show reason, provider, date range, rescheduled flag, patient history.  
> * How fresh is PA data, and why do PA counts differ from the PMS after sync? (suggested by 10 calls)  
>   Data needed: Last sync time, source system, entity (appointments, ledger, patient list), refresh frequency, reconciliation date.

### **Optometry and eye care**

91 PA calls.

#### **How these practices say it**

| Practice says | In PA | Note | Calls |
| :---- | :---- | :---- | :---- |
| capture / capture rate / capture ratio / capture today / sales / sales production | Capture / capture rate / capture breakdown | PA measures sales/optical/contacts/ancillary capture; some practices expect collections, and one call defines capture as total patients minus those who spent extra. Conflict: definitions vary; needs confirmation. | (PA-0203; on about 30 calls) |
| recare / recall / re care / we care / v care / recall message | Recare / automated recall / recall-due patient lists / patient follow-up list | Practice often uses recall for yearly scheduling; PA has Recare report and recall-due patient lists. PA-0811 notes Adit did not show a recall list; one call says OfficeMate recall reminders are from OfficeMate, not PA. Needs confirmation. | (PA-0203; on about 30 calls) |
| optical / contacts / contact lenses / ancillary / services / products | Optical / contacts / ancillary capture categories / optical sales / Contacts capture category / Services / medical service categories | Mapped under preferences and mapping; ancillary is hard-coded in PA. Some specialty treatments need mapping. One call says medical service categories are missing from mapping; needs confirmation. | (PA-0017; on about 30 calls) |
| churn / churn date / churn classification / lost / lost due to inactivity / inactive | Churn classification / Lost due to inactivity / Reactivated / Active Patient Base / Lost/inactivity / churn classification / Recaptured patients / Active patient | Default inactivity window is 30 months in most calls, but PA-0018 mentions a 36-month timeline and another call says no appointment in last 32 months. Conflict: window length; needs confirmation. PA active uses a 30-month definition; another call distinguishes active in PMS vs Adit active. | (PA-0018; on about 27 calls) |
| pre appointment / pre appoint / pre appointing / reappointment / reappointed / preappoint | Pre-appointment / Reappointment / unscheduled future appointment report / ASAP list / Unscheduled future | Practice pre-appoints at the chair for next year; PA calls it Reappointment. Adit said there is no optometry-specific reappointment logic; can filter by appointment type. ASAP is Engage list for unscheduled patients; Crystal wait list is separate. Needs confirmation. | (PA-0277; on about 25 calls) |
| medical / vision / routine / 92 codes / 99 codes / refractions | Medical production / vision exam codes / routine vision / CPT/treatment/procedure code mapping / custom codes / Exam code set / treatment code / Refraction appointment type / production category | 92 codes are routine vision 920xx; 99 codes are medical office-visit; 92015 refraction. Includes routine/medical codes, private-pay/custom codes, and product tiers. Some are not CPT codes; PA may not pull medical yet in some calls. Needs confirmation. | (PA-0017; on about 23 calls) |
| production / gross / net / build out / bill out / medical production | Production / gross/net production / production per visit / Optical/optometric production | Gross includes patient and insurance totals; one practice prefers net. Opto production and sales production are separate PA labels. Conflict: some calls mean optical production/sales, others optometric production. Needs confirmation. | (PA-0017; on about 21 calls) |
| no shows / broken / broken appointments / no show / miss canceled / no shows | Broken appointments / no-show filter / cancellations and no-shows / no-shows / cancellations | PA-0053 notes depends on missed vs canceled marking; PA-0277 separates cancellations with notice from last-minute no-shows. PA broken appointments include cancellations and no-shows; separate no-show and cancellation report metrics exist. Needs confirmation. | (PA-0018; on about 18 calls) |
| mapping / preferences and mapping / categories for appointments / appointment categories / exam type words / mapping for the eyewear | Preferences \> Mapping / category mapping | Used to map procedures, categories, optical/contacts/services; PA-0291 says practice calls eyewear mapping a 'connection'. Where appointment types are assigned dollar amounts and capture categories are mapped. One call says medical service categories are missing from mapping; needs confirmation. | (PA-0016; on about 17 calls) |

#### **Questions customers asked on the calls**

Most asked first. *Data needed* is what a query must read; *In PA* says whether PA answers it today.

> 1. **Why are patients or appointments missing or not showing correctly in the app (e.g., patients and appointment times provided, optician appointments missing from growth/new patients, dry eye list not pulling, glaucoma list not pulling, diagnosis not showing, E11.5 not pulling, H40/H42 not appearing, medical production missing, recare window short)?** (asked on about 8 calls)  
>    Data needed: Patient names, appointment times, diagnosis codes, provider mapping, ledger, exam codes  
>    In PA: **partly**. Adit often says she will check with developers; some lists work, some do not; no single fix shown on calls (PA-0380 · 00:31; on about 8 calls)  
> 2. **Can we pull a list of patients with a given diagnosis or procedure code?** (asked on about 7 calls)  
>    Data needed: Diagnosis codes, procedure/CPT codes, visit dates, next appointment scheduled  
>    In PA: **partly**. Yes for some codes; some codes not pulling (e.g., H40/H42, E11.5); glaucoma list built but did not pull, sent to developers (PA-0311 · 11:36; on about 7 calls)  
> 3. **How can we send mass texts or emails to patients from a list?** (asked on about 5 calls)  
>    Data needed: List membership, patient phone numbers, email, message content, send time  
>    In PA: **yes**. Yes; use Actions \> Send SMS or create an Engage mass-text campaign; costs cents per send (PA-0311 · 19:04; on about 5 calls)  
> 4. **What does 'active' or 'inactive' mean for a patient?** (asked on about 5 calls)  
>    Data needed: Last completed appointment date per patient; 30-month term  
>    In PA: **yes**. Active \= any completed appointment in last 30 months; inactive beyond that. PA uses 30 months; Crystal inactive status may also count. (Note: one reference says 32 months, which conflicts.) (PA-0883 · 14:29; on about 5 calls)  
> 5. **How do we set up or understand scheduled production?** (asked on about 4 calls)  
>    Data needed: Appointment procedure/CPT codes, treatment codes, fee mapping  
>    In PA: **yes**. Associate procedure/treatment codes on appointments in EHR; no invoices needed; PA can map exam codes to amounts (PA-0203 · 34:42; on about 4 calls)  
> 6. **Why is the schedule or data not syncing, or shows a delayed appointment?** (asked on about 4 calls)  
>    Data needed: EHR sync/connection status, sync schedule, manual resync triggers, workstation sync logs, sync timestamps.  
>    In PA: **partly**. PA syncs automatically every 5 minutes for most data, and manual resync is available. Specific sync failures (e.g., Oak Ridge, Revolution disconnected) are unresolved and escalated to product/devs; each login creates a new workstation ID. (PA-0512 · 30:42; on about 4 calls)  
> 7. **Can we build a patient list by last exam date, next appointment scheduled, and other filters?** (asked on about 4 calls)  
>    Data needed: Last exam date, appointment provider, next appointment scheduled, mobile number, email address, patient status.  
>    In PA: **yes**. Yes; patient lists can filter by last exam date, appointment provider, and next appointment scheduled, and support mass texting or email. Adding the 'next appointment scheduled' filter removes already-booked patients. (PA-0512 · 24:54; on about 4 calls)  
> 8. **What does capture rate or capture production include and how is it calculated?** (asked on about 4 calls)  
>    Data needed: Capture mapping categories (contacts, optical, ancillary), completed sales, invoices, patient visits.  
>    In PA: **yes**. Capture is based on mapped categories (contacts, optical, ancillary) and measures completed sales, not exams. Capture production per day specifically refers to sales. (PA-0613 · 33:43; on about 4 calls)  
> 9. **What does capture rate or capture amount include, and is it based on orders or money taken in?** (asked on about 4 calls)  
>    Data needed: Orders categories: optical orders, contact lens, ancillary testing  
>    In PA: **yes**. Capture is based on orders (optical, contacts, ancillary), not money taken in or insurance. It depends on mapping settings for optical and contacts. (PA-0893 · 18:56; on about 4 calls)  
> 10. **How are no-shows and broken appointments defined and tracked?** (asked on about 4 calls)  
>     Data needed: Appointment status, no-show markers, unscheduled list, broken appointment records.  
>     In PA: **yes**. No-shows are marked by the practice; unscheduled means the patient was not added back to the calendar. Broken means cancellation or no-show. No-show report can be rearranged by patient, and marketing based on broken appointments uses the no-show filter. (PA-0471 · 27:07; on about 4 calls)  
> 11. **How are production and collection calculated and compared?** (asked on about 3 calls)  
>     Data needed: Invoice amount column, charges, collections, adjustments, goals  
>     In PA: **yes**. Production shows amount charged, not collections; adjustments appear later; not year-over-year; goal can be set in preferences; dental has comparison report (PA-0053 · 14:09; on about 3 calls)  
> 12. **How does recapture/churn/inactive logic work?** (asked on about 3 calls)  
>     Data needed: Recapture definition, last visit date, inactivity threshold, patient status  
>     In PA: **yes**. Recaptured for patients past inactivity threshold, not routine yearly; report was using 18 months; churn can be changed in preferences \> set goals; inactive is patient status (PA-0203 · 48:16; on about 3 calls)  
> 13. **What do the numbers and metrics in Morning Huddle mean?** (asked on about 3 calls)  
>     Data needed: Today's scheduled patients, date filter, appointment status  
>     In PA: **yes**. Data points connect only to patients coming in that day; 24-hour dashboard is midnight-to-midnight; broken appointment or pre-appointment indicates scheduled (PA-0429 · 04:11; on about 3 calls)  
> 14. **Can Morning Huddle show appointment type/description or forms sent/completed?** (asked on about 3 calls)  
>     Data needed: Appointment type/description, form assignment and submission status, family linking  
>     In PA: **partly**. Appointment type not yet, put in documentation; forms not in Morning Huddle today, can view in patient card; family mismatch unresolved (PA-0305 · 18:54; on about 3 calls)  
> 15. **Can we see actual collections or revenue, not just production or billed charges?** (asked on about 3 calls)  
>     Data needed: Collected payments, write-offs, insurance, production and collections by day/provider.  
>     In PA: **partly**. PA capture and production show sales/billed amounts, not collections; collections is separate. A preference toggle for collected vs production and a custom dashboard are planned but not live. (PA-0609 · 20:09; on about 3 calls)

#### **Questions they are likely to ask Ask Adit**

Not asked on the calls, but what the trainer showed suggests them.

> * How do I build, save, filter, export, and share patient lists by diagnosis, last exam, recall due, balance, insurance, provider, location, billing line, or family status? (suggested by 63 calls)  
>   Data needed: Patients; filters: diagnosis/CPT, last exam date, recall due date, balance due, insurance primary/secondary, provider, location, inactive status, contact lens follow-up exclusion, minimum purchase, billing line item, family status; columns; save/share/export/refresh; manual add.  
> * How do I send a mass text, email, or payment request from a saved patient list, schedule it, track who received or paid, and exclude opted-out or staff patients? (suggested by 39 calls)  
>   Data needed: Saved patient list; patient contact info; SMS/email consent and opt-outs; message template;payment request; send date; recipient record; payment status; response/booking attribution; staff/family exclusion.  
> * How do we map appointment types, procedure/CPT/ICD codes, fee amounts, and service/optical/contact/ancillary/medical codes to capture categories and scheduled production, including which appointment types count as comprehensive? (suggested by 36 calls)  
>   Data needed: EHR appointment types; procedure/CPT/ICD codes; fee schedule amounts; production categories (medical, optical, contacts, ancillary); capture rules; exclusions; comprehensive exam definition; location.  
> * Why do PA production, collections, capture, comprehensive counts, or balances differ from Crystal/Revolution/EHR reports, and how do we reconcile them? (suggested by 36 calls)  
>   Data needed: Production; collections; adjustments; gross vs net; capture; comprehensive count; balances; source EHR fields; date range; provider; category; completed vs scheduled; date basis (service vs received); insurance vs patient split.  
> * How do I set and track production, capture, collection, visit, and opto-per-hour goals by day, week, month, year, provider, or location? (suggested by 33 calls)  
>   Data needed: Goal type (production, collection, capture, opto-per-hour, reappointment, visit); amount or percentage; period (daily/weekly/monthly/annual); provider; location; appointment day template; actuals vs goal.  
> * Which patients are overdue for recare/exam or inactive/lost, and how do we build lists to work them for reactivation? (suggested by 33 calls)  
>   Data needed: Last exam date; recall due date; next appointment; inactive/lost definitions; recare bucket; provider; diagnosis; contact info; opt-out status; lookback window (12–18, 18–30, 12–36 months, 2–3 years).  
> * What is capture rate by provider, optician, or category, how is it calculated, what counts as capture or missed opportunity, and why does capture show zero or differ? (suggested by 27 calls)  
>   Data needed: Capture numerator and denominator; codes/categories; provider/optician; location; billed vs collected; optical/contact/ancillary products; office visit exclusion; time period; patient vs amount basis.  
> * How often does PA sync with our EHR/PMS, when will data be current, and how do we fix sync, access, or setup issues? (suggested by 22 calls)  
>   Data needed: EHR/PMS source; sync frequency; last sync time; missing date range; backfill status; error/disconnected flag; manual resync option; data fields; server access; migration status.  
> * How do I see patient balances, A/R aging, and claims by insurance or patient, filter by payer, and find patients owing above a chosen amount? (suggested by 22 calls)  
>   Data needed: Patient balance; insurance balance; aging buckets; claim status; payer primary/secondary; medical vs vision; provider; location; payment plan flag; last payment; amount threshold; appointment today flag; payment link status.  
> * How do I build patient lists by diagnosis or completed treatment/specialty tag, such as dry eye, glaucoma, myopia, rosacea, LASIK, Ortho-K, or myopia control candidates? (suggested by 22 calls)  
>   Data needed: Diagnosis codes; description; completed treatment/procedure code; treatment tag (myopia control, Ortho K, dry eye); last visit date; next appointment; provider; treatment status; date range; patient contact info.

### **Chiropractic**

38 PA calls.

#### **How these practices say it**

| Practice says | In PA | Note | Calls |
| :---- | :---- | :---- | :---- |
| capture / sales / sales opportunities / quick capture / sales production / capture sales | Capture / Capture rate / Capture Today / capture categories | PA tracks in-office sales and product purchases as capture, including sales opportunities from today's appointments. Categories include pain relief, posture and support, and wellness; one call uses capture for sales/collections figures, so confirm scope. | (PA-1036; on about 20 calls) |
| case type / cases / case types / patient type / primary case | Case Type / patient type | PA uses case type as a filter and report field from ChiroTouch; one call says PA renamed case type to patient type for cross-EHR use, so treat that as a conflict. Specific values mentioned include WC, auto, Medicare, PI, commercial, Helping Hands/cash, ASH, Functional Medicine, and Maryland markers. | (PA-0647; on about 17 calls) |
| outstanding / EHR balance / balance due / past due collection / AR / pending from patient | Accounts receivable / Balance due / Collections / AR aging | PA uses balance due, AR, and collections for money owed to the practice. Heard filter names like EHL above \$1 and EHR above \$1 are unclear and need confirmation; | (PA-0908; on about 14 calls) |
| unscheduled future appointments / reappointment list / people unscheduled / next appointment / next visit / left without a future appointment | Unscheduled future appointments / Reappointment report / patient list | PA flags patients without a future appointment; practice also calls this reappointment list or no future visit. One call says PA tracks rescheduled vs unscheduled. | (PA-1070; on about 12 calls) |
| patient list / list / popular lists / patient lists / recall list | Patient List / patient\_lists | PA builds, saves, and exports patient lists; practice says list and popular lists for prebuilt lists. Recall is also used for outreach lists. | (PA-1036; on about 11 calls) |
| broken appointments / broken appointment / broke their appointment | Broken appointments / cancellations and no-shows | PA combines cancellations and no-shows in broken appointments; one call says the report splits them. | (PA-0855; on about 8 calls) |
| analytics / analytics module / practice analysis / practice analytics module / squiggly lines | Practice Analytics (PA) | Practice and Adit use analytics for PA; squiggly lines is the practice describing the analytics nav icon. | (PA-1094; on about 6 calls) |
| patient card / their profile / family file / alerts in the file / care plan / auto debit | Patient Card / patient record | Practice calls the patient screen their profile or family file; PA shows patient card, alerts, and care plan/auto-debit from ChiroTouch. One call says care auto-debit did not transfer to the new processor. | (PA-1094; on about 6 calls) |
| recall / recalls / recall reminders | Recare / recall reminders / patient list | Practice uses recall for outreach/reactivation and bulk-message reminders; one call says recall is a ChiroTouch recall note, not a calculated frequency, so confirm which meaning is intended. | (PA-0647; on about 6 calls) |
| visit type / purpose of visit / appointment type / reexam / chiro / Botox | Visit type filter / appointment type mapping / appointment category | PA maps appointment types and visit types for production reports; practice uses purpose of visit and reexam. Botox was mentioned as an appointment type to exclude. | (PA-1036; on about 5 calls) |

#### **Questions customers asked on the calls**

Most asked first. *Data needed* is what a query must read; *In PA* says whether PA answers it today.

> 1. **How do I build a patient list of patients not scheduled or last seen in a date range, and see unscheduled patients who left without booking?** (asked on about 12 calls)  
>    Data needed: Last completed appointment date, next appointment scheduled flag, date range, future appointment, discharge status, patient age, save/name list.  
>    In PA: **partly**. PA supports filtering by last completed appointment and next appointment scheduled \= no, and the date range can be changed. There is no good way to separate discharged patients in the unscheduled next appointment report, and some recall-list logic issues are noted separately. (PA-0647 · 47:45; on about 12 calls)  
> 2. **Can I export, print, or mass text a patient list or report?** (asked on about 10 calls)  
>    Data needed: Patient list fields, contact info, export action, mass text action, report export, PDF scheduling, appointment list.  
>    In PA: **partly**. PA lists can be exported and used for mass text/email; export may require owner role. Daily/weekly/monthly PDF reports can be configured under notifications, but printing the appointment list is not available. One practice saw the full list instead of filtered patients; team to check. (PA-0647 · 47:04; on about 10 calls)  
> 3. **Can we see new patients and production year over year, and how are new, active, and future patients counted?** (asked on about 10 calls)  
>    Data needed: New patient counts, production by year, active patients, future scheduled appointments, patient source, date range.  
>    In PA: **partly**. Growth charts support new patients and year-over-year production. Active means patient has been in within 6 months. New patient uses no previous appointment in system over 11 years, not appointment type. Future visit number counts patients indefinitely, not appointments. There is no source category in the new patient report; source would need to be coded in the EHR. New patient count discrepancies are unresolved. (PA-1339 · 62:00; on about 10 calls)  
> 4. **Can I filter a patient list by case type, like PI, auto, or Medicare, and select multiple case types or appointment types at once?** (asked on about 9 calls)  
>    Data needed: Case type field, appointment type, contains/exact match, date range, insurance contains Medicare, provider/case type mapping.  
>    In PA: **partly**. Case type filters are supported including PI, auto, work comp, and Medicare. Some case types like MO maintenance are missing and must be added in EHR/PA; attorney filter is not available. Multi-select is not consistently available; outcome is not fully settled. (PA-0647 · 58:45; on about 9 calls)  
> 5. **How do I navigate patient records/case types on the patient card, and why are diagnosis, payment posting, alerts, notes, or case type missing or wrong?** (asked on about 8 calls)  
>    Data needed: Patient records, case types, payment posting mapping, diagnosis/care plan fields, alerts from ChiroTouch, patient note text, EHR log setting.  
>    In PA: **unclear**. Navigation via family file works, but diagnosis display, case-type differentiation on payment posting, and next-appointment disappearing are unresolved. Alerts pull from ChiroTouch and cannot be created or changed in PA. Case type is not listed on the patient card. Notes can be created on the patient card and sync to ChiroTouch if 'enable EHR logs' is turned on. (PA-0855 · 17:26; on about 8 calls)  
> 6. **What does capture rate mean, how is it mapped, and can we change or add capture/production categories?** (asked on about 7 calls)  
>    Data needed: Patient visits, capture count, sales production, procedure/diagnosis codes, mapping preferences, custom category definitions mapped to product/inventory codes.  
>    In PA: **partly**. Capture count means patients who purchased products/sales production; mapping can be changed. Currently only three fixed categories exist; categories cannot be added or changed. The category split source (procedure vs diagnosis codes) is unresolved. (PA-1070 · 33:14; on about 7 calls)  
> 7. **Why is my patient list empty or showing wrong/inconsistent results, and why are people not populating properly in reports?** (asked on about 7 calls)  
>    Data needed: List criteria, case types, provider, future appointments, result counts, report data with patient records included/excluded.  
>    In PA: **unclear**. Several issues are unresolved: filters combined with AND instead of OR, inconsistent counts, wrong provider, and patients with other-case-type appointments appearing unscheduled. For reports, Adit thinks a temporary developer change was applied then not present; she will have it reapplied and QA'd. (PA-0855 · 36:50; on about 7 calls)  
> 8. **What is Recare/automated recall, how do I set it up, and are recall texts automatic?** (asked on about 7 calls)  
>    Data needed: Recall types, intervals, due dates, provider, case type, last completed appointment, ASAP list entries, Engage recall reminder settings.  
>    In PA: **partly**. PA has automated recall/recare, but recall-list logic and interval behavior have open questions. ASAP does not auto-delete; it is manually edited or trashed. Auto recall reminders are in Engage, turned on one month before and two weeks after due date. (PA-0647 · 54:39; on about 7 calls)  
> 9. **When mapping appointment categories, do I enter what we charge or the amount we collect, and can I see expected production per patient or appointment type reflecting insurance?** (asked on about 7 calls)  
>    Data needed: Appointment categories, charge/collection amounts, save action, historical data, patient insurance, scheduled production.  
>    In PA: **partly**. Enter expected collected amount from historical data; save mapping. Scheduled production is an estimate per procedure, while actual net production comes from completed appointments. PA uses an estimated dollar amount defined per appointment type, not exact insurance-based patient amounts; it would work if it were a cash-based price. (PA-1070 · 27:01; on about 7 calls)  
> 10. **Can I filter a patient list or production report by a specific treatment, procedure code, or purpose of visit?** (asked on about 5 calls)  
>     Data needed: Completed procedures/codes per patient, treatment type, custom codes, procedure codes from ChiroTouch linked to appointment categories/purpose of visit, completed production by procedure code.  
>     In PA: **partly**. PA can filter by treatment/procedure in some cases, but custom adjustment codes and new-patient self-pay type may not be available. Status mapping has only limited appointment-category options and procedure codes cannot be configured there today. Adit will take procedure-code reporting, purpose-of-visit filters, custom buckets, and a less clunky completed-treatment filter to the team. (PA-0908 · 25:06; on about 5 calls)  
> 11. **Can we see percentage of patients by specific case type and pick certain ones, and why don't collections numbers change when I select a case type?** (asked on about 5 calls)  
>     Data needed: Case type counts, case type filters, insurance columns, cash/insurance percentage, collections filtered by case type, multi-select filter.  
>     In PA: **partly**. Dashboard filter does not let you pick multiple case types; sorting columns is unresolved. Payer mix percentages are available for some case types. Adit agreed collections numbers were not changing when a case type was selected and said he would have the team look. Only one case type can be selected at a time, but the list can be exported and totalled. (PA-0855 · 57:36; on about 5 calls)  
> 12. **Why isn't data syncing correctly from the EHR, and how far back does historical data go?** (asked on about 5 calls)  
>     Data needed: Sync status, sync latency, historical date range.  
>     In PA: **partly**. PA can go back 11 years and cloud history may be sufficient for growth, but ChiroTouch sync latency and missing yesterday data are unresolved and under investigation. (PA-1070 · 47:53; on about 5 calls)  
> 13. **What is the difference between production and collections, and does collections incorporate charges vs cash or insurance?** (asked on about 4 calls)  
>     Data needed: Completed production, scheduled production, collections by date, payment/charge split by patient type, insurance payment amounts.  
>     In PA: **partly**. Production is what you complete; scheduled production comes from mapping numbers; collections are dollars actually collected and may relate to earlier appointments. Patient type is shown; insurance filter displays only insurance amounts received. Insurance was not pulling on that day, so team will check. (PA-0647 · 20:48; on about 4 calls)  
> 14. **What counts as a broken appointment, why does broken appointments not show more no-shows, and how does Adit treat deleted appointments?** (asked on about 4 calls)  
>     Data needed: Appointment status: no-show, cancelled, deleted, canceled/rescheduled/deleted status history from ChiroTouch.  
>     In PA: **partly**. Broken means anytime someone misses an appointment; a combination of cancellations and no-shows. No-shows should pull if marked in ChiroTouch, but deleted appointments will not; practice process may need adjustment. Adit said the broken report reads the canceled status and suggested running test appointments to verify deletes; no definitive answer on deletes. (PA-0855 · 70:02; on about 4 calls)  
> 15. **What is the difference between appointment statuses like confirmed, not confirmed, completed, and checked out on the morning huddle, and can we check a patient in or change status inside PA?** (asked on about 3 calls)  
>     Data needed: Appointment status per appointment, ChiroTouch status mapping, sync.  
>     In PA: **partly**. PA reflects EHR status, synced every two minutes. Checkout should map to completed, but discrepancies are unresolved and escalated. Check-in must be done in ChiroTouch; PA reads appointment status from the EHR and cannot change status in the PA list. (PA-1516 · 02:14; on about 3 calls)

#### **Questions they are likely to ask Ask Adit**

Not asked on the calls, but what the trainer showed suggests them.

> * What are our production and collections for a chosen period (yesterday, this month, year to date), and how do they compare with goals and prior periods? (suggested by 26 calls)  
>   Data needed: Measures: production, collections, adjustments, write-offs, payments by method. Dimensions: date basis, provider, appointment type, procedure code, case type, insurance. Filters: date range, provider, location.  
> * Which active patients have no future appointment scheduled, and how much production could they represent? (suggested by 24 calls)  
>   Data needed: Active status, last visit date, future appointment flag, provider, case type, insurance, expected production, date basis.  
> * How many new patients did we have in a period, by provider/location, and how many rescheduled? (suggested by 21 calls)  
>   Data needed: New patient definition, first visit date, provider, location, source, rescheduled flag, period, year-over-year comparison.  
> * What is our reappointment/capture rate and no-show/cancellation rate by provider and period? (suggested by 21 calls)  
>   Data needed: Appointments, completed, cancelled, no-show, reappointment flag, capture mapping, provider, date range, patient history.  
> * How do we build, save, filter, export, and bulk-text a patient list (by case type, insurance, balance, recare)? (suggested by 18 calls)  
>   Data needed: List filters, patient contact info, opt-out/do-not-contact flags, case type, insurance, balance, recare due, export format, campaign tracking.  
> * How much AR is patient vs insurance, how old is it, and which patients/claims are over 30/60/90/120 days? (suggested by 17 calls)  
>   Data needed: Patient balance, insurance balance, aging buckets, payer, claim status, patient appointment today, payment plan, balance threshold, date basis.  
> * How do we map appointment types, procedure codes, and products to production/capture categories, and why don't mapped dollar amounts match? (suggested by 14 calls)  
>   Data needed: Appointment type, procedure code, product/service, production category, capture category, dollar amount, insurance allowables, case type, provider.  
> * How many active patients do we have, and how are patients counted when they have multiple case types or are marked inactive/lost? (suggested by 14 calls)  
>   Data needed: Active status, case type, multiple cases per patient, unique patient ID, last visit date, churn threshold, inactive marking, date basis.  
> * How often does PA sync from the EHR, and why do PA numbers/lists sometimes not match or miss patients? (suggested by 14 calls)  
>   Data needed: Sync frequency, source EHR fields, appointment status mapping, patient identity, report refresh time, ticket status, date range.  
> * Can we filter reports and patient lists by case type and insurance, including work comp, PI, auto, cash, and VA? (suggested by 13 calls)  
>   Data needed: Case type, insurance carrier, patient list filters, report filters, AR/collections, visits, date range, provider.