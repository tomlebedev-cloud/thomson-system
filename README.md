# THOMSON SYSTEM

A habit system built on the ideas in *Atomic Habits* by James Clear. It's a static website (HTML, CSS and vanilla JS) with no build step, and all data is stored in the browser's `localStorage`.

## Features

- **Today**: check off today's habits, track your progress ring and streaks, and get a "never miss twice" warning. *Skip* a rest or sick day without breaking the streak. The list refreshes itself when a new day starts, even if the app was left open.
- **Habits**: design every habit through the Four Laws of Behavior Change:
  - *Build*: obvious (implementation intention and habit stacking), attractive (temptation bundling), easy (Two-Minute Rule), satisfying (immediate reward)
  - *Break*: invisible, unattractive, difficult, unsatisfying (the inversion of each law)
- **Habits** can be reordered (↑ ↓) and archived. Archived habits leave Today and the Tracker but keep their identity votes, and can be restored.
- **Tracker**: a 35-day "don't break the chain" grid with completion rates. Click a cell to cycle done → skipped → empty.
- **Progress**: a weekly review with this week vs. last week, current and best streaks, 7/30-day and all-time rates, and a 12-week trend for each habit.
- **Identity**: every completion counts as a vote for the person you want to become.
- **Scorecard**: the Habits Scorecard, where you rate each daily action as `+`, `=` or `−`.
- **The System**: a reference for the Four Laws, plus JSON export, import and reset. The app asks the browser to keep its storage, reminds you to back up every 14 days, and checks imported files before replacing anything.
- Light and dark theme, and it works on mobile.
- **Installable app (PWA)**: add it to your phone's home screen and use it offline. On Android or Chrome, tap **Install app**. On iPhone, use Safari → Share → *Add to Home Screen*.

When you change cached files, bump `CACHE` in `sw.js` (e.g. `thomson-v2`) so old caches are cleared.

## Run locally

```bash
npx http-server -p 5173
# or, without Node:
python -m http.server 5174
```

Or simply open `index.html` in a browser.

## Deploy

Push to GitHub, then turn on **Settings → Pages → Deploy from branch → `main` / root**.
