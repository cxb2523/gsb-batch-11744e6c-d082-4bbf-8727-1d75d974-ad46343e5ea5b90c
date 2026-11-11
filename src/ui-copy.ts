import { getLanguage } from './i18n';
import { ADDITIONAL_LOCALES } from './locales';

/** Interface copy. Chapter story text lives in src/chapter/script.ts; this table
 * covers menus, HUD, help, journal and the credits panel in every language.
 * `zh` and `en` are authored here, the other three in src/locales/*.
 * Placeholders use `{name}` and must survive every translation (tests enforce it). */
export const UI_COPY = {
  // Title screen
  startScreen: { zh: '开始界面', en: 'Title screen' },
  subtitle: { zh: '你走过的每一步，都会变成星球上的一根彩线。', en: 'Every step you take becomes a colored thread on the planet.' },
  logoName: { zh: '毛线星球', en: 'Yarn Planet' },
  logoSub: { zh: 'YARN PLANET', en: '毛线星球' },
  prepare: { zh: '准备出发', en: 'Getting ready' },
  start: { zh: '开始旅程', en: 'Begin' },
  resume: { zh: '继续旅程', en: 'Continue' },
  newJourney: { zh: '新的旅程', en: 'New journey' },
  waking: { zh: '正在展开这颗小星球…', en: 'Unfolding this little planet…' },
  loadingProgress: { zh: '加载进度', en: 'Loading progress' },
  restart: { zh: '重新开始', en: 'Start over' },
  language: { zh: '语言', en: 'Language' },
  retry: { zh: '重新加载', en: 'Reload' },
  notReady: { zh: '小星球还没有准备好。', en: 'The little planet is not ready yet.' },
  saved: { zh: '已有进度', en: 'Saved journey' },
  pageProgress: { zh: '本页进度，刷新后可能丢失', en: 'Progress on this page; a reload may lose it' },
  threadsConnected: { zh: '已接通 {count} / {total} 根线', en: '{count} of {total} threads connected' },

  // Credits
  credits: { zh: '制作信息', en: 'Credits' },
  creditsClose: { zh: '关闭制作信息', en: 'Close credits' },
  creditsTitle: { zh: '制作信息', en: 'Credits' },
  creditsMadeBy: { zh: '制作：Maker Jackie', en: 'Made by Maker Jackie' },
  creditsFollow: { zh: '抖音 · 小红书 · B站 · 公众号 · X 全网同名：Maker Jackie', en: 'Find Maker Jackie on X (@maker_jackie), Bilibili, Xiaohongshu, Douyin and WeChat' },
  creditsOriginal: { zh: '所有美术、角色和故事都是原创，由代码生成。', en: 'All art, characters and story are original, generated in code.' },
  creditsAudio: { zh: '所有声音都是实时合成的。', en: 'All sound is synthesized live.' },
  creditsInspired: { zh: '灵感来自 abeto 的 Messenger 等小星球游戏。', en: 'Inspired by small-planet games such as Messenger by abeto.' },
  sourceCode: { zh: '源代码', en: 'Source code' },
  creditsSource: { zh: '源代码以 MIT 协议在 GitHub 开源', en: 'Source code on GitHub, MIT license' },

  // HUD
  objective: { zh: '当前目标', en: 'Current objective' },
  compass: { zh: '目标方向', en: 'Destination compass' },
  spool: { zh: '线轴', en: 'Spool' },
  spoolLeft: { zh: '线轴还剩 {percent}%', en: '{percent}% of the thread left' },
  reelHint: { zh: '收线', en: 'Reel in' },
  reelTaut: { zh: '线绷紧了 · 收线', en: 'Thread is taut · reel in' },
  touchJump: { zh: '跳跃', en: 'Jump' },
  touchInteract: { zh: '互动', en: 'Interact' },
  touchReel: { zh: '收线', en: 'Reel in' },
  joystick: { zh: '拖动摇杆走动', en: 'Drag the joystick to move' },
  hintMove: { zh: '走动', en: 'Move' },
  hintJump: { zh: '跳', en: 'Jump' },
  hintRun: { zh: '快跑', en: 'Run' },
  hintMenu: { zh: '菜单', en: 'Menu' },
  hintJournal: { zh: '手册', en: 'Journal' },

  // Dialogue
  dialogue: { zh: '人物对话', en: 'Conversation' },
  dialogueClose: { zh: '暂时结束对话', en: 'Leave the conversation for now' },
  dialogueKeys: { zh: 'Enter / E / 点击继续 · Esc 关闭', en: 'Enter / E / click to continue · Esc to close' },
  continue: { zh: '继续', en: 'Continue' },

  // Help
  help: { zh: '操作帮助', en: 'Controls' },
  helpOpen: { zh: '查看操作帮助', en: 'Show controls' },
  helpClose: { zh: '关闭帮助', en: 'Close controls' },
  helpTitle: { zh: '怎么玩', en: 'How to play' },
  helpIntro: { zh: '背着线轴走一走，线会铺在你走过的路上。把线从源头牵到需要它的地方，颜色就会漫开。', en: 'Walk with your spool and the thread lays down along your path. Carry it from a source to whatever needs it, and color spreads.' },
  helpMove: { zh: '走动', en: 'Move' },
  helpJump: { zh: '跳跃', en: 'Jump' },
  helpRun: { zh: '快跑', en: 'Run' },
  helpInteract: { zh: '交谈 · 拿起线头 · 接上', en: 'Talk · pick up thread · connect' },
  helpReel: { zh: '收线', en: 'Reel in' },
  helpOrbit: { zh: '转动视角', en: 'Look around' },
  helpZoom: { zh: '拉近拉远', en: 'Zoom' },
  helpJournal: { zh: '连接手册', en: 'Connections journal' },
  helpMenu: { zh: '设置 · 关闭窗口', en: 'Settings · close a window' },
  keyArrows: { zh: '/ 方向键', en: '/ arrow keys' },
  keySpace: { zh: '空格', en: 'Space' },
  keyDrag: { zh: '拖动鼠标', en: 'Drag' },
  keyWheel: { zh: '滚轮', en: 'Wheel' },
  helpTouch: { zh: '手机上：拖动左下的摇杆走动，右下的按钮用来跳跃、互动和收线。', en: 'On a phone: drag the joystick at the lower left to walk; the buttons at the lower right jump, interact and reel in.' },
  helpDone: { zh: '好，出发！', en: 'Let’s go!' },

  // Settings
  settings: { zh: '设置', en: 'Settings' },
  settingsOpen: { zh: '打开设置', en: 'Open settings' },
  settingsClose: { zh: '关闭设置', en: 'Close settings' },
  soundLabel: { zh: '声音', en: 'Sound' },
  guidesLabel: { zh: '方向提示', en: 'Direction guide' },
  guidesDetail: { zh: '在目标卡片上显示指南针。', en: 'Show a compass on the objective card.' },
  soundDetail: { zh: '音乐盒、海浪和风声。', en: 'Music box, waves and wind.' },
  languageLabel: { zh: '语言', en: 'Language' },
  on: { zh: '开', en: 'On' },
  off: { zh: '关', en: 'Off' },

  // Journal
  journalOpen: { zh: '打开连接手册', en: 'Open connections journal' },
  journalShortcut: { zh: '连接手册 · J', en: 'Connections · J' },
  journalClose: { zh: '关闭连接手册', en: 'Close journal' },
  journalTitle: { zh: '连接手册', en: 'Connections' },
  journalCount: { zh: '已连接 {count} / {total}', en: '{count} / {total} connected' },
  journalNote: { zh: '把线连起来，星球就会亮起来。进度会自动保存。', en: 'Connect the threads and the planet lights up. Your progress saves automatically.' },
  journalUnavailable: { zh: '浏览器无法保存进度，刷新或关闭本页可能会丢失。', en: 'Your browser cannot save progress; reloading or closing this page may lose it.' },
  statusLocked: { zh: '还没解锁', en: 'Locked' },
  statusAvailable: { zh: '可以开始', en: 'Ready' },
  statusDone: { zh: '已连接', en: 'Connected' },

  // Start over
  resetTitle: { zh: '重新开始？', en: 'Start over?' },
  resetDetail: { zh: '这会清除星球上所有的线和进度，从头开始。', en: 'This clears every thread and all progress on your planet, and begins again.' },
  keepProgress: { zh: '保留我的星球', en: 'Keep my planet' },

  // Chapter end and postcard
  chapterStats: { zh: '九根线都接上了，整颗星球亮了起来。', en: 'All nine threads are connected and the whole planet glows.' },
  makePostcard: { zh: '做一张明信片', en: 'Make a postcard' },
  wander: { zh: '继续漫游', en: 'Keep wandering' },
  postcardOpen: { zh: '做一张明信片', en: 'Make a postcard' },
  postcardPreview: { zh: '明信片预览', en: 'Postcard preview' },
  postcardClose: { zh: '关闭明信片', en: 'Close postcard' },
  postcardSaved: { zh: '明信片已保存。', en: 'Postcard saved.' },
  postcardShared: { zh: '明信片已分享。', en: 'Postcard shared.' },
  postcardFailed: { zh: '这次没能保存明信片，请再试一次。', en: 'The postcard could not be saved. Please try again.' },
  postcardPreparing: { zh: '正在洗照片…', en: 'Developing the photo…' },
} as const;

export type UICopyKey = keyof typeof UI_COPY;
export type CopyResolver = string | (() => string);

export function uiCopy(key: UICopyKey, values: Record<string, string | number> = {}): string {
  const language = getLanguage();
  const copy = language === 'zh' || language === 'en' ? UI_COPY[key][language] : ADDITIONAL_LOCALES[language].ui[key];
  return copy.replace(/\{(\w+)\}/g, (placeholder, name: string) => String(values[name] ?? placeholder));
}

export function resolveCopy(copy: CopyResolver): string {
  return typeof copy === 'function' ? copy() : copy;
}
