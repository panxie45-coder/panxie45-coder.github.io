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
  if (wave <= 1) return 1.5;
  if (wave === 2) return 1.35;
  if (wave === 3) return 1.2;
  return 1;
};
