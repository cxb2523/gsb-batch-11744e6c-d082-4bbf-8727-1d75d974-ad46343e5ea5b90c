---
name: stageflow-score-debugger
description: >-
  Debug, audit, and diagnose StageFlow YAML choreography scores (*.yaml) for visual snaps,
  kinetic discontinuities, easing mismatches, actor blocking desync, look-at anchor drifting,
  and shot-boundary jumps. Use whenever the user reports a glitch, snap, jump, stutter, or asks to
  smooth, diagnose, or optimize camera and character choreography in a StageFlow score.
---

# StageFlow Choreography Score Debugger Skill

This skill guides the agent in systematically inspecting, mathematically auditing, and smoothing StageFlow YAML scores (`*.yaml`).

---

## 1. Diagnostic Decision Tree: The 5 Culprits of a "Snap"

When a user reports a visual snap, hitch, or jerk across shot boundaries, check these 5 areas in order:

```mermaid
flowchart TD
    A["User reports 'Snap' or 'Jerk'"] --> B{"1. Position Match ($C^0$)?\nCheck start/end coordinates"}
    B -- "Mismatched" --> B1["Fix Start/End Coordinates or use continuous: true chaining"]
    B -- "Matched" --> C{"2. Velocity Continuity ($C^1$)?\nCompare exit vs entry d/dt"}
    C -- "Velocity Step Change" --> C1["Harmonize Easing & Shot Durations"]
    C -- "Continuous" --> D{"3. Actor vs Camera Desync?\nCheck actor easing vs camera easing"}
    D -- "Actor kicks/lurches" --> D1["Synchronize actor easing (smooth into smooth)"]
    D -- "Synchronized" --> E{"4. Look-At & Breathe?\nfrom: vs target: & breathe factor"}
    E -- "Bulge or pan glitch" --> E1["Omit redundant from: and reduce breathe to ~1.01"]
    E -- "Clean" --> F{"5. Editorial / Rail Swap?\nYellow path or trail line switch"}
    F --> F1["Decide: Combine with Spline vs Keep Contiguous Shots"]
```

---

## 2. Step-by-Step Diagnostic Runbook

### Step 1: Run Microsecond Boundary Sampling
Never guess. Inspect mathematical continuity by evaluating `computeStageFrame(t, score)` at $t_{\text{cut}} - 0.1\text{s}$, $t_{\text{cut}} - 0.01\text{s}$, $t_{\text{cut}}$, $t_{\text{cut}} + 0.01\text{s}$, and $t_{\text{cut}} + 0.1\text{s}$:

```typescript
import { computeStageFrame } from './src/core/frameEngine';
import { parseStageScore } from './src/core/scoreParser';

const testTimes = [tCut - 0.1, tCut - 0.01, tCut, tCut + 0.01, tCut + 0.1];
for (const t of testTimes) {
  const frame = computeStageFrame(t, score);
  const sc = frame.stageCamera.transform;
  const entity = frame.entitiesById.get(activeActorId);
  console.log(`t=${t.toFixed(3)}s [${frame.activeShot?.id}]: Cam.eye=[${sc.position.x.toFixed(3)}, ${sc.position.y.toFixed(3)}, ${sc.position.z.toFixed(3)}], dist=${sc.pose.distance.toFixed(3)}, pitch=${(sc.pose.pitch * 180 / Math.PI).toFixed(1)}°, yaw=${(sc.pose.yaw * 180 / Math.PI).toFixed(1)}°, Actor.x=${entity?.position.x.toFixed(3)}`);
}
```

### Step 2: Audit Derivative Discontinuities ($C^1$ Velocity Check)
Compute normalized time progress rate:
$$\frac{du}{dt} = \left.\frac{du}{dt_{\text{raw}}}\right|_{\text{boundary}} \times \frac{1}{\Delta T_{\text{shot}}}$$

* **Easing Derivatives at Boundaries**:
  * `smooth`: Starts at $0$, peaks at $\frac{\pi}{2} \approx 1.57$, ends at $0$.
  * `linear`: Constant $1.0$ throughout.
  * `accel`: Starts at $0$, ramps to $1.25$ over first $40\%$, finishes at constant $1.25$.
  * `deccel`: Starts at constant $1.25$ for first $60\%$, ramps down to $0$.
  * `cruise`: Starts at $0$, constant $1.33$ in middle $50\%$, ramps down to $0$.
  * `ease-out`: Starts at **peak velocity ($3.0$)**, ramps down to $0$. *(High risk of actor lurching if placed after a stop!)*
  * `ease-in`: Starts at $0$, finishes at **peak velocity ($3.0$)**.

If $\Delta T_{\text{shot 1}} \neq \Delta T_{\text{shot 2}}$, the factor $\frac{1}{\Delta T}$ causes an instant velocity step even if the easing type is identical!

### Step 3: Audit Actor Kinematics vs. Camera Motion
* **Stop-then-Lurch Pattern**: Does the actor come to a stop in Shot 1 (`cruise` / `smooth`) and then immediately use `ease-out` in Shot 2?
  * **Fix**: Change Shot 2 actor easing to `smooth` so both actor and camera accelerate together from rest.
* **Continuous Walk Across Multiple Camera Cuts**: Does the actor walk continuously across multiple shots?
  * **Best Fix**: Extract the actor's movement into a decoupled root-level `blocking:` cue spanning the full duration of the walk (`start` to `end`) so the actor moves along a single continuous easing curve (`cruise` or `smooth`) with a unified Option A ground movement trail while `shots:` cuts freely around them.
  * **Legacy Per-Shot Fix**: Use matching constant velocity (e.g. `accel` in Shot 1 entering constant speed, and `deccel` in Shot 2 beginning at that same constant speed).

### Step 4: Audit Camera Maneuver & Look-At Semantics
* **Redundant `from:`**: In StageFlow, `from:` is intended for smoothly swinging camera look-at *from one entity to a different entity or position*. If both shots track the same entity, omit `from:`.
* **Arc Bulging (`breathe`)**: In `maneuver: "arc"` or `"swoop"`, the default `breathe: 1.12` creates a $+12\%$ radial bulge. For tight follow shots, tame `breathe` to `1.01` or `1.0`.

### Step 5: Evaluate Spline vs. Contiguous Shots vs. Decoupled `blocking:`
When considering merging shots into a single Catmull-Rom spline (`maneuver: "spline"`):
* **Camera Benefit**: Guarantees unbroken $C^1$ path and velocity continuity; keeps a single 3D yellow trajectory rail.
* **Decoupling Actor Beats via `blocking:`**: By authoring actor movements in root `blocking:` with independent `[start, end]` windows, you can combine camera shots into a single `spline` while giving actors multi-phase staging beats (e.g. walk up from `0..5s`, pause from `5..7s`, then turn from `7..10s`), or conversely cut across multiple shots while an actor executes a single continuous cross.

---

## 3. Cinematography Smoothing Cheat-Sheet

| Problem | Root Cause | Solution |
| :--- | :--- | :--- |
| **Actor stops/restarts at every camera cut** | Actor walk is split across `shots[].entities` | Move actor choreography to root-level `blocking:` spanning the full walk window |
| **Actor lurches across boundary** | Actor uses `ease-out` entering at $3\times$ speed after resting | Change actor easing to `smooth` or use a single `blocking:` cue |
| **Camera pushes backward mid-arc** | Default `breathe: 1.12` bulges outward | Set `breathe: 1.0` or `1.01` |
| **Camera jerks across boundary** | Mismatched easing derivatives or durations | Harmonize easing curves (`smooth` into `smooth` or matched $\frac{du}{dt}$) |
| **3D trajectory rail swaps abruptly** | Visual consequence of discrete editorial shots | Combine camera shots with `maneuver: "spline"` and stage actors in `blocking:` |
| **Look-at snaps diagonally** | Target entity switched without `from:` | Add `from: "<previous_target>"` |
| **Roll or `target_offset` snaps to `0` across a continuous move** | Shot is in standard cut mode (`continuous: false`) where Option A resets apply | Enable `continuous: true` at root or on the follow-up cue (`shots[k].continuous: true` or `observer_shots[k].continuous: true`) |
| **Actor slides across floor during montage or jump cut** | Omitted `from:` causes engine to lerp movement from previous position | Declare `cut: true` on the cue to place directly at `position` without cross-stage sliding or phantom floor trails |
| **Actor cue snaps to 0.0s when omitting start** | Omitted `start:` outside continuous mode defaults to 0.0s | Declare `continuous: true` at score root or on cue to auto-chain timestamps, or specify explicit `start:` / `duration:` |
| **Off-axis subject looks slightly out of focus in `shallow` DoF** | Using radial distance instead of orthogonal depth projection | Set `focus: "<subject_id>"` so the engine projects $(\vec{P}_{\text{focus}} - \vec{E}) \cdot \hat{F}$ orthogonally onto the optical axis |
| **Rack focus snaps instead of pulling smoothly** | Using static `focus:` across two shots instead of start/end bounds | Author `focus_start: "<actor_a>"` and `focus_end: "<actor_b>"` inside the shot's `stage_camera` |
| **Actor crouching/scaling causes look-at or DoF focus to drift** | Manual target offset applied during posture change | Target the entity directly (`target: "<actor_id>"`); the engine automatically tracks live dynamic anchor elevation $\vec{A}_i(t)$ as the actor crouches or changes dimensions |
| **Actor looks squashed like a pancake when sitting or crouching** | Legacy uniform mesh scaling flattening head sphere | Engine uses rigid anatomical head and shoulders with telescoping torso; author sitting/crouching height directly (`height: 1.15m`) |
