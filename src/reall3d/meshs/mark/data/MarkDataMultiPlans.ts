// ==============================================
// Copyright (c) 2025 reall3d.com, MIT license
// ==============================================
import { MarkData } from './MarkData';

/**
 * 多三角面数据
 */
export interface MarkDataMultiPlans extends MarkData {
    /** 点 */
    points?: number[];
    /** 线颜色(面颜色共用)，默认 #eeee00 */
    lineColor?: string;
    /** 线宽，默认 3 */
    lineWidth?: number;
    /** 主标签字体颜色，默认 #c4c4c4  */
    mainTagColor?: string;
    /** 主标签背景颜色，默认 #2E2E30  */
    mainTagBackground?: string;
    /** 主标签透明度，默认 0.8  */
    mainTagOpacity?: number;
    /** 主标签标签是否显示，默认 true  */
    mainTagVisible?: boolean;
    /** 面积标签字体颜色，默认 #000000  */
    areaTagColor?: string;
    /** 面积标签背景颜色，默认 #e0ffff  */
    areaTagBackground?: string;
    /** 面积标签透明度，默认 0.9  */
    areaTagOpacity?: number;
    /** 面积标签是否显示，默认 true */
    areaTagVisible?: boolean;
    /** 距离标签是否显示，默认 true */
    distanceTagVisible?: boolean;
    /** 面透明度，默认 0.5  */
    planOpacity?: number;
    /** 标题 */
    title?: string;
    /** 说明 */
    note?: string;

    clickable?: boolean;
}
