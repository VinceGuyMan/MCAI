/** Retired — progression OS removed. */
export function getProgressionMilestones() { return []; }
export function listMilestones() { return []; }
export function getMilestone() { return null; }
export function generateProgressionSummary() {
  return { completed: 0, total: 0, percent: 0, nextAvailable: [], retired: true };
}
export function validateMilestoneDefinitions() { return { ok: true, errors: [], retired: true }; }
export default { getProgressionMilestones, listMilestones, getMilestone, generateProgressionSummary, validateMilestoneDefinitions };
