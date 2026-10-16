// Night Shift: run a late-night apothecary as Mia. Top-down shop floor with the
// camera locked on Mia, a first-person counter view for checking paperwork, a
// "watch then imitate" compounding mini game and techs you can hire.
(function () {
  "use strict";

  var T = NS.TILE;
  var MAP = NS.MAP;
  var SPOTS = NS.SPOTS;
  var SAVE_KEY = "nightshift.save.v1";
  var SOLID_FOR_STAFF = "#SHBTcRKGphD.";
  var CUSTOMER_FLOOR = ".hD";

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function pick(list) { return list[(Math.random() * list.length) | 0]; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function tileAt(x, y) {
    if (y < 0 || y >= MAP.length || x < 0 || x >= MAP[0].length) return "#";
    return MAP[y][x];
  }
  function spotPos(spot) { return { x: spot[0] * T + 8, y: spot[1] * T + 13 }; }
  function money(n) { return (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)); }

  function fmtDate(d) { return (d.m) + "/" + d.d + "/" + d.y; }
  function dateFromJs(js) { return { m: js.getMonth() + 1, d: js.getDate(), y: js.getFullYear() }; }
  function addDays(base, days) {
    var js = new Date(base.y, base.m - 1, base.d);
    js.setDate(js.getDate() + days);
    return dateFromJs(js);
  }
  var TODAY = dateFromJs(new Date());

  // ---------- persistent state ----------
  var save = loadSave();

  function freshSave() {
    var stock = {};
    Object.keys(NS.INGREDIENTS).forEach(function (k) { stock[k] = 0; });
    ["moon", "root", "shroom", "bone", "wax", "eye", "bat"].forEach(function (k) { stock[k] = 4; });
    return { level: 1, bank: 40, stock: stock, techs: 0 };
  }

  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.level && s.stock) return s;
      }
    } catch (e) { /* private mode or corrupt save: start fresh */ }
    return null;
  }

  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
  }

  // ---------- canvas ----------
  var canvas = $("world");
  var ctx = canvas.getContext("2d");
  var mapCanvas = NS.renderMap(MAP);
  var view = { w: 320, h: 180, k: 6, dpr: 1 };

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    var cssW = window.innerWidth, cssH = window.innerHeight;
    var target = Math.max(2, Math.min(cssW / (17 * T), cssH / (11 * T)));
    var k = Math.max(2, Math.round(target * dpr));
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    view = { w: canvas.width / k, h: canvas.height / k, k: k, dpr: dpr };
    resizePov();
  }

  // ---------- game state ----------
  var mode = "title";
  var level = 1, cfg = NS.levelConfig(1);
  var day = null;
  var player = { x: 0, y: 0, dir: "down", frame: 0, animT: 0, moving: false };
  var customers = [];
  var queue = [];
  var orders = [];
  var techs = [];
  var floaters = [];
  var nextId = 1;
  var keys = {};
  var time = 0;

  function unlockedRemedies() {
    return NS.REMEDIES.filter(function (r) { return r.level <= level; });
  }

  function unlockedIngredients() {
    var seen = {};
    unlockedRemedies().forEach(function (r) { r.recipe.forEach(function (k) { seen[k] = true; }); });
    return Object.keys(NS.INGREDIENTS).filter(function (k) { return seen[k]; });
  }

  function hasStock(remedy) {
    var need = {};
    remedy.recipe.forEach(function (k) { need[k] = (need[k] || 0) + 1; });
    return Object.keys(need).every(function (k) { return save.stock[k] >= need[k]; });
  }

  function useStock(remedy) {
    remedy.recipe.forEach(function (k) { save.stock[k]--; });
  }

  // ---------- path finding (BFS on the tile grid) ----------
  function walkable(x, y, who) {
    var c = tileAt(x, y);
    if (who === "customer") return CUSTOMER_FLOOR.indexOf(c) >= 0;
    return c === ",";
  }

  function findPath(from, to, who) {
    var W = MAP[0].length, H = MAP.length;
    var prev = new Array(W * H).fill(-1);
    var start = from[1] * W + from[0], goal = to[1] * W + to[0];
    var q = [start];
    prev[start] = start;
    while (q.length) {
      var cur = q.shift();
      if (cur === goal) break;
      var cx = cur % W, cy = (cur / W) | 0;
      var nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var i = 0; i < 4; i++) {
        var nx = cx + nb[i][0], ny = cy + nb[i][1];
        var ni = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || prev[ni] !== -1) continue;
        if (!walkable(nx, ny, who) && ni !== goal) continue;
        prev[ni] = cur;
        q.push(ni);
      }
    }
    if (prev[goal] === -1) return [];
    var path = [];
    for (var n = goal; n !== start; n = prev[n]) path.unshift([n % W, (n / W) | 0]);
    return path;
  }

  function tileOf(ent) { return [Math.floor(ent.x / T), Math.floor((ent.y - 5) / T)]; }

  function sendTo(ent, spot, who) {
    ent.path = findPath(tileOf(ent), spot, who);
  }

  function followPath(ent, speed, dt) {
    if (!ent.path || !ent.path.length) { ent.moving = false; return true; }
    var target = spotPos(ent.path[0]);
    var dx = target.x - ent.x, dy = target.y - ent.y;
    var d = Math.hypot(dx, dy);
    var stepLen = speed * dt;
    if (d <= stepLen) {
      ent.x = target.x; ent.y = target.y;
      ent.path.shift();
    } else {
      ent.x += dx / d * stepLen;
      ent.y += dy / d * stepLen;
    }
    if (Math.abs(dx) > Math.abs(dy)) ent.dir = dx > 0 ? "right" : "left";
    else if (d > 0.01) ent.dir = dy > 0 ? "down" : "up";
    ent.moving = true;
    ent.animT += dt;
    ent.frame = Math.floor(ent.animT * 8) % 4;
    return !ent.path.length;
  }

  // ---------- customers ----------
  function randomDob() {
    return { m: randInt(1, 12), d: randInt(1, 28), y: randInt(1944, 2006) };
  }

  function randomLook() {
    var style = pick(["short", "short", "long", "long", "bun", "bald", "cap"]);
    return {
      skin: pick(NS.SKIN), hair: pick(NS.HAIR), hairStyle: style,
      top: pick(NS.TOPS), bottom: pick(NS.BOTTOMS), shoes: "#222222",
      hat: pick(NS.TOPS), glasses: Math.random() < 0.2
    };
  }

  function misspell(word) {
    if (word.length < 4) return word + "e";
    var i = randInt(1, word.length - 3);
    return word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2);
  }

  function otherName(first, last) {
    var r = Math.random();
    if (r < 0.4) {
      var l2 = pick(NS.LAST.filter(function (n) { return n !== last; }));
      return first + " " + l2;
    }
    if (r < 0.7) {
      var f2 = pick(NS.FIRST.filter(function (n) { return n !== first; }));
      return f2 + " " + last;
    }
    var m = misspell(last);
    return first + " " + (m === last ? last + "s" : m);
  }

  function otherDob(dob) {
    var r = Math.random();
    if (r < 0.35 && dob.d <= 12 && dob.d !== dob.m) return { m: dob.d, d: dob.m, y: dob.y };
    if (r < 0.7) return { m: dob.m, d: dob.d, y: dob.y + pick([-3, -2, -1, 1, 2, 3]) };
    return { m: dob.m, d: dob.d <= 3 ? dob.d + randInt(1, 3) : dob.d - randInt(1, 3), y: dob.y };
  }

  function makeCustomer() {
    var first = pick(NS.FIRST), last = pick(NS.LAST);
    var dob = randomDob();
    var look = randomLook();
    if (Math.random() < 0.06) {
      first = "Stefan"; last = "Pretorius";
      dob = { m: 2, d: 4, y: 2003 };
      look = { skin: "#f1c7a5", hair: "#5a3720", hairStyle: "short", top: "#2d4f8b",
        bottom: "#24304a", shoes: "#222222", glasses: false };
    }
    var name = first + " " + last;
    var remedy = pick(unlockedRemedies());
    var doctor = pick(NS.DOCTORS);

    var c = {
      id: nextId++, first: first, last: last, name: name, dob: dob, look: look,
      card: {
        name: name, dob: dob, look: look,
        exp: addDays(TODAY, randInt(60, 1600)),
        number: "D" + randInt(1000000, 9999999)
      },
      rx: {
        patient: name, dob: dob, remedy: remedy, qty: pick([1, 1, 2]),
        doctor: doctor, clinic: pick(NS.CLINICS), signed: true,
        written: addDays(TODAY, -randInt(0, 20))
      },
      record: {
        name: name, dob: dob,
        allergy: Math.random() < 0.35 ? pick(Object.keys(NS.INGREDIENTS).filter(function (k) {
          return remedy.recipe.indexOf(k) < 0;
        })) : null
      },
      fault: null,
      greeting: pick(NS.GREETINGS).replace("{name}", name).replace("{dob}", fmtDate(dob)),
      called: false,
      x: 0, y: 0, dir: "up", frame: 0, animT: 0, path: [], moving: false,
      state: "queue", patience: 0, patienceMax: 0, seat: null, emote: null, emoteT: 0,
      mood: "neutral"
    };

    if (Math.random() < cfg.faultChance) {
      var options = Object.keys(NS.FAULTS).filter(function (f) { return NS.FAULTS[f].level <= level; });
      c.fault = pick(options);
      switch (c.fault) {
        case "idName": c.card.name = otherName(first, last); break;
        case "idDob": c.card.dob = otherDob(dob); break;
        case "idExpired": c.card.exp = addDays(TODAY, -randInt(1, 400)); break;
        case "rxName": c.rx.patient = otherName(first, last); break;
        case "rxUnsigned": c.rx.signed = false; break;
        case "rxForged": break;
        case "idPhoto": {
          var alt = randomLook();
          while (alt.hairStyle === look.hairStyle) alt.hairStyle = pick(["short", "long", "bun", "bald", "cap"]);
          c.card.look = alt;
          break;
        }
        case "allergy": c.record.allergy = pick(remedy.recipe); break;
      }
    }
    return c;
  }

  function spawnCustomer() {
    if (queue.length >= SPOTS.queue.length || customers.length >= 12) return;
    var c = makeCustomer();
    var p = spotPos(SPOTS.door);
    c.x = p.x; c.y = p.y;
    c.patienceMax = c.patience = Math.max(45, 85 - level * 4);
    customers.push(c);
    queue.push(c);
    sendTo(c, SPOTS.queue[queue.length - 1], "customer");
  }

  function relineQueue() {
    queue.forEach(function (c, i) { sendTo(c, SPOTS.queue[i], "customer"); });
  }

  function leaveQueue(c) {
    var i = queue.indexOf(c);
    if (i >= 0) { queue.splice(i, 1); relineQueue(); }
  }

  function freeSeat() {
    var taken = customers.map(function (c) { return c.seat && c.seat.join(","); });
    var all = SPOTS.chairs.concat(SPOTS.standing);
    for (var i = 0; i < all.length; i++) {
      if (taken.indexOf(all[i].join(",")) < 0) return all[i];
    }
    return SPOTS.standing[0];
  }

  function customerLeaves(c, emote) {
    leaveQueue(c);
    c.state = "leaving";
    c.seat = null;
    c.emote = emote || null;
    c.emoteT = 2.5;
    sendTo(c, SPOTS.door, "customer");
  }

  function atCounter() {
    var c = queue[0];
    if (!c || c.path.length) return null;
    var slot = spotPos(SPOTS.queue[0]);
    return Math.hypot(c.x - slot.x, c.y - slot.y) < 2 ? c : null;
  }

  function updateCustomers(dt) {
    for (var i = customers.length - 1; i >= 0; i--) {
      var c = customers[i];
      var arrived = followPath(c, c.state === "leaving" ? 46 : 38, dt);
      if (!c.moving) { c.frame = 0; c.animT = 0; }
      if (c.emoteT > 0) { c.emoteT -= dt; if (c.emoteT <= 0) c.emote = null; }

      if (c.state === "queue" && arrived) c.dir = "up";
      if (c.state === "waiting" && arrived) c.dir = "up";

      if (c.state === "queue" || c.state === "waiting") {
        var slow = (mode === "pov" && pov.cust === c) ? 0.35 : 1;
        c.patience -= dt * slow;
        if (c.patience <= 0) walkout(c);
      }
      if (c.state === "leaving" && arrived) customers.splice(i, 1);
    }
  }

  function walkout(c) {
    var o = orders.find(function (o) { return o.cust === c; });
    if (o) {
      orders.splice(orders.indexOf(o), 1);
      if (o.maker && o.maker !== "mia") o.maker.order = null;
      if (mode === "mix" && mix.order === o) closeMix(false);
    }
    if (mode === "pov" && pov.cust === c) closePov();
    day.walkouts++;
    toast(c.first + " got tired of waiting and left.", "bad");
    customerLeaves(c, "angry");
  }

  // ---------- techs ----------
  function addTech(i) {
    var look = NS.TECH_LOOKS[i];
    var p = spotPos(SPOTS.staffIdle[i % SPOTS.staffIdle.length]);
    techs.push({
      name: look.name, look: look, x: p.x, y: p.y, dir: "down", frame: 0, animT: 0,
      path: [], moving: false, state: "idle", order: null, bench: null, t: 0, wander: rand(1, 4)
    });
  }

  function freeBench() {
    var used = techs.map(function (t) { return t.bench && t.bench.join(","); });
    for (var i = 0; i < SPOTS.benches.length; i++) {
      if (used.indexOf(SPOTS.benches[i].join(",")) < 0) return SPOTS.benches[i];
    }
    return null;
  }

  function updateTechs(dt) {
    techs.forEach(function (t) {
      var arrived = followPath(t, 44, dt);
      if (!t.moving) { t.frame = 0; t.animT = 0; }

      if (t.state !== "idle" && (!t.order || orders.indexOf(t.order) < 0)) {
        t.state = "idle"; t.order = null; t.bench = null;
      }

      if (t.state === "idle") {
        var o = orders.find(function (o) { return o.status === "pending" && hasStock(o.remedy); });
        var bench = o && freeBench();
        if (o && bench) {
          o.status = "making"; o.maker = t;
          useStock(o.remedy);
          t.order = o; t.bench = bench; t.state = "toBench";
          sendTo(t, bench, "staff");
          return;
        }
        t.wander -= dt;
        if (t.wander <= 0 && !t.path.length) {
          t.wander = rand(3, 7);
          sendTo(t, pick(SPOTS.staffIdle), "staff");
        }
      } else if (t.state === "toBench" && arrived) {
        t.state = "working"; t.t = 0; t.dir = "left";
      } else if (t.state === "working") {
        t.t += dt;
        if (t.t >= NS.TECH_WORK_TIME) {
          t.order.status = "ready"; t.order.maker = null;
          toast(t.name + " bagged " + t.order.remedy.name + " for " + t.order.cust.first + ".", "good");
          t.order = null; t.bench = null; t.state = "idle"; t.wander = rand(0.5, 2);
        }
      }
    });
  }

  // ---------- player ----------
  function solidForPlayer(px, py) {
    var tx = Math.floor(px / T), ty = Math.floor(py / T);
    return SOLID_FOR_STAFF.indexOf(tileAt(tx, ty)) >= 0;
  }

  function blocked(x, y) {
    // feet hitbox: 8 wide, 5 tall
    return solidForPlayer(x - 4, y - 5) || solidForPlayer(x + 3, y - 5) ||
           solidForPlayer(x - 4, y - 1) || solidForPlayer(x + 3, y - 1);
  }

  function updatePlayer(dt) {
    var dx = 0, dy = 0;
    if (keys.ArrowLeft || keys.KeyA) dx -= 1;
    if (keys.ArrowRight || keys.KeyD) dx += 1;
    if (keys.ArrowUp || keys.KeyW) dy -= 1;
    if (keys.ArrowDown || keys.KeyS) dy += 1;
    player.moving = dx !== 0 || dy !== 0;
    if (!player.moving) { player.frame = 0; player.animT = 0; return; }
    var len = Math.hypot(dx, dy);
    var sp = 72 * dt;
    var nx = player.x + dx / len * sp;
    var ny = player.y + dy / len * sp;
    if (!blocked(nx, player.y)) player.x = nx;
    if (!blocked(player.x, ny)) player.y = ny;
    if (Math.abs(dx) >= Math.abs(dy)) player.dir = dx > 0 ? "right" : "left";
    else player.dir = dy > 0 ? "down" : "up";
    player.animT += dt;
    player.frame = Math.floor(player.animT * 9) % 4;
  }

  // What Mia would interact with right now: the tile she faces first, then any neighbour.
  function interactTarget() {
    var tx = Math.floor(player.x / T), ty = Math.floor((player.y - 3) / T);
    var dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    var order = [dirs[player.dir]].concat([[0, -1], [0, 1], [-1, 0], [1, 0]]);
    // Work stations beat flavour shelves, otherwise a shelf behind Mia
    // would steal the prompt from the counter she's standing at.
    var groups = ["RKBT", "SH"];
    for (var g = 0; g < groups.length; g++) {
      for (var i = 0; i < order.length; i++) {
        var x = tx + order[i][0], y = ty + order[i][1];
        var c = tileAt(x, y);
        if (groups[g].indexOf(c) >= 0) return { tile: c, x: x, y: y };
      }
    }
    return null;
  }

  function promptFor(target) {
    if (!target) return "";
    switch (target.tile) {
      case "R": {
        var c = atCounter();
        return c ? "Serve " + c.first : (queue.length ? "Someone's on their way" : "Nobody at the drop-off");
      }
      case "K": {
        var ready = orders.filter(function (o) { return o.status === "ready"; }).length;
        return ready ? "Hand over order (" + ready + " ready)" : "No orders ready";
      }
      case "B": return "Compound a script";
      case "T": return "Use the terminal";
      case "S": return "Check the jars";
      case "H": return "Look at the shelves";
    }
    return "";
  }

  function interact() {
    var target = interactTarget();
    if (!target) return;
    switch (target.tile) {
      case "R": {
        var c = atCounter();
        if (c) openPov(c);
        else toast(queue.length ? "Hang on, they're still walking up." : "Nobody's waiting. Enjoy the quiet.");
        break;
      }
      case "K": handOver(); break;
      case "B": startCompound(); break;
      case "T": openTerminal(); break;
      case "S": {
        var low = unlockedIngredients().filter(function (k) { return save.stock[k] < 3; });
        toast(low.length ? "Running low on " + low.map(function (k) { return NS.INGREDIENTS[k].name; }).join(", ") + "."
          : "Jars look well stocked.");
        break;
      }
      case "H":
        toast(pick(["Boxes of eye of newt. Not the good brand.", "Someone alphabetised the curses again.",
          "A box labelled DO NOT OPEN UNDER A FULL MOON.", "Mostly garlic. Just in case."]));
        break;
    }
  }

  function handOver() {
    var o = orders.find(function (o) { return o.status === "ready"; });
    if (!o) { toast("Nothing's ready. Compound something at the bench first."); return; }
    orders.splice(orders.indexOf(o), 1);
    var c = o.cust;
    var earned = o.remedy.price * o.qty;
    save.bank += earned;
    day.earned += earned;
    day.served++;
    c.state = "collecting";
    c.seat = null;
    c.path = findPath(tileOf(c), SPOTS.pickupCustomer, "customer");
    c.after = function () { customerLeaves(c, "heart"); };
    floaters.push({ x: c.x, y: c.y - 24, text: "+" + money(earned), t: 1.6, good: true });
    toast("Handed " + o.remedy.name + " to " + c.first + ". " + money(earned) + ".", "good");
  }

  // ---------- day lifecycle ----------
  function startDay() {
    cfg = NS.levelConfig(level);
    day = {
      t: 0, spawnT: 2, earned: 0, served: 0, catches: 0, walkouts: 0, strikes: 0,
      turnedAway: 0, over: false
    };
    customers = []; queue = []; orders = []; techs = []; floaters = [];
    for (var i = 0; i < Math.min(save.techs, cfg.techSlots); i++) addTech(i);
    // Tonight's delivery: never start a night completely out of anything.
    var topped = false;
    unlockedIngredients().forEach(function (k) {
      if (save.stock[k] < 2) { save.stock[k] = 2; topped = true; }
    });
    var p = spotPos(SPOTS.playerStart);
    player.x = p.x; player.y = p.y; player.dir = "down";
    setMode("play");
    if (topped) toast("The wholesaler dropped off a few jars to get you through the night.");
  }

  function endDay(reason) {
    if (day.over) return;
    day.over = true;
    if (mode === "pov") closePov();
    if (mode === "mix") closeMix(false);
    if (mode === "terminal") closeTerminal();
    var wages = Math.min(save.techs, cfg.techSlots) * NS.TECH_WAGE;
    save.bank -= wages;
    var passed = reason !== "strikes" && day.earned >= cfg.goal;
    var body = $("endBody");
    body.textContent = "";
    var title = passed ? "Night " + level + " survived" : (reason === "strikes" ? "Shut down for the night" : "Not quite");
    $("endTitle").textContent = title;
    var lines = [
      ["Earned", money(day.earned) + " of " + money(cfg.goal)],
      ["Scripts filled", day.served],
      ["Good catches", day.catches],
      ["Walkouts", day.walkouts],
      ["Strikes", day.strikes + " / " + NS.STRIKES_ALLOWED],
      ["Tech wages", wages ? "-" + money(wages) : "none"],
      ["Bank", money(save.bank)]
    ];
    var dl = el("dl", "summary");
    lines.forEach(function (l) {
      dl.appendChild(el("dt", null, l[0]));
      dl.appendChild(el("dd", null, String(l[1])));
    });
    body.appendChild(dl);
    var note = passed ? "The coven board is pleased. Tomorrow will be busier."
      : reason === "strikes" ? "Three strikes and the board closes the counter. Try the night again."
      : "You need " + money(cfg.goal) + " to keep the lights on. Try the night again.";
    body.appendChild(el("p", "end-note", note));
    if (passed) level++;
    save.level = level;
    writeSave();
    $("btnNext").textContent = passed ? "Next night" : "Try again";
    setMode("dayEnd");
  }

  function strike(msg) {
    day.strikes++;
    save.bank -= NS.FINE;
    day.earned -= NS.FINE;
    toast("Strike " + day.strikes + ": " + msg + " -" + money(NS.FINE) + ".", "bad");
    if (day.strikes >= NS.STRIKES_ALLOWED) setTimeout(function () { endDay("strikes"); }, 900);
  }

  // ---------- modes and overlays ----------
  function setMode(m) {
    mode = m;
    document.body.dataset.mode = m;
    ["title", "intro", "pov", "mix", "terminal", "dayEnd", "paused"].forEach(function (id) {
      $(id).hidden = id !== m;
    });
    $("hud").hidden = m === "title" || m === "intro" || m === "dayEnd";
    $("touch").hidden = m !== "play" || !isTouch;
    if (m !== "play") $("prompt").hidden = true;
    keys = {};
  }

  function showTitle() {
    $("btnContinue").hidden = !save;
    if (save) $("btnContinue").textContent = "Continue (night " + save.level + ")";
    setMode("title");
  }

  function showIntro() {
    level = save.level;
    cfg = NS.levelConfig(level);
    $("introTitle").textContent = "Night " + level;
    var list = $("introNotes");
    list.textContent = "";
    var notes = NS.LEVEL_NOTES[Math.min(level, 5)] || [];
    if (level > 5) notes = ["The rush keeps growing. Keep your head."];
    notes.forEach(function (n) { list.appendChild(el("li", null, n)); });
    var news = NS.REMEDIES.filter(function (r) { return r.level === level; });
    if (news.length) list.appendChild(el("li", null, "New remedies: " + news.map(function (r) { return r.name; }).join(", ") + "."));
    $("introGoal").textContent = "Goal: earn " + money(cfg.goal) + " before 4am. Bank: " + money(save.bank) + ".";
    setMode("intro");
  }

  // ---------- toasts, HUD ----------
  function toast(text, kind) {
    var t = el("div", "toast" + (kind ? " " + kind : ""), text);
    $("toasts").appendChild(t);
    setTimeout(function () { t.classList.add("out"); }, 3200);
    setTimeout(function () { t.remove(); }, 3700);
    while ($("toasts").children.length > 4) $("toasts").firstChild.remove();
  }

  var hudT = 0;
  function updateHud(dt) {
    hudT -= dt;
    if (hudT > 0) return;
    hudT = 0.15;
    var mins = Math.floor(day.t / cfg.dayLength * 8 * 60);
    var hh = (20 + Math.floor(mins / 60)) % 24, mm = mins % 60;
    $("hudNight").textContent = "Night " + level;
    $("hudClock").textContent = (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
    $("hudGoal").textContent = money(day.earned) + " / " + money(cfg.goal);
    $("hudGoal").classList.toggle("met", day.earned >= cfg.goal);
    $("hudBank").textContent = "Bank " + money(save.bank);
    var s = "";
    for (var i = 0; i < NS.STRIKES_ALLOWED; i++) s += i < day.strikes ? "✖" : "○";
    $("hudStrikes").textContent = s;

    var box = $("hudOrders");
    box.textContent = "";
    var waitingAtCounter = atCounter();
    if (waitingAtCounter) box.appendChild(el("div", "order counter", waitingAtCounter.first + " is at the drop-off"));
    orders.forEach(function (o) {
      var label = o.status === "ready" ? "Ready: hand over" :
        o.maker && o.maker !== "mia" ? o.maker.name + " is making it" :
        o.status === "making" ? "On the bench" : hasStock(o.remedy) ? "To compound" : "Out of stock!";
      var row = el("div", "order " + o.status);
      row.appendChild(el("strong", null, o.cust.first + ": " + o.remedy.name));
      row.appendChild(el("span", null, label));
      var bar = el("i", "patience");
      bar.style.width = clamp(o.cust.patience / o.cust.patienceMax * 100, 0, 100) + "%";
      row.appendChild(bar);
      box.appendChild(row);
    });

    var pr = mode === "play" ? promptFor(interactTarget()) : "";
    $("prompt").hidden = !pr;
    if (pr) $("promptText").textContent = pr;
  }

  // ---------- world rendering ----------
  function renderWorld() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#121218";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!day) return;

    var camX = Math.round(player.x - view.w / 2);
    var camY = Math.round(player.y - 9 - view.h / 2);
    ctx.setTransform(view.k, 0, 0, view.k, -camX * view.k, -camY * view.k);
    ctx.drawImage(mapCanvas, 0, 0);

    // cauldron bubbles
    var bx = 1 * T, by = 4 * T;
    for (var b = 0; b < 3; b++) {
      var ph = (time * 0.8 + b * 0.33) % 1;
      ctx.fillStyle = "rgba(120,255,170," + (1 - ph).toFixed(2) + ")";
      ctx.fillRect(bx + 4 + b * 3, by + 4 - Math.round(ph * 8), 1, 1);
    }

    var ents = customers.map(function (c) { return { e: c, kind: "c" }; })
      .concat(techs.map(function (t) { return { e: t, kind: "t" }; }))
      .concat([{ e: player, kind: "p" }]);
    ents.sort(function (a, b) { return a.e.y - b.e.y; });
    ents.forEach(function (it) {
      var e = it.e;
      var look = it.kind === "p" ? NS.MIA_LOOK : e.look;
      NS.drawPerson(ctx, e.x, e.y, e.dir, e.frame, look, 0);
    });

    // emotes and bars above heads
    customers.forEach(function (c) {
      var kind = c.emote;
      if (!kind && c === atCounter()) kind = "!";
      if (!kind && (c.state === "queue" || c.state === "waiting") && c.patience / c.patienceMax < 0.3) kind = "...";
      if (!kind && c.state === "waiting" && orders.some(function (o) { return o.cust === c && o.status === "ready"; })) kind = "rx";
      if (kind) NS.drawEmote(ctx, c.x, c.y, kind);
    });
    techs.forEach(function (t) {
      if (t.state === "working") {
        ctx.fillStyle = "#1b1b1b";
        ctx.fillRect(Math.round(t.x) - 7, Math.round(t.y) - 24, 14, 3);
        ctx.fillStyle = "#3fd17a";
        ctx.fillRect(Math.round(t.x) - 6, Math.round(t.y) - 23, Math.round(12 * t.t / NS.TECH_WORK_TIME), 1);
      }
    });

    // floaters in screen space so the text stays crisp
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    var fs = Math.round(view.k * 4.5);
    ctx.font = fs + "px 'Press Start 2P', monospace";
    ctx.textAlign = "center";
    floaters.forEach(function (f) {
      var sx = (f.x - camX) * view.k, sy = (f.y - camY - (1.6 - f.t) * 10) * view.k;
      ctx.globalAlpha = clamp(f.t, 0, 1);
      ctx.fillStyle = "#1b1b1b";
      ctx.fillText(f.text, sx + 2, sy + 2);
      ctx.fillStyle = f.good ? "#7ef0a0" : "#ff8a80";
      ctx.fillText(f.text, sx, sy);
    });
    ctx.globalAlpha = 1;
  }

  // ---------- first-person counter view ----------
  var povCanvas = $("povCanvas");
  var pctx = povCanvas.getContext("2d");
  var POV_W = 440, POV_H = 180;
  var pov = { cust: null, cam: 60, camTarget: 60, vw: 320, s: 4, ox: 0, oy: 0, hover: null,
    typed: 0, line: "", mood: "neutral", panels: [], busy: false, mouse: null };
  var POV_ITEMS = {
    computer: { x: 26, y: 58, w: 86, h: 72, label: "Computer" },
    id:       { x: 156, y: 145, w: 42, h: 27, label: "ID card" },
    rx:       { x: 244, y: 138, w: 44, h: 40, label: "Prescription" },
    phone:    { x: 338, y: 116, w: 58, h: 36, label: "Phone" }
  };
  var STARS = [];
  for (var si = 0; si < 40; si++) STARS.push([Math.random() * POV_W, Math.random() * 70 + 16]);

  function resizePov() {
    var dpr = window.devicePixelRatio || 1;
    var w = window.innerWidth, h = window.innerHeight;
    // Keep the desk clear of the dialogue box and buttons along the bottom.
    var s = Math.max(h * 0.55, h - 190) / POV_H;
    var vw = w / s;
    if (vw < 240) { vw = 240; s = w / 240; }
    vw = Math.min(vw, POV_W);
    povCanvas.width = Math.round(w * dpr);
    povCanvas.height = Math.round(h * dpr);
    povCanvas.style.width = w + "px";
    povCanvas.style.height = h + "px";
    pov.vw = vw;
    pov.s = s * dpr;
    pov.ox = Math.max(0, (w - vw * s) / 2) * dpr;
    pov.oy = 0;
  }

  function povToWorld(clientX, clientY) {
    var dpr = window.devicePixelRatio || 1;
    return {
      x: (clientX * dpr - pov.ox) / pov.s + pov.cam,
      y: (clientY * dpr - pov.oy) / pov.s
    };
  }

  function itemAt(pt) {
    for (var k in POV_ITEMS) {
      var it = POV_ITEMS[k];
      if (pt.x >= it.x && pt.x <= it.x + it.w && pt.y >= it.y && pt.y <= it.y + it.h) return k;
    }
    return null;
  }

  function openPov(c) {
    pov.cust = c;
    pov.mood = "neutral";
    pov.busy = false;
    pov.panels = [];
    $("povPanels").textContent = "";
    var again = c.greeted;
    c.greeted = true;
    say(again ? "Still here. " + c.greeting : c.greeting);
    setMode("pov");
    $("povActions").hidden = false;
  }

  function closePov() {
    pov.cust = null;
    setMode("play");
  }

  function say(text) {
    pov.line = text;
    pov.typed = 0;
  }

  function drawPovScene() {
    var g = pctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#0c0c10";
    g.fillRect(0, 0, povCanvas.width, povCanvas.height);
    g.imageSmoothingEnabled = false;
    g.setTransform(pov.s, 0, 0, pov.s, pov.ox - pov.cam * pov.s, pov.oy);
    g.save();
    g.beginPath();
    g.rect(pov.cam, 0, pov.vw, POV_H * 3);
    g.clip();

    function r(x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }

    // shop front wall with night windows
    r(0, 0, POV_W, 110, "#6d4f6e");
    r(0, 0, POV_W, 8, "#2a2a33");
    r(0, 104, POV_W, 6, "#583f59");
    [[16, 140], [300, 124]].forEach(function (wnd) {
      var x = wnd[0], w = wnd[1];
      r(x - 3, 14, w + 6, 80, "#2a2a33");
      r(x, 17, w, 74, "#161a33");
      r(x, 60, w, 31, "#1d2342");
      STARS.forEach(function (st) {
        if (st[0] > x && st[0] < x + w && st[1] < 88) r(Math.round(st[0]), Math.round(st[1]), 1, 1, "#e8e4c9");
      });
      r(x + w / 2 - 1, 17, 2, 74, "#2a2a33");
    });
    for (var my = 0; my < 14; my++) {
      for (var mx = 0; mx < 14; mx++) {
        var lit = Math.hypot(mx - 6.5, my - 6.5) < 7;
        var shadow = Math.hypot(mx - 10, my - 4.5) < 6.5;
        if (lit && !shadow) r(342 + mx, 24 + my, 1, 1, "#f2ecc7");
      }
    }
    // door
    r(178, 20, 84, 86, "#2a2a33");
    r(182, 24, 76, 82, "#33405e");
    r(186, 28, 30, 74, "#3d4d70");
    r(224, 28, 30, 74, "#3d4d70");
    // shop floor
    for (var fx = 0; fx < POV_W; fx += 20) {
      r(fx, 110, 20, 26, ((fx / 20) % 2) ? "#d9c7a4" : "#e8dbbd");
    }
    // gondolas at the sides
    r(4, 78, 60, 40, "#efefef");
    r(4, 78, 60, 3, "#ffffff");
    r(380, 80, 56, 38, "#efefef");
    for (var gx = 0; gx < 5; gx++) {
      r(8 + gx * 11, 84, 8, 10, ["#7b4fd1", "#2fae8f", "#d14f6a", "#e0a12b", "#4f7bd1"][gx]);
      r(384 + gx * 10, 86, 7, 9, ["#e0a12b", "#4f7bd1", "#7b4fd1", "#d14f6a", "#2fae8f"][gx]);
    }

    // the rest of the queue, further back
    var rest = queue.filter(function (c) { return c !== pov.cust; }).slice(0, 3);
    g.globalAlpha = 0.85;
    rest.forEach(function (c, i) {
      var cx = [150, 300, 110][i];
      NS.drawBust(g, cx, 118, 1.6, c.look, "neutral", false);
    });
    g.globalAlpha = 1;

    // the customer at the counter
    if (pov.cust) {
      var blink = (time % 3.4) < 0.12;
      var bob = Math.round(Math.sin(time * 1.6) * 1);
      NS.drawBust(g, 220, 146 + bob, 3, pov.cust.look, pov.mood, blink);
    }

    // counter
    r(0, 128, POV_W, 6, "#e5c08a");
    r(0, 134, POV_W, POV_H * 2, "#c99a64");
    for (var gy = 0; gy < 20; gy++) r(0, 140 + gy * 9, POV_W, 1, "#b88a55");

    // computer
    r(26, 58, 86, 62, "#22252b");
    r(31, 63, 76, 50, "#123a3a");
    for (var ln = 0; ln < 6; ln++) r(35, 68 + ln * 7, 30 + ((ln * 17) % 36), 2, "#4fd1c5");
    r(62, 120, 14, 10, "#22252b");
    r(50, 128, 38, 4, "#2a2d33");
    // ID card
    r(156, 147, 42, 26, "#1b1b1b");
    r(157, 148, 40, 24, "#e8eef7");
    r(157, 148, 40, 5, "#2d4f8b");
    r(160, 155, 10, 13, pov.cust ? pov.cust.card.look.skin : "#ccc");
    r(160, 155, 10, 4, pov.cust ? pov.cust.card.look.hair : "#999");
    r(173, 157, 20, 2, "#555"); r(173, 162, 16, 2, "#888"); r(173, 166, 18, 2, "#888");
    // prescription
    r(244, 139, 44, 39, "#d8d4c8");
    r(245, 138, 42, 38, "#fbfaf4");
    r(249, 142, 6, 7, "#2f6f4f");
    for (var pl = 0; pl < 4; pl++) r(249, 153 + pl * 5, 34 - pl * 4, 1, "#9a9a9a");
    if (pov.cust && pov.cust.rx.signed) r(262, 171, 20, 2, "#2d4f8b");
    // phone
    r(338, 126, 58, 26, "#2a2a2a");
    r(340, 116, 54, 12, "#1b1b1b");
    r(352, 130, 30, 18, "#3a3a3a");
    for (var pb = 0; pb < 9; pb++) r(354 + (pb % 3) * 9, 132 + Math.floor(pb / 3) * 5, 6, 3, "#8a8a8a");
    // bell and a pill bottle for set dressing
    r(124, 150, 10, 6, "#e0b23a"); r(127, 147, 4, 3, "#e0b23a"); r(122, 156, 14, 2, "#8a6a1a");
    r(212, 160, 12, 14, "#e08a2b"); r(211, 157, 14, 4, "#f4f4f0");

    if (pov.hover) {
      var it = POV_ITEMS[pov.hover];
      g.strokeStyle = "#f7c948";
      g.lineWidth = 1;
      g.strokeRect(it.x - 1.5, it.y - 1.5, it.w + 3, it.h + 3);
    }
    g.restore();
  }

  function updatePov(dt) {
    pov.cam += (pov.camTarget - pov.cam) * Math.min(1, dt * 6);
    pov.cam = clamp(pov.cam, 0, POV_W - pov.vw);
    if (pov.typed < pov.line.length) {
      pov.typed = Math.min(pov.line.length, pov.typed + dt * 45);
      $("dlgText").textContent = pov.line.slice(0, Math.floor(pov.typed));
    }
  }

  function togglePanel(kind) {
    if (!pov.cust || pov.busy) return;
    var existing = pov.panels.indexOf(kind);
    if (existing >= 0) {
      pov.panels.splice(existing, 1);
    } else {
      pov.panels.push(kind);
      if (pov.panels.length > 3) pov.panels.shift();
    }
    renderPanels();
  }

  function row(dl, k, v, cls) {
    dl.appendChild(el("dt", null, k));
    dl.appendChild(el("dd", cls || null, v));
  }

  function renderPanels() {
    var box = $("povPanels");
    box.textContent = "";
    var c = pov.cust;
    pov.panels.forEach(function (kind) {
      var p = el("section", "doc doc-" + kind);
      var close = el("button", "doc-close", "×");
      close.type = "button";
      close.setAttribute("aria-label", "Close");
      close.addEventListener("click", function () { togglePanel(kind); });
      p.appendChild(close);

      if (kind === "id") {
        p.appendChild(el("header", null, "STATE OF ARKHAM · DRIVER LICENSE"));
        var bodyRow = el("div", "id-body");
        var photo = document.createElement("canvas");
        photo.width = 64; photo.height = 72;
        photo.className = "id-photo";
        var ph = photo.getContext("2d");
        ph.fillStyle = "#9fb4cf"; ph.fillRect(0, 0, 64, 72);
        NS.drawBust(ph, 32, 72, 2, c.card.look, "neutral", false);
        bodyRow.appendChild(photo);
        var dl = el("dl");
        row(dl, "Name", c.card.name);
        row(dl, "DOB", fmtDate(c.card.dob));
        row(dl, "EXP", fmtDate(c.card.exp));
        row(dl, "No.", c.card.number);
        bodyRow.appendChild(dl);
        p.appendChild(bodyRow);
      }
      if (kind === "rx") {
        p.appendChild(el("header", null, c.rx.doctor + " · " + c.rx.clinic));
        var dl2 = el("dl");
        row(dl2, "Patient", c.rx.patient);
        row(dl2, "DOB", fmtDate(c.rx.dob));
        row(dl2, "Rx", c.rx.remedy.name + " " + c.rx.remedy.dose);
        row(dl2, "Qty", c.rx.qty + (c.rx.qty > 1 ? " packs" : " pack"));
        row(dl2, "Date", fmtDate(c.rx.written));
        row(dl2, "Signed", c.rx.signed ? c.rx.doctor.replace("Dr. ", "") : "", c.rx.signed ? "sig" : "sig empty");
        p.appendChild(dl2);
      }
      if (kind === "computer") {
        p.appendChild(el("header", null, "APOTHECARY SYSTEM v6.66"));
        var dl3 = el("dl");
        row(dl3, "Today", fmtDate(TODAY));
        row(dl3, "File", c.record.name);
        row(dl3, "DOB", fmtDate(c.record.dob));
        row(dl3, "Allergies", c.record.allergy ? NS.INGREDIENTS[c.record.allergy].name : "None on file");
        p.appendChild(dl3);
        var r = c.rx.remedy;
        p.appendChild(el("h4", null, "Stock for " + r.name + " (" + money(r.price) + " each)"));
        var ul = el("ul", "stock");
        r.recipe.forEach(function (k) {
          var ok = save.stock[k] > 0;
          ul.appendChild(el("li", ok ? "ok" : "out",
            NS.INGREDIENTS[k].icon + " " + NS.INGREDIENTS[k].name + ": " + save.stock[k]));
        });
        p.appendChild(ul);
        if (!hasStock(r)) p.appendChild(el("p", "warn", "Not enough stock to fill this right now."));
      }
      if (kind === "phone") {
        p.appendChild(el("header", null, "Calling " + c.rx.doctor));
        var msg = el("p", "call");
        p.appendChild(msg);
        var reply = c.fault === "rxForged" ? "“Never heard of " + c.first + ". That script isn't mine.”"
          : c.fault === "rxUnsigned" ? "“Yes, that's mine, but I haven't signed it. Don't fill it yet.”"
          : "“Yes, " + c.first + " is one of mine. Go ahead.”";
        if (c.called) {
          msg.textContent = reply;
        } else {
          msg.textContent = "Ring ring…";
          if (!c.calling) {
            var who = c;
            who.calling = true;
            setTimeout(function () {
              who.called = true;
              if (pov.cust === who) renderPanels();
            }, 1400);
          }
        }
      }
      box.appendChild(p);
    });
  }

  function decide(fill) {
    var c = pov.cust;
    if (!c || pov.busy) return;
    pov.busy = true;
    $("povActions").hidden = true;
    var why = c.fault ? NS.FAULTS[c.fault].why : null;

    if (fill) {
      if (c.fault) {
        pov.mood = "happy";
        say("Cheers. Pleasure doing business.");
        strike("a board inspector caught it: " + why + ".");
        finishPov(function () { customerLeaves(c, "heart"); });
      } else {
        pov.mood = "happy";
        say(pick(["Thanks! I'll wait over there.", "Brilliant, I'll take a seat.", "Lovely. I'll be by the chairs."]));
        orders.push({ id: nextId++, cust: c, remedy: c.rx.remedy, qty: c.rx.qty, status: "pending", maker: null });
        finishPov(function () {
          if (c.state === "leaving") return;
          leaveQueue(c);
          c.state = "waiting";
          c.patienceMax = c.patience = Math.max(55, 95 - level * 4);
          c.seat = freeSeat();
          sendTo(c, c.seat, "customer");
        });
      }
    } else {
      pov.mood = "angry";
      if (c.fault) {
        day.catches++;
        save.bank += NS.CATCH_BONUS;
        day.earned += NS.CATCH_BONUS;
        say(pick(["...Fine. Worth a try.", "Ugh. Rumbled.", "You'll regret this. Probably."]));
        toast("Good catch: " + why + ". +" + money(NS.CATCH_BONUS) + ".", "good");
      } else if (!hasStock(c.rx.remedy)) {
        day.turnedAway++;
        pov.mood = "neutral";
        say("Out of stock? Fine, I'll try the place across the bog.");
        toast("Turned away for lack of stock. No strike, but no sale either.");
      } else {
        say(pick(["What? Everything's in order!", "I'm reporting you to the coven.", "Unbelievable."]));
        strike(c.first + "'s paperwork was fine.");
      }
      finishPov(function () { customerLeaves(c, c.fault ? null : "angry"); });
    }
  }

  function finishPov(then) {
    setTimeout(function () {
      if (mode === "pov") closePov();
      then();
    }, 1300);
  }

  // ---------- compounding mini game ----------
  var mix = { order: null, phase: "", step: 0, show: 0, needle: 0, dirN: 1, zone: [0.4, 0.6], timer: 0 };

  function startCompound() {
    var o = orders.find(function (o) { return o.status === "pending"; });
    if (!o) {
      var busy = orders.some(function (o) { return o.status === "making"; });
      toast(busy ? "Your techs have it covered." : "No scripts waiting to be filled.");
      return;
    }
    if (!hasStock(o.remedy)) {
      var missing = o.remedy.recipe.filter(function (k) { return save.stock[k] <= 0; })
        .map(function (k) { return NS.INGREDIENTS[k].name; });
      toast("Can't make " + o.remedy.name + ": out of " + missing.join(", ") + ". Order more at the terminal.", "bad");
      return;
    }
    o.status = "making"; o.maker = "mia";
    mix.order = o;
    $("mixTitle").textContent = o.remedy.name + " for " + o.cust.first;
    buildJars();
    setMode("mix");
    startWatch();
  }

  function buildJars() {
    var box = $("mixJars");
    box.textContent = "";
    unlockedIngredients().forEach(function (k, i) {
      var ing = NS.INGREDIENTS[k];
      var b = el("button", "jar");
      b.type = "button";
      b.appendChild(el("span", "jar-icon", ing.icon));
      b.appendChild(el("span", "jar-name", ing.name));
      b.appendChild(el("span", "jar-count", (i < 9 ? (i + 1) + " · " : (i === 9 ? "0 · " : "")) + "x" + save.stock[k]));
      b.addEventListener("click", function () { pickIngredient(k, b); });
      box.appendChild(b);
    });
  }

  function renderSeq(revealUpTo, highlight) {
    var box = $("mixSeq");
    box.textContent = "";
    mix.order.remedy.recipe.forEach(function (k, i) {
      var slot = el("span", "slot" + (i === highlight ? " lit" : "") + (i < revealUpTo ? " done" : ""));
      slot.textContent = (i < revealUpTo || i === highlight) ? NS.INGREDIENTS[k].icon : "?";
      box.appendChild(slot);
    });
  }

  function startWatch() {
    mix.phase = "watch";
    mix.show = -1;
    mix.step = 0;
    mix.timer = 0;
    $("mixMsg").textContent = "Watch the recipe…";
    $("mixGrind").hidden = true;
    $("mixJars").classList.add("locked");
    renderSeq(0, -1);
  }

  function pickIngredient(k, btn) {
    if (mix.phase !== "imitate") return;
    var want = mix.order.remedy.recipe[mix.step];
    if (k === want) {
      mix.step++;
      renderSeq(mix.step, -1);
      btn.classList.remove("good"); void btn.offsetWidth; btn.classList.add("good");
      if (mix.step >= mix.order.remedy.recipe.length) startGrind();
    } else {
      btn.classList.remove("bad"); void btn.offsetWidth; btn.classList.add("bad");
      $("mixMsg").textContent = "That's not it. Watch again.";
      setTimeout(function () { if (mode === "mix" && mix.phase === "imitate") startWatch(); }, 700);
      mix.phase = "oops";
    }
  }

  function startGrind() {
    mix.phase = "grind";
    $("mixJars").classList.add("locked");
    $("mixGrind").hidden = false;
    $("mixMsg").textContent = "Grind it! Stop the needle in the green.";
    var w = cfg.grindZone;
    var start = rand(0.15, 0.85 - w);
    mix.zone = [start, start + w];
    var zone = $("grindZone");
    zone.style.left = (start * 100) + "%";
    zone.style.width = (w * 100) + "%";
    mix.needle = 0; mix.dirN = 1;
  }

  function grind() {
    if (mix.phase !== "grind") return;
    if (mix.needle >= mix.zone[0] && mix.needle <= mix.zone[1]) {
      mix.phase = "done";
      useStock(mix.order.remedy);
      mix.order.status = "ready";
      mix.order.maker = null;
      $("mixMsg").textContent = "Bagged! Hand it over at the pick-up bell.";
      $("mixGrind").hidden = true;
      setTimeout(function () { if (mode === "mix") closeMix(true); }, 1000);
    } else {
      $("mixMsg").textContent = mix.needle < mix.zone[0] ? "Too coarse. Again!" : "Too fine. Again!";
    }
  }

  function updateMix(dt) {
    if (mix.phase === "watch") {
      mix.timer += dt;
      var per = 0.75;
      var idx = Math.floor(mix.timer / per);
      var len = mix.order.remedy.recipe.length;
      if (idx < len) {
        if (idx !== mix.show) { mix.show = idx; renderSeq(0, idx); }
      } else if (mix.timer > len * per + 0.3) {
        mix.phase = "imitate";
        mix.step = 0;
        renderSeq(0, -1);
        $("mixJars").classList.remove("locked");
        $("mixMsg").textContent = "Now add them in the same order.";
      }
    }
    if (mix.phase === "grind") {
      var speed = 0.9 + level * 0.12;
      mix.needle += mix.dirN * speed * dt;
      if (mix.needle > 1) { mix.needle = 1; mix.dirN = -1; }
      if (mix.needle < 0) { mix.needle = 0; mix.dirN = 1; }
      $("grindNeedle").style.left = (mix.needle * 100) + "%";
    }
  }

  function closeMix(done) {
    if (!done && mix.order && orders.indexOf(mix.order) >= 0 && mix.order.status === "making") {
      mix.order.status = "pending";
      mix.order.maker = null;
    }
    mix.order = null;
    mix.phase = "";
    if (mode === "mix") setMode("play");
  }

  // ---------- terminal ----------
  var termTab = "supplies";

  function openTerminal() {
    setMode("terminal");
    renderTerminal();
  }

  function closeTerminal() {
    if (mode === "terminal") setMode("play");
  }

  function renderTerminal() {
    $("termBank").textContent = "Bank: " + money(save.bank);
    document.querySelectorAll(".term-tab").forEach(function (b) {
      b.setAttribute("aria-selected", String(b.dataset.tab === termTab));
    });
    var body = $("termBody");
    body.textContent = "";
    if (termTab === "supplies") {
      unlockedIngredients().forEach(function (k) {
        var ing = NS.INGREDIENTS[k];
        var r = el("div", "term-row");
        r.appendChild(el("span", "term-icon", ing.icon));
        r.appendChild(el("span", "term-name", ing.name));
        r.appendChild(el("span", "term-stock", "x" + save.stock[k]));
        var price = ing.cost * 5;
        var b = el("button", null, "Buy 5 · " + money(price));
        b.type = "button";
        b.disabled = save.bank < price;
        b.addEventListener("click", function () {
          if (save.bank < price) return;
          save.bank -= price;
          save.stock[k] += 5;
          renderTerminal();
        });
        r.appendChild(b);
        body.appendChild(r);
      });
    } else {
      body.appendChild(el("p", "term-note", "Techs compound scripts on their own. " + money(NS.TECH_COST) +
        " to hire, " + money(NS.TECH_WAGE) + " a night in wages."));
      NS.TECH_LOOKS.forEach(function (look, i) {
        var r = el("div", "term-row");
        var unlockAt = [2, 4, 5][i];
        var c = document.createElement("canvas");
        c.width = 24; c.height = 36; c.className = "term-face";
        var cc = c.getContext("2d");
        NS.drawPerson(cc, 12, 36, "down", 0, look, 0);
        r.appendChild(c);
        r.appendChild(el("span", "term-name", look.name));
        if (i < save.techs) {
          r.appendChild(el("span", "term-stock", "On shift"));
        } else if (i >= cfg.techSlots) {
          r.appendChild(el("span", "term-stock locked", "Unlocks on night " + unlockAt));
        } else if (i === save.techs) {
          var b = el("button", "primary", "Hire · " + money(NS.TECH_COST));
          b.type = "button";
          b.disabled = save.bank < NS.TECH_COST;
          b.addEventListener("click", function () {
            if (save.bank < NS.TECH_COST) return;
            save.bank -= NS.TECH_COST;
            save.techs++;
            addTech(save.techs - 1);
            toast(look.name + " clocked in. Welcome aboard.", "good");
            renderTerminal();
          });
          r.appendChild(b);
        } else {
          r.appendChild(el("span", "term-stock locked", "Hire " + NS.TECH_LOOKS[i - 1].name + " first"));
        }
        body.appendChild(r);
      });
    }
  }

  // ---------- main loop ----------
  var last = performance.now();
  function tick(dt) {
    time += dt;
    if (day && !day.over && (mode === "play" || mode === "pov" || mode === "mix" || mode === "terminal")) {
      day.t += dt;
      day.spawnT -= dt;
      if (day.spawnT <= 0 && day.t < cfg.dayLength * 0.92) {
        spawnCustomer();
        day.spawnT = cfg.spawnEvery * rand(0.7, 1.3);
      }
      if (mode === "play") updatePlayer(dt);
      updateCustomers(dt);
      updateTechs(dt);
      customers.forEach(function (c) {
        if (c.state === "collecting" && !c.path.length && c.after) { var f = c.after; c.after = null; f(); }
      });
      floaters = floaters.filter(function (f) { f.t -= dt; return f.t > 0; });
      if (mode === "pov") updatePov(dt);
      if (mode === "mix") updateMix(dt);
      updateHud(dt);
      if (day.t >= cfg.dayLength) endDay("time");
    }
  }

  function frame(now) {
    tick(Math.min(0.1, (now - last) / 1000));
    last = now;
    if (mode === "pov") drawPovScene();
    else renderWorld();
    requestAnimationFrame(frame);
  }

  // ---------- input ----------
  var isTouch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

  window.addEventListener("keydown", function (e) {
    if (e.repeat && (e.code === "KeyE" || e.code === "Space" || e.code === "Enter")) return;
    if (mode === "play") {
      keys[e.code] = true;
      if (e.code === "KeyE" || e.code === "Space" || e.code === "Enter") { e.preventDefault(); interact(); }
      if (e.code === "Escape" || e.code === "KeyP") setMode("paused");
      if (e.code.indexOf("Arrow") === 0) e.preventDefault();
    } else if (mode === "pov") {
      if (e.code === "Escape") closePov();
      if (e.code === "KeyF") decide(true);
      if (e.code === "KeyR") decide(false);
      if (e.code === "Digit1") togglePanel("id");
      if (e.code === "Digit2") togglePanel("rx");
      if (e.code === "Digit3") togglePanel("computer");
      if (e.code === "Digit4") togglePanel("phone");
    } else if (mode === "mix") {
      if (e.code === "Escape") closeMix(false);
      if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); grind(); }
      var m = /^Digit(\d)$/.exec(e.code);
      if (m) {
        var n = m[1] === "0" ? 9 : Number(m[1]) - 1;
        var jar = $("mixJars").children[n];
        if (jar) jar.click();
      }
    } else if (mode === "terminal") {
      if (e.code === "Escape" || e.code === "KeyE") closeTerminal();
    } else if (mode === "paused") {
      if (e.code === "Escape" || e.code === "KeyP") setMode("play");
    }
  });
  window.addEventListener("keyup", function (e) { keys[e.code] = false; });
  window.addEventListener("blur", function () { keys = {}; });
  window.addEventListener("resize", resize);

  povCanvas.addEventListener("pointermove", function (e) {
    var w = window.innerWidth;
    if (e.pointerType === "mouse") {
      pov.camTarget = clamp((e.clientX / w - 0.1) / 0.8, 0, 1) * (POV_W - pov.vw);
    }
    pov.hover = itemAt(povToWorld(e.clientX, e.clientY));
    povCanvas.style.cursor = pov.hover ? "pointer" : "default";
  });
  // Touch: drag to look around, tap to pick things up.
  var drag = null;
  povCanvas.addEventListener("pointerdown", function (e) {
    drag = { x: e.clientX, cam: pov.camTarget, moved: false };
  });
  povCanvas.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerType === "mouse") return;
    var dx = e.clientX - drag.x;
    if (Math.abs(dx) > 6) drag.moved = true;
    pov.camTarget = clamp(drag.cam - dx / (pov.s / (window.devicePixelRatio || 1)), 0, POV_W - pov.vw);
  });
  povCanvas.addEventListener("pointerup", function (e) {
    var wasDrag = drag && drag.moved;
    drag = null;
    if (wasDrag) return;
    var hit = itemAt(povToWorld(e.clientX, e.clientY));
    if (hit) togglePanel(hit);
  });

  $("btnFill").addEventListener("click", function () { decide(true); });
  $("btnRefuse").addEventListener("click", function () { decide(false); });
  $("btnAway").addEventListener("click", closePov);
  $("dialogue").addEventListener("click", function () { pov.typed = pov.line.length; $("dlgText").textContent = pov.line; });

  $("btnGrind").addEventListener("click", grind);
  $("mixCancel").addEventListener("click", function () { closeMix(false); });

  document.querySelectorAll(".term-tab").forEach(function (b) {
    b.addEventListener("click", function () { termTab = b.dataset.tab; renderTerminal(); });
  });
  $("termClose").addEventListener("click", closeTerminal);

  $("btnNew").addEventListener("click", function () {
    if (save && !$("btnNew").classList.contains("armed")) {
      $("btnNew").classList.add("armed");
      $("btnNew").textContent = "Wipe save and start over?";
      return;
    }
    save = freshSave();
    writeSave();
    $("btnNew").classList.remove("armed");
    $("btnNew").textContent = "New game";
    showIntro();
  });
  $("btnContinue").addEventListener("click", showIntro);
  $("btnClockIn").addEventListener("click", function () { level = save.level; startDay(); });
  $("btnNext").addEventListener("click", showIntro);
  $("btnResume").addEventListener("click", function () { setMode("play"); });
  $("btnQuit").addEventListener("click", function () { day = null; showTitle(); });

  // on-screen controls for touch screens
  document.querySelectorAll("[data-key]").forEach(function (b) {
    if (!b.closest("#touch")) return;
    var code = b.dataset.key;
    function on(e) { e.preventDefault(); keys[code] = true; }
    function off(e) { e.preventDefault(); keys[code] = false; }
    b.addEventListener("pointerdown", on);
    b.addEventListener("pointerup", off);
    b.addEventListener("pointercancel", off);
    b.addEventListener("pointerleave", off);
  });
  $("touchAct").addEventListener("pointerdown", function (e) { e.preventDefault(); interact(); });

  resize();
  showTitle();
  requestAnimationFrame(frame);
})();
