# Phase 6 (later): story zone streaming

Back to the [plan](../PLAY-ZONES-PLAN.md). Status: **later**. Not started until phases 1–5 are done and the owner
asks for it.

## Goal

The two stories load the valley in zones around Mika instead of all at once, using the bounded builders from
phase 2, so phones can play the story comfortably and the phase 1 notice matters less.

## Outline

- Split the map into a grid of zones; keep the current zone and its neighbours built, prefetch toward the direction
  of travel, release zones far behind.
- Far view: the low-detail ring for everything outside the built zones.
- Story systems that assume the whole valley (town life schedules, the train, quests that point across the map,
  the map screen) must work with partly built valleys.
- Measure: time to playable, heap and draw calls in the story on the phone tier.

## Log

- (empty)
