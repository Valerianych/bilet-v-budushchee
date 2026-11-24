"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const engine = createPixelEngine(),
    canvas = $("stage"),
    dialog = $("dialog"),
    storageKey = "bilet.pixel.studio.v1";
  const lessonFiles = [
    ["Лекция для ведущего · PDF", "pdf/Лекция%20для%20ведущего.pdf?v=igry"],
    ["Конспект и рабочий лист · PDF", "pdf/Конспект%20и%20рабочий%20лист.pdf?v=studio"],
  ];
  const fresh = () => ({
    format: "bilet-pixel-studio",
    version: 1,
    name: "Моя игра",
    background: "space",
    sprites: [],
    workspace: {},
  });
  let model = fresh(),
    selected = "",
    game = null,
    playSignature = "",
    tab = "blocks",
    restoring = false,
    dirty = false,
    saveTimer,
    statusTimer,
    guidePage = 0;
  const themeNames = StudioBlocks.themes.map((pair) => pair[1]);
  function element(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function btn(label, cls, handler) {
    const b = element("button", cls, label);
    b.type = "button";
    b.onclick = handler;
    return b;
  }
  function open(title) {
    $("dialog-title").textContent = title;
    $("dialog-body").replaceChildren();
    if (!dialog.open) dialog.showModal();
    return $("dialog-body");
  }
  function toast(msg) {
    clearTimeout(statusTimer);
    $("toast").hidden = false;
    $("toast").textContent = msg;
    statusTimer = setTimeout(() => {
      $("toast").hidden = true;
    }, 3700);
  }
  function validProject(src) {
    if (
      !src ||
      src.format !== "bilet-pixel-studio" ||
      src.version !== 1 ||
      !Array.isArray(src.sprites) ||
      src.sprites.length > 96 ||
      typeof src.name !== "string" ||
      !themeNames.includes(src.background)
    )
      throw Error("Выберите файл проекта Пиксельной студии.");
    const ids = new Set();
    const sprites = src.sprites.map((s) => {
      if (
        !s ||
        typeof s.id !== "string" ||
        !/^[a-zA-Z0-9_-]{1,80}$/.test(s.id) ||
        s.id === "NONE" ||
        ids.has(s.id) ||
        typeof s.name !== "string" ||
        !s.name.trim() ||
        !Array.isArray(s.pixels) ||
        s.pixels.length !== 16 ||
        !s.pixels.every((r) => typeof r === "string" && /^[0-9a-f]{16}$/.test(r)) ||
        !Number.isInteger(s.x) ||
        !Number.isInteger(s.y) ||
        s.x < 0 ||
        s.x >= engine.cols ||
        s.y < 0 ||
        s.y >= engine.rows
      )
        throw Error("В проекте повреждены данные спрайта.");
      ids.add(s.id);
      return { id: s.id, name: s.name.trim().slice(0, 32), x: s.x, y: s.y, pixels: s.pixels.slice() };
    });
    const ws = src.workspace;
    if (!ws || typeof ws !== "object" || Array.isArray(ws))
      throw Error("В файле отсутствуют блоки проекта.");
    const blocks = ws.blocks?.blocks || [];
    let count = 0;
    function check(b, depth) {
      if (!b || !Object.hasOwn(StudioBlocks.byType, b.type) || ++count > 800 || depth > 90)
        throw Error("В проекте есть неподдерживаемые блоки.");
      for (const input of Object.values(b.inputs || {})) if (input.block) check(input.block, depth + 1);
      if (b.next?.block) check(b.next.block, depth + 1);
    }
    if (!Array.isArray(blocks)) throw Error("Не удалось прочитать блоки проекта.");
    blocks.forEach((b) => check(b, 0));
    return {
      format: src.format,
      version: 1,
      name: src.name.trim().slice(0, 48) || "Моя игра",
      background: src.background,
      sprites,
      workspace: ws.blocks ? { blocks: ws.blocks } : {},
    };
  }
  let restoreNote = "";
  try {
    const data = localStorage.getItem(storageKey);
    if (data) model = validProject(JSON.parse(data));
  } catch {
    restoreNote = "Не удалось прочитать сохранение на этом устройстве.";
  }
  const blocks = StudioBlocks.create($("blockly"), () => model.sprites, blocksChanged);
  function packet() {
    return { ...model, workspace: blocks.save() };
  }
  function persist() {
    clearTimeout(saveTimer);
    if (!dirty) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(packet()));
      dirty = false;
      $("save-state").textContent = "Сохранено на устройстве";
    } catch {
      $("save-state").textContent = "Для сохранения скачайте проект";
    }
  }
  function schedule() {
    if (restoring) return;
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 220);
  }
  function countText(n, one, few, many) {
    return (
      n +
      " " +
      (n % 10 === 1 && n % 100 !== 11
        ? one
        : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)
          ? few
          : many)
    );
  }
  function updateProgramUI() {
    const count = blocks.count();
    $("block-empty").hidden =
      tab !== "blocks" || count > 0 || Boolean(blocks.ws.getToolbox()?.getSelectedItem());
    const events = blocks.ws
      .getTopBlocks(false)
      .filter((b) => StudioBlocks.byType[b.type]?.group === 0).length;
    const loose = blocks.ws.getTopBlocks(false).some((b) => StudioBlocks.byType[b.type]?.group !== 0);
    $("workspace-status").textContent = loose
      ? "Присоедините свободные команды к событию"
      : count
        ? countText(events, "событие", "события", "событий") +
          " · " +
          countText(count, "блок", "блока", "блоков")
        : "Пока нет блоков";
    if (tab === "flow") showFlow();
  }
  function blocksChanged() {
    if (restoring) return;
    if (game && JSON.stringify(blocks.compile()) !== playSignature) {
      stopGame();
      toast("Правило изменено. Нажмите «Играть» для проверки.");
    }
    updateProgramUI();
    schedule();
  }
  function drawScene() {
    if (!game) engine.draw(canvas, model, PixelArt.palette, selected, true);
  }
  function spriteById(id) {
    return model.sprites.find((s) => s.id === id);
  }
  function nameFor(base, except) {
    const plain = base.trim().slice(0, 28) || "Спрайт",
      names = new Set(model.sprites.filter((s) => s.id !== except).map((s) => s.name));
    let value = plain,
      i = 2;
    while (names.has(value)) value = plain + " " + i++;
    return value;
  }
  function nextPosition() {
    const preferred = [
      [2, 4],
      [9, 3],
      [8, 6],
      [3, 1],
      [6, 2],
    ];
    for (let y = 0; y < engine.rows; y++) for (let x = 0; x < engine.cols; x++) preferred.push([x, y]);
    return preferred.find(([x, y]) => !model.sprites.some((s) => s.x === x && s.y === y)) || [0, 0];
  }
  function addSprite(sprite) {
    if (model.sprites.length >= 96) {
      toast("На сцене уже 96 спрайтов.");
      return;
    }
    stopGame();
    const [x, y] = nextPosition();
    const id =
      "s" +
      (globalThis.crypto?.randomUUID?.().replace(/-/g, "") ||
        Date.now().toString(36) + Math.random().toString(36).slice(2));
    model.sprites.push({ id, name: nameFor(sprite.name), pixels: sprite.pixels.slice(), x, y });
    selected = id;
    if (dialog.open) dialog.close();
    blocks.refreshActors();
    refreshSprites();
    schedule();
  }
  function openGallery() {
    stopGame();
    SpriteEditor.gallery(open, addSprite);
  }
  function refreshSprites() {
    const list = $("sprite-list");
    list.replaceChildren();
    $("sprite-count").textContent = model.sprites.length;
    $("stage-empty").hidden = Boolean(model.sprites.length) || Boolean(game);
    if (!model.sprites.length) {
      for (const key of ["robot", "cat", "crystal", "ghost"]) {
        const a = PixelArt.gallery.find((s) => s.id === key);
        if (!a) continue;
        const b = btn("", "sprite-card", () => addSprite(a));
        b.setAttribute("aria-label", "Добавить " + a.name);
        b.append(SpriteEditor.thumbnail(a.pixels, PixelArt.palette), element("span", "", a.name));
        list.append(b);
      }
    } else
      for (const s of model.sprites) {
        const b = btn("", "sprite-card", () => {
          selected = s.id;
          refreshSprites();
        });
        b.dataset.sprite = s.id;
        b.setAttribute("aria-pressed", String(selected === s.id));
        b.append(SpriteEditor.thumbnail(s.pixels, PixelArt.palette), element("span", "", s.name));
        list.append(b);
      }
    const sp = spriteById(selected);
    $("sprite-tools").hidden = !sp || Boolean(game);
    $("position").textContent = sp ? "X " + sp.x + " · Y " + sp.y : "";
    drawScene();
  }
  function editSprite() {
    const sp = spriteById(selected);
    if (!sp) return;
    stopGame();
    SpriteEditor.paint(open, sp, (newData) => {
      sp.name = nameFor(newData.name, sp.id);
      sp.pixels = newData.pixels;
      dialog.close();
      blocks.refreshActors();
      refreshSprites();
      updateProgramUI();
      schedule();
    });
  }
  function confirmAction(title, question, yes, apply) {
    const body = open(title),
      actions = element("div", "actions");
    body.append(element("p", "", question), actions);
    actions.append(
      btn("Отмена", "", () => dialog.close()),
      btn(yes, "primary", () => {
        dialog.close();
        apply();
      }),
    );
  }
  $("remove-sprite").onclick = () => {
    const sp = spriteById(selected);
    if (!sp) return;
    confirmAction(
      "Удалить спрайт",
      "Удалить «" + sp.name + "» со сцены? В его блоках можно будет выбрать другой спрайт.",
      "Удалить",
      () => {
        stopGame();
        model.sprites = model.sprites.filter((s) => s.id !== sp.id);
        selected = model.sprites[0]?.id || "";
        blocks.refreshActors();
        refreshSprites();
        updateProgramUI();
        schedule();
      },
    );
  };
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (game) return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    const p = engine.cellAt(canvas, e),
      sp = [...model.sprites].reverse().find((s) => s.x === p.x && s.y === p.y);
    if (sp) selected = sp.id;
    const s = spriteById(selected);
    if (!s) return;
    s.x = p.x;
    s.y = p.y;
    drag = e.pointerId;
    canvas.setPointerCapture(drag);
    refreshSprites();
    schedule();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (game || drag !== e.pointerId) return;
    const s = spriteById(selected);
    if (!s) return;
    const p = engine.cellAt(canvas, e);
    s.x = p.x;
    s.y = p.y;
    $("position").textContent = "X " + s.x + " · Y " + s.y;
    drawScene();
    schedule();
  });
  canvas.onpointerup =
    canvas.onpointercancel =
    canvas.onlostpointercapture =
      () => {
        drag = null;
      };
  canvas.addEventListener("keydown", (e) => {
    if (game) return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    const s = spriteById(selected);
    if (!d || !s) return;
    e.preventDefault();
    s.x = Math.max(0, Math.min(11, s.x + d[0]));
    s.y = Math.max(0, Math.min(7, s.y + d[1]));
    refreshSprites();
    schedule();
  });
  $("add-sprite").onclick = $("stage-add").onclick = openGallery;
  $("edit-sprite").onclick = editSprite;
  $("background").onchange = (e) => {
    stopGame();
    model.background = e.target.value;
    drawScene();
    schedule();
  };
  $("project-name").oninput = (e) => {
    model.name = e.target.value.trim() || "Моя игра";
    schedule();
  };
  $("project-name").onblur = () => {
    $("project-name").value = model.name;
  };
  $("stage-large").onclick = () => {
    const big = document.querySelector(".scene-panel").classList.toggle("enlarged");
    $("stage-large").setAttribute("aria-label", big ? "Свернуть сцену" : "Развернуть сцену");
    $("stage-large").title = big ? "Свернуть сцену" : "Развернуть сцену";
  };
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !dialog.open && document.querySelector(".scene-panel.enlarged"))
      $("stage-large").click();
  });
  function stateForGame(info) {
    $("score").textContent = info.score;
    $("lives-stat").hidden = info.lives === null;
    $("time-stat").hidden = info.seconds === null;
    if (info.lives !== null) $("lives").textContent = info.lives;
    if (info.seconds !== null) $("seconds").textContent = info.seconds;
    $("end-screen").hidden = !info.result;
    if (info.result) {
      $("end-title").textContent = info.result === "error" ? "Проверьте блоки" :
        info.result === "win" ? "Победа!" : "Поражение";
      $("end-score").textContent = info.message || "Счёт " + info.score;
    }
  }
  function stopGame() {
    if (game) {
      game.dispose();
      game = null;
    }
    $("play").classList.remove("running");
    $("play").querySelector("span").textContent = "Играть";
    $("play").querySelector("use").setAttribute("href", "#i-play");
    $("pad").hidden = true;
    $("editor-scene-tools").hidden = false;
    $("stage-mode").textContent = "Редактор сцены";
    stateForGame({ score: 0, result: "", lives: null, seconds: null });
    refreshSprites();
  }
  function inspectRules() {
    const rules = blocks.compile();
    const bad = blocks.ws
      .getAllBlocks(false)
      .find(
        (b) =>
          StudioBlocks.byType[b.type]?.args.some(
            (f) => f.type === "field_studio_actor" && b.getFieldValue(f.name) === "NONE",
          ) && StudioBlocks.byType[b.getRootBlock().type]?.group === 0,
      );
    if (bad) {
      setTab("blocks");
      bad.select();
      blocks.ws.centerOnBlock(bad.id);
      toast("В выделенном блоке выберите спрайт из списка.");
      return null;
    }
    const same = blocks.ws
      .getAllBlocks(false)
      .find(
        (b) =>
          ["evt_touch", "evt_separate", "if_touch", "chase"].includes(b.type) &&
          b.getFieldValue("A") === b.getFieldValue("B") &&
          StudioBlocks.byType[b.getRootBlock().type]?.group === 0,
      );
    if (same) {
      setTab("blocks");
      same.select();
      blocks.ws.centerOnBlock(same.id);
      toast("В этом блоке нужны два разных спрайта.");
      return null;
    }
    const unnamed = blocks.ws.getAllBlocks(false).find((b) =>
      (b.type === "evt_signal" || b.type === "signal_send") &&
      StudioBlocks.byType[b.getRootBlock().type]?.group === 0 && !b.getFieldValue("NAME").trim(),
    );
    if (unnamed) {
      setTab("blocks");
      unnamed.select();
      blocks.ws.centerOnBlock(unnamed.id);
      toast("Впишите название сигнала в выделенный блок.");
      return null;
    }
    return rules;
  }
  function play() {
    if (!model.sprites.length) {
      openGallery();
      return;
    }
    const rules = inspectRules();
    if (!rules) return;
    if (game) game.dispose();
    playSignature = JSON.stringify(rules);
    $("play").classList.add("running");
    $("play").querySelector("span").textContent = "Стоп";
    $("play").querySelector("use").setAttribute("href", "#i-stop");
    $("pad").hidden = false;
    $("editor-scene-tools").hidden = true;
    $("stage-mode").textContent = "Игра запущена";
    $("sprite-tools").hidden = true;
    $("stage-empty").hidden = true;
    game = engine.play(model, rules, PixelArt.palette, canvas, stateForGame);
    canvas.focus({ preventScroll: true });
    if (!rules.length)
      toast("Сцена запущена. Добавьте событие и команды, чтобы спрайты начали действовать.");
  }
  $("play").onclick = () => (game ? stopGame() : play());
  $("again").onclick = play;
  engine.bindInput(
    canvas,
    () => game,
    $("pad"),
    () =>
      !dialog.open &&
      !document.querySelector(".blocklyWidgetDiv:not([style*='display: none']) input:focus"),
  );
  function showFlow() {
    const rules = blocks.compile(),
      sel = $("flow-event"),
      old = Number(sel.value) || 0;
    sel.replaceChildren();
    rules.forEach((r, i) => {
      const opt = element("option", "", r.label);
      opt.value = i;
      sel.append(opt);
    });
    sel.value = String(Math.min(old, rules.length - 1));
    sel.disabled = !rules.length;
    drawStudioFlow($("flow-drawing"), rules[Number(sel.value)]);
  }
  function setTab(view) {
    tab = view;
    const flow = view === "flow";
    $("flow-pane").hidden = !flow;
    $("blocks-pane").hidden = flow;
    $("tab-flow").setAttribute("aria-selected", String(flow));
    $("tab-blocks").setAttribute("aria-selected", String(!flow));
    $("tab-flow").classList.toggle("active", flow);
    $("tab-blocks").classList.toggle("active", !flow);
    $("undo").hidden = flow;
    $("add-block").hidden = flow;
    if (flow) showFlow();
    else
      requestAnimationFrame(() => {
        Blockly.svgResize(blocks.ws);
        updateProgramUI();
      });
  }
  $("tab-flow").onclick = () => setTab("flow");
  $("tab-blocks").onclick = () => setTab("blocks");
  $("flow-event").onchange = () =>
    drawStudioFlow($("flow-drawing"), blocks.compile()[Number($("flow-event").value)]);
  $("undo").onclick = () => blocks.ws.undo(false);
  $("first-event").onclick = () => blocks.add("evt_start", "");
  function blockMenu() {
    const body = open("Добавить блок"),
      row = element("label", "dialog-row", "Добавить команду в"),
      sel = element("select");
    const opt = element("option", "", "Рабочая область");
    opt.value = "";
    sel.append(opt);
    const targets = blocks.targets();
    for (const target of targets) {
      const o = element("option", "", target.label);
      o.value = target.value;
      sel.append(o);
    }
    const active = blocks.currentTarget();
    sel.value = targets.some((t) => t.value === active) ? active : targets.at(-1)?.value || "";
    row.append(sel);
    body.append(row);
    const search = element("input", "block-search"),
      filters = element("div", "group-tabs"),
      groups = element("div", "block-catalog");
    search.type = "search";
    search.placeholder = "Найти блок";
    search.setAttribute("aria-label", "Найти блок");
    let filter = "all";
    const sections = [
      ...StudioBlocks.eventSets.map(([name, types]) => [name, types.map((t) => StudioBlocks.byType[t])]),
      ...StudioBlocks.groups.slice(1).map(([name], i) =>
        [name, StudioBlocks.specs.filter((s) => s.group === i + 1)]),
    ];
    const normalize = (s) => s.toLowerCase().replaceAll("ё", "е").trim();
    function render() {
      groups.replaceChildren();
      const query = normalize(search.value);
      for (const button of filters.children)
        button.setAttribute("aria-pressed", String(button.dataset.filter === filter));
      for (const [name, entries] of sections) {
        const items = entries.filter((s) =>
          (filter === "all" || (filter === "events") === (s.group === 0)) &&
          normalize([s.title, s.message, StudioBlocks.hints[s.type]].join(" ")).includes(query));
        if (!items.length) continue;
        const section = element("section");
        section.append(element("h3", "", name));
        for (const s of items) {
          const b = btn(s.title, "block-choice", () => {
            dialog.close();
            blocks.add(s.type, sel.value);
          });
          b.dataset.type = s.type;
          b.style.backgroundColor = StudioBlocks.groups[s.group][1];
          section.append(b);
        }
        groups.append(section);
      }
      if (!groups.children.length)
        groups.append(element("p", "muted", "Таких блоков не найдено. Попробуйте другое слово."));
    }
    for (const [value, label] of [["all", "Все"], ["events", "События"], ["commands", "Команды"]]) {
      const button = btn(label, "group-pick", () => { filter = value; render(); });
      button.dataset.filter = value;
      filters.append(button);
    }
    search.oninput = render;
    body.append(search, filters, groups);
    render();
  }
  $("add-block").onclick = blockMenu;
  blocks.ws.addChangeListener((e) => {
    if (e.isUiEvent) updateEmpty();
  });
  function updateEmpty() {
    $("block-empty").hidden =
      blocks.count() > 0 || tab !== "blocks" || Boolean(blocks.ws.getToolbox()?.getSelectedItem());
  }
  new ResizeObserver(() => {
    if (tab === "blocks") Blockly.svgResize(blocks.ws);
  }).observe($("blocks-pane"));
  function applyProject(next) {
    stopGame();
    const previous = packet();
    restoring = true;
    try {
      model = next;
      blocks.load(model.workspace);
      selected = model.sprites[0]?.id || "";
    } catch {
      model = previous;
      blocks.load(previous.workspace);
      toast("Не удалось открыть проект. Текущая работа сохранена.");
      return;
    } finally {
      restoring = false;
    }
    $("project-name").value = model.name;
    $("background").value = model.background;
    setTab("blocks");
    refreshSprites();
    updateProgramUI();
    dirty = true;
    persist();
  }
  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type })),
      a = element("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  const filename = () =>
    model.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").slice(0, 48) || "Моя игра";
  function standalone(data) {
    const engine = createPixelEngine(),
      canvas = document.getElementById("field"),
      score = document.getElementById("score"),
      status = document.getElementById("status");
    let game;
    document.title = data.model.name;
    document.getElementById("title").textContent = data.model.name;
    function start() {
      if (game) game.dispose();
      game = engine.play(data.model, data.rules, data.palette, canvas, (s) => {
        score.textContent = s.score;
        for (const [id, value] of [["lives", s.lives], ["seconds", s.seconds]]) {
          const out = document.getElementById(id);
          out.parentElement.hidden = value === null;
          if (value !== null) out.textContent = value;
        }
        status.textContent = s.message || (s.result === "win" ? "Победа!" : s.result === "loss" ? "Поражение" : "");
      });
    }
    document.getElementById("start").onclick = start;
    engine.bindInput(canvas, () => game, document.getElementById("pad"));
    start();
  }
  function exportGame() {
    if (!model.sprites.length) {
      toast("Сначала добавьте на сцену хотя бы один спрайт.");
      return;
    }
    const rules = inspectRules();
    if (!rules) return;
    const data = JSON.stringify({
      model: { name: model.name, background: model.background, sprites: model.sprites },
      rules,
      palette: PixelArt.palette,
    })
      .replace(/</g, "\\u003c")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
    const css =
      "*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#17172c;color:#f4f3fa;font:18px/1.4 'Segoe UI',Arial,sans-serif}main{width:min(94vw,790px);padding:12px 0}header,footer,#pad{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}h1{margin:0;font-size:clamp(22px,4vw,38px)}canvas{display:block;width:min(100%,100vh);margin:8px auto;aspect-ratio:3/2;image-rendering:pixelated;border:2px solid #756a99;touch-action:none}button{min-height:43px;padding:6px 12px;border:0;border-radius:7px;font:inherit;cursor:pointer}#status{color:#bef58d;font-weight:bold}p{font-size:15px;color:#dedbe9}";
    const html =
      '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Игра</title><style>' +
      css +
      '</style><main><header><h1 id="title"></h1><b>Счёт <output id="score">0</output></b><b hidden>Жизни <output id="lives">3</output></b><b hidden>Время <output id="seconds">0</output> с</b></header><canvas id="field" width="192" height="128" aria-label="Игровое поле"></canvas><footer><div id="pad"><button data-key="left" aria-label="Влево">◀</button><button data-key="up" aria-label="Вверх">▲</button><button data-key="down" aria-label="Вниз">▼</button><button data-key="right" aria-label="Вправо">▶</button><button data-key="action">Действие</button></div><b id="status" role="status"></b><button id="start">Сначала</button></footer><p>Используйте стрелки, нажимайте на поле и спрайты. Кнопка «Действие» также работает по пробелу.</p></main><script>' +
      createPixelEngine.toString() +
      "\n;(" +
      standalone.toString() +
      ")(" +
      data +
      ");</script></html>";
    download(filename() + ".html", html, "text/html;charset=utf-8");
  }
  function examplesMenu() {
    const body = open("Примеры игр"),
      list = element("div", "examples-list");
    for (const example of StudioExamples) {
      const project = example.make();
      const card = element("article", "example-card"),
        art = element("div", "example-art"),
        content = element("div", "example-content");
      art.dataset.theme = project.background;
      art.setAttribute("aria-hidden", "true");
      for (const sp of project.sprites) art.append(SpriteEditor.thumbnail(sp.pixels, PixelArt.palette));
      const load = () => {
        applyProject(validProject(project));
        blocks.ws.scroll(0, 0);
      };
      const pick = btn("Открыть «" + example.title + "»", "", () => {
        if (model.sprites.length || blocks.count() || model.name !== "Моя игра" || model.background !== "space")
          confirmAction("Открыть пример", "Заменить текущий проект игрой «" + example.title +
            "»? Свою версию можно сначала скачать через меню «Проект».", "Открыть пример", load);
        else { dialog.close(); load(); }
      });
      content.append(element("h3", "", example.title), element("p", "", example.description),
        element("p", "example-events", example.events), pick);
      card.append(art, content);
      list.append(card);
    }
    body.append(list);
  }
  function projectMenu() {
    const body = open("Проект"),
      list = element("div", "options-list"),
      row = element("label", "dialog-row", "Название игры"),
      name = element("input");
    name.type = "text";
    name.value = model.name;
    name.maxLength = 48;
    row.append(name);
    body.append(row, list);
    name.oninput = () => {
      model.name = name.value.trim() || "Моя игра";
      $("project-name").value = model.name;
      schedule();
    };
    list.append(
      btn("Примеры игр", "", examplesMenu),
      btn("Скачать игру", "primary", () => {
        dialog.close();
        exportGame();
      }),
      btn("Скачать проект для редактирования", "", () => {
        dialog.close();
        download(filename() + ".pixel.json", JSON.stringify(packet(), null, 2), "application/json");
      }),
      btn("Открыть проект из файла", "", () => {
        $("import-file").value = "";
        $("import-file").click();
      }),
      btn("Новый пустой проект", "", () =>
        confirmAction(
          "Новый проект",
          "Начать с пустой сцены? Текущую работу можно сначала скачать через меню проекта.",
          "Начать заново",
          () => {
            guidePage = 0;
            applyProject(fresh());
          },
        ),
      ),
    );
  }
  $("project-menu").onclick = projectMenu;
  $("import-file").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (file.size > 3000000) throw Error("Файл проекта слишком большой.");
      const next = validProject(JSON.parse(await file.text()));
      if (model.sprites.length || blocks.count())
        confirmAction(
          "Открыть проект",
          "Заменить текущую сцену проектом «" + next.name + "»?",
          "Открыть",
          () => applyProject(next),
        );
      else {
        dialog.close();
        applyProject(next);
      }
    } catch (err) {
      dialog.close();
      toast(err instanceof SyntaxError ? "Выберите JSON-файл проекта." : err.message);
    }
  };
  const guide = [
    [
      "Придумайте свою игру",
      "Кто будет героем? Что он ищет и сколько находок принесут победу? Договоритесь о правиле в парах. Впишите название игры сверху.",
      "Например, космонавт собирает три кристалла. Героя, предмет и цель выбирает класс.",
    ],
    [
      "Создайте сцену",
      "Нажмите «Добавить спрайт». Выберите героя, затем предмет. Чтобы придумать своего персонажа, откройте «Нарисовать свой». Для изменения рисунка или имени нажмите «Редактировать».",
      "Перетащите спрайты на разные клетки. Фон меняется под сценой.",
    ],
    [
      "Научите героя двигаться",
      "В «Блоках» добавьте событие «При старте игры». Под него присоедините «Управлять спрайтом» и выберите своего героя. Число задаёт скорость в клетках за секунду.",
      "Нажмите «Играть». Коснитесь клетки или используйте стрелки. Вернитесь в редактор кнопкой «Стоп».",
    ],
    [
      "Запрограммируйте находку",
      "Добавьте отдельное событие «Касание двух спрайтов». Выберите в нём героя и предмет. Под событием соедините «Изменить счёт» и «Перенести в свободную клетку». В команде переноса выберите предмет.",
      "Для работы касаниями используйте «Добавить блок». Поле сверху выбирает событие или ветку, куда попадёт команда.",
    ],
    [
      "Соберите условие победы",
      "Под переносом добавьте «Если счёт достиг цели». Укажите порог. Внутрь ветки «то» вставьте «Завершить игру» и выберите победу. Вкладка «Схема» покажет условие и обе ветки вашей игры.",
      "Хотите ограничить раунд по времени? При старте добавьте «Запустить отсчёт». К событию «Время раунда истекло» присоедините «Завершить игру».",
    ],
    [
      "Испытайте и скачайте",
      "Проверьте ход мимо предмета, первую находку и достижение цели. Обменяйтесь ролями у доски. Другой игрок должен суметь пройти игру по вашим правилам.",
      "В меню «Проект» команда «Скачать игру» создаёт игровой HTML-файл. Чтобы позже менять блоки, скачайте также проект для редактирования.",
    ],
  ];
  function lesson() {
    const body = open("Урок для класса"),
      g = element("div", "guide"),
      item = guide[guidePage];
    g.append(
      element("p", "guide-kicker", "Шаг " + (guidePage + 1) + " из " + guide.length),
      element("h3", "", item[0]),
      element("p", "", item[1]),
      element("p", "muted", item[2]),
    );
    const files = element("div", "guide-files");
    for (const [label, url] of lessonFiles) {
      const link = element("a", "", label);
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
      files.append(link);
    }
    g.append(files);
    const act = element("div", "actions"),
      prev = btn("Назад", "", () => {
        guidePage--;
        lesson();
      });
    prev.disabled = !guidePage;
    act.append(
      prev,
      btn("К конструктору", "", () => dialog.close()),
      btn("Примеры игр", "", examplesMenu),
    );
    if (guidePage < guide.length - 1)
      act.append(
        btn("Дальше", "primary", () => {
          guidePage++;
          lesson();
        }),
      );
    g.append(act);
    body.append(g);
  }
  $("open-lesson").onclick = lesson;
  restoring = true;
  try {
    blocks.load(model.workspace);
  } catch {
    model = fresh();
    blocks.load({});
    restoreNote = "Не удалось восстановить блоки проекта.";
  } finally {
    restoring = false;
  }
  selected = model.sprites[0]?.id || "";
  $("project-name").value = model.name;
  $("background").value = model.background;
  refreshSprites();
  updateProgramUI();
  if (restoreNote) toast(restoreNote);
  window.addEventListener("pagehide", persist);
})();
