# Core Math, Optics & Choreography Score Specifications

This document is the authoritative technical specification for **Layer 1 (`src/core/`)** and the **YAML Choreography Score Schema (`src/scores/*.yaml`)** in **StageFlow**. It is governed by [`AGENTS.md`](../AGENTS.md) and complements the in-app manual pair:
- [**`docs/STAGEFLOW_SCRIPT_SPECIFICATION.md`**](./STAGEFLOW_SCRIPT_SPECIFICATION.md) (`?mode=spec`) — Pure mathematical model, optical projections, closed-form trajectory equations, and normalized AST contract.
- [**`docs/YAML_AUTHORING_GUIDE.md`**](./YAML_AUTHORING_GUIDE.md) (`?mode=guide`) — Declarative YAML authoring reference, accepted aliases, and production cinematography recipes.

---

## 1. Coordinate System & Unit Conventions

StageFlow uses a standardized, human-intuitive metric coordinate system in YAML that maps cleanly to Three.js right-handed $Y$-up world space:

- **World Space Axes**:
  - $+X$: Stage Right
  - $+Y$: Vertical Elevation ($Y = 0$ is the stage floor plane)
  - $+Z$: Downstage / Front (toward the default viewer)
- **Spatial Units**: **Metric Meters ($1\text{ Three.js unit} = 1\text{m}$)**.
  - Standard character dimensions: `height: 1.75m`, `radius: 0.26m`, `width: 0.52m`, `depth: 0.52m` (eye-level look-at anchor at `0.90 * height ≈ 1.575m`).
  - Standard prop dimensions: `height: 0.85m` (or `2 * radius = 0.70m` when `shape: "sphere"` omits `height`), `radius: 0.35m`, `width: 0.70m`, `depth: 0.70m` (center-volume look-at anchor at `0.50 * height`).
  - Standard marker dimensions: `height: 0.15m`, `radius: 0.25m`, `width: 0.50m`, `depth: 0.50m` (center-volume look-at anchor at `0.50 * height`).
  - Default stage floor: `10m × 10m` with `1.0m` major grid sections and `0.25m` minor subdivisions.
- **Angular Units**:
  - **In YAML Scores & UI Readouts**: Authored and displayed in **human degrees (`deg`)** (e.g., `pitch: 26`, `yaw: -35`, `rotation: 90`).
  - **In Internal Core Math (`SphericalPose`, `SceneEntityDef`)**: Normalized to **radians (`rad`)** inside [`scorePrimitives.ts`](../src/core/scorePrimitives.ts) and [`scoreParser.ts`](../src/core/scoreParser.ts) via `degToRad()`.

---

## 2. Spherical Camera Model & Cartesian Conversion (`sphericalMath.ts`)

Both the **Observer Camera** (viewport camera) and the **Stage Camera** (illustrative 3D camera inside the diorama) are parameterized by [`SphericalPose`](../src/core/types.ts):

```typescript
export interface SphericalPose {
  target: Vec3;          // 3D look-at target point in meters
  distance: number;      // Radial distance from target to camera eye in meters (0.4m to 100.0m)
  pitch: number;         // Vertical elevation angle in radians (-85° to +85°)
  yaw: number;           // Horizontal azimuth angle in radians around Y-axis
  roll: number;          // Optical sightline roll angle in radians (0 = level horizon, + = CW from operator POV)
  focalLengthMm: number; // Full-frame equivalent focal length in millimeters (12mm to 200mm)
}
```

### 2.0 Canonical Boundaries (`CAMERA_LIMITS` in `constants.ts`)
- **Distance ($d$)**: Clamped to $[0.4\text{m}, 100.0\text{m}]$ (`CAMERA_LIMITS.MIN_DISTANCE_M = 0.4`, `CAMERA_LIMITS.MAX_DISTANCE_M = 100.0`). The $100\text{m}$ ceiling supports wide-angle architectural overviews, stadium/arena tracking, and long telephoto master shots.
- **Pitch ($\theta$)**: Clamped to $[-85^\circ, +85^\circ]$ ($\left[-1.4835, +1.4835\right]\text{ rad}$) to eliminate top/bottom pole gimbal singularities.
- **Focal Length ($f_{\text{mm}}$)**: Clamped to $[12\text{mm}, 200\text{mm}]$ full-frame sensor equivalents.

### 2.1 Forward Conversion (`sphericalToCartesian`)
Given a `SphericalPose`, [`sphericalToCartesian`](../src/core/sphericalMath.ts) computes the 3D eye position $(x, y, z)$ and the orthonormal rolled camera up-vector $\vec{U}_{\text{rolled}}$:
$$
\begin{aligned}
x_{\text{eye}} &= \text{target}_x + d \cdot \cos(\text{pitch}) \cdot \sin(\text{yaw}) \\
y_{\text{eye}} &= \text{target}_y + d \cdot \sin(\text{pitch}) \\
z_{\text{eye}} &= \text{target}_z + d \cdot \cos(\text{pitch}) \cdot \cos(\text{yaw})
\end{aligned}
$$

The unit up-vector $\vec{U}_{\text{rolled}}$ rotated by roll $\gamma$ around the forward sightline $\vec{F}$ is:
$$\vec{U}_{\text{rolled}} = \begin{bmatrix}
-\cos(\gamma)\sin(\text{pitch})\sin(\text{yaw}) + \sin(\gamma)\cos(\text{yaw}) \\
\cos(\gamma)\cos(\text{pitch}) \\
-\cos(\gamma)\sin(\text{pitch})\cos(\text{yaw}) - \sin(\gamma)\sin(\text{yaw})
\end{bmatrix}$$

Notice that `roll` preserves 3D eye position invariance: varying `roll` rotates the camera sensor and rectangular gate without moving $(x_{\text{eye}}, y_{\text{eye}}, z_{\text{eye}})$ or the look-at target.

### 2.2 Inverse Conversion (`cartesianToSpherical`)
When the user freely orbits or pans the viewport via `OrbitControls`, [`cartesianToSpherical(eye, target, focalLengthMm, roll)`](../src/core/sphericalMath.ts) recovers the exact `SphericalPose` so the bottom-right [`CameraTelemetryCapsule`](../src/ui/CameraTelemetryCapsule.tsx) displays live degrees and meters ready for 1-click YAML copying. Free orbit maintains level horizon ($\text{roll} = 0$).

### 2.3 Shortest-Arc Angular Unwrapping (`shortestAngleDiff`)
All angular interpolations (`yaw`, `roll`, and entity `rotationYRad`) use [`shortestAngleDiff(targetRad, currentRad)`](../src/core/sphericalMath.ts), which wraps $\Delta\theta$ onto $[-\pi, \pi]$ to prevent $360^\circ$ spin artifacts across the $-\pi / +\pi$ boundary. Explicit multi-turn rotations authored with `roll_delta` or `roll_start`/`roll_end` bypass modulo wrapping to execute complete deliberate barrel rolls.

### 2.4 Directed Orbit Angular Differences (`directedAngleDiff`)
When authoring `maneuver: "orbit"` or `"sweep"` with an explicit `direction: "cw"` or `"ccw"` alongside a destination `yaw`, [`directedAngleDiff(targetRad, currentRad, direction)`](../src/core/sphericalMath.ts) forces the angular rotation along the commanded azimuthal direction ($[-2\pi, 0]$ for clockwise, $[0, +2\pi]$ for counter-clockwise) rather than blindly defaulting to the shortest Euclidean arc. When `direction` is omitted, it falls back to `shortestAngleDiff`.

### 2.5 Physical Camera Rig Kinematics & Inverse Look-At (`cameraRigEvaluator.ts`)
When a camera cue specifies `rig: CameraRigSpec` (`tripod`, `track`, `spline_track`), [`cameraRigEvaluator.ts`](../src/core/cameraRigEvaluator.ts) overrides standard spherical eye calculations to anchor camera nodal point $\vec{E}(t)$ directly in 3D world space:
1. **Stationary Tripod (`type: 'tripod'`)**:
   $$\vec{E}(t) \equiv \vec{P}_{\text{tripod}} = (x_0, y_0, z_0)$$
   Eye coordinates remain 100% stationary throughout the cue duration.
2. **Linear Dolly Track (`type: 'track'`)**:
   $$\vec{E}(u) = (1 - u)\vec{A} + u\vec{B}$$
   The camera cart translates along the floor rail via normalized easing progress $u = E(\tau)$. In `continuous: true` mode, omitting `from:` automatically inherits the previous shot's terminal eye position $\vec{E}_{\text{prev}}$, guaranteeing unbroken physical continuity.
3. **Curved Spline Dolly Track (`type: 'spline_track'`)**:
   Interpolates through polyline control points using centripetal Catmull-Rom splines with cumulative chord arc-length parameterization.
4. **Inverse Look-At vs. Fixed-Gaze Kinematics**:
   - **Target-Tracking Mode (`target:` present)**: Given evaluated eye $\vec{E}(u)$ and resolved target anchor $\vec{T}(u)$, calls `cartesianToSpherical(eye, target, lens, roll)` to dynamically compute pan ($yaw$), tilt ($pitch$), and distance ($d = \|\vec{T} - \vec{E}\|$), swiveling the camera head at 60fps to track moving actors.
   - **Fixed-Gaze Mode (`target:` omitted)**: Forward-projects target anchor $\vec{T}(u) = \vec{E}(u) + d \cdot \hat{F}$ along authored fixed or eased angles $(\theta, \psi)$, maintaining constant orientation while the cart moves along the track.
5. **Rail Guide Sampling (`sampleRigRailPoints`)**:
   Generates precision 3D rail polylines cached in `trajectoryChain.ts` and evaluated imperatively by Layer 4 mount components.

---

## 3. Directorial Lens Optics & Frustum Gate Geometry (`opticsMath.ts`)

StageFlow models camera framing using standard **35mm Full-Frame Sensor Gate Width ($W_{\text{sensor}} = 36.0\text{mm}$)**:

1. **Sensor Height Derivation**:
   $$H_{\text{sensor}} = \frac{36.0\text{mm}}{\text{aspectRatio}}$$
   (For `16:9` widescreen, $H_{\text{sensor}} = 20.25\text{mm}$; for `2.39:1` anamorphic scope, $H_{\text{sensor}} \approx 15.06\text{mm}$).
2. **Vertical Field of View (`focalLengthToVerticalFovDeg`)**:
   $$\text{FOV}_{\text{vert}} = 2 \cdot \arctan\left(\frac{H_{\text{sensor}}}{2 \cdot f_{\text{mm}}}\right) \cdot \frac{180}{\pi}$$
3. **Rectangular Film Gate Dimensions at Target Depth (`computeFrustumGateDimensions`)**:
   At distance $D$ (in meters) from the lens nodal point, the projected rectangular focus gate has dimensions:
   $$W_{\text{gate}} = D \cdot \frac{W_{\text{sensor}}}{f_{\text{mm}}}, \quad H_{\text{gate}} = D \cdot \frac{H_{\text{sensor}}}{f_{\text{mm}}}$$
   This guarantees that $\frac{W_{\text{gate}}}{H_{\text{gate}}} \equiv \text{aspectRatio}$ at every focal length and target distance.
4. **Orthogonal Focus Plane Projection (`computeProjectedFocusDistanceM`)**:
   When `focus:` (or `focus_start` / `focus_end`) targets an entity or 3D coordinate $\vec{P}_{\text{focus}}$, the focus plane distance $d_{\text{focus}}$ is computed by orthogonally projecting $(\vec{P}_{\text{focus}} - \vec{E})$ onto the camera's unit forward sightline vector $\hat{F} = \frac{\vec{T} - \vec{E}}{\|\vec{T} - \vec{E}\|}$:
   $$d_{\text{focus}} = \max\!\left(0.4\text{m},\; (\vec{P}_{\text{focus}} - \vec{E}) \cdot \hat{F}\right)$$
   This eliminates the off-axis cosine overshoot ($r / \cos\alpha$) of Euclidean radial distance when focusing on subjects framed on the left or right thirds.
5. **Gaussian Thin-Lens Depth of Field & Hyperfocal Math (`computeDepthOfFieldLimits`, `dofEvaluator.ts`)**:
   Using standard 35mm full-frame Circle of Confusion $c = 0.03\text{mm}$ ($3.0 \times 10^{-5}\text{m}$), focal length $f = f_{\text{mm}} / 1000\text{m}$, and aperture $f$-stop $N \in [0.7, 64.0]$ (mapped from semantic presets `shallow` $\to f/2.8$, `medium` $\to f/5.6$, `deep` $\to \infty$ or numeric `aperture: 2.8` / `"f/2.8"`):
   $$H = \frac{f^2}{N \cdot c} + f, \qquad D_{\text{near}} = \frac{(H - f) \cdot d_{\text{focus}}}{H + d_{\text{focus}} - 2f}, \qquad D_{\text{far}} = \begin{cases} \frac{(H - f) \cdot d_{\text{focus}}}{H - d_{\text{focus}}} & d_{\text{focus}} < H \\ \infty & d_{\text{focus}} \ge H \end{cases}$$
   Rack focus (`focus_start` $\to$ `focus_end` or `focus_distance_start` $\to$ `focus_distance_end`) and aperture ramps (`aperture_start` $\to$ `aperture_end`) interpolate smoothly across the shot using the cue's easing curve $u = E(\tau)$, dynamically tracking moving actors on every frame. When omitted, `focusDistanceM` defaults to `pose.distance` and `dof.enabled` is `false`.

---

## 4. Stateless Functional Timeline & Forward Pose Chaining (`frameEngine.ts`, `trajectoryChain.ts`, `cameraTargetResolver.ts`, `shotPoseEvaluator.ts`)

### 4.1 Zero-Drift Stateless Evaluation (`Frame_t = f(t, score)`)
[`computeStageFrame(timestampSec, score, initialObserverPose)`](../src/core/frameEngine.ts) is a pure function:
- It never mutates external state or relies on previous frame deltas.
- Calling `computeStageFrame(5.0, score)` after playing forward ($0 \to 5$) or scrubbing backward ($10 \to 5$) produces the exact same 3D coordinates bit-for-bit.

### 4.2 Forward Pose Chaining ($P_0 \to P_1 \to \dots \to P_k$) & Track Normalization
In [`trajectoryChain.ts`](../src/core/trajectoryChain.ts), [`cameraTargetResolver.ts`](../src/core/cameraTargetResolver.ts), [`shotPoseEvaluator.ts`](../src/core/shotPoseEvaluator.ts), and the modular entity engine ([`entityEngine.ts`](../src/core/entityEngine.ts), [`entityBlockingEvaluator.ts`](../src/core/entityBlockingEvaluator.ts), [`entityLegacyEvaluator.ts`](../src/core/entityLegacyEvaluator.ts), [`entityKinematicUtils.ts`](../src/core/entityKinematicUtils.ts)):
- Each shot cuts cleanly (`0ms`) to its target anchor point (`spec.target`) unless explicit camera travel from another anchor is authored via `from:`. Both baseline `stage` cameras and shot cues resolve entity IDs/labels, multi-entity centroid arrays (`["detective", "witness"]`), stage presets (`"center"`, `"origin"`, `"stage"` $\to$ `[0, 1.0, 0]`), and explicit `[x, y, z]` coordinates. Targeting a character automatically anchors to eye level ($0.90 \times \text{height} \approx 1.575\text{m}$), while props anchor to center-volume ($0.50 \times \text{height}$). When an array of entity identifiers is provided (`TargetAnchor = string | string[] | Vec3`), `cameraTargetResolver.ts` calculates the pure 3D world-space centroid $\vec{T}_{\text{centroid}}(t) = \frac{1}{K}\sum_{i=1}^K \vec{A}_i(t)$, enabling dynamic two-shots, single-to-two-shot glides, and conversational group staging at 60fps without hardcoded coordinates. Centroid averaging applies symmetrically to `target`, `from`, `focus` (orthogonal focus plane projection), and entity `look_at`.
- Continuous camera parameters (`distance`, `pitch`, `yaw`) forward-chain from the preceding shot's terminal pose $P_{\text{end}}$ when unspecified, but immediately adopt newly specified angles (`pitch`, `pitch_start`, `yaw`, `yaw_start`) without cross-shot drift.
- **Option A Shot-Boundary Roll & Target-Offset Reset (Standard Cuts vs. Continuous Mode)**: In standard cut mode (`continuous: false`), both `roll` (Dutch angle) and `target_offset` (`[dx, dy, dz]` metric displacement from the base anchor) reset to their neutral baselines (`0°` and `[0, 0, 0]`) at shot boundaries whenever omitted. When `continuous: true` is active (at the score root or via cue-level `shots[k].continuous: true` / `observer_shots[k].continuous: true`) on a moving maneuver (`k >= 1`), `roll` and `target_offset` preserve and glide seamlessly from the preceding cue's terminal pose without snapping (see §4.4). To animate a Dutch tilt or target offset within a standard cut, authors specify `roll_start`/`roll_end` and `target_offset_start`/`target_offset_end`.
- For moving camera maneuvers, `sampleCueTrajectoryPoints()` in [`trajectoryChain.ts`](../src/core/trajectoryChain.ts) pre-samples $N = 32$ 3D world-space coordinates across the entire shot duration ($t_k \in [\text{startSec}, \text{endSec}]$) evaluating moving targets at each temporal step. Results are cached in a pure `WeakMap<StageScore, CueTrackCache>` so intra-shot frames yield referentially stable (`===`) trajectory point arrays without floating/drifting tracks or React memoization jitter. Trajectory lines are visibility-gated to the active shot ID to prevent 1-frame asynchronous ghosting across cut boundaries.
- **3-Tier Observer Camera Normalization**:
  1. **Tier 1 (Root `observer_shots:`)**: If `score.observerShots` is defined, the Observer Camera evaluates exclusively across these decoupled cues, allowing diorama viewport moves to span smoothly across film cuts. Like film coverage shots, `observer_shots:` supports `continuous: true` (at root or per cue) to auto-chain timestamps (`startSec = prevObsShot.endSec`) and preserve Dutch roll & framing offsets without snapping. During any time gap between observer shots, the camera holds the terminal resting pose $P_{\text{end}}$ of the last completed cue and forward-chains into the next cue.
  2. **Tier 2 (Per-Shot `shots[].observer_camera`)**: If root `observer_shots:` is omitted, the engine extracts observer cues from `shots:`. When the parent shot is continuous (`continuous: true`), the observer camera inherits unbroken roll and offset continuity.
  3. **Tier 3 (Baseline Default)**: If neither is defined, the camera holds steady at `stage.defaultObserverPose`.
- **3-Tier Entity Blocking Normalization (`entityEngine.ts`, `entityBlockingEvaluator.ts`, `entityLegacyEvaluator.ts`, `entityKinematicUtils.ts`)**:
  1. **Tier 1 (Root `blocking:`)**: If `score.blocking` is defined and non-empty, scene entities evaluate across these decoupled time windows (`startSec`, `endSec`) via a **Two-Pass Kinematic Evaluator** in `entityBlockingEvaluator.ts` (Pass 1 resolves all entity 3D positions, dimension sizes $\{w(t), h(t), d(t)\}$, and visibility chains; Pass 2 resolves facing rotations and $C^0$ continuous `look_at` handoffs). During un-cued gaps, entities hold their preceding terminal pose ($P_{\text{end}, k-1}$) and dimensions. Dimensions interpolate smoothly at 60fps with easing ($u = E(\tau)$), and individual dimension axes forward-chain independently across cues (modifying `height` retains previously overridden `width`/`depth`). While an entity is inside an active blocking cue with displacement $> 0.05\text{m}$, its floor trail (`trailPoints`) reflects the full 16-segment path of that blocking cue across any camera cuts (built via `buildGroundTrailPoints` in `entityKinematicUtils.ts`). When an actor cue declares `cut: true`, the actor manifests immediately at `position` at `startSec` (`startPos = position`), cross-stage sliding is prevented, the floor trail is suppressed (`trailPoints = []`), and auto-facing toward the old position is disabled. Per-shot `shots[k].entities.<id>.highlighted` and `note` overlay non-destructively on top.
  2. **Tier 2 (Per-Shot `shots[].entities`)**: If root `blocking:` is omitted, entity movements and dimension overrides chain across `shots:` via `entityLegacyEvaluator.ts`.
  3. **Tier 3 (Baseline Default)**: If neither provides movement, entities hold their initial pose and base dimensions from `entities:`.
- **Dynamic Look-At Anchor & Thin-Lens Focus Tracking**:
  When an entity changes elevation or crouches during a blocking cue ($h(t)$), its intrinsic look-at anchor $\vec{A}_i(t) = (x_i(t), y_i(t) + \text{ratio} \cdot h(t), z_i(t))$ updates dynamically on every frame. Any camera targeting or focusing on entity $i$ smoothly tracks changing posture and elevation without visual lag. Feet and prop bases remain strictly pinned to floor elevation $Y = 0$.
- **Rigid Anatomical Proportions & Telescoping Torso**:
  While prop volumes scale uniformly along $Y$, character mannequins enforce strict anatomical preservation: the head sphere ($r = 0.14\text{m}$) and eye-visor cone maintain an un-squashed $Y \equiv 1.0$ aspect ratio at $Y_{\text{head}} = h(t) - 0.16\text{m}$, and the shoulder cross-bar retains $0.08\text{m}$ thickness at $Y_{\text{shoulder}} = h(t) - 0.40\text{m}$. Only the lower capsule torso column telescopes dynamically ($s_{\text{torso}, y} = \frac{h(t) - 0.35}{1.40}$) to bridge the distance from the floor, preserving dignified architectural silhouettes when sitting, kneeling, or crouching.
- **Shape-Matched Ground Footprint**:
  Box props render an oriented rectangular polygon footprint $\operatorname{OBB}(\vec{p}_{xz}, w, d, \psi)$ matching the box dimensions and rotation in both 3D diorama and 2D SVG minimap. Non-uniform circular props and mannequins render an elliptical footprint ($r_x = w/2, r_z = d/2$) when $w \ne d$, and a standard circular footprint when $w = d$.

### 4.3 Supported Easing Curves & Trajectory Maneuvers (`maneuvers.ts`)
- **9 Easing Curves (`CameraEasing`)**: `smooth` (raised cosine default), `linear`, `ease-in`, `ease-out`, `expo`, `pop`, `accel`, `deccel`, `cruise`.
- **11 Trajectory Maneuvers (`CameraManeuver`)**:
  - `cut`: Instantaneous jump to destination pose.
  - `dolly` / `straight`: Direct 3D linear interpolation of target, distance, pitch, yaw, and focal length.
  - `arc` / `swoop`: 3D quadratic Bezier curve with $+Y$ elevation lift and mid-flight `breathe` distance pullback (default `1.12`).
  - `orbit` / `sweep`: Continuous azimuthal turntable revolution (`cw` or `ccw`).
  - `spiral`: Helical zoom and elevation orbit.
  - `dive`: Fast perigee dip toward subject.
  - `recoil`: Immediate shockwave impulse kick (default `breathe: 1.25`).
  - `spline`: Multi-waypoint Catmull-Rom spline with automatic yaw unwrapping.

### 4.4 Opt-In Contiguous Shot Chaining (`continuous: true`) & YAML Order Priority
- **Contiguous Timeline Chaining**: When `continuous: true` is set at the score root (or directly on a cue via `shots[k].continuous: true`, `observer_shots[k].continuous: true`, or `blocking[k].continuous: true`), any cue in `shots:`, `observer_shots:`, or `blocking:` omitting `start` automatically inherits the previous cue's `end` timestamp (`startSec = prev.endSec`), while opening cues default to `0.0`. Explicit `start` declarations always take precedence to allow deliberate gaps. Cue-level `continuous: false` explicitly overrides root `continuous: true` to force an independent cut setup or scene beat.
- **Physical Camera Rig Chaining**: For any continuous shot $k \ge 1$ with a moving maneuver (`arc`, `dolly`, `swoop`, `orbit`, etc.), the camera acts as an unbroken physical steadicam/technocrane rig:
  - Omitting `distance_start`, `pitch_start`, or `yaw_start` causes the camera to start at $P_{\text{prev}}$ (the previous shot's terminal pose) and smoothly travel to the newly authored destination (`distance`, `pitch`, `yaw`).
  - **Unbroken Dutch Roll & Target Offset Continuity**: Unlike standard cuts which reset to neutral baselines ($0^\circ$ and $\vec{0}$), continuous mode preserves `roll` and `target_offset`. If omitted, they persist from the preceding terminal pose; if specified, they smoothly glide from the previous value to the authored value across the shot.
  - Opening shot (`k = 0`) values establish the baseline framing. Instantaneous cuts (`maneuver: cut`) snap directly to the authored values.
- **Discrete Optical Prime Lenses**: In accordance with cinema prime lens grammar, specifying `lens: 50mm` mounts that lens for the shot and holds it steady (no unwanted slow zoom). Omitting `lens` preserves the mounted lens from the previous shot. Dynamic zooming requires explicit `lens_start` and `lens_end`.
- **Explicit Look-At Retargeting**: Changing `target` without `from:` cuts the look-at anchor immediately at the shot boundary (`0ms`), preventing unintended diagonal room drifting. Specifying `from:` smoothly tracks from `from` to `target`.
- **Decoupled Observer & Blocking Timing**: In `observer_shots:` and `blocking:`, cues auto-chain timestamps when `continuous: true` is active (auto-chaining sequentially from `prevBlockEndSec` with monotonic advancement via `Math.max`), while explicit `start:` declarations are always preserved to allow deliberate diorama stationary hold periods across film cuts. Blocking cues also support first-class `duration:` / `dur:` syntax (`endSec = startSec + duration`).
- **YAML Declaration Order Overlap Priority**: When multiple shots or blocking cues overlap in time, the later item in the YAML structure takes precedence across `frameEngine` (`activeShot`), `trajectoryChain` (camera track), and `entityEngine` (character kinematics).
- **Non-Blocking Typo Warnings**: In non-continuous mode (`continuous: false`), omitting `start` on `shots[k > 0]`, `observer_shots[k > 0]`, or `blocking[k > 0]` surfaces an informative warning in the YAML Drawer rather than crashing.

---

## 5. Declarative YAML Choreography Schema (`scoreParser.ts`, `scorePrimitives.ts`, `cameraCueParser.ts`)

Scores are authored in human-readable YAML (see primary directorial study [`src/scores/studies/vector_field.yaml`](../src/scores/studies/vector_field.yaml) and synthetic testbeds in [`src/scores/blueprints/`](../src/scores/blueprints/)):

```yaml
version: "1.0"
id: "scene-id"
title: "Scene Title"
subtitle: "Optional Subtitle"
video: "procedural://demo-blueprint" # Or "/media/clip.mp4" or "https://youtu.be/..."
aspect_ratio: "16:9"                 # "16:9", "2.39:1", "4:3", or numeric float
duration: 10.0                       # Total duration in seconds
offset: 0.0                          # Optional A/V sync offset in seconds

stage:
  width: 10                          # Stage width in meters
  depth: 10                          # Stage depth in meters
  grid_step: 1                       # Major grid spacing in meters
  observer_camera:
    target: [0, 1.0, 0]              # Or "center", "origin", "stage"
    distance: 7.5                    # Clamped to [0.4, 100.0]m
    pitch: 26                        # Degrees
    yaw: 38                          # Degrees
    lens: 35mm
  stage_camera:
    target: "protagonist"            # Entity ID, "center", or [x, y, z]
    distance: 3.2
    pitch: 6
    yaw: -25
    lens: 50mm

entities:
  - id: "protagonist"
    label: "Subject A (Lead)"
    kind: "character"                # "character" (actor/person) | "prop" (set/furniture/item/object) | "marker" (spike/mark)
    style: "mannequin"               # "mannequin" (default) | "edges" | "silhouette" | "wireframe"
    position: [-0.9, 0, 0]           # Meters (Y=0 is floor)
    rotation: 90                     # Facing angle in degrees
    color: "#38bdf8"
  - id: "ball"
    label: "Soccer Ball"
    kind: "prop"                     # Or "item", "object"
    shape: "sphere"                  # "box" (default) | "sphere" | "cylinder" | "capsule"
    style: "edges"                   # "edges" (default) | "glass" | "solid" | "wireframe"
    position: [0, 0, 0]
    radius: 0.35                     # Auto-derives height = 2 * radius (0.70m)
    color: "#f59e0b"
  - id: "start-mark"
    label: "Actor Spike"
    kind: "marker"                   # Or "spike", "mark"
    shape: "x"                       # "x" (default) | "t" | "circle" | "puck"
    style: "tape"                    # "tape" (default) | "glow" | "beacon"
    position: [-0.9, 0, 0]
    color: "#fb7185"

# Optional Decoupled Entity Blocking Timeline (spans continuously across film cuts)
blocking:
  - id: "protagonist-cross"
    entity: "protagonist"
    start: 0.0
    end: 10.0
    position: [0.5, 0, 0]
    look_at: "interlocutor"
    easing: "smooth"

shots:
  - id: "shot-1"
    shot: 1
    label: "Shot 01 · Slow Arc"
    description: "Brief staging note shown in the top-left HUD."
    start: 0.0
    end: 10.0
    stage_camera:
      from: "protagonist"
      target: "protagonist"
      maneuver: "arc"
      easing: "smooth"
      distance_start: 3.4
      distance_end: 2.6
      pitch_start: 8
      pitch_end: 4
      yaw_start: -20
      yaw_end: 25
      lens: 50mm
      show_path: true
    observer_camera:
      target: [0, 1.0, 0]
      maneuver: "orbit"
      easing: "smooth"
      distance: 7.5
      pitch: 26
      yaw_start: 35
      yaw_end: 55
      lens: 35mm
    entities:
      protagonist:
        position: [-0.9, 0, 0]       # Optional target position by end of shot (when root blocking: is omitted)
        look_at: "interlocutor"      # Dynamic facing toward another entity or [x, y, z]
        highlighted: true

# Optional Decoupled Viewport Observer Timeline (takes complete precedence over per-shot observer_camera)
observer_shots:
  - id: "diorama-orbit"
    start: 0.0
    end: 10.0
    target: "center"
    maneuver: "orbit"
    easing: "smooth"
    distance: 7.5
    pitch: 26
    yaw_start: 35
    yaw_end: 55
    lens: 35mm
```

---

## 6. Client Storage Persistence & Video Authority

### 6.1 Three-Tier Score Taxonomy & Declarative Manifest (`src/scores/catalog.yaml`, `scoreCatalog.ts`)
StageFlow categorizes scores into a clean 3-tier provenance taxonomy (`ScoreCategory = 'study' | 'blueprint' | 'custom'` in [`src/core/types.ts`](../src/core/types.ts)):
1. **Directorial Scene Studies (`'study'`)**: Authentic auteur scene studies authored by Taruma Sakti in [`src/scores/studies/`](../src/scores/studies/). Defaults on application launch to *Vector Field* ([`vector_field.yaml`](../src/scores/studies/vector_field.yaml), canonical ID: `'vector-field'`).
2. **Bundled Blueprints (`'blueprint'`)**: Synthetic educational camera-blocking presets and testbeds in [`src/scores/blueprints/`](../src/scores/blueprints/) (BP 01–BP 07: `'demo'`, `'blueprint-02'` through `'blueprint-07'`).
3. **Custom Projects (`'custom'`)**: User-authored, dropped, or URL-imported projects persisted in browser IndexedDB.

> 📖 **Master Score Catalog**: For the complete directory of built-in scene studies and blueprints with synopses, runtimes, camera moves, and optical packages, see [**`docs/SCORE_CATALOG.md`**](SCORE_CATALOG.md).

**Declarative Manifest Architecture**: The built-in score catalog is driven declaratively by [`src/scores/catalog.yaml`](../src/scores/catalog.yaml). Authors add, remove, reorder, or rename scores and aliases directly in YAML without writing TypeScript. [`scoreCatalog.ts`](../src/core/scoreCatalog.ts) uses Vite's `import.meta.glob` to eagerly discover and map all `.yaml` files, parse them at build/startup, and expose `INITIAL_CATALOG_ITEMS`. `findCatalogItem(idOrAlias)` resolves scores against both canonical slugs and registered backwards-compatible aliases.

### 6.2 Score Draft Persistence & URL Ingestion (`src/core/storage/scoreDb.ts`, `scoreUrlLoader.ts`)
Live YAML edits and custom imported score files are persisted to an IndexedDB object store (`'stageflow-db'` $\to$ `'scores'`) using the [`idb`](https://github.com/jakearchibald/idb) promise library:
- **Record Structure**: `{ id, title, subtitle, rawYaml, isCustom, updatedAt, contentHash?, originalContentHash?, sourceUrl?, sourceFileName? }`.
- **Auto-save**: Debounced at `350ms` on every valid YAML edit (and `150ms` live sync in CodeMirror 6 studio).
- **Hydration & Deferred Invalidation**: On application mount, initial state preserves stored scene pointers without premature fallback. When IndexedDB hydration finishes, it reconciles the active scene pointer against the fully merged catalog.
- **Deep Linking Query Parameters (`?score=`, `?scene=`, `?url=`)**:
  - `?score=<id>`: Canonical parameter for built-in scores (with `?scene=` accepted as a backwards-compatible alias). Unknown IDs fall back to default scene with a warning toast.
  - `?url=<http_or_https_link>`: Remote YAML score loader with confirmation modal on first import.
  - **Consume & Clear**: Both parameters clean up the browser address bar immediately upon mount via `window.history.replaceState` to prevent re-fetching on refresh (`F5`).
- **Confirmed Reset**: Resetting a score deletes its IndexedDB record via `deleteStoredScore()` and reverts state to the bundled YAML.

### 6.3 Pure Layer 1 YAML Manipulation & Unified Content-Hash Matcher (`src/core/scoreYamlUtils.ts`)
Decoupled Layer 1 utility module (`src/core/scoreYamlUtils.ts`) providing pure string operations with zero React/DOM dependencies:
- `normalizeYamlForComparison(yaml)`: Unifies CRLF/CR to LF (`\n`), strips the top-level `id:` line, and trims whitespace.
- `computeYamlContentHash(yaml)`: Computes a fast, deterministic 32-bit FNV-1a content fingerprint (`fnv1a-xxxxxxxx`) over normalized YAML text.
- `findDuplicateOrConflictingCustomScore(candidate, existingCustomItems)`: Unified matcher for both remote URLs and local dropped files:
  - **Identical Match (`kind: 'identical'`)**: Activates existing project immediately with **zero duplicate creation and zero modal dialog**.
  - **Identity Conflict (`kind: 'conflict'`)**: Matches on `sourceUrl`, `sourceFileName`, or YAML `id` with differing content, prompting the user with a conflict modal (**Keep Existing**, **Overwrite**, or **Save as New Copy**).
  - **New Project (`kind: 'new'`)**: Saves as a fresh Custom Project in IndexedDB.
- `updateScoreYamlId(yaml, newId)`: Replaces or prepends score `id` using clean quote-aware regex.
- `updateScoreYamlTitle(yaml, newTitle)`: Modifies or inserts `title` metadata.
- `generateCustomScoreId(baseSlug)`: Creates collision-free unique slugs (`custom-<slug>-<timestamp>`).
- `downloadYamlBlob(filename, yamlContent)`: Triggers browser file download.

### 6.4 Structured Parser Diagnostics (`scoreParser.ts`, `types.ts`)
`parseStageScore(rawYaml)` produces a non-breaking `ParseScoreResult`:
```typescript
export interface ScoreDiagnostic {
  line: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface ParseScoreResult {
  score: StageScore | null;
  error: string | null;
  warning?: string | null;
  diagnostics?: ScoreDiagnostic[];
}
```
Extracts exact line and column numbers from YAML AST errors (`YAMLParseError.linePos`) to power the 1-click **`[ Jump ]`** button in the CodeMirror 6 YAML Studio banner.

### 6.5 Video Format Support & YAML SSOT Authority
The score parser supports both concise string syntax and structured object syntax for video:
```yaml
# Concise string syntax
video: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Or structured mapping syntax
video:
  src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  aspect_ratio: "16:9"
```
**YAML as Single Source of Truth**: Whenever the YAML score specifies or changes a video URL, any active in-memory dropped video override is automatically cleared so the score's video is played. Local dropped video files (`.mp4`, `.webm`) are maintained strictly in temporary session memory and are never written to `IndexedDB` or `localStorage`.
