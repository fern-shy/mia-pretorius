(function () {
  "use strict";

  var P = window.RxPuzzle;
  var SIZE = P.SIZE;

  // ---------- helpers ----------
  function $(sel) { return document.querySelector(sel); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* storage unavailable: the game still works, just without saving */ }
    return null;
  }

  function fmtTime(s) {
    var m = Math.floor(s / 60), r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  function shiftKey(key, days) {
    var a = key.split("-").map(Number);
    return P.dateKey(new Date(a[0], a[1] - 1, a[2] + days));
  }

  // ---------- which puzzle ----------
  var today = P.dateKey(new Date());
  var key = today;
  var asked = new URLSearchParams(location.search).get("date");
  if (asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked <= today) key = asked;
  if (key < P.LAUNCH_DATE) key = P.LAUNCH_DATE;

  var puzzle = P.generate(key, window.DRUGS);
  var STATE_KEY = "rxcross:state:" + key;
  var HISTORY_KEY = "rxcross:history";

  // ---------- puzzle lookups ----------
  var cellEntries = []; // idx -> {across, down}
  for (var i = 0; i < SIZE * SIZE; i++) cellEntries.push({});
  puzzle.entries.forEach(function (e) {
    for (var k = 0; k < e.len; k++) {
      var r = e.row + (e.dir === "down" ? k : 0);
      var c = e.col + (e.dir === "across" ? k : 0);
      cellEntries[r * SIZE + c][e.dir] = e;
    }
  });
  var order = puzzle.entries.filter(function (e) { return e.dir === "across"; })
    .concat(puzzle.entries.filter(function (e) { return e.dir === "down"; }));

  function solution(idx) { return puzzle.letters[(idx / SIZE) | 0][idx % SIZE]; }
  function isBlock(idx) { return !solution(idx); }
  function entryCells(e) {
    var out = [];
    for (var k = 0; k < e.len; k++) {
      out.push((e.row + (e.dir === "down" ? k : 0)) * SIZE + e.col + (e.dir === "across" ? k : 0));
    }
    return out;
  }

  // ---------- state ----------
  var state = {
    user: new Array(SIZE * SIZE).fill(""),
    locked: new Array(SIZE * SIZE).fill(false), // revealed by a helper
    wrong: new Array(SIZE * SIZE).fill(false),
    generic: {},
    hints: { letter: 0, word: 0, generic: 0, check: 0 },
    elapsed: 0,
    started: false,
    status: "playing" // playing | won | gaveup
  };

  (function load() {
    var s = store(STATE_KEY);
    if (!s || !s.user || s.user.length !== SIZE * SIZE) return;
    state.user = s.user;
    state.locked = s.locked;
    state.generic = s.generic || {};
    state.hints = s.hints || state.hints;
    state.elapsed = s.elapsed || 0;
    state.started = !!s.started;
    state.status = s.status || "playing";
  })();

  function save() {
    store(STATE_KEY, {
      user: state.user, locked: state.locked, generic: state.generic,
      hints: state.hints, elapsed: state.elapsed, started: state.started, status: state.status
    });
  }

  var active = { idx: 0, dir: "across" };
  (function pickStart() {
    var first = order[0];
    active.idx = entryCells(first)[0];
    active.dir = first.dir;
  })();

  function activeEntry() { return cellEntries[active.idx][active.dir] || null; }
  function finished() { return state.status !== "playing"; }

  // ---------- history / stats ----------
  function history() { return store(HISTORY_KEY) || {}; }

  function recordResult(status) {
    var h = history();
    h[key] = { status: status, time: state.elapsed, hints: totalHints() };
    store(HISTORY_KEY, h);
  }

  function totalHints() {
    var h = state.hints;
    return h.letter + h.word + h.generic;
  }

  function computeStats() {
    var h = history();
    var wonDays = Object.keys(h).filter(function (d) { return h[d].status === "won"; }).sort();
    var played = Object.keys(h).length;
    var cur = 0, k = today;
    if (!(h[k] && h[k].status === "won")) k = shiftKey(k, -1);
    while (h[k] && h[k].status === "won") { cur++; k = shiftKey(k, -1); }
    var max = 0, run = 0, prev = null;
    wonDays.forEach(function (d) {
      run = prev && shiftKey(prev, 1) === d ? run + 1 : 1;
      if (run > max) max = run;
      prev = d;
    });
    var best = null;
    wonDays.forEach(function (d) {
      if (best === null || h[d].time < best) best = h[d].time;
    });
    return { played: played, won: wonDays.length, streak: cur, max: max, best: best };
  }

  // ---------- rendering ----------
  var gridEl = $("#grid");
  var cellEls = [];

  function buildGrid() {
    gridEl.style.setProperty("--n", SIZE);
    for (var idx = 0; idx < SIZE * SIZE; idx++) {
      var d = el("div", "cell");
      d.dataset.idx = idx;
      if (isBlock(idx)) {
        d.classList.add("block");
        d.setAttribute("role", "presentation");
      } else {
        d.setAttribute("role", "gridcell");
        var n = puzzle.numbers[(idx / SIZE) | 0][idx % SIZE];
        if (n) d.appendChild(el("span", "num", n));
        d.appendChild(el("span", "ch"));
      }
      gridEl.appendChild(d);
      cellEls.push(d);
    }
  }

  var clueEls = {};

  function buildClues() {
    puzzle.entries.forEach(function (e) {
      var li = el("li");
      li.appendChild(el("span", "n", e.num));
      var t = el("span", "t");
      t.appendChild(document.createTextNode(e.hint + " "));
      t.appendChild(el("span", "len", "(" + e.len + ")"));
      li.appendChild(t);
      li.addEventListener("click", function () { selectEntry(e, true); });
      $(e.dir === "across" ? "#cluesAcross" : "#cluesDown").appendChild(li);
      clueEls[e.id] = li;
    });
  }

  function maskGeneric(name) {
    // Show the start (and end, for long names) of each word; hide the middle.
    return name.replace(/[A-Za-z]+/g, function (w) {
      var head = w.length <= 4 ? 1 : w.length <= 7 ? 2 : 3;
      var tail = w.length >= 8 ? 2 : 0;
      var hid = w.length - head - tail;
      return w.slice(0, head) + new Array(hid + 1).join("•") + w.slice(w.length - tail);
    });
  }

  function render() {
    var ae = activeEntry();
    var inWord = {};
    if (ae) entryCells(ae).forEach(function (i) { inWord[i] = true; });

    for (var idx = 0; idx < cellEls.length; idx++) {
      if (isBlock(idx)) continue;
      var d = cellEls[idx];
      d.className = "cell" +
        (inWord[idx] ? " word" : "") +
        (idx === active.idx ? " active" : "") +
        (state.locked[idx] ? " revealed" : "") +
        (state.wrong[idx] ? " wrong" : "");
      d.querySelector(".ch").textContent = state.user[idx];
      d.setAttribute("aria-label", "Row " + (((idx / SIZE) | 0) + 1) + " column " + (idx % SIZE + 1) +
        (state.user[idx] ? ", " + state.user[idx] : ", empty"));
    }
    gridEl.classList.toggle("done", finished());

    // clue bar
    if (ae) {
      $("#cbLabel").textContent = ae.num + " " + ae.dir + " · " + ae.len + " letters";
      $("#cbHint").textContent = ae.hint;
      var g = $("#cbGeneric");
      if (finished()) {
        g.hidden = false;
        g.textContent = ae.brand + " = " + ae.generic;
      } else if (state.generic[ae.id]) {
        g.hidden = false;
        g.textContent = "Generic: " + maskGeneric(ae.generic);
      } else {
        g.hidden = true;
      }
    }

    // clue lists
    var crossDir = active.dir === "across" ? "down" : "across";
    var ce = cellEntries[active.idx][crossDir];
    puzzle.entries.forEach(function (e) {
      var li = clueEls[e.id];
      var full = entryCells(e).every(function (i) { return state.user[i]; });
      li.classList.toggle("filled", full);
      li.classList.toggle("current", ae === e);
      li.classList.toggle("cross", ce === e);
    });
    if (ae) keepVisible(clueEls[ae.id]);
    if (ce) keepVisible(clueEls[ce.id]);

    // toolbar
    var off = finished();
    ["#btnGeneric", "#btnCheckWord", "#btnCheckAll", "#btnRevealLetter", "#btnRevealWord", "#btnGiveUp"]
      .forEach(function (s) { $(s).disabled = off; });
    $("#btnStudy").hidden = !off;
    $("#timer").textContent = fmtTime(state.elapsed);
  }

  function keepVisible(li) {
    var box = li.parentNode;
    var top = li.offsetTop, bottom = top + li.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
  }

  // ---------- selection / movement ----------
  var kbd = $("#kbd");

  function focusInput() {
    if (finished()) return;
    kbd.value = "_";
    try { kbd.focus({ preventScroll: true }); } catch (e) { kbd.focus(); }
  }

  function selectCell(idx, toggle) {
    if (isBlock(idx)) return;
    if (idx === active.idx && toggle) {
      var other = active.dir === "across" ? "down" : "across";
      if (cellEntries[idx][other]) active.dir = other;
    } else {
      active.idx = idx;
      if (!cellEntries[idx][active.dir]) active.dir = active.dir === "across" ? "down" : "across";
    }
    render();
    focusInput();
  }

  function selectEntry(e, focus) {
    var cells = entryCells(e);
    var target = cells.filter(function (i) { return !state.user[i]; })[0];
    active.idx = target != null ? target : cells[0];
    active.dir = e.dir;
    render();
    if (focus) focusInput();
  }

  function stepEntry(delta) {
    var ae = activeEntry();
    var pos = Math.max(0, order.indexOf(ae));
    selectEntry(order[(pos + delta + order.length) % order.length], true);
  }

  function moveArrow(dr, dc) {
    var wantDir = dr ? "down" : "across";
    if (active.dir !== wantDir && cellEntries[active.idx][wantDir]) {
      active.dir = wantDir;
      render();
      return;
    }
    var r = (active.idx / SIZE) | 0, c = active.idx % SIZE;
    for (;;) {
      r += dr; c += dc;
      if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return;
      if (!isBlock(r * SIZE + c)) break;
    }
    active.idx = r * SIZE + c;
    if (!cellEntries[active.idx][active.dir]) active.dir = wantDir;
    render();
  }

  function advance(delta) {
    var ae = activeEntry();
    if (!ae) return;
    var cells = entryCells(ae);
    var pos = cells.indexOf(active.idx) + delta;
    if (pos >= 0 && pos < cells.length) active.idx = cells[pos];
  }

  // ---------- input ----------
  function startClock() {
    if (!state.started) state.started = true;
  }

  function typeLetter(ch) {
    if (finished()) return;
    startClock();
    var idx = active.idx;
    if (!state.locked[idx]) {
      state.user[idx] = ch;
      state.wrong[idx] = false;
    }
    advance(1);
    afterChange();
  }

  function backspace() {
    if (finished()) return;
    var idx = active.idx;
    if (state.user[idx] && !state.locked[idx]) {
      state.user[idx] = "";
      state.wrong[idx] = false;
    } else {
      advance(-1);
      var p = active.idx;
      if (!state.locked[p]) { state.user[p] = ""; state.wrong[p] = false; }
    }
    afterChange();
  }

  function afterChange() {
    save();
    render();
    checkWin();
  }

  function checkWin() {
    if (state.status !== "playing") return;
    for (var i = 0; i < SIZE * SIZE; i++) {
      if (!isBlock(i) && state.user[i] !== solution(i)) return;
    }
    state.status = "won";
    save();
    recordResult("won");
    render();
    setTimeout(function () { showResult(true); }, 450);
  }

  document.addEventListener("keydown", function (ev) {
    if ($("#dlg").open || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    var k = ev.key;
    // Space / Enter / Tab keep their normal meaning when a button has focus.
    var onGrid = ev.target === document.body || ev.target === kbd;
    if (/^[a-zA-Z]$/.test(k)) { ev.preventDefault(); typeLetter(k.toUpperCase()); }
    else if (k === "Backspace") { ev.preventDefault(); backspace(); }
    else if (k === "ArrowLeft") { ev.preventDefault(); moveArrow(0, -1); }
    else if (k === "ArrowRight") { ev.preventDefault(); moveArrow(0, 1); }
    else if (k === "ArrowUp") { ev.preventDefault(); moveArrow(-1, 0); }
    else if (k === "ArrowDown") { ev.preventDefault(); moveArrow(1, 0); }
    else if (k === "Escape") { kbd.blur(); }
    else if (!onGrid) { return; }
    else if (k === "Tab") { ev.preventDefault(); stepEntry(ev.shiftKey ? -1 : 1); }
    else if (k === " ") { ev.preventDefault(); selectCell(active.idx, true); }
    else if (k === "Enter") { ev.preventDefault(); stepEntry(1); }
  });

  // Soft keyboards often skip keydown details, so read the hidden input too.
  kbd.addEventListener("input", function () {
    var v = kbd.value;
    kbd.value = "_";
    if (v.length === 0) { backspace(); return; }
    var letters = v.replace(/[^a-zA-Z]/g, "");
    if (letters) typeLetter(letters.slice(-1).toUpperCase());
  });

  gridEl.addEventListener("click", function (ev) {
    var t = ev.target.closest(".cell");
    if (!t || finished()) return;
    selectCell(+t.dataset.idx, true);
  });

  $("#prevClue").addEventListener("click", function () { stepEntry(-1); });
  $("#nextClue").addEventListener("click", function () { stepEntry(1); });

  // ---------- helpers (hints) ----------
  var toastTimer = null;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  $("#btnGeneric").addEventListener("click", function () {
    var ae = activeEntry();
    if (!ae || state.generic[ae.id]) return;
    startClock();
    state.generic[ae.id] = true;
    state.hints.generic++;
    save(); render();
  });

  function markWrong(cells) {
    var bad = 0, empty = 0;
    cells.forEach(function (i) {
      if (!state.user[i]) { empty++; return; }
      var w = state.user[i] !== solution(i);
      state.wrong[i] = w;
      if (w) bad++;
    });
    return { bad: bad, empty: empty };
  }

  $("#btnCheckWord").addEventListener("click", function () {
    var ae = activeEntry();
    if (!ae) return;
    startClock();
    state.hints.check++;
    var res = markWrong(entryCells(ae));
    save(); render();
    toast(res.bad ? res.bad + " letter" + (res.bad > 1 ? "s" : "") + " wrong in this word."
      : res.empty ? "No mistakes so far, but the word isn't finished." : "Looks good!");
  });

  $("#btnCheckAll").addEventListener("click", function () {
    startClock();
    state.hints.check++;
    var all = [];
    for (var i = 0; i < SIZE * SIZE; i++) if (!isBlock(i)) all.push(i);
    var res = markWrong(all);
    save(); render();
    toast(res.bad ? res.bad + " wrong letter" + (res.bad > 1 ? "s" : "") + " marked in red."
      : "No mistakes so far!");
  });

  $("#btnRevealLetter").addEventListener("click", function () {
    if (finished()) return;
    var idx = active.idx;
    if (state.user[idx] === solution(idx)) { advance(1); render(); return; }
    startClock();
    state.user[idx] = solution(idx);
    state.locked[idx] = true;
    state.wrong[idx] = false;
    state.hints.letter++;
    advance(1);
    afterChange();
  });

  $("#btnRevealWord").addEventListener("click", function () {
    var ae = activeEntry();
    if (!ae || finished()) return;
    startClock();
    entryCells(ae).forEach(function (i) {
      if (state.user[i] !== solution(i)) {
        state.user[i] = solution(i);
        state.locked[i] = true;
      }
      state.wrong[i] = false;
    });
    state.hints.word++;
    afterChange();
  });

  var giveUpArmed = false, giveUpTimer = null;
  $("#btnGiveUp").addEventListener("click", function () {
    var b = $("#btnGiveUp");
    if (!giveUpArmed) {
      giveUpArmed = true;
      b.textContent = "Tap again to reveal all";
      b.classList.add("armed");
      giveUpTimer = setTimeout(disarm, 4000);
      return;
    }
    disarm();
    for (var i = 0; i < SIZE * SIZE; i++) {
      if (isBlock(i)) continue;
      if (state.user[i] !== solution(i)) state.locked[i] = true;
      state.user[i] = solution(i);
      state.wrong[i] = false;
    }
    state.status = "gaveup";
    save();
    recordResult("gaveup");
    render();
    showResult(false);
  });
  function disarm() {
    clearTimeout(giveUpTimer);
    giveUpArmed = false;
    var b = $("#btnGiveUp");
    b.textContent = "Give up";
    b.classList.remove("armed");
  }

  $("#btnStudy").addEventListener("click", function () { showStudy(); });

  // ---------- timer ----------
  setInterval(function () {
    if (state.status !== "playing" || !state.started || document.hidden) return;
    state.elapsed++;
    $("#timer").textContent = fmtTime(state.elapsed);
    if (state.elapsed % 5 === 0) save();
  }, 1000);

  document.addEventListener("visibilitychange", function () { if (document.hidden) save(); });
  window.addEventListener("pagehide", save);

  // ---------- dialog ----------
  var dlg = $("#dlg");
  var dlgTick = null;

  function openDialog(title, body) {
    $("#dlgTitle").textContent = title;
    var host = $("#dlgBody");
    host.textContent = "";
    host.appendChild(body);
    if (!dlg.open) dlg.showModal();
    host.scrollTop = 0;
  }
  function closeDialog() {
    if (dlg.open) dlg.close();
  }
  dlg.addEventListener("close", function () {
    clearInterval(dlgTick);
    if (!finished()) focusInput();
  });
  $("#dlgClose").addEventListener("click", closeDialog);
  dlg.addEventListener("click", function (ev) { if (ev.target === dlg) closeDialog(); });

  function statsBlock() {
    var s = computeStats();
    var wrap = el("div", "stats");
    [["Played", s.played], ["Solved", s.won], ["Streak", s.streak], ["Best streak", s.max]]
      .forEach(function (p) {
        var d = el("div", "stat");
        d.appendChild(el("b", null, p[1]));
        d.appendChild(el("span", null, p[0]));
        wrap.appendChild(d);
      });
    return wrap;
  }

  function shareText() {
    var rows = [];
    for (var r = 0; r < SIZE; r++) {
      var line = "";
      for (var c = 0; c < SIZE; c++) {
        var i = r * SIZE + c;
        line += isBlock(i) ? "⬛" : state.locked[i] ? "🟨" : "🟩";
      }
      rows.push(line);
    }
    var head = "RxCross #" + puzzle.number + " (" + key + ")\n" +
      (state.status === "won" ? "✅ " : "❌ ") + puzzle.entries.length + " brands · ⏱ " +
      fmtTime(state.elapsed) + " · 💡 " + totalHints() + " hint" + (totalHints() === 1 ? "" : "s");
    return head + "\n" + rows.join("\n");
  }

  function copyText(text) {
    function fallback() {
      var ta = el("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove();
      return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, fallback);
    }
    return Promise.resolve(fallback());
  }

  function showResult(won) {
    var body = el("div");
    if (won) {
      body.appendChild(el("p", null, "You filled the whole grid in " + fmtTime(state.elapsed) +
        " using " + totalHints() + " hint" + (totalHints() === 1 ? "" : "s") + "."));
    } else {
      body.appendChild(el("p", null, "No worries, the answers are revealed. Read the study list below, then come back tomorrow."));
    }
    body.appendChild(statsBlock());

    var pre = el("pre", "share", shareText());
    body.appendChild(pre);
    var actions = el("div", "row-actions");
    var share = el("button", "primary", "Copy result");
    share.addEventListener("click", function () {
      copyText(shareText()).then(function (ok) { share.textContent = ok ? "Copied!" : "Copy failed"; });
    });
    var study = el("button", null, "Study list");
    study.addEventListener("click", showStudy);
    actions.appendChild(share);
    actions.appendChild(study);
    body.appendChild(actions);

    if (key === today) {
      var cd = el("p", "countdown");
      body.appendChild(cd);
      var tick = function () {
        var now = new Date();
        var next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        var s = Math.max(0, Math.round((next - now) / 1000));
        var pad = function (n) { return (n < 10 ? "0" : "") + n; };
        cd.textContent = "Next puzzle in " + pad(Math.floor(s / 3600)) + ":" + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60);
      };
      tick();
      dlgTick = setInterval(tick, 1000);
    }
    openDialog(won ? "Solved!" : "Answers revealed", body);
  }

  function showStudy() {
    clearInterval(dlgTick);
    var body = el("div");
    body.appendChild(el("p", null, "Every brand in today's puzzle with its generic name and what it does."));
    var ul = el("ul", "study");
    puzzle.entries.slice().sort(function (a, b) { return a.brand.localeCompare(b.brand); })
      .forEach(function (e) {
        var li = el("li");
        li.appendChild(el("b", null, e.brand));
        li.appendChild(document.createTextNode(" → "));
        li.appendChild(el("span", "gen", e.generic));
        li.appendChild(el("span", "what", e.hint));
        ul.appendChild(li);
      });
    body.appendChild(ul);
    openDialog("Study list · #" + puzzle.number, body);
  }

  function showStats() {
    clearInterval(dlgTick);
    var body = el("div");
    body.appendChild(statsBlock());
    var best = computeStats().best;
    body.appendChild(el("p", "countdown", best == null ? "Solve a puzzle to set a best time." : "Fastest solve: " + fmtTime(best)));
    openDialog("Your stats", body);
  }

  function showArchive() {
    clearInterval(dlgTick);
    var body = el("div");
    body.appendChild(el("p", null, "Missed a day? Play any earlier puzzle."));
    var h = history();
    var ul = el("ul", "archive-list");
    var d = today, shown = 0;
    while (d >= P.LAUNCH_DATE && shown < 60) {
      var a = el("a");
      a.href = d === today ? location.pathname : "?date=" + d;
      var rec = h[d];
      a.appendChild(el("span", null, "#" + P.dayNumber(d) + (d === today ? " · Today" : "")));
      a.appendChild(el("small", null, d + (rec ? (rec.status === "won" ? " · solved" : " · revealed") : "")));
      var li = el("li", rec && rec.status === "won" ? "won" : "");
      li.appendChild(a);
      ul.appendChild(li);
      d = shiftKey(d, -1);
      shown++;
    }
    body.appendChild(ul);
    openDialog("Past puzzles", body);
  }

  function showHelp() {
    clearInterval(dlgTick);
    var body = el("div");
    body.appendChild(el("p", null, "A new " + SIZE + "×" + SIZE + " crossword appears every day. Every answer is a brand name from the study list, and each clue tells you what the drug does."));
    var ul = el("ul");
    [
      "Click a square, then type. Click it again (or press Space) to switch between across and down.",
      "Tab / Enter jumps to the next clue. Arrow keys move around the grid.",
      "Stuck? Generic hint shows the start and end of the generic name.",
      "Check marks mistakes in red. Reveal fills a letter or the whole word (shown in blue).",
      "Answers have no hyphens or spaces: Klor-Con is KLORCON.",
      "When you finish, the study list shows each brand with its generic name."
    ].forEach(function (t) { ul.appendChild(el("li", null, t)); });
    body.appendChild(ul);
    body.appendChild(el("p", "countdown", "Everyone gets the same puzzle on the same date. Your progress is saved in this browser."));
    openDialog("How to play", body);
    store("rxcross:seenHelp", true);
  }

  $("#btnStats").addEventListener("click", showStats);
  $("#btnArchive").addEventListener("click", showArchive);
  $("#btnHelp").addEventListener("click", showHelp);

  // ---------- init ----------
  $("#puzzleLabel").textContent = "Puzzle #" + puzzle.number + " · " + key;
  if (key !== today) {
    var note = $("#archiveNote");
    note.hidden = false;
    var link = el("a", null, "Back to today");
    link.href = location.pathname;
    note.appendChild(link);
  }
  buildGrid();
  buildClues();
  render();
  if (!store("rxcross:seenHelp") && !state.started) showHelp();
  else if (state.status !== "playing") { /* finished puzzles reopen quietly */ }
  window.addEventListener("load", function () { if (!dlg.open) focusInput(); });
})();
