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
  assert.match(html, /版本 0\.12\.3 · 四选构筑/);
  assert.match(html, /开始远征/);
  assert.match(html, /双人联机/);
  assert.match(html, /Q \/ 空格/);
  assert.match(html, /终极大招/);
});

test("ships eight independent classes, drones, effects, bosses, and generated sprites", async () => {
  const page = await readFile(new URL("../Game.tsx", import.meta.url), "utf8");
  const audio = await readFile(new URL("../audio.ts", import.meta.url), "utf8");
  const css = await readFile(new URL("../game.css", import.meta.url), "utf8");
  const rootEntry = await readFile(new URL("../../../app/page.tsx", import.meta.url), "utf8");

  assert.match(rootEntry, /games\/ember-protocol\/Game/);
  assert.doesNotMatch(rootEntry, /ember-protocol-v9/);
  assert.match(page, /ember-protocol-v9/);
  assert.match(page, /type ClassId = "assault" \| "guardian" \| "engineer" \| "phantom" \| "laser" \| "frost" \| "blade" \| "gravity"/);
  assert.match(page, /t: "upgrade-done"; build: BuildFrame; hp: number/);
  assert.match(page, /个人机体强化 · 独立选择/);
  assert.match(page, /waitingForRemoteUpgrade/);
  assert.match(page, /eliteChance/);
  assert.match(page, /addEvolvedEnemy\("commander", 285/);
  assert.match(page, /const ENEMY_XP/);
  assert.match(page, /projectile-mechs\.png/);
  assert.match(page, /laser-mech\.png/);
  assert.match(page, /frost-mech\.png/);
  assert.match(page, /blade-mech\.png/);
  assert.match(page, /gravity-mech\.png/);
  assert.match(page, /vanguard-drones\.png/);
  assert.match(page, /vanguard-projectiles\.png/);
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
  assert.match(page, /kind: "skill" \| "impact" \| "dash" \| "revive" \| "ultimate" \| "slash" \| "boss-phase"/);
  assert.match(page, /effect\.classId==="assault"/);
  assert.match(page, /effect\.classId==="frost"/);
  assert.match(page, /const fireLaser/);
  assert.match(page, /const freezeArea/);
  assert.match(page, /const fireBlade/);
  assert.match(page, /const bladeRush/);
  assert.match(page, /const gravityWell/);
  assert.match(page, /const dronePosition/);
  assert.match(page, /const CLASS_UPGRADES/);
  assert.match(page, /const ULTIMATE_UPGRADES/);
  assert.match(page, /type UpgradeRarity = "common" \| "rare" \| "epic" \| "legendary"/);
  assert.match(page, /const RARITY_WEIGHTS/);
  assert.match(page, /const weightedUpgradePick/);
  assert.match(page, /while \(choices\.length < 4\)/);
  assert.match(page, /const availableUltimate = ULTIMATE_UPGRADES\[classId\]\.filter\(\(upgrade\) => ultimateUpgradeAvailable\(upgrade, currentBuild\)\)/);
  assert.match(page, /终极强化按普通、稀有、史诗、传说权重出现/);
  assert.match(page, /const ultimateUpgradeAvailable/);
  assert.match(page, /ultimatePower: \.72/);
  assert.match(page, /id\.endsWith\("-ultimate-power"\)\) stats\.ultimatePower \*= 1\.2/);
  assert.match(page, /stats\.ultimateTargets = Math\.min\(14/);
  assert.match(page, /stats\.ultimateDuration = Math\.min\(5\.4/);
  assert.match(page, /stats\.ultimateLanes = Math\.min\(4/);
  assert.match(page, /stats\.ultimateEchoes = Math\.min\(4/);
  assert.match(page, /stats\.ultimateRange = Math\.min\(670/);
  assert.match(page, /assault-double-storm/);
  assert.match(page, /const SHOP_ITEMS/);
  assert.match(page, /const GUARDIAN_SHIELD_MAX = 5/);
  assert.match(page, /const MIN_GUARDIAN_COOLDOWN = 7/);
  assert.match(page, /Math\.min\(GUARDIAN_SHIELD_MAX, stats\.shieldDuration, cooldownSeconds - 2\)/);
  assert.match(page, /const MAX_UPGRADE_REROLLS = 2/);
  assert.match(page, /const MAX_SHOP_REROLLS = 3/);
  assert.match(page, /type ShopCategory = "补给" \| "武装" \| "防御" \| "核心"/);
  assert.match(page, /const shopRerollPrice = \(wave: number, used: number, wallet: number\)/);
  assert.match(page, /Math\.pow\(lateWave, 1\.68\) \* 4/);
  assert.match(page, /wallet \* \(\.07 \+ used \* \.055\)/);
  assert.match(page, /const SHOP_CATEGORIES/);
  assert.match(page, /const SHOP_RARITY_WEIGHTS/);
  assert.match(page, /common: 62, rare: 26, epic: 9, legendary: 3/);
  assert.match(page, /const weightedShopPick/);
  assert.match(page, /const SHOP_RARITY_PRICE_MULTIPLIER/);
  assert.match(page, /const rollShopItems = \(wave: number, wallet: number, recentIds: string\[\] = \[\]\)/);
  assert.match(page, /Math\.pow\(lateWave, 1\.45\) \* \.075/);
  assert.match(page, /id: "ultimate-amplifier"[\s\S]*rarity: "legendary"/);
  assert.match(page, /id: "signature-module"/);
  assert.match(page, /id: "multi-loader"/);
  assert.match(page, /player\.hp \+ 36/);
  assert.match(page, /stats\.damage \*= 1\.08/);
  assert.match(page, /stats\.interval \*= \.94/);
  assert.match(page, /stats\.magnet \*= 1\.14/);
  assert.match(page, /localUltimate\(\) \+ 22/);
  assert.match(page, /stats\.ultimatePower \*= 1\.12/);
  assert.match(page, /recentShopIds = shopStock\.map/);
  assert.match(page, /coOpActive \? 100 : 82/);
  assert.match(page, /Math\.max\(\.17, \.58 - elapsed \* \.00145\)/);
  assert.match(page, /Math\.max\(\.2, \.7 - elapsed \* \.00155\)/);
  assert.match(page, /let nextSurgeAt = 22, surgeRemaining = 0/);
  assert.match(page, /兽潮来袭/);
  assert.match(page, /const regularBatch = Math\.min/);
  assert.match(page, /Math\.pow\(elapsed \/ 540, 1\.7\)/);
  assert.match(page, /addEvolvedEnemy\("artillery", 55/);
  assert.match(page, /addEvolvedEnemy\("commander", 285/);
  assert.match(page, /const coOpScale = remote \? 1\.5 : 1;\s+const lateBossWave/);
  assert.match(page, /Math\.pow\(lateBossWave \/ 6, 1\.45\) \* \.45/);
  assert.match(page, /const upgradeRerollPrice/);
  assert.match(page, /商品价格会随波次与个人经济持续上涨/);
  assert.match(page, /高稀有度配件出现概率更低/);
  assert.match(page, /刷新次数已用尽/);
  assert.match(page, /const spawnBoss/);
  assert.match(page, /currentWave % 3 === 0/);
  assert.match(page, /bossPhase/);
  assert.match(page, /t: "boss-loot"/);
  assert.match(page, /const BOSS_RELICS/);
  assert.match(page, /t: "shop-open"/);
  assert.match(page, /wallet: \{ host: number; guest: number \}/);
  assert.match(page, /ultimate: \{ host: number; guest: number \}/);
  assert.match(page, /const executeUltimate/);
  assert.match(page, /const strikeTargets = \[\.\.\.enemies\]/);
  assert.match(page, /combatStats\.ultimateDuration \* 1000/);
  assert.match(page, /const beamCount = clamp\(Math\.round\(combatStats\.ultimateLanes\), 8, 16\)/);
  assert.match(page, /const laneCount = clamp\(Math\.round\(combatStats\.ultimateLanes\), 1, 4\)/);
  assert.match(page, /const laneWidth = 72 \+ Math\.max\(0, along\) \* \.055/);
  assert.match(page, /combatStats\.ultimateEchoes/);
  assert.match(page, /const gravityRange = clamp\(combatStats\.ultimateRange, 430, 670\)/);
  assert.match(page, /const ULTIMATE_CHARGE_SCALE/);
  assert.match(page, /laser: \.5/);
  assert.match(page, /const chargingClass = killer === "guest"/);
  assert.match(page, /baseEnergyGain \* ULTIMATE_CHARGE_SCALE\[chargingClass\]/);
  assert.match(page, /const cluster = \[\.\.\.enemies\]/);
  assert.match(page, /ULTIMATE_NAMES/);
  assert.match(page, /ultimate: "天穹火雨：/);
  assert.match(page, /ultimate: "赤曜审判：以机体为中心向四面八方发射贯穿激光"/);
  assert.match(page, /selectedClassSpec\.ultimate\.split/);
  assert.match(page, /localPaused = false;\s+elapsed = 0/);
  assert.match(page, /pausedRef\.current = false/);
  assert.match(page, /keys\.clear\(\)/);
  assert.match(page, /className="shopWallet"/);
  assert.match(page, /className="shopWallet upgradeWallet"/);
  assert.match(page, /当前个人金币/);
  assert.match(page, /rarity-\$\{u\.rarity\|\|"common"\}/);
  assert.match(page, /RARITY_LABELS\[u\.rarity\|\|"common"\]/);
  assert.match(page, /当前机体完整度/);
  assert.match(page, /player\.maxHp \* \.18/);
  assert.match(page, /const nearbyEnemies/);
  assert.match(page, /worldClock = \.06/);
  assert.match(audio, /\| "skill"/);
  assert.match(audio, /\| "ultimate"/);
  assert.match(page, /audio\?\.play\("skill"\)/);
  assert.match(page, /audio\?\.play\("ultimate"\)/);
  assert.match(page, /enemy\.slow = Math\.max/);
  assert.match(page, /frozen\?: number/);
  assert.match(page, /enemy\.frozen = Math\.max/);
  assert.match(page, /const canAct = \(enemy\.frozen \|\| 0\) <= 0/);
  assert.match(page, /else if \(canAct && ranged && enemy\.cooldown <= 0\)/);
  assert.match(page, /const iceRadius=e\.r\+10/);
  assert.match(page, /type BossVariant = "rift" \| "storm" \| "weaver" \| "forge"/);
  assert.match(page, /shieldmite: "melee"/);
  assert.match(page, /splitter: "melee"/);
  assert.match(page, /rammer: "melee"/);
  assert.match(page, /sniper: "ranged"/);
  assert.match(page, /mortarwasp: "ranged"/);
  assert.match(page, /leech: "ranged"/);
  assert.match(page, /kind: "slash",\s+enemyKind: enemy\.kind/);
  assert.match(page, /kind: "dash", enemyKind: "rammer"/);
  assert.match(page, /10 \+ currentLevel \* 4\.4 \+ Math\.pow/);
  assert.match(page, /boss-variants\.png/);
  assert.match(page, /boss-projectiles\.png/);
  assert.match(page, /enemy-reinforcements\.png/);
  assert.match(page, /enemy-reinforcement-projectiles\.png/);
  assert.doesNotMatch(page, /ctx\.arc\(player\.x/);
  assert.doesNotMatch(page, /ctx\.arc\(remote\.x/);
  assert.match(page, /player-mechs\.png/);
  assert.match(css, /background-size:200% 200%/);
  assert.match(css, /\.levelBadge small\{font:800 14px/);
  assert.match(css, /\.shopWallet/);
  assert.match(css, /\.panelVitals/);
  assert.match(css, /\.upgradeGrid button\.ultimateUpgrade/);
  assert.match(css, /\.upgradeGrid\{display:grid;grid-template-columns:repeat\(4,1fr\)/);
  assert.match(css, /@media\(min-width:821px\) and \(max-width:1050px\)\{\.upgradeGrid\{grid-template-columns:repeat\(2,1fr\)\}\}/);
  assert.match(css, /\.upgradeGrid button\.rarity-legendary/);
  assert.match(css, /\.shopGrid button\.shop-rarity-legendary/);
  assert.match(css, /\.ultimateCopy em/);
  assert.match(css, /\.bossNotice/);

  await Promise.all([
    access(new URL("../public/game/player-mechs.png", import.meta.url)),
    access(new URL("../public/game/enemy-mechs.png", import.meta.url)),
    access(new URL("../public/game/projectile-mechs.png", import.meta.url)),
    access(new URL("../public/game/laser-mech.png", import.meta.url)),
    access(new URL("../public/game/frost-mech.png", import.meta.url)),
    access(new URL("../public/game/blade-mech.png", import.meta.url)),
    access(new URL("../public/game/gravity-mech.png", import.meta.url)),
    access(new URL("../public/game/vanguard-drones.png", import.meta.url)),
    access(new URL("../public/game/vanguard-projectiles.png", import.meta.url)),
    access(new URL("../public/game/specialist-projectiles.png", import.meta.url)),
    access(new URL("../public/game/support-drones.png", import.meta.url)),
    access(new URL("../public/game/specialist-drones.png", import.meta.url)),
    access(new URL("../public/game/enemy-projectiles.png", import.meta.url)),
    access(new URL("../public/game/assassin-projectile.png", import.meta.url)),
    access(new URL("../public/game/boss-variants.png", import.meta.url)),
    access(new URL("../public/game/boss-projectiles.png", import.meta.url)),
    access(new URL("../public/game/enemy-reinforcements.png", import.meta.url)),
    access(new URL("../public/game/enemy-reinforcement-projectiles.png", import.meta.url)),
    access(new URL("../public/favicon.svg", import.meta.url)),
    access(new URL("../public/og.png", import.meta.url)),
  ]);
});
