import { ACTION_SCHEMA, callOllama } from './ollama.js';
import { createTemplateGoal, normalizeTemplateName } from './goalTemplates.js';
import { validateGoal } from './goalValidator.js';
import { llm } from './logger.js';

export const PLANNER_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: ['suggest_goals', 'create_goal', 'revise_goal', 'explain', 'none'] },
    speak: { type: 'string' },
    goals: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['mining', 'base', 'food', 'survival', 'exploration', 'combat', 'nether_prep', 'custom'] },
          priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
          description: { type: 'string' },
          reason: { type: 'string' },
          riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
          requiresConfirmation: { type: 'boolean' },
          steps: {
            type: 'array',
            maxItems: 12,
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                action: { type: 'string' },
                args: { type: 'object' },
                riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
                requiresConfirmation: { type: 'boolean' },
                successCriteria: {
                  type: 'object',
                  properties: {
                    type: { type: 'string' },
                    description: { type: 'string' }
                  },
                  required: ['type', 'description'],
                  additionalProperties: false
                }
              },
              required: ['description', 'action', 'args', 'riskLevel', 'requiresConfirmation', 'successCriteria'],
              additionalProperties: false
            }
          }
        },
        required: ['name', 'type', 'priority', 'description', 'reason', 'riskLevel', 'requiresConfirmation', 'steps'],
        additionalProperties: false
      }
    }
  },
  required: ['intent', 'speak', 'goals'],
  additionalProperties: false
};

const fallback = { intent: 'none', speak: 'I could not make a safe plan from that.', goals: [] };

function stripThinking(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function extractJsonObject(text) {
  const clean = stripThinking(text);
  const first = clean.indexOf('{');
  if (first < 0) throw new Error('no JSON object found');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = first; i < clean.length; i += 1) {
    const ch = clean[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) return clean.slice(first, i + 1);
  }
  throw new Error('unterminated JSON object');
}

export function normalizePlannerOutput(output, config = {}) {
  if (!output || typeof output !== 'object') return fallback;
  const goals = Array.isArray(output.goals)
    ? output.goals.slice(0, 3).map((goal) => validateGoal(goal, config)).filter((result) => result.ok).map((result) => result.goal)
    : [];
  return {
    intent: typeof output.intent === 'string' ? output.intent : 'none',
    speak: typeof output.speak === 'string' ? output.speak.slice(0, 220) : '',
    goals
  };
}

export async function callPlannerModel(config, messages, schema = PLANNER_SCHEMA) {
  try {
    const result = await callOllama({
      config,
      role: 'planner',
      messages,
      schema: schema || ACTION_SCHEMA,
      json: true,
      options: { temperature: 0, numPredict: 700 }
    });
    if (!result.ok) throw result.error || new Error(result.reason || 'Planner model failed');
    return normalizePlannerOutput(result.json, config);
  } catch (error) {
    llm(`[strategicPlanner] bad planner output: ${String(error.message).slice(0, 500)}`);
    return fallback;
  }
}

function templateFromRequest(request) {
  const lower = String(request || '').toLowerCase();
  if (/night/.test(lower)) return 'prepare_for_night';
  if (/improve|base|workstation|storage/.test(lower)) return 'improve_base';
  if (/mining|mine/.test(lower)) return 'prepare_for_mining';
  if (/iron/.test(lower)) return 'get_iron_gear';
  if (/food|farm|hunger/.test(lower)) return 'food_security';
  if (/stockpile|resources|wood|stone|coal/.test(lower)) return 'stockpile_resources';
  if (/secure|safe|guard|defend/.test(lower)) return 'secure_base';
  if (/nether/.test(lower)) return 'prepare_for_nether';
  return null;
}

export async function createPlanFromRequest(bot, memory, request, context = {}) {
  const templateName = templateFromRequest(request);
  if (templateName) return { intent: 'create_goal', speak: '', goals: [validateGoal(createTemplateGoal(templateName, context), bot.mcaiConfig || {}).goal].filter(Boolean) };

  const state = context.perception || {};
  return callPlannerModel(bot.mcaiConfig || context.config || {}, [
    {
      role: 'system',
      content: 'Create safe Minecraft long-term goals only from implemented capabilities. Return schema JSON only. Do not include raw movement/dig/attack/place commands. Nether preparation is implemented; portal lighting and safe Nether entry require confirmation, while Nether exploration, Nether mining, fortress search, and bastion search remain blocked in this phase. Do not include PVP, deep mining, caving, diamonds, or major builds unless the step requires confirmation. Actual execution is deterministic code.'
    },
    {
      role: 'user',
      content: `Owner request: ${request}\nKnown template aliases include ${normalizeTemplateName(request)}.\nState: ${JSON.stringify(state).slice(0, 3500)}`
    }
  ]);
}

export async function suggestGoals(bot, memory, mapMemory, goals, perception) {
  return callPlannerModel(bot.mcaiConfig || {}, [
    {
      role: 'system',
      content: 'Suggest up to three practical safe Minecraft goals using only implemented capabilities. Prefer food, safety, tools, base, storage, mining prep, farming, exploration, then Nether preparation. Return schema JSON only.'
    },
    {
      role: 'user',
      content: `Memory: ${JSON.stringify(memory.get()).slice(0, 1500)}\nMap: ${JSON.stringify(mapMemory).slice(0, 1000)}\nGoals: ${JSON.stringify(goals).slice(0, 1500)}\nState: ${JSON.stringify(perception).slice(0, 2500)}`
    }
  ]);
}

export async function reviseGoalPlan(goal, feedback, context = {}) {
  return callPlannerModel(context.config || {}, [
    { role: 'system', content: 'Revise a safe Minecraft goal while keeping only implemented capabilities. Return schema JSON only.' },
    { role: 'user', content: `Goal: ${JSON.stringify(goal)}\nFeedback: ${feedback}` }
  ]);
}

export function explainStrategicPriorities(_bot, _memory, perception = {}) {
  const needs = [];
  if (perception.needsFood) needs.push('food');
  if (perception.needsBaseLighting) needs.push('base lighting');
  if (perception.needsStorage) needs.push('storage');
  if (perception.needsMiningSupplies) needs.push('mining supplies');
  return needs.length ? `The practical priorities are ${needs.join(', ')}.` : 'The base looks stable enough for a planned next goal.';
}
