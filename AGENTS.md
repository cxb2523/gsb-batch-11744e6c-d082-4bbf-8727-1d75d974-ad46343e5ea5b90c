# AGENTS.md — StageFlow: 3D Choreography Diorama Guidelines

This is the authoritative operating guide for AI agents working in **StageFlow**. Read it first before inspecting, planning, or modifying any code.

---

## 1. Mission & Role

**StageFlow** is a standalone 3D Camera-Blocking & Scene Choreography Diorama web application. It synchronizes a universal video player (**Local `.mp4`/`.webm`**, **YouTube URLs**, or a **60fps Stage Cam Blueprint Simulator**) with an interactive **Three.js / React Three Fiber (R3F)** blueprint stage to analyze, dissect, and visualize spatial staging and camera maneuvers at every millisecond of a scene.

- **Taruma Sakti** ([@taruma](https://github.com/taruma)) is the Creator and Showrunner. He owns product direction, visual staging philosophy, and UX decisions.
- **The AI Agent** is a software engineering partner and system architect. Its mission is to keep the engine strictly decoupled, mathematically deterministic, unit-tested, and synchronized with living documentation.

---

## 2. Non-Negotiable Core Governance & Workflow Rules

### 2.1 Ask First When Intent Is Unclear (Zero Guessing)
- **Never guess on ambiguous scope, UX behavior, or visual staging.** Product and directorial decisions belong to Taruma.
- If any instruction, edge case, or requirement has doubt or ambiguity, **ask first before writing code or scaffolding**.
- Brainstorm or clarify before building anything that changes what the application shows or how the user interacts with it.

### 2.2 Strictly Decoupled Architecture (No Monoliths)
- **Propose and enforce decoupled systems at all times.** Never bundle math calculations, media clock I/O, Three.js scene objects, and 2D React UI chrome into monolithic files.
- Keep modules focused on a single responsibility (target $\le 250$ lines per file). If a file starts doing two jobs, split it into clean, testable submodules.
- Layer dependencies must flow strictly one way (`core/` $\to$ `media/` $\to$ `hooks/` $\to$ `stage/` & `ui/`). `src/core/` must have **zero React and zero DOM/Three.js runtime dependencies**.

### 2.3 Living Documentation as Single Source of Truth (SSOT)
- **Documentation and codebase must never drift.** With **every code change**, the agent MUST proactively audit and update [`AGENTS.md`](AGENTS.md), [`README.md`](README.md), and the domain specifications in [`docs/`](docs/) as part of completing the task.
- **Mandatory Ripgrep Cross-Reference Sweep**: Whenever any YAML property, default, or engine invariant changes, never update only the primary heading from memory—run `rg` across `docs/`, `README.md`, `AGENTS.md`, and `.agents/skills/` for all affected keywords/identifiers to catch every secondary table, callout, and skill cheatsheet on the first pass.
- **Architecture File Map Sync**: Whenever any file is added, renamed, split, or deleted, update [`docs/ARCHITECTURE_FILE_MAP.md`](docs/ARCHITECTURE_FILE_MAP.md) alongside the domain spec.
- **Detailed `CHANGELOG.md` Tracking (`## [Unreleased]`)**: Every change must be recorded in [`CHANGELOG.md`](CHANGELOG.md) under the `## [Unreleased]` section. Bullet points must reflect granular details derived directly from pending file diffs (`git diff HEAD`).
- **Showrunner Versioning & Release Authority**: Version numbers, release checkpoints, and Git tagging (`git tag`) are strictly decided and executed by Taruma. The agent never increments version numbers or tags releases autonomously.
- Always cross-verify documentation claims against the **actual current state of the codebase** before and after implementation. Taruma should never have to remind the agent to update docs.
- **Strict 24,000-Byte Root Cap (`AGENTS.md` vs. `docs/*.md`)**: Antigravity enforces a hard `24,000-byte` per-file inline rule limit on `AGENTS.md`. Keep `AGENTS.md` concise (holding universal governance, architecture maps, and invariant digests) and place deep technical specifications verbatim inside the corresponding `docs/*.md` files.

### 2.4 Never Commit Autonomously
- Never run `git commit`, `git push`, or `git tag`. Committing, pushing, and tagging are strictly human-in-the-loop actions reserved for Taruma.
- Upon concluding every verified task, run `git status` and `git diff HEAD`, then **propose a ready-to-copy Conventional Commit message** derived strictly from the full pending diff:

```text
<type>(<scope>): <concise intent>

- Concise bullet points explaining architectural rationale or scope
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

### 2.5 Dual-Tier Lifecycle & Deferred Invalidation (Zero Premature Fallback)
- **Never discard stored state pointers against partial synchronous data.** When pairing fast synchronous pointers (`localStorage`, URL query params) with asynchronous storage (`IndexedDB`, network), initial frame-$0$ state must preserve the raw pointer without discarding it or prematurely falling back to index $0$.
- **Always reconcile post-hydration.** When asynchronous data finishes loading, reconcile the active pointer against the complete merged dataset before applying fallbacks.
- **Mandatory 4-State Persistence Testing**:
  1. Cold start with empty storage (default fallback)
  2. Cold start with bundled scene pointer
  3. Cold start with custom/IndexedDB scene pointer
  4. Cold start with active draft edits

### 2.6 Declarative DSL Polymorphism (Flat vs. Nested vs. Scoped Overrides)
- **Never assume a single syntax shape for declarative DSLs (YAML/JSON).** In human-authored DSLs, directors author properties either flat at the cue root (`- id: cue-1, continuous: true, target: hero`) or nested inside specialized sub-blocks (`- id: cue-1, camera: { continuous: true, target: hero }`).
- **Support both flat and nested authoring**: When introducing or modifying any cue-level property, always parse both the cue root and the nested spec block.
- **Enable scoped hierarchy overrides**: Scoped child blocks (e.g. `shots[k].observer_camera` or `shots[k].stage_camera`) must always be able to explicitly override parent shot or track-level flags.

### 2.7 Reactive Wakeup Discipline (Zero Background Polling)
- **Never poll or busy-wait on background commands.** When a terminal command continues running in the background as an asynchronous task, **call zero further tools and let your turn end immediately**.
- Do not run `manage_task status`, `echo "waiting"`, sleep commands, or dummy shell loops while waiting.
- The platform will automatically resume your execution via a reactive wakeup message once the background task finishes.

---

## 3. Mandatory Pre-Flight Domain Specification Lookup Gate

> [!IMPORTANT]
> Detailed technical specifications are modularized under [`docs/`](docs/).
> - **Mandatory Scope**: Before planning, inspecting, or modifying core math, schema/DSL contracts, kinematics, media sync drivers, 3D diorama rigs, or multi-file architecture, the agent **MUST** call `read_file` on the corresponding specification document:
>   - **Repository Structure & Exhaustive 5-Layer File Map**: Read [`docs/ARCHITECTURE_FILE_MAP.md`](docs/ARCHITECTURE_FILE_MAP.md).
>   - **Layer 1: Core Math, Optics, Trajectories & YAML Score Schema** (`src/core/*`, `src/scores/*.yaml`, `tests/unit/*`): Read [`docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md`](docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md), [`docs/STAGEFLOW_SCRIPT_SPECIFICATION.md`](docs/STAGEFLOW_SCRIPT_SPECIFICATION.md), [`docs/YAML_AUTHORING_GUIDE.md`](docs/YAML_AUTHORING_GUIDE.md), and [`docs/SCORE_CATALOG.md`](docs/SCORE_CATALOG.md).
>   - **Layer 2 & 3: Universal Media Clock, YouTube Sync & Dual-Tier 60fps Loop** (`src/media/*`, `src/hooks/*`): Read [`docs/MEDIA_CLOCK_AND_SYNC_SPECIFICATIONS.md`](docs/MEDIA_CLOCK_AND_SYNC_SPECIFICATIONS.md).
>   - **Layer 4 & 5: 3D Blueprint Diorama, Dual-Camera Rigs & 2D Workspace UI** (`src/stage/*`, `src/ui/*`, `src/App.tsx`): Read [`docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md`](docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md) and [`docs/VISUAL_DESIGN_SYSTEM.md`](docs/VISUAL_DESIGN_SYSTEM.md).
>   - **Deterministic Viewport Video Recorder CLI** (`scripts/record/*`, `src/recorder/*`): Read [`docs/VIEWPORT_RECORDER_GUIDE.md`](docs/VIEWPORT_RECORDER_GUIDE.md).
> - **Exempt / Lightweight Scope**: Localized cosmetic styling (Tailwind utility classes, color tokens), minor UI copy, single-component CSS layout adjustments, and isolated typos do not require full domain spec re-reads.

### Universal StageFlow Invariants Matrix

| # | Invariant | Core Constraint & Engineering Rule | Domain Spec |
| :--- | :--- | :--- | :--- |
| 1 | **Stateless Timeline (`Frame_t = f(t)`)** | `computeStageFrame(t, score)` is 100% pure and deterministic; scrubbing forward or backward yields bit-for-bit identical 3D states | [Core Math Specs](docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md) |
| 2 | **Metric Meters & Human Degrees** | World space uses **meters** ($1\text{ unit} = 1\text{m}$); YAML angles use **degrees** (`pitch`, `yaw`, `roll`, `rotation`) converted to radians in `scoreParser.ts` | [Core Math Specs](docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md) |
| 3 | **Shortest-Arc Angle Unwrapping** | All yaw, roll, and facing interpolations use `shortestAngleDiff` on $[-\pi, \pi]$ to eliminate $360^\circ$ wrap-around spin flips | [Core Math Specs](docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md) |
| 4 | **Cinematic Lens Optics (`mm`) & Thin-Lens DoF** | Stage & Observer cameras use full-frame focal lengths (`24mm`, `35mm`, `50mm`, `85mm`) mapped to vertical FOV via $36\text{mm}$ sensor math; Stage Camera evaluates orthogonal focus plane projection (`focus`, `focus_start`/`focus_end`) and Gaussian thin-lens DoF (`dof: shallow|medium|deep`, `aperture`) | [Core Math Specs](docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md) |
| 5 | **Rectangular Film Gate Frustum & Focus Rig** | Stage Camera projects a rectangular pyramidal frustum matching the video aspect ratio (`16:9`, `2.39:1`) with a sliding Focus Plane Frame, Near/Far DoF limit brackets, emerald off-axis focus tether, and opt-in single-pass WebGL2 viewfinder bokeh (`[ Blur ]` / hotkey `B`) | [3D & UI Specs](docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md) |
| 6 | **Universal Media Clock Parity** | Local `.mp4`, YouTube URLs, and Procedural Simulator share `MediaClockDriver`; YouTube uses 60fps `performance.now()` drift extrapolation | [Media & Sync Specs](docs/MEDIA_CLOCK_AND_SYNC_SPECIFICATIONS.md) |
| 7 | **Dual-Tier 60fps Render Engine** | Tier 1 mutates Three.js transforms imperatively in R3F `useFrame` (0 React re-renders); Tier 2 syncs React UI state at ~10Hz (`95ms`) | [Media & Sync Specs](docs/MEDIA_CLOCK_AND_SYNC_SPECIFICATIONS.md) |
| 8 | **Pause-to-Free-Orbit Handover** | In `'scripted'` mode: playback locks viewport to `observerCamera`; pausing unlocks `OrbitControls`; scrubbing while paused snaps camera | [3D & UI Specs](docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md) |
| 9 | **Instant Camera POV Cuts (0ms)** | Switching between `'scripted'`, `'free'`, and `'stage-pov'` cuts instantaneously on the next frame without disorienting transition lag | [3D & UI Specs](docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md) |
| 10 | **Directional Mannequins, Dimensions & Footprints** | Characters, props, and markers support 3D dimensions ($w, h, d$); ground-pinned $Y=0$ scaling; rigid head/shoulders with telescoping torso; shape-matched box/elliptical footprints | [3D & UI Specs](docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md) |
| 11 | **Resizable Split Workspace** | Draggable split divider ($18\%$–$82\%$) with 1-click header layout modes (`Split` / `Full`) | [3D & UI Specs](docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md) |
| 12 | **Telemetry Capsule & Live YAML** | Bottom-right capsule copies formatted YAML (`target`, `distance`, `pitch`, `yaw`, `roll`, `lens`); YAML Drawer re-evaluates stage live without crashing | [3D & UI Specs](docs/DIORAMA_3D_AND_UI_SPECIFICATIONS.md) |
| 13 | **Dual-Tier Storage & Deferred Invalidation** | Scores & drafts persist in IndexedDB (`idb`); UI preferences in `localStorage`; local dropped videos remain in-memory only; YAML is SSOT; synchronous initializers must never discard stored pointers before asynchronous hydration completes | [Core Math Specs](docs/CORE_MATH_AND_SCORE_SPECIFICATIONS.md) |

---

## 4. Repository Structure & 5-Layer Architecture

Each layer depends strictly on the layers below it (`core/` $\to$ `media/` $\to$ `hooks/` $\to$ `stage/` & `ui/`). For the exhaustive file-by-file directory tree, see [`docs/ARCHITECTURE_FILE_MAP.md`](docs/ARCHITECTURE_FILE_MAP.md).

```text
stageflow/
├── .agents/skills/        # Workspace skills (stageflow-score-debugger, stageflow-viewport-recorder)
├── docs/                  # Authoritative domain specifications & ARCHITECTURE_FILE_MAP.md (SSOT)
├── scripts/record/        # 60fps Playwright + FFmpeg deterministic viewport video recorder CLI
├── src/
│   ├── core/              # Layer 1: Pure TypeScript math, optics, parser, kinematics & IndexedDB/localStorage
│   ├── media/             # Layer 2: Universal MediaClockDrivers (HTML5 video, YouTube 60fps, Procedural)
│   ├── hooks/             # Layer 3: Dual-tier 60fps ref loop, transport, persistence & layout hooks
│   ├── stage/             # Layer 4: React Three Fiber 3D blueprint diorama, camera rigs & mannequins
│   ├── ui/                # Layer 5: 2D directorial UI shell (header, left-panel, editor, guide, library)
│   ├── recorder/          # Headless recording bridge (?mode=headless-render)
│   └── scores/            # Built-in choreography scores (*.yaml): studies/ & blueprints/ (see docs/SCORE_CATALOG.md)
└── tests/unit/            # Vitest deterministic unit test suites
```

---

## 5. Tooling, Verification & Testing Policy

Verification in StageFlow is calibrated into two tiers to balance rigorous mathematical safety with rapid feedback loops:

### Tiered Verification Gates

| Tier | When to Apply | Automated Commands | Requirement |
| :--- | :--- | :--- | :--- |
| **Tier 1: Fast Dev Loop** | Localized UI/styling, minor bugfixes, copy tweaks, isolated single-file components | `npm run lint`<br>`npm run typecheck` (`tsc -b`)<br>Targeted Vitest (if applicable) | `oxlint` 0 warnings; `tsc -b` 0 TypeScript errors (< 6s). Eliminates the 2-minute Vite chunking overhead on trivial edits. |
| **Tier 2: Core Engine & Full Release** | Core math, kinematics, schema/DSL syntax, 3D diorama rigs, media sync, dependencies, refactors | `npm test`<br>`npm run build` (`tsc -b && vite build`)<br>`npm run lint` | All Vitest unit suites pass (228 tests); zero TypeScript/Vite bundling errors; `oxlint` 0 warnings. |

### Pre-Delivery Audit Checklist
Before reporting completion of any task:
1. **Self-Audit Chaining & Edge Cases**: For forward-chaining or state-persistence changes (`trajectoryChain.ts`, `entity*Evaluator.ts`, `scoreParser.ts`), verify both explicit-value and omitted-field fallback branches so composite states (e.g. `baseTarget + offset`) never double-accumulate, and assert final 3D world-space transforms in unit tests.
2. **DSL Polymorphism Audit**: Verify that newly introduced or modified properties are accepted both flat at the cue root and nested inside spec blocks (e.g. `camera:` / `observer_camera:`), and verify scoped child overrides.
3. **Compiler Strictness Verification**: Always run `npm run typecheck` (`tsc -b`) or `npm run build` (`tsc -b && vite build`) alongside tests. Never rely on transpiled Vitest passes alone, as esbuild strips types without enforcing strict flags (`noUnusedParameters`, strict null checks).
4. **Docs-as-Code Fixture Awareness**: In documentation suites that act as live test fixtures (e.g. `tests/unit/guideSnippets.test.ts`), any added or modified markdown YAML block directly impacts unit test suites. Run tests after updating docs.
5. **Dual-Tier Documentation Sync**: When updating documentation for schema changes, update both descriptive guide prose (`YAML_AUTHORING_GUIDE.md`) AND formal AST contract tables (`STAGEFLOW_SCRIPT_SPECIFICATION.md §7.2`).
6. Run the appropriate verification tier: Tier 1 (`npm run lint` + `npm run typecheck`) for cosmetic/localized UI edits, or Tier 2 (`npm test` + `npm run build` + `npm run lint`) for core engine/architectural tasks.
7. Verify that no monolithic files were introduced and layer boundaries remain pure.
8. Run `rg` across [`AGENTS.md`](AGENTS.md), [`README.md`](README.md), [`docs/*.md`](docs/) (including [`docs/ARCHITECTURE_FILE_MAP.md`](docs/ARCHITECTURE_FILE_MAP.md)), and [`.agents/skills/`](.agents/skills/) for all modified fields, invariants, or file paths, and synchronize every reference.
9. Record granular change bullets in [`CHANGELOG.md`](CHANGELOG.md) under `## [Unreleased]` based directly on pending diffs (`git diff HEAD`).
10. Run `git status` and `git diff HEAD` and provide a ready-to-copy Conventional Commit message.
