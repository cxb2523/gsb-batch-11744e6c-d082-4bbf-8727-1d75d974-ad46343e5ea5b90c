// ==============================================
// Copyright (c) 2025 reall3d.com, MIT license
// ==============================================
/*
* 代码片段
*/
precision highp float;
precision highp int;

uniform highp usampler2DArray splatTexture0, splatTexture1;
uniform highp usampler2D splatShTexture12, splatShTexture3, shPalettes;
uniform vec2 focal, viewport;
uniform int usingIndex, shDegree, particleMode, transitionEffect;
uniform bool pointMode, bigSceneMode, useLod, showWaterMark, debugEffect, shPalettesReady;
uniform float topY, maxRadius, currentVisibleRadius, currentLightRadius, performanceNow, performanceAct;
uniform float minPixelDiameter, maxPixelDiameter, minAlpha;
uniform vec4 markPoint, waterMarkColor;
uniform uint splatTextureWidth, flagValue, activeFlagValue, splatTextureHeightAry;

attribute uint splatIndex;

varying vec4 vColor;
varying vec4 vPosition;