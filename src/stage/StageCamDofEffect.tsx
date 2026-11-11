/**
 * Opt-in Single-Pass WebGL2 Depth-of-Field (DoF) Bokeh Effect for Stage Cam Viewfinder.
 *
 * Architectural Highlights:
 *   - Uses a single WebGLRenderTarget with an attached hardware THREE.DepthTexture,
 *     capturing scene color and hardware depth in 1 render pass without `scene.overrideMaterial`
 *     (100% compatible with @react-three/drei <Line> and <Edges> geometries).
 *   - Evaluates the exact Gaussian thin-lens Circle of Confusion (CoC) formula matching
 *     Layer 1 `opticsMath.ts` ([D_near, D_far] stay crisp; out-of-focus foreground and
 *     background regions blur smoothly via a 29-tap concentric bokeh disc kernel).
 *   - Bypasses the FBO pass completely when `dof.enabled === false` (`dof: 'deep'`).
 */

import React, { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { StageFrame } from '../core/types';
import {
  FULL_FRAME_SENSOR_WIDTH_MM,
  OPTICS_DOF_DEFAULTS,
} from '../core/constants';

const DOF_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const DOF_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform float uNearClip;
  uniform float uFarClip;
  uniform float uFocusDistanceM;
  uniform float uNearLimitM;
  uniform float uFarLimitM;
  uniform float uFocalLengthMm;
  uniform float uApertureFStop;
  uniform float uSensorHeightMm;
  uniform float uAspect;
  uniform float uMaxBlur;

  varying vec2 vUv;

  float getLinearDepthM(const in vec2 uv) {
    float fragDepth = texture2D(tDepth, uv).x;
    float viewZ = (uNearClip * uFarClip) / ((uFarClip - uNearClip) * fragDepth - uFarClip);
    return -viewZ;
  }

  float computeCocRadius(const in float depthM) {
    if (depthM >= uNearLimitM && depthM <= uFarLimitM) {
      return 0.0;
    }
    float distFromBracket = depthM < uNearLimitM
      ? (uNearLimitM - depthM)
      : (depthM - uFarLimitM);
    float dMm = uFocusDistanceM * 1000.0;
    float denom = max(1.0, uApertureFStop * uSensorHeightMm * max(1.0, dMm - uFocalLengthMm));
    float opticalScale = (uFocalLengthMm * uFocalLengthMm) / denom;
    float rawBlur = opticalScale * (abs(depthM - uFocusDistanceM) / max(0.2, depthM));
    float ramp = smoothstep(0.0, 0.25, distFromBracket);
    return clamp(rawBlur * ramp * 2.2, 0.0, uMaxBlur);
  }

  void main() {
    float centerDepth = getLinearDepthM(vUv);
    float centerCoc = computeCocRadius(centerDepth);

    if (centerCoc < 0.0004) {
      gl_FragColor = texture2D(tColor, vUv);
      return;
    }

    vec2 aspectScale = vec2(1.0 / max(0.1, uAspect), 1.0);
    vec2 radius = aspectScale * centerCoc;

    vec4 accumColor = texture2D(tColor, vUv);
    float totalWeight = 1.0;

    // 28 concentric bokeh disc taps (2 rings: 12 inner + 16 outer)
    const int TAP_COUNT = 28;
    vec2 offsets[28];
    offsets[0]  = vec2( 0.500,  0.000);
    offsets[1]  = vec2( 0.433,  0.250);
    offsets[2]  = vec2( 0.250,  0.433);
    offsets[3]  = vec2( 0.000,  0.500);
    offsets[4]  = vec2(-0.250,  0.433);
    offsets[5]  = vec2(-0.433,  0.250);
    offsets[6]  = vec2(-0.500,  0.000);
    offsets[7]  = vec2(-0.433, -0.250);
    offsets[8]  = vec2(-0.250, -0.433);
    offsets[9]  = vec2( 0.000, -0.500);
    offsets[10] = vec2( 0.250, -0.433);
    offsets[11] = vec2( 0.433, -0.250);

    offsets[12] = vec2( 1.000,  0.000);
    offsets[13] = vec2( 0.924,  0.383);
    offsets[14] = vec2( 0.707,  0.707);
    offsets[15] = vec2( 0.383,  0.924);
    offsets[16] = vec2( 0.000,  1.000);
    offsets[17] = vec2(-0.383,  0.924);
    offsets[18] = vec2(-0.707,  0.707);
    offsets[19] = vec2(-0.924,  0.383);
    offsets[20] = vec2(-1.000,  0.000);
    offsets[21] = vec2(-0.924, -0.383);
    offsets[22] = vec2(-0.707, -0.707);
    offsets[23] = vec2(-0.383, -0.924);
    offsets[24] = vec2( 0.000, -1.000);
    offsets[25] = vec2( 0.383, -0.924);
    offsets[26] = vec2( 0.707, -0.707);
    offsets[27] = vec2( 0.924, -0.383);

    for (int i = 0; i < TAP_COUNT; i++) {
      vec2 sampleUv = clamp(vUv + offsets[i] * radius, 0.001, 0.999);
      float sampleDepth = getLinearDepthM(sampleUv);
      float sampleCoc = computeCocRadius(sampleDepth);

      // Prevent sharp foreground objects from bleeding into blurred background pixels
      float isCloser = step(sampleDepth, centerDepth - 0.12);
      float w = mix(1.0, smoothstep(0.0, centerCoc, sampleCoc + 0.0015), isCloser);

      accumColor += texture2D(tColor, sampleUv) * w;
      totalWeight += w;
    }

    gl_FragColor = accumColor / max(1.0, totalWeight);
    gl_FragColor.a = 1.0;
  }
`;

export interface StageCamDofEffectProps {
  frameRef: React.RefObject<StageFrame>;
  uiFrame: StageFrame;
}

export const StageCamDofEffect: React.FC<StageCamDofEffectProps> = ({
  frameRef,
  uiFrame,
}) => {
  const { gl, size, viewport } = useThree();

  const { renderTarget, quadScene, quadCamera, material } = useMemo(() => {
    const depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    depthTexture.minFilter = THREE.NearestFilter;
    depthTexture.magFilter = THREE.NearestFilter;

    const rt = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      colorSpace: THREE.SRGBColorSpace,
      depthBuffer: true,
      stencilBuffer: false,
      depthTexture,
    });

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: rt.texture },
        tDepth: { value: depthTexture },
        uNearClip: { value: 0.1 },
        uFarClip: { value: 250.0 },
        uFocusDistanceM: { value: 3.0 },
        uNearLimitM: { value: 0.0 },
        uFarLimitM: { value: 1000.0 },
        uFocalLengthMm: { value: 50.0 },
        uApertureFStop: { value: 2.8 },
        uSensorHeightMm: { value: 20.25 },
        uAspect: { value: 16 / 9 },
        uMaxBlur: { value: OPTICS_DOF_DEFAULTS.MAX_BLUR_FRACTION },
      },
      vertexShader: DOF_VERTEX_SHADER,
      fragmentShader: DOF_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
    });

    const qScene = new THREE.Scene();
    const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    qScene.add(quad);

    return {
      renderTarget: rt,
      quadScene: qScene,
      quadCamera: qCam,
      material: mat,
    };
  }, []);

  // Synchronize FBO pixel dimensions with canvas size and DPR
  useEffect(() => {
    const dpr = viewport.dpr || 1;
    const w = Math.max(1, Math.floor(size.width * dpr));
    const h = Math.max(1, Math.floor(size.height * dpr));
    renderTarget.setSize(w, h);
    material.uniforms.uAspect.value = size.width / Math.max(1, size.height);
  }, [size.width, size.height, viewport.dpr, renderTarget, material]);

  // Clean up GPU resources on unmount
  useEffect(() => {
    return () => {
      renderTarget.depthTexture?.dispose();
      renderTarget.dispose();
      material.dispose();
    };
  }, [renderTarget, material]);

  // Priority 1 takes over the final R3F render pass when mounted
  useFrame(({ scene, camera }) => {
    const committedCam = uiFrame.stageCamera;
    const liveFrame = frameRef.current;
    const isShotDesynced =
      Boolean(liveFrame?.stageCamera.shotId) &&
      Boolean(committedCam.shotId) &&
      liveFrame?.stageCamera.shotId !== committedCam.shotId;

    const stageCam = isShotDesynced
      ? committedCam
      : liveFrame?.stageCamera ?? committedCam;
    const dof = stageCam.dof;

    // Fast path: if current shot has infinite DoF ('deep'), render directly to screen
    if (!dof || !dof.enabled || !Number.isFinite(dof.apertureFStop)) {
      gl.setRenderTarget(null);
      gl.render(scene, camera);
      return;
    }

    const persp = camera as THREE.PerspectiveCamera;
    const aspectRatio = Math.max(0.1, stageCam.transform.aspectRatio);
    const sensorHeightMm = FULL_FRAME_SENSOR_WIDTH_MM / aspectRatio;

    material.uniforms.uNearClip.value = persp.near || 0.1;
    material.uniforms.uFarClip.value = persp.far || 250.0;
    material.uniforms.uFocusDistanceM.value = dof.focusDistanceM;
    material.uniforms.uNearLimitM.value = dof.nearLimitM;
    material.uniforms.uFarLimitM.value = Number.isFinite(dof.farLimitM)
      ? dof.farLimitM
      : 1000.0;
    material.uniforms.uFocalLengthMm.value =
      stageCam.transform.pose.focalLengthMm;
    material.uniforms.uApertureFStop.value = dof.apertureFStop;
    material.uniforms.uSensorHeightMm.value = sensorHeightMm;

    // 1. Render scene color & hardware depth into offscreen target
    gl.setRenderTarget(renderTarget);
    gl.clear();
    gl.render(scene, camera);

    // 2. Render thin-lens DoF bokeh composite to screen
    gl.setRenderTarget(null);
    gl.render(quadScene, quadCamera);
  }, 1);

  return null;
};

