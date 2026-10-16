// Landing page: a pile of pills covers the name and links. Moving the pointer
// shoves them aside; pills that get bumped knock their neighbours along too.
(function () {
  "use strict";

  var canvas = document.getElementById("pills");
  var ctx = canvas.getContext("2d");
  var hint = document.getElementById("hint");

  // [first half, second half] for capsules, a single colour for tablets
  var CAPSULES = [
    ["#d6402b", "#f4f1ea"], ["#2b5fd6", "#f2c53d"], ["#e98bb0", "#f4f1ea"],
    ["#1f8a7a", "#f4f1ea"], ["#f08a24", "#f7e7c6"], ["#6a3fb5", "#e9e3f7"],
    ["#222222", "#d6402b"], ["#3fa34d", "#f2c53d"]
  ];
  var TABLETS = ["#f7f5ef", "#f7f5ef", "#f2c53d", "#e98bb0", "#9fd3f5"];

  var pills = [];
  var W = 0, H = 0, dpr = 1, unit = 10;
  var pointer = { x: -1e4, y: -1e4, lx: -1e4, ly: -1e4, active: false };
  var moved = 0;
  var lastWidth = 0;
  var centre = { x: 0, y: 0 };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[(Math.random() * list.length) | 0]; }

  function coverRect() {
    var r1 = document.getElementById("name").getBoundingClientRect();
    var r2 = document.getElementById("links").getBoundingClientRect();
    var pad = unit * 2;
    return {
      x: Math.min(r1.left, r2.left) - pad,
      y: r1.top - pad,
      w: Math.max(r1.right, r2.right) - Math.min(r1.left, r2.left) + pad * 2,
      h: r2.bottom - r1.top + pad * 2
    };
  }

  function makePill(x, y) {
    var tablet = Math.random() < 0.28;
    var len = tablet ? unit * rand(1.5, 1.9) : unit * rand(3.6, 4.6);
    var rad = tablet ? len / 2 : unit * rand(0.85, 1.05);
    var cap = pick(CAPSULES);
    return {
      x: x, y: y, vx: 0, vy: 0,
      a: rand(0, Math.PI * 2), va: 0,
      len: len, rad: rad,
      hit: tablet ? rad : (len * 0.5 + rad) * 0.5,
      tablet: tablet,
      c1: tablet ? pick(TABLETS) : cap[0],
      c2: tablet ? null : cap[1],
      awake: 0
    };
  }

  function seed() {
    unit = Math.max(7, Math.min(13, Math.min(W, H) / 70));
    var r = coverRect();
    centre = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    var avg = unit * 3.4 * unit * 1.9;
    var n = Math.round((r.w * r.h) / avg * 1.9);
    n = Math.max(100, Math.min(650, n));
    pills = [];
    for (var i = 0; i < n; i++) {
      pills.push(makePill(rand(r.x, r.x + r.w), rand(r.y, r.y + r.h)));
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    // Mobile address bars change the height constantly, so only a width
    // change is a real layout change worth re-piling the pills for.
    if (Math.abs(W - lastWidth) > 40) {
      lastWidth = W;
      seed();
    }
  }

  function onMove(e) {
    if (pointer.active) {
      moved += Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y);
      if (moved > 600) hint.classList.add("gone");
    } else {
      pointer.lx = e.clientX;
      pointer.ly = e.clientY;
    }
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
  }

  function onLeave() {
    pointer.active = false;
    pointer.x = pointer.y = -1e4;
  }

  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onMove, { passive: true });
  window.addEventListener("pointerup", function (e) { if (e.pointerType !== "mouse") onLeave(); });
  document.addEventListener("pointerleave", onLeave);
  window.addEventListener("blur", onLeave);
  window.addEventListener("resize", resize);

  // Sweep the whole segment the pointer covered since the last frame, so a fast
  // flick (or a slow machine) still clears a clean channel instead of skipping pills.
  function push(dt) {
    if (!pointer.active) return;
    var reach = unit * 4.5;
    var sx = pointer.lx, sy = pointer.ly;
    var mx = pointer.x - sx, my = pointer.y - sy;
    var len2 = mx * mx + my * my;
    var vx = mx / dt, vy = my / dt;
    var speed = Math.sqrt(len2) / dt;
    for (var i = 0; i < pills.length; i++) {
      var p = pills[i];
      var t = len2 ? Math.max(0, Math.min(1, ((p.x - sx) * mx + (p.y - sy) * my) / len2)) : 1;
      var dx = p.x - (sx + mx * t), dy = p.y - (sy + my * t);
      var d = Math.hypot(dx, dy) || 0.01;
      var lim = reach + p.hit;
      if (d > lim) continue;
      var f = (lim - d) / lim;
      var nx = dx / d, ny = dy / d;
      // Shove the pill out of the swept area right away, then let it coast.
      p.x += nx * (lim - d) * 0.5;
      p.y += ny * (lim - d) * 0.5;
      // Lean every shove away from the middle of the name so pills drift off
      // toward the edges instead of shuffling back and forth over the letters.
      var cx = p.x - centre.x, cy = (p.y - centre.y) * 2.5;
      var cd = Math.hypot(cx, cy) || 1;
      var out = 1.5 + speed * 0.25;
      p.vx += nx * f * (2 + speed * 0.4) + vx * f * 0.3 + cx / cd * f * out;
      p.vy += ny * f * (2 + speed * 0.4) + vy * f * 0.3 + cy / cd * f * out;
      p.va += (nx * vy - ny * vx) * f * 0.004;
      p.awake = 40;
    }
    pointer.lx = pointer.x;
    pointer.ly = pointer.y;
  }

  // Spatial hash so pill-on-pill checks stay cheap with several hundred pills.
  function collide() {
    var cell = unit * 3.2;
    var grid = new Map();
    var i, p;
    for (i = 0; i < pills.length; i++) {
      p = pills[i];
      var key = ((p.x / cell) | 0) * 7919 + ((p.y / cell) | 0);
      var bucket = grid.get(key);
      if (bucket) bucket.push(i); else grid.set(key, [i]);
    }
    for (i = 0; i < pills.length; i++) {
      p = pills[i];
      if (p.awake <= 0) continue;
      var cx = (p.x / cell) | 0, cy = (p.y / cell) | 0;
      for (var ox = -1; ox <= 1; ox++) {
        for (var oy = -1; oy <= 1; oy++) {
          var b = grid.get((cx + ox) * 7919 + (cy + oy));
          if (!b) continue;
          for (var k = 0; k < b.length; k++) {
            var j = b[k];
            if (j === i) continue;
            var q = pills[j];
            var dx = q.x - p.x, dy = q.y - p.y;
            var min = (p.hit + q.hit) * 0.55;
            var d2 = dx * dx + dy * dy;
            if (d2 >= min * min || d2 === 0) continue;
            var d = Math.sqrt(d2);
            var nx = dx / d, ny = dy / d;
            // Hand some of the moving pill's momentum to the one it hits.
            var rel = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny;
            if (rel > 0) {
              var share = rel * 0.25;
              q.vx += nx * share; q.vy += ny * share;
              p.vx -= nx * share * 0.3; p.vy -= ny * share * 0.3;
              q.va += (Math.random() - 0.5) * share * 0.02;
              q.awake = Math.max(q.awake, 20);
            }
            var overlap = (min - d) * 0.08;
            q.x += nx * overlap; q.y += ny * overlap;
          }
        }
      }
    }
  }

  function step(dt) {
    var damp = Math.pow(0.94, dt);
    var spin = Math.pow(0.88, dt);
    push(dt);
    collide();
    for (var i = 0; i < pills.length; i++) {
      var p = pills[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.a += p.va * dt;
      p.vx *= damp; p.vy *= damp; p.va *= spin;
      if (p.x < p.hit) { p.x = p.hit; p.vx = Math.abs(p.vx) * 0.5; }
      if (p.x > W - p.hit) { p.x = W - p.hit; p.vx = -Math.abs(p.vx) * 0.5; }
      if (p.y < p.hit) { p.y = p.hit; p.vy = Math.abs(p.vy) * 0.5; }
      if (p.y > H - p.hit) { p.y = H - p.hit; p.vy = -Math.abs(p.vy) * 0.5; }
      if (p.awake > 0) p.awake -= dt;
      if (Math.abs(p.vx) + Math.abs(p.vy) > 0.4) p.awake = Math.max(p.awake, 4);
    }
  }

  function drawPill(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.shadowColor = "rgba(0,0,0,.18)";
    ctx.shadowBlur = unit * 0.5;
    ctx.shadowOffsetY = unit * 0.2;
    if (p.tablet) {
      ctx.fillStyle = p.c1;
      ctx.beginPath();
      ctx.arc(0, 0, p.rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "rgba(0,0,0,.14)";
      ctx.lineWidth = Math.max(1, unit * 0.12);
      ctx.beginPath();
      ctx.moveTo(-p.rad * 0.65, 0);
      ctx.lineTo(p.rad * 0.65, 0);
      ctx.stroke();
    } else {
      var hl = p.len / 2 - p.rad;
      var r = p.rad;
      ctx.fillStyle = p.c2;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(hl, -r);
      ctx.arc(hl, 0, r, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(0, r);
      ctx.closePath();
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = p.c1;
      ctx.beginPath();
      ctx.moveTo(r * 0.3, -r);
      ctx.lineTo(-hl, -r);
      ctx.arc(-hl, 0, r, -Math.PI / 2, -Math.PI * 1.5, true);
      ctx.lineTo(r * 0.3, r);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.35)";
      ctx.fillRect(-hl, -r * 0.62, hl * 2, r * 0.28);
    }
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < pills.length; i++) drawPill(pills[i]);
  }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(3, (now - last) / 16.67);
    last = now;
    step(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // Wait for fonts so the pile is sized to the real name, not a fallback.
  var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  ready.then(function () {
    resize();
    requestAnimationFrame(frame);
  });
})();
