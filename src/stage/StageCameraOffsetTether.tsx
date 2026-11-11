/**
 * 3D Visual Tether Line & Anchor Marker for Camera Target Offsets inside the Diorama.
 *
 * Visualizes:
 *   1. An anchor beacon at the subject's un-offset look anchor (baseTarget)
 *   2. A subtle dashed blueprint tether line connecting baseTarget -> target
 *
 * Performance Architecture:
 *   - Imperative 60fps/144fps transform and buffer attribute updates in useFrame.
 *   - Uses native THREE.Line via <primitive /> to avoid React SVG line element collisions.
 *   - Zero JSX prop thrashing and zero 10Hz React reconciliation jitter.
 *   - Automatically hides itself when targetOffset magnitude is negligible (< 0.01m).
 */

import React, { useRef, useMemo, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { StageFrame } from '../core/types';

export interface StageCameraOffsetTetherProps {
  frameRef: React.RefObject<StageFrame>;
  uiFrame: StageFrame;
  color?: string;
  visible?: boolean;
}

export const StageCameraOffsetTether: React.FC<StageCameraOffsetTetherProps> = ({
  frameRef,
  uiFrame,
  color = '#06b6d4',
  visible = true,
}) => {
  const groupRef = useRef<THREE.Group | null>(null);
  const anchorMeshRef = useRef<THREE.Mesh | null>(null);

  // Native THREE.Line pre-allocated once to avoid SVG JSX collisions and GC pressure
  const { lineObject, geo } = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(new Float32Array(6), 3);
    geometry.setAttribute('position', posAttr);
    const material = new THREE.LineDashedMaterial({
      color,
      dashSize: 0.08,
      gapSize: 0.05,
      linewidth: 1.5,
      transparent: true,
      opacity: 0.85,
    });
    const line = new THREE.Line(geometry, material);
    return { lineObject: line, geo: geometry };
  }, [color]);

  const updateTetherTransform = (frame: StageFrame | null) => {
    if (!groupRef.current) return;
    if (!visible) {
      groupRef.current.visible = false;
      return;
    }

    const cam = frame?.stageCamera ?? uiFrame.stageCamera;
    const offset = cam.targetOffset;
    const offsetMag = offset
      ? Math.hypot(offset.x, offset.y, offset.z)
      : 0;

    if (offsetMag < 0.01 || !cam.baseTarget) {
      groupRef.current.visible = false;
      return;
    }

    groupRef.current.visible = true;

    const base = cam.baseTarget;
    const aim = cam.transform.target;

    // 1. Position anchor beacon at subject's original anchor point
    if (anchorMeshRef.current) {
      anchorMeshRef.current.position.set(base.x, base.y, base.z);
    }

    // 2. Update line vertices between baseTarget and target
    const posAttr = geo.attributes.position as THREE.BufferAttribute | undefined;
    if (posAttr) {
      posAttr.setXYZ(0, base.x, base.y, base.z);
      posAttr.setXYZ(1, aim.x, aim.y, aim.z);
      posAttr.needsUpdate = true;
      lineObject.computeLineDistances();
    }
  };

  // Synchronous pre-paint alignment
  useLayoutEffect(() => {
    updateTetherTransform(frameRef.current);
  });

  // Imperative 60fps/144fps frame update
  useFrame(() => {
    updateTetherTransform(frameRef.current);
  });

  return (
    <group ref={groupRef} visible={false}>
      {/* 1. Un-offset Subject Anchor Beacon */}
      <mesh ref={anchorMeshRef}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.6}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>

      {/* 2. Dashed Blueprint Tether Line from baseTarget to target */}
      <primitive object={lineObject} />
    </group>
  );
};
