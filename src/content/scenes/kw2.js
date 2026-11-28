// © 2026 Bui Cong Nguyen · solluxlabs.com
// "Shop talk" at Fujita Grocery: prices, asking for something, the shop's goodbye (docs/TRAVEL-LANGUAGE-PLAN.md §5.1).
export default [{
  id: 'kw2.shop', house: 'kw2',
  title: { en: 'Shop talk', vi: 'Chuyện ở cửa hàng', ko: '가게에서', ja: 'お店のおしゃべり' },
  hint: { en: 'Shop talk', vi: 'Chuyện ở cửa hàng', ko: '가게에서', ja: 'お店のおしゃべり' },
  when: { hour: [8, 18] },
  cast: { t1: 'Seat_1', t2: 'Seat_2', v3: 'Seat_3' },
  props: 'Var_scene_shop',
  lines: [
    { who: 't1', cam: 0, en: 'Welcome! Fresh radishes today, straight from the field.', ko: '어서 오세요! 오늘은 밭에서 바로 온 무가 있어요.', vi: 'Mời vào! Hôm nay có củ cải tươi, mới nhổ ngoài ruộng.', ja: 'いらっしゃい！今日は畑からとれたての大根だよ。', gesture: 'Wave' },
    { who: 't2', cam: 1, en: 'Good morning, Mr. Fujita. How much is this radish?', ko: '안녕하세요, 후지타 씨. 이 무 얼마예요?', vi: 'Chào anh Fujita. Củ cải này bao nhiêu tiền?', ja: 'おはよう、藤田さん。この大根はいくら？',
      chips: { en: [['How much is', 'how-much']], ko: [['얼마예요?', 'how-much']], vi: [['bao nhiêu tiền?', 'how-much']] } },
    { who: 't1', cam: 0, en: 'Two coins. For you, two coins and a smile.', ko: '동전 두 개요. 손님은 동전 두 개에 미소 하나요.', vi: 'Hai đồng. Với chị thì hai đồng và một nụ cười.', ja: '二枚だよ。奥さんなら二枚と笑顔ひとつ。' },
    { who: 't2', cam: 1, en: "Ha! Then I'll take two. Here you are.", ko: '하하! 그럼 두 개 주세요. 여기 있어요.', vi: 'Ha! Thế cho chị hai củ. Tiền đây anh.', ja: 'あはは！じゃあ二本ちょうだい。はい、どうぞ。' },
    { who: 'v3', cam: 2, en: 'Mr. Fujita! Do you have any sweets?', ko: '후지타 아저씨! 사탕 있어요?', vi: 'Chú Fujita ơi! Chú có kẹo không ạ?', ja: '藤田のおじさん！あめある？' },
    { who: 't1', cam: 0, en: 'Sweets are next door, Kenta. Here we have carrots.', ko: '사탕은 옆 가게야, 켄타. 여기는 당근이 있지.', vi: 'Kẹo ở cửa hàng bên cạnh, Kenta. Ở đây chú có cà rốt.', ja: 'あめは隣の店だよ、ケンタ。うちはにんじんだ。' },
    { who: 'v3', cam: 2, en: 'Carrots… are they sweet?', ko: '당근은… 달아요?', vi: 'Cà rốt… có ngọt không ạ?', ja: 'にんじんって……あまい？' },
    { who: 't1', cam: 0, en: "Very sweet. Ask Mika, she's a carrot expert.", ko: '아주 달지. 미카한테 물어봐. 당근 박사거든.', vi: 'Ngọt lắm. Hỏi chị Mika đi, chị ấy rành cà rốt lắm.', ja: 'とってもあまいよ。ミカに聞いてごらん、にんじん博士だから。' },
    { who: 'mika', cam: 1, en: "It's true! May I have one carrot, please?", ko: '맞아요! 당근 하나 주세요.', vi: 'Đúng đấy ạ! Chú cho cháu một củ cà rốt nhé.', ja: 'ほんとだよ！にんじん一本ください。',
      chips: { en: [['May I have', 'may-i-have']], ko: [['하나 주세요', 'may-i-have']], vi: [['Chú cho cháu', 'may-i-have']] } },
    { who: 't1', cam: 0, en: 'Here you go. Thank you, come again!', ko: '여기 있어요. 감사합니다, 또 오세요!', vi: 'Đây cháu. Cảm ơn nhé, lần sau lại ghé nhé!', ja: 'はい、どうぞ。ありがとう、またおいで！', gesture: 'Wave',
      chips: { en: [['come again', 'come-again']], ko: [['또 오세요', 'come-again']], vi: [['lần sau lại ghé', 'come-again']] } },
  ],
  recall: [
    { q: { en: 'How did Mrs. Komori ask the price?', vi: 'Bà Komori hỏi giá thế nào?', ko: '코모리 부인은 값을 어떻게 물어봤을까요?', ja: '小森さんはどうやって値段を聞いた？' }, answer: 1, decoys: [3, 6] },
    { q: { en: 'What did Mr. Fujita say when Mika left?', vi: 'Ông Fujita nói gì khi Mika ra về?', ko: '미카가 나갈 때 후지타 씨는 뭐라고 했을까요?', ja: 'ミカが帰るとき、藤田さんは何と言った？' }, answer: 9, decoys: [0, 5] },
  ],
  review: { en: 'ok', ko: 'draft', vi: 'draft', ja: 'draft' },
}];
