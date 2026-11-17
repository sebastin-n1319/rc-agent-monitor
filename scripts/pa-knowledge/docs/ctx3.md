# **Ask Adit: PA context, part 3 (caveats, gaps, confirmations)**

*Part 3 of 3\. Read with part 1, which explains how to review and how citations work. Citations open the Avoma recording; the call register lists each call's practice, Aria thesis, CRM deal and who spoke for Adit.*

## **Data caveats**

Where PA's numbers differ from the EHR's own reports, are late, or depend on setup. Each says what Ask Adit should do about it.

### **All EHRs**

> * **Provider performance, operatory utilization, and provider production-per-hour metrics stay empty or wrong until providers are added in Team Settings, mapped to operatories, and provider hours are defined. Provider hours are manually entered in PA, not pulled from the EHR.**  
>   Ask Adit should: Warn that these reports are blank until providers are added, mapped to operatories, and hours are defined; point the user to Preferences \> Team Settings. (PA-1034 · 16:40; on about 81 calls)  
> * **Provider hours and weekly templates are entered as forward-looking 6-month blocks and must be reapplied after 6 months; past dates and non-working days (holidays, closures, lunch, late days) must be edited or backfilled manually. Provider-performance numbers are wrong or empty without them.**  
>   Ask Adit should: State the 6-month forward-only template rule; warn that past days and days off need manual correction and that numbers depend on accurate hours. (PA-1305 · 15:02; on about 76 calls)  
> * **Reports and patient lists can only be exported or printed with owner-level access; non-owner users, including managers and admin-level accounts, may not see the export icon. Adit does not download practice data or export on the user's behalf.**  
>   Ask Adit should: State the owner-level access requirement; tell non-owner users to request the export from an owner or use an owner account; do not export on their behalf (HIPAA). (PA-1305 · 34:01; on about 75 calls)  
> * **PA cannot classify appointments as hygiene vs restorative/other unless a procedure code is attached in the EHR; uncoded or custom-coded appointments show as uncategorized (often gray) and skew hygiene, reappointment, production, and treatment reports. PA reads procedure codes only, not appointment descriptions or notes.**  
>   Ask Adit should: Warn that uncoded appointments are uncategorized and reports may be inaccurate; point to EHR procedure-code entry. (PA-1303 · 73:34; on about 51 calls)  
> * **Hygiene reappointment and unscheduled-hygiene metrics only count when a hygiene ADA procedure code is attached to the next/future appointment; appointments without a hygiene code are not counted as hygiene and can inflate unscheduled counts.**  
>   Ask Adit should: State the hygiene treatment code requirement; warn that appointments without codes read as unscheduled/uncategorized. (PA-1241 · 11:55; on about 51 calls)  
> * **PA data reflects the last sync with the practice server; if sync is stale or interrupted (server logout, move to new computer, backend refresh, no workstation connected), nothing new appears and figures are wrong until it is fixed. Today's data syncs every 3-5 minutes and is not final; yesterday's data is more settled/absolute.**  
>   Ask Adit should: Warn that numbers are stale and check the sync date before quoting data; tell users to review the next day for completed figures. (PA-0939 · 07:16; on about 51 calls)  
> * **Accounts receivable, past-due AR, patient balance, and patient-outstanding figures in PA show only the patient-side outstanding balance and exclude insurance and open claims, so they will not match full AR or the practice's EHR/accounting balance.**  
>   Ask Adit should: State the definition (patient-side only, excludes insurance) and point users to the EHR insurance/pending report for the full balance. (PA-1317 · 08:54; on about 41 calls)  
> * **Active patients are defined by at least one completed appointment in the past 18 months; lost patients are no visit in 18 months or marked inactive in the EHR. This differs from the EHR's own active count and depends on the practice marking statuses and appointments completed in the EHR.**  
>   Ask Adit should: State the 18-month completed-appointment/inactive definition and warn the count differs from the EHR's active count. (PA-1241 · 19:02; on about 36 calls)  
> * **Saved/dynamic patient lists refresh only when opened or refreshed, not continuously; lists with a fixed date range stay frozen while relative-date lists auto-update, and counts can change between visits.**  
>   Ask Adit should: Warn that saved lists are not fixed snapshots; refresh the list before campaigns and re-check counts; explain which filter types auto-update. (PA-1307 · 06:42; on about 35 calls)  
> * **Follow-ups are internal staff tasks/notifications only and do not send messages to patients; they only start from the day the automation was set up, are not retroactive, and past data is not backfilled. They stay on the list until completed/deleted and completed follow-ups are removed from the list.**  
>   Ask Adit should: State that follow-ups are internal staff reminders only, do not trigger patient communication, do not backfill, and require manual completion/rollover. (PA-1156 · 15:39; on about 34 calls)  
> * **Custom procedure codes that are not in the ADA set or have no fee attached cannot be read by PA; they show a zero fee and may be counted as uncategorized or unscheduled, skewing case acceptance, diagnosed counts, and production.**  
>   Ask Adit should: Warn that custom codes are not supported and may be miscategorized; check with the practice whether the code is a dental-book code and suggest attaching fees or using standard ADA codes. (PA-1236 · 21:13; on about 31 calls)  
> * **Mass texting and campaigns can only be done from the patient list, not from reports; recipient counts differ from list totals because patients without a mobile number or email are excluded and opted-out patients are removed.**  
>   Ask Adit should: Point to the Patient List feature for campaigns; warn that recipient counts are limited by available contact info and explain the gap. (PA-1247 · 09:58; on about 31 calls)  
> * **Morning Huddle is live and refreshes every few minutes (4-5 min); it is not printable or emailable and has no export, so only screenshots can be taken and printed. It shows only a single day (today, yesterday, or tomorrow).**  
>   Ask Adit should: Warn that the Huddle is near-live and not printable; recommend viewing online or screenshots, and point to the emailed end-of-day report for a stable copy. (PA-1315 · 20:13; on about 30 calls)  
> * **Collections pending is an as-of-today figure that syncs once daily overnight; it cannot be filtered by a past date, includes credit balances as negatives, and does not account for insurance write-offs until payment is received, so it is not a clean collectible figure and may differ from other reports.**  
>   Ask Adit should: Warn about the as-of-today definition, the daily overnight sync, and that the total is not a pure collectible number and cannot be date-filtered. (PA-1271 · 07:24; on about 27 calls)  
> * **Reported bugs are still unresolved or being researched by Adit's backend team (e.g. recare list accuracy, weekly report blank/missing metrics, growth chart inactive counts, reschedule count mismatch, treatment-planning count mismatch, forms manager tooth number, opt-out notification, back-to-back reminder texts, patient-list 'no data found'/fluctuating counts).** **Needs confirmation**  
>   Ask Adit should: Acknowledge the open issue and say it is with the backend team; give the ticket/reference and expected reply if known; do not claim a fix that is not confirmed. (PA-1252 · 02:13; on about 23 calls)  
> * **PA reads roughly 11 years of patient/ledger history and only active patients; data older than that is not considered and patient counts will not match an all-history or active-only view in the practice's own system.**  
>   Ask Adit should: State the 11-year lookback and active-patient scope when historical counts are requested. (PA-0954 · 55:34; on about 22 calls)  
> * **Some features are not live yet (inventory reporting, call source, spam/robocall differentiation, call transcripts, insurance dashboard/optometry health score, scheduling from the app, customizable dashboards choosing net/gross or which numbers to see), though some are planned.**  
>   Ask Adit should: Say the feature is not available yet; if known, mention the target but do not promise a date. (PA-1245 · 27:30; on about 21 calls)  
> * **Bulk SMS campaigns pause at 1,500 messages per 24 hours unless on 10DLC, which allows up to 35,000; texts cost about 1 cent each and email is free up to 20,000/day.**  
>   Ask Adit should: Warn about the daily SMS cap and per-text cost before scheduling a large campaign. (PA-1315 · 44:42; on about 20 calls)  
> * **Reports and patient lists are prebuilt and fixed; only patient lists can be customized with the practice's own filters, and some reports cannot be filtered by procedure code or time frame. Dashboards only allow selecting a week or a month; wider date ranges must be pulled from the individual report.**  
>   Ask Adit should: Explain the limit; offer to build a patient list or export to Excel for custom filtering; point to the report for wider time frames. (PA-1245 · 32:04; on about 20 calls)  
> * **PA collections/production numbers can differ from the practice's own EHR numbers because PA may report gross rather than net or use different definitions; the EHR should be the source of truth for accounting.**  
>   Ask Adit should: State whether the figure is gross or net and which source it uses; if the practice needs official net numbers, point them to their EHR/accounting system and warn numbers may not match. (PA-0695 · 03:41; on about 19 calls)

### **ABELDent**

> * **Scheduled/future production, hygiene/unscheduled counts, visits categorization, and the reappointment report depend on procedure/treatment codes being linked to appointments in ABELDent; when they are not linked, PA shows zeros, uncategorized visits, or only completed production.**  
>   Ask Adit should: State that scheduled production is not reliable unless ABELDent has procedure codes linked at treatment level; point to the ABELDent production/visits report for scheduled/future production. (PA-0117 · 09:28; on about 5 calls)  
> * **Recall lists/reports in PA for ABELDent are unreliable because PA may miss SC/RERC, read the wrong ABELDent section/contacts/last recall date, use next recall date instead of status, and include recently seen or already booked patients; a patient with a next appointment can appear because ABELDent sets forward a recall date.** **Needs confirmation**  
>   Ask Adit should: Do not use PA recall lists as the source of truth; warn that they are under investigation and point to the ABELDent recall report/profile. (PA-0727 · 38:38; on about 5 calls)  
> * **New patient, recare, provider performance, and cancellation/no-show data depend on appointments being marked completed or broken in ABELDent; if they are not, PA shows them as scheduled/broken and counts are inaccurate, and marking a missed-appointment code as completed prevents PA from classifying cancellation/no-show.** **Needs confirmation**  
>   Ask Adit should: State the completion/broken-status definition and warn that counts are only as accurate as ABELDent status changes; point to ABELDent appointment status reports for confirmed numbers. (PA-0727 · 26:24; on about 4 calls)  
> * **PA only allows notes and scheduling; completing, canceling, changing, or bulk-marking past appointments completed must be done in ABELDent, and Adit is not sure ABELDent offers a bulk-complete option.** **Needs confirmation**  
>   Ask Adit should: Decline requests to complete/cancel/change appointments from PA and direct the practice to ABELDent for those actions. (PA-0727 · 30:58)  
> * **Sync time from ABELDent is about 4-5 minutes, so PA data is near-live but not instant.**  
>   Ask Adit should: Warn about slight staleness; if a just-made EHR change is missing, ask the user to wait a few minutes and refresh. (PA-0759 · 25:27)  
> * **PA reads any schedule column that has appointments, so a placeholder follow-up column makes counts look higher than reality; a column cannot be permanently excluded in PA and must be hidden in ABELDent itself.**  
>   Ask Adit should: State that schedule counts include any appointment-bearing column; advise hiding unused placeholder columns in ABELDent if counts should not include them. (PA-0821 · 18:55)

### **ChiroTouch**

> * **Specific sync gaps and delays have been reported between PA and ChiroTouch. Examples: ASAP list not synced; forms do not sync demographics/records; online scheduling may appear in ChiroTouch front desk but not scheduler; deleted appointments may not disappear; 12AM appointments and payments/forecast can be missing; historical data may still be syncing. PA syncs with ChiroTouch every 4–5 minutes, so today's numbers lag EHR edits; some product/category mapping changes may not appear in PA until the following day.** **Needs confirmation**  
>   Ask Adit should: Warn that specific records may be stale or missing; check sync status and escalate EHR-side issues rather than assuming PA has current data; tell users to wait a few minutes (or until next day for category changes) before treating today's numbers as final. (PA-0855 · 29:31; on about 10 calls)  
> * **ChiroTouch has no native scheduled production amount; PA estimates it by mapping appointment types to dollar amounts/categories, so it is a forecast, not an EHR value and can be 'not perfect'.**  
>   Ask Adit should: State that scheduled production is a PA estimate from mapping; do not present it as an EHR actual, and point to completed production in ChiroTouch for actuals. (PA-0647 · 31:19; on about 6 calls)  
> * **New-patient counting disagrees between PA and ChiroTouch: ChiroTouch can count a new case type (including VA chiro referral restarts and cash-to-insurance changes) as a new patient because a new record is created; PA's definition is no completed appointment in the past, and reused duplicate files may not be captured unless a completed appointment is attached.** **Needs confirmation**  
>   Ask Adit should: State PA's definition and warn that counts may differ from ChiroTouch; confirm with practice before using for decisions. (PA-0908 · 11:06; on about 5 calls)  
> * **Capture/sales reporting depends on ChiroTouch setup: categories are read from ChiroTouch and new categories must be created there; mapping may be wrong or not match what the practice sells; payments via Cash Practice or the inventory table may not reflect in PA, and sources differ from the collections ledger.** **Needs confirmation**  
>   Ask Adit should: Warn that capture/sales numbers may be incomplete or mis-categorized; ask to verify ChiroTouch categories and payment source; reconcile with ledger if needed. (PA-1036 · 61:12; on about 5 calls)  
> * **ChiroTouch can create multiple active patient records for one patient, often one per case type (including via online scheduling); PA separates them, and family association is the current workaround. Case type is not shown on the patient card, which makes matching/visibility difficult; PA is adding case type to more places, but design is not confirmed.** **Needs confirmation**  
>   Ask Adit should: Define that duplicates are separated by PA; warn that patient matching may need case-type context; ask whether case-type display is planned. (PA-0647 · 48:10; on about 4 calls)  
> * **Case-type filtering is unreliable: ChiroTouch can have many case types (e.g., 892), values are insurer/provider-specific, filters need specific contains logic, and searches for abbreviations like 'PI' may fail if the value is spelled out; case types can also put appointments into the wrong case type.** **Needs confirmation**  
>   Ask Adit should: Define exact case-type filter logic; verify exact strings with the practice; warn that broad filters can return zero or wrong patients. (PA-0855 · 36:50; on about 3 calls)

### **ClearDent**

> * **ClearDent to Adit sync typically takes 2-5 minutes, but some changes (provider specialty) sync overnight; counts can lag EHR changes.**  
>   Ask Adit should: Warn about staleness; note that data may be up to 5 minutes old (or overnight for provider specialty) and not real-time. (PA-0034 · 03:42; on about 3 calls)  
> * **Adit uses procedure/treatment codes rather than appointment type; missing codes cause appointments to appear uncategorized or misclassified and reduce accuracy of production, hygiene scheduling, and reports.**  
>   Ask Adit should: State definition: PA relies on procedure codes; if codes are missing, data may be incomplete. Suggest checking ClearDent for missing codes. (PA-0034 · 12:27; on about 3 calls)  
> * **Appointment status mapping from ClearDent to Adit was incomplete (e.g., 'booked', 'seated', 'not arrived' missing from dropdown; 'arrived' not mapped), which can affect broken and new-patient views. One call says Peter will confirm; another says Adit updated 'arrived'.** **Needs confirmation**  
>   Ask Adit should: Point to EHR report for status; note mapping may still be incomplete; confirm with Adit. (PA-0034 · 54:24; on about 2 calls)  
> * **PA pulls schedule and clinical data from ClearDent; notes sync both ways; appointments scheduled from Operatory View update ClearDent within 2-3 minutes.**  
>   Ask Adit should: State that data flows from ClearDent to PA and notes sync both ways; no action needed unless sync fails. (PA-0655 · 02:23)  
> * **Hours busy depends on ClearDent status changes from seated/in chair to appointment completed.**  
>   Ask Adit should: State definition: Hours busy requires completed status in ClearDent; if not completed, metric may be wrong. (PA-0655 · 50:53)  
> * **Adit uses its own new-patient logic, not ClearDent's, so counts can differ from ClearDent reports.**  
>   Ask Adit should: State definition: PA uses its own new-patient logic; counts may differ from ClearDent reports. (PA-0783 · 08:35)

### **Crystal PM**

> * **Scheduled/future production depends on treatment/procedure codes being present on appointments; Crystal often lacks these codes, so PA scheduled production may not pull or may be inaccurate. PA uses appointment-type mapping as a workaround, but adding codes later only fixes forward, not historical data.** **Needs confirmation**  
>   Ask Adit should: Warn that scheduled/future production is not reliable without mapped codes; state the mapping requirement and check whether codes were added at booking or later. (PA-0203 · 34:00; on about 11 calls)  
> * **Some Crystal sync/fix issues require one-time access to the practice's server or updating app files on it; Crystal updates require contacting each client. Patient information changes must be made in Crystal, not PA, and PA does not have access to Crystal from PA.** **Needs confirmation**  
>   Ask Adit should: Explain that a fix may need practice server access or a client-side file update; do not promise an immediate data fix until access/update is confirmed, and direct patient-info changes to Crystal. (PA-0389 · 01:11; on about 10 calls)  
> * **Code and category mappings can be inaccurate: contacts are mapped under lenses; billing codes may not be connected to a category; blank mapping rows and missing/incorrect codes (e.g., 92015, 92270, Ortho K bill code, retinal screening) can affect analytics. Primary insurance filtering matches the exact EHR listing (VSP vs Vision Service Plan), and pending claims may only pull primary insurance.** **Needs confirmation**  
>   Ask Adit should: State that mapping/coding issues can make counts and production wrong; verify the specific code/category and tell the user to fix mapping in Crystal or ask Adit to adjust. (PA-0291 · 14:51; on about 9 calls)  
> * **Sync timing varies: APIs typically pull every 5 minutes, some data hourly, appointments booked through the PMS sync to Crystal in about 3-4 minutes, new patient sync may take about 10 minutes, and Crystal ledger data syncs once daily at 2AM. Conflict: PA updates are described as within 5 minutes maximum in one call, while ledger data is daily and some data is hourly.** **Needs confirmation**  
>   Ask Adit should: Warn about latency and state which data type has which cadence; do not treat all PA data as real-time. (PA-0277 · 12:23; on about 9 calls)  
> * **PA collections pending/received can differ from Crystal, QuickBooks, or the practice EMR because of aging window, report options, billed-date vs seen-date basis, insurance EFT/credit-card payments, or patient portion. One report was about \$2,000 under; another differed by about \$400k pending and about \$4,000.30 total.** **Needs confirmation**  
>   Ask Adit should: Do not present PA collections as exact; state the basis and tell the user to compare to the Crystal/EMR report or ask Adit to reconcile. (PA-0405 · 42:29; on about 6 calls)  
> * **Patient status definitions differ: PA new patient is first completed appointment in the appointment book; lost \= no appointment in last 30 months; recaptured \= inactive became active and scheduled; active without a future appointment is read from Crystal and can include patients the practice marked inactive. Crystal patients marked inactive may also be considered lost, and the practice often does not mark patients inactive.** **Needs confirmation**  
>   Ask Adit should: State the definition being used and warn that PA active/lost lists can include Crystal-inactive patients; direct the user to Crystal to change status. (PA-0810 · 23:49; on about 5 calls)

### **Curve Dental**

> * **PA syncs from Curve Insights reports, not Curve's regular reports; Insights can lag about 24–36 hours (one call says 24–40), so day-of PA data can mismatch Curve.**  
>   Ask Adit should: Warn that PA is not real-time for Curve and point users to Curve Insights' last-updated time; for day-of numbers, compare with Curve and treat PA as stale. (PA-0864 · 00:18; on about 10 calls)  
> * **PA production totals can differ from Curve because PA reads procedure-code fees and procedure date, does not read manually entered scheduled production, and undercounts when procedure codes are missing or not syncing.** **Needs confirmation**  
>   Ask Adit should: State PA's production definition and ask the user to compare with the Curve production screen; if procedure codes are missing, scheduled production may be zero or undercounted. (PA-0114 · 26:10; on about 10 calls)  
> * **Near-real-time or day-of PA data requires the Adit extension to be logged in and working on every computer where Curve data is changed; otherwise changes may not sync. Browser extensions like Grammarly can slow Curve reports, and 12AM timestamps indicate the backup sync date because the extension missed the event.**  
>   Ask Adit should: Warn users to check extension status on all computers and disconnect extensions when switching EHRs; if data is missing, verify the extension was connected when the change was made. (PA-0081 · 08:42; on about 8 calls)  
> * **PA collections can differ from Curve due to deposits/allocations timing, daily sync/Insights lag, Adit Pay timing, and multi-location crossover; the practice may take all payments as deposits and allocate credit later.** **Needs confirmation**  
>   Ask Adit should: Warn that single-day collections can be misleading; point to the Curve collection/deposit report and allow a month lag. (PA-0285 · 74:48; on about 7 calls)  
> * **PA may not reliably pick up diagnosis/treatment acceptance data; it reads it only if consistently updated in Curve and may need one-time Curve access and a resync. Treatment acceptance totals may duplicate, and the practice does not accept/reject treatment in Curve.** **Needs confirmation**  
>   Ask Adit should: Decline or caveat treatment-acceptance totals; ask the user to verify the Curve report and treatment plan status. (PA-0702 · 31:19; on about 6 calls)  
> * **On an account not set up correctly, PA appointment count, scheduled production, visits, unscheduled family, family linking, and dashboard data are wrong or incomplete until fixed.** **Needs confirmation**  
>   Ask Adit should: Warn that dashboard/huddle data is inaccurate until account setup and resync are fixed; do not use it for decisions. (PA-0285 · 16:30; on about 5 calls)

### **Dentrix**

> * **PA sync with Dentrix is on a short interval, but reported timing conflicts: most calls say 2–3 minutes, others say 3–4, 4–5, or 1–2 minutes; today's data is progressive and may change, while yesterday's is treated as confirmed. The production report syncs once daily.** **Needs confirmation**  
>   Ask Adit should: State the sync interval as approximate/conflicting, warn about staleness, and recommend refreshing or checking the last sync before relying on live counts. (PA-0547 · 10:35; on about 30 calls)  
> * **PA does not allow editing patient personal information, demographics, inactive status, family members, or recall/hygiene due dates; these must be changed in Dentrix and then sync back. Patient lists and follow-ups also only pull patients who exist in Dentrix.**  
>   Ask Adit should: Decline to edit in PA, direct the user to make the change in Dentrix, and let it sync; for missing patients, tell the user to create the patient in Dentrix first. (PA-0006 · 19:36; on about 30 calls)  
> * **Notes added in PA usually write to the Dentrix journal/communication log and Dentrix notes are read back, but reports conflict: some calls say notes must be entered in both systems, some say notes only sync sometimes, and some say guarantor/clinical notes are not included. Bugs were also reported where notes did not appear in Dentrix or did not sync to the patient card.** **Needs confirmation**  
>   Ask Adit should: State that notes are usually bi-directional, but warn that missing, guarantor, or clinical notes may not sync; if notes are missing, check the Dentrix journal and sync status and escalate. (PA-0073 · 07:54; on about 28 calls)  
> * **PA production/collections can differ from Dentrix reports because PA may use procedure date vs entry date, gross vs net, estimates, adjustments/write-offs, and may lack insurance fee schedules; some discrepancies are unresolved.** **Needs confirmation**  
>   Ask Adit should: Warn that PA and Dentrix report bases differ; point to the Dentrix report for reconciliation and avoid saying PA is authoritative. Escalate unresolved mismatches. (PA-0005 · 43:39; on about 28 calls)  
> * **PA AR, balance, and insurance figures reflect Dentrix data and are only as accurate as Dentrix; patient balance/AR is usually guarantor/family-level, PA does not calculate insurance-covered portion, and insurance names must match Dentrix exactly.** **Needs confirmation**  
>   Ask Adit should: State the definitions, advise checking the Dentrix ledger and insurance posting, and use exact Dentrix insurance names. Point to Dentrix or the third-party portal for coverage details. (PA-0098 · 45:35; on about 28 calls)  
> * **PA tracks pending insurance claims only when they are submitted through Dentrix; claims submitted through third-party websites or other methods are not visible. PA also does not include aging and claim reports.**  
>   Ask Adit should: State the limitation and direct users to Dentrix or the third-party portal for those claims and for aging/claim reports. (PA-0216 · 10:28; on about 28 calls)

### **Dentrix Ascend**

> * **PA reads Dentrix Ascend every 2-5 minutes, so PA numbers can lag or change during the day; appointment changes sync both ways within 2-3 minutes.**  
>   Ask Adit should: State the sync interval and warn that numbers may be stale; check the EHR for real-time values. (PA-0128 · 42:40; on about 10 calls)  
> * **Sync can stop or delay if the Chrome extension/browser window is closed or the module is not accessed; real-time sync requires all users logged in, and backup sync runs twice daily.** **Needs confirmation**  
>   Ask Adit should: Warn that PA data may not be current if the extension is not running or the module hasn't been accessed; suggest checking the EHR or rerunning sync. (PA-0666 · 43:35; on about 7 calls)  
> * **PA production/gross may not match Dentrix Ascend net/gross because PA uses a standard fee schedule or different adjustments; practice saw PA net 7,464 vs Ascend net 3,433 and PA gross 17,002 vs Ascend net 11,008.** **Needs confirmation**  
>   Ask Adit should: State that PA gross is from a standard fee schedule and may differ from Ascend net; point to the EHR report for reconciliation. (PA-0196 · 06:45; on about 7 calls)  
> * **Provider mapping issues can cause duplicate profiles, missing providers, or data shown under the wrong provider/location; e.g., one provider had two profiles because scheduling used two IDs.** **Needs confirmation**  
>   Ask Adit should: Warn that provider data may be mapped incorrectly; verify provider IDs in Dentrix Ascend before trusting PA provider views. (PA-0396 · 19:49; on about 7 calls)  
> * **Production and collections may show zero or not populate when sync is delayed, the module is not accessed, or the sync instance needs to be rerun.** **Needs confirmation**  
>   Ask Adit should: Warn that zeros may be a sync issue; point to the EHR report for production/collections. (PA-1038 · 14:47; on about 6 calls)  
> * **Initial sync and setup require a dedicated Dentrix Ascend user with admin permission and credentials sent to Adit; Ascend may detect and kick out users named after Adit.**  
>   Ask Adit should: Tell the practice to provide a dedicated Ascend admin user and credentials; if setup is incomplete, sync will not start. (PA-0196 · 12:31; on about 4 calls)

### **Eaglesoft**

> * **Eaglesoft-to-PA data freshness is progressive, not instant: most sources state 3-5 minutes for appointments/notes/patient lists, some say 2-3 minutes, some 4-5 minutes, and production/collections/ledger can take up to about an hour.**  
>   Ask Adit should: State the expected sync window (roughly 2-5 minutes for most data, up to about an hour for financial data) and warn that numbers are not real-time; re-check after a few minutes before raising a data issue. (PA-0007 · 12:11; on about 32 calls)  
> * **PA pulls data directly from the practice's Eaglesoft/PMS; patient information in PA is read-only and edits must be made in Eaglesoft.**  
>   Ask Adit should: Decline edits to patient info in PA and direct the user to make the change in Eaglesoft; PA will pick it up on next sync. (PA-0035 · 23:02; on about 24 calls)  
> * **Notes entered in PA/Adit write back to the Eaglesoft patient journal/communication note, and PA reads notes written in Eaglesoft.**  
>   Ask Adit should: State that notes sync both ways with the Eaglesoft journal, subject to the sync delay. (PA-0007 · 19:22; on about 23 calls)  
> * **Appointments scheduled from PA write into the Eaglesoft appointment book within about 2-4 minutes.**  
>   Ask Adit should: State the expected writeback window so users do not re-book when they don't see it immediately. (PA-0025 · 06:06; on about 21 calls)  
> * **PA cannot identify appointment type, scheduled production, or hygiene reappointment when ADA procedure/treatment codes are missing on the Eaglesoft appointment; the appointment may show as uncategorized.**  
>   Ask Adit should: Warn that missing codes cause undercounts and uncategorized appointments; ask the practice to add codes in Eaglesoft. (PA-0036 · 00:20; on about 21 calls)  
> * **Pending claims appear in PA only if the claims were submitted through Eaglesoft; claims submitted via third-party websites or outsourced billing are not tracked.**  
>   Ask Adit should: State the limitation and point to the Eaglesoft claim workflow; do not claim coverage of third-party claims. (PA-0167 · 19:54; on about 17 calls)

### **Eyefinity**

> * **Adit assumed the practice was on Revolution, but the practice corrected that it is on Eyefinity; this wrong-PMS assumption delayed the fix.** **Needs confirmation**  
>   Ask Adit should: Confirm the PMS before mapping or answering; use Eyefinity for this practice. (PA-0614 · 03:37)  
> * **A missing PMS account ID blocked PA login even with a valid new password.** **Needs confirmation**  
>   Ask Adit should: Warn that login can fail if the PMS account ID is missing; check Eyefinity account setup before treating password as the issue. (PA-0614 · 04:01)

### **OfficeMate**

> * **PA cannot show scheduled production unless treatments/codes are associated to appointments in OfficeMate and appointment types have dollar amounts. If the code or amount is only added during or after the visit, PA cannot show that production in advance; appointment types from the scheduler may not automatically transfer, and sync may take time after dollar amounts are added.** **Needs confirmation**  
>   Ask Adit should: State that scheduled production depends on OfficeMate appointment-type dollar amounts and code-to-appointment associations; warn about sync delay and point to OfficeMate scheduler setup. (PA-1451 · 08:23; on about 2 calls)  
> * **PA 'inactive' is defined as 30 months by time frame, while OfficeMate inactive is a patient status change set in OfficeMate, not in PA. These can disagree, so a patient inactive in OfficeMate may not be inactive in PA and vice versa.** **Needs confirmation**  
>   Ask Adit should: State the PA inactive definition is time-based 30 months; do not equate it with OfficeMate inactive status without checking. (PA-0484 · 35:19; on about 2 calls)  
> * **PA pulls capture values from OfficeMate; if those numbers are not set up in OfficeMate, PA cannot pull or show them. Mapping preferences that were supposed to appear are not appearing; mapping service categories show only optical, and medical services are not appearing under CAPTURE.** **Needs confirmation**  
>   Ask Adit should: Decline to show capture/medical service mapping until OfficeMate capture numbers and service categories are set up; Adit needs a remote session to inspect the OfficeMate setup. (PA-1427 · 07:45)  
> * **PA insurance keyword search for VSP returned about 5 patients while the OfficeMate report returned the full list; cause unknown. In OfficeMate VSP is usually stored as a secondary insurance because it is a vision plan, so primary-insurance filtering may not find those patients; some patients' primary insurance shows as 'XXX Vision Service Plan', and the practice does not know what XXX means.** **Needs confirmation**  
>   Ask Adit should: Do not treat PA VSP search as complete; point to the OfficeMate VSP report and flag the XXX primary-insurance label for billing confirmation. (PA-0670 · 08:05)  
> * **PA will show missing or inaccurate OfficeMate data as-is (garbage in, garbage out).**  
>   Ask Adit should: Warn that PA output is only as good as OfficeMate data; check OfficeMate source when PA numbers look wrong. (PA-0944 · 48:44)  
> * **OfficeMate has no pending-pickup field; Adit reads order status instead, and the pending-pickup filter did not work as expected.** **Needs confirmation**  
>   Ask Adit should: Do not rely on pending-pickup filter; use order status in OfficeMate/PA or decline pending-pickup queries. (PA-0624 · 27:36)

### **Open Dental**

> * **PA reads Open Dental on a short interval (about 2-5 minutes; some calls say up to 2-3 hours or variable 5-10 min), so recent Open Dental changes may not appear until the next sync plus refresh; nothing is real-time and today's numbers keep changing.**  
>   Ask Adit should: State the sync interval and that PA pulls from the Open Dental backend; tell the user to refresh or wait for the next sync before treating a number as final, and warn about possible staleness. (PA-0383 · 66:22; on about 112 calls)  
> * **Appointments created or scheduled in PA write back to the Open Dental appointment book within a few minutes (commonly 2-4 minutes); they may not appear immediately and appointment logs show sync time/status.**  
>   Ask Adit should: State the write-back delay and that the appointment log shows pending/sync status. (PA-0391 · 14:15; on about 68 calls)  
> * **Broken appointment/cancellation/no-show reporting depends on staff breaking the appointment in Open Dental and selecting a cancellation or no-show reason; moving/rescheduling alone or deleting the appointment is not captured, and without the mark PA may show zero or miss it.**  
>   Ask Adit should: State the required Open Dental workflow (break and select a reason) and warn that PA cannot infer a broken appointment from a move or an unset reason; if not marked, decline to report a count and point to the Open Dental broken-appointment report. (PA-0409 · 42:16; on about 44 calls)  
> * **Notes, messages, emails, and phone calls sync both ways between PA patient card and Open Dental notes/journal/communication log, typically within a few minutes; PA reads past Open Dental journal notes.**  
>   Ask Adit should: State that notes write both ways and give the expected delay before they appear in the other system; warn the Open Dental category may not be controlled from Adit. (PA-0423 · 09:51; on about 44 calls)  
> * **Patient personal/demographic information cannot be edited in PA; changes (phone, email, recall due date, inactivation) must be made in Open Dental and then appear in PA after sync.**  
>   Ask Adit should: Decline edits in PA and direct the user to change the information in Open Dental. (PA-0418 · 16:25; on about 37 calls)  
> * **PA production is calculated differently from Open Dental production, so the two numbers will not match; PA shows gross and net, and its scheduled production uses a different basis than the Open Dental operatory view, which shows adjusted production.**  
>   Ask Adit should: State the metric each side is showing (scheduled vs adjusted; gross vs net) and point the user to the matching report rather than treating the difference as an error. (PA-0388 · 16:55; on about 20 calls)

### **RevolutionEHR**

> * **Revolution does not provide a direct scheduled-production data point; PA estimates it through manual appointment-type mapping, including usual/customary charges, and may need a resync after mapping. Until mapping is complete, scheduled and expected future production are not accurate.**  
>   Ask Adit should: State this limitation; do not present scheduled production as pulled from Revolution; point users to the mapped PA estimate and note resync. (PA-0500 · 10:40; on about 7 calls)  
> * **PA data may lag Revolution: PA reads/refreshes every 4–5 minutes, backup sync runs only once or twice a day, day-of status can lag, cloud EHR load can take longer, and forms import can take about 10 minutes depending on connection.**  
>   Ask Adit should: Warn about staleness; do not treat PA as real-time; suggest checking Revolution for current day-of status. (PA-0845 · 09:22; on about 4 calls)  
> * **PA extension/sync is tied to the workstation/user login; shared computers can create new workstation IDs and break sync continuity, and PA may miss work if a different user logs into Revolution on that computer. PA may show an appointment in progress while Revolution shows it completed until the extension/workstation connection is fixed.**  
>   Ask Adit should: Warn users to check the extension/workstation connection on that device and log in consistently; treat appointment status as unreliable until fixed. (PA-0497 · 49:43; on about 3 calls)  
> * **Medical production may not appear because medical codes are not included in the ledger and diagnosis codes are not added in Revolution when billing; production categories can miss medical dollars.**  
>   Ask Adit should: State the mapping/ledger dependency; point to Revolution ledger/diagnosis entry for medical production; do not claim PA captures all medical dollars. (PA-0429 · 26:42; on about 3 calls)  
> * **Conflict: Lost patients are defined either as last 30 months without a visit or inactive status in Revolution (PA-0652 18:13) or as no appointment in the past 18 months, with inactive patients also showing in the group (PA-1368 09:14); loss due to status change comes from Revolution when marked inactive (PA-0998 25:40).** **Needs confirmation**  
>   Ask Adit should: Ask Adit which definition is correct before answering; present both variants if needed. (PA-0652 · 18:13; on about 3 calls)  
> * **PA can show the EHR as disconnected and no appointment data syncing with Revolution; one office showed connected but had not synced since April 7, and no appointments/data for today were visible.**  
>   Ask Adit should: Warn that connection status may be stale; check Revolution directly and the sync task before using appointment data. (PA-0476 · 02:11; on about 2 calls)

### **Tracker**

> * **Sync/update timing for Tracker is not instant and reports conflict: Adit says 1–2 minutes, practice says 2–3 minutes; another says PA-to-Tracker 3–4 minutes and data sync 4–5 minutes. Specialist changes propagate overnight, and a cloud backup/manual refresh may be needed.** **Needs confirmation**  
>   Ask Adit should: Warn about staleness and state the sync window; if exact timing matters, check current sync status or rerun after the longest reported delay. (PA-0010 · 06:20; on about 5 calls)  
> * **PA depends on Tracker procedure/treatment codes and structured fields for production, forecasting, appointment type and recall; codes are added while scheduling or borrowed from treatment plans, and free-text reasons are not recognized. Missing codes leave blanks or misclassification.**  
>   Ask Adit should: State the code requirement; if codes are missing, point to the Tracker treatment plan or closed appointment detail rather than estimating production or appointment type. (PA-0013 · 36:24; on about 5 calls)  
> * **Production/count figures can differ from Tracker/practice totals (e.g. PA \$3,107 hygiene and \$2,942 restorative vs practice about \$2,800 hygiene and \$3,094 restorative; 106 vs \~985). Insurance details may be missing member ID/group number, so PA may show only ledger-based figures.** **Needs confirmation**  
>   Ask Adit should: Do not average the two totals; state which source is used and ask the practice to verify against the Tracker report or ledger/insurance setup. (PA-0013 · 46:07; on about 3 calls)  
> * **PA reads the scheduled appointment book, not Tracker pending appointments/appointment manager list; pending appointments are not distinguished from fully unscheduled. Unscheduled counts and patient lists can differ and include patients who already have a pending appointment.** **Needs confirmation**  
>   Ask Adit should: State that pending appointments are not treated as scheduled; warn that unscheduled lists may include pending patients, and ask the practice to verify in Tracker's appointment manager. (PA-0013 · 22:08; on about 2 calls)  
> * **PA has missed completed/closed appointments from Tracker operator review (e.g. 29 June hygiene) and appointments scheduled in Tracker not read by operatory review. This makes recall work go back and forth.** **Needs confirmation**  
>   Ask Adit should: Warn that completed/closed appointment data may be incomplete; point to the Tracker operator review or closed appointment report for verification. (PA-0013 · 41:23; on about 2 calls)  
> * **PA only shows data in Tracker; data in other systems is not included, and pending claims are tracked only if claims are submitted through Tracker, not a third-party website.**  
>   Ask Adit should: State the source limitation; for third-party claims or outside data, decline or point to the external system's report. (PA-0021 · 04:58; on about 2 calls)

## **What PA cannot do today**

Requests practices raised that PA does not meet. Ask Adit should say so plainly rather than approximate.

> * Filter patient lists by insurance (primary/secondary, carrier, group number, employer, vision vs medical). *(Patient lists)* (PA-0862 · 05:48; on about 9 calls)  
> * Add custom procedure codes (including codes that do not start with D, office/S codes, and codes without ADA equivalents) and mark them as hygiene or restorative so they can be tracked and filtered in reports. *(Dental practices on Dentrix, Eaglesoft, Open Dental, Curve Dental, Tracker, RevolutionEHR, and all practices)* (PA-0642 · 10:25; on about 8 calls)  
> * Auto-pull provider hours from the EHR instead of manual entry; practice wants provider hours linked to schedules and goals. *(Provider hours)* (PA-0865 · 56:49; on about 8 calls)  
> * Provider hours that vary week to week (some Mondays, late Thursdays, every-other-week, holidays) without manual per-day edits; ideally synced automatically from the EHR. Also wanted: bulk entry of hours for several months at once, hours remembered rather than re-added, retroactive/historical hours, and hours pulled directly from the EHR. *(All practices)* (PA-1650 · 50:43; on about 8 calls)  
> * Practices want recurring provider schedule rules like 'every fourth Friday' or 'every other Friday' instead of manually adding each date. *(Dental; Dentrix; Eaglesoft; Open Dental)* (PA-0447 · 64:11; on about 8 calls)  
> * Practices want PA production numbers to reconcile/match their own EHR reports so PA can be relied on for end-of-day or overall reporting. *(Dental; Open Dental; Dentrix Ascend)* (PA-0126 · 41:16; on about 8 calls)  
> * Practices want to send text messages (including bulk texting) directly from reports or patient lists. *(Dental; Open Dental, Dentrix, Eaglesoft)* (PA-0286 · 22:58; on about 8 calls)  
> * Practices want to assign the same follow-up to more than one team member. *(Dental; Eaglesoft; ClearDent; Dentrix; Open Dental)* (PA-0501 · 32:47; on about 8 calls)  
> * Practices want to schedule or change appointments from within PA or the mobile app instead of going back to the EHR. *(Dental; Open Dental, Eaglesoft, Dentrix)* (PA-0278 · 15:12; on about 8 calls)  
> * Schedule or reschedule appointments directly from Adit/PA (desktop and mobile), including from patient lists. *(Scheduling)* (PA-0906 · 01:48; on about 7 calls)  
> * Reconcile PA numbers with the PMS (production, collections, AR, pending, new-patient counts, overdue recare) so they match. *(Reconciliation)* (PA-0864 · 11:38; on about 7 calls)  
> * Mark patients inactive from within PA (rather than in the EHR) to clean up the active patient count. *(All practices)* (PA-1169 · 73:24; on about 7 calls)  
> * Net scheduled/future production that accounts for expected insurance write-offs and adjustments, shown consistently across dashboards; morning huddle should show adjusted/net production (including membership write-offs) rather than gross, pulling the Open Dental adjustments column into scheduled/forecasted production. *(All practices)* (PA-1650 · 12:04; on about 7 calls)  
> * Practices want the insurance portion or remaining benefits shown alongside the patient AR balance. *(Dental; Open Dental, Dentrix)* (PA-0382 · 07:17; on about 7 calls)  
> * Practices want a color symbol or indicator on the next appointment showing whether it is restorative or hygiene. *(Dental; Dentrix, Eaglesoft, Open Dental)* (PA-0265 · 84:42; on about 7 calls)  
> * Practices want to enter provider hours further ahead (beyond 6 months) or apply one provider's hours as a template, and want 15-minute increments instead of half-hour. *(Dental; Open Dental, Eaglesoft)* (PA-0289 · 26:18; on about 7 calls)  
> * Practices want automatic goal adjustments for vacation, closed days, or irregular schedules, rather than manual recalculation. *(Dental; Eaglesoft, Dentrix Ascend)* (PA-0403 · 12:48; on about 7 calls)  
> * Practices want to print or export patient lists and reports directly (e.g., as PDF or in on-screen format), rather than exporting to Excel or taking screenshots. *(Dental; Dentrix, Open Dental)* (PA-0289 · 20:51; on about 7 calls)  
> * Practices want to add custom or non-ADA procedure codes into PA and categorize them under hygiene/restorative. *(Dental; Eaglesoft, Open Dental, Tracker)* (PA-0323 · 42:48; on about 7 calls)  
> * Practices want to edit patient information directly in PA instead of only in the EHR. *(Dental; Open Dental; Eaglesoft; Dentrix; ClearDent)* (PA-0447 · 20:00; on about 7 calls)

## **What a practice can do from PA**

Beyond reading a number. Ask Adit would hand these off (build a list, send texts, create follow-ups).

> * Create, save, refresh, edit, sort, rename, hide, delete, and reuse custom patient lists with filters (insurance, balance, treatment code, provider, last contacted date, status, date range, etc.), optionally from a template or prebuilt list; lists can be dynamic and roll forward daily. *(All practices)* (PA-0602 · 60:41; on about 668 calls)  
> * Send bulk/mass SMS, email, review requests, appointment requests, form requests, reminders, recall reminders, payment requests, or campaigns from a saved patient list, including scheduled sends and deselecting individual recipients. *(All practices)* (PA-0602 · 42:42; on about 591 calls)  
> * Set or edit practice, provider, and per-day production/collection/new-patient goals under Preferences \> Set Goals, including day/week/month, per-provider goals, weekly templates, bulk set, advanced settings, and auto-calculate. *(All practices)* (PA-0602 · 15:40; on about 556 calls)  
> * Click a patient name to open the patient card and view family, ledger, benefits, claims, notes, communication, treatment history, last/next visits, forms, and unscheduled production; send messages, assign forms, and manage opt-outs from it. *(All practices)* (PA-0606 · 11:19; on about 555 calls)  
> * Schedule an appointment directly from PA by double-clicking empty white chair time in Operatory View, from Opportunity Review/Morning Huddle, or via Add Appointment in the PMS; it writes back to the EHR. *(All practices)* (PA-0605 · 101:00; on about 411 calls)  
> * Add providers, hygienists, and doctors, map/assign operatories, categorize provider type, and set provider working hours/weekly templates in Preferences/Team Settings (including bulk set time off) to enable provider and operatory reporting. *(All practices)* (PA-0602 · 65:40; on about 395 calls)  
> * Create, assign, complete/reschedule, and automate follow-ups with type, due date, notes, and attempts; automation is configured under Preferences by category/type, timeframe, and assignee. *(All practices)* (PA-0606 · 19:12; on about 395 calls)  
> * Assign, send, or push patient forms via text, email, or push to an in-office device/tablet (Adit Patient Form app/iPads), including resending forms. *(All practices)* (PA-0606 · 11:55; on about 329 calls)  
> * Add notes in the patient card that sync/write back to the EHR journal (Dentrix, Open Dental, Eaglesoft, Curve). *(All practices)* (PA-0610 · 11:03; on about 328 calls)  
> * Click blue report titles/links, KPI widgets, figures, or data points in Morning Huddle and dashboards to drill into the underlying patient-level report. *(All practices)* (PA-0606 · 30:15; on about 316 calls)  
> * Export or download reports and patient lists to Excel/CSV or print, requiring owner's access. *(All practices)* (PA-0602 · 31:16; on about 312 calls)  
> * Book additional/follow-up/refresher PA/Morning Huddle training from the in-app Schedule Training icon/link or Morning Huddle 'schedule training' link. *(All practices)* (PA-0602 · 71:47; on about 304 calls)  
> * Manage patient communication opt-in/opt-out and reminder preferences from Patient Card \> Patient Information \> Communication Preferences \> Manage. *(All practices)* (PA-0611 · 15:02; on about 290 calls)  
> * Add a patient to the ASAP list from the patient card and send mass text/email to fill cancellation openings. *(All practices)* (PA-0682 · 18:30; on about 261 calls)  
> * Filter reports by date range, provider, patient/visit type, procedure code, status, or appointment type; toggle gross/net; and export. *(All practices)* (PA-0605 · 73:16; on about 237 calls)

## **Benchmarks quoted on calls**

Numbers the PA team gave as typical. They need confirming before Ask Adit repeats them.

> * Most practices use 18 months as the churn/inactive timeframe; patients not seen in 18 months are considered churned. *(Dental; all EHRs)* (PA-0003 · 08:15; on about 64 calls)  
> * Practices prioritize collections on patient/insurance balances pending 90+ days; anything over 90 days is a red flag. *(Dental; all EHRs)* (PA-0006 · 46:36; on about 50 calls)  
> * Unscheduled hygiene count should go down to zero by the end of the day (or Monday) if patients are rescheduled before leaving. *(Dental; all EHRs)* (PA-0035 · 13:36; on about 41 calls)  
> * Hygiene reappointment rates in the high 80s to low 90s are considered good; 95% is the common goal. *(Dental; all EHRs)* (PA-0106 · 32:28; on about 36 calls)  
> * Adit's default production goal is \$6,000 per day for new accounts unless changed. *(Dental; multiple EHRs)* (PA-0262 · 16:28; on about 24 calls)  
> * Churn/inactive patient classification default is 18 months; most practices use 18 months, configurable to 12 or 24 months. *(Dental)* (PA-0551 · 24:43; on about 24 calls)  
> * Practices usually focus on 90+ days pending dollar amount for collections, not 30-day amounts. *(Dental; all EHRs)* (PA-0007 · 42:21; on about 20 calls)  
> * Unscheduled hygiene numbers should go down to zero by end of day as patients are rescheduled. *(Dental)* (PA-0573 · 11:58; on about 16 calls)  
> * Hygiene reappointment rate around 90-95% is considered good/great; 95% is a benchmark. *(Dental)* (PA-0554 · 20:20; on about 16 calls)  
> * Adit sync with the EHR normally takes 2-3 minutes (or 3-4 minutes in some cases); sync is set every 5 minutes. *(Dental; multiple EHRs)* (PA-0058 · 19:25; on about 12 calls)  
> * Unscheduled hygiene count (and unscheduled family members) is a daily opportunity target and should go down to zero by end of day; exceptions should be reviewed. *(Dental/Orthodontics practices (all EHRs))* (PA-1322 · 09:00; on about 12 calls)  
> * New patient counts of 20-30 per month are good; 50-70 is ideal for growth. *(Dental; all EHRs)* (PA-0065 · 19:31; on about 8 calls)

## **For the PA team to confirm**

Definitions the calls disagree on, most discussed first. Each needs one answer before Ask Adit uses it.

> * **Collections dashboard · Collections pending**: most say it is as-of-today with no date filter. (PA-0012 · 31:02; on about 236 calls)  
> * **Morning Huddle · New patient count/flag (NP)**: New patient definition differs by system: some say any patient coming for the first time; PA-1036 31:28 says a patient is new if no completed appointment exists in the past (not necessarily the same as ChiroTouch); PA-1048 35:45 says if a patient has any appointment in the past, not new. (PA-0007 · 10:10; on about 169 calls)  
> * **Patient card · EHR balance / balance due**: Some sources say the EHR balance tab shows insurance outstanding too; others say the balance shown excludes insurance. Some say it is the family balance, not the individual patient. (PA-0006 · 16:31; on about 159 calls)  
> * **Patient card · Unscheduled production**: Practice in PA-1346 11:22 questioned accuracy; Adit replied only active treatment plans are pulled. (PA-0006 · 18:01; on about 159 calls)  
> * **Collections dashboard · Aging buckets**: Bucket labels vary: some calls omit 61–90 or use 120-day buckets; a few show 0–13/30–60/90+ or 1–61/60/1–90/90+. Also, most say 30 days/past 90 days; some say 30/120, 30/150, 0-30/31-60/61-90/90+, 30/60/90/90+, or 30/31-60/past 90\. (PA-0007 · 42:21; on about 146 calls)  
> * **Patient Lists · Unscheduled treatment list**: Practice said unscheduled treatment can still include treatment the patient is scheduled for an appointment on, while Adit described it as excluding scheduled treatment. (PA-0002 · 15:01; on about 119 calls)  
> * **Morning Huddle · Sync timing**: Dentrix syncs every two minutes (PA-1345 20:38, PA-1400 15:39); Open Dental and Eaglesoft sync every 4–5 minutes; one Dentrix call says 4–5 minutes (PA-1421 04:33). (PA-0006 · 07:29; on about 98 calls)  
> * **Patient Lists · Popular lists (prebuilt, Adit-created)**: Count of Adit prebuilt lists differs: one source says 16 popular lists, another says 16 lists created/saved by Adit; the exact named set varies across calls. (PA-0899 · 19:21; on about 96 calls)  
> * **Collections dashboard · Collections dashboard**: Some calls say the dashboard shows only aging figures or does not show 90-day collection %, AR aging, or claims aging. (PA-0945 · 37:08; on about 77 calls)  
> * **Preferences and mapping · Provider hours weekly template / 6-month apply**: both appear across calls. (PA-0014 · 24:02; on about 70 calls)  
> * **Collections dashboard · AR aging / past due AR**: Some calls say AR aging excludes insurance and is patient-side only; others say it splits amounts owed by insurance versus patients. (PA-0014 · 13:28; on about 63 calls)  
> * **Reports · Collections report**: Practice wants collections tied to procedure day, while PA currently matches the EHR when the report uses insurance payment date. (PA-0616 · 09:04; on about 52 calls)  
> * **Collections dashboard · Collection percentage / ratio / goal**: One call says 90-day collections is defined by title and not controlled by date range; another says it is for the selected time frame. Also, goal is dollar amount but PA shows percentage even with blank/zero. (PA-0042 · 69:18; on about 40 calls)  
> * **Growth dashboard · Active patient base**: Window differs by industry (18 months dental vs 30 months optometry); (PA-0507 · 06:05; on about 36 calls)  
> * **Collections dashboard · Negative / credit amounts**: Optometry Crystal PM call reported negative shown where a positive was expected; Adit called it a display issue. (PA-0053 · 17:14; on about 33 calls)  
> * **Yesterday / past-day Huddle · Hygiene reappointment filter / hygiene reappointment**: One call disagrees on whether this metric is hygiene-specific. (PA-0006 · 22:31; on about 30 calls)  
> * **Yesterday / past-day Huddle · Gross/net production toggle**: Default varies: some calls say gross is default, others say net is default; one call says yesterday defaults to net. (PA-0038 · 26:33; on about 30 calls)  
> * **Provider Performance dashboard · Production per visit**: (PA-0007 · 26:19; on about 30 calls)  
> * **Goals · Advanced settings / weekly template**: One call says changing a production per day goal updates backdated goals too; others say changes apply from the next working day and past dates are unchanged. (PA-0069 · 25:42; on about 30 calls)  
> * **Goals · Default production goal and customization**: Default amount and origin differ by account/call; one Eaglesoft call says goals are not set by default; later calls report \$15,000/day standard. (PA-0001 · 09:42; on about 30 calls)  
> * **Hygiene Performance dashboard · Hygiene Performance dashboard**: Dashboard logic may include unexpected appointments because it is not specific to the categories used in Adit. (PA-0013 · 68:57; on about 30 calls)  
> * **Other · Sync timing / cadence**: Calls disagree on timing: 2–3 minutes, 3–4 minutes, 4–5 minutes, 5 minutes, overnight for Open Dental, hourly/daily for production/collections/ledger, and periodic/not real-time for Dentrix Ascend. (PA-0015 · 12:10; on about 30 calls)  
> * **Operatory view · Appointment write-back sync time**: Sync times vary: 2-3 minutes, 3-4 minutes, 1-2 minutes, and up to 2 minutes are all mentioned. (PA-0540 · 13:36; on about 30 calls)  
> * **Hygiene Performance dashboard · Hygiene reappointment**: Definition varies by view/filter: some views count only hygiene-to-hygiene; others count all patients and check for a future hygiene appointment; 'all' vs 'hygiene' appointment type changes the count; (PA-0003 · 10:37; on about 29 calls)  
> * **Other · ASAP list**: Write-back differs: Dentrix refs say adding from Adit does not reflect in Dentrix; Open Dental refs say patients can be added in both Open Dental and Adit. One call says ASAP is not part of PA analytics and is a separate module (Engage). (PA-0086 · 24:11; on about 29 calls)  
> * **Provider Performance dashboard · Date range filter and provider dashboard date range**: General date range supports month/year/historical, but provider dashboard date range is reported as week/month only with custom periods needing reports. (PA-0113 · 12:40; on about 28 calls)  
> * **Schedule view · Scheduled production**: PA scheduled production is described as gross from procedure codes/fees; Dentrix can show net post adjustments, and the practice says their Dentrix figure is gross. Open Dental fee schedule can also affect amounts. (PA-0036 · 00:20; on about 28 calls)  
> * **Provider Performance dashboard · Diagnosis, treatment acceptance, and cases**: (PA-0012 · 19:22; on about 26 calls)  
> * **Goals · Auto-calculate overall practice goal from provider goals**: Some calls say the overall practice goal must be set manually and provider goals do not sum; others say auto-calculate sums provider goals, and one says auto-calculate field not supposed to be present. (PA-0029 · 04:12; on about 26 calls)  
> * **Goals · Churn/inactive threshold and reactivated goal**: Dental defaults are 18 months; optometry defaults are 30 months (Crystal PM/OfficeMate); one practice said goals considered a patient active for 24 months or less. Other calls report 6-month default or 12/18/24 options. (PA-0002 · 34:56; on about 26 calls)

## **Call register**

Every call cited here is listed in the companion document **Ask Adit: PA call register**, with its practice and Aria thesis, CRM deal, Avoma recording and who spoke from Adit. A citation here opens the recording directly.