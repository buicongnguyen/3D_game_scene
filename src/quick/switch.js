// Quick start: the title menu comes up before the valley exists, and the mini games that need no valley are played by
// a small runtime of their own (./runtime.js). Everything else (the story, Explore, the other games, the scene tour)
// loads the valley when it is first asked for. This file only answers "which way does this page boot?".
//   ?quick=off   the old order: load the whole valley, then show the title over it (to compare the two paths)
//   ?quick=on    quick start even in a QA run
// A QA run (?qa=1, ?tourtest=1) keeps the old order unless it asks: the browser suites that start from the title were
// written against a loaded valley. ?start=… and ?view=… go straight into the valley, so they load it first as well.
export function quickStartWanted(params) {
  const q = params.get('quick');
  if (q === 'off' || q === '0') return false;
  if (params.has('view') || params.has('start')) return false;
  if (params.has('qa') || params.has('tourtest')) return q === 'on' || q === '1';
  return true;
}
