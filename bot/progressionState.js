/** Retired — progression OS removed. */
export function loadProgressionState() {
  return { completedMilestones: {}, blockedMilestones: {}, retired: true };
}
export function saveProgressionState() { return { ok: true, retired: true }; }
export function getProgressionHistory() { return []; }
export function ensureProgressionStateShape(data = {}) {
  const base = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  return {
    ...base,
    completedMilestones: base.completedMilestones && typeof base.completedMilestones === 'object' && !Array.isArray(base.completedMilestones)
      ? base.completedMilestones
      : {},
    blockedMilestones: base.blockedMilestones && typeof base.blockedMilestones === 'object' && !Array.isArray(base.blockedMilestones)
      ? base.blockedMilestones
      : {},
    retired: true
  };
}
export function markMilestoneComplete() { return { ok: false, retired: true }; }
export function markMilestoneBlocked() { return { ok: false, retired: true }; }
export function resetProgressionState() { return { ok: true, retired: true }; }
export default { loadProgressionState, getProgressionHistory, ensureProgressionStateShape };
