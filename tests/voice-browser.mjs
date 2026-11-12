// Settings > Voices in the real dialogue box (engine/voice.js), with a recording stand-in for speechSynthesis: headless
// Chromium has no voices, and real ones differ by device. Read aloud reads every line of a page in order, a man's voice
// for a man, a woman's (raised) for a woman or child, in the game's language; Next, Skip and closing stop it; no voice
// for the language -> blips; Off -> nothing; Blips as before; choosing Read aloud in Settings plays a sample.
//   GAME_URL=http://127.0.0.1:5897/ node tests/voice-browser.mjs
import { chromium } from 'playwright';
const url = process.env.GAME_URL || 'http://127.0.0.1:5897/';
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
let failed = 0;
const ok = (c, m) => { console.log(`${c ? '  ok ' : '  FAIL'} ${m}`); if (!c) failed++; };

const fake = () => {
  const voices = [
    { name: 'Samantha', lang: 'en-US', localService: true, default: true, voiceURI: 'samantha' },
    { name: 'Daniel', lang: 'en-GB', localService: true, voiceURI: 'daniel' },
    { name: 'Kyoko', lang: 'ja-JP', localService: true, voiceURI: 'kyoko' },
    { name: 'Otoya', lang: 'ja-JP', localService: true, voiceURI: 'otoya' },
  ];
  const log = window.__speech = { said: [], cancels: 0 };
  const synth = {
    speaking: false, pending: false,
    getVoices: () => voices,
    speak(u) { log.said.push({ text: u.text, voice: u.voice?.name || null, pitch: +u.pitch.toFixed(2), rate: u.rate, lang: u.lang, volume: u.volume }); this.pending = true; },
    cancel() { log.cancels++; this.pending = false; },
    addEventListener() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  // (the real utterance accepts only the browser's own voice objects)
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; this.voice = null; this.lang = ''; this.pitch = 1; this.rate = 1; this.volume = 1; } };
};

async function open(mode, lang) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(fake);
  await ctx.addInitScript(([mode, lang]) => { localStorage.setItem('starline-opt-voices', JSON.stringify(mode)); localStorage.setItem('starline-lang', lang); }, [mode, lang]);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${url}?qa=1`);
  await page.waitForFunction(() => window.__STARLINE__?.ui && window.__STARLINE_READY__, null, { timeout: 120000 });
  await page.evaluate(() => { const ui = window.__STARLINE__.ui; window.__blips = 0; ui.audio.blip = () => { window.__blips++; }; });
  return { ctx, page, errors };
}

// a two-page talk: Genzo (a man), Mika (a child), the narrator, Rin (a woman)
const LINES = [['genzo', 'The lamp is out again.'], ['mika', 'I can fix it! ★'], ['narrator', 'The wind turns.'], ['rin', 'Grab the rod.'],
  ['genzo', 'Careful on the dock.'], ['mika', 'I will.'], ['rin', 'Three fish, then.'], ['genzo', 'And grill them well.'], ['mika', 'Deal.']];
const talk = page => page.evaluate(lines => { window.__done = false; window.__STARLINE__.ui.dialogue(lines).then(() => { window.__done = true; }); }, LINES);
const next = async page => { await page.waitForTimeout(260); await page.evaluate(() => window.__STARLINE__.ui.nav?.('next')); };
const until = (page, fn) => page.waitForFunction(fn, null, { timeout: 5000 });

{ // Read aloud, English
  const { ctx, page, errors } = await open('read', 'en');
  await talk(page);
  await until(page, () => window.__speech.said.length > 0);
  const first = await page.evaluate(() => ({ said: window.__speech.said.slice(), blips: window.__blips, rows: document.querySelectorAll('#dlgLines .dl-row').length }));
  console.log('read aloud, en, page 1:', JSON.stringify(first.said));
  ok(first.said.length === first.rows, `every line of the page is read, in order (${first.said.length} of ${first.rows} rows)`);
  ok(first.blips === 0, 'no blips while reading');
  const by = t => first.said.find(s => s.text.startsWith(t));
  ok(by('The lamp')?.voice === 'Daniel', "Genzo gets the man's voice");
  ok(by('I can fix')?.voice === 'Samantha' && !/★/.test(by('I can fix').text), "Mika gets the woman's voice, raised; the star is not read");
  ok(by('I can fix').pitch > by('The lamp').pitch, 'Mika is higher than Genzo');
  // Next: what was being read stops, and the next page is read from its first line; walk every page
  let pages = 1, stoppedEach = true;
  for (;;) {
    const n = await page.evaluate(() => window.__speech.said.length), c0 = await page.evaluate(() => window.__speech.cancels);
    await next(page);
    await page.waitForTimeout(150);
    if (await page.evaluate(() => window.__done)) break;
    await until(page, n => window.__speech.said.length > n, n);
    const st = await page.evaluate(n => ({ c: window.__speech.cancels, first: window.__speech.said[n].text, row: document.querySelector('#dlgLines .dl-row .tx')?.textContent || '' }), n);
    if (!(st.c > c0) || st.first !== st.row.replace(/ ?★/, '')) { stoppedEach = false; console.log('   page', pages + 1, JSON.stringify(st)); }
    pages++;
  }
  const all = await page.evaluate(() => window.__speech.said);
  ok(pages > 1 && stoppedEach, `on each Next the reading stops and the next page starts at its first line (${pages} pages)`);
  const find = t => all.find(x => x.text.startsWith(t));
  ok(all.length === 9, `every line of the talk was read (${all.length} of 9)`);
  ok(!!find('The wind') && find('The wind').pitch === 1, 'the narrator is read too, at an even pitch');
  ok(find('Grab')?.voice === 'Samantha' && find('Grab').pitch > find('The lamp').pitch, "Rin gets the woman's voice");
  // Skip stops it too
  await talk(page); await until(page, () => window.__speech.said.length > 9);
  const c1 = await page.evaluate(() => window.__speech.cancels);
  await page.waitForTimeout(260); await page.evaluate(() => window.__STARLINE__.ui.nav?.('skip'));
  await until(page, () => window.__done);
  ok((await page.evaluate(() => window.__speech.cancels)) > c1, 'Skip stops what was being read');
  ok(!errors.length, `no page errors ${errors.join(' | ')}`);
  await ctx.close();
}
{ // Read aloud, Japanese: the translated lines, Japanese voices
  const { ctx, page } = await open('read', 'ja');
  await page.evaluate(() => { window.__done = false; window.__STARLINE__.ui.dialogue([['genzo', 'Prologue'], ['hana', 'Peach']]).then(() => { window.__done = true; }); });
  await until(page, () => window.__speech.said.length >= 2);
  const s = await page.evaluate(() => window.__speech.said);
  console.log('read aloud, ja:', JSON.stringify(s));
  ok(s[0].voice === 'Otoya' && s[1].voice === 'Kyoko' && s[0].lang === 'ja-JP', 'Japanese: Otoya for Genzo, Kyoko for Hana');
  ok(s[1].text !== 'Peach', 'the line is read in the game\'s language');
  await ctx.close();
}
{ // Read aloud, Korean, no Korean voice here: blips
  const { ctx, page } = await open('read', 'ko');
  await talk(page);
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => ({ said: window.__speech.said.length, blips: window.__blips }));
  ok(r.said === 0 && r.blips > 0, `no voice for Korean: blips instead (${r.blips} blips, ${r.said} spoken)`);
  await ctx.close();
}
{ // Off: nothing
  const { ctx, page } = await open('off', 'en');
  await talk(page);
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => ({ said: window.__speech.said.length, blips: window.__blips }));
  ok(r.said === 0 && r.blips === 0, `Off: no voices, no blips (${r.blips}, ${r.said})`);
  await ctx.close();
}
{ // Blips (the default): as before
  const { ctx, page } = await open('blips', 'en');
  await talk(page);
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => ({ said: window.__speech.said.length, blips: window.__blips }));
  ok(r.said === 0 && r.blips > 0, `Blips: blips only (${r.blips}, ${r.said})`);
  // Settings: choose Read aloud -> a sample in Mika's voice, saved for next time
  await page.evaluate(() => { const s = document.getElementById('optVoices'); s.value = 'read'; s.dispatchEvent(new Event('change')); });
  await until(page, () => window.__speech.said.some(x => x.text === "Hi, I'm Mika!"));
  const smp = await page.evaluate(() => ({ silentFirst: window.__speech.said[0].volume === 0, said: window.__speech.said.find(x => x.text === "Hi, I'm Mika!"), saved: localStorage.getItem('starline-opt-voices'), opts: [...document.querySelectorAll('#optVoices option')].map(o => o.textContent) }));
  ok(smp.silentFirst && smp.said.voice === 'Samantha' && smp.saved === '"read"', `Settings: a sample (${JSON.stringify(smp.said)}), choice saved; options ${smp.opts.join(' / ')}`);
  await ctx.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : 'voices: all good');
process.exit(failed ? 1 : 0);
