// Star groups (constellations) for "Look up at the sky" (game/skygaze.js), the journal and the Stargazing trick.
// Pure data and maths, Node-readable. Real positions (J2000 right ascension in hours, declination in degrees, visual
// magnitude), so the same stars serve every sky profile; only the latitude, the horizon, the ordering and the words differ.
//
// PROFILES: where the player is looking from, chosen by the language (profileFor(lang)), never by a branch in the game:
//   jp  lat 35 N, the Japan-like valley (English, Japanese, Korean and any other language)
//   vn  lat 16 N, central Vietnam (Vietnamese): Polaris only 16 degrees up, Scorpius high in the summer, the Southern
//       Cross in the spring. Its texts are written in Vietnamese in PROFILES.vn.text (not English source keys, so the
//       extractor and the vi.json pack do not need them; a Vietnamese group without a text falls back to the English one).
// Adding a language profile is data: add an entry to PROFILES and to LANG_PROFILE.
//
// The evening sky: the story clock is often frozen, so the sky is derived from the season shown and the hour shown: the
// local sidereal time at 21:00 is a constant per season (mid-season date) and runs on with the hour.
import { N_ } from '../i18n/i18n.js';

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
/** Local sidereal time (hours) at 21:00 in the middle of each season (about 20 Apr, 20 Jul, 20 Oct, 20 Jan). */
export const LST21 = { spring: 11, summer: 17, autumn: 23, winter: 5 };

const sourceOfVn = `Vietnamese names, checked 2026-10 against vi.wikipedia "Danh sach chom sao" (constellation names), mytour.vn
 (Sao Rua = the Pleiades M45, also Sao Ma; Sao Cay = Orion), baophapluat/vietnam.vn (Sao Rua and Sao Cay; Sao Hom/Sao Mai = Venus),
 mytour.vn and Wikipedia "The Cowherd and the Weaver Girl" (Nguu Lang = Altair, Chuc Nu = Vega, the Ngan Ha river and the magpie
 bridge Cau O Thuoc in the 7th lunar month). UNVERIFIED, so not shown: "Sao Banh lai lon" for the Big Dipper (one source only); that
 Sao Cay is specifically Orion's belt; Vietnamese folk names for Scorpius, Leo, Cygnus.`;

export const PROFILES = {
  jp: { id: 'jp', lat: 35, minAlt: 14, text: null, boost: {}, dim: {} },
  vn: {
    id: 'vn', lat: 16, minAlt: 8, source: sourceOfVn,
    boost: { crux: 4, centaurus: 2, scorpius: 1.5 },         // a rank bonus: the Southern Cross is the thrill there
    dim: { polaris: 1.4 },                                    // the North Star sits low in the haze: fainter
    text: {
      'big-dipper': { name: 'Bắc Đẩu (Big Dipper)', short: 'Bắc Đẩu', story: 'Bảy ngôi sao Bắc Đẩu xếp thành một chiếc muôi khổng lồ trên trời. Bà Sora bảo đó là cái muôi khuấy nồi canh của bầu trời.', tip: 'Nhìn về phía bắc, thấp trên trời, có lúc bị khuất sau đường chân trời. Nối hai sao ở mép gáo muôi sẽ chỉ tới sao Bắc Cực.' },
      'little-dipper': { name: 'Tiểu Hùng và sao Bắc Cực (Little Dipper, Polaris)', short: 'Tiểu Hùng', story: 'Chiếc muôi nhỏ treo trên sao Bắc Cực. Sao Bắc Cực gần như đứng yên, nên người đi xa luôn biết đâu là hướng bắc.', tip: 'Ở miền Trung sao Bắc Cực chỉ cao khoảng 16 độ, thấp và hơi mờ. Tìm Bắc Đẩu trước, rồi kéo dài hai sao ở mép gáo.' },
      cassiopeia: { name: 'Tiên Hậu (Cassiopeia)', short: 'Tiên Hậu', story: 'Năm ngôi sao xếp thành chữ W, hay chữ M nếu bạn đứng lộn ngược. Nữ hoàng Tiên Hậu ngồi trên ngai và vẫy chào cả thung lũng.', tip: 'Ở phía bắc, đối diện Bắc Đẩu qua sao Bắc Cực. Mùa thu hãy tìm chữ W hay M thấp phía bắc.' },
      orion: { name: 'Lạp Hộ, hay sao Cày (Orion)', short: 'Lạp Hộ', story: 'Người thợ săn Orion bước qua bầu trời mùa đông. Ông bà ta gọi chòm sao này là sao Cày. Ba ngôi sao thẳng hàng là thắt lưng của chàng.', tip: 'Tìm ba ngôi sao thẳng hàng giữa trời. Sao đỏ Betelgeuse là vai, sao xanh trắng Rigel là chân.' },
      'canis-major': { name: 'Đại Khuyển và Thiên Lang (Canis Major, Sirius)', short: 'Đại Khuyển', story: 'Chú chó lớn chạy theo Orion, mang theo Thiên Lang, ngôi sao sáng nhất cả bầu trời đêm. Nó lấp lánh đủ thứ màu.', tip: 'Kéo dài ba sao thắt lưng Orion xuống thấp: ngôi sao trắng xanh rất sáng là Thiên Lang.' },
      gemini: { name: 'Song Tử (Gemini)', short: 'Song Tử', story: 'Castor và Pollux là đôi bạn đi đâu cũng có nhau, đứng cạnh nhau vẫy tay chào.', tip: 'Phía trên bên trái Orion, tìm hai ngôi sao sáng đứng cạnh nhau.' },
      taurus: { name: 'Kim Ngưu và sao Rua (Taurus, Pleiades)', short: 'Kim Ngưu', story: 'Chú bò mộng có con mắt màu cam là Aldebaran. Trên vai chú lấp lánh sao Rua, cụm sao xanh bé xíu mà ông bà ta ngắm để biết mùa gieo mạ.', tip: 'Từ thắt lưng Orion kéo lên bên phải tới sao Aldebaran màu cam, đi tiếp sẽ gặp cụm sao Rua nhỏ lấp lánh.' },
      leo: { name: 'Sư Tử (Leo)', short: 'Sư Tử', story: 'Chú sư tử nằm giữa trời xuân, bờm là một dấu hỏi ngược. Trái tim sáng của chú là Regulus.', tip: 'Tìm dấu hỏi ngược trên trời. Chấm của nó là ngôi sao sáng Regulus.' },
      virgo: { name: 'Xử Nữ và sao Spica (Virgo)', short: 'Xử Nữ', story: 'Cô gái ôm bó lúa trên tay. Ngôi sao sáng ở đầu bó lúa là Spica.', tip: 'Đi theo cán của Bắc Đẩu vòng xuống, qua sao Arcturus màu cam rồi tới Spica.' },
      'spring-triangle': { name: 'Tam giác mùa xuân (Spring Triangle)', short: 'Tam giác mùa xuân', story: 'Ba ngôi sao sáng làm thành một tam giác lớn: Arcturus màu cam, Spica xanh trắng và Denebola, đuôi sư tử.', tip: 'Tìm Arcturus và Spica trước, rồi Denebola để khép tam giác.' },
      scorpius: { name: 'Thiên Yết (Scorpius)', short: 'Thiên Yết', story: 'Con bọ cạp cuộn mình ở trời nam mùa hè. Trái tim đỏ rực của nó là sao Antares, cái đuôi cong như lưỡi câu.', tip: 'Ở Việt Nam, Thiên Yết lên rất cao ở phía nam vào tối mùa hè. Tìm sao đỏ Antares rồi theo cái đuôi cong.' },
      'summer-triangle': { name: 'Chức Nữ, Ngưu Lang (Vega, Altair): Tam giác mùa hè', short: 'Tam giác mùa hè', story: 'Chức Nữ dệt lụa trên trời, Ngưu Lang chăn trâu. Dải Ngân Hà ngăn cách hai người, nhưng mỗi năm vào tháng Ngâu, đàn chim ô thước bắc cầu cho hai người gặp nhau. Ai cũng ước một điều nhé!', tip: 'Nhìn lên cao hướng đông: Chức Nữ (Vega) sáng nhất. Ngưu Lang (Altair) ở thấp hơn, Deneb ở bên kia. Nối ba sao lại.' },
      lyra: { name: 'Thiên Cầm và Chức Nữ (Lyra, Vega)', short: 'Thiên Cầm', story: 'Cây đàn nhỏ có Chức Nữ (Vega) lấp lánh như viên kim cương ở một góc.', tip: 'Tìm Chức Nữ rực rỡ, ngay bên cạnh có hình thoi nhỏ bốn ngôi sao.' },
      cygnus: { name: 'Thiên Nga (Cygnus)', short: 'Thiên Nga', story: 'Thiên nga bay dọc sông Ngân Hà, dang rộng đôi cánh. Có người thấy một cây thập tự. Đuôi là Deneb, mỏ là Albireo, hai sao đôi vàng và xanh.', tip: 'Từ Deneb đi theo thân dài tới Albireo. Hai sao ngang là đôi cánh.' },
      aquila: { name: 'Thiên Ưng và Ngưu Lang (Aquila, Altair)', short: 'Thiên Ưng', story: 'Chim ưng bay trên sông Ngân Hà. Ngưu Lang (Altair) toả sáng ở ngực chim, hai bên có hai ngôi sao nhỏ.', tip: 'Tìm một sao sáng có hai sao mờ hơn nằm hai bên thành hàng ngắn: đó là Ngưu Lang.' },
      sagittarius: { name: 'Cung Thủ, hình ấm trà (Sagittarius)', short: 'Cung Thủ', story: 'Người cung thủ trông như một cái ấm trà. Hơi nước bốc lên từ vòi ấm là dải Ngân Hà. Bà bảo đó là trà của các vì sao.', tip: 'Nhìn về phía nam, bên trái Thiên Yết, tìm tám ngôi sao hình ấm trà, vòi ấm ở bên phải.' },
      pegasus: { name: 'Phi Mã và hình vuông mùa thu (Pegasus)', short: 'Phi Mã', story: 'Chú ngựa bay Pegasus mang cả một hình vuông khổng lồ qua bầu trời thu: bốn ngôi sao, bốn góc, và rất nhiều trời trống ở giữa.', tip: 'Nhìn cao về phía đông nam, tìm hình vuông bốn sao lớn, bên trong gần như không có sao.' },
      andromeda: { name: 'Tiên Nữ (Andromeda)', short: 'Tiên Nữ', story: 'Nàng công chúa của các vì sao đưa tay ra từ góc hình vuông. Gần đó có một vệt mờ: thiên hà Tiên Nữ, cả một hòn đảo sao ở rất xa.', tip: 'Từ góc hình vuông, đi theo một hàng sao nhẹ nhàng. Đêm tối trời sẽ thấy vệt mờ.' },
      auriga: { name: 'Ngự Phu và sao Capella (Auriga)', short: 'Ngự Phu', story: 'Capella, "chú dê con", là ngôi sao vàng sáng nhất trong năm ngôi sao làm thành một hình ngũ giác lớn.', tip: 'Nhìn cao trên trời mùa đông, phía bắc Orion, tìm ngôi sao vàng sáng như Chức Nữ: Capella.' },
      perseus: { name: 'Anh Tiên (Perseus)', short: 'Anh Tiên', story: 'Người hùng sải bước giữa Tiên Hậu và Ngự Phu. Sao Algol của chàng biết nháy mắt: cứ ba ngày lại mờ đi rồi sáng lại.', tip: 'Giữa chữ W của Tiên Hậu và sao Rua, tìm một đường cong dài các ngôi sao. Algol ở cuối.' },
      crux: { name: 'Nam Thập Tự (Southern Cross)', short: 'Nam Thập Tự', story: 'Chữ thập phương nam gồm bốn ngôi sao sáng. Người đi biển xưa dùng nó để tìm hướng nam. Ở Việt Nam bạn nhìn thấy nó, còn ở Nhật thì không!', tip: 'Tối mùa xuân, nhìn thấp về phía nam, từ một nơi thoáng như cầu cạn. Hai sao sáng của Bán Nhân Mã chỉ về phía chữ thập.' },
      centaurus: { name: 'Bán Nhân Mã: hai sao chỉ đường (Alpha, Beta Centauri)', short: 'Bán Nhân Mã', story: 'Hai ngôi sao sáng này như hai ngón tay chỉ về Nam Thập Tự. Alpha Centauri là ngôi sao láng giềng gần Mặt Trời nhất.', tip: 'Ngay bên cạnh Nam Thập Tự, hai sao sáng đứng cạnh nhau.' },
    },
    starNames: {
      polaris: 'Sao Bắc Cực (Polaris)', vega: 'Chức Nữ (Vega)', altair: 'Ngưu Lang (Altair)', sirius: 'Thiên Lang (Sirius)', alcyone: 'Sao Rua (Pleiades)',
      betelgeuse: 'Betelgeuse (vai đỏ)', rigel: 'Rigel (chân xanh)', antares: 'Antares (trái tim đỏ)', aldebaran: 'Aldebaran (mắt bò)', shaula: 'Shaula (nọc độc)',
      algol: 'Algol (sao nháy mắt)', albireo: 'Albireo (mỏ thiên nga)', rigilkent: 'Alpha Centauri', hadar: 'Hadar (Beta Centauri)',
    },
  },
};
/** The profile of a language. Anything not listed gets the Japan-like valley. */
export const LANG_PROFILE = { vi: 'vn' };
export const profileFor = lang => PROFILES[LANG_PROFILE[lang]] || PROFILES.jp;

// ------------------------------------------------------------------------------------ the stars
// id: [ra h, dec deg, magnitude, English name (source string) or null, colour w|b|y|o|r]
const S = (ra, dec, mag, name = null, col = 'w') => ({ ra, dec, mag, name, col });
export const STARS = {
  // Big Dipper and the North Star
  dubhe: S(11.062, 61.75, 1.8, N_('Dubhe'), 'o'), merak: S(11.031, 56.38, 2.37, N_('Merak'), 'b'), phecda: S(11.897, 53.69, 2.44, N_('Phecda'), 'b'),
  megrez: S(12.257, 57.03, 3.31, null, 'b'), alioth: S(12.9, 55.96, 1.77, N_('Alioth'), 'b'), mizar: S(13.399, 54.93, 2.27, N_('Mizar'), 'b'), alkaid: S(13.792, 49.31, 1.86, N_('Alkaid'), 'b'),
  polaris: S(2.53, 89.26, 1.98, N_('Polaris, the North Star'), 'y'), yildun: S(17.537, 86.59, 4.36), epsumi: S(16.767, 82.04, 4.2), zetumi: S(15.735, 77.79, 4.3), etaumi: S(16.292, 75.76, 4.95),
  kochab: S(14.845, 74.16, 2.08, N_('Kochab'), 'o'), pherkad: S(15.345, 71.83, 3.05, null, 'b'),
  // Cassiopeia
  caph: S(0.153, 59.15, 2.27, N_('Caph'), 'y'), schedar: S(0.675, 56.54, 2.24, N_('Schedar'), 'o'), navi: S(0.945, 60.72, 2.47, null, 'b'), ruchbah: S(1.43, 60.24, 2.68, null, 'b'), segin: S(1.907, 63.67, 3.37, null, 'b'),
  // Orion and its neighbours
  betelgeuse: S(5.919, 7.41, 0.5, N_('Betelgeuse, the red shoulder'), 'r'), rigel: S(5.242, -8.2, 0.13, N_('Rigel, the blue foot'), 'b'), bellatrix: S(5.419, 6.35, 1.64, N_('Bellatrix'), 'b'), saiph: S(5.796, -9.67, 2.06, null, 'b'),
  alnitak: S(5.679, -1.94, 1.77, N_('Alnitak'), 'b'), alnilam: S(5.603, -1.2, 1.69, N_('Alnilam'), 'b'), mintaka: S(5.533, -0.3, 2.23, N_('Mintaka'), 'b'), meissa: S(5.586, 9.93, 3.5, null, 'b'),
  sirius: S(6.752, -16.72, -1.46, N_('Sirius, the brightest star'), 'b'), mirzam: S(6.378, -17.96, 1.98, null, 'b'), adhara: S(6.977, -28.97, 1.5, N_('Adhara'), 'b'), wezen: S(7.14, -26.39, 1.83, null, 'y'), aludra: S(7.402, -29.3, 2.45, null, 'b'), muliphein: S(7.063, -15.63, 4.1, null, 'b'),
  castor: S(7.577, 31.89, 1.58, N_('Castor'), 'w'), pollux: S(7.755, 28.03, 1.14, N_('Pollux'), 'o'), alhena: S(6.629, 16.4, 1.93, null, 'w'), tejat: S(6.383, 22.51, 2.88, null, 'r'), propus: S(6.248, 22.51, 3.3, null, 'r'), mebsuta: S(6.732, 25.13, 3.0, null, 'y'), wasat: S(7.335, 21.98, 3.5, null, 'w'),
  aldebaran: S(4.599, 16.51, 0.85, N_('Aldebaran, the bull\'s eye'), 'o'), elnath: S(5.438, 28.61, 1.65, N_('Elnath'), 'b'), zetatau: S(5.627, 21.14, 3.0, null, 'b'), ain: S(4.477, 19.18, 3.5, null, 'o'), theta2tau: S(4.478, 15.87, 3.4, null, 'w'), gammatau: S(4.33, 15.63, 3.65, null, 'y'), lambdatau: S(4.012, 12.49, 3.5, null, 'b'),
  alcyone: S(3.791, 24.11, 2.87, N_('Pleiades (Subaru)'), 'b'), atlas: S(3.82, 24.05, 3.6, null, 'b'), electra: S(3.748, 24.11, 3.7, null, 'b'), maia: S(3.764, 24.37, 3.9, null, 'b'), merope: S(3.772, 23.95, 4.2, null, 'b'), taygeta: S(3.753, 24.47, 4.3, null, 'b'),
  capella: S(5.278, 46.0, 0.08, N_('Capella'), 'y'), menkalinan: S(5.992, 44.95, 1.9, null, 'w'), mahasim: S(5.995, 37.21, 2.6, null, 'w'), hassaleh: S(4.95, 33.17, 2.7, null, 'o'),
  mirfak: S(3.405, 49.86, 1.8, N_('Mirfak'), 'y'), algol: S(3.136, 40.96, 2.1, N_('Algol, the winking star'), 'b'), zetaper: S(3.902, 31.88, 2.85, null, 'b'), epsper: S(3.964, 40.01, 2.9, null, 'b'), deltaper: S(3.715, 47.79, 3.0, null, 'b'), gammaper: S(3.08, 53.51, 2.9, null, 'y'), etaper: S(2.845, 55.9, 3.8, null, 'o'),
  // spring
  regulus: S(10.139, 11.97, 1.35, N_('Regulus'), 'b'), denebola: S(11.818, 14.57, 2.14, N_('Denebola'), 'w'), algieba: S(10.333, 19.84, 2.0, null, 'o'), zosma: S(11.235, 20.52, 2.56, null, 'w'), chertan: S(11.237, 15.43, 3.3, null, 'w'),
  etaleo: S(10.122, 16.76, 3.5, null, 'w'), adhafera: S(10.278, 23.42, 3.4, null, 'w'), rasalas: S(9.879, 26.0, 3.9, null, 'y'), epsleo: S(9.764, 23.77, 3.0, null, 'y'),
  spica: S(13.42, -11.16, 0.97, N_('Spica'), 'b'), porrima: S(12.694, -1.45, 2.74, null, 'w'), vindemiatrix: S(13.036, 10.96, 2.83, null, 'y'), zavijava: S(11.845, 1.76, 3.6, null, 'w'), heze: S(13.578, -0.6, 3.4, null, 'w'), minelauva: S(12.927, 3.4, 3.4, null, 'o'), syrma: S(14.267, -6.0, 4.1, null, 'w'),
  arcturus: S(14.261, 19.18, -0.05, N_('Arcturus'), 'o'),
  // summer
  antares: S(16.49, -26.43, 1.06, N_('Antares, the red heart'), 'r'), graffias: S(16.091, -19.81, 2.6, null, 'b'), dschubba: S(16.005, -22.62, 2.3, null, 'b'), piSco: S(15.981, -26.11, 2.9, null, 'b'), sigmaSco: S(16.353, -25.59, 2.9, null, 'b'),
  tauSco: S(16.599, -28.22, 2.8, null, 'b'), epsSco: S(16.837, -34.29, 2.3, null, 'o'), muSco: S(16.865, -38.05, 3.0, null, 'b'), zetaSco: S(16.91, -42.36, 3.6, null, 'o'), etaSco: S(17.203, -43.24, 3.3, null, 'w'),
  sargas: S(17.622, -42.99, 1.87, null, 'w'), iotaSco: S(17.793, -40.13, 3.0, null, 'w'), kappaSco: S(17.708, -39.03, 2.4, null, 'b'), shaula: S(17.56, -37.1, 1.62, N_('Shaula, the stinger'), 'b'), lesath: S(17.507, -37.3, 2.7, null, 'b'),
  vega: S(18.615, 38.78, 0.03, N_('Vega (Orihime)'), 'w'), altair: S(19.846, 8.87, 0.76, N_('Altair (Hikoboshi)'), 'w'), deneb: S(20.69, 45.28, 1.25, N_('Deneb'), 'w'),
  sheliak: S(18.835, 33.36, 3.5, null, 'b'), sulafat: S(18.982, 32.69, 3.25, null, 'b'), deltalyr: S(18.908, 36.9, 4.2, null, 'r'), zetalyr: S(18.746, 37.6, 4.3, null, 'w'),
  sadr: S(20.37, 40.26, 2.2, N_('Sadr'), 'y'), albireo: S(19.512, 27.96, 3.1, N_('Albireo, the beak'), 'y'), gienah: S(20.77, 33.97, 2.5, null, 'o'), deltacyg: S(19.75, 45.13, 2.9, null, 'b'),
  tarazed: S(19.771, 10.61, 2.7, null, 'o'), alshain: S(19.922, 6.41, 3.7, null, 'y'), deltaaql: S(19.425, 3.11, 3.4, null, 'w'), thetaaql: S(20.188, -0.82, 3.2, null, 'b'), zetaaql: S(19.09, 13.86, 3.0, null, 'w'), lambdaaql: S(19.104, -4.88, 3.4, null, 'b'),
  kausAus: S(18.403, -34.38, 1.85, N_('Kaus Australis'), 'b'), kausMed: S(18.35, -29.83, 2.7, null, 'o'), kausBor: S(18.467, -25.42, 2.8, null, 'o'), phiSgr: S(18.761, -26.3, 3.2, null, 'b'), nunki: S(18.921, -26.3, 2.05, N_('Nunki'), 'b'), ascella: S(19.044, -29.88, 2.6, null, 'w'), tauSgr: S(19.115, -27.67, 3.3, null, 'o'), alnasl: S(18.097, -30.42, 2.99, null, 'o'),
  // autumn
  markab: S(23.079, 15.21, 2.49, N_('Markab'), 'b'), scheat: S(23.063, 28.08, 2.42, N_('Scheat'), 'r'), algenib: S(0.22, 15.18, 2.83, null, 'b'), alpheratz: S(0.14, 29.09, 2.06, N_('Alpheratz'), 'b'),
  enif: S(21.736, 9.88, 2.39, null, 'o'), homam: S(22.691, 10.83, 3.4, null, 'b'), matar: S(22.717, 30.22, 2.94, null, 'y'), biham: S(22.17, 6.2, 3.5, null, 'w'),
  mirach: S(1.162, 35.62, 2.05, N_('Mirach'), 'r'), almach: S(2.065, 42.33, 2.1, N_('Almach'), 'o'), deltaand: S(0.655, 30.86, 3.3, null, 'o'), muand: S(0.945, 38.5, 3.9, null, 'w'), nuand: S(0.818, 41.08, 4.5, null, 'b'),
  m31: S(0.712, 41.27, 3.4, N_('Andromeda Galaxy'), 'w'),
  // the southern sky (central Vietnam)
  acrux: S(12.443, -63.1, 0.76, N_('Acrux'), 'b'), mimosa: S(12.795, -59.69, 1.25, N_('Mimosa'), 'b'), gacrux: S(12.519, -57.11, 1.64, N_('Gacrux'), 'r'), imai: S(12.252, -58.75, 2.8, null, 'b'),
  rigilkent: S(14.66, -60.83, -0.01, N_('Alpha Centauri'), 'y'), hadar: S(14.064, -60.37, 0.61, N_('Hadar (Beta Centauri)'), 'b'),
};

// ------------------------------------------------------------------------------------ the groups
// stars: ids, lines: pairs of ids drawn as the figure. Texts are English source strings (N_); a profile may carry its own.
const G = (id, name, stars, lines, story, tip, extra = {}) => ({ id, name, short: extra.short || null, stars, lines, story, tip, liftLike: extra.liftLike || null });
const chain = (...ids) => ids.slice(1).map((b, i) => [ids[i], b]);

export const GROUPS = [
  G('big-dipper', N_('Big Dipper (Hokuto-shichisei)'), ['dubhe', 'merak', 'phecda', 'megrez', 'alioth', 'mizar', 'alkaid'],
    [...chain('alkaid', 'mizar', 'alioth', 'megrez', 'dubhe', 'merak', 'phecda', 'megrez')],
    N_('Hokuto-shichisei, the seven stars of the north, make a big spoon in the sky. Grandma says it stirs the night soup.'),
    N_('Look north. Follow the two end stars of the cup, Dubhe and Merak, up to the North Star.'), { short: N_('Big Dipper') }),
  G('little-dipper', N_('Little Dipper and the North Star'), ['polaris', 'yildun', 'epsumi', 'zetumi', 'etaumi', 'kochab', 'pherkad'],
    [...chain('polaris', 'yildun', 'epsumi', 'zetumi'), ...chain('zetumi', 'etaumi', 'pherkad', 'kochab', 'zetumi')],
    N_('A small spoon that hangs from the North Star. Polaris hardly moves, so travellers always knew which way was north.'),
    N_('Find the Big Dipper first, then follow the line from its cup edge to the North Star at the end of the little handle.'), { short: N_('Little Dipper') }),
  G('cassiopeia', N_('Cassiopeia (the W)'), ['caph', 'schedar', 'navi', 'ruchbah', 'segin'], chain('caph', 'schedar', 'navi', 'ruchbah', 'segin'),
    N_('Five stars in a letter W, or an M if you stand on your head. A queen on her throne, waving at the valley all night.'),
    N_('On the other side of the North Star from the Big Dipper, look for a big W or M low in the north.'), { short: N_('Cassiopeia') }),
  G('orion', N_('Orion (Orion-za)'), ['betelgeuse', 'rigel', 'bellatrix', 'saiph', 'alnitak', 'alnilam', 'mintaka', 'meissa'],
    [['meissa', 'betelgeuse'], ['meissa', 'bellatrix'], ['betelgeuse', 'alnitak'], ['bellatrix', 'mintaka'], ...chain('alnitak', 'alnilam', 'mintaka'), ['alnitak', 'saiph'], ['mintaka', 'rigel']],
    N_('Orion the hunter strides across the winter night. His three belt stars are called Mitsuboshi, the Three Stars, in Japan.'),
    N_('Find three stars in a row: the belt. Red Betelgeuse is his shoulder and blue-white Rigel his foot.'), { short: N_('Orion') }),
  G('canis-major', N_('Canis Major and Sirius (Oinu-za)'), ['sirius', 'mirzam', 'muliphein', 'wezen', 'adhara', 'aludra'],
    [['sirius', 'mirzam'], ['sirius', 'muliphein'], ['sirius', 'wezen'], ['wezen', 'adhara'], ['wezen', 'aludra']],
    N_('The Great Dog trots after Orion and carries Sirius, the brightest star in the whole night sky. It twinkles in every colour.'),
    N_("Follow Orion's belt down and to the left: the very bright blue-white star is Sirius."), { short: N_('Canis Major') }),
  G('gemini', N_('Gemini, the Twins (Futago-za)'), ['castor', 'pollux', 'mebsuta', 'tejat', 'propus', 'wasat', 'alhena'],
    [['castor', 'pollux'], ...chain('castor', 'mebsuta', 'tejat', 'propus'), ...chain('pollux', 'wasat', 'alhena')],
    N_('Castor and Pollux are two friends who go everywhere together. Their bright heads shine side by side.'),
    N_('Above and to the left of Orion, look for two bright stars side by side: Castor and Pollux.'), { short: N_('Gemini') }),
  G('taurus', N_('Taurus and the Pleiades (Subaru)'), ['aldebaran', 'elnath', 'zetatau', 'ain', 'theta2tau', 'gammatau', 'lambdatau', 'alcyone', 'atlas', 'electra', 'maia', 'merope', 'taygeta'],
    [['elnath', 'aldebaran'], ['zetatau', 'aldebaran'], ['aldebaran', 'theta2tau'], ['theta2tau', 'gammatau'], ['gammatau', 'lambdatau'], ['theta2tau', 'ain'],
      ['alcyone', 'atlas'], ['alcyone', 'merope'], ['alcyone', 'maia'], ['maia', 'electra'], ['maia', 'taygeta']],
    N_('Taurus the Bull has a glowing orange eye, Aldebaran. On his shoulder twinkle the Pleiades, called Subaru in Japan: a little bunch of blue stars.'),
    N_("Follow Orion's belt up and to the right to orange Aldebaran, then keep going to the tiny sparkly cluster."), { short: N_('Taurus') }),
  G('leo', N_('Leo, the Lion (Shishi-za)'), ['regulus', 'etaleo', 'algieba', 'adhafera', 'rasalas', 'epsleo', 'zosma', 'chertan', 'denebola'],
    [...chain('regulus', 'etaleo', 'algieba', 'adhafera', 'rasalas', 'epsleo'), ['regulus', 'chertan'], ['chertan', 'denebola'], ['denebola', 'zosma'], ['zosma', 'algieba'], ['zosma', 'chertan']],
    N_('A great lion lies on the spring sky with a backwards question mark for a mane. Its bright heart is Regulus.'),
    N_('Spot the backwards question mark, the Sickle. The dot at the bottom is the bright star Regulus.'), { short: N_('Leo') }),
  G('virgo', N_('Virgo and Spica (Otome-za)'), ['spica', 'porrima', 'vindemiatrix', 'zavijava', 'heze', 'minelauva', 'syrma'],
    [['porrima', 'spica'], ['porrima', 'minelauva'], ['minelauva', 'vindemiatrix'], ['porrima', 'zavijava'], ['porrima', 'heze'], ['heze', 'syrma']],
    N_('The Maiden holds an ear of wheat. Its bright tip is Spica, which sailors in Japan called the Pearl Star, Shinju-boshi.'),
    N_("Follow the curve of the Big Dipper's handle down past orange Arcturus to blue-white Spica."), { short: N_('Virgo') }),
  G('spring-triangle', N_('Spring Triangle (Haru no Daisankaku)'), ['arcturus', 'spica', 'denebola'], [['arcturus', 'spica'], ['spica', 'denebola'], ['denebola', 'arcturus']],
    N_('Three bright stars make a big triangle: orange Arcturus, blue-white Spica and Denebola, the lion\'s tail. A spring signpost.'),
    N_("Find orange Arcturus and Spica first, then Denebola, the lion's tail, to finish the triangle."), { short: N_('Spring Triangle') }),
  G('scorpius', N_('Scorpius, the Scorpion (Sasori-za)'), ['antares', 'graffias', 'dschubba', 'piSco', 'sigmaSco', 'tauSco', 'epsSco', 'muSco', 'zetaSco', 'etaSco', 'sargas', 'iotaSco', 'kappaSco', 'shaula', 'lesath'],
    [['graffias', 'dschubba'], ['dschubba', 'piSco'], ['dschubba', 'sigmaSco'], ...chain('sigmaSco', 'antares', 'tauSco', 'epsSco', 'muSco', 'zetaSco', 'etaSco', 'sargas', 'iotaSco', 'kappaSco', 'shaula'), ['shaula', 'lesath'], ['lesath', 'kappaSco']],
    N_('A scorpion curled up low in the summer south, with red Antares for its heart. In Japan its curly tail is the Fishhook.'),
    N_('Look low in the south for a reddish star, Antares, then follow the curly tail like a fishhook.'), { short: N_('Scorpius') }),
  G('summer-triangle', N_('Summer Triangle (Tanabata: Orihime and Hikoboshi)'), ['vega', 'altair', 'deneb'], [['vega', 'altair'], ['altair', 'deneb'], ['deneb', 'vega']],
    N_('Orihime the weaver (Vega) and Hikoboshi the cowherd (Altair) live on two sides of the Milky Way river. On Tanabata they wave across it, and everybody makes a wish.'),
    N_('High in the east in summer, the brightest star is Vega. Altair is below it and Deneb to the side: join the three.'), { short: N_('Summer Triangle') }),
  G('lyra', N_('Lyra, the Harp (Koto-za)'), ['vega', 'zetalyr', 'deltalyr', 'sheliak', 'sulafat'], [['vega', 'zetalyr'], ['vega', 'deltalyr'], ['zetalyr', 'deltalyr'], ['deltalyr', 'sulafat'], ['sulafat', 'sheliak'], ['sheliak', 'zetalyr']],
    N_('A tiny harp, with Vega, Orihime the weaver, shining like a diamond at one corner.'),
    N_('Find brilliant Vega, then look for the small tilted square of four stars right beside it.'), { short: N_('Lyra') }),
  G('cygnus', N_('Cygnus, the Swan (Hakucho-za)'), ['deneb', 'sadr', 'albireo', 'gienah', 'deltacyg'], [['deneb', 'sadr'], ['sadr', 'albireo'], ['deltacyg', 'sadr'], ['sadr', 'gienah']],
    N_('A swan flies down the Milky Way with its wings wide. Some people see a cross. Deneb is its tail, and Albireo, its beak, is a golden-and-blue double star.'),
    N_('From Deneb, follow the long body to Albireo. The crosswise stars are the wings.'), { short: N_('Cygnus') }),
  G('aquila', N_('Aquila, the Eagle (Washi-za)'), ['altair', 'tarazed', 'alshain', 'deltaaql', 'thetaaql', 'zetaaql', 'lambdaaql'],
    [['tarazed', 'altair'], ['altair', 'alshain'], ['altair', 'deltaaql'], ['deltaaql', 'lambdaaql'], ['zetaaql', 'tarazed'], ['alshain', 'thetaaql']],
    N_('An eagle soars along the Milky Way. Altair, called Hikoboshi in Japan, shines in its chest with a smaller star on each side.'),
    N_('Look for a bright star with a fainter one on each side in a short line: that is Altair and its two friends.'), { short: N_('Aquila') }),
  G('sagittarius', N_('Sagittarius, the Teapot (Ite-za)'), ['kausAus', 'kausMed', 'kausBor', 'phiSgr', 'nunki', 'ascella', 'tauSgr', 'alnasl'],
    [['kausBor', 'phiSgr'], ['phiSgr', 'nunki'], ['nunki', 'tauSgr'], ['tauSgr', 'ascella'], ['ascella', 'kausAus'], ['kausAus', 'kausMed'], ['kausMed', 'kausBor'], ['alnasl', 'kausMed'], ['alnasl', 'kausAus']],
    N_('The Archer looks like a teapot, and its steam is the Milky Way. Grandma says that is the tea of the stars.'),
    N_('Look low in the south, left of Scorpius, for eight stars like a teapot with its spout on the right.'), { short: N_('Sagittarius') }),
  G('pegasus', N_('Pegasus and the Autumn Square (Aki no Shikaku)'), ['markab', 'scheat', 'alpheratz', 'algenib', 'enif', 'homam', 'biham', 'matar'],
    [...chain('markab', 'scheat', 'alpheratz', 'algenib', 'markab'), ...chain('markab', 'homam', 'biham', 'enif'), ['scheat', 'matar']],
    N_('Pegasus the flying horse carries a giant square across the autumn sky: four stars, four corners and lots of empty space inside.'),
    N_('Look high in the south-east for a big square of four stars with hardly anything inside it.'), { short: N_('Pegasus') }),
  G('andromeda', N_('Andromeda and her Galaxy'), ['alpheratz', 'deltaand', 'mirach', 'almach', 'muand', 'nuand', 'm31'],
    [['alpheratz', 'deltaand'], ['deltaand', 'mirach'], ['mirach', 'almach'], ['mirach', 'muand'], ['muand', 'nuand'], ['nuand', 'm31']],
    N_('A princess of the stars reaches out from a corner of the Autumn Square. Near her glows a faint smudge: the Andromeda Galaxy, a whole island of stars.'),
    N_('From the corner of the Autumn Square, follow a gentle line of stars. On a dark night the faint blur is the galaxy.'), { short: N_('Andromeda') }),
  G('auriga', N_('Auriga and Capella (Gosha-za)'), ['capella', 'menkalinan', 'mahasim', 'elnath', 'hassaleh'], chain('capella', 'menkalinan', 'mahasim', 'elnath', 'hassaleh', 'capella'),
    N_('Capella, the "little goat" star, is the brightest of five stars that make a big pentagon.'),
    N_('High in the winter sky, north of Orion, look for a yellow star as bright as Vega: Capella.'), { short: N_('Auriga') }),
  G('perseus', N_('Perseus and the Winking Star'), ['mirfak', 'algol', 'zetaper', 'epsper', 'deltaper', 'gammaper', 'etaper'],
    [['etaper', 'gammaper'], ['gammaper', 'mirfak'], ['mirfak', 'deltaper'], ['mirfak', 'epsper'], ['epsper', 'zetaper'], ['mirfak', 'algol']],
    N_('A hero strides between Cassiopeia and Auriga. His star Algol winks: every three days it dims, then brightens, as if blinking at you.'),
    N_("Between Cassiopeia's W and the Pleiades, find a long curve of stars. Algol is near the bottom of it."), { short: N_('Perseus') }),
  G('crux', N_('Southern Cross (Minami-jujisei)'), ['acrux', 'mimosa', 'gacrux', 'imai'], [['gacrux', 'acrux'], ['mimosa', 'imai']],
    N_('Four bright stars make a little cross in the far south. Sailors used it to find south. You can only see it from places near the equator.'),
    N_('On spring evenings look low in the south from an open place like the viaduct. The two bright Pointers, Alpha and Beta Centauri, aim at the cross.'), { short: N_('Southern Cross') }),
  G('centaurus', N_('The Pointers (Alpha and Beta Centauri)'), ['rigilkent', 'hadar'], [['rigilkent', 'hadar']],
    N_('Two bright stars like two pointing fingers. Alpha Centauri is the nearest star neighbour of our Sun.'),
    N_('Right beside the Southern Cross, look for two bright stars standing close together.'), { short: N_('The Pointers'), liftLike: 'crux' }),
];
export const GROUP = Object.fromEntries(GROUPS.map(g => [g.id, g]));

// ------------------------------------------------------------------------------------ astronomy
const RAD = Math.PI / 180;
/** Local sidereal time in hours for a season's evening sky at a clock hour (0..24, after midnight counts as late). */
export function lstFor(season, hour) {
  const h = hour < 12 ? hour + 24 : hour;
  return ((LST21[season] ?? LST21.spring) + (h - 21) * 1.0027 + 48) % 24;
}
/** Altitude and azimuth (degrees; azimuth from north through east) of a point seen from latitude `lat` at sidereal time `lst`. */
export function horizontal(raH, decDeg, lstH, lat) {
  const H = (lstH - raH) * 15 * RAD, d = decDeg * RAD, f = lat * RAD;
  const sa = Math.sin(d) * Math.sin(f) + Math.cos(d) * Math.cos(f) * Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sa)));
  const az = Math.atan2(-Math.cos(d) * Math.sin(H), Math.sin(d) * Math.cos(f) - Math.cos(d) * Math.sin(f) * Math.cos(H));
  return { alt: alt / RAD, az: ((az / RAD) + 360) % 360 };
}
/** World direction (x east, y up, z south: so north is -z) of a horizontal position in degrees. */
export function worldDir(altDeg, azDeg, out = [0, 0, 0]) {
  const a = altDeg * RAD, z = azDeg * RAD, c = Math.cos(a);
  out[0] = Math.sin(z) * c; out[1] = Math.sin(a); out[2] = -Math.cos(z) * c;
  return out;
}
const unit = (ra, dec) => { const a = ra * 15 * RAD, d = dec * RAD; return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]; };
/** Angular distance in degrees between two stars (ids). */
export function sep(a, b) {
  const p = unit(STARS[a].ra, STARS[a].dec), q = unit(STARS[b].ra, STARS[b].dec);
  return Math.acos(Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]))) / RAD;
}
/** The middle of a group as { ra h, dec deg } (the mean of its star directions). */
export function centreOf(g) {
  const s = [0, 0, 0];
  for (const id of g.stars) { const u = unit(STARS[id].ra, STARS[id].dec); s[0] += u[0]; s[1] += u[1]; s[2] += u[2]; }
  const l = Math.hypot(...s);
  return { ra: ((Math.atan2(s[1], s[0]) / RAD / 15) + 24) % 24, dec: Math.asin(s[2] / l) / RAD };
}
const maxAltOf = (dec, lat) => 90 - Math.abs(lat - dec);

/** Where a group is in the evening sky: { alt, az of its middle, up }. A group is up when its middle clears the
 *  profile's minimum and most of its stars are above the horizon. */
export function groupInfo(g, season, hour, profile = PROFILES.jp) {
  const c = centreOf(g), lst = lstFor(season, hour), m = horizontal(c.ra, c.dec, lst, profile.lat);
  let above = 0;
  for (const id of g.stars) if (horizontal(STARS[id].ra, STARS[id].dec, lst, profile.lat).alt >= 3) above++;
  return { id: g.id, group: g, alt: m.alt, az: m.az, up: m.alt >= profile.minAlt && above >= g.stars.length * 0.6 };
}
// how striking a group is: every star's brightness (the very brightest counted as magnitude 0, so Sirius does not win alone)
const brightness = g => g.stars.reduce((s, id) => s + Math.pow(10, -0.4 * Math.max(0, STARS[id].mag)), 0);
/** A group a child finds easily: three stars of 2.9 or brighter (or a pair of bright ones). */
export function isEasy(g) {
  const m = g.stars.map(id => STARS[id].mag).sort((a, b) => a - b);
  return m.length >= 3 ? m[2] <= 2.9 : m.every(v => v <= 1.5);
}
/** Is the group seen at all from this profile (it clears the minimum altitude at its best)? */
export const inProfile = (g, profile) => maxAltOf(centreOf(g).dec, profile.lat) >= profile.minAlt + 3;
export const groupsFor = profile => GROUPS.filter(g => inProfile(g, profile));
/** The seasons whose evening (21:00) sky holds the group well: at least 60 per cent of its best altitude. */
export function seasonsOf(g, profile = PROFILES.jp) {
  const best = maxAltOf(centreOf(g).dec, profile.lat);
  const at = hour => SEASONS.filter(s => { const i = groupInfo(g, s, hour, profile); return i.up && i.alt >= best * 0.6; });
  return at(21).length ? at(21) : at(23);
}
/** The groups above the horizon, the most striking first. easy: only the ones a child sees at dusk. */
export function groupsUp(season, hour, profile = PROFILES.jp, easyOnly = false) {
  return groupsFor(profile).filter(g => !easyOnly || isEasy(g)).map(g => groupInfo(g, season, hour, profile)).filter(i => i.up)
    .sort((a, b) => (brightness(b.group) * (1 + (profile.boost[b.id] || 0))) - (brightness(a.group) * (1 + (profile.boost[a.id] || 0))));
}

// ------------------------------------------------------------------------------------ words (language profile)
/** { name, short, story, tip } of a group in a profile; `t` translates an English source string (tx). */
export function textOf(g, profile, t = s => s) {
  const o = profile.text?.[g.id];
  const name = o?.name ?? t(g.name);
  return { name, short: o?.short ?? (g.short ? t(g.short) : name), story: o?.story ?? t(g.story), tip: o?.tip ?? t(g.tip) };
}
export function starName(id, profile, t = s => s) {
  const n = profile.starNames?.[id] ?? (STARS[id].name ? t(STARS[id].name) : null);
  return n;
}
/** The apparent magnitude as the profile's sky shows it (the North Star is hazier low in the sky). */
export const magIn = (id, profile) => STARS[id].mag + (profile.dim?.[id] || 0);

/** A figure as flat points for a picture: x right, y up, about -1..1, drawn the way the sky looks facing it (north up). */
export function shapeOf(g) {
  const s = [0, 0, 0], us = g.stars.map(id => unit(STARS[id].ra, STARS[id].dec));
  for (const u of us) { s[0] += u[0]; s[1] += u[1]; s[2] += u[2]; }
  const l = Math.hypot(...s), c = s.map(v => v / l);
  let up = [-c[2] * c[0], -c[2] * c[1], 1 - c[2] * c[2]];
  const ul = Math.hypot(...up);
  up = ul < 1e-6 ? [0, 1, 0] : up.map(v => v / ul);
  const right = [c[1] * up[2] - c[2] * up[1], c[2] * up[0] - c[0] * up[2], c[0] * up[1] - c[1] * up[0]];   // c x up
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const pts = us.map((u, i) => { const k = dot(u, c); return { id: g.stars[i], x: dot(u, right) / k, y: dot(u, up) / k }; });
  // facing the sky east is on the left: the cross product above gives the west side as "right"
  const r = Math.max(...pts.map(p => Math.hypot(p.x, p.y)), 1e-6);
  const idx = Object.fromEntries(pts.map((p, i) => [p.id, i]));
  return { points: pts.map(p => ({ id: p.id, x: p.x / r, y: p.y / r, mag: STARS[p.id].mag })), lines: g.lines.map(([a, b]) => [idx[a], idx[b]]) };
}

/** A small SVG picture of a group (learned: figure and stars; not yet: the stars only, dim). */
export function shapeSvg(g, learned = true, size = 72) {
  const sh = shapeOf(g), P = p => `${(50 + p.x * 40).toFixed(1)},${(50 - p.y * 40).toFixed(1)}`;
  const lines = learned ? sh.lines.map(([a, b]) => `<line x1="${P(sh.points[a]).split(',')[0]}" y1="${P(sh.points[a]).split(',')[1]}" x2="${P(sh.points[b]).split(',')[0]}" y2="${P(sh.points[b]).split(',')[1]}"/>`).join('') : '';
  const dots = sh.points.map(p => { const [x, y] = P(p).split(','); return `<circle cx="${x}" cy="${y}" r="${Math.max(1.6, 4.2 - p.mag * 0.7).toFixed(1)}"/>`; }).join('');
  return `<svg class="sgshape${learned ? '' : ' dim'}" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><g stroke="#ffd76a" stroke-width="2" stroke-linecap="round" opacity=".85">${lines}</g><g fill="${learned ? '#fff4d0' : '#8a93b8'}">${dots}</g></svg>`;
}

// ------------------------------------------------------------------------------------ learning (the save: starGroups.learned)
/** A clean save record: { learned: [known group ids, once each] }. */
export function cleanStarGroups(v) {
  const list = Array.isArray(v?.learned) ? v.learned : [];
  return { learned: [...new Set(list.filter(id => typeof id === 'string' && GROUP[id]))] };
}
/** Mark a group learned; true when it is new. */
export function learnGroup(rec, id) {
  if (!GROUP[id] || rec.learned.includes(id)) return false;
  rec.learned.push(id);
  return true;
}

/** The English-keyed lines about tonight: up to three striking groups in the evening sky of a season. */
export function tonightGroups(season, profile = PROFILES.jp) {
  return groupsUp(season, 21, profile, true).slice(0, 3).map(i => i.group);
}

// ------------------------------------------------------------------------------------ the Big Dipper for the Stargazing trick
/**
 * The seven Dipper stars and Polaris as a flat patch for game/tricks/stars.js: degrees, u right and v up, in an
 * azimuthal-equidistant picture around Dubhe with Polaris straight above it, then drawn at 0.75 of the real size and
 * placed with Dubhe at (1.6, 0) (the trick's own framing). Merak -> Dubhe, five times over, reaches Polaris.
 */
export function dipperPatch() {
  const ids = ['alkaid', 'mizar', 'alioth', 'megrez', 'phecda', 'merak', 'dubhe', 'polaris'];
  const o = unit(STARS.dubhe.ra, STARS.dubhe.dec), north = unit(STARS.polaris.ra, STARS.polaris.dec);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nrm = a => { const l = Math.hypot(...a); return a.map(v => v / l); };
  const y = nrm(north.map((v, i) => v - dot(north, o) * o[i])), x = cross(o, y);       // x: to the right when Polaris is up
  const out = {};
  for (const id of ids) {
    const p = unit(STARS[id].ra, STARS[id].dec), dist = Math.acos(Math.max(-1, Math.min(1, dot(p, o)))) / RAD;
    const q = p.map((v, i) => v - dot(p, o) * o[i]), ql = Math.hypot(...q) || 1;
    // seen from inside the sky the handle trails to the left, as in the trick's picture
    out[id] = [1.6 + 0.75 * dist * dot(q, x) / ql, 0.75 * dist * dot(q, y) / ql];
  }
  return out;
}
