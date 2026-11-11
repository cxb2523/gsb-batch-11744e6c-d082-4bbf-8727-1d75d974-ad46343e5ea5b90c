/**
 * Crisp 3D floating billboard badge for actors, props, markers, and the Stage Camera.
 * Evaluates distance-based semantic collapse (full pill <-> glowing accent dot),
 * kind-based opacity hierarchy (camera > focus > character > prop > marker),
 * and priority z-index ranges strictly within the [0, 8] viewport band.
 *
 * Governed by:
 *   - AGENTS.md Invariant 7 (Dual-Tier 60fps Loop: 0 React re-renders in Tier 1).
 *   - Visual Design System §6.3 (Stacking Context Isolation: 3D <Html> z-index < 10).
 *
 * Memoized with deep equality to prevent redundant DOM re-mounts during playback.
 */

import React, { useRef, useLayoutEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  computeBillboardLodMetrics,
  getBillboardZIndexRange,
  type BillboardLabelKind,
} from './labelLodMath';

export interface StageBillboardLabelProps {
  position: [number, number, number];
  label: string;
  sublabel?: string;
  accentColor: string;
  kind?: BillboardLabelKind;
  highlighted?: boolean;
  ghosted?: boolean;
  visible?: boolean;
}

const _tempVec = new THREE.Vector3();

export const StageBillboardLabel: React.FC<StageBillboardLabelProps> = React.memo(
  ({
    position,
    label,
    sublabel,
    accentColor,
    kind = 'character',
    highlighted = false,
    ghosted = false,
    visible = true,
  }) => {
    const groupRef = useRef<THREE.Group>(null);
    const pillRef = useRef<HTMLDivElement>(null);
    const dotRef = useRef<HTMLDivElement>(null);
    const camera = useThree((s) => s.camera);

    const syncDomStyles = (cam: THREE.Camera) => {
      if (!groupRef.current) return;
      groupRef.current.getWorldPosition(_tempVec);
      const dist = cam.position.distanceTo(_tempVec);
      const metrics = computeBillboardLodMetrics(
        dist,
        kind,
        highlighted,
        ghosted
      );

      if (pillRef.current) {
        if (!metrics.showPill || metrics.pillOpacity <= 0.001) {
          pillRef.current.style.visibility = 'hidden';
          pillRef.current.style.opacity = '0';
        } else {
          pillRef.current.style.visibility = 'visible';
          pillRef.current.style.opacity = metrics.pillOpacity.toFixed(3);
          pillRef.current.style.transform = `scale(${metrics.pillScale.toFixed(3)})`;
        }
      }

      if (dotRef.current) {
        if (!metrics.showDot || metrics.dotOpacity <= 0.001) {
          dotRef.current.style.visibility = 'hidden';
          dotRef.current.style.opacity = '0';
        } else {
          dotRef.current.style.visibility = 'visible';
          dotRef.current.style.opacity = metrics.dotOpacity.toFixed(3);
          dotRef.current.style.transform = `scale(${metrics.dotScale.toFixed(3)})`;
        }
      }
    };

    // Synchronous layout effect ensures frame-0 / scrubbed poses style DOM before paint
    useLayoutEffect(() => {
      if (visible) {
        syncDomStyles(camera);
      }
    });

    // 60fps/144fps imperative DOM mutation loop (0 React re-renders)
    useFrame(({ camera: activeCam }) => {
      if (visible) {
        syncDomStyles(activeCam);
      }
    });

    if (!visible) return null;

    const zIndexRange = getBillboardZIndexRange(kind, highlighted);

    const isHexColor = accentColor.startsWith('#') && accentColor.length === 7;
    const accentBorderColor = isHexColor ? `${accentColor}99` : accentColor;
    const accentShadow = isHexColor
      ? `0 0 14px ${accentColor}44, 0 4px 20px rgba(0, 0, 0, 0.5)`
      : undefined;

    return (
      <group ref={groupRef} position={position}>
        <Html center zIndexRange={zIndexRange}>
          <div className="relative flex items-center justify-center select-none pointer-events-none">
            {/* 1. Full Telemetry / Identity Badge */}
            <div
              ref={pillRef}
              style={{
                transformOrigin: 'center center',
                borderColor: highlighted ? accentBorderColor : undefined,
                boxShadow: highlighted ? accentShadow : undefined,
              }}
              className={`px-3.5 py-1.5 rounded-full bg-slate-950/90 backdrop-blur-md flex items-center gap-2 whitespace-nowrap shadow-2xl border transition-colors duration-200 ${
                highlighted ? '' : 'border-slate-700/80'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 transition-shadow duration-200"
                style={{
                  backgroundColor: accentColor,
                  boxShadow: highlighted
                    ? `0 0 12px ${accentColor}`
                    : `0 0 4px ${accentColor}88`,
                }}
              />
              <span
                className={`text-sm font-mono tracking-tight ${
                  highlighted
                    ? 'font-bold text-white'
                    : 'font-semibold text-slate-100'
                }`}
              >
                {label}
              </span>
              {sublabel && (
                <span
                  className={`text-xs font-mono pl-0.5 ${
                    highlighted ? 'text-slate-300' : 'text-slate-400'
                  }`}
                >
                  · {sublabel}
                </span>
              )}
            </div>

            {/* 2. Collapsed Minimal Glowing Accent Dot (Distance Pullback / Crane LOD) */}
            <div
              ref={dotRef}
              style={{
                transformOrigin: 'center center',
                backgroundColor: accentColor,
                boxShadow: highlighted
                  ? `0 0 14px ${accentColor}, 0 0 4px #ffffff`
                  : `0 0 10px ${accentColor}, 0 2px 6px rgba(0, 0, 0, 0.65)`,
                visibility: 'hidden',
                opacity: 0,
              }}
              className="absolute w-2.5 h-2.5 rounded-full border border-white/50 shrink-0 pointer-events-none"
            />
          </div>
        </Html>
      </group>
    );
  },
  (prev, next) =>
    prev.label === next.label &&
    prev.sublabel === next.sublabel &&
    prev.accentColor === next.accentColor &&
    prev.kind === next.kind &&
    Boolean(prev.highlighted) === Boolean(next.highlighted) &&
    Boolean(prev.ghosted) === Boolean(next.ghosted) &&
    Boolean(prev.visible) === Boolean(next.visible) &&
    prev.position[0] === next.position[0] &&
    prev.position[1] === next.position[1] &&
    prev.position[2] === next.position[2]
);
