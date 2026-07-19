/** Retired — curriculum OS removed. */
export function getLastSuggestions() { return []; }
export function getSuggestionHistory() { return []; }
export function loadCurriculumMemory() {
  return { suggestions: [], history: [], curriculumSessions: [], activeCurriculum: null, retired: true };
}
export function saveCurriculumMemory() { return { ok: true, retired: true }; }
export function ensureCurriculumMemoryShape(data = {}) {
  return {
    ...(data && typeof data === 'object' && !Array.isArray(data) ? data : {}),
    suggestions: [],
    history: [],
    curriculumSessions: [],
    activeCurriculum: null,
    retired: true
  };
}
export default { getLastSuggestions, getSuggestionHistory, loadCurriculumMemory };
