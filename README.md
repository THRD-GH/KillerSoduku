# Killer Sudoku

A web killer sudoku, built to match the feel of the KillSud Android app: same
control scheme, same six-star level ladder, same numbered-puzzle history.

Vite + TypeScript, no runtime dependencies. `npm run dev`, `npm run build`.

## Installing

It is a PWA: installable from the browser, and it runs offline. The service
worker precaches the app shell (~87 kB) and caches each level's Classic puzzle
pack the first time you open that level, so the 1.2 MB of packs is not part of
the install. New puzzles are generated locally and work offline from the start.

`npm run build` regenerates `dist/sw.js` from the actual build output, so the
precache list always matches the hashed filenames. `npm run icons` redraws the
app icons.

## Rules

Normal sudoku, plus: the digits in a dashed cage add up to the small number in
its corner, and no digit repeats inside a cage. There are no given digits — the
cages are the whole puzzle.

## Controls

The cell holds a *set* of digits: one digit displays as an answer, two or more
display as pencil marks. That single idea explains the whole keypad.

| Gesture | Effect |
| --- | --- |
| Tap cell | Select it |
| Tap keypad digit | Toggle that digit in the cell |
| Long-click / double-click keypad digit | Force it in as the answer, clearing candidates |
| Long-click / double-click CLEAR | Empty the cell |
| Long-click cell | Pause — or use the Pause button (long-click the pause screen, or Escape, to resume) |

Keyboard: arrows move, `1`–`9` toggle, `Shift`+digit forces, `Backspace` clears,
`Z` undo, `H` hint, `C` check, `S` calculator, `Esc` pause.

**Buttons** — Check (flag wrong entries), Hint (fill one correct digit, fixing a
mistake first if there is one), Sum (combination calculator), Restart, New, Undo
and the undo/redo arrows. Undo winds back as far as the empty grid; redo goes
forward until a new move abandons it. The purple box totals cage sums for
innie/outie arithmetic:
tap to add the selected cage, hold to clear, each cage counts once. The white box
is the clock; tap to hide it, it keeps running.

**Settings** — Allow single candidates, Lazy mode (pre-fill cages with only one
possible combination), Night colours, and long-click guards on Hint, Undo and
CLEAR.

## Puzzles

Every level offers two pools, with separate history and separate numbering:

- **Classic** — the original grids shipped with the reference app, numbered
  `3-10`. Requires importing the packs (below).
- **New** — generated on demand and seeded from `(level, number)`, numbered
  `3-N10`. Same seed, same grid, on every device, forever — but the supply is
  unlimited and nothing has to ship with the app. 300 per level.

Played puzzles drop out of their pool until released from Stats.

### The Classic packs

`public/packs/` is committed, so the site works as-is with no import step, and
Vite copies it into `dist/` on build.

Those files hold another app's puzzle content, extracted from a copy of it we
own. **This repository is private, and that is the condition under which
including them is reasonable.** Do not make the repository public, and do not
deploy the site publicly, without removing them first — re-add `public/packs/`
to `.gitignore` and the app degrades gracefully, disabling Classic and
offering New only.

To rebuild them from the app's assets (the APK is a zip):

```bash
node tools/import-packs.ts <dir-with-nks-files>
```

Which level a puzzle belongs to is *not* the filename. The packs are sharded
across six files whose difficulty is flat — mean solver score 2.40, 2.70, 2.42,
3.05, 2.80, 2.45, in no order at all. The level is the rating digit in the first
field, which does climb: 1.85, 1.45, 2.05, 2.80, 4.00, 4.06. `analyse-packs.ts`
runs both groupings so that conclusion can be re-checked rather than trusted.

### What the reference packs told us

The KillSud APK ships 5,200 puzzles as plaintext, so its design could be
measured rather than guessed. Three findings shaped this generator:

- **No single-cell cages, anywhere.** A one-cell cage is just a given digit.
  Sizes start at 2 in all six packs.
- **Cages run to nine cells**, with a long tail: 2:51%, 3:27%, 4:12%, 5:6%,
  6:2%, 7:1%, 8:0.3%, 9:0.1%. Nine-cell cages are rare but real, and worth
  supporting: one sums to 45 and holds every digit, so it constrains almost
  nothing except that its own cells differ — which makes it a genuinely hard
  feature to play against. Cage arc consistency stops enumerating past seven
  cells, so a plain no-repeat-within-a-cage rule is what keeps those correct.
- **Mean cage size is ~2.85 at every level.** Their ladder is *not* built from
  bigger cages. Grouped by the packs' own internal rating the mean drifts only
  2.54 → 3.30, so cage size is texture with a slight lean, not difficulty.

Cage layout matters more than cage size: a badly laid-out grid of large cages
can be trivial, and a tight grid of small ones can be stubborn.

### How generation works

Random cage layouts almost never produce a unique solution — at larger cage
sizes only about 3% do, and rejecting the rest is slow. So the generator works
the other way round:

1. Fill a random solved grid.
2. Tile it with dominoes and triominoes. Cages that small make the puzzle
   heavily over-constrained, so most tilings are already uniquely solvable and
   the rest are discarded cheaply. A cell with no free partner is folded into a
   neighbouring cage rather than left as a single — that is what the reference
   packs do, and what stops stray givens appearing at high levels.
3. Merge adjacent cages one at a time, keeping only merges that leave the puzzle
   uniquely solvable. Merging only ever loosens a puzzle, so this walks a ladder
   from "trivially over-constrained" up to "as loose as it can get".
4. Classify rungs near the level's intended texture and take one whose
   difficulty matches.

Pure dominoes would merge 2+2 into 4 and never produce a three-cell cage, so
some of the base is seeded as triominoes — more of it at the higher levels.

Merging is then steered towards the reference cage-size distribution: each
candidate merge is ranked by how short the resulting size currently is of its
target share. The shortfall has to be measured *relative to each size's own
target*. Ranking by absolute share instead — the obvious way — always favours
the common sizes, and since large cages are the stepping stones to larger ones,
measured runs lost every 9-cell cage and most 6s and 7s. The cost of the
relative measure is a lighter share of 4-cell cages (~7% against their 12%),
which is the better trade for grids that span the full range.

Generation runs in a worker behind a spinner and results are cached; every level
builds in well under a second.

### Difficulty

A puzzle is only as hard as the hardest step it forces. The solver always
reaches for the cheapest technique that still makes progress, and a puzzle is
rated by how far up the stack it had to go:

| Difficulty | Techniques |
| --- | --- |
| 1 | naked singles, hidden singles, no repeat within a cage |
| 2 | cage combinations |
| 3 | locked candidates (pointing/claiming), cage arc consistency |
| 4 | naked subsets, hidden subsets |
| 5 | cage locking, innies/outies of a unit |
| 6 | innies/outies across a band or stack |
| 7 | X-wing |

Levels 1–4 are cut on that hardest-technique figure; levels 5 and 6 are puzzles
where the stack runs out entirely, split by how much trial and error remains.

An earlier version rated puzzles purely on 45-rule usage. That was wrong — it
fixated on one technique, and with no given digits nearly every killer grid
needs the 45-rule at least once, so it could not separate an easy puzzle from a
hard one. Sampling with the full stack gives a real spread.

Caveat worth stating: the rating measures difficulty *relative to this solver's
technique set*. A solver that knows swordfish or cage-splitting would rate some
of these lower. It is a consistent ladder, not an absolute one.

## Tools

```bash
node tools/calibrate.ts [n]      # generate n puzzles per level and verify them
node tools/calibrate.ts spread   # what techniques the merge ladder demands
node tools/import-packs.ts <dir> # build public/packs/ from the .nks files
node tools/verify-packs.ts [n]   # prove the imported packs parse and solve
node tools/analyse-packs.ts <dir> # which pack grouping is really the level
```

`calibrate.ts` checks every generated puzzle has exactly one solution, that the
solution is the grid the cages were cut from, that the cages partition all 81
cells and total 405, that no cage repeats a digit, that no cage is a single
cell, and that the size cap holds. It also prints the cage-size distribution
next to the reference app's for comparison.

## Provenance

The control scheme, level ladder and puzzle-numbering scheme are modelled on
KillSud by BotenSoft, from its own in-app help text. No code, artwork or fonts
from that app are used here — the stars are drawn in SVG and the combination
table is computed rather than shipped.

Its puzzle packs are a different matter. Classic mode plays them, and they are
committed here so the site runs without a build step — which is defensible only
because this repository is private. New puzzles depend on none of it, so
dropping `public/packs/` leaves a fully working game.
