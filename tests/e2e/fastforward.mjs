// Fast-forward the pure quest engine to a step (used by the autopilot's --from=<step>).
import { Quest } from '../../src/game/quest.js';

const NEED = { cog: 'pickup', peach: 'pickup', chestnut: 'pickup', mushroom: 'pickup', honeycomb: 'pickup', sheep: 'count', bells: 'count', beams: 'count', lanterns: 'count', fish: 'catch' };

function eventsFor(q, choice) {
  const s = q.step, d = s.done;
  if (s.id === 'c4.shed') return [{ type: 'talk', who: 'genzo' }, { type: 'choice', id: 'confession', value: choice }];
  if (d.event === 'talk') return [{ type: 'talk', who: d.who }];
  if (d.event) return [{ ...Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'event')), type: d.event }];
  if (d.have) {
    const out = [];
    for (const [k, n] of Object.entries(d.have)) for (let i = q.count(k); i < n; i++) {
      const kind = NEED[k];
      out.push(kind === 'catch' ? { type: 'catch', species: 'trout' } : kind === 'count' ? { type: 'count', item: k } : { type: 'pickup', item: k, id: `${k}${i}` });
    }
    return out;
  }
  if (d.flags) return Object.keys(s.talk).map(who => ({ type: 'talk', who }));
  return [];
}

/** Quest save data positioned at the start of `stepId`. */
export function stateAt(stepId, choice = 'alone') {
  const q = new Quest();
  q.start();
  let guard = 0;
  while (q.state.step !== stepId && guard++ < 300) for (const ev of eventsFor(q, choice)) q.dispatch(ev);
  if (q.state.step !== stepId) throw new Error(`cannot reach ${stepId}`);
  // pickups collected on the way are remembered as flags so they do not respawn
  return q.save();
}

// Where to stand when resuming at a step.
export const RESUME_AT = {
  c1: [-40, 20], c2: [26.5, 30], c3: [85, -74], c4: [-120, 110], e: [-95, 116],
};
