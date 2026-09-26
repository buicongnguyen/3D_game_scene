// Quest engine: pure state machine over STEPS. dispatch(event) mutates state and returns the ordered
// effects the director must present (dialogue, cutscenes, toasts, world changes). State effects
// (give/take/flag/lamp/journal/unlock/season/time/chapter) are applied here so state is always consistent.

import { STEPS, STEP_INDEX, DIALOGUE, CHATTER } from './story.js';

export const SAVE_VERSION = 1;

export function freshState() {
  return {
    v: SAVE_VERSION, step: STEPS[0].id, chapter: 0, season: 'spring', hour: 17.2,
    inv: {}, flags: {}, unlocked: {}, lamps: {}, pages: [], stars: [], fishLog: {}, friends: {}, keepsakes: [], treasures: {}, letters: [],
    choice: null, pos: null, playtime: 0, chatter: {}, started: false,
  };
}

/** Upgrade older saves; returns a valid state or a fresh one. */
export function migrate(saved) {
  if (!saved || typeof saved !== 'object') return freshState();
  const s = { ...freshState(), ...saved };
  if (!(s.step in STEP_INDEX)) return freshState();
  // The Star Train ride is one uninterrupted scene: a save taken during it resumes at boarding.
  if (s.step === 'c4.ride') { s.step = 'c4.board'; s.inv = { ...s.inv, lanterns: 0 }; }
  s.v = SAVE_VERSION;
  return s;
}

function matches(done, ev) {
  if (!done.event || done.event !== ev.type) return false;
  for (const k of Object.keys(done)) {
    if (k === 'event') continue;
    if (done[k] !== ev[k]) return false;
  }
  return true;
}

export class Quest {
  constructor(saved) {
    this.state = saved ? migrate(saved) : freshState();
  }

  get step() { return STEPS[STEP_INDEX[this.state.step]]; }
  count(item) { return this.state.inv[item] || 0; }
  has(flag) { return !!this.state.flags[flag]; }
  unlocked(what) { return !!this.state.unlocked[what]; }

  /** Objective text with live counters. */
  /** Current objective with its counters filled in; translate() localises the template first. */
  objective(translate = s => s) {
    const st = this.state;
    return translate(this.step.objective).replace(/\{(\w+)\}/g, (_, k) => (k === 'stars' ? st.stars.length : k === 'act' ? 'E' : this.count(k)));
  }

  /** Effects of entering the current step (call once for a new game or after loading a save). */
  start() {
    this.resumed = !!this.state.started;
    if (this.state.started) return this.resumeEffects();
    this.state.started = true;
    return this.enter(this.step);
  }

  /** On load: re-apply world state without replaying dialogue. */
  resumeEffects() {
    const st = this.state;
    const out = [{ season: st.season, silent: true }, { time: st.hour }];
    // spawns first: some spawns reset world pieces that a later unlock then opens (repair -> viaduct)
    for (const s of this.spawnsSoFar()) out.push({ spawn: s, silent: true });
    for (const k of Object.keys(st.unlocked)) out.push({ unlock: k, silent: true });
    for (const k of Object.keys(st.lamps)) if (st.lamps[k]) out.push({ lamp: k, silent: true });
    return out;
  }

  spawnsSoFar() {
    const idx = STEP_INDEX[this.state.step];
    const out = [];
    for (let i = 0; i < idx; i++) for (const e of STEPS[i].exit || []) if (e.spawn) out.push(e.spawn);
    for (const e of this.step.enter || []) if (e.spawn) out.push(e.spawn);
    return out;
  }

  enter(step) {
    const out = [{ objective: true }];
    for (const e of step.enter || []) out.push(...this.apply(e));
    out.push({ objective: true });
    // a step may already be satisfied (e.g. items collected early)
    out.push(...this.checkComplete(null));
    return out;
  }

  apply(e) {
    const st = this.state;
    if (e.give) { const [k, n] = e.give; st.inv[k] = (st.inv[k] || 0) + n; }
    if (e.take) { const [k, n] = e.take; st.inv[k] = Math.max(0, (st.inv[k] || 0) - n); }
    if (e.flag) st.flags[e.flag] = true;
    if (e.lamp) st.lamps[e.lamp] = true;
    if (e.journal !== undefined && !st.pages.includes(e.journal)) st.pages.push(e.journal);
    if (e.unlock) st.unlocked[e.unlock] = true;
    if (e.season) st.season = e.season;
    if (e.time !== undefined) st.hour = e.time;
    if (e.timelapse !== undefined) st.hour = e.timelapse;
    if (e.chapter !== undefined) st.chapter = e.chapter;
    if (e.sayChoice) return [{ say: `${e.sayChoice}_${st.choice || 'alone'}` }];
    return [e];
  }

  checkComplete(ev) {
    const step = this.step;
    const d = step.done;
    let ok = false;
    if (d.never) ok = false;
    else if (d.have) ok = Object.entries(d.have).every(([k, n]) => this.count(k) >= n);
    else if (d.flags) ok = d.flags.every(f => this.has(f));
    else if (ev) ok = matches(d, ev);
    if (!ok) return [];
    const out = [];
    for (const e of step.exit || []) out.push(...this.apply(e));
    const i = STEP_INDEX[step.id];
    if (i + 1 >= STEPS.length) return out;
    this.state.step = STEPS[i + 1].id;
    out.push({ stepDone: step.id });
    out.push(...this.enter(STEPS[i + 1]));
    return out;
  }

  /** What an NPC says right now: {say} for story talk, or a chatter line. */
  talkFor(who) {
    const t = this.step.talk?.[who];
    if (t) return typeof t === 'string' ? { say: t } : t;
    const lines = CHATTER[who] || CHATTER.villager;
    const k = (this.state.chatter[who] = ((this.state.chatter[who] ?? -1) + 1));
    const idx = Math.min(lines.length - 1, this.state.chapter) === lines.length - 1 ? k % lines.length : (this.state.chapter + k) % lines.length;
    return { line: [who in CHATTER ? who : 'villager', lines[idx][0]] };
  }

  /** Main entry: returns effects to present. */
  dispatch(ev) {
    const st = this.state;
    const out = [];
    switch (ev.type) {
      case 'talk': {
        const t = this.talkFor(ev.who);
        if (t.say) out.push({ say: t.say });
        else out.push({ line: t.line });
        if (t.flag) st.flags[t.flag] = true;
        break;
      }
      case 'pickup':
        if (ev.item === 'star') {
          if (!st.stars.includes(ev.id)) { st.stars.push(ev.id); out.push({ star: ev.id, count: st.stars.length }); }
          if (st.stars.length === 12 && !st.flags.allStars) { st.flags.allStars = true; out.push({ allStars: true }); }
        } else {
          st.inv[ev.item] = (st.inv[ev.item] || 0) + (ev.n || 1);
          out.push({ got: ev.item, n: ev.n || 1, total: st.inv[ev.item] });
        }
        break;
      case 'catch':
        st.fishLog[ev.species] = (st.fishLog[ev.species] || 0) + 1;
        if (this.step.id === 'c1.fish') st.inv.fish = (st.inv.fish || 0) + 1;
        out.push({ caught: ev.species, total: st.inv.fish || 0 });
        break;
      case 'count':
        st.inv[ev.item] = (st.inv[ev.item] || 0) + (ev.n || 1);
        out.push({ got: ev.item, n: ev.n || 1, total: st.inv[ev.item], silent: ev.silent });
        break;
      case 'choice':
        st.choice = ev.value;
        out.push({ say: `c4_choice_${ev.value}` });
        break;
      default:
        break;
    }
    out.push(...this.checkComplete(ev));
    return out;
  }

  /** Serializable snapshot. */
  save(extra = {}) { return JSON.parse(JSON.stringify({ ...this.state, ...extra })); }
}

/** Check that every dialogue referenced by the story exists (used by tests). */
export function missingDialogue() {
  const missing = [];
  const need = id => { if (!DIALOGUE[id]) missing.push(id); };
  for (const s of STEPS) {
    for (const list of [s.enter || [], s.exit || []]) for (const e of list) {
      if (e.say) need(e.say);
      if (e.sayChoice) { need(`${e.sayChoice}_alone`); need(`${e.sayChoice}_together`); }
    }
    for (const t of Object.values(s.talk || {})) need(typeof t === 'string' ? t : t.say);
  }
  need('c4_choice_alone'); need('c4_choice_together');
  return missing;
}
