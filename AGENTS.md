# DUEL ARENA smartphone WEB app

- This is a WEB app opened by URL on iPhone and Android. Do not add native projects, APK/IPA builds, Apple signing, or Capacitor.
- Never edit or push to nagisa793/card_game or its existing Sites project.
- Preserve the original rules, card designs, artwork, BGM, phase transitions and user actions.
- Treat web/ as a read-only upstream mirror. Use npm run sync:web to update it and retain upstream.json hashes.
- Put smartphone display and touch changes in app/. Preserve landscape orientation, safe areas and readable complete descriptions.
- Keep renderers and touch targets on the same real viewport coordinates. Do not resize the field with CSS transforms or synthesize click coordinates.
- Run npm run check after relevant changes. Mobile interaction tests run when the upstream game or the APP interface changes.
- Keep one-way automatic WEB synchronization working. The primary deliverable is the browser game at https://nagisa793.github.io/card_game_app/ on GitHub Pages. Deploy the verified www/ build using the github-pages job in Sync WEB app. Preserve the original WEB and the existing Sites previews.

- The user uses the word local to mean opening the GitHub game URL directly. Do not require a localhost launcher or ZIP to play at the primary URL. Preserve local_web.py and Start_card_game.command as optional tools, and never claim a server is already running on the user’s Mac.

- Default to localhost:8766 bound to 127.0.0.1. The Mac ZIP includes both server runtimes, selected automatically; no native game UI or mobile native project. Preserve the optional --host 0.0.0.0 LAN mode.
- Before distributing a localhost release, run the rules and touch checks, test the actual bundled launcher on both Mac architectures, and retain the exact tested APP commit in build-info.json.
