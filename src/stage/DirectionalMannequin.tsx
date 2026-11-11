/**
 * Directional Minimalist Mannequin & Prop Proxy Component.
 * Features:
 *   - Stylized geometric figure (torso capsule + head sphere)
 *   - Luminous directional facing visor wedge + ground chevron arrow (+Z local forward)
 *   - Ground contact shadow ring
 *   - Floating identity badge
 *   - Dynamic floor movement trail when moving across a shot
 *   - Gated cut synchronization across shot boundaries
 */

import React, { useRef, useMemo, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line, Edges } from '@react-three/drei';
import * as THREE from 'three';
import { ENTITY_DEFAULTS } from '../core/constants';
import type {
  CameraViewMode,
  CharacterStyle,
  EvaluatedEntityState,
  LabelDisplayMode,
  MarkerStyle,
  PropStyle,
  StageFrame,
} from '../core/types';
import { StageBillboardLabel } from './StageBillboardLabel';

export interface DirectionalMannequinProps {
  entityId: string;
  initialState: EvaluatedEntityState;
  frameRef: React.RefObject<StageFrame>;
  uiFrame?: StageFrame;
  labelMode?: LabelDisplayMode;
  isPlaying?: boolean;
  cameraMode?: CameraViewMode;
}

export const DirectionalMannequin: React.FC<DirectionalMannequinProps> = ({
  entityId,
  initialState,
  frameRef,
  uiFrame,
  labelMode = 'all',
  isPlaying = false,
  cameraMode,
}) => {
  const groupRef = useRef<THREE.Group | null>(null);
  const meshContainerRef = useRef<THREE.Group | null>(null);
  const footprintRef = useRef<THREE.Group | null>(null);
  const labelGroupRef = useRef<THREE.Group | null>(null);
  const charTorsoRef = useRef<THREE.Mesh | null>(null);
  const charShoulderRef = useRef<THREE.Mesh | null>(null);
  const charHeadGroupRef = useRef<THREE.Group | null>(null);
  const { def, highlighted, trailPoints } = initialState;
  const color = def.color;
  const height = def.height;
  const radius = def.radius;
  const baseWidth = def.width ?? radius * 2;
  const baseDepth = def.depth ?? radius * 2;
  const rx = baseWidth * 0.5;
  const rz = baseDepth * 0.5;
  const charScaleX = radius > 1e-5 ? rx / radius : 1;
  const charScaleZ = radius > 1e-5 ? rz / radius : 1;
  const isBoxProp = def.kind === 'prop' && (def.shape ?? 'box') === 'box';

  // Helper to get synchronized live entity state
  const getSynchronizedEntity = (liveFrame: StageFrame | null) => {
    if (!liveFrame) return initialState;
    const liveEntity = liveFrame.entitiesById.get(entityId);
    if (!liveEntity) return initialState;

    const isCueDesynced =
      uiFrame !== undefined &&
      liveEntity.cueId !== undefined &&
      initialState.cueId !== undefined &&
      liveEntity.cueId !== initialState.cueId;

    if (isCueDesynced) {
      return initialState;
    }

    return liveEntity;
  };

  const syncEntityTransform = (entity: EvaluatedEntityState) => {
    if (!groupRef.current) return;
    groupRef.current.visible = entity.visible;
    groupRef.current.position.set(
      entity.position.x,
      entity.position.y,
      entity.position.z
    );
    groupRef.current.rotation.set(0, entity.rotationYRad, 0);

    const liveW = entity.size?.x ?? baseWidth;
    const liveH = entity.size?.y ?? height;
    const liveD = entity.size?.z ?? baseDepth;
    const sx = baseWidth > 1e-5 ? liveW / baseWidth : 1;
    const sy = height > 1e-5 ? liveH / height : 1;
    const sz = baseDepth > 1e-5 ? liveD / baseDepth : 1;

    if (def.kind === 'character') {
      if (meshContainerRef.current) {
        meshContainerRef.current.scale.set(1, 1, 1);
      }
      if (charTorsoRef.current) {
        const baseTorsoHeight = Math.max(0.2, height - 0.35);
        const liveTorsoHeight = Math.max(0.2, liveH - 0.35);
        const torsoSy = baseTorsoHeight > 1e-5 ? liveTorsoHeight / baseTorsoHeight : 1;
        const torsoY = liveTorsoHeight * 0.5 + 0.05;
        charTorsoRef.current.position.set(0, torsoY, 0);
        charTorsoRef.current.scale.set(sx * charScaleX, torsoSy, sz * charScaleZ);
      }
      if (charShoulderRef.current) {
        charShoulderRef.current.position.set(0, Math.max(0.25, liveH - 0.40), 0);
        charShoulderRef.current.scale.set(sx * charScaleX, 1, sz * charScaleZ);
      }
      if (charHeadGroupRef.current) {
        charHeadGroupRef.current.position.set(0, Math.max(0.35, liveH - 0.16), 0);
        charHeadGroupRef.current.scale.set(1, 1, 1);
      }
    } else {
      if (meshContainerRef.current) {
        meshContainerRef.current.scale.set(sx, sy, sz);
      }
    }

    if (footprintRef.current) {
      footprintRef.current.scale.set(sx, 1, sz);
    }
    if (labelGroupRef.current) {
      labelGroupRef.current.position.set(0, liveH + 0.28, 0);
    }
  };

  // Ensure synchronous pre-paint alignment so React reconciler never resets 60fps transform
  useLayoutEffect(() => {
    syncEntityTransform(getSynchronizedEntity(frameRef.current));
  });

  // Imperatively sync 3D position, facing rotation, and scale at 60fps
  useFrame(() => {
    syncEntityTransform(getSynchronizedEntity(frameRef.current));
  });

  // Floor trail points in world space
  const trailLinePoints = useMemo<Array<[number, number, number]>>(() => {
    if (!trailPoints || trailPoints.length < 2) return [];
    return trailPoints.map((p) => [p.x, p.y, p.z]);
  }, [trailPoints]);

  // Forward ground gaze vector line in local +Z space
  const forwardIndicatorPoints = useMemo<Array<[number, number, number]>>(
    () => [
      [0, 0.02, rz * 0.8],
      [0, 0.02, rz * 2.5],
      [-0.08, 0.02, rz * 2.0],
      [0, 0.02, rz * 2.5],
      [0.08, 0.02, rz * 2.0],
    ],
    [rz]
  );

  const boxFootprintGeometry = useMemo(() => {
    if (!isBoxProp) return null;
    const outerScale = highlighted ? 1.35 : 1.12;
    const innerScale = 0.92;
    const ow = rx * outerScale;
    const od = rz * outerScale;
    const iw = rx * innerScale;
    const id = rz * innerScale;

    const shape = new THREE.Shape();
    shape.moveTo(-ow, -od);
    shape.lineTo(ow, -od);
    shape.lineTo(ow, od);
    shape.lineTo(-ow, od);
    shape.closePath();

    const hole = new THREE.Path();
    hole.moveTo(-iw, -id);
    hole.lineTo(iw, -id);
    hole.lineTo(iw, id);
    hole.lineTo(-iw, id);
    hole.closePath();
    shape.holes.push(hole);

    return new THREE.ShapeGeometry(shape);
  }, [isBoxProp, highlighted, rx, rz]);

  const headY = height * ENTITY_DEFAULTS.CHARACTER_LOOK_ANCHOR_RATIO;
  const torsoHeight = Math.max(0.4, height - 0.55);
  const torsoY = torsoHeight * 0.5 + 0.12;

  const renderCharacter = () => {
    const charStyle = (def.style as CharacterStyle) ?? 'mannequin';
    const isSilhouette = charStyle === 'silhouette';
    const isWireframe = charStyle === 'wireframe';
    const hasEdges = charStyle === 'edges';

    const bodyColor = isSilhouette ? '#0f172a' : color;
    const bodyEmissive = isSilhouette ? (highlighted ? color : '#000000') : color;
    const bodyEmissiveIntensity = isSilhouette
      ? (highlighted ? 0.35 : 0)
      : isWireframe
      ? (highlighted ? 0.5 : 0.2)
      : (highlighted ? 0.35 : (hasEdges ? 0.08 : 0.14));

    const torsoOpacity = isSilhouette
      ? (highlighted ? 0.98 : 0.95)
      : hasEdges
      ? (highlighted ? 0.45 : 0.20)
      : (highlighted ? 0.82 : 0.52);

    const shoulderOpacity = isSilhouette
      ? (highlighted ? 0.98 : 0.95)
      : hasEdges
      ? (highlighted ? 0.40 : 0.18)
      : (highlighted ? 0.75 : 0.45);

    const headOpacity = isSilhouette
      ? (highlighted ? 0.98 : 0.95)
      : hasEdges
      ? (highlighted ? 0.50 : 0.25)
      : 0.9;

    return (
      <group>
        {/* Stylized Architectural Torso Column (telescopes without squashing head) */}
        <mesh
          ref={charTorsoRef}
          position={[0, torsoY, 0]}
          scale={[charScaleX, 1, charScaleZ]}
        >
          <capsuleGeometry args={[radius * 0.72, torsoHeight * 0.55, 8, 20]} />
          <meshStandardMaterial
            color={bodyColor}
            emissive={bodyEmissive}
            emissiveIntensity={bodyEmissiveIntensity}
            transparent={!isSilhouette}
            opacity={torsoOpacity}
            roughness={isSilhouette ? 0.85 : 0.35}
            metalness={isSilhouette ? 0.05 : 0.2}
            wireframe={isWireframe}
          />
          {hasEdges && <Edges threshold={20} color={color} />}
        </mesh>

        {/* Shoulder Cross-Bar (thickness stays 0.08m, scales with character width) */}
        <mesh
          ref={charShoulderRef}
          position={[0, height - 0.40, 0]}
          scale={[charScaleX, 1, charScaleZ]}
        >
          <boxGeometry args={[radius * 1.4, 0.08, radius * 0.55]} />
          <meshStandardMaterial
            color={bodyColor}
            emissive={bodyEmissive}
            emissiveIntensity={bodyEmissiveIntensity}
            transparent={!isSilhouette}
            opacity={shoulderOpacity}
            roughness={isSilhouette ? 0.85 : 0.35}
            metalness={isSilhouette ? 0.05 : 0.2}
            wireframe={isWireframe}
          />
          {hasEdges && <Edges threshold={20} color={color} />}
        </mesh>

        {/* Mannequin Head & Visor Group (strictly Y=1.0 aspect ratio — never squashed into a pancake) */}
        <group ref={charHeadGroupRef} position={[0, headY, 0]}>
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[0.14, 20, 20]} />
            <meshStandardMaterial
              color={bodyColor}
              emissive={bodyEmissive}
              emissiveIntensity={
                isSilhouette
                  ? (highlighted ? 0.45 : 0)
                  : (highlighted ? 0.45 : 0.2)
              }
              transparent={!isSilhouette}
              opacity={headOpacity}
              roughness={isSilhouette ? 0.85 : 0.35}
              wireframe={isWireframe}
            />
            {hasEdges && <Edges threshold={20} color={color} />}
          </mesh>

          {/* Directional Eye Visor / Nose Wedge (+Z Forward) */}
          <mesh position={[0, 0, 0.13]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.065, 0.14, 4]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        </group>
      </group>
    );
  };

  const renderPropShape = () => {
    const shape = def.shape ?? 'box';
    const propStyle = (def.style as PropStyle) ?? 'edges';
    const isWireframe = propStyle === 'wireframe';
    const hasEdges = propStyle === 'edges';
    const isSolid = propStyle === 'solid';

    const opacity = isSolid
      ? (highlighted ? 0.96 : 0.88)
      : hasEdges
      ? (highlighted ? 0.45 : 0.20)
      : (highlighted ? 0.75 : 0.45);

    const emissiveIntensity = isWireframe
      ? (highlighted ? 0.5 : 0.2)
      : (highlighted ? 0.35 : (hasEdges ? 0.08 : 0.15));

    const material = (
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={emissiveIntensity}
        transparent={!isSolid || highlighted}
        opacity={opacity}
        roughness={isSolid ? 0.4 : 0.35}
        metalness={isSolid ? 0.1 : 0.15}
        wireframe={isWireframe}
      />
    );

    const edgesChild = hasEdges ? <Edges threshold={15} color={color} /> : null;

    switch (shape) {
      case 'sphere': {
        const sphereR = rx > 0 ? rx : height * 0.5;
        const sySphere = sphereR > 1e-5 ? (height * 0.5) / sphereR : 1;
        const szSphere = sphereR > 1e-5 ? rz / sphereR : 1;
        return (
          <mesh position={[0, height * 0.5, 0]} scale={[1, sySphere, szSphere]}>
            <sphereGeometry args={[sphereR, 32, 32]} />
            {material}
            {edgesChild}
          </mesh>
        );
      }
      case 'cylinder': {
        const szCyl = rx > 1e-5 ? rz / rx : 1;
        return (
          <mesh position={[0, height * 0.5, 0]} scale={[1, 1, szCyl]}>
            <cylinderGeometry args={[rx, rx, height, 32]} />
            {material}
            {edgesChild}
          </mesh>
        );
      }
      case 'capsule': {
        const capRadius = Math.min(rx, rz);
        const bodyLen = Math.max(0.01, height - capRadius * 2);
        const sxCap = capRadius > 1e-5 ? rx / capRadius : 1;
        const szCap = capRadius > 1e-5 ? rz / capRadius : 1;
        return (
          <mesh position={[0, height * 0.5, 0]} scale={[sxCap, 1, szCap]}>
            <capsuleGeometry args={[capRadius, bodyLen, 8, 20]} />
            {material}
            {edgesChild}
          </mesh>
        );
      }
      case 'box':
      default: {
        return (
          <mesh position={[0, height * 0.5, 0]}>
            <boxGeometry args={[baseWidth, height, baseDepth]} />
            {material}
            {edgesChild}
          </mesh>
        );
      }
    }
  };

  const renderMarkerShape = () => {
    const shape = def.shape ?? 'x';
    const markerStyle = (def.style as MarkerStyle) ?? 'tape';
    const isGlow = markerStyle === 'glow';
    const isBeacon = markerStyle === 'beacon';

    const tapeThickness = 0.003;
    const stripWidth = Math.max(0.04, rx * 0.28);
    const stripLen = baseWidth;
    const tapeMaterial = (
      <meshBasicMaterial
        color={color}
        transparent
        opacity={highlighted ? 0.95 : 0.8}
        side={THREE.DoubleSide}
      />
    );

    const glowHalo = isGlow ? (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} scale={[1, rx > 1e-5 ? rz / rx : 1, 1]}>
        <ringGeometry args={[0, rx * 1.35, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={highlighted ? 0.45 : 0.22}
          side={THREE.DoubleSide}
        />
      </mesh>
    ) : null;

    const beaconVerticalPin = isBeacon ? (
      <group position={[0, 0, 0]}>
        {/* Vertical glowing beacon stem pin */}
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.014, 0.014, 0.42, 12]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={highlighted ? 1.0 : 0.85}
          />
        </mesh>
        {/* Floating beacon tip */}
        <mesh position={[0, 0.44, 0]}>
          <sphereGeometry args={[0.045, 16, 16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
    ) : null;

    let shapeMesh: React.ReactNode;
    switch (shape) {
      case 't': {
        const stemLen = rz * 1.5;
        shapeMesh = (
          <group position={[0, 0.005, 0]}>
            {/* Top crossbar (horizontal along X) */}
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[baseWidth, tapeThickness, stripWidth]} />
              {tapeMaterial}
            </mesh>
            {/* Vertical stem (pointing along -Z) */}
            <mesh position={[0, 0.0005, -stemLen * 0.5]}>
              <boxGeometry args={[stripWidth, tapeThickness, stemLen]} />
              {tapeMaterial}
            </mesh>
          </group>
        );
        break;
      }
      case 'circle': {
        const szCirc = rx > 1e-5 ? rz / rx : 1;
        shapeMesh = (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} scale={[1, szCirc, 1]}>
            <ringGeometry args={[rx * 0.72, rx, 32]} />
            {tapeMaterial}
          </mesh>
        );
        break;
      }
      case 'puck': {
        const szPuck = rx > 1e-5 ? rz / rx : 1;
        shapeMesh = (
          <mesh position={[0, Math.max(0.04, height * 0.5), 0]} scale={[1, 1, szPuck]}>
            <cylinderGeometry
              args={[rx * 0.6, rx, Math.max(0.08, height), 16]}
            />
            {tapeMaterial}
          </mesh>
        );
        break;
      }
      case 'x':
      default: {
        shapeMesh = (
          <group position={[0, 0.005, 0]}>
            {/* Diagonal tape 1 (+45 deg) */}
            <mesh rotation={[0, Math.PI / 4, 0]}>
              <boxGeometry args={[stripWidth, tapeThickness, stripLen]} />
              {tapeMaterial}
            </mesh>
            {/* Diagonal tape 2 (-45 deg) */}
            <mesh rotation={[0, -Math.PI / 4, 0]} position={[0, 0.0005, 0]}>
              <boxGeometry args={[stripWidth, tapeThickness, stripLen]} />
              {tapeMaterial}
            </mesh>
          </group>
        );
        break;
      }
    }

    return (
      <group>
        {glowHalo}
        {shapeMesh}
        {beaconVerticalPin}
      </group>
    );
  };

  return (
    <group>
      {/* Dynamic Floor Movement Trail (World Space) */}
      {trailLinePoints.length >= 2 && (
        <Line
          points={trailLinePoints}
          color={color}
          lineWidth={1.6}
          dashed
          dashScale={10}
          dashSize={0.25}
          gapSize={0.15}
          transparent
          opacity={0.65}
        />
      )}

      {/* 60fps Animated Entity Transform Group (controlled imperatively to avoid JSX prop overwrite) */}
      <group ref={groupRef}>
        {/* Ground Contact Shadow & Selection Ring */}
        <group ref={footprintRef}>
          {isBoxProp && boxFootprintGeometry ? (
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0.012, 0]}
              geometry={boxFootprintGeometry}
            >
              <meshBasicMaterial
                color={color}
                transparent
                opacity={highlighted ? 0.9 : 0.45}
                side={THREE.DoubleSide}
              />
            </mesh>
          ) : (
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0.012, 0]}
              scale={[1, rx > 1e-5 ? rz / rx : 1, 1]}
              visible={def.kind !== 'marker' || highlighted}
            >
              <ringGeometry
                args={[
                  rx * 0.92,
                  highlighted ? rx * 1.35 : rx * 1.12,
                  32,
                ]}
              />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={highlighted ? 0.9 : 0.45}
                side={THREE.DoubleSide}
              />
            </mesh>
          )}
        </group>

        {/* Ground Facing Direction Arrow (+Z Forward) */}
        {(def.kind !== 'marker' || def.shape === 'puck' || def.rotationYRad !== 0) && (
          <Line
            points={forwardIndicatorPoints}
            color={color}
            lineWidth={highlighted ? 2.2 : 1.4}
            transparent
            opacity={highlighted ? 0.95 : 0.65}
          />
        )}

        {/* Scaled 3D Mesh Container (Base at Y=0) */}
        <group ref={meshContainerRef}>
          {def.kind === 'character' ? (
            renderCharacter()
          ) : def.kind === 'prop' ? (
            renderPropShape()
          ) : (
            renderMarkerShape()
          )}
        </group>

        {/* Floating Identity Badge (Independent of Mesh Scale) */}
        <group ref={labelGroupRef} position={[0, height + 0.28, 0]}>
          <StageBillboardLabel
            position={[0, 0, 0]}
            label={def.label}
            accentColor={color}
            kind={def.kind}
            highlighted={highlighted}
            ghosted={isPlaying}
            visible={labelMode === 'all' && cameraMode !== 'stage-pov'}
          />
        </group>
      </group>
    </group>
  );
};
