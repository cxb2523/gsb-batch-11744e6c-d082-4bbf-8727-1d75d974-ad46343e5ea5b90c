# StageFlow YAML Score Authoring Manual (`*.yaml`)

This document is the authoritative **Single Source of Truth (SSOT)** for authoring, editing, and validating **StageFlow Choreography Scores** (`*.yaml`). It defines every declarative parameter, enum, alias, default value, authoring convention, and cinematography recipe supported by the StageFlow studio.

> **Companion Technical Specification**: For the formal mathematical model, spherical-to-Cartesian projection matrices, sensor trigonometry, and closed-form curve equations, consult the [**StageFlow Script Technical & Mathematical Specification**](?mode=spec) (Spec tab / `?mode=spec`).

---

## 1. Introduction & Spatial Architecture

StageFlow is a deterministic 3D choreography diorama engine. It compiles a declarative `.yaml` score file into a 60fps spatial timeline that synchronizes reference media (video, YouTube, or procedural simulator) with a 3D stage and camera rig.

```text
Choreography Score (*.yaml)
         │
         ▼
  parseStageScore() ─────────► StageScore (Normalized AST)
         │
         ▼
computeStageFrame(t, score) ──► StageFrame (3D Transform State at timestamp t)
```

### 1.1 The Stateless Evaluation Model

The core evaluation contract is a pure function:

$$\text{Frame}_t = f(t, \text{score})$$

- **Bit-for-bit determinism**: Evaluating timestamp $t$ produces identical 3D camera transforms, entity positions, facing angles, and ground trails regardless of playback direction or scrub history.
- **Zero cross-frame drift**: The timeline does not rely on frame deltas ($\Delta t$ accumulation) or runtime physics integration.
- **Scrub invariance**: Scrubbing backward ($10\text{s} \to 4\text{s}$) evaluates the exact same state as playing forward ($0\text{s} \to 4\text{s}$).

### 1.2 Coordinate System & Metric Conventions

StageFlow operates in a right-handed, **$Y$-Up** 3D Cartesian space centered at origin `[0, 0, 0]` on the stage floor:

```text
                     -Z (Upstage / Background)
                             ▲
                             │      +Y (Vertical Elevation / Height)
                             │     ↗
   -X (Stage Left) ◄─────────┼─────────► +X (Stage Right)
                            (0,0,0)
                             │
                             ▼
                     +Z (Downstage / Foreground)
```

| Axis / Dimension | Value `0` Meaning | Positive (`+`) Direction | Negative (`-`) Direction | Authored Unit |
| :--- | :--- | :--- | :--- | :--- |
| **`x` (Horizontal)** | Centerline of stage | **Stage Right** (`+X`) | **Stage Left** (`-X`) | Meters (`m`) |
| **`y` (Vertical)** | Stage floor plane (`0.0m`) | **Overhead / Elevation** (`+Y`) | Below floor plane (`-Y`) | Meters (`m`) |
| **`z` (Depth)** | Centerline of stage | **Downstage / Front** (`+Z`) | **Upstage / Back** (`-Z`) | Meters (`m`) |
| **`pitch` (Elevation)** | Horizon / Eye-level (`0°`) | **High-angle overhead** looking down | **Low-angle hero** looking up | Degrees (`deg`)* |
| **`yaw` (Azimuth)** | Camera on `+Z` looking at `-Z` | **Counter-clockwise orbit toward `+X`** | **Clockwise orbit toward `-X`** | Degrees (`deg`)* |
| **`roll` (Dutch angle)** | Level horizon (`0°`) | **Clockwise camera bank** (from operator POV) | **Counter-clockwise camera bank** | Degrees (`deg`)* |
| **Entity `rotation`** | Mannequin faces `+Z` (downstage) | Faces toward `+X` (`+90°` = Stage Right) | Faces toward `-X` (`-90°` = Stage Left) | Degrees (`deg`)* |

> **Note:** All angles in YAML default to **human degrees** (`deg`). If you explicitly pass a string suffixed with `"rad"` (such as `"1.57rad"`), the parser interprets it directly as radians. Degree string suffixes such as `"45deg"` and `"45°"` are also accepted. For the exact spherical-to-Cartesian forward/inverse projection equations and roll basis vectors, see [StageFlow Script Specification §2](?mode=spec#section-2).

### 1.3 Timeline & Execution Model

- **Timestamp units**: Every timing value (`start`, `end`, `duration`, `offset`) is specified in decimal seconds (e.g. `0.0`, `4.25`, `12.5`).
- **Sync offset (`offset`)**: A global calibration scalar added to the media clock playhead: $t_{\text{effective}} = \operatorname{clamp}(t_{\text{raw}} + \text{offset},\; 0,\; \text{duration})$. A positive offset advances cues earlier; a negative offset delays cues.
- **Shot activation**: A film shot is active when $t_{\text{effective}} \in [\text{start}, \text{end})$. The start timestamp is inclusive; the end timestamp is exclusive.
- **Declaration order precedence**: If two shots or blocking cues overlap temporally, the entry declared **later in the YAML file** takes precedence for camera evaluation, HUD telemetry, and character kinematics.
- **Tail hold**: When $t_{\text{effective}} \ge \text{duration}$, the engine clamps to the final shot and holds the camera and entities at their terminal poses.

### 1.4 Architectural Hard Limits & Clamping Bounds

The engine enforces spatial and optical safety bounds across all evaluators:

| Dimension | Minimum Allowed | Maximum Allowed | Fallback on Invalid / NaN |
| :--- | :--- | :--- | :--- |
| **Camera Distance ($d$)** | `0.4m` | `100.0m` | `5.0m` |
| **Camera Pitch ($\theta$)** | `-85.0°` | `+85.0°` | `14.3°` (`0.25 rad`) |
| **Lens Focal Length ($f$)** | `12mm` | `200mm` | `50mm` |
| **Shot Duration ($\Delta t$)** | `0.1s` | No upper bound | Clamped to $\text{start} + 0.1\text{s}$ |
| **Stage Floor Bounds** | `1.0m` | No upper bound | `10.0m × 10.0m` |

### 1.5 Score Root Block Anatomy

A complete StageFlow document organizes into 5 functional sections:

```yaml
# ==============================================================================
# 1. SCENE METADATA & VIDEO BINDING (Root level)
# ==============================================================================
version: "1.0"
id: "scene-identifier"
title: "Scene Title"
aspect_ratio: "16:9"
duration: 10.0

# ==============================================================================
# 2. STAGE GEOMETRY & BASELINE CAMERAS (stage:)
# ==============================================================================
stage:
  width: 10
  depth: 10
  observer_camera: { target: [0, 1.0, 0], distance: 7.5, pitch: 26, yaw: 38, lens: 35mm }
  stage_camera: { target: "hero", distance: 3.2, pitch: 6, yaw: -25, lens: 50mm }

# ==============================================================================
# 3. SCENE ENTITIES (entities:)
# ==============================================================================
entities:
  - { id: "hero", label: "Lead Actor", kind: "character", position: [-1.2, 0, 0], rotation: 90 }
  - { id: "desk", label: "Desk", kind: "prop", position: [0, 0, 0] }

# ==============================================================================
# 4. OPTIONAL: DECOUPLED BLOCKING TIMELINE (blocking:)
# ==============================================================================
blocking:
  - { id: "hero-cross", entity: "hero", start: 0.0, end: 8.0, position: [1.2, 0, 0], easing: "cruise" }

# ==============================================================================
# 5. FILM COVERAGE SHOTS & STAGE CAMERA (shots:)
# ==============================================================================
shots:
  - id: "shot-1"
    start: 0.0
    end: 5.0
    stage_camera: { target: "hero", maneuver: "dolly", distance_start: 4.0, distance_end: 2.2, lens: 50mm }
  - id: "shot-2"
    start: 5.0
    end: 10.0
    stage_camera: { target: "hero", maneuver: "cut", distance: 1.8, pitch: 4, yaw: 45, lens: 85mm }
```

---

## 2. Quickstart & Minimal Score Anatomy

This chapter provides an immediate, runnable boilerplate and a fast directorial cheat sheet.

### 2.1 Your First Score (60 Seconds)

Copy and paste this minimal 25-line score directly into your StageFlow score file:

```yaml
version: "1.0"
id: "quickstart-dialogue"
title: "Quickstart: Two-Shot Dialogue"
video: "procedural://quickstart"
aspect_ratio: "16:9"
duration: 8.0

entities:
  - id: "actor_a"
    label: "Detective"
    kind: "character"
    position: [-1.0, 0, 0]
    rotation: 90
    color: "#38bdf8"
  - id: "actor_b"
    label: "Witness"
    kind: "character"
    position: [1.0, 0, 0]
    rotation: -90
    color: "#a78bfa"

shots:
  - id: "shot-1-wide"
    start: 0.0
    end: 4.0
    stage_camera:
      target: "actor_a"
      maneuver: "dolly"
      distance_start: 4.5
      distance_end: 2.8
      pitch: 10
      yaw: 20
      lens: 35mm
  - id: "shot-2-closeup"
    start: 4.0
    end: 8.0
    stage_camera:
      target: "actor_b"
      maneuver: "cut"
      distance: 1.8
      pitch: 4
      yaw: -35
      lens: 85mm
```

### 2.2 Adding Camera Movement and Lens Swaps

To introduce dynamic movement, replace `shot-1-wide`'s linear dolly with an **arc** and a dynamic focal length sweep:

```yaml
  - id: "shot-1-arc"
    start: 0.0
    end: 4.0
    stage_camera:
      target: "actor_a"
      maneuver: "arc"
      easing: "cruise"
      distance: 3.2
      pitch_start: 14
      pitch_end: 6
      yaw_start: -30
      yaw_end: 25
      lens_start: 35mm
      lens_end: 50mm
```

### 2.3 Moving the Actors Across Cuts

To stage an actor walking across the floor uninterrupted while the camera cuts between angles, introduce a root `blocking:` timeline:

```yaml
blocking:
  - id: "detective-walk"
    entity: "actor_a"
    start: 0.0
    end: 8.0
    position: [0.6, 0, 0.4]
    look_at: "actor_b"
    easing: "cruise"
```

The detective now translates smoothly from $t = 0.0\text{s}$ to $t = 8.0\text{s}$, automatically rotates their gaze toward the witness at 60fps, and draws a 16-segment dashed floor movement trail across both shots.

### 2.4 Quick Reference Cheatsheet

#### Lens Selection at a Glance
| Focal Length | Vertical FOV (`16:9`) | Directorial Role & Spatial Feel |
| :--- | :--- | :--- |
| **`18mm`** | `58.7°` | Ultra-Wide master / architectural expanse / deep perspective exaggeration |
| **`24mm`** | `45.7°` | Establishing wide / environmental tracking |
| **`35mm`** | `32.3°` | Director's standard two-shot / medium-wide coverage |
| **`50mm`** | `22.9°` | Standard human perspective / medium portrait |
| **`85mm`** | `13.6°` | Over-the-shoulder (OTS) / close-up with background compression |
| **`135mm`** | `8.6°` | Tight emotional close-up / extreme telephoto flat compression |

#### Maneuver in One Line
| Maneuver | Geometry & Directorial Role |
| :--- | :--- |
| **`cut`** | Instantaneous spatial jump; suppresses trajectory line rendering |
| **`dolly`** | Linear push-in, pull-out, or lateral truck directly between two 3D points |
| **`arc`** | Quadratic Bezier trajectory with mid-flight distance breathing (`1.12`) and $+Y$ lift |
| **`swoop`** | Bezier arc with an additional dynamic $+4.58^\circ$ pitch elevation crest |
| **`orbit`** | Turntable revolution around target at constant distance and pitch |
| **`sweep`** | Azimuthal pan sweep across a target sector |
| **`spiral`** | Helical corkscrew combining continuous rotation with vertical pitch and distance shift |
| **`dive`** | Fast perigee dive that dips closer at first quarter and pulls back at three quarters |
| **`recoil`** | Shockwave impulse kick (`breathe: 1.25` default) that settles back onto the subject |
| **`spline`** | Smooth $C^1$ Catmull-Rom curve passing through an arbitrary sequence of `waypoints:` |

### 2.5 Learn From Bundled Studies & Blueprints

StageFlow organizes choreography scores into a clean 3-tier taxonomy (`study`, `blueprint`, `custom`). The built-in library provides both production-grade scene studies and focused educational blueprints:

- **Directorial Scene Studies (`src/scores/studies/`)**: Real-world auteur cinematography studies authored by Taruma Sakti (such as **Vector Field**, **The Expansion**, and **AFRAID**) demonstrating large-scale spatial staging, multi-actor blocking, continuous single-take oners, and dynamic rack focus.
- **Factory Camera-Blocking Blueprints (`src/scores/blueprints/`)**: Focused pedagogical blueprints (BP 01–07) systematically demonstrating individual cinematographic concepts: dialogue coverage reversals, projectile kinetics, framing ladders, threshold crossings, optics/DoF masterclasses, and physical dolly tracks.

> 📖 **Complete Score Directory**: For an exhaustive breakdown of every built-in score with narrative synopses, runtimes, camera moves, and optical packages, see [**`docs/SCORE_CATALOG.md`**](SCORE_CATALOG.md).

### 2.6 The 8 Most Common Authoring Mistakes

1. **Omitting `start` on a shot without declaring `continuous: true`**: In standard mode, omitting `start` defaults to `0.0s` and flags a warning in the editor.
2. **Assuming `yaw` rotates clockwise when positive**: In StageFlow's right-handed Y-up coordinate space, positive yaw increases **counter-clockwise (CCW)** when viewed from overhead (+Y), moving from downstage (+Z / 6:00) toward Stage Right (+X / 3:00). Conversely, `direction: "cw"` commands decreasing yaw angles.
3. **Confusing camera `target_offset` with root-level `offset`**: Root `offset: 0.0` calibrates the global media clock in seconds; to shift a camera's 3D look-at point in meters, use `target_offset: [dx, dy, dz]` (or `targetOffset`).
4. **Expecting `roll` to hold across standard cuts without declaring it**: In standard mode (`continuous: false`), camera roll resets to level horizon (`0°`) at shot boundaries unless explicitly authored or chained via `continuous: true`.
5. **Declaring a single `distance:` in standard mode expecting motion**: A single value establishes a constant distance throughout the shot. To animate distance in standard mode, provide `distance_start` and `distance_end`.
6. **Writing entity movement in `shots[].entities` when root `blocking:` is present**: When root `blocking:` exists, it claims exclusive kinematic authority over position and rotation; per-shot entity maps provide only `highlighted: true` and `note:` overlays.
7. **Entity ID mismatch**: Entity keys in `shots[].entities` must match the entity `id` exactly.
8. **Shots shorter than 0.1s**: The engine clamps all shot durations to $\Delta t \ge 0.1\text{s}$.

---

## 3. Scene Foundation (Root, Stage & Entities)

This chapter defines scene-level metadata, video source binding, stage metric dimensions, and initial entity declarations.

### 3.1 Root Keys Reference

| Field | Type | Default | Accepted Aliases | Description |
| :--- | :--- | :--- | :--- | :--- |
| **`version`** | `string` | `"1.0"` | — | Schema version identifier. |
| **`id`** | `string` | `"custom-scene"` | — | Unique slug identifier used in storage and URL routing. |
| **`title`** | `string` | `"Untitled..."` | — | Primary display title shown in header and minimaps. |
| **`subtitle`** | `string` | `undefined` | — | Optional secondary descriptor. |
| **`description`** | `string` | `undefined` | `notes` | Optional directorial premise or staging synopsis (rendered as rich Markdown in the Scene Brief). |
| **`metadata`** | `object` | `undefined` | — | Optional scene-wide production metadata & directorial notes (music, gear, checklist, lighting) rendered in the Scene Desk. |
| **`continuous`**| `boolean` | `false` | `"true"`, `"yes"` | Opt-in flag activating contiguous timeline chaining and forward pose flow. |
| **`video`** | `string \| object` | `"procedural://demo"` | `video_url`, `videoUrl` | Video media binding (see §3.2). |
| **`aspect_ratio`**| `string \| number` | `"16:9"` | `aspectRatio` | Stage and film gate aspect ratio (e.g. `"16:9"`, `"2.39:1"`, `1.777`). |
| **`duration`** | `number` | Auto | — | Total duration in seconds. Defaults to maximum end timestamp across all timelines (`shots`, `observer_shots`, `blocking`). |
| **`offset`** | `number` | `0.0` | — | Global A/V clock calibration offset in seconds. |
| **`stage`** | `object` | `{}` | — | Floor boundaries, metric grid divisions, and baseline camera poses. |
| **`entities`** | `array` | `[]` | — | List of characters, props, and floor markers present on stage. |
| **`shots`** | `array` | `[]` | `score` | Mandatory array of film coverage shots. |
| **`blocking`** | `array` | `undefined` | — | Optional decoupled actor/prop movement timeline. |
| **`observer_shots`** | `array` | `undefined` | `observerShots` | Optional decoupled diorama viewport movement timeline. |
| **`optics`** | `object` | `undefined` | *(Flat root keys also supported)* | Optional scene-wide optical defaults (`dof_blur: true` [aliases: `dofBlur`, `blur`], `dof: "shallow"`, `aperture: "f/2.8"`). |

### 3.1.1 Scene Metadata & Production Notes (metadata:)

Choreography scores support an optional, dedicated `metadata:` block at the root level. All keys declared inside `metadata:` are parsed into the normalized AST (`score.metadata`) and rendered inside the **Scene Desk** (`SceneProductionBrief`) as a collapsible **SCENE METADATA** card with smart category icons and rich Markdown formatting.

```yaml
metadata:
  music: "Max Richter — On The Nature of Daylight · [Listen](https://spotify.com)"
  camera_package:
    camera: "ARRI Alexa Mini LF"
    stabilizer: "Steadicam M-2"
  production_notes:
    - "Continuous clockwise arc around conversational axis"
    - "Actor Dave must hit floor mark by **00:14.5s**"
```

The metadata engine supports three polymorphic value structures:
- **Single String / Markdown**: Formatted with full Markdown (`**bold**`, `*italics*`, `[links](url)`, `` `code` ``).
- **Checklist Array**: A list of strings (`- item`), rendered as a callout checklist.
- **Nested Key-Value Map**: Sub-dictionaries (`key: value`), rendered as compact metadata badge pills.

### 3.2 Video Binding & Formats

The `video:` field can be authored as a concise URL string or as a structured object:

```yaml
# Format A: Concise string URL
video: "procedural://demo"
```

```yaml
# Format B: Structured mapping with dedicated container aspect ratio
video:
  src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" # (alias: url)
  aspect_ratio: "16:9"                              # (alias: aspectRatio)
```

The engine classifies URLs into three runtime drivers:
1. **Procedural Simulator (`procedural://...`)**: 60fps virtual clock generating simulated camera telemetry without media file dependencies.
2. **HTML5 Video Player (`/media/...`, `http://...`, `blob:...`)**: Native browser `<video>` engine for `.mp4`, `.webm`, or dropped video files.
3. **YouTube Player (`https://www.youtube.com/...`, `https://youtu.be/...`)**: YouTube IFrame API with high-frequency 60fps `performance.now()` drift extrapolation.

> **Note:** Root-level `aspect_ratio:` always takes precedence over `video.aspect_ratio:`.

### 3.3 Stage Geometry & Baseline Cameras (`stage:`)

```yaml
stage:
  width: 14            # Stage floor width along X-axis in meters (default: 10)
  depth: 12            # Stage floor depth along Z-axis in meters (default: 10)
  grid_step: 1         # Major metric grid division in meters (default: 1; alias: gridStep)
  show_rigs: true      # Global toggle for 3D camera tripod stands and dolly tracks (default: true; alias: showRigs, or at score root)

  # Baseline pose for Viewport Camera (used before Shot 1 or when unscripted)
  observer_camera:
    target: [0, 1.0, 0]
    distance: 7.5
    pitch: 26
    yaw: 38
    roll: 0
    lens: 35mm

  # Baseline pose for Illustrative Stage Camera
  stage_camera:
    target: "actor_a"
    distance: 3.2
    pitch: 6
    yaw: -25
    roll: 0
    lens: 50mm
```

#### Stage Baseline Defaults (`constants.ts`)
| Parameter | `stage.observer_camera` Default | `stage.stage_camera` Default |
| :--- | :--- | :--- |
| **`target`** | `[0.0, 1.0, 0.0]` | `[0.0, 1.2, 0.0]` |
| **`distance`** | `7.5m` | `3.2m` |
| **`pitch`** | `26.0°` | `6.0°` |
| **`yaw`** | `38.0°` | `-25.0°` |
| **`roll`** | `0.0°` | `0.0°` |
| **`lens`** | `35mm` | `50mm` |

> **Tip:** Both `stage.stage_camera` and `stage.observer_camera` accept declared entity identifiers/labels (e.g. `"actor_a"`), stage presets (`"center"`, `"origin"`, `"stage"` $\to$ `[0.0, 1.0, 0.0]`), or explicit `[x, y, z]` coordinates, plus optional `target_offset`.

### 3.4 Scene Entities (`entities:`)

Every entity declared in `entities:` represents a physical proxy on the stage floor at $t = 0.0\text{s}$:

```yaml
entities:
  - id: "detective"
    label: "Detective Miller"
    kind: "character"
    style: "mannequin"         # "mannequin" (default) | "edges" | "silhouette" | "wireframe"
    position: [-1.2, 0, 0]     # [x, y, z] in meters (Y=0 is floor plane)
    rotation: 90               # Facing +90° (toward +X Stage Right; alias: yaw)
    size: [0.55, 1.82, 0.45]   # [w, h, d] 3D dimensions in meters (or explicit width, height, depth)
    color: "#38bdf8"           # Hex token for proxy, badge, and floor ring

  - id: "desk"
    label: "Oak Desk"
    kind: "prop"
    shape: "box"               # "box" (default) | "sphere" | "cylinder" | "capsule"
    style: "edges"             # "edges" (default) | "glass" | "solid" | "wireframe"
    position: [0, 0, 0]
    size: [1.8, 0.78, 0.9]     # [w, h, d] box prop: width 1.8m, height 0.78m, depth 0.9m
    color: "#94a3b8"

  - id: "mark_door"
    label: "Doorway Mark"
    kind: "marker"
    shape: "t"                 # "x" (default) | "t" | "circle" | "puck"
    style: "glow"              # "tape" (default) | "glow" | "beacon"
    position: [0, 0, 3.5]
    color: "#fb7185"
```

#### Entity Kinds & Physical Proxy Geometry
| `kind` | Accepted `kind` Aliases | Supported `shape` Values (& Aliases) | Default `height` | Default `radius` | Intrinsic Look-At Anchor ($\vec{A}$) |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **`"character"`** | `actor`, `person` | — | `1.75m` | `0.26m` | $(x, y + 0.90h, z)$ (`~1.575m` eye level) |
| **`"prop"`** | `set`, `furniture`, `item`, `object` | `box` *(default)*, `sphere` (`ball`), `cylinder` (`column`, `can`, `cup`), `capsule` (`pill`) | `0.85m`* | `0.35m` | $(x, y + 0.50h, z)$ (`0.425m` center volume) |
| **`"marker"`** | `spike`, `mark` | `x` *(default)*, `t` (`t-mark`, `t_mark`), `circle` (`ring`, `dot`), `puck` (`disc`, `cylinder`) | `0.15m` | `0.25m` | $(x, y + 0.50h, z)$ (`0.075m` floor level) |

*\*When a prop uses `shape: "sphere"` and omits `height`, its height automatically defaults to its diameter $2 \times \text{radius}$ (`0.70m` for default `0.35m` radius).*

#### Entity Visual Presentation Styles (`style:`)
Every entity can customize its diorama rendering mode via `style:` while maintaining full backward compatibility (omitting `style:` applies the optimized directorial default):

| `kind` | `style` Option | Default | Accepted Aliases | Visual Description in 3D Diorama |
| :--- | :--- | :---: | :--- | :--- |
| **`"character"`** | `mannequin` | **Yes** | — | Stylized architectural figure (translucent torso capsule, shoulder bar, head sphere, pure white $+Z$ eye visor wedge, and ground gaze arrow). |
| | `edges` | No | `hologram`, `cad` | Soft 20% transparent body with crisp CAD contour lines (`<Edges threshold={20} />`). |
| | `silhouette` | No | `ink`, `flat` | High-contrast dark matte body (`#0f172a`) with illuminated pure white eye visor cone, ideal for framing and composition studies. |
| | `wireframe` | No | `wire`, `lines` | Pure blueprint geometric wireframe cage. |
| **`"prop"`** | `edges` | **Yes** | — | Soft 20% transparent volume with crisp Drei `<Edges threshold={15} color={color} />` outlines. |
| | `glass` | No | `ghost`, `translucent` | Classic StageFlow 45% translucent volume without outline edges. |
| | `solid` | No | `opaque`, `matte` | Dense 88% opaque solid architectural mass with soft lighting highlights. |
| | `wireframe` | No | `wire`, `lines` | Blueprint architectural wireframe mesh cage. |
| **`"marker"`** | `tape` | **Yes** | — | Authentic theatrical/cinematic flat floor gaffer tape mark directly on the stage floor ($Y = 0.005\text{m}$). |
| | `glow` | No | `pulse`, `luminous` | Flat floor tape mark paired with an illuminated soft emissive halo disc ($Y = 0.002\text{m}$). |
| | `beacon` | No | `pin`, `stand`, `puck` | Floor mark paired with an elevated vertical glowing beacon pin ($0.44\text{m}$) and illuminated sphere tip. |

#### 3.4.1 3D Spatial Dimensions & Shape-Matched Footprints
Entities support full 3-dimensional control ($X, Y, Z$) to author realistic character proportions (broad vs. slender) and realistic prop geometries (conference tables, partition walls, area rugs):

| Authoring Syntax | Syntax Description & Behavior | Examples |
| :--- | :--- | :--- |
| **`size: [w, h, d]`** | 3-element vector specifying metric **width**, **height**, and **depth** in meters. | `size: [2.2, 0.78, 0.9]` *(conference table)*<br>`size: [0.55, 1.82, 0.45]` *(character proportions)* |
| **`size: [w, d]`** | 2-element vector specifying horizontal floor footprint (**width** and **depth**). Preserves default height. | `size: [2.0, 3.0]` *(area rug footprint)*<br>`size: [0.6, 0.6]` *(square column)* |
| **`width`, `height`, `depth`** | Explicit scalar properties in meters. Override any values in `size`. `length` is accepted as an alias for `depth`. | `width: 2.4, height: 0.8, depth: 1.0`<br>`width: 1.5, height: 1.0` *(square box prop: depth defaults to width)* |
| **`radius` derivation** | When `radius` is omitted, bounding radius is automatically derived as $r = \frac{\max(w, d)}{2}$. When `width` and `depth` are omitted, both default strictly to $2r$. | `radius: 0.35` $\implies w = 0.70\text{m}, d = 0.70\text{m}$ |

- **Ground-Pinned Base Invariant**: Character feet and prop bases remain strictly pinned to floor elevation $Y = 0$. Adjusting `height` scales exclusively upward into $+Y$.
- **Rigid Anatomical Head & Shoulder Preservation**: For character mannequins, adjusting `height` dynamically telescopes the capsule torso while rigidly preserving head sphere ($r = 0.14\text{m}$) and shoulder thickness ($0.08\text{m}$) at un-squashed $Y \equiv 1.0$ proportions, completely preventing pancake distortion when sitting or crouching.
- **Shape-Matched Ground Footprints**: Box props render an oriented rectangular polygon footprint matching the box dimensions and rotation in both 3D diorama and 2D SVG minimap. Circular props and mannequins render an elliptical footprint ($r_x = w/2, r_z = d/2$) when $w \ne d$.

---

## 4. Camera System (Optics, Maneuvers & Easing)

StageFlow uses a unified spherical camera model across both the Illustrative Stage Camera and the Viewport Observer Camera.

### 4.1 Master Camera Cue Field Reference

| YAML Field | Type | Units | Applies To | Accepted Aliases | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`maneuver`** | `string` | — | Both | `style` | Trajectory path geometry (see §4.3). Default: `dolly`. |
| **`easing`** | `string` | — | Both | — | Temporal velocity profile (see §4.4). Default: `smooth`. |
| **`target`** | `string \| array`| `m` | Both | — | Destination look-at anchor (entity ID, multi-entity array `["a", "b"]` for two-shots/group staging, `"center"`, or `[x,y,z]`). |
| **`from`** | `string \| array`| `m` | Both | — | Starting look-at anchor at shot start (glides from `from` to `target`, supports multi-entity centroid arrays). |
| **`target_offset`**| `[dx, dy, dz]` | `m` | Both | `targetOffset` | World-space metric offset added to target anchor. Resets to `[0,0,0]` on standard cuts if omitted (persists/glides in `continuous: true`). |
| **`target_offset_start`** | `[dx, dy, dz]` | `m` | Both | `targetOffsetStart` | Starting target offset vector. |
| **`target_offset_end`** | `[dx, dy, dz]` | `m` | Both | `targetOffsetEnd` | Ending target offset vector. |
| **`distance`** | `number` | `m` | Both | — | Destination radial distance from target (`0.4m` to `100.0m`). |
| **`distance_start`** | `number` | `m` | Both | — | Explicit starting distance. |
| **`distance_end`** | `number` | `m` | Both | — | Explicit ending distance. |
| **`pitch`** | `number` | `deg`| Both | — | Destination elevation angle (`-85°` to `+85°`). |
| **`pitch_start`** | `number` | `deg`| Both | `pitchStart` | Explicit starting elevation angle. |
| **`pitch_end`** | `number` | `deg`| Both | `pitchEnd` | Explicit ending elevation angle. |
| **`yaw`** | `number` | `deg`| Both | — | Destination azimuth angle. |
| **`yaw_start`** | `number` | `deg`| Both | `yawStart` | Explicit starting azimuth angle. |
| **`yaw_end`** | `number` | `deg`| Both | `yawEnd` | Explicit ending azimuth angle. |
| **`yaw_delta`** | `number` | `deg`| Both | `yawDelta` | Relative azimuthal rotation from starting yaw (e.g. `yaw_delta: 90`). |
| **`roll`** | `number` | `deg`| Both | `dutch` | Optical axis roll angle. Resets to `0°` on standard cuts if omitted (persists/glides in `continuous: true`). |
| **`roll_start`** | `number` | `deg`| Both | `rollStart` | Explicit starting roll angle. |
| **`roll_end`** | `number` | `deg`| Both | `rollEnd` | Explicit ending roll angle. |
| **`roll_delta`** | `number` | `deg`| Both | `rollDelta` | Relative roll delta (e.g. `roll_delta: 360` for complete barrel roll). |
| **`lens`** | `number \| string` | `mm` | Both | `focal_length`, `focalLengthMm` | Full-frame prime focal length. Swaps immediately and holds constant. |
| **`lens_start`** | `number \| string` | `mm` | Both | — | Starting focal length for motorized zoom. |
| **`lens_end`** | `number \| string` | `mm` | Both | — | Ending focal length for motorized zoom. |
| **`direction`** | `"cw" \| "ccw"` | — | Both | `clockwise`, `counterclockwise` | Azimuthal direction for `orbit`, `sweep`, and `spiral`. Default: `cw`. |
| **`revolutions`** | `number` | turns | Both | — | Number of full $360^\circ$ revolutions for `orbit` or `spiral`. |
| **`orbit_speed`** | `number` | `deg/s` | Both | `orbitSpeed` | Angular velocity in degrees per second for `orbit`. |
| **`breathe`** | `number` | ratio | Both | — | Distance breathing multiplier for `arc`/`swoop` (default: `1.12`) and impulse kick multiplier for `recoil` (default: `1.25`). |
| **`waypoints`** | `array` | — | Both | — | List of intermediate control poses for `maneuver: "spline"`. |
| **`frustum_depth`**| `number` | `m` | Stage only | `cone_length` | Depth of 3D gate frustum. `0` or omitted auto-matches distance to target. |
| **`frustum_color`**| `string` | hex | Stage only | — | Hex color token for frustum lines and focus frame (default: `"#f59e0b"`). |
| **`show_path`** | `boolean` | — | Stage only | `showPath` | Renders 3D dashed trajectory ribbon in diorama (default: `true`). |
| **`rig`** | `object` | — | Both | — | Physical camera mount (`tripod`, `track`, `spline_track`). See §4.9. |
| **`show_rig`** | `boolean` | — | Stage only | `showRig` | Toggles rendering of 3D tripod legs or floor rails and dolly cart in diorama (default: `true`). |
| **`focus`** | `string \| number \| array` | `m` | Stage only | `focus_target`, `focusTarget` | Subject entity ID/label, multi-entity array `["a", "b"]`, 3D coordinate `[x,y,z]`, or manual metric focus distance (`3.5` or `"3.5m"`). |
| **`focus_start`** | `string \| number \| array` | `m` | Stage only | `focusStart` | Starting focus target (single, multi-entity array, or coordinate) or metric distance for a rack focus pull. |
| **`focus_end`** | `string \| number \| array` | `m` | Stage only | `focusEnd` | Ending focus target (single, multi-entity array, or coordinate) or metric distance for a rack focus pull. |
| **`focus_distance`** | `number \| string` | `m` | Stage only | `focusDistance`, `focus_dist` | Explicit manual focus distance in meters (`0.4m` to `100.0m`). |
| **`focus_distance_start`** | `number \| string` | `m` | Stage only | `focusDistanceStart` | Starting manual focus distance in meters for a rack focus pull. |
| **`focus_distance_end`** | `number \| string` | `m` | Stage only | `focusDistanceEnd` | Ending manual focus distance in meters for a rack focus pull. |
| **`dof`** | `"shallow" \| "medium" \| "deep"` | — | Stage only | `depth_of_field`, `depthOfField` | Semantic Depth-of-Field preset (`shallow` = $f/2.8$, `medium` = $f/5.6$, `deep` = $\infty$). |
| **`aperture`** | `number \| string` | $f$-stop | Stage only | `f_stop`, `fStop`, `t_stop` | Numeric or string lens aperture $f$-stop (e.g. `2.8` or `"f/2.8"`, clamped to $[0.7, 64.0]$). |
| **`aperture_start`** | `number \| string` | $f$-stop | Stage only | `apertureStart`, `f_stop_start`, `dof_start` | Starting lens aperture $f$-stop for an iris ramp. |
| **`aperture_end`** | `number \| string` | $f$-stop | Stage only | `apertureEnd`, `f_stop_end`, `dof_end` | Ending lens aperture $f$-stop for an iris ramp. |

### 4.2 Aiming & Anchors (`target`, `from`, `target_offset`)

A camera look-at anchor $\vec{T}$ resolves in one of four ways:
1. **Entity Identifier or Label**: Automatically binds to the entity's intrinsic anchor (eye-level `0.90h` for characters; center-volume `0.50h` for props/markers). As the entity moves across the stage, the camera dynamically tracks their position.
2. **Multi-Entity Centroid Array (`["actor_a", "actor_b"]`)**: Computes the exact 3D world-space midpoint (centroid) across two or more active entities for dynamic two-shots and group framing.
3. **Stage Presets (`"center"`, `"origin"`, `"stage"`)**: Resolves to the stage center chest level: `[0.0, 1.0, 0.0]`.
4. **Explicit 3D Vector**: Authored as `[x, y, z]` or `{x, y, z}` in world meters.

#### World Target Offsets (`target_offset`)
The `target_offset: [dx, dy, dz]` vector displaces the resolved look-at anchor in world space:
- Use `target_offset: [0, 0.25, 0]` to establish lead headroom above an actor's eye-line.
- Use `target_offset: [0.4, 0, 0]` for Rule-of-Thirds lead-room in the direction of gaze.

#### Multi-Entity Centroid Framing (Dynamic Two-Shots & Group Staging)
When staging a conversation or standoff between two or more characters, directors think in terms of the conversational volume between them rather than locking onto a single actor. Authoring `target:` or `from:` as an array of entity identifiers computes the pure 3D centroid across their intrinsic eye anchors $\vec{A}_i(t)$:

$$\vec{T}_{\text{centroid}}(t) = \frac{1}{K} \sum_{i=1}^K \vec{A}_i(t)$$

```yaml
  - id: "two-shot-conversation"
    start: 0.0
    end: 4.0
    stage_camera:
      target: ["detective", "witness"]
      distance: 3.5
      pitch: 12
      yaw: 0
      lens: 35mm
      focus: ["detective", "witness"]
      dof: "shallow"
```

- **Dynamic 60fps Tracking**: If either character translates across the stage (via `blocking:`), the camera automatically tracks the shifting midpoint at 60fps without keyframing.
- **Single-to-Two-Shot Glides**: Staging `from: "detective"` and `target: ["detective", "witness"]` glides seamlessly from an intimate close-up to a wide conversational two-shot master.
- **Centroid Rack Focus**: Setting `focus: ["detective", "witness"]` places the orthogonal focus plane directly onto the conversational midpoint with thin-lens Depth-of-Field.


### 4.3 Maneuver Catalog

> For the exact closed-form trajectory equations $P(u)$, see [StageFlow Script Specification §5](?mode=spec#section-5).

| Maneuver | Accepted Aliases | Path Geometry | Evaluated Fields | Ignored Fields | Directorial Behavior & Defaults |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`cut`** | `static`, `hold` | Instantaneous destination hold | `target`, `distance`, `pitch`, `yaw`, `roll`, `lens` | `show_path` | Cuts immediately to destination pose and suppresses trajectory ribbon. |
| **`dolly`** | `straight`, `linear`, `push`, `pull` | Linear 3D interpolation | `target`, `from`, `distance_*`, `pitch_*`, `yaw_*`, `roll_*`, `lens_*` | `revolutions`, `orbit_speed`, `breathe` | Direct linear translation between start and destination poses. |
| **`arc`** | — | Quadratic Bezier curve | `yaw_start`, `yaw_end`, `breathe` | `revolutions`, `orbit_speed` | Bows outward by $14\%$ of chord with $16\%$ $+Y$ lift and mid-shot distance breathing (default `breathe: 1.12`). |
| **`swoop`** | — | Bezier curve with elevation crest | `yaw_start`, `yaw_end`, `breathe` | `revolutions`, `orbit_speed` | Same as `arc` plus a $+4.58^\circ$ mid-shot pitch elevation crest. |
| **`orbit`** | `turntable` | Turntable revolution | `direction`, `revolutions`, `orbit_speed`, `yaw_delta`, `yaw_*` | `from` | Revolves around target azimuthally following 7-step priority (§4.5). |
| **`sweep`** | `pan` | Sector sweep | Same as `orbit` | `from` | Azimuthal sweep sharing `orbit` kinematics. |
| **`spiral`** | `corkscrew` | Helical corkscrew | `direction`, `revolutions`, `distance_*`, `pitch_*` | `yaw`, `yaw_end` | Continuous azimuthal revolution (default `revolutions: 0.5`) while translating distance and pitch. |
| **`dive`** | `flyby` | Sinusoidal perigee dip | `distance_*`, `pitch_*` | `revolutions`, `breathe` | Dips $14\%$ closer at first quarter, pulls back at three quarters, and dips pitch by $-6.88^\circ$ at mid-shot. |
| **`recoil`** | `punch` | Impact shockwave damper | `breathe`, `distance_*` | `revolutions` | Default `breathe: 1.25`. Executes an immediate impulse kick backward before settling onto destination pose. |
| **`spline`** | `path` | $C^1$ Catmull-Rom spline | `waypoints`, `easing` | `yaw_delta`, `revolutions` | Interpolates smoothly through arbitrary waypoint sequence with shortest-arc angle unwrapping. |

### 4.4 Easing Velocity Profiles

> For the closed-form mathematical definitions $u = E(\tau)$, see [StageFlow Script Specification §5](?mode=spec#section-5).

| Easing | Accepted Aliases | Velocity Profile | Directorial Feel & Recommended Use Case |
| :--- | :--- | :--- | :--- |
| **`smooth`** *(Default)* | — | Symmetric raised cosine | Natural, organic acceleration and braking for general camera moves and character turns. |
| **`linear`** | — | Constant velocity | Unmodulated mechanical motion; ideal for continuous turntable orbits or mid-action cuts. |
| **`ease-in`** | `easein` | Cubic acceleration | Starts from a dead stop and accelerates into a cut or whip-pan exit. |
| **`ease-out`** | `easeout` | Cubic deceleration | Enters at high velocity from a cut and settles gently onto a final composition. |
| **`cruise`** | `trapezoid` | Trapezoidal dolly profile | Smooth $25\%$ ramp-up $\to$ constant steadicam/dolly track speed $\to$ smooth $25\%$ ramp-down. |
| **`accel`** | `ramp-up` | Smooth ramp into linear exit | $40\%$ raised-cosine ramp-up from rest into constant exit velocity (first half of a multi-shot move). |
| **`deccel`** | `decel`, `ramp-down` | Linear entry into smooth braking | Enters at constant speed from a preceding shot and brakes over the final $40\%$. |
| **`expo`** | — | Dramatic exponential S-curve | Slow build followed by a high-velocity mid-shot snap and soft landing. |
| **`pop`** | `bounce` | Elastic spring overshoot | Overshoots target slightly (up to $1.2\times$) before settling; ideal for whip-pans and impact reactions. |

### 4.5 Orbit Direction & Angle Resolution Priority

When authoring `maneuver: "orbit"` or `"sweep"`, the total rotation angle resolves in strict 7-step priority:

1. **`revolutions:`**: Multiplies full $360^\circ$ turns by the active `direction` (`"cw"` or `"ccw"`).
2. **`orbit_speed:`**: Multiplies angular velocity ($\text{deg/s}$) by shot duration $\Delta t$ in the active `direction`.
3. **`yaw_delta:`**: Rotates by the exact relative signed offset from the starting yaw.
4. **Explicit `direction:` + destination `yaw:` (or `yaw_end:`)**: Forces the camera to travel the long or short way around the circle to honor `"cw"` vs. `"ccw"`.
5. **Both `yaw_start:` and `yaw_end:` authored**: Interpolates directly across the authored span (`yaw_end - yaw_start`), preserving wide multi-quadrant sweeps without shortest-arc collapse.
6. **Destination `yaw:` without explicit direction**: Takes the shortest Euclidean arc ($[-180^\circ, +180^\circ]$).
7. **No angle parameters specified**: Defaults to a $\pm 45^\circ$ quarter-turn in the active `direction`.

```text
Floor Clock Azimuth Orientation (Looking down at stage floor):
                      -Z (Upstage / 12:00)
                               ▲
                               │
-X (Stage Left / 9:00) ◄───────┼───────► +X (Stage Right / 3:00) [Yaw = +90°]
                               │
                               ▼
                     +Z (Downstage / 6:00) [Yaw = 0°]

• "direction: cw"  (Clockwise): 12:00 -> 3:00 -> 6:00 (Decreasing yaw values)
• "direction: ccw" (Counter-Clockwise): 6:00 -> 3:00 -> 12:00 (Increasing yaw values)
```

### 4.6 Optics & Vertical Field of View Reference

StageFlow models a standard **35mm Full-Frame Sensor** ($36.0\text{mm}$ horizontal gate width). Varying the scene `aspect_ratio` adjusts the vertical sensor gate height and vertical FOV (see [StageFlow Script Specification §3](?mode=spec#section-3) for sensor gate projection math):

#### Vertical Field of View (FOV) Reference Table
| Focal Length | `16:9` Widescreen | `2.39:1` Scope | `4:3` Academy |
| :--- | :--- | :--- | :--- |
| **`12mm`** | `80.3°` | `64.2°` | `96.7°` |
| **`18mm`** | `58.7°` | `45.4°` | `73.7°` |
| **`24mm`** | `45.7°` | `34.8°` | `58.7°` |
| **`28mm`** | `39.8°` | `30.1°` | `51.5°` |
| **`35mm`** | `32.3°` | `24.3°` | `42.2°` |
| **`50mm`** | `22.9°` | `17.1°` | `30.2°` |
| **`85mm`** | `13.6°` | `10.1°` | `18.0°` |
| **`105mm`** | `11.0°` | `8.2°` | `14.7°` |
| **`135mm`** | `8.6°` | `6.4°` | `11.4°` |
| **`200mm`** | `5.8°` | `4.3°` | `7.7°` |

#### Focus Distance, Rack Focus & Depth of Field (`focus`, `dof`, `aperture`)
While `target:` controls where the camera **points** its composition, `focus:` controls where the lens is **focused** along the optical axis:
- **Subject-Driven Focus (`focus: "actor_a"`)**: Projects the subject's 3D position orthogonally onto the camera's forward sightline ($d_{\text{focus}} = (\vec{P}_{\text{focus}} - \vec{E}) \cdot \hat{F}$), eliminating off-axis cosine overshoot when an actor is framed on the left or right thirds.
- **Rack Focus (`focus_start` $\to$ `focus_end`)**: Smoothly pulls the focus plane from a foreground subject (`focus_start: "actor_a"`) to a background subject (`focus_end: "actor_b"`) across the shot using the shot's `easing` profile.
- **Depth of Field (`dof` & `aperture`)**:
  - `dof: "shallow"` ($f/2.8$): Isolates a single actor (`~0.60m` sharp zone at `50mm` / `3.0m`) and renders Near & Far DoF limit brackets in the 3D diorama.
  - `dof: "medium"` ($f/5.6$): Covers a standard two-shot conversation (`~1.24m` sharp zone at `50mm` / `3.0m`).
  - `dof: "deep"` ($\infty$, default): Everything from foreground to background is crisp.
  - Opt-in Stage Cam viewfinder bokeh blur can be toggled live via **`[ Blur ]`** (hotkey **`B`**) or enabled in the YAML root via `optics: { dof_blur: true }`.

### 4.7 Catmull-Rom Multi-Waypoint Spline (`maneuver: "spline"`)

The `spline` maneuver smoothly chains through an array of 3D control waypoints:

```yaml
  - id: "shot-spline"
    start: 0.0
    end: 12.0
    stage_camera:
      maneuver: "spline"
      easing: "cruise"
      distance_start: 5.5
      pitch_start: 24
      yaw_start: -20
      lens_start: 28mm
      waypoints:
        - { target: "actor_a", distance: 3.2, pitch: 12, yaw: 10, lens: 35mm }
        - { target: "actor_b", distance: 2.0, pitch: 4, yaw: -45, lens: 50mm }
        - { target: "desk", distance: 1.6, pitch: 18, yaw: 0, lens: 85mm }
```

- **Waypoint pose inheritance**: Omitted fields inside a waypoint inherit from the preceding waypoint in the list (or from starting pose $P_0$ for the first waypoint).
- **Shortest-arc angle unwrapping**: Consecutive yaw and roll values are unwrapped across all waypoints to prevent full $360^\circ$ spins across boundary transitions.
- **Timing allocation**: Normalized progress $u \in [0, 1]$ is distributed evenly across all waypoint segments.

### 4.8 Parsed Fields with No Runtime Effect

The following fields are parsed by `cameraCueParser.ts` for schema compatibility but currently have no active engine consumer:

| Field | Parsed In | Stored As | Current Engine Behavior | Recommended Workaround |
| :--- | :--- | :--- | :--- | :--- |
| **`track:`** | `CameraCueSpec` | `trackTarget` | Ignored. Camera targets that reference an entity always dynamically track their live coordinates. | To frame a static coordinate where an entity started, author an explicit `[x, y, z]` vector. |
| **`at:`** | `CameraWaypointSpec` | `at` | Ignored. Spline waypoints are partitioned into equal temporal intervals across the duration. | To alter waypoint duration, adjust overall shot duration or insert intermediate bridge waypoints. |

### 4.9 Physical Camera Rigs (Tripod, Dolly Track & Spline Track)

In standard spherical camera kinematics, setting `target: "hero"` causes the camera eye position to travel across the stage with the moving actor to maintain radial distance. In studio cinematography, however, directors frequently require **spatial decoupling**:
- A **tripod** must remain firmly anchored to a single spot on the stage floor while its head swivels to track an actor.
- A **dolly track** or **slider rail** must constrain camera travel to a straight or curved floor path, regardless of actor movements.
- A **trucking shot** may hold a fixed camera gaze while sliding along a rail, allowing actors to pass through the frame.

StageFlow solves this with the declarative `rig:` mount block.

#### 4.9.1 Supported Rig Mount Types

| Rig Type (`type \| kind \| mode`) | Authored Fields (& Aliases) | Movement Kinematics | 3D Blueprint Mount Rendered |
| :--- | :--- | :--- | :--- |
| **`tripod`** | `position: [x, y, z]` (`pos`, `at`, `eye`) | $\vec{E}(t) \equiv \vec{P}_{\text{tripod}}$ (strictly stationary in world space). | Tubular 3-legged tripod stand with floor pucks and vertical column. |
| **`track`** (`dolly`, `rail`, `slider`, `linear`) | `from: [x, y, z]` (`start`), `to: [x, y, z]` (`end`) | Linear translation along the rail: $\vec{E}(u) = (1 - u)\vec{A} + u\vec{B}$ via shot easing $u = E(\tau)$. | Parallel steel rails ($0.42\text{m}$ gauge) with orthogonal sleepers + 4-wheeled cart. |
| **`spline_track`** (`spline-track`, `curved_track`, `spline`) | `points: [[x,y,z], ...]` (`waypoints`) | Smooth Catmull-Rom curve along rail waypoints with uniform segment-index parameterization ($u \cdot N_{\text{seg}}$). | Curved floor rails with sleepers and wheeled cart following the path. |

#### 4.9.2 Target-Tracking vs. Fixed-Gaze Framing

- **Target-Tracking Mode (`target:` declared)**: The camera head uses inverse spherical projection at 60fps to derive `yaw`, `pitch`, and `distance` from eye to target ($\vec{T} - \vec{E}$), panning and tilting to track the subject while the mount stays on its tripod or rail.
- **Fixed-Gaze Mode (`target:` omitted)**: The camera holds or transitions fixed `yaw` and `pitch` (and Dutch `roll`), projecting its target anchor forward along the sightline at distance $d$. This enables pure lateral trucking shots, push/pulls, or drive-bys where actors cross through the frame without pulling camera orientation.

#### 4.9.3 Continuous Rig Chaining (`continuous: true`)

On continuous linear dolly tracks (`continuous: true`), omitting `from:` automatically inherits the previous shot's terminal eye position $\vec{E}_{\text{prev}}$:

```yaml
shots:
  - id: "tripod-follow"
    start: 0.0
    end: 6.0
    stage_camera:
      target: "hero"
      rig:
        type: "tripod"
        position: [0, 1.5, 4.5]
      lens: 50mm
  - id: "dolly-track-oner"
    continuous: true
    end: 12.0
    stage_camera:
      target: "hero"
      rig:
        type: "track"
        to: [3.5, 1.2, 4.5]
      lens: 35mm
```

#### 4.9.4 Visual Mount Visibility (`show_rig`, `stage.show_rigs`)

3D tripod stands and dolly rails render automatically in the diorama. You can suppress them selectively without affecting camera kinematics:
- **Per-Shot**: Set `show_rig: false` (or `camera: { show_rig: false }`) on any individual cue.
- **Per-Scene**: Set `stage: { show_rigs: false }` to suppress all physical mount meshes globally.
- **Stage Cam POV**: In `'stage-pov'` viewfinder mode, rig meshes are automatically unmounted to guarantee an unobstructed shot composition.

---

## 5. Film Coverage (Shots, Cuts & Continuous Oners)

The `shots:` array defines the film camera cuts, lens mounts, and editorial coverage.

### 5.1 Shot Cue Field Reference

| Field | Type | Default | Accepted Aliases | Description |
| :--- | :--- | :--- | :--- | :--- |
| **`id`** | `string` | `"shot-N"` | — | Unique shot identifier. |
| **`shot`** | `number` | Index + 1 | — | Numeric shot counter shown in `#xx` chips. |
| **`label`** | `string` | `"Shot N"` | `name` | Human-readable shot title. |
| **`description`** | `string` | `""` | `note` | Directorial staging summary displayed in top-left HUD. |
| **`start`** | `number` | `0.0` | `_start` | Cue start timestamp in seconds. |
| **`end`** | `number` | `start + 5.0` | `_end` | Cue end timestamp in seconds (clamped to $\ge \text{start} + 0.1$). |
| **`continuous`** | `boolean` | Inherits root | — | When `true`, auto-chains start time and camera kinematics from previous shot. |
| **`stage_camera`**| `object` | Baseline | `stageCamera`, `camera` | Physical camera choreography within the diorama (optical/rig fields `focus*`, `dof`, `aperture*`, `rig`, `show_rig` may also be authored flat at the shot root). |
| **`observer_camera`**| `object` | Baseline | `observerCamera` | Legacy per-shot viewport camera choreography. |
| **`entities`** | `object` | `{}` | — | Per-shot actor movement overrides and focus tags (see §6.4). |

### 5.2 Pose Inheritance: Standard vs. Continuous Mode

#### Standard Mode (`continuous: false`, Default)
- In standard mode, each shot represents an independent editorial setup.
- If a shot declares a single value (`distance: 3.5`, `pitch: 8`, `yaw: 45`), the camera holds that value statically from `start` to `end`.
- To animate camera position in standard mode, both start and end bounds must be authored (`distance_start` + `distance_end`).
- Omitting a parameter entirely inherits the terminal pose of the preceding shot.
- Omitted Dutch angles (`roll`) and framing offsets (`target_offset`) reset cleanly to neutral baselines ($0^\circ$ and $[0, 0, 0]$) at shot boundaries (Option A).

#### Continuous Mode (`continuous: true` at Root or on a Shot)
- Opt-in single-take "oner" mode declared at the score root or on individual shots.
- **Contiguous timeline auto-chaining**: Omitted `start` timestamps automatically inherit the previous shot's `end` timestamp (`shots[0]` defaults to `0.0s`). Explicit `start:` timestamps remain strictly respected.
- **Physical camera parameter chaining**: For moving maneuvers (`maneuver !== 'cut'`), omitting `distance_start`, `pitch_start`, or `yaw_start` automatically pulls starting values from the previous shot's terminal pose.
- **Unbroken Dutch Angle & Offset Continuity**: In continuous mode, the camera operates as an unbroken physical rig. `roll` and `target_offset` persist across boundaries without snapping to neutral. Omitting `roll` holds the angle; declaring `roll: 0` glides smoothly back to level horizon.
- **Shot-Level Hybrid Flexibility**: Setting `continuous: true` on an individual shot creates a multi-beat continuous sequence inside an otherwise standard cut scene. Setting `continuous: false` on a shot overrides root continuous mode to author an independent cut.

```yaml
# Standard Mode: Explicit start/end required for motion
shots:
  - id: "shot-1"
    start: 0.0
    end: 5.0
    stage_camera: { target: "hero", distance_start: 4.0, distance_end: 2.5, lens: 35mm }
```

```yaml
# Continuous Mode: Automatically chains start time and camera position
continuous: true
shots:
  - id: "shot-1"
    end: 5.0
    stage_camera: { target: "hero", distance: 4.0, pitch: 12, yaw: 0, roll: 15, lens: 35mm }
  - id: "shot-2"
    end: 10.0
    # Automatically starts at t=5.0s, starting distance 4.0m, pitch 12°, yaw 0°, roll 15°
    stage_camera: { target: "hero", maneuver: "dolly", distance: 2.2, pitch: 6, yaw: 45, lens: 50mm }
```

```yaml
# Hybrid Scene: Standard cuts with an opt-in continuous 2-beat oner
shots:
  - id: "shot-1" # Cut (Wide)
    start: 0.0
    end: 4.0
    stage_camera: { target: "hero", distance: 5.0, pitch: 10, yaw: 0 }
  - id: "shot-2" # Cut (Medium with Dutch angle)
    start: 4.0
    end: 8.0
    stage_camera: { target: "hero", distance: 2.5, pitch: 14, yaw: -25, roll: 12 }
  - id: "shot-3" # Cut to start of Steadicam move
    start: 8.0
    end: 12.0
    stage_camera: { target: "hero", maneuver: "dolly", distance: 1.8, pitch: 10, yaw: 30, roll: 10 }
  - id: "shot-4" # Continuous extension of shot-3!
    continuous: true # Starts at 12.0s; glides from shot-3 pose and preserves 10° roll
    end: 16.0
    stage_camera: { target: "door", maneuver: "dolly", distance: 1.4, yaw: 75 }
  - id: "shot-5" # Standard Cut! (Roll cleanly resets to 0° baseline)
    start: 16.0
    end: 20.0
    stage_camera: { target: "hero", distance: 4.0, pitch: 15, yaw: 0 }
```

### 5.3 Consolidated Boundary Reset Matrix

At shot boundaries, parameters behave according to Option A deterministic reset semantics:

| Parameter | At Shot Boundary when Omitted (Standard Cut) | In Continuous Mode (`continuous: true`) | How to Persist or Animate |
| :--- | :--- | :--- | :--- |
| **`distance` / `pitch` / `yaw`** | Holds authored value statically | Glides from previous terminal pose | Author explicit `*_start` and `*_end` spans |
| **`roll` (Dutch angle)** | **Resets to `0°` (Level horizon)** | **Glides / holds preceding roll** | Re-declare `roll: <deg>`, or author `roll_start` / `roll_end` |
| **`target_offset`** | **Resets to `[0, 0, 0]`** | **Glides / holds preceding offset** | Re-declare `target_offset`, or author `target_offset_start` / `target_offset_end` |
| **`lens` (Focal length)** | Holds previous prime focal length | Holds previous prime focal length | Declare `lens: <f>` for discrete prime mount; author `lens_start` + `lens_end` for zoom |
| **`target`** | **Cuts instantly to new anchor point** | **Cuts instantly unless `from:` is specified** | Author `from: "<prev_anchor>"` to smoothly pan across subjects |

---

## 6. Decoupled Timelines (Blocking & Observer Moves)

StageFlow provides two independent timeline layers that span continuously across film cuts: root `blocking:` for actor kinematics and root `observer_shots:` for diorama viewport movement.

```text
Time (s)       0.0s          3.0s          6.0s          9.0s          12.0s
Film Cuts      ├── Shot 01 ──┼── Shot 02 ──┼── Shot 03 ──┼── Shot 04 ──┤
               (35mm Wide)   (50mm Arc)    (85mm OTS)    (135mm CU)
                     ▲             ▲             ▲             ▲
Actor Blocking └──────────────── Arthur Cross-Room Walk ───────────────┘
(blocking:)    (Continuous velocity, unbroken 16-segment floor trail across cuts)
                     ▲             ▲             ▲             ▲
Diorama View   └─────────────── Continuous 180° Master Orbit ───────────┘
(observer_shots) (Smooth diorama rotation independent of film camera switches)
```

### 6.1 Decoupled Actor & Prop Blocking (`blocking:`)

Root-level `blocking:` cues define physical translation and gaze rotation independent of film cuts.

#### Format A: Single-Entity Cue
```yaml
blocking:
  - id: "hero-cross"
    entity: "detective"        # Entity ID or label (alias: actor, subject, entity_id)
    start: 0.0
    duration: 9.0              # Duration in seconds (alias: dur; or specify end: 9.0)
    from: [-1.2, 0, 0]         # Optional starting position (defaults to previous cue end)
    position: [2.5, 0, 0.4]    # Destination position at end of cue
    height: 1.15               # Dynamic crouching posture over cue duration (alias: size)
    rotation: 45               # Explicit destination facing angle in degrees (alias: yaw)
    look_at: "witness"         # Dynamic continuous gaze tracking (alias: lookAt)
    easing: "cruise"           # Movement easing curve
    highlighted: true          # Active focus ring and tag (alias: highlight)
    visible: true              # Proxy visibility toggle
    note: "Crosses and ducks behind desk" # Staging note (alias: description)
```

#### Format B: Multi-Entity Beat
```yaml
blocking:
  - id: "beat-confrontation"
    start: 9.0
    duration: 5.0              # Duration in seconds (or end: 14.0)
    easing: "smooth"
    entities:
      detective: { rotation: 0, look_at: "witness", height: 1.75 }
      witness: { rotation: 180, highlighted: true }
```

#### Dynamic Posture & Dimension Transformations
Actors and props can dynamically transform dimensions during `blocking:` cues:
- **Animated Posture Changes**: Authoring `height: 1.15` causes an actor to smoothly crouch down or sit in a chair over the cue duration using the specified easing curve. Specifying `from_height` or `from_size` explicitly sets starting bounds; omitting them glides smoothly from the preceding cue's terminal dimensions.
- **Rigid Anatomical Proportions (Telescoping Torso)**: When lowering an actor's height to sit on a chair or crouch behind cover (e.g. `height: 1.15`), StageFlow automatically protects anatomical proportions: the head sphere ($r = 0.14\text{m}$) and eye-visor cone remain perfectly spherical ($Y \equiv 1.0$) and the shoulder bar maintains standard thickness ($0.08\text{m}$). The torso column telescopes cleanly between the floor and shoulders without squashing the head or neck into a pancake.
- **Per-Axis Forward Chaining**: Overriding one dimension (e.g. `height: 1.15`) does not reset other dimensions (`width`, `depth`) back to default; each axis preserves its active state across cues.
- **Dynamic Look-At & Focus Tracking**: The Stage Camera's look-at target and thin-lens DoF focus plane dynamically follow the entity's moving anchor ($\vec{A}_i(t) = (x_i(t), y_i(t) + \text{ratio} \cdot h_i(t), z_i(t))$). As an actor crouches, the camera smoothly lowers its framing and maintains sharp optical focus on the actor's head.

```yaml
blocking:
  # Beat 1: Arthur crosses over toward desk chair at standing height (1.75m)
  - id: "arthur-walks-to-chair"
    entity: "arthur"
    start: 0.0
    duration: 3.5
    from: [-3.0, 0, 0]
    position: [-0.6, 0, 0]
    easing: "cruise"
    look_at: "desk"

  # Beat 2: Arthur sits down in the chair (height smoothly telescopes 1.75m -> 1.15m)
  - id: "arthur-sits"
    entity: "arthur"
    start: 3.5
    duration: 1.5
    position: [0.0, 0, 0]
    height: 1.15
    rotation: 90
    easing: "smooth"
    note: "Sits down; torso telescopes while head & shoulders retain rigid anatomy"
```

#### Continuous Auto-Chaining & Instant Cuts (`continuous: true` & `cut: true`)
Just like camera tracks, `blocking:` supports continuous timeline auto-chaining and instant jump cut placement:
- **Timestamp Auto-Chaining**: In continuous mode (`continuous: true` at score root or on the cue), omitting `start:` automatically chains `startSec = prevBlockEndSec` with monotonic time advancement (`Math.max`), allowing beats down the document to flow sequentially forward in time.
- **Instant Cut Placement (`cut: true`)**: For montage jump cuts or instant relocations without walking, declare `cut: true`. The entity manifests immediately at `position` at `startSec` (`startPos = position`), cross-stage sliding is prevented, the floor trail is suppressed (`trailPoints = []`), and auto-facing toward the previous room is disabled.
- **Continuous Override**: Setting `continuous: false` on a cue breaks continuity to author an independent scene setup or flashback.

```yaml
continuous: true

blocking:
  # Beat 1: Smooth walk across room
  - id: "beat-01"
    duration: 4.0
    entities:
      ruby: { position: [2, 0, 0] }

  # Beat 2: Montage jump cut to kitchen (auto-chains start: 4.0s)
  - id: "beat-02-kitchen"
    duration: 3.5
    entities:
      ruby: { cut: true, position: [-5, 0, 1], rotation: 180 }
```

### 6.2 The Two-Pass Kinematic Evaluator

When evaluating root `blocking:` cues at timestamp $t$, the engine executes a decoupled two-pass pipeline (see [StageFlow Script Specification §6](?mode=spec#section-6)):
- **Pass 1 (World Positions & Visibility Chains)**: Evaluates chronological position spans and visibility toggles across all entities. During uncued intervals, entities persist their preceding terminal coordinates.
- **Pass 2 (Facing Rotations & $C^0$ Gaze Handoffs)**: Once all world positions are known for every entity, gaze headings are solved continuously. When a cue specifying `look_at` concludes, its terminal facing yaw is sampled and forward-chained, ensuring seamless transition handoffs into subsequent holds or turns.
- **Ground Movement Trails**: While an entity translates inside an active cue with displacement $> 0.05\text{m}$, the diorama draws a **16-segment dashed floor movement trail** representing the full physical trajectory across all active camera cuts. During holds and stationary gaps, trails clear (`[]`).

### 6.3 Blocking Precedence & Hybrid Overlays

When root `blocking:` is declared in a score:
1. `blocking:` claims **exclusive authority** over entity translation, facing rotation, and floor trails.
2. Per-shot entity overrides in `shots[].entities` for `position`, `from`, `rotation`, and `look_at` are **ignored**.
3. Per-shot focus flags (`highlighted: true`) and staging notes (`note: "..."`) in `shots[].entities` layer non-destructively on top of the physical blocking movement.

### 6.4 Legacy Per-Shot Entity Overrides (`shots[].entities`)

When root `blocking:` is omitted, entities are animated via per-shot maps inside `shots:`:

```yaml
shots:
  - id: "shot-1"
    start: 0.0
    end: 5.0
    entities:
      detective:
        from: [-1.2, 0, 0]     # Start position for this shot (alias: from_position)
        position: [0.5, 0, 0]  # Destination position by end of this shot
        rotation: 45           # Facing angle in degrees
        look_at: "witness"     # Continuous gaze tracking
        easing: "smooth"
        highlighted: true
        visible: true
        note: "Approaches desk"
```

- Motion spans the complete duration of the shot ($[t_{\text{start}}, t_{\text{end}}]$).
- Entities inherit their terminal position and facing angle into the subsequent shot unless overridden with `from:`.
- `highlighted:` defaults to `false` for each shot unless explicitly re-declared.

### 6.5 Decoupled Diorama Viewport Moves (`observer_shots:`)

The Observer Camera (user viewport diorama view) resolves via a strict 3-tier hierarchy:

1. **Tier 1 (Root `observer_shots:`)**: If declared and non-empty, the viewport camera evaluates exclusively across these cues. Per-shot `observer_camera:` blocks inside `shots:` are ignored.
2. **Tier 2 (Per-Shot `shots[].observer_camera`)**: Evaluated when root `observer_shots:` is omitted.
3. **Tier 3 (Baseline Default)**: Holds static at `stage.observer_camera`.

```yaml
observer_shots:
  - id: "obs-master-orbit"
    start: 0.0
    end: 16.0
    target: "center"
    maneuver: "orbit"
    easing: "cruise"
    distance: 8.5
    pitch: 28
    yaw_start: 30
    yaw_end: 150
    lens: 35mm
```

#### Continuous Multi-Beat Diorama Flights (`continuous: true`)
Just like film coverage shots, `observer_shots:` supports continuous timeline auto-chaining and physical rig continuity (camera fields may be written directly at the cue level or nested under `camera:` / `observer_camera:`):
- **Timestamp Auto-Chaining**: When `continuous: true` is active (at root or on the cue), omitting `start:` on cue $k \ge 1$ automatically chains from `prevObserverShot.endSec`.
- **Rig Continuity**: Dutch roll (`roll`) and framing offsets (`target_offset`) smoothly persist and glide across continuous observer cues rather than snapping to zero.
- **Intentional Gaps**: Specifying explicit `start:` preserves deliberate stationary hold periods where the diorama camera stays parked until the next move begins.

```yaml
observer_shots:
  - id: "obs-01-turntable"
    start: 0.0
    end: 10.0
    target: "center"
    maneuver: "orbit"
    distance: 10.0
    pitch: 25

  - id: "obs-02-dolly-in"
    continuous: true # Auto-chains start: 10.0s and smoothly glides from 10m to 5.5m!
    end: 18.0
    target: "hero"
    maneuver: "dolly"
    distance: 5.5
    pitch: 18
```

> **Note:** During time gaps between observer shots, the viewport camera holds the terminal resting pose ($P_{\text{end}}$) of the last completed observer cue and automatically forward-chains into subsequent cues.

---

## 7. Director's Cookbook (8 Production Recipes)

Copy-pasteable directorial recipes demonstrating core cinematography patterns.

### Recipe 1: Classic Over-the-Shoulder (OTS) Coverage Pair

Two complementary coverage setups across a conversational axis. The camera mounts an `85mm` telephoto lens to compress the background past Subject B onto Subject A, cutting instantaneously on edit.

```yaml
shots:
  - id: "shot-1-ots-a"
    shot: 1
    label: "OTS on Subject A"
    description: "85mm Over-the-Shoulder past Subject B onto Subject A."
    start: 0.0
    end: 4.0
    stage_camera:
      target: "actor_a"
      maneuver: "cut"
      distance: 2.4
      pitch: 4
      yaw: 72
      lens: 85mm
    entities:
      actor_a:
        highlighted: true
        look_at: "actor_b"

  - id: "shot-2-ots-b"
    shot: 2
    label: "Reverse OTS on Subject B"
    description: "Reverse cut to 85mm OTS past Subject A onto Subject B."
    start: 4.0
    end: 8.0
    stage_camera:
      target: "actor_b"
      maneuver: "cut"
      distance: 2.4
      pitch: 4
      yaw: -72
      lens: 85mm
    entities:
      actor_a:
        highlighted: false
      actor_b:
        highlighted: true
        look_at: "actor_a"
```
*(Reference Blueprint: `blueprint_02_dialogue.yaml` in Score Library)*

---

### Recipe 2: Vertigo Dolly-Zoom (Contrazoom / Trombone)

Dollies the camera forward closer to the subject (`4.5m -> 1.8m`) while widening optical focal length (`85mm -> 24mm`). The subject remains constant in framing size while background perspective expands dramatically.

```yaml
shots:
  - id: "shot-vertigo"
    shot: 1
    label: "Vertigo Dolly-Zoom on Lead"
    description: "Camera pushes in from 4.5m to 1.8m while zooming out from 85mm to 24mm."
    start: 0.0
    end: 6.0
    stage_camera:
      target: "hero"
      maneuver: "dolly"
      easing: "smooth"
      distance_start: 4.5
      distance_end: 1.8
      pitch: 5
      yaw: 0
      lens_start: 85mm
      lens_end: 24mm
      show_path: true
```
*(Reference Blueprint: `blueprint_05_two_rooms.yaml` in Score Library)*

---

### Recipe 3: Walk-and-Talk Steadicam Leading Track

The lead character walks downstage (`z: -2.0m -> +2.0m`) while a `28mm` wide-angle stage camera moves backward in front of them, maintaining a constant `2.2m` lead distance.

```yaml
shots:
  - id: "shot-walk-talk"
    shot: 1
    label: "28mm Steadicam Lead Track"
    description: "Camera leads walking actor downstage maintaining constant 2.2m distance."
    start: 0.0
    end: 6.0
    stage_camera:
      from: "hero"
      target: "hero"
      maneuver: "dolly"
      easing: "cruise"
      distance: 2.2
      pitch: 6
      yaw: 15
      lens: 28mm
      show_path: true
    entities:
      hero:
        from: [0, 0, -2.0]
        position: [0, 0, 2.0]
        easing: "cruise"
        highlighted: true
```
*(Reference Blueprint: `blueprint_05_two_rooms.yaml` in Score Library)*

---

### Recipe 4: 360° Low-Angle Hero Turntable Orbit

Executes a full $360^\circ$ clockwise turntable revolution around the subject at an upward-looking $-12^\circ$ low hero pitch.

```yaml
shots:
  - id: "shot-hero-orbit"
    shot: 1
    label: "360° Low-Angle Hero Orbit"
    description: "Full 360-degree clockwise turntable revolution at -12° low hero pitch."
    start: 0.0
    end: 8.0
    stage_camera:
      target: "hero"
      maneuver: "orbit"
      easing: "smooth"
      distance: 2.8
      pitch: -12
      yaw_start: 0
      revolutions: 1.0
      direction: "cw"
      lens: 35mm
```
*(Reference Blueprint: `blueprint_04_cinematography_tutorial.yaml` in Score Library)*

---

### Recipe 5: Multi-Waypoint Catmull-Rom Spline Master Shot

Threads a continuous camera flight path from a wide establishing overview, gliding past Subject B, and settling into a tight close-up on Subject A.

```yaml
shots:
  - id: "shot-master-spline"
    shot: 1
    label: "Continuous 3-Stop Master Spline"
    description: "Catmull-Rom spline gliding from wide center to Subject B and landing on Subject A."
    start: 0.0
    end: 12.0
    stage_camera:
      from: "center"
      maneuver: "spline"
      easing: "cruise"
      distance_start: 6.5
      pitch_start: 28
      yaw_start: 0
      lens_start: 24mm
      waypoints:
        - target: "actor_b"
          distance: 3.2
          pitch: 10
          yaw: -35
          lens: 35mm
        - target: "actor_a"
          distance: 1.9
          pitch: 4
          yaw: 25
          lens: 50mm
```
*(Reference Blueprint: `blueprint_02_dialogue.yaml` in Score Library)*

---

### Recipe 6: Multi-Cut Scene with Decoupled Continuous Observer Orbit

Permits 4 rapid camera cuts to occur inside the diorama while a single, seamless $180^\circ$ diorama master orbit rotates overhead across all cuts without interruption.

```yaml
version: "1.0"
id: "action-dialogue-orbit"
title: "Multi-Cut Confrontation with Master Orbit"
duration: 12.0

stage:
  observer_camera:
    target: [0, 1.0, 0]
    distance: 9.0
    pitch: 28
    yaw: 30
    lens: 35mm

# --- Layer A: Film Coverage (4 rapid cuts) ---
shots:
  - id: "shot-1"
    start: 0.0
    end: 3.0
    stage_camera: { target: "actor_a", distance: 5.5, pitch: 10, yaw: 0, lens: 35mm }
  - id: "shot-2"
    start: 3.0
    end: 6.0
    stage_camera: { target: "actor_a", distance: 2.2, pitch: 6, yaw: 65, lens: 85mm }
  - id: "shot-3"
    start: 6.0
    end: 9.0
    stage_camera: { target: "actor_b", distance: 2.2, pitch: 6, yaw: -65, lens: 85mm }
  - id: "shot-4"
    start: 9.0
    end: 12.0
    stage_camera: { target: "actor_a", distance: 1.8, pitch: 2, yaw: 45, lens: 135mm }

# --- Layer B: Decoupled Diorama Observer Track ---
observer_shots:
  - id: "diorama-turntable"
    start: 0.0
    end: 12.0
    maneuver: "orbit"
    easing: "cruise"
    target: "center"
    distance: 8.5
    pitch: 26
    yaw_start: 25
    yaw_end: 205
    lens: 35mm
```
*(Reference Blueprint: `blueprint_02_dialogue.yaml` in Score Library)*

---

### Recipe 7: Continuous Single-Take Oner (`continuous: true`)

A continuous multi-phase steadicam take. Omitted `start` timestamps auto-chain from preceding shot end times, moving maneuvers auto-chain physical coordinates from the preceding terminal pose, and prime lenses mount discretely.

```yaml
version: "1.0"
id: "continuous-oner-sequence"
title: "The Breakthrough — Steadicam Oner"
continuous: true
aspect_ratio: "2.39:1"
duration: 24.0

entities:
  - id: "scientist"
    label: "Dr. Aris"
    kind: "character"
    position: [-1.2, 0, -0.5]
    rotation: 90
    color: "#38bdf8"
  - id: "terminal"
    label: "Mainframe Terminal"
    kind: "prop"
    position: [0.8, 0, -0.5]
    height: 1.1
    color: "#94a3b8"

shots:
  # Phase 1: Establishing Arc (0.0s to 7.0s)
  - id: "phase-1-arc"
    end: 7.0
    stage_camera:
      target: "scientist"
      maneuver: "arc"
      distance_start: 4.5
      distance_end: 3.2
      pitch_start: 18
      pitch_end: 10
      yaw_start: -40
      yaw_end: 30
      lens: 35mm

  # Phase 2: Push-In Dolly (7.0s to 14.0s)
  # - Starts at t=7.0s, starting distance 3.2m, pitch 10°, yaw 30°
  # - Lens mounts 50mm prime immediately and holds steady
  - id: "phase-2-push"
    end: 14.0
    stage_camera:
      target: "scientist"
      maneuver: "dolly"
      easing: "cruise"
      distance: 1.8
      pitch: 4
      yaw: 65
      lens: 50mm

  # Phase 3: 180° CCW Orbit and Pan to Terminal (14.0s to 24.0s)
  # - from: "scientist" pans look-at smoothly to "terminal"
  # - direction: "ccw" forces rotation counter-clockwise past subject
  - id: "phase-3-reveal"
    end: 24.0
    stage_camera:
      from: "scientist"
      target: "terminal"
      maneuver: "orbit"
      direction: "ccw"
      distance: 2.8
      pitch: 12
      yaw: 220
      lens: 35mm
```
*(Reference Blueprint: `blueprint_04_cinematography_tutorial.yaml` in Score Library)*

---

### Recipe 8: Decoupled Multi-Actor Walk Across Cuts (`blocking:`)

Stages a continuous 10-second cross-stage walk for Arthur using root `blocking:` while the film camera cuts three times (`35mm` Wide $\to$ `50mm` Arc $\to$ `85mm` Close-Up). Velocity and floor movement trails remain unbroken across edits.

```yaml
version: "1.0"
id: "decoupled-blocking-scene"
title: "Continuous Actor Walk Across 3 Camera Cuts"
duration: 14.0

entities:
  - id: "arthur"
    label: "Arthur"
    kind: "character"
    position: [-8.0, 0, 0]
    rotation: 90
    color: "#38bdf8"
  - id: "ruby"
    label: "Ruby"
    kind: "character"
    position: [4.0, 0, 0]
    rotation: -90
    color: "#f43f5e"

# --- Physical Blocking Timeline ---
blocking:
  - id: "arthur-walk"
    entity: "arthur"
    start: 0.0
    end: 10.0
    position: [1.5, 0, 0]
    easing: "cruise"
    look_at: "ruby"

  - id: "final-turn"
    start: 10.5
    end: 14.0
    entities:
      arthur: { rotation: 0, easing: "smooth" }
      ruby: { rotation: 0, easing: "smooth" }

# --- Film Camera Coverage ---
shots:
  - id: "shot-1-wide"
    start: 0.0
    end: 3.5
    stage_camera: { target: "arthur", maneuver: "dolly", distance_start: 5.5, distance_end: 4.2, pitch: 10, yaw: 0, lens: 35mm }

  - id: "shot-2-profile"
    start: 3.5
    end: 7.5
    stage_camera: { target: "arthur", maneuver: "arc", distance: 2.8, pitch: 6, yaw_start: -25, yaw_end: 25, lens: 50mm }
    entities:
      arthur:
        highlighted: true   # Overlays active focus ring during Shot 2 without interrupting walk

  - id: "shot-3-closeup"
    start: 7.5
    end: 14.0
    stage_camera: { target: "arthur", maneuver: "orbit", distance: 2.0, pitch: 4, yaw_start: 25, yaw_end: 0, lens: 85mm }
```
*(Reference Blueprint: `blueprint_05_two_rooms.yaml` in Score Library)*
