"use strict";
(() => {
  const descriptions = [
    "Почему мы играем? Дворовые, настольные и цифровые игры. Подростки играют в прятки во дворе.",
    "Можно ли играть без победителя? Красивая передача в футболе и совместная постройка дороги в песочнице. Закончите фразу «Мне хотелось сыграть ещё раз, потому что…».",
    "Три игры про один вокзал. Развести поезда по путям, найти пропавший чемодан или спроектировать здание. Что вы будете решать в каждом случае?",
    "Какой выбор делает игрок? В гонке торможение меняет траекторию. В стратегии мост открывает путь, ферма даёт еду. В головоломке зеркало направляет луч. В приключении реплика может дать улику. Опишите любимую игру двумя глаголами.",
    "Блок-схема музыкальной игры. После нажатия клавиши вычислите отклонение от удара. Если оно меньше или равно 0,1 секунды, сыграйте аккорд. Иначе издайте короткий щелчок. Затем ждите следующего нажатия.",
    "Какой звук прозвучит? Аккорд звучит при отклонении не более 0,1 секунды. Сравните три нажатия: на 0,08 секунды раньше, на 0,14 секунды позже и на 0,10 секунды позже.",
    "Как продолжить партию завтра? Где стоят фигуры и чей сейчас ход? Такие сведения входят в состояние игры.",
    "Сработал ли рычаг? Один игрок тянет рычаг, а дверь открывается за углом у другого. Как каждому понять, что получилось?",
    "Кто делает игры? Геймдизайнер придумывает правила, программист воплощает их, художник изображает мир, саунд-дизайнер создаёт звуки, тестировщик проверяет игру. Какую задачу вы бы взяли?",
    "Какое правило придумает наш класс? Что сможет сделать игрок? Как он поймёт, что получилось? Перейдите в Пиксельную студию.",
  ];
  const get = id => document.getElementById(id);
  const stage = get("stage"), frame = get("frame"), image = get("slide");
  const back = get("back"), forward = get("forward"), number = get("number");
  const full = get("full"), studio = get("studio-link"), total = descriptions.length;
  let current = 1;
  function fromHash() {
    const n = Number(location.hash.slice(1));
    return Number.isInteger(n) && n >= 1 && n <= total ? n : 1;
  }
  function show(n) {
    current = Math.max(1, Math.min(total, n));
    image.src = "images/" + String(current).padStart(2,"0") + ".webp";
    image.alt = descriptions[current - 1];
    back.disabled = current === 1;
    forward.disabled = current === total;
    studio.hidden = current !== total;
    number.textContent = current + " / " + total;
    number.setAttribute("aria-label", "Слайд " + current + " из " + total);
  }
  function go(n) {
    show(n);
    history.replaceState(null, "", "#" + current);
  }
  function fit() {
    frame.style.width = Math.min(stage.clientWidth,stage.clientHeight * 16 / 9) + "px";
  }
  if ("ResizeObserver" in window) new ResizeObserver(fit).observe(stage);
  else window.addEventListener("resize", fit);
  fit();
  show(fromHash());
  window.addEventListener("hashchange", () => show(fromHash()));
  back.onclick = () => go(current - 1);
  forward.onclick = () => go(current + 1);
  document.addEventListener("keydown", event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === " " && event.target.closest?.("button,a")) return;
    switch (event.key) {
      case "ArrowRight": case "PageDown": case " ": go(current + 1); break;
      case "ArrowLeft": case "PageUp": go(current - 1); break;
      case "Home": go(1); break;
      case "End": go(total); break;
      default: return;
    }
    event.preventDefault();
  });
  full.hidden = !document.fullscreenEnabled;
  full.onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      full.hidden = true;
    }
  };
  document.addEventListener("fullscreenchange", () => {
    full.textContent = document.fullscreenElement ? "Свернуть" : "На весь экран";
  });
})();
