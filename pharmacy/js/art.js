// Procedural pixel art: map tiles, walking sprites and the big first-person busts.
var NS = window.NS || (window.NS = {});

(function () {
  "use strict";

  var T = NS.TILE;

  // Deterministic noise so the pre-rendered map looks the same every load.
  function hash(x, y, k) {
    var h = (x * 374761393 + y * 668265263 + (k || 0) * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function rect(ctx, x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  }

  var JAR_COLOURS = ["#7b4fd1", "#2fae8f", "#d14f6a", "#e0a12b", "#4f7bd1", "#9bd14f", "#c2c2c2"];
  var BOX_COLOURS = ["#e8d6b0", "#c9b48a", "#f2f2f2", "#d9e6f2", "#f2d9e0"];

  function tileAt(map, x, y) {
    if (y < 0 || y >= map.length || x < 0 || x >= map[0].length) return "#";
    return map[y][x];
  }

  function drawFloor(ctx, px, py, staff, x, y) {
    if (staff) {
      rect(ctx, px, py, T, T, "#cfd8d6");
      rect(ctx, px, py, T, 1, "#bcc7c5");
      rect(ctx, px, py, 1, T, "#bcc7c5");
      if (hash(x, y) > 0.85) rect(ctx, px + 5, py + 7, 2, 1, "#c2ccca");
    } else {
      var dark = (x + y) % 2 === 0;
      rect(ctx, px, py, T, T, dark ? "#d9c7a4" : "#e8dbbd");
      if (hash(x, y, 2) > 0.8) rect(ctx, px + 9, py + 4, 2, 1, dark ? "#ccb991" : "#dccca9");
    }
  }

  function drawTile(ctx, map, x, y) {
    var c = map[y][x];
    var px = x * T, py = y * T;
    var below = tileAt(map, x, y + 1);
    var staffSide = y < 7;

    if (c !== "#") drawFloor(ctx, px, py, staffSide, x, y);

    switch (c) {
      case "#":
        if (below !== "#" && y < map.length - 1) {
          // Wall face visible from the room: dark cap and a tiled front.
          rect(ctx, px, py, T, T, staffSide ? "#5c7f79" : "#6d4f6e");
          rect(ctx, px, py, T, 4, "#2a2a33");
          rect(ctx, px, py + 10, T, 2, staffSide ? "#4b6964" : "#583f59");
          rect(ctx, px, py + 14, T, 2, "#2a2a33");
        } else {
          rect(ctx, px, py, T, T, "#2a2a33");
          rect(ctx, px, py, T, 1, "#34343f");
        }
        break;
      case "S": {
        rect(ctx, px, py, T, T, "#5c7f79");
        rect(ctx, px, py, T, 3, "#2a2a33");
        rect(ctx, px + 1, py + 3, T - 2, T - 3, "#7a5634");
        rect(ctx, px + 1, py + 8, T - 2, 1, "#5a3d22");
        rect(ctx, px + 1, py + 14, T - 2, 2, "#5a3d22");
        for (var j = 0; j < 3; j++) {
          var jc = JAR_COLOURS[(hash(x, y, j) * JAR_COLOURS.length) | 0];
          rect(ctx, px + 2 + j * 5, py + 4, 3, 4, jc);
          rect(ctx, px + 2 + j * 5, py + 4, 3, 1, "#e8e8e8");
          var jc2 = JAR_COLOURS[(hash(x, y, j + 5) * JAR_COLOURS.length) | 0];
          rect(ctx, px + 2 + j * 5, py + 10, 3, 4, jc2);
          rect(ctx, px + 2 + j * 5, py + 10, 3, 1, "#e8e8e8");
        }
        break;
      }
      case "H": {
        var top = tileAt(map, x, y - 1) !== "H";
        rect(ctx, px + 1, py, T - 2, T, "#8a8f99");
        if (top) rect(ctx, px + 1, py, T - 2, 3, "#a9aeb8");
        for (var b = 0; b < 2; b++) {
          var bc = BOX_COLOURS[(hash(x, y, b + 9) * BOX_COLOURS.length) | 0];
          rect(ctx, px + 2 + b * 6, py + (top ? 4 : 2), 5, 5, bc);
          rect(ctx, px + 2 + b * 6, py + (top ? 4 : 2), 5, 1, "rgba(0,0,0,.12)");
          var bc2 = BOX_COLOURS[(hash(x, y, b + 3) * BOX_COLOURS.length) | 0];
          rect(ctx, px + 2 + b * 6, py + 10, 5, 4, bc2);
        }
        rect(ctx, px + 1, py + T - 1, T - 2, 1, "#5f646d");
        break;
      }
      case "B":
        rect(ctx, px, py + 1, T - 2, T - 2, "#6d4a2c");
        rect(ctx, px, py + 1, T - 2, 2, "#8a613c");
        rect(ctx, px + T - 3, py + 1, 1, T - 2, "#4d331e");
        if (y === 4) {
          // the cauldron sits on the middle bench
          rect(ctx, px + 2, py + 5, 10, 8, "#1e1e24");
          rect(ctx, px + 3, py + 5, 8, 2, "#3fd17a");
        } else {
          // mortar and pestle
          rect(ctx, px + 4, py + 7, 7, 5, "#b9b4aa");
          rect(ctx, px + 5, py + 7, 5, 2, "#8a857c");
          rect(ctx, px + 9, py + 4, 2, 5, "#d8d3c8");
        }
        break;
      case "T":
        rect(ctx, px + 2, py + 1, T - 2, T - 2, "#6d4a2c");
        rect(ctx, px + 2, py + 1, T - 2, 2, "#8a613c");
        rect(ctx, px + 4, py + 3, 9, 7, "#22252b");
        rect(ctx, px + 5, py + 4, 7, 5, "#4fd1c5");
        rect(ctx, px + 7, py + 10, 3, 2, "#22252b");
        rect(ctx, px + 4, py + 12, 9, 2, "#d8d8d8");
        break;
      case "c":
      case "R":
      case "K":
        rect(ctx, px, py, T, T, "#a8794a");
        rect(ctx, px, py, T, 6, "#d9b27c");
        rect(ctx, px, py + 6, T, 1, "#7a5634");
        rect(ctx, px, py + T - 2, T, 2, "#5a3d22");
        if (c === "R") {
          rect(ctx, px + 3, py + 1, 9, 5, "#f7f4ea");
          rect(ctx, px + 4, py + 2, 5, 1, "#666");
          rect(ctx, px + 4, py + 4, 7, 1, "#999");
          rect(ctx, px + 4, py + 8, 8, 5, "#2f6f4f");
          rect(ctx, px + 5, py + 9, 1, 3, "#fff");
          rect(ctx, px + 6, py + 9, 1, 1, "#fff");
          rect(ctx, px + 7, py + 10, 1, 1, "#fff");
          rect(ctx, px + 7, py + 12, 1, 1, "#fff");
          rect(ctx, px + 9, py + 10, 2, 2, "#fff");
        }
        if (c === "K") {
          rect(ctx, px + 5, py + 1, 6, 4, "#e0b23a");
          rect(ctx, px + 7, py, 2, 1, "#e0b23a");
          rect(ctx, px + 4, py + 5, 8, 1, "#8a6a1a");
          rect(ctx, px + 4, py + 8, 8, 5, "#9c2f3b");
          rect(ctx, px + 6, py + 9, 4, 3, "#f7f4ea");
        }
        break;
      case "G":
        rect(ctx, px, py, T, T, "#efefef");
        rect(ctx, px, py, T, 1, "#ffffff");
        rect(ctx, px, py + T - 1, T, 1, "#b0b0b0");
        for (var g = 0; g < 3; g++) {
          rect(ctx, px + 1 + g * 5, py + 3, 4, 4, JAR_COLOURS[(hash(x, y, g) * 7) | 0]);
          rect(ctx, px + 1 + g * 5, py + 9, 4, 4, BOX_COLOURS[(hash(x, y, g + 4) * 5) | 0]);
        }
        break;
      case "p":
        rect(ctx, px + 5, py + 10, 6, 5, "#a0522d");
        rect(ctx, px + 5, py + 10, 6, 1, "#c06a3d");
        rect(ctx, px + 3, py + 3, 10, 7, "#3f8a3f");
        rect(ctx, px + 5, py + 1, 6, 3, "#4fa34f");
        rect(ctx, px + 2, py + 6, 2, 3, "#2f6f2f");
        rect(ctx, px + 12, py + 5, 2, 3, "#2f6f2f");
        break;
      case "h":
        rect(ctx, px + 2, py + 2, 12, 4, "#5a3d6a");
        rect(ctx, px + 2, py + 6, 12, 6, "#7a5c8a");
        rect(ctx, px + 2, py + 12, 2, 3, "#3b3b3b");
        rect(ctx, px + 12, py + 12, 2, 3, "#3b3b3b");
        break;
      case "D":
        rect(ctx, px, py, T, T, "#3b3b46");
        rect(ctx, px + 1, py, T - 2, T - 3, "#5b7fa6");
        rect(ctx, px + 2, py + 1, 3, 8, "#86a9cc");
        rect(ctx, px, py - 4, T, 4, "#7a2f3b");
        break;
    }
  }

  // Rows draw top to bottom, which matters: door tiles paint their mat into the row above.
  NS.renderMap = function (map) {
    var canvas = document.createElement("canvas");
    canvas.width = map[0].length * T;
    canvas.height = map.length * T;
    var ctx = canvas.getContext("2d");
    for (var y = 0; y < map.length; y++) {
      for (var x = 0; x < map[0].length; x++) drawTile(ctx, map, x, y);
    }
    return canvas;
  };

  // Walking sprite. (x, y) is the point between the feet; the sprite is 12x18.
  NS.drawPerson = function (ctx, x, y, dir, frame, look, bob) {
    var ox = Math.round(x) - 6;
    var oy = Math.round(y) - 18 + (bob || 0);
    function p(a, b, w, h, c) { rect(ctx, ox + a, oy + b, w, h, c); }

    rect(ctx, Math.round(x) - 5, Math.round(y) - 1, 10, 2, "rgba(0,0,0,.22)");

    var side = dir === "left" || dir === "right";
    var shoes = look.shoes || "#222";
    var step = frame % 4 === 1 ? 1 : frame % 4 === 3 ? -1 : 0;

    // legs
    if (side) {
      p(4, 13, 2, 4 - Math.max(0, step), look.bottom);
      p(6, 13, 2, 4 - Math.max(0, -step), look.bottom);
      p(4 + step, 16, 3, 1, shoes);
      p(6 - step, 16, 3, 1, shoes);
    } else {
      p(3, 13, 2, step === 1 ? 3 : 4, look.bottom);
      p(7, 13, 2, step === -1 ? 3 : 4, look.bottom);
      p(3, step === 1 ? 15 : 16, 2, 1, shoes);
      p(7, step === -1 ? 15 : 16, 2, 1, shoes);
    }

    // torso and arms
    var body = look.coat ? "#f4f4f0" : look.top;
    if (side) {
      p(3, 8, 6, 6, body);
      var arm = dir === "right" ? 5 + step : 5 - step;
      p(arm, 9, 2, 4, look.coat ? "#e2e2dc" : look.top);
      p(arm, 13, 2, 1, look.skin);
      if (look.coat) p(dir === "right" ? 7 : 3, 8, 2, 2, look.top);
    } else {
      p(2, 8, 8, 6, body);
      p(1, 9, 1, 4, body);
      p(10, 9, 1, 4, body);
      p(1, 13, 1, 1, look.skin);
      p(10, 13, 1, 1, look.skin);
      if (look.coat && dir === "down") {
        p(5, 8, 2, 4, look.top);
        p(3, 11, 1, 1, "#4fa3c4");
      }
    }

    // head
    p(3, 2, 6, 6, look.skin);
    var hair = look.hair;
    var style = look.hairStyle;
    if (style !== "bald") {
      if (dir === "up") {
        p(3, 1, 6, 6, hair);
        if (style === "long") p(2, 3, 8, 7, hair);
      } else if (side) {
        p(3, 1, 6, 2, hair);
        var back = dir === "right" ? 3 : 7;
        p(back, 1, 2, 5, hair);
        if (style === "long") p(back, 3, 2, 7, hair);
        p(dir === "right" ? 7 : 4, 4, 1, 1, "#1b1b1b");
      } else {
        p(3, 1, 6, 2, hair);
        p(3, 3, 1, 1, hair);
        p(8, 3, 1, 1, hair);
        if (style === "long") { p(2, 2, 1, 8, hair); p(9, 2, 1, 8, hair); }
        p(4, 4, 1, 1, "#1b1b1b");
        p(7, 4, 1, 1, "#1b1b1b");
      }
      if (style === "bun") p(5, 0, 2, 1, hair);
      if (style === "cap") {
        p(3, 0, 6, 2, look.hat || "#333");
        if (dir === "down") p(3, 2, 6, 1, look.hat || "#333");
        if (dir === "left") p(1, 1, 3, 1, look.hat || "#333");
        if (dir === "right") p(8, 1, 3, 1, look.hat || "#333");
      }
    } else if (dir !== "up") {
      if (side) p(dir === "right" ? 7 : 4, 4, 1, 1, "#1b1b1b");
      else { p(4, 4, 1, 1, "#1b1b1b"); p(7, 4, 1, 1, "#1b1b1b"); }
    }
  };

  // Little speech bubble with a symbol: "!" "..." "heart" "angry" "zzz".
  NS.drawEmote = function (ctx, x, y, kind) {
    var ox = Math.round(x) - 5, oy = Math.round(y) - 30;
    rect(ctx, ox, oy, 11, 9, "#1b1b1b");
    rect(ctx, ox + 1, oy + 1, 9, 7, "#ffffff");
    rect(ctx, ox + 4, oy + 9, 2, 1, "#1b1b1b");
    function p(a, b, w, h, c) { rect(ctx, ox + a, oy + b, w, h, c); }
    if (kind === "!") { p(5, 2, 1, 3, "#d6402b"); p(5, 6, 1, 1, "#d6402b"); }
    if (kind === "...") { p(2, 4, 1, 1, "#444"); p(5, 4, 1, 1, "#444"); p(8, 4, 1, 1, "#444"); }
    if (kind === "heart") { p(3, 2, 2, 1, "#e0457b"); p(6, 2, 2, 1, "#e0457b"); p(2, 3, 7, 2, "#e0457b"); p(3, 5, 5, 1, "#e0457b"); p(4, 6, 3, 1, "#e0457b"); }
    if (kind === "angry") { p(2, 2, 2, 2, "#d6402b"); p(7, 2, 2, 2, "#d6402b"); p(2, 5, 2, 2, "#d6402b"); p(7, 5, 2, 2, "#d6402b"); }
    if (kind === "rx") { p(3, 2, 1, 5, "#2f6f4f"); p(4, 2, 2, 1, "#2f6f4f"); p(5, 3, 1, 1, "#2f6f4f"); p(4, 4, 2, 1, "#2f6f4f"); p(6, 5, 2, 2, "#2f6f4f"); }
  };

  // Big first-person bust, 32x36 "pixels" of size s. (cx, baseY) is bottom centre.
  NS.drawBust = function (ctx, cx, baseY, s, look, mood, blink) {
    var ox = Math.round(cx - 16 * s), oy = Math.round(baseY - 36 * s);
    function p(a, b, w, h, c) { rect(ctx, ox + a * s, oy + b * s, w * s, h * s, c); }
    var skin = look.skin, hair = look.hair, style = look.hairStyle;
    var shade = "rgba(0,0,0,.14)";

    // long hair falls behind the shoulders
    if (style === "long") p(7, 8, 18, 22, hair);

    // shoulders and torso
    p(3, 26, 26, 10, look.top);
    p(2, 28, 28, 8, look.top);
    p(3, 26, 26, 1, "rgba(255,255,255,.12)");
    p(12, 25, 8, 3, look.top);
    p(13, 25, 6, 2, skin);
    p(14, 27, 4, 1, skin);

    // neck
    p(13, 21, 6, 5, skin);
    p(13, 21, 6, 2, shade);

    // head
    p(10, 7, 12, 15, skin);
    p(9, 9, 14, 11, skin);
    p(8, 13, 1, 4, skin);
    p(23, 13, 1, 4, skin);
    p(10, 20, 12, 2, shade);

    // eyes and brows
    if (blink) {
      p(12, 14, 3, 1, "#1b1b1b");
      p(17, 14, 3, 1, "#1b1b1b");
    } else {
      p(12, 13, 3, 2, "#ffffff");
      p(17, 13, 3, 2, "#ffffff");
      p(13, 13, 1, 2, "#1b1b1b");
      p(18, 13, 1, 2, "#1b1b1b");
    }
    var brow = style === "bald" ? "#5a4636" : hair;
    if (mood === "angry") {
      p(12, 10, 1, 1, brow); p(13, 11, 2, 1, brow);
      p(19, 10, 1, 1, brow); p(17, 11, 2, 1, brow);
    } else {
      p(12, 11, 3, 1, brow);
      p(17, 11, 3, 1, brow);
    }

    // nose and mouth
    p(15, 15, 2, 2, shade);
    if (mood === "happy") {
      p(13, 18, 1, 1, "#7a2f2f"); p(18, 18, 1, 1, "#7a2f2f");
      p(14, 19, 4, 1, "#7a2f2f");
    } else if (mood === "angry") {
      p(14, 18, 4, 1, "#7a2f2f");
      p(13, 19, 1, 1, "#7a2f2f"); p(18, 19, 1, 1, "#7a2f2f");
    } else {
      p(14, 19, 4, 1, "#7a2f2f");
    }

    // hair on top
    if (style === "short" || style === "long" || style === "bun") {
      p(9, 5, 14, 4, hair);
      p(10, 4, 12, 1, hair);
      p(9, 9, 2, 4, hair);
      p(21, 9, 2, 4, hair);
      p(11, 9, 4, 1, hair);
    }
    if (style === "long") {
      p(7, 9, 3, 18, hair);
      p(22, 9, 3, 18, hair);
    }
    if (style === "bun") p(13, 1, 6, 4, hair);
    if (style === "cap") {
      p(9, 4, 14, 5, look.hat || "#333");
      p(9, 9, 18, 2, look.hat || "#333");
      p(9, 11, 2, 2, hair);
      p(21, 11, 2, 2, hair);
    }
    if (look.glasses) {
      p(11, 12, 5, 1, "#1b1b1b"); p(16, 12, 5, 1, "#1b1b1b");
      p(11, 15, 5, 1, "#1b1b1b"); p(16, 15, 5, 1, "#1b1b1b");
      p(11, 12, 1, 4, "#1b1b1b"); p(15, 12, 2, 1, "#1b1b1b"); p(20, 12, 1, 4, "#1b1b1b");
    }
  };
})();
