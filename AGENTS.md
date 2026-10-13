# DUEL ARENA APP

This repository is the smartphone APP edition of nagisa793/card_game.

- Never edit or push to the original WEB repository or the existing Sites project.
- Keep the original rules, card designs, artwork, BGM, phase transitions and user actions unchanged.
- Treat web/ as an exact read-only upstream mirror. Use npm run sync:web to update it; the script only reads the WEB repository. Preserve upstream.json file hashes.
- Put smartphone-specific display and touch adjustments in app/, and native platform changes in android/ or ios/.
- Keep landscape orientation, safe areas, readable full card descriptions and direct field/card taps working on small phones.
- Do not resize the field with CSS transforms or synthesize click coordinates. Both renderers and DOM targets must use the same actual viewport coordinates.
- Run npm run check after relevant changes. Preserve the upstream rule regression tests. Native builds and mobile viewport interaction tests run in .github/workflows/app.yml.
- Keep one-way automatic synchronization from WEB to APP. Preserve app/ and native files when copying WEB updates.
- iPhone real-device installation requires Apple signing. A simulator build does not establish that a signed IPA is available.
