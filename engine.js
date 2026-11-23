/* Shared by the studio preview and downloaded stand-alone games. */
function createPixelEngine() {
  "use strict";
  const cols = 12,
    rows = 8,
    tile = 16;
  const width = cols * tile,
    height = rows * tile;
  const themes = {
    space: { base: "#171830", floor: "#232645", accent: "#7770ad", detail: "#c8bdf6" },
    woods: { base: "#163c38", floor: "#214d44", accent: "#45856b", detail: "#b0ca79" },
    sea: { base: "#15354d", floor: "#1b4560", accent: "#438093", detail: "#92d4d1" },
    dusk: { base: "#432d46", floor: "#513650", accent: "#8a5369", detail: "#f3b888" },
  };
  const spritesCache = new Map();
  function getImage(sprite, palette) {
    const imageKey = sprite.pixels.join("") + palette.join("");
    let image = spritesCache.get(imageKey);
    if (image) return image;
    image = document.createElement("canvas");
    image.width = image.height = tile;
    const ctx = image.getContext("2d");
    sprite.pixels.forEach((row, y) =>
      Array.from(row).forEach((hex, x) => {
        const n = parseInt(hex, 16);
        if (n) {
          ctx.fillStyle = palette[n];
          ctx.fillRect(x, y, 1, 1);
        }
      }),
    );
    if (spritesCache.size > 200) spritesCache.clear();
    spritesCache.set(imageKey, image);
    return image;
  }
  function draw(canvas, scene, palette, selection, grid) {
    const c = canvas.getContext("2d");
    const theme = themes[scene.background] || themes.space;
    c.imageSmoothingEnabled = false;
    c.fillStyle = theme.base;
    c.fillRect(0, 0, width, height);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const px = x * tile,
          py = y * tile,
          seed = (x * 17 + y * 47 + x * y * 7) % 13;
        if (grid) {
          c.fillStyle = theme.floor;
          c.fillRect(px, py, tile, 1);
          c.fillRect(px, py, 1, tile);
        }
        if (seed < 4) {
          const ax = px + 3 + ((x * 3 + y * 2) % 10),
            ay = py + 3 + ((x + y * 5) % 9);
          c.fillStyle = seed === 0 ? theme.detail : theme.accent;
          c.fillRect(ax, ay, 1, 1);
          if (scene.background === "sea") c.fillRect(ax + 1, ay + 1, 2, 1);
          if (scene.background === "woods" && seed < 2) c.fillRect(ax + 2, ay - 2, 1, 2);
          if (scene.background === "space" && seed === 0 && x % 3 === 1) {
            c.fillStyle = theme.accent;
            c.fillRect(ax - 1, ay, 1, 1);
            c.fillRect(ax + 1, ay, 1, 1);
          }
        }
      }
    for (const sp of scene.sprites) {
      if (sp.visible === false) continue;
      const x = Math.round(sp.x * tile),
        y = Math.round(sp.y * tile);
      if (sp.id === selection) {
        c.fillStyle = "#b9f590";
        [
          [0, 0, 4, 1],
          [0, 0, 1, 4],
          [12, 0, 4, 1],
          [15, 0, 1, 4],
          [0, 15, 4, 1],
          [0, 12, 1, 4],
          [12, 15, 4, 1],
          [15, 12, 1, 4],
        ].forEach((p) => c.fillRect(x + p[0], y + p[1], p[2], p[3]));
      }
      c.drawImage(getImage(sp, palette), x, y);
    }
  }
  const clamp = (n, max) => Math.max(0, Math.min(max, n));
  function play(model, rules, palette, canvas, onStatus) {
    const sprites = model.sprites.map((sp) => ({ ...sp, visible: true, control: 0, follow: null }));
    const actors = new Map(sprites.map((sp) => [sp.id, sp]));
    const scene = { background: model.background, sprites };
    const pressed = new Set(),
      timers = new Map(),
      touching = new Set();
    let score = 0,
      result = "",
      disposed = false,
      frameId,
      previous = performance.now(),
      destination = null;
    function updateStatus() {
      onStatus({ score, result });
    }
    function moveBy(actor, dx, dy) {
      actor.x = clamp(actor.x + dx, cols - 1);
      actor.y = clamp(actor.y + dy, rows - 1);
    }
    function approach(actor, x, y, delta) {
      const dx = x - actor.x,
        dy = y - actor.y,
        distance = Math.hypot(dx, dy);
      if (distance > 0)
        moveBy(
          actor,
          (dx / distance) * Math.min(delta, distance),
          (dy / distance) * Math.min(delta, distance),
        );
    }
    function relocate(actor) {
      const places = [];
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          if (Math.abs(actor.x - x) < 1 && Math.abs(actor.y - y) < 1) continue;
          if (
            !sprites.some(
              (sp) => sp !== actor && sp.visible && Math.abs(sp.x - x) < 1 && Math.abs(sp.y - y) < 1,
            )
          )
            places.push([x, y]);
        }
      if (places.length) [actor.x, actor.y] = places[Math.floor(Math.random() * places.length)];
    }
    function run(commands) {
      for (const cmd of commands) {
        if (result) break;
        const f = cmd.fields,
          a = actors.get(f.A),
          b = actors.get(f.B);
        switch (cmd.type) {
          case "control":
            if (a) a.control = Number(f.SPEED);
            break;
          case "chase":
            if (a && b && a !== b) a.follow = { target: b, speed: Number(f.SPEED) };
            break;
          case "move":
            if (a) moveBy(a, Number(f.X), Number(f.Y));
            break;
          case "place":
            if (a) {
              a.x = clamp(Number(f.X), cols - 1);
              a.y = clamp(Number(f.Y), rows - 1);
            }
            break;
          case "teleport":
            if (a) relocate(a);
            break;
          case "visible":
            if (a) a.visible = f.SHOW === "yes";
            break;
          case "background":
            scene.background = f.THEME;
            break;
          case "score_add":
            score += Number(f.N);
            updateStatus();
            break;
          case "score_set":
            score = Number(f.N);
            updateStatus();
            break;
          case "if_score": {
            const n = Number(f.N);
            const yes = f.OP === "eq" ? score === n : f.OP === "lt" ? score < n : score >= n;
            run(yes ? cmd.yes : cmd.no);
            break;
          }
          case "finish":
            result = f.RESULT === "loss" ? "loss" : "win";
            updateStatus();
            break;
        }
      }
    }
    function frame(now) {
      if (disposed) return;
      const dt = Math.min((now - previous) / 1000, 0.09);
      previous = now;
      if (!result) {
        const dx = Number(pressed.has("right")) - Number(pressed.has("left"));
        const dy = Number(pressed.has("down")) - Number(pressed.has("up"));
        for (const actor of sprites) {
          if (actor.control && actor.visible) {
            if (dx || dy) {
              const len = Math.hypot(dx, dy);
              moveBy(actor, (dx / len) * actor.control * dt, (dy / len) * actor.control * dt);
            } else if (destination) approach(actor, destination.x, destination.y, actor.control * dt);
          }
          if (actor.follow && actor.visible && actor.follow.target.visible)
            approach(actor, actor.follow.target.x, actor.follow.target.y, actor.follow.speed * dt);
        }
        for (const rule of rules) {
          if (result) break;
          if (rule.type === "evt_every") {
            const elapsed = (timers.get(rule) || 0) + dt;
            const delay = Math.max(0.1, Number(rule.fields.SEC));
            if (elapsed >= delay) {
              timers.set(rule, elapsed % delay);
              run(rule.body);
            } else timers.set(rule, elapsed);
          } else if (rule.type === "evt_touch") {
            const a = actors.get(rule.fields.A),
              b = actors.get(rule.fields.B);
            const hit =
              a &&
              b &&
              a !== b &&
              a.visible &&
              b.visible &&
              Math.abs(a.x - b.x) < 0.72 &&
              Math.abs(a.y - b.y) < 0.72;
            if (hit && !touching.has(rule)) {
              touching.add(rule);
              run(rule.body);
            }
            if (!hit) touching.delete(rule);
          }
        }
      }
      draw(canvas, scene, palette, null, false);
      if (!result) frameId = requestAnimationFrame(frame);
    }
    function key(key, down) {
      if (!down) {
        pressed.delete(key);
        return;
      }
      if (result || pressed.has(key)) return;
      pressed.add(key);
      if (key !== "action") destination = null;
      for (const rule of rules) if (rule.type === "evt_key" && rule.fields.KEY === key) run(rule.body);
    }
    function point(x, y) {
      if (!result) destination = { x: clamp(x, cols - 1), y: clamp(y, rows - 1) };
    }
    function dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      pressed.clear();
    }
    updateStatus();
    for (const rule of rules) if (rule.type === "evt_start") run(rule.body);
    draw(canvas, scene, palette, null, false);
    frameId = requestAnimationFrame(frame);
    return { key, point, dispose, clearKeys: () => pressed.clear() };
  }
  function cellAt(canvas, event) {
    const b = canvas.getBoundingClientRect();
    return {
      x: clamp(Math.floor(((event.clientX - b.left) / b.width) * cols), cols - 1),
      y: clamp(Math.floor(((event.clientY - b.top) / b.height) * rows), rows - 1),
    };
  }
  function bindInput(canvas, getGame, pad, allowKeyboard = () => true) {
    const keys = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
      " ": "action",
      a: "left",
      d: "right",
      w: "up",
      s: "down",
      ф: "left",
      в: "right",
      ц: "up",
      ы: "down",
    };
    const keyboard = (e, down) => {
      const game = getGame(),
        key = keys[e.key];
      if (!game || !key || !allowKeyboard() || e.altKey || e.metaKey || e.ctrlKey) return;
      if (down && e.target.closest?.("input,textarea,select,[contenteditable=true]")) return;
      e.preventDefault();
      game.key(key, down);
    };
    window.addEventListener("keydown", (e) => keyboard(e, true));
    window.addEventListener("keyup", (e) => keyboard(e, false));
    window.addEventListener("blur", () => getGame()?.clearKeys());
    canvas.addEventListener("pointerdown", (e) => {
      const game = getGame();
      if (!game) return;
      e.preventDefault();
      const p = cellAt(canvas, e);
      game.point(p.x, p.y);
    });
    if (pad)
      pad.querySelectorAll("[data-key]").forEach((b) => {
        b.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          b.setPointerCapture(e.pointerId);
          getGame()?.key(b.dataset.key, true);
        });
        const up = () => getGame()?.key(b.dataset.key, false);
        b.addEventListener("pointerup", up);
        b.addEventListener("pointercancel", up);
        b.addEventListener("lostpointercapture", up);
        b.addEventListener("click", (e) => {
          if (e.detail === 0) {
            getGame()?.key(b.dataset.key, true);
            setTimeout(up, 150);
          }
        });
      });
  }
  return { cols, rows, width, height, draw, getImage, play, cellAt, bindInput };
}
