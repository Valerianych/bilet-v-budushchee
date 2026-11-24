"use strict";
(() => {
  function sprite(artId, id, name, x, y) {
    const art = window.PixelArt.gallery.find((item) => item.id === artId);
    if (!art) throw new Error("В галерее отсутствует рисунок " + artId);
    return { id, name, pixels: art.pixels.slice(), x, y };
  }

  function block(id, type, fields = {}) {
    return { id, type, fields };
  }

  // Blockly stores each script as a positioned event followed by its commands.
  function script(x, y, event, ...commands) {
    event.x = x;
    event.y = y;
    let previous = event;
    for (const command of commands) {
      previous.next = { block: command };
      previous = command;
    }
    return event;
  }

  function project(name, background, sprites, scripts) {
    return {
      format: "bilet-pixel-studio",
      version: 1,
      name,
      background,
      sprites,
      workspace: { blocks: { languageVersion: 0, blocks: scripts } },
    };
  }

  function makeRicochet() {
    const hero = sprite("ship", "ship", "Корабль", 2, 5);
    const ball = sprite("meteor", "ball", "Огненный шар", 8, 1);
    return project("Рикошет", "dusk", [hero, ball], [
      script(32, 36,
        block("rc-start", "evt_start"),
        block("rc-lives", "life_set", { N: 3 }),
        block("rc-control", "control", { A: hero.id, SPEED: 4 }),
        block("rc-velocity", "velocity", { A: ball.id, VX: 4, VY: 3 }),
        block("rc-clock", "timer_start", { SEC: 20 }),
      ),
      script(438, 36,
        block("rc-edge", "evt_edge", { A: ball.id, SIDE: "any" }),
        block("rc-bounce", "bounce", { A: ball.id }),
      ),
      script(32, 360,
        block("rc-collision", "evt_touch", { A: hero.id, B: ball.id }),
        block("rc-hit", "life_add", { N: -1 }),
        block("rc-reset-ball", "teleport", { A: ball.id }),
      ),
      script(438, 360,
        block("rc-no-lives", "evt_no_lives"),
        block("rc-defeat", "finish", { RESULT: "loss" }),
      ),
      script(438, 520,
        block("rc-timeout", "evt_timer_end"),
        block("rc-victory", "finish", { RESULT: "win" }),
      ),
    ]);
  }

  function makeStarCatcher() {
    const star = sprite("star", "star", "Звезда", 5, 3);
    const signal = "пять звёзд";
    return project("Звездолов", "space", [star], [
      script(32, 36,
        block("sc-start", "evt_start"),
        block("sc-clock", "timer_start", { SEC: 15 }),
      ),
      script(438, 36,
        block("sc-tap", "evt_tap", { A: star.id }),
        block("sc-point", "score_add", { N: 1 }),
        block("sc-move-star", "teleport", { A: star.id }),
      ),
      script(32, 330,
        block("sc-goal", "evt_score", { N: 5 }),
        block("sc-notify", "signal_send", { NAME: signal }),
      ),
      script(438, 330,
        block("sc-notified", "evt_signal", { NAME: signal }),
        block("sc-victory", "finish", { RESULT: "win" }),
      ),
      script(32, 574,
        block("sc-timeout", "evt_timer_end"),
        block("sc-defeat", "finish", { RESULT: "loss" }),
      ),
    ]);
  }

  window.StudioExamples = [
    {
      id: "ricochet",
      title: "Рикошет",
      description: "Веди корабль стрелками или касанием поля и уклоняйся от огненного шара 20 секунд. Каждое столкновение отнимает одну из трёх жизней.",
      events: "Край сцены, столкновение, жизни и таймер",
      make: makeRicochet,
    },
    {
      id: "star-catcher",
      title: "Звездолов",
      description: "Успей пять раз поймать звезду за 15 секунд касанием или щелчком мыши. После каждого попадания она появляется в другой клетке.",
      events: "Касание, порог счёта, сигнал и таймер",
      make: makeStarCatcher,
    },
  ];
})();
