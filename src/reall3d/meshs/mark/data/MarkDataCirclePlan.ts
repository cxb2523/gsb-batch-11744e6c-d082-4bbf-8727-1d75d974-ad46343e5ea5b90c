// ==============================================
// Copyright (c) 2025 reall3d.com, MIT license
// ==============================================
import { MarkData } from './MarkData';

/**
 * 圆面数据
 */
export interface MarkDataCirclePlan extends MarkData {
    /** 圆心点 */
    startPoint?: number[];
    /** 圆半径 */
    radius?: number;
    /** 圆颜色，默认 #eeee00 */
    circleColor?: string;
    /** 圆颜色透明度，默认0.5 */
    circleOpacity?: number;
    /** 主标签字体颜色，默认 #c4c4c4  */
    mainTagColor?: string;
    /** 主标签背景颜色，默认 #2E2E30  */
    mainTagBackground?: string;
    /** 主标签透明度，默认 0.8  */
    mainTagOpacity?: number;
    /** 主标签标签是否显示，默认 true  */
    mainTagVisible?: boolean;
    /** 标签字体颜色，默认 #000000  */
    circleTagColor?: string;
    /** 标签背景颜色，默认 #e0ffff  */
    circleTagBackground?: string;
    /** 标签透明度，默认 0.9  */
    circleTagOpacity?: number;
    /** 标签是否显示，默认 true */
    circleTagVisible?: boolean;
    /** 标题 */
    title?: string;
    /** 说明 */
    note?: string;
}
