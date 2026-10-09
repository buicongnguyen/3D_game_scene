// Fast-forward the pure quest engine to a step: the autopilot's --from=<step> and the game's Explore mode (a valley
// where the whole story has already happened) both start from here.
import { Quest } from './quest.js';

const NEED = { cog: 'pickup', peach: 'pickup', chestnut: 'pickup', mushroom: 'pickup', honeycomb: 'pickup', sheep: 'count', bells: 'count', beams: 'count', lanterns: 'count', fish: 'catch' };

function eventsFor(q, choice) {
  const s = q.step, d = s.done;
  // only the Classic story asks how Genzo should confess
  if (s.id === 'c4.shed' && q.state.story === 'classic') return [{ type: 'talk', who: 'genzo' }, { type: 'choice', id: 'confession', value: choice }];
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
export function stateAt(stepId, choice = 'alone', story) {
  const q = new Quest(null, story ? { story } : undefined);
  q.start();
  let guard = 0;
  while (q.state.step !== stepId && guard++ < 300) for (const ev of eventsFor(q, choice)) q.dispatch(ev);
  if (q.state.step !== stepId) throw new Error(`cannot reach ${stepId}`);
  // pickups collected on the way are remembered as flags so they do not respawn
  return q.save();
}

/** Explore mode: the valley after the story, every lamp lit and every way open, nothing asked of Mika. */
export function exploreState() {
  const st = stateAt('e.done', 'together', 'grandma');   // the valley of the default story: Grandma at home
  st.flags = { ...st.flags, huntAsked: true, explore: true };
  return st;
}
