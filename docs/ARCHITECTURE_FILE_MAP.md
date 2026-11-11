# StageFlow Architecture & Repository File Map (SSOT)

This document is the authoritative file-by-file directory map and 5-layer dependency specification for **StageFlow**. Every file added, renamed, split, or removed in the repository must be synchronized here alongside its corresponding domain specification.

---

## 1. 5-Layer Dependency & Module Discipline

Each architectural layer depends strictly on the layers below it:

$$\texttt{src/core/} \longrightarrow \texttt{src/media/} \longrightarrow \texttt{src/hooks/} \longrightarrow \texttt{src/stage/ \& src/ui/}$$

- **Zero Upward Imports**: `src/core/` must maintain **zero React and zero DOM/Three.js runtime dependencies**.
- **Single-Responsibility Module Budget**: Target $\le 250$ lines per file. When a module begins serving two distinct responsibilities, split it into focused, unit-testable submodules.

---

## 2. Exhaustive Repository Directory Tree

```text
stageflow/
├── .agents/                         # Workspace Skills & Customizations
│   └── skills/
│       ├── stageflow-score-debugger/    # Choreography Score Kinematic & Visual Debugger Skill (SKILL.md)
│       └── stageflow-viewport-recorder/ # 60fps Viewport Video Recorder Skill (SKILL.md)
├── AGENTS.md                        # Root governance, workflow rules & invariant router (< 24 KB)
├── CHANGELOG.md                     # Semantic version release log & unreleased change tracking
├── README.md                        # Quickstart overview & CLI command reference
├── docs/                            # Detailed technical & architectural specifications (SSOT)
│   ├── releases/                    # Versioned GitHub release notes archive
│   │   └── v1.0.0.md                # Release notes for StageFlow v1.0.0 initial release
│   ├── ARCHITECTURE_FILE_MAP.md     # Exhaustive repository file tree & 5-layer module index
│   ├── STAGEFLOW_SCRIPT_SPECIFICATION.md # Engine SSOT: mathematical model, optics & AST contract
│   ├── YAML_AUTHORING_GUIDE.md      # Authoring SSOT: quickstart, YAML schema, aliases & cookbook
│   ├── CORE_MATH_AND_SCORE_SPECIFICATIONS.md
│   ├── MEDIA_CLOCK_AND_SYNC_SPECIFICATIONS.md
│   ├── DIORAMA_3D_AND_UI_SPECIFICATIONS.md
│   ├── VISUAL_DESIGN_SYSTEM.md      # SSOT for typography, theme engine, UI_TOKENS & palettes
│   ├── SCORE_CATALOG.md             # Master score index & program guide for studies & blueprints
│   └── VIEWPORT_RECORDER_GUIDE.md   # Deterministic 60fps Playwright + FFmpeg recorder operating manual (SSOT)
├── scripts/                         # CLI Automation & Offline Tooling
│   └── record/                      # 60fps Playwright + FFmpeg Viewport Recorder
│       ├── cli.ts                   # CLI entry point, argument parsing & usage help
│       ├── batchRecord.ts           # Automated batch recorder for factory blueprints BP01–BP07
│       ├── playwrightDriver.ts      # Headless Chromium lifecycle & frame-stepping loop
│       ├── ffmpegPipeline.ts        # FFmpeg pipe encoder (libx264, VP9, GIF, PNG sequence)
│       ├── serverManager.ts         # Vite server detection & background startup
│       ├── cameraPresets.ts         # Camera angle presets (isometric, top-down, front, side)
│       └── recorderTypes.ts         # Shared CLI & bridge TypeScript interfaces
├── public/                          # Static web assets, logos, icons & favicons
│   ├── StageFlow - LOGO - BLACK.png # Desktop horizontal brand logo (light/warm themes)
│   ├── StageFlow - LOGO - WHITE.png # Desktop horizontal brand logo (dark/pure-black themes)
│   ├── StageFlow - ICON - Square.png# Mobile header rounded box icon (theme-adaptive)
│   ├── favicon.ico, favicon-*.png   # Browser favicons & Apple touch icons
│   └── site.webmanifest             # Web application manifest
├── src/
│   ├── recorder/                    # Headless Recording Bridge & Render Environment
│   │   ├── HeadlessRecorderView.tsx # Canvas mounted on ?mode=headless-render
│   │   └── recorderTypes.ts         # Bridge schemas & window.__STAGEFLOW_RECORDER__ interface
│   ├── scores/                      # Choreography Scores (*.yaml)
│   │   ├── catalog.yaml             # Declarative YAML manifest for built-in choreography scores, categories & URL aliases
│   │   ├── studies/                 # Directorial Scene Studies (see docs/SCORE_CATALOG.md)
│   │   └── blueprints/              # Factory camera-blocking presets (see docs/SCORE_CATALOG.md)
│   ├── core/                        # Layer 1: Pure TypeScript Math, Optics & Stateless Frame Engine
│   │   ├── types.ts                 # Canonical interfaces (StageScore, ShotCue, ObserverShotCue, BlockingCueSpec, StageFrame)
│   │   ├── constants.ts             # Metric bounds, sensor constants, blueprint color palette
│   │   ├── opticsMath.ts            # Focal length (mm) <-> Vertical FOV (deg), Rectangular Gate & Thin-Lens DoF math
│   │   ├── sphericalMath.ts         # Degrees <-> Radians, Spherical <-> Cartesian, shortestAngleDiff
│   │   ├── maneuvers.ts             # 9 easing curves & 11 3D camera trajectory maneuvers
│   │   ├── dofEvaluator.ts          # Stateless focus distance, rack-focus interpolation & thin-lens DoF evaluator
│   │   ├── entityEngine.ts          # Facade: evaluateEntitiesAtTime dispatcher (<50 lines)
│   │   ├── entityBlockingEvaluator.ts # Tier 1: Decoupled root blocking: timeline kinematics
│   │   ├── entityLegacyEvaluator.ts # Tier 2: Legacy per-shot shots[].entities kinematics
│   │   ├── entityKinematicUtils.ts  # 3D dimension parsing, OBB footprint math, look_at target & trail generation
│   │   ├── cameraTargetResolver.ts  # Multi-subject 3D centroid resolution, target anchors, offsets & roll/offset flow
│   │   ├── cameraRigEvaluator.ts    # Physical camera rig mounts (tripod, track, spline_track) & inverse look-at kinematics
│   │   ├── shotPoseEvaluator.ts     # Single-shot pose evaluation, Catmull-Rom splines & 3D path sampling
│   │   ├── trajectoryChain.ts       # Forward pose chaining (P_0 -> P_k) & multi-shot timeline tracks
│   │   ├── frameEngine.ts           # Master stateless evaluator: computeStageFrame(t, score)
│   │   ├── scorePrimitives.ts       # Low-level vector, angle, lens, focus/DoF & enum normalizers
│   │   ├── cameraCueParser.ts       # Camera poses, shot cue specs, waypoints & observer shots
│   │   ├── scoreParser.ts           # Resilient YAML/JSON parser & degree/meter normalizer
│   │   ├── scoreYamlUtils.ts        # Pure YAML header id/title modifiers, FNV-1a content hashing & duplicate matcher
│   │   ├── scoreUrlLoader.ts        # Pure Layer 1 remote score validator, query param parser & HTTP fetcher
│   │   ├── scoreCatalog.ts          # Bundled scene score catalog loader (driven by catalog.yaml via import.meta.glob) & alias resolver
│   │   └── storage/                 # Client persistence utilities
│   │       ├── scoreDb.ts           # IndexedDB persistence for score drafts & custom scenes (idb)
│   │       └── localStorageUi.ts    # Synchronous localStorage helpers for UI preferences
│   ├── media/                       # Layer 2: Universal Media Clock Drivers
│   │   ├── mediaTypes.ts            # MediaClockDriver interface & URL source classifier
│   │   ├── html5MediaDriver.ts      # Native <video> adapter for local MP4/WebM & dropped blobs
│   │   ├── youtubeMediaDriver.ts    # YouTube IFrame API adapter with 60fps drift extrapolation
│   │   └── proceduralMediaDriver.ts # 60fps virtual clock for procedural:// blueprint simulator
│   ├── hooks/                       # Layer 3: Dual-Tier State & Bridge Hooks
│   │   ├── useMediaClock.ts         # Transport controls, frame-stepping ([ / ]), loop-shot, hotkeys
│   │   ├── useStageFrameLoop.ts     # 60fps ref evaluation tick + ~10Hz throttled React UI sync
│   │   ├── useFileDropLoader.ts     # Drag-and-drop & file picker loader for .yaml and .mp4 pairs
│   │   ├── useScorePersistence.ts   # Startup hydration, draft auto-saving & confirmed reset
│   │   ├── useWorkspaceLayout.ts    # Split workspace presets, column percentages & storage sync
│   │   ├── useStudioDisplaySettings.ts # 3D diorama label modes, guides, DoF blur & 'L'/'G'/'B' hotkeys
│   │   ├── useToastNotifications.ts # Floating toast notification queue & auto-dismiss timers
│   │   ├── useIsMobile.ts           # Zero-polling responsive mobile breakpoint tracker (<768px)
│   │   └── useAppShellTheme.ts      # SceneFlow theme hook (Auto/Dark/Warm/Light) & transition suppression
│   ├── stage/                       # Layer 4: React Three Fiber 3D Blueprint Diorama
│   │   ├── dioramaTheme.ts          # Adaptive theme clear colors, fog & metric grid line mapping
│   │   ├── cameraPresets.ts         # Directorial angle presets (Top, Iso, Front, Side) & spherical math
│   │   ├── DioramaCanvas.tsx        # Root R3F <Canvas>, lighting, fog, and priority -1 frame ticker
│   │   ├── BlueprintStageScene.tsx  # Shared lighting, metric floor grid, and mannequins
│   │   ├── BlueprintFloorGrid.tsx   # Metric floor grid (1m / 0.25m), perimeter frame & compass labels
│   │   ├── ObserverCameraRig.tsx    # Viewport PerspectiveCamera + OrbitControls handover & POV cuts
│   │   ├── StageCameraRig.tsx       # 3D camera prop, rectangular gate frustum, sliding focus plane & path line
│   │   ├── StageCameraFocusRig.tsx  # 3D Near/Far DoF limit brackets & emerald off-axis focus tether
│   │   ├── StageCameraOffsetTether.tsx # 3D cyan anchor beacon & dashed tether line for target offsets
│   │   ├── StageCameraRigMount.tsx  # Physical 3D tripod stands, floor rails & wheeled dolly cart
│   │   ├── StageCamViewRig.tsx      # Stage Camera POV lock controller for procedural monitor
│   │   ├── StageCamDofEffect.tsx    # Opt-in single-pass WebGL2 thin-lens Depth-of-Field blur effect
│   │   ├── StageCamMonitorCanvas.tsx# True 3D Stage Cam monitor with optical safe-action HUD & DoF blur toggle
│   │   ├── DirectionalMannequin.tsx # Stylized character/prop proxies with rigid anatomy, telescoping torso, facing visor & floor trails
│   │   ├── labelLodMath.ts          # Pure 3D billboard label distance LOD, opacity hierarchy & z-index math
│   │   └── StageBillboardLabel.tsx  # Crisp 3D HTML floating identity badges & distance-collapsed glowing dots
│   ├── ui/                          # Layer 5: 2D Directorial UI Shell
│   │   ├── tokens/                  # SceneFlow-aligned design tokens
│   │   │   └── ui.ts                # Centralized UI_TOKENS for layout, pills, buttons & modals
│   │   ├── header/                  # Modular 3-wing studio header submodules
│   │   │   ├── FileMenuDropdown.tsx # Tiered File ▾ popover menu (Open, Export, New, Manage, Guide)
│   │   │   ├── LayoutSegmentedControl.tsx # Centered segmented split workspace layout switcher
│   │   │   ├── ActiveScoreIndicator.tsx # Interactive active score context chip with 1-click library open
│   │   │   └── ThemeSelectorDropdown.tsx # Accessible 4-mode theme switcher (Auto, Dark, Warm, Light)
│   │   ├── left-panel/              # Modular left column submodules
│   │   │   ├── VideoWorkspaceSubpanel.tsx # Collapsible Scene Desk container with [Brief | Stage Cam] header toggle
│   │   │   ├── SceneProductionBrief.tsx   # Executive Scene Production Sheet & Call Sheet (Premise, specs, lenses)
│   │   │   ├── SceneMetadataCard.tsx      # Collapsible scene-wide metadata card (music, gear, notes, markdown)
│   │   │   └── SceneEntityRoster.tsx      # Categorized Cast, Props & Markers lineup with dimension badges
│   │   ├── editor/                  # Modular CodeMirror 6 YAML Score Studio submodules
│   │   │   ├── index.ts             # Barrel exports for editor studio components
│   │   │   ├── YamlStudioPanel.tsx  # In-flow right-column choreography score studio container
│   │   │   ├── YamlEditorHeader.tsx # Top header with title, sync badge, Guide trigger & close
│   │   │   ├── YamlActionBar.tsx    # Directorial action bar (Wrap toggle, Copy, Fork)
│   │   │   ├── YamlDiagnosticsBanner.tsx # Diagnostic alert banner with line/col jump
│   │   │   ├── YamlEditorCanvas.tsx # CodeMirror 6 DOM mounting & virtualized canvas
│   │   │   ├── useCodeMirrorTheme.ts # Dynamic theme extension for Dark/Warm/Light/Pure Black
│   │   │   └── useYamlEditor.ts     # Compartments, external sync guard & ~150ms debouncer
│   │   ├── guide/                   # In-app choreography score & script specification manual
│   │   │   ├── index.ts             # Barrel exports for guide documentation views
│   │   │   ├── ScoreAuthoringGuideView.tsx # Standalone Markdown + KaTeX manual view (?mode=guide / ?mode=spec)
│   │   │   ├── GuideSidebarToc.tsx  # Two-tier H2/H3 table of contents sidebar with scroll spy
│   │   │   ├── guideMarkdownComponents.tsx # Custom markdown element renderers (h1-h3, pre, table)
│   │   │   └── guideUtils.ts        # Section anchor mappings, recursive text & slug extractors
│   │   ├── library/                 # Modular score library submodules
│   │   │   ├── ScoreLibraryCard.tsx # Cinematic choreography score card with color tags & telemetry
│   │   │   ├── ScoreInspectorPane.tsx # Rich master-detail choreography inspector & action bar
│   │   │   ├── ScoreStageMinimap.tsx # Pure 2D vector SVG top-down stage schematic preview
│   │   │   └── MobileScoreLibraryModal.tsx # Full-screen touch-optimized mobile score switcher (<768px)
│   │   ├── transport/               # Modular directorial transport bar submodules
│   │   │   ├── DirectorialTimelineTrack.tsx # Scrubber track, shot ticks, hover tooltip & emerald loop brackets
│   │   │   ├── DirectorialShotChipsStrip.tsx # Auto-centering shot chips, edge fade masks & hidden scrollbar
│   │   │   └── DirectorialTransportDeck.tsx # Unified centered island deck (Play/Pause, timecode, loop, speed)
│   │   ├── WorkspaceHeader.tsx      # SceneFlow-aligned 3-wing orchestrator header bar
│   │   ├── ScoreLibraryModal.tsx    # Accessible 2-column master-detail score library & project hub
│   │   ├── AppInfoModal.tsx         # Accessible About, shortcuts, creative intent & documentation modal
│   │   ├── ResizableSplitWorkspace.tsx # Draggable 3-column studio container (30/40/30) with dual dividers
│   │   ├── DioramaOverlayContainer.tsx # Center stage responsive HUD overlay dock
│   │   ├── CompactDioramaHeader.tsx # Unified compact diorama header (<768px)
│   │   ├── CameraModeSwitcher.tsx   # Tactile 3-way POV mode switcher (Scripted, Free Orbit, Stage Cam)
│   │   ├── CameraPresetControls.tsx # 1-click angle snaps with isometric 3D ViewCube SVG icons
│   │   ├── UniversalVideoViewport.tsx  # Local video, YouTube IFrame, or 60fps Stage Cam Simulator
│   │   ├── ShotBreakdownHud.tsx     # Top-left active shot, lens, maneuver & staging note overlay
│   │   ├── shotBreakdownUtils.ts    # Target resolver, 3D offset formatting & film gate helpers
│   │   ├── CameraTelemetryCapsule.tsx  # Dual-camera telemetry pill with [OBS|CAM] switch & 1-click YAML copy
│   │   ├── CameraTelemetryHoverCard.tsx # Precision degrees, meters, focus & aperture hover inspection card
│   │   ├── telemetryYamlFormatter.ts   # Pure generator for scoped `camera:` and `observer_camera:` snippets
│   │   ├── DirectorialTransportBar.tsx # Shot-marker scrubber, shot chips, speed (0.25x-2x) & POV toggle
│   │   ├── YamlInspectorDrawer.tsx  # Slide-out live YAML editor with read-only protection & fork-on-edit
│   │   ├── ToastContainer.tsx       # Floating animated toast notification banners
│   │   ├── LabelDisplayModeToggle.tsx # Floating 3-mode 3D diorama label toggle (All / Cam / Off)
│   │   ├── StageCamViewfinderOverlay.tsx # Optical film gate, look-around mask & composition guides
│   │   ├── ConfirmResetModal.tsx    # Accessible confirmation dialog modal for discarding drafts
│   │   ├── ConfirmRemoteScoreModal.tsx # Accessible confirmation & conflict dialog modal for external/remote scores
│   │   ├── StorageStatusBadge.tsx   # Visual status badge (Bundled vs. IndexedDB draft)
│   │   └── InteractiveStudioApp.tsx # 3D choreography diorama & split workspace orchestrator
│   ├── App.tsx                      # Code-split root mode switcher & suspense router
│   ├── main.tsx                     # Application entry point
│   └── index.css                    # Tailwind CSS v4 + blueprint design tokens
└── tests/
    └── unit/                        # Vitest deterministic unit test suites
        ├── opticsMath.test.ts
        ├── sphericalMath.test.ts
        ├── cameraRigs.test.ts
        ├── entityEngine.test.ts
        ├── frameEngine.test.ts
        ├── scoreParser.test.ts
        ├── scoreContract.test.ts
        ├── scoreYamlUtils.test.ts
        ├── scoreUrlLoader.test.ts
        ├── telemetryYamlFormatter.test.ts
        ├── shotBreakdownUtils.test.ts
        ├── guideUtils.test.ts
        ├── guideSnippets.test.ts
        ├── storage.test.ts
        ├── multiTargetFraming.test.ts
        ├── mediaDrivers.test.ts
        ├── billboardLabelLod.test.ts
        ├── useIsMobile.test.ts
        └── recorder.test.ts
```

