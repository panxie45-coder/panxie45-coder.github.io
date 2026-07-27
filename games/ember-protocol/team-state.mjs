/**
 * A co-op run only ends after both authoritative health values are known dead.
 * A temporarily missing guest frame means "unknown", never "dead".
 *
 * @param {number} hostHp
 * @param {number | null} guestHp
 * @param {boolean} coOpEstablished
 */
export const teamRunDefeated = (hostHp, guestHp, coOpEstablished) =>
  hostHp <= 0 && (
    !coOpEstablished ||
    (guestHp !== null && guestHp <= 0)
  );

/**
 * Upgrade/shop reports cannot kill a peer that was alive when the authority
 * paused the battlefield, and cannot revive a peer that was already downed.
 *
 * @param {boolean} authorityWasAlive
 * @param {number} reportedHp
 * @param {number} maxHp
 */
export const reconcilePausedPeerHp = (authorityWasAlive, reportedHp, maxHp) =>
  authorityWasAlive
    ? Math.min(maxHp, Math.max(1, reportedHp))
    : 0;
