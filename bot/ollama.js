import { reserveOllamaCall, runExclusiveOllamaCall } from './llmRateLimit.js';
import { llm } from './logger.js';
import { resolveLlmMode, isLlmDialogueAllowed } from './llmMode.js';

export const ACTION_SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: ['chat', 'command', 'task', 'survival', 'status', 'none']
    },
    speak: { type: 'string' },
    priority: {
      type: 'string',
      enum: ['low', 'normal', 'high', 'emergency']
    },
    actions: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'stop',
              'status',
              'come_to_owner',
              'follow_owner',
              'stay',
              'look_at_owner',
              'gather_wood',
              'find_tree',
              'dig_nearest_safe_block',
              'collect_drops',
              'equip_best_tool',
              'eat_if_hungry',
              'flee_danger',
              'stay_near_friendly_players',
              'answer_chat',
              'craft_item',
              'craft_lighting',
              'craft_storage',
              'craft_shelter_supplies',
              'craft_utility_items',
              'craft_travel_items',
              'craft_building_blocks',
              'craft_survival_kit',
              'crafting_status',
              'can_craft_item',
              'craft_basic_tools',
              'craft_stone_tools',
              'place_crafting_table',
              'armor_status',
              'equip_best_armor',
              'craft_best_affordable_armor',
              'craft_iron_armor',
              'craft_leather_armor',
              'ensure_armored_for_survival',
              'food_status',
              'eat_if_hungry',
              'find_food',
              'get_food',
              'make_food',
              'cook_food',
              'craft_food',
              'gather_plant_food',
              'fish_for_food',
              'set_home',
              'home_status',
              'return_home',
              'build_camp',
              'build_workstation',
              'build_shelter',
              'light_home',
              'storage_status',
              'store_items',
              'withdraw_item',
              'bring_item_to_owner',
              'resource_status',
              'resource_run_wood',
              'resource_run_stone',
              'resource_run_coal',
              'resource_run_food',
              'base_maintenance',
              'farming_status',
              'create_farm',
              'maintain_farm',
              'harvest_crops',
              'replant_crops',
              'plant_crop',
              'animal_pen_status',
              'create_animal_pen',
              'lure_animal_to_pen',
              'breed_animals',
              'feed_animals',
              'collect_eggs',
              'shear_sheep',
              'milk_cow',
              'store_farm_items',
              'stop_farming',
              'stop_animal_task',
              'mining_status',
              'mining_tool_status',
              'scan_ores',
              'mine_stone',
              'mine_coal',
              'mine_iron',
              'mine_copper',
              'mine_redstone',
              'mine_lapis',
              'mine_gold',
              'mine_diamond',
              'create_staircase_mine',
              'create_branch_mine',
              'return_from_mine',
              'deposit_mining_loot',
              'stop_mining',
              'exploration_status',
              'map_status',
              'scan_area',
              'remember_location',
              'forget_location',
              'list_known_places',
              'go_to_waypoint',
              'scout_direction',
              'explore_around_home',
              'explore_around_owner',
              'record_route',
              'stop_route_recording',
              'follow_route',
              'known_biomes',
              'known_resources',
              'known_danger_zones',
              'return_from_exploration',
              'stop_exploration',
              'combat_status',
              'combat_equipment_status',
              'threat_scan',
              'start_self_defense',
              'defend_owner',
              'guard_base',
              'guard_position',
              'stop_combat',
              'flee_threat',
              'engage_hostile',
              'equip_combat_gear',
              'combat_recover',
              'base_defense_status',
              'owner_defense_status',
              'goals_status',
              'list_goals',
              'create_goal',
              'create_goal_from_template',
              'suggest_goals',
              'explain_goal',
              'start_goal',
              'pause_goal',
              'resume_goal',
              'cancel_goal',
              'next_goal_step',
              'execute_next_goal_step',
              'approve_goal',
              'reject_goal',
              'nether_status',
              'nether_checklist',
              'prepare_nether',
              'prepare_nether_gear',
              'prepare_nether_food',
              'prepare_nether_blocks',
              'prepare_nether_portal_supplies',
              'equip_nether_gear',
              'portal_status',
              'build_portal',
              'light_portal',
              'safe_nether_entry',
              'scan_nether',
              'return_from_nether',
              'nether_memory_status',
              'stop_nether_task',
              'dialogue_status',
              'set_talk_mode',
              'set_banter_mode',
              'personality_status',
              'conversation_memory_status',
              'remember_conversation_fact',
              'forget_conversation_fact',
              'clear_conversation_memory_confirmed',
              'answer_dialogue',
              'ask_clarification',
              'none'
            ]
          },
          target: { type: 'string' },
          block: { type: 'string' },
          item: { type: 'string' },
          count: { type: 'integer', minimum: 1, maximum: 64 },
          reason: { type: 'string' }
        },
        required: ['action'],
        additionalProperties: false
      }
    }
  },
  required: ['intent', 'speak', 'priority', 'actions'],
  additionalProperties: false
};

const fallbackPlan = {
  intent: 'none',
  speak: "I didn't understand that.",
  priority: 'normal',
  actions: []
};

export const MODEL_ROLES = ['default', 'commandRouter', 'planner', 'dialogue', 'codingStructured', 'codingHeavy', 'fastFallback', 'legacyFallback'];
export const FALLBACK_MODEL = 'phi4-mini:latest';

const defaultModels = {
  default: 'gemma2-2b-local:latest',
  commandRouter: 'gemma2-2b-local:latest',
  planner: 'gemma2-2b-local:latest',
  dialogue: 'gemma2-2b-local:latest',
  codingStructured: 'gemma2-2b-local:latest',
  codingHeavy: 'gemma2-2b-local:latest',
  fastFallback: 'gemma2-2b-local:latest',
  legacyFallback: 'gemma2-2b-local:latest'
};

const defaultModelOptions = {
  default: { temperature: 0, stream: false, think: false, timeoutMs: 20000, numPredict: 100 },
  commandRouter: { temperature: 0, stream: false, think: false, timeoutMs: 20000, numPredict: 100 },
  planner: { temperature: 0, stream: false, think: false, timeoutMs: 20000, numPredict: 100 },
  dialogue: { temperature: 0.7, stream: false, think: false, timeoutMs: 25000, numPredict: 120 },
  codingStructured: { temperature: 0, stream: false, think: false, timeoutMs: 20000, numPredict: 100 },
  codingHeavy: { temperature: 0, stream: false, think: false, timeoutMs: 20000, numPredict: 100 },
  fastFallback: { temperature: 0.4, stream: false, think: false, timeoutMs: 15000, numPredict: 80 },
  legacyFallback: { temperature: 0, stream: false, think: false, timeoutMs: 15000, numPredict: 80 }
};

const missingModelUntil = new Map();
const MISSING_MODEL_RETRY_MS = 300000;

function isMissingModelError(error) {
  return /model ['"][^'"]+['"] not found|not found/i.test(String(error?.message || ''));
}

export function stripThinking(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

export function extractJsonObject(text) {
  const clean = stripThinking(text);
  const first = clean.indexOf('{');
  if (first === -1) throw new Error('no JSON object found');

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = first; i < clean.length; i++) {
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

export function resolveModelRole(config = {}, requestedRole = 'default', explicitModel = null) {
  const role = MODEL_ROLES.includes(requestedRole) ? requestedRole : 'default';
  const models = { ...defaultModels, ...(config.models || {}) };
  const model = explicitModel || models[role] || models.default || config.ollamaModel || FALLBACK_MODEL;
  return {
    requestedRole: requestedRole || 'default',
    role,
    model: model || FALLBACK_MODEL,
    fallbackModel: models.fastFallback || models.legacyFallback || FALLBACK_MODEL
  };
}

function resolveRoleOptions(config = {}, role = 'default', callerOptions = {}) {
  const configured = {
    ...(defaultModelOptions.default || {}),
    ...(defaultModelOptions[role] || {}),
    ...((config.modelOptions || {})[role] || {})
  };
  const stream = callerOptions.stream === true && callerOptions.allowStream === true
    ? true
    : false;
  return {
    ...configured,
    ...callerOptions,
    stream,
    think: callerOptions.think === true && callerOptions.allowThink === true ? true : false,
    temperature: callerOptions.temperature ?? configured.temperature ?? 0,
    numPredict: callerOptions.numPredict ?? callerOptions.num_predict ?? configured.numPredict ?? configured.num_predict ?? 160,
    timeoutMs: callerOptions.timeoutMs ?? configured.timeoutMs ?? 120000
  };
}

function validateJsonAgainstSchema(value, schema) {
  if (!schema || typeof schema !== 'object') return { ok: true };
  if (schema.type === 'object' && (!value || typeof value !== 'object' || Array.isArray(value))) {
    return { ok: false, reason: 'expected JSON object' };
  }
  if (Array.isArray(schema.required)) {
    for (const key of schema.required) {
      if (!Object.hasOwn(value, key)) return { ok: false, reason: `missing required JSON field ${key}` };
    }
  }
  if (schema.properties && value && typeof value === 'object') {
    for (const [key, propertySchema] of Object.entries(schema.properties)) {
      if (!Object.hasOwn(value, key) || value[key] === null || value[key] === undefined) continue;
      const actual = value[key];
      if (propertySchema.type === 'string' && typeof actual !== 'string') return { ok: false, reason: `${key} should be string` };
      if (propertySchema.type === 'boolean' && typeof actual !== 'boolean') return { ok: false, reason: `${key} should be boolean` };
      if (propertySchema.type === 'number' && typeof actual !== 'number') return { ok: false, reason: `${key} should be number` };
      if (propertySchema.type === 'integer' && !Number.isInteger(actual)) return { ok: false, reason: `${key} should be integer` };
      if (propertySchema.type === 'array' && !Array.isArray(actual)) return { ok: false, reason: `${key} should be array` };
      if (propertySchema.enum && !propertySchema.enum.includes(actual)) return { ok: false, reason: `${key} has unsupported value ${actual}` };
    }
  }
  return { ok: true };
}

function safeJsonResult(content, schema = null) {
  try {
    const json = JSON.parse(extractJsonObject(content));
    const validation = validateJsonAgainstSchema(json, schema);
    if (!validation.ok) return { ok: false, reason: `Ollama returned schema-invalid JSON: ${validation.reason}`, error: null };
    return { ok: true, json };
  } catch (error) {
    return {
      ok: false,
      reason: `Ollama returned invalid JSON: ${error.message}`,
      error
    };
  }
}

export async function callOllama({ config = {}, role = 'default', messages = [], schema = null, json = false, options = {} } = {}) {
  // Hard gate: llmMode off blocks all model calls. Dialogue-only blocks non-dialogue roles.
  const mode = resolveLlmMode(config);
  if (mode === 'off') {
    return { ok: false, reason: 'LLM mode is off (code-only companion)', error: new Error('llmMode=off') };
  }
  if (mode === 'dialogue' && role !== 'dialogue' && role !== 'fastFallback') {
    return { ok: false, reason: 'LLM mode is dialogue-only; this role is disabled', error: new Error('llmMode=dialogue') };
  }
  if (role === 'dialogue' && !isLlmDialogueAllowed(config)) {
    return { ok: false, reason: 'LLM dialogue is not allowed', error: new Error('llm dialogue disabled') };
  }

  const resolved = resolveModelRole(config, role, options.model || null);
  const roleOptions = resolveRoleOptions(config, resolved.role, options);
  const modelsToTry = [resolved.model];
  // In dialogue mode do not thrash-load a different fallback model.
  const allowFallback = roleOptions.disableFallback !== true
    && config.llmMode !== 'dialogue'
    && resolved.fallbackModel
    && resolved.fallbackModel !== resolved.model;
  if (allowFallback) modelsToTry.push(resolved.fallbackModel);
  const attemptsPerModel = Math.max(1, Math.min(2, Number(roleOptions.attempts || 2)));

  await reserveOllamaCall(config);
  return runExclusiveOllamaCall(async () => {
  let lastError = null;

  for (const model of modelsToTry) {
    const unavailableUntil = missingModelUntil.get(model) || 0;
    if (unavailableUntil > Date.now()) {
      lastError = new Error(`Ollama model ${model} was recently reported missing`);
      llm(`[ollama] role=${resolved.requestedRole} model=${model} skipped: recently missing`);
      continue;
    }

    const body = {
      model,
      messages,
      stream: roleOptions.stream,
      think: roleOptions.think,
      options: {
        temperature: roleOptions.temperature,
        num_predict: roleOptions.numPredict
      }
    };
    if (roleOptions.keepAlive !== undefined) body.keep_alive = roleOptions.keepAlive;
    if (schema) body.format = schema;
    else if (json || roleOptions.json) body.format = 'json';

    llm(`[ollama] role=${resolved.requestedRole} resolvedRole=${resolved.role} model=${model}`);

    const provider = String(config.llmProvider || 'ollama').toLowerCase();
    const apiStyle = provider === 'lmstudio' || provider === 'openai_compatible' || provider === 'openai' ? 'openai' : 'ollama';
    const baseUrl = String(config.ollamaUrl || 'http://127.0.0.1:11434').replace(/\/$/, '');

    let payload;
    for (let attempt = 0; attempt < attemptsPerModel; attempt += 1) {
      const controller = new AbortController();
      let timer = null;
      try {
        timer = setTimeout(() => {
          controller.abort();
        }, roleOptions.timeoutMs);

        let response;
        if (apiStyle === 'openai') {
          const openAiBody = {
            model,
            messages,
            temperature: roleOptions.temperature,
            stream: false,
            max_tokens: roleOptions.numPredict || 1024
          };
          if (schema || json || roleOptions.json) {
            openAiBody.response_format = { type: 'json_object' };
          }
          response = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify(openAiBody)
          });
        } else {
          response = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify(body)
          });
        }
        if (!response?.ok) {
          const detail = response ? (await response.text()).slice(0, 500) : 'no response';
          throw new Error(`LLM HTTP ${response?.status || 'unknown'}: ${detail}`);
        }
        payload = await response.json();
        // Normalize OpenAI-compatible response into Ollama-like shape
        if (apiStyle === 'openai' && !payload.message) {
          payload = {
            message: {
              content: payload.choices?.[0]?.message?.content || ''
            }
          };
        }
        lastError = null;
        break;
      } catch (error) {
        lastError = error?.name === 'AbortError'
          ? new Error(`LLM ${model} timed out after ${roleOptions.timeoutMs}ms`)
          : error;
        if (isMissingModelError(lastError)) missingModelUntil.set(model, Date.now() + (config.missingModelRetryMs || MISSING_MODEL_RETRY_MS));
        if (attempt === attemptsPerModel - 1) break;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    if (lastError) {
      llm(`[ollama] role=${resolved.requestedRole} model=${model} failed: ${lastError.message}`);
      continue;
    }

    try {
      const content = stripThinking(payload.message?.content || '');
      if (schema || json || roleOptions.json) {
        const parsed = safeJsonResult(content, schema);
        if (!parsed.ok) {
          llm(`[ollama] role=${resolved.requestedRole} model=${model} JSON parse failed: ${parsed.reason}`);
          return {
            ok: false,
            reason: parsed.reason,
            content,
            json: null,
            role: resolved.role,
            requestedRole: resolved.requestedRole,
            model,
            error: parsed.error
          };
        }
        return {
          ok: true,
          content,
          json: parsed.json,
          role: resolved.role,
          requestedRole: resolved.requestedRole,
          model
        };
      }
      return {
        ok: true,
        content,
        json: null,
        role: resolved.role,
        requestedRole: resolved.requestedRole,
        model
      };
    } catch (error) {
      lastError = error;
      llm(`[ollama] role=${resolved.requestedRole} model=${model} response failed: ${error.message}`);
    }
  }

  return {
    ok: false,
    reason: lastError?.message || 'Ollama call failed',
    content: '',
    json: null,
    role: resolved.role,
    requestedRole: resolved.requestedRole,
    model: modelsToTry.at(-1) || FALLBACK_MODEL,
    error: lastError
  };
  });
}

function normalizePlan(plan) {
  if (!plan || typeof plan !== 'object') return fallbackPlan;
  return {
    intent: typeof plan.intent === 'string' ? plan.intent : 'none',
    speak: typeof plan.speak === 'string' ? plan.speak.slice(0, 220) : '',
    priority: typeof plan.priority === 'string' ? plan.priority : 'normal',
    actions: Array.isArray(plan.actions) ? plan.actions.slice(0, 5).filter((action) => action && typeof action.action === 'string') : []
  };
}

export function createOllama(config) {
  async function chat(messages, { schema = null, json = false, numPredict = 160, temperature = 0, timeoutMs = undefined, model = null, role = 'default' } = {}) {
    const result = await callOllama({
      config,
      role,
      messages,
      schema,
      json,
      options: { numPredict, temperature, ...(timeoutMs ? { timeoutMs } : {}), model }
    });
    if (!result.ok) throw result.error || new Error(result.reason || 'Ollama call failed');
    return result.content;
  }

  async function chatText(messages, options = {}) {
    try {
      return (await chat(messages, { numPredict: 96, role: options.role || 'dialogue', ...options })).slice(0, 220);
    } catch (error) {
      llm(`[ollama] chat failed: ${error.message}`);
      return "I'm having trouble thinking locally right now.";
    }
  }

  async function plan(messages) {
    try {
      const result = await callOllama({
        config,
        role: 'planner',
        messages,
        schema: ACTION_SCHEMA,
        json: true,
        options: { numPredict: 220 }
      });
      if (!result.ok) throw result.error || new Error(result.reason);
      return normalizePlan(result.json);
    } catch (error) {
      llm(`[ollama] bad action output: ${String(error.message).slice(0, 500)}`);
      return fallbackPlan;
    }
  }

  async function planGoals(messages, schema) {
    try {
      const result = await callOllama({
        config,
        role: 'planner',
        messages,
        schema,
        json: true,
        options: { numPredict: 700 }
      });
      if (!result.ok) throw result.error || new Error(result.reason);
      return result.json;
    } catch (error) {
      llm(`[ollama] bad goal planner output: ${String(error.message).slice(0, 500)}`);
      return { intent: 'none', speak: 'I could not make a safe plan from that.', goals: [] };
    }
  }

  return { chatText, plan, planGoals };
}
