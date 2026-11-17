# **CSR Automation – Process Document (Zoho CRM → Asana)**

## **1\) Introduction & Purpose**

This document defines the end‑to‑end automation to generate and deliver a CSR (Customer Service Record) PDF for a Deal in Zoho CRM, coordinate fulfillment via Asana, and write back delivery outcomes to the Deal. The automation is initiated by a single checkbox in the Deal: **Request for CSR**.

**Scope:** Deals module in Zoho CRM; Asana for task management; Export CSR data and produce a PDF.

---

## **2\) Goals & Objectives**

* **Single‑click request:** Trigger CSR creation from a checkbox on the Deal.  
* **Zero‑touch fulfillment:** Auto‑create an Asana task (assigned to **Summit**) with all Deal context and a checklist.  
* **Reliable CSR generation:** Export CSR data and produce a standardized PDF file.  
* **Closed‑loop updates:** On task completion, CSR PDF attached to the Deal, Update **CSR Delivery Date**, and tag **CSM/Manager** for visibility.  
* **Auditability:** Keep a clear activity trail in both Zoho and Asana.

---

## **3\) Roles & Responsibilities**

* **Deal Owner (Sales/SDR/AE/CSM):** Checks **Request for CSR** on the Deal; reviews attachment and date after delivery.  
* **Summit (Assignee in Asana):** Owns fulfillment, validates generated CSR, marks task complete when ready.  
* **CSM/Manager:** Tagged at delivery; reviews and takes any follow‑up action with the customer.  
* **Sales Ops / Admin:** Maintains automation rules, Asana template, field mappings; monitors error queue and retries.

---

## **4\) Process Steps**

### **Trigger (Zoho Deals)**

1. User ticks **Request for CSR** (checkbox) on a Deal.  
2. Fire flow **Create\_AsanaTask\_For\_CSR** with Deal ID.



### 

### **Task Creation (Asana → Assigned to Summit)**

1. Create task in Asana using a standard template:  
   * **Task Name:** `CSR: <Account Name> – <Deal Name> (#<Deal ID>)`  
   * **Assignee:** Summit  
   * **Project/Section:** Customer Docs / CSR Requests  
   * **Due Date (SLA):** Today  
   * **Description (auto‑filled):**  
     * Deal URL  
     * Deal Name

   

### **Fulfillment (CSR Export & PDF)**

1. Summit calls **CSR Export Service** with Deal ID → returns PDF (and log/metadata).  
2. If generation succeeds → attach PDF to Asana task (for QA).  
3. Update Deal with CSR Delivery Date  
   

---

## 

## **5\) Important Notes & Considerations**

* **Field Mappings (minimum):**  
  * *Deal*: Deal Name, Deal ID  
  * Request for CSR (Checkbox), CSR Delivery Date (Date/Time),   
* **Security:** Limit CSR PDF visibility to relevant roles. Avoid embedding sensitive tokens in task descriptions.  
* **SLA:** Default 1 business days; configurable in an Admin Settings record or function parameter.

## **6\) Important Notes & Considerations**

- Report Links  
  - [https\://crm.zoho.com/crm/org56875003/tab/Reports/1607362001524340554](https://crm.zoho.com/crm/org56875003/tab/Reports/1607362001524340554)  
  -   
  - 



