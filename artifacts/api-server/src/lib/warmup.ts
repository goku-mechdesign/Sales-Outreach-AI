import type { Settings } from "@workspace/db";

/**
 * Computes today's effective autonomous-send daily quota under the
 * deliverability warm-up ramp.
 *
 * While warm-up is enabled, the quota starts at `warmUpStartingLimit` on
 * `warmUpStartDate` and increases by `warmUpIncrementAmount` every
 * `warmUpIncrementIntervalDays`, capped at `warmUpCeiling`. It never exceeds
 * `maxEmailsPerDay` -- the ramp can only make autonomous sending *more*
 * conservative than the flat cap, never looser. Once the ramp reaches the
 * ceiling (or warm-up is off / not started yet), this simply returns
 * `maxEmailsPerDay`, i.e. today's behavior is unchanged.
 */
export function computeEffectiveDailyLimit(settings: Settings, now: Date = new Date()): number {
  if (!settings.warmUpEnabled || !settings.warmUpStartDate) {
    return settings.maxEmailsPerDay;
  }

  const elapsedMs = now.getTime() - settings.warmUpStartDate.getTime();
  const ceiling = Math.min(settings.warmUpCeiling, settings.maxEmailsPerDay);

  if (elapsedMs < 0) {
    // Warm-up scheduled to start in the future -- hold at the starting limit.
    return Math.max(1, Math.min(settings.warmUpStartingLimit, ceiling));
  }

  const intervalMs = Math.max(settings.warmUpIncrementIntervalDays, 1) * 24 * 60 * 60 * 1000;
  const stepsElapsed = Math.floor(elapsedMs / intervalMs);
  const ramped = settings.warmUpStartingLimit + stepsElapsed * settings.warmUpIncrementAmount;

  return Math.max(1, Math.min(ramped, ceiling));
}
