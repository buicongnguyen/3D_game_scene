// © 2026 Bui Cong Nguyen · solluxlabs.com
// "Which way?" at Hoshi Station: two sisters on a trip ask Mika the way (game/station-visitors.js). Vita, a cosplayer
// come early for the summer festival (her suit is her costume), and her little sister Bibi, who pulls her toward
// everything. They do not speak Japanese: Vita asks Mika in English, the travellers' language (`say: 'en'`: that line is
// voiced in English whatever language the player is learning; its other texts are the meaning). Everything else is
// heard in the language being learned, like the homes' scenes. Outdoor: `place` instead of a house, no seats or room
// cameras (the runner frames the shots).
export default [{
  id: 'station.which', place: 'station',
  title: { en: 'Which way?', vi: 'Đi lối nào?', ko: '어느 쪽이에요?', ja: 'どっちに行けばいい？' },
  hint: { en: 'Two travellers', vi: 'Hai du khách', ko: '여행 온 자매', ja: '旅行中の姉妹' },
  when: { hour: [7, 17] },
  cast: { vita: 'stand', bibi: 'stand' },
  lines: [
    { who: 'bibi', cam: 1, gesture: 'Point', en: 'Sister, look! The train is so shiny! Take my picture!', ko: '언니, 봐! 기차 너무 반짝여! 사진 찍어 줘!',
      vi: 'Chị ơi, nhìn kìa! Tàu sáng bóng quá! Chụp ảnh cho em đi!', ja: 'お姉ちゃん、見て！電車ピカピカ！写真とって！' },
    { who: 'vita', cam: 1, en: "Smile! … Now, which way is the shrine? I can't read the signs.", ko: '웃어! … 자, 신사는 어느 쪽이지? 표지판을 못 읽겠어.',
      vi: 'Cười nào! … Đền đi lối nào nhỉ? Chị không đọc được biển.', ja: 'はい、笑って！……で、神社はどっち？看板が読めないな。',
      chips: { en: [['which way', 'which-way']], ko: [['어느 쪽', 'which-way']], vi: [['đi lối nào', 'which-way']] } },
    { who: 'bibi', cam: 1, en: 'Ask her! You can say it in English!', ko: '저 언니한테 물어봐! 영어로 하면 되잖아!',
      vi: 'Hỏi chị kia đi! Chị nói tiếng Anh được mà!', ja: 'あのお姉さんに聞いてみて！英語で言えばいいよ！' },
    { who: 'vita', say: 'en', cam: 0, en: 'Excuse me, which way to the shrine?', ko: '실례합니다, 신사는 어느 쪽이에요?',
      vi: 'Xin lỗi, cho hỏi đền đi lối nào ạ?', ja: 'すみません、神社はどちらですか？',
      chips: { en: [['Excuse me', 'excuse-me'], ['which way', 'which-way']] } },
    { who: 'mika', cam: 2, gesture: 'Point', en: 'The shrine? Over the river and up the stone steps. Follow the road!', ko: '신사요? 강 건너 돌계단 위예요. 길 따라가세요!',
      vi: 'Đền ạ? Qua sông rồi leo bậc đá. Cứ đi theo đường này!', ja: '神社？川をわたって石段の上だよ。道なりに行ってね！' },
    { who: 'bibi', cam: 1, en: 'Excuse me! Is the festival there too?', ko: '저기요! 축제도 거기서 해요?',
      vi: 'Chị ơi, cho em hỏi! Lễ hội cũng ở đó ạ?', ja: 'すみません！お祭りもそこでやるの？',
      chips: { en: [['Excuse me', 'excuse-me']], ko: [['저기요', 'excuse-me']], vi: [['cho em hỏi', 'excuse-me']] } },
    { who: 'mika', cam: 2, en: 'Yes! Lanterns and stalls tonight. Is that a costume?', ko: '네! 오늘 밤 등불이랑 노점이 있어요. 그거 의상이에요?',
      vi: 'Đúng rồi! Tối nay có đèn lồng và hàng quán. Đó là trang phục à?', ja: 'うん！今夜は提灯と屋台があるよ。それ、衣装？' },
    { who: 'vita', say: 'en', cam: 1, gesture: 'Cheer', en: "Yes! It's my costume for the summer festival. I'm a cosplayer!", ko: '네! 여름 축제 의상이에요. 저 코스플레이어예요!',
      vi: 'Đúng vậy! Đây là trang phục lễ hội mùa hè. Chị là cosplayer!', ja: 'うん！夏祭りの衣装なの。コスプレイヤーなんだ！' },
    { who: 'bibi', cam: 1, gesture: 'Bow', en: 'She made it herself! Thank you so much!', ko: '언니가 직접 만들었어요! 정말 고마워요!',
      vi: 'Chị em tự may đấy! Cảm ơn chị nhiều ạ!', ja: 'お姉ちゃんの手作りなの！ありがとう！',
      chips: { en: [['Thank you', 'thank-you']], ko: [['고마워요', 'thank-you']], vi: [['Cảm ơn chị', 'thank-you']] } },
    { who: 'mika', cam: 0, gesture: 'Wave', en: 'Have a nice trip! See you at the festival!', ko: '즐거운 여행 되세요! 축제에서 만나요!',
      vi: 'Chúc hai chị em đi chơi vui vẻ! Hẹn gặp ở lễ hội nhé!', ja: 'よい旅を！お祭りで会おうね！',
      chips: { en: [['Have a nice trip', 'nice-trip']], ko: [['즐거운 여행 되세요', 'nice-trip']], vi: [['đi chơi vui vẻ', 'nice-trip']] } },
  ],
  // asked by Tamo the next time Mika meets the sisters on a later day (game/station-visitors.js)
  recall: [
    { q: { en: 'How did Mika wish the sisters a good trip?', vi: 'Mika chúc hai chị em thế nào?', ko: '미카는 자매에게 어떻게 인사했을까요?', ja: 'ミカは姉妹に何と言って見送った？' }, answer: 9, decoys: [2, 6] },
    { q: { en: 'How did Bibi say thank you?', vi: 'Bibi cảm ơn thế nào?', ko: '비비는 고맙다고 어떻게 말했을까요?', ja: 'ビビはどうやってお礼を言った？' }, answer: 8, decoys: [0, 5] },
  ],
  review: { en: 'ok', ko: 'draft', vi: 'draft', ja: 'draft' },
}];
