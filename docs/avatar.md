# Character and Skin

Opening a website directly uses its configured character. Visiting another website through a portal keeps the departure skin, including across reloads and further portal visits. Opening a website directly again uses that website's character.

## AI Implementation Requirements

1. Use a **64×64 PNG skin with standard four-pixel-wide arms**, save it as `assets/me.png`, and set `skin: 'assets/me.png'` in `home.config.js`. Use `assets/skin-template.png` as a reference. The 64×32 and slim three-pixel-arm formats are not supported.
2. Keep the engine's body size, UVs, joints and animations. The character is 1.8 m tall; a hat can go on the head's second layer. Only this PNG travels cross-site. There is no cross-site protocol for a clothing second layer, separate accessories, custom rigs or models.
3. Load custom skins through configuration and keep the released `engine/world/skin.js`. On every receiver, `skin=default` means Homecraft's default green-hoodie character.
4. PNG files are capped at **18,000 bytes**, at most 24,000 characters when encoded. The engine checks the PNG signature, the IHDR size and the decoded image, then redraws it without metadata before carrying it.
5. The player model uses the result of `traveller.wornSkin()`. The about card, phone profile and Dock avatar retain the website author's information. `setup()` must not replace the received visitor skin.
6. Use [portal protocol v1](protocol.md). Set `homecraft: true` only after the destination integrates the protocol, and verify that it receives the skin correctly.

If a file fails to load, times out or has an unsupported format, use the default character and carry it on subsequent visits. Received skins are used only for local rendering; no visitor scripts run.

## Adding to an Existing Three.js Site

`engine/door-protocol.js` has no Three.js dependency. Host the file and call `createTravelSession(ownerSkinURL, defaultGreenHoodieSkinURL)` to create a session. At startup, call `arrive()`, then `await wornSkin()` to get the skin `url` for your model. To leave, generate a link with `await link({ url, homecraft: true })`, then call `navigateDoor(href)`.

Existing websites and blogs can use the [portal plugin](../plugin/). The plugin also provides `visitorSkin()`, letting a 3D website read the visitor's skin.

## Checking

Run `npm run check:site` to check skin format, unexpected transparency and arm width. Run `npm run check:portal` to check cross-site visits.
