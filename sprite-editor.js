"use strict";
window.SpriteEditor = (() => {
  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt) e.textContent = txt;
    return e;
  }
  function btn(label, cls, click) {
    const b = el("button", cls, label);
    b.type = "button";
    b.onclick = click;
    return b;
  }
  function thumbnail(pixels, palette) {
    const c = el("canvas");
    c.width = c.height = 16;
    c.setAttribute("aria-hidden", "true");
    const ctx = c.getContext("2d");
    pixels.forEach((row, y) =>
      [...row].forEach((s, x) => {
        const n = parseInt(s, 16);
        if (n) {
          ctx.fillStyle = palette[n];
          ctx.fillRect(x, y, 1, 1);
        }
      }),
    );
    return c;
  }
  function gallery(open, onAdd) {
    const body = open("Добавить спрайт"),
      tabs = el("div", "group-tabs"),
      list = el("div", "gallery");
    body.append(tabs, list);
    function show(group) {
      tabs.replaceChildren();
      list.replaceChildren();
      for (const g of ["Все", "Герои", "Предметы", "Опасности"]) {
        const b = btn(g, "group-pick", () => show(g));
        b.setAttribute("aria-pressed", String(group === g));
        tabs.append(b);
      }
      tabs.append(
        btn("Нарисовать свой", "accent", () =>
          paint(open, { name: "Мой спрайт", pixels: Array(16).fill("0".repeat(16)) }, onAdd),
        ),
      );
      for (const art of PixelArt.gallery.filter((sp) => group === "Все" || sp.group === group)) {
        const card = btn("", "art-card", () => onAdd({ name: art.name, pixels: art.pixels.slice() }));
        card.append(thumbnail(art.pixels, PixelArt.palette), el("span", "", art.name));
        list.append(card);
      }
    }
    show("Все");
  }
  function paint(open, sprite, onSave) {
    const body = open("Пиксельный редактор"),
      nameRow = el("label", "dialog-row", "Имя спрайта");
    const name = el("input");
    name.type = "text";
    name.maxLength = 32;
    name.value = sprite.name;
    nameRow.append(name);
    const layout = el("div", "paint-layout"),
      canvas = el("canvas");
    canvas.id = "paint";
    canvas.width = canvas.height = 320;
    canvas.setAttribute("aria-label", "Полотно 16 на 16. Рисуйте мышью или касанием.");
    const side = el("div", "paint-side"),
      swatches = el("div", "swatches"),
      actions = el("div", "actions");
    let pixels = sprite.pixels.map((s) => s.split("")),
      selected = 6,
      last = null,
      stroke = null;
    const history = [],
      ctx = canvas.getContext("2d");
    function render() {
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const n = parseInt(pixels[y][x], 16);
          ctx.fillStyle = n ? PixelArt.palette[n] : (x + y) % 2 ? "#e7e5ed" : "#faf9fc";
          ctx.fillRect(x * 20, y * 20, 20, 20);
        }
      ctx.strokeStyle = "#58566c47";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 16; i++) {
        ctx.moveTo(i * 20 + 0.5, 0);
        ctx.lineTo(i * 20 + 0.5, 320);
        ctx.moveTo(0, i * 20 + 0.5);
        ctx.lineTo(320, i * 20 + 0.5);
      }
      ctx.stroke();
      swatches
        .querySelectorAll("button")
        .forEach((b, i) => b.setAttribute("aria-pressed", String(i === selected)));
      undo.disabled = !history.length;
    }
    function remember() {
      history.push(pixels.map((r) => r.join("")));
      if (history.length > 40) history.shift();
    }
    function draw(event) {
      const r = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(15, Math.floor(((event.clientX - r.left) * 16) / r.width)));
      const y = Math.max(0, Math.min(15, Math.floor(((event.clientY - r.top) * 16) / r.height)));
      const [px, py] = last || [x, y],
        length = Math.max(Math.abs(x - px), Math.abs(y - py), 1);
      for (let i = 0; i <= length; i++)
        pixels[Math.round(py + ((y - py) * i) / length)][Math.round(px + ((x - px) * i) / length)] =
          selected.toString(16);
      last = [x, y];
      render();
    }
    canvas.onpointerdown = (e) => {
      if (stroke !== null) return;
      e.preventDefault();
      stroke = e.pointerId;
      canvas.setPointerCapture(stroke);
      remember();
      last = null;
      draw(e);
    };
    canvas.onpointermove = (e) => {
      if (e.pointerId === stroke) draw(e);
    };
    canvas.onpointerup =
      canvas.onpointercancel =
      canvas.onlostpointercapture =
        (e) => {
          if (e.pointerId === stroke) {
            stroke = null;
            last = null;
          }
        };
    PixelArt.palette.forEach((colour, i) => {
      const b = btn("", "swatch", () => {
        selected = i;
        render();
      });
      b.style.backgroundColor = colour;
      b.title = i ? "Цвет " + colour : "Ластик";
      b.setAttribute("aria-label", b.title);
      swatches.append(b);
    });
    const undo = btn("Отменить штрих", "small", () => {
      if (history.length) {
        pixels = history.pop().map((r) => [...r]);
        render();
      }
    });
    const clear = btn("Очистить", "small", () => {
      remember();
      pixels = Array.from({ length: 16 }, () => Array(16).fill("0"));
      render();
    });
    const note = el("p", "muted", "Клетчатый образец — ластик. Размер рисунка 16 × 16.");
    const error = el("p", "muted");
    error.setAttribute("role", "status");
    const save = btn("Сохранить спрайт", "primary", () => {
      if (!name.value.trim()) {
        error.textContent = "Введите имя спрайта.";
        name.focus();
        return;
      }
      if (!pixels.some((r) => r.some((v) => v !== "0"))) {
        error.textContent = "Закрасьте хотя бы один пиксель.";
        return;
      }
      onSave({ name: name.value.trim(), pixels: pixels.map((r) => r.join("")) });
    });
    const tools = el("div", "toolbar");
    tools.append(undo, clear);
    side.append(swatches, note, tools);
    layout.append(canvas, side);
    actions.append(save, error);
    body.append(nameRow, layout, actions);
    render();
  }
  return { gallery, paint, thumbnail };
})();
