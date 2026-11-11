/**
 * Minimalist Blueprint Architectural Floor Grid & Compass Reference.
 * 1 unit = 1 meter. Y = 0 is the stage floor plane.
 * Dynamically reacts to the active theme palette with zero extra draw calls.
 */

import React, { useMemo } from 'react';
import { Grid, Line, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { AppThemeCategory, CameraViewMode } from '../core/types';
import { getDioramaThemeColors } from './dioramaTheme';

export interface BlueprintFloorGridProps {
  width: number;
  depth: number;
  gridStep: number;
  showLabels?: boolean;
  cameraMode?: CameraViewMode;
  themeCategory?: AppThemeCategory;
}

export const BlueprintFloorGrid: React.FC<BlueprintFloorGridProps> = ({
  width,
  depth,
  gridStep,
  showLabels = true,
  cameraMode,
  themeCategory = 'light',
}) => {
  const halfW = width * 0.5;
  const halfD = depth * 0.5;
  const isStagePov = cameraMode === 'stage-pov';
  const themeColors = useMemo(
    () => getDioramaThemeColors(themeCategory),
    [themeCategory]
  );

  // Perimeter stage boundary rectangle
  const borderPoints = useMemo<Array<[number, number, number]>>(
    () => [
      [-halfW, 0.005, -halfD],
      [halfW, 0.005, -halfD],
      [halfW, 0.005, halfD],
      [-halfW, 0.005, halfD],
      [-halfW, 0.005, -halfD],
    ],
    [halfW, halfD]
  );

  // Origin center crosshairs (X and Z axes)
  const xAxisPoints = useMemo<Array<[number, number, number]>>(
    () => [
      [-halfW, 0.006, 0],
      [halfW, 0.006, 0],
    ],
    [halfW]
  );
  const zAxisPoints = useMemo<Array<[number, number, number]>>(
    () => [
      [0, 0.006, -halfD],
      [0, 0.006, halfD],
    ],
    [halfD]
  );

  const ringGeom = useMemo(
    () => new THREE.RingGeometry(0.18, 0.21, 32),
    []
  );

  return (
    <group>
      {/* Subtle matte ground floor to anchor shadows/grids */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[width * 2.4, depth * 2.4]} />
        <meshBasicMaterial
          color={themeColors.floorColor}
          transparent
          opacity={themeColors.floorOpacity}
        />
      </mesh>

      {/* Dual-cadence precision metric grid (1m major, 0.25m minor) */}
      <Grid
        position={[0, 0, 0]}
        args={[width, depth]}
        cellSize={gridStep * 0.25}
        cellThickness={0.5}
        cellColor={themeColors.gridCell}
        sectionSize={gridStep}
        sectionThickness={1.1}
        sectionColor={themeColors.gridSection}
        fadeDistance={28}
        fadeStrength={1.2}
        infiniteGrid
      />

      {/* Active Stage Perimeter Frame */}
      <Line
        points={borderPoints}
        color={themeColors.borderLine}
        lineWidth={1.2}
        transparent
        opacity={themeColors.borderOpacity}
      />

      {/* Center X & Z Axis Guides */}
      <Line
        points={xAxisPoints}
        color={themeColors.axisLine}
        lineWidth={1}
        transparent
        opacity={0.3}
      />
      <Line
        points={zAxisPoints}
        color={themeColors.axisLine}
        lineWidth={1}
        transparent
        opacity={0.3}
      />

      {/* Origin (0,0,0) Center Reticle */}
      <mesh
        geometry={ringGeom}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.008, 0]}
      >
        <meshBasicMaterial
          color={themeColors.ringColor}
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Cardinal Stage Orientation Markers */}
      {showLabels && !isStagePov && (
        <>
          <Text
            position={[0, 0.005, halfD + 0.55]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.24}
            color={themeColors.borderLine}
            anchorX="center"
            anchorY="middle"
            letterSpacing={0.14}
            fillOpacity={0.75}
          >
            +Z · DOWNSTAGE / FRONT
          </Text>

          <Text
            position={[0, 0.005, -halfD - 0.55]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.24}
            color={themeColors.axisLine}
            anchorX="center"
            anchorY="middle"
            letterSpacing={0.14}
            fillOpacity={0.7}
          >
            -Z · UPSTAGE / BACK
          </Text>
        </>
      )}
    </group>
  );
};
