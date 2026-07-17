/**
 * Skill registry / runner / evidence handlers.
 */
import {
  generateSkillSummary,
  getSkill,
  getSkills,
  listRiskySkills,
  listSkillsByCategory,
  listUnimplementedSkills,
  validateSkillDefinitions
} from '../../skillRegistry.js';
import { getRecentSkillRuns, getSkillEvidenceHistory, getSkillStats, listSkillStats, loadSkillMemory, summarizeSkillEvidence } from '../../skillMemory.js';
import * as skillRunner from '../../skillRunner.js';
import { getEvidenceDefinition, listEvidenceDefinitions } from '../../progressEvidence.js';

export function createSkillsHandlers(ctx) {
  const {
    bot, config, memory, say
  } = ctx;

  function categorySkillLine(category, counts) {
    return `${category} ${counts.implemented}/${counts.total}`;
  }

  async function skillsStatusAction(category = null) {
    if (category) {
      const skills = listSkillsByCategory(String(category).toLowerCase());
      if (!skills.length) {
        say(`No skills found for category ${category}.`, true);
        return;
      }
      const text = skills
        .slice(0, 12)
        .map((skill) => `${skill.name}:${skill.implemented ? 'yes' : 'no'}${skill.requiresConfirmation ? '*' : ''}`)
        .join(', ');
      say(`Skills ${category}: ${text}${skills.length > 12 ? `, +${skills.length - 12} more` : ''}. * needs confirmation.`, true);
      return;
    }

    const summary = generateSkillSummary();
    const parts = Object.entries(summary).map(([name, counts]) => categorySkillLine(name, counts));
    say(`Skills: ${parts.join(' | ')}`, true);
  }

  async function skillStatusAction(query = '') {
    const trimmed = String(query || '').trim().toLowerCase();
    if (!trimmed) return skillsStatusAction();
    const categorySkills = listSkillsByCategory(trimmed);
    if (categorySkills.length) return skillsStatusAction(trimmed);

    const skill = getSkill(trimmed);
    if (!skill) {
      say(`Unknown skill: ${trimmed}.`, true);
      return;
    }
    const stats = getSkillStats(skill.name);
    say(`Skill ${skill.name}: ${skill.implemented ? 'implemented' : 'not wired'}, risk ${skill.riskLevel}${skill.requiresConfirmation ? ', confirmation required' : ''}, action ${skill.action}, success ${stats.successCount}, failures ${stats.failureCount}.`, true);
  }

  async function unimplementedSkillsAction() {
    const names = listUnimplementedSkills().map((skill) => skill.name);
    say(names.length ? `Unimplemented skills: ${names.join(', ')}` : 'No unimplemented skills are registered.', true);
  }

  async function riskySkillsAction() {
    const names = listRiskySkills()
      .filter((skill) => skill.requiresConfirmation || skill.riskLevel === 'high')
      .map((skill) => `${skill.name}${skill.requiresConfirmation ? '*' : ''}`);
    say(names.length ? `Risky skills: ${names.join(', ')}. * needs confirmation.` : 'No risky skills are registered.', true);
  }

  async function skillAuditAction() {
    const skillMemory = loadSkillMemory();
    const validation = validateSkillDefinitions(api);
    const summary = generateSkillSummary();
    const totals = Object.values(summary).reduce((acc, item) => ({
      total: acc.total + item.total,
      implemented: acc.implemented + item.implemented,
      risky: acc.risky + item.risky
    }), { total: 0, implemented: 0, risky: 0 });
    if (!validation.ok) {
      say(`Skill audit failed: ${validation.errors.slice(0, 3).join(' | ')}`, true);
      return { ok: false, reason: validation.errors[0], evidence: ['skill_audit_failed'], data: { errors: validation.errors } };
    }
    const message = `Skill audit passed: ${totals.implemented}/${totals.total} implemented, ${totals.risky} risky, ${Object.keys(skillMemory.skills || {}).length} skill stats tracked${validation.warnings.length ? `, ${validation.warnings.length} warnings` : ''}.`;
    say(message, true);
    return { ok: true, message, evidence: ['skill_audit_reported'], data: { totals, warnings: validation.warnings } };
  }

  function normalizeSkillRunnerName(name) {
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '_');
  }

  async function runSkillAction(skillName, args = {}, context = {}) {
    const name = normalizeSkillRunnerName(skillName);
    const result = await skillRunner.runSkill(bot, memory, name, args, {
      ...context,
      actions: api,
      cancellation,
      ownerUsername: config.ownerUsername,
      sender: context.sender || config.ownerUsername,
      source: context.source || 'chat'
    });
    if (!result.ok) say(`Skill ${result.skillName || name} blocked: ${result.reason || 'unknown reason'}`, true);
    return result;
  }

  async function activeSkillAction() {
    const status = skillRunner.getSkillRunStatus();
    if (!status.running) {
      say('No active skill is running.', true);
      return { ok: true, message: 'No active skill is running.', evidence: ['skill_runner_idle'] };
    }
    say(`Active skill: ${status.skillName} via ${status.action}, ${Math.round(status.durationMs / 1000)}s running.`, true);
    return { ok: true, message: 'Active skill reported.', evidence: ['active_skill_reported'], data: status };
  }

  async function skillRunnerStatusAction() {
    const status = skillRunner.getSkillRunStatus();
    const runnable = skillRunner.listRunnableSkills();
    const message = status.running
      ? `Skill runner: busy with ${status.skillName}. Runnable now: ${runnable.join(', ')}.`
      : `Skill runner: idle. Runnable skills: ${runnable.join(', ')}.`;
    say(message, true);
    return { ok: true, message, evidence: ['skill_runner_status_reported'], data: { status, runnable } };
  }

  async function cancelSkillAction(reason = 'cancelled by owner') {
    const result = skillRunner.cancelActiveSkill(reason);
    say(result.ok ? `Cancelled skill ${result.skillName}.` : result.reason, true);
    return {
      ok: result.ok,
      message: result.ok ? `Cancelled skill ${result.skillName}.` : result.reason,
      reason: result.ok ? '' : result.reason,
      evidence: [result.ok ? 'skill_cancelled' : 'no_active_skill']
    };
  }

  async function skillStatsAction(skillName = '') {
    const trimmed = normalizeSkillRunnerName(skillName);
    if (trimmed) {
      const stats = getSkillStats(trimmed);
      say(`Skill stats ${trimmed}: ${stats.successCount} success, ${stats.failureCount} failures${stats.lastFailureReason ? `, last failure ${stats.lastFailureReason}` : ''}.`, true);
      return { ok: true, message: 'Skill stats reported.', evidence: ['skill_stats_reported'], data: stats };
    }
    const stats = listSkillStats().slice(0, 8);
    if (!stats.length) {
      say('No skill runs recorded yet.', true);
      return { ok: true, message: 'No skill runs recorded yet.', evidence: ['skill_stats_reported'], data: [] };
    }
    say(`Skill stats: ${stats.map((item) => `${item.name}:${item.successCount}/${item.failureCount}`).join(', ')}.`, true);
    return { ok: true, message: 'Skill stats reported.', evidence: ['skill_stats_reported'], data: stats };
  }

  async function recentSkillsAction(limit = 5) {
    const runs = getRecentSkillRuns(limit);
    if (!runs.length) {
      say('No recent skill runs yet.', true);
      return { ok: true, message: 'No recent skill runs yet.', evidence: ['recent_skills_reported'], data: [] };
    }
    const text = runs.map((run) => `${run.skillName}:${run.ok === true ? 'ok' : run.ok === false ? 'fail' : 'started'}`).join(', ');
    say(`Recent skills: ${text}.`, true);
    return { ok: true, message: 'Recent skill runs reported.', evidence: ['recent_skills_reported'], data: runs };
  }

  async function evidenceStatusAction() {
    const definitions = listEvidenceDefinitions();
    const implemented = definitions.filter((item) => item.implemented).length;
    const runs = getRecentSkillRuns(5);
    const message = `Evidence: ${implemented}/${definitions.length} definitions active, ${runs.length} recent skill runs tracked.`;
    say(message, true);
    return { ok: true, message, evidence: ['evidence_status_reported'], data: { definitions: definitions.length, implemented, recentRuns: runs.length } };
  }

  async function skillEvidenceAction(skillName = '') {
    const name = normalizeSkillRunnerName(skillName || 'status');
    const history = getSkillEvidenceHistory(name, 5);
    if (!history.length) {
      const summary = summarizeSkillEvidence(name);
      say(`Evidence ${name}: ${summary}`, true);
      return { ok: true, message: summary, evidence: ['skill_evidence_reported'], data: [] };
    }
    const latest = history[0];
    const message = `Evidence ${name}: ${latest.resultStatus}, ${latest.evidenceSummary || 'no summary'}.`;
    say(message, true);
    return { ok: true, message, evidence: ['skill_evidence_reported'], data: history };
  }

  async function recentEvidenceAction(limit = 5) {
    const runs = getRecentSkillRuns(limit);
    if (!runs.length) {
      say('No recent skill evidence yet.', true);
      return { ok: true, message: 'No recent skill evidence yet.', evidence: ['recent_evidence_reported'], data: [] };
    }
    const text = runs
      .slice(0, limit)
      .map((run) => `${run.skillName}:${run.resultStatus || (run.ok ? 'success' : 'failed')}`)
      .join(', ');
    say(`Recent evidence: ${text}.`, true);
    return { ok: true, message: 'Recent evidence reported.', evidence: ['recent_evidence_reported'], data: runs };
  }

  async function evidenceDefinitionsAction() {
    const definitions = listEvidenceDefinitions();
    const active = definitions.filter((item) => item.implemented).length;
    const categories = [...new Set(definitions.map((item) => item.category))].slice(0, 10);
    const message = `Evidence definitions: ${active}/${definitions.length} active. Categories: ${categories.join(', ')}.`;
    say(message, true);
    return { ok: true, message, evidence: ['evidence_definitions_reported'], data: { count: definitions.length, active, categories } };
  }

  async function evidenceAuditAction() {
    const definitions = listEvidenceDefinitions();
    const names = new Set();
    const duplicateNames = [];
    for (const definition of definitions) {
      if (names.has(definition.name)) duplicateNames.push(definition.name);
      names.add(definition.name);
    }
    const errors = [];
    for (const skill of getSkills()) {
      if (!Array.isArray(skill.successEvidence) || !skill.successEvidence.length) errors.push(`${skill.name} missing successEvidence`);
      for (const evidenceName of skill.successEvidence || []) {
        const definition = getEvidenceDefinition(evidenceName);
        if (!definition) errors.push(`${skill.name} unknown evidence ${evidenceName}`);
        if (definition && !definition.implemented && skillRunner.listRunnableSkills().includes(skill.name)) {
          errors.push(`${skill.name} uses future evidence ${evidenceName}`);
        }
      }
    }
    if (duplicateNames.length) errors.push(`duplicate evidence names: ${duplicateNames.join(', ')}`);
    if (errors.length) {
      say(`Evidence audit failed: ${errors.slice(0, 3).join(' | ')}`, true);
      return { ok: false, reason: errors[0], evidence: ['evidence_audit_failed'], data: { errors } };
    }
    say(`Evidence audit passed: ${definitions.length} definitions, ${skillRunner.listRunnableSkills().length} runnable skills checked.`, true);
    return { ok: true, message: 'Evidence audit passed.', evidence: ['evidence_audit_reported'], data: { definitions: definitions.length } };
  }

  async function verifySkillAction(skillName = 'status') {
    return runSkillAction(skillName, {}, { sender: config.ownerUsername, source: 'evidence_verify', force: true });
  }


  return {
    categorySkillLine,
    skillsStatusAction,
    skillStatusAction,
    unimplementedSkillsAction,
    riskySkillsAction,
    skillAuditAction,
    normalizeSkillRunnerName,
    runSkillAction,
    activeSkillAction,
    skillRunnerStatusAction,
    cancelSkillAction,
    skillStatsAction,
    recentSkillsAction,
    evidenceStatusAction,
    skillEvidenceAction,
    recentEvidenceAction,
    evidenceDefinitionsAction,
    evidenceAuditAction,
    verifySkillAction
  };
}
