/** Retired — progression OS removed. */
export function getProgressionSummary() {
  return { completed: 0, total: 0, percent: 0, recommended: null, nextAvailable: [], retired: true };
}
export function refreshProgressionState() { return loadEmpty(); }
export function explainMilestoneStatus() { return { ok: false, retired: true, message: 'Progression OS removed.' }; }
export function checkMilestone() { return { complete: false, retired: true }; }
export function getMissingEvidence() { return []; }
export function getMissingPrerequisites() { return []; }
function loadEmpty() {
  return { completedMilestones: {}, blockedMilestones: {}, retired: true };
}
export default { getProgressionSummary };
