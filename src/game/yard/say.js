// What the kids call out at the yards (English source strings, translated with tx() when shown) and the yard's page styles.
import { N_ } from '../../i18n/i18n.js';

export const SAY = {
  invite: [N_('Mika! Come and play!'), N_('We need one more! Mika!')],
  join: [N_("Mika's playing! Mika's playing!"), N_('City girl on the court!')],
  nice: [N_('Whoa, nice one!'), N_('Did you see that?'), N_('Good kick, Mika!')],
  ours: [N_('Yes! Our point!'), N_('That one was ours!')],
  aww: [N_('Aww!'), N_('Hey! No fair!')],
  theirs: [N_('Got you!'), N_('Too slow!'), N_('Point for us!')],
  net: [N_('The net moved!'), N_('Oops. Into the net.')],
  out: [N_('That was in! …It was out.'), N_('Out! Way out!')],
  strong: [N_("That's my power kick!"), N_('Captain scores!')],
  tricky: [N_("Didn't see that coming, did you?"), N_('Over there! No, there!')],
  wobbly: [N_('Oops. That was the wind.'), N_('I meant to do that!')],
  captain: [N_('Spike! Nobody stops the captain!'), N_('Smash! Hiro does it again!')],
  never: [N_('Nothing gets past me.'), N_('Got it. Always got it.')],
  dreamy: [N_('Oh! Was that the ball?'), N_('Sorry, I was watching a cloud.')],
  drop: [N_('Dropped it!'), N_('Again! From one!')],
  count: [N_('Ten! Keep going!'), N_('Twenty! Nobody breathe!'), N_("Thirty! That's a record!")],
  win: [N_('You beat us! Again tomorrow?'), N_('Mika wins! She kicks like a Kawabe kid!')],
  lose: [N_('We win! Rematch any time, city girl.'), N_('Kawabe wins! You were close, though.')],
  watch: [N_('Go on! Go on!'), N_("I'm next!"), N_('Point!')],
  own: [N_('Mine!'), N_('Over the net!'), N_('Got it!'), N_('Point!'), N_('Keep it up!')],
  footnet: [N_("Foot-tennis! I'll take this side!")],
  keepup: [N_('Keep it up! Everybody in a ring!')],
  volley: [N_('Volleyball! Bump, set, spike!')],
  set: [N_('Set!'), N_('Here you go!'), N_('Nice set!')],
  spike: [N_('Spike!'), N_('Smash!')],
  rope: [N_('Rope! Jump in, Mika!')],
  tripped: [N_('Oops! Again!'), N_('Tangled! Start again!')],
  tug: [N_('Tug of war! Grab the rope!')],
  heave: [N_('Heave!'), N_('Ho!'), N_('Pull!')],
  tugWin: [N_('We pulled them over!'), N_('Good pull, Mika!')],
  tugLose: [N_('We got pulled over! Again!'), N_('They are strong! Next time!')],
  sack: [N_('Sack race! On your marks!')],
  fell: [N_('Whoa!'), N_('Ha ha, I fell over!'), N_('I meant to do that!')],
  sackWin: [N_('First across the green!'), N_('Mika is quick in a sack!')],
  marbles: [N_('Marbles! Mind the ring!')],
  flick: [N_('Nice flick!'), N_('Mine now!')],
  soft: [N_('Too soft!'), N_('Not even close!')],
  oanquan: [N_('Ô ăn quan! Your turn first!')],
  take: [N_('I take them!'), N_('Mine! Mine!'), N_('Ô ăn quan!')],
  careful: [N_('Careful, careful...'), N_('Let me think.')],
};

export const CSS = `
#yardHud{position:fixed;left:50%;top:calc(14px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:16;display:flex;gap:10px;align-items:center;white-space:nowrap;
 padding:7px 16px;border-radius:999px;background:rgba(255,247,232,.94);box-shadow:0 6px 20px rgba(40,20,0,.25);font:700 16px Nunito,system-ui,sans-serif;color:#5a3a22;zoom:var(--ui-scale,1)}
#yardHud .big{font:600 22px Fredoka,Nunito,sans-serif;color:#c2541c;min-width:56px;text-align:center}
#yardHud .sub{font:700 13px Nunito,sans-serif;color:#8a6a4a}
#yardHud .pips{display:inline-flex;gap:3px;vertical-align:-1px}
#yardHud .pips i{width:7px;height:13px;border-radius:2px;background:#e6d6b8;box-shadow:inset 0 0 0 1px #c9b48e}
#yardHud .pips i.on{background:#e2703a;box-shadow:none}
#yardHud .l,#yardHud .r{max-width:28vw;overflow:hidden;text-overflow:ellipsis}
#yardHud.hidden,#yardHint.hidden,#yardCard.hidden,#yardStop.hidden,#yardCam.hidden,#yardPad.hidden{display:none}
#yardHint{position:fixed;left:50%;top:calc(66px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:16;max-width:min(520px,90vw);
 padding:8px 15px;border-radius:16px;background:rgba(255,253,246,.94);box-shadow:0 6px 18px rgba(40,20,0,.22);font:700 15px Nunito,system-ui,sans-serif;color:#4a3020;
 text-align:center;zoom:var(--ui-scale,1);pointer-events:none}
#yardHint.good{background:rgba(220,255,214,.96);color:#1f6a34}
#yardHint.bad{background:rgba(255,232,214,.96);color:#a2441c}
#yardStop,#yardCam{position:fixed;left:14px;z-index:17;min-height:44px;padding:8px 16px;border:0;border-radius:999px;cursor:pointer;
 background:rgba(255,253,246,.92);color:#4a3020;font:700 14px Nunito,system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);zoom:var(--ui-scale,1)}
#yardStop{top:calc(64px + env(safe-area-inset-top,0px))}
#yardCam{top:calc(116px + env(safe-area-inset-top,0px))}
#yardStop kbd{font:700 11px Nunito,sans-serif;padding:1px 5px;border-radius:5px;background:#0002;margin-left:6px}
body.touch #yardStop kbd{display:none}
#yardPad{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:17;display:flex;gap:12px;zoom:var(--ui-scale,1)}
#yardPad button{min-width:64px;min-height:56px;padding:8px 18px;border:0;border-radius:18px;background:rgba(255,253,246,.95);color:#4a3020;
 font:700 22px Fredoka,Nunito,sans-serif;box-shadow:0 5px 16px rgba(0,0,0,.3);touch-action:none;user-select:none;-webkit-user-select:none}
#yardPad button.big{min-width:150px;background:#f08a3c;color:#fff;font-size:20px}
#yardPad button:active,#yardPad button.down{filter:brightness(.9);transform:scale(.97)}
@media (max-width:560px){#yardHud{font-size:14px;padding:6px 12px;gap:7px}#yardHud .big{font-size:19px;min-width:44px}#yardHud .sub{display:none}
 #yardHint{top:calc(112px + env(safe-area-inset-top,0px));font-size:14px;max-width:78vw}
 #yardStop{top:auto;bottom:calc(196px + env(safe-area-inset-bottom,0px));left:12px}#yardCam{top:auto;bottom:calc(250px + env(safe-area-inset-bottom,0px));left:12px}
 #yardPad{bottom:calc(30px + env(safe-area-inset-bottom,0px))}}
body.touch.yard-pad #tAct,body.touch.yard-pad #tJump{display:none}
#yardCard{position:fixed;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(10,14,30,.35)}
#yardCard .box{width:min(420px,92vw);max-height:90vh;overflow:auto;padding:20px 22px 16px;border-radius:24px;background:#fff8ea;box-shadow:0 14px 40px rgba(0,0,0,.35);
 font:700 15px Nunito,system-ui,sans-serif;color:#4a3020;text-align:center;zoom:var(--ui-scale,1)}
#yardCard h2{margin:2px 0;font:600 24px Fredoka,Nunito,sans-serif;color:#7a3e16}
#yardCard .verdict{font:600 18px Fredoka,Nunito,sans-serif;color:#2f8a4a}
#yardCard .stars{font-size:38px;letter-spacing:4px;color:#f2a51a;text-shadow:0 2px 0 #b8640a33}
#yardCard .stars i{font-style:normal;display:inline-block;animation:yardStar .5s both}
#yardCard .score{font:600 24px Fredoka,Nunito,sans-serif;margin:2px 0}
#yardCard .best{color:#7a6a58;min-height:1.2em}
#yardCard .fact{margin:12px 0 4px;padding:10px 12px;border-radius:14px;background:#fff1cf;text-align:left;font-weight:600;font-size:14px}
#yardCard .fact b{display:block;color:#c2541c;margin-bottom:2px}
#yardCard .btns{display:flex;gap:10px;justify-content:center;margin-top:14px}
#yardCard button{flex:1;min-height:48px;padding:11px 10px;border:0;border-radius:14px;font:700 16px Nunito,sans-serif;cursor:pointer;background:#f4dfb5;color:#5a3a22}
#yardCard button.main{background:#f08a3c;color:#fff}
#yardCard kbd{font:700 12px Nunito,sans-serif;padding:1px 5px;border-radius:5px;background:#0002;margin-left:6px}
@keyframes yardStar{from{transform:scale(0) rotate(-40deg);opacity:0}to{transform:none;opacity:1}}
`;
