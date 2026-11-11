# Building Yarn Planet with Claude Opus 5.5

> The first version took a single evening. Over the next few days, we added multiplayer, cut a trailer, published it to 5 platforms, and open-sourced the code. At the end of this post is a prompt you can use to build a little planet of your own.

- Play in browser: https://yarn.ynot.games/ (works on desktop and mobile)
- Trailer: https://www.youtube.com/watch?v=EATwc16lWoM
- Source code (MIT License): https://github.com/makerjackie/yarn-planet

![Yarn Planet title screen: glowing threads left behind by real players across the sphere](https://raw.githubusercontent.com/makerjackie/yarn-planet/main/docs/media/title-live-en.jpg)

## A tiny planet you light up by walking

You carry a spool of yarn bigger than your head and wander across a small planet drawn like a pencil sketch. Every step you take leaves a single thread of yarn behind.

Run a line from the generator to the lighthouse, lead water from the hilltop spring down to the waterwheel, or string up lights between two lampposts on the old street. The moment a line connects, color washes outward from that spot like watercolor, and the sleeping town wakes up bit by bit.

![A black-and-white pencil sketch before connecting, and watercolor-like hues spreading across the town once connected](https://raw.githubusercontent.com/makerjackie/yarn-planet/main/docs/media/sketch-to-color.jpg)

![Walking across the hillside with a giant spool, laying a water line all the way to the waterwheel](https://raw.githubusercontent.com/makerjackie/yarn-planet/main/docs/media/lay-thread.jpg)

Nothing in the game is an imported image or audio recording. Houses, characters, the lighthouse, rolling waves, and every sound effect are all generated in code.

## Building the first version in 3.6 hours

Before we started, Claude and I already had a foundation we had written from scratch. It came from an earlier study project where we rebuilt abeto's Messenger as a credited, non-commercial exercise to learn how tiny-planet games work: spherical walking and collision, a camera that automatically steers around walls, outline rendering, local saves, and five languages. This time, we decided to build an original piece on top of it.

We started by talking the theme through properly. Claude's initial proposal was still about delivering letters. I pushed back with a question: would that really resonate with players around the world? After a few rounds of back-and-forth, we settled on an action anyone can understand without words—the path you walk becomes the thread itself.

Once the direction was set, the workflow was straightforward:

1. Opus 5.5 wrote the design document first: a one-sentence pitch, design pillars, color palettes, latitude and longitude coordinates for each zone on the sphere, the progression of nine threads, and nine characters.
2. Next, it wrote a module contract that split the codebase by directory into world, characters, thread mechanics, visual effects, UI strings, and procedural audio.
3. Five Sonnet subagents worked in parallel on their own git branches.
4. Opus handled merging and tuning, ran unit tests, captured screenshots, and ran an automated playtest script that only pressed WASD and E to play from start to finish and verify the chapter was completable.

From our initial discussion to putting Chapter 1 online took about 3.6 hours. I did not write a single line of code. My job was to set the direction, playtest, give feedback, and make decisions.

## Keeping everyone's footsteps on the same planet

Once the first version was playable, we wanted the planet to feel a little more connected. Claude suggested an idea: let the paths walked by every player stay on the same planet.

One person walking leaves a single trail; when many people walk across it, their threads gently wrap the entire globe. The image below was rendered with simulated paths and also serves as the opening shot of the trailer:

![When many players' paths intertwine, the whole planet is wrapped in colorful yarn (simulated effect)](https://raw.githubusercontent.com/makerjackie/yarn-planet/main/docs/media/woven-planet.jpg)

If you open the live title screen today, the glowing lines on the sphere are the actual paths walked step by step by real players.

Multiplayer follows the same quiet approach. Powered by a single Cloudflare Durable Object, players in the same room can see each other strolling around. When you cross paths, you can choose from four preset greetings, with no open text chat.

![Running into another player under a big tree and sending a simple greeting](https://raw.githubusercontent.com/makerjackie/yarn-planet/main/docs/media/meet-en.jpg)

## Trailer, release, and open source

The trailer was captured directly from live gameplay. A recording script took over the game clock, advancing time by 1/60 of a second per captured frame so every 4K frame came out crisp. We then used ffmpeg to cut the footage to a timeline, burn in subtitles, and mix the music. Gemini drafted the release copy, and the yixiaoer CLI distributed the video in one go to the five platforms: Douyin, Bilibili, Xiaohongshu, WeChat Channels, and YouTube. On every platform, we clearly labeled the AI-generated content and simulated footage.

Finally, we released the source code under the MIT License. Before making the repo public, we ran a dedicated code audit: comparing our code section by section against the projects we had studied, cleaning out reference materials, and listing all third-party licenses in full.

## By the numbers

- First version live: one evening, about 3.6 hours
- Through trailer release: about 11 hours of total work spread across 5 days, 69 commits
- Token usage: about 770M tokens processed in total, mostly cached context read repeatedly; about 840K output tokens generated (about 580K Opus and about 260K Sonnet)

## Want to build a planet of your own?

I distilled this workflow into a single prompt. Replace the `【…】` placeholders with your own idea and hand it to an AI coding tool that can read and write files and run commands—such as Claude Code, Codex, or Cursor—to get started:

```text
You are a senior game developer and tech lead. We are building an original "small planet" browser game: the player roams freely around a tiny planet they can walk all the way around, in a low-poly cartoon style, playable in desktop and phone browsers with no install.

## My idea
- Core verb (the one thing the player keeps doing): 【e.g. carry a spool; the path you walk becomes a colored thread】
- A visual hook anyone gets at a glance: 【e.g. unconnected areas are a pencil sketch; connecting floods them with watercolor】
- World and mood: 【e.g. a quiet, warm, slightly funny seaside town】
- Chapter 1 scope: one small planet, 3 districts, 8–10 goals
- Languages: 【e.g. English, 简体中文】
- Games I love: 【list a few】. Borrow the feeling only; never copy their assets, code, characters or story.

## How we work
1. Don't write code yet. Discuss the theme with me: is it a reskin of another game? Would players anywhere understand it without words? Give me 2–3 directions with your recommendation and wait for my decision.
2. Write docs/DESIGN.md: one-line pitch, design pillars, palette (hex values), planet layout (key objects as latitude/longitude), rules, chapter-1 flow, cast. Show it to me.
3. Write src/contracts.ts with module boundaries, then split the work by folder into parallel workstreams (world, characters, core mechanic, look and effects, UI/text/audio). If you can spawn subagents, give each one folder in its own git worktree; you integrate.
4. Make chapter 1 playable start to finish first, then polish. End every round with screenshots, test results and what you are unsure about.

## Technical requirements
- TypeScript + Vite + three.js, three-mesh-bvh for collision queries, deployable to Cloudflare Workers.
- The planet center stays at (0,0,0) and gravity points to it. The player is a capsule with real 3D collision against the full collider mesh; fixed-step physics, interpolated for rendering, physics pose kept separate from render pose.
- Parallel-transport the heading across the sphere so it never twists. The follow camera can be dragged and zoomed, shortens against walls, rises over low clutter, and shows the other character's face in conversations.
- Build every model in code from primitives; no imported models or textures. Toon lighting + outlines + one palette. InstancedMesh for repeats. Under 250 draw calls and 500k triangles on desktop.
- Synthesize all sound with Web Audio. Put all text in language tables. Save to localStorage. Support keyboard, mouse and touch.

## Verification
- npm test and npm run build must pass; check desktop and phone screenshots with Playwright.
- Write a playtest script that finishes the chapter with ordinary keys only. Debug teleports are for checking visuals, never proof that the game can be finished.

## Originality and licenses
- Never use another game's assets or code; third-party code only under permissive licenses such as MIT, and keep a list. Name your inspirations in the credits.
```

Once Chapter 1 plays smoothly from start to finish, you can ask it to add multiplayer (using a Durable Object to sync positions and preset greetings) and trailer capture (stepping a virtual clock frame by frame and assembling the video with ffmpeg).

Looking back on this project, a few practical takeaways stood out:

1. **Talk the theme through before building.** Asking "is this actually good?" one more time often pushes a reskinned idea into original territory.
2. **Pair one core action with a visual that reads at a glance.** It serves as both the core mechanic and the clearest shot in your trailer.
3. **Generate everything in code.** It removes asset licensing worries and keeps the visual style naturally cohesive.
4. **Humans guide the taste; AI handles the implementation.** I only described what felt off and what mood I wanted, leaving the specific implementation to the AI.
5. **Inspect real frames and label things honestly.** All-green tests do not guarantee the screen is actually moving, and if a shot is a simulation, state clearly that it is simulated.

Feel free to take a walk on this little planet and leave a thread of your own.

— Maker Jackie (@maker_jackie)
