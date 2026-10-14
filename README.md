# THOMSON SYSTEM

A habit system built on the ideas in *Atomic Habits* by James Clear. It's a static website (HTML, CSS and vanilla JS) with no build step, and all data is stored in the browser's `localStorage`.

## Features

- **Today**: check off today's habits, track your progress ring and streaks, and get a "never miss twice" warning.
- **Habits**: design every habit through the Four Laws of Behavior Change:
  - *Build*: obvious (implementation intention and habit stacking), attractive (temptation bundling), easy (Two-Minute Rule), satisfying (immediate reward)
  - *Break*: invisible, unattractive, difficult, unsatisfying (the inversion of each law)
- **Tracker**: a 35-day "don't break the chain" grid with completion rates.
- **Identity**: every completion counts as a vote for the person you want to become.
- **Scorecard**: the Habits Scorecard, where you rate each daily action as `+`, `=` or `−`.
- **The System**: a reference for the Four Laws, plus JSON export, import and reset.
- Light and dark theme, and it works on mobile.

## Run locally

```bash
npx http-server -p 5173
```

Or simply open `index.html` in a browser.

## Deploy

Push to GitHub, then turn on **Settings → Pages → Deploy from branch → `main` / root**.
