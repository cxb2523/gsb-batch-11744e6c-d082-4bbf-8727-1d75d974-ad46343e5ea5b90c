# StageFlow Choreography Score Catalog

This document is the authoritative Single Source of Truth (SSOT) and program guide for all built-in **Directorial Scene Studies** and **Factory Camera-Blocking Blueprints** in **StageFlow**.

It is governed by [`AGENTS.md`](../AGENTS.md) and backed by the declarative catalog manifest [`src/scores/catalog.yaml`](../src/scores/catalog.yaml).

---

## 1. Master Score Index

All built-in scores can be loaded in the StageFlow studio via URL deep-linking (`?score=<id>`), the master-detail Score Library dialog (`Library` button in header), or via the 60fps Viewport Recorder CLI (`npm run record [shortcut]`).

| Title | Category | Canonical ID (`?score=`) | CLI Shortcut / Aliases | File Path | Duration | Shots | Aspect Ratio | Media Engine | Primary Directorial Focus |
| :--- | :---: | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **Vector Field** | `study` | `vector-field` | `vf`, `vector-field-taruma-sakti` | `src/scores/studies/vector_field.yaml` | 61.6s | 32 | 21:9 | YouTube | Multi-actor staging, continuous dialogue tracking, speed ramps, and theatrical look-at anchor handoffs |
| **The Expansion** | `study` | `the-expansion` | `the-expansion`, `the-expansion-taruma-sakti` | `src/scores/studies/the-expansion.yaml` | 72.0s | 11 | 16:9 | YouTube | 72s continuous sequence shot, dynamic follow-focus, and rack-focus choreography on a basketball court |
| **AFRAID** | `study` | `afraid` | `afraid`, `afraid-taruma-sakti` | `src/scores/studies/afraid.yaml` | 45.4s | 16 | 16:9 | YouTube | Dramatic spatial confrontation, shallow DoF ($f/2.8$), and emotional distance staging at twilight |
| **Two-Shot Arc Blocking** | `blueprint` | `demo` | `01`, `demo-blueprint`, `blueprint-01` | `src/scores/blueprints/demo_blueprint.yaml` | 10.0s | 1 | 16:9 | Simulator | Profile two-shot to over-the-shoulder (OTS) arc movement using a 50mm standard prime |
| **Cinematic Dialogue Flow** | `blueprint` | `blueprint-02` | `02`, `blueprint-02-dialogue` | `src/scores/blueprints/blueprint_02_dialogue.yaml` | 26.0s | 6 | 16:9 | Simulator | 6-shot dialogue coverage demonstrating OTS reversal, 85mm low hero arc, and Catmull-Rom spline curves |
| **The Long-Distance Pass** | `blueprint` | `blueprint-03` | `03`, `blueprint-03-ball-pass` | `src/scores/blueprints/blueprint_03_ball_pass.yaml` | 16.0s | 6 | 16:9 | Simulator | 44m × 18m spatial span, parabolic projectile kinetics, dynamic gaze tracking, and Dutch angles ($-18^\circ$ to $+22^\circ$) |
| **Cinematography & Framing** | `blueprint` | `blueprint-04` | `04`, `blueprint-04-cinematography-tutorial` | `src/scores/blueprints/blueprint_04_cinematography_tutorial.yaml` | 20.0s | 16 | 16:9 | Simulator | Framing sizes (EWS to ECU), Rule-of-Thirds lead room offsets, continuous oners, and barrel rolls |
| **Two Rooms: Threshold Crossing**| `blueprint` | `blueprint-05` | `05`, `blueprint-05-two-rooms` | `src/scores/blueprints/blueprint_05_two_rooms.yaml` | 30.0s | 17 | 2.39:1 | Simulator | Multi-actor decoupled blocking (`blocking:`) across two physical rooms with carried prop item tracking |
| **Optics, Rack Focus & DoF** | `blueprint` | `blueprint-06` | `06`, `blueprint-06-optics-dof` | `src/scores/blueprints/blueprint_06_optics_dof.yaml` | 36.0s | 8 | 2.39:1 | Simulator | Off-axis subject focus, rack focus, metric distance pulls, moving follow-focus, and iris ramping ($f/1.4 \to f/11$) |
| **Camera Rigs & Dolly Tracks** | `blueprint` | `blueprint-07` | `07`, `blueprint-07-camera-rigs` | `src/scores/blueprints/blueprint_07_camera_rigs.yaml` | 24.0s | 4 | 2.39:1 | Simulator | Stationary tripod pan tracking, linear dolly track glide with shallow DoF ($f/2.8$), and curved spline track |

---

## 2. Directorial Scene Studies (`src/scores/studies/`)

Auteur directorial scene studies authored by Taruma Sakti exploring real-world film blocking, complex multi-actor spatial relationships, and expressive cinematography.

### 2.1 Vector Field (`vector_field.yaml`)
* **Canonical Slug**: `vector-field` (Default launch scene)
* **Author**: Taruma Sakti
* **Runtime**: 61.625 seconds · 32 Shots · 6 Observer Moves · 13 Blocking Cues · Aspect Ratio: 21:9 Widescreen
* **Media Binding**: YouTube (`https://www.youtube.com/watch?v=1ly8QX31Uqw`)
* **Directorial Premise**: Cornered in a rural cornfield, a loyal getaway driver refuses to leave his injured partner just as their stolen relic suddenly activates.
* **Cinematographic Highlights**:
  - Demonstrates large-scale outdoor staging ($32\text{m} \times 32\text{m}$ grid) with two characters (Ruby, Evan), the Vector Disc relic prop, Cloth Wrap marker, and four cardinal glyph node markers.
  - Features rapid-fire coverage cuts ($0.8\text{s}$ to $3.5\text{s}$) paired with continuous multi-subject decoupled actor blocking.
  - Optical package: $18\text{mm}$, $24\text{mm}$, $35\text{mm}$, $50\text{mm}$, and $85\text{mm}$ primes at $f/4.0$ medium DoF.

### 2.2 The Expansion (`the-expansion.yaml`)
* **Canonical Slug**: `the-expansion`
* **Author**: Taruma Sakti
* **Runtime**: 72.0 seconds · 11 Continuous Camera Moves · 5 Observer Moves · Aspect Ratio: 16:9
* **Media Binding**: YouTube (`https://www.youtube.com/watch?v=JcF1Lffrgf8`)
* **Directorial Premise**: Stepping back-to-back across a freezing basketball court, an obsessive physicist uses his colleague to demonstrate how quickly reality pulls them apart.
* **Cinematographic Highlights**:
  - 72-second continuous sequence shot ("oner") demonstrating seamless pose chaining across all 11 shots on a $28\text{m} \times 16\text{m}$ basketball court with two characters (Frank and Dave), center court marker, and East/West hoops.
  - Spatial expansion choreography: actors stepping in opposite directions with dynamic follow-focus tracking and subject-to-subject rack focus.
  - Optical package: $24\text{mm}$, $35\text{mm}$, and $50\text{mm}$ primes with shallow Depth of Field ($f/2.8$).

### 2.3 Afraid (`afraid.yaml`)
* **Canonical Slug**: `afraid`
* **Author**: Taruma Sakti
* **Runtime**: 45.375 seconds · 16 Shots · 3 Observer Moves · 16 Blocking Cues · Aspect Ratio: 16:9
* **Media Binding**: YouTube (`https://www.youtube.com/watch?v=01ToYKcx8K4`)
* **Directorial Premise**: In an overgrown field at twilight, a woman confronts her partner over a secret he kept throughout their travels together.
* **Cinematographic Highlights**:
  - Dramatic spatial confrontation with two performers (Sarah and Robbie), field teasel/thistle prop clusters, and path beat markers in an open naturalistic setting ($16\text{m} \times 20\text{m}$).
  - Intense shot-reverse-shot dialogue coverage utilizing $35\text{mm}$, $50\text{mm}$, and $85\text{mm}$ primes with tight focal distances and shallow depth of field ($f/2.8$) to heighten psychological tension.

---

## 3. Factory Camera-Blocking Blueprints (`src/scores/blueprints/`)

Synthetic educational presets designed to demonstrate and test specific StageFlow optical, mathematical, and kinematic capabilities.

### BP 01: Two-Shot Arc Blocking (`demo_blueprint.yaml`)
* **Canonical Slug**: `demo` (Shortcut: `01`)
* **Runtime**: 10.0 seconds · 1 Shot · 16:9 Gate · Procedural Media Simulator
* **Technique**: Single-shot lateral profile two-shot sweeping through a 90° circular Bezier arc into an over-the-shoulder (OTS) composition using a standard $50\text{mm}$ prime.

### BP 02: Cinematic Dialogue Flow (`blueprint_02_dialogue.yaml`)
* **Canonical Slug**: `blueprint-02` (Shortcut: `02`)
* **Runtime**: 26.0 seconds · 6 Shots · 3 Observer Moves · 16:9 Gate
* **Technique**: Classic coverage reversal between two characters featuring $85\text{mm}$ low-angle hero push-in, Catmull-Rom spline glides, and independent macroscopic diorama orbit holds (`observer_shots:`).

### BP 03: The Long-Distance Pass (`blueprint_03_ball_pass.yaml`)
* **Canonical Slug**: `blueprint-03` (Shortcut: `03`)
* **Runtime**: 16.0 seconds · 6 Shots · 16:9 Gate
* **Technique**: $44\text{m} \times 18\text{m}$ spatial span across 3 actors (Arthur, Ruby, Mark) with parabolic projectile kinetics (gravity acceleration/deceleration), centrifugal subject-following orbits, and expressive Dutch roll banking ($-18^\circ$ to $+22^\circ$).

### BP 04: Cinematography & Framing (`blueprint_04_cinematography_tutorial.yaml`)
* **Canonical Slug**: `blueprint-04` (Shortcut: `04`)
* **Runtime**: 20.0 seconds · 16 Shots · 1 Observer Move · 16:9 Gate
* **Technique**: Pedagogical framing ladder: framing sizes from Extreme Wide Shot ($18\text{mm}$) to Extreme Close-Up ($100\text{mm}$), rule-of-thirds `target_offset` headroom/lead-room biasing, continuous oners, and barrel rolls.

### BP 05: Two Rooms: Threshold Crossing (`blueprint_05_two_rooms.yaml`)
* **Canonical Slug**: `blueprint-05` (Shortcut: `05`)
* **Runtime**: 30.0 seconds · 17 Shots · 3 Observer Moves · 14 Blocking Cues · 2.39:1 Anamorphic Scope
* **Technique**: Decoupled actor blocking (`blocking:`) across two physical rooms (Living Room and Bedroom) separated by a doorway threshold. Features Ruby's 11-second continuous walk spanning Shots 07–12 with carried item prop tracking.

### BP 06: Optics, Rack Focus & DoF (`blueprint_06_optics_dof.yaml`)
* **Canonical Slug**: `blueprint-06` (Shortcut: `06`)
* **Runtime**: 36.0 seconds · 8 Shots · 2 Observer Moves · 2 Blocking Cues · 2.39:1 Scope
* **Technique**: Complete optical masterclass: off-axis focus locking with emerald tether, cinematic rack focus (`focus_start` $\to$ `focus_end`), metric distance focus pulls, dynamic follow-focus tracking on moving actors, iris aperture ramping ($f/1.4 \to f/11$), and deep focus staging.

### BP 07: Camera Rigs & Dolly Tracks (`blueprint_07_camera_rigs.yaml`)
* **Canonical Slug**: `blueprint-07` (Shortcut: `07`)
* **Runtime**: 24.0 seconds · 4 Shots · 2 Blocking Cues · 2.39:1 Scope
* **Technique**: Physical camera mounts: stationary 3-legged tripod pan tracking, linear $0.42\text{m}$ gauge dolly track with shallow DoF ($f/2.8$), fixed-gaze sideways trucking move, and curved Catmull-Rom spline rail with dynamic two-shot centroid look-at tracking.

---

## 4. Declarative Manifest Architecture (`src/scores/catalog.yaml`)

StageFlow decouples catalog registration from code. All built-in scores are declared in [`src/scores/catalog.yaml`](../src/scores/catalog.yaml):

```yaml
- id: my-scene
  file: studies/my_scene.yaml
  category: study              # "study" | "blueprint"
  aliases:
    - my-scene-alias
    - shortcut
```

- **Zero TypeScript Editing**: Adding a new score requires only adding the YAML file to `src/scores/` and declaring its 4-line entry in `catalog.yaml`.
- **Eager Vite Discovery**: [`src/core/scoreCatalog.ts`](../src/core/scoreCatalog.ts) automatically discovers and bundles all YAML files using `import.meta.glob('../scores/**/*.yaml')`.
- **Deep Linking**: The showrunner-defined `id` serves directly as the canonical URL query parameter (`?score=my-scene`), while `aliases:` provide 100% backwards compatibility for legacy identifiers.

