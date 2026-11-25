// Board geometry for a 15x15 cross-shaped board. Pure data, no DOM.
//
// Coordinates are [x, y] cells, x to the right, y down. The main track has 52
// squares indexed 0..51 clockwise, starting at the top-left player's start square.
// Corner c (0 = top-left, 1 = top-right, 2 = bottom-right, 3 = bottom-left) starts at
// global index 13 * c.
//
// A token's position is stored relative to its own corner:
//   -1        in the base
//   0..50     on the main track, 0 = own start square, 50 = last square before the home lane
//   51        the square just before its own start (only reached when the home lane is locked)
//   100..104  the five home-lane squares
//   105       home (finished)

export const BASE = -1;
export const LANE0 = 100;
export const HOME = 105;
export const LAST_MAIN = 50;
export const PRE_START = 51;

function buildTrack() {
  const t = [];
  const run = (x, y, dx, dy, n) => { for (let i = 0; i < n; i++) t.push([x + dx * i, y + dy * i]); };
  run(1, 6, 1, 0, 5);    // 0-4    (1,6)..(5,6)
  run(6, 5, 0, -1, 6);   // 5-10   (6,5)..(6,0)
  run(7, 0, 0, 0, 1);    // 11     (7,0)
  run(8, 0, 0, 1, 6);    // 12-17  (8,0)..(8,5)
  run(9, 6, 1, 0, 6);    // 18-23  (9,6)..(14,6)
  run(14, 7, 0, 0, 1);   // 24     (14,7)
  run(14, 8, -1, 0, 6);  // 25-30  (14,8)..(9,8)
  run(8, 9, 0, 1, 6);    // 31-36  (8,9)..(8,14)
  run(7, 14, 0, 0, 1);   // 37     (7,14)
  run(6, 14, 0, -1, 6);  // 38-43  (6,14)..(6,9)
  run(5, 8, -1, 0, 6);   // 44-49  (5,8)..(0,8)
  run(0, 7, 0, 0, 1);    // 50     (0,7)
  run(0, 6, 0, 0, 1);    // 51     (0,6)
  return t;
}

export const TRACK = buildTrack();

// Each corner's start must sit 13 squares after the previous one.
if (TRACK.length !== 52 || TRACK[13][0] !== 8 || TRACK[13][1] !== 1 || TRACK[26][0] !== 13 || TRACK[39][1] !== 13) {
  throw new Error("board track layout is inconsistent");
}

export const START = [0, 13, 26, 39];
export const STARS = [8, 21, 34, 47];
export const SAFE = new Set([...START, ...STARS]);

// Arrow mode: each colour has one U-shaped arrow. Its tail is the main-track
// square two before the colour turns into its home lane (relative 48); landing
// exactly there flies the guti into the first square of its own home lane.
export const ARROW_TAIL = 48;
// The four inner corners carry short arrows on the shared track. Landing exactly
// on a corner arrow's tail moves any guti one square on to its head and earns
// another roll (Ludo Star's "token moves ahead 1 step, get an extra dice roll").
export const CORNER_MARKS = [[[5, 6], [6, 5]], [[8, 5], [9, 6]], [[9, 8], [8, 9]], [[6, 9], [5, 8]]];
export const CORNER_TAILS = new Set([4, 17, 30, 43]); // global track indices of the tails

export const LANES = [
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
];

// Where each corner's tokens rest in the base (cell centres, may be fractional).
const BASE_ORIGIN = [[0, 0], [9, 0], [9, 9], [0, 9]];
const BASE_SLOTS = [[2, 2], [4, 2], [2, 4], [4, 4]];
// Home triangle centroids per corner.
const HOME_SPOT = [[6.55, 7.5], [7.5, 6.55], [8.45, 7.5], [7.5, 8.45]];

// Which corners are used for a given number of players.
// Two players sit on the bottom-left and top-right corners (host first).
export function cornersFor(n) {
  if (n === 2) return [3, 1];
  if (n === 3) return [0, 1, 2];
  return [0, 1, 2, 3];
}

export function globalIndex(corner, pos) {
  if (pos < 0 || pos > PRE_START) return -1;
  return (START[corner] + pos) % 52;
}

// Cell centre [x, y] (in cell units, so add 0.5 to a cell's corner) of a token.
export function cellOf(corner, pos, slot = 0) {
  if (pos === BASE) {
    const [ox, oy] = BASE_ORIGIN[corner];
    const [sx, sy] = BASE_SLOTS[slot];
    return [ox + sx, oy + sy];
  }
  if (pos === HOME) return HOME_SPOT[corner];
  if (pos >= LANE0) {
    const [x, y] = LANES[corner][pos - LANE0];
    return [x + 0.5, y + 0.5];
  }
  const [x, y] = TRACK[globalIndex(corner, pos)];
  return [x + 0.5, y + 0.5];
}
