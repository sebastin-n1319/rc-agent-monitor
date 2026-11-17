# 

# Ticket Handling Practices Standard Operating Procedures for all Client-Facing Teams

# 

# **Table of Contents** {#table-of-contents}

[Table of Contents](#table-of-contents)

[Important Information](#important-information)

[CRM and Desk](#crm-and-desk)

[Accounts and Contacts](#accounts-and-contacts)

[Change the Contact on a Ticket](#change-the-contact-on-a-ticket)

[Edit a Contact](#edit-a-contact)

[Adit Teams and Ticket Routing](#adit-teams-and-ticket-routing)

[Tech Support](#tech-support)

[VoIP Support](#voip-support)

[Tech OB](#tech-ob)

[Implementation](#implementation)

[Marketing CSM](#marketing-csm)

[Other](#other)

[Taking Great Notes](#taking-great-notes)

[Ticket Priority](#ticket-priority)

[Ticket Status](#ticket-status)

[Ticket Fields](#ticket-fields)

[Ticket SOPs](#ticket-sops)

[Create a Ticket](#create-a-ticket)

[Assign a Ticket](#assign-a-ticket)

[Pick Up a New Ticket](#pick-up-a-new-ticket)

[Handle a Ticket](#handle-a-ticket)

[Follow Up](#follow-up)

[Unresponsive Client Closeout Process](#unresponsive-client-closeout-process)

[Ticket Handling Flow Chart](#ticket-handling-flow-chart)

[Edit Ticket Fields](#edit-ticket-fields)

[Escalate a Ticket](#escalate-a-ticket)

[Merge a Ticket](#merge-a-ticket)

[Split a Ticket](#split-a-ticket)

[Close a Ticket](#close-a-ticket)

[Appendices](#appendices)

[Appendix A: Ticket Audit Checklist](#appendix-a:-ticket-audit-checklist)

[Appendix B: Anatomy of a Ticket](#appendix-b:-anatomy-of-a-ticket)

# **Important Information** {#important-information}

## *CRM and Desk* {#crm-and-desk}

In CRM, there are two “levels” that we work with \- the Account level and the Deal level.  Desk pulls most of its Account and Contact information from CRM but also pushes some data to CRM.

A Deal is approximately equal to an individual office or location, while an Account is usually more like an owner or company.  An Account can have many Deals, but each Deal can only be associated with one Account.

For example, Dr. Smith owns two locations: Main Street Dental and Downtown Dental.  
In CRM, the Account is listed as Dr. Smith Dental LLC. This account has two Deals associated with it, one for Main Street Dental and one for Downtown Dental.

It is important to note that both Tickets and Contacts are linked on the Account level, not the Deal level. This means all tickets for all Deals on an account will show the same account name in Desk. This can sometimes lead to confusion, so it is best to have a habit of always specifying the location in the Subject line or the body of the ticket.

In our example, any tickets for Main Street Dental will show the Account in Desk as Dr. Smith Dental LLC. Tickets for Downtown Dental will also show under the Dr. Smith Dental LLC account.

## *Accounts and Contacts* {#accounts-and-contacts}

Every ticket must be associated with the correct Account. This allows both Adit users and clients to locate tickets quickly and easily, especially when investigating ongoing or repeat issues.

If the account is missing from a ticket, determine if the contact listed on the ticket is correct. If not, [change the contact on the ticket](#change-the-contact-on-a-ticket).

If the contact is correct but not associated with the correct account, [edit the contact](#edit-a-contact) to associate it with the correct account.

### Change the Contact on a Ticket {#change-the-contact-on-a-ticket}

The following are examples of situations when you would change the contact on a ticket:

* An email is forwarded to the Support desk from an Adit employee, so the Adit employee or team is listed as the ticket contact.  
* Voicemail or missed call notification emails that show RingCentral as the ticket contact.  
* Notification from a vendor or business partner (Google, Dropbox, calendar apps, Plivo, etc.).  
* A request from a third party or competitor on behalf of a client (in this example, you would need to reach out to the client to get permission to work with the third party, then change the contact on the ticket to the person that you got permission from).

Once you have determined that the contact on a ticket needs to be changed, edit the ticket fields. If you know the email address of the correct contact, copy it now for a faster, easier contact search. To edit the contact:

1. Click the **three dots** at the top right of the ticket detail screen.  
2. Select **Edit** from the menu.  
3. In the **Contact Name** field, click the x to clear the contact information from the ticket.  
4. Search for the correct contact using the Contact Name, Email, or Account field. Desk will suggest matches from our client database; select the correct suggestion to select it.  
5. Click the **Save** button at the bottom of the screen.

### Edit a Contact {#edit-a-contact}

1. In Desk, click on the **Contact name** to take you to the contact’s detail page.  
2. Click on any **grey info field,** as seen in the screenshot below.  
   You can also click on the three dots at the top right corner of the contact detail page, then select **Edit**.  
3. In the **Account Name** field, type in the correct account name.  Desk will suggest matches from our client database; click on the correct suggestion to select it.  
4. Update any other contact fields if needed.  
5. Click the **Save** button at the bottom of the screen.  
6. In the **Update Account** popup that appears next, select “**Yes, update**” and then click the **Submit** button.

## 

## *Adit Teams and Ticket Routing* {#adit-teams-and-ticket-routing}

### Tech Support {#tech-support}

* **TS \- Core T2** :: Assign any ticket regarding an issue with an Adit feature (other than Voice, Fax, and mobile app) to this team AFTER you have done standard troubleshooting steps, such as checking the setup and configuration and replicating the issue.  
* **TS \- Specialty** :: Practice Analytics and Adit Pay.  
* **TS \- Server Installs** : For Adit Server Application installs and reinstalls.  
* **TS Routing** :: A catch-all for tickets that need to go to a TS or VoIP team, but you don’t know which one. TS Managers will sort tickets assigned to this team to the right place.

### VoIP Support {#voip-support}

* **VoIP \- CSM** :: VoIP, fax, and mobile app issues for active clients in CSM.  
* **VoIP \- T2** :: Only VoIP team members will assign tickets to this team for further troubleshooting and dev support.  
* **VoIP \- OB** :: Phone installs and VoIP issues for onboarding clients.  
* **VoIP \- BOPS** :: Only VoIP team members will assign tickets to this team for bugs, outages, product issues, and service problems.

### Tech OB {#tech-ob}

* **TechOB Leadership** :: For manager use only.  
* **TechOB Pod 1-12** :: Tech OBs work out of pods. If you know which OB a ticket should go to, assign it to the corresponding pod.  
* **TechOB Routing** :: A catch-all for tickets that need to go to a Tech OB pod, but you don’t know which one. TechOB Managers will sort tickets assigned to this team to the correct pod.

### Implementation {#implementation}

* **Imp \- Account Setup** :: For new client account setup.  
* **Imp \- Phone Orders/Returns** :: For ordering or returning phones.  
* **Imp \- Porting** :: For phone and fax number porting.

### Marketing CSM {#marketing-csm}

* **MktgCSM Leadership** :: For manager use only.  
* **MktgCSM Pod A-J** :: Marketing CSMs and their CSR partners work out of pods. You must assign tickets for a specific Marketing CSM to the correct pod.

### Other {#other}

* **T1 Customer Support** :: Handles all T1 issues for tech-only clients, including troubleshooting.  
* **TechCSM** :: For tech-only clients who are escalated or need additional adoption support.  
* **Billing** :: For issues with Adit invoicing / billing only.

## *Taking Great Notes* {#taking-great-notes}

Every team member who works with tickets should know how to take great notes. Clear ticket notes make it easier to collaborate with other teams, ensure escalated issues are handled more quickly, and allow everyone to work more efficiently as they won’t have to repeat steps that have already been done.  In addition, leaving great notes ensures that anyone who assists this client in the future will clearly understand what has already happened.

When documenting a phone call, make sure that you include:

* The name of the person you spoke with  
* The best phone number to call them back at (in case of a call drop or to follow up)  
* The best email to reach them out, if they prefer follow-up by email  
* A summary of everything discussed on the call in as much detail as possible, including:  
  * Any questions that were asked (and the provided answers)  
  * Details about any configuration or settings that you changed  
  * Any troubleshooting steps that you performed (and their results)  
  * Any additional information that you found or that the client provided.

When taking notes about troubleshooting or an investigation, be sure to document:

* The issue as the client described it  
* Your initial suspicions or ideas about the issue  
* What steps you took to replicate the issue  
* Any settings or configuration that you checked on or changed  
* The results of each step that you tried  
* The end result of your investigation, including if further troubleshooting is needed or if you resolved the issue.

## *Ticket Priority* {#ticket-priority}

Generally speaking, every team will prioritize their tickets following the same guidelines.

1. New tickets (either in your team’s queue or assigned to you).  
2. Open tickets.  
3. Tickets that are waiting for the Adit team to take action.  
4. Tickets that are waiting for the client to take action.

## *Ticket Status* {#ticket-status}

There are seven available ticket statuses. Most teams will not use all of them.

**Open \-** An Open ticket needs immediate attention. All tickets have a status of Open when created. If a client responds to a ticket in any other status, the ticket will automatically reopen. Open should also be used when escalating or reassigning a ticket so the new owner knows the ticket needs immediate attention.

**Pending Customer \-** A ticket is Pending Customer when it requires a response from the client in order to move forward.  This status is not used when a response from the client is optional.

**Pending Adit \-** Tickets that are Pending Adit require additional action from the Adit team. Use this status when you will manage communication with the client and coordinate any further work with other Adit teams. If you are handing the ticket off to another team to handle, change the status to Open instead.

**Pending Meeting \-** This status is primarily for CSM and OB teams, but Tech Support can also use it. Use this status when a meeting is scheduled, and the ticket’s resolution is waiting for that meeting to occur. Ensure the date and time of the scheduled meeting are noted in the ticket.

**Pending Development \-** Only T2 support teams use this status. Use this status when the Dev team is working on an issue or bug.

**Under Observation \-** Only T2 support teams use this status. Use this status when the Dev team has resolved an issue and you are observing to ensure the ticket is fully resolved.

**Closed \-** The ultimate goal for all tickets is to be Closed. If you have sent a response to a client that solves their problem or answers their question, Close the ticket.

## *Ticket Fields* {#ticket-fields}

In Desk, any fields that are labeled in red text are required fields. These fields may change based on what you select in another field. Required fields include:

* Contact \- Every ticket must be associated with a Contact and an Account. If the Contact or the Account is missing or incorrect, you must edit them. For more information, see [Accounts and Contacts](#heading=h.squp8m96z7j6).  
* Status \- Follow the requirements described in [Ticket Status](#ticket-status) to select the appropriate status.  
* Subject \- The Subject line for every ticket should be simple, professional, and descriptive. The Subject is used internally to help locate tickets and is shown to clients as the subject line of any emails we send them on the ticket. If the Subject line does not describe the ticket's contents, you must edit it.  
* Classifications \- Describe which department the ticket falls under. The Classification you select will also change what Category field you have to choose from. **Note:** The Admin and Ops classification is for manager use only.  
* Adit App Module \- Required on all tickets. Select all of the modules that you worked on within this ticket. If the ticket did not involve the Adit App, select \-None-.  
* Category \- Provides additional detail about what kind of question or issue occurred in the ticket.

Check the Potential Escalation or Churn box if the issue being documented in this ticket has the potential to escalate or churn the client.

# **Ticket SOPs** {#ticket-sops}

## *Create a Ticket* {#create-a-ticket}

We can create new tickets in four ways:

* Automatically when a client sends an email to [support at adit.com](mailto:support at adit.com)  
* Automatically when a client submits a ticket through the Help Widget on their Adit dashboard  
* Manually by clicking the \+ button in the top right corner of the Desk ticket screen  
* By splitting a message from an existing ticket

When creating a new ticket manually, there are several important things to remember:

1. All ticket fields labeled in red text are required. You will not be able to create the ticket if any of these fields are left blank. For more information, see [Ticket Fields](#ticket-fields).  
2. Contact is always required. You can look up an existing contact by typing the Contact Name, Email, or Account Name in the appropriate field; Desk will automatically suggest matches from our database. Click on the correct suggestion to select it.  
3. The Description should be left blank when creating a ticket manually. Any text entered in the Description field will appear on the ticket as if a client emailed us, which can confuse users. The Description is also emailed to the client automatically when a ticket is created.  
4. Status should always be set to Open when creating a new ticket.  
5. Ticket Owner will default to the user creating the ticket. Please edit this field to ensure you assign the ticket to the appropriate team and person. See “[Assign a Ticket](#assign-a-ticket)” below for guidelines on assigning a ticket.  
6. Channel will default to Phone, assuming the new ticket is being created in response to an inbound phone call from a client. If that is not the case, you can change the Channel to identify how the client contacted us with this issue.

## *Assign a Ticket* {#assign-a-ticket}

When assigning a ticket to another person or team, you must assign the ticket to the Team first, then the user.

When picking up a ticket, assign it to your team first, then to yourself.

1. Click into the Ticket Owner field.  
2. Click **TEAMS** at the top of the list.  
3. Locate the team you need in the list.  
4. Click the team name to assign the ticket to that team’s queue.  
5. To assign the ticket to a specific person on that team, click the **user icon** to the right of the team name, then select the user’s name from the list.

To confirm a ticket is assigned correctly, ensure the team name is shown alongside the user’s name. This ticket is assigned to Parul via the Billing team in this example.

## *Pick Up a New Ticket* {#pick-up-a-new-ticket}

New tickets must be handled using the First In, First Out (FIFO) method. The FIFO method means that the earliest ticket received must be handled first. Cherry-picking to avoid complex or difficult tickets is not allowed on any client-facing team.

Check your **Team Queue** or custom **View** in Desk to see if there are new tickets for your team.  Always take the **oldest unassigned** ticket in your team queue/view.

While most teams follow these general guidelines, some teams may have a slightly different process for picking up new tickets. Please talk to your manager if you require clarification on this process.

## *Handle a Ticket* {#handle-a-ticket}

Once a ticket is created and assigned to a team/agent, the agent will follow a fairly standard set of steps to handle that ticket.

1. **Review the Ticket.**  Read through the email or comment thread and ensure you understand the issue. Check the client’s account to see if they have recently contacted us about this issue. If another agent is already working on the same issue in a different open ticket, assign the new ticket to them; they must [merge the tickets](#merge-a-ticket) and continue working on the issue.  
2. **Update Ticket Fields.** Once you know what the ticket is about, [update the ticket fields](#edit-ticket-fields) accordingly, including the Contact, Subject, Classifications, Category, Adit App Module, and the ticket’s Status. Document any additional information in a Private Comment on the ticket as needed.  
3. **Investigate.** Sometimes, this will be as simple as answering a quick question; in other cases, an agent may need to follow their team’s standard investigation process. Document any findings in a Private Comment (note) on the ticket.  
4. **Respond.** All tickets must receive their first response (an email from Adit to the client) within three business hours. If you are on the phone with the client, send a follow-up email summarizing your conversation once the call ends. If you call them and reach voicemail, send an email as well.  
5. [**Escalate**](#edit-ticket-fields) if needed.  
6. **Follow Up.** If a ticket is not Closed after sending the first response, [follow up](#follow-up) on the ticket.

### Follow Up {#follow-up}

Not every ticket will be closed right away. Some will require additional information from the client, and others will require you to coordinate with other Adit teams to take care of the client’s request.  
You must follow up regularly if a ticket is in any status other than Closed.  Generally, we require every ticket to be checked at least once every few days and for clients to be updated at least once weekly.

For tickets that are **pending action by Adit** (including Pending Adit, Pending Development, and Under Observation):

1. Check on whatever work is pending every 1-2 days and update the ticket accordingly.  
2. Send an email to the client to provide an update at least once per week; include what we are still working on and how much longer we expect it to take.  
3. You must update the ticket with a comment if you don’t email the client when you check on the ticket.

For tickets that are **pending action by the client** (Pending Customer status), reach out to the client every 1-2 days to remind them that we are waiting for something from them. Try a combination of calling and emailing on different days. If you call and leave a voicemail, send an email as well.

If you require a response from the client and they are unresponsive for a week (5 business days), your next follow-up steps will depend on what kind of ticket it is:

* If the ticket was created by Adit and is **required to continue doing business** \- such as for their onboarding, a billing issue, or a contract issue \- continue to follow up once per week until the ticket is resolved.  
* If the ticket was created **at the client’s request** \- they called or emailed and asked us to do something, then stopped responding \- follow the Unresponsive [Client Closeout Process](#unresponsive-client-closeout-process) detailed below.

### Unresponsive Client Closeout Process {#unresponsive-client-closeout-process}

If a client is unresponsive to your requests for information, follow these steps to ensure that our obligations are covered while not negatively impacting your ability to do your job effectively.

1. Attempt to follow up with the client every 1-2 days for the first week (5 business days). Set the ticket status to Pending Customer.  
2. On the 6th business day following the client’s last response, send the **Unresponsive Client \- 6th day** email template in Desk. Set the ticket to Pending Customer.  
3. On the 8th business day following the client’s last response, send the **Unresponsive client \- 8th day** email template in Desk. Set the ticket to Pending Customer.  
4. On the 10th business day following the client’s last response, call the client.  
   If you speak to someone and get the necessary information, continue handling the ticket as normal.  
   If you speak to someone, but they cannot provide the information you need, return to step 2 and continue to follow up as normal.  
   If you cannot reach anyone, leave a voicemail and then send the **Unresponsive Client \- 10th day** email template in Desk. Close the ticket.

### Ticket Handling Flow Chart {#ticket-handling-flow-chart}



## *Edit Ticket Fields* {#edit-ticket-fields}

You are responsible for updating the ticket fields when you handle a ticket. Do not wait until you are ready to close the ticket to update relevant fields; get in the habit of updating them when you create the ticket or when you first handle the ticket to ensure they never get forgotten.

You can access most ticket fields in the left-hand info panel of the ticket. These include:

* Assigned To  
* Status  
* Classifications (select the department this issue falls under)  
* Potential Escalation or Churn (check this box if the issue documented in this ticket has the potential to escalate or churn the client)  
* Category (the category field will depend on what Classification is selected)  
* Module (select which Adit App modules, if any, are covered in the ticket)  
* Any custom fields for your team

In addition, you should also review the Subject line and the Contact on the ticket to ensure they are accurate. To edit these, click the three dots in the top right corner of the ticket screen, then select Edit from the menu.

The **Subject** line for every ticket should be simple, professional, and descriptive. The Subject is used internally to help locate tickets and is shown to clients as the subject line of any emails we send them on the ticket. If the subject line provided by the client or another agent does not match what the ticket is about, change it.

For more information on why you would edit the contact, see [Change the Contact on a Ticket](#change-the-contact-on-a-ticket).

## *Escalate a Ticket* {#escalate-a-ticket}

Every team will have an escalation path that considers that team's specific needs. Ticket Escalation is used when an issue needs to be handled by another team.  Each agent is responsible for moving tickets to the right team when needed.

All agents in Onboarding, CSM, and Customer Support must perform basic troubleshooting before escalating a ticket, including checking settings/configurations, testing and replicating the issue, and any other requirements set by your specific team.

To Escalate a Ticket:

1. Ensure you have taken thorough notes about what the client said, any investigation or troubleshooting you performed, and the results you found. Include screenshots when appropriate.  
2. Let the client know you are escalating their issue to another team, and tell them when they can expect to hear back from that team.  
3. Update any ticket fields and set the ticket status to **Open**.  
4. [Reassign](#assign-a-ticket) the ticket to the necessary team.

## *Merge a Ticket* {#merge-a-ticket}

Sometimes you may find that a client’s response to a ticket comes in as a new ticket rather than being added to your existing ticket. In a situation like this, you can merge those tickets to keep the conversation in one place.  
You can merge up to 3 tickets at once. Merging cannot be undone.

When viewing tickets in a List view, check the box to the left of the tickets to be merged, then select the “Merge” option at the top of the list.  
  
The next screen will have you select which ticket will become the “Master Record.”  The Master Record is the ticket that will be kept, while the others will be merged into the Master Record. Select the radio button above the ticket you want to make the Master Record, then click the blue Merge button at the bottom of the screen.  
  
The last step will ask you to confirm that you want to merge the tickets and warn you that this action cannot be undone. Click “Yes, Merge” to confirm.

You may occasionally need to merge tickets in other situations, such as when multiple people create tickets for the same inbound call or when a client sends multiple emails about the same issue outside our business hours.

Be careful not to merge tickets only because they appear to be about the same issue. You must confirm that they are the same instance of the same issue being reported at the same time to merge tickets.

## *Split a Ticket* {#split-a-ticket}

If a client responds to an old or existing ticket with a new issue, you should split that new message into its own ticket and handle it separately. Splitting new issues allows us to keep conversations focused and on track and to ensure tickets do not remain open for longer than a single issue requires.

Open the ticket and locate the message to be split into a new ticket. Click the three dots at the top right corner of that message in the thread and select “Split Into New Ticket”.  
  
In this example, you can see that the ticket was resolved on March 28, but the client responded to it regarding an entirely different issue on April 28\. This is a case where you would split the client’s email into a new ticket.

## *Close a Ticket* {#close-a-ticket}

All tickets will end up Closed at the end of their lifecycle. Our goal as a team is to close tickets as quickly as possible, as soon as the client’s question is answered or the issue is resolved.

Most tickets can be closed after the first response is sent, as most tickets are created to ask a specific question. Once the question is answered, close the ticket. If the client responds with additional questions, the ticket will reopen automatically.

All other tickets should be Closed after 72 hours, though tickets that are Pending Development (in T2 Tech Support) or Pending Meeting (in CSM) may be open longer.

All fields listed in red text in Desk are required to close a ticket. If you try to close a ticket without filling in all required fields, Desk will not give you an error message or popup to remind you \- it just will not close the ticket. If you are trying to close a ticket and it keeps showing as Open in your ticket list or team view, check to ensure all required fields are filled in.

To close a ticket, click the **Close Ticket** button in the bottom right corner of the ticket screen. An email notification will be sent to the ticket contact to notify them that the ticket has been closed.

# **Appendices** {#appendices}

## *Appendix A: Ticket Audit Checklist* {#appendix-a:-ticket-audit-checklist}

Below is the checklist that team managers will use to audit tickets. These are the bare minimum requirements, and your team may have additional items or stricter time limits.

Items in **bold** are required for every ticket. Missing any one of these is an automatic audit failure.

Items in *italic* may not apply to every ticket and will only count towards failure if they are applicable on the specific ticket being audited. If not applicable, you automatically pass the italicized requirement.

Missing up to 3 requirements will result in a passing score. Missing 4 or more requirements will result in a failing score.\*

Assignment

- [ ] Ticket picked up in [FIFO](#pick-up-a-new-ticket) order.  
  - [ ] Assigned to [Team \> User](#assign-a-ticket), not directly to a user.  
  - [ ] [*Escalation process*](#escalate-a-ticket) *followed (if applicable, for T1 agents).*  
  - [ ] *If reassigned, [routed](#adit-teams-and-ticket-routing) correctly to the proper team.*

  Ticket Fields

  * **Correct [contact and account](#heading=h.squp8m96z7j6) are associated with the ticket.**  
    - [ ] [**Contact**](#change-the-contact-on-a-ticket) **on ticket is correct.**  
    - [ ] [**Account**](#edit-a-contact) **is linked to contact and ticket.**  
  - [ ] Subject describes the contents of the ticket.  
  - [ ] Classification makes sense for the ticket contents.  
  - [ ] Category makes sense for the ticket contents.  
  - [ ] All appropriate Adit App Modules are selected.  
  - [ ] [Status](#ticket-status) is used correctly.

  Communication

  - [ ] *If you leave a voicemail, immediately follow up with an email.*  
  - [ ] *Comment on pending tickets at least once every 2-3 days.*  
  - [ ] ***Email an update to the client on pending tickets at least once per week.***  
  - [ ] Email is polite, professional, and well-written (we recommend using Grammarly).

  Handling

  - [ ] *Ticket [merged](#merge-a-ticket) or [split](#split-a-ticket) if needed.*  
  - [ ] Ticket closed as soon as it is resolved, not left pending.  
  - [ ] [*Follow Up*](#follow-up) *process followed if needed.*  
  - [ ] [***Unresponsive Client***](#unresponsive-client-closeout-process) ***process followed if needed.***

  Notes

  - [ ] Clear and thorough.  
  - [ ] **Include any templates or info required by your team’s guidelines.**  
  * *If a phone call:*  
    - [ ] Name of who you spoke with.  
    - [ ] Callback number.  
    - [ ] If they prefer follow up via phone or email.  
  * *If troubleshooting an issue:*  
    - [ ] Client’s complaint or issue in their own words.  
    - [ ] Your understanding of the issue.  
    - [ ] Troubleshooting steps you tried and the result.  
    - [ ] *If issue is resolved, what was the resolution?*  
    - [ ] *If ticket needs to be escalated, explain why.*

  Miscellaneous

  - [ ] ***Uncategorized automatic failure not documented elsewhere in this checklist.***  
  - [ ] *Additional requirements set by your team’s manager.*

\*Note: pass/fail score was calculated by choosing the number closest to 80% of the 19 required checklist items, excluding the italicized items. 3 out of 19 is 84.2%, 4 out of 19 is 78.9%.

## *Appendix B: Anatomy of a Ticket* {#appendix-b:-anatomy-of-a-ticket}













