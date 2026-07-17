/** Retired — curriculum OS removed. */
export function getLastSuggestions() { return []; }
export function getSuggestionHistory() { return []; }
export function loadCurriculumMemory() { return { suggestions: [], history: [] }; }
export function saveCurriculumMemory() { return { ok: true, retired: true }; }
export function ensureCurriculumMemoryShape(data = {}) { return { suggestions: [], history: [], ...data, retired: true }; }
export default { getLastSuggestions, getSuggestionHistory, loadCurriculumMemory };
