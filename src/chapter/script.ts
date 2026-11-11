/** Canonical chapter-one text. Simplified Chinese and English are authored here;
 * Traditional Chinese, Japanese and Korean live in `src/chapter/script-locales.ts`
 * and must keep exactly the same keys (tests enforce this). Keep lines short,
 * warm and a little funny. `{name}` style placeholders are filled at runtime. */

export const STORY_ZH = {
  // Names
  'name.wick': '维克', 'name.marlo': '玛洛', 'name.pim': '小皮', 'name.bram': '布拉姆', 'name.sprout': '小芽',
  'name.sol': '苏奶奶', 'name.otto': '奥托', 'name.ike': '艾克', 'name.cat': '纽扣',
  // Districts
  'district.harbor': '港口', 'district.workshop': '山坡工坊', 'district.oldstreet': '老街', 'district.grove': '大树', 'district.far': '背面的房子',
  // Sockets
  'socket.generator': '发电机', 'socket.lighthouse': '灯塔', 'socket.lighthouse_box': '灯塔电箱', 'socket.crane': '码头吊机',
  'socket.spring': '泉眼', 'socket.waterwheel': '水车', 'socket.sluice': '水闸', 'socket.garden': '花田',
  'socket.lamp_a': '东头灯柱', 'socket.lamp_b': '西头灯柱', 'socket.otto_window': '奥托的窗', 'socket.ike_window': '艾克的窗',
  'socket.hub_harbor': '港口枢纽', 'socket.hub_workshop': '工坊枢纽', 'socket.hub_oldstreet': '老街枢纽',
  'socket.root_harbor': '大树的根', 'socket.root_workshop': '大树的根', 'socket.root_oldstreet': '大树的根',
  // Connections
  'conn.h1': '灯塔', 'conn.h2': '码头吊机', 'conn.w1': '水车', 'conn.w2': '花田', 'conn.o1': '老街灯串', 'conn.o2': '传声线',
  'conn.fh': '港口之根', 'conn.fw': '工坊之根', 'conn.fo': '老街之根',
  // Objectives
  'obj.h1': '把发电机的线牵到灯塔', 'obj.h1.detail': '靠近栈桥边发光的发电机，拿起线头，走到灯塔底下接上。',
  'obj.h2': '给码头吊机通上电', 'obj.h2.detail': '从灯塔墙上的电箱牵线到东边码头的吊机。',
  'obj.explore': '去山坡工坊和西边的老街看看', 'obj.explore.detail': '工坊在东边的小山上，老街在西边。',
  'obj.w1': '把山顶的泉水引到水车', 'obj.w1.detail': '泉眼在小山顶上，水车在工坊旁边。',
  'obj.w2': '把水从水闸引到花田', 'obj.w2.detail': '水闸在水车下面，花田在东南边的梯田上。',
  'obj.o1': '沿着老街挂起一串灯', 'obj.o1.detail': '从东头的灯柱出发，沿着街走到西头的灯柱。',
  'obj.o2': '在两扇窗之间牵一根传声线', 'obj.o2.detail': '奥托和艾克的窗户隔着窄巷相对。',
  'obj.roots': '把街区连到北边的大树（{count}/3）', 'obj.roots.detail': '完成的街区里，枢纽柱会亮起来。把它连到大树的根上。',
  'obj.done': '第一章完成了，随意逛逛吧', 'obj.done.detail': '你的星球会一直保持这个样子。',
  // Interaction prompts and notices
  'prompt.talk': '交谈', 'prompt.pickup': '拿起线头', 'prompt.connect': '接上', 'prompt.reel': '收线',
  'prompt.inactive': '这里还没有动静', 'prompt.mismatch': '这根线接不到这里', 'prompt.knock': '敲门',
  'notice.taut': '线快用完了——收线重来，或者找条近路', 'notice.connected': '「{name}」接通了',
  'notice.reeled': '线收回来了', 'notice.busy': '先把手上的线接好，或者收回来',
  // Dialogue — Wick
  'wick.intro': '哟，背线轴的小家伙？好多年没见过了。|这颗星球最近太安静了。灯不亮，水不流，大家都关着门。|栈桥边有台发电机。拿起线头，把线牵到灯塔底下试试？',
  'wick.waiting': '发电机在栈桥边，灯塔在岬角上。线会跟着你走。',
  'wick.after_h1': '亮了！……咳，我是说，还行吧。|看，海上有船回来了。灯塔一亮，人就找得到家。',
  'wick.after_h2': '山那边的工坊、西边的老街，好久没听到动静了。|去吧，这里有我看着。',
  'wick.final': '整颗星球都亮了。我这把老骨头，还以为看不到这一天。',
  // Marlo
  'marlo.arrive': '好久没看到灯塔亮了，我差点以为港口没了。|可码头的吊机还停着，满船的鱼卸不下来。|电箱就在灯塔墙上，能帮我接到吊机吗？',
  'marlo.after_h2': '动了动了！今晚有鱼汤喝。|听说山上的工坊停了很久，水车都不转了。',
  'marlo.final': '给你留了一碗鱼汤。……好吧，是半碗。',
  // Pim
  'pim.idle': '我的风筝线比你的长！|……好吧，可能没有。',
  'pim.final': '从风筝那么高看下来，整颗星球像一个毛线球！',
  // Bram
  'bram.before_w1': '泉水还在山顶冒着，就是没人把它引下来。|你那根线……能运水？|好吧。这颗星球上什么都可能。',
  'bram.after_w1': '听听这声音！咕噜——咕噜——|下面的花田干了好久，小芽一直在等。水闸就在水车下面。',
  'bram.final': '工坊又有活干了。我得先把那把锤子找出来。',
  // Sprout
  'sprout.before_w2': '花都睡着了。|它们只是渴了，对吧？',
  'sprout.after_w2': '开了！全都开了！|老街那边的人，好像很久都没出门了。',
  'sprout.final': '我给每朵花都取了名字。这一朵叫你。',
  // Nana Sol
  'sol.before_o1': '面摊一直开着，就是没人来。|路灯坏了以后，大家都不爱出门了。|从这头的灯柱牵到那头的灯柱，好不好？',
  'sol.after_o1': '哎呀，热闹起来了！|就是奥托和艾克……两个老头子，几十年没说过话了。|他们的窗户隔着一条巷子，正对着。',
  'sol.after_o2': '听说大树的根，连着整颗星球。|每个街区的枢纽柱亮了，就能连过去。',
  'sol.final': '今天的面，大家都有份。',
  // Otto & Ike
  'otto.before_o2': '艾克？不认识什么艾克。|……他身体还好吗？',
  'ike.before_o2': '小时候，我们用两个罐头和一根线说话。|后来为了一盘棋吵翻了。|线早就断了。',
  'phone.1': '……喂？', 'phone.2': '……那盘棋，是你赢了。', 'phone.3': '不，是你赢了。我偷偷挪了一个子。',
  'phone.4': '我知道。', 'phone.5': '……明天来下一盘？',
  'otto.after_o2': '明天下棋。他执白。', 'ike.after_o2': '这根线，这次可别断了。',
  // Cat
  'cat.idle': '喵。', 'cat.final': '喵～（它看起来很满意。）',
  // Far house
  'far.locked': '门锁着。里面好像有人。',
  // Finale
  'final.1': '整颗星球，都被你牵起来了。', 'final.2': '……可是背面那栋房子，还没有亮。',
  'chapter.title': '第一章 · 重新亮起来', 'chapter.end': '未完待续',
  'postcard.title': '我的星球', 'postcard.save': '保存明信片', 'postcard.close': '继续漫游',
} as const;

export type StoryKey = keyof typeof STORY_ZH;
export type StoryTable = Record<StoryKey, string>;

export const STORY_EN: StoryTable = {
  'name.wick': 'Wick', 'name.marlo': 'Marlo', 'name.pim': 'Pim', 'name.bram': 'Bram', 'name.sprout': 'Sprout',
  'name.sol': 'Nana Sol', 'name.otto': 'Otto', 'name.ike': 'Ike', 'name.cat': 'Button',
  'district.harbor': 'Harbor', 'district.workshop': 'Hillside Workshop', 'district.oldstreet': 'Old Street', 'district.grove': 'Great Tree', 'district.far': 'The Far House',
  'socket.generator': 'Generator', 'socket.lighthouse': 'Lighthouse', 'socket.lighthouse_box': 'Lighthouse power box', 'socket.crane': 'Dock crane',
  'socket.spring': 'Spring', 'socket.waterwheel': 'Waterwheel', 'socket.sluice': 'Sluice', 'socket.garden': 'Flower terraces',
  'socket.lamp_a': 'East lamp post', 'socket.lamp_b': 'West lamp post', 'socket.otto_window': 'Otto’s window', 'socket.ike_window': 'Ike’s window',
  'socket.hub_harbor': 'Harbor hub', 'socket.hub_workshop': 'Workshop hub', 'socket.hub_oldstreet': 'Old Street hub',
  'socket.root_harbor': 'Great Tree root', 'socket.root_workshop': 'Great Tree root', 'socket.root_oldstreet': 'Great Tree root',
  'conn.h1': 'Lighthouse', 'conn.h2': 'Dock crane', 'conn.w1': 'Waterwheel', 'conn.w2': 'Flower terraces', 'conn.o1': 'Street lights', 'conn.o2': 'Speaking line',
  'conn.fh': 'Harbor root', 'conn.fw': 'Workshop root', 'conn.fo': 'Old Street root',
  'obj.h1': 'Run a line from the generator to the lighthouse', 'obj.h1.detail': 'Pick up the thread at the glowing generator by the pier, then walk it to the lighthouse.',
  'obj.h2': 'Power the dock crane', 'obj.h2.detail': 'Run a line from the box on the lighthouse wall to the crane on the east dock.',
  'obj.explore': 'Visit the hillside workshop and the old street', 'obj.explore.detail': 'The workshop sits on the hill to the east. The old street lies to the west.',
  'obj.w1': 'Bring the hilltop spring down to the waterwheel', 'obj.w1.detail': 'The spring is at the top of the hill. The waterwheel turns beside the workshop.',
  'obj.w2': 'Carry water from the sluice to the flower terraces', 'obj.w2.detail': 'The sluice is just below the wheel. The terraces are to the southeast.',
  'obj.o1': 'String lights along the old street', 'obj.o1.detail': 'Start at the east lamp post and walk the street to the west one.',
  'obj.o2': 'Run a speaking line between the two windows', 'obj.o2.detail': 'Otto’s and Ike’s windows face each other across the alley.',
  'obj.roots': 'Connect the districts to the Great Tree ({count}/3)', 'obj.roots.detail': 'A finished district lights up its hub post. Run it to one of the Great Tree’s roots.',
  'obj.done': 'Chapter One complete — wander freely', 'obj.done.detail': 'Your planet will stay just the way you made it.',
  'prompt.talk': 'Talk', 'prompt.pickup': 'Pick up thread', 'prompt.connect': 'Connect', 'prompt.reel': 'Reel in',
  'prompt.inactive': 'Nothing stirs here yet', 'prompt.mismatch': 'This thread doesn’t go here', 'prompt.knock': 'Knock',
  'notice.taut': 'Running out of thread — reel in, or find a shorter way', 'notice.connected': '{name} connected',
  'notice.reeled': 'Thread reeled back in', 'notice.busy': 'Connect the thread you’re holding first, or reel it in',
  'wick.intro': 'Well now — a little one with a spool? Haven’t seen one in years.|This planet’s gone awfully quiet. Lamps out, water still, every door shut.|There’s a generator by the pier. Grab the thread and run it to the lighthouse, would you?',
  'wick.waiting': 'Generator’s by the pier, lighthouse is out on the cape. The thread follows wherever you walk.',
  'wick.after_h1': 'It’s lit! …Ahem. I mean — acceptable.|Look, a boat’s coming in. Light a lighthouse and people find their way home.',
  'wick.after_h2': 'Haven’t heard a peep from the workshop over the hill, or the old street out west.|Go on. I’ll keep an eye on things here.',
  'wick.final': 'The whole planet’s glowing. These old bones didn’t think they’d see it.',
  'marlo.arrive': 'Haven’t seen that light in ages. Thought the harbor was gone.|But the crane’s still dead, and I’ve got a boat full of fish.|The power box is on the lighthouse wall. Could you run a line to the crane?',
  'marlo.after_h2': 'She moves! Fish soup tonight.|Heard the workshop up the hill’s been still a long while. Even the waterwheel stopped.',
  'marlo.final': 'Saved you a bowl of fish soup. …Fine, half a bowl.',
  'pim.idle': 'My kite string’s longer than yours!|…Okay, maybe not.',
  'pim.final': 'From way up by my kite, the whole planet looks like a ball of yarn!',
  'bram.before_w1': 'Spring’s still bubbling on the hilltop. Nobody’s brought it down.|That thread of yours… carries water?|Fine. Stranger things have happened on this planet.',
  'bram.after_w1': 'Listen to that! Glug — glug — glug!|The flower terraces down there have been dry for ages. Sprout’s been waiting. The sluice is right below the wheel.',
  'bram.final': 'Workshop’s got work again. First I need to find my hammer.',
  'sprout.before_w2': 'The flowers are all asleep.|They’re just thirsty… right?',
  'sprout.after_w2': 'They’re open! Every single one!|I don’t think the people on the old street have been outside in a long time.',
  'sprout.final': 'I’ve named every flower. This one’s named after you.',
  'sol.before_o1': 'My noodle stall’s been open the whole time. Nobody comes.|Once the street lamps went out, folks stopped going out.|Could you string a line from the lamp at this end to the one at the far end?',
  'sol.after_o1': 'Oh my, it’s lively again!|Except Otto and Ike… those two old goats haven’t spoken in decades.|Their windows face each other across the alley.',
  'sol.after_o2': 'They say the Great Tree’s roots reach around the whole planet.|Once a district’s hub post lights up, you can run a line to it.',
  'sol.final': 'Noodles for everyone today.',
  'otto.before_o2': 'Ike? Never heard of an Ike.|…Is he keeping well?',
  'ike.before_o2': 'When we were boys, we talked through two tin cans and a string.|Then we fell out over a game of chess.|That string snapped a long time ago.',
  'phone.1': '…Hello?', 'phone.2': '…You won that game, you know.', 'phone.3': 'No. You did. I moved a piece when you weren’t looking.',
  'phone.4': 'I know.', 'phone.5': '…Another game tomorrow?',
  'otto.after_o2': 'Chess tomorrow. He gets white.', 'ike.after_o2': 'Let’s not let this string snap.',
  'cat.idle': 'Mrow.', 'cat.final': 'Mrrp. (It looks very pleased.)',
  'far.locked': 'The door is locked. Someone might be inside.',
  'final.1': 'You’ve stitched the whole planet together.', 'final.2': '…But one house on the far side is still dark.',
  'chapter.title': 'Chapter One · Lights Back On', 'chapter.end': 'To be continued',
  'postcard.title': 'My planet', 'postcard.save': 'Save postcard', 'postcard.close': 'Keep wandering',
};

/** Speakers for the overheard tin-can conversation, in order. */
export const PHONE_SPEAKERS = ['otto', 'ike', 'otto', 'ike', 'otto'] as const;
