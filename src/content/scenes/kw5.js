// © 2026 Bui Cong Nguyen · solluxlabs.com
// "Grandma and grandchild" at Granny Tsuru's: folding paper cranes, the shrine bell (docs/TRAVEL-LANGUAGE-PLAN.md §5.1).
// Yui (kw3) comes over every afternoon: Granny Tsuru is everyone's grandmother on this street.
export default [{
  id: 'kw5.cranes', house: 'kw5',
  title: { en: 'Paper cranes with Granny', vi: 'Gấp hạc giấy với bà', ko: '할머니와 종이학', ja: 'おばあちゃんと折り鶴' },
  hint: { en: 'Folding cranes', vi: 'Đang gấp hạc', ko: '종이학 접는 중', ja: '鶴を折っているよ' },
  when: { hour: [7, 18] },
  cast: { v18: 'Seat_1', v20: 'Seat_2' },
  props: 'Var_scene_cranes',
  lines: [
    { who: 'v18', cam: 0, en: 'Come in, come in. Yui and I are folding paper cranes.', ko: '어서 들어오렴. 유이랑 종이학을 접고 있었단다.', vi: 'Vào đi cháu, vào đi. Bà với Yui đang gấp hạc giấy.', ja: 'さあ、入って入って。ユイと折り鶴を折っていたのよ。', gesture: 'Wave' },
    { who: 'v20', cam: 1, en: 'Look, Mika! Mine has a crooked neck.', ko: '미카, 이거 봐! 내 학은 목이 삐뚤어.', vi: 'Chị Mika nhìn này! Con hạc của em bị cong cổ.', ja: 'ミカ、見て！わたしの鶴、首が曲がってる。' },
    { who: 'v18', cam: 0, en: 'A crooked neck is fine. It can look both ways.', ko: '목이 삐뚤어도 괜찮아. 양쪽을 다 볼 수 있잖니.', vi: 'Cổ cong cũng không sao. Nó nhìn được cả hai phía.', ja: '首が曲がっててもいいのよ。両方見られるもの。' },
    { who: 'mika', cam: 2, en: 'How do you fold the wings, Granny?', ko: '할머니, 날개는 어떻게 접어요?', vi: 'Bà ơi, gấp cánh thế nào ạ?', ja: 'おばあちゃん、羽はどうやって折るの？',
      chips: { en: [['How do you', 'how-do-you']], ko: [['어떻게 접어요?', 'how-do-you']], vi: [['thế nào ạ?', 'how-do-you']] } },
    { who: 'v18', cam: 0, en: 'Slowly. Fold, press, and fold again. Like this.', ko: '천천히. 접고, 누르고, 다시 접고. 이렇게.', vi: 'Từ từ thôi. Gấp, miết, rồi gấp lại. Thế này này.', ja: 'ゆっくりね。折って、押さえて、また折る。こうよ。',
      chips: { en: [['Slowly', 'slowly']], ko: [['천천히', 'slowly']], vi: [['Từ từ thôi', 'slowly']] } },
    { who: 'v20', cam: 1, en: 'Granny says a thousand cranes make a wish come true.', ko: '학을 천 마리 접으면 소원이 이루어진대.', vi: 'Bà bảo gấp đủ một nghìn con hạc thì được một điều ước.', ja: '千羽折ると願いがかなうんだって。' },
    { who: 'mika', cam: 2, en: 'A thousand? We only have three!', ko: '천 마리? 우린 세 마리밖에 없어!', vi: 'Một nghìn con á? Mình mới có ba con thôi!', ja: '千羽？まだ三羽だよ！' },
    { who: 'v18', cam: 0, en: 'Then only nine hundred and ninety-seven to go. Tea first?', ko: '그럼 구백구십칠 마리 남았네. 차부터 마실까?', vi: 'Vậy còn chín trăm chín mươi bảy con nữa. Uống trà trước nhé?', ja: 'じゃあ、あと九百九十七羽ね。まずはお茶にしようか。' },
    { who: 'v20', cam: 1, en: 'Yes, please! Thank you, Granny.', ko: '네, 좋아요! 고마워요, 할머니.', vi: 'Dạ vâng ạ! Cháu cảm ơn bà ạ.', ja: 'うん、飲みたい！ありがとう、おばあちゃん。', gesture: 'Cheer',
      chips: { en: [['Thank you, Granny', 'thanks-granny']], ko: [['고마워요, 할머니', 'thanks-granny']], vi: [['Cháu cảm ơn bà ạ', 'thanks-granny']] } },
    { who: 'v18', cam: 0, en: 'Listen… the shrine bell. Time for tea.', ko: '들어 보렴… 신사 종소리야. 차 마실 시간이구나.', vi: 'Nghe kìa… tiếng chuông đền. Đến giờ uống trà rồi.', ja: 'ほら……神社の鐘よ。お茶の時間ね。' },
  ],
  recall: [
    { q: { en: 'How did Mika ask Granny about the wings?', vi: 'Mika hỏi bà về cánh hạc thế nào?', ko: '미카는 날개 접는 법을 어떻게 물어봤을까요?', ja: 'ミカは羽の折り方をどう聞いた？' }, answer: 3, decoys: [1, 6] },
    { q: { en: 'How did Yui thank Granny?', vi: 'Yui cảm ơn bà thế nào?', ko: '유이는 할머니께 어떻게 고맙다고 했을까요?', ja: 'ユイはおばあちゃんにどうお礼を言った？' }, answer: 8, decoys: [2, 9] },
  ],
  review: { en: 'ok', ko: 'draft', vi: 'draft', ja: 'draft' },
}];
