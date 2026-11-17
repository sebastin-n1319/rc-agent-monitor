**AI Front Desk Webchat and SMS Agent \- Ortho EHR Rulebook**

*What AI FD can and cannot do per Ortho EHR · for Sales & OB scoping · Dolphin / OrthoTrac / Cloud9*

| Capability | Dolphin | OrthoTrac | Cloud9 |
| :---- | :---- | :---- | :---- |
| **Book new appointment** | Yes | Conditional | Yes |
| **Reschedule** | Yes | Yes (cancel \+ recreate) | Yes (type-config caveat) |
| **Cancel** | Yes | Yes | Yes |
| **Cancellation behaviour** | Hard delete | Hard delete | Hard delete |
| **Availability source** | Provider/Op hours (corrected \- OR logic works) | Provider/Op hours only (when configured) | Availabilities only (no OR logic) |
| **Adit App business hours respected** | Yes | No (not exposed) | N/A |

Green \= supported   ·   Yellow \= supported with a condition/caveat   ·   Red \= not supported / risk

# **Dolphin**

* **CAN**  Book, reschedule, and cancel appointments.

* **CAN**  Availability default was Provider/Op hours (same limitation as Jane) \- now corrected, so OR logic (operator \+ provider \+ Adit hours) resolves as intended.

* **WATCH**  Cancellation hard-deletes the appointment from the EHR \- no soft-cancel / status retention.

# **OrthoTrac**

* **CAN**  Book, reschedule, and cancel appointments once availability is set up.

* **HOW IT WORKS**  Runs solely on Provider \+ Op hours. When those are configured, scheduling works as expected; if they aren’t configured, no appointments can be scheduled (Adit App business hours aren’t used here).

* **WATCH**  Reschedule runs as cancel-and-recreate \- generates a new Appt ID and can trigger duplicate confirmations.

* **WATCH**  Cancellation hard-deletes from the EHR \- no soft-cancel / status retention.

# **Cloud9**

* **CAN**  Book, reschedule, and cancel appointments.

* **HOW IT WORKS**  Only the Availabilities option exists \- no OR logic; AI FD runs solely on Availabilities (single source).

* **WATCH**  Reschedule fails only when a different appointment type has been placed manually in the EHR for a type whose availability isn’t configured.

* **WATCH**  Cancellation hard-deletes from the EHR \- no soft-cancel / status retention.

# **Applies to all three EHRs**

* Cancellation \= hard delete. The slot is removed directly from the EHR on cancel; there is no broken/cancelled status to retain. Set Sales & OB expectations accordingly \- cancelled appointments will not appear as a retained record.

* Availability hinges on Provider/Op hours and schedule-template config. Template or Standard gaps can force whole days to NONE \- worth checking during OB.

# **Confirm before circulating**

One item below is drawn from prior OS-layer analysis \- worth a quick check before this goes to Sales/OB:

* OrthoTrac – duplicate-confirmation risk on the cancel-and-recreate reschedule path.