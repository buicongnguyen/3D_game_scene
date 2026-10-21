// The first graphics tier for a device that has no saved choice. Pure: everything it needs is passed in, so it can be
// tested (tests/quality-pick.test.mjs). The player's own choice in Settings (a saved tier) always wins.
//
// Signals, cheapest first: software renderer -> low; phones and tablets -> low; the GPU's name (integrated or old chips
// never get High, strong discrete chips may); the physical pixel count (a 4K display with MSAA is a lot of work for
// anything but the strongest chips); memory and cores where the browser tells them.

export const SOFTWARE = /SwiftShader|llvmpipe|Software|Basic Render|softpipe|Microsoft Basic/i;
// integrated, mobile or old chips: Medium at best
export const WEAK = /Intel.*(HD Graphics|UHD Graphics|Iris(?! Xe)|GMA|Mesa)|Mali|Adreno|PowerVR|Vega|Radeon\s*(HD|R[2-9]\b|Graphics)|GeForce\s*(GT\s|MX|[0-9]{3,4}M\b)|Apple GPU/i;
// chips that run High at a normal resolution
export const STRONG = /RTX|GTX\s*(16\d\d|10[6-8]0|9[78]0)|Radeon\s*RX|Radeon\s*Pro|Apple M[1-9]|Arc\b|Quadro\s*(RTX|P[2-6]|T)/i;
// chips that also hold High on a 4K display
export const ULTRA = /RTX\s*(30[789]0|40[6789]0|50[6789]0|A[0-9]{4})|RX\s*(6[7-9]\d{2}|7\d{3}|9\d{3})|Apple M[3-9]|Arc\s*A[7-9]/i;

export const HIGH_PIXELS = 6.5e6;   // physical pixels above which High needs an ultra chip (a 4K display is 8.3 M)

/** { saved, renderer, mobile, width, height, dpr, deviceMemory, cores } -> 'low' | 'medium' | 'high' */
export function pickQuality({ saved = null, renderer = '', mobile = false, width = 1280, height = 720, dpr = 1, deviceMemory, cores } = {}) {
  if (saved === 'low' || saved === 'medium' || saved === 'high') return saved;
  if (SOFTWARE.test(renderer)) return 'low';
  if (mobile) return 'low';
  if (deviceMemory !== undefined && deviceMemory <= 2) return 'low';
  let tier = STRONG.test(renderer) && !WEAK.test(renderer) ? 'high' : 'medium';
  if (tier === 'high') {
    const pixels = width * height * dpr * dpr;
    if (pixels > HIGH_PIXELS && !ULTRA.test(renderer)) tier = 'medium';
    if ((deviceMemory !== undefined && deviceMemory <= 4) || (cores !== undefined && cores <= 4)) tier = 'medium';
  }
  return tier;
}
