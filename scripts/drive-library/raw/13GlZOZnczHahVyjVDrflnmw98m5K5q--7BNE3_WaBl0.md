**Mass texting** is a communication tool that allows practices to reach a large number of patients instantly. However, ***SMS billing is not calculated solely based on the number of recipients. Charges are determined by SMS segments, which depend on message length, character type (GSM vs. Unicode), and formatting elements such as emojis or special symbols.***

This training document explains how SMS units are calculated, why overages occur, and how to confidently interpret and communicate SMS charges to clients.

When a client sends a mass text (for example, to **3,538 recipients**), they are **not charged per person alone**.

They are charged based on:

* ✅ **Number of recipients**  
* ✅ **Length of the message**  
* ✅ **Character encoding (GSM vs Unicode)**  
* ✅ **Special characters or emojis used**

Each text sent may count as **1, 2, 3, or more SMS units per recipient.**

**Understanding SMS Character Limits**

### **GSM Encoding (Standard Characters)**

* Limit: **160 characters per SMS**  
* If message exceeds 160 characters:  
  * It splits into multiple parts  
  * Each part counts as **1 SMS unit**

When split:

* 161–306 characters \= 2 units  
* 307–459 characters \= 3 units  
* And so on

### **Unicode Encoding (Special Characters / Emojis)**

If the message contains:

* Emojis (🦷, 😊, etc.)  
* Curly quotes (“ ”)  
* Special symbols  
* Certain punctuation

Then it switches to **Unicode encoding**

* Limit: **70 characters per SMS**  
* Once over 70 characters, it splits faster  
  * 71–134 characters \= 2 units  
  * 135–201 characters \= 3 units

⚠️ Even a single emoji can reduce the character limit from 160 to 70\.

---

# **Example: Lowell Dental Arts Case**



  


### **Message Stats (from screenshot)**

* Total Characters: **290**  
* GSM Characters: 287  
* Unicode Characters: 3 (due to emoji 🦷)  
* Total SMS per recipient: **5**  
* Next part at: 45 characters

### **Why 5 Units?**

Because:

* Message length: 290 characters  
* Emoji present → Unicode encoding triggered  
* Unicode limit \= 70 characters per SMS  
* 290 ÷ 70 ≈ 5 SMS units per recipient

So even though only 1 message was typed, it counted as **5 SMS segments per person**.

---

**Explaining the 7,131 Total SMS Units (5086 \+ 2045\)**

From invoices:

| Billing Cycle | SMS Units | Charge |
| ----- | ----- | ----- |
| Dec 2025 | 2045 | \$20.45 |
| Previous Period | 5086 | \$50.86 |
| **Total** | **7131** | **\$71.31** |

Now let's connect this to the campaign: If:

* 3,538 recipients received the message  
* Each message counted as multiple SMS segments

**Example calculation:**

If average SMS segments per recipient ≈ 2:

`3,538 x 2 = 7,076 units`

If ≈ 2.01 segments per recipient:

`3,538 x 2.01 ≈ 7,113 units`

The final billed amount (7,131 units) reflects:

* Message segmentation  
* Possibly multiple campaigns  
* Replies or system messages  
* Different billing cycle splits (Nov 5–Dec 4, etc.)

This is why total SMS units are higher than total contacts.

---

**Cost Breakdown**

SMS overage is billed at:

`$0.01 per SMS unit`

So:

* 2045 units \= \$20.45  
* 5086 units \= \$50.86  
* Matches invoice totals exactly.

# **Quick Formula for Estimating Cost**

### **Step 1:**

Check SMS segments per message

### **Step 2:**

Multiply by number of recipients

`SMS Units = Recipients × Segments Per Message`

### **Step 3:**

Multiply by \$0.01

`Total Cost = SMS Units × $0.01`

---

# **Client-Facing FAQ**  **Why Is My SMS Usage Higher Than My Contact List?**

### **❓ I sent a message to 3,538 patients. Why was I charged for 7,131 SMS?**

Great question\!

SMS charges are based on **message length**, not just how many people receive it.

---

### **How It Works**

* Standard text allows **160 characters per message**  
* If your message is longer, it splits into multiple parts  
* Each part counts as 1 SMS

If you use:

* Emojis  
* Special symbols  
* Smart punctuation

The limit drops to **70 characters per message**

That means your message may count as 2–5 SMS per person.

---

### **How Charges Are Calculated**

`Number of Recipients × SMS Segments = Total SMS Units`

Each unit \= **\$0.01**

Example:

* 7,131 units \= \$71.31

---

### **How to Reduce SMS Costs**

* Keep messages under 160 characters  
* Avoid emojis  
* Avoid special symbols  
* Use shorter reminders

Know more about other overages: 





