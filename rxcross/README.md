# RxCross

A daily 10x10 crossword for studying pharmacy brand names. Every answer is a U.S. brand
name; every clue says what the drug does (class + use). Everyone gets the same puzzle on
the same date, like Wordle.

## Play

No build step and no server needed. Open `index.html` in a browser, or serve the folder:

    python3 -m http.server 8000     # then visit http://localhost:8000

Puzzles are generated in the browser from the date (seeded), so there is nothing to
schedule or maintain. `?date=YYYY-MM-DD` opens an earlier puzzle (the Archive button
lists them). Progress, streaks and times are kept in `localStorage`.

## Features

- Clues describe the drug's action/indication; **Generic hint** reveals part of the generic name
- Check word / Check all, Reveal letter / word, Give up
- Wordle-style shareable result, streaks, best time, past-puzzle archive
- Study list after finishing: brand -> generic -> what it does
- Keyboard (arrows, Tab/Enter, Space) and mobile friendly, light/dark theme

## Data

- `data/drugs_raw.txt` - generic/brand rows extracted from the study PDF (299 drugs)
- `data/hints.txt` - one "what it does" hint per drug number (written for this project;
  the PDF only lists names, so review them before relying on them clinically)
- `python3 tools/build_data.py` regenerates `js/drugs.js` (424 brand words from 288 drugs).
  Brands are used only if they are a single word once formulation suffixes (XL, HFA, ...)
  are removed; hyphens are dropped (Klor-Con = KLORCON). Flecainide has no brand and is skipped.

## Puzzle generator

`js/puzzle.js` picks a seeded pool for the day and runs 250 greedy placement attempts,
keeping the grid with the most words (about 22 words, roughly half the cells filled).
A 365-day test produced valid, deterministic grids every time.
