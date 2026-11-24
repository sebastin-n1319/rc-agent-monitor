# Tech Support Portal: T1 Training Guide

For T1 SMEs and Team Leads. This guide goes with the four training videos, one per module. Every example in it was run on the live portal on 19 Nov, read only, except the notification test, which was published on Beta to a dummy channel. Ticket numbers are real so you can open them in Desk and compare.

# **What the portal is for**

The Tech Support Portal (techsupport.aditadv.com) puts the checks T2 and Engineering used to run behind an escalation into T1's hands. Each module answers one question a client asks us every day, using the client's own IDs, while the client is still on the call.

* Notification Dashboard: are notifications reaching this practice, and if not, where do they stop?  
* Pozative Dashboard: what is Google actually returning for this location's reviews and opening hours?  
* Package Support: what package and add-ons does this location have, and which modules should they see?  
* Form Investigation Tool: why did this submitted patient form not import, or import to the wrong place?

# **How it helps T1**

In the last 90 days, by subject keyword, we had 336 notification tickets (114 now with T2 or T3, median 16.3 business hours to resolve), 247 form import tickets (161 with T2 or T3, median 25.4 hours) and 62 Google review or hours tickets (median 36.4 hours since October). Ticket 398360, a Google hours complaint, took about 12 days. These numbers are directional, but the pattern is clear: much of this wait is time spent getting an answer the portal now gives in seconds.

The goal is not to stop escalating. It is to escalate less often, and when we do, to hand over proof: the IDs, the result, the verdict and the raw data, so T2 or T3 starts where we stopped instead of starting over.

# **Before you start**

* Sign in with your Adit Google account. If a module says the sign-in expired, sign out of the portal and back in.  
* Check the environment on every module. Live is for real client tickets. Beta is for practice.  
* Keep the Desk ticket open beside the portal. Every module has a copy or export button for the ticket.  
* Never paste patient details into the portal or into a ticket note copied from it. The portal only needs IDs and URLs.

# **The training videos**

There is one short video for each module, about four minutes each, with on-screen captions. They are in the same Drive folder as this guide: Notification Dashboard, Pozative Dashboard, Package Support and Form Investigation Tool. Watch the video first, then use this guide on a real ticket.

# **Module 1: Notification Dashboard**

Use it when a client says appointment reminders, chat alerts or other desktop notifications are not showing up. It connects you to the exact notification channel of that practice and user, lets you send a test of the same type the client complained about, and counts what happened to it.

## **Step 1: Get the IDs**

Expand "Where do I find these IDs?" in the Connection panel. You need three:

* Location ID: Adit App, Settings, select the client location. The last ID in the URL.  
* User ID: same page, select the user missing notifications. The last ID in the URL.  
* Organization ID: DevTools, Network tab, the checklogin call. Its response holds org\_id.  
* On a screen share, all three are also in Local Storage under desktop\_app\_notification\_v2. In the desktop app, press Ctrl \+ Shift \+ L.


*Connection panel with the ID help expanded.*

## **Step 2: Connect and test**

1. Pick the environment. Live for a real ticket, Beta for practice.  
2. Paste the Organization ID (required), then Location and User ID to watch that exact user.  
3. Click Connect / Subscribe. Both pills turn green: WebSocket connected and Subscription active.  
4. Find the notification type the client reported, for example Appointment Reminder, and double-click it. A single click only selects it.  
5. The popup appears exactly as it would in the desktop app. Ask the client whether they saw it too.


*Connected and subscribed. The publish buttons are unlocked.*


*A test notification arriving on the Beta practice channel.*

## **Step 3: Read the result**

The counters read X attempted, Y confirmed by the publisher and Z received by a listener. If all three match, delivery on our side is working for that channel. If X is higher than Y, the message was never confirmed. If Y is higher than Z, it was confirmed but not received. Export the trace for the ticket either way.

* Portal did not receive it, client did not either: the issue is on our side. Attach the trace and escalate to Engineering.  
* Portal received it, client did not: most likely the client's network or device. Tell them, and collect details before escalating.  
* Both received it: the system is working. If the client still reports gaps, collect more examples before escalating.


*X, Y and Z counters with the three-row playbook.*

## **Step 4: Use it safely**

On Live, every test you send pops up at the client's front desk. Publish only while they are on the call with you. Never use Rapid Publish or the Duration Test (which can run up to 48 hours) on a client channel; those are for Beta only. Click Disconnect before you close the ticket.


*Rapid Publish and Duration Test controls. Beta only.*

# **Module 2: Pozative Dashboard**

Use it when a client says their Google reviews are missing or wrong, or Google shows the wrong opening hours. It calls the same Google endpoints Adit uses for that location and shows the answer in plain English.

## **Step 1: Get the IDs**

Expand "Where do I find these IDs?" under Lookup. Location ID comes from Adit App, Settings, the last ID in the URL. Organization ID comes from the checklogin call in DevTools. Reviews need only the Location ID; business hours need both. Keep the environment on Live for real tickets. A 404 result usually means the wrong environment.


*Lookup panel with the ID help expanded.*

## **Step 2: Run the check**

Paste both IDs and click Fetch all. Reviews only and Hours only check one side if you need to. The header fills in with the review count, average rating and number of hours rows, and the What this means card gives a verdict with the next step. In our live example, a dental practice, everything came back normally: 151 reviews at an average of 5, seven hours rows.


*IDs pasted, ready to fetch.*


*After Fetch all: header counters and the What this means verdict.*

## **Step 3: Read the results**

For reviews, HTTP 200 with API status true means Google answered. Compare the rating and count with the client's public listing; if they differ, Google is not returning fresh data and the What this means card says what to do. For hours, the Open or Closed now badge uses your own browser clock, not the client's timezone, so check before you quote it. Google stores a closed day as 00:00 to 00:00, and Closed in the table is exactly what the client's listing shows.


*Review aggregates.*


*Opening hours table with closed days.*

## **Step 4: Hand it over**

Copy cURL and Copy response give T2 the exact call and answer, so nobody has to rerun it. The cURL leaves your Google sign-in token as a placeholder on purpose; it is yours and it expires. Copy ticket summary puts the IDs, results and verdict on your clipboard for the Desk ticket, and Export snapshot saves a file to attach. Clear results before the next client.


*Raw data with Copy cURL and Copy response.*

# **Module 3: Package Support**

Use it when a client asks what their package includes, or why they cannot see a module. It has three tabs: Fetch Package Details, Module Access and Modules & Packages.

## **Step 1: Look it up**

On Fetch Package Details, choose Deal ID for one location or Account ID for every location on the account. Paste the ID from the CRM deal or account and click Fetch Existing Package. Check the environment says Live.


*Fetch Package Details by Deal ID.*

## **Step 2: Read one location**

A Deal ID lookup returned one location with Adit Core as the primary package, the Adit Voice add-on and 14 modules granted. Confirm the location name matches the client on the call. If the module they are asking about is not in the list, it is not part of their package. If it is listed but missing in the app, troubleshoot, then escalate with this screen as proof.


*One location: package, add-ons and modules granted.*

## **Step 3: Every location on the account**

An Account ID lookup returned two locations, each with its own Deal ID. Here both have the same package and modules. When they differ, that usually explains a "works at one office but not the other" ticket.


*Lookup by Account ID with two locations.*

## **Step 4: Module Access, the what-if calculator**

Pick a primary package and tick add-ons to see the final module list. Adit Core alone grants 13 modules. Adding Adit Voice and AI Front Desk brings the total to 15; the highlighted chips, Call Tracking and AI Agent, come from the add-ons.


*Module Access with two add-ons selected.*

## **Step 5: Modules & Packages**

The catalog of every package and add-on and the modules each grants, with a filter and All, Primary and Add-Ons views. Some rows are currently identical, for example the two verification add-ons. Confirm with the CSM before quoting a difference between them to a client.


*Modules & Packages catalog.*

# **Module 4: Form Investigation Tool**

Use it when a client says a submitted patient form did not import, landed in the wrong folder, or did not auto import. It replays the import for that one submission and ends with a verdict and next steps. The form details are fetched for that run only and never stored.

## **Step 1: Get the form URL**

6. Impersonate or log in to the client's account in Adit.  
7. Go to Patient Form, then Submitted.  
8. Open the form the client is reporting and copy the URL from the address bar. It looks like app.adit.com/patient-form/submissions/detail/\<location\>/\<form\>.  
9. Paste it into Form submission URL. Organization, Location and Form ID resolve when you investigate.  
10. Pick the reported issue and click Investigate.


*Form URL steps, from ticket 407463\.*

## **Step 2: Pick the issue**

There are three: Form Stuck in Importing, Document Synced to Incorrect Folder, and Auto Importing. Each runs only the checks it needs; the progress bar shows which ran and which were skipped. Copy report and Download report save the result for the ticket.

### **Form Stuck in Importing**

Example ticket 407463: no issue found in the last sync, final action further investigation. Next steps: check the Sync Error Log for errors during syncing, attach the log or a screenshot to the ticket, and assign to T3.


*Stuck in Importing verdict and next steps.*

### **Document Synced to Incorrect Folder**

Example ticket 429023: the tool names the folder the form should have landed in, here Patient Information. Check the client's EHR. If the document is in that folder, the mapping is correct and the ticket goes back to the client. If it is in a different folder, assign to T3.


*Expected folder identified.*

### **Auto Importing**

Example ticket 419160: all eight checks passed and the auto-import setting was not changed after the form was submitted. When everything checks out and the client still sees the problem, escalate to T3 with the report.


*Auto Importing with all eight checks passing.*

## **Step 3: Technical details for T2**

Expand Technical details for T2 to see each step and its result. Pass means the step worked, for example login and the last sync time, which you should quote in the ticket. Skipped means the step does not apply to the chosen issue; it is not a failure.


*Technical details with passed and skipped steps.*

# **When to escalate**

The rule across all four modules is the same: run the module, attach its output, and escalate only when the verdict or playbook says so.

* Notifications: escalate to Engineering only when the portal itself did not receive the test. Attach the exported trace and the three IDs.  
* Pozative: escalate to T2 when What this means says Google or the API is failing. Attach the ticket summary, snapshot and raw data.  
* Package Support: escalate when a listed module is missing in the app after basic troubleshooting. Attach the location, package and module list.  
* Form Investigation: follow the next steps exactly. They say when to return to the client and when to assign to T3. Attach the downloaded report.

# **FAQ**

**Can I break anything by using the portal?** Pozative, Package Support and Form Investigation only read data. The Notification Dashboard can send real popups on Live, which is why you publish only while the client is on the call, and never use Rapid Publish or the Duration Test on Live.

**Which environment should I use?** Live for every real ticket. Beta for practice and training. A 404 or an empty result is often just the wrong environment.

**The module says my sign-in expired.** Sign out of the portal and back in with your Adit Google account, then run the check again.

**I cannot find the Organization ID.** In DevTools, Network tab, find the checklogin call and read org\_id from its response. On a screen share with the desktop app, Ctrl \+ Shift \+ L shows the stored IDs.

**The Pozative hours look right but the client says Google is wrong.** Compare with the public listing and get a screenshot from the client. If they disagree, Google is not returning up-to-date data; the What this means card tells you whether to reconnect the location's Google integration or escalate.

**A client sees a module that is not in their package, or the reverse.** Screenshot the Package Support result and attach it. A module listed but missing in the app is a support issue; a module not listed is a sales conversation, not a fix.

**The form tool says everything checks out, but the client insists.** That is exactly the case to escalate to T3, with the downloaded report attached so they can see all eight checks passed.

**Do I paste patient details anywhere?** No. The portal needs IDs and form URLs only. Keep patient names and details out of ticket notes copied from the portal.
