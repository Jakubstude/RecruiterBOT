# 🚀 RecruiterBOT v3.0

AI-powered LinkedIn sourcing Chrome Extension (Manifest V3).

## Features
- **Gemini 2.5-flash X-Ray**: generate a Google Boolean from a Job Description.
- **Gemini scoring (0–100%)**: extracts LinkedIn profiles from Google/LinkedIn search results; candidates scoring `>50%` are saved to the outreach queue in `chrome.storage.local`.
- **Robust LinkedIn automation**: navigates each profile in the queue, expands "Skills", scrolls human-like (2–5 s delays), detects `Pending/Invitation Sent`, opens the **Connect** dialog (direct button or **More → Connect**), injects a personalised message, verifies the **Send** button is enabled, clicks it, and verifies the dialog has closed.
- **Shadow DOM aware**: recursive `deepQuery` / `deepQueryAll` traversal for `#interop-outlet` + any shadow root.
- **State management**: every critical function returns `{ ok, state, reason }`. Queue logs the reason and moves on — nothing gets stuck.
- **Daily safety cap**: configurable in Options (default 50/day, resets at midnight).

## Install (unpacked)
1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. The Options page opens automatically on install — paste your **Gemini API key** (https://aistudio.google.com/app/apikey), tune the invitation template and daily limit, click **Save**.

## Usage
1. Open the popup, paste a Job Description, click **🧠 Generate Boolean**.
2. Click **🔎 Search on Google** (or **🔍 Search on LinkedIn**).
3. On the results page, click the floating **🤖 Score & Queue** button. Gemini scores each candidate and auto-selects those `>50%`.
4. Back in the popup, edit the invitation template (use `{name}` for the first name).
5. Click **🔥 START OUTREACH**. RecruiterBOT opens each profile sequentially, runs `finalAction(dialog)`, and moves to the next regardless of per-profile outcomes.

## Architecture
```
manifest.json              — MV3 manifest
background.js              — service worker (first-install setup)
popup.html / popup.js      — controller UI
options.html / options.js  — API key, template, daily limit
prompts.js                 — Gemini prompt templates
shared/
  debug.js                 — namespaced logger
  state.js                 — {ok, state, reason} builder
  dom.js                   — Shadow-DOM-aware helpers, delays, URL utils
  storage.js               — promise wrappers, settings, daily counter
  gemini.js                — Gemini 2.5-flash client (reads key from storage)
content/
  bootstrap.js             — page router (Google | LinkedIn search | profile)
  scoring.js               — Gemini scoring runner
  google.js                — Google SERP scoring & queue write
  linkedin-search.js       — LinkedIn People search import & score
  linkedin-profile-extract — passive profile data capture
  linkedin-profile.js      — human-like automation + finalAction(dialog)
```

## Key contract: `finalAction(dialog)`
```js
const result = await finalAction(dialog, personalisedMessage);
// result: { ok: boolean, state: string, reason: string }
```
Possible states: `sent`, `no_message_field`, `message_injection_failed`,
`no_send_button`, `send_disabled`, `send_click_failed`, `dialog_still_open`,
`no_dialog`.

## Key contract: `openConnectDialog()`
States: `dialog_open`, `no_connect_entry`, `more_click_failed`,
`no_connect_in_menu`, `connect_click_failed`, `no_dialog`.

## Safety
- **Daily cap** is enforced in `shared/storage.js` (`hasHitDailyLimit`) and blocks the queue runner.
- **Fail-safe queue**: every outcome (ok/fail) is logged to `last_action_reason` + `last_action_state`, dialogs are force-closed, and the runner moves on. Crashes in any flow bubble up to `content/bootstrap.js` which still advances the queue index.
