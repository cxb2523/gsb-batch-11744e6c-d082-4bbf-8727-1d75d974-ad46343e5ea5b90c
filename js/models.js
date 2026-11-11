'use strict';
// ======================================================================
//  models.js —— 程序化武器模型 + 角色模型（骨骼层级 + 解析 IK + 命中盒）
//  武器局部坐标：原点≈握把，枪口朝 -Z，+Y 向上
// ======================================================================
const Models = (() => {
  let MAT = null;
  function mats() {
    if (MAT) return MAT;
    const S = (o) => new THREE.MeshStandardMaterial(Object.assign({ envMapIntensity: 1.0 }, o));
    const woodTex = Tex.sets.beam.map;
    const GM = Tex.gun.metal, GP = Tex.gun.poly;
    const metal = { map: GM.map, roughnessMap: GM.roughnessMap, normalMap: GM.normalMap, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 1 };
    const polyT = { map: GP.map, roughnessMap: GP.roughnessMap, normalMap: GP.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 1 };
    MAT = {
      gun: S(Object.assign({ color: 0x2c2d30, metalness: 0.62, envMapIntensity: 0.45 }, metal)),
      gun2: S(Object.assign({ color: 0x38393c, metalness: 0.6, envMapIntensity: 0.45 }, metal)),
      dark: S(Object.assign({ color: 0x232426, metalness: 0.4, envMapIntensity: 0.45 }, metal)),
      poly: S(Object.assign({ color: 0x1c1d1e, metalness: 0.05, envMapIntensity: 0.6 }, polyT)),
      wood: S({ map: woodTex, color: 0xe08a4a, roughness: 0.42, metalness: 0 }),
      mag: S(Object.assign({ color: 0x2e2b28, metalness: 0.5, envMapIntensity: 0.45 }, metal)),
      green: S(Object.assign({ color: 0x46583a, metalness: 0.05, envMapIntensity: 0.6 }, polyT)),
      steel: S({ color: 0xc2c6ca, roughness: 0.16, metalness: 1.0 }),
      brass: S({ color: 0xd2a650, roughness: 0.28, metalness: 1.0 }),
      lens: S({ color: 0x050a12, roughness: 0.05, metalness: 0.4, emissive: 0x0a1a30, emissiveIntensity: 0.25 }),
      olive: S({ color: 0x4d5236, roughness: 0.7 }),
      clay: S({ color: 0xc9bd96, roughness: 0.85 }),
      screen: S({ color: 0x0b1a0b, emissive: 0x47ff6a, emissiveIntensity: 0.8, roughness: 0.3 }),
      red: S({ color: 0x8a1010, roughness: 0.5 }), blue: S({ color: 0x10308a, roughness: 0.5 }),
      heGreen: S({ color: 0x3b4a2a, roughness: 0.55, metalness: 0.2 }),
      grey: S({ color: 0x6e7175, roughness: 0.45, metalness: 0.5 }),
      smokeG: S({ color: 0x55605a, roughness: 0.5, metalness: 0.3 }),
      glove: S({ map: Tex.camo.dark.map, color: 0x8a8a8a, roughness: 0.85 }),
      sleeveCT: S({ map: Tex.camo.ct.map, normalMap: Tex.camo.ct.normalMap, color: 0x7d7f84, roughness: 1, envMapIntensity: 0.3 }),
      sleeveT: S({ map: Tex.camo.t.map, normalMap: Tex.camo.t.normalMap, color: 0x9c958a, roughness: 1, envMapIntensity: 0.3 }),
      skin: S({ color: 0xc69676, roughness: 0.7 }),
      bfBlade: S({ color: 0xd4d8dc, roughness: 0.13, metalness: 1.0, envMapIntensity: 1.1 }),
      bfHandle: S(Object.assign({ color: 0x2b2d31, metalness: 0.8, envMapIntensity: 0.6 }, metal, { roughness: 0.85 })),
      bfGroove: S({ color: 0x5c6066, roughness: 0.35, metalness: 1.0 }),
    };
    return MAT;
  }

  const gcache = {};
  function rbox(w, h, d, r = 0.004, s = 2) {
    const key = [w, h, d, r, s].join('_');
    if (gcache[key]) return gcache[key];
    const g = new THREE.BoxGeometry(w, h, d, s, s, s);
    r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
    const p = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
    const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      c.set(clamp(v.x, -hw, hw), clamp(v.y, -hh, hh), clamp(v.z, -hd, hd));
      v.sub(c); if (v.lengthSq() > 1e-12) v.normalize().multiplyScalar(r); v.add(c);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return (gcache[key] = g);
  }
  function cylZ(r1, r2, len, seg = 14) {
    const key = ['cz', r1, r2, len, seg].join('_');
    if (gcache[key]) return gcache[key];
    const g = new THREE.CylinderGeometry(r1, r2, len, seg); g.rotateX(Math.PI / 2);
    return (gcache[key] = g);
  }
  function cylY(r1, r2, len, seg = 12) {
    const key = ['cy', r1, r2, len, seg].join('_');
    if (gcache[key]) return gcache[key];
    return (gcache[key] = new THREE.CylinderGeometry(r1, r2, len, seg));
  }
  function capsule(r, len) {
    const key = ['cap', r, len].join('_');
    if (gcache[key]) return gcache[key];
    return (gcache[key] = new THREE.CapsuleGeometry(r, len, 4, 10));
  }
  function part(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    parent.add(m); return m;
  }
  const node = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };

  // ---------------- 武器 ----------------
  function weapon(id) {
    const M = mats();
    const g = new THREE.Group();
    const r = { group: g, muzzle: node(g, 0, 0, -0.5), eject: node(g, 0.03, 0.05, -0.1), mag: null, slide: null, bolt: null,
      grip: new THREE.Vector3(0, -0.045, 0.0), guard: new THREE.Vector3(0, 0, -0.3), id, pistol: false };
    const curvedMag = (parent, n, segLen, w, d, step, mat) => {
      let y = 0, z = 0, a = 0;
      for (let k = 0; k < n; k++) {
        const dy = -Math.cos(a), dz = -Math.sin(a);
        part(parent, rbox(w, segLen * 1.06, d, 0.004), mat, 0, y + dy * segLen / 2, z + dz * segLen / 2, a);
        y += dy * segLen; z += dz * segLen; a += step;
      }
    };
    if (id === 'ak47') {
      part(g, rbox(0.048, 0.07, 0.3, 0.006), M.gun, 0, 0.03, -0.12);
      part(g, rbox(0.044, 0.026, 0.27, 0.01), M.gun2, 0, 0.075, -0.115);
      part(g, rbox(0.03, 0.025, 0.04, 0.004), M.gun, 0, 0.075, -0.29);
      part(g, rbox(0.056, 0.056, 0.21, 0.012), M.wood, 0, 0.022, -0.38);
      part(g, rbox(0.042, 0.03, 0.17, 0.01), M.wood, 0, 0.073, -0.37);
      part(g, cylZ(0.009, 0.009, 0.08), M.gun, 0, 0.072, -0.495);
      part(g, cylZ(0.0105, 0.0105, 0.28), M.gun, 0, 0.035, -0.6);
      part(g, rbox(0.022, 0.05, 0.03, 0.004), M.gun, 0, 0.058, -0.69);
      part(g, rbox(0.004, 0.026, 0.004, 0.001), M.gun, 0, 0.095, -0.69);
      part(g, cylZ(0.014, 0.014, 0.045), M.gun2, 0, 0.035, -0.765);
      part(g, rbox(0.006, 0.006, 0.07, 0.002), M.gun, 0, -0.036, -0.06);
      part(g, rbox(0.005, 0.022, 0.007, 0.002), M.gun, 0, -0.02, -0.07);
      part(g, rbox(0.032, 0.1, 0.046, 0.009), M.wood, 0, -0.045, -0.005, 0.28);
      part(g, rbox(0.042, 0.068, 0.27, 0.012), M.wood, 0, -0.008, 0.16, 0.1);
      part(g, rbox(0.046, 0.1, 0.014, 0.005), M.dark, 0, -0.03, 0.295, 0.1);
      part(g, rbox(0.03, 0.012, 0.012, 0.003), M.gun2, 0.03, 0.062, -0.2);
      const mag = node(g, 0, -0.004, -0.17); curvedMag(mag, 5, 0.052, 0.028, 0.074, 0.13, M.mag); r.mag = mag;
      r.bolt = part(g, rbox(0.012, 0.012, 0.02, 0.003), M.gun2, 0.032, 0.062, -0.2);
      r.muzzle.position.set(0, 0.035, -0.79); r.eject.position.set(0.03, 0.065, -0.12);
      r.guard.set(0, 0.0, -0.37); r.magWell = new THREE.Vector3(0, -0.004, -0.17);
    } else if (id === 'm4a4') {
      part(g, rbox(0.05, 0.056, 0.25, 0.006), M.dark, 0, 0.045, -0.1);
      part(g, rbox(0.024, 0.012, 0.33, 0.003), M.gun, 0, 0.078, -0.16);
      for (let i = 0; i < 10; i++) part(g, rbox(0.026, 0.005, 0.012, 0.001), M.gun, 0, 0.085, -0.31 + i * 0.03);
      part(g, rbox(0.03, 0.03, 0.03, 0.004), M.dark, 0, 0.1, -0.005);
      part(g, rbox(0.02, 0.056, 0.024, 0.004), M.dark, 0, 0.085, -0.46);
      part(g, rbox(0.044, 0.04, 0.2, 0.006), M.dark, 0, 0.005, -0.09);
      part(g, rbox(0.034, 0.05, 0.075, 0.005), M.dark, 0, -0.025, -0.155);
      part(g, cylZ(0.03, 0.03, 0.22, 12), M.poly, 0, 0.04, -0.34);
      part(g, cylZ(0.035, 0.035, 0.016, 14), M.dark, 0, 0.04, -0.225);
      part(g, cylZ(0.009, 0.009, 0.18), M.gun, 0, 0.04, -0.54);
      part(g, cylZ(0.012, 0.012, 0.05, 8), M.gun, 0, 0.04, -0.645);
      part(g, cylZ(0.016, 0.016, 0.18), M.dark, 0, 0.032, 0.11);
      part(g, rbox(0.044, 0.078, 0.14, 0.012), M.poly, 0, 0.005, 0.2);
      part(g, rbox(0.03, 0.095, 0.042, 0.008), M.poly, 0, -0.045, 0.0, 0.3);
      part(g, rbox(0.006, 0.006, 0.07, 0.002), M.dark, 0, -0.03, -0.065);
      part(g, rbox(0.03, 0.01, 0.014, 0.003), M.gun, 0, 0.075, 0.03);
      const mag = node(g, 0, -0.045, -0.155); curvedMag(mag, 4, 0.045, 0.03, 0.068, 0.05, M.dark); r.mag = mag;
      r.bolt = part(g, rbox(0.014, 0.01, 0.02, 0.003), M.gun, 0.028, 0.055, -0.08);
      r.muzzle.position.set(0, 0.04, -0.68); r.eject.position.set(0.03, 0.05, -0.08);
      r.guard.set(0, 0.005, -0.33); r.magWell = new THREE.Vector3(0, -0.045, -0.155);
    } else if (id === 'awp') {
      part(g, rbox(0.06, 0.062, 0.36, 0.014), M.green, 0, 0.015, -0.33);
      part(g, rbox(0.046, 0.052, 0.24, 0.008), M.gun, 0, 0.05, -0.06);
      part(g, rbox(0.052, 0.13, 0.32, 0.016), M.green, 0, -0.012, 0.2);
      part(g, rbox(0.036, 0.1, 0.05, 0.01), M.green, 0, -0.05, 0.02, 0.3);
      part(g, rbox(0.054, 0.14, 0.022, 0.006), M.poly, 0, -0.012, 0.37);
      part(g, cylZ(0.0128, 0.0115, 0.52), M.gun, 0, 0.05, -0.69);
      part(g, cylZ(0.017, 0.017, 0.065, 10), M.gun2, 0, 0.05, -0.97);
      part(g, cylZ(0.017, 0.017, 0.3), M.poly, 0, 0.118, -0.07);
      part(g, cylZ(0.031, 0.021, 0.075), M.poly, 0, 0.118, -0.255);
      part(g, cylZ(0.022, 0.027, 0.06), M.poly, 0, 0.118, 0.11);
      part(g, cylY(0.011, 0.011, 0.03), M.poly, 0, 0.142, -0.07);
      part(g, cylY(0.011, 0.011, 0.03), M.poly, 0.024, 0.118, -0.07, 0, 0, Math.PI / 2);
      part(g, rbox(0.02, 0.045, 0.02, 0.004), M.gun, 0, 0.085, -0.15);
      part(g, rbox(0.02, 0.045, 0.02, 0.004), M.gun, 0, 0.085, 0.02);
      const lens1 = new THREE.Mesh(new THREE.CircleGeometry(0.029, 20), M.lens); lens1.position.set(0, 0.118, -0.293); lens1.rotation.y = Math.PI; g.add(lens1);
      const lens2 = new THREE.Mesh(new THREE.CircleGeometry(0.025, 20), M.lens); lens2.position.set(0, 0.118, 0.141); g.add(lens2);
      const amag = node(g, 0, -0.02, -0.08); part(amag, rbox(0.04, 0.05, 0.08, 0.006), M.dark, 0, 0, 0);
      const bolt = node(g, 0.024, 0.055, 0.03);
      part(bolt, cylZ(0.005, 0.005, 0.05, 8), M.gun, 0.022, -0.012, 0, 0, Math.PI / 2 - 0.4, 0);
      part(bolt, new THREE.SphereGeometry(0.012, 10, 8), M.gun2, 0.044, -0.026, 0);
      r.bolt = bolt;
      r.mag = amag;
      r.muzzle.position.set(0, 0.05, -1.0); r.eject.position.set(0.03, 0.06, -0.04);
      r.guard.set(0, -0.012, -0.3); r.grip.set(0, -0.05, 0.02); r.magWell = new THREE.Vector3(0, -0.02, -0.08);
      r.scope = true;
    } else if (id === 'deagle' || id === 'usp' || id === 'glock') {
      r.pistol = true;
      const slide = node(g, 0, 0, 0);
      if (id === 'deagle') {
        part(slide, rbox(0.03, 0.04, 0.26, 0.004), M.gun2, 0, 0.055, -0.1);
        for (let i = 0; i < 6; i++) part(slide, rbox(0.031, 0.03, 0.003, 0.001), M.dark, 0, 0.055, 0.0 + i * 0.006);
        part(g, rbox(0.028, 0.026, 0.2, 0.004), M.gun, 0, 0.022, -0.13);
        part(g, rbox(0.026, 0.02, 0.07, 0.004), M.gun, 0, 0.0, -0.04);
        part(g, rbox(0.006, 0.006, 0.06, 0.002), M.gun, 0, -0.03, -0.06);
        part(g, rbox(0.034, 0.12, 0.056, 0.01), M.poly, 0, -0.055, 0.03, 0.22);
        part(g, rbox(0.01, 0.02, 0.015, 0.002), M.gun, 0, 0.075, 0.035);
        part(slide, rbox(0.004, 0.012, 0.006, 0.001), M.gun, 0, 0.081, -0.22);
        r.muzzle.position.set(0, 0.055, -0.235);
      } else if (id === 'usp') {
        part(slide, rbox(0.027, 0.033, 0.19, 0.004), M.dark, 0, 0.05, -0.07);
        part(g, rbox(0.026, 0.02, 0.16, 0.004), M.poly, 0, 0.025, -0.07);
        part(g, cylZ(0.016, 0.016, 0.17, 16), M.gun2, 0, 0.05, -0.25);
        part(g, rbox(0.03, 0.105, 0.05, 0.009), M.poly, 0, -0.045, 0.02, 0.22);
        part(g, rbox(0.006, 0.006, 0.055, 0.002), M.poly, 0, -0.028, -0.05);
        r.muzzle.position.set(0, 0.05, -0.34);
      } else {
        part(slide, rbox(0.026, 0.032, 0.185, 0.004), M.dark, 0, 0.05, -0.07);
        part(g, rbox(0.025, 0.02, 0.16, 0.004), M.poly, 0, 0.025, -0.07);
        part(g, rbox(0.03, 0.105, 0.05, 0.009), M.poly, 0, -0.045, 0.02, 0.25);
        part(g, rbox(0.006, 0.006, 0.055, 0.002), M.poly, 0, -0.028, -0.05);
        r.muzzle.position.set(0, 0.05, -0.17);
      }
      r.slide = slide;
      const mag = node(g, 0, -0.1, 0.035); part(mag, rbox(0.026, 0.02, 0.045, 0.004), M.poly, 0, 0, 0, 0.22); r.mag = mag;
      r.eject.position.set(0.02, 0.065, -0.05);
      r.grip.set(0, -0.05, 0.03); r.guard.set(-0.012, -0.065, 0.03); r.magWell = new THREE.Vector3(0, -0.1, 0.035);
    } else if (id === 'mp9') {
      part(g, rbox(0.04, 0.06, 0.24, 0.008), M.poly, 0, 0.03, -0.08);
      part(g, rbox(0.022, 0.012, 0.2, 0.003), M.dark, 0, 0.066, -0.09);
      part(g, cylZ(0.01, 0.01, 0.06), M.gun, 0, 0.035, -0.23);
      part(g, cylZ(0.013, 0.013, 0.025), M.gun, 0, 0.035, -0.27);
      part(g, rbox(0.026, 0.075, 0.032, 0.008), M.poly, 0, -0.03, -0.17, 0.12);
      part(g, rbox(0.032, 0.11, 0.045, 0.008), M.poly, 0, -0.05, 0.0, 0.18);
      part(g, rbox(0.012, 0.02, 0.2, 0.004), M.dark, 0.026, 0.01, 0.06);
      part(g, rbox(0.006, 0.006, 0.05, 0.002), M.dark, 0, -0.012, -0.06);
      const mag = node(g, 0, -0.105, 0.01); part(mag, rbox(0.026, 0.07, 0.038, 0.004), M.dark, 0, -0.02, 0, 0.18); r.mag = mag;
      r.muzzle.position.set(0, 0.035, -0.29); r.eject.position.set(0.025, 0.05, -0.06);
      r.guard.set(0, -0.055, -0.168); r.magWell = new THREE.Vector3(0, -0.105, 0.01);
    } else if (id === 'knife') {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0); sh.lineTo(0.17, 0.004); sh.quadraticCurveTo(0.2, 0.0, 0.215, -0.012);
      sh.quadraticCurveTo(0.16, -0.03, 0.06, -0.03); sh.lineTo(0, -0.026); sh.lineTo(0, 0);
      const bg = new THREE.ExtrudeGeometry(sh, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0015, bevelSegments: 1, curveSegments: 8 });
      bg.translate(0, 0.012, -0.0015); bg.rotateY(Math.PI / 2);
      part(g, bg, M.steel, 0, 0, -0.06);
      part(g, rbox(0.026, 0.05, 0.01, 0.003), M.gun, 0, 0.0, -0.058);
      part(g, rbox(0.022, 0.03, 0.11, 0.008), M.poly, 0, -0.002, 0.0);
      part(g, rbox(0.024, 0.032, 0.012, 0.004), M.gun, 0, -0.002, 0.06);
      r.grip.set(0, -0.002, 0.0); r.muzzle.position.set(0, 0.0, -0.27);
    } else if (id === 'butterfly') {
      // 蝴蝶刀：g = 安全柄坐标系（手握），piv = 安全柄销轴；blade 绕销轴转 α，bite(咬柄) 绕刀根第二销轴转 β
      // 打开 α=β=0；合拢 α=β=π（刀刃折回两柄之间）
      const PIN = 0.0025;
      const piv = node(g, 0, PIN, -0.062);
      const blade = node(piv, 0, 0, 0);
      const bite = node(blade, 0, -2 * PIN, 0);
      // 刀刃侧面轮廓（形状 x = 向前距离，y = 高度），刀身中心在 y=-PIN
      const yc = -PIN, bs = new THREE.Shape();
      bs.moveTo(-0.007, yc - 0.0105); bs.lineTo(-0.007, yc + 0.0105); bs.lineTo(0.014, yc + 0.0105);
      bs.lineTo(0.016, yc + 0.0092); bs.lineTo(0.082, yc + 0.0092);                       // 刀背
      bs.quadraticCurveTo(0.1, yc + 0.0085, 0.121, yc + 0.0005);                           // 假刃 → 刀尖
      bs.quadraticCurveTo(0.104, yc - 0.0098, 0.07, yc - 0.0102);                          // 刃口弧线
      bs.lineTo(0.024, yc - 0.0102);
      bs.quadraticCurveTo(0.019, yc - 0.0102, 0.018, yc - 0.0068);                         // 指凹(choil)
      bs.quadraticCurveTo(0.017, yc - 0.0045, 0.014, yc - 0.0045);
      bs.lineTo(0.012, yc - 0.0105); bs.lineTo(-0.007, yc - 0.0105);
      const bg = new THREE.ExtrudeGeometry(bs, { depth: 0.0016, bevelEnabled: true, bevelThickness: 0.0007, bevelSize: 0.0009, bevelSegments: 2, curveSegments: 10 });
      bg.translate(0, 0, -0.0008); bg.rotateY(Math.PI / 2);
      part(blade, bg, M.bfBlade, 0, 0, 0);
      for (const sx of [-1, 1]) part(blade, rbox(0.0006, 0.0022, 0.052, 0.0003), M.bfGroove, sx * 0.0013, yc + 0.0045, -0.052);   // 血槽
      // 镂空刀柄（两片）
      const hs = new THREE.Shape(), HL = 0.128, HH = 0.0118;
      hs.moveTo(-0.008, -HH); hs.lineTo(HL - 0.004, -HH); hs.quadraticCurveTo(HL + 0.003, -HH, HL + 0.003, -HH + 0.007);
      hs.lineTo(HL + 0.003, HH - 0.007); hs.quadraticCurveTo(HL + 0.003, HH, HL - 0.004, HH); hs.lineTo(-0.008, HH);
      hs.quadraticCurveTo(-0.014, HH, -0.014, HH - 0.006); hs.lineTo(-0.014, -HH + 0.006); hs.quadraticCurveTo(-0.014, -HH, -0.008, -HH);
      for (const [a0, a1] of [[0.012, 0.042], [0.05, 0.08], [0.088, 0.112]]) {
        const h = new THREE.Path(), r = 0.0045;
        h.moveTo(a0 + r, -r); h.lineTo(a1 - r, -r); h.quadraticCurveTo(a1, -r, a1, 0); h.quadraticCurveTo(a1, r, a1 - r, r);
        h.lineTo(a0 + r, r); h.quadraticCurveTo(a0, r, a0, 0); h.quadraticCurveTo(a0, -r, a0 + r, -r);
        hs.holes.push(h);
      }
      const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.0034, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 2, curveSegments: 6 });
      hg.translate(0, 0, -0.0017); hg.rotateY(-Math.PI / 2);   // 形状 x → +Z（向后延伸）
      // 安全柄（静止，手握）在 +X 侧；咬柄在 -X 侧
      part(g, hg, M.bfHandle, 0.0052, 0, -0.062);
      part(bite, hg, M.bfHandle, -0.0052, PIN, 0);
      // 销钉 / 尾部螺丝 / 锁扣
      const pin = cylY(0.0028, 0.0028, 0.0165, 10);
      part(blade, pin, M.steel, 0, 0, 0, 0, 0, Math.PI / 2);
      part(blade, pin, M.steel, 0, -2 * PIN, 0, 0, 0, Math.PI / 2);
      part(g, cylY(0.0022, 0.0022, 0.011, 8), M.steel, 0.0052, 0, -0.062 + HL - 0.004, 0, 0, Math.PI / 2);
      part(bite, cylY(0.0022, 0.0022, 0.011, 8), M.steel, -0.0052, PIN, HL - 0.004, 0, 0, Math.PI / 2);
      part(bite, rbox(0.0045, 0.004, 0.03, 0.0012), M.steel, -0.0052, PIN + HH - 0.002, HL - 0.012, 0.12);
      r.bfly = { piv, blade, bite };
      r.grip.set(0, -0.002, 0.012); r.muzzle.position.set(0, 0, -0.19);
    } else if (id === 'he' || id === 'flash' || id === 'smoke') {
      if (id === 'he') {
        const b = part(g, new THREE.SphereGeometry(0.032, 16, 12), M.heGreen, 0, 0, 0); b.scale.set(1, 1.18, 1);
      } else {
        part(g, cylY(0.026, 0.026, 0.1, 16), id === 'flash' ? M.grey : M.smokeG, 0, 0, 0);
        part(g, cylY(0.0265, 0.0265, 0.012, 16), M.dark, 0, id === 'flash' ? 0.025 : -0.02, 0);
      }
      part(g, cylY(0.011, 0.011, 0.025, 10), M.gun2, 0, 0.05, 0);
      part(g, rbox(0.012, 0.075, 0.006, 0.002), M.gun2, 0.015, 0.02, 0, 0, 0, -0.15);
      const pin = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0022, 6, 16), M.steel); pin.position.set(-0.018, 0.058, 0); pin.rotation.y = Math.PI / 2; g.add(pin);
      r.pin = pin; r.grip.set(0, 0, 0);
    } else if (id === 'c4') {
      part(g, rbox(0.18, 0.05, 0.12, 0.006), M.olive, 0, 0, 0);
      for (let i = 0; i < 3; i++) part(g, rbox(0.055, 0.035, 0.11, 0.008), M.clay, -0.06 + i * 0.06, 0.04, 0);
      part(g, rbox(0.07, 0.022, 0.075, 0.004), M.dark, 0.0, 0.07, 0.0);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) part(g, rbox(0.012, 0.006, 0.01, 0.002), M.grey, -0.02 + i * 0.02, 0.083, -0.012 + j * 0.014);
      part(g, rbox(0.04, 0.004, 0.018, 0.001), M.screen, 0, 0.083, -0.03);
      part(g, cylZ(0.003, 0.003, 0.12, 6), M.red, 0.07, 0.035, 0);
      part(g, cylZ(0.003, 0.003, 0.12, 6), M.blue, 0.075, 0.03, 0);
      r.grip.set(0, -0.03, 0.04);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    return r;
  }

  // 合并为每种材质一个网格（第三人称/掉落物）
  function mergeGeos(items) {
    let vc = 0, ic = 0;
    for (const it of items) { vc += it.geo.attributes.position.count; ic += it.geo.index ? it.geo.index.count : it.geo.attributes.position.count; }
    const pos = new Float32Array(vc * 3), nrm = new Float32Array(vc * 3), uv = new Float32Array(vc * 2);
    const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
    let vo = 0, io = 0; const v = new THREE.Vector3(), nm = new THREE.Matrix3();
    for (const it of items) {
      const g = it.geo, p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
      nm.getNormalMatrix(it.matrix);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(it.matrix); pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
        v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nrm[(vo + i) * 3] = v.x; nrm[(vo + i) * 3 + 1] = v.y; nrm[(vo + i) * 3 + 2] = v.z;
        if (u) { uv[(vo + i) * 2] = u.getX(i); uv[(vo + i) * 2 + 1] = u.getY(i); }
      }
      if (g.index) for (let k = 0; k < g.index.count; k++) idx[io++] = g.index.getX(k) + vo;
      else for (let k = 0; k < p.count; k++) idx[io++] = k + vo;
      vo += p.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  }
  function mergeChildren(root, relativeTo) {
    relativeTo.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(relativeTo.matrixWorld).invert();
    const byMat = new Map();
    const meshes = [];
    root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    for (const m of meshes) {
      const mat = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
      if (!byMat.has(m.material)) byMat.set(m.material, []);
      byMat.get(m.material).push({ geo: m.geometry, matrix: mat });
    }
    const out = [];
    for (const [mat, items] of byMat) { const mesh = new THREE.Mesh(mergeGeos(items), mat); mesh.castShadow = true; out.push(mesh); }
    return out;
  }
  const tpCache = {};
  function thirdPerson(id) {
    if (!tpCache[id]) {
      const w = weapon(id);
      const holder = new THREE.Group(); holder.add(w.group);
      const merged = mergeChildren(w.group, holder);
      tpCache[id] = { meshes: merged, muzzle: w.muzzle.position.clone(), grip: w.grip.clone(), guard: w.guard.clone(), pistol: w.pistol };
    }
    const c = tpCache[id];
    const g = new THREE.Group();
    for (const m of c.meshes) { const mm = new THREE.Mesh(m.geometry, m.material); mm.castShadow = true; g.add(mm); }
    const muzzle = node(g, c.muzzle.x, c.muzzle.y, c.muzzle.z);
    return { group: g, muzzle, grip: c.grip, guard: c.guard, pistol: c.pistol, id };
  }

  // ---------------- 角色（刚性蒙皮 SkinnedMesh：每个角色 2 次绘制调用） ----------------
  const charMatCache = {};
  function charMats(team) {
    if (charMatCache[team]) return charMatCache[team];
    const camo = team === 'CT' ? Tex.camo.ct : Tex.camo.t;
    // 两队配色刻意拉开：CT 冷色深蓝灰 + 黑色装具 + 头盔；T 暖色沙土 + 棕色胸挂 + 暗红头巾
    const r = {
      cloth: new THREE.MeshStandardMaterial({ map: camo.map, normalMap: camo.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), vertexColors: true, roughness: 0.95, envMapIntensity: 0.55 }),
      plain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0.04, envMapIntensity: 0.55 }),
      col: team === 'CT'
        ? { shirt: [0.92, 0.95, 1.05], pants: [0.82, 0.86, 0.95], vest: [0.075, 0.08, 0.088], pouch: [0.1, 0.105, 0.115], strap: [0.06, 0.065, 0.07],
            skin: [0.5, 0.36, 0.28], helmet: [0.15, 0.17, 0.19], lens: [0.025, 0.03, 0.035], headset: [0.1, 0.11, 0.1], boots: [0.06, 0.06, 0.065],
            sole: [0.03, 0.03, 0.03], glove: [0.07, 0.07, 0.075], knee: [0.08, 0.085, 0.09], band: [0.1, 0.32, 0.9], belt: [0.05, 0.05, 0.055], hair: [0.12, 0.09, 0.07] }
        : { shirt: [1.0, 0.95, 0.85], pants: [0.78, 0.72, 0.62], vest: [0.26, 0.21, 0.14], pouch: [0.3, 0.25, 0.17], strap: [0.2, 0.16, 0.11],
            skin: [0.42, 0.29, 0.2], wrap: [0.36, 0.08, 0.06], wrap2: [0.28, 0.06, 0.05], lens: [0.04, 0.035, 0.03], goggle: [0.33, 0.28, 0.2], boots: [0.27, 0.2, 0.13],
            sole: [0.08, 0.06, 0.05], glove: [0.42, 0.29, 0.2], band: [0.9, 0.38, 0.06], belt: [0.18, 0.14, 0.1], pack: [0.32, 0.28, 0.2] },
    };
    return (charMatCache[team] = r);
  }

  // 放样体：沿 Y 轴的一串（超）椭圆截面 → 平滑的躯干/四肢/头部
  // ring = [y, rx, rz, cx=0, cz=0, p=2]；p>2 更方，p<2 更尖
  function loft(rings, seg = 14) {
    // ≥3 个截面的放样体两端自动加圆顶（关节处不露平切面）
    if (rings.length >= 3) {
      const r0 = rings[0], r1 = rings[rings.length - 1];
      const d0 = Math.sign(r0[0] - rings[1][0]), d1 = Math.sign(r1[0] - rings[rings.length - 2][0]);
      const m0 = Math.min(r0[1], r0[2]), m1 = Math.min(r1[1], r1[2]);
      rings = [[r0[0] + d0 * m0 * 0.55, r0[1] * 0.55, r0[2] * 0.55, r0[3], r0[4], r0[5]], [r0[0] + d0 * m0 * 0.3, r0[1] * 0.88, r0[2] * 0.88, r0[3], r0[4], r0[5]], ...rings,
        [r1[0] + d1 * m1 * 0.3, r1[1] * 0.88, r1[2] * 0.88, r1[3], r1[4], r1[5]], [r1[0] + d1 * m1 * 0.55, r1[1] * 0.55, r1[2] * 0.55, r1[3], r1[4], r1[5]]];
    }
    const nR = rings.length, pos = [], uv = [], idx = [];
    let circ = 0; for (const r of rings) circ += Math.PI * (r[1] + r[2]); circ /= nR;
    for (let i = 0; i < nR; i++) {
      const [y, rx, rz, cx = 0, cz = 0, p = 2] = rings[i];
      for (let j = 0; j <= seg; j++) {
        const a = j / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        const e = 2 / p;
        pos.push(cx + rx * Math.sign(c) * Math.pow(Math.abs(c), e), y, cz + rz * Math.sign(s) * Math.pow(Math.abs(s), e));
        uv.push(j / seg * circ / 0.45, y / 0.45);
      }
    }
    for (let i = 0; i < nR - 1; i++) for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);   // 外表面逆时针
    }
    // 两端封口：独立顶点 + 平面投影 UV（共用侧面 UV 会使 v 方向退化，法线贴图的切线空间出 NaN → 发白）
    for (const [ri, flip] of [[0, true], [nR - 1, false]]) {
      const [y, , , cx = 0, cz = 0] = rings[ri];
      const ci = pos.length / 3; pos.push(cx, y, cz); uv.push(cx / 0.45, cz / 0.45);
      for (let j = 0; j <= seg; j++) { const k = (ri * (seg + 1) + j) * 3; pos.push(pos[k], pos[k + 1], pos[k + 2]); uv.push(pos[k] / 0.45, pos[k + 2] / 0.45); }
      for (let j = 0; j < seg; j++) { const a = ci + 1 + j; if (flip) idx.push(ci, a, a + 1); else idx.push(ci, a + 1, a); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  const sphere = (r, ws = 14, hs = 10, t0 = 0, t1 = Math.PI) => new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, t0, t1);

  const SHADOW_ONLY = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const skinGeoCache = {};
  function buildSkinned(items) {
    let vc = 0, ic = 0;
    for (const it of items) { vc += it.geo.attributes.position.count; ic += it.geo.index ? it.geo.index.count : it.geo.attributes.position.count; }
    const pos = new Float32Array(vc * 3), nrm = new Float32Array(vc * 3), uv = new Float32Array(vc * 2), col = new Float32Array(vc * 3);
    const si = new Uint16Array(vc * 4), sw = new Float32Array(vc * 4);
    const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
    let vo = 0, io = 0; const v = new THREE.Vector3(), nm = new THREE.Matrix3();
    for (const it of items) {
      const g = it.geo, p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
      nm.getNormalMatrix(it.matrix);
      for (let i = 0; i < p.count; i++) {
        const k = vo + i;
        v.fromBufferAttribute(p, i).applyMatrix4(it.matrix); pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z;
        v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nrm[k * 3] = v.x; nrm[k * 3 + 1] = v.y; nrm[k * 3 + 2] = v.z;
        if (u) { uv[k * 2] = u.getX(i); uv[k * 2 + 1] = u.getY(i); }
        col[k * 3] = it.color[0]; col[k * 3 + 1] = it.color[1]; col[k * 3 + 2] = it.color[2];
        si[k * 4] = it.bi; sw[k * 4] = 1;
      }
      if (g.index) for (let q = 0; q < g.index.count; q++) idx[io++] = g.index.getX(q) + vo;
      else for (let q = 0; q < p.count; q++) idx[io++] = q + vo;
      vo += p.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  }

  // 角色几何（绑定姿态，骨骼局部坐标；角色面朝 -Z）
  function buildBody(H, team, add) {
    const C = charMats(team).col, CT = team === 'CT';
    const S = 'cloth', P = 'plain';
    // ---- 骨盆 / 腰带 ----
    const pw = CT ? 1 : 1.04;
    add(H.hips, loft([[-0.15, 0.1, 0.08], [-0.1, 0.15 * pw, 0.1], [-0.04, 0.17 * pw, 0.108], [0.03, 0.168 * pw, 0.106], [0.08, 0.158, 0.1]], 16), S, C.pants, 0, 0, 0);
    add(H.hips, loft([[0.02, 0.172 * pw, 0.111, 0, 0, 2.4], [0.065, 0.17 * pw, 0.11, 0, 0, 2.4]], 18), P, C.belt, 0, 0, 0);
    add(H.hips, rbox(0.05, 0.04, 0.012, 0.004), P, CT ? [0.25, 0.25, 0.26] : [0.45, 0.38, 0.2], 0, 0.043, -0.112);
    for (const sx of [-1, 1]) add(H.hips, rbox(0.05, 0.07, 0.07, 0.012), P, C.pouch, sx * 0.165, 0.0, 0.03);
    // ---- 躯干 ----
    const tw = CT ? 1 : 1.03;
    add(H.spine, loft([
      [-0.02, 0.158, 0.1], [0.08, 0.15 * tw, 0.098], [0.17, 0.162 * tw, 0.106, 0, -0.004], [0.27, 0.182 * tw, 0.116, 0, -0.008],
      [0.35, 0.192, 0.117, 0, -0.006], [0.41, 0.186, 0.108], [0.455, 0.15, 0.092], [0.485, 0.085, 0.07], [0.5, 0.06, 0.058]], 18), S, C.shirt, 0, 0, 0);
    if (CT) {
      // 防弹插板背心 + 腰封 + 肩带 + 弹匣包 + 无线电
      add(H.spine, rbox(0.31, 0.3, 0.05, 0.02), P, C.vest, 0, 0.28, -0.118);
      add(H.spine, rbox(0.31, 0.32, 0.045, 0.02), P, C.vest, 0, 0.29, 0.115);
      add(H.spine, loft([[0.1, 0.176, 0.12, 0, 0, 2.6], [0.24, 0.19, 0.125, 0, 0, 2.6]], 18), P, C.vest, 0, 0, 0);
      for (const sx of [-1, 1]) add(H.spine, rbox(0.075, 0.03, 0.26, 0.012), P, C.strap, sx * 0.105, 0.445, 0);
      for (let i = 0; i < 3; i++) {
        add(H.spine, rbox(0.075, 0.11, 0.042, 0.01), P, C.pouch, -0.085 + i * 0.085, 0.2, -0.158);
        add(H.spine, rbox(0.078, 0.03, 0.046, 0.008), P, C.strap, -0.085 + i * 0.085, 0.255, -0.16);
      }
      add(H.spine, rbox(0.2, 0.08, 0.03, 0.01), P, C.pouch, 0, 0.36, -0.152);
      add(H.spine, rbox(0.06, 0.045, 0.006, 0.003), P, C.band, -0.06, 0.37, -0.168);          // 胸前臂章
      add(H.spine, rbox(0.05, 0.14, 0.04, 0.01), P, C.pouch, 0.16, 0.25, 0.06);                // 无线电
      add(H.spine, cylY(0.004, 0.004, 0.16, 5), P, C.strap, 0.17, 0.39, 0.07);                  // 天线
      add(H.spine, rbox(0.22, 0.16, 0.05, 0.015), P, C.pouch, 0, 0.27, 0.16);                  // 背部水袋
    } else {
      // 胸挂（AK 长弹匣包）+ 交叉背带 + 小背包
      add(H.spine, rbox(0.32, 0.15, 0.05, 0.015), P, C.vest, 0, 0.19, -0.122);
      for (let i = 0; i < 4; i++) {
        add(H.spine, rbox(0.06, 0.13, 0.045, 0.01), P, C.pouch, -0.105 + i * 0.07, 0.19, -0.158);
        add(H.spine, rbox(0.062, 0.025, 0.048, 0.006), P, C.strap, -0.105 + i * 0.07, 0.25, -0.16);
      }
      for (const sx of [-1, 1]) {
        add(H.spine, rbox(0.05, 0.02, 0.25, 0.008), P, C.strap, sx * 0.1, 0.45, 0);
        add(H.spine, rbox(0.045, 0.34, 0.018, 0.006), P, C.strap, sx * 0.07, 0.3, 0.118, 0, 1, 1, 1, sx * 0.45);
      }
      add(H.spine, rbox(0.24, 0.27, 0.09, 0.03), P, C.pack, 0, 0.27, 0.165);
      add(H.spine, rbox(0.2, 0.06, 0.07, 0.02), P, C.strap, 0, 0.13, 0.16);                    // 睡袋卷
    }
    // ---- 脖子 ----
    if (CT) {
      add(H.neck, loft([[-0.03, 0.058, 0.062], [0.04, 0.052, 0.056], [0.09, 0.05, 0.054]], 12), P, C.skin, 0, 0, 0);
      add(H.neck, loft([[-0.045, 0.085, 0.082], [-0.005, 0.072, 0.072], [0.045, 0.062, 0.066]], 14), P, C.strap, 0, 0, 0);   // 战术领 / 护颈
    }
    else add(H.neck, loft([[-0.04, 0.09, 0.085], [0.0, 0.078, 0.076], [0.05, 0.066, 0.07], [0.09, 0.058, 0.062]], 14), P, C.wrap, 0, 0, 0);   // 围巾
    // ---- 头 ----
    const skin = C.skin;
    add(H.head, sphere(0.1, 18, 14), P, CT ? C.hair : C.wrap, 0, 0.118, 0.004, 0, 0.8, 0.98, 1.0);            // 颅骨
    add(H.head, loft([[-0.005, 0.03, 0.03, 0, -0.045], [0.02, 0.055, 0.055, 0, -0.03], [0.06, 0.07, 0.078, 0, -0.012], [0.1, 0.077, 0.088, 0, 0]], 14), P, skin, 0, 0, 0); // 下颌
    add(H.head, rbox(0.12, 0.05, 0.03, 0.012), P, skin, 0, 0.115, -0.08);                       // 眉眼区
    add(H.head, rbox(0.024, 0.04, 0.026, 0.009), P, skin, 0, 0.083, -0.095, -0.28);             // 鼻
    add(H.head, rbox(0.118, 0.016, 0.02, 0.006), P, [skin[0] * 0.7, skin[1] * 0.7, skin[2] * 0.7], 0, 0.128, -0.093); // 眉骨
    for (const sx of [-1, 1]) {
      add(H.head, sphere(0.012, 8, 6), P, [0.05, 0.04, 0.035], sx * 0.032, 0.11, -0.089);      // 眼
      add(H.head, sphere(0.024, 8, 6), P, skin, sx * 0.079, 0.1, 0.008, 0, 0.45, 1, 0.7);       // 耳
    }
    if (CT) {
      // FAST 头盔 + 侧导轨 + 夜视支架 + 降噪耳机 + 防弹眼镜
      add(H.head, sphere(0.119, 20, 10, 0, Math.PI * 0.54), P, C.helmet, 0, 0.12, 0.006, 0, 0.94, 0.95, 1.04);
      add(H.head, loft([[0.11, 0.113, 0.126, 0, 0.006], [0.122, 0.113, 0.126, 0, 0.006]], 20), P, C.lens, 0, 0, 0);
      for (const sx of [-1, 1]) {
        add(H.head, rbox(0.012, 0.028, 0.11, 0.004), P, C.lens, sx * 0.112, 0.15, 0.0);
        add(H.head, cylY(0.034, 0.034, 0.028, 14), P, C.headset, sx * 0.088, 0.1, 0.006, 0, 1, 1, 1, Math.PI / 2);
      }
      add(H.head, rbox(0.045, 0.035, 0.022, 0.006), P, C.lens, 0, 0.2, -0.118);                 // 夜视支架
      add(H.head, rbox(0.135, 0.032, 0.022, 0.01), P, C.lens, 0, 0.11, -0.1);                   // 眼镜
    } else {
      // 头巾包裹 + 蒙面，只露眼部；额头挂护目镜
      add(H.head, sphere(0.107, 18, 12, 0, Math.PI * 0.62), P, C.wrap, 0, 0.115, 0.006, 0, 0.84, 1.0, 1.0);
      add(H.head, loft([[-0.012, 0.036, 0.036, 0, -0.045], [0.02, 0.062, 0.062, 0, -0.03], [0.06, 0.078, 0.085, 0, -0.012], [0.098, 0.085, 0.094, 0, 0]], 14), P, C.wrap2, 0, 0, 0);
      add(H.head, rbox(0.06, 0.1, 0.02, 0.01), P, C.wrap2, 0, 0.07, 0.095, 0.3);                // 头巾尾
      add(H.head, rbox(0.17, 0.022, 0.03, 0.01), P, C.goggle, 0, 0.165, -0.085, -0.25);
      for (const sx of [-1, 1]) add(H.head, rbox(0.05, 0.03, 0.02, 0.01), P, C.lens, sx * 0.03, 0.168, -0.098, -0.25);
    }
    // ---- 手臂 ----
    for (const [sh, el, sx] of [[H.shL, H.elL, -1], [H.shR, H.elR, 1]]) {
      add(sh, loft([[0.045, 0.045, 0.045], [0.02, 0.064, 0.062], [-0.05, 0.06, 0.058], [-0.15, 0.05, 0.05], [-0.25, 0.046, 0.046], [-0.3, 0.044, 0.044]], 12), S, C.shirt, 0, 0, 0);
      add(sh, loft([[-0.075, 0.062, 0.06], [-0.115, 0.06, 0.058]], 12), P, C.band, 0, 0, 0);   // 阵营臂章
      if (CT) {
        add(sh, rbox(0.012, 0.06, 0.07, 0.004), P, [0.18, 0.19, 0.2], sx * 0.06, -0.03, 0);
        add(el, loft([[0.03, 0.047, 0.047], [-0.06, 0.048, 0.046], [-0.16, 0.04, 0.036], [-0.225, 0.035, 0.03]], 12), S, C.shirt, 0, 0, 0);
        add(el, loft([[-0.2, 0.039, 0.034], [-0.24, 0.039, 0.034]], 12), P, C.glove, 0, 0, 0);
      } else {
        add(el, loft([[0.035, 0.052, 0.052], [-0.03, 0.052, 0.05]], 12), S, C.shirt, 0, 0, 0);   // 卷起的袖口
        add(el, loft([[0.0, 0.044, 0.044], [-0.06, 0.046, 0.043], [-0.16, 0.038, 0.034], [-0.235, 0.032, 0.028]], 12), P, C.skin, 0, 0, 0);
      }
      // 手掌 + 握拳四指 + 拇指
      add(el, rbox(0.032, 0.085, 0.08, 0.014), P, C.glove, 0, -0.285, 0);
      add(el, rbox(0.034, 0.05, 0.075, 0.014), P, C.glove, -sx * 0.022, -0.33, -0.004, 0.25);
      add(el, rbox(0.022, 0.05, 0.022, 0.008), P, C.glove, -sx * 0.012, -0.28, -0.045, -0.3);
    }
    // ---- 腿 ----
    const lw = CT ? 1.08 : 1.14;
    for (const [hp, kn, sx] of [[H.hipL, H.knL, -1], [H.hipR, H.knR, 1]]) {
      add(hp, loft([[0.07, 0.085, 0.09], [-0.04, 0.089 * lw, 0.093 * lw], [-0.18, 0.077 * lw, 0.082 * lw], [-0.34, 0.06 * lw, 0.064 * lw], [-0.44, 0.056 * lw, 0.06 * lw]], 14), S, C.pants, 0, 0, 0);
      add(hp, rbox(0.03, 0.12, 0.1, 0.012), S, C.pants, sx * 0.08, -0.2, 0);                    // 侧袋
      add(kn, loft([[0.03, 0.057 * lw, 0.06 * lw], [-0.09, 0.058 * lw, 0.066 * lw, 0, 0.006], [-0.24, 0.046 * lw, 0.05 * lw], [-0.33, 0.042, 0.044]], 14), S, C.pants, 0, 0, 0);
      if (CT) add(kn, rbox(0.085, 0.11, 0.035, 0.012), P, C.knee, 0, -0.01, -0.058);
      // 战术靴
      add(kn, rbox(0.1, 0.11, 0.11, 0.025), P, C.boots, 0, -0.36, 0.0);
      add(kn, rbox(0.096, 0.07, 0.24, 0.025), P, C.boots, 0, -0.42, -0.055);
      add(kn, rbox(0.104, 0.022, 0.26, 0.008), P, C.sole, 0, -0.455, -0.055);
    }
    if (CT) add(H.hipR, rbox(0.04, 0.16, 0.08, 0.012), P, C.pouch, 0.1, -0.13, 0.0);           // 腿挂枪套
  }

  class Humanoid {
    constructor(team, opts = {}) {
      this.team = team;
      this._shadowOnly = !!opts.shadowOnly;
      const M = charMats(team);
      const R = this.root = new THREE.Group();
      const B = (parent, x, y, z) => { const b = new THREE.Bone(); b.position.set(x, y, z); parent.add(b); return b; };
      this.hips = B(R, 0, 0.95, 0);
      this.spine = B(this.hips, 0, 0.04, 0);
      this.neck = B(this.spine, 0, 0.48, 0);
      this.head = B(this.neck, 0, 0.08, 0);
      this.shL = B(this.spine, -0.2, 0.42, 0); this.elL = B(this.shL, 0, -0.28, 0);
      this.shR = B(this.spine, 0.2, 0.42, 0); this.elR = B(this.shR, 0, -0.28, 0);
      this.hipL = B(this.hips, -0.095, -0.06, 0); this.knL = B(this.hipL, 0, -0.42, 0);
      this.hipR = B(this.hips, 0.095, -0.06, 0); this.knR = B(this.hipR, 0, -0.42, 0);
      this.gunMount = node(this.spine, 0.12, 0.38, -0.08);
      const bones = [this.hips, this.spine, this.neck, this.head, this.shL, this.elL, this.shR, this.elR, this.hipL, this.knL, this.hipR, this.knR];
      R.updateMatrixWorld(true);
      // 几何按阵营缓存（绑定姿态相同）
      if (!skinGeoCache[team]) {
        const groups = { cloth: [], plain: [] }, tmp = new THREE.Object3D();
        const add = (bone, geo, kind, color, x, y, z, rx = 0, sx = 1, sy = 1, sz = 1, rz = 0) => {
          tmp.position.set(x, y, z); tmp.rotation.set(rx, 0, rz); tmp.scale.set(sx, sy, sz); tmp.updateMatrix();
          groups[kind].push({ geo, matrix: new THREE.Matrix4().multiplyMatrices(bone.matrixWorld, tmp.matrix), bi: bones.indexOf(bone), color });
        };
        buildBody(this, team, add);
        skinGeoCache[team] = { cloth: buildSkinned(groups.cloth), plain: buildSkinned(groups.plain) };
      }
      this.skeleton = new THREE.Skeleton(bones);
      this.meshes = [];
      for (const kind of ['cloth', 'plain']) {
        const mesh = new THREE.SkinnedMesh(skinGeoCache[team][kind], opts.shadowOnly ? SHADOW_ONLY : M[kind]);
        mesh.castShadow = true; mesh.frustumCulled = false;
        R.add(mesh);
        this.meshes.push(mesh);
      }
      R.updateMatrixWorld(true);
      for (const m of this.meshes) m.bind(this.skeleton);
      this.hitboxes = [];
      const hb = (bone, x, y, z, sx, sy, sz, group) => this.hitboxes.push({ bone, min: new THREE.Vector3(x - sx / 2, y - sy / 2, z - sz / 2), max: new THREE.Vector3(x + sx / 2, y + sy / 2, z + sz / 2), group });
      // 命中盒（骨骼局部，贴合模型）。头部用椭球：头盔算头，头顶上方空气与脖子不算爆头
      const CT = team === 'CT';
      this.hitboxes.push({ bone: this.head, group: 'head', ell: { c: new THREE.Vector3(0, CT ? 0.112 : 0.106, -0.006), r: new THREE.Vector3(CT ? 0.104 : 0.088, CT ? 0.116 : 0.112, CT ? 0.112 : 0.104) } });
      hb(this.neck, 0, 0.02, 0, 0.1, 0.08, 0.1, 'chest');
      hb(this.spine, 0, 0.32, -0.01, 0.4, 0.28, 0.3, 'chest');
      hb(this.spine, 0, 0.1, -0.005, 0.32, 0.16, 0.22, 'stomach');
      hb(this.hips, 0, -0.04, 0, 0.34, 0.2, 0.22, 'stomach');
      for (const b of [this.shL, this.shR]) hb(b, 0, -0.13, 0, 0.12, 0.33, 0.12, 'arm');
      for (const b of [this.elL, this.elR]) hb(b, 0, -0.17, 0, 0.09, 0.34, 0.09, 'arm');
      for (const b of [this.hipL, this.hipR]) hb(b, 0, -0.2, 0, 0.18, 0.46, 0.18, 'leg');
      for (const b of [this.knL, this.knR]) hb(b, 0, -0.23, -0.03, 0.12, 0.48, 0.2, 'leg');

      this.phase = Math.random() * 6;
      this.weapon = null;
      this.ragdoll = null;
      this.pitch = 0;
      this.crouch = 0;
      this._ik = { S: new THREE.Vector3(), T: new THREE.Vector3(), E: new THREE.Vector3(), P: new THREE.Vector3(), d: new THREE.Vector3(), q: new THREE.Quaternion(), m: new THREE.Matrix4() };
    }

    setWeapon(id) {
      if (this.weapon && this.weapon.id === id) return;
      if (this.weapon) this.gunMount.remove(this.weapon.group);
      this.weapon = null;
      if (!id) return;
      const w = thirdPerson(id);
      if (this._shadowOnly) w.group.traverse((o) => { if (o.isMesh) o.material = SHADOW_ONLY; });
      if (this.layer) w.group.traverse((o) => o.layers.set(this.layer));
      this.gunMount.add(w.group);
      this.weapon = w;
      if (w.pistol) this.gunMount.position.set(0.03, 0.42, -0.4);
      else if (WEAPONS[id] && WEAPONS[id].type === 'knife') this.gunMount.position.set(0.2, 0.18, -0.32);
      else if (WEAPONS[id] && (WEAPONS[id].type === 'grenade' || WEAPONS[id].type === 'c4')) this.gunMount.position.set(0.18, 0.28, -0.3);
      else this.gunMount.position.set(0.12, 0.38, -0.08);
    }
    markShadowOnly() { this._shadowOnly = true; }

    // 两骨 IK：让手抓住武器
    solveArm(sh, el, target, poleX) {
      const k = this._ik;
      // 目标点转到 spine 局部
      const S = k.S.copy(sh.position);
      const T = k.T.copy(target);
      const a = 0.28, b = 0.27;
      const d = k.d.subVectors(T, S); let L = d.length();
      L = clamp(L, 0.12, a + b - 0.002); d.normalize();
      const cosA = clamp((a * a + L * L - b * b) / (2 * a * L), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
      const P = k.P.set(poleX, -1, 0.35);
      P.addScaledVector(d, -P.dot(d)).normalize();
      const E = k.E.copy(S).addScaledVector(d, a * cosA).addScaledVector(P, a * sinA);
      // 上臂：-Y 对准 E-S
      _v1.subVectors(E, S).normalize();
      sh.quaternion.setFromUnitVectors(_v2.set(0, -1, 0), _v1);
      // 前臂：在上臂局部系
      _v1.subVectors(T.copy(target), E).normalize();
      k.q.copy(sh.quaternion).invert();
      _v1.applyQuaternion(k.q);
      el.quaternion.setFromUnitVectors(_v2.set(0, -1, 0), _v1);
    }

    update(dt, s) {
      if (this.ragdoll) return;
      const speed = s.speed || 0;
      const amp = clamp(speed / 5.2, 0, 1);
      this.phase += speed * dt / 1.5 * Math.PI;
      const sw = Math.sin(this.phase);
      this.crouch = damp(this.crouch, s.crouch ? 1 : 0, 14, dt);
      const c = this.crouch;
      this.hips.position.y = lerp(0.95, 0.62, c) + Math.abs(Math.cos(this.phase)) * 0.025 * amp * (1 - c * 0.5);
      const wkL = sw * 0.6 * amp, wkR = -sw * 0.6 * amp;
      const knL = -Math.max(0, Math.sin(this.phase + 1.2)) * 1.0 * amp - 0.06 * amp;
      const knR = -Math.max(0, Math.sin(this.phase + 1.2 + Math.PI)) * 1.0 * amp - 0.06 * amp;
      this.hipL.rotation.x = lerp(wkL, 1.2 + wkL * 0.35, c); this.hipR.rotation.x = lerp(wkR, 1.05 + wkR * 0.35, c);
      this.knL.rotation.x = lerp(knL, -1.59, c); this.knR.rotation.x = lerp(knR, -1.35, c);
      this.hipL.rotation.z = -0.03; this.hipR.rotation.z = 0.03;
      const pitch = s.pitch || 0;
      this.pitch = damp(this.pitch, pitch, 20, dt);
      this.spine.rotation.x = this.pitch * 0.65 + c * 0.12 + amp * 0.06;
      this.spine.rotation.y = Math.sin(this.phase) * 0.05 * amp;
      // 呼吸 + 跑动时上身随步伐起伏
      this.breath = (this.breath || Math.random() * 6) + dt;
      this.spine.rotation.x += Math.sin(this.breath * 1.7) * 0.012 * (1 - amp) + Math.abs(Math.sin(this.phase)) * 0.03 * amp;
      this.spine.rotation.z = Math.sin(this.phase) * 0.025 * amp;
      this.neck.rotation.x = this.pitch * 0.3 - c * 0.1;
      this.neck.rotation.z = -this.spine.rotation.z;
      this.gunMount.rotation.x = this.pitch * 0.35 - c * 0.02;
      if (s.reloading) { this.gunMount.rotation.z = -0.6; this.gunMount.rotation.x -= 0.5; }
      else this.gunMount.rotation.z = 0;
      // 手臂 IK
      const w = this.weapon;
      this.gunMount.updateMatrix();
      if (w) {
        const right = _v3.copy(w.grip).applyMatrix4(this.gunMount.matrix);
        const tR = right.clone();
        this.solveArm(this.shR, this.elR, tR, 1.0);
        if (WEAPONS[w.id] && (WEAPONS[w.id].type === 'knife' || WEAPONS[w.id].type === 'grenade' || WEAPONS[w.id].type === 'c4')) {
          this.solveArm(this.shL, this.elL, _v3.set(-0.26, 0.05, -0.06 + Math.sin(this.phase) * 0.05 * amp), -1.0);
        } else {
          const left = _v3.copy(w.guard).applyMatrix4(this.gunMount.matrix);
          left.z += w.pistol ? 0.0 : 0.04;
          this.solveArm(this.shL, this.elL, left, -1.0);
        }
      } else {
        this.solveArm(this.shR, this.elR, _v3.set(0.26, 0.05, 0.0), 1);
        this.solveArm(this.shL, this.elL, _v3.set(-0.26, 0.05, 0.0), -1);
      }
    }
  }

  return { mats, weapon, thirdPerson, charMats, Humanoid, rbox, cylZ, cylY, mergeGeos, SHADOW_ONLY };
})();
