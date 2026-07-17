/** Retired — curriculum OS removed (archive/removed-for-player2). */
export function getActiveCurriculum() { return null; }
export function getCurriculumProgress() { return { enabled: false, retired: true }; }
export function getCurriculumExecutionHistory() { return []; }
export function getCurriculumExecutionStatus() { return { enabled: false, retired: true }; }
export function pauseCurriculum() { return { ok: true, retired: true }; }
export function resumeCurriculum() { return { ok: false, retired: true }; }
export function cancelCurriculum() { return { ok: true, retired: true }; }
export function approveCurriculumSuggestion() { return { ok: false, retired: true }; }
export function approveCurriculumTrack() { return { ok: false, retired: true }; }
export function startApprovedCurriculum() { return { ok: false, retired: true }; }
export function executeNextCurriculumStep() { return { ok: false, retired: true }; }
export default {
  getActiveCurriculum,
  getCurriculumProgress,
  getCurriculumExecutionHistory,
  getCurriculumExecutionStatus,
  pauseCurriculum,
  approveCurriculumSuggestion,
  approveCurriculumTrack,
  cancelCurriculum,
  executeNextCurriculumStep
};
