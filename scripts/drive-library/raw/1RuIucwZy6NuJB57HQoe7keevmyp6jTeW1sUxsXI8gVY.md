**Adit Pay**

**Setup, Training & Demo Checklist**

*For Adit Pay specialists running merchant onboarding, terminal setup, and client training calls.*

**Quick-Reference Checklist**

*Condensed, on-call version. Use this while running the call; refer back to the detailed sections above for wording, explanations, and edge cases.*

**0\. Before the Call**

1. POC confirmed; owner/signer available if needed

2. Terminal on hand, charged, powered on

3. Legal name, Tax ID, business structure ready

4. Owner SSN/ITIN, DOB, home address ready

5. Bank routing \+ account number ready

6. Practice logo file ready

7. BAA/HIPAA request flagged, if asked

**1\. Merchant Onboarding**

8. Business type \+ structure selected

9. Legal name, phone, address, state entered

10. Industry \+ DBA name (capitalized) entered

11. Website entered

12. Owner name, title, email, mobile, DOB entered

13. SSN/ITIN entered (explained why)

14. Home address entered; "Next" clicked

**2\. Bank & Payout**

15. Account holder, routing \#, account \# entered \+ verified

16. Payout schedule set (daily / weekly / monthly)

17. Payout notification email(s) set

18. Transaction notification email(s) set

19. PMS/EHR posting enabled or disabled per client

**3\. Terminal Setup**

20. Language \= English; connected to secured Wi-Fi (not guest)

21. Register Terminal: code entered, labeled, Add

22. Finish \> Start Using Adit Pay

23. Update finished (restart if stuck on "please wait")

24. Logo showing on terminal

25. Test \$1 transaction run

26. Tap-to-pay (Apple/Google Pay) confirmed

**4\. Processing Payments**

27. Create Request demoed

28. All 5 methods shown: Text to Pay, In Office, Manual Entry, Card on File, Offline

29. Card on file added \+ charged

30. Receipt shown/printed

31. Ledger posting timing explained (60 sec \- 5 min)

**5\. Plans & Subscriptions**

32. Payment Plan vs. Subscription explained

33. Plan created (amount / frequency / \# payments)

34. Deposit option shown

35. Plan activated and sent

**6\. Reminders & Branding**

36. Logo uploaded

37. Link expiration time set

38. Reminders configured (days, method, time, wording)

39. Edit access confirmed (owner/manager only)

**7\. Refunds & Disputes**

40. Refund flow demoed

41. Payout-balance stipulation explained

42. Non-refundable fee explained

43. 5-7 day refund timing explained

44. Refund access restriction discussed

45. Disputes tab shown

**8\. Payouts & Reports**

46. Payouts section shown (in-transit, future, balance, lifetime)

47. Reports/filters shown

48. PMS reconciliation explained

49. Offline payment reporting explained

**9\. PMS/EHR Check**

50. Posting toggle location shown

51. Insurance exclusion explained

52. Forms auto-import verified (if applicable)

53. Ticket logged if anything is broken

**10\. Wrap-Up**

54. Recap given

55. Support contact confirmed

56. Open items logged as tickets

57. Follow-up scheduled, if needed

# **0\. Before the Call**

58. Confirm the point of contact (POC) and, if the account is a company/S-corp/LLC, confirm the practice owner or authorized signer will be available to verify business details.

59. Confirm the client has the Adit Pay card reader / terminal physically on hand (or, for setup-only calls without hardware, confirm this is a software-only session).

60. Confirm the terminal is charged and powered on.

61. Have the following ready to request from the client during the call:

* Business legal name (as filed with the IRS) and Tax ID / EIN

* Business structure (sole proprietor, single-member LLC, private corporation, S-corp, partnership, etc.)

* Practice phone number, physical address, and website URL

* Practice owner's full legal name, title, date of birth, and full SSN/ITIN (required for Stripe merchant verification; explain this is removed after verification, see Section 1\)

* Bank account holder name, routing number, and account number for payouts

* Practice logo file (for branded payment request pages and receipts)

62. If a Business Associate Agreement (BAA) or HIPAA compliance documentation has been requested by the client, flag this for follow-up before or during the call.

# **1\. Merchant Onboarding (Get Started / Stripe Setup)**

Skip this section if the practice's Adit Pay merchant account is already active.

63. Open the Adit dashboard and click the Adit Pay module (dollar-sign icon) on the left sidebar, then click Get Started.

64. Select business type: Individual or Company.

65. Select the business structure (sole proprietor, single-member LLC, private corporation, S-corp, partnership).

66. Enter legal business name exactly as it appears on the Tax ID, phone number, and physical address; select state.

67. Select industry and enter the doing-business-as (DBA) name, capitalized correctly; this is the name patients see on receipts and statements.

68. Enter the practice website (full https\:// URL).

69. Enter the practice owner's first/last name and job title (e.g., Owner).

70. Confirm/edit the email address that will receive annual 1099-K tax forms.

71. Enter the owner's mobile number.

72. Enter the owner's date of birth.

73. Enter the owner's full SSN or ITIN (explain to the client/doctor: this is a standard Stripe merchant-verification requirement to confirm US citizenship/residency, it is not stored or associated with the practice, and it is removed immediately after verification).

74. Enter the owner's home address; do not upload a photo ID unless prompted.

75. If requested, note that a BAA and HIPAA compliance confirmation should be sent by the account manager/sales contact after the call.

76. Click Next, dismiss any pop-up ("No thanks"), and proceed to bank details.

# **2\. Bank Account & Payout Configuration**

77. Click Add Account and enter the practice's checking account holder name, currency, and country (defaults to US).

78. Enter routing number and account number; verify both before clicking Next.

79. Set the payout schedule: Automatic (default: weekly on Tuesday), or change to Daily, Weekly, or Monthly. Explain that funds take 1-2 business days to post to the bank after each payout run.

80. Set the payout email notification address(es) (comma-separated for multiple, no spaces). This email receives a notice each time a payout is processed.

81. Set the transaction email notification address(es). Explain this sends one email per transaction (payment, refund, or chargeback), so high transaction volume means high email volume.

82. Confirm whether the client wants Adit to post payments to their PMS/EHR ledger (e.g., Dentrix, ChiroTouch), and enable/disable EHR posting logs accordingly.

83. Click Next to complete merchant setup.

# **3\. Card Reader / Terminal Setup**

84. On the terminal, confirm language is set to English.

85. Connect the terminal to the practice's secured Wi-Fi network, not the guest network.

86. In the Adit dashboard, click Register Terminal (top right).

87. Enter the registration code exactly as shown on the terminal screen.

88. Name the terminal under Terminal Label (e.g., "Front Desk", "Check-in", "Check-out") so it is identifiable when multiple terminals are in use.

89. Click Add, then Finish, then Start Using Adit Pay.

90. Allow the terminal to finish downloading/installing its update (can take up to 25-30 minutes); use this time to continue training on the software side.

91. If the terminal is stuck on "please wait": try a restart (press and hold the side power button, choose Restart) and reconnect to Wi-Fi.

92. Repeat registration for any additional terminals (Preferences \> Terminals \> Add Terminal).

93. Once updated, confirm the terminal displays the practice's branding/logo (not the Stripe splash screen).

94. Run a live test transaction on the terminal via In Office Payment (see Section 4\) before ending the call, ideally on a real or staff card with a \$1 charge, refunding or voiding as agreed with the client.

95. Confirm tap-to-pay (Apple Pay / Google Pay) works as an option alongside physical card insert/tap.

# **4\. Processing Payments (Core Workflow)**

96. Show the Create Request button (blue "+" icon): search for the patient by name and enter the amount.

97. Walk through all 5 payment collection methods:

* Text to Pay, sends a secure payment link by text/email

* In Office Payment, charges the registered card terminal directly

* Manual Card Entry, for phoned-in card details (charges immediately, one-time)

* Charge Card on File, save a card for repeat use, then charge by confirming the last 4 digits

* Offline Payment, logs cash/check payments manually for reporting; confirm with the client whether they want cash/check posted to Adit or handled entirely in their PMS

98. Demonstrate adding a card on file (Patient record \> Patient Info \> Payment Card Info \> Add) and charging it.

99. Show how to print or retrieve a receipt after a successful charge.

100. Explain posting timing: a processed payment typically posts to the PMS ledger within 60 seconds, up to 5 minutes.

101. Confirm whether the practice wants the card type (Visa/Mastercard/etc.) visible; note current PMS ledger character limits may restrict this (verify current product state, this has historically varied by vertical).

# **5\. Payment Plans & Subscriptions**

Cover if relevant to the practice; can be scheduled as a follow-up session for larger practices.

102. Explain the distinction: Payment Plan \= a set schedule tied to a specific treatment/balance (e.g., Invisalign, crowns); Subscription \= recurring billing for an in-house membership/discount/insurance-style plan.

103. Demo creating a payment plan: select/search patient, enter description (optional), enter total amount, set frequency (daily/weekly/biweekly/monthly), set number of payments or use the amount-per-payment toggle.

104. Show the deposit option (optional upfront amount) and how it recalculates the recurring payment.

105. Click Next through to Activate to start the plan, and show how to send the plan/request to the patient.

# **6\. Payment Reminders & Branding Preferences**

106. Upload the practice logo (Preferences \> Payment Request \> Choose File \> Crop Image) so it appears on payment pages and receipts.

107. Set the Expiration Time for Payment Request Link (Preferences \> Payment Request, bottom of page); align this to the practice's own collections timeline (commonly 30-90 days).

108. Configure Payment Reminders based on that expiration window (e.g., reminders at 15/30/45 days and a final reminder one day before expiration).

109. For each reminder, confirm: send method (recommend both text and email), send time (ask about patient demographics and practice hours to pick a time patients are likely to check messages, e.g., mid-morning to early afternoon), and message wording (default vs. a stronger "final notice" verbatim for the last reminder).

110. Explain reminders only fire for unpaid Adit Pay requests already sent, not to the full patient list automatically.

111. Confirm who has edit access to reminder templates: Owner-level and Manager-level users only.

112. Show how to disable (temporary) vs. delete (permanent) a reminder template.

113. Optionally review other Preferences settings: direct payment / enable financing options, and any PMS-specific settings (e.g., Dentrix "post to journal/patient notes" log).

# **7\. Refunds & Disputes**

114. Show how to initiate a refund: locate the patient/payment, click the refund (dollar) icon or Initiate Refund on the transaction detail page.

115. Explain refunds can be full or partial, and a reason/note can be attached.

116. Explain the key stipulation: a refund can only be processed up to the amount currently available in the practice's future payout balance (funds already paid out cannot be pulled back automatically).

117. Explain processing fees are not refunded, per card network rules, so the patient receives the charged amount minus the original processing fee unless the practice absorbs that cost.

118. Explain refunds typically take 5-7 business days to reflect on the patient's card.

119. Discuss whether the practice wants to restrict refund access to Owner/Manager-level users only (recommended for practices with many front-desk staff or high refund volume).

120. Show the Disputes tab: this is where chargebacks raised by a patient's card issuer appear; walk through what information is visible there.

# **8\. Payouts, Reports & Reconciliation**

121. Show the Payouts section: in-transit payouts, future payouts, total balance, and total lifetime payout.

122. Show the Payments/report dashboard: filter by paid, unpaid, refunded, voided, expired, etc.

123. Show the summary figures: total amount processed, total refunds processed, total disputed amount.

124. Explain that the total processed amount should reconcile against the equivalent figure in the practice's PMS reports (labeled as "Adit Pay" or "credit card payments" depending on the PMS).

125. Confirm how offline (cash/check) payments appear separately in reporting for cash-flow tracking, and note that offline payment notes stay in Adit only, they do not sync to the PMS.

# **9\. PMS / EHR Integration Check**

126. Confirm whether payment posting to the PMS ledger (e.g., Dentrix, ChiroTouch) is enabled, and where to toggle it (Settings \> Connection Status \> EHR Connection \> Enable PMS/EHR Logs). Note this is visible to Manager/Owner-level users only.

127. Confirm insurance payments are excluded from auto-posting (Adit posts payments, refunds, and discounts, not insurance line items).

128. If the practice uses PMS-based intake forms, confirm the auto-import settings under Forms Manager (auto-import to the correct PMS document folder, e.g., Patient Information vs. Patient Health History) and verify a test form actually lands in the client's PMS document center, not just in the patient's medical history fields.

129. If auto-import is not working as expected, log a support ticket with the practice's PMS name, the affected form(s), and the folder mismatch details for the product/engineering team.

# **10\. Wrap-Up**

130. Recap what was covered and flag anything left for a follow-up session (e.g., subscriptions, full payment-plan walkthrough for a second terminal or location).

131. Confirm the client knows how to reach support with questions once they start using Adit Pay live.

132. Log any open items as support tickets (integration issues, pending BAA/HIPAA docs, hardware issues) before ending the call.

133. If a second terminal, second location, or additional staff training was mentioned, schedule the follow-up before disconnecting.

**Quick-Reference Checklist**

*Condensed, on-call version. Use this while running the call; refer back to the detailed sections above for wording, explanations, and edge cases.*

**0\. Before the Call**

134. POC confirmed; owner/signer available if needed

135. Terminal on hand, charged, powered on

136. Legal name, Tax ID, business structure ready

137. Owner SSN/ITIN, DOB, home address ready

138. Bank routing \+ account number ready

139. Practice logo file ready

140. BAA/HIPAA request flagged, if asked

**1\. Merchant Onboarding**

141. Business type \+ structure selected

142. Legal name, phone, address, state entered

143. Industry \+ DBA name (capitalized) entered

144. Website entered

145. Owner name, title, email, mobile, DOB entered

146. SSN/ITIN entered (explained why)

147. Home address entered; Next clicked

**2\. Bank & Payout**

148. Account holder, routing \#, account \# entered \+ verified

149. Payout schedule set (daily / weekly / monthly)

150. Payout notification email(s) set

151. Transaction notification email(s) set

152. PMS/EHR posting enabled or disabled per client

**3\. Terminal Setup**

153. Language \= English; connected to secured Wi-Fi (not guest)

154. Register Terminal: code entered, labeled, Add

155. Finish \> Start Using Adit Pay

156. Update finished (restart if stuck on "please wait")

157. Logo showing on terminal

158. Test \$1 transaction run

159. Tap-to-pay (Apple/Google Pay) confirmed

**4\. Processing Payments**

160. Create Request demoed

161. All 5 methods shown: Text to Pay, In Office, Manual Entry, Card on File, Offline

162. Card on file added \+ charged

163. Receipt shown/printed

164. Ledger posting timing explained (60 sec \- 5 min)

**5\. Plans & Subscriptions**

165. Payment Plan vs. Subscription explained

166. Plan created (amount / frequency / \# payments)

167. Deposit option shown

168. Plan activated and sent

**6\. Reminders & Branding**

169. Logo uploaded

170. Link expiration time set

171. Reminders configured (days, method, time, wording)

172. Edit access confirmed (owner/manager only)

**7\. Refunds & Disputes**

173. Refund flow demoed

174. Payout-balance stipulation explained

175. Non-refundable fee explained

176. 5-7 day refund timing explained

177. Refund access restriction discussed

178. Disputes tab shown

**8\. Payouts & Reports**

179. Payouts section shown (in-transit, future, balance, lifetime)

180. Reports/filters shown

181. PMS reconciliation explained

182. Offline payment reporting explained

**9\. PMS/EHR Check**

183. Posting toggle location shown

184. Insurance exclusion explained

185. Forms auto-import verified (if applicable)

186. Ticket logged if anything is broken

**10\. Wrap-Up**

187. Recap given

188. Support contact confirmed

189. Open items logged as tickets

190. Follow-up scheduled, if needed

