"use strict";
window.StudioBlocks = (() => {
  const groups = [
    ["События", "#8a4caf"],
    ["Движение", "#2864bb"],
    ["Спрайты", "#087e76"],
    ["Счёт", "#a35421"],
    ["Логика", "#6953b6"],
  ];
  const actor = (name) => ({ type: "field_studio_actor", name });
  const num = (name, value, min, max, precision = 1) => ({
    type: "field_number",
    name,
    value,
    min,
    max,
    precision,
  });
  const choice = (name, options) => ({ type: "field_dropdown", name, options });
  const themes = [
    ["Космос", "space"],
    ["Лес", "woods"],
    ["Океан", "sea"],
    ["Закат", "dusk"],
  ];
  const specs = [
    ["evt_start", 0, "При старте игры", "при старте игры", []],
    ["evt_touch", 0, "Касание двух спрайтов", "когда %1 касается %2", [actor("A"), actor("B")]],
    [
      "evt_key",
      0,
      "Нажатие кнопки",
      "при нажатии %1",
      [
        choice("KEY", [
          ["действия", "action"],
          ["влево", "left"],
          ["вправо", "right"],
          ["вверх", "up"],
          ["вниз", "down"],
        ]),
      ],
    ],
    ["evt_every", 0, "По таймеру", "каждые %1 сек.", [num("SEC", 2, 0.1, 120, 0.1)]],
    [
      "control",
      1,
      "Управлять спрайтом",
      "управлять %1 · скорость %2",
      [actor("A"), num("SPEED", 4, 1, 20)],
    ],
    [
      "move",
      1,
      "Сдвинуть на несколько клеток",
      "сдвинуть %1 на X %2 Y %3",
      [actor("A"), num("X", 1, -12, 12), num("Y", 0, -8, 8)],
    ],
    [
      "place",
      1,
      "Задать позицию",
      "поставить %1 в X %2 Y %3",
      [actor("A"), num("X", 5, 0, 11), num("Y", 3, 0, 7)],
    ],
    [
      "chase",
      1,
      "Догонять другой спрайт",
      "%1 догоняет %2 · скорость %3",
      [actor("A"), actor("B"), num("SPEED", 2, 1, 20)],
    ],
    ["teleport", 2, "Перенести в свободную клетку", "перенести %1 в свободную клетку", [actor("A")]],
    [
      "visible",
      2,
      "Скрыть или показать",
      "%1 спрайт %2",
      [
        choice("SHOW", [
          ["скрыть", "no"],
          ["показать", "yes"],
        ]),
        actor("A"),
      ],
    ],
    ["background", 2, "Изменить фон сцены", "установить фон %1", [choice("THEME", themes)]],
    ["score_add", 3, "Изменить счёт", "изменить счёт на %1", [num("N", 1, -999, 999)]],
    ["score_set", 3, "Задать счёт", "установить счёт %1", [num("N", 0, -9999, 9999)]],
    [
      "if_score",
      4,
      "Если счёт достиг цели",
      "если счёт %1 %2",
      [
        choice("OP", [
          ["≥", "ge"],
          ["=", "eq"],
          ["<", "lt"],
        ]),
        num("N", 3, -9999, 9999),
      ],
    ],
    [
      "finish",
      4,
      "Завершить игру",
      "завершить игру %1",
      [
        choice("RESULT", [
          ["победой", "win"],
          ["поражением", "loss"],
        ]),
      ],
    ],
  ].map(([type, group, title, message, args]) => ({ type, group, title, message, args }));
  const byType = Object.fromEntries(specs.map((s) => [s.type, s]));
  function create(host, getSprites, changed) {
    const choices = () => [["выберите спрайт", "NONE"], ...getSprites().map((s) => [s.name, s.id])];
    class ActorField extends Blockly.FieldDropdown {
      constructor() {
        super(choices);
      }
      static fromJson() {
        return new ActorField();
      }
    }
    Blockly.fieldRegistry.register("field_studio_actor", ActorField);
    const defs = specs.map((s) => {
      const d = {
        type: s.type,
        message0: s.message,
        args0: s.args,
        style: "studio_group_" + s.group,
        nextStatement: null,
        inputsInline: true,
      };
      if (s.group !== 0) d.previousStatement = null;
      if (s.type === "if_score") {
        d.message1 = "то %1";
        d.args1 = [{ type: "input_statement", name: "YES" }];
        d.message2 = "иначе %1";
        d.args2 = [{ type: "input_statement", name: "NO" }];
      }
      return d;
    });
    Blockly.common.defineBlocksWithJsonArray(defs);
    const toolbox = {
      kind: "categoryToolbox",
      contents: groups.map(([name, colour], i) => ({
        kind: "category",
        name,
        colour,
        contents: specs.filter((s) => s.group === i).map((s) => ({ kind: "block", type: s.type })),
      })),
    };
    const shades = [
      ["#71418f", "#5e337c"],
      ["#23579f", "#1a4384"],
      ["#07665e", "#075a54"],
      ["#88451a", "#733810"],
      ["#594798", "#493980"],
    ];
    const blockStyles = Object.fromEntries(
      groups.map((g, i) => [
        "studio_group_" + i,
        { colourPrimary: g[1], colourSecondary: shades[i][0], colourTertiary: shades[i][1] },
      ]),
    );
    const theme = Blockly.Theme.defineTheme("studio", {
      base: Blockly.Themes.Classic,
      blockStyles,
      fontStyle: { family: "'Source Sans 3', 'Segoe UI', Arial, sans-serif", weight: "600", size: 12 },
      componentStyles: {
        workspaceBackgroundColour: "#fbfafc",
        toolboxBackgroundColour: "#f3f2f7",
        toolboxForegroundColour: "#302e3b",
        flyoutBackgroundColour: "#eeecf3",
        flyoutForegroundColour: "#242231",
        flyoutOpacity: 0.98,
        scrollbarColour: "#9c94aa",
        scrollbarOpacity: 0.65,
      },
    });
    const ws = Blockly.inject(host, {
      toolbox,
      theme,
      renderer: "zelos",
      media: "vendor/blockly/media/",
      sounds: false,
      trashcan: true,
      grid: { spacing: 22, length: 1.4, colour: "#d1ceda", snap: false },
      move: { scrollbars: true, drag: true, wheel: false },
      zoom: {
        controls: true,
        wheel: false,
        startScale: 0.96,
        maxScale: 1.7,
        minScale: 0.45,
        scaleSpeed: 1.12,
      },
    });
    let anchor = null;
    const real = (b) => b && b.workspace === ws && !b.isShadow();
    const fieldsOf = (b) => byType[b.type]?.args.filter((a) => a.type === "field_studio_actor") || [];
    function assignDefaults(b) {
      const list = getSprites();
      for (const field of fieldsOf(b)) {
        const id =
          field.name === "B"
            ? list[1]?.id
            : b.type === "teleport" || b.type === "visible"
              ? list[1]?.id || list[0]?.id
              : list[0]?.id;
        if (id && b.getFieldValue(field.name) === "NONE") b.setFieldValue(id, field.name);
      }
    }
    ws.addChangeListener((e) => {
      if (e.type === Blockly.Events.SELECTED && e.newElementId) {
        const b = ws.getBlockById(e.newElementId);
        if (real(b)) anchor = b.id;
      }
      if (e.isUiEvent || e.type === Blockly.Events.FINISHED_LOADING) return;
      if (e.type === Blockly.Events.BLOCK_CREATE && !e.recordUndo) {
        changed();
        return;
      }
      if (e.type === Blockly.Events.BLOCK_CREATE) {
        (e.ids || []).forEach((id) => {
          const b = ws.getBlockById(id);
          if (real(b)) assignDefaults(b);
        });
      }
      changed();
    });
    function refreshActors() {
      const ids = new Set(getSprites().map((s) => s.id));
      Blockly.Events.disable();
      try {
        for (const b of ws.getAllBlocks(false)) {
          for (const { name } of fieldsOf(b)) {
            const field = b.getField(name),
              old = field.getValue();
            field.setOptions(choices);
            field.setValue(ids.has(old) ? old : "NONE");
          }
        }
        ws.refreshToolboxSelection();
      } finally {
        Blockly.Events.enable();
      }
    }
    function label(b) {
      const s = byType[b.type];
      if (!s) return "";
      return s.message.replace(/%(\d+)/g, (_, n) => {
        const f = s.args[Number(n) - 1],
          value = b.getField(f.name)?.getText() || "…";
        return f.type === "field_studio_actor" ? "«" + value + "»" : value;
      });
    }
    function command(b) {
      const s = byType[b.type];
      const c = {
        type: b.type,
        label: label(b),
        fields: Object.fromEntries(s.args.map((f) => [f.name, b.getFieldValue(f.name)])),
      };
      if (b.type === "if_score") {
        c.yes = chain(b.getInputTargetBlock("YES"));
        c.no = chain(b.getInputTargetBlock("NO"));
      }
      return c;
    }
    function chain(first) {
      const result = [];
      for (let b = first; b; b = b.getNextBlock()) if (byType[b.type]) result.push(command(b));
      return result;
    }
    function compile() {
      return ws
        .getTopBlocks(true)
        .filter((b) => byType[b.type]?.group === 0)
        .map((b) => ({ ...command(b), body: chain(b.getNextBlock()) }));
    }
    function targets() {
      const list = [];
      for (const b of ws.getAllBlocks(true)) {
        if (byType[b.type]?.group === 0) list.push({ value: b.id + "|next", label: label(b) });
        if (b.type === "if_score") {
          list.push({ value: b.id + "|YES", label: label(b) + " — то" });
          list.push({ value: b.id + "|NO", label: label(b) + " — иначе" });
        }
      }
      return list;
    }
    function currentTarget() {
      let b = ws.getBlockById(anchor || "");
      if (!b) return "";
      if (b.type === "if_score") return b.id + "|YES";
      while (b.getParent()) {
        const parent = b.getParent();
        if (parent.type === "if_score") {
          for (const side of ["YES", "NO"])
            if (parent.getInputTargetBlock(side) === b) return parent.id + "|" + side;
        }
        b = parent;
      }
      return b.id + "|next";
    }
    function add(type, target) {
      if (!byType[type]) return;
      Blockly.Events.setGroup(true);
      try {
        const b = ws.newBlock(type);
        assignDefaults(b);
        b.initSvg();
        b.render();
        const sep = (target || "").lastIndexOf("|"),
          id = sep < 0 ? "" : target.slice(0, sep),
          slot = sep < 0 ? "" : target.slice(sep + 1);
        const parent = id && ws.getBlockById(id);
        let conn =
          parent && (slot === "next" ? parent.nextConnection : parent.getInput(slot)?.connection);
        if (b.previousConnection && conn) {
          while (conn?.isConnected()) conn = conn.targetBlock().nextConnection;
          if (conn) conn.connect(b.previousConnection);
        }
        if (!b.getParent()) {
          const others = ws.getTopBlocks(true).filter((t) => t !== b);
          const bottom = others.reduce(
            (v, t) => Math.max(v, t.getRelativeToSurfaceXY().y + t.getHeightWidth().height + 32),
            28,
          );
          b.moveBy(32, bottom);
        }
        anchor = b.id;
        b.select();
        ws.centerOnBlock(b.id);
        changed();
        return b;
      } finally {
        Blockly.Events.setGroup(false);
      }
    }
    function load(state) {
      Blockly.Events.disable();
      try {
        ws.clear();
        Blockly.serialization.workspaces.load(state || {}, ws);
        anchor = null;
        ws.clearUndo();
      } finally {
        Blockly.Events.enable();
      }
      ws.scrollCenter();
    }
    return {
      ws,
      add,
      targets,
      currentTarget,
      compile,
      refreshActors,
      load,
      save: () => Blockly.serialization.workspaces.save(ws),
      count: () => ws.getAllBlocks(false).length,
    };
  }
  return { create, specs, groups, themes, byType };
})();
