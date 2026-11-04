# Adit Expert for Zoho Desk

A Chrome side panel that shows Adit Expert's review of the Zoho Desk ticket you have open: the verdict, findings, who the reply goes to, other practices with the same problem, the reply to send and the private note. It reads only the ticket id from the address bar. Nothing is sent or changed from it.

## Install (until it is in the Chrome Web Store)

1. In Chrome, open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and pick this `extension` folder.
3. Pin **Adit Expert for Zoho Desk** to the toolbar.
4. Sign in to the tool (https://rc-t1cs-monitor.up.railway.app) in the same Chrome.
5. Open a ticket in Zoho Desk and click the Adit Expert icon. The panel stays open as you move between tickets.

The first review of a ticket takes about two minutes. It is kept until the ticket changes in Desk, so it opens at once after that. **Review again** asks for a fresh one.

The extension id is fixed by the key in `manifest.json` (igelfiicjagpofoncmipfepfkocilhpa); the tool only accepts the panel's requests from that id (or ids listed in EXPERT_EXTENSION_IDS).
