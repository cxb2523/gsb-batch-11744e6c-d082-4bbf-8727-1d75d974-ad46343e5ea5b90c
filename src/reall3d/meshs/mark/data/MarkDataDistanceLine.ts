// ==============================================
// Copyright (c) 2025 reall3d.com, MIT license
// ==============================================
import { MarkData } from './MarkData';

/**
 * 距离测量线数据
 */
export interface MarkDataDistanceLine extends MarkData {
    /** 起点 */
    startPoint?: number[];
    /** 终点 */
    endPoint?: number[];
    /** 线颜色，默认 #eeee00 */
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
    /** 标签字体颜色，默认 #000000  */
    distanceTagColor?: string;
    /** 标签背景颜色，默认 #e0ffff  */
    distanceTagBackground?: string;
    /** 标签透明度，默认 0.9  */
    distanceTagOpacity?: number;
    /** 距离标签是否显示，默认 true */
    distanceTagVisible?: boolean;
    /** 标题 */
    title?: string;
    /** 说明 */
    note?: string;
}
