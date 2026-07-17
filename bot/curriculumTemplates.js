/** Retired — curriculum OS removed. */
export function getCurriculumTemplate() { return null; }
export function listCurriculumTemplates() { return []; }
export function normalizeCurriculumTemplateName(name) { return String(name || '').toLowerCase(); }
export default { getCurriculumTemplate, listCurriculumTemplates, normalizeCurriculumTemplateName };
