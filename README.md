# Fairsix

**Play: [tanim913.github.io/fairsix](https://tanim913.github.io/fairsix/)** · Android: see [Releases](https://github.com/tanim913/fairsix/releases)

Ludo for 2 to 4 friends in a private room, with dice nobody can rig. Make a room, share the 6-digit code, play. No accounts.

## Modes

- **Classic:** a 6 brings a guti out. Every 6, capture, guti home or arrow earns another roll, and owed rolls come first: dice stack up (6 + 6 + 3) and then the player picks a die and a guti until the dice are used. A third 6 in a row cancels the turn. Two players sit bottom-left and top-right. Other rules: start and star squares are safe, two guti of one colour protect each other, exact count to get home. First with all four home wins; the rest play on for places.
- **Arrow:** Classic rules plus one U-shaped arrow per colour. Its tail is two squares before your home lane; land exactly on it to fly straight into your lane and roll again. Passing over it does nothing. All four guti home to win.
- **Re-rolls:** the host picks 0, 1, 3 or 5 per player. Everyone gets the same number; a re-roll is a new sealed roll and the discarded one stays in the proof.

## How the dice stay fair

1. When you join, your device picks a secret seed and builds a hash chain from it: `x[N] = seed`, `x[i-1] = SHA-256(x[i])`. Only the end of the chain, `x[0]`, is published (your seal).
2. For roll `k`, every other player's device reveals `x[2k-1]` as soon as roll `k` is next. The roller then rolls by revealing their own `x[2k]`.
3. Every revealed value is checked against its seal (hashing it must lead back to `x[0]`), so nobody can change a value after joining, and nobody sees another player's value before it is revealed.
4. The face is `SHA-256("fairsix|v1|room|k|" + seat:value, ...)`: the first byte below 252 gives `byte % 6 + 1`, so each face has probability exactly 1/6.
5. If a phone goes quiet, the roll waits 4 seconds and then goes ahead with the others (at least one other player is always required).

Nothing about a player (history, wins, device, chosen die skin) goes into a roll. The **Proof** sheet in a game lists every roll with the players who sealed it and rechecks all of them in the browser.

## How it works

- Static site (GitHub Pages), no build step: `index.html`, `css/`, `js/`, vendored Firebase SDK in `vendor/`.
- Firebase Realtime Database with anonymous sign-in. Each room holds an append-only action log; every device replays it with the same rules (`js/rules.js`), so all devices agree on the board.
- `database.rules.json` enforces: rooms readable only by code, seats locked once the game starts, write-once log entries stamped with server time, reveals only by the seat's owner, and a roll may not leave out a player whose reveal is already in.
- Sounds are synthesised with the Web Audio API; vibration uses the Vibration API (Android).
- `android/` wraps the site in a WebView app (`com.tanimaziz.fairsix`).

## Development

```
python3 -m http.server 8765          # then open http://127.0.0.1:8765/
node --test tests/*.test.mjs         # rules and fairness tests
```

Deploy database rules: `npx firebase-tools deploy --only database --project fairsix-xh2wo`

Rebuild the vendored SDK: `npm i firebase esbuild && npx esbuild vendor/entry.js --bundle --minify --format=esm --target=es2020 --outfile=vendor/firebase.js`

Build the APK (needs JDK 17+ and the Android SDK): `cd android && ./gradlew assembleRelease`. Release signing reads `~/.fairsix-release/key.properties`, which is not in the repo.

Before committing site changes, run `node scripts/stamp.mjs`: it puts one version stamp on every file the page loads and writes `version.json`, so browsers never mix old and new modules. Each game records `RULES_VERSION` (js/rules.js) and phones on a different version refuse to play it; bump it whenever a rule changes.

Rooms older than 12 hours can be overwritten by a new room with the same code; old rooms can be purged from the Firebase console.
