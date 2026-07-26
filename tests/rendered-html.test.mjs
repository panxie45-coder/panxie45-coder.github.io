import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Ember Protocol game menu", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>余烬协议｜双人肉鸽生存游戏<\/title>/i);
  assert.match(html, /版本 0\.7 · 远程火力/);
  assert.match(html, /开始远征/);
  assert.match(html, /双人联机/);
  assert.match(html, /Q \/ 空格/);
});

test("ships six independent classes, drones, effects, and generated sprites", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /ember-protocol-v7/);
  assert.match(page, /type ClassId = "assault" \| "guardian" \| "engineer" \| "phantom" \| "laser" \| "frost"/);
  assert.match(page, /t: "upgrade-done"; build: BuildFrame; hp: number/);
  assert.match(page, /个人机体强化 · 独立选择/);
  assert.match(page, /waitingForRemoteUpgrade/);
  assert.match(page, /eliteChance/);
  assert.match(page, /kind = "commander"/);
  assert.match(page, /const ENEMY_XP/);
  assert.match(page, /projectile-mechs\.png/);
  assert.match(page, /laser-mech\.png/);
  assert.match(page, /frost-mech\.png/);
  assert.match(page, /specialist-drones\.png/);
  assert.match(page, /enemy-projectiles\.png/);
  assert.match(page, /assassin-projectile\.png/);
  assert.match(page, /runner: "melee"/);
  assert.match(page, /crawler: "melee"/);
  assert.match(page, /brute: "melee"/);
  assert.match(page, /artillery: "ranged"/);
  assert.match(page, /assassin: "ranged"/);
  assert.match(page, /commander: "ranged"/);
  assert.match(page, /const moveDirection = !ranged/);
  assert.match(page, /const fireLaser/);
  assert.match(page, /const freezeArea/);
  assert.match(page, /const dronePosition/);
  assert.match(page, /enemy\.slow = Math\.max/);
  assert.doesNotMatch(page, /ctx\.arc\(player\.x/);
  assert.doesNotMatch(page, /ctx\.arc\(remote\.x/);
  assert.match(css, /player-mechs\.png/);

  await Promise.all([
    access(new URL("../public/game/player-mechs.png", import.meta.url)),
    access(new URL("../public/game/enemy-mechs.png", import.meta.url)),
    access(new URL("../public/game/projectile-mechs.png", import.meta.url)),
    access(new URL("../public/game/laser-mech.png", import.meta.url)),
    access(new URL("../public/game/frost-mech.png", import.meta.url)),
    access(new URL("../public/game/specialist-projectiles.png", import.meta.url)),
    access(new URL("../public/game/support-drones.png", import.meta.url)),
    access(new URL("../public/game/specialist-drones.png", import.meta.url)),
    access(new URL("../public/game/enemy-projectiles.png", import.meta.url)),
    access(new URL("../public/game/assassin-projectile.png", import.meta.url)),
  ]);
});
