// "Supper at the Nakanos'" (docs/TRAVEL-LANGUAGE-PLAN.md §5.3). Scene lines are learning content: each line carries
// its own en/ko/vi/ja text (not UI strings, so scripts/i18n-extract.mjs does not collect them). Korean is a draft until a
// native speaker has read it (`review`).
export default [{
  id: 'kw4.supper', house: 'kw4',
  title: { en: "Supper at the Nakanos'", vi: 'Bữa tối nhà Nakano', ko: '나카노네 저녁 식사', ja: 'ナカノ家の晩ごはん' },
  hint: { en: 'Supper time', vi: 'Giờ ăn tối', ko: '저녁 시간', ja: '晩ごはんの時間' },
  when: { hour: [17, 21.5] },
  cast: { v2: 'Seat_1', v8: 'Seat_2', v10: 'Seat_3', ota: 'Seat_4' },
  props: 'Var_scene_supper',
  lines: [
    { who: 'v2', cam: 0, en: 'Dinner is ready! Wash your hands, everyone.', ko: '저녁 다 됐어요! 다들 손 씻고 오세요.', vi: 'Cơm chín rồi! Cả nhà đi rửa tay nào.', ja: 'ごはんできたよ！みんな手を洗ってきてね。',
      chips: { en: [['Wash your hands', 'wash-hands']], ko: [['손 씻고 오세요', 'wash-hands']], vi: [['rửa tay', 'wash-hands']] } },
    { who: 'v10', cam: 1, en: 'I already did! Well… one hand.', ko: '벌써 씻었어요! 음… 한 손만요.', vi: 'Con rửa rồi mà! À… một tay thôi ạ.', ja: 'もう洗ったよ！……えっと、片手だけ。' },
    { who: 'v8', cam: 2, en: 'Both hands, Daichi. The river is still on them.', ko: '두 손 다 씻어, 다이치. 아직 강 냄새 나.', vi: 'Rửa cả hai tay, Daichi. Tay con vẫn còn mùi sông đấy.', ja: '両手だよ、ダイチ。まだ川のにおいがする。' },
    { who: 'ota', cam: 2, en: 'Thank you for having me. This soup smells wonderful.', ko: '불러 줘서 고마워요. 국 냄새가 참 좋네요.', vi: 'Cảm ơn cháu đã mời ông. Bát canh này thơm quá.', ja: '呼んでくれてありがとう。いいにおいのお味噌汁だね。' },
    { who: 'v2', cam: 0, en: "It's miso soup, with the fish Daichi caught.", ko: '다이치가 잡은 생선으로 끓인 된장국이에요.', vi: 'Canh miso nấu với cá Daichi câu được đấy ạ.', ja: 'ダイチが釣った魚のお味噌汁なんです。' },
    { who: 'v10', cam: 1, en: 'I caught two fish today! The big one was this long!', ko: '오늘 물고기 두 마리 잡았어요! 큰 건 이만했어요!', vi: 'Hôm nay con bắt được hai con cá! Con to dài thế này này!', ja: '今日は魚を二匹とったんだ！大きいのはこーんなに長かったよ！', gesture: 'Cheer' },
    { who: 'v8', cam: 2, en: 'Yesterday it was this long. Fish grow fast in his stories.', ko: '어제는 이만했지. 얘 얘기 속 물고기는 빨리 자라요.', vi: 'Hôm qua nó mới dài thế này. Cá trong chuyện của nó lớn nhanh lắm.', ja: '昨日はこのくらいだったな。この子の話だと魚がすぐ大きくなる。' },
    { who: 'v10', cam: 0, en: 'Thank you for the food! Let\'s eat!', ko: '잘 먹겠습니다!', vi: 'Con mời ông ăn cơm, mời bố mẹ ăn cơm, mời chị Mika ăn cơm ạ!', ja: 'いただきます！',
      chips: { en: [['Thank you for the food!', 'before-meal']], ko: [['잘 먹겠습니다', 'before-meal']], vi: [['mời ông ăn cơm', 'before-meal']] } },
    { who: 'v2', cam: 0, en: 'Mika, shall I give you some rice?', ko: '미카, 밥 좀 줄까?', vi: 'Mika ơi, cô xới cơm cho cháu nhé?', ja: 'ミカちゃん、ごはんよそおうか？' },
    { who: 'mika', cam: 0, en: 'Yes, please. Just a little.', ko: '네, 조금만 주세요.', vi: 'Dạ, cháu xin ạ. Một ít thôi ạ.', ja: 'はい、お願いします。少しだけ。',
      chips: { en: [['Just a little', 'just-a-little']], ko: [['조금만 주세요', 'just-a-little']], vi: [['Một ít thôi ạ', 'just-a-little']] } },
    { who: 'v10', cam: 1, en: 'Mum, can I have more rice?', ko: '엄마, 밥 더 먹어도 돼요?', vi: 'Mẹ ơi, con ăn thêm cơm được không ạ?', ja: 'お母さん、ごはんおかわりしてもいい？',
      chips: { en: [['can I have more', 'more']], ko: [['더 먹어도 돼요?', 'more']], vi: [['ăn thêm cơm được không ạ?', 'more']] } },
    { who: 'v2', cam: 0, en: 'Of course. Eat well!', ko: '그럼. 많이 먹어!', vi: 'Được chứ. Ăn nhiều vào con nhé!', ja: 'もちろん。たくさん食べてね！' },
  ],
  recall: [
    { q: { en: 'What did Daichi say before eating?', vi: 'Daichi nói gì trước khi ăn?', ko: '다이치는 밥 먹기 전에 뭐라고 했을까요?', ja: 'ダイチは食べる前に何と言った？' }, answer: 7, decoys: [1, 11] },
    { q: { en: 'How did Mika ask for only a little?', vi: 'Mika xin một ít bằng cách nào?', ko: '미카는 조금만 달라고 어떻게 말했을까요?', ja: 'ミカは「少しだけ」をどう言った？' }, answer: 9, decoys: [2, 10] },
  ],
  review: { en: 'ok', ko: 'draft', vi: 'draft', ja: 'draft' },
}];
