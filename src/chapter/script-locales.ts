import type { StoryTable } from './script';

/** Traditional Chinese, Japanese and Korean story copy. Every table must cover
 * every key of STORY_ZH (the `StoryTable` type enforces it at compile time and
 * tests/story-locales.test.ts checks `|` line counts and `{placeholders}`).
 * Translations are adapted, not literal: short, warm, a little funny. */

const ZH_HANT: StoryTable = {
  // Names
  'name.wick': '維克', 'name.marlo': '瑪洛', 'name.pim': '小皮', 'name.bram': '布拉姆', 'name.sprout': '小芽',
  'name.sol': '蘇奶奶', 'name.otto': '奧托', 'name.ike': '艾克', 'name.cat': '鈕扣',
  // Districts
  'district.harbor': '港口', 'district.workshop': '山坡工坊', 'district.oldstreet': '老街', 'district.grove': '大樹', 'district.far': '背面的房子',
  // Sockets
  'socket.generator': '發電機', 'socket.lighthouse': '燈塔', 'socket.lighthouse_box': '燈塔電箱', 'socket.crane': '碼頭吊車',
  'socket.spring': '泉眼', 'socket.waterwheel': '水車', 'socket.sluice': '水閘', 'socket.garden': '花田',
  'socket.lamp_a': '東頭燈柱', 'socket.lamp_b': '西頭燈柱', 'socket.otto_window': '奧托的窗', 'socket.ike_window': '艾克的窗',
  'socket.hub_harbor': '港口樞紐', 'socket.hub_workshop': '工坊樞紐', 'socket.hub_oldstreet': '老街樞紐',
  'socket.root_harbor': '大樹的根', 'socket.root_workshop': '大樹的根', 'socket.root_oldstreet': '大樹的根',
  // Connections
  'conn.h1': '燈塔', 'conn.h2': '碼頭吊車', 'conn.w1': '水車', 'conn.w2': '花田', 'conn.o1': '老街燈串', 'conn.o2': '傳聲線',
  'conn.fh': '港口之根', 'conn.fw': '工坊之根', 'conn.fo': '老街之根',
  // Objectives
  'obj.h1': '把發電機的線牽到燈塔', 'obj.h1.detail': '靠近棧橋邊發光的發電機，拿起線頭，走到燈塔底下接上。',
  'obj.h2': '幫碼頭吊車通上電', 'obj.h2.detail': '從燈塔牆上的電箱牽線到東邊碼頭的吊車。',
  'obj.explore': '去山坡工坊和西邊的老街看看', 'obj.explore.detail': '工坊在東邊的小山上，老街在西邊。',
  'obj.w1': '把山頂的泉水引到水車', 'obj.w1.detail': '泉眼在小山頂上，水車在工坊旁邊。',
  'obj.w2': '把水從水閘引到花田', 'obj.w2.detail': '水閘在水車下面，花田在東南邊的梯田上。',
  'obj.o1': '沿著老街掛起一串燈', 'obj.o1.detail': '從東頭的燈柱出發，沿著街走到西頭的燈柱。',
  'obj.o2': '在兩扇窗之間牽一條傳聲線', 'obj.o2.detail': '奧托和艾克的窗戶隔著窄巷相對。',
  'obj.roots': '把街區連到北邊的大樹（{count}/3）', 'obj.roots.detail': '完成的街區裡，樞紐柱會亮起來。把它連到大樹的根上。',
  'obj.done': '第一章完成了，隨意逛逛吧', 'obj.done.detail': '你的星球會一直保持這個樣子。',
  // Interaction prompts and notices
  'prompt.talk': '交談', 'prompt.pickup': '拿起線頭', 'prompt.connect': '接上', 'prompt.reel': '收線',
  'prompt.inactive': '這裡還沒有動靜', 'prompt.mismatch': '這條線接不到這裡', 'prompt.knock': '敲門',
  'notice.taut': '線快用完了——收線重來，或是找條近路', 'notice.connected': '「{name}」接通了',
  'notice.reeled': '線收回來了', 'notice.busy': '先把手上的線接好，或是收回來',
  // Dialogue — Wick
  'wick.intro': '喲，背線軸的小傢伙？好多年沒見過了。|這顆星球最近太安靜了。燈不亮，水不流，大家都關著門。|棧橋邊有台發電機。拿起線頭，把線牽到燈塔底下試試？',
  'wick.waiting': '發電機在棧橋邊，燈塔在岬角上。線會跟著你走。',
  'wick.after_h1': '亮了！……咳，我是說，還行吧。|看，海上有船回來了。燈塔一亮，人就找得到家。',
  'wick.after_h2': '山那邊的工坊、西邊的老街，好久沒聽到動靜了。|去吧，這裡有我看著。',
  'wick.final': '整顆星球都亮了。我這把老骨頭，還以為看不到這一天。',
  // Marlo
  'marlo.arrive': '好久沒看到燈塔亮了，我差點以為港口沒了。|可碼頭的吊車還停著，滿船的魚卸不下來。|電箱就在燈塔牆上，能幫我接到吊車嗎？',
  'marlo.after_h2': '動了動了！今晚有魚湯喝。|聽說山上的工坊停了很久，水車都不轉了。',
  'marlo.final': '幫你留了一碗魚湯。……好吧，是半碗。',
  // Pim
  'pim.idle': '我的風箏線比你的長！|……好啦，可能沒有。',
  'pim.final': '從風箏那麼高看下來，整顆星球像一顆毛線球！',
  // Bram
  'bram.before_w1': '泉水還在山頂冒著，就是沒人把它引下來。|你那條線……能運水？|好吧。這顆星球上什麼都有可能。',
  'bram.after_w1': '聽聽這聲音！咕嚕——咕嚕——|下面的花田乾了好久，小芽一直在等。水閘就在水車下面。',
  'bram.final': '工坊又有活兒幹了。我得先把那把鎚子找出來。',
  // Sprout
  'sprout.before_w2': '花都睡著了。|它們只是渴了，對吧？',
  'sprout.after_w2': '開了！全都開了！|老街那邊的人，好像很久都沒出門了。',
  'sprout.final': '我幫每朵花都取了名字。這一朵叫你。',
  // Nana Sol
  'sol.before_o1': '麵攤一直開著，就是沒人來。|路燈壞了以後，大家都不愛出門了。|從這頭的燈柱牽到那頭的燈柱，好不好？',
  'sol.after_o1': '哎呀，熱鬧起來了！|就是奧托和艾克……兩個老頭子，幾十年沒說過話了。|他們的窗戶隔著一條巷子，正對著。',
  'sol.after_o2': '聽說大樹的根，連著整顆星球。|每個街區的樞紐柱亮了，就能連過去。',
  'sol.final': '今天的麵，大家都有份。',
  // Otto & Ike
  'otto.before_o2': '艾克？不認識什麼艾克。|……他身體還好嗎？',
  'ike.before_o2': '小時候，我們用兩個罐頭和一條線說話。|後來為了一盤棋吵翻了。|線早就斷了。',
  'phone.1': '……喂？', 'phone.2': '……那盤棋，是你贏了。', 'phone.3': '不，是你贏了。我偷偷挪了一顆子。',
  'phone.4': '我知道。', 'phone.5': '……明天來下一盤？',
  'otto.after_o2': '明天下棋。他執白。', 'ike.after_o2': '這條線，這次可別斷了。',
  // Cat
  'cat.idle': '喵。', 'cat.final': '喵～（牠看起來很滿意。）',
  // Far house
  'far.locked': '門鎖著。裡面好像有人。',
  // Finale
  'final.1': '整顆星球，都被你牽起來了。', 'final.2': '……可是背面那棟房子，還沒有亮。',
  'chapter.title': '第一章 · 重新亮起來', 'chapter.end': '未完待續',
  'postcard.title': '我的星球', 'postcard.save': '儲存明信片', 'postcard.close': '繼續漫遊',
};

const JA: StoryTable = {
  // Names
  'name.wick': 'ウィック', 'name.marlo': 'マーロ', 'name.pim': 'ピム', 'name.bram': 'ブラム', 'name.sprout': 'スプラウト',
  'name.sol': 'ソルおばあちゃん', 'name.otto': 'オットー', 'name.ike': 'アイク', 'name.cat': 'ボタン',
  // Districts
  'district.harbor': '港', 'district.workshop': '丘の工房', 'district.oldstreet': '古い通り', 'district.grove': '大きな木', 'district.far': '裏側の家',
  // Sockets
  'socket.generator': '発電機', 'socket.lighthouse': '灯台', 'socket.lighthouse_box': '灯台の電気ボックス', 'socket.crane': '埠頭のクレーン',
  'socket.spring': '泉', 'socket.waterwheel': '水車', 'socket.sluice': '水門', 'socket.garden': '花畑',
  'socket.lamp_a': '東端の街灯', 'socket.lamp_b': '西端の街灯', 'socket.otto_window': 'オットーの窓', 'socket.ike_window': 'アイクの窓',
  'socket.hub_harbor': '港のハブ', 'socket.hub_workshop': '工房のハブ', 'socket.hub_oldstreet': '古い通りのハブ',
  'socket.root_harbor': '大きな木の根', 'socket.root_workshop': '大きな木の根', 'socket.root_oldstreet': '大きな木の根',
  // Connections
  'conn.h1': '灯台', 'conn.h2': '埠頭のクレーン', 'conn.w1': '水車', 'conn.w2': '花畑', 'conn.o1': '通りの灯り', 'conn.o2': '糸電話',
  'conn.fh': '港の根', 'conn.fw': '工房の根', 'conn.fo': '古い通りの根',
  // Objectives
  'obj.h1': '発電機の糸を灯台へつなぐ', 'obj.h1.detail': '桟橋のそばで光る発電機から糸の端を拾い、灯台の足もとまで歩いてつなぎましょう。',
  'obj.h2': '埠頭のクレーンに電気を通す', 'obj.h2.detail': '灯台の壁の電気ボックスから、東の埠頭のクレーンまで糸をつなぎましょう。',
  'obj.explore': '丘の工房と西の古い通りをのぞいてみる', 'obj.explore.detail': '工房は東の小さな丘の上、古い通りは西にあります。',
  'obj.w1': '丘の上の泉の水を水車へ引く', 'obj.w1.detail': '泉は丘のてっぺん、水車は工房のとなりにあります。',
  'obj.w2': '水門から花畑へ水を引く', 'obj.w2.detail': '水門は水車のすぐ下、花畑は南東の段々畑にあります。',
  'obj.o1': '古い通りにずらりと灯りをともす', 'obj.o1.detail': '東端の街灯から出発して、通りを歩いて西端の街灯までつなぎましょう。',
  'obj.o2': 'ふたつの窓のあいだに糸電話をつなぐ', 'obj.o2.detail': 'オットーの窓とアイクの窓は、細い路地をはさんで向かい合っています。',
  'obj.roots': '街を北の大きな木へつなぐ（{count}/3）', 'obj.roots.detail': '仕上がった街では、ハブの柱に灯りがともります。それを大きな木の根までつなぎましょう。',
  'obj.done': '第一章おしまい。のんびり歩きまわろう', 'obj.done.detail': 'あなたの星は、このままずっとここにあります。',
  // Interaction prompts and notices
  'prompt.talk': '話す', 'prompt.pickup': '糸を拾う', 'prompt.connect': 'つなぐ', 'prompt.reel': '巻き取る',
  'prompt.inactive': 'まだ何も起きない', 'prompt.mismatch': 'この糸はここにはつなげない', 'prompt.knock': 'ノックする',
  'notice.taut': '糸が残りわずか——巻き取るか、近道を探そう', 'notice.connected': '「{name}」がつながった',
  'notice.reeled': '糸を巻き取った', 'notice.busy': '持っている糸を先につなぐか、巻き取ろう',
  // Dialogue — Wick
  'wick.intro': 'おや、糸巻きを背負ったちびっ子か。何年ぶりに見ただろうな。|この星は、このところすっかり静かでね。灯りは消え、水は流れず、みんな戸を閉めきっている。|桟橋のそばに発電機がある。糸の端を拾って、灯台の下までつないでみてくれないか。',
  'wick.waiting': '発電機は桟橋のそば、灯台は岬の上だ。糸は、歩いた道についてくるよ。',
  'wick.after_h1': 'ついた！……ゴホン。まあ、悪くないな。|ほら、海に船が戻ってきた。灯台が灯れば、人は帰り道を見つけられる。',
  'wick.after_h2': '丘の向こうの工房も、西の古い通りも、長いこと物音ひとつしない。|行っておいで。ここは私が見ているよ。',
  'wick.final': '星じゅうが光っている。この老いぼれ、この日が見られるとは思わなかったよ。',
  // Marlo
  'marlo.arrive': '灯台の光を見るのは久しぶりです。港がなくなったのかと思いましたよ。|でも埠頭のクレーンはまだ止まったままで、船いっぱいの魚が降ろせないんです。|電気ボックスは灯台の壁にあります。クレーンまで糸をつないでもらえますか？',
  'marlo.after_h2': '動いた動いた！今夜は魚のスープですよ。|丘の上の工房も、ずいぶん止まったままだそうです。水車も回っていないとか。',
  'marlo.final': '魚のスープ、取っておきましたよ。……はい、半分だけですけど。',
  // Pim
  'pim.idle': '凧の糸なら、きみのより長いんだぞ！|……うそ、やっぱ負けてるかも。',
  'pim.final': '凧の高さから見るとね、星ぜんぶが毛糸玉みたい！',
  // Bram
  'bram.before_w1': '泉は山のてっぺんでずっと湧いてるのに、誰も下ろしてやらないんだ。|あんたのその糸……水も運べるのか？|まあいい。この星じゃ、何が起きても不思議じゃないさ。',
  'bram.after_w1': '聞いてくれ、この音！ごぼ——ごぼ——|下の花畑は、ずっと乾いたままだった。スプラウトが待ってるぞ。水門は水車のすぐ下だ。',
  'bram.final': '工房にまた仕事が来たぞ。まずは金槌を探さないとな。',
  // Sprout
  'sprout.before_w2': 'お花は、みんな眠っています。|のどがかわいているだけ……ですよね？',
  'sprout.after_w2': '咲きました！ぜんぶ咲きました！|古い通りの人たち、もうずっと外に出ていないみたいです。',
  'sprout.final': 'お花には、ぜんぶ名前をつけたんです。この子は、あなたの名前ですよ。',
  // Nana Sol
  'sol.before_o1': 'うちの麺の屋台はずっと開けてるんだけどね、お客さんが来ないのよ。|街灯が消えてから、みんな出歩かなくなっちゃってねえ。|こっちの端の街灯から向こうの端の街灯まで、糸をつないでくれないかい？',
  'sol.after_o1': 'あらまあ、にぎやかになったこと！|ただね、オットーとアイクは……あの頑固者ふたり、何十年も口をきいてないのよ。|窓が路地をはさんで、ちょうど向かい合っているんだけどねえ。',
  'sol.after_o2': '大きな木の根っこは、星じゅうにのびているんだって。|街のハブの柱に灯りがともったら、そこまでつなげるはずよ。',
  'sol.final': '今日のお麺は、みんなの分があるからね。',
  // Otto & Ike
  'otto.before_o2': 'アイク？そんな名前のやつは知らん。|……元気にしてるのか。',
  'ike.before_o2': '子どものころは、空き缶ふたつと一本の糸で話したもんだ。|それがチェスの一局でもめて、大げんかになってな。|糸は、とっくに切れちまったよ。',
  'phone.1': '……もしもし？', 'phone.2': '……あの対局、君の勝ちだったよ。', 'phone.3': 'いや、君の勝ちだ。見てない隙に、駒をひとつ動かした。',
  'phone.4': '知ってた。', 'phone.5': '……明日、もう一局どうだ？',
  'otto.after_o2': '明日はチェスだ。あいつが白だな。', 'ike.after_o2': 'この糸、今度は切らすなよ。',
  // Cat
  'cat.idle': 'にゃあ。', 'cat.final': 'にゃ〜。（とても満足そうだ。）',
  // Far house
  'far.locked': '鍵がかかっている。中に誰かいるみたいだ。',
  // Finale
  'final.1': '星ぜんぶが、あなたの糸でつながった。', 'final.2': '……でも、裏側のあの家は、まだ暗いまま。',
  'chapter.title': '第一章・もういちど灯る', 'chapter.end': 'つづく',
  'postcard.title': 'わたしの星', 'postcard.save': 'ポストカードを保存', 'postcard.close': '散歩をつづける',
};

const KO: StoryTable = {
  // Names
  'name.wick': '윅', 'name.marlo': '말로', 'name.pim': '핌', 'name.bram': '브램', 'name.sprout': '스프라우트',
  'name.sol': '솔 할머니', 'name.otto': '오토', 'name.ike': '아이크', 'name.cat': '버튼',
  // Districts
  'district.harbor': '항구', 'district.workshop': '언덕 공방', 'district.oldstreet': '옛 거리', 'district.grove': '큰 나무', 'district.far': '뒷면의 집',
  // Sockets
  'socket.generator': '발전기', 'socket.lighthouse': '등대', 'socket.lighthouse_box': '등대 전기함', 'socket.crane': '부두 크레인',
  'socket.spring': '샘', 'socket.waterwheel': '물레방아', 'socket.sluice': '수문', 'socket.garden': '꽃밭',
  'socket.lamp_a': '동쪽 가로등', 'socket.lamp_b': '서쪽 가로등', 'socket.otto_window': '오토의 창문', 'socket.ike_window': '아이크의 창문',
  'socket.hub_harbor': '항구 허브', 'socket.hub_workshop': '공방 허브', 'socket.hub_oldstreet': '옛 거리 허브',
  'socket.root_harbor': '큰 나무의 뿌리', 'socket.root_workshop': '큰 나무의 뿌리', 'socket.root_oldstreet': '큰 나무의 뿌리',
  // Connections
  'conn.h1': '등대', 'conn.h2': '부두 크레인', 'conn.w1': '물레방아', 'conn.w2': '꽃밭', 'conn.o1': '거리의 등불', 'conn.o2': '실전화',
  'conn.fh': '항구의 뿌리', 'conn.fw': '공방의 뿌리', 'conn.fo': '옛 거리의 뿌리',
  // Objectives
  'obj.h1': '발전기의 실을 등대까지 잇기', 'obj.h1.detail': '부두 옆에서 빛나는 발전기에서 실 끝을 집어 들고, 등대 아래까지 걸어가 이어 주세요.',
  'obj.h2': '부두 크레인에 전기 보내기', 'obj.h2.detail': '등대 벽의 전기함에서 동쪽 부두의 크레인까지 실을 이어 주세요.',
  'obj.explore': '언덕 공방과 서쪽 옛 거리 둘러보기', 'obj.explore.detail': '공방은 동쪽 작은 언덕 위에, 옛 거리는 서쪽에 있어요.',
  'obj.w1': '언덕 위 샘물을 물레방아로 끌어오기', 'obj.w1.detail': '샘은 언덕 꼭대기에, 물레방아는 공방 옆에 있어요.',
  'obj.w2': '수문의 물을 꽃밭으로 끌어오기', 'obj.w2.detail': '수문은 물레방아 바로 아래에, 꽃밭은 남동쪽 계단밭에 있어요.',
  'obj.o1': '옛 거리에 등불 줄 걸기', 'obj.o1.detail': '동쪽 끝 가로등에서 출발해 거리를 따라 서쪽 끝 가로등까지 걸어가요.',
  'obj.o2': '두 창문 사이에 실전화 잇기', 'obj.o2.detail': '오토와 아이크의 창문은 좁은 골목을 사이에 두고 마주 보고 있어요.',
  'obj.roots': '동네를 북쪽 큰 나무에 잇기 ({count}/3)', 'obj.roots.detail': '완성한 동네에서는 허브 기둥에 불이 들어와요. 그 기둥을 큰 나무의 뿌리까지 이어 주세요.',
  'obj.done': '제1장 완료, 마음껏 거닐어 보세요', 'obj.done.detail': '당신의 별은 이 모습 그대로 계속 남아 있어요.',
  // Interaction prompts and notices
  'prompt.talk': '대화', 'prompt.pickup': '실 집기', 'prompt.connect': '연결', 'prompt.reel': '감기',
  'prompt.inactive': '아직 아무 반응이 없어요', 'prompt.mismatch': '이 실은 여기에 이을 수 없어요', 'prompt.knock': '노크',
  'notice.taut': '실이 얼마 안 남았어요——감아서 다시 하거나, 지름길을 찾아봐요', 'notice.connected': '{name} 연결 완료!',
  'notice.reeled': '실을 다 감았어요', 'notice.busy': '들고 있는 실을 먼저 연결하거나 감아 주세요',
  // Dialogue — Wick
  'wick.intro': '오, 커다란 실타래를 멘 꼬마로군? 몇 년 만에 보는지 모르겠네.|이 별이 요즘 너무 조용해. 불은 꺼지고, 물은 멈추고, 다들 문을 닫아걸었지.|부두 옆에 발전기가 있어. 실 끝을 집어서 등대 밑까지 이어 보지 않겠나?',
  'wick.waiting': '발전기는 부두 옆, 등대는 곶 위에 있어. 실은 걷는 대로 따라올 거야.',
  'wick.after_h1': '켜졌다! ……크흠. 뭐, 나쁘진 않구먼.|봐, 바다에 배가 돌아오고 있어. 등대가 켜지면 사람은 집을 찾아오는 법이지.',
  'wick.after_h2': '언덕 너머 공방도, 서쪽 옛 거리도 한참 동안 기척이 없어.|가 보게. 여긴 내가 지키고 있을 테니.',
  'wick.final': '별 전체가 빛나는구먼. 이 늙은 뼈가 이런 날을 볼 줄은 몰랐어.',
  // Marlo
  'marlo.arrive': '등대 불빛을 보는 게 얼마 만인지. 항구가 사라진 줄 알았어요.|그런데 부두 크레인이 아직 멈춰 있어서, 배 가득 실은 물고기를 못 내려요.|전기함은 등대 벽에 있어요. 크레인까지 실을 이어 줄 수 있을까요?',
  'marlo.after_h2': '움직여요, 움직여! 오늘 밤엔 생선 수프예요.|언덕 위 공방도 오래 멈춰 있대요. 물레방아도 안 돌고요.',
  'marlo.final': '생선 수프 한 그릇 남겨 놨어요. ……좋아요, 반 그릇.',
  // Pim
  'pim.idle': '내 연줄이 네 실보다 길걸!|……아니다, 아닐지도.',
  'pim.final': '연 높이에서 내려다보면 별 전체가 털실 뭉치 같아!',
  // Bram
  'bram.before_w1': '샘물은 산꼭대기에서 계속 솟는데, 아무도 아래로 끌어 내려 주질 않아.|자네 그 실…… 물도 나르나?|뭐, 좋아. 이 별에선 무슨 일이든 일어날 수 있으니까.',
  'bram.after_w1': '이 소리 좀 들어 봐! 콸콸—콸콸—|아래 꽃밭이 한참을 말라 있었지. 스프라우트가 계속 기다렸어. 수문은 물레방아 바로 아래야.',
  'bram.final': '공방에 다시 일감이 들어왔어. 우선 망치부터 찾아야겠군.',
  // Sprout
  'sprout.before_w2': '꽃들이 다 잠들어 버렸어요.|목이 말라서 그런 거죠? 그렇죠?',
  'sprout.after_w2': '피었어요! 전부 다 피었어요!|옛 거리 사람들, 아주 오랫동안 밖에 안 나온 것 같아요.',
  'sprout.final': '꽃마다 이름을 붙여 줬어요. 이 꽃은 당신 이름이에요.',
  // Nana Sol
  'sol.before_o1': '국수 가게는 계속 열어 뒀는데, 손님이 통 안 오네.|가로등이 꺼지고 나서부터 다들 밖에 안 나오려고 해.|이쪽 끝 가로등에서 저쪽 끝 가로등까지 실을 좀 이어 주지 않겠니?',
  'sol.after_o1': '어머나, 다시 북적북적하네!|근데 오토랑 아이크는…… 그 고집불통 영감 둘은 몇십 년째 말을 안 해.|창문이 골목을 사이에 두고 딱 마주 보고 있는데도 말이야.',
  'sol.after_o2': '큰 나무 뿌리는 별 전체로 뻗어 있다더라.|동네마다 허브 기둥에 불이 들어오면, 거기까지 이을 수 있단다.',
  'sol.final': '오늘은 국수, 모두 한 그릇씩 먹자꾸나.',
  // Otto & Ike
  'otto.before_o2': '아이크? 그런 이름은 모르는데.|……그 친구, 건강은 괜찮은가?',
  'ike.before_o2': '어릴 땐 깡통 두 개랑 실 하나로 이야기를 했지.|그러다 체스 한 판 때문에 크게 싸웠어.|실은 진작에 끊어졌고.',
  'phone.1': '……여보세요?', 'phone.2': '……그때 그 판, 자네가 이겼어.', 'phone.3': '아니, 자네가 이긴 거야. 내가 몰래 말을 하나 옮겼거든.',
  'phone.4': '알고 있었어.', 'phone.5': '……내일 한 판 더 둘까?',
  'otto.after_o2': '내일 체스를 두기로 했어. 그 친구가 백이야.', 'ike.after_o2': '이번엔 이 실, 끊어지지 않게 하자고.',
  // Cat
  'cat.idle': '야옹.', 'cat.final': '야옹~ (아주 만족스러운 얼굴이다.)',
  // Far house
  'far.locked': '문이 잠겨 있다. 안에 누가 있는 것 같다.',
  // Finale
  'final.1': '별 전체를 당신이 이어 놓았어요.', 'final.2': '……하지만 뒷면의 그 집만은 아직 어두워요.',
  'chapter.title': '제1장 · 다시 켜지다', 'chapter.end': '계속됩니다',
  'postcard.title': '나의 별', 'postcard.save': '엽서 저장', 'postcard.close': '계속 둘러보기',
};

export const STORY_LOCALES: Record<'zh-Hant' | 'ja' | 'ko', StoryTable> = {
  'zh-Hant': ZH_HANT,
  ja: JA,
  ko: KO,
};
