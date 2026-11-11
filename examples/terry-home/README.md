# Show Home

This example is based on [Terry's Home](https://terryhu.cn). Run `python3 tools/serve.py` in the repository root, then open `examples/terry-home/` in the browser.

## Implementation

When the user has not specified dimensions or materials, refer to similar objects in this example.

The character uses the original site's `assets/terry-skin.png`, configured through `home.config.js`. The engine's default green-hoodie character is untouched; visitors arriving from other worlds keep their own skin.

## File Index

| Feature | Implementation |
|---|---|
| House, wall hiding and roof access | `world/house.js` (`buildShell`), `HOUSE` in `world/layout.js` |
| Pool, swimming and diving | `buildPool` in `world/house.js`; `POOL`, `POOL_LADDER`, `POOL_LAMPS` in `world/layout.js` |
| Stairs and upper floor | `LOFT`, `STAIRS`, `floorAt` in `world/layout.js` |
| Furniture: desk setup, sofa, TV, kitchen, gym equipment, bed | `world/furnish.js` |
| Plants: fiddle-leaf fig, monstera, bird of paradise | `world/plants.js` |
| Paintings, whiteboard, screens, diploma | `world/paint.js` |
| Car | `world/car.js` |
| Cat and dog | `PETS` in `world/layout.js` |
| Scoreboard clock, fireplace, TV screen | `surfaces` in `world/furnish.js` |
| Mountain with stone steps, pier and sailboat | `world/mountain.js`, `world/outer.js` |
| Outdoor stairs to the roof | `world/roof-access.js` |
| Vertical-jump tester and its animation | `world/vertec.js` and `setup` in `world/build.js` |
| Portal | `PORTAL` and the `portal` station in `world/layout.js`; appearance handled by `engine/world/gate.js` |

When reusing an object, check its coordinates and dependent constants.

## Colours and Materials

This example mainly uses light oak, black steel and dark green marble. Keep two to three main materials per space by default; the user's requested style takes priority.
