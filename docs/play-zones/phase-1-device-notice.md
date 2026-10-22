# Phase 1: device notice and light mode for the stories

Back to the [plan](../PLAY-ZONES-PLAN.md). Status: **todo**.

## Goal

On a weak device, before a story starts, show a friendly card that explains the story shows the whole valley and may
run slowly and warm the phone, and offers a real fix. Never block the player.

## Design

- **When:** New Game or Continue on either story, on a device judged weak: the Low tier together with little memory
  (`navigator.deviceMemory` ≤ 3), few cores (≤ 4), or frames already measured slow (the sampler in
  `src/engine/focus.js` / the governor). Decided by power, not by "is it a phone": a strong tablet is not warned.
- **Card (dialog, not a toast):** "The story shows the whole valley. On this device it may run slowly and warm up the
  phone. Light mode helps." Three buttons:
  1. **Play in light mode** — Low tier, People: Light, round-light profile on; remembered.
  2. **Play mini games instead** — opens the title's Mini games list.
  3. **Continue** — starts the story as chosen.
- **Frequency:** once per device (`localStorage`); a line in Settings ("About the story on this device") shows it
  again. Not shown in QA runs unless `?devicenote=1`.
- No temperature claims: a web page cannot read it, so the card names the risk and suggests breaks.
- Touch targets ≥ 44 px, text ≥ 11 px, fits 390x844 and 844x390; vi/ko/ja translations.

## Tasks

| # | Task | Files (expected) | Status | Commit |
|---|---|---|---|---|
| 1.1 | Pure rule `weakForStory({ tier, memory, cores, slow })` + Node tests | `src/engine/device-note.js`, `tests/device-note.test.mjs` | todo | |
| 1.2 | The card UI (shared dialog style), the three actions, remembered choice | `src/ui/device-note.js`, `src/ui/ui.js` (title flow) | todo | |
| 1.3 | Light mode switch: Low tier + People: Light + round-light, saved like other settings | `src/ui/ui.js`, `src/engine/people.js` | todo | |
| 1.4 | Settings line to show the card again | `src/ui/ui.js` | todo | |
| 1.5 | Translations vi/ko/ja | `src/i18n/*.json` | todo | |
| 1.6 | Browser check: weak phone sees the card once, each button does what it says; strong desktop never sees it | `tests/device-note-browser.mjs` | todo | |
| 1.7 | Production build, suites, push, live check | — | todo | |

## Acceptance

- [ ] A weak phone sees the card before a story, exactly once; a strong desktop never.
- [ ] "Light mode" really switches tier, people and profile, and the story then measures lighter (record numbers).
- [ ] "Mini games instead" lands on the list; "Continue" starts the story unchanged.
- [ ] Layout audit passes on the three viewports; translations complete.
- [ ] `npm test` and the standard browser suites pass on the production build.

## Log

- (empty)
