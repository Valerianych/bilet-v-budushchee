"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "engine.js"), "utf8");
const command = (type, fields = {}) => ({ type, fields });
const event = (type, fields, ...body) => ({ type, fields, body });
const add = (n) => command("score_add", { N: n });
const keyEvent = (key, ...body) => event("evt_key", { KEY: key }, ...body);
const start = (...body) => event("evt_start", {}, ...body);
const pixels = Array(16).fill("1".repeat(16));
const sprite = (id, x, y) => ({ id, x, y, pixels });
const at = (x, y) => command("place", { A: "a", X: x, Y: y });

// Run the same engine shipped inside a downloaded game, with a controllable frame clock.
function simulate(rules, sprites = [sprite("a", 1, 1)]) {
  let now = 0, nextId = 0, latest;
  const scheduled = new Map();
  const positions = [];
  const context = {
    fillRect(x, y, width, height) {
      if (width === 192 && height === 128) positions.length = 0;
    },
    drawImage(image, x, y) { positions.push([x / 16, y / 16]); },
  };
  const canvas = { getContext: () => context };
  const engine = vm.runInNewContext(source + "\ncreatePixelEngine()", {
    performance: { now: () => now },
    requestAnimationFrame: (fn) => { scheduled.set(++nextId, fn); return nextId; },
    cancelAnimationFrame: (id) => scheduled.delete(id),
    document: { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) },
  });
  const game = engine.play({ sprites, background: "space" }, rules, ["", "#ffffff"], canvas,
    (value) => { latest = value; });
  function frame(ms) {
    now += ms;
    const pending = [...scheduled.values()];
    scheduled.clear();
    for (const callback of pending) callback(now);
  }
  return {
    game, positions, frame, get state() { return latest; },
    elapseWithoutFrame(ms) { now += ms; },
    tick(ms) { while (ms > 0) { const dt = Math.min(10, ms); frame(dt); ms -= dt; } },
    press(key) { game.key(key, true); game.key(key, false); },
  };
}

test("press and release fire once per transition and conditions see current input", () => {
  const check = { ...command("if_key", { KEY: "action" }), yes: [add(1)], no: [add(10)] };
  const s = simulate([keyEvent("action", check), event("evt_key_up", { KEY: "action" }, check)]);
  s.game.key("action", false);
  s.game.key("action", true);
  s.game.key("action", true);
  assert.equal(s.state.score, 1);
  s.game.key("action", false);
  s.game.key("action", false);
  assert.equal(s.state.score, 11);
  assert.equal(s.state.lives, null);
  assert.equal(s.state.seconds, null);
});

test("tapping picks the top visible sprite including fractional positions", () => {
  const s = simulate([
    event("evt_tap", { A: "a" }, add(1)),
    event("evt_tap", { A: "b" }, add(10), command("visible", { A: "b", SHOW: "no" })),
    start(command("velocity", { A: "a", VX: 2, VY: 0 })),
  ], [sprite("a", 1, 1), sprite("b", 1, 1)]);
  s.game.point(1, 1);
  assert.equal(s.state.score, 10);
  s.tick(200);
  s.game.point(2, 1, 2.25, 1.5);
  s.game.point(1, 1, 1.1, 1.5);
  assert.equal(s.state.score, 11);
});

test("each new side fires once, including corner bounces and returning to a side", () => {
  const s = simulate([
    start(command("velocity", { A: "a", VX: 4, VY: 4 })),
    event("evt_edge", { A: "a", SIDE: "any" }, command("bounce", { A: "a" }), add(1)),
    event("evt_edge", { A: "a", SIDE: "right" }, add(10)),
  ], [sprite("a", 10, 6)]);
  s.tick(400);
  assert.equal(s.state.score, 11);
  assert.ok(s.positions[0][0] < 11 && s.positions[0][1] < 7);
  s.tick(3100);
  assert.ok(s.state.score >= 13);
  const sliding = simulate([
    event("evt_edge", { A: "a", SIDE: "any" }, add(1)),
    keyEvent("action", at(11, 0)),
  ], [sprite("a", 4, 0)]);
  sliding.tick(100);
  assert.equal(sliding.state.score, 1);
  sliding.press("action");
  sliding.tick(150);
  assert.equal(sliding.state.score, 2);
});

test("cell events rearm on exit; collision and separation are sampled once per contact", () => {
  const pair = { A: "a", B: "b" };
  const condition = { ...command("if_touch", pair), yes: [add(2)], no: [add(20)] };
  const s = simulate([
    event("evt_touch", pair, condition),
    event("evt_separate", pair, condition),
    event("evt_cell", { A: "a", X: 4, Y: 2 }, add(1)),
    keyEvent("right", at(4, 2)), keyEvent("left", at(1, 1)),
  ], [sprite("a", 1, 1), sprite("b", 4, 2)]);
  assert.equal(s.state.score, 0);
  s.press("right"); s.tick(50);
  assert.equal(s.state.score, 3);
  s.tick(250);
  assert.equal(s.state.score, 3);
  s.press("left"); s.tick(100);
  assert.equal(s.state.score, 23);
  s.press("right"); s.tick(100);
  assert.equal(s.state.score, 26);
});

test("all collision handlers see the initial contact even if one hides the sprite", () => {
  const pair = { A: "a", B: "b" };
  const s = simulate([
    event("evt_touch", pair, command("visible", { A: "b", SHOW: "no" })),
    event("evt_touch", pair, add(1)),
    event("evt_separate", pair, add(10)),
  ], [sprite("a", 2, 1), sprite("b", 2, 1)]);
  s.tick(100);
  assert.equal(s.state.score, 11);
});

test("repeating intervals and one-shot delays use elapsed time", () => {
  const s = simulate([event("evt_every", { SEC: 1 }, add(1)), event("evt_after", { SEC: 2 }, add(10))]);
  s.frame(999); assert.equal(s.state.score, 0);
  s.frame(1); assert.equal(s.state.score, 1);
  s.frame(1000); assert.equal(s.state.score, 12);
  s.frame(1000); assert.equal(s.state.score, 13);
});

test("a countdown accepts bonuses, expires once, and can start a second round", () => {
  const s = simulate([
    start(command("timer_start", { SEC: 2 })),
    keyEvent("up", command("timer_add", { SEC: 1 })),
    keyEvent("down", command("timer_add", { SEC: -10 })),
    keyEvent("action", command("timer_start", { SEC: 1 })),
    event("evt_timer_end", {}, add(1)),
  ]);
  assert.equal(s.state.seconds, 2);
  s.frame(1000); s.press("up");
  assert.equal(s.state.seconds, 2);
  s.frame(1999); assert.equal(s.state.score, 0);
  s.frame(1); s.frame(1000);
  assert.equal(s.state.score, 1); assert.equal(s.state.seconds, 0);
  s.press("action"); s.press("down"); s.press("down");
  assert.equal(s.state.score, 2);
});

test("score thresholds catch overshoots and rearm below the goal; signals follow a chain", () => {
  const s = simulate([
    keyEvent("up", add(4)), keyEvent("down", command("score_set", { N: 0 })),
    event("evt_score", { N: 3 }, command("signal_send", { NAME: "  Уровень  " })),
    event("evt_signal", { NAME: "уровень" }, command("life_add", { N: 1 })),
  ]);
  s.press("up"); s.press("up");
  assert.equal(s.state.score, 8); assert.equal(s.state.lives, 4);
  s.press("down"); s.press("up"); assert.equal(s.state.lives, 5);
});

test("a tap after the deadline cannot win between frames", () => {
  const s = simulate([start(command("timer_start", { SEC: 1 })),
    event("evt_timer_end", {}, command("finish", { RESULT: "loss" })),
    event("evt_tap", { A: "a" }, add(1), command("finish", { RESULT: "win" })),
  ]);
  s.elapseWithoutFrame(1001);
  s.game.point(1, 1);
  assert.equal(s.state.result, "loss");
  assert.equal(s.state.score, 0);
});

test("only losing the last life triggers the event, and an empty reserve can be replenished", () => {
  const cond = { ...command("if_lives", { OP: "eq", N: 0 }), yes: [add(1)], no: [add(10)] };
  const s = simulate([
    start(command("life_set", { N: 1 })), keyEvent("down", command("life_add", { N: -2 })),
    keyEvent("up", command("life_set", { N: 3 })), event("evt_no_lives", {}, cond),
  ]);
  s.press("down"); s.press("down"); assert.equal(s.state.score, 1); assert.equal(s.state.lives, 0);
  s.press("up"); s.press("down"); assert.equal(s.state.lives, 1);
  s.press("down"); assert.equal(s.state.score, 2);
});

test("a signal loop stops the game, and disposed games ignore input and frames", () => {
  const name = { NAME: "круг" };
  const loop = simulate([start(command("signal_send", name)), event("evt_signal", name, command("signal_send", name))]);
  assert.equal(loop.state.result, "error");
  assert.ok(loop.state.message.length);
  const s = simulate([keyEvent("up", add(1)), event("evt_after", { SEC: 1 }, add(1))]);
  s.game.dispose(); s.press("up"); s.frame(1100); assert.equal(s.state.score, 0);
});
