/**
 * 3D Depth-of-Field (DoF) Near/Far Limit Brackets & World-Space Focus Target Tether.
 *
 * Renders:
 *   1. StageCameraDofBrackets (local rolled camera space):
 *      - Near Sharpness Limit Frame (D_near) and Far Sharpness Limit Frame (D_far)
 *        scaled imperatively at 60fps/144fps in useFrame.
 *   2. StageCameraFocusTether (world space):
 *      - Emerald target beacon at `dof.focusTargetPoint` and dashed tether line
 *        connecting the optical-axis Focus Plane center to off-axis focus subjects.
 *
 * Performance Architecture:
 *   - Imperative 60fps/144fps transform updates in useFrame (0 React re-renders).
 *   - Automatically hides brackets when `dof.enabled === false` (`dof: 'deep'`).
 */

import React, { useRef, useMemo, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { StageFrame } from '../core/types';
import { BLUEPRINT_PALETTE, OPTICS_DOF_DEFAULTS } from '../core/constants';
import { computeFrustumGateDimensions } from '../core/opticsMath';

const UNIT_PLANE_FRAME: Array<[number, number, number]> = [
  [-1, 1, 0],
  [1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [-1, 1, 0],
];

export interface StageCameraDofBracketsProps {
  frameRef: React.RefObject<StageFrame>;
  uiFrame: StageFrame;
  color?: string;
}

export const StageCameraDofBrackets: React.FC<StageCameraDofBracketsProps> = ({
  frameRef,
  uiFrame,
  color = BLUEPRINT_PALETTE.focusTether,
}) => {
  const rootGroupRef = useRef<THREE.Group | null>(null);
  const nearGroupRef = useRef<THREE.Group | null>(null);
  const farGroupRef = useRef<THREE.Group | null>(null);

  const syncBrackets = (liveFrame: StageFrame | null) => {
    if (!rootGroupRef.current) return;

    const committedCam = uiFrame.stageCamera;
    const isShotDesynced =
      Boolean(liveFrame?.stageCamera.shotId) &&
      Boolean(committedCam.shotId) &&
      liveFrame?.stageCamera.shotId !== committedCam.shotId;

    const cam = isShotDesynced
      ? committedCam
      : liveFrame?.stageCamera ?? committedCam;
    const dof = cam.dof;

    if (!dof || !dof.enabled) {
      rootGroupRef.current.visible = false;
      return;
    }

    rootGroupRef.current.visible = true;
    const focalLengthMm = cam.transform.pose.focalLengthMm;
    const aspectRatio = cam.transform.aspectRatio;
    const nearDepth = Math.max(0.15, dof.nearLimitM);
    const maxVisFar =
      Math.max(cam.transform.pose.distance, dof.focusDistanceM) +
      OPTICS_DOF_DEFAULTS.MAX_VISUAL_FAR_EXTENSION_M;
    const farDepth = Math.max(
      nearDepth + 0.05,
      Math.min(dof.farLimitM, maxVisFar)
    );

    const nearGate = computeFrustumGateDimensions(
      focalLengthMm,
      nearDepth,
      aspectRatio
    );
    const farGate = computeFrustumGateDimensions(
      focalLengthMm,
      farDepth,
      aspectRatio
    );

    if (nearGroupRef.current) {
      nearGroupRef.current.position.set(0, 0, nearDepth);
      nearGroupRef.current.scale.set(
        nearGate.halfWidth,
        nearGate.halfHeight,
        1
      );
    }

    if (farGroupRef.current) {
      farGroupRef.current.position.set(0, 0, farDepth);
      farGroupRef.current.scale.set(farGate.halfWidth, farGate.halfHeight, 1);
    }
  };

  useLayoutEffect(() => {
    syncBrackets(frameRef.current);
  });

  useFrame(() => {
    syncBrackets(frameRef.current);
  });

  return (
    <group ref={rootGroupRef} visible={false}>
      {/* 1. Near Sharpness Limit Bracket (D_near) */}
      <group ref={nearGroupRef}>
        <Line
          points={UNIT_PLANE_FRAME}
          color={color}
          lineWidth={1.4}
          dashed
          dashScale={14}
          dashSize={0.18}
          gapSize={0.12}
          transparent
          opacity={0.75}
        />
      </group>

      {/* 2. Far Sharpness Limit Bracket (D_far) */}
      <group ref={farGroupRef}>
        <Line
          points={UNIT_PLANE_FRAME}
          color={color}
          lineWidth={1.4}
          dashed
          dashScale={14}
          dashSize={0.18}
          gapSize={0.12}
          transparent
          opacity={0.75}
        />
      </group>
    </group>
  );
};

export interface StageCameraFocusTetherProps {
  frameRef: React.RefObject<StageFrame>;
  uiFrame: StageFrame;
  visible?: boolean;
  color?: string;
}

export const StageCameraFocusTether: React.FC<StageCameraFocusTetherProps> = ({
  frameRef,
  uiFrame,
  visible = true,
  color = BLUEPRINT_PALETTE.focusTether,
}) => {
  const groupRef = useRef<THREE.Group | null>(null);
  const beaconMeshRef = useRef<THREE.Mesh | null>(null);

  const { lineObject, geo } = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(new Float32Array(6), 3);
    geometry.setAttribute('position', posAttr);
    const material = new THREE.LineDashedMaterial({
      color,
      dashSize: 0.09,
      gapSize: 0.06,
      linewidth: 1.5,
      transparent: true,
      opacity: 0.85,
    });
    const line = new THREE.Line(geometry, material);
    return { lineObject: line, geo: geometry };
  }, [color]);

  const syncFocusTether = (liveFrame: StageFrame | null) => {
    if (!groupRef.current) return;
    if (!visible) {
      groupRef.current.visible = false;
      return;
    }

    const committedCam = uiFrame.stageCamera;
    const isShotDesynced =
      Boolean(liveFrame?.stageCamera.shotId) &&
      Boolean(committedCam.shotId) &&
      liveFrame?.stageCamera.shotId !== committedCam.shotId;

    const cam = isShotDesynced
      ? committedCam
      : liveFrame?.stageCamera ?? committedCam;
    const dof = cam.dof;
    const focusPt = dof?.focusTargetPoint;

    if (!focusPt || !dof.hasExplicitFocus) {
      groupRef.current.visible = false;
      return;
    }

    const eye = cam.transform.position;
    const lookTarget = cam.transform.target;
    const offAxisDelta = Math.hypot(
      focusPt.x - lookTarget.x,
      focusPt.y - lookTarget.y,
      focusPt.z - lookTarget.z
    );

    if (offAxisDelta < 0.05) {
      groupRef.current.visible = false;
      return;
    }

    groupRef.current.visible = true;

    // Compute optical-axis center on the Focus Plane: E + d_focus * F_hat
    const dx = lookTarget.x - eye.x;
    const dy = lookTarget.y - eye.y;
    const dz = lookTarget.z - eye.z;
    const lookLen = Math.max(1e-6, Math.hypot(dx, dy, dz));
    const scale = dof.focusDistanceM / lookLen;
    const planeCenterX = eye.x + dx * scale;
    const planeCenterY = eye.y + dy * scale;
    const planeCenterZ = eye.z + dz * scale;

    if (beaconMeshRef.current) {
      beaconMeshRef.current.position.set(focusPt.x, focusPt.y, focusPt.z);
    }

    const posAttr = geo.attributes.position as
      | THREE.BufferAttribute
      | undefined;
    if (posAttr) {
      posAttr.setXYZ(0, planeCenterX, planeCenterY, planeCenterZ);
      posAttr.setXYZ(1, focusPt.x, focusPt.y, focusPt.z);
      posAttr.needsUpdate = true;
      lineObject.computeLineDistances();
    }
  };

  useLayoutEffect(() => {
    syncFocusTether(frameRef.current);
  });

  useFrame(() => {
    syncFocusTether(frameRef.current);
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh ref={beaconMeshRef}>
        <sphereGeometry args={[0.048, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.65}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>
      <primitive object={lineObject} />
    </group>
  );
};

