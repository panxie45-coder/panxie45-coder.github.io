import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../../../dist/server/index.js", import.meta.url);
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
  assert.match(html, /版本 0\.9\.1 · 远征修复/);
  assert.match(html, /开始远征/);
  assert.match(html, /双人联机/);
  assert.match(html, /Q \/ 空格/);
  assert.match(html, /终极大招/);
});

test("ships six independent classes, drones, effects, and generated sprites", async () => {
  const page = await readFile(new URL("../Game.tsx", import.meta.url), "utf8");
  const audio = await readFile(new URL("../audio.ts", import.meta.url), "utf8");
  const css = await readFile(new URL("../game.css", import.meta.url), "utf8");
  const rootEntry = await readFile(new URL("../../../app/page.tsx", import.meta.url), "utf8");

  assert.match(rootEntry, /games\/ember-protocol\/Game/);
  assert.doesNotMatch(rootEntry, /ember-protocol-v9/);
  assert.match(page, /ember-protocol-v9/);
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
  assert.match(page, /homing\?: number/);
  assert.match(page, /shot\.homing = Math\.max\(0/);
  assert.match(page, /homing: enemy\.kind === "commander" \? \.75/);
  assert.match(page, /Math\.min\(\.55, elapsed \/ 900\)/);
  assert.match(page, /const REVIVE_SECONDS = 2/);
  assert.match(page, /const REVIVE_RANGE = 88/);
  assert.match(page, /hostReviveProgress = Math\.min\(REVIVE_SECONDS, hostReviveProgress \+ dt\)/);
  assert.match(page, /const teamDefeated = player\.hp <= 0 &&/);
  assert.match(page, /drawDowned/);
  assert.match(page, /正在观战/);
  assert.match(page, /队友机体/);
  assert.match(page, /entry\.distance < entry\.magnet/);
  assert.match(page, /kind: "skill" \| "impact" \| "dash" \| "revive" \| "ultimate"/);
  assert.match(page, /effect\.classId==="assault"/);
  assert.match(page, /effect\.classId==="frost"/);
  assert.match(page, /const fireLaser/);
  assert.match(page, /const freezeArea/);
  assert.match(page, /const dronePosition/);
  assert.match(page, /const CLASS_UPGRADES/);
  assert.match(page, /assault-double-storm/);
  assert.match(page, /const SHOP_ITEMS/);
  assert.match(page, /t: "shop-open"/);
  assert.match(page, /wallet: \{ host: number; guest: number \}/);
  assert.match(page, /ultimate: \{ host: number; guest: number \}/);
  assert.match(page, /const executeUltimate/);
  assert.match(page, /ULTIMATE_NAMES/);
  assert.match(page, /ultimate: "天穹火雨：/);
  assert.match(page, /selectedClassSpec\.ultimate\.split/);
  assert.match(page, /localPaused = false;\s+elapsed = 0/);
  assert.match(page, /pausedRef\.current = false/);
  assert.match(page, /keys\.clear\(\)/);
  assert.match(page, /className="shopWallet"/);
  assert.match(page, /当前机体完整度/);
  assert.match(page, /player\.maxHp \* \.18/);
  assert.match(page, /const nearbyEnemies/);
  assert.match(page, /worldClock = \.06/);
  assert.match(audio, /\| "skill"/);
  assert.match(audio, /\| "ultimate"/);
  assert.match(page, /audio\?\.play\("skill"\)/);
  assert.match(page, /audio\?\.play\("ultimate"\)/);
  assert.match(page, /enemy\.slow = Math\.max/);
  assert.doesNotMatch(page, /ctx\.arc\(player\.x/);
  assert.doesNotMatch(page, /ctx\.arc\(remote\.x/);
  assert.match(page, /player-mechs\.png/);
  assert.match(css, /background-size:200% 200%/);
  assert.match(css, /\.levelBadge small\{font:800 14px/);
  assert.match(css, /\.shopWallet/);
  assert.match(css, /\.panelVitals/);
  assert.match(css, /\.ultimateCopy em/);

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
    access(new URL("../public/favicon.svg", import.meta.url)),
    access(new URL("../public/og.png", import.meta.url)),
  ]);
});
