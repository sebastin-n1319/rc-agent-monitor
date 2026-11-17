

**ADIT PAY**

**Statement IQ**

User Manual & Reference Guide

*AI-powered merchant statement analysis for Adit Pay teams*

Prepared by Sebastin N (Sabari) \- T1 CS\_AP Support

September 2026

# **1\. What Is AditPay Statement IQ?**

AditPay Statement IQ is an internal web application that reads a merchant’s current credit card processing statement, extracts the key numbers using AI, and instantly calculates how much that practice would save by switching to Adit Pay. It is used across Sales, Sales Engineering, Support, and CS teams to turn a raw PDF statement into a clear, shareable savings analysis in under a minute.

In short, the tool answers one question for any merchant: "What are they paying today, and what would they pay with Adit Pay instead?" \- backed by real numbers pulled from their own statement, not estimates.

### **What it does**

* Reads statements in PDF, scanned image, screenshot, or Excel/CSV format and extracts volume, transaction count, total fees, processor, and billing period.

* Calculates the merchant’s current effective processing rate and compares it to Adit Pay’s flat rate.

* Flags itemized add-on fees (PCI, statement, batch, equipment lease, etc.) the merchant pays today that Adit Pay does not charge.

* Models Convenience Fee and Bank/ACH opportunities as an additional revenue lever, where eligible.

* Auto-saves every analysis to a shared team Dashboard and can push results directly to Zoho CRM.

* Produces a printable, client-ready report.

# **2\. Getting Started**

## **2.1 Signing In**

Access is restricted to @adit.com Google accounts. On first visit:

1. Go to https\://aditpaystatementiq.up.railway.app.

2. Click Sign in with Google.

3. Choose your @adit.com account. Personal or non-Adit accounts are rejected automatically.

4. On your very first login, you may be asked to select your department/team \- this is used to route CRM/AP visibility and cannot be skipped.

| Note If you see "Access denied \- use your @adit.com Google account," you signed in with the wrong account. Sign out of Google and retry with your work account. |
| :---- |

## **2.2 The Layout**

Once signed in, you land on the Dashboard. The left sidebar is your main navigation:

* Dashboard \- every analysis your whole team has run, in one shared feed.

* New Analysis \- upload and analyze a statement.

* CRM History \- analyses linked to Zoho CRM records.

* Reports \- team-wide analytics and insights.

* Statement Decoder \- an in-app guide to reading statements and understanding results (see Section 9).

* Settings \- personal preferences and, for admins, team/account management.

# **3\. Analyzing a Statement**

## **3.1 Uploading**

Go to New Analysis and drop the merchant’s statement into the upload area, or click to browse.

| \[ SCREENSHOT PLACEHOLDER \] *New Analysis page \- upload area and Manual Entry form* |
| :---: |

| Accepted formats | Notes |
| :---- | :---- |
| PDF | Digital or scanned. Scanned/garbled PDFs are automatically routed through OCR. |
| PNG, JPG, WEBP, TIFF | Photos or screenshots of a statement page. |
| XLSX, CSV | Exported statement data. |

Maximum file size is 5 MB. If a file is larger, use the built-in Reduce Size option before uploading.

## **3.2 AI Extraction**

After upload, click Analyze Statement with AI. The tool reads every page (summary totals are often on the last page, so multi-page statements are fully processed) and extracts:

* Practice / merchant name

* Total transaction volume

* Transaction count

* Total fees paid

* Processor name

* Statement / billing period

* Itemized add-on fees, where the statement lists them separately

## **3.3 Review & Edit**

The AI Extracted Values screen shows every field with a green "Looks good" badge once it is confident, or a "Needs review" flag if a number looks off (for example, a fee-to-volume ratio outside the normal 0.8%–8% range). Always check these fields against the original statement before continuing \- the most common correction needed is a missed total on a multi-page statement.

| Tip If a hidden-fees box appears here, it lists named add-on fees found on the statement (e.g. PCI Compliance, Monthly Service Fee) that Adit Pay does not charge \- useful talking points, separate from the core processing rate comparison. |
| :---- |

## **3.4 Transaction Type Split**

Use the Card Terminal vs. Online (CNP) slider to reflect how the merchant actually takes payments, since Adit Pay charges a different rate for each:

| Transaction type | Adit Pay rate |
| :---- | :---- |
| Card Terminal (card-present) | 2.25% \+ \$0.20 per transaction |
| Online / phone / manual (CNP) | 2.90% \+ \$0.30 per transaction |

The AI estimates a starting split from the statement; adjust it if you know the practice’s real payment mix. Click Confirm & Calculate to see the full results.

# **4\. Understanding Your Results**

## **4.1 The Four Core Numbers**

* Total Volume \- gross dollar amount processed for the period. Every other figure is derived from this.

* Transaction Count \- how many individual charges made up that volume; drives per-transaction fee impact.

* Total Fees Paid \- everything the current processor charged, all-in.

* Effective Rate \- Total Fees ÷ Total Volume. The single best number for comparing processors regardless of pricing model.

## **4.2 The Comparison Workout Table**

This table is the literal math behind the "Monthly Savings" headline, shown transaction-type by transaction-type so it can be explained line by line if a client asks how the number was reached. It splits volume and count by the Transaction Type Split slider, applies Adit Pay’s rate to each bucket, and totals them into the "Adit Pay Fees" figure used everywhere else on the page.

**Monthly Savings \= Current Total Fees − Adit Pay Fees.** 

A negative result means Adit Pay’s fees would be higher than what the merchant pays today \- this happens on already-cheap, high-volume interchange-plus plans. It is a real result, not an error; see the Statement Decoder for how to handle it in conversation.

## **4.3 Opportunity Signal**

Every analysis gets a color-coded strength rating based on fee reduction:

| Green \- 10%+ fee reduction Strong, easy-to-lead-with case. Lead with the dollar amount, not the percentage. |
| :---- |

| Yellow \- 5–10% fee reduction Worth pursuing, usually paired with a non-price value pitch (flat, predictable rate). |
| :---- |

| Red \- under 5%, or negative Fee savings alone won’t close it \- shift to platform value. See the Agent Playbook for scripts. |
| :---- |

## **4.4 Typical Market Rate**

Shown alongside the existing and Adit Pay rates, this is a single, configurable industry-average effective rate (default 2.7%, editable in Settings) \- not specific to this statement. It answers a different question: is what the merchant pays today high even by general market standards, independent of whether Adit Pay is the alternative.

## **4.5 Convenience Fee & Bank/ACH Opportunity**

A separate opportunity from the core fee comparison \- about how future payments are collected, not renegotiating the current processor.

| Option | How it works | Key restrictions |
| :---- | :---- | :---- |
| Convenience Fee | Passes Adit Pay’s card processing cost to the patient on a one-time card payment; practice nets 100% of the billed amount. | Card-only. Never applies to payment plans, subscriptions, HSA/FSA, or CareCredit. Blocked entirely in CT, ME, MA, and Canada. |
| Bank/ACH | Flat 0.5% \+ \$1.75/transaction, charged to the practice instead of card processing cost. | Never shown to the patient. Settles in 1–4 business days. Not available in Canada. Best for payment plans/memberships. |

Both cards use adjustable eligibility percentages (default 85% CF-eligible / 0% ACH-shift) rather than assuming 100% of volume \- set a realistic percentage per client and the tool shows both that estimate and the full ceiling for reference. Select the practice’s state to see eligibility.

# **5\. Saving Your Work**

You do not need to remember to save. AditPay Statement IQ silently checkpoints your analysis to the shared Dashboard in the background as you work \- look for the small "Auto-saved to dashboard" indicator near the results.

### **What the Save/Push button does now**

* Push to CRM \- shown once an AP ID has been linked; click to send the analysis to the matching Zoho CRM record.

* ✓ Saved to Dashboard \- shown (disabled) once autosave has already captured everything and there is nothing left to push.

| Note Autosave never pushes to Zoho CRM on its own \- that action always requires a deliberate click, so nothing reaches CRM without you confirming it. |
| :---- |

# **6\. The Dashboard**

The Dashboard is a single, shared feed of every analysis run by anyone on the team. Each card shows the practice name, processor, volume, fees, monthly savings, and opportunity signal.

* Search by practice name or processor using the search bar.

* Sort by savings, date, or practice name.

* Click any card to open the full analysis, re-print it, re-push to CRM, or add follow-up notes.

* The sidebar badge always reflects the live, current record count.

| \[ SCREENSHOT PLACEHOLDER \] *Dashboard \- team feed, stat cards, and Signal Distribution* |
| :---: |

# **7\. CRM History & Pushing to Zoho**

To push an analysis to Zoho CRM, link an AP ID (e.g. "AP \- 5514") before or after analyzing, then click Push to CRM. The tool searches for the matching Adit\_Pay record and attaches the analysis, including the original statement file, with duplicate and out-of-order push detection built in.

The CRM History page lists every analysis that has been linked to or pushed into a CRM record, for quick reference during follow-up.

| \[ SCREENSHOT PLACEHOLDER \] *CRM History \- pushed statements and sync stats* |
| :---: |

# **8\. Reports & Analytics**

The Reports page rolls up every saved analysis into team-wide metrics: average effective rate vs. the industry benchmark, total identified savings, opportunity distribution, and prioritized insights (e.g. high-value leads not yet pushed to CRM, or an above-benchmark average rate worth a closer look).

| \[ SCREENSHOT PLACEHOLDER \] *Reports \- team-wide metrics and insights* |
| :---: |

# **9\. Statement Decoder (In-App Guide)**

For a deeper walkthrough of how to read a statement and interpret every result on this tool \- including what the Comparison Workout table proves, how to read a negative-savings result, what counts as a genuine hidden fee vs. an unavoidable network cost, and a Convenience Fee/Bank-ACH quick reference \- open Statement Decoder from the sidebar under Tools. It is written for agents who are new to reading merchant statements.

| \[ SCREENSHOT PLACEHOLDER \] *Statement Decoder \- in-app guide* |
| :---: |

# **10\. Agent Playbook**

The Agent Playbook (accessible from the sidebar under Tools) is a separate, sales-focused reference: opening scripts, objection handling, and talking points organized by opportunity signal (green/yellow/red). Use it alongside the Statement Decoder \- the Decoder explains the numbers, the Playbook explains what to say.

| \[ SCREENSHOT PLACEHOLDER \] *Agent Playbook \- objection handling and talking points* |
| :---: |

# **11\. Settings**

* Analysis Defaults \- set the industry benchmark rate (default 2.7%) and default transaction type split used for new analyses.

* Display Preferences \- dark mode, compact sidebar, and similar personal preferences.

* Data Management \- export your team’s data.

* Account \- your profile and department.

* Admin-only sections (visible to admins) \- Manage Teams, User Departments, Admin Management, Ingest API Keys, Active Sessions, Debug Log, and Danger Zone.

| \[ SCREENSHOT PLACEHOLDER \] *Settings \- preferences and admin sections* |
| :---: |

# **12\. Troubleshooting & FAQ**

### **"Could not parse AI response"**

Usually clears up on a retry. If it persists on one specific file, the statement likely has an unusually long, granular fee breakdown \- re-upload and try again, and if it keeps failing, report the file to the team so it can be investigated.

### **"Access denied" at sign-in**

You are signing in with a [staff email] Google account. Use your work Google account.

### **A record isn’t showing up on the Dashboard**

Check the auto-save status indicator on the results page \- if it shows a red "Not saved yet" message, the save failed (commonly an expired session) and will automatically retry. Refresh and confirm you are still signed in.

### **Monthly Savings shows a negative number**

This is a valid result, not a bug \- it means the merchant’s current rate is already close to or below Adit Pay’s. See Section 4.2 and the Statement Decoder for how to handle this conversation.

### **File won’t upload**

Confirm it is one of the supported formats (Section 3.1) and under 5 MB. Use the Reduce Size option for oversized PDFs or images.

# **13\. Getting Help**

For questions about a specific analysis, use the Statement Decoder and Agent Playbook first \- most "why does this number look like this" questions are answered there. For access issues, bugs, or feature requests, contact Sebastin N (Sabari), T1 CS\_AP Support.