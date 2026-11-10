// ==============================================
// Copyright (c) 2025 reall3d.com, MIT license
// ==============================================
import { MarkData } from './MarkData';

/**
 * 单点数据
 */
export interface MarkDataSinglePoint extends MarkData {
    /** 点位置 */
    point?: number[];
    /** 图标名称，默认 'pointIcon1' */
    iconName?: string;
    /** 图标颜色，默认 #F78A14 */
    iconColor?: string;
    /** 图标透明度，默认 0.8  */
    iconOpacity?: number;
    /** 主标签字体颜色，默认 #c4c4c4 */
    mainTagColor?: string;
    /** 主标签背景颜色，默认 #2E2E30 */
    mainTagBackground?: string;
    /** 主标签透明度，默认 0.8  */
    mainTagOpacity?: number;
    /** 标题 */
    title?: string;
    /** 说明 */
    note?: string;
}
