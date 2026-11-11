import { japanese } from './ja';
import { korean } from './ko';
import { traditionalChinese } from './zh-hant';
import type { LocaleCopy } from '../locale-types';

export const ADDITIONAL_LOCALES: Record<'zh-Hant' | 'ja' | 'ko', LocaleCopy> = {
  'zh-Hant': traditionalChinese, ja: japanese, ko: korean,
};
