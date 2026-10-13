# DUEL ARENA smartphone WEB app

- This is a WEB app opened by URL on iPhone and Android. Do not add native projects, APK/IPA builds, Apple signing, or Capacitor.
- Never edit or push to nagisa793/card_game or its existing Sites project.
- Preserve the original rules, card designs, artwork, BGM, phase transitions and user actions.
- Treat web/ as a read-only upstream mirror. Use npm run sync:web to update it and retain upstream.json hashes.
- Put smartphone display and touch changes in app/. Preserve landscape orientation, safe areas and readable complete descriptions.
- Keep renderers and touch targets on the same real viewport coordinates. Do not resize the field with CSS transforms or synthesize click coordinates.
- Run npm run check after relevant changes. Mobile interaction tests run when the upstream game or the APP interface changes.
- Publish www/ to the APP URL. Keep one-way automatic WEB synchronization and publication working.
