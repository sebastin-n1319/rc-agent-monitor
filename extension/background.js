// Adit Expert for Zoho Desk: the toolbar icon opens the side panel, and the panel is told whenever the open ticket changes.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

function tellPanel(tab) {
  if (!tab || !tab.url) return;
  chrome.runtime.sendMessage({ type: 'tab', url: tab.url, tabId: tab.id }).catch(() => { /* panel not open */ });
}
chrome.tabs.onActivated.addListener(({ tabId }) => chrome.tabs.get(tabId).then(tellPanel).catch(() => {}));
chrome.tabs.onUpdated.addListener((tabId, info, tab) => { if (info.url && tab.active) tellPanel(tab); });
