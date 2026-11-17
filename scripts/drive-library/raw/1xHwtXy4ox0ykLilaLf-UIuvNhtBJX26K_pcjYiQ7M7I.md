**ADIT PAY**  
**ACH & Convenience Fees**

Complete Process Document

| THE ONE SENTENCE THAT MATTERS MOST Convenience Fee is patient-facing and card-only, the patient pays it. Bank/ACH cost is practice-facing and bank-only, the patient never sees it. They are opposite in both directions, and confusing them is the single most common mistake across every team. |
| :---- |

# **Contents**

Part 1: Executive Summary

Part 2: Convenience Fees, Complete Reference

Part 3: Bank/ACH Payments, Complete Reference

Part 4: Talking About It, Setting It Up, and Supporting It

Part 5: Comprehensive FAQ

Part 6: Open Questions and Decisions Still Pending

Appendix A: Fee Reference Tables

Appendix B: Glossary

Appendix C: Decision History

# **Part 1: Executive Summary**

Adit Pay is introducing two related but functionally opposite features. Both exist to change who bears the cost of processing a payment, but they move that cost in opposite directions, to different parties, on different payment methods, under different rules.

## **Convenience Fees**

Today, when a patient pays by card, the practice absorbs the processing cost silently. Convenience Fees let the practice pass that cost to the patient instead, on one-time card payments, fully disclosed as its own line item before the patient pays. This is not a surcharge, and the distinction matters legally: the fee applies uniformly across card types, the patient always has a fee-free way to pay (in person, or by bank where offered), and it is fully disclosed. Those three properties are what keep it out of surcharge regulation.

## **Bank/ACH Payments**

Patients can pay directly from a bank account instead of a card. This was originally scoped to payment plans and subscriptions only; it has since been expanded to one-time payments as well, through specific staff- and patient-initiated flows. The cost to move money this way is lower than a card, and that cost is carried entirely by the practice through Adit, never by the patient. In exchange for the lower cost, the practice accepts two real trade-offs: settlement takes 1 to 4 business days rather than being instant, and a bank payment can still fail or be disputed days after it first looked successful, a risk that does not exist on the card rail.

## **Why this document exists**

The risk with a feature like this isn't any one mistake, it's inconsistency: someone promising a capability that doesn't exist, someone else calling a real fee discrepancy a bug, someone enabling a feature where it isn't actually offered. All of those come from the same root cause, working from memory or a stale conversation instead of a current reference. Part 4 is written to give one consistent answer for how to talk about this, set it up, and support it, so that answer is the same no matter who a client happens to be talking to.

# **Part 2: Convenience Fees, Complete Reference**

## **2.1 What it is, and why it works this way**

A Convenience Fee is a fee charged for the convenience of paying through an alternate payment channel, such as online or by text-to-pay, rather than in person. Card network rules (Visa, Mastercard) permit this specific structure, distinct from a surcharge, provided several conditions are met simultaneously: the fee applies uniformly across every card-based method in the channel (credit, debit, Apple Pay, Google Pay, not selectively to just one), the patient has a genuine fee-free alternative (paying in person, or by bank where offered), and the fee is disclosed as its own line item before the patient completes payment. Adit Pay's implementation is built around satisfying all three simultaneously, which is what allows it to be called a Convenience Fee rather than a surcharge.

Both features are configured in the same place: Adit Pay \> Preferences \> Payment Request. This is the actual settings screen every practice sees:



*Adit Pay \> Preferences: Convenience Fee and Bank/ACH toggles, and the fee-rate disclosures shown to the practice*

## 

## 

## 

## **2.2 The rate structure, and the math behind it**

| Scenario | Rate | When it applies |
| :---- | :---- | :---- |
| Card-present | 2.25% \+ \$0.20 | Terminal (tap, insert, swipe) |
| Card-not-present | 2.9% \+ \$0.30 | Online, text-to-pay, phone, manual entry |

The fee is not simply the rate multiplied by the service amount. It is solved so that after the fee is added and the practice's own processing cost is deducted from the new, larger total, the practice still nets exactly the original service amount. The formula: Total Charged \= (Service Amount \+ fixed fee) / (1 \- percentage rate).

### **Worked examples, card-not-present (2.9% \+ \$0.30)**

| Service Amount | Total Charged | Fee | Practice Nets |
| :---- | :---: | :---: | :---: |
| \$100.00 | \$103.30 | \$3.30 | \$100.00 |
| \$500.00 | \$515.24 | \$15.24 | \$500.00 |
| \$1,000.00 | \$1,030.18 | \$30.18 | \$1,000.00 |
| **A KNOWN, ALREADY-CORRECTED ERROR** An earlier, simpler calculation (service amount times the rate, plus the fixed fee, with no gross-up) produced \$29.30 on a \$1,000 bill instead of the correct \$30.18. That earlier figure appeared in some design materials and has since been corrected. If you ever see \$29.30 quoted anywhere as the fee on a \$1,000 card-not-present payment, treat it as the old, incorrect figure, not a second valid answer. |  |  |  |

This breakdown is visible in two places in the app: the Payments list, and each transaction's own Payment Details page.



*The Payments list, with Service Amount and Conv. Fee shown as separate columns, and a Method column distinguishing Card from Bank*



*A single transaction's Payment Details page: Service Amount, Convenience Fee, Total Amount, Processing Fee, Net, and Status, in that order*

## 

## 

## **2.3 Where it applies, and where it never can**

| Situation | Convenience Fee? |
| :---- | :---- |
| One-time card payment (in office, text-to-pay, online) | Yes, if the location has it enabled |
| Payment Plan or Subscription, any payment method | Never, by card network rule, not an Adit choice |
| Bank/ACH payment, any context | Never |
| HSA/FSA card | Never |
| CareCredit (patient financing) | Never, the amount is pushed to CareCredit without any fee added |
| Practice located in CT, ME, MA, or Canada | Never, feature is blocked entirely for that location |

Eligibility for the state/country restriction is based on the practice location's address on file, not the patient's billing address. In a multi-location organization, each location is evaluated independently, so one location can offer the fee while a sibling location in a restricted state cannot.



*The state-exclusion tooltip shown directly in the setup flow, listing Connecticut, Maine, and Massachusetts (Canada is excluded separately)*

## **2.4 Edge cases worth knowing**

### **Merging a direct payment into a fee-bearing request**

If a practice merges an offline or direct payment into an open request that already carries a Convenience Fee, and the payment actually received did not include the fee, the system removes the fee from the request as part of the merge, after a confirmation prompt. This is expected behavior. A practice or patient who notices the total drop after a merge is not looking at a bug.

### 

### 

### **Editing an already-open request**

The "Include Convenience Fee" option on an edit screen defaults to checked if the location has the fee enabled, and the entire section is hidden, not just unchecked, if the location has it disabled. If a patient already has another open request, a new request combines with the existing balance first, and the fee is calculated once on the full combined total, not recalculated per request.



*Editing an open Payment Request: the Include Convenience Fee checkbox, with the fee and final amount recalculating live*

### **Bulk Payment Requests**

A bulk send has three distinct states to be aware of: without the fee at all, with the fee available but toggled off for that specific send, and with the fee toggled on by default. In the third state, a patient with no new balance due correctly shows a dash for their fee amount, not a zero-dollar line, since there is nothing to calculate a fee against.



*Bulk Payment Request, Confirm Request Amount step: without the fee, with it toggled off, and with it toggled on by default (left to right)*

### 

### 

### 

### **The patient receipt**

Whatever the practice sees on the Payment Details page, the patient sees the same breakdown on their own receipt: Service Amount, Convenience Fee, and Total Amount Paid as three separate lines.



*Patient receipt showing the Convenience Fee as its own disclosed line item*

### **Disabling the feature**

Turning Convenience Fees off does not require the same confirmation treatment for Treatment Plan payments or Booking/online-scheduling payments, that extension was considered and explicitly decided against.

# **Part 3: Bank/ACH Payments, Complete Reference**

## **3.1 What it is, and the account structure underneath it**

Each practice operates on a Stripe Custom connected account, created and managed by Adit through the API, the practice never registers with Stripe directly. Every bank payment is structured as a destination charge: the money is taken on Adit's own platform account, the practice is named as the business the charge is on behalf of, and the funds are then transferred to the practice's connected account. Adit's own fee is taken on that same charge through Stripe's application fee mechanism.

The consequence that shapes everything else in this section: because the charge originates on Adit's platform account, every Stripe-side fee, whether for processing, a return, or a dispute, lands on Adit first. Whether and how much of that gets passed to the practice is a separate pricing decision, addressed in Part 6\.

## **3.2 Getting a bank account on file**

Nothing can be charged until a bank account is saved and verified. There is no path in the product where a patient simply types in bank details and pays immediately.



*Setting up a Payment Plan: choosing to manually add a payment method or request one from the patient*



*Managing saved payment methods on a plan, including the confirmation before removing one*



*Requesting a payment method from a patient: a plan can hold both a saved card and a saved bank account at the same time*



*The patient's own view: plan details, then the secure bank login sequence (log in to bank, retrieving accounts, confirm) through to "Your Payment Plan is now Active\!"*

|  | Patient adds it | Practice adds it |
| :---- | :---- | :---- |
| Where | Plan/subscription activation link, payment-method request link | Adit Pay app, Add Payment Method dialog, Bank tab |
| How | Signs in to their bank (secure login) | Not available today, manual entry has been removed |
| Verified | Instantly, on successful login | N/A |
| **A DECISION THAT REVERSED ITSELF, KNOW BOTH STAGES** Manual bank verification (typing a routing and account number) was originally approved as a practice-level opt-in, available if a practice chose to turn it on, off by default. That decision was later superseded: manual verification is being removed entirely, not just left off by default, based on Stripe confirming that secure bank login (Financial Connections) already covers more than 97% of US bank accounts. If you see manual entry described as "something a practice can enable" anywhere, that reflects the earlier decision. The current state is that it does not exist as a choice at all, unless customer demand brings it back. |  |  |

Where a bank can be newly added is also restricted: only via "Request Payment Method" on the patient's card, or via Payment Plan activation, never directly from a one-time charge screen. A bank already on file, however, can still be used to charge a one-time request through Charge Payment on File or Quick Text.

A patient may keep one bank account on file at a time. Cards are a separate limit, capped at ten. Attempting to add a second bank is rejected outright, and attempting to add a duplicate of the same bank is rejected with a specific message.

## 

## 

## **3.3 Verification limits, and what happens if they're exceeded**

For the standard secure-login route, verification is instant on successful login. In the earlier manual-entry model (now removed, but relevant to understand why the decision was made), Stripe imposed hard limits: ten days to confirm two test micro-deposits, and a capped number of attempts, more attempts allowed on a descriptor code than on the deposit amounts themselves. Once either limit was hit, that specific bank account could never be verified again, not by retrying, not by any support intervention, the entry stayed on file, dead, and because of the one-bank-per-patient limit, no replacement could be added until the dead one was removed.

## **3.4 Balance checking before a charge**

The decision, settled after real debate about timing: check the available balance every single time before charging, and check it at the moment of the actual charge, never when the bank is first added.

The reasoning for charge-time over add-time is worth understanding, not just accepting. A balance is a snapshot. Checking it when a bank is added says nothing about what will be available when a scheduled installment runs weeks or months later. A patient who looks short today may have the funds next month; a patient whose account looks funded today could be short by the time a future installment actually runs. The only balance that means anything is the one read at the moment of the debit itself, so banks are added freely from every entry point, with no gating balance check at add-time, and the check runs fresh at every single charge.

This check only works for accounts linked through secure bank login, since that is what creates the Financial Connections link the balance is read from. It is not free: Financial Connections and each balance read are separately billed by Stripe, a real cost Adit carries, not the practice, which is why widening this check further is a spending decision as much as a product one.

If a balance cannot be read for any reason, the payment proceeds exactly as it would without the check. A balance that could not be read must never become the reason a patient's payment is refused.

## **3.5 Taking a payment: one-time vs. payment plans**

### **One-time bank payments**

Originally, Bank/ACH was scoped to payment plans and subscriptions only, one-time payments stayed card-only by design. That premise was later explicitly overturned: one-time bank payments are now real and supported, through three specific routes.

| Route | Who starts it |
| :---- | :---- |
| Text-to-pay link | Patient, opening a payment request and paying with their saved bank |
| Quick Text | Staff, charging the saved bank; a payment request is created on the spot |
| Collect Payment | Staff, charging the saved bank from within the app |

The Bank/ACH option was deliberately removed from the Collect Payment flow specifically, a practice can still collect via bank, but only through Charge Payment on File instead, two different entry points with different bank availability by design, not an oversight.



*Charge Payment on File: select method, add or select a card (note the "Convenience Fee Applied" badge), confirm, and the receipt*



*Manual Card Entry, a worked example: \$10.00 service becomes \$10.61 with the fee applied*



*Collect Payment: the same flow branches into two different outcome screens depending on method. Card carries a Convenience Fee line; Bank Payment Processing does not*

### **Payment plans and subscriptions**

A plan has up to three distinct kinds of bank payment, and each behaves differently on failure: the deposit taken at activation, the scheduled recurring installments, and one-off payments staff take against the plan directly.

A plan activates at the moment the bank details are entered and submitted, it does not wait for the deposit to actually clear. The system trusts the deposit will land rather than holding activation for the several days settlement takes.

## **3.6 Settlement timing**

A bank payment is never instant. It is accepted immediately and enters a Processing state, then settles in 1 to 4 business days. This exact wording, "Bank payments typically take 1 to 4 business days to complete," replaced an earlier, less accurate line that implied only the first payment from a given account was slower, which is not true, the 1-to-4-day window applies to every bank payment, first or hundredth.

## **3.7 When things go wrong: returns and disputes**

This is the section most likely to be misunderstood by anyone used to how card payments fail, because bank payments do not fail the same way.

### **A payment can bounce after it already looked done**

A bank payment can be returned days after it settled, for insufficient funds, a closed account, or a withdrawn authorization. There is no card equivalent to this, a card payment that clears has cleared. When it happens, it generally arrives through Adit's systems as a dispute, not as a simple failed-payment notice, which is an important distinction for anyone explaining this to a client: it looks and is handled like a dispute, with its own fee, even though the underlying cause may just be an ordinary insufficient-funds return.

### **Bank disputes are fundamentally different from card disputes**

Card payments have a formal representation process: evidence is submitted, a network judges it, and a merchant can win. Bank payments, moving through the ACH network, do not have an equivalent. Disputes within stated timeframes are considered final and uncontestable through that network. A "Counter dispute" option exists, but it only passes evidence to the patient's bank, whether the bank acts on it is entirely at the bank's discretion, and there is no appeal after that. The realistic posture for a bank dispute is to treat the money as gone and, where appropriate, resolve it directly with the patient rather than expect to win it back through the network.

The dispute fee is charged regardless of outcome, win, lose, or accept. A patient has 60 calendar days to dispute from a personal account, but only 2 business days from a business account, and in rare cases a bank can allow a dispute outside even those windows entirely at its own discretion.

### **What happens to the bank account after a dispute**

A dispute invalidates the mandate, the patient's standing authorization, tied to that account. It cannot be charged again without the patient authorizing it afresh. A second dispute on the same account causes Stripe to block it outright, no further attempts will even reach the bank after that point.

### **Refunds work differently too**

|  | Card | Bank |
| :---- | :---- | :---- |
| Time to complete | Immediate | Up to 3 business days |
| Can be cancelled once submitted | N/A | No |
| How the patient sees it | Labeled as a refund | An unlabeled credit, referencing the original payment |
| Refund window | N/A | 180 days from the payment |
| Partial refunds | Yes | Unresolved, see Part 6 |

Two details worth repeating to any client asking about a bank refund: the patient will not see the word "refund," it arrives as an unlabeled credit and is easy to miss, so the practice should proactively tell the patient to expect it. And a refund does not stop a dispute, a bank payment can still be disputed for up to 60 days including after it has already been refunded, which, if it happens, returns the funds to the patient twice with no guaranteed way to recover the second instance without the patient's cooperation. Because of this real risk, ACH refunds carry the same warning Stripe shows in its own dashboard, presented in a popup with a link to Stripe's own article on the subject, before the refund is confirmed.

## 

## 

## **3.8 Card fallback logic**

Fallback to a card only happens in exactly one circumstance: a scheduled installment that the plan itself charges automatically on its due date. The default card is tried first, then the patient's other cards, most recent first.

It does not happen anywhere else. Whenever a person, whether staff or the patient, manually selects a payment method and that specific charge fails, the system does not silently try something else, it prompts a retry or a different manual selection instead. The reasoning is consistent across every case: a person was there and deliberately chose that method; substituting something else without them knowing would mean money moving by a method nobody actually authorized for that moment.

| Bank payment | Card fallback if returned? |
| :---- | :---- |
| Scheduled installment, charged by the plan itself | Yes, default card then others |
| Installment where staff pressed Collect Payment | No |
| Collect Payment on the plan (extra payment) | No |
| Deposit at plan activation | No |

One consequence worth flagging on its own: when a scheduled installment fails on the bank but the card fallback recovers it successfully, no failure notice goes to anyone. The patient receives an ordinary success receipt, and the practice is not told the bank attempt failed at all. This silent recovery is convenient in the moment but is also the exact mechanism that lets a patient's cancelled bank authorization go unnoticed for months, since every recovered payment looks completely normal from the outside.

## **3.9 What Bank/ACH costs, and who pays it**

| Charge point | Amount | Who pays it |
| :---- | :---- | :---- |
| Stripe's own processing rate | 0.8%, capped at \$5.00 per payment | Adit (Stripe's published US rate) |
| Practice-facing transaction cost | 0.5% \+ \$1.75 per transaction | The practice, this is Adit's own fee, never shown to the patient |
| Payment returned by the bank | \$4.00 observed on testing | Adit currently absorbs this |
| Payment disputed by the patient | \$15.00 | Adit currently absorbs this, non-refundable regardless of outcome |

Worked examples of the practice-facing 0.5% \+ \$1.75 rate: a \$100 bank payment costs the practice \$2.25, a \$500 payment costs \$4.25, and a \$1,000 payment costs \$6.75. No fee is ever charged simply for adding or verifying a bank account, only when an actual payment is processed.

Whether the \$4.00 return fee and \$15.00 dispute fee eventually get passed to the practice, in full, in part, or not at all, is a pricing decision that has not yet been made. See Part 6\.

## 

## **3.10 Notifications: who hears what, when**

Three patterns run through every notification table in the product, worth internalizing rather than memorizing every row:

- Processing is practice-only, everywhere. The patient never hears that a bank payment is in flight, only that it succeeded or failed.

- The patient hears about a failure only when there is something they can do about it, and every such message carries a link to act. The two exceptions are a bounced plan deposit and a returned extra payment, in both cases the patient never actually owed the money in the first place, so there is nothing to chase them for.

- A failure that gets silently recovered on a card sends no failure notice to anyone, as covered in 3.8 above.

### **One-time bank payments**

| State | Patient Email | Patient SMS | Practice Email | Practice In-App |
| :---- | :---- | :---- | :---- | :---- |
| Processing | No | No | Yes | Yes |
| Paid | Yes | Yes\* | Yes\*\* | Yes |
| Failed | Yes | Yes | Yes | Yes |

*\* Only if the practice has configured a confirmation-text message; there is no default text, so if none is set the patient text is skipped entirely.  \*\* Only if the practice's payment-notification setting is on.*

### **Payment plans**

| State | Patient Email | Patient SMS | Practice Email |
| :---- | :---- | :---- | :---- |
| Deposit, Processing | No | No | Yes |
| Deposit, Paid | Yes | No | Yes |
| Deposit, Returned | No | No | Yes |
| Installment, Processing | No | No | Yes |
| Installment, Paid | Yes | No | Yes |
| Installment, returned then recovered on a card | No (ordinary paid email only) | No | Yes |
| Installment, returned and not recovered | Yes | Yes | Yes |

## 

## 

## 

## 

## **3.11 What doesn't exist today**

| Limitation | Detail |
| :---- | :---- |
| Manual bank entry | Removed; secure login is the only way to add a bank |
| Mobile app support | Neither feature exists on mobile, which still runs an older primary/secondary card model and lacks the Charge-Payment-on-File and multi-card infrastructure both features depend on |
| Canada | Bank/ACH never appears for a Canadian location, under any setting |

# **Part 4: Talking About It, Setting It Up, and Supporting It**

## **4.1 What a patient actually sees**

This is the public payment page a patient reaches, worth having open whenever you're explaining either feature to someone who hasn't seen it:



*The public payment page a patient sees: Apple Pay, Google Pay, CareCredit, and Credit Card, with the fee disclosed in the header*

*One caution if you're using this exact screen live: some reviewed versions of this page have shown inconsistent fee labeling between Apple Pay and Google Pay specifically, still being confirmed as a design artifact rather than real behavior. If someone asks about it, don't assert either answer, say it's being verified.*

## **4.2 How to talk about it**

### **Positioning**

- Convenience Fees recover money a practice is already losing, silently, on every card transaction today. This is a recovery story, not a new cost to the practice.

- Bank/ACH is strongest for practices running significant payment plans, financing, or memberships, the per-transaction savings compound with every installment.

- Both are free to enable and fully opt-in. There is no separate contract, tier, or setup fee to explain.

### 

### **What never to promise**

- Manual bank entry, it doesn't exist.

- Mobile app support for either feature.

- Canada coverage for Bank/ACH.

- A guaranteed outcome on a bank dispute, there isn't one.

### **Example dialogue: introducing the feature**

**Prospect:** *So if we turn this on, does it cost us anything?*

**Rep:** No setup cost. Convenience Fees actually recovers money you're already spending on card processing today, and Bank/ACH costs less per transaction than a card does, so it's a savings on your existing payment plans.

**Prospect:** *What if a patient's bank isn't supported?*

**Rep:** They'd pay by card instead for that one. There's no manual bank entry option today, so coverage depends on secure bank login, which covers the large majority of US banks.

### **Example dialogue: the single most common question you'll get**

**Client:** *Why is this fee more than 2.9%?*

**Agent:** Great question, the fee is calculated so you always receive the full amount you billed, not a few cents less. If we just added 2.9% and 30 cents on top, the processing cost on that new, larger total would eat into what you actually keep. So the fee is solved backward from your full amount, which is why it lands a little higher than a simple percentage.

## **4.3 Setting it up**

The full runbook for turning either feature on for a practice:

1. Confirm the practice's state before enabling Convenience Fees. Do not enable for Connecticut, Maine, Massachusetts, or a Canadian location.

2. Confirm the practice is US-based before enabling Bank/ACH. There is no partial or fallback support for Canada.

3. Navigate to Adit Pay \> Preferences for the location and toggle on whichever feature(s) the practice wants.

4. Confirm the displayed rate note matches Part 2 (Convenience Fees) or Part 3 (Bank/ACH) of this document exactly. If it doesn't, stop and escalate rather than proceeding on a mismatch.

5. Run a \$1 test transaction on each newly enabled method before the practice processes a real patient.

6. Confirm with the practice that both settings are mirrored automatically into their Getting Started flow, nothing further needs to be configured there separately.

### 

### **Common setup mistakes to avoid**

- Enabling Convenience Fees without checking the practice's state first, this is the single most common configuration error.

- Trying to configure manual bank verification, there is no toggle for it because it no longer exists.

- Assuming a bank added at one location automatically works at a sibling location of the same practice, it does not; each location's bank authorization is separate.

## **4.4 Supporting it after launch**

What to handle directly, and what to escalate rather than guess at:

| Situation | Handle it yourself | Escalate instead |
| :---- | :---- | :---- |
| Client asks why the fee isn't exactly rate x amount | Yes, use the gross-up explanation above |  |
| Fee amount doesn't match the correct formula |  | Yes, this is a real bug, bring the transaction ID |
| Client wants manual bank entry enabled | Explain it isn't available today |  |
| Bank payment bounced days after looking successful | Yes, explain this is expected on this rail |  |
| Client asks whether return/dispute fees will be passed to them |  | Yes, not yet decided |

The two public KB articles are safe to send directly to any client for either of the situations above that you can handle yourself:

- "Convenience Fee vs. Surcharge", explains the fee math and the compliance distinction, in plain language.

- "Manage Payment Disputes", covers submitting evidence and accepting a dispute.

## **4.5 Keeping this accurate**

- This document is only as good as its last update. Manual verification, mobile support, and fee-passthrough (Part 6\) are all active decisions, not settled facts.

- If a client is given incorrect information because a section here was stale, that's this document's error to fix, not the person who repeated it.

- If you notice anything in this document that no longer matches what the product actually does, say so before continuing to use it as a reference.

# **Part 5: Comprehensive FAQ**

### **Convenience Fees**

- Can a practice set its own rate? No, the rate is fixed by card-present vs. card-not-present, not configurable per practice.

- Does a Convenience Fee ever apply to a bank payment? Never, under any circumstance.

- What happens to the fee if a request is merged with a fee-less direct payment? The fee is stripped from the request as part of the merge, after confirmation.

- Is this legal? Yes, provided it meets card network rules: uniform across card methods, a genuine fee-free alternative exists, and it is disclosed before payment. Adit Pay's implementation is built to satisfy all three.

### **Bank/ACH Payments**

- Why can't a patient just type in their bank details anymore? Manual entry was removed because secure bank login already covers more than 97% of US bank accounts, and the manual route carried real verification-limit and fraud risk without commensurate benefit.

- What happens if a bank payment fails on a plan installment? The plan tries the patient's cards next, in order. If that succeeds, nobody is notified of the bank failure. If it fails too, both patient and practice are notified and the plan is flagged.

- Can a patient dispute a bank payment after it's been refunded? Yes, for up to 60 days, and if they do, the funds return to them a second time with no automatic way to recover it.

- Does adding a bank account cost anything? No, only an actual processed payment carries a fee.

- Why does a returned bank payment show up as a dispute? Because Adit's systems generally receive both a late return and a genuine patient dispute through the same channel, so both are handled through the same dispute-fee mechanism.

### **Cross-cutting**

- Can a practice enable one feature without the other? Yes, the two toggles are fully independent.

- Which teams need to know all of this in depth? Everyone in this training, but the level of depth differs, see Part 4 for what each team specifically owns.

# **Part 6: Open Questions and Decisions Still Pending**

These are not gaps in this document, they are genuinely undecided as of this writing. Do not answer any of these definitively to a client; escalate instead.

- Whether the \$4.00 return fee and \$15.00 dispute fee get passed to the practice, in full, in part, or not at all. Currently Adit absorbs both.

- Whether partial refunds are actually supported on a bank payment, Stripe's own published capability list and Stripe's own dashboard behavior disagree with each other, and this has not been resolved with Stripe directly.

- Whether to pay for the additional Account Owners name-match API call (roughly \$1.50 per bank added) on top of the balance check, or rely entirely on the ownership verification Stripe already performs during secure login.

- The exact status labels a plan and its deposit should show when a deposit fails after the plan has already activated.

- Whether mobile app support for either feature is in scope for a near-term release or a later one, contingent on mobile's card infrastructure being brought up to the web app's model first.

- Whether a returned or disputed bank account should be visually marked in the product (for example, an "Invalid" label) so staff can see it before attempting to charge it again, rather than discovering it only when a charge fails.

# **Appendix A: Fee Reference Tables**

## **Convenience Fee**

| Scenario | Formula | \$100 example | \$1,000 example |
| :---- | :---- | :---- | :---- |
| Card-present (2.25% \+ \$0.20) | (Amount \+ 0.20) / (1 \- 0.0225) | \$102.51 | \$1,023.22 |
| Card-not-present (2.9% \+ \$0.30) | (Amount \+ 0.30) / (1 \- 0.029) | \$103.30 | \$1,030.18 |

## **Bank/ACH**

| Charge | Rate | \$100 | \$500 | \$1,000 |
| :---- | :---- | :---- | :---- | :---- |
| Practice-facing transaction cost | 0.5% \+ \$1.75 | \$2.25 | \$4.25 | \$6.75 |

# **Appendix B: Glossary**

- Card-present: the physical card is tapped, inserted, or swiped, typically at a terminal.

- Card-not-present: the card number is entered rather than physically read, online, by phone, or manually.

- Financial Connections: Stripe's secure bank-login mechanism; creates the link a balance check reads from.

- Mandate: the patient's standing authorization for a practice to debit their bank account, held by Stripe.

- Destination charge: the Stripe charge structure Adit uses, money is taken on Adit's platform account and transferred to the practice's connected account.

- Settlement: the point at which a bank payment's funds are confirmed to have actually moved, 1 to 4 business days after the charge was accepted.

- Gross-up: the calculation method that solves for a total charge such that, after fees are deducted from that total, the original service amount remains intact.

# **Appendix C: Decision History**

A brief chronology, useful for understanding why current behavior is what it is, not just what it is.

- Initial scope: Bank/ACH proposed for payment plans and subscriptions only; one-time payments to remain card-only.

- Balance checking decided: check every time, at charge time, never at add-time.

- Manual verification approved as a practice-level opt-in, off by default.

- One-time Bank/ACH later approved via Quick Text, Collect Payment, and Text-to-pay, overturning the initial scope.

- Card fallback logic finalized: only for a plan's own scheduled charges, never for anything staff- or patient-initiated.

- Processing-state notification behavior finalized: patients are not notified while a payment is in flight, only at the outcome.

- The "3 to 4 days to be fully verified" copy corrected to "1 to 4 business days to complete," removing the inaccurate implication that only a first payment is slower.

- Manual verification decision reversed: removed entirely, based on Stripe confirming secure login covers over 97% of US bank accounts.

*Source: Adit Pay technical documentation, the Stripe integration reference, the full decision log, and the public KB articles referenced throughout.*





























