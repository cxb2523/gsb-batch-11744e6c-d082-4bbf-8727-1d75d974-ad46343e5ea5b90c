# Lighting

Light carries most of the realism in a code-built scene. Geometry tells the viewer what a thing is; light tells them it is real.

## The preset model

`env.js` describes a time of day as one flat object and blends between objects. Keeping every light-related value in one place is what lets "golden hour" stay coherent: the sky gradient, the sun, the ambient bounce, the fog and the exposure all move together.

| Key | Meaning | Typical day / golden / night |
| --- | --- | --- |
| `skyEl`, `az` | Sun position used to paint the sky (degrees) | 30 / 5 / -14 |
| `el` | Sun position used to light the scene | 32 / 9 / 42 (moon) |
| `sunI`, `sunC` | Directional light intensity and colour | 3.0 white-warm / 3.4 orange / 0.14 blue |
| `hemiS`, `hemiG`, `hemiI` | Sky and ground bounce colours, intensity | cool blue over green / peach over brown / navy over black |
| `envI` | `scene.environmentIntensity`, the image-based light | 0.75 / 0.62 / 0.16 |
| `turb`, `ray`, `mie`, `mieG` | Sky shader scattering | haze rises at golden hour |
| `fogC`, `fogD` | Exponential fog colour and density | fog takes the sky's horizon colour |
| `exp` | `toneMappingExposure` | 0.62 / 0.72 / 1.0 |
| `night` | 0 to 1, drives emissives, bloom, stars, lamps | 0 / 0 / 1 |

Separating `skyEl` from `el` is deliberate. A sun painted at 5 degrees looks right in the sky, but light from 5 degrees grazes every vertical face into darkness; lifting the light to 9 degrees keeps facades readable while the sky still says "sunset".

## Rules that held up

- **Fog colour equals the horizon colour.** Distant objects should dissolve into the sky, not into grey. Exponential fog (`FogExp2`) reads more naturally than linear.
- **Exposure is per preset.** Night needs more exposure, not brighter lights. Raising light intensities at night lifts the whole scene to a grey day.
- **The ambient term has a colour.** A hemisphere light with a cool sky and a warm or green ground gives faces in shadow the colour they have outdoors. A plain white ambient light flattens everything.
- **Regenerate the environment map when the sky changes,** or reflections show noon on a night scene. PMREM generation costs a few milliseconds; during a blend, refresh it every sixth frame.
- **Shadows**: one directional sun with a 4096 map, frustum fitted to what the camera looks at (about 0.85 times the camera distance as half-width, clamped), centred on the camera target and snapped to whole shadow texels. Without snapping, shadow edges crawl as the camera moves. `bias` of about -0.0002 and a `normalBias` proportional to scene scale remove acne.

## Night

- Sun intensity near 0.15 with a blue tint, standing in for moonlight.
- Windows, lamps and signs carry the scene: emissive materials (or a shader patch that lights windows by `uNight`) plus bloom. Bloom threshold drops and strength rises with night (0.9 to 0.75 threshold, 0.12 to 0.6 strength).
- Real lights are few, physically based (`decay: 2`, intensity in candela) and placed where light would really come from: floodlights on poles aimed at a facade, a lantern under a dome, lamps along a path. A light at ground level aimed up a wall lights the wall's base and nothing else.
- Hide lights whose intensity is zero. Three.js still renders their shadow maps.
- Floodlit pale surfaces with snow on them blow out quickly; scale flood intensity down when the scene is snowy.

## Checking light

Shoot every vantage at every preset in one contact sheet (`site-check`). Look for: crushed blacks in shadow at golden hour (raise `hemiI`), white facades clipping at noon (lower `sunI` or exposure), fog that hides the subject from the far vantage (lower `fogD`), and banding in the sky (the half-float composer target avoids it; an 8-bit target does not).
