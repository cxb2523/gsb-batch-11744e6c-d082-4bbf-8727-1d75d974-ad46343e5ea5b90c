# 3D Blueprint Diorama & 2D Workspace UI Specifications

This document is the authoritative technical specification for **Layer 4 (`src/stage/`)** and **Layer 5 (`src/ui/`)** in **StageFlow**. It is governed by [`AGENTS.md`](../AGENTS.md). For typography, color tokens, CSS variables, and theme palettes, see the companion Single Source of Truth: [**`docs/VISUAL_DESIGN_SYSTEM.md`**](VISUAL_DESIGN_SYSTEM.md).

---

## 1. Visual Aesthetic: Minimalist Blueprint / Architectural Schematic

StageFlow's 3D stage is engineered for maximum spatial legibility and zero visual clutter:
- **Studio Void Background & Fog**: Deep obsidian blueprint void with subtle depth fog (`45m` to `160m`), adapting dynamically via the diorama theme palette ([`src/stage/dioramaTheme.ts`](../src/stage/dioramaTheme.ts)).
- **Dual-Cadence Metric Floor Grid (`BlueprintFloorGrid.tsx`)**:
  - Renders a precision ground plane at $Y = 0$ with `1.0m` primary section lines, `0.25m` minor sub-grid lines, an active stage perimeter frame, center $X/Z$ axis crosshairs, an origin reticle at `(0, 0, 0)`, and cardinal stage labels (`+Z · Downstage / Front`, `-Z · Upstage / Back`). Grid line colors adapt dynamically to the diorama stage theme (see [`VISUAL_DESIGN_SYSTEM.md`](VISUAL_DESIGN_SYSTEM.md#5-decoupled-3d-diorama-stage-palette-srcstagedioramathemets)).
  - Cardinal labels are rendered as native WebGL SDF meshes (`Text` from `@react-three/drei`) lying flat on the perimeter floor plane ($Y = 0.005\text{m}$, rotation $-90^\circ$ around $X$) matching architectural blueprint convention; participating 100% in the WebGL Z-buffer so 3D camera cone/frustum lines and actors render naturally in front of the floor markings; automatically unmounted in `Stage Cam POV` (`cameraMode === 'stage-pov'`) to keep the viewfinder composition 100% clean.

---

## 2. Dual-Camera Architecture & Free-Orbit Handover (`src/stage/`)

Every frame evaluates two distinct camera roles inside the 3D diorama:

### 2.1 The Observer Camera & `OrbitControls` Handover (`ObserverCameraRig.tsx`)
Controls the main Three.js `PerspectiveCamera` through which the user views the diorama. Supports three instant-cut POV modes (`CameraViewMode`):

1. **`'scripted'` (Scripted Observer View — Default)**:
   - **While Playing (`isPlaying === true`)**: `OrbitControls` user input is disabled; the viewport camera is driven at 60fps by `frame.observerCamera.transform`.
   - **When Paused (`isPlaying === false`)**: The scripted lock automatically releases and `OrbitControls` is enabled, allowing the user to freely orbit, pan, and zoom around the frozen 3D setup from any angle.
   - **Scrubbing While Paused (`seekOccurred`)**: Whenever the user drags the timeline scrubber, clicks a shot chip, or steps a frame (`[` / `]`) while paused, `lastManualSeekIdRef` increments and the viewport camera snaps cleanly to the scrubbed timestamp's pose before returning to free-orbit control.
2. **`'free'` (Free Orbit View)**:
   - Keeps `OrbitControls` unlocked at all times—even while the video is actively playing.
   - **Dynamic Floor-Clamped 3D Orbit (`computeFloorClampedMaxPolarAngle`)**: Unlike legacy implementations that capped `maxPolarAngle` at a static $88.2^\circ$ relative to the subject's chest, the viewport dynamically computes the maximum allowable polar angle on every frame based on target elevation ($Y_{\text{target}}$) and radial distance ($R$), clamping the minimum camera elevation to $Y_{\text{cam}} \ge 0.05\text{m}$.
     - **Full 360° Aerial Orbit**: For elevated or flying entities (where $Y_{\text{target}} - R \ge 0.05\text{m}$), polar angle unlocks up to $176.4^\circ$ ($0.98\pi$), enabling complete 360° vertical inspection from underneath without bottom-pole gimbal lock.
     - **Floor-Level Directorial Worm's-Eye**: For ground actors, the camera can orbit down to knee and floor level ($Y = 0.05\text{m}$) and tilt upwards to inspect low-angle compositions, stopping smoothly at the floor plane without clipping through the stage grid into the underground void.
     - **Underground Pan Protection**: Both camera elevation and orbit target elevation are hard-clamped to $Y \ge 0.05\text{m}$ during mouse panning.
   - **Active Target Pivot Preservation**: Directorial camera preset snaps (**Top / Iso / Front / Side**) preserve the user's active look-at target or active character anchor (Blender Numpad 7/1/3 style), falling back to stage chest level `[0, 1.1, 0]` rather than jumping the target vertically or colliding with floor clearance bounds. Clicking a preset immediately flushes the Telemetry Capsule UI without throttling delay.
3. **`'stage-pov'` (Stage Camera POV)**:
   - Locks the viewport camera directly to `frame.stageCamera.transform` (`position`, `target`, `fovDeg`) with analytical vertical FOV compensation (`computeViewfinderCanvasFovDeg`), guaranteeing that the 3D scene inside the contained active film gate matches the lens focal length across any split workspace width with zero distortion.
   - Automatically activates the Director's Optical Viewfinder Overlay (`StageCamViewfinderOverlay.tsx`), featuring an 82% obsidian Look-Around veil outside the gate, active framing brackets, and toggleable composition guides.

### 2.2 Fluid Adaptive Diorama Framing (`computeAdaptiveDioramaFovDeg` — Approach A)
To eliminate stage clipping in the resizable split workspace without forcing black bars or letterboxing:
- When viewing the diorama in `'scripted'` or `'free'` mode, `ObserverCameraRig.tsx` dynamically evaluates `computeAdaptiveDioramaFovDeg(baseFov, width, height, baselineAspect)`.
- In wide viewports ($\ge 16:9$), the standard vertical FOV is preserved and horizontal view expands naturally.
- In narrow viewports ($< 16:9$, such as 50/50 split or mobile), the vertical FOV expands analytically:
  $$v\text{FOV}_{\text{adapted}} = 2 \times \arctan\left(\frac{\text{baselineAspect}}{\text{currentAspect}} \times \tan\left(\frac{v\text{FOV}_{\text{base}}}{2}\right)\right)$$
- Guarantees that whatever stage width is visible in full 16:9 recording is also completely visible in the interactive split workspace, eliminating the authoring trap where split-window adjustments look too distant when recorded.

> [!IMPORTANT]
> **Instant Cut Invariant (0ms Transition)**: Switching between `'scripted'`, `'free'`, and `'stage-pov'` applies an instantaneous cut on the very next animation frame without slerp/lerp transition lag.

### 2.3 The Illustrative Stage Camera Rig (`StageCameraRig.tsx`)
Visualizes the physical camera filming the shot inside the 3D diorama:
- **Camera Chassis & Lens Barrel**: Positioned at `stageCamera.transform.position` and oriented via `lookAt(target)`. Automatically hidden when `cameraMode === 'stage-pov'` so the 3D chassis does not occlude the viewport lens. The chassis, lens barrel, and frustum pyramid bank around the optical sightline inside a dedicated rolled group (`rotation.z = -pose.roll`), while the floating monospace label badge (`CAM · 50mm · DOLLY`) remains upright in unrolled space.
  - **Elevated Badge & Blueprint Leader Stem**: To prevent badge collisions in over-the-shoulder (OTS) shots when the camera is placed right behind an actor's shoulder, the `CAM` badge is elevated to `Y = +0.72m` above the chassis nodal point (hovering at $Y \approx 2.22\text{m}$ for eye-level cameras, safely above character head badges at $\sim 1.98\text{m}$–$2.08\text{m}$), anchored to the chassis top by a subtle vertical dashed blueprint leader stem (`<Line>` from $Y = 0.12\text{m}$ to $0.58\text{m}$).
- **Rectangular Cinematic Gate Frustum**:
  - Projects 4 corner pyramid rays from the lens nodal point `(0, 0, 0)` to the 4 corners of the rectangular focus gate at `frustumDepth`, sized via `computeFrustumGateDimensions(focalLengthMm, frustumDepth, aspectRatio)`.
  - Renders a luminous **Focus Plane Frame** with subtle rule-of-thirds horizon guides, translucent glass fill, and a target center crosshair ring that slides dynamically along the optical axis to `stageCamera.dof.focusDistanceM`.
- **3D Depth-of-Field Brackets & Off-Axis Focus Tether (`StageCameraFocusRig.tsx`)**:
  - **Near & Far DoF Limit Brackets (`StageCameraDofBrackets`)**: When `stageCamera.dof.enabled` is true (`shallow` / `medium` or explicit `aperture`), renders dashed rectangular boundary frames at $z = \max(0.15\text{m}, D_{\text{near}})$ and $z = \min(D_{\text{far}}, \max(d, d_{\text{focus}}) + 6.0\text{m})$ (`OPTICS_DOF_DEFAULTS.MAX_VISUAL_FAR_EXTENSION_M = 6.0`), visualizing the exact in-focus depth zone as it expands with wider lenses (`24mm`) or contracts with telephoto lenses (`85mm`).
  - **Off-Axis Focus Target Tether (`StageCameraFocusTether`)**: When `focus:` targets an entity or 3D point displaced from the camera's look-at `target` ($\ge 0.05\text{m}$), renders an emerald (`#10b981`) beacon and dashed tether line from the focus plane center to the focused subject.
- **Opt-In Single-Pass Stage Cam DoF Blur (`StageCamDofEffect.tsx`)**:
  - When enabled in `Stage Cam POV` or the `StageCamMonitorCanvas` (via the **`[ Blur ]`** button, hotkey **`B`**, or score `optics: { dof_blur: true }`), renders the scene into a single-pass WebGL2 `WebGLRenderTarget` with a hardware `THREE.DepthTexture` (`UnsignedInt248Type`) and applies a 24-tap golden-angle spiral Vogel disk bokeh shader driven by the exact Gaussian thin-lens Circle of Confusion equation $\beta(z)$. Defaults to crisp rendering (`false`) for mobile/tablet GPU safety.
- **3D Trajectory Path Curve**:
  - When moving (`maneuver !== 'cut'` and `showPath === true`), renders a dashed 3D curve along `stageCamera.trajectoryPoints` with start (sphere) and end (octahedron) waypoint beacons. Automatically hidden when `cameraMode === 'stage-pov'` so the physical track and waypoint beacons do not occlude the camera lens during forward/dolly moves. Trajectory coordinates are referentially stable across frames of the active shot via pure `WeakMap` score caching, preventing 10Hz React memoization jitter and maintaining a stationary, physically accurate track in world space.
- **3D Target Offset Tether & Anchor Beacon (`StageCameraOffsetTether.tsx`)**:
  - When a shot has an active world-space `target_offset` ($\ge 0.01\text{m}$), renders a cyan anchor beacon at the subject's un-offset look anchor (`baseTarget`) and a subtle dashed blueprint tether line connecting `baseTarget -> target`, making negative space composition, lead room, and headroom bias immediately readable in 3D.
  - Automatically hidden when `target_offset` magnitude is zero or when viewing through `'stage-pov'`.
- **3D Blueprint Camera Rig Mounts (`StageCameraRigMount.tsx`)**:
  - Positioned at floor level $Y=0$ beneath the camera eye position $\vec{E}(t)$, tracking the camera's spatial coordinates imperatively in R3F `useFrame`.
  - When `rig.type === 'tripod'`: Renders a 3-legged blueprint tripod stand with tubular splayed legs ($0.52\text{m}$ base spread), circular floor pucks, and a vertical telescoping column rising to the camera chassis mount.
  - When `rig.type === 'track'` or `'spline_track'`: Renders physical twin steel rails ($0.42\text{m}$ gauge) with orthogonal sleepers spaced every $0.5\text{m}$ along the track line or Catmull-Rom spline curve, plus a low-profile 4-wheeled dolly cart riding the rails with an upright column supporting the camera chassis.
  - Opt-in visual suppression via `show_rig: false` (per cue) or `stage: { show_rigs: false }` (global), or in `'stage-pov'` viewfinder mode.

### 2.4 Shared 3D Scene & Stage Cam Monitor Viewport (`BlueprintStageScene.tsx`, `StageCamMonitorCanvas.tsx`)
To enforce strict DRY principles and visual parity:
- **`BlueprintStageScene.tsx`**: Renders studio lighting, the metric floor grid (`BlueprintFloorGrid.tsx`), and directional mannequins (`DirectionalMannequin.tsx`), shared identically by both the 3D Diorama and the Stage Cam Viewport.
- **`StageCamMonitorCanvas.tsx` & `StageCamViewRig.tsx`**: When `score.video` uses `procedural://` (or when viewed in the left-column subpanel), mounts an R3F `<Canvas>` locked directly to `frame.stageCamera.transform` (`position`, `target`, `fovDeg`), overlaid with a director's optical monitor HUD (90% safe-action frame, rule-of-thirds grid guides, optical reticle, live optical telemetry, and single-pass DoF blur simulation). Features a streamlined `● CAM | [lens]mm · [f-stop]` status header with `@container` responsive rules (`hidden @md:flex`) that cleanly collapse secondary `FOV · ROLL` telemetry on narrow split widths ($< 448\text{px}$) to prevent line-wrapping and overlap with the `[BLUR ON/OFF]` control. When video playback uses local `.mp4` or YouTube and the subpanel is hidden, the 3D canvas is unmounted (0% GPU overhead).

### 2.5 Dual-Tier State Gating on Camera & Blocking Cuts (Atomic Handover)
To eliminate 1-frame asynchronous ghosting between 60fps WebGL transforms (`frameRef.current`) and batched React 19 UI state (`uiFrame`):
- All 3D stage components ([`StageCameraRig.tsx`](../src/stage/StageCameraRig.tsx), [`ObserverCameraRig.tsx`](../src/stage/ObserverCameraRig.tsx), [`StageCamViewRig.tsx`](../src/stage/StageCamViewRig.tsx), and [`DirectionalMannequin.tsx`](../src/stage/DirectionalMannequin.tsx)) implement **Gated Frame Cuts**.
- Camera rigs gate on `shotId` (`liveFrame.stageCamera.shotId !== uiFrame.stageCamera.shotId`), while [`DirectionalMannequin.tsx`](../src/stage/DirectionalMannequin.tsx) gates on each entity's active `cueId` (`liveEntity.cueId !== initialState.cueId`). When an entity walks continuously across camera cuts via root `blocking:`, its `cueId` remains unchanged across the cut, ensuring zero frame freeze while still synchronizing instantaneous cue boundary transitions (`useStageFrameLoop.ts` flushes `uiSnapshot` immediately on both `shotChanged` and `entityCueChanged`).
- On the subsequent frame, when React re-renders with the new shot or blocking cue's props, the 3D position, rectangular frustum gate, floor movement trail, lens badge text, and 2D HUD switch **atomically on the exact same frame** with zero intermediate ghosting.

---

## 3. Directional Minimalist Mannequins & Props (`DirectionalMannequin.tsx`)

Scene entities (`character`, `prop`, `marker`) are rendered with unambiguous orientation and blocking cues:
- **Character Mannequin (`kind === 'character'`)**:
  - Stylized geometric figure supporting four presentation styles via `style:`:
    - `mannequin` *(default)*: Semi-transparent capsule torso column (`height = 1.75m`), shoulder cross-bar, and head sphere.
    - `edges`: Hologram/CAD wire-contour look with `<Edges threshold={20} color={color} />` and soft 20% opacity.
    - `silhouette`: High-contrast dark matte body (`#0f172a`) with illuminated pure white eye visor cone, ideal for optical framing and composition studies.
    - `wireframe`: Pure blueprint wireframe mesh cage.
  - **Directional Eye-Visor Wedge & Ground Chevron**: A white visor cone on the front of the head (`+Z` local forward) paired with a ground chevron arrow pointing along `rotationYRad`, making character gaze and body facing immediately readable from overhead or side angles.
  - **Ground Contact Ring**: Circular base disc at `y = 0.012m` that expands and brightens when `highlighted === true`.
- **Geometric Props (`kind === 'prop'`)**:
  - Parametric 3D solid resting at floor level ($Y = 0$), centered vertically at $h/2$, supporting four geometric primitives via `shape:` (`box`, `sphere`, `cylinder`, `capsule`) and four presentation styles via `style:`:
    - `edges` *(default)*: Soft 20% transparent mass with crisp Drei `<Edges threshold={15} color={color} />` contour lines.
    - `glass`: Translucent 45% volumetric mass without outline edges.
    - `solid`: Dense 88% opaque solid architectural mass with specular highlights.
    - `wireframe`: Blueprint wireframe lattice cage.
- **3D Spatial Dimension Scaling & Shape-Matched Footprints**:
  - **Hardware 60fps Scale Multipliers**: Scaled imperatively in `useFrame`, enabling dynamic 60fps dimension transformations (such as actor crouching or prop expansion) without React re-renders or GPU geometry re-allocations.
  - **Rigid Anatomical Head & Shoulder Protection for Mannequins**: Unlike props which scale uniformly across their entire volume, character mannequins enforce strict anatomical preservation: the head sphere ($r = 0.14\text{m}$) and eye visor cone preserve $Y \equiv 1.0$ aspect ratio at all times (dynamically repositioned at $Y = H(t) - 0.16\text{m}$), and the shoulder cross-bar preserves $Y \equiv 1.0$ thickness ($0.08\text{m}$) at $Y = H(t) - 0.40\text{m}$ while scaling laterally with character width ($s_x$). Only the torso column telescopes vertically ($s_{\text{torso}, y} = \frac{H(t) - 0.35}{1.40}$), completely eliminating the "pancake-head" or squished-shoulder distortion when actors sit, duck, or crouch.
  - **Ground-Pinned Base Invariant ($Y = 0$)**: Scaling in $Y$ extends exclusively upward ($y_{\text{base}} = y_{\text{pos}}$); feet and prop bottoms stay anchored to the stage floor.
  - **Badge Scale Isolation**: The floating `<StageBillboardLabel>` resides in an unscaled parent group (`labelGroupRef`) positioned dynamically at $Y = y_{\text{pos}} + h \cdot s_y + 0.28\text{m}$, preventing HUD text from squashing or stretching under non-uniform scaling.
  - **Shape-Matched Ground Footprints**:
    - Box props render an oriented rectangular polygon footprint (`boxFootprintGeometry`) matching the prop's width and depth dimensions.
    - Circular props and mannequins render an elliptical footprint ($r_x = w/2, r_z = d/2$) when $w \ne d$, and a standard circular ring when $w = d$.
- **Stage Floor Gaffer Tape Markers (`kind === 'marker'`)**:
  - Authentic theatrical/cinematic floor spike marks rendered flat at $Y = 0.005\text{m}$, supporting four geometric shapes via `shape:` (`x`, `t`, `circle`, `puck`) and three presentation styles via `style:`:
    - `tape` *(default)*: Clean flat floor spike mark.
    - `glow`: Flat floor spike mark paired with an illuminated soft emissive halo disc at $Y = 0.002\text{m}$.
    - `beacon`: Floor mark paired with an elevated glowing beacon pin ($0.44\text{m}$) and illuminated sphere tip.
- **Dynamic Floor Movement Trail**:
  - When an entity moves during the active blocking cue or shot (`trailPoints.length >= 2`), renders a dashed floor trajectory curve tracing their full active movement path across the stage (persisting across camera cuts when driven by decoupled `blocking:`, and clearing during stationary holds/gaps).
- **Floating Identity Badges & Distance-Collapsed Glowing Dots (`StageBillboardLabel.tsx`, `labelLodMath.ts`)**:
  - Uses `@react-three/drei` `<Html center>` with **Clamped Perspective Scaling** ($1.55\times$ near to $0.72\times$ far, anchored at $12\text{m}$) and prominent HUD-grade typography (`rounded-full bg-slate-950/90 backdrop-blur-md px-3.5 py-1.5 text-sm font-mono border border-slate-700/80 shadow-2xl`) above each mannequin (`Subject A`) and above the Stage Camera (`CAM · 50mm · ARC`). Perspective transforms and opacity mutate imperatively in `useFrame` directly on the inner DOM element styles (`pillRef` and `dotRef`) with zero React re-renders, delivering crisp 60fps/144fps responsiveness.
  - **Distance-Based Semantic Dot Collapse (LOD)**:
    - **Scene Entities (`character`, `prop`, `marker`)**: Display full pill badges up to $24\text{m}$, smoothly cross-fade between $24\text{m}$ and $28\text{m}$, and collapse into **minimal $8\text{px}$–$10\text{px}$ glowing accent dots** (styled in the entity's theme color with soft glow) at distances $\ge 28\text{m}$. Eliminates center cluster blobs during high crane pullbacks ($D = 46\text{m}$) and zenith holds ($D = 98\text{m}$) while preserving precise spatial orientation.
    - **Stage Camera Telemetry Persistence**: As the master directorial tool, the Stage Camera badge persists as a readable telemetry pill through crane pullbacks up to $52\text{m}$, cross-fades between $52\text{m}$ and $60\text{m}$, and collapses to an accent dot only at extreme zenith distances ($\ge 60\text{m}$).
    - **Calm Distant State**: Collapsed distant dots remain minimal non-intrusive dots during high orbits without accidental hover expansion balloons.
  - **Stacking Context Isolation & Calibrated Z-Index Range**: Calibrated to a strict 5-tier band within $[0, 8]$ paired with container `isolation: isolate` on the diorama viewport (`ResizableSplitWorkspace.tsx`), ensuring 3D mannequin badges always depth-sort cleanly beneath 2D HUD overlays (`z-10`), bottom telemetry (`z-20`), the studio header (`relative z-30`), and dropdown menus (`z-50`):
    - `camera`: `zIndexRange={[8, 7]}`
    - `highlighted` (Active Focus Target): `zIndexRange={[6, 5]}`
    - `character` (Passive): `zIndexRange={[4, 3]}`
    - `prop` (Passive): `zIndexRange={[2, 1]}`
    - `marker` (Passive): `zIndexRange={[1, 0]}`
  - **Camera Proximity Culling**: In `useFrame`, calculates true 3D world-space distance via `groupRef.current.getWorldPosition()`; if $R < 1.2\text{m}$, the badge smoothly fades to `opacity-0` so close foreground entities never block background stage action or actors.
  - **Clean Viewfinder in Stage Cam POV**: When viewing through `Stage Cam POV` (`cameraMode === 'stage-pov'`), floating 3D mannequin badges and floor compass markers are automatically unmounted (`visible = false`) so the director's viewfinder remains 100% focused on optical composition, actor silhouettes, and safe-action guides. Shot and entity metadata remain displayed in the top-left 2D HUD.
  - **Compact Identity-Only Default with Expand-on-Focus**: Mannequin badges display only their concise name (`● Robert`, `● Mark`) by default. Sublabels/roles (`· Scholar`, `· Assistant`) expand only when `highlighted === true` (active camera focus target) or on hover, cutting badge width by ~50% and preventing text collisions in tight two-shots.
  - **Directorial 4-Tier Opacity Hierarchy**:
    - **Stage Camera**: `100%` opacity always (master optical telemetry).
    - **Active Focus Subject (`highlighted: true`)**: During active playback (`isPlaying === true`), displays at **`60%` opacity** with a character-tinted border (`borderColor: ${accentColor}99`), luminous halo, bright glowing accent dot (`0 0 12px <color>`), and pure white bold text (`font-bold text-white`), establishing commanding visual contrast over passive background elements. When paused or scrubbing, active focus entities render at **`100%` full brightness**.
    - **Passive Characters (`kind: 'character'`)**: Render at `85%` opacity paused, fading down to `25%` opacity during playback.
    - **Passive Props (`kind: 'prop'`)**: Render at `55%` opacity paused, fading down to `15%` opacity during playback.
    - **Passive Markers (`kind: 'marker'`)**: Render at `35%` opacity paused, fading down to `10%` opacity during playback (subtle floor spike cues).

---

## 4. 2D Workspace Shell & Authoring Utilities (`src/ui/`)

### 4.1 Three-Wing Studio Header & Score Library (`WorkspaceHeader.tsx`, `ScoreLibraryModal.tsx`)
- **SceneFlow 3-Wing Architecture**: Aligned with sister application **SceneFlow**, the top studio header bar is divided into three ergonomic wings:
  - **Left Wing**: Responsive Brand Identity (desktop displays the full horizontal `StageFlow` logo `/StageFlow - LOGO - WHITE.png` or `/StageFlow - LOGO - BLACK.png` adapted to active theme; mobile viewports `< 768px` display the theme-adaptive rounded box icon with `/StageFlow - ICON - Square.png` switching between light and dark inverted styling), tiered `File ▾` dropdown (`FileMenuDropdown.tsx`), and the interactive `ActiveScoreIndicator.tsx` pill displaying the active score title with uncluttered clarity (technical storage badges like `Bundled Baseline` and `Custom` are reserved for the YAML drawer and Score Library). Clicking the active score chip immediately opens the Score Library.
  - **Center Stage**: Centered `LayoutSegmentedControl.tsx` housing the 2 workspace layout modes (`Split` | `Full`) and an adjacent amber-accented **`[ ✎ Edit ]`** toggle pill in an elevated container.
  - **Right Wing**: Theme mode dropdown (`ThemeSelectorDropdown.tsx`), standalone amber `[ 📖 Library ]` gateway button opening `ScoreLibraryModal.tsx`, a tactile 1-click **`[ Reset Layout ]`** button, native fullscreen toggle, and an **About / Info** button (`AppInfoModal.tsx`) with global `?` keyboard shortcut.
  - **Authoritative Stacking Context**: The header uses `relative z-30`, ensuring all dropdown menus (`File ▾`, `Color Themes ▾`) and popovers render safely above viewport HUD elements, labels, and badges.
- **Tiered `File ▾` Menu (`FileMenuDropdown.tsx`)**:
  - *Media & Score I/O*: "Open Video or Score..." (file picker trigger) and "Export Active Score (.yaml)" (direct browser download).
  - *Scores*: "New Blank Score..." and "Manage Custom Scores" (with custom scores badge count).
  - *Reference*: "Score Library..." and links to the YAML Authoring Guide and Script Specification.
- **2-Column Master-Detail Score Library & Project Hub (`ScoreLibraryModal.tsx`, `ScoreInspectorPane.tsx`, `ScoreStageMinimap.tsx`)**:
  - Accessible `max-w-5xl` studio dialog integrating score discovery and project lifecycle management into a unified 2-column layout.
  - **Left Column (~40%)**: Fast-scrolling catalog list (`ScoreLibraryCard.tsx`) with 4-way filter tabs (`All`, `Studies`, `Blueprints`, `Custom`), un-truncated titles, media engine badges (`YouTube`, `Simulator`, `Video`), and active scene indicators across 3 collapsible sections (`DIRECTORIAL SCENE STUDIES`, `BUNDLED BLUEPRINTS`, `CUSTOM PROJECTS`).
  - **Right Column (~60%)**: Rich Choreography Inspector (`ScoreInspectorPane.tsx`) featuring:
    - **Procedural 2D Vector SVG Stage Minimap (`ScoreStageMinimap.tsx`)**: Renders architectural top-down stage schematics (metric grid, character proxy circles/ellipses with facing chevrons, oriented rectangular polygon bounding boxes for box props via `computeOrientedBoundingBox`, and camera trajectory cones) derived directly from in-memory score geometry in $< 0.1\text{ms}$ with zero WebGL overhead.
    - **Cinematic Telemetry**: Full titles, directorial notes, focal length breakdown (e.g. `35mm, 50mm`), camera maneuver tags, and actor/prop lineup.
    - **Shot Coverage Sequence**: Miniature timeline breakdown detailing each shot's lens, maneuver, and duration.
    - **Unified Project Lifecycle Actions**: Direct inline **Rename**, **Duplicate**, **Export (.yaml)**, and **Delete** for custom projects (eliminating the redundant separate project management modal), alongside **Fork as Custom** for bundled blueprints and **Load Score into Studio**.
- **Dedicated Full-Screen Mobile Score Switcher (`MobileScoreLibraryModal.tsx`)**:
  - Automatically mounted on viewports $< 768\text{px}$ via `useIsMobile.ts`, completely decoupling mobile scene selection from the heavy desktop 2-column inspector while preserving the desktop version 100% untouched.
  - **1-Tap Direct Scene Loading**: Tapping any score card immediately loads that choreography score into the studio and closes the library dialog in one step with zero navigation hops.
  - **Fluid Category Filter Chips**: Replaces desktop segmented tabs with horizontally scrollable touch pills (`All`, `Studies`, `Blueprints`, `Custom`), omitting desktop-only search and inspector toggles.
  - **Collapsed Blueprints by Default**: In the "All" tab, the `Bundled Blueprints` section defaults to collapsed (showing chevron and count `7`), keeping `Scene Studies` and user `Custom Projects` instantly accessible without excessive vertical scrolling.
- **Desktop (`lg+`) 3-Column Studio Workspace Architecture (`ResizableSplitWorkspace.tsx`)**:
  - **Left Column (~30%)**: Houses the reference video player (anchored top, aspect-fit), a continuous horizontal drag divider, and the modular **`VideoWorkspaceSubpanel.tsx`** (Scene Desk). Features a dual-mode **`[ Brief | Stage Cam ]`** header toggle when reference video is present, hosting either:
    - **Mode A (`Brief`)**: The Executive Scene Production Sheet & Call Sheet (`SceneProductionBrief.tsx`, `SceneEntityRoster.tsx`) organized into a high-density 4-card architecture:
      1. **Glance Stat Ribbon**: Single-line slate summary displaying Duration, Shots count, Film Gate aspect ratio, and Media Engine.
      2. **Scene Premise & Directorial Notes**: Title, subtitle, and Markdown-rendered premise notes.
      3. **Camera & Optical Package**: Prime lens package and camera maneuver chips.
      4. **Cast & Props Lineup**: Compact, streamlined entity tags with theme color dots and 3D dimensions.
    - **Mode B (`Stage Cam`)**: The virtual 3D Stage Cam monitor POV simulator directly beneath the video while capping active WebGL contexts at 2.
    Utilizes pure CSS container-query aspect-fit containment (`.aspect-fit-container` and `.aspect-fit-box` via `min(100cqw, calc(100cqh * ratio))`) across both viewports, strictly maintaining film aspect ratios (16:9, 2.39:1) with automatic letterboxing/pillarboxing and SMPTE 90% safe-action guides without vertical squishing.
  - **Center Column (~40%)**: Dedicated, uninterrupted 3D Blueprint Diorama viewport with 4-corner directorial HUD.
  - **Right Column (~30%)**: Dedicated, full-height YAML Score Studio (`YamlStudioPanel.tsx` in flex column mode) for real-time score authoring and validation.
- **1-Click Reset Layout & Fullscreen Viewport Controls (`WorkspaceHeader.tsx`, `useWorkspaceLayout.ts`)**:
  - Clicking **Reset Layout** in the header right wing (desktop viewports $\ge 768\text{px}$) restores default column widths (30/40/30), video height (45%), and subpanel expansion, persisting changes to `localStorage` with a confirmation toast.
  - A 1-click native browser **Fullscreen** toggle button (`Maximize`/`Minimize` via `document.documentElement.requestFullscreen()` and `document.exitFullscreen()`) is mounted in the header right wing across both desktop and mobile viewports, dynamically tracking browser `fullscreenchange` events with descriptive tooltips.
- **Center Header Workflow & Layout Pairing (`LayoutSegmentedControl.tsx`)**:
  - Couples the layout mode segmented pill `[ ◫ Split | ⛶ Full ]` with an adjacent **`[ ✎ Edit ]`** toggle pill (styled with SceneFlow-aligned amber accent active state).
- **Workspace State Matrix**:
  - `Split + Edit OFF`: Classic 2-column playback view (Video 50% / Diorama 50%). Subpanel collapses into minimal header.
  - `Split + Edit ON`: Full 3-Column Studio (Left 30% [Video + Subpanel] | Center 40% [Diorama] | Right 30% [YAML]). Subpanel defaults to expanded.
  - `Full + Edit OFF`: 100% 3D Diorama stage. Reference video is mounted offscreen (`fixed -left-[99999px]`) to maintain media clock and audio sync without interruption.
  - `Full + Edit ON`: 2-Column Mode (Diorama 60% | YAML 40%, video cleanly offscreened). Perfect for procedural blueprint scores.
- **Continuous 3-Way Resizing**:
  - Left vertical divider (col-resize) adjusts Left Column width ($18\%$ to $45\%$).
  - Right vertical divider (col-resize) adjusts Right Column width ($18\%$ to $45\%$).
  - Left horizontal divider (row-resize) adjusts Video container height ($180\text{px}$ min video, $140\text{px}$ min subpanel).
  - Enforces `.is-resizing-split` during any drag operation to maintain 60fps responsiveness across WebGL and IFrames.
- **Mobile & Narrow Viewports (`< md` / `< 768px`)**:
  - **Dynamic Aspect Ratio Fitting with 40% Maximum Height Clamp**: On mobile, the Left/Top Column is not locked to an arbitrary static height. Instead, it scales dynamically to hug the rounded video card based on the exact aspect ratio of the video (`min(40%, calc((100vw - 20px) / var(--aspect-ratio) + 20px))`). Widescreen media (`16:9`, `2.39:1`) fits with uniform 10px padding on all four sides without excessive vertical dead space above or below, automatically releasing extra vertical height to the 3D Blueprint Diorama (e.g. 68%–75% for widescreen). Taller media (`4:3`, `1:1`) is clamped cleanly at the 40% height threshold to guarantee the 3D diorama retains at least 60% of the screen height.
  - **Tactile Rounded Card Presentation**: Retains the signature `rounded-2xl border border-border-main shadow-xl` floating card aesthetic with balanced 10px outer frame padding (`p-2.5 md:p-3`), preserving visual parity with desktop cards while eliminating unbalanced top/bottom voids.
  - **Scene Desk Auto-Suppression**: In mobile view, the Scene Desk subpanel (`VideoWorkspaceSubpanel.tsx`) is completely hidden, allowing the reference video (or procedural Stage Cam) to utilize the full top slot without letterbox fragmentation, while eliminating redundant secondary WebGL contexts on phones.
  - **Header Compacting**: Logo text and `"3D Blocking Diorama"` subtitle are hidden (Box icon only), the `File ▾` dropdown is hidden, and `ActiveScoreIndicator.tsx` expands with smooth ellipsis truncation (`truncate`).
  - **Mobile Fullscreen & Layout Adaptations**: The desktop-only `Reset Layout` button is hidden on narrow viewports (`< md` / `< 768px`), leaving the 1-click native browser Fullscreen toggle prominently positioned in the header right wing alongside the theme dropdown and library button.
  - **Directorial Transport Streamlining**: Auto-hides the shot chips strip (`DirectorialShotChipsStrip.tsx`), leaving only the touch-friendly Scrubber Track and Transport Deck buttons, saving ~35px of vertical screen height.

### 4.2 4-Corner Directorial HUD Architecture (Wide Mode $\ge 768\text{px}$)
Adopts professional 3D viewport convention (Blender, Unreal Engine, Maya) distributing chrome strictly to the 4 corners while leaving the center stage sightline 100% clean:
1. **Top-Left (Metadata & Context)**: [`ShotBreakdownHud.tsx`](../src/ui/ShotBreakdownHud.tsx) displaying active shot telemetry with unified single-line header continuity (`[#xx]` tag, clean title without redundant `"Shot ## · "` prefix, and chevron toggle) across both states. Click anywhere on the card to toggle between collapsed and expanded states (retaining state during 3D orbit and timeline playback without click-outside auto-dismissals):
   - **Collapsed View**: 2-line low-profile pill pairing the single-line header with an essential cine spec line (`35mm` · `DOLLY` · `F 2.6m` · `Δ 0.19m`) with semantic color accents, removing viewport state clutter (`Paused · Free Orbit` which is already visible in the bottom-left camera dock).
   - **Expanded View**: Multi-row directorial spec strip featuring:
     - **Header**: Single-line `#xx` tag, clean title, and `ChevronDown`.
     - **Optics & Rig Row**: Focal length, aperture stop, film gate aspect ratio (`16:9 Gate`, `2.39:1 Gate`), compass rig/maneuver badge, and focus distance.
     - **Directorial Tracking Row**: Look-At Target with crosshair and entity theme color dot (`🎯 ● Ruby (Hero)` resolved via `shotBreakdownUtils.ts`), full 3D signed offset vector (`Δ [+0.15, -0.12, +0.00]m`), and shot timing (`Start 42.0s · Dur 16.0s`).
     - **Directorial Staging Note**: Rendered as simple, elegant italic text (`text-[11px] font-sans italic text-text-muted leading-relaxed`) separated by a subtle top border divider, keeping the card light and distraction-free.
2. **Top-Right (Display & Legend)**: [`LabelDisplayModeToggle.tsx`](../src/ui/LabelDisplayModeToggle.tsx) providing rapid toggles for 3D character/camera billboard labels (`All`, `Cam`, `Off`) and viewfinder composition guides.
3. **Bottom-Left (Camera Workstation Dock)**: 2-tier stacked dock positioned immediately above the transport scrubber deck:
   - **Upper Tier ([`CameraPresetControls.tsx`](../src/ui/CameraPresetControls.tsx))**: 1-click angle snaps featuring bespoke **isometric 3D ViewCube SVG icons** (Top plan, Iso 45°, Front proscenium, Side profile, and Reset) with rich tooltips, eliminating text clutter and avoiding popup menus.
   - **Lower Tier ([`CameraModeSwitcher.tsx`](../src/ui/CameraModeSwitcher.tsx))**: Tactile segmented 3-way POV mode switcher (`Scripted` [👁️], `Free Orbit` [🌐], `Stage Cam` [🎥]).
4. **Bottom-Right (Telemetry & Coordinates)**: [`CameraTelemetryCapsule.tsx`](../src/ui/CameraTelemetryCapsule.tsx) displaying live degrees, distance, and 1-click YAML snippet copying.

### 4.3 Authoring Telemetry Capsule (`CameraTelemetryCapsule.tsx`, `CameraTelemetryHoverCard.tsx`, `telemetryYamlFormatter.ts`)
- Floating bottom-right glassmorphic badge inside the 3D viewport displaying live **human degrees and metric meters** (`Pitch° / Yaw° · Distance(m) · (X, Y, Z)`).
- **Integrated Dual-Camera Switcher (`[ 👁 OBS | 🎥 CAM ]`)**:
  - **`[ 👁 OBS ]` (Observer Camera)**: Tracks the active 3D diorama viewport camera in real time as the user orbits/pans/zooms via `OrbitControls` (`cartesianToSpherical`). Clicking copies a ready-to-paste scoped `observer_camera:` block.
  - **`[ 🎥 CAM ]` (Stage Camera)**: Displays the active shot's physical filming camera pose (`pitch`, `yaw`, `distance`, `target`, `lens`). Clicking copies a scoped `camera:` block enriched with optical parameters (`focus`, `aperture`).
  - **Auto-Sync with Manual Override**: Switching viewport modes (bottom-left) to `Stage Cam` automatically selects `CAM`; switching to `Scripted` or `Free Orbit` selects `OBS`. Directors can toggle either tab at any time to inspect the other camera without altering the viewport view.
- **Narrow Viewport Auto-Hiding**: When the diorama pane width drops below the $768\text{px}$ narrow threshold, the capsule is automatically unmounted to keep the bottom 3D stage area 100% clean and unobstructed. In wide mode ($768\text{px}$ to $920\text{px}$), target vector coordinates (`TGT [...]`) are compacted to preserve bottom clearance with the camera mode switcher, expanding automatically when diorama width $\ge 920\text{px}$.
- **1-Click Scoped YAML Snippet Copy**: Clicking the capsule copies formatted YAML directly to the clipboard:
  ```yaml
  camera:
    target: [0.00, 1.20, 0.50]
    distance: 4.80
    pitch: 15.0
    yaw: 45.0
    lens: 50mm
    focus: 2.59m
    aperture: f/2.6
  ```
- **Context-Aware Physical Rig & Optical Hover Specs**: When an active shot has a physical mount (`tripod`, `track`, `spline_track`), the capsule renders an amber category badge (`TRIPOD` / `TRACK`). The upward hover tooltip card (`CameraTelemetryHoverCard.tsx`) displays detailed pitch, yaw, roll, distance, target, lens, rig mount, and in `CAM` mode adds active maneuver, focus distance, and aperture f-stop.

### 4.4 Dedicated Compact Diorama Header (`CompactDioramaHeader.tsx` — `< 768px`)
- When the diorama pane width drops below $768\text{px}$ (e.g. in 3-column studio edit mode, split mode, or on compact screens), `src/ui/InteractiveStudioApp.tsx` dynamically switches from the distributed top overlay trio to a dedicated, unified compact header mounted at `top-3 left-3 right-3`:
  - **Left Wing**: `#xx` tag and clean shot title with a click-to-expand details popover displaying focal length, gate aspect ratio, and maneuver note.
  - **Center Wing**: Streamlined 3-way segmented Camera POV Switcher (`Scripted`, `Free Orbit`, `Stage Cam`).
  - **Right Wing**: Unified `[ View ▾ ]` popover consolidating 1-click angle presets (Top, Iso, Front, Side, Reset), 3D label display modes (All, Cam, Off), and viewfinder guides toggle into an accessible, collision-free dropdown.
  - **Outside Click Dismissal**: Automatically closes open popovers on outside pointer interactions.

### 4.5 Code-First YAML Score Studio (`src/ui/editor/`, `YamlStudioPanel.tsx`)
- Mounted full-height in the right studio column when Edit Mode is active (`[ ✎ Edit ]` toggle).
- **CodeMirror 6 Engine (`YamlEditorCanvas.tsx`, `useYamlEditor.ts`)**:
  - Replaces plain `<textarea>` with a virtualized, responsive CodeMirror 6 editor featuring Lezer-based YAML grammar (`@codemirror/lang-yaml`), line numbers gutter, soft line-wrapping, 2-space tab indent (`indentWithTab`), and native search/replace (`Ctrl+F`).
  - **Dynamic Theme Adaptation (`useCodeMirrorTheme.ts`)**: Uses CodeMirror `Compartment` instances to dynamically adapt editor chrome, line numbers, cursor, selection, and syntax tokens (amber keys, emerald strings, sky measurements, purple booleans, and muted slate comments) across StageFlow's 4 active themes (`Dark Obsidian`, `Warm Paper`, `Light Stone`, `Pure Black`) with zero reload lag.
- **Protected Bundled Presets (Read-Only)**: When viewing factory presets (Scene Studies or Blueprints 01–07), editing is locked (`EditorState.readOnly.of(true)`) and surfaces a sky-blue banner with a prominent **`[ Fork to Edit → ]`** button. Clicking it clones the score into IndexedDB and immediately unlocks the editor.
- **Debounced Live Sync & Re-Evaluation (~150ms)**: When editing custom projects, typing updates locally with zero input latency at 60fps/144fps, while `parseStageScore` and 3D diorama re-evaluation trigger after 150ms of typing inactivity, debouncing writes to IndexedDB and preventing WebGL stutter.
  - **Playback & Focus Collision Guards**: Protects in-flight typing against background 10Hz React UI sync renders during looped playback via a three-tier guard (`lastDispatchedTextRef` updated upon actual debounce dispatch, `view.hasFocus` write protection, and `sceneId` transition boundary detection with safe selection clamping).
- **Top Panel Header (`YamlEditorHeader.tsx`)**:
  - Compact title bar housing the editor title (`Live YAML Score`), a status badge (`● Live Sync` with pulsing dot or `Read-Only` for bundled blueprints), **`[ SPEC ]`** (`?mode=spec`) and **`[ Guide ]`** (`?mode=guide`) trigger buttons opening the specification and authoring manuals in a new tab, and an isolated **`[ ✕ ]`** close button.
  - Omit redundant clutter (`Meters...` subtitle, storage badges, and mathematical slogans) for a clean directorial look.
- **Directorial Action Bar (`YamlActionBar.tsx`)**:
  - Dedicated sub-header strip housing primary buffer actions: **`[ Wrap ]`** (toggles soft line-wrapping on `.cm-scroller` via a dynamic CodeMirror `Compartment`, persisted in `localStorage` under `stageflow:ui:editor-word-wrap`), **`[ Copy ]`** (copies full YAML with visual feedback), and **`[ Fork to Edit → ]`** (when viewing bundled blueprints).

### 4.6 Directorial Playback Transport Suite (`DirectorialTransportBar.tsx`, `src/ui/transport/`)
Decomposed into 3 focused submodules to preserve the $\le 250$ line modularity standard:
1. **Directorial Timeline Track (`DirectorialTimelineTrack.tsx`)**:
   - **High-Contrast Razor Edit Cut Dividers**: Proportional 1.5px vertical divider lines rendered on top of the track (`z-2`), maintaining crisp visibility across both unplayed sections (`bg-text-faint/70`) and the active colored progress fill (`bg-white/90` with shadow) so shot boundaries and pacing are immediately legible.
   - Dual-gradient playback progress fill.
   - **Auto-Pause on Scrubber Interaction**: Grabbing the range slider (`onPointerDown`) or dragging across it (`onChange`) automatically pauses active playback so the director can inspect exact frame poses manually without fighting playback advance.
   - **Floating Hover Preview Tooltip**: Hovering across the track displays a floating tactile pill above the cursor (`00:21.86 · #04 Evan Grabs Ruby's Arm`) clamped within container bounds, paired with a razor vertical hairline on the timeline.
   - **Luminous Emerald Loop Indicator & Dynamic Shot Looping**: When `Loop Shot` is enabled, dynamically highlights and bounds playback to whichever shot is currently active with an emerald accent fill, subtle glow, and crisp `[` and `]` boundary bracket ticks that update in real-time when clicking different shot chips or scrubbing without trapping manual seeks.
2. **Adaptive Centered Shot Chips Strip with Chevrons (`DirectorialShotChipsStrip.tsx`)**:
   - **Adaptive Centering & Clean Overflow Detection**: When all chips fit horizontally within the viewport (e.g. scenes with 5–15 shots or wide screens), the entire chip row automatically centers itself (`justify-center`), creating a balanced visual column directly above the centered transport deck. Flanking chevrons and edge fade masks are cleanly hidden when there is no overflow.
   - **Zero-Reflow Uniform Number Strip**: All shot chips render as sleek, uniform-width numbered pills (`#01`, `#02`, `#03`... ~`38px` wide) using pure CSS color transitions (`transition-colors`), completely eliminating browser DOM reflow and layout thrashing during 60fps/144fps camera cuts.
   - **Active Highlight**: The active shot is instantly distinguished with bold typography and solid primary pill styling (`bg-btn-primary-bg text-btn-primary-text font-bold`).
   - **High Storyboard Density**: Fits 25–30 shots on screen simultaneously without horizontal sprawling, giving directors an instant, panoramic 1-click storyboard jump track across the entire scene.
   - **De-Cluttered & Fast**: Redundant titles and timestamps are omitted from the bottom strip (since the title is already prominently visible in the Left-Panel subpanel, Compact Diorama Header, and timeline hover preview); full shot titles and time spans remain instantly accessible via browser hover tooltips (`title`).
   - **Smooth Scrolling on Overflow**: When a scene contains numerous shots that exceed screen width, flanking `<` and `>` chevron buttons appear for 1-click smooth peek scrolling, bilateral edge fade masks indicate off-screen shots, and active cuts automatically smooth-scroll into the center via `activeChipRef.scrollIntoView`.
   - Allows free trackpad / mouse-wheel horizontal peeking forward and backward at any time without intrusive raw scrollbars (`.no-scrollbar`).
3. **Unified Centered Transport Deck (`DirectorialTransportDeck.tsx`)**:
   - Organizes controls into an ultra-compact **balanced 3-segment centered island** (~`290px` footprint) with subtle vertical dividers:
     - **Left Segment**: Precision timecode readout (`01:01.63 / 01:02.00`).
     - **Center Segment**: Core kinetic transport featuring Restart to 0 (`[ ↻ ]`) and the hero **`[ ▶ / ❚❚ ]`** icon toggle (`w-8 h-8 rounded-xl`) retaining distinct color cues (amber `bg-amber-500` when playing, primary `bg-btn-primary-bg` when paused) and optical triangle centering.
     - **Right Segment**: Directorial modifiers with icon-only controls: `[ 🔁 ]` active shot loop toggle (illuminating in emerald `bg-emerald-500/20` when active) and `[ 🔊 ]` audio mute.
   - Speed pills (`0.25x`–`2x`) and frame-step buttons (`< [` and `] >`) are omitted from the UI chrome to eliminate clutter, while single-frame keyboard hotkeys (`[` and `]`) and variable speed driver capabilities remain active.
   - Leaves both left and right outer flanks open, providing a clean, distraction-free cockpit.
   - Redundant project-level actions (`Duplicate`, `Reset`) are omitted as they reside in the Score Library.

### 4.7 Drag-and-Drop Custom Asset Loader (`useFileDropLoader.ts`)
- Dropping any `.yaml`/`.yml`/`.json` file or `.mp4`/`.webm`/`.mov` video file anywhere onto the window (or selecting via `[ Load Video / YAML ]`) binds the assets in browser memory (`URL.createObjectURL`) with zero server upload required.
- **Auto-Fork Collision Guard**: If a dropped YAML file has an `id` that matches a bundled preset (e.g. `demo-blueprint`), StageFlow automatically forks it with a unique custom ID, preserving the factory preset intact and saving the file to `Custom Projects`.

### 4.8 Storage Persistence Indicator (`StorageStatusBadge.tsx`)
- Reusable badge component communicating the active persistence tier (`StoragePersistenceStatus`), paired with the `YamlEditorHeader.tsx` sync indicator (`● Live Sync` / `Read-Only`) and Score Library category pills:
  - `Bundled Baseline` (pristine unedited preset).
  - `Draft (IndexedDB)` (active edits saved safely in IndexedDB).
  - `Custom (IndexedDB)` (imported custom scene saved in IndexedDB).
  - `Saving Draft...` (transient pulse while debounced auto-save writes).

### 4.9 Reset Confirmation Modal (`ConfirmResetModal.tsx`)
- Accessible modal dialog protecting against accidental data loss.

### 4.10 Unified Project Management & Toast Notifications (`ScoreLibraryModal.tsx`, `ToastContainer.tsx`)
- **Unified Studio Hub**: Custom projects (stored in IndexedDB) are managed directly within the Score Library's Inspector pane (`ScoreInspectorPane.tsx`), featuring inline title renaming, YAML file export, project duplication, and delete confirmation with smooth fallback to Blueprint 01, completely eliminating redundant standalone dialogs.
- **Synchronous Library Preferences Persistence**:
  - **Category Filter Tab Persistence (`stageflow:ui:library-tab`)**: Remembers the user's active filter tab (`'all' | 'study' | 'blueprint' | 'custom'`). Opening the library normally (via the active score indicator chip or header button) automatically restores the remembered tab. Explicit intents (e.g. clicking **File ▾ $\to$ Manage Custom Scores**) override the stored selection to open directly to the requested tab (`'custom'`).
  - **Bundled Blueprints Collapsed by Default (`stageflow:ui:library-blueprint-expanded`)**: In the "All" grouped view, the `Bundled Blueprints` section defaults to **collapsed** (`false`) across both desktop and mobile viewports, keeping hero `Scene Studies` (Vector Field) and user `Custom Projects` instantly visible without heavy vertical scrolling.
  - **Accordion Section State Persistence (`stageflow:ui:library-study-expanded`, `stageflow:ui:library-custom-expanded`)**: User collapse/uncollapse actions for `Scene Studies` (default: expanded / `true`), `Blueprints` (default: collapsed / `false`), and `Custom Projects` (default: expanded / `true`) persist to `localStorage` across both desktop ([`ScoreLibraryModal.tsx`](../src/ui/ScoreLibraryModal.tsx)) and mobile ([`MobileScoreLibraryModal.tsx`](../src/ui/library/MobileScoreLibraryModal.tsx)) modalities.
- **Transient Toast Feedback (`ToastContainer.tsx`)**: Lightweight 3-second floating feedback banners confirming file drops, auto-forks, project deletions, and exports.
- **Legacy Draft Auto-Migration**: On startup hydration, any legacy drafts in IndexedDB that modified bundled presets are automatically migrated into standalone Custom Projects with zero data loss.

### 4.11 Viewport Label, Composition Guides & Optical DoF Blur Controls (`LabelDisplayModeToggle.tsx`)
- Floating top-right glassmorphic pill overlay mounted on the 3D diorama canvas.
- Conditioned so the `Guides` and `Blur` toggle buttons appear strictly when in `Stage Cam POV` (`cameraMode === 'stage-pov'`), keeping the 3D Observer view chrome uncluttered.
- Supports 3 distinct directorial visibility modes (`LabelDisplayMode`):
  - **`All`**: Displays both actor/prop mannequins and Stage Camera labels with playback auto-ghosting.
  - **`Cam` (`camera-only`)**: Hides actor/prop labels, keeping only the illustrative Stage Camera lens & maneuver badge.
  - **`Off`**: Hides all 3D labels (including floor cardinal orientation tags) for an unobstructed geometric diorama.
- **Global Hotkey `L`**: Cycles through `'all' -> 'camera-only' -> 'off' -> 'all'` at any time (ignored while typing in text inputs or code editors).
- **Composition Guides Toggle (`[ Guides ]` / Hotkey `G`)**: Toggles the 90% safe-action boundary, rule-of-thirds grid, and center reticle across both the right Viewfinder and the left Procedural Monitor.
- **Optical DoF Blur Toggle (`[ Blur ]` / Hotkey `B`)**: Toggles real-time thin-lens Depth-of-Field bokeh simulation across both the Stage Cam POV viewfinder and the Procedural Stage Cam Monitor (`stageflow:ui:dof-blur`).
- **Synchronous Persistence**: Preferences are remembered across reloads via `localStorage` (`stageflow:ui:label-mode`, `stageflow:ui:viewfinder-guides`, `stageflow:ui:dof-blur`).

### 4.12 Director's Optical Viewfinder Overlay (`StageCamViewfinderOverlay.tsx`)
- Engages automatically whenever the 3D diorama switches to **`Stage Cam POV`** (`cameraMode === 'stage-pov'`).
- **Centered Film Gate**: Sized to `score.aspectRatio` (`16:9`, `2.39:1`) and scaled to 84% of the viewport (`VIEWFINDER_GATE_SCALE = 0.84`), auto-scaling cleanly when the split divider is dragged.
- **Semi-Translucent Look-Around Mask**: Renders an 82% darkened obsidian veil (`rgba(5, 8, 17, 0.82)`) outside the active gate boundary so off-camera actors and props waiting in the wings remain faintly visible while the active frame pops with commanding contrast.
- **Framing Brackets & Stamp**: Luminous corner brackets and a top-left micro-stamp (`REC GATE · 16:9 · 50mm`).
- **Toggleable Guides**: 90% Safe-Action dashed frame, Rule-of-Thirds 3x3 grid, and Center Optical Crosshairs.

### 4.13 Deterministic 60fps Headless Viewport Recorder CLI (`scripts/record/`, `src/recorder/`)
- Standalone CLI recording tool (`npm run record [scene] [options]`) driven by Playwright and FFmpeg.
- **Stateless Frame Stepping ($t_i = i / 60\text{s}$)**: Steps through any choreography score frame-by-frame with zero dropped frames or browser pacing lag, streaming PNG frames into an FFmpeg H.264/VP9 pipe.
- **Dedicated Headless Render Route (`?mode=headless-render`)**: `App.tsx` routes to `<HeadlessRecorderView />`, mounting a pure, chrome-free diorama canvas with zero localStorage polling, media clocks, or extraneous listeners.
- **Two Core Directorial Recording Modes**:
  1. **Scripted Observer View (`--camera scripted`)**: Records the 3D diorama along the authored observer camera path.
  2. **Stage Camera POV (`--camera stage-pov`)**: Locks directly to the physical stage camera's optical sightline, focal length, and active film gate.
- **Visual Overlays & Chrome Control**:
  - `--blur`, `--dof-blur` / `--no-blur`: Opt-in single-pass WebGL2 thin-lens depth of field bokeh blur in Stage Cam POV (automatically inherits from score YAML `optics.dofBlur` when flag is omitted).
  - `--theme dark | warm | light`: Sets diorama background, fog, and grid palette (default: `dark`).
  - `--labels all | camera-only | off`: Toggles 3D Drei HTML character and camera badges.
  - `--guides`: Renders the optical viewfinder safe-action box, rule of thirds, and reticle.
  - `--hud`: Includes top-left shot breakdown and bottom-right degree/meter telemetry badges.
  - `--audio <local_path>`: Opt-in audio extraction and muxing from a reference video or sound file (default output remains 100% silent).
- **Cinematic Presets & Slicing**:
  - `--preset isometric (iso) | top-down (top) | front | side`: Sets fixed architectural perspective angles locked to actor chest level.
  - `--shot <shot_id>` or `--start <sec> --end <sec>`: Slices exact shot cues or timestamp windows.
  - `--res 1080p | 4k | 720p | square | vertical`, `--fps <number>`.

### 4.14 Theme Engine & Split Resize Invariants (`src/hooks/useAppShellTheme.ts`, `src/stage/dioramaTheme.ts`)
- **Visual Design System SSOT**: All typography, semantic CSS tokens, color palettes, and centralized `UI_TOKENS` are authored in [**`docs/VISUAL_DESIGN_SYSTEM.md`**](VISUAL_DESIGN_SYSTEM.md).
- **Dual-Tier Decoupled Theme System (`useAppShellTheme.ts`, `ThemeSelectorDropdown.tsx`)**:
  - **App Shell Theme**: 4 modes (`Light` [default], `Warm`, `Dark`, `Auto`) persisted in `stageflow:ui:theme-mode`.
  - **3D Diorama Stage Theme**: Decoupled from the app shell, with 4 modes (`Match App` [default], `Light`, `Warm`, `Dark`) persisted in `stageflow:ui:diorama-theme-mode`. Allows maintaining a clean matching stone floor by default, while supporting decoupled dark blueprint void or warm drafting paper on demand.
- **Adaptive 3D Diorama Stage Palette (`dioramaTheme.ts`)**: Evaluates WebGL clear color, scene fog (`45m`–`160m`), and metric grid materials via `getDioramaThemeColors(effectiveCategory)` with **0 additional WebGL draw calls or shader passes**.
- **Transition Freezing (`disableTransitionsTemporarily()`)**: Momentarily suppresses global CSS transitions across the DOM for 1 animation frame during theme swaps, eliminating animation reflow lag.
- **60fps Split Resize Performance (`body.is-resizing-split`)**: Suppresses transitions and iframe pointer interception across the window while dragging the split workspace divider bar.

### 4.15 Telemetry & Vercel Web Analytics (`@vercel/analytics/react`, `@vercel/speed-insights/react`)
- Seamlessly integrates Core Web Vitals telemetry (`<Analytics />` and `<SpeedInsights />`) into the root `src/App.tsx`.
- Gated conditionally so tracking scripts run strictly in interactive studio and documentation modes, remaining dormant during headless Playwright recording runs (`?mode=headless-render`).
