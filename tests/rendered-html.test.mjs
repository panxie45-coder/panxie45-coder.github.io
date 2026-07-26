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
  assert.match(html, /版本 0\.4 · 机甲职业/);
  assert.match(html, /开始远征/);
  assert.match(html, /双人联机/);
  assert.match(html, /Q \/ 空格/);
});

test("ships independent builds, classes, elites, and generated sprites", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /ember-protocol-v4/);
  assert.match(page, /type ClassId = "assault" \| "guardian" \| "engineer" \| "phantom"/);
  assert.match(page, /t: "upgrade-done"; build: BuildFrame; hp: number/);
  assert.match(page, /个人机体强化 · 独立选择/);
  assert.match(page, /waitingForRemoteUpgrade/);
  assert.match(page, /eliteChance/);
  assert.match(page, /kind = "commander"/);
  assert.match(css, /player-mechs\.png/);

  await Promise.all([
    access(new URL("../public/game/player-mechs.png", import.meta.url)),
    access(new URL("../public/game/enemy-mechs.png", import.meta.url)),
  ]);
});
