# Changelog

All notable changes to **StageFlow** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-11-10

### Added

#### Layer 1: Core Math, Optics & Script Schema

- **Scene-Wide Custom Metadata Support (`src/core/types.ts`, `src/core/scoreParser.ts`, `src/ui/left-panel/SceneMetadataCard.tsx`, `src/ui/left-panel/SceneProductionBrief.tsx`, `src/scores/blueprints/demo_blueprint.yaml`, `tests/unit/scoreParser.test.ts`, `tests/unit/guideSnippets.test.ts`)**:
  - Introduced dedicated root-level `metadata:` block in YAML choreography scores (`*.yaml`) and normalized AST (`score.metadata?: Record<string, unknown>`), providing a safe namespaced structure for production notes, music/soundtrack cues, camera gear packages, lighting setups, and crew credits.
  - Implemented Layer 5 `SceneMetadataCard.tsx` in the Scene Desk (`SceneProductionBrief.tsx`) positioned directly after the Scene Premise card and before Camera & Optical Package:
    - **Collapsible Accordion**: Subtle chevron toggle (`ChevronDown`/`ChevronRight`), default expanded.
    - **Smart Category Icons & Formatting**: Auto-matches keys against semantic icons (Music/Audio 🎵, Notes/Memo 📝, Camera/Gear 🎥, Lighting/Look 💡, Cast/Crew 👥, fallback Tag 🔖) with human-friendly section titles (`camera_package` → `Camera Package`).
    - **Polymorphic Value Rendering**: Seamlessly renders single strings with rich Markdown (`ReactMarkdown`), arrays of strings as bulleted checklists, and nested key-value objects as metadata pill badges.
  - Updated default blueprint `src/scores/blueprints/demo_blueprint.yaml` with representative production metadata (music track with Spotify link, ARRI Alexa Mini LF + Steadicam package, and directorial notes).
  - Extended `tests/unit/scoreParser.test.ts` with unit tests for string, array, and nested object metadata parsing, empty/omitted metadata handling, and non-object fallback protection.
  - Documented `metadata:` in `docs/YAML_AUTHORING_GUIDE.md` and `docs/STAGEFLOW_SCRIPT_SPECIFICATION.md` (§7.2 AST contract table).

- **Dynamic Two-Shot Framing & Multi-Subject Centroid Look-At Anchors (`src/core/types.ts`, `src/core/scorePrimitives.ts`, `src/core/cameraTargetResolver.ts`, `src/core/dofEvaluator.ts`, `src/core/cameraCueParser.ts`, `src/core/entityKinematicUtils.ts`, `src/ui/library/ScoreStageMinimap.tsx`, `tests/unit/multiTargetFraming.test.ts`, `docs/*`, `CHANGELOG.md`)**:
  - Added support for multi-entity look-at arrays (`TargetAnchor = string | string[] | Vec3`) on `target:`, `from:`, `focus:`, and entity `look_at:`, allowing directors and educators to block conversational spaces and two-shots without hardcoding coordinates.
  - Implemented pure 3D world-space centroid resolution $\vec{T}_{\text{centroid}}(t) = \frac{1}{K}\sum_{i=1}^K \vec{A}_i(t)$ in [`src/core/cameraTargetResolver.ts`](src/core/cameraTargetResolver.ts) using live evaluated entity look anchors $\vec{A}_i(t)$ and optional metric offsets, preserving pure decoupled 3D math and zero circular dependencies with camera eye positions or 2D projection angles.
  - Enabled dynamic 60fps tracking as performers walk across the stage via `blocking:`, automatically keeping the camera centered on the shifting conversational volume.
  - Enabled smooth single-to-two-shot glides (e.g. `from: "detective"` $\to$ `target: ["detective", "witness"]`) traveling smoothly from an intimate close-up to a two-shot master.
  - Integrated centroid focus plane evaluation in [`src/core/dofEvaluator.ts`](src/core/dofEvaluator.ts) so `focus: ["actor_a", "actor_b"]` automatically projects the orthogonal focus plane onto the conversational midpoint with thin-lens Depth-of-Field.
  - Extended [`src/core/entityKinematicUtils.ts`](src/core/entityKinematicUtils.ts) (`resolveLookAtPoint`) to allow actors to dynamically face the midpoint between two or more characters.
  - Updated [`src/ui/library/ScoreStageMinimap.tsx`](src/ui/library/ScoreStageMinimap.tsx) to resolve two-shot target coordinates for the 2D top-down stage minimap.
  - Added dedicated unit test suite in [`tests/unit/multiTargetFraming.test.ts`](tests/unit/multiTargetFraming.test.ts) (6 tests) covering exact midpoint math, 60fps walking actor tracking, single-to-two-shot transitions, centroid focus planes, stationary tripod rig tracking, and graceful fallback on unknown entity IDs.
  - Synchronized living documentation across [`docs/YAML_AUTHORING_GUIDE.md`](docs/YAML_AUTHORING_GUIDE.md), [`docs/STAGEFLOW_SCRIPT_SPECIFICATION.md`](docs/STAGEFLOW_SCRIPT_SPECIFICATION.md), and [`docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md`](docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md), and updated snippet block count in [`tests/unit/guideSnippets.test.ts`](tests/unit/guideSnippets.test.ts).

- **Physical Camera Rigs, Dolly Tracks & 3D Blueprint Mounts (`src/core/types.ts`, `src/core/cameraRigEvaluator.ts`, `src/core/cameraCueParser.ts`, `src/core/scoreParser.ts`, `src/core/shotPoseEvaluator.ts`, `src/core/trajectoryChain.ts`, `src/core/frameEngine.ts`, `src/stage/StageCameraRigMount.tsx`, `src/stage/StageCameraRig.tsx`, `src/ui/CameraTelemetryCapsule.tsx`, `src/ui/DioramaOverlayContainer.tsx`, `src/ui/ShotBreakdownHud.tsx`, `src/scores/blueprints/blueprint_07_camera_rigs.yaml`, `src/core/scoreCatalog.ts`, `tests/unit/cameraRigs.test.ts`, `tests/unit/*`, `docs/*`, `AGENTS.md`, `README.md`)**:
  - Added physical camera mount features to StageFlow for both the Illustrative Stage Camera and the Viewport Observer Camera, resolving spatial decoupling between camera eye position and subject tracking.
  - Added `CameraRigType` (`'tripod' | 'track' | 'spline_track'`), `CameraRigSpec`, and `EvaluatedCameraRigState` in [`src/core/types.ts`](src/core/types.ts). Extended `CameraCueSpec`, `StageScore['stage']`, `EvaluatedCameraTrack`, and `StageFrame['stageCamera']`.
  - Created [`src/core/cameraRigEvaluator.ts`](src/core/cameraRigEvaluator.ts) ($\le 250$ lines, zero React/DOM dependencies) providing pure Layer 1 evaluation: `parseCameraRigSpec`, eye position evaluation $\vec{E}(u)$ for stationary tripods, linear tracks, and Catmull-Rom spline tracks with arc-length parameterization, rail guide sampling (`sampleRigRailPoints`), and inverse look-at (`cartesianToSpherical`) or fixed-gaze kinematics (`evaluateRigCameraPose`).
  - Added declarative YAML parsing for `rig:` and `show_rig:` in [`src/core/cameraCueParser.ts`](src/core/cameraCueParser.ts) and `show_rigs:` on `stage:` in [`src/core/scoreParser.ts`](src/core/scoreParser.ts), fully integrated with Rule 2.6 DSL polymorphism (`applyFlatShotCameraOverrides`).
  - Integrated rig kinematics into [`src/core/shotPoseEvaluator.ts`](src/core/shotPoseEvaluator.ts) and [`src/core/trajectoryChain.ts`](src/core/trajectoryChain.ts), automatically chaining previous shot terminal eye position $\vec{E}_{\text{prev}}$ on continuous tracks (`continuous: true`), suppressing trajectory ribbon lines for stationary tripods, and caching sampled rail points.
  - Created [`src/stage/StageCameraRigMount.tsx`](src/stage/StageCameraRigMount.tsx) ($\le 250$ lines) and integrated into [`src/stage/StageCameraRig.tsx`](src/stage/StageCameraRig.tsx): renders a 3-legged blueprint tripod stand with tubular splayed legs, floor pucks, and vertical telescoping column; renders physical floor rails ($0.42\text{m}$ gauge) with orthogonal sleepers and a 4-wheeled dolly cart with telescoping column. All transform updates execute imperatively in R3F `useFrame` at 60fps.
  - Updated [`src/ui/CameraTelemetryCapsule.tsx`](src/ui/CameraTelemetryCapsule.tsx), [`src/ui/DioramaOverlayContainer.tsx`](src/ui/DioramaOverlayContainer.tsx), and [`src/ui/ShotBreakdownHud.tsx`](src/ui/ShotBreakdownHud.tsx) to display active rig badges (`TRIPOD`, `TRACK`, `SPLINE TRACK`), tooltips, and 1-click YAML snippet copying with clean `rig:` syntax.
  - Authored and bundled [`src/scores/blueprints/blueprint_07_camera_rigs.yaml`](src/scores/blueprints/blueprint_07_camera_rigs.yaml) (24.0s, 4 shots) showcasing stationary tripod pan tracking walk, linear dolly track single-to-two-shot glide (`from: protagonist` $\to$ `target: [protagonist, interlocutor]`) with shallow DoF ($f/2.8$), fixed-gaze sideways truck, and curved spline track with dynamic two-shot centroid tracking and rack focus pull. Registered into `INITIAL_CATALOG_ITEMS` in [`src/core/scoreCatalog.ts`](src/core/scoreCatalog.ts).
  - Added comprehensive deterministic unit test suite in [`tests/unit/cameraRigs.test.ts`](tests/unit/cameraRigs.test.ts) covering tripod spatial locking, linear track lerp, fixed-gaze forward projection, continuous track chaining, spline tracks, visibility toggles, and Blueprint 07 contract validation.
  - Synchronized living documentation, specifications, authoring guides, file maps, and skills across [`docs/ARCHITECTURE_FILE_MAP.md`](docs/ARCHITECTURE_FILE_MAP.md), [`docs/STAGEFLOW_SCRIPT_SPECIFICATION.md`](docs/STAGEFLOW_SCRIPT_SPECIFICATION.md), [`docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md`](docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md), [`docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`](docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md), [`docs/YAML_AUTHORING_GUIDE.md`](docs/YAML_AUTHORING_GUIDE.md), [`AGENTS.md`](AGENTS.md), [`README.md`](README.md), and [`.agents/skills/stageflow-viewport-recorder/SKILL.md`](.agents/skills/stageflow-viewport-recorder/SKILL.md).

- **3D Entity Spatial Dimensions, Shape-Matched Ground Footprints & Blocking Scale Transformations (`src/core/types.ts`, `src/core/constants.ts`, `src/core/entityKinematicUtils.ts`, `src/core/scorePrimitives.ts`, `src/core/scoreParser.ts`, `src/core/entityBlockingEvaluator.ts`, `src/core/entityLegacyEvaluator.ts`, `src/core/cameraTargetResolver.ts`, `src/stage/DirectionalMannequin.tsx`, `src/ui/library/ScoreStageMinimap.tsx`, `tests/unit/*`, `docs/*`, `README.md`, `AGENTS.md`)**:
  - Added full 3D spatial dimension parameters ($X, Y, Z$: `width`, `height`, `depth`) and compact vectors (`size: [w, h, d]` / `size: [w, d]`) to entity definitions (`SceneEntityDef`), decoupled blocking cues (`BlockingCueSpec`), per-shot entity overrides (`EntityCueOverride`), and evaluated runtime state (`EvaluatedEntityState.size`).
  - Implemented polymorphic dimension parsing and kinematic utilities in [`src/core/entityKinematicUtils.ts`](src/core/entityKinematicUtils.ts): `parseDimensionTuple`, `parsePositiveMetricScalar`, `getEntityBaseSize`, `resolveEntityDefDimensions`, `parseEntityCueDimensionOverrides`, `resolveCueStartEndSize`, and `computeOrientedBoundingBox`.
  - Added canonical dimensional constants in [`src/core/constants.ts`](src/core/constants.ts): character ($0.52 \times 1.75 \times 0.52\text{m}$), prop ($0.70 \times 0.85 \times 0.70\text{m}$), and marker ($0.50 \times 0.15 \times 0.50\text{m}$), guaranteeing 100% backward compatibility when `width` and `depth` are omitted ($w = d = 2r$).
  - Added 60fps dynamic dimension interpolation and per-axis forward chaining in [`src/core/entityBlockingEvaluator.ts`](src/core/entityBlockingEvaluator.ts) and [`src/core/entityLegacyEvaluator.ts`](src/core/entityLegacyEvaluator.ts): dimension overrides animate smoothly with cue easing curves ($u = E(\tau)$), and individual axes chain independently across cues (modifying `height` retains previously overridden `width` and `depth`).
  - Updated [`src/core/cameraTargetResolver.ts`](src/core/cameraTargetResolver.ts) (`resolveTargetPoint3D`) to evaluate dynamic anchor elevation $\vec{A}_i(t) = (x_i(t), y_i(t) + \text{ratio} \cdot h_i(t), z_i(t))$ from live evaluated entity height, ensuring Stage Camera look-at targeting and thin-lens DoF focus planes dynamically track actor crouching or height changes.
  - Updated [`src/stage/DirectionalMannequin.tsx`](src/stage/DirectionalMannequin.tsx) to apply hardware-accelerated 60fps scaling with strict floor-plane pinning ($Y = 0$), enforce rigid anatomical head sphere and shoulder bar preservation on characters (telescoping the torso column without squashing the skull or shoulders into pancakes), isolate floating identity badges inside unscaled `labelGroupRef`, and render shape-matched ground footprints (oriented rectangular polygon via `boxFootprintGeometry` for box props, elliptical footprint for non-uniform circular props and mannequins).
  - Updated [`src/ui/library/ScoreStageMinimap.tsx`](src/ui/library/ScoreStageMinimap.tsx) to render top-down SVG oriented bounding boxes (`computeOrientedBoundingBox`) for rectangular box props, ellipses for non-uniform circular entities, and circular symbols otherwise.
  - Added comprehensive unit test suites in [`tests/unit/scoreParser.test.ts`](tests/unit/scoreParser.test.ts) (3D dimension vectors, explicit dimension overrides, bounding radius derivation, blocking cue overrides), [`tests/unit/entityEngine.test.ts`](tests/unit/entityEngine.test.ts) (oriented bounding box rotation at $0^\circ$ and $90^\circ$, 60fps dimension interpolation, per-axis forward chaining), and [`tests/unit/frameEngine.test.ts`](tests/unit/frameEngine.test.ts) (end-to-end Stage Camera look-at elevation and DoF focus plane tracking during actor crouch).
  - Synchronized domain specifications, AST contract tables, authoring guides, file maps, and governance invariants across [`docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md`](docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md), [`docs/STAGEFLOW_SCRIPT_SPECIFICATION.md`](docs/STAGEFLOW_SCRIPT_SPECIFICATION.md), [`docs/YAML_AUTHORING_GUIDE.md`](docs/YAML_AUTHORING_GUIDE.md) (added sitting/crouching YAML example snippet and updated [`tests/unit/guideSnippets.test.ts`](tests/unit/guideSnippets.test.ts)), [`docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`](docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md), [`docs/VISUAL_DESIGN_SYSTEM.md`](docs/VISUAL_DESIGN_SYSTEM.md), [`docs/ARCHITECTURE_FILE_MAP.md`](docs/ARCHITECTURE_FILE_MAP.md), [`README.md`](README.md), [`.agents/skills/stageflow-score-debugger/SKILL.md`](.agents/skills/stageflow-score-debugger/SKILL.md), and [`AGENTS.md`](AGENTS.md).

- **Focus Distance, Rack Focus & Thin-Lens Depth of Field (`src/core/types.ts`, `src/core/constants.ts`, `src/core/opticsMath.ts`, `src/core/scorePrimitives.ts`, `src/core/cameraCueParser.ts`, `src/core/scoreParser.ts`, `src/core/dofEvaluator.ts`, `src/core/frameEngine.ts`, `src/stage/StageCameraFocusRig.tsx`, `src/stage/StageCameraRig.tsx`, `src/stage/StageCamDofEffect.tsx`, `src/stage/StageCamMonitorCanvas.tsx`, `src/stage/DioramaCanvas.tsx`, `src/core/storage/localStorageUi.ts`, `src/hooks/useStudioDisplaySettings.ts`, `src/ui/*`, `tests/unit/*`, `docs/*`)**:
  - Added `DofPreset` (`'shallow' | 'medium' | 'deep'`), `ScoreOpticsConfig`, `EvaluatedDofState`, and extended `CameraWaypointSpec`, `CameraCueSpec`, `StageScore.optics`, and `StageFrame['stageCamera'].dof` in [`src/core/types.ts`](src/core/types.ts) alongside `OPTICS_DOF_DEFAULTS` ($c = 0.03\text{mm}$, `shallow: 2.8`, `medium: 5.6`, `deep: Infinity`) and `BLUEPRINT_PALETTE.focusTether` (`#10b981`) in [`src/core/constants.ts`](src/core/constants.ts).
  - Implemented Gaussian thin-lens optical math in [`src/core/opticsMath.ts`](src/core/opticsMath.ts): orthogonal focus plane projection (`computeProjectedFocusDistanceM`, eliminating off-axis cosine overshoot $r / \cos\alpha$), hyperfocal distance and Near/Far DoF limits (`computeDepthOfFieldLimits`), and sensor-normalized Circle of Confusion blur fraction (`computeNormalizedBlurCircleFraction`).
  - Added declarative YAML focus & DoF parsing in [`src/core/scorePrimitives.ts`](src/core/scorePrimitives.ts), [`src/core/cameraCueParser.ts`](src/core/cameraCueParser.ts), and [`src/core/scoreParser.ts`](src/core/scoreParser.ts), supporting subject-driven focus (`focus: "alice"`), manual metric focus (`focus: 3.5m` / `focus_distance: 3.5`), rack focus (`focus_start` $\to$ `focus_end`), spline waypoint focus, semantic `dof` presets, numeric `aperture` $f$-stops (`2.8` / `"f/2.8"`), root `optics:` configuration (`dof_blur: true`), and flat-vs-nested shot polymorphism (`applyFlatShotCameraOverrides`).
  - Created [`src/core/dofEvaluator.ts`](src/core/dofEvaluator.ts) (`evaluateStageCameraDof`) and wired it into [`src/core/frameEngine.ts`](src/core/frameEngine.ts) (`computeStageFrame`) for 100% stateless timeline evaluation (`Frame_t = f(t, score)`).
  - Created [`src/stage/StageCameraFocusRig.tsx`](src/stage/StageCameraFocusRig.tsx) and updated [`src/stage/StageCameraRig.tsx`](src/stage/StageCameraRig.tsx) to decouple the frustum cone from the sliding Focus Plane frame at $z = d_{\text{focus}}$, render Near & Far DoF limit brackets (`StageCameraDofBrackets`), and render a world-space emerald focus tether (`StageCameraFocusTether`) when focusing on an off-axis subject.
  - Created [`src/stage/StageCamDofEffect.tsx`](src/stage/StageCamDofEffect.tsx), a single-pass WebGL2 `WebGLRenderTarget` + hardware `THREE.DepthTexture` (`UnsignedInt248Type`) 24-tap Vogel disk bokeh shader that avoids `scene.overrideMaterial` (preserving `@react-three/drei` `<Line>` and `<Edges>` geometry) and wired it into [`src/stage/StageCamMonitorCanvas.tsx`](src/stage/StageCamMonitorCanvas.tsx) and [`src/stage/DioramaCanvas.tsx`](src/stage/DioramaCanvas.tsx).
  - Added persistent UI toggle (`[ Blur ]` button and global hotkey `'B'` in [`src/hooks/useStudioDisplaySettings.ts`](src/hooks/useStudioDisplaySettings.ts), [`src/core/storage/localStorageUi.ts`](src/core/storage/localStorageUi.ts), [`src/ui/LabelDisplayModeToggle.tsx`](src/ui/LabelDisplayModeToggle.tsx), and [`src/ui/CompactDioramaHeader.tsx`](src/ui/CompactDioramaHeader.tsx)) and live $f$-stop / focus distance telemetry in [`src/ui/ShotBreakdownHud.tsx`](src/ui/ShotBreakdownHud.tsx) and [`src/ui/StageCamViewfinderOverlay.tsx`](src/ui/StageCamViewfinderOverlay.tsx).
  - Added unit test suites in [`tests/unit/opticsMath.test.ts`](tests/unit/opticsMath.test.ts), [`tests/unit/scoreParser.test.ts`](tests/unit/scoreParser.test.ts), [`tests/unit/frameEngine.test.ts`](tests/unit/frameEngine.test.ts), and [`tests/unit/scoreContract.test.ts`](tests/unit/scoreContract.test.ts).

- **Continuous Blocking, Duration Syntax & Instant Cut Placement (`src/core/types.ts`, `src/core/scorePrimitives.ts`, `src/core/scoreParser.ts`, `src/core/entityBlockingEvaluator.ts`, `src/core/entityLegacyEvaluator.ts`, `src/core/entityKinematicUtils.ts`, `tests/unit/*`, `docs/*`, `.agents/skills/*`)**:
  - Brought temporal continuity parity to actor blocking (`blocking:`), matching Stage and Observer camera tracks under `continuous: true` (at root or cue-level).
  - Added `duration?: number`, `cut?: boolean`, and `continuous?: boolean` to `BlockingCueSpec` and `EntityCueOverride` in [`src/core/types.ts`](src/core/types.ts), and `isCut?: boolean` to `ChainedBlockingCueEntry` in [`src/core/entityKinematicUtils.ts`](src/core/entityKinematicUtils.ts).
  - Supported first-class `duration:` / `dur:` syntax in [`parseBlockingCues()`](src/core/scorePrimitives.ts), computing `endSec = startSec + duration` without requiring authors to calculate manual absolute end timestamps.
  - Implemented timestamp auto-chaining (`startSec = prevBlockEndSec`) when `start:` is omitted in continuous mode across both grouped beat cues and flat single-entity cues with monotonic timeline advancement (`Math.max`).
  - Implemented instant cut placement (`cut: true`) across Tier 1 `blocking:` and Tier 2 `shots[].entities`: sets `startPos = position` directly (eliminating cross-stage sliding and redundant `from:` duplication), suppresses floor trails (`trailPoints = []`), bypasses movement-direction auto-facing, and forward-chains seamlessly into subsequent continuous walks.
  - Enabled cue-level `continuous: false` to explicitly break the continuous chain for independent scene setups, and surfaced non-blocking `MISSING_BLOCKING_START` diagnostics when `start:` is omitted outside continuous mode.
  - Added unit test suites in [`tests/unit/scoreParser.test.ts`](tests/unit/scoreParser.test.ts) (duration parsing, cut flag parsing, grouped/flat timestamp auto-chaining, and missing-start diagnostics) and [`tests/unit/entityEngine.test.ts`](tests/unit/entityEngine.test.ts) (cut placement, empty trail verification, post-cut walk chaining, auto-facing protection, and Tier 2 shot-level cuts).
  - Synchronized domain specifications, AST contract tables, authoring guides, and skill cheatsheets across [`docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md`](docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md), [`docs/STAGEFLOW_SCRIPT_SPECIFICATION.md`](docs/STAGEFLOW_SCRIPT_SPECIFICATION.md), [`docs/YAML_AUTHORING_GUIDE.md`](docs/YAML_AUTHORING_GUIDE.md), and [`.agents/skills/stageflow-score-debugger/SKILL.md`](.agents/skills/stageflow-score-debugger/SKILL.md).

- **Observer Camera Continuity & Parity with Stage Camera (`src/core/types.ts`, `src/core/cameraCueParser.ts`, `src/core/scoreParser.ts`, `src/core/trajectoryChain.ts`, `tests/unit/*`, `docs/*`, `.agents/skills/*`)**:
  - Brought full temporal and kinematic continuity to the Observer Camera, achieving bit-for-bit parity with the Stage Camera across both Tier 1 (`observer_shots:`) and Tier 2 (`shots[].observer_camera`).
  - Generalized `isContinuous` in [`src/core/trajectoryChain.ts`](src/core/trajectoryChain.ts) by removing the hardcoded `role === 'stage'` barrier across trajectory sampling, cache building, and runtime track evaluation, enabling Observer Camera Dutch roll (`roll`) and framing offsets (`target_offset`) to smoothly persist and glide across cue boundaries without snapping to neutral baselines ($0^\circ$ and $[0, 0, 0]$).
  - Added `continuous?: boolean` to `ObserverShotCue` and `CameraCueSpec` in [`src/core/types.ts`](src/core/types.ts) and updated `parseObserverShots()` and `parseCameraCueSpec()` in [`src/core/cameraCueParser.ts`](src/core/cameraCueParser.ts) to support timestamp auto-chaining (`startSec = prevShotEndSec`) and per-camera continuity overrides whether authored at the cue root or nested inside `camera:` / `observer_camera:` / `stage_camera:`.
  - Updated [`src/core/scoreParser.ts`](src/core/scoreParser.ts) to pass root `continuous` into `parseObserverShots()` and emit diagnostic warnings when `start` is omitted on observer shot $k \ge 1$ outside continuous mode.
  - Enabled Tier 2 `shots[].observer_camera` cues to automatically inherit host film shot continuity flags or independently override via `observer_camera.continuous`.
  - Added unit test suites in [`tests/unit/scoreParser.test.ts`](tests/unit/scoreParser.test.ts) (observer shot timestamp auto-chaining, cue-level overrides, and typo warnings) and [`tests/unit/frameEngine.test.ts`](tests/unit/frameEngine.test.ts) (continuous observer Dutch roll preservation, offset gliding, Option A neutral resets, and Tier 2 continuity inheritance/overrides).
  - Synchronized domain specifications, AST contract tables, and authoring guides in [`docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md`](docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md), [`docs/STAGEFLOW_SCRIPT_SPECIFICATION.md`](docs/STAGEFLOW_SCRIPT_SPECIFICATION.md), [`docs/YAML_AUTHORING_GUIDE.md`](docs/YAML_AUTHORING_GUIDE.md), and [`.agents/skills/stageflow-score-debugger/SKILL.md`](.agents/skills/stageflow-score-debugger/SKILL.md).

- **Decoupled Entity Blocking Timeline (`blocking:`) & Two-Pass Kinematic Evaluator (`src/core/`, `src/hooks/`, `src/stage/`)**:
  - Added [`BlockingCueSpec`](src/core/types.ts) and optional `StageScore.blocking?: BlockingCueSpec[]` plus `EvaluatedEntityState.cueId?: string | null` in [`src/core/types.ts`](src/core/types.ts), completing StageFlow's orthogonal 3-tier timeline architecture (`blocking:` for physical actor/prop staging, `shots:` for film coverage cuts, and `observer_shots:` for diorama inspection).
  - Added `parseBlockingCues` and `resolveEntityIdentifier` in [`src/core/scorePrimitives.ts`](src/core/scorePrimitives.ts) and wired root `blocking:` parsing and `maxBlockingEnd` timeline duration auto-extension in [`src/core/scoreParser.ts`](src/core/scoreParser.ts), supporting both single-entity cues (`entity: "arthur"`, `start`, `end`, `from`, `position`, `rotation`, `look_at`, `easing`, `highlighted`, `visible`, `note`) and multi-entity beat blocks (`entities: { ... }`).
  - Implemented the **3-Tier Entity Blocking Resolution Hierarchy** and **Two-Pass Kinematic Evaluator** (`evaluateBlockingEntitiesAtTime`) in [`src/core/entityEngine.ts`](src/core/entityEngine.ts):
    - **Tier 1 (`score.blocking` defined)**: Pass 1 forward-chains 3D world positions and visibility per entity across arbitrary time windows and temporal gaps; Pass 2 resolves facing rotations and $C^0$ continuous `look_at` handoffs (sampling target entity coordinates at `cue.endSec` with zero circularity or angular snap).
    - **Option A Ground Movement Trails**: Active blocking cues with displacement $> 0.05\text{m}$ generate a 16-segment floor trail (`trailPoints`) reflecting the full path of the active blocking cue across camera cuts, clearing (`[]`) during stationary holds/gaps.
    - **Hybrid Per-Shot Focus Layering**: Per-shot `shots[k].entities.<id>.highlighted` and `note` overlay non-destructively onto continuous `blocking:` movements.
    - **Tier 2 (`score.blocking` omitted)**: Preserves the legacy per-shot `shots[].entities` evaluator bit-for-bit with zero regression across all bundled blueprints and IndexedDB drafts.
  - Updated [`src/hooks/useStageFrameLoop.ts`](src/hooks/useStageFrameLoop.ts) (`entityCueChanged`) and [`src/stage/DirectionalMannequin.tsx`](src/stage/DirectionalMannequin.tsx) (`isCueDesynced`) so actors walking continuously across camera cuts never freeze or snap backward while still flushing React UI state on blocking cue boundaries.
  - Added unit test suites in [`tests/unit/scoreParser.test.ts`](tests/unit/scoreParser.test.ts) and [`tests/unit/frameEngine.test.ts`](tests/unit/frameEngine.test.ts) verifying single-entity and multi-entity `blocking:` parsing, continuous multi-cut walks, Option A floor trails, gap pose persistence, two-pass mutual gaze continuity, and hybrid per-shot highlight layering.
  - Updated [`SPECIFICATION.md`](SPECIFICATION.md), [`AGENTS.md`](AGENTS.md), [`docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md`](docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md), [`docs/STAGEFLOW_SCRIPT_SPECIFICATION.md`](docs/STAGEFLOW_SCRIPT_SPECIFICATION.md), [`docs/YAML_AUTHORING_GUIDE.md`](docs/YAML_AUTHORING_GUIDE.md), [`docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`](docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md), and [`.agents/skills/stageflow-score-debugger/SKILL.md`](.agents/skills/stageflow-score-debugger/SKILL.md).

- **Opt-In Contiguous Shot Chaining & Physical Oner Trajectory (`continuous: true`)**:
  - Implemented `continuous: boolean` score configuration (`src/core/types.ts` and `src/core/scoreParser.ts`). When declared `continuous: true` at the score root, any shot in `shots:` that omits its `start` (or `_start`) timestamp automatically inherits the preceding shot's `end` timestamp (`startSec = shots[k-1].endSec`), while `shots[0]` defaults to `0.0`.
  - Implemented **Physical Camera Rig Trajectory Chaining** (`src/core/trajectoryChain.ts`): for moving maneuvers (`arc`, `dolly`, `swoop`, `orbit`, `pan`, `tilt`, `roll`, `path`) under `continuous: true`, the camera's physical spherical coordinates (`distance`, `pitch`, `yaw`) seamlessly chain starting from the terminal pose ($P_{\text{prev}}$) of the preceding shot to travel smoothly toward the new shot's authored destination, eliminating sudden spatial teleportation or snaps at shot boundaries in continuous takes ("oners").
  - Preserved **Discrete Prime Lens Selection & Holding**: changing focal length (`lens:`) in a subsequent shot mounts that prime lens immediately at the shot boundary and holds steady across the shot duration, preventing unintended slow motorized zooming unless an optical focal length sweep is explicitly authored via `lens_start` + `lens_end`.
  - Maintained **Explicit Framing Target Boundaries**: look-at target framing snaps cleanly to new subjects on shot boundaries unless an explicit `from:` subject is authored, adhering to directorial staging standards.
  - Implemented **Signed Directed Orbit Mathematics** (`src/core/sphericalMath.ts` and `src/core/maneuvers.ts`): introduced `directedAngleDiff(targetRad, currentRad, direction?: 'cw' | 'ccw')`, ensuring that when authors explicitly specify `direction: 'cw'` or `direction: 'ccw'` on circular `orbit` / `sweep` maneuvers, rotation strictly respects the authored rotational direction and travels up to $360^\circ$ rather than collapsing to the shortest geometric arc $\le 180^\circ$.
  - Preserved explicit `start:` authority: authors can explicitly set `start:` at any shot (including `shots[0]` or mid-timeline) to define deliberate stationary observation holds or gaps between shots.
  - Decoupled `observer_shots:` timeline isolation: `observer_shots:` remains strictly explicit (`start:` and `end:`) to prevent accidental camera movement drift during macroscopic diorama inspection holds.
  - Implemented **YAML Declaration Order Overlap Priority**: updated `frameEngine.ts` to iterate in reverse YAML order when resolving `activeShot`, ensuring the 2D HUD, bottom timeline scrubber, and 3D camera trajectory chain (`trajectoryChain.ts`) always consistently prioritize the latest declared shot in the YAML structure.
  - Added non-blocking Live YAML Drawer diagnostics: when `continuous: false` (or omitted) and a subsequent shot omits `start`, `scoreParser.ts` surfaces an informative warning displayed as an amber banner in `YamlInspectorDrawer.tsx` advising the author to add `start:` or declare `continuous: true`.
  - Clamped `endSec` to `Math.max(startSec + 0.1, rawEnd)` to gracefully protect against authoring typos where `end` is less than the chained `start`.
  - Added unit test suites in `tests/unit/scoreParser.test.ts`, `tests/unit/sphericalMath.test.ts`, and `tests/unit/frameEngine.test.ts` testing contiguous time chaining, physical parameter chaining, discrete lens holding, signed directed orbits, gap holds, typo clamping, and overlap priority.
  - Updated `docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md`, `docs/YAML_AUTHORING_GUIDE.md`, and `SPECIFICATION.md` with dedicated section `5.1 Continuous Take ("Oner") Mode`, rotation direction aliases documentation, and a copy-pasteable 3-phase continuous take recipe (`Recipe 7: Continuous Single-Take Oner`).

- **Camera Target Offset (`target_offset`, `target_offset_start`, `target_offset_end`) Support**:
  - Extended `CameraCueSpec` and `CameraWaypointSpec` (`src/core/types.ts`) with world-space metric offset vectors (`targetOffset`, `targetOffsetStart`, `targetOffsetEnd`).
  - Implemented Option A shot-boundary offset reset and cross-shot recovery (`resolveShotStartOffset`, `resolveShotDestOffset`, and offset-aware `resolveTargetPoint3D` in `src/core/trajectoryChain.ts`), supporting static offsets, animated intra-shot pedestal/pan offsets, and Catmull-Rom spline waypoint offsets.
  - Extended YAML parser (`src/core/scoreParser.ts`) to normalize `target_offset`, `target_offset_start`, and `target_offset_end` on shots, observer shots, spline waypoints, and baseline stage cameras.
  - Added 3 deterministic unit tests in `tests/unit/scoreParser.test.ts` and `tests/unit/frameEngine.test.ts` verifying YAML parsing, Option A reset, optical sightline invariance, and animated offset recovery.

- **Camera Roll (Dutch Angle / Banking) Support across Layers 1–5**:
  - `SphericalPose.roll` added in radians (`src/core/types.ts`), parameterizing camera rotation around the optical sightline with zero position drift.
  - Orthonormal rolled up-vector `CameraTransform3D.up` derived analytically in `sphericalToCartesian` (`src/core/sphericalMath.ts`) using $\vec{U}_{\text{rolled}} = \cos(\gamma)\vec{U}_0 + \sin(\gamma)\vec{R}_0$.
  - Option A shot-boundary reset semantics implemented in `resolveShotStartRoll` and `resolveShotDestRoll` (`src/core/trajectoryChain.ts`), automatically resetting omitted roll to the level baseline ($0^\circ$) while supporting static Dutch angles (`roll`), explicit spans (`roll_start`, `roll_end`), relative turns (`roll_delta`), and cross-shot recovery (`roll_end: 0`).
  - Catmull-Rom spline roll unwrapping and interpolation across waypoints in `evaluateSplineCameraPose`.
  - Pure roll progress interpolation `interpolateRoll` supporting all 11 camera maneuvers in `src/core/maneuvers.ts`.
  - YAML parser extension in `src/core/scoreParser.ts` converting `roll`, `roll_start`, `roll_end`, `roll_delta`, and `dutch` alias in human degrees to radians.
  - 3D Stage Camera banking in `src/stage/StageCameraRig.tsx` via dedicated inner `rollGroupRef` (`rotation.z = -pose.roll`), tilting the chassis and rectangular frustum gate while keeping the floating `"STAGE CAM"` identity badge upright in unrolled space.
  - True 3D Stage Cam Monitor Viewport (`src/stage/StageCamViewRig.tsx`) and Viewport Observer Camera (`src/stage/ObserverCameraRig.tsx`) optical roll synchronization via local `persp.rotateZ(pose.roll)`.
  - UI Telemetry Capsule (`src/ui/CameraTelemetryCapsule.tsx`) displaying live roll degrees, tooltip readout, and 1-click YAML snippet copying with dynamic `roll: <deg>` injection.
  - Optical Stage Cam Monitor HUD (`src/stage/StageCamMonitorCanvas.tsx`) displaying live `ROLL` telemetry.
  - 5 new deterministic unit tests in `sphericalMath.test.ts`, `scoreParser.test.ts`, and `frameEngine.test.ts` verifying position invariance, orthonormal up-vector math, YAML parsing, Option A reset, animated roll, and cross-shot recovery.

#### Layer 2: Universal Media Clock & Audio/Video Sync

- **Remote Score Loader & Query Parameter Parser (`src/core/scoreUrlLoader.ts`, `tests/unit/scoreUrlLoader.test.ts`)**:
  - Introduced pure Layer 1 module `scoreUrlLoader.ts` with zero React/DOM dependencies:
    - `parseInitialUrlQueryParams(search)`: Extracts and normalizes `?score=` (with `?scene=` fallback) and `?url=`.
    - `validateScoreUrl(urlStr)`: Enforces `http:` or `https:` protocol validation.
    - `extractFallbackIdFromUrl(urlStr)`: Extracts sanitized slug from URL pathnames for project naming.
    - `fetchRemoteScoreYaml(targetUrl)`: Safely fetches remote YAML files, performs AST validation via `parseStageScore`, and provides human-readable error diagnostics on HTTP status, CORS restriction, network timeout, or YAML syntax failure.
  - Added comprehensive unit test suite `tests/unit/scoreUrlLoader.test.ts` covering URL parsing, scheme validation, slug extraction, and mocked fetch error handling.

- **Unified Normalized Content Fingerprinting & Conflict Ingestion (`src/core/scoreYamlUtils.ts`, `src/core/storage/scoreDb.ts`, `src/hooks/useScorePersistence.ts`, `src/ui/InteractiveStudioApp.tsx`, `tests/unit/scoreYamlUtils.test.ts`)**:
  - Implemented `normalizeYamlForComparison(yaml)` and 32-bit FNV-1a `computeYamlContentHash(yaml)`, normalizing line endings (`\r\n` $\to$ `\n`) and stripping the top-level `id:` line so a score loaded via `?url=` yesterday and the original `.yaml` file dropped from desktop today produce the exact same fingerprint.
  - Implemented `findDuplicateOrConflictingCustomScore(...)` creating a single unified pipeline for both remote URLs and local file drops:
    - **Exact Content Match**: Instantly opens existing local project with **zero duplicates and zero modal dialog** ($O(1)$ lookup, `< 1ms`).
    - **Identity Collision with Different Content**: Safely prompts conflict modal, preventing silent overwrites of user edits.
    - **New Project**: Ingests cleanly as a persistent Custom Project in IndexedDB.
  - Extended `StoredScoreRecord` with `contentHash`, `originalContentHash`, `sourceUrl`, and `sourceFileName`.

- **URL "Consume & Clear" Address Bar Hygiene (`src/hooks/useScorePersistence.ts`)**:
  - Implemented automatic address bar cleanup via `window.history.replaceState({}, '', window.location.pathname)` immediately upon consuming query parameters (`?score=`, `?scene=`, `?url=`), preventing browser reloads (`F5`) from re-triggering modals or network fetches while cleanly preserving working session drafts.

#### Layer 3: Application Shell, Storage & State Engine

- **Score Library Tab & Accordion Section Persistence (`src/core/storage/localStorageUi.ts`, `src/core/types.ts`, `src/ui/ScoreLibraryModal.tsx`, `src/ui/library/MobileScoreLibraryModal.tsx`, `src/ui/InteractiveStudioApp.tsx`, `src/ui/header/FileMenuDropdown.tsx`, `tests/unit/storage.test.ts`, `docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`)**:
  - **Bundled Blueprints Collapsed by Default on Desktop**: Configured the `Bundled Blueprints` accordion section under the "All" grouped list in [`ScoreLibraryModal.tsx`](src/ui/ScoreLibraryModal.tsx) to default to collapsed (`false`), matching the mobile UX and putting immediate focus on hero `Scene Studies` (Vector Field) and user `Custom Projects`.
  - **Accordion Collapse State Persistence**: Introduced `stageflow:ui:library-study-expanded` (default: `true`), `stageflow:ui:library-blueprint-expanded` (default: `false`), and `stageflow:ui:library-custom-expanded` (default: `true`) in [`localStorageUi.ts`](src/core/storage/localStorageUi.ts), remembering user expand/collapse interactions across reloads in both desktop and mobile library modals.
  - **Filter Tab Persistence**: Introduced `stageflow:ui:library-tab` (default: `'all'`), persisting the selected category tab (`'all' | 'study' | 'blueprint' | 'custom'`). Opening the library normally (active score chip, header button, or File Menu "Score Library...") restores the user's remembered tab, while explicit intents (e.g. File ▾ $\to$ Manage Custom Scores) cleanly override to open the requested tab (`'custom'`).
  - Added unit test cases to `tests/unit/storage.test.ts` verifying persistence, fallback handling, and storage key isolation for library tabs and all three accordion sections.

- **Vercel Web Analytics & Speed Insights (`package.json`, `src/App.tsx`)**:
  - Integrated `@vercel/analytics/react` (`<Analytics />`) and `@vercel/speed-insights/react` (`<SpeedInsights />`) into the root application component in `src/App.tsx`.
  - Configured conditional rendering so analytics and Core Web Vitals telemetry run in interactive studio and guide/specification documentation modes while remaining dormant during headless video recording runs (`isHeadlessRender`).

- **3-Column Studio Layout Architecture (`ResizableSplitWorkspace.tsx`, `WorkspaceHeader.tsx`, `LayoutSegmentedControl.tsx`, `VideoWorkspaceSubpanel.tsx`, `App.tsx`)**:
  - Re-architected StageFlow's workspace into a first-class 30 / 40 / 30 three-column studio (Left: Reference Video + Directorial Subpanel, Center: 3D Blueprint Diorama, Right: Full-Height YAML Score Studio).
  - Paired the center layout segmented pill `[ ◫ Split | ⛶ Full ]` with an adjacent tactile **`[ ✎ Edit ]`** toggle pill styled with SceneFlow-aligned amber accent indicator.
  - Eliminated the legacy `[</> YAML Score]` drawer toggle from the right wing of `WorkspaceHeader.tsx`, leaving the right wing minimal (`[Theme ▾] [Library]`).
  - Added continuous 3-way divider resizing: dual vertical dividers (Left/Center and Center/Right, clamped $18\%–45\%$) and a horizontal row divider inside the left column ($180\text{px}$ min video, $140\text{px}$ min subpanel).
  - Scaffolded modular `VideoWorkspaceSubpanel.tsx` beneath the reference video with active shot tag, timing telemetry, and independent collapse/expand chevron.
  - Fixed subpanel collapse overflow where collapsing `VideoWorkspaceSubpanel` pushed the header bar out of view; docked the 36px header bar permanently above the transport bar with full-width click-to-expand affordance.
  - Added a 1-click **Reset Layout** button to the right of the Library button in the header right wing ([`WorkspaceHeader.tsx`](src/ui/WorkspaceHeader.tsx), [`App.tsx`](src/App.tsx)) that instantly restores default column widths (30/40/30), video height (45%), and subpanel expansion, persisting changes to `localStorage` with a confirmation toast.
  - Added a dual-mode **[ Notes | Stage Cam ]** view toggle to the [`VideoWorkspaceSubpanel.tsx`](src/ui/left-panel/VideoWorkspaceSubpanel.tsx) header, allowing users on video projects to inspect the virtual 3D Stage Cam POV directly beneath the reference video while keeping active WebGL canvases capped at 2, and stripped the redundant shot number badge from the header.
  - Implemented container-query aspect-fit containment (`.aspect-fit-container` and `.aspect-fit-box` via `min(100cqw, calc(100cqh * ratio))`) in [`index.css`](src/index.css), [`UniversalVideoViewport.tsx`](src/ui/UniversalVideoViewport.tsx), and [`VideoWorkspaceSubpanel.tsx`](src/ui/left-panel/VideoWorkspaceSubpanel.tsx), resolving vertical squishing and perspective distortion during divider dragging by enforcing exact film aspect ratio preservation with automatic letterboxing/pillarboxing.
  - Upgraded the 3D Stage Cam monitor safe-action overlay in [`StageCamMonitorCanvas.tsx`](src/stage/StageCamMonitorCanvas.tsx) from fixed pixel padding (`inset-8`) to proportional SMPTE 90% guide frame (`inset-[5%]`).
  - Stripped redundant top overlay bar (`STAGE CAM SIMULATOR` / `YOUTUBE SYNC` badges and floating URL trigger) from [`UniversalVideoViewport.tsx`](src/ui/UniversalVideoViewport.tsx), rendering a 100% clean, distraction-free video canvas.
  - Implemented 4-state workspace matrix (`Split`/`Full` × `Edit ON`/`OFF`), preserving background media clock and offscreen video audio playback in `Full` mode.
  - Added synchronous `localStorage` persistence and unit tests for `isEditMode`, column width percentages, left video height percentage, and subpanel collapse state (`localStorageUi.ts`, `storage.test.ts`).

- **30/70 Default Workspace Split Ratio (`ResizableSplitWorkspace.tsx`)**:
  - Updated initial workspace split from 50/50 to **30% Reference Video / 70% 3D Blueprint Diorama**, providing an expansive, ergonomic 3D staging and blocking canvas by default upon application launch.

- **Protected Bundled Presets & Fork-on-Edit Architecture (`src/core/`, `src/hooks/`, `src/ui/`)**:
  - Implemented the Observable / ShaderToy template protection pattern: factory Blueprints (01–05) are immutably protected reference baselines.
  - Added `isBundledSceneId` and `generateBlankScoreYaml` helpers in [`src/core/scoreCatalog.ts`](src/core/scoreCatalog.ts) and `checkScoreExists` in [`src/core/storage/scoreDb.ts`](src/core/storage/scoreDb.ts).
  - Added `forkScoreAsCustom`, `deleteCustomScore`, `renameCustomScore`, and `createBlankScore` in [`src/hooks/useScorePersistence.ts`](src/hooks/useScorePersistence.ts).
  - Updated [`src/ui/YamlInspectorDrawer.tsx`](src/ui/YamlInspectorDrawer.tsx) with read-only textarea locking (`readOnly={isBundled}`) for bundled presets, displaying an informational top banner and a prominent **`[ Fork to Edit ]`** button that clones the blueprint into an editable custom project with zero risk of accidental preset corruption.
  - Added **Auto-Fork Collision Guard** on drag-and-drop / file upload in [`src/App.tsx`](src/App.tsx): dropping any score whose `id` matches a bundled scene automatically assigns a unique custom ID and saves to `Custom Projects` instead of overwriting the factory baseline.
  - Added **Legacy Draft Auto-Migration** during startup hydration in [`src/hooks/useScorePersistence.ts`](src/hooks/useScorePersistence.ts): detects any modified drafts previously stored under bundled IDs (such as *"The Expansion"* under `demo-blueprint`), automatically migrates them into standalone `Custom Projects`, and restores factory presets to pristine condition with zero data loss.

- **Dedicated Project Management Modal (`src/ui/ManageProjectsModal.tsx`)**:
  - Added an accessible modal dialog opened via the `[ Projects ]` button in [`src/ui/WorkspaceHeader.tsx`](src/ui/WorkspaceHeader.tsx) with custom project count badging.
  - Features real-time project count, inline title renaming, 1-click `.yaml` file export/download, and delete confirmation with smooth fallback to Blueprint 01.

- **Transient Toast Notification System (`src/ui/ToastContainer.tsx`, `src/core/types.ts`)**:
  - Added `ToastNotification` type in [`src/core/types.ts`](src/core/types.ts) and a lightweight, floating feedback banner container in [`src/ui/ToastContainer.tsx`](src/ui/ToastContainer.tsx) rendering 3-second auto-dismissing notifications for file drops, auto-forks, project deletions, and exports.

#### Layer 4: 3D Diorama Stage, Camera Rigs & Viewfinder

- **Visual Presentation Styles for Scene Entities (`src/core/types.ts`, `src/core/scorePrimitives.ts`, `src/stage/DirectionalMannequin.tsx`, `tests/unit/*`, `docs/*`)**:
  - Implemented customizable presentation styles (`style:`) for all 3 entity kinds with optimized directorial defaults:
    - **Characters** (`kind: "character"`): `mannequin` (default stylized figure), `edges` (soft 20% opacity with CAD contour lines), `silhouette` (high-contrast dark matte body `#0f172a` with illuminated pure white eye visor cone for optical composition and framing studies), and `wireframe` (blueprint wireframe mesh cage).
    - **Props** (`kind: "prop"`): `edges` (default soft 20% transparent mass with crisp Drei `<Edges threshold={15} color={color} />` contour lines), `glass` (classic 45% translucent volume without edges), `solid` (dense 88% opaque solid architectural mass), and `wireframe` (blueprint wireframe lattice cage).
    - **Markers** (`kind: "marker"`): `tape` (default flat theatrical floor spike mark at $Y = 0.005\text{m}$), `glow` (flat floor tape mark paired with an illuminated soft emissive halo disc at $Y = 0.002\text{m}$), and `beacon` (floor mark paired with an elevated vertical glowing beacon pin at $0.44\text{m}$ and illuminated sphere tip).
  - Added `normalizeEntityStyle(kind, raw)` helper in `src/core/scorePrimitives.ts` with alias handling (`hologram`, `cad`, `silhouette`, `ink`, `flat`, `glass`, `ghost`, `solid`, `wireframe`, `glow`, `beacon`).
  - Updated `src/scores/blueprints/blueprint_05_two_rooms.yaml` showcasing `style: "edges"`, `style: "solid"`, and `style: "glow"`.
  - Added unit test coverage in `tests/unit/scoreParser.test.ts` verifying style normalization, aliases, and YAML score parsing.
  - Synchronized living documentation across `docs/YAML_AUTHORING_GUIDE.md`, `docs/STAGEFLOW_SCRIPT_SPECIFICATION.md`, and `docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`.

- **Parametric Prop Primitive Shapes & Floor Tape Spike Markers (`src/core/types.ts`, `src/core/scorePrimitives.ts`, `src/stage/DirectionalMannequin.tsx`, `tests/unit/*`, `docs/*`)**:
  - Added `shape:` attribute for `kind: "prop"` supporting `box` (default), `sphere`, `cylinder`, and `capsule`.
  - Added `shape:` attribute for `kind: "marker"` supporting `x` (default crossed gaffer tape), `t` (director's T-mark), `circle` (floor zone ring), and `puck` (elevated 3D marker).
  - Implemented shape normalizers in `src/core/scorePrimitives.ts` with aliases (`ball`, `column`, `pill`, `ring`, `disc`).

- **Prop Primitive Shapes & Stage Floor Gaffer Tape Markers (`src/core/*`, `src/stage/*`, `src/scores/*`, `tests/unit/*`, `docs/*`)**:
  - Added support for multiple 3D geometric primitive shapes for props (`shape: "box" | "sphere" | "cylinder" | "capsule"`) with automatic sphere diameter height derivation and aliases (`ball`, `cup`, `pill`).
  - Added support for theatrical and cinematic stage floor gaffer tape spike marks for markers (`shape: "x" | "t" | "circle" | "puck"`) rendered flat at $Y = 0.005\text{m}$, with the "T" mark orienting with marker rotation.
  - Updated bundled Blueprints: BP 03 (*The Long Distance Pass*) now renders the soccer ball as a true 3D kinetic sphere (`shape: "sphere"`), and BP 05 (*Two Rooms*) renders the porcelain cup as a cylinder (`shape: "cylinder"`) and hallway threshold as a "T" spike mark (`shape: "t"`).
  - Added unit test coverage in [`tests/unit/scoreParser.test.ts`](tests/unit/scoreParser.test.ts) validating shape normalization and score parsing.
  - Synchronized architectural specifications in [`docs/YAML_AUTHORING_GUIDE.md`](docs/YAML_AUTHORING_GUIDE.md), [`docs/STAGEFLOW_SCRIPT_SPECIFICATION.md`](docs/STAGEFLOW_SCRIPT_SPECIFICATION.md), and [`docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`](docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md).

- **Fluid Adaptive Diorama Viewport Framing (Approach A — `computeAdaptiveDioramaFovDeg`, `ObserverCameraRig.tsx`, `opticsMath.ts`)**:
  - Implemented dynamic horizontal stage extent preservation for `'scripted'` and `'free'` observer modes, analytically expanding canvas vertical FOV when split workspace aspect ratio drops below 16:9 ($<1.77$) so that the full stage width visible in 16:9 recordings remains completely visible without side clipping or letterboxing.
  - Added unit test suite in `tests/unit/opticsMath.test.ts` verifying FOV preservation across 16:9, ultrawide, and narrow split viewports.

- **Active Target Pivot Preservation across Camera Presets (`cameraPresets.ts`, `ObserverCameraRig.tsx`)**:
  - Upgraded 1-click angle snaps (**Top / Iso / Front / Side**) to preserve the user's active look-at target or character pivot (Blender Numpad 7/1/3 style) rather than jumping to arbitrary heights.
  - Standardized fallback preset targets to stage chest level `[0, 1.1, 0]`, safely preventing collisions with `MIN_FLOOR_CLEARANCE_M = 0.05`.

- **Dynamic Floor-Clamped 3D Orbit Navigation (`computeFloorClampedMaxPolarAngle`)**:
  - Replaced the static `maxPolarAngle = 0.49π` (~$88.2^\circ$) limit on `OrbitControls` in `ObserverCameraRig.tsx` with height-aware floor clearance calculations.
  - Implemented `computeFloorClampedMaxPolarAngle` in `src/core/sphericalMath.ts` alongside constants `MIN_FLOOR_CLEARANCE_M = 0.05` and `MAX_SAFE_POLAR_ANGLE_RAD = Math.PI * 0.98` (~$176.4^\circ$).
  - Unlocked full $360^\circ$ vertical orbit inspection around flying, aerial, and elevated entities in 3D air without bottom-pole gimbal locks.
  - Enabled true directorial low-angle / worm's-eye views down to floor level ($Y = 0.05\text{m}$) looking up at actors, while stopping smoothly at the floor plane without clipping through the stage grid into the underground void.
  - Added pan target and camera position guards in `ObserverCameraRig.tsx` to prevent panning into negative $Y$.
  - Added 6 unit tests in `tests/unit/sphericalMath.test.ts` verifying clearance calculations across ground, aerial, balcony, and floor targets.
  - Updated Layer 4 diorama specifications in `docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`.

- **Stage Cam POV Director's Optical Viewfinder & Composition Guides**:
  - Implemented `StageCamViewfinderOverlay` (`src/ui/StageCamViewfinderOverlay.tsx`), an optical viewfinder overlay automatically engaging in `Stage Cam POV` (`cameraMode === 'stage-pov'`).
  - Added an active film gate frame matching `score.aspectRatio` (`16:9`, `2.39:1`) with luminous corner brackets, an optical gate stamp (`REC GATE · 16:9 · 50mm`), and an **82% darkened blueprint obsidian Look-Around veil** (`rgba(5, 8, 17, 0.82)`) shading the off-camera perimeter.
  - Implemented analytical vertical FOV compensation `computeViewfinderCanvasFovDeg` (`src/core/opticsMath.ts` and `src/stage/ObserverCameraRig.tsx`) so that dragging the split divider between narrow (`30%`) and wide (`70%` / `100%`) scales the active gate smoothly without horizontal distortion or lens crop.
  - Introduced `VIEWFINDER_GATE_SCALE = 0.84` in `src/core/constants.ts` and helper `computeContainedGateDimensionsPx` in `src/core/opticsMath.ts`.
  - Added toggleable composition guides (90% Safe-Action dashed frame, Rule-of-Thirds 3x3 grid, and Center Optical Crosshairs), switchable via a `[ Guides ]` button in `src/ui/LabelDisplayModeToggle.tsx` and global hotkey **`G`**.
  - Synchronized `showGuides` state with `src/stage/StageCamMonitorCanvas.tsx` and persisted preferences via `loadStoredViewfinderGuides` / `saveStoredViewfinderGuides` (`stageflow:ui:viewfinder-guides`) in `src/core/storage/localStorageUi.ts`.
  - Updated `ShotBreakdownHud.tsx` to highlight `● STAGE CAM VIEWFINDER` in amber when in `stage-pov` mode.
  - Added unit test suites in `tests/unit/opticsMath.test.ts` and `tests/unit/storage.test.ts`.

- **Camera Target Offset Visual Indicators & Core Telemetry**:
  - Added `baseTarget?: Vec3` and `targetOffset?: Vec3` to `EvaluatedCameraTrack` (`src/core/types.ts`) and forward-chaining evaluator (`src/core/trajectoryChain.ts`), providing live un-offset anchor points and active displacement vectors at native 60fps.
  - Implemented `StageCameraOffsetTether` (`src/stage/StageCameraOffsetTether.tsx`), rendering a 3D cyan anchor beacon at the subject's look anchor and a subtle dashed blueprint tether line connecting `baseTarget -> target` inside the diorama whenever target offset is active ($\ge 0.01\text{m}$).
  - Wired `StageCameraOffsetTether` into `StageCameraRig.tsx` using native Three.js primitives for zero React reconciliation overhead.
  - Added visual HUD pills in `ShotBreakdownHud.tsx`: a top-row cyan `OFFSET <magnitude>m` badge with crosshair icon and an optics-row metric vector readout `Δ [+X, +Y, +Z]m`.
  - Added live `OFFSET <magnitude>m` telemetry readout in `StageCamMonitorCanvas.tsx` optical director's monitor bar.
  - Added unit test assertions in `tests/unit/frameEngine.test.ts` verifying `baseTarget` and `targetOffset` evaluation.

#### Layer 5: Directorial UI Shell, HUDs & YAML Studio

- **Official Brand Logo, Mobile App Icon & Dynamic Favicons (`src/ui/WorkspaceHeader.tsx`, `index.html`, `public/`)**:
  - Integrated official StageFlow brand assets across desktop and mobile headers:
    - Desktop (`>= md`): Full horizontal brand logo dynamically switching between `/StageFlow - LOGO - WHITE.png` for dark themes (Dark Obsidian / Pure Black) and `/StageFlow - LOGO - BLACK.png` for light themes (Light Stone / Warm Paper).
    - Mobile (`< md`): Elevated rounded-box icon using `/StageFlow - ICON - Square.png` with theme-adaptive background (`bg-surface-muted border-border-main`) and CSS color inversion (`invert`) for high contrast across all light and dark palettes.
  - Linked browser favicon suite (`favicon.ico`, `favicon-32x32.png`, `favicon-16x16.png`), Apple touch icon (`apple-touch-icon.png`), and web manifest (`site.webmanifest`) in `index.html`.
  - Updated application title in `index.html`, `site.webmanifest`, `README.md`, and header tooltips to: "StageFlow by Taruma Sakti | 3D Camera-Blocking & Scene Choreography Diorama".


- **Desktop Fullscreen Viewport Toggle (`src/ui/WorkspaceHeader.tsx`)**:
  - Surfaced the native browser Fullscreen toggle button on desktop viewports alongside the Reset Layout button in the header right-wing.
  - Dynamically switches icons between `Maximize` and `Minimize` with reactive `fullscreenchange` event tracking and descriptive tooltips across both mobile and desktop.

- **Remote Score Confirmation & Conflict Modal (`src/ui/ConfirmRemoteScoreModal.tsx`)**:
  - Introduced an accessible SceneFlow-style modal dialog supporting three directorial modes:
    - `url-import`: Prompts user before fetching an unseen remote URL, displaying the origin host badge.
    - `url-conflict`: Alerts user when re-opening a URL where the local copy was modified, offering **Keep Existing**, **Overwrite with Remote**, or **Save as New Copy**.
    - `file-conflict`: Alerts user when dropping or opening a file matching an existing Custom Project with different content, offering **Keep Existing**, **Update Existing Project**, or **Import as New Copy**.

- **Dedicated Full-Screen Mobile Score Library (`src/ui/library/MobileScoreLibraryModal.tsx`, `src/hooks/useIsMobile.ts`, `tests/unit/useIsMobile.test.ts`, `docs/ARCHITECTURE_FILE_MAP.md`, `docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`)**:
  - Introduced `MobileScoreLibraryModal.tsx`, an edge-to-edge full-screen mobile score switcher automatically mounted on viewports `< md` (`< 768px`) via `useIsMobile.ts`, while keeping the desktop 2-column master-detail library completely untouched.
  - **1-Tap Direct Scene Loading**: Tapping any score card immediately loads that choreography score into the studio and closes the library dialog in one step with zero navigation hops.
  - **Fluid Category Filter Chips**: Replaces desktop segmented tabs with horizontally scrollable touch pills (`All`, `Studies`, `Blueprints`, `Custom`), omitting desktop-only search and inspector toggles.
  - **Collapsed Blueprints by Default**: In the "All" tab, the `Bundled Blueprints` section defaults to collapsed (showing chevron and count `7`), keeping `Scene Studies` and user `Custom Projects` instantly accessible without excessive vertical scrolling.
  - Added unit test suite `tests/unit/useIsMobile.test.ts` for zero-polling breakpoint evaluation and narrow/tablet viewport classification.

- **Mobile Native Fullscreen Control (`src/ui/WorkspaceHeader.tsx`)**:
  - Introduced a 1-click mobile-only native browser Fullscreen toggle button (`Maximize`/`Minimize` icons via `document.documentElement.requestFullscreen()` and `document.exitFullscreen()`) that mounts on narrow viewports (`< md` / `< 768px`) replacing the desktop-only `Reset Layout` button.

- **Executive Scene Production Brief & Call Sheet (`src/ui/left-panel/SceneProductionBrief.tsx`, `src/ui/left-panel/SceneEntityRoster.tsx`, `src/ui/left-panel/VideoWorkspaceSubpanel.tsx`, `src/ui/InteractiveStudioApp.tsx`)**:
  - Re-architected the Directorial Workspace (left-panel subpanel below the reference video player) into a rich, static Executive Scene Production Sheet & Call Sheet derived directly from score metadata.
  - Replaced the playback-adapting active shot card and placeholder container with a high-density, non-adapting scene production overview.
  - Built a 3-section layout:
    1. **Scene Premise & Directorial Notes Card**: Renders scene title, subtitle, and optional Markdown-formatted premise/notes (`score.description` or `score.notes`).
    2. **Production Specifications Grid**: 4-stat metric cards (Duration, Shots count, Film Gate aspect ratio, and Media Engine badge) plus dynamic Prime Lens Package and Camera Maneuver tag chips extracted across all scene shots.
    3. **Categorized Cast & Props Lineup (`SceneEntityRoster.tsx`)**: Groups entities into Cast & Characters, Set Props, and Spike Marks with blueprint color dots, 3D metric dimensions ($w \times h \times d$ in meters, height, diameter), and presentation styling badges.
  - Renamed the subpanel header toggle to **`[ 📄 Brief | 🎥 Stage Cam ]`** when a video source is attached, defaulting the subpanel view mode to `'brief'`.
  - Added root-level `description` schema support (`description?: string` in `StageScore`, parsing `root.description ?? root.notes` in `scoreParser.ts`) with deterministic unit tests in `tests/unit/scoreParser.test.ts`.

- **Dual-Camera Telemetry Capsule with Integrated `[ OBS | CAM ]` Switcher (`src/ui/CameraTelemetryCapsule.tsx`, `src/ui/CameraTelemetryHoverCard.tsx`, `src/ui/telemetryYamlFormatter.ts`, `tests/unit/telemetryYamlFormatter.test.ts`)**:
  - Implemented an integrated segmented control (`[ 👁 OBS | 🎥 CAM ]`) inside the bottom-right telemetry capsule, enabling directors to seamlessly inspect and copy either the Observer Camera or the active shot's Stage Camera.
  - Formatted scoped YAML snippet generation: `camera:` with indented properties (`target`, `distance`, `pitch`, `yaw`, `lens`, `focus`, `aperture`) when in `CAM` mode, and `observer_camera:` when in `OBS` mode.
  - Implemented automatic mode synchronization: switching viewport modes (bottom-left) to `Stage Cam` automatically selects `CAM`; switching to `Scripted` or `Free Orbit` selects `OBS`, while preserving immediate manual tab overrides.
  - Extracted pure `formatTelemetryYamlSnippet` and comprehensive Vitest unit tests in `tests/unit/telemetryYamlFormatter.test.ts`.
  - Extracted `<CameraTelemetryHoverCard>` displaying full directorial optics in `CAM` mode (focus distance, continuous aperture, maneuver, and physical mount rigs).

- **Centralized Lens Aperture F-Stop Formatter (`src/core/opticsMath.ts`, `tests/unit/opticsMath.test.ts`)**:
  - Implemented `formatApertureFStop(fStop)` rounding continuous iris ramp floats to 1 decimal place with trailing `.0` stripping (e.g. `2.5664...` $\to$ `f/2.6`, `2.0` $\to$ `f/2`, `11.0` $\to$ `f/11`).
  - Added deterministic unit tests in `tests/unit/opticsMath.test.ts` covering standard stops, dynamic interpolation decimals, and infinite DoF edge cases.

- **Two-Tier Table of Contents Sidebar with Subheadings & Scroll Spy (`src/ui/guide/GuideSidebarToc.tsx`, `src/ui/guide/ScoreAuthoringGuideView.tsx`, `src/ui/guide/guideUtils.ts`, `src/ui/guide/guideMarkdownComponents.tsx`, `tests/unit/guideUtils.test.ts`)**:
  - Implemented a dedicated persistent left sidebar Table of Contents (`GuideSidebarToc.tsx`) for the in-app documentation viewer on desktop screens (`lg:` / $\ge 1024\text{px}$), showing full two-tier hierarchy of H2 chapters and detailed H3 subheadings.
  - Added live Scroll Spy tracking via requestAnimationFrame scroll observing, highlighting active sections and subheadings as the user scrolls through the document.
  - Added real-time topic filtering with quick-clear button, filtering the TOC tree outline in real-time.
  - Added responsive slide-over drawer for mobile and tablet displays (`< lg`) triggered by a header TOC button with backdrop blur and auto-close on selection.
  - Retired the redundant top horizontal shortcut pill bar, reclaiming vertical reading space.
  - Updated `cleanMarkdownHeading` and `extractGuideToc` in `guideUtils.ts` with comprehensive unit test coverage in `tests/unit/guideUtils.test.ts`.

- **Phase 1 Code-First YAML Editor Studio with CodeMirror 6 (`src/ui/editor/`, `App.tsx`, `package.json`)**:
  - Replaced the legacy plain `<textarea>` in [`YamlInspectorDrawer.tsx`](src/ui/YamlInspectorDrawer.tsx) with a decoupled, professional CodeMirror 6 editor engine ([`YamlStudioPanel.tsx`](src/ui/editor/YamlStudioPanel.tsx)) mounted in the right studio column.
  - Integrated Lezer-based YAML syntax highlighting (`@codemirror/lang-yaml`), line numbers gutter, soft line-wrapping (`EditorView.lineWrapping`), 2-space tab indent (`indentWithTab`), and native search/replace (`Ctrl+F`).
  - Implemented dynamic, theme-adaptive syntax coloring and editor chrome ([`useCodeMirrorTheme.ts`](src/ui/editor/useCodeMirrorTheme.ts)) adapting smoothly across StageFlow's 4 active themes (`Dark Obsidian`, `Warm Paper`, `Light Stone`, `Pure Black`) using CodeMirror `Compartment` instances with zero reload lag.
  - Implemented non-breaking structured parser diagnostics ([`src/core/scoreParser.ts`](src/core/scoreParser.ts), [`src/core/types.ts`](src/core/types.ts)): extracts exact line and column numbers from `YAMLParseError.linePos` into `diagnostics: ScoreDiagnostic[]` while preserving the existing `{ score, error, warning }` return contract for complete backward compatibility.
  - Added a conditional diagnostics and alert banner ([`YamlDiagnosticsBanner.tsx`](src/ui/editor/YamlDiagnosticsBanner.tsx)): collapses to `null` when the score is valid to maximize visible code space; surfaces exact `Line X, Col Y` error locations with a 1-click **`[ Jump ]`** button that focuses and scrolls the editor directly to the offending line, while keeping the gutter clean and distraction-free.
  - Streamlined the action toolbar into a decoupled two-tier layout:
    - Top header ([`YamlEditorHeader.tsx`](src/ui/editor/YamlEditorHeader.tsx)): clean title bar featuring **`Live YAML Score`**, a live sync indicator (`● Live Sync` with pulsing green dot or `Read-Only` badge), a **`[ SPEC ]`** button (opening the formal mathematical specification in a new tab), a companion **`[ Guide ]`** button (opening the authoring manual in a new tab), and an isolated **`[ ✕ ]`** close button.
    - Companion directorial action bar ([`YamlActionBar.tsx`](src/ui/editor/YamlActionBar.tsx)): dedicated strip housing **`[ Wrap ]`** (toggleable soft line-wrapping), **`[ Copy ]`**, and **`[ Fork to Edit → ]`** (for bundled presets). Redundant project-level actions (`Duplicate`, `Reset`) are omitted as they reside in the Score Library.
  - Added a dedicated standalone Score Documentation & Specification view ([`ScoreAuthoringGuideView.tsx`](src/ui/guide/ScoreAuthoringGuideView.tsx), `src/ui/guide/index.ts`):
    - Mounted on `?mode=guide` and `?mode=spec` to provide a distraction-free, full-window manual reading canvas with **zero WebGL diorama canvas, zero video player, and zero transport bar overhead**.
    - Integrates both [`docs/YAML_AUTHORING_GUIDE.md`](docs/YAML_AUTHORING_GUIDE.md) and [`docs/STAGEFLOW_SCRIPT_SPECIFICATION.md`](docs/STAGEFLOW_SCRIPT_SPECIFICATION.md) with an in-header segmented switcher (`[ SPEC | Guide ]`), synchronizing URL query state (`?mode=guide` / `?mode=spec`).
    - Renders complete markdown with GitHub Flavored Markdown (`react-markdown`, `remark-gfm`) and KaTeX LaTeX math support (`remark-math`, `rehype-katex`, `katex`). Decomposed into [`guideMarkdownComponents.tsx`](src/ui/guide/guideMarkdownComponents.tsx) and [`guideUtils.ts`](src/ui/guide/guideUtils.ts) to strictly enforce the $\le 250$-line modular architecture cap.
    - Configured root viewport unlock (`html[data-mode="guide"]` in [`src/index.css`](src/index.css), [`src/App.tsx`](src/App.tsx), and [`ScoreAuthoringGuideView.tsx`](src/ui/guide/ScoreAuthoringGuideView.tsx)): overrides StageFlow's full-screen 100dvh diorama `overflow: hidden` constraint to enable natural browser window vertical scrolling and text selection throughout the manual.
    - Code-split on-demand via `React.lazy` and `Suspense`, imposing **0 KB initial bundle overhead** on the primary studio layout.
    - Features StageFlow theme selector synchronization (`Dark Obsidian`, `Warm Paper`, `Light Stone`, `Pure Black`), tactical in-page search filtering, 1-click smooth-scrolling section jump chips covering all chapters for both documents, auto-filter clearance on jump, and a `[ ← Back to Studio ]` / tab-close button. Verified by unit test suite `tests/unit/guideUtils.test.ts`.
    - Styled markdown code blocks (`pre`) and tables with theme-adaptive 6px slim rounded custom scrollbars (`custom-scrollbar` in `src/index.css`), replacing bulky OS-native horizontal scrollbars and fixing nested `<pre><pre>` AST rendering in `ReactMarkdown`.
    - Updated [`FileMenuDropdown.tsx`](src/ui/header/FileMenuDropdown.tsx) to route "YAML Authoring Guide" and "Script Specification" menu options directly to `?mode=guide` and `?mode=spec`.
  - Added a dynamic Word Wrap toggle button (`[ Wrap ]`) with CodeMirror `Compartment` reconfiguration in [`useYamlEditor.ts`](src/ui/editor/useYamlEditor.ts) and synchronous `localStorage` persistence in [`localStorageUi.ts`](src/core/storage/localStorageUi.ts) (`stageflow:ui:editor-word-wrap`).
  - Added debounced live sync (~150ms) and multi-tier playback focus collision guards in [`useYamlEditor.ts`](src/ui/editor/useYamlEditor.ts): maintains 0ms local typing latency at 60fps/144fps while debouncing `parseStageScore` and 3D diorama re-evaluation by 150ms of typing inactivity. Fixed cursor snap-to-top race condition during active/looped playback by recording dispatched text only when the debounce timer fires, adding `view.hasFocus` write protection, detecting `sceneId` boundaries, and clamping selection safely.
  - Configured custom slim scrollbar styles on `.cm-scroller` ([`src/index.css`](src/index.css), [`useCodeMirrorTheme.ts`](src/ui/editor/useCodeMirrorTheme.ts)), replacing native OS thick scrollbars with a transparent track and 6px rounded pill thumb matching active studio theme palettes.
  - Preserved [`src/ui/YamlInspectorDrawer.tsx`](src/ui/YamlInspectorDrawer.tsx) as a thin backward-compatible adapter delegating to `YamlStudioPanel.tsx`.

- **4-Corner Directorial HUD Layout & 3D ViewCube Preset Icons (`CameraPresetControls.tsx`, `ShotBreakdownHud.tsx`, `App.tsx`)**:
  - Re-architected diorama chrome into a clean 4-corner layout (Top-Left Info, Top-Right Legend/Labels, Bottom-Left Camera Dock, Bottom-Right Telemetry) that leaves the center stage horizon 100% unobstructed, eliminating visual double-stacking with `[ Split | Full ]`.
  - Replaced text buttons in [`CameraPresetControls.tsx`](src/ui/CameraPresetControls.tsx) with bespoke **isometric 3D ViewCube SVG icons** (Top plan, Iso 45°, Front proscenium, Side profile, and Reset) with descriptive tooltips, mounted directly above the Camera POV mode switcher at bottom-left for 1-click access without popup menus.
  - Set [`ShotBreakdownHud.tsx`](src/ui/ShotBreakdownHud.tsx) to default to the sleek 2-line collapsed pill on load, providing immediate horizontal balance across the top.
  - Upgraded [`ShotBreakdownHud.tsx`](src/ui/ShotBreakdownHud.tsx) with persistent toggleable expand/collapse behavior on card click (maintaining state during 3D camera orbits and playback scrubbing without auto-dismissal interruptions).

- **SceneFlow-Aligned 3-Wing Studio Header & Decoupled Score Library (`src/ui/header/`, `src/ui/ScoreLibraryModal.tsx`, `src/ui/WorkspaceHeader.tsx`)**:
  - Aligned StageFlow's studio header layout and ergonomics with sister application **SceneFlow** (`Screenplay-Sync`), structuring the top navigation into three balanced, decoupled wings.
  - Added [`FileMenuDropdown.tsx`](src/ui/header/FileMenuDropdown.tsx) on the Left Wing grouping media and score I/O: "Open Video or Score..." (file picker trigger), "Export Active Score (.yaml)" (direct browser download), "New Blank Score...", "Manage Custom Scores" (with badge count), "Score Library...", and link to the YAML Authoring Guide.
  - Added [`LayoutSegmentedControl.tsx`](src/ui/header/LayoutSegmentedControl.tsx) on Center Stage providing an elevated segmented pill container for the 4 split workspace layout presets (`50/50`, `70/30 Stage`, `70/30 Video`, `100% Stage`).
  - Added [`ActiveScoreIndicator.tsx`](src/ui/header/ActiveScoreIndicator.tsx) on the Left Wing displaying active score title and `StorageStatusBadge`, acting as an interactive 1-click shortcut to open the Score Library (Option A).
  - Added dedicated [`ScoreLibraryModal.tsx`](src/ui/ScoreLibraryModal.tsx) showcasing all factory blueprints (01–05) and custom IndexedDB scores with category tabs (`All`, `Bundled`, `Custom`), real-time search filtering, and rich metadata cards (duration in seconds, shot count, aspect ratio, persistence status).
  - Added direct YAML download handler `handleExportActiveScore` in [`src/App.tsx`](src/App.tsx) downloading `${activeSceneId}.yaml` with transient toast feedback.
  - Refactored [`src/ui/WorkspaceHeader.tsx`](src/ui/WorkspaceHeader.tsx) from a 245-line monolithic component down to 148 lines, reducing visual density and enforcing strict decoupling ($\le 250$ lines/file).
  - Unified script and project terminology around the official designation **"Score"** across the studio header, project management modal, and library interfaces.

- **Grouped Scene Selector with Semantic `<optgroup>` (`src/ui/WorkspaceHeader.tsx`)**:
  - Structured the header scene switcher into distinct semantic categories: `Bundled Blueprints` and `Custom Projects`, accompanied by an instant `+ New Blank Project...` action.

#### Tooling, Score Studies, Presets & Documentation

- **Scene Studies: "The Expansion" & "AFRAID" (`src/scores/studies/the-expansion.yaml`, `src/scores/studies/afraid.yaml`, `src/scores/catalog.yaml`)**:
  - Added "The Expansion" (`the-expansion.yaml`): 72s continuous sequence shot study demonstrating spatial expansion and rack-focus choreography on a basketball court (11 continuous camera moves, 5 scripted observer shots).
  - Added "AFRAID" (`afraid.yaml`): 45.375s 16-shot dramatic spatial confrontation study in a twilight field setting.
  - Registered `the-expansion` and `afraid` alongside their legacy Taruma Sakti authoring aliases in `src/scores/catalog.yaml`.
  - Updated `vector_field.yaml` subtitle with descriptive narrative synopsis.
  - Updated `tests/unit/storage.test.ts` to assert bundled registration for both new studies and verify unbundled fallback with fictitious identifiers.

- **Declarative Score Catalog Manifest (`src/scores/catalog.yaml`, `src/core/scoreCatalog.ts`)**:
  - Replaced manual 280-line TypeScript import boilerplate with a pure declarative YAML manifest in `src/scores/catalog.yaml`, allowing showrunners to add, remove, reorder, or edit scores and URL aliases purely in YAML without touching TypeScript code.
  - Refactored `src/core/scoreCatalog.ts` to dynamically discover and map all `.yaml` scores using Vite's eager `import.meta.glob('../scores/**/*.yaml', { query: '?raw', eager: true, import: 'default' })`.
  - Preserved 100% backwards compatibility for `ScoreCatalogItem`, `findCatalogItem(idOrAlias)`, `isBundledSceneId(id)`, and `generateBlankScoreYaml(id, title)` across the entire diorama, SVG minimap, and CLI recorder.

- **Decoupled Score Manifest & Canonical Slugs (`src/core/scoreCatalog.ts`, `docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md`)**:
  - Established a curated manifest registry in `scoreCatalog.ts` where public catalog IDs (`score_id`) are explicitly controlled by the showrunner (`'vector-field'`, `'demo'`, `'blueprint-02'` through `'blueprint-07'`), completely decoupled from whatever internal `id:` string is authored inside the YAML text.
  - Added `aliases: string[]` support to `ScoreCatalogItem` preserving backwards-compatible legacy IDs (e.g. `'vector-field-taruma-sakti'`, `'demo-blueprint'`, `'blueprint-02-dialogue'`) and provided `findCatalogItem(idOrAlias)` to seamlessly resolve both canonical slugs and legacy aliases across the studio, tests, and CLI batch recorder.
  - Updated `isBundledSceneId(id)` to be alias-aware, preventing factory presets from ever being overwritten by legacy or canonical IDs.

- **Batch Viewport Video Recorder CLI (`record:batch`) (`scripts/record/batchRecord.ts`, `package.json`, `docs/ARCHITECTURE_FILE_MAP.md`)**:
  - Implemented automated batch recorder CLI iterating over all 7 factory blueprints (BP 01–07) across both Stage Camera POV (`--camera stage-pov`) and Scripted Observer Camera (`--camera scripted`) viewports at 720p 30fps.
  - Added intelligent resume caching to skip already-rendered assets and added standard `npm run record:batch` script shortcut.
  - Rendered all 14 reference blueprint videos into `recordings/` matching the canonical naming convention (`BPXX_STAGE_...` and `BPXX_OBSERVER_...`).

- **Viewport Video Recorder DoF Blur, Diorama Themes & Preset Parity (`scripts/record/*`, `src/recorder/*`, `tests/unit/recorder.test.ts`, `.agents/skills/*`, `docs/*`, `README.md`)**:
  - Added thin-lens Depth of Field (DoF) bokeh blur controls to the deterministic 60fps viewport recorder CLI: `--blur` / `--dof-blur` (forces bokeh blur ON in Stage Cam POV) and `--no-blur` / `--no-dof-blur` (forces OFF), defaulting to authored score YAML (`score.optics?.dofBlur ?? false`) when omitted.
  - Added diorama theme selection (`--theme dark|warm|light`, default: `'dark'`) to the CLI: adapts diorama background color, scene fog, and metric floor grid lines with zero extra draw calls, and matches outer container background in [`src/recorder/HeadlessRecorderView.tsx`](src/recorder/HeadlessRecorderView.tsx) to eliminate border artifacts.
  - Fixed camera preset execution in [`src/recorder/HeadlessRecorderView.tsx`](src/recorder/HeadlessRecorderView.tsx): implemented `applyCustomPoseToFrame()` using `degToRad`, `SphericalPose`, and `sphericalToCartesian()`, ensuring `--preset` (e.g. `isometric`, `top-down`, `front`, `side`) reliably overrides observer camera transforms across initial and stepped frames.
  - Added preset aliases `iso` $\leftrightarrow$ `isometric` and `top` $\leftrightarrow$ `top-down` in [`scripts/record/cameraPresets.ts`](scripts/record/cameraPresets.ts), and aligned preset look-at targets to actor chest level ($[0, 1.1, 0]$).
  - Expanded bundled scene resolution in [`scripts/record/cli.ts`](scripts/record/cli.ts) to support all 6 bundled blueprints (`01` through `06`) and study aliases (`vf`, `vector_field`, `vector-field`).
  - Added unit test coverage in [`tests/unit/recorder.test.ts`](tests/unit/recorder.test.ts) asserting preset aliases, full 6-blueprint and study shortcut resolution, and score vs CLI DoF blur resolution.
  - Updated recorder skill documentation ([`.agents/skills/stageflow-viewport-recorder/SKILL.md`](.agents/skills/stageflow-viewport-recorder/SKILL.md)), [`README.md`](README.md), and [`docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`](docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md) with comprehensive CLI options and recipes.

- **Standalone Viewport Video Recorder Guide (`docs/VIEWPORT_RECORDER_GUIDE.md`, `README.md`, `AGENTS.md`)**:
  - Authored an exhaustive, standalone operating manual and CLI reference for the deterministic 60fps Playwright + FFmpeg viewport video recorder (`npm run record` and `npm run record:batch`).
  - Documented mathematical frame-stepping determinism ($t_i = t_{\text{start}} + i / \text{fps}$ via `?mode=headless-render` and `window.__STAGEFLOW_RECORDER__`), FFmpeg codec arguments (`libx264`, `libvpx-vp9`, 2-pass palettegen GIF, lossless PNG sequence), resolution presets (`1080p`, `4k`, `720p`, `square`, `vertical`), camera viewports (Observer diorama vs. Stage Cam POV), optical DoF bokeh blur, stage theming, and 5 production recipes.
  - Streamlined `README.md` to reference the dedicated guide, added the document to `docs/ARCHITECTURE_FILE_MAP.md` and `AGENTS.md` Section 3, and cross-referenced in `.agents/skills/stageflow-viewport-recorder/SKILL.md`.

- **Standardized GitHub Repository Showcase & Authentic Creator Journey (`README.md`, `docs/*`)**:
  - Restructured and rewritten `README.md` into an open-source landing page anchored in a genuine, curious exploration into the visual grammar of camera blocking and scene choreography.
  - Added an authentic **Why I Built This** section centering on curiosity and study (understanding scene blocking and camera movements) without pretentious industry jargon, third-person self-quotation, or Hollywood titles.
  - Defined StageFlow's 3 core tenets: Study Over Production, Choreography as Code, and Minimalist Spatial Clarity.
  - Structured key capabilities as a human-centric **Cinematic Visual Sequence** (1. 3-Column Resizable Studio & Live YAML, 2. Synchronized Reference Video, 3. Directional Mannequins & Ground Footprints, 4. Rectangular Frustums & Physical Camera Rigs, 5. Visual Focus Planes & Real-Time Bokeh Blur, 6. Millisecond Scrubbing & Free 3D Inspection on Pause).
  - Maintained an intentional text-and-code aesthetic with a canonical YAML score preview (`entities:`, prime lenses, track rig), verified studio hotkeys cheat sheet (`Space`, `[`, `]`, `←`/`→`, `B`, `G`, `L`), and 5-layer decoupled architecture flowchart with direct links to the living specification suite in `docs/`.
  - Added **AI Pair Programming** credits highlighting development within Google Antigravity and pair programming with Gemini 3.8 Flash and Gemini 4 Argon (heavily used for initial scaffolding and mathematical equations), alongside an honest vibe-coded project disclaimer.
  - Added friendly project attribution note welcoming shout-outs and links for community projects and video studies.
  - Standardized references to sister suite application **SceneFlow** across `README.md` and `docs/`.

- **Official GitHub Release Notes Archive (`docs/releases/v1.0.0.md`, `docs/ARCHITECTURE_FILE_MAP.md`)**:
  - Authored standard GitHub release notes for the StageFlow v1.0.0 launch under a new versioned archive directory `docs/releases/`.
  - Comprehensive launch overview covering the dual-camera spatial architecture, declarative YAML schema, universal media clock, thin-lens optics & DoF, physical camera rigs, directorial call sheet, 60fps headless recorder CLI, studio hotkeys, and bundled scene studies.

- **Accessible About & Studio Information Modal (`src/ui/AppInfoModal.tsx`, `src/ui/WorkspaceHeader.tsx`, `src/ui/InteractiveStudioApp.tsx`, `docs/*`)**:
  - Implemented `AppInfoModal.tsx` aligned with sister application SceneFlow parity: features brand logo, version badge, creator credits, directorial intent quote, key capabilities summary, quick shortcuts grid (`Space`, `[`, `]`, `←`/`→`, `B`, `G`, `L`), direct GitHub repository documentation link badges (`GitHub`, `YAML Authoring Guide`, `Mathematical & Kinematic Spec`, `Score Catalog`, `Recorder CLI`), and AI pair-programming credits with vibe-coded disclaimer.
  - Added standalone `Info` button to the top-right header wing (`WorkspaceHeader.tsx`), positioned adjacent to the native fullscreen button.
  - Added global `?` keyboard listener in `InteractiveStudioApp.tsx` (when not typing in an input/textarea/editor) to quickly toggle the modal.
  - Synchronized architectural documentation across [`docs/ARCHITECTURE_FILE_MAP.md`](docs/ARCHITECTURE_FILE_MAP.md) and [`docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`](docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md).

- **Blueprint 06: Optics, Rack Focus & Depth of Field Masterclass (`src/scores/blueprints/blueprint_06_optics_dof.yaml`, `src/core/scoreCatalog.ts`, `tests/unit/*`, `docs/*`, `README.md`)**:
  - Authored and bundled `blueprint_06_optics_dof.yaml` (36.0s, 2.39:1 anamorphic scope, 8 film shots, 2 observer orbits, 2 decoupled blocking cues) showcasing the full suite of StageFlow optical features.
  - Showcases: (1) global root `optics:` configuration, (2) off-axis entity focus locking with emerald focus tether, (3) subject-to-subject cinematic rack focus (`focus_start` $\to$ `focus_end`), (4) explicit metric distance focus pull (`1.6m` $\to$ `6.8m`), (5) dynamic follow-focus tracking on walking Claire, (6) dynamic iris aperture ramping ($f/1.4 \to f/11$), (7) multi-waypoint Catmull-Rom trajectory with per-waypoint focus & DoF, (8) flat polymorphic cue syntax with 3D Vec3 coordinate focus point, and (9) deep focus master scene ($f/\infty$).
  - Registered `blueprint-06-optics-dof` into `INITIAL_CATALOG_ITEMS` in [`src/core/scoreCatalog.ts`](src/core/scoreCatalog.ts) with `category: 'blueprint'`.
  - Added dedicated test coverage in [`tests/unit/frameEngine.test.ts`](tests/unit/frameEngine.test.ts), updated catalog count assertions to 6 in [`tests/unit/scoreContract.test.ts`](tests/unit/scoreContract.test.ts) and [`tests/unit/scoreParser.test.ts`](tests/unit/scoreParser.test.ts), and added bundled scene validation in [`tests/unit/storage.test.ts`](tests/unit/storage.test.ts).
  - Synchronized domain documentation and file maps across [`docs/ARCHITECTURE_FILE_MAP.md`](docs/ARCHITECTURE_FILE_MAP.md), [`docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md`](docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md), [`docs/YAML_AUTHORING_GUIDE.md`](docs/YAML_AUTHORING_GUIDE.md), [`README.md`](README.md), and [`AGENTS.md`](AGENTS.md).

- **Agent Governance Hardening for Declarative DSL Polymorphism & Pre-Delivery Verification (`AGENTS.md`)**:
  - Added Rule 2.6 (`Declarative DSL Polymorphism`) to [`AGENTS.md`](AGENTS.md), codifying that properties must be parsed and supported both flat at the cue root and nested inside specialized sub-blocks (`camera:`, `observer_camera:`), with scoped child blocks empowered to override parent track defaults.
  - Hardened Section 5 (`Pre-Delivery Audit Checklist`) with four model-agnostic guardrails: (1) mandatory DSL polymorphism audits, (2) strict compiler verification (`tsc -b`) to catch unused parameters and type defects masked by transpiled Vitest runners, (3) docs-as-code fixture awareness (`guideSnippets.test.ts`), and (4) dual-tier documentation synchronization across descriptive guides and formal normalized AST contract tables.

- **Architecture File Map Extraction & Pre-Delivery Audit Hardening (`AGENTS.md`, `docs/ARCHITECTURE_FILE_MAP.md`, `README.md`)**:
  - Extracted the 140-line (`13.1 KB`) exhaustive file-by-file repository tree from [`AGENTS.md`](AGENTS.md) into a dedicated [`docs/ARCHITECTURE_FILE_MAP.md`](docs/ARCHITECTURE_FILE_MAP.md) specification, replacing Section 4 in `AGENTS.md` with a compact 5-layer directory summary and reducing `AGENTS.md` from `23,764` bytes to `13,461` bytes (~`10.5 KB` below the `24,000`-byte inline rule cap).
  - Hardened [`AGENTS.md`](AGENTS.md) Section 2.3 and Section 5 (`Pre-Delivery Audit Checklist`) with two mandatory verification guardrails: (1) self-auditing both explicit-value and omitted-field fallback branches in forward-chaining evaluators (`trajectoryChain.ts`, `entity*Evaluator.ts`) to prevent composite state double-accumulation, and (2) running a repository-wide `rg` keyword sweep across `docs/`, `README.md`, `AGENTS.md`, and `.agents/skills/` whenever any YAML property or engine invariant changes.

- **3-Tier Provenance Taxonomy (`study`, `blueprint`, `custom`) & Score Subfolder Restructure (`src/scores/*`, `src/core/types.ts`, `src/core/scoreCatalog.ts`, `src/ui/*`)**:
  - Organized scores into decoupled subfolders: `src/scores/studies/` for directorial scene studies authored by Taruma Sakti, and `src/scores/blueprints/` for synthetic camera-blocking presets and testbeds (BP 01–05).
  - Introduced `ScoreCategory = 'study' | 'blueprint' | 'custom'` across `src/core/types.ts` and `ScoreCatalogItem`.
  - Added **Vector Field** ([`src/scores/studies/vector_field.yaml`](src/scores/studies/vector_field.yaml), 1,080 lines, 32 shots, decoupled blocking, 6 observer moves) as the primary default scene loaded when opening the web application.
  - Updated [`ScoreLibraryModal.tsx`](src/ui/ScoreLibraryModal.tsx) with 4-way filter tabs (`All`, `Studies`, `Blueprints`, `Custom`) and 3 distinct collapsible sections in the master list.
  - Assigned a distinct `STUDY` violet badge in [`ScoreLibraryCard.tsx`](src/ui/library/ScoreLibraryCard.tsx) for scene studies.
  - Added seamless `DEFAULT_SCENE_VERSION` (`v2`) migration in [`src/core/storage/localStorageUi.ts`](src/core/storage/localStorageUi.ts) to default returning cached visitors to *Vector Field* on initial reload without resetting custom projects.
  - Added URL query parameter deep linking support (`?scene=<id>`) in [`src/App.tsx`](src/App.tsx) and [`src/hooks/useScorePersistence.ts`](src/hooks/useScorePersistence.ts).

- **Universal Project-Agnostic Score Contract Test Suite (`tests/unit/scoreContract.test.ts`)**:
  - Implemented `validateScoreContract(score: StageScore)` to rigorously verify any user-provided or study score against StageFlow optical, kinematic, and mathematical invariants (monotonic timestamps, valid maneuvers/easings, focal lengths, distance bounds, target resolution, and stateless 3D frame determinism).
  - Automatically runs contract validations across all study and blueprint scores without hardcoding project-specific shot counts or timestamps.

- **Automated Guide Snippet & Schema Verification Test Suite (`tests/unit/guideSnippets.test.ts`)**:
  - Created an automated Vitest test suite that extracts and parses all 23 YAML score code blocks from [`docs/YAML_AUTHORING_GUIDE.md`](docs/YAML_AUTHORING_GUIDE.md) using `yaml.parse` and `parseScoreYaml`, guaranteeing zero syntax or indentation regressions.
  - Added assertions validating all documented enum aliases (`target_offset`, `target_pos`, `cam_height`, `cam_dist`, `elev`, `azimuth`, `fov`, `lens_mm`, `start_time`, `end_time`) and confirming parser normalization matches canonical properties.
  - Added regression assertions verifying that reserved fields `track` (`trackTarget`) and waypoint `at` parse cleanly without throwing errors.

- **Visual Design System SSOT Documentation (`docs/VISUAL_DESIGN_SYSTEM.md`)**:
  - Established dedicated Single Source of Truth for SceneFlow visual identity, 3-tier font hierarchy (`Libre Baskerville`, `Inter`, `JetBrains Mono`), 4 app themes, CSS semantic custom properties, centralized `UI_TOKENS`, decoupled 3D diorama stage palette system, and performance invariants (`disableTransitionsTemporarily()`, `body.is-resizing-split`).
  - Deduplicated styling tokens and color tables out of [`docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`](docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md) to keep 3D mechanics and visual design decoupled.

- **Unit Test Coverage for Storage & Presets (`tests/unit/storage.test.ts`)**:
  - Added test suites verifying `isBundledSceneId` classification across all bundled blueprints and custom IDs, as well as template generation and schema validity for `generateBlankScoreYaml`.

- **Bundled Blueprint 05: Two Rooms — The Threshold Crossing (`src/scores/blueprint_05_two_rooms.yaml`, `src/core/scoreCatalog.ts`)**:
  - Authored a 30-second, 17-shot `2.39:1` scope choreography score across two spatial zones (Living Room at Stage Left `-X` and Bedroom at Stage Right `+X`) separated by a central Hallway Threshold (`doorway`).
  - Featured 3 actors with distinct physical heights (`samira` at `1.84m`, `ruby` at `1.68m`, and `rosa` at `1.54m`), static furniture props (`living_table`, `lounge_sofa`, `bedroom_desk`, `canopy_bed`), and a dynamically carried item prop (`cup` lifted from the Living Room table at `y=0.78m`, carried at hand height `y=1.05m` across the threshold, and placed onto Rosa's Bedroom desk at `y=0.75m`).
  - Staged continuous multi-cut actor and prop choreography via root-level `blocking:` (including Ruby's 11-second cross-room walk spanning across Shots 07–12) paired with 17 varied-cadence shots (`0.7s` staccato cuts to `3.2s` fluid splines) utilizing Vertigo contrazoom (`85mm -> 24mm`), `82°` God's-eye plunge with `90°` barrel roll, perigee `dive`, shockwave `recoil`, helical `spiral`, threshold `sweep`, 4-waypoint `spline`, and a `210°` CCW two-shot `orbit` with pendulum Dutch roll swing.
  - Registered Blueprint 05 in [`src/core/scoreCatalog.ts`](src/core/scoreCatalog.ts) and updated [`scripts/record/cli.ts`](scripts/record/cli.ts) numeric shortcut matching so `npm run record 05` resolves directly.

- **Workspace Skill: StageFlow Choreography Score Debugger (`.agents/skills/stageflow-score-debugger/SKILL.md`)**:
  - Authored a dedicated workspace skill providing systematic diagnostic methodology to inspect, debug, and smooth StageFlow YAML scores (`*.yaml`).
  - Added a 5-step diagnostic decision tree and runbook covering $C^0$ positional matching, $C^1$ velocity step derivative checks ($\frac{du}{dt}$ across differing easing curves and shot durations), actor vs. camera kinetic desyncs (stop-and-lurch detection), camera maneuver/look-at audits (`from:` vs `target:`, radial `breathe` expansion tuning), and spline vs. contiguous shot evaluation.
  - Included microsecond boundary sampling test script template using `computeStageFrame(t, score)` and a comprehensive cinematography smoothing cheat-sheet.

- **Workspace Skill: StageFlow Viewport Video Recorder (`.agents/skills/stageflow-viewport-recorder/SKILL.md`)**:
  - Authored a dedicated workspace skill providing agents with progressive disclosure runbooks, CLI flags, directorial recipes (Scripted Observer, Stage Cam POV, clean geometry, reference audio slapping, single-shot slicing), and stream verification commands for `npm run record`.

- **Deterministic 60fps Headless Viewport Recorder CLI (`npm run record`)**:
  - Implemented a headless CLI recording tool in `scripts/record/` and `src/recorder/` powered by Playwright and FFmpeg to render and export viewport recordings with mathematical frame determinism ($t_i = i / 60\text{s}$) and zero dropped frames.
  - Added [`src/recorder/HeadlessRecorderView.tsx`](src/recorder/HeadlessRecorderView.tsx) and [`src/recorder/recorderTypes.ts`](src/recorder/recorderTypes.ts) mounting an isolated, chrome-free rendering environment on `?mode=headless-render` that synchronizes `computeStageFrame(t, score)` and exposes a bidirectional frame-stepping bridge via `window.__STAGEFLOW_RECORDER__`.
  - Added modular CLI tooling in `scripts/record/`:
    - [`scripts/record/cli.ts`](scripts/record/cli.ts): Command-line argument parsing, bundled scene shortcut resolution (`01`, `02`, `03`, `04`, catalog IDs), and custom YAML score file loading.
    - [`scripts/record/playwrightDriver.ts`](scripts/record/playwrightDriver.ts): Headless Chromium browser lifecycle manager with hardware WebGL flags, frame-by-frame screenshot loop, and animated terminal progress bar with active shot tracking.
    - [`scripts/record/ffmpegPipeline.ts`](scripts/record/ffmpegPipeline.ts): Raw PNG stdin streaming pipe into FFmpeg supporting H.264 MP4 (`yuv420p`, `-crf 18`), VP9 WebM, animated GIF, or lossless PNG image sequence emission with automatic system FFmpeg resolution.
    - [`scripts/record/serverManager.ts`](scripts/record/serverManager.ts): Automatic Vite dev server health check and background ephemeral server lifecycle management.
    - [`scripts/record/cameraPresets.ts`](scripts/record/cameraPresets.ts): Architectural and cinematic camera angle presets (`isometric`, `top-down`, `front`, `side`).
  - Added granular CLI flags for full recording flexibility:
    - Camera mode: `--camera scripted` (default 3D observer diorama) or `--camera stage-pov` (director's optical lens view).
    - Label and overlay controls: `--labels all | camera-only | off`, `--guides`, and `--hud`.
    - Opt-in reference audio slapping: `--audio <local_path>` to extract and mux the audio track from a reference video or sound file without burning in the reference video visual stream. Default output remains 100% silent for self-contained, offline speed.
    - Time windowing: `--shot <shot_id>` or `--start <sec> --end <sec>`.
    - Resolution and framerate: `--res 1080p | 4k | 720p | square | vertical`, `--fps <number>`.
  - Added Vitest unit test suite in [`tests/unit/recorder.test.ts`](tests/unit/recorder.test.ts) covering camera presets, resolution configurations, FFmpeg discovery, and deterministic stepped frame evaluation.

- **Pure Technical & Mathematical StageFlow Script Specification (`docs/STAGEFLOW_SCRIPT_SPECIFICATION.md`)**:
  - Created [`docs/STAGEFLOW_SCRIPT_SPECIFICATION.md`](docs/STAGEFLOW_SCRIPT_SPECIFICATION.md) as a standalone, formal mathematical and technical specification for writing StageFlow YAML scripts without prescriptive directorial recipes.
  - Documented the right-handed $Y$-up Cartesian coordinate space, spherical camera pose 6-tuple $P = (\vec{T}, d, \theta, \psi, \gamma, f_{\text{mm}})$, forward/inverse Cartesian projections, 35mm full-frame optical gate geometry ($W_{\text{gate}}, H_{\text{gate}}, \text{FOV}_{\text{vert}}$), intrinsic entity look-at anchors, analytical formulas for all 9 temporal easing curves and 11 3D trajectory maneuvers, forward pose chaining ($P_0 \to P_k$) and shot-boundary reset rules, and an exhaustive annotated YAML schema reference.
  - Updated [`AGENTS.md`](AGENTS.md) and [`README.md`](README.md) documentation maps.

- **Blueprint 04 Tutorial Example: "Cinematography & Framing Tutorial" (`public/scores/blueprint_04_cinematography_tutorial.yaml`)**:
  - Authored a 20-second, 16-shot pedagogical tutorial score systematically teaching visual staging grammar:
    - Module 1 (The Framing Ladder, Shots 1–6): Normal static framing sizes from Extreme Wide Shot (18mm) down through WS (28mm), Cowboy MFS (35mm), MS (50mm), MCU (65mm), to Extreme Close-Up (100mm).
    - Module 2 (3D Camera Movement Tracking, Shots 7–10): Dynamic physical camera maneuvers including dolly push-in (50mm), parallel lateral truck (35mm), 70° circular Bezier arc (40mm), and high-to-low crane swoop (28mm).
    - Module 3 (Camera Roll & Dutch Angles, Shots 11–12): Expressive optical axis banking including static +16° Dutch cant (50mm) and dynamic -18° to +18° kinetic roll swing (35mm).
    - Module 4 (Off-Frame & Target Offsets, Shots 13–16): Compositional negative space and target offsets including horizontal Rule-of-Thirds lead room (+0.45m X), vertical headroom bias (-0.40m Y), animated boots-to-eyes pedestal reveal (-1.15m to +0.25m Y), and a 3-actor ensemble master resolve (24mm).
  - Staged across a single actor (Hero), two-shot duo (Hero & Partner), 3-actor ensemble (Hero, Partner, Director), and production prop (Film Slate).
  - Configured decoupled 20-second continuous Observer Camera orbit move (`observer_shots:`) sweeping smoothly from high-angle distance $27.93\text{m}$, yaw $69.2^\circ$, pitch $24.8^\circ$ down to $11.63\text{m}$, yaw $171.7^\circ$, pitch $28.0^\circ$ around the stage center.
  - Registered Blueprint 04 in `src/core/scoreCatalog.ts` and added comprehensive deterministic unit tests in `tests/unit/scoreParser.test.ts` and `tests/unit/frameEngine.test.ts`.

- **Blueprint 03 Choreography Example: "The Long Distance Pass" (`public/scores/blueprint_03_ball_pass.yaml`)**:
  - Authored a 30-meter, 3-actor, 6-shot dynamic choreography score illustrating:
    - Wide-span spatial staging with three characters aligned along the $X$-axis: Arthur at $X = -15\text{m}$, Ruby at $X = +5\text{m}$ ($20\text{m}$ span), and Mark at $X = +15\text{m}$ ($10\text{m}$ span).
    - Parabolic projectile arc for the ball pass from Arthur to Ruby utilizing gravity deceleration and acceleration: Shot 1 ascent to $5.2\text{m}$ apex using `ease-out`, followed by Shot 2 steep descent into Ruby's hands using `ease-in`.
    - Multi-second centrifugal ball orbit around Ruby across Shots 3 and 4 ($t = 6.0\text{s} \to 11.0\text{s}$) with dynamic actor gaze tracking (`look_at: "ball"`).
    - High-speed straight-line bullet pass from Ruby to Mark across Shots 5 and 6 ($10\text{m}$ direct horizontal trajectory at $Y = 1.25\text{m}$).
    - Stage camera solely tracking the ball (`target: "ball"`) across all 6 shots with varied lenses ($28\text{mm}$, $35\text{mm}$, $50\text{mm}$, $65\text{mm}$, $85\text{mm}$) and expressive Dutch roll angles ($+14^\circ$, $-18^\circ$, $+22^\circ$, $-16^\circ$, dynamic roll swing $-12^\circ \to +12^\circ$, and settling to $0^\circ$ on catch).
    - Viewport diorama camera left unscripted (omitted `observer_shots:`), enabling full free orbit inspection at all times.
  - Registered Blueprint 03 in `src/core/scoreCatalog.ts` alongside Blueprint 01 and 02.
  - Updated unit test catalog assertions in `tests/unit/scoreParser.test.ts` and added comprehensive deterministic choreography verification in `tests/unit/frameEngine.test.ts`.

### Changed

#### Theming, Visual Design System & Brand Identity

- **Light Theme Default & Matching Diorama Mode (`src/hooks/useAppShellTheme.ts`, `src/stage/dioramaTheme.ts`, `src/ui/header/ThemeSelectorDropdown.tsx`, `src/ui/WorkspaceHeader.tsx`)**:
  - Changed the default application shell theme from `'dark'` (Warm Obsidian) to `'light'` (Clean Warm Stone) across `useAppShellTheme` and UI chrome.
  - Set the default 3D diorama stage theme mode from `'dark'` (Fixed Studio) to `'match-app'` (Follows App), dynamically linking the diorama floor and background to the active light stone theme on fresh launches.
  - Updated 3D stage and monitor components (`BlueprintFloorGrid.tsx`, `BlueprintStageScene.tsx`, `DioramaCanvas.tsx`, `StageCamMonitorCanvas.tsx`, `UniversalVideoViewport.tsx`, `YamlStudioPanel.tsx`) to default `themeCategory` and `effectiveTheme` to `'light'`.
  - Reordered options in `ThemeSelectorDropdown.tsx` with `Light` and `Match` prominently positioned as primary selections.
  - Aligned browser HTML theme color and web manifest metadata (`<meta name="theme-color" content="#f5f5f4" />`, `site.webmanifest`) with the light stone palette (`#f5f5f4`).
  - Updated domain specifications (`docs/VISUAL_DESIGN_SYSTEM.md`, `docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`), `README.md`, and unit tests in `tests/unit/storage.test.ts` to assert light baseline colors and match-app resolution.

- **Unified Category Color System & Collapsible Sections (`src/ui/library/ScoreLibraryCard.tsx`, `src/ui/ScoreLibraryModal.tsx`, `src/ui/library/ScoreInspectorPane.tsx`)**:
  - Implemented **Unified Category Color Indicator (Option A)**: Replaced rainbow per-blueprint borders with a consistent architectural **Sky Blue** (`border-l-sky-500`, `bg-sky-500/15`, `text-sky-400`) accent border and tag badge for all bundled factory blueprints (`BP 01`–`BP 05`), while user-created projects share a warm **Amber** (`border-l-amber-500`, `bg-amber-500/15`, `text-amber-400`) accent.
  - Aligned inspector status chips in [`ScoreInspectorPane.tsx`](src/ui/library/ScoreInspectorPane.tsx) to match the Sky Blue (Bundled) and Amber (Custom) category palettes.
  - Added **Interactive Collapsible Sections** to the score list: `BUNDLED BLUEPRINTS` and `CUSTOM PROJECTS` headers now feature rotating chevron indicators (`ChevronDown` / `ChevronRight`) and item count badges, allowing one-click collapsing and expanding of sections.
  - Linked keyboard arrow navigation (<kbd>↑</kbd> / <kbd>↓</kbd>) dynamically to `visibleScores`, ensuring arrow traversal skips collapsed sections and steps exclusively through expanded scores.

- **SceneFlow Visual Design System Parity & Centralized `UI_TOKENS` (`src/ui/tokens/ui.ts`, `src/index.css`, `index.html`)**:
  - Brought sister application **SceneFlow** (`Screenplay-Sync`) visual design language, tactile physical stationery pill chrome, and refined editorial micro-typography to StageFlow.
  - Added centralized [`src/ui/tokens/ui.ts`](src/ui/tokens/ui.ts) bundling Tailwind class presets for layout shells (`appHeader`, `sectionTitle`), modals (`containerSm`, `containerMd`, `containerLibrary`, `header`, `footer`), dropdowns (`menu`, `header`, `item`), and tactile buttons (`actionPill`, `filePill`, `libraryPop`, `settingsPill`, `segmentedGroup`).
  - Added Google Fonts preconnect and loaded `Libre Baskerville` alongside `Inter` and `JetBrains Mono` in [`index.html`](index.html).
  - Defined CSS custom properties in [`src/index.css`](src/index.css) for 4 distinct theme categories (`light`, `warm`, `dark`, `pure-black`) mapping `--app-bg`, `--surface`, `--surface-subtle`, `--surface-muted`, `--border-main`, and text tokens.

- **4-Mode App Shell Theme Engine & Transition Freezing (`src/hooks/useAppShellTheme.ts`, `src/ui/header/ThemeSelectorDropdown.tsx`)**:
  - Added [`useAppShellTheme.ts`](src/hooks/useAppShellTheme.ts) managing `AppThemeMode` (`auto`, `dark`, `warm`, `light`) with synchronous `localStorage` persistence (`stageflow:ui:theme-mode`) in [`src/core/storage/localStorageUi.ts`](src/core/storage/localStorageUi.ts).
  - Added `disableTransitionsTemporarily()` which freezes CSS transitions across the entire DOM for 1 frame during theme swaps, eliminating transition reflow stutter.
  - Added [`ThemeSelectorDropdown.tsx`](src/ui/header/ThemeSelectorDropdown.tsx) in the right wing of `WorkspaceHeader.tsx` allowing 1-click switching between Dark (Obsidian Studio), Warm (Drafting Paper), Light (Warm Stone), and Auto (System Match).

- **Decoupled 3D Diorama Stage Theme Mode (`DioramaThemeMode`, `src/hooks/useAppShellTheme.ts`, `src/stage/dioramaTheme.ts`)**:
  - Decoupled the 3D diorama canvas theme from the 2D app shell theme, allowing users to keep the 3D diorama stage in a high-contrast dark blueprint void (`Dark` mode default) even when running the 2D app shell in `Warm` drafting paper or `Light` stone modes.
  - Added `DioramaThemeMode` (`'dark' | 'match-app' | 'warm' | 'light'`) with synchronous `localStorage` persistence (`stageflow:ui:diorama-theme-mode`).
  - Added a dedicated 3D Diorama Stage section inside [`ThemeSelectorDropdown.tsx`](src/ui/header/ThemeSelectorDropdown.tsx) for 1-click stage theme selection (`Dark`, `Match App`, `Warm`, `Light`).
  - Added [`src/stage/dioramaTheme.ts`](src/stage/dioramaTheme.ts) mapping WebGL background clear color, scene fog, and metric floor grid materials dynamically to the effective category with **0 additional WebGL draw calls or shader passes**.
  - In `dark` mode: obsidian floor (`#171514`) with cyan and slate precision grid lines.
  - In `warm` mode: ivory drafting paper floor (`#faf7f0`) with subtle warm grey metric grid lines.
  - In `light` mode: clean white floor (`#ffffff`) with warm stone grid lines.
  - Updated `DioramaCanvas.tsx`, `StageCamMonitorCanvas.tsx`, and `BlueprintFloorGrid.tsx` to react to `themeCategory`.

- **Tactile Pill Restyling of 2D Directorial Chrome**:
  - Restyled [`src/ui/WorkspaceHeader.tsx`](src/ui/WorkspaceHeader.tsx), [`src/ui/header/FileMenuDropdown.tsx`](src/ui/header/FileMenuDropdown.tsx), [`src/ui/header/LayoutSegmentedControl.tsx`](src/ui/header/LayoutSegmentedControl.tsx), and [`src/ui/header/ActiveScoreIndicator.tsx`](src/ui/header/ActiveScoreIndicator.tsx) with rounded pill geometry and subtle borders.
  - Restyled [`src/ui/DirectorialTransportBar.tsx`](src/ui/DirectorialTransportBar.tsx) with SceneFlow pill buttons, rounded timecode readout, and theme-aware shot cut chips.
  - Restyled [`src/ui/UniversalVideoViewport.tsx`](src/ui/UniversalVideoViewport.tsx) with rounded video player container card and tactile source mode badges (`YOUTUBE SYNC`, `LOCAL VIDEO`, `STAGE CAM SIMULATOR`).
  - Restyled [`src/ui/ShotBreakdownHud.tsx`](src/ui/ShotBreakdownHud.tsx) and [`src/ui/CameraTelemetryCapsule.tsx`](src/ui/CameraTelemetryCapsule.tsx) with tactile pill cards and soft shadows.
  - Restyled [`src/ui/ScoreLibraryModal.tsx`](src/ui/ScoreLibraryModal.tsx), [`src/ui/library/ScoreLibraryCard.tsx`](src/ui/library/ScoreLibraryCard.tsx), [`src/ui/YamlInspectorDrawer.tsx`](src/ui/YamlInspectorDrawer.tsx), [`src/ui/ManageProjectsModal.tsx`](src/ui/ManageProjectsModal.tsx), and [`src/ui/ConfirmResetModal.tsx`](src/ui/ConfirmResetModal.tsx).

#### Workspace Layout, Mobile Experience & Score Library

- **Mobile & Narrow Viewport Directorial Experience (`src/ui/WorkspaceHeader.tsx`, `src/ui/ResizableSplitWorkspace.tsx`, `src/ui/UniversalVideoViewport.tsx`, `src/ui/DirectorialTransportBar.tsx`, `src/ui/header/ActiveScoreIndicator.tsx`, `docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`)**:
  - **Dynamic Aspect Ratio Fitting with 40% Maximum Height Clamp**: On mobile (`< md` / `< 768px`), the video column scales dynamically to hug the rounded video card via `min(40%, calc((100vw - 20px) / var(--aspect-ratio) + 20px))`. Widescreen media (`16:9`, `2.39:1`) fits with uniform 10px frame padding on all sides without vertical dead space above or below, automatically releasing extra vertical height to the 3D Blueprint Diorama (e.g. ~68%–75% for widescreen). Taller media (`4:3`, `1:1`) is clamped cleanly at the 40% height threshold to guarantee the 3D diorama retains at least 60% of the screen height.
  - **Tactile Rounded Card Presentation**: Retains the signature `rounded-2xl border border-border-main shadow-xl` floating card aesthetic on mobile with balanced 10px outer frame padding (`p-2.5 md:p-3`), preserving the stationery design while eliminating unbalanced top/bottom voids.
  - **Scene Desk Auto-Suppression**: In mobile view, the Scene Desk subpanel (`VideoWorkspaceSubpanel.tsx`) is completely hidden, allowing the reference video (or procedural Stage Cam) to utilize the full top slot without letterbox fragmentation, while eliminating redundant secondary WebGL contexts on phones.
  - **Header Compacting**: On mobile (`< md`), brand text (`StageFlow · 3D Blocking Diorama`) and the `File ▾` menu are hidden, giving maximum width to `ActiveScoreIndicator.tsx` to display active score titles with smooth ellipsis truncation (`truncate`).
  - **Streamlined Transport Bar**: Auto-hides the shot chips strip (`DirectorialShotChipsStrip.tsx`) on mobile (`hidden md:block`), reducing footer height to only the Scrubber Track and Transport Deck controls, reclaiming ~35px of vertical screen height for 3D blocking inspection.

- **Dedicated Compact Diorama Header for Narrow Viewports (`CompactDioramaHeader.tsx`, `App.tsx`)**:
  - Implemented real-time diorama container measurement via `ResizeObserver` with a narrow threshold at $580\text{px}$.
  - When diorama width $< 580\text{px}$ (e.g. extreme split view or compact viewports), replaces the three separate floating overlays (`ShotBreakdownHud`, `CameraModeSwitcher`, and `CameraPresetControls` + `LabelToggle`) with a dedicated unified header mounted at `top-3 left-3 right-3`.
  - Integrates an active shot chip with click-to-expand details popover, streamlined 3-way camera mode switcher, and a consolidated `[ View ▾ ]` dropdown menu housing camera presets (Top, Iso, Front, Side, Reset), 3D label display modes, and optical guides toggle with click-outside dismissal.

- **Narrow Viewport Telemetry Auto-Hiding (`App.tsx`, `CameraTelemetryCapsule.tsx`)**:
  - Automatically unmounts the bottom-right `CameraTelemetryCapsule` when diorama width $< 580\text{px}$, leaving the narrow 3D diorama stage 100% clean and unobstructed with zero floating chrome blocking the floor or actors.

- **High-Density Compact Score Library Navigation & Keyboard Shortcuts (`src/ui/library/ScoreLibraryCard.tsx`, `src/ui/ScoreLibraryModal.tsx`)**:
  - Refactored score list cards into ultra-compact, high-density ~50px 2-line rows, dropping item vertical height by ~60% and increasing visible items from ~3.5 to 9–10 scores simultaneously without scrolling.
  - Formatted Line 1 with color-coded blueprint tag (`BP 01`–`BP 05`, `CUSTOM`) and clean `Inter` (`font-sans text-xs font-semibold`) un-truncated title.
  - Formatted Line 2 with precision tabular telemetry in `JetBrains Mono` (`font-mono text-[10px]`) displaying media engine source badge (`Simulator`, `YouTube`, `Local`), duration (`30.0s`), shot count (`17 shots`), and aspect ratio (`2.39:1`) delimited by subtle mid-dots (`·`).
  - Added full keyboard arrow navigation (`↑` / `ArrowUp` and `↓` / `ArrowDown`) to step through scores effortlessly, instantly updating the selected score, right-column inspector, and 2D vector stage minimap in real time.
  - Added `Enter` key shortcut to load the selected score directly into the diorama studio and close the modal (safely bypassed when typing in inputs).
  - Added sticky section headers (`BUNDLED BLUEPRINTS` vs `CUSTOM PROJECTS`) with count badges in the `All` tab to provide clear structural orientation across long project lists.

- **Choreography Score Library Master-Detail Elevation & 2D SVG Stage Minimap (`src/ui/ScoreLibraryModal.tsx`, `src/ui/library/ScoreStageMinimap.tsx`, `src/ui/library/ScoreInspectorPane.tsx`)**:
  - Elevated the score library from a basic 2-column card grid into a spacious 2-column **Master-Detail Studio Hub** (`max-w-5xl`), featuring a fast-scrolling score list on the left (~40%) and a comprehensive Choreography Inspector on the right (~60%).
  - Added [`ScoreStageMinimap.tsx`](src/ui/library/ScoreStageMinimap.tsx) generating a pure 2D vector SVG top-down stage schematic (metric grid, character proxy circles with facing chevrons, and camera trajectory cones) derived directly from in-memory score geometry in $< 0.1\text{ms}$ with **0 WebGL overhead and 0 asset downloads**, automatically supporting both factory blueprints and user-created custom scores.
  - Added [`ScoreInspectorPane.tsx`](src/ui/library/ScoreInspectorPane.tsx) presenting un-truncated titles, directorial notes, media engine badges (`YouTube Sync`, `Stage Cam Simulator`, `Local Video`), optical lens breakdowns, camera maneuver tags, actor lineups, and shot-by-shot coverage strips.
  - Refactored [`ScoreLibraryCard.tsx`](src/ui/library/ScoreLibraryCard.tsx) to support un-truncated title wrapping, media source classification badges, and distinct selected/active visual states.
  - **Unified Project Lifecycle Management & Modal Consolidation**: Embedded custom project lifecycle actions (inline renaming, duplication, YAML export, and delete confirmation) directly into the Score Library inspector, eliminating the separate `ManageProjectsModal.tsx` and connecting the header `File ▾ -> Manage Custom Scores` directly to the library's custom tab.

- **60fps Split Workspace Divider Dragging (`body.is-resizing-split`)**:
  - Integrated `is-resizing-split` class in [`src/ui/ResizableSplitWorkspace.tsx`](src/ui/ResizableSplitWorkspace.tsx) during pointer drag, suppressing transitions and iframe pointer interception across the window for butter-smooth 60fps divider resizing.

- **Choreography Score Library Aesthetic & Card Redesign (`src/ui/ScoreLibraryModal.tsx`, `src/ui/library/ScoreLibraryCard.tsx`)**:
  - Decomposed `ScoreLibraryModal.tsx` into a modular [`src/ui/library/ScoreLibraryCard.tsx`](src/ui/library/ScoreLibraryCard.tsx) component conforming to decoupling standards ($\le 250$ lines/file).
  - Replaced terminal-heavy 100% monospace styling with crisp typographic hierarchy: modern sans-serif (`font-sans`) for titles and subtitles, reserving `font-mono` for technical telemetry pills.
  - Fixed aspect ratio raw float display bug (`1.7777777777777777` -> `16:9` / `2.39:1`) via robust `formatAspectRatio` helper.
  - Added color-coded blueprint category tags (`BP 01`–`BP 05` and `CUSTOM`) with custom hover borders matching blueprint accents.
  - Expanded modal canvas from `max-w-3xl` to `max-w-4xl` for spacious 2-column card layouts with interactive `Open →` hover cues and active scene amber halos.

- **Studio Header Ergonomics & Layout Simplification (`src/ui/`, `src/core/`)**:
  - **Fixed File Dropdown Stacking Context Overlap**: Added `relative z-30` to `<header>` in [`src/ui/WorkspaceHeader.tsx`](src/ui/WorkspaceHeader.tsx), creating an explicit stacking context above diorama viewport canvases and preventing overlay badges (such as `STAGE CAM SIMULATOR` in `UniversalVideoViewport.tsx`) from occluding the `File` menu dropdown and its children.
  - **Clean Active Score Title Indicator**: Removed the redundant persistence state badge (`StorageStatusBadge`) from [`src/ui/header/ActiveScoreIndicator.tsx`](src/ui/header/ActiveScoreIndicator.tsx), eliminating visual noise (`Bundled Baseline` / `Custom (IndexedDB)`) from the main header and expanding the title truncation ceiling so score titles can breathe naturally, while preserving persistence telemetry in the live YAML drawer status bar and Score Library modal.
  - **Streamlined Workspace Layout Controls (`Split` | `Full`)**: Simplified [`src/ui/header/LayoutSegmentedControl.tsx`](src/ui/header/LayoutSegmentedControl.tsx) from redundant numerical presets into a clean 2-mode segmented toggle (`Split` vs. `Full`), anchored at the exact mathematical 50% midpoint of the header bar (`absolute left-1/2 -translate-x-1/2`) to eliminate asymmetrical flex-flow drift caused by longer left-wing titles.
  - **Memory-Preserving Split Restoration**: Updated [`src/ui/ResizableSplitWorkspace.tsx`](src/ui/ResizableSplitWorkspace.tsx) and [`src/App.tsx`](src/App.tsx) so toggling between `Split` and `Full` smoothly remembers and restores the user's customized drag percentage (defaulting to 50%), and auto-switches to `Split` whenever the divider is dragged.
  - **Backward-Compatible Persistence Migration**: Updated `SplitPreset` in [`src/core/types.ts`](src/core/types.ts), [`src/core/storage/localStorageUi.ts`](src/core/storage/localStorageUi.ts), and [`tests/unit/storage.test.ts`](tests/unit/storage.test.ts) to `'split' | 'full'` while transparently migrating any legacy stored presets (`50-50`, `70-30`, `30-70`, `0-100`).

#### Directorial Playback Deck, Shot Breakdown & Telemetry

- **Stage Cam Monitor Telemetry Spacing (`src/stage/StageCamMonitorCanvas.tsx`)**:
  - Tightened the horizontal flex gap between telemetry items (`FOV · ROLL` and `YAW · DIST · FOCUS`) from `gap-1.5` (6px) to `gap-1` (4px), reducing visual separation around middle-dot separators for improved pill density and consistency with the opposite `MANEUVER:` badge.

- **Scene Desk Visual Compacting & 4-Card Architecture (`src/ui/left-panel/VideoWorkspaceSubpanel.tsx`, `src/ui/left-panel/SceneProductionBrief.tsx`, `src/ui/left-panel/SceneEntityRoster.tsx`, `docs/ARCHITECTURE_FILE_MAP.md`, `docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`)**:
  - Renamed left-panel subpanel from `"Directorial Workspace"` to **`"Scene Desk"`**, providing a punchy, industry-authentic title that eliminates header crowding alongside the `[ Brief | Stage Cam ]` toggle.
  - Restructured the Scene Brief into a high-density 4-card architecture:
    1. **Glance Stat Ribbon**: Single-line slate summary card displaying Duration, Shot count, Film Gate aspect ratio, and Media Engine badge with divider dots.
    2. **Scene Premise & Notes**: Tightened title, subtitle, and Markdown description with proportional padding (`p-2.5 rounded-xl`).
    3. **Camera & Optical Package**: Dedicated card for prime lens package and camera maneuver chips.
    4. **Cast & Props Lineup (`SceneEntityRoster.tsx`)**: Streamlined entity tags with flattened attributes (e.g. `● Ruby (1.70m)`), eliminating double-nested gray background pills.
  - Reduced total vertical scroll height by ~50% (~240px total), allowing the entire Scene Desk to be inspected above the scroll fold on standard viewports.

- **Top-Left Directorial Shot Breakdown HUD Redesign & Visual Polish (`src/ui/ShotBreakdownHud.tsx`, `src/ui/shotBreakdownUtils.ts`, `tests/unit/shotBreakdownUtils.test.ts`, `docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`)**:
  - Unified header layout across both Collapsed and Expanded states into a single continuous row (`[#xx]` dark badge, clean title without redundant `"Shot ## · "` prefix, and chevron toggle), permanently resolving the visual jump where `#xx` was previously stranded alone on an empty line in expanded view.
  - Streamlined collapsed line 2 with essential cine spec tokens (`35mm · DOLLY · F 2.6m · Δ 0.19m`) featuring semantic color accents, removing viewport state clutter (`Paused · Free Orbit` which is already displayed in the bottom-left camera dock).
  - Implemented structured 2-row directorial spec strip in the expanded state:
    - **Optics & Rig Row**: Focal length, aperture stop, film gate aspect ratio (`16:9 Gate`, `2.39:1 Gate`), compass rig/maneuver badge, and focus distance.
    - **Directorial Tracking Row**: Look-At Target with crosshair and entity theme color dot (`🎯 ● Ruby (Hero)` resolved against scene entities), full 3D signed offset vector (`Δ [+0.15, -0.12, +0.00]m`), and shot timing (`Start 42.0s · Dur 16.0s`).
  - Restyled directorial staging description into simple, elegant italic text (`text-[11px] font-sans italic text-text-muted leading-relaxed`) below a subtle border-t divider, removing heavy card containers and borders for a clean, distraction-free reading experience.
  - Extracted pure helper functions (`cleanShotLabel`, `resolveShotTargetInfo`, `formatSignedVector3D`, `formatFilmGateLabel`, `formatShotTiming`) into `shotBreakdownUtils.ts` with 12 deterministic unit tests in `tests/unit/shotBreakdownUtils.test.ts`.

- **Directorial Hover Card Header & Action Footer Polish (`src/ui/CameraTelemetryHoverCard.tsx`)**:
  - Replaced crowded 2-line header with a clean single-line title (`[ 🎥 Stage Camera ]` / `[ 👁 Observer Camera ]`) and dedicated `YAML` pill badge.
  - Relocated copy guidance to a centered helper footer (`📋 Click capsule to copy YAML block`), eliminating awkward line wraps and text breaks.

- **Responsive Directorial Monitor Header & Compact Telemetry Spacing (`src/stage/StageCamMonitorCanvas.tsx`, `docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`)**:
  - Replaced verbose `"STAGE CAM 01"` designation and `"Full-Frame"` suffix with a concise `● CAM | [lens]mm · [f-stop]` format with `whitespace-nowrap shrink-0` protection.
  - Paired labels and values inside the secondary optical telemetry pill (`FOV [value]° · ROLL [value]°`) with `gap-1` and tightened container spacing to `gap-1.5`, eliminating wide sibling spacing and visually binding labels to numbers.
  - Made the secondary optical telemetry pill container-responsive with `hidden @md:flex whitespace-nowrap shrink-0`, automatically hiding on narrow panel widths ($< 448\text{px}$) to prevent header line wraps and collision with the `[BLUR ON/OFF]` button.
  - Tightened bottom status bar gaps (`gap-1` on `MANEUVER: CUT` and `gap-1.5` on `YAW · DIST · FOCUS`), preventing line wraps while increasing visual breathing room for the 3D viewport.

- **Directorial HUD Aperture Readout Rounding (`src/ui/ShotBreakdownHud.tsx`, `src/stage/StageCamMonitorCanvas.tsx`, `src/ui/StageCamViewfinderOverlay.tsx`)**:
  - Integrated `formatApertureFStop` across the Top-Left HUD, Procedural Monitor header, and Director's Viewfinder overlay, permanently eliminating 16-digit raw IEEE-754 float readouts during dynamic aperture racks and iris stop-down ramps.

- **Ultra-Compact Icon-Only Transport Deck (`src/ui/transport/DirectorialTransportDeck.tsx`, `docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`)**:
  - Streamlined the centered transport deck into an ultra-compact ~`290px` cockpit by removing persistent speed pills (`0.25x`–`2x`) and switching to icon-only controls across all segments.
  - Retained high-contrast distinct color styling for the hero Play/Pause button (`bg-amber-500` for active playing, `bg-btn-primary-bg` for paused) with optical triangle centering on the `▶` play glyph.
  - Converted `Loop Shot` to an icon-only `[ ⇄ ]` toggle with luminous emerald styling when active, and maintained subtle vertical dividers between timecode, core transport, and directorial modifiers.

- **Adaptive Centering & Zero-Reflow Number Strip for Shot Chips (`src/ui/transport/DirectorialShotChipsStrip.tsx`, `docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`)**:
  - Implemented dynamic adaptive centering: when all shot chips fit within the viewport (e.g. 5–15 shots or wide displays), the entire row automatically centers (`justify-center`) directly above the centered transport deck, while navigation chevrons and edge fade masks are cleanly hidden.
  - When shots overflow (e.g. 25+ shots or narrower viewports), navigation chevrons and edge fade masks appear dynamically, and active cuts automatically smooth-scroll into the center on cut boundaries.
  - Converted all shot chips into uniform-width numbered pills (`#01`, `#02`, `#03`... ~`38px` wide) using pure CSS color transitions (`transition-colors`), completely eliminating browser DOM layout thrashing and reflow during camera cuts.
  - Eliminated redundant timestamps (`0.0s`) and titles from the bottom strip to maximize information density (25–30 shots visible at once), while preserving full shot titles and time spans in native hover tooltips.

- **High-Contrast Razor Edit Cut Dividers on Timeline Scrubber (`src/ui/transport/DirectorialTimelineTrack.tsx`, `docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`)**:
  - Implemented 1.5px vertical razor cut dividers placed at each shot boundary, rendered on top of both the background track and active gradient progress fill (`z-2`).
  - Added dual-state high-contrast styling: crisp illuminated white lines with drop shadows (`bg-white/90`) across the active colored progress bar and distinct muted borders (`bg-text-faint/70`) across unplayed sections, ensuring shot divisions and pacing are clearly visible at all times.

- **Dynamic Active Shot Looping (`src/hooks/useStageFrameLoop.ts`, `src/ui/InteractiveStudioApp.tsx`, `docs/*`)**:
  - Converted `Loop Shot` playback mode from static single-shot lock to a contextual dynamic active-shot loop that automatically tracks whichever shot is under the playhead.
  - Clicking any shot chip or scrubbing to a different cut smoothly transitions the rehearsal loop to the newly selected shot with zero trapping or snap-back race conditions.
  - Synchronized `mediaClock.lastManualSeekIdRef` with `useStageFrameLoop` to cleanly distinguish between forward playback loop triggers and manual directorial jumps across cut boundaries.

- **Segmented Centered Transport Deck & Streamlined Playback Controls (`src/ui/transport/DirectorialTransportDeck.tsx`, `docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`)**:
  - Restructured the centered transport deck into a 3-segment hierarchy: precision timecode on the left, core transport (`[ ↻ ]` and hero `[ ▶ Play / ❚❚ Pause ]`) dead-center, and directorial modifiers (`Loop Shot`, `Mute`, speed pills) on the right separated by subtle vertical dividers.
  - Omitted visual single-frame step buttons (`< [` and `] >`) from the UI chrome to eliminate clutter, while preserving global keyboard hotkeys (`[` and `]`) in `useMediaClock.ts`.

- **Auto-Pause on Scrubber Interaction & Cross-Browser Scrollbar Hiding (`src/ui/transport/*`, `src/ui/DirectorialTransportBar.tsx`, `src/ui/InteractiveStudioApp.tsx`, `src/index.css`, `docs/*`)**:
  - Implemented auto-pause on scrubber grab and scrub drag (`onPointerDown` and `onChange` on the timeline range slider), pausing active playback upon initial touch/click so the user can inspect intermediate frames without the playhead running away.
  - Added `.no-scrollbar` cross-browser utility in `src/index.css` paired with explicit `scrollbarWidth: 'none'` and `msOverflowStyle: 'none'` styles on `DirectorialShotChipsStrip.tsx`, permanently eliminating native browser scrollbar tracks on Windows Chromium/WebKit/Firefox.

- **Directorial Playback Interface Redesign & Submodule Decomposition (`src/ui/transport/*`, `src/ui/DirectorialTransportBar.tsx`, `docs/*`)**:
  - Reorganized the bottom transport row into a **Unified Centered Island** (`DirectorialTransportDeck.tsx`), grouping Play/Pause, Frame Steps, Timecode, Loop Toggle, Audio Mute, and Playback Speed (`0.25x`–`2x`) into a cohesive cockpit with open left and right flanks.
  - Implemented an **Auto-Centering Shot Chips Strip with Navigation Chevrons** (`DirectorialShotChipsStrip.tsx`) featuring flanking `<` and `>` buttons for smooth peek scrolling, automatic active chip centering upon camera cuts (`scrollIntoView`), hidden intrusive scrollbar tracks, and bilateral gradient edge fades.
  - Added a **Floating Hover Preview Tooltip & Razor Hairline** (`DirectorialTimelineTrack.tsx`) displaying the exact timestamp, shot number, and shot label on mouse hover before clicking.
  - Added a **Luminous Emerald Loop Region Indicator** with glowing fill and crisp `[` and `]` boundary brackets along the timeline bar when `Loop Shot` is active.
  - Decomposed `DirectorialTransportBar.tsx` into 3 submodules in `src/ui/transport/` (`DirectorialTimelineTrack`, `DirectorialShotChipsStrip`, `DirectorialTransportDeck`), maintaining the strict $\le 250$ line modularity constraint.

- **Diorama 2D UI Elevation: Top-Center Mode Switcher, Camera Presets & Streamlined Chrome (`src/ui/`, `src/stage/`, `src/App.tsx`)**:
  - **Top-Center Floating Camera Mode Switcher (`CameraModeSwitcher.tsx`)**: Extracted the 3-way camera POV toggle (`Scripted Observer`, `Free Orbit`, `Stage Cam POV`) from the bottom transport deck into an elevated, centered tactile segmented pill at `top-3 left-1/2 -translate-x-1/2`, establishing a dedicated viewfinder mode header while decluttering the transport bar.
  - **Directorial Camera Presets (`CameraPresetControls.tsx`, `cameraPresets.ts`, `ObserverCameraRig.tsx`)**: Added a 1-click angle snaps cluster in the top-right overlay (`Top/Plan 84°`, `Iso 45°`, `Front 12°`, `Side 90°`, `Reset`) that instantly snaps camera perspective and switches to Free Orbit without pausing playback.
  - **Shot Breakdown HUD `#xx` Formatting, Strict 2-Line Collapse & Title De-duplication (`ShotBreakdownHud.tsx`, `DirectorialTransportBar.tsx`)**: Formatted active shot tags universally as `#xx` (`#01`, `#02`, ... `#17`), stripped redundant `"Shot ## · "` prefixes, restructured the collapsed view into strictly 2 lines (`Line 1: [#xx] Title >` + `Line 2: 50mm · DOLLY · Δ 0.36m · Free Orbit`) with single-line truncation and card-wide click-to-expand affordance, provided a dedicated full-width title row in expanded view, and aligned timeline cut chips in `DirectorialTransportBar.tsx` to `#xx` with un-prefixed labels.
  - **Contextual Viewfinder Guides Toggle (`LabelDisplayModeToggle.tsx`)**: Conditioned the `Guides` toggle to appear strictly when in `Stage Cam POV` (`cameraMode === 'stage-pov'`), keeping the 3D Observer view chrome uncluttered.
  - **Camera Telemetry Capsule Micro-Labels (`CameraTelemetryCapsule.tsx`)**: Added inline muted monospace prefixes (`P 26.0° · Y 35.0° · [R -5.0°] · D 7.50m · TGT [0.0, 1.1, 0.0] · 50mm`) for instantaneous glanceability without hovering.
  - **Streamlined Transport Deck (`DirectorialTransportBar.tsx`)**: Dedicated the bottom deck 100% to timeline scrubbing, frame-stepping, looping, timecode, and slow-motion playback speed.

#### 3D Diorama Stage, Mannequins & Optical Kinematics

- **Pure 3D Billboard Label LOD & Visual Hierarchy Math (`src/stage/labelLodMath.ts`, `tests/unit/billboardLabelLod.test.ts`)**:
  - Extracted pure math functions and thresholds for distance-based semantic collapse (`computeBillboardLodMetrics`), kind-based opacity hierarchy (`getBillboardBaseOpacity`), and calibrated z-index sorting (`getBillboardZIndexRange`).
  - Added dedicated Vitest unit test suite (`tests/unit/billboardLabelLod.test.ts`) asserting 100% test coverage across proximity culling ($< 1.2\text{m}$), entity collapse ($24\text{m}$–$28\text{m}$), Stage Camera persistence ($52\text{m}$–$60\text{m}$), opacity order, and z-index boundary invariants.

- **Diorama 3D Billboard Label Semantic Dot Collapse & Zero-Re-Render 60fps Loop (`src/stage/StageBillboardLabel.tsx`, `docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`)**:
  - Eliminated `useState` inside `useFrame` in compliance with Invariant 7 (Dual-Tier 60fps Render Engine: 0 React re-renders in Tier 1), driving proximity culling, perspective scaling, and dot collapse imperatively via DOM refs (`pillRef` and `dotRef`) in `useLayoutEffect` and `useFrame`.
  - Implemented dual-element DOM structure: full pill identity badge at standard distances smoothly cross-fades into a minimal $8\text{px}$–$10\text{px}$ glowing accent dot at distances $\ge 28\text{m}$, permanently eliminating the center-stage cluster blob during high crane pullbacks ($D = 46\text{m}$) and zenith holds ($D = 98\text{m}$).
  - Kept Stage Camera telemetry badge readable up to $52\text{m}$ (cross-fading between $52\text{m}$ and $60\text{m}$) as the master directorial tool.
  - Calibrated 3D `<Html>` depth sorting to a strict 5-tier band within `zIndexRange={[8, 0]}` (`camera [8, 7]` > `highlighted [6, 5]` > `character [4, 3]` > `prop [2, 1]` > `marker [1, 0]`), guaranteeing 3D labels never overlap 2D viewport HUDs (`z-10`).

- **Entity Kind Opacity Hierarchy & Context Passthrough (`src/stage/DirectionalMannequin.tsx`, `docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`)**:
  - Wired `def.kind` (`'character' | 'prop' | 'marker'`) to `<StageBillboardLabel>`, establishing a 4-tier opacity hierarchy: Camera ($100\%$) $\ge$ Active Focus ($100\%$ paused, $60\%$ playing) $>$ Characters ($85\%$ paused, $25\%$ playing) $>$ Props ($55\%$ paused, $15\%$ playing) $>$ Markers ($35\%$ paused, $10\%$ playing), subduing static stage markers and props while keeping actors prominent with zero YAML changes.

- **Elevated Stage Camera Badge & Blueprint Leader Stem (`src/stage/StageCameraRig.tsx`, `docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`)**:
  - Elevated the camera badge from `Y = +0.36m` to `Y = +0.72m` and anchored it with a subtle dashed vertical blueprint leader line (`<Line>` from $Y = 0.12\text{m}$ to $0.58\text{m}$), preventing over-the-shoulder (OTS) camera badges from colliding with or occluding actor head badges.
  - Streamlined the 3D telemetry label format to `CAM · [lens]mm · [MANEUVER]` (e.g. `CAM · 50mm · DOLLY`), removing redundant `STAGE` and aperture substrings from the 3D diorama badge (preserved in the 2D top-left HUD), cutting badge width by over $33\%$ for clean, distraction-free spatial blocking.

- **Spacious Observer Camera Diorama Distances (+8m) (`src/scores/blueprints/*.yaml`, `tests/unit/frameEngine.test.ts`, `tests/unit/cameraRigs.test.ts`)**:
  - Increased baseline and dynamic observer camera distances by $+8\text{m}$ across all 7 factory blueprints (BP 01–07), providing authentic architectural diorama perspective.
  - Eliminated viewport boundary clipping on the stage floor grid perimeter, cardinal labels (`+Z Downstage`, `-Z Upstage`), and Stage Camera frustum / track trajectories.
  - Synchronized per-shot observer camera overrides in Blueprint 07 (Shots 01 and 02 updated from $8.5\text{m}$ to $16.5\text{m}$, aligning with root baseline and Shots 03–04).
  - Updated frameEngine and cameraRigs unit tests to assert the $+8\text{m}$ diorama distance parameters across Blueprints 03, 04, and 07.

- **Continuous Mode Kinematic Harmonization & Shot-Level Overrides (`src/core/types.ts`, `src/core/cameraTargetResolver.ts`, `src/core/shotPoseEvaluator.ts`, `src/core/scoreParser.ts`, `src/core/trajectoryChain.ts`, `tests/unit/*`, `docs/*`)**:
  - Harmonized physical camera rig continuity under `continuous: true` (or shot-level `continuous: true`): Dutch angle (`roll`) and framing offset (`target_offset`) now glide and persist seamlessly across shot boundaries without snapping to neutral baselines ($0^\circ$ and $[0, 0, 0]$), preventing kinematic boundary twitching during single-take oners.
  - Implemented shot-level `continuous?: boolean` in `ShotCue` and `scoreParser.ts`, enabling hybrid scene authoring (e.g. traditional cuts followed by a multi-beat continuous oner) where individual shots can declare `continuous: true` to auto-chain timestamps and glide from the previous shot's terminal pose, or `continuous: false` to override root continuous mode and force an independent cut setup.
  - Updated `resolveShotStartRoll()`, `resolveShotDestRoll()`, `resolveShotStartOffset()`, and `resolveShotDestOffset()` in [`src/core/cameraTargetResolver.ts`](src/core/cameraTargetResolver.ts) to accept `isContinuous: boolean` (defaulting to `false`), preserving strict Option A neutral resets for standard editorial cuts while enabling unbroken physical glides during continuous takes.
  - Fixed fallback base target resolution in [`src/core/trajectoryChain.ts`](src/core/trajectoryChain.ts) by stripping `prevEndOffset` / `startOffset` before applying the active shot's `startOffset`, preventing `target_offset` double-accumulation when `target:` is omitted on consecutive shots.
  - Added comprehensive unit test coverage in [`tests/unit/scoreParser.test.ts`](tests/unit/scoreParser.test.ts) (shot-level parsing and precedence) and [`tests/unit/frameEngine.test.ts`](tests/unit/frameEngine.test.ts) (continuous roll preservation, continuous offset gliding, and hybrid cut/oner sequence evaluations).
  - Synchronized specifications across [`docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md`](docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md), [`docs/STAGEFLOW_SCRIPT_SPECIFICATION.md`](docs/STAGEFLOW_SCRIPT_SPECIFICATION.md), and [`docs/YAML_AUTHORING_GUIDE.md`](docs/YAML_AUTHORING_GUIDE.md).

- **Entity Kind Aliases, Baseline Stage Preset Targets & Recoil Default Breathe (`src/core/scorePrimitives.ts`, `src/core/cameraCueParser.ts`, `tests/unit/*`)**:
  - Updated `normalizeEntityKind()` in [`src/core/scorePrimitives.ts`](src/core/scorePrimitives.ts) to normalize intuitive entity kind aliases: `"actor"` / `"person"` to `"character"`, `"set"` / `"furniture"` / `"item"` / `"object"` to `"prop"`, and `"spike"` / `"mark"` to `"marker"`.
  - Updated `resolveStageCamEntityTarget()` in [`src/core/cameraCueParser.ts`](src/core/cameraCueParser.ts) to resolve stage preset targets (`"center"`, `"origin"`, `"stage"` -> `[0, 1.0, 0]` plus optional `target_offset`) inside baseline `stage.stage_camera` and `stage.observer_camera` blocks, matching shot-level `resolveTargetPoint3D()`.
  - Updated `parseCameraCueSpec()` in [`src/core/cameraCueParser.ts`](src/core/cameraCueParser.ts) so `maneuver: "recoil"` defaults `breathe` to `1.25` (matching `evaluateManeuverPose()` in `src/core/maneuvers.ts`), ensuring `recoil` produces its shockwave impulse kick out of the box when `breathe:` is omitted.
  - Added unit test assertions in [`tests/unit/scoreParser.test.ts`](tests/unit/scoreParser.test.ts) and [`tests/unit/guideSnippets.test.ts`](tests/unit/guideSnippets.test.ts) verifying all entity kind aliases, recoil default breathe, and baseline stage preset target resolution.

- **Slim Minimalist Character Shoulder Crossbar ([`src/stage/DirectionalMannequin.tsx`](src/stage/DirectionalMannequin.tsx))**:
  - Refined character proxy shoulder crossbar dimensions from broad boxy geometry (`[radius * 2.1, 0.12, radius * 0.95]`) to sleek minimalist proportions (`[radius * 1.4, 0.08, radius * 0.55]`) centered at `y = height - 0.40m`, reducing visual clutter and preventing geometric overlap in tight multi-actor dialogue staging.

- **Extended Observer Zoom Out & Recalibrated Blueprint Depth Fog (`src/core/constants.ts`, `src/stage/*`, `tests/unit/*`, `docs/*`)**:
  - Increased `CAMERA_LIMITS.MAX_DISTANCE_M` from `40.0m` to `100.0m` in `src/core/constants.ts` to support long-lens telephoto coverage across large outdoor stages, sports fields, and master views.
  - Increased `OrbitControls.maxDistance` from `38m` to `100m` in [`src/stage/ObserverCameraRig.tsx`](src/stage/ObserverCameraRig.tsx), eliminating the artificial zoom wall and enabling full pull-back overview behind distant Stage Camera positions.
  - Recalibrated 3D diorama scene depth fog from `[16m, 42m]` to `[45m, 160m]` and expanded camera clipping far plane from `150m` to `250m` across [`src/stage/DioramaCanvas.tsx`](src/stage/DioramaCanvas.tsx) and [`src/stage/StageCamMonitorCanvas.tsx`](src/stage/StageCamMonitorCanvas.tsx), guaranteeing 100% crisp visuals across working stage setups without blacking out when pulling back to 100m.
  - Added unit test coverage in [`tests/unit/sphericalMath.test.ts`](tests/unit/sphericalMath.test.ts) verifying distance boundary clamping up to `MAX_DISTANCE_M` (100.0m).
  - Synchronized architectural specifications and schema limits in [`docs/YAML_AUTHORING_GUIDE.md`](docs/YAML_AUTHORING_GUIDE.md), [`docs/STAGEFLOW_SCRIPT_SPECIFICATION.md`](docs/STAGEFLOW_SCRIPT_SPECIFICATION.md), [`docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`](docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md), and [`docs/VISUAL_DESIGN_SYSTEM.md`](docs/VISUAL_DESIGN_SYSTEM.md).

- **Default Character Look-At Anchor to Eye Level & Mannequin Alignment (`src/core/constants.ts`, `src/stage/DirectionalMannequin.tsx`, `tests/unit/*`, `docs/*`)**:
  - Updated `ENTITY_DEFAULTS.CHARACTER_LOOK_ANCHOR_RATIO` from `0.78` (~$1.365\text{m}$) to `0.90` (~$1.575\text{m}$ for a standard $1.75\text{m}$ character) so that targeting a character (`target: "<actor>"`) centers optical lines-of-sight and crosshairs on eye level rather than the shoulder cross-bar.
  - Aligned [`src/stage/DirectionalMannequin.tsx`](src/stage/DirectionalMannequin.tsx) head and eye visor positioning with `ENTITY_DEFAULTS.CHARACTER_LOOK_ANCHOR_RATIO` to ensure 100% mathematical parity between character gaze, mannequin head sphere, and camera target anchors.
  - Updated unit test assertions in [`tests/unit/frameEngine.test.ts`](tests/unit/frameEngine.test.ts) and [`tests/unit/scoreParser.test.ts`](tests/unit/scoreParser.test.ts).
  - Synchronized architectural specifications in [`docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md`](docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md), [`docs/STAGEFLOW_SCRIPT_SPECIFICATION.md`](docs/STAGEFLOW_SCRIPT_SPECIFICATION.md), and [`docs/YAML_AUTHORING_GUIDE.md`](docs/YAML_AUTHORING_GUIDE.md).

- **3D Diorama Viewing Experience Overhaul (Clamped Perspective Scaling, 3-Tier Playback Hierarchy & Clean Viewfinder)**:
  - Implemented 60fps **Clamped Perspective Scaling** on `StageBillboardLabel.tsx` ($1.65\times$ near to $0.80\times$ far, anchored at $12\text{m}$ reference distance), mutating transforms imperatively in `useFrame` directly on the inner DOM element style with zero React re-renders. Badges remain bold, confident, and clearly legible across near ($1.98\text{m}$), mid ($9.21\text{m}$), and far ($34.94\text{m}$) viewing distances while being hard-clamped at $1.65\times$ to prevent close-up ballooning.
  - Implemented **Directorial 3-Tier Playback Hierarchy**: during playback, active focus actors (`highlighted: true`) remain visible at **`55%` opacity** with a character-tinted border (`borderColor: ${accentColor}99`), luminous halo glow, and bright glowing accent dot, maintaining a clear $2.75\times$ visual contrast over passive background actors (`20%` opacity) without competing with the Stage Camera (`100%` opacity). When paused, active focus subjects restore to full `100%` brightness.
  - Upgraded typography to prominent HUD-grade styling (`text-sm font-mono font-semibold`, `px-3.5 py-1.5`, `w-2.5 h-2.5` glowing indicator), resolving microscopic text across all camera angles.
  - Implemented true world-space proximity culling via `groupRef.current.getWorldPosition()` in `StageBillboardLabel.tsx`: when an actor or prop is within $1.2\text{m}$ of the camera lens, their badge smoothly fades out (`opacity: 0`), preventing close foreground entities from obstructing background staging.
  - Replaced DOM `<Html>` floor markers with native WebGL SDF meshes (`Text` from `@react-three/drei`) in `BlueprintFloorGrid.tsx` lying flat on the perimeter plane ($Y = 0.005\text{m}$, rotation $-90^\circ$ around $X$), participating 100% in the WebGL Z-buffer so 3D camera cone/frustum lines, focus plane frames, and actors naturally render in front of the floor markings.
  - Automatically unmounted floor compass markers and floating 3D mannequin badges in `Stage Cam POV` (`cameraMode === 'stage-pov'`) across `BlueprintFloorGrid.tsx`, `DirectionalMannequin.tsx`, `DioramaCanvas.tsx`, and `StageCamMonitorCanvas.tsx`, delivering a pristine optical director's viewfinder focused on cinematic composition and actor silhouettes.

- **3D Label Cleanup & Viewport Visibility Control**:
  - Redesigned `StageBillboardLabel` (`src/stage/StageBillboardLabel.tsx`) into an ultra-compact, borderless micro-pill (`rounded-full bg-slate-950/70 backdrop-blur-sm px-2 py-0.5 text-[9px] font-mono`), eliminating bulky dark boxes, borders, and heavy drop shadows.
  - Implemented **Selective Playback Ghosting**: actor and prop mannequin labels smoothly fade down to 20% opacity (`opacity-20 transition-opacity duration-200`) during active playback (`isPlaying === true`) so blocking motion and character trajectories take center stage; the Stage Camera label (`STAGE CAM · 50mm · ARC`) remains at 100% opacity for continuous optical telemetry legibility.
  - Added subtle active focus accent glow on the mannequin's colored identity dot (`boxShadow: 0 0 6px <color>`) when highlighted as the active camera target, while passive actors stay soft and muted without redundant text banners.
  - Created `LabelDisplayModeToggle` (`src/ui/LabelDisplayModeToggle.tsx`), a floating glassmorphic toggle in the top-right of the 3D diorama canvas supporting 3 modes: `'all'` (Actors + Camera), `'camera-only'` (Camera only), and `'off'` (hides all labels including floor cardinal orientation tags for an unobstructed geometric stage).
  - Added global hotkey **`L`** listener to cycle through label visibility modes (`all` -> `camera-only` -> `off` -> `all`), ignoring keypresses when typing in inputs/textareas.
  - Extended `localStorageUi.ts` with `loadStoredLabelMode` and `saveStoredLabelMode` (`stageflow:ui:label-mode`), persisting the user's label visibility preference across page reloads.
  - Updated `BlueprintFloorGrid.tsx` with `showLabels` toggle and borderless micro-pill styling for the cardinal downstage/upstage markers.
  - Added unit test coverage in `tests/unit/storage.test.ts` verifying label mode persistence and fallback.

#### Living Documentation, Governance & Catalog

- **Architecture File Map Synchronization (`docs/ARCHITECTURE_FILE_MAP.md`)**:
  - Added missing Layer 5 UI components and barrel exports (`CameraModeSwitcher.tsx`, `CameraPresetControls.tsx`, `src/ui/editor/index.ts`, `src/ui/guide/index.ts`) to achieve 100% complete file tree coverage across the repository.

- **Domain Specifications & Score Catalog Accuracy Audit (`docs/SCORE_CATALOG.md`, `docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`, `docs/MEDIA_CLOCK_AND_SYNC_SPECIFICATIONS.md`, `docs/STAGEFLOW_SCRIPT_SPECIFICATION.md`, `docs/VISUAL_DESIGN_SYSTEM.md`, `docs/YAML_AUTHORING_GUIDE.md`)**:
  - `docs/SCORE_CATALOG.md`: Synchronized exact YAML durations (`blueprint-02` = `26.0s`, `blueprint-03` = `16.0s`), aspect ratio (`blueprint-07` = `2.39:1`), stage dimensions, observer move/blocking cue counts, character rosters (*Vector Field*: Ruby & Evan; *The Expansion*: Frank & Dave; *Afraid*: Sarah & Robbie), and optical lens packages against `src/scores/**/*.yaml`.
  - `docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`: Corrected factory blueprint range reference from `01–05` to `01–07` (including Scene Studies), synchronized `StageCameraDofBrackets` near/far depth formulas (`MAX_VISUAL_FAR_EXTENSION_M = 6.0m`), documented `[ SPEC ]` + `[ Guide ]` buttons in `YamlEditorHeader.tsx`, clarified `StorageStatusBadge.tsx` usage, and synchronized diorama theme palette function name to `getDioramaThemeColors(effectiveCategory)`.
  - `docs/MEDIA_CLOCK_AND_SYNC_SPECIFICATIONS.md`: Aligned YouTube anti-reversion latch tolerance to calibrated `$1.5\text{s}$` threshold matching `src/media/youtubeMediaDriver.ts`, added Toggle Optical DoF Blur (`B`), Restart (`[ ↻ ]`), and Audio Mute (`[ 🔊 ]`) controls to the Section 4 table, and marked Frame Step (`[` / `]`) as keyboard-only and Playback Speed as Driver API to match `DirectorialTransportDeck.tsx`.
  - `docs/STAGEFLOW_SCRIPT_SPECIFICATION.md`: Corrected Circle of Confusion max blur circle fraction equation from `0.035` to `0.022` matching `OPTICS_DOF_DEFAULTS.MAX_BLUR_FRACTION` in `src/core/constants.ts`, distinguished parse-time minimum duration clamps between camera shots (`0.1s`) and standalone `blocking` cues (`0.016s`), and added `showRigs?: boolean` to the `StageScore.stage` AST contract table.
  - `docs/YAML_AUTHORING_GUIDE.md`: Removed unimplemented `camera_rig`/`mount` aliases from `rig:` in §4.1, documented inner `rig:` type/field aliases (`kind`/`mode`, `pos`/`at`/`eye`, `start`/`end`, `waypoints`) and uniform segment-index Catmull-Rom parameterization for `spline_track` in §4.9.1, and added parser-supported aliases across root `optics` (`dofBlur`, `blur`, flat root fallbacks), `video.src` (`url`), `stage.show_rigs` (`showRigs`), `rotation` (`yaw`), `highlighted` (`highlight`), `aperture` (`t_stop`, `dof_start`/`dof_end`), and `shots[].stage_camera` (`camera`, flat shot-root optical/rig overrides).
  - `docs/VISUAL_DESIGN_SYSTEM.md`: Synchronized CSS custom properties and `[data-pure-black-shell="true"]` values with `src/index.css`, aligned `UI_TOKENS` namespaces (`layout`, `modal`, `dropdown`, `button`, `input`) with `src/ui/tokens/ui.ts`, synchronized WebGL dynamic palette table hex colors with `src/stage/dioramaTheme.ts` (`getDioramaThemeColors`), and updated blueprint catalog badge range to `BP 01–BP 07`.

- **Tiered Verification, Scoped Spec Gates & Reactive Wakeup Discipline (`AGENTS.md`, `package.json`)**:
  - Added `"typecheck": "tsc -b"` to `package.json` for fast (< 6s) typecheck verification during rapid iteration.
  - Calibrated Section 5 of `AGENTS.md` into Tier 1 (Fast Dev Loop: `lint` + `typecheck`) for cosmetic/localized UI edits and Tier 2 (Core Engine: `test` + full `build` + `lint`) for architectural and mathematical changes.
  - Scoped Section 3's pre-flight domain specification lookup gate to exempt localized cosmetic styling and single-component CSS classes from mandatory 350-line spec reads.
  - Added Section 2.7 establishing strict reactive wakeup discipline against background task polling loops.

- **Concise Blueprint Titles & Descriptive Subtitles (`src/scores/blueprints/*.yaml`, `docs/YAML_AUTHORING_GUIDE.md`, `tests/unit/frameEngine.test.ts`)**:
  - Stripped redundant `Blueprint XX:` and `BP XX ·` title prefixes across factory Blueprints 01 through 07, resolving card list text truncation (`...`) alongside the dedicated cyan `[BP 01]`–`[BP 07]` badges.
  - Updated all 7 blueprint titles to be short, punchy, and descriptive: `Two-Shot Arc Blocking` (BP 01), `Cinematic Dialogue Flow` (BP 02), `The Long-Distance Pass` (BP 03), `Cinematography & Framing` (BP 04), `Two Rooms: Threshold Crossing` (BP 05), `Optics, Rack Focus & DoF` (BP 06), and `Camera Rigs & Dolly Tracks` (BP 07).
  - Enriched each blueprint's `subtitle` with detailed technical staging notes (shot counts, optical techniques, aspect ratios, and kinematics).
  - Synchronized living documentation in `docs/YAML_AUTHORING_GUIDE.md` and test suite descriptions.

- **Script Specification & YAML Authoring Guide Zero-Overlap SSOT Alignment (`docs/STAGEFLOW_SCRIPT_SPECIFICATION.md`, `docs/YAML_AUTHORING_GUIDE.md`, `docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md`, `src/ui/guide/guideUtils.ts`, `AGENTS.md`, `README.md`)**:
  - Established a strict, non-overlapping division of labor between [`docs/STAGEFLOW_SCRIPT_SPECIFICATION.md`](docs/STAGEFLOW_SCRIPT_SPECIFICATION.md) (`?mode=spec`, formal mathematical model, closed-form piecewise easing/maneuver equations, 7-step orbit priority, sphere prop diameter height rule, and normalized AST contract) and [`docs/YAML_AUTHORING_GUIDE.md`](docs/YAML_AUTHORING_GUIDE.md) (`?mode=guide`, declarative YAML schema, accepted aliases, directorial velocity profiles, FOV lookup tables, and 8 production recipes).
  - Replaced the redundant 179-line annotated YAML template in Section 7 of `docs/STAGEFLOW_SCRIPT_SPECIFICATION.md` with the **Normalized AST Data Model & Clamping Contract** synchronized 1:1 with `src/core/constants.ts` and `src/core/types.ts`, and updated `GUIDE_DOC_SHORTCUTS.spec[6]` label in [`src/ui/guide/guideUtils.ts`](src/ui/guide/guideUtils.ts) from `"Schema"` to `"Contract"`.
  - Streamlined `docs/YAML_AUTHORING_GUIDE.md` Sections 1.2, 4.3, 4.4, and 4.6 to focus on directorial feel, accepted aliases, and lookup tables while cross-linking to `docs/STAGEFLOW_SCRIPT_SPECIFICATION.md` for formal KaTeX derivations.
  - Synchronized all baseline camera pose snippets across documentation to `DEFAULT_OBSERVER_POSE` (`[0, 1.0, 0]`, `7.5m`, `26°`, `38°`, `35mm`) and `DEFAULT_STAGE_CAMERA_POSE` (`[0, 1.2, 0]`, `3.2m`, `6°`, `-25°`, `50mm`).

- **TOC-Targeted Topic Search & Segmented Switcher Polish (`src/ui/guide/ScoreAuthoringGuideView.tsx`, `docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`)**:
  - Removed legacy markdown line-grep text shredder (`displayedContent`) that previously replaced the reading canvas with fragmented line snippets during search.
  - Search input now directly filters the Table of Contents topic outline on the left sidebar in real time while keeping the central reading canvas 100% complete, intact, and readable.
  - Eliminated unnecessary search debouncing and full markdown AST / KaTeX re-compilations, enabling native 60fps typing without frame drops or re-renders.
  - Selecting any topic in the filtered Table of Contents navigates directly to the target anchor without clearing or modifying the document.
  - Fixed border flickering on the SPEC / Guide segmented switcher by aligning with `UI_TOKENS.button` (removing inner active borders and using `transition-colors`), eliminating subpixel border animation jumps during tab switching.

- **In-App Guide & Specification Cross-Document Tab Navigation and Clean Markdown Links (`docs/STAGEFLOW_SCRIPT_SPECIFICATION.md`, `docs/YAML_AUTHORING_GUIDE.md`, `src/ui/guide/guideMarkdownComponents.tsx`, `src/ui/guide/ScoreAuthoringGuideView.tsx`)**:
  - Replaced relative filesystem markdown links (`./STAGEFLOW_SCRIPT_SPECIFICATION.md#...` and `./YAML_AUTHORING_GUIDE.md`) with tab-aware in-app query routes (`?mode=spec#section-X` and `?mode=guide#section-X`).
  - Added tab-switching link interception in `guideMarkdownComponents.tsx` via `onSwitchDoc`, enabling smooth tab transitions between the authoring guide and mathematical specification with auto-scroll to section anchors without triggering full-page browser reloads or 404 errors.
  - Converted internal source code and blueprint filesystem hyperlinks (`../src/core/...` and `../src/scores/blueprints/...`) into clean backtick code spans (e.g., `` `src/core/types.ts` ``, `` `blueprint_02_dialogue.yaml` in Score Library ``), preventing dead links for end-users while maintaining crystal-clear paths for AI agents and developers.

- **Domain Specification Suite Audit & Synchronization (`docs/*`)**:
  - [`docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md`](docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md): Documented canonical `CAMERA_LIMITS` ($d \in [0.4, 100.0]\text{m}$, $\theta \in [-85^\circ, +85^\circ]$, $f_{\text{mm}} \in [12, 200]\text{mm}$), modular entity engine submodules (`entityEngine.ts`, `entityBlockingEvaluator.ts`, `entityLegacyEvaluator.ts`, `entityKinematicUtils.ts`), character eye-level look-at anchor ratio ($0.90$), 3-tier score provenance taxonomy (`ScoreCategory = 'study' | 'blueprint' | 'custom'`), `scoreYamlUtils.ts` pure Layer 1 operations, and structured parser diagnostics (`ScoreDiagnostic[]`).
  - [`docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`](docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md): Fixed duplicate subsection numbering across Section 2 (2.1 to 2.5) and Section 4 (4.1 to 4.14), eliminated duplicate Directorial HUD overlay descriptions, updated header right-wing controls (`ThemeSelectorDropdown`, `Library`, `Reset Layout`), documented Score Library 4-way filter tabs and 3 collapsible sections, and added Section 4.14 for Vercel Web Analytics & Speed Insights integration.
  - [`docs/MEDIA_CLOCK_AND_SYNC_SPECIFICATIONS.md`](docs/MEDIA_CLOCK_AND_SYNC_SPECIFICATIONS.md): Updated sequence diagram and text with `entityCueChanged` 60fps frame loop trigger, live free-orbit sync (`notifyFreeOrbitChange` with 80ms drag throttle, 85ms trailing flush timer, and immediate preset sync), and global studio shortcuts (`L` for labels, `G` for safe guides) with input element protection.
  - [`docs/VISUAL_DESIGN_SYSTEM.md`](docs/VISUAL_DESIGN_SYSTEM.md): Synchronized Section 7.1 with the 3-tier category color coding (Violet for Studies, Sky Blue for Blueprints, Warm Amber for Custom Projects), 4-way filter tabs (`All`, `Studies`, `Blueprints`, `Custom`), and 3 collapsible master list sections.
  - [`docs/STAGEFLOW_SCRIPT_SPECIFICATION.md`](docs/STAGEFLOW_SCRIPT_SPECIFICATION.md): Added `ScoreCategory`, `ScoreDiagnostic`, and `ParseScoreResult` to the Section 7.2 Normalized AST contract table, and noted entity kind aliases and presentation styles in Section 4.
  - [`docs/YAML_AUTHORING_GUIDE.md`](docs/YAML_AUTHORING_GUIDE.md): Updated Section 2.5 with the 3-Tier Taxonomy and highlighted *Vector Field* (`src/scores/studies/vector_field.yaml`) as the primary default scene study authored by Taruma Sakti alongside Blueprints 01–05.

- **README Modernization & Specification Consolidation (`README.md`, `AGENTS.md`)**:
  - Refreshed Key Capabilities in [`README.md`](README.md) to showcase the 3-column resizable studio workspace (30/40/30), CodeMirror 6 YAML Studio with Lezer syntax highlighting and 1-click diagnostic jumping, 4-corner diorama HUD with isometric 3D ViewCube SVG camera presets, 3-tier score provenance taxonomy (`study`, `blueprint`, `custom`) featuring *Vector Field*, and standalone in-app documentation & specification viewer (`?mode=guide` / `?mode=spec`).
  - Updated [`AGENTS.md`](AGENTS.md) and [`README.md`](README.md) to remove references to the retired root `SPECIFICATION.md`.

- **Choreography Score Authoring Manual Restructure (`docs/YAML_AUTHORING_GUIDE.md`, `src/ui/guide/guideUtils.ts`, `tests/unit/guideUtils.test.ts`)**:
  - Restructured the entire YAML Score Authoring Manual into an authoritative developer-to-developer Single Source of Truth (SSOT) focused 100% exclusively on declarative YAML score authoring across 7 chapters:
    - Chapter 1: Introduction & Spatial Architecture ($Y$-Up metric model, metric bounds, time/hold rules, root anatomical hierarchy).
    - Chapter 2: Quickstart & Minimal Score Anatomy (25-line runnable minimal score, incremental additions for camera/blocking, authoring cheatsheet, 8 common beginner mistakes).
    - Chapter 3: Scene Foundation (root metadata, video bindings with YouTube and procedural simulator, stage perimeter bounds, baseline camera presets with roll and target offsets, entity proxy definitions).
    - Chapter 4: Camera System & Optics (full-frame focal length to vertical FOV conversion table, 11 camera maneuvers, 9 easing curves, 7-step orbit priority resolution, multi-waypoint spline paths, reserved fields audit).
    - Chapter 5: Film Coverage & Multi-Shot Scoring (`shots:` timeline schema, standard vs. continuous cut mode, consolidated shot-boundary state reset matrix, prime lens mounting vs. zoom semantics).
    - Chapter 6: Decoupled Entity Blocking & Continuous Kinematics (root `blocking:` timeline schemas format A and B, two-pass evaluator, Option A continuous 16-segment movement floor trails, legacy entity kinematic overrides, `observer_shots:` 3-tier hierarchy).
    - Chapter 7: Director's Cookbook & Production Blueprints (8 production choreography recipes with architectural walkthroughs and references to bundled Blueprints BP 01–BP 05).
  - Adopted developer-to-developer technical tone for Chapters 1 and 3–6, while adopting cinematographer/director creative perspectives for Chapter 2 and Chapter 7, removing the Studio Workflow chapter to keep the manual strictly focused on YAML authoring.
  - Standardized callouts to plain markdown blockquotes with bold labels (`> **Note:**`, `> **Tip:**`, `> **Warning:**`), replacing raw GitHub-style alerts for clean rendering in both GitHub and the in-app guide.
  - Updated in-app sticky quick-jump navigation rail in [`src/ui/guide/guideUtils.ts`](src/ui/guide/guideUtils.ts) to map 1:1 to the 7 authoring chapters (`Intro`, `Quickstart`, `Foundation`, `Cameras`, `Coverage`, `Timelines`, `Cookbook`).
  - Updated [`tests/unit/guideUtils.test.ts`](tests/unit/guideUtils.test.ts) to verify heading structure, slug generation, and code fence integrity for the restructured manual.

### Fixed

#### Media Clock, Transport & Telemetry Synchronization

- **Optimistic In-Flight Seek Synchronization & Anti-Rubberbanding (`src/media/html5MediaDriver.ts`, `src/media/youtubeMediaDriver.ts`, `src/ui/DirectorialTransportBar.tsx`, `tests/unit/mediaDrivers.test.ts`, `docs/MEDIA_CLOCK_AND_SYNC_SPECIFICATIONS.md`)**:
  - Implemented optimistic seek latching in `Html5MediaDriver` to hold `pendingSeekSec` while `video.seeking === true` until the native `'seeked'` event fires (backed by a 500ms safety timeout guard), eliminating intermediate decoder latency and rubberbanding.
  - Implemented in-flight seek protection in `YouTubeMediaDriver` (`pendingSeekTarget`), filtering out stale pre-seek timestamps from YouTube's asynchronous `postMessage` polling until YouTube arrives within $1.5\text{s}$ of the target seek point (backed by a 600ms safety timeout guard), fixing the race condition where seeking a YouTube video would snap back or require clicking twice.
  - Kept `DirectorialTransportBar` directly synchronized with `frame.timestampSec`, ensuring the timeline progress fill, thumb, and timecode smoothly advance forward during continuous playback without becoming latched after seeking.
  - Added dedicated Vitest test suite (`tests/unit/mediaDrivers.test.ts`) covering HTML5, YouTube, and Procedural seek latching and timeout safety.
  - Synchronized living domain specifications in `docs/MEDIA_CLOCK_AND_SYNC_SPECIFICATIONS.md` and file map in `docs/ARCHITECTURE_FILE_MAP.md`.

- **Camera Telemetry Capsule Preset Freeze & Trailing Sync (`useStageFrameLoop.ts`, `ObserverCameraRig.tsx`)**:
  - Resolved race condition where switching camera presets dropped UI telemetry sync due to an immediate 80ms throttle check following mode changes.
  - Added `immediate = true` synchronous telemetry flush on preset trigger and an 85ms trailing timer to ensure final mouse resting positions always flush reliably to React state.
  - Fixed false target shift artifact in Top view caused by dropped telemetry sync and floor clearance clamping.

#### 3D Viewport Navigation & Overlay Collision Protection

- **Compact Diorama Header Breakpoint & Overlay Collision Protection (`src/ui/InteractiveStudioApp.tsx`, `src/ui/DioramaOverlayContainer.tsx`, `src/ui/CompactDioramaHeader.tsx`, `src/ui/CameraTelemetryCapsule.tsx`, `src/ui/ShotBreakdownHud.tsx`, `docs/*`)**:
  - Increased the narrow diorama threshold from `580px` to `768px` (`dioramaWidth < 768`), ensuring standard 3-column Studio mode (`Split` + `Edit` ON) cleanly collapses into the unified single top bar (`CompactDioramaHeader`) instead of crowding the viewport.
  - Added container-aware target vector compaction in `CameraTelemetryCapsule` (`showTargetCoords = dioramaWidth >= 880`), hiding bulky `TGT [...]` coordinates in medium-wide views ($768\text{px}$–$880\text{px}$) to prevent bottom-edge collisions between the camera mode switcher and telemetry capsule while preserving full coordinates on hover tooltip.
  - Clamped `ShotBreakdownHud` max width to `max-w-[calc(100%-320px)]` to prevent long shot labels from colliding with the top-right toolbar.
  - Expanded `CompactDioramaHeader` clean shot title truncation ceiling up to `220px` on wider tablet/desktop widths.

- **3D Drei HTML Billboard Label Stacking Context Collision (`src/stage/StageBillboardLabel.tsx`, `src/ui/tokens/ui.ts`, `src/ui/ResizableSplitWorkspace.tsx`)**:
  - Calibrated Drei `<Html>` depth sorting in [`StageBillboardLabel.tsx`](src/stage/StageBillboardLabel.tsx) from `zIndexRange={[40, 0]}` down to `zIndexRange={[5, 0]}`, ensuring 3D character/prop identity badges never occlude 2D viewport HUDs (`z-10`), bottom telemetry (`z-20`), or header dropdowns (`z-50`).
  - Added CSS `isolate` (`isolation: isolate`) on the 3D diorama stage container in [`ResizableSplitWorkspace.tsx`](src/ui/ResizableSplitWorkspace.tsx) and [`App.tsx`](src/App.tsx) to permanently prevent 3D canvas HTML DOM projections from escaping into the global stacking context.
  - Added explicit `relative z-30` positioning to `UI_TOKENS.layout.appHeader` in [`src/ui/tokens/ui.ts`](src/ui/tokens/ui.ts) to guarantee studio navigation and theme dropdowns sit unconditionally above all diorama canvases.

#### Camera Kinematics, Rigs & Trajectory Stability

- **Dolly Cart Tangent Steering & Gated Cut Protection (`src/stage/StageCameraRigMount.tsx`)**:
  - Dynamically aligned dolly cart heading (`cartGroupRef.current.rotation.y = Math.atan2(dx, dz)`) to the local track tangent along linear and Catmull-Rom spline rails, ensuring wheels roll squarely on top of the rails on lateral ($X$-axis) and curved trucking moves rather than sitting sideways.
  - Added atomic shot-desync gating (`isShotDesynced = liveFrame.stageCamera.shotId !== stageCam.shotId`) to freeze mount transforms during the 1-frame async React handover across camera cuts, eliminating transient 16ms mount twitching.
  - Streamlined 4-wheel dolly geometry generation to maintain the strict module line cap (248 lines).

- **Camera POV Mode Switch Border Glitch & Viewfinder Animation (`src/ui/CameraModeSwitcher.tsx`, `src/ui/StageCamViewfinderOverlay.tsx`, `src/ui/CameraPresetControls.tsx`)**:
  - Eliminated the split-second border expansion animation when switching between `Scripted`, `Free Orbit`, and `Stage Cam` by maintaining constant `border` geometry (`border-border-subtle` active vs. `border-transparent` inactive) and replacing broad `transition-all` with targeted `transition-colors duration-100`.
  - Added `focus:outline-none` across viewport buttons to prevent transient browser focus rings from flashing around buttons on click.
  - Removed `transition-all duration-75` on the optical film gate in [`StageCamViewfinderOverlay.tsx`](src/ui/StageCamViewfinderOverlay.tsx), restoring true 0ms instantaneous cuts when entering Stage Cam POV.

- **Referentially Stable Stage Camera Trajectory Rails & Zero-Jitter Multi-Timestamp Path Sampling (`trajectoryChain.ts`)**:
  - Resolved 10Hz visual jitter and floating rail drift on moving camera shots (e.g. tracking a moving target like the ball in Blueprint 03 or walking characters in Blueprint 04).
  - Previously, `sampleTrajectoryPoints()` was invoked on every 60fps frame passing `entitiesById` evaluated at the current playback time $t$. For moving targets, this caused the entire 3D rail and waypoint beacons to drift and translate across space frame-by-frame; combined with React's ~10Hz throttled `uiFrame` state in `StageCameraRig.tsx` (`useMemo`), the shifting rail only updated every 95ms in Three.js, causing noticeable 10Hz stepping and jitter.
  - Implemented `sampleCueTrajectoryPoints()` with pure `WeakMap<StageScore, CueTrackCache>` caching in `src/core/trajectoryChain.ts`:
    - Evaluates the camera's true 3D spatial path across the entire shot duration ($t_k \in [\text{startSec}, \text{endSec}]$) sampling target entity kinematics at each temporal step.
    - Caches cue trajectory point arrays keyed by score and cue ID so intra-shot evaluations yield referentially stable (`===`) arrays.
    - `useMemo` in `StageCameraRig.tsx` never recalculates or re-uploads geometry buffers to the GPU during an active shot, keeping the physical rail rock-solid and stationary in 3D space while the camera chassis smoothly rolls along it at 60fps.
  - Added unit test coverage in `tests/unit/frameEngine.test.ts` verifying intra-shot referential stability (`f(t1).stageCamera.trajectoryPoints === f(t2).stageCamera.trajectoryPoints`) and exact trajectory endpoint alignment with the camera's start and end transforms.

- **Hide Camera Trajectory Rail & Waypoint Beacons in Stage Cam POV (`StageCameraRig.tsx`)**:
  - Gated the 3D trajectory curve and start/end waypoint beacons on `isBodyVisible &&` (`cameraMode !== 'stage-pov'`), preventing the camera's physical track and destination octahedron beacon from floating in front of the lens and obscuring the optical viewfinder during forward dolly and pedestal maneuvers.

- **Explicit `direction: "ccw" | "cw"` Priority on Spanned Orbits (`maneuver: "orbit"` with `yaw_start` & `yaw_end`)**:
  - Resolved an evaluation order issue in `src/core/maneuvers.ts` where shots declaring both `yaw_start` and `yaw_end` executed raw linear subtraction `(yaw_end - yaw_start) * u`, inadvertently short-circuiting `directedAngleDiff` and causing `yaw_start: 175` -> `yaw_end: 0` with `direction: "ccw"` to rotate clockwise ($-175^\circ$) instead of counter-clockwise ($+185^\circ$).
  - Prioritized `hasExplicitDirection` so authored `direction: "ccw"` or `"cw"` always routes through `directedAngleDiff` regardless of whether `yaw_start` and `yaw_end` are both explicitly provided.
  - Added unit test coverage in `tests/unit/frameEngine.test.ts`.

#### Headless Viewport Video Recorder Stability

- **Headless Recorder Bridge Resilience & Watcher Isolation (`src/recorder/HeadlessRecorderView.tsx`, `scripts/record/playwrightDriver.ts`, `scripts/record/serverManager.ts`, `vite.config.ts`)**:
  - Preserved `window.__STAGEFLOW_RECORDER__` bridge reference across React render transitions rather than deleting it on effect unmount, preventing transient undefined access during Playwright frame evaluations.
  - Expanded step retry ceiling to 10 attempts ($1.5\text{s}$) with explicit readiness checks in `playwrightDriver.ts`.
  - Added Windows path separator regex (`/[/\\]recordings[/\\]/`) to Vite `server.watch.ignored` in `vite.config.ts`, ensuring continuous video chunk streaming into `recordings/` does not trigger unsolicited full-page browser reloads.
  - Piped Vite server stdout/stderr in `serverManager.ts` to surface background process errors and reloads.

- **Headless Recorder Stability, Windows Server Spawning & HMR Watcher Isolation (`HeadlessRecorderView.tsx`, `playwrightDriver.ts`, `serverManager.ts`, `vite.config.ts`)**:
  - Stabilized `stepFrame` callback identity in `src/recorder/HeadlessRecorderView.tsx` by wrapping `config` and `score` in mutable React refs (`configRef`, `scoreRef`), preventing teardown and unregistering of `window.__STAGEFLOW_RECORDER__` during state updates.
  - Implemented 5-attempt retry loop on `page.evaluate(stepFrame)` and added `pageerror`/`crash` event logging in `scripts/record/playwrightDriver.ts` to harden deterministic 60fps renders against transient microtask pauses.
  - Switched Vite dev server background spawning in `scripts/record/serverManager.ts` to direct `process.execPath` + `node_modules/vite/bin/vite.js` execution, eliminating Windows Node 22 `spawn EINVAL` and deprecation warnings when spawning isolated port instances.
  - Configured `server.watch.ignored` in `vite.config.ts` for `**/*.md`, `**/.agents/**`, `**/recordings/**`, and `**/_examples/**`, preventing Vite from triggering unexpected HMR full-reloads when writing output video files or updating documentation.

#### Documentation Formatting & Math Rendering

- **Yaw Azimuth Direction Documentation (`docs/YAML_AUTHORING_GUIDE.md`)**:
  - Corrected azimuthal coordinate rotation descriptions in Table 1.2 and Pitfall 2.6 to accurately reflect the Three.js right-handed Y-up coordinate engine: positive `yaw` increases counter-clockwise (CCW) when viewed from overhead (+Y) toward Stage Right (+X / 3:00), while `direction: "cw"` applies negative angular deltas.

- **Recipe 5 Code Fence Syntax (`docs/YAML_AUTHORING_GUIDE.md`)**:
  - Fixed an unclosed code block fence in Recipe 5 (Whip Pan Transition) that caused downstream recipe sections to render as raw preformatted text, and corrected the cookbook recipe count to 8.

- **Display Math Block Formatting & Vite Markdown HMR (`docs/STAGEFLOW_SCRIPT_SPECIFICATION.md`, `docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md`, `vite.config.ts`)**:
  - Placed opening and closing `$` delimiters on their own isolated lines around `\begin{aligned} ... \end{aligned}` blocks.
  - Resolves a KaTeX/remark-math parser failure where `$\begin{aligned}` on a single line was treated as inline math, creating an unclosed delimiter that swallowed 25,500+ characters of downstream sections into an unrendered red error block.
  - Removed `'**/*.md'` from `server.watch.ignored` in [`vite.config.ts`](vite.config.ts), allowing Vite to detect documentation changes and invalidate `?raw` module caches automatically without serving stale strings during development.

### Refactored

#### Layer 1: Core Engine Architecture Decomposition

- **Prune Unused Blocking Map Remnants (`src/core/scorePrimitives.ts`)**:
  - Removed unused `prevEndSecByEntity` map and redundant `entityKey` variables from `parseBlockingCues()`, keeping the blocking parser strictly lean and unified around the single `prevBlockEndSec` monotonic timeline playhead.

- **Entity Engine Modularization & Decoupling (`entityEngine.ts`, `entityBlockingEvaluator.ts`, `entityLegacyEvaluator.ts`, `entityKinematicUtils.ts`)**:
  - Decomposed the 545-line monolithic [`src/core/entityEngine.ts`](src/core/entityEngine.ts) into four strictly decoupled, single-responsibility Layer 1 submodules ($\le 250$ lines each), eliminating multi-concern entanglement while keeping the public `evaluateEntitiesAtTime` API surface 100% bit-for-bit identical.
  - Extracted [`src/core/entityKinematicUtils.ts`](src/core/entityKinematicUtils.ts) (80 lines) housing shared kinematic interfaces (`EntityPoseSnapshot`, `ChainedBlockingCueEntry`), look-at target point resolution (`resolveLookAtPoint`), and 16-segment ground movement trail generation (`buildGroundTrailPoints`).
  - Extracted [`src/core/entityBlockingEvaluator.ts`](src/core/entityBlockingEvaluator.ts) (229 lines) implementing Tier 1 continuous multi-cut kinematics across the root `blocking:` timeline with two-pass position and rotation chaining, Option A full-cue floor trails across camera cuts, continuous $C^0$ look-at handoffs, gap pose hold persistence, and hybrid per-shot metadata overlays.
  - Extracted [`src/core/entityLegacyEvaluator.ts`](src/core/entityLegacyEvaluator.ts) (274 lines) implementing Tier 2 legacy per-shot kinematics for scores without root `blocking:`, resolving shot boundary start/end overrides, walking direction auto-facing, and runtime interpolation.
  - Reduced [`src/core/entityEngine.ts`](src/core/entityEngine.ts) to a lean 48-line facade delegating between Tier 1 and Tier 2 evaluators with backward-compatible re-exports.
  - Added dedicated unit test suite [`tests/unit/entityEngine.test.ts`](tests/unit/entityEngine.test.ts) covering target resolution variants, ground trail generation thresholds, and direct evaluator calls across all 89 test cases.

- **Modularized Trajectory Chain Submodules (`trajectoryChain.ts` -> `cameraTargetResolver.ts` + `shotPoseEvaluator.ts`)**:
  - Decomposed 640-line `src/core/trajectoryChain.ts` into three single-responsibility, strictly acyclic Layer 1 submodules:
    - [`src/core/cameraTargetResolver.ts`](src/core/cameraTargetResolver.ts) (140 lines): Target anchor resolution from entity IDs/labels/presets with eye-line anchoring (`0.78 * height`) and Option A shot-boundary roll/target-offset reset semantics (`resolveShotStartRoll`, `resolveShotDestRoll`, `resolveShotStartOffset`, `resolveShotDestOffset`, `resolveTargetPoint3D`).
    - [`src/core/shotPoseEvaluator.ts`](src/core/shotPoseEvaluator.ts) (230 lines): Single-shot camera pose interpolation (`evaluateShotCameraPose`), multi-waypoint Catmull-Rom spline curves with shortest-arc angle unwrapping (`evaluateSplineCameraPose`), and 32-point 3D world path sampling (`sampleTrajectoryPoints`).
    - [`src/core/trajectoryChain.ts`](src/core/trajectoryChain.ts) (339 lines): Multi-shot forward pose chaining state machine (`evaluateCameraTrack`) and observer/stage cue extraction.
  - Re-exported all target resolution, spline evaluation, and trajectory sampling functions from `src/core/trajectoryChain.ts` for 100% backward compatibility with downstream callers (`frameEngine.ts`) and tests.
  - Added direct unit test assertions in [`tests/unit/frameEngine.test.ts`](tests/unit/frameEngine.test.ts) covering target resolution, Option A reset semantics, spline interpolation, and Golden Frame Equivalence across all 4 bundled scene catalog items at multi-timestamps.

- **Modularized Score Parser Submodules (`scoreParser.ts` -> `scorePrimitives.ts` + `cameraCueParser.ts`)**:
  - Decomposed monolithic 728-line `src/core/scoreParser.ts` into three single-responsibility Layer 1 submodules:
    - [`src/core/scorePrimitives.ts`](src/core/scorePrimitives.ts) (151 lines): Pure unit converters and normalizers (`parseVec3`, `parseOptionalVec3`, `parseTargetOrVec3`, `parseLensFocalLengthMm`, `parseAngleToRad`, `normalizeCameraManeuver`, `normalizeCameraEasing`, `normalizeEntityKind`).
    - [`src/core/cameraCueParser.ts`](src/core/cameraCueParser.ts) (308 lines): Optical camera cue specs, waypoints, base spherical poses, and observer shot arrays (`parseBaseSphericalPose`, `parseCameraCueSpec`, `parseStageCameraCueSpec`, `resolveStageCamEntityTarget`, `parseObserverShots`).
    - [`src/core/scoreParser.ts`](src/core/scoreParser.ts) (358 lines): Root YAML document decoder, entity definitions, contiguous take chaining (`continuous: true`), duration calculation, and diagnostic warnings.
  - Re-exported all primitive and cue parsing functions from `src/core/scoreParser.ts` to preserve 100% backward compatibility for all external callers and unit tests with zero breaking changes.
  - Added dedicated submodule unit test suites in [`tests/unit/scoreParser.test.ts`](tests/unit/scoreParser.test.ts) covering primitive vector/angle/lens parsers, enum normalizers, and Golden Equivalence across all 4 bundled scene catalog items.

- **Unidirectional Layer Boundary Integrity & Reverse Import Cleanup**:
  - Relocated shared persistence types `SplitPreset` (`'50-50' | '30-70' | '70-30' | '0-100'`) and `StoragePersistenceStatus` (`'bundled' | 'draft-saved' | 'custom' | 'saving'`) from Layer 5 UI components into foundational Layer 1 [`src/core/types.ts`](src/core/types.ts).
  - Eliminated reverse upward layer dependency in Layer 1 [`src/core/storage/localStorageUi.ts`](src/core/storage/localStorageUi.ts), which previously imported `SplitPreset` from Layer 5 `WorkspaceHeader.tsx`.
  - Eliminated reverse upward layer dependency in Layer 3 [`src/hooks/useScorePersistence.ts`](src/hooks/useScorePersistence.ts), which previously imported `StoragePersistenceStatus` from Layer 5 `StorageStatusBadge.tsx`.
  - Maintained backward compatibility by re-exporting `SplitPreset` and `StoragePersistenceStatus` from [`src/ui/WorkspaceHeader.tsx`](src/ui/WorkspaceHeader.tsx) and [`src/ui/StorageStatusBadge.tsx`](src/ui/StorageStatusBadge.tsx).
  - Validated strict unidirectional layer flow (`Layer 1 -> Layer 2 -> Layer 3 -> Layer 4 & Layer 5`) with automated AST layer analysis reporting 0 violations.

#### Application Shell, Studio & Build Modularization

- **Documentation Viewer & Studio Granular Bundle Code-Splitting (`src/App.tsx`, `src/ui/InteractiveStudioApp.tsx`, `vite.config.ts`, `src/ui/guide/*`)**:
  - Decoupled `InteractiveStudioApp` from `src/App.tsx` into a dedicated orchestrator component, reducing `App.tsx` from 627 lines to 137 lines.
  - Implemented dynamic lazy-loading with `React.lazy()` for `InteractiveStudioApp`, `ScoreAuthoringGuideView`, and `HeadlessRecorderView`, allowing synchronous URL routing to request only the bundle chunks needed for the active mode.
  - Configured Rollup `manualChunks` in `vite.config.ts` separating `vendor-three` (~364kB gzip), `vendor-katex` (~133kB gzip), and `vendor-codemirror` (~112kB gzip), dropping the initial cold-load payload of `?mode=guide` and `?mode=spec` from 783kB gzip to 181kB gzip (a ~77% payload reduction).
  - Added a 150ms debounce to the documentation topic search input, eliminating frame drops and redundant full markdown AST transforms and KaTeX compilations during fast typing.
  - Added animated `<GuideLoadingSkeleton />` for documentation views, configured `optimizeDeps` in `vite.config.ts` for Three.js, R3F, and CodeMirror, and restored direct studio mounting with `fallback={null}` to eliminate any secondary splash screen or dev-server reload.

- **App Shell Modularization & Submodule Extraction (`App.tsx`, `useWorkspaceLayout.ts`, `useStudioDisplaySettings.ts`, `useToastNotifications.ts`, `DioramaOverlayContainer.tsx`, `scoreYamlUtils.ts`)**:
  - Decomposed the 796-line monolith [`src/App.tsx`](src/App.tsx) into focused single-responsibility hooks and UI submodules, dropping `App.tsx` down to 556 lines while preserving 100% of workspace layout behaviors, storage keys, hotkeys, and diorama contracts.
  - Extracted [`src/core/scoreYamlUtils.ts`](src/core/scoreYamlUtils.ts) (63 lines) for pure Layer 1 YAML header manipulation (`updateScoreYamlId`, `updateScoreYamlTitle`, `generateCustomScoreId`, `downloadYamlBlob`), centralizing project slug generation and eliminating regex string-replacement duplication between `App.tsx` and `useScorePersistence.ts`.
  - Extracted [`src/hooks/useWorkspaceLayout.ts`](src/hooks/useWorkspaceLayout.ts) (136 lines) encapsulating split percentages (`leftSplitPct`, `rightSplitPct`, `videoHeightPct`), layout presets, subpanel expansion/collapse, layout reset, and synchronous `localStorage` persistence.
  - Extracted [`src/hooks/useStudioDisplaySettings.ts`](src/hooks/useStudioDisplaySettings.ts) (82 lines) encapsulating 3D diorama label display modes, composition guides, and global keyboard shortcuts (`L` to cycle labels, `G` to toggle guides with input element protection).
  - Extracted [`src/hooks/useToastNotifications.ts`](src/hooks/useToastNotifications.ts) (33 lines) managing floating toast notification alerts and 3.2s auto-dismiss timers.
  - Extracted [`src/ui/DioramaOverlayContainer.tsx`](src/ui/DioramaOverlayContainer.tsx) (121 lines) encapsulating center stage diorama overlays with responsive narrow-viewport switching (<580px compact header vs 4-corner HUD, ViewCube presets, camera mode dock, and telemetry capsule).
  - Added unit test suite [`tests/unit/scoreYamlUtils.test.ts`](tests/unit/scoreYamlUtils.test.ts) covering slug generation, quoted/unquoted ID replacements, title replacements, and header prepending across 7 test cases.

- **Relocated Bundled Scores to `src/scores/` (`scoreCatalog.ts`)**:
  - Moved default choreography scores from `public/scores/` to `src/scores/` (`demo_blueprint.yaml`, `blueprint_02_dialogue.yaml`, `blueprint_03_ball_pass.yaml`, `blueprint_04_cinematography_tutorial.yaml`).
  - Updated bundled raw YAML string imports in `src/core/scoreCatalog.ts` from `../../public/scores/*.yaml?raw` to `../scores/*.yaml?raw`.
  - Resolved Vite dev server warning (`Assets in public directory cannot be imported from JavaScript`), aligning bundled asset structure with Vite module bundling standards.
  - Synchronized file tree references in `AGENTS.md` and `docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md`.

### Removed

#### Legacy Scaffolding

- **Legacy Genesis Scaffolding Brief (`SPECIFICATION.md`)**:
  - Removed redundant root `SPECIFICATION.md` as all formal architectural models, AST contracts, optics equations, kinematics, design tokens, and authoring recipes are now comprehensively specified across the modular Single Source of Truth suite in [`docs/`](docs/).

## [0.1.0] - 2026-11-03

### Added
- **Core Stateless Frame Engine & Cinematic Optics (Layer 1)**:
  - Deterministic evaluation function `computeStageFrame(t, score)` guaranteeing bit-for-bit identical staging on forward and backward scrubs.
  - Forward camera pose chaining ($P_0 \to P_1 \to \dots \to P_k$) calculating cumulative camera positions and targets across cuts.
  - 9 easing algorithms (`linear`, `ease_in_quad`, `ease_out_quad`, `ease_in_out_quad`, `ease_in_cubic`, `ease_out_cubic`, `ease_in_out_cubic`, `ease_in_out_sine`, `ease_in_out_expo`).
  - 11 3D camera trajectory maneuvers (`static`, `pan`, `tilt`, `dolly_in`, `dolly_out`, `truck_left`, `truck_right`, `pedestal_up`, `pedestal_down`, `arc_orbit`, `compound`).
  - Shortest-arc angular unwrapping (`shortestAngleDiff`) on $[-\pi, \pi]$ preventing $360^\circ$ yaw and facing flips.
  - Full-frame cinema lens focal length mapping ($24\text{mm}$, $35\text{mm}$, $50\text{mm}$, $85\text{mm}$) to vertical FOV using $36\text{mm} \times 24\text{mm}$ sensor math.
  - Rectangular film gate frustum projection matching target aspect ratios (`16:9`, `2.39:1`) with focal distance and focus plane bounds.
  - Decoupled `observer_shots` timeline allowing independent observation choreography separate from stage director cuts.
  - Resilient YAML/JSON score parser (`scoreParser.ts`) converting human angles (degrees) to radians and metric distances with validation diagnostics.
  - Bundled score registry (`scoreCatalog.ts`) supporting synchronous bundled lookups and asynchronous custom imports.
- **Universal Media Clock Drivers (Layer 2)**:
  - Polymorphic `MediaClockDriver` interface powering Local Video, YouTube URLs, and Procedural Simulator.
  - HTML5 Video Driver (`html5MediaDriver.ts`) supporting local `.mp4`/`.webm` and dropped blobs with play, pause, seek, and loop support.
  - YouTube Driver (`youtubeMediaDriver.ts`) with IFrame API integration and 60fps drift-compensated extrapolation via `performance.now()`.
  - Procedural Virtual Clock (`proceduralMediaDriver.ts`) generating accurate 60fps playback timelines without video files.
- **Dual-Tier State Hooks & Storage (Layer 3)**:
  - Imperative 60fps frame tick (`useStageFrameLoop.ts`) mutating Three.js objects directly with zero React re-renders, paired with ~10Hz (`95ms`) throttled React UI state updates.
  - Unified transport hook (`useMediaClock.ts`) handling play/pause, time updates, variable speed (`0.25x`, `0.5x`, `1x`, `2x`), frame stepping (`[` / `]`), and shot looping.
  - Dual-tier storage engine (`scoreDb.ts`, `localStorageUi.ts`, `useScorePersistence.ts`) persisting custom scores and drafts to IndexedDB (`idb`) and UI preferences to `localStorage`.
  - Deferred invalidation pattern preventing premature fallback to defaults during asynchronous hydration.
  - Drag-and-drop & file picker loader (`useFileDropLoader.ts`) for pairing `.yaml` scores and `.mp4` video files.
- **React Three Fiber 3D Blueprint Diorama (Layer 4)**:
  - Minimalist dark diorama aesthetic with blueprint-styled grid lines ($1\text{m}$ primary, $0.25\text{m}$ sub-grid), stage boundary perimeter, and cardinal compass markers.
  - Stylized directional mannequins (`DirectionalMannequin.tsx`) with torso columns, head spheres, directional eye-visors, floor chevrons, and dashed motion trails.
  - Dual-camera rig system (`StageCameraRig.tsx`, `ObserverCameraRig.tsx`):
    - Illustrative Stage Camera in 3D space with rectangular frustum pyramid, optical focus plane, and 32-sample smoothed trajectory curves.
    - Viewport Observer Camera with seamless pause-to-free-orbit handover (`OrbitControls`) and instantaneous 0ms POV cuts between Scripted Observer, Free Orbit, and Stage Cam.
  - True 3D Stage Cam monitor (`StageCamMonitorCanvas.tsx`, `StageCamViewRig.tsx`) simulating physical viewfinder optics with safe-action crosshairs and letterbox framing.
  - High-performance imperative updates: direct frustum geometry and gate scaling without React reconciliation, and memoized billboard labels (`StageBillboardLabel.tsx`).
- **Directorial 2D Workspace Shell (Layer 5)**:
  - Resizable split workspace (`ResizableSplitWorkspace.tsx`) with a draggable divider ($18\%\text{--}82\%$) and 1-click header presets (`50/50`, `70/30 Stage`, `70/30 Video`, `100% Stage`).
  - Shot Breakdown HUD (`ShotBreakdownHud.tsx`) overlaying active shot index, lens focal length, camera maneuver, and directorial staging notes.
  - Camera Telemetry Capsule (`CameraTelemetryCapsule.tsx`) displaying real-time spherical coordinates (`target`, `distance`, `pitch`, `yaw`, `lens`) with 1-click YAML snippet copying.
  - Directorial Transport Bar (`DirectorialTransportBar.tsx`) featuring shot timeline markers, interactive shot chips, transport buttons, playback speed menu, and POV mode toggle.
  - Slide-out YAML Inspector Drawer (`YamlInspectorDrawer.tsx`) with real-time syntax error reporting and live stage re-evaluation.
  - Draft management UI (`StorageStatusBadge.tsx`, `ConfirmResetModal.tsx`) indicating storage tier and providing safe draft discard workflows.
- **Bundled Scores & Living Documentation Suite**:
  - `demo_blueprint.yaml`: Blueprint 01 featuring a 10-second two-shot 90° arc movement with subject blocking and facing dynamics.
  - `blueprint_02_dialogue.yaml`: Blueprint 02 featuring 6-shot dialogue coverage across 2 actors with 3 decoupled cinematic observer orbits.
  - `CHANGELOG.md`: Project changelog following Keep a Changelog and Semantic Versioning specifications.
  - Complete living specifications: `AGENTS.md` (with continuous diff-driven changelog tracking & Showrunner release authority), `SPECIFICATION.md`, `README.md`, `YAML_AUTHORING_GUIDE.md`, `CORE_MATH_AND_SCORE_SPECIFICATIONS.md`, `MEDIA_CLOCK_AND_SYNC_SPECIFICATIONS.md`, and `DIORAMA_3D_AND_UI_SPECIFICATIONS.md`.
