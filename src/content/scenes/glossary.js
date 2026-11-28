// © 2026 Bui Cong Nguyen · solluxlabs.com
// Phrase cards for the chips in the house scenes (src/content/scenes/*.js). Per learning language: `say` (the phrase as
// heard), `roman` (Korean romanisation) or `tone` (Vietnamese tone marks spelled out), and per UI language the
// `mean`ing and a short culture `note`. tests/scenes.test.mjs checks every chip id has an entry for its language.
export const GLOSSARY = {
  'wash-hands': {
    en: { say: 'Wash your hands' },
    ko: { say: '손 씻고 오세요', roman: 'son ssitgo oseyo' },
    vi: { say: 'rửa tay', tone: 'rửa (hỏi) · tay (ngang)' },
    mean: { en: 'Go and wash your hands', vi: 'Đi rửa tay đi', ko: '가서 손을 씻으세요', ja: '手を洗ってきて' },
    note: {
      en: 'In Vietnamese, "nào" at the end makes it a friendly nudge, not an order.',
      vi: 'Trong tiếng Hàn, "-고 오세요" nghĩa là "làm xong rồi quay lại".',
      ko: '베트남어에서는 끝에 "nào"를 붙이면 명령이 아니라 다정한 재촉이 돼요.',
      ja: 'ベトナム語では、最後に「nào」をつけると命令ではなく、やさしい声かけになります。',
    },
  },
  'before-meal': {
    en: { say: 'Thank you for the food!' },
    ko: { say: '잘 먹겠습니다', roman: 'jal meokgetseumnida' },
    vi: { say: 'mời … ăn cơm', tone: 'mời (huyền) · ăn (ngang) · cơm (ngang)' },
    mean: { en: 'Words said before a meal', vi: 'Lời nói trước bữa ăn', ko: '식사 전에 하는 말', ja: '食事の前に言うことば' },
    note: {
      en: 'Korean families all say 잘 먹겠습니다 ("I will eat well"). In Vietnam the youngest invites each elder by name. English has no fixed phrase: "Thank you for cooking" or "Let\'s eat".',
      vi: 'Ở Việt Nam, người nhỏ tuổi nhất mời từng người lớn. Người Hàn cùng nói 잘 먹겠습니다 ("cháu sẽ ăn ngon"). Tiếng Anh không có câu cố định.',
      ko: '한국에서는 다 같이 "잘 먹겠습니다"라고 해요. 베트남에서는 가장 어린 사람이 어른을 한 분씩 불러 "mời"라고 권해요. 영어에는 정해진 말이 없어요.',
      ja: '韓国では皆で「잘 먹겠습니다（よく食べます）」と言います。ベトナムでは一番年下の人が年上の人を一人ずつ「mời」と誘います。英語には決まったことばがありません。',
    },
  },
  'just-a-little': {
    en: { say: 'Just a little' },
    ko: { say: '조금만 주세요', roman: 'jogeumman juseyo' },
    vi: { say: 'Một ít thôi ạ', tone: 'một (nặng) · ít (sắc) · thôi (ngang) · ạ (nặng)' },
    mean: { en: 'Only a little, please', vi: 'Chỉ một ít thôi ạ', ko: '조금만 주세요', ja: '少しだけください' },
    note: {
      en: 'Polite and modest. In Vietnamese, "ạ" at the end is how a child speaks to grown-ups.',
      vi: '"ạ" ở cuối câu là cách trẻ con nói lễ phép với người lớn.',
      ko: '베트남어 끝의 "ạ"는 아이가 어른에게 공손하게 말할 때 붙여요.',
      ja: 'ベトナム語の最後の「ạ」は、子どもが大人にていねいに話すときにつけます。',
    },
  },
  more: {
    en: { say: 'Can I have more…?' },
    ko: { say: '더 먹어도 돼요?', roman: 'deo meogeodo dwaeyo?' },
    vi: { say: 'ăn thêm … được không ạ?', tone: 'thêm (ngang) · được (nặng) · không (ngang)' },
    mean: { en: 'Asking for more', vi: 'Xin thêm', ko: '더 달라고 할 때', ja: 'おかわりをたのむ' },
    note: {
      en: 'Korean 돼요? means "is it OK?"; Vietnamese "được không" means "can (I)?".',
      vi: 'Tiếng Hàn 돼요? nghĩa là "có được không?".',
      ko: '베트남어 "được không"은 "해도 돼요?"라는 뜻이에요.',
      ja: '韓国語の「돼요?」は「いい？」、ベトナム語の「được không」は「できる？」という意味です。',
    },
  },
  'how-much': {
    en: { say: 'How much is…?' },
    ko: { say: '얼마예요?', roman: 'eolmayeyo?' },
    vi: { say: 'bao nhiêu tiền?', tone: 'bao (ngang) · nhiêu (ngang) · tiền (huyền)' },
    mean: { en: 'Asking the price', vi: 'Hỏi giá', ko: '값을 물을 때', ja: '値段を聞く' },
    note: {
      en: 'The most useful shop words in any language. Point at the thing and ask.',
      vi: 'Câu hữu ích nhất ở cửa hàng. Chỉ vào món đồ rồi hỏi.',
      ko: '어느 나라에서나 가게에서 제일 쓸모 있는 말이에요. 물건을 가리키며 물어보세요.',
      ja: 'どの国でもお店でいちばん役に立つことば。ものを指さして聞いてみよう。',
    },
  },
  'may-i-have': {
    en: { say: 'May I have…, please?' },
    ko: { say: '… 주세요', roman: '… juseyo' },
    vi: { say: 'Chú cho cháu …', tone: 'cho (ngang) · cháu (sắc)' },
    mean: { en: 'Asking for something politely', vi: 'Xin một thứ một cách lễ phép', ko: '공손하게 달라고 할 때', ja: 'ていねいにたのむ' },
    note: {
      en: 'Korean puts the thing first and 주세요 ("please give") last. Vietnamese starts with who you ask: chú (uncle), cô (auntie).',
      vi: 'Tiếng Hàn nói tên món đồ trước, rồi 주세요 ("xin cho") ở cuối.',
      ko: '베트남어는 부탁하는 사람을 먼저 불러요. chú(아저씨), cô(아주머니).',
      ja: '韓国語はものを先に言って、最後に「주세요（ください）」。ベトナム語はまず相手を呼びます：chú（おじさん）、cô（おばさん）。',
    },
  },
  'come-again': {
    en: { say: 'Come again!' },
    ko: { say: '또 오세요', roman: 'tto oseyo' },
    vi: { say: 'lần sau lại ghé', tone: 'lần (huyền) · lại (nặng) · ghé (sắc)' },
    mean: { en: "A shopkeeper's goodbye", vi: 'Lời chào của người bán hàng', ko: '가게 주인의 작별 인사', ja: 'お店の人のさようなら' },
    note: {
      en: 'Shops say it to every customer. In Korea you often hear 안녕히 가세요 ("go in peace") too.',
      vi: 'Ở Hàn Quốc còn hay nghe 안녕히 가세요 ("đi bình an nhé").',
      ko: '가게에서는 손님마다 이렇게 인사해요.',
      ja: 'お店ではお客さん全員にこう言います。韓国では「안녕히 가세요（お気をつけて）」もよく聞きます。',
    },
  },
  'how-do-you': {
    en: { say: 'How do you…?' },
    ko: { say: '어떻게 … 요?', roman: 'eotteoke … yo?' },
    vi: { say: '… thế nào ạ?', tone: 'thế (sắc) · nào (huyền) · ạ (nặng)' },
    mean: { en: 'Asking how to do something', vi: 'Hỏi cách làm', ko: '하는 방법을 물을 때', ja: 'やり方を聞く' },
    note: {
      en: 'A learner\'s best friend: ask how, then watch.',
      vi: 'Câu hỏi của người học: hỏi cách làm, rồi nhìn theo.',
      ko: '배우는 사람의 단짝 같은 말이에요. 물어보고, 잘 보세요.',
      ja: '学ぶ人のいちばんの味方。聞いて、よく見よう。',
    },
  },
  slowly: {
    en: { say: 'Slowly' },
    ko: { say: '천천히', roman: 'cheoncheonhi' },
    vi: { say: 'Từ từ thôi', tone: 'từ (huyền) · từ (huyền) · thôi (ngang)' },
    mean: { en: 'Slowly, take your time', vi: 'Từ từ, không vội', ko: '천천히, 서두르지 말고', ja: 'ゆっくり、あわてないで' },
    note: {
      en: 'Paper cranes come from Japan. Folding a thousand is said to grant a wish.',
      vi: 'Hạc giấy đến từ Nhật Bản. Người ta nói gấp một nghìn con thì được một điều ước.',
      ko: '종이학은 일본에서 왔어요. 천 마리를 접으면 소원이 이루어진대요.',
      ja: '折り鶴は日本の伝統。千羽折ると願いがかなうと言われます。',
    },
  },
  'thanks-granny': {
    en: { say: 'Thank you, Granny' },
    ko: { say: '고마워요, 할머니', roman: 'gomawoyo, halmeoni' },
    vi: { say: 'Cháu cảm ơn bà ạ', tone: 'cháu (sắc) · cảm (hỏi) · ơn (ngang) · bà (huyền) · ạ (nặng)' },
    mean: { en: 'Thanking an older person', vi: 'Cảm ơn người lớn tuổi', ko: '어른께 고맙다고 할 때', ja: 'お年寄りにお礼を言う' },
    note: {
      en: 'Vietnamese names both people: cháu (grandchild) thanks bà (grandma). Korean 고마워요 is warm; 감사합니다 is more formal.',
      vi: 'Tiếng Hàn 고마워요 thân mật; 감사합니다 trang trọng hơn.',
      ko: '베트남어는 두 사람을 다 불러요. cháu(손주)가 bà(할머니)께 감사해요.',
      ja: 'ベトナム語は二人とも呼びます：cháu（孫）が bà（おばあちゃん）にお礼。韓国語の「고마워요」は親しみ、「감사합니다」はよりていねい。',
    },
  },
  // ---- "Which way?" at Hoshi Station (scenes/station.js): travel phrases
  'excuse-me': {
    en: { say: 'Excuse me' },
    ko: { say: '저기요', roman: 'jeogiyo' },
    vi: { say: 'cho em hỏi', tone: 'cho (ngang) · em (ngang) · hỏi (hỏi)' },
    mean: { en: 'Getting a stranger’s attention politely', vi: 'Gọi người lạ một cách lịch sự', ko: '모르는 사람을 공손하게 부를 때', ja: '知らない人にていねいに声をかける' },
    note: {
      en: 'Korean 저기요 means “over there”, the everyday way to call someone; 실례합니다 is more formal. Vietnamese “cho em hỏi” is “let me ask”: em when you are younger than the person.',
      vi: 'Tiếng Hàn 저기요 là cách gọi hằng ngày; 실례합니다 trang trọng hơn. Tiếng Anh “Excuse me” dùng với mọi người.',
      ko: '베트남어 “cho em hỏi”는 “여쭤볼게요”라는 뜻이에요. 상대보다 어리면 em이라고 해요.',
      ja: '韓国語の「저기요」は日常の呼びかけ、「실례합니다」はよりていねい。ベトナム語の「cho em hỏi」は「ちょっと聞かせて」。',
    },
  },
  'which-way': {
    en: { say: 'Which way…?' },
    ko: { say: '어느 쪽', roman: 'eoneu jjok' },
    vi: { say: 'đi lối nào', tone: 'đi (ngang) · lối (sắc) · nào (huyền)' },
    mean: { en: 'Asking the way', vi: 'Hỏi đường', ko: '길을 물을 때', ja: '道をたずねる' },
    note: {
      en: 'Say the place first: “신사는 어느 쪽이에요?” (Korean), “Đền đi lối nào ạ?” (Vietnamese): the shrine, which way?',
      vi: 'Nói nơi muốn đến trước: “Which way to the shrine?” — “신사는 어느 쪽이에요?”',
      ko: '가고 싶은 곳을 먼저 말해요: “Which way to the shrine?” — “Đền đi lối nào ạ?”',
      ja: '行きたい場所を先に言います。韓国語「신사는 어느 쪽이에요?」、ベトナム語「Đền đi lối nào ạ?」',
    },
  },
  'thank-you': {
    en: { say: 'Thank you' },
    ko: { say: '고마워요', roman: 'gomawoyo' },
    vi: { say: 'Cảm ơn chị', tone: 'cảm (hỏi) · ơn (ngang) · chị (nặng)' },
    mean: { en: 'Thanking someone', vi: 'Cảm ơn ai đó', ko: '고맙다고 할 때', ja: 'お礼を言う' },
    note: {
      en: 'Vietnamese thanks a person by name or title: “cảm ơn chị” (to an older girl or woman). Korean 고마워요 is warm; 감사합니다 is more formal.',
      vi: 'Tiếng Hàn 고마워요 thân mật; 감사합니다 trang trọng hơn.',
      ko: '베트남어는 상대를 불러서 고마워해요: “cảm ơn chị” (언니·누나에게).',
      ja: 'ベトナム語は相手を呼んでお礼を言います：「cảm ơn chị」（お姉さんに）。',
    },
  },
  'nice-trip': {
    en: { say: 'Have a nice trip!' },
    ko: { say: '즐거운 여행 되세요', roman: 'jeulgeoun yeohaeng doeseyo' },
    vi: { say: 'đi chơi vui vẻ', tone: 'đi (ngang) · chơi (ngang) · vui (ngang) · vẻ (hỏi)' },
    mean: { en: 'Wishing a traveller well', vi: 'Chúc người đi du lịch', ko: '여행하는 사람에게 하는 인사', ja: '旅をする人へのあいさつ' },
    note: {
      en: 'Vietnamese starts with “Chúc …” (I wish you …). Korean 되세요 makes it a kind wish.',
      vi: 'Tiếng Hàn 되세요 biến câu thành lời chúc.',
      ko: '베트남어는 “Chúc …”(…하길 바라요)로 시작해요.',
      ja: 'ベトナム語は「Chúc …」（…を願います）で始めます。韓国語の「되세요」で願いの形になります。',
    },
  },
};
