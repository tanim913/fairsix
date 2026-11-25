---
name: Fairsix
description: Private Ludo with provably fair dice, set in clear glass and kancha marbles.
colors:
  mint-frost: "#e4eeea"
  frost-deep: "#d3e2dc"
  glass-surface: "#f8fcfb"
  tile-white: "#ffffff"
  board-sage: "#9fbdb3"
  ink-navy: "#0f1b33"
  ink-slate: "#33435f"
  line-sage: "#a9c0b8"
  ruby: "#d0263f"
  bottle-green: "#12804f"
  amber: "#e39a00"
  cobalt: "#1f45d6"
  live-violet: "#7b2ff7"
  bottle-glass-dark: "#0c1a1e"
  frost-deep-dark: "#10242a"
  glass-surface-dark: "#152a30"
  tile-dark: "#2b4b53"
  board-dark: "#18323a"
  ink-dark: "#eaf3f0"
  ink-2-dark: "#b4c8c3"
  line-dark: "#34515a"
  ruby-dark: "#ff4d66"
  bottle-green-dark: "#2fc27d"
  amber-dark: "#ffb526"
  cobalt-dark: "#5a7dff"
  live-violet-dark: "#b484ff"
typography:
  display:
    fontFamily: "Gabarito, ui-rounded, system-ui, sans-serif"
    fontSize: "clamp(32px, 8.5vw, 60px)"
    fontWeight: 900
    lineHeight: 1.02
    letterSpacing: "-0.035em"
  room-code:
    fontFamily: "Gabarito, ui-rounded, system-ui, sans-serif"
    fontSize: "clamp(48px, 15vw, 72px)"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "0.06em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Gabarito, ui-rounded, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 900
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Gabarito, ui-rounded, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 900
    letterSpacing: "-0.01em"
  roll:
    fontFamily: "Gabarito, ui-rounded, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 900
    letterSpacing: "0.01em"
  button:
    fontFamily: "Gabarito, ui-rounded, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 800
  body:
    fontFamily: "Gabarito, ui-rounded, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.45
    fontFeature: "tnum"
  lede:
    fontFamily: "Gabarito, ui-rounded, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 500
    lineHeight: 1.45
  label:
    fontFamily: "Gabarito, ui-rounded, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.02em"
  caption:
    fontFamily: "Gabarito, ui-rounded, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
    lineHeight: 1.3
rounded:
  sm: "12px"
  md: "18px"
  die: "24px"
  lg: "28px"
  pill: "999px"
  marble: "50%"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  gap: "16px"
  panel: "22px"
  lg: "28px"
components:
  button-primary:
    backgroundColor: "{colors.ink-navy}"
    textColor: "{colors.mint-frost}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "52px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink-navy}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "52px"
  button-outline-hover:
    backgroundColor: "{colors.frost-deep}"
  button-small:
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "44px"
  roll-pill:
    backgroundColor: "{colors.ruby}"
    textColor: "{colors.tile-white}"
    typography: "{typography.roll}"
    rounded: "{rounded.pill}"
    height: "76px"
  roll-pill-amber:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.ink-navy}"
  roll-pill-waiting:
    backgroundColor: "{colors.frost-deep}"
    textColor: "{colors.ink-slate}"
  room-pill:
    backgroundColor: "{colors.ink-navy}"
    textColor: "{colors.mint-frost}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "36px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.marble}"
    size: "44px"
  panel:
    backgroundColor: "{colors.glass-surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.panel}"
  input:
    backgroundColor: "{colors.tile-white}"
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.md}"
    padding: "0 18px"
    height: "54px"
  segment:
    backgroundColor: "{colors.tile-white}"
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.md}"
    height: "52px"
  segment-selected:
    backgroundColor: "{colors.ink-navy}"
    textColor: "{colors.mint-frost}"
  seat-chip:
    backgroundColor: "{colors.glass-surface}"
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.md}"
    padding: "7px 12px 7px 8px"
    height: "52px"
  seat-chip-compact:
    backgroundColor: "{colors.glass-surface}"
    rounded: "{rounded.md}"
    padding: "6px 4px 7px"
  die-well:
    backgroundColor: "{colors.glass-surface}"
    rounded: "{rounded.die}"
    size: "76px"
  seed-line:
    backgroundColor: "{colors.glass-surface}"
    textColor: "{colors.ink-slate}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "44px"
  tag:
    backgroundColor: "{colors.frost-deep}"
    textColor: "{colors.ink-slate}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  toast:
    backgroundColor: "{colors.ink-navy}"
    textColor: "{colors.mint-frost}"
    rounded: "{rounded.pill}"
    padding: "12px 20px"
  sheet:
    backgroundColor: "{colors.glass-surface}"
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.lg}"
---

# Design System: Fairsix

## Overview

**Creative North Star: "Kancha Glass"**

Fairsix is a game of glass marbles on a frosted table. Every guti is a kancha marble with an opaque coloured core, a clear rim, a big soft highlight and a small face that blinks; the board is a sheet of frosted glass laid with rounded white tiles; every roll is the players' sealed beads dropping into one die. The same bead form appears at every scale, from the 12px proof bead to the 92px winner's marble, and that repetition is the identity.

The tone is "cute but grown-up": warm, soft and charming, never cartoon candy. Charm lives in the objects (faces, blush, kitty ears on a die skin), while the chrome around them stays quiet: one ink, one frosted ground, pills and rounded panels, no decoration. Contrast is deliberately strong; the four marble colours run at full saturation against a pale mint ground in light mode and a bottle-glass ground in dark mode. The world refuses the glossy gold-framed 3D board on a purple gradient that commercial Ludo apps ship.

Density follows the phone: the board takes the full width, seats compress to one row of four chips above it, and the tray (die well plus a big Roll pill) sits under the thumb. Wider screens move seats, tray and roll log into a 340px column beside the board.

**Key Characteristics:**
- One bead form at every scale: marble guti, seat marbles, brand bead, proof beads, seal-and-mix beads.
- Every corner rounded; pills for actions, 18-28px radii for containers, rounded tiles on the board.
- Four full-saturation player colours plus one reserved violet that means "legal move" and nothing else.
- Gabarito at heavy weights (800-900) for anything you act on; tabular numerals everywhere.
- Motion is physical and short: hops, squash, tumble, land; all transform-only.

## Colors

A frosted-glass neutral ground carrying four saturated marble colours, with one reserved violet for legality.

### Primary
- **Ruby** (ruby; dark: ruby-dark): player colour 0. Also the colour of the 6 pips on the glass die, and of error messages.
- **Bottle Green** (bottle-green; dark: bottle-green-dark): player colour 1. Also the seal icon on the seed line.
- **Amber** (amber; dark: amber-dark): player colour 2. The only player colour that takes ink-navy text on the Roll pill instead of white.
- **Cobalt** (cobalt; dark: cobalt-dark): player colour 3. Also the brand bead, the focus ring, the text caret, focused input borders and the selection tint.

Player colours fill bases, home lanes, start squares, the centre petals, U-arrows, seat borders, timer bars and the Roll pill. They are never the only cue: every seat carries a name, and every colour has its own corner, lane and arrow.

### Tertiary
- **Live Violet** (live-violet; dark: live-violet-dark): reserved. It marks legal landing squares (26% violet fill, violet stroke breathing from full to 35% opacity over 1.1s) and movable guti (a white 3px ring wrapped by a 2.5px violet ring, plus a hop). Nothing else on screen may use it.

### Neutral
- **Mint Frost** (mint-frost; dark: bottle-glass-dark): the page ground and the text colour on ink-filled pills.
- **Frost Deep** (frost-deep; dark: frost-deep-dark): hover fills, tags, the waiting Roll pill, the empty timer track.
- **Glass Surface** (glass-surface; dark: glass-surface-dark): panels, sheets, seat chips, the die well, the seed line.
- **Tile White** (tile-white; dark: tile-dark): board track tiles, inputs, segmented options, the die picker cards.
- **Board Sage** (board-sage; dark: board-dark): the board plate showing through the 2px-equivalent gaps between tiles.
- **Ink Navy** (ink-navy; dark: ink-dark): all primary text, primary buttons, the room pill, toasts, star outlines. Marble eyes and die pips keep ink-navy in both themes because they are painted on objects, not chrome.
- **Ink Slate** (ink-slate; dark: ink-2-dark): secondary text, labels, captions, disabled Roll label.
- **Line Sage** (line-sage; dark: line-dark): 2px input and segment borders, dashed empty-seat outlines, scrollbars.

### Named Rules
**The One Live Colour Rule.** Violet means "you can go here / you can move this". It never decorates, never brands, never signals anything else.

**The Marble Owns Its Colour Rule.** A player colour appears only where that player is: their marble, base, lane, arrow, seat, timer and Roll pill. Chrome stays ink and frost.

**The Two Glasses Rule.** Light is mint-frosted glass; dark is bottle glass. Both themes swap every neutral and brighten the four player colours and violet; nothing else changes.

## Typography

**Display Font:** Gabarito (self-hosted variable woff2, weights 400-900), falling back to ui-rounded, system-ui, sans-serif
**Body Font:** Gabarito, same stack
**Label/Mono Font:** none; tabular numerals (`font-variant-numeric: tabular-nums`) are set on the body so codes, counts and roll numbers align.

**Character:** One rounded geometric sans used heavy and tight for anything the eye must catch (codes, Roll, names), and at 500 for reading. Its round terminals match the marbles.

### Hierarchy
- **Display** (900, clamp(32px, 8.5vw, 60px), widening to clamp(48px, 5vw, 72px) from 900px; line-height 1.02; -0.035em): the home headline only, max 14ch, balanced.
- **Room code** (900, clamp(48px, 15vw, 72px), line-height 1, +0.06em): the six-digit code on the lobby card, shown as "000 000".
- **Headline** (900, 30px, -0.02em): the result sheet title.
- **Title** (900, 22px, -0.01em): panel and sheet headings, the brand wordmark (-0.02em). Sheet sub-heads are 17px 900.
- **Roll** (900, 26px, +0.01em): the Roll pill. Steps down to 21px for "Re-roll · n left", 18px when waiting, 22px on short phones.
- **Button** (800, 17px; 15px small): all pill buttons and segment options.
- **Body** (500, 16px, 1.45): running text; sheet prose capped at 66ch. **Lede** 18px, 44ch, ink-slate.
- **Label** (700, 13px, +0.02em, sentence case): field labels, fieldset legends, the "Room code" and "Rolls" headings. An upright `em` at weight 500 inside a label marks asides such as "optional".
- **Caption** (600, 12.5px, 1.3): seat sub-lines, segment sub-text. Seat names are 800 at 15px (13px compact).

### Named Rules
**The Heavy Means Touchable Rule.** Weight 800-900 marks what you act on or must read at a glance; reading text stays at 500-600.

**The Tabular Rule.** Numbers always align: codes, roll indices, face counts and timers use tabular figures.

## Layout

Phone portrait first, from 320px. The game view is a single column sized from the board: `--board-size` is the smallest of the viewport width minus 32px, the viewport height minus the chrome (about 330px), and 640px; one board cell `u` is that size divided by 15, and guti, tile radii and hop heights are all expressed in `u`. Under 600px the seats become one row of compact chips (one column per player); under 700px tall the die well and Roll pill shrink from 76px to 60px.

From 900px the game becomes two columns: the board (up to 760px) on the left spanning three rows, and a 340px column holding the seat list, the tray and the roll log. Home switches to an intro-and-join column beside the create panel; the lobby stays a centred 560px column; sheets are 560px wide.

Spacing is a loose 4px-based rhythm: 6-8px between sibling chips and options, 10-12px between tray items, 14-18px between panel rows and sections, 22px panel padding, 28px column gap on desktop. Touch targets are at least 44px everywhere (icon buttons 44px, small buttons 44px, standard buttons 52px, Roll 76px). Safe-area insets pad the top bar, main and sheets.

## Elevation & Depth

A soft two-layer ambient shadow lifts the frosted objects (panels, board plate, die well, sheets) off the ground; everything else is flat colour. The marbles and dice carry their own material depth with inset shading and small contact shadows, because they are objects, not surfaces. The top bar uses an 88% ground tint with a 10px backdrop blur.

### Shadow Vocabulary
- **Frost lift** (`box-shadow: 0 2px 4px rgb(15 27 51 / 0.08), 0 10px 28px rgb(15 27 51 / 0.12)`; dark: `0 2px 4px rgb(0 0 0 / 0.3), 0 12px 30px rgb(0 0 0 / 0.35)`): panels, code card, board plate, die well, sheets.
- **Marble body** (`inset 0 0 0 1.5px <colour 65% + black>, inset 0 -0.14em 0.22em rgb(0 0 0 / 0.22), 0 0.12em 0.22em rgb(0 0 0 / 0.3)`): every guti and bead; em-based so it scales with the marble.
- **Roll pill glaze** (`inset 0 2px 1px rgb(255 255 255 / 0.35), inset 0 -6px 12px rgb(0 0 0 / 0.18), 0 8px 18px rgb(0 0 0 / 0.22)`), over a white top sheen gradient: the active Roll pill only; it collapses to a shorter shadow when pressed and to none when waiting.
- **Die body** (`inset 0 0 0 2px rgb(255 255 255 / 0.85), inset 0 -6px 10px rgb(31 69 214 / 0.16), 0 5px 12px rgb(0 0 0 / 0.18)`): the glass die; other skins use their own tinted inset with the same 5px/12px contact shadow.

### Named Rules
**The Objects Have Depth, Chrome Floats Rule.** Marbles, dice and the Roll pill are shaded like physical things; containers only float on the one frost-lift shadow. No other shadow recipes.

## Shapes

Every edge is rounded; there are no sharp corners in the world (a binding user steer). Actions are full pills (999px). Containers use three steps: 12px (proof rows, focus ring), 18px (inputs, segments, seat chips, die picker cards, result rows), 28px (panels, sheets, code card). The die well is a 24px squircle (20px compact); dice are 28% of their size (Mochi 34%). Icon buttons, marbles, beads, home pips and empty-seat holes are circles.

The board plate is rounded at 0.9u. Track and lane tiles are 0.86u squares with a 0.26u radius, inset so 0.14u of sage shows between them. Bases are 5.72u rounded at 1u, with a 4.3u well at 1.1u holding four circular kancha pits. The home centre is a rounded tile with four triangular petals whose joins are rounded by a same-colour 0.34u stroke. Line icons are 2px strokes with round caps and joins; the U-arrows, corner direction marks and stars use round caps and joins too.

**The No Sharp Corner Rule.** If it has a corner, it has a radius; if it has a stroke end, it is round. Where a rectangle must be clipped (the seat timer bar), the parent's radius clips it.

## Components

### Buttons
Soft, heavy pills.
- **Shape:** full pill (999px), 52px tall, 22px side padding; small variant 44px and 16px.
- **Primary:** ink-navy fill, mint-frost text; hover mixes 12% cobalt into the ink.
- **Outline (default):** 2px ink-navy border, transparent fill; hover fills frost-deep.
- **Ghost:** transparent border; used for Leave and "Look at the board".
- **Press:** scales to 0.97 over 150ms. **Disabled:** 45% opacity, no transform.
- **Focus:** 3px cobalt outline, 3px offset, 12px radius, on every focusable element.
- **Icon button:** 44px circle (40px wide on phones under 480px inside a room), transparent, frost-deep on hover; 22px stroked line icons.

### Roll pill (signature)
The biggest thing on the phone screen, under the thumb.
- **Shape:** full pill, 76px tall (60px on short phones), filling the tray beside the die well.
- **Ready:** filled with the roller's player colour, white sheen on top, glaze shadow, white 26px/900 label ("Roll"); amber takes ink-navy text. It nudges (scale 1.04 then 0.99) every 1.6s to invite the tap; press scales to 0.96.
- **Re-roll:** same colour fill, label "Re-roll · n left" at 21px.
- **Waiting / not your turn:** frost-deep fill, ink-slate 18px label, no shadow, never dimmed by opacity ("Sealing 2/3", "Tap a glowing guti", "Ruby's turn", "Game over").
- **Timer:** a 6px rounded track under the tray fills with the current player's colour and drains linearly over the turn.

### Chips
- **Room pill:** 36px ink-navy pill in the top bar, mint-frost 14px/800 code with +0.06em tracking and a 600-weight mode name at 75% opacity.
- **Tag:** frost-deep pill, 13px/700 ink-slate ("Host", "You").
- **Seat chip (wide):** glass-surface, 18px radius, 52px tall, 2px transparent border. Holds a 34px marble with face, the name (15px/800, ellipsised) and a caption line, four 8px home pips (outlined in the player colour, filled when home) and a 30px mini die showing that player's latest roll in their skin (tumbling while they roll). On the current turn the border takes the player colour and a 4px timer bar in that colour drains along the bottom. A departed player drops to 50% opacity.
- **Seat chip (compact, under 600px):** one per column. Marble (28px) and mini die (20px) side by side, then the name (13px), then 5px home pips. The caption is visually hidden but kept for screen readers; your own chip gets a 12% tint of your colour and a small "you" mark.

### Cards / Containers
- **Panel:** glass-surface, 28px radius, frost-lift shadow, 22px padding, 16px row gap; heading at Title size.
- **Code card:** a panel centred around the Room-code numerals, with copy and share as small outline pills.
- **Lobby seat row:** glass-surface, 18px radius, 64px tall, 42px marble; your row gets a 2px ink border; empty seats are a 2px dashed line-sage outline with a dashed circular hole.

### Inputs / Fields
- **Text field:** tile-white, 2px line-sage border, 18px radius, 54px tall, 18px/600 text; the join code input is 26px/800 with +0.14em tracking. Focus turns the border cobalt (no outline).
- **Segmented choice:** a grid of tile-white rounded options (18px, 52px tall, 17px/800 with a 12.5px sub-line). Selected fills ink-navy with mint-frost text.
- **Die picker:** five rounded tile cards (18px, 2px line-sage border) each with a 38px mini die and its name; selected takes an ink border and ink text.

### Navigation
A 60px sticky top bar on the frosted ground: brand bead and Gabarito 22px/900 wordmark at left (the bead alone inside a room on phones), the room pill centred, and icon buttons for sound, rules and theme at right.

### Sheets and toast
- **Sheet:** a native dialog on glass-surface. On phones it docks to the bottom of the screen with 28px rounded top corners and rises 40px with a fade over 350ms; from 700px it centres with all corners at 28px. Backdrop is navy at 45%. Sticky head with Title heading and a close icon button; body 24px side padding, prose at ink-slate.
- **Proof rows:** 12px rounded ground-tinted rows: roll number, a 18px faceless marble, who rolled what, and the 12px beads of every sealing player. Face counts sit in 10px-rounded cells.
- **Toast:** ink-navy pill at the bottom, slides up from below and fades over 350ms, stays 2.6s.

### Guti marble (signature)
- **Body:** circle sized 0.84u on the board. Three radial layers: an opaque core of the player colour to 47%, a clear rim of the colour mixed 52% with white to 72%, then a pale edge; a big white highlight at upper left (95% white, 10%) and a small one at lower right (45% white). Marble body shadow, with a 1.5px inner rim of the colour darkened 35%.
- **Face:** two eyes (navy pupils low in white sclera, a thin dark ring) that blink (scaleY to 0.1) once every 5.2s, staggered per guti so they never blink together; two pink blush ovals (rgb(255 140 160 / 0.55)) under them. Faces are hidden below 20px (roll log, proof list, places) so tiny marbles read as clean beads.
- **Movable:** white 3px ring plus 2.5px live-violet ring, raised above others, eyes look up, and it hops 0.16u every 0.9s.
- **Stacks:** two on a square shrink to 74% and offset diagonally; three or more, or guti at home, shrink to 60% in a 2x2.
- **Captured (x_x):** desaturated (saturate 0.55, brightness 0.95); each eye becomes a navy X of two rounded bars with a white keyline, the blush becomes a flat rounded mouth. The face holds for 1.6s after it lands home.

### Dice and skins
All skins are cosmetic, share one 3x3 pip grid, and round at 28%. Pips are navy circles unless a skin says otherwise.
- **Glass:** translucent white-to-ice gradient with a slight backdrop blur, white inner rim, cobalt-tinted inner shade; the six shows ruby pips. The sealing beads fall into it.
- **Marbles:** white body; each pip is a tiny kancha in ruby, cobalt, green or amber with its own highlight.
- **Kitty:** warm cream body with two rounded cat ears behind it (pink inner ear); the one-pip is a pink nose; brown pips. Ears hide on compact seat chips.
- **Mochi:** soft pink radial body, 34% rounding, two blush cheeks, plum pips; it lands with a squish (1.2 x 0.8, then 0.92 x 1.1).
- **Starry:** night-blue radial body with gold star-shaped pips (rounded-join star mask).

### Board marks
- **U-arrow (Arrow mode):** one per colour, drawn in that colour with round caps: tail on the square two before the home lane, a 0.5u loop around the arm's end, a chevron head into the lane's first square, and two feather chevrons at the tail. A 0.26u tile-coloured halo under it keeps it readable over tiles. Unused colours dim to 40%.
- **Corner marks:** short ink diagonal arrows (60% opacity, round caps) at the four inner corners showing direction only.
- **Safe squares:** stars are ink outlines at 80%; start squares are filled with the player colour and carry a white ring.

### Motion and sound

Motion is transform-only so it stays on the compositor, short, and eased with `cubic-bezier(0.22, 1, 0.36, 1)`.
- **Hop:** a guti moves one cell per 150ms step. Each step arcs 0.34u up through the midpoint with a stretch (1.1 x 0.94) and lands with a squash (1.06 x 0.92). An arrow flight adds 260ms, arcs 0.9u and swells to 1.25. Each hop plays a rising marble tick; the last step vibrates 7ms.
- **Capture flight:** after the mover lands, the captured guti swells to 1.9x with a -18 degree twist, wobbles to 12 degrees, then flies to its base over 1.1s wearing the x_x face.
- **Seal-and-mix:** each sealing player's bead appears on a 46px ring around the die well and falls into the die (520ms, 50ms stagger, shrinking to 0.3 and fading) while the die tumbles and the rattle plays; after 560ms plus 50ms per bead the face lands (scale 1.25 with a -12 degree tilt settling over 450ms, or Mochi's squish).
- **Re-layout:** guti that shift without a move glide 220ms.
- **Reduced motion:** a global rule cuts every CSS animation and transition to 0.01ms with one iteration; hops, captures, bead falls and glides are skipped in script and the die face appears immediately. Only the linear turn timer keeps draining, because it carries information.

Sound is synthesised (Web Audio, no files) through one master gain at 0.32 and a compressor: short plucked sines and triangles with a marimba overtone, and filtered noise for clicks and rattles. Rattle on roll, a soft knock on land with a bright three-note chime for a six, a rising tick per hop, a whoosh for an arrow, a down-glide when captured, chimes for home and win. Vibration patterns are short (7-90ms) and stronger for bad news (captured: 70/50/90). The mute toggle silences sound and vibration together and is remembered.

## Do's and Don'ts

### Do:
- **Do** build every guti, bead and seat marker from the one marble recipe, scaled; drop the face below 20px.
- **Do** round every corner: pills (999px) for actions, 12/18/28px for containers, 0.26u for board tiles, round caps on every stroke.
- **Do** keep live violet for legal landing squares and movable guti only.
- **Do** fill the Roll pill with the roller's own colour, with ink-navy text on amber and white on the other three.
- **Do** size board pieces in board cells (u) so the board scales as one object.
- **Do** keep motion on transform and opacity, at 150ms per hop, and honour reduced motion in both CSS and script.
- **Do** keep sound subtle and synthesised, and let one mute control silence vibration too.
- **Do** keep touch targets at 44px or more and give every player a name as well as a colour.

### Don't:
- **Don't** use a sharp corner or a square stroke end anywhere, including board squares.
- **Don't** use violet, or any fifth hue, for branding, decoration or status.
- **Don't** fade the waiting Roll pill with opacity; switch it to frost-deep with ink-slate text so its label stays legible.
- **Don't** add gold frames, purple gradients or glossy 3D bevels to the board.
- **Don't** let a die skin touch a roll or imply luck; skins are looks only.
- **Don't** use the label style as a decorative eyebrow above headlines; it labels a field, a code or a list.
- **Don't** add shadow recipes beyond frost lift for containers and the object shading for marbles, dice and the Roll pill.
