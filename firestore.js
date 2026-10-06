import { CONFIG } from './config.js';

const API_KEY = CONFIG.apiKey;

function authUrl(path) {
  return `https://identitytoolkit.googleapis.com/v1/${path}?key=${API_KEY}`;
}

function firestoreDocUrl(uid) {
  return (
    `https://firestore.googleapis.com/v1/projects/${CONFIG.projectId}` +
    `/databases/(default)/documents/users/${encodeURIComponent(uid)}/events`
  );
}

function str(value) {
  return { stringValue: value ?? '' };
}

function bool(value) {
  return { booleanValue: !!value };
}

function explainAuthError(status, text) {
  if (text.includes('ADMIN_ONLY_OPERATION')) {
    return (
      'Anonymous sign-in is disabled in Firebase. ' +
      'Either enable it (Console → Authentication → Sign-in method → Anonymous → Enable), ' +
      'or set email + password in mia_calender_gextension/config.js and create that user in Firebase Auth.'
    );
  }
  if (text.includes('EMAIL_NOT_FOUND') || text.includes('INVALID_LOGIN_CREDENTIALS')) {
    return (
      'Email/password login failed. Create the user in Firebase Console → Authentication, ' +
      'or fix email/password in config.js.'
    );
  }
  if (text.includes('OPERATION_NOT_ALLOWED')) {
    return (
      'That sign-in method is disabled. Enable Email/Password and/or Anonymous ' +
      'in Firebase Console → Authentication → Sign-in method.'
    );
  }
  return `Auth failed (${status}): ${text}`;
}

async function cacheToken(data) {
  const now = Date.now();
  const expiresInMs = (Number(data.expiresIn) || 3600) * 1000;
  await chrome.storage.local.set({
    idToken: data.idToken,
    tokenExpiry: now + expiresInMs,
  });
  return data.idToken;
}

async function signInWithEmailPassword(email, password) {
  const res = await fetch(authUrl('accounts:signInWithPassword'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(explainAuthError(res.status, text));
  }
  return cacheToken(JSON.parse(text));
}

async function signInAnonymously() {
  const res = await fetch(authUrl('accounts:signUp'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(explainAuthError(res.status, text));
  }
  return cacheToken(JSON.parse(text));
}

/**
 * Firebase Auth → idToken (cached).
 * Prefers email/password from config; otherwise anonymous (must be enabled).
 */
export async function getIdToken({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const stored = await chrome.storage.local.get(['idToken', 'tokenExpiry']);
    const now = Date.now();
    if (
      stored.idToken &&
      stored.tokenExpiry &&
      stored.tokenExpiry > now + 60_000
    ) {
      return stored.idToken;
    }
  } else {
    await chrome.storage.local.remove(['idToken', 'tokenExpiry']);
  }

  const email = (CONFIG.email || '').trim();
  const password = CONFIG.password || '';

  if (email && password) {
    return signInWithEmailPassword(email, password);
  }
  return signInAnonymously();
}

/**
 * Create an event under users/{uid}/events with source=extension.
 * Shape matches Flutter CalEvent.toMap().
 */
export async function createEvent({
  title,
  start,
  end,
  allDay = false,
  location = '',
  description = '',
  pageUrl = '',
  calendarId = 'extension',
  color = '#7C3AED',
  reminderMinutes = '',
}) {
  const uid = CONFIG.uid || 'local-guest';
  let token = await getIdToken();

  const notes = [description, pageUrl ? `From: ${pageUrl}` : '']
    .filter(Boolean)
    .join('\n');

  const body = {
    fields: {
      title: str(title.trim() || 'Untitled'),
      start: str(new Date(start).toISOString()),
      end: str(new Date(end).toISOString()),
      allDay: bool(allDay),
      location: str(location || ''),
      calendarId: str(calendarId || 'extension'),
      color: str(color || '#7C3AED'),
      recurring: bool(false),
      description: str(notes),
      source: str('extension'),
      reminderMinutes: str(reminderMinutes ? String(reminderMinutes) : ''),
      externalId: str(''),
      createdAt: str(new Date().toISOString()),
      updatedAt: str(new Date().toISOString()),
    },
  };

  let res = await fetch(firestoreDocUrl(uid), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    token = await getIdToken({ forceRefresh: true });
    res = await fetch(firestoreDocUrl(uid), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore write failed (${res.status}): ${text}`);
  }
  return res.json();
}

export function defaultTimes() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start, end };
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function toDateValue(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function toTimeValue(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function combineDateTime(dateStr, timeStr, allDay) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (allDay) return new Date(y, m - 1, d, 0, 0, 0, 0);
  const [hh, mm] = (timeStr || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}
