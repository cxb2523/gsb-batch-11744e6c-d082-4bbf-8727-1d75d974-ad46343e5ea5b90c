'use strict';
// ======================================================================
//  main.js —— 引擎启动：渲染器、天空/光照/环境贴图、后处理、
//              菜单与设置、主循环（128 tick 固定步长 + 插值渲染）
// ======================================================================
const QUALITY = {
  low:    { label: '低',   pr: 0.75, shadow: 1024, msaa: 0, bloom: false, fxaa: true },
  medium: { label: '中',   pr: 1.0,  shadow: 2048, msaa: 0, bloom: true,  fxaa: true },
  high:   { label: '高',   pr: 1.0,  shadow: 4096, msaa: 4, bloom: true,  fxaa: false },
  ultra:  { label: '极致', pr: 2.0,  shadow: 4096, msaa: 4, bloom: true,  fxaa: false },
};

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, exposure: { value: 0.9 }, time: { value: 0 }, flash: { value: 0 }, damage: { value: 0 },
    vignette: { value: 0.32 }, grain: { value: 0.025 }, chroma: { value: 0.006 }, blur: { value: 0 }, lowhp: { value: 0 },
    sat: { value: 1.08 }, contrast: { value: 1.06 }, res: { value: new THREE.Vector2(1920, 1080) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float exposure, time, flash, damage, vignette, grain, chroma, blur, lowhp, sat, contrast; uniform vec2 res;
    varying vec2 vUv;
    vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 ACES(vec3 c){
      const mat3 IM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
      const mat3 OM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
      c = IM * c; c = RRTAndODTFit(c); c = OM * c; return clamp(c, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(vec3(0.0031308), c)); }
    void main(){
      vec2 uv = vUv; vec2 d = uv - 0.5;
      vec3 col;
      if (blur > 0.001) {
        col = vec3(0.0);
        for (int i = 0; i < 10; i++) { float k = float(i) / 9.0; col += texture2D(tDiffuse, uv - d * blur * k * 0.08).rgb; }
        col /= 10.0;
      } else {
        float r2 = dot(d, d); vec2 off = d * r2 * chroma;
        col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      }
      col = ACES(col * exposure / 0.6);
      col = toSRGB(col);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, sat);
      col = (col - 0.5) * contrast + 0.5;
      col += vec3(0.014, 0.006, -0.012) * smoothstep(0.45, 1.0, l) + vec3(-0.01, 0.0, 0.014) * (1.0 - smoothstep(0.0, 0.35, l));
      float v = smoothstep(0.9, 0.28, length(d * vec2(1.0, 0.82)));
      col *= mix(1.0 - vignette, 1.0, v);
      col = mix(col, vec3(0.5, 0.02, 0.0), damage * (1.0 - v) * 0.9);
      float g = dot(col, vec3(0.3, 0.59, 0.11));
      col = mix(col, vec3(g) * vec3(1.05, 0.9, 0.9), lowhp * 0.55);
      float n = fract(sin(dot(uv * res + fract(time) * 97.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * grain;
      col = mix(col, vec3(1.0), clamp(flash, 0.0, 1.0));
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

const Engine = {
  game: null, paused: false, forceRun: false, menuT: 0,
  opts: { mode: 'comp', team: 'CT', diff: 'normal', size: 5, ff: false },

  progress(p, msg) { $('loadBar').style.width = (p * 100).toFixed(0) + '%'; if (msg) $('loadText').textContent = msg; },
  async step(p, msg) { this.progress(p, msg); await new Promise((r) => setTimeout(r, 16)); },

  async boot() {
    const S = Settings.data;
    this.forceRun = /[?&]test=1/.test(location.search);
    await this.step(0.02, '初始化渲染器');
    const canvas = $('game');
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    r.outputEncoding = THREE.LinearEncoding;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setSize(innerWidth, innerHeight);
    this.isGL2 = r.capabilities.isWebGL2;
    // 首次运行：按显卡自动选择画质（集显/软件渲染降档）
    try {
      const gl = r.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
      this.gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
    } catch (e) { this.gpu = ''; }
    if (!S.qualityChosen) {
      const g = (this.gpu || '').toLowerCase();
      if (/swiftshader|llvmpipe|software|basic render/.test(g)) S.quality = 'low';
      else if (/intel|uhd|iris|hd graphics|mali|adreno|powervr|apple gpu/.test(g) || !this.isGL2) S.quality = 'medium';
      else S.quality = 'high';
      S.qualityChosen = true; Settings.save();
    }
    const scene = this.scene = new THREE.Scene();
    const cam = this.camera = new THREE.PerspectiveCamera(73.74, innerWidth / innerHeight, 0.03, 1500);
    cam.rotation.order = 'YXZ';
    scene.add(cam);

    await Tex.init(S.quality, (p, m) => this.progress(0.04 + p * 0.36, m));
    await this.step(0.42, '构建地图「炽沙小镇」');
    this.world = new World();
    this.map = MapGen.build(this.world, scene, (p, m) => this.progress(0.42 + p * 0.4, m));
    await this.step(0.83, '生成导航网格');
    this.nav = new NavGrid(this.world);
    const seeds = [...this.map.spawns.T, ...this.map.spawns.CT, ...Object.values(this.map.points)];
    this.nav.build(seeds);
    await this.step(0.88, '天空与光照');
    this.setupSky();
    Effects.init(scene, this.world);
    Effects.setFog(scene.fog.color, scene.fog.density);
    this.vm = new ViewModel();
    this.vm.setEnv(scene.environment, this.sunDir);
    HUD.init();
    Input.init(canvas);
    this.buildComposer();
    await this.step(0.93, '预编译着色器');
    this.warmup();
    await this.step(0.97, '合成音效');
    Sound.init();
    const wake = () => { Sound.resume(); Sound.startAmbience(); };
    window.addEventListener('pointerdown', wake); window.addEventListener('keydown', wake);
    await this.step(1, '完成');
    this.bindUI();
    Lobby.init();
    this.startBgPump();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    $('loading').classList.add('hidden');
    $('menu').classList.remove('hidden');
    $('verLabel').textContent = `v${VERSION} · 爆发式滑铲 · 经典 FPS 移动物理 · 128 tick · 局域网联机`;
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  },

  setupSky() {
    const scene = this.scene, el = 34 * DEG, az = 215 * DEG;
    const sunDir = this.sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    const L = this.light = { exposure: 0.5, env: 0.42, sun: 3.4, hemi: 0.12, turbidity: 4.2, rayleigh: 1.9, mie: 0.004, ground: [0.4, 0.31, 0.2] };
    const mkSky = (scale, envScale) => {
      const s = new THREE.Sky(); s.scale.setScalar(scale);
      if (envScale != null) {
        s.material = s.material.clone();
        s.material.uniforms.envScale = { value: envScale };
        s.material.fragmentShader = 'uniform float envScale;\n' + s.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * envScale, 1.0 );');
      }
      const u = s.material.uniforms;
      u.turbidity.value = L.turbidity; u.rayleigh.value = L.rayleigh; u.mieCoefficient.value = L.mie; u.mieDirectionalG.value = 0.86;
      u.sunPosition.value.copy(sunDir);
      return s;
    };
    this.mkSky = mkSky;
    this.sky = mkSky(5000); scene.add(this.sky);
    const sun = this.sun = new THREE.DirectionalLight(0xffe4c0, 3.1);
    sun.intensity = L.sun;
    sun.position.copy(sunDir).multiplyScalar(160); sun.target.position.set(0, 0, 0);
    scene.add(sun); scene.add(sun.target);
    sun.castShadow = true;
    const sc = sun.shadow.camera; sc.left = -74; sc.right = 74; sc.top = 74; sc.bottom = -74; sc.near = 20; sc.far = 340;
    sc.layers.enable(1);
    const Q = QUALITY[Settings.data.quality] || QUALITY.high;
    sun.shadow.mapSize.set(Q.shadow, Q.shadow);
    sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.04;
    this.hemi = new THREE.HemisphereLight(0xb9cfff, 0x9b7e5c, L.hemi); scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(new THREE.Color(0.86, 0.8, 0.7), 0.0032);
    this.bakeEnv();
  },
  // 环境贴图（天空 + 沙地反弹），亮度可调
  bakeEnv() {
    const L = this.light, scene = this.scene;
    const u = this.sky.material.uniforms;
    u.turbidity.value = L.turbidity; u.rayleigh.value = L.rayleigh; u.mieCoefficient.value = L.mie;
    const pm = new THREE.PMREMGenerator(this.renderer);
    const es = new THREE.Scene();
    es.add(this.mkSky(900, L.env));
    const g = L.ground;
    const gnd = new THREE.Mesh(new THREE.CircleGeometry(90, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(g[0] * L.env * 2, g[1] * L.env * 2, g[2] * L.env * 2) }));
    gnd.rotation.x = -Math.PI / 2; gnd.position.y = -3; es.add(gnd);
    const rt = pm.fromScene(es, 0.03);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    scene.environment = rt.texture;
    if (this.vm) this.vm.setEnv(rt.texture, this.sunDir);
    pm.dispose();
    this.sun.intensity = L.sun; this.hemi.intensity = L.hemi;
    if (this.final) this.final.uniforms.exposure.value = L.exposure;
  },
  tune(o) { Object.assign(this.light, o); this.bakeEnv(); },

  buildComposer() {
    const r = this.renderer, S = Settings.data, Q = QUALITY[S.quality] || QUALITY.high;
    const pr = Math.min(Q.pr, devicePixelRatio || 1) * (S.renderScale || 1);
    r.setPixelRatio(pr);
    r.setSize(innerWidth, innerHeight);
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    if (this.composer) { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); }
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    if (this.isGL2 && Q.msaa) rt.samples = Q.msaa;
    const comp = this.composer = new THREE.EffectComposer(r, rt);
    comp.addPass(new THREE.RenderPass(this.scene, this.camera));
    const vm = this.vm;
    class VMPass extends THREE.Pass {
      constructor() { super(); this.needsSwap = false; }
      render(renderer, writeBuffer, readBuffer) {
        if (!Engine.game || !vm.root.visible) return;
        renderer.setRenderTarget(readBuffer);
        const ac = renderer.autoClear; renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(vm.scene, vm.camera);
        renderer.autoClear = ac;
      }
    }
    comp.addPass(new VMPass());
    if (Q.bloom) { this.bloom = new THREE.UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.32, 0.45, 0.92); comp.addPass(this.bloom); } else this.bloom = null;
    this.final = new THREE.ShaderPass(FinalShader);
    this.final.uniforms.exposure.value = this.light ? this.light.exposure : 0.62;
    comp.addPass(this.final);
    if (Q.fxaa || !rt.samples) { this.fxaa = new THREE.ShaderPass(THREE.FXAAShader); comp.addPass(this.fxaa); } else this.fxaa = null;
    comp.setSize(size.x, size.y);
    if (this.fxaa) this.fxaa.material.uniforms.resolution.value.set(1 / size.x, 1 / size.y);
    this.final.uniforms.res.value.set(size.x, size.y);
    if (this.sun) {
      const ms = Q.shadow;
      if (this.sun.shadow.mapSize.x !== ms) { this.sun.shadow.mapSize.set(ms, ms); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    }
  },
  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.buildComposer();
    this.vm.setFov(Settings.data.vmFov, w / h);
  },
  warmup() {
    // 预构建模型 & 编译着色器，避免首帧卡顿
    for (const id of ['ak47', 'm4a4', 'awp', 'deagle', 'usp', 'glock', 'mp9', 'knife', 'butterfly', 'he', 'flash', 'smoke', 'c4']) { this.vm.model(id); Models.thirdPerson(id); }
    const tmp = [new Models.Humanoid('CT'), new Models.Humanoid('T')];
    tmp.forEach((h, i) => { h.setWeapon(i ? 'ak47' : 'm4a4'); h.root.position.set(0, -50, 0); this.scene.add(h.root); });
    for (const id in this.vm.models) { this.vm.root.add(this.vm.models[id].group); }
    try { this.renderer.compile(this.scene, this.camera); this.renderer.compile(this.vm.scene, this.vm.camera); } catch (e) { console.warn(e); }
    for (const id in this.vm.models) this.vm.root.remove(this.vm.models[id].group);
    tmp.forEach((h) => this.scene.remove(h.root));
  },

  // ---------------- 对局 ----------------
  // net：联机时由大厅传入 { opts, ctx }，ctx 为 NetHost / NetClient
  startGame(net) {
    Sound.init(); Sound.resume(); Sound.startAmbience();
    if (this.game) { const old = this.game; this.game = null; old.dispose(); }
    Effects.clearAll();
    const opts = Object.assign({}, this.opts, net ? net.opts : {});
    if (net) { opts.net = net.ctx; $('lobby').classList.add('hidden'); }
    this.game = new Game(this, opts);
    HUD.bind(this.game);
    this.game.mode.id === 'comp' && HUD.openBuy(this.game);
    $('menu').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('pause').classList.add('hidden');
    this.paused = false;
    this.vm.setFov(Settings.data.vmFov, innerWidth / innerHeight);
    this.acc = 0;
    if (!this.forceRun) Input.lock();
  },
  // silent：网络那头已经结束了对局（房主散场 / 掉线），不用再通知
  quitToMenu(silent) {
    const wasNet = !!(this.game && this.game.net);
    if (this.game) { const g = this.game; this.game = null; g.dispose(); }
    Input.unlock(); Input.exitFullscreen();
    $('hud').classList.add('hidden'); $('pause').classList.add('hidden'); $('clickToPlay').classList.add('hidden');
    HUD.scoreboard(false); HUD.closeBuy();
    $('menu').classList.remove('hidden');
    this.camera.layers.set(0);
    this.camera.fov = 73.74; this.camera.updateProjectionMatrix();
    Sound.stopAll();
    if (wasNet && !silent) Lobby.gameEnded();
  },
  pause() {
    if (!this.game) return;
    this.paused = true;
    $('pause').classList.remove('hidden');
    $('pauseHint').textContent = '';
  },
  resume() {
    $('pause').classList.add('hidden');
    $('settings').classList.add('hidden'); $('help').classList.add('hidden');
    Sound.resume();
    this.paused = false;
    Input.lock();
  },

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = (now - this.last) / 1000; this.last = now;
    if (!(dt > 0)) dt = 0.001; if (dt > 0.1) dt = 0.1;
    this.fps = this.fps ? lerp(this.fps, 1 / dt, 0.05) : 60;
    const g = this.game;
    const fu = this.final.uniforms;
    fu.time.value = now / 1000;
    if (g) {
      const live = !this.paused && (Input.locked || this.forceRun);
      // 联机时暂停只是不接收本机输入，对局本身（以及给别人的同步）不能停
      if (live || g.net) {
        const [mx, my] = Input.takeMouse();
        if (live) g.applyLook(mx, my);
        this.advance(dt, live);
        g.fps = this.fps;
        g.render(dt, this.acc / TICK, live ? mx : 0, live ? my : 0);
        if (!live && !this.paused && !this.forceRun) $('clickToPlay').classList.remove('hidden');
      } else {
        Input.takeMouse();
        g.render(0.0001, 1, 0, 0);
        if (!this.paused && !this.forceRun) $('clickToPlay').classList.remove('hidden');
      }
      const P = g.player, fx = Settings.data.motionFx !== false;
      fu.flash.value = g.flashAmt;
      fu.damage.value = g.dmgFlash;
      fu.lowhp.value = P.alive && P.hp <= 25 ? 0.6 + 0.4 * Math.sin(now / 300) : 0;
      fu.blur.value = P.alive && P.scoped ? clamp((P.inaccuracy() - (P.def.inaccScoped || 0)) / 60, 0, 1) * 0.6 : 0;
      fu.vignette.value = fx ? (P.alive && P.scoped ? 0.1 : 0.32) : 0.12;
      fu.grain.value = fx ? 0.022 : 0; fu.chroma.value = fx ? 0.006 : 0;
    } else {
      // 菜单：环绕飞行镜头
      this.menuT += dt;
      const t = this.menuT * 0.035, cam = this.camera;
      cam.position.set(Math.cos(t) * 34, 15 + Math.sin(t * 2.3) * 2.5, Math.sin(t) * 34 - 4);
      cam.lookAt(0, 1.5, -6);
      cam.fov = 60; cam.updateProjectionMatrix();
      Effects.update(dt, cam);
      fu.flash.value = 0; fu.damage.value = 0; fu.lowhp.value = 0; fu.blur.value = 0; fu.vignette.value = 0.35;
    }
    this.composer.render(dt);
  },
  // 固定步长推进对局
  advance(dt, live) {
    const g = this.game;
    this.acc += dt; let n = 0;
    while (this.acc >= TICK && n < 16) { if (live) g.buildPlayerCmd(); else g.idleCmd(); g.tick(TICK); Input.endTick(); this.acc -= TICK; n++; }
    if (n >= 16) this.acc = 0;
  },
  // 联机时窗口切到后台/最小化：浏览器会停掉 requestAnimationFrame，改由 Worker 定时器继续推进
  startBgPump() {
    try {
      const src = 'setInterval(() => postMessage(0), 16);';
      const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      w.onmessage = () => {
        const g = this.game;
        if (!g || !g.net || !document.hidden) return;
        const now = performance.now();
        let dt = (now - this.last) / 1000; this.last = now;
        if (!(dt > 0)) return; if (dt > 0.1) dt = 0.1;
        this.advance(dt, false);
        if (g.client) g.net.update(dt); else g.syncModels();
      };
    } catch (e) { /* 不支持 Worker：后台时对局会暂停 */ }
  },

  // ---------------- 菜单 / 设置 UI ----------------
  bindUI() {
    const self = this;
    const seg = (id, key, conv) => {
      const el = $(id);
      el.querySelectorAll('b').forEach((b) => b.addEventListener('click', () => {
        el.querySelectorAll('b').forEach((x) => x.classList.remove('on')); b.classList.add('on');
        self.opts[key] = conv ? conv(b.dataset.v) : b.dataset.v;
        Sound.init(); Sound.play('ui_click');
      }));
    };
    seg('optTeam', 'team'); seg('optDiff', 'diff'); seg('optSize', 'size', Number);
    document.querySelectorAll('#modeCards .card').forEach((c) => c.addEventListener('click', () => {
      document.querySelectorAll('#modeCards .card').forEach((x) => x.classList.remove('active')); c.classList.add('active');
      self.opts.mode = c.dataset.mode; Sound.init(); Sound.play('ui_click');
    }));
    $('btnStart').addEventListener('click', () => self.startGame());
    $('btnSettings').addEventListener('click', () => self.openSettings());
    $('btnHelp').addEventListener('click', () => $('help').classList.remove('hidden'));
    $('btnHelpClose').addEventListener('click', () => $('help').classList.add('hidden'));
    $('btnResume').addEventListener('click', () => self.resume());
    $('btnPauseSettings').addEventListener('click', () => self.openSettings());
    $('btnPauseHelp').addEventListener('click', () => $('help').classList.remove('hidden'));
    $('btnQuit').addEventListener('click', () => self.quitToMenu());
    $('btnSetClose').addEventListener('click', () => $('settings').classList.add('hidden'));
    $('btnSetReset').addEventListener('click', () => { Settings.reset(); self.renderSettings(); self.applySettings(true); });
    $('clickToPlay').addEventListener('click', () => { $('clickToPlay').classList.add('hidden'); Sound.resume(); Input.lock(); });
    Input.onUnlock = () => {
      if (!self.game || self.game.over) return;
      self.pause();
      // 刚按过 Ctrl 就丢失指针锁定 → 多半是浏览器快捷键(Ctrl+W/D 等)抢走了焦点
      if (performance.now() - Input.lastCtrlT < 400 && !document.fullscreenElement) {
        $('pauseHint').textContent = Settings.data.kbLock
          ? '浏览器快捷键打断了游戏（Ctrl 组合键）。点「继续游戏」会进入全屏并锁定键盘，之后不会再被打断'
          : '浏览器快捷键打断了游戏（Ctrl 组合键）。建议在设置里开启「全屏 + 键盘锁定」，或改用 C 下蹲';
      }
    };
    Input.onLock = () => { self.paused = false; $('pause').classList.add('hidden'); $('clickToPlay').classList.add('hidden'); };
    Input.onLockFail = () => { $('pauseHint').textContent = '浏览器拒绝了鼠标锁定，请稍候再点「继续游戏」'; if (!self.paused) $('clickToPlay').classList.remove('hidden'); };
    document.querySelectorAll('#setTabs b').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('#setTabs b').forEach((x) => x.classList.remove('on')); b.classList.add('on');
      self.setTab = b.dataset.t; self.renderSettings();
    }));
    window.addEventListener('beforeunload', (e) => { if (self.game && !self.game.over) { e.preventDefault(); e.returnValue = ''; } });
    document.addEventListener('visibilitychange', () => { if (document.hidden && self.game && Input.locked) Input.unlock(); });
    Input.uiKeyHandler = (e, down) => {
      if (!down) return false;
      if (e.code === 'Escape' && !$('settings').classList.contains('hidden')) { $('settings').classList.add('hidden'); return true; }
      if (e.code === 'Escape' && !$('help').classList.contains('hidden')) { $('help').classList.add('hidden'); return true; }
      return false;
    };
    this.setTab = 'mouse';
  },
  openSettings() { $('settings').classList.remove('hidden'); this.renderSettings(); },
  SETTINGS_UI: {
    mouse: [
      { k: 'sens', l: '鼠标灵敏度', t: 'range', min: 0.1, max: 8, step: 0.01, d: '采用经典 FPS 的弧度基准（每单位 0.022°），可直接套用你习惯的灵敏度数值' },
      { k: 'zoomSens', l: '开镜灵敏度倍率', t: 'range', min: 0.3, max: 2, step: 0.01 },
      { k: 'rawInput', l: '原始鼠标输入', t: 'bool', d: '绕过系统鼠标加速（等同 m_rawinput 1）' },
      { k: 'invertY', l: '反转 Y 轴', t: 'bool' },
      { k: 'moveMode', l: 'Shift 键行为', t: 'select', o: [['walk', '静步（Alt 无效）'], ['sprint', '冲刺（Alt 静步）']] },
      { k: 'slide', l: '滑铲', t: 'bool', d: '接近满速奔跑时按 C/Ctrl 触发滑铲' },
      { k: 'toggleCrouch', l: '切换式下蹲', t: 'bool' },
      { k: 'kbLock', l: '全屏 + 键盘锁定', t: 'bool', d: '开局自动全屏并接管 Ctrl+W / Ctrl+D 等浏览器快捷键，避免 Ctrl 下蹲时误触导致退出鼠标锁定。长按 Esc 退出全屏' },
      { k: 'knife', l: '近战武器', t: 'select', o: [['butterfly', '蝴蝶刀'], ['knife', '默认匕首']], d: '下次出生生效；按 F 检视' },
    ],
    cross: [
      { k: 'crossStyle', l: '准星类型', t: 'select', o: [['static', '静态（职业选手常用）'], ['dynamic', '动态（随散布扩张）']] },
      { k: 'crossSize', l: '长度', t: 'range', min: 0, max: 20, step: 0.5 },
      { k: 'crossGap', l: '间隙', t: 'range', min: -2, max: 20, step: 0.5 },
      { k: 'crossThick', l: '粗细', t: 'range', min: 1, max: 6, step: 0.5 },
      { k: 'crossColor', l: '颜色', t: 'color' },
      { k: 'crossDot', l: '中心点', t: 'bool' },
      { k: 'crossOutline', l: '黑色描边', t: 'bool' },
      { k: 'hitmarker', l: '命中提示', t: 'bool' },
    ],
    vm: [
      { k: 'vmFov', l: '持枪视野 viewmodel_fov', t: 'range', min: 54, max: 68, step: 1 },
      { k: 'vmX', l: '水平偏移 offset_x', t: 'range', min: -2.5, max: 2.5, step: 0.1 },
      { k: 'vmY', l: '前后偏移 offset_y', t: 'range', min: -2, max: 2, step: 0.1 },
      { k: 'vmZ', l: '垂直偏移 offset_z', t: 'range', min: -2, max: 2, step: 0.1 },
      { k: 'vmBob', l: '走动晃动', t: 'bool' },
    ],
    gfx: [
      { k: 'quality', l: '画质预设', t: 'select', o: [['low', '低（低端集显）'], ['medium', '中'], ['high', '高（MSAA + 4K 阴影）'], ['ultra', '极致（高分屏原生分辨率）']], d: '纹理分辨率在下次刷新页面时生效' },
      { k: 'renderScale', l: '渲染比例', t: 'range', min: 0.5, max: 1, step: 0.05 },
      { k: 'motionFx', l: '镜头特效（暗角/颗粒/色差/震屏）', t: 'bool' },
      { k: 'showFps', l: '显示帧率 / 速度', t: 'bool' },
    ],
    audio: [
      { k: 'volume', l: '主音量', t: 'range', min: 0, max: 1, step: 0.01 },
    ],
  },
  renderSettings() {
    const S = Settings.data, rows = this.SETTINGS_UI[this.setTab || 'mouse'];
    const body = $('setBody'); body.innerHTML = '';
    for (const r of rows) {
      const row = document.createElement('div'); row.className = 'srow';
      const lab = document.createElement('div'); lab.textContent = r.l; row.appendChild(lab);
      let input, val = document.createElement('div'); val.className = 'val';
      const v = S[r.k];
      if (r.t === 'range') {
        input = document.createElement('input'); input.type = 'range'; input.min = r.min; input.max = r.max; input.step = r.step; input.value = v;
        val.textContent = (+v).toFixed(r.step < 0.1 ? 2 : r.step < 1 ? 1 : 0);
        input.addEventListener('input', () => { S[r.k] = parseFloat(input.value); val.textContent = (+input.value).toFixed(r.step < 0.1 ? 2 : r.step < 1 ? 1 : 0); this.applySettings(); });
      } else if (r.t === 'bool') {
        input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!v;
        input.addEventListener('change', () => { S[r.k] = input.checked; this.applySettings(); });
      } else if (r.t === 'select') {
        input = document.createElement('select');
        Object.assign(input.style, { background: '#0d0f12', color: '#fff', border: '1px solid rgba(255,255,255,.15)', padding: '5px', borderRadius: '4px', fontFamily: 'inherit' });
        for (const [k, l] of r.o) { const o = document.createElement('option'); o.value = k; o.textContent = l; if (k === v) o.selected = true; input.appendChild(o); }
        input.addEventListener('change', () => { S[r.k] = input.value; if (r.k === 'quality') S.qualityChosen = true; this.applySettings(r.k === 'quality'); });
      } else if (r.t === 'color') {
        input = document.createElement('input'); input.type = 'color'; input.value = v;
        input.addEventListener('input', () => { S[r.k] = input.value; this.applySettings(); });
      }
      row.appendChild(input); row.appendChild(val);
      if (r.d) { const d = document.createElement('div'); d.className = 'd'; d.textContent = r.d; row.appendChild(d); }
      body.appendChild(row);
    }
    if (this.setTab === 'cross') {
      const pv = document.createElement('div'); pv.className = 'srow';
      pv.innerHTML = '<div>预览</div><div class="crossPreview"><canvas id="crossPv"></canvas></div><div></div>';
      body.appendChild(pv);
      this.drawCrossPreview();
    }
  },
  drawCrossPreview() {
    const c = $('crossPv'); if (!c) return;
    const S = Settings.data, s = S.crossSize, th = S.crossThick, gap = Math.max(0, S.crossGap);
    const R = Math.ceil(gap + s + 4); c.width = c.height = R * 2;
    const g = c.getContext('2d'); const h = th / 2;
    const rects = s > 0 ? [[R - h, R - gap - s, th, s], [R - h, R + gap, th, s], [R - gap - s, R - h, s, th], [R + gap, R - h, s, th]] : [];
    if (S.crossDot) rects.push([R - h, R - h, th, th]);
    if (S.crossOutline) { g.fillStyle = '#000'; for (const r of rects) g.fillRect(r[0] - 1, r[1] - 1, r[2] + 2, r[3] + 2); }
    g.fillStyle = S.crossColor; for (const r of rects) g.fillRect(...r);
  },
  applySettings(rebuild) {
    Settings.save();
    Sound.setVolume(Settings.data.volume);
    this.vm.setFov(Settings.data.vmFov, innerWidth / innerHeight);
    if (rebuild) this.buildComposer();
    else if (this._lastScale !== Settings.data.renderScale) { this._lastScale = Settings.data.renderScale; this.buildComposer(); }
    this.drawCrossPreview();
  },
};

window.addEventListener('error', (e) => {
  const f = $('fatal');
  if (f) { f.classList.remove('hidden'); f.textContent = '运行错误：' + (e.message || e) + '\n' + (e.filename || '') + ':' + (e.lineno || ''); }
});
Engine.boot().catch((e) => {
  console.error(e);
  const f = $('fatal'); f.classList.remove('hidden');
  f.textContent = '启动失败：' + (e && e.message ? e.message : e) + '\n\n请确认浏览器支持 WebGL（推荐 Edge / Chrome 最新版）。';
});
window.__engine = Engine;
