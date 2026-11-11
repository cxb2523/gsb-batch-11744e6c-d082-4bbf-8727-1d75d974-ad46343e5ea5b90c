/**
 * 3D Physical Camera Rig Mounts inside the Blueprint Diorama.
 * Renders:
 *   1. Tripod: 3-legged splayed blueprint stand with floor pucks & vertical center column
 *   2. Dolly Track: Parallel floor rails (gauge 0.42m) with sleepers + 4-wheeled rolling cart
 *
 * Performance Architecture:
 *   - Rail paths and sleepers are memoized geometries.
 *   - Dolly cart position and telescoping column scale update imperatively at 60fps/144fps in useFrame.
 *   - Strictly guarded by stageCamera.showRig && stageCamera.rig.
 */

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { StageFrame } from '../core/types';

export interface StageCameraRigMountProps {
  frameRef: React.RefObject<StageFrame>;
  uiFrame: StageFrame;
  isBodyVisible: boolean;
  color: string;
}

export const StageCameraRigMount: React.FC<StageCameraRigMountProps> = ({
  frameRef,
  uiFrame,
  isBodyVisible,
  color,
}) => {
  const tripodGroupRef = useRef<THREE.Group | null>(null);
  const cartGroupRef = useRef<THREE.Group | null>(null);
  const cartColumnRef = useRef<THREE.Mesh | null>(null);

  const stageCam = uiFrame.stageCamera;
  const rig = stageCam.rig;
  const isRigVisible = Boolean(isBodyVisible && stageCam.showRig && rig);

  // 1. Memoized Dolly Track Rails & Sleepers (Floor Y = 0)
  const trackGeometry = useMemo(() => {
    if (!rig || (rig.type !== 'track' && rig.type !== 'spline_track') || rig.railPoints.length < 2) {
      return null;
    }
    const pts = rig.railPoints;
    const leftRail: Array<[number, number, number]> = [];
    const rightRail: Array<[number, number, number]> = [];
    const sleepers: Array<{ pos: [number, number, number]; rotY: number }> = [];

    const halfGauge = 0.21;
    let distAccum = 0;

    for (let i = 0; i < pts.length; i++) {
      const curr = pts[i];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      const prev = pts[Math.max(0, i - 1)];

      let dx = next.x - prev.x;
      let dz = next.z - prev.z;
      const len = Math.hypot(dx, dz);
      if (len > 1e-4) {
        dx /= len;
        dz /= len;
      } else {
        dx = 1;
        dz = 0;
      }

      // Normal perpendicular to tangent on XZ floor
      const nx = -dz;
      const nz = dx;

      leftRail.push([curr.x + nx * halfGauge, 0.018, curr.z + nz * halfGauge]);
      rightRail.push([curr.x - nx * halfGauge, 0.018, curr.z - nz * halfGauge]);

      if (i > 0) {
        distAccum += Math.hypot(curr.x - prev.x, curr.z - prev.z);
      }
      if (i === 0 || distAccum >= 0.45 || i === pts.length - 1) {
        const rotY = Math.atan2(dx, dz);
        sleepers.push({
          pos: [curr.x, 0.008, curr.z],
          rotY,
        });
        if (i > 0 && i < pts.length - 1) {
          distAccum = 0;
        }
      }
    }

    return { leftRail, rightRail, sleepers };
  }, [rig]);

  // 2. Imperative 60fps Synchronization
  useFrame(() => {
    const liveFrame = frameRef.current;
    if (!liveFrame || !isRigVisible) return;

    const isShotDesynced =
      Boolean(liveFrame.stageCamera.shotId) &&
      Boolean(stageCam.shotId) &&
      liveFrame.stageCamera.shotId !== stageCam.shotId;

    const liveCam = isShotDesynced ? stageCam : liveFrame.stageCamera;
    const eye = liveCam.transform.position;

    // A. Update Tripod
    if (rig?.type === 'tripod' && tripodGroupRef.current) {
      tripodGroupRef.current.position.set(eye.x, 0, eye.z);
    }

    // B. Update Dolly Cart
    if ((rig?.type === 'track' || rig?.type === 'spline_track') && cartGroupRef.current) {
      cartGroupRef.current.position.set(eye.x, 0, eye.z);

      const pts = rig.railPoints;
      if (pts.length >= 2) {
        const u = liveCam.rig?.progress ?? 0;
        const k = Math.min(pts.length - 2, Math.max(0, Math.floor(u * (pts.length - 1))));
        const dx = pts[k + 1].x - pts[k].x;
        const dz = pts[k + 1].z - pts[k].z;
        if (Math.hypot(dx, dz) > 1e-4) {
          cartGroupRef.current.rotation.y = Math.atan2(dx, dz);
        }
      }

      if (cartColumnRef.current) {
        const columnHeight = Math.max(0.05, eye.y - 0.12);
        cartColumnRef.current.scale.set(1, columnHeight, 1);
        cartColumnRef.current.position.set(0, columnHeight * 0.5 + 0.04, 0);
      }
    }
  });

  if (!isRigVisible || !rig) {
    return null;
  }

  const eyeY = Math.max(0.4, stageCam.transform.position.y);
  const apexY = Math.max(0.15, eyeY - 0.35);
  const legSpread = Math.min(0.65, Math.max(0.28, eyeY * 0.28));

  return (
    <group>
      {/* =====================================================================
          1. TRIPOD RIG (Splayed 3-Legged Stand + Floor Pucks)
          ===================================================================== */}
      {rig.type === 'tripod' && (
        <group ref={tripodGroupRef} position={[stageCam.transform.position.x, 0, stageCam.transform.position.z]}>
          {/* Vertical Center Column */}
          <mesh position={[0, (eyeY + apexY) * 0.5 - 0.06, 0]}>
            <cylinderGeometry args={[0.022, 0.022, Math.max(0.05, eyeY - apexY - 0.12), 12]} />
            <meshBasicMaterial color={color} wireframe />
          </mesh>

          {/* Apex Collar */}
          <mesh position={[0, apexY, 0]}>
            <cylinderGeometry args={[0.045, 0.045, 0.05, 12]} />
            <meshBasicMaterial color={color} />
          </mesh>

          {/* 3 Splayed Tripod Legs (120 deg apart) */}
          {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle, i) => {
            const footX = Math.sin(angle) * legSpread;
            const footZ = Math.cos(angle) * legSpread;

            return (
              <group key={`tripod-leg-${i}`}>
                {/* Leg Strut */}
                <Line
                  points={[
                    [0, apexY, 0],
                    [footX, 0.008, footZ],
                  ]}
                  color={color}
                  lineWidth={2}
                />
                {/* Floor Foot Puck */}
                <mesh position={[footX, 0.006, footZ]}>
                  <cylinderGeometry args={[0.032, 0.038, 0.012, 12]} />
                  <meshBasicMaterial color={color} />
                </mesh>
              </group>
            );
          })}

          {/* Floor Ring Footprint */}
          <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[legSpread * 0.95, legSpread, 32]} />
            <meshBasicMaterial color={color} transparent opacity={0.3} />
          </mesh>
        </group>
      )}

      {/* =====================================================================
          2. DOLLY TRACK RIG (Floor Rails + Wheeled Dolly Cart)
          ===================================================================== */}
      {(rig.type === 'track' || rig.type === 'spline_track') && trackGeometry && (
        <group>
          {/* Dual Parallel Metallic Rails */}
          <Line points={trackGeometry.leftRail} color={color} lineWidth={2.5} />
          <Line points={trackGeometry.rightRail} color={color} lineWidth={2.5} />

          {/* Cross-Tie Sleepers */}
          {trackGeometry.sleepers.map((sl, idx) => (
            <mesh
              key={`sleeper-${idx}`}
              position={sl.pos}
              rotation={[0, sl.rotY + Math.PI / 2, 0]}
            >
              <boxGeometry args={[0.54, 0.012, 0.065]} />
              <meshBasicMaterial color={color} transparent opacity={0.65} />
            </mesh>
          ))}

          {/* Wheeled Dolly Cart & Hydraulic Column */}
          <group
            ref={cartGroupRef}
            position={[stageCam.transform.position.x, 0, stageCam.transform.position.z]}
          >
            {/* Cart Platform Deck */}
            <mesh position={[0, 0.035, 0]}>
              <boxGeometry args={[0.48, 0.025, 0.56]} />
              <meshBasicMaterial color={color} />
            </mesh>

            {/* 4 Wheels on Rails */}
            {[-0.2, 0.2].flatMap((wz) => [-0.21, 0.21].map((wx) => (
              <mesh key={`wheel-${wx}-${wz}`} position={[wx, 0.024, wz]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.024, 0.024, 0.03, 12]} />
                <meshBasicMaterial color={color} />
              </mesh>
            )))}

            {/* Telescoping Vertical Column */}
            <mesh
              ref={cartColumnRef}
              position={[0, Math.max(0.05, eyeY - 0.12) * 0.5 + 0.04, 0]}
            >
              <cylinderGeometry args={[0.035, 0.04, 1, 14]} />
              <meshBasicMaterial color={color} wireframe />
            </mesh>
          </group>
        </group>
      )}
    </group>
  );
};
