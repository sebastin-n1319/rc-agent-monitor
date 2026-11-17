**ADIT PAY**

**Dispute Handling SOP**

*A guide for T2 Support agents handling card disputes on Adit Pay, for active and off-boarded practices.*

| Field | Detail |
| :---- | :---- |
| Version | 1.0 (Draft) |
| Owner | Adit Pay Team (Manager: Sebastin) |
| Applies to | All Adit Pay support agents (Calls Wing & Chat Wing) |
| Status | Interim guidance: Part 3 (off-boarded clients) reflects current system behaviour, pending a product decision on the notification gap (see Section 6\) |

# **1\. Purpose & Scope**

This SOP explains how card disputes work on Adit Pay, what an agent needs to do when one lands on a ticket, and how the process differs for a practice that has already been off-boarded. It exists because the off-boarded case currently has no automated notification path. Agents are the only safety net until a permanent fix ships.

Use this document when:

* A dispute-related ticket comes in from a practice, a patient, or is flagged internally in Asana/Slack.

* You need to explain a Stripe payout, withdrawal, or negative balance debit to a client.

* You are deciding whether a case needs escalation to the Adit Pay specialist on duty (e.g. Sandy Clark) or to the Adit Pay manager.

# **2\. Key Terms, In Plain Language**

| Term | What it means |
| :---- | :---- |
| Dispute / Chargeback | The cardholder's bank pulls money back from the merchant on the cardholder's behalf while it investigates a complaint (e.g. "service not received"). |
| Dispute fee | A flat \$15 fee Stripe charges the connected account every time a dispute is opened, win or lose. |
| Transfer reversal | Stripe clawing back the original payout amount from the practice's Stripe balance when a dispute is lost. |
| Negative balance | What's left in the connected account after a reversal \+ fee are deducted, if the account doesn't have enough funds sitting in it already. |
| Debit negative balances: On | An account setting that lets Stripe auto-pull a negative balance straight from the practice's own linked bank account rather than leaving it unpaid. |
| Withdrawn (payout status) | The label Stripe shows when it has pulled funds from the practice's bank account to cover a negative balance. It is not a new charge, it is Stripe recovering money already reversed. |
| Evidence deadline | The date by which the merchant must submit proof to contest the dispute. Set per-case by the card network, usually 7–21 days after the dispute opens. |

# **3\. How a Dispute Works: Active Client**

This is the default, fully automated flow for any practice that is still live on Adit Pay.

## **3.1 When a dispute is opened**

1. A patient contacts their bank and disputes a charge.

2. Stripe notifies Adit. The disputed amount is reversed out of the practice's Stripe balance, and a \$15 dispute fee is charged.

3. The payment is marked Disputed in Adit Pay and appears on the practice's Disputes screen.

4. If the payment was a payment plan instalment, that instalment is marked disputed too.

5. Notifications go out (see the table below).

## **3.2 Who gets notified**

| Event | Patient email | Practice email | In-app |
| :---- | :---- | :---- | :---- |
| Dispute created | Yes: "Payment Dispute" | Yes: "Important: Dispute Notification, Response Required by {date}" \+ help link | Yes: "Payment Dispute: {location}" |
| Dispute won | Not sent | Yes: "Adit Pay, Dispute Won" | Not sent |
| Dispute lost | Not sent | Yes: "Adit Pay, Dispute Lost" | Not sent |

*Note: the practice email only sends if that location has payment notifications turned on and has at least one notification address saved in its Adit Pay preferences.*

## **3.3 What the practice can do**

From the Disputes section in Adit Pay, the practice can:

* View disputes grouped as Needs Response / In Review / All / Won / Lost.

* Submit evidence to fight the dispute, with the response deadline shown.

* Accept the dispute (closes it as a loss).

* Email the patient directly.

## **3.4 Outcomes**

**Known product gap (applies to all clients, not just off-boarded)**

When a dispute is won, Adit returns the disputed amount to the practice but does not currently return the \$15 dispute fee, even though Stripe returns that fee to Adit. This is a separate open item, flag it if a client asks why the fee wasn't refunded on a win.

| Outcome | What happens to the payment | What happens to the money |
| :---- | :---- | :---- |
| Won | Status returns to Paid | Disputed amount is returned to the practice |
| Lost | Stays Disputed | Nothing, the money was already pulled back at the start |
| Warning closed | Treated the same as Won | Amount returned to the practice |

# **4\. How a Dispute Works: Off-Boarded Client**

| This is the part that needs manual agent attention There is currently no automated notification for a dispute on an off-boarded account, to the patient, the practice, or anyone at Adit. The money still moves exactly as it would for an active client. You are the control here until a product fix ships. |
| :---- |

## **4.1 What still happens automatically**

* The disputed amount is still pulled back from the practice's connected account, every time.

* The \$15 dispute fee is still charged, every time.

* If the connected account balance can't cover it and "Debit negative balances" is On, Stripe pulls the shortfall from the practice's own linked bank account (this shows as a Withdrawn payout).

* If "Debit negative balances" is Off, or the practice's bank details are no longer valid, the shortfall becomes Adit's platform liability instead.

## **4.2 What does NOT happen automatically**

* No dispute email to the patient.

* No dispute email to the practice.

* No alert to anyone at Adit, nothing today triggers this into a queue.

The reason changes over time but the result is the same: while the practice's data is still in the system, the notification is deliberately suppressed by an intentional rule. Once the data has been deleted as part of off-boarding, the notification step fails outright and the error only goes to a log file, it is never surfaced to a person. From Stripe's side, the whole thing looks successful. There is no retry and no alarm.

## **4.3 The asymmetry to watch for: money returned on a win**

Money pulled back always happens, active or off-boarded. Money returned on a win does not behave the same way. Returning funds relies on Adit's own record that the money was taken from that practice in the first place. If that record has been deleted along with the rest of the off-boarded client's data, the return step is silently skipped, Stripe credits the amount back to Adit's platform balance, and it simply stays there. The practice can end up out of pocket for the full disputed amount plus the \$15 fee on a dispute that was actually won, and nothing anywhere flags it. If you are handling a won dispute for an off-boarded practice, manually verify the refund actually reached the practice's account, do not assume it did.

| Late wins add a second version of this risk Per Stripe's own documentation, a dispute's status can occasionally flip from lost back to won after the fact (a "late win"), when the issuer credits or debits Stripe outside the normal lifecycle. Stripe cannot predict when this happens. For an off-boarded client with no one monitoring the account, a late win can land funds back with Adit and go completely unnoticed, the same silent-skip risk as 4.3, just triggered later and with no dispute ticket open to prompt anyone to check. |
| :---- |

## **4.4 Stripe's dispute timeline (for setting expectations)**

| Stage | Typical window |
| :---- | :---- |
| Payment → patient can still raise a dispute | Usually up to 120 days from the transaction (see note below) |
| Dispute raised → evidence deadline | 7–21 days, varies by card network; Stripe sets an exact date per case |
| Evidence submitted → issuer's decision | A further 60–75 days |
| Full lifecycle, start to finish | 2–3 months. Stripe does not support arbitration, so a lost dispute cannot be appealed further |

*The 120-day window is not a hard ceiling. For anything paid in advance of the service, the clock starts on the service date, not the payment date, which matters for treatment plan deposits and booking deposits. Some non-card payment methods allow up to 180 days. A dispute raised on day 120 can still be active roughly seven months after the original payment, later still for prepaid future appointments.*

# **5\. Step-by-Step: Handling a Dispute Ticket**

## **5.1 Active client**

6. Confirm the dispute in the Adit Pay Disputes screen for that location and note the response deadline.

7. Loop in the practice if they haven't already engaged, point them to the Disputes screen so they can submit their own evidence.

8. If the practice wants Adit's help interpreting the dispute reason, explain the reason code in plain terms and what kind of evidence typically helps (proof of delivery/service for "not received" claims).

9. Track the response deadline. If it's close and the practice hasn't acted, escalate to the Adit Pay specialist handling the case.

10. Once Stripe returns a decision, confirm the payment status updated correctly in Adit Pay and that any owed refund actually reached the practice.

## **5.2 Off-boarded client: interim manual process**

Until the notification gap in Section 4.2 is fixed, treat every off-boarded dispute as something that will not surface on its own. It typically reaches an agent one of two ways: an internal flag in Slack/Asana (as with the Seville Dental case), or the former client contacting Support directly after noticing an unexplained withdrawal.

11. Pull the dispute directly from the Stripe Dashboard (connected account → Payments → the disputed payment) since it won't appear in Adit Pay's Disputes screen the normal way.

12. Check the connected account balance and "Debit negative balances" setting to determine whether the practice's own bank will absorb the reversal, or whether it falls to Adit's platform account. Flag to your lead immediately if it's the latter.

13. Since the former client has no Adit Pay login, they cannot submit evidence themselves. If they want to contest the dispute, gather evidence from them by email (proof of service delivery, appointment records, prior communication with the patient) and submit it on their behalf through the Stripe Dashboard before the deadline.

14. If the deadline has already passed with no evidence submitted, the dispute is lost by default and cannot be reopened or appealed, Stripe's decision at that point is final. The only remaining avenue is the cardholder voluntarily asking their own bank to withdraw the dispute; that request has to come from the patient, not from Adit or the practice.

15. If the dispute is won, manually verify that the refunded amount actually reaches the practice's linked bank account. Do not assume the automated return step ran, see Section 4.3.

16. Log the case in the shared Asana tracker so Product has visibility into volume while the permanent fix is being scoped.

# **6\. Escalation Matrix**

**Pending product decision**

Product has been asked (Arbazkhan Pathan, per "Disputes for Off-Boarded Clients") to decide the long-term fix, options under discussion include retaining minimal dispute-relevant data through the full window, routing off-boarded disputes to a queue for Support, and confirming what happens to a practice's Stripe connected account at 

| Situation | Escalate to |
| :---- | :---- |
| Dispute on an active client, response deadline is close and practice is unresponsive | Adit Pay specialist on duty (e.g. Sandy Clark) |
| Dispute on an off-boarded client, any case | Adit Pay specialist on duty for manual handling (per Section 5.2) |
| Connected account balance insufficient and "Debit negative balances" is Off, potential platform liability | Adit Pay manager (Sebastin) \+ Vatsal Shah / Ali Jhaver |
| Won dispute, off-boarded client, refund did not visibly reach the practice | Adit Pay manager (Sebastin) \+ Engineering (data retention / notification gap) |
| Client disputes the accuracy of a support explanation already given (e.g. a prior call/email) | Pull the original ticket/call notes before replying, confirm what was actually said before sending anything new in writing |

# **7\. Client Communication Templates**

## **7.1 Explaining a dispute to an active or off-boarded client**

Use plain language. Avoid "the dispute was processed" without saying what that means in dollars.

*"A dispute was opened by the patient's bank on {date}. As part of that process, the original payment amount of {amount} plus a \$15 dispute fee were reversed from your account. Because the case was not contested before the {deadline} deadline, the decision is now final and cannot be reopened. If you have documentation showing the service was delivered, the remaining option is for the patient to contact their bank directly and request the dispute be withdrawn."*

## **7.2 Explaining a "Withdrawn" payout line**

*"This withdrawal is not a new charge. It reflects our processor recovering a negative balance created when a dispute was lost, the original payment plus the \$15 dispute fee. Because your account is set to cover negative balances automatically, this was drawn from your linked bank account rather than left outstanding."*

## **7.3 What not to say**

* Don't confirm a notification email was sent to the practice unless you have verified it in the system for that specific case, off-boarded accounts typically do not receive one (Section 4.2).

* Don't imply the dispute can be reopened or appealed by Adit once the deadline has passed, it cannot (Section 4.4).

* Don't promise a refund timeline on a won dispute for an off-boarded client without manually checking it landed, see Section 4.3.

# **8\. Client Dispute Notification Emails (3-Touchpoint Sequence)**

Active clients get these three notifications automatically (Section 3.2). Off-boarded clients get none of them automatically (Section 4.2), so for any off-boarded case, an agent must send all three manually, at the same points in the timeline an active client would have received them. Do not skip a step, each one creates a record that the client was given a fair chance to respond.

## **8.1 Touchpoint 1: Dispute Opened (send as soon as the dispute is found)**

**Subject: Action Required: Payment Dispute Opened for {Practice Name} (Response Needed by {evidence\_deadline})**

Hi {Contact Name},A payment dispute has been opened against a transaction processed through Adit Pay while your account was active with us. Because your account is no longer active, this did not reach you automatically, we are sending it manually so you have a fair opportunity to respond.Dispute details:Patient: {Patient Name}Amount disputed: {amount} (plus a \$15 dispute fee)Reason: {dispute\_reason}Dispute opened: {open\_date}Evidence deadline: {evidence\_deadline}If you have documentation showing the service or product was delivered (appointment records, treatment notes, prior communication with the patient), please send it to us before the deadline above and we will submit it on your behalf. If we do not hear from you by the deadline, the dispute will be resolved automatically in the cardholder's favor and cannot be reopened afterward.Best regards,{Agent Name}Adit Pay Support

## **8.2 Touchpoint 2: Evidence Deadline Reminder (send 2-3 days before the deadline if no response yet)**

**Subject: Reminder: {days\_remaining} Days Left to Respond to Dispute for {Practice Name}**

Hi {Contact Name},This is a follow-up to our earlier email about the payment dispute for {Patient Name} ({amount}). We have not yet received a response.The evidence deadline is {evidence\_deadline}, {days\_remaining} days from today. After this date, the decision becomes final and cannot be appealed or reopened, regardless of the circumstances.If you have supporting documentation, please send it to us as soon as possible so we can submit it before the deadline. If you do not intend to contest this dispute, no action is needed and it will resolve automatically.Best regards,{Agent Name}Adit Pay Support

## **8.3 Touchpoint 3: Outcome Notification (send as soon as Stripe returns a decision)**

**Subject: Dispute {Won / Lost}: {Practice Name}, {Patient Name}**

Hi {Contact Name},The dispute for {Patient Name} ({amount}) has been resolved.Outcome: {Won / Lost}If won: the disputed amount of {amount} has been returned to your account. Please allow a few business days for it to reflect. Note that the \$15 dispute fee is not refunded, this is standard across all Adit Pay accounts.If lost: the disputed amount and \$15 fee remain deducted, consistent with the dispute reversal that occurred when the case opened. This decision is final and cannot be appealed through Adit or Stripe. The only remaining option is for the patient to contact their card issuer directly and request a withdrawal of the dispute.Please let us know if you have any questions about this outcome.Best regards,{Agent Name}Adit Pay Support

| Off-boarded cases: verify touchpoint 3 before closing the ticket For an off-boarded client, sending the outcome email is not enough on its own. Before closing the ticket, confirm in Stripe that a won dispute's funds actually reached the practice's account (Section 4.3). Do not rely on the automated return step, it does not run reliably for off-boarded accounts. |
| :---- |

*Source for Part 1-2 content: internal document "Disputes for Off-Boarded Clients: Current Behaviour." Stripe timeline reference: docs.stripe.com/disputes/how-disputes-work. This SOP will be updated once Product finalizes the off-boarded dispute handling decision.*