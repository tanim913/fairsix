# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Plain static HTML/CSS/JS, no build step (same pattern as the owner's Shadowlatch project). Firebase Realtime Database + Anonymous Auth on a new free Spark project, Firebase SDK vendored as one ES module. Hosted on GitHub Pages at tanim913.github.io/fairsix. An Android APK wraps the hosted site in a WebView.

## Users

Friends and family playing Ludo together on their phones, in the same room or apart, who suspect commercial Ludo apps of favouring some players. They want a quick private game with people they invite, with no sign-up.

## Product Purpose

Fairsix is an online Ludo-style board game for 2 to 4 anonymous players in a private room opened with a numeric code. It has two rule sets, Classic and Arrow. Its reason to exist is dice that nobody can rig, and that anyone can check afterwards. Success: a group goes from "let's play" to the first roll in under a minute, and any player can verify that every roll in the game was fair.

## Positioning

Provably fair dice. Every player's device commits secret random values before the game starts, and each roll combines all of them, so no player, host, server or developer can choose or predict a roll. There are no levels or paid boosts. Re-rolls exist only as an equal allowance the host sets for everyone (0, 1, 3 or 5), each re-roll is itself a sealed roll, and discarded rolls stay in the proof, so no player can get better dice than another. The full roll log and per-face counts are visible to everyone.

## Operating Context

- Mostly phones in portrait, often passed around or played in a group chat. Also tablets and desktop browsers, plus the Android APK.
- Room codes are numeric (6 digits) and shared by voice, chat or screenshot.
- Rolls need the other players' devices online for a moment. A device that goes quiet is skipped after a short wait and can come back.

## Capabilities and Constraints

- Create a room (choose mode Classic or Arrow and 2–4 seats), or join by a 6-digit code. The host starts when at least 2 players have joined. No accounts; players get optional nicknames and default to their colour.
- Classic rules (from analysis of Ludo Star's own rule text): a 6 is needed to leave the base; a 6 gives another roll; a third 6 in a row ends the turn; capturing gives another roll; reaching home gives another roll; star and start squares are safe; two tokens of the same colour on one square cannot be captured but do not block; an exact count is needed to reach home; first to bring all 4 tokens home wins, and others play on for places.
- Arrow rules (from the user's Ludo Star screenshot and rules, 26 Nov 2026): Classic rules plus one U-shaped arrow per colour; its tail is the track square two before that colour's home lane, its head the lane's first square; landing exactly on the tail flies the token into its lane and gives another roll (the extra roll is from Ludo Star's own rule text); passing over does nothing; the four diagonal arrows at the inner corners work for every colour, moving a guti that lands exactly on the tail one square on with another roll (confirmed by Ludo Star's rules screen, 26 Nov 2026); all four tokens home to win. A "Quick Arrow" variant (one token home wins, capture to unlock the lane) exists in Ludo Star but is not built.
- Wording: the app says "token" for a playing piece (26 Nov 2026; the user's word "guti" was used earlier and remains in code names and comments only).
- Game state is an append-only action log replayed by every client; rules are enforced identically on every device.
- Spark plan: no Cloud Functions, no server code.
- Each player picks a cosmetic die skin (Glass, Marbles, Kitty, Mochi, Starry) that others see; skins never enter a roll.
- Subtle synthesised sound effects and Android vibration for rolls, hops, captures, home and wins, with a mute toggle. Every seat shows that player's latest roll live.
- Play the computer (26 Nov 2026): 1v1 on one device, no server. Same rules, same re-rolls, same hash-chain dice (the player's and the computer's chains both seal every roll, so Proof works). The computer sees only the board (js/bot.js); levels Easy (plays for fun) and Sharp (plays to win). No turn clock. The game is saved on the device and can be continued.
- Rooms idle for 7 days are purged weekly by a GitHub Action; on request with a local script.

## Brand Commitments

Name: Fairsix (chosen by the user). The look must be original, not a copy of Ludo Star's art. Visual constraint from the user: "cute but grown-up": warm, soft and charming, but tidy and refined; not childish, not cartoon candy.

## Evidence on Hand

None. No users, testimonials or statistics exist; none may be invented. The fairness claim rests on the published protocol and open code only.

## Product Principles

1. Fair is checkable: every roll is verifiable from the log, not just asserted.
2. Nothing buys luck: no feature changes anyone's dice. Re-rolls, when on, are equal for every player and visible to all. Die skins are looks only.
3. Seconds to play: one tap to make a room, one code to join, no sign-up.
4. Rules you can see: the current rules and why a move is or isn't allowed are always clear on the board.

## Accessibility & Inclusion

Works at 320px wide, touch targets at least 44px, colour is never the only cue for a player (each colour also has a shape/label), respects reduced motion, keyboard operable on desktop.
