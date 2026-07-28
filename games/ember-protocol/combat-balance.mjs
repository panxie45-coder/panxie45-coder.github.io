/**
 * Offensive ultimates always reserve their first lock for a living boss.
 * Remaining locks prefer elites, then durable enemies, then nearby enemies.
 *
 * @template {{ hp: number, maxHp: number, kind?: string, elite?: boolean, x: number, y: number }} T
 * @param {T[]} enemies
 * @param {{ x: number, y: number }} origin
 * @param {number} limit
 * @returns {T[]}
 */
export const prioritizeUltimateTargets = (enemies, origin, limit) =>
  [...enemies]
    .filter((enemy) => enemy.hp > 0)
    .sort((a, b) => {
      const bossPriority = Number(b.kind === "boss") - Number(a.kind === "boss");
      if (bossPriority) return bossPriority;
      const elitePriority = Number(Boolean(b.elite)) - Number(Boolean(a.elite));
      if (elitePriority) return elitePriority;
      if (b.maxHp !== a.maxHp) return b.maxHp - a.maxHp;
      return Math.hypot(a.x - origin.x, a.y - origin.y) -
        Math.hypot(b.x - origin.x, b.y - origin.y);
    })
    .slice(0, Math.max(0, Math.round(limit)));

export const BOSS_LOCK_RADIUS = 460;

/**
 * Basic attacks and tactical skills should not lose a nearby boss merely
 * because a small enemy is a few pixels closer. Bosses only receive this
 * priority inside the lock radius, so distant bosses cannot steal all shots.
 *
 * @template {{ hp: number; kind?: string; r?: number; x: number; y: number }} T
 * @param {T[]} enemies
 * @param {{ x: number; y: number }} origin
 * @param {number} bossLockRadius
 * @returns {T | null}
 */
export const selectCombatTarget = (enemies, origin, bossLockRadius = BOSS_LOCK_RADIUS) => {
  const living = enemies.filter((enemy) => enemy.hp > 0);
  const distanceTo = (enemy) => Math.hypot(enemy.x - origin.x, enemy.y - origin.y);
  const nearbyBoss = living
    .filter((enemy) => enemy.kind === "boss" && distanceTo(enemy) <= bossLockRadius + Math.max(0, enemy.r || 0))
    .sort((a, b) => distanceTo(a) - distanceTo(b))[0];
  if (nearbyBoss) return nearbyBoss;
  return living.sort((a, b) => distanceTo(a) - distanceTo(b))[0] || null;
};

/**
 * Front-load a little more growth before the first boss without changing the
 * established mid/late-game progression curve.
 *
 * @param {number} wave
 */
export const earlyWaveXpMultiplier = (wave) => {
  if (wave <= 1) return 2.25;
  if (wave === 2) return 1.95;
  if (wave === 3) return 1.7;
  if (wave === 4) return 1.5;
  if (wave === 5) return 1.3;
  return 1;
};

export const FIRST_SHOP_WAVE = 3;

/**
 * Help the opening build come online, then return to the normal price curve.
 *
 * @param {number} wave
 */
export const earlyShopDiscountFor = (wave) =>
  wave <= 3 ? .75 : wave <= 5 ? .88 : wave <= 7 ? .96 : 1;

/**
 * Early supply grants include a decaying launch stipend. Kill rewards keep
 * diminishing returns so late-game hordes cannot flood the economy.
 *
 * @param {number} kills
 * @param {number} wave
 */
export const supplyRewardFor = (kills, wave) => {
  const earlyWaveBonus = Math.max(0, 42 - Math.max(0, wave - FIRST_SHOP_WAVE) * 7);
  return Math.max(12, Math.round(Math.sqrt(Math.max(0, kills)) * 3.2 + wave * 2.5 + earlyWaveBonus));
};

/**
 * Every cooldown-reduction upgrade applies to both tactical skills (Q and E).
 * Individual skills may still keep a safety floor for balance.
 *
 * @param {number} baseCooldown
 * @param {number} skillHaste
 * @param {number} minimum
 */
export const skillCooldownFor = (baseCooldown, skillHaste, minimum = 4) =>
  Math.max(minimum, baseCooldown * skillHaste);

/**
 * Every chassis receives a support drone, but the engineer starts with three.
 * Individual engineer drones therefore use a smaller per-unit coefficient so
 * the formation is stronger as a whole without tripling the opening DPS.
 *
 * @param {string} classId
 */
export const droneDamageScaleFor = (classId) => classId === "engineer" ? .22 : .26;

/**
 * A lightweight budget score used by regression tests when adding new mechs.
 * Tanks/controllers may sit near the lower edge and glass cannons near the
 * upper edge, but new releases should stay inside the shared launch envelope.
 *
 * @param {{ classId: string; damage: number; interval: number; critChance: number; drones: number; dronePower: number }} stats
 */
export const primaryThreatScore = (stats) => {
  const critMultiplier = 1 + Math.max(0, stats.critChance);
  const droneMultiplier = 1 + Math.max(0, stats.drones) * droneDamageScaleFor(stats.classId) * Math.max(0, stats.dronePower);
  return stats.damage / Math.max(.08, stats.interval) * critMultiplier * droneMultiplier;
};
