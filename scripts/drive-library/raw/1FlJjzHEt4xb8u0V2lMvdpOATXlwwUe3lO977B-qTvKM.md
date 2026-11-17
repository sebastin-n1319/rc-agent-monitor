**PBX Portal**



### **Login**

To access the portal, sign in using your account credentials.

* **Username:** `[staff email]`  
* **Password:** `123xxxx789`

Enter your username and password in the respective fields, then click **Login** to access your account.

**Welcome to the dashboard:**  


**Organization**  
Select the organization for which you want to view and manage the available PBX features and settings.

**Location**  
An organization may have multiple locations. Select the required location to display the corresponding data and settings throughout the portal.

> **Note:** After selecting the organization and location, click **Save Selection** to apply your choices. The portal will then display the data and settings associated with the selected organization and location.

### Dashboard  

Dashboard Overview

The **Dashboard** provides a quick overview of the selected organization's location and easy access to commonly used features.

The dashboard includes:

* **Feature Summary:** Displays the total number of PBX features configured for the selected location, including **Extensions**, **Ring Groups**, **DID Numbers**, and **Voicemails**.  
* **Recent Call Logs:** Provides a list of the most recent call activities for quick reference.  
* **Quick Actions:** Offers shortcuts to frequently used tasks to view **Extension**, **Ring Group**, **DID Numbers**, and **Call Flows**.

###  **Extensions** **** 

The Extensions page displays all extensions configured for the selected location, along with their associated details.

The following information is available for each extension:

* Extension Number  
* Line Type  
* Assigned Device  
* Device Model  
* Status

Extension Number Format

* **Hardline Extensions:** Three-digit numbers ranging from 101 to 750\.  
* **Softline Extensions:** Three-digit numbers ranging from 001 to 100\.



**Extension Parking**

The **Extension Parking** section displays the parking details configured for extensions at the selected location.

This page provides information about parked calls and their associated parking extensions, allowing users to view and manage call parking assignments efficiently.

### **Voicemail Box**



**Group Mailbox and Extension Mailbox**

This section displays the configured **Group Mailbox** and **Extension Mailbox**. Users can view the assigned mailbox information from this section.

### **Ring Groups**



Ring group listing will be displayed in this section

**Add a Ring Group**

Use this section to create and configure a **Ring Group** for incoming calls.

Ring Strategy

Select the ringing strategy that determines how calls are distributed among the destinations. Available strategies include:

* **Simultaneous** – Rings all destinations at the same time.  
* **Random** – Rings a randomly selected destination.  
* Other available strategies, depending on your system configuration.

**Ring Timeout**

Specify the **Ring Timeout** in seconds. This defines how long the system will attempt to ring the configured destinations before executing the failover action.

**Destinations**

Add one or more destinations that will receive incoming calls. You can configure:

* **Extensions** – Select one or more available extensions.  
* **External Numbers** – Add external phone numbers as call destinations.

Multiple destinations can be added to the same Ring Group.

**Failover Destination**

Configure the action to be performed if the call is not answered within the specified ring timeout. Available options include:

* **Hang Up** – Disconnect the call.  
* **Transfer to Extension** – Forward the call to a selected extension.  
* **Send to Voicemail Box** – Route the call to a selected voicemail box that has already been created.

**Caller ID**

Optionally, configure the **Caller ID Name** and **Caller ID Number** that will be presented when the Ring Group places outbound calls.

**Call Forwarding**

If **Call Forwarding** is enabled, specify the **Forward Destination** where calls should be redirected.

###  **IVR Menu**



The **Create IVR Menu** feature allows administrators to create an Interactive Voice Response (IVR) menu that routes incoming callers based on their DTMF (keypad) input.

| Field | Required | Description |
| ----- | ----- | ----- |
| **IVR Name** | Yes | Enter a unique name for the IVR menu (e.g., **Main Menu**, **Support IVR**). |
| **Description** | No | Provide a brief description of the IVR menu for administrative reference. |
| **Timeout (sec)** | Yes | Specifies the number of seconds the system waits for caller input before triggering a timeout action. Default: **10 seconds**. |
| **Max Failures** | Yes | Maximum number of invalid key presses allowed before executing the failure action. Default: **3**. |
| **Max Timeouts** | Yes | Maximum number of consecutive timeouts allowed before executing the timeout action. Default: **3**. |
| **Allow Direct Dial** | No | When enabled, callers can directly dial an extension without navigating the IVR menu. |
| **Enabled** | Yes | Determines whether the IVR menu is active and available for incoming calls. |
| **DTMF Options** | No | Configure keypad options (0–9, \*, \#) and define the action performed when callers press a specific key. |



**DTMF Options**

The **DTMF Options** section defines the actions performed when a caller presses a specific key during the IVR call flow. Click **\+ Add Option** to create one or more DTMF mappings.

**Available Actions**

**1\. Execute Application**

Routes the caller to a specific application or destination.

**Parameter:** Enter the application or destination identifier (for example, `transfer 101`, `queue Sales`, or another configured application).

**Example**

| Digit | Action | Parameter | Description |
| ----- | ----- | :---- | :---- |
| 1 | Execute Application | transfer 101 | Sales Department |

---

**2\. Sub Menu**

Transfers the caller to another IVR menu.

**Parameter:** Select or enter the target IVR submenu.

**Example**

| Digit | Action | Parameter | Description |
| ----- | ----- | ----- | :---- |
| 2 | Sub Menu | Support Menu | Technical Support |

---

**3\. Return to Top**

Returns the caller to the main (top-level) IVR menu.

**Parameter:** Not required.

**Example**

| Digit | Action | Description |
| ----- | ----- | :---- |
| 9 | Return to Top | Return to Main Menu |

---

**4\. Go Back**

Returns the caller to the previous IVR menu.

**Parameter:** Not required.

**Example**

| Digit | Action | Description |
| ----- | ----- | :---- |
| \* | Go Back | Return to Previous Menu |

---

**5\. Exit**

Ends the IVR interaction or exits the current menu according to the configured call flow.

**Parameter:** Not required.

**Example**

| Digit | Action | Description |
| ----- | ----- | ----- |
| \# | Exit | End Call |

**Validation Rules**

* **Digit** is mandatory.  
* Only one entry is allowed per DTMF digit within the same IVR menu.  
* Supported digits are **0–9**, **\***, and **\#**.  
* **Action** is mandatory.  
* **Parameter** is required only for actions that require a destination, such as **Execute Application** and **Sub Menu**.  
* **Description** is optional but recommended for easier administration.

---

**Notes**

* Configure each DTMF option according to your organization's call-routing requirements.  
* Ensure all referenced applications, extensions, queues, or submenus exist before saving the IVR.  
* Multiple DTMF options can be added using the **\+ Add Option** button.  
* Use clear descriptions to simplify future maintenance and troubleshooting of the IVR configuration.

### **Business Hours**     The **Create Business Hours** feature allows administrators to define operating schedules that determine when the system is considered open or closed. Business hours can be configured using a weekly schedule, holidays, and special hours.

---

| Tab | Description |
| :---- | ----- |
| **Weekly Schedule** | Configure the regular operating hours for each day of the week. |
| **Holidays** | Define holidays when normal business hours should not apply. |
| **Special Hours** | Configure temporary schedules for specific dates, such as company events or seasonal hours. |

**Quick Presets**

Quick Presets provide commonly used schedules that can be applied automatically.

| Preset | Description |
| :---- | ----- |
| **Mon–Fri 9–5** | Sets Monday through Friday to **09:00–17:00**. Weekends remain closed. |
| **Mon–Fri 8–6** | Sets Monday through Friday to **08:00–18:00**. Weekends remain closed. |
| **24/7** | Enables all seven days with continuous 24-hour availability. |
| **All Closed** | Disables business hours for every day of the week. |

**Additional Field Descriptions**

| Field | Required | Description |
| :---- | :---- | ----- |
| **Description** | No | Enter an optional description for the business hours configuration. This can be used to provide additional information, such as the purpose or intended use of the schedule (e.g., *Main office operating hours for customer support*). |
| **Active** | No | Enables or disables the business hours configuration. When **Active** is enabled, the schedule can be used by the system. When disabled, the configuration is saved but will not be applied until it is activated. |

























