/**
 * Procedural 2D Vector SVG Stage Minimap.
 * Renders an architectural top-down schematic of character positions,
 * facing chevrons, and camera trajectory cones derived purely from in-memory StageScore data.
 * Zero WebGL overhead, zero asset downloads, executes in < 0.1ms.
 */

import React, { useMemo } from 'react';
import type { StageScore } from '../../core/types';
import { computeOrientedBoundingBox } from '../../core/entityKinematicUtils';

export interface ScoreStageMinimapProps {
  score: StageScore;
  className?: string;
}

interface Point2D {
  x: number;
  z: number;
}

export const ScoreStageMinimap: React.FC<ScoreStageMinimapProps> = ({
  score,
  className = '',
}) => {
  const { viewBox, entities, cameraPos, cameraTarget, cameraConePath, cameraTrackPath } =
    useMemo(() => {
      const allPoints: Point2D[] = [{ x: 0, z: 0 }];

      // 1. Collect entity starting positions
      const entityList = (score?.entities ?? []).map((ent) => {
        const x = ent.position?.x ?? 0;
        const z = ent.position?.z ?? 0;
        const width = ent.width ?? ent.radius * 2;
        const depth = ent.depth ?? ent.radius * 2;
        const halfSpan = Math.max(width, depth) * 0.5;
        allPoints.push({ x: x - halfSpan, z: z - halfSpan });
        allPoints.push({ x: x + halfSpan, z: z + halfSpan });
        return {
          id: ent.id,
          label: ent.label || ent.id,
          x,
          z,
          width,
          depth,
          shape: ent.shape,
          rotationYRad: ent.rotationYRad ?? 0,
          color: ent.color || '#38bdf8',
          kind: ent.kind,
        };
      });

      // 2. Resolve first shot camera pose
      const firstShot = score?.shots?.[0];
      let camX = 0;
      let camZ = 5;
      let targetX = 0;
      let targetZ = 0;

      if (firstShot?.stageCamera) {
        const sc = firstShot.stageCamera;
        // Resolve target coordinates
        if (typeof sc.target === 'string') {
          const matched = entityList.find((e) => e.id === sc.target);
          if (matched) {
            targetX = matched.x;
            targetZ = matched.z;
          }
        } else if (Array.isArray(sc.target)) {
          let sumX = 0;
          let sumZ = 0;
          let count = 0;
          for (const item of sc.target) {
            const matched = entityList.find((e) => e.id === item);
            if (matched) {
              sumX += matched.x;
              sumZ += matched.z;
              count++;
            }
          }
          if (count > 0) {
            targetX = sumX / count;
            targetZ = sumZ / count;
          }
        } else if (sc.target && typeof sc.target === 'object') {
          targetX = sc.target.x ?? 0;
          targetZ = sc.target.z ?? 0;
        }

        allPoints.push({ x: targetX, z: targetZ });

        const dist = Math.max(1.5, sc.distance ?? 5.0);
        const pitch = sc.pitchRad ?? 0.25;
        const yaw = sc.yawRad ?? 0;
        const cosPitch = Math.cos(pitch);

        camX = targetX + dist * cosPitch * Math.sin(yaw);
        camZ = targetZ + dist * cosPitch * Math.cos(yaw);
        allPoints.push({ x: camX, z: camZ });
      }

      // Collect camera positions from all shots to compute trajectory
      const camPoints: Point2D[] = [];
      if (firstShot?.stageCamera) {
        camPoints.push({ x: camX, z: camZ });
      }

      (score?.shots ?? []).slice(1).forEach((shot) => {
        if (!shot.stageCamera) return;
        const sc = shot.stageCamera;
        let tX = 0;
        let tZ = 0;
        if (typeof sc.target === 'string') {
          const matched = entityList.find((e) => e.id === sc.target);
          if (matched) {
            tX = matched.x;
            tZ = matched.z;
          }
        } else if (Array.isArray(sc.target)) {
          let sumX = 0;
          let sumZ = 0;
          let count = 0;
          for (const item of sc.target) {
            const matched = entityList.find((e) => e.id === item);
            if (matched) {
              sumX += matched.x;
              sumZ += matched.z;
              count++;
            }
          }
          if (count > 0) {
            tX = sumX / count;
            tZ = sumZ / count;
          }
        } else if (sc.target && typeof sc.target === 'object') {
          tX = sc.target.x ?? 0;
          tZ = sc.target.z ?? 0;
        }
        const dist = Math.max(1.5, sc.distance ?? 5.0);
        const pitch = sc.pitchRad ?? 0.25;
        const yaw = sc.yawRad ?? 0;
        const cosPitch = Math.cos(pitch);
        const cX = tX + dist * cosPitch * Math.sin(yaw);
        const cZ = tZ + dist * cosPitch * Math.cos(yaw);
        camPoints.push({ x: cX, z: cZ });
        allPoints.push({ x: cX, z: cZ });
      });

      // 3. Compute dynamic bounding box
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;

      allPoints.forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      });

      // Ensure minimum symmetric stage span of at least 10m x 10m
      const spanX = Math.max(10, (maxX - minX) * 1.35);
      const spanZ = Math.max(10, (maxZ - minZ) * 1.35);
      const span = Math.max(spanX, spanZ);

      const centerX = (minX + maxX) / 2;
      const centerZ = (minZ + maxZ) / 2;

      const half = span / 2;
      const boxMinX = Number((centerX - half).toFixed(2));
      const boxMinZ = Number((centerZ - half).toFixed(2));
      const boxSize = Number(span.toFixed(2));

      // 4. Construct camera viewing frustum cone
      const dirX = targetX - camX;
      const dirZ = targetZ - camZ;
      const len = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
      const ndx = dirX / len;
      const ndz = dirZ / len;

      // Perpendicular vector for frustum aperture
      const px = -ndz;
      const pz = ndx;
      const coneDist = Math.min(len * 0.85, 4.5);
      const coneWidth = coneDist * 0.45;

      const pLeftX = camX + ndx * coneDist + px * coneWidth;
      const pLeftZ = camZ + ndz * coneDist + pz * coneWidth;
      const pRightX = camX + ndx * coneDist - px * coneWidth;
      const pRightZ = camZ + ndz * coneDist - pz * coneWidth;

      const conePath = `M ${camX.toFixed(2)} ${camZ.toFixed(2)} L ${pLeftX.toFixed(2)} ${pLeftZ.toFixed(2)} L ${pRightX.toFixed(2)} ${pRightZ.toFixed(2)} Z`;

      // 5. Construct camera trajectory path if multiple shots exist
      let trackPath = '';
      if (camPoints.length > 1) {
        trackPath = camPoints.reduce((acc, pt, idx) => {
          return `${acc} ${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(2)} ${pt.z.toFixed(2)}`;
        }, '');
      }

      return {
        viewBox: `${boxMinX} ${boxMinZ} ${boxSize} ${boxSize}`,
        entities: entityList,
        cameraPos: { x: camX, z: camZ },
        cameraTarget: { x: targetX, z: targetZ },
        cameraConePath: conePath,
        cameraTrackPath: trackPath,
      };
    }, [score]);

  return (
    <div
      className={`relative w-full aspect-square bg-surface-muted/50 rounded-xl overflow-hidden border border-border-subtle select-none flex items-center justify-center ${className}`}
    >
      <svg
        viewBox={viewBox}
        className="w-full h-full p-2"
        style={{ transform: 'scaleY(-1)' }} // Invert SVG Y so +Z (downstage) is at bottom
      >
        <defs>
          <pattern
            id="minimap-grid"
            width="2"
            height="2"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 2 0 L 0 0 0 2"
              fill="none"
              stroke="var(--border-subtle)"
              strokeWidth="0.08"
              strokeDasharray="0.3 0.3"
            />
          </pattern>
        </defs>

        {/* Metric Floor Grid */}
        <rect
          x="-50"
          y="-50"
          width="100"
          height="100"
          fill="url(#minimap-grid)"
          opacity="0.65"
        />

        {/* Center Crosshairs */}
        <line
          x1="-40"
          y1="0"
          x2="40"
          y2="0"
          stroke="var(--border-main)"
          strokeWidth="0.08"
          opacity="0.4"
        />
        <line
          x1="0"
          y1="-40"
          x2="0"
          y2="40"
          stroke="var(--border-main)"
          strokeWidth="0.08"
          opacity="0.4"
        />

        {/* Origin Reticle */}
        <circle
          cx="0"
          cy="0"
          r="0.4"
          fill="none"
          stroke="var(--text-faint)"
          strokeWidth="0.08"
          opacity="0.5"
        />

        {/* Multi-Shot Camera Trajectory Line */}
        {cameraTrackPath && (
          <path
            d={cameraTrackPath}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="0.16"
            strokeDasharray="0.5 0.3"
            opacity="0.75"
          />
        )}

        {/* Camera Viewing Cone */}
        <path
          d={cameraConePath}
          fill="#f59e0b"
          fillOpacity="0.12"
          stroke="#f59e0b"
          strokeWidth="0.12"
          strokeDasharray="0.4 0.2"
        />

        {/* Camera Sightline Tether */}
        <line
          x1={cameraPos.x}
          y1={cameraPos.z}
          x2={cameraTarget.x}
          y2={cameraTarget.z}
          stroke="#f59e0b"
          strokeWidth="0.09"
          strokeDasharray="0.3 0.2"
          opacity="0.6"
        />

        {/* Camera Glyph */}
        <circle
          cx={cameraPos.x}
          cy={cameraPos.z}
          r="0.55"
          fill="#f59e0b"
          stroke="var(--surface)"
          strokeWidth="0.14"
        />

        {/* Entities (Characters, Props) */}
        {entities.map((ent) => {
          const facingLen = 0.85;
          // Facing angle: rotationYRad = 0 faces +Z
          const facingX = ent.x + Math.sin(ent.rotationYRad) * facingLen;
          const facingZ = ent.z + Math.cos(ent.rotationYRad) * facingLen;

          return (
            <g key={ent.id}>
              {/* Ground Chevron / Directional Heading */}
              <line
                x1={ent.x}
                y1={ent.z}
                x2={facingX}
                y2={facingZ}
                stroke={ent.color}
                strokeWidth="0.18"
                strokeLinecap="round"
              />
              <circle
                cx={facingX}
                cy={facingZ}
                r="0.12"
                fill={ent.color}
              />

              {/* Entity Base Body Geometry (Box polygon, ellipse, or circle) */}
              {ent.kind === 'prop' && (ent.shape ?? 'box') === 'box' ? (
                <polygon
                  points={computeOrientedBoundingBox(
                    { x: ent.x, z: ent.z },
                    Math.max(0.6, ent.width),
                    Math.max(0.6, ent.depth),
                    ent.rotationYRad
                  )
                    .map((c) => `${c.x.toFixed(2)},${c.z.toFixed(2)}`)
                    .join(' ')}
                  fill={ent.color}
                  fillOpacity="0.85"
                  stroke="var(--surface)"
                  strokeWidth="0.14"
                />
              ) : Math.abs(ent.width - ent.depth) > 0.05 ? (
                <ellipse
                  cx={ent.x}
                  cy={ent.z}
                  rx={Math.max(0.25, ent.width * 0.5)}
                  ry={Math.max(0.25, ent.depth * 0.5)}
                  transform={`rotate(${((ent.rotationYRad * 180) / Math.PI).toFixed(1)} ${ent.x} ${ent.z})`}
                  fill={ent.color}
                  fillOpacity="0.85"
                  stroke="var(--surface)"
                  strokeWidth="0.14"
                />
              ) : (
                <circle
                  cx={ent.x}
                  cy={ent.z}
                  r={Math.max(0.3, ent.width * 0.5)}
                  fill={ent.color}
                  fillOpacity="0.85"
                  stroke="var(--surface)"
                  strokeWidth="0.14"
                />
              )}

              {/* Entity Inner Dot */}
              <circle
                cx={ent.x}
                cy={ent.z}
                r="0.16"
                fill="#ffffff"
              />
            </g>
          );
        })}
      </svg>

      {/* Floating Cardinal Orientation Indicators */}
      <span className="absolute top-1.5 left-2 text-[8px] font-mono font-bold tracking-widest text-text-faint uppercase pointer-events-none opacity-60">
        -Z UPSTAGE
      </span>
      <span className="absolute bottom-1.5 left-2 text-[8px] font-mono font-bold tracking-widest text-text-faint uppercase pointer-events-none opacity-60">
        +Z DOWNSTAGE
      </span>
      <span className="absolute bottom-1.5 right-2 text-[8px] font-mono font-bold tracking-wider text-amber-500 uppercase pointer-events-none flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
        CAM
      </span>
    </div>
  );
};
