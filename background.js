import { createEvent, defaultTimes } from './firestore.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'mia-send-selection',
    title: 'Send selection to Mia Calendar',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: 'mia-send-page',
    title: 'Send this page to Mia Calendar',
    contexts: ['page'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    const { start, end } = defaultTimes();
    const selected = (info.selectionText || '').trim();
    const title =
      selected.slice(0, 80) ||
      (tab?.title || 'Web capture').slice(0, 120);

    await createEvent({
      title,
      start,
      end,
      description: selected || '',
      pageUrl: info.pageUrl || tab?.url || '',
    });

    if (tab?.id != null) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const el = document.createElement('div');
          el.textContent = 'Sent to Mia Calendar';
          el.style.cssText =
            'position:fixed;z-index:2147483647;bottom:16px;right:16px;' +
            'background:#2563eb;color:#fff;padding:10px 14px;border-radius:10px;' +
            'font:600 13px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.2)';
          document.body.appendChild(el);
          setTimeout(() => el.remove(), 1800);
        },
      });
    }
  } catch (err) {
    console.error('Mia extension error', err);
  }
});
