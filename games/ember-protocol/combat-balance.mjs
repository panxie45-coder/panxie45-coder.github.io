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

/**
 * Front-load a little more growth before the first boss without changing the
 * established mid/late-game progression curve.
 *
 * @param {number} wave
 */
export const earlyWaveXpMultiplier = (wave) => {
  if (wave <= 1) return 1.8;
  if (wave === 2) return 1.55;
  if (wave === 3) return 1.3;
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
