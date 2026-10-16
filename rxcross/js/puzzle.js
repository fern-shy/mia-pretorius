// Deterministic daily crossword generator.
// The same date always produces the same puzzle, so every player gets
// the same challenge without needing a server.
(function (root) {
  "use strict";

  var SIZE = 10;
  var ATTEMPTS = 250;
  var POOL_SIZE = 260;
  var LAUNCH_DATE = "2026-10-15"; // puzzle #1

  // ---------- seeded randomness ----------
  function hashString(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  // ---------- dates ----------
  function pad(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function dateKey(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function dayNumber(key) {
    var a = key.split("-").map(Number);
    var b = LAUNCH_DATE.split("-").map(Number);
    var ms = Date.UTC(a[0], a[1] - 1, a[2]) - Date.UTC(b[0], b[1] - 1, b[2]);
    return Math.round(ms / 86400000) + 1;
  }

  // ---------- grid search ----------
  // cells: Int8Array of letter codes (0 = empty); dirs: bit 1 = across, bit 2 = down
  function Board() {
    this.cells = new Uint8Array(SIZE * SIZE);
    this.dirs = new Uint8Array(SIZE * SIZE);
    this.byLetter = {};
    this.placed = [];
    this.filled = 0;
    this.minR = SIZE; this.maxR = -1; this.minC = SIZE; this.maxC = -1;
  }

  function code(ch) {
    return ch.charCodeAt(0);
  }

  // Returns the number of crossings if the word fits, otherwise -1.
  Board.prototype.fit = function (word, r, c, across) {
    var dr = across ? 0 : 1;
    var dc = across ? 1 : 0;
    var n = word.length;
    var er = r + dr * (n - 1);
    var ec = c + dc * (n - 1);
    if (r < 0 || c < 0 || er >= SIZE || ec >= SIZE) return -1;
    // cells just before and after the word must be empty
    var br = r - dr, bc = c - dc, ar = er + dr, ac = ec + dc;
    if (br >= 0 && bc >= 0 && this.cells[br * SIZE + bc]) return -1;
    if (ar < SIZE && ac < SIZE && this.cells[ar * SIZE + ac]) return -1;
    var cross = 0;
    var bit = across ? 1 : 2;
    for (var i = 0; i < n; i++) {
      var rr = r + dr * i, cc = c + dc * i, idx = rr * SIZE + cc;
      var existing = this.cells[idx];
      if (existing) {
        if (existing !== word.charCodeAt(i)) return -1;
        if (this.dirs[idx] & bit) return -1; // would overlap a word running the same way
        cross++;
      } else {
        // a fresh letter must not touch parallel neighbours
        var pr1 = rr + dc, pc1 = cc + dr, pr2 = rr - dc, pc2 = cc - dr;
        if (pr1 < SIZE && pc1 < SIZE && this.cells[pr1 * SIZE + pc1]) return -1;
        if (pr2 >= 0 && pc2 >= 0 && this.cells[pr2 * SIZE + pc2]) return -1;
      }
    }
    return cross;
  };

  Board.prototype.put = function (entry, r, c, across) {
    var dr = across ? 0 : 1;
    var dc = across ? 1 : 0;
    var bit = across ? 1 : 2;
    var word = entry.w;
    for (var i = 0; i < word.length; i++) {
      var rr = r + dr * i, cc = c + dc * i, idx = rr * SIZE + cc;
      if (!this.cells[idx]) {
        this.cells[idx] = word.charCodeAt(i);
        (this.byLetter[word[i]] = this.byLetter[word[i]] || []).push(idx);
        this.filled++;
      }
      this.dirs[idx] |= bit;
    }
    var er = r + dr * (word.length - 1), ec = c + dc * (word.length - 1);
    this.minR = Math.min(this.minR, r); this.maxR = Math.max(this.maxR, er);
    this.minC = Math.min(this.minC, c); this.maxC = Math.max(this.maxC, ec);
    this.placed.push({ entry: entry, r: r, c: c, across: across });
  };

  function attempt(cands, rng) {
    var board = new Board();
    var usedGeneric = {}, usedHint = {};

    function claim(e) {
      usedGeneric[e.n] = true;
      usedHint[e.hint] = true;
    }
    function usable(e) {
      return !usedGeneric[e.n] && !usedHint[e.hint];
    }

    // Seed with a long word across the middle so there is plenty to cross.
    var longs = cands.filter(function (e) { return e.w.length >= SIZE - 3; });
    var first = longs.length ? longs[Math.floor(rng() * longs.length)] : cands[0];
    var row = Math.floor(SIZE / 2) - 2 + Math.floor(rng() * 3);
    var col = Math.floor((SIZE - first.w.length) / 2) + Math.floor(rng() * 3) - 1;
    col = Math.max(0, Math.min(SIZE - first.w.length, col));
    board.put(first, row, col, true);
    claim(first);

    for (var pass = 0; pass < 4; pass++) {
      var progressed = false;
      for (var k = 0; k < cands.length; k++) {
        var e = cands[k];
        if (!usable(e)) continue;
        var best = null, bestScore = -1;
        for (var i = 0; i < e.w.length; i++) {
          var spots = board.byLetter[e.w[i]];
          if (!spots) continue;
          for (var s = 0; s < spots.length; s++) {
            var idx = spots[s];
            var gr = (idx / SIZE) | 0, gc = idx % SIZE;
            var d = board.dirs[idx];
            for (var t = 0; t < 2; t++) {
              var across = t === 0;
              if (d & (across ? 1 : 2)) continue;
              var r0 = across ? gr : gr - i;
              var c0 = across ? gc - i : gc;
              var x = board.fit(e.w, r0, c0, across);
              if (x < 1) continue;
              // prefer many crossings, stay near the middle, break ties randomly
              var mid = Math.abs(r0 + (across ? 0 : e.w.length / 2) - (SIZE - 1) / 2) +
                        Math.abs(c0 + (across ? e.w.length / 2 : 0) - (SIZE - 1) / 2);
              var score = x * 10 - mid * 0.35 + rng();
              if (score > bestScore) {
                bestScore = score;
                best = { r: r0, c: c0, across: across };
              }
            }
          }
        }
        if (best) {
          board.put(e, best.r, best.c, best.across);
          claim(e);
          progressed = true;
        }
      }
      if (!progressed) break;
    }
    return board;
  }

  function boardScore(b) {
    var area = (b.maxR - b.minR + 1) * (b.maxC - b.minC + 1);
    return b.placed.length * 100 + b.filled + area * 0.5;
  }

  // ---------- numbering ----------
  function buildPuzzle(board, key) {
    var letters = [];
    for (var r = 0; r < SIZE; r++) {
      var row = [];
      for (var c = 0; c < SIZE; c++) {
        var v = board.cells[r * SIZE + c];
        row.push(v ? String.fromCharCode(v) : null);
      }
      letters.push(row);
    }
    var byStart = {};
    board.placed.forEach(function (p) {
      byStart[p.r + "," + p.c + "," + (p.across ? "A" : "D")] = p;
    });
    var entries = [], numbers = [], num = 0;
    for (var r2 = 0; r2 < SIZE; r2++) {
      numbers.push(new Array(SIZE).fill(0));
      for (var c2 = 0; c2 < SIZE; c2++) {
        var a = byStart[r2 + "," + c2 + ",A"], d = byStart[r2 + "," + c2 + ",D"];
        if (!a && !d) continue;
        num++;
        numbers[r2][c2] = num;
        [a, d].forEach(function (p) {
          if (!p) return;
          var e = p.entry;
          entries.push({
            id: num + (p.across ? "A" : "D"),
            num: num,
            dir: p.across ? "across" : "down",
            row: p.r,
            col: p.c,
            len: e.w.length,
            word: e.w,
            brand: e.brand,
            generic: e.generic,
            hint: e.hint
          });
        });
      }
    }
    return {
      date: key,
      number: dayNumber(key),
      size: SIZE,
      letters: letters,
      numbers: numbers,
      entries: entries
    };
  }

  // Checks that every run of 2+ letters is exactly one listed entry.
  function validate(p) {
    var errors = [];
    var want = {};
    p.entries.forEach(function (e) { want[e.row + "," + e.col + "," + e.dir] = e; });
    var found = 0;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (!p.letters[r][c]) continue;
        [["across", 0, 1], ["down", 1, 0]].forEach(function (dd) {
          var pr = r - dd[1], pc = c - dd[2];
          if (pr >= 0 && pc >= 0 && p.letters[pr][pc]) return; // not a start
          var s = "", rr = r, cc = c;
          while (rr < SIZE && cc < SIZE && p.letters[rr][cc]) {
            s += p.letters[rr][cc];
            rr += dd[1]; cc += dd[2];
          }
          if (s.length < 2) return;
          found++;
          var e = want[r + "," + c + "," + dd[0]];
          if (!e || e.word !== s) errors.push("run " + s + " at " + r + "," + c + " " + dd[0]);
        });
      }
    }
    if (found !== p.entries.length) errors.push("entry count mismatch " + found + " vs " + p.entries.length);
    return errors;
  }

  function generate(key, drugs) {
    var rng = mulberry32(hashString("rxcross:" + key));
    var fits = drugs.filter(function (e) { return e.w.length <= SIZE; });
    var pool = shuffle(fits, rng).slice(0, POOL_SIZE);
    var best = null, bestScore = -1;
    for (var i = 0; i < ATTEMPTS; i++) {
      var board = attempt(shuffle(pool, rng), rng);
      var s = boardScore(board);
      if (s > bestScore) { bestScore = s; best = board; }
    }
    return buildPuzzle(best, key);
  }

  root.RxPuzzle = {
    SIZE: SIZE,
    LAUNCH_DATE: LAUNCH_DATE,
    generate: generate,
    validate: validate,
    dateKey: dateKey,
    dayNumber: dayNumber
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.RxPuzzle;
})(typeof window !== "undefined" ? window : globalThis);
