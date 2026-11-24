"use strict";
window.drawStudioFlow = (host, rule) => {
  host.replaceChildren();
  if (!rule) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "Добавьте событие во вкладке «Блоки». Здесь появится схема вашей программы.";
    host.append(p);
    return;
  }
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Блок-схема события " + rule.label);
  function element(type, props = {}, parent = svg) {
    const node = document.createElementNS(NS, type);
    for (const [key, value] of Object.entries(props)) node.setAttribute(key, value);
    parent.append(node);
    return node;
  }
  const defs = element("defs");
  const marker = element(
    "marker",
    {
      id: "flow-tip",
      viewBox: "0 0 8 8",
      refX: 7,
      refY: 4,
      markerWidth: 6,
      markerHeight: 6,
      orient: "auto",
    },
    defs,
  );
  element("path", { d: "M0 0 L8 4 L0 8 Z", fill: "#716780" }, marker);
  function wire(points, arrow = true) {
    element("polyline", {
      points: points.map((p) => p.join(",")).join(" "),
      fill: "none",
      stroke: "#716780",
      "stroke-width": 1.7,
      ...(arrow ? { "marker-end": "url(#flow-tip)" } : {}),
    });
  }
  function words(text, max = 25) {
    const lines = [""];
    for (const word of String(text).split(" ")) {
      if (lines.at(-1) && (lines.at(-1) + " " + word).length > max) lines.push("");
      const parts = word.match(new RegExp(".{1," + max + "}", "gu")) || [""];
      parts.forEach((part, i) => {
        if (i) lines.push("");
        lines[lines.length - 1] += (lines.at(-1) ? " " : "") + part;
      });
    }
    return lines;
  }
  function label(x, y, lines, size = 14) {
    const t = element("text", {
      x,
      y,
      "text-anchor": "middle",
      fill: "#282339",
      "font-size": size,
      "font-family": "Segoe UI, Arial, sans-serif",
      "font-weight": 600,
    });
    lines.forEach((l, i) => {
      const sp = element("tspan", { x, dy: i ? 16 : 0 }, t);
      sp.textContent = l;
    });
  }
  const box = 228;
  const decisionHeight = (c) => 50 + (words(c.label, 18).length - 1) * 28;
  function measure(cmds) {
    let width = box,
      height = 0;
    for (const c of cmds) {
      if (c.yes) {
        const a = measure(c.yes),
          b = measure(c.no);
        width = Math.max(width, a.width + b.width + 34);
        height += decisionHeight(c) + 26 + Math.max(a.height, b.height) + 30;
      } else height += Math.max(42, words(c.label).length * 16 + 16) + 23;
      if (c.type === "finish") break;
    }
    return { width, height };
  }
  function node(x, y, title, terminal = false) {
    const lines = words(title),
      h = Math.max(42, lines.length * 16 + 16);
    element("rect", {
      x: x - box / 2,
      y,
      width: box,
      height: h,
      rx: terminal ? h / 2 : 5,
      fill: terminal ? "#ede4ff" : "#e6f2ee",
      stroke: terminal ? "#8469b2" : "#6c9b90",
      "stroke-width": 1.4,
    });
    label(x, y + h / 2 + 5 - (lines.length - 1) * 8, lines);
    return y + h;
  }
  function sequence(cmds, x, y) {
    let alive = true;
    for (const c of cmds) {
      if (!alive) break;
      if (c.yes) {
        const a = measure(c.yes),
          b = measure(c.no),
          ax = x - (b.width + 34) / 2,
          bx = x + (a.width + 34) / 2;
        const lines = words(c.label, 18),
          h = decisionHeight(c),
          mid = y + h / 2,
          bottom = y + h,
          start = bottom + 26;
        element("polygon", {
          points: [
            [x, y],
            [x + 112, mid],
            [x, bottom],
            [x - 112, mid],
          ]
            .map((p) => p.join(","))
            .join(" "),
          fill: "#fff1cb",
          stroke: "#ac864f",
          "stroke-width": 1.5,
        });
        label(x, mid + 4 - (lines.length - 1) * 8, lines, 13);
        wire([
          [x - 112, mid],
          [ax, mid],
          [ax, start],
        ]);
        wire([
          [x + 112, mid],
          [bx, mid],
          [bx, start],
        ]);
        label(ax - 16, start - 8, ["да"], 12);
        label(bx + 18, start - 8, ["нет"], 12);
        const endA = sequence(c.yes, ax, start),
          endB = sequence(c.no, bx, start);
        const merge = start + Math.max(a.height, b.height) + 11;
        if (endA.alive)
          wire(
            [
              [ax, endA.y],
              [ax, merge],
              [x, merge],
            ],
            false,
          );
        if (endB.alive)
          wire(
            [
              [bx, endB.y],
              [bx, merge],
              [x, merge],
            ],
            false,
          );
        alive = endA.alive || endB.alive;
        y = merge + 19;
        if (alive)
          wire([
            [x, merge],
            [x, y],
          ]);
      } else {
        y = node(x, y, c.label, c.type === "finish");
        alive = c.type !== "finish";
        if (alive) {
          wire([
            [x, y],
            [x, y + 23],
          ]);
          y += 23;
        }
      }
    }
    return { y, alive };
  }
  const dim = measure(rule.body),
    w = dim.width + 50,
    x = w / 2;
  let y = node(x, 12, rule.label, true);
  wire([
    [x, y],
    [x, y + 23],
  ]);
  const end = sequence(rule.body, x, y + 23);
  y = end.alive ? node(x, end.y, "Конец события", true) : end.y;
  svg.setAttribute("width", w);
  svg.setAttribute("height", Math.max(y + 18, dim.height + 90));
  host.append(svg);
};
