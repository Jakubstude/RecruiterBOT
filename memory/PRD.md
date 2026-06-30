# RecruiterBOT — PRD

## Original problem statement
Build/refactor a Manifest V3 Chrome Extension called RecruiterBOT for automated
LinkedIn sourcing. Deliverables: Gemini 2.5-flash X-Ray generation, candidate
scoring (>50% goes to queue), LinkedIn automation (scroll, expand skills,
skip Pending, open Connect dialog, inject message, send, verify dialog closed).
All critical functions return { ok, state, reason }. Shadow-DOM recursive
helper. Human-like delays (2000-5000ms). Fail-safe queue.

## User choices (gathered via ask_human)
- API key: user provides own Gemini key via Options page
- Invitation template: customisable via Options page (supports {name})
- Scoring: Gemini AI semantic scoring (per-candidate call)
- Daily limit: configurable (default 50)
- Architecture: free restructure → done

## Architecture
```
/app/RecruiterBOT/
├── manifest.json          (MV3, v3.0.0)
├── background.js          (service worker; opens Options on install)
├── popup.html / popup.js  (controller UI)
├── options.html / options.js  (API key, template, daily cap)
├── prompts.js             (Gemini prompts)
├── shared/
│   ├── debug.js           (namespaced logger)
│   ├── state.js           ({ok,state,reason} builder)
│   ├── dom.js             (Shadow-DOM recursion + humanDelay 2-5s)
│   ├── storage.js         (promisified storage + daily counter)
│   └── gemini.js          (Gemini 2.5-flash client)
└── content/
    ├── bootstrap.js
    ├── scoring.js
    ├── google.js          (SERP → score → queue)
    ├── linkedin-search.js (People search import)
    ├── linkedin-profile-extract.js
    └── linkedin-profile.js (automation + finalAction)
```

## What's implemented (2026-01)
- [x] MV3 manifest with storage + tabs perms, content scripts on Google & LinkedIn
- [x] Options page: Gemini API key (password input), model select, invitation
      template (300 chars, {name} placeholder), daily limit, today's counter
- [x] Popup: JD input, Boolean generator, Google & LinkedIn search launchers,
      queue renderer, Start/Stop outreach, daily counter line
- [x] shared/dom.js: recursive deepQuery/deepQueryAll walking every shadowRoot;
      waitForElement; humanDelay default 2000-5000ms
- [x] shared/state.js: RBState.ok() / RBState.fail() producing {ok,state,reason}
- [x] shared/storage.js: getSettings/saveSettings, getDailyCounter,
      incrementDailyCounter, hasHitDailyLimit (midnight reset)
- [x] content/google.js: extract blocks, score via Gemini, save all_scored_candidates
      + kandidati queue (>50%)
- [x] content/linkedin-profile.js:
        smoothScrollProfile(), openAndCloseSkillsSection(),
        hasPendingInvitationState() (header-scoped, ignores side widgets),
        openConnectDialog() → {ok,state,reason,dialog} (direct + More menu),
        finalAction(dialog, message) → scoped to dialog, add-note expansion,
          message injection, send-button enabled check, click, dialog-closed
          verification with 8s timeout,
        queue runner with daily-limit gate + fail-safe proceed-to-next +
          dialog cleanup on every failure path
- [x] content/bootstrap.js top-level crash handler advances queue index even on
      exception so the automation never gets stuck
- [x] ZIP built at /app/RecruiterBOT.zip (unpacked-installable)

## Not implemented / out of scope
- No backend / server side (Chrome Extension only)
- Testing subagent cannot run: the extension requires Chrome + logged-in
  LinkedIn session to exercise automation. Lint + JSON validated.

## Next / backlog
- P1: options.html unit test page to dry-run finalAction on a mock dialog
- P2: per-profile retry policy with exponential backoff before moving on
- P2: CSV export of all_scored_candidates
- P2: LinkedIn InMail path as fallback when Connect is unavailable

## Update 2026-01 (1-click sourcing)
- Popup primary action is **🚀 Find candidates (1-click)**: generates Boolean → opens Google → triggers auto-scoring on the SERP without any manual click.
- New storage flag `auto_score_pending` consumed by `content/google.js → maybeAutoScore()` and reset immediately to avoid double runs on tab refresh.
- Popup polls storage every 2 s while scoring is in progress and refreshes the queue panel automatically.
- "Boolean only" + "LinkedIn search" remain as manual fallbacks.
- "Score & Queue" floating button stays on Google SERP as manual override.

## Dry-run page (P1)
- `test/dryrun.html` + `test/dryrun.js`: 7 scenario tests for `finalAction(dialog, message)` running against in-memory fake dialogs. Patches `humanDelay` to ~50 ms during tests. Auto-runs on load. Accessible from popup via 🧪 Dry Run button.
