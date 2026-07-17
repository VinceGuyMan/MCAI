import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSkills, generateSkillSummary } from '../bot/skillRegistry.js';
import { getProgressionMilestones } from '../bot/progressionRegistry.js';
import { loadProgressionState } from '../bot/progressionState.js';
import {
  buildDashboardState,
  getBotStatus,
  getCommandsSummary,
  getCompetencyDashboardStatus,
  getConversationMemorySummary,
  getCurriculumStatus,
  getAnvilDashboardStatus,
  getBrewingDashboardStatus,
  getEnchantingDashboardStatus,
  getGearDashboardStatus,
  getGearUpgradeDashboardStatus,
  getBlueprintDashboardStatus,
  getBlueprintMaterialsDashboardStatus,
  getBlueprintPreviewDashboardStatus,
  getGoalStatus,
  getInventorySummary,
  getIdleAutonomyDashboardStatus,
  getMapMemorySummary,
  getMemorySummary,
  getNaturalRoutingDashboardStatus,
  getOllamaStatus,
  getProgressionStatus,
  getPotionDashboardStatus,
  getVillagerDashboardStatus,
  getVillageDashboardStatus,
  getTradingDashboardStatus,
  getEconomyDashboardStatus,
  getRecentCurriculumRuns,
  getRecentEvidence,
  getRecentLogs,
  getSessionEventsDashboardStatus,
  getRecentSkillRuns,
  getSafetyStatus,
  getServerBridgeDashboardEvents,
  getServerBridgeDashboardHealth,
  getServerBridgeDashboardPlayers,
  getServerBridgeDashboardRegions,
  getServerBridgeDashboardStatus,
  getServerStatus,
  getSkillMemorySummary,
  getSkillStatus,
  getTaskStatus
} from './dashboardState.js';
import {
  dashboardApproveCurriculum,
  dashboardCancelCurriculum,
  dashboardCancelGoal,
  dashboardPauseGoal,
  dashboardResumeGoal,
  dashboardRunCurriculumStep,
  dashboardRunSkill,
  dashboardStopAll
} from './dashboardControl.js';
import {
  assertLocalRequest,
  sanitizeDashboardOutput,
  validateApiRequest,
  validateControlRequest,
  validateDashboardConfig,
  writeJson
} from './dashboardSecurity.js';
import {
  getLlmSettings,
  listProviderModels,
  runSetupChecklist,
  saveLlmSettings,
  testLlmChat
} from './setupService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function normalizeUrl(req) {
  return new URL(req.url || '/', 'http://127.0.0.1');
}

function sendJson(res, statusCode, payload) {
  writeJson(res, statusCode, sanitizeDashboardOutput(payload));
}

function sendNotFound(res) {
  sendJson(res, 404, { ok: false, reason: 'Not found.' });
}

async function parseJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error('Request body too large.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text ? JSON.parse(text) : {};
}

async function runDashboardAction(actions, actionName, args = {}, context = {}) {
  if (typeof actions?.executeAction !== 'function') return { ok: false, reason: 'Actions are unavailable.' };
  return actions.executeAction(actionName, args, {
    ...context,
    source: 'dashboard',
    sender: context.config?.ownerUsername || 'ModVinny',
    username: context.config?.ownerUsername || 'ModVinny',
    isOwner: true,
    confirmed: context.confirmed === true
  });
}

function serveStatic(req, res) {
  const url = normalizeUrl(req);
  const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const requested = path.normalize(path.join(publicDir, pathname));
  if (!requested.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }
  if (!fs.existsSync(requested) || !fs.statSync(requested).isFile()) return false;
  const ext = path.extname(requested);
  res.writeHead(200, {
    'content-type': CONTENT_TYPES[ext] || 'application/octet-stream',
    'cache-control': 'no-store'
  });
  fs.createReadStream(requested).pipe(res);
  return true;
}

function routeContext(context) {
  return {
    bot: context.bot || null,
    memory: context.memory || null,
    config: context.config || context.bot?.mcaiConfig || {},
    actions: context.actions || context.bot?.mcaiActions || null,
    cancellation: context.cancellation || context.bot?.mcaiCancellation || null,
    logger: context.logger || console
  };
}

async function handleGet(req, res, context) {
  const { bot, memory, config } = routeContext(context);
  const url = normalizeUrl(req);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 50, Number(config.dashboardLogLimit) || 200));

  switch (url.pathname) {
    case '/api/status':
      return sendJson(res, 200, { ok: true, data: await buildDashboardState(bot, memory, { config }) });
    case '/api/bot':
      return sendJson(res, 200, { ok: true, data: getBotStatus(bot, memory) });
    case '/api/safety':
      return sendJson(res, 200, { ok: true, data: getSafetyStatus(bot, memory) });
    case '/api/inventory':
      return sendJson(res, 200, { ok: true, data: getInventorySummary(bot) });
    case '/api/task':
      return sendJson(res, 200, { ok: true, data: getTaskStatus(memory) });
    case '/api/skills':
      return sendJson(res, 200, { ok: true, data: { summary: generateSkillSummary(), status: getSkillStatus(memory), skills: getSkills() } });
    case '/api/skills/recent':
      return sendJson(res, 200, { ok: true, data: getRecentSkillRuns(20) });
    case '/api/evidence/recent':
      return sendJson(res, 200, { ok: true, data: getRecentEvidence(20) });
    case '/api/curriculum':
      return sendJson(res, 200, { ok: true, data: getCurriculumStatus(memory) });
    case '/api/curriculum/recent':
      return sendJson(res, 200, { ok: true, data: getRecentCurriculumRuns(20) });
    case '/api/goals':
      return sendJson(res, 200, { ok: true, data: getGoalStatus(memory) });
    case '/api/progression':
      return sendJson(res, 200, { ok: true, data: getProgressionStatus(bot, memory) });
    case '/api/progression/milestones':
      {
        const progressionState = loadProgressionState();
        const milestones = getProgressionMilestones().map((milestone) => ({
          ...milestone,
          status: progressionState.completedMilestones?.[milestone.id]
            ? 'completed'
            : progressionState.blockedMilestones?.[milestone.id]
              ? 'blocked'
              : milestone.implemented ? 'incomplete' : 'future'
        }));
        return sendJson(res, 200, { ok: true, data: milestones });
      }
    case '/api/progression/next':
      return sendJson(res, 200, { ok: true, data: getProgressionStatus(bot, memory).suggestions });
    case '/api/progression/paths':
      return sendJson(res, 200, { ok: true, data: getProgressionStatus(bot, memory).paths });
    case '/api/progression/history':
      return sendJson(res, 200, { ok: true, data: getProgressionStatus(bot, memory).history });
    case '/api/gear':
      return sendJson(res, 200, { ok: true, data: getGearDashboardStatus(bot, memory) });
    case '/api/gear/upgrades':
      return sendJson(res, 200, { ok: true, data: getGearUpgradeDashboardStatus(bot) });
    case '/api/enchanting':
      return sendJson(res, 200, { ok: true, data: getEnchantingDashboardStatus(bot, memory) });
    case '/api/anvil':
      return sendJson(res, 200, { ok: true, data: getAnvilDashboardStatus(bot, memory) });
    case '/api/potions':
      return sendJson(res, 200, { ok: true, data: getPotionDashboardStatus(bot, memory) });
    case '/api/brewing':
      return sendJson(res, 200, { ok: true, data: getBrewingDashboardStatus(bot, memory) });
    case '/api/villagers':
      return sendJson(res, 200, { ok: true, data: getVillagerDashboardStatus(bot, memory) });
    case '/api/villages':
      return sendJson(res, 200, { ok: true, data: getVillageDashboardStatus() });
    case '/api/trades':
      return sendJson(res, 200, { ok: true, data: getTradingDashboardStatus(bot, memory) });
    case '/api/economy':
      return sendJson(res, 200, { ok: true, data: getEconomyDashboardStatus(bot, memory) });
    case '/api/trade-history':
      return sendJson(res, 200, { ok: true, data: getEconomyDashboardStatus(bot, memory).tradeHistory });
    case '/api/blueprints':
    case '/api/blueprints/status':
      return sendJson(res, 200, { ok: true, data: getBlueprintDashboardStatus(bot, memory) });
    case '/api/blueprints/history':
      return sendJson(res, 200, { ok: true, data: getBlueprintDashboardStatus(bot, memory).history });
    case '/api/blueprints/active':
      return sendJson(res, 200, { ok: true, data: getBlueprintDashboardStatus(bot, memory).activeBuild });
    case '/api/map':
      return sendJson(res, 200, { ok: true, data: getMapMemorySummary() });
    case '/api/memory':
      return sendJson(res, 200, { ok: true, data: getMemorySummary() });
    case '/api/memory/conversation':
      return sendJson(res, 200, { ok: true, data: getConversationMemorySummary() });
    case '/api/logs':
      return sendJson(res, 200, { ok: true, data: getRecentLogs(limit) });
    case '/api/commands':
      return sendJson(res, 200, { ok: true, data: getCommandsSummary() });
    case '/api/natural-routing':
      return sendJson(res, 200, { ok: true, data: getNaturalRoutingDashboardStatus(memory) });
    case '/api/competency':
      return sendJson(res, 200, { ok: true, data: getCompetencyDashboardStatus() });
    case '/api/session-events':
      return sendJson(res, 200, { ok: true, data: getSessionEventsDashboardStatus(limit) });
    case '/api/idle-autonomy':
      return sendJson(res, 200, { ok: true, data: getIdleAutonomyDashboardStatus(memory, config) });
    case '/api/doctor':
      return sendJson(res, 200, { ok: true, data: { dashboard: validateDashboardConfig(config), skillMemory: getSkillMemorySummary() } });
    case '/api/setup':
      return sendJson(res, 200, {
        ok: true,
        data: {
          llm: getLlmSettings(config),
          botLinked: Boolean(bot),
          ownerUsername: config.ownerUsername,
          botUsername: config.botUsername,
          minecraftVersion: config.minecraftVersion,
          host: config.host,
          port: config.port
        }
      });
    case '/api/setup/checklist':
      return sendJson(res, 200, {
        ok: true,
        data: await runSetupChecklist({ config, bot, memory })
      });
    case '/api/setup/models': {
      const provider = url.searchParams.get('provider') || config.llmProvider || 'ollama';
      const baseUrl = url.searchParams.get('baseUrl') || config.ollamaUrl;
      return sendJson(res, 200, { ok: true, data: await listProviderModels({ provider, baseUrl }) });
    }
    case '/api/ollama':
      return sendJson(res, 200, { ok: true, data: await getOllamaStatus(config) });
    case '/api/server':
      return sendJson(res, 200, { ok: true, data: await getServerStatus(config) });
    case '/api/server-bridge/status':
      return sendJson(res, 200, { ok: true, data: await getServerBridgeDashboardStatus(config) });
    case '/api/server-bridge/events':
      return sendJson(res, 200, { ok: true, data: await getServerBridgeDashboardEvents(config) });
    case '/api/server-bridge/regions':
      return sendJson(res, 200, { ok: true, data: await getServerBridgeDashboardRegions(config) });
    case '/api/server-bridge/players':
      return sendJson(res, 200, { ok: true, data: await getServerBridgeDashboardPlayers(config) });
    case '/api/server-bridge/health':
      return sendJson(res, 200, { ok: true, data: await getServerBridgeDashboardHealth(config) });
    default:
      if (url.pathname.startsWith('/api/blueprints/preview/')) {
        const id = decodeURIComponent(url.pathname.replace('/api/blueprints/preview/', ''));
        return sendJson(res, 200, { ok: true, data: getBlueprintPreviewDashboardStatus(bot, memory, id) });
      }
      if (url.pathname.startsWith('/api/blueprints/materials/')) {
        const id = decodeURIComponent(url.pathname.replace('/api/blueprints/materials/', ''));
        return sendJson(res, 200, { ok: true, data: getBlueprintMaterialsDashboardStatus(bot, memory, id) });
      }
      return sendNotFound(res);
  }
}

async function handlePost(req, res, context) {
  const { bot, memory, config, actions, cancellation } = routeContext(context);
  if (!validateControlRequest(req, res, config)) return;

  let body = {};
  try {
    body = await parseJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, { ok: false, reason: error.message });
  }

  const url = normalizeUrl(req);

  // Setup LLM routes are safe config writes (not bot motion/combat controls).
  if (url.pathname === '/api/setup/llm') {
    try {
      const result = saveLlmSettings({
        provider: body.provider,
        baseUrl: body.baseUrl,
        ollamaModel: body.ollamaModel || body.models?.default,
        models: body.models
      });
      if (context.config) {
        Object.assign(context.config, {
          llmProvider: result.settings.provider,
          ollamaUrl: result.settings.baseUrl,
          ollamaModel: result.settings.ollamaModel,
          models: result.settings.models
        });
      }
      if (bot?.mcaiConfig) {
        Object.assign(bot.mcaiConfig, {
          llmProvider: result.settings.provider,
          ollamaUrl: result.settings.baseUrl,
          ollamaModel: result.settings.ollamaModel,
          models: result.settings.models
        });
      }
      return sendJson(res, 200, result);
    } catch (error) {
      return sendJson(res, 500, { ok: false, reason: error.message });
    }
  }
  if (url.pathname === '/api/setup/test-llm') {
    return sendJson(res, 200, await testLlmChat({
      provider: body.provider || config.llmProvider,
      baseUrl: body.baseUrl || config.ollamaUrl,
      model: body.model || config.models?.default || config.ollamaModel
    }));
  }

  if (config.dashboardAllowControl === false) {
    return sendJson(res, 403, { ok: false, reason: 'Dashboard control is disabled.' });
  }

  const controlContext = { config, actions, cancellation, reason: body.reason || 'dashboard control', confirmed: body.confirmed === true };

  switch (url.pathname) {
    case '/api/control/stop':
      if (config.dashboardAllowStopButton === false) return sendJson(res, 403, { ok: false, reason: 'Dashboard stop button is disabled.' });
      return sendJson(res, 200, dashboardStopAll(bot, memory, controlContext));
    case '/api/control/pause':
      if (config.dashboardAllowStopButton === false) return sendJson(res, 403, { ok: false, reason: 'Dashboard stop button is disabled.' });
      return sendJson(res, 200, dashboardStopAll(bot, memory, { ...controlContext, reason: body.reason || 'dashboard pause' }));
    case '/api/control/resume':
      cancellation?.resetCancellation?.();
      return sendJson(res, 200, { ok: true, message: 'Cancellation state reset.' });
    case '/api/control/run-skill':
      return sendJson(res, 200, await dashboardRunSkill(bot, memory, body.skillName, body.args || {}, controlContext));
    case '/api/control/approve-curriculum':
      return sendJson(res, 200, dashboardApproveCurriculum(bot, memory, body.name || body.skillName || body.trackName, controlContext));
    case '/api/control/run-curriculum-step':
      return sendJson(res, 200, await dashboardRunCurriculumStep(bot, memory, controlContext));
    case '/api/control/cancel-curriculum':
      return sendJson(res, 200, dashboardCancelCurriculum(bot, memory, controlContext));
    case '/api/control/goal/pause':
      return sendJson(res, 200, dashboardPauseGoal(bot, memory, body.goalName, controlContext));
    case '/api/control/goal/resume':
      return sendJson(res, 200, dashboardResumeGoal(bot, memory, body.goalName, controlContext));
    case '/api/control/goal/cancel':
      return sendJson(res, 200, dashboardCancelGoal(bot, memory, body.goalName, controlContext));
    case '/api/blueprints/plan':
      return sendJson(res, 200, await runDashboardAction(actions, 'blueprintPlan', { blueprintId: body.blueprintId || body.name || 'starter_workstation' }, controlContext));
    case '/api/blueprints/confirm':
      return sendJson(res, 200, await runDashboardAction(actions, 'blueprintStartBuild', {}, controlContext));
    case '/api/blueprints/continue':
      return sendJson(res, 200, await runDashboardAction(actions, 'blueprintContinueBuild', {}, controlContext));
    case '/api/blueprints/pause':
      return sendJson(res, 200, await runDashboardAction(actions, 'blueprintPauseBuild', { _positional: ['dashboard pause'] }, controlContext));
    case '/api/blueprints/cancel':
      return sendJson(res, 200, await runDashboardAction(actions, 'blueprintCancelBuild', { _positional: ['dashboard cancel'] }, controlContext));
    case '/api/server-bridge/emergency-stop':
      return sendJson(res, 200, await runDashboardAction(actions, 'bridgeEmergencyStop', { _positional: [body.reason || 'dashboard bridge emergency stop'] }, controlContext));
    case '/api/server-bridge/register-region':
      return sendJson(res, 200, await runDashboardAction(actions, 'bridgeRegisterRegion', { type: body.type || 'home' }, controlContext));
    case '/api/idle-autonomy/on':
      return sendJson(res, 200, await runDashboardAction(actions, 'idleOn', {}, controlContext));
    case '/api/idle-autonomy/off':
      return sendJson(res, 200, await runDashboardAction(actions, 'idleOff', {}, controlContext));
    case '/api/idle-autonomy/quiet':
      return sendJson(res, 200, await runDashboardAction(actions, 'quietIdle', {}, controlContext));
    case '/api/idle-autonomy/chatty':
      return sendJson(res, 200, await runDashboardAction(actions, 'chattyIdle', {}, controlContext));
    default:
      return sendNotFound(res);
  }
}

export function createDashboardRequestHandler(context = {}) {
  return async function dashboardRequestHandler(req, res) {
    try {
      const { config } = routeContext(context);
      if (config.dashboardLocalOnly !== false && !assertLocalRequest(req)) {
        return sendJson(res, 403, { ok: false, reason: 'Dashboard is local-only.' });
      }
      const url = normalizeUrl(req);
      if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
        if (serveStatic(req, res)) return;
      }
      if (req.method === 'GET') {
        if (url.pathname.startsWith('/api/') && !validateApiRequest(req, res, config)) return;
        return await handleGet(req, res, context);
      }
      if (req.method === 'POST') return await handlePost(req, res, context);
      return sendJson(res, 405, { ok: false, reason: 'Method not allowed.' });
    } catch (error) {
      context.logger?.error?.('[dashboard]', error.stack || error.message);
      return sendJson(res, 500, { ok: false, reason: 'Dashboard request failed.' });
    }
  };
}
