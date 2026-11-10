// ==============================================
// Copyright (c) 2025 reall3d.com, MIT license
// ==============================================
import { Object3D, BufferGeometry, LineBasicMaterial, LineSegments, Vector3, Float32BufferAttribute } from 'three';

export class BoundBox extends Object3D {
    private boxLines: LineSegments;
    public mins: number[] = [0, 0, 0];
    public maxs: number[] = [0, 0, 0];

    constructor(minX: number = 0, minY: number = 0, minZ: number = 0, maxX: number = 0, maxY: number = 0, maxZ: number = 0) {
        super();
        const that = this;
        that.mins = [minX, minY, minZ];
        that.maxs = [maxX, maxY, maxZ];
        const geometry = new BufferGeometry();
        const material = new LineBasicMaterial({ color: '#ffffff' });
        // material.transparent = true;
        // material.depthTest = false;
        // material.depthWrite = false;

        that.boxLines = new LineSegments(geometry, material);
        that.update(minX, minY, minZ, maxX, maxY, maxZ);
        that.add(that.boxLines);
    }

    public update(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, show?: boolean): void {
        // 每条线的长度为对应边长的1/5
        const lineLengthX = (maxX - minX) / 8;
        const lineLengthY = (maxY - minY) / 8;
        const lineLengthZ = (maxZ - minZ) / 8;
        // 定义包围盒的8个顶点
        const boxVertices = [
            new Vector3(minX, minY, minZ), // 左下前
            new Vector3(maxX, minY, minZ), // 右下前
            new Vector3(maxX, maxY, minZ), // 右上前
            new Vector3(minX, maxY, minZ), // 左上前
            new Vector3(minX, minY, maxZ), // 左下后
            new Vector3(maxX, minY, maxZ), // 右下后
            new Vector3(maxX, maxY, maxZ), // 右上后
            new Vector3(minX, maxY, maxZ), // 左上后
        ];
        // 存储所有线的顶点
        const positions: number[] = [];
        // 为每个顶点添加三条线
        boxVertices.forEach(vertex => {
            // X方向
            positions.push(vertex.x, vertex.y, vertex.z);
            positions.push(vertex.x + (vertex.x < maxX ? lineLengthX : -lineLengthX), vertex.y, vertex.z);
            // Y方向
            positions.push(vertex.x, vertex.y, vertex.z);
            positions.push(vertex.x, vertex.y + (vertex.y < maxY ? lineLengthY : -lineLengthY), vertex.z);
            // Z方向
            positions.push(vertex.x, vertex.y, vertex.z);
            positions.push(vertex.x, vertex.y, vertex.z + (vertex.z < maxZ ? lineLengthZ : -lineLengthZ));
        });

        // 更新几何体的顶点
        this.boxLines.geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
        show && (this.visible = true);
    }

    public dispose(): void {
        this.boxLines = null;
    }
}
