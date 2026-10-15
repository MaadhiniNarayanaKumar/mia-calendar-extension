# Mia Calendar Capture (Chrome MV3)

Standalone Chrome extension that saves calendar events to Firestore as
`source: extension` under `users/{uid}/events`.

Works with the companion Flutter app:
[voice-task-app](https://github.com/MaadhiniNarayanaKumar/voice-task-app).
Extension events and events added in the app show on the same calendar.

Sibling of
[mia-task-extension](https://github.com/MaadhiniNarayanaKumar/mia-task-extension).

## Load in Chrome

1. Copy config and fill Firebase credentials:

```bash
cp config.example.js config.js
```

2. Open `chrome://extensions` → **Developer mode** → **Load unpacked** → select this folder
3. Enable **Anonymous** auth in Firebase (or set email/password in `config.js`) — see below
4. Paste an invite or use **Scrape page** → **Send to Mia**

## Fix: `ADMIN_ONLY_OPERATION`

Anonymous Auth is off in the Firebase project. Do **one** of these:

### Option A — enable Anonymous

1. [Firebase Console](https://console.firebase.google.com/) → your project
2. **Authentication** → **Sign-in method** → enable **Anonymous**
3. Reload the extension → try **Send to Mia** again

### Option B — email / password user

1. Enable **Email/Password** auth and add a user
2. Put credentials in `config.js`:

```js
email: 'mia-extension@example.com',
password: 'your-password',
uid: 'local-guest', // keep in sync with the Flutter guest uid
```

3. Reload the extension

## Paste invite (recommended)

1. Copy a Google Calendar event block (title + day/time + Zoom link)
2. Open the extension → paste into **Paste invite**
3. Tap **Parse invite** (or paste — it auto-parses)
4. Check fields → **Send to Mia**

**Scrape page** reads the active tab and runs the same parser. It requires a real date **and** time, and skips page-title junk (e.g. university calendar week headers).

## In the app

After **Send to Mia**, the event is on the calendar (Home → Calendar, or Quick actions → Calendar).

- There are no Work / Personal / Extension filters. Extension and manual events are listed together.
- The schedule uses today’s date. Week view shows upcoming events this week, or a single **No events** line.
- Agenda, day, and week use the week strip. Month uses the month grid. Only one of those is on screen.
- When the event has ended, it leaves the list. The app asks **Did you attend this event?** and saves `attended` on the same document.

## Notes

- Writes go to `users/{uid}/events` (default `local-guest`) so they match the app
- `config.js` is gitignored — only `config.example.js` is committed
- After changing auth or code, click **Reload** on the extension
