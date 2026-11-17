  **ADIT PAY**  
**ACH & Convenience Fees: CSM Client Communication Guide**

*Talking points, objection handling, and ready-to-send email templates.*

# **1\. Why This Matters (the pitch)**

Use this when introducing the feature or answering "why should we turn this on":

- Practices pay thousands of dollars a year in card processing fees they could otherwise pass through to the patient. Convenience Fees make that possible.

- This is one of the most requested features from clients directly.

- Many EHR/PMS-integrated payment systems don't offer this natively, it's a real differentiator.

- Bank/ACH gives patients a secure, lower-cost way to pay, particularly valuable for larger transactions and payment plans.

| IMPORTANT: ACH IS LIVE BY DEFAULT Bank/ACH is enabled by default for eligible US locations, so patients may already see it as a payment option even if the practice never changed any settings. Bank/ACH is not available in Canada, regardless of this default. If a client asks why they're suddenly seeing a bank payment option they never enabled, this is expected behavior and not a bug. Practices can turn Bank/ACH off at any time in Adit Pay Preferences if they do not want to offer it. Convenience Fee is an optional feature that allows practices to pass payment processing costs on to patients. It is not enabled by default and must be turned on by the practice. Convenience Fee is not available in Connecticut, Maine, Massachusetts, or Canada due to regulatory restrictions. |
| :---- |

# **2\. Key Facts to Have Ready**

| Fact | Detail |
| :---- | :---- |
| Convenience Fee rate | 2.25% \+ \$0.20 card-present, 2.9% \+ \$0.30 card-not-present |
| Convenience Fee not available in | Connecticut, Maine, Massachusetts, Canada |
| ACH rate | 0.5% \+ \$1.75 per transaction, charged to the practice, never shown to the patient |
| ACH not available in | Canada |
| Why a location is blocked | Determined automatically by the address on the practice's connected Stripe account, not something support configures manually |
| Does Convenience Fee apply to debit cards? | Yes, uniformly to both credit and debit, the key legal distinction from a surcharge (see Section 3\) |
| Does Convenience Fee apply to ACH? | Never |
| Does Convenience Fee apply to payment plans or subscriptions? | No, not available for recurring payments |
| Fee to add or authorize a bank account | None. Adding and verifying a bank account is completely free |
| How long does an ACH payment take to settle? | 1 to 4 business days |
| Is this on by default? | Bank/ACH: Yes, enabled by default for eligible US locations (can be turned off in Preferences). |

# **3\. "Is This Legal?" / "Isn't This a Surcharge?"**

A real question clients will ask; answer it directly rather than deflecting.

| THE ACCURATE ANSWER A surcharge legally can only be applied to credit cards, never debit. Convenience Fee applies uniformly to every card type, credit and debit alike, which is what makes it a distinct, compliant category rather than a surcharge. It's also fully disclosed to the patient before they pay, and the patient always has a fee-free way to pay (in person, or by bank where offered). |
| :---- |

**Client:** *Isn't this just a surcharge with a different name?*

**CSM:** No, and the distinction is a real legal one, not just wording. A surcharge can only be charged on credit cards, it's not legal on debit cards at all. Convenience Fee applies the same way across both credit and debit, and it's shown to the patient as its own line item before they pay. That combination is what keeps it in a different, compliant category.

# **4\. Objection Handling**

## **"Why is this already active, we never turned it on"**

This is now the most likely version of this objection, since **Bank/ACH is enabled by default**. Lead with reassurance, not a defense of the decision: 

**CSM:** That's expected. **Bank/ACH was enabled automatically** as part of the rollout it wasn't something specific to your account. Nothing about your existing pricing or workflow changed; this simply adds a bank payment option for your patients. **Convenience Fee is a separate, optional feature and is only available if your practice chooses to enable it.** If you'd rather not offer Bank/ACH, we can turn it off right now it only takes about a minute. 

## **"My patients will be upset about an extra charge"**

**CSM:** Today, if a patient pays \$100 by card, you don't actually receive the full \$100, the processing fee comes out of it. With Convenience Fee turned on, that cost gets passed through to the patient instead, so you receive the full \$100 every time, the same as if they'd paid cash or check. You're not charging them more for the visit, you're just no longer the one covering the card processing cost.

## **"We prefer cash and check because card fees eat into small transactions"**

**CSM:** That's exactly what this solves. With Convenience Fee active, a card payment nets you the same full amount as cash or check, so there's no longer a reason to avoid card payments on smaller tickets.

## **"Can we get paid out the same day if we're a small practice?"**

Daily payout is available to all clients regardless of practice size, there is no minimum-size restriction on payout frequency.

# **5\. Frequently Asked Questions**

**Q:** Does this post to the practice's ledger?

**A:** Only once a payment is actually completed, not when it's merely requested. The Convenience Fee itself is never posted to the ledger, only the underlying service amount. Practices track total fees collected through Adit Pay's own reporting instead.

**Q:** Why does the reporting page show both a "Processing Fee" and a "Convenience Fee"?

**A:** The Convenience Fee is added to the patient's total first. Once that larger total is charged, the payment processor takes its normal processing fee out of it. The two numbers are shown separately so the practice can see exactly how much Convenience Fee they've collected, distinct from the underlying processing cost.

**Q:** Can Convenience Fee be applied to a treatment plan?

**A:** Yes, for one-time payment treatment plans. Installment-based treatment plans follow the recurring-payment rule instead (no Convenience Fee, ACH available).

**Q:** Is there a fee or hold when a patient adds their bank account?

**A:** No. Adding and verifying a bank account is completely free, with no charge or hold of any kind.

**Q:** Does the practice need to do anything before a patient can pay by ACH?

**A:** Yes, a payment method request has to be sent to the patient first so they can securely link their bank account. Only after that's done can a payment request be charged to that account.

# **6\. What to Escalate**

Handle directly using this guide:

- General questions about rates, availability, and how the fee is calculated

- Explaining the legal distinction between Convenience Fee and a surcharge

- Basic ACH setup questions (sending a payment method request, linking a bank account)

Escalate to the Adit Pay team:

- Anything involving a specific client account showing unexpected behavior

- Questions about editing vs. recreating a payment request when removing a fee

- Anything you're not fully confident answering, better to check than guess on a compliance-adjacent topic

# **7\. Resources**

Safe to send directly to a client:

- [Convenience Fees vs. Surcharges: What's the Difference and Why This Isn't a Surcharge](https://help.adit.com/portal/en/kb/articles/how-are-convenience-fees-different-from-surcharges-and-why-is-this-not-a-surcharge)

- [What Is ACH, and How Does It Work in Adit Pay?](https://help.adit.com/portal/en/kb/articles/what-is-ach-and-how-does-it-work-in-adit-pay)

# **8\. Email Templates**

Ready to adapt and send. Replace bracketed fields before sending.

## **Scenario A: Introducing the feature to a client**

| Subject: New ways to get paid, and save, with Adit Pay |
| :---- |
| Hi \[Practice Contact Name\], I wanted to personally flag two features now available on your Adit Pay account: Convenience Fees and Bank/ACH Payments. Convenience Fees let you pass your card processing cost through to the patient on one-time card payments, so you receive the full amount you billed. Bank/ACH gives patients a lower-cost way to pay directly from their bank account, especially useful for payment plans. **Bank/ACH Payments are already enabled by default** for **\[Practice Name\]**, so no action is needed if you'd like to keep them available. **Convenience Fees are an optional feature** and are only enabled if your practice chooses to use them. If you'd rather turn off Bank/ACH or need help managing your payment settings, I'm happy to walk you through it on a quick call, or you can update them yourself under **Adit Pay \> Preferences**.  For more detail, our help center covers both in full: Convenience Fees (https\://help.adit.com/portal/en/kb/articles/how-are-convenience-fees-different-from-surcharges-and-why-is-this-not-a-surcharge) and Bank/ACH (https\://help.adit.com/portal/en/kb/articles/what-is-ach-and-how-does-it-work-in-adit-pay). Let me know what works best. Best,\[Your Name\] |

## **Scenario B: Responding to the "is this a surcharge?" question**

| Subject: Re: Question about the new Convenience Fee |
| :---- |
| Hi \[Practice Contact Name\], Good question, and an important one. Convenience Fee is not a surcharge. A surcharge can legally only be applied to credit cards, never debit. Convenience Fee applies the same way to both credit and debit cards, and it's shown to the patient as its own line item before they pay. That's the distinction that keeps it compliant. The rate matches your current processing rate, 2.25% \+ \$0.20 for card-present transactions and 2.9% \+ \$0.30 for card-not-present, so nothing changes about your existing rates, this simply gives you the option to pass that cost through to the patient. Full details here if useful: https\://help.adit.com/portal/en/kb/articles/how-are-convenience-fees-different-from-surcharges-and-why-is-this-not-a-surcharge Happy to walk through any part of this on a call if useful. Best,\[Your Name\] |

## **Scenario C: Confirming a feature has been enabled**

| Subject: Confirmed: \[Convenience Fees / Bank-ACH\] is now live on your account |
| :---- |
| Hi \[Practice Contact Name\], Just confirming \[Convenience Fees / Bank/ACH Payments\] is now enabled for \[Practice Name\]. A couple of things to know going forward: \- The fee is shown to the patient before they pay, on every applicable transaction. \- You can turn this off at any time under Adit Pay \> Preferences. \- Full reporting on fees collected is available in your Adit Pay dashboard. For reference: https\://help.adit.com/portal/en/kb/articles/how-are-convenience-fees-different-from-surcharges-and-why-is-this-not-a-surcharge and https\://help.adit.com/portal/en/kb/articles/what-is-ach-and-how-does-it-work-in-adit-pay Let me know if you'd like a quick walkthrough, or if anything looks different than expected. Best,\[Your Name\] |

## **Scenario D: A patient or practice questions a specific fee amount**

| Subject: Re: Question about a recent transaction |
| :---- |
| Hi \[Practice Contact Name\], Thanks for flagging this. The Convenience Fee is calculated so that after the card processing cost is deducted from the total, your practice still nets the exact amount originally billed, it's not a simple percentage added on top, which is why the number can look slightly higher than expected at first glance. For a \$\[100\] charge, for example, the total comes to \$\[102.51\] (card-present) or \$\[103.30\] (card-not-present), your practice still receives the full \$\[100\] either way. Happy to walk through the specific transaction together if that would help. Best,\[Your Name\] |

## **Scenario E: A practice is hesitant, prefers cash/check**

| Subject: Following up on card payments and Convenience Fee |
| :---- |
| Hi \[Practice Contact Name\], Following up on our conversation about card payment fees. I know a big part of the hesitation with cards has been the processing cost eating into smaller transactions. With Convenience Fee turned on, a card payment nets you the same full amount as cash or check would, the patient covers the processing cost instead of your practice. It doesn't change what the patient owes for the visit itself, just who covers the cost of processing the payment method they choose. Happy to set this up together whenever you'd like to try it. Best,\[Your Name\] |

