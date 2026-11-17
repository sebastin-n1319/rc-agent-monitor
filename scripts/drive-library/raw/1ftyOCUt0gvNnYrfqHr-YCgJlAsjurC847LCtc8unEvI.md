# **SMS Status – Troubleshooting Guide**

## **Overview**

We have now launched the **SMS Status feature in AditApp for Admin users**.

With this update, Adit pulls the message status from the carrier and **replicates the same status in Adit**.

### **Status Mapping**

* **Carrier → Delivered** → Adit shows **Delivered**  
* **Carrier → Failed** → Adit shows **Failed**  
* **Carrier → Sent** → Adit shows **Sent**

Going forward, please follow the troubleshooting approach below when investigating SMS-related issues.

---

## **🔍 When Should a Ticket Be Raised to T3/Engineering?**

Please **only raise to T3/Engineering when there is a status mismatch between Adit and the carrier**.

### **Examples**

* Carrier shows **Delivered**, but Adit shows **Sent/Queued**  
* Carrier shows **Failed**, but Adit shows **Sent/Queued**  
* Any other case where the status in Adit does not match the carrier

This approach will help Engineering focus on cases where there could potentially be an issue with our implementation or status synchronization.

---

## **📌 Carrier-Side Failures**

If the **Adit status matches the carrier status**, please treat the issue as a **carrier-side issue** and reach out to the respective carrier for the failure reason.

Even if the error code displayed in Adit is unclear, please check with the carrier for the actual reason for the failure.

### **Adit Error Code Reference**

**Adit SMS Error Codes:**  
SMS Failure Code 

**Default Message for outside provided Error code :** Comment by Kristy Do on Failed Reason from Telnyx & Plivo 

### **Carrier References**

* **Plivo Messaging Error Codes:**  
  [https\://www\.plivo.com/docs/messaging/troubleshooting/error-codes](https://www.plivo.com/docs/messaging/troubleshooting/error-codes)  
* **Telnyx Messaging Error Codes:**  
  [https\://support.telnyx.com/en/articles/6505121-telnyx-messaging-error-codes](https://support.telnyx.com/en/articles/6505121-telnyx-messaging-error-codes)

---

## **⚠️ Adit Shows Failed, but There Is No Corresponding Carrier Log**

There may be cases where the carrier does not show a corresponding message in its logs, while Adit shows the message as **Failed**.

In such cases, the carrier may have **rejected the message at the time of sending**, before it was fully processed or logged on their side.

When contacting the carrier, please provide the following information:

* **From number**  
* **To number**  
* **Approximate timeframe of the message**  
* Relevant **Adit message/error details**

Providing these details will help the carrier investigate and identify the actual reason for the rejection.

---

## **🎯 Goal**

By following this approach, we can clearly separate **carrier-side issues from potential Adit-side issues**, reduce unnecessary Engineering escalations, and ultimately **reduce client turnaround time**.

### **Quick Reference**

**Adit status \= Carrier status**  
→ **Investigate with the Carrier**

**Adit status ≠ Carrier status**  
→ **Raise to T3/Engineering**

### **Timezones**

* **Adit app** always shows the time of Location's timezone  
* **Telnyx** Always shows the your local system's timezone,   
* **Telnyx** webhook JSON shows timing in UTC format.  
* **Plivo** Console logs use the timezone configured for your Plivo dashboard/account.  Which is **US/Central**.

