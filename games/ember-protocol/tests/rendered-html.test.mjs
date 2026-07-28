import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import {
  reconcilePausedPeerHp,
  teamRunDefeated,
} from "../team-state.mjs";
import {
  droneDamageScaleFor,
  earlyShopDiscountFor,
  earlyWaveXpMultiplier,
  FIRST_SHOP_WAVE,
  primaryThreatScore,
  prioritizeUltimateTargets,
  skillCooldownFor,
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
  assert.match(html, /版本 0\.18\.1 · 统一机甲美术与战斗视野整理/);
  assert.match(html, /开始远征/);
  assert.match(html, /双人联机/);
  assert.match(html, /Q \/ 空格/);
  assert.match(html, /<kbd>E<\/kbd> 副技能/);
  assert.match(html, /终极大招/);
});

test("ships sixteen independent classes, evolutions, missions, bosses, and generated sprites", async () => {
  const page = await readFile(new URL("../Game.tsx", import.meta.url), "utf8");
  const audio = await readFile(new URL("../audio.ts", import.meta.url), "utf8");
  const css = await readFile(new URL("../game.css", import.meta.url), "utf8");
  const rootEntry = await readFile(new URL("../../../app/page.tsx", import.meta.url), "utf8");

  assert.match(rootEntry, /games\/ember-protocol\/Game/);
  assert.doesNotMatch(rootEntry, /ember-protocol-v9/);
  assert.match(page, /ember-protocol-v9/);
  assert.match(page, /type ClassId = "assault" \| "guardian" \| "engineer" \| "phantom" \| "laser" \| "frost" \| "blade" \| "gravity" \| "thunder" \| "sky" \| "cinder" \| "aegis" \| "venom" \| "chrono" \| "magnet" \| "portal"/);
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
  assert.match(page, /projectile-mechs\.webp/);
  assert.match(page, /laser-mech\.webp/);
  assert.match(page, /frost-mech\.webp/);
  assert.match(page, /blade-mech\.webp/);
  assert.match(page, /gravity-mech\.webp/);
  assert.match(page, /vanguard-drones\.webp/);
  assert.match(page, /vanguard-projectiles\.webp/);
  assert.match(page, /specialist-drones\.webp/);
  assert.match(page, /enemy-projectiles\.webp/);
  assert.match(page, /assassin-projectile\.webp/);
  assert.match(page, /const GAME_IMAGE_CACHE = new Map<string, HTMLImageElement>\(\)/);
  assert.match(page, /const GAME_ASSET_RETRY_LIMIT = 2/);
  assert.match(page, /const fallbackPngFor/);
  assert.match(page, /window\.setTimeout\(load, retries \* 220\)/);
  assert.match(page, /const preloadGameAssets/);
  assert.match(page, /preloadGameAssets\(\)/);
  assert.match(page, /const ResilientMechPreview/);
  assert.match(page, /preview-retry/);
  assert.match(page, /fallbackPngFor\(primarySource\)/);
  assert.match(page, /<ResilientMechPreview classInfo=\{item\}\/>/);
  assert.match(page, /const playerSprites = getGameImage\(GAME_ASSETS\.playerMechs\)/);
  assert.doesNotMatch(page, /const playerSprites = new Image\(\)/);
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
  assert.match(page, /Math\.min\(\.3, elapsed \/ 1200\)/);
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
  assert.match(page, /className="battleLoadoutPanel"/);
  assert.doesNotMatch(page, /className="combatSkillRack"/);
  assert.match(page, /const tacticalArchive = <section className="tacticalArchive"/);
  assert.match(page, /className="relicPickupReport externalRelicReport"/);
  assert.match(page, /selectedClassSpec\.ultimate/);
  assert.match(page, /selectedSignatureSet\.tiers\[signaturePieces\]/);
  assert.match(page, /createRelicPickupReport/);
  assert.match(page, /variant\?: "secondary"/);
  assert.match(page, /skill2\?: boolean/);
  assert.match(page, /ultimate\?: boolean/);
  assert.match(page, /const bladeGradient=/);
  assert.match(page, /const dronePosition/);
  assert.match(page, /const CLASS_UPGRADES/);
  assert.match(page, /const SECONDARY_UPGRADES/);
  assert.match(page, /const ULTIMATE_UPGRADES/);
  assert.match(page, /type UpgradeRarity = "common" \| "rare" \| "epic" \| "legendary"/);
  assert.match(page, /const RARITY_WEIGHTS/);
  assert.match(page, /const UPGRADE_RARITY_GROWTH_CAP_WAVE = 12/);
  assert.match(page, /const RARITY_LATE_WAVE_BONUS/);
  assert.match(page, /const BASIC_ATTACK_WEIGHT_MULTIPLIER = 1\.5/);
  assert.match(page, /const MAX_HP_WEIGHT_MULTIPLIER = 1\.55/);
  assert.match(page, /const BASIC_ATTACK_UPGRADE_IDS = new Set/);
  assert.match(page, /const MAX_HP_UPGRADE_IDS = new Set/);
  assert.match(page, /"rapid", "damage", "multi", "critical", "velocity"/);
  assert.match(page, /"assault-warhead", "guardian-rail", "phantom-needle", "laser-prism"/);
  assert.match(page, /"frost-shatter", "blade-edge", "blade-tempo", "gravity-lens"/);
  assert.match(page, /"thunder-cycle", "sky-focus", "sky-penetrator", "cinder-nozzle"/);
  assert.match(page, /common: 52, rare: 32, epic: 16, legendary: 7/);
  assert.match(page, /common: -8, rare: 10, epic: 14, legendary: 11/);
  assert.match(page, /const upgradeRarityWeight = \(rarity: UpgradeRarity, wave: number\)/);
  assert.match(page, /RARITY_LATE_WAVE_BONUS\[rarity\] \* progress/);
  assert.match(page, /const weightedUpgradePick/);
  assert.match(page, /BASIC_ATTACK_UPGRADE_IDS\.has\(upgrade\.id\) \? BASIC_ATTACK_WEIGHT_MULTIPLIER : 1/);
  assert.match(page, /MAX_HP_UPGRADE_IDS\.has\(upgrade\.id\) \? MAX_HP_WEIGHT_MULTIPLIER : 1/);
  assert.match(page, /upgradeRarityWeight\(rarity, wave\) \* attackWeight \* maxHpWeight/);
  assert.match(page, /id: "bulkhead"/);
  assert.match(page, /id: "living-alloy"/);
  assert.match(page, /weightedUpgradePick\(fullPool, excluded, wave\)/);
  assert.match(page, /rollUpgradeChoices\(build\.classId, build, currentWave\)/);
  assert.match(page, /while \(choices\.length < 5\)/);
  assert.match(page, /const availableUltimate = ULTIMATE_UPGRADES\[classId\]\.filter\(\(upgrade\) => ultimateUpgradeAvailable\(upgrade, currentBuild\)\)/);
  assert.match(page, /const availableSecondary = SECONDARY_UPGRADES\[classId\]\.filter\(\(upgrade\) => secondaryUpgradeAvailable\(upgrade, currentBuild\)\)/);
  assert.doesNotMatch(page, /const signature = weightedUpgradePick\(CLASS_UPGRADES\[classId\], excluded\)/);
  assert.doesNotMatch(page, /每次至少包含一项本职业强化/);
  assert.match(page, /生命上限类强化获得 1\.55 倍抽取权重/);
  assert.match(page, /完成 3 次基础武器强化后会解锁一次二选一武器进化/);
  assert.match(page, /技能说明仅在整备与暂停页面显示，不占用战斗视野/);
  assert.match(page, /副技能 · \$\{RARITY_LABELS/);
  assert.match(page, /本职业 · \$\{RARITY_LABELS/);
  assert.match(page, /基础伤害、射速、多重弹、暴击、弹速与本职业主武器强化获得 1\.5 倍权重/);
  assert.match(page, /const ultimateUpgradeAvailable/);
  assert.match(page, /const secondaryUpgradeAvailable/);
  assert.match(page, /secondaryPower: 1/);
  assert.match(page, /secondaryArea: 1/);
  assert.match(page, /secondaryProjectiles: 0/);
  assert.match(page, /secondaryControl: 1/);
  assert.match(page, /id\.endsWith\("-secondary-power"\)\) stats\.secondaryPower \*= 1\.28/);
  assert.match(page, /ultimatePower: \.9/);
  assert.match(page, /id\.endsWith\("-ultimate-power"\)\) stats\.ultimatePower \*= 1\.25/);
  assert.match(page, /const salvoCount = Math\.max\(16, targets\.length \* 3\)/);
  assert.match(page, /r: 15,[\s\S]*splash: 82,[\s\S]*ultimate: true/);
  assert.match(page, /const projectileScale=\(s\.ultimate\?2\.2:s\.skill2\?1\.38:1\)\*\(s\.evolution===2\?1\.42/);
  assert.match(page, /const lateScale = 1 \+ elapsed \/ 250 \+ Math\.pow\(elapsed \/ 720, 1\.55\) \* \.72/);
  assert.match(page, /const lateRangedDamage = 1 \+ Math\.min\(\.3, elapsed \/ 1200\)/);
  assert.match(page, /const ASSAULT_ULTIMATE_TARGET_CAP = 20/);
  assert.match(page, /最多锁定 20 个/);
  assert.match(page, /currentBuild\.ultimateTargets < ASSAULT_ULTIMATE_TARGET_CAP/);
  assert.match(page, /stats\.ultimateTargets = Math\.min\(ASSAULT_ULTIMATE_TARGET_CAP, stats\.ultimateTargets \+ 2\)/);
  assert.match(page, /stats\.ultimateDuration = Math\.min\(5\.4/);
  assert.match(page, /stats\.ultimateLanes = Math\.min\(4/);
  assert.match(page, /stats\.ultimateEchoes = Math\.min\(4/);
  assert.match(page, /stats\.ultimateRange = Math\.min\(670/);
  assert.match(page, /assault-double-storm/);
  assert.match(page, /const SHOP_ITEMS/);
  assert.match(page, /const SHOP_EVERY_WAVES = 2/);
  assert.doesNotMatch(page, /supplyRewardFor\(/);
  assert.doesNotMatch(page, /waveKills/);
  assert.match(page, /const coinDropChanceFor/);
  assert.match(page, /Math\.random\(\) < coinDropChanceFor/);
  assert.match(page, /const earnedCoins = coinDropAmountFor\(enemy\)/);
  assert.match(page, /hostCoins \+= earnedCoins/);
  assert.match(page, /if \(coOpActive\) guestCoins \+= earnedCoins/);
  assert.doesNotMatch(page, /if \(gem\.coins\)/);
  assert.doesNotMatch(page, /coins: coinDropAmountFor/);
  assert.match(page, /reward: 0/);
  assert.match(page, /const shouldOpenSupply = \(currentWave - 1\) % SHOP_EVERY_WAVES === 0/);
  assert.match(page, /const GUARDIAN_SHIELD_MAX = 5/);
  assert.match(page, /const MIN_GUARDIAN_COOLDOWN = 7/);
  assert.match(page, /skillCooldownFor\(spec\.cooldown, stats\.skillHaste, minimumCooldown\)/);
  assert.match(page, /skillCooldownFor\(spec\.secondaryCooldown, stats\.skillHaste\)/);
  assert.match(page, /主技能与副技能冷却 -15%/);
  assert.match(page, /主技能与副技能冷却永久 -7%/);
  assert.match(page, /全队主\/副技能冷却 -10%/);
  assert.match(page, /Math\.min\(GUARDIAN_SHIELD_MAX, stats\.shieldDuration, cooldownSeconds - 2\)/);
  assert.match(page, /const MAX_UPGRADE_REROLLS = 2/);
  assert.match(page, /const MAX_SHOP_REROLLS = 3/);
  assert.match(page, /type ShopCategory = "补给" \| "武装" \| "防御" \| "核心"/);
  assert.match(page, /const shopRerollPrice = \(wave: number, used: number, wallet: number\)/);
  assert.match(page, /Math\.pow\(lateWave, 1\.45\) \* 1\.25/);
  assert.match(page, /wallet \* \(\.025 \+ used \* \.02\)/);
  assert.match(page, /const SHOP_CATEGORIES/);
  assert.match(page, /const SHOP_RARITY_WEIGHTS/);
  assert.match(page, /common: 62, rare: 26, epic: 9, legendary: 3/);
  assert.match(page, /const weightedShopPick/);
  assert.match(page, /const SHOP_RARITY_PRICE_MULTIPLIER/);
  assert.match(page, /earlyShopDiscountFor\(wave\)/);
  assert.match(page, /const rollShopItems = \(wave: number, wallet: number, recentIds: string\[\] = \[\]\)/);
  assert.match(page, /Math\.pow\(lateWave, 1\.42\) \* \.05/);
  assert.match(page, /item\.cost \* \.88 \* priceScale \* SHOP_RARITY_PRICE_MULTIPLIER\[item\.rarity\] \* earlyShopDiscount/);
  assert.match(page, /item\.category !== "补给" && item\.cost <= wallet/);
  assert.match(page, /Math\.floor\(wallet \* \.7 \/ 5\) \* 5/);
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
  assert.match(page, /Math\.pow\(elapsed \/ 720, 1\.55\) \* \.72/);
  assert.match(page, /addEvolvedEnemy\("artillery", 55/);
  assert.match(page, /addEvolvedEnemy\("commander", 285/);
  assert.match(page, /const coOpScale = remote \? 1\.5 : 1;[\s\S]{0,700}const lateBossWave/);
  assert.match(page, /Math\.pow\(lateBossWave \/ 6, 1\.45\) \* \.5/);
  assert.match(page, /boss: \{ hp: 3400/);
  assert.match(page, /const bossResilience = enemy\.kind !== "boss"/);
  assert.match(page, /const upgradeRerollPrice/);
  assert.match(page, /4 \+ Math\.floor\(Math\.max\(0, wave - 1\) \/ 4\) \+ used \* 3/);
  assert.match(page, /第 12 波达到上限/);
  assert.match(page, /前三次补给仍享受逐步递减的价格优惠/);
  assert.match(page, /尽量保证至少一件成长配件买得起/);
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
  assert.match(page, /id: "titan-core"[\s\S]*rarity: "rare"/);
  assert.match(page, /id: "overdrive-core"[\s\S]*rarity: "legendary"/);
  assert.match(page, /id: "chrono-core"[\s\S]*rarity: "epic"/);
  assert.match(page, /const BOSS_RELIC_GROWTH_CAP_WAVE = 15/);
  assert.match(page, /if \(rarity === "legendary"\) return 38 \+ progress \* 10/);
  assert.match(page, /if \(rarity === "epic"\) return 34 \+ progress \* 6/);
  assert.match(page, /if \(rarity === "rare"\) return 28 - progress \* 12/);
  assert.match(page, /const rollBossRelic = \(wave: number\)/);
  assert.match(page, /rollBossRelic\(currentWave\)/);
  assert.doesNotMatch(page, /shuffled\(BOSS_RELICS\)\[0\]/);
  assert.match(page, /RARITY_LABELS\[bossRelic\.rarity\]/);
  assert.match(page, /const WARZONE_ROUTES: WarzoneRoute\[\]/);
  assert.match(page, /id: "forge"/);
  assert.match(page, /id: "archive"/);
  assert.match(page, /t: "route-open"; wave: number/);
  assert.match(page, /t: "route-selected"; route: ActiveWarzone/);
  assert.match(page, /pendingRouteChoice = true/);
  assert.match(page, /openWarzoneSelection\(\)/);
  assert.match(page, /applyWarzoneBoonToBuild/);
  assert.match(page, /warzoneProjectileScale/);
  assert.match(page, /const SIGNATURE_SETS: Record<ClassId, SignatureSet>/);
  assert.match(page, /const signatureCompendium = <section className="signatureCompendium"/);
  assert.match(page, /职业遗物套装图鉴/);
  assert.match(page, /SIGNATURE_SETS\[item\.id\]/);
  assert.match(page, /set\.tiers\.map\(\(tier,index\)/);
  assert.match(page, /const applySignatureRelicPieces/);
  assert.match(page, /signaturePieces: 0/);
  assert.match(page, /relicPieces: bossRelic \? \(currentWarzone\?\.id === "archive" \? 2 : 1\) : undefined/);
  assert.match(page, /const signaturePieceCount = gem\.relicPieces \|\| 1/);
  assert.match(page, /万华镜阵列/);
  assert.match(page, /无间剑式/);
  assert.match(page, /自律工厂/);
  assert.match(css, /\.routeGrid/);
  assert.match(css, /\.signatureBadge/);
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
  assert.doesNotMatch(page, /selectedClassSpec\.ultimate\.split/);
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
  assert.match(page, /worldClock = highNetworkLoad \? \.12 : \.075/);
  assert.match(audio, /\| "skill"/);
  assert.match(audio, /\| "ultimate"/);
  assert.match(page, /audio\?\.play\("skill"\)/);
  assert.match(page, /audio\?\.play\("ultimate"\)/);
  assert.match(page, /enemy\.slow = Math\.max/);
  assert.match(page, /frozen\?: number/);
  assert.match(page, /enemy\.frozen = Math\.max/);
  assert.match(page, /const canAct = !timeStoppedNow && !frozenNow && !stunnedNow/);
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
  assert.match(page, /type Gem = \{ x: number; y: number; value: number; life: number; relic\?: BossRelicId; relicPieces\?: number; heal\?: number \}/);
  assert.match(page, /const HEALTH_PACK_ENEMY_KINDS/);
  assert.match(page, /life: bossRelic \? 35 : 18/);
  assert.match(page, /gems\.push\(\{ x: enemy\.x \+ 18, y: enemy\.y - 12, value: 0, life: 14, heal \}\)/);
  assert.match(page, /gem\.life -= dt/);
  assert.match(page, /gem\.life > 0 && \(gem\.value > 0 \|\| Boolean\(gem\.heal\)\)/);
  assert.match(page, /维修包 \$\{Math\.ceil\(g\.life\)\}s/);
  assert.match(page, /entry\.actor\.hp < entry\.actor\.maxHp/);
  assert.match(page, /战地维修包/);
  assert.match(page, /boss-variants\.webp/);
  assert.match(page, /boss-projectiles\.webp/);
  assert.match(page, /boss-variants-v2\.webp/);
  assert.match(page, /boss-projectiles-v2\.webp/);
  assert.match(page, /thunder-mech\.webp/);
  assert.match(page, /sky-talon-mech\.webp/);
  assert.match(page, /cinder-forge-mech\.webp/);
  assert.match(page, /v2-support-assets\.webp/);
  assert.match(page, /aegis-mech\.webp/);
  assert.match(page, /venom-mech\.webp/);
  assert.match(page, /chrono-mech\.webp/);
  assert.match(page, /frontier-support-assets\.webp/);
  assert.match(page, /phantom-reserve/);
  assert.match(page, /stats\.dashCharges = Math\.min\(3, stats\.dashCharges \+ 1\)/);
  assert.match(page, /phantomDashCharges <= 0/);
  assert.match(page, /phantomDashCharges < stats\.dashCharges/);
  assert.match(page, /const aegisShock/);
  assert.match(page, /const venomCloud/);
  assert.match(page, /const chronoField/);
  assert.match(page, /assault-guidance/);
  assert.match(page, /guardian-retaliation/);
  assert.match(page, /engineer-triage/);
  assert.match(page, /phantom-afterimage/);
  assert.match(page, /laser-refraction/);
  assert.match(page, /frost-brittle/);
  assert.match(page, /blade-combo/);
  assert.match(page, /const classUpgradeAvailable/);
  assert.match(page, /combatStats\.assaultGuidance > 0 \? 1\.1/);
  assert.match(page, /const guardianBulwark/);
  assert.match(page, /const engineerRepairPulse/);
  assert.match(page, /const phaseAfterimage/);
  assert.match(page, /const beamAngles = combatStats\.laserRefraction > 1/);
  assert.match(page, /resolvedDamage \*= 1 \+ \(frostStats\?\.frostShatter \|\| 0\)/);
  assert.match(page, /comboMultiplier = combatStats\.bladeCombo > 1 \? 2\.1 : 1\.85/);
  assert.match(page, /spreadTargets = enemies/);
  assert.match(page, /droneDamageScaleFor\(build\.classId\)/);
  assert.match(page, /drones: 1,/);
  assert.match(page, /if \(classId === "engineer"\) return \{[^}]*drones: 3/);
  assert.match(page, /return \{ \.\.\.base, maxHp: 118,[^}]*drones: 1, chronoPower/);
  assert.match(page, /timeStopped\?: number/);
  assert.match(page, /timeDilated\?: number/);
  assert.match(page, /facing\?: number/);
  assert.match(page, /const activeTimeFields = effects\.filter/);
  assert.match(page, /shot\.timeStopped = Math\.max/);
  assert.match(page, /enemy\.timeStopped = Math\.max/);
  assert.match(page, /if \(\(shot\.timeStopped \|\| 0\) > 0\) continue/);
  assert.match(page, /enemy\.facing = angle/);
  assert.match(page, /const PERFORMANCE_LIMITS/);
  assert.match(page, /const enemyAiStride = enemies\.length > PERFORMANCE_LIMITS\.extremeEnemyCount/);
  assert.match(page, /const enemyGrid = new Map<string, Enemy\[\]>/);
  assert.match(page, /shots: snapshotShots/);
  assert.match(page, /if \(gems\.length > PERFORMANCE_LIMITS\.gems\)/);
  assert.match(page, /const highNetworkLoad = enemies\.length > PERFORMANCE_LIMITS\.highEnemyCount/);
  assert.match(page, /corrosionDamage/);
  assert.match(page, /enemy-reinforcements\.webp/);
  assert.match(page, /enemy-reinforcement-projectiles\.webp/);
  assert.match(page, /quantum-support\.webp/);
  assert.match(page, /map-enemies\.webp/);
  assert.match(page, /boss-expansion\.webp/);
  assert.match(page, /weapon-evolution-fast/);
  assert.match(page, /const tryCoopCombo/);
  assert.match(page, /const startBattleMission/);
  assert.match(page, /cathedral: \{ name: "星渊大教堂"/);
  assert.doesNotMatch(page, /ctx\.arc\(player\.x/);
  assert.doesNotMatch(page, /ctx\.arc\(remote\.x/);
  assert.match(page, /player-mechs\.webp/);
  assert.match(css, /background-size:200% 200%/);
  assert.match(css, /\.levelBadge small\{font:800 14px/);
  assert.match(css, /\.shopWallet/);
  assert.match(css, /\.panelVitals/);
  assert.match(css, /\.upgradeGrid button\.ultimateUpgrade/);
  assert.match(css, /\.upgradeGrid\{grid-template-columns:repeat\(5,1fr\)/);
  assert.match(css, /html,body\{font-size:17px\}/);
  assert.match(css, /\.classGrid button>span:not\(\.mechPreview\)\{font-size:13px/);
  assert.match(css, /\.upgradeGrid span\{font-size:14px/);
  assert.match(css, /\.shopGrid span\{font-size:13px\}/);
  assert.match(css, /@media\(min-width:1051px\) and \(max-width:1350px\)/);
  assert.match(css, /@media\(min-width:821px\) and \(max-width:1050px\)\{\.upgradeGrid\{grid-template-columns:repeat\(2,1fr\)\}\}/);
  assert.match(css, /\.upgradeGrid button\.rarity-legendary/);
  assert.match(css, /\.shopGrid button\.shop-rarity-legendary/);
  assert.match(css, /\.ultimateCopy em/);
  assert.match(css, /\.bossNotice/);
  assert.match(css, /\.signatureCompendiumGrid/);
  assert.match(css, /\.gameWrap\{width:min\(1680px,98vw\)/);

  await Promise.all([
    access(new URL("../public/game/player-mechs.webp", import.meta.url)),
    access(new URL("../public/game/enemy-mechs.webp", import.meta.url)),
    access(new URL("../public/game/projectile-mechs.webp", import.meta.url)),
    access(new URL("../public/game/laser-mech.webp", import.meta.url)),
    access(new URL("../public/game/frost-mech.webp", import.meta.url)),
    access(new URL("../public/game/blade-mech.webp", import.meta.url)),
    access(new URL("../public/game/gravity-mech.webp", import.meta.url)),
    access(new URL("../public/game/vanguard-drones.webp", import.meta.url)),
    access(new URL("../public/game/vanguard-projectiles.webp", import.meta.url)),
    access(new URL("../public/game/specialist-projectiles.webp", import.meta.url)),
    access(new URL("../public/game/support-drones.webp", import.meta.url)),
    access(new URL("../public/game/specialist-drones.webp", import.meta.url)),
    access(new URL("../public/game/enemy-projectiles.webp", import.meta.url)),
    access(new URL("../public/game/assassin-projectile.webp", import.meta.url)),
    access(new URL("../public/game/boss-variants.webp", import.meta.url)),
    access(new URL("../public/game/boss-projectiles.webp", import.meta.url)),
    access(new URL("../public/game/boss-variants-v2.webp", import.meta.url)),
    access(new URL("../public/game/boss-projectiles-v2.webp", import.meta.url)),
    access(new URL("../public/game/thunder-mech.webp", import.meta.url)),
    access(new URL("../public/game/sky-talon-mech.webp", import.meta.url)),
    access(new URL("../public/game/cinder-forge-mech.webp", import.meta.url)),
    access(new URL("../public/game/v2-support-assets.webp", import.meta.url)),
    access(new URL("../public/game/aegis-mech.webp", import.meta.url)),
    access(new URL("../public/game/venom-mech.webp", import.meta.url)),
    access(new URL("../public/game/chrono-mech.webp", import.meta.url)),
    access(new URL("../public/game/frontier-support-assets.webp", import.meta.url)),
    access(new URL("../public/game/enemy-reinforcements.webp", import.meta.url)),
    access(new URL("../public/game/enemy-reinforcement-projectiles.webp", import.meta.url)),
    access(new URL("../public/game/quantum-support.webp", import.meta.url)),
    access(new URL("../public/game/map-enemies.webp", import.meta.url)),
    access(new URL("../public/game/boss-expansion.webp", import.meta.url)),
    access(new URL("../public/game/player-mechs.png", import.meta.url)),
    access(new URL("../public/game/boss-variants.png", import.meta.url)),
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

  assert.equal(earlyWaveXpMultiplier(1), 2.25);
  assert.equal(earlyWaveXpMultiplier(2), 1.95);
  assert.equal(earlyWaveXpMultiplier(3), 1.7);
  assert.equal(earlyWaveXpMultiplier(4), 1.5);
  assert.equal(earlyWaveXpMultiplier(5), 1.3);
  assert.equal(earlyWaveXpMultiplier(6), 1);
  assert.equal(earlyWaveXpMultiplier(12), 1);

  assert.equal(FIRST_SHOP_WAVE, 3);
  assert.equal(earlyShopDiscountFor(3), .75);
  assert.equal(earlyShopDiscountFor(5), .88);
  assert.equal(earlyShopDiscountFor(7), .96);
  assert.equal(earlyShopDiscountFor(9), 1);
});

test("applies every cooldown reduction to both tactical skill slots", () => {
  const haste = .85;
  assert.equal(skillCooldownFor(10, haste), 8.5, "Q receives the shared cooldown reduction");
  assert.equal(skillCooldownFor(8, haste), 6.8, "E receives the same shared cooldown reduction");
  assert.equal(skillCooldownFor(10, .3), 4, "ordinary skills retain the four-second safety floor");
  assert.equal(skillCooldownFor(14, .3, 7), 7, "guardian Q retains its seven-second safety floor");
});

test("keeps all sixteen launch kits inside one primary-fire budget", () => {
  const profiles = [
    ["assault", 50, .58, .05, 1, 1],
    ["guardian", 84, .98, .05, 1, 1],
    ["engineer", 31, .48, .05, 3, 1.12],
    ["phantom", 20, .24, .25, 1, 1],
    ["laser", 24, .26, .15, 1, 1],
    ["frost", 52, .68, .05, 1, 1],
    ["blade", 60, .58, .05, 1, 1],
    ["gravity", 44, .66, .05, 1, 1],
    ["thunder", 27, .36, .1, 1, 1],
    ["sky", 72, .94, .2, 1, 1],
    ["cinder", 54, .76, .05, 1, 1],
    ["aegis", 55, .8, .05, 1, 1],
    ["venom", 29, .42, .1, 1, 1],
    ["chrono", 34, .52, .05, 1, 1],
    ["magnet", 47, .65, .05, 1, 1],
    ["portal", 30, .34, .16, 1, 1],
  ].map(([classId, damage, interval, critChance, drones, dronePower]) => ({
    classId,
    damage,
    interval,
    critChance,
    drones,
    dronePower,
  }));

  const scores = profiles.map(primaryThreatScore);
  assert.equal(profiles.length, 16);
  assert.ok(Math.min(...scores) >= 84, `controller launch budget fell too low: ${Math.min(...scores)}`);
  assert.ok(Math.max(...scores) <= 138, `glass-cannon launch budget exceeded: ${Math.max(...scores)}`);
  assert.equal(droneDamageScaleFor("engineer"), .22);
  assert.equal(droneDamageScaleFor("assault"), .26);
});
