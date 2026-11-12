// Read aloud (Settings > Voices): the dialogue spoken by the device's own voices (the Web Speech API), in the game's
// language. Nothing is downloaded; the speaking runs in the phone's own speech engine, not in the game's frame.
//
// Each speaker gets a voice of their kind where the device has one: a woman's, a man's, or a child's (a woman's voice
// raised: nearer a child than a raised man's), with the speaker's own pitch on top (the one their blips use). Browsers do
// not say which voice is a man's or a woman's, so known voice names tell (Apple, Windows and Edge, Chrome); where none
// does (many Android phones have one voice per language) the pitch alone sets them apart.
// Where the device has no voice for the language, or no speech at all, the dialogue keeps its blips (ui/ui.js).
//
// The pure parts (who speaks how, which voice) are exported for tests/voice.test.mjs.

export const VOICE_MODES = ['blips', 'read', 'off'];
const KEY = 'starline-opt-voices';

// names of voices that are a woman's or a man's (macOS / iOS, Windows / Edge "Natural", Chrome's Google voices)
const FEMALE = /female|woman|samantha|karen|moira|tessa|fiona|victoria|allison|\bava\b|susan|zira|hazel|\baria\b|jenny|libby|sonia|michelle|\bemma\b|natasha|clara|catherine|serena|nicky|\blinh\b|hoaimy|hoai my|kyoko|haruka|ayumi|nanami|sayaka|o-ren|mizuki|\byuna\b|heami|sunhi|sun-hi|seoyeon|google us english/i;
const MALE = /\bmale\b|daniel|\balex\b|\bfred\b|\btom\b|aaron|arthur|gordon|rishi|oliver|\bdavid\b|\bmark\b|george|\bguy\b|\bryan\b|thomas|christopher|\beric\b|roger|steffan|brian|namminh|nam minh|microsoft an\b|otoya|ichiro|keita|hattori|injoon|in-joon|hyunsu/i;

/** 'f', 'm' or null (the name does not tell) for a SpeechSynthesisVoice-like { name, voiceURI }. */
export function voiceGender(v) {
  const n = `${v?.name || ''} ${v?.voiceURI || ''}`;
  return FEMALE.test(n) ? 'f' : MALE.test(n) ? 'm' : null;
}

/**
 * How a cast member sounds: 'f' (a woman), 'm' (a man), 'c' (a child), or null (anyone: the narrator, "Villager").
 * The cast says so itself (`voice`); the valley's neighbours by their title, children by their high pitch.
 */
export function speakerKind(c) {
  if (!c) return null;
  if (c.voice) return c.voice;
  const n = c.name || '';
  if (/^(Mr|Grandpa|Uncle)\b/.test(n)) return 'm';
  if (/^(Mrs|Miss|Ms|Granny|Grandma|Auntie)\b/.test(n)) return 'f';
  if ((c.pitch ?? 1) >= 1.35) return 'c';
  return null;
}

const lower = s => String(s || '').toLowerCase().replace('_', '-');
/** Voices for the game's language ('en', 'vi', 'ja', 'ko'), best first. */
export function voicesFor(voices, lang) {
  const want = lower(lang);
  const rank = v => (/natural|neural|enhanced|premium|siri/i.test(v.name) ? 4 : 0) + (v.localService ? 1 : 0) + (v.default ? 0.5 : 0)
    + (want === 'en' && /^en-(us|gb)/.test(lower(v.lang)) ? 0.5 : 0);
  return (voices || []).filter(v => lower(v.lang).split('-')[0] === want).sort((a, b) => rank(b) - rank(a));
}

/** The voice for a speaker of `kind` in `lang`: one of their kind if the device has one, else the language's best. */
export function pickVoice(voices, lang, kind) {
  const list = voicesFor(voices, lang);
  if (!list.length) return null;
  const want = kind === 'm' ? 'm' : kind === 'f' || kind === 'c' ? 'f' : null;
  return (want && list.find(v => voiceGender(v) === want)) || list[0];
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/**
 * Pitch and rate for a speaker (`pitch`: their blip pitch, ~0.7 for an old man to 1.6 for Tamo) on a voice of gender
 * `got` ('f', 'm' or null: unknown, taken as a woman's: phones' only voice usually is). A man on a woman's voice is
 * lowered a lot, a woman or child on a man's voice raised; on a voice of their own kind the shift is small.
 */
export function speechFor(kind, pitch = 1, got = null) {
  const voiceIs = got || 'f';
  let p;
  if (kind === 'c') p = 1.2 + (pitch - 1.3) * 0.8;
  else if (kind === 'm') p = (voiceIs === 'm' ? 1 : 0.72) + (pitch - 0.85) * 0.8;
  else if (kind === 'f') p = 1 + (pitch - 1.05) * 0.8;
  else p = 1 + (pitch - 1) * 0.6;
  if ((kind === 'f' || kind === 'c') && voiceIs === 'm') p += 0.35;
  const rate = kind === 'c' ? 1.04 : pitch < 0.86 || (kind === 'f' && pitch < 1) ? 0.93 : 1;
  return { pitch: clamp(p, 0.5, 1.8), rate };
}

/** What a voice should not read out: emoji, stars, notes, decorations. */
export function speakable(text) {
  return String(text || '').replace(/[\p{Extended_Pictographic}☀-➿⭐️~＊*_#|<>]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export class Voice {
  constructor() {
    this.synth = typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null;
    this.mode = 'blips';
    try { const m = JSON.parse(localStorage.getItem(KEY)); if (VOICE_MODES.includes(m)) this.mode = m; } catch { /* default */ }
    this.volume = 0.8;
    this.muted = false;
    this.voices = [];
    this.live = [];          // the utterances in the queue (kept referenced: some browsers drop the ones nobody holds)
    this.timer = 0;
    this.unlocked = false;
    if (!this.synth) return;
    const load = () => { try { this.voices = this.synth.getVoices() || []; } catch { this.voices = []; } };
    load();
    this.synth.addEventListener?.('voiceschanged', load);
    // iOS speaks only once a touch has started speech: the first touch or key speaks a silent line
    const unlock = () => this.unlock();
    addEventListener('pointerdown', unlock, { capture: true, passive: true });
    addEventListener('keydown', unlock, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); });
  }

  setMode(m) {
    if (!VOICE_MODES.includes(m)) return;
    this.mode = m;
    try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* private mode */ }
    if (m !== 'read') this.stop(); else this.unlock();
  }

  unlock() {
    if (this.unlocked || !this.synth || this.mode !== 'read') return;
    this.unlocked = true;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; this.synth.speak(u); } catch { /* nothing to wake */ }
  }

  /** Will lines in `lang` be read out now (the mode is Read aloud and the device has a voice for it)? */
  reads(lang) {
    if (this.mode !== 'read' || !this.synth || this.muted) return false;
    if (!this.voices.length) { try { this.voices = this.synth.getVoices() || []; } catch { /* none yet */ } }
    return voicesFor(this.voices, lang).length > 0;
  }

  /** Read a page's lines in order: [{ text, cast }]; whatever was being read stops first. -> false if nothing will be read */
  speak(lines, lang) {
    this.stop();
    const queue = [];
    try {
      for (const { text, cast } of lines) {
        const words = speakable(text);
        if (!words) continue;
        const kind = speakerKind(cast), v = pickVoice(this.voices, lang, kind);
        if (!v) continue;
        const { pitch, rate } = speechFor(kind, cast?.pitch ?? 1, voiceGender(v));
        const u = new SpeechSynthesisUtterance(words);
        u.voice = v; u.lang = v.lang; u.pitch = pitch; u.rate = rate; u.volume = this.volume;
        u.onend = u.onerror = () => { const i = this.live.indexOf(u); if (i >= 0) this.live.splice(i, 1); };
        queue.push(u);
      }
    } catch (e) { console.warn('[voice] cannot read aloud here: blips instead', e); return false; }
    if (!queue.length) return false;
    this.live = queue;
    // (right after cancel() some browsers drop the next utterance: speak a moment later)
    this.timer = setTimeout(() => {
      this.timer = 0;
      try { for (const u of queue) if (this.live.includes(u)) this.synth.speak(u); } catch (e) { console.warn('[voice] speech failed', e); }
    }, 60);
    return true;
  }

  stop() {
    if (this.timer) { clearTimeout(this.timer); this.timer = 0; }
    this.live = [];
    try { if (this.synth && (this.synth.speaking || this.synth.pending)) this.synth.cancel(); } catch { /* nothing to stop */ }
  }
}
