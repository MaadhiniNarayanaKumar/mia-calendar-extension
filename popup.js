import {
  combineDateTime,
  createEvent,
  defaultTimes,
  toDateValue,
  toTimeValue,
} from './firestore.js';
import { parseInviteText } from './parse_invite.js';

const form = document.getElementById('form');
const pasteEl = document.getElementById('paste');
const pasteBlock = document.getElementById('pasteBlock');
const pasteCollapsed = document.getElementById('pasteCollapsed');
const titleEl = document.getElementById('title');
const dateEl = document.getElementById('date');
const startTimeEl = document.getElementById('startTime');
const endTimeEl = document.getElementById('endTime');
const timesRow = document.getElementById('timesRow');
const durationEl = document.getElementById('duration');
const allDayEl = document.getElementById('allDay');
const locationEl = document.getElementById('location');
const notesEl = document.getElementById('notes');
const calendarEl = document.getElementById('calendar');
const calendarDot = document.getElementById('calendarDot');
const reminderEl = document.getElementById('reminder');
const submitEl = document.getElementById('submit');
const statusEl = document.getElementById('status');
const parseBtn = document.getElementById('parse');
const scrapeBtn = document.getElementById('scrape');
const toastEl = document.getElementById('toast');
const steps = [...document.querySelectorAll('#steps li')];

/** Duration in ms between start/end — preserved when start moves. */
let durationMs = 60 * 60 * 1000;
let pasteCollapsedMode = false;

const GUESS_FIELDS = {
  title: titleEl,
  location: locationEl,
  notes: notesEl,
  start: [dateEl, startTimeEl],
  end: [endTimeEl],
};

function setStep(n) {
  steps.forEach((li) => {
    const s = Number(li.dataset.step);
    li.classList.toggle('active', s === n);
    li.classList.toggle('done', s < n);
  });
}

function setStatus(message, ok) {
  statusEl.hidden = !message;
  statusEl.textContent = message || '';
  statusEl.className = `status ${ok ? 'ok' : 'err'}`;
}

function clearGuesses() {
  document.querySelectorAll('.guessed').forEach((el) => el.classList.remove('guessed'));
}

function markGuessed(names = []) {
  clearGuesses();
  for (const name of names) {
    const target = GUESS_FIELDS[name];
    if (!target) continue;
    const list = Array.isArray(target) ? target : [target];
    list.forEach((el) => el.classList.add('guessed'));
  }
}

function autosizeTitle() {
  titleEl.style.height = 'auto';
  const next = Math.min(72, Math.max(42, titleEl.scrollHeight));
  titleEl.style.height = `${next}px`;
}

function formatDuration(ms) {
  if (ms <= 0) return '—';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return h === 1 ? '1 hr' : `${h} hr`;
  return `${h}h ${m}m`;
}

function currentStart() {
  return combineDateTime(dateEl.value, startTimeEl.value, allDayEl.checked);
}

function currentEnd() {
  if (allDayEl.checked) {
    const s = currentStart();
    return new Date(s.getFullYear(), s.getMonth(), s.getDate(), 23, 59, 0, 0);
  }
  return combineDateTime(dateEl.value, endTimeEl.value, false);
}

function updateDurationLabel() {
  const start = currentStart();
  const end = currentEnd();
  durationMs = Math.max(0, end - start);
  durationEl.textContent = formatDuration(durationMs || 60 * 60 * 1000);
}

function syncAllDayUi() {
  timesRow.classList.toggle('hidden', allDayEl.checked);
  startTimeEl.required = !allDayEl.checked;
  endTimeEl.required = !allDayEl.checked;
  updateDurationLabel();
}

function setDateTimes(start, end) {
  dateEl.value = toDateValue(start);
  startTimeEl.value = toTimeValue(start);
  endTimeEl.value = toTimeValue(end);
  durationMs = Math.max(end - start, 15 * 60 * 1000);
  updateDurationLabel();
}

function collapsePaste(collapsed) {
  pasteCollapsedMode = collapsed;
  pasteBlock.hidden = collapsed;
  pasteCollapsed.hidden = !collapsed;
  if (collapsed) setStep(2);
  else setStep(1);
}

function applyParsed(parsed) {
  if (!parsed) {
    setStatus('Couldn’t parse that invite text', false);
    return;
  }
  titleEl.value = parsed.title || '';
  autosizeTitle();
  allDayEl.checked = !!parsed.allDay;
  setDateTimes(parsed.start, parsed.end);
  locationEl.value = parsed.location || '';
  notesEl.value = parsed.notes || '';
  markGuessed(parsed.guessed || ['title', 'start', 'end', 'location']);
  syncAllDayUi();
  collapsePaste(true);
  setStatus('Review highlighted fields, then Send', true);
  setStep(2);
}

async function loadPrefs() {
  const stored = await chrome.storage.local.get(['lastCalendarId', 'lastReminder']);
  if (stored.lastCalendarId) {
    calendarEl.value = stored.lastCalendarId;
  }
  if (stored.lastReminder != null) {
    reminderEl.value = stored.lastReminder;
  }
  updateCalendarDot();
}

function updateCalendarDot() {
  const opt = calendarEl.selectedOptions[0];
  calendarDot.style.background = opt?.dataset.color || '#4F46E5';
}

function resetForm() {
  pasteEl.value = '';
  titleEl.value = '';
  notesEl.value = '';
  locationEl.value = '';
  allDayEl.checked = false;
  const { start, end } = defaultTimes();
  setDateTimes(start, end);
  clearGuesses();
  collapsePaste(false);
  setStatus('', true);
  autosizeTitle();
  syncAllDayUi();
  setStep(1);
  pasteEl.focus();
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  setTimeout(() => {
    toastEl.hidden = true;
  }, 1200);
}

// Init
const defaults = defaultTimes();
setDateTimes(defaults.start, defaults.end);
syncAllDayUi();
loadPrefs().then(() => pasteEl.focus());
setStep(1);

parseBtn.addEventListener('click', () => {
  applyParsed(parseInviteText(pasteEl.value));
});

pasteEl.addEventListener('paste', () => {
  setTimeout(() => {
    if (pasteEl.value.trim().length > 12) {
      applyParsed(parseInviteText(pasteEl.value));
    }
  }, 0);
});

pasteCollapsed.addEventListener('click', () => {
  collapsePaste(false);
  pasteEl.focus();
});

scrapeBtn.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus('No active tab', false);
      return;
    }
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        text: document.body?.innerText || '',
        title: document.title || '',
        url: location.href,
      }),
    });
    const parsed = parseInviteText(result?.text || '', {
      requireWhen: true,
      pageTitle: result?.title || '',
    });
    if (!parsed) {
      setStatus(
        'No event with a real date/time found — paste the invite instead',
        false,
      );
      return;
    }
    if (!pasteEl.value) pasteEl.value = (result?.text || '').slice(0, 2000);
    applyParsed(parsed);
  } catch (err) {
    console.error(err);
    setStatus(err.message || String(err), false);
  }
});

titleEl.addEventListener('input', autosizeTitle);

allDayEl.addEventListener('change', syncAllDayUi);

startTimeEl.addEventListener('change', () => {
  const start = currentStart();
  const end = new Date(start.getTime() + (durationMs || 60 * 60 * 1000));
  endTimeEl.value = toTimeValue(end);
  // If end crossed midnight, date stays same for simplicity in popup
  updateDurationLabel();
  setStep(2);
});

dateEl.addEventListener('change', () => {
  const start = currentStart();
  const end = new Date(start.getTime() + (durationMs || 60 * 60 * 1000));
  endTimeEl.value = toTimeValue(end);
  updateDurationLabel();
});

endTimeEl.addEventListener('change', updateDurationLabel);

calendarEl.addEventListener('change', () => {
  updateCalendarDot();
  chrome.storage.local.set({ lastCalendarId: calendarEl.value });
});

reminderEl.addEventListener('change', () => {
  chrome.storage.local.set({ lastReminder: reminderEl.value });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitEl.disabled = true;
  setStatus('Sending…', true);
  setStep(3);

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const pageUrl = tabs[0]?.url || '';
    const start = currentStart();
    let end = currentEnd();
    if (!allDayEl.checked && end <= start) {
      end = new Date(start.getTime() + (durationMs || 60 * 60 * 1000));
    }

    const opt = calendarEl.selectedOptions[0];
    await createEvent({
      title: titleEl.value,
      start,
      end,
      allDay: allDayEl.checked,
      location: locationEl.value,
      description: notesEl.value,
      pageUrl,
      calendarId: calendarEl.value,
      color: opt?.dataset.color || '#4F46E5',
      reminderMinutes: reminderEl.value,
    });

    await chrome.storage.local.set({
      lastCalendarId: calendarEl.value,
      lastReminder: reminderEl.value,
    });

    setStatus('', true);
    showToast('Sent to Mia ✓');
    setTimeout(() => {
      resetForm();
      submitEl.disabled = false;
      window.close();
    }, 900);
  } catch (err) {
    console.error(err);
    setStatus(err.message || String(err), false);
    submitEl.disabled = false;
    setStep(2);
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    form.requestSubmit();
  }
});
