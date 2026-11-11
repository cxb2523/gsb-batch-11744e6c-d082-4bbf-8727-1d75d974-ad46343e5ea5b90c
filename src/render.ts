import {
  DepthTexture, DepthFormat, UnsignedIntType, WebGLRenderTarget, HalfFloatType,
  ShaderMaterial, Vector2, Color,
  type WebGLRenderer, type Scene, type PerspectiveCamera, type Material,
  type Object3D, DataUtils,
  MeshDepthMaterial, type Mesh,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PALETTE, toonShared } from './art/toon';

/** Append inside main, after the original material's discard/color logic. */
function appendToMain(shader: string, code: string): string {
  const main = shader.indexOf('void main');
  if (main < 0) throw new Error('Ink rendering requires a fragment main function');
  const start = shader.indexOf('{', main);
  let depth = 1;
  let end = start + 1;
  for (; end < shader.length && depth; end++) {
    if (shader[end] === '{') depth++;
    if (shader[end] === '}') depth--;
  }
  return shader.slice(0, end - 1) + code + shader.slice(end - 1);
}

/** One scene render produces both colors and real displaced surface information.
 * Patching the existing fragment retains leaf billboards, cutouts and animation;
 * a generic overrideMaterial normal pass would change that geometry. */
function createSurfaceInstaller(camera: PerspectiveCamera, resolution: Vector2) {
  const configured = new WeakSet<Material>();
  const ids = new Map<string, number>();
  // Objects added after boot (threads, lanterns, residents) are configured
  // lazily before their first frame; every material must write both targets.
  return (scene: Scene) => scene.traverse((object: Object3D & { material?: Material | Material[] }) => {
    if (!object.material) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (configured.has(material)) continue;
      configured.add(material);
      const previous = material.onBeforeCompile;
      const cacheKey = material.customProgramCacheKey.bind(material);
      const type = material as Material & { color?: Color };
      const styleKey = `${material.name}:${type.color?.getHexString() ?? material.uuid}`;
      if (!ids.has(styleKey)) ids.set(styleKey, (ids.size + 1) / 1024);
      const surfaceId = ids.get(styleKey)!;
      const isWater = material.name.includes('Water');
      const contribution = object.userData.noOutline || material.userData.noOutline || material.transparent || isWater ? 0 : 1;
      material.onBeforeCompile = (shader, renderer) => {
        previous.call(material, shader, renderer);
        shader.uniforms.uInkProjectionInverse = { value: camera.projectionMatrixInverse };
        shader.uniforms.uInkResolution = { value: resolution };
        shader.uniforms.uInkSurfaceId = { value: surfaceId };
        const outlineContribution = shader.uniforms.uCameraVisibility
          ? `${contribution.toFixed(1)} * smoothstep(0.9, 1.0, uCameraVisibility)`
          : contribution.toFixed(1);
        const idExpression = /varying\s+float\s+vSurfaceId/.test(shader.fragmentShader)
          ? 'fract(vSurfaceId / 1000000.0)' : 'uInkSurfaceId';
        shader.fragmentShader = `
          layout(location = 1) out highp vec4 inkSurface;
          uniform mat4 uInkProjectionInverse;
          uniform vec2 uInkResolution;
          uniform float uInkSurfaceId;
        ` + appendToMain(shader.fragmentShader, `
          vec4 inkView = uInkProjectionInverse * vec4(gl_FragCoord.xy / uInkResolution * 2.0 - 1.0, gl_FragCoord.z * 2.0 - 1.0, 1.0);
          vec3 inkPosition = inkView.xyz / inkView.w;
          vec3 inkNormal = normalize(cross(dFdx(inkPosition), dFdy(inkPosition)));
          if (!gl_FrontFacing) inkNormal = -inkNormal;
          inkSurface = vec4(inkNormal * 0.5 + 0.5, ${outlineContribution});
          ${material.transparent || material.userData.preserveInkSurfaceId ? '' : `gl_FragColor.a = ${idExpression};`}
        `);
      };
      // The surface id is a uniform: keep it out of the program key so materials
      // share programs (one program per id made every draw switch programs).
      material.customProgramCacheKey = () => `${cacheKey()}:unspool-mrt-v1:${contribution}`;
      material.needsUpdate = true;
    }
  });
}

/** Depth/normal/material ink edges with a slight hand-drawn wobble, then a
 * light paper grade (grain + vignette). No external textures. */
export async function createInkRenderer(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) {
  const cssSize = renderer.getSize(new Vector2());
  const resolution = renderer.getDrawingBufferSize(new Vector2());
  const installSurfaceOutput = createSurfaceInstaller(camera, resolution);
  installSurfaceOutput(scene);
  const target = new WebGLRenderTarget(resolution.x, resolution.y, {
    count: 2, depthBuffer: true, type: HalfFloatType,
    samples: 0,
  });
  target.depthTexture = new DepthTexture(resolution.x, resolution.y, UnsignedIntType);
  target.depthTexture.format = DepthFormat;
  const waterMeshes: Mesh[] = [];
  const depthExcludedMeshes: Mesh[] = [];
  scene.traverse(object => {
    const mesh = object as Mesh;
    const material = mesh.material as ShaderMaterial | undefined;
    if (material?.isShaderMaterial && material.uniforms.uUseSceneDepth) waterMeshes.push(mesh);
    // A generic depth material does not know authored billboard/cable positions
    // or red-channel cutouts. Keep those VFX out of the water's opaque-depth
    // input; otherwise their undisplaced source quads create false coast foam.
    if (mesh.isMesh && (object.userData.ignoreDepthPrepass || material?.transparent ||
      object.name === 'UnspoolSky' ||
      (material?.isShaderMaterial && material.uniforms.uUseSceneDepth))) depthExcludedMeshes.push(mesh);
  });
  const waterDepth = new WebGLRenderTarget(resolution.x,resolution.y,{depthBuffer:true});
  waterDepth.depthTexture = new DepthTexture(resolution.x,resolution.y,UnsignedIntType);
  const depthMaterial = new MeshDepthMaterial();
  for (const mesh of waterMeshes) {
    const material = mesh.material as ShaderMaterial;
    material.uniforms.tSceneDepth.value = waterDepth.depthTexture;
    material.uniforms.uUseSceneDepth.value = 1;
    material.uniforms.uResolution.value = resolution;
  }
  // MRT scene attachments and fullscreen postprocess destinations are distinct.
  // WebGL rejects a fullscreen shader with only output 0 when a second draw
  // buffer remains active, even when the source MRT itself rendered correctly.
  const composer = new EffectComposer(renderer);
  const ink = new ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null }, tDepth: { value: null }, tInfo: { value: null },
      resolution: { value: resolution }, near: { value: camera.near },
      far: { value: camera.far }, ink: { value: new Color(PALETTE.ink) }, time: { value: 0 },
      // Probe distance in drawing-buffer pixels: constant in CSS pixels, so outlines
      // keep their weight on retina and mobile screens and under adaptive resolution.
      lineWidth: { value: Math.max(1, renderer.getPixelRatio()) },
      dusk: toonShared.uDusk,
      paper: toonShared.uPaper,
    },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse,tDepth,tInfo;
      uniform vec2 resolution;
      uniform float near,far,time,lineWidth,dusk;
      uniform vec3 ink,paper;
      varying vec2 vUv;
      // "Hash without Sine" by David Hoskins, MIT license (shadertoy.com/view/4djSRW).
      float hash(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
      float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float viewDepth(vec2 p) {
        float d=texture2D(tDepth,p).r;
        return near*far/(far-d*(far-near));
      }
      void main() {
        vec4 colors=texture2D(tDiffuse,vUv);
        vec2 fragment=gl_FragCoord.xy;
        float unit=resolution.y;
        // Hand-drawn wobble: a slow wander of where the pen lands (coarse + fine),
        // redrawn on three alternating frames at ~5 fps, so lines breathe instead of buzz.
        float boil=mod(floor(time*5.0),3.0);
        vec2 np=fragment/unit*8.0+boil*13.7;
        vec2 wobble=(vec2(vnoise(np),vnoise(np+41.3))-.5)*1.5
          +(vec2(vnoise(np*3.9+7.0),vnoise(np*3.9+19.0))-.5)*.7;
        vec2 px=vec2(lineWidth)/resolution;
        vec2 uvBase=vUv+wobble*lineWidth/resolution;
        vec2 dirs[5]=vec2[5](vec2(0.),vec2(-1.,0.),vec2(1.,0.),vec2(0.,-1.),vec2(0.,1.));
        float depths[5],ids[5],contributions[5];vec3 normals[5];
        float nearest=far;float contribution=0.;
        for(int i=0;i<5;i++) {
          vec2 uv=uvBase+dirs[i]*px;
          vec4 info=texture2D(tInfo,uv);
          depths[i]=viewDepth(uv);
          ids[i]=texture2D(tDiffuse,uv).a;
          normals[i]=info.rgb*2.-1.;
          contributions[i]=info.a;
          if(depths[i]<nearest) {nearest=depths[i];contribution=info.a;}
        }
        if(nearest>=far*.99) contribution=0.;
        float depthDelta=length(vec2(depths[1]-depths[2],depths[3]-depths[4]))/max(nearest,0.1);
        float normalDelta=length(vec2(distance(normals[1],normals[0])-distance(normals[2],normals[0]),distance(normals[3],normals[0])-distance(normals[4],normals[0])));
        float idDelta=length(vec2(ids[1]-ids[2],ids[3]-ids[4]));
        float silhouette=smoothstep(.007,.025,depthDelta);
        // Creases and material seams belong to close-ups; far away they would turn
        // the faceted planet into mesh noise, so only silhouettes remain.
        float detail=1.-smoothstep(9.,26.,nearest);
        float crease=smoothstep(.43,.52,normalDelta)*.65*detail;
        float materialEdge=smoothstep(.0001,.0002,idDelta)*.5*detail;
        float fade=1.-smoothstep(40.,140.,nearest);
        // Pen pressure: strokes are never perfectly even.
        float pressure=.8+.2*vnoise(fragment/unit*13.0+boil*7.1);
        float line=clamp(silhouette+crease+materialEdge,0.,1.)*contribution*fade;
        vec3 color=mix(colors.rgb,ink,line*.92*pressure);

        // Paper: static fibers and uneven tooth, a whisper of boiling grain, warm grade.
        float fiber=vnoise(fragment*.5)*.6+vnoise(fragment*1.7+3.1)*.4;
        float blotch=vnoise(fragment/unit*2.6+5.0);
        float grain=hash(fragment+boil*17.0);
        color*=1.+(fiber-.5)*.04+(blotch-.5)*.035+(grain-.5)*.014;
        float luma=dot(color,vec3(.2126,.7152,.0722));
        color=mix(vec3(luma),color,1.06);
        color*=mix(vec3(1.),vec3(1.025,1.0,.955),.6);
        // Dusk: a little amber and violet, deeper corners.
        color*=mix(vec3(1.),vec3(1.04,.9,.9),dusk*.6);
        vec2 centered=(vUv-.5)*vec2(resolution.x/resolution.y,1.)*.75;
        float vignette=smoothstep(.2,.95,length(centered));
        color*=mix(vec3(1.),mix(vec3(.9,.87,.86),vec3(.74,.68,.8),dusk),vignette*.55);
        gl_FragColor=vec4(max(color,0.),1.);
      }`,
    depthTest: false, depthWrite: false,
  });
  // Keep the scene uniforms bound explicitly; the composer's previous buffer
  // is intentionally empty because this is its first postprocess pass.
  const pass = new ShaderPass(ink, '__sceneSource');
  const originalRender = pass.render.bind(pass);
  let captured = false;
  const pixel = (buffer: WebGLRenderTarget, attachment = 0) => {
    const bytes = new Uint16Array(4);
    renderer.readRenderTargetPixels(buffer, Math.floor(buffer.width / 2), Math.floor(buffer.height / 2), 1, 1, bytes, undefined, attachment);
    return Array.from(bytes, DataUtils.fromHalfFloat);
  };
  pass.render = (r, write, read, dt, mask) => {
    ink.uniforms.tDiffuse.value = target.texture;
    ink.uniforms.tDepth.value = target.depthTexture;
    ink.uniforms.tInfo.value = target.textures[1];
    const source = import.meta.env.DEV && !captured ? { color: pixel(target), info: pixel(target, 1) } : undefined;
    originalRender(r, write, read, dt, mask);
    if (source) {
      captured = true;
      document.querySelector<HTMLElement>('#world')!.dataset.renderEvidence = JSON.stringify({ source, result: pixel(write), size: [target.width, target.height], samples: target.samples });
    }
  };
  composer.addPass(pass);
  composer.addPass(new OutputPass());
  composer.setSize(cssSize.x, cssSize.y);
  const frameStats = { calls: 0, triangles: 0, points: 0, shadowUpdates: 0 };
  let elapsed = 0;
  return {
    /** Configure materials of objects added since the last call. */
    refresh() { installSurfaceOutput(scene); },
    render(dt = 1 / 60) {
      elapsed += dt;
      ink.uniforms.time.value = elapsed;
      installSurfaceOutput(scene);
      // One composed frame contains water depth, shadow depth, scene MRT, ink,
      // and output. Count that full cost rather than only the last fullscreen
      // triangle, and never regenerate the shadow map for the water prepass.
      const autoReset = renderer.info.autoReset;
      renderer.info.autoReset = false;
      renderer.info.reset();
      const shadowsEnabled = renderer.shadowMap.enabled;
      try {
        if (waterMeshes.length) {
          // Water samples opaque depth from a separate attachment; sampling the
          // depth texture currently being written is undefined on mobile GPUs.
          const visible = depthExcludedMeshes.map(mesh => mesh.visible);
          depthExcludedMeshes.forEach(mesh => { mesh.visible = false; });
          const override = scene.overrideMaterial;
          scene.overrideMaterial = depthMaterial;
          renderer.shadowMap.enabled = false;
          try {
            renderer.setRenderTarget(waterDepth);
            renderer.render(scene,camera);
          } finally {
            renderer.shadowMap.enabled = shadowsEnabled;
            scene.overrideMaterial = override;
            depthExcludedMeshes.forEach((mesh,i) => { mesh.visible = visible[i]; });
          }
        }
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        composer.render();
      } finally {
        frameStats.calls = renderer.info.render.calls;
        frameStats.triangles = renderer.info.render.triangles;
        frameStats.points = renderer.info.render.points;
        frameStats.shadowUpdates = shadowsEnabled ? 1 : 0;
        renderer.info.autoReset = autoReset;
      }
    },
    stats() { return { ...frameStats }; },
    resize(width: number, height: number) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
      renderer.getDrawingBufferSize(resolution);
      target.setSize(resolution.x, resolution.y);
      waterDepth.setSize(resolution.x,resolution.y);
      waterMeshes.forEach(mesh => {
        const uniforms = (mesh.material as ShaderMaterial).uniforms;
        uniforms.uCameraNear.value = camera.near;
        uniforms.uCameraFar.value = camera.far;
      });
      ink.uniforms.near.value = camera.near;
      ink.uniforms.far.value = camera.far;
      ink.uniforms.lineWidth.value = Math.max(1, renderer.getPixelRatio());
    },
  };
}
