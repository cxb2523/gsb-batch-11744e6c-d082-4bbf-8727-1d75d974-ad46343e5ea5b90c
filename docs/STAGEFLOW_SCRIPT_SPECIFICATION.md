# StageFlow Script Technical & Mathematical Specification

This document is the authoritative **Single Source of Truth (SSOT)** for the formal mathematical model, coordinate transformations, optical equations, kinematic evaluators, and normalized Abstract Syntax Tree (AST) contract of **StageFlow Choreography Scores (`*.yaml`)**. It defines how the stateless runtime evaluator computes 3D spatial state $\text{Frame}_t = f(t, \text{score})$ without prescribing directorial choices.

> **Companion Authoring Manual**: For declarative YAML syntax, field aliases, quickstart templates, and production cinematography recipes, see the [**StageFlow YAML Score Authoring Manual**](?mode=guide) (Guide tab / `?mode=guide`).

---

## 1. Coordinate System & Units

StageFlow operates in a right-handed, $Y$-up 3D Cartesian coordinate space $\mathbb{R}^3$ with origin $(0, 0, 0)$ at the center of the stage floor:

| Axis / Dimension | Symbol | Positive ($+$) Direction | Negative ($-$) Direction | Authored Unit | Normalized AST Unit |
| :--- | :---: | :--- | :--- | :---: | :---: |
| **Horizontal (Width)** | $X$ | Stage Right ($+X$) | Stage Left ($-X$) | Meters ($\text{m}$) | Meters ($\text{m}$) |
| **Vertical (Elevation)** | $Y$ | Upward / Overhead ($+Y$) | Below Floor ($-Y$, floor is $Y = 0$) | Meters ($\text{m}$) | Meters ($\text{m}$) |
| **Depth** | $Z$ | Downstage / Front ($+Z$) | Upstage / Back ($-Z$) | Meters ($\text{m}$) | Meters ($\text{m}$) |
| **Time** | $t$ | Forward timeline progression | — | Seconds ($\text{s}$) | Seconds ($\text{s}$) |
| **Angle** | $\theta, \psi, \gamma$ | Authored in degrees ($\text{deg}$) | Converted via $\text{rad} = \text{deg} \cdot \frac{\pi}{180}$ | Degrees ($\text{deg}$)* | Radians ($\text{rad}$) |
| **Focal Length** | $f_{\text{mm}}$ | 35mm full-frame equivalent | — | Millimeters ($\text{mm}$) | Millimeters ($\text{mm}$) |

*\*Numeric angle fields in YAML are interpreted in degrees by default; string values suffixed with `"rad"` (e.g., `"1.57rad"`) are parsed directly as radians.*

---

## 2. Spherical Camera Model & Forward Kinematics

Every camera state (both `stageCamera` and `observerCamera`) is parameterized by a 6-tuple spherical pose:

$$P = \left(\vec{T},\; d,\; \theta,\; \psi,\; \gamma,\; f_{\text{mm}}\right)$$

- $\vec{T} = (T_x, T_y, T_z) \in \mathbb{R}^3$: Look-at target anchor point in meters.
- $d \in [0.4, 100.0]\text{ m}$: Radial distance from $\vec{T}$ to the camera nodal point $\vec{E}$.
- $\theta \in [-85^\circ, +85^\circ]$ ($\left[-1.4835, +1.4835\right]\text{ rad}$): Pitch (elevation angle above/below the horizontal plane of $\vec{T}$).
  - $\theta > 0$: Camera is elevated above $\vec{T}$, looking downward.
  - $\theta < 0$: Camera is positioned below $\vec{T}$, looking upward.
- $\psi \in (-\infty, +\infty)$: Yaw (horizontal azimuth angle around the world $Y$-axis relative to $+Z$).
  - $\psi = 0^\circ$: Camera is placed at $(T_x,\; y,\; T_z + d\cos\theta)$, looking toward $-Z$.
  - $\psi = +90^\circ$ ($+\frac{\pi}{2}\text{ rad}$): Camera is placed on the $+X$ side of $\vec{T}$, looking toward $-X$.
  - $\psi = -90^\circ$ ($-\frac{\pi}{2}\text{ rad}$): Camera is placed on the $-X$ side of $\vec{T}$, looking toward $+X$.
  - $\psi = \pm 180^\circ$ ($\pm\pi\text{ rad}$): Camera is placed on the $-Z$ side of $\vec{T}$, looking toward $+Z$.
- $\gamma \in (-\infty, +\infty)$: Optical roll (Dutch angle) around the forward sightline vector $\vec{F} = \frac{\vec{T} - \vec{E}}{\|\vec{T} - \vec{E}\|}$.
  - $\gamma = 0^\circ$: Level horizon.
  - $\gamma > 0^\circ$: Clockwise camera bank from the operator's point of view.
- $f_{\text{mm}} \in [12, 200]\text{ mm}$: Full-frame lens focal length.

### 2.1 Spherical-to-Cartesian Projection
Given pose $P$ (with $\theta, \psi, \gamma$ in radians), the 3D world-space camera eye position $\vec{E} = (x_{\text{eye}}, y_{\text{eye}}, z_{\text{eye}})$ is:

$$
\begin{aligned}
x_{\text{eye}} &= T_x + d \cos(\theta) \sin(\psi) \\
y_{\text{eye}} &= T_y + d \sin(\theta) \\
z_{\text{eye}} &= T_z + d \cos(\theta) \cos(\psi)
\end{aligned}
$$

The unrolled orthonormal camera basis vectors $(\vec{R}_0, \vec{U}_0)$ and the roll-transformed camera up-vector $\vec{U}_{\text{rolled}}$ are:

$$\vec{R}_0 = \begin{bmatrix} \cos\psi \\ 0 \\ -\sin\psi \end{bmatrix}, \quad \vec{U}_0 = \begin{bmatrix} -\sin\theta\sin\psi \\ \cos\theta \\ -\sin\theta\cos\psi \end{bmatrix}, \quad \vec{U}_{\text{rolled}} = \cos(\gamma)\vec{U}_0 + \sin(\gamma)\vec{R}_0$$

Varying $\gamma$ rotates $\vec{U}_{\text{rolled}}$ in the plane orthogonal to $\vec{F}$ while preserving $\vec{E}$ and $\vec{T}$ invariance.

### 2.2 Inverse Projection (Cartesian-to-Spherical)
Given $\vec{E}$ and $\vec{T}$ with displacement $\Delta\vec{p} = \vec{E} - \vec{T} = (\Delta x, \Delta y, \Delta z)$:

$$d = \sqrt{\Delta x^2 + \Delta y^2 + \Delta z^2}, \quad d_{xz} = \sqrt{\Delta x^2 + \Delta z^2}, \quad \theta = \operatorname{atan2}(\Delta y, d_{xz}), \quad \psi = \operatorname{atan2}(\Delta x, \Delta z)$$

### 2.3 Physical Camera Rigs & Inverse Look-At Kinematics
When a camera cue mounts onto a physical studio rig (`CameraRigSpec`), camera eye position $\vec{E}(t)$ is constrained directly in world space rather than calculated as a spherical offset from the subject:
1. **Stationary Tripod (`type: "tripod"`)**: Eye position is held stationary at the authored world coordinate:
   $$\vec{E}(t) \equiv \vec{P}_{\text{tripod}} = (x_0, y_0, z_0)$$
2. **Linear Dolly Track (`type: "track"`)**: Camera cart glides along a linear rail from $\vec{A}$ to $\vec{B}$ with eased progress $u = E(\tau)$:
   $$\vec{E}(u) = (1 - u)\vec{A} + u\vec{B}$$
   When `continuous: true` is active on a track and `from:` is omitted, $\vec{A}$ automatically inherits the preceding shot's terminal eye position $\vec{E}_{\text{prev}}$ to prevent spatial cuts.
3. **Curved Spline Dolly Track (`type: "spline_track"`)**: Camera cart glides along a multi-point Catmull-Rom rail:
   $$\vec{E}(u) = \operatorname{CatmullRom}\left(\mathbf{P}_0, \mathbf{P}_1, \mathbf{P}_2, \mathbf{P}_3, \tau\right)$$
4. **Inverse Look-At Orientation**:
   - **Target-Tracking Mode (`target:` present)**: With evaluated eye $\vec{E}(u)$ and target anchor $\vec{T}(u)$, orientation is resolved via inverse projection $\operatorname{cartesianToSpherical}(\vec{E}(u), \vec{T}(u), f_{\text{mm}}, \gamma)$, automatically panning and tilting the camera head to center the subject.
   - **Fixed / Animated Gaze Mode (`target:` omitted)**: With fixed or eased angles $(\theta(u), \psi(u))$, target $\vec{T}(u)$ is projected forward along the sightline at distance $d$:
     $$T_x = E_x - d\cos\theta\sin\psi, \quad T_y = E_y - d\sin\theta, \quad T_z = E_z - d\cos\theta\cos\psi$$

---

## 3. Optical Sensor & Film Gate Geometry

StageFlow models a standard 35mm full-frame sensor with horizontal gate width $W_{\text{sensor}} = 36.0\text{ mm}$.

1. **Sensor Height ($H_{\text{sensor}}$)**:
   Given scene aspect ratio $\text{AR} = \frac{W}{H}$ (e.g., $16:9 \implies 1.7778$, $2.39:1 \implies 2.39$):
   $$H_{\text{sensor}} = \frac{36.0\text{ mm}}{\text{AR}}$$

2. **Vertical Field of View ($\text{FOV}_{\text{vert}}$ in degrees)**:
   $$\text{FOV}_{\text{vert}} = 2 \arctan\left(\frac{H_{\text{sensor}}}{2 f_{\text{mm}}}\right) \cdot \frac{180}{\pi}$$

3. **Projected Spatial Gate Dimensions at Distance $D$ (in meters)**:
   At radial distance $D$ from the camera eye $\vec{E}$, the rectangular field of view covers a physical plane of width $W_{\text{gate}}$ and height $H_{\text{gate}}$:
   $$W_{\text{gate}}(D) = D \cdot \frac{36.0}{f_{\text{mm}}}, \qquad H_{\text{gate}}(D) = D \cdot \frac{H_{\text{sensor}}}{f_{\text{mm}}} = \frac{W_{\text{gate}}(D)}{\text{AR}}$$

4. **Orthogonal Focus Plane Distance & Rack Focus ($d_{\text{focus}}(t)$)**:
   Given camera eye $\vec{E}(t)$, look-at target $\vec{T}(t)$, unit optical axis $\hat{F}(t) = \frac{\vec{T}(t) - \vec{E}(t)}{\|\vec{T}(t) - \vec{E}(t)\|}$, and focus target point $\vec{P}_{\text{focus}}(t)$, the orthogonal focus plane distance is:
   $$d_{\text{focus}}(t) = \operatorname{clamp}\!\left((\vec{P}_{\text{focus}}(t) - \vec{E}(t)) \cdot \hat{F}(t),\; 0.4,\; 100.0\right)$$
   During a rack focus from start focus anchor $d_{\text{start}}(t)$ to end focus anchor $d_{\text{end}}(t)$ with eased progress $u = E(\tau)$:
   $$d_{\text{focus}}(t) = (1 - u)\,d_{\text{start}}(t) + u\,d_{\text{end}}(t)$$

5. **Gaussian Thin-Lens Depth of Field ($H, D_{\text{near}}, D_{\text{far}}$)**:
   With focal length $f = f_{\text{mm}} / 1000\text{ m}$, Circle of Confusion $c = 3.0 \times 10^{-5}\text{ m}$ ($0.03\text{ mm}$), and aperture $f$-stop $N \in [0.7, 64.0]$ (`"shallow"` $= 2.8$, `"medium"` $= 5.6$, `"deep"` $= \infty$):
   $$H = \frac{f^2}{N \cdot c} + f, \qquad D_{\text{near}} = \frac{(H - f)\,d_{\text{focus}}}{H + d_{\text{focus}} - 2f}, \qquad D_{\text{far}} = \begin{cases} \frac{(H - f)\,d_{\text{focus}}}{H - d_{\text{focus}}} & d_{\text{focus}} < H \\ \infty & d_{\text{focus}} \ge H \end{cases}$$
   For a fragment at view-space depth $z > 0$, the physical Circle of Confusion blur radius normalized by sensor height $H_{\text{sensor}}$ is:
   $$\beta(z) = \min\!\left(0.022,\; \frac{f_{\text{mm}}^2}{N \cdot H_{\text{sensor}} \cdot (1000\,d_{\text{focus}} - f_{\text{mm}})} \cdot \frac{|z - d_{\text{focus}}|}{z}\right)$$

---

## 4. Entities, Anchors & Orientation

Each entity $i$ declared in `entities` has a normalized kind $k_i \in \{\text{"character"}, \text{"prop"}, \text{"marker"}\}$ (normalizing aliases: $\text{"actor"}/\text{"person"} \to \text{"character"}$, $\text{"set"}/\text{"furniture"}/\text{"item"}/\text{"object"} \to \text{"prop"}$, $\text{"spike"}/\text{"mark"} \to \text{"marker"}$), an optional geometric shape $s_i$ (for props: $\text{"box"}$, $\text{"sphere"}$, $\text{"cylinder"}$, $\text{"capsule"}$; for markers: $\text{"x"}$, $\text{"t"}$, $\text{"circle"}$, $\text{"puck"}$), presentation style (character: $\text{"mannequin"}$, $\text{"edges"}$, $\text{"silhouette"}$, $\text{"wireframe"}$; prop: $\text{"edges"}$, $\text{"glass"}$, $\text{"solid"}$, $\text{"wireframe"}$; marker: $\text{"tape"}$, $\text{"glow"}$, $\text{"beacon"}$), floor/base coordinate $\vec{p}_i = (x_i, y_i, z_i)$, height $h_i$, radius $r_i$, and horizontal facing angle $\psi_{\text{entity}, i}$.

### 4.1 Default Geometry & Intrinsic Look-At Anchor ($\vec{A}_i$)
When a camera `target` or `from` references an entity by `id` or `label` (in either baseline `stage` cameras or shot cues), it resolves to the entity's intrinsic 3D anchor $\vec{A}_i$:

| Normalized `kind` | Default `height` ($h$) | Default `radius` ($r$) | Default `width` ($w$) | Default `depth` ($d$) | Anchor Elevation Ratio | Resolved Look-At Anchor $\vec{A}_i$ |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `"character"` | $1.75\text{ m}$ | $0.26\text{ m}$ | $0.52\text{ m}$ | $0.52\text{ m}$ | $0.90 h$ | $(x_i,\; y_i + 0.90 h_i,\; z_i)$ *(default $y = 1.575\text{ m}$ eye level)* |
| `"prop"` | $0.85\text{ m}$* | $0.35\text{ m}$ | $0.70\text{ m}$ | $0.70\text{ m}$ | $0.50 h$ | $(x_i,\; y_i + 0.50 h_i,\; z_i)$ *(default $y = 0.425\text{ m}$)* |
| `"marker"` | $0.15\text{ m}$ | $0.25\text{ m}$ | $0.50\text{ m}$ | $0.50\text{ m}$ | $0.50 h$ | $(x_i,\; y_i + 0.50 h_i,\; z_i)$ *(default $y = 0.075\text{ m}$)* |

*\*Sphere Prop Height Rule: When $k_i = \text{"prop"}$ and $s_i = \text{"sphere"}$ with `height` omitted, default height equals the sphere diameter $h_i = 2 r_i$ (default $0.70\text{ m}$, anchor elevation $y = 0.35\text{ m}$).*

- **Stage Preset Anchor**: `target: "center"` (or `"origin"`, `"stage"`) resolves universally in both baseline `stage` cameras and shot cues to $\vec{A}_{\text{center}} = (0,\; 1.0,\; 0)$.
- **Explicit Coordinate Anchor**: `target: [x, y, z]` resolves directly to $(x,\; y,\; z)$.
- **Multi-Entity Centroid Anchor**: When `target` or `from` is specified as an array of entity identifiers `["id_1", "id_2", ..., "id_K"]` ($K \ge 2$), the resolved anchor is the pure 3D world-space centroid across all $K$ entities' active intrinsic anchors $\vec{A}_i(t)$:
  $$\vec{T}_{\text{centroid}}(t) = \frac{1}{K} \sum_{i=1}^K \vec{A}_i(t)$$
  This formulation enables dynamic two-shot framing, group conversation tracking at 60fps, and single-to-two-shot glides without hardcoded coordinates. Unknown entity IDs in the array are gracefully omitted; if all IDs fail to resolve, the anchor falls back to the default stage target. Centroid averaging applies symmetrically to `target`, `from`, `focus` (orthogonal focus plane projection), and entity `look_at`.
- **Target Offset Displacement**: Adding `target_offset: [dx, dy, dz]` shifts the resolved anchor in world space:
  $$\vec{T}_{\text{effective}} = \vec{A} + (\text{dx},\; \text{dy},\; \text{dz})$$

### 4.2 Entity Facing Angle (`rotation` & `look_at`)
- An entity with $\psi_{\text{entity}} = 0^\circ$ faces $+Z$ (downstage). $+90^\circ$ faces $+X$ (stage right). $-90^\circ$ faces $-X$ (stage left). $\pm 180^\circ$ faces $-Z$ (upstage).
- **Dynamic Gaze (`look_at`)**: When an entity specifies `look_at: "<target_id>"` (or `[x, y, z]`) at position $\vec{p}_{\text{target}}$, its horizontal facing yaw at time $t$ is computed continuously as:
  $$\psi_{\text{entity}}(t) = \operatorname{atan2}\!\left(x_{\text{target}}(t) - x_{\text{self}}(t),\; z_{\text{target}}(t) - z_{\text{self}}(t)\right)$$
- **Automatic Locomotion Heading**: If an entity translates during a cue ($\|\vec{p}_{\text{end}, xz} - \vec{p}_{\text{start}, xz}\| > 0.05\text{ m}$) and neither `rotation` nor `look_at` is specified for that cue, $\psi_{\text{entity}}$ automatically aligns with the displacement vector $\operatorname{atan2}(\Delta x, \Delta z)$.

### 4.3 3D Spatial Dimensions, Ground Footprints & Blocking Scale Transformations
Entities in StageFlow can specify custom 3-dimensional extents ($X, Y, Z$) at baseline and dynamically animate them during blocking cues:

- **Polymorphic Declaration**:
  - `size: [w, h, d]` defines full 3D bounding dimensions in metric meters.
  - `size: [w, d]` sets floor footprint dimensions (width and depth), preserving default height.
  - Explicit scalar keys `width` ($w$), `height` ($h$), and `depth` / `length` ($d$) override vector components. For box props, omitting `depth` defaults symmetrically to `width` ($d = w$).
  - When `radius` is omitted, bounding radius is automatically derived as $r = \frac{\max(w, d)}{2}$. When `width` and `depth` are omitted, both default strictly to $2r$.
- **Ground-Pinned Base Invariant ($Y = 0$) & Rigid Mannequin Anatomy**:
  - Scaling along $Y$ (elevation) scales exclusively upward: character feet and prop bases remain strictly pinned to floor elevation $Y = 0$ ($y_{\text{base}} = y_i$).
  - Scaling along $X$ (lateral) and $Z$ (sagittal) expands symmetrically from the entity's central pivot axis.
  - **Rigid Anatomical Proportions & Telescoping Torso**: While prop volumes scale uniformly along $Y$, character mannequins enforce strict anatomical preservation: the head sphere ($r = 0.14\text{m}$) and eye-visor cone maintain an un-squashed $Y \equiv 1.0$ aspect ratio at $Y_{\text{head}} = h(t) - 0.16\text{m}$, and the shoulder cross-bar retains $0.08\text{m}$ thickness at $Y_{\text{shoulder}} = h(t) - 0.40\text{m}$. Only the lower capsule torso column telescopes dynamically ($s_{\text{torso}, y} = \frac{h(t) - 0.35}{1.40}$) to bridge the distance from the floor, completely eliminating pancake-head distortion when sitting or crouching.
- **Shape-Matched Ground Footprints**:
  - Box props render an oriented rectangular polygon footprint $\operatorname{OBB}(\vec{p}_{xz}, w, d, \psi)$ in both 3D diorama and 2D SVG minimap.
  - Non-uniform circular props and mannequins render an elliptical footprint ($r_x = w/2, r_z = d/2$) when $w \ne d$, and a standard circular footprint when $w = d$.
- **Decoupled Blocking Cue Dimension Transformations**:
  - `blocking:` cues and shot-level `entities:` overrides can animate dimensions over time via `size: [w, h, d]`, `from_size: [w, h, d]`, or per-axis `width`, `height`, `depth`, `from_width`, `from_height`, `from_depth`.
  - Dimensions interpolate smoothly at 60fps using the cue's easing curve $u = E(\tau)$:
    $$w(t) = w_{\text{start}} + u \cdot (w_{\text{end}} - w_{\text{start}}), \quad h(t) = h_{\text{start}} + u \cdot (h_{\text{end}} - h_{\text{start}}), \quad d(t) = d_{\text{start}} + u \cdot (d_{\text{end}} - d_{\text{start}})$$
  - Individual dimension axes forward-chain independently across cues: modifying `height` in a cue preserves previously overridden `width` and `depth`.
- **Dynamic Look-At Anchor & Thin-Lens Focus Tracking**:
  - When an entity scales or crouches during a cue, its intrinsic look-at anchor $\vec{A}_i(t)$ updates dynamically on every frame:
    $$\vec{A}_i(t) = \left(x_i(t),\; y_i(t) + \text{ratio} \cdot h_i(t),\; z_i(t)\right)$$
  - Cameras targeting or focusing on entity $i$ smoothly follow changing posture and elevation without visual lag.

---

## 5. Temporal Easing & Trajectory Maneuvers

At parse time, camera shot durations (`shots` and `observer_shots`) are clamped to $\Delta t_{\text{parsed}} = \max(0.1,\; t_{\text{end}} - t_{\text{start}})$, and standalone `blocking` cues are clamped to $\Delta t_{\text{parsed}} = \max(0.016,\; t_{\text{end}} - t_{\text{start}})$. At runtime, for a cue spanning $[t_{\text{start}}, t_{\text{end}}]$ with guard $\Delta t = \max(0.016,\; t_{\text{end}} - t_{\text{start}})$, normalized progress $\tau \in [0, 1]$ is:

$$\tau = \operatorname{clamp}\left(\frac{t - t_{\text{start}}}{\Delta t},\; 0,\; 1\right)$$

### 5.1 Easing Functions ($u = E(\tau)$)

| Normalized `easing` | Closed-Form Mathematical Definition $u = E(\tau)$ for $\tau \in [0, 1]$ |
| :--- | :--- |
| `"smooth"` *(default)* | $u = \frac{1}{2}\left(1 - \cos(\pi \tau)\right)$ |
| `"linear"` | $u = \tau$ |
| `"ease-in"` | $u = \tau^3$ |
| `"ease-out"` | $u = 1 - (1 - \tau)^3$ |
| `"expo"` | $u = \begin{cases} 0 & \tau = 0 \\ \frac{1}{2} 2^{20\tau - 10} & 0 < \tau < 0.5 \\ 1 - \frac{1}{2} 2^{-20\tau + 10} & 0.5 \le \tau < 1 \\ 1 & \tau = 1 \end{cases}$ |
| `"pop"` | $u = \begin{cases} 0 & \tau = 0 \\ \operatorname{clamp}\!\left(1 - e^{-6\tau}\cos(2.5\pi\tau),\; 0,\; 1.2\right) & 0 < \tau < 1 \\ 1 & \tau = 1 \end{cases}$ |
| `"cruise"` | With $p = 0.25$ and $v_c = \frac{1}{1 - p} = \frac{4}{3}$:<br>$u = \begin{cases} \frac{v_c}{2}\left(\tau - \frac{p}{\pi}\sin\frac{\pi\tau}{p}\right) & \tau < p \\ \frac{v_c p}{2} + v_c(\tau - p) & p \le \tau \le 1 - p \\ 1 - \frac{v_c p}{2} + \frac{v_c}{2}\left(\tau' + \frac{p}{\pi}\sin\frac{\pi\tau'}{p}\right) & \tau > 1 - p,\; \tau' = \tau - (1 - p) \end{cases}$ |
| `"accel"` | With $p = 0.40$ and $v_c = \frac{1}{1 - p/2} = 1.25$:<br>$u = \begin{cases} \frac{v_c}{2}\left(\tau - \frac{p}{\pi}\sin\frac{\pi\tau}{p}\right) & \tau < p \\ \frac{v_c p}{2} + v_c(\tau - p) & \tau \ge p \end{cases}$ |
| `"deccel"` | With $p = 0.40$ and $v_c = \frac{1}{1 - p/2} = 1.25$:<br>$u = \begin{cases} v_c \tau & \tau \le 1 - p \\ v_c(1 - p) + \frac{v_c}{2}\left(\tau' + \frac{p}{\pi}\sin\frac{\pi\tau'}{p}\right) & \tau > 1 - p,\; \tau' = \tau - (1 - p) \end{cases}$ |

### 5.2 Angular Unwrapping Operators
1. **Shortest-Arc Difference** ($\Delta_{\text{short}}(\alpha_1, \alpha_0) \in [-\pi, \pi]$):
   $$\Delta_{\text{short}}(\alpha_1, \alpha_0) = \left((\alpha_1 - \alpha_0 + \pi) \bmod 2\pi\right) - \pi$$
2. **Directed Orbit Difference** ($\Delta_{\text{dir}}(\alpha_1, \alpha_0, \text{dir})$):
   When `direction` is `"ccw"` (increasing yaw, $+Z \to +X \to -Z$), forces $\Delta \in (0, +2\pi]$. When `"cw"` (decreasing yaw, $+Z \to -X \to -Z$), forces $\Delta \in [-2\pi, 0)$. If `direction` is omitted, falls back to $\Delta_{\text{short}}$.

### 5.3 Camera Trajectory Maneuvers ($P(u)$ from $P_0 \to P_1$)
Across all maneuvers, focal length and roll interpolate as:
$$f_{\text{mm}}(u) = f_0 + u(f_1 - f_0), \qquad \gamma(u) = \begin{cases} \gamma_0 + u(\gamma_1 - \gamma_0) & \text{if } \texttt{roll\_delta} \text{ or } (\texttt{roll\_start} \land \texttt{roll\_end}) \\ \gamma_0 + u\,\Delta_{\text{short}}(\gamma_1, \gamma_0) & \text{otherwise} \end{cases}$$

| Normalized `maneuver` | Trajectory Equations $P(u)$ for $u \in [0, 1]$ |
| :--- | :--- |
| `"cut"` | $P(u) = P_1$ *(instantaneous hold at destination pose; trajectory path line suppressed)* |
| `"dolly"` / `"straight"` | $\vec{T}(u) = (1-u)\vec{T}_0 + u\vec{T}_1$, $\quad d(u) = d_0 + u(d_1 - d_0)$, $\quad \theta(u) = \theta_0 + u(\theta_1 - \theta_0)$, $\quad \psi(u) = \psi_0 + u\,\Delta_{\text{short}}(\psi_1, \psi_0)$ |
| `"arc"` | Quadratic Bezier target $\vec{T}(u) = (1-u)^2\vec{T}_0 + 2(1-u)u\vec{C} + u^2\vec{T}_1$ where $\vec{C} = \vec{M} + (0.14 L \hat{r}_x,\; 0.16 L,\; 0.14 L \hat{r}_z)$ with chord $L = \|\vec{T}_1 - \vec{T}_0\|$ and midpoint $\vec{M} = \frac{\vec{T}_0 + \vec{T}_1}{2}$. Distance breathes via $d(u) = \big(d_0 + u(d_1 - d_0)\big)\big(1 + (b - 1)\sin(\pi u)\big)$ where $b = \texttt{breathe}$ (default $1.12$). $\theta(u)$ and $\psi(u)$ match `"dolly"`. |
| `"swoop"` | Identical to `"arc"` ($b$ default $1.12$), plus a mid-flight elevation crest: $\theta(u) = \theta_0 + u(\theta_1 - \theta_0) + 0.08\sin(\pi u)\text{ rad}$ ($\approx +4.58^\circ$). |
| `"orbit"` / `"sweep"` | Linear $\vec{T}(u), d(u), \theta(u)$. Azimuthal rotation $\psi(u) = \psi_{\text{start}} + \Delta\psi(u)$, where $\Delta\psi(u)$ resolves in strict **7-step priority**:<br>(1) $\operatorname{sign}(\texttt{dir}) \cdot 2\pi \cdot \texttt{revolutions} \cdot u$,<br>(2) $\operatorname{sign}(\texttt{dir}) \cdot \omega_{\text{orbit}} \cdot \Delta t \cdot u$,<br>(3) $\Delta\psi_{\text{delta}} \cdot u$,<br>(4) $\Delta_{\text{dir}}(\psi_1, \psi_0, \texttt{dir}) \cdot u$ when explicit `direction` and destination yaw are set,<br>(5) $(\psi_1 - \psi_0) \cdot u$ when both `yaw_start` and `yaw_end` are set,<br>(6) $\Delta_{\text{short}}(\psi_1, \psi_0) \cdot u$ when destination yaw is set without explicit `direction`,<br>(7) $\operatorname{sign}(\texttt{dir}) \cdot \frac{\pi}{4} u$ ($\pm 45^\circ$ default quarter-turn) when no yaw parameter is given.<br>Sign is $-1$ for `"cw"` (default) and $+1$ for `"ccw"`. |
| `"spiral"` | Helical orbit with $\Delta\psi(u) = \operatorname{sign}(\texttt{dir}) \cdot (\texttt{revolutions} ?? 0.5) \cdot 2\pi u$, combined with linear interpolation of $\vec{T}(u), d(u), \theta(u)$. |
| `"dive"` | Perigee swoop: $d(u) = \big(d_0 + u(d_1 - d_0)\big)\big(1 - 0.14\sin(2\pi u)\big)$ and $\theta(u) = \theta_0 + u(\theta_1 - \theta_0) - 0.12\sin(\pi u)\text{ rad}$. |
| `"recoil"` | Impulse damper: $d(u) = d_0 + u(d_1 - d_0) + (b - 1)\,d_0 \cdot 3.5\tau e^{-5\tau}$ where $b = \texttt{breathe}$ (default $1.25$). |
| `"spline"` | Piecewise $C^1$ Catmull-Rom spline over pose chain $[P_0, W_1, W_2, \dots, W_m]$ defined in `waypoints`, with sequential $\Delta_{\text{short}}$ unwrapping on $\psi$ and $\gamma$: $q(s) = \frac{1}{2}\big(2q_1 + (-q_0 + q_2)s + (2q_0 - 5q_1 + 4q_2 - q_3)s^2 + (-q_0 + 3q_1 - 3q_2 + q_3)s^3\big)$. |

---

## 6. Timeline Chaining & Boundary Semantics ($P_0 \to P_1 \to \dots \to P_k$)

StageFlow is a **stateless functional evaluator** (`Frame_t = f(t, score)`). Effective playhead time is $t_{\text{eff}} = \operatorname{clamp}(t_{\text{raw}} + t_{\text{offset}},\; 0,\; T_{\text{duration}})$, where $T_{\text{duration}}$ defaults to $\max(t_{\text{end}})$ across all three timelines (`shots`, `observer_shots`, and `blocking`). State at shot $k$ is deterministically chained forward from shot $k - 1$:

1. **3-Tier Entity Blocking Resolution & State Persistence**:
   - **Tier 1 (Root `blocking`)**: When `blocking` is defined and non-empty at the score root, entity movement and orientation evaluate across these decoupled time windows $[t_{\text{start}, c}, t_{\text{end}, c}]$ in a **Two-Pass Kinematic Evaluator**:
     - **Pass 1 (World Positions & Visibility)**: For each entity $i$, chronological cues $c_{i, 1} \dots c_{i, m}$ forward-chain $\vec{p}_{\text{start}, k} \to \vec{p}_{\text{end}, k}$ and `visible` starting from `entities[i]`. During un-cued gaps or after the final cue, the entity holds its preceding terminal pose $\vec{p}_{\text{end}, k}$.
     - **Pass 2 (Rotation & $C^0$ Gaze Handoff)**: Once all entity world positions $\vec{P}(j, t)$ are solvable for any $t$, each entity forward-chains $\psi_{\text{start}, k} \to \psi_{\text{end}, k}$. If cue $k$ specifies `look_at`, $\psi_{\text{end}, k}$ is sampled against $\vec{P}(\text{target}, t_{\text{end}, k} - 10^{-6})$, guaranteeing a $0\text{ rad}$ continuous handoff into subsequent holds or turns.
     - **Option A Ground Movement Trails**: While an entity is inside an active blocking cue ($t \in [t_{\text{start}, k}, t_{\text{end}, k})$) with displacement $> 0.05\text{ m}$, `trailPoints` renders the full 16-segment path of that blocking cue across any camera cuts, and clears (`[]`) during holds/gaps. When `cut: true` is declared on a cue, the entity manifests immediately at `position` at $t_{\text{start}}$ (`startPos = position`), cross-stage sliding is eliminated, the ground trail is suppressed (`trailPoints = []`), and auto-facing toward the old position is disabled.
     - **Continuous Auto-Chaining & Duration**: In `blocking:`, cues support `duration:` / `dur:`. When `continuous: true` is active (at root `continuous: true` or scoped `blocking[k].continuous: true`), omitting `start:` auto-chains sequentially from the previous cue's end timestamp (`startSec = prevBlockEndSec`), with monotonic advancement (`prevBlockEndSec = Math.max(prevBlockEndSec, endSec)`) preventing backward time-drift across interleaved multi-actor cues. Cue-level `continuous: false` explicitly breaks the continuous chain.
     - **Hybrid Per-Shot Focus Layering**: Per-shot `shots[k].entities.<id>.highlighted` and `note` overlay non-destructively onto the continuous blocking state.
   - **Tier 2 (Per-Shot `shots[].entities`)**: When root `blocking` is omitted, at the start of shot $k$, every entity inherits its terminal position $\vec{p}_{\text{end}, k-1}$, facing angle $\psi_{\text{end}, k-1}$, and `visible` flag from shot $k - 1$, unless overridden by `from` or placed via `cut: true` in `shots[k].entities.<id>`. `highlighted` is evaluated per-shot (defaults to `false` if omitted in shot $k$).
   - **Tier 3 (Static `entities`)**: Holds baseline position and rotation.
2. **Camera Spatial Chaining (`continuous: false` vs. `continuous: true`)**:
   - **Standard Mode (`continuous: false`, default)**: Each shot explicitly declares `start` and `end`. If a shot specifies single-value `distance`, `pitch`, or `yaw` without `*_start`, the camera starts and ends the shot at that value (unless `*_end` is also provided). Omitting a parameter inherits the previous shot's terminal value. Dutch angle (`roll`) and `target_offset` reset to neutral baselines ($0^\circ$ and $\vec{0}$) at shot boundaries when omitted (Option A).
   - **Continuous Mode (`continuous: true` at root, `shots[k].continuous: true`, or `observer_shots[k].continuous: true`)**:
     - **Timeline**: If `shots[0]` or `observer_shots[0]` omits `start`, $t_{\text{start}, 0} = 0.0$. If cue $k \ge 1$ omits `start`, $t_{\text{start}, k} = t_{\text{end}, k-1}$. Explicit `start` values are always honored. Cue-level `continuous: false` overrides root `continuous: true` to author an independent cut.
     - **Pose Flow**: For any moving maneuver (`maneuver !== "cut"`) on continuous cue $k \ge 1$, omitting `distance_start`, `pitch_start`, or `yaw_start` automatically binds the cue's starting pose $P_0$ to the previous cue's terminal pose $P_{\text{end}, k-1}$, interpolating smoothly to the newly authored destination.
     - **Unbroken Roll & Target Offset Continuity**: In continuous mode, `roll` and `target_offset` preserve across cue boundaries without snapping to zero. If omitted, they persist from $P_{\text{end}, k-1}$; if specified, they smoothly ease from the preceding terminal state to the newly authored destination.
3. **Discrete Prime Lens Mounting**:
   - Specifying `lens: 50mm` mounts that focal length immediately at $t_{\text{start}}$ and holds it constant ($f_0 = f_1 = 50\text{ mm}$).
   - Omitting `lens`, `lens_start`, and `lens_end` preserves the previous shot's terminal focal length.
   - Continuous optical zoom (or dolly-zoom) occurs only when both `lens_start` and `lens_end` are specified (or across `spline` waypoints).
4. **Look-At Target Snapping vs. Panning (`target` vs. `from`)**:
   - Specifying `target` without `from` snaps the look-at anchor to `target` at $t_{\text{start}}$ ($\vec{T}_0 = \vec{T}_1 = \vec{T}_{\text{target}}$). If the target is a moving entity, $\vec{T}(t)$ tracks the entity's live position throughout the shot.
   - Specifying both `from` and `target` interpolates the look-at anchor from $\vec{T}_{\text{from}}(t)$ to $\vec{T}_{\text{target}}(t)$.
5. **Shot-Boundary Reset vs. Continuous Flow of `roll` and `target_offset`**:
   - **Standard Cuts (`continuous: false`)**: Unlike $d, \theta, \psi$, both `roll` and `target_offset` reset to neutral baselines ($0\text{ rad}$ and $[0, 0, 0]$) at shot boundaries whenever omitted (Option A). To persist or animate them across a standard cut, specify `roll`, `roll_start`/`roll_end`, `roll_delta`, `target_offset`, or `target_offset_start`/`target_offset_end`.
   - **Continuous Mode (`continuous: true` at root or per-shot/cue `continuous: true`)**: On moving maneuvers ($k \ge 1$), both `roll` and `target_offset` preserve across cue boundaries—persisting from $P_{\text{end}, k-1}$ when omitted and smoothly interpolating from the preceding terminal value when specified.
6. **Observer Camera Resolution Hierarchy & Continuity**:
   - **Tier 1 (Root `observer_shots`)**: Decoupled timeline; takes complete precedence if non-empty, holding $P_{\text{end}}$ across uncued gaps. When `continuous: true` is declared (at root or on the cue), cues auto-chain timestamps ($t_{\text{start}, k} = t_{\text{end}, k-1}$) and preserve Dutch roll and framing offsets without snapping.
   - **Tier 2 (Per-Shot `shots[].observerCamera`)**: Inherits the parent film shot's `continuous` status (or overrides via `observer_camera.continuous`).
   - **Tier 3 (Static Fallback)**: `stage.defaultObserverPose`.
7. **Overlapping Cues Priority**:
   - If two shots or blocking cues overlap temporally, the entry declared **later in YAML array order** takes precedence.

---

## 7. Normalized AST Data Model & Clamping Contract

`parseStageScore(rawYaml)` normalizes human-authored YAML into the immutable TypeScript AST (`StageScore` in `src/core/types.ts`) governed by the canonical constants in `src/core/constants.ts`.

### 7.1 Canonical Baseline Poses & Clamping Bounds (`constants.ts`)

| Constant / Boundary | Symbol | Canonical Value | Clamping / Fallback Domain |
| :--- | :---: | :--- | :--- |
| **`FULL_FRAME_SENSOR_WIDTH_MM`** | $W_{\text{sensor}}$ | $36.0\text{ mm}$ | Fixed 35mm full-frame horizontal gate width |
| **`DEFAULT_ASPECT_RATIO`** | $\text{AR}_0$ | $16 / 9 \approx 1.7778$ | Positive float $\text{AR} > 0$ |
| **`CAMERA_LIMITS.MIN_DISTANCE_M`** | $d_{\min}$ | $0.4\text{ m}$ | Clamped to $[0.4,\; 100.0]\text{ m}$ (fallback $5.0\text{ m}$) |
| **`CAMERA_LIMITS.MAX_DISTANCE_M`** | $d_{\max}$ | $100.0\text{ m}$ | Clamped to $[0.4,\; 100.0]\text{ m}$ |
| **`CAMERA_LIMITS.MIN_PITCH_RAD`** | $\theta_{\min}$ | $-85^\circ$ ($-1.4835\text{ rad}$) | Clamped to $[-85^\circ,\; +85^\circ]$ (fallback $0.25\text{ rad}$) |
| **`CAMERA_LIMITS.MAX_PITCH_RAD`** | $\theta_{\max}$ | $+85^\circ$ ($+1.4835\text{ rad}$) | Clamped to $[-85^\circ,\; +85^\circ]$ |
| **`CAMERA_LIMITS.MIN_FOCAL_LENGTH_MM`** | $f_{\min}$ | $12\text{ mm}$ | Clamped to $[12,\; 200]\text{ mm}$ (fallback $50\text{ mm}$) |
| **`CAMERA_LIMITS.MAX_FOCAL_LENGTH_MM`** | $f_{\max}$ | $200\text{ mm}$ | Clamped to $[12,\; 200]\text{ mm}$ |
| **`DEFAULT_OBSERVER_POSE`** | $P_{\text{obs}, 0}$ | $\vec{T} = (0, 1.0, 0)\text{ m}$<br>$d = 7.5\text{ m},\; \theta = 26^\circ,\; \psi = 38^\circ$<br>$\gamma = 0^\circ,\; f = 35\text{ mm}$ | Baseline viewport observer camera pose |
| **`DEFAULT_STAGE_CAMERA_POSE`** | $P_{\text{stage}, 0}$ | $\vec{T} = (0, 1.2, 0)\text{ m}$<br>$d = 3.2\text{ m},\; \theta = 6^\circ,\; \psi = -25^\circ$<br>$\gamma = 0^\circ,\; f = 50\text{ mm}$ | Baseline 3D illustrative stage camera pose |
| **`OPTICS_DOF_DEFAULTS.COC_MM`** | $c$ | $0.03\text{ mm}$ | Standard 35mm full-frame Circle of Confusion diameter |
| **`OPTICS_DOF_DEFAULTS.MIN_F_STOP` / `MAX_F_STOP`** | $[N_{\min}, N_{\max}]$ | $[0.7,\; 64.0]$ | Clamped lens aperture $f$-stop range (`shallow: 2.8`, `medium: 5.6`, `deep: Infinity`) |

### 7.2 Normalized AST Interface Contract (`types.ts`)

| AST Interface | Field | Normalized Type & Mathematical Domain |
| :--- | :--- | :--- |
| **`StageScore`** | `version`, `id`, `title`, `subtitle`, `description` | `string` metadata identifiers (`version` default `"1.0"`; optional `description` / `notes`) |
| | `metadata` | `Record<string, unknown> \| undefined` (optional scene-wide production metadata & directorial notes) |
| | `continuous` | `boolean \| undefined` (contiguous timeline & pose-flow flag) |
| | `videoUrl`, `aspectRatio` | `string` media locator; `number` $\text{AR} > 0$ |
| | `durationSec`, `offsetSec` | $T_{\text{duration}} > 0\text{ s}$; $t_{\text{offset}} \in \mathbb{R}\text{ s}$ (default $0.0\text{ s}$) |
| | `stage` | `{ width: number, depth: number, gridStep: number, showRigs?: boolean, defaultObserverPose: SphericalPose, defaultStageCameraPose: SphericalPose }` |
| | `entities` | `SceneEntityDef[]` ($t = 0.0\text{ s}$ baseline entity definitions) |
| | `shots` | `ShotCue[]` (non-empty array of film coverage shots, $\text{length} \ge 1$) |
| | `observerShots` | `ObserverShotCue[] \| undefined` (optional Tier 1 decoupled observer timeline) |
| | `blocking` | `BlockingCueSpec[] \| undefined` (optional Tier 1 decoupled entity blocking timeline) |
| | `optics` | `ScoreOpticsConfig \| undefined` (`{ dofBlur: boolean, defaultDof?: DofPreset, defaultApertureFStop?: number }`) |
| **`ShotCue`** | `id`, `shotNumber`, `label`, `description` | `string` identifiers and notes; `number` shot index |
| | `continuous` | `boolean \| undefined` (shot-level contiguous timeline & pose-flow override) |
| | `startSec`, `endSec` | $t_{\text{start}}, t_{\text{end}} \ge 0.0\text{ s}$ shot timing bounds |
| | `stageCamera`, `observerCamera`, `entities` | Optional `StageCameraCueSpec`, `CameraCueSpec`, and per-shot `EntityCueOverride` map |
| **`ObserverShotCue`** | `id`, `label` | `string` identifier and optional display label |
| | `continuous` | `boolean \| undefined` (cue-level contiguous timeline & pose-flow override) |
| | `startSec`, `endSec`, `camera` | $t_{\text{start}}, t_{\text{end}} \ge 0.0\text{ s}$ timing bounds; `CameraCueSpec` |
| **`BlockingCueSpec`** | `id`, `label`, `entityId` | `string` identifiers and display metadata |
| | `continuous`, `cut` | `boolean \| undefined` (contiguous timeline auto-chaining and instant cut flags) |
| | `startSec`, `endSec`, `duration` | $t_{\text{start}}, t_{\text{end}} \ge 0.0\text{ s}$ timing bounds; optional duration in $\text{s}$ |
| | `fromPosition`, `position` | `Vec3 \| undefined` world positions in $\text{m}$ (when `cut: true`, `startPos = position`) |
| | `fromWidth`, `fromHeight`, `fromDepth` | `number \| undefined` start dimensions in $\text{m}$ for animated transitions |
| | `width`, `height`, `depth` | `number \| undefined` destination dimensions in $\text{m}$ |
| | `rotationYRad`, `lookAt` | Optional facing yaw in radians; anchor identifier or world `Vec3` |
| | `easing`, `highlighted`, `visible`, `note` | `CameraEasing` (default `'smooth'`), `boolean`, `boolean`, `string \| undefined` |
| **`EntityCueOverride`** | `position`, `fromPosition`, `cut` | Optional per-shot entity movement overrides and instant cut flag |
| | `fromWidth`, `fromHeight`, `fromDepth` | `number \| undefined` start dimensions in $\text{m}$ for per-shot transitions |
| | `width`, `height`, `depth` | `number \| undefined` destination dimensions in $\text{m}$ |
| | `rotationYRad`, `lookAt`, `easing` | Optional facing angle, gaze target (`TargetAnchor = string \| string[] \| Vec3`), and velocity easing profile |
| | `highlighted`, `visible`, `note`, `continuous` | Hybrid per-shot highlight badge, visibility toggle, note, and continuity flag |
| **`SphericalPose`** | `target` | `Vec3` $\{x, y, z\} \in \mathbb{R}^3\text{ m}$ |
| | `distance` | `number` $d \in [0.4, 100.0]\text{ m}$ |
| | `pitch`, `yaw`, `roll` | `number` angles in **radians**: $\theta \in [-1.4835, +1.4835]$, $\psi \in \mathbb{R}$, $\gamma \in \mathbb{R}$ |
| | `focalLengthMm` | `number` $f_{\text{mm}} \in [12, 200]\text{ mm}$ |
| **`SceneEntityDef`** | `id`, `label`, `color` | `string` unique key, badge label, and hex color token |
| | `kind`, `shape`, `style` | `EntityKind`, `EntityShape \| undefined`, `EntityStyle` |
| | `position`, `rotationYRad` | `Vec3` floor position in $\text{m}$; facing yaw $\psi_{\text{entity}} \in \mathbb{R}\text{ rad}$ |
| | `height`, `radius` | `number` $h_i > 0\text{ m}$, $r_i > 0\text{ m}$ |
| | `width`, `depth` | `number \| undefined` $w_i > 0\text{ m}$, $d_i > 0\text{ m}$ (default $2r_i$) |
| **`EvaluatedEntityState`** | `id`, `def` | Entity ID and immutable definition reference |
| | `position`, `rotationYRad` | 60fps evaluated world position $\vec{p}(t)$ and facing angle $\psi(t)$ |
| | `size` | `Vec3 \| undefined` 60fps evaluated dimensions $\{w(t), h(t), d(t)\}$ in $\text{m}$ |
| | `trailPoints` | `Vec3[]` 16-segment ground trail path points |
| | `highlighted`, `visible`, `opacity` | Directorial focus styling and visibility flags |
| **`CameraCueSpec`** | `continuous`, `maneuver`, `easing` | Optional `boolean` continuity override; `CameraManeuver` (default `'dolly'`), `CameraEasing` (default `'smooth'`) |
| | `rig`, `showRig` | Optional `CameraRigSpec` (`tripod`, `track`, `spline_track`) and 3D rig visibility toggle |
| | `target`, `from` | `TargetAnchor = string \| string[] \| Vec3 \| undefined` anchor identifiers, centroid arrays, or world coordinates |
| | `targetOffset*` | `Vec3 \| undefined` (`targetOffset`, `targetOffsetStart`, `targetOffsetEnd`) in $\text{m}$ |
| | `distance*`, `pitch*Rad`, `yaw*Rad`, `roll*Rad`, `focalLength*Mm` | Optional scalar/radian/mm endpoints and deltas (`yawDeltaRad`, `rollDeltaRad`) |
| | `focus`, `focusStart`, `focusEnd` | `string \| string[] \| Vec3 \| undefined` focus target identifiers, centroid arrays, or 3D coordinates |
| | `focusDistanceM`, `focusDistanceStartM`, `focusDistanceEndM` | `number \| undefined` explicit metric focus distances $d_{\text{focus}} \in [0.4, 100.0]\text{ m}$ |
| | `dof`, `apertureFStop`, `apertureStartFStop`, `apertureEndFStop` | `DofPreset \| undefined` (`'shallow' \| 'medium' \| 'deep'`); aperture $N \in [0.7, 64.0]$ |
| | `breathe` | `number` ($1.12$ for `arc`/`swoop`, $1.25$ for `recoil`, $1.0$ otherwise) |
| | `direction`, `hasExplicitDirection` | `'cw' \| 'ccw'` (default `'cw'`), `boolean` |
| | `revolutions`, `orbitSpeedRad`, `waypoints` | Optional turn count, angular speed ($\text{rad/s}$), and `CameraWaypointSpec[]` |
| **`CameraRigSpec`** | `type` | `'tripod' \| 'track' \| 'spline_track'` mount category |
| | `position`, `from`, `to`, `points` | `Vec3 \| undefined` world coordinates for tripod, start/end of track rail, and spline waypoints |
| **`EvaluatedCameraRigState`** | `type`, `progress`, `hasTargetLock` | `'tripod' \| 'track' \| 'spline_track'`; progress $u \in [0, 1]$; `boolean` target-tracking flag |
| | `eyePosition`, `railPoints` | `Vec3` 60fps nodal point $\vec{E}(t)$; `Vec3[]` floor rail guide coordinates |
| **`EvaluatedDofState`** | `enabled`, `preset`, `apertureFStop` | `boolean`; `DofPreset`; effective $f$-stop $N \in [0.7, 64.0] \cup \{\infty\}$ |
| | `focusDistanceM`, `nearLimitM`, `farLimitM` | `number` focus plane depth and thin-lens near/far sharp boundaries in $\text{m}$ |
| | `hyperfocalDistanceM`, `depthOfFieldM` | `number` hyperfocal distance $H$ and total sharp zone width $\Delta_{\text{DoF}}$ in $\text{m}$ |
| | `focusTargetPoint`, `hasExplicitFocus` | `Vec3 \| undefined` resolved 3D focus point; `boolean` explicit focus flag |
| **`ScoreCategory`** | provenance | `'study' \| 'blueprint' \| 'custom'` (catalog taxonomy) |
| **`ScoreDiagnostic`** | `line`, `column`, `message`, `severity` | Syntax and schema diagnostic metadata (`severity: 'error' \| 'warning'`) |
| **`ParseScoreResult`** | `score`, `error`, `warning`, `diagnostics` | Compile result of `parseStageScore(rawYaml)` |

> **Declarative YAML Schema & Authoring Reference**: To author or edit `*.yaml` files using human-readable degrees, millimeter strings, key aliases, and production recipes, consult the [**StageFlow YAML Score Authoring Manual**](?mode=guide) (Guide tab / `?mode=guide`).
