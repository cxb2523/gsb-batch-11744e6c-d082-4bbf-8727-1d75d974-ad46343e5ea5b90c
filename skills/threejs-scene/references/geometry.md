# Geometry

## Work from real dimensions

Put the measurements at the top of the scene file, in metres, with where they came from:

```js
const R = 4.2;          // column ring radius
const COL_H = 5.0;      // column height including base and capital (about 9 lower diameters)
const STOREY = [0, 4.6, 10.2, 15.0];   // floor levels from the elevation drawing
```

Derive everything else from these. When something looks wrong, it is almost always a proportion, and a named constant is easy to fix.

## Profiles and sweeps

A profile is a list of `[outward offset, height]` points drawn as if you cut through the moulding. `sweep(profile, path, { closed, y })` extrudes it along a polyline in the XZ plane:

- Corners are mitred: each vertex offsets along the bisector, lengthened by `1 / cos` of the half-angle (capped so a sharp corner does not spike).
- For a closed path the winding is detected, so positive offsets always point away from the enclosed area.
- UVs are planar at world scale, so a stone texture tiles at the same size on every moulding.

Use it for cornices and entablatures, string courses, plinths, kerbs and road edges, steps (a stair-step profile), parapets, window surrounds (a closed rectangle), picture rails, car body creases.

Round plans use `arc(cx, cz, r, a0, a1, n)` as the path. 96 segments is smooth for a 4 m radius at normal viewing distance.

## Lathes

`lathe([[r, y], ...], segments)` turns a profile around the Y axis. Columns get entasis (a slight swelling about a third of the way up, then taper to about 0.84 of the base radius at the top); without it, columns look like pipes. Balusters, urns, domes, finials, lamp posts, bollards, wheels, tyres, bottles and glasses are all lathes.

## Instancing

The `Kit` collects matrices per named part and builds one `InstancedMesh` per part:

```js
const kit = new Kit()
  .def('window', windowGeo, glassFrameMat)
  .def('baluster', balusterGeo, stone, { cast: false });
for (const bay of bays) kit.add('window', place(bay.x, LEVEL.state + 1.2, FACE_Z, 0));
kit.build(group);
```

- `place(x, y, z, angle, sx, sy, sz)` makes the matrix; angle turns about +Y with 0 facing +Z.
- Pass a `THREE.Color` as the third argument to `add` for per-instance colour.
- Pass `{ depth: material }` to give the instanced mesh a `customDepthMaterial` (needed when a shader patch moves vertices).
- 10,000 instances of a 2,000-triangle part is cheap; 10,000 separate meshes is not.

## Canvas textures

`canvasTex(w, h, draw, { repeat })` draws with the 2D canvas API and returns a texture. Seed every random choice (`rng(seed)`) so the scene is identical on every load, which also keeps recordings repeatable.

Patterns that work:

- **Stone and render:** a base colour plus a few thousand low-alpha speckles of nearby tones at varied radii.
- **Grass:** speckles plus thousands of short random strokes for blades; repeat 40 to 80 times over a large ground.
- **Brick and ashlar:** draw courses with slight per-block tone variation, then mortar lines; use the same canvas, white on black, as a bump map.
- **Window glass:** a vertical gradient from sky colour to darker, with a faint reflection band.
- **Signs and text:** draw with a web font after `document.fonts.ready`, or the first frame draws the fallback font.

Set `colorSpace = SRGBColorSpace` on colour textures and leave data textures (bump, roughness) linear.

## Detail where the eye goes

Spend triangles on what the camera dwells on: the entrance, the silhouette against the sky, anything within ten metres of a vantage. Far facades can be flat boxes with a window-grid texture. Check from every vantage before adding detail anywhere else.

## Ground contact

Objects that do not meet the ground properly give a scene away. Sink posts and trees a few centimetres into the ground, give buildings a plinth, and rely on GTAO for the contact darkening. Check from a low vantage.
