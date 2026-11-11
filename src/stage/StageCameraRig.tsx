/**
 * Illustrative 3D Stage Camera Rig inside the diorama.
 * Renders:
 *   1. Blueprint camera body + cinema lens barrel + matte box
 *   2. Rectangular Cinematic Gate Frustum (16:9 / 2.39:1) matching lens focal length (mm)
 *   3. Luminous Focus Plane Frame + Reticle at the look-at target distance
 *   4. 3D Trajectory Path Curve across the active shot
 *
 * Performance Architecture:
 *   - Camera chassis position and lookAt update imperatively at native 60fps/144fps in useFrame.
 *   - Frustum pyramid and rectangular gate frame are normalized unit geometries scaled imperatively
 *     at native 60fps/144fps (zero 10Hz React reconciliation jitter).
 *   - Shot boundary cuts are gated to committed uiFrame state for atomic multi-shot transitions.
 */

import React, { useRef, useMemo, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { CameraViewMode, LabelDisplayMode, StageFrame } from '../core/types';
import { computeFrustumGateDimensions } from '../core/opticsMath';
import { StageBillboardLabel } from './StageBillboardLabel';
import {
  StageCameraDofBrackets,
  StageCameraFocusTether,
} from './StageCameraFocusRig';
import { StageCameraOffsetTether } from './StageCameraOffsetTether';
import { StageCameraRigMount } from './StageCameraRigMount';

/**
 * Static normalized unit frustum pyramid coordinates (depth Z = 1, bounds [-1, 1]).
 * Scaled imperatively at 60fps/144fps by (gate.halfWidth, gate.halfHeight, frustumDepth).
 */
const UNIT_FRUSTUM = {
  rays: [
    [[0, 0, 0], [-1, 1, 1]],
    [[0, 0, 0], [1, 1, 1]],
    [[0, 0, 0], [1, -1, 1]],
    [[0, 0, 0], [-1, -1, 1]],
  ] as Array<Array<[number, number, number]>>,
  sightLine: [
    [0, 0, 0],
    [0, 0, 1],
  ] as Array<[number, number, number]>,
  gateFrame: [
    [-1, 1, 0],
    [1, 1, 0],
    [1, -1, 0],
    [-1, -1, 0],
    [-1, 1, 0],
  ] as Array<[number, number, number]>,
  ruleOfThirdsH1: [
    [-1, 1 / 3, 0],
    [1, 1 / 3, 0],
  ] as Array<[number, number, number]>,
  ruleOfThirdsH2: [
    [-1, -1 / 3, 0],
    [1, -1 / 3, 0],
  ] as Array<[number, number, number]>,
};

export interface StageCameraRigProps {
  frameRef: React.RefObject<StageFrame>;
  cameraMode: CameraViewMode;
  uiFrame: StageFrame;
  labelMode?: LabelDisplayMode;
}

export const StageCameraRig: React.FC<StageCameraRigProps> = ({
  frameRef,
  cameraMode,
  uiFrame,
  labelMode = 'all',
}) => {
  const rigGroupRef = useRef<THREE.Group | null>(null);
  const rollGroupRef = useRef<THREE.Group | null>(null);
  const trajectoryGroupRef = useRef<THREE.Group | null>(null);
  const frustumGroupRef = useRef<THREE.Group | null>(null);
  const focusPlaneGroupRef = useRef<THREE.Group | null>(null);
  const targetRingRef = useRef<THREE.Mesh | null>(null);

  const stageCam = uiFrame.stageCamera;
  const pose = stageCam.transform.pose;
  const color = stageCam.frustumColor || '#f59e0b';

  const syncFrustumAndFocus = (liveCam: StageFrame['stageCamera']) => {
    const dof = liveCam.dof;
    const focusDepth =
      dof && (dof.hasExplicitFocus || dof.enabled)
        ? dof.focusDistanceM
        : liveCam.frustumDepth;
    const coneDepth = Math.max(liveCam.frustumDepth, focusDepth);

    const coneGate = computeFrustumGateDimensions(
      liveCam.transform.pose.focalLengthMm,
      coneDepth,
      liveCam.transform.aspectRatio
    );
    const focusGate = computeFrustumGateDimensions(
      liveCam.transform.pose.focalLengthMm,
      focusDepth,
      liveCam.transform.aspectRatio
    );

    if (frustumGroupRef.current) {
      frustumGroupRef.current.scale.set(
        coneGate.halfWidth,
        coneGate.halfHeight,
        coneDepth
      );
    }

    if (focusPlaneGroupRef.current) {
      focusPlaneGroupRef.current.position.set(0, 0, focusDepth);
      focusPlaneGroupRef.current.scale.set(
        focusGate.halfWidth,
        focusGate.halfHeight,
        1
      );
    }

    if (targetRingRef.current) {
      targetRingRef.current.position.set(0, 0, focusDepth);
    }
  };

  // 3D trajectory path points in world space
  const trajectoryLinePoints = useMemo<Array<[number, number, number]>>(() => {
    if (!stageCam.showPath || stageCam.trajectoryPoints.length < 2) {
      return [];
    }
    return stageCam.trajectoryPoints.map((pt) => [pt.x, pt.y, pt.z]);
  }, [stageCam.showPath, stageCam.trajectoryPoints]);

  // Synchronous pre-paint setup to initialize transform and frustum scale before first paint
  useLayoutEffect(() => {
    if (!rigGroupRef.current) return;
    const liveFrame = frameRef.current;
    const isShotDesynced =
      Boolean(liveFrame?.stageCamera.shotId) &&
      Boolean(stageCam.shotId) &&
      liveFrame?.stageCamera.shotId !== stageCam.shotId;

    const effectiveTransform = isShotDesynced
      ? stageCam.transform
      : liveFrame?.stageCamera.transform ?? stageCam.transform;

    rigGroupRef.current.position.set(
      effectiveTransform.position.x,
      effectiveTransform.position.y,
      effectiveTransform.position.z
    );
    rigGroupRef.current.lookAt(
      effectiveTransform.target.x,
      effectiveTransform.target.y,
      effectiveTransform.target.z
    );

    if (rollGroupRef.current) {
      rollGroupRef.current.rotation.z = -effectiveTransform.pose.roll;
    }

    const liveCam = isShotDesynced
      ? stageCam
      : liveFrame?.stageCamera ?? stageCam;
    syncFrustumAndFocus(liveCam);
  }, [frameRef, stageCam]);

  // Update 3D position, orientation, and frustum scale imperatively at 60fps/144fps
  useFrame(() => {
    const liveFrame = frameRef.current;
    if (!liveFrame || !rigGroupRef.current) return;

    // Gated Cut: hold the 3D Stage Camera transform at the committed React shot
    // until React flushes the new shot to the DOM and JSX tree (~16ms).
    const isShotDesynced =
      Boolean(liveFrame.stageCamera.shotId) &&
      Boolean(stageCam.shotId) &&
      liveFrame.stageCamera.shotId !== stageCam.shotId;

    const transform = isShotDesynced
      ? stageCam.transform
      : liveFrame.stageCamera.transform;

    rigGroupRef.current.position.set(
      transform.position.x,
      transform.position.y,
      transform.position.z
    );
    rigGroupRef.current.lookAt(
      transform.target.x,
      transform.target.y,
      transform.target.z
    );

    if (rollGroupRef.current) {
      rollGroupRef.current.rotation.z = -transform.pose.roll;
    }

    // Update Frustum Pyramid scale and Focus Plane position at native 60fps/144fps
    const liveCam = isShotDesynced ? stageCam : liveFrame.stageCamera;
    syncFrustumAndFocus(liveCam);

    // Suppress trajectory path ghosting during the 1-frame async transition between shots
    if (trajectoryGroupRef.current) {
      trajectoryGroupRef.current.visible =
        stageCam.showPath && !isShotDesynced;
    }
  });

  // Hide the 3D camera body mesh when viewing directly through Stage Camera POV
  const isBodyVisible = cameraMode !== 'stage-pov';

  return (
    <group>
      {/* 0. Physical Blueprint Camera Rig Mount (Tripod Stand / Floor Dolly Rails & Cart) */}
      <StageCameraRigMount
        frameRef={frameRef}
        uiFrame={uiFrame}
        isBodyVisible={isBodyVisible}
        color={color}
      />

      {/* 1. World-Space 3D Trajectory Curve for Moving Shots */}
      {isBodyVisible && trajectoryLinePoints.length >= 2 && (
        <group ref={trajectoryGroupRef}>
          <Line
            points={trajectoryLinePoints}
            color={color}
            lineWidth={2}
            dashed
            dashScale={8}
            dashSize={0.35}
            gapSize={0.2}
            transparent
            opacity={0.75}
          />
          {/* Start & End Waypoint Beacons along the camera track */}
          <mesh position={trajectoryLinePoints[0]}>
            <sphereGeometry args={[0.055, 16, 16]} />
            <meshBasicMaterial color={color} />
          </mesh>
          <mesh
            position={trajectoryLinePoints[trajectoryLinePoints.length - 1]}
          >
            <octahedronGeometry args={[0.075, 0]} />
            <meshBasicMaterial color={color} />
          </mesh>
        </group>
      )}

      {/* 2. World-Space 3D Target Offset Tether & Anchor Beacon */}
      <StageCameraOffsetTether
        frameRef={frameRef}
        uiFrame={uiFrame}
        visible={isBodyVisible}
        color="#06b6d4"
      />

      {/* 2b. World-Space 3D Focus Target Tether (when focusing on off-axis entity) */}
      <StageCameraFocusTether
        frameRef={frameRef}
        uiFrame={uiFrame}
        visible={isBodyVisible}
      />

      {/* 3. 60fps/144fps Animated Stage Camera Rig Group */}
      <group ref={rigGroupRef}>
        {/* Floating Camera Lens & Maneuver Badge stays upright in unrolled parent group */}
        {isBodyVisible && (
          <>
            {labelMode !== 'off' && (
              <Line
                points={[
                  [0, 0.12, -0.14],
                  [0, 0.58, -0.14],
                ]}
                color={color}
                transparent
                opacity={0.45}
                lineWidth={1}
                dashed
                dashSize={0.04}
                gapSize={0.03}
              />
            )}
            <StageBillboardLabel
              position={[0, 0.72, -0.14]}
              label="CAM"
              sublabel={`${Math.round(pose.focalLengthMm)}mm · ${stageCam.maneuver.toUpperCase()}`}
              accentColor={color}
              kind="camera"
              highlighted
              ghosted={false}
              visible={labelMode !== 'off'}
            />
          </>
        )}

        {/* Rolled Group containing Camera Chassis, Barrel, and Frustum Gate */}
        <group ref={rollGroupRef}>
          {isBodyVisible && (
            <group>
              {/* Camera Body Chassis */}
              <mesh position={[0, 0, -0.14]}>
                <boxGeometry args={[0.24, 0.22, 0.28]} />
                <meshStandardMaterial
                  color="#0f172a"
                  emissive={color}
                  emissiveIntensity={0.25}
                  roughness={0.3}
                  metalness={0.7}
                />
              </mesh>

              {/* Cinema Lens Barrel & Matte Box at Nodal Point (0,0,0) */}
              <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.04]}>
                <cylinderGeometry args={[0.075, 0.085, 0.12, 20]} />
                <meshStandardMaterial
                  color="#1e293b"
                  emissive={color}
                  emissiveIntensity={0.4}
                />
              </mesh>

              {/* Top Carry Handle */}
              <mesh position={[0, 0.15, -0.14]}>
                <boxGeometry args={[0.05, 0.06, 0.2]} />
                <meshBasicMaterial color={color} transparent opacity={0.85} />
              </mesh>
            </group>
          )}

          {/* 3. Rectangular Cinematic Gate Frustum & Sight-Line (Scaled at 60fps/144fps in useFrame) */}
          {isBodyVisible && (
            <group>
              {/* Normalized Unit Frustum Pyramid Rays */}
              <group ref={frustumGroupRef}>
                {/* Central Optical Axis Sight-Line */}
                <Line
                  points={UNIT_FRUSTUM.sightLine}
                  color={color}
                  lineWidth={1.2}
                  dashed
                  dashScale={12}
                  dashSize={0.25}
                  gapSize={0.2}
                  transparent
                  opacity={0.65}
                />

                {/* 4 Corner Frustum Pyramid Edge Rays */}
                {UNIT_FRUSTUM.rays.map((ray, idx) => (
                  <Line
                    key={idx}
                    points={ray}
                    color={color}
                    lineWidth={1.3}
                    transparent
                    opacity={0.55}
                  />
                ))}
              </group>

              {/* Sliding Rectangular Focus Plane Frame at z = focusDepth */}
              <group ref={focusPlaneGroupRef}>
                {/* Rectangular Film Gate Frame */}
                <Line
                  points={UNIT_FRUSTUM.gateFrame}
                  color={color}
                  lineWidth={2.0}
                  transparent
                  opacity={0.9}
                />

                {/* Subtle Rule-of-Thirds Horizon Guides */}
                <Line
                  points={UNIT_FRUSTUM.ruleOfThirdsH1}
                  color={color}
                  lineWidth={0.7}
                  transparent
                  opacity={0.2}
                />
                <Line
                  points={UNIT_FRUSTUM.ruleOfThirdsH2}
                  color={color}
                  lineWidth={0.7}
                  transparent
                  opacity={0.2}
                />

                {/* Translucent Focus Plane Glass Fill */}
                <mesh position={[0, 0, 0]}>
                  <planeGeometry args={[2, 2]} />
                  <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={0.05}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                  />
                </mesh>
              </group>

              {/* Near & Far Depth-of-Field Sharpness Limit Brackets */}
              <StageCameraDofBrackets frameRef={frameRef} uiFrame={uiFrame} />

              {/* Focus Target Center Crosshair Ring (kept at 1:1 circular aspect ratio) */}
              <mesh
                ref={targetRingRef}
                position={[0, 0, stageCam.frustumDepth]}
              >
                <ringGeometry args={[0.06, 0.085, 24]} />
                <meshBasicMaterial
                  color={color}
                  transparent
                  opacity={0.85}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </group>
          )}
        </group>
      </group>
    </group>
  );
};
