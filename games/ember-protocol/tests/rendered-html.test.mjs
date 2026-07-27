import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import {
  reconcilePausedPeerHp,
  teamRunDefeated,
} from "../team-state.mjs";
import {
  earlyWaveXpMultiplier,
  prioritizeUltimateTargets,
} from "../combat-balance.mjs";

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
  assert.match(html, /版本 0\.14\.0 · 双技能机甲重装/);
  assert.match(html, /开始远征/);
  assert.match(html, /双人联机/);
  assert.match(html, /Q \/ 空格/);
  assert.match(html, /<kbd>E<\/kbd> 副技能/);
  assert.match(html, /终极大招/);
});

test("ships eleven independent classes, drones, effects, bosses, and generated sprites", async () => {
  const page = await readFile(new URL("../Game.tsx", import.meta.url), "utf8");
  const audio = await readFile(new URL("../audio.ts", import.meta.url), "utf8");
  const css = await readFile(new URL("../game.css", import.meta.url), "utf8");
  const rootEntry = await readFile(new URL("../../../app/page.tsx", import.meta.url), "utf8");

  assert.match(rootEntry, /games\/ember-protocol\/Game/);
  assert.doesNotMatch(rootEntry, /ember-protocol-v9/);
  assert.match(page, /ember-protocol-v9/);
  assert.match(page, /type ClassId = "assault" \| "guardian" \| "engineer" \| "phantom" \| "laser" \| "frost" \| "blade" \| "gravity" \| "thunder" \| "sky" \| "cinder"/);
  assert.match(page, /t: "upgrade-done"; build: BuildFrame; hp: number/);
  assert.match(page, /t: "upgrade-resume"/);
  assert.match(page, /t: "skill2"; classId: ClassId/);
  assert.match(page, /t: "gameover"; hostHp: number; guestHp: number \| null/);
  assert.match(page, /const remoteWasAlive = remote\.hp > 0/);
  assert.match(page, /reconcilePausedPeerHp\(remoteWasAlive, data\.hp, data\.build\.maxHp\)/);
  assert.match(page, /localUpgradeStartedAlive = player\.hp > 0/);
  assert.match(page, /if \(data\.t === "upgrade-resume" && !isAuthority\)/);
  assert.match(page, /coOpRunEstablished = true/);
  assert.doesNotMatch(page, /remoteSeen/);
  assert.match(page, /teamRunDefeated\(player\.hp, guestHp, coOpRunEstablished\)/);
  assert.match(page, /t: "gameover", hostHp: player\.hp, guestHp/);
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
  assert.match(page, /const teamDefeated = teamRunDefeated\(player\.hp, guestHp, coOpRunEstablished\)/);
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
  assert.match(page, /const thunderChain/);
  assert.match(page, /const railSnipe/);
  assert.match(page, /const incinerateCone/);
  assert.match(page, /const executeSecondarySkill/);
  assert.match(page, /爆破标枪/);
  assert.match(page, /震荡壁垒/);
  assert.match(page, /追猎蜂群/);
  assert.match(page, /相位回刃/);
  assert.match(page, /棱镜十字/);
  assert.match(page, /冰狱长枪/);
  assert.match(page, /旋刃圆舞/);
  assert.match(page, /斥力反转/);
  assert.match(page, /电磁脉冲/);
  assert.match(page, /猎杀标记/);
  assert.match(page, /熔火地雷/);
  assert.match(page, /if \(e\.key\.toLowerCase\(\) === "e"\)/);
  assert.match(page, /className="skillDock secondarySkillDock"/);
  assert.match(page, /variant\?: "secondary"/);
  assert.match(page, /skill2\?: boolean/);
  assert.match(page, /const bladeGradient=/);
  assert.match(page, /const dronePosition/);
  assert.match(page, /const CLASS_UPGRADES/);
  assert.match(page, /const ULTIMATE_UPGRADES/);
  assert.match(page, /type UpgradeRarity = "common" \| "rare" \| "epic" \| "legendary"/);
  assert.match(page, /const RARITY_WEIGHTS/);
  assert.match(page, /const weightedUpgradePick/);
  assert.match(page, /while \(choices\.length < 4\)/);
  assert.match(page, /const availableUltimate = ULTIMATE_UPGRADES\[classId\]\.filter\(\(upgrade\) => ultimateUpgradeAvailable\(upgrade, currentBuild\)\)/);
  assert.doesNotMatch(page, /const signature = weightedUpgradePick\(CLASS_UPGRADES\[classId\], excluded\)/);
  assert.doesNotMatch(page, /每次至少包含一项本职业强化/);
  assert.match(page, /不再提供本职业保底/);
  assert.match(page, /本职业 · \$\{RARITY_LABELS/);
  assert.match(page, /通用、本职业与终极强化全部按普通、稀有、史诗、传说权重随机出现/);
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
  assert.match(page, /const SHOP_EVERY_WAVES = 2/);
  assert.match(page, /Math\.sqrt\(Math\.max\(0, kills\)\) \* 3\.2/);
  assert.match(page, /const shouldOpenSupply = \(currentWave - 1\) % SHOP_EVERY_WAVES === 0/);
  assert.match(page, /const GUARDIAN_SHIELD_MAX = 5/);
  assert.match(page, /const MIN_GUARDIAN_COOLDOWN = 7/);
  assert.match(page, /Math\.min\(GUARDIAN_SHIELD_MAX, stats\.shieldDuration, cooldownSeconds - 2\)/);
  assert.match(page, /const MAX_UPGRADE_REROLLS = 2/);
  assert.match(page, /const MAX_SHOP_REROLLS = 3/);
  assert.match(page, /type ShopCategory = "补给" \| "武装" \| "防御" \| "核心"/);
  assert.match(page, /const shopRerollPrice = \(wave: number, used: number, wallet: number\)/);
  assert.match(page, /Math\.pow\(lateWave, 1\.62\) \* 3\.1/);
  assert.match(page, /wallet \* \(\.05 \+ used \* \.04\)/);
  assert.match(page, /const SHOP_CATEGORIES/);
  assert.match(page, /const SHOP_RARITY_WEIGHTS/);
  assert.match(page, /common: 62, rare: 26, epic: 9, legendary: 3/);
  assert.match(page, /const weightedShopPick/);
  assert.match(page, /const SHOP_RARITY_PRICE_MULTIPLIER/);
  assert.match(page, /const rollShopItems = \(wave: number, wallet: number, recentIds: string\[\] = \[\]\)/);
  assert.match(page, /Math\.pow\(lateWave, 1\.45\) \* \.06/);
  assert.match(page, /!shuffledChoices\.some\(\(item\) => item\.cost <= wallet\)/);
  assert.match(page, /affordableCost = Math\.max\(5, Math\.floor\(wallet \/ 5\) \* 5\)/);
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
  assert.match(page, /Math\.pow\(lateBossWave \/ 6, 1\.45\) \* \.5/);
  assert.match(page, /boss: \{ hp: 3400/);
  assert.match(page, /const bossResilience = enemy\.kind !== "boss"/);
  assert.match(page, /const upgradeRerollPrice/);
  assert.match(page, /价格和刷新费已适度降低/);
  assert.match(page, /保证每次至少有一件当前金币买得起/);
  assert.match(page, /刷新次数已用尽/);
  assert.match(page, /const spawnBoss/);
  assert.match(page, /let bossBag: BossVariant\[\] = \[\]/);
  assert.match(page, /bossBag = shuffled<BossVariant>/);
  assert.match(page, /const bossVariant = bossBag\.pop\(\) \|\| "rift"/);
  assert.match(page, /previousBossVariant = bossVariant/);
  assert.match(page, /currentWave % 3 === 0/);
  assert.match(page, /bossPhase/);
  assert.match(page, /t: "boss-loot"/);
  assert.match(page, /const BOSS_RELICS/);
  assert.match(page, /t: "shop-open"/);
  assert.match(page, /wallet: \{ host: number; guest: number \}/);
  assert.match(page, /ultimate: \{ host: number; guest: number \}/);
  assert.match(page, /const executeUltimate/);
  assert.match(page, /const strikeTargets = prioritizeUltimateTargets\(enemies, actor, combatStats\.ultimateTargets\)/);
  assert.match(page, /const aimTarget = prioritizeUltimateTargets\(enemies, actor, 1\)\[0\]/);
  assert.match(page, /const ultimateReach = Math\.hypot\(W, H\) \+ 160/);
  assert.match(page, /const bossTarget = cluster\.find\(\(enemy\) => enemy\.kind === "boss"\)/);
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
  assert.match(page, /const cluster = prioritizeUltimateTargets\(enemies, actor, 16\)/);
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
  assert.match(page, /const canAct = \(enemy\.frozen \|\| 0\) <= 0 && \(enemy\.stunned \|\| 0\) <= 0/);
  assert.match(page, /else if \(canAct && ranged && enemy\.cooldown <= 0\)/);
  assert.match(page, /const iceRadius=e\.r\+10/);
  assert.match(page, /type BossVariant = "rift" \| "storm" \| "weaver" \| "forge" \| "leviathan" \| "mirror" \| "warden"/);
  assert.match(page, /shieldmite: "melee"/);
  assert.match(page, /splitter: "melee"/);
  assert.match(page, /rammer: "melee"/);
  assert.match(page, /sniper: "ranged"/);
  assert.match(page, /mortarwasp: "ranged"/);
  assert.match(page, /leech: "ranged"/);
  assert.match(page, /kind: "slash",\s+enemyKind: enemy\.kind/);
  assert.match(page, /kind: "dash", enemyKind: "rammer"/);
  assert.match(page, /28 \+ currentLevel \* 8\.5 \+ Math\.pow/);
  assert.match(page, /const xpGainScale = \(\) => clamp/);
  assert.match(page, /currentLevel - 1\) \* \.035/);
  assert.match(page, /currentWave - 1\) \* \.04/);
  assert.match(page, /const earnedXp = gem\.value \* xpGainScale\(\) \* earlyWaveXpMultiplier\(currentWave\)/);
  assert.match(page, /const W = 1600, H = 900/);
  assert.match(page, /type Gem = \{ x: number; y: number; value: number; life: number; relic\?: BossRelicId; heal\?: number \}/);
  assert.match(page, /const HEALTH_PACK_ENEMY_KINDS/);
  assert.match(page, /life: bossRelic \? 35 : 18/);
  assert.match(page, /gems\.push\(\{ x: enemy\.x \+ 18, y: enemy\.y - 12, value: 0, life: 14, heal \}\)/);
  assert.match(page, /gem\.life -= dt/);
  assert.match(page, /gem\.life > 0 && \(gem\.value > 0 \|\| Boolean\(gem\.heal\)\)/);
  assert.match(page, /维修包 \$\{Math\.ceil\(g\.life\)\}s/);
  assert.match(page, /entry\.actor\.hp < entry\.actor\.maxHp/);
  assert.match(page, /战地维修包/);
  assert.match(page, /boss-variants\.png/);
  assert.match(page, /boss-projectiles\.png/);
  assert.match(page, /boss-variants-v2\.png/);
  assert.match(page, /boss-projectiles-v2\.png/);
  assert.match(page, /thunder-mech\.png/);
  assert.match(page, /sky-talon-mech\.png/);
  assert.match(page, /cinder-forge-mech\.png/);
  assert.match(page, /v2-support-assets\.png/);
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
  assert.match(css, /\.gameWrap\{width:min\(1680px,98vw\)/);

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
    access(new URL("../public/game/boss-variants-v2.png", import.meta.url)),
    access(new URL("../public/game/boss-projectiles-v2.png", import.meta.url)),
    access(new URL("../public/game/thunder-mech.png", import.meta.url)),
    access(new URL("../public/game/sky-talon-mech.png", import.meta.url)),
    access(new URL("../public/game/cinder-forge-mech.png", import.meta.url)),
    access(new URL("../public/game/v2-support-assets.png", import.meta.url)),
    access(new URL("../public/game/enemy-reinforcements.png", import.meta.url)),
    access(new URL("../public/game/enemy-reinforcement-projectiles.png", import.meta.url)),
    access(new URL("../public/favicon.svg", import.meta.url)),
    access(new URL("../public/og.png", import.meta.url)),
  ]);
});

test("keeps a co-op run alive across upgrade/shop pauses until both players are down", () => {
  assert.equal(teamRunDefeated(0, 80, true), false, "dead host + living guest must continue");
  assert.equal(teamRunDefeated(0, null, true), false, "missing guest frame is unknown, not dead");
  assert.equal(teamRunDefeated(0, 0, true), true, "both authoritative health values are dead");
  assert.equal(teamRunDefeated(0, null, false), true, "solo host death ends the run");

  assert.equal(reconcilePausedPeerHp(true, 0, 120), 1, "stale zero report cannot kill a living peer");
  assert.equal(reconcilePausedPeerHp(true, 75, 120), 75);
  assert.equal(reconcilePausedPeerHp(false, 75, 120), 0, "a downed peer cannot revive through a menu");
});

test("prioritizes bosses for every offensive ultimate and boosts only early-wave XP", () => {
  const origin = { x: 0, y: 0 };
  const targets = [
    { kind: "runner", hp: 20, maxHp: 20, elite: false, x: 5, y: 0 },
    { kind: "brute", hp: 200, maxHp: 200, elite: true, x: 20, y: 0 },
    { kind: "boss", hp: 3000, maxHp: 3000, elite: false, x: 1500, y: 800 },
  ];
  assert.equal(prioritizeUltimateTargets(targets, origin, 1)[0]?.kind, "boss");
  assert.deepEqual(
    prioritizeUltimateTargets(targets, origin, 3).map((target) => target.kind),
    ["boss", "brute", "runner"],
  );
  assert.equal(
    prioritizeUltimateTargets([{ ...targets[2], hp: 0 }, targets[0]], origin, 1)[0]?.kind,
    "runner",
  );

  assert.equal(earlyWaveXpMultiplier(1), 1.5);
  assert.equal(earlyWaveXpMultiplier(2), 1.35);
  assert.equal(earlyWaveXpMultiplier(3), 1.2);
  assert.equal(earlyWaveXpMultiplier(4), 1);
  assert.equal(earlyWaveXpMultiplier(12), 1);
});
