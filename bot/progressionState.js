/** Retired — progression OS removed. */
export function loadProgressionState() {
  return { completedMilestones: {}, blockedMilestones: {}, retired: true };
}
export function saveProgressionState() { return { ok: true, retired: true }; }
export function getProgressionHistory() { return []; }
export function ensureProgressionStateShape(data = {}) {
  return { completedMilestones: {}, blockedMilestones: {}, ...data, retired: true };
}
export function markMilestoneComplete() { return { ok: false, retired: true }; }
export function markMilestoneBlocked() { return { ok: false, retired: true }; }
export function resetProgressionState() { return { ok: true, retired: true }; }
export default { loadProgressionState, getProgressionHistory, ensureProgressionStateShape };
