// Pure-data diagnostics for scene assembly and night lighting.
//
// This module is intentionally dependency-free: it imports nothing (no three.js), never touches
// window/document and does no disk I/O. Feed it a plain snapshot object (the shape that
// scene.js builds in buildSceneSnapshot()) and it returns a plain, JSON-serialisable report.
// It never throws on bad input: invalid fields degrade the report, get listed in
// affectedFields and produce human-readable failures in checks.
//
// Snapshot shape:
//   {
//     night: number,                                   // night coefficient, 0 (day) to 1 (night)
//     lamps: [{ x, z, atRowZ12, candela }],            // lamp posts; candela null = post, no light
//     lanternCandela: number | null,                   // point light hanging under the dome
//     parts: [{ name, geometry, instances, castShadow, receiveShadow }]
//   }
// geometry is 'lathe', 'sweep', 'instanced' or 'primitive'. Only 'instanced' changes the draw
// call count, matching Kit.build(): a collected part is one InstancedMesh (one draw call);
// every other mesh costs one draw call per instance.

// Mirrors scene.js update(now): glow.emissiveIntensity = night * 3.5
export const GLOW_EMISSIVE_FACTOR = 3.5;
// Mirrors scene.js update(now): lights stay visible only while night > 0.01
export const LIGHT_VISIBLE_CUTOFF = 0.01;

const finiteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const plainArray = (v) => (Array.isArray(v) ? v : []);
const check = (name, pass, reason) => ({ name, pass: pass === true, reason: String(reason) });

// JSON-safe description of a bad value (the output itself must never contain NaN/Infinity).
function describe(v) {
  if (typeof v === 'number') return Number.isNaN(v) ? 'NaN' : String(v);
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return `"${v}"`;
  return typeof v;
}

// Report for a snapshot that is missing entirely (buildScene() has not run yet).
function notBuiltReport() {
  return {
    status: 'not-built',
    affectedFields: ['snapshot'],
    lighting: { glowIntensity: null, lightVisible: false, lightCount: 0, lights: [] },
    assembly: { totalDrawCalls: 0, parts: [] },
    checks: [check('scene-built', false,
      'scene has not been built yet: call buildScene() before taking a snapshot')],
  };
}

// One point-light row. Visibility follows update() exactly (night > 0.01), so a light with a
// broken candela can still be "visible"; its intensity is null instead of a non-finite number.
function makeLight(name, kind, x, z, atRowZ12, candela, fieldPath, night, nightValid, lightsOn, candelaErrors) {
  const candelaValid = finiteNumber(candela) && candela > 0;
  if (!candelaValid) {
    candelaErrors.push(`${fieldPath}: candela must be a positive finite number, got ${describe(candela)}`);
  }
  return {
    name,
    kind,
    x: finiteNumber(x) ? x : null,
    z: finiteNumber(z) ? z : null,
    atRowZ12: kind === 'lamp' ? atRowZ12 === true : false,
    candela: finiteNumber(candela) ? candela : null,
    intensity: nightValid && candelaValid ? night * candela : null,
    visible: lightsOn,
  };
}

/**
 * Diagnose a scene snapshot. Pure function: same input gives the same output, no side effects,
 * result is JSON-serialisable (no Vector3, materials or functions).
 */
export function diagnoseScene(snapshot) {
  if (snapshot === null || snapshot === undefined) return notBuiltReport();
  if (typeof snapshot !== 'object') {
    return {
      status: 'degraded',
      affectedFields: ['snapshot'],
      lighting: { glowIntensity: null, lightVisible: false, lightCount: 0, lights: [] },
      assembly: { totalDrawCalls: 0, parts: [] },
      checks: [check('snapshot-shape', false, `snapshot must be a plain object, got ${describe(snapshot)}`)],
    };
  }

  const affectedFields = [];
  const checks = [];
  const candelaErrors = [];
  const instanceErrors = [];

  // ---- night coefficient
  const night = snapshot.night;
  const nightValid = finiteNumber(night) && night >= 0 && night <= 1;
  if (!finiteNumber(night)) {
    affectedFields.push('night');
    checks.push(check('night-range', false,
      `night must be a finite number between 0 and 1, got ${describe(night)}`));
  } else if (night < 0 || night > 1) {
    affectedFields.push('night');
    checks.push(check('night-range', false, `night must be between 0 and 1, got ${night}`));
  } else {
    checks.push(check('night-range', true, `night ${night} is within the 0 to 1 range`));
  }
  const lightsOn = nightValid && night > LIGHT_VISIBLE_CUTOFF;
  const glowIntensity = nightValid ? night * GLOW_EMISSIVE_FACTOR : null;

  // ---- point lights: lamp posts (only the z=12 row carries real lights) plus the dome lantern
  const lights = [];
  plainArray(snapshot.lamps).forEach((lamp, i) => {
    const raw = lamp && typeof lamp === 'object' ? lamp : {};
    if (typeof raw.candela !== 'number') return;             // a post without a PointLight
    lights.push(makeLight(`lamp-${i}`, 'lamp', raw.x, raw.z, raw.atRowZ12 === true,
      raw.candela, `lamps[${i}].candela`, night, nightValid, lightsOn, candelaErrors));
    if (!finiteNumber(raw.candela) || raw.candela <= 0) affectedFields.push(`lamps[${i}].candela`);
  });
  if (typeof snapshot.lanternCandela === 'number') {
    lights.push(makeLight('dome-lantern', 'lantern', 0, 0, false,
      snapshot.lanternCandela, 'lanternCandela', night, nightValid, lightsOn, candelaErrors));
    if (!finiteNumber(snapshot.lanternCandela) || snapshot.lanternCandela <= 0) {
      affectedFields.push('lanternCandela');
    }
  }
  checks.push(candelaErrors.length
    ? check('candela-positive', false, candelaErrors.join('; '))
    : check('candela-positive', true,
      `${lights.length} point light${lights.length === 1 ? '' : 's'} all carry positive finite candela`));

  // ---- assembled parts and draw calls (Kit rule: instanced parts merge into one draw call)
  const parts = plainArray(snapshot.parts).map((part, i) => {
    const raw = part && typeof part === 'object' ? part : {};
    const name = typeof raw.name === 'string' && raw.name ? raw.name : `part-${i}`;
    const geometry = typeof raw.geometry === 'string' && raw.geometry ? raw.geometry : 'primitive';
    const instances = raw.instances;
    const instancesValid = Number.isInteger(instances) && instances >= 0;
    if (!instancesValid) {
      instanceErrors.push(`parts[${i}] (${name}): instances must be a non-negative integer, got ${describe(instances)}`);
      affectedFields.push(`parts[${i}].instances`);
    }
    return {
      name,
      geometry,
      instances: instancesValid ? instances : null,
      drawCalls: geometry === 'instanced' ? 1 : instancesValid ? instances : null,
      castShadow: raw.castShadow === true,
      receiveShadow: raw.receiveShadow === true,
    };
  });
  checks.push(instanceErrors.length
    ? check('instances-nonnegative-integer', false, instanceErrors.join('; '))
    : check('instances-nonnegative-integer', true, 'every part has a non-negative integer instance count'));

  const badInstanced = parts.filter((p) => p.geometry === 'instanced' && p.drawCalls !== 1);
  checks.push(badInstanced.length
    ? check('instanced-single-draw-call', false,
      badInstanced.map((p) => `${p.name} is instanced but reports ${p.drawCalls} draw calls instead of 1`).join('; '))
    : check('instanced-single-draw-call', true, 'every instanced part renders in a single draw call'));

  // ---- night == 0: update() hides every light and zeroes every intensity
  if (!nightValid) {
    checks.push(check('night-zero-dark', false,
      'cannot evaluate the dark-night rule because night is not a valid number'));
  } else if (night === 0) {
    const lit = lights.filter((l) => l.visible || l.intensity !== 0);
    checks.push(lit.length
      ? check('night-zero-dark', false,
        `night is 0 but ${lit.length} light(s) are visible or non-zero: ${lit.map((l) => l.name).join(', ')}`)
      : check('night-zero-dark', true,
        `night is 0: all ${lights.length} point light(s) are invisible with intensity 0; night lighting is switched off`));
  } else {
    checks.push(check('night-zero-dark', true,
      `night is ${night} (> 0): lights may be on; the switched-off rule applies only at night 0`));
  }

  const totalDrawCalls = parts.reduce((sum, p) => sum + (typeof p.drawCalls === 'number' ? p.drawCalls : 0), 0);
  return {
    status: affectedFields.length ? 'degraded' : 'ok',
    affectedFields,
    lighting: {
      glowIntensity,
      lightVisible: lightsOn,
      lightCount: lights.length,
      lights,
    },
    assembly: {
      totalDrawCalls,
      parts,
    },
    checks,
  };
}
