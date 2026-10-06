/**
 * Parse Google Calendar–style invite text into event fields.
 *
 * @param {string} raw
 * @param {{ requireWhen?: boolean, pageTitle?: string }} [opts]
 */
export function parseInviteText(raw, opts = {}) {
  const requireWhen = !!opts.requireWhen;
  const pageTitle = (opts.pageTitle || '').trim();
  const text = (raw || '').trim();
  if (!text) return null;

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  let title = '';
  let start = null;
  let end = null;
  let location = '';
  const notes = [];
  const guessed = new Set();

  const whenRe =
    /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:[,.\s⋅·•]*)?(?:(\d{1,2}):(\d{2})\s*(am|pm)?\s*[–—\-]\s*(\d{1,2}):(\d{2})\s*(am|pm)?)?/i;
  const meetUrlRe =
    /https?:\/\/[^\s]*(zoom\.us|meet\.google\.com|teams\.microsoft\.com|webex\.com)[^\s]*/i;
  const anyUrlRe = /https?:\/\/[^\s]+/i;
  const roomRe = /^(room|rm\.?|bldg\.?|building|suite|floor)\b[\s.:].+/i;
  const addressRe = /^\d{1,5}\s+[A-Za-z0-9].+(?:,|\s)[A-Z]{2}\b/;

  for (const line of lines) {
    if (isJunkLine(line)) continue;

    const when = line.match(whenRe);
    if (when && !start) {
      const parsed = parseWhenMatch(when);
      // Scrape mode needs a real clock time, not date-only page chrome.
      if (requireWhen && !parsed.hasTime) continue;
      start = parsed.start;
      end = parsed.end;
      guessed.add('start');
      guessed.add('end');
      continue;
    }

    const meet = line.match(meetUrlRe);
    if (meet) {
      if (!location) {
        location = meet[0];
        guessed.add('location');
      }
      continue;
    }

    if (roomRe.test(line) || addressRe.test(line)) {
      if (!location) {
        location = line;
        guessed.add('location');
      } else {
        notes.push(line);
      }
      continue;
    }

    const url = line.match(anyUrlRe);
    if (url) {
      if (!location) {
        location = url[0];
        guessed.add('location');
      }
      continue;
    }

    if (/^(created by|organizer)\s*:/i.test(line)) {
      notes.push(line);
      continue;
    }

    if (!title) {
      if (isJunkTitle(line, pageTitle)) continue;
      title = line;
      guessed.add('title');
      continue;
    }

    if (!isJunkTitle(line, pageTitle)) notes.push(line);
  }

  if (!title || isJunkTitle(title, pageTitle)) {
    if (requireWhen) return null;
    title = 'New event';
    guessed.add('title');
  }

  if (!start) {
    if (requireWhen) return null;
    start = defaultStart();
    end = new Date(start.getTime() + 60 * 60 * 1000);
    guessed.add('start');
    guessed.add('end');
  }
  if (!end || end <= start) {
    end = new Date(start.getTime() + 60 * 60 * 1000);
    guessed.add('end');
  }

  return {
    title,
    start,
    end,
    location,
    notes: notes.join('\n'),
    allDay: false,
    guessed: [...guessed],
  };
}

export function isJunkTitle(title, pageTitle = '') {
  const t = (title || '').trim();
  if (!t) return true;
  if (pageTitle && t.toLowerCase() === pageTitle.toLowerCase()) return true;
  if (/calendar\s*[-–—]\s*week of/i.test(t)) return true;
  if (/university\s*[-–—]\s*calendar/i.test(t)) return true;
  if (/^google calendar$/i.test(t)) return true;
  if (
    /week of\s+(january|february|march|april|may|june|july|august|september|october|november|december)/i.test(
      t,
    )
  ) {
    return true;
  }
  return false;
}

function isJunkLine(line) {
  if (/^\d+\s+guests?/i.test(line)) return true;
  if (/^\d+\s+(yes|awaiting|no|maybe)\b/i.test(line)) return true;
  if (/minutes?\s+before/i.test(line)) return true;
  if (/^(notification|reminder)\b/i.test(line)) return true;
  if (/^\d+\s*(min|mins|minutes|hour|hours|hr|hrs)\b/i.test(line)) return true;
  return false;
}

function defaultStart() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  return start;
}

function parseWhenMatch(m) {
  const monthName = m[2];
  const day = Number(m[3]);
  const month = monthIndex(monthName);
  const now = new Date();
  let year = now.getFullYear();

  const hasTime = !!m[4];
  let hour = 9;
  let minute = 0;
  if (hasTime) {
    hour = Number(m[4]);
    minute = Number(m[5]);
    const startAp = (m[6] || '').toLowerCase();
    const endAp = (m[9] || '').toLowerCase();
    hour = applyAmPm(hour, startAp || endAp);
  }

  let start = new Date(year, month - 1, day, hour, minute, 0, 0);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (start < todayStart) {
    start = new Date(year + 1, month - 1, day, hour, minute, 0, 0);
  }

  let end;
  if (m[7]) {
    let eh = Number(m[7]);
    const em = Number(m[8]);
    const endAp = (m[9] || '').toLowerCase();
    const startAp = (m[6] || '').toLowerCase();
    eh = applyAmPm(eh, endAp || startAp);
    end = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
      eh,
      em,
      0,
      0,
    );
    if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  } else {
    end = new Date(start.getTime() + 60 * 60 * 1000);
  }

  return { start, end, hasTime };
}

function applyAmPm(hour, ap) {
  if (ap === 'pm' && hour < 12) return hour + 12;
  if (ap === 'am' && hour === 12) return 0;
  return hour;
}

function monthIndex(name) {
  const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];
  const i = months.indexOf(String(name).toLowerCase());
  return i >= 0 ? i + 1 : 1;
}
