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
    const sprites = model.sprites.map((sp) => ({
      ...sp, visible: true, control: 0, follow: null, vx: 0, vy: 0,
    }));
    const actors = new Map(sprites.map((sp) => [sp.id, sp]));
    const scene = { background: model.background, sprites };
    const pressed = new Set();
    const handlers = new Map();
    for (const rule of rules) {
      if (!handlers.has(rule.type)) handlers.set(rule.type, []);
      handlers.get(rule.type).push(rule);
    }
    const spatialRules = rules.filter((r) =>
      ["evt_touch", "evt_separate", "evt_edge", "evt_cell"].includes(r.type),
    );
    const spatialState = new Map();
    const startTime = performance.now();
    const timedRules = rules
      .filter((r) => r.type === "evt_every" || r.type === "evt_after")
      .map((rule) => {
        const period = Math.max(0.1, Number(rule.fields.SEC)) * 1000;
        return { rule, period, due: startTime + period };
      });
    const queue = [];
    const edgeBits = { left: 1, right: 2, top: 4, bottom: 8, any: 15 };
    function usesLives(commands) {
      return commands.some((c) => c.type === "if_lives" || c.type === "life_add" || c.type === "life_set" ||
        (c.yes && (usesLives(c.yes) || usesLives(c.no))));
    }
    const showLives = handlers.has("evt_no_lives") || rules.some((r) => usesLives(r.body));
    let score = 0,
      lives = 3,
      countdownStarted = false,
      deadline = null,
      result = "",
      message = "",
      lastStatus = "",
      disposed = false,
      frameId,
      previous = startTime,
      destination = null;
    function updateStatus() {
      const seconds = countdownStarted ? Math.ceil(timeLeft() / 1000) : null;
      const info = { score, lives: showLives ? lives : null, seconds, result, message };
      const signature = JSON.stringify(info);
      if (signature !== lastStatus) {
        lastStatus = signature;
        onStatus(info);
      }
    }
    function emit(type, test) {
      for (const rule of handlers.get(type) || []) {
        if (result) break;
        if (!test || test(rule.fields)) enqueue(rule);
      }
    }
    function enqueue(rule) {
      if (queue.length < 2048) queue.push(rule);
      else {
        result = "error";
        message = "Слишком много событий подряд. Проверьте, какие правила запускают друг друга.";
      }
    }
    function flush() {
      // Events raised by a command run after the current chain has finished.
      for (let i = 0; i < queue.length && !result; i++) {
        run(queue[i].body);
      }
      queue.length = 0;
    }
    function timeLeft() {
      return deadline === null ? 0 : Math.max(0, deadline - performance.now());
    }
    function setCountdown(ms) {
      countdownStarted = true;
      if (ms > 0) deadline = performance.now() + ms;
      else if (deadline !== null) {
        deadline = null;
        emit("evt_timer_end");
      }
    }
    function setScore(next) {
      const before = score;
      score = next;
      emit("evt_score", (f) => before < Number(f.N) && score >= Number(f.N));
    }
    function setLives(next) {
      const before = lives;
      lives = Math.max(0, next);
      if (before > 0 && lives === 0) emit("evt_no_lives");
    }
    function touching(a, b) {
      return Boolean(a && b && a !== b && a.visible && b.visible &&
        Math.abs(a.x - b.x) < 0.72 && Math.abs(a.y - b.y) < 0.72);
    }
    function edges(a) {
      if (!a || !a.visible) return 0;
      const epsilon = 1e-8;
      return (a.x <= epsilon ? edgeBits.left : 0) | (a.x >= cols - 1 - epsilon ? edgeBits.right : 0) |
        (a.y <= epsilon ? edgeBits.top : 0) | (a.y >= rows - 1 - epsilon ? edgeBits.bottom : 0);
    }
    function sampleScene() {
      for (const rule of spatialRules) {
        const f = rule.fields, a = actors.get(f.A);
        const before = spatialState.get(rule) || 0;
        let current;
        if (rule.type === "evt_edge") current = edges(a) & edgeBits[f.SIDE];
        else if (rule.type === "evt_cell")
          current = Number(Boolean(a?.visible && Math.round(a.x) === Number(f.X) && Math.round(a.y) === Number(f.Y)));
        else current = Number(touching(a, actors.get(f.B)));
        spatialState.set(rule, current);
        const triggered = rule.type === "evt_separate" ? before && !current : current & ~before;
        if (triggered) enqueue(rule);
      }
    }
    function bounce(a) {
      const mask = edges(a);
      if (((mask & edgeBits.left) && a.vx < 0) || ((mask & edgeBits.right) && a.vx > 0)) a.vx *= -1;
      if (((mask & edgeBits.top) && a.vy < 0) || ((mask & edgeBits.bottom) && a.vy > 0)) a.vy *= -1;
    }
    function compare(value, fields) {
      const n = Number(fields.N);
      return fields.OP === "eq" ? value === n : fields.OP === "lt" ? value < n : value >= n;
    }
    const signalName = (s) => String(s || "").trim().toLowerCase();
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
          case "velocity":
            if (a) {
              a.vx = Number(f.VX);
              a.vy = Number(f.VY);
            }
            break;
          case "bounce":
            if (a) bounce(a);
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
            setScore(score + Number(f.N));
            break;
          case "score_set":
            setScore(Number(f.N));
            break;
          case "life_set":
            setLives(Number(f.N));
            break;
          case "life_add":
            setLives(lives + Number(f.N));
            break;
          case "timer_start":
            setCountdown(Number(f.SEC) * 1000);
            break;
          case "timer_add":
            if (countdownStarted) setCountdown(timeLeft() + Number(f.SEC) * 1000);
            break;
          case "signal_send": {
            const name = signalName(f.NAME);
            if (name) emit("evt_signal", (fields) => signalName(fields.NAME) === name);
            break;
          }
          case "if_score":
            run(compare(score, f) ? cmd.yes : cmd.no);
            break;
          case "if_lives":
            run(compare(lives, f) ? cmd.yes : cmd.no);
            break;
          case "if_touch":
            run(touching(a, b) ? cmd.yes : cmd.no);
            break;
          case "if_key":
            run(pressed.has(f.KEY) ? cmd.yes : cmd.no);
            break;
          case "finish":
            result = f.RESULT === "loss" ? "loss" : "win";
            break;
        }
      }
    }
    function advanceClocks(now) {
      for (const timer of timedRules) {
        if (now < timer.due) continue;
        enqueue(timer.rule);
        timer.due = timer.rule.type === "evt_after" ? Infinity :
          timer.due + (Math.floor((now - timer.due) / timer.period) + 1) * timer.period;
      }
      if (deadline !== null && now >= deadline) setCountdown(0);
      flush();
    }
    function frame(now) {
      if (disposed || result) return;
      const elapsed = Math.max(0, Math.min((now - previous) / 1000, 0.12));
      previous = now;
      advanceClocks(now);
      const dx = Number(pressed.has("right")) - Number(pressed.has("left"));
      const dy = Number(pressed.has("down")) - Number(pressed.has("up"));
      const steps = Math.max(1, Math.ceil(elapsed * 60));
      const dt = elapsed / steps;
      for (let i = 0; i < steps && !result; i++) {
        for (const actor of sprites) {
          if (!actor.visible) continue;
          if (actor.vx || actor.vy) moveBy(actor, actor.vx * dt, actor.vy * dt);
          if (actor.control) {
            if (dx || dy) {
              const len = Math.hypot(dx, dy);
              moveBy(actor, (dx / len) * actor.control * dt, (dy / len) * actor.control * dt);
            } else if (destination) approach(actor, destination.x, destination.y, actor.control * dt);
          }
          if (actor.follow && actor.follow.target.visible)
            approach(actor, actor.follow.target.x, actor.follow.target.y, actor.follow.speed * dt);
        }
        sampleScene();
        flush();
      }
      draw(canvas, scene, palette, null, false);
      updateStatus();
      if (!result) frameId = requestAnimationFrame(frame);
    }
    function finishInput() {
      flush();
      draw(canvas, scene, palette, null, false);
      updateStatus();
    }
    function acceptInput() {
      if (disposed || result) return false;
      advanceClocks(performance.now());
      if (result) finishInput();
      return !result;
    }
    function key(key, down) {
      if (!acceptInput()) return;
      if (down) {
        if (pressed.has(key)) return;
        pressed.add(key);
        if (key !== "action") destination = null;
      } else if (!pressed.delete(key)) return;
      emit(down ? "evt_key" : "evt_key_up", (f) => f.KEY === key);
      finishInput();
    }
    function point(x, y, sceneX = x + 0.5, sceneY = y + 0.5) {
      if (!acceptInput()) return;
      destination = { x: clamp(x, cols - 1), y: clamp(y, rows - 1) };
      for (let i = sprites.length - 1; i >= 0; i--) {
        const a = sprites[i];
        if (a.visible && sceneX >= a.x && sceneX < a.x + 1 && sceneY >= a.y && sceneY < a.y + 1) {
          emit("evt_tap", (f) => f.A === a.id);
          break;
        }
      }
      finishInput();
    }
    function dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      pressed.clear();
    }
    emit("evt_start");
    flush();
    if (!result) {
      sampleScene();
      flush();
    }
    updateStatus();
    draw(canvas, scene, palette, null, false);
    if (!result) frameId = requestAnimationFrame(frame);
    function clearKeys() {
      for (const held of [...pressed]) key(held, false);
      pressed.clear();
    }
    return { key, point, dispose, clearKeys };
  }
  function cellAt(canvas, event) {
    const b = canvas.getBoundingClientRect();
    const sceneX = ((event.clientX - b.left) / b.width) * cols;
    const sceneY = ((event.clientY - b.top) / b.height) * rows;
    return {
      sceneX, sceneY,
      x: clamp(Math.floor(sceneX), cols - 1),
      y: clamp(Math.floor(sceneY), rows - 1),
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
      if (!game || !key) return;
      if (!allowKeyboard() || e.altKey || e.metaKey || e.ctrlKey ||
        e.target.closest?.("input,textarea,select,[contenteditable=true]")) {
        if (!down) game.key(key, false);
        return;
      }
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
      game.point(p.x, p.y, p.sceneX, p.sceneY);
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
