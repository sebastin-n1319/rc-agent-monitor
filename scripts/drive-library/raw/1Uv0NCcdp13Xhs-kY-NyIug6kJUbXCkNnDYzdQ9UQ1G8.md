

| ADIT Zoho Desk Standard Operating Procedure *Enterprise Customer Support Operations — Global Reference Guide* Document Version:  3.0 — 2025 Replaces:  SOP v1.0 (2022) & SOP v2.0 (2025) Classification:  Internal — Confidential Applicable Teams:  T1 CS (Calls & Chat), T2 Tech Support, T3 Engineering, OB, CSM, Billing Authority:  Adit Customer Operations Leadership |
| :---: |

| Document Purpose This SOP defines the complete, enterprise-grade process for operating Zoho Desk across all client-facing teams at Adit. It covers the full ticket lifecycle, automation frameworks (Workflows, Blueprints, Macros, Assignment Rules), SLA management, role-based permissions, integrations (CRM, RingCentral, SalesIQ), reporting and KPIs, knowledge base management, and quality audit standards. It supersedes all prior SOP versions and is the single source of operational truth for customer support at Adit. |
| :---- |

*Adit Technologies  •  Customer Operations  •  INTERNAL & CONFIDENTIAL*

# **Table of Contents**

# **Section 1: Introduction & Purpose**

## **1.1  About This Document**

This Standard Operating Procedure (SOP) is Adit's authoritative operational guide for all support activity conducted through Zoho Desk. It serves two audiences: trainees learning the platform, and experienced agents and managers who need a reliable daily reference. Every process has been cross-referenced against Zoho Desk's official documentation and aligned with Adit's internal workflows, team structures, and escalation practices as of 2025\.

## **1.2  Why Zoho Desk?**

* Single source of truth — all client interactions tracked in one platform regardless of inbound channel

* Native CRM integration — contact, account, and deal data flows from Zoho CRM into every ticket

* Automation-first — SLAs, workflow rules, blueprints, macros, and assignment rules reduce manual effort

* Tier-aware routing — teams and queues reflect Adit's T1/T2/T3 support model

* Reporting & accountability — built-in and advanced analytics provide real-time visibility into performance

## **1.3  Scope of This Document**

| Dimension | In Scope | Out of Scope |
| :---- | :---- | :---- |
| **Teams Covered** | T1 CS (Calls & Chat), T2 Tech Support, T3 Engineering & QA, Onboarding, Marketing CSM, Billing | External vendors, client-side users |
| **Platform** | Zoho Desk (web & mobile), Zoho CRM, Zoho SalesIQ, RingCentral | Personal email, WhatsApp, ad hoc tools |
| **Processes** | Ticket lifecycle, escalation, automation, SLAs, reporting, integrations, quality audits | HR, payroll, product roadmap decisions |

## **1.4  How to Use This Document**

* New agents: Read Sections 1–6 in order — these form the complete onboarding training sequence

* T2 agents: Sections 5, 7, 8, and 10 cover escalation and automation in depth

* T3 Engineers & QA: Sections 7 and 9 cover your queue management and client bug process

* Managers & Team Leads: Sections 8, 10, 12, and 14 cover automation, SLAs, reporting, and quality

* Quick reference: Appendices A–E contain checklists, field guides, routing tables, and glossary

# **Section 2: Scope, Definitions & Key Terminology**

## **2.1  Core Platform Terminology**

| Term | Definition |
| :---- | :---- |
| **Ticket** | The core unit of work. Every support request — by email, phone, chat, or web form — becomes a ticket with a unique ID, status, owner, and full conversation history. |
| **Department** | A logical grouping within Zoho Desk organized by product line or function. Each department can have its own SLAs, workflows, and views. |
| **Agent** | Any individual with a Zoho Desk login. Agents can view and act on tickets based on their assigned Role and Profile. |
| **Team** | A group of agents organized around a function or queue. Tickets can be assigned to teams, enabling any team member to claim unassigned work. |
| **Role** | Defines data visibility hierarchy — which tickets and records an agent can see (own, team, department, or all). Roles are hierarchical in Zoho Desk. |
| **Profile** | Defines feature-level permissions — which modules, actions, and settings an agent can access. Profiles are independent from Roles and must be assigned separately. |
| **Ticket Owner** | The agent currently responsible for a ticket. Must always be set alongside the team assignment. |
| **Contact** | The individual person associated with a ticket. Must be the actual client — not RingCentral, an Adit employee, or a third party. |
| **Account** | The company or practice owner in Zoho CRM. One account can have multiple Deals (locations). Tickets and contacts link at the Account level. |
| **Deal** | A single office or location in Zoho CRM. One Account can have many Deals. |
| **Private Comment** | Internal-only note. Clients never see these. Shown with yellow background. Used for all investigation notes, handoffs, and tier-to-tier communication. |
| **Conversation (Reply)** | Public email sent to the client from within the ticket. Visible to the client. T3 engineering agents NEVER use this. |
| **CSAT / Happiness Rating** | Customer satisfaction feedback collected via automated survey after ticket closure. Results: Good, Neutral, Bad. |
| **SLA** | Service Level Agreement — defined targets for first response time and resolution time. |
| **Blueprint** | Structured process automation enforcing mandatory actions before ticket stage transitions. |
| **Macro** | A saved set of one-click actions an agent applies manually to a ticket. |
| **Workflow Rule** | An automated trigger-action rule that fires when a ticket meets defined conditions. |
| **Assignment Rule** | Automatically routes new tickets to teams or agents based on defined criteria. |

## **2.2  Adit-Specific Terminology**

| Term | Definition |
| :---- | :---- |
| **T1 / Tier 1** | First line of support — basic configuration, how-to questions, initial troubleshooting. Split into Calls and Chat teams at Adit. |
| **T2 / Tier 2** | Second line — investigates and troubleshoots bugs. Owns the client relationship throughout the bug lifecycle. Escalates to T3 when developer help is needed. |
| **T3 / Tier 3** | Engineering and QA — code-level investigation and bug fixes. Does NOT communicate with clients. Returns resolved tickets to T2. |
| **Client Bug Section** | Custom Zoho Desk ticket fields for T3 escalations: EHR, Bug Summary, Client Bug Status, Priority, T2 Owner, T3 Team, Expected Live Date, Live Date, Root Cause Analysis. |
| **FIFO** | First In, First Out — the mandatory ticket pickup method. Oldest unassigned ticket must always be picked up first. |
| **EHR / PMS** | Electronic Health Record / Practice Management System. Third-party software Adit integrates with (e.g., Dentrix, Revolution, Ascend). |
| **RCA** | Root Cause Analysis — explanation of what caused a bug and how the fix addresses it. Required from T3 before returning a ticket to T2. |
| **Cherry-Picking** | Selecting easy tickets while skipping harder ones. Strictly prohibited at Adit. |

# **Section 3: Roles, Permissions & Responsibilities**

## **3.1  Zoho Desk Permission Model**

Zoho Desk uses two parallel permission layers. Both must be assigned to every agent:

| Permission Layer | What It Controls | How to Configure |
| :---- | :---- | :---- |
| **Role** | Data visibility — which tickets and records the agent can see. Hierarchical: higher roles see data from roles below. A Manager role sees all team agent tickets. | Setup → Agents & Permissions → Roles |
| **Profile** | Feature access — which modules, actions, and settings the agent can use. Granular per module (view/create/edit/delete/manage). | Setup → Agents & Permissions → Profiles |

## **3.2  Role & Responsibility Matrix**

| Role / Title | Zoho Desk Role | Primary Responsibilities | Key Zoho Desk Access |
| :---- | :---- | :---- | :---- |
| **T1 CS Agent (Calls & Chat)** | Agent | Answer calls/chats, create and handle tickets, FIFO queue pickup, basic troubleshooting, follow-up, escalate to T2 | Tickets: View/Create/Edit. No Setup access. |
| **T2 Tech Support Agent** | Agent (elevated) | Advanced troubleshooting, bug investigation, fill Client Bug section, route to T3 queue, own client comms throughout bug lifecycle, weekly client updates | Tickets: Full. Client Bug section: Edit. Reports: View. |
| **T3 QA Agent** | Agent (T3 profile) | QA investigation of escalated bugs, validate staging fixes, update Client Bug Status, private comments only | Tickets: View/Edit (assigned). NO Conversations/Reply tab. |
| **T3 Engineer** | Agent (T3 profile) | Code-level investigation, implement fixes, set Expected Live Date, write RCA, reassign back to T2 Owner | Tickets: View/Edit (assigned). Client Bug fields: Edit. NO client comms. |
| **T3 Queue Manager** | Team Lead | Daily T3 queue triage, assign tickets to QA/engineer, report on queue health and blockers | Full T3 team ticket view. Reports: View. |
| **Team Lead / Manager** | Manager | Team performance monitoring, ticket audits, SLA compliance, approve process changes, review reports | Full team ticket access. Reports: Full. Setup: Limited. |
| **Admin / Ops** | Administrator | Full platform config: workflows, SLAs, blueprints, macros, teams, roles, profiles, integrations | Full Setup access. All modules. Billing management. |

## **3.3  Adding a New Agent — Procedure**

1. Log in as Administrator → Setup (⚙) → Agents & Permissions → Agents

2. Click Invite Agent — enter email, first name, last name

3. Assign Department (required at invite time; additional departments added later)

4. Assign Role (data visibility) and Profile (feature permissions)

5. Click Send Invitation — agent receives email to activate account

6. After activation, verify agent appears in the correct Team: Setup → Agents & Permissions → Teams

| \[ SCREENSHOT PLACEHOLDER \] *Zoho Desk — Add New Agent screen (Setup → Agents & Permissions → Agents → Invite Agent)* |
| :---: |

| ⚠️  Important:  Inviting an agent counts toward your seat license even before acceptance. |
| :---- |
| When deactivating: open tickets are NOT auto-reassigned. Set up reassignment before deactivating. |
| Deactivated agents remain in historical reports and audit logs — never permanently deleted. |

# **Section 4: Platform Architecture & System Overview**

## **4.1  Zoho Desk Navigation Map**

| Navigation Element | What It Contains & When to Use |
| :---- | :---- |
| **Tickets Module (top nav)** | Your primary workspace. All tickets across all departments. Entry point for daily operations. |
| **Headquarters (⬛ left panel)** | Dashboard showing all-department ticket metrics. Used by managers for volume and status overview. |
| **Team Feeds (left panel)** | Activity feed of recent ticket actions across your team. Stay informed without opening individual tickets. |
| **Views (left panel)** | All custom and starred ticket views. Your main workload filter. Click \+ to create a new view. |
| **Agent Queue** | Tickets assigned directly to YOU. Your personal daily workload — check this every login. |
| **Team Queue** | ALL tickets assigned to your team, including unassigned. Use for FIFO pickup. |
| **Reports (top nav)** | Standard and custom reports: ticket volume, agent performance, CSAT, SLA compliance. |
| **Knowledge Base (top nav)** | Internal and client-facing help articles. Managed by designated KB authors. |
| **Setup (⚙ top right)** | Administration panel. Automation, SLAs, integrations, roles, teams. Administrator access only. |
| **Search (🔍)** | Global search by ticket ID, keyword, contact, or account name. Use ticket IDs from Asana tasks here to locate the corresponding Zoho Desk ticket. |

| \[ SCREENSHOT PLACEHOLDER \] *Zoho Desk — Main navigation layout with Tickets, Views, Agent Queue, and Team Queue highlighted* |
| :---: |

## **4.2  Anatomy of a Ticket — Full Field Reference**

| Field / Section | What It Is | Who Fills / Updates It |
| :---- | :---- | :---- |
| **Ticket ID** | Unique auto-generated identifier. Referenced in Asana engineering tasks. | Auto-generated |
| **Subject** | One-line summary shown to client as email subject. Must be descriptive and professional. | Agent — edit on pickup if unclear |
| **Status** | Current lifecycle stage. See Section 5 for complete status reference. | Agent — updated at every handoff |
| **Priority** | Low / Medium / High. Set by T2 on escalation. Affects SLA countdown and queue ordering. | T2 agent (on escalation) |
| **Contact** | Individual client who submitted the ticket. Must be the actual client — not RC, an Adit employee, or a vendor. | Auto (email) or agent (manual/corrected) |
| **Account** | Company/practice owner. Linked via Contact. All tickets for a multi-location client share one account view. | Synced from CRM via contact |
| **Classification** | Department category for reporting and routing. Selection changes available Category options. | T1 / T2 agent |
| **Category** | Sub-category of the issue. Dependent on Classification selected. | T1 / T2 agent |
| **Adit App Module** | Which product feature(s) are involved. Select all that apply; use \-None- if no module involved. | T1 / T2 agent |
| **Potential Escalation/Churn** | Checkbox flag. Check if the issue has risk of client escalation or cancellation. | Any agent |
| **Deal Info Panel (left)** | Deal stage, CSM/OB owner, number of locations, industry — synced live from Zoho CRM. | Synced from Zoho CRM |
| **Client Bug Section** | Custom fields for T3 escalations: EHR/PMS, Bug Summary, Client Bug Status, Priority, T2 Owner, T3 Team, Expected Live Date, Live Date, RCA. | T2 fills before escalating; T3 updates during work |
| **Conversations tab** | Public email thread with client. NEWEST FIRST — scroll to bottom to read original. T3 NEVER uses this. | T1 / T2 — client-visible |
| **Comments tab** | Internal-only private comments. Yellow background. Clients never see this. | All tiers |
| **Activity / Timeline tab** | Auto-logged system changes: status changes, reassignments, field edits with timestamps. | System auto-logs |
| **Attachments tab** | All files uploaded across all messages and comments on the ticket. | Any agent or client |

| 🚨  Critical Thread Order Rule:  Zoho Desk displays the thread NEWEST FIRST — the most recent message is at the TOP. |
| :---- |
| When opening a ticket for the first time: scroll to the BOTTOM to read the original issue, then read UPWARD. |
| This is the OPPOSITE of Asana. Getting this wrong means acting on outdated context and is a common new-agent mistake. |

## **4.3  Conversations vs. Private Comments**

| Dimension | Conversations (Reply) | Private Comments (Internal) |
| :---- | :---- | :---- |
| **Client visibility** | YES — client receives an email immediately | NO — internal only, never emailed to client |
| **When to use** | Status updates to client, requesting info, communicating resolution | Investigation notes, handoff summaries, call logs, escalation details |
| **Who uses it** | T1 and T2 agents ONLY | ALL tiers — T1, T2, T3, OB, CSM |
| **T3 Engineering** | NEVER — T3 does not contact clients under any circumstance | ALWAYS — T3's only communication method in tickets |
| **Reply All button** | DO NOT USE — emails all thread recipients. Never click this. | N/A |
| **Visual indicator** | White/standard background in thread | Yellow background — easily distinguishable |

## **4.4  Agent Queue vs. Team Queue**

| Queue Type | Description | Primary Use |
| :---- | :---- | :---- |
| **Agent Queue (My Queue)** | Tickets assigned directly to you as ticket owner. Your personal workload. | Check every login. These need YOUR action today. |
| **Team Queue** | All tickets for your team, including unassigned. Any team member can see these. | FIFO pickup. Monitor team-wide load. Pick up unassigned tickets here. |
| **Assignment Rule (Always)** | TEAM first, then AGENT. Never assign only to an agent without a team. | A ticket with no team is invisible to managers and teammates — a critical process failure. |

# **Section 5: Ticket Lifecycle — End to End**

## **5.1  Ticket Creation Channels**

| Channel | How Ticket is Created | Initial Status | Required Agent Action |
| :---- | :---- | :---- | :---- |
| **Email to support at adit.com** | Auto-created from sender email. Contact auto-populated. | OPEN | Verify Contact & Account. Fix Subject if vague. Update Classification and Category. |
| **Inbound Call (RingCentral)** | T1 agent manually creates ticket after answering. Channel \= Phone. | OPEN | Fill all fields. Set Channel \= Phone. Handle immediately. |
| **Voicemail / Missed Call** | RC notification email auto-creates ticket with RingCentral as contact. | OPEN | CHANGE CONTACT from RingCentral to actual client. Call back. Follow-up email. |
| **Live Chat (Zoho SalesIQ)** | Chat converted to ticket via SalesIQ integration. | OPEN | Verify Contact & Account. If resolved in real time, close immediately with summary note. |
| **Help Widget (Adit Dashboard)** | Client submits via embedded widget. Auto-created. | OPEN | Verify all fields. Treat same as email inbound. |
| **Manual Creation by Agent** | Agent clicks \+ button. Used when no ticket was auto-created. | OPEN | Leave Description blank (it auto-emails client). Set Channel correctly. Assign team \+ self. |

| ⚠️  Description Field Warning:  NEVER put text in the Description field when manually creating a ticket. The Description auto-emails the client when the ticket is created. Use a Private Comment for all internal notes. |
| :---- |

## **5.2  Ticket Status Reference**

| Status | Meaning | Who Sets It | When to Use / Key Notes |
| :---- | :---- | :---- | :---- |
| **Open** | Needs immediate attention | Any agent; auto on creation | Default at creation. Use when escalating or reassigning — signals new owner must act now. |
| **Pending Customer** | Waiting on client response or action | T1 / T2 | Only use when you CANNOT proceed without the client's response. Not for optional follow-ups. |
| **Pending Adit** | Internal work in progress, agent managing client comms | T1 / T2 | Use when you own client comms AND are coordinating internally. Do NOT use if handing off entirely — use Open instead. |
| **Pending Meeting** | Awaiting a scheduled meeting | CSM / OB / T2 | Requires meeting date/time documented in a Private Comment on the ticket. |
| **Pending Dev** | Escalated to T3 engineering for code-level fix | T2 (before T3 handoff) | Set by T2 when all Client Bug fields are completed and ticket is being reassigned to T3 queue. |
| **Under Observation** | Fix deployed; monitoring period before closing | T2 / T3 | Used after a bug fix goes live. Monitor before closing to confirm the resolution holds. |
| **Closed** | Fully resolved | Any agent | ALL red-label required fields must be completed. Zoho Desk silently refuses to close if fields are missing. |

| ⚠️  Silent Close Failure:  If you click 'Close Ticket' and the ticket remains Open — a required red-label field is missing |
| :---- |
|  Zoho Desk gives no error message |
|  Check every red field before trying again |
|  |

## **5.3  Ticket Status Flow Diagrams**

### **T1 Direct Resolution (simple tickets):**

| STEP 1 OPEN Ticket created | STEP 2 PENDING ADIT T1 investigating | STEP 3 PENDING CUSTOMER Awaiting client info | STEP 4 CLOSED Issue resolved |
| :---: | :---: | :---: | :---: |

### **Full Bug Lifecycle — T1 → T2 → T3:**

| STEP 1 OPEN T1 creates / T2 picks up | STEP 2 PENDING DEV T2 → T3 escalation | STEP 3 T3 ACTIVE QA / Dev working | STEP 4 UNDER OBS Fix live; monitoring | STEP 5 CLOSED Confirmed resolved |
| :---: | :---: | :---: | :---: | :---: |

## **5.4  Ticket Flow Chart — T1 → T2 → T3**

The following diagram illustrates the complete escalation path across all three tiers:

![T1 to T3 Ticket Flow][image1]

| 📌  2025 Process Change:  OLD: T2 created an Asana 'Client Bugs' task and remained ticket owner throughout. Ticket stayed in Pending Dev with T2 as owner. |
| :---- |
| NEW: T2 fills the Client Bug section inside Zoho Desk and RE-ASSIGNS the ticket to the T3 team queue. No Asana task is created for client bugs. |
| Asana remains the tool for NEW FEATURE DEVELOPMENT only. All client bug tracking now lives entirely in Zoho Desk. |

# **Section 6: Tier 1 Operations — Step-by-Step Procedures**

## **6.1  Daily Login & Queue Routine**

7. Open Zoho Desk → navigate to Team Queue → \[Your Team Name\]

8. Sort by Date Received: oldest first. Identify all unassigned tickets.

9. Pick up the OLDEST unassigned ticket first — FIFO is mandatory

10. Review Agent Queue: action all tickets assigned to you today

11. Check Pending Customer tickets: follow up on any not responded to in 1–2 days

12. Check Pending Adit tickets: confirm internal progress; email client if 7+ days since last update

| 🚫  FIFO is Mandatory:  Cherry-picking tickets to avoid difficult ones is strictly prohibited at all times |
| :---- |
|  Every client deserves support in the order they contacted us |
|  Violations are subject to audit action |
|  |

## **6.2  Handling a Ticket — Full Procedure**

### **Step 1: Assign the Ticket Correctly**

13. Click Ticket Owner field → click TEAMS → select your team → click user icon → select yourself

14. Confirm the owner field shows BOTH team name AND your name — both are required

| \[ SCREENSHOT PLACEHOLDER \] *Zoho Desk — Ticket Owner field showing Team \+ Agent assignment dropdown* |
| :---: |

### **Step 2: Update All Required Fields First**

| Field | What to Check / Do |
| :---- | :---- |
| **Contact** | Is it the actual client? If it shows RingCentral, an Adit employee, or a vendor — change it (see Section 6.6). |
| **Account** | Is an account linked? If the Account field is blank, edit the Contact to add the correct CRM account. |
| **Subject** | Does it clearly describe the issue? Rewrite if vague (e.g., 'Help' or 'Issue' — not acceptable). |
| **Classification** | Select the correct department category for this issue. |
| **Category** | Select based on classification. Options change dynamically depending on classification chosen. |
| **Adit App Module** | Select all product modules involved. Use \-None- if no Adit app module is involved. |
| **Status** | Should be OPEN when picked up. Change as the ticket progresses. |
| **Potential Escalation/Churn** | Check this box if the issue could lead to client escalation or cancellation. |

### **Step 3: Read the Ticket (Bottom-Up)**

* Scroll to the BOTTOM of the thread — the original client message is at the bottom

* Read the thread upward (chronologically) to understand the full conversation context

* Check the Deal Info panel on the left: deal stage, industry, number of locations, current CSM or OB

* Check if another agent is working on this same issue in a different open ticket → if yes, assign the new ticket to them to merge

### **Step 4: Investigate & Document**

* Investigate the issue systematically — document EVERY step in a Private Comment, not the Description

* Use the Investigation Log template (see Section 13.2)

* Log into the client's Adit account if needed to replicate the issue

### **Step 5: Respond to the Client**

* All tickets must receive their first response within 3 business hours of ticket creation (SLA requirement)

* If on a call: send a follow-up email summarizing the call immediately after hanging up

* If you leave voicemail: send a follow-up email at the same time — do not wait

* Use the Conversations (Reply) tab only — never the Comments tab for client communication

### **Step 6: Resolve, Escalate, or Set Pending**

* If resolved: click Close Ticket. Client receives automatic closure notification.

* If awaiting client: set status to Pending Customer. Follow up every 1–2 days.

* If T2 expertise is needed: complete pre-escalation checklist (Section 6.5) first.

## **6.3  Follow-Up Standards**

| Ticket State | Follow-Up Frequency | Required Action |
| :---- | :---- | :---- |
| **Pending Adit / Pending Dev / Under Observation** | Check every 1–2 days | Verify internal progress. Email client update at least once per week. If no email, leave Private Comment confirming you checked. |
| **Pending Customer** | Reach out every 1–2 days | Alternate calls and emails. If voicemail → send email same time. |
| **Pending Meeting** | Check before meeting date | Confirm meeting is scheduled. Update ticket immediately after meeting. |
| **No response for 5 business days** | Begin Closeout Process | Follow Unresponsive Client Closeout Process (Section 6.4). |

## **6.4  Unresponsive Client Closeout Process**

| 📌  Exception:  If the ticket was created by Adit (not the client) and is required for ongoing business (billing, onboarding, contract) — continue weekly follow-ups indefinitely |
| :---- |
|  Do NOT close on Day 10 |
|  |

| Business Day | Action | Template | Status |
| :---- | :---- | :---- | :---- |
| **Days 1–5** | Follow up every 1–2 days, alternating calls and emails | No template — personalized | Pending Customer |
| **Day 6** | Send Day 6 unresponsive email template | Unresponsive Client — 6th Day | Pending Customer |
| **Day 8** | Send Day 8 unresponsive email template | Unresponsive Client — 8th Day | Pending Customer |
| **Day 10 — Call** | Final call attempt. Leave voicemail if no answer. | Voicemail message | Pending Customer |
| **Day 10 — Unreachable** | Leave voicemail \+ send Day 10 template \+ CLOSE | Unresponsive Client — 10th Day | → CLOSED |
| **Day 10 — Info received** | Continue handling normally | No template needed | → Normal handling |
| **Day 10 — No info** | Return to Day 6 and restart follow-up cycle | Restart from Day 6 template | Pending Customer |

## **6.5  T1 → T2 Pre-Escalation Checklist**

* **Settings and configuration checked on client's account**

* **Issue replicated or confirmed unreplicable (documented either way)**

* **Private Comment written: client's words, your hypothesis, every step taken, every result**

* Client informed of escalation and given expected response timeframe

* All ticket fields updated: Contact, Account, Subject, Classification, Category, Module

* Status set to OPEN before reassigning

* Ticket reassigned to correct T2 team

## **6.6  Changing a Contact on a Ticket**

15. Click the three dots (⋯) at the top right of the ticket screen → select Edit

16. In Contact Name field, click the X to clear the existing contact

17. Search for the correct contact by name, email, or account name

18. Click the correct suggestion from the dropdown to select them

19. Click Save

## **6.7  Merging & Splitting Tickets**

### **When to Merge**

* Client's response creates a new ticket instead of replying to the original

* Multiple agents create tickets for the same inbound call

* ONLY merge if you are certain these are the SAME issue occurrence — not just similar issues

* Maximum 3 tickets per merge. Merging CANNOT be undone.

### **Merge Steps**

20. In list view, check the box to the left of each ticket to merge

21. Click Merge at the top of the list

22. Select the Master Record (all others merge into this ticket)

23. Click Merge → confirm with 'Yes, Merge'

### **Splitting Tickets**

Split when a client replies to an old resolved ticket with a completely new unrelated issue.

24. Open the ticket → find the message to split

25. Click three dots at the top right corner of THAT MESSAGE in the thread

26. Select 'Split Into New Ticket' → handle the new ticket following standard procedure

# **Section 7: Tier 2 → Tier 3 Escalation — Client Bug Process**

## **7.1  When T2 Escalates to T3**

* T2 has replicated and investigated the bug — it requires a code-level fix

* The bug cannot be resolved through configuration changes or known workarounds

* The issue involves an EHR/PMS integration failure, product module defect, or platform-level failure

## **7.2  Completing the Client Bug Section — T2 Responsibility**

This is the Zoho Desk replacement for the old Asana client bug task. Everything lives here now.

| Client Bug Field | What to Enter |
| :---- | :---- |
| **EHR / PMS** | Specific EHR or PMS system involved (e.g., Revolution EHR, Dentrix, Ascend) |
| **Bug Summary** | One-line summary — equivalent to the old Asana task name |
| **Client Bug Status** | Set to OPEN when creating the escalation |
| **Priority Level** | Low / Medium / High — based on client impact and number of locations affected |
| **T2 Owner** | Your name — T3 uses this to know who to reassign the resolved ticket back to |
| **T3 Team** | Relevant T3 team based on issue type (see Section 7.3) |
| **Bug Summary from T2 Perspective** | Full description: client complaint, investigation steps, what was replicated, what was ruled out |
| **Expected Live Date** | Leave blank — T3 fills this once they have an engineering ETA |
| **Live Date** | Leave blank — T3 fills this when the fix is deployed to production |
| **Root Cause Analysis** | Leave blank — T3 writes this when the fix is deployed and confirmed |

## **7.3  T3 Team Routing Reference**

| T3 Team | Route Here For... | Example EHRs / Modules |
| :---- | :---- | :---- |
| **Cloud Integrations** | Cloud-based EHR/PMS sync failures | Ascend, Curve, Denticon, Cloud9, Eyefinity, Revolution EHR, Jane, CT Cloud |
| **OnPrem Integrations** | Server-installed EHR/PMS sync failures | Dentrix, OpenDental, PracticeWeb, AbelDent, Dolphin, Eaglesoft, Cleardent, Crystal PM |
| **Adit Pay / CRM / Tasks** | Payment processing, CRM data, task module bugs | Adit Pay, Financing, Patients Module, CRM Build, Task Module |
| **Practice Analytics** | Reporting, patient list, segment data issues | Practice Analytics, Patient Lists, Segments |
| **Online Scheduling** | Appointment booking, scheduler sync, API failures | Online Scheduling, Scheduler, Sync APIs |
| **Forms / Reminders** | Patient form submission, auto-assign, recall reminders | Patient Forms, Auto-Assign, Form Reminders, Recall Report |
| **Mobile / Engage / Settings** | Mobile app bugs, SMS, settings, onboarding features | Mobile App, Engage SMS, Internal Chat, Pozative, Settings |
| **VoIP** | Call quality, call handling, call log data | VoIP Call Quality, Call Logs, Call Handling |
| **RCM** | Revenue cycle management and verification issues | Verifications |

## **7.4  Reassigning to T3 Queue — T2 Steps**

27. Complete ALL Client Bug fields (Section 7.2)

28. Write a final comprehensive Private Comment: what was investigated, what T3 needs to do, screenshots

29. Set ticket Status to PENDING DEV

30. Ticket Owner → TEAMS → locate the correct T3 queue → assign to team (leave individual blank)

31. Inform the client: issue escalated to engineering team, updates will continue weekly

| ✅  T2 Retains Client Ownership:  Even after reassigning the ticket to T3, T2 is still responsible for ALL client communication. |
| :---- |
| T2 must send the client a status update at least once per week while the bug is being worked on. |
| T3 NEVER contacts the client at any stage of their investigation or fix work. |

## **7.5  T3 Investigation & Status Update Flow**

| T3 Stage | Responsible | Client Bug Status | Key Actions Required |
| :---- | :---- | :---- | :---- |
| **Initial Queue Triage** | T3 Queue Manager | Open (unchanged) | Read all T2 notes and Client Bug fields. Assign to appropriate QA or engineer. |
| **QA Investigation** | QA Agent | QA Investigation | Replicate the bug. Check logs. Document all findings in Private Comment. |
| **Dev Code Review** | Engineer | Dev Investigation | Code-level root cause analysis. Document findings. |
| **Fix Development** | Engineer | Under Development | Set Expected Live Date immediately. Update as ETA changes. |
| **Staging Validation** | QA Agent | QA Review Stage | Validate fix on staging/local. Document pass/fail and any edge cases. |
| **Production Deployment** | Engineer | Ready to Go Live → Solved and Deployed | Deploy fix. Set Live Date. Write RCA. Reassign to T2 Owner. Status \= Open. |
| **Bug Recurrence** | T3 Queue Manager | Reopened | Re-investigate. Treat as new escalation. |
| **Blocked** | T3 Queue Manager | On Hold | Document what is blocking progress. Notify T2 Owner. |

## **7.6  Returning Resolved Ticket to T2 — T3 Steps**

32. Update Client Bug Status to 'Solved and Deployed'

33. Fill in Live Date field with today's production deployment date

34. Write Root Cause Analysis in the RCA field — plain language T2 can understand and summarize for the client

35. Leave a Private Comment: what was fixed, the RCA, and instructions for T2

36. Look up T2 Owner field — this is who you are returning the ticket to

37. Reassign: Team \= T2 Owner's team, Agent \= T2 Owner's name

38. Set Status \= OPEN so T2 sees it in their queue immediately

# **Section 8: Automation — Workflows, Blueprints, Macros & Assignment Rules**

## **8.1  The Four Automation Tools**

| Tool | What It Does | When to Use vs. Others |
| :---- | :---- | :---- |
| **Workflow Rules** | Auto-trigger actions when tickets are created, edited, or fields updated: send alerts, update fields, assign tickets, fire webhooks. | Use for background automation that should happen every time a condition is met — no agent action required. Example: auto-alert manager on SLA breach. |
| **Macros** | One-click sets of saved actions applied manually by agents to individual tickets: field updates, status changes, email sends, private comment posts. | Use for situation-specific actions that need agent judgment. Example: agent clicks 'Voicemail Follow-Up' macro — it sends the template email and sets status in one click. |
| **Blueprints** | Structured process maps that enforce mandatory steps between ticket state transitions. A ticket CANNOT move to the next state without completing required actions. | Use to enforce critical processes that must never be skipped. Example: T2 cannot set status to Pending Dev until all Client Bug fields are completed. |
| **Assignment Rules** | Automatically route new tickets to specific teams or agents based on criteria (channel, keywords, contact, classification) at ticket creation. | Use for initial routing only — when a new ticket arrives and needs to be directed to the correct queue immediately. |

## **8.2  Workflow Rules — Configuration Guide**

Navigate to: Setup (⚙) → Automation → Workflow Rules → New Rule

| Component | Configuration Options |
| :---- | :---- |
| **Module** | Always select 'Tickets' for support workflow rules. |
| **Trigger** | On Create (new ticket), On Edit (any field changed), On Field Update (specific field only — more precise), Date-Based (fires at interval after a date field, e.g., 2 days after Due Date) |
| **Criteria** | Conditions ticket must meet for rule to fire. AND/OR logic. Up to 25 criteria per rule. |
| **Actions** | Send Email Alert, Create Task, Update Field, Assign Agent/Team, Fire Webhook. |

### **Recommended Workflow Rules for Adit**

| Rule Name | Trigger \+ Criteria → Action |
| :---- | :---- |
| **Auto-flag RC voicemail tickets** | On Create \| Contact contains 'RingCentral' → Tag: 'contact-change-needed', Assign to T1 Calls team |
| **Alert on Potential Churn** | On Field Update \| Potential Escalation/Churn \= Checked → Email alert to Team Lead with ticket link |
| **Notify T2 when T3 returns ticket** | On Edit \| Status \= Open AND Client Bug Status \= Solved and Deployed → Email alert to T2 Owner field value |
| **Weekly Pending Customer reminder** | Date-Based \| Status \= Pending Customer, trigger 5 days after last modified → Create Task for ticket owner: 'Follow up or close' |
| **High Priority bug alert** | On Field Update \| Priority \= High AND Client Bug Status \= Open → Email T3 Queue Manager |
| **SLA pre-breach warning** | SLA Escalation Rule \| 30 min before First Response SLA breach → Notify assigned agent |

| \[ SCREENSHOT PLACEHOLDER \] *Zoho Desk — Workflow Rule configuration screen (Setup → Automation → Workflow Rules → New Rule)* |
| :---: |

## **8.3  Macros — Creating & Using**

Navigate to: Setup (⚙) → Automation → Macros → New Macro

39. Enter a descriptive name (e.g., 'Voicemail Follow-Up Email Sent')

40. Add actions in sequence — each runs in order when the macro is applied

41. Set visibility: Only Me (personal) or All Agents (team-shared)

42. Save. The macro appears in the Macros dropdown inside any ticket.

| Macro Name | Actions Configured |
| :---- | :---- |
| **Voicemail Follow-Up Sent** | 1\. Send template 'Voicemail Follow-Up Email'  2\. Add Tag 'voicemail-left'  3\. Set Status \= Pending Customer |
| **Unresponsive Day 6** | 1\. Send template 'Unresponsive Client — 6th Day'  2\. Set Status \= Pending Customer  3\. Private Comment: 'Day 6 template sent \[date\]' |
| **Close — Resolved** | 1\. Send template 'Resolution Confirmation'  2\. Set Status \= Closed |
| **T3 Ticket Returned — Action Needed** | 1\. Private Comment: 'Bug resolved by T3. Fix is live. Review RCA and update client.'  2\. Set Status \= Open |

## **8.4  Blueprints — Enforcing the T2 → T3 Process**

Navigate to: Setup (⚙) → Process Automation → Blueprints → New Blueprint

| 💡  Recommended Blueprint — T2 to T3 Escalation:  State 1 (Open): T2 investigating. Transition to 'Pending Dev' requires: EHR/PMS not empty, Bug Summary not empty, T2 Owner not empty, T3 Team not empty, Bug Summary from T2 Perspective not empty. |
| :---- |
| State 2 (Pending Dev): T3 working. Each sub-stage transition updates Client Bug Status and can require a Private Comment before proceeding. |
| State 3 (Returned to T2): Auto-notify T2 Owner when T3 completes and reassigns ticket. |
| This Blueprint prevents tickets from being sent to T3 with incomplete information — the most common failure mode in the escalation process. |

## **8.5  Assignment Rules — Initial Ticket Routing**

Navigate to: Setup (⚙) → Automation → Assignment Rules

| New Ticket Condition | Criteria → Assignment Action |
| :---- | :---- |
| **Email inbound to support at adit.com** | Channel \= Email AND no Classification set → Assign to Team: T1 Customer Support (round-robin) |
| **RingCentral auto-ticket** | Contact Name contains 'RingCentral' → Assign to Team: T1 Calls \+ Tag: 'contact-correction-needed' |
| **Adit Pay keyword in subject** | Subject OR Description contains 'Adit Pay' OR 'payment' → Assign to Team: TS \- Specialty |
| **SalesIQ chat origin** | Channel \= Chat → Assign to Team: T1 Chat |
| **Onboarding client deal stage** | Deal Stage \= Onboarding → Assign to Team: TechOB Routing |

# **Section 9: Views, Queues & Custom Filter Management**

## **9.1  Creating a Custom View — Step by Step**

43. Tickets module → left panel → Views → click the \+ (plus) icon

44. Enter a descriptive View Name (e.g., 'T3 Cloud Integrations — Open Bugs' or 'My Pending Customer Tickets')

45. Add Filter Criteria using AND/OR logic. Examples by role:

    * T1 agent: Assignee \= Me AND Status \= Open

    * T2 agent: T2 Owner \= Me AND Client Bug Status is not Solved and Deployed

    * T3 queue manager: Team \= \[T3 Team\] AND Status \= Open AND Assignee is empty

46. Click Manage Columns — select which fields appear in the list

47. Recommended columns: Ticket ID, Subject, Contact/Account, Status, Priority, Client Bug Status, EHR/PMS, T2 Owner, Expected Live Date, Ticket Owner

48. Set Visibility: Only Me, All Agents, or Specific Agents

49. Click Create — view appears in your sidebar under Views

| \[ SCREENSHOT PLACEHOLDER \] *Zoho Desk — Create New View panel with Filter Criteria and Manage Columns sections visible* |
| :---: |

## **9.2  Quick Filters & Saved Filters**

* Quick Filters let you drill down within an existing view without creating a new one

* Click the Filter icon (funnel) in the top-right of any ticket list → add filter criteria

* Click Save to save as 'My Saved Filter' — visible only to you, not other agents

* Access saved filters from the My Saved Filters tab in the filter pane

* IMPORTANT: Quick Filters are user-level only. The view itself is shared; the saved filter on top of it is yours alone.

## **9.3  Recommended View Setup by Role**

| Role | View Name | Key Filter Criteria | Primary Use |
| :---- | :---- | :---- | :---- |
| **T1 Calls Agent** | My Open Tickets | Assignee \= Me AND Status \= Open | Daily primary workload |
| **T1 Calls Agent** | Team Queue — Calls | Team \= T1 Calls AND Assignee is empty | FIFO pickup |
| **T1 Chat Agent** | Team Queue — Chat | Team \= T1 Chat AND Assignee is empty | FIFO pickup |
| **T2 Agent** | My Active Bugs | T2 Owner \= Me AND Client Bug Status ≠ Solved | Bug tracking |
| **T2 Agent** | Returned from T3 | T2 Owner \= Me AND Status \= Open AND Client Bug Status \= Solved | T3 return action |
| **T3 QA** | My QA Tickets | Assignee \= Me AND Client Bug Status \= QA Investigation OR QA Review Stage | Active QA work |
| **T3 Queue Mgr** | Team Open — \[Team\] | Team \= \[T3 Team\] AND Status \= Open | Queue triage daily |
| **Manager** | Team Overview | Team \= \[Team\] AND Status ≠ Closed | Team oversight |
| **Manager** | SLA At Risk | SLA Status \= Due Soon OR Overdue | Compliance monitoring |

# **Section 10: SLA Policies & Escalation Matrix**

## **10.1  SLA Concepts in Zoho Desk**

| SLA Concept | Detail |
| :---- | :---- |
| **First Response Time (FRT)** | Clock starts at ticket creation. Stops when first outbound reply sent to client. Adit target: 3 business hours for T1. |
| **Resolution Time** | Total time allowed from creation to closure. Varies by tier and priority. |
| **Business Hours** | SLA clocks count business hours only (configured in Setup → Business Hours). After-hours ticket creation does not penalize agents. |
| **SLA Breach** | Ticket passes its SLA target without the required action. Zoho Desk marks it overdue and triggers escalation rules. |
| **Pause on Pending Customer** | SLA clock pauses when status \= Pending Customer. Resumes when client responds. |
| **Happiness Rating (CSAT)** | Auto-survey sent to client after ticket closure. Client clicks Good / Neutral / Bad. Visible in ticket history and Customer Happiness report. |

## **10.2  Adit SLA Policy Targets**

| Tier / Priority | First Response Target | Resolution Target | Notes |
| :---- | :---- | :---- | :---- |
| **T1 — All inbound** | 3 business hours | Same business day (standard issues) | Primary SLA. Audited in weekly reports. |
| **T2 — High Priority** | 1 business hour (from T2 assignment) | 5 business days (target) | Based on client impact and affected locations. |
| **T2 — Medium Priority** | 4 business hours (from T2 assignment) | 10 business days (target) | Most common T2 bug category. |
| **T2 — Low Priority** | 1 business day (from T2 assignment) | 20 business days (target) | Non-urgent cosmetic or minor bugs. |
| **T3 — Engineering** | Internal SLA (not client-facing) | Tracked via Expected Live Date field | Set by engineer once investigation is complete. |

## **10.3  Configuring SLA Policies (Admin)**

Navigate to: Setup (⚙) → Automation → SLAs → New SLA Policy

50. Enter Policy Name (e.g., 'T1 Standard — 3hr First Response')

51. Select Department and Working Hours schedule

52. Define criteria that triggers this SLA (e.g., Priority \= Standard, Team \= T1 Customer Support)

53. Set First Response Time target and Resolution Time target

54. Save and activate the policy

| \[ SCREENSHOT PLACEHOLDER \] *Zoho Desk — SLA Policy configuration screen (Setup → Automation → SLAs → New SLA Policy)* |
| :---: |

## **10.4  Escalation Rules within SLAs**

| Escalation Level | Trigger | Recommended Action |
| :---- | :---- | :---- |
| **Level 1 — Warning** | 30 minutes before First Response SLA breach | Email notification to assigned agent: 'Ticket \[ID\] about to breach first response SLA.' |
| **Level 2 — At Breach** | At the moment of First Response SLA breach | Email to agent AND Team Lead. Add tag 'sla-breached'. |
| **Level 3 — Post Breach** | 2 hours after First Response SLA breach (unresponded) | Notify Manager. Consider reassigning to senior agent. |
| **Resolution Warning** | 24 hours before Resolution Time breach | Email to agent and T2 owner if applicable. |
| **Resolution Breach** | At Resolution Time breach | Email to Manager. Flag in reports. Add tag 'resolution-sla-breached'. |

# **Section 11: Integrations**

## **11.1  Zoho CRM Integration**

| Integration Feature | How It Works in Zoho Desk |
| :---- | :---- |
| **Contact Auto-Population** | Sender email matched to CRM Contact. Ticket auto-populated with Contact and Account fields. |
| **Deal Info Panel** | Left panel of every ticket shows live CRM data: Deal Stage, Owner (CSM/OB), Number of Locations, Industry. |
| **Account-Level Ticket View** | All tickets for all deals under one account appear under that account — important for multi-location clients. |
| **Contact Edit → CRM Sync** | Editing a contact's account in Desk pushes the change back to CRM. Click 'Yes, Update' when prompted. |
| **Ticket History in CRM** | From any CRM account or contact record, view all related Zoho Desk tickets. Bidirectional visibility. |

## **11.2  RingCentral Integration**

| Scenario | What Happens & Agent Action Required |
| :---- | :---- |
| **Inbound call answered** | T1 manually creates ticket. Channel \= Phone. Contact \= actual client. |
| **Missed call from client** | RC sends notification email → ticket auto-created with RingCentral as contact. CHANGE CONTACT to actual client. Call back. Send follow-up email. |
| **Voicemail left by client** | Same as missed call. Change contact. Call back. Send follow-up email. |
| **Call log documentation** | After every phone call: Private Comment using the Call Log template (Section 13.2). |

## **11.3  Zoho SalesIQ (Live Chat)**

| Feature | Agent Guidance |
| :---- | :---- |
| **Chat-to-Ticket Conversion** | Convert chat conversations requiring follow-up to Zoho Desk tickets. Verify contact and account before handling. |
| **Real-Time Resolution** | If resolved during chat: still convert to ticket and close immediately. All interactions must be logged. |
| **SLA Applicability** | Chat-origin tickets: same 3-business-hour first response SLA from time ticket is created. |
| **T1 Chat Team Queue** | Chat-origin tickets auto-routed to T1 Chat team via Assignment Rule. |

# **Section 12: Reporting, Analytics & KPI Management**

## **12.1  Reports Available in Zoho Desk**

| Report Type | Description & Access |
| :---- | :---- |
| **Standard Reports** | Pre-built reports on most common KPIs. Reports → Standard Reports. No config required. |
| **Custom Reports** | Build from scratch with drag-and-drop builder. Reports → Custom Reports → New Report. |
| **Scheduled Reports** | Any report emailed automatically on defined schedule. Reports → \[Report\] → Schedule. |
| **Advanced Analytics (Zoho Analytics)** | Full BI integration. Combine Desk \+ CRM data. Build executive dashboards. Requires Zoho Analytics account. |

## **12.2  Key Performance Indicators (KPIs)**

| KPI | Definition | Target | Where to Find |
| :---- | :---- | :---- | :---- |
| **First Response Time (FRT)** | Avg time from ticket creation to first outbound reply | ≤ 3 business hours (T1) | Reports → Standard → Agent Performance |
| **Resolution Time** | Avg time from creation to closure | T1: same day; T2/T3 bugs: by priority | Reports → Standard → Ticket Summary |
| **SLA Compliance Rate** | % tickets meeting SLA targets (FRT \+ Resolution) | ≥ 90% compliance | Reports → Standard → SLA Reports |
| **CSAT / Happiness Rating** | % closed tickets rated Good via post-close survey | ≥ 85% Good ratings | Reports → Standard → Customer Happiness |
| **First Contact Resolution (FCR)** | % tickets resolved ≤ 24 biz hours with 0 reopens | Set quarterly by CS leadership | Custom report export (FCR calc) |
| **Ticket Volume by Channel** | Ticket count by channel per period | Used for staffing planning | Reports → Custom → Group by Channel |
| **Ticket Volume by Agent** | Tickets handled per agent. Identifies load imbalances. | Monitored weekly | Reports → Standard → Agent Performance |
| **Escalation Rate** | % T1 tickets → T2; % T2 tickets → T3 | Lower \= better; used for training | Custom report: escalation transitions |
| **Client Bug Cycle Time** | Avg time from T2 escalation to T3 resolution | Benchmarked quarterly by T3 team | Custom report: Expected vs. Actual Live Date |
| **Reopen Rate** | % closed tickets reopened by client response | Target: \< 10% | Reports → Standard → Ticket Summary |

## **12.3  CSAT / Happiness Ratings Setup**

55. Setup (⚙) → Customer Happiness → Happiness Ratings → Enable

56. Configure the survey email template — keep it minimal: one-click Good / Neutral / Bad rating

57. Set which closure types trigger the survey (recommend: all closures)

58. Monitor: Reports → Standard → Customer Happiness — view by agent, team, or time period

59. Workflow Rule for Bad Ratings: Happiness Rating \= Bad → Email alert to Team Lead \+ assigned agent within 24 hours

| \[ SCREENSHOT PLACEHOLDER \] *Zoho Desk — Customer Happiness report showing ratings by agent and time period* |
| :---: |

# **Section 13: Note-Taking & Documentation Standards**

## **13.1  The Standard — What Makes a Good Private Comment?**

| Quality Standard | What It Means in Practice |
| :---- | :---- |
| **Complete** | Contains everything the next agent needs to act. No need to re-read the thread or contact the previous agent. |
| **Chronological** | Structured in the order events happened — issue, investigation steps in sequence, result of each step. |
| **Specific** | Includes exact field names checked, setting values, error messages, reproduction steps, and results. |
| **Actionable** | Ends with a clear statement of what comes next. |
| **Screenshot-Supported** | Attach screenshots when they provide evidence of the issue or the fix. |

## **13.2  Note Templates**

### **Phone Call Log Template**

| 📞 CALL LOG *Date/Time: \[Date & time of call\]* *Spoke with: \[Full name of person\]* *Callback number: \[Phone number\]* *Follow-up preference: \[Phone / Email\] — \[Email if email preferred\]* *Summary: \[Everything discussed — questions asked, answers given, configs changed, troubleshooting done, outcomes reached\]* *Next steps: \[What happens next — waiting on client / escalating / closing / etc.\]* |
| :---- |

### **Investigation / Troubleshooting Log Template**

| 🔍 INVESTIGATION LOG *Issue as reported by client: \[Client's exact words / complaint\]* *My understanding of the issue: \[Your interpretation / hypothesis\]* *Steps taken to investigate:*   *Step 1: \[What you did\] → Result: \[What happened\]*   *Step 2: \[What you did\] → Result: \[What happened\]*   *Step 3: \[What you did\] → Result: \[What happened\]* *Conclusion: \[Resolved / Unable to replicate / Needs T2 escalation / Root cause identified\]* *Next steps: \[Close / Escalate to T2 with reason / Await client / etc.\]* |
| :---- |

### **T3 Resolution Summary Template (Before Returning to T2)**

| ✅ T3 RESOLUTION SUMMARY *Fix deployed to production: \[Live Date\]* *What was fixed: \[Plain-language description of the fix — what changed and why\]* *Root Cause Analysis: \[What caused the bug — specific technical root cause in plain language\]* *T2 Owner — please verify the fix with the client and close the ticket once confirmed.* |
| :---- |

# **Section 14: Quality Standards, Audit Checklist & Best Practices**

## **14.1  Ticket Audit Checklist**

Managers use this checklist during random ticket audits. BOLD items are automatic failures if missing. Italic items are conditional — only apply if that situation arose in the ticket. Pass threshold: missing 3 or fewer applicable items.

| ASSIGNMENT & ROUTING |
| :---: |

* **Ticket picked up in FIFO order (oldest unassigned first)**

* **Assigned to Team first, then Agent — not directly to agent alone**

* \[If escalating\] T1 pre-escalation checklist fully completed before reassigning to T2

* \[If reassigned\] Routed to the correct team per routing reference

| TICKET FIELDS |
| :---: |

* **Correct contact — not RingCentral, Adit employee, or vendor**

* **Account is linked to the contact and visible on the ticket**

* Subject line is descriptive, professional, and accurate

* Classification appropriate for ticket content

* Category appropriate given classification selected

* All relevant Adit App Modules selected (or \-None-)

* Status accurately reflects current ticket state

* **\[If T3 escalation\] All Client Bug fields completed before status \= Pending Dev**

| COMMUNICATION |
| :---: |

* **First response sent within 3 business hours of ticket creation**

* **Client received email update at least once per week on any pending ticket**

* \[If voicemail\] Follow-up email sent at the same time as voicemail

* **\[If Pending Customer 5+ days\] Unresponsive Client Closeout Process followed**

* All outbound emails are professional, clear, and grammatically correct

| HANDLING & PROCESS |
| :---: |

* \[If applicable\] Merge or Split performed when appropriate

* Ticket closed promptly when resolved — not left in pending unnecessarily

* Private comments left every 2–3 days on any pending ticket

* \[If T3 return\] T2 notified, client updated, ticket closed or set to Under Observation

| NOTES QUALITY |
| :---: |

* **Notes are clear, complete — next agent can act without additional context**

* **Required templates and team-specific note formats followed**

* \[If phone call\] Log includes: name, callback number, email preference, full summary

* \[If troubleshooting\] Log includes: client issue, steps, results, resolution or next step

* **\[If T3\] RCA written in plain language before ticket returned to T2**

## **14.2  Audit Scoring**

| Score | Criteria |
| :---- | :---- |
| **PASS** | Missing 3 or fewer applicable checklist items. Coaching may be recommended for recurring gaps. |
| **FAIL** | Missing 4 or more applicable checklist items. Formal coaching session required. |
| **AUTO-FAIL** | ANY single BOLD item missing — automatic failure regardless of all other items. |

## **14.3  Best Practices**

### **For All Agents**

* Log into Zoho Desk before taking any calls or chats at the start of every shift

* Update ticket fields as you work — not at end of day. Stale fields confuse teammates and managers.

* Never use personal email to communicate with clients about support issues

* If unsure which team to route to — use the catch-all routing team (TS Routing / TechOB Routing)

### **For Team Leads & Managers**

* Review SLA compliance reports weekly. Address breach patterns before they become trends.

* Conduct random ticket audits at least twice per month per agent

* Review bad Happiness Ratings within 24 hours and conduct call review with the agent

* Keep workflows, macros, and SLA policies reviewed quarterly — automation must keep pace with evolving processes

### **For T3 Engineers & QA**

* Never communicate directly with a client — all client comms go through T2, always

* Update Client Bug Status every time the ticket changes hands or stage

* Set Expected Live Date as soon as you have an engineering estimate

* Write RCA in plain language — T2 agents who are not engineers must be able to understand and summarize it for the client

# **Section 15: Help Center & Knowledge Base**

| KB Feature | Detail |
| :---- | :---- |
| **Structure** | Sections (top-level) → Categories (sub-level) → Articles. Example: Section \= Adit Pay, Category \= Payouts, Article \= 'How to update bank details'. |
| **Visibility Types** | Public (client self-service portal), Internal (agents only), Draft (not yet published). |
| **Linking Articles to Tickets** | From inside any ticket, search KB → attach relevant article to client reply. Reduces response time on common questions. |
| **Agent Assist (Zia AI)** | Zoho's AI suggests relevant KB articles to agents based on ticket content automatically. |
| **Access** | Top navigation bar → Knowledge Base. Admins manage sections; designated KB Authors create articles. |
| **Best Practice** | Create a KB article every time you answer the same question for the third time. This directly reduces ticket volume and improves CSAT. |

# **Appendix A: Complete Team Routing Reference**

| Team Name | Route Here When... |  |
| :---- | :---- | :---- |
| **── TIER 1 ──** |  |  |
| **T1 Customer Support** | All T1 issues for tech-only clients — basic troubleshooting, how-to questions, feature walkthroughs, initial inbound call handling |  |
| **── TIER 2 — TECH SUPPORT ──** |  |  |
| **TS \- Core T2** | Advanced troubleshooting on any Adit feature (except Voice, Fax, mobile) AFTER T1 has checked settings and replicated the issue |  |
| **TS \- Specialty** | Issues specifically related to Practice Analytics or Adit Pay |  |
| **TS \- Server Installs** | Adit server application installs and reinstalls |  |
| **TS Routing** | Catch-all — need T2 but unsure which team. T2 managers sort from here. |  |
| **── TIER 2 — VOIP ──** |  |  |
| **VoIP \- CSM** | VoIP, fax, and mobile app issues for active CSM clients |  |
| **VoIP \- T2** | VoIP team-internal escalation only |  |
| **VoIP \- OB** | Phone installs and VoIP issues for onboarding clients |  |
| **VoIP \- BOPS** | VoIP bugs, outages, product issues — VoIP team-internal use only |  |
| **── TECH ONBOARDING ──** |  |  |
| **TechOB Leadership** | Manager use only |  |
| **TechOB Pod 1–12** | Assign to specific pod if you know the OB responsible for the client |  |
| **TechOB Routing** | Catch-all for TechOB. OB managers sort from here. |  |
| **── IMPLEMENTATION ──** |  |  |
| **Imp \- Account Setup** | New client account setup and initial configuration |  |
| **Imp \- Phone Orders/Returns** | Ordering or returning physical phones |  |
| **Imp \- Porting** | Phone and fax number porting requests |  |
| **── MARKETING CSM ──** |  |  |
| **MktgCSM Leadership** | Manager use only |  |
| **MktgCSM Pod A–J** | Must go to the specific pod for the client's Marketing CSM |  |
| **── OTHER ──** |  |  |
| **TechCSM** | Tech-only clients escalated beyond T1 needing additional adoption support |  |
| **Billing** | Adit invoicing and billing issues ONLY |  |

# **Appendix B: Contact Change Decision Guide**

| Scenario | Contact Shown | Correct Action |
| :---- | :---- | :---- |
| **Email forwarded by Adit employee** | Adit employee's email | Change to the actual client the email is about |
| **Missed call / voicemail from RingCentral** | RingCentral (system) | Change to actual client. Call back. Send follow-up email. |
| **Vendor / partner email** | Vendor address | Change to client the notification is about |
| **Third-party acting on behalf of client** | Third-party name | Get client written permission first. Change to client who gave permission. Document in Private Comment. |
| **Correct contact, wrong account** | Correct person, wrong account | Edit the CONTACT record to link to correct account. 'Yes, Update' in popup. |
| **Contact and account both correct** | Correct everything | No change needed. Proceed with handling. |

# **Appendix C: Client Bug Status Quick Reference**

| Client Bug Status | Meaning / When to Set It |
| :---- | :---- |
| **Open** | T2 escalated; T3 queue has the ticket but no individual has claimed it yet |
| **QA Investigation** | QA agent actively investigating — replicating the issue, checking logs |
| **Dev Investigation** | Engineer reviewing code and investigating the technical root cause |
| **Under Development** | Fix actively being coded. Set Expected Live Date as soon as ETA is known. |
| **QA Review Stage** | Fix deployed to staging/local. QA validating the fix works correctly. |
| **Ready to Go Live** | QA approved. Pending production deployment. |
| **Solved and Deployed** | Fix is live in production. Set Live Date. Write RCA. Reassign to T2 Owner. Status \= Open. |
| **Reopened** | Previously solved bug has recurred in production |
| **On Hold** | Blocked — need more info, live access, user acceptance, or client verification |

# **Appendix D: Daily Operational Checklists**

## **T1 Agent Daily Checklist**

* Log into Zoho Desk before taking any calls or chats

* Check Team Queue — pick up oldest unassigned ticket (FIFO)

* Review Agent Queue — action all tickets assigned to me

* Check Pending Customer tickets — follow up if 1–2 days since last contact

* Check Pending Adit tickets — email client update if 7+ days since last update

* Ensure all tickets have accurate statuses before end of shift

* Log all phone calls in Private Comments immediately after each call

## **T2 Agent Daily Checklist**

* Review all active T2 tickets — check Client Bug Status on escalated bugs

* Send weekly client updates on all Pending Dev tickets older than 7 days

* Check for tickets returned from T3 — update client and close

* Confirm active T3 bugs have an Expected Live Date set

* Review T1 escalations in your queue — pick up oldest first

## **T3 Queue Manager Daily Checklist**

* Check T3 team queue for new unassigned escalations (Status \= Open)

* Read Client Bug section before assigning each new ticket to QA or engineer

* Confirm all active bugs have an assigned individual owner

* Follow up on 'On Hold' tickets — check if blockers have been resolved

* Update Expected Live Date on any bugs where the ETA has shifted

* Confirm 'Ready to Go Live' tickets are actually live before marking Solved

# **Appendix E: Glossary**

| Term | Definition |
| :---- | :---- |
| **Account** | Company/practice owner in Zoho CRM. One account can have multiple Deals (locations). |
| **Agent** | Any individual with a Zoho Desk login who can view and act on tickets. |
| **Agent Queue** | Tickets assigned directly to a specific agent as ticket owner. |
| **Assignment Rule** | Auto-routing rule for new tickets based on defined criteria. |
| **Blueprint** | Structured process automation enforcing mandatory actions between ticket states. |
| **Cherry-Picking** | Selectively taking easy tickets and skipping hard ones. Strictly prohibited. |
| **CSAT / Happiness Rating** | Post-closure customer survey. Options: Good, Neutral, Bad. |
| **Client Bug Section** | Custom escalation fields: EHR, Summary, Status, Priority, T2 Owner, T3 Team, Live Date, RCA. |
| **Conversation (Reply)** | Public outbound email to the client from within a ticket. |
| **Deal** | A single office or location in Zoho CRM. |
| **Department** | Logical grouping in Zoho Desk with its own SLAs, workflows, and views. |
| **EHR / PMS** | Electronic Health Record / Practice Management System that Adit integrates with. |
| **FCR** | First Contact Resolution. % tickets resolved ≤ 24 business hours with 0 reopens. |
| **FIFO** | First In, First Out. Mandatory ticket pickup order. |
| **Macro** | One-click saved action set applied manually by agents to tickets. |
| **Master Record** | The ticket that survives a merge. |
| **Private Comment** | Internal-only note. Never visible to the client. Yellow background. |
| **Profile** | Permission layer defining feature-level access per module. |
| **RCA** | Root Cause Analysis. Required from T3 before returning ticket to T2. |
| **Role** | Permission layer defining data visibility hierarchy. |
| **SLA** | Service Level Agreement. Defined targets for first response and resolution time. |
| **T1 / T2 / T3** | Tier 1 (Customer Support), Tier 2 (Technical Support), Tier 3 (Engineering & QA). |
| **Team** | Group of agents in Zoho Desk organized around a function or queue. |
| **Team Queue** | All tickets for a team including unassigned — visible to all team members. |
| **Ticket** | Core unit of work. Every support request becomes a ticket with a unique ID and full history. |
| **Ticket Owner** | Agent currently responsible for a ticket. Must always be set alongside the team. |
| **Workflow Rule** | Automation rule that fires when a ticket is created, edited, or a field updates. |

*— End of Document — Adit Technologies Zoho Desk SOP v3.0 (2025) —*

