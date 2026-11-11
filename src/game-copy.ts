import { getLanguage } from './i18n';
import { ADDITIONAL_LOCALES } from './locales';

/** Short system lines used by main.ts: page metadata, loading, save and error notices.
 * Story and dialogue copy lives in src/chapter/script.ts. */
const zh = {
  pageTitle: '毛线星球 · Yarn Planet', description: '背着线团走过小星球，你走过的路会变成一根彩线。', canvas: '毛线星球的小星球场景',
  loadingExpand: '正在展开这颗小星球…', loadingThread: '正在给线轴绕线…', loadingPaint: '正在调颜料…', ready: '小星球已经准备好了。',
  saveUnavailable: '进度暂时无法保存，请保持本页打开。', invalidSave: '旧的进度读不出来，已经从新的旅程开始。',
  contextLost: '画面暂时中断了，重试后会回到你保存的进度。', contextLostNoSave: '画面暂时中断了，当前浏览器无法保存进度。',
  loadError: '小星球没能展开，请重试。', farewell: '再会',
} as const;
const en: Record<keyof typeof zh, string> = {
  pageTitle: 'Yarn Planet · 毛线星球', description: 'Carry a spool across a little planet; the path you walk becomes a colored thread.', canvas: 'Yarn Planet little-planet scene',
  loadingExpand: 'Unfolding this little planet…', loadingThread: 'Winding the spool…', loadingPaint: 'Mixing the colors…', ready: 'Your little planet is ready.',
  saveUnavailable: 'Progress cannot be saved right now. Please keep this page open.', invalidSave: 'The old save could not be read, so a new journey has begun.',
  contextLost: 'The picture was interrupted. Reload to return to your saved progress.', contextLostNoSave: 'The picture was interrupted, and this browser cannot save progress.',
  loadError: 'The little planet could not unfold. Please try again.', farewell: 'See you',
};
export type GameTextKey = keyof typeof zh;
export const GAME_COPY = { zh, en } as const;

export function gameText(key: GameTextKey, values: Record<string, string | number> = {}): string {
  const language = getLanguage();
  const copy = language === 'zh' ? zh[key] : language === 'en' ? en[key] : ADDITIONAL_LOCALES[language].game[key];
  return copy.replace(/\{(\w+)\}/g, (token, name: string) => String(values[name] ?? token));
}
