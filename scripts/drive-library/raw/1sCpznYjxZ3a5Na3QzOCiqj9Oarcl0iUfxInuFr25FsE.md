**ACH & Convenience Fees: Training, Coaching & QA Manual**

**Part 1: Training & Coaching Guide**

## **1\. Payments**

*Why it matters: this is the list every agent lives in day to day. If the fee columns are wrong or missing, agents can't answer a practice's most common question. "why did this patient pay more than the invoice?". Without digging into the detail page.*

### **Walkthrough**

1. Open Adit Pay \-\> Payments. It defaults to the "All" tab.

2. Glance at the KPI row up top: Amount Processed, Convenience Fees, Processing Fees, Refunds, Disputed.

3. Each row should show Service Amount and Conv. Fee as two separate columns, not one combined "Amount."

4. Every row needs a Method column too, showing Card or Bank.

5. Select a group and click "Select All". The header should read "ALL Requests Selected," not a row count.



*Payments list: new fee columns, plus the card-present / card-not-present fee formulas*

### **Fee math you'll be asked about**

* Card-not-present (2.9% \+ \$0.30): Final Charge \= (Desired Amount \+ \$0.30) / (1 \- 0.029). A \$100 service becomes \$103.30. Adit's processor takes \$3.30, the practice nets exactly \$100.

* Card-present (2.25% \+ \$0.20): Final Charge \= (Desired Amount \+ \$0.20) / (1 \- 0.0225). A \$100 service becomes \$102.51.

### **Talk track**

**Q: Why is this patient's Convenience Fee different from another patient who paid the same amount?**

**A:** Card-present and card-not-present transactions use different formulas (2.25%+\$0.20 vs. 2.9%+\$0.30). Two patients paying the same service amount through different channels will see different fees. That's expected.

**Q: Can I see fees broken out by location?**

**A:** Yes. The KPI tiles and the Conv. Fee column are both scoped to whatever location filter is active at the top of the page.

**Watch for: a Bank-method payment showing a non-zero Convenience Fee anywhere in the live product.**

This should never happen. Flag it to engineering immediately (see QA-2). Convenience Fees never apply to Bank/ACH.

### **Common pitfalls**

* Don't confuse "Service Amount" with "Paid Amount" when reading a row aloud to a practice. Paid Amount includes the fee, Service Amount doesn't.

* If a practice asks for a report, confirm whether they want Service Amount totals or Paid Amount totals before exporting. They're not interchangeable for accounting purposes.

## **2\. Payments Details Page**

*Why it matters: this is where a practice goes to resolve a billing dispute with a patient. Every number here needs to be traceable and consistent with the receipt the patient already has in hand.*

### **Walkthrough**

6. From the Payments list, click any row to open its Details page.

7. Remember the list-format rule: every tab except "Paid" displays the requested date; the "Paid" tab shows the paid date instead.

8. Read the transaction table columns left to right: Type \-\> Payment Method \-\> Service Amount \-\> Conv Fee \-\> Total Amount \-\> Processing Fees \-\> Net.

9. The Payment Details panel below should follow the same order: Service Amount \-\> Convenience Fee \-\> Total Amount \-\> Processing Fee \-\> Net \-\> Status.

10. For a refund, use Actions \-\> Initiate Refund. The refund amount defaults to Total Amount (including any fee). Check with the practice before changing it.



*Payment Details Page: format spec and Convenience Fee breakdown*

### **Talk track**

**Q: The patient says they were charged more than their invoice. What happened?**

**A:** Walk them to the Payment Details panel and read Service Amount, then Convenience Fee, then Total Amount in that order. The invoice amount is the Service Amount, and the difference is the disclosed Convenience Fee.

**Q: Can we refund just the fee and not the service amount?**

**A:** The practice can choose to refund the entire amount including the fee, but only the amount up to the original service amount should ever post back to the ledger. Confirm this with the practice before processing a partial refund.

### **Common pitfalls**

* Don't read the Requested Date on the Paid tab. It shows Paid Date instead, and quoting the wrong date to a practice erodes trust fast.

## **3\. Payment Receipt**

*Why it matters: the receipt is the patient's proof of what they agreed to pay. If the fee isn't itemized here, support fields far more "why was I overcharged" tickets than necessary.*

### **Walkthrough**

11. Open any Paid transaction and click Receipt (top right of the detail page).

12. The receipt should show, in order: Transaction ID, Paid On, Patient Name, Payment Method, Service Amount, Convenience Fee, Total Amount Paid.

13. The internal practice notification should mirror the same breakdown, so front-desk staff see identical numbers to what the patient received.



*Patient receipt and internal practice notification: Convenience Fee line added*

The same breakdown needs to reach every practice-facing email, not just the patient receipt:



*Practice emails: "Payment Received" and "Payment Initiated and Processing" variants*

### **Copy changes to know about**

* "Payment Received" (bank-paid): rename the generic "Fee" label to "Processing Fee"; show bank details (e.g. "STRIPE TEST BANK \*\*\*\*6789") in the Payment Method field.

* "Payment Received" (card-paid): rename "Amount" to "Service Amount"; add a "Convenience Fee" line before Net Amount.

* "Payment Initiated and Processing": add an "Initiated On" timestamp so practices can see exactly when a bank payment entered processing.

### **Talk track**

**Q: The patient lost their receipt. Where can they find it again?**

**A:** Every receipt is also viewable from the Payment Details page. Pull up the transaction and click Receipt to resend or download it.

**Q: Why does the email say "Processing Fee" instead of "Convenience Fee"?**

**A:** Processing Fee refers to Adit's own cost of running the transaction (shown on bank payments, which never carry a Convenience Fee); Convenience Fee is the separate, patient-facing charge shown only on card payments.

## **4\. Get Started**

*Why it matters: this is a new practice's first exposure to Convenience Fees and Bank/ACH. Getting the onboarding copy and defaults right here prevents a wave of "how do I turn this off" tickets in week one.*

### **Walkthrough**

14. During onboarding, a new practice reaches Adit Pay Set Up \-\> Step 4 (Payments).

15. Point out the Convenience Fees block and the Bank/ACH block. Both are mirrored from Preferences (Section 5), so nothing here should surprise a practice that already explored settings.

16. If the practice merges a direct/offline payment into an open request that has a Convenience Fee, walk them through the Merge Payment confirmation before they click through it.

17. At Step 5, review the state-exclusion tooltip with the practice if their location is in a restricted state.



*Getting Started: Step 4 (Payments), including the new Merge Payment edge case*

| EDGE CASE: MERGING PAYMENTS "This payment request has a Convenience Fee, but the selected direct payment that you have received does not include a Convenience Fee. To continue merging, the Convenience Fee will be removed from the payment request. Do you want to continue?". Yes/No. This explains why a merged payment's total can drop after merging. It is expected behavior, not a bug. |
| :---- |



*Getting Started: Step 5, showing the state-exclusion tooltip*

### **Talk track**

**Q: We're based in Massachusetts. Can we still use Bank/ACH even though Convenience Fees are blocked?**

**A:** Yes. The state exclusion only applies to Convenience Fees. Bank/ACH is available everywhere Adit Pay operates, regardless of state.

**Q: I merged a payment and the total changed. Is that a bug?**

**A:** No. That's the Merge Payment behavior. If the direct payment you merged in didn't include a Convenience Fee, the system removes the fee from the request rather than leaving a mismatched total.

## **5\. Preferences**

*Why it matters: every Convenience Fee and Bank/ACH rule in this manual is configured from one screen. If you can't confidently navigate this page field by field, you can't troubleshoot anything downstream of it.*

### **Walkthrough**

18. Open Adit Pay \-\> Preferences \-\> Payment Request.

19. Locate "Pass Through Adit Fees to Patient? (Convenience Fees)" and note the main toggle plus the "for One-Time Payments" sub-toggle.

20. Read the fee note aloud when coaching a new agent: 2.25% \+ \$0.20 for card-present, 2.9% \+ \$0.30 for card-not-present.

21. Scroll to "Payment and Subscription Plans" and check the "Allow Bank/ACH Payments" and "Allow manual verifications" toggles.

22. Scroll to "Allow Partial Payments" near the bottom. It should be greyed out automatically whenever Convenience Fees is on.



*Preferences: full settings screen with Convenience Fee and Bank/ACH blocks*

### **The two validation modals every agent should recognize**

* Trying to turn ON Partial Payments while Convenience Fees is already on: "Apologies, you are unable to turn on partial payments while you have convenience fees enabled. Would you like to proceed with turning off convenience fees and disabling partial payments?" (No/Yes)

* Trying to turn OFF Convenience Fees after it's been in use: an "Are you sure?" confirmation, since disabling it affects every open request currently carrying the fee.

See Appendix A for the complete field-by-field reference of this settings page.

### **Talk track**

**Q: Why can't I turn on Partial Payments?**

**A:** Partial Payments and Convenience Fees are mutually exclusive. Turning one on requires turning the other off, since a partial payment can't cleanly carry a proportional fee. The system will offer to disable Convenience Fees for you if you confirm.

**Q: If I turn off Convenience Fees, what happens to requests that already have the fee applied?**

**A:** You'll see a confirmation warning before this takes effect. Worth reading carefully, since it affects every currently-open request with the fee attached, not just new ones going forward.

## **6\. Payment Request**

*Why it matters: agents create and edit payment requests constantly. Getting the Convenience Fee toggle behavior right here avoids both accidentally charging a fee a practice didn't want, and accidentally forgetting one they did.*

### **Walkthrough**

23. From Payments \-\> Unpaid, click the pencil (edit) icon on any open request.

24. The "Include Convenience Fee" checkbox should default to the location's Preferences setting: checked if Preferences has it on, hidden entirely if Preferences has it off.

25. Change the Amount field and watch the Convenience Fee and Final Amount recalculate live beneath the checkbox.

26. If the patient already has another open request, the system treats the existing amount as the base "service amount" and applies the fee to the full new combined total. It isn't recalculated per line.



*Editing an open Payment Request: Include Convenience Fee toggle*

### **Talk track**

**Q: I don't see the Convenience Fee option when editing this request. Is that broken?**

**A:** Check Preferences first. If Convenience Fees is toggled off for this location, the section is hidden by design, not missing due to a bug.

**Q: The patient already owed money before this new request. Will they get charged the fee twice?**

**A:** No. The system treats their existing open balance as the base amount and applies one fee to the combined total, not one fee per request.

## **7\. Charge Payment on File \> Create Payment Flow**

*Why it matters: this is the highest-frequency in-person collection flow. Agents need to move through it without hesitating over which button does what. The old "Charge Card" label is gone.*

### **Walkthrough**

27. From a patient's chart, choose Select Payment Method \-\> "Charge Payment on File" (renamed from "Charge Card"; description now reads "Charge card or bank on file").

28. If no method is on file, you'll be blocked with "You need at least one payment method on file to proceed". Click Add to open the Add Card modal.

29. Fill in Name on Card, Cardholder Email, Phone, Credit Card Number, Exp Date, CVV, and Billing Address, then choose whether to set it as the default method.

30. Once a card is on file, look for the "Convenience Fee Applied" badge next to it if the fee is active for this location.

31. Move to Confirm Charge and check that Service Amount, Convenience Fee, and Total Amount all match what you quoted the patient verbally.

32. Click Charge, and wait for both the green "Payment Successful\!" screen and the toast "Payment was made successfully\!" before ending the interaction.



*Create Payment flow: select method, add/charge card, confirm charge*

### **Toasts to recognize**

* Success: "The payment method was added successfully\!" / "The payment method was deleted successfully\!" / "The payment method was updated successfully\!" / "Payment was made successfully\!"

* Failure: "There was an issue with saving this payment method. Please try again\!". If a patient sees this twice in a row, escalate rather than retry a third time.

### **Talk track**

**Q: Where did "Charge Card" go? I can't find it in the menu.**

**A:** It's been renamed to "Charge Payment on File". Same place in the menu, now covers both card and bank methods, not just card.

**Q: Do I need to tell the patient about the Convenience Fee before charging?**

**A:** Yes. Always confirm the Total Amount (which includes the fee) verbally before clicking Charge, since the patient authorized the service amount, not necessarily the fee.

## **8\. Manual Card Entry**

*Why it matters: this is the fallback when a terminal isn't available or a card can't be saved to file. Agents need to know exactly when to check the "save on file" box.*

### **Walkthrough**

33. Select Payment Method \-\> Manual Card Entry.

34. Enter the payment amount context. It should already reflect the Convenience Fee if one applies (e.g. \$10.00 service becomes \$10.61 total).

35. Complete the card and billing fields.

36. Check "Save Payment Method on Patient's File" only if the patient has explicitly agreed to keep the card on file for future charges. This is opt-in, not default.

37. Click Process. The "Payment Successful\!" screen should show Service Amount, Convenience Fee, and Total Amount separately.



*Manual Card Entry: worked example: \$10.00 service \+ fee \= \$10.61 total*

### **Talk track**

**Q: Is the card automatically saved after a manual entry charge?**

**A:** No. Only if the "Save Payment Method on Patient's File" checkbox was checked before processing. Always confirm with the patient before checking it.

## **9\. Charge Payment on File \> Collect Payment Flow**

*Why it matters: this is the single best flow to point to when explaining the "no fee on ACH" rule, since the card and bank outcomes are built from the exact same screen and only one carries a fee line.*

### **Walkthrough**

38. From an existing open balance, choose Collect Payment.

39. If Convenience Fees applies, the "Include Convenience Fee" checkbox should show both the card-present and card-not-present fee amounts side by side (e.g. "\$29.30 (CNP \$30.18)"). This dual display is intentional, not a duplicate bug.

40. Select a payment method. For Card, move to Confirm Charge and check that the receipt shows Service Amount / Convenience Fee / Total Amount.

41. For Bank, the outcome screen should instead read "Bank Payment Processing" with Service Amount / Total Amount only. No Convenience Fee line at all.



*Collect Payment flow: card outcome carries a Convenience Fee line; bank outcome doesn't*



*Collect Payment: clean entry point, from the full Figma export*

### **Talk track**

**Q: The fee amount shown has two numbers next to it. Is that a glitch?**

**A:** No. That's showing the card-present amount and the card-not-present amount together (e.g. "\$29.30 (CNP \$30.18)") so the agent can see both before knowing which rate will apply.

**Q: Why didn't the bank payment confirmation show a fee?**

**A:** By design. Convenience Fees never apply to Bank/ACH payments, so the bank confirmation screen omits that line entirely rather than showing \$0.00.

## **10\. Bulk Payment Request**

*Why it matters: one misconfigured bulk send can put an incorrect fee in front of dozens of patients at once. This is the highest-blast-radius flow in the whole product.*

### **Walkthrough**

42. From Payments, select multiple patients and choose Bulk Payment Request.

43. Choose Send Via (Text / Email / Voice) and Message Priority, then edit the text and email templates using the merge-field chips provided (never hand-type a patient's name).

44. Click Next to reach "Confirm Request Amount."

45. If Convenience Fees is off for this send, the table should show only EHR Balance / Existing Adit Pay Balance / New Adit Pay Balance.

46. If Convenience Fees is on, two extra columns should appear: Conv Fee and Total Adit Pay Amt Due. A patient with no new balance due should show "-" in both, not a \$0.00 row.

47. Click Send only after spot-checking at least one patient's calculated fee against the formulas in Section 1\.



*Bulk Payment Request: Without Con Fee / With Con Fee (toggled off) / With Con Fee (on by default)*

### **Talk track**

**Q: Can I send a bulk request to some patients with the fee and others without?**

**A:** No. The Convenience Fee toggle applies to the entire bulk send. If some patients need different treatment, split them into separate sends.

**Q: One patient in my list shows a dash instead of a dollar amount for their fee. Is that an error?**

**A:** No. A dash means that patient has no new balance due, so there's nothing to calculate a fee against. It's intentional, not a missing value.

## **11\. One-Time Payment Page (Text to Pay)**

*Why it matters: this is the only page most patients ever see. Every method offered here needs to be treated consistently, or Adit risks a real compliance problem, not just a support ticket (see QA-3).*

### **Walkthrough**

48. Send a patient a Text-to-Pay link and open it as they would.

49. The header should show Balance Due, Convenience Fee, and Payment Amount together.

50. Check that every listed method (Apple Pay, Google Pay, CareCredit, Credit Card) is labeled consistently for whether a Convenience Fee applies (see the flag below before assuming any single method is exempt).

51. Select Credit Card. The inline form (Cardholder Name, Email, Card Number, Exp/CVV, Billing Address, Save Card on File) should expand on the same page without a redirect.

52. If the patient already has a card on file, "Payment methods you have on file with us" should list it with a way to set a new default or pay with a new card.



*Payment methods on the public page: Apple Pay, Google Pay, CareCredit, Credit Card*

| FLAG FOR REVIEW This screen labels Apple Pay "Without Convenience Fee" while Google Pay on the same screen is labeled "Convenience Fee applied." Card network rules require the fee to apply uniformly across every method in a channel. Confirm with design whether this is only illustrating two label states for review, or literal differing default behavior per method: treat as a compliance risk until confirmed. |
| :---- |



*One-Time Payments Page: with/without a card on file, "Use Another Card" path*



*Additional One-Time Payment Page variant, from the full Figma export*

### **Talk track**

**Watch for: the public payment page showing different Convenience Fee labels for different payment methods (e.g. Apple Pay vs. Google Pay).**

This is an open design question (see QA-3), not confirmed live behavior. If a patient asks, tell them the fee applies the same way regardless of payment method, and escalate any live discrepancy immediately.

**Q: Can the patient pay less than the full balance from this page?**

**A:** Not with Convenience Fees enabled. Partial payments are automatically disabled whenever the fee is on (see Section 5).

## **12\. Payment Plans**

*Why it matters: this is the mirror image of Section 11\. Convenience Fee is blocked here, Bank/ACH is welcomed. Mixing up these two rules in a patient conversation is the single most common agent error to coach against.*

### **Walkthrough**

53. From Payment Plans, open or create a plan and reach Step 3: Payment Details.

54. Choose "Manually Add Payment Method" or "Request Payment Method from Patient."

55. If adding manually, choose Card or Bank in the Add Payment Method modal and complete the relevant fields.

56. A plan can carry both a saved card and a saved bank account at the same time. The "one bank account" limit is about bank accounts specifically, not a total cap.

57. To remove a saved method, the Confirm Delete modal ("This action cannot be undone") should appear before it's removed.



*Payment Plans: practice-side list view, from the full Figma export*



*Setting up a Payment Plan: manual add vs. request from patient*



*Managing saved payment methods on a plan: copy updates and Confirm Delete*



*Requesting a payment method from a patient: a plan can hold a saved card AND a saved bank account at once*

### **Talk track**

**Q: Can we add a Convenience Fee to this payment plan like we do for one-time payments?**

**A:** No. Convenience Fees are never available on payment plans or subscriptions, by card network rule. Bank/ACH is the low-cost alternative offered here instead.

**Q: The patient already has a card on file. Can they also add a bank account?**

**A:** Yes. A plan can hold one saved bank account and any number of saved cards simultaneously.

| IMPORTANT CONTEXT: TWO DIFFERENT BANK-PAYMENT SYSTEMS "Bank/ACH" is not one system. The US uses "Instant Bank Payments" via Stripe Link: the patient authenticates with their bank and the payment confirms in seconds, settling in about 2 days, with Stripe guaranteeing the payment against bank-initiated failures like insufficient funds. Canada uses a separate, slower rail called ACSS: about 5 business days to settle, no instant option, and a payment CAN be returned after it already showed as "succeeded." Sections 13 and 14 below map to these two systems respectively, though the exact mapping of the manual-verification screens to one system or the other is flagged as needing confirmation (see QA-1 and QA-8). |
| :---- |

## **13\. Payment Plans \> Bank Instant Verification Flow**

*Why it matters: this is the US rail ("Instant Bank Payments" via Stripe Link) that patients will use most often to pay a plan by bank, since it confirms in seconds rather than days. Agents should be able to narrate every screen a patient might be stuck on over the phone, and know its real-world limits.*

### **Walkthrough**

58. On the patient's own plan page, they should see Plan Name, Frequency, Recurring Charges, and "Payment Due Today," with Pay With Credit Card and Pay With Bank/ACH Payment options.

59. If they choose Add Bank/ACH Payment, walk them through: "Log in to Bank (OAuth)" loading screen \-\> their bank's own login window \-\> "Retrieving accounts..." loading screen.

60. Once accounts load, the patient selects the specific account (e.g. "Stripebank \*\*\*\*6789") and confirms.

61. On success, they should see "Your Payment Plan is now Active\!" with the option to review the plan or add a secondary card.

62. On the practice side, the Payment Plan Detail Page should show the matching Processing \-\> Successful states as the bank payment clears.



*Patient plan page and Bank Instant Verification: OAuth login through account confirmation*



*Payment Plan Detail Page: practice-side Processing/Successful bank states, from the full Figma export*



*"Finish Setting Up Your Payment Plan\!" reminder: shown when bank verification was started but never completed*

### **What makes this rail different from a card**

* Settlement takes about 2 days, but the payment shows as confirmed immediately. Stripe guarantees the payment against bank-initiated failures (insufficient funds, etc.), so unlike traditional ACH, a successful Instant Bank Payment generally will not bounce back later for those reasons.

* A patient-initiated dispute is still possible and is handled like a card dispute (evidence can be submitted), but funds are pulled from the practice while it's under review.

* There is a per-transaction cap on this rail (commonly cited around \$7,500, though Stripe sets it dynamically per account and it isn't publicly documented). Above the cap, or if the practice/transaction isn't eligible, the recommended fallback is card, not a slower ACH path.

* The patient must authenticate through Stripe's Link screen on their own device. This likely means in-office/front-desk bank payment isn't a tap-through-the-terminal experience the way a card is; the practical path is texting or emailing the patient a link to complete on their phone (see QA-15).

### **Talk track**

**Q: The patient says they're stuck on a loading screen after logging into their bank. What's happening?**

**A:** That's the "Retrieving accounts..." step, which pulls the linked accounts from their bank via Stripe. If it hangs for more than a minute, have them close and restart the Add Bank flow rather than wait indefinitely.

**Q: The patient started adding a bank account but never finished. Will anything remind them?**

**A:** Yes. They'll receive a "Finish Setting Up Your Payment Plan\!" email if verification was started but not completed.

**Q: Can a patient pay a large treatment balance by bank?**

**A:** Only up to the per-transaction cap on this rail. For anything above it, the recommended path is card, not a slower bank transfer, so set that expectation with the patient before they try to link a bank account for a very large balance.

**Q: Can we run this at the front desk like a card payment?**

**A:** Likely not directly. The patient authenticates through their bank's own login on their own device, so the practical in-office path is sending them a link to complete on their phone rather than having them do it on the practice's terminal.

## **14\. Payment Plan \> Bank Manual Verification Flow**

| NO SCREENSHOT SHARED YET FOR THIS SECTION No screenshot of the manual (micro-deposit) verification screens themselves has been found in either the shared screenshots or the Figma export: neither includes an "Add Bank" or "Verify Bank Account" frame for this specific path. The walkthrough below is built from the Figma design notes and the earlier API review. The two images below are the closest adjacent frames available: the failure state and setup reminder this flow can lead to: not the entry/verification screens themselves. |
| :---- |
| **OPEN QUESTION: IS THIS FLOW US OR CANADA?** The source Q\&A document notes that the US rail (Instant Bank Payments) is meant to be the only US path going forward, with the slower fallback "off the table unless Product explicitly reopens it." That raises a real possibility that this micro-deposit flow actually represents Canada's ACSS verification path rather than a general US fallback; the same document says this needs to be confirmed with Stripe directly. Train agents on the mechanics below, but don't assert to a practice which country/rail this applies to until it's confirmed. |

### **Walkthrough (from design notes: confirm against the live product before training verbatim)**

63. Patient chooses Bank/ACH but their bank isn't available for instant login, or they decline to log in. This routes them to manual entry.

64. Patient enters Routing Number, Account Number, and Confirm Account Number.

65. Stripe sends two small deposits (or a descriptor code) to the account. This typically takes 1-2 business days.

66. Patient returns to the plan page and enters the two deposit amounts (or descriptor code) to confirm ownership.

67. Once verified, the account behaves identically to an instantly-verified one for future payments.

* The "Allow manual verifications" toggle in Preferences controls whether this path is offered at all for a given location.

### **If this is Canada (ACSS): what's different from the US rail**

* Settlement takes about 5 business days rather than about 2\.

* Unlike the US rail, a Canada payment is NOT guaranteed. It can fail for insufficient funds, an invalid account number, or the customer disabling debits, and it can be returned even after it already showed as "succeeded" (this surfaces as a dispute-like event and reverses the payment).

* Dispute windows are long: 90 days for personal accounts, 10 business days for business accounts, and disputes are described as "no questions asked," meaning the practice cannot contest them the way a US bank dispute can be evidenced.

* A cross-currency debit (for example, a Canadian account charged in USD) is called out as a common source of a payment failing about 5 days after it looked successful.

* This rail does not support manual capture (auth-then-capture), and an authorization/mandate on one connected account cannot be reused if a patient moves to a different practice location on a different connected account.



*Payment Error with your Payment Plan: the failure state this flow can lead to*



*Payment Failed: patient-facing email tied to a failed scheduled payment*

### **Talk track**

**Q: The patient entered their micro-deposit amounts and it says they don't match. What now?**

**A:** Confirm they're reading amounts in cents correctly (e.g. "32" and "45," not "\$0.32" and "\$0.45" typed as dollars). If it still fails, the most common root cause is a typo in the original routing/account number. Have them re-add the bank account rather than keep retrying the same deposit amounts.

**Q: A Canadian patient's payment showed as successful last week and now it's reversed. Is that a bug?**

**A:** Not necessarily. Unlike the US rail, ACSS payments in Canada aren't guaranteed and can be returned days after they first cleared. Check whether it's a bank-side return or a customer dispute before treating it as an error.

## **15\. Patient Card**

| NO SCREENSHOT SHARED YET FOR THIS SECTION No screenshot literally titled "Patient Card" has been found in either the shared screenshots or the Figma export. It appears embedded within the Charge Payment on File flow (Section 7\) as the "one card on file" panel. The two images below are the closest matching frames available in the export. |
| :---- |

### **What to know**

* A maximum of 10 cards are allowed on file per patient. Once reached, the "add" and "request" options grey out, with a tooltip explaining the limit. This applies everywhere a card can be added, not just one screen.

* The card list initially shows 3 cards on file; beyond that, a "show more cards on file" option expands the rest.

* Only ONE bank account can be saved at a time. This is the one asymmetry between cards and bank accounts worth remembering.

* In dental specifically, the person paying is often not the patient being treated (a parent, guardian, or other guarantor). Whose bank account or card counts as "on file," and how it maps to the patient being treated, is called out in the source product Q\&A as still needing a decision (see QA-16).



*Save Card on File: closest matching frame from the full Figma export*



*"Card Requested" notification*

### **Talk track**

**Q: The practice can't add another card for this patient. Why?**

**A:** They've likely hit the 10-card limit. Have them remove an unused saved card first, or confirm with the patient which one to delete.

## **16\. Treatment Plans**

*Why it matters: the Treatment Plan builder is where a practice first proposes a payment structure to a patient. A missing Convenience Fee option here means the practice has to explain the fee separately later, which is a worse patient experience than seeing it up front.*

### **Walkthrough**

68. Open Treatment Plans \-\> Tx Plan Builder and select or create a plan.

69. Build out the treatment option(s), fee structure, and discount as needed.

70. In Payment Options, choose One-Time Payment or Payment in Installments (with configurable frequency and number of payments).

71. In Payment Method, confirm Credit Card, Bank/ACH, Check, and Cash are all available. And that a Convenience Fee option is present alongside them once added.

72. Complete consent and signature steps as required before sending or saving.



*Treatment Plan Builder: Payment Method section needs a "Convenience Fee" addition*

### **Talk track**

**Q: Can a treatment plan use the same Convenience Fee rules as a one-time payment?**

**A:** Once added, yes. But confirm which payment option the patient chose first (one-time vs. installments), since installments follow the Payment Plan rule (no Convenience Fee, Bank/ACH allowed) rather than the one-time rule.

# **Part 2: QA Test Plan & Findings**

This part has two halves: a structured set of test cases an agent or QA tester can run directly, and a findings list. Each with the evidence behind it and a recommended action, not just an observation.

## **2.1 Test Scenarios**

### **Settings & Onboarding**

| ID | Scenario | Steps | Expected Result |
| :---: | :---- | :---- | :---- |
| TC-01 | Enable Convenience Fees | Preferences \-\> toggle "Pass Through Adit Fees to Patient" on | Fee note displays 2.25%+\$0.20 (CP) / 2.9%+\$0.30 (CNP); Partial Payments auto-disables |
| TC-02 | Attempt to re-enable Partial Payments | With Convenience Fees on, toggle Allow Partial Payments to Yes | Validation modal appears offering to disable Convenience Fees instead |
| TC-03 | Disable Convenience Fees after use | With open requests carrying the fee, toggle Convenience Fees off | "Are you sure?" confirmation appears before the change applies |
| TC-04 | State exclusion enforced | Set practice location to Massachusetts, open Convenience Fee settings | Feature is blocked/hidden with the compliance tooltip shown |
| TC-05 | GT mirrors Preferences | Complete Getting Started Step 4 for a new practice | Convenience Fee and Bank/ACH sections match what Preferences shows for the same location |

### **Charging & Collecting**

| ID | Scenario | Steps | Expected Result |
| :---: | :---- | :---- | :---- |
| TC-06 | Card charge includes fee | Charge Payment on File with a card, Convenience Fees on | Confirm Charge and receipt both show Service Amount, Convenience Fee, Total Amount |
| TC-07 | Bank charge excludes fee | Collect Payment with a bank account, Convenience Fees on | "Bank Payment Processing" shows Service Amount and Total Amount only. No fee line |
| TC-08 | Manual entry fee math | Manual Card Entry, \$10.00 service, Convenience Fees on | Total charged equals \$10.61 (or the current CNP formula output for \$10.00) |
| TC-09 | 10-card limit | Add an 11th card to a single patient | "Add"/"Request" options grey out with limit tooltip shown |
| TC-10 | Single bank account limit | Attempt to add a 2nd bank account to a patient with one already on file | System prevents a 2nd bank account or clearly replaces the existing one |

### **Requests, Bulk Sends & the Public Page**

| ID | Scenario | Steps | Expected Result |
| :---: | :---- | :---- | :---- |
| TC-11 | Edit request fee default | Edit an open request at a location where Convenience Fees is on | "Include Convenience Fee" is checked by default |
| TC-12 | Edit request fee hidden | Edit an open request at a location where Convenience Fees is off | The Convenience Fee section does not appear at all |
| TC-13 | Stacking open balances | Create a new request for a patient who already has one open | Fee is calculated once, on the combined new total |
| TC-14 | Bulk send, zero balance | Bulk request a patient with \$0 new balance due, fee toggle on | Patient's row shows "-" for fee and total, not \$0.00 |
| TC-15 | Uniform fee across methods | Open the public one-time payment page and compare every listed method | Every method shows identical Convenience Fee treatment |
| TC-16 | ACH unavailable for one-time | Open the public one-time payment page | No Bank/ACH option is offered anywhere on the page |

### **Payment Plans & Bank Verification**

| ID | Scenario | Steps | Expected Result |
| :---: | :---- | :---- | :---- |
| TC-17 | No fee on payment plans | Open a Payment Plan's payment method options | Convenience Fee option is absent; Bank/ACH is present |
| TC-18 | Card \+ bank coexist | Add a card, then add a bank account to the same plan | Both remain listed as separate saved methods simultaneously |
| TC-19 | Instant verification success | Complete the bank OAuth flow with a test account | Plan moves to "Active," Processing \-\> Successful states shown |
| TC-20 | Manual verification success | Add a bank account manually, confirm correct micro-deposit amounts | Account verifies and behaves identically to an instantly-verified one |
| TC-21 | Manual verification failure | Enter incorrect micro-deposit amounts twice | Clear error state shown; re-adding the account is offered as the recovery path |
| TC-22 | Abandoned setup reminder | Start adding a bank account, close the browser before finishing | "Finish Setting Up Your Payment Plan\!" email is sent |

## **2.2 Findings**

Each finding includes what evidence it's based on and a recommended next step. Treat these as tickets to triage, not just observations.

| QA-1  "Returned after success" risk is real for Canada, likely already handled for the US   \[NEEDS CONFIRMATION\] Finding: Earlier framing treated this as a single open gap across all bank payments. Reading the source Q\&A doc more closely splits it in two: the US rail (Instant Bank Payments) is guaranteed by Stripe against bank-initiated failures, so a successful payment generally should not bounce back for that reason (a customer-initiated dispute is still possible, handled like a card dispute). Canada (ACSS) has no such guarantee and explicitly CAN return after already showing "succeeded," including from cross-currency debits. Evidence: *Payment Plan Detail Page states (Section 13), Payment Error / Payment Failed frames (Section 14), and the "Adit Pay: Bank Payments: Questions for Product & Design" document, Sections 3 and 7\.* Recommended action: For the US, treat this as lower risk given Stripe's guarantee, but confirm the dispute-driven reversal path is designed. For Canada, confirm a distinct "Processing vs. Paid" status and a reopen/notify-staff path exist for a late return, since that document flags it as still an open decision (its own Q15). |
| :---- |
| **QA-2  Payments list mock data shows a fee on Bank-method rows   \[NEEDS CONFIRMATION\]** **Finding:** Example data in the Payments list includes rows where Method \= "Bank" but the Conv. Fee column still shows a non-zero value. **Evidence:** *Section 1 screenshot. Rows for Ginger Vitis and Pearl White show Method: Bank with non-zero Conv. Fee values, contradicting the documented rule that fees never apply to Bank/ACH.* **Recommended action:** Confirm this is placeholder/lorem data only. If any test fixtures were derived from this mock, regenerate them with \$0/blank fees on Bank rows before using them for QA. |
| **QA-3  Public payment page shows different fee treatment per method   \[NEEDS CONFIRMATION\]** **Finding:** Apple Pay is labeled "Without Convenience Fee" while Google Pay on the same screen is labeled "Convenience Fee applied." **Evidence:** *Section 11 screenshot, "Adit Payments Page". Both labels visible side by side on the same mockup.* **Recommended action:** Confirm with design whether this is illustrating two label states for sign-off purposes only. If it reflects real default behavior, escalate as a compliance risk before launch. Card network rules require uniform treatment across methods in a channel. |
| **QA-4  Disable-Convenience-Fee confirmation copy looks unfinished   \[LOW\]** **Finding:** The "Are you sure?" modal shown when disabling Convenience Fees in Preferences reads as draft/placeholder text rather than final copy. **Evidence:** *Section 5 screenshot, right-side annotation callouts on the Preferences page.* **Recommended action:** Route to whoever owns UX copy for a final pass before this ships, given it's a compliance-adjacent confirmation. |
| **QA-5  Confirm: a plan can hold both a card AND a bank account   \[INFO\]** **Finding:** A plan's "Request Payment Method from Patient" view shows both a card and a bank account saved simultaneously. **Evidence:** *Section 12 screenshot. Two saved methods (•9876 card, •1234 bank) shown together on the same plan.* **Recommended action:** State this explicitly in the public help article and internal training: one bank account maximum, any number of cards, both types can coexist on a single plan. |
| **QA-6  Merge Payment fee-removal needs a support-facing explanation   \[LOW\]** **Finding:** The Merge Payment confirmation (Section 4\) silently removes a Convenience Fee from a request when the merged-in direct payment doesn't include one. **Evidence:** *Section 4 screenshot, "Merge Payment" modal copy.* **Recommended action:** Add a line about this behavior to the public Convenience Fee help article and to this manual's talk track, so it isn't reported as a billing discrepancy. |
| **QA-7  "3-4 business day" bank-processing copy may be stale   \[NEEDS CONFIRMATION\]** **Finding:** The patient-facing line "Bank payments typically take 3-4 business days to process\!" is a specific, quotable SLA that was written before the product's shift toward "Instant Bank Payments" for the US. **Evidence:** *Design annotation from the original Figma review, compared against the "Adit Pay: Bank Payments: Questions for Product & Design" document, which states the US rail settles in about 2 days with instant confirmation, and Canada (ACSS) settles in about 5 business days.* **Recommended action:** Check whether this copy is still shown anywhere in the live product. If so, it likely needs to be split by country (fast confirmation for US, \~5 business days for Canada) rather than shown as one blanket figure. |
| **QA-8  Two sections still lack a matching screenshot   \[FOLLOW-UP\]** **Finding:** Patient Card (Section 15\) and Payment Plan \> Bank Manual Verification Flow (Section 14\) have no screenshot literally matching their name in either the shared screenshots or the full Figma export. **Evidence:** *Exhaustive filename search of both the 19 shared screenshots and the \~500-file Figma export turned up no "Add Bank" / "Verify Bank Account" (manual) or standalone "Patient Card" frame.* **Recommended action:** Export and share these two specifically from Figma if they exist elsewhere in the file; otherwise confirm with design whether they were ever built as distinct frames. |
| **QA-9  KPI tiles for "Convenience Fees" and "Processing Fees" show identical values   \[NEEDS CONFIRMATION\]** **Finding:** The Payments list KPI row shows Convenience Fees and Processing Fees both at \$300.50 in the same example. **Evidence:** *Section 1 screenshot, top KPI tiles.* **Recommended action:** Confirm these are tracked as independent totals in the live data and this is coincidental test data, not two tiles reading from the same underlying field. |
| **QA-10  Naming inconsistency between "Add Card" and "Add Payment Method"   \[LOW\]** **Finding:** The Create Payment flow's modal is titled "Add Card," while the visually near-identical modal in the Collect Payment flow is titled "Add Payment Method." **Evidence:** *Compare Section 7 ("Add Card") against Section 9 ("Add Payment Method") screenshots.* **Recommended action:** Confirm whether this is an intentional naming difference (e.g. one flow supports bank, the other doesn't) or a copy inconsistency that should be unified. |
| **QA-11  Possible layering artifacts in the One-Time Payment Page mockup   \[LOW\]** **Finding:** Some variants of the public one-time payment page show visually duplicated headers and fields (e.g. practice name or balance appearing twice stacked). **Evidence:** *Section 11 screenshot, "One-Time Payments Page" variants. Duplicated "ABC Family Dentistry" header and duplicated PAY button visible in at least one crop.* **Recommended action:** Confirm this is a Figma layering artifact from overlapping mockup states, not a real rendering duplication bug, before treating it as representative of production behavior. |
| **QA-12  Bulk Payment Request patient count differs across the three fee-state examples   \[INFO\]** **Finding:** The "Without Fee" and "Toggled Off" mockups show 3 example patients; the "Toggled On" mockup shows 5, adding two more to demonstrate a zero-fee and a partial-fee case. **Evidence:** *Section 10 screenshot, three "Confirm Request Amount" variants.* **Recommended action:** Likely intentional (extra rows added to showcase edge cases) rather than a data inconsistency. Confirm with whoever built the mockup, and reuse those extra rows as the basis for TC-14. |
| **QA-13  Product's own checklist: four bank-payment items not yet confirmed in Figma   \[FOLLOW-UP\]** **Finding:** The source Q\&A document includes a "feature parity" checklist, written by the product team itself, listing bank-related items not yet confirmed present in the new designs: (1) a bank-payment transaction detail page showing bank name, last 4, and status; (2) refund behavior for bank payments; (3) the warning shown when removing a card or bank account tied to a payment plan; (4) Download Statement on the patient page. **Evidence:** *"Adit Pay: Bank Payments: Questions for Product & Design," Section 11\.* **Recommended action:** Treat these four as open items rather than assuming the reviewed screenshots cover them. Confirm each directly with design, since this is a more authoritative source than screenshot-coverage gaps alone. |
| **QA-14  Per-transaction cap and over-cap fallback not visible in any reviewed screen   \[NEEDS CONFIRMATION\]** **Finding:** The US rail (Instant Bank Payments) has a per-transaction cap (commonly cited around \$7,500), above which the recommended behavior is falling back to card. No reviewed screenshot shows this cap, an over-cap message, or the fallback prompt. **Evidence:** *"Adit Pay: Bank Payments: Questions for Product & Design," cover briefing and Question 2\.* **Recommended action:** Confirm the cap value and the over-cap patient-facing experience (Question 16 in that document) are designed before this ships, since dental treatment balances can plausibly exceed it. |
| **QA-15  In-office bank payment scope is unclear   \[NEEDS CONFIRMATION\]** **Finding:** Instant Bank Payments requires the patient to authenticate through Stripe's Link screen on their own device. No reviewed screenshot shows how (or whether) a front-desk agent initiates a bank payment in person, as opposed to sending the patient a link to complete on their phone. **Evidence:** *"Adit Pay: Bank Payments: Questions for Product & Design," Question 10, explicitly flagged as an open UX decision.* **Recommended action:** Confirm whether in-office bank payment is in scope at all for the initial release, and if so, how an agent triggers the text/email-to-phone flow from the front desk. |
| **QA-16  Guarantor billing and bank auto-charge order are still open product questions   \[FOLLOW-UP\]** **Finding:** Two related items from the source document aren't reflected anywhere in the reviewed designs or this manual's original content: who a saved bank account belongs to when the payer isn't the patient (a parent or guardian, common in dental), and where bank sits in the automatic charge order relative to a patient's saved cards (today: selected card, then default card, then backup cards). **Evidence:** *"Adit Pay: Bank Payments: Questions for Product & Design," Questions 21 and 24\.* **Recommended action:** Both are explicitly called out as undecided in the source document. Flag to product rather than assuming an answer when training agents on guarantor accounts or fallback billing. |

# **Appendix A: Preferences Field Reference**

Every configurable field on the Preferences \-\> Payment Request screen, for quick lookup during a support call.

| Field | What it controls | Notes |
| :---- | :---- | :---- |
| Payment Request Logo | Logo shown on payment request messages and pages | Recommend a photo larger than 300x300px, jpg or png |
| Payment Request Text | SMS/email copy sent with a payment request | Supports merge fields: Patient Name, Location, Organization, Payment Link, Payment Amount, DBA Name |
| Payment Confirmation Text | Copy sent after a successful payment | Supports the same merge fields plus Transaction ID |
| Enable Posting in Ledger | Whether payments post to the practice's ledger | Only the Service Amount ever posts. Never the Convenience Fee |
| Enable Posting in Logs | Whether payments post to internal activity logs | Independent of ledger posting |
| Pass Through Adit Fees to Patient? (Convenience Fees) | Master toggle for Convenience Fees | Only applies to credit/debit cards; never ACH/HSA/FSA |
| Pass Through Adit Fees for One-Time Payments? | Sub-toggle scoping the fee to one-time payments | Convenience Fees never apply to recurring plans regardless of this setting |
| Allow Bank/ACH Payments | Enables Bank/ACH for Payment Plans & Subscriptions | Not available for one-time payments |
| Allow manual verifications? | Enables the micro-deposit fallback for bank verification | 0.5% \+ \$1.75 transaction fee applies only when a payment is processed, never at setup |
| Privacy Policy and Terms | Adds practice-provided legal links to the payment page | Optional URL fields |
| Payment Plan Request Text | Copy sent when requesting payment setup for a plan | Supports the same merge-field set |
| Subscription Plan Request Text | Copy sent when requesting payment setup for a subscription | Supports the same merge-field set |
| Enable Direct Payments | Turns on the public direct-payment page and URL | Provides a copyable Payment Page URL |
| Enable Financing Options | Turns on CareCredit-style financing on the public page | Shown alongside standard card options |
| Theme Color | Branding color for the public payment page | Hex value with live swatch preview |
| Allow Partial Payments | Lets patients pay less than the full balance due | Automatically disabled whenever Convenience Fees is on |
| Expiration Time for a Payment Request Link | How long a sent payment link stays valid | Configurable dropdown, e.g. 30 days |

# **Appendix B: Fee Formula Reference**

The exact math behind every Convenience Fee shown in this manual.

| Scenario | Formula | Worked Example |
| :---- | :---- | :---- |
| Card-not-present (2.9% \+ \$0.30) | Final Charge \= (Desired Amount \+ \$0.30) / (1 \- 0.029) | \$100.00 \-\> \$103.30 charged; processor takes \$3.30; practice nets \$100.00 |
| Card-present (2.25% \+ \$0.20) | Final Charge \= (Desired Amount \+ \$0.20) / (1 \- 0.0225) | \$100.00 \-\> \$102.51 charged |
| ACH transaction cost (not patient-facing) | 0.5% \+ \$1.75 per transaction | Charged to the practice only when a payment processes. Never at account setup, never to the patient |

### **ACH transaction cost, worked examples**

From the Adit Pay ACH Cost calculator: the fee is a straight 0.5% of the transaction plus a flat \$1.75, with no gross-up (unlike the card Convenience Fee formulas above, this cost is not passed through to the patient).

| Transaction Size | Adit Charges the Practice |
| :---- | :---- |
| \$100 | \$2.25 |
| \$200 | \$2.75 |
| \$250 | \$3.00 |
| \$272 | \$3.11 |
| \$500 | \$4.25 |
| \$1,000 | \$6.75 |

*Sources: annotated design-review screenshots shared directly in chat, the Figma "Adit Pay. ACH" file export, the Adit Pay ACH Cost calculator, the "Adit Pay: Bank Payments: Questions for Product & Design" document, and Asana task documentation. Compiled for internal training and QA use.*























































