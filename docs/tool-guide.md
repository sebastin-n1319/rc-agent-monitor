# Tool guide for the updates writer

This guide is read by the AI that drafts process and product updates inside the tool. Add a section here whenever a feature is built or changed. Write plain facts only: what the feature is, who uses it, what people do in it, what the rules are. Do not put secrets, keys or links here.

## Navigation and roles
Admins and team leads see: Live Dashboard, Team and Access, Breaks and Roster, Calls and Summary, Bonus Guide, Tickets and Lifecycle, Transfer review (shown as Ticket audits), Alerts, Assessments, Settings, AI Agent and Debug.
Agents see: Dashboard, Break Bot, Bonus Guide, AI Writer, Log Ticket, My Ticket Stats, Ticket alerts, Transfer review, Updates, Assessments and Hall of Fame.
Nobody can sign in until an admin approves their access request in Team and Access, Access Control. Only @adit.com Google accounts can request access.

## Live Dashboard and productivity
Shows the T1 team live from RingCentral: who is available, on a call or on a break, call counts, queue waits and missed or abandoned calls. Agents have their own dashboard with their numbers for the day. Times use CST.

## Breaks, Break Bot and regularise requests
Agents record login, logout, break, BRB, training, QA and internal call events with Break Bot. Break events feed the break reports and Google Chat posts. An agent who forgot a tap can send a regularise request for the missing event and time. Any admin approves or declines it. An approved request adds the event to that day marked Regularised and does not post to Google Chat.

## Roster and schedule
The Roster page replaces the T1 CS Team Roster spreadsheet. Each agent has a daily code such as present, off, PL, UPL, SL, holiday, WFH, on duty or NCNS. Every change is kept in a history log. Schedules can be versioned and adherence (late, early, break overage) is measured against them.

## Alerts and Google Chat reports
Alerts post to Google Chat spaces and also show on the Alerts pages. Every live alert, including review alerts and escalation alerts, only posts between 7 AM and 7 PM Central time, every day. Anything still open is posted when the window opens the next morning. Each alert tile on the Alerts page has a Timing section: live ops has repeat every for queue waits and for nobody available plus how often tickets are checked, and review alerts have first alert, repeat every and stop after. Live ops alerts cover long queue waits, no coverage (nobody Available while agents are logged in), unassigned tickets and tickets assigned with no action. Chat Wing agents take chats, so they do not count toward queue call coverage. Productivity and break reports can be posted to Google Chat now or on a daily, weekly or monthly schedule. Reports use the same numbers as the dashboards.

## Ticket alerts for agents
Agents see unassigned tickets and their own tickets that are waiting for action, so they can act before a lead has to chase them.

## Tickets and lifecycle
Ticket data syncs from Zoho Desk in the background: status, channel, classification, category, module, FCR and ownership changes. Agents can log a ticket with Log Ticket and see their own numbers in My Ticket Stats. Chat counts and response times come from Zoho SalesIQ. CSAT comes from Zoho Analytics.

The department hand-off draft fills Client Name, Practice Name, Account Number (the CRM Acct Number, the short one), Deal Stage (OB, CSM or Churn from the CRM stage), Callback Number and Email from the ticket's CRM contact in AditKB, and uses the conversation only for the reason and resolution. Review alerts bot avatar: the image at /review-bot-avatar.png on the app can be used as the Avatar URL when creating the Google Chat webhook.

Message to the agent: the Approved and Needs rework forms include a message box. The tool drafts it from the ticket in the usual reviewer format (tag the agent, a short "Please ..." instruction, then Ticket ID, Subject, Department and URL), using earlier sent messages as style examples. The reviewer edits it and clicks Send to space. Nothing posts until that click. It posts to the Review alerts webhook (Alerts page, Review alerts section, set by an admin), tags the agent, and works at any hour. If no webhook is set the reviewer sees a message saying so. Idle review alerts use the same webhook, falling back to the Live ops one. A reviewer cannot send for a ticket they handled themselves.

## Transfer review and the 5 strike policy
T1 agents do not move tickets to other teams or people themselves. They set the ticket status to the review status (default name Pending Review - T1). A reviewer (SPOC) checks it within the review window, moves it to the right person in Zoho Desk and records a verdict in the tool.
Verdicts: Approved, Needs rework or Skip (Skip is only for tickets that already left the status, for example set by mistake). An invalid transfer is marked Fatal or Feedback. Fatal counts as a strike for the agent. Feedback is not a strike but the agent sees it. Strikes stay active for 90 days and a reviewer or admin can remove one.
Teams in the assign directly list skip review. If a T1 agent moves a ticket to any other team without the review status it is listed as Skipped review for a reviewer to decide, and it is never a strike on its own.
The review window is counted only between the review hours set in Review settings (default 7 AM to 7 PM Central time). If a ticket waits past the review window inside those hours, the people set in settings are tagged in Google Chat. Nobody is tagged outside review hours, and the clock resumes at the start of the next day's hours.
Each waiting ticket, and each ticket under Moved, verdict missing, shows a deal card (account and deal name on top, then stage, escalation, CSM and OB as chips, with a coloured edge for the escalation state) with the Deal history toggle and the Approved, Needs rework and Skip buttons on one row. It carries these fields: account name, deal name, deal stage, CSM, onboarding (OB) owner and escalation status. Clicking the ticket opens the deal history for the reviewer: issue history (with the account health), unsolved queries, modules usually reported, earlier transfer reviews on the same deal, a flag when three or more tickets came in within 14 days, the support journey (a timeline with open, on hold and closed tickets, labelled only where still live, and a dropdown with the full ticket list; clicking a mark opens that ticket in Zoho Desk), the agents who worked tickets, and FCR and CSAT for that deal. Issue history, satisfaction and modules come from Adit's written account analysis, and the ticket list, FCR and CSAT are live. If Adit's written analysis cannot be read, issue history and modules are derived from the account's own tickets (grouped by theme, for example repeated EHR disconnections, with a likely cause such as the Adit server or the EHR bridge). Stage and escalation status are colour coded, CSAT appears once, and an opened panel stays open when the list refreshes.
Review alerts can be tuned in Review settings or on the Review alerts tile in Alerts: first alert after a number of minutes, repeat every number of minutes, stop after a number of reminders (0 means no limit), and on or off. The tagged people are set in Review settings. These alerts post to the live ops space and never outside alert hours.
When a reviewer picks Approved, the tool drafts the hand-off message for the receiving department's Google Chat space (client name, practice, account number, deal stage, callback, email, ticket link, reason for contact, resolution). The reviewer checks it, copies it and posts it in the space. The tool never posts it. Admins save each department's space link in Review settings.
When a reviewer picks Needs rework, the tool suggests feedback based on earlier reviewer comments. Agents see tips built from their own feedback in Transfer policy. History lists every review and can be searched, so a later escalation can be traced back to its review.
The 5 strike policy: strikes 1 to 4 are a notice with the reviewer's comments, strike 5 is a verbal warning, strike 6 a written warning, strike 7 a performance improvement plan for 30 days, strike 8 and more disciplinary action.

## Ticket audits (SPOC audits)
SPOCs, who are existing agents or admins, audit tickets T1 moved to another team. They record what was missed and the ticket stays with the agent until fixed. The misses become a rule list that highlights similar tickets automatically, and can become process and product updates. A SPOC cannot audit a ticket they handled themselves.

## Escalation watch
Watches T1 tickets and calls for clients who may need an escalation and posts an alert to a Google Chat space through a webhook. Detection is keyword first: cancel, cancellation, port out, switching provider, leaving Adit, wanting past invoices, being unhappy for a long time and similar. The admin can edit the keyword list. AI reads the ticket or call to confirm and write a short summary, but AI alone needs a minimum confidence. Call confidence on its own is not enough.
If the client has no escalation on record, the alert asks the team to create one in CRM. If the client already has an escalation, no new-escalation alert is posted; the tool checks whether the agent tagged the right escalation owner in the ticket or assigned it to the right person, and flags it if not. Reviewers can mark an alert as not needed with a reason (the AI learns from these) or record what action was taken and whether an escalation was created. Alerts can be filtered and searched. Reminders repeat until someone acts.

## Assessments
Admins build assessments with a question bank, tests, results and access control. Everything is graded on the server and each question has its own clock. Question and option order are shuffled per attempt. Admins can choose reviewers per assessment, approve guests who can open only assessments, reset an attempt and retest. Agents get a bell alert when an assessment is assigned, retested, about to close or has results ready. The AI Studio turns a document, pasted text or web page into draft assessments that a reviewer edits before saving.

## Process and product updates
Updates appear on the Updates page, in the bell and on a must-read screen at sign-in that agents acknowledge. Admins can write updates for this tool only with AI help. These are not posted anywhere else.

## Notification centre
The bell collects announcements from admins, what is new in the tool, assessment updates and items meant just for one person. People can filter out categories they do not need.

## Bonus Guide and Hall of Fame
The Bonus Guide page explains the T1 CS Stars bonus. The Hall of Fame page recognises the T1 CS Stars for a quarter.

## AI Writer and AI Agent
AI Writer is a writing helper for agents. AI Agent and Debug is an admin page for the AI helper and diagnostics.

## Offline mode
The app works as an installed app (PWA). Some actions are queued when the connection drops and sent when it returns.
